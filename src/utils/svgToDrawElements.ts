/**
 * PPT HTML/VML 등에서 추출한 DrawElement[]에 표 감지·병합 적용
 */
import type { DrawElement, TableCellData } from '../types/screenDesign';

// 고정 상수 → viewBox 크기 기반으로 동적 계산 (아래 computeThresholds 참고)
const MIN_TABLE_CELLS = 4;

/** viewBox 크기에 비례한 임계값 계산 */
function computeThresholds(vw: number, vh: number) {
    const scale = Math.max(vw, vh, 1000) / 1000;
    return {
        ROW_Y_THRESHOLD: Math.round(12 * scale),
        CELL_X_GAP_THRESHOLD: Math.round(25 * scale),
        EMPTY_COLUMN_GAP_THRESHOLD: Math.round(80 * scale),
    };
}

function randomId(): string {
    return Math.random().toString(36).substr(2, 5);
}

/** PPT HTML/VML은 보통 단일 표이므로, 모든 그룹을 하나로 합쳐 No·체크박스 등 누락 컬럼 포함 */
function mergeAllGroupsForTableDetection(groups: Map<string, DrawElement[]>): DrawElement[][] {
    const all = Array.from(groups.values()).flat();
    return all.length > 0 ? [all] : [];
}

/** 그리드형 텍스트/rect로 표 감지 후 단일 table 요소로 병합 */
function tryDetectAndMergeTables(
    elements: DrawElement[],
    baseId: number,
    zIndexStart: number,
    thresholds: ReturnType<typeof computeThresholds>
): DrawElement[] {
    const { ROW_Y_THRESHOLD, CELL_X_GAP_THRESHOLD } = thresholds;

    const byGroup = new Map<string, DrawElement[]>();
    for (const el of elements) {
        const gid = el.groupId ?? '';
        const arr = byGroup.get(gid) ?? [];
        arr.push(el);
        byGroup.set(gid, arr);
    }

    const mergedGroups = mergeAllGroupsForTableDetection(byGroup);
    const tables: DrawElement[] = [];
    const mergedIds = new Set<string>();

    const tryGroup = (group: DrawElement[]) => {
        const texts = group.filter((e): e is DrawElement & { text: string } => e.type === 'text' && !!e.text);
        const rects = group.filter((e) => e.type === 'rect' && e.width > 2 && e.height > 2);
        const isCheckboxLike = (r: DrawElement) => {
            const ratio = r.width / (r.height || 1);
            return r.width >= 4 && r.width <= 35 && r.height >= 4 && r.height <= 35 && ratio >= 0.5 && ratio <= 1.5;
        };
        const checkboxRects = rects.filter(isCheckboxLike);
        const textRects = rects.filter((r) => r.text && !isCheckboxLike(r));

        const totalCells = texts.length + textRects.length + checkboxRects.length;
        if (totalCells < MIN_TABLE_CELLS) return;

        type CellItem = { el: DrawElement; isCheckbox: boolean };
        const items: CellItem[] = [
            ...texts.map((t) => ({ el: t, isCheckbox: false })),
            ...textRects.map((r) => ({ el: r, isCheckbox: false })),
            ...checkboxRects.map((r) => ({ el: r, isCheckbox: true })),
        ];

        // ── 1. Y 임계값 기반으로 행 분류 ───────────────────────────────────
        const sorted = [...items].sort((a, b) => {
            const dy = a.el.y - b.el.y;
            if (Math.abs(dy) > ROW_Y_THRESHOLD) return dy;
            return a.el.x - b.el.x;
        });

        const rows: CellItem[][] = [];
        let currentRow: CellItem[] = [];
        let lastY = -Infinity;

        for (const item of sorted) {
            const cy = item.el.y + item.el.height / 2;
            if (currentRow.length > 0 && cy - lastY > ROW_Y_THRESHOLD) {
                rows.push(currentRow);
                currentRow = [];
            }
            currentRow.push(item);
            lastY = cy;
        }
        if (currentRow.length > 0) rows.push(currentRow);

        // ── 2. 전체 행에서 X 기준 컬럼 경계 감지 (통합 방식) ───────────────
        // 모든 셀의 X 중심값을 모아 클러스터로 묶어 공통 컬럼 수를 결정
        const allXCenters = items.map((i) => i.el.x + i.el.width / 2).sort((a, b) => a - b);
        const colClusters: number[] = [];
        for (const cx of allXCenters) {
            const last = colClusters[colClusters.length - 1];
            if (last === undefined || cx - last > CELL_X_GAP_THRESHOLD) {
                colClusters.push(cx);
            }
        }
        const cols = Math.max(colClusters.length, 1);
        const rowsCount = rows.length;
        if (rowsCount < 2 || cols < 2) return;

        // ── 3. 각 아이템을 (row, col) 격자에 배치 ────────────────────────────
        const grid: (CellItem | null)[][] = Array.from({ length: rowsCount }, () =>
            Array(cols).fill(null)
        );

        rows.forEach((row, ri) => {
            for (const item of row) {
                const cx = item.el.x + item.el.width / 2;
                // 가장 가까운 컬럼 클러스터에 배치
                let bestCol = 0;
                let bestDist = Infinity;
                colClusters.forEach((clusterX, ci) => {
                    const dist = Math.abs(cx - clusterX);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestCol = ci;
                    }
                });
                // 이미 셀이 있다면 빈 슬롯을 앞뒤로 탐색
                if (grid[ri][bestCol] !== null) {
                    let placed = false;
                    for (let offset = 1; offset < cols; offset++) {
                        if (bestCol + offset < cols && grid[ri][bestCol + offset] === null) {
                            bestCol = bestCol + offset;
                            placed = true;
                            break;
                        }
                        if (bestCol - offset >= 0 && grid[ri][bestCol - offset] === null) {
                            bestCol = bestCol - offset;
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) return; // 넘치면 스킵
                }
                grid[ri][bestCol] = item;
            }
        });

        // ── 4. grid → cellData 직렬화 ─────────────────────────────────────
        const cellData: string[] = [];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (let r = 0; r < rowsCount; r++) {
            for (let c = 0; c < cols; c++) {
                const cellItem = grid[r][c];
                let content = '';
                if (cellItem) {
                    const textPart = (!cellItem.isCheckbox && cellItem.el.text?.trim()) ? cellItem.el.text.trim() : '';
                    content = textPart + (cellItem.isCheckbox ? '☐' : '');
                    const cell = cellItem.el;
                    minX = Math.min(minX, cell.x);
                    minY = Math.min(minY, cell.y);
                    maxX = Math.max(maxX, cell.x + cell.width);
                    maxY = Math.max(maxY, cell.y + cell.height);
                }
                cellData.push(content);
            }
        }

        // PPT SVG는 체크박스 열을 내보내지 않음 → No 다음에 빈 열 삽입 (두 번째 열이 "컬럼"이면 누락된 것)
        const firstHeader = (cellData[0] ?? '').trim();
        const secondHeader = (cellData[1] ?? '').trim();
        const hasNoColumn = /^No\.?$|^번호$/i.test(firstHeader);
        const secondIsColumn = /^컬럼$/i.test(secondHeader);
        let finalCellData = cellData;
        let finalCols = cols;
        if (hasNoColumn && secondIsColumn && rowsCount >= 2 && cols >= 2) {
            const inserted: string[] = [];
            for (let r = 0; r < rowsCount; r++) {
                inserted.push(cellData[r * cols + 0]); // No 또는 번호
                inserted.push(''); // 체크박스 열 (비움)
                for (let c = 1; c < cols; c++) {
                    inserted.push(cellData[r * cols + c]);
                }
            }
            finalCellData = inserted;
            finalCols = cols + 1;
        }

        // 배경 rect도 bounding box에 포함 + 컬럼/행 경계 추출 (셀 크기 비율 계산용)
        const cellRects = group.filter((e) => e.type === 'rect' && e.fill !== 'transparent' && e.width > 8 && e.height > 8);
        for (const rect of cellRects) {
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.width);
            maxY = Math.max(maxY, rect.y + rect.height);
        }

        const tableW = Math.max(maxX - minX, 100);
        const tableH = Math.max(maxY - minY, 40);

        // PPT SVG: path rect에서 컬럼/행 경계 추출 → tableColWidths, tableRowHeights (비율 %)
        const colBoundaries = [...new Set(cellRects.flatMap((r) => [r.x, r.x + r.width]))].sort((a, b) => a - b);
        const rowBoundaries = [...new Set(cellRects.flatMap((r) => [r.y, r.y + r.height]))].sort((a, b) => a - b);
        let tableColWidths: number[] | undefined;
        let tableRowHeights: number[] | undefined;
        if (colBoundaries.length === finalCols + 1 && rowBoundaries.length === rowsCount + 1) {
            const colWidthsPx = colBoundaries.slice(1).map((b, i) => b - colBoundaries[i]);
            const rowHeightsPx = rowBoundaries.slice(1).map((b, i) => b - rowBoundaries[i]);
            const totalColPx = colWidthsPx.reduce((a, b) => a + b, 0);
            const totalRowPx = rowHeightsPx.reduce((a, b) => a + b, 0);
            tableColWidths = totalColPx > 0 ? colWidthsPx.map((w) => (w / totalColPx) * 100) : undefined;
            tableRowHeights = totalRowPx > 0 ? rowHeightsPx.map((h) => (h / totalRowPx) * 100) : undefined;
        }

        const v2Cells: TableCellData[] = finalCellData.map((content) => ({
            content,
            rowSpan: 1,
            colSpan: 1,
            isMerged: false,
        }));

        const tableEl: DrawElement = {
            id: `el_${baseId}_table_${randomId()}`,
            type: 'table',
            x: minX,
            y: minY,
            width: tableW,
            height: tableH,
            fill: '#ffffff',
            stroke: '#000000',
            strokeWidth: 1,
            tableRows: rowsCount,
            tableCols: finalCols,
            tableCellData: finalCellData,
            tableCellDataV2: v2Cells,
            tableColWidths,
            tableRowHeights,
            tableBorderInsideH: '#000000',
            tableBorderInsideHWidth: 1,
            tableBorderInsideV: '#000000',
            tableBorderInsideVWidth: 1,
            zIndex: zIndexStart,
        };

        tables.push(tableEl);
        for (const t of texts) mergedIds.add(t.id);
        for (const r of rects) mergedIds.add(r.id);
        const gridLines = group.filter((e) => e.type === 'rect' && e.fill === 'transparent' && e.stroke);
        for (const g of gridLines) mergedIds.add(g.id);
    };

    for (const group of mergedGroups) {
        tryGroup(group);
    }

    if (tables.length === 0) return elements;

    const kept = elements.filter((e) => !mergedIds.has(e.id));
    const maxZ = Math.max(...kept.map((e) => e.zIndex ?? 1), ...tables.map((t) => t.zIndex ?? 1));
    tables.forEach((t, i) => {
        t.zIndex = maxZ + 1 + i;
    });
    return [...kept, ...tables];
}

/** PPT HTML/VML 등에서 추출한 요소들에 표 감지·병합 적용 (No, 체크박스 등 누락 컬럼 포함) */
export function detectAndMergeTables(elements: DrawElement[], vw = 2000, vh = 2000): DrawElement[] {
    if (elements.length === 0) return elements;
    const baseId = Date.now();
    const zIndexStart = Math.max(...elements.map((e) => e.zIndex ?? 1), 1);
    const thresholds = computeThresholds(vw, vh);
    return tryDetectAndMergeTables(elements, baseId, zIndexStart, thresholds);
}
