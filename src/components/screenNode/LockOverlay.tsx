import React from 'react';
import { Lock } from 'lucide-react';

interface LockOverlayProps {
    isLocked: boolean;
    isLockedByOther: boolean;
    lockedBy: string | null | undefined;
    onDoubleClick?: (e?: React.MouseEvent) => void;
}

/** 잠금 시 표시되는 오버레이 - 더블클릭으로 편집 모드 진입 */
export const LockOverlay: React.FC<LockOverlayProps> = ({
    isLocked,
    isLockedByOther,
    lockedBy,
    onDoubleClick,
}) => {
    if (!isLocked) return null;

    return (
        <div
            onDoubleClick={!isLockedByOther ? onDoubleClick : undefined}
            className="absolute inset-0 z-[100] cursor-pointer group/mask hover:bg-white/10 transition-all duration-300 rounded-[inherit]"
        >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-sm px-4 py-3 rounded-2xl shadow-2xl border border-gray-200 opacity-0 group-hover/mask:opacity-100 transition-all transform scale-90 group-hover/mask:scale-100 flex flex-col items-center gap-1.5 pointer-events-none">
                <Lock size={20} className={isLockedByOther ? 'text-amber-500' : 'text-gray-400'} />
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    {isLockedByOther ? `${lockedBy}님이 수정 중` : 'Double Click to Edit'}
                </span>
            </div>
        </div>
    );
};
