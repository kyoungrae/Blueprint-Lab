import { normalizeYmd } from '../components/wbs/wbsDateUtils';
import type { WbsDetailSchedule } from '../types/wbs';

export type ScheduleDateFilterKey = 'startDate' | 'endDate' | 'actualStartDate' | 'actualEndDate';

export interface ScheduleDateRange {
    /** YYYY-MM-DD (input[type=date] 포맷) */
    from: string;
    to: string;
}

export type ScheduleDateRangeMap = Record<ScheduleDateFilterKey, ScheduleDateRange>;

export const SCHEDULE_DATE_FILTERS: Array<{
    key: ScheduleDateFilterKey;
    label: string;
    tone: string;
}> = [
    { key: 'startDate', label: '계획 시작일', tone: 'text-indigo-600' },
    { key: 'endDate', label: '계획 종료일', tone: 'text-indigo-600' },
    { key: 'actualStartDate', label: '실적 시작일', tone: 'text-emerald-600' },
    { key: 'actualEndDate', label: '실적 종료일', tone: 'text-emerald-600' },
];

export const EMPTY_SCHEDULE_DATE_RANGES: ScheduleDateRangeMap = {
    startDate: { from: '', to: '' },
    endDate: { from: '', to: '' },
    actualStartDate: { from: '', to: '' },
    actualEndDate: { from: '', to: '' },
};

export function isScheduleRangeActive(range: ScheduleDateRange): boolean {
    return Boolean(range.from || range.to);
}

/** 한쪽만 입력하면 이후/이전 전체. 값이 비어 있으면 범위 필터에서 제외된다. */
export function matchesScheduleRange(value: string | undefined, range: ScheduleDateRange): boolean {
    if (!isScheduleRangeActive(range)) return true;
    const normalized = normalizeYmd(value ?? '');
    if (!normalized) return false;
    if (range.from && normalized < range.from) return false;
    if (range.to && normalized > range.to) return false;
    return true;
}

// ── 년/월/주차 선택 ────────────────────────────────────────────────────────
export interface ScheduleWeekSelection {
    year: number;
    /** 1-12 */
    month: number;
    /** 1-based */
    week: number;
}

/** 주차 필터를 적용할 기간 — 계획(시작~종료) 또는 실적(시작~종료) */
export type ScheduleWeekTarget = 'plan' | 'actual';

export type ScheduleWeekMap = Record<ScheduleWeekTarget, ScheduleWeekSelection | null>;

export const SCHEDULE_WEEK_TARGETS: Array<{ target: ScheduleWeekTarget; label: string; tone: string }> = [
    { target: 'plan', label: '계획 기간', tone: 'text-indigo-600' },
    { target: 'actual', label: '실적 기간', tone: 'text-emerald-600' },
];

export const EMPTY_SCHEDULE_WEEKS: ScheduleWeekMap = { plan: null, actual: null };

function toYmd(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * 해당 월의 주 목록. 1일이 포함된 주가 1주차이고 주는 일요일에 시작한다.
 * GANTT(WbsSchedule.startOfWeek)와 같은 규칙이되, 범위는 그 달 안으로 자른다.
 * 예: 2026년 7월 4주차 → 2026-07-19 ~ 2026-07-25
 */
export function getMonthWeekRanges(
    year: number,
    month: number,
): Array<{ week: number; from: string; to: string }> {
    const firstOfMonth = new Date(year, month - 1, 1);
    const lastOfMonth = new Date(year, month, 0);
    const cursor = new Date(year, month - 1, 1 - firstOfMonth.getDay());
    const result: Array<{ week: number; from: string; to: string }> = [];
    let week = 1;
    while (cursor <= lastOfMonth) {
        const weekStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        const weekEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 6);
        const from = weekStart < firstOfMonth ? firstOfMonth : weekStart;
        const to = weekEnd > lastOfMonth ? lastOfMonth : weekEnd;
        result.push({ week, from: toYmd(from), to: toYmd(to) });
        cursor.setDate(cursor.getDate() + 7);
        week += 1;
    }
    return result;
}

export function formatWeekOptionLabel(week: number, from: string, to: string): string {
    const short = (ymd: string) => ymd.slice(5).replace('-', '.');
    return `${week}주차 (${short(from)}~${short(to)})`;
}

/** 선택한 주차의 날짜 범위. 주차가 범위를 벗어나면 그 달의 마지막 주로 맞춘다. */
export function resolveWeekRange(selection: ScheduleWeekSelection): { from: string; to: string } {
    const weeks = getMonthWeekRanges(selection.year, selection.month);
    const found = weeks.find((w) => w.week === selection.week);
    return found ?? weeks[weeks.length - 1];
}

/** 시작~종료 구간이 주어진 범위와 겹치는지. 한쪽 날짜만 있으면 그 날짜를 점으로 본다. */
function overlapsRange(
    start: string | undefined,
    end: string | undefined,
    from: string,
    to: string,
): boolean {
    const s = normalizeYmd(start ?? '');
    const e = normalizeYmd(end ?? '');
    if (!s && !e) return false;
    const a = s || e;
    const b = e || s;
    const lo = a <= b ? a : b;
    const hi = a <= b ? b : a;
    return lo <= to && hi >= from;
}

export interface ScheduleFilterState {
    /** 대분류·중분류 항목 id. null이면 전체 */
    categoryId: string | null;
    /** 작업자 표시명. null이면 전체 */
    worker: string | null;
    ranges: ScheduleDateRangeMap;
    weeks: ScheduleWeekMap;
}

export function isScheduleFilterActive(filter: ScheduleFilterState): boolean {
    return filter.categoryId !== null
        || filter.worker !== null
        || SCHEDULE_DATE_FILTERS.some(({ key }) => isScheduleRangeActive(filter.ranges[key]))
        || SCHEDULE_WEEK_TARGETS.some(({ target }) => filter.weeks[target] !== null);
}

function matchesWeekFilters(item: WbsDetailSchedule, weeks: ScheduleWeekMap): boolean {
    if (weeks.plan) {
        const { from, to } = resolveWeekRange(weeks.plan);
        if (!overlapsRange(item.startDate, item.endDate, from, to)) return false;
    }
    if (weeks.actual) {
        const { from, to } = resolveWeekRange(weeks.actual);
        if (!overlapsRange(item.actualStartDate, item.actualEndDate, from, to)) return false;
    }
    return true;
}

/**
 * 대분류(하위 트리) → 작업자·기간 순으로 걸러낸다.
 * 조건에 맞는 행의 조상은 계층을 볼 수 있도록 함께 남기고,
 * 대분류를 고르면 최상위까지의 경로도 남긴다(루트까지 이어지지 않으면 트리가 렌더되지 않는다).
 */
export function filterDetailSchedules(
    items: WbsDetailSchedule[],
    filter: ScheduleFilterState,
): WbsDetailSchedule[] {
    const byId = new Map(items.map((item) => [item.id, item]));
    const childrenOf = new Map<string, WbsDetailSchedule[]>();
    for (const item of items) {
        if (!item.parentId) continue;
        if (!childrenOf.has(item.parentId)) childrenOf.set(item.parentId, []);
        childrenOf.get(item.parentId)!.push(item);
    }

    const climb = (startId: string | null, visit: (id: string) => boolean) => {
        let parentId = startId;
        let guard = 0;
        while (parentId && guard++ < 40) {
            if (!visit(parentId)) break;
            parentId = byId.get(parentId)?.parentId ?? null;
        }
    };

    let scoped = items;
    const { categoryId } = filter;
    if (categoryId && byId.has(categoryId)) {
        const inScope = new Set<string>();
        const stack = [categoryId];
        while (stack.length > 0) {
            const id = stack.pop()!;
            if (inScope.has(id)) continue;
            inScope.add(id);
            for (const child of childrenOf.get(id) ?? []) stack.push(child.id);
        }
        climb(byId.get(categoryId)!.parentId ?? null, (id) => {
            if (inScope.has(id)) return false;
            inScope.add(id);
            return true;
        });
        scoped = items.filter((item) => inScope.has(item.id));
    }

    const rowFilterActive = filter.worker !== null
        || SCHEDULE_DATE_FILTERS.some(({ key }) => isScheduleRangeActive(filter.ranges[key]))
        || SCHEDULE_WEEK_TARGETS.some(({ target }) => filter.weeks[target] !== null);
    if (!rowFilterActive) return scoped;

    const scopedIds = new Set(scoped.map((item) => item.id));
    const keep = new Set<string>();
    for (const item of scoped) {
        if (filter.worker !== null && (item.worker ?? '').trim() !== filter.worker) continue;
        if (!SCHEDULE_DATE_FILTERS.every(({ key }) => matchesScheduleRange(item[key], filter.ranges[key]))) continue;
        if (!matchesWeekFilters(item, filter.weeks)) continue;
        keep.add(item.id);
        climb(item.parentId ?? null, (id) => {
            if (!scopedIds.has(id) || keep.has(id)) return false;
            keep.add(id);
            return true;
        });
    }
    return scoped.filter((item) => keep.has(item.id));
}
