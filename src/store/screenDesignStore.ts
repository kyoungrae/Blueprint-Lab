import { create } from 'zustand';
import type { Screen, ScreenFlow, ScreenDesignState, DrawElement, ScreenSection } from '../types/screenDesign';

interface ScreenDesignStore {
    screens: Screen[];
    flows: ScreenFlow[];
    sections: ScreenSection[];

    addScreen: (screen: Screen) => void;
    updateScreen: (id: string, updates: Partial<Screen>) => void;
    /** drawElements만 업데이트 (다른 screen 메타데이터 변경 없이) */
    updateDrawElements: (id: string, elements: DrawElement[]) => void;
    deleteScreen: (id: string) => void;

    addFlow: (flow: ScreenFlow) => void;
    updateFlow: (id: string, updates: Partial<ScreenFlow>) => void;
    deleteFlow: (id: string) => void;

    addSection: (section: ScreenSection) => void;
    updateSection: (id: string, updates: Partial<ScreenSection>) => void;
    deleteSection: (id: string) => void;

    exportData: () => ScreenDesignState;
    importData: (data: ScreenDesignState) => void;
    /** 다른 프로젝트에서 내보낸 데이터를 현재 프로젝트에 붙여넣기 (ID 충돌 방지용 재매핑). 반환: 병합된 전체 상태(저장용) */
    mergeImportData: (data: ScreenDesignState) => ScreenDesignState;

    // 전역 클립보드 (엔티티 간 복사/붙여넣기)
    canvasClipboard: DrawElement[];
    setCanvasClipboard: (elements: DrawElement[]) => void;

    // 격자 복사/붙여넣기 (다른 엔티티·컴포넌트에 동일 격자 적용용)
    gridClipboard: { vertical: number[]; horizontal: number[] } | null;
    setGridClipboard: (grid: { vertical: number[]; horizontal: number[] } | null) => void;

    // 마지막 상호작용한 화면 ID (붙여넣기 대상 판단)
    lastInteractedScreenId: string | null;
    setLastInteractedScreenId: (id: string | null) => void;
}

export const useScreenDesignStore = create<ScreenDesignStore>((set, get) => ({
    screens: [],
    flows: [],
    sections: [],

    addScreen: (screen) => {
        set((state) => ({
            screens: [...state.screens, screen],
        }));
    },

    updateScreen: (id, updates) => {
        set((state) => ({
            screens: state.screens.map((s) =>
                s.id === id ? { ...s, ...updates } : s
            ),
        }));
    },

    updateDrawElements: (id, elements) => {
        set((state) => ({
            screens: state.screens.map((s) =>
                s.id === id ? { ...s, drawElements: elements } : s
            ),
        }));
    },

    deleteScreen: (id) => {
        set((state) => ({
            screens: state.screens.filter((s) => s.id !== id),
            flows: state.flows.filter((f) => f.source !== id && f.target !== id),
        }));
    },

    addFlow: (flow) => {
        set((state) => ({
            flows: [...state.flows, flow],
        }));
    },

    updateFlow: (id, updates) => {
        set((state) => ({
            flows: state.flows.map((f) =>
                f.id === id ? { ...f, ...updates } : f
            ),
        }));
    },

    deleteFlow: (id) => {
        set((state) => ({
            flows: state.flows.filter((f) => f.id !== id),
        }));
    },

    addSection: (section) => {
        set((state) => {
            if (state.sections.some((s) => s.id === section.id)) return state;
            return { sections: [...state.sections, section] };
        });
    },

    updateSection: (id, updates) => {
        set((state) => ({
            sections: state.sections.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        }));
    },

    deleteSection: (id) => {
        set((state) => {
            const sections = state.sections.filter((s) => s.id !== id);
            const screens = state.screens.map((s) =>
                s.sectionId === id ? { ...s, sectionId: undefined as string | undefined } : s
            );
            return { sections, screens };
        });
    },

    exportData: () => {
        const { screens, flows, sections } = get();
        return { screens, flows, sections };
    },

    importData: (data) => {
        const state = get();
        // flows 미전달 시 기존 유지 → state_sync 등에서 flows가 사라지는 버그 방지
        const nextFlows = Array.isArray(data.flows) && data.flows.length > 0 ? data.flows : state.flows;
        // sections 미전달 시 기존 유지 → 정렬/state_sync 등에서 섹션이 사라지는 버그 방지
        const nextSections = Array.isArray(data.sections) ? data.sections : state.sections;
        set({
            screens: data.screens || [],
            flows: nextFlows,
            sections: nextSections,
        });
    },

    mergeImportData: (data): ScreenDesignState => {
        const { screens: existingScreens, flows: existingFlows, sections: existingSections } = get();
        const newScreens = data.screens || [];
        const newFlows = data.flows || [];
        const newSections = Array.isArray(data.sections) ? data.sections : [];
        const existingScreenIds = new Set(existingScreens.map((s) => s.id));
        const existingSectionIds = new Set(existingSections.map((s) => s.id));
        const screenIdMap = new Map<string, string>();
        const sectionIdMap = new Map<string, string>();
        const ts = () => `_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const mergedScreens: Screen[] = [...existingScreens];
        const mergedSections: ScreenSection[] = [...existingSections];
        for (const sec of newSections) {
            const newId = existingSectionIds.has(sec.id) ? `section${ts()}` : sec.id;
            if (newId !== sec.id) sectionIdMap.set(sec.id, newId);
            existingSectionIds.add(newId);
            mergedSections.push({ ...sec, id: newId });
        }
        for (const sc of newScreens) {
            const newId = existingScreenIds.has(sc.id) ? `screen${ts()}` : sc.id;
            if (newId !== sc.id) screenIdMap.set(sc.id, newId);
            existingScreenIds.add(newId);
            const sectionId = sc.sectionId && sectionIdMap.has(sc.sectionId)
                ? sectionIdMap.get(sc.sectionId)!
                : sc.sectionId;
            mergedScreens.push({ ...sc, id: newId, sectionId });
        }
        const mergedFlows: ScreenFlow[] = [...existingFlows];
        const mergedScreenIds = new Set(mergedScreens.map((s) => s.id));
        for (const f of newFlows) {
            const src = screenIdMap.get(f.source) ?? f.source;
            const tgt = screenIdMap.get(f.target) ?? f.target;
            if (!mergedScreenIds.has(src) || !mergedScreenIds.has(tgt)) continue;
            mergedFlows.push({ ...f, id: `flow${ts()}`, source: src, target: tgt });
        }
        const next: ScreenDesignState = { screens: mergedScreens, flows: mergedFlows, sections: mergedSections };
        set(next);
        return next;
    },

    canvasClipboard: [],
    setCanvasClipboard: (elements) => set({ canvasClipboard: elements }),

    gridClipboard: null,
    setGridClipboard: (grid) => set({ gridClipboard: grid }),

    lastInteractedScreenId: null,
    setLastInteractedScreenId: (id) => set({ lastInteractedScreenId: id }),
}));
