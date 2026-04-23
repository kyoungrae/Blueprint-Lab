import { useCallback } from 'react';
import type { DrawElement, Screen } from '../../types/screenDesign';

interface UseCanvasElementActionsOptions {
    screen: Screen;
    getDrawElements: () => DrawElement[];
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
    pendingFontSizeRef: React.MutableRefObject<{ elementId: string; px: number } | null>;
    pendingFontSizeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    pendingSyncDrawElementsRef: React.MutableRefObject<DrawElement[] | null>;
    pendingSyncTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    flushPendingFontSize: () => void;
    PENDING_FONT_SIZE_DEBOUNCE_MS: number;
}

export function useCanvasElementActions({
    screen,
    getDrawElements,
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

    const flushPendingSync = useCallback(() => {
        if (pendingSyncTimerRef.current) {
            clearTimeout(pendingSyncTimerRef.current);
            pendingSyncTimerRef.current = null;
        }
        const targets = pendingSyncDrawElementsRef.current;
        if (targets) {
            pendingSyncDrawElementsRef.current = null;
            update({ drawElements: targets });
            syncUpdate({ drawElements: targets });
            saveHistory(targets);
        }
    }, [update, syncUpdate, saveHistory, pendingSyncTimerRef, pendingSyncDrawElementsRef]);

    // ── updateElement ────────────────────────────────────────────────────────
    const updateElement = useCallback(
        (id: string, updates: Partial<DrawElement>) => {
            const drawElements = getDrawElements();

            // 텍스트나 테이블 데이터도 스타일처럼 무거운 리렌더링을 유발하므로 디바운스 처리 대상에 포함
            const throttledKeys = [
                'fontSize', 'color', 'fontWeight', 'fontStyle', 'textDecoration', 'fontFamily',
                'text', 'tableCellData', 'tableCellDataV2', 'tableCellStyles', 'tableCellColors'
            ];
            const isThrottledOnly = Object.keys(updates).every(key => throttledKeys.includes(key));

            if (isThrottledOnly) {
                const finalUpdates = { ...updates };
                if (finalUpdates.text !== undefined && drawElements.find(e => e.id === id)?.fromComponentId) {
                    finalUpdates.hasComponentText = false;
                }

                // 1. 즉시 반영을 위한 데이터 계산
                const nextElements = drawElements.map((el) =>
                    el.id === id ? { ...el, ...finalUpdates } : el
                );

                // 2. 폰트 사이즈 전용 디바운스 (가장 긴 대기시간)
                if ('fontSize' in updates) {
                    pendingFontSizeRef.current = { elementId: id, px: updates.fontSize! };
                    if (pendingFontSizeTimerRef.current) clearTimeout(pendingFontSizeTimerRef.current);
                    pendingFontSizeTimerRef.current = setTimeout(() => {
                        pendingFontSizeTimerRef.current = null;
                        flushPendingFontSize();
                    }, PENDING_FONT_SIZE_DEBOUNCE_MS);
                    return;
                }

                // 3. 텍스트나 다른 스타일은 짧은 디바운스 (150ms)
                // 이를 통해 타이핑 중이나 툴바 조작 중 캔버스 전체 리렌더링 횟수를 획기적으로 줄임
                pendingSyncDrawElementsRef.current = nextElements;
                if (pendingSyncTimerRef.current) clearTimeout(pendingSyncTimerRef.current);
                pendingSyncTimerRef.current = setTimeout(() => {
                    pendingSyncTimerRef.current = null;
                    const targets = pendingSyncDrawElementsRef.current;
                    if (targets) {
                        pendingSyncDrawElementsRef.current = null;
                        update({ drawElements: targets });
                        syncUpdate({ drawElements: targets });
                    }
                }, 200); // 200ms 디바운스로 상향 (부하 경감)
                return;
            }

            // 위치 이동(x, y), 크기 조절(width, height) 등은 즉시 반영 필요
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

            const finalUpdates = { ...updates };
            if (finalUpdates.text !== undefined && drawElements.find(e => e.id === id)?.fromComponentId) {
                finalUpdates.hasComponentText = false;
            }

            const nextElements = elements.map((el) =>
                el.id === id ? { ...el, ...finalUpdates } : el
            );
            update({ drawElements: nextElements });

            // 동기화 & 히스토리 디바운스
            pendingSyncDrawElementsRef.current = nextElements;
            if (pendingSyncTimerRef.current) clearTimeout(pendingSyncTimerRef.current);
            pendingSyncTimerRef.current = setTimeout(() => {
                pendingSyncTimerRef.current = null;
                const toSend = pendingSyncDrawElementsRef.current;
                if (toSend) {
                    pendingSyncDrawElementsRef.current = null;
                    syncUpdate({ drawElements: toSend });
                    saveHistory(toSend);
                }
            }, 400); // 위치 이동 후 동기화는 400ms 정도로 넉넉히
        },
        [getDrawElements, update, syncUpdate, saveHistory, flushPendingFontSize, PENDING_FONT_SIZE_DEBOUNCE_MS]
    );

    // ── updateElements (Bulk) ────────────────────────────────────────────────
    const updateElements = useCallback(
        (ids: string[], updates: Partial<DrawElement> | ((el: DrawElement) => Partial<DrawElement>)) => {
            const drawElements = getDrawElements();
            const idsSet = new Set(ids);
            const nextElements = drawElements.map((el) => {
                if (!idsSet.has(el.id)) return el;
                const partial = typeof updates === 'function' ? updates(el) : updates;
                return { ...el, ...partial };
            });

            update({ drawElements: nextElements });

            pendingSyncDrawElementsRef.current = nextElements;
            if (pendingSyncTimerRef.current) clearTimeout(pendingSyncTimerRef.current);
            pendingSyncTimerRef.current = setTimeout(() => {
                pendingSyncTimerRef.current = null;
                const toSend = pendingSyncDrawElementsRef.current;
                if (toSend) {
                    pendingSyncDrawElementsRef.current = null;
                    syncUpdate({ drawElements: toSend });
                    saveHistory(toSend);
                }
            }, 300);
        },
        [getDrawElements, update, syncUpdate, saveHistory]
    );

    // ... (rest remains same but using getDrawElements)
    const deleteElements = useCallback(
        (ids: string[]) => {
            const drawElements = getDrawElements();
            const idsSet = new Set(ids);
            const nextElements = drawElements.filter((el) => !idsSet.has(el.id));

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
        [getDrawElements, screen, update, saveHistory, setSelectedElementIds, sendOperation, user]
    );

    const handleLayerAction = useCallback(
        (action: 'front' | 'back' | 'forward' | 'backward') => {
            const drawElements = getDrawElements();
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
        [getDrawElements, selectedElementIds, update, syncUpdate, saveHistory]
    );

    const handleObjectAlign = useCallback(
        (action: any) => {
            const drawElements = getDrawElements();
            if (selectedElementIds.length < 2) return;
            const selectedElements = drawElements.filter((el) => selectedElementIds.includes(el.id));
            if (selectedElements.length < 2) return;

            type AlignUnit = {
                key: string;
                members: DrawElement[];
                minX: number;
                minY: number;
                maxX: number;
                maxY: number;
                width: number;
                height: number;
            };
            const unitMap = new Map<string, DrawElement[]>();
            selectedElements.forEach((el) => {
                const key = el.groupId ? `group:${el.groupId}` : `el:${el.id}`;
                const arr = unitMap.get(key) ?? [];
                arr.push(el);
                unitMap.set(key, arr);
            });
            const units: AlignUnit[] = [...unitMap.entries()].map(([key, members]) => {
                const minX = Math.min(...members.map((m) => m.x));
                const minY = Math.min(...members.map((m) => m.y));
                const maxX = Math.max(...members.map((m) => m.x + m.width));
                const maxY = Math.max(...members.map((m) => m.y + m.height));
                return { key, members, minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
            });
            if (units.length < 2) return;

            const targetXByUnit = new Map<string, number>();
            const targetYByUnit = new Map<string, number>();
            if (action === 'align-left') {
                const minX = Math.min(...units.map((u) => u.minX));
                units.forEach((u) => targetXByUnit.set(u.key, minX));
            } else if (action === 'align-center-h') {
                const minX = Math.min(...units.map((u) => u.minX));
                const maxRight = Math.max(...units.map((u) => u.maxX));
                const centerX = (minX + maxRight) / 2;
                units.forEach((u) => targetXByUnit.set(u.key, centerX - u.width / 2));
            } else if (action === 'align-right') {
                const maxRight = Math.max(...units.map((u) => u.maxX));
                units.forEach((u) => targetXByUnit.set(u.key, maxRight - u.width));
            } else if (action === 'align-top') {
                const minY = Math.min(...units.map((u) => u.minY));
                units.forEach((u) => targetYByUnit.set(u.key, minY));
            } else if (action === 'align-center-v') {
                const minY = Math.min(...units.map((u) => u.minY));
                const maxBottom = Math.max(...units.map((u) => u.maxY));
                const centerY = (minY + maxBottom) / 2;
                units.forEach((u) => targetYByUnit.set(u.key, centerY - u.height / 2));
            } else if (action === 'align-bottom') {
                const maxBottom = Math.max(...units.map((u) => u.maxY));
                units.forEach((u) => targetYByUnit.set(u.key, maxBottom - u.height));
            } else if (action === 'distribute-h') {
                const sorted = [...units].sort((a, b) => a.minX - b.minX);
                const firstX = sorted[0].minX;
                const lastRight = sorted[sorted.length - 1].maxX;
                const totalW = sorted.reduce((s, u) => s + u.width, 0);
                const gap = (lastRight - firstX - totalW) / (sorted.length - 1);
                let curX = firstX;
                sorted.forEach((u) => {
                    targetXByUnit.set(u.key, curX);
                    curX += u.width + gap;
                });
            } else if (action === 'distribute-v') {
                const sorted = [...units].sort((a, b) => a.minY - b.minY);
                const firstY = sorted[0].minY;
                const lastBottom = sorted[sorted.length - 1].maxY;
                const totalH = sorted.reduce((s, u) => s + u.height, 0);
                const gap = (lastBottom - firstY - totalH) / (sorted.length - 1);
                let curY = firstY;
                sorted.forEach((u) => {
                    targetYByUnit.set(u.key, curY);
                    curY += u.height + gap;
                });
            }

            const deltaByElementId = new Map<string, { dx: number; dy: number }>();
            units.forEach((u) => {
                const targetX = targetXByUnit.has(u.key) ? targetXByUnit.get(u.key)! : u.minX;
                const targetY = targetYByUnit.has(u.key) ? targetYByUnit.get(u.key)! : u.minY;
                const dx = targetX - u.minX;
                const dy = targetY - u.minY;
                u.members.forEach((m) => deltaByElementId.set(m.id, { dx, dy }));
            });

            const nextElements = drawElements.map((el) => {
                const d = deltaByElementId.get(el.id);
                if (!d || (d.dx === 0 && d.dy === 0)) return el;
                if (el.type === 'polygon' && el.polygonPoints?.length) {
                    return {
                        ...el,
                        x: el.x + d.dx,
                        y: el.y + d.dy,
                        polygonPoints: el.polygonPoints.map((p) => ({ x: p.x + d.dx, y: p.y + d.dy })),
                    };
                }
                if (el.type === 'line' && el.lineX1 != null && el.lineY1 != null && el.lineX2 != null && el.lineY2 != null) {
                    const lineX1 = el.lineX1 + d.dx;
                    const lineY1 = el.lineY1 + d.dy;
                    const lineX2 = el.lineX2 + d.dx;
                    const lineY2 = el.lineY2 + d.dy;
                    return {
                        ...el,
                        x: Math.min(lineX1, lineX2),
                        y: Math.min(lineY1, lineY2),
                        width: Math.max(Math.abs(lineX2 - lineX1), 1),
                        height: Math.max(Math.abs(lineY2 - lineY1), 1),
                        lineX1,
                        lineY1,
                        lineX2,
                        lineY2,
                    };
                }
                return { ...el, x: el.x + d.dx, y: el.y + d.dy };
            });

            update({ drawElements: nextElements });
            syncUpdate({ drawElements: nextElements });
            saveHistory(nextElements);
        },
        [getDrawElements, selectedElementIds, update, syncUpdate, saveHistory]
    );

    const handleGroup = useCallback(() => {
        const drawElements = getDrawElements();
        if (selectedElementIds.length < 2) return;
        const groupId = `grp_${Date.now()}`;
        const nextElements = drawElements.map((el) => selectedElementIds.includes(el.id) ? { ...el, groupId } : el);
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
    }, [getDrawElements, selectedElementIds, update, syncUpdate, saveHistory]);

    const handleUngroup = useCallback(() => {
        const drawElements = getDrawElements();
        const toUngroup = selectedElementIds.filter((id) => drawElements.find((e) => e.id === id)?.groupId != null);
        if (toUngroup.length === 0) return;
        const nextElements = drawElements.map((el) => toUngroup.includes(el.id) ? { ...el, groupId: undefined } : el);
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
        setSelectedElementIds((prev) => prev.filter((id) => toUngroup.includes(id)));
    }, [getDrawElements, selectedElementIds, update, syncUpdate, setSelectedElementIds]);

    return {
        updateElement,
        updateElements,
        deleteElements,
        handleLayerAction,
        handleObjectAlign,
        handleGroup,
        handleUngroup,
        flushPendingSync,
    };
}
