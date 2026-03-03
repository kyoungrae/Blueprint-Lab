import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface PremiumTooltipProps {
    label: string;
    children: React.ReactNode;
    dotColor?: string;
}

const TOOLTIP_OFFSET = 8;
const MIN_SPACE_ABOVE = 48;

const PremiumTooltip: React.FC<PremiumTooltipProps> = ({ label, children, dotColor }) => {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0, placement: 'top' as 'top' | 'bottom' });
    const wrapperRef = useRef<HTMLDivElement>(null);

    const updatePosition = useCallback(() => {
        const el = wrapperRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        const placement = spaceAbove >= MIN_SPACE_ABOVE || spaceAbove >= spaceBelow ? 'top' : 'bottom';
        setPos({
            left: centerX,
            top: rect.top,
            placement,
        });
    }, []);

    const handleMouseEnter = useCallback(() => {
        updatePosition();
        setVisible(true);
    }, [updatePosition]);

    const handleMouseLeave = useCallback(() => {
        setVisible(false);
    }, []);

    const tooltipStyle: React.CSSProperties = pos.placement === 'top'
        ? { left: pos.left, top: pos.top - TOOLTIP_OFFSET, transform: 'translate(-50%, -100%)' }
        : { left: pos.left, top: pos.top + TOOLTIP_OFFSET, transform: 'translate(-50%, 0)' };

    return (
        <div
            ref={wrapperRef}
            className="nodrag nopan relative flex items-center justify-center"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {visible && createPortal(
                <div
                    className="fixed px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-[11px] font-medium rounded-lg shadow-2xl border border-slate-700/50 whitespace-nowrap z-[9999] flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150"
                    style={tooltipStyle}
                >
                    {dotColor && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />}
                    {label}
                    {/* Pointer Arrow */}
                    {pos.placement === 'top' ? (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-[5px] border-x-transparent border-b-transparent border-t-slate-900/95" style={{ pointerEvents: 'none' }} />
                    ) : (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-1 border-[5px] border-x-transparent border-t-transparent border-b-slate-900/95" style={{ pointerEvents: 'none' }} />
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

export default PremiumTooltip;
