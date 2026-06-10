import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useWbsStore } from '../../store/wbsStore';
import type { WbsDetailSchedule, ScheduleStatus } from '../../types/wbs';

// ── 날짜 유틸 ──────────────────────────────────────────────────────────────
function parseDate(iso: string): Date {
    if (!iso) return new Date(NaN);
    const parts = iso.replace(/\./g, '-').split('-');
    if (parts.length === 3) {
        const [y, m, d] = parts;
        return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`);
    }
    return new Date(`${iso}T00:00:00`);
}

function diffDays(start: string, end: string): number {
    const s = parseDate(start);
    const e = parseDate(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

function toInputDate(iso: string): string {
    if (!iso) return '';
    return iso.replace(/\./g, '-').replace(/(\d{4})-(\d{1,2})-(\d{1,2})/, (_, y, m, d) =>
        `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
    );
}

function fromInputDate(input: string): string {
    return input.replace(/-/g, '.');
}

// ── 상태 배지 ──────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<ScheduleStatus, string> = {
    완료: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    진행중: 'bg-blue-100 text-blue-700 border-blue-200',
    대기: 'bg-gray-100 text-gray-500 border-gray-200',
};

const STATUS_OPTIONS: ScheduleStatus[] = ['완료', '진행중', '대기'];

// ── 트리 평탄화 ──────────────────────────────────────────────────────────
interface FlatNode extends WbsDetailSchedule {
    depth: number;
    themeIndex: number;
}

function buildFlatTree(
    items: WbsDetailSchedule[],
    collapsed: Set<string>,
): FlatNode[] {
    const byParent = new Map<string | null, WbsDetailSchedule[]>();
    for (const item of items) {
        const key = item.parentId ?? null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(item);
    }
    for (const arr of byParent.values()) arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const result: FlatNode[] = [];
    const themeMap = new Map<string, number>();
    let rootIdx = 0;

    function dfs(parentId: string | null, depth: number) {
        for (const item of byParent.get(parentId) ?? []) {
            const themeIndex = depth === 0
                ? (themeMap.has(item.id) ? themeMap.get(item.id)! : rootIdx++)
                : (themeMap.get(item.parentId ?? '') ?? 0);
            themeMap.set(item.id, themeIndex);
            result.push({ ...item, depth, themeIndex });
            if (!collapsed.has(item.id)) dfs(item.id, depth + 1);
        }
    }
    dfs(null, 0);
    return result;
}

// ── 인라인 편집 셀 (InlineTitle과 동일 방식) ────────────────────────────
const EditCell: React.FC<{
    value: string;
    onSave: (v: string) => void;
    placeholder?: string;
    className?: string;
    type?: 'text' | 'date';
}> = ({ value, onSave, placeholder = '', className = '', type = 'text' }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

    const commit = () => {
        const trimmed = type === 'date' ? draft : draft.trim();
        if (type !== 'date' && !trimmed) setDraft(value);
        else onSave(type === 'date' ? fromInputDate(trimmed) : trimmed);
        setEditing(false);
    };

    if (editing) {
        return (
            <input
                ref={inputRef}
                type={type}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setDraft(type === 'date' ? toInputDate(value) : value); setEditing(false); }
                }}
                className={`w-full bg-transparent border-b-2 border-blue-400 outline-none py-0.5 ${className}`}
            />
        );
    }

    return (
        <span
            onDoubleClick={() => { setDraft(type === 'date' ? toInputDate(value) : value); setEditing(true); }}
            className={`block w-full min-h-[18px] cursor-pointer hover:text-blue-600 transition-colors whitespace-normal break-keep leading-snug ${className}`}
            title="더블클릭하여 편집"
        >
            {value || <span className="text-gray-300 font-normal">{placeholder}</span>}
        </span>
    );
};

// ── 상태 셀렉트 ───────────────────────────────────────────────────────────
const StatusCell: React.FC<{
    value?: ScheduleStatus;
    onSave: (v: ScheduleStatus) => void;
}> = ({ value, onSave }) => {
    const [open, setOpen] = useState(false);
    const current = value ?? '대기';
    return (
        <div className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                className={`text-[10px] font-bold border rounded px-1.5 py-0.5 ${STATUS_STYLE[current]}`}
            >
                {current}
            </button>
            {open && (
                <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {STATUS_OPTIONS.map((s) => (
                        <button
                            key={s}
                            onClick={() => { onSave(s); setOpen(false); }}
                            className={`block w-full text-left px-3 py-1.5 text-[11px] font-bold hover:bg-gray-50 ${s === current ? 'text-blue-600' : 'text-gray-700'}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
const WbsScheduleTable: React.FC = () => {
    const detailSchedules = useWbsStore((s) => s.detailSchedules);
    const updateDetailSchedule = useWbsStore((s) => s.updateDetailSchedule);
    const addDetailSchedule = useWbsStore((s) => s.addDetailSchedule);
    const deleteDetailSchedule = useWbsStore((s) => s.deleteDetailSchedule);
    const applySeedData = useWbsStore((s) => s.applySeedData);

    // 최초 마운트 시 seed 데이터 적용 (작업자·산출물·실적일·진척도 일괄 반영)
    const seedApplied = useRef(false);
    useEffect(() => {
        if (seedApplied.current) return;
        seedApplied.current = true;
        applySeedData();
    }, [applySeedData]);

    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const flatRows = useMemo(() => buildFlatTree(detailSchedules, collapsed), [detailSchedules, collapsed]);

    const toggleCollapse = (id: string) =>
        setCollapsed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

    const hasChildren = (id: string) => detailSchedules.some((s) => s.parentId === id);

    const upd = (id: string, patch: Partial<Omit<WbsDetailSchedule, 'id'>>) =>
        updateDetailSchedule(id, patch);

    // 전체 통계
    const totals = useMemo(() => {
        const leaves = detailSchedules.filter((s) => !hasChildren(s.id));
        const planDays = leaves.reduce((sum, s) => sum + diffDays(s.startDate, s.endDate), 0);
        const actualDays = leaves.reduce((sum, s) => sum + diffDays(s.actualStartDate ?? '', s.actualEndDate ?? ''), 0);
        const avgProgress = leaves.length ? Math.round(leaves.reduce((sum, s) => sum + (s.progress ?? 0), 0) / leaves.length) : 0;
        return { planDays, actualDays, avgProgress };
    }, [detailSchedules]);

    const DEPTH_COLORS = [
        'bg-blue-50 font-bold text-blue-900',
        'bg-gray-50 font-semibold text-gray-800',
        'bg-white font-normal text-gray-700',
        'bg-white font-normal text-gray-600',
    ];

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* 상단 액션 바 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-white shrink-0">
                <div>
                    <h2 className="text-sm font-black text-gray-900">일정 상세</h2>
                    <p className="text-[11px] text-gray-400">항목을 더블클릭하여 편집 · 진척율은 하위 항목 평균으로 자동 계산</p>
                </div>
                <button
                    onClick={() => addDetailSchedule({ parentId: null, order: 9999, title: '새 대분류', startDate: '', endDate: '', progress: 0 })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                    <Plus size={13} /> 최상위 항목 추가
                </button>
            </div>

            {/* 테이블 */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-xs border-collapse" style={{ minWidth: 1400 }}>
                    <thead className="sticky top-0 z-20">
                        {/* 1행: 그룹 헤더 */}
                        <tr className="bg-slate-700 text-white">
                            <th colSpan={2} className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black">구분</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black">작업자</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black">산출물명</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black">완료기준</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black">상태</th>
                            <th colSpan={4} className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black bg-indigo-800">계획</th>
                            <th colSpan={4} className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black bg-emerald-800">실적</th>
                            <th className="border border-slate-600 w-8" />
                        </tr>
                        {/* 2행: 세부 헤더 */}
                        <tr className="bg-slate-600 text-white">
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24">대분류</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-48">세부항목</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-28">작업자</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-32">산출물명</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24">완료기준</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16">상태</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24 bg-indigo-700/60">시작일</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24 bg-indigo-700/60">종료일</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16 bg-indigo-700/60">계획일</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16 bg-indigo-700/60">계획율</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24 bg-emerald-700/60">시작일</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24 bg-emerald-700/60">종료일</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16 bg-emerald-700/60">투입일</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16 bg-emerald-700/60">진척도</th>
                            <th className="border border-slate-500 w-8" />
                        </tr>
                        {/* 전체 합계 행 */}
                        <tr className="bg-slate-100 border-b-2 border-slate-300">
                            <td colSpan={2} className="border border-slate-200 px-2 py-1.5 font-black text-slate-700 text-[11px]">전체(진행율)</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-slate-500">-</td>
                            <td colSpan={3} className="border border-slate-200" />
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-indigo-700">{detailSchedules[0]?.startDate || '-'}</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-indigo-700">{detailSchedules[0] ? detailSchedules.reduce((latest, s) => s.endDate > latest ? s.endDate : latest, '') : '-'}</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-indigo-700">{totals.planDays}일</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-indigo-700">-</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-emerald-700">-</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-emerald-700">-</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-emerald-700">{totals.actualDays}일</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center font-black text-[11px] text-emerald-700">{totals.avgProgress}%</td>
                            <td className="border border-slate-200" />
                        </tr>
                    </thead>
                    <tbody>
                        {flatRows.map((node) => {
                            const isParent = hasChildren(node.id);
                            const isCollapsed = collapsed.has(node.id);
                            const planDays = diffDays(node.startDate, node.endDate);
                            const actualDays = diffDays(node.actualStartDate ?? '', node.actualEndDate ?? '');
                            const rowBg = isParent
                                ? node.depth === 0 ? 'bg-blue-50/70' : 'bg-slate-50/80'
                                : 'bg-white';

                            // 대분류 / 세부항목 구분: depth 0,1 = 대분류, depth 2+ = 세부항목
                            const isCategory = node.depth <= 1;

                            return (
                                <tr
                                    key={node.id}
                                    className={`border-b border-gray-100 hover:bg-sky-50/50 transition-colors group ${rowBg}`}
                                >
                                    {/* 대분류 */}
                                    <td className="border border-gray-100 px-2 py-1.5 align-top">
                                        {isCategory && (
                                            <div className="flex items-center gap-1" style={{ paddingLeft: node.depth * 8 }}>
                                                {isParent && (
                                                    <button
                                                        onClick={() => toggleCollapse(node.id)}
                                                        className="shrink-0 text-gray-400 hover:text-gray-700"
                                                    >
                                                        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                                    </button>
                                                )}
                                                <EditCell
                                                    value={node.title}
                                                    onSave={(v) => upd(node.id, { title: v })}
                                                    placeholder="항목명"
                                                    className={`text-[11px] ${isParent ? 'font-bold' : 'font-normal'}`}
                                                />
                                            </div>
                                        )}
                                    </td>

                                    {/* 세부항목 */}
                                    <td className="border border-gray-100 px-2 py-1.5 align-top">
                                        {!isCategory && (
                                            <div className="flex items-center gap-1">
                                                <EditCell
                                                    value={node.title}
                                                    onSave={(v) => upd(node.id, { title: v })}
                                                    placeholder="세부항목명"
                                                    className="text-[11px]"
                                                />
                                            </div>
                                        )}
                                    </td>

                                    {/* 작업자 */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center align-top">
                                        <EditCell
                                            value={node.worker ?? ''}
                                            onSave={(v) => upd(node.id, { worker: v })}
                                            placeholder="-"
                                            className="text-[11px] text-center"
                                        />
                                    </td>

                                    {/* 산출물명 */}
                                    <td className="border border-gray-100 px-2 py-1.5 align-top">
                                        <EditCell
                                            value={node.deliverable ?? ''}
                                            onSave={(v) => upd(node.id, { deliverable: v })}
                                            placeholder="-"
                                            className="text-[11px]"
                                        />
                                    </td>

                                    {/* 완료기준 */}
                                    <td className="border border-gray-100 px-2 py-1.5 align-top">
                                        <EditCell
                                            value={node.completionCriteria ?? ''}
                                            onSave={(v) => upd(node.id, { completionCriteria: v })}
                                            placeholder="-"
                                            className="text-[11px]"
                                        />
                                    </td>

                                    {/* 상태 */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center align-top">
                                        <StatusCell
                                            value={node.status}
                                            onSave={(v) => upd(node.id, { status: v })}
                                        />
                                    </td>

                                    {/* 계획 시작일 */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center align-top bg-indigo-50/30">
                                        <EditCell
                                            value={node.startDate}
                                            onSave={(v) => upd(node.id, { startDate: v })}
                                            type="date"
                                            className="text-[11px] text-indigo-700 text-center"
                                        />
                                    </td>

                                    {/* 계획 종료일 */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center align-top bg-indigo-50/30">
                                        <EditCell
                                            value={node.endDate}
                                            onSave={(v) => upd(node.id, { endDate: v })}
                                            type="date"
                                            className="text-[11px] text-indigo-700 text-center"
                                        />
                                    </td>

                                    {/* 계획일 */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center text-[11px] text-indigo-600 bg-indigo-50/30 align-top">
                                        {planDays > 0 ? `${planDays}일` : '-'}
                                    </td>

                                    {/* 계획율 */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center text-[11px] bg-indigo-50/30 align-top">
                                        {isParent ? (
                                            <span className="text-indigo-600">-</span>
                                        ) : (
                                            <span className="text-indigo-700 font-bold">{node.progress ?? 0}%</span>
                                        )}
                                    </td>

                                    {/* 실적 시작일 */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center align-top bg-emerald-50/30">
                                        <EditCell
                                            value={node.actualStartDate ?? ''}
                                            onSave={(v) => upd(node.id, { actualStartDate: v })}
                                            type="date"
                                            placeholder="-"
                                            className="text-[11px] text-emerald-700 text-center"
                                        />
                                    </td>

                                    {/* 실적 종료일 */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center align-top bg-emerald-50/30">
                                        <EditCell
                                            value={node.actualEndDate ?? ''}
                                            onSave={(v) => upd(node.id, { actualEndDate: v })}
                                            type="date"
                                            placeholder="-"
                                            className="text-[11px] text-emerald-700 text-center"
                                        />
                                    </td>

                                    {/* 투입일 */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center text-[11px] text-emerald-600 bg-emerald-50/30 align-top">
                                        {actualDays > 0 ? `${actualDays}일` : '-'}
                                    </td>

                                    {/* 진척도 */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center bg-emerald-50/30 align-top">
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className={`text-[11px] font-black ${(node.progress ?? 0) >= 100 ? 'text-emerald-600' : (node.progress ?? 0) > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                {node.progress ?? 0}%
                                            </span>
                                            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${(node.progress ?? 0) >= 100 ? 'bg-emerald-500' : (node.progress ?? 0) > 0 ? 'bg-blue-500' : 'bg-gray-300'}`}
                                                    style={{ width: `${node.progress ?? 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    </td>

                                    {/* 추가/삭제 */}
                                    <td className="border border-gray-100 px-1 py-1.5 text-center align-top">
                                        <div className="flex items-center justify-center gap-0.5">
                                            <button
                                                onClick={() => {
                                                    const siblings = detailSchedules.filter((s) => (s.parentId ?? null) === node.id);
                                                    const maxOrder = siblings.length ? Math.max(...siblings.map((s) => s.order ?? 0)) + 1 : 0;
                                                    addDetailSchedule({ parentId: node.id, order: maxOrder, title: '새 항목', startDate: node.startDate, endDate: node.endDate, progress: 0 });
                                                    setCollapsed((prev) => { const next = new Set(prev); next.delete(node.id); return next; });
                                                }}
                                                className="p-1 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                                                title="하위 항목 추가"
                                            >
                                                <Plus size={12} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (window.confirm(`"${node.title}" 항목을 삭제하시겠습니까?${hasChildren(node.id) ? '\n\n하위 항목도 함께 삭제됩니다.' : ''}`)) {
                                                        deleteDetailSchedule(node.id);
                                                    }
                                                }}
                                                className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                                title="항목 삭제"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {/* 빈 상태 */}
                        {flatRows.length === 0 && (
                            <tr>
                                <td colSpan={15} className="text-center py-16 text-gray-400 text-sm">
                                    GANTT CHART 탭에서 항목을 추가하거나 엑셀을 업로드하세요.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default WbsScheduleTable;
