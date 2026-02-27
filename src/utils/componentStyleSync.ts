import type { DrawElement, Screen } from '../types/screenDesign';

/** 동기화할 스타일 속성 (위치/크기 제외) */
const STYLE_KEYS: (keyof DrawElement)[] = [
    'fill', 'stroke', 'strokeWidth', 'strokeStyle', 'strokeOpacity',
    'fillOpacity', 'fontSize', 'fontWeight', 'color', 'text', 'textAlign', 'verticalAlign',
    'borderRadius', 'opacity', 'description',
    'imageUrl', 'imageCrop', 'imageRotation', 'imageFlipX', 'imageFlipY',
    'tableRows', 'tableCols', 'tableCellData', 'tableCellDataV2', 'tableCellColors', 'tableCellStyles',
    'tableColWidths', 'tableRowHeights', 'tableRowColWidths', 'tableCellSpans',
    'tableBorderTop', 'tableBorderTopWidth', 'tableBorderTopStyle',
    'tableBorderBottom', 'tableBorderBottomWidth', 'tableBorderBottomStyle',
    'tableBorderLeft', 'tableBorderLeftWidth', 'tableBorderLeftStyle',
    'tableBorderRight', 'tableBorderRightWidth', 'tableBorderRightStyle',
    'tableBorderInsideH', 'tableBorderInsideHWidth', 'tableBorderInsideHStyle',
    'tableBorderInsideV', 'tableBorderInsideVWidth', 'tableBorderInsideVStyle',
    'tableBorderRadius', 'tableBorderRadiusTopLeft', 'tableBorderRadiusTopRight',
    'tableBorderRadiusBottomLeft', 'tableBorderRadiusBottomRight',
];

/** 원본 요소에서 스타일만 추출하여 대상 요소에 적용 */
function applyStyleFromSource(target: DrawElement, source: DrawElement): DrawElement {
    const updated = { ...target };
    let changed = false;
    for (const key of STYLE_KEYS) {
        const srcVal = source[key];
        if (srcVal === undefined) continue;
        const tgtVal = target[key];
        if (JSON.stringify(srcVal) !== JSON.stringify(tgtVal)) {
            (updated as any)[key] =
                typeof srcVal === 'object' && srcVal !== null
                    ? JSON.parse(JSON.stringify(srcVal))
                    : srcVal;
            changed = true;
        }
    }
    return changed ? updated : target;
}

/**
 * 연결된 컴포넌트 프로젝트의 스타일을 화면 설계 drawElements에 동기화
 * @returns 동기화된 화면 목록 (screenId -> drawElements) - 변경된 경우만
 */
export function syncComponentStyles(
    screens: Screen[],
    components: Screen[]
): Map<string, DrawElement[]> {
    const componentMap = new Map<string, Screen>();
    for (const c of components) {
        componentMap.set(c.id, c);
    }

    const updates = new Map<string, DrawElement[]>();

    for (const screen of screens) {
        const elements = screen.drawElements;
        if (!elements?.length) continue;

        let updatedElements: DrawElement[] | null = null;

        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            const compId = el.fromComponentId;
            const elemId = el.fromElementId;
            if (!compId || !elemId) continue;

            const comp = componentMap.get(compId);
            if (!comp?.drawElements?.length) continue;

            const sourceEl = comp.drawElements.find((e) => e.id === elemId);
            if (!sourceEl) continue;

            const next = applyStyleFromSource(el, sourceEl);
            if (next !== el) {
                if (!updatedElements) updatedElements = [...elements];
                updatedElements[i] = next;
            }
        }

        if (updatedElements) {
            updates.set(screen.id, updatedElements);
        }
    }

    return updates;
}
