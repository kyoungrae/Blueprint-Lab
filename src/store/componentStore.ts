import { create } from 'zustand';
import type { Screen, ScreenFlow, DrawElement } from '../types/screenDesign';

export interface ComponentState {
    components: Screen[];
    flows: ScreenFlow[];
}

interface ComponentStore {
    components: Screen[];
    flows: ScreenFlow[];

    addComponent: (component: Screen) => void;
    updateComponent: (id: string, updates: Partial<Screen>) => void;
    deleteComponent: (id: string) => void;

    addFlow: (flow: ScreenFlow) => void;
    updateFlow: (id: string, updates: Partial<ScreenFlow>) => void;
    deleteFlow: (id: string) => void;

    exportData: () => ComponentState;
    importData: (data: { components?: Screen[]; flows?: ScreenFlow[] }) => void;

    canvasClipboard: DrawElement[];
    setCanvasClipboard: (elements: DrawElement[]) => void;

    lastInteractedScreenId: string | null;
    setLastInteractedScreenId: (id: string | null) => void;
}

export const useComponentStore = create<ComponentStore>((set, get) => ({
    components: [],
    flows: [],

    addComponent: (component) => {
        set((state) => ({
            components: [...state.components, component],
        }));
    },

    updateComponent: (id, updates) => {
        set((state) => ({
            components: state.components.map((s) =>
                s.id === id ? { ...s, ...updates } : s
            ),
        }));
    },

    deleteComponent: (id) => {
        set((state) => ({
            components: state.components.filter((s) => s.id !== id),
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
        const { components, flows } = get();
        return { components, flows };
    },

    importData: (data) => {
        set({
            components: data.components || [],
            flows: data.flows || [],
        });
    },

    canvasClipboard: [],
    setCanvasClipboard: (elements) => set({ canvasClipboard: elements }),

    lastInteractedScreenId: null,
    setLastInteractedScreenId: (id) => set({ lastInteractedScreenId: id }),
}));
