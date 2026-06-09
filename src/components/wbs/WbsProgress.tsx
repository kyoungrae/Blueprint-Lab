import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronDown, ChevronsDownUp, ChevronsUpDown, Lock, LockOpen, CalendarDays } from 'lucide-react';
import { useWbsStore, calcMenuProgress, calcOverallProgress } from '../../store/wbsStore';
import { WBS_STATUS_ORDER, WBS_STATUS_LABEL, type WbsStatus, type WbsMenuNode } from '../../types/wbs';
import { ASSIGNEE_PALETTE } from './WbsMenuTree';
import { useAuthStore } from '../../store/authStore';

const STATUS_COLOR: Record<WbsStatus, string> = {
    TODO: 'bg-gray-400',
    IN_PROGRESS: 'bg-blue-500',
    DONE: 'bg-emerald-500',
    HOLD: 'bg-amber-500',
};

/* ── 트리 타입 ──────────────────────────────── */
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
    return build(null, 0);
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
    return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

function parseDate(s: string): number | null {
    if (!s) return null;
    const t = new Date(s + 'T00:00:00').getTime();
    return Number.isNaN(t) ? null : t;
}

const DAY = 86400000;

const WbsProgress: React.FC = () => {
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);
    const projectSchedule = useWbsStore((s) => s.projectSchedule);
    const setProjectSchedule = useWbsStore((s) => s.setProjectSchedule);
    const { user } = useAuthStore();
    const isMaster = user?.tier === 'MASTER' || user?.tier === 'ADMIN';

    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    // 전체 일정 잠금/편집
    const [schedLocked, setSchedLocked] = useState(true);
    const [schedDraft, setSchedDraft] = useState({ startDate: '', endDate: '' });

    // 잠금 해제 시 드래프트 초기화
    const prevLocked = useRef(true);
    useEffect(() => {
        if (prevLocked.current && !schedLocked) {
            setSchedDraft({
                startDate: projectSchedule?.startDate ?? '',
                endDate: projectSchedule?.endDate ?? '',
            });
        }
        prevLocked.current = schedLocked;
    }, [schedLocked, projectSchedule]);

    const saveSchedule = () => {
        const { startDate, endDate } = schedDraft;
        if (startDate && endDate) setProjectSchedule({ startDate, endDate });
        else setProjectSchedule(null);
        setSchedLocked(true);
    };

    // 비 MASTER: 본인 이름이 담당자인 rows만 표시
    const myName = user?.name ?? '';
    const visibleRows = useMemo(
        () => isMaster ? rows : rows.filter((r) => r.assignee === myName),
        [isMaster, rows, myName]
    );

    const overall = calcOverallProgress(visibleRows);

    const statusCounts = useMemo(() => {
        const c: Record<WbsStatus, number> = { TODO: 0, IN_PROGRESS: 0, DONE: 0, HOLD: 0 };
        for (const r of visibleRows) c[r.status] = (c[r.status] || 0) + 1;
        return c;
    }, [visibleRows]);

    // 트리
    const tree = useMemo(() => buildTree(menus), [menus]);
    const flatNodes = useMemo(() => flattenTree(tree), [tree]);
    const allParentIds = useMemo(
        () => new Set(flatNodes.filter((n) => n.children.length > 0).map((n) => n.id)),
        [flatNodes]
    );

    const toggleCollapse = (id: string) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    const collapseAll = () => setCollapsed(new Set(allParentIds));
    const expandAll   = () => setCollapsed(new Set());

    // 간트 툴팁
    const [tooltip, setTooltip] = useState<{ x: number; y: number; menuId: string; featureName: string; s: number; e: number; progress: number; status: WbsStatus; count: number } | null>(null);

    // 담당자별 통계 (비 MASTER는 본인 카드만)
    const assigneeStats = useMemo(() => {
        const map = new Map<string, { rows: typeof rows }>();
        for (const r of visibleRows) {
            if (!r.assignee) continue;
            if (!map.has(r.assignee)) map.set(r.assignee, { rows: [] });
            map.get(r.assignee)!.rows.push(r);
        }
        return Array.from(map.entries())
            .map(([name, { rows: rs }], idx) => {
                const progress = Math.round(rs.reduce((a, r) => a + (r.progress || 0), 0) / rs.length);
                const statusCnt: Record<WbsStatus, number> = { TODO: 0, IN_PROGRESS: 0, DONE: 0, HOLD: 0 };
                for (const r of rs) statusCnt[r.status] = (statusCnt[r.status] || 0) + 1;
                return { name, progress, total: rs.length, statusCnt, colorIdx: idx % ASSIGNEE_PALETTE.length };
            })
            .sort((a, b) => b.progress - a.progress);
    }, [visibleRows]);

    // 타임라인 범위 (전체 일정 포함)
    const range = useMemo(() => {
        let min = Infinity, max = -Infinity;
        for (const r of visibleRows) {
            const s = parseDate(r.startDate);
            const e = parseDate(r.endDate);
            if (s !== null) { min = Math.min(min, s); max = Math.max(max, s); }
            if (e !== null) { min = Math.min(min, e); max = Math.max(max, e); }
        }
        if (projectSchedule) {
            const s = parseDate(projectSchedule.startDate);
            const e = parseDate(projectSchedule.endDate);
            if (s !== null) { min = Math.min(min, s); max = Math.max(max, s); }
            if (e !== null) { min = Math.min(min, e); max = Math.max(max, e); }
        }
        if (min === Infinity) return null;
        if (max === min) max = min + DAY;
        return { min, max, span: max - min };
    }, [visibleRows, projectSchedule]);

    const menuNameById = useMemo(() => new Map(menus.map((m) => [m.id, m.name])), [menus]);

    // 타임라인용: menuId + featureName이 같은 행들을 하나로 묶어 progress 평균 계산
    const ganttRows = useMemo(() => {
        const validRows = visibleRows
            .map((r) => ({ r, s: parseDate(r.startDate), e: parseDate(r.endDate) }))
            .filter((x) => x.s !== null && x.e !== null) as { r: typeof rows[number]; s: number; e: number }[];

        const groupMap = new Map<string, { rs: typeof validRows; menuId: string; featureName: string }>();
        for (const item of validRows) {
            const key = `${item.r.menuId}|${item.r.featureName}`;
            if (!groupMap.has(key)) {
                groupMap.set(key, { rs: [], menuId: item.r.menuId, featureName: item.r.featureName });
            }
            groupMap.get(key)!.rs.push(item);
        }

        return Array.from(groupMap.values()).map(({ rs, menuId, featureName }) => {
            const s = Math.min(...rs.map((x) => x.s));
            const e = Math.max(...rs.map((x) => x.e));
            const progress = Math.round(rs.reduce((acc, x) => acc + x.r.progress, 0) / rs.length);
            const statusPriority: Record<WbsStatus, number> = { DONE: 3, IN_PROGRESS: 2, HOLD: 1, TODO: 0 };
            const status = rs.reduce((best, x) =>
                statusPriority[x.r.status] > statusPriority[best] ? x.r.status : best,
                rs[0].r.status
            );
            return { menuId, featureName, s, e, progress, status, count: rs.length };
        });
    }, [rows]);

    const fmt = (t: number) => {
        const d = new Date(t);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    return (
        <>
        <div className="h-full overflow-auto bg-gray-50 p-6">
            <div className="space-y-4 h-full flex flex-col">
                {/* 상단 요약 바 — 전체 진행율 + 상태 분포 */}
                <div className="grid grid-cols-5 gap-4 shrink-0">
                    {/* 전체 진행율 */}
                    <div className="col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col justify-center">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">전체 진행율</span>
                        <div className="flex items-end gap-1.5 mb-2">
                            <span className="text-4xl font-black text-emerald-600 tabular-nums leading-none">{overall}</span>
                            <span className="text-xl font-black text-emerald-400 mb-0.5">%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${overall}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5">{visibleRows.length}개 산출물 · {menus.length}개 메뉴</p>
                    </div>

                    {/* 상태 분포 — 4칸 */}
                    {WBS_STATUS_ORDER.map((s) => (
                        <div key={s} className="col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col justify-center">
                            <div className="flex items-center gap-1.5 mb-2">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_COLOR[s]}`} />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{WBS_STATUS_LABEL[s]}</span>
                            </div>
                            <span className="text-4xl font-black text-gray-800 tabular-nums leading-none">{statusCounts[s]}</span>
                            <p className="text-[10px] text-gray-400 mt-1.5">건</p>
                        </div>
                    ))}
                </div>

                {/* 담당자별 진행율 카드 */}
                {assigneeStats.length > 0 && (
                    <div className="shrink-0">
                        <div className="flex items-center gap-2 mb-3">
                            <h3 className="text-sm font-black text-gray-700">담당자별 진행율</h3>
                            <span className="text-[11px] text-gray-400">{assigneeStats.length}명</span>
                        </div>
                        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(assigneeStats.length, 6)}, minmax(0, 1fr))` }}>
                            {assigneeStats.map(({ name, progress, total, statusCnt, colorIdx }) => {
                                const palette = ASSIGNEE_PALETTE[colorIdx];
                                const done = statusCnt.DONE;
                                const inProgress = statusCnt.IN_PROGRESS;
                                const hold = statusCnt.HOLD;
                                const todo = statusCnt.TODO;
                                return (
                                    <div key={name} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
                                        {/* 이름 + 진행율 */}
                                        <div className="flex items-start justify-between gap-2">
                                            <span className={`px-2 py-0.5 rounded-lg text-xs font-black border ${palette.badge}`}>
                                                {name}
                                            </span>
                                            <span className={`text-xl font-black tabular-nums leading-none ${progress === 100 ? 'text-emerald-600' : 'text-gray-800'}`}>
                                                {progress}<span className="text-sm font-bold text-gray-400">%</span>
                                            </span>
                                        </div>

                                        {/* 프로그레스 바 */}
                                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-400'}`}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>

                                        {/* 상태 미니 바 */}
                                        <div className="flex rounded-full overflow-hidden h-1.5 gap-px">
                                            {done     > 0 && <div className="bg-emerald-500" style={{ flex: done }} title={`완료 ${done}`} />}
                                            {inProgress > 0 && <div className="bg-blue-400"   style={{ flex: inProgress }} title={`진행중 ${inProgress}`} />}
                                            {hold     > 0 && <div className="bg-amber-400"  style={{ flex: hold }} title={`보류 ${hold}`} />}
                                            {todo     > 0 && <div className="bg-gray-200"   style={{ flex: todo }} title={`대기 ${todo}`} />}
                                        </div>

                                        {/* 수치 */}
                                        <div className="flex items-center justify-between text-[10px] text-gray-400">
                                            <span>총 {total}건</span>
                                            <div className="flex items-center gap-2">
                                                {done > 0 && <span className="text-emerald-600 font-bold">완료 {done}</span>}
                                                {inProgress > 0 && <span className="text-blue-500 font-bold">진행 {inProgress}</span>}
                                                {hold > 0 && <span className="text-amber-500 font-bold">보류 {hold}</span>}
                                                {todo > 0 && <span>대기 {todo}</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 하단 2열 — 메뉴별 진행율(트리) | 일정 타임라인 */}
                <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">

                    {/* ── 메뉴별 진행율 트리 ── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0">
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-50 shrink-0">
                            <h3 className="text-sm font-black text-gray-700">메뉴별 진행율</h3>
                            {allParentIds.size > 0 && (
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={expandAll}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                                    >
                                        <ChevronsUpDown size={12} /> 전체 펼치기
                                    </button>
                                    <button
                                        type="button"
                                        onClick={collapseAll}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                                    >
                                        <ChevronsDownUp size={12} /> 전체 접기
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 overflow-auto px-4 py-3 min-h-0">
                            {tree.length === 0 ? (
                                <p className="text-sm text-gray-400 py-8 text-center">메뉴가 없습니다.</p>
                            ) : (
                                <div className="space-y-0.5">
                                    {(function renderNodes(nodes: TreeNode[]): React.ReactNode {
                                        return nodes.map((node) => {
                                            const progress = calcMenuProgress(menus, visibleRows, node.id);
                                            const count = visibleRows.filter((r) => r.menuId === node.id && !r.isDebugging).length;
                                            const hasChildren = node.children.length > 0;
                                            const isCollapsed = collapsed.has(node.id);
                                            const isLeaf = !hasChildren;
                                            const barColor = progress === 100
                                                ? 'bg-emerald-500'
                                                : isLeaf ? 'bg-emerald-400' : 'bg-blue-400';

                                            return (
                                                <div key={node.id}>
                                                    <div
                                                        className="flex items-center gap-2 py-1.5 rounded-lg"
                                                        style={{ paddingLeft: node.depth * 18 }}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => hasChildren && toggleCollapse(node.id)}
                                                            className={`shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${
                                                                hasChildren
                                                                    ? 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer'
                                                                    : 'text-transparent cursor-default'
                                                            }`}
                                                        >
                                                            {hasChildren
                                                                ? (isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />)
                                                                : <ChevronRight size={13} />}
                                                        </button>
                                                        <div className="w-40 shrink-0 flex items-center gap-1 min-w-0 truncate" title={node.name}>
                                                            <span className="font-mono text-[9px] font-bold text-indigo-400 shrink-0">{node.menuCode}</span>
                                                            <span className={`truncate text-xs ${hasChildren ? 'font-bold text-gray-800' : 'text-gray-600'}`}>
                                                                {node.name}
                                                            </span>
                                                        </div>
                                                        <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                                                style={{ width: `${progress}%` }}
                                                            />
                                                        </div>
                                                        <span className={`w-10 text-right text-xs font-black tabular-nums shrink-0 ${progress === 100 ? 'text-emerald-600' : 'text-gray-700'}`}>
                                                            {progress}%
                                                        </span>
                                                        <span className="w-8 text-right text-[10px] text-gray-400 tabular-nums shrink-0">
                                                            {isLeaf ? `${count}건` : `${node.children.length}개`}
                                                        </span>
                                                    </div>
                                                    {hasChildren && !isCollapsed && renderNodes(node.children)}
                                                </div>
                                            );
                                        });
                                    })(tree)}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── 일정 타임라인 ── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0">
                        {/* 헤더: 타이틀 + 전체 일정 입력/잠금 */}
                        <div className="px-5 pt-4 pb-3 border-b border-gray-50 shrink-0 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-gray-700">일정 타임라인</h3>
                                {range && <span className="text-[11px] text-gray-400">{fmt(range.min)} ~ {fmt(range.max)}</span>}
                            </div>

                            {/* 전체 일정 행 */}
                            <div className="flex items-center gap-2">
                                <CalendarDays size={13} className="text-indigo-400 shrink-0" />
                                <span className="text-[11px] font-black text-gray-500 shrink-0">전체 일정</span>

                                {schedLocked ? (
                                    /* 잠금 상태: 날짜 텍스트 표시 */
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                        {projectSchedule ? (
                                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                                                {projectSchedule.startDate} ~ {projectSchedule.endDate}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">미설정</span>
                                        )}
                                        {isMaster ? (
                                            <button
                                                type="button"
                                                onClick={() => setSchedLocked(false)}
                                                className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-700 transition-colors shrink-0"
                                            >
                                                <Lock size={11} /> 잠금 해제
                                            </button>
                                        ) : (
                                            <span className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-gray-300 border border-gray-100 shrink-0 cursor-not-allowed select-none" title="MASTER 등급만 수정할 수 있습니다">
                                                <Lock size={11} /> 수정 불가
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    /* 편집 상태: 날짜 입력 (MASTER only) */
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <input
                                            type="date"
                                            value={schedDraft.startDate}
                                            onChange={(e) => setSchedDraft((d) => ({ ...d, startDate: e.target.value }))}
                                            className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                                        />
                                        <span className="text-gray-400 text-xs shrink-0">~</span>
                                        <input
                                            type="date"
                                            value={schedDraft.endDate}
                                            onChange={(e) => setSchedDraft((d) => ({ ...d, endDate: e.target.value }))}
                                            className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                                        />
                                        <button
                                            type="button"
                                            onClick={saveSchedule}
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shrink-0"
                                        >
                                            <LockOpen size={11} /> 저장 · 잠금
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSchedLocked(true)}
                                            className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                                        >
                                            취소
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto px-4 py-3 min-h-0">
                            {!range && !projectSchedule ? (
                                <p className="text-sm text-gray-400 py-8 text-center">전체 일정을 설정하거나 산출물에 시작일·종료일을 입력하세요.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {/* 전체 일정 바 */}
                                    {projectSchedule && range && (() => {
                                        const ps = parseDate(projectSchedule.startDate);
                                        const pe = parseDate(projectSchedule.endDate);
                                        if (ps === null || pe === null) return null;
                                        const left = ((ps - range.min) / range.span) * 100;
                                        const width = Math.max(((pe - ps) / range.span) * 100, 1.5);
                                        return (
                                            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-dashed border-gray-100">
                                                <div className="w-44 shrink-0 flex items-center gap-1">
                                                    <CalendarDays size={11} className="text-indigo-400 shrink-0" />
                                                    <span className="text-[11px] font-black text-indigo-600 truncate">전체 일정</span>
                                                </div>
                                                <div className="relative flex-1 h-5 bg-indigo-50 rounded">
                                                    <div
                                                        className="absolute top-0.5 bottom-0.5 rounded bg-indigo-500/80 flex items-center px-2"
                                                        style={{ left: `${left}%`, width: `${width}%` }}
                                                    >
                                                        <span className="text-[9px] font-black text-white truncate leading-none">
                                                            {projectSchedule.startDate} ~ {projectSchedule.endDate}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* 산출물 행들 (동일 featureName 통합) */}
                                    {range && ganttRows.map(({ menuId, featureName, s, e, progress, status, count }) => {
                                        const key = `${menuId}|${featureName}`;
                                        const left = ((s - range.min) / range.span) * 100;
                                        const width = Math.max(((e - s) / range.span) * 100, 1.5);
                                        return (
                                            <div key={key} className="flex items-center gap-2">
                                                <div className="w-44 shrink-0 truncate text-xs text-gray-600" title={`${menuNameById.get(menuId) ?? ''} · ${featureName}`}>
                                                    <span className="text-gray-400">{menuNameById.get(menuId) ?? ''}</span>
                                                    {featureName ? <span className="text-gray-700"> · {featureName}</span> : null}
                                                </div>
                                                <div className="relative flex-1 h-5 bg-gray-50 rounded">
                                                    <div
                                                        className={`absolute top-0.5 bottom-0.5 rounded ${STATUS_COLOR[status]} opacity-90 cursor-pointer`}
                                                        style={{ left: `${left}%`, width: `${width}%` }}
                                                        onMouseMove={(ev) => setTooltip({ x: ev.clientX, y: ev.clientY, menuId, featureName, s, e, progress, status, count })}
                                                        onMouseLeave={() => setTooltip(null)}
                                                    >
                                                        <div className="h-full bg-white/30 rounded-l" style={{ width: `${100 - progress}%`, marginLeft: 'auto' }} />
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-black tabular-nums shrink-0 w-8 text-right text-gray-500">{progress}%</span>
                                            </div>
                                        );
                                    })}

                                    {range && ganttRows.length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-4">시작일·종료일이 입력된 산출물이 없습니다.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>

        {/* 간트 스마트 툴팁 */}
        {tooltip && createPortal(
            <div
                className="pointer-events-none fixed z-[9999]"
                style={{
                    // 오른쪽 끝에서 툴팁이 잘리지 않도록: 뷰포트 우측 220px 이내면 왼쪽으로 표시
                    left: tooltip.x + 220 > window.innerWidth ? tooltip.x - 174 : tooltip.x + 14,
                    top: tooltip.y - 10,
                }}
            >
                <div className="bg-gray-900 text-white text-xs font-medium rounded-xl px-3 py-2 shadow-xl flex flex-col gap-1 min-w-[160px]">
                    {tooltip.featureName && (
                        <span className="font-bold text-white truncate max-w-[200px]">{tooltip.featureName}</span>
                    )}
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-emerald-400"
                                style={{ width: `${tooltip.progress}%` }}
                            />
                        </div>
                        <span className="font-black text-emerald-400 tabular-nums">{tooltip.progress}%</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-400 pt-0.5 border-t border-white/10">
                        <span>{fmt(tooltip.s)} ~ {fmt(tooltip.e)}</span>
                        <div className="flex items-center gap-1.5">
                            {tooltip.count > 1 && <span className="text-gray-500">{tooltip.count}건 평균</span>}
                            <span className={`font-bold ${
                                tooltip.status === 'DONE' ? 'text-emerald-400'
                                : tooltip.status === 'IN_PROGRESS' ? 'text-blue-400'
                                : tooltip.status === 'HOLD' ? 'text-amber-400'
                                : 'text-gray-400'
                            }`}>
                                {WBS_STATUS_LABEL[tooltip.status]}
                            </span>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        )}
        </>
    );
};

export default WbsProgress;
