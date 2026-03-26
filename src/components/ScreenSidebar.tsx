import React, { useState } from 'react';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useYjsStore } from '../store/yjsStore';
import { Monitor, Search, ChevronRight, Focus, FolderOpen, X } from 'lucide-react';
import { getImageDisplayUrl } from '../utils/imageUrl';
import { useReactFlow } from 'reactflow';
import type { Screen, ScreenSection } from '../types/screenDesign';

export interface ScreenSidebarProps {
    /** 부모에서 전달 시 목록이 캔버스와 항상 동기화됨 (가져오기/히드레이션 직후에도 즉시 반영) */
    screens?: Screen[];
    sections?: ScreenSection[];
}

const ScreenSidebar: React.FC<ScreenSidebarProps> = (props) => {
    // 목록은 스토어를 선택자로 직접 구독해, 히드레이션/가져오기/추가 시 항상 갱신되도록 함
    const storeScreens = useScreenDesignStore((s) => s.screens);
    const storeSections = useScreenDesignStore((s) => s.sections);
    
    // 🚀 Yjs 스토어에서 실시간 동기화 데이터 가져오기
    const yjsScreens = useYjsStore((s) => s.screens);
    const yjsSections = useYjsStore((s) => s.sections);
    const yjsUpdateSection = useYjsStore((s) => s.updateSection);
    const yjsDeleteSection = useYjsStore((s) => s.deleteSection);
    const yjsUpdateScreen = useYjsStore((s) => s.updateScreen);
    
    // Yjs 스토어 우선 사용 (실시간 동기화)
    const screens = props.screens ?? yjsScreens.length > 0 ? yjsScreens : storeScreens;
    const sections = props.sections ?? yjsSections.length > 0 ? yjsSections : storeSections;
    const { fitView, setNodes } = useReactFlow();
    const [search, setSearch] = useState('');
    const [composing, setComposing] = useState<string | null>(null);
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [editingSectionName, setEditingSectionName] = useState('');
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
    const displaySearch = composing !== null ? composing : search;

    const filteredScreens = screens.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.screenId.toLowerCase().includes(search.toLowerCase())
    );
    // 🚀 추가: 부모가 없는 '최상위 섹션'만 필터링합니다.
    const rootSections = sections.filter((s) => !s.parentId);
    
    const sectionIds = new Set(sections.map((sec) => sec.id));
    // 섹션 없음: sectionId가 없거나, 해당 섹션이 sections 목록에 없는 화면 (데이터 있어도 목록에 항상 표시)
    const rootScreens = filteredScreens.filter((s) => !s.sectionId || !sectionIds.has(s.sectionId));

    const handleFocusNode = (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        e.preventDefault();

        fitView({
            nodes: [{ id: nodeId }],
            duration: 800,
            padding: 0.5,
        });

        setNodes((nodes) =>
            nodes.map((node) => ({
                ...node,
                selected: node.id === nodeId
            }))
        );
    };

    const startEditingSectionName = (section: ScreenSection) => {
        setEditingSectionId(section.id);
        setEditingSectionName(section.name ?? 'Section');
    };

    const saveSectionName = (sectionId: string) => {
        if (editingSectionId !== sectionId) return;
        const name = editingSectionName.trim() || 'Section';
        // 🚀 Yjs 스토어 사용 (실시간 동기화)
        yjsUpdateSection(sectionId, { name });
        setEditingSectionId(null);
        setEditingSectionName('');
    };

    const handleDeleteSection = (sectionId: string, sectionName: string) => {
        if (window.confirm(`섹션 "${sectionName}"을(를) 삭제하시겠습니까?\n\n섹션에 속한 화면들은 "섹션 없음"으로 이동됩니다.`)) {
            // 🚀 Yjs 스토어 사용 (실시간 동기화)
            yjsDeleteSection(sectionId);
            
            // 🚀 섹션에 속했던 화면들의 sectionId를 undefined로 설정
            screens.forEach((screen) => {
                if (screen.sectionId === sectionId) {
                    yjsUpdateScreen(screen.id, { sectionId: undefined });
                }
            });
        }
    };

    const toggleSectionCollapse = (sectionId: string) => {
        setCollapsedSections((prev) => ({
            ...prev,
            [sectionId]: !prev[sectionId],
        }));
    };

    // 🚀 핵심 변경: 섹션을 그리는 로직을 재귀 함수로 분리했습니다.
    const renderSection = (section: ScreenSection) => {
        // 이 섹션을 부모로 갖는 '자식 섹션'들을 찾습니다.
        const childSections = sections.filter(s => s.parentId === section.id);
        // 이 섹션에 속한 '화면'들을 찾습니다.
        const secScreens = filteredScreens.filter((s) => s.sectionId === section.id);
        const isEditing = editingSectionId === section.id;
        const isCollapsed = collapsedSections[section.id] ?? false;
        
        const hasChildren = childSections.length > 0 || secScreens.length > 0;

        return (
            <div key={section.id} className="space-y-0.5">
                <div className="flex items-center gap-2 px-2 py-3 rounded-lg bg-gray-100/80 border border-gray-100 min-h-[32px]">
                    <button
                        type="button"
                        onClick={() => toggleSectionCollapse(section.id)}
                        className="p-0.5 rounded hover:bg-violet-100 text-gray-500 hover:text-violet-600 transition-colors flex items-center justify-center shrink-0"
                        title={isCollapsed ? '섹션 펼치기' : '섹션 접기'}
                    >
                        <ChevronRight
                            size={12}
                            className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                        />
                    </button>
                    <FolderOpen size={14} className="text-violet-500 shrink-0" />
                    {isEditing ? (
                        <input
                            type="text"
                            value={editingSectionName}
                            onChange={(e) => setEditingSectionName(e.target.value)}
                            onBlur={() => saveSectionName(section.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') saveSectionName(section.id);
                                if (e.key === 'Escape') {
                                    setEditingSectionId(null);
                                    setEditingSectionName('');
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 min-w-0 text-xs font-bold text-gray-700 bg-white border border-violet-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-violet-400"
                            autoFocus
                        />
                    ) : (
                        <span
                            className="text-xs font-bold text-gray-600 truncate flex-1 min-w-0 cursor-text"
                            onDoubleClick={() => startEditingSectionName(section)}
                            title="더블클릭하여 제목 수정"
                        >
                            {section.name ?? 'Section'}
                        </span>
                    )}
                    {!isEditing && (
                        <div className="flex items-center gap-2 ml-auto">
                            <span className="text-[10px] text-gray-400 shrink-0">{secScreens.length}</span>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSection(section.id, section.name ?? 'Section');
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-gray-500 hover:text-red-600 transition-colors shrink-0"
                                title="섹션 삭제"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </div>
                
                {/* 자식 섹션이나 화면이 있다면 들여쓰기(border-l, pl-3)를 적용하여 안쪽에 렌더링합니다 */}
                {hasChildren && !isCollapsed && (
                    <div className="pl-3 border-l border-gray-200 ml-2 space-y-0.5">
                        {/* 1. 자식 섹션 렌더링 (재귀 호출) */}
                        {childSections.map(child => renderSection(child))}
                        
                        {/* 2. 현재 섹션에 속한 화면 렌더링 */}
                        {secScreens.map((screen) => renderScreenItem(screen))}
                    </div>
                )}
            </div>
        );
    };

    const renderScreenItem = (screen: Screen) => {
        const screenType = (screen.screenType || '').trim().toLowerCase();
        const screenTypeBadgeClassMap: Record<string, string> = {
            '조회': 'bg-[#3b82f6] text-white',      // 연결선과 동일한 블루 계열
            '신청': 'bg-indigo-500 text-white',
            '등록': 'bg-cyan-500 text-white',
            '수정': 'bg-emerald-500 text-white',
            '삭제': 'bg-rose-500 text-white',
            '관리': 'bg-violet-500 text-white',
            '팝업': 'bg-yellow-400 text-gray-900',
            '대시보드': 'bg-amber-500 text-white',
            '로그인': 'bg-teal-500 text-white',
            '기타': 'bg-slate-500 text-white',
            // 호환용 별칭
            'popup': 'bg-yellow-400 text-gray-900',
            '팝업창': 'bg-yellow-400 text-gray-900',
        };
        const screenTypeBadgeClass = screenTypeBadgeClassMap[screenType] || 'bg-[#3b82f6] text-white';

        return (
        <div key={screen.id} className="group/item flex items-stretch gap-0.5">
            <details className="group min-w-0 flex-1">
                <summary className="list-none flex items-center gap-2 p-2 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors group/summary">
                    <ChevronRight size={14} className="text-gray-400 group-open:rotate-90 transition-transform shrink-0" />
                    {screen.imageUrl ? (
                        <div className="w-8 h-8 rounded border border-gray-200 overflow-hidden flex-shrink-0 bg-white">
                            <img src={getImageDisplayUrl(screen.imageUrl)} className="w-full h-full object-cover" alt="thumb" />
                        </div>
                    ) : (
                        <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-300">
                            <Monitor size={14} />
                        </div>
                    )}
                    <div className="flex flex-col min-w-0 flex-1 ml-1">
                        <span className="text-sm font-semibold text-gray-700 truncate leading-tight">{screen.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono truncate leading-tight">{screen.screenId}</span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${screenTypeBadgeClass}`}>
                        {screen.screenType}
                    </span>
                </summary>
                <div className="pl-8 pr-2 py-2 space-y-1.5 border-l border-gray-100 ml-4 mb-2 mt-1">
                    <div className="text-[10px] text-gray-400 space-y-0.5">
                        <div>작성자: <span className="text-gray-600">{screen.author || '-'}</span></div>
                        <div>작성일: <span className="text-gray-600 font-mono">{screen.createdDate || '-'}</span></div>
                    </div>
                    {screen.fields.length > 0 && (
                        <div className="pt-1 border-t border-gray-100 space-y-1">
                            <div className="text-[9px] font-bold text-gray-400 uppercase">기능 항목 ({screen.fields.length})</div>
                            {screen.fields.map(field => (
                                <div key={field.id} className="flex items-center justify-between text-[11px]">
                                    <div className="flex items-center gap-1.5 text-gray-600">
                                        <div className="w-3.5 h-3.5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[8px] font-black flex-shrink-0">
                                            {field.no}
                                        </div>
                                        <span>{field.name || '(미입력)'}</span>
                                    </div>
                                    <span className="text-gray-400 font-mono text-[9px]">{field.fieldType}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </details>
            <button
                type="button"
                onClick={(e) => handleFocusNode(e, screen.id)}
                className="shrink-0 self-center p-1.5 hover:bg-blue-100 rounded text-[#2c3e7c] transition-all active:scale-90"
                title="화면 위치로 이동"
            >
                <Focus size={14} />
            </button>
        </div>
    );
    };

    return (
        <div className="w-full min-w-0 h-full bg-white flex flex-col z-20 overflow-hidden">
            {/* Sidebar Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-[#2c3e7c] rounded-lg text-white">
                        <Monitor size={18} />
                    </div>
                    <h2 className="text-lg font-bold text-gray-800 tracking-tight">화면 목록</h2>
                    <span className="ml-auto bg-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {screens.length}
                    </span>
                </div>

                {/* Search Bar */}
                <div className="relative group">
                    <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#2c3e7c] transition-colors"
                    />
                    <input
                        type="text"
                        placeholder="화면 ID / 이름 검색..."
                        value={displaySearch}
                        onChange={(e) => {
                            const v = e.target.value;
                            if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                setComposing(v);
                                return;
                            }
                            setComposing(null);
                            setSearch(v);
                        }}
                        onCompositionEnd={(e) => {
                            const v = (e.target as HTMLInputElement).value;
                            setComposing(null);
                            setSearch(v);
                        }}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#2c3e7c]/20 focus:border-[#2c3e7c] outline-none transition-all"
                    />
                </div>
            </div>

            {/* Screen List (섹션별 + 섹션 없음) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {filteredScreens.length === 0 && sections.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="p-3 bg-gray-50 rounded-full text-gray-300 mb-2">
                            <Search size={24} />
                        </div>
                        <p className="text-sm text-gray-400">화면을 찾을 수 없습니다</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* 🚀 변경: 전체 sections가 아닌, rootSections만 먼저 렌더링합니다 */}
                        {rootSections.map((section) => renderSection(section))}
                        
                        {rootScreens.length > 0 && (
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2 px-2 py-1 text-gray-500">
                                    <span className="text-[10px] font-bold uppercase">섹션 없음</span>
                                </div>
                                {rootScreens.map((screen) => renderScreenItem(screen))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Sidebar Footer */}
            <div className="mt-auto p-4 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <span>© 2026 Blueprint Lab</span>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-[#2c3e7c] rounded-full animate-pulse" />
                        화면 설계서
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScreenSidebar;
