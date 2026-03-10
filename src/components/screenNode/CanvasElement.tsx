import React, { memo } from 'react';
import type { DrawElement } from '../../types/screenDesign';
import ShapeElement from './ShapeElement';
import DrawTextComponent from './DrawTextComponent';
import ImageElement from './ImageElement';
import TableElement from './TableElement';
import { hexToRgba } from './types';
import { X } from 'lucide-react';
import { useDragStore } from '../../store/dragStore';

interface CanvasElementProps {
    el: DrawElement;
    isSelected: boolean;
    isLocked: boolean;
    activeTool: string;
    isDrawing: boolean;
    isMoving: boolean;
    isUnifiedGroupSelection: boolean;
    selectedElementIds: string[];
    editingTextId: string | null;
    editingTableId: string | null;
    editingCellIndex: number | null;
    selectedCellIndices: number[];
    tableCellSelectionRestoreRef: React.MutableRefObject<{ tableId: string; cellIndex: number; } | null>;
    setEditingTableId: (id: string | null) => void;
    setEditingCellIndex: (index: number | null) => void;
    setSelectedCellIndices: (indices: number[]) => void;
    setTextSelectionRect: (rect: DOMRect | null) => void;
    setTextSelectionFromTable: (val: { tableId: string; cellIndex: number; } | null) => void;
    syncUpdate: (updates: any) => void;
    updateElement: (id: string, updates: any) => void;
    update: (updates: any) => void;
    saveHistory: (elements: DrawElement[]) => void;
    setSelectedElementIds: (ids: string[]) => void;
    getDrawElements: () => DrawElement[];
    isDraggingCellSelectionRef: React.MutableRefObject<boolean>;
    dragStartCellIndexRef: React.MutableRefObject<number>;
    handleElementMouseDown: (id: string, e: React.MouseEvent) => void;
    handleElementDoubleClick: (id: string, e: React.MouseEvent) => void;
    handleElementTextSelectionChange: (rect: DOMRect | null) => void;
    handleLineVertexDragStart: (elId: string, vIdx: 0 | 1, e: React.MouseEvent) => void;
    handleElementResizeStart: (elId: string, dir: string, e: React.MouseEvent) => void;
    handlePolygonVertexDragStart: (elId: string, vIdx: number, e: React.MouseEvent) => void;
    deleteElements: (ids: string[]) => void;
    currentProjectId?: string | null;
    imageCropMode: boolean;
    flushPendingSync: () => void;
}

function areCanvasElementPropsEqual(prev: CanvasElementProps, next: CanvasElementProps): boolean {
    // 요소 자체가 변경됐는지 (레퍼런스 비교 - updateElement가 변경 시 새 객체 생성)
    if (prev.el !== next.el) return false;

    // 선택 상태 변경
    if (prev.isSelected !== next.isSelected) return false;

    // 선택 상태 변경
    if (prev.isSelected !== next.isSelected) return false;

    // 편집 중인 텍스트/테이블 (이 요소와 관련된 경우만)
    const elId = prev.el.id;
    const prevEditingThis = prev.editingTextId === elId || prev.editingTableId === elId;
    const nextEditingThis = next.editingTextId === elId || next.editingTableId === elId;
    if (prevEditingThis !== nextEditingThis) return false;

    // 테이블 편집 세부 상태 (이 요소가 테이블이고 편집 중일 때만)
    if (prev.editingTableId === elId || next.editingTableId === elId) {
        if (prev.editingCellIndex !== next.editingCellIndex) return false;
        if (prev.selectedCellIndices !== next.selectedCellIndices) return false;
    }

    // 이미지 crop 모드 (이 요소가 이미지일 때만)
    if (prev.el.type === 'image') {
        if (prev.imageCropMode !== next.imageCropMode) return false;
    }

    // 드로잉/이동 상태 (cursor, transition에 영향)
    if (prev.isDrawing !== next.isDrawing) return false;
    if (prev.isMoving !== next.isMoving) return false;
    if (prev.activeTool !== next.activeTool) return false;

    // 그룹 선택 상태 (이 요소가 그룹의 일부일 때만)
    if (prev.isUnifiedGroupSelection !== next.isUnifiedGroupSelection) return false;
    if (prev.isLocked !== next.isLocked) return false;

    // 함수 props는 ScreenNode에서 useCallback으로 안정화되어 있으므로 레퍼런스 비교
    if (prev.handleElementMouseDown !== next.handleElementMouseDown) return false;
    if (prev.handleElementDoubleClick !== next.handleElementDoubleClick) return false;
    if (prev.updateElement !== next.updateElement) return false;
    if (prev.deleteElements !== next.deleteElements) return false;

    return true;
}

const CanvasElement: React.FC<CanvasElementProps> = memo(({
    el,
    isSelected,
    isLocked,
    activeTool,
    isDrawing,
    isMoving,
    isUnifiedGroupSelection,
    selectedElementIds,
    editingTextId,
    editingTableId,
    editingCellIndex,
    selectedCellIndices,
    tableCellSelectionRestoreRef,
    setEditingTableId,
    setEditingCellIndex,
    setSelectedCellIndices,
    setTextSelectionRect,
    setTextSelectionFromTable,
    syncUpdate,
    updateElement,
    update,
    saveHistory,
    setSelectedElementIds,
    getDrawElements,
    isDraggingCellSelectionRef,
    dragStartCellIndexRef,
    handleElementMouseDown,
    handleElementDoubleClick,
    handleElementTextSelectionChange,
    handleLineVertexDragStart,
    handleElementResizeStart,
    handlePolygonVertexDragStart,
    deleteElements,
    currentProjectId,
    imageCropMode,
    flushPendingSync,
}) => {
    // 드래그 미리보기 위치를 스토어에서 직접 구독 (자기 자신것만)
    const previewPos = useDragStore(state => state.previews?.[el.id]);

    const rot = el.type === 'image' ? (el.imageRotation ?? 0) : (el.rotation ?? 0);
    const drawElements = getDrawElements();

    const commonStyle: React.CSSProperties = {
        position: 'absolute',
        left: previewPos?.x ?? el.x,
        top: previewPos?.y ?? el.y,
        width: el.width,
        height: el.height,
        zIndex: el.zIndex ?? 1,
        transition: (isDrawing || isMoving) ? 'none' : 'all 0.1s ease',
        pointerEvents: isDrawing ? 'none' : 'auto',
        opacity: el.opacity !== undefined ? el.opacity : 1,
        ...(rot !== 0 ? { transform: `rotate(${rot}deg)`, transformOrigin: 'center center' } : {}),
        ...(el.type === 'polygon' || el.type === 'line' ? { overflow: 'visible' as const } : {}),
    };

    return (
        <div
            style={commonStyle}
            onMouseDown={(e) => handleElementMouseDown(el.id, e)}
            onDoubleClick={(e) => handleElementDoubleClick(el.id, e)}
            className={`group-canvas-element nodrag nopan ${isSelected && !(isUnifiedGroupSelection && selectedElementIds.length > 1) ? (el.fromComponentId ? 'ring-2 ring-violet-500 ring-offset-2' : 'ring-2 ring-offset-2') : ''} ${!isLocked && activeTool === 'select' ? 'cursor-grab' : ''} ${!isSelected && !isLocked && activeTool === 'select' ? 'hover:shadow-[0_0_0_2px_rgba(250,204,21,0.35)]' : ''}`}
            data-element-id={el.id}
        >
            {(el.type === 'rect' || el.type === 'circle') && (
                <ShapeElement
                    el={el}
                    isSelected={isSelected}
                    isLocked={isLocked}
                    editingTextId={editingTextId}
                    updateElement={updateElement}
                    onSelectionChange={setTextSelectionRect}
                />
            )}
            {el.type === 'polygon' && (() => {
                const pts = (el.polygonPoints ?? []).map(p => ({ x: p.x - el.x, y: p.y - el.y }));
                const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
                const strokeW = el.strokeWidth ?? 2;
                return (
                    <div className="w-full h-full relative overflow-visible" style={{ pointerEvents: 'none' }}>
                        <svg width="100%" height="100%" viewBox={`0 0 ${el.width || 1} ${el.height || 1}`} preserveAspectRatio="none" className="absolute inset-0" style={{ overflow: 'visible' }}>
                            <polygon
                                points={pointsStr}
                                fill={hexToRgba(el.fill || '#ffffff', el.fillOpacity ?? 1)}
                                stroke={hexToRgba(el.stroke || '#2c3e7c', el.strokeOpacity ?? 1)}
                                strokeWidth={strokeW}
                                strokeDasharray={el.strokeStyle === 'dashed' ? '4 2' : el.strokeStyle === 'dotted' ? '1 2' : undefined}
                            />
                        </svg>
                    </div>
                );
            })()}
            {el.type === 'line' && (() => {
                let x1 = (el.lineX1 ?? el.x) - el.x;
                let y1 = (el.lineY1 ?? el.y) - el.y;
                let x2 = (el.lineX2 ?? el.x + el.width) - el.x;
                let y2 = (el.lineY2 ?? el.y + el.height) - el.y;
                const end = el.lineEnd ?? 'none';
                const hasStart = end === 'start' || end === 'both';
                const hasEnd = end === 'end' || end === 'both';
                const arrowSize = 8;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                if (hasStart && len > arrowSize) {
                    x1 += ux * arrowSize;
                    y1 += uy * arrowSize;
                }
                if (hasEnd && len > arrowSize) {
                    x2 -= ux * arrowSize;
                    y2 -= uy * arrowSize;
                }
                const strokeW = el.strokeWidth ?? 2;
                const strokeColor = hexToRgba(el.stroke || '#2c3e7c', el.strokeOpacity ?? 1);
                const dash = el.strokeStyle === 'dashed' ? '4 2' : el.strokeStyle === 'dotted' ? '1 2' : undefined;
                const idStart = `line-arrow-start-${el.id}`;
                const idEnd = `line-arrow-end-${el.id}`;
                const markerStart = hasStart ? `url(#${idStart})` : undefined;
                const markerEnd = hasEnd ? `url(#${idEnd})` : undefined;
                return (
                    <div className="w-full h-full relative overflow-visible" style={{ pointerEvents: 'none' }}>
                        <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(el.width || 1, 1)} ${Math.max(el.height || 1, 1)}`} preserveAspectRatio="none" className="absolute inset-0" style={{ overflow: 'visible' }}>
                            <defs>
                                <marker id={idStart} markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
                                    <path d="M 0 4 L 8 0 L 8 8 Z" fill={strokeColor} />
                                </marker>
                                <marker id={idEnd} markerWidth="8" markerHeight="8" refX="0" refY="4" orient="auto">
                                    <path d="M 0 0 L 8 4 L 0 8 Z" fill={strokeColor} />
                                </marker>
                            </defs>
                            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeColor} strokeWidth={strokeW} strokeDasharray={dash} markerStart={markerStart} markerEnd={markerEnd} />
                        </svg>
                    </div>
                );
            })()}
            {el.type === 'text' && (
                <DrawTextComponent
                    element={el}
                    isLocked={isLocked}
                    isSelected={isSelected}
                    onUpdate={(updates) => updateElement(el.id, updates)}
                    onSelectionChange={handleElementTextSelectionChange}
                    autoFocus={editingTextId === el.id}
                />
            )}
            {el.type === 'image' && (
                <ImageElement
                    element={el}
                    isSelected={isSelected}
                    isLocked={isLocked}
                    onUpdate={(updates) => updateElement(el.id, updates)}
                    projectId={currentProjectId ?? undefined}
                    isCropMode={imageCropMode && selectedElementIds.includes(el.id)}
                />
            )}
            {el.type === 'table' && (
                <TableElement
                    el={el}
                    isLocked={isLocked}
                    isSelected={isSelected}
                    editingTableId={editingTableId}
                    editingCellIndex={editingCellIndex}
                    selectedCellIndices={selectedCellIndices}
                    tableCellSelectionRestoreRef={tableCellSelectionRestoreRef}
                    setEditingTableId={setEditingTableId}
                    setEditingCellIndex={setEditingCellIndex}
                    setSelectedCellIndices={setSelectedCellIndices}
                    setTextSelectionRect={setTextSelectionRect}
                    setTextSelectionFromTable={setTextSelectionFromTable}
                    syncUpdate={syncUpdate}
                    updateElement={updateElement}
                    getDrawElements={getDrawElements}
                    isDraggingCellSelectionRef={isDraggingCellSelectionRef}
                    dragStartCellIndexRef={dragStartCellIndexRef}
                    flushPendingSync={flushPendingSync}
                />
            )}
            {el.type === 'func-no' && (
                <div
                    className="w-full h-full rounded-full flex items-center justify-center font-bold text-white select-none group/func"
                    style={{
                        backgroundColor: el.fill || '#ef4444',
                        fontSize: el.fontSize || 12,
                        border: `${el.strokeWidth || 2}px solid ${el.stroke || '#ffffff'}`,
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                    }}
                >
                    <span
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            height: '100%',
                            lineHeight: 1,
                            textAlign: 'center',
                        }}
                    >
                        {el.text}
                    </span>
                    {!isLocked && (
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover/func:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-xl border border-gray-200 z-[120]">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const current = el.text || '1';
                                    let nextText = '';
                                    if (current.includes('-')) {
                                        const parts = current.split('-');
                                        nextText = `${parts[0]}-${parseInt(parts[1]) + 1}`;
                                    } else {
                                        nextText = `${current}-1`;
                                    }
                                    const newId = `draw_${Date.now()}`;
                                    const newElement: DrawElement = {
                                        ...el,
                                        id: newId,
                                        text: nextText,
                                        x: el.x + 30,
                                        y: el.y + 30,
                                        zIndex: drawElements.length + 1,
                                        description: ''
                                    };
                                    const nextElements = [...drawElements, newElement];
                                    update({ drawElements: nextElements });
                                    syncUpdate({ drawElements: nextElements });
                                    saveHistory(nextElements);
                                    setSelectedElementIds([newId]);
                                }}
                                className="px-1.5 py-0.5 bg-blue-500 text-white text-[9px] rounded hover:bg-blue-600 whitespace-nowrap"
                                title="새 하위 번호 객체 생성"
                            >
                                + 하위
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const current = el.text || '1';
                                    const nextText = (parseInt(current.split('-')[0]) + 1).toString();
                                    const newId = `draw_${Date.now()}`;
                                    const newElement: DrawElement = {
                                        ...el,
                                        id: newId,
                                        text: nextText,
                                        x: el.x + 30,
                                        y: el.y + 30,
                                        zIndex: drawElements.length + 1,
                                        description: ''
                                    };
                                    const nextElements = [...drawElements, newElement];
                                    update({ drawElements: nextElements });
                                    syncUpdate({ drawElements: nextElements });
                                    saveHistory(nextElements);
                                    setSelectedElementIds([newId]);
                                }}
                                className="px-1.5 py-0.5 bg-gray-500 text-white text-[9px] rounded hover:bg-gray-600 whitespace-nowrap"
                                title="새 다음 번호 객체 생성"
                            >
                                다음 번호
                            </button>
                        </div>
                    )}
                </div>
            )}

            {isSelected && !isLocked && selectedElementIds.length === 1 && !isUnifiedGroupSelection && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        deleteElements([el.id]);
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 border-2 border-white scale-0 group-canvas-element-hover:scale-100 transition-transform z-[110]"
                >
                    <X size={12} />
                </button>
            )}

            {isSelected && !isLocked && selectedElementIds.length === 1 && !isUnifiedGroupSelection && !(el.type === 'image' && imageCropMode) && (
                <>
                    {el.type === 'line' && el.lineX1 != null && el.lineY1 != null && el.lineX2 != null && el.lineY2 != null ? (
                        <>
                            <div className="absolute inset-0 border border-blue-500 pointer-events-none z-[125]" />
                            <div onMouseDown={(e) => handleLineVertexDragStart(el.id, 0, e)} className="absolute w-[8px] h-[8px] bg-white border-[1.5px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 cursor-move pointer-events-auto z-[131]" style={{ left: el.lineX1 - el.x, top: el.lineY1 - el.y, transform: 'translate(-50%, -50%)' }} />
                            <div onMouseDown={(e) => handleLineVertexDragStart(el.id, 1, e)} className="absolute w-[8px] h-[8px] bg-white border-[1.5px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 cursor-move pointer-events-auto z-[131]" style={{ left: el.lineX2 - el.x, top: el.lineY2 - el.y, transform: 'translate(-50%, -50%)' }} />
                        </>
                    ) : (
                        <>
                            <div className="absolute inset-0 border border-blue-500 pointer-events-none z-[125]" />
                            <div onMouseDown={(e) => handleElementResizeStart(el.id, 'nw', e)} className="absolute -top-[2.5px] -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-nw-resize pointer-events-auto z-[130]" />
                            <div onMouseDown={(e) => handleElementResizeStart(el.id, 'ne', e)} className="absolute -top-[2.5px] -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-ne-resize pointer-events-auto z-[130]" />
                            <div onMouseDown={(e) => handleElementResizeStart(el.id, 'sw', e)} className="absolute -bottom-[2.5px] -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-sw-resize pointer-events-auto z-[130]" />
                            <div onMouseDown={(e) => handleElementResizeStart(el.id, 'se', e)} className="absolute -bottom-[2.5px] -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-se-resize pointer-events-auto z-[130]" />
                            <div onMouseDown={(e) => handleElementResizeStart(el.id, 'n', e)} className="absolute -top-[2.5px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-n-resize pointer-events-auto z-[130]" />
                            <div onMouseDown={(e) => handleElementResizeStart(el.id, 's', e)} className="absolute -bottom-[2.5px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-s-resize pointer-events-auto z-[130]" />
                            <div onMouseDown={(e) => handleElementResizeStart(el.id, 'w', e)} className="absolute top-1/2 -translate-y-1/2 -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-w-resize pointer-events-auto z-[130]" />
                            <div onMouseDown={(e) => handleElementResizeStart(el.id, 'e', e)} className="absolute top-1/2 -translate-y-1/2 -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-e-resize pointer-events-auto z-[130]" />
                            {el.type === 'polygon' && (el.polygonPoints ?? []).length > 0 && (
                                <>
                                    {(el.polygonPoints ?? []).map((pt, idx) => (
                                        <div key={idx} onMouseDown={(e) => handlePolygonVertexDragStart(el.id, idx, e)} className="absolute w-[8px] h-[8px] bg-white border-[1.5px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 cursor-move pointer-events-auto z-[131]" style={{ left: pt.x - el.x, top: pt.y - el.y, transform: 'translate(-50%, -50%)' }} />
                                    ))}
                                </>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}, areCanvasElementPropsEqual);

export default CanvasElement;
