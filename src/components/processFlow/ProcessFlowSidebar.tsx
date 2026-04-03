import React, { useState } from 'react';
import { useYjsStore } from '../../store/yjsStore';
import { Users, Search, ChevronRight, FolderOpen, X } from 'lucide-react';
import { useReactFlow } from 'reactflow';
import type { ProcessFlowNode, ProcessFlowSection } from '../../types/processFlow';

export interface ProcessFlowSidebarProps {
    /** 부모에서 전달 시 목록이 캔버스와 항상 동기화됨 (가져오기/히드레이션 직후에도 즉시 반영) */
    nodes?: ProcessFlowNode[];
    sections?: ProcessFlowSection[];
}

const ProcessFlowSidebar: React.FC<ProcessFlowSidebarProps> = (props) => {
    // 🚀 Yjs 스토어에서 실시간 동기화 데이터 가져오기
    const yjsNodes = useYjsStore((s: any) => s.pfNodes);
    const yjsSections = useYjsStore((s: any) => s.pfSections);
    const yjsUpdateSection = useYjsStore((s: any) => s.pfUpdateSection);
    const yjsDeleteSection = useYjsStore((s: any) => s.pfDeleteSection);
    const yjsUpdateNode = useYjsStore((s: any) => s.pfUpdateNode);
    
    // Yjs 스토어 우선 사용 (실시간 동기화)
    const nodes = props.nodes ?? yjsNodes;
    const sections = props.sections ?? yjsSections;
    const { fitView, setNodes } = useReactFlow();
    const [search, setSearch] = useState('');
    const [composing, setComposing] = useState<string | null>(null);
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [editingSectionName, setEditingSectionName] = useState('');
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
    const displaySearch = composing !== null ? composing : search;

    const filteredNodes = nodes.filter((n: ProcessFlowNode) =>
        (n.text ?? '').toLowerCase().includes(search.toLowerCase())
    );
    // 🚀 추가: 부모가 없는 '최상위 섹션'만 필터링합니다.
    const rootSections = sections.filter((s: ProcessFlowSection) => !s.parentId);
    
    const sectionIds = new Set(sections.map((sec: ProcessFlowSection) => sec.id));
    // 섹션 없음: sectionId가 없거나, 해당 섹션이 sections 목록에 없는 노드 (데이터 있어도 목록에 항상 표시)
    const rootNodes = filteredNodes.filter((n: ProcessFlowNode) => !n.sectionId || !sectionIds.has(n.sectionId));

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

    const startEditingSectionName = (section: ProcessFlowSection) => {
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
        if (window.confirm(`섹션 "${sectionName}"을(를) 삭제하시겠습니까?\n\n섹션에 속한 노드들은 "섹션 없음"으로 이동됩니다.`)) {
            // 🚀 Yjs 스토어 사용 (실시간 동기화)
            yjsDeleteSection(sectionId);
            
            // 🚀 섹션에 속했던 노드들의 sectionId를 undefined로 설정
            nodes.forEach((node: ProcessFlowNode) => {
                if (node.sectionId === sectionId) {
                    yjsUpdateNode(node.id, { sectionId: undefined });
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
    const renderSection = (section: ProcessFlowSection) => {
        // 이 섹션을 부모로 갖는 '자식 섹션'들을 찾습니다.
        const childSections = sections.filter((s: ProcessFlowSection) => s.parentId === section.id);
        // 이 섹션에 속한 '노드'들을 찾습니다.
        const secNodes = filteredNodes.filter((n: ProcessFlowNode) => n.sectionId === section.id);
        const isEditing = editingSectionId === section.id;
        const isCollapsed = collapsedSections[section.id] ?? false;
        
        const hasChildren = childSections.length > 0 || secNodes.length > 0;

        return (
            <div key={section.id} className="space-y-0.5">
                <div className="flex items-center gap-2 px-2 py-3 rounded-lg bg-gray-100/80 border border-gray-100 min-h-[32px]">
                    <button
                        type="button"
                        onClick={() => toggleSectionCollapse(section.id)}
                        className="p-0.5 rounded hover:bg-emerald-100 text-gray-500 hover:text-emerald-600 transition-colors flex items-center justify-center shrink-0"
                        title={isCollapsed ? '섹션 펼치기' : '섹션 접기'}
                    >
                        <ChevronRight
                            size={12}
                            className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                        />
                    </button>
                    <FolderOpen size={14} className="text-emerald-500 shrink-0" />
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
                            className="flex-1 min-w-0 text-xs font-bold text-gray-700 bg-white border border-emerald-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-emerald-400"
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
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            type="button"
                            onClick={() => handleDeleteSection(section.id, section.name ?? 'Section')}
                            className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                            title="섹션 삭제"
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>

                {/* 자식 섹션 또는 노드들 */}
                {hasChildren && !isCollapsed && (
                    <div className="ml-4 space-y-0.5">
                        {childSections.map(renderSection)}
                        {secNodes.map((node: ProcessFlowNode) => (
                            <div
                                key={node.id}
                                onMouseDown={(e) => handleFocusNode(e, node.id)}
                                className="flex items-center gap-2 px-2 py-2 rounded-md bg-white border border-gray-100 hover:bg-emerald-50 hover:border-emerald-200 transition-colors cursor-pointer group"
                            >
                                <Users size={14} className="text-emerald-600 shrink-0" />
                                <span className="text-xs text-gray-700 truncate flex-1 min-w-0">
                                    {node.text ?? (node.type === 'USER' ? 'User' : 'Node')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-full h-full flex flex-col bg-white">
            {/* Search */}
            <div className="p-3 border-b border-gray-100">
                <div className="relative">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="노드 검색..."
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
                            setComposing(null);
                            setSearch((e.target as HTMLInputElement).value);
                        }}
                        className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 transition-all"
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {/* Root Nodes (섹션 없음) */}
                {rootNodes.length > 0 && (
                    <div className="space-y-0.5">
                        <div className="px-2 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider">섹션 없음</div>
                        {rootNodes.map((node: ProcessFlowNode) => (
                            <div
                                key={node.id}
                                onMouseDown={(e) => handleFocusNode(e, node.id)}
                                className="flex items-center gap-2 px-2 py-2 rounded-md bg-white border border-gray-100 hover:bg-emerald-50 hover:border-emerald-200 transition-colors cursor-pointer group"
                            >
                                <Users size={14} className="text-emerald-600 shrink-0" />
                                <span className="text-xs text-gray-700 truncate flex-1 min-w-0">
                                    {node.text ?? (node.type === 'USER' ? 'User' : 'Node')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Sections Tree */}
                {rootSections.length > 0 && (
                    <div className="space-y-0.5">
                        <div className="px-2 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider">섹션</div>
                        {rootSections.map(renderSection)}
                    </div>
                )}

                {/* Empty State */}
                {rootNodes.length === 0 && rootSections.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                        <Users size={24} className="mb-2" />
                        <div className="text-xs">노드가 없습니다</div>
                        <div className="text-xs">툴바에서 노드를 추가해보세요</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProcessFlowSidebar;
