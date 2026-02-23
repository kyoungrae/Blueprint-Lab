import React, { useState } from 'react';
import { X, Monitor, RectangleHorizontal, RectangleVertical } from 'lucide-react';
import type { PageSizeOption, PageOrientation } from '../types/screenDesign';
import { PAGE_SIZE_OPTIONS, PAGE_SIZE_DIMENSIONS_MM } from '../types/screenDesign';

interface AddScreenModalProps {
    onConfirm: (pageSize: PageSizeOption, pageOrientation: PageOrientation) => void;
    onClose: () => void;
}

const AddScreenModal: React.FC<AddScreenModalProps> = ({ onConfirm, onClose }) => {
    const [pageSize, setPageSize] = useState<PageSizeOption>('A4');
    const [pageOrientation, setPageOrientation] = useState<PageOrientation>('portrait');

    const handleConfirm = () => {
        onConfirm(pageSize, pageOrientation);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-100 rounded-xl text-violet-600">
                            <Monitor size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900">화면 추가</h2>
                            <p className="text-xs text-gray-500">화면 엔티티 크기와 방향을 선택하세요</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Size Selection */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">용지 크기</label>
                    <div className="flex flex-wrap gap-2">
                        {PAGE_SIZE_OPTIONS.map((size) => {
                            const dim = PAGE_SIZE_DIMENSIONS_MM[size];
                            const labelW = pageOrientation === 'portrait' ? dim.w : dim.h;
                            const labelH = pageOrientation === 'portrait' ? dim.h : dim.w;
                            return (
                                <button
                                    key={size}
                                    onClick={() => setPageSize(size)}
                                    className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex flex-col items-center gap-0.5 ${
                                        pageSize === size
                                            ? 'bg-violet-600 text-white shadow-md'
                                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                                    }`}
                                >
                                    <span>{size}</span>
                                    <span className={`text-[10px] font-normal ${pageSize === size ? 'text-white/90' : 'text-gray-400'}`}>
                                        {labelW} × {labelH} mm
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Orientation Selection */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">방향</label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPageOrientation('portrait')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                                pageOrientation === 'portrait'
                                    ? 'bg-violet-600 text-white shadow-md'
                                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                        >
                            <RectangleVertical size={20} />
                            세로
                        </button>
                        <button
                            onClick={() => setPageOrientation('landscape')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                                pageOrientation === 'landscape'
                                    ? 'bg-violet-600 text-white shadow-md'
                                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                        >
                            <RectangleHorizontal size={20} />
                            가로
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl font-bold text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2.5 rounded-xl font-bold text-sm bg-violet-600 text-white hover:bg-violet-700 shadow-md transition-colors"
                    >
                        추가
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddScreenModal;
