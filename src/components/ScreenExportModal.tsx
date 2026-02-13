import React, { useState } from 'react';
import { X, Download, Monitor, CheckSquare, Square } from 'lucide-react';
import type { Screen } from '../types/screenDesign';

interface ScreenExportModalProps {
    screens: Screen[];
    onExport: (selectedIds: string[]) => void;
    onClose: () => void;
}

const ScreenExportModal: React.FC<ScreenExportModalProps> = ({ screens, onExport, onClose }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(screens.map(s => s.id)));

    const toggleItem = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const toggleAll = () => {
        if (selectedIds.size === screens.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(screens.map(s => s.id)));
        }
    };

    const handleExport = () => {
        if (selectedIds.size === 0) {
            alert('내보낼 화면을 선택해주세요.');
            return;
        }
        onExport(Array.from(selectedIds));
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                            <Download size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900">이미지로 내보내기</h2>
                            <p className="text-xs text-gray-500">내보낼 화면을 선택하세요</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Select All */}
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
                    <button
                        onClick={toggleAll}
                        className="flex items-center gap-2 text-sm font-bold text-gray-700 hover:text-indigo-600 transition-colors"
                    >
                        {selectedIds.size === screens.length ? (
                            <CheckSquare size={18} className="text-indigo-500" />
                        ) : (
                            <Square size={18} className="text-gray-400" />
                        )}
                        전체 선택 ({selectedIds.size}/{screens.length})
                    </button>
                </div>

                {/* Screen List */}
                <div className="max-h-80 overflow-y-auto p-4 space-y-2">
                    {screens.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                            내보낼 화면이 없습니다.
                        </div>
                    ) : (
                        screens.map((screen) => (
                            <button
                                key={screen.id}
                                onClick={() => toggleItem(screen.id)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${selectedIds.has(screen.id)
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-gray-100 bg-white hover:border-gray-200'
                                    }`}
                            >
                                {selectedIds.has(screen.id) ? (
                                    <CheckSquare size={18} className="text-indigo-500 flex-shrink-0" />
                                ) : (
                                    <Square size={18} className="text-gray-300 flex-shrink-0" />
                                )}
                                <Monitor size={16} className="text-indigo-400 flex-shrink-0" />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-bold text-gray-800 truncate">{screen.name}</span>
                                    <span className="text-[10px] text-gray-400 font-mono">{screen.screenId}</span>
                                </div>
                                <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                                    {screen.fields.length}개 항목
                                </span>
                            </button>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all active:scale-95"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={selectedIds.size === 0}
                        className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200"
                    >
                        <div className="flex items-center gap-2">
                            <Download size={16} />
                            이미지 내보내기 ({selectedIds.size})
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScreenExportModal;
