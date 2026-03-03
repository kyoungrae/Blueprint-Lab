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

        const v2Cells: TableCellData[] = cellData.map((content) => ({
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
            tableCols: cols,
            tableCellData: cellData,
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
    container.style.cssText = `position:absolute;left:-9999px;top:0;width:${size}px;height:${size}px;overflow:hidden;pointer-events:none`;
    container.appendChild(svg);
    document.body.appendChild(container);

    const elements: DrawElement[] = [];
    let zIndex = 1;
    const baseId = Date.now();

    // ── [DEBUG] text 요소 구조 출력 (분석 후 삭제) ──────────────────────────
    console.group('[SVG DEBUG] text 요소 분석');
    console.log('viewBox:', vb, '| 계산 임계값:', thresholds);
    svg.querySelectorAll('text').forEach((t, i) => {
        const tspans = Array.from(t.querySelectorAll('tspan'));
        const yVals = tspans.map((s) => s.getAttribute('y'));
        const xVals = tspans.map((s) => s.getAttribute('x'));
        const texts = tspans.map((s) => s.textContent?.trim());
        const uniqueY = new Set(yVals.map((y) => (y !== null ? Math.round(parseFloat(y)) : 0)));
        console.log(
            `text[${i}] → isMultiRow: ${uniqueY.size >= 2} | uniqueY: [${[...uniqueY]}]`,
            '\n  content:', t.textContent?.slice(0, 60),
            '\n  tspan texts:', texts,
            '\n  tspan x:', xVals,
            '\n  tspan y:', yVals
        );
    });
    console.groupEnd();
    // ── [DEBUG END] ──────────────────────────────────────────────────────────

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

                    // ── directText("No" 등) → 첫 번째 tspan 행의 실제 Y 좌표에 배치 ──
                    if (directText) {
                        // 첫 번째 행의 tspan 중 가장 왼쪽 tspan의 getBBox로 Y 결정
                        const firstRowTspans = (yGroupMap.get(sortedYKeys[0]) ?? [])
                            .slice()
                            .sort((a, b) =>
                                parseFloat((a as Element).getAttribute('x') ?? '0') -
                                parseFloat((b as Element).getAttribute('x') ?? '0')
                            );
                        let directY = 0;
                        let directX = 0;
                        if (firstRowTspans.length > 0) {
                            try {
                                const tb = bboxToRootCoords(
                                    firstRowTspans[0],
                                    firstRowTspans[0].getBBox(),
                                    svg as SVGSVGElement
                                );
                                directY = tb.y;       // 첫 번째 행의 실제 렌더 Y
                                // directText는 첫 번째 tspan보다 왼쪽(x≈0 혹은 약간 앞)
                                directX = Math.max(0, tb.x - tb.width * 2);
                            } catch { /* 실패 시 0,0 유지 */ }
                        }
                        // X: getStartPositionOfChar로 더 정확하게 보정 시도
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
                                    directX = t.x; // X만 CTM에서 가져옴 (Y는 첫 tspan 행에서)
                                }
                            } catch { /* 실패 시 위 directX 유지 */ }
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
                    // (yGroupMap은 위에서 이미 계산됨)

                    // 2단계: 각 행에서 X 좌표 + getBBox 폭으로 인접 tspan 클러스터링
                    for (const rowTspans of yGroupMap.values()) {
                        // X 순 정렬
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

                            const tsLeft = parseFloat((ts as Element).getAttribute('x') ?? String(tsBox.x));
                            const tsRight = tsLeft + tsBox.width;
                            // 글자 높이의 80%를 간격 임계값으로 사용 (폰트 크기 비례)
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

                        // 3단계: 클러스터당 DrawElement 1개 생성
                        for (const cluster of clusters) {
                            const clusterText = cluster
                                .map((ts) => (ts as Element).textContent?.trim() ?? '')
                                .filter(Boolean)
                                .join('');
                            if (!clusterText) continue;

                            // 클러스터 전체 bbox 계산
                            let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
                            for (const ts of cluster) {
                                try {
                                    const tb = bboxToRootCoords(ts, ts.getBBox(), svg as SVGSVGElement);
                                    cMinX = Math.min(cMinX, tb.x);
                                    cMinY = Math.min(cMinY, tb.y);
                                    cMaxX = Math.max(cMaxX, tb.x + tb.width);
                                    cMaxY = Math.max(cMaxY, tb.y + tb.height);
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
                const w = Math.max(root.width, minDim);
                const h = Math.max(root.height, minDim);
                elements.push({
                    id,
                    type: 'rect',
                    x: root.x,
                    y: root.y,
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
