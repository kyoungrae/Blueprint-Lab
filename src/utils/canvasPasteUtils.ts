/**
 * 캔버스 붙여넣기/가져오기 시 요소 스케일링 유틸
 */
import type { DrawElement } from '../types/screenDesign';

const PADDING = 24;

/** 요소들을 캔버스에 맞게 스케일 (비율 유지, 확대 없음) */
export function scaleElementsToFitCanvas(
    elements: DrawElement[],
    canvasW: number,
    canvasH: number
): DrawElement[] {
    if (elements.length === 0) return elements;
    const minX = Math.min(...elements.map((el) => el.x));
    const minY = Math.min(...elements.map((el) => el.y));
    const maxX = Math.max(...elements.map((el) => el.x + el.width));
    const maxY = Math.max(...elements.map((el) => el.y + el.height));
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    if (bboxW < 1 || bboxH < 1) return elements;
    const availW = canvasW - PADDING * 2;
    const availH = canvasH - PADDING * 2;
    const scale = Math.min(availW / bboxW, availH / bboxH, 1);
    return elements.map((el) => {
        let w = el.width * scale;
        let h = el.height * scale;
        if (el.type === 'text' && el.text && el.fontSize != null) {
            const scaledFontSize = Math.max(8, (el.fontSize ?? 14) * scale);
            const minTextWidth = el.text.length * scaledFontSize * 0.95;
            w = Math.max(w, minTextWidth);
        }
        const scaled = {
            ...el,
            x: PADDING + (el.x - minX) * scale,
            y: PADDING + (el.y - minY) * scale,
            width: w,
            height: h,
            ...(el.fontSize != null && { fontSize: Math.max(8, el.fontSize * scale) }),
            ...(el.strokeWidth != null && { strokeWidth: Math.max(0.5, el.strokeWidth * scale) }),
            ...(el.borderRadius != null && { borderRadius: el.borderRadius * scale }),
        };
        return scaled;
    });
}
