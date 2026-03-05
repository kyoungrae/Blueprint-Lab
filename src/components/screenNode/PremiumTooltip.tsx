import React, { useState, useRef, useCallback, useContext } from 'react';
import { createPortal } from 'react-dom';
import { TooltipPortalContext } from '../../contexts/TooltipPortalContext';

const DEFAULT_TOOLTIP_Z_INDEX = 999999;

interface PremiumTooltipProps {
    label: string;
    children: React.ReactNode;
    dotColor?: string;
    placement?: 'top' | 'bottom';
    /** 상단바 등에서만 사용: bottom 배치 시 아이콘과의 간격(px). 없으면 기본 8px */
    offsetBottom?: number;
    /** 툴팁 레이어 순서. 기본값 12000 */
    zIndex?: number;
}

const TOOLTIP_OFFSET = 40;
const TOOLTIP_GAP_BELOW = 8; // 버튼 바로 아래 간격
const MIN_SPACE_ABOVE = 48;

const PremiumTooltip: React.FC<PremiumTooltipProps> = ({ label, children, dotColor, placement, offsetBottom, zIndex = DEFAULT_TOOLTIP_Z_INDEX }) => {
    const [visible, setVisible] = useState(false);
    const [resolvedPlacement, setResolvedPlacement] = useState<'top' | 'bottom'>('bottom');
    const [portalPosition, setPortalPosition] = useState({ left: 0, top: 0 });
    const wrapperRef = useRef<HTMLDivElement>(null);
    const portalRootRef = useContext(TooltipPortalContext);

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

        const container = portalRootRef?.current;
        const el = wrapperRef.current;
        if (container && el) {
            const cr = container.getBoundingClientRect();
            const tr = el.getBoundingClientRect();
            // 포탈 컨테이너는 React Flow transform 안에 있어 뷰포트 좌표를 로컬 좌표로 변환해야 함
            const scaleX = cr.width > 0 && container.offsetWidth > 0 ? cr.width / container.offsetWidth : 1;
            const scaleY = cr.height > 0 && container.offsetHeight > 0 ? cr.height / container.offsetHeight : 1;
            const centerX = (tr.left - cr.left + tr.width / 2) / scaleX;
            const gapBelow = offsetBottom ?? TOOLTIP_GAP_BELOW;
            if (resolved === 'top') {
                const top = (tr.top - cr.top - 8) / scaleY;
                setPortalPosition({ left: centerX, top });
            } else {
                const top = (tr.bottom - cr.top + gapBelow) / scaleY;
                setPortalPosition({ left: centerX, top });
            }
        }
    }, [placement, offsetBottom, portalRootRef]);

    const handleMouseEnter = useCallback(() => {
        updatePlacement();
        setVisible(true);
    }, [updatePlacement]);

    const handleMouseLeave = useCallback(() => {
        setVisible(false);
    }, []);

    const bottomOffset = offsetBottom ?? TOOLTIP_OFFSET;
    const inlineStyle: React.CSSProperties = resolvedPlacement === 'top'
        ? { left: '50%', bottom: '100%', transform: 'translate(-50%, 0)', marginBottom: 8 }
        : { left: '50%', top: '10px', transform: 'translate(-50%, 0)', marginTop: bottomOffset };

    const portalStyle: React.CSSProperties = resolvedPlacement === 'top'
        ? { left: portalPosition.left, top: portalPosition.top, transform: 'translate(-50%, -100%)', position: 'absolute' as const }
        : { left: portalPosition.left, top: portalPosition.top, transform: 'translate(-50%, 0)', position: 'absolute' as const };

    const usePortal = visible && portalRootRef?.current != null;
    const tooltipStyleWithZ = usePortal
        ? { ...portalStyle, zIndex }
        : { ...inlineStyle, zIndex };
    const tooltipContent = (
        <div
            className="absolute px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-[11px] font-medium rounded-lg shadow-2xl border border-slate-700/50 whitespace-nowrap flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
            style={tooltipStyleWithZ}
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
            {visible && usePortal && createPortal(tooltipContent, portalRootRef!.current!)}
            {visible && !usePortal && tooltipContent}
        </div>
    );
};

export default PremiumTooltip;
