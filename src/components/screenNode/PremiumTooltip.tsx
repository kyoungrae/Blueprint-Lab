import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface PremiumTooltipProps {
    label: string;
    children: React.ReactNode;
    dotColor?: string;
}

const PremiumTooltip: React.FC<PremiumTooltipProps> = ({ label, children, dotColor }) => {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const wrapperRef = useRef<HTMLDivElement>(null);

    const updatePosition = useCallback(() => {
        const el = wrapperRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setPos({
            left: rect.left + rect.width / 2,
            top: rect.top,
        });
    }, []);

    const handleMouseEnter = useCallback(() => {
        updatePosition();
        setVisible(true);
    }, [updatePosition]);

    const handleMouseLeave = useCallback(() => {
        setVisible(false);
    }, []);

    return (
        <div
            ref={wrapperRef}
            className="relative flex items-center justify-center"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {visible && createPortal(
                <div
                    className="fixed px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-[11px] font-medium rounded-lg shadow-2xl border border-slate-700/50 whitespace-nowrap z-[9999] flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150"
                    style={{
                        left: pos.left,
                        top: pos.top - 8,
                        transform: 'translate(-50%, -100%)',
                    }}
                >
                    {dotColor && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />}
                    {label}
                    {/* Pointer Arrow */}
                    <div
                        className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-[5px] border-x-transparent border-b-transparent border-t-slate-900/95"
                        style={{ pointerEvents: 'none' }}
                    />
                </div>,
                document.body
            )}
        </div>
    );
};

export default PremiumTooltip;
