import React from 'react';
import {
    type EdgeProps,
    getSmoothStepPath,
    EdgeLabelRenderer,
    BaseEdge,
} from 'reactflow';

const ScreenEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    label,
    style = {},
    markerEnd,
    interactionWidth,
    data,
}: EdgeProps) => {
    // Screen design's signature deep blue color
    const edgeColor = data?.color || '#2c3e7c';

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    ...style,
                    stroke: edgeColor,
                    strokeWidth: 2,
                    strokeOpacity: 0.8,
                }}
                interactionWidth={interactionWidth}
            />
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan group"
                >
                    {/* Relationship Type Label */}
                    <div
                        style={{
                            borderColor: `${edgeColor}33`,
                            color: edgeColor,
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        }}
                        className="px-3 py-1 backdrop-blur-sm border-2 rounded-lg shadow-sm text-[10px] font-black cursor-pointer hover:scale-105 transition-all duration-200"
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

                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 translate-y-1 group-hover:translate-y-0 z-50">
                        <div className="bg-gray-900/90 backdrop-blur-md text-white text-[10px] py-1.5 px-3 rounded-xl shadow-2xl whitespace-nowrap flex items-center gap-2 border border-white/10">
                            <span
                                className="w-1.5 h-1.5 rounded-full animate-pulse"
                                style={{ backgroundColor: edgeColor }}
                            />
                            관계 편집 (더블 클릭)
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-[5px] border-x-transparent border-t-[5px] border-t-gray-900/90" />
                        </div>
                    </div>
                </div>
            </EdgeLabelRenderer>
        </>
    );
};

export default ScreenEdge;
