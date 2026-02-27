import {
    type EdgeProps,
    getSmoothStepPath,
    EdgeLabelRenderer,
} from 'reactflow';
import type { RelationshipEndType } from '../types/erd';

const STROKE_W = 1.5;

/** hex 색상을 흰색과 블렌드해 더 밝은 톤으로 (선 색과 비슷하지만 구분되게) */
function lightenColor(hex: string, amount = 0.45): string {
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const rr = Math.round(r * (1 - amount) + 255 * amount);
    const gg = Math.round(g * (1 - amount) + 255 * amount);
    const bb = Math.round(b * (1 - amount) + 255 * amount);
    return `rgb(${rr},${gg},${bb})`;
}

/** type에서 sourceEnd/targetEnd 유도 */
function getEndsFromType(type: string): { sourceEnd: RelationshipEndType; targetEnd: RelationshipEndType } {
    switch (type) {
        case '1:1': return { sourceEnd: '1', targetEnd: '1' };
        case '1:N': return { sourceEnd: '1', targetEnd: 'N' };
        case 'N:M': return { sourceEnd: 'N', targetEnd: 'N' };
        default: return { sourceEnd: '1', targetEnd: 'N' };
    }
}

/** 일 필수 (1): 두 개의 수직선 - 경로에 수직 */
function MarkerOneRequired({ color }: { color: string }) {
    const h = 5;
    const gap = 3;
    return (
        <g stroke={color} strokeWidth={STROKE_W} strokeLinecap="round">
            <line x1={0} y1={-h} x2={0} y2={h} />
            <line x1={gap} y1={-h} x2={gap} y2={h} />
        </g>
    );
}

/** 일 선택 (0 또는 1): 원 + 수직선 */
function MarkerOneOptional({ color }: { color: string }) {
    const r = 2.5;
    const h = 4;
    return (
        <g stroke={color} strokeWidth={STROKE_W} fill="none" strokeLinecap="round">
            <circle cx={r + 1} cy={0} r={r} />
            <line x1={r * 2 + 4} y1={-h} x2={r * 2 + 4} y2={h} />
        </g>
    );
}

/** 다 필수 (1 이상): 선 + 까마귀발 */
function MarkerManyRequired({ color }: { color: string }) {
    const lineH = 5;
    const gap = 3;
    const h = 6;
    const s = 3.5;
    return (
        <g stroke={color} strokeWidth={STROKE_W} strokeLinecap="round">
            <line x1={0} y1={-lineH} x2={0} y2={lineH} />
            <line x1={gap} y1={0} x2={gap + h} y2={-s} />
            <line x1={gap} y1={0} x2={gap + h} y2={0} />
            <line x1={gap} y1={0} x2={gap + h} y2={s} />
        </g>
    );
}

/** 다 선택 (0 이상): 원 + 까마귀발 - 표준 ERD: 원 바로 옆에 세발 */
function MarkerManyOptional({ color }: { color: string }) {
    const r = 2.5;
    const cx = r + 1;
    const cfStart = cx + r + 2;
    const h = 4;
    const s = 3.5;
    return (
        <g stroke={color} strokeWidth={STROKE_W} fill="none" strokeLinecap="round">
            <circle cx={cx} cy={0} r={r} />
            <line x1={cfStart} y1={0} x2={cfStart + h} y2={-s} />
            <line x1={cfStart} y1={0} x2={cfStart + h} y2={0} />
            <line x1={cfStart} y1={0} x2={cfStart + h} y2={s} />
        </g>
    );
}

const MARKER_GAP = 0;
/** ERDCanvas edgeUpdaterRadius와 동일 - 선이 edge updater 끝에서 시작/종료 */
const EDGE_UPDATER_RADIUS = 20;

function EndMarker({ endType, color, id, isStart }: { endType: RelationshipEndType; color: string; id: string; isStart?: boolean }) {
    const content = {
        '1': <MarkerOneRequired color={color} />,
        '1o': <MarkerOneOptional color={color} />,
        'N': <MarkerManyRequired color={color} />,
        'No': <MarkerManyOptional color={color} />,
    }[endType];

    return (
        <marker
            id={id}
            markerWidth={48}
            markerHeight={48}
            viewBox="-12 -12 24 24"
            refX={isStart ? MARKER_GAP : MARKER_GAP + 1}
            refY={0}
            orient={isStart ? 'auto-start-reverse' : 'auto'}
            markerUnits="userSpaceOnUse"
        >
            {content}
        </marker>
    );
}

const ERDEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    label,
    style = {},
    interactionWidth,
    data,
}: EdgeProps) => {
    const edgeColor = data?.color || '#3b82f6';
    const relType = data?.type || '1:N';
    const sourceEnd = (data?.sourceEnd ?? getEndsFromType(relType).sourceEnd) as RelationshipEndType;
    const targetEnd = (data?.targetEnd ?? getEndsFromType(relType).targetEnd) as RelationshipEndType;

    const [sx, sy] = (() => {
        switch (sourcePosition) {
            case 'left': return [sourceX - EDGE_UPDATER_RADIUS, sourceY];
            case 'right': return [sourceX + EDGE_UPDATER_RADIUS, sourceY];
            case 'top': return [sourceX, sourceY - EDGE_UPDATER_RADIUS];
            case 'bottom': return [sourceX, sourceY + EDGE_UPDATER_RADIUS];
            default: return [sourceX, sourceY];
        }
    })();
    const [tx, ty] = (() => {
        switch (targetPosition) {
            case 'left': return [targetX - EDGE_UPDATER_RADIUS, targetY];
            case 'right': return [targetX + EDGE_UPDATER_RADIUS, targetY];
            case 'top': return [targetX, targetY - EDGE_UPDATER_RADIUS];
            case 'bottom': return [targetX, targetY + EDGE_UPDATER_RADIUS];
            default: return [targetX, targetY];
        }
    })();

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX: sx,
        sourceY: sy,
        sourcePosition,
        targetX: tx,
        targetY: ty,
        targetPosition,
    });

    const markerStartId = `erd-start-${sourceEnd}-${id}`;
    const markerEndId = `erd-end-${targetEnd}-${id}`;

    return (
        <>
            <g className="react-flow__edge-path">
                <defs>
                    <EndMarker endType={sourceEnd} color={edgeColor} id={markerStartId} isStart />
                    <EndMarker endType={targetEnd} color={edgeColor} id={markerEndId} />
                </defs>
                <path
                    id={id}
                    d={edgePath}
                    style={{ ...style, fill: 'none', strokeLinecap: 'butt', strokeLinejoin: 'round' }}
                    className="react-flow__edge-path"
                    markerStart={`url(#${markerStartId})`}
                    markerEnd={`url(#${markerEndId})`}
                />
                {/* 빛이 시작점→끝점으로 이동하는 흐름 애니메이션 */}
                <path
                    d={edgePath}
                    pathLength={1}
                    fill="none"
                    stroke={lightenColor(edgeColor)}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="0.02 0.08"
                    style={{
                        opacity: 0.9,
                        animation: 'erd-flow-light 2s linear infinite',
                    }}
                    className="pointer-events-none"
                />
                {interactionWidth != null && interactionWidth > 0 && (
                    <path
                        d={edgePath}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={interactionWidth}
                        className="react-flow__edge-interaction"
                    />
                )}
            </g>
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan group"
                >
                    <div
                        style={{
                            borderColor: `${edgeColor}33`,
                            color: edgeColor,
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        }}
                        className="px-2 py-0.5 backdrop-blur-sm border rounded shadow-sm text-[10px] font-bold cursor-pointer hover:scale-110 transition-all duration-200"
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = edgeColor;
                            e.currentTarget.style.backgroundColor = `${edgeColor}11`;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = `${edgeColor}33`;
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                        }}
                    >
                        {label}
                    </div>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 translate-y-1 group-hover:translate-y-0 z-50">
                        <div className="bg-gray-800/90 backdrop-blur-sm text-white text-[10px] py-1 px-2.5 rounded-lg shadow-xl whitespace-nowrap flex items-center gap-1.5 border border-white/10">
                            <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: edgeColor }} />
                            관계 설정 수정 (더블 클릭)
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-[5px] border-x-transparent border-t-[5px] border-t-gray-800/90" />
                        </div>
                    </div>
                </div>
            </EdgeLabelRenderer>
        </>
    );
};

export default ERDEdge;
