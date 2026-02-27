/**
 * SVG 파일을 파싱하여 DrawElement[]로 변환
 * PowerPoint 등에서 내보낸 SVG를 편집 가능한 객체로 가져오기
 */
import type { DrawElement } from '../types/screenDesign';

const SUPPORTED_TAGS = ['rect', 'circle', 'ellipse', 'text', 'path', 'line', 'polygon', 'polyline'];

function randomId(): string {
    return Math.random().toString(36).substr(2, 5);
}

function parseNum(val: string | null, fallback: number): number {
    if (val == null || val === '') return fallback;
    const n = parseFloat(val);
    return isNaN(n) ? fallback : n;
}

function parseColor(val: string | null): string | undefined {
    if (!val || val === 'none') return undefined;
    return val;
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
    container.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none';
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
            if (bbox.width < 0.5 || bbox.height < 0.5) return;

            const style = getStyle(el);
            const id = `el_${baseId}_${idx}_${randomId()}`;

            if (tag === 'rect') {
                const rx = parseNum(el.getAttribute('rx'), 0);
                elements.push({
                    id,
                    type: 'rect',
                    x: bbox.x,
                    y: bbox.y,
                    width: bbox.width,
                    height: bbox.height,
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
                const cx = parseNum(el.getAttribute('cx'), bbox.x + bbox.width / 2);
                const cy = parseNum(el.getAttribute('cy'), bbox.y + bbox.height / 2);
                elements.push({
                    id,
                    type: 'circle',
                    x: cx - r,
                    y: cy - r,
                    width: r * 2,
                    height: r * 2,
                    fill: style.fill,
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    opacity: style.opacity,
                    zIndex: zIndex++,
                    groupId: groupId,
                });
            } else if (tag === 'ellipse') {
                const rx = parseNum(el.getAttribute('rx'), bbox.width / 2);
                const ry = parseNum(el.getAttribute('ry'), bbox.height / 2);
                const cx = parseNum(el.getAttribute('cx'), bbox.x + bbox.width / 2);
                const cy = parseNum(el.getAttribute('cy'), bbox.y + bbox.height / 2);
                elements.push({
                    id,
                    type: 'circle',
                    x: cx - rx,
                    y: cy - ry,
                    width: rx * 2,
                    height: ry * 2,
                    fill: style.fill,
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    opacity: style.opacity,
                    zIndex: zIndex++,
                    groupId: groupId,
                });
            } else if (tag === 'text') {
                const text = el.textContent?.trim() || '';
                const fontSize = parseNum(
                    el.getAttribute('font-size') ?? el.getAttribute('style')?.match(/font-size:\s*([^;]+)/)?.[1]?.trim() ?? '',
                    14
                );
                const fontWeight = el.getAttribute('font-weight') ?? el.getAttribute('style')?.match(/font-weight:\s*([^;]+)/)?.[1]?.trim();
                elements.push({
                    id,
                    type: 'text',
                    x: bbox.x,
                    y: bbox.y,
                    width: Math.max(bbox.width, 20),
                    height: Math.max(bbox.height, 14),
                    text,
                    fontSize,
                    fontWeight: fontWeight || undefined,
                    color: style.stroke ?? style.fill ?? '#000000',
                    fill: style.fill,
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    opacity: style.opacity,
                    zIndex: zIndex++,
                    groupId: groupId,
                });
            } else {
                elements.push({
                    id,
                    type: 'rect',
                    x: bbox.x,
                    y: bbox.y,
                    width: bbox.width,
                    height: bbox.height,
                    fill: style.fill,
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
    return elements;
}
