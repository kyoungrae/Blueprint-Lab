import React, { memo } from 'react';
import type { DrawElement } from '../../types/screenDesign';
import { hexToRgba, flatIdxToRowCol, rowColToFlatIdx, getV2Cells, deepCopyCells } from './types';
import { resolveFontFamilyCSS } from '../../utils/fontFamily';
import EditableTableCell from './EditableTableCell';
import { FONT_SIZE_OVERRIDE_EVENT, COLOR_OVERRIDE_EVENT, TEXT_STYLE_OVERRIDE_EVENT } from './DrawTextComponent';

interface TableElementProps {
    el: DrawElement;
    isLocked: boolean;
    editingTableId: string | null;
    editingCellIndex: number | null;
    selectedCellIndices: number[];
    flushPendingSync: () => void;
    tableCellSelectionRestoreRef: React.MutableRefObject<{ tableId: string; cellIndex: number } | null>;
    setEditingTableId: (id: string | null) => void;
    setEditingCellIndex: (idx: number | null) => void;
    setSelectedCellIndices: (indices: number[]) => void;
    setTextSelectionRect: (rect: DOMRect | null) => void;
    setTextSelectionFromTable: (val: { tableId: string; cellIndex: number } | null) => void;
    syncUpdate: (updates: any) => void;
    updateElement: (id: string, updates: any) => void;
    getDrawElements: () => DrawElement[];
    isDraggingCellSelectionRef: React.MutableRefObject<boolean>;
    dragStartCellIndexRef: React.MutableRefObject<number>;
}

const TableElement: React.FC<TableElementProps> = memo(({
    el,
    isLocked,
    editingTableId,
    editingCellIndex,
    selectedCellIndices,
    flushPendingSync,
    tableCellSelectionRestoreRef,
    setEditingTableId,
    setEditingCellIndex,
    setSelectedCellIndices,
    setTextSelectionRect,
    setTextSelectionFromTable,
    syncUpdate,
    updateElement,
    getDrawElements,
    isDraggingCellSelectionRef,
    dragStartCellIndexRef,
}) => {
    const rows = el.tableRows || 3;
    const cols = el.tableCols || 3;
    const v2Cells = getV2Cells(el);
    const totalCells = rows * cols;

    const colBoundariesHidden = React.useMemo(() => {
        const mask = Array.from({ length: Math.max(0, cols - 1) }, () => Array(rows).fill(false));
        v2Cells.forEach((cell, idx) => {
            if (!cell || cell.isMerged) return;
            const { r, c } = flatIdxToRowCol(idx, cols);
            const rowSpan = cell.rowSpan || 1;
            const colSpan = cell.colSpan || 1;
            for (let i = 0; i < colSpan - 1; i++) {
                for (let j = 0; j < rowSpan; j++) {
                    if (c + i < cols - 1 && r + j < rows) mask[c + i][r + j] = true;
                }
            }
        });
        return mask;
    }, [v2Cells, rows, cols]);

    const rowBoundariesHidden = React.useMemo(() => {
        const mask = Array.from({ length: Math.max(0, rows - 1) }, () => Array(cols).fill(false));
        v2Cells.forEach((cell, idx) => {
            if (!cell || cell.isMerged) return;
            const { r, c } = flatIdxToRowCol(idx, cols);
            const rowSpan = cell.rowSpan || 1;
            const colSpan = cell.colSpan || 1;
            for (let i = 0; i < rowSpan - 1; i++) {
                for (let j = 0; j < colSpan; j++) {
                    if (r + i < rows - 1 && c + j < cols) mask[r + i][c + j] = true;
                }
            }
        });
        return mask;
    }, [v2Cells, rows, cols]);

    const getMergedRowSegments = React.useCallback((rIdx: number): { left: number; width: number }[] => {
        const colWidths = el.tableColWidths || Array(cols).fill(100 / cols);
        const segments: { left: number; width: number }[] = [];
        let currentLeft = 0;
        let active: { left: number; width: number } | null = null;

        for (let cIdx = 0; cIdx < cols; cIdx++) {
            const isHidden = rowBoundariesHidden[rIdx]?.[cIdx] ?? false;
            const w = colWidths[cIdx] ?? 0;

            if (!isHidden) {
                if (!active) active = { left: currentLeft, width: w };
                else active.width += w;
            } else {
                if (active) {
                    segments.push(active);
                    active = null;
                }
            }

            currentLeft += w;
        }

        if (active) segments.push(active);
        return segments;
    }, [el.tableColWidths, cols, rowBoundariesHidden]);

    // ── Local Overrides for instant feedback ──────────────────────────────
    const [localCellStyles, setLocalCellStyles] = React.useState<Record<number, any>>({});

    React.useEffect(() => {
        const handleFontSize = (e: Event) => {
            const { elementId, px } = (e as CustomEvent<{ elementId: string; px: number }>).detail;
            if (elementId === el.id && selectedCellIndices.length > 0) {
                const next = { ...localCellStyles };
                selectedCellIndices.forEach(idx => {
                    next[idx] = { ...(next[idx] || {}), fontSize: px };
                });
                setLocalCellStyles(next);
            }
        };
        const handleColor = (e: Event) => {
            const { elementId, color } = (e as CustomEvent<{ elementId: string; color: string }>).detail;
            if (elementId === el.id && selectedCellIndices.length > 0) {
                const next = { ...localCellStyles };
                selectedCellIndices.forEach(idx => {
                    next[idx] = { ...(next[idx] || {}), color };
                });
                setLocalCellStyles(next);
            }
        };
        const handleStyle = (e: Event) => {
            const { elementId, updates } = (e as CustomEvent<{ elementId: string; updates: any }>).detail;
            if (elementId === el.id && selectedCellIndices.length > 0) {
                const next = { ...localCellStyles };
                selectedCellIndices.forEach(idx => {
                    next[idx] = { ...(next[idx] || {}), ...updates };
                });
                setLocalCellStyles(next);
            }
        };
        window.addEventListener(FONT_SIZE_OVERRIDE_EVENT, handleFontSize);
        window.addEventListener(COLOR_OVERRIDE_EVENT, handleColor);
        window.addEventListener(TEXT_STYLE_OVERRIDE_EVENT, handleStyle);
        return () => {
            window.removeEventListener(FONT_SIZE_OVERRIDE_EVENT, handleFontSize);
            window.removeEventListener(COLOR_OVERRIDE_EVENT, handleColor);
            window.removeEventListener(TEXT_STYLE_OVERRIDE_EVENT, handleStyle);
        };
    }, [el.id, selectedCellIndices, localCellStyles]);

    // Clear overrides when main state catches up
    React.useEffect(() => {
        if (Object.keys(localCellStyles).length === 0) return;
        const next = { ...localCellStyles };
        let changed = false;
        Object.entries(localCellStyles).forEach(([idxStr, local]) => {
            const idx = parseInt(idxStr, 10);
            const main = el.tableCellStyles?.[idx] || {};
            let match = true;
            if (local.fontSize && (main.fontSize ?? el.fontSize ?? 14) !== local.fontSize) match = false;
            if (local.color && (main.color ?? el.color ?? '#333333') !== local.color) match = false;
            if (local.fontWeight && (main.fontWeight || el.fontWeight || 'normal') !== local.fontWeight) match = false;
            if (local.fontStyle && (main.fontStyle || el.fontStyle || 'normal') !== local.fontStyle) match = false;
            if (local.textDecoration && (main.textDecoration || el.textDecoration || 'none') !== local.textDecoration) match = false;
            if (local.fontFamily && (main.fontFamily || el.fontFamily) !== local.fontFamily) match = false;

            if (match) {
                delete next[idx];
                changed = true;
            }
        });
        if (changed) setLocalCellStyles(next);
    }, [el.tableCellStyles, el.fontSize, el.color, el.fontWeight, el.fontStyle, el.textDecoration, el.fontFamily]);

    return (
        <div
            className="w-full h-full relative nodrag nopan"
            style={{
                cursor: editingTableId === el.id ? 'default' : 'move',
                outline: editingTableId === el.id ? '2px solid #3b82f6' : 'none',
                outlineOffset: '1px',
                userSelect: editingTableId === el.id ? 'text' : 'none',
                borderRadius: `${el.tableBorderRadiusTopLeft ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusTopRight ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusBottomRight ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusBottomLeft ?? el.tableBorderRadius ?? 0}px`,
            }}
            onMouseDown={(e) => {
                if (isLocked) return;
                // 편집 모드일 때만 전파를 차단하여 셀 선택/드래그 범위 선택 로직이 동작하게 함
                // 편집 모드가 아닐 때는 전파를 허용하여 CanvasElement의 handleElementMouseDown이 실행되게 함
                // → 표 이동, Shift+클릭 다중선택/해제가 동작
                if (editingTableId === el.id) {
                    e.stopPropagation();
                }
            }}
            onDoubleClick={(e) => {
                // 더블 클릭은 항상 중단하여 상위 엔티티 등이 잡히지 않도록 함.
                e.stopPropagation();
                if (isLocked) return;

                const target = e.target as HTMLElement | null;
                const cellElement = target?.closest?.('[data-cell-index]') as HTMLElement | null;
                if (cellElement) {
                    const idx = parseInt(cellElement.getAttribute('data-cell-index') || '-1', 10);
                    if (idx !== -1) {
                        setEditingTableId(el.id);
                        setEditingCellIndex(idx);
                        setSelectedCellIndices([idx]);
                        return;
                    }
                }

                setEditingTableId(el.id);
                setSelectedCellIndices([]);
                setEditingCellIndex(null);
            }}
            onClick={(e) => {
                if (editingTableId === el.id && e.target === e.currentTarget) {
                    setEditingTableId(null);
                    setSelectedCellIndices([]);
                    setEditingCellIndex(null);
                }
            }}
        >
            <div
                className="w-full h-full overflow-hidden"
                style={{
                    display: 'grid',
                    gridTemplateColumns: (() => {
                        const widths = el.tableColWidths || Array(cols).fill(100 / cols);
                        return widths.map(w => `${w}%`).join(' ');
                    })(),
                    gridTemplateRows: (() => {
                        const heights = el.tableRowHeights || Array(rows).fill(100 / rows);
                        return heights.map(h => `${h}%`).join(' ');
                    })(),
                    borderRadius: `${el.tableBorderRadiusTopLeft ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusTopRight ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusBottomRight ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusBottomLeft ?? el.tableBorderRadius ?? 0}px`,
                    borderTop: `${el.tableBorderTopWidth ?? el.strokeWidth ?? 1}px ${el.tableBorderTopStyle ?? 'solid'} ${el.tableBorderTop || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                    borderBottom: `${el.tableBorderBottomWidth ?? el.strokeWidth ?? 1}px ${el.tableBorderBottomStyle ?? 'solid'} ${el.tableBorderBottom || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                    borderLeft: `${el.tableBorderLeftWidth ?? el.strokeWidth ?? 1}px ${el.tableBorderLeftStyle ?? 'solid'} ${el.tableBorderLeft || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                    borderRight: `${el.tableBorderRightWidth ?? el.strokeWidth ?? 1}px ${el.tableBorderRightStyle ?? 'solid'} ${el.tableBorderRight || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                }}
            >
                {(() => {
                    const cellElements: React.ReactNode[] = [];
                    for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
                        const { r, c } = flatIdxToRowCol(cellIndex, cols);
                        const v2 = v2Cells[cellIndex];
                        if (v2 && v2.isMerged) continue;

                        const cellData = v2 ? v2.content : (() => { const raw = el.tableCellData?.[cellIndex]; return (raw != null && raw !== '') ? String(raw) : ''; })();
                        const cellColor = el.tableCellColors?.[cellIndex];
                        const cellStyle = { ...(el.tableCellStyles?.[cellIndex] || {}), ...(localCellStyles[cellIndex] || {}) };
                        const isCellSelected = editingTableId === el.id && selectedCellIndices.includes(cellIndex);
                        const isCellEditing = editingTableId === el.id && editingCellIndex === cellIndex;
                        const isHeaderRow = r === 0;
                        const cellRowSpan = v2 ? v2.rowSpan : 1;
                        const cellColSpan = v2 ? v2.colSpan : 1;
                        const isLastCol = (c + cellColSpan) === cols;
                        const isLastRow = (r + cellRowSpan) === rows;

                        const globalBorderColor = hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6);
                        const globalBorderWidth = el.strokeWidth ?? 1;
                        const innerHColor = el.tableBorderInsideH || globalBorderColor;
                        const innerVColor = el.tableBorderInsideV || globalBorderColor;
                        const innerHWidth = el.tableBorderInsideHWidth ?? globalBorderWidth;
                        const innerVWidth = el.tableBorderInsideVWidth ?? globalBorderWidth;
                        const innerHStyle = el.tableBorderInsideHStyle ?? 'solid';
                        const innerVStyle = el.tableBorderInsideVStyle ?? 'solid';

                        const getBorder = (side: 'Top' | 'Bottom' | 'Left' | 'Right', isEdge: boolean) => {
                            const colorKey = `border${side}` as keyof typeof cellStyle;
                            const widthKey = `border${side}Width` as keyof typeof cellStyle;
                            const styleKey = `border${side}Style` as keyof typeof cellStyle;

                            const canUseCellOverride = side === 'Bottom' || side === 'Right' || isEdge;
                            if (canUseCellOverride && (cellStyle[colorKey] !== undefined || cellStyle[widthKey] !== undefined || cellStyle[styleKey] !== undefined)) {
                                const w = cellStyle[widthKey] ?? el[`tableBorder${side}Width`] ?? globalBorderWidth;
                                const s = cellStyle[styleKey] ?? el[`tableBorder${side}Style`] ?? 'solid';
                                const c = cellStyle[colorKey] || el[`tableBorder${side}`] || globalBorderColor;
                                return `${w}px ${s} ${c}`;
                            }
                            if (side === 'Top' || side === 'Left') return 'none';
                            if (side === 'Right' && isEdge) return 'none';
                            if (side === 'Bottom' && isEdge) return 'none';
                            if (side === 'Bottom') return `${innerHWidth}px ${innerHStyle} ${innerHColor}`;
                            if (side === 'Right') return `${innerVWidth}px ${innerVStyle} ${innerVColor}`;
                            return 'none';
                        };

                        const borderTop = getBorder('Top', r === 0);
                        const borderBottom = getBorder('Bottom', isLastRow);
                        const borderLeft = getBorder('Left', c === 0);
                        const borderRight = getBorder('Right', isLastCol);
                        const cellBg = hexToRgba(cellColor || el.fill || (isHeaderRow ? '#f1f5f9' : '#ffffff'), el.fillOpacity ?? 1);

                        cellElements.push(
                            <div
                                key={cellIndex}
                                data-cell-index={cellIndex}
                                className={`relative px-1 py-0.5 text-[10px] leading-tight flex items-center justify-center nodrag nopan ${isHeaderRow && !cellColor ? 'font-bold text-[#2c3e7c]' : 'text-gray-700'}`}
                                style={{
                                    gridColumn: cellColSpan > 1 ? `span ${cellColSpan}` : undefined,
                                    gridRow: cellRowSpan > 1 ? `span ${cellRowSpan}` : undefined,
                                    backgroundColor: cellBg,
                                    borderTop, borderBottom, borderLeft, borderRight,
                                    outline: isCellSelected ? '2px solid #3b82f6' : 'none',
                                    outlineOffset: '-1px',
                                    cursor: editingTableId === el.id ? 'crosshair' : 'default',
                                    textAlign: cellStyle.textAlign || el.textAlign || 'center',
                                    verticalAlign: cellStyle.verticalAlign || el.verticalAlign || 'middle',
                                    overflow: 'hidden', minWidth: 0, minHeight: 0,
                                }}
                                onMouseDown={(e) => {
                                    // 편집 중인 경우에는 셀 선택/편집 로직을 위해 전파를 차단
                                    if (editingTableId === el.id) {
                                        e.stopPropagation();

                                        // Shift+클릭 시 셀 선택 해제 (편집 모드 내부 로직)
                                        if (e.shiftKey && selectedCellIndices.includes(cellIndex)) {
                                            setSelectedCellIndices(selectedCellIndices.filter(idx => idx !== cellIndex));
                                            return;
                                        }

                                        if (isLocked) return;
                                        if (editingCellIndex !== null) setEditingCellIndex(null);
                                        isDraggingCellSelectionRef.current = true;
                                        dragStartCellIndexRef.current = cellIndex;
                                        setSelectedCellIndices([cellIndex]);
                                        const onMouseUp = () => {
                                            isDraggingCellSelectionRef.current = false;
                                            window.removeEventListener('mouseup', onMouseUp);
                                        };
                                        window.addEventListener('mouseup', onMouseUp);
                                    }
                                    // 편집 모드가 아닐 때는 전파를 허용하여 (handleElementMouseDown) 테이블 전체 선택/해제/이동 기능이 작동하게 함
                                }}
                                onClick={(e) => {
                                    // 편집 모드에서는 클릭 이벤트가 상위로 전파되어 화면 선택이 풀리는 것을 방지
                                    if (editingTableId === el.id) {
                                        e.stopPropagation();
                                    }
                                }}
                                onMouseEnter={() => {
                                    if (!isDraggingCellSelectionRef.current || editingTableId !== el.id) return;
                                    const startIdx = dragStartCellIndexRef.current;
                                    if (startIdx < 0) return;
                                    const start = flatIdxToRowCol(startIdx, cols);
                                    const rMin = Math.min(start.r, r);
                                    const rMax = Math.max(start.r, r);
                                    const cMin = Math.min(start.c, c);
                                    const cMax = Math.max(start.c, c);
                                    const newSelection: number[] = [];
                                    for (let ri = rMin; ri <= rMax; ri++) {
                                        for (let ci = cMin; ci <= cMax; ci++) {
                                            newSelection.push(rowColToFlatIdx(ri, ci, cols));
                                        }
                                    }
                                    setSelectedCellIndices(newSelection);
                                }}
                            >
                                {isCellEditing ? (
                                    <EditableTableCell
                                        tableId={el.id}
                                        value={cellData}
                                        cellIndex={cellIndex}
                                        isLocked={isLocked}
                                        restoreSelectionRef={tableCellSelectionRestoreRef}
                                        autoFocus
                                        onValueChange={(html) => {
                                            const newV2 = deepCopyCells(getV2Cells(el));
                                            if (newV2[cellIndex]) newV2[cellIndex] = { ...newV2[cellIndex], content: html };
                                            const newData = [...(el.tableCellData || [])];
                                            newData[cellIndex] = html;

                                            // 편집된 셀은 더 이상 컴포넌트 잠금 대상이 아니도록 인덱스 제거
                                            const currentLocked = el.tableCellLockedIndices || (el.fromComponentId ? Array.from({ length: totalCells }, (_, k) => k) : []);
                                            const newLocked = currentLocked.filter(idx => idx !== cellIndex);

                                            updateElement(el.id, {
                                                tableCellData: newData,
                                                tableCellDataV2: newV2,
                                                tableCellLockedIndices: newLocked.length > 0 ? newLocked : (el.fromComponentId ? [] : undefined)
                                            });
                                        }}
                                        onSelectionChange={(rect) => {
                                            setTextSelectionRect(rect);
                                            setTextSelectionFromTable(rect ? { tableId: el.id, cellIndex } : null);
                                        }}
                                        onBlur={() => {
                                            setEditingCellIndex(null);
                                            flushPendingSync();
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                setEditingCellIndex(null);
                                                flushPendingSync();
                                                return;
                                            }
                                            if (e.key === 'Tab') {
                                                e.preventDefault();
                                                syncUpdate({ drawElements: getDrawElements() });
                                                const dir = e.shiftKey ? -1 : 1;
                                                const next = (cellIndex + dir + totalCells) % totalCells;
                                                setEditingCellIndex(next);
                                                setSelectedCellIndices([next]);
                                            }
                                        }}
                                        onMouseDown={(e) => {
                                        if (!e.shiftKey) {
                                            e.stopPropagation();
                                        }
                                        // Shift 키를 누른 경우에는 이벤트 전파를 허용하여 상위 객체의 선택 해제 로직이 동작하도록 함
                                    }}
                                        className="w-full h-full bg-white border-none outline-none p-1 absolute inset-0 z-[20] nodrag nopan"
                                        style={{
                                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                            fontSize: (cellStyle.fontSize ?? el.fontSize ?? 14),
                                            fontWeight: cellStyle.fontWeight || el.fontWeight || 'normal',
                                            fontStyle: cellStyle.fontStyle || el.fontStyle || 'normal',
                                            textDecoration: cellStyle.textDecoration || el.textDecoration || 'none',
                                            fontFamily: resolveFontFamilyCSS(cellStyle.fontFamily || el.fontFamily),
                                            color: cellStyle.color ?? el.color ?? '#333333',
                                        }}
                                    />
                                ) : (
                                    <div
                                        dir="ltr"
                                        className="whitespace-pre-wrap w-full h-full flex overflow-hidden min-w-0 nodrag nopan"
                                        style={{
                                            alignItems: cellStyle.verticalAlign === 'top' ? 'flex-start' : cellStyle.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                                            justifyContent: cellStyle.textAlign === 'left' ? 'flex-start' : cellStyle.textAlign === 'right' ? 'flex-end' : 'center',
                                            wordBreak: 'break-word', unicodeBidi: 'isolate',
                                            fontSize: cellStyle.fontSize ?? el.fontSize ?? 14,
                                            fontWeight: cellStyle.fontWeight || el.fontWeight || 'normal',
                                            fontStyle: cellStyle.fontStyle || el.fontStyle || 'normal',
                                            textDecoration: cellStyle.textDecoration || el.textDecoration || 'none',
                                            fontFamily: resolveFontFamilyCSS(cellStyle.fontFamily || el.fontFamily),
                                            color: cellStyle.color ?? el.color ?? '#333333',
                                            pointerEvents: 'none',
                                        }}
                                        dangerouslySetInnerHTML={{ __html: cellData || '' }}
                                    />
                                )}
                            </div>
                        );
                    }
                    return cellElements;
                })()}
            </div>

            {/* Column Resize Handles */}
            {editingTableId === el.id && !isLocked && (() => {
                const widthsLocal = el.tableColWidths || Array(cols).fill(100 / cols);
                const heightsLocal = el.tableRowHeights || Array(rows).fill(100 / rows);

                let accLeft = 0;
                return Array.from({ length: cols - 1 }).map((_, colIdx) => {
                    const currentLeft = accLeft + widthsLocal[colIdx];
                    accLeft = currentLeft;

                    let accTop = 0;
                    return Array.from({ length: rows }).map((__, rowIdx) => {
                        const h = heightsLocal[rowIdx];
                        const top = accTop;
                        accTop += h;

                        if (colBoundariesHidden[colIdx]?.[rowIdx]) return null;

                        return (
                            <div
                                key={`col-resize-${colIdx}-${rowIdx}`}
                                className="nodrag absolute cursor-col-resize z-[115] group/colresize"
                                style={{ left: `calc(${currentLeft}% - 4px)`, top: `${top}%`, height: `${h}%`, width: 8 }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const startX = e.clientX;
                                    const startWidths = [...widthsLocal];
                                    const tableRect = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
                                    const tableWidthPx = tableRect?.width ?? el.width;
                                    const minWidthPercent = Math.max(5, (20 / tableWidthPx) * 100);

                                    const findMasterSpanInRow = (r: number, targetC: number): { start: number; end: number } => {
                                        // Find a non-merged master cell in this row whose (colSpan,rowSpan) covers targetC.
                                        for (let start = 0; start <= targetC; start++) {
                                            const idx = rowColToFlatIdx(r, start, cols);
                                            const cell = v2Cells[idx];
                                            if (!cell || cell.isMerged) continue;
                                            const colSpan = cell.colSpan || 1;
                                            const end = start + colSpan - 1;
                                            if (targetC >= start && targetC <= end) {
                                                return { start, end };
                                            }
                                        }
                                        return { start: targetC, end: targetC };
                                    };

                                    const leftSpan = findMasterSpanInRow(rowIdx, colIdx);
                                    const rightSpan = findMasterSpanInRow(rowIdx, colIdx + 1);

                                    const applyDeltaFlow = (
                                        widths: number[],
                                        indices: number[],
                                        delta: number,
                                        direction: 'towardStart' | 'towardEnd'
                                    ): number => {
                                        let remaining = delta;
                                        const order = direction === 'towardStart' ? [...indices].reverse() : [...indices];
                                        for (const i of order) {
                                            if (Math.abs(remaining) < 0.01) break;
                                            const currentW = widths[i];
                                            let nextW = currentW + remaining;
                                            if (remaining < 0) nextW = Math.max(minWidthPercent, nextW);
                                            widths[i] = nextW;
                                            remaining -= (nextW - currentW);
                                        }
                                        return remaining;
                                    };

                                    const leftIndices = Array.from({ length: leftSpan.end - leftSpan.start + 1 }, (_, k) => leftSpan.start + k);
                                    const rightIndices = Array.from({ length: rightSpan.end - rightSpan.start + 1 }, (_, k) => rightSpan.start + k);

                                    const handleMove = (moveE: MouseEvent) => {
                                        moveE.preventDefault(); moveE.stopPropagation();
                                        const deltaX = moveE.clientX - startX;
                                        const deltaPercent = (deltaX / tableWidthPx) * 100;
                                        const newWidths = [...startWidths];

                                        // deltaPercent > 0 : left group grows, right group shrinks
                                        // deltaPercent < 0 : left group shrinks, right group grows
                                        const leftRemaining = applyDeltaFlow(newWidths, leftIndices, deltaPercent, 'towardStart');
                                        const leftApplied = deltaPercent - leftRemaining;

                                        const rightRemaining = applyDeltaFlow(newWidths, rightIndices, -leftApplied, 'towardEnd');
                                        if (Math.abs(rightRemaining) >= 0.01) {
                                            // Right side couldn't absorb full delta (min width hit). Undo the unbalanced remainder on the left.
                                            applyDeltaFlow(newWidths, leftIndices, rightRemaining, 'towardStart');
                                        }

                                        updateElement(el.id, { tableColWidths: newWidths });
                                    };
                                    const handleUp = () => {
                                        window.removeEventListener('mousemove', handleMove, true);
                                        window.removeEventListener('mouseup', handleUp, true);
                                        syncUpdate({ drawElements: getDrawElements() });
                                    };
                                    window.addEventListener('mousemove', handleMove, true);
                                    window.addEventListener('mouseup', handleUp, true);
                                }}
                            >
                                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-blue-400 opacity-0 group-hover/colresize:opacity-100 transition-opacity" />
                            </div>
                        );
                    });
                });
            })()}

            {/* Row Resize Handles */}
            {editingTableId === el.id && !isLocked && (() => {
                const heights = el.tableRowHeights || Array(rows).fill(100 / rows);
                let accPercent = 0;
                return Array.from({ length: rows - 1 }).map((_, idx) => {
                    const currentRowHeight = heights[idx];
                    accPercent += currentRowHeight;

                    const mergedSegments = getMergedRowSegments(idx);
                    return mergedSegments.map((seg, segIdx) => (
                        <div
                            key={`row-resize-${idx}-${segIdx}`}
                            className="nodrag absolute cursor-row-resize z-[120] group/rowresize"
                            style={{ top: `${accPercent}%`, height: 8, marginTop: -4, left: `${seg.left}%`, width: `${seg.width}%` }}
                            onMouseDown={(e) => {
                                e.stopPropagation(); e.preventDefault();
                                const startY = e.clientY;
                                const startHeights = [...heights];
                                const handleMove = (moveE: MouseEvent) => {
                                    moveE.preventDefault();
                                    const deltaY = moveE.clientY - startY;
                                    const deltaPercent = (deltaY / el.height) * 100;
                                    const newHeights = [...startHeights];
                                    const minH = 2;
                                    let h1 = startHeights[idx] + deltaPercent;
                                    let h2 = startHeights[idx + 1] - deltaPercent;
                                    if (h1 < minH) { h2 -= (minH - h1); h1 = minH; }
                                    if (h2 < minH) { h1 -= (minH - h2); h2 = minH; }
                                    newHeights[idx] = h1; newHeights[idx + 1] = h2;
                                    updateElement(el.id, { tableRowHeights: newHeights });
                                };
                                const handleUp = () => {
                                    window.removeEventListener('mousemove', handleMove, true);
                                    window.removeEventListener('mouseup', handleUp, true);
                                    syncUpdate({ drawElements: getDrawElements() });
                                };
                                window.addEventListener('mousemove', handleMove, true);
                                window.addEventListener('mouseup', handleUp, true);
                            }}
                        >
                            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[2px] bg-blue-400 opacity-0 group-hover/rowresize:opacity-100 transition-opacity" />
                        </div>
                    ));
                });
            })()}
        </div>
    );
});

export default TableElement;
