import React, { useState } from 'react';
import { X, Download, Monitor, CheckSquare, Square, FileText, Image, Edit3, FolderOpen, Globe, ChevronRight, ListTree } from 'lucide-react';
import type { Screen, ScreenSection } from '../types/screenDesign';

export type ExportFormat = 'png' | 'pdf' | 'ppt_beta' | 'json';

export interface ExportOptions {
    translateToMN?: boolean;
    /** 몽골어 PPT 시 좌측 엔티티(캔버스) 객체 텍스트 배율(%). 기본 100. 헤더·우측 패널·명세에는 적용되지 않습니다. */
    mnPptFontScalePercent?: number;
}

interface ScreenExportModalProps {
    screens: Screen[];
    sections: ScreenSection[]; // 🚀 추가됨: 부모로부터 섹션 데이터 받아오기
    onExport: (selectedIds: string[], format: ExportFormat, options?: ExportOptions) => void;
    onClose: () => void;
}

function getDescendantSectionIdList(sections: ScreenSection[], parentId: string): string[] {
    const children = sections.filter((s) => s.parentId === parentId).map((s) => s.id);
    let out = [...children];
    children.forEach((cid) => {
        out = [...out, ...getDescendantSectionIdList(sections, cid)];
    });
    return out;
}

function countScreensInSectionSubtree(
    sections: ScreenSection[],
    screens: Screen[],
    sectionId: string
): number {
    const allSectionIds = [sectionId, ...getDescendantSectionIdList(sections, sectionId)];
    return screens.filter((s) => s.sectionId && allSectionIds.includes(s.sectionId)).length;
}

const ScreenExportModal: React.FC<ScreenExportModalProps> = ({ screens, sections = [], onExport, onClose }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(screens.map(s => s.id)));
    const [format, setFormat] = useState<ExportFormat>('png');
    const [translateToMN, setTranslateToMN] = useState(false);
    const [mnPptFontScalePercent, setMnPptFontScalePercent] = useState(40);
    /** 섹션 id → true 이면 하위(자식 섹션·화면) 접힘 */
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
    /** 섹션 없음 블록 접힘 */
    const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);

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

    const sectionIds = new Set(sections.map((s) => s.id));
    const rootSections = sections.filter(s => !s.parentId || !sectionIds.has(s.parentId));

    const allTreeSectionIds = React.useMemo(() => {
        const sidSet = new Set(sections.map((s) => s.id));
        const roots = sections.filter((s) => !s.parentId || !sidSet.has(s.parentId));
        const ids: string[] = [];
        const walk = (sid: string) => {
            ids.push(sid);
            sections.filter((s) => s.parentId === sid).forEach((c) => walk(c.id));
        };
        roots.forEach((r) => walk(r.id));
        return ids;
    }, [sections]);

    const collapseAllSections = () => {
        const next: Record<string, boolean> = {};
        allTreeSectionIds.forEach((id) => {
            next[id] = true;
        });
        setCollapsedSections(next);
    };

    const expandAllSections = () => {
        setCollapsedSections({});
        setUngroupedCollapsed(false);
    };

    const toggleSectionCollapse = (sectionId: string) => {
        setCollapsedSections((prev) => ({
            ...prev,
            [sectionId]: !prev[sectionId],
        }));
    };

    const scrollToListAnchor = (elementId: string) => {
        requestAnimationFrame(() => {
            document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    /** 네비에서 섹션으로 이동할 때 해당 섹션과 상위 섹션을 펼침 */
    const expandPathToSection = (sectionId: string) => {
        const sidSet = new Set(sections.map((s) => s.id));
        const toExpand: string[] = [sectionId];
        let cur = sections.find((s) => s.id === sectionId);
        while (cur?.parentId && sidSet.has(cur.parentId)) {
            toExpand.push(cur.parentId);
            cur = sections.find((s) => s.id === cur.parentId);
        }
        setCollapsedSections((prev) => {
            const next = { ...prev };
            toExpand.forEach((id) => {
                delete next[id];
            });
            return next;
        });
    };

    const handleNavSectionClick = (sectionId: string) => {
        expandPathToSection(sectionId);
        scrollToListAnchor(`export-modal-anchor-section-${sectionId}`);
    };

    const handleNavUngroupedClick = () => {
        setUngroupedCollapsed(false);
        scrollToListAnchor('export-modal-anchor-ungrouped');
    };

    const handleExport = () => {
        if (selectedIds.size === 0) {
            alert('내보낼 화면을 선택해주세요.');
            return;
        }
        const clampPct = (n: number) => Math.min(200, Math.max(10, Number.isFinite(n) ? n : 100));
        onExport(Array.from(selectedIds), format, {
            translateToMN,
            mnPptFontScalePercent:
                format === 'ppt_beta' && translateToMN ? clampPct(mnPptFontScalePercent) : undefined,
        });
    };

    // 🚀 재귀적으로 섹션과 그 하위 항목들을 그리는 함수
    const renderSection = (section: ScreenSection) => {
        const childSections = sections.filter(s => s.parentId === section.id);
        const secScreens = screens.filter(s => s.sectionId === section.id);
        const isCollapsed = Boolean(collapsedSections[section.id]);
        
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

        const hasChildren = childSections.length > 0 || secScreens.length > 0;

        return (
            <div
                key={`section-${section.id}`}
                id={`export-modal-anchor-section-${section.id}`}
                className="space-y-1 scroll-mt-2"
            >
                <div
                    className={`flex items-stretch gap-0.5 rounded-lg border-2 transition-all ${
                        allSelected ? 'border-indigo-300 bg-indigo-50/50' : 'border-transparent hover:bg-gray-50'
                    }`}
                >
                    {hasChildren ? (
                        <button
                            type="button"
                            onClick={() => toggleSectionCollapse(section.id)}
                            className="shrink-0 px-1.5 py-2 rounded-l-md text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/60 transition-colors"
                            title={isCollapsed ? '섹션 펼치기' : '섹션 접기'}
                            aria-expanded={!isCollapsed}
                        >
                            <ChevronRight
                                size={16}
                                className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                            />
                        </button>
                    ) : (
                        <span className="shrink-0 w-7" aria-hidden />
                    )}
                    {/* 섹션 헤더 (클릭 시 일괄 체크/해제) */}
                    <button
                        type="button"
                        onClick={() => toggleSection(section.id)}
                        className="flex-1 flex items-center gap-2 py-2 pr-2 pl-0.5 min-w-0 text-left rounded-r-md"
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
                        <span className="ml-auto text-[10px] text-gray-400 font-medium shrink-0">{allScreenIds.length}개 항목</span>
                    </button>
                </div>

                {/* 섹션 내용물 (자식 섹션 & 자식 화면들) */}
                {!isCollapsed && (
                    <div className="pl-3 border-l-2 border-gray-100 ml-2 space-y-1 mt-1">
                        {childSections.map((child) => renderSection(child))}

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
                )}
            </div>
        );
    };

    const rootScreens = screens.filter(s => !s.sectionId);

    const renderNavSection = (section: ScreenSection, depth: number) => {
        const childSecs = sections.filter((s) => s.parentId === section.id);
        const cnt = countScreensInSectionSubtree(sections, screens, section.id);
        return (
            <div key={`nav-${section.id}`} className="min-w-0">
                <button
                    type="button"
                    onClick={() => handleNavSectionClick(section.id)}
                    className="w-full text-left rounded-lg px-2 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-white hover:shadow-sm border border-transparent hover:border-indigo-100 transition-all flex items-start gap-1.5 min-w-0"
                    style={{ paddingLeft: 6 + depth * 10 }}
                >
                    <FolderOpen size={12} className="shrink-0 mt-0.5 text-indigo-500" />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate leading-tight">{section.name || 'Section'}</span>
                        <span className="text-[10px] font-mono text-gray-400 tabular-nums">{cnt}화면</span>
                    </span>
                </button>
                {childSecs.map((c) => renderNavSection(c, depth + 1))}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '52rem' }}>
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

                {/* Select All + 트리 접기/펼치기 */}
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 shrink-0 flex flex-wrap items-center justify-between gap-2">
                    <button
                        type="button"
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
                    {sections.length > 0 && (
                        <div className="flex items-center gap-1 text-[11px] font-bold">
                            <button
                                type="button"
                                onClick={collapseAllSections}
                                disabled={allTreeSectionIds.length === 0}
                                className="px-2.5 py-1 rounded-lg text-gray-600 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-gray-200 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                            >
                                모두 접기
                            </button>
                            <span className="text-gray-300 select-none" aria-hidden>
                                |
                            </span>
                            <button
                                type="button"
                                onClick={expandAllSections}
                                className="px-2.5 py-1 rounded-lg text-gray-600 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-gray-200 transition-colors"
                            >
                                모두 펼치기
                            </button>
                        </div>
                    )}
                </div>

                {/* 목록 + 왼쪽 빠른 이동(요약 네비) */}
                <div className="flex-1 min-h-[200px] max-h-[400px] flex flex-col bg-gray-50/30 border-b border-gray-100">
                    {screens.length === 0 ? (
                        <div className="flex flex-col items-center justify-center flex-1 text-gray-400 text-sm py-10 px-4">
                            <Monitor size={32} className="opacity-20 mb-2" />
                            보낼 화면이 없습니다.
                        </div>
                    ) : (
                        <div className="flex flex-1 min-h-0">
                            <nav
                                className="w-[9.5rem] sm:w-44 shrink-0 border-r border-gray-200/90 bg-indigo-50/30 overflow-y-auto custom-scrollbar p-2.5 flex flex-col gap-1.5"
                                aria-label="보내기 목록 빠른 이동"
                            >
                                <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-1 border-b border-indigo-100/80 mb-0.5">
                                    <ListTree size={14} className="text-indigo-600 shrink-0" />
                                    <span className="text-[11px] font-black text-indigo-900/85 leading-tight">빠른 이동</span>
                                </div>
                                <div className="px-1.5 py-1 rounded-md bg-white/70 border border-indigo-100/60 text-[10px] text-gray-600 space-y-0.5">
                                    <div className="font-bold text-gray-800 tabular-nums">화면 {screens.length}개</div>
                                    <div className="tabular-nums text-indigo-700/90">선택 {selectedIds.size}개</div>
                                    {sections.length > 0 && (
                                        <div className="text-gray-500 tabular-nums">섹션 {sections.length}개</div>
                                    )}
                                </div>
                                <p className="text-[9px] text-gray-500 leading-snug px-1">
                                    항목을 누르면 오른쪽 목록으로 이동합니다.
                                </p>
                                {rootSections.length > 0 && (
                                    <div className="flex flex-col gap-0.5 min-h-0">{rootSections.map((s) => renderNavSection(s, 0))}</div>
                                )}
                                {rootScreens.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleNavUngroupedClick}
                                        className="w-full text-left rounded-lg px-2 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-white hover:shadow-sm border border-transparent hover:border-indigo-100 transition-all flex items-start gap-1.5 min-w-0 mt-1"
                                    >
                                        <Monitor size={12} className="shrink-0 mt-0.5 text-indigo-500" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate leading-tight">섹션 없음</span>
                                            <span className="text-[10px] font-mono text-gray-400 tabular-nums">{rootScreens.length}화면</span>
                                        </span>
                                    </button>
                                )}
                            </nav>
                            <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                                <div className="space-y-4">
                                    {rootSections.map((section) => renderSection(section))}

                                    {rootScreens.length > 0 && (
                                        <div id="export-modal-anchor-ungrouped" className="space-y-1 mt-4 scroll-mt-2">
                                            <div className="flex items-stretch gap-0.5 rounded-lg border border-transparent hover:bg-gray-50/80">
                                                <button
                                                    type="button"
                                                    onClick={() => setUngroupedCollapsed((v) => !v)}
                                                    className="shrink-0 px-1.5 py-1.5 rounded-l-md text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/60 transition-colors"
                                                    title={ungroupedCollapsed ? '섹션 없음 펼치기' : '섹션 없음 접기'}
                                                    aria-expanded={!ungroupedCollapsed}
                                                >
                                                    <ChevronRight
                                                        size={16}
                                                        className={`transition-transform ${ungroupedCollapsed ? '' : 'rotate-90'}`}
                                                    />
                                                </button>
                                                <div className="flex-1 flex items-center px-2 py-1.5 min-w-0">
                                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider truncate">
                                                        섹션 없음
                                                        <span className="ml-1.5 font-mono normal-case text-[10px] text-gray-400">
                                                            ({rootScreens.length})
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                            {!ungroupedCollapsed &&
                                                rootScreens.map((screen) => (
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
                            </div>
                        </div>
                    )}
                </div>

                {/* Format Selection */}
                <div className="px-6 py-3 border-t border-gray-100 flex gap-2 shrink-0 bg-white">
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

                {format === 'ppt_beta' && (
                    <div className="px-6 py-3 border-t border-gray-100 bg-purple-50/50 space-y-3 shrink-0">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <Globe size={18} className="text-purple-500 flex-shrink-0" />
                                <div className="min-w-0">
                                    <span className="text-sm font-bold text-gray-800 block">몽골어로 번역해서 보내기</span>
                                    <span className="text-xs text-gray-500">라벨 및 본문을 몽골어 사전으로 치환합니다.</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={translateToMN}
                                onClick={() => setTranslateToMN((v) => !v)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 ${translateToMN ? 'bg-purple-600' : 'bg-gray-300'}`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${translateToMN ? 'translate-x-6' : 'translate-x-1'}`}
                                />
                            </button>
                        </div>
                        {translateToMN && (
                            <div className="rounded-xl border border-purple-200/80 bg-white/80 px-3 py-2.5 space-y-1.5">
                                <label htmlFor="mn-ppt-font-scale" className="text-xs font-bold text-gray-700 block">
                                    캔버스(엔티티) 텍스트 배율 (%)
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        id="mn-ppt-font-scale"
                                        type="number"
                                        min={10}
                                        max={200}
                                        step={1}
                                        value={mnPptFontScalePercent}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value, 10);
                                            if (Number.isFinite(v)) setMnPptFontScalePercent(v);
                                        }}
                                        onBlur={() => {
                                            setMnPptFontScalePercent((p) =>
                                                Math.min(200, Math.max(10, Number.isFinite(p) ? p : 40))
                                            );
                                        }}
                                        className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-mono text-gray-800 tabular-nums"
                                    />
                                    <span className="text-xs text-gray-500 shrink-0">%</span>
                                </div>
                                <p className="text-[10px] text-gray-500 leading-snug">
                                    숫자만 입력합니다. 좌측 화면 설계 캔버스 안 도형·텍스트·테이블에만 적용되며, 상단 표·우측 패널·명세 PPT는 기본 크기를 유지합니다. 100은 변경 없음.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0 bg-white">
                    <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all active:scale-95">
                        취소
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={selectedIds.size === 0}
                        className={`px-5 py-2.5 text-white rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${format === 'ppt_beta' ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}
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
