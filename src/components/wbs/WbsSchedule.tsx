import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Filter, Settings, Plus, AlertCircle, Flag, Trash2, X, ChevronDown, ChevronRight,
    Search, CheckCircle2, Loader2, Clock
} from 'lucide-react';
import { useWbsStore } from '../../store/wbsStore';
import { useWbsEditingStore } from '../../store/wbsEditingStore';
import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';
import type { WbsDetailSchedule } from '../../types/wbs';

// ─── 날짜 유틸 ──────────────────────────────────────────────────────────────

/** YYYY.MM.DD 또는 YYYY-MM-DD 모두 안전하게 파싱 (한 자리 월/일 자동 패딩) */
const parseDate = (iso: string): Date => {
    if (!iso) return new Date(NaN);
    // 2025.11.3 → 2025-11-03, 2025.1.5 → 2025-01-05
    const parts = iso.replace(/\./g, '-').split('-');
    if (parts.length === 3) {
        const [y, m, d] = parts;
        const normalized = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        return new Date(`${normalized}T00:00:00`);
    }
    return new Date(`${iso}T00:00:00`);
};

/** YYYY.MM.DD → YYYY-MM-DD (date input용) */
const toInputDate = (iso: string): string => {
    if (!iso) return '';
    const parts = iso.replace(/\./g, '-').split('-');
    if (parts.length === 3) {
        const [y, m, d] = parts;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return iso;
};

/** YYYY-MM-DD → YYYY.MM.DD (저장용) */
const fromInputDate = (input: string): string => {
    if (!input) return '';
    return input.replace(/-/g, '.');
};

const addDays = (date: Date, days: number): Date => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};

const startOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const result = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    result.setHours(0, 0, 0, 0);
    return result;
};

const endOfWeek = (date: Date): Date => {
    const d = startOfWeek(date);
    const result = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
    result.setHours(23, 59, 59, 999);
    return result;
};

// ─── 타임라인 ──────────────────────────────────────────────────────────────

interface HeaderItem {
    label: string;
    subLabel: string;
    isToday: boolean;
    date: Date;
}
interface TimelineInfo {
    start: Date;
    end: Date;
    headers: HeaderItem[];
    colMinWidth: number;   // 컬럼당 최소 픽셀 너비
    initialScrollCol: number; // 현재 날짜 컬럼 인덱스 (초기 scrollLeft 기준)
}

function getTimelineAll(items: { startDate: string; endDate: string }[]): TimelineInfo {
    const dates = items.flatMap((x) => [parseDate(x.startDate), parseDate(x.endDate)]).filter((d) => !isNaN(d.getTime()));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dates.length === 0) {
        // fallback: 현재 연도 전체
        const start = new Date(today.getFullYear(), 0, 1);
        const end = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
        return { start, end, headers: [], colMinWidth: 160, initialScrollCol: 0 };
    }

    const minTime = Math.min(...dates.map((d) => d.getTime()));
    const maxTime = Math.max(...dates.map((d) => d.getTime()));
    const start = new Date(minTime);
    start.setDate(1); // 월 시작으로 정렬
    const end = new Date(maxTime);
    end.setMonth(end.getMonth() + 1, 0); // 월 말로 정렬
    end.setHours(23, 59, 59, 999);

    // 헤더: 전체 기간을 연도별 분기로 나눔
    const headers: HeaderItem[] = [];
    const cursor = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
    while (cursor <= end) {
        const qStart = new Date(cursor);
        const qEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
        headers.push({
            label: `${qStart.getFullYear()}년`,
            subLabel: `${Math.floor(qStart.getMonth() / 3) + 1}Q`,
            isToday: today >= qStart && today < qEnd,
            date: qStart,
        });
        cursor.setMonth(cursor.getMonth() + 3);
        if (headers.length > 40) break; // 안전장치
    }
    return { start, end, headers, colMinWidth: 160, initialScrollCol: 0 };
}

function getTimeline(viewMode: '일' | '주' | '월' | '분기', currentDate: Date): TimelineInfo {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (viewMode === '일') {
        // 42일 (6주): 현재 주 포함, 앞 2주 + 뒤 3주
        const colMinWidth = 64;
        const PAST_WEEKS = 14; // 14일 앞
        const TOTAL_DAYS = 42;
        const curWeekStart = startOfWeek(currentDate);
        const start = addDays(curWeekStart, -PAST_WEEKS);
        const end = addDays(start, TOTAL_DAYS - 1);
        end.setHours(23, 59, 59, 999);
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const headers: HeaderItem[] = Array.from({ length: TOTAL_DAYS }, (_, i) => {
            const d = addDays(start, i);
            return {
                label: days[d.getDay()],
                subLabel: String(d.getDate()),
                isToday: d.toDateString() === today.toDateString(),
                date: d,
            };
        });
        return { start, end, headers, colMinWidth, initialScrollCol: PAST_WEEKS };
    }

    if (viewMode === '주') {
        // 26주: 앞 8주 + 뒤 18주
        const colMinWidth = 100;
        const PAST_WEEKS = 8;
        const TOTAL_WEEKS = 26;
        const baseStart = startOfWeek(currentDate);
        const start = addDays(baseStart, -PAST_WEEKS * 7);
        const end = addDays(start, TOTAL_WEEKS * 7 - 1);
        end.setHours(23, 59, 59, 999);
        const headers: HeaderItem[] = Array.from({ length: TOTAL_WEEKS }, (_, i) => {
            const weekStart = addDays(start, i * 7);
            const weekEnd = addDays(weekStart, 6);
            const weekNum = Math.ceil(weekStart.getDate() / 7);
            return {
                label: `${weekStart.getMonth() + 1}월`,
                subLabel: `${weekNum}주`,
                isToday: today >= weekStart && today <= weekEnd,
                date: weekStart,
            };
        });
        return { start, end, headers, colMinWidth, initialScrollCol: PAST_WEEKS };
    }

    if (viewMode === '월') {
        // 24개월: 앞 6개월 + 뒤 18개월
        const colMinWidth = 120;
        const PAST_MONTHS = 6;
        const TOTAL_MONTHS = 24;
        const startMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - PAST_MONTHS, 1);
        const endMonth = new Date(startMonth.getFullYear(), startMonth.getMonth() + TOTAL_MONTHS, 0);
        endMonth.setHours(23, 59, 59, 999);
        const headers: HeaderItem[] = Array.from({ length: TOTAL_MONTHS }, (_, i) => {
            const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
            return {
                label: `${d.getFullYear()}년`,
                subLabel: `${d.getMonth() + 1}월`,
                isToday: today.getFullYear() === d.getFullYear() && today.getMonth() === d.getMonth(),
                date: d,
            };
        });
        return { start: startMonth, end: endMonth, headers, colMinWidth, initialScrollCol: PAST_MONTHS };
    }

    // 분기: 12분기 (3년), 앞 3분기
    const colMinWidth = 180;
    const PAST_QUARTERS = 3;
    const TOTAL_QUARTERS = 12;
    const currentQ = Math.floor(currentDate.getMonth() / 3);
    const startQIdx = currentDate.getFullYear() * 4 + currentQ - PAST_QUARTERS;
    const startYear = Math.floor(startQIdx / 4);
    const startQNum = ((startQIdx % 4) + 4) % 4;
    const start = new Date(startYear, startQNum * 3, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + TOTAL_QUARTERS * 3, 0);
    end.setHours(23, 59, 59, 999);
    const headers: HeaderItem[] = Array.from({ length: TOTAL_QUARTERS }, (_, i) => {
        const qStart = new Date(start.getFullYear(), start.getMonth() + i * 3, 1);
        const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 1);
        return {
            label: `${qStart.getFullYear()}년`,
            subLabel: `${Math.floor(qStart.getMonth() / 3) + 1}분기`,
            isToday: today >= qStart && today < qEnd,
            date: qStart,
        };
    });
    return { start, end, headers, colMinWidth, initialScrollCol: PAST_QUARTERS };
}

// ─── 색상 테마 ──────────────────────────────────────────────────────────────

const THEMES = [
    { bg: 'bg-blue-50', bar: 'bg-blue-100/80', border: 'border-blue-200/60', text: 'text-blue-700', dot: 'bg-blue-500', label: 'text-blue-600' },
    { bg: 'bg-emerald-50', bar: 'bg-emerald-100/80', border: 'border-emerald-200/60', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'text-emerald-600' },
    { bg: 'bg-purple-50', bar: 'bg-purple-100/80', border: 'border-purple-200/60', text: 'text-purple-700', dot: 'bg-purple-500', label: 'text-purple-600' },
    { bg: 'bg-orange-50', bar: 'bg-orange-100/80', border: 'border-orange-200/60', text: 'text-orange-700', dot: 'bg-orange-500', label: 'text-orange-600' },
    { bg: 'bg-pink-50', bar: 'bg-pink-100/80', border: 'border-pink-200/60', text: 'text-pink-700', dot: 'bg-pink-500', label: 'text-pink-600' },
    { bg: 'bg-teal-50', bar: 'bg-teal-100/80', border: 'border-teal-200/60', text: 'text-teal-700', dot: 'bg-teal-500', label: 'text-teal-600' },
] as const;

// ─── 진척율 배지 색상 ───────────────────────────────────────────────────────

function getProgressColor(pct: number) {
    if (pct === 0) return 'bg-gray-100 text-gray-500 border-gray-200';
    if (pct < 30) return 'bg-red-50 text-red-600 border-red-200';
    if (pct < 70) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    if (pct < 100) return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

// ─── 트리 헬퍼 ──────────────────────────────────────────────────────────────

interface FlatNode extends WbsDetailSchedule {
    depth: number;
    themeIndex: number;
}

function buildFlatTree(
    items: WbsDetailSchedule[],
    collapsed: Set<string>,
    parentId: string | null = null,
    depth = 0,
    themeIndex = { val: 0 }
): FlatNode[] {
    const children = items
        .filter((s) => (s.parentId ?? null) === parentId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const result: FlatNode[] = [];
    children.forEach((item) => {
        const ti = depth === 0 ? themeIndex.val++ : (result.find((r) => r.id === parentId)?.themeIndex ?? themeIndex.val);
        result.push({ ...item, depth, themeIndex: ti % THEMES.length });
        if (!collapsed.has(item.id)) {
            result.push(...buildFlatTree(items, collapsed, item.id, depth + 1, themeIndex));
        }
    });
    return result;
}

// ─── 진척율 셀렉터 컴포넌트 ────────────────────────────────────────────────

const PROGRESS_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

const ProgressSelector: React.FC<{
    value: number;
    anchorRef: React.RefObject<HTMLElement | null>;
    onSelect: (v: number) => void;
    onClose: () => void;
}> = ({ value, anchorRef, onSelect, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const update = () => {
            const r = anchor.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: r.left });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [anchorRef]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (ref.current?.contains(t)) return;
            if (anchorRef.current?.contains(t)) return;
            onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose, anchorRef]);

    if (!pos) return null;

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[9999] bg-white rounded-xl shadow-xl border border-gray-100 p-2 flex flex-wrap gap-1"
            style={{ top: pos.top, left: pos.left, minWidth: 200 }}
        >
            {PROGRESS_OPTIONS.map((p) => (
                <button
                    key={p}
                    onClick={() => { onSelect(p); onClose(); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                        value === p
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : `${getProgressColor(p)} hover:opacity-80`
                    }`}
                >
                    {p}%
                </button>
            ))}
        </div>,
        document.body
    );
};

function formatDisplayDate(iso: string, withYear = true): string {
    if (!iso) return '';
    const d = parseDate(iso);
    if (Number.isNaN(d.getTime())) return '';
    const md = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    return withYear ? `${d.getFullYear()}.${md}` : md;
}

function formatDateRangeLabel(startDate: string, endDate: string): string {
    if (startDate && endDate) {
        const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
        return sameYear
            ? `${formatDisplayDate(startDate)}~${formatDisplayDate(endDate, false)}`
            : `${formatDisplayDate(startDate)}~${formatDisplayDate(endDate)}`;
    }
    if (startDate) return formatDisplayDate(startDate);
    if (endDate) return formatDisplayDate(endDate);
    return '—';
}

// ─── 기간 편집 패널 ─────────────────────────────────────────────────────────

const DATE_PANEL_W = 280;

const DateRangePanel: React.FC<{
    startDate: string;
    endDate: string;
    anchorRef: React.RefObject<HTMLElement | null>;
    onSave: (start: string, end: string) => void;
    onClose: () => void;
}> = ({ startDate, endDate, anchorRef, onSave, onClose }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [draftStart, setDraftStart] = useState(toInputDate(startDate));
    const [draftEnd, setDraftEnd] = useState(toInputDate(endDate));
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        setDraftStart(toInputDate(startDate));
        setDraftEnd(toInputDate(endDate));
    }, [startDate, endDate]);

    useEffect(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const update = () => {
            const r = anchor.getBoundingClientRect();
            let left = r.left + r.width / 2 - DATE_PANEL_W / 2;
            left = Math.max(8, Math.min(left, window.innerWidth - DATE_PANEL_W - 8));
            const below = r.bottom + 8;
            const panelH = 220;
            const top = below + panelH > window.innerHeight - 8 ? r.top - panelH - 8 : below;
            setPos({ top: Math.max(8, top), left });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [anchorRef]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (panelRef.current?.contains(t)) return;
            if (anchorRef.current?.contains(t)) return;
            onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose, anchorRef]);

    const commit = () => {
        let s = fromInputDate(draftStart) || startDate;
        let e = fromInputDate(draftEnd) || endDate;
        if (s && e && parseDate(e) < parseDate(s)) e = s;
        onSave(s, e);
        onClose();
    };

    if (!pos) return null;

    return createPortal(
        <div
            ref={panelRef}
            className="fixed z-[9999] bg-white rounded-2xl shadow-xl border border-gray-100 p-4"
            style={{ top: pos.top, left: pos.left, width: DATE_PANEL_W }}
            onKeyDown={(ev) => {
                if (ev.key === 'Escape') onClose();
            }}
        >
            <div className="text-xs font-bold text-gray-700 mb-3">기간 설정</div>
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-gray-500">시작일</label>
                    <input
                        type="date"
                        value={draftStart}
                        onChange={(ev) => setDraftStart(ev.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-gray-500">종료일</label>
                    <input
                        type="date"
                        value={draftEnd}
                        onChange={(ev) => setDraftEnd(ev.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                </div>
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-50">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={commit}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                    저장
                </button>
            </div>
        </div>,
        document.body
    );
};

const InlineDateRange: React.FC<{
    startDate: string;
    endDate: string;
    onSave: (start: string, end: string) => void;
    locked?: boolean;
}> = ({ startDate, endDate, onSave, locked }) => {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLSpanElement>(null);

    const label = formatDateRangeLabel(startDate, endDate);

    return (
        <>
            <span
                ref={anchorRef}
                className={`text-[10px] tabular-nums transition-colors ${locked ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 cursor-pointer hover:text-blue-600'}`}
                title={locked ? '다른 사용자가 수정 중입니다' : `${label} — 더블클릭하여 기간 수정`}
                onDoubleClick={() => { if (!locked) setOpen(true); }}
            >
                {label}
            </span>
            {open && (
                <DateRangePanel
                    startDate={startDate}
                    endDate={endDate}
                    anchorRef={anchorRef}
                    onSave={onSave}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
};

// ─── 인라인 타이틀 편집 ─────────────────────────────────────────────────────

const InlineTitle: React.FC<{
    value: string;
    onSave: (v: string) => void;
    locked?: boolean;
}> = ({ value, onSave, locked }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

    const commit = () => {
        const trimmed = draft.trim();
        if (trimmed) onSave(trimmed);
        else setDraft(value);
        setEditing(false);
    };

    if (editing) {
        return (
            <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
                }}
                className="flex-1 text-[13px] font-semibold text-gray-900 bg-transparent border-b-2 border-blue-400 outline-none min-w-0 py-0.5"
            />
        );
    }

    return (
        <span
            className={`block w-full text-[13px] font-semibold text-gray-900 whitespace-normal break-keep leading-snug transition-colors ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:text-blue-600'}`}
            onDoubleClick={() => { if (!locked) { setDraft(value); setEditing(true); } }}
            title={locked ? '다른 사용자가 수정 중입니다' : undefined}
        >
            {value}
        </span>
    );
};

// ─── 필터 패널 ──────────────────────────────────────────────────────────────

type ScheduleFilterStatus = 'done' | 'inProgress' | 'delayed';

interface FilterState {
    search: string;
    progressMin: number;
    progressMax: number;
    /** 빈 Set = 전체 표시 */
    statusFilter: Set<ScheduleFilterStatus>;
}

const FilterPanel: React.FC<{
    filter: FilterState;
    onChange: (f: FilterState) => void;
    onClose: () => void;
}> = ({ filter, onChange, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    return (
        <div ref={ref} className="absolute top-full right-0 mt-1 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 w-72">
            <div className="text-xs font-bold text-gray-700 mb-3">필터 설정</div>

            <div className="flex flex-col gap-1.5 mb-4">
                <label className="text-[11px] font-bold text-gray-500">항목 검색</label>
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
                    <Search size={13} className="text-gray-400" />
                    <input
                        value={filter.search}
                        onChange={(e) => onChange({ ...filter, search: e.target.value })}
                        placeholder="항목명으로 검색..."
                        className="flex-1 text-[12px] outline-none text-gray-700 placeholder-gray-300"
                    />
                </div>
            </div>

            <div className="flex flex-col gap-1.5 mb-4">
                <label className="text-[11px] font-bold text-gray-500">진척율 범위</label>
                <div className="flex items-center gap-2">
                    <select
                        value={filter.progressMin}
                        onChange={(e) => onChange({ ...filter, progressMin: Number(e.target.value) })}
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
                    >
                        {PROGRESS_OPTIONS.map((p) => <option key={p} value={p}>{p}%</option>)}
                    </select>
                    <span className="text-[11px] text-gray-400">~</span>
                    <select
                        value={filter.progressMax}
                        onChange={(e) => onChange({ ...filter, progressMax: Number(e.target.value) })}
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none"
                    >
                        {PROGRESS_OPTIONS.map((p) => <option key={p} value={p}>{p}%</option>)}
                    </select>
                </div>
            </div>

            <div className="flex flex-col gap-1.5 mb-4">
                <label className="text-[11px] font-bold text-gray-500">상태 필터 <span className="font-normal text-gray-400">(중복 선택 가능)</span></label>
                <div className="flex gap-2">
                    {([
                        { key: 'done'       as ScheduleFilterStatus, label: '완료', active: 'bg-emerald-500 text-white border-emerald-500', idle: 'bg-white text-emerald-600 border-emerald-300 hover:bg-emerald-50' },
                        { key: 'inProgress' as ScheduleFilterStatus, label: '진행', active: 'bg-blue-500 text-white border-blue-500',     idle: 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50' },
                        { key: 'delayed'    as ScheduleFilterStatus, label: '지연', active: 'bg-red-500 text-white border-red-500',       idle: 'bg-white text-red-600 border-red-300 hover:bg-red-50' },
                    ] as const).map(({ key, label, active, idle }) => {
                        const selected = filter.statusFilter.has(key);
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => {
                                    const next = new Set(filter.statusFilter);
                                    if (next.has(key)) next.delete(key); else next.add(key);
                                    onChange({ ...filter, statusFilter: next });
                                }}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${selected ? active : idle}`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <button
                onClick={() => onChange({ search: '', progressMin: 0, progressMax: 100, statusFilter: new Set() })}
                className="w-full text-xs font-bold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl py-1.5 hover:bg-gray-50 transition-colors"
            >
                필터 초기화
            </button>
        </div>
    );
};

// ─── 설정 패널 ──────────────────────────────────────────────────────────────

interface DisplaySettings {
    showProgress: boolean;
    showDates: boolean;
    showDelayBadge: boolean;
    rowHeight: 'compact' | 'normal' | 'comfortable';
}

const SettingsPanel: React.FC<{
    settings: DisplaySettings;
    onChange: (s: DisplaySettings) => void;
    onClose: () => void;
}> = ({ settings, onChange, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const toggle = (key: keyof DisplaySettings) => {
        if (key === 'rowHeight') return;
        onChange({ ...settings, [key]: !settings[key] });
    };

    return (
        <div ref={ref} className="absolute top-full right-0 mt-1 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 w-64">
            <div className="text-xs font-bold text-gray-700 mb-3">화면 설정</div>
            {([
                { key: 'showProgress', label: '진척율 표시' },
                { key: 'showDates', label: '날짜 범위 표시' },
                { key: 'showDelayBadge', label: '지연 배지 표시' },
            ] as const).map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between py-2 border-b border-gray-50 cursor-pointer">
                    <span className="text-xs text-gray-700">{label}</span>
                    <div
                        onClick={() => toggle(key)}
                        className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${settings[key] ? 'bg-blue-500' : 'bg-gray-200'}`}
                    >
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings[key] ? 'translate-x-4' : ''}`} />
                    </div>
                </label>
            ))}
            <div className="mt-3">
                <div className="text-[11px] font-bold text-gray-500 mb-2">행 높이</div>
                <div className="flex gap-1.5">
                    {(['compact', 'normal', 'comfortable'] as const).map((rh) => (
                        <button
                            key={rh}
                            onClick={() => onChange({ ...settings, rowHeight: rh })}
                            className={`flex-1 text-[11px] py-1 rounded-lg border font-bold transition-all ${settings.rowHeight === rh ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                            {rh === 'compact' ? '좁게' : rh === 'normal' ? '보통' : '넓게'}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────────────

const WbsSchedule: React.FC = () => {
    const detailSchedules = useWbsStore((s) => s.detailSchedules);
    const addDetailSchedule = useWbsStore((s) => s.addDetailSchedule);
    const updateDetailSchedule = useWbsStore((s) => s.updateDetailSchedule);
    const deleteDetailSchedule = useWbsStore((s) => s.deleteDetailSchedule);

    // 수정중 인디케이터
    const editingMap    = useWbsEditingStore((s) => s.editing);
    const emitFocus     = useSyncStore((s) => s.emitWbsFieldFocus);
    const emitBlur      = useSyncStore((s) => s.emitWbsFieldBlur);
    const currentUserId = useAuthStore((s) => s.user?.id);

    const [viewMode, setViewMode] = useState<'월' | '주' | '일' | '분기' | 'ALL'>('ALL');
    const [currentDate, setCurrentDate] = useState<Date>(new Date());

    // 트리 상태
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    // 진척율 셀렉터 오픈 id
    const [progressOpenId, setProgressOpenId] = useState<string | null>(null);
    const progressAnchorRef = useRef<HTMLButtonElement | null>(null);

    // 스크롤 동기화 (왼쪽 WBS 목록 ↔ 오른쪽 간트 바디)
    const listScrollRef = useRef<HTMLDivElement>(null);
    const ganttScrollRef = useRef<HTMLDivElement>(null);
    const ganttXScrollRef = useRef<HTMLDivElement>(null);
    const syncingRef = useRef(false);
    const handleListScroll = useCallback(() => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        if (ganttScrollRef.current && listScrollRef.current)
            ganttScrollRef.current.scrollTop = listScrollRef.current.scrollTop;
        syncingRef.current = false;
    }, []);
    const handleGanttScroll = useCallback(() => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        if (listScrollRef.current && ganttScrollRef.current)
            listScrollRef.current.scrollTop = ganttScrollRef.current.scrollTop;
        syncingRef.current = false;
    }, []);

    // 필터
    const [showFilter, setShowFilter] = useState(false);
    const [filter, setFilter] = useState<FilterState>({ search: '', progressMin: 0, progressMax: 100, statusFilter: new Set() });
    const isFiltered = filter.search || filter.progressMin > 0 || filter.progressMax < 100 || filter.statusFilter.size > 0;

    // 설정
    const [showSettings, setShowSettings] = useState(false);
    const [displaySettings, setDisplaySettings] = useState<DisplaySettings>({
        showProgress: true,
        showDates: true,
        showDelayBadge: true,
        rowHeight: 'normal',
    });

    // 추가 모달
    const [showAddModal, setShowAddModal] = useState(false);
    const [addParentId, setAddParentId] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newStartDate, setNewStartDate] = useState('');
    const [newEndDate, setNewEndDate] = useState('');

    // 행 높이 계산
    const rowHeight = displaySettings.rowHeight === 'compact' ? 36 : displaySettings.rowHeight === 'comfortable' ? 52 : 44;

    // 왼쪽 패널 행 실제 높이 측정 → 간트 행 동기화
    const leftRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [measuredRowHeights, setMeasuredRowHeights] = useState<Record<string, number>>({});

    useEffect(() => {
        const newHeights: Record<string, number> = {};
        let changed = false;
        for (const [id, el] of Object.entries(leftRowRefs.current)) {
            if (el) {
                const h = Math.round(el.getBoundingClientRect().height);
                if (h > 0 && h !== measuredRowHeights[id]) changed = true;
                newHeights[id] = h > 0 ? h : rowHeight;
            }
        }
        if (changed) setMeasuredRowHeights(newHeights);
    });

    // ── 통계 ────────────────────────────────────────────────────────────────

    const overallProgress = useMemo(() => {
        const all = detailSchedules;
        if (all.length === 0) return 0;
        const sum = all.reduce((acc, s) => acc + (s.progress ?? 0), 0);
        return Math.round(sum / all.length);
    }, [detailSchedules]);

    // 완료: progress === 100
    const doneItems = useMemo(() =>
        detailSchedules.filter((ds) => (ds.progress ?? 0) === 100),
    [detailSchedules]);

    // 진행: 0 < progress < 100
    const inProgressItems = useMemo(() =>
        detailSchedules.filter((ds) => { const p = ds.progress ?? 0; return p > 0 && p < 100; }),
    [detailSchedules]);

    // 지연: 종료일 경과 + 미완료
    const delayedItemsList = useMemo(() => {
        const now = new Date();
        return detailSchedules.filter((ds) => {
            if (!ds.endDate) return false;
            return parseDate(ds.endDate) < now && (ds.progress ?? 0) < 100;
        });
    }, [detailSchedules]);

    // 팝업 상태
    const [statModal, setStatModal] = useState<'done' | 'inProgress' | 'delayed' | null>(null);

    // 부모 제목 조회용 맵
    const titleById = useMemo(() => {
        const m = new Map<string, string>();
        detailSchedules.forEach((ds) => m.set(ds.id, ds.title));
        return m;
    }, [detailSchedules]);

    // ── 트리 구성 & 필터링 ──────────────────────────────────────────────────

    const flatRows = useMemo(() => {
        const themeIndex = { val: 0 };
        const tree = buildFlatTree(detailSchedules, collapsed, null, 0, themeIndex);

        if (!isFiltered) return tree;

        const now = new Date();
        return tree.filter((node) => {
            const matchSearch = !filter.search || node.title.toLowerCase().includes(filter.search.toLowerCase());
            const p = node.progress ?? 0;
            const matchProgress = p >= filter.progressMin && p <= filter.progressMax;

            let matchStatus = true;
            if (filter.statusFilter.size > 0) {
                const isDone      = p === 100;
                const isDelayed   = !isDone && !!node.endDate && parseDate(node.endDate) < now;
                const isInProgress = p > 0 && p < 100;
                matchStatus = (
                    (filter.statusFilter.has('done')       && isDone)      ||
                    (filter.statusFilter.has('inProgress') && isInProgress) ||
                    (filter.statusFilter.has('delayed')    && isDelayed)
                );
            }

            return matchSearch && matchProgress && matchStatus;
        });
    }, [detailSchedules, collapsed, filter, isFiltered]);

    // ── 타임라인 ────────────────────────────────────────────────────────────

    const timeline = useMemo(() => {
        if (viewMode === 'ALL') return getTimelineAll(detailSchedules);
        return getTimeline(viewMode, currentDate);
    }, [viewMode, currentDate, detailSchedules]);

    const todayLineLeft = useMemo(() => {
        const today = new Date();
        if (today < timeline.start || today > timeline.end) return null;
        const dur = timeline.end.getTime() - timeline.start.getTime();
        return ((today.getTime() - timeline.start.getTime()) / dur) * 100;
    }, [timeline]);

    // ── 네비게이션 ──────────────────────────────────────────────────────────

    // 스크롤 위치 → 헤더 날짜 텍스트 동기화 (useState를 headerDateText useMemo보다 먼저 선언)
    const [visibleColIndex, setVisibleColIndex] = useState(0);

    const headerDateText = useMemo(() => {
        if (viewMode === 'ALL') {
            const s = timeline.start, e = timeline.end;
            return `${s.getFullYear()}.${s.getMonth() + 1} ~ ${e.getFullYear()}.${e.getMonth() + 1}`;
        }
        const h = timeline.headers[visibleColIndex];
        if (!h) return '';
        const d = h.date;
        if (viewMode === '분기') return `${d.getFullYear()}년 ${Math.floor(d.getMonth() / 3) + 1}분기`;
        if (viewMode === '월') return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
        if (viewMode === '주') return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    }, [visibleColIndex, viewMode, timeline]);
    const handleXScroll = useCallback(() => {
        const el = ganttXScrollRef.current;
        if (!el || viewMode === 'ALL') return;
        const col = Math.floor(el.scrollLeft / timeline.colMinWidth);
        setVisibleColIndex(Math.min(col, timeline.headers.length - 1));
    }, [timeline, viewMode]);

    // 타임라인 변경 시 현재 날짜 위치로 초기 X 스크롤 + visibleColIndex 초기화
    useEffect(() => {
        if (viewMode === 'ALL') return;
        const el = ganttXScrollRef.current;
        if (!el) return;
        const scrollTo = timeline.initialScrollCol * timeline.colMinWidth;
        el.scrollLeft = scrollTo;
        setVisibleColIndex(timeline.initialScrollCol);
    }, [timeline, viewMode]);

    // 스크롤 단위: 컬럼 수로 이동
    const scrollByColumns = (cols: number) => {
        const el = ganttXScrollRef.current;
        if (!el) return;
        el.scrollBy({ left: cols * timeline.colMinWidth, behavior: 'smooth' });
    };

    const handlePrev = () => {
        if (viewMode === 'ALL') return;
        const cols = viewMode === '일' ? 7 : viewMode === '주' ? 4 : viewMode === '월' ? 3 : 2;
        scrollByColumns(-cols);
    };

    const handleNext = () => {
        if (viewMode === 'ALL') return;
        const cols = viewMode === '일' ? 7 : viewMode === '주' ? 4 : viewMode === '월' ? 3 : 2;
        scrollByColumns(cols);
    };

    // ── 아이템 조작 ─────────────────────────────────────────────────────────

    const openAddModal = useCallback((parentId: string | null) => {
        const todayStr = new Date().toISOString().split('T')[0];
        setAddParentId(parentId);
        setNewTitle('');
        setNewStartDate(todayStr);
        setNewEndDate(todayStr);
        setShowAddModal(true);
    }, []);

    const handleSaveWbs = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;
        addDetailSchedule({
            parentId: addParentId,
            title: newTitle.trim(),
            startDate: newStartDate,
            endDate: newEndDate,
            progress: 0,
        });
        setShowAddModal(false);
    };

    const handleDelete = (id: string, title: string) => {
        if (window.confirm(`"${title}" 항목을 삭제하시겠습니까?\n하위 항목도 함께 삭제됩니다.`)) {
            deleteDetailSchedule(id);
        }
    };

    const toggleCollapse = (id: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // ── 간트 바 계산 ────────────────────────────────────────────────────────

    const calcBar = (node: FlatNode): { left: number; width: number; barText: string } | null => {
        if (!node.startDate || !node.endDate) return null;
        const taskStart = parseDate(node.startDate);
        const taskEnd = parseDate(node.endDate);
        taskStart.setHours(0, 0, 0, 0);
        taskEnd.setHours(23, 59, 59, 999);

        const tsMs = timeline.start.getTime();
        const teMs = timeline.end.getTime();

        if (taskEnd.getTime() < tsMs || taskStart.getTime() > teMs) return null;

        const dur = teMs - tsMs;
        const left = Math.max(0, ((taskStart.getTime() - tsMs) / dur) * 100);
        const right = Math.max(0, ((teMs - taskEnd.getTime()) / dur) * 100);
        const width = Math.max(0, 100 - left - right);
        if (width === 0) return null;

        const barText = formatDateRangeLabel(node.startDate, node.endDate).replace('~', ' - ');
        return { left, width, barText };
    };

    // ── 렌더 ────────────────────────────────────────────────────────────────

    return (
        <>
        <div className="h-full overflow-auto bg-gray-50/50 p-6 flex flex-col gap-6 font-sans">

            {/* ── 헤더 ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">WBS 일정 관리</h2>
                    <p className="text-sm text-gray-500">WBS 항목의 일정과 진행 현황을 달력에서 확인하세요.</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* 날짜 네비게이터 */}
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                        {viewMode !== 'ALL' && <>
                            <button
                                onClick={() => {
                                    setCurrentDate(new Date());
                                    setTimeout(() => {
                                        const el = ganttXScrollRef.current;
                                        if (el) el.scrollLeft = timeline.initialScrollCol * timeline.colMinWidth;
                                    }, 0);
                                }}
                                className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 border-r border-gray-200"
                            >
                                오늘
                            </button>
                            <button onClick={handlePrev} className="px-3 py-1.5 text-gray-500 hover:bg-gray-50 border-r border-gray-200 font-bold">{'<'}</button>
                            <button onClick={handleNext} className="px-3 py-1.5 text-gray-500 hover:bg-gray-50 border-r border-gray-200 font-bold">{'>'}</button>
                        </>}
                        <span className="px-4 py-1.5 text-sm font-medium text-gray-700">{headerDateText}</span>
                    </div>

                    {/* 필터 버튼 */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowFilter((v) => !v); setShowSettings(false); }}
                            className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-medium shadow-sm transition-colors ${isFiltered ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                        >
                            <Filter size={14} className={isFiltered ? 'text-blue-500' : 'text-gray-500'} />
                            필터
                            {isFiltered && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                        </button>
                        {showFilter && (
                            <FilterPanel filter={filter} onChange={setFilter} onClose={() => setShowFilter(false)} />
                        )}
                    </div>

                    {/* 설정 버튼 */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowSettings((v) => !v); setShowFilter(false); }}
                            className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 shadow-sm"
                        >
                            <Settings size={16} />
                        </button>
                        {showSettings && (
                            <SettingsPanel settings={displaySettings} onChange={setDisplaySettings} onClose={() => setShowSettings(false)} />
                        )}
                    </div>

                    {/* WBS 추가 */}
                    <button
                        onClick={() => openAddModal(null)}
                        className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
                    >
                        <Plus size={16} /> WBS 추가
                    </button>
                </div>
            </div>

            {/* ── 요약 카드 ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-4 shrink-0">
                {/* 전체 진행률 */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
                    <div>
                        <span className="text-xs font-semibold text-gray-500 mb-2 block">전체 진행률</span>
                        <div className="text-3xl font-bold text-gray-900 mb-3">{overallProgress}%</div>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                    width: `${overallProgress}%`,
                                    background: overallProgress < 30 ? '#ef4444'
                                        : overallProgress < 70 ? '#f59e0b'
                                        : overallProgress < 100 ? '#3b82f6'
                                        : '#10b981',
                                }}
                            />
                        </div>
                    </div>
                    <div className="text-[11px] text-gray-500">전체 항목 진척율 평균</div>
                </div>

                {/* 완료 */}
                <button
                    type="button"
                    onClick={() => setStatModal('done')}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between text-left hover:border-emerald-300 hover:shadow-md transition-all group cursor-pointer"
                >
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-semibold text-gray-500">완료</span>
                            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                                <CheckCircle2 size={15} className="text-emerald-500" />
                            </div>
                        </div>
                        <div className="text-3xl font-bold text-emerald-600 mb-1">{doneItems.length}</div>
                    </div>
                    <div className="text-[11px] text-gray-400">진행율 100% 항목 · 클릭하여 상세 보기</div>
                </button>

                {/* 진행 */}
                <button
                    type="button"
                    onClick={() => setStatModal('inProgress')}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between text-left hover:border-blue-300 hover:shadow-md transition-all group cursor-pointer"
                >
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-semibold text-gray-500">진행</span>
                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                <Loader2 size={15} className="text-blue-500" />
                            </div>
                        </div>
                        <div className="text-3xl font-bold text-blue-600 mb-1">{inProgressItems.length}</div>
                    </div>
                    <div className="text-[11px] text-gray-400">진행율 1~99% 항목 · 클릭하여 상세 보기</div>
                </button>

                {/* 지연 */}
                <button
                    type="button"
                    onClick={() => setStatModal('delayed')}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between text-left hover:border-red-300 hover:shadow-md transition-all group cursor-pointer"
                >
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-semibold text-gray-500">지연</span>
                            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                                <Clock size={15} className="text-red-500" />
                            </div>
                        </div>
                        <div className="text-3xl font-bold text-red-500 mb-1">{delayedItemsList.length}</div>
                    </div>
                    <div className="text-[11px] text-gray-400">종료일 경과 미완료 · 클릭하여 상세 보기</div>
                </button>
            </div>

            {/* ── 간트 영역 ─────────────────────────────────────────────── */}
            <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
                {/* 뷰 모드 탭 */}
                <div className="flex justify-end p-3 border-b border-gray-100 bg-white z-10 shrink-0">
                    <div className="flex bg-gray-50 border border-gray-200 rounded-lg p-0.5">
                        {(['ALL', '분기', '월', '주', '일'] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setViewMode(m)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
                                    viewMode === m
                                        ? m === 'ALL' ? 'bg-white text-indigo-600 shadow-sm' : 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden relative">
                    {/* ── 왼쪽: WBS 목록 ──────────────────────────────── */}
                    <div className="w-[415px] flex flex-col border-r border-gray-100 shrink-0 bg-white z-10 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.08)]">
                        {/* 컬럼 헤더 */}
                        <div className="border-b border-gray-100 flex items-center px-4 shrink-0 bg-gray-50/80" style={{ height: 56 }}>
                            <span className="text-xs font-bold text-gray-600 flex-1 min-w-0">WBS 항목</span>
                            {displaySettings.showProgress && (
                                <span className="text-[10px] text-gray-400 w-14 text-center shrink-0">진척율</span>
                            )}
                        </div>

                        {/* 행 목록 */}
                        <div ref={listScrollRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto">
                            {flatRows.length === 0 ? (
                                <div className="text-center text-xs text-gray-400 py-12 px-6 leading-relaxed">
                                    등록된 WBS 항목이 없습니다.<br />
                                    <span className="text-blue-500 font-medium cursor-pointer hover:underline" onClick={() => openAddModal(null)}>
                                        WBS 추가
                                    </span>를 눌러 항목을 생성해 보세요.
                                </div>
                            ) : (
                                flatRows.map((node) => {
                                    const theme = THEMES[node.themeIndex];
                                    const childCount = detailSchedules.filter((s) => s.parentId === node.id).length;
                                    const isCollapsed = collapsed.has(node.id);
                                    const isDelayed = displaySettings.showDelayBadge &&
                                        node.endDate &&
                                        parseDate(node.endDate) < new Date() &&
                                        (node.progress ?? 0) < 100;

                                    const ganttEditEntry = editingMap.get(`schedule_${node.id}`);
                                    const isGanttBeingEdited = !!ganttEditEntry && ganttEditEntry.userId !== currentUserId;

                                    return (
                                        <div
                                            key={node.id}
                                            ref={(el) => { leftRowRefs.current[node.id] = el; }}
                                            className={`flex items-start border-b border-gray-50 group shrink-0 hover:bg-sky-50/60 transition-colors duration-100 relative`}
                                            style={{
                                                minHeight: rowHeight,
                                                paddingLeft: `${8 + node.depth * 20}px`,
                                                paddingRight: 8,
                                                paddingTop: 6,
                                                paddingBottom: 6,
                                                ...(isGanttBeingEdited ? { boxShadow: `inset 3px 0 0 ${ganttEditEntry!.color}` } : {}),
                                            }}
                                            onFocus={() => emitFocus(`schedule_${node.id}`)}
                                            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) emitBlur(`schedule_${node.id}`); }}
                                        >
                                            {/* 수정중 배지 */}
                                            {isGanttBeingEdited && (
                                                <span
                                                    className="absolute -top-3.5 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white z-20 pointer-events-none whitespace-nowrap"
                                                    style={{ backgroundColor: ganttEditEntry!.color }}
                                                >
                                                    {ganttEditEntry!.userName} <span className="opacity-80">수정중</span>
                                                </span>
                                            )}
                                            {/* 토글 버튼 */}
                                            {childCount > 0 ? (
                                                <button
                                                    onClick={() => toggleCollapse(node.id)}
                                                    className="w-5 h-5 mt-0.5 shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded transition-colors"
                                                >
                                                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                                </button>
                                            ) : (
                                                <div className="w-5 h-5 mt-0.5 shrink-0 flex items-center justify-center">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${node.depth === 0 ? theme.dot : 'bg-gray-300'}`} />
                                                </div>
                                            )}

                                            {/* 제목 + 기간 (2줄 레이아웃) */}
                                            <div className="flex-1 min-w-0 px-1.5 flex flex-col gap-0.5">
                                                <InlineTitle
                                                    value={node.title}
                                                    onSave={(v) => updateDetailSchedule(node.id, { title: v })}
                                                    locked={isGanttBeingEdited}
                                                />
                                                {/* 기간 — 제목 아래 */}
                                                {displaySettings.showDates && (
                                                    <div>
                                                        <InlineDateRange
                                                            startDate={node.startDate}
                                                            endDate={node.endDate}
                                                            onSave={(start, end) => updateDetailSchedule(node.id, { startDate: start, endDate: end })}
                                                            locked={isGanttBeingEdited}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* 지연 배지 */}
                                            {isDelayed && (
                                                <span className="text-[9px] font-bold bg-red-50 text-red-500 border border-red-200 rounded px-1 py-0.5 shrink-0 mt-0.5 mr-1">
                                                    지연
                                                </span>
                                            )}

                                            {/* 하위 추가 버튼 */}
                                            <button
                                                onClick={() => openAddModal(node.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-all shrink-0"
                                                title="하위 항목 추가"
                                            >
                                                <Plus size={12} />
                                            </button>

                                            {/* 삭제 버튼 */}
                                            <button
                                                onClick={() => handleDelete(node.id, node.title)}
                                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-all shrink-0"
                                                title="항목 삭제"
                                            >
                                                <Trash2 size={12} />
                                            </button>

                                            {/* 진척율 배지 */}
                                            {displaySettings.showProgress && (
                                                <div className="relative shrink-0">
                                                    <button
                                                        ref={progressOpenId === node.id ? progressAnchorRef : undefined}
                                                        onClick={(e) => {
                                                            if (isGanttBeingEdited) return;
                                                            progressAnchorRef.current = e.currentTarget;
                                                            setProgressOpenId(progressOpenId === node.id ? null : node.id);
                                                        }}
                                                        className={`text-[11px] font-bold border rounded-md px-2 py-0.5 transition-all ${isGanttBeingEdited ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-105'} ${getProgressColor(node.progress ?? 0)}`}
                                                        title={isGanttBeingEdited ? '다른 사용자가 수정 중입니다' : '클릭하여 진척율 변경'}
                                                        style={{ minWidth: 44 }}
                                                    >
                                                        {node.progress ?? 0}%
                                                    </button>
                                                    {progressOpenId === node.id && (
                                                        <ProgressSelector
                                                            value={node.progress ?? 0}
                                                            anchorRef={progressAnchorRef}
                                                            onSelect={(v) => updateDetailSchedule(node.id, { progress: v })}
                                                            onClose={() => setProgressOpenId(null)}
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* ── 오른쪽: 간트 차트 ───────────────────────────── */}
                    <div ref={ganttXScrollRef} onScroll={handleXScroll} className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden bg-white">
                        {/* 날짜 헤더 */}
                        <div
                            className="border-b border-gray-100 flex shrink-0 relative bg-white"
                            style={{ height: 56, minWidth: timeline.headers.length * timeline.colMinWidth }}
                        >
                            <div
                                className="flex-1 grid"
                                style={{ gridTemplateColumns: `repeat(${timeline.headers.length}, minmax(${timeline.colMinWidth}px, 1fr))` }}
                            >
                                {timeline.headers.map((h, i) => (
                                    <div key={i} className="border-r border-gray-100 flex flex-col items-center justify-center text-[11px] h-full">
                                        <span className={`font-semibold ${h.isToday ? 'text-blue-600' : 'text-gray-400'}`}>{h.label}</span>
                                        {h.isToday && viewMode === '일' ? (
                                            <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mt-0.5 shadow-sm">
                                                {h.subLabel}
                                            </div>
                                        ) : (
                                            <span className={`font-medium mt-1 ${h.isToday ? 'text-blue-600 font-bold' : h.label === '일' ? 'text-red-400' : 'text-gray-600'}`}>
                                                {h.subLabel}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 차트 바디 */}
                        <div ref={ganttScrollRef} onScroll={handleGanttScroll} className="flex-1 overflow-y-auto relative select-none" style={{ minWidth: timeline.headers.length * timeline.colMinWidth }}>
                            {/* 격자 배경 */}
                            <div
                                className="absolute inset-0 grid pointer-events-none"
                                style={{ gridTemplateColumns: `repeat(${timeline.headers.length}, minmax(0, 1fr))` }}
                            >
                                {timeline.headers.map((_, i) => (
                                    <div key={i} className="border-r border-gray-50 h-full" />
                                ))}
                            </div>

                            {/* 오늘 세로선 */}
                            {todayLineLeft !== null && (
                                <div
                                    className="absolute top-0 bottom-0 w-[1.5px] bg-blue-400/70 z-20 pointer-events-none"
                                    style={{ left: `${todayLineLeft}%` }}
                                >
                                    <div className="absolute -top-1 -left-[5px] w-3 h-3 rounded-full bg-blue-500 border border-white shadow" />
                                </div>
                            )}

                            {/* 간트 바 행들 */}
                            <div className="relative z-10 flex flex-col">
                                {flatRows.length === 0 ? (
                                    <div className="h-40 flex items-center justify-center text-xs text-gray-400">
                                        표시할 일정이 없습니다.
                                    </div>
                                ) : (
                                    flatRows.map((node) => {
                                        const bar = calcBar(node);
                                        const theme = THEMES[node.themeIndex];
                                        const isZero = (node.progress ?? 0) === 0;

                                        return (
                                            <div
                                                key={node.id}
                                                className="flex items-center relative border-b border-gray-50 w-full group/gantt hover:bg-sky-50/60 transition-colors duration-100"
                                                style={{ height: measuredRowHeights[node.id] ?? rowHeight, flexShrink: 0 }}
                                            >
                                                {bar && (
                                                    <>
                                                        {/* 바 배경 + 진척 채움 */}
                                                        <div
                                                            className={`absolute rounded-full border shadow-sm transition-all duration-300 ${isZero ? 'bg-gray-100/80 border-gray-200/60' : `${theme.bar} ${theme.border}`}`}
                                                            style={{
                                                                left: `${bar.left}%`,
                                                                width: `${bar.width}%`,
                                                                height: rowHeight * 0.6,
                                                                top: '50%',
                                                                transform: 'translateY(-50%)',
                                                            }}
                                                        >
                                                            <div
                                                                className={`absolute left-0 top-0 h-full rounded-full opacity-30 ${theme.dot}`}
                                                                style={{ width: `${node.progress ?? 0}%` }}
                                                            />
                                                        </div>
                                                        {/* 텍스트 레이블: 바 시작점에서 오른쪽으로 자유롭게 */}
                                                        {(displaySettings.showDates || displaySettings.showProgress) && (
                                                            <div
                                                                className="absolute flex items-center gap-1.5 pointer-events-none z-10"
                                                                style={{
                                                                    left: `calc(${bar.left}% + 10px)`,
                                                                    top: '50%',
                                                                    transform: 'translateY(-50%)',
                                                                    whiteSpace: 'nowrap',
                                                                }}
                                                            >
                                                                {displaySettings.showDates && (
                                                                    <span className={`text-[10px] font-bold ${isZero ? 'text-gray-400' : theme.text}`}>
                                                                        {bar.barText}
                                                                    </span>
                                                                )}
                                                                {displaySettings.showProgress && (
                                                                    <span className={`text-[10px] font-black ${isZero ? 'text-gray-400' : theme.label}`}>
                                                                        {node.progress ?? 0}%
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── WBS 추가 모달 ─────────────────────────────────────────── */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <div>
                                <h3 className="text-base font-bold text-gray-900">
                                    {addParentId ? '하위 항목 추가' : 'WBS 항목 추가'}
                                </h3>
                                {addParentId && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        상위: {detailSchedules.find((s) => s.id === addParentId)?.title}
                                    </p>
                                )}
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-50 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveWbs}>
                            <div className="p-6 flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-gray-500">항목 이름 <span className="text-red-400">*</span></label>
                                    <input
                                        type="text"
                                        required
                                        autoFocus
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        placeholder="예: 기획, 설계, 개발, 테스트, 배포"
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-bold text-gray-500">시작일</label>
                                        <input
                                            type="date"
                                            required
                                            value={newStartDate}
                                            onChange={(e) => setNewStartDate(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-bold text-gray-500">종료일</label>
                                        <input
                                            type="date"
                                            required
                                            value={newEndDate}
                                            onChange={(e) => setNewEndDate(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-600">
                                    <span className="font-bold">진척율</span>은 0%로 시작하며, 목록에서 직접 변경할 수 있습니다.
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 border border-gray-200 hover:bg-gray-100 text-gray-700 text-sm font-bold rounded-xl transition-colors"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors"
                                >
                                    저장
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>

        {/* ── 통계 팝업 ────────────────────────────────────────────────────── */}
        {statModal !== null && createPortal(
            <div
                className="fixed inset-0 z-[9998] bg-gray-900/45 backdrop-blur-sm flex items-center justify-center p-6"
                role="dialog"
                aria-modal="true"
                onMouseDown={(e) => { if (e.target === e.currentTarget) setStatModal(null); }}
            >
                <div className="w-full max-w-3xl max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
                    {/* 헤더 */}
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                statModal === 'done'       ? 'bg-emerald-50 text-emerald-600'
                                : statModal === 'inProgress' ? 'bg-blue-50 text-blue-600'
                                : 'bg-red-50 text-red-600'
                            }`}>
                                {statModal === 'done'        ? <CheckCircle2 size={18} />
                                : statModal === 'inProgress' ? <Loader2 size={18} />
                                : <Clock size={18} />}
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900">
                                    {statModal === 'done' ? '완료 항목'
                                    : statModal === 'inProgress' ? '진행 항목'
                                    : '지연 항목'}
                                </h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {statModal === 'done'
                                        ? `진행율 100% 항목 ${doneItems.length}건`
                                        : statModal === 'inProgress'
                                        ? `진행율 1~99% 항목 ${inProgressItems.length}건`
                                        : `종료일 경과 미완료 항목 ${delayedItemsList.length}건`}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setStatModal(null)}
                            className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors"
                        >
                            <X size={17} />
                        </button>
                    </div>

                    {/* 테이블 */}
                    <div className="overflow-auto">
                        {(() => {
                            const items = statModal === 'done' ? doneItems
                                : statModal === 'inProgress' ? inProgressItems
                                : delayedItemsList;
                            const now = new Date();

                            if (items.length === 0) {
                                return (
                                    <div className="py-16 text-center">
                                        <p className="text-sm font-bold text-gray-500">해당 항목이 없습니다.</p>
                                    </div>
                                );
                            }

                            return (
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                                        <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                                            <th className="text-left px-4 py-3 font-black">항목명</th>
                                            <th className="text-left px-4 py-3 font-black">상위 항목</th>
                                            <th className="text-left px-4 py-3 font-black">작업자</th>
                                            <th className="text-left px-4 py-3 font-black">시작일</th>
                                            <th className="text-left px-4 py-3 font-black">종료일</th>
                                            {statModal === 'delayed' && (
                                                <th className="text-right px-4 py-3 font-black">초과</th>
                                            )}
                                            <th className="text-right px-4 py-3 font-black">진행율</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {items.map((item) => {
                                            const parentTitle = item.parentId ? titleById.get(item.parentId) : null;
                                            const overdueDays = statModal === 'delayed' && item.endDate
                                                ? Math.max(1, Math.floor((now.getTime() - parseDate(item.endDate).getTime()) / 86400000))
                                                : 0;
                                            return (
                                                <tr key={item.id} className={`transition-colors ${
                                                    statModal === 'done' ? 'hover:bg-emerald-50/30'
                                                    : statModal === 'inProgress' ? 'hover:bg-blue-50/30'
                                                    : 'hover:bg-red-50/30'
                                                }`}>
                                                    <td className="px-4 py-3 font-semibold text-gray-800 max-w-[200px]">
                                                        <span className="block truncate" title={item.title}>{item.title}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500 max-w-[160px]">
                                                        <span className="block truncate" title={parentTitle ?? ''}>{parentTitle ?? <span className="text-gray-300">—</span>}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500">{item.worker || <span className="text-gray-300">—</span>}</td>
                                                    <td className="px-4 py-3 text-gray-500 tabular-nums whitespace-nowrap">{item.startDate || <span className="text-gray-300">—</span>}</td>
                                                    <td className="px-4 py-3 text-gray-500 tabular-nums whitespace-nowrap">{item.endDate || <span className="text-gray-300">—</span>}</td>
                                                    {statModal === 'delayed' && (
                                                        <td className="px-4 py-3 text-right">
                                                            <span className="font-black text-red-600 tabular-nums">{overdueDays}일</span>
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`font-black tabular-nums ${
                                                            statModal === 'done' ? 'text-emerald-600'
                                                            : statModal === 'inProgress' ? 'text-blue-600'
                                                            : 'text-red-500'
                                                        }`}>{item.progress ?? 0}%</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            );
                        })()}
                    </div>
                </div>
            </div>,
            document.body
        )}
        </>
    );
};

export default WbsSchedule;
