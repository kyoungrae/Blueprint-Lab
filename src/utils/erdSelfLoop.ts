import { Position } from 'reactflow';
import type { Rect } from './erdEdgeRouter';
import { pathCrossesRects, MARKER_STUB } from './erdEdgeRouter';

/** 엔티티 노드 레이아웃 상수 (EntityNode.tsx 와 동기화) */
export const ENTITY_HEADER_HEIGHT = 44;
export const ENTITY_ROW_HEIGHT = 28;
export const ENTITY_ADD_ROW_HEIGHT = 36;

export function getAttributeRowCenterY(rowIndex: number): number {
    return ENTITY_HEADER_HEIGHT + rowIndex * ENTITY_ROW_HEIGHT + ENTITY_ROW_HEIGHT / 2;
}

export function resolveFkRowIndex(
    attributes: { name: string; isFK?: boolean }[],
    targetKey?: string,
): number {
    if (targetKey) {
        const idx = attributes.findIndex((a) => a.name === targetKey);
        if (idx >= 0) return idx;
    }
    const fkIdx = attributes.findIndex((a) => a.isFK);
    return fkIdx >= 0 ? fkIdx : 0;
}

export function computeFkOffsetFromNodeCenter(
    rowIndex: number,
    attributeCount: number,
    isLocked?: boolean,
): number {
    const bodyHeight = attributeCount * ENTITY_ROW_HEIGHT + (!isLocked ? ENTITY_ADD_ROW_HEIGHT : 0);
    const nodeHeight = ENTITY_HEADER_HEIGHT + bodyHeight;
    const fkRowCenter = getAttributeRowCenterY(rowIndex);
    return fkRowCenter - nodeHeight / 2;
}

/** 자기 참조 관계 — 같은 핸들이면 루프가 그려지지 않으므로 우측→상단으로 보정 */
export function normalizeSelfRefHandles(
    sourceHandle?: string,
    targetHandle?: string,
): { sourceHandle: string; targetHandle: string } {
    const sh = sourceHandle || 'right';
    const th = targetHandle || 'top';
    if (sh === th) return { sourceHandle: 'right', targetHandle: 'top' };
    return { sourceHandle: sh, targetHandle: th };
}

export function isSelfReferencingRelationship(source: string, target: string) {
    return source === target;
}

function toStepPath(points: [number, number][]): string {
    if (points.length === 0) return '';
    const simplified: [number, number][] = [];
    for (const pt of points) {
        const prev = simplified[simplified.length - 1];
        if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) {
            simplified.push(pt);
        }
    }
    const [[x0, y0], ...rest] = simplified;
    return `M ${x0} ${y0} ${rest.map(([x, y]) => `L ${x} ${y}`).join(' ')}`;
}

export interface SelfLoopPathResult {
    path: string;
    labelX: number;
    labelY: number;
}

const LANE_OFFSET = 48;
const GAP = 24;
const CLEARANCE = 32;
const MIN_APPROACH = MARKER_STUB * 2;

type RouteSide = 'right' | 'left';

function buildRoutePoints(
    sx: number,
    srcY: number,
    tx: number,
    ty: number,
    bounds: Rect,
    side: RouteSide,
): [number, number][] {
    let peakY = bounds.top - CLEARANCE;
    if (ty - peakY < MIN_APPROACH) {
        peakY = ty - MIN_APPROACH;
    }
    const laneX = side === 'right' ? bounds.right + GAP + LANE_OFFSET : bounds.left - GAP - LANE_OFFSET;

    return [
        [sx, srcY],
        [laneX, srcY],
        [laneX, peakY],
        [tx, peakY],
        [tx, ty],
    ];
}

/**
 * 자기 참조 엣지용 직각 루프 — 엔티티 바깥(우측/좌측)으로 돌아 상단에서 다시 들어옴.
 */
export function buildSelfLoopPath(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    _sourcePosition: Position,
    _targetPosition: Position,
    fkYOffset = 0,
    bounds?: Rect,
): SelfLoopPathResult {
    const srcY = sy + fkYOffset;

    if (!bounds) {
        let peakY = Math.min(srcY, ty) - 68;
        if (ty - peakY < MIN_APPROACH) peakY = ty - MIN_APPROACH;
        const laneX = sx + GAP + LANE_OFFSET;
        const path = toStepPath([
            [sx, srcY],
            [laneX, srcY],
            [laneX, peakY],
            [tx, peakY],
            [tx, ty],
        ]);
        return {
            path,
            labelX: (laneX + tx) / 2,
            labelY: peakY - 12,
        };
    }

    const obstacle: Rect = { ...bounds, id: bounds.id };
    const sides: RouteSide[] = ['right', 'left'];

    for (const side of sides) {
        const points = buildRoutePoints(sx, srcY, tx, ty, bounds, side);
        const path = toStepPath(points);
        if (!pathCrossesRects(path, [obstacle])) {
            const laneX = side === 'right'
                ? bounds.right + GAP + LANE_OFFSET
                : bounds.left - GAP - LANE_OFFSET;
            const peakY = bounds.top - CLEARANCE;
            return {
                path,
                labelX: (laneX + tx) / 2,
                labelY: peakY - 12,
            };
        }
    }

    const peakY = bounds.top - CLEARANCE - 40;
    const laneX = bounds.right + GAP + LANE_OFFSET;
    const path = toStepPath([
        [sx, srcY],
        [laneX, srcY],
        [laneX, peakY],
        [tx, peakY],
        [tx, ty],
    ]);
    return {
        path,
        labelX: (laneX + tx) / 2,
        labelY: peakY - 12,
    };
}
