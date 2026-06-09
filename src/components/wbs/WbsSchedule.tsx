import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Filter, Settings, Plus, AlertCircle, Flag, Trash2, X, ChevronDown, ChevronRight,
    Edit2, Search
} from 'lucide-react';
import { useWbsStore } from '../../store/wbsStore';
import type { WbsDetailSchedule } from '../../types/wbs';

// ─── 날짜 유틸 ──────────────────────────────────────────────────────────────

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
}

function getTimeline(viewMode: '일' | '주' | '월' | '분기', currentDate: Date): TimelineInfo {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (viewMode === '일') {
        const start = startOfWeek(currentDate);
        const end = endOfWeek(currentDate);
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const headers: HeaderItem[] = Array.from({ length: 7 }, (_, i) => {
            const d = addDays(start, i);
            return {
                label: days[i],
                subLabel: String(d.getDate()),
                isToday: d.toDateString() === today.toDateString(),
                date: d,
            };
        });
        return { start, end, headers };
    }

    if (viewMode === '주') {
        const baseStart = startOfWeek(currentDate);
        const start = addDays(baseStart, -21);
        const end = addDays(baseStart, 34);
        end.setHours(23, 59, 59, 999);
        const headers: HeaderItem[] = Array.from({ length: 8 }, (_, i) => {
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
        return { start, end, headers };
    }

    if (viewMode === '월') {
        const startMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1);
        const endMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 4, 0);
        endMonth.setHours(23, 59, 59, 999);
        const headers: HeaderItem[] = Array.from({ length: 6 }, (_, i) => {
            const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
            return {
                label: `${d.getFullYear()}년`,
                subLabel: `${d.getMonth() + 1}월`,
                isToday: today.getFullYear() === d.getFullYear() && today.getMonth() === d.getMonth(),
                date: d,
            };
        });
        return { start: startMonth, end: endMonth, headers };
    }

    // 분기
    const currentQ = Math.floor(currentDate.getMonth() / 3);
    const startQ = currentDate.getFullYear() * 4 + currentQ - 1;
    const startYear = Math.floor(startQ / 4);
    const startQNum = ((startQ % 4) + 4) % 4;
    const start = new Date(startYear, startQNum * 3, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 12, 0);
    end.setHours(23, 59, 59, 999);
    const headers: HeaderItem[] = Array.from({ length: 4 }, (_, i) => {
        const qStart = new Date(start.getFullYear(), start.getMonth() + i * 3, 1);
        const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 1);
        return {
            label: `${qStart.getFullYear()}년`,
            subLabel: `${Math.floor(qStart.getMonth() / 3) + 1}분기`,
            isToday: today >= qStart && today < qEnd,
            date: qStart,
        };
    });
    return { start, end, headers };
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
    const d = new Date(`${iso}T00:00:00`);
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

const DATE_COL_W = 132;

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
    const [draftStart, setDraftStart] = useState(startDate);
    const [draftEnd, setDraftEnd] = useState(endDate);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        setDraftStart(startDate);
        setDraftEnd(endDate);
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
        let s = draftStart || startDate;
        let e = draftEnd || endDate;
        if (s && e && new Date(`${e}T00:00:00`) < new Date(`${s}T00:00:00`)) e = s;
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
}> = ({ startDate, endDate, onSave }) => {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLSpanElement>(null);

    const label = formatDateRangeLabel(startDate, endDate);

    return (
        <>
            <span
                ref={anchorRef}
                className="shrink-0 text-center text-[10px] text-gray-500 tabular-nums cursor-pointer hover:text-blue-600 transition-colors truncate"
                style={{ width: DATE_COL_W }}
                title={`${label} — 더블클릭하여 기간 수정`}
                onDoubleClick={() => setOpen(true)}
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
}> = ({ value, onSave }) => {
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
            className="flex-1 text-[13px] font-semibold text-gray-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
            title="더블클릭하여 수정"
            onDoubleClick={() => { setDraft(value); setEditing(true); }}
        >
            {value}
        </span>
    );
};

// ─── 필터 패널 ──────────────────────────────────────────────────────────────

interface FilterState {
    search: string;
    progressMin: number;
    progressMax: number;
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

            <button
                onClick={() => onChange({ search: '', progressMin: 0, progressMax: 100 })}
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

    const [viewMode, setViewMode] = useState<'월' | '주' | '일' | '분기'>('일');
    const [currentDate, setCurrentDate] = useState<Date>(new Date());

    // 트리 상태
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    // 진척율 셀렉터 오픈 id
    const [progressOpenId, setProgressOpenId] = useState<string | null>(null);
    const progressAnchorRef = useRef<HTMLButtonElement | null>(null);

    // 필터
    const [showFilter, setShowFilter] = useState(false);
    const [filter, setFilter] = useState<FilterState>({ search: '', progressMin: 0, progressMax: 100 });
    const isFiltered = filter.search || filter.progressMin > 0 || filter.progressMax < 100;

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

    // ── 통계 ────────────────────────────────────────────────────────────────

    const overallProgress = useMemo(() => {
        const roots = detailSchedules.filter((s) => !s.parentId);
        if (roots.length === 0) return 0;
        const sum = roots.reduce((acc, s) => acc + (s.progress ?? 0), 0);
        return Math.round(sum / roots.length);
    }, [detailSchedules]);

    const totalWbs = useMemo(() => detailSchedules.filter((s) => !s.parentId).length, [detailSchedules]);

    const delayedItems = useMemo(() => {
        const now = new Date();
        return detailSchedules.filter((ds) => {
            if (!ds.endDate) return false;
            return new Date(ds.endDate) < now && (ds.progress ?? 0) < 100;
        }).length;
    }, [detailSchedules]);

    const weekMilestones = useMemo(() => {
        const now = new Date();
        const startW = startOfWeek(now);
        const endW = endOfWeek(now);
        return detailSchedules.filter((ds) => {
            if (!ds.endDate) return false;
            const d = new Date(ds.endDate);
            return d >= startW && d <= endW;
        }).length;
    }, [detailSchedules]);

    // ── 트리 구성 & 필터링 ──────────────────────────────────────────────────

    const flatRows = useMemo(() => {
        const themeIndex = { val: 0 };
        const tree = buildFlatTree(detailSchedules, collapsed, null, 0, themeIndex);

        if (!isFiltered) return tree;

        return tree.filter((node) => {
            const matchSearch = !filter.search || node.title.toLowerCase().includes(filter.search.toLowerCase());
            const p = node.progress ?? 0;
            const matchProgress = p >= filter.progressMin && p <= filter.progressMax;
            return matchSearch && matchProgress;
        });
    }, [detailSchedules, collapsed, filter, isFiltered]);

    // ── 타임라인 ────────────────────────────────────────────────────────────

    const timeline = useMemo(() => getTimeline(viewMode, currentDate), [viewMode, currentDate]);

    const todayLineLeft = useMemo(() => {
        const today = new Date();
        if (today < timeline.start || today > timeline.end) return null;
        const dur = timeline.end.getTime() - timeline.start.getTime();
        return ((today.getTime() - timeline.start.getTime()) / dur) * 100;
    }, [timeline]);

    const headerDateText = useMemo(() => {
        if (viewMode === '분기') return `${currentDate.getFullYear()}년`;
        return `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`;
    }, [currentDate, viewMode]);

    // ── 네비게이션 ──────────────────────────────────────────────────────────

    const handlePrev = () => setCurrentDate((prev) => {
        if (viewMode === '일') return addDays(prev, -7);
        if (viewMode === '주') return addDays(prev, -56);
        const d = new Date(prev);
        d.setMonth(d.getMonth() - (viewMode === '월' ? 6 : 12));
        return d;
    });

    const handleNext = () => setCurrentDate((prev) => {
        if (viewMode === '일') return addDays(prev, 7);
        if (viewMode === '주') return addDays(prev, 56);
        const d = new Date(prev);
        d.setMonth(d.getMonth() + (viewMode === '월' ? 6 : 12));
        return d;
    });

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
        const taskStart = new Date(node.startDate);
        const taskEnd = new Date(node.endDate);
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

    const hasChildren = useCallback(
        (id: string) => detailSchedules.some((s) => s.parentId === id),
        [detailSchedules]
    );

    // ── 렌더 ────────────────────────────────────────────────────────────────

    return (
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
                        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 border-r border-gray-200">
                            오늘
                        </button>
                        <button onClick={handlePrev} className="px-3 py-1.5 text-gray-500 hover:bg-gray-50 border-r border-gray-200 font-bold">{'<'}</button>
                        <button onClick={handleNext} className="px-3 py-1.5 text-gray-500 hover:bg-gray-50 border-r border-gray-200 font-bold">{'>'}</button>
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
                                    background: overallProgress < 30
                                        ? '#ef4444'
                                        : overallProgress < 70
                                        ? '#f59e0b'
                                        : overallProgress < 100
                                        ? '#3b82f6'
                                        : '#10b981',
                                }}
                            />
                        </div>
                    </div>
                    <div className="text-[11px] text-gray-500">최상위 항목 진척율 평균</div>
                </div>

                {/* 전체 WBS */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-semibold text-gray-500">최상위 항목 수</span>
                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                                <Plus size={15} className="text-blue-500" />
                            </div>
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-3">{totalWbs}</div>
                    </div>
                    <div className="text-[11px] text-gray-500">전체 {detailSchedules.length}개 항목 (하위 포함)</div>
                </div>

                {/* 지연 항목 */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-semibold text-gray-500">지연 항목</span>
                            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                                <AlertCircle size={15} className="text-red-500" />
                            </div>
                        </div>
                        <div className="text-3xl font-bold text-red-500 mb-3">{delayedItems}</div>
                    </div>
                    <div className="text-[11px] text-gray-500">종료일 경과 후 미완료 건</div>
                </div>

                {/* 이번 주 완료 대상 */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-semibold text-gray-500">이번 주 완료 대상</span>
                            <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center">
                                <Flag size={15} className="text-purple-500" />
                            </div>
                        </div>
                        <div className="text-3xl font-bold text-purple-600 mb-3">{weekMilestones}</div>
                    </div>
                    <div className="text-[11px] text-gray-500">이번 주 내 종료 예정 일정 수</div>
                </div>
            </div>

            {/* ── 간트 영역 ─────────────────────────────────────────────── */}
            <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
                {/* 뷰 모드 탭 */}
                <div className="flex justify-end p-3 border-b border-gray-100 bg-white z-10 shrink-0">
                    <div className="flex bg-gray-50 border border-gray-200 rounded-lg p-0.5">
                        {(['월', '주', '일', '분기'] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setViewMode(m)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${viewMode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden relative">
                    {/* ── 왼쪽: WBS 목록 ──────────────────────────────── */}
                    <div className="w-[360px] flex flex-col border-r border-gray-100 shrink-0 bg-white z-10 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.08)]">
                        {/* 컬럼 헤더 */}
                        <div className="border-b border-gray-100 flex items-center px-4 shrink-0 bg-gray-50/80" style={{ height: 56 }}>
                            <span className="text-xs font-bold text-gray-600 flex-1 min-w-0">WBS 항목</span>
                            {displaySettings.showDates && (
                                <span className="text-[10px] text-gray-400 text-center shrink-0" style={{ width: DATE_COL_W }}>기간</span>
                            )}
                            {displaySettings.showProgress && (
                                <span className="text-[10px] text-gray-400 w-14 text-center shrink-0">진척율</span>
                            )}
                        </div>

                        {/* 행 목록 */}
                        <div className="flex-1 overflow-y-auto">
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
                                        new Date(node.endDate) < new Date() &&
                                        (node.progress ?? 0) < 100;

                                    return (
                                        <div
                                            key={node.id}
                                            className={`flex items-center border-b border-gray-50 group shrink-0 hover:bg-gray-50/70 transition-colors`}
                                            style={{
                                                height: rowHeight,
                                                paddingLeft: `${8 + node.depth * 20}px`,
                                                paddingRight: 8,
                                            }}
                                        >
                                            {/* 토글 버튼 */}
                                            {childCount > 0 ? (
                                                <button
                                                    onClick={() => toggleCollapse(node.id)}
                                                    className="w-5 h-5 shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded transition-colors"
                                                >
                                                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                                </button>
                                            ) : (
                                                <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${node.depth === 0 ? theme.dot : 'bg-gray-300'}`} />
                                                </div>
                                            )}

                                            {/* 제목 (더블클릭 편집) */}
                                            <div className="flex-1 min-w-0 px-1.5">
                                                <InlineTitle
                                                    value={node.title}
                                                    onSave={(v) => updateDetailSchedule(node.id, { title: v })}
                                                />
                                            </div>

                                            {/* 기간 (더블클릭 편집) */}
                                            {displaySettings.showDates && (
                                                <InlineDateRange
                                                    startDate={node.startDate}
                                                    endDate={node.endDate}
                                                    onSave={(start, end) => updateDetailSchedule(node.id, { startDate: start, endDate: end })}
                                                />
                                            )}

                                            {/* 지연 배지 */}
                                            {isDelayed && (
                                                <span className="text-[9px] font-bold bg-red-50 text-red-500 border border-red-200 rounded px-1 py-0.5 shrink-0 mr-1">
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
                                                            progressAnchorRef.current = e.currentTarget;
                                                            setProgressOpenId(progressOpenId === node.id ? null : node.id);
                                                        }}
                                                        className={`text-[11px] font-bold border rounded-md px-2 py-0.5 cursor-pointer transition-all hover:scale-105 ${getProgressColor(node.progress ?? 0)}`}
                                                        title="클릭하여 진척율 변경"
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
                    <div className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden bg-white">
                        {/* 날짜 헤더 */}
                        <div
                            className="border-b border-gray-100 flex shrink-0 relative bg-white min-w-[600px]"
                            style={{ height: 56 }}
                        >
                            <div
                                className="flex-1 grid"
                                style={{ gridTemplateColumns: `repeat(${timeline.headers.length}, minmax(0, 1fr))` }}
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
                        <div className="flex-1 overflow-y-auto relative min-w-[600px] select-none">
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

                                        return (
                                            <div
                                                key={node.id}
                                                className="flex items-center relative border-b border-gray-50 w-full"
                                                style={{ height: rowHeight }}
                                            >
                                                {bar && (
                                                    <div
                                                        className={`absolute rounded-full flex items-center px-3 border shadow-sm transition-all duration-300 ${theme.bar} ${theme.border}`}
                                                        style={{
                                                            left: `${bar.left}%`,
                                                            width: `${bar.width}%`,
                                                            height: rowHeight * 0.6,
                                                        }}
                                                    >
                                                        {displaySettings.showDates && (
                                                            <span className={`text-[10px] font-bold truncate mr-2 ${theme.text}`}>
                                                                {bar.barText}
                                                            </span>
                                                        )}
                                                        {displaySettings.showProgress && (
                                                            <span className={`ml-auto text-[10px] font-black shrink-0 ${theme.label}`}>
                                                                {node.progress ?? 0}%
                                                            </span>
                                                        )}
                                                        {/* 진척율 내부 채움 */}
                                                        <div
                                                            className={`absolute left-0 top-0 h-full rounded-full opacity-30 ${theme.dot}`}
                                                            style={{ width: `${node.progress ?? 0}%` }}
                                                        />
                                                    </div>
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
    );
};

export default WbsSchedule;
