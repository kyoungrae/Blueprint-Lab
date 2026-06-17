import React from 'react';
import {
    type EdgeProps,
    EdgeLabelRenderer,
} from 'reactflow';
import type { RelationshipEndType } from '../types/erd';
import PremiumTooltip from './screenNode/PremiumTooltip';
import { buildSelfLoopPath } from '../utils/erdSelfLoop';
import { buildSmartStepPath, trimPathForMarkers, getMarkerExtent, type Rect } from '../utils/erdEdgeRouter';

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

/** ERDCanvas edgeUpdaterRadius와 동일 - 선이 edge updater 끝에서 시작/종료 */
const EDGE_UPDATER_RADIUS = 36;

function MarkerSymbol({ endType, color }: { endType: RelationshipEndType; color: string }) {
    switch (endType) {
        case '1': return <MarkerOneRequired color={color} />;
        case '1o': return <MarkerOneOptional color={color} />;
        case 'N': return <MarkerManyRequired color={color} />;
        case 'No': return <MarkerManyOptional color={color} />;
        default: return <MarkerOneRequired color={color} />;
    }
}

function PlacedMarker({
    endType,
    color,
    x,
    y,
    angle,
    flip,
}: {
    endType: RelationshipEndType;
    color: string;
    x: number;
    y: number;
    angle: number;
    flip?: boolean;
}) {
    const rotation = flip ? angle + 180 : angle;
    return (
        <g transform={`translate(${x}, ${y}) rotate(${rotation})`} className="pointer-events-none">
            <MarkerSymbol endType={endType} color={color} />
        </g>
    );
}

/** 같은 side를 공유하는 N개 엣지를 SPREAD px 간격으로 분산 */
const SPREAD = 28;

function computeSpreadOffset(index: number, count: number): number {
    if (count <= 1) return 0;
    return (index - (count - 1) / 2) * SPREAD;
}

const ERDEdge = ({
    id,
    source,
    target,
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
    const isSelfLoop = source === target || data?.isSelfRef === true;

    // 분산 오프셋 계산 (left/right → Y축, top/bottom → X축)
    const srcSpread = computeSpreadOffset(data?.sourceIndex ?? 0, data?.sourceCount ?? 1);
    const tgtSpread = computeSpreadOffset(data?.targetIndex ?? 0, data?.targetCount ?? 1);
    const isVerticalSrc = sourcePosition === 'left' || sourcePosition === 'right';
    const isVerticalTgt = targetPosition === 'left' || targetPosition === 'right';
    const adjSrcX = sourceX + (isVerticalSrc ? 0 : srcSpread);
    const adjSrcY = sourceY + (isVerticalSrc ? srcSpread : 0);
    const adjTgtX = targetX + (isVerticalTgt ? 0 : tgtSpread);
    const adjTgtY = targetY + (isVerticalTgt ? tgtSpread : 0);

    const [sx, sy] = (() => {
        switch (sourcePosition) {
            case 'left': return [adjSrcX - EDGE_UPDATER_RADIUS, adjSrcY];
            case 'right': return [adjSrcX + EDGE_UPDATER_RADIUS, adjSrcY];
            case 'top': return [adjSrcX, adjSrcY - EDGE_UPDATER_RADIUS];
            case 'bottom': return [adjSrcX, adjSrcY + EDGE_UPDATER_RADIUS];
            default: return [adjSrcX, adjSrcY];
        }
    })();
    const [tx, ty] = (() => {
        switch (targetPosition) {
            case 'left': return [adjTgtX - EDGE_UPDATER_RADIUS, adjTgtY];
            case 'right': return [adjTgtX + EDGE_UPDATER_RADIUS, adjTgtY];
            case 'top': return [adjTgtX, adjTgtY - EDGE_UPDATER_RADIUS];
            case 'bottom': return [adjTgtX, adjTgtY + EDGE_UPDATER_RADIUS];
            default: return [adjTgtX, adjTgtY];
        }
    })();

    const fkYOffset = (data?.fkOffsetFromCenter as number | undefined) ?? 0;
    const nodeBounds = data?.nodeBounds as Rect | undefined;
    const obstacleRects = (data?.obstacleRects as Rect[] | undefined) ?? [];

    const selfLoopResult = isSelfLoop
        ? buildSelfLoopPath(sx, sy, tx, ty, sourcePosition, targetPosition, fkYOffset, nodeBounds)
        : null;

    const [rawPath, labelX, labelY] = selfLoopResult
        ? [selfLoopResult.path, selfLoopResult.labelX, selfLoopResult.labelY]
        : buildSmartStepPath(
            {
                sourceX: sx,
                sourceY: sy,
                targetX: tx,
                targetY: ty,
                sourcePosition,
                targetPosition,
            },
            obstacleRects,
        );

    const startExtent = isSelfLoop ? 0 : getMarkerExtent(sourceEnd);
    const endExtent = getMarkerExtent(targetEnd);
    const { trimmedPath: edgePath, start: startMarker, end: endMarker } = trimPathForMarkers(
        rawPath,
        startExtent,
        endExtent,
    );

    // 엔드포인트 점 위치 — EdgeLabelRenderer 좌표계 (flowX, flowY)
    // 핸들 위치 기준: adjSrc/adjTgt (spread 적용된 좌표)
    const dotSrcX = adjSrcX;
    const dotSrcY = adjSrcY;
    const dotTgtX = adjTgtX;
    const dotTgtY = adjTgtY;

    const dotStyle = (color: string): React.CSSProperties => ({
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        border: '1.5px solid white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        pointerEvents: 'none',
        zIndex: 10,
    });

    return (
        <>
            <g className="react-flow__edge-path">
                <path
                    id={id}
                    d={edgePath}
                    style={{ ...style, fill: 'none', strokeLinecap: 'butt', strokeLinejoin: 'round' }}
                    className="react-flow__edge-path"
                />
                {startMarker && !isSelfLoop && (
                    <PlacedMarker
                        endType={sourceEnd}
                        color={edgeColor}
                        x={startMarker.x}
                        y={startMarker.y}
                        angle={startMarker.angle}
                        flip
                    />
                )}
                {endMarker && (
                    <PlacedMarker
                        endType={targetEnd}
                        color={edgeColor}
                        x={endMarker.x}
                        y={endMarker.y}
                        angle={endMarker.angle}
                    />
                )}
                {!isSelfLoop && (
                    <>
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
                                animationDelay: '1s',
                            }}
                            className="pointer-events-none"
                        />
                    </>
                )}
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
                {/* 분산 연결 점 — DOM 레이어에서 렌더링해 노드 위에 표시 */}
                {!isSelfLoop && (
                    <>
                        <div style={{ ...dotStyle(edgeColor), transform: `translate(-50%, -50%) translate(${dotSrcX}px, ${dotSrcY}px)` }} />
                        <div style={{ ...dotStyle(edgeColor), transform: `translate(-50%, -50%) translate(${dotTgtX}px, ${dotTgtY}px)` }} />
                    </>
                )}
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan"
                >
                    <PremiumTooltip label="관계 설정 수정 (더블 클릭)" dotColor={edgeColor}>
                        <div
                            style={{
                                borderColor: isSelfLoop ? edgeColor : `${edgeColor}33`,
                                color: edgeColor,
                                backgroundColor: isSelfLoop ? `${edgeColor}14` : 'rgba(255, 255, 255, 0.95)',
                            }}
                            className="px-2.5 py-0.5 backdrop-blur-sm border rounded-full shadow-sm text-[10px] font-bold cursor-pointer hover:scale-105 transition-all duration-200 whitespace-nowrap"
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = edgeColor;
                                e.currentTarget.style.backgroundColor = `${edgeColor}22`;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = isSelfLoop ? edgeColor : `${edgeColor}33`;
                                e.currentTarget.style.backgroundColor = isSelfLoop ? `${edgeColor}14` : 'rgba(255, 255, 255, 0.95)';
                            }}
                        >
                            {isSelfLoop ? '자기 참조 (Self Reference)' : label}
                        </div>
                    </PremiumTooltip>
                </div>
            </EdgeLabelRenderer>
        </>
    );
};

export default ERDEdge;
