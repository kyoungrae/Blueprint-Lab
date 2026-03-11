import React, { useState } from 'react';
import type { Screen } from '../../types/screenDesign';
import { X } from 'lucide-react';

interface MemoPanelProps {
    screen: Screen;
    isVisible: boolean;
    onClose: () => void;
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
}

export const MemoPanel: React.FC<MemoPanelProps> = ({
    screen,
    isVisible,
    onClose,
    update,
    syncUpdate,
}) => {
    const [memo, setMemo] = useState(screen.memo || '');

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setMemo(value);
        update({ memo: value });
    };

    const handleBlur = () => {
        syncUpdate({ memo });
    };

    if (!isVisible) return null;

    return (
        <div
            className="fixed top-0 right-0 w-80 h-full bg-white border-l border-gray-200 shadow-2xl z-[100] animate-in slide-in-from-right duration-300"
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
                <h3 className="text-sm font-bold text-gray-800">화면 메모</h3>
                <button
                    onClick={onClose}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                    title="닫기"
                >
                    <X size={16} />
                </button>
            </div>
            <div className="p-4">
                <textarea
                    value={memo}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="화면에 대한 메모를 작성하세요..."
                    className="w-full h-40 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    spellCheck={false}
                />
                <div className="mt-2 text-xs text-gray-500">
                    메모는 자동으로 저장됩니다.
                </div>
            </div>
        </div>
    );
};
