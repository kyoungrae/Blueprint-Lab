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
    const rows = el.tableRows || 3;
    const cols = el.tableCols || 3;
    const totalCells = rows * cols;

    if (el.tableCellDataV2 && el.tableCellDataV2.length > 0) {
        const v2 = el.tableCellDataV2;

        // 길이가 정확히 맞으면 deep copy 반환 (직접 참조 반환 시 외부 변형 위험 방지)
        if (v2.length === totalCells) {
            return v2.map(cell => cell
                ? { ...cell, content: cell.content != null ? String(cell.content) : '' }
                : { content: '', rowSpan: 1, colSpan: 1, isMerged: false }
            );
        }

        // 길이가 안 맞는 V2는 인덱스를 재해석하지 않고
        // 앞에서부터 가능한 부분만 사용하고 나머지는 빈 셀로 채운다.
        // 이렇게 하면 열/행 변경 시 기존 내용이 다른 칸으로 "튀는" 현상을 막을 수 있다.
        const out: TableCellData[] = [];
        const copyLen = Math.min(v2.length, totalCells);
        for (let i = 0; i < copyLen; i++) {
            out.push(v2[i]
                ? { ...v2[i], content: v2[i].content != null ? String(v2[i].content) : '' }
                : { content: '', rowSpan: 1, colSpan: 1, isMerged: false }
            );
        }
        for (let i = copyLen; i < totalCells; i++) {
            out.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });
        }

        return out;
    }

    // V2 데이터가 없을 때 레거시 데이터로 복원
    const legacyCells = el.tableCellData || Array(totalCells).fill('');
    const legacySpans = el.tableCellSpans;

    const v2Cells: TableCellData[] = [];
    for (let i = 0; i < totalCells; i++) {
        const span = legacySpans?.[i];
        const isHidden = span ? (span.rowSpan === 0 && span.colSpan === 0) : false;
        // 레거시 값이 숫자 등 비문자열일 수 있으므로 명시적으로 String 변환
        const rawContent = legacyCells[i];
        const content = (rawContent != null && rawContent !== '') ? String(rawContent) : '';
        v2Cells.push({
            content,
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

export const getVisibleCounts = (el: DrawElement): { visibleRows: number; visibleCols: number } => {
    const rows = el.tableRows || 1;
    const cols = el.tableCols || 1;
    const v2Cells = getV2Cells(el);

    let maxVisibleCols = 0;
    for (let r = 0; r < rows; r++) {
        let rowCellCount = 0;
        for (let c = 0; c < cols; c++) {
            const cell = v2Cells[rowColToFlatIdx(r, c, cols)];
            if (!cell?.isMerged) rowCellCount++;
        }
        maxVisibleCols = Math.max(maxVisibleCols, rowCellCount);
    }

    let maxVisibleRows = 0;
    for (let c = 0; c < cols; c++) {
        let colCellCount = 0;
        for (let r = 0; r < rows; r++) {
            const cell = v2Cells[rowColToFlatIdx(r, c, cols)];
            if (!cell?.isMerged) colCellCount++;
        }
        maxVisibleRows = Math.max(maxVisibleRows, colCellCount);
    }

    return {
        visibleRows: Math.max(1, maxVisibleRows),
        visibleCols: Math.max(1, maxVisibleCols),
    };
};

export const gcd = (a: number, b: number): number => {
    return b === 0 ? a : gcd(b, a % b);
};
