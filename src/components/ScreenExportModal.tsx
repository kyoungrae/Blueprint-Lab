import React, { useState } from 'react';
import { X, Download, Monitor, CheckSquare, Square, FileText, Image, Edit3, FolderOpen } from 'lucide-react';
import type { Screen, ScreenSection } from '../types/screenDesign';

export type ExportFormat = 'png' | 'pdf' | 'ppt_beta' | 'json';

interface ScreenExportModalProps {
    screens: Screen[];
    sections: ScreenSection[]; // 🚀 추가됨: 부모로부터 섹션 데이터 받아오기
    onExport: (selectedIds: string[], format: ExportFormat) => void;
    onClose: () => void;
}

const ScreenExportModal: React.FC<ScreenExportModalProps> = ({ screens, sections = [], onExport, onClose }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(screens.map(s => s.id)));
    const [format, setFormat] = useState<ExportFormat>('png');

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

    // 🚀 섹션 단위 일괄 토글 (섹션 및 모든 하위 섹션에 포함된 화면들 제어)
    const toggleSection = (sectionId: string) => {
        // 해당 섹션의 모든 하위 자식(손자 포함) 섹션 ID 찾기
        const getDescendantSectionIds = (parentId: string): string[] => {
            const children = sections.filter(s => s.parentId === parentId).map(s => s.id);
            let descendants = [...children];
            children.forEach(childId => {
                descendants = [...descendants, ...getDescendantSectionIds(childId)];
            });
            return descendants;
        };

        const targetSectionIds = [sectionId, ...getDescendantSectionIds(sectionId)];
        const targetScreenIds = screens.filter(s => s.sectionId && targetSectionIds.includes(s.sectionId)).map(s => s.id);

        if (targetScreenIds.length === 0) return;

        const next = new Set(selectedIds);
        // 타겟 화면들이 모두 선택되어 있는지 확인
        const allSelected = targetScreenIds.every(id => next.has(id));

        if (allSelected) {
            // 모두 선택되어 있으면 전부 해제
            targetScreenIds.forEach(id => next.delete(id));
        } else {
            // 하나라도 선택 안 된게 있으면 전부 선택
            targetScreenIds.forEach(id => next.add(id));
        }
        setSelectedIds(next);
    };

    const handleExport = (exportFormat?: ExportFormat) => {
        if (selectedIds.size === 0) {
            alert('내보낼 화면을 선택해주세요.');
            return;
        }
        onExport(Array.from(selectedIds), exportFormat ?? format);
    };

    // 🚀 재귀적으로 섹션과 그 하위 항목들을 그리는 함수
    const renderSection = (section: ScreenSection, depth: number = 0) => {
        const childSections = sections.filter(s => s.parentId === section.id);
        const secScreens = screens.filter(s => s.sectionId === section.id);
        
        // 이 섹션(하위 포함)에 속한 모든 화면 ID (체크 상태 확인용)
        const getDescendantSectionIds = (parentId: string): string[] => {
            const children = sections.filter(s => s.parentId === parentId).map(s => s.id);
            let descendants = [...children];
            children.forEach(childId => {
                descendants = [...descendants, ...getDescendantSectionIds(childId)];
            });
            return descendants;
        };
        const allSectionIds = [section.id, ...getDescendantSectionIds(section.id)];
        const allScreenIds = screens.filter(s => s.sectionId && allSectionIds.includes(s.sectionId)).map(s => s.id);
        
        // 이 섹션 아래에 하나라도 화면이 있는지
        const hasAnyScreen = allScreenIds.length > 0;
        // 모두 선택되었는지
        const allSelected = hasAnyScreen && allScreenIds.every(id => selectedIds.has(id));
        // 일부만 선택되었는지
        const someSelected = hasAnyScreen && !allSelected && allScreenIds.some(id => selectedIds.has(id));

        return (
            <div key={`section-${section.id}`} className="space-y-1">
                {/* 섹션 헤더 (클릭 시 일괄 체크/해제) */}
                <button
                    onClick={() => toggleSection(section.id)}
                    className={`w-full flex items-center gap-2 p-2 rounded-lg border-2 transition-all text-left ${
                        allSelected ? 'border-indigo-300 bg-indigo-50/50' : 'border-transparent hover:bg-gray-50'
                    }`}
                >
                    {allSelected ? (
                        <CheckSquare size={16} className="text-indigo-500 flex-shrink-0" />
                    ) : someSelected ? (
                        <div className="w-4 h-4 rounded border-2 border-indigo-500 bg-indigo-500 flex items-center justify-center flex-shrink-0">
                            <div className="w-2 h-0.5 bg-white rounded-full" />
                        </div>
                    ) : (
                        <Square size={16} className="text-gray-300 flex-shrink-0" />
                    )}
                    <FolderOpen size={16} className="text-indigo-500 flex-shrink-0" />
                    <span className="text-sm font-bold text-gray-700 truncate">{section.name || 'Section'}</span>
                    <span className="ml-auto text-[10px] text-gray-400 font-medium">{allScreenIds.length}개 항목</span>
                </button>

                {/* 섹션 내용물 (자식 섹션 & 자식 화면들) */}
                <div className="pl-3 border-l-2 border-gray-100 ml-2 space-y-1 mt-1">
                    {childSections.map(child => renderSection(child, depth + 1))}
                    
                    {secScreens.map(screen => (
                        <button
                            key={screen.id}
                            onClick={() => toggleItem(screen.id)}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl border-2 transition-all text-left ${
                                selectedIds.has(screen.id)
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-gray-100 bg-white hover:border-gray-200'
                            }`}
                        >
                            {selectedIds.has(screen.id) ? (
                                <CheckSquare size={16} className="text-indigo-500 flex-shrink-0" />
                            ) : (
                                <Square size={16} className="text-gray-300 flex-shrink-0" />
                            )}
                            <Monitor size={14} className="text-indigo-400 flex-shrink-0" />
                            <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-sm font-bold text-gray-800 truncate">{screen.name}</span>
                                <span className="text-[10px] text-gray-400 font-mono">{screen.screenId}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    // 최상위 섹션 및 섹션 없는 화면들 추출
    const rootSections = sections.filter(s => !s.parentId);
    const rootScreens = screens.filter(s => !s.sectionId);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()} style={{maxWidth:'40rem'}}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                            <Download size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-gray-900">내보내기</h2>
                            <p className="text-xs text-gray-500">내보낼 화면과 형식을 선택하세요</p>
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
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
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

                {/* 🚀 Screen List (트리 구조로 변경) */}
                <div className="flex-1 min-h-[200px] max-h-[400px] overflow-y-auto p-4 space-y-2 custom-scrollbar bg-gray-50/30">
                    {screens.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm py-10">
                            <Monitor size={32} className="opacity-20 mb-2" />
                            내보낼 화면이 없습니다.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* 1. 최상위 섹션들 렌더링 */}
                            {rootSections.map(section => renderSection(section))}
                            
                            {/* 2. 섹션에 속하지 않은 화면들 렌더링 */}
                            {rootScreens.length > 0 && (
                                <div className="space-y-1 mt-4">
                                    {sections.length > 0 && (
                                        <div className="px-2 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                            섹션 없음
                                        </div>
                                    )}
                                    {rootScreens.map(screen => (
                                        <button
                                            key={screen.id}
                                            onClick={() => toggleItem(screen.id)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                                                selectedIds.has(screen.id)
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
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <span className="text-sm font-bold text-gray-800 truncate">{screen.name}</span>
                                                <span className="text-[10px] text-gray-400 font-mono">{screen.screenId}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Format Selection */}
                <div className="px-6 py-3 border-t border-gray-100 flex gap-2 shrink-0">
                    <button
                        onClick={() => setFormat('png')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${format === 'png' ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300' : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'}`}
                    >
                        <Image size={18} />
                        PNG
                    </button>
                    <button
                        onClick={() => setFormat('pdf')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${format === 'pdf' ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300' : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'}`}
                    >
                        <FileText size={18} />
                        PDF
                    </button>
                    <button
                        onClick={() => setFormat('ppt_beta')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${format === 'ppt_beta' ? 'bg-purple-100 text-purple-700 border-2 border-purple-300' : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'}`}
                    >
                        <Edit3 size={18} />
                        PPT_BETA
                    </button>
                    <button
                        onClick={() => setFormat('json')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${format === 'json' ? 'bg-blue-100 text-blue-700 border-2 border-blue-300' : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'}`}
                    >
                        <FileText size={18} />
                        데이터(JSON)
                    </button>
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
                        onClick={() => handleExport()}
                        disabled={selectedIds.size === 0}
                        className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200"
                    >
                        <div className="flex items-center gap-2">
                            <Download size={16} />
                            {format === 'png' ? 'PNG 내보내기' : format === 'pdf' ? 'PDF 내보내기' : format === 'ppt_beta' ? 'PPT_BETA 내보내기' : '데이터(JSON) 내보내기'} ({selectedIds.size})
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScreenExportModal;
