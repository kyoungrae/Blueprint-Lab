import React, { createContext, useContext, useState, useCallback } from 'react';

export interface UndoRedoHandlers {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

const defaultHandlers: UndoRedoHandlers = {
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
};

interface ScreenDesignUndoRedoContextValue {
    handlers: UndoRedoHandlers;
    setHandlers: (screenId: string | null, handlers: UndoRedoHandlers | null) => void;
}

const ScreenDesignUndoRedoContext = createContext<ScreenDesignUndoRedoContextValue | null>(null);

export const ScreenDesignUndoRedoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<{ handlers: UndoRedoHandlers; activeId: string | null }>({
        handlers: defaultHandlers,
        activeId: null,
    });
    const setHandlers = useCallback((screenId: string | null, h: UndoRedoHandlers | null) => {
        if (h) {
            setState({ handlers: h, activeId: screenId });
        } else if (screenId) {
            setState((prev) =>
                prev.activeId === screenId ? { handlers: defaultHandlers, activeId: null } : prev
            );
        }
    }, []);
    return (
        <ScreenDesignUndoRedoContext.Provider value={{ handlers: state.handlers, setHandlers }}>
            {children}
        </ScreenDesignUndoRedoContext.Provider>
    );
};

export const useScreenDesignUndoRedo = () => {
    const ctx = useContext(ScreenDesignUndoRedoContext);
    return ctx ?? { handlers: defaultHandlers, setHandlers: () => {} };
};
