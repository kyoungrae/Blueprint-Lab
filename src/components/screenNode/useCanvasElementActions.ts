import { useCallback } from 'react';
import type { DrawElement, Screen } from '../../types/screenDesign';

interface UseCanvasElementActionsOptions {
    screen: Screen;
    drawElements: DrawElement[];
    selectedElementIds: string[];
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
    saveHistory: (
        elements: DrawElement[],
        position?: { x: number; y: number },
        subComponents?: Screen['subComponents']
    ) => void;
    setSelectedElementIds: React.Dispatch<React.SetStateAction<string[]>>;
    sendOperation: (op: {
        type: string;
        targetId: string;
        userId: string;
        userName: string;
        payload: Record<string, unknown>;
        previousState?: Record<string, unknown>;
    }) => void;
    user?: { id?: string; name?: string } | null;
    // refs for debounced font size updates
    pendingFontSizeRef: React.MutableRefObject<{ elementId: string; px: number } | null>;
    pendingFontSizeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    pendingSyncDrawElementsRef: React.MutableRefObject<DrawElement[] | null>;
    pendingSyncTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    flushPendingFontSize: () => void;
    PENDING_FONT_SIZE_DEBOUNCE_MS: number;
}

export function useCanvasElementActions({
    screen,
    drawElements,
    selectedElementIds,
    update,
    syncUpdate,
    saveHistory,
    setSelectedElementIds,
    sendOperation,
    user,
    pendingFontSizeRef,
    pendingFontSizeTimerRef,
    pendingSyncDrawElementsRef,
    pendingSyncTimerRef,
    flushPendingFontSize,
    PENDING_FONT_SIZE_DEBOUNCE_MS,
}: UseCanvasElementActionsOptions) {

    // ── updateElement ────────────────────────────────────────────────────────
    const updateElement = useCallback(
        (id: string, updates: Partial<DrawElement>) => {
            const isFontSizeOnly =
                Object.keys(updates).length === 1 &&
                'fontSize' in updates &&
                updates.fontSize != null;

            if (isFontSizeOnly) {
                pendingFontSizeRef.current = { elementId: id, px: updates.fontSize! };
                if (pendingFontSizeTimerRef.current)
                    clearTimeout(pendingFontSizeTimerRef.current);
                pendingFontSizeTimerRef.current = setTimeout(() => {
                    pendingFontSizeTimerRef.current = null;
                    flushPendingFontSize();
                }, PENDING_FONT_SIZE_DEBOUNCE_MS);
                return;
            }

            let elements = drawElements;
            if (pendingFontSizeRef.current) {
                const { elementId, px } = pendingFontSizeRef.current;
                pendingFontSizeRef.current = null;
                if (pendingFontSizeTimerRef.current) {
                    clearTimeout(pendingFontSizeTimerRef.current);
                    pendingFontSizeTimerRef.current = null;
                }
                elements = elements.map((el) =>
                    el.id === elementId ? { ...el, fontSize: px } : el
                );
            }

            const nextElements = elements.map((el) =>
                el.id === id ? { ...el, ...updates } : el
            );
            update({ drawElements: nextElements });
            saveHistory(nextElements);

            // Debounced sync
            pendingSyncDrawElementsRef.current = nextElements;
            if (pendingSyncTimerRef.current) clearTimeout(pendingSyncTimerRef.current);
            pendingSyncTimerRef.current = setTimeout(() => {
                pendingSyncTimerRef.current = null;
                const toSend = pendingSyncDrawElementsRef.current;
                if (toSend) {
                    pendingSyncDrawElementsRef.current = null;
                    syncUpdate({ drawElements: toSend });
                }
            }, 100);
        },
        // Note: drawElements changes frequently, so this hook's updateElement
        // captures the latest via closure inside the callbacks.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [drawElements, update, syncUpdate, saveHistory, flushPendingFontSize, PENDING_FONT_SIZE_DEBOUNCE_MS]
    );

    // ── deleteElements ───────────────────────────────────────────────────────
    const deleteElements = useCallback(
        (ids: string[]) => {
            const idsSet = new Set(ids);
            const nextElements = drawElements.filter((el) => !idsSet.has(el.id));

            // subComponents에서 삭제된 element 참조 제거
            const nextSubComponents = (screen.subComponents ?? [])
                .map((sub) => ({
                    ...sub,
                    elementIds: sub.elementIds.filter((eid) => !idsSet.has(eid)),
                }))
                .filter((sub) => sub.elementIds.length > 0);

            sendOperation({
                type: 'SCREEN_DRAW_DELETE',
                targetId: screen.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: { drawElements: nextElements, subComponents: nextSubComponents },
                previousState: { drawElements },
            });

            update({ drawElements: nextElements, subComponents: nextSubComponents });
            saveHistory(nextElements, screen.position, nextSubComponents);
            setSelectedElementIds([]);
        },
        [drawElements, screen, update, saveHistory, setSelectedElementIds, sendOperation, user]
    );

    // ── handleLayerAction ────────────────────────────────────────────────────
    const handleLayerAction = useCallback(
        (action: 'front' | 'back' | 'forward' | 'backward') => {
            if (selectedElementIds.length === 0) return;

            let nextElements = [...drawElements].sort(
                (a, b) => (a.zIndex || 0) - (b.zIndex || 0)
            );

            selectedElementIds.forEach((id) => {
                const index = nextElements.findIndex((el) => el.id === id);
                if (index === -1) return;
                const el = nextElements[index];

                if (action === 'front') {
                    nextElements.splice(index, 1);
                    nextElements.push(el);
                } else if (action === 'back') {
                    nextElements.splice(index, 1);
                    nextElements.unshift(el);
                } else if (action === 'forward') {
                    if (index < nextElements.length - 1) {
                        [nextElements[index], nextElements[index + 1]] = [
                            nextElements[index + 1],
                            nextElements[index],
                        ];
                    }
                } else if (action === 'backward') {
                    if (index > 0) {
                        [nextElements[index], nextElements[index - 1]] = [
                            nextElements[index - 1],
                            nextElements[index],
                        ];
                    }
                }
            });

            const updatedElements = nextElements.map((el, i) => ({
                ...el,
                zIndex: i + 1,
            }));
            update({ drawElements: updatedElements });
            syncUpdate({ drawElements: updatedElements });
            saveHistory(updatedElements);
        },
        [drawElements, selectedElementIds, update, syncUpdate, saveHistory]
    );

    // ── handleObjectAlign ────────────────────────────────────────────────────
    const handleObjectAlign = useCallback(
        (
            action:
                | 'align-left'
                | 'align-center-h'
                | 'align-right'
                | 'align-top'
                | 'align-center-v'
                | 'align-bottom'
                | 'distribute-h'
                | 'distribute-v'
        ) => {
            if (selectedElementIds.length < 2) return;

            const selectedElements = drawElements.filter((el) =>
                selectedElementIds.includes(el.id)
            );
            if (selectedElements.length < 2) return;

            let nextElements = [...drawElements];

            if (action === 'align-left') {
                const minX = Math.min(...selectedElements.map((el) => el.x));
                nextElements = nextElements.map((el) =>
                    selectedElementIds.includes(el.id) ? { ...el, x: minX } : el
                );
            } else if (action === 'align-center-h') {
                const minX = Math.min(...selectedElements.map((el) => el.x));
                const maxRight = Math.max(
                    ...selectedElements.map((el) => el.x + el.width)
                );
                const centerX = (minX + maxRight) / 2;
                nextElements = nextElements.map((el) =>
                    selectedElementIds.includes(el.id)
                        ? { ...el, x: centerX - el.width / 2 }
                        : el
                );
            } else if (action === 'align-right') {
                const maxRight = Math.max(
                    ...selectedElements.map((el) => el.x + el.width)
                );
                nextElements = nextElements.map((el) =>
                    selectedElementIds.includes(el.id)
                        ? { ...el, x: maxRight - el.width }
                        : el
                );
            } else if (action === 'align-top') {
                const minY = Math.min(...selectedElements.map((el) => el.y));
                nextElements = nextElements.map((el) =>
                    selectedElementIds.includes(el.id) ? { ...el, y: minY } : el
                );
            } else if (action === 'align-center-v') {
                const minY = Math.min(...selectedElements.map((el) => el.y));
                const maxBottom = Math.max(
                    ...selectedElements.map((el) => el.y + el.height)
                );
                const centerY = (minY + maxBottom) / 2;
                nextElements = nextElements.map((el) =>
                    selectedElementIds.includes(el.id)
                        ? { ...el, y: centerY - el.height / 2 }
                        : el
                );
            } else if (action === 'align-bottom') {
                const maxBottom = Math.max(
                    ...selectedElements.map((el) => el.y + el.height)
                );
                nextElements = nextElements.map((el) =>
                    selectedElementIds.includes(el.id)
                        ? { ...el, y: maxBottom - el.height }
                        : el
                );
            } else if (action === 'distribute-h') {
                if (selectedElements.length < 3) return;
                const sorted = [...selectedElements].sort((a, b) => a.x - b.x);
                const firstX = sorted[0].x;
                const lastRight =
                    sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
                const totalWidth = sorted.reduce((sum, el) => sum + el.width, 0);
                const gap = (lastRight - firstX - totalWidth) / (sorted.length - 1);
                let currentX = firstX;
                const posMap = new Map<string, number>();
                sorted.forEach((el) => {
                    posMap.set(el.id, currentX);
                    currentX += el.width + gap;
                });
                nextElements = nextElements.map((el) => {
                    const newX = posMap.get(el.id);
                    return newX !== undefined ? { ...el, x: newX } : el;
                });
            } else if (action === 'distribute-v') {
                if (selectedElements.length < 3) return;
                const sorted = [...selectedElements].sort((a, b) => a.y - b.y);
                const firstY = sorted[0].y;
                const lastBottom =
                    sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
                const totalHeight = sorted.reduce((sum, el) => sum + el.height, 0);
                const gap =
                    (lastBottom - firstY - totalHeight) / (sorted.length - 1);
                let currentY = firstY;
                const posMap = new Map<string, number>();
                sorted.forEach((el) => {
                    posMap.set(el.id, currentY);
                    currentY += el.height + gap;
                });
                nextElements = nextElements.map((el) => {
                    const newY = posMap.get(el.id);
                    return newY !== undefined ? { ...el, y: newY } : el;
                });
            }

            update({ drawElements: nextElements });
            syncUpdate({ drawElements: nextElements });
            saveHistory(nextElements);
        },
        [drawElements, selectedElementIds, update, syncUpdate, saveHistory]
    );

    // ── handleGroup / handleUngroup ──────────────────────────────────────────
    const handleGroup = useCallback(() => {
        if (selectedElementIds.length < 2) return;
        const groupId = `grp_${Date.now()}`;
        const nextElements = drawElements.map((el) =>
            selectedElementIds.includes(el.id) ? { ...el, groupId } : el
        );
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
    }, [drawElements, selectedElementIds, update, syncUpdate, saveHistory]);

    const handleUngroup = useCallback(() => {
        const toUngroup = selectedElementIds.filter((id) => {
            const el = drawElements.find((e) => e.id === id);
            return el?.groupId != null;
        });
        if (toUngroup.length === 0) return;
        const nextElements = drawElements.map((el) =>
            toUngroup.includes(el.id) ? { ...el, groupId: undefined } : el
        );
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
        setSelectedElementIds((prev) => prev.filter((id) => toUngroup.includes(id)));
    }, [drawElements, selectedElementIds, update, syncUpdate, saveHistory, setSelectedElementIds]);

    return {
        updateElement,
        deleteElements,
        handleLayerAction,
        handleObjectAlign,
        handleGroup,
        handleUngroup,
    };
}
