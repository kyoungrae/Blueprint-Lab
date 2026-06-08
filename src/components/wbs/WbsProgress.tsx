import React, { useMemo } from 'react';
import { useWbsStore, calcMenuProgress, calcOverallProgress } from '../../store/wbsStore';
import { WBS_STATUS_ORDER, WBS_STATUS_LABEL, type WbsStatus } from '../../types/wbs';

const STATUS_COLOR: Record<WbsStatus, string> = {
    TODO: 'bg-gray-400',
    IN_PROGRESS: 'bg-blue-500',
    DONE: 'bg-emerald-500',
    HOLD: 'bg-amber-500',
};

function parseDate(s: string): number | null {
    if (!s) return null;
    const t = new Date(s + 'T00:00:00').getTime();
    return Number.isNaN(t) ? null : t;
}

const DAY = 86400000;

const WbsProgress: React.FC = () => {
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);

    const overall = calcOverallProgress(rows);

    const statusCounts = useMemo(() => {
        const c: Record<WbsStatus, number> = { TODO: 0, IN_PROGRESS: 0, DONE: 0, HOLD: 0 };
        for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
        return c;
    }, [rows]);

    // 메뉴별 진행율 (행이 있는 메뉴만)
    const menuProgress = useMemo(
        () => menus.map((m) => ({ menu: m, progress: calcMenuProgress(rows, m.id), count: rows.filter((r) => r.menuId === m.id).length })),
        [menus, rows]
    );

    // 타임라인 범위
    const range = useMemo(() => {
        let min = Infinity, max = -Infinity;
        for (const r of rows) {
            const s = parseDate(r.startDate);
            const e = parseDate(r.endDate);
            if (s !== null) { min = Math.min(min, s); max = Math.max(max, s); }
            if (e !== null) { min = Math.min(min, e); max = Math.max(max, e); }
        }
        if (min === Infinity) return null;
        if (max === min) max = min + DAY;
        return { min, max, span: max - min };
    }, [rows]);

    const menuNameById = useMemo(() => new Map(menus.map((m) => [m.id, m.name])), [menus]);
    const ganttRows = useMemo(
        () => rows
            .map((r) => ({ r, s: parseDate(r.startDate), e: parseDate(r.endDate) }))
            .filter((x) => x.s !== null && x.e !== null) as { r: typeof rows[number]; s: number; e: number }[],
        [rows]
    );

    const fmt = (t: number) => {
        const d = new Date(t);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    return (
        <div className="h-full overflow-auto bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* 전체 진척 + 상태 */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-center">
                        <span className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">전체 진행율</span>
                        <div className="flex items-end gap-2 mb-3">
                            <span className="text-5xl font-black text-emerald-600 tabular-nums leading-none">{overall}</span>
                            <span className="text-2xl font-black text-emerald-400 mb-0.5">%</span>
                        </div>
                        <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${overall}%` }} />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-2">전체 {rows.length}개 산출물 · 메뉴 {menus.length}개</p>
                    </div>

                    <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <span className="text-xs font-black text-gray-400 uppercase tracking-wider">상태 분포</span>
                        <div className="grid grid-cols-4 gap-3 mt-4">
                            {WBS_STATUS_ORDER.map((s) => (
                                <div key={s} className="rounded-xl bg-gray-50 p-3 text-center">
                                    <div className="flex items-center justify-center gap-1.5 mb-1">
                                        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLOR[s]}`} />
                                        <span className="text-xs font-bold text-gray-500">{WBS_STATUS_LABEL[s]}</span>
                                    </div>
                                    <span className="text-2xl font-black text-gray-800 tabular-nums">{statusCounts[s]}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 메뉴별 진행율 */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h3 className="text-sm font-black text-gray-700 mb-4">메뉴별 진행율</h3>
                    {menuProgress.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">메뉴가 없습니다.</p>
                    ) : (
                        <div className="space-y-3">
                            {menuProgress.map(({ menu, progress, count }) => (
                                <div key={menu.id} className="flex items-center gap-3">
                                    <div className="w-48 shrink-0 truncate text-sm text-gray-700" title={menu.name}>
                                        <span className="font-mono text-[10px] text-gray-400 mr-1.5">{menu.menuCode}</span>
                                        {menu.name}
                                    </div>
                                    <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-emerald-500' : 'bg-emerald-400'}`} style={{ width: `${progress}%` }} />
                                    </div>
                                    <span className="w-12 text-right text-sm font-bold text-gray-700 tabular-nums">{progress}%</span>
                                    <span className="w-12 text-right text-[11px] text-gray-400">{count}건</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 간이 간트(타임라인) */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-gray-700">일정 타임라인</h3>
                        {range && <span className="text-[11px] text-gray-400">{fmt(range.min)} ~ {fmt(range.max)}</span>}
                    </div>
                    {!range || ganttRows.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">시작일·종료일이 입력된 산출물이 없습니다.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {ganttRows.map(({ r, s, e }) => {
                                const left = ((s - range.min) / range.span) * 100;
                                const width = Math.max(((e - s) / range.span) * 100, 1.5);
                                return (
                                    <div key={r.id} className="flex items-center gap-3">
                                        <div className="w-56 shrink-0 truncate text-xs text-gray-600" title={`${menuNameById.get(r.menuId) ?? ''} · ${r.featureName}`}>
                                            <span className="text-gray-400">{menuNameById.get(r.menuId) ?? ''}</span>
                                            {r.featureName ? <span className="text-gray-700"> · {r.featureName}</span> : null}
                                        </div>
                                        <div className="relative flex-1 h-5 bg-gray-50 rounded">
                                            <div
                                                className={`absolute top-0.5 bottom-0.5 rounded ${STATUS_COLOR[r.status]} opacity-90`}
                                                style={{ left: `${left}%`, width: `${width}%` }}
                                                title={`${r.startDate} ~ ${r.endDate} (${r.progress}%)`}
                                            >
                                                <div className="h-full bg-white/30 rounded-l" style={{ width: `${100 - r.progress}%`, marginLeft: 'auto' }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WbsProgress;
