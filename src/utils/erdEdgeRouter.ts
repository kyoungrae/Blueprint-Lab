import { Position, getSmoothStepPath } from 'reactflow';
import type { RelationshipEndType } from '../types/erd';

export interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    id?: string;
}

const PAD = 12;

export function expandRect(rect: Rect, padding = PAD): Rect {
    return {
        ...rect,
        left: rect.left - padding,
        top: rect.top - padding,
        right: rect.right + padding,
        bottom: rect.bottom + padding,
    };
}

function pointInRect(x: number, y: number, rect: Rect): boolean {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** 선분이 축정렬 사각형과 교차하는지 (끝점이 내부에 있어도 교차로 간주) */
function segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, rect: Rect): boolean {
    if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    if (maxX < rect.left || minX > rect.right || maxY < rect.top || minY > rect.bottom) {
        return false;
    }

    // 축정렬 선분
    if (x1 === x2) {
        return x1 >= rect.left && x1 <= rect.right && maxY >= rect.top && minY <= rect.bottom;
    }
    if (y1 === y2) {
        return y1 >= rect.top && y1 <= rect.bottom && maxX >= rect.left && minX <= rect.right;
    }

    // 일반 선분 — 사각형 네 변과 교차 검사
    const edges: [number, number, number, number][] = [
        [rect.left, rect.top, rect.right, rect.top],
        [rect.right, rect.top, rect.right, rect.bottom],
        [rect.right, rect.bottom, rect.left, rect.bottom],
        [rect.left, rect.bottom, rect.left, rect.top],
    ];
    for (const [ax, ay, bx, by] of edges) {
        if (segmentsIntersect(x1, y1, x2, y2, ax, ay, bx, by)) return true;
    }
    return false;
}

function segmentsIntersect(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number,
): boolean {
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** SVG path(M/L)를 직선 세그먼트 배열로 변환 (Q/T 등은 직선 근사) */
function pathToSegments(d: string): [number, number, number, number][] {
    const segments: [number, number, number, number][] = [];
    const tokens = d.match(/[MLQ][^MLQ]*/gi) ?? [];
    let cx = 0;
    let cy = 0;

    for (const token of tokens) {
        const cmd = token[0];
        const nums = token
            .slice(1)
            .trim()
            .split(/[\s,]+/)
            .map(Number)
            .filter((n) => !Number.isNaN(n));

        if (cmd === 'M' || cmd === 'L') {
            for (let i = 0; i + 1 < nums.length; i += 2) {
                const nx = nums[i];
                const ny = nums[i + 1];
                if (cmd === 'L' || i > 0) {
                    segments.push([cx, cy, nx, ny]);
                }
                cx = nx;
                cy = ny;
            }
        } else if (cmd === 'Q' && nums.length >= 4) {
            // 2차 베지어를 8등분 직선 근사
            const [cpx, cpy, ex, ey] = nums;
            let px = cx;
            let py = cy;
            for (let t = 1; t <= 8; t++) {
                const r = t / 8;
                const inv = 1 - r;
                const nx = inv * inv * cx + 2 * inv * r * cpx + r * r * ex;
                const ny = inv * inv * cy + 2 * inv * r * cpy + r * r * ey;
                segments.push([px, py, nx, ny]);
                px = nx;
                py = ny;
            }
            cx = ex;
            cy = ey;
        }
    }
    return segments;
}

export function pathCrossesRects(path: string, rects: Rect[]): boolean {
    if (rects.length === 0) return false;
    const expanded = rects.map((r) => expandRect(r));
    const segments = pathToSegments(path);
    for (const [x1, y1, x2, y2] of segments) {
        for (const rect of expanded) {
            if (segmentIntersectsRect(x1, y1, x2, y2, rect)) return true;
        }
    }
    return false;
}

export interface SmartStepPathParams {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: Position;
    targetPosition: Position;
}

/** 장애물(다른 엔티티)을 피하는 직각 연결 경로 */
export function buildSmartStepPath(
    params: SmartStepPathParams,
    obstacles: Rect[],
): [path: string, labelX: number, labelY: number] {
    const offsets = [40, 60, 80, 100, 130, 160, 200, 260, 320];
    let best: [string, number, number] | null = null;

    const pick = (result: ReturnType<typeof getSmoothStepPath>): [string, number, number] =>
        [result[0], result[1], result[2]];

    for (const offset of offsets) {
        const result = getSmoothStepPath({
            ...params,
            offset,
            borderRadius: 16,
        });
        const picked = pick(result);
        if (!pathCrossesRects(picked[0], obstacles)) {
            return picked;
        }
        best = picked;
    }

    // 여전히 교차하면 중간 채널을 위/아래로 밀어 재시도
    const midY = (params.sourceY + params.targetY) / 2;
    const channelOffsets = [-120, -80, -40, 40, 80, 120, 160];
    for (const shift of channelOffsets) {
        for (const offset of offsets) {
            const result = getSmoothStepPath({
                ...params,
                offset,
                borderRadius: 16,
                centerY: midY + shift,
            });
            const picked = pick(result);
            if (!pathCrossesRects(picked[0], obstacles)) {
                return picked;
            }
        }
    }

    return best ?? pick(getSmoothStepPath({ ...params, offset: 200, borderRadius: 16 }));
}

const MARKER_STUB = 28;

export interface MarkerPlacement {
    x: number;
    y: number;
    angle: number;
}

/** SVG path(M/L/Q)를 꼭짓점 배열로 변환 */
export function parsePathToPoints(d: string): [number, number][] {
    const points: [number, number][] = [];
    const tokens = d.match(/[MLQ][^MLQ]*/gi) ?? [];
    let cx = 0;
    let cy = 0;

    for (const token of tokens) {
        const cmd = token[0];
        const nums = token
            .slice(1)
            .trim()
            .split(/[\s,]+/)
            .map(Number)
            .filter((n) => !Number.isNaN(n));

        if (cmd === 'M' || cmd === 'L') {
            for (let i = 0; i + 1 < nums.length; i += 2) {
                cx = nums[i];
                cy = nums[i + 1];
                points.push([cx, cy]);
            }
        } else if (cmd === 'Q' && nums.length >= 4) {
            const [cpx, cpy, ex, ey] = nums;
            for (let t = 1; t <= 6; t++) {
                const r = t / 6;
                const inv = 1 - r;
                const nx = inv * inv * cx + 2 * inv * r * cpx + r * r * ex;
                const ny = inv * inv * cy + 2 * inv * r * cpy + r * r * ey;
                points.push([nx, ny]);
            }
            cx = ex;
            cy = ey;
        }
    }
    return points;
}

/** 카디널리티 기호가 경로 축 방향으로 차지하는 길이 (선 끝에서 안쪽으로 비울 거리) */
export function getMarkerExtent(endType: RelationshipEndType): number {
    switch (endType) {
        case '1': return 9;
        case '1o': return 17;
        case 'N': return 14;
        case 'No': return 19;
        default: return 10;
    }
}

function segmentAngle(x0: number, y0: number, x1: number, y1: number): number {
    return (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
}

function pathLength(points: [number, number][]): number {
    let len = 0;
    for (let i = 0; i < points.length - 1; i++) {
        len += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    }
    return len;
}

function pointAtDistance(
    points: [number, number][],
    dist: number,
): { x: number; y: number } | null {
    if (points.length < 2) return null;
    let remaining = dist;
    for (let i = 0; i < points.length - 1; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        const segLen = Math.hypot(x1 - x0, y1 - y0);
        if (segLen < 1e-6) continue;
        if (remaining <= segLen) {
            const t = remaining / segLen;
            return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
        }
        remaining -= segLen;
    }
    const last = points[points.length - 1];
    return { x: last[0], y: last[1] };
}

function buildPathFromPoints(points: [number, number][]): string {
    if (points.length === 0) return '';
    const [[x0, y0], ...rest] = points;
    return `M ${x0} ${y0} ${rest.map(([x, y]) => `L ${x} ${y}`).join(' ')}`;
}

/** 경로 양 끝에 기호를 두고, 기호 영역만큼 선을 안쪽으로 잘라 겹침 방지 */
export function trimPathForMarkers(
    pathD: string,
    startExtent: number,
    endExtent: number,
): { trimmedPath: string; start: MarkerPlacement | null; end: MarkerPlacement | null } {
    const points = parsePathToPoints(pathD);
    if (points.length < 2) {
        return { trimmedPath: pathD, start: null, end: null };
    }

    const total = pathLength(points);
    const minGap = 12;
    const startPt = points[0];
    const endPt = points[points.length - 1];
    const startAngle = segmentAngle(startPt[0], startPt[1], points[1][0], points[1][1]);
    const endAngle = segmentAngle(
        points[points.length - 2][0],
        points[points.length - 2][1],
        endPt[0],
        endPt[1],
    );

    if (total < startExtent + endExtent + minGap) {
        return {
            trimmedPath: pathD,
            start: { x: startPt[0], y: startPt[1], angle: startAngle },
            end: { x: endPt[0], y: endPt[1], angle: endAngle },
        };
    }

    const trimStart = pointAtDistance(points, startExtent);
    const trimEnd = pointAtDistance(points, total - endExtent);
    if (!trimStart || !trimEnd) {
        return { trimmedPath: pathD, start: null, end: null };
    }

    const innerPoints: [number, number][] = [[trimStart.x, trimStart.y]];
    let walked = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const segStart = walked;
        const [x1, y1] = points[i + 1];
        const segLen = Math.hypot(x1 - points[i][0], y1 - points[i][1]);
        walked += segLen;
        const segEnd = walked;

        if (segEnd <= startExtent || segStart >= total - endExtent) continue;
        if (segEnd < total - endExtent) {
            innerPoints.push([x1, y1]);
        }
    }
    innerPoints.push([trimEnd.x, trimEnd.y]);

    const deduped: [number, number][] = [];
    for (const p of innerPoints) {
        const prev = deduped[deduped.length - 1];
        if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) deduped.push(p);
    }

    return {
        trimmedPath: deduped.length >= 2 ? buildPathFromPoints(deduped) : pathD,
        start: { x: startPt[0], y: startPt[1], angle: startAngle },
        end: { x: endPt[0], y: endPt[1], angle: endAngle },
    };
}

export { MARKER_STUB };

