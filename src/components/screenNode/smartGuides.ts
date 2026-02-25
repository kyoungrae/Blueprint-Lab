/** Smart Guides: 스냅 거리(px) - 이 거리 이내면 정렬선에 맞춤 */
export const SNAP_THRESHOLD = 6;
/** 스냅 해제 거리(px) - 진입보다 크게 두어 경계에서 떨림 방지 */
export const SNAP_RELEASE_THRESHOLD = 12;

/** 인접 거리(px) - 이 거리 이내의 객체만 고려 (멀리 있는 객체는 정렬 대상에서 제외) */
const PROXIMITY_THRESHOLD = 150;
/** 후보 객체 수 제한 - 가장 가까운 객체만 정렬 대상으로 사용 */
const MAX_NEARBY_CANDIDATES = 1;

export type AlignmentGuides = { vertical: number[]; horizontal: number[] };
type OwnXEdge = 'left' | 'right' | 'centerX';
type OwnYEdge = 'top' | 'bottom' | 'centerY';
export type SnapState = {
    x?: { targetId: string; targetValue: number; ownEdge: OwnXEdge };
    y?: { targetId: string; targetValue: number; ownEdge: OwnYEdge };
};

/** 두 바운딩 박스의 최소 거리 (겹치면 0) */
function minBoxDistance(
    a: { left: number; right: number; top: number; bottom: number },
    b: { left: number; right: number; top: number; bottom: number }
): number {
    const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
    const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
    return Math.sqrt(dx * dx + dy * dy);
}

export type GuideLinesInput = { vertical: number[]; horizontal: number[] };

export function getSmartGuidesAndSnap(
    draggedBounds: { left: number; top: number; right: number; bottom: number; centerX: number; centerY: number },
    otherElements: Array<{ id: string; x: number; y: number; width: number; height: number }>,
    prevSnap: SnapState = {},
    guideLines?: GuideLinesInput
): { deltaX: number; deltaY: number; guides: AlignmentGuides; nextSnap: SnapState } {
    const guides: AlignmentGuides = { vertical: [], horizontal: [] };

    const ourBox = {
        left: draggedBounds.left,
        right: draggedBounds.right,
        top: draggedBounds.top,
        bottom: draggedBounds.bottom,
    };

    // 인접한 객체만 고려 + 거리순 정렬 후 상위 후보만 사용
    const nearbyElements = otherElements
        .map((other) => {
            const otherBox = {
                left: other.x,
                right: other.x + other.width,
                top: other.y,
                bottom: other.y + other.height,
            };
            return { other, dist: minBoxDistance(ourBox, otherBox) };
        })
        .filter(({ dist }) => dist <= PROXIMITY_THRESHOLD)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, MAX_NEARBY_CANDIDATES)
        .map(({ other }) => other);

    const ourXEdges: Array<{ edge: OwnXEdge; value: number }> = [
        { edge: 'left', value: draggedBounds.left },
        { edge: 'right', value: draggedBounds.right },
        { edge: 'centerX', value: draggedBounds.centerX },
    ];
    const ourYEdges: Array<{ edge: OwnYEdge; value: number }> = [
        { edge: 'top', value: draggedBounds.top },
        { edge: 'bottom', value: draggedBounds.bottom },
        { edge: 'centerY', value: draggedBounds.centerY },
    ];

    let bestX:
        | { dist: number; delta: number; targetId: string; targetValue: number; ownEdge: OwnXEdge }
        | undefined;
    let bestY:
        | { dist: number; delta: number; targetId: string; targetValue: number; ownEdge: OwnYEdge }
        | undefined;

    // 1) 다른 객체와의 스냅
    for (const other of nearbyElements) {
        const otherXValues = [other.x, other.x + other.width, other.x + other.width / 2];
        const otherYValues = [other.y, other.y + other.height, other.y + other.height / 2];

        for (const ourEdge of ourXEdges) {
            for (const targetValue of otherXValues) {
                const dist = Math.abs(ourEdge.value - targetValue);
                if (dist <= SNAP_THRESHOLD && (!bestX || dist < bestX.dist)) {
                    bestX = {
                        dist,
                        delta: targetValue - ourEdge.value,
                        targetId: other.id,
                        targetValue,
                        ownEdge: ourEdge.edge,
                    };
                }
            }
        }
        for (const ourEdge of ourYEdges) {
            for (const targetValue of otherYValues) {
                const dist = Math.abs(ourEdge.value - targetValue);
                if (dist <= SNAP_THRESHOLD && (!bestY || dist < bestY.dist)) {
                    bestY = {
                        dist,
                        delta: targetValue - ourEdge.value,
                        targetId: other.id,
                        targetValue,
                        ownEdge: ourEdge.edge,
                    };
                }
            }
        }
    }

    // 2) 보조선(guideLines)과의 스냅 - 세로선(x), 가로선(y)
    if (guideLines) {
        for (const targetValue of guideLines.vertical) {
            for (const ourEdge of ourXEdges) {
                const dist = Math.abs(ourEdge.value - targetValue);
                if (dist <= SNAP_THRESHOLD && (!bestX || dist < bestX.dist)) {
                    bestX = {
                        dist,
                        delta: targetValue - ourEdge.value,
                        targetId: `guideLine-v-${targetValue}`,
                        targetValue,
                        ownEdge: ourEdge.edge,
                    };
                }
            }
        }
        for (const targetValue of guideLines.horizontal) {
            for (const ourEdge of ourYEdges) {
                const dist = Math.abs(ourEdge.value - targetValue);
                if (dist <= SNAP_THRESHOLD && (!bestY || dist < bestY.dist)) {
                    bestY = {
                        dist,
                        delta: targetValue - ourEdge.value,
                        targetId: `guideLine-h-${targetValue}`,
                        targetValue,
                        ownEdge: ourEdge.edge,
                    };
                }
            }
        }
    }

    let deltaX = bestX?.delta ?? 0;
    let deltaY = bestY?.delta ?? 0;
    const nextSnap: SnapState = {};

    // 히스테리시스: 이전 스냅 targetId+edge 조합을 우선 유지
    if (prevSnap.x) {
        const ourValue =
            prevSnap.x.ownEdge === 'left'
                ? draggedBounds.left
                : prevSnap.x.ownEdge === 'right'
                    ? draggedBounds.right
                    : draggedBounds.centerX;
        const dist = Math.abs(ourValue - prevSnap.x.targetValue);
        if (dist <= SNAP_RELEASE_THRESHOLD) {
            deltaX = prevSnap.x.targetValue - ourValue;
            nextSnap.x = prevSnap.x;
            guides.vertical = [prevSnap.x.targetValue];
        } else if (bestX) {
            nextSnap.x = {
                targetId: bestX.targetId,
                targetValue: bestX.targetValue,
                ownEdge: bestX.ownEdge,
            };
            guides.vertical = [bestX.targetValue];
        }
    } else if (bestX) {
        nextSnap.x = {
            targetId: bestX.targetId,
            targetValue: bestX.targetValue,
            ownEdge: bestX.ownEdge,
        };
        guides.vertical = [bestX.targetValue];
    }

    if (prevSnap.y) {
        const ourValue =
            prevSnap.y.ownEdge === 'top'
                ? draggedBounds.top
                : prevSnap.y.ownEdge === 'bottom'
                    ? draggedBounds.bottom
                    : draggedBounds.centerY;
        const dist = Math.abs(ourValue - prevSnap.y.targetValue);
        if (dist <= SNAP_RELEASE_THRESHOLD) {
            deltaY = prevSnap.y.targetValue - ourValue;
            nextSnap.y = prevSnap.y;
            guides.horizontal = [prevSnap.y.targetValue];
        } else if (bestY) {
            nextSnap.y = {
                targetId: bestY.targetId,
                targetValue: bestY.targetValue,
                ownEdge: bestY.ownEdge,
            };
            guides.horizontal = [bestY.targetValue];
        }
    } else if (bestY) {
        nextSnap.y = {
            targetId: bestY.targetId,
            targetValue: bestY.targetValue,
            ownEdge: bestY.ownEdge,
        };
        guides.horizontal = [bestY.targetValue];
    }

    return {
        deltaX,
        deltaY,
        guides,
        nextSnap,
    };
}
