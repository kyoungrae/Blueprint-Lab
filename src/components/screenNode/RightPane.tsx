import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Database, GripHorizontal, Edit3, X } from 'lucide-react';
import type { Screen, DrawElement } from '../../types/screenDesign';
import { useScreenNodeStore } from '../../contexts/ScreenCanvasStoreContext';

const DEFAULT_RATIOS: [number, number, number] = [40, 35, 25];
const MIN_PANEL_PCT = 10;
const getPanelPortalRoot = () => document.getElementById('panel-portal-root') || document.body;
const RESIZE_HANDLE_HEIGHT = 6;
const TOTAL_HANDLE_HEIGHT = RESIZE_HANDLE_HEIGHT * 2;

interface RightPaneProps {
    screen: Screen;
    isLocked: boolean;
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
    rightPaneRef: React.RefObject<HTMLDivElement | null>;
    tableListRef: React.RefObject<HTMLDivElement | null>;
    isTableListOpen: boolean;
    setIsTableListOpen: (v: boolean) => void;
    linkedErdProject: any;
    erdTables: string[];
    drawElements: DrawElement[];
    zoom: number | string;
    tableListPanelPos: { x: number; y: number; openUpward: boolean; spaceBelow: number; spaceAbove: number } | null;
    flowToScreenPosition: (pos: { x: number; y: number }) => { x: number; y: number };
    screenId: string;
}

// 자동 높이 조절 textarea 컴포넌트
const AutoResizeTextarea: React.FC<{
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onCompositionEnd?: (e: React.CompositionEvent<HTMLTextAreaElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
    onMouseDown?: (e: React.MouseEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    disabled?: boolean;
    minRows?: number;
    className?: string;
    id?: string;
}> = ({
    value,
    onChange,
    onCompositionEnd,
    onBlur,
    onMouseDown,
    placeholder,
    disabled,
    minRows = 1,
    className,
    id
}) => {
        const textareaRef = useRef<HTMLTextAreaElement>(null);

        useEffect(() => {
            const textarea = textareaRef.current;
            if (!textarea) return;

            // 높이 초기화 후 자동 조절
            textarea.style.height = 'auto';
            const scrollHeight = textarea.scrollHeight;
            const lineHeight = 16; // text-[11px] leading-relaxed의 대략적인 높이
            const minHeight = lineHeight * minRows;
            const newHeight = Math.max(minHeight, scrollHeight);
            textarea.style.height = `${newHeight}px`;
        }, [value, minRows]);

        return (
            <textarea
                ref={textareaRef}
                id={id}
                value={value}
                onChange={onChange}
                onCompositionEnd={onCompositionEnd}
                onBlur={onBlur}
                onMouseDown={onMouseDown}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
                className={className}
                style={{
                    resize: 'none',
                    overflow: 'hidden',
                    height: 'auto'
                }}
            />
        );
    };

const getRows = (text: string | undefined, minRows = 2): number => {
    if (!text) return minRows;
    const lines = text.split('\n').length;
    return Math.max(minRows, lines);
};

const RightPane: React.FC<RightPaneProps> = ({
    screen,
    isLocked,
    update,
    syncUpdate,
    rightPaneRef,
    tableListRef,
    isTableListOpen,
    setIsTableListOpen,
    linkedErdProject,
    erdTables,
    drawElements,
    zoom,
    tableListPanelPos,
    flowToScreenPosition,
    screenId,
}) => {
    // updateScreen을 직접 가져와서 rightPaneRatios 업데이트에 사용
    const { updateScreen } = useScreenNodeStore();
    const funcNos = (drawElements || [])
        .filter(el => el.type === 'func-no')
        .sort((a, b) => {
            const aNum = parseFloat((a.text || '0').replace('-', '.'));
            const bNum = parseFloat((b.text || '0').replace('-', '.'));
            return aNum - bNum;
        });

    const tableLines = (screen.relatedTables || '').split('\n').filter(line => line.trim() !== '');

    useEffect(() => {
        if (!isTableListOpen) return;

        // Capture wheel at window-level first so React Flow cannot pan the canvas
        // when the pointer is inside the table-list dropdown.
        const handleWindowWheelCapture = (e: WheelEvent) => {
            const target = e.target;
            if (!(target instanceof Element)) return;
            const panel = target.closest('[data-table-list-portal]') as HTMLDivElement | null;
            if (!panel) return;

            // Keep canvas zoom gesture available (pinch / ctrl+wheel).
            if (e.ctrlKey || e.metaKey) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            panel.scrollTop += e.deltaY;
            panel.scrollLeft += e.deltaX;
        };

        window.addEventListener('wheel', handleWindowWheelCapture, { capture: true, passive: false });
        return () => window.removeEventListener('wheel', handleWindowWheelCapture, true);
    }, [isTableListOpen]);

    // 로컬 편집 상태 (IME 및 실시간 입력 시 커서 튐 방지)
    const [localValue, setLocalValue] = useState<{ field: string; value: string } | null>(null);
    // 테이블명 직접 입력 패널
    const [showDirectInputPanel, setShowDirectInputPanel] = useState(false);
    const [directInputValue, setDirectInputValue] = useState('');

    const handleChange = (field: 'initialSettings' | 'functionDetails', value: string, e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setLocalValue({ field, value });
        if (!(e.nativeEvent as { isComposing?: boolean }).isComposing) {
            update(field === 'initialSettings' ? { initialSettings: value } : { functionDetails: value });
        }
    };

    const handleCompositionEnd = (field: 'initialSettings' | 'functionDetails', value: string) => {
        setLocalValue({ field, value });
        update(field === 'initialSettings' ? { initialSettings: value } : { functionDetails: value });
        syncUpdate(field === 'initialSettings' ? { initialSettings: value } : { functionDetails: value });
    };

    const handleFuncDescChange = (fn: DrawElement & { description?: string }, value: string, e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setLocalValue({ field: `func-${fn.id}`, value });
        if (!(e.nativeEvent as { isComposing?: boolean }).isComposing) {
            const next = drawElements.map(it => it.id === fn.id ? { ...it, description: value } : it);
            update({ drawElements: next });
        }
    };

    const handleFuncDescCompositionEnd = (fn: DrawElement & { description?: string }, value: string) => {
        setLocalValue({ field: `func-${fn.id}`, value });
        const next = drawElements.map(it => it.id === fn.id ? { ...it, description: value } : it);
        update({ drawElements: next });
        syncUpdate({ drawElements: next });
    };

    const getDisplayValue = (field: string, propValue: string) => {
        if (localValue?.field === field) return localValue.value;
        return propValue;
    };

    const ratios = screen.rightPaneRatios || DEFAULT_RATIOS;

    const clampRatios = (r: [number, number, number]): [number, number, number] => {
        const a = Math.max(MIN_PANEL_PCT, Math.min(80, r[0]));
        const b = Math.max(MIN_PANEL_PCT, Math.min(80, r[1]));
        const c = Math.max(MIN_PANEL_PCT, Math.min(80, r[2]));
        const sum = a + b + c;
        return [a / sum * 100, b / sum * 100, c / sum * 100];
    };

    const handleResizeStart = useCallback((divider: 'func' | 'table', e: React.MouseEvent) => {
        // 잠금 상태에서는 높이 조절 불가
        if (isLocked) return;
        
        e.preventDefault();
        e.stopPropagation();
        const onMove = (ev: MouseEvent) => {
            const container = rightPaneRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const totalH = rect.height;
            const contentH = totalH - TOTAL_HANDLE_HEIGHT;
            const mouseYLocal = ev.clientY - rect.top;
            const ratioFromTop = Math.max(0, Math.min(100, (mouseYLocal / contentH) * 100));

            let next: [number, number, number];
            if (divider === 'func') {
                const r0 = Math.max(MIN_PANEL_PCT, Math.min(80, ratioFromTop));
                const remaining = 100 - r0;
                const r1 = Math.max(MIN_PANEL_PCT, Math.min(remaining - MIN_PANEL_PCT, ratios[1]));
                const r2 = Math.max(MIN_PANEL_PCT, remaining - r1);
                next = [r0, r1, r2];
            } else {
                const r0 = ratios[0];
                const cumTopTwo = Math.max(r0 + MIN_PANEL_PCT, Math.min(90, ratioFromTop));
                const r1 = Math.max(MIN_PANEL_PCT, cumTopTwo - r0);
                const r2 = Math.max(MIN_PANEL_PCT, 100 - r0 - r1);
                next = [r0, r1, r2];
            }
            const clamped = clampRatios(next);
            // 잠금 상태가 아닐 때만 높이 조절 가능
            if (!isLocked) {
                const updatedRatios = { rightPaneRatios: clamped };
                // 로컬 상태 즉시 업데이트 후 서버 동기화
                updateScreen(screen.id, updatedRatios);
                syncUpdate(updatedRatios);
            }
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [ratios, update, syncUpdate, updateScreen]);

    return (
        <div ref={rightPaneRef} className="nodrag w-[30%] flex-shrink-0 flex flex-col bg-white rounded-br-[15px] overflow-hidden" style={{ minWidth: 250 }} onMouseDown={(e) => e.stopPropagation()}>

            {/* Panel: 초기화면설정 */}
            <div className="flex flex-col border-t border-gray-200 min-h-[50px] min-w-0 overflow-hidden" style={{ flex: `${ratios[0]} 1 0` }}>
                <div className="bg-[#5c6b9e] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a588a] select-none shadow-sm flex items-center gap-1.5 shrink-0">
                    <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 초기화면설정
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar no-pan-scroll">
                    <textarea
                        value={getDisplayValue('initialSettings', screen.initialSettings || '')}
                        onChange={(e) => handleChange('initialSettings', e.target.value, e)}
                        onCompositionEnd={(e) => handleCompositionEnd('initialSettings', (e.target as HTMLTextAreaElement).value)}
                        onBlur={(e) => { 
    if (isLocked) return; // 잠금 상태에서는 업데이트 방지
    const v = (e.target as HTMLTextAreaElement).value; 
    setLocalValue(null); 
    update({ initialSettings: v }); 
    syncUpdate({ initialSettings: v }); 
}}
                        onMouseDown={(e) => e.stopPropagation()}
                        disabled={isLocked}
                        rows={getRows(getDisplayValue('initialSettings', screen.initialSettings || ''), 2)}
                        className={`nodrag w-full text-[11px] leading-relaxed bg-transparent border-none outline-none p-3 resize-none overflow-hidden ${isLocked ? 'text-gray-600' : 'text-gray-800'}`}
                        placeholder={isLocked ? "" : "• 화면 진입 시 초기 설정..."}
                        spellCheck={false}
                    />
                </div>
            </div>

            {/* Resize handle: 기능상세 상단 */}
            {!isLocked && (
                <div
                    onMouseDown={(e) => handleResizeStart('func', e)}
                    className="nodrag cursor-n-resize bg-[#5c6b9e] hover:bg-[#6b7aae] active:bg-[#4a588a] h-1.5 flex items-center justify-center shrink-0 group/resize transition-colors"
                    title="드래그하여 초기화면설정/기능상세 영역 크기 조절"
                >
                    <GripHorizontal size={12} className="text-white/60 group-hover/resize:text-white" />
                </div>
            )}

            {/* Panel: 기능상세 */}
            <div className="flex flex-col border-t border-gray-200 min-h-[60px] min-w-0 overflow-hidden" style={{ flex: `${ratios[1]} 1 0` }}>
                <div className="bg-[#5c6b9e] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a588a] select-none shadow-sm flex items-center gap-1.5 shrink-0">
                    <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 기능상세
                </div>
                <div className="p-3 space-y-2">
                    {funcNos.map(fn => (
                        <div key={fn.id} className="flex gap-2 items-start">
                            <div
                                className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm mt-0.5"
                                style={{ backgroundColor: fn.fill || '#ef4444', lineHeight: 1 }}
                            >
                                <span style={{ marginTop: '-1px' }}>{fn.text}</span>
                            </div>
                            <AutoResizeTextarea
                                id={`func-${fn.id}`}
                                value={getDisplayValue(`func-${fn.id}`, (fn as any).description || '')}
                                onChange={(e) => handleFuncDescChange(fn as any, e.target.value, e)}
                                onCompositionEnd={(e) => handleFuncDescCompositionEnd(fn as any, (e.target as HTMLTextAreaElement).value)}
                                onBlur={(e) => { const v = (e.target as HTMLTextAreaElement).value; setLocalValue(null); const next = drawElements.map(it => it.id === fn.id ? { ...it, description: v } : it); update({ drawElements: next }); syncUpdate({ drawElements: next }); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                disabled={isLocked}
                                placeholder={isLocked ? "" : `${fn.text}번에 대한 기능 설명...`}
                                minRows={1}
                                className="nodrag flex-1 bg-transparent border-none outline-none text-[11px] leading-relaxed text-gray-800 placeholder-gray-300"
                            />
                        </div>
                    ))}
                    {funcNos.length > 0 && (
                        <div className="border-b border-gray-100 pt-1" />
                    )}
                    <AutoResizeTextarea
                        id="functionDetails"
                        value={getDisplayValue('functionDetails', screen.functionDetails || '')}
                        onChange={(e) => handleChange('functionDetails', e.target.value, e)}
                        onCompositionEnd={(e) => handleCompositionEnd('functionDetails', (e.target as HTMLTextAreaElement).value)}
                        onBlur={(e) => { 
    if (isLocked) return; // 잠금 상태에서는 업데이트 방지
    const v = (e.target as HTMLTextAreaElement).value; 
    setLocalValue(null); 
    update({ functionDetails: v }); 
    syncUpdate({ functionDetails: v }); 
}}
                        onMouseDown={(e) => e.stopPropagation()}
                        disabled={isLocked}
                        minRows={3}
                        className={`nodrag w-full text-[11px] leading-relaxed bg-transparent border-none outline-none ${isLocked ? 'text-gray-600' : 'text-gray-800'}`}
                        placeholder={isLocked ? "" : "기타 상세 기능 설명 입력..."}
                    />
                </div>
            </div>

            {/* Resize handle: 관련테이블 상단 */}
            {!isLocked && (
                <div
                    onMouseDown={(e) => handleResizeStart('table', e)}
                    className="nodrag cursor-n-resize bg-[#5e6b7c] hover:bg-[#6d7a8b] active:bg-[#4a5463] h-1.5 flex items-center justify-center shrink-0 group/resize transition-colors"
                    title="드래그하여 기능상세/관련테이블 영역 크기 조절"
                >
                    <GripHorizontal size={12} className="text-white/60 group-hover/resize:text-white" />
                </div>
            )}

            {/* Panel: 관련테이블 - min-h로 입력창/빈상태 모두 표시 */}
            <div className="flex flex-col border-t border-gray-200 rounded-br-[15px] min-h-[150px] min-w-0 overflow-hidden" style={{ flex: `${ratios[2]} 1 0` }}>
                <div className="bg-[#5e6b7c] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a5463] select-none shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 관련테이블
                    </div>
                    {!isLocked && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDirectInputPanel(true);
                                    setDirectInputValue('');
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="nodrag flex items-center gap-1 text-[9px] bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded transition-colors"
                            >
                                <Edit3 size={10} />
                                <span>직접 입력</span>
                            </button>
                            {linkedErdProject && (
                                <div className="relative" ref={tableListRef}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setIsTableListOpen(!isTableListOpen); }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="nodrag flex items-center gap-1 text-[9px] bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded transition-colors"
                                    >
                                        <Database size={10} />
                                        <span>추가</span>
                                    </button>
                                    {isTableListOpen && tableListPanelPos && createPortal(
                                        (() => {
                                            const stored = tableListPanelPos;
                                            const screenPos = flowToScreenPosition({ x: stored.x, y: stored.y });
                                            return (
                                                <div
                                                    data-table-list-portal
                                                    data-screen-id={screenId}
                                                    className="nodrag nopan nowheel floating-panel fixed w-48 max-h-[280px] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-2xl z-[9000] animate-in fade-in zoom-in origin-top-left scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
                                                    style={{
                                                        left: screenPos.x,
                                                        ...(stored.openUpward ? { bottom: window.innerHeight - screenPos.y } : { top: screenPos.y }),
                                                        maxHeight: Math.max(100, Math.min(280, stored.openUpward ? stored.spaceAbove : stored.spaceBelow, window.innerHeight * 0.7)),
                                                        transform: `scale(calc(0.85 * ${zoom}))`,
                                                        transformOrigin: stored.openUpward ? 'bottom left' : 'top left',
                                                    }}
                                                    onWheel={(e) => {
                                                        e.stopPropagation();
                                                    }}
                                                    onWheelCapture={(e) => {
                                                        e.stopPropagation();
                                                    }}
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    <div className="p-1">
                                                        {erdTables.length > 0 ? erdTables.map(table => (
                                                            <button
                                                                key={table}
                                                                className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-[10px] text-gray-700 rounded block"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (isLocked) return; // 잠금 상태에서는 업데이트 방지
                                                                    const current = screen.relatedTables || '';
                                                                    const toAdd = `• ${table}`;
                                                                    if (!current.includes(table)) {
                                                                        const newValue = current ? `${current}\n${toAdd}` : toAdd;
                                                                        update({ relatedTables: newValue });
                                                                        syncUpdate({ relatedTables: newValue });
                                                                    }
                                                                    setIsTableListOpen(false);
                                                                }}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                            >
                                                                {table}
                                                            </button>
                                                        )) : (
                                                            <div className="px-2 py-2 text-[10px] text-gray-400 text-center">테이블이 없습니다</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })(),
                                        getPanelPortalRoot()
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 테이블명 직접 입력 패널 (모달) */}
                {showDirectInputPanel && createPortal(
                    <div
                        className="fixed inset-0 z-[9100] flex items-center justify-center p-4 bg-black/40"
                        onClick={() => setShowDirectInputPanel(false)}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div
                            className="nodrag nopan bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                                <span className="text-sm font-bold text-gray-800">테이블명 직접 입력</span>
                                <button
                                    type="button"
                                    onClick={() => setShowDirectInputPanel(false)}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="p-4 space-y-3">
                                <input
                                    type="text"
                                    value={directInputValue}
                                    onChange={(e) => setDirectInputValue(e.target.value)}
                                    placeholder="테이블명 입력 후 Enter 또는 추가"
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !(e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                            e.preventDefault();
                                            if (isLocked) return; // 잠금 상태에서는 업데이트 방지
                                            const val = directInputValue.trim();
                                            if (val) {
                                                const current = screen.relatedTables || '';
                                                const toAdd = `• ${val}`;
                                                const newValue = current ? `${current}\n${toAdd}` : toAdd;
                                                update({ relatedTables: newValue });
                                                syncUpdate({ relatedTables: newValue });
                                                setDirectInputValue('');
                                            }
                                        }
                                    }}
                                    autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setShowDirectInputPanel(false)}
                                        className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        닫기
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isLocked) return; // 잠금 상태에서는 업데이트 방지
                                            const val = directInputValue.trim();
                                            if (val) {
                                                const current = screen.relatedTables || '';
                                                const toAdd = `• ${val}`;
                                                const newValue = current ? `${current}\n${toAdd}` : toAdd;
                                                update({ relatedTables: newValue });
                                                syncUpdate({ relatedTables: newValue });
                                                setDirectInputValue('');
                                                setShowDirectInputPanel(false);
                                            }
                                        }}
                                        className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                                    >
                                        추가
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>,
                    getPanelPortalRoot()
                )}

                {/* Table list - scrollable area only (직접 입력은 버튼으로 모달에서) */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar no-pan-scroll p-2">
                        {tableLines.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-4 text-gray-300 text-center">
                                <Database size={18} className="opacity-20 mb-1" />
                                <p className="text-[10px] font-bold">관련 테이블 없음</p>
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                {tableLines.map((line, idx) => {
                                    const displayLine = line.trim().startsWith('•') ? line.trim().substring(1).trim() : line.trim();
                                    return (
                                        <div key={idx} className="flex items-center justify-between group/table px-1.5 py-1 hover:bg-blue-50/50 rounded transition-colors text-[10px] font-mono min-w-0">
                                            <div className="flex items-center gap-1.5 flex-1">
                                                <span className="text-blue-500 font-bold shrink-0 text-[8px]">•</span>
                                                <span className="text-gray-700 font-bold break-all">{displayLine}</span>
                                            </div>
                                            {!isLocked && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newLines = tableLines.filter((_, i) => i !== idx);
                                                        update({ relatedTables: newLines.join('\n') });
                                                        syncUpdate({ relatedTables: newLines.join('\n') });
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className="p-1 text-gray-400 hover:text-red-500 transition-all active:scale-90 shrink-0"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RightPane;
