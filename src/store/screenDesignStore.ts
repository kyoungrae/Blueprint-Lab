import { create } from 'zustand';
import type { Screen, ScreenFlow, ScreenDesignState, DrawElement, ScreenSection } from '../types/screenDesign';

interface ScreenDesignStore {
    screens: Screen[];
    flows: ScreenFlow[];
    sections: ScreenSection[];

    addScreen: (screen: Screen) => void;
    updateScreen: (id: string, updates: Partial<Screen>) => void;
    deleteScreen: (id: string) => void;

    addFlow: (flow: ScreenFlow) => void;
    updateFlow: (id: string, updates: Partial<ScreenFlow>) => void;
    deleteFlow: (id: string) => void;

    addSection: (section: ScreenSection) => void;
    updateSection: (id: string, updates: Partial<ScreenSection>) => void;
    deleteSection: (id: string) => void;

    exportData: () => ScreenDesignState;
    importData: (data: ScreenDesignState) => void;

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
        set({
            screens: data.screens || [],
            flows: data.flows || [],
            sections: Array.isArray(data.sections) ? data.sections : [],
        });
    },

    canvasClipboard: [],
    setCanvasClipboard: (elements) => set({ canvasClipboard: elements }),

    gridClipboard: null,
    setGridClipboard: (grid) => set({ gridClipboard: grid }),

    lastInteractedScreenId: null,
    setLastInteractedScreenId: (id) => set({ lastInteractedScreenId: id }),
}));
