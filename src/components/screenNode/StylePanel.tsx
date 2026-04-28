import React, { useRef, useState, useEffect } from 'react';
import { RotateCw, Palette, GripVertical, X, Bold, Italic, Underline, ChevronDown, Plus, Circle } from 'lucide-react';
import { useStore } from 'reactflow';
import { fetchWithAuth } from '../../utils/fetchWithAuth';
import { resolveFontFamilyCSS } from '../../utils/fontFamily';
import type { DrawElement } from '../../types/screenDesign';
import { useRecentStyleColors } from '../../contexts/RecentStyleColorsContext';

const normalizeRotationAngle = (deg: number) => ((deg % 360) + 360) % 360;

const RotationSection: React.FC<{
    selectedElementIds: string[];
    drawElements: DrawElement[];
    updateElements: (ids: string[], updates: Partial<DrawElement> | ((el: DrawElement) => Partial<DrawElement>)) => void;
}> = ({ selectedElementIds, drawElements, updateElements }) => {
    const [rotationInputStr, setRotationInputStr] = useState<string | null>(null);
    const rotationDialRef = useRef<HTMLDivElement>(null);
    const el = drawElements.find(e => selectedElementIds.includes(e.id));
    const rotation = el ? normalizeRotationAngle(el.type === 'image' ? (el.imageRotation ?? 0) : (el.rotation ?? 0)) : 0;
    const displayRotation = rotationInputStr !== null ? rotationInputStr : rotation.toFixed(1);

    const applyRotation = (deg: number) => {
        const val = normalizeRotationAngle(deg);
        updateElements(selectedElementIds, (el) => {
            return el.type === 'image' ? { imageRotation: val } : { rotation: val };
        });
    };

    const handleRotationDialMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = rotationDialRef.current?.getBoundingClientRect();
        if (!rect) return;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const updateFromPointer = (clientX: number, clientY: number) => {
            const angleRad = Math.atan2(clientY - centerY, clientX - centerX);
            const degFromTopClockwise = normalizeRotationAngle((angleRad * 180) / Math.PI + 90);
            const snapped = Math.round(degFromTopClockwise * 10) / 10;
            applyRotation(snapped);
            setRotationInputStr(null);
        };
        updateFromPointer(e.clientX, e.clientY);
        const onMove = (me: MouseEvent) => updateFromPointer(me.clientX, me.clientY);
        const onUp = () => {
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp, true);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp, true);
    };

    const applyRotationFromInput = () => {
        const num = parseFloat(rotationInputStr ?? String(rotation));
        if (!Number.isNaN(num)) applyRotation(num);
        setRotationInputStr(null);
    };

    return (
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2">
                <RotateCw size={14} className="text-gray-500 shrink-0" />
                <span className="text-[11px] text-gray-600 font-medium">회전</span>
            </div>
            <div className="flex gap-1">
                {[0, 90, 180, 270].map((deg) => (
                    <button
                        key={deg}
                        type="button"
                        onClick={() => { applyRotation(deg); setRotationInputStr(null); }}
                        className={`flex-1 py-1.5 rounded text-[11px] font-medium transition-colors ${normalizeRotationAngle(rotation) === deg ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}
                    >
                        {deg}°
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-3">
                <div
                    ref={rotationDialRef}
                    className="relative w-14 h-14 cursor-grab active:cursor-grabbing select-none shrink-0"
                    onMouseDown={handleRotationDialMouseDown}
                >
                    {(() => {
                        const center = 28;
                        const radius = 20;
                        const rad = ((rotation - 90) * Math.PI) / 180;
                        const lineX = center + Math.cos(rad) * (radius - 6);
                        const lineY = center + Math.sin(rad) * (radius - 6);
                        const knobX = center + Math.cos(rad) * radius;
                        const knobY = center + Math.sin(rad) * radius;
                        return (
                            <svg width="56" height="56" viewBox="0 0 56 56" className="block">
                                <circle cx={center} cy={center} r={radius} fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
                                <line x1={center} y1={center} x2={lineX} y2={lineY} stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                                <circle cx={knobX} cy={knobY} r="4" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                                <circle cx={center} cy={center} r="2" fill="#94a3b8" />
                            </svg>
                        );
                    })()}
                </div>
                <div className="flex-1 flex flex-col gap-0.5">
                    <span className="text-[10px] text-gray-500 font-medium">미세 조절</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={displayRotation}
                        onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9.-]/g, '');
                            if (v === '' || v === '-' || /^-?\d*\.?\d*$/.test(v)) setRotationInputStr(v || '');
                        }}
                        onBlur={applyRotationFromInput}
                        onKeyDown={(e) => { if (e.key === 'Enter') applyRotationFromInput(); }}
                        className="w-full px-2 py-1.5 text-[11px] font-medium border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                    />
                    <span className="text-[9px] text-gray-400">°</span>
                </div>
            </div>
        </div>
    );
};

interface StylePanelProps {
    show: boolean;
    selectedElementIds: string[];
    drawElements: DrawElement[];
    stylePanelPos: { x: number; y: number };
    onPositionChange: (pos: { x: number; y: number }) => void;
    zoom: number | string;
    screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
    flowToScreenPosition: (pos: { x: number; y: number }) => { x: number; y: number };
    editingTableId: string | null;
    selectedCellIndices: number[];
    updateElements: (ids: string[], updates: Partial<DrawElement> | ((el: DrawElement) => Partial<DrawElement>)) => void;
    onClose: () => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    screenId: string;
}

const StylePanel: React.FC<StylePanelProps> = ({
    show,
    selectedElementIds,
    drawElements,
    stylePanelPos,
    onPositionChange,
    zoom,
    screenToFlowPosition,
    flowToScreenPosition,
    editingTableId,
    selectedCellIndices,
    updateElements,
    onClose,
    onDragStart,
    onDragEnd,
    screenId,
}) => {
    const isDraggingRef = useRef(false);
    // Force re-render on viewport transformation to keep position in sync
    useStore(s => s.transform);
    useEffect(() => {
        const blurColorPickerOnOutsideClick = (e: MouseEvent) => {
            const active = document.activeElement;
            if (!(active instanceof HTMLInputElement) || active.type !== 'color') return;
            if (active === e.target) return;
            active.blur();
        };
        document.addEventListener('mousedown', blurColorPickerOnOutsideClick, true);
        return () => {
            document.removeEventListener('mousedown', blurColorPickerOnOutsideClick, true);
        };
    }, []);

    if (selectedElementIds.length === 0 || !show) return null;

    const selectedEl = drawElements.find(el => selectedElementIds.includes(el.id));
    const isTable = selectedEl?.type === 'table';
    const isTableCellMode = isTable && editingTableId === selectedEl?.id && selectedCellIndices.length > 0;

    // Helper: apply background color with table-aware logic
    const applyBgColor = (color: string) => {
        updateElements(selectedElementIds, (el) => {
            const isThisTable = el.type === 'table';
            if (isThisTable) {
                const rows = el.tableRows || 3;
                const cols = el.tableCols || 3;
                const totalCells = rows * cols;

                // If in cell-edit mode for THIS specific table, and cells are selected
                if (editingTableId === el.id && selectedCellIndices.length > 0) {
                    const newCellColors = [...(el.tableCellColors || Array(totalCells).fill(undefined))] as (string | undefined)[];
                    selectedCellIndices.forEach(idx => {
                        newCellColors[idx] = color;
                    });
                    return { tableCellColors: newCellColors };
                } else {
                    // Global table selection
                    const newCellColors = Array(totalCells).fill(color) as (string | undefined)[];
                    return { fill: color, tableCellColors: newCellColors };
                }
            } else {
                return { fill: color };
            }
        });
    };

    // Get current background color display value
    const getCurrentBgColor = (): string => {
        if (isTable && selectedEl) {
            if (isTableCellMode) {
                return selectedEl.tableCellColors?.[selectedCellIndices[0]] || '#ffffff';
            }
            // Show fill or first cell color
            return selectedEl.fill || '#ffffff';
        }
        return selectedEl?.fill || '#ffffff';
    };

    const currentBgColor = getCurrentBgColor();
    const { recentFillColors, recentStrokeColors, addRecentFillColor, addRecentStrokeColor } = useRecentStyleColors();
    const shadowColor = selectedEl?.shadowColor || '#000000';
    const shadowOpacity = Math.max(0, Math.min(1, selectedEl?.shadowOpacity ?? 0));
    const shadowOffsetX = selectedEl?.shadowOffsetX ?? 0;
    const shadowOffsetY = selectedEl?.shadowOffsetY ?? 0;

    const isText = selectedEl?.type === 'text';
    const isRectShape = selectedEl?.type === 'rect';
    const [fonts, setFonts] = useState<{ name: string; filename: string; url: string }[]>([]);
    const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
    const fontInputRef = useRef<HTMLInputElement>(null);
    const fontDropdownRef = useRef<HTMLDivElement>(null);
    const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/api\/projects$/, '') || 'http://localhost:3001';
    // 피피티 기본 폰트: 한글(바탕, 굴림 등) + 영문
    const SYSTEM_FONTS = [
        'Pretendard', '맑은 고딕', '굴림', '돋움', '바탕', '바탕체', '궁서', '궁서체', '새굴림',
        'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Calibri', 'Cambria',
    ];

    const getPrimaryFontName = (fontFamily: string | undefined): string => {
        if (!fontFamily || !fontFamily.trim()) return 'Pretendard';
        const first = fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
        return first || 'Pretendard';
    };

    useEffect(() => {
        fetch(`${API_BASE}/api/fonts`).then(res => res.json()).then((d: { fonts: any[] }) => setFonts(d.fonts || [])).catch(() => setFonts([]));
    }, [API_BASE]);

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (fontDropdownRef.current && !fontDropdownRef.current.contains(e.target as Node)) setFontDropdownOpen(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const handleHeaderMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingRef.current = true;
        onDragStart?.();
        const flowAtClick = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const offsetFlowX = flowAtClick.x - stylePanelPos.x;
        const offsetFlowY = flowAtClick.y - stylePanelPos.y;
        const onMove = (me: MouseEvent) => {
            if (!isDraggingRef.current) return;
            me.stopImmediatePropagation();
            const flowAtMove = screenToFlowPosition({ x: me.clientX, y: me.clientY });
            onPositionChange({ x: flowAtMove.x - offsetFlowX, y: flowAtMove.y - offsetFlowY });
        };
        const onUp = () => {
            isDraggingRef.current = false;
            onDragEnd?.();
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div
            data-style-panel
            data-screen-id={screenId}
            className="nodrag floating-panel fixed z-[9000] bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[240px] animate-in fade-in zoom-in origin-top-left"
            style={{
                left: flowToScreenPosition({ x: stylePanelPos.x, y: stylePanelPos.y }).x,
                top: flowToScreenPosition({ x: stylePanelPos.x, y: stylePanelPos.y }).y,
                transform: `scale(calc(0.85 * ${zoom}))`,
            }}
        >
            <div
                className="flex items-center justify-between border-b border-gray-100 pb-2 mb-1 cursor-grab active:cursor-grabbing group/header"
                onMouseDown={handleHeaderMouseDown}
                title="드래그하여 이동"
            >
                <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                    <Palette size={14} className="text-[#2c3e7c]" />
                    <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">스타일 편집 ({selectedElementIds.length})</span>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={14} />
                </button>
            </div>

            {/* Background Color */}
            <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-gray-600 font-medium">배경색</span>
                        {isTableCellMode && (
                            <span className="text-[9px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded-full">
                                {selectedCellIndices.length}개 셀
                            </span>
                        )}
                        {isTable && !isTableCellMode && (
                            <span className="text-[9px] text-purple-600 font-medium bg-purple-50 px-1.5 py-0.5 rounded-full">
                                전체
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 font-mono uppercase">{currentBgColor}</span>
                        <div className={`relative w-6 h-6 rounded-lg border border-gray-200 overflow-hidden shadow-sm hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer ${currentBgColor === 'transparent' ? 'bg-white' : ''}`}>
                            {currentBgColor === 'transparent' ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-full h-[1px] bg-red-400 rotate-45" />
                                </div>
                            ) : (
                                <input
                                    type="color"
                                    value={currentBgColor}
                                    onChange={(e) => {
                                        const color = e.target.value;
                                        applyBgColor(color);
                                        addRecentFillColor(color);
                                    }}
                                    className="absolute -inset-1 w-[150%] h-[150%] cursor-pointer p-0 border-none bg-transparent"
                                />
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex gap-1.5 justify-end">
                    {['#ffffff', '#f1f5f9', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#2c3e7c', 'transparent'].map(color => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => {
                                applyBgColor(color);
                                addRecentFillColor(color);
                            }}
                            className={`w-3.5 h-3.5 rounded-full border border-gray-200 transition-transform hover:scale-110 flex items-center justify-center overflow-hidden`}
                            style={{ backgroundColor: color === 'transparent' ? 'white' : color }}
                        >
                            {color === 'transparent' && <div className="w-full h-[1px] bg-red-400 rotate-45" />}
                        </button>
                    ))}
                </div>
                {recentFillColors.length > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-gray-400 shrink-0">최근</span>
                        <div className="flex gap-1.5 flex-1 flex-wrap">
                            {recentFillColors.slice(0, 5).map(color => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => { applyBgColor(color); addRecentFillColor(color); }}
                                    className={`w-3.5 h-3.5 rounded-full border border-gray-200 transition-transform hover:scale-110 flex items-center justify-center overflow-hidden ${currentBgColor.toLowerCase() === color ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                                    style={{ backgroundColor: color === 'transparent' ? 'white' : color }}
                                    title={color}
                                >
                                    {color === 'transparent' && <div className="w-full h-[1px] bg-red-400 rotate-45" />}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {(isText || isTableCellMode) && selectedEl && (
                <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                    <span className="text-[11px] text-gray-600 font-medium">텍스트 스타일</span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => {
                                updateElements(selectedElementIds, (el) => {
                                    if (el.type === 'table' && editingTableId === el.id && selectedCellIndices.length > 0) {
                                        const s = el.tableCellStyles?.[selectedCellIndices[0]];
                                        const nextVal = (s?.fontWeight || el.fontWeight || 'normal') === 'bold' ? 'normal' : 'bold';
                                        const total = (el.tableRows || 3) * (el.tableCols || 3);
                                        const next = [...(el.tableCellStyles || Array(total).fill(undefined))];
                                        selectedCellIndices.forEach(idx => { next[idx] = { ...(next[idx] || {}), fontWeight: nextVal }; });
                                        return { tableCellStyles: next };
                                    }
                                    return { fontWeight: (el.fontWeight || 'normal') === 'bold' ? 'normal' : 'bold' };
                                });
                            }}
                            className={`p-2 rounded-lg border transition-all ${(() => {
                                if (isTableCellMode && selectedEl.type === 'table') {
                                    return (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.fontWeight === 'bold') ? 'bg-gray-100 border-gray-300 text-[#2c3e7c] font-bold' : 'border-gray-200 text-gray-400 hover:bg-gray-50';
                                }
                                return selectedEl.fontWeight === 'bold' ? 'bg-gray-100 border-gray-300 text-[#2c3e7c] font-bold' : 'border-gray-200 text-gray-400 hover:bg-gray-50';
                            })()}`}
                            title="굵게"
                        >
                            <Bold size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                updateElements(selectedElementIds, (el) => {
                                    if (el.type === 'table' && editingTableId === el.id && selectedCellIndices.length > 0) {
                                        const s = el.tableCellStyles?.[selectedCellIndices[0]];
                                        const nextVal = (s?.fontStyle || el.fontStyle || 'normal') === 'italic' ? 'normal' : 'italic';
                                        const total = (el.tableRows || 3) * (el.tableCols || 3);
                                        const next = [...(el.tableCellStyles || Array(total).fill(undefined))];
                                        selectedCellIndices.forEach(idx => { next[idx] = { ...(next[idx] || {}), fontStyle: nextVal }; });
                                        return { tableCellStyles: next };
                                    }
                                    return { fontStyle: (el.fontStyle || 'normal') === 'italic' ? 'normal' : 'italic' };
                                });
                            }}
                            className={`p-2 rounded-lg border transition-all ${(() => {
                                if (isTableCellMode && selectedEl.type === 'table') {
                                    return (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.fontStyle === 'italic') ? 'bg-gray-100 border-gray-300 text-[#2c3e7c]' : 'border-gray-200 text-gray-400 hover:bg-gray-50';
                                }
                                return selectedEl.fontStyle === 'italic' ? 'bg-gray-100 border-gray-300 text-[#2c3e7c]' : 'border-gray-200 text-gray-400 hover:bg-gray-50';
                            })()}`}
                            title="기울임"
                        >
                            <Italic size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                updateElements(selectedElementIds, (el) => {
                                    if (el.type === 'table' && editingTableId === el.id && selectedCellIndices.length > 0) {
                                        const s = el.tableCellStyles?.[selectedCellIndices[0]];
                                        const nextVal = (s?.textDecoration || el.textDecoration || 'none') === 'underline' ? 'none' : 'underline';
                                        const total = (el.tableRows || 3) * (el.tableCols || 3);
                                        const next = [...(el.tableCellStyles || Array(total).fill(undefined))];
                                        selectedCellIndices.forEach(idx => { next[idx] = { ...(next[idx] || {}), textDecoration: nextVal }; });
                                        return { tableCellStyles: next };
                                    }
                                    return { textDecoration: (el.textDecoration || 'none') === 'underline' ? 'none' : 'underline' };
                                });
                            }}
                            className={`p-2 rounded-lg border transition-all ${(() => {
                                if (isTableCellMode && selectedEl.type === 'table') {
                                    return (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.textDecoration === 'underline') ? 'bg-gray-100 border-gray-300 text-[#2c3e7c]' : 'border-gray-200 text-gray-400 hover:bg-gray-50';
                                }
                                return selectedEl.textDecoration === 'underline' ? 'bg-gray-100 border-gray-300 text-[#2c3e7c]' : 'border-gray-200 text-gray-400 hover:bg-gray-50';
                            })()}`}
                            title="밑줄"
                        >
                            <Underline size={14} />
                        </button>
                    </div>
                    <div className="relative" ref={fontDropdownRef}>
                        <span className="text-[11px] text-gray-600 font-medium block mb-1">폰트</span>
                        <button
                            type="button"
                            onClick={() => setFontDropdownOpen(v => !v)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-left text-[11px]"
                        >
                            <span style={{ fontFamily: resolveFontFamilyCSS(selectedEl.fontFamily) }}>{getPrimaryFontName(selectedEl.fontFamily)}</span>
                            <ChevronDown size={12} className={`text-gray-400 ${fontDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {fontDropdownOpen && (() => {
                            const currentFont = getPrimaryFontName(selectedEl.fontFamily);
                            const baseFonts = [...SYSTEM_FONTS, ...fonts.map(f => f.name)];
                            const allFonts = baseFonts.includes(currentFont) ? baseFonts : [currentFont, ...baseFonts];
                            return (
                                <div
                                    data-font-dropdown
                                    data-screen-id={screenId}
                                    className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[9100] max-h-40 overflow-y-auto overflow-x-hidden overscroll-contain"
                                    onWheel={(e) => e.stopPropagation()}
                                >
                                    {allFonts.map(f => (
                                        <button
                                            key={f}
                                            type="button"
                                            onClick={() => {
                                                updateElements(selectedElementIds, { fontFamily: f });
                                                setFontDropdownOpen(false);
                                            }}
                                            className={`w-full px-3 py-2 text-left text-[11px] hover:bg-gray-100 first:rounded-t-lg ${currentFont === f ? 'bg-blue-50 text-blue-700' : ''}`}
                                            style={{ fontFamily: resolveFontFamilyCSS(f) }}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                    <div className="border-t border-gray-100 p-1">
                                        <input ref={fontInputRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            const fd = new FormData();
                                            fd.append('font', file);
                                            try {
                                                const res = await fetchWithAuth(`${API_BASE}/api/fonts`, { method: 'POST', body: fd });
                                                if (!res.ok) throw new Error();
                                                const data = await res.json();
                                                setFonts(prev => [...prev, data]);
                                                updateElements(selectedElementIds, (el) => {
                                                    if (el.type === 'table' && editingTableId === el.id && selectedCellIndices.length > 0) {
                                                        const total = (el.tableRows || 3) * (el.tableCols || 3);
                                                        const next = [...(el.tableCellStyles || Array(total).fill(undefined))];
                                                        selectedCellIndices.forEach(idx => { next[idx] = { ...(next[idx] || {}), fontFamily: data.name }; });
                                                        return { tableCellStyles: next };
                                                    }
                                                    return { fontFamily: data.name };
                                                });
                                            } catch (err) { 
                                                // console.error(err); 
                                            } finally {
                                                e.target.value = '';
                                            }
                                        }} />
                                        <button
                                            type="button"
                                            onClick={() => fontInputRef.current?.click()}
                                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] text-blue-600 hover:bg-blue-50 rounded"
                                        >
                                            <Plus size={12} />
                                            폰트 추가
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Stroke Color */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                <div className="flex justify-between items-center">
                    <span className="text-[11px] text-gray-600 font-medium">테두리색</span>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 font-mono uppercase">{drawElements.find(el => selectedElementIds.includes(el.id))?.stroke || '#000000'}</span>
                        <div className="relative w-6 h-6 rounded-lg border border-gray-200 overflow-hidden shadow-sm hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer">
                            <input
                                type="color"
                                value={drawElements.find(el => selectedElementIds.includes(el.id))?.stroke || '#000000'}
                                onChange={(e) => {
                                    const color = e.target.value;
                                    updateElements(selectedElementIds, { stroke: color });
                                    addRecentStrokeColor(color);
                                }}
                                className="absolute -inset-1 w-[150%] h-[150%] cursor-pointer p-0 border-none bg-transparent"
                            />
                        </div>
                    </div>
                </div>
                <div className="flex gap-1.5 justify-end">
                    {['#000000', '#2c3e7c', '#64748b', 'transparent'].map(color => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => {
                                updateElements(selectedElementIds, { stroke: color });
                                addRecentStrokeColor(color);
                            }}
                            className={`w-3.5 h-3.5 rounded-full border border-gray-200 transition-transform hover:scale-110 flex items-center justify-center overflow-hidden`}
                            style={{ backgroundColor: color === 'transparent' ? 'white' : color }}
                        >
                            {color === 'transparent' && <div className="w-full h-[1px] bg-red-400 rotate-45" />}
                        </button>
                    ))}
                </div>
                {recentStrokeColors.length > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-gray-400 shrink-0">최근</span>
                        <div className="flex gap-1.5 flex-1 flex-wrap">
                            {recentStrokeColors.slice(0, 5).map(color => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => {
                                        updateElements(selectedElementIds, { stroke: color });
                                        addRecentStrokeColor(color);
                                    }}
                                    className={`w-3.5 h-3.5 rounded-full border border-gray-200 transition-transform hover:scale-110 flex items-center justify-center overflow-hidden ${(drawElements.find(el => selectedElementIds.includes(el.id))?.stroke || '#000000').toLowerCase() === color ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                                    style={{ backgroundColor: color === 'transparent' ? 'white' : color }}
                                    title={color}
                                >
                                    {color === 'transparent' && <div className="w-full h-[1px] bg-red-400 rotate-45" />}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Shadow */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-600 font-medium">그림자</span>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 font-mono uppercase">{shadowColor}</span>
                        <div className="relative w-6 h-6 rounded-lg border border-gray-200 overflow-hidden shadow-sm hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer">
                            <input
                                type="color"
                                value={shadowColor}
                                onChange={(e) => {
                                    updateElements(selectedElementIds, { shadowColor: e.target.value });
                                }}
                                className="absolute -inset-1 w-[150%] h-[150%] cursor-pointer p-0 border-none bg-transparent"
                            />
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-gray-500">투명도</span>
                        <span className="text-[10px] text-blue-600 font-bold">{Math.round(shadowOpacity * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={Math.round(shadowOpacity * 100)}
                        onChange={(e) => {
                            const val = parseInt(e.target.value, 10) / 100;
                            updateElements(selectedElementIds, { shadowOpacity: val });
                        }}
                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2c3e7c]"
                    />
                </div>
                <div className="flex items-center gap-1">
                    {([
                        { label: '가운데', dx: 0, dy: 0 },
                        { label: '위', dx: 0, dy: -6 },
                        { label: '아래', dx: 0, dy: 6 },
                        { label: '왼쪽', dx: -6, dy: 0 },
                        { label: '오른쪽', dx: 6, dy: 0 },
                    ]).map((preset) => {
                        const active = shadowOffsetX === preset.dx && shadowOffsetY === preset.dy;
                        return (
                            <button
                                key={preset.label}
                                type="button"
                                onClick={() => {
                                    updateElements(selectedElementIds, { shadowOffsetX: preset.dx, shadowOffsetY: preset.dy });
                                }}
                                className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            >
                                {preset.label}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-1.5">
                        <label className="text-[10px] text-gray-500 shrink-0">X</label>
                        <input
                            type="number"
                            min={-100}
                            max={100}
                            step={1}
                            value={shadowOffsetX}
                            onChange={(e) => {
                                const num = Math.max(-100, Math.min(100, parseInt(e.target.value, 10) || 0));
                                updateElements(selectedElementIds, { shadowOffsetX: num });
                            }}
                            className="w-full px-2 py-1.5 text-[11px] font-medium border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                        />
                    </div>
                    <div className="flex-1 flex items-center gap-1.5">
                        <label className="text-[10px] text-gray-500 shrink-0">Y</label>
                        <input
                            type="number"
                            min={-100}
                            max={100}
                            step={1}
                            value={shadowOffsetY}
                            onChange={(e) => {
                                const num = Math.max(-100, Math.min(100, parseInt(e.target.value, 10) || 0));
                                updateElements(selectedElementIds, { shadowOffsetY: num });
                            }}
                            className="w-full px-2 py-1.5 text-[11px] font-medium border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                        />
                    </div>
                </div>
            </div>

            {/* 크기 (넓이 · 높이) - 테두리 스타일 위 */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                <span className="text-[11px] text-gray-600 font-medium">크기</span>
                <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-1.5">
                        <label className="text-[10px] text-gray-500 shrink-0">넓이</label>
                        <input
                            type="number"
                            min={1}
                            max={9999}
                            value={selectedEl?.width ?? 0}
                            onChange={(e) => {
                                const num = Math.max(1, Math.min(9999, parseInt(e.target.value, 10) || 1));
                                updateElements(selectedElementIds, (el) => {
                                    const w = el.width || 1;
                                    if (el.type === 'polygon' && el.polygonPoints?.length && w > 0) {
                                        const sx = num / w;
                                        const newPoints = el.polygonPoints.map(p => ({ x: el.x + (p.x - el.x) * sx, y: p.y }));
                                        return { width: num, polygonPoints: newPoints };
                                    }
                                    if (el.type === 'line' && el.lineX1 != null && el.lineX2 != null && w > 0) {
                                        const sx = num / w;
                                        const lineX1 = el.x + (el.lineX1 - el.x) * sx;
                                        const lineX2 = el.x + (el.lineX2 - el.x) * sx;
                                        const minX = Math.min(lineX1, lineX2);
                                        const maxX = Math.max(lineX1, lineX2);
                                        return { x: minX, width: maxX - minX || 1, lineX1, lineX2 };
                                    }
                                    return { width: num };
                                });
                            }}
                            className="w-full px-2 py-1.5 text-[11px] font-medium border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                        />
                        <span className="text-[10px] text-gray-400 shrink-0">px</span>
                    </div>
                    <div className="flex-1 flex items-center gap-1.5">
                        <label className="text-[10px] text-gray-500 shrink-0">높이</label>
                        <input
                            type="number"
                            min={1}
                            max={9999}
                            value={selectedEl?.height ?? 0}
                            onChange={(e) => {
                                const num = Math.max(1, Math.min(9999, parseInt(e.target.value, 10) || 1));
                                updateElements(selectedElementIds, (el) => {
                                    const h = el.height || 1;
                                    if (el.type === 'polygon' && el.polygonPoints?.length && h > 0) {
                                        const sy = num / h;
                                        const newPoints = el.polygonPoints.map(p => ({ x: p.x, y: el.y + (p.y - el.y) * sy }));
                                        return { height: num, polygonPoints: newPoints };
                                    }
                                    if (el.type === 'line' && el.lineY1 != null && el.lineY2 != null && h > 0) {
                                        const sy = num / h;
                                        const lineY1 = el.y + (el.lineY1 - el.y) * sy;
                                        const lineY2 = el.y + (el.lineY2 - el.y) * sy;
                                        const minY = Math.min(lineY1, lineY2);
                                        const maxY = Math.max(lineY1, lineY2);
                                        return { y: minY, height: maxY - minY || 1, lineY1, lineY2 };
                                    }
                                    return { height: num };
                                });
                            }}
                            className="w-full px-2 py-1.5 text-[11px] font-medium border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                        />
                        <span className="text-[10px] text-gray-400 shrink-0">px</span>
                    </div>
                </div>
            </div>

            {/* 회전 */}
            <RotationSection
                selectedElementIds={selectedElementIds}
                drawElements={drawElements}
                updateElements={updateElements}
            />

            {/* Stroke Style (Border style) - 그림으로 표시 */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                <span className="text-[11px] text-gray-600 font-medium">테두리 스타일</span>
                <div className="flex flex-wrap gap-2">
                    {([
                        { value: 'solid' as const },
                        { value: 'dashed' as const },
                        { value: 'dotted' as const },
                        { value: 'double' as const },
                        { value: 'none' as const },
                    ]).map(({ value }) => {
                        const current = drawElements.find(el => selectedElementIds.includes(el.id))?.strokeStyle ?? 'solid';
                        const isSelected = current === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                title={value === 'solid' ? '실선' : value === 'dashed' ? '대시' : value === 'dotted' ? '점선' : value === 'double' ? '이중선' : '없음'}
                                onClick={() => {
                                    updateElements(selectedElementIds, { strokeStyle: value });
                                }}
                                className={`flex items-center justify-center w-9 h-9 rounded-lg border-2 transition-all shrink-0 ${isSelected
                                    ? 'border-[#2c3e7c] bg-blue-50 ring-2 ring-[#2c3e7c] ring-offset-1'
                                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                {value === 'none' ? (
                                    <div className="w-5 h-5 rounded bg-gray-100" title="테두리 없음" />
                                ) : (
                                    <div
                                        className="w-5 h-5 rounded bg-white"
                                        style={{
                                            borderWidth: 2,
                                            borderStyle: value,
                                            borderColor: isSelected ? '#2c3e7c' : '#64748b',
                                        }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Stroke Width */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                <div className="flex justify-between items-center">
                    <span className="text-[11px] text-gray-600 font-medium">테두리 굵기</span>
                    <span className="text-[10px] text-blue-600 font-bold">
                        {drawElements.find(el => el.id === selectedElementIds[0])?.strokeWidth ?? 2}px
                    </span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={drawElements.find(el => el.id === selectedElementIds[0])?.strokeWidth ?? 2}
                    onChange={(e) => {
                        const val = parseInt(e.target.value);
                        updateElements(selectedElementIds, { strokeWidth: val });
                    }}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2c3e7c]"
                />
            </div>

            {/* Border Radius */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                <div className="flex justify-between items-center">
                    <span className="text-[11px] text-gray-600 font-medium">테두리 곡률</span>
                    <span className="text-[10px] text-blue-600 font-bold">
                        {drawElements.find(el => el.id === selectedElementIds[0])?.borderRadius ?? 0}px
                    </span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={drawElements.find(el => el.id === selectedElementIds[0])?.borderRadius ?? 0}
                    onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        updateElements(selectedElementIds, (el) => {
                            if (el.type === 'rect') {
                                return {
                                    borderRadius: val,
                                    borderRadiusTopLeft: val,
                                    borderRadiusTopRight: val,
                                    borderRadiusBottomRight: val,
                                    borderRadiusBottomLeft: val,
                                };
                            }
                            return { borderRadius: val };
                        });
                    }}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2c3e7c]"
                />
                {isRectShape && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-1.5 text-gray-700">
                            <Circle size={10} className="text-gray-400" />
                            <span className="text-[10px] font-medium pl-0.5">모서리별 곡률</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {([
                                { key: 'borderRadiusTopLeft' as const, iconClass: 'border-t-2 border-l-2 rounded-tl-md' },
                                { key: 'borderRadiusTopRight' as const, iconClass: 'border-t-2 border-r-2 rounded-tr-md' },
                                { key: 'borderRadiusBottomLeft' as const, iconClass: 'border-b-2 border-l-2 rounded-bl-md' },
                                { key: 'borderRadiusBottomRight' as const, iconClass: 'border-b-2 border-r-2 rounded-br-md' },
                            ]).map(({ key, iconClass }) => (
                                <div key={key} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5 border border-gray-100">
                                    <div className={`w-2.5 h-2.5 border-gray-400 ${iconClass}`} />
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={(selectedEl[key] as number | undefined) ?? selectedEl.borderRadius ?? 0}
                                        onChange={(e) => {
                                            const n = parseInt(e.target.value, 10) || 0;
                                            updateElements(selectedElementIds, (el) => (el.type === 'rect' ? { [key]: n } : {}));
                                        }}
                                        onMouseDown={e => e.stopPropagation()}
                                        className="w-full bg-transparent text-[11px] text-gray-700 outline-none text-right font-mono"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {/* Opacity Sliders */}
            <div className="flex flex-col gap-3 pt-2 border-t border-gray-100">
                {/* Fill Opacity */}
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                        <span className="text-[11px] text-gray-600 font-medium">배경 투명도</span>
                        <span className="text-[10px] text-blue-600 font-bold">
                            {Math.round((drawElements.find(el => el.id === selectedElementIds[0])?.fillOpacity ?? 1) * 100)}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={Math.round((drawElements.find(el => el.id === selectedElementIds[0])?.fillOpacity ?? 1) * 100)}
                        onChange={(e) => {
                            const val = parseInt(e.target.value) / 100;
                            updateElements(selectedElementIds, { fillOpacity: val });
                        }}
                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2c3e7c]"
                    />
                </div>

                {/* Stroke Opacity */}
                <div className="flex flex-col gap-1.5 pb-2">
                    <div className="flex justify-between items-center">
                        <span className="text-[11px] text-gray-600 font-medium">테두리 투명도</span>
                        <span className="text-[10px] text-blue-600 font-bold">
                            {Math.round((drawElements.find(el => el.id === selectedElementIds[0])?.strokeOpacity ?? 1) * 100)}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={Math.round((drawElements.find(el => el.id === selectedElementIds[0])?.strokeOpacity ?? 1) * 100)}
                        onChange={(e) => {
                            const val = parseInt(e.target.value) / 100;
                            updateElements(selectedElementIds, { strokeOpacity: val });
                        }}
                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2c3e7c]"
                    />
                </div>
            </div>
        </div>
    );
};

export default StylePanel;
