import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Type, Bold, Italic, Underline, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import type { DrawElement } from '../../types/screenDesign';
import { FONT_SIZE_OVERRIDE_EVENT, COLOR_OVERRIDE_EVENT, TEXT_STYLE_OVERRIDE_EVENT } from './DrawTextComponent';
import { fetchWithAuth } from '../../utils/fetchWithAuth';
import { resolveFontFamilyCSS } from '../../utils/fontFamily';
import { useRecentTextColors } from '../../contexts/RecentTextColorsContext';

const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/api\/projects$/, '') || 'http://localhost:3001';

/** 테이블 셀 폰트 사이즈 변경 시 store 업데이트 디바운스 (비테이블 PENDING_FONT_SIZE_DEBOUNCE_MS=380과 유사) */
const TABLE_FONT_SIZE_DEBOUNCE_MS = 300;

interface FontInfo {
    name: string;
    filename: string;
    url: string;
}

interface TextStyleToolbarProps {
    el: DrawElement;
    fromTable: boolean;
    defaultColor: string;
    displayFontSize: number;
    onBeforeFontSizeApply?: (elementId: string, px: number) => void;
    updateElement: (id: string, updates: Partial<DrawElement>) => void;
    applyFontSizePx: (px: number) => boolean;
    applyToSelection: (fn: () => void) => boolean;
    drawElements: DrawElement[];
    update: (updates: any) => void;
    syncUpdate: (updates: any) => void;
    textSelectionFromTable: { tableId: string; cellIndex: number } | null;
    selectedCellIndices: number[];
    editingTableId: string | null;
    tableCellSelectionRestoreRef?: React.MutableRefObject<{ tableId: string; cellIndex: number } | null>;
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

export const TextStyleToolbar: React.FC<TextStyleToolbarProps> = React.memo(({
    el,
    fromTable,
    defaultColor,
    displayFontSize,
    onBeforeFontSizeApply,
    updateElement,
    applyFontSizePx,
    applyToSelection,
    drawElements,
    update,
    syncUpdate,
    textSelectionFromTable,
    selectedCellIndices,
    editingTableId,
    tableCellSelectionRestoreRef,
}) => {
    const { recentTextColors, addRecentTextColor } = useRecentTextColors();
    const [fonts, setFonts] = useState<FontInfo[]>([]);
    const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
    const [uploadingFont, setUploadingFont] = useState(false);
    /** px 입력 중 로컬 문자열 (숫자만 입력 가능, 블러/Enter 시 반영) */
    const [fontSizeInputStr, setFontSizeInputStr] = useState<string | null>(null);
    /** +/- 클릭 시 부모 리렌더 전에 숫자만 즉시 표시 (1.5초 지연 방지) */
    const [optimisticFontSize, setOptimisticFontSize] = useState<number | null>(null);
    const fontInputRef = useRef<HTMLInputElement>(null);
    const colorInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    /** 테이블 셀 폰트 사이즈 디바운스 타이머 */
    const tableFontSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** 디바운스 중 최신 nextElements를 보관 */
    const pendingTableFontSizeRef = useRef<DrawElement[] | null>(null);

    const tableStyleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingTableStyleRef = useRef<DrawElement[] | null>(null);
    /** 로컬 강제 리렌더 (ScreenNode 전체 리렌더 우회) */
    // const [refresh, setRefresh] = useState(0);

    const [computedSelection, setComputedSelection] = useState<{ fontSize?: number; fontFamily?: string }>({});

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const updateComputedStyle = () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    let element = range.commonAncestorContainer;
                    if (element.nodeType === Node.TEXT_NODE) element = element.parentElement!;
                    if (element instanceof HTMLElement) {
                        const computed = window.getComputedStyle(element);
                        const fontSize = parseFloat(computed.fontSize);
                        const fontFamily = computed.fontFamily.split(',')[0].trim().replace(/^"|"$/g, '');
                        setComputedSelection({ fontSize, fontFamily });
                    } else {
                        setComputedSelection({});
                    }
                } else {
                    setComputedSelection({});
                }
            }, 50);
        };
        document.addEventListener('selectionchange', updateComputedStyle);
        updateComputedStyle();
        return () => {
            document.removeEventListener('selectionchange', updateComputedStyle);
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [el.id, fromTable, textSelectionFromTable, editingTableId]);

    const displayValue = fontSizeInputStr !== null ? fontSizeInputStr : String(optimisticFontSize ?? computedSelection.fontSize ?? displayFontSize);


    useEffect(() => {
        if (optimisticFontSize != null && displayFontSize === optimisticFontSize) setOptimisticFontSize(null);
    }, [displayFontSize, optimisticFontSize]);

    // 테이블 폰트 사이즈 디바운스 타이머 정리
    useEffect(() => {
        return () => {
            if (tableFontSizeTimerRef.current) {
                clearTimeout(tableFontSizeTimerRef.current);
                tableFontSizeTimerRef.current = null;
                // cleanup 시 pending이 있으면 즉시 반영
                const pending = pendingTableFontSizeRef.current;
                if (pending) {
                    pendingTableFontSizeRef.current = null;
                    update({ drawElements: pending });
                }
            }
            if (tableStyleTimerRef.current) {
                clearTimeout(tableStyleTimerRef.current);
                tableStyleTimerRef.current = null;
                const pending = pendingTableStyleRef.current;
                if (pending) {
                    pendingTableStyleRef.current = null;
                    update({ drawElements: pending });
                    syncUpdate({ drawElements: pending });
                }
            }
        };
    }, []);

    const applyFontSize = useCallback((px: number) => {
        const clamped = Math.min(72, Math.max(8, px));
        applyFontSizePx(clamped);
        if (fromTable && textSelectionFromTable && editingTableId === el.id) {
            if (tableCellSelectionRestoreRef) tableCellSelectionRestoreRef.current = { tableId: textSelectionFromTable.tableId, cellIndex: textSelectionFromTable.cellIndex };
            setOptimisticFontSize(clamped);

            // 🔥 즉시 피드백을 위해 이벤트 발생 (TableElement가 받음)
            window.dispatchEvent(new CustomEvent(FONT_SIZE_OVERRIDE_EVENT, { detail: { elementId: el.id, px: clamped } }));

            const cellIdx = textSelectionFromTable.cellIndex;
            const rows = el.tableRows || 1;
            const cols = el.tableCols || 1;
            const totalCells = rows * cols;
            const indices = selectedCellIndices.length > 0 ? selectedCellIndices : [cellIdx];
            const newStyles = [...(el.tableCellStyles || Array(totalCells).fill(undefined))].map((s, i) => {
                if (!indices.includes(i)) return s;
                return { ...(s || {}), fontSize: clamped };
            });
            const nextElements = drawElements.map(it => it.id === el.id ? { ...it, tableCellStyles: newStyles } : it);
            pendingTableFontSizeRef.current = nextElements;
            if (tableFontSizeTimerRef.current) clearTimeout(tableFontSizeTimerRef.current);
            tableFontSizeTimerRef.current = setTimeout(() => {
                tableFontSizeTimerRef.current = null;
                const toApply = pendingTableFontSizeRef.current;
                if (!toApply) return;
                pendingTableFontSizeRef.current = null;
                update({ drawElements: toApply });
                syncUpdate({ drawElements: toApply });
            }, TABLE_FONT_SIZE_DEBOUNCE_MS);
        } else if (!fromTable) {
            window.dispatchEvent(new CustomEvent(FONT_SIZE_OVERRIDE_EVENT, { detail: { elementId: el.id, px: clamped } }));
            if (onBeforeFontSizeApply) {
                setOptimisticFontSize(clamped);
                onBeforeFontSizeApply(el.id, clamped);
            } else {
                updateElement(el.id, { fontSize: clamped });
            }
        }
    }, [el.id, el.tableRows, el.tableCols, el.tableCellStyles, fromTable, textSelectionFromTable, editingTableId, selectedCellIndices, drawElements, update, onBeforeFontSizeApply, updateElement, applyFontSizePx, tableCellSelectionRestoreRef, setOptimisticFontSize]);

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
            fontSize: s.fontSize ?? el.fontSize ?? 14,
        };
    };

    const resolvedFont = fromTable && textSelectionFromTable
        ? getCellStyle(textSelectionFromTable.cellIndex).fontFamily
        : computedSelection.fontFamily ?? el.fontFamily ?? 'Pretendard';
    const currentFont = getPrimaryFontName(resolvedFont);
    const baseFonts = useMemo(() => {
        return [...SYSTEM_FONTS, ...fonts.map(f => f.name)];
    }, [fonts]);

    const allFonts = useMemo(() => {
        return baseFonts.includes(currentFont) ? baseFonts : [currentFont, ...baseFonts];
    }, [baseFonts, currentFont]);

    const applyBold = () => {
        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed;
        applyToSelection(() => {
            document.execCommand('bold', false);
        });
        if (hasSelection) return;

        if (fromTable && textSelectionFromTable && editingTableId === el.id) {
            const currentVal = fromTable && textSelectionFromTable ? getCellStyle(textSelectionFromTable.cellIndex).fontWeight : el.fontWeight;
            const nextVal = currentVal === 'bold' ? 'normal' : 'bold';

            // 🔥 즉시 피드백
            window.dispatchEvent(new CustomEvent(TEXT_STYLE_OVERRIDE_EVENT, { detail: { elementId: el.id, updates: { fontWeight: nextVal } } }));

            const newStyles = [...(el.tableCellStyles || Array((el.tableRows || 1) * (el.tableCols || 1)).fill(undefined))];
            selectedCellIndices.forEach(idx => {
                const s = { ...(newStyles[idx] || {}) };
                s.fontWeight = nextVal;
                newStyles[idx] = s;
            });
            const nextElements = drawElements.map(it =>
                it.id === el.id ? { ...it, tableCellStyles: newStyles } : it
            );

            pendingTableStyleRef.current = nextElements;
            if (tableStyleTimerRef.current) clearTimeout(tableStyleTimerRef.current);
            tableStyleTimerRef.current = setTimeout(() => {
                tableStyleTimerRef.current = null;
                const toApply = pendingTableStyleRef.current;
                if (toApply) {
                    pendingTableStyleRef.current = null;
                    update({ drawElements: toApply });
                    syncUpdate({ drawElements: toApply });
                }
            }, 200);
        } else {
            const newVal = el.fontWeight === 'bold' ? 'normal' : 'bold';
            window.dispatchEvent(new CustomEvent(TEXT_STYLE_OVERRIDE_EVENT, { detail: { elementId: el.id, updates: { fontWeight: newVal } } }));
            updateElement(el.id, { fontWeight: newVal });
        }
    };

    const applyItalic = () => {
        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed;
        applyToSelection(() => {
            document.execCommand('italic', false);
        });
        if (hasSelection) return;

        if (fromTable && textSelectionFromTable && editingTableId === el.id) {
            const currentVal = fromTable && textSelectionFromTable ? getCellStyle(textSelectionFromTable.cellIndex).fontStyle : el.fontStyle;
            const nextVal = currentVal === 'italic' ? 'normal' : 'italic';

            // 🔥 즉시 피드백
            window.dispatchEvent(new CustomEvent(TEXT_STYLE_OVERRIDE_EVENT, { detail: { elementId: el.id, updates: { fontStyle: nextVal } } }));

            const newStyles = [...(el.tableCellStyles || Array((el.tableRows || 1) * (el.tableCols || 1)).fill(undefined))];
            selectedCellIndices.forEach(idx => {
                const s = { ...(newStyles[idx] || {}) };
                s.fontStyle = nextVal;
                newStyles[idx] = s;
            });
            const nextElements = drawElements.map(it =>
                it.id === el.id ? { ...it, tableCellStyles: newStyles } : it
            );

            pendingTableStyleRef.current = nextElements;
            if (tableStyleTimerRef.current) clearTimeout(tableStyleTimerRef.current);
            tableStyleTimerRef.current = setTimeout(() => {
                tableStyleTimerRef.current = null;
                const toApply = pendingTableStyleRef.current;
                if (toApply) {
                    pendingTableStyleRef.current = null;
                    update({ drawElements: toApply });
                    syncUpdate({ drawElements: toApply });
                }
            }, 200);
        } else {
            const newVal = el.fontStyle === 'italic' ? 'normal' : 'italic';
            window.dispatchEvent(new CustomEvent(TEXT_STYLE_OVERRIDE_EVENT, { detail: { elementId: el.id, updates: { fontStyle: newVal } } }));
            updateElement(el.id, { fontStyle: newVal });
        }
    };

    const applyUnderline = () => {
        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed;
        applyToSelection(() => {
            document.execCommand('underline', false);
        });
        if (hasSelection) return;

        if (fromTable && textSelectionFromTable && editingTableId === el.id) {
            const currentVal = fromTable && textSelectionFromTable ? getCellStyle(textSelectionFromTable.cellIndex).textDecoration : el.textDecoration;
            const nextVal = currentVal === 'underline' ? 'none' : 'underline';

            // 🔥 즉시 피드백
            window.dispatchEvent(new CustomEvent(TEXT_STYLE_OVERRIDE_EVENT, { detail: { elementId: el.id, updates: { textDecoration: nextVal } } }));

            const newStyles = [...(el.tableCellStyles || Array((el.tableRows || 1) * (el.tableCols || 1)).fill(undefined))];
            selectedCellIndices.forEach(idx => {
                const s = { ...(newStyles[idx] || {}) };
                s.textDecoration = nextVal;
                newStyles[idx] = s;
            });
            const nextElements = drawElements.map(it =>
                it.id === el.id ? { ...it, tableCellStyles: newStyles } : it
            );

            pendingTableStyleRef.current = nextElements;
            if (tableStyleTimerRef.current) clearTimeout(tableStyleTimerRef.current);
            tableStyleTimerRef.current = setTimeout(() => {
                tableStyleTimerRef.current = null;
                const toApply = pendingTableStyleRef.current;
                if (toApply) {
                    pendingTableStyleRef.current = null;
                    update({ drawElements: toApply });
                    syncUpdate({ drawElements: toApply });
                }
            }, 200);
        } else {
            const newVal = el.textDecoration === 'underline' ? 'none' : 'underline';
            window.dispatchEvent(new CustomEvent(TEXT_STYLE_OVERRIDE_EVENT, { detail: { elementId: el.id, updates: { textDecoration: newVal } } }));
            updateElement(el.id, { textDecoration: newVal });
        }
    };

    const applyFont = (fontName: string) => {
        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed;
        applyToSelection(() => {
            document.execCommand('fontName', false, fontName);
        });
        if (hasSelection) {
            setFontDropdownOpen(false);
            return;
        }

        if (fromTable && textSelectionFromTable && editingTableId === el.id) {
            const cellIdx = textSelectionFromTable.cellIndex;
            const rows = el.tableRows || 1;
            const cols = el.tableCols || 1;
            const totalCells = rows * cols;
            const indices = selectedCellIndices.length > 0 ? selectedCellIndices : [cellIdx];

            // 🔥 즉시 피드백
            window.dispatchEvent(new CustomEvent(TEXT_STYLE_OVERRIDE_EVENT, { detail: { elementId: el.id, updates: { fontFamily: fontName } } }));

            const newStyles = [...(el.tableCellStyles || Array(totalCells).fill(undefined))];
            indices.forEach(idx => {
                if (idx >= 0 && idx < totalCells) {
                    newStyles[idx] = { ...(newStyles[idx] || {}), fontFamily: fontName };
                }
            });

            const nextElements = drawElements.map(it =>
                it.id === el.id ? { ...it, tableCellStyles: newStyles } : it
            );

            pendingTableStyleRef.current = nextElements;
            if (tableStyleTimerRef.current) clearTimeout(tableStyleTimerRef.current);
            tableStyleTimerRef.current = setTimeout(() => {
                tableStyleTimerRef.current = null;
                const toApply = pendingTableStyleRef.current;
                if (toApply) {
                    pendingTableStyleRef.current = null;
                    update({ drawElements: toApply });
                    syncUpdate({ drawElements: toApply });
                }
            }, 200);
        } else {
            window.dispatchEvent(new CustomEvent(TEXT_STYLE_OVERRIDE_EVENT, { detail: { elementId: el.id, updates: { fontFamily: fontName } } }));
            updateElement(el.id, { fontFamily: fontName });
        }
        setFontDropdownOpen(false);
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

    const applyColor = (color: string, closePickerInput?: HTMLInputElement | null) => {
        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed;
        applyToSelection(() => {
            document.execCommand('foreColor', false, color);
        });
        if (hasSelection) {
            addRecentTextColor(color);
            if (closePickerInput) closePickerInput.blur();
            return;
        }

        // DOM 조작 제거 - 직접 상태 업데이트로 최적화
        if (fromTable && textSelectionFromTable && editingTableId === el.id) {
            const cellIdx = textSelectionFromTable.cellIndex;
            const rows = el.tableRows || 1;
            const cols = el.tableCols || 1;
            const totalCells = rows * cols;
            const indices = selectedCellIndices.length > 0 ? selectedCellIndices : [cellIdx];

            // 🔥 즉시 피드백
            window.dispatchEvent(new CustomEvent(COLOR_OVERRIDE_EVENT, { detail: { elementId: el.id, color } }));

            const newStyles = [...(el.tableCellStyles || Array(totalCells).fill(undefined))];
            indices.forEach(idx => {
                if (idx >= 0 && idx < totalCells) {
                    newStyles[idx] = { ...(newStyles[idx] || {}), color };
                }
            });

            const nextElements = drawElements.map(it =>
                it.id === el.id ? { ...it, tableCellStyles: newStyles } : it
            );

            pendingTableStyleRef.current = nextElements;
            if (tableStyleTimerRef.current) clearTimeout(tableStyleTimerRef.current);
            tableStyleTimerRef.current = setTimeout(() => {
                tableStyleTimerRef.current = null;
                const toApply = pendingTableStyleRef.current;
                if (toApply) {
                    pendingTableStyleRef.current = null;
                    update({ drawElements: toApply });
                }
            }, 200);
        } else {
            // 일반 텍스트 요소 색상 변경 - 즉시 피드백을 위해 이벤트 발생
            window.dispatchEvent(new CustomEvent(COLOR_OVERRIDE_EVENT, { detail: { elementId: el.id, color } }));
            updateElement(el.id, { color });
        }

        addRecentTextColor(color);
        if (closePickerInput) closePickerInput.blur();
    };

    return (
        <div data-text-style-toolbar className="nodrag nopan flex items-center gap-2 rounded-lg px-2 py-1 animate-in fade-in duration-200" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}>
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
            <div className="flex items-center gap-1 px-1 border-r border-gray-200 pr-2">
                <Type size={12} className="text-gray-400 shrink-0" />
                <div className="flex items-center border border-gray-200 rounded-md overflow-hidden bg-gray-50/50">
                    <input
                        type="text"
                        inputMode="numeric"
                        value={displayValue}
                        onFocus={() => setFontSizeInputStr(String(optimisticFontSize ?? displayFontSize))}
                        onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9]/g, '');
                            if (v === '' || v.length <= 3) setFontSizeInputStr(v || '');
                        }}
                        onBlur={() => {
                            const px = Math.min(72, Math.max(8, parseInt(fontSizeInputStr ?? String(displayFontSize), 10) || 8));
                            setFontSizeInputStr(null);
                            applyFontSize(px);
                        }}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="w-9 py-1 px-1.5 bg-transparent text-[11px] font-bold text-gray-700 outline-none text-center"
                    />
                    <div className="flex flex-col border-l border-gray-200">
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                setFontSizeInputStr(null);
                                const current = optimisticFontSize ?? computedSelection.fontSize ?? displayFontSize;
                                applyFontSize(current + 1);
                            }}
                            className="p-0.5 hover:bg-gray-200 text-gray-500 flex items-center justify-center"
                            title="크게"
                        >
                            <ChevronUp size={12} />
                        </button>
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                setFontSizeInputStr(null);
                                const current = optimisticFontSize ?? computedSelection.fontSize ?? displayFontSize;
                                applyFontSize(current - 1);
                            }}
                            className="p-0.5 hover:bg-gray-200 text-gray-500 flex items-center justify-center border-t border-gray-200"
                            title="작게"
                        >
                            <ChevronDown size={12} />
                        </button>
                    </div>
                </div>
                <span className="text-[10px] text-gray-400 shrink-0">px</span>
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
            <div className="flex items-center gap-2 pl-1 flex-wrap">
                <div className="relative w-5 h-5 rounded-md border border-gray-200 overflow-hidden shadow-sm flex-shrink-0">
                    <input
                        ref={colorInputRef}
                        type="color"
                        value={defaultColor}
                        onChange={(e) => {
                            const color = e.target.value;
                            applyColor(color, e.target);
                        }}
                        className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                    />
                    <div className="w-full h-full" style={{ backgroundColor: defaultColor }} />
                </div>
                <div className="flex gap-1 flex-shrink-0">
                    {['#333333', '#2c3e7c', '#dc2626', '#059669'].map(c => (
                        <button
                            key={c}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); applyColor(c); }}
                            className="w-3 h-3 rounded-full border border-gray-100 transition-transform hover:scale-110"
                            style={{ backgroundColor: c }}
                            title={c}
                        />
                    ))}
                </div>
                {recentTextColors.length > 0 && (
                    <div className="flex gap-1 flex-shrink-0 items-center">
                        {recentTextColors.slice(0, 5).map(c => (
                            <button
                                key={c}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); applyColor(c); }}
                                className={`w-3 h-3 rounded-full border transition-transform hover:scale-110 ${(defaultColor || '').toLowerCase() === c ? 'ring-2 ring-blue-500 ring-offset-0.5 border-blue-400' : 'border-gray-200'}`}
                                style={{ backgroundColor: c }}
                                title={c}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.el.id === next.el.id &&
        prev.el.fontSize === next.el.fontSize &&
        prev.el.color === next.el.color &&
        prev.el.fontWeight === next.el.fontWeight &&
        prev.el.fontStyle === next.el.fontStyle &&
        prev.el.textDecoration === next.el.textDecoration &&
        prev.el.fontFamily === next.el.fontFamily &&
        prev.el.tableCellStyles === next.el.tableCellStyles &&
        prev.displayFontSize === next.displayFontSize &&
        prev.defaultColor === next.defaultColor &&
        prev.editingTableId === next.editingTableId &&
        prev.selectedCellIndices === next.selectedCellIndices &&
        prev.textSelectionFromTable === next.textSelectionFromTable;
});
