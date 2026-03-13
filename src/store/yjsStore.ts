/**
 * yjsStore.ts
 *
 * Yjs CRDT 기반 실시간 협업 스토어.
 * SCREEN_DESIGN / COMPONENT 프로젝트의 캔버스 데이터(screens, flows, sections)를
 * 이 스토어를 통해 관리합니다.
 *
 * ─ 패러다임 전환 ─────────────────────────────────────────────────────────────
 *  ❌ 기존: updateProjectData(id, data) → 500ms debounce → REST PATCH → 전체 doc 덮어쓰기
 *  ✅ 신규: updateScreen(id, patch) → Y.Map.set() → y-websocket → CRDT 자동 머지
 *
 * ─ 삭제된 항목 (projectStore.ts에서) ────────────────────────────────────────
 *  - sendProjectDataPatch() 함수 전체
 *  - SAVE_DEBOUNCE_MS, pendingSave, getConnectionKey, getConnectionSpecificKey
 *  - updateProjectData() 내 setTimeout 디바운스 블록
 *
 * ─ 삭제된 항목 (ComponentCanvas.tsx에서) ────────────────────────────────────
 *  - 1000ms 디바운스 auto-save useEffect (components/flows 변경 감지)
 *  - unmount 시 즉시 flush useEffect
 *  - onFlushProjectData 노드 콜백
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { create } from 'zustand';
import type { Screen, ScreenFlow, ScreenSection } from '../types/screenDesign';
import { useScreenDesignStore } from './screenDesignStore';
import { useComponentStore } from './componentStore';

// ─── 설정 ────────────────────────────────────────────────────────────────────

const YJS_WS_URL = import.meta.env.VITE_YJS_WS_URL || 'ws://localhost:4000';

// ─── 스토어 인터페이스 ────────────────────────────────────────────────────────

interface YjsStore {
    // ── Yjs 핵심 객체 ──────────────────────────────────────────────────────
    ydoc: Y.Doc | null;
    provider: WebsocketProvider | null;

    // ── Zustand 미러 배열 (Y.Map → JS 배열, React 컴포넌트 구독용) ─────────
    screens: Screen[];
    flows: ScreenFlow[];
    sections: ScreenSection[];

    // ── 연결 상태 ──────────────────────────────────────────────────────────
    isSynced: boolean;    // 서버에서 초기 동기화 완료 여부
    isConnected: boolean;
    currentProjectId: string | null;

    // ── 액션 ───────────────────────────────────────────────────────────────

    /** SCREEN_DESIGN / COMPONENT 프로젝트 입장 시 호출 */
    joinProject: (projectId: string) => void;

    /** 프로젝트에서 나갈 때 또는 컴포넌트 unmount 시 호출 */
    leaveProject: () => void;

    /** 한 화면의 일부 필드만 업데이트 (granular update) */
    updateScreen: (id: string, patch: Partial<Screen>) => void;

    /** 드래그 완료 후 position 업데이트 (updateScreen의 얇은 래퍼) */
    moveScreen: (id: string, position: { x: number; y: number }) => void;

    /** 화면 추가 */
    addScreen: (screen: Screen) => void;

    /** 화면 삭제 (연결된 flow도 자동 삭제) */
    deleteScreen: (id: string) => void;

    /** flow 업데이트 */
    updateFlow: (id: string, patch: Partial<ScreenFlow>) => void;

    /** flow 추가 */
    addFlow: (flow: ScreenFlow) => void;

    /** flow 삭제 */
    deleteFlow: (id: string) => void;

    /** 섹션 업데이트 */
    updateSection: (id: string, patch: Partial<ScreenSection>) => void;

    /** 섹션 추가 */
    addSection: (section: ScreenSection) => void;

    /** 섹션 삭제 */
    deleteSection: (id: string) => void;

    /** 현재 Y.Doc 상태를 배열 형태로 내보내기 (저장·동기화 목적) */
    exportData: () => { screens: Screen[]; flows: ScreenFlow[]; sections: ScreenSection[] };

    /** 외부 배열 데이터(state_sync 등)를 Y.Doc으로 일괄 로드 */
    importData: (data: { screens?: Screen[]; flows?: ScreenFlow[]; sections?: ScreenSection[] }) => void;

    // ── 내부 ───────────────────────────────────────────────────────────────
    _observeYMaps: (ydoc: Y.Doc) => () => void;
    _cleanupObservers: (() => void) | null;
}

// ─── 스토어 생성 ──────────────────────────────────────────────────────────────

export const useYjsStore = create<YjsStore>((set, get) => ({
    ydoc: null,
    provider: null,
    screens: [],
    flows: [],
    sections: [],
    isSynced: false,
    isConnected: false,
    currentProjectId: null,
    _cleanupObservers: null,

    // ────────────────────────────────────────────────────────────────────────
    joinProject: (projectId: string) => {
        // 기존 연결 정리
        get().leaveProject();

        // 로컬 프로젝트는 WebSocket 불필요 - isSynced만 true로
        if (projectId.startsWith('local_')) {
            set({ currentProjectId: projectId, isSynced: true, isConnected: true });
            return;
        }

        const ydoc = new Y.Doc();
        const provider = new WebsocketProvider(YJS_WS_URL, projectId, ydoc, {
            connect: true,
        });

        provider.on('status', ({ status }: { status: string }) => {
            set({ isConnected: status === 'connected' });
        });

        provider.on('sync', (synced: boolean) => {
            if (synced) set({ isSynced: true });
        });

        set({ ydoc, provider, currentProjectId: projectId, isSynced: false, isConnected: false });

        // Y.Map → Zustand 미러링 옵저버 등록
        const cleanup = get()._observeYMaps(ydoc);
        set({ _cleanupObservers: cleanup });
    },

    // ────────────────────────────────────────────────────────────────────────
    leaveProject: () => {
        const { provider, ydoc, _cleanupObservers } = get();
        if (_cleanupObservers) _cleanupObservers();
        provider?.disconnect();
        ydoc?.destroy();
        set({
            ydoc: null,
            provider: null,
            currentProjectId: null,
            isSynced: false,
            isConnected: false,
            screens: [],
            flows: [],
            sections: [],
            _cleanupObservers: null,
        });
    },

    // ────────────────────────────────────────────────────────────────────────
    // Observer: Y.Map 변경 → Zustand 상태 업데이트 (React 렌더링 트리거)
    // ※ 이 함수가 반환하는 cleanup을 반드시 leaveProject 시 호출해야 합니다.
    _observeYMaps: (ydoc: Y.Doc) => {
        const yScreens  = ydoc.getMap<Screen>('screens');
        const yFlows    = ydoc.getMap<ScreenFlow>('flows');
        const ySections = ydoc.getMap<ScreenSection>('sections');

        const syncScreens = () => {
            const newScreens = Array.from(yScreens.values());
            set({ screens: newScreens });
            // 핵심: Yjs에 데이터가 들어오면 기존 스토어들에도 자동으로 밀어넣어 UI를 리렌더링
            useScreenDesignStore.setState({ screens: newScreens });
            useComponentStore.setState({ components: newScreens });
        };

        const syncFlows = () => {
            const newFlows = Array.from(yFlows.values());
            set({ flows: newFlows });
            useScreenDesignStore.setState({ flows: newFlows });
            useComponentStore.setState({ flows: newFlows });
        };

        const syncSections = () => {
            const newSections = Array.from(ySections.values());
            set({ sections: newSections });
            useScreenDesignStore.setState({ sections: newSections });
        };

        yScreens.observe(syncScreens);
        yFlows.observe(syncFlows);
        ySections.observe(syncSections);

        // 초기 상태 즉시 반영
        syncScreens();
        syncFlows();
        syncSections();

        return () => {
            yScreens.unobserve(syncScreens);
            yFlows.unobserve(syncFlows);
            ySections.unobserve(syncSections);
        };
    },

    // ────────────────────────────────────────────────────────────────────────
    // 쓰기: Zustand → Y.Map (Yjs가 WebSocket으로 자동 전파)

    updateScreen: (id, patch) => {
        const { ydoc } = get();
        if (!ydoc) return;
        const yScreens = ydoc.getMap<Screen>('screens');
        const existing = yScreens.get(id);
        if (existing) {
            yScreens.set(id, { ...existing, ...patch });
        }
    },

    moveScreen: (id, position) => {
        get().updateScreen(id, { position });
    },

    addScreen: (screen) => {
        const { ydoc } = get();
        if (!ydoc) return;
        ydoc.getMap<Screen>('screens').set(screen.id, screen);
    },

    deleteScreen: (id) => {
        const { ydoc } = get();
        if (!ydoc) return;
        const yScreens = ydoc.getMap<Screen>('screens');
        const yFlows   = ydoc.getMap<ScreenFlow>('flows');
        yScreens.delete(id);
        // 참조 무결성: 연결된 flow 자동 삭제
        Array.from(yFlows.entries())
            .filter(([, f]) => f.source === id || f.target === id)
            .forEach(([fId]) => yFlows.delete(fId));
    },

    updateFlow: (id, patch) => {
        const { ydoc } = get();
        if (!ydoc) return;
        const yFlows = ydoc.getMap<ScreenFlow>('flows');
        const existing = yFlows.get(id);
        if (existing) {
            yFlows.set(id, { ...existing, ...patch });
        }
    },

    addFlow: (flow) => {
        const { ydoc } = get();
        if (!ydoc) return;
        ydoc.getMap<ScreenFlow>('flows').set(flow.id, flow);
    },

    deleteFlow: (id) => {
        const { ydoc } = get();
        if (!ydoc) return;
        ydoc.getMap<ScreenFlow>('flows').delete(id);
    },

    updateSection: (id, patch) => {
        const { ydoc } = get();
        if (!ydoc) return;
        const ySections = ydoc.getMap<ScreenSection>('sections');
        const existing = ySections.get(id);
        if (existing) {
            ySections.set(id, { ...existing, ...patch });
        }
    },

    addSection: (section) => {
        const { ydoc } = get();
        if (!ydoc) return;
        ydoc.getMap<ScreenSection>('sections').set(section.id, section);
    },

    deleteSection: (id) => {
        const { ydoc } = get();
        if (!ydoc) return;
        ydoc.getMap<ScreenSection>('sections').delete(id);
    },

    exportData: () => {
        const { screens, flows, sections } = get();
        return { screens, flows, sections };
    },

    /**
     * 외부 데이터(e.g. state_sync, DB 로드)를 Y.Doc에 일괄 삽입.
     * 기존 데이터보다 더 많은 항목이 있을 때만 덮어씁니다 (stale sync 방어).
     */
    importData: (data) => {
        const { ydoc } = get();
        if (!ydoc) return;

        ydoc.transact(() => {
            const yScreens  = ydoc.getMap<Screen>('screens');
            const yFlows    = ydoc.getMap<ScreenFlow>('flows');
            const ySections = ydoc.getMap<ScreenSection>('sections');

            if (Array.isArray(data.screens)) {
                data.screens.forEach(s => { if (s?.id) yScreens.set(s.id, s); });
            }
            if (Array.isArray(data.flows)) {
                data.flows.forEach(f => { if (f?.id) yFlows.set(f.id, f); });
            }
            if (Array.isArray(data.sections)) {
                data.sections.forEach(sec => { if (sec?.id) ySections.set(sec.id, sec); });
            }
        });
    },
}));
