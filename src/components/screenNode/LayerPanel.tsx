import React from 'react';
import { Layers, GripVertical, X, ChevronDown } from 'lucide-react';
import type { PanelPosition } from './types';

interface LayerPanelProps {
    show: boolean;
    isToolbarCollapsed: boolean;
    selectedElementIds: string[];
    layerPanelPos: PanelPosition;
    onClose: () => void;
    onDragStart: (e: React.MouseEvent, type: 'style' | 'layer') => void;
    onLayerAction: (action: 'front' | 'back' | 'forward' | 'backward') => void;
}

const LayerPanel: React.FC<LayerPanelProps> = ({
    show,
    isToolbarCollapsed,
    selectedElementIds,
    layerPanelPos,
    onClose,
    onDragStart,
    onLayerAction,
}) => {
    if (selectedElementIds.length === 0 || !show || isToolbarCollapsed) return null;

    return (
        <div
            className="nodrag floating-panel absolute z-[210] bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[240px] animate-in fade-in zoom-in"
            style={{
                left: layerPanelPos.x,
                top: layerPanelPos.y,
                transform: layerPanelPos.x === '50%' ? 'translateX(-50%)' : 'none'
            }}
        >
            <div
                className="flex items-center justify-between border-b border-gray-100 pb-2 mb-1 cursor-grab active:cursor-grabbing group/header"
                onMouseDown={(e) => onDragStart(e, 'layer')}
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
