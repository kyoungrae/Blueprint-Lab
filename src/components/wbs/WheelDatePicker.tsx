import React, { useState, useRef, useEffect, useCallback } from 'react';

// ── 상수 ──────────────────────────────────────────────────────────────────
const ITEM_H = 36; // px per row
const VISIBLE = 5; // rows visible (must be odd)
const CENTER = Math.floor(VISIBLE / 2); // index of center row

function range(start: number, end: number) {
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function daysInMonth(year: number, month: number) {
    return new Date(year, month, 0).getDate();
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

// ── WheelDatePicker ───────────────────────────────────────────────────────
interface WheelDatePickerProps {
    value: string;           // YYYY-MM-DD
    onChange: (v: string) => void;
    className?: string;
    placeholder?: string;
    variant?: 'default' | 'ghost';
}

const WheelDatePicker: React.FC<WheelDatePickerProps> = ({
    value,
    onChange,
    className = '',
    placeholder = '날짜 선택',
    variant = 'default',
}) => {
    const today = new Date();
    const parseValue = (v: string) => {
        const parts = v.split('-');
        if (parts.length === 3) {
            const y = parseInt(parts[0]);
            const m = parseInt(parts[1]);
            const d = parseInt(parts[2]);
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return { y, m, d };
        }
        return { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
    };

    const initial = parseValue(value);
    const [year, setYear] = useState(initial.y);
    const [month, setMonth] = useState(initial.m);
    const [day, setDay] = useState(initial.d);
    const [open, setOpen] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);

    // value prop 외부 변경 시 동기화
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
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const confirm = () => {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        onChange(`${year}-${mm}-${dd}`);
        setOpen(false);
    };

    const clear = () => { onChange(''); setOpen(false); };

    const years = range(2000, today.getFullYear() + 5);
    const months = range(1, 12);
    const days = range(1, maxDay);

    const displayValue = value
        ? (() => { const p = parseValue(value); return `${p.y}.${String(p.m).padStart(2,'0')}.${String(p.d).padStart(2,'0')}`; })()
        : '';

    return (
        <div ref={popupRef} className={`relative inline-block ${className}`}>
            {/* 트리거 */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={variant === 'ghost'
                    ? "w-full text-center text-sm outline-none bg-transparent border-none p-0 cursor-pointer"
                    : "w-full text-left px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-emerald-300 transition-colors outline-none focus:border-emerald-400"
                }
            >
                {displayValue || <span className="text-gray-400">{placeholder}</span>}
            </button>

            {/* 팝업 */}
            {open && (
                <div className="absolute z-[100] mt-1 bg-white border border-gray-100 rounded-2xl shadow-xl p-4 flex flex-col gap-3"
                    style={{ minWidth: 260 }}
                    onWheel={(e) => e.stopPropagation()}>
                    {/* 컬럼 레이블 */}
                    <div className="flex justify-around text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">
                        <span style={{ width: 72, textAlign: 'center' }}>년</span>
                        <span style={{ width: 72, textAlign: 'center' }}>월</span>
                        <span style={{ width: 72, textAlign: 'center' }}>일</span>
                    </div>

                    {/* 드럼롤 */}
                    <div className="flex items-center gap-1 justify-center">
                        <WheelColumn
                            items={years}
                            selected={year}
                            onSelect={setYear}
                        />
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

                    {/* 확인 / 초기화 */}
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
                            className="flex-2 flex-1 py-1.5 text-sm font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                            확인
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WheelDatePicker;
