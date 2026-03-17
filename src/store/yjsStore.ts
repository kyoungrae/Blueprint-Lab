/**
 * yjsStore.ts
 *
 * Yjs CRDT 기반 실시간 협업 스토어.
 * SCREEN_DESIGN / COMPONENT 프로젝트의 캔버스 데이터(screens, flows, sections)를
 * 이 스토어를 통해 관리합니다.
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { create } from 'zustand';
import type { Screen, ScreenFlow, ScreenSection } from '../types/screenDesign';
import { useScreenDesignStore } from './screenDesignStore';
import { useComponentStore } from './componentStore';

// ✅ 수정: 현재 브라우저 주소창에 찍힌 정보를 그대로 따라가도록 변경
const host = window.location.hostname; // '210.92.92.18' 또는 '192.168.0.141'
const port = window.location.port;     // '2000' 또는 '8080'
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

/**
 * � 웹소켓 URL 결정 로직
 * 현재 에러 메시지가 ':2000/yjs/...' 인 것으로 보아, 
 * 포트 번호 뒤에 '/yjs' 경로를 붙여서 프록시 처리를 하고 계신 것 같습니다.
 */
const YJS_WS_URL = `${protocol}//${host}:${port}/yjs`; 

// 만약 내부망(8080)에서는 프록시 없이 Yjs 서버(4000)에 직접 붙어야 한다면:
// const YJS_WS_URL = port === '8080' 
//    ? `${protocol}//${host}:4000` 
//    : `${protocol}//${host}:${port}/yjs`;

console.log("🔗 Connecting to Yjs at:", YJS_WS_URL);

interface YjsStore {
    ydoc: Y.Doc | null;
    provider: WebsocketProvider | null;
    screens: Screen[];
    flows: ScreenFlow[];
    sections: ScreenSection[];
    isSynced: boolean;
    isConnected: boolean;
    currentProjectId: string | null;

    joinProject: (projectId: string) => void;
    leaveProject: () => void;
    updateScreen: (id: string, patch: Partial<Screen>) => void;
    moveScreen: (id: string, position: { x: number; y: number }) => void;
    addScreen: (screen: Screen) => void;
    deleteScreen: (id: string) => void;
    updateFlow: (id: string, patch: Partial<ScreenFlow>) => void;
    addFlow: (flow: ScreenFlow) => void;
    deleteFlow: (id: string) => void;
    updateSection: (id: string, patch: Partial<ScreenSection>) => void;
    addSection: (section: ScreenSection) => void;
    deleteSection: (id: string) => void;
    exportData: () => { screens: Screen[]; flows: ScreenFlow[]; sections: ScreenSection[] };
    importData: (data: { screens?: Screen[]; flows?: ScreenFlow[]; sections?: ScreenSection[] }) => void;
    _observeYMaps: (ydoc: Y.Doc) => () => void;
    _cleanupObservers: (() => void) | null;
}

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

    joinProject: (projectId: string) => {
        get().leaveProject();
        if (projectId.startsWith('local_')) {
            set({ currentProjectId: projectId, isSynced: true, isConnected: true });
            return;
        }

        const ydoc = new Y.Doc();
        const provider = new WebsocketProvider(YJS_WS_URL, projectId, ydoc, { connect: true });

        provider.on('status', ({ status }: { status: string }) => {
            set({ isConnected: status === 'connected' });
        });
        provider.on('sync', (synced: boolean) => {
            if (synced) set({ isSynced: true });
        });

        set({ ydoc, provider, currentProjectId: projectId, isSynced: false, isConnected: false });
        const cleanup = get()._observeYMaps(ydoc);
        set({ _cleanupObservers: cleanup });
    },

    leaveProject: () => {
        const { provider, ydoc, _cleanupObservers } = get();
        if (_cleanupObservers) _cleanupObservers();
        provider?.disconnect();
        ydoc?.destroy();
        set({
            ydoc: null, provider: null, currentProjectId: null,
            isSynced: false, isConnected: false, screens: [], flows: [], sections: [],
            _cleanupObservers: null,
        });
    },

    // 💡 핵심: Y.Map 안에 중첩 Y.Map을 사용하여 속성별 병합(Merge)이 가능하도록 처리
    _observeYMaps: (ydoc: Y.Doc) => {
        const yScreens = ydoc.getMap<Y.Map<any>>('screens');
        const yFlows = ydoc.getMap<Y.Map<any>>('flows');
        const ySections = ydoc.getMap<Y.Map<any>>('sections');

        const syncScreens = () => {
            const newScreens = Array.from(yScreens.values()).map(yMap => yMap.toJSON() as Screen);
            set({ screens: newScreens });
            useScreenDesignStore.setState({ screens: newScreens });
            useComponentStore.setState({ components: newScreens });
        };

        const syncFlows = () => {
            const newFlows = Array.from(yFlows.values()).map(yMap => yMap.toJSON() as ScreenFlow);
            set({ flows: newFlows });
            useScreenDesignStore.setState({ flows: newFlows });
            useComponentStore.setState({ flows: newFlows });
        };

        const syncSections = () => {
            const newSections = Array.from(ySections.values()).map(yMap => yMap.toJSON() as ScreenSection);
            set({ sections: newSections });
            useScreenDesignStore.setState({ sections: newSections });
        };

        yScreens.observeDeep(syncScreens);
        yFlows.observeDeep(syncFlows);
        ySections.observeDeep(syncSections);

        syncScreens(); syncFlows(); syncSections();

        return () => {
            yScreens.unobserveDeep(syncScreens);
            yFlows.unobserveDeep(syncFlows);
            ySections.unobserveDeep(syncSections);
        };
    },

    updateScreen: (id, patch) => {
        const { ydoc } = get();
        if (!ydoc) return;
        const yMap = ydoc.getMap<Y.Map<any>>('screens').get(id);
        if (yMap) {
            ydoc.transact(() => {
                Object.entries(patch).forEach(([k, v]) => yMap.set(k, v));
            });
        }
    },

    moveScreen: (id, position) => {
        get().updateScreen(id, { position });
    },

    addScreen: (screen) => {
        const { ydoc } = get();
        if (!ydoc) return;
        const yMap = new Y.Map();
        Object.entries(screen).forEach(([k, v]) => yMap.set(k, v));
        ydoc.getMap<Y.Map<any>>('screens').set(screen.id, yMap);
    },

    deleteScreen: (id) => {
        const { ydoc } = get();
        if (!ydoc) return;
        const yFlows = ydoc.getMap<Y.Map<any>>('flows');
        ydoc.transact(() => {
            ydoc.getMap<Y.Map<any>>('screens').delete(id);
            Array.from(yFlows.entries())
                .filter(([, yMap]) => yMap.get('source') === id || yMap.get('target') === id)
                .forEach(([fId]) => yFlows.delete(fId));
        });
    },

    updateFlow: (id, patch) => {
        const { ydoc } = get();
        if (!ydoc) return;
        const yMap = ydoc.getMap<Y.Map<any>>('flows').get(id);
        if (yMap) {
            ydoc.transact(() => Object.entries(patch).forEach(([k, v]) => yMap.set(k, v)));
        }
    },

    addFlow: (flow) => {
        const { ydoc } = get();
        if (!ydoc) return;
        const yMap = new Y.Map();
        Object.entries(flow).forEach(([k, v]) => yMap.set(k, v));
        ydoc.getMap<Y.Map<any>>('flows').set(flow.id, yMap);
    },

    deleteFlow: (id) => {
        get().ydoc?.getMap<Y.Map<any>>('flows').delete(id);
    },

    updateSection: (id, patch) => {
        const { ydoc } = get();
        if (!ydoc) return;
        const yMap = ydoc.getMap<Y.Map<any>>('sections').get(id);
        if (yMap) {
            ydoc.transact(() => Object.entries(patch).forEach(([k, v]) => yMap.set(k, v)));
        }
    },

    addSection: (section) => {
        const { ydoc } = get();
        if (!ydoc) return;
        const yMap = new Y.Map();
        Object.entries(section).forEach(([k, v]) => yMap.set(k, v));
        ydoc.getMap<Y.Map<any>>('sections').set(section.id, yMap);
    },

    deleteSection: (id) => {
        get().ydoc?.getMap<Y.Map<any>>('sections').delete(id);
    },

    exportData: () => {
        const { screens, flows, sections } = get();
        return { screens, flows, sections };
    },

    importData: (data) => {
        const { ydoc } = get();
        if (!ydoc) return;
        ydoc.transact(() => {
            const yScreens = ydoc.getMap<Y.Map<any>>('screens');
            const yFlows = ydoc.getMap<Y.Map<any>>('flows');
            const ySections = ydoc.getMap<Y.Map<any>>('sections');

            data.screens?.forEach(s => {
                if (!s?.id) return;
                const yMap = yScreens.get(s.id) || new Y.Map();
                Object.entries(s).forEach(([k, v]) => yMap.set(k, v));
                yScreens.set(s.id, yMap);
            });
            data.flows?.forEach(f => {
                if (!f?.id) return;
                const yMap = yFlows.get(f.id) || new Y.Map();
                Object.entries(f).forEach(([k, v]) => yMap.set(k, v));
                yFlows.set(f.id, yMap);
            });
            data.sections?.forEach(sec => {
                if (!sec?.id) return;
                const yMap = ySections.get(sec.id) || new Y.Map();
                Object.entries(sec).forEach(([k, v]) => yMap.set(k, v));
                ySections.set(sec.id, yMap);
            });
        });
    },
}));
