import React, { createContext, useContext, useState, useCallback } from 'react';

const MAX_RECENT = 5;

function addToRecent(list: string[], color: string, max: number): string[] {
    const normalized = color.toLowerCase();
    const without = list.filter((c) => c.toLowerCase() !== normalized);
    const appended = [...without, normalized];
    return appended.slice(-max);
}

interface RecentStyleColorsContextValue {
    recentFillColors: string[];
    recentStrokeColors: string[];
    addRecentFillColor: (color: string) => void;
    addRecentStrokeColor: (color: string) => void;
}

const RecentStyleColorsContext = createContext<RecentStyleColorsContextValue | null>(null);

export function RecentStyleColorsProvider({ children }: { children: React.ReactNode }) {
    const [recentFillColors, setRecentFillColors] = useState<string[]>([]);
    const [recentStrokeColors, setRecentStrokeColors] = useState<string[]>([]);
    const addRecentFillColor = useCallback((color: string) => {
        setRecentFillColors((prev) => addToRecent(prev, color, MAX_RECENT));
    }, []);
    const addRecentStrokeColor = useCallback((color: string) => {
        setRecentStrokeColors((prev) => addToRecent(prev, color, MAX_RECENT));
    }, []);
    return (
        <RecentStyleColorsContext.Provider
            value={{
                recentFillColors,
                recentStrokeColors,
                addRecentFillColor,
                addRecentStrokeColor,
            }}
        >
            {children}
        </RecentStyleColorsContext.Provider>
    );
}

export function useRecentStyleColors(): RecentStyleColorsContextValue {
    const ctx = useContext(RecentStyleColorsContext);
    if (!ctx) {
        return {
            recentFillColors: [],
            recentStrokeColors: [],
            addRecentFillColor: () => {},
            addRecentStrokeColor: () => {},
        };
    }
    return ctx;
}
