/**
 * SVG 파일을 파싱하여 DrawElement[]로 변환
 * PowerPoint 등에서 내보낸 SVG를 편집 가능한 객체로 가져오기
 */
import type { DrawElement, TableCellData } from '../types/screenDesign';

const SUPPORTED_TAGS = ['rect', 'circle', 'ellipse', 'text', 'path', 'line', 'polygon', 'polyline'];

// 고정 상수 → 이제 viewBox 크기 기반으로 동적 계산 (아래 computeThresholds 참고)
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

function parseNum(val: string | null, fallback: number): number {
    if (val == null || val === '') return fallback;
    const n = parseFloat(String(val).replace(/[a-zA-Z%]+$/, ''));
    return isNaN(n) ? fallback : n;
}

/** 루트 g의 translate(-x -y) 오프셋 추출 (PPT SVG용) - SVG 이동 전에 호출 필요 */
function getRootTranslateOffset(svgEl: SVGSVGElement): { offsetX: number; offsetY: number } {
    const rootG = svgEl.querySelector('g[transform]');
    if (!rootG) return { offsetX: 0, offsetY: 0 };
    const transform = rootG.getAttribute('transform');
    const match = transform?.match(/translate\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/);
    if (!match) return { offsetX: 0, offsetY: 0 };
    return { offsetX: parseFloat(match[1]), offsetY: parseFloat(match[2]) };
}

/** text 요소의 transform="matrix(1 0 0 1 x y)"에서 baseX, baseY 추출 (PPT SVG용) */
function getTextBaseFromTransform(textEl: Element): { baseX: number; baseY: number } {
    const transform = textEl.getAttribute('transform');
    const match = transform?.match(/matrix\s*\(\s*1\s+0\s+0\s+1\s+([-\d.]+)\s+([-\d.]+)\s*\)/);
    if (!match) return { baseX: 0, baseY: 0 };
    return { baseX: parseFloat(match[1]), baseY: parseFloat(match[2]) };
}

/** path d에서 단순 사각형 좌표 추출 (M x y L x2 y2 L x3 y3 L x4 y4 Z 형태) */
function parsePathRectCoords(d: string): { x: number; y: number; width: number; height: number } | null {
    const coords = d.match(/[-\d.]+/g)?.map(Number) ?? [];
    if (coords.length < 8) return null;
    const xs = [coords[0], coords[2], coords[4], coords[6]];
    const ys = [coords[1], coords[3], coords[5], coords[7]];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    if (width < 1 || height < 1) return null;
    return { x, y, width, height };
}

/** getCTM으로 bbox를 SVG 루트 좌표계로 변환 (transform/그룹 중첩 모두 처리) */
function bboxToRootCoords(
    el: SVGGraphicsElement,
    bbox: DOMRect,
    svg: SVGSVGElement
): { x: number; y: number; width: number; height: number } {
    const ctm = el.getCTM();
    if (!ctm) return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
    const pt = svg.createSVGPoint();
    const corners = [
        { x: bbox.x, y: bbox.y },
        { x: bbox.x + bbox.width, y: bbox.y },
        { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
        { x: bbox.x, y: bbox.y + bbox.height },
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
        pt.x = c.x;
        pt.y = c.y;
        const t = pt.matrixTransform(ctm);
        minX = Math.min(minX, t.x);
        minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x);
        maxY = Math.max(maxY, t.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function parseColor(val: string | null): string | undefined {
    if (!val || val === 'none') return undefined;
    return val;
}

/** SVG text/tspan에서 텍스트 추출 (단일 텍스트 블록용, tspan line break 포함) */
function getTextFromSvgText(el: Element): string {
    const parts: string[] = [];
    const walk = (node: Element) => {
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                const t = child.textContent?.trim();
                if (t) parts.push(t);
            } else if (child instanceof Element) {
                const tag = child.tagName.toLowerCase();
                if (tag === 'tspan') {
                    const dy = child.getAttribute('dy');
                    if (dy && parseFloat(dy) > 0) parts.push('\n');
                    walk(child);
                } else if (tag === 'text') {
                    walk(child);
                }
            }
        }
    };
    walk(el);
    return parts.join('').replace(/[ \t]+/g, ' ').trim() || el.textContent?.trim() || '';
}

/**
 * tspan이 Y축으로 나뉜 멀티라인 그리드인지 확인.
 * - Y값이 2개 이상 다를 때만 true (각 tspan을 별도 DrawElement로 분리)
 * - 같은 Y의 tspan들 (예: "2026-02-25", "\10,000") 은 false → getTextFromSvgText로 하나로 합침
 */
function hasPositionedTspans(textEl: Element): boolean {
    const tspans = Array.from(textEl.querySelectorAll('tspan'));
    if (tspans.length < 2) return false;
    // Y값 수집 (없는 경우 0으로 처리, 부동소수점은 반올림)
    const yVals = new Set<number>();
    for (const t of tspans) {
        const y = t.getAttribute('y');
        yVals.add(y !== null ? Math.round(parseFloat(y)) : 0);
    }
    // Y값이 2개 이상인 경우만 멀티라인 그리드로 처리
    return yVals.size >= 2;
}

/** 그룹들의 바운딩 박스가 겹치거나 가까우면 병합 (No, 체크박스 등 분리된 그룹 통합) */
function mergeSpatiallyOverlappingGroups(groups: Map<string, DrawElement[]>): DrawElement[][] {
    const groupList = Array.from(groups.values());
    if (groupList.length <= 1) return groupList;

    const bbox = (g: DrawElement[]) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const el of g) {
            minX = Math.min(minX, el.x);
            minY = Math.min(minY, el.y);
            maxX = Math.max(maxX, el.x + (el.width ?? 0));
            maxY = Math.max(maxY, el.y + (el.height ?? 0));
        }
        return { minX, minY, maxX, maxY };
    };
    const overlapOrClose = (a: ReturnType<typeof bbox>, b: ReturnType<typeof bbox>, pad = 200) =>
        !(a.maxX + pad < b.minX || b.maxX + pad < a.minX || a.maxY + pad < b.minY || b.maxY + pad < a.minY);

    const merged: DrawElement[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < groupList.length; i++) {
        if (used.has(i)) continue;
        let current = [...groupList[i]];
        used.add(i);
        let changed = true;
        while (changed) {
            changed = false;
            const cb = bbox(current);
            for (let j = 0; j < groupList.length; j++) {
                if (used.has(j)) continue;
                if (overlapOrClose(cb, bbox(groupList[j]))) {
                    current = current.concat(groupList[j]);
                    used.add(j);
                    changed = true;
                }
            }
        }
        merged.push(current);
    }
    return merged;
}

/** PPT SVG는 보통 단일 표이므로, 모든 그룹을 하나로 합쳐 No·체크박스 등 누락 컬럼 포함 */
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

        // PPT SVG는 체크박스 열을 내보내지 않음 → No 다음에 빈 열 삽입 (8열일 때만, 데이터 밀림 방지)
        const firstHeader = (cellData[0] ?? '').trim();
        const hasNoColumn = /^No\.?$|^번호$/i.test(firstHeader);
        let finalCellData = cellData;
        let finalCols = cols;
        if (hasNoColumn && rowsCount >= 2 && cols === 8) {
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

        // 배경 rect도 bounding box에 포함
        const cellRects = group.filter((e) => e.type === 'rect' && e.fill !== 'transparent' && e.width > 8 && e.height > 8);
        for (const r of cellRects) {
            minX = Math.min(minX, r.x);
            minY = Math.min(minY, r.y);
            maxX = Math.max(maxX, r.x + r.width);
            maxY = Math.max(maxY, r.y + r.height);
        }

        const tableW = Math.max(maxX - minX, 100);
        const tableH = Math.max(maxY - minY, 40);

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

/** SVG 요소에서 스타일 추출 */
function getStyle(el: Element): { fill?: string; stroke?: string; strokeWidth: number; opacity?: number } {
    const fill = parseColor(el.getAttribute('fill')) ?? parseColor(el.getAttribute('style')?.match(/fill:\s*([^;]+)/)?.[1]?.trim() ?? null);
    const stroke = parseColor(el.getAttribute('stroke')) ?? parseColor(el.getAttribute('style')?.match(/stroke:\s*([^;]+)/)?.[1]?.trim() ?? null);
    const strokeWidth = parseNum(el.getAttribute('stroke-width'), 1);
    const opacity = parseNum(el.getAttribute('opacity'), 1);
    return { fill: fill ?? '#ffffff', stroke: stroke ?? '#000000', strokeWidth, opacity: opacity < 1 ? opacity : undefined };
}

/** SVG 문자열을 DrawElement[]로 변환 */
export function parseSvgToDrawElements(svgString: string): DrawElement[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return [];

    const container = document.createElement('div');
    const vb = svg.getAttribute('viewBox');
    const [vw, vh] = vb ? vb.split(/\s+/).slice(2).map(Number) : [2000, 2000];
    const thresholds = computeThresholds(vw || 2000, vh || 2000);
    const size = Math.max(1000, vw || 2000, vh || 2000);
    // ✅ SVG를 container로 이동하기 전에 offset 추출 (이동 후엔 doc에서 찾을 수 없음)
    const { offsetX, offsetY } = getRootTranslateOffset(svg as SVGSVGElement);

    container.style.cssText = `position:absolute;left:-9999px;top:0;width:${size}px;height:${size}px;overflow:hidden;pointer-events:none`;
    container.appendChild(svg);
    document.body.appendChild(container);

    const elements: DrawElement[] = [];
    let zIndex = 1;
    const baseId = Date.now();

    const walk = (parent: Element, groupId?: string) => {
        const children = Array.from(parent.children);
        children.forEach((el, idx) => {
            const tag = el.tagName.toLowerCase();
            if (tag === 'g') {
                const gid = groupId ?? `g_${baseId}_${idx}`;
                walk(el, gid);
                return;
            }
            if (!SUPPORTED_TAGS.includes(tag)) return;

            const graphicsEl = el as SVGGraphicsElement;
            let bbox: DOMRect;
            try {
                bbox = graphicsEl.getBBox();
            } catch {
                return;
            }
            if (bbox.width < 0.5 && bbox.height < 0.5) return;

            if (tag === 'path') {
                const fill = el.getAttribute('fill') ?? el.getAttribute('style')?.match(/fill:\s*([^;]+)/)?.[1]?.trim();
                const stroke = el.getAttribute('stroke') ?? el.getAttribute('style')?.match(/stroke:\s*([^;]+)/)?.[1]?.trim();
                if ((!fill || fill === 'none') && (!stroke || stroke === 'none')) return;
            }

            const style = getStyle(el);
            const id = `el_${baseId}_${idx}_${randomId()}`;
            const root = bboxToRootCoords(graphicsEl, bbox, svg as SVGSVGElement);

            if (tag === 'rect') {
                const rx = parseNum(el.getAttribute('rx'), 0);
                elements.push({
                    id,
                    type: 'rect',
                    x: root.x,
                    y: root.y,
                    width: root.width,
                    height: root.height,
                    fill: style.fill,
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    borderRadius: rx,
                    opacity: style.opacity,
                    zIndex: zIndex++,
                    groupId: groupId,
                });
            } else if (tag === 'circle') {
                const r = parseNum(el.getAttribute('r'), Math.min(bbox.width, bbox.height) / 2);
                elements.push({
                    id,
                    type: 'circle',
                    x: root.x,
                    y: root.y,
                    width: root.width,
                    height: root.height,
                    fill: style.fill,
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    opacity: style.opacity,
                    zIndex: zIndex++,
                    groupId: groupId,
                });
            } else if (tag === 'ellipse') {
                elements.push({
                    id,
                    type: 'circle',
                    x: root.x,
                    y: root.y,
                    width: root.width,
                    height: root.height,
                    fill: style.fill,
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    opacity: style.opacity,
                    zIndex: zIndex++,
                    groupId: groupId,
                });
            } else if (tag === 'text') {
                const baseFontSize = parseNum(
                    el.getAttribute('font-size') ?? el.getAttribute('style')?.match(/font-size:\s*([^;]+)/)?.[1]?.trim() ?? '',
                    14
                );
                const fontWeight = el.getAttribute('font-weight') ?? el.getAttribute('style')?.match(/font-weight:\s*([^;]+)/)?.[1]?.trim();
                const textAnchor = el.getAttribute('text-anchor') ?? el.getAttribute('style')?.match(/text-anchor:\s*([^;]+)/)?.[1]?.trim();
                const textAlign = textAnchor === 'middle' ? 'center' as const : textAnchor === 'end' ? 'right' as const : 'left';
                const dominantBaseline = el.getAttribute('dominant-baseline') ?? el.getAttribute('style')?.match(/dominant-baseline:\s*([^;]+)/)?.[1]?.trim();
                const verticalAlign = dominantBaseline === 'middle' ? 'middle' as const : dominantBaseline === 'hanging' ? 'top' as const : dominantBaseline === 'alphabetic' || dominantBaseline === 'baseline' ? 'bottom' as const : 'middle';

                if (hasPositionedTspans(el)) {
                    const directText = (() => {
                        let s = '';
                        for (const node of el.childNodes) {
                            if (node.nodeType === Node.TEXT_NODE) {
                                s += node.textContent ?? '';
                            } else if (node instanceof Element && node.tagName.toLowerCase() === 'tspan') break;
                        }
                        return s.trim();
                    })();

                    // PPT SVG: text transform에서 baseX, baseY 추출 (tspan x/y는 이 기준 상대)
                    const { baseX, baseY } = getTextBaseFromTransform(el);
                    const baselineCorrection = baseFontSize * 0.8; // SVG y는 baseline 기준

                    // ── 먼저 yGroupMap 계산 (directText Y 위치 참조용) ──────────────
                    const tspanEls = Array.from(el.querySelectorAll('tspan')) as SVGGraphicsElement[];
                    const yGroupMap = new Map<number, SVGGraphicsElement[]>();
                    for (const ts of tspanEls) {
                        const yAttr = (ts as Element).getAttribute('y');
                        const yKey = yAttr !== null ? Math.round(parseFloat(yAttr)) : 0;
                        const arr = yGroupMap.get(yKey) ?? [];
                        arr.push(ts);
                        yGroupMap.set(yKey, arr);
                    }
                    const sortedYKeys = [...yGroupMap.keys()].sort((a, b) => a - b);

                    // ── directText("No" 등) → baseX + offsetX, 첫 행 Y + offsetY - baseline ──
                    if (directText) {
                        const firstRowTspans = (yGroupMap.get(sortedYKeys[0]) ?? [])
                            .slice()
                            .sort((a, b) =>
                                parseFloat((a as Element).getAttribute('x') ?? '0') -
                                parseFloat((b as Element).getAttribute('x') ?? '0')
                            );
                        let directY = baseY + offsetY - baselineCorrection;
                        let directX = baseX + offsetX;
                        if (firstRowTspans.length > 0) {
                            const firstY = parseFloat((firstRowTspans[0] as Element).getAttribute('y') ?? '0');
                            directY = baseY + firstY + offsetY - baselineCorrection;
                        }
                        const textElSVG = el as SVGTextElement;
                        if (typeof textElSVG.getStartPositionOfChar === 'function') {
                            try {
                                const start = textElSVG.getStartPositionOfChar(0);
                                const pt = (svg as SVGSVGElement).createSVGPoint();
                                pt.x = start.x;
                                pt.y = start.y;
                                const ctm = (el as SVGGraphicsElement).getCTM();
                                if (ctm) {
                                    const t = pt.matrixTransform(ctm);
                                    directX = t.x;
                                }
                            } catch { /* 실패 시 baseX+offsetX 유지 */ }
                        }
                        const cjkBonus = /[\u4e00-\u9fff\uac00-\ud7af\u3040-\u309f]/.test(directText) ? 1.15 : 1;
                        const minW = Math.max(directText.length * baseFontSize * cjkBonus, 16);
                        const minH = baseFontSize * 1.3;
                        elements.push({
                            id: `el_${baseId}_${idx}_d0_${randomId()}`,
                            type: 'text',
                            x: directX,
                            y: directY,
                            width: minW,
                            height: minH,
                            text: directText,
                            fontSize: baseFontSize,
                            fontWeight: fontWeight || undefined,
                            color: style.stroke ?? style.fill ?? '#000000',
                            fill: style.fill,
                            stroke: style.stroke,
                            strokeWidth: style.strokeWidth,
                            opacity: style.opacity,
                            textAlign,
                            verticalAlign,
                            zIndex: zIndex++,
                            groupId: groupId,
                        });
                    }

                    // ── tspan을 Y그룹 → X클러스터로 묶어 셀 단위 DrawElement 생성 ──
                    // PPT SVG: baseX + tspanX + offsetX, baseY + tspanY + offsetY - baselineCorrection
                    for (const rowTspans of yGroupMap.values()) {
                        rowTspans.sort((a, b) =>
                            parseFloat((a as Element).getAttribute('x') ?? '0') -
                            parseFloat((b as Element).getAttribute('x') ?? '0')
                        );

                        const clusters: SVGGraphicsElement[][] = [];
                        let currentCluster: SVGGraphicsElement[] = [];
                        let clusterRightEdge = -Infinity;

                        for (const ts of rowTspans) {
                            let tsBox: DOMRect;
                            try { tsBox = ts.getBBox(); } catch { continue; }
                            if (tsBox.width < 0.5 && tsBox.height < 0.5) continue;

                            const tsX = parseFloat((ts as Element).getAttribute('x') ?? String(tsBox.x));
                            const tsLeft = baseX + tsX; // text 좌표계 내 기준
                            const tsRight = tsLeft + tsBox.width;
                            const gapThreshold = Math.max(tsBox.height * 0.8, baseFontSize * 0.8);

                            if (currentCluster.length === 0 || tsLeft - clusterRightEdge > gapThreshold) {
                                if (currentCluster.length > 0) clusters.push(currentCluster);
                                currentCluster = [ts];
                            } else {
                                currentCluster.push(ts);
                            }
                            clusterRightEdge = Math.max(clusterRightEdge, tsRight);
                        }
                        if (currentCluster.length > 0) clusters.push(currentCluster);

                        for (const cluster of clusters) {
                            const clusterText = cluster
                                .map((ts) => (ts as Element).textContent?.trim() ?? '')
                                .filter(Boolean)
                                .join('');
                            if (!clusterText) continue;

                            // PPT SVG: baseX + tspanX + offset, baseY + tspanY + offset - baseline
                            let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
                            for (const ts of cluster) {
                                try {
                                    const tx = parseFloat((ts as Element).getAttribute('x') ?? '0');
                                    const ty = parseFloat((ts as Element).getAttribute('y') ?? '0');
                                    const tb = ts.getBBox();
                                    const finalX = baseX + tx + offsetX;
                                    const finalY = baseY + ty + offsetY - baselineCorrection;
                                    cMinX = Math.min(cMinX, finalX);
                                    cMinY = Math.min(cMinY, finalY);
                                    cMaxX = Math.max(cMaxX, finalX + tb.width);
                                    cMaxY = Math.max(cMaxY, finalY + tb.height);
                                } catch { continue; }
                            }
                            if (!isFinite(cMinX)) continue;

                            const tFontSize = parseNum((cluster[0] as Element).getAttribute('font-size'), baseFontSize);
                            const cjkBonus = /[\u4e00-\u9fff\uac00-\ud7af\u3040-\u309f]/.test(clusterText) ? 1.15 : 1;
                            const minW = Math.max(clusterText.length * tFontSize * cjkBonus, 16);
                            const w = Math.max(cMaxX - cMinX, minW);
                            const h = Math.max(cMaxY - cMinY, tFontSize * 1.3);

                            elements.push({
                                id: `el_${baseId}_${idx}_tc_${randomId()}`,
                                type: 'text',
                                x: cMinX,
                                y: cMinY,
                                width: w,
                                height: h,
                                text: clusterText,
                                fontSize: tFontSize,
                                fontWeight: fontWeight || undefined,
                                color: style.stroke ?? style.fill ?? '#000000',
                                fill: style.fill,
                                stroke: style.stroke,
                                strokeWidth: style.strokeWidth,
                                opacity: style.opacity,
                                textAlign,
                                verticalAlign,
                                zIndex: zIndex++,
                                groupId: groupId,
                            });
                        }
                    }

                } else {
                    const text = getTextFromSvgText(el);
                    const cjkBonus = /[\u4e00-\u9fff\uac00-\ud7af\u3040-\u309f]/.test(text) ? 1.15 : 1;
                    const minW = Math.max(text.length * baseFontSize * cjkBonus, 20);
                    elements.push({
                        id,
                        type: 'text',
                        x: root.x,
                        y: root.y,
                        width: Math.max(root.width, minW),
                        height: Math.max(root.height, 14),
                        text: text || '',
                        fontSize: baseFontSize,
                        fontWeight: fontWeight || undefined,
                        color: style.stroke ?? style.fill ?? '#000000',
                        fill: style.fill,
                        stroke: style.stroke,
                        strokeWidth: style.strokeWidth,
                        opacity: style.opacity,
                        textAlign,
                        verticalAlign,
                        zIndex: zIndex++,
                        groupId: groupId,
                    });
                }
            } else {
                const pathFill = tag === 'path' && (el.getAttribute('fill') === 'none' || !el.getAttribute('fill')) ? 'transparent' : style.fill;
                const minDim = Math.max(style.strokeWidth, 1);
                // PPT SVG: path d에서 직접 좌표 추출 (translate 오프셋 적용)
                const pathRect = tag === 'path' ? parsePathRectCoords(el.getAttribute('d') ?? '') : null;
                const usePathRect = pathRect && pathRect.width > 1 && pathRect.height > 1;
                const x = usePathRect ? pathRect.x + offsetX : root.x;
                const y = usePathRect ? pathRect.y + offsetY : root.y;
                const w = usePathRect ? pathRect.width : Math.max(root.width, minDim);
                const h = usePathRect ? pathRect.height : Math.max(root.height, minDim);
                elements.push({
                    id,
                    type: 'rect',
                    x,
                    y,
                    width: w,
                    height: h,
                    fill: pathFill,
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    opacity: style.opacity,
                    zIndex: zIndex++,
                    groupId: groupId,
                });
            }
        });
    };

    walk(svg);
    document.body.removeChild(container);

    return tryDetectAndMergeTables(elements, baseId, zIndex, thresholds);
}

/** PPT HTML/VML 등에서 추출한 요소들에 표 감지·병합 적용 (No, 체크박스 등 누락 컬럼 포함) */
export function detectAndMergeTables(elements: DrawElement[], vw = 2000, vh = 2000): DrawElement[] {
    if (elements.length === 0) return elements;
    const baseId = Date.now();
    const zIndexStart = Math.max(...elements.map((e) => e.zIndex ?? 1), 1);
    const thresholds = computeThresholds(vw, vh);
    return tryDetectAndMergeTables(elements, baseId, zIndexStart, thresholds);
}
