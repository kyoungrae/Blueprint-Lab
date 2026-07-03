import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical, Pencil, Check, ChevronsDownUp, ChevronsUpDown, Search, X } from 'lucide-react';
import { useWbsStore, calcMenuProgress } from '../../store/wbsStore';
import { useWbsEditingStore } from '../../store/wbsEditingStore';
import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';
import type { WbsMenuNode } from '../../types/wbs';

interface TreeNode extends WbsMenuNode {
    children: TreeNode[];
}

function buildTree(menus: WbsMenuNode[]): TreeNode[] {
    const validIds = new Set(menus.map((m) => m.id));
    const byParent = new Map<string | null, WbsMenuNode[]>();
    for (const m of menus) {
        // 부모 ID가 실제로 존재하지 않으면(계층 깨짐) 최상위로 취급해 숨기지 않는다
        const key = m.parentId && validIds.has(m.parentId) ? m.parentId : null;
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

function flattenTree(nodes: TreeNode[]): TreeNode[] {
    return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

function normalizeSearch(q: string) {
    return q.trim().toLowerCase();
}

function menuMatchesSearch(m: WbsMenuNode, q: string): boolean {
    if (!q) return true;
    const needle = normalizeSearch(q);
    return (
        m.name.toLowerCase().includes(needle) ||
        m.menuCode.toLowerCase().includes(needle) ||
        (m.programId ?? '').toLowerCase().includes(needle)
    );
}

/** 검색어가 있을 때 표시할 메뉴 ID 집합 (매칭 + 상위·하위 포함). null이면 전체 표시 */
function buildSearchVisibleIds(menus: WbsMenuNode[], query: string): Set<string> | null {
    const q = normalizeSearch(query);
    if (!q) return null;

    const matching = menus.filter((m) => menuMatchesSearch(m, q));
    if (matching.length === 0) return new Set();

    const byId = new Map(menus.map((m) => [m.id, m]));
    const visible = new Set<string>();

    const addAncestors = (id: string) => {
        let cur = byId.get(id);
        while (cur) {
            visible.add(cur.id);
            cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
    };

    const addDescendants = (parentId: string) => {
        for (const m of menus) {
            if (m.parentId === parentId) {
                visible.add(m.id);
                addDescendants(m.id);
            }
        }
    };

    for (const m of matching) {
        addAncestors(m.id);
        addDescendants(m.id);
    }

    return visible;
}

/** 담당자 색상 팔레트 */
export const ASSIGNEE_PALETTE = [
    { badge: 'bg-purple-100 text-purple-700 border-purple-200', toggle: 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200', active: 'bg-purple-500 text-white border-purple-500' },
    { badge: 'bg-pink-100 text-pink-700 border-pink-200',       toggle: 'bg-pink-100 text-pink-700 border-pink-300 hover:bg-pink-200',       active: 'bg-pink-500 text-white border-pink-500' },
    { badge: 'bg-cyan-100 text-cyan-700 border-cyan-200',       toggle: 'bg-cyan-100 text-cyan-700 border-cyan-300 hover:bg-cyan-200',       active: 'bg-cyan-500 text-white border-cyan-500' },
    { badge: 'bg-orange-100 text-orange-700 border-orange-200', toggle: 'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200', active: 'bg-orange-500 text-white border-orange-500' },
    { badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', toggle: 'bg-indigo-100 text-indigo-700 border-indigo-300 hover:bg-indigo-200', active: 'bg-indigo-500 text-white border-indigo-500' },
    { badge: 'bg-teal-100 text-teal-700 border-teal-200',       toggle: 'bg-teal-100 text-teal-700 border-teal-300 hover:bg-teal-200',       active: 'bg-teal-500 text-white border-teal-500' },
    { badge: 'bg-rose-100 text-rose-700 border-rose-200',       toggle: 'bg-rose-100 text-rose-700 border-rose-300 hover:bg-rose-200',       active: 'bg-rose-500 text-white border-rose-500' },
    { badge: 'bg-lime-100 text-lime-700 border-lime-200',       toggle: 'bg-lime-100 text-lime-700 border-lime-300 hover:bg-lime-200',       active: 'bg-lime-500 text-white border-lime-500' },
];

/** 재귀적으로 노드 or 자손에 필터 담당자가 있는지 확인 */
function nodeMatchesFilter(node: TreeNode, activeAssignees: Set<string>, rowsByMenu: Map<string, string[]>): boolean {
    const assignees = rowsByMenu.get(node.id) ?? [];
    if (assignees.some((a) => activeAssignees.has(a))) return true;
    return node.children.some((c) => nodeMatchesFilter(c, activeAssignees, rowsByMenu));
}

interface MenuEditDraft {
    name: string;
    menuCode: string;
    programId: string;
}

const EMPTY_MENU_DRAFT: MenuEditDraft = { name: '', menuCode: '', programId: '' };

interface WbsMenuTreeProps {
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    /** 추가/삭제/이름변경/드래그 등 편집 허용 */
    editable?: boolean;
    /** 메뉴별 진행율 배지 표시 */
    showProgress?: boolean;
    /** 담당자 뱃지 표시 */
    showAssignee?: boolean;
    /** 활성 담당자 필터 (빈 Set = 전체 표시) */
    activeAssignees?: Set<string>;
    /** 담당자 → 팔레트 인덱스 맵 */
    assigneeColorIdx?: Map<string, number>;
    /** editable=false 상태에서도 전체 접기/펼치기 버튼 표시 */
    showCollapseButtons?: boolean;
    /** 메뉴명·PID·메뉴코드 검색 */
    showSearch?: boolean;
}

const WbsMenuTree: React.FC<WbsMenuTreeProps> = ({
    selectedId, onSelect, editable = true, showProgress = false,
    showAssignee = false, activeAssignees, assigneeColorIdx, showCollapseButtons = false,
    showSearch = true,
}) => {
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);
    const editingMap = useWbsEditingStore((s) => s.editing);
    const emitFocus = useSyncStore((s) => s.emitWbsFieldFocus);
    const emitBlur = useSyncStore((s) => s.emitWbsFieldBlur);
    const currentUserId = useAuthStore((s) => s.user?.id);

    /** menuId → 담당자[] (중복 제거) */
    const rowsByMenu = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const r of rows) {
            if (!r.assignee) continue;
            if (!map.has(r.menuId)) map.set(r.menuId, []);
            const arr = map.get(r.menuId)!;
            if (!arr.includes(r.assignee)) arr.push(r.assignee);
        }
        return map;
    }, [rows]);
    const addMenu = useWbsStore((s) => s.addMenu);
    const updateMenu = useWbsStore((s) => s.updateMenu);
    const deleteMenu = useWbsStore((s) => s.deleteMenu);
    const moveMenu = useWbsStore((s) => s.moveMenu);

    const tree = useMemo(() => buildTree(menus), [menus]);
    const allParentIds = useMemo(
        () => new Set(flattenTree(tree).filter((n) => n.children.length > 0).map((n) => n.id)),
        [tree]
    );
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<MenuEditDraft>(EMPTY_MENU_DRAFT);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    // 드롭 위치: 대상 위(형제 앞) / 가운데(하위로) / 아래(형제 뒤)
    const [dropPos, setDropPos] = useState<'before' | 'inside' | 'after' | null>(null);
    const [menuSearch, setMenuSearch] = useState('');
    const editContainerRef = useRef<HTMLDivElement>(null);

    const searchVisibleIds = useMemo(
        () => buildSearchVisibleIds(menus, menuSearch),
        [menus, menuSearch],
    );
    const hasSearch = normalizeSearch(menuSearch).length > 0;

    // 검색 시 매칭 경로의 부모 노드는 자동 펼침
    useEffect(() => {
        if (!hasSearch || !searchVisibleIds || searchVisibleIds.size === 0) return;
        const byId = new Map(menus.map((m) => [m.id, m]));
        setCollapsed((prev) => {
            const next = new Set(prev);
            for (const id of searchVisibleIds) {
                let cur = byId.get(id);
                while (cur?.parentId) {
                    next.delete(cur.parentId);
                    cur = byId.get(cur.parentId);
                }
            }
            return next;
        });
    }, [menuSearch, menus, hasSearch, searchVisibleIds]);

    const handleEditBlur = (e: React.FocusEvent) => {
        const next = e.relatedTarget as Node | null;
        if (next && editContainerRef.current?.contains(next)) return;
        commitEdit();
    };

    const toggleCollapse = (id: string) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const startEdit = (node: WbsMenuNode) => {
        const entry = editingMap.get(`menu_${node.id}`);
        if (entry && entry.userId !== currentUserId) return; // 다른 사람이 수정 중이면 차단
        setEditingId(node.id);
        setDraft({
            name: node.name,
            menuCode: node.menuCode,
            programId: node.programId ?? '',
        });
        emitFocus(`menu_${node.id}`);
    };
    const cancelEdit = () => {
        if (editingId) emitBlur(`menu_${editingId}`);
        setEditingId(null);
        setDraft(EMPTY_MENU_DRAFT);
    };
    const commitEdit = () => {
        if (!editingId) return;
        const name = draft.name.trim() || '이름 없음';
        const menuCode = draft.menuCode.trim();
        if (!menuCode) {
            window.alert('메뉴 코드를 입력해 주세요.');
            return;
        }
        if (menus.some((m) => m.id !== editingId && m.menuCode === menuCode)) {
            window.alert('이미 사용 중인 메뉴 코드입니다.');
            return;
        }
        const programId = draft.programId.trim();
        updateMenu(editingId, {
            name,
            menuCode,
            programId: programId || undefined,
        });
        emitBlur(`menu_${editingId}`);
        setEditingId(null);
        setDraft(EMPTY_MENU_DRAFT);
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
        const progress = showProgress ? calcMenuProgress(menus, rows, node.id) : 0;
        const indentStyle = { marginLeft: depth * 16 + 4 } as React.CSSProperties;

        // 수정중 인디케이터
        const editingEntry = editingMap.get(`menu_${node.id}`);
        const isBeingEdited = !!editingEntry && editingEntry.userId !== currentUserId;

        // 담당자 필터: 이 노드(or 자손)에 일치하는 담당자 없으면 숨김
        if (activeAssignees && activeAssignees.size > 0 && !nodeMatchesFilter(node, activeAssignees, rowsByMenu)) {
            return null;
        }

        // 메뉴명·PID·메뉴코드 검색 필터
        if (searchVisibleIds !== null && !searchVisibleIds.has(node.id)) {
            return null;
        }

        // 이 메뉴에 직접 등록된 담당자 목록
        const menuAssignees = showAssignee ? (rowsByMenu.get(node.id) ?? []) : [];

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
                    className={`group relative flex items-center gap-1 pr-2 py-1.5 rounded-lg cursor-pointer select-none transition-colors ${
                        isSelected ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'hover:bg-gray-50'
                    } ${isInsideTarget ? 'ring-2 ring-emerald-400 bg-emerald-50/60' : ''}`}
                    style={{
                        paddingLeft: depth * 16 + 4,
                        ...(isBeingEdited ? { outline: `2px solid ${editingEntry!.color}`, outlineOffset: '-2px' } : {}),
                    }}
                >
                    {/* 수정중 뱃지 */}
                    {isBeingEdited && (
                        <span
                            className="absolute -top-4 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white z-20 pointer-events-none whitespace-nowrap"
                            style={{ backgroundColor: editingEntry!.color }}
                        >
                            {editingEntry!.userName} <span className="opacity-80">수정중</span>
                        </span>
                    )}
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
                        <div
                            ref={editContainerRef}
                            className="flex-1 min-w-0 flex flex-col gap-1"
                            onClick={(e) => e.stopPropagation()}
                            onBlur={handleEditBlur}
                        >
                            <input
                                autoFocus
                                value={draft.name}
                                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitEdit();
                                    if (e.key === 'Escape') cancelEdit();
                                }}
                                placeholder="메뉴명"
                                className="w-full text-sm px-1.5 py-0.5 rounded border border-emerald-300 outline-none"
                            />
                            <input
                                value={draft.menuCode}
                                onChange={(e) => setDraft((prev) => ({ ...prev, menuCode: e.target.value }))}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitEdit();
                                    if (e.key === 'Escape') cancelEdit();
                                }}
                                placeholder="메뉴 코드"
                                className="w-full text-[11px] font-mono px-1.5 py-0.5 rounded border border-emerald-200 outline-none text-indigo-700"
                            />
                            <input
                                value={draft.programId}
                                onChange={(e) => setDraft((prev) => ({ ...prev, programId: e.target.value }))}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitEdit();
                                    if (e.key === 'Escape') cancelEdit();
                                }}
                                placeholder="프로그램 ID"
                                className="w-full text-[11px] font-mono px-1.5 py-0.5 rounded border border-emerald-200 outline-none text-gray-600"
                            />
                        </div>
                    ) : (
                        <span
                            className={`flex-1 min-w-0 flex flex-col gap-0.5 ${editable ? 'cursor-text' : ''}`}
                            title={editable ? '더블클릭하여 메뉴 정보 수정' : node.name}
                            onDoubleClick={(e) => {
                                if (!editable) return;
                                e.stopPropagation();
                                startEdit(node);
                            }}
                        >
                            <span className="flex items-center gap-1 min-w-0">
                                <span className="truncate text-sm text-gray-800">{node.name}</span>
                                <span className="text-[10px] font-mono text-gray-400 shrink-0">{node.menuCode}</span>
                            </span>
                            {node.programId && (
                                <span className="text-[10px] font-mono text-gray-400 truncate" title={`프로그램 ID: ${node.programId}`}>
                                    PID: {node.programId}
                                </span>
                            )}
                            {/* 담당자 뱃지 — 메뉴명 아래 */}
                            {menuAssignees.length > 0 && (
                                <span className="flex flex-wrap gap-1">
                                    {menuAssignees.map((a) => {
                                        const idx = (assigneeColorIdx?.get(a) ?? 0) % ASSIGNEE_PALETTE.length;
                                        return (
                                            <span
                                                key={a}
                                                className={`px-1.5 py-0.5 rounded border text-[10px] font-bold leading-none ${ASSIGNEE_PALETTE[idx].badge}`}
                                            >
                                                {a}
                                            </span>
                                        );
                                    })}
                                </span>
                            )}
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
                                <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(node); }} className="p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded" title="메뉴 정보 변경">
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
            {!editable && showCollapseButtons && allParentIds.size > 0 && (
                <div className="flex items-center gap-0.5 px-1 pb-1.5 mb-1 border-b border-gray-100">
                    <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider shrink-0 mr-auto">메뉴 구조도</span>
                    <button
                        type="button"
                        onClick={() => setCollapsed(new Set())}
                        title="전체 펼치기"
                        className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    >
                        <ChevronsUpDown size={13} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setCollapsed(new Set(allParentIds))}
                        title="전체 접기"
                        className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    >
                        <ChevronsDownUp size={13} />
                    </button>
                </div>
            )}
            {editable && (
                <div className="flex items-center gap-2 px-1 pb-2 mb-1 border-b border-gray-100">
                    <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider shrink-0">메뉴 구조도</span>
                    <div className="flex items-center gap-0.5 ml-auto">
                        {allParentIds.size > 0 && (<>
                            <button
                                type="button"
                                onClick={() => setCollapsed(new Set())}
                                title="전체 펼치기"
                                className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                            >
                                <ChevronsUpDown size={13} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setCollapsed(new Set(allParentIds))}
                                title="전체 접기"
                                className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                            >
                                <ChevronsDownUp size={13} />
                            </button>
                        </>)}
                        <button
                            type="button"
                            onClick={() => { const id = addMenu(null); onSelect?.(id); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors ml-1"
                        >
                            <Plus size={13} /> 최상위 추가
                        </button>
                    </div>
                </div>
            )}
            {showSearch && (
                <div className="relative px-1 pb-2 mb-1 border-b border-gray-100">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                        type="search"
                        value={menuSearch}
                        onChange={(e) => setMenuSearch(e.target.value)}
                        placeholder="메뉴명 · PID · 메뉴코드 검색"
                        className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-gray-400"
                    />
                    {menuSearch && (
                        <button
                            type="button"
                            onClick={() => setMenuSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            title="검색 초기화"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            )}
            <div className="flex-1 overflow-auto pr-1">
                {tree.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-10 px-4 leading-relaxed">
                        메뉴가 없습니다.<br />
                        {editable ? '“최상위 추가”로 첫 메뉴를 만들어 보세요.' : ''}
                    </div>
                ) : hasSearch && searchVisibleIds?.size === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-10 px-4">
                        검색 결과가 없습니다.
                    </div>
                ) : (
                    tree.map((n) => renderNode(n, 0))
                )}
            </div>
        </div>
    );
};

export default WbsMenuTree;
