import React, { useState, useMemo, useCallback } from 'react';
import {
    ChevronLeft, ChevronRight, Plus, X, Check, Trash2,
    Calendar,
    ChevronDown, ArrowLeft,
} from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';

// ── 타입 ──────────────────────────────────────────────────────────────────
type ViewMode = 'day' | 'week' | 'month';
type TabMode = 'calendar' | 'gantt' | 'todo';
type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type CategoryKey = 'work' | 'personal' | 'meeting' | 'deadline';

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
const CATEGORY: Record<CategoryKey, { label: string; color: string; bg: string; light: string }> = {
    work:     { label: '업무 일정', color: '#3b82f6', bg: 'bg-blue-500',   light: 'bg-blue-100 text-blue-700 border-blue-200' },
    personal: { label: '개인 일정', color: '#10b981', bg: 'bg-emerald-500', light: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    meeting:  { label: '회의',      color: '#8b5cf6', bg: 'bg-violet-500',  light: 'bg-violet-100 text-violet-700 border-violet-200' },
    deadline: { label: '마감일',    color: '#ef4444', bg: 'bg-red-500',     light: 'bg-red-100 text-red-700 border-red-200' },
};

const GANTT_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const pad = (n: number) => String(n).padStart(2, '0');
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const diffDays = (a: string, b: string) => Math.max(0, Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000) + 1);
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

function genId() { return Math.random().toString(36).slice(2, 10); }

// ── SEED 데이터 ───────────────────────────────────────────────────────────
const today = new Date();
const SEED_EVENTS: ScheduleEvent[] = [
    { id: 'e1', title: '팀 주간 회의', category: 'meeting', startDate: toYMD(today), startTime: '10:00', endDate: toYMD(today), endTime: '11:00', allDay: false, repeat: 'weekly', description: '주간 업무 공유 및 이슈 논의' },
    { id: 'e2', title: '개인 운동', category: 'personal', startDate: toYMD(addDays(today, 1)), startTime: '07:00', endDate: toYMD(addDays(today, 1)), endTime: '08:00', allDay: false, repeat: 'daily' },
    { id: 'e3', title: '클라이언트 미팅', category: 'work', startDate: toYMD(addDays(today, 2)), startTime: '14:00', endDate: toYMD(addDays(today, 2)), endTime: '15:00', allDay: false, repeat: 'none' },
    { id: 'e4', title: 'UI 디자인 마감', category: 'deadline', startDate: toYMD(addDays(today, 3)), startTime: '17:00', endDate: toYMD(addDays(today, 3)), endTime: '17:00', allDay: false, repeat: 'none' },
];

const SEED_TASKS: GanttTask[] = [
    { id: 't1', title: '1. 프로젝트 착수', assignee: '김관리', startDate: toYMD(today), endDate: toYMD(addDays(today, 7)), progress: 100, color: GANTT_COLORS[0] },
    { id: 't1-1', title: '1.1 요구사항 정의', assignee: '김관리', startDate: toYMD(today), endDate: toYMD(addDays(today, 3)), progress: 100, parentId: 't1', color: GANTT_COLORS[0] },
    { id: 't1-2', title: '1.2 프로젝트 계획 수립', assignee: '박기획', startDate: toYMD(addDays(today, 3)), endDate: toYMD(addDays(today, 7)), progress: 100, parentId: 't1', color: GANTT_COLORS[0] },
    { id: 't2', title: '2. 설계', assignee: '이개발', startDate: toYMD(addDays(today, 8)), endDate: toYMD(addDays(today, 16)), progress: 75, color: GANTT_COLORS[1] },
    { id: 't2-1', title: '2.1 시스템 설계', assignee: '이개발', startDate: toYMD(addDays(today, 8)), endDate: toYMD(addDays(today, 11)), progress: 100, parentId: 't2', color: GANTT_COLORS[1] },
    { id: 't2-2', title: '2.2 화면 설계', assignee: '최디자인', startDate: toYMD(addDays(today, 12)), endDate: toYMD(addDays(today, 14)), progress: 60, parentId: 't2', color: GANTT_COLORS[1] },
    { id: 't3', title: '3. 개발', assignee: '이개발', startDate: toYMD(addDays(today, 17)), endDate: toYMD(addDays(today, 30)), progress: 45, color: GANTT_COLORS[2] },
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
}> = ({ current, selected, onSelect, eventDates }) => {
    const [view, setView] = useState(new Date(current.getFullYear(), current.getMonth(), 1));
    const year = view.getFullYear(); const month = view.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))];

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
                    const isToday = toYMD(d) === toYMD(new Date());
                    const isSelected = toYMD(d) === toYMD(selected);
                    const hasEvent = eventDates.has(ymd);
                    return (
                        <button key={ymd} onClick={() => onSelect(d)}
                            className={`text-[11px] font-bold rounded-full w-6 h-6 mx-auto flex items-center justify-center relative transition-colors
                                ${isSelected ? 'bg-rose-500 text-white' : isToday ? 'bg-rose-100 text-rose-600' : 'hover:bg-gray-100 text-gray-700'}`}>
                            {d.getDate()}
                            {hasEvent && !isSelected && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-rose-400" />}
                        </button>
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
}> = ({ event, onSave, onDelete, onClose, projects }) => {
    const isNew = !event?.id;
    const [title, setTitle] = useState(event?.title || '');
    const [category, setCategory] = useState<CategoryKey>(event?.category || 'work');
    const [startDate, setStartDate] = useState(event?.startDate || toYMD(new Date()));
    const [startTime, setStartTime] = useState(event?.startTime || '09:00');
    const [endDate] = useState(event?.endDate || toYMD(new Date()));
    const [endTime, setEndTime] = useState(event?.endTime || '10:00');
    const [allDay, setAllDay] = useState(event?.allDay ?? false);
    const [repeat, setRepeat] = useState<RepeatType>(event?.repeat || 'none');
    const [alarm, setAlarm] = useState(event?.alarm || '15분 전');
    const [description, setDescription] = useState(event?.description || '');
    const [projectId, setProjectId] = useState(event?.projectId || '');
    const [activeTab, setActiveTab] = useState<'schedule' | 'task'>('schedule');

    const handleSave = () => {
        if (!title.trim()) return;
        onSave({ id: event?.id || genId(), title: title.trim(), category, startDate, startTime, endDate, endTime, allDay, repeat, alarm, description, projectId: projectId || undefined });
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <span className="text-sm font-black text-gray-800">일정 / 작업 정보</span>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400"><X size={16} /></button>
            </div>

            {/* 탭 */}
            <div className="flex border-b border-gray-100">
                {(['schedule', 'task'] as const).map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                        className={`flex-1 py-2.5 text-xs font-bold transition-colors ${activeTab === t ? 'border-b-2 border-rose-500 text-rose-600' : 'text-gray-400 hover:text-gray-600'}`}>
                        {t === 'schedule' ? '일정 정보' : '작업 정보'}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 제목 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">제목 *</label>
                    <input value={title} onChange={e => setTitle(e.target.value)}
                        placeholder="일정 제목 입력"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50" />
                </div>

                {/* 구분 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">구분</label>
                    <select value={category} onChange={e => setCategory(e.target.value as CategoryKey)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50">
                        {(Object.entries(CATEGORY) as [CategoryKey, typeof CATEGORY[CategoryKey]][]).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                        ))}
                    </select>
                </div>

                {/* 일정 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">일정</label>
                    <div className="flex items-center gap-2">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                            className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50" />
                        {!allDay && <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                            className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50" />}
                    </div>
                    {!allDay && (
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400 w-4">~</span>
                            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                                className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50" />
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

                {/* 반복 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">반복</label>
                    <select value={repeat} onChange={e => setRepeat(e.target.value as RepeatType)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50">
                        <option value="none">반복 안함</option>
                        <option value="daily">매일</option>
                        <option value="weekly">매주</option>
                        <option value="monthly">매월</option>
                        <option value="yearly">매년</option>
                    </select>
                </div>

                {/* 알림 */}
                <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">알림</label>
                    <select value={alarm} onChange={e => setAlarm(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-rose-400 bg-gray-50">
                        {['5분 전','10분 전','15분 전','30분 전','1시간 전','1일 전'].map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>
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
}> = ({ weekStart, events, onSelectEvent, onSlotClick }) => {
    const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 ~ 20:00
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
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

    const getAllDayEvents = (date: Date) => {
        const ymd = toYMD(date);
        return events.filter(e => e.allDay && e.startDate <= ymd && e.endDate >= ymd);
    };

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* 헤더 */}
            <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: '56px repeat(7,1fr)' }}>
                <div />
                {days.map((d, i) => {
                    const isToday = toYMD(d) === toYMD(new Date());
                    return (
                        <div key={i} className={`text-center py-2 border-l border-gray-100 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                            <div className="text-[10px] font-bold text-gray-400">{DAY_LABELS[i]}</div>
                            <div className={`text-sm font-black w-7 h-7 mx-auto flex items-center justify-center rounded-full ${isToday ? 'bg-rose-500 text-white' : ''}`}>
                                {d.getDate()}
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* 종일 이벤트 행 */}
            <div className="grid border-b border-gray-100 min-h-[28px]" style={{ gridTemplateColumns: '56px repeat(7,1fr)' }}>
                <div className="text-[10px] text-gray-400 px-1 pt-1 text-right">종일</div>
                {days.map((d, i) => {
                    const ae = getAllDayEvents(d);
                    return (
                        <div key={i} className="border-l border-gray-100 px-0.5 py-0.5 space-y-0.5">
                            {ae.map(e => (
                                <div key={e.id} onClick={() => onSelectEvent(e)}
                                    className="text-[10px] font-bold px-1 py-0.5 rounded cursor-pointer truncate text-white"
                                    style={{ backgroundColor: CATEGORY[e.category].color }}>
                                    {e.title}
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
            {/* 시간 그리드 */}
            <div className="flex-1 overflow-y-auto">
                {hours.map(h => (
                    <div key={h} className="grid" style={{ gridTemplateColumns: '56px repeat(7,1fr)', height: 56 }}>
                        <div className="text-[10px] text-gray-400 text-right pr-2 -mt-2 shrink-0">{pad(h)}:00</div>
                        {days.map((d, i) => {
                            const slotEvents = getEventsForSlot(d, h);
                            return (
                                <div key={i} className="border-l border-t border-gray-100 relative cursor-pointer hover:bg-rose-50/30 transition-colors"
                                    onClick={() => onSlotClick(toYMD(d), `${pad(h)}:00`)}>
                                    {slotEvents.map(e => (
                                        <div key={e.id} onClick={ev => { ev.stopPropagation(); onSelectEvent(e); }}
                                            className="absolute inset-x-0.5 top-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white cursor-pointer z-10 overflow-hidden"
                                            style={{ backgroundColor: CATEGORY[e.category].color, minHeight: 28 }}>
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
}> = ({ month, events, onSelectEvent, onDayClick }) => {
    const year = month.getFullYear(); const m = month.getMonth();
    const firstDay = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, m, i + 1))];
    while (cells.length % 7 !== 0) cells.push(null);

    return (
        <div className="flex-1 overflow-auto">
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
                                        style={{ backgroundColor: CATEGORY[e.category].color }}>
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
}> = ({ date, events, onSelectEvent, onSlotClick }) => {
    const hours = Array.from({ length: 17 }, (_, i) => i + 6);
    const ymd = toYMD(date);
    const dayEvents = events.filter(e => e.startDate === ymd && !e.allDay);

    return (
        <div className="flex-1 overflow-y-auto">
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
                                    style={{ backgroundColor: CATEGORY[e.category].color }}>
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
}> = ({ tasks, onAddTask }) => {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const allDates = tasks.flatMap(t => [t.startDate, t.endDate]).sort();
    const chartStart = allDates[0] ? addDays(parseDate(allDates[0]), -3) : addDays(new Date(), -3);
    const chartEnd   = allDates[allDates.length - 1] ? addDays(parseDate(allDates[allDates.length - 1]), 5) : addDays(new Date(), 30);
    const totalDays  = diffDays(toYMD(chartStart), toYMD(chartEnd));
    const DAY_W = 20;

    const flatTasks = tasks.filter(t => {
        if (!t.parentId) return true;
        return !collapsed.has(t.parentId);
    });

    const getLeft = (date: string) => diffDays(toYMD(chartStart), date) * DAY_W;
    const getWidth = (start: string, end: string) => Math.max(DAY_W, diffDays(start, end) * DAY_W);

    const dateHeaders: Date[] = [];
    for (let i = 0; i < totalDays; i++) dateHeaders.push(addDays(chartStart, i));

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
                <span className="text-xs font-black text-gray-700">간트 차트</span>
                <button onClick={onAddTask}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-600 transition-colors">
                    <Plus size={12} /> 작업 추가
                </button>
            </div>
            <div className="flex flex-1 overflow-hidden">
                {/* 좌측 작업 목록 */}
                <div className="w-[420px] shrink-0 border-r border-gray-200 overflow-auto">
                    <div className="grid text-[11px] font-black text-gray-500 bg-gray-50 border-b border-gray-200 sticky top-0 z-10"
                        style={{ gridTemplateColumns: '1fr 80px 90px 90px 60px' }}>
                        <div className="px-3 py-2">작업 이름</div>
                        <div className="px-2 py-2 text-center">담당자</div>
                        <div className="px-2 py-2 text-center">시작일</div>
                        <div className="px-2 py-2 text-center">종료일</div>
                        <div className="px-2 py-2 text-center">진행률</div>
                    </div>
                    {flatTasks.map(task => {
                        const isParent = tasks.some(t => t.parentId === task.id);
                        const isCollapsed = collapsed.has(task.id);
                        return (
                            <div key={task.id} className={`grid border-b border-gray-100 hover:bg-gray-50 transition-colors text-xs group`}
                                style={{ gridTemplateColumns: '1fr 80px 90px 90px 60px' }}>
                                <div className="px-3 py-2 flex items-center gap-1" style={{ paddingLeft: task.parentId ? 24 : 12 }}>
                                    {isParent && (
                                        <button onClick={() => setCollapsed(prev => {
                                            const n = new Set(prev); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n;
                                        })} className="shrink-0 text-gray-400 hover:text-gray-700">
                                            {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                                        </button>
                                    )}
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.color || '#6366f1' }} />
                                    <span className={`truncate font-bold text-gray-800 ${isParent ? '' : 'font-medium'}`}>{task.title}</span>
                                </div>
                                <div className="px-2 py-2 text-center text-gray-600 truncate">{task.assignee}</div>
                                <div className="px-2 py-2 text-center text-gray-500">{task.startDate}</div>
                                <div className="px-2 py-2 text-center text-gray-500">{task.endDate}</div>
                                <div className="px-2 py-2 text-center font-black" style={{ color: task.color || '#6366f1' }}>{task.progress}%</div>
                            </div>
                        );
                    })}
                </div>
                {/* 우측 타임라인 */}
                <div className="flex-1 overflow-auto">
                    {/* 날짜 헤더 */}
                    <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
                        {dateHeaders.map((d, i) => {
                            const isToday = toYMD(d) === toYMD(new Date());
                            return (
                                <div key={i} className={`text-center text-[9px] font-bold border-l border-gray-100 shrink-0 py-1
                                    ${isToday ? 'bg-rose-50 text-rose-500' : d.getDay() === 0 ? 'text-red-400 bg-red-50/30' : d.getDay() === 6 ? 'text-blue-400 bg-blue-50/30' : 'text-gray-400'}`}
                                    style={{ width: DAY_W }}>
                                    {d.getDate()}
                                </div>
                            );
                        })}
                    </div>
                    {/* 바 */}
                    {flatTasks.map(task => (
                        <div key={task.id} className="relative border-b border-gray-100 hover:bg-gray-50/50"
                            style={{ height: 33, width: totalDays * DAY_W }}>
                            {/* 오늘 선 */}
                            <div className="absolute top-0 bottom-0 w-px bg-rose-400 z-10 opacity-40"
                                style={{ left: diffDays(toYMD(chartStart), toYMD(new Date())) * DAY_W }} />
                            <div className="absolute top-1/2 -translate-y-1/2 rounded-md flex items-center overflow-hidden"
                                style={{
                                    left: getLeft(task.startDate),
                                    width: getWidth(task.startDate, task.endDate),
                                    height: 18,
                                    backgroundColor: (task.color || '#6366f1') + '30',
                                    border: `1px solid ${task.color || '#6366f1'}60`,
                                }}>
                                <div className="h-full rounded-l-md transition-all"
                                    style={{ width: `${task.progress}%`, backgroundColor: task.color || '#6366f1' }} />
                                <span className="absolute left-1 text-[9px] font-black text-gray-700 truncate" style={{ maxWidth: getWidth(task.startDate, task.endDate) - 8 }}>
                                    {task.progress}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {/* 범례 */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 shrink-0">
                {GANTT_COLORS.map((c, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
                        <span className="text-[10px] text-gray-500 font-bold">카테고리 {i + 1}</span>
                    </div>
                ))}
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
}> = ({ todos, onToggle, onAdd, onDelete }) => {
    const [newTitle, setNewTitle] = useState('');
    const [newCategory, setNewCategory] = useState<CategoryKey>('work');
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
                <select value={newCategory} onChange={e => setNewCategory(e.target.value as CategoryKey)}
                    className="text-xs border border-gray-200 rounded-xl px-2 py-1 bg-white outline-none">
                    {(Object.entries(CATEGORY) as [CategoryKey, typeof CATEGORY[CategoryKey]][]).map(([k, v]) => (
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
                    {pending.map(t => (
                        <div key={t.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-2xl hover:border-gray-200 transition-colors group">
                            <button onClick={() => onToggle(t.id)} className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-rose-400 transition-colors shrink-0 flex items-center justify-center" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-gray-800 truncate">{t.title}</div>
                                {t.dueDate && <div className="text-[10px] text-gray-400">{t.dueDate}</div>}
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CATEGORY[t.category].light}`}>{CATEGORY[t.category].label}</span>
                            <button onClick={() => onDelete(t.id)} className="p-1 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={12} /></button>
                        </div>
                    ))}
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
    const [weekStart, setWeekStart] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d;
    });
    const [events, setEvents] = useState<ScheduleEvent[]>(SEED_EVENTS);
    const [tasks, setTasks]   = useState<GanttTask[]>(SEED_TASKS);
    const [todos, setTodos]   = useState<TodoItem[]>(SEED_TODOS);

    // 카테고리 필터
    const [visibleCats, setVisibleCats] = useState<Set<CategoryKey>>(new Set(['work','personal','meeting','deadline']));
    const [myOnly, setMyOnly] = useState(false);

    // 우측 패널
    const [panelEvent, setPanelEvent] = useState<Partial<ScheduleEvent> | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);

    const filteredEvents = useMemo(() =>
        events.filter(e => visibleCats.has(e.category)),
        [events, visibleCats]);

    const eventDates = useMemo(() => new Set(filteredEvents.map(e => e.startDate)), [filteredEvents]);

    const handleSaveEvent = useCallback((e: ScheduleEvent) => {
        setEvents(prev => prev.some(x => x.id === e.id) ? prev.map(x => x.id === e.id ? e : x) : [...prev, e]);
        setPanelOpen(false);
    }, []);

    const handleDeleteEvent = useCallback((id: string) => {
        setEvents(prev => prev.filter(e => e.id !== id));
        setPanelOpen(false);
    }, []);

    const openNewEvent = (date: string, time?: string) => {
        setPanelEvent({ startDate: date, startTime: time, endDate: date, endTime: time ? `${pad(parseInt(time.split(':')[0]) + 1)}:00` : undefined });
        setPanelOpen(true);
    };

    // 주 이동
    const prevWeek = () => setWeekStart(d => addDays(d, -7));
    const nextWeek = () => setWeekStart(d => addDays(d, 7));
    const goToday  = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); setWeekStart(d); setSelectedDate(new Date()); };

    const weekEnd = addDays(weekStart, 6);

    // 간트 작업
    const handleAddTask = () => {
        const newTask: GanttTask = { id: genId(), title: '새 작업', assignee: '', startDate: toYMD(new Date()), endDate: toYMD(addDays(new Date(), 7)), progress: 0, color: GANTT_COLORS[tasks.length % GANTT_COLORS.length] };
        setTasks(prev => [...prev, newTask]);
    };

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
                        {weekStart.getFullYear()}.{pad(weekStart.getMonth()+1)}.{pad(weekStart.getDate())} (일) ~ {pad(weekEnd.getMonth()+1)}.{pad(weekEnd.getDate())} (토)
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
                        <MiniCalendar current={selectedDate} selected={selectedDate} onSelect={d => { setSelectedDate(d); const ws = new Date(d); ws.setDate(d.getDate() - d.getDay()); setWeekStart(ws); }} eventDates={eventDates} />
                    </div>

                    <div className="px-4 pb-3">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">캘린더 색상</div>
                        <div className="space-y-1.5">
                            {(Object.entries(CATEGORY) as [CategoryKey, typeof CATEGORY[CategoryKey]][]).map(([k, v]) => (
                                <button key={k} onClick={() => setVisibleCats(prev => {
                                    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
                                })} className="flex items-center gap-2 w-full text-left">
                                    <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${visibleCats.has(k) ? '' : 'opacity-30'}`}
                                        style={{ backgroundColor: v.color }}>
                                        {visibleCats.has(k) && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className="text-xs font-bold text-gray-700">{v.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="px-4 pb-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-600">내 일정만 보기</span>
                            <button onClick={() => setMyOnly(v => !v)}
                                className={`w-9 h-5 rounded-full transition-colors ${myOnly ? 'bg-rose-500' : 'bg-gray-200'}`}>
                                <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${myOnly ? 'translate-x-4' : ''}`} />
                            </button>
                        </div>
                    </div>

                    <div className="px-4 pb-3 mt-auto">
                        <button className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                            <Calendar size={13} className="text-rose-400" />
                            구글 캘린더 연동
                        </button>
                    </div>
                </div>

                {/* 메인 영역 */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* 탭 */}
                    <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-gray-100 bg-white shrink-0">
                        {([['calendar','캘린더'], ['gantt','간트 차트'], ['todo','할 일 목록']] as [TabMode, string][]).map(([t, label]) => (
                            <button key={t} onClick={() => setTab(t)}
                                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${tab === t ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* 탭 콘텐츠 */}
                    <div className="flex-1 overflow-hidden flex">
                        <div className="flex-1 overflow-hidden flex flex-col bg-white">
                            {tab === 'calendar' && viewMode === 'week' && (
                                <WeekView weekStart={weekStart} events={filteredEvents}
                                    onSelectEvent={e => { setPanelEvent(e); setPanelOpen(true); }}
                                    onSlotClick={(date, time) => openNewEvent(date, time)} />
                            )}
                            {tab === 'calendar' && viewMode === 'month' && (
                                <MonthView month={selectedDate} events={filteredEvents}
                                    onSelectEvent={e => { setPanelEvent(e); setPanelOpen(true); }}
                                    onDayClick={ymd => { setSelectedDate(parseDate(ymd)); setViewMode('day'); }} />
                            )}
                            {tab === 'calendar' && viewMode === 'day' && (
                                <DayView date={selectedDate} events={filteredEvents}
                                    onSelectEvent={e => { setPanelEvent(e); setPanelOpen(true); }}
                                    onSlotClick={(date, time) => openNewEvent(date, time)} />
                            )}
                            {tab === 'gantt' && (
                                <GanttView tasks={tasks} onAddTask={handleAddTask}
                                    onUpdateTask={(id, p) => setTasks(prev => prev.map(t => t.id === id ? { ...t, ...p } : t))}
                                    onDeleteTask={id => setTasks(prev => prev.filter(t => t.id !== id))} />
                            )}
                            {tab === 'todo' && (
                                <TodoView todos={todos}
                                    onToggle={id => setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))}
                                    onAdd={item => setTodos(prev => [...prev, { ...item, id: genId() }])}
                                    onDelete={id => setTodos(prev => prev.filter(t => t.id !== id))} />
                            )}
                        </div>

                        {/* 우측 일정 정보 패널 */}
                        {panelOpen && (
                            <div className="w-72 shrink-0 border-l border-gray-100 bg-white flex flex-col overflow-hidden">
                                <EventForm
                                    event={panelEvent}
                                    onSave={handleSaveEvent}
                                    onDelete={handleDeleteEvent}
                                    onClose={() => setPanelOpen(false)}
                                    projects={projects.map(p => ({ id: p.id, name: p.name }))}
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
