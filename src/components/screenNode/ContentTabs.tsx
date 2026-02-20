import React from 'react';
import { Pencil, Image as ImageIcon } from 'lucide-react';

interface ContentTabsProps {
    contentMode: 'IMAGE' | 'DRAW';
    isLocked: boolean;
    onTabChange: (mode: 'IMAGE' | 'DRAW') => void;
}

const ContentTabs: React.FC<ContentTabsProps> = ({ contentMode, isLocked, onTabChange }) => {
    if (isLocked) return null;

    return (
        <div className="flex bg-gray-50/50 border-b border-gray-200">
            <button
                onClick={() => onTabChange('DRAW')}
                onMouseDown={(e) => e.stopPropagation()}
                className={`flex-1 py-2 text-[11px] font-bold flex items-center justify-center gap-2 transition-all ${contentMode === 'DRAW'
                    ? 'bg-white text-[#2c3e7c] border-b-2 border-[#2c3e7c] shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                    }`}
            >
                <Pencil size={14} />
                직접 그리기
            </button>
            <button
                onClick={() => onTabChange('IMAGE')}
                onMouseDown={(e) => e.stopPropagation()}
                className={`flex-1 py-2 text-[11px] font-bold flex items-center justify-center gap-2 transition-all ${contentMode === 'IMAGE'
                    ? 'bg-white text-[#2c3e7c] border-b-2 border-[#2c3e7c] shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                    }`}
            >
                <ImageIcon size={14} />
                이미지 업로드
            </button>
        </div>
    );
};

export default ContentTabs;
