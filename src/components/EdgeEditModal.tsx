import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Relationship } from '../types/erd';

interface EdgeEditModalProps {
    relationship: Relationship;
    sourceEntityName: string;
    targetEntityName: string;
    onSave: (updatedRelationship: Relationship) => void;
    onDelete: () => void;
    onClose: () => void;
}

const EdgeEditModal: React.FC<EdgeEditModalProps> = ({
    relationship,
    sourceEntityName,
    targetEntityName,
    onSave,
    onDelete,
    onClose,
}) => {
    const [type, setType] = useState<'1:1' | '1:N' | 'N:M'>(relationship.type);

    const handleSave = () => {
        onSave({
            ...relationship,
            type,
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-lg font-bold text-gray-800">관계 편집</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-gray-600 border border-transparent hover:border-gray-200"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                        <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-2">연결 정보</div>
                        <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                            <span>{sourceEntityName}</span>
                            <span className="text-gray-400">→</span>
                            <span>{targetEntityName}</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                            관계 유형
                        </label>
                        <div className="space-y-2">
                            {(['1:1', '1:N', 'N:M'] as const).map((relType) => (
                                <label
                                    key={relType}
                                    className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${type === relType
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="relationship-type"
                                        value={relType}
                                        checked={type === relType}
                                        onChange={(e) => setType(e.target.value as '1:1' | '1:N' | 'N:M')}
                                        className="w-4 h-4 text-blue-500"
                                    />
                                    <span className="ml-3 font-medium text-gray-800">
                                        {relType}
                                    </span>
                                    <span className="ml-auto text-xs text-gray-400 font-medium">
                                        {relType === '1:1' && '일대일 (1:1)'}
                                        {relType === '1:N' && '일대다 (1:N)'}
                                        {relType === 'N:M' && '다대다 (N:M)'}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <button
                        onClick={onDelete}
                        className="px-4 py-2 text-sm bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-all font-semibold active:scale-95"
                    >
                        관계 삭제
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-all font-semibold active:scale-95"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold shadow-md hover:shadow-lg active:scale-95"
                        >
                            저장
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EdgeEditModal;
