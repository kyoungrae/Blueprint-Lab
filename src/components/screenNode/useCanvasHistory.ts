import { useState, useRef, useEffect } from 'react';
import type { DrawElement, Screen } from '../../types/screenDesign';
import { consumeLastRemoteUpdateScreenIdIfMatch } from '../../store/screenUndoRemoteFlag';

type HistorySnapshot = {
    drawElements: DrawElement[];
    position: { x: number; y: number };
    subComponents?: Array<{ id: string; name: string; elementIds: string[] }>;
};

interface UseCanvasHistoryOptions {
    screen: Screen;
    screenId: string;
    selected?: boolean;
    updateScreen: (id: string, updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
    setHandlers: (
        id: string,
        handlers: {
            undo: () => void;
            redo: () => void;
            canUndo: boolean;
            canRedo: boolean;
        } | null
    ) => void;
}

const MAX_HISTORY = 100;
const HISTORY_DEDUPE_SIZE_THRESHOLD = 50;

export function useCanvasHistory({
    screen,
    screenId,
    selected,
    updateScreen,
    syncUpdate,
    setHandlers,
}: UseCanvasHistoryOptions) {
    const [history, setHistory] = useState<{
        past: HistorySnapshot[];
        future: HistorySnapshot[];
    }>({ past: [], future: [] });

    const restoringHistoryRef = useRef(false);

    // ── 초기 히스토리 스냅샷 저장 ──
    useEffect(() => {
        if (history.past.length === 0 && screen.drawElements) {
            setHistory({
                past: [
                    {
                        drawElements: screen.drawElements,
                        position: { x: screen.position.x, y: screen.position.y },
                        subComponents: screen.subComponents,
                    },
                ],
                future: [],
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 엔티티 position 변경 시 히스토리에 기록 (원격 수정 제외) ──
    useEffect(() => {
        if (restoringHistoryRef.current) return;
        if (consumeLastRemoteUpdateScreenIdIfMatch(screenId)) return;
        saveHistory(screen.drawElements || [], screen.position);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [screen.position.x, screen.position.y, screenId]);

    // ── 상단 툴바 Undo/Redo 핸들러 등록 ──
    useEffect(() => {
        if (selected) {
            setHandlers(screenId, {
                undo,
                redo,
                canUndo: history.past.length > 1,
                canRedo: history.future.length > 0,
            });
        } else {
            setHandlers(screenId, null);
        }
        return () => setHandlers(screenId, null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, history.past.length, history.future.length, setHandlers, screenId]);

    const saveHistory = (
        elements: DrawElement[],
        position = screen.position,
        subComponents?: Screen['subComponents']
    ) => {
        const snapshot: HistorySnapshot = {
            drawElements: elements,
            position: { x: position.x, y: position.y },
            subComponents: subComponents ?? screen.subComponents,
        };
        setHistory((prev) => {
            if (prev.past.length > 0 && elements.length <= HISTORY_DEDUPE_SIZE_THRESHOLD) {
                const last = prev.past[prev.past.length - 1];
                if (JSON.stringify(last) === JSON.stringify(snapshot)) return prev;
            }
            const newPast = [...prev.past, snapshot].slice(-MAX_HISTORY);
            return { past: newPast, future: [] };
        });
    };

    const undo = () => {
        if (history.past.length <= 1) return;

        setHistory((prev) => {
            const newPast = [...prev.past];
            const current = newPast.pop();
            const previous = newPast[newPast.length - 1];
            if (!current || !previous) return prev;

            restoringHistoryRef.current = true;
            const undoPayload: Partial<Screen> = {
                drawElements: previous.drawElements,
                position: previous.position,
            };
            if (previous.subComponents !== undefined) {
                undoPayload.subComponents = previous.subComponents;
            }
            updateScreen(screenId, undoPayload);
            syncUpdate(undoPayload);
            requestAnimationFrame(() => {
                restoringHistoryRef.current = false;
            });

            return {
                past: newPast,
                future: [current, ...prev.future].slice(0, MAX_HISTORY),
            };
        });
    };

    const redo = () => {
        if (history.future.length === 0) return;

        setHistory((prev) => {
            const newFuture = [...prev.future];
            const next = newFuture.shift();
            if (!next) return prev;

            restoringHistoryRef.current = true;
            const redoPayload: Partial<Screen> = {
                drawElements: next.drawElements,
                position: next.position,
            };
            if (next.subComponents !== undefined) {
                redoPayload.subComponents = next.subComponents;
            }
            updateScreen(screenId, redoPayload);
            syncUpdate(redoPayload);
            requestAnimationFrame(() => {
                restoringHistoryRef.current = false;
            });

            return {
                past: [...prev.past, next].slice(-MAX_HISTORY),
                future: newFuture,
            };
        });
    };

    return {
        history,
        restoringHistoryRef,
        saveHistory,
        undo,
        redo,
        canUndo: history.past.length > 1,
        canRedo: history.future.length > 0,
    };
}
