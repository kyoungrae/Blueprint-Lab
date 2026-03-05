import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/** 모든 패널·모달·오버레이 위에 툴팁이 보이도록 document.body 포탈 + position:fixed, z-index 최상위 */
const DEFAULT_TOOLTIP_Z_INDEX = 999999;

interface PremiumTooltipProps {
    label: string;
    children: React.ReactNode;
    dotColor?: string;
    placement?: 'top' | 'bottom';
    /** 상단바 등에서만 사용: bottom 배치 시 아이콘과의 간격(px). 없으면 기본 8px */
    offsetBottom?: number;
    /** 툴팁 레이어 순서. 기본값 999999(항상 최상단) */
    zIndex?: number;
}

const TOOLTIP_OFFSET = 40;
const TOOLTIP_GAP_BELOW = 8;
const MIN_SPACE_ABOVE = 48;

const PremiumTooltip: React.FC<PremiumTooltipProps> = ({ label, children, dotColor, placement, offsetBottom, zIndex = DEFAULT_TOOLTIP_Z_INDEX }) => {
    const [visible, setVisible] = useState(false);
    const [resolvedPlacement, setResolvedPlacement] = useState<'top' | 'bottom'>('bottom');
    const [viewportPos, setViewportPos] = useState({ left: 0, top: 0 });
    const wrapperRef = useRef<HTMLDivElement>(null);

    const updatePlacement = useCallback(() => {
        const resolved = placement ?? (() => {
            const el = wrapperRef.current;
            if (!el) return 'bottom' as const;
            const rect = el.getBoundingClientRect();
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            return spaceAbove >= MIN_SPACE_ABOVE && spaceAbove >= spaceBelow ? 'top' : 'bottom';
        })();
        setResolvedPlacement(resolved);

        const el = wrapperRef.current;
        if (!el) return;
        const tr = el.getBoundingClientRect();
        const centerX = tr.left + tr.width / 2;
        const gapBelow = offsetBottom ?? TOOLTIP_GAP_BELOW;
        setViewportPos(resolved === 'top'
            ? { left: centerX, top: tr.top - 8 }
            : { left: centerX, top: tr.bottom + gapBelow });
    }, [placement, offsetBottom]);

    const handleMouseEnter = useCallback(() => {
        updatePlacement();
        setVisible(true);
    }, [updatePlacement]);

    const handleMouseLeave = useCallback(() => {
        setVisible(false);
    }, []);

    const bottomOffset = offsetBottom ?? TOOLTIP_OFFSET;
    const inlineStyle: React.CSSProperties = resolvedPlacement === 'top'
        ? { left: '50%', bottom: '100%', transform: 'translate(-50%, 0)', marginBottom: 8, zIndex }
        : { left: '50%', top: '10px', transform: 'translate(-50%, 0)', marginTop: bottomOffset, zIndex };

    const useBodyPortal = visible && typeof document !== 'undefined' && document.body != null;
    const bodyPortalStyle: React.CSSProperties = resolvedPlacement === 'top'
        ? { position: 'fixed' as const, left: viewportPos.left, top: viewportPos.top, transform: 'translate(-50%, -100%)', zIndex }
        : { position: 'fixed' as const, left: viewportPos.left, top: viewportPos.top, transform: 'translate(-50%, 0)', zIndex };

    const tooltipStyle = useBodyPortal ? bodyPortalStyle : inlineStyle;
    const tooltipContent = (
        <div
            className="absolute px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-[11px] font-medium rounded-lg shadow-2xl border border-slate-700/50 whitespace-nowrap flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
            style={tooltipStyle}
        >
            {dotColor && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />}
            {label}
            {resolvedPlacement === 'top' ? (
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-[5px] border-x-transparent border-b-transparent border-t-slate-900/95" style={{ pointerEvents: 'none' }} />
            ) : (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-1 border-[5px] border-x-transparent border-t-transparent border-b-slate-900/95" style={{ pointerEvents: 'none' }} />
            )}
        </div>
    );

    return (
        <div
            ref={wrapperRef}
            className="nodrag nopan relative flex items-center justify-center"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {useBodyPortal && createPortal(tooltipContent, document.body)}
            {visible && !useBodyPortal && tooltipContent}
        </div>
    );
};

export default PremiumTooltip;
