import React, { createContext, useContext, useMemo } from 'react';
import type { Screen, DrawElement } from '../types/screenDesign';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useYjsStore } from '../store/yjsStore';

export interface ScreenCanvasStoreValue {
    screens: Screen[];
    updateScreen: (id: string, updates: Partial<Screen>) => void;
    /** drawElements만 업데이트 */
    updateDrawElements: (id: string, elements: DrawElement[]) => void;
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

    // 개별 값/액션별로 선택적으로 구독하거나 getState()를 사용하여 전체 리렌더 방지
    const updateScreen = (id: string, updates: Partial<Screen>) => useYjsStore.getState().updateScreen(id, updates);
    const updateDrawElements = (id: string, elements: DrawElement[]) => useYjsStore.getState().updateScreen(id, { drawElements: elements });
    const deleteScreen = (id: string) => useYjsStore.getState().deleteScreen(id);
    const canvasClipboard = useScreenDesignStore(state => state.canvasClipboard);
    const setCanvasClipboard = useScreenDesignStore(state => state.setCanvasClipboard);
    const gridClipboard = useScreenDesignStore(state => state.gridClipboard);
    const setGridClipboard = useScreenDesignStore(state => state.setGridClipboard);
    const lastInteractedScreenId = useScreenDesignStore(state => state.lastInteractedScreenId);
    const setLastInteractedScreenId = useScreenDesignStore(state => state.setLastInteractedScreenId);

    return useMemo(() => {
        if (ctx) return ctx;

        return {
            updateScreen,
            updateDrawElements,
            deleteScreen,
            canvasClipboard,
            setCanvasClipboard,
            gridClipboard,
            setGridClipboard,
            lastInteractedScreenId,
            setLastInteractedScreenId,
            screens: useScreenDesignStore.getState().screens,
            getScreenById: (id: string) => useScreenDesignStore.getState().screens.find((s) => s.id === id),
            getPasteTargetScreenId: () => {
                const state = useScreenDesignStore.getState();
                return state.lastInteractedScreenId ?? (state.screens.length === 1 ? state.screens[0].id : null);
            },
        };
    }, [ctx, updateScreen, updateDrawElements, deleteScreen, canvasClipboard, setCanvasClipboard, gridClipboard, setGridClipboard, lastInteractedScreenId, setLastInteractedScreenId]);
};
