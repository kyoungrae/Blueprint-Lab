import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BaseEdge, getSmoothStepPath, Position, useReactFlow, useStore } from 'reactflow';
import { useYjsStore } from '../../../store/yjsStore';
import type { ProcessFlowEdge as ProcessFlowEdgeType } from '../../../types/processFlow';
import type { EdgeProps } from 'reactflow';
import { ArrowLeft, ArrowRight, X, Trash2 } from 'lucide-react';
import PremiumTooltip from '../../screenNode/PremiumTooltip';

interface ProcessFlowEdgeProps extends EdgeProps {
    data?: ProcessFlowEdgeType;
}

/** 패널 닫힌 직후 포인터가 핸들 위에 남아 툴팁·확장이 한 번 깜빡이는 현상 방지 */
const HANDLE_HOVER_SUPPRESS_MS = 420;

/** 중앙 핸들·패널: body 고정 좌표 (EdgeLabelRenderer 플로우 좌표 오류 방지) */
const PF_EDGE_HANDLE_Z = 120015;

/** 핸들(HTML)이 노드 레이어에서 SVG 위에 그려져 마커 끝이 가려지지 않도록, 화살표가 있을 때만 끝점을 핸들 바깥(연결선 쪽)으로 당김 */
const outwardFromHandle: Record<Position, { x: number; y: number }> = {
    [Position.Top]: { x: 0, y: -1 },
    [Position.Bottom]: { x: 0, y: 1 },
    [Position.Left]: { x: -1, y: 0 },
    [Position.Right]: { x: 1, y: 0 },
};

const ProcessFlowEdgeComponent: React.FC<ProcessFlowEdgeProps> = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    label = '연결방향 설정',
}) => {
    const { flowToScreenPosition } = useReactFlow();
    useStore((s) => s.transform);

    const yjsUpdateEdge = useYjsStore((s: any) => s.pfUpdateEdge);
    const yjsDeleteEdge = useYjsStore((s: any) => s.pfDeleteEdge);
    const [isEditing, setIsEditing] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const wasEditingRef = useRef(false);
    const handleHoverSuppressUntilRef = useRef(0);

    useEffect(() => {
        if (wasEditingRef.current && !isEditing) {
            setIsHovered(false);
            handleHoverSuppressUntilRef.current = Date.now() + HANDLE_HOVER_SUPPRESS_MS;
        }
        wasEditingRef.current = isEditing;
    }, [isEditing]);

    useEffect(() => {
        if (isEditing) setIsHovered(false);
    }, [isEditing]);

    const trySetHandleHovered = useCallback((next: boolean) => {
        if (next && Date.now() < handleHoverSuppressUntilRef.current) return;
        setIsHovered(next);
    }, []);

    const handleOpenEdgePanel = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        e?.preventDefault();
        setIsHovered(false);
        setIsEditing(true);
    }, []);

    const handleArrowChange = useCallback(
        (start: string, end: string) => {
            yjsUpdateEdge(id, {
                arrow: { start: start as any, end: end as any },
            });
            setIsEditing(false);
        },
        [id, yjsUpdateEdge]
    );

    const handleSwapArrows = useCallback(() => {
        const s = (data?.arrow?.start as string | undefined) ?? 'none';
        const e = (data?.arrow?.end as string | undefined) ?? 'arrow';
        yjsUpdateEdge(id, {
            arrow: { start: e as any, end: s as any },
        });
    }, [id, data?.arrow?.start, data?.arrow?.end, yjsUpdateEdge]);

    const handleColorChange = useCallback(
        (color: string) => {
            yjsUpdateEdge(id, {
                style: { ...data?.style, stroke: color },
            });
        },
        [id, data?.style, yjsUpdateEdge]
    );

    const currentArrow = {
        start: data?.arrow?.start ?? 'none',
        end: data?.arrow?.end ?? 'arrow',
    } as { start: 'none' | 'arrow'; end: 'none' | 'arrow' };
    const edgeColor = data?.style?.stroke ?? '#2563eb';
    const strokeW = data?.style?.strokeWidth ?? 2;
    const showStartArrow = currentArrow.start === 'arrow';
    const showEndArrow = currentArrow.end === 'arrow';

    const safeSourcePosition = sourcePosition ?? Position.Bottom;
    const safeTargetPosition = targetPosition ?? Position.Top;
    const arrowInset = Math.min(12, Math.max(6, Math.round(6 + strokeW * 2)));
    let adjSourceX = sourceX;
    let adjSourceY = sourceY;
    let adjTargetX = targetX;
    let adjTargetY = targetY;
    if (showStartArrow) {
        const d = outwardFromHandle[safeSourcePosition];
        adjSourceX += d.x * arrowInset;
        adjSourceY += d.y * arrowInset;
    }
    if (showEndArrow) {
        const d = outwardFromHandle[safeTargetPosition];
        adjTargetX += d.x * arrowInset;
        adjTargetY += d.y * arrowInset;
    }

    const [edgePath, rawLabelX, rawLabelY] = getSmoothStepPath({
        sourceX: adjSourceX,
        sourceY: adjSourceY,
        sourcePosition: safeSourcePosition,
        targetX: adjTargetX,
        targetY: adjTargetY,
        targetPosition: safeTargetPosition,
    });

    const labelX = Number.isFinite(rawLabelX) ? rawLabelX : (sourceX + targetX) / 2;
    const labelY = Number.isFinite(rawLabelY) ? rawLabelY : (sourceY + targetY) / 2;

    const anchorScreen = flowToScreenPosition({ x: labelX, y: labelY });

    const mkId = (suffix: string) => `pf-arrow-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}-${suffix}`;

    const handlePortal =
        !isEditing && typeof document !== 'undefined' ? (
            <div
                className="nodrag nopan"
                style={{
                    position: 'fixed',
                    left: anchorScreen.x,
                    top: anchorScreen.y,
                    transform: 'translate(-50%, -50%)',
                    zIndex: PF_EDGE_HANDLE_Z,
                    pointerEvents: 'none',
                }}
            >
                <div className="pointer-events-auto flex flex-col items-center">
                    <PremiumTooltip
                        label="더블클릭 — 연결 방향·색상 설정"
                        dotColor={edgeColor}
                        placement="top"
                        forceBodyPortal
                        zIndex={PF_EDGE_HANDLE_Z + 1}
                    >
                        <button
                            type="button"
                            title="연결 설정 (더블 클릭)"
                            aria-label="연결선 설정 열기"
                            className={`nodrag nopan flex items-center justify-center border-2 shadow-sm backdrop-blur-sm bg-white/95 transition-all duration-200 ease-out select-none outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-400 ${
                                isHovered
                                    ? 'px-3 py-1.5 rounded-lg min-h-[30px]'
                                    : 'w-[14px] h-[14px] min-w-[14px] min-h-[14px] rounded-full p-0'
                            }`}
                            style={{
                                borderColor: isHovered ? edgeColor : `${edgeColor}aa`,
                                color: edgeColor,
                                backgroundColor: isHovered ? `${edgeColor}14` : 'rgba(255, 255, 255, 0.96)',
                            }}
                            onMouseEnter={() => trySetHandleHovered(true)}
                            onMouseLeave={() => trySetHandleHovered(false)}
                            onDoubleClick={handleOpenEdgePanel}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            {isHovered ? (
                                <span className="text-[10px] font-black whitespace-nowrap leading-tight text-center">
                                    {label}
                                </span>
                            ) : (
                                <span
                                    className="pointer-events-none h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: edgeColor }}
                                    aria-hidden
                                />
                            )}
                        </button>
                    </PremiumTooltip>
                </div>
            </div>
        ) : null;

    const editPanel = isEditing ? (
        <div
            className="nodrag nopan pointer-events-auto"
            style={{
                position: 'fixed',
                left: anchorScreen.x,
                top: anchorScreen.y,
                transform: 'translate(-50%, calc(-100% - 10px))',
                zIndex: 120020,
            }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="flex w-64 flex-col items-center animate-in fade-in zoom-in-[0.92] duration-200 ease-out origin-bottom">
                <div className="relative w-full rounded-2xl border border-gray-200/95 bg-white/95 shadow-xl shadow-black/[0.08] backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                            연결 방향 설정
                        </h3>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="rounded-lg p-1 transition-colors hover:bg-gray-100"
                        >
                            <X size={16} className="text-gray-500" />
                        </button>
                    </div>

                    <div className="space-y-4 px-4 pb-2 pt-4">
                        <div className="flex items-end gap-1.5">
                            <div className="min-w-0 flex-1">
                                <label className="mb-1 block text-xs font-medium text-gray-600">시작 화살표</label>
                                <select
                                    value={currentArrow.start}
                                    onChange={(e) => handleArrowChange(e.target.value, currentArrow.end || 'arrow')}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="none">없음</option>
                                    <option value="arrow">화살표</option>
                                </select>
                            </div>

                            <button
                                type="button"
                                title="시작 ↔ 끝 화살표 바꾸기"
                                onClick={(ev) => {
                                    ev.stopPropagation();
                                    handleSwapArrows();
                                }}
                                className="nodrag nopan mb-px flex h-[34px] w-8 shrink-0 flex-col items-center justify-center gap-0 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-95"
                            >
                                <ArrowLeft size={11} strokeWidth={2.25} className="-mb-px" aria-hidden />
                                <ArrowRight size={11} strokeWidth={2.25} className="-mt-px" aria-hidden />
                            </button>

                            <div className="min-w-0 flex-1">
                                <label className="mb-1 block text-xs font-medium text-gray-600">끝 화살표</label>
                                <select
                                    value={currentArrow.end}
                                    onChange={(e) => handleArrowChange(currentArrow.start || 'none', e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="none">없음</option>
                                    <option value="arrow">화살표</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">선 색상</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={edgeColor}
                                    onChange={(e) => handleColorChange(e.target.value)}
                                    className="h-8 w-8 cursor-pointer rounded-lg border border-gray-200"
                                />
                                <input
                                    type="text"
                                    value={edgeColor}
                                    onChange={(e) => handleColorChange(e.target.value)}
                                    className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 border-t border-gray-100 px-4 py-3">
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (window.confirm('이 연결선을 삭제하시겠습니까?')) {
                                    yjsDeleteEdge(id);
                                    setIsEditing(false);
                                }
                            }}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-600"
                        >
                            <Trash2 size={12} />
                            삭제
                        </button>
                    </div>
                </div>
                <div className="pointer-events-none relative -mt-px flex h-[12px] w-full shrink-0 justify-center" aria-hidden>
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 border-x-[11px] border-x-transparent border-t-[12px] border-t-gray-200/95" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-px border-x-[10px] border-x-transparent border-t-[11px] border-t-[rgba(255,255,255,0.96)]" />
                </div>
            </div>
        </div>
    ) : null;

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={showEndArrow ? `url(#${mkId('end')})` : undefined}
                markerStart={showStartArrow ? `url(#${mkId('start')})` : undefined}
                interactionWidth={Math.max(20, strokeW + 18)}
                style={{ stroke: edgeColor, strokeWidth: strokeW, strokeLinecap: 'round', strokeLinejoin: 'round' }}
            />

            {handlePortal && createPortal(handlePortal, document.body)}
            {isEditing && editPanel && createPortal(editPanel, document.body)}

            <defs>
                {showEndArrow && (
                    <marker
                        id={mkId('end')}
                        viewBox="-2 -2 16 16"
                        refX="0"
                        refY="6"
                        markerWidth="14"
                        markerHeight="14"
                        markerUnits="userSpaceOnUse"
                        orient="auto"
                        overflow="visible"
                    >
                        <polygon points="0 1, 12 6, 0 11" fill={edgeColor} />
                    </marker>
                )}
                {showStartArrow && (
                    <marker
                        id={mkId('start')}
                        viewBox="-2 -2 16 16"
                        refX="1"
                        refY="6"
                        markerWidth="14"
                        markerHeight="14"
                        markerUnits="userSpaceOnUse"
                        orient="auto-start-reverse"
                        overflow="visible"
                    >
                        <polygon points="0 1, 12 6, 0 11" fill={edgeColor} />
                    </marker>
                )}
            </defs>
        </>
    );
};

export const ProcessFlowEdge = memo(ProcessFlowEdgeComponent);
