import React, { useState, useMemo, useCallback } from 'react';
import {
    ChevronLeft, ChevronRight, Plus, X, Check, Trash2,
    Pencil,
    ChevronDown, ArrowLeft,
} from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';

// ── 타입 ──────────────────────────────────────────────────────────────────
type ViewMode = 'day' | 'week' | 'month';
type TabMode = 'calendar' | 'gantt' | 'todo';
type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type CategoryKey = string;

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
    parentId?: string;
    ganttColor?: string;
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
};

const PRESET_COLORS = [
    '#3b82f6','#10b981','#8b5cf6','#ef4444','#f59e0b',
    '#ec4899','#06b6d4','#84cc16','#f97316','#6366f1',
];

// 헥스 색상에서 light 스타일 생성 (inline style 사용)
const getCatStyle = (color: string) => ({ backgroundColor: color + '20', color, border: `1px solid ${color}40` });

const GANTT_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const pad = (n: number) => String(n).padStart(2, '0');
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const daysBetweenDates = (a: Date, b: Date) =>
    Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);

function genId() { return Math.random().toString(36).slice(2, 10); }

function eventToGanttTask(e: ScheduleEvent, categories: Record<string, CategoryDef>): GanttTask {
    const catColor = categories[e.category]?.color;
    return {
        id: e.id,
        title: e.title,
        assignee: e.assignee ?? '',
        startDate: e.startDate,
        endDate: e.endDate,
        progress: e.progress ?? 0,
        parentId: e.parentId,
        color: e.ganttColor ?? catColor ?? GANTT_COLORS[0],
    };
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

// ── SEED 데이터 (캘린더·간트 단일 소스) ─────────────────────────────────────
const today = new Date();
const SEED_SCHEDULE: ScheduleEvent[] = [
    { id: 'e1', title: '팀 주간 회의', category: 'meeting', startDate: toYMD(today), startTime: '10:00', endDate: toYMD(today), endTime: '11:00', allDay: false, repeat: 'weekly', description: '주간 업무 공유 및 이슈 논의', progress: 0 },
    { id: 'e2', title: '개인 운동', category: 'personal', startDate: toYMD(addDays(today, 1)), startTime: '07:00', endDate: toYMD(addDays(today, 1)), endTime: '08:00', allDay: false, repeat: 'daily', progress: 0 },
    { id: 'e3', title: '클라이언트 미팅', category: 'work', startDate: toYMD(addDays(today, 2)), startTime: '14:00', endDate: toYMD(addDays(today, 2)), endTime: '15:00', allDay: false, repeat: 'none', progress: 0 },
    { id: 'e4', title: 'UI 디자인 마감', category: 'deadline', startDate: toYMD(addDays(today, 3)), startTime: '17:00', endDate: toYMD(addDays(today, 3)), endTime: '17:00', allDay: false, repeat: 'none', progress: 0 },
    { id: 't1', title: '1. 프로젝트 착수', category: 'work', startDate: toYMD(today), endDate: toYMD(addDays(today, 7)), allDay: true, repeat: 'none', assignee: '김관리', progress: 100, ganttColor: GANTT_COLORS[0] },
    { id: 't1-1', title: '1.1 요구사항 정의', category: 'work', startDate: toYMD(today), endDate: toYMD(addDays(today, 3)), allDay: true, repeat: 'none', assignee: '김관리', progress: 100, parentId: 't1', ganttColor: GANTT_COLORS[0] },
    { id: 't1-2', title: '1.2 프로젝트 계획 수립', category: 'work', startDate: toYMD(addDays(today, 3)), endDate: toYMD(addDays(today, 7)), allDay: true, repeat: 'none', assignee: '박기획', progress: 100, parentId: 't1', ganttColor: GANTT_COLORS[0] },
    { id: 't2', title: '2. 설계', category: 'work', startDate: toYMD(addDays(today, 8)), endDate: toYMD(addDays(today, 16)), allDay: true, repeat: 'none', assignee: '이개발', progress: 75, ganttColor: GANTT_COLORS[1] },
    { id: 't2-1', title: '2.1 시스템 설계', category: 'work', startDate: toYMD(addDays(today, 8)), endDate: toYMD(addDays(today, 11)), allDay: true, repeat: 'none', assignee: '이개발', progress: 100, parentId: 't2', ganttColor: GANTT_COLORS[1] },
    { id: 't2-2', title: '2.2 화면 설계', category: 'work', startDate: toYMD(addDays(today, 12)), endDate: toYMD(addDays(today, 14)), allDay: true, repeat: 'none', assignee: '최디자인', progress: 60, parentId: 't2', ganttColor: GANTT_COLORS[1] },
    { id: 't3', title: '3. 개발', category: 'work', startDate: toYMD(addDays(today, 17)), endDate: toYMD(addDays(today, 30)), allDay: true, repeat: 'none', assignee: '이개발', progress: 45, ganttColor: GANTT_COLORS[2] },
];

const SEED_TODOS: TodoItem[] = [
    { id: 'td1', title: '요구사항 문서 검토', done: true,  category: 'work',     dueDate: toYMD(today) },
    { id: 'td2', title: '주간 보고서 작성',   done: false, category: 'work',     dueDate: toYMD(addDays(today, 1)) },
    { id: 'td3', title: '운동 계획 수립',     done: false, category: 'personal', dueDate: toYMD(addDays(today, 2)) },
    { id: 'td4', title: '회의 자료 준비',     done: false, category: 'meeting',  dueDate: toYMD(today) },
];

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
    onSave: (e: ScheduleEvent) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    projects: { id: string; name: string }[];
    categories: Record<string, CategoryDef>;
    onAddCategory: (label: string, color: string) => void;
    onEditCategory: (key: string, label: string, color: string) => void;
    onDeleteCategory: (key: string) => void;
}> = ({ event, onSave, onDelete, onClose, projects, categories, onAddCategory, onEditCategory, onDeleteCategory }) => {
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
        setSubEvents(event?.subEvents || []);
        setActiveTab('main');
        setCatMode('select');
    }, [event?.id, event?.title, event?.category, event?.startDate, event?.startTime, event?.endDate, event?.endTime, event?.allDay, event?.repeat, event?.alarm, event?.description, event?.projectId, event?.subEvents]); // eslint-disable-line react-hooks/exhaustive-deps

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

                {/* 일정 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">일정</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50 mb-1.5" />
                    {!allDay && (
                        <div className="grid grid-cols-2 gap-2">
                            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50" />
                            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50" />
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
                        <input type="date" value={s.startDate} onChange={e => updateSubEvent(idx, { startDate: e.target.value })}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50 mb-1.5" />
                        {!s.allDay && (
                            <div className="grid grid-cols-2 gap-2">
                                <input type="time" value={s.startTime} onChange={e => updateSubEvent(idx, { startTime: e.target.value })}
                                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50" />
                                <input type="time" value={s.endTime} onChange={e => updateSubEvent(idx, { endTime: e.target.value })}
                                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50" />
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
    events: ScheduleEvent[];
    onSelectEvent: (e: ScheduleEvent) => void;
    onSlotClick: (date: string, time: string) => void;
    onAllDayClick: (date: string) => void;
    categories: Record<string, CategoryDef>;
    onNavigate: (dir: 'prev' | 'next') => void;
    scrollToHour?: number | null;
    onScrollHourDone?: () => void;
}> = ({ weekStart, events, onSelectEvent, onSlotClick, onAllDayClick, categories, onNavigate, scrollToHour, onScrollHourDone }) => {
    const hours = Array.from({ length: 24 }, (_, i) => i); // 00:00 ~ 23:00
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const scrollRef    = React.useRef<HTMLDivElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (scrollRef.current) {
            const currentHour = new Date().getHours();
            scrollRef.current.scrollTop = Math.max(0, (currentHour - 1)) * 56;
        }
    }, []);

    React.useEffect(() => {
        if (scrollToHour == null || !scrollRef.current) return;
        scrollRef.current.scrollTop = Math.max(0, (scrollToHour - 1) * 56);
        onScrollHourDone?.();
    }, [scrollToHour, weekStart, onScrollHourDone]);

    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let accumulated = 0;
        let lastNav = 0;
        const THRESHOLD = 50;   // px
        const COOLDOWN  = 500;  // ms — 이동 후 재입력 차단
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            e.preventDefault();
            const now = Date.now();
            if (now - lastNav < COOLDOWN) { accumulated = 0; return; }
            accumulated += e.deltaX;
            if (Math.abs(accumulated) >= THRESHOLD) {
                onNavigate(accumulated > 0 ? 'next' : 'prev');
                accumulated = 0;
                lastNav = now;
            }
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => { el.removeEventListener('wheel', onWheel); };
    }, [onNavigate]);
    const DAY_LABELS = ['일','월','화','수','목','금','토'];

    const getEventsForSlot = (date: Date, hour: number) => {
        const ymd = toYMD(date);
        return events.filter(e => {
            if (e.startDate !== ymd) return false;
            if (e.allDay) return false;
            const h = parseInt(e.startTime?.split(':')[0] || '0');
            return h === hour;
        });
    };

    const normYmd = (s: string) => s.replace(/\./g, '-');

    /** 종일·기간 일정을 주간 그리드 위 연속 바로 배치 */
    const allDayLayout = React.useMemo(() => {
        const weekStartYmd = toYMD(days[0]);
        const weekEndYmd = toYMD(days[6]);
        const BAR_H = 20;
        const BAR_GAP = 2;

        const inWeek = events.filter(e => {
            if (!e.allDay) return false;
            const s = normYmd(e.startDate);
            const end = normYmd(e.endDate);
            return s <= weekEndYmd && end >= weekStartYmd;
        });

        const raw = inWeek.map(e => {
            const s = normYmd(e.startDate);
            const end = normYmd(e.endDate);
            const visStart = s < weekStartYmd ? weekStartYmd : s;
            const visEnd = end > weekEndYmd ? weekEndYmd : end;
            const startCol = daysBetweenDates(parseDate(weekStartYmd), parseDate(visStart));
            const endCol = daysBetweenDates(parseDate(weekStartYmd), parseDate(visEnd));
            return { event: e, startCol, endCol, span: endCol - startCol + 1 };
        }).sort((a, b) => a.startCol - b.startCol || b.span - a.span);

        const laneEnds: number[] = [];
        const bars = raw.map(bar => {
            let lane = 0;
            while (lane < laneEnds.length && laneEnds[lane] >= bar.startCol) lane++;
            if (lane === laneEnds.length) laneEnds.push(-1);
            laneEnds[lane] = bar.endCol;
            return { ...bar, lane };
        });

        const laneCount = Math.max(1, laneEnds.length);
        const rowHeight = laneCount * (BAR_H + BAR_GAP) + BAR_GAP * 2;
        return { bars, rowHeight, BAR_H, BAR_GAP };
    }, [events, days]);

    return (
        <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
            {/* 헤더 */}
            <div className="grid shrink-0 border-b border-gray-100" style={{ gridTemplateColumns: '56px repeat(7,1fr)' }}>
                <div />
                {days.map((d, i) => {
                    const isToday = toYMD(d) === toYMD(new Date());
                    return (
                        <div key={i} className={`text-center py-2 border-l border-gray-100 ${d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                            <div className="text-[10px] font-bold text-gray-400">{DAY_LABELS[d.getDay()]}</div>
                            <div className={`text-sm font-black w-7 h-7 mx-auto flex items-center justify-center rounded-full ${isToday ? 'bg-rose-500 text-white' : ''}`}>
                                {d.getDate()}
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* 종일·기간 이벤트 — 시작~종료까지 연속 바 */}
            <div className="grid shrink-0 border-b border-gray-100" style={{ gridTemplateColumns: '56px repeat(7,1fr)', minHeight: allDayLayout.rowHeight }}>
                <div className="text-[10px] text-gray-400 px-1 pt-1 text-right">종일</div>
                <div className="relative col-span-7 border-l border-gray-100" style={{ minHeight: allDayLayout.rowHeight }}>
                    {/* 요일 구분선 */}
                    <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                        {days.map((_, i) => (
                            <div key={i} className={`border-l border-gray-100 ${i === 0 ? 'border-l-0' : ''}`} />
                        ))}
                    </div>
                    {/* 빈 종일 슬롯 클릭 */}
                    <div className="absolute inset-0 grid grid-cols-7 z-[1]">
                        {days.map((d, i) => (
                            <div
                                key={i}
                                className={`cursor-pointer hover:bg-rose-50/30 transition-colors ${i === 0 ? '' : 'border-l border-gray-100'}`}
                                onClick={() => onAllDayClick(toYMD(d))}
                            />
                        ))}
                    </div>
                    {allDayLayout.bars.map(({ event: e, startCol, span, lane }) => (
                        <div
                            key={e.id}
                            onClick={() => onSelectEvent(e)}
                            className="absolute text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer truncate text-white z-10"
                            style={{
                                left: `calc(${(startCol / 7) * 100}% + 2px)`,
                                width: `calc(${(span / 7) * 100}% - 4px)`,
                                top: lane * (allDayLayout.BAR_H + allDayLayout.BAR_GAP) + allDayLayout.BAR_GAP,
                                height: allDayLayout.BAR_H,
                                backgroundColor: e.ganttColor ?? categories[e.category]?.color ?? '#94a3b8',
                            }}
                            title={e.title}
                        >
                            {e.title}
                        </div>
                    ))}
                </div>
            </div>
            {/* 시간 그리드 */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
                {hours.map(h => (
                    <div key={h} className="grid" style={{ gridTemplateColumns: '56px repeat(7,1fr)', height: 56 }}>
                        <div className="text-[10px] text-gray-400 text-right pr-2 pt-1 shrink-0">{pad(h)}:00</div>
                        {days.map((d, i) => {
                            const slotEvents = getEventsForSlot(d, h);
                            return (
                                <div key={i} className="border-l border-t border-gray-100 relative cursor-pointer hover:bg-rose-50/30 transition-colors"
                                    onClick={() => onSlotClick(toYMD(d), `${pad(h)}:00`)}>
                                    {slotEvents.map(e => (
                                        <div key={e.id} onClick={ev => { ev.stopPropagation(); onSelectEvent(e); }}
                                            className="absolute inset-x-0.5 top-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white cursor-pointer z-10 overflow-hidden"
                                            style={{ backgroundColor: (categories[e.category]?.color ?? '#94a3b8'), minHeight: 28 }}>
                                            <div className="truncate">{e.startTime} - {e.endTime}</div>
                                            <div className="truncate">{e.title}</div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── 월간 캘린더 뷰 ────────────────────────────────────────────────────────
const MonthView: React.FC<{
    month: Date;
    events: ScheduleEvent[];
    onSelectEvent: (e: ScheduleEvent) => void;
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
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            e.preventDefault();
            const now = Date.now();
            if (now - lastNavRef.current < COOLDOWN) { accRef.current = 0; return; }
            accRef.current += e.deltaX;
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
                    const dayEvents = events.filter(e => e.startDate === ymd);
                    const isToday = ymd === toYMD(new Date());
                    return (
                        <div key={ymd} onClick={() => onDayClick(ymd)}
                            className="border-r border-b border-gray-100 p-1 cursor-pointer hover:bg-rose-50/20 transition-colors overflow-hidden">
                            <div className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full mb-1
                                ${isToday ? 'bg-rose-500 text-white' : i % 7 === 0 ? 'text-red-500' : i % 7 === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                                {d.getDate()}
                            </div>
                            <div className="space-y-0.5">
                                {dayEvents.slice(0, 3).map(e => (
                                    <div key={e.id} onClick={ev => { ev.stopPropagation(); onSelectEvent(e); }}
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white truncate cursor-pointer"
                                        style={{ backgroundColor: (categories[e.category]?.color ?? '#94a3b8') }}>
                                        {e.startTime && `${e.startTime} `}{e.title}
                                    </div>
                                ))}
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
    events: ScheduleEvent[];
    onSelectEvent: (e: ScheduleEvent) => void;
    onSlotClick: (date: string, time: string) => void;
    categories: Record<string, CategoryDef>;
    onNavigate: (dir: 'prev' | 'next') => void;
}> = ({ date, events, onSelectEvent, onSlotClick, categories, onNavigate }) => {
    const hours = Array.from({ length: 24 }, (_, i) => i); // 00:00 ~ 23:00
    const ymd = toYMD(date);
    const dayEvents = events.filter(e => e.startDate === ymd && !e.allDay);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const accRef       = React.useRef(0);
    const lastNavRef   = React.useRef(0);
    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const THRESHOLD = 50;
        const COOLDOWN  = 600;
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            e.preventDefault();
            const now = Date.now();
            if (now - lastNavRef.current < COOLDOWN) { accRef.current = 0; return; }
            accRef.current += e.deltaX;
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
        <div ref={containerRef} className="h-full min-h-0 overflow-y-auto">
            {hours.map(h => {
                const slotEvents = dayEvents.filter(e => parseInt(e.startTime?.split(':')[0] || '0') === h);
                return (
                    <div key={h} className="flex border-b border-gray-100" style={{ minHeight: 60 }}>
                        <div className="w-16 text-[11px] text-gray-400 text-right pr-3 pt-1 shrink-0">{pad(h)}:00</div>
                        <div className="flex-1 border-l border-gray-100 relative cursor-pointer hover:bg-rose-50/30 transition-colors px-1 py-0.5 space-y-0.5"
                            onClick={() => onSlotClick(ymd, `${pad(h)}:00`)}>
                            {slotEvents.map(e => (
                                <div key={e.id} onClick={ev => { ev.stopPropagation(); onSelectEvent(e); }}
                                    className="rounded-lg px-3 py-2 text-white cursor-pointer"
                                    style={{ backgroundColor: (categories[e.category]?.color ?? '#94a3b8') }}>
                                    <div className="text-xs font-black">{e.title}</div>
                                    <div className="text-[10px] opacity-80">{e.startTime} ~ {e.endTime}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ── 간트 차트 ─────────────────────────────────────────────────────────────
const GanttView: React.FC<{
    tasks: GanttTask[];
    onAddTask: () => void;
    onUpdateTask?: (id: string, patch: Partial<GanttTask>) => void;
    onDeleteTask?: (id: string) => void;
    onTaskClick?: (taskId: string) => void;
    weekStart: Date;
    onWeekChange: (d: Date) => void;
}> = ({ tasks, onAddTask, onTaskClick, weekStart, onWeekChange }) => {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const leftRef        = React.useRef<HTMLDivElement>(null);
    const rightRef       = React.useRef<HTMLDivElement>(null);
    const syncingV       = React.useRef(false);  // 세로 스크롤 루프 방지
    const ganttIsSource  = React.useRef(false);  // 간트가 weekStart 변경 원인일 때 true
    const calSyncing     = React.useRef(false);  // 캘린더→간트 sync 중 스크롤 무시
    const syncClearTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // ±90일 고정 범위 (자정 기준)
    const chartStart = React.useMemo(() => startOfDay(addDays(new Date(), -90)), []);
    const chartEnd   = React.useMemo(() => startOfDay(addDays(new Date(),  90)), []);
    const totalDays  = daysBetweenDates(chartStart, chartEnd) + 1;
    const DAY_W = 24;
    const GANTT_ROW_H = 33;
    const weekStartDay = startOfDay(weekStart);
    const weekHighlightLeft = daysBetweenDates(chartStart, weekStartDay) * DAY_W;

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
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            e.preventDefault();
            el.scrollLeft += e.deltaX;
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

    React.useLayoutEffect(() => {
        if (ganttIsSource.current) {
            ganttIsSource.current = false;
            return;
        }
        scrollToWeek(weekStart);
    }, [weekStart, scrollToWeek]);

    React.useLayoutEffect(() => {
        scrollToWeek(weekStart);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 현재 weekStart의 day index (chartStart 기준)
    const weekStartIdx = React.useRef(daysBetween(chartStart, weekStart));
    React.useEffect(() => {
        weekStartIdx.current = daysBetween(chartStart, weekStart);
    }, [weekStart, chartStart]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── 스크롤 멈춤 후 스냅 ──────────────────────────────────
    const snapTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const snap = React.useCallback(() => {
        if (!rightRef.current || calSyncing.current) return;
        const viewWidth = rightRef.current.clientWidth;
        const S = rightRef.current.scrollLeft;
        // 빨간 영역 왼쪽 경계가 위치한 day index
        const rawN = (S + viewWidth / 2 - 3.5 * DAY_W) / DAY_W;
        const snapN = Math.round(rawN);

        const target = Math.max(0, snapN * DAY_W + 3.5 * DAY_W - viewWidth / 2);

        calSyncing.current = true;
        clearTimeout(syncClearTimer.current);
        // smooth scroll for snap feel
        rightRef.current.style.scrollBehavior = 'smooth';
        rightRef.current.scrollLeft = target;
        rightRef.current.style.scrollBehavior = '';

        const newWeekStart = startOfDay(addDays(chartStart, snapN));
        weekStartIdx.current = snapN;
        ganttIsSource.current = true;
        onWeekChange(newWeekStart);
        syncClearTimer.current = setTimeout(() => { calSyncing.current = false; }, 500);
    }, [chartStart, onWeekChange]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── 간트 가로 스크롤 → 캘린더 실시간 동기화 ─────────────
    const handleTimelineScroll = React.useCallback(() => {
        if (calSyncing.current) return;
        // 실시간: 뷰포트 중앙 기준으로 weekStart 업데이트
        const viewWidth = rightRef.current?.clientWidth ?? 0;
        const S = rightRef.current?.scrollLeft ?? 0;
        const rawN = (S + viewWidth / 2 - 3.5 * DAY_W) / DAY_W;
        const N = Math.round(rawN);
        const newWeekStart = startOfDay(addDays(chartStart, N));
        ganttIsSource.current = true;
        onWeekChange(newWeekStart);
        // 스크롤 멈추면 스냅
        clearTimeout(snapTimer.current);
        snapTimer.current = setTimeout(snap, 300);
    }, [chartStart, onWeekChange, snap]);

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
                    className="w-[480px] shrink-0 border-r border-gray-200 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                        <colgroup>
                            <col style={{ width: '180px' }} />
                            <col style={{ width: '64px' }} />
                            <col style={{ width: '92px' }} />
                            <col style={{ width: '92px' }} />
                            <col style={{ width: '52px' }} />
                        </colgroup>
                        <thead className="sticky top-0 z-10 bg-gray-50">
                            <tr className="border-b border-gray-200 text-[11px] font-black text-gray-500" style={{ height: GANTT_ROW_H }}>
                                <th className="px-3 text-left font-black align-middle">작업 이름</th>
                                <th className="px-2 text-center font-black align-middle">담당자</th>
                                <th className="px-2 text-center font-black align-middle">시작일</th>
                                <th className="px-2 text-center font-black align-middle">종료일</th>
                                <th className="px-2 text-center font-black align-middle">진행률</th>
                            </tr>
                        </thead>
                        <tbody>
                            {flatTasks.map(task => {
                                const isParent = tasks.some(t => t.parentId === task.id);
                                const isCollapsed = collapsed.has(task.id);
                                return (
                                    <tr key={task.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors" style={{ height: GANTT_ROW_H }}>
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
                                                <span className={`truncate text-gray-800 ${isParent ? 'font-bold' : 'font-medium'}`}>{task.title}</span>
                                            </div>
                                        </td>
                                        <td className="px-2 text-center text-gray-600 truncate align-middle">{task.assignee}</td>
                                        <td className="px-2 text-center text-gray-500 whitespace-nowrap align-middle">{task.startDate}</td>
                                        <td className="px-2 text-center text-gray-500 whitespace-nowrap align-middle">{task.endDate}</td>
                                        <td className="px-2 text-center font-black whitespace-nowrap align-middle" style={{ color: task.color || '#6366f1' }}>{task.progress}%</td>
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
                        <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10" style={{ height: GANTT_ROW_H }}>
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
                        <div className="relative" style={{ height: flatTasks.length * GANTT_ROW_H }}>
                            {hierarchyLines.length > 0 && (
                                <svg
                                    className="absolute inset-0 pointer-events-none z-[8]"
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
                        {flatTasks.map(task => (
                            <div key={task.id} className="relative border-b border-gray-100 hover:bg-gray-50/50"
                                style={{ height: GANTT_ROW_H }}>
                                {/* 오늘 선 */}
                                <div className="absolute top-0 bottom-0 w-px bg-rose-400 z-10 opacity-40"
                                    style={{ left: daysBetween(chartStart, new Date()) * DAY_W }} />
                                {task.parentId && (
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-[9]"
                                        style={{
                                            left: getLeft(task.startDate) - 5,
                                            width: 0,
                                            height: 0,
                                            borderTop: '3px solid transparent',
                                            borderBottom: '3px solid transparent',
                                            borderLeft: '4px solid #94a3b8',
                                        }}
                                    />
                                )}
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 rounded-md flex items-center overflow-hidden cursor-pointer z-10 hover:brightness-95 transition-all"
                                    style={{
                                        left: getLeft(task.startDate),
                                        width: getWidth(task.startDate, task.endDate),
                                        height: 20,
                                        backgroundColor: (task.color || '#6366f1') + '30',
                                        border: `1px solid ${task.color || '#6366f1'}60`,
                                    }}
                                    onClick={() => onTaskClick?.(task.id)}
                                    title={task.title}
                                >
                                    <div className="h-full rounded-l-md transition-all"
                                        style={{ width: `${task.progress}%`, backgroundColor: task.color || '#6366f1' }} />
                                    <span className="absolute left-1 text-[9px] font-black text-gray-700 truncate"
                                        style={{ maxWidth: getWidth(task.startDate, task.endDate) - 8 }}>
                                        {task.progress}%
                                    </span>
                                </div>
                            </div>
                        ))}
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

// ── 메인 캔버스 ───────────────────────────────────────────────────────────
const PersonalScheduleCanvas: React.FC = () => {
    const { projects, setCurrentProject } = useProjectStore();

    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [tab, setTab] = useState<TabMode>('calendar');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [weekStart, setWeekStart] = useState(() => startOfDay(new Date()));
    const [events, setEvents] = useState<ScheduleEvent[]>(SEED_SCHEDULE);
    const [todos, setTodos]   = useState<TodoItem[]>(SEED_TODOS);

    // 카테고리 관리
    const [categories, setCategories] = useState<Record<string, CategoryDef>>(DEFAULT_CATEGORIES);
    const [visibleCats, setVisibleCats] = useState<Set<CategoryKey>>(new Set(Object.keys(DEFAULT_CATEGORIES)));

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
    const [panelOpen, setPanelOpen] = useState(false);
    const [calendarScrollHour, setCalendarScrollHour] = useState<number | null>(null);

    const filteredEvents = useMemo(() =>
        events.filter(e => visibleCats.has(e.category)),
        [events, visibleCats]);

    const ganttTasks = useMemo(
        () => filteredEvents.map(e => eventToGanttTask(e, categories)),
        [filteredEvents, categories]
    );

    const eventDates = useMemo(() => new Set(filteredEvents.map(e => e.startDate)), [filteredEvents]);

    const handleSaveEvent = useCallback((e: ScheduleEvent) => {
        setEvents(prev => prev.some(x => x.id === e.id) ? prev.map(x => x.id === e.id ? e : x) : [...prev, e]);
        setPanelOpen(false);
    }, []);

    const handleDeleteEvent = useCallback((id: string) => {
        setEvents(prev => prev.filter(e => e.id !== id && e.parentId !== id));
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
        setEvents(prev => prev.map(e => (e.id === id ? { ...e, ...ganttPatchToEvent(patch) } : e)));
    }, []);

    const handleDeleteGanttTask = useCallback((id: string) => {
        setEvents(prev => prev.filter(e => e.id !== id && e.parentId !== id));
    }, []);

    const handleGanttTaskClick = useCallback((taskId: string) => {
        const ev = events.find(e => e.id === taskId);
        if (!ev) return;
        const d = startOfDay(parseDate(ev.startDate.replace(/\./g, '-')));
        setViewMode('week');
        setWeekStart(d);
        setSelectedDate(d);
        if (!ev.allDay && ev.startTime) {
            const h = parseInt(ev.startTime.split(':')[0], 10);
            setCalendarScrollHour(Number.isNaN(h) ? null : h);
        } else {
            setCalendarScrollHour(null);
        }
    }, [events]);

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
                    <button onClick={() => { setPanelEvent(null); setPanelOpen(true); }}
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
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    {/* 캘린더 뷰 (상단 60%) */}
                                    <div className="flex flex-col bg-white" style={{ flex: '0 0 50%', minHeight: 0, overflow: 'hidden' }}>
                                        {viewMode === 'week' && (
                                            <WeekView weekStart={weekStart} events={filteredEvents}
                                                onSelectEvent={e => { setPanelEvent(e); setPanelOpen(true); }}
                                                onSlotClick={(date, time) => openNewEvent(date, time)}
                                                onAllDayClick={date => openNewEvent(date, undefined, { allDay: true })}
                                                categories={categories}
                                                scrollToHour={calendarScrollHour}
                                                onScrollHourDone={() => setCalendarScrollHour(null)}
                                                onNavigate={dir => {
    const delta = dir === 'next' ? 1 : -1;
    setWeekStart(d => addDays(d, delta));
    setSelectedDate(d => addDays(d, delta));
}} />
                                        )}
                                        {viewMode === 'month' && (
                                            <MonthView month={selectedDate} events={filteredEvents}
                                                onSelectEvent={e => { setPanelEvent(e); setPanelOpen(true); }}
                                                onDayClick={ymd => openNewEvent(ymd, '09:00')}
                                                categories={categories}
                                                onNavigate={dir => {
                                                    const d = new Date(selectedDate);
                                                    d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
                                                    setSelectedDate(d);
                                                }} />
                                        )}
                                        {viewMode === 'day' && (
                                            <DayView date={selectedDate} events={filteredEvents}
                                                onSelectEvent={e => { setPanelEvent(e); setPanelOpen(true); }}
                                                onSlotClick={(date, time) => openNewEvent(date, time)}
                                                categories={categories}
                                                onNavigate={dir => {
                                                    setSelectedDate(d => addDays(d, dir === 'next' ? 1 : -1));
                                                }} />
                                        )}
                                    </div>

                                    {/* 구분선 */}
                                    <div className="shrink-0 h-px bg-gray-200" />

                                    {/* 간트 차트 (하단 40%) */}
                                    <div className="flex flex-col bg-white" style={{ flex: '0 0 50%', minHeight: 0, overflow: 'hidden' }}>
                                        <GanttView tasks={ganttTasks} onAddTask={handleAddTask}
                                            onUpdateTask={handleUpdateGanttTask}
                                            onDeleteTask={handleDeleteGanttTask}
                                            onTaskClick={handleGanttTaskClick}
                                            weekStart={weekStart}
                                            onWeekChange={ws => { const d = startOfDay(ws); setWeekStart(d); setSelectedDate(d); }} />
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
                                    key={panelEvent?.id ?? `new-${panelEvent?.startDate ?? ''}-${panelEvent?.startTime ?? ''}-${panelEvent?.allDay ? '1' : '0'}`}
                                    event={panelEvent}
                                    onSave={handleSaveEvent}
                                    onDelete={handleDeleteEvent}
                                    onClose={() => setPanelOpen(false)}
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
