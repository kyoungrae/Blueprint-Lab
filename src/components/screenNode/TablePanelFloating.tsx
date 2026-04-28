import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    X, GripVertical, Settings2, Square, Circle,
    Combine, Split, Plus, Minus,
    AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
    AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
    AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
    Bold, Italic, Underline, Strikethrough, Type, Palette
} from 'lucide-react';
import type { DrawElement, TableCellData } from '../../types/screenDesign';
import { flatIdxToRowCol, rowColToFlatIdx, getV2Cells, getVisibleCounts } from './types';
import PremiumTooltip from './PremiumTooltip';
import { useStore } from 'reactflow';

const getPanelPortalRoot = () => document.getElementById('panel-portal-root') || document.body;

export interface TablePanelFloatingProps {
    show: boolean;
    selectedEl: DrawElement;
    drawElements: DrawElement[];
    tablePanelPos: { x: number; y: number };
    setTablePanelPos: (pos: { x: number; y: number }) => void;
    isLocked: boolean;
    editingTableId: string | null;
    selectedCellIndices: number[];
    setSelectedCellIndices: (indices: number[]) => void;
    setEditingCellIndex: (idx: number | null) => void;
    showSplitDialog: boolean;
    setShowSplitDialog: (v: boolean) => void;
    splitTarget: { elId: string; cellIdx: number } | null;
    splitRows: number;
    setSplitRows: (v: React.SetStateAction<number>) => void;
    splitCols: number;
    setSplitCols: (v: React.SetStateAction<number>) => void;
    screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
    flowToScreenPosition: (pos: { x: number; y: number }) => { x: number; y: number };
    update: (updates: Record<string, unknown>) => void;
    syncUpdate: (updates: Record<string, unknown>) => void;
    handleMergeCells: (el: DrawElement) => void;
    handleSplitCells: (el: DrawElement) => void;
    handleEqualizeRowHeights: (el: DrawElement) => void;
    handleEqualizeColWidths: (el: DrawElement) => void;
    handleExecSplit: (el: DrawElement, cellIdx: number, rows: number, cols: number) => void;
    saveV2Cells: (elId: string, v2: TableCellData[], extra?: Partial<DrawElement>) => void;
    getScreenById: (id: string) => { drawElements: DrawElement[] } | undefined;
    screenId: string;
    onClose: () => void;
}

const TablePanelFloating: React.FC<TablePanelFloatingProps> = ({
    show,
    selectedEl,
    drawElements,
    tablePanelPos,
    setTablePanelPos,
    isLocked,
    editingTableId,
    selectedCellIndices,
    setSelectedCellIndices,
    setEditingCellIndex,
    showSplitDialog,
    setShowSplitDialog,
    splitTarget,
    splitRows,
    setSplitRows,
    splitCols,
    setSplitCols,
    screenToFlowPosition,
    flowToScreenPosition,
    update,
    syncUpdate,
    handleMergeCells,
    handleSplitCells,
    handleEqualizeRowHeights,
    handleEqualizeColWidths,
    handleExecSplit,
    saveV2Cells,
    getScreenById,
    screenId,
    onClose,
}) => {
    const isDraggingTablePanelRef = useRef(false);
    // Force re-render on viewport transformation to keep position in sync
    useStore(s => s.transform);

    if (!show || selectedEl.type !== 'table') return null;

    const rows = selectedEl.tableRows || 3;
    const cols = selectedEl.tableCols || 3;
    const totalCells = rows * cols;

    const { visibleRows, visibleCols } = getVisibleCounts(selectedEl);

    const getVisualMapsAndFlattened = (el: DrawElement): { visRows: number; visCols: number; flattened: TableCellData[]; visHeights: number[]; visWidths: number[] } | null => {
        if (!el || el.type !== 'table') return null;
        const r = el.tableRows ?? 1;
        const c = el.tableCols ?? 1;
        const v2Cells = getV2Cells(el);
        const paddedV2 = [...v2Cells];
        while (paddedV2.length < r * c) paddedV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });

        const normalizePercents = (arr: number[]): number[] => {
            const safe = arr.map(v => (Number.isFinite(v) ? v : 0));
            const sum = safe.reduce((a, b) => a + b, 0);
            if (sum <= 0) return Array(arr.length).fill(100 / Math.max(1, arr.length));
            return safe.map(v => (v * 100) / sum);
        };

        const findCoveringMaster = (targetRow: number, targetCol: number): { r0: number; c0: number; rowSpan: number; colSpan: number; cell: TableCellData } | null => {
            for (let rr = targetRow; rr >= 0; rr--) {
                for (let cc = targetCol; cc >= 0; cc--) {
                    const cell = paddedV2[rowColToFlatIdx(rr, cc, c)];
                    if (!cell || cell.isMerged) continue;
                    const rowSpan = cell.rowSpan || 1;
                    const colSpan = cell.colSpan || 1;
                    const rowEnd = rr + rowSpan - 1;
                    const colEnd = cc + colSpan - 1;
                    if (targetRow >= rr && targetRow <= rowEnd && targetCol >= cc && targetCol <= colEnd) {
                        return { r0: rr, c0: cc, rowSpan, colSpan, cell };
                    }
                }
            }
            return null;
        };

        const hiddenColBoundary: boolean[] = Array(Math.max(0, c - 1)).fill(false);
        for (let boundaryCol = 0; boundaryCol < c - 1; boundaryCol++) {
            let hiddenEverywhere = true;
            for (let rr = 0; rr < r; rr++) {
                const master = findCoveringMaster(rr, boundaryCol);
                if (!master) {
                    hiddenEverywhere = false;
                    break;
                }
                const masterColEnd = master.c0 + (master.colSpan || 1) - 1;
                if (masterColEnd < boundaryCol + 1) {
                    hiddenEverywhere = false;
                    break;
                }
            }
            hiddenColBoundary[boundaryCol] = hiddenEverywhere;
        }

        const hiddenRowBoundary: boolean[] = Array(Math.max(0, r - 1)).fill(false);
        for (let boundaryRow = 0; boundaryRow < r - 1; boundaryRow++) {
            let hiddenEverywhere = true;
            for (let cc = 0; cc < c; cc++) {
                const master = findCoveringMaster(boundaryRow, cc);
                if (!master) {
                    hiddenEverywhere = false;
                    break;
                }
                const masterRowEnd = master.r0 + (master.rowSpan || 1) - 1;
                if (masterRowEnd < boundaryRow + 1) {
                    hiddenEverywhere = false;
                    break;
                }
            }
            hiddenRowBoundary[boundaryRow] = hiddenEverywhere;
        }

        const rowMap: number[] = Array(r).fill(0);
        let vr = 0;
        for (let rr = 0; rr < r; rr++) {
            rowMap[rr] = vr;
            if (rr < r - 1 && !hiddenRowBoundary[rr]) vr++;
        }

        const colMap: number[] = Array(c).fill(0);
        let vc = 0;
        for (let cc = 0; cc < c; cc++) {
            colMap[cc] = vc;
            if (cc < c - 1 && !hiddenColBoundary[cc]) vc++;
        }

        const visRows = vr + 1;
        const visCols = vc + 1;
        const repRow: number[] = Array(visRows).fill(-1);
        const repCol: number[] = Array(visCols).fill(-1);
        for (let rr = 0; rr < r; rr++) if (repRow[rowMap[rr]] === -1) repRow[rowMap[rr]] = rr;
        for (let cc = 0; cc < c; cc++) if (repCol[colMap[cc]] === -1) repCol[colMap[cc]] = cc;

        const flattened: (TableCellData | null)[] = Array(visRows * visCols).fill(null);

        const logicalWidths = normalizePercents((el.tableColWidths && el.tableColWidths.length === c)
            ? el.tableColWidths
            : Array(c).fill(100 / Math.max(1, c)));
        const logicalHeights = normalizePercents((el.tableRowHeights && el.tableRowHeights.length === r)
            ? el.tableRowHeights
            : Array(r).fill(100 / Math.max(1, r)));

        const visWidthsRaw = Array(visCols).fill(0);
        for (let j = 0; j < c; j++) visWidthsRaw[colMap[j]] += logicalWidths[j] ?? 0;
        const visHeightsRaw = Array(visRows).fill(0);
        for (let i = 0; i < r; i++) visHeightsRaw[rowMap[i]] += logicalHeights[i] ?? 0;

        const visWidths = normalizePercents(visWidthsRaw);
        const visHeights = normalizePercents(visHeightsRaw);

        // Re-index existing master cells into the visual grid, preserving merge structure.
        for (let rr = 0; rr < r; rr++) {
            for (let cc = 0; cc < c; cc++) {
                const cell = paddedV2[rowColToFlatIdx(rr, cc, c)];
                if (!cell || cell.isMerged) continue;

                const rowSpan = Math.max(1, cell.rowSpan || 1);
                const colSpan = Math.max(1, cell.colSpan || 1);
                const lastLoR = Math.min(r - 1, rr + rowSpan - 1);
                const lastLoC = Math.min(c - 1, cc + colSpan - 1);

                const vR = rowMap[rr];
                const vC = colMap[cc];
                const vREnd = rowMap[lastLoR];
                const vCEnd = colMap[lastLoC];
                const newRowSpan = Math.max(1, vREnd - vR + 1);
                const newColSpan = Math.max(1, vCEnd - vC + 1);

                const vIdx = rowColToFlatIdx(vR, vC, visCols);
                if (flattened[vIdx]) continue;

                flattened[vIdx] = {
                    content: cell.content ?? '',
                    rowSpan: newRowSpan,
                    colSpan: newColSpan,
                    isMerged: false,
                };

                for (let dr = 0; dr < newRowSpan; dr++) {
                    for (let dc = 0; dc < newColSpan; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const sIdx = rowColToFlatIdx(vR + dr, vC + dc, visCols);
                        flattened[sIdx] = { content: '', rowSpan: 1, colSpan: 1, isMerged: true };
                    }
                }
            }
        }

        // Fill any remaining cells as independent masters.
        for (let i = 0; i < flattened.length; i++) {
            if (!flattened[i]) flattened[i] = { content: '', rowSpan: 1, colSpan: 1, isMerged: false };
        }

        return { visRows, visCols, flattened: flattened as TableCellData[], visHeights, visWidths };
    };

    const cellColorPresets = [
        'transparent', '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0',
        '#fee2e2', '#fef3c7', '#dcfce7', '#dbeafe', '#ede9fe',
        '#2c3e7c', '#1e40af', '#059669', '#d97706', '#dc2626'
    ];

    const handleTablePanelHeaderMouseDown = (e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();
        isDraggingTablePanelRef.current = true;
        const flowAtClick = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const offsetFlowX = flowAtClick.x - tablePanelPos.x;
        const offsetFlowY = flowAtClick.y - tablePanelPos.y;
        const onMove = (me: MouseEvent) => {
            if (!isDraggingTablePanelRef.current) return;
            me.stopImmediatePropagation();
            const flowAtMove = screenToFlowPosition({ x: me.clientX, y: me.clientY });
            setTablePanelPos({ x: flowAtMove.x - offsetFlowX, y: flowAtMove.y - offsetFlowY });
        };
        const onUp = () => {
            isDraggingTablePanelRef.current = false;
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp);
    };

    const tablePanelScreenPos = flowToScreenPosition({ x: tablePanelPos.x, y: tablePanelPos.y });

    const updateEl = (updates: Partial<DrawElement>) => {
        const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, ...updates } : it);
        update({ drawElements: next });
        syncUpdate({ drawElements: next });
    };

    return createPortal(
        <div
            data-table-panel
            data-screen-id={screenId}
            className="nodrag floating-panel fixed z-[9000] bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[400px] animate-in fade-in zoom-in origin-top-left"
            style={{
                left: tablePanelScreenPos.x,
                top: tablePanelScreenPos.y,
                // 수정: zoom에 따른 스케일 변화를 완전히 제거하고 고정된 값을 사용합니다.
            transform: `scale(0.85)`, // 피그마처럼 일정한 크기 유지
            transformOrigin: 'top left',
            }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between border-b border-gray-100 pb-2 cursor-grab active:cursor-grabbing group/header"
                onMouseDown={handleTablePanelHeaderMouseDown}
            >
                <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                    <Settings2 size={14} className="text-[#2c3e7c]" />
                    <span className="text-[12px] font-bold text-gray-700">표 설정</span>
                </div>
                <button
                    onClick={() => {
                        onClose();
                        setSelectedCellIndices([]);
                        setEditingCellIndex(null);
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    className="p-1 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                >
                    <X size={13} />
                </button>
            </div>

            {/* Row / Col controls */}
            <div className="flex flex-col gap-3">
                {/* Row count */}
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-600 font-medium">행 수</span>
                    <div className="flex items-center gap-1.5">
                        <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => {
                                const currentElements = getScreenById(screenId)?.drawElements ?? drawElements;
                                const el = currentElements.find(e => e.id === selectedEl.id);
                                if (!el || el.type !== 'table') return;
                                const flattenedInfo = getVisualMapsAndFlattened(el);
                                if (!flattenedInfo) return;
                                const { visRows, visCols, flattened, visHeights, visWidths } = flattenedInfo;
                                if (visRows <= 1) return;
                                const newRows = visRows - 1;
                                const newV2 = flattened.slice(0, newRows * visCols).map((cell, idx) => {
                                    if (!cell) return { content: '', rowSpan: 1, colSpan: 1, isMerged: false };
                                    if (cell.isMerged) return cell;
                                    const { r: rr } = flatIdxToRowCol(idx, visCols);
                                    const maxRowSpan = Math.max(1, newRows - rr);
                                    const rowSpan = Math.min(Math.max(1, cell.rowSpan || 1), maxRowSpan);
                                    return { ...cell, rowSpan };
                                });
                                const nextHeights = (() => {
                                    const sliced = visHeights.slice(0, newRows);
                                    const sum = sliced.reduce((a, b) => a + b, 0);
                                    if (sum <= 0) return Array(newRows).fill(100 / Math.max(1, newRows));
                                    return sliced.map(v => (v * 100) / sum);
                                })();
                                saveV2Cells(el.id, newV2, {
                                    tableRows: newRows,
                                    tableCols: visCols,
                                    tableRowHeights: nextHeights,
                                    tableColWidths: visWidths,
                                    tableRowColWidths: undefined,
                                    tableCellLockedIndices: undefined,
                                } as Partial<DrawElement>);
                                setSelectedCellIndices([]);
                                setEditingCellIndex(null);
                            }}
                            className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
                        >−</button>
                        <span className="w-14 text-center text-[13px] font-bold text-[#2c3e7c]">{visibleRows}</span>
                        <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => {
                                const currentElements = getScreenById(screenId)?.drawElements ?? drawElements;
                                const el = currentElements.find(e => e.id === selectedEl.id);
                                if (!el || el.type !== 'table') return;
                                const flattenedInfo = getVisualMapsAndFlattened(el);
                                if (!flattenedInfo) return;
                                const { visRows, visCols, flattened, visHeights, visWidths } = flattenedInfo;
                                const newRows = visRows + 1;

                                const newRowCells: TableCellData[] = Array(visCols).fill(null).map(() => ({ content: '', rowSpan: 1, colSpan: 1, isMerged: false }));
                                const newV2 = [...flattened, ...newRowCells];
                                const nextHeights = (() => {
                                    const base = visHeights;
                                    const newRowHeight = 100 / Math.max(1, newRows);
                                    const scale = (100 - newRowHeight) / 100;
                                    const scaled = base.map(h => h * scale);
                                    return [...scaled, newRowHeight];
                                })();
                                saveV2Cells(el.id, newV2, {
                                    tableRows: newRows,
                                    tableCols: visCols,
                                    tableRowHeights: nextHeights,
                                    tableColWidths: visWidths,
                                    tableRowColWidths: undefined,
                                    tableCellLockedIndices: undefined,
                                } as Partial<DrawElement>);
                                setSelectedCellIndices([]);
                                setEditingCellIndex(null);
                            }}
                            className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
                        >+</button>
                    </div>
                </div>

                {/* Col count */}
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-600 font-medium">열 수</span>
                    <div className="flex items-center gap-1.5">
                        <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => {
                                const currentElements = getScreenById(screenId)?.drawElements ?? drawElements;
                                const el = currentElements.find(e => e.id === selectedEl.id);
                                if (!el || el.type !== 'table') return;
                                const flattenedInfo = getVisualMapsAndFlattened(el);
                                if (!flattenedInfo) return;
                                const { visRows, visCols, flattened, visHeights, visWidths } = flattenedInfo;
                                if (visCols <= 1) return;
                                const newCols = visCols - 1;
                                const newV2: TableCellData[] = [];
                                for (let ri = 0; ri < visRows; ri++) {
                                    for (let ci = 0; ci < newCols; ci++) {
                                        newV2.push(flattened[ri * visCols + ci] || { content: '', rowSpan: 1, colSpan: 1, isMerged: false });
                                    }
                                }
                                // Clamp colSpan so masters don't overflow the new right edge.
                                for (let idx = 0; idx < newV2.length; idx++) {
                                    const cell = newV2[idx];
                                    if (!cell || cell.isMerged) continue;
                                    const { c: cc } = flatIdxToRowCol(idx, newCols);
                                    const maxColSpan = Math.max(1, newCols - cc);
                                    cell.colSpan = Math.min(Math.max(1, cell.colSpan || 1), maxColSpan);
                                }
                                const nextWidths = (() => {
                                    const sliced = visWidths.slice(0, newCols);
                                    const sum = sliced.reduce((a, b) => a + b, 0);
                                    if (sum <= 0) return Array(newCols).fill(100 / Math.max(1, newCols));
                                    return sliced.map(v => (v * 100) / sum);
                                })();
                                saveV2Cells(el.id, newV2, {
                                    tableRows: visRows,
                                    tableCols: newCols,
                                    tableRowHeights: visHeights,
                                    tableColWidths: nextWidths,
                                    tableRowColWidths: undefined,
                                    tableCellLockedIndices: undefined,
                                } as Partial<DrawElement>);
                                setSelectedCellIndices([]);
                                setEditingCellIndex(null);
                            }}
                            className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
                        >−</button>
                        <span className="w-14 text-center text-[13px] font-bold text-[#2c3e7c]">{visibleCols}</span>
                        <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => {
                                const currentElements = getScreenById(screenId)?.drawElements ?? drawElements;
                                const el = currentElements.find(e => e.id === selectedEl.id);
                                if (!el || el.type !== 'table') return;
                                const flattenedInfo = getVisualMapsAndFlattened(el);
                                if (!flattenedInfo) return;
                                const { visRows, visCols, flattened, visHeights, visWidths } = flattenedInfo;
                                const newCols = visCols + 1;
                                const newV2: TableCellData[] = [];
                                for (let ri = 0; ri < visRows; ri++) {
                                    for (let ci = 0; ci < visCols; ci++) {
                                        newV2.push(flattened[ri * visCols + ci] || { content: '', rowSpan: 1, colSpan: 1, isMerged: false });
                                    }
                                    newV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });
                                }
                                const nextWidths = (() => {
                                    const base = visWidths;
                                    const newColWidth = 100 / Math.max(1, newCols);
                                    const scale = (100 - newColWidth) / 100;
                                    const scaled = base.map(w => w * scale);
                                    return [...scaled, newColWidth];
                                })();
                                saveV2Cells(el.id, newV2, {
                                    tableRows: visRows,
                                    tableCols: newCols,
                                    tableRowHeights: visHeights,
                                    tableColWidths: nextWidths,
                                    tableRowColWidths: undefined,
                                    tableCellLockedIndices: undefined,
                                } as Partial<DrawElement>);
                                setSelectedCellIndices([]);
                                setEditingCellIndex(null);
                            }}
                            className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
                        >+</button>
                    </div>
                </div>

                {/* Merge / Split Buttons */}
                {editingTableId === selectedEl.id && (
                    <div className="flex flex-col gap-2 p-1.5 bg-gray-50/50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1.5 px-1 mb-1">
                            <Combine size={12} className="text-blue-500" />
                            <span className="text-[11px] font-bold text-gray-600">셀 편집</span>
                        </div>
                        <div className="flex gap-1.5">
                            <button
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => handleMergeCells(selectedEl)}
                                disabled={selectedCellIndices.length < 2}
                                className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all ${selectedCellIndices.length >= 2 ? 'bg-white shadow-sm text-blue-600 border border-blue-100 hover:bg-blue-50' : 'bg-gray-50/50 text-gray-300 border border-transparent cursor-not-allowed'}`}
                            >
                                <Combine size={16} />
                                <span className="text-[10px] font-bold">합치기</span>
                            </button>
                            <div className="flex-1 relative">
                                <button
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={() => handleSplitCells(selectedEl)}
                                    disabled={selectedCellIndices.length === 0}
                                    className={`w-full flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all ${selectedCellIndices.length > 0 ? 'bg-white shadow-sm text-gray-600 border border-gray-100 hover:bg-gray-50' : 'bg-gray-50/50 text-gray-300 border border-transparent cursor-not-allowed'}`}
                                >
                                    <Split size={16} />
                                    <span className="text-[10px] font-bold">나누기</span>
                                </button>
                                {showSplitDialog && splitTarget && splitTarget.elId === selectedEl.id && (
                                    <div
                                        className="absolute top-full right-0 mt-2 z-[300] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[220px] animate-in slide-in-from-top-2 duration-200"
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-[12px] font-bold text-gray-700">셀 분할 설정</span>
                                            <button onClick={() => setShowSplitDialog(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div className="space-y-3 mb-4">
                                            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-100">
                                                <span className="text-[11px] text-gray-600 font-bold ml-1">행</span>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => setSplitRows(prev => Math.max(1, prev - 1))} className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors"><Minus size={10} /></button>
                                                    <span className="w-4 text-center text-[12px] font-bold text-blue-600">{splitRows}</span>
                                                    <button onClick={() => setSplitRows(prev => Math.min(10, prev + 1))} className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Plus size={10} /></button>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-100">
                                                <span className="text-[11px] text-gray-600 font-bold ml-1">열</span>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => setSplitCols(prev => Math.max(1, prev - 1))} className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors"><Minus size={10} /></button>
                                                    <span className="w-4 text-center text-[12px] font-bold text-blue-600">{splitCols}</span>
                                                    <button onClick={() => setSplitCols(prev => Math.min(10, prev + 1))} className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Plus size={10} /></button>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                handleExecSplit(selectedEl, splitTarget.cellIdx, splitRows, splitCols);
                                                setShowSplitDialog(false);
                                            }}
                                            className="w-full py-2 bg-[#2c3e7c] text-white rounded-lg text-[11px] font-bold hover:bg-[#1e2d5e] transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                                        >
                                            <Split size={12} />
                                            <span>분할 실행</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 셀 크기 맞춤 */}
                {editingTableId === selectedEl.id && (
                    <div className="flex flex-col gap-2 p-1.5 bg-gray-50/50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1.5 px-1 mb-1">
                            <AlignVerticalDistributeCenter size={12} className="text-blue-500" />
                            <span className="text-[11px] font-bold text-gray-600">셀 크기 맞춤</span>
                        </div>
                        <div className="flex gap-1.5">
                            <div className="flex-1 min-w-0">
                                <PremiumTooltip label="선택한 셀들의 행 높이를 먼저 선택한 셀의 높이로 맞춥니다" wrapperClassName="w-full" offsetBottom={50} screenId={screenId}>
                                    <button
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={() => handleEqualizeRowHeights(selectedEl)}
                                        disabled={selectedCellIndices.length < 2}
                                        className={`w-full flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all ${selectedCellIndices.length >= 2 ? 'bg-white shadow-sm text-blue-600 border border-blue-100 hover:bg-blue-50' : 'bg-gray-50/50 text-gray-300 border border-transparent cursor-not-allowed'}`}
                                    >
                                        <AlignVerticalDistributeCenter size={16} />
                                        <span className="text-[10px] font-bold">셀 높이 같게</span>
                                    </button>
                                </PremiumTooltip>
                            </div>
                            <div className="flex-1 min-w-0">
                                <PremiumTooltip label="선택한 셀들의 열 너비를 먼저 선택한 셀의 너비로 맞춥니다" wrapperClassName="w-full" offsetBottom={50} screenId={screenId}>
                                    <button
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={() => handleEqualizeColWidths(selectedEl)}
                                        disabled={selectedCellIndices.length < 2}
                                        className={`w-full flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all ${selectedCellIndices.length >= 2 ? 'bg-white shadow-sm text-gray-600 border border-gray-100 hover:bg-gray-50' : 'bg-gray-50/50 text-gray-300 border border-transparent cursor-not-allowed'}`}
                                    >
                                        <AlignHorizontalDistributeCenter size={16} />
                                        <span className="text-[10px] font-bold">셀 너비 같게</span>
                                    </button>
                                </PremiumTooltip>
                            </div>
                        </div>
                    </div>
                )}

                {/* Table Border Settings */}
                <div className="flex flex-col gap-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-gray-700">
                        <Square size={12} className="text-gray-400" />
                        <span className="text-[11px] font-bold">테두리 설정</span>
                    </div>

                    {/* All Borders */}
                    <div className="flex flex-col gap-1.5 pb-3 border-b border-dashed border-gray-100">
                        <span className="text-[10px] text-gray-500 font-medium pl-0.5">전체</span>
                        <div className="flex items-center gap-2">
                            <div className="relative w-6 h-6 rounded border border-gray-200 shadow-sm overflow-hidden flex-shrink-0">
                                <input
                                    type="color"
                                    value={(selectedCellIndices.length > 0 && editingTableId === selectedEl.id)
                                        ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.borderTop || selectedEl.stroke || '#cbd5e1')
                                        : (selectedEl.tableBorderTop || selectedEl.stroke || '#cbd5e1')}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (selectedCellIndices.length > 0 && editingTableId === selectedEl.id) {
                                            const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                            selectedCellIndices.forEach(idx => {
                                                const { r, c } = flatIdxToRowCol(idx, cols);
                                                const nextStyle = { ...(newStyles[idx] || {}), borderBottom: val, borderRight: val } as Record<string, unknown>;
                                                if (r === 0) nextStyle.borderTop = val;
                                                if (c === 0) nextStyle.borderLeft = val;
                                                newStyles[idx] = nextStyle;
                                            });
                                            updateEl({ tableCellStyles: newStyles });
                                        } else {
                                            updateEl({
                                                tableBorderTop: val,
                                                tableBorderBottom: val,
                                                tableBorderLeft: val,
                                                tableBorderRight: val,
                                                tableBorderInsideH: val,
                                                tableBorderInsideV: val
                                            });
                                        }
                                    }}
                                    onMouseDown={e => e.stopPropagation()}
                                    className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                                />
                                <div className="w-full h-full" style={{
                                    backgroundColor: (selectedCellIndices.length > 0 && editingTableId === selectedEl.id)
                                        ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.borderTop || selectedEl.stroke || '#cbd5e1')
                                        : (selectedEl.tableBorderTop || selectedEl.stroke || '#cbd5e1')
                                }} />
                            </div>
                            <div className="flex items-center gap-1 bg-gray-50 rounded px-1.5 py-1 border border-gray-100 flex-1">
                                <input
                                    type="number" min="0" max="10"
                                    value={(selectedCellIndices.length > 0 && editingTableId === selectedEl.id)
                                        ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.borderTopWidth ?? 1)
                                        : (selectedEl.tableBorderTopWidth ?? selectedEl.strokeWidth ?? 1)}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        if (selectedCellIndices.length > 0 && editingTableId === selectedEl.id) {
                                            const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                            selectedCellIndices.forEach(idx => {
                                                const { r, c } = flatIdxToRowCol(idx, cols);
                                                const nextStyle = { ...(newStyles[idx] || {}), borderBottomWidth: val, borderRightWidth: val } as Record<string, unknown>;
                                                if (r === 0) nextStyle.borderTopWidth = val;
                                                if (c === 0) nextStyle.borderLeftWidth = val;
                                                newStyles[idx] = nextStyle;
                                            });
                                            updateEl({ tableCellStyles: newStyles });
                                        } else {
                                            updateEl({ tableBorderTopWidth: val, tableBorderBottomWidth: val, tableBorderLeftWidth: val, tableBorderRightWidth: val, strokeWidth: val });
                                        }
                                    }}
                                    onMouseDown={e => e.stopPropagation()}
                                    className="w-full bg-transparent text-[11px] font-bold text-gray-700 outline-none"
                                />
                                <span className="text-[9px] text-gray-400">px</span>
                            </div>
                        </div>
                    </div>

                    {/* Per-direction borders */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {(['Top', 'Bottom', 'Left', 'Right'] as const).map(direction => {
                            const colorKey = `tableBorder${direction}` as keyof DrawElement;
                            const widthKey = `tableBorder${direction}Width` as keyof DrawElement;
                            const styleKey = `tableBorder${direction}Style` as keyof DrawElement;
                            const styleColorKey = `border${direction}`;
                            const styleWidthKey = `border${direction}Width`;
                            const label = direction === 'Top' ? '위' : direction === 'Bottom' ? '아래' : direction === 'Left' ? '왼쪽' : '오른쪽';
                            const isAnyCellSelected = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                            const firstCellOverride = isAnyCellSelected ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]] || {}) : {};
                            const currentColor = isAnyCellSelected
                                ? ((firstCellOverride as Record<string, string>)[styleColorKey] || (selectedEl[colorKey] as string) || selectedEl.stroke || '#cbd5e1')
                                : ((selectedEl[colorKey] as string) || selectedEl.stroke || '#cbd5e1');
                            const currentWidth = isAnyCellSelected
                                ? ((firstCellOverride as Record<string, number>)[styleWidthKey] !== undefined ? (firstCellOverride as Record<string, number>)[styleWidthKey] : (selectedEl[widthKey] as number ?? selectedEl.strokeWidth ?? 1))
                                : (selectedEl[widthKey] !== undefined ? (selectedEl[widthKey] as number) : (selectedEl.strokeWidth ?? 1));
                            const borderStyles = ['solid', 'dashed', 'dotted', 'double', 'none'] as const;
                            const currentStyle = (selectedEl[styleKey] as typeof borderStyles[number]) ?? 'solid';

                            return (
                                <div key={direction} className="flex flex-col gap-1.5">
                                    <span className="text-[10px] text-gray-500 font-medium pl-0.5">{label}</span>
                                    <div className="flex items-center gap-2">
                                        <div className="relative w-6 h-6 rounded border border-gray-200 shadow-sm overflow-hidden flex-shrink-0">
                                            <input type="color" value={currentColor}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (isAnyCellSelected) {
                                                        const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                        selectedCellIndices.forEach(idx => {
                                                            const { r, c } = flatIdxToRowCol(idx, cols);
                                                            let targetIdx = idx; let targetKey = styleColorKey;
                                                            if (direction === 'Top' && r > 0) { targetIdx = rowColToFlatIdx(r - 1, c, cols); targetKey = 'borderBottom'; }
                                                            else if (direction === 'Left' && c > 0) { targetIdx = rowColToFlatIdx(r, c - 1, cols); targetKey = 'borderRight'; }
                                                            newStyles[targetIdx] = { ...(newStyles[targetIdx] || {}), [targetKey]: val };
                                                        });
                                                        updateEl({ tableCellStyles: newStyles });
                                                    } else {
                                                        updateEl({ [colorKey]: val });
                                                    }
                                                }}
                                                onMouseDown={e => e.stopPropagation()}
                                                className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                                            />
                                            <div className="w-full h-full" style={{ backgroundColor: currentColor }} />
                                        </div>
                                        <div className="flex items-center gap-1 bg-gray-50 rounded px-1.5 py-1 border border-gray-100 flex-1">
                                            <input type="number" min="0" max="10" value={currentWidth}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    if (isAnyCellSelected) {
                                                        const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                        selectedCellIndices.forEach(idx => {
                                                            const { r, c } = flatIdxToRowCol(idx, cols);
                                                            let targetIdx = idx; let targetKey = styleWidthKey;
                                                            if (direction === 'Top' && r > 0) { targetIdx = rowColToFlatIdx(r - 1, c, cols); targetKey = 'borderBottomWidth'; }
                                                            else if (direction === 'Left' && c > 0) { targetIdx = rowColToFlatIdx(r, c - 1, cols); targetKey = 'borderRightWidth'; }
                                                            newStyles[targetIdx] = { ...(newStyles[targetIdx] || {}), [targetKey]: val };
                                                        });
                                                        updateEl({ tableCellStyles: newStyles });
                                                    } else {
                                                        updateEl({ [widthKey]: val });
                                                    }
                                                }}
                                                onMouseDown={e => e.stopPropagation()}
                                                className="w-full bg-transparent text-[11px] font-bold text-gray-700 outline-none"
                                            />
                                            <span className="text-[9px] text-gray-400">px</span>
                                        </div>
                                    </div>
                                    {!isAnyCellSelected && (
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {borderStyles.map((value) => {
                                                const isSelected = currentStyle === value;
                                                return (
                                                    <button key={value} type="button"
                                                        title={value === 'solid' ? '실선' : value === 'dashed' ? '대시' : value === 'dotted' ? '점선' : value === 'double' ? '이중선' : '없음'}
                                                        onMouseDown={e => e.stopPropagation()}
                                                        onClick={() => updateEl({ [styleKey]: value })}
                                                        className={`flex items-center justify-center w-7 h-7 rounded border transition-all shrink-0 ${isSelected ? 'border-[#2c3e7c] bg-blue-50 ring-1 ring-[#2c3e7c]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                                    >
                                                        {value === 'none' ? <div className="w-3.5 h-3.5 rounded bg-gray-200" /> : <div className="w-3.5 h-3.5 rounded bg-white" style={{ borderWidth: 1.5, borderStyle: value, borderColor: isSelected ? '#2c3e7c' : '#94a3b8' }} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Inside borders */}
                        {!(selectedCellIndices.length > 0 && editingTableId === selectedEl.id) && (<>
                            {(['H', 'V'] as const).map(dir => {
                                const label = dir === 'H' ? '안쪽 가로선' : '안쪽 세로선';
                                const colorKey = dir === 'H' ? 'tableBorderInsideH' : 'tableBorderInsideV';
                                const widthKey = dir === 'H' ? 'tableBorderInsideHWidth' : 'tableBorderInsideVWidth';
                                const styleKey = dir === 'H' ? 'tableBorderInsideHStyle' : 'tableBorderInsideVStyle';
                                const currentColor = (selectedEl[colorKey as keyof DrawElement] as string) || selectedEl.stroke || '#cbd5e1';
                                const currentWidth = (selectedEl[widthKey as keyof DrawElement] as number) ?? selectedEl.strokeWidth ?? 1;
                                const currentStyle = (selectedEl[styleKey as keyof DrawElement] as string) ?? 'solid';
                                return (
                                    <div key={dir} className="flex flex-col gap-1.5">
                                        <span className="text-[10px] text-gray-500 font-medium pl-0.5">{label}</span>
                                        <div className="flex items-center gap-2">
                                            <div className="relative w-6 h-6 rounded border border-gray-200 shadow-sm overflow-hidden flex-shrink-0">
                                                <input type="color" value={currentColor}
                                                    onChange={(e) => updateEl({ [colorKey]: e.target.value })}
                                                    onMouseDown={e => e.stopPropagation()}
                                                    className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                                                />
                                                <div className="w-full h-full" style={{ backgroundColor: currentColor }} />
                                            </div>
                                            <div className="flex items-center gap-1 bg-gray-50 rounded px-1.5 py-1 border border-gray-100 flex-1">
                                                <input type="number" min="0" max="10" value={currentWidth}
                                                    onChange={(e) => updateEl({ [widthKey]: parseInt(e.target.value) || 0 })}
                                                    onMouseDown={e => e.stopPropagation()}
                                                    className="w-full bg-transparent text-[11px] font-bold text-gray-700 outline-none"
                                                />
                                                <span className="text-[9px] text-gray-400">px</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {(['solid', 'dashed', 'dotted', 'double', 'none'] as const).map((value) => {
                                                const isSelected = currentStyle === value;
                                                return (
                                                    <button key={value} type="button"
                                                        title={value === 'solid' ? '실선' : value === 'dashed' ? '대시' : value === 'dotted' ? '점선' : value === 'double' ? '이중선' : '없음'}
                                                        onMouseDown={e => e.stopPropagation()}
                                                        onClick={() => updateEl({ [styleKey]: value })}
                                                        className={`flex items-center justify-center w-7 h-7 rounded border transition-all shrink-0 ${isSelected ? 'border-[#2c3e7c] bg-blue-50 ring-1 ring-[#2c3e7c]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                                    >
                                                        {value === 'none' ? <div className="w-3.5 h-3.5 rounded bg-gray-200" /> : <div className="w-3.5 h-3.5 rounded bg-white" style={{ borderWidth: 1.5, borderStyle: value, borderColor: isSelected ? '#2c3e7c' : '#94a3b8' }} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </>)}
                    </div>

                    {/* Border Radius */}
                    {!(selectedCellIndices.length > 0 && editingTableId === selectedEl.id) && (
                        <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-1.5 text-gray-700">
                                <Circle size={10} className="text-gray-400" />
                                <span className="text-[10px] font-medium pl-0.5">테두리 곡률</span>
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5 border border-gray-100">
                                    <div className="w-2.5 h-2.5 border-2 border-gray-400 rounded-md" />
                                    <div className="flex-1 flex gap-2 items-center">
                                        <input type="range" min="0" max="20" step="1" value={selectedEl.tableBorderRadius ?? 0}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value) || 0;
                                                updateEl({ tableBorderRadius: val, tableBorderRadiusTopLeft: val, tableBorderRadiusTopRight: val, tableBorderRadiusBottomLeft: val, tableBorderRadiusBottomRight: val });
                                            }}
                                            onMouseDown={e => e.stopPropagation()}
                                            className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        />
                                        <span className="text-[10px] text-gray-700 font-mono w-4 text-right">{selectedEl.tableBorderRadius ?? 0}</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { key: 'tableBorderRadiusTopLeft', iconClass: 'border-t-2 border-l-2 rounded-tl-md' },
                                        { key: 'tableBorderRadiusTopRight', iconClass: 'border-t-2 border-r-2 rounded-tr-md' },
                                        { key: 'tableBorderRadiusBottomLeft', iconClass: 'border-b-2 border-l-2 rounded-bl-md' },
                                        { key: 'tableBorderRadiusBottomRight', iconClass: 'border-b-2 border-r-2 rounded-br-md' },
                                    ].map(({ key, iconClass }) => (
                                        <div key={key} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5 border border-gray-100">
                                            <div className={`w-2.5 h-2.5 border-gray-400 ${iconClass}`} />
                                            <input type="number" min="0" max="100"
                                                value={(selectedEl[key as keyof DrawElement] as number) ?? selectedEl.tableBorderRadius ?? 0}
                                                onChange={(e) => updateEl({ [key]: parseInt(e.target.value) || 0 })}
                                                onMouseDown={e => e.stopPropagation()}
                                                className="w-full bg-transparent text-[11px] text-gray-700 outline-none text-right font-mono"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Font Preferences */}
                <div className="flex flex-col gap-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-gray-700">
                        <Type size={12} className="text-gray-400" />
                        <span className="text-[11px] font-bold">폰트 설정</span>
                    </div>
                    <div className="flex flex-col gap-3">
                        {/* Font Size & Color */}
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col gap-1.5 flex-1">
                                <span className="text-[10px] text-gray-500 font-medium pl-0.5">글자 크기</span>
                                <div className="flex items-center gap-1 bg-gray-50 rounded px-1.5 py-1 border border-gray-100">
                                    <input
                                        type="number" min="8" max="72"
                                        value={(() => {
                                            const isTableCellMode = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                            const s = isTableCellMode ? selectedEl.tableCellStyles?.[selectedCellIndices[0]] : null;
                                            return s?.fontSize || selectedEl.fontSize || 13;
                                        })()}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 13;
                                            if (selectedCellIndices.length > 0 && editingTableId === selectedEl.id) {
                                                const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                selectedCellIndices.forEach(idx => {
                                                    newStyles[idx] = { ...(newStyles[idx] || {}), fontSize: val };
                                                });
                                                updateEl({ tableCellStyles: newStyles });
                                            } else {
                                                updateEl({ fontSize: val });
                                            }
                                        }}
                                        onMouseDown={e => e.stopPropagation()}
                                        className="w-full bg-transparent text-[11px] font-bold text-gray-700 outline-none"
                                    />
                                    <span className="text-[9px] text-gray-400">px</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1.5 flex-1">
                                <span className="text-[10px] text-gray-500 font-medium pl-0.5">글자 색상</span>
                                <div className="flex items-center gap-2">
                                    <div className="relative w-7 h-7 rounded border border-gray-200 shadow-sm overflow-hidden flex-shrink-0">
                                        <input
                                            type="color"
                                            value={(() => {
                                                const isTableCellMode = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                                const s = isTableCellMode ? selectedEl.tableCellStyles?.[selectedCellIndices[0]] : null;
                                                return s?.color || selectedEl.color || '#333333';
                                            })()}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (selectedCellIndices.length > 0 && editingTableId === selectedEl.id) {
                                                    const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                    selectedCellIndices.forEach(idx => {
                                                        newStyles[idx] = { ...(newStyles[idx] || {}), color: val };
                                                    });
                                                    updateEl({ tableCellStyles: newStyles });
                                                } else {
                                                    updateEl({ color: val });
                                                }
                                            }}
                                            onMouseDown={e => e.stopPropagation()}
                                            className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                                        />
                                        <div className="w-full h-full" style={{
                                            backgroundColor: (() => {
                                                const isTableCellMode = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                                const s = isTableCellMode ? selectedEl.tableCellStyles?.[selectedCellIndices[0]] : null;
                                                return s?.color || selectedEl.color || '#333333';
                                            })()
                                        }} />
                                    </div>
                                    <Palette size={14} className="text-gray-400" />
                                </div>
                            </div>
                        </div>

                        {/* Bold, Italic, Underline Icons */}
                        <div className="flex gap-1.5">
                            {[
                                { key: 'fontWeight', value: 'bold', normal: 'normal', icon: <Bold size={14} />, label: '굵게' },
                                { key: 'fontStyle', value: 'italic', normal: 'normal', icon: <Italic size={14} />, label: '기울임' },
                                { key: 'textDecoration', value: 'underline', normal: 'none', icon: <Underline size={14} />, label: '밑줄' },
                                { key: 'textDecoration', value: 'line-through', normal: 'none', icon: <Strikethrough size={14} />, label: '취소선' },
                            ].map((opt, i) => {
                                const isTableCellMode = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                const currentVal = isTableCellMode
                                    ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.[opt.key as any] || selectedEl[opt.key as keyof DrawElement] || opt.normal)
                                    : (selectedEl[opt.key as keyof DrawElement] || opt.normal);

                                const isActive = currentVal === opt.value;

                                return (
                                    <button
                                        key={i}
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={() => {
                                            const nextVal = isActive ? opt.normal : opt.value;
                                            if (isTableCellMode) {
                                                const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                selectedCellIndices.forEach(idx => {
                                                    newStyles[idx] = { ...(newStyles[idx] || {}), [opt.key]: nextVal };
                                                });
                                                updateEl({ tableCellStyles: newStyles });
                                            } else {
                                                updateEl({ [opt.key]: nextVal });
                                            }
                                        }}
                                        className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all ${isActive ? 'bg-[#2c3e7c] text-white border-[#2c3e7c] shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                        title={opt.label}
                                    >
                                        {opt.icon}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Text Alignment */}
                <div className="flex flex-col gap-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-gray-700">
                        <AlignHorizontalJustifyCenter size={12} className="text-gray-400" />
                        <span className="text-[11px] font-bold">텍스트 정렬 설정</span>
                    </div>
                    <div className="flex flex-col gap-3">
                        {/* Horizontal */}
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] text-gray-500 font-medium pl-0.5">가로 정렬</span>
                            <div className="flex p-1 bg-gray-100 rounded-xl gap-1">
                                {[
                                    { id: 'left', icon: <AlignHorizontalJustifyStart size={14} />, label: '왼쪽' },
                                    { id: 'center', icon: <AlignHorizontalJustifyCenter size={14} />, label: '가운데' },
                                    { id: 'right', icon: <AlignHorizontalJustifyEnd size={14} />, label: '오른쪽' }
                                ].map((opt) => {
                                    const isAnyCellSelected = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                    const activeVal = isAnyCellSelected
                                        ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.textAlign || selectedEl.textAlign || 'center')
                                        : (selectedEl.textAlign || 'center');
                                    const isActive = activeVal === opt.id;
                                    return (
                                        <button key={opt.id} onMouseDown={e => e.stopPropagation()}
                                            onClick={() => {
                                                if (isAnyCellSelected) {
                                                    const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                    selectedCellIndices.forEach(idx => { newStyles[idx] = { ...(newStyles[idx] || {}), textAlign: opt.id }; });
                                                    updateEl({ tableCellStyles: newStyles });
                                                } else {
                                                    updateEl({ textAlign: opt.id as 'left' | 'center' | 'right' });
                                                }
                                            }}
                                            className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-all ${isActive ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                            title={opt.label}
                                        >
                                            {opt.icon}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {/* Vertical */}
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] text-gray-500 font-medium pl-0.5">세로 정렬</span>
                            <div className="flex p-1 bg-gray-100 rounded-xl gap-1">
                                {[
                                    { id: 'top', icon: <AlignVerticalJustifyStart size={14} />, label: '상단' },
                                    { id: 'middle', icon: <AlignVerticalJustifyCenter size={14} />, label: '중단' },
                                    { id: 'bottom', icon: <AlignVerticalJustifyEnd size={14} />, label: '하단' }
                                ].map((opt) => {
                                    const isAnyCellSelected = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                    const activeVal = isAnyCellSelected
                                        ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.verticalAlign || selectedEl.verticalAlign || 'middle')
                                        : (selectedEl.verticalAlign || 'middle');
                                    const isActive = activeVal === opt.id;
                                    return (
                                        <button key={opt.id} onMouseDown={e => e.stopPropagation()}
                                            onClick={() => {
                                                if (isAnyCellSelected) {
                                                    const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                    selectedCellIndices.forEach(idx => { newStyles[idx] = { ...(newStyles[idx] || {}), verticalAlign: opt.id }; });
                                                    updateEl({ tableCellStyles: newStyles });
                                                } else {
                                                    updateEl({ verticalAlign: opt.id as 'top' | 'middle' | 'bottom' });
                                                }
                                            }}
                                            className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-all ${isActive ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                            title={opt.label}
                                        >
                                            {opt.icon}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cell color picker — 셀 선택 시 선택 셀만 / 표만 선택 시 fill + 전체 tableCellColors 동시 반영 (스타일 패널과 동일) */}
                <div className="flex flex-col gap-3 pt-3 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-gray-700">배경색</span>
                        {selectedCellIndices.length > 0 && editingTableId === selectedEl.id && (
                            <span className="text-[10px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded-full">
                                {selectedCellIndices.length}개 선택
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-1.5 flex-wrap">
                            {cellColorPresets.map(color => (
                                <button key={color} onMouseDown={e => e.stopPropagation()}
                                    onClick={() => {
                                        const isCellBgMode = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                        if (isCellBgMode) {
                                            const newCellColors = [...(selectedEl.tableCellColors || Array(totalCells).fill(undefined))] as (string | undefined)[];
                                            selectedCellIndices.forEach(idx => { newCellColors[idx] = color === 'transparent' ? undefined : color; });
                                            updateEl({ tableCellColors: newCellColors });
                                        } else {
                                            const fillVal = color === 'transparent' ? undefined : color;
                                            const newCellColors = Array(totalCells).fill(fillVal) as (string | undefined)[];
                                            updateEl({ fill: fillVal, tableCellColors: newCellColors });
                                        }
                                    }}
                                    className="w-5 h-5 rounded-full border-2 border-gray-200 hover:border-blue-400 hover:scale-125 transition-all flex items-center justify-center overflow-hidden shadow-sm"
                                    style={{ backgroundColor: color === 'transparent' ? 'white' : color }}
                                    title={color === 'transparent' ? '색 없음' : color}
                                >
                                    {color === 'transparent' && <div className="w-full h-[1.5px] bg-red-400 rotate-45" />}
                                </button>
                            ))}
                            <label className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300 hover:border-blue-400 hover:scale-125 transition-all flex items-center justify-center overflow-hidden cursor-pointer relative shadow-sm" title="직접 선택">
                                <Plus size={9} className="text-gray-400 pointer-events-none" />
                                <input type="color" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                    onMouseDown={e => e.stopPropagation()}
                                    onChange={(e) => {
                                        const color = e.target.value;
                                        const isCellBgMode = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                        if (isCellBgMode) {
                                            const newCellColors = [...(selectedEl.tableCellColors || Array(totalCells).fill(undefined))] as (string | undefined)[];
                                            selectedCellIndices.forEach(idx => { newCellColors[idx] = color; });
                                            updateEl({ tableCellColors: newCellColors });
                                        } else {
                                            const newCellColors = Array(totalCells).fill(color) as (string | undefined)[];
                                            updateEl({ fill: color, tableCellColors: newCellColors });
                                        }
                                    }}
                                />
                            </label>
                        </div>
                        <button onMouseDown={e => e.stopPropagation()}
                            onClick={() => {
                                const isCellBgMode = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                if (isCellBgMode) {
                                    const newCellColors = [...(selectedEl.tableCellColors || Array(totalCells).fill(undefined))] as (string | undefined)[];
                                    selectedCellIndices.forEach(idx => { newCellColors[idx] = undefined; });
                                    updateEl({ tableCellColors: newCellColors });
                                } else {
                                    const newCellColors = Array(totalCells).fill(undefined) as (string | undefined)[];
                                    updateEl({ fill: undefined, tableCellColors: newCellColors });
                                }
                            }}
                            className="text-[10px] text-gray-400 hover:text-red-500 transition-colors text-left"
                        >색상 초기화</button>
                    </div>
                </div>
            </div>
        </div>,
        getPanelPortalRoot()
    );
};

export default TablePanelFloating;
