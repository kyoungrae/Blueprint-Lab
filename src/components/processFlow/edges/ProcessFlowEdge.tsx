import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position } from 'reactflow';
import { useStore as useRFStore } from 'reactflow';
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

/** 중앙 핸들·패널: body 포탈. 앱 사이드바·상단 툴바(z~10001)보다 낮게 유지 */
const PF_EDGE_HANDLE_Z = 9990;
const PF_EDGE_PANEL_Z = 9995;

/** 호버 전·후 레이아웃 점프 방지(깜빡임) + 앵커 Y 계산에 사용 */
const PF_EDGE_HANDLE_HIT_PX = 18;
const ZOOM_OUT_TO_LITE = 0.3;
const ZOOM_IN_TO_FULL = 0.38;
const rfZoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

/** 핸들(HTML)이 노드 레이어에서 SVG 위에 그려져 마커 끝이 가려지지 않도록, 화살표가 있을 때만 끝점을 핸들 바깥(연결선 쪽)으로 당김 */
const outwardFromHandle: Record<Position, { x: number; y: number }> = {
    [Position.Top]: { x: 0, y: -1 },
    [Position.Bottom]: { x: 0, y: 1 },
    [Position.Left]: { x: -1, y: 0 },
    [Position.Right]: { x: 1, y: 0 },
};

/** 연결선 의미별 프리셋 (조회 파랑 = 신규 연결 기본 #2563eb) */
const LINE_COLOR_PRESETS = [
    { label: '조회', hint: 'Select', color: '#2563eb' },
    { label: '수정', hint: 'Update', color: '#ea580c' },
    { label: '등록', hint: 'Insert', color: '#16a34a' },
    { label: '삭제', hint: 'Delete', color: '#dc2626' },
    { label: 'true', hint: 'True', color: '#ffd04b' },
    { label: 'false', hint: 'False', color: '#9ca4a1' },
    { label: '등록/수정', hint: 'Insert/Update', color: '#a33894' },
    { label: '조회/등록/수정', hint: 'Select/Insert/Update', color: '#eba2e0' },
    { label: '등록/수정/삭제', hint: 'Insert/Update/Delete', color: '#872feb' },
] as const;

function edgeKindLabelFromStroke(color: string): string {
    const c = color.trim().toLowerCase();
    const preset = LINE_COLOR_PRESETS.find((p) => p.color.toLowerCase() === c);
    return preset ? preset.label : '기타';
}

const ProcessFlowEdgeComponent: React.FC<ProcessFlowEdgeProps> = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
}) => {
    const rfZoom = useRFStore(rfZoomSelector);
    const modeRef = useRef<'lite' | 'full' | null>(null);
    if (modeRef.current === null) {
        modeRef.current = rfZoom < ZOOM_OUT_TO_LITE ? 'lite' : 'full';
    }
    let mode = modeRef.current;
    if (mode === 'full' && rfZoom < ZOOM_OUT_TO_LITE) {
        mode = 'lite';
    } else if (mode === 'lite' && rfZoom > ZOOM_IN_TO_FULL) {
        mode = 'full';
    }
    modeRef.current = mode;
    const isLite = mode === 'lite';

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
    useEffect(() => {
        if (isLite && isEditing) setIsEditing(false);
    }, [isLite, isEditing]);

    const trySetHandleHovered = useCallback((next: boolean) => {
        if (next && Date.now() < handleHoverSuppressUntilRef.current) return;
        setIsHovered(next);
    }, []);

    const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearHoverLeaveTimer = useCallback(() => {
        if (hoverLeaveTimerRef.current != null) {
            clearTimeout(hoverLeaveTimerRef.current);
            hoverLeaveTimerRef.current = null;
        }
    }, []);

    useEffect(() => () => clearHoverLeaveTimer(), [clearHoverLeaveTimer]);

    const onEdgeControlEnter = useCallback(() => {
        clearHoverLeaveTimer();
        trySetHandleHovered(true);
    }, [clearHoverLeaveTimer, trySetHandleHovered]);

    const onEdgeControlLeave = useCallback(() => {
        clearHoverLeaveTimer();
        hoverLeaveTimerRef.current = setTimeout(() => {
            hoverLeaveTimerRef.current = null;
            trySetHandleHovered(false);
        }, 90);
    }, [clearHoverLeaveTimer, trySetHandleHovered]);

    const handleOpenEdgePanel = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        e?.preventDefault();
        clearHoverLeaveTimer();
        setIsHovered(false);
        setIsEditing(true);
    }, [clearHoverLeaveTimer]);

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

    const edgeKindLabel = (data?.kindText ?? '').trim() || edgeKindLabelFromStroke(edgeColor);

    const mkId = (suffix: string) => `pf-arrow-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}-${suffix}`;

    /** 버튼 중심을 (labelX, labelY)에 고정. 높이를 PF_EDGE_HANDLE_HIT_PX로 통일해 호버 시에도 앵커가 흔들리지 않음 */
    const edgeUiBaseStyle = {
        position: 'absolute' as const,
        left: 0,
        top: 0,
        transform: `translate(${labelX}px, ${labelY - PF_EDGE_HANDLE_HIT_PX / 2}px) translate(-50%, 0)`,
        transformOrigin: 'top center' as const,
        zIndex: PF_EDGE_HANDLE_Z,
        pointerEvents: 'none' as const,
    };

    const edgeLabels =
        !isLite && !isEditing ? (
            <EdgeLabelRenderer>
                <div className="nodrag nopan" style={edgeUiBaseStyle}>
                    <div
                        className="nodrag nopan pointer-events-auto flex flex-col items-center justify-center"
                        onMouseEnter={onEdgeControlEnter}
                        onMouseLeave={onEdgeControlLeave}
                    >
                        <PremiumTooltip
                            label="더블클릭 — 연결 방향·색상 설정"
                            dotColor={edgeColor}
                            placement="top"
                            forceBodyPortal
                            bodyZIndexExact
                            zIndex={PF_EDGE_HANDLE_Z + 1}
                        >
                            <button
                                type="button"
                                title="연결 설정 (더블 클릭)"
                                aria-label="연결선 설정 열기"
                                className="nodrag nopan flex items-center justify-center gap-1.5 rounded-md border-0 px-2 py-1 backdrop-blur-sm bg-white/95 transition-[box-shadow,background-color] duration-200 ease-out select-none outline-none focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-blue-400/60"
                                style={{
                                    boxShadow: isHovered
                                        ? `0 0 0 1px ${edgeColor}aa, 0 1px 2px rgba(15,23,42,0.05)`
                                        : `0 0 0 1px ${edgeColor}99`,
                                    color: edgeColor,
                                    backgroundColor: isHovered ? `${edgeColor}12` : 'rgba(255, 255, 255, 0.98)',
                                }}
                                onDoubleClick={handleOpenEdgePanel}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ backgroundColor: edgeColor }} aria-hidden />
                                <span className="text-[11px] font-semibold leading-none whitespace-nowrap tracking-tight">{edgeKindLabel}</span>
                            </button>
                        </PremiumTooltip>
                    </div>
                </div>
            </EdgeLabelRenderer>
        ) : null;

    const editPanel = !isLite && isEditing ? (
        <EdgeLabelRenderer>
            <div
                className="nodrag nopan pointer-events-auto"
                style={{
                    position: 'absolute',
                    transform: `translate(${labelX}px, ${labelY}px) translate(-50%, calc(-100% - 8px))`,
                    transformOrigin: 'center bottom',
                    zIndex: PF_EDGE_PANEL_Z,
                }}
                onPointerDown={(e) => e.stopPropagation()}
            >
            <div className="flex w-[15.5rem] flex-col items-center animate-in fade-in duration-200 ease-out origin-bottom">
                <div className="relative w-full rounded-xl border border-gray-200/90 bg-white/95 shadow-md shadow-black/[0.05] backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-gray-100/90 px-3 py-2">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            연결 방향 설정
                        </h3>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="rounded-lg p-1 transition-colors hover:bg-gray-100"
                        >
                            <X size={14} className="text-gray-500" />
                        </button>
                    </div>

                    <div className="space-y-3 px-3 pb-2 pt-3">
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
                                className="nodrag nopan mb-px flex h-[30px] w-7 shrink-0 flex-col items-center justify-center gap-0 rounded-md border border-gray-200 bg-gray-50/90 text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-95"
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
                                    value={/^#[0-9A-Fa-f]{6}$/.test(edgeColor) ? edgeColor : '#2563eb'}
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
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">선 종류</label>
                            <input
                                type="text"
                                value={(data?.kindText ?? '').toString()}
                                onChange={(e) => {
                                    yjsUpdateEdge(id, { kindText: e.target.value });
                                }}
                                placeholder="예: 조회, 수정, 등록..."
                                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-gray-600">의미별 색</label>
                            <div className="flex flex-wrap gap-1.5">
                                {LINE_COLOR_PRESETS.map((p) => {
                                    const active = edgeColor.toLowerCase() === p.color.toLowerCase();
                                    return (
                                        <button
                                            key={p.hint}
                                            type="button"
                                            onClick={() => handleColorChange(p.color)}
                                            className="nodrag nopan inline-flex shrink-0 max-w-full items-center justify-center rounded-md border border-solid bg-white px-2 py-1 text-[10px] font-semibold leading-none tracking-tight whitespace-nowrap transition-colors hover:bg-gray-50/90 active:scale-[0.97]"
                                            style={{
                                                borderColor: p.color,
                                                color: p.color,
                                                backgroundColor: active ? `${p.color}1a` : '#ffffff',
                                            }}
                                            title={`${p.label} (${p.hint})`}
                                        >
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-1.5 border-t border-gray-100/90 px-3 py-2">
                        <button
                            type="button"
                            onClick={() => {
                                if (window.confirm('이 연결선을 삭제하시겠습니까?')) {
                                    yjsDeleteEdge(id);
                                    setIsEditing(false);
                                }
                            }}
                            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-red-500 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-red-600"
                        >
                            <Trash2 size={11} />
                            삭제
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="flex-1 rounded-md bg-gray-100 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-200"
                        >
                            확인
                        </button>
                    </div>
                </div>
                <div className="pointer-events-none relative -mt-px flex h-[12px] w-full shrink-0 justify-center" aria-hidden>
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 border-x-[11px] border-x-transparent border-t-[12px] border-t-gray-200/95" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-px border-x-[10px] border-x-transparent border-t-[11px] border-t-[rgba(255,255,255,0.96)]" />
                </div>
            </div>
            </div>
        </EdgeLabelRenderer>
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

            {edgeLabels}
            {editPanel}

            <defs>
                {showEndArrow && (
                    <marker
                        id={mkId('end')}
                        viewBox="-2 -2 16 16"
                        refX="0"
                        refY="6"
                        markerWidth="12"
                        markerHeight="12"
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
                        refX="0"
                        refY="6"
                        markerWidth="12"
                        markerHeight="12"
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
