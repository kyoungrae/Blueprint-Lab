import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore as useRFStore, useReactFlow } from 'reactflow';
import { Trash2, Database, GripHorizontal, Edit3, X } from 'lucide-react';
import type { Screen, DrawElement } from '../../types/screenDesign';
import type { Project } from '../../types/erd';
import { useScreenNodeStore } from '../../contexts/ScreenCanvasStoreContext';
import ErdTableSearchPanel from '../erd/ErdTableSearchPanel';
import { getErdTableKoreanName } from '../../utils/linkedErdProjects';

const DEFAULT_RATIOS: [number, number, number] = [40, 35, 25];
const MIN_PANEL_PCT = 10;
const IDLE_TRANSFORM: [number, number, number] = [0, 0, 1];
const getPanelPortalRoot = () => document.getElementById('panel-portal-root') || document.body;
const RESIZE_HANDLE_HEIGHT = 6;
const TOTAL_HANDLE_HEIGHT = RESIZE_HANDLE_HEIGHT * 2;

function parseRelatedTableLineName(line: string): string {
    let t = line.trim();
    if (t.startsWith('•')) t = t.substring(1).trim();
    return t;
}

/** 줄 단위로 테이블명이 일치하는지만 본다. `includes`로 인한 부분 문자열 오인 방지. */
function relatedTablesContainsName(relatedTables: string, tableName: string): boolean {
    const target = tableName.trim();
    if (!target) return false;
    return (relatedTables || '')
        .split('\n')
        .some((line) => parseRelatedTableLineName(line) === target);
}

interface RightPaneProps {
    screen: Screen;
    isLocked: boolean;
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
    rightPaneRef: React.RefObject<HTMLDivElement | null>;
    tableListRef: React.RefObject<HTMLDivElement | null>;
    isTableListOpen: boolean;
    setIsTableListOpen: (v: boolean) => void;
    /** 연결된 ERD 전체 — 첫 번째만 보면 테이블이 다른 ERD에 있을 때 한글명을 못 찾음 */
    linkedErdProjects: Project[];
    erdTables: string[];
    drawElements: DrawElement[];

    screenId: string;
}

// 자동 높이 조절 textarea 컴포넌트
const AutoResizeTextarea: React.FC<{
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onCompositionEnd?: (e: React.CompositionEvent<HTMLTextAreaElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
    onMouseDown?: (e: React.MouseEvent<HTMLTextAreaElement>) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
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
    onKeyDown,
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
                onKeyDown={onKeyDown}
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


const RightPane: React.FC<RightPaneProps> = ({
    screen,
    isLocked,
    update,
    syncUpdate,
    rightPaneRef,
    tableListRef,
    isTableListOpen,
    setIsTableListOpen,
    linkedErdProjects,
    erdTables,
    drawElements,

    screenId,
}) => {
    // updateScreen을 직접 가져와서 rightPaneRatios 업데이트에 사용
    const { updateScreen } = useScreenNodeStore();
    // 테이블 추가 패널이 열려 있을 때만 transform 변화를 구독해 불필요한 리렌더를 줄인다.
    useRFStore(
        useCallback(
            (s: { transform: [number, number, number] }) => (isTableListOpen ? s.transform : IDLE_TRANSFORM),
            [isTableListOpen]
        )
    );

    const funcNos = (drawElements || [])
        .filter(el => el.type === 'func-no')
        .sort((a, b) => {
            const aNum = parseFloat((a.text || '0').replace('-', '.'));
            const bNum = parseFloat((b.text || '0').replace('-', '.'));
            return aNum - bNum;
        });

    const relatedTableEntries = useMemo(() => {
        const rawLines = (screen.relatedTables || '').split('\n');
        const sortKey = (line: string) => {
            const t = line.trim();
            return t.startsWith('•') ? t.substring(1).trim() : t;
        };
        const entries = rawLines
            .map((line, originalIndex) => ({ line, originalIndex }))
            .filter(({ line }) => line.trim() !== '');
        return [...entries].sort((a, b) =>
            sortKey(a.line).localeCompare(sortKey(b.line), undefined, { sensitivity: 'base', numeric: true })
        );
    }, [screen.relatedTables]);



    // 로컬 편집 상태 (IME 및 실시간 입력 시 커서 튐 방지)
    const [localValue, setLocalValue] = useState<{ field: string; value: string } | null>(null);
    // 테이블명 직접 입력 패널
    const [showDirectInputPanel, setShowDirectInputPanel] = useState(false);
    const [directInputValue, setDirectInputValue] = useState('');
    const [tableListPanelPos, setTableListPanelPos] = useState<{ x: number; y: number } | null>(null);
    const { screenToFlowPosition } = useReactFlow();

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

    /** 기능상세(번호별): ↑ 첫 번째는 맨 앞, 맨 앞에서 한 번 더 ↑면 이전 번호 입력란 · ↓는 맨 끝, 맨 끝에서 한 번 더 ↓면 다음 번호 입력란 */
    const handleFuncDescKeyDown = useCallback(
        (fnIndex: number) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (isLocked) return;
            if ((e.nativeEvent as KeyboardEvent).isComposing || e.key === 'Process') return;
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

            const ta = e.currentTarget;
            const len = ta.value.length;
            const s = ta.selectionStart ?? 0;
            const t = ta.selectionEnd ?? 0;

            if (e.key === 'ArrowUp') {
                if (s !== 0 || t !== 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    ta.setSelectionRange(0, 0);
                    return;
                }
                if (fnIndex > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    const prevId = funcNos[fnIndex - 1]?.id;
                    if (!prevId) return;
                    const prev = document.getElementById(`func-${prevId}`) as HTMLTextAreaElement | null;
                    prev?.focus();
                    requestAnimationFrame(() => {
                        prev?.setSelectionRange(0, 0);
                    });
                }
                return;
            }

            if (e.key === 'ArrowDown') {
                if (s !== len || t !== len) {
                    e.preventDefault();
                    e.stopPropagation();
                    ta.setSelectionRange(len, len);
                    return;
                }
                if (fnIndex < funcNos.length - 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    const nextId = funcNos[fnIndex + 1]?.id;
                    if (!nextId) return;
                    const nextEl = document.getElementById(`func-${nextId}`) as HTMLTextAreaElement | null;
                    nextEl?.focus();
                    requestAnimationFrame(() => {
                        nextEl?.setSelectionRange(0, 0);
                    });
                }
            }
        },
        [isLocked, funcNos]
    );

    // 🚀 수정: 데이터가 정확히 3개의 숫자를 가진 배열일 때만 사용하고, 아니면 기본값(DEFAULT_RATIOS) 사용
    const isValidRatios = Array.isArray(screen.rightPaneRatios) && 
                          screen.rightPaneRatios.length === 3 && 
                          screen.rightPaneRatios.every((r: any) => typeof r === 'number' && !isNaN(r));
                          
    const ratios = isValidRatios ? (screen.rightPaneRatios as [number, number, number]) : DEFAULT_RATIOS;

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
        let latestClamped: [number, number, number] = ratios;
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
            latestClamped = clamped;
            // 잠금 상태가 아닐 때만 높이 조절 가능
            if (!isLocked) {
                // 로컬은 즉시 반영하고, 협업 동기화는 mouseup 시점에 한 번만 전송한다.
                updateScreen(screen.id, { rightPaneRatios: clamped });
            }
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (!isLocked) {
                syncUpdate({ rightPaneRatios: latestClamped });
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [isLocked, ratios, rightPaneRef, screen.id, syncUpdate, updateScreen]);

    return (
        <div 
            ref={rightPaneRef} 
            className="nodrag h-full flex flex-col bg-white rounded-br-[15px] overflow-hidden" 
            style={{ flex: '1 1 0%' }} 
            onMouseDown={(e) => e.stopPropagation()}
        >

            {/* Panel: 초기화면설정 */}
            {/* 🚀 수정: className에 w-full 추가 */}
            <div className="w-full flex flex-col border-t border-gray-200 min-h-[50px] min-w-0 overflow-hidden" style={{ flex: `${ratios[0]} 1 0` }}>
                {/* 🚀 수정: className에 w-full 추가 */}
                <div className="w-full bg-[#5c6b9e] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a588a] select-none shadow-sm flex items-center gap-1.5 shrink-0">
                    <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 초기화면설정
                </div>
                <div className="flex-1 min-h-0 flex flex-col">
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
                        className={`nodrag w-full h-full flex-1 min-h-0 text-[11px] leading-relaxed bg-transparent border-none outline-none p-3 resize-none overflow-hidden ${isLocked ? 'text-gray-600' : 'text-gray-800'}`}
                        placeholder={isLocked ? "" : "• 화면 진입 시 초기 설정..."}
                        spellCheck={false}
                    />
                </div>
            </div>

            {/* Resize handle: 기능상세 상단 */}
            {!isLocked && (
                <div
                    onMouseDown={(e) => handleResizeStart('func', e)}
                    // 🚀 수정: className에 w-full 추가
                    className="w-full nodrag cursor-n-resize bg-[#5c6b9e] hover:bg-[#6b7aae] active:bg-[#4a588a] h-1.5 flex items-center justify-center shrink-0 group/resize transition-colors"
                    title="드래그하여 초기화면설정/기능상세 영역 크기 조절"
                >
                    <GripHorizontal size={12} className="text-white/60 group-hover/resize:text-white" />
                </div>
            )}

            {/* Panel: 기능상세 */}
            {/* 🚀 수정: className에 w-full 추가 */}
            <div className="w-full flex flex-col border-t border-gray-200 min-h-[60px] min-w-0 overflow-hidden" style={{ flex: `${ratios[1]} 1 0` }}>
                {/* 🚀 수정: className에 w-full 추가 */}
                <div className="w-full bg-[#5c6b9e] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a588a] select-none shadow-sm flex items-center gap-1.5 shrink-0">
                    <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 기능상세
                </div>
                <div className="p-3 space-y-2">
                    {funcNos.map((fn, fnIndex) => (
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
                                onKeyDown={handleFuncDescKeyDown(fnIndex)}
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
                    // 🚀 수정: className에 w-full 추가
                    className="w-full nodrag cursor-n-resize bg-[#5e6b7c] hover:bg-[#6d7a8b] active:bg-[#4a5463] h-1.5 flex items-center justify-center shrink-0 group/resize transition-colors"
                    title="드래그하여 기능상세/관련테이블 영역 크기 조절"
                >
                    <GripHorizontal size={12} className="text-white/60 group-hover/resize:text-white" />
                </div>
            )}

            {/* Panel: 관련테이블 - min-h로 입력창/빈상태 모두 표시 */}
            {/* 🚀 수정: className에 w-full 추가 */}
            <div className="w-full flex flex-col border-t border-gray-200 rounded-br-[15px] min-h-[150px] min-w-0 overflow-hidden" style={{ flex: `${ratios[2]} 1 0` }}>
                {/* 🚀 수정: className에 w-full 추가 */}
                <div className="w-full bg-[#5e6b7c] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a5463] select-none shadow-sm flex items-center justify-between">
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
                            {linkedErdProjects.length > 0 && (
                                <div className="relative" ref={tableListRef}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isTableListOpen) {
                                                if (tableListRef.current) {
                                                    const rect = tableListRef.current.getBoundingClientRect();
                                                    setTableListPanelPos(screenToFlowPosition({ x: rect.left, y: rect.bottom }));
                                                }
                                            }
                                            setIsTableListOpen(!isTableListOpen);
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="nodrag flex items-center gap-1 text-[9px] bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded transition-colors"
                                    >
                                        <Database size={10} />
                                        <span>추가</span>
                                    </button>
                                    <ErdTableSearchPanel
                                        open={isTableListOpen}
                                        onClose={() => setIsTableListOpen(false)}
                                        anchorRef={tableListRef}
                                        panelPos={tableListPanelPos}
                                        onPanelPosChange={setTableListPanelPos}
                                        linkedErdProjects={linkedErdProjects}
                                        erdTables={erdTables}
                                        disabled={isLocked}
                                        screenId={screenId}
                                        onPickTable={(table) => {
                                            if (isLocked) return;
                                            const current = screen.relatedTables || '';
                                            const toAdd = `• ${table}`;
                                            if (!relatedTablesContainsName(current, table)) {
                                                const newValue = current ? `${current}\n${toAdd}` : toAdd;
                                                update({ relatedTables: newValue });
                                                syncUpdate({ relatedTables: newValue });
                                            }
                                        }}
                                    />
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
                                                if (relatedTablesContainsName(current, val)) return;
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
                                            if (!val) return;
                                            const current = screen.relatedTables || '';
                                            if (relatedTablesContainsName(current, val)) return;
                                            const toAdd = `• ${val}`;
                                            const newValue = current ? `${current}\n${toAdd}` : toAdd;
                                            update({ relatedTables: newValue });
                                            syncUpdate({ relatedTables: newValue });
                                            setDirectInputValue('');
                                            setShowDirectInputPanel(false);
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
                        {relatedTableEntries.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-4 text-gray-300 text-center">
                                <Database size={18} className="opacity-20 mb-1" />
                                <p className="text-[10px] font-bold">관련 테이블 없음</p>
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                {relatedTableEntries.map(({ line, originalIndex }) => {
                                    const displayLine = line.trim().startsWith('•') ? line.trim().substring(1).trim() : line.trim();
                                    const koreanName = !isLocked ? getErdTableKoreanName(linkedErdProjects, displayLine) : '';
                                    return (
                                        <div key={originalIndex} className="flex items-center justify-between group/table px-1.5 py-1 hover:bg-blue-50/50 rounded transition-colors text-[10px] font-mono min-w-0">
                                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                <span className="text-blue-500 font-bold shrink-0 text-[8px]">•</span>
                                                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 min-w-0 flex-1">
                                                    <span className="text-gray-700 font-bold break-all">{displayLine}</span>
                                                    {koreanName ? (
                                                        <span
                                                            className="text-gray-500 font-normal font-sans text-[9px] break-all"
                                                            title={koreanName}
                                                        >
                                                            {koreanName}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {!isLocked && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const rawLines = (screen.relatedTables || '').split('\n');
                                                        const newLines = rawLines.filter((_, i) => i !== originalIndex);
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
