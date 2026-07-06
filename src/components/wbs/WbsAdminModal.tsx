import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronDown, Trash2, Plus, CheckCircle2 } from 'lucide-react';
import { useWbsStore } from '../../store/wbsStore';
import type { WbsMenuNode } from '../../types/wbs';
import { isWbsDebugingCategoryRow } from '../../types/wbs';

const ALL_ARTIFACT_CATEGORIES = ['Controller', 'Service', 'ServiceImpl', 'VO', 'Mapper', 'Html'];

/* ── 트리 빌더 ───────────────────────────────── */
interface TreeNode extends WbsMenuNode {
    children: TreeNode[];
    depth: number;
}

function buildTree(menus: WbsMenuNode[]): TreeNode[] {
    const byParent = new Map<string | null, WbsMenuNode[]>();
    for (const m of menus) {
        const key = m.parentId ?? null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(m);
    }
    const build = (parentId: string | null, depth: number): TreeNode[] =>
        (byParent.get(parentId) ?? [])
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((m) => ({ ...m, depth, children: build(m.id, depth + 1) }));
    return build(null, 1);
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
    return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

/* ── 모달 ────────────────────────────────────── */
interface WbsAdminModalProps {
    open: boolean;
    onClose: () => void;
}

const WbsAdminModal: React.FC<WbsAdminModalProps> = ({ open, onClose }) => {
    const menus     = useWbsStore((s) => s.menus);
    const rows      = useWbsStore((s) => s.rows);
    const addRows   = useWbsStore((s) => s.addRows);
    const deleteRow = useWbsStore((s) => s.deleteRow);

    const tree      = useMemo(() => buildTree(menus), [menus]);
    const flatNodes = useMemo(() => flattenTree(tree), [tree]);

    const [selected,  setSelected]  = useState<Set<string>>(new Set());
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(t);
    }, [toast]);

    if (!open) return null;

    /* 체크박스 토글 */
    const toggle = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    /* 깊이별 빠른 선택 */
    const selectByDepth = (depth: number | 'all') =>
        setSelected(
            depth === 'all'
                ? new Set(flatNodes.map((n) => n.id))
                : new Set(flatNodes.filter((n) => n.depth === depth).map((n) => n.id))
        );

    const toggleCollapse = (id: string) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    /* 일괄 삭제 */
    const handleBulkDelete = () => {
        if (selected.size === 0) return;
        if (!window.confirm(`선택한 ${selected.size}개 메뉴의 모든 행을 삭제하시겠습니까?`)) return;
        const targets = rows.filter((r) => selected.has(r.menuId));
        targets.forEach((r) => deleteRow(r.id));
        setToast({ msg: `${selected.size}개 메뉴의 행 ${targets.length}개를 삭제했습니다.`, type: 'success' });
    };

    /* 일괄 추가 */
    const handleBulkAdd = () => {
        if (selected.size === 0) return;
        if (!window.confirm(
            `선택한 ${selected.size}개 메뉴에 산출물 행을 일괄 추가하시겠습니까?\n(${ALL_ARTIFACT_CATEGORIES.join(', ')})`
        )) return;
        selected.forEach((menuId) => addRows(menuId, ALL_ARTIFACT_CATEGORIES));
        const addedRows = ALL_ARTIFACT_CATEGORIES.length + 1; // +1 Debugging
        setToast({ msg: `${selected.size}개 메뉴에 행 추가 완료 (메뉴당 ${addedRows}행)`, type: 'success' });
    };

    /* 트리 노드 렌더 */
    const renderNode = (node: TreeNode): React.ReactNode => {
        const isSelected  = selected.has(node.id);
        const isCollapsed = collapsed.has(node.id);
        const hasChildren = node.children.length > 0;
        const rowCount    = rows.filter((r) => r.menuId === node.id && !isWbsDebugingCategoryRow(r)).length;

        return (
            <div key={node.id}>
                <div
                    className={`flex items-center gap-2 py-1.5 pr-3 rounded-lg cursor-pointer select-none transition-colors ${
                        isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                    }`}
                    style={{ paddingLeft: (node.depth - 1) * 20 + 8 }}
                    onClick={() => toggle(node.id)}
                >
                    {/* 체크박스 */}
                    <span className={`shrink-0 w-4 h-4 flex items-center justify-center rounded border transition-colors ${
                        isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 bg-white'
                    }`}>
                        {isSelected && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.8"
                                    strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        )}
                    </span>

                    {/* 접기/펼치기 */}
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleCollapse(node.id); }}
                        className={`w-4 h-4 flex items-center justify-center shrink-0 ${hasChildren ? 'text-gray-500' : 'text-transparent'}`}
                    >
                        {hasChildren
                            ? (isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />)
                            : <ChevronRight size={13} />}
                    </button>

                    {/* 메뉴 코드 */}
                    <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">
                        {node.menuCode}
                    </span>

                    {/* 메뉴명 */}
                    <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{node.name}</span>

                    {/* 행 수 */}
                    <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">{rowCount}행</span>
                </div>

                {hasChildren && !isCollapsed && node.children.map((c) => renderNode(c))}
            </div>
        );
    };

    const maxDepth = flatNodes.length > 0 ? Math.max(...flatNodes.map((n) => n.depth)) : 0;
    const DEPTH_TABS = [
        { label: '전체', value: 'all' as const },
        ...Array.from({ length: maxDepth }, (_, i) => ({ label: `${i + 1} Depth`, value: i + 1 })),
    ];

    return createPortal(
        <div className="fixed inset-0 z-[9000] flex items-center justify-center">
            {/* 배경 */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* 모달 */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col">
                <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>

                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-black text-gray-900">기능 Row 일괄 수정</h2>
                        <p className="text-xs text-gray-400 mt-0.5">메뉴를 선택 후 일괄 추가 또는 삭제하세요.</p>
                    </div>
                    <button onClick={onClose}
                        className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* 빠른 선택 탭 */}
                <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-500 shrink-0">빠른 선택</span>
                    <nav className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                        {DEPTH_TABS.map((tab) => (
                            <button
                                key={tab.label}
                                type="button"
                                onClick={() => selectByDepth(tab.value)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors text-gray-500 hover:text-gray-800 hover:bg-white hover:shadow-sm"
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                    <button
                        type="button"
                        onClick={() => setSelected(new Set())}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        선택 해제
                    </button>
                    <span className="ml-auto text-xs font-bold text-indigo-600">
                        {selected.size}개 선택됨
                    </span>
                </div>

                {/* 트리 */}
                <div className="flex-1 overflow-auto px-4 py-3 min-h-0">
                    {tree.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-10">
                            메뉴가 없습니다. '메뉴 구조도' 탭에서 먼저 메뉴를 추가하세요.
                        </p>
                    ) : (
                        tree.map((n) => renderNode(n))
                    )}
                </div>

                {/* 토스트 */}
                {toast && (
                    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium shadow-xl whitespace-nowrap animate-[fadeInUp_0.25s_ease]">
                            <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                            {toast.msg}
                        </div>
                    </div>
                )}

                {/* 푸터 액션 */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={handleBulkDelete}
                        disabled={selected.size === 0}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Trash2 size={14} />
                        일괄 삭제
                    </button>
                    <button
                        type="button"
                        onClick={handleBulkAdd}
                        disabled={selected.size === 0}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Plus size={14} />
                        일괄 추가
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default WbsAdminModal;
