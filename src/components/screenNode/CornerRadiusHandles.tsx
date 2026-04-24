import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DrawElement } from '../../types/screenDesign';

type CornerId = 'a1' | 'a2' | 'a3' | 'a4';

interface CornerRadiusHandlesProps {
    el: DrawElement;
    updateElement: (id: string, updates: Partial<DrawElement>) => void;
    saveHistory?: (elements: DrawElement[]) => void;
    getDrawElements?: () => DrawElement[];
    flushPendingSync?: () => void;
}

const CORNER_LABEL: Record<CornerId, string> = {
    a1: 'A1',
    a2: 'A2',
    a3: 'A3',
    a4: 'A4',
};

const CornerRadiusHandles: React.FC<CornerRadiusHandlesProps> = ({
    el,
    updateElement,
    saveHistory,
    getDrawElements,
    flushPendingSync,
}) => {
    const dragRef = useRef<{
        corner: CornerId;
        startClientX: number;
        startValue: number;
        scale: number;
        maxR: number;
    } | null>(null);

    const [dragInfo, setDragInfo] = useState<{
        corner: CornerId;
        clientX: number;
        clientY: number;
        value: number;
    } | null>(null);

    const isTable = el.type === 'table';
    const isRect = el.type === 'rect';

    if (!isTable && !isRect) return null;

    const w = el.width || 0;
    const h = el.height || 0;
    if (w <= 0 || h <= 0) return null;

    const maxR = Math.max(0, Math.floor(Math.min(w, h) / 2));

    const getCornerRadius = (corner: CornerId): number => {
        if (isTable) {
            switch (corner) {
                case 'a1': return el.tableBorderRadiusTopLeft ?? el.tableBorderRadius ?? 0;
                case 'a2': return el.tableBorderRadiusTopRight ?? el.tableBorderRadius ?? 0;
                case 'a3': return el.tableBorderRadiusBottomLeft ?? el.tableBorderRadius ?? 0;
                case 'a4': return el.tableBorderRadiusBottomRight ?? el.tableBorderRadius ?? 0;
            }
        }
        if (isRect) {
            const base = el.borderRadius ?? 0;
            switch (corner) {
                case 'a1': return el.borderRadiusTopLeft ?? base;
                case 'a2': return el.borderRadiusTopRight ?? base;
                case 'a3': return el.borderRadiusBottomLeft ?? base;
                case 'a4': return el.borderRadiusBottomRight ?? base;
            }
        }
        return el.borderRadius ?? 0;
    };

    const corners: CornerId[] = ['a1', 'a2', 'a3', 'a4'];

    const handleStyle = (corner: CornerId): React.CSSProperties => {
        const r = Math.min(getCornerRadius(corner), maxR);
        // 시각적 최소 오프셋 8px - 코너의 기존 리사이즈 핸들과 시각적으로 겹치지 않도록
        const offset = Math.min(Math.max(r, 8), Math.max(8, Math.floor(w / 2)));
        switch (corner) {
            case 'a1':
                return { left: offset, top: 0, transform: 'translate(-50%, -50%)' };
            case 'a2':
                return { left: w - offset, top: 0, transform: 'translate(-50%, -50%)' };
            case 'a3':
                return { left: offset, top: h, transform: 'translate(-50%, -50%)' };
            case 'a4':
                return { left: w - offset, top: h, transform: 'translate(-50%, -50%)' };
        }
    };

    const onMouseDown = (corner: CornerId, e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        // 부모(요소 컨테이너) 기준 화면 픽셀↔로컬 픽셀 스케일 계산 (캔버스 줌 대응)
        const parentEl = e.currentTarget.parentElement;
        const parentRect = parentEl?.getBoundingClientRect();
        const scale = parentRect && el.width ? parentRect.width / el.width : 1;

        const startValue = getCornerRadius(corner);
        dragRef.current = {
            corner,
            startClientX: e.clientX,
            startValue,
            scale: scale || 1,
            maxR,
        };
        setDragInfo({ corner, clientX: e.clientX, clientY: e.clientY, value: startValue });

        const onMove = (ev: MouseEvent) => {
            if (!dragRef.current) return;
            const { corner, startClientX, startValue, scale, maxR } = dragRef.current;
            const dxScreen = ev.clientX - startClientX;
            const dxLocal = dxScreen / (scale || 1);

            // a1, a3 (왼쪽 핸들): 오른쪽으로 끌수록 곡률 증가
            // a2, a4 (오른쪽 핸들): 왼쪽으로 끌수록 곡률 증가
            const direction = corner === 'a1' || corner === 'a3' ? 1 : -1;
            let next = Math.round(startValue + direction * dxLocal);
            if (next < 0) next = 0;
            if (next > maxR) next = maxR;

            if (isTable) {
                const updates: Partial<DrawElement> = {};
                if (corner === 'a1') updates.tableBorderRadiusTopLeft = next;
                if (corner === 'a2') updates.tableBorderRadiusTopRight = next;
                if (corner === 'a3') updates.tableBorderRadiusBottomLeft = next;
                if (corner === 'a4') updates.tableBorderRadiusBottomRight = next;
                updateElement(el.id, updates);
            } else {
                const key =
                    corner === 'a1' ? 'borderRadiusTopLeft' as const
                        : corner === 'a2' ? 'borderRadiusTopRight' as const
                            : corner === 'a3' ? 'borderRadiusBottomLeft' as const
                                : 'borderRadiusBottomRight' as const;
                updateElement(el.id, { [key]: next });
            }

            setDragInfo({ corner, clientX: ev.clientX, clientY: ev.clientY, value: next });
        };

        const onUp = () => {
            dragRef.current = null;
            setDragInfo(null);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            flushPendingSync?.();
            if (saveHistory && getDrawElements) {
                try { saveHistory(getDrawElements()); } catch { /* noop */ }
            }
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <>
            {corners.map((corner) => (
                <div
                    key={corner}
                    onMouseDown={(e) => onMouseDown(corner, e)}
                    onClick={(e) => e.stopPropagation()}
                    title={`${CORNER_LABEL[corner]} · 코너 곡률`}
                    className="absolute w-[10px] h-[10px] bg-yellow-400 border-[1.5px] border-yellow-500 rounded-full shadow-sm hover:scale-125 hover:bg-yellow-300 transition-all duration-150 cursor-ew-resize pointer-events-auto z-[160]"
                    style={handleStyle(corner)}
                />
            ))}
            {dragInfo && typeof document !== 'undefined' && createPortal(
                <div
                    className="pointer-events-none px-2 py-1 rounded-md bg-gray-900/90 text-white text-[11px] font-mono shadow-lg whitespace-nowrap select-none"
                    style={{ position: 'fixed', left: dragInfo.clientX + 14, top: dragInfo.clientY - 6, zIndex: 10000 }}
                >
                    {CORNER_LABEL[dragInfo.corner]} · 곡률 {dragInfo.value}px
                </div>,
                document.body
            )}
        </>
    );
};

export default CornerRadiusHandles;
