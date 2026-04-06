import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const getPanelPortalRoot = () => document.getElementById('panel-portal-root') || document.body;

export interface ErdTableColumnRow {
    nameEn: string;
    nameKr: string;
    dataType: string;
    length: string;
}

export interface ErdTableDetailPanelProps {
    open: boolean;
    onClose: () => void;
    tableNameEn: string;
    tableNameKr: string;
    columns: ErdTableColumnRow[];
}

/**
 * 연결 ERD 테이블의 컬럼(영문·한글·타입·길이) 목록 모달.
 */
const ErdTableDetailPanel: React.FC<ErdTableDetailPanelProps> = ({
    open,
    onClose,
    tableNameEn,
    tableNameKr,
    columns,
}) => {
    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9100] flex items-center justify-center p-4 bg-black/40"
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div
                className="nodrag nopan bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-gray-900 truncate">테이블 상세</h2>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                            <span className="font-mono font-semibold text-gray-700">{tableNameEn}</span>
                            {tableNameKr ? <span className="ml-2 text-gray-500">{tableNameKr}</span> : null}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                        aria-label="닫기"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-auto p-3">
                    {columns.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-8">컬럼 정보가 없습니다.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-left text-[11px]">
                                <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                                    <tr>
                                        <th className="px-3 py-2 whitespace-nowrap">컬럼명(영문)</th>
                                        <th className="px-3 py-2 whitespace-nowrap">컬럼명(한글)</th>
                                        <th className="px-3 py-2 whitespace-nowrap">데이터 타입</th>
                                        <th className="px-3 py-2 whitespace-nowrap">길이</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {columns.map((row, i) => (
                                        <tr key={`${row.nameEn}-${i}`} className="hover:bg-gray-50/80">
                                            <td className="px-3 py-2 font-mono text-gray-800">{row.nameEn}</td>
                                            <td className="px-3 py-2 text-gray-600">{row.nameKr || '—'}</td>
                                            <td className="px-3 py-2 text-gray-700">{row.dataType || '—'}</td>
                                            <td className="px-3 py-2 text-gray-600">{row.length || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        getPanelPortalRoot(),
    );
};

export default ErdTableDetailPanel;
