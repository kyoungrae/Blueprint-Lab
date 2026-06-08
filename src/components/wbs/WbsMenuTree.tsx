import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical, Pencil, Check } from 'lucide-react';
import { useWbsStore, calcMenuProgress } from '../../store/wbsStore';
import type { WbsMenuNode } from '../../types/wbs';

interface TreeNode extends WbsMenuNode {
    children: TreeNode[];
}

function buildTree(menus: WbsMenuNode[]): TreeNode[] {
    const byParent = new Map<string | null, WbsMenuNode[]>();
    for (const m of menus) {
        const key = m.parentId ?? null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(m);
    }
    const build = (parentId: string | null): TreeNode[] =>
        (byParent.get(parentId) ?? [])
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((m) => ({ ...m, children: build(m.id) }));
    return build(null);
}

interface WbsMenuTreeProps {
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    /** 추가/삭제/이름변경/드래그 등 편집 허용 */
    editable?: boolean;
    /** 메뉴별 진행율 배지 표시 */
    showProgress?: boolean;
}

const WbsMenuTree: React.FC<WbsMenuTreeProps> = ({ selectedId, onSelect, editable = true, showProgress = false }) => {
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);
    const addMenu = useWbsStore((s) => s.addMenu);
    const updateMenu = useWbsStore((s) => s.updateMenu);
    const deleteMenu = useWbsStore((s) => s.deleteMenu);
    const moveMenu = useWbsStore((s) => s.moveMenu);

    const tree = useMemo(() => buildTree(menus), [menus]);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftName, setDraftName] = useState('');
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    // 드롭 위치: 대상 위(형제 앞) / 가운데(하위로) / 아래(형제 뒤)
    const [dropPos, setDropPos] = useState<'before' | 'inside' | 'after' | null>(null);

    const toggleCollapse = (id: string) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const startEdit = (node: WbsMenuNode) => {
        setEditingId(node.id);
        setDraftName(node.name);
    };
    const commitEdit = () => {
        if (editingId) updateMenu(editingId, { name: draftName.trim() || '이름 없음' });
        setEditingId(null);
    };

    const siblingsOrderEnd = (parentId: string | null) =>
        menus.filter((m) => m.parentId === parentId).length;

    const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
        const hasChildren = node.children.length > 0;
        const isCollapsed = collapsed.has(node.id);
        const isSelected = selectedId === node.id;
        const isActiveTarget = dropTargetId === node.id && dragId !== null && dragId !== node.id;
        const showBefore = isActiveTarget && dropPos === 'before';
        const showAfter = isActiveTarget && dropPos === 'after';
        const isInsideTarget = isActiveTarget && dropPos === 'inside';
        const progress = showProgress ? calcMenuProgress(rows, node.id) : 0;
        const indentStyle = { marginLeft: depth * 16 + 4 } as React.CSSProperties;

        const performDrop = () => {
            const did = dragId;
            if (!did || did === node.id) return;
            const pos = dropPos ?? 'inside';
            if (pos === 'inside') {
                // 대상의 하위(맨 끝)로 이동 후 펼친다
                moveMenu(did, node.id, siblingsOrderEnd(node.id));
                setCollapsed((prev) => {
                    const next = new Set(prev);
                    next.delete(node.id);
                    return next;
                });
            } else {
                // 대상과 같은 부모의 형제로, 대상의 앞/뒤 순서에 삽입 (= 빼내기/순서 변경)
                const parentId = node.parentId;
                const sibs = menus
                    .filter((m) => m.parentId === parentId && m.id !== did)
                    .sort((a, b) => a.order - b.order);
                const idx = sibs.findIndex((s) => s.id === node.id);
                const order = pos === 'before' ? idx : idx + 1;
                moveMenu(did, parentId, Math.max(0, order));
            }
        };

        return (
            <div key={node.id} className="relative">
                {/* 위쪽 삽입 표시선 (형제 앞) */}
                <div className={`h-0.5 rounded-full transition-colors ${showBefore ? 'bg-emerald-500' : 'bg-transparent'}`} style={indentStyle} />
                <div
                    draggable={editable && editingId !== node.id}
                    onDragStart={(e) => {
                        if (!editable) return;
                        setDragId(node.id);
                        e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                        if (!editable || dragId === null || dragId === node.id) return;
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const pos = y < rect.height * 0.3 ? 'before' : y > rect.height * 0.7 ? 'after' : 'inside';
                        setDropTargetId(node.id);
                        setDropPos(pos);
                    }}
                    onDragLeave={() => {
                        setDropTargetId((cur) => (cur === node.id ? null : cur));
                    }}
                    onDrop={(e) => {
                        if (!editable || dragId === null) return;
                        e.preventDefault();
                        e.stopPropagation();
                        performDrop();
                        setDragId(null);
                        setDropTargetId(null);
                        setDropPos(null);
                    }}
                    onDragEnd={() => {
                        setDragId(null);
                        setDropTargetId(null);
                        setDropPos(null);
                    }}
                    onClick={() => onSelect?.(node.id)}
                    className={`group flex items-center gap-1 pr-2 py-1.5 rounded-lg cursor-pointer select-none transition-colors ${
                        isSelected ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'hover:bg-gray-50'
                    } ${isInsideTarget ? 'ring-2 ring-emerald-400 bg-emerald-50/60' : ''}`}
                    style={{ paddingLeft: depth * 16 + 4 }}
                >
                    {editable && (
                        <GripVertical size={13} className="text-gray-300 group-hover:text-gray-400 shrink-0 cursor-grab" />
                    )}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (hasChildren) toggleCollapse(node.id);
                        }}
                        className={`w-4 h-4 flex items-center justify-center shrink-0 ${hasChildren ? 'text-gray-500' : 'text-transparent'}`}
                    >
                        {hasChildren ? (isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />) : <ChevronRight size={14} />}
                    </button>

                    {editingId === node.id ? (
                        <input
                            autoFocus
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit();
                                if (e.key === 'Escape') setEditingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 min-w-0 text-sm px-1.5 py-0.5 rounded border border-emerald-300 outline-none"
                        />
                    ) : (
                        <span
                            className={`flex-1 min-w-0 truncate text-sm text-gray-800 ${editable ? 'cursor-text' : ''}`}
                            title={editable ? '더블클릭하여 이름 수정' : node.name}
                            onDoubleClick={(e) => {
                                if (!editable) return;
                                e.stopPropagation();
                                startEdit(node);
                            }}
                        >
                            {node.name}
                            <span className="ml-1.5 text-[10px] font-mono text-gray-400">{node.menuCode}</span>
                        </span>
                    )}

                    {showProgress && (
                        <span className="shrink-0 text-[10px] font-bold text-emerald-700 tabular-nums w-9 text-right">{progress}%</span>
                    )}

                    {editable && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            {editingId === node.id ? (
                                <button type="button" onClick={(e) => { e.stopPropagation(); commitEdit(); }} className="p-1 text-emerald-600 hover:bg-emerald-100 rounded" title="저장">
                                    <Check size={13} />
                                </button>
                            ) : (
                                <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(node); }} className="p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded" title="이름 변경">
                                    <Pencil size={12} />
                                </button>
                            )}
                            <button type="button" onClick={(e) => { e.stopPropagation(); const id = addMenu(node.id); setCollapsed((p) => { const n = new Set(p); n.delete(node.id); return n; }); onSelect?.(id); }} className="p-1 text-gray-400 hover:bg-gray-100 hover:text-emerald-600 rounded" title="하위 메뉴 추가">
                                <Plus size={13} />
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); if (window.confirm(`"${node.name}" 메뉴와 하위/상세를 모두 삭제할까요?`)) deleteMenu(node.id); }} className="p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded" title="삭제">
                                <Trash2 size={12} />
                            </button>
                        </div>
                    )}
                </div>
                {/* 아래쪽 삽입 표시선 (형제 뒤) */}
                <div className={`h-0.5 rounded-full transition-colors ${showAfter ? 'bg-emerald-500' : 'bg-transparent'}`} style={indentStyle} />
                {hasChildren && !isCollapsed && <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>}
            </div>
        );
    };

    return (
        <div
            className="h-full flex flex-col"
            onDragOver={(e) => {
                if (editable && dragId !== null) e.preventDefault();
            }}
            onDrop={(e) => {
                // 빈 영역에 드롭 → 최상위(맨 끝)로 이동 (= 빼내기)
                if (editable && dragId !== null) {
                    e.preventDefault();
                    moveMenu(dragId, null, siblingsOrderEnd(null));
                    setDragId(null);
                    setDropTargetId(null);
                    setDropPos(null);
                }
            }}
        >
            {editable && (
                <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-gray-100">
                    <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">메뉴 구조도</span>
                    <button
                        type="button"
                        onClick={() => { const id = addMenu(null); onSelect?.(id); }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                    >
                        <Plus size={13} /> 최상위 추가
                    </button>
                </div>
            )}
            <div className="flex-1 overflow-auto pr-1">
                {tree.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-10 px-4 leading-relaxed">
                        메뉴가 없습니다.<br />
                        {editable ? '“최상위 추가”로 첫 메뉴를 만들어 보세요.' : ''}
                    </div>
                ) : (
                    tree.map((n) => renderNode(n, 0))
                )}
            </div>
        </div>
    );
};

export default WbsMenuTree;
