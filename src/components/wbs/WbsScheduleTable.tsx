import React, { useState, useMemo, useRef, useEffect } from 'react';
import { CalendarRange, ChevronDown, ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react';
import WheelDatePicker from './WheelDatePicker';
import WbsDevScheduleSyncButton from './WbsDevScheduleSyncButton';
import { useWbsStore } from '../../store/wbsStore';
import { useWbsEditingStore } from '../../store/wbsEditingStore';
import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';
import type { WbsDetailSchedule, ScheduleStatus } from '../../types/wbs';
import {
    EMPTY_SCHEDULE_DATE_RANGES,
    EMPTY_SCHEDULE_WEEKS,
    SCHEDULE_DATE_FILTERS,
    SCHEDULE_WEEK_TARGETS,
    filterDetailSchedules,
    getMonthWeekRanges,
    isScheduleFilterActive,
    isScheduleRangeActive,
    resolveWeekRange,
    formatWeekOptionLabel,
    type ScheduleDateFilterKey,
    type ScheduleDateRange,
    type ScheduleDateRangeMap,
    type ScheduleWeekMap,
    type ScheduleWeekSelection,
    type ScheduleWeekTarget,
} from '../../utils/wbsScheduleFilter';

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

function normalizeScheduleCode(value?: string): string | undefined {
    const code = value?.trim();
    return code || undefined;
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
        const siblings = byParent.get(parentId) ?? [];
        for (const item of siblings) {
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

    // date 타입: WheelDatePicker 사용 (YYYY.MM.DD ↔ YYYY-MM-DD 변환)
    if (type === 'date') {
        // 저장 포맷: YYYY.MM.DD → WheelDatePicker 포맷: YYYY-MM-DD
        const pickerValue = toInputDate(value);
        return (
            <WheelDatePicker
                value={pickerValue}
                onChange={(v) => onSave(fromInputDate(v))}
                className="w-full"
                placeholder={placeholder || '-'}
                variant="ghost"
            />
        );
    }

    const commit = () => {
        const trimmed = draft.trim();
        if (!trimmed) setDraft(value);
        else onSave(trimmed);
        setEditing(false);
    };

    if (editing) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
                }}
                className={`w-full bg-transparent border-b-2 border-blue-400 outline-none py-0.5 ${className}`}
            />
        );
    }

    return (
        <span
            onDoubleClick={() => { setDraft(value); setEditing(true); }}
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

// ── 정렬 타입 ─────────────────────────────────────────────────────────────
type SortKey = 'worker' | 'startDate' | 'endDate' | 'planRate' | 'actualStartDate' | 'actualEndDate' | 'progress';
type SortDir = 'asc' | 'desc';

interface FilterOption {
    value: string;
    label: string;
    /** 0이면 대분류, 1이면 중분류로 들여쓴다 */
    depth?: number;
}

const FilterSelect: React.FC<{
    label: string;
    options: FilterOption[];
    value: string | null;
    onChange: (value: string | null) => void;
    width?: number;
}> = ({ label, options, value, onChange, width = 240 }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            setQuery('');
            return;
        }
        const onPointerDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [open]);

    const visibleOptions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((option) => option.label.toLowerCase().includes(q));
    }, [options, query]);

    const selected = options.find((option) => option.value === value);
    const active = value !== null;

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    active
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
            >
                <span className={active ? 'text-blue-400' : 'text-gray-400'}>{label}</span>
                <span className="max-w-[130px] truncate">{selected?.label ?? '전체'}</span>
                <ChevronDown size={12} className="shrink-0 opacity-60" />
            </button>
            {open && (
                <div
                    className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
                    style={{ width }}
                >
                    {options.length > 8 && (
                        <div className="p-1.5 border-b border-gray-100">
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="검색"
                                className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded outline-none focus:border-blue-400"
                            />
                        </div>
                    )}
                    <div className="max-h-64 overflow-auto py-1">
                        <button
                            type="button"
                            onClick={() => { onChange(null); setOpen(false); }}
                            className={`block w-full text-left px-3 py-1.5 text-[11px] font-bold border-b border-gray-100 hover:bg-gray-50 ${
                                value === null ? 'text-blue-600' : 'text-gray-700'
                            }`}
                        >
                            전체
                        </button>
                        {visibleOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => { onChange(option.value); setOpen(false); }}
                                style={{ paddingLeft: 12 + (option.depth ?? 0) * 12 }}
                                className={`block w-full text-left pr-3 py-1.5 text-[11px] truncate hover:bg-gray-50 ${
                                    option.value === value ? 'text-blue-600 font-bold' : 'text-gray-700'
                                } ${option.depth ? 'font-normal' : 'font-bold'}`}
                                title={option.label}
                            >
                                {option.label}
                            </button>
                        ))}
                        {visibleOptions.length === 0 && (
                            <div className="px-3 py-3 text-[11px] text-gray-400 text-center">결과 없음</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

/** 년·월·주차 3단 선택 — 주차를 고르는 순간 필터가 적용된다 */
const WeekPickerRow: React.FC<{
    label: string;
    tone: string;
    years: number[];
    selection: ScheduleWeekSelection | null;
    onChange: (selection: ScheduleWeekSelection | null) => void;
}> = ({ label, tone, years, selection, onChange }) => {
    const fallbackYear = years.includes(new Date().getFullYear())
        ? new Date().getFullYear()
        : (years[years.length - 1] ?? new Date().getFullYear());
    const [draft, setDraft] = useState<ScheduleWeekSelection>(
        () => selection ?? { year: fallbackYear, month: new Date().getMonth() + 1, week: 1 },
    );

    useEffect(() => {
        if (selection) setDraft(selection);
    }, [selection]);

    const weeks = getMonthWeekRanges(draft.year, draft.month);
    const resolved = selection ? resolveWeekRange(selection) : null;

    const commit = (next: ScheduleWeekSelection, apply: boolean) => {
        const available = getMonthWeekRanges(next.year, next.month);
        const clamped = { ...next, week: Math.min(next.week, available.length) };
        setDraft(clamped);
        if (apply) onChange(clamped);
    };

    const selectClass = 'px-1.5 py-1 text-[11px] border border-gray-200 rounded bg-white outline-none focus:border-blue-400';

    return (
        <div className="mb-2.5">
            <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-black ${tone}`}>{label}</span>
                {selection && (
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        className="text-[10px] font-bold text-gray-400 hover:text-red-500 transition-colors"
                    >
                        해제
                    </button>
                )}
            </div>
            <div className="flex items-center gap-1">
                <select
                    value={draft.year}
                    onChange={(e) => commit({ ...draft, year: Number(e.target.value) }, selection !== null)}
                    className={selectClass}
                >
                    {years.map((year) => <option key={year} value={year}>{year}년</option>)}
                </select>
                <select
                    value={draft.month}
                    onChange={(e) => commit({ ...draft, month: Number(e.target.value) }, selection !== null)}
                    className={selectClass}
                >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                        <option key={month} value={month}>{month}월</option>
                    ))}
                </select>
                <select
                    value={selection ? Math.min(draft.week, weeks.length) : ''}
                    onChange={(e) => commit({ ...draft, week: Number(e.target.value) }, true)}
                    className={`${selectClass} min-w-0 flex-1`}
                >
                    <option value="" disabled>주차 선택</option>
                    {weeks.map(({ week, from, to }) => (
                        <option key={week} value={week}>{formatWeekOptionLabel(week, from, to)}</option>
                    ))}
                </select>
            </div>
            {resolved && (
                <div className="mt-1 text-[10px] text-gray-500 tabular-nums">
                    {resolved.from.replace(/-/g, '.')} ~ {resolved.to.replace(/-/g, '.')} 와 겹치는 일정
                </div>
            )}
        </div>
    );
};

const DateRangeFilter: React.FC<{
    ranges: ScheduleDateRangeMap;
    weeks: ScheduleWeekMap;
    years: number[];
    onChange: (key: ScheduleDateFilterKey, range: ScheduleDateRange) => void;
    onWeekChange: (target: ScheduleWeekTarget, selection: ScheduleWeekSelection | null) => void;
    onReset: () => void;
}> = ({ ranges, weeks, years, onChange, onWeekChange, onReset }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [open]);

    const activeCount = SCHEDULE_DATE_FILTERS.filter(({ key }) => isScheduleRangeActive(ranges[key])).length
        + SCHEDULE_WEEK_TARGETS.filter(({ target }) => weeks[target] !== null).length;

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    activeCount > 0
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
            >
                <CalendarRange size={13} className="opacity-70" />
                기간
                {activeCount > 0 && (
                    <span className="px-1.5 rounded-full bg-blue-600 text-white text-[10px] leading-4">{activeCount}</span>
                )}
                <ChevronDown size={12} className="shrink-0 opacity-60" />
            </button>
            {open && (
                <div className="absolute z-50 top-full right-0 mt-1 w-[340px] max-h-[70vh] overflow-auto bg-white border border-gray-200 rounded-lg shadow-xl p-3">
                    <div className="text-[10px] font-black text-gray-400 mb-1.5">계획 · 실적 주차 (예: 2026년 7월 4주차)</div>
                    {SCHEDULE_WEEK_TARGETS.map(({ target, label, tone }) => (
                        <WeekPickerRow
                            key={target}
                            label={label}
                            tone={tone}
                            years={years}
                            selection={weeks[target]}
                            onChange={(selection) => onWeekChange(target, selection)}
                        />
                    ))}
                    <div className="text-[10px] font-black text-gray-400 mt-3 mb-1.5 pt-2.5 border-t border-gray-100">
                        날짜 직접 입력
                    </div>
                    {SCHEDULE_DATE_FILTERS.map(({ key, label, tone }) => (
                        <div key={key} className="mb-2.5 last:mb-0">
                            <div className={`text-[10px] font-black mb-1 ${tone}`}>{label}</div>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="date"
                                    value={ranges[key].from}
                                    onChange={(e) => onChange(key, { ...ranges[key], from: e.target.value })}
                                    className="flex-1 min-w-0 px-2 py-1 text-[11px] border border-gray-200 rounded outline-none focus:border-blue-400"
                                />
                                <span className="text-gray-300 text-[11px]">~</span>
                                <input
                                    type="date"
                                    value={ranges[key].to}
                                    onChange={(e) => onChange(key, { ...ranges[key], to: e.target.value })}
                                    className="flex-1 min-w-0 px-2 py-1 text-[11px] border border-gray-200 rounded outline-none focus:border-blue-400"
                                />
                            </div>
                        </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
                        <span className="text-[10px] text-gray-400">한쪽만 입력하면 이후·이전 전체</span>
                        <button
                            type="button"
                            onClick={onReset}
                            className="text-[11px] font-bold text-gray-500 hover:text-red-500 transition-colors"
                        >
                            기간 초기화
                        </button>
                    </div>
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

    // 수정중 인디케이터
    const editingMap    = useWbsEditingStore((s) => s.editing);
    const emitFocus     = useSyncStore((s) => s.emitWbsFieldFocus);
    const emitBlur      = useSyncStore((s) => s.emitWbsFieldBlur);
    const currentUserId = useAuthStore((s) => s.user?.id);

    // 일정 탭은 기존 일정 데이터를 표시·사용자 수정만 한다.
    // 화면 진입 시 시드/자동 보정으로 저장된 일정 값을 바꾸지 않는다.

    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [sortState, setSortState] = useState<{ key: SortKey; dir: SortDir } | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [workerFilter, setWorkerFilter] = useState<string | null>(null);
    const [dateRanges, setDateRanges] = useState<ScheduleDateRangeMap>(EMPTY_SCHEDULE_DATE_RANGES);
    const [weekFilters, setWeekFilters] = useState<ScheduleWeekMap>(EMPTY_SCHEDULE_WEEKS);

    const toggleSort = (key: SortKey) => {
        setSortState((prev) => {
            if (!prev || prev.key !== key) return { key, dir: 'asc' };
            if (prev.dir === 'asc') return { key, dir: 'desc' };
            return null;
        });
    };

    // 대분류(최상위) + 중분류(2단계)를 하나의 목록으로 제공한다.
    const categoryOptions = useMemo<FilterOption[]>(() => {
        const childrenOf = new Map<string | null, WbsDetailSchedule[]>();
        for (const item of detailSchedules) {
            const key = item.parentId ?? null;
            if (!childrenOf.has(key)) childrenOf.set(key, []);
            childrenOf.get(key)!.push(item);
        }
        for (const list of childrenOf.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        const options: FilterOption[] = [];
        for (const root of childrenOf.get(null) ?? []) {
            options.push({ value: root.id, label: root.title, depth: 0 });
            for (const child of childrenOf.get(root.id) ?? []) {
                options.push({ value: child.id, label: child.title, depth: 1 });
            }
        }
        return options;
    }, [detailSchedules]);

    const workerOptions = useMemo<FilterOption[]>(() => {
        const names = new Set<string>();
        for (const item of detailSchedules) {
            const name = (item.worker ?? '').trim();
            if (name) names.add(name);
        }
        return [...names]
            .sort((a, b) => a.localeCompare(b, 'ko'))
            .map((name) => ({ value: name, label: name }));
    }, [detailSchedules]);

    /** 주차 선택용 연도 목록 — 데이터에 등장하는 연도와 올해를 합친다 */
    const yearOptions = useMemo(() => {
        const years = new Set<number>([new Date().getFullYear()]);
        for (const item of detailSchedules) {
            for (const value of [item.startDate, item.endDate, item.actualStartDate, item.actualEndDate]) {
                const year = Number((value ?? '').slice(0, 4));
                if (year >= 1900) years.add(year);
            }
        }
        return [...years].sort((a, b) => a - b);
    }, [detailSchedules]);

    const filterState = useMemo(
        () => ({ categoryId: categoryFilter, worker: workerFilter, ranges: dateRanges, weeks: weekFilters }),
        [categoryFilter, workerFilter, dateRanges, weekFilters],
    );
    const filterActive = isScheduleFilterActive(filterState);

    const visibleSchedules = useMemo(
        () => filterDetailSchedules(detailSchedules, filterState),
        [detailSchedules, filterState],
    );

    const resetFilters = () => {
        setCategoryFilter(null);
        setWorkerFilter(null);
        setDateRanges(EMPTY_SCHEDULE_DATE_RANGES);
        setWeekFilters(EMPTY_SCHEDULE_WEEKS);
    };

    // 필터 중에는 접힘 상태를 무시해야 걸러진 행이 부모에 가려지지 않는다.
    const flatRows = useMemo(
        () => buildFlatTree(visibleSchedules, filterActive ? new Set<string>() : collapsed),
        [visibleSchedules, filterActive, collapsed],
    );

    const sortedRows = useMemo(() => {
        if (!sortState) return flatRows;
        const { key, dir } = sortState;
        return [...flatRows].sort((a, b) => {
            let valA: string | number;
            let valB: string | number;
            switch (key) {
                case 'worker':          valA = a.worker ?? '';           valB = b.worker ?? '';           break;
                case 'startDate':       valA = a.startDate ?? '';        valB = b.startDate ?? '';        break;
                case 'endDate':         valA = a.endDate ?? '';          valB = b.endDate ?? '';          break;
                case 'planRate':        valA = a.progress ?? 0;          valB = b.progress ?? 0;          break;
                case 'actualStartDate': valA = a.actualStartDate ?? '';  valB = b.actualStartDate ?? ''; break;
                case 'actualEndDate':   valA = a.actualEndDate ?? '';    valB = b.actualEndDate ?? '';   break;
                case 'progress':        valA = a.progress ?? 0;          valB = b.progress ?? 0;          break;
                default:                valA = ''; valB = '';
            }
            const cmp = typeof valA === 'number'
                ? valA - (valB as number)
                : (valA as string).localeCompare(valB as string);
            return dir === 'asc' ? cmp : -cmp;
        });
    }, [flatRows, sortState]);

    /** 정렬 아이콘 헬퍼 */
    const SortIcon = ({ sk }: { sk: SortKey }) => (
        <ChevronDown
            size={10}
            className={sortState?.key === sk ? 'text-white' : 'text-slate-400 opacity-60'}
            style={{
                transform: sortState?.key === sk && sortState.dir === 'asc' ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
                flexShrink: 0,
            }}
        />
    );

    const toggleCollapse = (id: string) =>
        setCollapsed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

    /** 화면에 보이는 트리 기준 — 필터로 자식이 모두 걸러지면 펼침 화살표도 숨긴다 */
    const hasChildren = (id: string) => visibleSchedules.some((s) => s.parentId === id);
    /** 삭제 경고는 필터와 무관하게 실제 하위 항목 유무로 판단한다 */
    const hasAnyChildren = (id: string) => detailSchedules.some((s) => s.parentId === id);

    const upd = (id: string, patch: Partial<Omit<WbsDetailSchedule, 'id'>>) =>
        updateDetailSchedule(id, patch);

    // 통계 — 필터가 걸리면 걸러진 범위만 집계한다
    const totals = useMemo(() => {
        const leaves = visibleSchedules.filter((s) => !visibleSchedules.some((c) => c.parentId === s.id));
        const planDays = leaves.reduce((sum, s) => sum + diffDays(s.startDate, s.endDate), 0);
        const actualDays = leaves.reduce((sum, s) => sum + diffDays(s.actualStartDate ?? '', s.actualEndDate ?? ''), 0);
        const avgProgress = leaves.length ? Math.round(leaves.reduce((sum, s) => sum + (s.progress ?? 0), 0) / leaves.length) : 0;
        const minDate = (values: string[]) => values.filter(Boolean).sort()[0] ?? '';
        const maxDate = (values: string[]) => values.filter(Boolean).sort().at(-1) ?? '';
        return {
            planDays,
            actualDays,
            avgProgress,
            planStartDate: minDate(leaves.map((s) => s.startDate)),
            planEndDate: maxDate(leaves.map((s) => s.endDate)),
            actualStartDate: minDate(leaves.map((s) => s.actualStartDate ?? '')),
            actualEndDate: maxDate(leaves.map((s) => s.actualEndDate ?? '')),
        };
    }, [visibleSchedules]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* 상단 액션 바 */}
            <div className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-gray-100 bg-white shrink-0">
                <div className="shrink-0">
                    <h2 className="text-sm font-black text-gray-900">일정 상세</h2>
                    <p className="text-[11px] text-gray-400">
                        {filterActive
                            ? `필터 적용 중 · ${sortedRows.length}행 표시`
                            : '항목을 더블클릭하여 편집 · 시스템 개발 동기화로 개발상세 시작·종료일을 반영'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <FilterSelect
                        label="대분류"
                        options={categoryOptions}
                        value={categoryFilter}
                        onChange={setCategoryFilter}
                        width={300}
                    />
                    <FilterSelect
                        label="작업자"
                        options={workerOptions}
                        value={workerFilter}
                        onChange={setWorkerFilter}
                    />
                    <DateRangeFilter
                        ranges={dateRanges}
                        weeks={weekFilters}
                        years={yearOptions}
                        onChange={(key, range) => setDateRanges((prev) => ({ ...prev, [key]: range }))}
                        onWeekChange={(target, selection) => setWeekFilters((prev) => ({ ...prev, [target]: selection }))}
                        onReset={() => {
                            setDateRanges(EMPTY_SCHEDULE_DATE_RANGES);
                            setWeekFilters(EMPTY_SCHEDULE_WEEKS);
                        }}
                    />
                    {filterActive && (
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                            title="모든 필터 해제"
                        >
                            <RotateCcw size={13} /> 필터 초기화
                        </button>
                    )}
                    <WbsDevScheduleSyncButton compact />
                    <button
                        onClick={() => addDetailSchedule({ parentId: null, order: 9999, title: '새 대분류', startDate: '', endDate: '', progress: 0 })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={13} /> 최상위 항목 추가
                    </button>
                </div>
            </div>

            {/* 테이블 */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-xs border-collapse" style={{ minWidth: 1500 }}>
                    <thead className="sticky top-0 z-20">
                        {/* 1행: 그룹 헤더 */}
                        <tr className="bg-slate-700 text-white">
                            <th colSpan={3} className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black">구분</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black">작업자</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black">산출물명</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black">완료기준</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black">상태</th>
                            <th colSpan={5} className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black bg-indigo-800">계획</th>
                            <th colSpan={4} className="border border-slate-600 px-2 py-1.5 text-center text-[11px] font-black bg-emerald-800">실적</th>
                            <th className="border border-slate-600 w-8" />
                        </tr>
                        {/* 2행: 세부 헤더 */}
                        <tr className="bg-slate-600 text-white">
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24">대분류</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16">번호</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-48">세부항목</th>
                            <th onClick={() => toggleSort('worker')} className="border border-slate-500 px-2 py-1 text-center text-[10px] w-28 cursor-pointer select-none hover:bg-slate-500 transition-colors"><span className="inline-flex items-center justify-center gap-0.5">작업자<SortIcon sk="worker" /></span></th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-32">산출물명</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24">완료기준</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16">상태</th>
                            <th onClick={() => toggleSort('startDate')} className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24 bg-indigo-700/60 cursor-pointer select-none hover:bg-indigo-600/60 transition-colors"><span className="inline-flex items-center justify-center gap-0.5">시작일<SortIcon sk="startDate" /></span></th>
                            <th onClick={() => toggleSort('endDate')} className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24 bg-indigo-700/60 cursor-pointer select-none hover:bg-indigo-600/60 transition-colors"><span className="inline-flex items-center justify-center gap-0.5">종료일<SortIcon sk="endDate" /></span></th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16 bg-indigo-700/60">계획일</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16 bg-indigo-700/60">진척도</th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16 bg-indigo-700/60">계획율</th>
                            <th onClick={() => toggleSort('actualStartDate')} className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24 bg-emerald-700/60 cursor-pointer select-none hover:bg-emerald-600/60 transition-colors"><span className="inline-flex items-center justify-center gap-0.5">시작일<SortIcon sk="actualStartDate" /></span></th>
                            <th onClick={() => toggleSort('actualEndDate')} className="border border-slate-500 px-2 py-1 text-center text-[10px] w-24 bg-emerald-700/60 cursor-pointer select-none hover:bg-emerald-600/60 transition-colors"><span className="inline-flex items-center justify-center gap-0.5">종료일<SortIcon sk="actualEndDate" /></span></th>
                            <th className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16 bg-emerald-700/60">투입일</th>
                            <th onClick={() => toggleSort('progress')} className="border border-slate-500 px-2 py-1 text-center text-[10px] w-16 bg-emerald-700/60 cursor-pointer select-none hover:bg-emerald-600/60 transition-colors"><span className="inline-flex items-center justify-center gap-0.5">진척도<SortIcon sk="progress" /></span></th>
                            <th className="border border-slate-500 w-8" />
                        </tr>
                        {/* 전체 합계 행 */}
                        <tr className="bg-slate-100 border-b-2 border-slate-300">
                            <td colSpan={3} className="border border-slate-200 px-2 py-1.5 font-black text-slate-700 text-[11px]">
                                {filterActive ? '필터 결과(진행율)' : '전체(진행율)'}
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-slate-500">-</td>
                            <td colSpan={3} className="border border-slate-200" />
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-indigo-700">{totals.planStartDate || '—'}</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-indigo-700">{totals.planEndDate || '—'}</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-indigo-700">{totals.planDays}일</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-indigo-700">—</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-indigo-700">—</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-emerald-700">{totals.actualStartDate || '—'}</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-emerald-700">{totals.actualEndDate || '—'}</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center text-[11px] text-emerald-700">{totals.actualDays}일</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center font-black text-[11px] text-emerald-700">{totals.avgProgress}%</td>
                            <td className="border border-slate-200" />
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.map((node) => {
                            const isParent = hasChildren(node.id);
                            const isCollapsed = collapsed.has(node.id);
                            const planDays = diffDays(node.startDate, node.endDate);
                            const actualDays = diffDays(node.actualStartDate ?? '', node.actualEndDate ?? '');
                            const rowBg = isParent
                                ? node.depth === 0 ? 'bg-blue-50/70' : 'bg-slate-50/80'
                                : 'bg-white';

                            // 대분류 / 세부항목 구분: depth 0,1 = 대분류, depth 2+ = 세부항목
                            const isCategory = node.depth <= 1;

                            const schedEditEntry = editingMap.get(`schedule_${node.id}`);
                            const isSchedBeingEdited = !!schedEditEntry && schedEditEntry.userId !== currentUserId;

                            return (
                                <tr
                                    key={node.id}
                                    className={`border-b border-gray-100 hover:bg-sky-50/50 transition-colors group ${rowBg} ${isSchedBeingEdited ? 'pointer-events-none select-none' : ''}`}
                                    style={isSchedBeingEdited ? { boxShadow: `inset 3px 0 0 ${schedEditEntry!.color}` } : undefined}
                                    onFocus={() => { if (!isSchedBeingEdited) emitFocus(`schedule_${node.id}`); }}
                                    onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) emitBlur(`schedule_${node.id}`); }}
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

                                    {/* 엑셀 B열 WBS 번호 — 더블클릭 편집 */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center align-top">
                                        {!isCategory && (
                                            <EditCell
                                                value={normalizeScheduleCode(node.scheduleCode) ?? ''}
                                                onSave={(v) => upd(node.id, { scheduleCode: normalizeScheduleCode(v) })}
                                                placeholder="-"
                                                className="text-[11px] font-medium text-slate-600 tabular-nums text-center"
                                            />
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

                                    {/* 엑셀의 계획 진척도/계획율은 현재 일정 데이터 모델에 저장 필드가 없다.
                                        기존 실적 진척도를 재사용하지 않고, 값이 없음을 명시한다. */}
                                    <td className="border border-gray-100 px-2 py-1.5 text-center text-[11px] bg-indigo-50/30 align-top">
                                        <span className="text-indigo-600">—</span>
                                    </td>

                                    <td className="border border-gray-100 px-2 py-1.5 text-center text-[11px] bg-indigo-50/30 align-top">
                                        <span className="text-indigo-600">—</span>
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
                                                    if (window.confirm(`"${node.title}" 항목을 삭제하시겠습니까?${hasAnyChildren(node.id) ? '\n\n하위 항목도 함께 삭제됩니다.' : ''}`)) {
                                                        deleteDetailSchedule(node.id);
                                                    }
                                                }}
                                                className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                                title="항목 삭제"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                            {isSchedBeingEdited && (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white whitespace-nowrap"
                                                    style={{ backgroundColor: schedEditEntry!.color }}
                                                >
                                                    {schedEditEntry!.userName} <span className="opacity-80">수정중</span>
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {/* 빈 상태 */}
                        {sortedRows.length === 0 && (
                            <tr>
                                <td colSpan={16} className="text-center py-16 text-gray-400 text-sm">
                                    {filterActive ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <span>조건에 맞는 일정이 없습니다.</span>
                                            <button
                                                type="button"
                                                onClick={resetFilters}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                                            >
                                                <RotateCcw size={13} /> 필터 초기화
                                            </button>
                                        </div>
                                    ) : (
                                        'GANTT CHART 탭에서 항목을 추가하거나 엑셀을 업로드하세요.'
                                    )}
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
