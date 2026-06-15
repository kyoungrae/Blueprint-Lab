import { Position } from 'reactflow';

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
    const [[x0, y0], ...rest] = points;
    return `M ${x0} ${y0} ${rest.map(([x, y]) => `L ${x} ${y}`).join(' ')}`;
}

/**
 * 자기 참조 엣지용 직각(스텝) 루프 경로.
 * 엔티티 밖으로 나갔다가 위쪽을 따라 다시 들어오는 형태.
 */
export function buildSelfLoopPath(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    sourcePosition: Position,
    targetPosition: Position,
): [path: string, labelX: number, labelY: number] {
    const dist = Math.hypot(tx - sx, ty - sy);
    const offset = 50;
    const rise = 60;
    const peakY = Math.min(sy, ty) - rise;

    if (dist < 10) {
        const path = toStepPath([
            [sx, sy],
            [sx + offset, sy],
            [sx + offset, peakY],
            [sx - offset, peakY],
            [sx - offset, ty],
            [tx, ty],
        ]);
        return [path, sx, peakY - 10];
    }

    if (sourcePosition === Position.Right && targetPosition === Position.Top) {
        const path = toStepPath([
            [sx, sy],
            [sx + offset, sy],
            [sx + offset, peakY],
            [tx, peakY],
            [tx, ty],
        ]);
        return [path, (sx + offset + tx) / 2, peakY - 10];
    }

    if (sourcePosition === Position.Right && targetPosition === Position.Left) {
        const path = toStepPath([
            [sx, sy],
            [sx + offset, sy],
            [sx + offset, peakY],
            [tx - offset, peakY],
            [tx - offset, ty],
            [tx, ty],
        ]);
        return [path, (sx + tx) / 2, peakY - 10];
    }

    if (sourcePosition === Position.Left && targetPosition === Position.Top) {
        const path = toStepPath([
            [sx, sy],
            [sx - offset, sy],
            [sx - offset, peakY],
            [tx, peakY],
            [tx, ty],
        ]);
        return [path, (sx - offset + tx) / 2, peakY - 10];
    }

    const dir = sourcePosition === Position.Left ? -1 : 1;
    const path = toStepPath([
        [sx, sy],
        [sx + dir * offset, sy],
        [sx + dir * offset, peakY],
        [tx, peakY],
        [tx, ty],
    ]);
    return [path, (sx + tx) / 2, peakY - 10];
}
