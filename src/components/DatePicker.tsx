import React, { useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isToday, parseISO } from 'date-fns';

interface DatePickerProps {
    value: string; // YYYY-MM-DD
    onChange: (date: string) => void;
    maxDate?: string;
    onClear?: () => void;
    trigger: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    anchorRef?: React.RefObject<HTMLElement>;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const DatePicker: React.FC<DatePickerProps> = ({
    value,
    onChange,
    maxDate,
    onClear,
    trigger,
    open,
    onOpenChange,
    anchorRef
}) => {
    const [viewDate, setViewDate] = React.useState<Date>(() =>
        value ? parseISO(value) : new Date()
    );
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (value) setViewDate(parseISO(value));
    }, [value]);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                popoverRef.current && !popoverRef.current.contains(target) &&
                anchorRef?.current && !anchorRef.current.contains(target)
            ) {
                onOpenChange(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open, onOpenChange, anchorRef]);

    const max = maxDate ? parseISO(maxDate) : new Date();
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const firstDow = start.getDay();
    const paddingDays = Array(firstDow).fill(null);

    const handlePrev = () => setViewDate((d) => subMonths(d, 1));
    const handleNext = () => setViewDate((d) => addMonths(d, 1));

    const handleSelect = (d: Date) => {
        const str = format(d, 'yyyy-MM-dd');
        if (maxDate && str > maxDate) return;
        onChange(str);
    };

    const years = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);
    const months = Array.from({ length: 12 }, (_, i) => i);

    return (
        <div className="relative">
            <div ref={anchorRef}>{trigger}</div>
            {open && (
                <div
                    ref={popoverRef}
                    className="absolute left-0 top-full mt-2 z-[1100] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
                    style={{ minWidth: 280 }}
                >
                    {/* 년월 헤더 - 컴팩트 */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/50">
                        <button
                            type="button"
                            onClick={handlePrev}
                            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <div className="flex gap-1">
                            <select
                                value={viewDate.getFullYear()}
                                onChange={(e) =>
                                    setViewDate(new Date(parseInt(e.target.value), viewDate.getMonth(), 1))
                                }
                                className="text-[13px] font-bold text-gray-800 bg-transparent border-none cursor-pointer focus:outline-none focus:ring-0 rounded px-1 py-0.5 hover:bg-gray-200/50"
                            >
                                {years.map((y) => (
                                    <option key={y} value={y}>
                                        {y}년
                                    </option>
                                ))}
                            </select>
                            <select
                                value={viewDate.getMonth()}
                                onChange={(e) =>
                                    setViewDate(new Date(viewDate.getFullYear(), parseInt(e.target.value), 1))
                                }
                                className="text-[13px] font-bold text-gray-800 bg-transparent border-none cursor-pointer focus:outline-none focus:ring-0 rounded px-1 py-0.5 hover:bg-gray-200/50"
                            >
                                {months.map((m) => (
                                    <option key={m} value={m}>
                                        {m + 1}월
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={handleNext}
                            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    {/* 요일 */}
                    <div className="grid grid-cols-7 gap-0.5 px-2 pt-2">
                        {WEEKDAYS.map((w, i) => (
                            <div
                                key={w}
                                className={`text-[10px] font-bold text-center py-1 ${i === 0 || i === 6 ? 'text-red-500' : 'text-gray-500'}`}
                            >
                                {w}
                            </div>
                        ))}
                    </div>

                    {/* 날짜 그리드 - 컴팩트 (높이 줄임) */}
                    <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
                        {paddingDays.map((_, i) => (
                            <div key={`pad-${i}`} className="w-8 h-8" />
                        ))}
                        {days.map((d) => {
                            const dayStr = format(d, 'yyyy-MM-dd');
                            const isDisabled = maxDate && dayStr > maxDate;
                            const selected = value === dayStr;
                            const weekend = d.getDay() === 0 || d.getDay() === 6;
                            return (
                                <button
                                    key={dayStr}
                                    type="button"
                                    disabled={!!isDisabled}
                                    onClick={() => handleSelect(d)}
                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-[12px] font-bold transition-all ${
                                        isDisabled
                                            ? 'text-gray-300 cursor-not-allowed'
                                            : selected
                                                ? 'bg-blue-600 text-white'
                                                : isToday(d)
                                                    ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                                    : weekend
                                                        ? 'text-red-500 hover:bg-red-50'
                                                        : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                                >
                                    {format(d, 'd')}
                                </button>
                            );
                        })}
                    </div>

                    {/* Clear 버튼 - 스타일 개선 */}
                    {onClear && (
                        <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => {
                                    onClear();
                                    onOpenChange(false);
                                }}
                                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-[12px] font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 hover:text-gray-700 transition-colors border border-gray-100"
                            >
                                <X size={14} />
                                선택 해제
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DatePicker;
