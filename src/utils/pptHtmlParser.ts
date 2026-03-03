/**
 * PowerPoint 클립보드 HTML을 DrawElement[]로 변환
 * text/html에 포함된 VML(v:rect, v:oval 등) 또는 SVG/HTML 도형을 파싱
 */
import type { DrawElement } from '../types/screenDesign';

const PT_TO_PX = 1.333; // 96dpi 기준 1pt ≈ 1.333px

function randomId(): string {
    return Math.random().toString(36).substr(2, 5);
}

function parseSize(val: string | null, fallback: number): number {
    if (!val || val === '') return fallback;
    const num = parseFloat(String(val).replace(/[a-zA-Z%]+$/, ''));
    if (isNaN(num)) return fallback;
    if (val.includes('pt')) return num * PT_TO_PX;
    return num;
}

function parseColor(val: string | null): string | undefined {
    if (!val || val === 'none') return undefined;
    return val;
}

/** style 문자열에서 width, height, left, top 등 추출 */
function parseStyle(style: string | null): Record<string, number | string> {
    const result: Record<string, number | string> = {};
    if (!style) return result;
    const parts = style.split(';');
    for (const p of parts) {
        const [key, val] = p.split(':').map((s) => s.trim());
        if (!key || !val) continue;
        const k = key.toLowerCase();
        if (['width', 'height', 'left', 'top', 'margin-left', 'margin-top'].includes(k)) {
            result[k] = parseSize(val, 0);
        } else if (k === 'fill' || k === 'stroke' || k === 'color') {
            const c = parseColor(val);
            if (c) result[k] = c;
        }
    }
    return result;
}

/** 요소에서 fill, stroke 속성 추출 */
function getFillStroke(el: Element): { fill?: string; stroke?: string } {
    const fill = parseColor(el.getAttribute('fill')) ?? parseColor(el.getAttribute('fillcolor'));
    const stroke = parseColor(el.getAttribute('stroke')) ?? parseColor(el.getAttribute('strokecolor'));
    const style = parseStyle(el.getAttribute('style'));
    return {
        fill: (fill ?? style.fill) as string | undefined,
        stroke: (stroke ?? style.stroke) as string | undefined,
    };
}

/** VML 요소에서 fill, stroke, strokeWidth 추출 (PPT 속성: fillcolor, strokecolor, strokeweight) */
function getVmlFillStroke(el: Element): { fill?: string; stroke?: string; strokeWidth: number } {
    const { fill, stroke } = getFillStroke(el);
    const strokeWeight = el.getAttribute('strokeweight');
    const strokeWidth = strokeWeight ? parseSize(strokeWeight, 1) : 1;
    return {
        fill: fill ?? '#ffffff',
        stroke: stroke ?? '#000000',
        strokeWidth,
    };
}

/** VML 도형 내부 v:textbox 텍스트 추출 (네임스페이스 유실 대비) */
function getVmlTextContent(el: Element): string {
    const textbox = Array.from(el.querySelectorAll('*')).find((child) =>
        /textbox/i.test(child.tagName)
    );
    return textbox?.textContent?.trim() ?? '';
}

/** VML 도형 태그 여부 (브라우저별 tagName 차이 대응: v:rect, V:RECT, rect 등) */
function isVmlShapeTag(tagName: string): boolean {
    const t = tagName.toLowerCase();
    return (
        t.includes(':rect') ||
        t.includes(':oval') ||
        t.includes(':shape') ||
        t.includes(':roundrect')
    );
}

/** PPT/Office HTML에서 DrawElement[] 추출 */
export function parsePptHtmlToElements(html: string): DrawElement[] {
    if (!html || html.length < 10) return [];

    const isPptOrOffice =
        html.includes('PowerPoint') ||
        html.includes('office:') ||
        html.includes('urn:schemas-microsoft-com') ||
        html.includes('v:rect') ||
        html.includes('v:oval') ||
        html.includes('v:shape') ||
        html.includes('v:roundrect');

    if (!isPptOrOffice && !html.includes('<svg') && !html.includes('<rect') && !html.includes('<circle')) {
        return [];
    }

    const parser = new DOMParser();
    let doc = parser.parseFromString(html, 'text/html');
    // HTML 파싱에서 VML 태그가 누락된 경우 text/xml 폴백 시도
    const root = doc.body ?? doc.documentElement ?? doc;
    const hasVmlInDoc = root?.innerHTML?.includes('v:') ?? false;
    if (!hasVmlInDoc && html.includes('v:')) {
        try {
            const xmlDoc = parser.parseFromString(html, 'application/xml');
            const parseError = xmlDoc.querySelector('parsererror');
            if (!parseError && xmlDoc.documentElement) {
                doc = xmlDoc;
            }
        } catch {
            /* XML 파싱 실패 시 기존 doc 유지 */
        }
    }

    const elements: DrawElement[] = [];
    let zIndex = 1;
    const baseId = Date.now();

    const addElement = (el: DrawElement) => {
        elements.push({ ...el, id: `el_${baseId}_${elements.length}_${randomId()}`, zIndex: zIndex++ });
    };

    // 1. VML 요소 (PowerPoint/Word) - getElementsByTagName('*')로 전체 순회, tagName으로 판별 (네임스페이스 대응)
    const docRoot = doc.body ?? doc.documentElement ?? doc;
    const allElements = Array.from(docRoot?.getElementsByTagName?.('*') ?? docRoot?.querySelectorAll?.('*') ?? []);
    const vmlShapes = allElements.filter((el) => isVmlShapeTag(el.tagName));

    const processVmlElement = (el: Element) => {
        const style = parseStyle(el.getAttribute('style'));
        const { fill, stroke, strokeWidth } = getVmlFillStroke(el);
        const w = (style.width as number) ?? parseSize(el.getAttribute('width'), 100);
        const h = (style.height as number) ?? parseSize(el.getAttribute('height'), 60);
        const left = (style.left as number) ?? (style['margin-left'] as number) ?? parseSize(el.getAttribute('left'), 0);
        const top = (style.top as number) ?? (style['margin-top'] as number) ?? parseSize(el.getAttribute('top'), 0);
        const textContent = getVmlTextContent(el);

        if (w < 2 || h < 2) return;

        const tag = el.tagName.toLowerCase();

        if (tag.includes('roundrect')) {
            const arcsize = el.getAttribute('arcsize') ?? '0.2';
            const rx = Math.min(w, h) * parseFloat(arcsize) * 0.5;
            addElement({
                type: 'rect',
                x: left,
                y: top,
                width: w,
                height: h,
                fill,
                stroke,
                strokeWidth,
                borderRadius: rx,
                ...(textContent && { text: textContent, fontSize: 14, color: '#000000' }),
            } as DrawElement);
        } else if (tag.includes('oval')) {
            addElement({
                type: 'circle',
                x: left,
                y: top,
                width: w,
                height: h,
                fill,
                stroke,
                strokeWidth,
                ...(textContent && { text: textContent, fontSize: 14, color: '#000000' }),
            } as DrawElement);
        } else {
            // v:rect, v:shape 등
            addElement({
                type: 'rect',
                x: left,
                y: top,
                width: w,
                height: h,
                fill,
                stroke,
                strokeWidth,
                ...(textContent && { text: textContent, fontSize: 14, color: '#000000' }),
            } as DrawElement);
        }
    };

    vmlShapes.forEach(processVmlElement);

    // 2. SVG 요소 (일부 환경에서 PPT가 SVG로 내보냄)
    const svgRects = doc.querySelectorAll('svg rect, rect');
    const svgCircles = doc.querySelectorAll('svg circle, circle');
    const svgEllipses = doc.querySelectorAll('svg ellipse, ellipse');
    const svgTexts = doc.querySelectorAll('svg text, text');

    svgRects.forEach((el) => {
        const w = parseFloat(el.getAttribute('width') ?? '0') || 50;
        const h = parseFloat(el.getAttribute('height') ?? '0') || 30;
        const x = parseFloat(el.getAttribute('x') ?? '0') || 0;
        const y = parseFloat(el.getAttribute('y') ?? '0') || 0;
        const rx = parseFloat(el.getAttribute('rx') ?? '0');
        const { fill, stroke } = getFillStroke(el);
        if (w < 2 || h < 2) return;
        addElement({
            type: 'rect',
            x,
            y,
            width: w,
            height: h,
            fill: fill ?? '#ffffff',
            stroke: stroke ?? '#000000',
            strokeWidth: 1,
            borderRadius: rx,
        } as DrawElement);
    });

    svgCircles.forEach((el) => {
        const r = parseFloat(el.getAttribute('r') ?? '0') || 25;
        const cx = parseFloat(el.getAttribute('cx') ?? '0') || r;
        const cy = parseFloat(el.getAttribute('cy') ?? '0') || r;
        const { fill, stroke } = getFillStroke(el);
        addElement({
            type: 'circle',
            x: cx - r,
            y: cy - r,
            width: r * 2,
            height: r * 2,
            fill: fill ?? '#ffffff',
            stroke: stroke ?? '#000000',
            strokeWidth: 1,
        } as DrawElement);
    });

    svgEllipses.forEach((el) => {
        const rx = parseFloat(el.getAttribute('rx') ?? '0') || 40;
        const ry = parseFloat(el.getAttribute('ry') ?? '0') || 25;
        const cx = parseFloat(el.getAttribute('cx') ?? '0') || rx;
        const cy = parseFloat(el.getAttribute('cy') ?? '0') || ry;
        const { fill, stroke } = getFillStroke(el);
        addElement({
            type: 'circle',
            x: cx - rx,
            y: cy - ry,
            width: rx * 2,
            height: ry * 2,
            fill: fill ?? '#ffffff',
            stroke: stroke ?? '#000000',
            strokeWidth: 1,
        } as DrawElement);
    });

    svgTexts.forEach((el) => {
        const text = el.textContent?.trim() || '';
        const x = parseFloat(el.getAttribute('x') ?? '0') || 0;
        const y = parseFloat(el.getAttribute('y') ?? '0') || 0;
        const fontSize = parseFloat(el.getAttribute('font-size') ?? '14') || 14;
        const { fill, stroke } = getFillStroke(el);
        addElement({
            type: 'text',
            x,
            y,
            width: Math.max(text.length * fontSize * 0.6, 40),
            height: fontSize * 1.4,
            text,
            fontSize,
            color: stroke ?? fill ?? '#000000',
            fill: fill ?? '#ffffff',
            stroke: stroke ?? '#000000',
            strokeWidth: 0,
        } as DrawElement);
    });

    // 3. HTML div/span with inline style (일부 클립보드)
    const styledDivs = doc.querySelectorAll('div[style*="width"], span[style*="width"]');
    styledDivs.forEach((el) => {
        const style = parseStyle(el.getAttribute('style'));
        const w = (style.width as number) ?? 100;
        const h = (style.height as number) ?? 50;
        const left = (style.left as number) ?? (style['margin-left'] as number) ?? 0;
        const top = (style.top as number) ?? (style['margin-top'] as number) ?? 0;
        if (w < 10 || h < 10) return;
        const text = el.textContent?.trim() || '';
        const { fill, stroke } = getFillStroke(el);
        if (text.length > 0) {
            addElement({
                type: 'text',
                x: left,
                y: top,
                width: w,
                height: h,
                text,
                fontSize: 14,
                color: stroke ?? fill ?? '#000000',
                fill: fill ?? '#ffffff',
                stroke: stroke ?? '#000000',
                strokeWidth: 0,
            } as DrawElement);
        } else {
            addElement({
                type: 'rect',
                x: left,
                y: top,
                width: w,
                height: h,
                fill: fill ?? '#ffffff',
                stroke: stroke ?? '#000000',
                strokeWidth: 1,
            } as DrawElement);
        }
    });

    return elements;
}
