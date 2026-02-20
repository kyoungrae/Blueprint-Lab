import React from 'react';
import { Palette, GripVertical, X } from 'lucide-react';
import type { DrawElement } from '../../types/screenDesign';
import type { PanelPosition } from './types';

interface StylePanelProps {
    show: boolean;
    isToolbarCollapsed: boolean;
    selectedElementIds: string[];
    drawElements: DrawElement[];
    stylePanelPos: PanelPosition;
    editingTableId: string | null;
    selectedCellIndices: number[];
    update: (updates: any) => void;
    syncUpdate: (updates: any) => void;
    onClose: () => void;
    onDragStart: (e: React.MouseEvent, type: 'style' | 'layer') => void;
}

const StylePanel: React.FC<StylePanelProps> = ({
    show,
    isToolbarCollapsed,
    selectedElementIds,
    drawElements,
    stylePanelPos,
    editingTableId,
    selectedCellIndices,
    update,
    syncUpdate,
    onClose,
    onDragStart,
}) => {
    if (selectedElementIds.length === 0 || !show || isToolbarCollapsed) return null;

    const selectedEl = drawElements.find(el => selectedElementIds.includes(el.id));
    const isTable = selectedEl?.type === 'table';
    const isTableCellMode = isTable && editingTableId === selectedEl?.id && selectedCellIndices.length > 0;

    // Helper: apply background color with table-aware logic
    const applyBgColor = (color: string) => {
        const nextElements = drawElements.map(el => {
            if (!selectedElementIds.includes(el.id)) return el;

            const isThisTable = el.type === 'table';
            if (isThisTable) {
                const rows = el.tableRows || 3;
                const cols = el.tableCols || 3;
                const totalCells = rows * cols;

                // If in cell-edit mode for THIS specific table, and cells are selected
                if (editingTableId === el.id && selectedCellIndices.length > 0) {
                    const newCellColors = [...(el.tableCellColors || Array(totalCells).fill(undefined))] as (string | undefined)[];
                    selectedCellIndices.forEach(idx => {
                        newCellColors[idx] = color;
                    });
                    return { ...el, tableCellColors: newCellColors };
                } else {
                    // Global table selection: Update fill AND clear/update all cell colors to match
                    // We fill tableCellColors to ensure it takes priority as intended, or we can just set fill.
                    // Let's set both for maximum compatibility with current rendering logic.
                    const newCellColors = Array(totalCells).fill(color) as (string | undefined)[];
                    return { ...el, fill: color, tableCellColors: newCellColors };
                }
            } else {
                // Non-table element
                return { ...el, fill: color };
            }
        });

        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
    };

    // Get current background color display value
    const getCurrentBgColor = (): string => {
        if (isTable && selectedEl) {
            if (isTableCellMode) {
                return selectedEl.tableCellColors?.[selectedCellIndices[0]] || '#ffffff';
            }
            // Show fill or first cell color
            return selectedEl.fill || '#ffffff';
        }
        return selectedEl?.fill || '#ffffff';
    };

    const currentBgColor = getCurrentBgColor();

    return (
        <div
            className="nodrag floating-panel absolute z-[210] bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[240px] animate-in fade-in zoom-in"
            style={{
                left: stylePanelPos.x,
                top: stylePanelPos.y,
                transform: stylePanelPos.x === '50%' ? 'translateX(-50%)' : 'none'
            }}
        >
            <div
                className="flex items-center justify-between border-b border-gray-100 pb-2 mb-1 cursor-grab active:cursor-grabbing group/header"
                onMouseDown={(e) => onDragStart(e, 'style')}
                title="드래그하여 이동"
            >
                <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                    <Palette size={14} className="text-[#2c3e7c]" />
                    <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">스타일 편집 ({selectedElementIds.length})</span>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={14} />
                </button>
            </div>

            {/* Background Color */}
            <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-gray-600 font-medium">배경색</span>
                        {isTableCellMode && (
                            <span className="text-[9px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded-full">
                                {selectedCellIndices.length}개 셀
                            </span>
                        )}
                        {isTable && !isTableCellMode && (
                            <span className="text-[9px] text-purple-600 font-medium bg-purple-50 px-1.5 py-0.5 rounded-full">
                                전체
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 font-mono uppercase">{currentBgColor}</span>
                        <div className="relative w-6 h-6 rounded-lg border border-gray-200 overflow-hidden shadow-sm hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer">
                            <input
                                type="color"
                                value={currentBgColor}
                                onChange={(e) => applyBgColor(e.target.value)}
                                className="absolute -inset-1 w-[150%] h-[150%] cursor-pointer p-0 border-none bg-transparent"
                            />
                        </div>
                    </div>
                </div>
                <div className="flex gap-1.5 justify-end">
                    {['#ffffff', '#f1f5f9', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#2c3e7c'].map(color => (
                        <button
                            key={color}
                            onClick={() => applyBgColor(color)}
                            className={`w-3.5 h-3.5 rounded-full border border-gray-200 transition-transform hover:scale-110`}
                            style={{ backgroundColor: color }}
                        />
                    ))}
                </div>
            </div>

            {/* Stroke Color */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                <div className="flex justify-between items-center">
                    <span className="text-[11px] text-gray-600 font-medium">테두리색</span>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 font-mono uppercase">{drawElements.find(el => selectedElementIds.includes(el.id))?.stroke || '#000000'}</span>
                        <div className="relative w-6 h-6 rounded-lg border border-gray-200 overflow-hidden shadow-sm hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer">
                            <input
                                type="color"
                                value={drawElements.find(el => selectedElementIds.includes(el.id))?.stroke || '#000000'}
                                onChange={(e) => {
                                    const color = e.target.value;
                                    const nextElements = drawElements.map(el =>
                                        selectedElementIds.includes(el.id) ? { ...el, stroke: color } : el
                                    );
                                    update({ drawElements: nextElements });
                                    syncUpdate({ drawElements: nextElements });
                                }}
                                className="absolute -inset-1 w-[150%] h-[150%] cursor-pointer p-0 border-none bg-transparent"
                            />
                        </div>
                    </div>
                </div>
                <div className="flex gap-1.5 justify-end">
                    {['#000000', '#2c3e7c', '#64748b', 'transparent'].map(color => (
                        <button
                            key={color}
                            onClick={() => {
                                const nextElements = drawElements.map(el =>
                                    selectedElementIds.includes(el.id) ? { ...el, stroke: color } : el
                                );
                                update({ drawElements: nextElements });
                                syncUpdate({ drawElements: nextElements });
                            }}
                            className={`w-3.5 h-3.5 rounded-full border border-gray-200 transition-transform hover:scale-110 flex items-center justify-center overflow-hidden`}
                            style={{ backgroundColor: color === 'transparent' ? 'white' : color }}
                        >
                            {color === 'transparent' && <div className="w-full h-[1px] bg-red-400 rotate-45" />}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stroke Width */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                <div className="flex justify-between items-center">
                    <span className="text-[11px] text-gray-600 font-medium">테두리 굵기</span>
                    <span className="text-[10px] text-blue-600 font-bold">
                        {drawElements.find(el => el.id === selectedElementIds[0])?.strokeWidth ?? 2}px
                    </span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={drawElements.find(el => el.id === selectedElementIds[0])?.strokeWidth ?? 2}
                    onChange={(e) => {
                        const val = parseInt(e.target.value);
                        const nextElements = drawElements.map(el =>
                            selectedElementIds.includes(el.id) ? { ...el, strokeWidth: val } : el
                        );
                        update({ drawElements: nextElements });
                        syncUpdate({ drawElements: nextElements });
                    }}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2c3e7c]"
                />
            </div>

            {/* Border Radius */}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                <div className="flex justify-between items-center">
                    <span className="text-[11px] text-gray-600 font-medium">테두리 곡률</span>
                    <span className="text-[10px] text-blue-600 font-bold">
                        {drawElements.find(el => el.id === selectedElementIds[0])?.borderRadius ?? 0}px
                    </span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={drawElements.find(el => el.id === selectedElementIds[0])?.borderRadius ?? 0}
                    onChange={(e) => {
                        const val = parseInt(e.target.value);
                        const nextElements = drawElements.map(el =>
                            selectedElementIds.includes(el.id) ? { ...el, borderRadius: val } : el
                        );
                        update({ drawElements: nextElements });
                        syncUpdate({ drawElements: nextElements });
                    }}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2c3e7c]"
                />
            </div>
            {/* Opacity Sliders */}
            <div className="flex flex-col gap-3 pt-2 border-t border-gray-100">
                {/* Fill Opacity */}
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                        <span className="text-[11px] text-gray-600 font-medium">배경 투명도</span>
                        <span className="text-[10px] text-blue-600 font-bold">
                            {Math.round((drawElements.find(el => el.id === selectedElementIds[0])?.fillOpacity ?? 1) * 100)}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={Math.round((drawElements.find(el => el.id === selectedElementIds[0])?.fillOpacity ?? 1) * 100)}
                        onChange={(e) => {
                            const val = parseInt(e.target.value) / 100;
                            const nextElements = drawElements.map(el =>
                                selectedElementIds.includes(el.id) ? { ...el, fillOpacity: val } : el
                            );
                            update({ drawElements: nextElements });
                            syncUpdate({ drawElements: nextElements });
                        }}
                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2c3e7c]"
                    />
                </div>

                {/* Stroke Opacity */}
                <div className="flex flex-col gap-1.5 pb-2">
                    <div className="flex justify-between items-center">
                        <span className="text-[11px] text-gray-600 font-medium">테두리 투명도</span>
                        <span className="text-[10px] text-blue-600 font-bold">
                            {Math.round((drawElements.find(el => el.id === selectedElementIds[0])?.strokeOpacity ?? 1) * 100)}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={Math.round((drawElements.find(el => el.id === selectedElementIds[0])?.strokeOpacity ?? 1) * 100)}
                        onChange={(e) => {
                            const val = parseInt(e.target.value) / 100;
                            const nextElements = drawElements.map(el =>
                                selectedElementIds.includes(el.id) ? { ...el, strokeOpacity: val } : el
                            );
                            update({ drawElements: nextElements });
                            syncUpdate({ drawElements: nextElements });
                        }}
                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2c3e7c]"
                    />
                </div>
            </div>
        </div>
    );
};

export default StylePanel;
