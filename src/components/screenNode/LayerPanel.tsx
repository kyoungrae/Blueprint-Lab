import React, { useRef } from 'react';
import { Layers, GripVertical, X, ChevronDown } from 'lucide-react';
import { useStore } from 'reactflow';

interface LayerPanelProps {
    show: boolean;
    selectedElementIds: string[];
    layerPanelPos: { x: number; y: number };
    onPositionChange: (pos: { x: number; y: number }) => void;
    zoom: number | string;
    screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
    flowToScreenPosition: (pos: { x: number; y: number }) => { x: number; y: number };
    onClose: () => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onLayerAction: (action: 'front' | 'back' | 'forward' | 'backward') => void;
}

const LayerPanel: React.FC<LayerPanelProps> = ({
    show,
    selectedElementIds,
    layerPanelPos,
    onPositionChange,
    zoom,
    screenToFlowPosition,
    flowToScreenPosition,
    onClose,
    onDragStart,
    onDragEnd,
    onLayerAction,
}) => {
    const isDraggingRef = useRef(false);
    // Force re-render on viewport transformation to keep position in sync
    useStore(s => s.transform);

    if (selectedElementIds.length === 0 || !show) return null;

    const handleHeaderMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingRef.current = true;
        onDragStart?.();
        const flowAtClick = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const offsetFlowX = flowAtClick.x - layerPanelPos.x;
        const offsetFlowY = flowAtClick.y - layerPanelPos.y;
        const onMove = (me: MouseEvent) => {
            if (!isDraggingRef.current) return;
            me.stopImmediatePropagation();
            const flowAtMove = screenToFlowPosition({ x: me.clientX, y: me.clientY });
            onPositionChange({ x: flowAtMove.x - offsetFlowX, y: flowAtMove.y - offsetFlowY });
        };
        const onUp = () => {
            isDraggingRef.current = false;
            onDragEnd?.();
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div
            data-layer-panel
            className="nodrag floating-panel fixed z-[9000] bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[240px] animate-in fade-in zoom-in origin-top-left"
            style={{
                left: flowToScreenPosition({ x: layerPanelPos.x, y: layerPanelPos.y }).x,
                top: flowToScreenPosition({ x: layerPanelPos.x, y: layerPanelPos.y }).y,
                transform: `scale(calc(0.85 * ${zoom}))`,
            }}
        >
            <div
                className="flex items-center justify-between border-b border-gray-100 pb-2 mb-1 cursor-grab active:cursor-grabbing group/header"
                onMouseDown={handleHeaderMouseDown}
                title="드래그하여 이동"
            >
                <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                    <Layers size={14} className="text-[#2c3e7c]" />
                    <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">레이어 순서 변경 ({selectedElementIds.length})</span>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={14} />
                </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={() => onLayerAction('front')}
                    className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-xl transition-all group"
                >
                    <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center group-hover:text-blue-600 transition-colors">
                        <ChevronDown size={18} className="rotate-180 scale-y-150" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-600">맨 앞으로</span>
                </button>
                <button
                    onClick={() => onLayerAction('forward')}
                    className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-xl transition-all group"
                >
                    <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center group-hover:text-blue-600 transition-colors">
                        <ChevronDown size={18} className="rotate-180" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-600">한 단계 위로</span>
                </button>
                <button
                    onClick={() => onLayerAction('backward')}
                    className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-xl transition-all group"
                >
                    <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center group-hover:text-blue-600 transition-colors">
                        <ChevronDown size={18} />
                    </div>
                    <span className="text-[10px] font-bold text-gray-600">한 단계 아래로</span>
                </button>
                <button
                    onClick={() => onLayerAction('back')}
                    className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-xl transition-all group"
                >
                    <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center group-hover:text-blue-600 transition-colors">
                        <ChevronDown size={18} className="scale-y-150" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-600">맨 뒤로</span>
                </button>
            </div>
        </div>
    );
};

export default LayerPanel;
