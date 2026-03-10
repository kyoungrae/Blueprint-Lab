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
                // 텍스트를 수정하는 경우, 더 이상 컴포넌트 스타일 동기화(text) 대상이 되지 않도록 플래그 설정
                if ('text' in updates && drawElements.find(e => e.id === id)?.fromComponentId) {
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
            // 컴포넌트 인스턴스의 텍스트를 수정하는 경우, 더 이상 컴포넌트 스타일 동기화 대상이 되지 않도록 플래그 설정
            if ('text' in updates && drawElements.find(e => e.id === id)?.fromComponentId) {
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

            let nextElements = [...drawElements];
            if (action === 'align-left') {
                const minX = Math.min(...selectedElements.map((el) => el.x));
                nextElements = nextElements.map((el) => selectedElementIds.includes(el.id) ? { ...el, x: minX } : el);
            } else if (action === 'align-center-h') {
                const minX = Math.min(...selectedElements.map((el) => el.x));
                const maxRight = Math.max(...selectedElements.map((el) => el.x + el.width));
                const centerX = (minX + maxRight) / 2;
                nextElements = nextElements.map((el) => selectedElementIds.includes(el.id) ? { ...el, x: centerX - el.width / 2 } : el);
            } else if (action === 'align-right') {
                const maxRight = Math.max(...selectedElements.map((el) => el.x + el.width));
                nextElements = nextElements.map((el) => selectedElementIds.includes(el.id) ? { ...el, x: maxRight - el.width } : el);
            } else if (action === 'align-top') {
                const minY = Math.min(...selectedElements.map((el) => el.y));
                nextElements = nextElements.map((el) => selectedElementIds.includes(el.id) ? { ...el, y: minY } : el);
            } else if (action === 'align-center-v') {
                const minY = Math.min(...selectedElements.map((el) => el.y));
                const maxBottom = Math.max(...selectedElements.map((el) => el.y + el.height));
                const centerY = (minY + maxBottom) / 2;
                nextElements = nextElements.map((el) => selectedElementIds.includes(el.id) ? { ...el, y: centerY - el.height / 2 } : el);
            } else if (action === 'align-bottom') {
                const maxBottom = Math.max(...selectedElements.map((el) => el.y + el.height));
                nextElements = nextElements.map((el) => selectedElementIds.includes(el.id) ? { ...el, y: maxBottom - el.height } : el);
            } else if (action === 'distribute-h') {
                const sorted = [...selectedElements].sort((a, b) => a.x - b.x);
                const firstX = sorted[0].x;
                const lastRight = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
                const totalW = sorted.reduce((s, e) => s + e.width, 0);
                const gap = (lastRight - firstX - totalW) / (sorted.length - 1);
                let curX = firstX;
                const posMap = new Map();
                sorted.forEach(el => { posMap.set(el.id, curX); curX += el.width + gap; });
                nextElements = nextElements.map(el => { const nx = posMap.get(el.id); return nx !== undefined ? { ...el, x: nx } : el; });
            } else if (action === 'distribute-v') {
                const sorted = [...selectedElements].sort((a, b) => a.y - b.y);
                const firstY = sorted[0].y;
                const lastBtn = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
                const totalH = sorted.reduce((s, e) => s + e.height, 0);
                const gap = (lastBtn - firstY - totalH) / (sorted.length - 1);
                let curY = firstY;
                const posMap = new Map();
                sorted.forEach(el => { posMap.set(el.id, curY); curY += el.height + gap; });
                nextElements = nextElements.map(el => { const ny = posMap.get(el.id); return ny !== undefined ? { ...el, y: ny } : el; });
            }

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
    };
}
