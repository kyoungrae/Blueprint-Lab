import React, { createContext, useContext, useMemo } from 'react';
import type { Screen, DrawElement } from '../types/screenDesign';
import { useScreenDesignStore } from '../store/screenDesignStore';

export interface ScreenCanvasStoreValue {
    screens: Screen[];
    updateScreen: (id: string, updates: Partial<Screen>) => void;
    deleteScreen: (id: string) => void;
    canvasClipboard: DrawElement[];
    setCanvasClipboard: (elements: DrawElement[]) => void;
    lastInteractedScreenId: string | null;
    setLastInteractedScreenId: (id: string | null) => void;
    /** Get current screen by id (for use in callbacks - reads latest from store) */
    getScreenById: (id: string) => Screen | undefined;
}

const ScreenCanvasStoreContext = createContext<ScreenCanvasStoreValue | null>(null);

export const ScreenCanvasStoreProvider: React.FC<{
    value: ScreenCanvasStoreValue;
    children: React.ReactNode;
}> = ({ value, children }) => (
    <ScreenCanvasStoreContext.Provider value={value}>
        {children}
    </ScreenCanvasStoreContext.Provider>
);

export const useScreenCanvasStore = () => useContext(ScreenCanvasStoreContext);

/** Use store from context if provided (ComponentCanvas), else fallback to screenDesignStore (ScreenDesignCanvas) */
export const useScreenNodeStore = (): ScreenCanvasStoreValue => {
    const ctx = useScreenCanvasStore();
    const screenDesign = useScreenDesignStore();
    return useMemo(() => {
        if (ctx) return ctx;
        return {
            ...screenDesign,
            getScreenById: (id: string) => useScreenDesignStore.getState().screens.find((s) => s.id === id),
        };
    }, [ctx, screenDesign]);
};
