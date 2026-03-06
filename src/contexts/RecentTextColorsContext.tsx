import React, { createContext, useContext, useState, useCallback } from 'react';

const MAX_RECENT = 5;

function addToRecent(list: string[], color: string, max: number): string[] {
    const normalized = color.toLowerCase();
    const without = list.filter((c) => c.toLowerCase() !== normalized);
    const appended = [...without, normalized];
    return appended.slice(-max);
}

interface RecentTextColorsContextValue {
    recentTextColors: string[];
    addRecentTextColor: (color: string) => void;
}

const RecentTextColorsContext = createContext<RecentTextColorsContextValue | null>(null);

export function RecentTextColorsProvider({ children }: { children: React.ReactNode }) {
    const [recentTextColors, setRecentTextColors] = useState<string[]>([]);
    const addRecentTextColor = useCallback((color: string) => {
        setRecentTextColors((prev) => addToRecent(prev, color, MAX_RECENT));
    }, []);
    return (
        <RecentTextColorsContext.Provider value={{ recentTextColors, addRecentTextColor }}>
            {children}
        </RecentTextColorsContext.Provider>
    );
}

export function useRecentTextColors(): RecentTextColorsContextValue {
    const ctx = useContext(RecentTextColorsContext);
    if (!ctx) {
        return {
            recentTextColors: [],
            addRecentTextColor: () => {},
        };
    }
    return ctx;
}
