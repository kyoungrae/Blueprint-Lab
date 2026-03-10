import type { DrawElement, Screen } from '../types/screenDesign';

/** 동기화할 스타일 속성 (위치/크기 제외).
 *  - 표 구조(tableRows, tableCols, 셀 수/크기 등)는 인스턴스에서 자유롭게 수정할 수 있도록 SYNC 대상에서 제외한다.
 *  - tableCellData/tableCellDataV2는 아래 mergeTableCellData에서 컴포넌트에 작성된 셀만 별도로 동기화한다.
 */
const STYLE_KEYS: (keyof DrawElement)[] = [
    'fill', 'stroke', 'strokeWidth', 'strokeStyle', 'strokeOpacity',
    'fillOpacity', 'fontSize', 'fontWeight', 'fontStyle', 'textDecoration', 'fontFamily', 'color', 'text', 'textAlign', 'verticalAlign',
    'borderRadius', 'opacity', 'description',
    'imageUrl', 'imageCrop', 'imageRotation', 'imageFlipX', 'imageFlipY',
    // 표 구조 관련 키(tableRows, tableCols, 셀 수/크기 등)는 제외
    'tableBorderTop', 'tableBorderTopWidth', 'tableBorderTopStyle',
    'tableBorderBottom', 'tableBorderBottomWidth', 'tableBorderBottomStyle',
    'tableBorderLeft', 'tableBorderLeftWidth', 'tableBorderLeftStyle',
    'tableBorderRight', 'tableBorderRightWidth', 'tableBorderRightStyle',
    'tableBorderInsideH', 'tableBorderInsideHWidth', 'tableBorderInsideHStyle',
    'tableBorderInsideV', 'tableBorderInsideVWidth', 'tableBorderInsideVStyle',
    'tableBorderRadius', 'tableBorderRadiusTopLeft', 'tableBorderRadiusTopRight',
    'tableBorderRadiusBottomLeft', 'tableBorderRadiusBottomRight',
];

/** 테이블 셀 데이터: 컴포넌트에 작성된 텍스트(비어있지 않은 셀)만 동기화. 빈 셀은 사용자 입력 유지 */
function mergeTableCellData(target: DrawElement, source: DrawElement): DrawElement {
    const srcLegacy = source.tableCellData;
    const srcV2 = source.tableCellDataV2;
    const tgtLegacy = target.tableCellData;
    const tgtV2 = target.tableCellDataV2;

    if (!srcLegacy && !srcV2) return target;

    const rows = source.tableRows || target.tableRows || 3;
    const cols = source.tableCols || target.tableCols || 3;
    const totalCells = rows * cols;

    let changed = false;
    const newLegacy = [...(tgtLegacy || Array(totalCells).fill(''))];
    while (newLegacy.length < totalCells) newLegacy.push('');
    const newV2 = (tgtV2 && tgtV2.length >= totalCells)
        ? tgtV2.map(c => ({ ...c }))
        : Array.from({ length: totalCells }, (_, i) => ({
            content: tgtLegacy?.[i] ?? tgtV2?.[i]?.content ?? '',
            rowSpan: tgtV2?.[i]?.rowSpan ?? 1,
            colSpan: tgtV2?.[i]?.colSpan ?? 1,
            isMerged: tgtV2?.[i]?.isMerged ?? false,
        }));

    for (let i = 0; i < totalCells; i++) {
        const srcVal = (srcV2?.[i]?.content ?? srcLegacy?.[i] ?? '').trim();
        const tgtVal = (newV2[i]?.content ?? newLegacy[i] ?? '').trim();

        // 값이 같으면 동기화할 필요 없음 (trim 후 비교로 미세한 공백 차이 무시)
        if (srcVal === tgtVal) continue;

        // 사용자가 인스턴스에서 해당 셀을 직접 수정한 경우(tableCellLockedIndices에서 제거됨), 동기화하지 않는다.
        if (target.fromComponentId) {
            if (target.tableCellLockedIndices) {
                if (!target.tableCellLockedIndices.includes(i)) continue;
            } else {
                if (tgtVal.length > 0) continue;
                if (!srcVal.length) continue;
            }
        }

        const actualSrcVal = srcV2?.[i]?.content ?? srcLegacy?.[i] ?? '';
        newLegacy[i] = actualSrcVal;
        if (newV2[i]) newV2[i] = { ...newV2[i], content: actualSrcVal };
        changed = true;
    }

    if (!changed) return target;

    return {
        ...target,
        tableCellData: newLegacy,
        tableCellDataV2: newV2.length > 0 ? newV2 : undefined,
    };
}

/** 원본 요소에서 스타일만 추출하여 대상 요소에 적용 */
function applyStyleFromSource(target: DrawElement, source: DrawElement): DrawElement {
    let updated = { ...target };
    let changed = false;
    for (const key of STYLE_KEYS) {
        if (key === 'text') {
            // 컴포넌트에서 가져온 객체라도 화면 설계 인스턴스에서 사용자가 텍스트를 수정했다면 덮어쓰지 않는다.
            if (target.hasComponentText === false) continue;

            const srcText = (source.text || '').trim();
            const tgtText = (target.text || '').trim();

            // 컴포넌트 인스턴스이며, 원본/인스턴스 모두 텍스트가 있고 값이 다르면 → 사용자 override로 간주하고 동기화 생략
            if (target.fromComponentId && srcText.length > 0 && tgtText.length > 0 && srcText !== tgtText) {
                continue;
            }

            // 컴포넌트 원본에 텍스트가 없으면 인스턴스 텍스트를 유지
            if (target.hasComponentText === undefined && target.fromComponentId && srcText.length === 0) continue;
        }
        const srcVal = source[key];
        const tgtVal = target[key];

        // 둘 다 Falsy(undefined, null, "")한 값이면 같은 것으로 간주하여 무한 루프 방지
        const isSrcFalsy = srcVal === undefined || srcVal === null || srcVal === "";
        const isTgtFalsy = tgtVal === undefined || tgtVal === null || tgtVal === "";
        if (isSrcFalsy && isTgtFalsy) continue;

        if (srcVal === undefined) continue;

        if (JSON.stringify(srcVal) !== JSON.stringify(tgtVal)) {
            (updated as any)[key] =
                typeof srcVal === 'object' && srcVal !== null
                    ? JSON.parse(JSON.stringify(srcVal))
                    : srcVal;
            changed = true;
        }
    }
    if (source.type === 'table' && target.type === 'table') {
        const merged = mergeTableCellData(updated, source);
        if (merged !== updated) {
            updated = merged;
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
