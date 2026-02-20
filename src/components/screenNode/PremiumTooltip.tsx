import React from 'react';

interface PremiumTooltipProps {
    label: string;
    children: React.ReactNode;
    dotColor?: string;
}

const PremiumTooltip: React.FC<PremiumTooltipProps> = ({ label, children, dotColor }) => {
    return (
        <div className="relative group/premium-tooltip flex items-center justify-center">
            {children}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-[11px] font-medium rounded-lg shadow-2xl border border-slate-700/50 whitespace-nowrap opacity-0 group-hover/premium-tooltip:opacity-100 transition-all duration-200 pointer-events-none scale-90 group-hover/premium-tooltip:scale-100 z-[310] flex items-center gap-2">
                {dotColor && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />}
                {label}
                {/* Pointer Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-[5px] border-x-transparent border-b-transparent border-t-slate-900/95" />
            </div>
        </div>
    );
};

export default PremiumTooltip;
