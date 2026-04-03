import React, { memo, useCallback, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from 'reactflow';
import { useYjsStore } from '../../../store/yjsStore';
import type { ProcessFlowEdge as ProcessFlowEdgeType } from '../../../types/processFlow';
import type { EdgeProps } from 'reactflow';

interface ProcessFlowEdgeProps extends EdgeProps {
    data?: ProcessFlowEdgeType;
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
    selected,
}) => {
    const yjsUpdateEdge = useYjsStore((s: any) => s.pfUpdateEdge);
    const [isEditing, setIsEditing] = useState(false);

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const handleLabelClick = useCallback(() => {
        setIsEditing(true);
    }, []);

    const handleArrowChange = useCallback((start: string, end: string) => {
        yjsUpdateEdge(id, {
            arrow: { start: start as any, end: end as any },
        });
        setIsEditing(false);
    }, [id, yjsUpdateEdge]);

    const handleColorChange = useCallback((color: string) => {
        yjsUpdateEdge(id, {
            style: { ...data?.style, stroke: color },
        });
    }, [id, data?.style, yjsUpdateEdge]);

    const currentArrow = data?.arrow || { start: 'none', end: 'arrow' };

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd="url(#arrowhead)"
                style={{
                    stroke: data?.style?.stroke ?? '#2563eb',
                    strokeWidth: data?.style?.strokeWidth ?? 2,
                }}
            />
            
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan"
                >
                    {isEditing ? (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2">
                            <div className="text-xs font-bold text-gray-700 mb-2">화살표 설정</div>
                            
                            <div className="space-y-1">
                                <div className="text-xs text-gray-600">시작 화살표</div>
                                <select
                                    value={currentArrow.start}
                                    onChange={(e) => handleArrowChange(e.target.value, currentArrow.end || 'arrow')}
                                    className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                                >
                                    <option value="none">없음</option>
                                    <option value="arrow">화살표</option>
                                </select>
                            </div>
                            
                            <div className="space-y-1">
                                <div className="text-xs text-gray-600">끝 화살표</div>
                                <select
                                    value={currentArrow.end}
                                    onChange={(e) => handleArrowChange(currentArrow.start || 'none', e.target.value)}
                                    className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                                >
                                    <option value="none">없음</option>
                                    <option value="arrow">화살표</option>
                                </select>
                            </div>
                            
                            <div className="space-y-1">
                                <div className="text-xs text-gray-600">선 색상</div>
                                <input
                                    type="color"
                                    value={data?.style?.stroke ?? '#2563eb'}
                                    onChange={(e) => handleColorChange(e.target.value)}
                                    className="w-full h-8 border border-gray-200 rounded cursor-pointer"
                                />
                            </div>
                            
                            <button
                                onClick={() => setIsEditing(false)}
                                className="w-full text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
                            >
                                닫기
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleLabelClick}
                            className={`px-2 py-1 text-xs bg-white border rounded-full shadow-sm hover:shadow-md transition-all ${
                                selected ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300'
                            }`}
                        >
                            방향 설정
                        </button>
                    )}
                </div>
            </EdgeLabelRenderer>

            {/* Arrow markers */}
            <defs>
                <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                >
                    <polygon
                        points="0 0, 10 3, 0 6"
                        fill={data?.style?.stroke ?? '#2563eb'}
                    />
                </marker>
            </defs>
        </>
    );
};

export const ProcessFlowEdge = memo(ProcessFlowEdgeComponent);
