import React, { useState, useCallback } from 'react';
import { Trash2, Database, GripHorizontal } from 'lucide-react';
import type { Screen, DrawElement } from '../../types/screenDesign';

const DEFAULT_RATIOS: [number, number, number] = [40, 35, 25];
const MIN_PANEL_PCT = 10;
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
}

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
}) => {
    const funcNos = (drawElements || [])
        .filter(el => el.type === 'func-no')
        .sort((a, b) => {
            const aNum = parseFloat((a.text || '0').replace('-', '.'));
            const bNum = parseFloat((b.text || '0').replace('-', '.'));
            return aNum - bNum;
        });

    const tableLines = (screen.relatedTables || '').split('\n').filter(line => line.trim() !== '');

    // IME composition (한글 등) 시 자음/모음 분리 방지
    const [composing, setComposing] = useState<{ field: string; value: string } | null>(null);

    const handleChange = (field: 'initialSettings' | 'functionDetails', value: string, e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
            setComposing({ field, value });
            return;
        }
        setComposing(null);
        update(field === 'initialSettings' ? { initialSettings: value } : { functionDetails: value });
    };

    const handleCompositionEnd = (field: 'initialSettings' | 'functionDetails', value: string) => {
        setComposing(null);
        update(field === 'initialSettings' ? { initialSettings: value } : { functionDetails: value });
        syncUpdate(field === 'initialSettings' ? { initialSettings: value } : { functionDetails: value });
    };

    const handleFuncDescChange = (fn: DrawElement & { description?: string }, value: string, e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
            setComposing({ field: `func-${fn.id}`, value });
            return;
        }
        setComposing(null);
        const next = drawElements.map(it => it.id === fn.id ? { ...it, description: value } : it);
        update({ drawElements: next });
    };

    const handleFuncDescCompositionEnd = (fn: DrawElement & { description?: string }, value: string) => {
        setComposing(null);
        const next = drawElements.map(it => it.id === fn.id ? { ...it, description: value } : it);
        update({ drawElements: next });
        syncUpdate({ drawElements: next });
    };

    const displayValue = (field: string, propValue: string) => {
        if (composing?.field === field) return composing.value;
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
            update({ rightPaneRatios: clamped });
            syncUpdate({ rightPaneRatios: clamped });
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [ratios, update, syncUpdate]);

    return (
        <div ref={rightPaneRef} className="nodrag w-[30%] flex-shrink-0 flex flex-col bg-white rounded-br-[13px] overflow-hidden" style={{ minWidth: 250 }} onMouseDown={(e) => e.stopPropagation()}>

            {/* Panel: 초기화면설정 */}
            <div className="flex flex-col border-t border-gray-200 min-h-[50px] min-w-0 overflow-hidden" style={{ flex: `${ratios[0]} 1 0` }}>
                <div className="bg-[#5c6b9e] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a588a] select-none shadow-sm flex items-center gap-1.5 shrink-0">
                    <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 초기화면설정
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar no-pan-scroll">
                    <textarea
                        value={displayValue('initialSettings', screen.initialSettings || '')}
                        onChange={(e) => handleChange('initialSettings', e.target.value, e)}
                        onCompositionEnd={(e) => handleCompositionEnd('initialSettings', (e.target as HTMLTextAreaElement).value)}
                        onBlur={(e) => { const v = (e.target as HTMLTextAreaElement).value; setComposing(null); update({ initialSettings: v }); syncUpdate({ initialSettings: v }); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        disabled={isLocked}
                        rows={getRows(screen.initialSettings, 2)}
                        className={`nodrag w-full text-[11px] leading-relaxed bg-transparent border-none outline-none p-3 resize-none overflow-hidden ${isLocked ? 'text-gray-600' : 'text-gray-800'}`}
                        placeholder="• 화면 진입 시 초기 설정..."
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
                            <textarea
                                value={displayValue(`func-${fn.id}`, (fn as any).description || '')}
                                onChange={(e) => handleFuncDescChange(fn as any, e.target.value, e)}
                                onCompositionEnd={(e) => handleFuncDescCompositionEnd(fn as any, (e.target as HTMLTextAreaElement).value)}
                                onBlur={(e) => { const v = (e.target as HTMLTextAreaElement).value; setComposing(null); const next = drawElements.map(it => it.id === fn.id ? { ...it, description: v } : it); update({ drawElements: next }); syncUpdate({ drawElements: next }); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                disabled={isLocked}
                                placeholder={`${fn.text}번에 대한 기능 설명...`}
                                rows={getRows((fn as any).description, 1)}
                                className="nodrag flex-1 bg-transparent border-none outline-none text-[11px] leading-relaxed resize-none overflow-hidden text-gray-800 placeholder-gray-300"
                            />
                        </div>
                    ))}
                    {funcNos.length > 0 && (
                        <div className="border-b border-gray-100 pt-1" />
                    )}
                    <textarea
                        value={displayValue('functionDetails', screen.functionDetails || '')}
                        onChange={(e) => handleChange('functionDetails', e.target.value, e)}
                        onCompositionEnd={(e) => handleCompositionEnd('functionDetails', (e.target as HTMLTextAreaElement).value)}
                        onBlur={(e) => { const v = (e.target as HTMLTextAreaElement).value; setComposing(null); update({ functionDetails: v }); syncUpdate({ functionDetails: v }); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        disabled={isLocked}
                        rows={getRows(screen.functionDetails, 3)}
                        className={`nodrag w-full text-[11px] leading-relaxed bg-transparent border-none outline-none resize-none overflow-hidden ${isLocked ? 'text-gray-600' : 'text-gray-800'}`}
                        placeholder="기타 상세 기능 설명 입력..."
                        spellCheck={false}
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
            <div className="flex flex-col border-t border-gray-200 rounded-br-[13px] min-h-[150px] min-w-0 overflow-hidden" style={{ flex: `${ratios[2]} 1 0` }}>
                <div className="bg-[#5e6b7c] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a5463] select-none shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 관련테이블
                    </div>
                    {!isLocked && linkedErdProject && (
                        <div className="relative" ref={tableListRef}>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsTableListOpen(!isTableListOpen); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="nodrag flex items-center gap-1 text-[9px] bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded transition-colors"
                            >
                                <Database size={10} />
                                <span>추가</span>
                            </button>
                            {isTableListOpen && (
                                <div
                                    ref={(el) => {
                                        if (el) el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
                                    }}
                                    className="nodrag no-pan-scroll absolute right-0 top-full mt-1 w-48 max-h-56 overflow-y-auto bg-white border border-gray-200 shadow-xl rounded-lg z-[1001] animate-in fade-in zoom-in duration-150 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
                                    onWheel={(e) => e.stopPropagation()}
                                    onWheelCapture={(e) => e.stopPropagation()}
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
                            )}
                        </div>
                    )}
                </div>

                {/* Table list - scrollable area + input fixed at bottom (입력창 우선 보장) */}
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
                    {!isLocked && (
                        <div className="shrink-0 p-2 border-t border-gray-100 bg-white">
                            <input
                                type="text"
                                placeholder="테이블 직접 입력 후 Enter..."
                                className="nodrag w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-[10px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !(e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                        const target = e.target as HTMLInputElement;
                                        const val = target.value.trim();
                                        if (val) {
                                            const current = screen.relatedTables || '';
                                            const toAdd = `• ${val}`;
                                            const newValue = current ? `${current}\n${toAdd}` : toAdd;
                                            update({ relatedTables: newValue });
                                            syncUpdate({ relatedTables: newValue });
                                            target.value = '';
                                        }
                                    }
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RightPane;
