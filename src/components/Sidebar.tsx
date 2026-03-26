import React, { useState } from 'react';
import { useERDStore } from '../store/erdStore';
import { Database, Search, ChevronRight, Table as TableIcon, Hash, Focus, FolderOpen, X, Palette } from 'lucide-react';
import { useReactFlow } from 'reactflow';
import type { Section } from '../types/erd';
import type { Entity } from '../types/erd';

const EntityItem: React.FC<{ entity: Entity; onFocus: (e: React.MouseEvent, nodeId: string) => void }> = ({ entity, onFocus }) => (
    <div className="group/item flex items-stretch gap-0.5">
        <details className="group min-w-0 flex-1">
            <summary className="list-none flex items-center gap-2 p-2 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors group/summary">
                <ChevronRight size={14} className="text-gray-400 group-open:rotate-90 transition-transform shrink-0" />
                <TableIcon size={16} className="text-blue-500 shrink-0" />
                <span className="text-sm font-semibold text-gray-700 truncate flex-1 min-w-0">{entity.name}</span>
            </summary>
            <div className="pl-8 pr-2 py-2 space-y-2 border-l border-gray-100 ml-4 mb-2 mt-1">
                {entity.attributes.map(attr => (
                    <div key={attr.id} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 text-gray-600">
                            {attr.isPK ? (
                                <Hash size={10} className="text-yellow-500" />
                            ) : (
                                <div className="w-1 h-1 bg-gray-300 rounded-full" />
                            )}
                            <span className={attr.isPK ? "font-bold" : ""}>{attr.name}</span>
                        </div>
                        <span className="text-gray-400 uppercase font-mono">{attr.type.split('(')[0]}</span>
                    </div>
                ))}
            </div>
        </details>
        <button
            type="button"
            onClick={(e) => onFocus(e, entity.id)}
            className="shrink-0 self-center p-1.5 hover:bg-blue-100 rounded text-blue-500 transition-all active:scale-90"
            title="테이블 위치로 이동"
        >
            <Focus size={14} />
        </button>
    </div>
);

const Sidebar: React.FC = () => {
    const entitiesById = useERDStore((s) => s.entitiesById);
    const entities = React.useMemo(() => Object.values(entitiesById), [entitiesById]);
    const sections = useERDStore((s) => s.sections);
    const updateSection = useERDStore((s) => s.updateSection);
    const deleteSection = useERDStore((s) => s.deleteSection);
    const { fitView, setNodes } = useReactFlow();
    const [search, setSearch] = useState('');
    const [composing, setComposing] = useState<string | null>(null);
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [editingSectionName, setEditingSectionName] = useState('');
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
    const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);
    const displaySearch = composing !== null ? composing : search;

    const filteredEntities = entities.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase())
    );
    const sectionList = sections as Section[];
    const rootSections = sectionList.filter((s) => !s.parentId);
    const rootEntities = filteredEntities.filter((e) => !e.sectionId);

    const handleFocusNode = (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        e.preventDefault();

        // 1. Move camera to the node
        fitView({
            nodes: [{ id: nodeId }],
            duration: 800,
            padding: 0.5,
        });

        // 2. Set node as selected to apply visual effects (orange border, glow)
        setNodes((nodes) =>
            nodes.map((node) => ({
                ...node,
                selected: node.id === nodeId
            }))
        );
    };

    const startEditingSectionName = (section: Section) => {
        setEditingSectionId(section.id);
        setEditingSectionName(section.name ?? 'Section');
    };

    const saveSectionName = (sectionId: string) => {
        if (editingSectionId !== sectionId) return;
        const name = editingSectionName.trim() || 'Section';
        updateSection(sectionId, { name });
        setEditingSectionId(null);
        setEditingSectionName('');
    };

    const handleDeleteSection = (sectionId: string, sectionName: string) => {
        if (window.confirm(`섹션 "${sectionName}"을(를) 삭제하시겠습니까?\n\n섹션에 속한 테이블들은 "섹션 없음"으로 이동됩니다.`)) {
            deleteSection(sectionId);
        }
    };

    const toggleSectionCollapse = (sectionId: string) => {
        setCollapsedSections((prev) => ({
            ...prev,
            [sectionId]: !prev[sectionId],
        }));
    };

    const renderSection = (section: Section) => {
        const childSections = sectionList.filter((s) => s.parentId === section.id);
        const secEntities = filteredEntities.filter((e) => e.sectionId === section.id);
        const isEditing = editingSectionId === section.id;
        const isCollapsed = collapsedSections[section.id] ?? false;
        const hasChildren = childSections.length > 0 || secEntities.length > 0;

        return (
            <div key={section.id} className="space-y-0.5">
                <div className="flex items-center gap-2 px-2 py-3 rounded-lg bg-gray-100/80 border border-gray-100 min-h-[32px]">
                    <button
                        type="button"
                        onClick={() => toggleSectionCollapse(section.id)}
                        className="p-0.5 rounded hover:bg-blue-100 text-gray-500 hover:text-blue-600 transition-colors flex items-center justify-center shrink-0"
                        title={isCollapsed ? '섹션 펼치기' : '섹션 접기'}
                    >
                        <ChevronRight
                            size={12}
                            className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                        />
                    </button>
                    <FolderOpen size={14} className="text-blue-500 shrink-0" />
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
                            className="flex-1 min-w-0 text-xs font-bold text-gray-700 bg-white border border-blue-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
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
                        <div className="flex items-center gap-1.5 ml-auto">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setColorPickerOpen(colorPickerOpen === section.id ? null : section.id);
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-blue-100 text-gray-500 hover:text-blue-600 transition-colors shrink-0"
                                title="색상 변경"
                            >
                                <Palette size={14} />
                            </button>
                            {colorPickerOpen === section.id && (
                                <div className="absolute mt-10 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 min-w-[120px]">
                                    <div className="grid grid-cols-4 gap-1">
                                        {['#e5e7eb', '#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#fed7aa', '#e9d5ff', '#f3f4f6'].map((color) => (
                                            <button
                                                key={color}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    updateSection(section.id, { color });
                                                    setColorPickerOpen(null);
                                                }}
                                                className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                            <span className="text-[10px] text-gray-400 shrink-0">{secEntities.length}</span>
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

                {hasChildren && !isCollapsed && (
                    <div className="pl-3 border-l border-gray-200 ml-2 space-y-0.5">
                        {childSections.map((child) => renderSection(child))}
                        {secEntities.map((entity) => (
                            <EntityItem key={entity.id} entity={entity} onFocus={handleFocusNode} />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-full min-w-0 h-full bg-white flex flex-col z-20 overflow-hidden">
            {/* Sidebar Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-blue-500 rounded-lg text-white">
                        <Database size={18} />
                    </div>
                    <h2 className="text-lg font-bold text-gray-800 tracking-tight">엔티티 목록</h2>
                    <span className="ml-auto bg-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {entities.length}
                    </span>
                </div>

                {/* Search Bar */}
                <div className="relative group">
                    <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"
                    />
                    <input
                        type="text"
                        placeholder="테이블 검색..."
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
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
            </div>

            {/* Entity List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {filteredEntities.length === 0 && sectionList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="p-3 bg-gray-50 rounded-full text-gray-300 mb-2">
                            <Search size={24} />
                        </div>
                        <p className="text-sm text-gray-400">엔티티를 찾을 수 없습니다</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {rootSections.map((section) => renderSection(section))}
                        {rootEntities.length > 0 && (
                            <div className="space-y-0.5">
                                {sectionList.length > 0 && (
                                    <div className="flex items-center gap-2 px-2 py-1 text-gray-500">
                                        <span className="text-[10px] font-bold uppercase">섹션 없음</span>
                                    </div>
                                )}
                                {rootEntities.map((entity) => (
                                    <EntityItem key={entity.id} entity={entity} onFocus={handleFocusNode} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Sidebar Footer */}
            <div className="mt-auto p-4 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 flex flex-col gap-1" >
                <div className="flex items-center justify-between">
                    <span>© 2026 2QuadrillionTae</span>
                    <div className="flex gap-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        실시간 동기화 중
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
