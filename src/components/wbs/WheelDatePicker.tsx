import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import {
    addMonths, eachDayOfInterval, endOfMonth, format, isToday, startOfMonth, subMonths,
} from 'date-fns';
import type { AssigneeMenuDateRange } from './wbsDateUtils';

// ── 상수 ──────────────────────────────────────────────────────────────────
const ITEM_H = 36; // px per row
const VISIBLE = 5; // rows visible (must be odd)
const CENTER = Math.floor(VISIBLE / 2); // index of center row
const POPUP_GAP = 4;
const VIEWPORT_PAD = 8;

function computeWheelPopupPosition(
    trigger: HTMLElement,
    popup: HTMLElement | null,
    minW: number,
    fallbackH = 320,
) {
    const rect = trigger.getBoundingClientRect();
    let left = rect.left;
    if (left + minW > window.innerWidth - VIEWPORT_PAD) {
        left = Math.max(VIEWPORT_PAD, window.innerWidth - minW - VIEWPORT_PAD);
    }

    const popupH = popup?.offsetHeight || fallbackH;
    const spaceBelow = window.innerHeight - VIEWPORT_PAD - rect.bottom - POPUP_GAP;
    const spaceAbove = rect.top - VIEWPORT_PAD - POPUP_GAP;
    const fitsBelow = spaceBelow >= popupH;
    const fitsAbove = spaceAbove >= popupH;

    let top: number;
    if (fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove)) {
        top = rect.bottom + POPUP_GAP;
        if (top + popupH > window.innerHeight - VIEWPORT_PAD) {
            top = Math.max(VIEWPORT_PAD, window.innerHeight - VIEWPORT_PAD - popupH);
        }
    } else {
        top = rect.top - POPUP_GAP - popupH;
        if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;
    }

    return { top, left };
}

function useWheelPopupPosition(
    open: boolean,
    triggerRef: React.RefObject<HTMLElement | null>,
    popupRef: React.RefObject<HTMLDivElement | null>,
    minW: number,
    fallbackH = 320,
) {
    const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

    const updatePopupPos = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        setPopupPos(computeWheelPopupPosition(trigger, popupRef.current, minW, fallbackH));
    }, [triggerRef, popupRef, minW, fallbackH]);

    useLayoutEffect(() => {
        if (!open) return;
        updatePopupPos();
        const raf = requestAnimationFrame(updatePopupPos);
        return () => cancelAnimationFrame(raf);
    }, [open, updatePopupPos, minW, fallbackH]);

    useEffect(() => {
        if (!open) return;
        window.addEventListener('scroll', updatePopupPos, true);
        window.addEventListener('resize', updatePopupPos);
        return () => {
            window.removeEventListener('scroll', updatePopupPos, true);
            window.removeEventListener('resize', updatePopupPos);
        };
    }, [open, updatePopupPos]);

    return popupPos;
}

function range(start: number, end: number) {
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function daysInMonth(year: number, month: number) {
    return new Date(year, month, 0).getDate();
}

/** 타이핑 중 숫자만 받아 YYYY-MM-DD 형태로 자동 포맷.
 *  autoTrailSep=false(삭제 중)이면 끝 `-`를 자동으로 붙이지 않아 백스페이스로 월/일 수정 가능 */
function formatDateInput(raw: string, autoTrailSep = true): string {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length === 0) return '';

    const y = digits.slice(0, 4);
    if (digits.length <= 4) {
        return digits.length === 4 && autoTrailSep ? `${y}-` : y;
    }

    const mDigits = digits.slice(4, 6);
    let monthStr: string;
    let sepAfterMonth = '';

    if (mDigits.length === 1) {
        const m1 = parseInt(mDigits, 10);
        // 월 한 자리(2~9)는 0 패딩 후 구분자 추가
        if (m1 >= 2 && m1 <= 9) {
            monthStr = `0${mDigits}`;
            sepAfterMonth = autoTrailSep ? '-' : '';
        } else {
            monthStr = mDigits;
        }
    } else {
        monthStr = mDigits;
        sepAfterMonth = autoTrailSep ? '-' : '';
    }

    const result = `${y}-${monthStr}${sepAfterMonth}`;
    if (digits.length <= 6) return result;

    const dDigits = digits.slice(6, 8);
    if (dDigits.length === 1) {
        const d1 = parseInt(dDigits, 10);
        // 일 한 자리(4~9)는 0 패딩
        if (d1 >= 4 && d1 <= 9) {
            return `${y}-${monthStr}-0${dDigits}`;
        }
        return `${y}-${monthStr}-${dDigits}`;
    }
    return `${y}-${monthStr}-${dDigits}`;
}

// ── WheelColumn ───────────────────────────────────────────────────────────
interface WheelColumnProps {
    items: number[];
    selected: number;
    onSelect: (v: number) => void;
    format?: (v: number) => string;
}

const WheelColumn: React.FC<WheelColumnProps> = ({ items, selected, onSelect, format }) => {
    const ref = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const startY = useRef(0);
    const startOffset = useRef(0);
    const [offset, setOffset] = useState(0); // drag offset in px

    // selected 변경 시 스크롤 위치 동기화
    const selectedIndex = items.indexOf(selected);

    // 드래그로 가장 가까운 아이템을 snap
    const snapTo = useCallback((idx: number) => {
        const clamped = Math.max(0, Math.min(items.length - 1, idx));
        onSelect(items[clamped]);
        setOffset(0);
    }, [items, onSelect]);

    // wheel 이벤트
    const onWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? 1 : -1;
        const newIdx = Math.max(0, Math.min(items.length - 1, selectedIndex + delta));
        onSelect(items[newIdx]);
    }, [selectedIndex, items, onSelect]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [onWheel]);

    // 터치 / 마우스 드래그
    const onPointerDown = (e: React.PointerEvent) => {
        isDragging.current = true;
        startY.current = e.clientY;
        startOffset.current = 0;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        const dy = e.clientY - startY.current;
        setOffset(dy);
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        const dy = e.clientY - startY.current;
        const delta = -Math.round(dy / ITEM_H);
        snapTo(selectedIndex + delta);
    };

    // translateY: center가 selected에 오도록
    const baseTranslate = (CENTER - selectedIndex) * ITEM_H + offset;

    return (
        <div
            ref={ref}
            className="relative flex flex-col items-center select-none cursor-ns-resize overflow-hidden"
            style={{ height: VISIBLE * ITEM_H, width: 72 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            {/* 선택 하이라이트 */}
            <div
                className="absolute left-0 right-0 rounded-lg bg-emerald-50 border border-emerald-200 pointer-events-none z-10"
                style={{ top: CENTER * ITEM_H, height: ITEM_H }}
            />

            {/* 위아래 그라데이션 */}
            <div className="absolute inset-0 pointer-events-none z-20"
                style={{ background: 'linear-gradient(to bottom, white 0%, transparent 35%, transparent 65%, white 100%)' }} />

            {/* 아이템 목록 */}
            <div
                className="absolute left-0 right-0 transition-none z-[15]"
                style={{ transform: `translateY(${baseTranslate}px)`, willChange: 'transform' }}
            >
                {items.map((item) => (
                    <div
                        key={item}
                        className={`flex items-center justify-center font-semibold transition-all
                            ${item === selected
                                ? 'text-emerald-700 text-base z-10'
                                : 'text-gray-400 text-sm'}`}
                        style={{ height: ITEM_H }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => onSelect(item)}
                    >
                        {format ? format(item) : String(item)}
                    </div>
                ))}
            </div>
        </div>
    );
};

function pad(n: number) {
    return String(n).padStart(2, '0');
}

const CALENDAR_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function ymdFromParts(y: number, m: number, d: number) {
    return `${y}-${pad(m)}-${pad(d)}`;
}

function rangesForDay(ymd: string, ranges: AssigneeMenuDateRange[]) {
    return ranges.filter((r) => {
        if (!r.startDate && !r.endDate) return false;
        const start = r.startDate || r.endDate;
        const end = r.endDate || r.startDate;
        return ymd >= start && ymd <= end;
    });
}

interface CalendarGridProps {
    viewYear: number;
    viewMonth: number;
    selectedYmd: string;
    draftYmd: string;
    menuDateRanges: AssigneeMenuDateRange[];
    onSelectDay: (y: number, m: number, d: number) => void;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    onViewMonthChange: (y: number, m: number) => void;
}

const CalendarGrid: React.FC<CalendarGridProps> = ({
    viewYear,
    viewMonth,
    selectedYmd,
    draftYmd,
    menuDateRanges,
    onSelectDay,
    onPrevMonth,
    onNextMonth,
    onViewMonthChange,
}) => {
    const viewDate = useMemo(() => new Date(viewYear, viewMonth - 1, 1), [viewYear, viewMonth]);
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const paddingDays = Array(start.getDay()).fill(null);
    const years = range(2000, new Date().getFullYear() + 5);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-0.5">
                <button
                    type="button"
                    onClick={onPrevMonth}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                >
                    <ChevronLeft size={16} />
                </button>
                <div className="flex gap-0.5">
                    <select
                        value={viewYear}
                        onChange={(e) => onViewMonthChange(parseInt(e.target.value, 10), viewMonth)}
                        className="text-xs font-bold text-gray-800 bg-transparent border-none cursor-pointer focus:outline-none rounded px-1"
                    >
                        {years.map((y) => (
                            <option key={y} value={y}>{y}년</option>
                        ))}
                    </select>
                    <select
                        value={viewMonth}
                        onChange={(e) => onViewMonthChange(viewYear, parseInt(e.target.value, 10))}
                        className="text-xs font-bold text-gray-800 bg-transparent border-none cursor-pointer focus:outline-none rounded px-1"
                    >
                        {range(1, 12).map((m) => (
                            <option key={m} value={m}>{m}월</option>
                        ))}
                    </select>
                </div>
                <button
                    type="button"
                    onClick={onNextMonth}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
                {CALENDAR_WEEKDAYS.map((w, i) => (
                    <div
                        key={w}
                        className={`text-[9px] font-bold text-center py-0.5 ${i === 0 || i === 6 ? 'text-red-400' : 'text-gray-400'}`}
                    >
                        {w}
                    </div>
                ))}
                {paddingDays.map((_, i) => (
                    <div key={`pad-${i}`} className="h-9" />
                ))}
                {days.map((d) => {
                    const ymd = format(d, 'yyyy-MM-dd');
                    const dayRanges = rangesForDay(ymd, menuDateRanges);
                    const isSelected = draftYmd === ymd || (!draftYmd && selectedYmd === ymd);
                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                    const isStart = dayRanges.some((r) => r.startDate === ymd);
                    const isEnd = dayRanges.some((r) => r.endDate === ymd);

                    const inRange = dayRanges.length > 0;
                    const rangeBg = !isSelected && inRange
                        ? `${dayRanges[0].color}22`
                        : undefined;

                    return (
                        <button
                            key={ymd}
                            type="button"
                            onClick={() => onSelectDay(d.getFullYear(), d.getMonth() + 1, d.getDate())}
                            style={{ backgroundColor: rangeBg }}
                            className={`relative h-9 flex flex-col items-center justify-center rounded-lg text-[11px] font-bold transition-all ${
                                isSelected
                                    ? 'bg-emerald-500 text-white ring-2 ring-emerald-200'
                                    : isToday(d)
                                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                        : weekend
                                            ? 'text-red-500 hover:bg-red-50'
                                            : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <span className="leading-none">{format(d, 'd')}</span>
                            {dayRanges.length > 0 && (
                                <span className="absolute bottom-0.5 left-0.5 right-0.5 flex gap-px justify-center">
                                    {dayRanges.slice(0, 3).map((r) => (
                                        <span
                                            key={r.menuId}
                                            className="h-1 flex-1 max-w-[10px] rounded-full"
                                            style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.85)' : r.color }}
                                            title={`${r.menuName}${r.startDate ? ` ${r.startDate}` : ''}${r.endDate ? ` ~ ${r.endDate}` : ''}`}
                                        />
                                    ))}
                                </span>
                            )}
                            {(isStart || isEnd) && !isSelected && (
                                <span className="absolute top-0.5 right-0.5 text-[7px] font-black leading-none text-gray-500">
                                    {isStart && isEnd ? '●' : isStart ? 'S' : 'E'}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {menuDateRanges.length > 0 && (
                <div className="border-t border-gray-100 pt-2 max-h-24 overflow-y-auto">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">담당 메뉴 일정</p>
                    <ul className="flex flex-col gap-1">
                        {menuDateRanges.map((r) => (
                            <li key={r.menuId} className="flex items-start gap-1.5 text-[10px] leading-snug">
                                <span
                                    className="w-2 h-2 rounded-full shrink-0 mt-0.5"
                                    style={{ backgroundColor: r.color }}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="font-bold text-gray-700">{r.menuName}</span>
                                    <span className="text-gray-400 font-mono ml-1">{r.menuCode}</span>
                                    {(r.startDate || r.endDate) && (
                                        <span className="block text-gray-500 tabular-nums">
                                            {r.startDate || '?'} ~ {r.endDate || '?'}
                                        </span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

// ── WheelDatePicker ───────────────────────────────────────────────────────
interface WheelDatePickerProps {
    value: string;           // YYYY-MM-DD
    onChange: (v: string) => void;
    className?: string;
    placeholder?: string;
    variant?: 'default' | 'ghost';
    /** 담당자가 배정된 메뉴의 시작·종료일 (달력 표시용) */
    menuDateRanges?: AssigneeMenuDateRange[];
}

const WheelDatePicker: React.FC<WheelDatePickerProps> = ({
    value,
    onChange,
    className = '',
    placeholder = '날짜 선택',
    variant = 'default',
    menuDateRanges = [],
}) => {
    const today = new Date();
    const isValidYmd = (y: number, m: number, d: number) =>
        !isNaN(y) && !isNaN(m) && !isNaN(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31;
    // 값을 파싱 (성공 시 {y,m,d}, 실패 시 null).
    // 지원: YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD / YYYYMMDD(구분자 없는 8자리)
    const tryParse = (v: string): { y: number; m: number; d: number } | null => {
        const s = String(v ?? '').trim();
        if (!s) return null;
        const parts = s.split(/\s*[-./]\s*/);
        if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
            if (isValidYmd(y, m, d)) return { y, m, d };
        }
        // 구분자 없는 8자리 숫자 (YYYYMMDD)
        const digits = s.replace(/\D/g, '');
        if (digits.length === 8) {
            const y = parseInt(digits.slice(0, 4), 10);
            const m = parseInt(digits.slice(4, 6), 10);
            const d = parseInt(digits.slice(6, 8), 10);
            if (isValidYmd(y, m, d)) return { y, m, d };
        }
        return null;
    };
    const parseValue = (v: string) =>
        tryParse(v) ?? { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };

    const initial = parseValue(value);
    const [year, setYear] = useState(initial.y);
    const [month, setMonth] = useState(initial.m);
    const [day, setDay] = useState(initial.d);
    const [open, setOpen] = useState(false);
    const [pickerMode, setPickerMode] = useState<'wheel' | 'calendar'>('wheel');
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState('');
    const prevTextLenRef = useRef(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLInputElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const popupPos = useWheelPopupPosition(open, triggerRef, popupRef, pickerMode === 'calendar' ? 300 : 260, pickerMode === 'calendar' ? 420 : 320);

    // 팝업 열릴 때 휠 모드로 초기화
    useEffect(() => {
        if (open) setPickerMode('wheel');
    }, [open]);

    const draftYmd = ymdFromParts(year, month, day);
    const selectedYmd = (() => {
        const p = tryParse(value);
        return p ? ymdFromParts(p.y, p.m, p.d) : '';
    })();

    const handleCalendarDaySelect = (y: number, m: number, d: number) => {
        setYear(y);
        setMonth(m);
        setDay(d);
    };

    const handlePrevMonth = () => {
        const d = subMonths(new Date(year, month - 1, 1), 1);
        setYear(d.getFullYear());
        setMonth(d.getMonth() + 1);
    };

    const handleNextMonth = () => {
        const d = addMonths(new Date(year, month - 1, 1), 1);
        setYear(d.getFullYear());
        setMonth(d.getMonth() + 1);
    };

    const handleViewMonthChange = (y: number, m: number) => {
        setYear(y);
        setMonth(m);
        const max = daysInMonth(y, m);
        if (day > max) setDay(max);
    };
    useEffect(() => {
        const p = parseValue(value);
        setYear(p.y); setMonth(p.m); setDay(p.d);
    }, [value]);

    // 월/연 변경 시 day 범위 클램프
    const maxDay = daysInMonth(year, month);
    useEffect(() => {
        if (day > maxDay) setDay(maxDay);
    }, [year, month, maxDay]);

    // 외부 클릭 닫기
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popupRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const confirm = () => {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        onChange(`${year}-${mm}-${dd}`);
        setEditing(false);
        setOpen(false);
    };

    const clear = () => { onChange(''); setEditing(false); setOpen(false); };

    const years = range(2000, today.getFullYear() + 5);
    const months = range(1, 12);
    const days = range(1, maxDay);

    // 파싱되면 YYYY-MM-DD로, 파싱 불가한 값은 (오늘 날짜 대체 대신) 원본을 그대로 표시
    const displayValue = (() => {
        const p = tryParse(value);
        if (p) return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
        return value ? String(value).trim() : '';
    })();

    // 입력창에 직접 타이핑한 값을 확정 (YYYY-MM-DD로 정규화하여 저장)
    const commitText = () => {
        const p = tryParse(text);
        if (p) {
            onChange(`${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`);
            setYear(p.y); setMonth(p.m); setDay(p.d);
        } else if (text.trim() === '') {
            onChange('');
        }
        // 파싱 실패(빈 값 아님)면 저장하지 않고, 편집 종료 시 기존 표시값으로 복귀
        setEditing(false);
    };

    const handleTextChange = (raw: string) => {
        const isDeleting = raw.length < prevTextLenRef.current;
        const formatted = formatDateInput(raw, !isDeleting);
        prevTextLenRef.current = formatted.length;
        setText(formatted);
        const p = tryParse(formatted);
        if (p) {
            setYear(p.y);
            setMonth(p.m);
            setDay(p.d);
        }
    };

    return (
        <div ref={rootRef} className={`relative inline-block ${className}`}>
            {/* 트리거 — 직접 입력 가능 + 클릭 시 휠 피커 */}
            <input
                ref={triggerRef}
                type="text"
                inputMode="numeric"
                value={editing ? text : displayValue}
                placeholder={placeholder}
                maxLength={10}
                onFocus={() => {
                    setEditing(true);
                    setText(displayValue);
                    prevTextLenRef.current = displayValue.length;
                    setOpen(true);
                }}
                onChange={(e) => handleTextChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitText(); setOpen(false); (e.target as HTMLInputElement).blur(); }
                    else if (e.key === 'Escape') { setEditing(false); setOpen(false); (e.target as HTMLInputElement).blur(); }
                }}
                onBlur={() => { if (editing) commitText(); }}
                className={variant === 'ghost'
                    ? "w-full text-center text-sm outline-none bg-transparent border-none p-0 cursor-pointer placeholder:text-gray-400"
                    : "w-full text-left px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-emerald-300 transition-colors outline-none focus:border-emerald-400 placeholder:text-gray-400"
                }
            />

            {/* 팝업 — body 최상위 포털 */}
            {open && createPortal(
                <div
                    ref={popupRef}
                    data-wheel-date-picker-popup
                    className="fixed z-[9999] bg-white border border-gray-100 rounded-2xl shadow-xl p-4 flex flex-col gap-3"
                    style={{ top: popupPos.top, left: popupPos.left, minWidth: pickerMode === 'calendar' ? 300 : 260 }}
                    onWheel={(e) => e.stopPropagation()}
                >
                    {pickerMode === 'wheel' ? (
                        <>
                            <div className="flex justify-around text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">
                                <span style={{ width: 72, textAlign: 'center' }}>년</span>
                                <span style={{ width: 72, textAlign: 'center' }}>월</span>
                                <span style={{ width: 72, textAlign: 'center' }}>일</span>
                            </div>

                            <div className="flex items-center gap-1 justify-center">
                                <WheelColumn items={years} selected={year} onSelect={setYear} />
                                <span className="text-gray-300 font-bold text-lg pb-0.5">/</span>
                                <WheelColumn
                                    items={months}
                                    selected={month}
                                    onSelect={setMonth}
                                    format={(v) => String(v).padStart(2, '0')}
                                />
                                <span className="text-gray-300 font-bold text-lg pb-0.5">/</span>
                                <WheelColumn
                                    items={days}
                                    selected={day}
                                    onSelect={setDay}
                                    format={(v) => String(v).padStart(2, '0')}
                                />
                            </div>
                        </>
                    ) : (
                        <CalendarGrid
                            viewYear={year}
                            viewMonth={month}
                            selectedYmd={selectedYmd}
                            draftYmd={draftYmd}
                            menuDateRanges={menuDateRanges}
                            onSelectDay={handleCalendarDaySelect}
                            onPrevMonth={handlePrevMonth}
                            onNextMonth={handleNextMonth}
                            onViewMonthChange={handleViewMonthChange}
                        />
                    )}

                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={clear}
                            className="flex-1 py-1.5 text-sm font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            초기화
                        </button>
                        <button
                            type="button"
                            onClick={confirm}
                            className="flex-1 py-1.5 text-sm font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                            확인
                        </button>
                        <button
                            type="button"
                            title={pickerMode === 'wheel' ? '달력으로 선택' : '휠로 선택'}
                            onClick={() => setPickerMode((m) => (m === 'wheel' ? 'calendar' : 'wheel'))}
                            className={`shrink-0 px-2.5 py-1.5 rounded-lg border transition-colors ${
                                pickerMode === 'calendar'
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            {pickerMode === 'wheel' ? <CalendarDays size={16} /> : <Columns3 size={16} />}
                        </button>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};

// ── WheelTimePicker ───────────────────────────────────────────────────────
interface WheelTimePickerProps {
    value: string;           // HH:MM
    onChange: (v: string) => void;
    className?: string;
    placeholder?: string;
    variant?: 'default' | 'ghost' | 'panel';
}

function parseTimeValue(v: string) {
    const parts = v.split(':');
    if (parts.length >= 2) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) && !isNaN(m)) {
            return {
                h: Math.min(23, Math.max(0, h)),
                m: Math.min(59, Math.max(0, m)),
            };
        }
    }
    return { h: 9, m: 0 };
}

export const WheelTimePicker: React.FC<WheelTimePickerProps> = ({
    value,
    onChange,
    className = '',
    placeholder = '시간 선택',
    variant = 'default',
}) => {
    const initial = parseTimeValue(value);
    const [hour, setHour] = useState(initial.h);
    const [minute, setMinute] = useState(initial.m);
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const popupPos = useWheelPopupPosition(open, triggerRef, popupRef, 200, 280);

    useEffect(() => {
        const p = parseTimeValue(value);
        setHour(p.h);
        setMinute(p.m);
    }, [value]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popupRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const confirm = () => {
        onChange(`${pad(hour)}:${pad(minute)}`);
        setOpen(false);
    };

    const clear = () => { onChange(''); setOpen(false); };

    const hours = range(0, 23);
    const minutes = range(0, 59);

    const displayValue = value ? `${pad(parseTimeValue(value).h)}:${pad(parseTimeValue(value).m)}` : '';

    const triggerClass = variant === 'ghost'
        ? 'w-full text-center text-sm outline-none bg-transparent border-none p-0 cursor-pointer'
        : variant === 'panel'
            ? 'w-full text-left px-2 py-1.5 text-xs border border-gray-200 rounded-xl bg-gray-50 hover:border-rose-300 transition-colors outline-none focus:border-rose-400'
            : 'w-full text-left px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-emerald-300 transition-colors outline-none focus:border-emerald-400';

    return (
        <div className={`relative inline-block w-full ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(v => !v)}
                className={triggerClass}
            >
                {displayValue || <span className="text-gray-400">{placeholder}</span>}
            </button>

            {open && createPortal(
                <div
                    ref={popupRef}
                    data-wheel-time-picker-popup
                    className="fixed z-[9999] bg-white border border-gray-100 rounded-2xl shadow-xl p-4 flex flex-col gap-3"
                    style={{ top: popupPos.top, left: popupPos.left, minWidth: 200 }}
                    onWheel={e => e.stopPropagation()}
                >
                    <div className="flex justify-around text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">
                        <span style={{ width: 72, textAlign: 'center' }}>시</span>
                        <span style={{ width: 72, textAlign: 'center' }}>분</span>
                    </div>

                    <div className="flex items-center gap-1 justify-center">
                        <WheelColumn items={hours} selected={hour} onSelect={setHour} format={v => pad(v)} />
                        <span className="text-gray-300 font-bold text-lg pb-0.5">:</span>
                        <WheelColumn items={minutes} selected={minute} onSelect={setMinute} format={v => pad(v)} />
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={clear}
                            className="flex-1 py-1.5 text-sm font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            초기화
                        </button>
                        <button
                            type="button"
                            onClick={confirm}
                            className="flex-1 py-1.5 text-sm font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                            확인
                        </button>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};

export const WHEEL_BAR_COLORS = [
    '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
    '#06b6d4', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#f43f5e', '#64748b',
];

// ── ColorWheelColumn ────────────────────────────────────────────────────────
const ColorWheelColumn: React.FC<{
    colors: string[];
    selected: string;
    onSelect: (c: string) => void;
}> = ({ colors, selected, onSelect }) => {
    const ref = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const startY = useRef(0);
    const [offset, setOffset] = useState(0);
    const selectedIndex = Math.max(0, colors.indexOf(selected));

    const snapTo = useCallback((idx: number) => {
        const clamped = Math.max(0, Math.min(colors.length - 1, idx));
        onSelect(colors[clamped]);
        setOffset(0);
    }, [colors, onSelect]);

    const onWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? 1 : -1;
        const newIdx = Math.max(0, Math.min(colors.length - 1, selectedIndex + delta));
        onSelect(colors[newIdx]);
    }, [selectedIndex, colors, onSelect]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [onWheel]);

    const onPointerDown = (e: React.PointerEvent) => {
        isDragging.current = true;
        startY.current = e.clientY;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        setOffset(e.clientY - startY.current);
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        const dy = e.clientY - startY.current;
        const delta = -Math.round(dy / ITEM_H);
        snapTo(selectedIndex + delta);
    };

    const baseTranslate = (CENTER - selectedIndex) * ITEM_H + offset;

    return (
        <div
            ref={ref}
            className="relative flex flex-col items-center select-none cursor-ns-resize overflow-hidden mx-auto"
            style={{ height: VISIBLE * ITEM_H, width: 120 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            <div
                className="absolute left-2 right-2 rounded-lg bg-emerald-50 border border-emerald-200 pointer-events-none z-10"
                style={{ top: CENTER * ITEM_H, height: ITEM_H }}
            />
            <div
                className="absolute inset-0 pointer-events-none z-20"
                style={{ background: 'linear-gradient(to bottom, white 0%, transparent 35%, transparent 65%, white 100%)' }}
            />
            <div
                className="absolute left-0 right-0 z-[15]"
                style={{ transform: `translateY(${baseTranslate}px)` }}
            >
                {colors.map((color) => (
                    <div
                        key={color}
                        className="flex items-center justify-center gap-2"
                        style={{ height: ITEM_H }}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => onSelect(color)}
                    >
                        <span
                            className={`rounded-full border-2 transition-transform ${color === selected ? 'w-7 h-7 border-emerald-500 scale-110' : 'w-6 h-6 border-gray-200'}`}
                            style={{ backgroundColor: color }}
                        />
                        <span className={`text-[10px] font-bold uppercase ${color === selected ? 'text-emerald-700' : 'text-gray-400'}`}>
                            {color}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── WheelColorPicker ────────────────────────────────────────────────────────
interface WheelColorPickerProps {
    value: string;
    onChange: (v: string) => void;
    className?: string;
    placeholder?: string;
    variant?: 'default' | 'panel';
    colors?: string[];
}

export const WheelColorPicker: React.FC<WheelColorPickerProps> = ({
    value,
    onChange,
    className = '',
    placeholder = '색상 선택',
    variant = 'default',
    colors = WHEEL_BAR_COLORS,
}) => {
    const [draft, setDraft] = useState(value || colors[0]);
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const popupPos = useWheelPopupPosition(open, triggerRef, popupRef, 220, 380);

    useEffect(() => {
        setDraft(value || colors[0]);
    }, [value, colors]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popupRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const confirm = () => {
        onChange(draft);
        setOpen(false);
    };

    const clear = () => {
        onChange(colors[0]);
        setDraft(colors[0]);
        setOpen(false);
    };

    const displayColor = value || colors[0];

    const triggerClass = variant === 'panel'
        ? 'w-full flex items-center gap-2 px-2 py-1.5 text-xs border border-gray-200 rounded-xl bg-gray-50 hover:border-rose-300 transition-colors outline-none focus:border-rose-400'
        : 'w-full flex items-center gap-2 text-left px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-emerald-300 transition-colors outline-none focus:border-emerald-400';

    return (
        <div className={`relative inline-block w-full ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(v => !v)}
                className={triggerClass}
            >
                <span
                    className="w-5 h-5 rounded-full border border-gray-200 shrink-0"
                    style={{ backgroundColor: displayColor }}
                />
                <span className="text-gray-700 truncate">{displayColor || placeholder}</span>
            </button>

            {open && createPortal(
                <div
                    ref={popupRef}
                    data-wheel-color-picker-popup
                    className="fixed z-[9999] bg-white border border-gray-100 rounded-2xl shadow-xl p-4 flex flex-col gap-3"
                    style={{ top: popupPos.top, left: popupPos.left, minWidth: 220 }}
                    onWheel={e => e.stopPropagation()}
                >
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">
                        바 색상
                    </div>

                    <ColorWheelColumn colors={colors} selected={draft} onSelect={setDraft} />

                    <div className="grid grid-cols-7 gap-1.5 px-1">
                        {colors.map(c => (
                            <button
                                key={`grid-${c}`}
                                type="button"
                                onClick={() => setDraft(c)}
                                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${draft === c ? 'border-emerald-500 scale-110' : 'border-transparent'}`}
                                style={{ backgroundColor: c }}
                                aria-label={c}
                            />
                        ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={clear}
                            className="flex-1 py-1.5 text-sm font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            초기화
                        </button>
                        <button
                            type="button"
                            onClick={confirm}
                            className="flex-1 py-1.5 text-sm font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                            확인
                        </button>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};

const PROGRESS_STEPS = Array.from({ length: 21 }, (_, i) => i * 5);

function snapProgress(n: number) {
    return Math.min(100, Math.max(0, Math.round(n / 5) * 5));
}

// ── WheelProgressPicker ───────────────────────────────────────────────────
interface WheelProgressPickerProps {
    value: number;
    onChange: (v: number) => void;
    className?: string;
    placeholder?: string;
    variant?: 'default' | 'ghost' | 'panel';
    accentColor?: string;
}

export const WheelProgressPicker: React.FC<WheelProgressPickerProps> = ({
    value,
    onChange,
    className = '',
    variant = 'default',
    accentColor = '#6366f1',
}) => {
    const [draft, setDraft] = useState(snapProgress(value));
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const popupPos = useWheelPopupPosition(open, triggerRef, popupRef, 220, 380);

    useEffect(() => {
        setDraft(snapProgress(value));
    }, [value]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popupRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const confirm = () => {
        onChange(draft);
        setOpen(false);
    };

    const clear = () => {
        onChange(0);
        setDraft(0);
        setOpen(false);
    };

    const display = snapProgress(value);

    const triggerClass = variant === 'ghost'
        ? 'w-full flex items-center gap-1.5 text-sm outline-none bg-transparent border-none p-0 cursor-pointer min-w-0'
        : variant === 'panel'
            ? 'w-full flex items-center gap-2 px-2 py-1.5 text-xs border border-gray-200 rounded-xl bg-gray-50 hover:border-rose-300 transition-colors outline-none focus:border-rose-400'
            : 'w-full flex items-center gap-2 text-left px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-emerald-300 transition-colors outline-none focus:border-emerald-400';

    return (
        <div className={`relative inline-block w-full ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(v => !v)}
                className={triggerClass}
            >
                {variant === 'ghost' ? (
                    <>
                        <span className="flex-1 min-w-0 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                            <span className="block h-full rounded-full transition-all" style={{ width: `${display}%`, backgroundColor: accentColor }} />
                        </span>
                        <span className="shrink-0 font-black tabular-nums text-xs w-8 text-right" style={{ color: accentColor }}>{display}%</span>
                    </>
                ) : (
                    <>
                        <span className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                            <span className="block h-full rounded-full transition-all" style={{ width: `${display}%`, backgroundColor: accentColor }} />
                        </span>
                        <span className="shrink-0 font-bold text-gray-700 w-9 text-right">{display}%</span>
                    </>
                )}
            </button>

            {open && createPortal(
                <div
                    ref={popupRef}
                    data-wheel-progress-picker-popup
                    className="fixed z-[9999] bg-white border border-gray-100 rounded-2xl shadow-xl p-4 flex flex-col gap-3"
                    style={{ top: popupPos.top, left: popupPos.left, minWidth: 220 }}
                    onWheel={e => e.stopPropagation()}
                >
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">
                        진행률
                    </div>

                    <div className="px-2">
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${draft}%`, backgroundColor: accentColor }} />
                        </div>
                        <div className="text-center text-sm font-black text-emerald-700 mt-2">{draft}%</div>
                    </div>

                    <div className="flex items-center gap-1 justify-center">
                        <WheelColumn
                            items={PROGRESS_STEPS}
                            selected={draft}
                            onSelect={setDraft}
                            format={v => `${v}%`}
                        />
                    </div>

                    <div className="flex justify-center gap-2 px-1">
                        {[0, 25, 50, 75, 100].map(p => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setDraft(p)}
                                className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-colors ${draft === p ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                            >
                                {p}%
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={clear}
                            className="flex-1 py-1.5 text-sm font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            초기화
                        </button>
                        <button
                            type="button"
                            onClick={confirm}
                            className="flex-1 py-1.5 text-sm font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                            확인
                        </button>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
};

export default WheelDatePicker;
