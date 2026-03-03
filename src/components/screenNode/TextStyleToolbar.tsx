import React, { useState, useEffect, useRef } from 'react';
import { Type, Bold, Italic, Underline, ChevronDown, Plus } from 'lucide-react';
import type { DrawElement } from '../../types/screenDesign';
import { fetchWithAuth } from '../../utils/fetchWithAuth';
import { resolveFontFamilyCSS } from '../../utils/fontFamily';

const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/api\/projects$/, '') || 'http://localhost:3001';

interface FontInfo {
    name: string;
    filename: string;
    url: string;
}

interface TextStyleToolbarProps {
    el: DrawElement;
    fromTable: boolean;
    defaultColor: string;
    defaultFontSize: number;
    displayFontSize: number;
    updateElement: (id: string, updates: Partial<DrawElement>) => void;
    applyToSelection: (fn: () => void) => boolean;
    applyFontSizePx: (px: number) => boolean;
    setTextStyleToolbarRefresh: (fn: (r: number) => number) => void;
    drawElements: DrawElement[];
    update: (updates: any) => void;
    syncUpdate: (updates: any) => void;
    textSelectionFromTable: { tableId: string; cellIndex: number } | null;
    selectedCellIndices: number[];
    editingTableId: string | null;
}

// 피피티 기본 폰트: 한글(바탕, 굴림 등) + 영문
const SYSTEM_FONTS = [
    'Pretendard', '맑은 고딕', '굴림', '돋움', '바탕', '바탕체', '궁서', '궁서체', '새굴림',
    'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Calibri', 'Cambria',
];

/** "Pretendard, sans-serif" -> "Pretendard" (드롭다운 매칭용) */
function getPrimaryFontName(fontFamily: string | undefined): string {
    if (!fontFamily || !fontFamily.trim()) return 'Pretendard';
    const first = fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    return first || 'Pretendard';
}

export const TextStyleToolbar: React.FC<TextStyleToolbarProps> = ({
    el,
    fromTable,
    defaultColor,
    displayFontSize,
    updateElement,
    applyToSelection,
    applyFontSizePx,
    setTextStyleToolbarRefresh,
    drawElements,
    update,
    syncUpdate,
    textSelectionFromTable,
    selectedCellIndices,
    editingTableId,
}) => {
    const [fonts, setFonts] = useState<FontInfo[]>([]);
    const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
    const [uploadingFont, setUploadingFont] = useState(false);
    const fontInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetch(`${API_BASE}/api/fonts`)
            .then(res => res.json())
            .then((data: { fonts: FontInfo[] }) => setFonts(data.fonts || []))
            .catch(() => setFonts([]));
    }, []);

    // Inject @font-face for custom fonts
    useEffect(() => {
        if (fonts.length === 0) return;
        const id = 'custom-font-faces';
        let styleEl = document.getElementById(id) as HTMLStyleElement | null;
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = id;
            document.head.appendChild(styleEl);
        }
        const getFormat = (url: string) => {
            const ext = url.split('.').pop()?.toLowerCase();
            if (ext === 'woff2') return 'woff2';
            if (ext === 'woff') return 'woff';
            if (ext === 'otf') return 'opentype';
            return 'truetype';
        };
        const rules = fonts.map(f => `
@font-face {
  font-family: '${f.name}';
  src: url('${API_BASE}${f.url}') format('${getFormat(f.url)}');
  font-weight: normal;
  font-style: normal;
}
        `).join('\n');
        styleEl.textContent = rules;
        return () => { styleEl?.remove(); };
    }, [fonts]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setFontDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getCellStyle = (cellIdx: number) => {
        const s = el.tableCellStyles?.[cellIdx] || {};
        return {
            fontWeight: s.fontWeight || el.fontWeight || 'normal',
            fontStyle: s.fontStyle || el.fontStyle || 'normal',
            textDecoration: s.textDecoration || el.textDecoration || 'none',
            fontFamily: s.fontFamily || el.fontFamily || 'Pretendard',
        };
    };

    const getFontFromSelection = (): string | null => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
        const range = sel.getRangeAt(0);
        const node = range.startContainer.nodeType === Node.TEXT_NODE ? (range.startContainer as Text).parentElement : range.startContainer as Element;
        if (!node) return null;
        const computed = window.getComputedStyle(node as Element);
        return computed.fontFamily || null;
    };

    const resolvedFont = fromTable && textSelectionFromTable
        ? getCellStyle(textSelectionFromTable.cellIndex).fontFamily
        : getFontFromSelection() ?? el.fontFamily ?? 'Pretendard';
    const currentFont = getPrimaryFontName(resolvedFont);
    const baseFonts = [...SYSTEM_FONTS, ...fonts.map(f => f.name)];
    const allFonts = baseFonts.includes(currentFont) ? baseFonts : [currentFont, ...baseFonts];

    const applyBold = () => {
        const needFallback = applyToSelection(() => document.execCommand('bold', false));
        if (needFallback) updateElement(el.id, { fontWeight: (el.fontWeight === 'bold' ? 'normal' : 'bold') as any });
        if (fromTable && textSelectionFromTable && editingTableId === el.id) {
            const cellIdx = textSelectionFromTable.cellIndex;
            const rows = el.tableRows || 3;
            const cols = el.tableCols || 3;
            const totalCells = rows * cols;
            const indices = selectedCellIndices.length > 0 ? selectedCellIndices : [cellIdx];
            const newStyles = [...(el.tableCellStyles || Array(totalCells).fill(undefined))].map((s, i) => {
                if (!indices.includes(i)) return s;
                const current = s || {};
                const nextBold = current.fontWeight === 'bold' ? 'normal' : 'bold';
                return { ...current, fontWeight: nextBold };
            });
            update({ drawElements: drawElements.map(it => it.id === el.id ? { ...it, tableCellStyles: newStyles } : it) });
            syncUpdate({ drawElements: drawElements.map(it => it.id === el.id ? { ...it, tableCellStyles: newStyles } : it) });
        }
        setTextStyleToolbarRefresh(r => r + 1);
    };

    const applyItalic = () => {
        const needFallback = applyToSelection(() => document.execCommand('italic', false));
        if (needFallback) updateElement(el.id, { fontStyle: (el.fontStyle === 'italic' ? 'normal' : 'italic') as any });
        if (fromTable && textSelectionFromTable && editingTableId === el.id) {
            const cellIdx = textSelectionFromTable.cellIndex;
            const rows = el.tableRows || 3;
            const cols = el.tableCols || 3;
            const totalCells = rows * cols;
            const indices = selectedCellIndices.length > 0 ? selectedCellIndices : [cellIdx];
            const newStyles = [...(el.tableCellStyles || Array(totalCells).fill(undefined))].map((s, i) => {
                if (!indices.includes(i)) return s;
                const current = s || {};
                const nextItalic = current.fontStyle === 'italic' ? 'normal' : 'italic';
                return { ...current, fontStyle: nextItalic };
            });
            update({ drawElements: drawElements.map(it => it.id === el.id ? { ...it, tableCellStyles: newStyles } : it) });
            syncUpdate({ drawElements: drawElements.map(it => it.id === el.id ? { ...it, tableCellStyles: newStyles } : it) });
        }
        setTextStyleToolbarRefresh(r => r + 1);
    };

    const applyUnderline = () => {
        const needFallback = applyToSelection(() => document.execCommand('underline', false));
        if (needFallback) updateElement(el.id, { textDecoration: (el.textDecoration === 'underline' ? 'none' : 'underline') as any });
        if (fromTable && textSelectionFromTable && editingTableId === el.id) {
            const cellIdx = textSelectionFromTable.cellIndex;
            const rows = el.tableRows || 3;
            const cols = el.tableCols || 3;
            const totalCells = rows * cols;
            const indices = selectedCellIndices.length > 0 ? selectedCellIndices : [cellIdx];
            const newStyles = [...(el.tableCellStyles || Array(totalCells).fill(undefined))].map((s, i) => {
                if (!indices.includes(i)) return s;
                const current = s || {};
                const nextUnderline = current.textDecoration === 'underline' ? 'none' : 'underline';
                return { ...current, textDecoration: nextUnderline };
            });
            update({ drawElements: drawElements.map(it => it.id === el.id ? { ...it, tableCellStyles: newStyles } : it) });
            syncUpdate({ drawElements: drawElements.map(it => it.id === el.id ? { ...it, tableCellStyles: newStyles } : it) });
        }
        setTextStyleToolbarRefresh(r => r + 1);
    };

    const applyFont = (fontName: string) => {
        const needFallback = applyToSelection(() => {
            document.execCommand('fontName', false, fontName);
        });
        if (needFallback) updateElement(el.id, { fontFamily: fontName });
        if (fromTable && textSelectionFromTable && editingTableId === el.id) {
            const cellIdx = textSelectionFromTable.cellIndex;
            const rows = el.tableRows || 3;
            const cols = el.tableCols || 3;
            const totalCells = rows * cols;
            const indices = selectedCellIndices.length > 0 ? selectedCellIndices : [cellIdx];
            const newStyles = [...(el.tableCellStyles || Array(totalCells).fill(undefined))].map((s, i) => {
                if (!indices.includes(i)) return s;
                return { ...(s || {}), fontFamily: fontName };
            });
            update({ drawElements: drawElements.map(it => it.id === el.id ? { ...it, tableCellStyles: newStyles } : it) });
            syncUpdate({ drawElements: drawElements.map(it => it.id === el.id ? { ...it, tableCellStyles: newStyles } : it) });
        }
        setFontDropdownOpen(false);
        setTextStyleToolbarRefresh(r => r + 1);
    };

    const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingFont(true);
        try {
            const formData = new FormData();
            formData.append('font', file);
            const res = await fetchWithAuth(`${API_BASE}/api/fonts`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json() as FontInfo;
            setFonts(prev => [...prev, data]);
            applyFont(data.name);
        } catch (err) {
            console.error('Font upload error:', err);
        } finally {
            setUploadingFont(false);
            e.target.value = '';
        }
    };

    const isBold = fromTable && textSelectionFromTable
        ? getCellStyle(textSelectionFromTable.cellIndex).fontWeight === 'bold'
        : el.fontWeight === 'bold';
    const isItalic = fromTable && textSelectionFromTable
        ? getCellStyle(textSelectionFromTable.cellIndex).fontStyle === 'italic'
        : el.fontStyle === 'italic';
    const isUnderline = fromTable && textSelectionFromTable
        ? getCellStyle(textSelectionFromTable.cellIndex).textDecoration === 'underline'
        : el.textDecoration === 'underline';

    return (
            <div data-text-style-toolbar className="nodrag nopan flex items-center gap-2 rounded-lg px-2 py-1 animate-in fade-in duration-200" onMouseDown={(e) => e.stopPropagation()}>
                {/* Bold, Italic, Underline */}
                <div className="flex items-center gap-0.5 border-r border-gray-200 pr-2">
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyBold(); }}
                        className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${isBold ? 'bg-gray-300 text-gray-800' : 'text-gray-600'}`}
                        title="굵게"
                    >
                        <Bold size={14} />
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyItalic(); }}
                        className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${isItalic ? 'bg-gray-300 text-gray-800' : 'text-gray-600'}`}
                        title="기울임"
                    >
                        <Italic size={14} />
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyUnderline(); }}
                        className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${isUnderline ? 'bg-gray-300 text-gray-800' : 'text-gray-600'}`}
                        title="밑줄"
                    >
                        <Underline size={14} />
                    </button>
                </div>
                {/* Font size */}
                <div className="flex items-center gap-1.5 px-1 border-r border-gray-200 pr-2">
                    <Type size={12} className="text-gray-400" />
                    <input
                        type="number"
                        value={displayFontSize}
                        step={1}
                        min={8}
                        max={72}
                        onChange={(e) => {
                            const px = Math.min(72, Math.max(8, parseInt(e.target.value) || 12));
                            const applied = applyFontSizePx(px);
                            if (!applied && !fromTable) updateElement(el.id, { fontSize: px });
                            setTextStyleToolbarRefresh(r => r + 1);
                        }}
                        className="w-10 bg-transparent text-[11px] font-bold text-gray-700 outline-none"
                    />
                    <span className="text-[10px] text-gray-400">px</span>
                </div>
                {/* Font dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setFontDropdownOpen(v => !v); }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-200 text-[11px] font-medium text-gray-700 min-w-[100px] justify-between"
                        style={{ fontFamily: resolveFontFamilyCSS(currentFont) }}
                    >
                        <span className="truncate">{currentFont}</span>
                        <ChevronDown size={12} className={`text-gray-400 transition-transform ${fontDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {fontDropdownOpen && (
                        <div
                            data-font-dropdown
                            className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[10000] max-h-48 overflow-y-auto overflow-x-hidden min-w-[140px] overscroll-contain"
                            onWheel={(e) => e.stopPropagation()}
                        >
                            {allFonts.map(f => (
                                <button
                                    key={f}
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); applyFont(f); }}
                                    className={`w-full px-3 py-2 text-left text-[11px] hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg ${currentFont === f ? 'bg-blue-50 text-blue-700' : ''}`}
                                    style={{ fontFamily: resolveFontFamilyCSS(f) }}
                                >
                                    {f}
                                </button>
                            ))}
                            <div className="border-t border-gray-100 p-1">
                                <input
                                    ref={fontInputRef}
                                    type="file"
                                    accept=".ttf,.otf,.woff,.woff2"
                                    onChange={handleFontUpload}
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); fontInputRef.current?.click(); }}
                                    disabled={uploadingFont}
                                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                                >
                                    <Plus size={12} />
                                    {uploadingFont ? '업로드 중...' : '폰트 추가'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                {/* Color */}
                <div className="flex items-center gap-2 pl-1">
                    <div className="relative w-5 h-5 rounded-md border border-gray-200 overflow-hidden shadow-sm">
                        <input
                            type="color"
                            value={defaultColor}
                            onChange={(e) => {
                                const color = e.target.value;
                                const needFallback = applyToSelection(() => document.execCommand('foreColor', false, color));
                                if (needFallback) updateElement(el.id, { color });
                            }}
                            className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                        />
                        <div className="w-full h-full" style={{ backgroundColor: defaultColor }} />
                    </div>
                    <div className="flex gap-1">
                        {['#333333', '#2c3e7c', '#dc2626', '#059669'].map(c => (
                            <button
                                key={c}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    const needFallback = applyToSelection(() => document.execCommand('foreColor', false, c));
                                    if (needFallback) updateElement(el.id, { color: c });
                                }}
                                className="w-3 h-3 rounded-full border border-gray-100 transition-transform hover:scale-110"
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                </div>
            </div>
    );
};
