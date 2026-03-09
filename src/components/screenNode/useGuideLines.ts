import { useState, useRef, useCallback } from 'react';
import type { Screen } from '../../types/screenDesign';
import { GRID_STEP } from '../../constants/canvasGrid';

type GuideAxis = 'vertical' | 'horizontal';

interface UseGuideLinesOptions {
    screen: Screen;
    canvasW: number;
    canvasH: number;
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
    onFlushProjectData?: () => void;
}

export function useGuideLines({
    screen,
    canvasW,
    canvasH,
    update,
    syncUpdate,
    onFlushProjectData,
}: UseGuideLinesOptions) {
    const guideLines = screen.guideLines || { vertical: [], horizontal: [] };

    // ── 현재 드래그 중인 보조선 정보 (ref: 리렌더 없이 추적) ──
    const guideLineDragRef = useRef<{ axis: GuideAxis; value: number } | null>(null);

    /** 드래그 중 미리보기 위치 (store 업데이트 전 즉시 반영) */
    const [guideLineDragPreview, setGuideLineDragPreview] = useState<{
        axis: GuideAxis;
        startValue: number;
        currentValue: number;
    } | null>(null);
    const guideLineDragPreviewValueRef = useRef<number>(0);

    /** 현재 선택(클릭)된 보조선 (삭제 버튼 표시용) */
    const [selectedGuideLine, setSelectedGuideLine] = useState<{
        axis: GuideAxis;
        value: number;
    } | null>(null);

    // ── 보조선 추가 ──
    const addGuideLine = useCallback(
        (axis: GuideAxis) => {
            const current = guideLines[axis];
            const center = axis === 'vertical' ? Math.round(canvasW / 2) : Math.round(canvasH / 2);
            let pos = center;

            // 기존 선과 너무 가깝지 않도록 조정
            while (current.includes(pos)) {
                pos += GRID_STEP;
            }

            const next = {
                ...guideLines,
                [axis]: [...current, pos].sort((a, b) => a - b),
            };
            update({ guideLines: next });
            syncUpdate({ guideLines: next });
            onFlushProjectData?.();
        },
        [guideLines, canvasW, canvasH, update, syncUpdate, onFlushProjectData]
    );

    // ── 보조선 제거 ──
    const removeGuideLine = useCallback(
        (axis: GuideAxis, value: number) => {
            const next = {
                ...guideLines,
                [axis]: guideLines[axis].filter((v) => v !== value),
            };
            update({ guideLines: next });
            syncUpdate({ guideLines: next });
            onFlushProjectData?.();
        },
        [guideLines, update, syncUpdate, onFlushProjectData]
    );

    // ── 전체 보조선 제거 ──
    const removeAllGuideLines = useCallback(() => {
        const next = { vertical: [], horizontal: [] };
        update({ guideLines: next });
        syncUpdate({ guideLines: next });
        onFlushProjectData?.();
    }, [update, syncUpdate, onFlushProjectData]);

    // ── 눈금자 간격 기준으로 전체 보조선 추가 ──
    const addAllGuideLines = useCallback(() => {
        const verticals: number[] = [];
        const horizontals: number[] = [];

        for (let x = GRID_STEP; x < canvasW; x += GRID_STEP) {
            verticals.push(x);
        }
        for (let y = GRID_STEP; y < canvasH; y += GRID_STEP) {
            horizontals.push(y);
        }

        const next = { vertical: verticals, horizontal: horizontals };
        update({ guideLines: next });
        syncUpdate({ guideLines: next });
        onFlushProjectData?.();
    }, [canvasW, canvasH, update, syncUpdate, onFlushProjectData]);

    // ── 보조선 드래그 시작 ──
    const handleGuideLineDragStart = useCallback(
        (axis: GuideAxis, value: number, e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();

            guideLineDragRef.current = { axis, value };
            guideLineDragPreviewValueRef.current = value;
            setGuideLineDragPreview({ axis, startValue: value, currentValue: value });
            setSelectedGuideLine({ axis, value });

            const onMouseMove = (me: MouseEvent) => {
                me.stopPropagation();
                me.preventDefault();

                const canvasEl = document.querySelector('[data-canvas-area]') as HTMLElement | null;
                if (!canvasEl) return;

                const rect = canvasEl.getBoundingClientRect();
                let newValue: number;

                if (axis === 'vertical') {
                    newValue = Math.round(me.clientX - rect.left);
                    newValue = Math.max(0, Math.min(newValue, canvasW));
                } else {
                    newValue = Math.round(me.clientY - rect.top);
                    newValue = Math.max(0, Math.min(newValue, canvasH));
                }

                guideLineDragPreviewValueRef.current = newValue;
                setGuideLineDragPreview((prev) =>
                    prev ? { ...prev, currentValue: newValue } : null
                );
            };

            const onMouseUp = () => {
                const drag = guideLineDragRef.current;
                if (!drag) return;

                const finalValue = guideLineDragPreviewValueRef.current;
                const current = guideLines[drag.axis].filter((v) => v !== drag.value);

                // 캔버스 밖으로 드래그하면 삭제
                const isOutside =
                    drag.axis === 'vertical'
                        ? finalValue <= 0 || finalValue >= canvasW
                        : finalValue <= 0 || finalValue >= canvasH;

                const next = isOutside
                    ? { ...guideLines, [drag.axis]: current.sort((a, b) => a - b) }
                    : {
                        ...guideLines,
                        [drag.axis]: [...current, finalValue].sort((a, b) => a - b),
                    };

                update({ guideLines: next });
                syncUpdate({ guideLines: next });
                onFlushProjectData?.();

                guideLineDragRef.current = null;
                setGuideLineDragPreview(null);
                setSelectedGuideLine(isOutside ? null : { axis: drag.axis, value: finalValue });

                window.removeEventListener('mousemove', onMouseMove, true);
                window.removeEventListener('mouseup', onMouseUp, true);
            };

            window.addEventListener('mousemove', onMouseMove, true);
            window.addEventListener('mouseup', onMouseUp, true);
        },
        // guideLines는 렌더 시 최신값을 읽어야 하므로 deps에 포함
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [canvasW, canvasH, update, syncUpdate, onFlushProjectData, screen.guideLines]
    );

    return {
        guideLines,
        guideLineDragPreview,
        selectedGuideLine,
        setSelectedGuideLine,
        addGuideLine,
        removeGuideLine,
        removeAllGuideLines,
        addAllGuideLines,
        handleGuideLineDragStart,
    };
}
