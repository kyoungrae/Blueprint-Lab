/**
 * SVG 파일을 파싱하여 DrawElement[]로 변환
 * PowerPoint 등에서 내보낸 SVG를 편집 가능한 객체로 가져오기
 */
import type { DrawElement, TableCellData } from '../types/screenDesign';

const SUPPORTED_TAGS = ['rect', 'circle', 'ellipse', 'text', 'path', 'line', 'polygon', 'polyline'];

const ROW_Y_THRESHOLD = 12;
const MIN_TABLE_CELLS = 4;

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

/** tspan이 x,y로 배치된 그리드형 텍스트인지 (테이블/표 구조) */
function hasPositionedTspans(textEl: Element): boolean {
    const tspans = textEl.querySelectorAll('tspan');
    if (tspans.length < 2) return false;
    let withPos = 0;
    tspans.forEach((t) => {
        if (t.getAttribute('x') != null || t.getAttribute('y') != null) withPos++;
    });
    return withPos >= 2;
}

/** 그리드형 텍스트/rect로 표 감지 후 단일 table 요소로 병합 */
function tryDetectAndMergeTables(elements: DrawElement[], baseId: number, zIndexStart: number): DrawElement[] {
    const byGroup = new Map<string, DrawElement[]>();
    for (const el of elements) {
        const gid = el.groupId ?? '';
        const arr = byGroup.get(gid) ?? [];
        arr.push(el);
        byGroup.set(gid, arr);
    }

    const tables: DrawElement[] = [];
    const mergedIds = new Set<string>();

    const tryGroup = (group: DrawElement[]) => {
        const texts = group.filter((e): e is DrawElement & { text: string } => e.type === 'text' && !!e.text);
        const rects = group.filter((e) => e.type === 'rect' && e.fill !== 'transparent' && e.width > 8 && e.height > 8);

        if (texts.length < MIN_TABLE_CELLS) return;

        const sorted = [...texts].sort((a, b) => {
            const dy = a.y - b.y;
            if (Math.abs(dy) > ROW_Y_THRESHOLD) return dy;
            return a.x - b.x;
        });

        const rows: DrawElement[][] = [];
        let currentRow: DrawElement[] = [];
        let lastY = -Infinity;

        for (const t of sorted) {
            const cy = t.y + t.height / 2;
            if (currentRow.length > 0 && cy - lastY > ROW_Y_THRESHOLD) {
                rows.push(currentRow);
                currentRow = [];
            }
            currentRow.push(t);
            lastY = cy;
        }
        if (currentRow.length > 0) rows.push(currentRow);

        const cols = Math.max(...rows.map((r) => r.length), 1);
        const rowsCount = rows.length;
        if (rowsCount < 2 || cols < 2) return;

        const cellData: string[] = [];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (let r = 0; r < rowsCount; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = rows[r]?.[c];
                cellData.push(cell?.text?.trim() ?? '');
                if (cell) {
                    minX = Math.min(minX, cell.x);
                    minY = Math.min(minY, cell.y);
                    maxX = Math.max(maxX, cell.x + cell.width);
                    maxY = Math.max(maxY, cell.y + cell.height);
                }
            }
        }

        for (const r of rects) {
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

    for (const [gid, group] of byGroup) {
        if (gid) tryGroup(group);
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
    const fill = parseColor(el.getAttribute('fill')) ?? parseColor(el.getAttribute('style')?.match(/fill:\s*([^;]+)/)?.[1]?.trim());
    const stroke = parseColor(el.getAttribute('stroke')) ?? parseColor(el.getAttribute('style')?.match(/stroke:\s*([^;]+)/)?.[1]?.trim());
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
    const size = Math.max(1000, vw || 2000, vh || 2000);
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
                    const tspans = el.querySelectorAll('tspan');
                    tspans.forEach((tspan, ti) => {
                        const t = tspan.textContent?.trim();
                        if (!t) return;
                        const tFontSize = parseNum(tspan.getAttribute('font-size'), baseFontSize);
                        const cjkBonus = /[\u4e00-\u9fff\uac00-\ud7af\u3040-\u309f]/.test(t) ? 1.15 : 1;
                        const minWidth = Math.max(t.length * tFontSize * cjkBonus, 16);
                        const minHeight = tFontSize * 1.3;
                        let tbox: DOMRect;
                        try {
                            tbox = (tspan as SVGGraphicsElement).getBBox();
                        } catch {
                            return;
                        }
                        const tRoot = bboxToRootCoords(tspan as SVGGraphicsElement, tbox, svg as SVGSVGElement);
                        const w = Math.max(tRoot.width, minWidth);
                        const h = Math.max(tRoot.height, minHeight);
                        if (w < 0.5 || h < 0.5) return;
                        elements.push({
                            id: `el_${baseId}_${idx}_t${ti}_${randomId()}`,
                            type: 'text',
                            x: tRoot.x,
                            y: tRoot.y,
                            width: w,
                            height: h,
                            text: t,
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
                    });
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

    return tryDetectAndMergeTables(elements, baseId, zIndex);
}
