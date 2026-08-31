import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, RotateCcw, Trash2 } from 'lucide-react';
import WheelDatePicker, { WheelProgressPicker } from './WheelDatePicker';
import { buildAssigneeMenuDateRanges, formatWbsDuration, normalizeYmd } from './wbsDateUtils';
import {
    menuPathParts,
    sortWbsDevRows,
    wbsPathDepth,
    WBS_GROUP_ROW_BG,
    confirmDeleteWbsRow,
} from './wbsDevRowUtils';
import { getAllAssignees, getFilteredMenuIds } from './wbsDevFilterUtils';
import WbsDevDetailFilterBar from './WbsDevDetailFilterBar';
import WbsDevScheduleSyncButton from './WbsDevScheduleSyncButton';
import { StatusCell, CategoryCell, AssigneeCell, ImeSafeTextInput, LockTooltip } from './WbsDevDetail';
import { useWbsStore } from '../../store/wbsStore';
import { useProjectStore } from '../../store/projectStore';
import { useWbsEditingStore } from '../../store/wbsEditingStore';
import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';
import { isWbsDebugingCategoryRow } from '../../types/wbs';
import type { WbsDevRow } from '../../types/wbs';
import { rowEditingKey } from '../../utils/wbsEditingKey';

const cellInput = 'w-full bg-transparent px-2 py-1.5 text-[11px] outline-none focus:bg-emerald-50/50 rounded';

interface WbsDevDetailExcelViewProps {
    menuSearch: string;
    onMenuSearchChange: (value: string) => void;
    activeAssignees: Set<string>;
    onToggleAssignee: (name: string) => void;
    onClearAssignees: () => void;
}

type ExcelDateFilterField =
    | 'planStart'
    | 'planEnd'
    | 'planPeriod'
    | 'actualStart'
    | 'actualEnd'
    | 'actualPeriod';

type ExcelDateSortField = 'startDate' | 'endDate' | 'actualStartDate' | 'actualEndDate';
type ExcelDateSort = { field: ExcelDateSortField; direction: 'asc' | 'desc' };

const EXCEL_DATE_FILTER_OPTIONS: { value: ExcelDateFilterField; label: string }[] = [
    { value: 'planStart', label: '계획 시작일' },
    { value: 'planEnd', label: '계획 종료일' },
    { value: 'planPeriod', label: '계획 수행 기간' },
    { value: 'actualStart', label: '실적 시작일' },
    { value: 'actualEnd', label: '실적 종료일' },
    { value: 'actualPeriod', label: '실적 수행 기간' },
];

function isDateInRange(value: string, from: string, to: string): boolean {
    const date = normalizeYmd(value);
    if (!date) return false;
    return (!from || date >= from) && (!to || date <= to);
}

/** 기간 열은 From~To와 하루라도 겹치면 표시한다. 수행일은 기간 일수 표시값이므로 날짜로 비교하지 않는다. */
function isPeriodOverlappingRange(startValue: string, endValue: string, from: string, to: string): boolean {
    const start = normalizeYmd(startValue);
    const end = normalizeYmd(endValue);
    if (!start && !end) return false;

    const periodStart = start || end;
    const periodEnd = end || start;
    return (!from || periodEnd >= from) && (!to || periodStart <= to);
}

function matchesDateFilter(
    row: WbsDevRow,
    field: ExcelDateFilterField,
    from: string,
    to: string,
): boolean {
    switch (field) {
        case 'planStart': return isDateInRange(row.startDate, from, to);
        case 'planEnd': return isDateInRange(row.endDate, from, to);
        case 'planPeriod': return isPeriodOverlappingRange(row.startDate, row.endDate, from, to);
        case 'actualStart': return isDateInRange(row.actualStartDate ?? '', from, to);
        case 'actualEnd': return isDateInRange(row.actualEndDate ?? '', from, to);
        case 'actualPeriod': return isPeriodOverlappingRange(row.actualStartDate ?? '', row.actualEndDate ?? '', from, to);
    }
}

interface SortableDateHeaderProps {
    label: string;
    field: ExcelDateSortField;
    sort: ExcelDateSort | null;
    onSort: (field: ExcelDateSortField) => void;
    className: string;
}

const SortableDateHeader: React.FC<SortableDateHeaderProps> = ({ label, field, sort, onSort, className }) => {
    const direction = sort?.field === field ? sort.direction : null;
    const SortIcon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
    const sortLabel = direction === 'asc' ? '오름차순' : direction === 'desc' ? '내림차순' : '정렬';

    return (
        <th className={className} aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}>
            <button
                type="button"
                onClick={() => onSort(field)}
                className="flex w-full items-center justify-center gap-1 rounded text-inherit outline-none hover:text-amber-200 focus-visible:ring-2 focus-visible:ring-amber-300"
                title={`${label} ${sortLabel}`}
            >
                {label}
                <SortIcon size={12} strokeWidth={direction ? 3 : 2} aria-hidden="true" />
            </button>
        </th>
    );
};

const WbsDevDetailExcelView: React.FC<WbsDevDetailExcelViewProps> = ({
    menuSearch,
    onMenuSearchChange,
    activeAssignees,
    onToggleAssignee,
    onClearAssignees,
}) => {
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);
    const menuScheduleLinks = useWbsStore((s) => s.menuScheduleLinks);
    const updateRow = useWbsStore((s) => s.updateRow);
    const deleteRow = useWbsStore((s) => s.deleteRow);
    const [dateFilterField, setDateFilterField] = useState<ExcelDateFilterField>('planPeriod');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showDebugging, setShowDebugging] = useState(false);
    const [showCompleted, setShowCompleted] = useState(false);
    const [dateSort, setDateSort] = useState<ExcelDateSort | null>(null);

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
    const normalizedDateFrom = normalizeYmd(dateFrom);
    const normalizedDateTo = normalizeYmd(dateTo);
    const hasDateFilter = Boolean(normalizedDateFrom || normalizedDateTo);
    const hasInvalidDateRange = Boolean(
        normalizedDateFrom && normalizedDateTo && normalizedDateFrom > normalizedDateTo,
    );
    const displayedRows = useMemo(() => {
        const rowsWithVisibleDebugging = showDebugging
            ? sortedRows
            : sortedRows.filter((row) => !isWbsDebugingCategoryRow(row));
        const rowsWithVisibleCompletion = showCompleted
            ? rowsWithVisibleDebugging
            : rowsWithVisibleDebugging.filter((row) => row.status !== 'DONE');
        const dateFilteredRows = !hasDateFilter
            ? rowsWithVisibleCompletion
            : hasInvalidDateRange
                ? []
                : rowsWithVisibleCompletion.filter((row) => (
                    matchesDateFilter(row, dateFilterField, normalizedDateFrom, normalizedDateTo)
                ));
        if (!dateSort) return dateFilteredRows;

        return [...dateFilteredRows].sort((a, b) => {
            const aDate = normalizeYmd(a[dateSort.field] ?? '');
            const bDate = normalizeYmd(b[dateSort.field] ?? '');
            if (!aDate && !bDate) return 0;
            if (!aDate) return 1;
            if (!bDate) return -1;
            const result = aDate.localeCompare(bDate);
            return dateSort.direction === 'asc' ? result : -result;
        });
    }, [dateFilterField, dateSort, hasDateFilter, hasInvalidDateRange, normalizedDateFrom, normalizedDateTo, showCompleted, showDebugging, sortedRows]);

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
        const done = displayedRows.filter((r) => r.status === 'DONE').length;
        const avg = displayedRows.length
            ? Math.round(displayedRows.reduce((sum, r) => sum + (r.progress ?? 0), 0) / displayedRows.length)
            : 0;
        return { count: displayedRows.length, done, avg };
    }, [displayedRows]);

    const hasActiveFilter = filteredMenuIds !== null || hasDateFilter;
    const isEmptyFilter = hasActiveFilter && displayedRows.length === 0;
    const clearAllFilters = () => {
        onMenuSearchChange('');
        setDateFrom('');
        setDateTo('');
    };
    const toggleDateSort = (field: ExcelDateSortField) => {
        setDateSort((current) => (
            current?.field === field
                ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
                : { field, direction: 'asc' }
        ));
    };

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
                <WbsDevScheduleSyncButton compact />
                <div className="flex-1 min-w-0 max-w-3xl">
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
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 text-xs font-bold text-amber-800 transition-colors hover:border-amber-300">
                            <input
                                type="checkbox"
                                checked={showDebugging}
                                onChange={(event) => setShowDebugging(event.target.checked)}
                                className="h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                            />
                            디버깅
                        </label>
                        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-xs font-bold text-emerald-800 transition-colors hover:border-emerald-300">
                            <input
                                type="checkbox"
                                checked={showCompleted}
                                onChange={(event) => setShowCompleted(event.target.checked)}
                                className="h-3.5 w-3.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            완료
                        </label>
                        <span className="text-[11px] font-bold text-gray-500 mr-0.5">날짜 필터</span>
                        <select
                            value={dateFilterField}
                            onChange={(event) => setDateFilterField(event.target.value as ExcelDateFilterField)}
                            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                            aria-label="날짜 기준"
                        >
                            {EXCEL_DATE_FILTER_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(event) => setDateFrom(event.target.value)}
                            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                            aria-label="시작 날짜"
                        />
                        <span className="text-xs font-bold text-gray-400">~</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(event) => setDateTo(event.target.value)}
                            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                            aria-label="종료 날짜"
                        />
                        {(menuSearch || hasDateFilter) && (
                            <button
                                type="button"
                                onClick={clearAllFilters}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold text-gray-500 transition-colors hover:border-emerald-300 hover:text-emerald-700"
                                title="검색어와 날짜 필터 초기화"
                            >
                                <RotateCcw size={12} />
                                초기화
                            </button>
                        )}
                    </div>
                    {hasInvalidDateRange && (
                        <p className="mt-1 text-right text-[11px] font-medium text-rose-600">
                            시작일은 종료일보다 늦을 수 없습니다.
                        </p>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                {isEmptyFilter ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                        검색 결과가 없습니다.
                    </div>
                ) : (
                <table className="w-full text-xs border-collapse" style={{ minWidth: 1596 + pathDepth * 120 }}>
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
                            <SortableDateHeader
                                label="시작일"
                                field="startDate"
                                sort={dateSort}
                                onSort={toggleDateSort}
                                className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[132px] w-[132px] bg-indigo-800"
                            />
                            <SortableDateHeader
                                label="종료일"
                                field="endDate"
                                sort={dateSort}
                                onSort={toggleDateSort}
                                className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[132px] w-[132px] bg-indigo-800"
                            />
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[72px] w-[72px] bg-indigo-800">수행일</th>
                            <SortableDateHeader
                                label="실적 시작일"
                                field="actualStartDate"
                                sort={dateSort}
                                onSort={toggleDateSort}
                                className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[132px] w-[132px] bg-emerald-800"
                            />
                            <SortableDateHeader
                                label="실적 종료일"
                                field="actualEndDate"
                                sort={dateSort}
                                onSort={toggleDateSort}
                                className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[132px] w-[132px] bg-emerald-800"
                            />
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[72px] w-[72px] bg-emerald-800">실적 수행일</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-left text-[10px] font-black min-w-[100px] w-[100px]">상태</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-left text-[10px] font-black min-w-[88px] w-[88px] bg-emerald-800">진행율(%)</th>
                            <th className="border border-slate-600 w-8" />
                        </tr>
                        <tr className="bg-slate-100 border-b-2 border-slate-300">
                            <td colSpan={pathDepth + 5} className="border border-slate-200 px-2 py-1.5 font-black text-slate-700 text-[11px]">
                                전체 ({totals.done}/{totals.count} 완료)
                            </td>
                            <td colSpan={6} className="border border-slate-200" />
                            <td className="border border-slate-200 px-2 py-1.5 text-left font-black text-[11px] text-emerald-700">
                                {totals.avg}%
                            </td>
                            <td className="border border-slate-200" />
                        </tr>
                    </thead>
                    <tbody>
                        {displayedRows.length === 0 ? (
                            <tr>
                                <td colSpan={pathDepth + 13} className="text-center text-gray-400 py-16 text-sm">
                                    개발 상세 데이터가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            displayedRows.map((r) => {
                                if (r.menuId !== lastMenuId) {
                                    groupColorIdx = (groupColorIdx + 1) % WBS_GROUP_ROW_BG.length;
                                    lastMenuId = r.menuId;
                                }
                                const palette = WBS_GROUP_ROW_BG[groupColorIdx];
                                const isDbg = isWbsDebugingCategoryRow(r);
                                const dbgLocked = isDbg && !debugUnlockedByMenu.get(r.menuId);
                                const rowBg = isDbg ? palette.debug : palette.base;
                                const parts = menuPathParts(menus, r.menuId);
                                const editKey = rowEditingKey(r, menuScheduleLinks);
                                const rowEditEntry = editingMap.get(editKey);
                                const isRowBeingEdited = !!rowEditEntry && rowEditEntry.userId !== currentUserId;

                                return (
                                    <tr
                                        key={r.id}
                                        className={`border-b border-gray-100 hover:bg-sky-50/50 transition-colors group ${rowBg} ${isRowBeingEdited ? 'pointer-events-none select-none' : ''}`}
                                        style={isRowBeingEdited ? { boxShadow: `inset 3px 0 0 ${rowEditEntry!.color}` } : undefined}
                                        onFocus={() => { if (!isRowBeingEdited) emitFocus(editKey); }}
                                        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) emitBlur(editKey); }}
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
                                        <td className="border border-gray-100 px-1.5 py-1.5 align-middle text-center bg-emerald-50/40 min-w-[132px] whitespace-nowrap">
                                            <WheelDatePicker
                                                value={r.actualStartDate ?? ''}
                                                onChange={(v) => updateRow(r.id, { actualStartDate: v })}
                                                rangeStart={r.actualStartDate ?? ''}
                                                rangeEnd={r.actualEndDate ?? ''}
                                                onRangeChange={(start, end) => updateRow(r.id, { actualStartDate: start, actualEndDate: end })}
                                                rangeField="start"
                                                className="w-full min-w-[118px]"
                                                menuDateRanges={assigneeMenuRangesMap.get(r.assignee.trim()) ?? []}
                                            />
                                        </td>
                                        <td className="border border-gray-100 px-1.5 py-1.5 align-middle text-center bg-emerald-50/40 min-w-[132px] whitespace-nowrap">
                                            <WheelDatePicker
                                                value={r.actualEndDate ?? ''}
                                                onChange={(v) => updateRow(r.id, { actualEndDate: v })}
                                                rangeStart={r.actualStartDate ?? ''}
                                                rangeEnd={r.actualEndDate ?? ''}
                                                onRangeChange={(start, end) => updateRow(r.id, { actualStartDate: start, actualEndDate: end })}
                                                rangeField="end"
                                                className="w-full min-w-[118px]"
                                                menuDateRanges={assigneeMenuRangesMap.get(r.assignee.trim()) ?? []}
                                            />
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle text-center bg-emerald-50/40 min-w-[72px] w-[72px] text-[11px] font-bold tabular-nums text-emerald-700 whitespace-nowrap">
                                            {r.actualWorkDate || formatWbsDuration(r.actualStartDate ?? '', r.actualEndDate ?? '') || '-'}
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
