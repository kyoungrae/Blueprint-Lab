import React, { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import WheelDatePicker, { WheelProgressPicker } from './WheelDatePicker';
import { buildAssigneeMenuDateRanges, formatWbsDuration } from './wbsDateUtils';
import {
    menuPathParts,
    sortWbsDevRows,
    wbsPathDepth,
    WBS_GROUP_ROW_BG,
    confirmDeleteWbsRow,
} from './wbsDevRowUtils';
import { getAllAssignees, getFilteredMenuIds } from './wbsDevFilterUtils';
import WbsDevDetailFilterBar from './WbsDevDetailFilterBar';
import { StatusCell, CategoryCell, AssigneeCell, ImeSafeTextInput, LockTooltip } from './WbsDevDetail';
import { useWbsStore } from '../../store/wbsStore';
import { useProjectStore } from '../../store/projectStore';
import { useWbsEditingStore } from '../../store/wbsEditingStore';
import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';
import { isWbsDebugingCategoryRow } from '../../types/wbs';

const cellInput = 'w-full bg-transparent px-2 py-1.5 text-[11px] outline-none focus:bg-emerald-50/50 rounded';

interface WbsDevDetailExcelViewProps {
    menuSearch: string;
    onMenuSearchChange: (value: string) => void;
    activeAssignees: Set<string>;
    onToggleAssignee: (name: string) => void;
    onClearAssignees: () => void;
}

const WbsDevDetailExcelView: React.FC<WbsDevDetailExcelViewProps> = ({
    menuSearch,
    onMenuSearchChange,
    activeAssignees,
    onToggleAssignee,
    onClearAssignees,
}) => {
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);
    const updateRow = useWbsStore((s) => s.updateRow);
    const deleteRow = useWbsStore((s) => s.deleteRow);

    const editingMap = useWbsEditingStore((s) => s.editing);
    const emitFocus = useSyncStore((s) => s.emitWbsFieldFocus);
    const emitBlur = useSyncStore((s) => s.emitWbsFieldBlur);
    const currentUserId = useAuthStore((s) => s.user?.id);

    const currentProjectId = useProjectStore((s) => s.currentProjectId);
    const projects = useProjectStore((s) => s.projects);
    const projectMembers = useMemo(() => {
        const project = projects.find((p) => p.id === currentProjectId);
        return (project?.members ?? []).map((m, i) => ({ id: m.id, name: m.name, colorIdx: i }));
    }, [projects, currentProjectId]);

    const menuCodeById = useMemo(() => new Map(menus.map((m) => [m.id, m.menuCode])), [menus]);
    const allAssignees = useMemo(() => getAllAssignees(rows), [rows]);
    const assigneeColorIdx = useMemo(() => {
        const map = new Map<string, number>();
        allAssignees.forEach((a, i) => map.set(a, i));
        return map;
    }, [allAssignees]);

    const filteredMenuIds = useMemo(
        () => getFilteredMenuIds(menus, rows, menuSearch, activeAssignees),
        [menus, rows, menuSearch, activeAssignees],
    );

    const sortedRows = useMemo(() => {
        const base = sortWbsDevRows(menus, rows);
        if (filteredMenuIds === null) return base;
        return base.filter((r) => filteredMenuIds.has(r.menuId));
    }, [menus, rows, filteredMenuIds]);
    const pathDepth = useMemo(() => wbsPathDepth(menus, rows), [menus, rows]);

    const debugUnlockedByMenu = useMemo(() => {
        const map = new Map<string, boolean>();
        for (const menu of menus) {
            const menuRows = rows.filter((r) => r.menuId === menu.id);
            const normalRows = menuRows.filter((r) => !isWbsDebugingCategoryRow(r));
            map.set(
                menu.id,
                normalRows.length > 0 && normalRows.every((r) => r.progress === 100 && r.status === 'DONE'),
            );
        }
        return map;
    }, [menus, rows]);

    const assigneeMenuRangesMap = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildAssigneeMenuDateRanges>>();
        for (const r of rows) {
            const name = r.assignee.trim();
            if (!name || map.has(name)) continue;
            map.set(name, buildAssigneeMenuDateRanges(name, menus, rows));
        }
        return map;
    }, [rows, menus]);

    let groupColorIdx = -1;
    let lastMenuId = '';

    const totals = useMemo(() => {
        const done = sortedRows.filter((r) => r.status === 'DONE').length;
        const avg = sortedRows.length
            ? Math.round(sortedRows.reduce((sum, r) => sum + (r.progress ?? 0), 0) / sortedRows.length)
            : 0;
        return { count: sortedRows.length, done, avg };
    }, [sortedRows]);

    const hasActiveFilter = filteredMenuIds !== null;
    const isEmptyFilter = hasActiveFilter && filteredMenuIds!.size === 0;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-white shrink-0 gap-4">
                <div className="shrink-0">
                    <h2 className="text-sm font-black text-gray-900">개발 상세 · 엑셀형태</h2>
                    <p className="text-[11px] text-gray-400">
                        엑셀 다운로드 개발상세 시트와 동일한 열 구조 · {totals.count}행
                        {hasActiveFilter ? ' (필터 적용)' : ''}
                    </p>
                </div>
                <div className="flex-1 min-w-0 max-w-2xl">
                    <WbsDevDetailFilterBar
                        allAssignees={allAssignees}
                        assigneeColorIdx={assigneeColorIdx}
                        activeAssignees={activeAssignees}
                        onToggleAssignee={onToggleAssignee}
                        onClearAssignees={onClearAssignees}
                        menuSearch={menuSearch}
                        onMenuSearchChange={onMenuSearchChange}
                        layout="inline"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                {isEmptyFilter ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                        검색 결과가 없습니다.
                    </div>
                ) : (
                <table className="w-full text-xs border-collapse" style={{ minWidth: 1260 + pathDepth * 120 }}>
                    <thead className="sticky top-0 z-20">
                        <tr className="bg-slate-700 text-white">
                            {Array.from({ length: pathDepth }, (_, i) => (
                                <th key={i} className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[92px]">
                                    메뉴경로
                                </th>
                            ))}
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black w-20">메뉴코드</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black w-24">구분(산출물)</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[156px]">기능명</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black w-20">담당자</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[132px] w-[132px] bg-indigo-800">시작일</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[132px] w-[132px] bg-indigo-800">종료일</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[72px] w-[72px] bg-indigo-800">수행일</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-left text-[10px] font-black min-w-[100px] w-[100px]">상태</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-left text-[10px] font-black min-w-[88px] w-[88px] bg-emerald-800">진행율(%)</th>
                            <th className="border border-slate-600 w-8" />
                        </tr>
                        <tr className="bg-slate-100 border-b-2 border-slate-300">
                            <td colSpan={pathDepth + 5} className="border border-slate-200 px-2 py-1.5 font-black text-slate-700 text-[11px]">
                                전체 ({totals.done}/{totals.count} 완료)
                            </td>
                            <td colSpan={3} className="border border-slate-200" />
                            <td className="border border-slate-200 px-2 py-1.5 text-left font-black text-[11px] text-emerald-700">
                                {totals.avg}%
                            </td>
                            <td className="border border-slate-200" />
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.length === 0 ? (
                            <tr>
                                <td colSpan={pathDepth + 10} className="text-center text-gray-400 py-16 text-sm">
                                    개발 상세 데이터가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            sortedRows.map((r) => {
                                if (r.menuId !== lastMenuId) {
                                    groupColorIdx = (groupColorIdx + 1) % WBS_GROUP_ROW_BG.length;
                                    lastMenuId = r.menuId;
                                }
                                const palette = WBS_GROUP_ROW_BG[groupColorIdx];
                                const isDbg = isWbsDebugingCategoryRow(r);
                                const dbgLocked = isDbg && !debugUnlockedByMenu.get(r.menuId);
                                const rowBg = isDbg ? palette.debug : palette.base;
                                const parts = menuPathParts(menus, r.menuId);
                                const rowEditEntry = editingMap.get(`row_${r.id}`);
                                const isRowBeingEdited = !!rowEditEntry && rowEditEntry.userId !== currentUserId;

                                return (
                                    <tr
                                        key={r.id}
                                        className={`border-b border-gray-100 hover:bg-sky-50/50 transition-colors group ${rowBg} ${isRowBeingEdited ? 'pointer-events-none select-none' : ''}`}
                                        style={isRowBeingEdited ? { boxShadow: `inset 3px 0 0 ${rowEditEntry!.color}` } : undefined}
                                        onFocus={() => { if (!isRowBeingEdited) emitFocus(`row_${r.id}`); }}
                                        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) emitBlur(`row_${r.id}`); }}
                                    >
                                        {Array.from({ length: pathDepth }, (_, i) => (
                                            <td key={i} className="border border-gray-100 px-2 py-1.5 align-middle text-[11px] text-gray-700">
                                                {parts[i] ?? ''}
                                            </td>
                                        ))}
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle text-center">
                                            <span className="text-[10px] font-mono font-bold text-indigo-600">
                                                {menuCodeById.get(r.menuId) ?? ''}
                                            </span>
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle">
                                            {isDbg ? (
                                                <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-bold">
                                                    Debuging
                                                </span>
                                            ) : (
                                                <CategoryCell value={r.category} onChange={(v) => updateRow(r.id, { category: v })} inputClass={cellInput} />
                                            )}
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle">
                                            <ImeSafeTextInput
                                                value={r.featureName}
                                                onChange={(featureName) => updateRow(r.id, { featureName })}
                                                placeholder="기능명"
                                                className={cellInput}
                                            />
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle">
                                            <AssigneeCell
                                                value={r.assignee}
                                                assigneeUserId={r.assigneeUserId}
                                                onChange={(patch) => updateRow(r.id, patch)}
                                                members={projectMembers}
                                                inputClass={cellInput}
                                            />
                                        </td>
                                        <td className="border border-gray-100 px-1.5 py-1.5 align-middle text-center bg-indigo-50/30 min-w-[132px] whitespace-nowrap">
                                            <WheelDatePicker
                                                value={r.startDate}
                                                onChange={(v) => updateRow(r.id, { startDate: v })}
                                                rangeStart={r.startDate}
                                                rangeEnd={r.endDate}
                                                onRangeChange={(start, end) => updateRow(r.id, { startDate: start, endDate: end })}
                                                rangeField="start"
                                                className="w-full min-w-[118px]"
                                                menuDateRanges={assigneeMenuRangesMap.get(r.assignee.trim()) ?? []}
                                            />
                                        </td>
                                        <td className="border border-gray-100 px-1.5 py-1.5 align-middle text-center bg-indigo-50/30 min-w-[132px] whitespace-nowrap">
                                            <WheelDatePicker
                                                value={r.endDate}
                                                onChange={(v) => updateRow(r.id, { endDate: v })}
                                                rangeStart={r.startDate}
                                                rangeEnd={r.endDate}
                                                onRangeChange={(start, end) => updateRow(r.id, { startDate: start, endDate: end })}
                                                rangeField="end"
                                                className="w-full min-w-[118px]"
                                                menuDateRanges={assigneeMenuRangesMap.get(r.assignee.trim()) ?? []}
                                            />
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle text-center bg-indigo-50/30 min-w-[72px] w-[72px] text-[11px] font-bold tabular-nums text-gray-700 whitespace-nowrap">
                                            {formatWbsDuration(r.startDate, r.endDate) || '-'}
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle min-w-[100px] w-[100px] text-left">
                                            {dbgLocked ? (
                                                <span className="inline-flex items-center gap-1 justify-start">
                                                    <span className="pointer-events-none select-none shrink-0">
                                                        <StatusCell value={r.status} onChange={() => {}} />
                                                    </span>
                                                    <LockTooltip />
                                                </span>
                                            ) : (
                                                <div className="flex justify-start">
                                                    <StatusCell
                                                        value={r.status}
                                                        onChange={(status) => updateRow(r.id, status === 'DONE' ? { status, progress: 100 } : { status })}
                                                    />
                                                </div>
                                            )}
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle bg-emerald-50/30 min-w-[88px] w-[88px] text-left">
                                            {dbgLocked ? (
                                                <div className="flex items-center justify-start gap-1 text-gray-400 text-[11px] whitespace-nowrap">
                                                    <span className="tabular-nums w-7 text-left">{r.progress}</span>
                                                    <span>%</span>
                                                    <LockTooltip />
                                                </div>
                                            ) : (
                                                <WheelProgressPicker
                                                    value={r.progress}
                                                    onChange={(v) => updateRow(r.id, { progress: v })}
                                                    variant="ghost"
                                                    accentColor="#10b981"
                                                    className="text-left"
                                                />
                                            )}
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle text-center">
                                            {isRowBeingEdited ? (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white whitespace-nowrap"
                                                    style={{ backgroundColor: rowEditEntry!.color }}
                                                >
                                                    {rowEditEntry!.userName}
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => { if (confirmDeleteWbsRow(r)) deleteRow(r.id); }}
                                                    className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100"
                                                    title="행 삭제"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
                )}
            </div>
        </div>
    );
};

export default WbsDevDetailExcelView;
