import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
    ChevronLeft, ChevronRight, Plus, X, Check, Trash2,
    Pencil,
    ChevronDown, ChevronUp, ArrowLeft,
} from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { schedulePersonalScheduleSave } from '../../store/personalScheduleStore';
import { syncWbsToLinkedPersonalSchedules, WBS_MIRROR_CATEGORY } from '../../services/wbsPersonalScheduleSync';
import { resolveLinkedWbsProjectId } from '../../utils/linkedPersonalScheduleProjects';
import { useWbsStore } from '../../store/wbsStore';
import type { WbsDevRow } from '../../types/wbs';
import { isWbsDebugingCategoryRow } from '../../types/wbs';
import WheelDatePicker, { WheelTimePicker, WheelColorPicker, WheelProgressPicker } from '../wbs/WheelDatePicker';

// ── 타입 ──────────────────────────────────────────────────────────────────
type ViewMode = 'day' | 'week' | 'month';
type TabMode = 'calendar' | 'gantt' | 'todo';
type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type CategoryKey = string;

const REPEAT_LABELS: Record<Exclude<RepeatType, 'none'>, string> = {
    daily: '매일',
    weekly: '매주',
    monthly: '매월',
    yearly: '매년',
};

interface SubEvent {
    id: string;
    title: string;
    category: CategoryKey;
    startDate: string;
    startTime?: string;
    endDate: string;
    endTime?: string;
    allDay?: boolean;
    repeat: RepeatType;
    alarm?: string;
    description?: string;
}

interface ScheduleEvent {
    id: string;
    title: string;
    category: CategoryKey;
    startDate: string;   // YYYY-MM-DD
    startTime?: string;  // HH:MM
    endDate: string;
    endTime?: string;
    allDay?: boolean;
    repeat: RepeatType;
    alarm?: string;
    description?: string;
    projectId?: string;
    subEvents?: SubEvent[];
    /** 간트 차트 연동 */
    assignee?: string;
    progress?: number;
    /** 반복 일정 — 회차별 진행률 (키: 회차 시작일 YYYY-MM-DD) */
    occurrenceProgress?: Record<string, number>;
    /** 반복 일정 — 회차별 시작·종료일 오버라이드 */
    occurrenceDates?: Record<string, { startDate: string; endDate: string }>;
    parentId?: string;
    ganttColor?: string;
    /** WBS 미러 — 구분 Debuging 행은 캘린더에서 제외 */
    isWbsMirror?: boolean;
    wbsRowId?: string;
    wbsProjectId?: string;
}

interface GanttTask {
    id: string;
    title: string;
    assignee: string;
    startDate: string;
    endDate: string;
    progress: number;
    parentId?: string;
    color?: string;
    children?: GanttTask[];
    /** 반복 일정 — 작업명 옆 뱃지용 */
    repeat?: RepeatType;
    /** 타임라인에 그릴 전체 회차 (반복 일정) */
    occurrences?: { occYmd: string; startDate: string; endDate: string; progress: number }[];
    /** 작업표·강조 표시용 현재 주기 회차 */
    currentOccYmd?: string;
}

/** 캘린더 표시용 — 하위 일정·반복 일정 펼침 메타 */
interface CalendarEvent extends ScheduleEvent {
    _sourceEventId?: string;
    _subEventIndex?: number;
    /** 반복 원본 일정 id (클릭 시 패널 열기용) */
    _recurrenceSourceId?: string;
}

interface TodoItem {
    id: string;
    title: string;
    done: boolean;
    category: CategoryKey;
    dueDate?: string;
    description?: string;
}

// ── 상수 ──────────────────────────────────────────────────────────────────
type CategoryDef = { label: string; color: string };

const DEFAULT_CATEGORIES: Record<string, CategoryDef> = {
    work:     { label: '업무 일정', color: '#3b82f6' },
    personal: { label: '개인 일정', color: '#10b981' },
    meeting:  { label: '회의',      color: '#8b5cf6' },
    deadline: { label: '마감일',    color: '#ef4444' },
    [WBS_MIRROR_CATEGORY]: { label: 'WBS', color: '#10b981' },
};

const PRESET_COLORS = [
    '#3b82f6','#10b981','#8b5cf6','#ef4444','#f59e0b',
    '#ec4899','#06b6d4','#84cc16','#f97316','#6366f1',
];

// 헥스 색상에서 light 스타일 생성 (inline style 사용)
const getCatStyle = (color: string) => ({ backgroundColor: color + '20', color, border: `1px solid ${color}40` });

const GANTT_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function parseHexColor(color: string): [number, number, number] | null {
    let hex = color.trim().replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 8) hex = hex.slice(0, 6);
    if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorLuminance(r: number, g: number, b: number) {
    const linear = [r, g, b].map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastingTextColor(bgColor: string, light = '#ffffff', dark = '#374151') {
    const rgb = parseHexColor(bgColor);
    if (!rgb) return dark;
    return colorLuminance(...rgb) > 0.45 ? dark : light;
}

/** 간트 바 진행률 텍스트 — 진행 영역 위면 bar 색 기준, 아니면 연한 배경 기준 */
function ganttBarTextColor(barColor: string, progress: number) {
    if (progress > 0) return contrastingTextColor(barColor);
    const rgb = parseHexColor(barColor);
    if (!rgb) return '#374151';
    const blend = rgb.map(c => Math.round(c * 0.19 + 255 * 0.81)) as [number, number, number];
    return contrastingTextColor(`#${blend.map(v => v.toString(16).padStart(2, '0')).join('')}`);
}

const pad = (n: number) => String(n).padStart(2, '0');
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const daysBetweenDates = (a: Date, b: Date) =>
    Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);

function genId() { return Math.random().toString(36).slice(2, 10); }

function subEventToCalendarEvent(parent: ScheduleEvent, sub: SubEvent, index: number): CalendarEvent {
    return {
        id: `${parent.id}::sub::${sub.id}`,
        title: sub.title || `하위 일정 ${index + 1}`,
        category: sub.category,
        startDate: sub.startDate,
        startTime: sub.startTime,
        endDate: sub.endDate,
        endTime: sub.endTime,
        allDay: sub.allDay ?? false,
        repeat: sub.repeat,
        alarm: sub.alarm,
        description: sub.description,
        ganttColor: parent.ganttColor,
        _sourceEventId: parent.id,
        _subEventIndex: index,
    };
}

const GANTT_CHART_PAST_DAYS = 180;
const GANTT_CHART_FUTURE_DAYS = 365;
const GANTT_CHART_PADDING_DAYS = 30;
const MAX_REPEAT_OCCURRENCES = 1000;

const normEventYmd = (s: string) => s.replace(/\./g, '-');

function getOccurrenceProgress(event: ScheduleEvent, occStartYmd: string): number {
    const anchor = normEventYmd(event.startDate);
    if (event.occurrenceProgress && Object.prototype.hasOwnProperty.call(event.occurrenceProgress, occStartYmd)) {
        return event.occurrenceProgress[occStartYmd];
    }
    if (occStartYmd === anchor) return event.progress ?? 0;
    return 0;
}

function getCalendarExpandRange(events: ScheduleEvent[]) {
    const now = startOfDay(new Date());
    let start = addDays(now, -GANTT_CHART_PAST_DAYS);
    let end = addDays(now, GANTT_CHART_FUTURE_DAYS);
    for (const e of events) {
        const s = startOfDay(parseDate(normEventYmd(e.startDate)));
        const ed = startOfDay(parseDate(normEventYmd(e.endDate)));
        if (s < start) start = s;
        if (ed > end) end = ed;
        for (const sub of e.subEvents ?? []) {
            const ss = startOfDay(parseDate(normEventYmd(sub.startDate)));
            const se = startOfDay(parseDate(normEventYmd(sub.endDate)));
            if (ss < start) start = ss;
            if (se > end) end = se;
        }
    }
    return {
        rangeStart: addDays(start, -GANTT_CHART_PADDING_DAYS),
        rangeEnd: addDays(end, GANTT_CHART_PADDING_DAYS),
    };
}

function advanceMonthly(cursor: Date, anchor: Date) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(anchor.getDate(), lastDay));
    return next;
}

function advanceYearly(cursor: Date, anchor: Date) {
    const y = cursor.getFullYear() + 1;
    const lastDay = new Date(y, anchor.getMonth() + 1, 0).getDate();
    return new Date(y, anchor.getMonth(), Math.min(anchor.getDate(), lastDay));
}

function fastForwardRepeatCursor(cursor: Date, anchor: Date, repeat: RepeatType, rangeStart: Date) {
    if (cursor >= rangeStart) return cursor;
    if (repeat === 'daily') {
        const diff = daysBetweenDates(cursor, rangeStart);
        return addDays(cursor, diff);
    }
    let next = new Date(cursor);
    let guard = 0;
    while (next < rangeStart && guard < MAX_REPEAT_OCCURRENCES) {
        if (repeat === 'weekly') next = addDays(next, 7);
        else if (repeat === 'monthly') next = advanceMonthly(next, anchor);
        else if (repeat === 'yearly') next = advanceYearly(next, anchor);
        else break;
        guard++;
    }
    return next;
}

function iterateRepeatOccurrenceStarts(
    anchorStart: Date,
    repeat: RepeatType,
    rangeStart: Date,
    rangeEnd: Date,
): Date[] {
    if (repeat === 'none') {
        return anchorStart >= rangeStart && anchorStart <= rangeEnd ? [anchorStart] : [];
    }

    const out: Date[] = [];
    let cursor = fastForwardRepeatCursor(new Date(anchorStart), anchorStart, repeat, rangeStart);
    let guard = 0;

    while (cursor <= rangeEnd && guard < MAX_REPEAT_OCCURRENCES) {
        if (cursor >= anchorStart) out.push(new Date(cursor));
        guard++;
        if (repeat === 'daily') cursor = addDays(cursor, 1);
        else if (repeat === 'weekly') cursor = addDays(cursor, 7);
        else if (repeat === 'monthly') cursor = advanceMonthly(cursor, anchorStart);
        else if (repeat === 'yearly') cursor = advanceYearly(cursor, anchorStart);
        else break;
    }
    return out;
}

function shiftEventToOccurrence<T extends { startDate: string; endDate: string }>(
    event: T,
    occStart: Date,
    anchorStart: Date,
): T {
    const duration = daysBetweenDates(
        anchorStart,
        startOfDay(parseDate(normEventYmd(event.endDate))),
    );
    return {
        ...event,
        startDate: toYMD(occStart),
        endDate: toYMD(addDays(occStart, duration)),
    };
}

function getCurrentPeriodOccurrenceStart(event: ScheduleEvent, refDate: Date): Date | null {
    const repeat = event.repeat ?? 'none';
    if (repeat === 'none') return null;

    const ref = startOfDay(refDate);
    const anchor = startOfDay(parseDate(normEventYmd(event.startDate)));
    if (ref < anchor) return null;

    switch (repeat) {
        case 'daily':
            return ref;

        case 'weekly': {
            const targetDow = anchor.getDay();
            const weekStart = addDays(ref, -ref.getDay());
            let occ = addDays(weekStart, targetDow);
            while (occ < anchor) occ = addDays(occ, 7);
            return occ;
        }

        case 'monthly': {
            const y = ref.getFullYear();
            const m = ref.getMonth();
            const lastDay = new Date(y, m + 1, 0).getDate();
            const occ = new Date(y, m, Math.min(anchor.getDate(), lastDay));
            return occ < anchor ? null : startOfDay(occ);
        }

        case 'yearly': {
            const anchorMonth = anchor.getMonth();
            const anchorDay = anchor.getDate();
            const y = ref.getFullYear();
            const lastDay = new Date(y, anchorMonth + 1, 0).getDate();
            const occ = new Date(y, anchorMonth, Math.min(anchorDay, lastDay));
            return occ < anchor ? null : startOfDay(occ);
        }

        default:
            return null;
    }
}

function getCurrentPeriodOccurrenceYmd(event: ScheduleEvent, refDate: Date): string | null {
    const occ = getCurrentPeriodOccurrenceStart(event, refDate);
    return occ ? toYMD(occ) : null;
}

function getOccurrenceDates(event: ScheduleEvent, occStart: Date, anchorStart: Date): { startDate: string; endDate: string } {
    const occYmd = toYMD(occStart);
    const override = event.occurrenceDates?.[occYmd];
    if (override) return override;
    return shiftEventToOccurrence(
        { startDate: event.startDate, endDate: event.endDate },
        occStart,
        anchorStart,
    );
}

function expandEventRepeats(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
    const repeat = event.repeat ?? 'none';
    if (repeat === 'none') return [event];

    const anchorStart = startOfDay(parseDate(normEventYmd(event.startDate)));
    const recurrenceSourceId = event._recurrenceSourceId
        ?? event._sourceEventId
        ?? event.id.split('::')[0];
    const occurrences = iterateRepeatOccurrenceStarts(anchorStart, repeat, rangeStart, rangeEnd);

    return occurrences.map(occStart => {
        const occYmd = toYMD(occStart);
        const dates = getOccurrenceDates(event as ScheduleEvent, occStart, anchorStart);
        return {
            ...event,
            ...dates,
            id: `${event.id.split('::occ::')[0]}::occ::${occYmd}`,
            repeat: 'none' as RepeatType,
            progress: getOccurrenceProgress(event as ScheduleEvent, occYmd),
            _recurrenceSourceId: recurrenceSourceId,
            _sourceEventId: event._sourceEventId,
            _subEventIndex: event._subEventIndex,
        };
    });
}

function expandEventsForCalendar(events: ScheduleEvent[], visibleCats: Set<CategoryKey>): CalendarEvent[] {
    const { rangeStart, rangeEnd } = getCalendarExpandRange(events);
    const out: CalendarEvent[] = [];

    for (const e of events) {
        if (visibleCats.has(e.category)) {
            out.push(...expandEventRepeats(e, rangeStart, rangeEnd));
        }
        (e.subEvents ?? []).forEach((sub, i) => {
            if (!visibleCats.has(sub.category)) return;
            out.push(...expandEventRepeats(subEventToCalendarEvent(e, sub, i), rangeStart, rangeEnd));
        });
    }
    return out;
}

/** WBS 구분(산출물) Debuging 행 — 캘린더(주/월/일) 표시 제외, 간트는 유지 */
function isDebugingCategoryCalendarEvent(e: ScheduleEvent, debugingRowIds: Set<string>): boolean {
    return !!(e.wbsRowId && debugingRowIds.has(e.wbsRowId));
}

function eventsToGanttTasks(events: ScheduleEvent[], categories: Record<string, CategoryDef>, refDate: Date): GanttTask[] {
    const { rangeStart, rangeEnd } = getCalendarExpandRange(events);
    const today = startOfDay(refDate);

    return events.map(e => {
        const repeat = e.repeat ?? 'none';
        const catColor = categories[e.category]?.color;
        const base: GanttTask = {
            id: e.id,
            title: e.title,
            assignee: e.assignee ?? '',
            startDate: e.startDate,
            endDate: e.endDate,
            progress: e.progress ?? 0,
            parentId: e.parentId,
            color: e.ganttColor ?? catColor ?? GANTT_COLORS[0],
        };

        if (repeat === 'none') return base;

        const anchorStart = startOfDay(parseDate(normEventYmd(e.startDate)));
        const expanded = expandEventRepeats(e, rangeStart, rangeEnd);
        const occurrences = expanded.map(occ => ({
            occYmd: normEventYmd(occ.startDate),
            startDate: occ.startDate,
            endDate: occ.endDate,
            progress: occ.progress ?? 0,
        }));

        const periodOcc = getCurrentPeriodOccurrenceStart(e, today);
        if (periodOcc) {
            const periodYmd = toYMD(periodOcc);
            const dates = getOccurrenceDates(e, periodOcc, anchorStart);
            base.startDate = dates.startDate;
            base.endDate = dates.endDate;
            base.progress = getOccurrenceProgress(e, periodYmd);
        }

        return {
            ...base,
            repeat,
            occurrences,
            currentOccYmd: periodOcc ? toYMD(periodOcc) : undefined,
        };
    });
}

function isAnchorOccurrenceYmd(event: ScheduleEvent, occYmd: string) {
    return normEventYmd(event.startDate) === occYmd;
}

function buildEventViewForOccurrence(
    parent: ScheduleEvent,
    occurrence: Pick<ScheduleEvent, 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'allDay' | 'progress'>,
    occYmd?: string,
): ScheduleEvent {
    const ymd = occYmd ?? normEventYmd(occurrence.startDate);
    return {
        ...parent,
        startDate: occurrence.startDate,
        endDate: occurrence.endDate,
        startTime: occurrence.startTime ?? parent.startTime,
        endTime: occurrence.endTime ?? parent.endTime,
        allDay: occurrence.allDay ?? parent.allDay,
        progress: occurrence.progress ?? getOccurrenceProgress(parent, ymd),
    };
}

function applyOccurrencePatchToEvent(
    event: ScheduleEvent,
    occYmd: string,
    patch: Partial<Pick<ScheduleEvent, 'title' | 'assignee' | 'ganttColor' | 'progress' | 'startDate' | 'endDate'>>,
): ScheduleEvent {
    const repeat = event.repeat ?? 'none';
    if (repeat === 'none') return { ...event, ...patch };

    const next: ScheduleEvent = { ...event };
    const isAnchor = isAnchorOccurrenceYmd(event, occYmd);
    const occDate = parseDate(occYmd);
    const anchorStart = startOfDay(parseDate(normEventYmd(event.startDate)));

    if (patch.progress !== undefined) {
        if (isAnchor) next.progress = patch.progress;
        else next.occurrenceProgress = { ...next.occurrenceProgress, [occYmd]: patch.progress };
    }
    if (patch.startDate !== undefined || patch.endDate !== undefined) {
        const prev = next.occurrenceDates?.[occYmd];
        const defaultDates = prev ?? getOccurrenceDates(event, occDate, anchorStart);
        const dates = {
            startDate: patch.startDate ?? defaultDates.startDate,
            endDate: patch.endDate ?? defaultDates.endDate,
        };
        if (isAnchor) {
            next.startDate = dates.startDate;
            next.endDate = dates.endDate;
        } else {
            next.occurrenceDates = { ...next.occurrenceDates, [occYmd]: dates };
        }
    }
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.assignee !== undefined) next.assignee = patch.assignee;
    if (patch.ganttColor !== undefined) next.ganttColor = patch.ganttColor;
    return next;
}

function applyPanelSaveToEvent(existing: ScheduleEvent, saved: ScheduleEvent, occYmd: string): ScheduleEvent {
    const next = applyOccurrencePatchToEvent(existing, occYmd, {
        title: saved.title,
        assignee: saved.assignee,
        ganttColor: saved.ganttColor,
        progress: saved.progress,
        startDate: saved.startDate,
        endDate: saved.endDate,
    });
    return {
        ...next,
        category: saved.category,
        startTime: saved.startTime,
        endTime: saved.endTime,
        allDay: saved.allDay,
        repeat: saved.repeat,
        alarm: saved.alarm,
        description: saved.description,
        projectId: saved.projectId,
        subEvents: saved.subEvents,
    };
}

function applyGanttPatchToEvent(event: ScheduleEvent, patch: Partial<GanttTask>, refDate: Date = startOfDay(new Date())): ScheduleEvent {
    const repeat = event.repeat ?? 'none';
    const periodOcc = getCurrentPeriodOccurrenceStart(event, refDate);

    if (repeat !== 'none' && periodOcc) {
        return applyOccurrencePatchToEvent(event, toYMD(periodOcc), ganttPatchToEvent(patch));
    }

    return { ...event, ...ganttPatchToEvent(patch) };
}

function isCalendarSubEvent(e: CalendarEvent) {
    return e._sourceEventId != null || !!e.parentId;
}

function eventActiveOnYmd(e: CalendarEvent, ymd: string) {
    const s = normEventYmd(e.startDate);
    const end = normEventYmd(e.endDate);
    return s <= ymd && end >= ymd;
}

/** 여러 날에 걸친 일정(시작일 ≠ 종료일) — 캘린더에서 연속된 하나의 바로 표시한다. */
function isMultiDayEvent(e: CalendarEvent) {
    return normEventYmd(e.endDate) > normEventYmd(e.startDate);
}

/**
 * 상단 "종일" 영역에 연속 바로 올릴 일정 — "종일"이 체크된 일정만 해당.
 * 종일이 아닌 일정은 시간대 그리드에 시간 위치로 배치된다.
 * (여러 날에 걸친 시간 일정은 시간 그리드 안에서 하나의 연속 바로 표시)
 */
function isSpanningEvent(e: CalendarEvent) {
    return !!e.allDay;
}

function sortCalendarEventsForDay(a: CalendarEvent, b: CalendarEvent) {
    const aSub = isCalendarSubEvent(a) ? 1 : 0;
    const bSub = isCalendarSubEvent(b) ? 1 : 0;
    if (aSub !== bSub) return aSub - bSub;
    return normEventYmd(a.startDate).localeCompare(normEventYmd(b.startDate));
}

function eventBarColor(e: CalendarEvent, categories: Record<string, CategoryDef>) {
    return e.ganttColor ?? categories[e.category]?.color ?? '#94a3b8';
}

function parseTimeMinutes(t?: string): number {
    if (!t) return 0;
    const [h, m = 0] = t.split(':').map(Number);
    return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
}

function yFromMinutes(min: number, hourOffset: number[], hourHeights: number[], hourStart = 0) {
    const hour = Math.floor(min / 60);
    let idx = hour - hourStart;
    if (idx < 0) return hourOffset[0];
    if (idx >= hourHeights.length) return hourOffset[hourHeights.length];
    const m = min % 60;
    return hourOffset[idx] + (m / 60) * hourHeights[idx];
}

function getNowLineTop(now: Date, hourOffset: number[], hourHeights: number[], hourStart = CALENDAR_PRIME_HOUR): number | null {
    const min = now.getHours() * 60 + now.getMinutes();
    const startMin = hourStart * 60;
    const endMin = (hourStart + hourHeights.length) * 60;
    if (min < startMin || min > endMin) return null;
    return yFromMinutes(min, hourOffset, hourHeights, hourStart);
}

function useCalendarNow(tickMs = 60_000) {
    const [now, setNow] = React.useState(() => new Date());
    React.useEffect(() => {
        const id = setInterval(() => setNow(new Date()), tickMs);
        return () => clearInterval(id);
    }, [tickMs]);
    return now;
}

const CalendarNowLine: React.FC<{ top: number; left?: number; width?: number | string }> = ({ top, left = 0, width = '100%' }) => (
    <div
        className="absolute z-[5] pointer-events-none flex items-center"
        style={{ top, left, width, transform: 'translateY(-50%)' }}
    >
        <div className="w-2.5 h-2.5 shrink-0 rounded-full bg-red-500 ring-2 ring-white" />
        <div className="flex-1 min-w-0 h-0.5 bg-red-500" />
    </div>
);

const TIMED_BAR_MIN_H = 36;
const TIMED_BAR_GAP = 2;
const HOUR_MIN_H = 56;
const CALENDAR_PRIME_HOUR = 9;
const CALENDAR_HOUR_END = 23;
const getCalendarHours = () =>
    Array.from({ length: CALENDAR_HOUR_END - CALENDAR_PRIME_HOUR + 1 }, (_, i) => CALENDAR_PRIME_HOUR + i);
const ALLDAY_BAR_MIN_H = 24;
const ALLDAY_BAR_GAP = 3;
const ALLDAY_SUB_INDENT = 10;
/** 접힌 상태에서 보여줄 최대 종일 row 수 (이보다 많으면 더보기) */
const ALLDAY_COLLAPSED_MAX_LANES = 2;
const ALLDAY_DAY_COLLAPSED_COUNT = 2;

function allDaySectionHeightForLanes(laneCount: number): number {
    const lanes = Math.max(1, laneCount);
    return lanes * (ALLDAY_BAR_MIN_H + ALLDAY_BAR_GAP) + ALLDAY_BAR_GAP * 2;
}

/** Ctrl+휠 → 가로 스크롤, 트랙패드 가로 스와이프도 지원 */
function applyHorizontalWheelScroll(el: HTMLElement, e: WheelEvent): void {
    if (e.ctrlKey) {
        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        if (delta === 0) return;
        e.preventDefault();
        el.scrollLeft += delta;
        return;
    }
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    el.scrollLeft += e.deltaX;
}

function getCalendarParentId(e: CalendarEvent): string | undefined {
    return e._sourceEventId ?? e.parentId;
}

function timesOverlap(a: { start: number; end: number }, b: { start: number; end: number }) {
    return a.start < b.end && a.end > b.start;
}

type AllDayBarLayout = {
    event: CalendarEvent;
    startCol: number;
    endCol: number;
    span: number;
    lane: number;
    isSub: boolean;
};

/** 종일 bar — 부모 아래에 하위 row 배치 + spanning */
function layoutAllDayWeekBars(events: CalendarEvent[], days: Date[]): { bars: AllDayBarLayout[]; rowHeight: number; maxLane: number } {
    const weekStartYmd = toYMD(days[0]);
    const weekEndYmd = toYMD(days[days.length - 1]);

    const inWeek = events.filter(e => {
        // 종일 일정뿐 아니라 여러 날에 걸친 일정도 연속 바로 표시
        if (!isSpanningEvent(e)) return false;
        const s = normEventYmd(e.startDate);
        const end = normEventYmd(e.endDate);
        return s <= weekEndYmd && end >= weekStartYmd;
    });

    type Raw = { event: CalendarEvent; startCol: number; endCol: number; span: number; isSub: boolean };
    const raw: Raw[] = inWeek.map(e => {
        const s = normEventYmd(e.startDate);
        const end = normEventYmd(e.endDate);
        const visStart = s < weekStartYmd ? weekStartYmd : s;
        const visEnd = end > weekEndYmd ? weekEndYmd : end;
        const startCol = daysBetweenDates(parseDate(weekStartYmd), parseDate(visStart));
        const endCol = daysBetweenDates(parseDate(weekStartYmd), parseDate(visEnd));
        return { event: e, startCol, endCol, span: endCol - startCol + 1, isSub: isCalendarSubEvent(e) };
    });

    const parents = raw.filter(b => !b.isSub).sort((a, b) => a.startCol - b.startCol || b.span - a.span);
    const children = raw.filter(b => b.isSub);
    const bars: AllDayBarLayout[] = [];
    const laneEnds: number[] = [];

    for (const bar of parents) {
        let lane = 0;
        while (lane < laneEnds.length && laneEnds[lane] >= bar.startCol) lane++;
        if (lane === laneEnds.length) laneEnds.push(-1);
        laneEnds[lane] = bar.endCol;
        bars.push({ ...bar, lane });

        const childList = children
            .filter(c => getCalendarParentId(c.event) === bar.event.id)
            .sort((a, b) => a.startCol - b.startCol);

        const siblingLaneEnds: number[] = [];
        for (const child of childList) {
            let sLane = 0;
            while (sLane < siblingLaneEnds.length && siblingLaneEnds[sLane] >= child.startCol) sLane++;
            if (sLane === siblingLaneEnds.length) siblingLaneEnds.push(-1);
            siblingLaneEnds[sLane] = child.endCol;
            bars.push({ ...child, lane: lane + 1 + sLane });
        }
    }

    for (const child of children) {
        if (bars.some(b => b.event.id === child.event.id)) continue;
        let lane = 0;
        while (lane < laneEnds.length && laneEnds[lane] >= child.startCol) lane++;
        if (lane === laneEnds.length) laneEnds.push(-1);
        laneEnds[lane] = child.endCol;
        bars.push({ ...child, lane });
    }

    const maxLane = bars.length ? Math.max(...bars.map(b => b.lane)) + 1 : 1;
    const rowHeight = allDaySectionHeightForLanes(maxLane);
    return { bars, rowHeight, maxLane };
}

/**
 * 캘린더 일정 칩의 "트랙"(바탕) 스타일.
 * 진행률 채움은 별도의 <CalendarChipFill> 엘리먼트로 그려, 부모 칩과
 * 동일한 보더·보더 레디어스를 그대로 갖도록 한다.
 */
function calendarBarStyle(isSub: boolean, color: string, progress = 0): React.CSSProperties {
    const pct = Math.max(0, Math.min(100, Math.round(progress)));
    if (isSub) {
        // 하위 일정: 옅은 트랙
        return { backgroundColor: color + '18', color, boxShadow: `inset 0 0 0 1px ${color}40` };
    }
    // 일반 일정: 옅은 트랙 + 보더 (간트 바와 동일한 느낌)
    return {
        backgroundColor: color + '33',
        border: `1px solid ${color}66`,
        color: ganttBarTextColor(color, pct),
    };
}

/**
 * 진행률 채움 영역. 부모 칩과 동일한 보더 레디어스(rounded-md)와 보더를 적용해
 * 채워지는 부분이 부모 영역처럼 보이도록 한다.
 */
const CalendarChipFill: React.FC<{ color: string; isSub?: boolean; progress?: number }> = ({ color, isSub = false, progress = 0 }) => {
    const pct = Math.max(0, Math.min(100, Math.round(progress)));
    if (pct <= 0) return null;
    return (
        <div
            className="absolute inset-y-0 left-0 rounded-md pointer-events-none z-0"
            style={{
                width: `${pct}%`,
                backgroundColor: isSub ? color + '55' : color,
                border: `1px solid ${color}66`,
            }}
        />
    );
};

type TimedBarLayout = {
    event: CalendarEvent;
    top: number;
    height: number;
    isSub: boolean;
};

function layoutDayTimedEvents(
    dayEvents: CalendarEvent[],
    hourOffset: number[],
    hourHeights: number[],
    hourStart = CALENDAR_PRIME_HOUR,
): TimedBarLayout[] {
    type Item = { event: CalendarEvent; start: number; end: number; row: number; rowCount: number };
    const items: Item[] = dayEvents.map(e => {
        const start = parseTimeMinutes(e.startTime);
        const end = Math.max(parseTimeMinutes(e.endTime), start + 30);
        return { event: e, start, end, row: 0, rowCount: 1 };
    }).sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return (isCalendarSubEvent(a.event) ? 1 : 0) - (isCalendarSubEvent(b.event) ? 1 : 0);
    });

    for (let i = 0; i < items.length; i++) {
        const parentIdx = items.findIndex((other, j) => j < i &&
            timesOverlap(other, items[i]) &&
            (items[i].event.parentId === other.event.id || items[i].event._sourceEventId === other.event.id),
        );

        if (parentIdx >= 0) {
            items[i].row = items[parentIdx].row + 1;
            while (items.slice(0, i).some((other, j) =>
                j !== parentIdx && other.row === items[i].row && timesOverlap(other, items[i]),
            )) {
                items[i].row++;
            }
        } else {
            const usedRows = new Set<number>();
            for (let j = 0; j < i; j++) {
                if (timesOverlap(items[j], items[i])) usedRows.add(items[j].row);
            }
            let row = 0;
            while (usedRows.has(row)) row++;
            items[i].row = row;
        }
    }
    for (let i = 0; i < items.length; i++) {
        let maxRow = items[i].row;
        for (const other of items) {
            if (other.start < items[i].end && other.end > items[i].start) maxRow = Math.max(maxRow, other.row);
        }
        items[i].rowCount = maxRow + 1;
    }

    return items.map(it => {
        const baseTop = yFromMinutes(it.start, hourOffset, hourHeights, hourStart);
        const fullBottom = yFromMinutes(it.end, hourOffset, hourHeights, hourStart);
        const fullHeight = Math.max(fullBottom - baseTop, TIMED_BAR_MIN_H);

        if (it.rowCount <= 1) {
            return {
                event: it.event,
                top: baseTop,
                height: fullHeight,
                isSub: isCalendarSubEvent(it.event),
            };
        }

        const top = baseTop + it.row * (TIMED_BAR_MIN_H + TIMED_BAR_GAP);
        return {
            event: it.event,
            top,
            height: TIMED_BAR_MIN_H,
            isSub: isCalendarSubEvent(it.event),
        };
    });
}

/** 해당 시간대 최대 겹침 row 수 */
function maxOverlapRowsAtHour(dayEvents: CalendarEvent[], hour: number): number {
    const items = dayEvents
        .filter(e => Math.floor(parseTimeMinutes(e.startTime) / 60) === hour)
        .map(e => ({
            start: parseTimeMinutes(e.startTime),
            end: Math.max(parseTimeMinutes(e.endTime), parseTimeMinutes(e.startTime) + 30),
            row: 0,
        }));

    for (let i = 0; i < items.length; i++) {
        const usedRows = new Set<number>();
        for (let j = 0; j < i; j++) {
            if (items[j].start < items[i].end && items[j].end > items[i].start) usedRows.add(items[j].row);
        }
        let row = 0;
        while (usedRows.has(row)) row++;
        items[i].row = row;
    }
    if (items.length === 0) return 1;
    return Math.max(...items.map(it => it.row + 1), 1);
}

function ganttPatchToEvent(patch: Partial<GanttTask>): Partial<ScheduleEvent> {
    const out: Partial<ScheduleEvent> = {};
    if (patch.title !== undefined) out.title = patch.title;
    if (patch.assignee !== undefined) out.assignee = patch.assignee;
    if (patch.startDate !== undefined) out.startDate = patch.startDate;
    if (patch.endDate !== undefined) out.endDate = patch.endDate;
    if (patch.progress !== undefined) out.progress = patch.progress;
    if (patch.parentId !== undefined) out.parentId = patch.parentId;
    if (patch.color !== undefined) out.ganttColor = patch.color;
    return out;
}

function expandRangeWithAnchor(
    start: Date,
    end: Date,
    anchorWeekStart?: Date,
): { start: Date; end: Date } {
    if (!anchorWeekStart) return { start, end };
    const ws = startOfDay(anchorWeekStart);
    const we = addDays(ws, 6);
    let nextStart = start;
    let nextEnd = end;
    if (ws < nextStart) nextStart = ws;
    if (we > nextEnd) nextEnd = we;
    return { start: nextStart, end: nextEnd };
}

function computeGanttChartRange(tasks: GanttTask[], anchorWeekStart?: Date) {
    const now = startOfDay(new Date());
    let start = addDays(now, -GANTT_CHART_PAST_DAYS);
    let end = addDays(now, GANTT_CHART_FUTURE_DAYS);
    for (const t of tasks) {
        const spans = t.occurrences?.length
            ? t.occurrences
            : [{ startDate: t.startDate, endDate: t.endDate }];
        for (const span of spans) {
            const ss = startOfDay(parseDate(span.startDate.replace(/\./g, '-')));
            const ee = startOfDay(parseDate(span.endDate.replace(/\./g, '-')));
            if (ss < start) start = ss;
            if (ee > end) end = ee;
        }
    }
    ({ start, end } = expandRangeWithAnchor(start, end, anchorWeekStart));
    return {
        chartStart: addDays(start, -GANTT_CHART_PADDING_DAYS),
        chartEnd: addDays(end, GANTT_CHART_PADDING_DAYS),
    };
}

function computeCalendarScrollRange(events: CalendarEvent[], anchorWeekStart?: Date) {
    const now = startOfDay(new Date());
    let start = addDays(now, -GANTT_CHART_PAST_DAYS);
    let end = addDays(now, GANTT_CHART_FUTURE_DAYS);
    for (const e of events) {
        const s = startOfDay(parseDate(normEventYmd(e.startDate)));
        const ed = startOfDay(parseDate(normEventYmd(e.endDate)));
        if (s < start) start = s;
        if (ed > end) end = ed;
    }
    ({ start, end } = expandRangeWithAnchor(start, end, anchorWeekStart));
    return {
        rangeStart: addDays(start, -GANTT_CHART_PADDING_DAYS),
        rangeEnd: addDays(end, GANTT_CHART_PADDING_DAYS),
    };
}

const CALENDAR_TIME_GUTTER = 48;

// ── SEED 데이터 ───────────────────────────────────────────────────────────
const SEED_SCHEDULE: ScheduleEvent[] = [];

// ── 미니 캘린더 ───────────────────────────────────────────────────────────
const MiniCalendar: React.FC<{
    current: Date;
    selected: Date;
    onSelect: (d: Date) => void;
    eventDates: Set<string>;
    rangeStart?: Date;
    rangeEnd?: Date;
}> = ({ current, selected, onSelect, eventDates, rangeStart, rangeEnd }) => {
    const [view, setView] = useState(new Date(current.getFullYear(), current.getMonth(), 1));
    React.useEffect(() => {
        setView(new Date(current.getFullYear(), current.getMonth(), 1));
    }, [current.getFullYear(), current.getMonth()]);
    const year = view.getFullYear(); const month = view.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))];

    const rsYmd = rangeStart ? toYMD(rangeStart) : null;
    const reYmd = rangeEnd   ? toYMD(rangeEnd)   : null;

    return (
        <div className="select-none">
            <div className="flex items-center justify-between mb-2">
                <button onClick={() => setView(new Date(year, month - 1, 1))} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft size={14} /></button>
                <span className="text-xs font-black text-gray-700">{year}년 {month + 1}월</span>
                <button onClick={() => setView(new Date(year, month + 1, 1))} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight size={14} /></button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
                {['일','월','화','수','목','금','토'].map(d => (
                    <div key={d} className="text-[10px] font-bold text-gray-400 py-1">{d}</div>
                ))}
                {cells.map((d, i) => {
                    if (!d) return <div key={`empty-${i}`} />;
                    const ymd = toYMD(d);
                    const isToday = ymd === toYMD(new Date());
                    const isSelected = ymd === toYMD(selected);
                    const hasEvent = eventDates.has(ymd);
                    const inRange = rsYmd && reYmd && ymd >= rsYmd && ymd <= reYmd;
                    const isRangeStart = rsYmd && ymd === rsYmd;
                    const isRangeEnd   = reYmd && ymd === reYmd;
                    return (
                        <div key={ymd} className="relative flex items-center justify-center">
                            {/* 범위 배경 (연속 띠) */}
                            {inRange && (
                                <div className={`absolute inset-y-0 bg-rose-100/80
                                    ${isRangeStart ? 'left-1/2 right-0' : isRangeEnd ? 'left-0 right-1/2' : 'left-0 right-0'}`} />
                            )}
                            <button onClick={() => onSelect(d)}
                                className={`relative z-10 text-[11px] font-bold w-6 h-6 flex items-center justify-center transition-colors
                                    ${isRangeStart || isRangeEnd ? 'rounded-full bg-rose-400 text-white' :
                                      isSelected ? 'rounded-full bg-rose-500 text-white' :
                                      isToday    ? 'rounded-full bg-rose-100 text-rose-600' :
                                                   'rounded-full hover:bg-gray-100 text-gray-700'}`}>
                                {d.getDate()}
                                {hasEvent && !isSelected && !inRange && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-rose-400" />}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── 이벤트 폼 패널 ────────────────────────────────────────────────────────
const EventForm: React.FC<{
    event: Partial<ScheduleEvent> | null;
    initialActiveTab?: 'main' | number;
    onSave: (e: ScheduleEvent) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    projects: { id: string; name: string }[];
    categories: Record<string, CategoryDef>;
    onAddCategory: (label: string, color: string) => void;
    onEditCategory: (key: string, label: string, color: string) => void;
    onDeleteCategory: (key: string) => void;
}> = ({ event, initialActiveTab = 'main', onSave, onDelete, onClose, projects, categories, onAddCategory, onEditCategory, onDeleteCategory }) => {
    const isNew = !event?.id;
    const [title, setTitle] = useState(event?.title || '');
    const [category, setCategory] = useState<CategoryKey>(event?.category || Object.keys(categories)[0] || 'work');

    // 카테고리 관리 UI state
    const [catMode, setCatMode] = useState<'select' | 'manage' | 'add' | 'edit'>('select');
    const [newCatLabel, setNewCatLabel] = useState('');
    const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);
    const [editKey, setEditKey] = useState('');
    const [editLabel, setEditLabel] = useState('');
    const [editColor, setEditColor] = useState('');
    const [startDate, setStartDate] = useState(event?.startDate || toYMD(new Date()));
    const [startTime, setStartTime] = useState(event?.startTime || '09:00');
    const [endDate, setEndDate] = useState(event?.endDate || event?.startDate || toYMD(new Date()));
    const [endTime, setEndTime] = useState(event?.endTime || '10:00');
    const [allDay, setAllDay] = useState(event?.allDay ?? false);
    const [repeat, setRepeat] = useState<RepeatType>(event?.repeat || 'none');
    const [alarm, setAlarm] = useState(event?.alarm || '15분 전');
    const [description, setDescription] = useState(event?.description || '');
    const [projectId, setProjectId] = useState(event?.projectId || '');
    const [barColor, setBarColor] = useState(
        event?.ganttColor || categories[event?.category || Object.keys(categories)[0] || 'work']?.color || GANTT_COLORS[0],
    );
    const [progress, setProgress] = useState(event?.progress ?? 0);

    // 하위 일정
    const [subEvents, setSubEvents] = useState<SubEvent[]>(event?.subEvents || []);
    const [activeTab, setActiveTab] = useState<'main' | number>('main');

    React.useEffect(() => {
        setTitle(event?.title || '');
        setCategory(event?.category || Object.keys(categories)[0] || 'work');
        setStartDate(event?.startDate || toYMD(new Date()));
        setStartTime(event?.startTime || '09:00');
        setEndDate(event?.endDate || event?.startDate || toYMD(new Date()));
        setEndTime(event?.endTime || '10:00');
        setAllDay(event?.allDay ?? false);
        setRepeat(event?.repeat || 'none');
        setAlarm(event?.alarm || '15분 전');
        setDescription(event?.description || '');
        setProjectId(event?.projectId || '');
        setBarColor(event?.ganttColor || categories[event?.category || Object.keys(categories)[0] || 'work']?.color || GANTT_COLORS[0]);
        setProgress(event?.progress ?? 0);
        setSubEvents(event?.subEvents || []);
        setActiveTab(initialActiveTab);
        setCatMode('select');
    }, [event?.id, event?.title, event?.category, event?.startDate, event?.startTime, event?.endDate, event?.endTime, event?.allDay, event?.repeat, event?.alarm, event?.description, event?.projectId, event?.ganttColor, event?.progress, event?.subEvents, initialActiveTab, categories]); // eslint-disable-line react-hooks/exhaustive-deps

    const addSubEvent = () => {
        const sub: SubEvent = {
            id: genId(), title: '', category: Object.keys(categories)[0] || 'work',
            startDate: startDate, startTime: startTime,
            endDate: startDate,   endTime: endTime,
            allDay: false, repeat: 'none', alarm: '15분 전', description: '',
        };
        setSubEvents(prev => [...prev, sub]);
        setActiveTab(subEvents.length); // 새 탭으로 이동
    };

    const updateSubEvent = (idx: number, patch: Partial<SubEvent>) => {
        setSubEvents(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
    };

    const removeSubEvent = (idx: number) => {
        setSubEvents(prev => prev.filter((_, i) => i !== idx));
        setActiveTab('main');
    };

    const handleSave = () => {
        if (!title.trim()) return;
        onSave({
            ...(event as ScheduleEvent | undefined),
            id: event?.id || genId(),
            title: title.trim(),
            category,
            startDate,
            startTime,
            endDate,
            endTime,
            allDay,
            repeat,
            alarm,
            description,
            projectId: projectId || undefined,
            ganttColor: barColor,
            progress,
            subEvents: subEvents.length ? subEvents : undefined,
        });
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <span className="text-sm font-black text-gray-800">일정정보</span>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400"><X size={16} /></button>
            </div>

            {/* 탭 */}
            <div className="flex border-b border-gray-100 overflow-x-auto shrink-0">
                <button onClick={() => setActiveTab('main')}
                    className={`shrink-0 px-3 py-2.5 text-xs font-bold transition-colors ${activeTab === 'main' ? 'border-b-2 border-rose-500 text-rose-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    일정 정보
                </button>
                {subEvents.map((s, i) => (
                    <button key={s.id} onClick={() => setActiveTab(i)}
                        className={`shrink-0 flex items-center gap-1 px-3 py-2.5 text-xs font-bold transition-colors ${activeTab === i ? 'border-b-2 border-rose-500 text-rose-600' : 'text-gray-400 hover:text-gray-600'}`}>
                        {s.title || `하위 일정 ${i + 1}`}
                        <span onClick={e => { e.stopPropagation(); removeSubEvent(i); }}
                            className="ml-0.5 hover:text-red-400 text-gray-300 leading-none">✕</span>
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── 메인 탭 ── */}
            {activeTab === 'main' && <>
                {/* 제목 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">제목 *</label>
                    <input value={title} onChange={e => setTitle(e.target.value)}
                        placeholder="일정 제목 입력"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50" />
                </div>

                {/* 구분 + 카테고리 관리 */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-gray-600">구분</label>
                        <button onClick={() => setCatMode(m => m === 'select' ? 'manage' : 'select')}
                            className="text-[10px] text-rose-500 font-bold hover:underline">
                            {catMode === 'select' ? '관리' : '닫기'}
                        </button>
                    </div>

                    {catMode === 'select' && (
                        <select value={category} onChange={e => setCategory(e.target.value as CategoryKey)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50">
                            {Object.entries(categories).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    )}

                    {catMode === 'manage' && (
                        <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                            {Object.entries(categories).map(([k, v]) => (
                                <div key={k} className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-0">
                                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: v.color }} />
                                    <span className="flex-1 text-xs text-gray-700">{v.label}</span>
                                    <button onClick={() => { setEditKey(k); setEditLabel(v.label); setEditColor(v.color); setCatMode('edit'); }}
                                        className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-blue-500">
                                        <Pencil size={11} />
                                    </button>
                                    <button onClick={() => onDeleteCategory(k)}
                                        className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-red-500">
                                        <X size={11} />
                                    </button>
                                </div>
                            ))}
                            <button onClick={() => { setNewCatLabel(''); setNewCatColor(PRESET_COLORS[0]); setCatMode('add'); }}
                                className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-rose-500 font-bold hover:bg-rose-50">
                                <Plus size={12} /> 카테고리 추가
                            </button>
                        </div>
                    )}

                    {catMode === 'add' && (
                        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
                            <input value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)}
                                placeholder="카테고리 이름"
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-rose-400 bg-white" />
                            <div className="flex flex-wrap gap-1.5">
                                {PRESET_COLORS.map(c => (
                                    <button key={c} onClick={() => setNewCatColor(c)}
                                        className={`w-5 h-5 rounded-full border-2 transition-all ${newCatColor === c ? 'border-gray-700 scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: c }} />
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setCatMode('manage')}
                                    className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100">취소</button>
                                <button onClick={() => { if (newCatLabel.trim()) { onAddCategory(newCatLabel.trim(), newCatColor); setCatMode('manage'); } }}
                                    className="flex-1 py-1.5 text-xs bg-rose-500 text-white rounded-lg hover:bg-rose-600">추가</button>
                            </div>
                        </div>
                    )}

                    {catMode === 'edit' && (
                        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
                            <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                                placeholder="카테고리 이름"
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-rose-400 bg-white" />
                            <div className="flex flex-wrap gap-1.5">
                                {PRESET_COLORS.map(c => (
                                    <button key={c} onClick={() => setEditColor(c)}
                                        className={`w-5 h-5 rounded-full border-2 transition-all ${editColor === c ? 'border-gray-700 scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: c }} />
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setCatMode('manage')}
                                    className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100">취소</button>
                                <button onClick={() => { if (editLabel.trim()) { onEditCategory(editKey, editLabel.trim(), editColor); setCatMode('manage'); } }}
                                    className="flex-1 py-1.5 text-xs bg-rose-500 text-white rounded-lg hover:bg-rose-600">저장</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 바 색상 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">바 색상</label>
                    <WheelColorPicker value={barColor} onChange={setBarColor} variant="panel" placeholder="색상 선택" />
                </div>

                {/* 진행률 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">진행률</label>
                    <WheelProgressPicker value={progress} onChange={setProgress} variant="panel" accentColor={barColor} />
                </div>

                {/* 일정 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">일정</label>
                    <div className="grid grid-cols-2 gap-2 mb-1.5">
                        <div>
                            <span className="block text-[10px] font-bold text-gray-400 mb-0.5">시작일</span>
                            <WheelDatePicker
                                value={normEventYmd(startDate)}
                                onChange={v => {
                                    setStartDate(v);
                                    if (normEventYmd(endDate) < v) setEndDate(v);
                                }}
                                placeholder="시작일"
                                className="w-full text-xs"
                            />
                        </div>
                        <div>
                            <span className="block text-[10px] font-bold text-gray-400 mb-0.5">종료일</span>
                            <WheelDatePicker
                                value={normEventYmd(endDate)}
                                onChange={v => {
                                    setEndDate(v);
                                    if (v < normEventYmd(startDate)) setStartDate(v);
                                }}
                                placeholder="종료일"
                                className="w-full text-xs"
                            />
                        </div>
                    </div>
                    {!allDay && (
                        <div className="grid grid-cols-2 gap-2">
                            <WheelTimePicker value={startTime} onChange={setStartTime} variant="panel" placeholder="시작" />
                            <WheelTimePicker value={endTime} onChange={setEndTime} variant="panel" placeholder="종료" />
                        </div>
                    )}
                </div>

                {/* 종일 */}
                <div className="flex items-center gap-2">
                    <button onClick={() => setAllDay(v => !v)}
                        className={`w-9 h-5 rounded-full transition-colors ${allDay ? 'bg-rose-500' : 'bg-gray-200'}`}>
                        <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${allDay ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    <span className="text-xs font-bold text-gray-600">종일</span>
                </div>

                {/* 반복 / 알림 */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">반복</label>
                        <select value={repeat} onChange={e => setRepeat(e.target.value as RepeatType)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50">
                            <option value="none">반복 안함</option>
                            <option value="daily">매일</option>
                            <option value="weekly">매주</option>
                            <option value="monthly">매월</option>
                            <option value="yearly">매년</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">알림</label>
                        <select value={alarm} onChange={e => setAlarm(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50">
                            {['5분 전','10분 전','15분 전','30분 전','1시간 전','1일 전'].map(v => (
                                <option key={v} value={v}>{v}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* 프로젝트 연결 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">프로젝트</label>
                    <select value={projectId} onChange={e => setProjectId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50">
                        <option value="">선택하세요</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                {/* 설명 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">설명</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)}
                        rows={3} maxLength={200}
                        placeholder="메모를 입력하세요"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50 resize-none" />
                    <div className="text-right text-[10px] text-gray-400">{description.length}/200</div>
                </div>

                {/* 하위 일정 추가 버튼 */}
                <button onClick={addSubEvent}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-rose-500 border border-dashed border-rose-300 rounded-xl hover:bg-rose-50 transition-colors">
                    <Plus size={13} /> 하위 일정 추가
                </button>
            </>}

            {/* ── 하위 일정 탭 ── */}
            {typeof activeTab === 'number' && subEvents[activeTab] && (() => {
                const s = subEvents[activeTab];
                const idx = activeTab;
                return <>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">제목</label>
                        <input value={s.title} onChange={e => updateSubEvent(idx, { title: e.target.value })}
                            placeholder="하위 일정 제목 입력"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">구분</label>
                        <select value={s.category} onChange={e => updateSubEvent(idx, { category: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50">
                            {Object.entries(categories).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">일정</label>
                        <div className="grid grid-cols-2 gap-2 mb-1.5">
                            <div>
                                <span className="block text-[10px] font-bold text-gray-400 mb-0.5">시작일</span>
                                <WheelDatePicker
                                    value={normEventYmd(s.startDate)}
                                    onChange={v => {
                                        const patch: Partial<SubEvent> = { startDate: v };
                                        if (normEventYmd(s.endDate) < v) patch.endDate = v;
                                        updateSubEvent(idx, patch);
                                    }}
                                    placeholder="시작일"
                                    className="w-full text-xs"
                                />
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-gray-400 mb-0.5">종료일</span>
                                <WheelDatePicker
                                    value={normEventYmd(s.endDate || s.startDate)}
                                    onChange={v => {
                                        const patch: Partial<SubEvent> = { endDate: v };
                                        if (v < normEventYmd(s.startDate)) patch.startDate = v;
                                        updateSubEvent(idx, patch);
                                    }}
                                    placeholder="종료일"
                                    className="w-full text-xs"
                                />
                            </div>
                        </div>
                        {!s.allDay && (
                            <div className="grid grid-cols-2 gap-2">
                                <WheelTimePicker
                                    value={s.startTime || '09:00'}
                                    onChange={v => updateSubEvent(idx, { startTime: v })}
                                    variant="panel"
                                    placeholder="시작"
                                />
                                <WheelTimePicker
                                    value={s.endTime || '10:00'}
                                    onChange={v => updateSubEvent(idx, { endTime: v })}
                                    variant="panel"
                                    placeholder="종료"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={() => updateSubEvent(idx, { allDay: !s.allDay })}
                            className={`w-9 h-5 rounded-full transition-colors ${s.allDay ? 'bg-rose-500' : 'bg-gray-200'}`}>
                            <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${s.allDay ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                        <span className="text-xs font-bold text-gray-600">종일</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">반복</label>
                            <select value={s.repeat} onChange={e => updateSubEvent(idx, { repeat: e.target.value as RepeatType })}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50">
                                <option value="none">반복 안함</option>
                                <option value="daily">매일</option>
                                <option value="weekly">매주</option>
                                <option value="monthly">매월</option>
                                <option value="yearly">매년</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">알림</label>
                            <select value={s.alarm} onChange={e => updateSubEvent(idx, { alarm: e.target.value })}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50">
                                {['5분 전','10분 전','15분 전','30분 전','1시간 전','1일 전'].map(v => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">설명</label>
                        <textarea value={s.description} onChange={e => updateSubEvent(idx, { description: e.target.value })}
                            rows={3} maxLength={200} placeholder="메모를 입력하세요"
                            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50 resize-none" />
                        <div className="text-right text-[10px] text-gray-400">{(s.description || '').length}/200</div>
                    </div>
                </>;
            })()}

            </div>

            {/* 버튼 */}
            <div className="p-4 border-t border-gray-100 flex gap-2">
                {!isNew && (
                    <button onClick={() => event?.id && onDelete(event.id)}
                        className="px-4 py-2 text-xs font-bold text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors">
                        삭제
                    </button>
                )}
                <button onClick={onClose} className="flex-1 py-2 text-xs font-bold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">취소</button>
                <button onClick={handleSave} className="flex-1 py-2 text-xs font-bold text-white bg-rose-500 rounded-xl hover:bg-rose-600 transition-colors">저장</button>
            </div>
        </div>
    );
};

// ── 주간 캘린더 뷰 ────────────────────────────────────────────────────────
const WeekView: React.FC<{
    weekStart: Date;
    events: CalendarEvent[];
    onSelectEvent: (e: CalendarEvent) => void;
    onSlotClick: (date: string, time: string) => void;
    onAllDayClick: (date: string) => void;
    categories: Record<string, CategoryDef>;
    onWeekChange: (ws: Date) => void;
    scrollToHour?: number | null;
    onScrollHourDone?: () => void;
}> = ({ weekStart, events, onSelectEvent, onSlotClick, onAllDayClick, categories, onWeekChange, scrollToHour, onScrollHourDone }) => {
    const hours = React.useMemo(() => getCalendarHours(), []);
    const now = useCalendarNow();
    const todayYmd = toYMD(now);
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const calIsSource = React.useRef(false);
    const extSyncing = React.useRef(false);
    const userCalScroll = React.useRef(false);
    const weekStartFromScroll = React.useRef(false);
    const blockScrollWeekSyncUntil = React.useRef(0);
    const snapTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const syncClearTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [dayW, setDayW] = React.useState(100);
    const [allDayExpanded, setAllDayExpanded] = React.useState(false);

    const weekStartYmd = toYMD(weekStart);
    React.useEffect(() => {
        setAllDayExpanded(false);
    }, [weekStartYmd]);

    const { rangeStart, rangeEnd } = React.useMemo(
        () => computeCalendarScrollRange(events, weekStart),
        [events, weekStart],
    );
    const totalDays = daysBetweenDates(rangeStart, rangeEnd) + 1;
    const allDays = React.useMemo(
        () => Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i)),
        [rangeStart, totalDays],
    );
    const timelineWidth = totalDays * dayW;

    const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => {
            const w = el.clientWidth - CALENDAR_TIME_GUTTER;
            setDayW(Math.max(72, w / 7));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const allDayLayout = React.useMemo(() => layoutAllDayWeekBars(events, allDays), [events, allDays]);

    const needsAllDayCollapse = allDayLayout.maxLane > ALLDAY_COLLAPSED_MAX_LANES;
    const allDayDisplayHeight = !needsAllDayCollapse || allDayExpanded
        ? allDayLayout.rowHeight
        : allDaySectionHeightForLanes(ALLDAY_COLLAPSED_MAX_LANES);
    const hiddenAllDayCount = needsAllDayCollapse && !allDayExpanded
        ? new Set(
            allDayLayout.bars
                .filter(b => b.lane >= ALLDAY_COLLAPSED_MAX_LANES)
                .map(b => b.event.id),
        ).size
        : 0;

    // 개별 시간 일정 + 여러 날에 걸친 시간 일정(연속 바)을 같은 레인 체계로 배치한다.
    // 같은 시간대에 겹치면 바 높이를 줄여 같은 시간 칸 안에 함께 표시한다.
    const timedLayout = React.useMemo(() => {
        const hourStart = CALENDAR_PRIME_HOUR;
        const rangeStartYmd = toYMD(allDays[0]);
        const rangeEndYmd = toYMD(allDays[allDays.length - 1]);
        const STEP = TIMED_BAR_MIN_H + TIMED_BAR_GAP;
        const dur = (e: CalendarEvent) => {
            const start = parseTimeMinutes(e.startTime);
            return { start, end: Math.max(parseTimeMinutes(e.endTime), start + 30) };
        };
        const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) =>
            a.start < b.end && b.start < a.end;

        // 여러 날에 걸친 시간 일정
        const spanItems = events
            .filter(e => !isSpanningEvent(e) && isMultiDayEvent(e)
                && normEventYmd(e.startDate) <= rangeEndYmd
                && normEventYmd(e.endDate) >= rangeStartYmd)
            .map(e => {
                const s = normEventYmd(e.startDate);
                const end = normEventYmd(e.endDate);
                const visStart = s < rangeStartYmd ? rangeStartYmd : s;
                const visEnd = end > rangeEndYmd ? rangeEndYmd : end;
                return {
                    event: e,
                    startCol: daysBetweenDates(allDays[0], parseDate(visStart)),
                    endCol: daysBetweenDates(allDays[0], parseDate(visEnd)),
                    ...dur(e),
                    lane: 0,
                };
            })
            .sort((a, b) => a.start - b.start || a.startCol - b.startCol);

        // 연속 바끼리 레인 배정 (열·시간이 겹치면 다른 레인)
        const placedSpans: typeof spanItems = [];
        for (const s of spanItems) {
            const used = new Set<number>();
            for (const p of placedSpans) {
                if (s.startCol <= p.endCol && p.startCol <= s.endCol && overlap(s, p)) used.add(p.lane);
            }
            let lane = 0;
            while (used.has(lane)) lane++;
            s.lane = lane;
            placedSpans.push(s);
        }

        // 일자별 점유 레인 (연속 바가 먼저 차지) + 개별 시간 일정 레인 배정
        const perDay = allDays.map((d, di) => {
            const ymd = toYMD(d);
            const occupants: { lane: number; start: number; end: number }[] = spanItems
                .filter(s => s.startCol <= di && di <= s.endCol)
                .map(s => ({ lane: s.lane, start: s.start, end: s.end }));
            const items = events
                .filter(e => !isSpanningEvent(e) && !isMultiDayEvent(e) && e.startDate === ymd)
                .map(e => ({ event: e, ...dur(e), lane: 0 }))
                .sort((a, b) => a.start - b.start);
            for (const it of items) {
                const used = new Set<number>();
                for (const o of occupants) if (overlap(o, it)) used.add(o.lane);
                let lane = 0;
                while (used.has(lane)) lane++;
                it.lane = lane;
                occupants.push({ lane, start: it.start, end: it.end });
            }
            return { items, occupants };
        });

        // 시간별 최대 레인 수 → 시간 칸 높이
        const hourHeights = hours.map(h => {
            const hStart = h * 60;
            const hEnd = (h + 1) * 60;
            let maxRows = 1;
            perDay.forEach(({ occupants }) => {
                const n = occupants.filter(o => o.start < hEnd && o.end > hStart).length;
                maxRows = Math.max(maxRows, n);
            });
            return Math.max(HOUR_MIN_H, maxRows * STEP + 8);
        });
        const hourOffset: number[] = [0];
        for (let i = 0; i < hourHeights.length; i++) hourOffset.push(hourOffset[i] + hourHeights[i]);
        const totalH = hourOffset[hourHeights.length];

        const rowCountFor = (occList: { lane: number; start: number; end: number }[], it: { start: number; end: number }) =>
            1 + Math.max(0, ...occList.filter(o => overlap(o, it)).map(o => o.lane));

        const dayLayouts = perDay.map(({ items, occupants }) => items.map(it => {
            const baseTop = yFromMinutes(it.start, hourOffset, hourHeights, hourStart);
            const fullBottom = yFromMinutes(it.end, hourOffset, hourHeights, hourStart);
            const reduced = rowCountFor(occupants, it) > 1;
            return {
                event: it.event,
                top: baseTop + it.lane * STEP,
                height: reduced ? TIMED_BAR_MIN_H : Math.max(fullBottom - baseTop, TIMED_BAR_MIN_H),
                isSub: isCalendarSubEvent(it.event),
            };
        }));

        // 연속 바 — 레인 고정, 겹치면 높이 축소해 같은 시간 칸에 함께 표시
        const spanBars = spanItems.map(s => {
            const baseTop = yFromMinutes(s.start, hourOffset, hourHeights, hourStart);
            const fullBottom = yFromMinutes(s.end, hourOffset, hourHeights, hourStart);
            let maxLane = s.lane;
            for (let di = s.startCol; di <= s.endCol; di++) {
                for (const o of perDay[di]?.occupants ?? []) {
                    if (overlap(o, s)) maxLane = Math.max(maxLane, o.lane);
                }
            }
            return {
                event: s.event,
                startCol: s.startCol,
                span: s.endCol - s.startCol + 1,
                top: baseTop + s.lane * STEP,
                height: maxLane > 0 ? TIMED_BAR_MIN_H : Math.max(fullBottom - baseTop, TIMED_BAR_MIN_H),
                isSub: isCalendarSubEvent(s.event),
            };
        });

        return { hourHeights, hourOffset, totalH, dayLayouts, spanBars };
    }, [events, allDays, hours]);

    const todayDayIndex = React.useMemo(
        () => allDays.findIndex(d => toYMD(d) === todayYmd),
        [allDays, todayYmd],
    );
    const nowLineTop = React.useMemo(
        () => getNowLineTop(now, timedLayout.hourOffset, timedLayout.hourHeights, CALENDAR_PRIME_HOUR),
        [now, timedLayout.hourOffset, timedLayout.hourHeights],
    );

    const scrollToWeek = React.useCallback((ws: Date) => {
        const el = scrollRef.current;
        if (!el) return;
        extSyncing.current = true;
        const dayIdx = daysBetweenDates(rangeStart, startOfDay(ws));
        const viewWidth = el.clientWidth - CALENDAR_TIME_GUTTER;
        const target = Math.max(0, dayIdx * dayW + 3.5 * dayW - viewWidth / 2);
        el.scrollLeft = target;
        clearTimeout(syncClearTimer.current);
        syncClearTimer.current = setTimeout(() => { extSyncing.current = false; }, 450);
    }, [rangeStart, dayW]);

    const scrollToWeekRef = React.useRef(scrollToWeek);
    scrollToWeekRef.current = scrollToWeek;
    const rangeStartYmd = toYMD(rangeStart);
    const prevScrollKey = React.useRef('');

    React.useEffect(() => {
        if (weekStartFromScroll.current) {
            weekStartFromScroll.current = false;
            return;
        }
        userCalScroll.current = false;
        clearTimeout(snapTimer.current);
        blockScrollWeekSyncUntil.current = Date.now() + 700;
    }, [weekStartYmd]);

    React.useEffect(() => {
        blockScrollWeekSyncUntil.current = Date.now() + 700;
    }, [rangeStartYmd]);

    React.useLayoutEffect(() => {
        extSyncing.current = true;
        const scrollKey = `${weekStartYmd}|${rangeStartYmd}|${dayW}`;
        if (prevScrollKey.current === scrollKey) {
            syncClearTimer.current = setTimeout(() => { extSyncing.current = false; }, 100);
            return;
        }
        prevScrollKey.current = scrollKey;

        if (calIsSource.current) {
            calIsSource.current = false;
            syncClearTimer.current = setTimeout(() => { extSyncing.current = false; }, 100);
            return;
        }
        scrollToWeekRef.current(weekStart);
        syncClearTimer.current = setTimeout(() => { extSyncing.current = false; }, 600);
    }, [weekStartYmd, rangeStartYmd, weekStart, dayW]);

    const snap = React.useCallback(() => {
        const el = scrollRef.current;
        if (!el || extSyncing.current || !userCalScroll.current) return;
        if (Date.now() < blockScrollWeekSyncUntil.current) return;
        const viewWidth = el.clientWidth - CALENDAR_TIME_GUTTER;
        const S = el.scrollLeft;
        const rawN = (S + viewWidth / 2 - 3.5 * dayW) / dayW;
        const snapN = Math.round(rawN);
        const target = Math.max(0, snapN * dayW + 3.5 * dayW - viewWidth / 2);

        extSyncing.current = true;
        clearTimeout(syncClearTimer.current);
        el.style.scrollBehavior = 'smooth';
        el.scrollLeft = target;
        el.style.scrollBehavior = '';

        const newWeekStart = startOfDay(addDays(rangeStart, snapN));
        if (toYMD(newWeekStart) === weekStartYmd) {
            userCalScroll.current = false;
            syncClearTimer.current = setTimeout(() => { extSyncing.current = false; }, 500);
            return;
        }
        calIsSource.current = true;
        weekStartFromScroll.current = true;
        onWeekChange(newWeekStart);
        userCalScroll.current = false;
        syncClearTimer.current = setTimeout(() => { extSyncing.current = false; }, 500);
    }, [rangeStart, dayW, onWeekChange, weekStartYmd]);

    const handleScroll = React.useCallback(() => {
        const el = scrollRef.current;
        if (!el || extSyncing.current || !userCalScroll.current) return;
        if (Date.now() < blockScrollWeekSyncUntil.current) return;

        const viewWidth = el.clientWidth - CALENDAR_TIME_GUTTER;
        const S = el.scrollLeft;
        const rawN = (S + viewWidth / 2 - 3.5 * dayW) / dayW;
        const N = Math.round(rawN);
        const newWeekStart = startOfDay(addDays(rangeStart, N));
        if (toYMD(newWeekStart) !== weekStartYmd) {
            calIsSource.current = true;
            weekStartFromScroll.current = true;
            onWeekChange(newWeekStart);
        }

        clearTimeout(snapTimer.current);
        snapTimer.current = setTimeout(snap, 300);
    }, [rangeStart, dayW, onWeekChange, snap, weekStartYmd]);

    React.useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) userCalScroll.current = true;
            applyHorizontalWheelScroll(el, e);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    React.useEffect(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollTop = 0;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => {
        if (scrollToHour == null || !scrollRef.current) return;
        const idx = Math.max(0, Math.min(scrollToHour - CALENDAR_PRIME_HOUR, hours.length - 1));
        scrollRef.current.scrollTop = timedLayout.hourOffset[idx] ?? 0;
        onScrollHourDone?.();
    }, [scrollToHour, weekStart, onScrollHourDone, timedLayout.hourOffset, hours.length]);

    return (
        <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
            <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-auto"
                onScroll={handleScroll}
            >
                <div style={{ minWidth: CALENDAR_TIME_GUTTER + timelineWidth }}>
                    {/* 날짜 헤더 */}
                    <div className="sticky top-0 z-30 flex bg-white border-b border-gray-100 shadow-[0_1px_0_0_rgba(229,231,235,1)]">
                        <div className="sticky left-0 z-30 shrink-0 bg-white min-h-[40px]" style={{ width: CALENDAR_TIME_GUTTER }} />
                        <div className="flex shrink-0" style={{ width: timelineWidth }}>
                            {allDays.map((d, i) => {
                                const isToday = toYMD(d) === toYMD(new Date());
                                return (
                                    <div
                                        key={i}
                                        className={`shrink-0 text-center py-1 border-l border-gray-100 ${d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-blue-500' : 'text-gray-700'}`}
                                        style={{ width: dayW }}
                                    >
                                        <div className="text-[9px] font-bold text-gray-400 leading-none">{DAY_LABELS[d.getDay()]}</div>
                                        <div className={`text-xs font-black w-6 h-6 mx-auto flex items-center justify-center rounded-full ${isToday ? 'bg-rose-500 text-white' : ''}`}>
                                            {d.getDate()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 종일·기간 이벤트 */}
                    <div className="sticky top-[40px] z-30 flex flex-col bg-white border-b border-gray-100 shadow-[0_1px_0_0_rgba(229,231,235,1)]">
                        <div className="flex" style={{ height: allDayDisplayHeight, overflow: 'hidden' }}>
                            <div className="sticky left-0 z-30 shrink-0 bg-white text-[10px] text-gray-400 px-1 pt-1 text-right" style={{ width: CALENDAR_TIME_GUTTER }}>
                                종일
                            </div>
                            <div className="relative shrink-0 border-l border-gray-100 overflow-hidden" style={{ width: timelineWidth, height: allDayDisplayHeight }}>
                                {/* 요일 구분선 — 바 아래 */}
                                <div className="absolute inset-0 z-0 pointer-events-none flex">
                                    {allDays.map((d, i) => (
                                        <div
                                            key={`grid-${toYMD(d)}`}
                                            className={`h-full border-l border-gray-100 ${i === 0 ? 'border-l-0' : ''}`}
                                            style={{ width: dayW }}
                                        />
                                    ))}
                                </div>
                                {/* 빈 종일 슬롯 클릭 */}
                                <div className="absolute inset-0 z-[1] flex">
                                    {allDays.map((d) => (
                                        <div
                                            key={toYMD(d)}
                                            className="h-full cursor-pointer hover:bg-rose-50/30 transition-colors"
                                            style={{ width: dayW }}
                                            onClick={() => onAllDayClick(toYMD(d))}
                                        />
                                    ))}
                                </div>
                                {allDayLayout.bars.map(({ event: e, startCol, span, lane, isSub }) => {
                                    const color = eventBarColor(e, categories);
                                    const inset = isSub ? ALLDAY_SUB_INDENT : 2;
                                    return (
                                        <div
                                            key={e.id}
                                            onClick={() => onSelectEvent(e)}
                                            className={`absolute overflow-hidden text-[10px] font-bold px-2 py-1 rounded-md cursor-pointer z-10 leading-snug ${isSub ? '' : 'shadow-sm'}`}
                                            style={{
                                                left: startCol * dayW + inset,
                                                width: span * dayW - inset * 2,
                                                top: lane * (ALLDAY_BAR_MIN_H + ALLDAY_BAR_GAP) + ALLDAY_BAR_GAP,
                                                minHeight: ALLDAY_BAR_MIN_H,
                                                ...calendarBarStyle(isSub, color, e.progress ?? 0),
                                            }}
                                            title={e.title}
                                        >
                                            <CalendarChipFill color={color} isSub={isSub} progress={e.progress ?? 0} />
                                            <span className="relative z-[1] flex items-center gap-0.5 min-w-0">
                                                {isSub && <span className="shrink-0 text-[11px] opacity-45 leading-none">↳</span>}
                                                <span className="truncate">{e.title}</span>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {needsAllDayCollapse && (
                            <button
                                type="button"
                                onClick={() => setAllDayExpanded(v => !v)}
                                className="flex items-center justify-center gap-1 w-full py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50/60 border-t border-gray-100 bg-white transition-colors shrink-0"
                            >
                                {allDayExpanded ? (
                                    <>접기 <ChevronUp size={12} /></>
                                ) : (
                                    <>{hiddenAllDayCount}개 더보기 <ChevronDown size={12} /></>
                                )}
                            </button>
                        )}
                    </div>

                    {/* 시간 그리드 */}
                    <div className="flex relative overflow-visible" style={{ height: timedLayout.totalH, minHeight: 200 }}>
                        <div
                            className="sticky left-0 z-10 shrink-0 bg-white relative shadow-[1px_0_0_0_#e5e7eb]"
                            style={{ width: CALENDAR_TIME_GUTTER, height: timedLayout.totalH }}
                        >
                            {hours.map((h, i) => (
                                <div
                                    key={h}
                                    className="absolute w-full text-[10px] text-gray-400 text-right pr-2 pt-1 border-t border-gray-100"
                                    style={{ top: timedLayout.hourOffset[i], height: timedLayout.hourHeights[i] }}
                                >
                                    {pad(h)}:00
                                </div>
                            ))}
                        </div>

                        <div className="relative shrink-0 z-0 overflow-visible" style={{ width: timelineWidth, height: timedLayout.totalH }}>
                            {todayDayIndex >= 0 && nowLineTop != null && (
                                <CalendarNowLine
                                    top={nowLineTop}
                                    left={todayDayIndex * dayW}
                                    width={dayW}
                                />
                            )}
                            {allDays.map((d, di) => (
                                <div
                                    key={toYMD(d)}
                                    className="absolute top-0 border-l border-gray-100 overflow-hidden"
                                    style={{ left: di * dayW, width: dayW, height: timedLayout.totalH }}
                                >
                                    {hours.map((h, i) => (
                                        <div
                                            key={h}
                                            className="absolute inset-x-0 border-t border-gray-100 cursor-pointer hover:bg-rose-50/30 transition-colors"
                                            style={{ top: timedLayout.hourOffset[i], height: timedLayout.hourHeights[i] }}
                                            onClick={() => onSlotClick(toYMD(d), `${pad(h)}:00`)}
                                        />
                                    ))}
                                    {timedLayout.dayLayouts[di].map(({ event: e, top, height, isSub }) => {
                                        const color = eventBarColor(e, categories);
                                        const inset = isSub ? ALLDAY_SUB_INDENT : 2;
                                        const timeLabel = e.startTime && e.endTime ? `${e.startTime} - ${e.endTime}` : undefined;
                                        return (
                                            <div
                                                key={e.id}
                                                onClick={ev => { ev.stopPropagation(); onSelectEvent(e); }}
                                                className={`absolute rounded-md px-2 py-1 text-[10px] font-bold cursor-pointer z-[1] overflow-hidden leading-snug ${isSub ? '' : 'shadow-sm'}`}
                                                style={{
                                                    top: top + 1,
                                                    height: Math.max(height - 2, TIMED_BAR_MIN_H),
                                                    left: inset,
                                                    right: 2,
                                                    ...calendarBarStyle(isSub, color, e.progress ?? 0),
                                                }}
                                            >
                                                <CalendarChipFill color={color} isSub={isSub} progress={e.progress ?? 0} />
                                                <div className="relative z-[1]">
                                                    {timeLabel && (
                                                        <div className={`truncate ${isSub ? 'text-[9px] opacity-70 font-medium' : 'text-[10px] opacity-90 font-medium'}`}>
                                                            {timeLabel}
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-0.5 min-w-0">
                                                        {isSub && <span className="shrink-0 text-[11px] opacity-45 leading-none">↳</span>}
                                                        <span className="truncate">{e.title}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                            {/* 여러 날에 걸친 시간 일정 — 컬럼을 가로지르는 하나의 연속 바 */}
                            {timedLayout.spanBars.map(({ event: e, startCol, span, top, height, isSub }) => {
                                const color = eventBarColor(e, categories);
                                const inset = isSub ? ALLDAY_SUB_INDENT : 2;
                                const timeLabel = e.startTime && e.endTime ? `${e.startTime} - ${e.endTime}` : undefined;
                                return (
                                    <div
                                        key={`span-${e.id}`}
                                        onClick={ev => { ev.stopPropagation(); onSelectEvent(e); }}
                                        className={`absolute rounded-md px-2 py-1 text-[10px] font-bold cursor-pointer z-[2] overflow-hidden leading-snug ${isSub ? '' : 'shadow-sm'}`}
                                        style={{
                                            left: startCol * dayW + inset,
                                            width: span * dayW - inset * 2,
                                            top: top + 1,
                                            height: Math.max(height - 2, TIMED_BAR_MIN_H),
                                            ...calendarBarStyle(isSub, color, e.progress ?? 0),
                                        }}
                                        title={e.title}
                                    >
                                        <CalendarChipFill color={color} isSub={isSub} progress={e.progress ?? 0} />
                                        <div className="relative z-[1]">
                                            {timeLabel && (
                                                <div className={`truncate ${isSub ? 'text-[9px] opacity-70 font-medium' : 'text-[10px] opacity-90 font-medium'}`}>
                                                    {timeLabel}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-0.5 min-w-0">
                                                {isSub && <span className="shrink-0 text-[11px] opacity-45 leading-none">↳</span>}
                                                <span className="truncate">{e.title}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── 월간 캘린더 뷰 ────────────────────────────────────────────────────────
const MonthView: React.FC<{
    month: Date;
    events: CalendarEvent[];
    onSelectEvent: (e: CalendarEvent) => void;
    onDayClick: (date: string) => void;
    categories: Record<string, CategoryDef>;
    onNavigate: (dir: 'prev' | 'next') => void;
}> = ({ month, events, onSelectEvent, onDayClick, categories, onNavigate }) => {
    const year = month.getFullYear(); const m = month.getMonth();
    const firstDay = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, m, i + 1))];
    while (cells.length % 7 !== 0) cells.push(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const accRef       = React.useRef(0);
    const lastNavRef   = React.useRef(0);
    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const THRESHOLD = 50;
        const COOLDOWN  = 600;
        const onWheel = (e: WheelEvent) => {
            const delta = e.ctrlKey
                ? (e.deltaY !== 0 ? e.deltaY : e.deltaX)
                : (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0);
            if (delta === 0) return;
            e.preventDefault();
            const now = Date.now();
            if (now - lastNavRef.current < COOLDOWN) { accRef.current = 0; return; }
            accRef.current += delta;
            if (Math.abs(accRef.current) >= THRESHOLD) {
                onNavigate(accRef.current > 0 ? 'next' : 'prev');
                accRef.current = 0;
                lastNavRef.current = now;
            }
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => { el.removeEventListener('wheel', onWheel); };
    }, [onNavigate]);

    return (
        <div ref={containerRef} className="h-full overflow-auto">
            <div className="grid grid-cols-7 border-b border-gray-100">
                {['일','월','화','수','목','금','토'].map((d, i) => (
                    <div key={d} className={`text-center py-2 text-xs font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7" style={{ gridAutoRows: '120px' }}>
                {cells.map((d, i) => {
                    if (!d) return <div key={`empty-${i}`} className="border-r border-b border-gray-100 bg-gray-50/50" />;
                    const ymd = toYMD(d);
                    const dayEvents = events
                        .filter(e => isSpanningEvent(e) ? eventActiveOnYmd(e, ymd) : e.startDate === ymd)
                        .sort(sortCalendarEventsForDay);
                    const isToday = ymd === toYMD(new Date());
                    return (
                        <div key={ymd} onClick={() => onDayClick(ymd)}
                            className="border-r border-b border-gray-100 p-1 cursor-pointer hover:bg-rose-50/20 transition-colors overflow-hidden">
                            <div className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full mb-1
                                ${isToday ? 'bg-rose-500 text-white' : i % 7 === 0 ? 'text-red-500' : i % 7 === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                                {d.getDate()}
                            </div>
                            <div className="space-y-0.5">
                                {dayEvents.slice(0, 3).map(e => {
                                    const isSub = isCalendarSubEvent(e);
                                    const color = eventBarColor(e, categories);
                                    return (
                                    <div key={`${e.id}-${ymd}`} onClick={ev => { ev.stopPropagation(); onSelectEvent(e); }}
                                        className={`relative overflow-hidden text-[10px] font-bold px-1.5 py-0.5 rounded-md truncate cursor-pointer mb-0.5
                                            ${isSub ? 'ml-2' : ''}`}
                                        style={calendarBarStyle(isSub, color, e.progress ?? 0)}>
                                        <CalendarChipFill color={color} isSub={isSub} progress={e.progress ?? 0} />
                                        <span className="relative z-[1] flex items-center gap-0.5 min-w-0">
                                            {isSub && <span className="shrink-0 opacity-45">↳</span>}
                                            <span className="truncate">
                                                {e.startTime && !e.allDay ? `${e.startTime} ` : ''}{e.title}
                                            </span>
                                        </span>
                                    </div>
                                    );
                                })}
                                {dayEvents.length > 3 && <div className="text-[10px] text-gray-400 font-bold pl-1">+{dayEvents.length - 3}개 더</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── 일간 캘린더 뷰 ────────────────────────────────────────────────────────
const DayView: React.FC<{
    date: Date;
    events: CalendarEvent[];
    onSelectEvent: (e: CalendarEvent) => void;
    onSlotClick: (date: string, time: string) => void;
    categories: Record<string, CategoryDef>;
    onNavigate: (dir: 'prev' | 'next') => void;
}> = ({ date, events, onSelectEvent, onSlotClick, categories, onNavigate }) => {
    const hours = React.useMemo(() => getCalendarHours(), []);
    const now = useCalendarNow();
    const ymd = toYMD(date);
    const isToday = ymd === toYMD(now);
    const [allDayExpanded, setAllDayExpanded] = React.useState(false);
    React.useEffect(() => { setAllDayExpanded(false); }, [ymd]);
    const timedEvents = events.filter(e => e.startDate === ymd && !isSpanningEvent(e));
    const allDayEvents = events
        .filter(e => isSpanningEvent(e) && eventActiveOnYmd(e, ymd))
        .sort(sortCalendarEventsForDay);
    const needsAllDayCollapse = allDayEvents.length > ALLDAY_DAY_COLLAPSED_COUNT;
    const visibleAllDayEvents = !needsAllDayCollapse || allDayExpanded
        ? allDayEvents
        : allDayEvents.slice(0, ALLDAY_DAY_COLLAPSED_COUNT);
    const hiddenAllDayCount = needsAllDayCollapse && !allDayExpanded
        ? allDayEvents.length - ALLDAY_DAY_COLLAPSED_COUNT
        : 0;
    const containerRef = React.useRef<HTMLDivElement>(null);
    const accRef       = React.useRef(0);
    const lastNavRef   = React.useRef(0);
    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const THRESHOLD = 50;
        const COOLDOWN  = 600;
        const onWheel = (e: WheelEvent) => {
            const delta = e.ctrlKey
                ? (e.deltaY !== 0 ? e.deltaY : e.deltaX)
                : (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0);
            if (delta === 0) return;
            e.preventDefault();
            const now = Date.now();
            if (now - lastNavRef.current < COOLDOWN) { accRef.current = 0; return; }
            accRef.current += delta;
            if (Math.abs(accRef.current) >= THRESHOLD) {
                onNavigate(accRef.current > 0 ? 'next' : 'prev');
                accRef.current = 0;
                lastNavRef.current = now;
            }
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => { el.removeEventListener('wheel', onWheel); };
    }, [onNavigate]);

    const timedLayout = React.useMemo(() => {
        const hourHeights = hours.map(h => {
            const maxRows = maxOverlapRowsAtHour(timedEvents, h);
            return Math.max(HOUR_MIN_H, maxRows * (TIMED_BAR_MIN_H + TIMED_BAR_GAP) + 8);
        });
        const hourOffset: number[] = [0];
        for (let i = 0; i < hourHeights.length; i++) {
            hourOffset.push(hourOffset[i] + hourHeights[i]);
        }
        return {
            hourHeights,
            hourOffset,
            totalH: hourOffset[hourHeights.length],
            bars: layoutDayTimedEvents(timedEvents, hourOffset, hourHeights, CALENDAR_PRIME_HOUR),
        };
    }, [timedEvents, hours]);

    const nowLineTop = React.useMemo(
        () => (isToday ? getNowLineTop(now, timedLayout.hourOffset, timedLayout.hourHeights, CALENDAR_PRIME_HOUR) : null),
        [isToday, now, timedLayout.hourOffset, timedLayout.hourHeights],
    );

    return (
        <div ref={containerRef} className="h-full min-h-0 overflow-y-auto">
            {allDayEvents.length > 0 && (
                <div className="border-b border-gray-100 px-2 py-1.5 shrink-0">
                    <div className="text-[10px] font-bold text-gray-400 px-1 mb-1">종일</div>
                    <div className="space-y-1">
                        {visibleAllDayEvents.map(e => {
                            const isSub = isCalendarSubEvent(e);
                            const color = eventBarColor(e, categories);
                            return (
                                <div key={`${e.id}-${ymd}`} onClick={() => onSelectEvent(e)}
                                    className={`relative overflow-hidden text-[10px] font-bold px-2 py-1 rounded-md cursor-pointer leading-snug
                                        ${isSub ? 'ml-2' : 'shadow-sm'}`}
                                    style={calendarBarStyle(isSub, color, e.progress ?? 0)}>
                                    <CalendarChipFill color={color} isSub={isSub} progress={e.progress ?? 0} />
                                    <span className="relative z-[1] flex items-center gap-0.5 min-w-0">
                                        {isSub && <span className="shrink-0 text-[11px] opacity-45">↳</span>}
                                        <span className="truncate">{e.title}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {needsAllDayCollapse && (
                        <button
                            type="button"
                            onClick={() => setAllDayExpanded(v => !v)}
                            className="flex items-center justify-center gap-1 w-full mt-1 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50/60 rounded-lg transition-colors"
                        >
                            {allDayExpanded ? (
                                <>접기 <ChevronUp size={12} /></>
                            ) : (
                                <>{hiddenAllDayCount}개 더보기 <ChevronDown size={12} /></>
                            )}
                        </button>
                    )}
                </div>
            )}
            <div className="flex overflow-visible" style={{ height: timedLayout.totalH, minHeight: '100%' }}>
                <div className="w-16 shrink-0 relative">
                    {hours.map((h, i) => (
                        <div
                            key={h}
                            className="absolute w-full text-[11px] text-gray-400 text-right pr-3 pt-1 border-t border-gray-100"
                            style={{ top: timedLayout.hourOffset[i], height: timedLayout.hourHeights[i] }}
                        >
                            {pad(h)}:00
                        </div>
                    ))}
                </div>
                <div className="flex-1 relative border-l border-gray-100 overflow-visible">
                    {nowLineTop != null && (
                        <CalendarNowLine top={nowLineTop} />
                    )}
                    {hours.map((h, i) => (
                        <div
                            key={h}
                            className="absolute inset-x-0 border-t border-gray-100 cursor-pointer hover:bg-rose-50/30 transition-colors"
                            style={{ top: timedLayout.hourOffset[i], height: timedLayout.hourHeights[i] }}
                            onClick={() => onSlotClick(ymd, `${pad(h)}:00`)}
                        />
                    ))}
                    {timedLayout.bars.map(({ event: e, top, height, isSub }) => {
                        const color = eventBarColor(e, categories);
                        const inset = isSub ? ALLDAY_SUB_INDENT : 2;
                        const timeLabel = e.startTime && e.endTime ? `${e.startTime} ~ ${e.endTime}` : undefined;
                        return (
                            <div
                                key={e.id}
                                onClick={ev => { ev.stopPropagation(); onSelectEvent(e); }}
                                className={`absolute rounded-md px-2 py-1 cursor-pointer z-10 overflow-hidden leading-snug text-[10px] font-bold
                                    ${isSub ? '' : 'shadow-sm'}`}
                                style={{
                                    top: top + 1,
                                    height: Math.max(height - 2, TIMED_BAR_MIN_H),
                                    left: inset,
                                    right: 2,
                                    ...calendarBarStyle(isSub, color, e.progress ?? 0),
                                }}
                            >
                                <CalendarChipFill color={color} isSub={isSub} progress={e.progress ?? 0} />
                                <div className="relative z-[1]">
                                    {timeLabel && (
                                        <div className={`truncate ${isSub ? 'text-[9px] opacity-70 font-medium' : 'text-[10px] opacity-90 font-medium'}`}>
                                            {timeLabel}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-0.5 min-w-0">
                                        {isSub && <span className="shrink-0 text-[11px] opacity-45">↳</span>}
                                        <span className="truncate">{e.title}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ── 간트 테이블 인라인 편집 ───────────────────────────────────────────────
type GanttEditField = 'title' | 'assignee' | 'startDate' | 'endDate' | 'progress';

const toPickerDate = (s: string) => s.replace(/\./g, '-');

const GanttInlineTextCell: React.FC<{
    value: string;
    isEditing: boolean;
    onStartEdit: () => void;
    onSave: (v: string) => void;
    onCancel: () => void;
    className?: string;
    inputClassName?: string;
    placeholder?: string;
}> = ({ value, isEditing, onStartEdit, onSave, onCancel, className = '', inputClassName = '', placeholder = '—' }) => {
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setDraft(value); }, [value]);
    useEffect(() => { if (isEditing) inputRef.current?.focus(); }, [isEditing]);

    const commit = () => {
        const trimmed = draft.trim();
        if (trimmed) onSave(trimmed);
        else { setDraft(value); onCancel(); }
    };

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setDraft(value); onCancel(); }
                }}
                onClick={e => e.stopPropagation()}
                className={`w-full bg-white border border-rose-300 rounded px-1 py-0.5 text-xs outline-none focus:border-rose-400 ${inputClassName}`}
            />
        );
    }

    return (
        <span
            onDoubleClick={e => { e.stopPropagation(); onStartEdit(); }}
            className={`cursor-text hover:text-rose-500 transition-colors ${className}`}
            title="더블클릭하여 편집"
        >
            {value || <span className="text-gray-300">{placeholder}</span>}
        </span>
    );
};

const GanttInlineDateCell: React.FC<{
    value: string;
    isEditing: boolean;
    onStartEdit: () => void;
    onSave: (v: string) => void;
    onCancel: () => void;
}> = ({ value, isEditing, onStartEdit, onSave, onCancel }) => {
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isEditing) return;
        const t = setTimeout(() => wrapRef.current?.querySelector('button')?.click(), 0);
        return () => clearTimeout(t);
    }, [isEditing]);

    useEffect(() => {
        if (!isEditing) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (wrapRef.current?.contains(t)) return;
            if (t instanceof Element && t.closest('[data-wheel-date-picker-popup]')) return;
            onCancel();
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [isEditing, onCancel]);

    if (isEditing) {
        return (
            <div ref={wrapRef} className="relative z-20" onClick={e => e.stopPropagation()}>
                <WheelDatePicker
                    value={toPickerDate(value)}
                    onChange={v => { if (v) onSave(v); else onCancel(); }}
                    variant="ghost"
                    className="w-full text-[11px]"
                    placeholder="날짜 선택"
                />
            </div>
        );
    }

    return (
        <span
            onDoubleClick={e => { e.stopPropagation(); onStartEdit(); }}
            className="cursor-text whitespace-nowrap hover:text-rose-500 transition-colors"
            title="더블클릭하여 편집"
        >
            {value || '—'}
        </span>
    );
};

const GanttInlineProgressCell: React.FC<{
    value: number;
    color?: string;
    isEditing: boolean;
    onStartEdit: () => void;
    onSave: (v: number) => void;
    onCancel: () => void;
}> = ({ value, color, isEditing, onStartEdit, onSave, onCancel }) => {
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isEditing) return;
        const t = setTimeout(() => wrapRef.current?.querySelector('button')?.click(), 0);
        return () => clearTimeout(t);
    }, [isEditing]);

    useEffect(() => {
        if (!isEditing) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (wrapRef.current?.contains(t)) return;
            if (t instanceof Element && t.closest('[data-wheel-progress-picker-popup]')) return;
            onCancel();
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [isEditing, onCancel]);

    if (isEditing) {
        return (
            <div ref={wrapRef} className="relative z-20" onClick={e => e.stopPropagation()}>
                <WheelProgressPicker
                    value={value}
                    onChange={onSave}
                    variant="ghost"
                    accentColor={color || '#6366f1'}
                    className="w-full text-[11px]"
                />
            </div>
        );
    }

    return (
        <span
            onDoubleClick={e => { e.stopPropagation(); onStartEdit(); }}
            className="cursor-text font-black hover:opacity-70 transition-opacity"
            style={{ color: color || '#6366f1' }}
            title="더블클릭하여 편집"
        >
            {value}%
        </span>
    );
};

// ── 간트 차트 ─────────────────────────────────────────────────────────────
const GanttView: React.FC<{
    tasks: GanttTask[];
    onAddTask: () => void;
    onUpdateTask?: (id: string, patch: Partial<GanttTask>) => void;
    onDeleteTask?: (id: string) => void;
    onTaskClick?: (taskId: string, occYmd?: string) => void;
    weekStart: Date;
}> = ({ tasks, onAddTask, onUpdateTask, onDeleteTask, onTaskClick, weekStart }) => {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [editCell, setEditCell] = useState<{ id: string; field: GanttEditField } | null>(null);
    const leftRef        = React.useRef<HTMLDivElement>(null);
    const rightRef       = React.useRef<HTMLDivElement>(null);
    const syncingV       = React.useRef(false);  // 세로 스크롤 루프 방지
    const calSyncing     = React.useRef(false);  // 캘린더→간트 sync 중 스크롤 무시
    const syncClearTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // 작업 범위 + 최소 표시 기간 (과거 180일 · 미래 365일, 여유 30일)
    const { chartStart, chartEnd } = React.useMemo(
        () => computeGanttChartRange(tasks, weekStart),
        [tasks, weekStart],
    );
    const totalDays  = daysBetweenDates(chartStart, chartEnd) + 1;
    const DAY_W = 36;
    const GANTT_ROW_H = 33;
    const weekStartDay = startOfDay(weekStart);
    const weekHighlightLeft = daysBetweenDates(chartStart, weekStartDay) * DAY_W;
    const todayLineLeft = daysBetweenDates(chartStart, startOfDay(new Date())) * DAY_W + DAY_W / 2;

    const flatTasks = tasks.filter(t => !t.parentId || !collapsed.has(t.parentId));

    const daysBetween = daysBetweenDates;
    const normDate = (s: string) => s.replace(/\./g, '-');
    const getLeft  = (date: string) => Math.max(0, daysBetween(chartStart, parseDate(normDate(date)))) * DAY_W;
    const getWidth = (s: string, e: string) => Math.max(DAY_W, (daysBetween(parseDate(normDate(s)), parseDate(normDate(e))) + 1) * DAY_W);

    const GANTT_CONNECTOR_GAP = 8;

    /** 부모 바 왼쪽 간격 → 하위 바 왼쪽 (가로+세로 L자) */
    const hierarchyLines = React.useMemo(() => {
        const rowById = new Map(flatTasks.map((t, i) => [t.id, i]));
        const lines: string[] = [];
        const rowCenterY = (idx: number) => idx * GANTT_ROW_H + GANTT_ROW_H / 2;

        for (const child of flatTasks) {
            if (!child.parentId) continue;
            const cIdx = rowById.get(child.id);
            if (cIdx === undefined) continue;

            const parent = flatTasks.find(t => t.id === child.parentId);
            if (!parent) continue;
            const pIdx = rowById.get(parent.id);
            if (pIdx === undefined || cIdx <= pIdx) continue;

            const pLeft = getLeft(parent.startDate);
            const trunkX = Math.max(0, pLeft - GANTT_CONNECTOR_GAP);
            const pY = rowCenterY(pIdx);
            const cLeft = getLeft(child.startDate);
            const cY = rowCenterY(cIdx);
            const arrowTip = Math.max(0, cLeft - 4);

            // 간격(trunkX) → 부모 왼쪽 → 간격으로 복귀 → 세로 → 하위 왼쪽
            lines.push(`M ${trunkX} ${pY} L ${pLeft} ${pY} L ${trunkX} ${pY} L ${trunkX} ${cY} L ${arrowTip} ${cY}`);
        }
        return lines;
    }, [flatTasks, chartStart]); // eslint-disable-line react-hooks/exhaustive-deps

    const dateHeaders: Date[] = [];
    for (let i = 0; i < totalDays; i++) dateHeaders.push(addDays(chartStart, i));

    // ── 휠 → 가로 스크롤 변환 (passive:false 필요) ───────────
    React.useEffect(() => {
        const el = rightRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            applyHorizontalWheelScroll(el, e);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    // ── 캘린더 → 간트 스크롤 동기화 ───────────────────────────
    const scrollToWeek = React.useCallback((ws: Date) => {
        const el = rightRef.current;
        if (!el) return;
        calSyncing.current = true;
        const weekPos = daysBetween(chartStart, startOfDay(ws)) * DAY_W;
        const viewWidth = el.clientWidth;
        const target = Math.max(0, weekPos - viewWidth / 2 + (7 * DAY_W) / 2);
        el.scrollLeft = target;
        clearTimeout(syncClearTimer.current);
        syncClearTimer.current = setTimeout(() => { calSyncing.current = false; }, 450);
    }, [chartStart]);

    const scrollToWeekRef = React.useRef(scrollToWeek);
    scrollToWeekRef.current = scrollToWeek;
    const weekStartYmd = toYMD(weekStart);
    const chartStartYmd = toYMD(chartStart);
    const prevGanttScrollKey = React.useRef('');
    const snapTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    React.useLayoutEffect(() => {
        calSyncing.current = true;
        clearTimeout(snapTimer.current);
        const scrollKey = `${weekStartYmd}|${chartStartYmd}`;
        if (prevGanttScrollKey.current === scrollKey) {
            syncClearTimer.current = setTimeout(() => { calSyncing.current = false; }, 100);
            return;
        }
        prevGanttScrollKey.current = scrollKey;
        scrollToWeekRef.current(weekStart);
        syncClearTimer.current = setTimeout(() => { calSyncing.current = false; }, 600);
    }, [weekStartYmd, chartStartYmd, weekStart]);

    // ── 스크롤 멈춤 후 스냅 (간트 뷰포트만, weekStart는 변경하지 않음) ──
    const snap = React.useCallback(() => {
        if (!rightRef.current || calSyncing.current) return;
        const viewWidth = rightRef.current.clientWidth;
        const S = rightRef.current.scrollLeft;
        const rawN = (S + viewWidth / 2 - 3.5 * DAY_W) / DAY_W;
        const snapN = Math.round(rawN);
        const target = Math.max(0, snapN * DAY_W + 3.5 * DAY_W - viewWidth / 2);

        calSyncing.current = true;
        clearTimeout(syncClearTimer.current);
        rightRef.current.style.scrollBehavior = 'smooth';
        rightRef.current.scrollLeft = target;
        rightRef.current.style.scrollBehavior = '';
        syncClearTimer.current = setTimeout(() => { calSyncing.current = false; }, 500);
    }, []);

    // ── 간트 가로 스크롤: weekStart 역동기화 없음 (DOM 리셋 시 5월로 튀는 버그 방지) ──
    const handleTimelineScroll = React.useCallback(() => {
        if (calSyncing.current) return;
        clearTimeout(snapTimer.current);
        snapTimer.current = setTimeout(snap, 300);
    }, [snap]);

    // ── 세로 스크롤 동기화 ────────────────────────────────────
    const handleLeftScroll = React.useCallback(() => {
        if (syncingV.current || !rightRef.current || !leftRef.current) return;
        syncingV.current = true;
        rightRef.current.scrollTop = leftRef.current.scrollTop;
        syncingV.current = false;
    }, []);

    const handleRightScroll = React.useCallback(() => {
        if (!rightRef.current) return;
        if (!syncingV.current && leftRef.current) {
            syncingV.current = true;
            leftRef.current.scrollTop = rightRef.current.scrollTop;
            syncingV.current = false;
        }
        handleTimelineScroll();
    }, [handleTimelineScroll]);

    const isEditing = (id: string, field: GanttEditField) =>
        editCell?.id === id && editCell.field === field;

    const startEdit = (id: string, field: GanttEditField) => setEditCell({ id, field });
    const cancelEdit = () => setEditCell(null);

    const saveField = (id: string, patch: Partial<GanttTask>) => {
        onUpdateTask?.(id, patch);
        setEditCell(null);
    };

    const deleteTask = (id: string) => {
        onDeleteTask?.(id);
        if (editCell?.id === id) setEditCell(null);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
                <span className="text-xs font-black text-gray-700">간트 차트</span>
                <button onClick={onAddTask}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-600 transition-colors">
                    <Plus size={12} /> 작업 추가
                </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* 좌측 작업 목록 */}
                <div ref={leftRef} onScroll={handleLeftScroll}
                    className="w-[512px] shrink-0 border-r border-gray-200 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                        <colgroup>
                            <col style={{ width: '180px' }} />
                            <col style={{ width: '64px' }} />
                            <col style={{ width: '92px' }} />
                            <col style={{ width: '92px' }} />
                            <col style={{ width: '52px' }} />
                            <col style={{ width: '32px' }} />
                        </colgroup>
                        <thead className="sticky top-0 z-20 bg-gray-50">
                            <tr className="border-b border-gray-200 text-[11px] font-black text-gray-500" style={{ height: GANTT_ROW_H }}>
                                <th className="px-3 text-left font-black align-middle">작업 이름</th>
                                <th className="px-2 text-center font-black align-middle">담당자</th>
                                <th className="px-2 text-center font-black align-middle">시작일</th>
                                <th className="px-2 text-center font-black align-middle">종료일</th>
                                <th className="px-2 text-center font-black align-middle">진행률</th>
                                <th className="px-1 text-center font-black align-middle" aria-label="삭제" />
                            </tr>
                        </thead>
                        <tbody>
                            {flatTasks.map(task => {
                                const isParent = tasks.some(t => t.parentId === task.id);
                                const isCollapsed = collapsed.has(task.id);
                                return (
                                    <tr key={task.id} className="group border-b border-gray-100 hover:bg-gray-50 transition-colors" style={{ height: GANTT_ROW_H }}>
                                        <td className="align-middle" style={{ paddingLeft: task.parentId ? 24 : 10, height: GANTT_ROW_H }}>
                                            <div className="flex items-center gap-1.5 min-h-0">
                                                {isParent ? (
                                                    <button onClick={() => setCollapsed(prev => {
                                                        const n = new Set(prev); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n;
                                                    })} className="shrink-0 text-gray-400 hover:text-gray-700">
                                                        {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                                                    </button>
                                                ) : (
                                                    <span className="w-[11px] shrink-0" />
                                                )}
                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.color || '#6366f1' }} />
                                                <GanttInlineTextCell
                                                    value={task.title}
                                                    isEditing={isEditing(task.id, 'title')}
                                                    onStartEdit={() => startEdit(task.id, 'title')}
                                                    onSave={v => saveField(task.id, { title: v })}
                                                    onCancel={cancelEdit}
                                                    className={`truncate text-gray-800 ${isParent ? 'font-bold' : 'font-medium'}`}
                                                    inputClassName="font-medium"
                                                />
                                                {task.repeat && task.repeat !== 'none' && (
                                                    <span className="shrink-0 px-1 py-px rounded text-[9px] font-bold bg-violet-100 text-violet-700 border border-violet-200 leading-tight">
                                                        [{REPEAT_LABELS[task.repeat]}]
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 text-center text-gray-600 truncate align-middle">
                                            <GanttInlineTextCell
                                                value={task.assignee}
                                                isEditing={isEditing(task.id, 'assignee')}
                                                onStartEdit={() => startEdit(task.id, 'assignee')}
                                                onSave={v => saveField(task.id, { assignee: v })}
                                                onCancel={cancelEdit}
                                                className="truncate text-gray-600"
                                            />
                                        </td>
                                        <td className="px-2 text-center text-gray-500 align-middle">
                                            <GanttInlineDateCell
                                                value={task.startDate}
                                                isEditing={isEditing(task.id, 'startDate')}
                                                onStartEdit={() => startEdit(task.id, 'startDate')}
                                                onSave={v => saveField(task.id, { startDate: v })}
                                                onCancel={cancelEdit}
                                            />
                                        </td>
                                        <td className="px-2 text-center text-gray-500 align-middle">
                                            <GanttInlineDateCell
                                                value={task.endDate}
                                                isEditing={isEditing(task.id, 'endDate')}
                                                onStartEdit={() => startEdit(task.id, 'endDate')}
                                                onSave={v => saveField(task.id, { endDate: v })}
                                                onCancel={cancelEdit}
                                            />
                                        </td>
                                        <td className="px-2 text-center align-middle">
                                            <GanttInlineProgressCell
                                                value={task.progress}
                                                color={task.color || '#6366f1'}
                                                isEditing={isEditing(task.id, 'progress')}
                                                onStartEdit={() => startEdit(task.id, 'progress')}
                                                onSave={v => saveField(task.id, { progress: v })}
                                                onCancel={cancelEdit}
                                            />
                                        </td>
                                        <td className="px-1 text-center align-middle">
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
                                                className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                title="작업 삭제"
                                                aria-label="작업 삭제"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* 우측 타임라인 */}
                <div className="flex-1 overflow-hidden relative">
                <div ref={rightRef} onScroll={handleRightScroll}
                    className="h-full overflow-auto">
                    <div style={{ width: totalDays * DAY_W, minWidth: '100%', position: 'relative' }}>
                        {/* 오늘 표시 — 파란 세로 실선 */}
                        <div
                            className="absolute top-0 bottom-0 pointer-events-none z-[25]"
                            style={{ left: todayLineLeft, transform: 'translateX(-50%)' }}
                            aria-hidden
                        >
                            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-500" />
                            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-blue-500" />
                        </div>
                        {/* 현재 주 하이라이트 — weekStart 기준 (캘린더와 동일) */}
                        <div
                            className="absolute top-0 bottom-0 pointer-events-none z-[5]"
                            style={{
                                left: weekHighlightLeft,
                                width: 7 * DAY_W,
                                backgroundColor: 'rgba(251,113,133,0.10)',
                                borderLeft: '1px solid rgba(251,113,133,0.3)',
                                borderRight: '1px solid rgba(251,113,133,0.3)',
                            }}
                        />
                        {/* 날짜 헤더 */}
                        <div className="flex border-b border-gray-200 sticky top-0 bg-white z-20 shadow-[0_1px_0_0_rgba(229,231,235,1)]" style={{ height: GANTT_ROW_H }}>
                            {dateHeaders.map((d, i) => {
                                const ymd = toYMD(d);
                                const isToday = ymd === toYMD(new Date());
                                const isWeekStart = d.getDay() === 0;
                                return (
                                    <div key={i} className={`flex flex-col items-center justify-center text-[9px] font-bold border-l border-gray-100 shrink-0 select-none
                                        ${isToday ? 'bg-rose-50 text-rose-500' : d.getDay() === 0 ? 'text-red-400 bg-red-50/30' : d.getDay() === 6 ? 'text-blue-400 bg-blue-50/30' : 'text-gray-400'}`}
                                        style={{ width: DAY_W, height: GANTT_ROW_H }}>
                                        {isWeekStart ? <span className="block text-[8px] leading-none">{d.getMonth()+1}/{d.getDate()}</span> : d.getDate()}
                                    </div>
                                );
                            })}
                        </div>
                        {/* 바 + 하위 일정 연결선 */}
                        <div className="relative z-0" style={{ height: flatTasks.length * GANTT_ROW_H }}>
                            {hierarchyLines.length > 0 && (
                                <svg
                                    className="absolute inset-0 pointer-events-none z-[1]"
                                    width={totalDays * DAY_W}
                                    height={flatTasks.length * GANTT_ROW_H}
                                    aria-hidden
                                >
                                    {hierarchyLines.map((d, i) => (
                                        <path
                                            key={i}
                                            d={d}
                                            fill="none"
                                            stroke="#94a3b8"
                                            strokeWidth={1.25}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    ))}
                                </svg>
                            )}
                        {flatTasks.map(task => {
                            const bars = task.occurrences?.length
                                ? task.occurrences
                                : [{ occYmd: normEventYmd(task.startDate), startDate: task.startDate, endDate: task.endDate, progress: task.progress }];
                            const todayYmd = toYMD(new Date());
                            const highlightYmd = task.currentOccYmd ?? todayYmd;
                            return (
                            <div key={task.id} className="relative border-b border-gray-100 hover:bg-gray-50/50"
                                style={{ height: GANTT_ROW_H }}>
                                {task.parentId && bars[0] && (
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-[1]"
                                        style={{
                                            left: getLeft(bars[0].startDate) - 5,
                                            width: 0,
                                            height: 0,
                                            borderTop: '3px solid transparent',
                                            borderBottom: '3px solid transparent',
                                            borderLeft: '4px solid #94a3b8',
                                        }}
                                    />
                                )}
                                {bars.map(bar => {
                                    const barColor = task.color || '#6366f1';
                                    const barTextColor = ganttBarTextColor(barColor, bar.progress);
                                    const isTodayBar = bar.occYmd === highlightYmd;
                                    return (
                                <div
                                    key={bar.occYmd}
                                    className={`absolute top-1/2 -translate-y-1/2 rounded-md flex items-center overflow-hidden cursor-pointer z-[2] hover:brightness-95 transition-all ${isTodayBar ? 'ring-1 ring-rose-400 ring-offset-1' : ''}`}
                                    style={{
                                        left: getLeft(bar.startDate),
                                        width: getWidth(bar.startDate, bar.endDate),
                                        height: 20,
                                        backgroundColor: barColor + (isTodayBar ? '45' : '30'),
                                        border: `1px solid ${barColor}${isTodayBar ? 'aa' : '60'}`,
                                    }}
                                    onClick={() => onTaskClick?.(task.id, bar.occYmd)}
                                    title={`${task.title}${isTodayBar ? ' (현재 주기)' : ''}`}
                                >
                                    <div className="h-full rounded-l-md transition-all"
                                        style={{ width: `${bar.progress}%`, backgroundColor: barColor }} />
                                    <span className="absolute left-1 text-[9px] font-black truncate"
                                        style={{ maxWidth: getWidth(bar.startDate, bar.endDate) - 8, color: barTextColor }}>
                                        {bar.progress}%
                                    </span>
                                </div>
                                    );
                                })}
                            </div>
                            );
                        })}
                        </div>
                    </div>
                </div>
                </div>{/* 우측 타임라인 래퍼 끝 */}
            </div>
        </div>
    );
};

// ── 할 일 목록 ────────────────────────────────────────────────────────────
const TodoView: React.FC<{
    todos: TodoItem[];
    onToggle: (id: string) => void;
    onAdd: (item: Omit<TodoItem, 'id'>) => void;
    onDelete: (id: string) => void;
    categories: Record<string, CategoryDef>;
}> = ({ todos, onToggle, onAdd, onDelete, categories }) => {
    const [newTitle, setNewTitle] = useState('');
    const [newCategory, setNewCategory] = useState<CategoryKey>(Object.keys(categories)[0] || 'work');
    const [newDue, setNewDue] = useState('');

    const handleAdd = () => {
        if (!newTitle.trim()) return;
        onAdd({ title: newTitle.trim(), done: false, category: newCategory, dueDate: newDue || undefined });
        setNewTitle(''); setNewDue('');
    };

    const pending = todos.filter(t => !t.done);
    const done    = todos.filter(t => t.done);

    return (
        <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* 추가 폼 */}
            <div className="flex gap-2 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="할 일 입력..."
                    className="flex-1 bg-transparent text-sm outline-none text-gray-700" />
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                    className="text-xs border border-gray-200 rounded-xl px-2 py-1 bg-white outline-none">
                    {Object.entries(categories).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                    ))}
                </select>
                <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
                    className="text-xs border border-gray-200 rounded-xl px-2 py-1 bg-white outline-none" />
                <button onClick={handleAdd} className="p-2 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-colors"><Plus size={14} /></button>
            </div>

            {/* 미완료 */}
            <div>
                <div className="text-xs font-black text-gray-500 mb-2">할 일 ({pending.length})</div>
                <div className="space-y-1.5">
                    {pending.map(t => {
                        const cat = categories[t.category];
                        return (
                        <div key={t.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-2xl hover:border-gray-200 transition-colors group">
                            <button onClick={() => onToggle(t.id)} className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-rose-400 transition-colors shrink-0 flex items-center justify-center" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-gray-800 truncate">{t.title}</div>
                                {t.dueDate && <div className="text-[10px] text-gray-400">{t.dueDate}</div>}
                            </div>
                            {cat && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={getCatStyle(cat.color)}>{cat.label}</span>}
                            <button onClick={() => onDelete(t.id)} className="p-1 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={12} /></button>
                        </div>
                        );
                    })}
                </div>
            </div>

            {/* 완료 */}
            {done.length > 0 && (
                <div>
                    <div className="text-xs font-black text-gray-400 mb-2">완료됨 ({done.length})</div>
                    <div className="space-y-1.5">
                        {done.map(t => (
                            <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-2xl group">
                                <button onClick={() => onToggle(t.id)}
                                    className="w-5 h-5 rounded-full border-2 border-emerald-400 bg-emerald-400 shrink-0 flex items-center justify-center">
                                    <Check size={11} className="text-white" />
                                </button>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-400 line-through truncate">{t.title}</div>
                                </div>
                                <button onClick={() => onDelete(t.id)} className="p-1 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={12} /></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const CALENDAR_SPLIT_DEFAULT = 50;

// ── 메인 캔버스 ───────────────────────────────────────────────────────────
type PersonalScheduleProjectData = {
    events?: ScheduleEvent[];
    todos?: TodoItem[];
    categories?: Record<string, CategoryDef>;
    visibleCats?: string[];
};

const PersonalScheduleCanvas: React.FC = () => {
    const currentProjectId = useProjectStore(s => s.currentProjectId);
    const projects = useProjectStore(s => s.projects);
    const setCurrentProject = useProjectStore(s => s.setCurrentProject);
    const project = projects.find(p => p.id === currentProjectId);
    const wbsStoreProjectId = useWbsStore(s => s.currentProjectId);
    const wbsStoreRows = useWbsStore(s => s.rows);

    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [tab, setTab] = useState<TabMode>('calendar');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [weekStart, setWeekStart] = useState(() => startOfDay(new Date()));
    const [events, setEvents] = useState<ScheduleEvent[]>(SEED_SCHEDULE);
    const [todos, setTodos]   = useState<TodoItem[]>([]);

    // 카테고리 관리
    const [categories, setCategories] = useState<Record<string, CategoryDef>>(DEFAULT_CATEGORIES);
    const [visibleCats, setVisibleCats] = useState<Set<CategoryKey>>(new Set(Object.keys(DEFAULT_CATEGORIES)));

    const skipSaveRef = useRef(true);
    const syncInProgressRef = useRef(false);
    const loadedProjectIdRef = useRef<string | null>(null);
    const lastAppliedUpdatedAtRef = useRef<string | null>(null);
    /** fetchProjects로 서버 스냅샷을 한 번 반영했는지 (삭제 후 빈 목록을 서버 데이터로 되돌리지 않도록) */
    const initialFetchAppliedRef = useRef(false);
    const wbsSyncedKeyRef = useRef<string | null>(null);

    const applyProjectData = useCallback((data: PersonalScheduleProjectData | undefined) => {
        const cats = data?.categories && Object.keys(data.categories).length > 0
            ? { ...DEFAULT_CATEGORIES, ...data.categories }
            : DEFAULT_CATEGORIES;
        const defaultVis = Object.keys(cats);
        const vis = Array.isArray(data?.visibleCats) && data.visibleCats.length > 0
            ? [...new Set([...data.visibleCats, WBS_MIRROR_CATEGORY])]
            : defaultVis;
        skipSaveRef.current = true;
        setEvents(Array.isArray(data?.events) ? data.events : []);
        setTodos(Array.isArray(data?.todos) ? data.todos : []);
        setCategories(cats);
        setVisibleCats(new Set(vis));
        requestAnimationFrame(() => { skipSaveRef.current = false; });
    }, []);

    // 프로젝트 전환 시 로드
    useEffect(() => {
        if (!currentProjectId) return;
        loadedProjectIdRef.current = currentProjectId;
        initialFetchAppliedRef.current = false;
        wbsSyncedKeyRef.current = null;
        lastAppliedUpdatedAtRef.current = project?.updatedAt ?? null;
        applyProjectData(project?.data as PersonalScheduleProjectData | undefined);
    }, [currentProjectId, applyProjectData]); // eslint-disable-line react-hooks/exhaustive-deps

    // WBS 동기화 등 외부에서 projectStore가 갱신되면 캔버스에 반영
    useEffect(() => {
        if (!currentProjectId || loadedProjectIdRef.current !== currentProjectId) return;
        if (syncInProgressRef.current) return;
        const updatedAt = project?.updatedAt;
        if (!updatedAt || lastAppliedUpdatedAtRef.current === updatedAt) return;
        lastAppliedUpdatedAtRef.current = updatedAt;
        applyProjectData(project?.data as PersonalScheduleProjectData | undefined);
    }, [currentProjectId, project?.updatedAt, project?.data, applyProjectData]);

    // 개인일정 진입 시 WBS 동기화 (프로젝트·연결당 1회, projects 변경으로 재실행되지 않음)
    useEffect(() => {
        if (!currentProjectId || !project) return;
        const wbsId = resolveLinkedWbsProjectId(project, useProjectStore.getState().projects);
        if (!wbsId) return;

        const syncKey = `${currentProjectId}:${wbsId}`;
        if (wbsSyncedKeyRef.current === syncKey) return;

        let cancelled = false;
        syncInProgressRef.current = true;
        skipSaveRef.current = true;

        void (async () => {
            await syncWbsToLinkedPersonalSchedules(wbsId, { force: true });
            if (cancelled) return;
            wbsSyncedKeyRef.current = syncKey;
            const refreshed = useProjectStore.getState().projects.find((p) => p.id === currentProjectId);
            if (refreshed) {
                lastAppliedUpdatedAtRef.current = refreshed.updatedAt;
                applyProjectData(refreshed.data as PersonalScheduleProjectData | undefined);
            }
            syncInProgressRef.current = false;
        })();

        return () => { cancelled = true; };
    }, [currentProjectId, project?.id, project?.linkedWbsProjectId, applyProjectData]);

    // fetchProjects 후 서버 일정/할일이 도착했을 때 1회만 반영 (빈 로컬 캐시 → 서버 스냅샷)
    useEffect(() => {
        if (!currentProjectId || loadedProjectIdRef.current !== currentProjectId) return;
        if (initialFetchAppliedRef.current) return;

        const data = project?.data as PersonalScheduleProjectData | undefined;
        const serverEvents = Array.isArray(data?.events) ? data.events : [];
        const serverTodos = Array.isArray(data?.todos) ? data.todos : [];

        if (events.length > 0 || todos.length > 0) {
            initialFetchAppliedRef.current = true;
            return;
        }
        if (serverEvents.length === 0 && serverTodos.length === 0) return;

        initialFetchAppliedRef.current = true;
        applyProjectData(data);
    }, [currentProjectId, project?.data, project?.updatedAt, events.length, todos.length, applyProjectData]);

    // 변경 시 DB 저장 (디바운스) — WBS 동기화 중에는 저장하지 않음
    useEffect(() => {
        if (!currentProjectId || skipSaveRef.current || syncInProgressRef.current || loadedProjectIdRef.current !== currentProjectId) return;
        schedulePersonalScheduleSave(currentProjectId, {
            events,
            todos,
            categories,
            visibleCats: Array.from(visibleCats),
        });
    }, [currentProjectId, events, todos, categories, visibleCats]);

    const handleAddCategory = (label: string, color: string) => {
        const key = `cat_${Date.now()}`;
        setCategories(prev => ({ ...prev, [key]: { label, color } }));
        setVisibleCats(prev => new Set([...prev, key]));
    };

    const handleDeleteCategory = (key: string) => {
        setCategories(prev => { const n = { ...prev }; delete n[key]; return n; });
        setVisibleCats(prev => { const n = new Set(prev); n.delete(key); return n; });
    };

    const handleEditCategory = (key: string, label: string, color: string) => {
        setCategories(prev => ({ ...prev, [key]: { label, color } }));
    };

    // 우측 패널
    const [panelEvent, setPanelEvent] = useState<Partial<ScheduleEvent> | null>(null);
    const [panelOccurrenceYmd, setPanelOccurrenceYmd] = useState<string | null>(null);
    const [panelInitialTab, setPanelInitialTab] = useState<'main' | number>('main');
    const [panelOpen, setPanelOpen] = useState(false);
    const [calendarScrollHour, setCalendarScrollHour] = useState<number | null>(null);
    const [calendarSplitPct, setCalendarSplitPct] = useState(CALENDAR_SPLIT_DEFAULT);
    const splitContainerRef = useRef<HTMLDivElement>(null);
    const splitDragRef = useRef<{ startY: number; startPct: number } | null>(null);
    const splitDraggedRef = useRef(false);

    const handleSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        splitDraggedRef.current = false;
        splitDragRef.current = { startY: e.clientY, startPct: calendarSplitPct };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handleSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!splitDragRef.current || !splitContainerRef.current) return;
        if (Math.abs(e.clientY - splitDragRef.current.startY) > 3) splitDraggedRef.current = true;
        const rect = splitContainerRef.current.getBoundingClientRect();
        const deltaPct = ((e.clientY - splitDragRef.current.startY) / rect.height) * 100;
        const next = splitDragRef.current.startPct + deltaPct;
        setCalendarSplitPct(Math.min(80, Math.max(20, next)));
    };

    const handleSplitPointerUp = () => {
        splitDragRef.current = null;
    };

    const handleSplitDoubleClick = () => {
        if (splitDraggedRef.current) return;
        setCalendarSplitPct(CALENDAR_SPLIT_DEFAULT);
    };

    const filteredEvents = useMemo(() =>
        events.filter(e => visibleCats.has(e.category)),
        [events, visibleCats]);

    /** WBS 구분(산출물) Debuging 행 id — 캘린더 표시 필터용 */
    const debugingCategoryRowIds = useMemo(() => {
        if (!project) return new Set<string>();
        const linkedWbsId = resolveLinkedWbsProjectId(project, projects);
        if (!linkedWbsId) return new Set<string>();
        let rows: WbsDevRow[] = [];
        if (wbsStoreProjectId === linkedWbsId && wbsStoreRows.length > 0) {
            rows = wbsStoreRows;
        } else {
            const wbsProject = projects.find(p => p.id === linkedWbsId);
            rows = (wbsProject?.data as { rows?: WbsDevRow[] } | undefined)?.rows ?? [];
        }
        return new Set(rows.filter(isWbsDebugingCategoryRow).map(r => r.id));
    }, [project, projects, wbsStoreProjectId, wbsStoreRows]);

    const calendarEvents = useMemo(() => {
        const expanded = expandEventsForCalendar(events, visibleCats);
        return expanded.filter(e => !isDebugingCategoryCalendarEvent(e, debugingCategoryRowIds));
    }, [events, visibleCats, debugingCategoryRowIds]);

    // 간트 작업영역에 표시할 기준일: 캘린더/차트에서 이동한 주(weekStart)
    // → 다른 주로 이동하면 그 주기의 회차 데이터·하이라이트가 보이도록 한다.
    const ganttTasks = useMemo(
        () => eventsToGanttTasks(filteredEvents, categories, startOfDay(weekStart)),
        [filteredEvents, categories, weekStart],
    );

    const eventDates = useMemo(
        () => new Set(calendarEvents.map(e => e.startDate)),
        [calendarEvents],
    );

    const handleSelectCalendarEvent = useCallback((e: CalendarEvent) => {
        if (e._sourceEventId != null && e._subEventIndex != null) {
            const parent = events.find(x => x.id === e._sourceEventId);
            if (parent) {
                setPanelOccurrenceYmd(null);
                setPanelEvent(parent);
                setPanelInitialTab(e._subEventIndex);
                setPanelOpen(true);
                return;
            }
        }
        if (e._recurrenceSourceId) {
            const parent = events.find(x => x.id === e._recurrenceSourceId);
            if (parent) {
                const occYmd = normEventYmd(e.startDate);
                setPanelOccurrenceYmd(occYmd);
                setPanelEvent(buildEventViewForOccurrence(parent, e, occYmd));
                setPanelInitialTab('main');
                setPanelOpen(true);
                return;
            }
        }
        setPanelOccurrenceYmd(null);
        setPanelEvent(e);
        setPanelInitialTab('main');
        setPanelOpen(true);
    }, [events]);

    const handleSaveEvent = useCallback((e: ScheduleEvent) => {
        setEvents(prev => {
            const existing = prev.find(x => x.id === e.id);
            if (!existing) return [...prev, e];
            if (panelOccurrenceYmd && (existing.repeat ?? 'none') !== 'none') {
                return prev.map(x => (x.id === e.id ? applyPanelSaveToEvent(existing, e, panelOccurrenceYmd) : x));
            }
            return prev.map(x => (x.id === e.id ? e : x));
        });
        setPanelOccurrenceYmd(null);
        setPanelOpen(false);
    }, [panelOccurrenceYmd]);

    const handleDeleteEvent = useCallback((id: string) => {
        setEvents(prev => prev.filter(e => e.id !== id && e.parentId !== id));
        setPanelOccurrenceYmd(null);
        setPanelOpen(false);
    }, []);

    const openNewEvent = (date: string, time?: string, opts?: { allDay?: boolean }) => {
        const d = parseDate(date);
        setSelectedDate(d);
        const isAllDay = opts?.allDay ?? false;
        const startTime = isAllDay ? undefined : (time ?? '09:00');
        let endTime: string | undefined;
        if (!isAllDay && startTime) {
            const [hStr, mStr = '00'] = startTime.split(':');
            const h = parseInt(hStr, 10);
            endTime = Number.isNaN(h) ? '10:00' : `${pad(Math.min(h + 1, 23))}:${mStr}`;
        }
        setPanelEvent({
            startDate: date,
            endDate: date,
            startTime,
            endTime,
            allDay: isAllDay,
        });
        setPanelOccurrenceYmd(null);
        setPanelInitialTab('main');
        setPanelOpen(true);
    };

    // 주 이동
    const prevWeek = () => setWeekStart(d => addDays(d, -7));
    const nextWeek = () => setWeekStart(d => addDays(d, 7));
    const goToday  = () => { const t = startOfDay(new Date()); setWeekStart(t); setSelectedDate(t); };

    const weekEnd = addDays(weekStart, 6);

    // 간트 작업 추가 → 동일 events에 종일 일정으로 등록
    const handleAddTask = () => {
        const start = toYMD(new Date());
        const end = toYMD(addDays(new Date(), 7));
        const catKey = Object.keys(categories)[0] || 'work';
        const newEvent: ScheduleEvent = {
            id: genId(),
            title: '새 작업',
            category: catKey,
            startDate: start,
            endDate: end,
            allDay: true,
            repeat: 'none',
            assignee: '',
            progress: 0,
            ganttColor: GANTT_COLORS[events.length % GANTT_COLORS.length],
        };
        setEvents(prev => [...prev, newEvent]);
    };

    const handleUpdateGanttTask = useCallback((id: string, patch: Partial<GanttTask>) => {
        const refDate = startOfDay(weekStart);
        setEvents(prev => prev.map(e => (e.id === id ? applyGanttPatchToEvent(e, patch, refDate) : e)));
    }, [weekStart]);

    const handleDeleteGanttTask = useCallback((id: string) => {
        setEvents(prev => prev.filter(e => e.id !== id && e.parentId !== id));
        if (panelEvent?.id === id || panelEvent?.parentId === id) {
            setPanelEvent(null);
            setPanelOccurrenceYmd(null);
            setPanelOpen(false);
        }
    }, [panelEvent]);

    const handleGanttTaskClick = useCallback((taskId: string, occYmd?: string) => {
        const ev = events.find(e => e.id === taskId);
        if (!ev) return;

        // 클릭 시 기준 회차: 캘린더/차트에서 이동한 주(weekStart)의 회차
        const refDate = startOfDay(weekStart);
        const repeat = ev.repeat ?? 'none';
        const targetYmd = occYmd
            ?? getCurrentPeriodOccurrenceYmd(ev, refDate)
            ?? normEventYmd(ev.startDate);

        const occDate = parseDate(targetYmd);
        const anchorStart = startOfDay(parseDate(normEventYmd(ev.startDate)));
        const dates = repeat !== 'none'
            ? getOccurrenceDates(ev, occDate, anchorStart)
            : { startDate: ev.startDate, endDate: ev.endDate };

        const panelEv = repeat !== 'none'
            ? buildEventViewForOccurrence(ev, {
                ...dates,
                startTime: ev.startTime,
                endTime: ev.endTime,
                allDay: ev.allDay,
                progress: getOccurrenceProgress(ev, targetYmd),
            }, targetYmd)
            : ev;

        setPanelOccurrenceYmd(repeat !== 'none' ? targetYmd : null);
        const d = startOfDay(parseDate(targetYmd.replace(/\./g, '-')));
        setTab('calendar');
        setViewMode('week');
        setWeekStart(d);
        setSelectedDate(d);
        setPanelEvent(panelEv);
        setPanelInitialTab('main');
        setPanelOpen(true);
        if (!panelEv.allDay && panelEv.startTime) {
            const h = parseInt(panelEv.startTime.split(':')[0], 10);
            setCalendarScrollHour(Number.isNaN(h) ? null : h);
        } else {
            setCalendarScrollHour(null);
        }
    }, [events, weekStart]);

    return (
        <div className="w-full h-screen flex flex-col bg-gray-50 overflow-hidden">
            {/* 상단 헤더 */}
            <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={() => setCurrentProject(null)} className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors">
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-lg font-black text-gray-900">개인 일정 &amp; 간트 차트</h1>
                        <p className="text-xs text-gray-400">개인 일정을 관리하고 프로젝트 진행 상황을 한눈에 확인하세요.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* 오늘 / 주 이동 */}
                    <button onClick={goToday} className="px-3 py-1.5 text-xs font-bold border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">오늘</button>
                    <button onClick={prevWeek} className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors"><ChevronLeft size={16} /></button>
                    <button onClick={nextWeek} className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors"><ChevronRight size={16} /></button>
                    <span className="text-sm font-bold text-gray-700 min-w-[260px] text-center">
                        {weekStart.getFullYear()}.{pad(weekStart.getMonth()+1)}.{pad(weekStart.getDate())} ~ {pad(weekEnd.getMonth()+1)}.{pad(weekEnd.getDate())}
                    </span>
                    {/* 뷰 모드 */}
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                        {(['day','week','month'] as ViewMode[]).map(v => (
                            <button key={v} onClick={() => setViewMode(v)}
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${viewMode === v ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                {v === 'day' ? '일' : v === 'week' ? '주' : '월'}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => { setPanelEvent(null); setPanelInitialTab('main'); setPanelOpen(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 text-white rounded-xl text-sm font-bold hover:bg-rose-600 transition-colors">
                        <Plus size={15} /> 일정 추가
                    </button>
                </div>
            </div>

            {/* 본문 */}
            <div className="flex flex-1 overflow-hidden">
                {/* 좌측 사이드바 */}
                <div className="w-52 shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-y-auto">
                    <div className="p-4">
                        <MiniCalendar current={selectedDate} selected={selectedDate} onSelect={d => { setSelectedDate(d); setWeekStart(startOfDay(d)); }} eventDates={eventDates} rangeStart={weekStart} rangeEnd={addDays(weekStart, 6)} />
                    </div>

                    <div className="px-4 pb-3">
                        <div className="mb-2">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">캘린더 색상</span>
                        </div>
                        <div className="space-y-1">
                            {Object.entries(categories).map(([k, v]) => (
                                <button key={k} onClick={() => setVisibleCats(prev => {
                                    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
                                })} className="flex items-center gap-2 w-full text-left">
                                    <div className={`w-4 h-4 rounded flex items-center justify-center transition-opacity ${visibleCats.has(k) ? '' : 'opacity-30'}`}
                                        style={{ backgroundColor: v.color }}>
                                        {visibleCats.has(k) && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className="text-xs font-bold text-gray-700 truncate">{v.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 메인 영역 */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* 탭 */}
                    <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-gray-100 bg-white shrink-0">
                        {([['calendar','캘린더'], ['todo','할 일 목록']] as [TabMode, string][]).map(([t, label]) => (
                            <button key={t} onClick={() => setTab(t)}
                                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${tab === t ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* 탭 콘텐츠 */}
                    <div className="flex-1 overflow-hidden flex">
                        <div className="flex-1 overflow-hidden flex flex-col">

                            {/* 캘린더 탭: 위=캘린더 / 아래=간트 */}
                            {tab === 'calendar' && (
                                <div ref={splitContainerRef} className="flex-1 flex flex-col overflow-hidden">
                                    {/* 캘린더 뷰 */}
                                    <div className="flex flex-col bg-white" style={{ flex: `0 0 ${calendarSplitPct}%`, minHeight: 0, overflow: 'hidden' }}>
                                        {viewMode === 'week' && (
                                            <WeekView weekStart={weekStart} events={calendarEvents}
                                                onSelectEvent={handleSelectCalendarEvent}
                                                onSlotClick={(date, time) => openNewEvent(date, time)}
                                                onAllDayClick={date => openNewEvent(date, undefined, { allDay: true })}
                                                categories={categories}
                                                scrollToHour={calendarScrollHour}
                                                onScrollHourDone={() => setCalendarScrollHour(null)}
                                                onWeekChange={ws => {
                                                    const d = startOfDay(ws);
                                                    setWeekStart(d);
                                                    setSelectedDate(d);
                                                }} />
                                        )}
                                        {viewMode === 'month' && (
                                            <MonthView month={selectedDate} events={calendarEvents}
                                                onSelectEvent={handleSelectCalendarEvent}
                                                onDayClick={ymd => openNewEvent(ymd, '09:00')}
                                                categories={categories}
                                                onNavigate={dir => {
                                                    const d = new Date(selectedDate);
                                                    d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
                                                    setSelectedDate(d);
                                                }} />
                                        )}
                                        {viewMode === 'day' && (
                                            <DayView date={selectedDate} events={calendarEvents}
                                                onSelectEvent={handleSelectCalendarEvent}
                                                onSlotClick={(date, time) => openNewEvent(date, time)}
                                                categories={categories}
                                                onNavigate={dir => {
                                                    setSelectedDate(d => addDays(d, dir === 'next' ? 1 : -1));
                                                }} />
                                        )}
                                    </div>

                                    {/* 높이 조절 핸들 */}
                                    <div
                                        role="separator"
                                        aria-orientation="horizontal"
                                        aria-label="캘린더와 간트 차트 높이 조절"
                                        aria-valuenow={Math.round(calendarSplitPct)}
                                        tabIndex={0}
                                        onPointerDown={handleSplitPointerDown}
                                        onPointerMove={handleSplitPointerMove}
                                        onPointerUp={handleSplitPointerUp}
                                        onPointerCancel={handleSplitPointerUp}
                                        onDoubleClick={handleSplitDoubleClick}
                                        title="드래그하여 높이 조절 · 더블클릭하여 기본값 복원"
                                        className="shrink-0 h-2 cursor-ns-resize group relative z-10 flex items-center justify-center touch-none select-none bg-gray-50 hover:bg-rose-50/80 transition-colors"
                                    >
                                        <div className="w-12 h-1 rounded-full bg-gray-300 group-hover:bg-rose-400 transition-colors" />
                                    </div>

                                    {/* 간트 차트 */}
                                    <div className="flex flex-col bg-white flex-1 min-h-0 overflow-hidden">
                                        <GanttView tasks={ganttTasks} onAddTask={handleAddTask}
                                            onUpdateTask={handleUpdateGanttTask}
                                            onDeleteTask={handleDeleteGanttTask}
                                            onTaskClick={handleGanttTaskClick}
                                            weekStart={weekStart} />
                                    </div>
                                </div>
                            )}

                            {tab === 'todo' && (
                                <div className="flex-1 overflow-hidden bg-white">
                                    <TodoView todos={todos}
                                        onToggle={id => setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))}
                                        onAdd={item => setTodos(prev => [...prev, { ...item, id: genId() }])}
                                        onDelete={id => setTodos(prev => prev.filter(t => t.id !== id))}
                                        categories={categories} />
                                </div>
                            )}
                        </div>

                        {/* 우측 일정 정보 패널 */}
                        {panelOpen && (
                            <div className="w-72 shrink-0 border-l border-gray-100 bg-white flex flex-col overflow-hidden">
                                <EventForm
                                    key={`${panelEvent?.id ?? 'new'}-${panelInitialTab}-${panelOccurrenceYmd ?? ''}-${panelEvent?.startDate ?? ''}-${panelEvent?.startTime ?? ''}`}
                                    event={panelEvent}
                                    initialActiveTab={panelInitialTab}
                                    onSave={handleSaveEvent}
                                    onDelete={handleDeleteEvent}
                                    onClose={() => { setPanelOccurrenceYmd(null); setPanelOpen(false); }}
                                    projects={projects.map(p => ({ id: p.id, name: p.name }))}
                                    categories={categories}
                                    onAddCategory={handleAddCategory}
                                    onEditCategory={handleEditCategory}
                                    onDeleteCategory={handleDeleteCategory}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PersonalScheduleCanvas;
