import { create } from 'zustand';
import type { Screen, ScreenFlow, ScreenDesignState, DrawElement } from '../types/screenDesign';

interface ScreenDesignStore {
    screens: Screen[];
    flows: ScreenFlow[];

    addScreen: (screen: Screen) => void;
    updateScreen: (id: string, updates: Partial<Screen>) => void;
    deleteScreen: (id: string) => void;

    addFlow: (flow: ScreenFlow) => void;
    updateFlow: (id: string, updates: Partial<ScreenFlow>) => void;
    deleteFlow: (id: string) => void;

    exportData: () => ScreenDesignState;
    importData: (data: ScreenDesignState) => void;

    // 전역 클립보드 (엔티티 간 복사/붙여넣기)
    canvasClipboard: DrawElement[];
    setCanvasClipboard: (elements: DrawElement[]) => void;

    // 마지막 상호작용한 화면 ID (붙여넣기 대상 판단)
    lastInteractedScreenId: string | null;
    setLastInteractedScreenId: (id: string | null) => void;
}

export const useScreenDesignStore = create<ScreenDesignStore>((set, get) => ({
    screens: [],
    flows: [],

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

    exportData: () => {
        const { screens, flows } = get();
        return { screens, flows };
    },

    importData: (data) => {
        set({
            screens: data.screens || [],
            flows: data.flows || [],
        });
    },

    canvasClipboard: [],
    setCanvasClipboard: (elements) => set({ canvasClipboard: elements }),

    lastInteractedScreenId: null,
    setLastInteractedScreenId: (id) => set({ lastInteractedScreenId: id }),
}));
