import type { Screen, DrawElement, TableCellData } from '../../types/screenDesign';

// ── Shared Props for sub-components ──────────────────────────

export interface ScreenNodeContext {
    screen: Screen;
    isLocked: boolean;
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
    drawElements: DrawElement[];
    updateElement: (id: string, updates: Partial<DrawElement>) => void;
    deleteElements: (ids: string[]) => void;
    hexToRgba: (hex: string, opacity?: number) => string;
}

export interface TableEditingState {
    editingTableId: string | null;
    setEditingTableId: (id: string | null) => void;
    editingCellIndex: number | null;
    setEditingCellIndex: (idx: number | null) => void;
    selectedCellIndices: number[];
    setSelectedCellIndices: (indices: number[]) => void;
}

export interface ElementSelectionState {
    selectedElementIds: string[];
    setSelectedElementIds: (ids: string[]) => void;
    editingTextId: string | null;
    setEditingTextId: (id: string | null) => void;
}

export interface PanelPosition {
    x: number | string;
    y: number;
}

// ── Utility: hexToRgba ──────────────────────────────────────
export const hexToRgba = (hex: string, opacity: number = 1): string => {
    if (!hex) return 'transparent';
    if (hex === 'transparent') return 'transparent';

    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// ── Table V2 Utilities ──────────────────────────────────────

export const flatIdxToRowCol = (flatIdx: number, totalCols: number): { r: number, c: number } => {
    return { r: Math.floor(flatIdx / totalCols), c: flatIdx % totalCols };
};

export const rowColToFlatIdx = (r: number, c: number, totalCols: number): number => {
    return r * totalCols + c;
};

export const getV2Cells = (el: DrawElement): TableCellData[] => {
    if (el.tableCellDataV2 && el.tableCellDataV2.length > 0) {
        return el.tableCellDataV2;
    }

    const rows = el.tableRows || 3;
    const cols = el.tableCols || 3;
    const totalCells = rows * cols;
    const legacyCells = el.tableCellData || Array(totalCells).fill('');
    const legacySpans = el.tableCellSpans;

    const v2Cells: TableCellData[] = [];
    for (let i = 0; i < totalCells; i++) {
        const span = legacySpans?.[i];
        const isHidden = span ? (span.rowSpan === 0 && span.colSpan === 0) : false;
        v2Cells.push({
            content: legacyCells[i] || '',
            rowSpan: span ? (span.rowSpan === 0 ? 1 : span.rowSpan) : 1,
            colSpan: span ? (span.colSpan === 0 ? 1 : span.colSpan) : 1,
            isMerged: isHidden,
        });
    }
    return v2Cells;
};

export const deepCopyCells = (cells: TableCellData[]): TableCellData[] => {
    return cells.map(c => ({ ...c }));
};

export const gcd = (a: number, b: number): number => {
    return b === 0 ? a : gcd(b, a % b);
};
