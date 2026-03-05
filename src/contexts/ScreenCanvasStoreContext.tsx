import React, { createContext, useContext, useMemo } from 'react';
import type { Screen, DrawElement } from '../types/screenDesign';
import { useScreenDesignStore } from '../store/screenDesignStore';

export interface ScreenCanvasStoreValue {
    screens: Screen[];
    updateScreen: (id: string, updates: Partial<Screen>) => void;
    deleteScreen: (id: string) => void;
    canvasClipboard: DrawElement[];
    setCanvasClipboard: (elements: DrawElement[]) => void;
    gridClipboard: { vertical: number[]; horizontal: number[] } | null;
    setGridClipboard: (grid: { vertical: number[]; horizontal: number[] } | null) => void;
    lastInteractedScreenId: string | null;
    setLastInteractedScreenId: (id: string | null) => void;
    /** Get current screen by id (for use in callbacks - reads latest from store) */
    getScreenById: (id: string) => Screen | undefined;
    /** 붙여넣기 대상 화면 ID (lastInteractedScreenId 또는 화면 1개일 때 해당 화면) */
    getPasteTargetScreenId: () => string | null;
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
        const state = useScreenDesignStore.getState();
        return {
            ...screenDesign,
            getScreenById: (id: string) => state.screens.find((s) => s.id === id),
            getPasteTargetScreenId: () =>
                state.lastInteractedScreenId ?? (state.screens.length === 1 ? state.screens[0].id : null),
        };
    }, [ctx, screenDesign]);
};
