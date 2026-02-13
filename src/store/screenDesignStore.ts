import { create } from 'zustand';
import type { Screen, ScreenFlow, ScreenDesignState } from '../types/screenDesign';

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
            // Also remove any flows connected to this screen
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
}));
