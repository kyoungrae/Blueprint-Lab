/**
 * DrawElementsList
 *
 * ScreenNodeFull에서 drawElements 구독을 분리하기 위한 전용 컴포넌트.
 *
 * [성능 최적화 원리]
 * ScreenNodeFull은 3900줄짜리 거대한 컴포넌트다.
 * drawElements가 바뀔 때마다 ScreenNodeFull 전체가 리렌더되면
 * 수백 개의 hook, useMemo, useCallback 재평가가 발생한다.
 *
 * 이 컴포넌트에 drawElements 구독을 격리하면:
 *   - drawElements 변경 시 → DrawElementsList만 리렌더
 *   - ScreenNodeFull은 리렌더되지 않음
 *   - 각 CanvasElement는 memo로 개별 변경만 DOM 업데이트
 *
 * 이것이 Figma가 구현하는 "레이어별 독립 업데이트" 패턴의 React 버전이다.
 */
import React, { memo, useCallback } from 'react';
import type { DrawElement } from '../../types/screenDesign';
import { useScreenDesignStore } from '../../store/screenDesignStore';
import { useComponentStore } from '../../store/componentStore';
import { useScreenCanvasStore } from '../../contexts/ScreenCanvasStoreContext';
import CanvasElement from './CanvasElement';

// 안정적인 빈 배열 (모듈 수준 상수 - React.useRef보다 더 안전)
const STABLE_EMPTY: DrawElement[] = [];

interface DrawElementsListProps {
    screenId: string;
    // CanvasElement에 전달할 모든 안정적인 props (ScreenNodeFull에서 useCallback으로 메모이제이션된 것들)
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

const DrawElementsList: React.FC<DrawElementsListProps> = memo(({
    screenId,
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
    // drawElements를 직접 구독 — ScreenNodeFull이 구독할 필요 없음
    const screenCanvasCtx = useScreenCanvasStore();
    const isComponentCtx = Boolean(screenCanvasCtx);

    const drawElementsFromScreen = useScreenDesignStore(
        useCallback(
            (state) => state.screens.find((s) => s.id === screenId)?.drawElements ?? STABLE_EMPTY,
            [screenId]
        )
    );
    const drawElementsFromComponent = useComponentStore(
        useCallback(
            (state) => state.components.find((s) => s.id === screenId)?.drawElements ?? STABLE_EMPTY,
            [screenId]
        )
    );
    const drawElements = isComponentCtx ? drawElementsFromComponent : drawElementsFromScreen;

    return (
        <>
            {drawElements.map((el) => (
                <CanvasElement
                    key={el.id}
                    el={el}
                    isSelected={selectedElementIds.includes(el.id)}
                    isLocked={isLocked}
                    activeTool={activeTool}
                    isDrawing={isDrawing}
                    isMoving={isMoving}
                    isUnifiedGroupSelection={isUnifiedGroupSelection}
                    selectedElementIds={selectedElementIds}
                    editingTextId={editingTextId}
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
                    update={update}
                    saveHistory={saveHistory}
                    setSelectedElementIds={setSelectedElementIds}
                    getDrawElements={getDrawElements}
                    isDraggingCellSelectionRef={isDraggingCellSelectionRef}
                    dragStartCellIndexRef={dragStartCellIndexRef}
                    handleElementMouseDown={handleElementMouseDown}
                    handleElementDoubleClick={handleElementDoubleClick}
                    handleElementTextSelectionChange={handleElementTextSelectionChange}
                    handleLineVertexDragStart={handleLineVertexDragStart}
                    handleElementResizeStart={handleElementResizeStart}
                    handlePolygonVertexDragStart={handlePolygonVertexDragStart}
                    deleteElements={deleteElements}
                    currentProjectId={currentProjectId}
                    imageCropMode={imageCropMode}
                    flushPendingSync={flushPendingSync}
                />
            ))}
        </>
    );
});

DrawElementsList.displayName = 'DrawElementsList';

export default DrawElementsList;
