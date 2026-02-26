import React, { memo, useState, useRef, useEffect, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { type NodeProps, useViewport, useReactFlow } from 'reactflow';
import type { Screen, DrawElement, TableCellData } from '../types/screenDesign';
import { PAGE_SIZE_PRESETS, PAGE_SIZE_OPTIONS } from '../types/screenDesign';

import { Plus, Minus, X, Image as ImageIcon, MousePointer2, Square, Type, Circle, Palette, Layers, GripVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Table2, Settings2, Combine, Split, Undo2, Redo2, Group, Ungroup, Crop, Grid3x3, Trash2 } from 'lucide-react';
import { useScreenNodeStore } from '../contexts/ScreenCanvasStoreContext';
import { useProjectStore } from '../store/projectStore';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';

// ── Sub-Components ────────────────────────────────────────────

import ScreenHandles from './screenNode/ScreenHandles';
import { ExportModeContext } from '../contexts/ExportModeContext';
import { CanvasOnlyModeContext } from '../contexts/CanvasOnlyModeContext';
import { useScreenDesignUndoRedo } from '../contexts/ScreenDesignUndoRedoContext';
import DrawTextComponent from './screenNode/DrawTextComponent';
import PremiumTooltip from './screenNode/PremiumTooltip';
import MetaInfoTable from './screenNode/MetaInfoTable';
import StylePanel from './screenNode/StylePanel';
import LayerPanel from './screenNode/LayerPanel';
import ImageElement from './screenNode/ImageElement';
import { ImageStylePanel } from './screenNode/ImageStylePanel';
import { normalizeImageUrlForStorage } from '../utils/imageUrl';
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { EntityLockBadge, useEntityLock } from './collaboration';
import { hexToRgba, flatIdxToRowCol, rowColToFlatIdx, getV2Cells, deepCopyCells } from './screenNode/types';
import { getSmartGuidesAndSnap, type AlignmentGuides, type SnapState } from './screenNode/smartGuides';
import { AlignmentGuidesOverlay } from './screenNode/AlignmentGuidesOverlay';
import { ScreenHeader } from './screenNode/ScreenHeader';
import { LockOverlay } from './screenNode/LockOverlay';

const getPanelPortalRoot = () => document.getElementById('panel-portal-root') || document.body;


// (ScreenHandles, DrawTextComponent, PremiumTooltip imported from ./screenNode/)

/** mousedown target이 Text/SVG 등일 수 있어 Element로 안전하게 변환 */
function getClickTargetElement(target: EventTarget | null): Element | null {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (target instanceof Node && target.parentElement) return target.parentElement;
    return null;
}

// ── Screen Node ─────────────────────────────────────────────
interface ScreenNodeData {
    screen: Screen;
}

const ScreenNode: React.FC<NodeProps<ScreenNodeData>> = ({ data, selected }) => {
    const isExporting = useContext(ExportModeContext);
    const canvasOnlyMode = useContext(CanvasOnlyModeContext);
    const { zoom } = useViewport();
    const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
    const { setHandlers } = useScreenDesignUndoRedo();
    const { screen } = data;
    const {
        updateScreen,
        deleteScreen,
        canvasClipboard,
        setCanvasClipboard,
        lastInteractedScreenId,
        setLastInteractedScreenId,
        getScreenById,
    } = useScreenNodeStore();
    const { sendOperation } = useSyncStore();
    const { user } = useAuthStore();
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

    const uploadImage = async (file: File): Promise<string> => {
        if (!currentProjectId || currentProjectId.startsWith('local_')) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetchWithAuth(`${API_URL}/${currentProjectId}/images`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) throw new Error('Image upload failed');
        const json = await res.json() as { imageId: string; url: string };
        return normalizeImageUrlForStorage(json.url) ?? json.url;
    };

    const syncUpdate = (updates: Partial<Screen>) => {
        sendOperation({
            type: 'SCREEN_UPDATE',
            targetId: screen.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: updates
        });
    };

    const { isLockedByOther, lockedBy, requestLock, releaseLock } = useEntityLock(screen.id);
    const isLocalLocked = screen.isLocked ?? true;
    const isLocked = isLocalLocked || isLockedByOther;
    const [showScreenOptionsPanel, setShowScreenOptionsPanel] = React.useState(false);
    const screenOptionsRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Linked ERD Project Data
    const { currentProjectId } = useProjectStore();


    const update = (updates: Partial<Screen>) => {
        if (isLocked) return;
        updateScreen(screen.id, updates);
    };

    const handleToggleLock = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (isLockedByOther) {
            alert(`${lockedBy}님이 수정 중입니다.`);
            return;
        }
        const newLockedState = !isLocalLocked;
        updateScreen(screen.id, { isLocked: newLockedState });
        syncUpdate({ isLocked: newLockedState });
        if (!newLockedState) {
            requestLock();
        } else {
            releaseLock();
        }
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`화면 "${screen.name}"을(를) 삭제하시겠습니까?`)) {
            deleteScreen(screen.id);
        }
    };






    // ── 4. Drawing Mode Logic ──
    const [activeTool, setActiveTool] = useState<'select' | 'rect' | 'circle' | 'text' | 'image' | 'table' | 'func-no'>('select');
    const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
    const canvasRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStartPos, setDrawStartPos] = useState({ x: 0, y: 0 });
    const [tempElement, setTempElement] = useState<DrawElement | null>(null);
    const [draggingElementIds, setDraggingElementIds] = useState<string[]>([]);
    const [dragOffsets, setDragOffsets] = useState<Record<string, { x: number, y: number }>>({});
    const [isMoving, setIsMoving] = useState(false);
    const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides | null>(null);
    const snapStateRef = useRef<SnapState>({});
    const [dragPreviewPositions, setDragPreviewPositions] = useState<Record<string, { x: number; y: number }> | null>(null);
    const [showGridPanel, setShowGridPanel] = useState(false);
    const [gridPanelPos, setGridPanelPos] = useState({ x: 0, y: 0 });
    const gridPanelAnchorRef = useRef<HTMLDivElement>(null);
    const guideLineDragRef = useRef<{ axis: 'vertical' | 'horizontal'; value: number } | null>(null);
    const [selectedGuideLine, setSelectedGuideLine] = useState<{ axis: 'vertical' | 'horizontal'; value: number } | null>(null);

    const [showStylePanel, setShowStylePanel] = useState(false);
    const [showLayerPanel, setShowLayerPanel] = useState(false);
    const [showTablePicker, setShowTablePicker] = useState(false);
    const [tablePickerHover, setTablePickerHover] = useState<{ r: number, c: number } | null>(null);
    const [tablePickerPos, setTablePickerPos] = useState({ x: 0, y: 0 });
    const isDraggingTablePickerRef = useRef(false);
    const tablePickerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const handleTablePickerHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        isDraggingTablePickerRef.current = true;
        const flowAtClick = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const offsetFlowX = flowAtClick.x - tablePickerPos.x;
        const offsetFlowY = flowAtClick.y - tablePickerPos.y;
        const onMove = (me: MouseEvent) => {
            if (!isDraggingTablePickerRef.current) return;
            me.stopImmediatePropagation();
            const flowAtMove = screenToFlowPosition({ x: me.clientX, y: me.clientY });
            setTablePickerPos({ x: flowAtMove.x - offsetFlowX, y: flowAtMove.y - offsetFlowY });
        };
        const onUp = () => {
            isDraggingTablePickerRef.current = false;
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp);
    }, [screenToFlowPosition, tablePickerPos]);
    const handleGridPanelHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const flowAtClick = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const offsetFlowX = flowAtClick.x - gridPanelPos.x;
        const offsetFlowY = flowAtClick.y - gridPanelPos.y;
        const onMove = (me: MouseEvent) => {
            me.stopImmediatePropagation();
            const flowAtMove = screenToFlowPosition({ x: me.clientX, y: me.clientY });
            setGridPanelPos({ x: flowAtMove.x - offsetFlowX, y: flowAtMove.y - offsetFlowY });
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp);
    }, [screenToFlowPosition, gridPanelPos]);
    const [showImageStylePanel, setShowImageStylePanel] = useState(false);
    const [imageStylePanelPos, setImageStylePanelPos] = useState({ x: 0, y: 0 });
    const [imageCropMode, setImageCropMode] = useState(false);
    const isDraggingImageStylePanelRef = useRef(false);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);

    // Close table list, screen options, table picker on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            const el = getClickTargetElement(e.target);
            if (screenOptionsRef.current && !screenOptionsRef.current.contains(target)) {
                setShowScreenOptionsPanel(false);
            }
            if (showTablePicker && !isDraggingTablePickerRef.current && tablePickerRef.current && !tablePickerRef.current.contains(target) && !el?.closest('[data-table-picker-portal]')) {
                setShowTablePicker(false);
            }
            if (showGridPanel && gridPanelAnchorRef.current && !gridPanelAnchorRef.current.contains(target) && !el?.closest('[data-grid-panel]')) {
                setShowGridPanel(false);
            }
            if (!el?.closest('[data-guide-line]')) {
                setSelectedGuideLine(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, [showTablePicker, showGridPanel]);

    // 이미지 스타일 패널이 닫히면 크롭 모드도 항상 해제
    useEffect(() => {
        if (!showImageStylePanel && imageCropMode) {
            setImageCropMode(false);
        }
    }, [showImageStylePanel, imageCropMode]);

    const tableRowResizeRef = useRef<{ elId: string, rowIdx: number, startY: number, startHeights: number[] } | null>(null);
    const [editingCellIndex, setEditingCellIndex] = useState<number | null>(null);
    const [selectedCellIndices, setSelectedCellIndices] = useState<number[]>([]);

    type HistorySnapshot = {
        drawElements: DrawElement[];
        position: { x: number; y: number };
    };

    // Undo/Redo History State (요소 + 엔티티 위치)
    const [history, setHistory] = useState<{
        past: HistorySnapshot[],
        future: HistorySnapshot[]
    }>({ past: [], future: [] });
    const MAX_HISTORY = 50;
    const restoringHistoryRef = useRef(false);

    const saveHistory = (elements: DrawElement[], position = screen.position) => {
        const snapshot: HistorySnapshot = {
            drawElements: elements,
            position: { x: position.x, y: position.y },
        };
        setHistory(prev => {
            // If the last state is the same as current, don't save
            if (prev.past.length > 0 && JSON.stringify(prev.past[prev.past.length - 1]) === JSON.stringify(snapshot)) {
                return prev;
            }
            const newPast = [...prev.past, snapshot].slice(-MAX_HISTORY);
            return {
                past: newPast,
                future: [] // Clear future when a new action is performed
            };
        });
    };

    const undo = () => {
        if (history.past.length <= 1) return;

        setHistory(prev => {
            const newPast = [...prev.past];
            const current = newPast.pop();
            const previous = newPast[newPast.length - 1];

            if (!current || !previous) return prev;

            restoringHistoryRef.current = true;
            // undo/redo는 잠금 여부와 관계없이 실행 (의도적인 복원 동작)
            updateScreen(screen.id, { drawElements: previous.drawElements, position: previous.position });
            syncUpdate({ drawElements: previous.drawElements, position: previous.position });
            requestAnimationFrame(() => {
                restoringHistoryRef.current = false;
            });

            return {
                past: newPast,
                future: [current, ...prev.future].slice(0, MAX_HISTORY)
            };
        });
    };

    const redo = () => {
        if (history.future.length === 0) return;

        setHistory(prev => {
            const newFuture = [...prev.future];
            const next = newFuture.shift();

            if (!next) return prev;

            restoringHistoryRef.current = true;
            // undo/redo는 잠금 여부와 관계없이 실행 (의도적인 복원 동작)
            updateScreen(screen.id, { drawElements: next.drawElements, position: next.position });
            syncUpdate({ drawElements: next.drawElements, position: next.position });
            requestAnimationFrame(() => {
                restoringHistoryRef.current = false;
            });

            return {
                past: [...prev.past, next].slice(-MAX_HISTORY),
                future: newFuture
            };
        });
    };

    // Initial history save
    useEffect(() => {
        if (history.past.length === 0 && screen.drawElements) {
            setHistory({
                past: [{
                    drawElements: screen.drawElements,
                    position: { x: screen.position.x, y: screen.position.y },
                }],
                future: []
            });
        }
    }, []);

    // 엔티티 이동(position)도 undo/redo 히스토리에 포함
    useEffect(() => {
        if (restoringHistoryRef.current) return;
        saveHistory(screen.drawElements || [], screen.position);
    }, [screen.position.x, screen.position.y]);

    // 상단 툴바에 Undo/Redo 노출 (선택된 화면이면 잠금 여부와 관계없이 항상 노출)
    useEffect(() => {
        if (selected) {
            setHandlers(screen.id, {
                undo,
                redo,
                canUndo: history.past.length > 1,
                canRedo: history.future.length > 0,
            });
        } else {
            setHandlers(screen.id, null);
        }
        return () => setHandlers(screen.id, null);
    }, [selected, history.past.length, history.future.length, setHandlers, screen.id]);

    const [editingTableId, setEditingTableId] = useState<string | null>(null);
    // IME 조합 중(한글 등) 자음/모음 분리 방지
    const [tableCellComposing, setTableCellComposing] = useState<{ cellIndex: number; value: string } | null>(null);
    const [showTablePanel, setShowTablePanel] = useState(false);

    useEffect(() => {
        setTableCellComposing(null);
    }, [editingCellIndex]);
    const [tablePanelPos, setTablePanelPos] = useState({ x: 200, y: 100 });
    const isDraggingTablePanelRef = useRef(false);
    const isDraggingCellSelectionRef = useRef(false); // drag-to-select cells
    const dragStartCellIndexRef = useRef<number>(-1); // cell index where drag started
    // Split Dialog State
    const [showSplitDialog, setShowSplitDialog] = useState(false);
    const [splitTarget, setSplitTarget] = useState<{ elId: string, cellIdx: number } | null>(null);
    const [splitRows, setSplitRows] = useState(2);
    const [splitCols, setSplitCols] = useState(1);

    // Panel Dragging State (toolbarPos removed as toolbar is now inside canvas area)

    const [stylePanelPos, setStylePanelPos] = useState({ x: 200, y: 100 });
    const isDraggingStylePanelRef = useRef(false);

    const [layerPanelPos, setLayerPanelPos] = useState({ x: 200, y: 100 });
    const isDraggingLayerPanelRef = useRef(false);

    const [textSelectionRect, setTextSelectionRect] = useState<DOMRect | null>(null);

    // Marquee drag-selection state
    const [isDragSelecting, setIsDragSelecting] = useState(false);
    const [dragSelectStart, setDragSelectStart] = useState({ x: 0, y: 0 });
    const [dragSelectRect, setDragSelectRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);





    // Reset positions when locked/unlocked
    useEffect(() => {
        setStylePanelPos({ x: 200, y: 240 });
        setLayerPanelPos({ x: 200, y: 240 });
    }, [isLocked]);

    // Clear selection when clicking outside the node (on the outer ReactFlow canvas)
    useEffect(() => {
        const clearSelection = () => {
            setSelectedElementIds([]);
            setEditingTableId(null);
            setEditingTextId(null);
            setSelectedCellIndices([]);
            setEditingCellIndex(null);
        };

        // Use capture phase so this fires before ReactFlow can stop propagation
        // (locked nodes have no nodrag class → ReactFlow intercepts and stops bubble).
        const handleMouseDownCapture = (e: MouseEvent) => {
            if (containerRef.current && containerRef.current.contains(e.target as Node)) {
                setLastInteractedScreenId(screen.id);
                return;
            }
            // 포털로 body에 렌더된 패널 클릭 시 또는 패널 드래그 중에는 선택 해제하지 않음
            if (isDraggingImageStylePanelRef.current || isDraggingStylePanelRef.current || isDraggingLayerPanelRef.current || isDraggingTablePanelRef.current || isDraggingTablePickerRef.current) {
                setLastInteractedScreenId(screen.id);
                return;
            }
            const el = getClickTargetElement(e.target);
            if (el?.closest('[data-image-style-panel], [data-table-picker-portal], [data-table-list-portal], [data-style-panel], [data-layer-panel], [data-table-panel], [data-grid-panel]')) {
                setLastInteractedScreenId(screen.id);
                return;
            }
            clearSelection();
        };

        document.addEventListener('mousedown', handleMouseDownCapture, true);
        window.addEventListener('clear-screen-selection', clearSelection);

        return () => {
            document.removeEventListener('mousedown', handleMouseDownCapture, true);
            window.removeEventListener('clear-screen-selection', clearSelection);
        };
    }, [setLastInteractedScreenId, screen.id]);



    const drawElements = screen.drawElements || [];
    const guideLines = screen.guideLines || { vertical: [], horizontal: [] };

    const addGuideLine = (axis: 'vertical' | 'horizontal') => {
        const cw = canvasRef.current?.clientWidth ?? 400;
        const ch = canvasRef.current?.clientHeight ?? 300;
        if (cw <= 0 || ch <= 0) return;
        const dim = axis === 'vertical' ? cw : ch;
        const existing = axis === 'vertical' ? guideLines.vertical : guideLines.horizontal;
        const minGap = 20;
        const candidates = [0.5, 0.25, 0.75, 1/6, 2/6, 4/6, 5/6, 1/8, 3/8, 5/8, 7/8, 1/10, 3/10, 5/10, 7/10, 9/10]
            .map(r => Math.round(dim * r))
            .filter(p => p >= minGap && p <= dim - minGap)
            .sort((a, b) => {
                const distA = Math.abs(a - dim / 2);
                const distB = Math.abs(b - dim / 2);
                return distA - distB;
            });
        let nextValue = candidates.find(p => !existing.some(v => Math.abs(v - p) < minGap));
        if (nextValue == null) {
            const last = existing.length > 0 ? Math.max(...existing) : 0;
            nextValue = Math.min(dim - minGap, last + minGap);
            if (existing.some(v => Math.abs(v - nextValue!) < minGap)) {
                nextValue = Math.round(dim / 2);
            }
        }
        const nextLines = {
            vertical: axis === 'vertical' ? [...guideLines.vertical, nextValue] : [...guideLines.vertical],
            horizontal: axis === 'horizontal' ? [...guideLines.horizontal, nextValue] : [...guideLines.horizontal],
        };
        nextLines.vertical.sort((a, b) => a - b);
        nextLines.horizontal.sort((a, b) => a - b);
        update({ guideLines: nextLines });
        syncUpdate({ guideLines: nextLines });
    };

    const moveGuideLine = (axis: 'vertical' | 'horizontal', oldValue: number, newValue: number) => {
        const cw = canvasRef.current?.clientWidth ?? 400;
        const ch = canvasRef.current?.clientHeight ?? 300;
        const max = axis === 'vertical' ? cw : ch;
        const clamped = Math.max(2, Math.min(max - 2, newValue));
        const current = getScreenById(screen.id)?.guideLines;
        const vert = current?.vertical ?? guideLines.vertical;
        const horz = current?.horizontal ?? guideLines.horizontal;
        const nextLines = {
            vertical: axis === 'vertical' ? vert.map(v => v === oldValue ? clamped : v) : [...vert],
            horizontal: axis === 'horizontal' ? horz.map(v => v === oldValue ? clamped : v) : [...horz],
        };
        nextLines.vertical.sort((a, b) => a - b);
        nextLines.horizontal.sort((a, b) => a - b);
        update({ guideLines: nextLines });
    };

    const removeGuideLine = (axis: 'vertical' | 'horizontal', value: number) => {
        const nextLines = {
            vertical: guideLines.vertical.filter(v => !(axis === 'vertical' && v === value)),
            horizontal: guideLines.horizontal.filter(v => !(axis === 'horizontal' && v === value)),
        };
        update({ guideLines: nextLines });
        syncUpdate({ guideLines: nextLines });
    };

    const handleGuideLineDragStart = useCallback((axis: 'vertical' | 'horizontal', value: number, e: React.MouseEvent) => {
        if (isLocked || !canvasRef.current) return;
        e.stopPropagation();
        e.preventDefault();
        guideLineDragRef.current = { axis, value };
        let hasMoved = false;
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.clientWidth / rect.width;
        const scaleY = canvasRef.current.clientHeight / rect.height;
        const cw = canvasRef.current.clientWidth;
        const ch = canvasRef.current.clientHeight;

        const onMove = (me: MouseEvent) => {
            if (!guideLineDragRef.current) return;
            hasMoved = true;
            const { axis: ax, value: oldVal } = guideLineDragRef.current;
            const newVal = ax === 'vertical'
                ? Math.round((me.clientX - rect.left) * scaleX)
                : Math.round((me.clientY - rect.top) * scaleY);
            const clamped = Math.max(2, Math.min((ax === 'vertical' ? cw : ch) - 2, newVal));
            moveGuideLine(ax, oldVal, clamped);
            guideLineDragRef.current.value = clamped;
        };
        const onUp = () => {
            if (guideLineDragRef.current) {
                const current = getScreenById(screen.id)?.guideLines;
                if (current) syncUpdate({ guideLines: current });
                if (!hasMoved) {
                    setSelectedGuideLine({ axis, value: guideLineDragRef.current.value });
                } else {
                    setSelectedGuideLine(null);
                }
            }
            guideLineDragRef.current = null;
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp, true);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp, true);
    }, [isLocked, screen.id, syncUpdate]);

    // Drawing Element Resizing Logic
    const elementResizeStartRef = useRef<{
        x: number, y: number,
        elX: number, elY: number,
        w: number, h: number,
        dir: string, id: string
    } | null>(null);

    const handleElementResizeStart = (id: string, dir: string, e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();

        const el = drawElements.find(item => item.id === id);
        if (!el) return;

        elementResizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            elX: el.x,
            elY: el.y,
            w: el.width,
            h: el.height,
            dir,
            id
        };

        const handleWindowMouseMove = (moveEvent: MouseEvent) => {
            if (!elementResizeStartRef.current || !canvasRef.current) return;
            const { x, y, elX, elY, w, h, dir, id: targetId } = elementResizeStartRef.current;
            const cRect = canvasRef.current.getBoundingClientRect();
            const sX = canvasRef.current.clientWidth / cRect.width;
            const sY = canvasRef.current.clientHeight / cRect.height;
            const dx = (moveEvent.clientX - x) * sX;
            const dy = (moveEvent.clientY - y) * sY;

            let nextX = elX;
            let nextY = elY;
            let nextW = w;
            let nextH = h;

            if (dir.includes('e')) nextW = w + dx;
            if (dir.includes('w')) {
                nextW = w - dx;
                nextX = elX + dx;
            }
            if (dir.includes('s')) nextH = h + dy;
            if (dir.includes('n')) {
                nextH = h - dy;
                nextY = elY + dy;
            }

            // Min size
            if (nextW < 20) {
                if (dir.includes('w')) nextX = elX + w - 20;
                nextW = 20;
            }
            if (nextH < 20) {
                if (dir.includes('n')) nextY = elY + h - 20;
                nextH = 20;
            }

            // Update in-place for smooth visual
            const currentElements = getScreenById(screen.id)?.drawElements || [];
            const updated = currentElements.map(item =>
                item.id === targetId ? { ...item, x: nextX, y: nextY, width: nextW, height: nextH } : item
            );
            update({ drawElements: updated });
        };

        const handleWindowMouseUp = () => {
            if (elementResizeStartRef.current) {
                const currentElements = getScreenById(screen.id)?.drawElements || [];
                syncUpdate({ drawElements: currentElements });
            }
            elementResizeStartRef.current = null;
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };

        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (isLocked || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.clientWidth / rect.width;
        const scaleY = canvasRef.current.clientHeight / rect.height;
        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);

        if (activeTool === 'select') {
            // Start marquee drag-selection on background click
            // Check if we clicked the canvas background or an element that should allow marquee
            const target = e.target as HTMLElement;
            const isBackground = target === canvasRef.current || 
                               target.classList.contains('react-flow__pane') ||
                               (!target.closest('.group-canvas-element') && !target.closest('.floating-panel') && !target.closest('.nodrag'));
            
            if (isBackground) {
                if (!e.shiftKey) {
                    setSelectedElementIds([]);
                    setEditingTableId(null);
                    setEditingTextId(null);
                    setSelectedCellIndices([]);
                    setEditingCellIndex(null);
                    setSelectedGuideLine(null);
                }
                setIsDragSelecting(true);
                setDragSelectStart({ x, y });
                setDragSelectRect({ x, y, w: 0, h: 0 });
            }
            return;
        }

        setIsDrawing(true);
        setDrawStartPos({ x, y });

        const newId = `draw_${Date.now()}`;
        let newElement: DrawElement;

        if (activeTool === 'func-no') {
            // Find the highest number in existing func-no elements
            const existingFuncNos = drawElements.filter(el => el.type === 'func-no');
            let nextNo = 1;
            if (existingFuncNos.length > 0) {
                const numbers = existingFuncNos
                    .map(el => parseInt(el.text || '0'))
                    .filter(n => !isNaN(n));
                if (numbers.length > 0) {
                    nextNo = Math.max(...numbers) + 1;
                }
            }

            newElement = {
                id: newId,
                type: 'func-no',
                x,
                y,
                width: 24,
                height: 24,
                fill: '#ef4444', // Red color for function numbers
                stroke: '#ffffff',
                strokeWidth: 2,
                zIndex: drawElements.length + 1,
                text: nextNo.toString(),
                fontSize: 12,
                color: '#ffffff',
                borderRadius: 12, // Circle shape
            };
        } else {
            newElement = {
                id: newId,
                type: activeTool === 'table' ? 'table' : activeTool === 'rect' ? 'rect' : activeTool === 'circle' ? 'circle' : activeTool === 'text' ? 'text' : 'image',
                x,
                y,
                width: activeTool === 'table' ? 200 : 0,
                height: activeTool === 'table' ? 120 : 0,
                fill: '#ffffff',
                stroke: '#2c3e7c',
                strokeWidth: 2,
                zIndex: drawElements.length + 1,
                text: activeTool === 'text' ? '텍스트 입력' : undefined,
                fontSize: 14,
                color: '#333333',
                ...(activeTool === 'table' ? {
                    tableRows: 3,
                    tableCols: 3,
                    tableCellData: Array(9).fill(''),
                    tableColWidths: [100 / 3, 100 / 3, 100 / 3]
                } : {})
            };
        }
        setTempElement(newElement);
    };

    const handleElementMouseDown = (id: string, e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();

        // 이미지/표 등 기존 요소 클릭 시 선택만 하고 드래그는 select 도구일 때만
        if (activeTool !== 'select') {
            const clickedEl = drawElements.find(el => el.id === id);
            if (clickedEl) {
                const nextSelected = clickedEl.groupId
                    ? drawElements.filter(el => el.groupId === clickedEl.groupId).map(el => el.id)
                    : [id];
                setSelectedElementIds(nextSelected);
            }
            return;
        }

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || !canvasRef.current) return;
        const scaleX = canvasRef.current.clientWidth / rect.width;
        const scaleY = canvasRef.current.clientHeight / rect.height;

        const clickedEl = drawElements.find(el => el.id === id);

        let nextSelected: string[];
        if (e.shiftKey) {
            nextSelected = [...selectedElementIds];
            if (nextSelected.includes(id)) {
                nextSelected = nextSelected.filter(sid => sid !== id);
            } else {
                nextSelected.push(id);
            }
        } else {
            if (clickedEl?.groupId) {
                nextSelected = drawElements.filter(el => el.groupId === clickedEl.groupId).map(el => el.id);
            } else if (!selectedElementIds.includes(id)) {
                nextSelected = [id];
            } else {
                nextSelected = selectedElementIds;
            }
        }
        setSelectedElementIds(nextSelected);

        // Exit table cell-edit mode when clicking a different element
        if (editingTableId && !nextSelected.includes(editingTableId)) {
            setEditingTableId(null);
            setSelectedCellIndices([]);
            setEditingCellIndex(null);
        }

        // Disable moving if we are in an editing mode for this specific element
        if (editingTableId === id || editingTextId === id) {
            return;
        }

        // Prepare for dragging all selected elements
        setIsMoving(true);
        setDraggingElementIds(nextSelected);
        snapStateRef.current = {};
        setDragPreviewPositions(null);

        const offsets: Record<string, { x: number, y: number }> = {};
        nextSelected.forEach(sid => {
            const el = drawElements.find(item => item.id === sid);
            if (el) {
                offsets[sid] = {
                    x: (e.clientX - rect.left) * scaleX - el.x,
                    y: (e.clientY - rect.top) * scaleY - el.y
                };
            }
        });
        setDragOffsets(offsets);

        // Reset text editing state when starting to move a DIFFERENT element
        if (editingTextId && !nextSelected.includes(editingTextId)) {
            setEditingTextId(null);
        }
    };

    const handleElementDoubleClick = (id: string, e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        const el = drawElements.find(item => item.id === id);
        if (el && (el.type === 'rect' || el.type === 'circle' || el.type === 'text')) {
            setEditingTextId(id);
        }
        // Table double-click is handled at the cell level
    };


    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.clientWidth / rect.width;
        const scaleY = canvasRef.current.clientHeight / rect.height;
        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);

        // Marquee drag-selection logic
        if (isDragSelecting) {
            const selX = Math.min(x, dragSelectStart.x);
            const selY = Math.min(y, dragSelectStart.y);
            const selW = Math.abs(x - dragSelectStart.x);
            const selH = Math.abs(y - dragSelectStart.y);
            setDragSelectRect({ x: selX, y: selY, w: selW, h: selH });

            // Select elements that intersect with the drag selection rectangle
            let intersecting = drawElements.filter(el => {
                const elRight = el.x + el.width;
                const elBottom = el.y + el.height;
                return (
                    el.x < selX + selW &&
                    elRight > selX &&
                    el.y < selY + selH &&
                    elBottom > selY
                );
            }).map(el => el.id);
            // 그룹된 객체가 포함된 경우 그룹 전체 선택
            const groupIds = new Set(drawElements.filter(el => intersecting.includes(el.id) && el.groupId).map(el => el.groupId!).filter(Boolean));
            groupIds.forEach(gid => {
                const inGroup = drawElements.filter(el => el.groupId === gid).map(el => el.id);
                intersecting = [...new Set([...intersecting, ...inGroup])];
            });
            setSelectedElementIds(intersecting);
            return;
        }

        // Drawing Logic
        if (isDrawing && tempElement) {
            if (tempElement.type === 'table') {
                // Tables use fixed initial size, just track position
                setTempElement({
                    ...tempElement,
                    x: drawStartPos.x,
                    y: drawStartPos.y,
                });
            } else {
                const width = x - drawStartPos.x;
                const height = y - drawStartPos.y;

                setTempElement({
                    ...tempElement,
                    x: width < 0 ? x : drawStartPos.x,
                    y: height < 0 ? y : drawStartPos.y,
                    width: Math.abs(width),
                    height: Math.abs(height)
                });
            }
            return;
        }

        // Moving Logic - keep objects within canvas bounds (preserve relative positions when dragging group)
        if (draggingElementIds.length > 0) {
            const cw = canvasRef.current.clientWidth;
            const ch = canvasRef.current.clientHeight;
            const dragged = drawElements.filter(el => draggingElementIds.includes(el.id));
            const withOffsets = dragged.map(item => {
                const offset = dragOffsets[item.id];
                if (!offset) return null;
                return { ...item, newX: x - offset.x, newY: y - offset.y };
            }).filter(Boolean) as Array<{ newX: number; newY: number } & (typeof dragged[0])>;
            if (withOffsets.length === 0) return;

            let minNewX = Math.min(...withOffsets.map(o => o.newX));
            const maxRight = Math.max(...withOffsets.map(o => o.newX + o.width));
            let minNewY = Math.min(...withOffsets.map(o => o.newY));
            const maxBottom = Math.max(...withOffsets.map(o => o.newY + o.height));
            const centerX = (minNewX + maxRight) / 2;
            const centerY = (minNewY + maxBottom) / 2;

            // Smart Guides: 다른 요소와 정렬 시 스냅 + 가이드라인 표시
            const otherElements = drawElements
                .filter(el => !draggingElementIds.includes(el.id))
                .map(el => ({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height }));
            const { deltaX, deltaY, guides, nextSnap } = getSmartGuidesAndSnap(
                { left: minNewX, right: maxRight, centerX, top: minNewY, bottom: maxBottom, centerY },
                otherElements,
                snapStateRef.current,
                screen.guideLinesVisible !== false ? guideLines : undefined
            );
            snapStateRef.current = nextSnap;

            const snapX = deltaX;
            const snapY = deltaY;
            const snappedMinX = minNewX + snapX;
            const snappedMaxRight = maxRight + snapX;
            const snappedMinY = minNewY + snapY;
            const snappedMaxBottom = maxBottom + snapY;

            // Single correction so entire group stays in bounds while preserving relative positions
            const corrX = Math.max(-snappedMinX, Math.min(cw - snappedMaxRight, 0));
            const corrY = Math.max(-snappedMinY, Math.min(ch - snappedMaxBottom, 0));

            const nextElements = drawElements.map(item => {
                const o = withOffsets.find(w => w.id === item.id);
                if (o) {
                    return { ...item, x: o.newX + snapX + corrX, y: o.newY + snapY + corrY };
                }
                return item;
            });
            const preview: Record<string, { x: number; y: number }> = {};
            nextElements.forEach((el) => {
                if (draggingElementIds.includes(el.id)) {
                    preview[el.id] = { x: el.x, y: el.y };
                }
            });
            setDragPreviewPositions(preview);
            setAlignmentGuides(guides.vertical.length > 0 || guides.horizontal.length > 0 ? guides : null);
        }
    };

    const handleCanvasMouseUp = () => {
        // End marquee drag-selection
        if (isDragSelecting) {
            setIsDragSelecting(false);
            setDragSelectRect(null);
            return;
        }

        if (isDrawing && tempElement) {
            // Skip if too small (but always allow tables and text)
            if (tempElement.width > 5 || tempElement.height > 5 || tempElement.type === 'text' || tempElement.type === 'table') {
                const nextElements = [...drawElements, tempElement];
                update({ drawElements: nextElements });
                syncUpdate({ drawElements: nextElements });
                saveHistory(nextElements);
                setSelectedElementIds([tempElement.id]);
            }
        } else if (draggingElementIds.length > 0) {
            // Finalize move: 드래그 중에는 프리뷰만 갱신하고, mouseup 시점에 한 번만 커밋
            const committedElements = dragPreviewPositions
                ? drawElements.map((el) => {
                    const p = dragPreviewPositions[el.id];
                    return p ? { ...el, x: p.x, y: p.y } : el;
                })
                : drawElements;
            update({ drawElements: committedElements });
            syncUpdate({ drawElements: committedElements });
            saveHistory(committedElements);
            setDraggingElementIds([]);
            setIsMoving(false);
            setAlignmentGuides(null);
            snapStateRef.current = {};
            setDragPreviewPositions(null);
        }

        setIsDrawing(false);
        setTempElement(null);
        if (activeTool !== 'select') setActiveTool('select');
    };

    const updateElement = (id: string, updates: Partial<DrawElement>) => {
        const nextElements = drawElements.map(el => el.id === id ? { ...el, ...updates } : el);
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
    };

    const deleteElements = (ids: string[]) => {
        const nextElements = drawElements.filter(el => !ids.includes(el.id));
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
        setSelectedElementIds([]);
    };

    const handleLayerAction = (action: 'front' | 'back' | 'forward' | 'backward') => {
        if (selectedElementIds.length === 0) return;

        let nextElements = [...drawElements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        selectedElementIds.forEach(id => {
            const index = nextElements.findIndex(el => el.id === id);
            if (index === -1) return;

            const el = nextElements[index];

            if (action === 'front') {
                nextElements.splice(index, 1);
                nextElements.push(el);
            } else if (action === 'back') {
                nextElements.splice(index, 1);
                nextElements.unshift(el);
            } else if (action === 'forward') {
                if (index < nextElements.length - 1) {
                    [nextElements[index], nextElements[index + 1]] = [nextElements[index + 1], nextElements[index]];
                }
            } else if (action === 'backward') {
                if (index > 0) {
                    [nextElements[index], nextElements[index - 1]] = [nextElements[index - 1], nextElements[index]];
                }
            }
        });

        // Re-assign z-indices based on new order
        const updatedElements = nextElements.map((el, i) => ({ ...el, zIndex: i + 1 }));
        update({ drawElements: updatedElements });
        syncUpdate({ drawElements: updatedElements });
        saveHistory(updatedElements);
    };

    // ── Object-to-Object Alignment ──────────────────────────────
    const handleObjectAlign = (action: 'align-left' | 'align-center-h' | 'align-right' | 'align-top' | 'align-center-v' | 'align-bottom' | 'distribute-h' | 'distribute-v') => {
        if (selectedElementIds.length < 2) return;

        const selectedElements = drawElements.filter(el => selectedElementIds.includes(el.id));
        if (selectedElements.length < 2) return;

        let nextElements = [...drawElements];

        if (action === 'align-left') {
            const minX = Math.min(...selectedElements.map(el => el.x));
            nextElements = nextElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, x: minX } : el
            );
        } else if (action === 'align-center-h') {
            const minX = Math.min(...selectedElements.map(el => el.x));
            const maxRight = Math.max(...selectedElements.map(el => el.x + el.width));
            const centerX = (minX + maxRight) / 2;
            nextElements = nextElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, x: centerX - el.width / 2 } : el
            );
        } else if (action === 'align-right') {
            const maxRight = Math.max(...selectedElements.map(el => el.x + el.width));
            nextElements = nextElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, x: maxRight - el.width } : el
            );
        } else if (action === 'align-top') {
            const minY = Math.min(...selectedElements.map(el => el.y));
            nextElements = nextElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, y: minY } : el
            );
        } else if (action === 'align-center-v') {
            const minY = Math.min(...selectedElements.map(el => el.y));
            const maxBottom = Math.max(...selectedElements.map(el => el.y + el.height));
            const centerY = (minY + maxBottom) / 2;
            nextElements = nextElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, y: centerY - el.height / 2 } : el
            );
        } else if (action === 'align-bottom') {
            const maxBottom = Math.max(...selectedElements.map(el => el.y + el.height));
            nextElements = nextElements.map(el =>
                selectedElementIds.includes(el.id) ? { ...el, y: maxBottom - el.height } : el
            );
        } else if (action === 'distribute-h') {
            if (selectedElements.length < 3) return;
            const sorted = [...selectedElements].sort((a, b) => a.x - b.x);
            const firstX = sorted[0].x;
            const lastRight = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
            const totalWidth = sorted.reduce((sum, el) => sum + el.width, 0);
            const gap = (lastRight - firstX - totalWidth) / (sorted.length - 1);
            let currentX = firstX;
            const posMap = new Map<string, number>();
            sorted.forEach(el => {
                posMap.set(el.id, currentX);
                currentX += el.width + gap;
            });
            nextElements = nextElements.map(el => {
                const newX = posMap.get(el.id);
                return newX !== undefined ? { ...el, x: newX } : el;
            });
        } else if (action === 'distribute-v') {
            if (selectedElements.length < 3) return;
            const sorted = [...selectedElements].sort((a, b) => a.y - b.y);
            const firstY = sorted[0].y;
            const lastBottom = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
            const totalHeight = sorted.reduce((sum, el) => sum + el.height, 0);
            const gap = (lastBottom - firstY - totalHeight) / (sorted.length - 1);
            let currentY = firstY;
            const posMap = new Map<string, number>();
            sorted.forEach(el => {
                posMap.set(el.id, currentY);
                currentY += el.height + gap;
            });
            nextElements = nextElements.map(el => {
                const newY = posMap.get(el.id);
                return newY !== undefined ? { ...el, y: newY } : el;
            });
        }

        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
    };

    const handleGroup = () => {
        if (selectedElementIds.length < 2) return;
        const groupId = `grp_${Date.now()}`;
        const nextElements = drawElements.map(el =>
            selectedElementIds.includes(el.id) ? { ...el, groupId } : el
        );
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
    };

    const handleUngroup = () => {
        const toUngroup = selectedElementIds.filter(id => {
            const el = drawElements.find(e => e.id === id);
            return el?.groupId != null;
        });
        if (toUngroup.length === 0) return;
        const nextElements = drawElements.map(el =>
            toUngroup.includes(el.id) ? { ...el, groupId: undefined } : el
        );
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
        setSelectedElementIds(prev => prev.filter(id => toUngroup.includes(id)));
    };

    // 삭제 계층: 1) 화면 엔티티(캔버스에서 처리) 2) 그리기 객체 3) 텍스트 입력 영역(문자만 삭제)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const active = document.activeElement as HTMLElement | null;
            const isInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable || editingTextId != null || (editingTableId != null && editingCellIndex != null);

            // Ctrl+C (Copy) - 전역 클립보드에 저장 (다른 엔티티에서 붙여넣기 가능)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                if (isInput || selectedElementIds.length === 0) return;
                e.preventDefault();
                const toCopy = drawElements.filter(el => selectedElementIds.includes(el.id));
                setCanvasClipboard(JSON.parse(JSON.stringify(toCopy)));
                return;
            }

            // Ctrl+V (Paste) - 이 노드가 마지막 상호작용 대상일 때만 붙여넣기
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                if (isInput || canvasClipboard.length === 0) return;
                if (lastInteractedScreenId !== screen.id) return; // 다른 엔티티에 포커스된 경우 스킵
                e.preventDefault();

                const newElements = canvasClipboard.map((el, idx) => ({
                    ...el,
                    id: `el_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
                    x: el.x + 20,
                    y: el.y + 20
                }));

                const nextElements = [...drawElements, ...newElements];
                update({ drawElements: nextElements });
                syncUpdate({ drawElements: nextElements });
                saveHistory(nextElements);

                setSelectedElementIds(newElements.map(el => el.id));
                setCanvasClipboard(newElements);
                return;
            }

            // Ctrl+Z (Undo)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                if (isInput) return;
                e.preventDefault();
                undo();
                return;
            }

            // Ctrl+Y or Ctrl+Shift+Z (Redo)
            if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
                if (isInput) return;
                e.preventDefault();
                redo();
                return;
            }

            if (e.key !== 'Backspace' && e.key !== 'Delete') return;
            if (selectedElementIds.length === 0) return;

            // ── 3단계: 텍스트 입력 영역 ──
            // 포커스가 텍스트 입력 중이면 가로채지 않음 → Backspace는 글자만 삭제
            if (isInput) return;

            // ── 2단계: 그리기 객체 ──
            // 객체만 선택된 상태(텍스트 편집 아님)에서만 객체 삭제 확인 후 삭제
            e.preventDefault();
            e.stopPropagation();
            if (window.confirm(`선택한 ${selectedElementIds.length}개의 그리기 개체를 삭제하시겠습니까?`)) {
                deleteElements(selectedElementIds);
            }
            // 1단계(화면 엔티티 삭제)는 ScreenDesignCanvas에서 화면 노드 선택 시 처리
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [selectedElementIds, drawElements, editingTextId, editingTableId, editingCellIndex, canvasClipboard, lastInteractedScreenId, screen.id, setCanvasClipboard]);


    // ── Table V2 Utilities (flatIdxToRowCol, rowColToFlatIdx, getV2Cells, deepCopyCells, gcd imported from ./screenNode/types) ──────────────────────────────────

    // V2 셀 데이터를 요소에 저장하고 동기화 (closure over drawElements/update/syncUpdate)
    const saveV2Cells = (elId: string, v2Cells: TableCellData[], extraUpdates?: Partial<DrawElement>) => {
        const legacyCellData = v2Cells.map(c => c.content);
        const legacySpans = v2Cells.map(c => ({
            rowSpan: c.isMerged ? 0 : c.rowSpan,
            colSpan: c.isMerged ? 0 : c.colSpan,
        }));

        const updates: Partial<DrawElement> = {
            tableCellDataV2: v2Cells,
            tableCellData: legacyCellData,
            tableCellSpans: legacySpans,
            ...extraUpdates,
        };

        const nextElements = drawElements.map(el => el.id === elId ? { ...el, ...updates } : el);
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
    };

    const handleExecSplit = (el: DrawElement, cellIdx: number, splitRowCount: number, splitColCount: number) => {
        if (!el.tableRows || !el.tableCols || isLocked) return;

        const rows = el.tableRows;
        const cols = el.tableCols;

        // Determine which row/col the selected cell is in
        const { r: targetRow, c: targetCol } = flatIdxToRowCol(cellIdx, cols);

        let newRows = rows;
        let newCols = cols;
        let colWidths = el.tableColWidths ? [...el.tableColWidths] : Array(cols).fill(100 / cols);
        let rowHeights = el.tableRowHeights ? [...el.tableRowHeights] : Array(rows).fill(100 / rows);
        let cellData = el.tableCellData ? [...el.tableCellData] : Array(rows * cols).fill('');
        let cellColors = el.tableCellColors ? [...el.tableCellColors] : Array(rows * cols).fill(undefined);
        let cellStyles = el.tableCellStyles ? [...el.tableCellStyles] : Array(rows * cols).fill(undefined);

        // Start from existing V2 data if available, to preserve existing spans
        let existingV2 = getV2Cells(el);

        // ── Column Split (splitColCount > 1) ──
        // Adds columns to grid, but only target row gets individual cells;
        // other rows' cells at the split position get colSpan to look unchanged.
        if (splitColCount > 1) {
            const colsToAdd = splitColCount - 1;
            const oldColWidth = colWidths[targetCol];
            const newSubWidth = oldColWidth / splitColCount;

            // Update column widths
            const newColWidths = [...colWidths];
            newColWidths.splice(targetCol, 1, ...Array(splitColCount).fill(newSubWidth));
            colWidths = newColWidths;
            newCols = cols + colsToAdd;

            // Rebuild all cell arrays with new column layout
            const newCellData: string[] = [];
            const newCellColors: (string | undefined)[] = [];
            const newCellStyles: (Record<string, any> | undefined)[] = [];
            const newV2: TableCellData[] = [];

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const oldIdx = r * cols + c;
                    const oldV2Cell = existingV2[oldIdx] || { content: '', rowSpan: 1, colSpan: 1, isMerged: false };

                    if (c === targetCol) {
                        if (r === targetRow) {
                            // Target cell: split into splitColCount individual cells
                            newCellData.push(cellData[oldIdx] || '');
                            newCellColors.push(cellColors[oldIdx]);
                            newCellStyles.push(cellStyles[oldIdx]);
                            newV2.push({ content: cellData[oldIdx] || '', rowSpan: 1, colSpan: 1, isMerged: false });

                            for (let k = 0; k < colsToAdd; k++) {
                                newCellData.push('');
                                newCellColors.push(undefined);
                                newCellStyles.push(undefined);
                                newV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });
                            }
                        } else {
                            // Other rows: master cell spans all new sub-columns
                            newCellData.push(cellData[oldIdx] || '');
                            newCellColors.push(cellColors[oldIdx]);
                            newCellStyles.push(cellStyles[oldIdx]);

                            // Check if this cell already has a colSpan from prior merge
                            const existingColSpan = oldV2Cell.isMerged ? 1 : (oldV2Cell.colSpan || 1);
                            newV2.push({
                                content: cellData[oldIdx] || '',
                                rowSpan: oldV2Cell.isMerged ? 1 : (oldV2Cell.rowSpan || 1),
                                colSpan: oldV2Cell.isMerged ? 1 : (existingColSpan + colsToAdd),
                                isMerged: oldV2Cell.isMerged,
                            });

                            // Slave cells for the new sub-columns (hidden via isMerged)
                            for (let k = 0; k < colsToAdd; k++) {
                                newCellData.push('');
                                newCellColors.push(undefined);
                                newCellStyles.push(undefined);
                                newV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: true });
                            }
                        }
                    } else {
                        // Non-target columns: check if this cell spans across targetCol
                        newCellData.push(cellData[oldIdx] || '');
                        newCellColors.push(cellColors[oldIdx]);
                        newCellStyles.push(cellStyles[oldIdx]);

                        if (!oldV2Cell.isMerged && c < targetCol && c + (oldV2Cell.colSpan || 1) > targetCol) {
                            // This cell spans across targetCol - extend its colSpan
                            newV2.push({
                                ...oldV2Cell,
                                content: cellData[oldIdx] || '',
                                colSpan: (oldV2Cell.colSpan || 1) + colsToAdd,
                            });
                        } else {
                            newV2.push({ ...oldV2Cell, content: cellData[oldIdx] || '' });
                        }
                    }
                }
            }

            cellData = newCellData;
            cellColors = newCellColors;
            cellStyles = newCellStyles;
            existingV2 = newV2;
        }

        // ── Row Split (splitRowCount > 1) ──
        // Adds rows to grid, but only target column gets individual cells;
        // other columns' cells at the split position get rowSpan to look unchanged.
        if (splitRowCount > 1) {
            const rowsToAdd = splitRowCount - 1;
            const oldRowHeight = rowHeights[targetRow];
            const newSubHeight = oldRowHeight / splitRowCount;

            // Update row heights
            const newRowHeights = [...rowHeights];
            newRowHeights.splice(targetRow, 1, ...Array(splitRowCount).fill(newSubHeight));
            rowHeights = newRowHeights;

            const adjustedCols = newCols;

            // First, check cells ABOVE targetRow that span across it
            // If a cell from an earlier row spans into/past targetRow, it needs rowSpan extended
            for (let r = 0; r < targetRow; r++) {
                for (let c = 0; c < adjustedCols; c++) {
                    const idx = r * adjustedCols + c;
                    const v2Cell = existingV2[idx];
                    if (!v2Cell || v2Cell.isMerged) continue;

                    // Does this cell span across the insertion point?
                    if (r + (v2Cell.rowSpan || 1) > targetRow) {
                        existingV2[idx] = {
                            ...v2Cell,
                            rowSpan: (v2Cell.rowSpan || 1) + rowsToAdd,
                        };
                    }
                }
            }

            // Update cells IN targetRow:
            // Non-target columns should get rowSpan extended to cover new rows
            for (let c = 0; c < adjustedCols; c++) {
                const idx = targetRow * adjustedCols + c;
                const v2Cell = existingV2[idx];
                if (!v2Cell || v2Cell.isMerged) continue;

                // Check if this column is part of the split target area
                const isTargetArea = (splitColCount > 1)
                    ? (c >= targetCol && c < targetCol + splitColCount)
                    : (c === targetCol);

                if (!isTargetArea) {
                    // Non-target column: extend rowSpan to cover new rows
                    existingV2[idx] = {
                        ...v2Cell,
                        rowSpan: (v2Cell.rowSpan || 1) + rowsToAdd,
                    };
                }
            }

            // Insert new rows of data after targetRow
            const endOfTargetRow = (targetRow + 1) * adjustedCols;
            const newRowData: string[] = [];
            const newRowColors: (string | undefined)[] = [];
            const newRowStyles: (Record<string, any> | undefined)[] = [];
            const newRowV2: TableCellData[] = [];

            for (let k = 0; k < rowsToAdd; k++) {
                for (let c = 0; c < adjustedCols; c++) {
                    newRowData.push('');
                    newRowColors.push(undefined);
                    newRowStyles.push(undefined);

                    const isTargetArea = (splitColCount > 1)
                        ? (c >= targetCol && c < targetCol + splitColCount)
                        : (c === targetCol);

                    if (isTargetArea) {
                        // Target column area: individual cells
                        newRowV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });
                    } else {
                        // Non-target column: slave cell (hidden by the master's rowSpan above)
                        newRowV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: true });
                    }
                }
            }

            cellData.splice(endOfTargetRow, 0, ...newRowData);
            cellColors.splice(endOfTargetRow, 0, ...newRowColors);
            cellStyles.splice(endOfTargetRow, 0, ...newRowStyles);
            existingV2.splice(endOfTargetRow, 0, ...newRowV2);

            newRows = rows + rowsToAdd;
        }

        // Build legacy spans from V2
        const legacySpans = existingV2.map(cell => ({
            rowSpan: cell.isMerged ? 0 : cell.rowSpan,
            colSpan: cell.isMerged ? 0 : cell.colSpan,
        }));

        // Build update
        const targetEl: DrawElement = {
            ...el,
            tableRows: newRows,
            tableCols: newCols,
            tableColWidths: colWidths,
            tableRowHeights: rowHeights,
            tableCellData: cellData,
            tableCellColors: cellColors,
            tableCellStyles: cellStyles,
            tableCellSpans: legacySpans,
            tableCellDataV2: existingV2,
            tableRowColWidths: undefined,
        };

        const nextElements = drawElements.map(it => it.id === el.id ? targetEl : it);
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
        setSelectedCellIndices([]);
    };

    const handleMergeCells = (selectedEl: DrawElement) => {
        if (!selectedEl.tableCols || !selectedEl.tableRows || selectedCellIndices.length < 2) return;

        const rows = selectedEl.tableRows;
        const cols = selectedEl.tableCols;

        // 렌더러는 항상 uniform grid(rows×cols)를 사용하므로 flatIdx → (r,c) 매핑은 flatIdxToRowCol 사용
        const coords = selectedCellIndices.map(idx => {
            const { r, c } = flatIdxToRowCol(idx, cols);
            return { r, c, flatIdx: idx };
        });
        if (!coords.length) return;

        // 모든 병합을 V2(rowSpan/colSpan) 방식으로 통일 (가로/세로/사각형 모두)
        const minRow = Math.min(...coords.map(c => c.r));
        const maxRow = Math.max(...coords.map(c => c.r));
        const minCol = Math.min(...coords.map(c => c.c));
        const maxCol = Math.max(...coords.map(c => c.c));

        const rowSpanVal = maxRow - minRow + 1;
        const colSpanVal = maxCol - minCol + 1;

        let v2Cells = deepCopyCells(getV2Cells(selectedEl));
        const totalCells = rows * cols;
        while (v2Cells.length < totalCells) {
            v2Cells.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });
        }

        const masterFlatIdx = rowColToFlatIdx(minRow, minCol, cols);

        // 병합된 영역의 내용: 좌상단 셀 내용 사용 (기존 master 유지)
        v2Cells[masterFlatIdx] = {
            ...v2Cells[masterFlatIdx],
            rowSpan: rowSpanVal,
            colSpan: colSpanVal,
            isMerged: false,
        };

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const idx = rowColToFlatIdx(r, c, cols);
                if (idx === masterFlatIdx) continue;
                v2Cells[idx] = {
                    ...v2Cells[idx],
                    rowSpan: 1,
                    colSpan: 1,
                    isMerged: true,
                };
            }
        }

        const nextSpans = v2Cells.map(cell => ({
            rowSpan: cell.isMerged ? 0 : cell.rowSpan,
            colSpan: cell.isMerged ? 0 : cell.colSpan,
        }));

        const targetEl = {
            ...selectedEl,
            tableCellDataV2: v2Cells,
            tableCellSpans: nextSpans,
            tableRowColWidths: undefined, // jagged 구조 제거, uniform grid만 사용
        };
        const nextElements = drawElements.map(el => el.id === selectedEl.id ? targetEl : el);
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
        setSelectedCellIndices([]);
    };

    const handleSplitCells = (selectedEl: DrawElement) => {
        if (!selectedEl.tableCols || !selectedCellIndices.length || isLocked) return;

        const cols = selectedEl.tableCols;
        const cellIdx = selectedCellIndices[0];

        // Check if the selected cell is a merged master (V2 structure)
        const v2Cells = getV2Cells(selectedEl);
        const masterCell = v2Cells[cellIdx];

        if (masterCell && !masterCell.isMerged && (masterCell.rowSpan > 1 || masterCell.colSpan > 1)) {
            // This is a merged master cell → Unmerge it
            const newV2 = deepCopyCells(v2Cells);
            const { r: masterRow, c: masterCol } = flatIdxToRowCol(cellIdx, cols);

            // Reset master
            newV2[cellIdx] = { ...newV2[cellIdx], rowSpan: 1, colSpan: 1 };

            // Restore slave cells
            for (let r = masterRow; r < masterRow + masterCell.rowSpan; r++) {
                for (let c = masterCol; c < masterCol + masterCell.colSpan; c++) {
                    const slaveIdx = rowColToFlatIdx(r, c, cols);
                    if (slaveIdx === cellIdx) continue;
                    newV2[slaveIdx] = { ...newV2[slaveIdx], isMerged: false, rowSpan: 1, colSpan: 1 };
                }
            }

            saveV2Cells(selectedEl.id, newV2);
            setSelectedCellIndices([]);
            return;
        }

        // Also check legacy tableCellSpans for backward compat
        const legacySpan = selectedEl.tableCellSpans?.[cellIdx];
        if (legacySpan && legacySpan.rowSpan > 1) {
            // Unmerge via legacy spans
            const nextSpans = [...(selectedEl.tableCellSpans || [])];
            const { r: masterRow, c: masterCol } = flatIdxToRowCol(cellIdx, cols);

            for (let r = masterRow; r < masterRow + legacySpan.rowSpan; r++) {
                for (let c = masterCol; c < masterCol + (legacySpan.colSpan || 1); c++) {
                    const idx = rowColToFlatIdx(r, c, cols);
                    nextSpans[idx] = { rowSpan: 1, colSpan: 1 };
                }
            }

            const targetEl = {
                ...selectedEl,
                tableCellSpans: nextSpans,
                tableCellDataV2: undefined, // Reset V2 to re-derive
                tableRowColWidths: undefined,
            };
            const nextElements = drawElements.map(el => el.id === selectedEl.id ? targetEl : el);
            update({ drawElements: nextElements });
            syncUpdate({ drawElements: nextElements });
            saveHistory(nextElements);
            setSelectedCellIndices([]);
            return;
        }

        // No existing merge → Open split dialog
        setSplitTarget({ elId: selectedEl.id, cellIdx });
        setSplitRows(2); // Default to horizontal split
        setSplitCols(1);
        setShowSplitDialog(true);
    };





    // Entity dimensions from page size/orientation (캔버스가 70%이므로 entityWidth = canvasWidth/0.7)
    const MIN_CANVAS_WIDTH = 794; // A4 너비 - 이하일 때만 스케일 (B4/A3 등 실제 크기 유지)
    const CANVAS_WIDTH_RATIO = 0.7; // 왼쪽 캔버스가 entity의 70%
    const FIXED_TOP_HEIGHT = 180; // 헤더+메타+툴바 등 상단 고정 영역
    const sizeKey: (typeof PAGE_SIZE_OPTIONS)[number] =
        screen.pageSize && PAGE_SIZE_OPTIONS.includes(screen.pageSize as any) ? screen.pageSize! : 'A4';
    const preset = PAGE_SIZE_PRESETS[sizeKey];
    const orientation = screen.pageOrientation || 'portrait';
    let canvasW = orientation === 'landscape' ? preset.height : preset.width;
    let canvasH = orientation === 'landscape' ? preset.width : preset.height;
    if (canvasW < MIN_CANVAS_WIDTH) {
        const scale = MIN_CANVAS_WIDTH / canvasW;
        canvasW = MIN_CANVAS_WIDTH;
        canvasH = Math.round(canvasH * scale);
    }
    const entityWidth = Math.ceil(canvasW / CANVAS_WIDTH_RATIO);
    const entityHeight = canvasH + FIXED_TOP_HEIGHT;

    return (
        <div
            ref={containerRef}
            className={`transition-all group relative overflow-visible ${isLockedByOther ? 'nodrag' : ''}`}
            style={{ width: entityWidth, height: entityHeight }}
        >
            <EntityLockBadge entityId={screen.id} />
            <div
                ref={nodeRef}
                className={`relative h-full w-full bg-white rounded-[15px] shadow-xl border-2 flex flex-col overflow-visible ${selected && !isExporting
                    ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                    : isLocked
                        ? 'border-gray-200 shadow-md'
                        : 'border-[#2c3e7c] shadow-blue-100'
                    }`}>
                {/* Lock Overlay */}
                <LockOverlay
                    isLocked={isLocked}
                    isLockedByOther={isLockedByOther}
                    lockedBy={lockedBy}
                    onDoubleClick={handleToggleLock}
                />

                {/* ── 1. Top Header Bar (ERD Style) ── */}
                {!canvasOnlyMode && (
                <ScreenHeader
                    screen={screen}
                    isLocked={isLocked}
                    isLockedByOther={isLockedByOther}
                    lockedBy={lockedBy}
                    update={update}
                    syncUpdate={syncUpdate}
                    onToggleLock={handleToggleLock}
                    onDelete={handleDelete}
                    showScreenOptionsPanel={showScreenOptionsPanel}
                    setShowScreenOptionsPanel={setShowScreenOptionsPanel}
                    screenOptionsRef={screenOptionsRef}
                />
                )}

                {/* ── 2. Meta Info Table (화면 설계용, 컴포넌트일 때 숨김) ── */}
                {!canvasOnlyMode && !screen.screenId?.startsWith('CMP-') && (
                <MetaInfoTable screen={screen} isLocked={isLocked} update={update} syncUpdate={syncUpdate} />
                )}

                {/* ── 3. Body Content: Toolbar full width, then Split Layout ── */}
                <div className="nodrag nopan flex-1 flex flex-col min-h-0 bg-white rounded-[15px]" onMouseDown={(e) => e.stopPropagation()}>

                    {/* Drawing Toolbar - Full width (100%) */}
                    {!canvasOnlyMode && !isLocked && (
                        <div
                            className="nodrag w-full flex items-center gap-1 p-1 bg-white/80 border-b border-gray-200 shadow-sm z-[200] rounded-t-[15px] overflow-x-auto custom-scrollbar"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                                    <div className="flex items-center gap-1 flex-1 min-w-max px-1">
                                            {/* Undo/Redo Controls */}
                                            <div className="flex items-center gap-0.5 border-l border-gray-200 ml-1">
                                                <PremiumTooltip label="되돌리기 (Ctrl+Z)">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); undo(); }}
                                                        disabled={history.past.length <= 1}
                                                        className={`p-2 rounded-lg transition-colors ${history.past.length <= 1 ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-500'}`}
                                                    >
                                                        <Undo2 size={18} />
                                                    </button>
                                                </PremiumTooltip>
                                                <PremiumTooltip label="다시실행 (Ctrl+Y)">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); redo(); }}
                                                        disabled={history.future.length === 0}
                                                        className={`p-2 rounded-lg transition-colors ${history.future.length === 0 ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-500'}`}
                                                    >
                                                        <Redo2 size={18} />
                                                    </button>
                                                </PremiumTooltip>
                                            </div>

                                            <div className="flex items-center gap-1 animate-in slide-in-from-left-1 duration-200">
                                                <div className="flex items-center gap-0.5 border-r border-gray-200 pr-1 mr-1">
                                                    <PremiumTooltip label="선택" dotColor="#3b82f6">
                                                        <button
                                                            onClick={() => setActiveTool('select')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'select' ? 'bg-blue-100 text-blue-600' : 'hover:bg-blue-50 text-gray-500'}`}
                                                        >
                                                            <MousePointer2 size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                </div>
                                                <div className="flex items-center gap-0.5">
                                                    <div className="relative" ref={tablePickerRef}>
                                                        <PremiumTooltip label="표 삽입">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (!showTablePicker) {
                                                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                        const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                        setTablePickerPos({ x: flowPos.x, y: flowPos.y });
                                                                    }
                                                                    setShowTablePicker(!showTablePicker);
                                                                    setTablePickerHover(null);
                                                                }}
                                                                className={`p-2 rounded-lg transition-colors ${showTablePicker ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                            >
                                                                <Table2 size={18} />
                                                            </button>
                                                        </PremiumTooltip>
                                                        {showTablePicker && (() => {
                                                            const screenPos = flowToScreenPosition({ x: tablePickerPos.x, y: tablePickerPos.y });
                                                            return createPortal(
                                                            <div
                                                                data-table-picker-portal
                                                                className="nodrag nopan fixed bg-white border border-gray-200 rounded-xl shadow-2xl p-3 z-[9000] animate-in fade-in zoom-in duration-150 origin-top-left"
                                                                style={{
                                                                    left: screenPos.x,
                                                                    top: screenPos.y,
                                                                    transform: `scale(${0.85 * zoom})`,
                                                                }}
                                                                onMouseLeave={() => setTablePickerHover(null)}
                                                            >
                                                                <div
                                                                    className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2 cursor-grab active:cursor-grabbing group/header"
                                                                    onMouseDown={handleTablePickerHeaderMouseDown}
                                                                    title="드래그하여 이동"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                                                                        <Table2 size={12} className="text-[#2c3e7c]" />
                                                                        <span className="text-[11px] font-bold text-gray-600">표 삽입</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col gap-[2px]">
                                                                    {Array.from({ length: 8 }).map((_, rIdx) => (
                                                                        <div key={rIdx} className="flex gap-[2px]">
                                                                            {Array.from({ length: 8 }).map((_, cIdx) => {
                                                                                const isHighlighted = tablePickerHover && rIdx <= tablePickerHover.r && cIdx <= tablePickerHover.c;
                                                                                return (
                                                                                    <div
                                                                                        key={cIdx}
                                                                                        className={`w-[18px] h-[18px] border rounded-[2px] cursor-pointer transition-all duration-75 ${isHighlighted
                                                                                            ? 'bg-blue-500 border-blue-600 shadow-sm'
                                                                                            : 'bg-gray-50 border-gray-300 hover:border-gray-400'
                                                                                            }`}
                                                                                        onMouseEnter={() => setTablePickerHover({ r: rIdx, c: cIdx })}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            e.preventDefault();
                                                                                            const rows = rIdx + 1;
                                                                                            const cols = cIdx + 1;
                                                                                            const cw = canvasRef.current?.clientWidth ?? 0;
                                                                                            const ch = canvasRef.current?.clientHeight ?? 0;
                                                                                            const cx = cw ? cw / 2 - (cols * 60) / 2 : 50;
                                                                                            const cy = ch ? ch / 2 - (rows * 30) / 2 : 50;
                                                                                            const newId = `draw_${Date.now()}`;
                                                                                            const tableEl: DrawElement = {
                                                                                                id: newId,
                                                                                                type: 'table',
                                                                                                x: Math.max(10, cx),
                                                                                                y: Math.max(10, cy),
                                                                                                width: Math.max(200, cols * 60),
                                                                                                height: Math.max(80, rows * 30),
                                                                                                fill: '#ffffff',
                                                                                                stroke: '#2c3e7c',
                                                                                                strokeWidth: 1,
                                                                                                zIndex: drawElements.length + 1,
                                                                                                fontSize: 14,
                                                                                                color: '#333333',
                                                                                                tableRows: rows,
                                                                                                tableCols: cols,
                                                                                                tableCellData: Array(rows * cols).fill(''),
                                                                                                tableColWidths: Array(cols).fill(100 / cols),
                                                                                                tableRowHeights: Array(rows).fill(100 / rows)
                                                                                            };
                                                                                            const nextElements = [...drawElements, tableEl];
                                                                                            update({ drawElements: nextElements });
                                                                                            syncUpdate({ drawElements: nextElements });
                                                                                            setSelectedElementIds([newId]);
                                                                                            setShowTablePicker(false);
                                                                                            setTablePickerHover(null);
                                                                                        }}
                                                                                    />
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <div className="mt-2 text-center text-[10px] font-medium text-gray-500 h-4">
                                                                    {tablePickerHover
                                                                        ? <span className="text-blue-600 font-bold">{tablePickerHover.r + 1} × {tablePickerHover.c + 1} 표 삽입</span>
                                                                        : '행 × 열 선택'
                                                                    }
                                                                </div>
                                                            </div>,
                                                            getPanelPortalRoot()
                                                        );
                                                        })()}
                                                        {showImageStylePanel && (() => {
                                                            const imgEl = drawElements.find(el => selectedElementIds.includes(el.id) && el.type === 'image');
                                                            if (!imgEl || imgEl.type !== 'image') return null;
                                                            return createPortal(
                                                                <div data-image-style-panel>
                                                                    <ImageStylePanel
                                                                        element={imgEl}
                                                                        onUpdate={(u) => updateElement(imgEl.id, u)}
                                                                        onClose={() => { setShowImageStylePanel(false); setImageCropMode(false); }}
                                                                        position={imageStylePanelPos}
                                                                        onPositionChange={setImageStylePanelPos}
                                                                        zoom={zoom}
                                                                        screenToFlowPosition={screenToFlowPosition}
                                                                        flowToScreenPosition={flowToScreenPosition}
                                                                        onDragStart={() => { isDraggingImageStylePanelRef.current = true; }}
                                                                        onDragEnd={() => { isDraggingImageStylePanelRef.current = false; }}
                                                                        isCropMode={imageCropMode}
                                                                        onCropModeToggle={setImageCropMode}
                                                                    />
                                                                </div>,
                                                                getPanelPortalRoot()
                                                            );
                                                        })()}
                                                    </div>
                                                    {/* Table Panel Button — shown only when a table is selected */}
                                                    {(() => {
                                                        const selEl = drawElements.find(el => selectedElementIds.includes(el.id));
                                                        if (!selEl || selEl.type !== 'table') return null;
                                                        return <div className="flex items-center gap-1 border-l border-gray-200 pl-1 ml-1">
                                                            <PremiumTooltip label="표 설정">
                                                                <button
                                                                    onClick={(e) => {
                                                                        if (!showTablePanel) {
                                                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                            const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                            setTablePanelPos({ x: flowPos.x, y: flowPos.y });
                                                                        }
                                                                        setShowTablePanel(prev => !prev);
                                                                    }}
                                                                    className={`p-2 rounded-lg transition-colors ${showTablePanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                                >
                                                                    <Settings2 size={18} />
                                                                </button>
                                                            </PremiumTooltip>
                                                            <PremiumTooltip label="셀 배경색">
                                                                <button
                                                                    onClick={() => {
                                                                        setShowTablePanel(true);
                                                                    }}
                                                                    className={`p-2 rounded-lg transition-colors ${showTablePanel && selectedCellIndices.length > 0 ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                                >
                                                                    <Palette size={18} />
                                                                </button>
                                                            </PremiumTooltip>
                                                        </div>
                                                            ;
                                                    })()}
                                                    {/* 이미지 스타일 버튼 - 이미지 선택 시 표시 */}
                                                    {(() => {
                                                        const selEl = drawElements.find(el => selectedElementIds.includes(el.id));
                                                        if (!selEl || selEl.type !== 'image') return null;
                                                        return (
                                                            <div className="flex items-center gap-1 border-l border-gray-200 pl-1 ml-1">
                                                                <PremiumTooltip label="이미지 스타일">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                            const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                            setImageStylePanelPos({ x: flowPos.x, y: flowPos.y });
                                                                            const willOpen = !showImageStylePanel;
                                                                            setShowImageStylePanel(prev => !prev);
                                                                            if (willOpen) setImageCropMode(true);
                                                                        }}
                                                                        className={`p-2 rounded-lg transition-colors ${showImageStylePanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                                    >
                                                                        <Crop size={18} />
                                                                    </button>
                                                                </PremiumTooltip>
                                                            </div>
                                                        );
                                                    })()}
                                                    <PremiumTooltip label="사각형">
                                                        <button
                                                            onClick={() => setActiveTool('rect')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'rect' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        >
                                                            <Square size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                    <PremiumTooltip label="원형">
                                                        <button
                                                            onClick={() => setActiveTool('circle')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'circle' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        >
                                                            <Circle size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                    <PremiumTooltip label="텍스트">
                                                        <button
                                                            onClick={() => setActiveTool('text')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'text' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        >
                                                            <Type size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                    <PremiumTooltip label="이미지 삽입">
                                                        <button
                                                            onClick={() => imageInputRef.current?.click()}
                                                            className="p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-500"
                                                        >
                                                            <ImageIcon size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                    <input
                                                        ref={imageInputRef}
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file || !file.type.startsWith('image/')) return;
                                                            const cw = canvasRef.current?.clientWidth ?? 400;
                                                            const ch = canvasRef.current?.clientHeight ?? 300;
                                                            const w = 200;
                                                            const h = 150;
                                                            const newId = `draw_${Date.now()}`;

                                                            let imageUrl: string;
                                                            try {
                                                                imageUrl = await uploadImage(file);
                                                            } catch {
                                                                imageUrl = await new Promise<string>((resolve, reject) => {
                                                                    const reader = new FileReader();
                                                                    reader.onload = () => resolve(reader.result as string);
                                                                    reader.onerror = reject;
                                                                    reader.readAsDataURL(file);
                                                                });
                                                            }

                                                            const imgEl: DrawElement = {
                                                                id: newId,
                                                                type: 'image',
                                                                x: Math.max(10, cw / 2 - w / 2),
                                                                y: Math.max(10, ch / 2 - h / 2),
                                                                width: w,
                                                                height: h,
                                                                zIndex: drawElements.length + 1,
                                                                imageUrl,
                                                            };
                                                            const nextElements = [...drawElements, imgEl];
                                                            update({ drawElements: nextElements });
                                                            syncUpdate({ drawElements: nextElements });
                                                            saveHistory(nextElements);
                                                            setSelectedElementIds([newId]);
                                                            e.target.value = '';
                                                        }}
                                                    />
                                                    <div className="w-px h-6 bg-gray-200 mx-1" />
                                                    <PremiumTooltip label="기능 번호">
                                                        <button
                                                            onClick={() => {
                                                                // If already select tool, just set tool. 
                                                                // But user wants "auto-add" when clicking this button.
                                                                const existingFuncNos = drawElements.filter(el => el.type === 'func-no');
                                                                let nextNo = 1;
                                                                let nextX = 20;
                                                                let nextY = 20;

                                                                if (existingFuncNos.length > 0) {
                                                                    const numbers = existingFuncNos
                                                                        .map(el => parseInt(el.text || '0'))
                                                                        .filter(n => !isNaN(n));
                                                                    if (numbers.length > 0) {
                                                                        nextNo = Math.max(...numbers) + 1;
                                                                    }

                                                                    // Find a position that doesn't overlap with existing func-nos
                                                                    // We'll try to find the "last" added func-no and offset from it, 
                                                                    // or just keep shifting until we find a clear spot.
                                                                    const lastFuncNo = existingFuncNos[existingFuncNos.length - 1];
                                                                    nextX = lastFuncNo.x + 30;
                                                                    nextY = lastFuncNo.y;

                                                                    // If we go too far right, move down and reset X
                                                                    if (nextX > 400) {
                                                                        nextX = 20;
                                                                        nextY += 40;
                                                                    }
                                                                }

                                                                const newId = `draw_${Date.now()}`;
                                                                const newElement: DrawElement = {
                                                                    id: newId,
                                                                    type: 'func-no',
                                                                    x: nextX,
                                                                    y: nextY,
                                                                    width: 24,
                                                                    height: 24,
                                                                    fill: '#ef4444',
                                                                    stroke: '#ffffff',
                                                                    strokeWidth: 2,
                                                                    zIndex: drawElements.length + 1,
                                                                    text: nextNo.toString(),
                                                                    fontSize: 12,
                                                                    color: '#ffffff',
                                                                    borderRadius: 12,
                                                                };

                                                                const nextElements = [...drawElements, newElement];
                                                                update({ drawElements: nextElements });
                                                                syncUpdate({ drawElements: nextElements });
                                                                saveHistory(nextElements);
                                                                setSelectedElementIds([newId]);
                                                                setActiveTool('select');
                                                            }}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'func-no' ? 'bg-red-100 text-red-600' : 'hover:bg-red-50 text-gray-500'}`}
                                                        >
                                                            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ${activeTool === 'func-no' ? 'bg-red-600 text-white' : 'bg-red-500 text-white'}`}>N</div>
                                                        </button>
                                                    </PremiumTooltip>
                                                    <div className="relative" ref={gridPanelAnchorRef}>
                                                        <PremiumTooltip label="격자 보기">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (!showGridPanel) {
                                                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                        const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                        setGridPanelPos({ x: flowPos.x, y: flowPos.y });
                                                                    }
                                                                    setShowGridPanel(prev => !prev);
                                                                }}
                                                                className={`p-2 rounded-lg transition-colors ${showGridPanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                            >
                                                                <Grid3x3 size={18} />
                                                            </button>
                                                        </PremiumTooltip>
                                                        {showGridPanel && createPortal(
                                                            (() => {
                                                                const screenPos = flowToScreenPosition({ x: gridPanelPos.x, y: gridPanelPos.y });
                                                                return (
                                                            <div
                                                                data-grid-panel
                                                                className="nodrag nopan floating-panel fixed bg-white border border-gray-200 rounded-xl shadow-2xl p-2 z-[9000] flex flex-col animate-in fade-in zoom-in origin-top-left"
                                                                style={{
                                                                    left: screenPos.x,
                                                                    top: screenPos.y,
                                                                    transform: `scale(${0.85 * zoom})`,
                                                                }}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                            >
                                                                <div
                                                                    className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2 cursor-grab active:cursor-grabbing group/header"
                                                                    onMouseDown={handleGridPanelHeaderMouseDown}
                                                                    title="드래그하여 이동"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                                                                        <Grid3x3 size={12} className="text-[#2c3e7c]" />
                                                                        <span className="text-[11px] font-bold text-gray-600">격자 보기</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between py-2 mb-2 border-b border-gray-100">
                                                                    <span className="text-[11px] font-medium text-gray-600">격자 활성화</span>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const next = !(screen.guideLinesVisible !== false);
                                                                            update({ guideLinesVisible: next });
                                                                            syncUpdate({ guideLinesVisible: next });
                                                                        }}
                                                                        className={`px-3 py-1 text-[11px] rounded-lg font-medium transition-colors ${screen.guideLinesVisible !== false ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}
                                                                    >
                                                                        {screen.guideLinesVisible !== false ? 'ON' : 'OFF'}
                                                                    </button>
                                                                </div>
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[10px] font-medium text-gray-500">격자 추가</span>
                                                                    <div className="flex items-center gap-1">
                                                                <PremiumTooltip label="세로줄 추가">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            addGuideLine('vertical');
                                                                        }}
                                                                        className="px-2 py-1 text-[11px] rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700"
                                                                    >
                                                                        세로줄 추가
                                                                    </button>
                                                                </PremiumTooltip>
                                                                <PremiumTooltip label="가로줄 추가">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            addGuideLine('horizontal');
                                                                        }}
                                                                        className="px-2 py-1 text-[11px] rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700"
                                                                    >
                                                                        가로줄 추가
                                                                    </button>
                                                                </PremiumTooltip>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                                );
                                                            })(),
                                                            getPanelPortalRoot()
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {selectedElementIds.length > 0 && (
                                                <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1 animate-in fade-in duration-200">
                                                    <div className="flex gap-0.5 bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                                                        {(['left', 'center', 'right'] as const).map((align) => (
                                                            <PremiumTooltip key={align} label={textSelectionRect ? `텍스트 ${align === 'left' ? '왼쪽' : align === 'right' ? '오른쪽' : '중앙'} 정렬` : `캔버스 ${align === 'left' ? '왼쪽' : align === 'right' ? '오른쪽' : '중앙'} 정렬`}>
                                                                <button
                                                                    onMouseDown={(e) => e.preventDefault()}
                                                                    onClick={() => {
                                                                        if (textSelectionRect) {
                                                                            const nextElements = drawElements.map(el =>
                                                                                selectedElementIds.includes(el.id) ? { ...el, textAlign: align } : el
                                                                            );
                                                                            update({ drawElements: nextElements });
                                                                            syncUpdate({ drawElements: nextElements });
                                                                        } else if (canvasRef.current) {
                                                                            const cw = canvasRef.current.clientWidth;
                                                                            const nextElements = drawElements.map(el => {
                                                                                if (!selectedElementIds.includes(el.id)) return el;
                                                                                let nx = el.x;
                                                                                if (align === 'left') nx = 10;
                                                                                else if (align === 'center') nx = (cw / 2) - (el.width / 2);
                                                                                else if (align === 'right') nx = cw - el.width - 10;
                                                                                return { ...el, x: nx };
                                                                            });
                                                                            update({ drawElements: nextElements });
                                                                            syncUpdate({ drawElements: nextElements });
                                                                        }
                                                                    }}
                                                                    className={`p-1.5 rounded-md transition-all ${(textSelectionRect && (drawElements.find(el => el.id === selectedElementIds[0])?.textAlign === align || (align === 'center' && !drawElements.find(el => el.id === selectedElementIds[0])?.textAlign)))
                                                                        ? 'bg-white shadow-sm text-blue-600'
                                                                        : 'text-gray-400 hover:text-gray-600'
                                                                        }`}
                                                                >
                                                                    {align === 'left' ? <AlignHorizontalJustifyStart size={16} /> : align === 'right' ? <AlignHorizontalJustifyEnd size={16} /> : <AlignHorizontalJustifyCenter size={16} />}
                                                                </button>
                                                            </PremiumTooltip>
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-0.5 bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                                                        {(['top', 'middle', 'bottom'] as const).map((vAlign) => (
                                                            <PremiumTooltip key={vAlign} label={textSelectionRect ? `텍스트 ${vAlign === 'top' ? '상단' : vAlign === 'bottom' ? '하단' : '중앙'} 정렬` : `캔버스 ${vAlign === 'top' ? '상단' : vAlign === 'bottom' ? '하단' : '중앙'} 정렬`}>
                                                                <button
                                                                    onMouseDown={(e) => e.preventDefault()}
                                                                    onClick={() => {
                                                                        if (textSelectionRect) {
                                                                            const nextElements = drawElements.map(el =>
                                                                                selectedElementIds.includes(el.id) ? { ...el, verticalAlign: vAlign } : el
                                                                            );
                                                                            update({ drawElements: nextElements });
                                                                            syncUpdate({ drawElements: nextElements });
                                                                        } else if (canvasRef.current) {
                                                                            const ch = canvasRef.current.clientHeight;
                                                                            const nextElements = drawElements.map(el => {
                                                                                if (!selectedElementIds.includes(el.id)) return el;
                                                                                let ny = el.y;
                                                                                if (vAlign === 'top') ny = 10;
                                                                                else if (vAlign === 'middle') ny = (ch / 2) - (el.height / 2);
                                                                                else if (vAlign === 'bottom') ny = ch - el.height - 10;
                                                                                return { ...el, y: ny };
                                                                            });
                                                                            update({ drawElements: nextElements });
                                                                            syncUpdate({ drawElements: nextElements });
                                                                        }
                                                                    }}
                                                                    className={`p-1.5 rounded-md transition-all ${(textSelectionRect && (drawElements.find(el => el.id === selectedElementIds[0])?.verticalAlign === vAlign || (vAlign === 'middle' && !drawElements.find(el => el.id === selectedElementIds[0])?.verticalAlign)))
                                                                        ? 'bg-white shadow-sm text-blue-600'
                                                                        : 'text-gray-400 hover:text-gray-600'
                                                                        }`}
                                                                >
                                                                    {vAlign === 'top' ? <AlignVerticalJustifyStart size={16} /> : vAlign === 'bottom' ? <AlignVerticalJustifyEnd size={16} /> : <AlignVerticalJustifyCenter size={16} />}
                                                                </button>
                                                            </PremiumTooltip>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Object-to-Object Alignment (2+ selected) */}
                                            {selectedElementIds.length >= 2 && (
                                                <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1 animate-in fade-in duration-200">
                                                    <div className="flex gap-0.5 bg-gradient-to-r from-indigo-50 to-blue-50 p-0.5 rounded-lg border border-indigo-100">
                                                        <PremiumTooltip label="객체 왼쪽 정렬">
                                                            <button
                                                                onClick={() => handleObjectAlign('align-left')}
                                                                className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                            >
                                                                <AlignHorizontalJustifyStart size={16} />
                                                            </button>
                                                        </PremiumTooltip>
                                                        <PremiumTooltip label="객체 가로 중앙 정렬">
                                                            <button
                                                                onClick={() => handleObjectAlign('align-center-h')}
                                                                className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                            >
                                                                <AlignHorizontalJustifyCenter size={16} />
                                                            </button>
                                                        </PremiumTooltip>
                                                        <PremiumTooltip label="객체 오른쪽 정렬">
                                                            <button
                                                                onClick={() => handleObjectAlign('align-right')}
                                                                className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                            >
                                                                <AlignHorizontalJustifyEnd size={16} />
                                                            </button>
                                                        </PremiumTooltip>
                                                    </div>
                                                    <div className="flex gap-0.5 bg-gradient-to-r from-indigo-50 to-blue-50 p-0.5 rounded-lg border border-indigo-100">
                                                        <PremiumTooltip label="객체 상단 정렬">
                                                            <button
                                                                onClick={() => handleObjectAlign('align-top')}
                                                                className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                            >
                                                                <AlignVerticalJustifyStart size={16} />
                                                            </button>
                                                        </PremiumTooltip>
                                                        <PremiumTooltip label="객체 세로 중앙 정렬">
                                                            <button
                                                                onClick={() => handleObjectAlign('align-center-v')}
                                                                className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                            >
                                                                <AlignVerticalJustifyCenter size={16} />
                                                            </button>
                                                        </PremiumTooltip>
                                                        <PremiumTooltip label="객체 하단 정렬">
                                                            <button
                                                                onClick={() => handleObjectAlign('align-bottom')}
                                                                className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                            >
                                                                <AlignVerticalJustifyEnd size={16} />
                                                            </button>
                                                        </PremiumTooltip>
                                                    </div>
                                                    {selectedElementIds.length >= 3 && (
                                                        <div className="flex gap-0.5 bg-gradient-to-r from-purple-50 to-pink-50 p-0.5 rounded-lg border border-purple-100">
                                                            <PremiumTooltip label="가로 균등 분배">
                                                                <button
                                                                    onClick={() => handleObjectAlign('distribute-h')}
                                                                    className="p-1.5 rounded-md transition-all text-purple-400 hover:text-purple-600 hover:bg-white hover:shadow-sm"
                                                                >
                                                                    <AlignHorizontalDistributeCenter size={16} />
                                                                </button>
                                                            </PremiumTooltip>
                                                            <PremiumTooltip label="세로 균등 분배">
                                                                <button
                                                                    onClick={() => handleObjectAlign('distribute-v')}
                                                                    className="p-1.5 rounded-md transition-all text-purple-400 hover:text-purple-600 hover:bg-white hover:shadow-sm"
                                                                >
                                                                    <AlignVerticalDistributeCenter size={16} />
                                                                </button>
                                                            </PremiumTooltip>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* 그룹화 / 그룹화 해제 */}
                                            {selectedElementIds.length >= 1 && (() => {
                                                const selectedEls = drawElements.filter(el => selectedElementIds.includes(el.id));
                                                const hasGrouped = selectedEls.some(el => el.groupId != null);
                                                const groupEnabled = selectedElementIds.length >= 2 && !hasGrouped;
                                                const ungroupEnabled = hasGrouped;
                                                return (
                                                    <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1">
                                                        <PremiumTooltip label="객체 그룹화">
                                                            <button
                                                                onClick={() => handleGroup()}
                                                                disabled={!groupEnabled}
                                                                className={`p-2 rounded-lg transition-colors ${groupEnabled ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300 cursor-not-allowed'}`}
                                                            >
                                                                <Group size={18} />
                                                            </button>
                                                        </PremiumTooltip>
                                                        <PremiumTooltip label="그룹화 해제">
                                                            <button
                                                                onClick={() => handleUngroup()}
                                                                disabled={!ungroupEnabled}
                                                                className={`p-2 rounded-lg transition-colors ${ungroupEnabled ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300 cursor-not-allowed'}`}
                                                            >
                                                                <Ungroup size={18} />
                                                            </button>
                                                        </PremiumTooltip>
                                                    </div>
                                                );
                                            })()}

                                            <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1 animate-in fade-in duration-200">
                                                <PremiumTooltip label="색상 및 스타일">
                                                    <button
                                                        onClick={(e) => {
                                                            if (!showStylePanel) {
                                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                setStylePanelPos({ x: flowPos.x, y: flowPos.y });
                                                            }
                                                            setShowStylePanel(!showStylePanel);
                                                            setShowLayerPanel(false);
                                                        }}
                                                        className={`p-2 rounded-lg transition-colors ${showStylePanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                    >
                                                        <Palette size={18} />
                                                    </button>
                                                </PremiumTooltip>
                                                <PremiumTooltip label="레이어 순서">
                                                    <button
                                                        onClick={(e) => {
                                                            if (!showLayerPanel) {
                                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                setLayerPanelPos({ x: flowPos.x, y: flowPos.y });
                                                            }
                                                            setShowLayerPanel(!showLayerPanel);
                                                            setShowStylePanel(false);
                                                        }}
                                                        className={`p-2 rounded-lg transition-colors ${showLayerPanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                    >
                                                        <Layers size={18} />
                                                    </button>
                                                </PremiumTooltip>
                                            </div>

                                    {/* Text Style Settings - same line as tools when text is selected */}
                                    {textSelectionRect && selectedElementIds.length > 0 && (() => {
                                        const el = drawElements.find(it => it.id === selectedElementIds[0]);
                                        if (!el) return null;
                                        return (
                                            <>
                                                <div className="w-px h-6 bg-gray-200 mx-1" />
                                                <div data-text-style-toolbar className="nodrag nopan flex items-center gap-2 bg-gray-50/80 rounded-lg px-2 py-1 animate-in fade-in duration-200" onMouseDown={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center gap-1.5 px-1 border-r border-gray-200 pr-2">
                                                        <Type size={12} className="text-gray-400" />
                                                        <input
                                                            type="number"
                                                            value={el.fontSize || 14}
                                                            onChange={(e) => updateElement(el.id, { fontSize: parseInt(e.target.value) || 12 })}
                                                            className="w-10 bg-transparent text-[11px] font-bold text-gray-700 outline-none"
                                                        />
                                                        <span className="text-[10px] text-gray-400">px</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 pl-1">
                                                        <div className="relative w-5 h-5 rounded-md border border-gray-200 overflow-hidden shadow-sm">
                                                            <input
                                                                type="color"
                                                                value={el.color || '#333333'}
                                                                onChange={(e) => {
                                                                    const color = e.target.value;
                                                                    const selection = window.getSelection();
                                                                    if (selection && !selection.isCollapsed) {
                                                                        document.execCommand('foreColor', false, color);
                                                                        const activeEl = document.activeElement as HTMLElement;
                                                                        if (activeEl && activeEl.contentEditable === 'true') {
                                                                            const evt = new Event('input', { bubbles: true });
                                                                            activeEl.dispatchEvent(evt);
                                                                        }
                                                                    } else {
                                                                        updateElement(el.id, { color });
                                                                    }
                                                                }}
                                                                className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                                                            />
                                                            <div className="w-full h-full" style={{ backgroundColor: el.color || '#333333' }} />
                                                        </div>
                                                        <div className="flex gap-1">
                                                            {['#333333', '#2c3e7c', '#dc2626', '#059669'].map(c => (
                                                                <button
                                                                    key={c}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        const selection = window.getSelection();
                                                                        if (selection && !selection.isCollapsed) {
                                                                            document.execCommand('foreColor', false, c);
                                                                            const activeEl = document.activeElement as HTMLElement;
                                                                            if (activeEl && activeEl.contentEditable === 'true') {
                                                                                const evt = new Event('input', { bubbles: true });
                                                                                activeEl.dispatchEvent(evt);
                                                                            }
                                                                        } else {
                                                                            updateElement(el.id, { color: c });
                                                                        }
                                                                    }}
                                                                    className="w-3 h-3 rounded-full border border-gray-100 transition-transform hover:scale-110"
                                                                    style={{ backgroundColor: c }}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                    </div>
                        </div>
                    )}

                    {/* Left + Right pane row - flex-1 so canvas grows with entity size */}
                    <div className="flex-1 flex min-h-0" style={{ minHeight: 500 }}>
                    {/* [LEFT PANE 100%] - Drawing Canvas (RightPane 초기화면설정/기능상세/관련테이블 제거) */}
                    <div className="w-full flex-shrink-0 min-w-0 flex flex-col bg-gray-50/10 overflow-hidden rounded-bl-[13px] rounded-br-[13px]">

                        {/* Drawing Canvas Area (canvas only) */}
                        <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col bg-white border-b border-gray-200"
                            style={{
                                backgroundImage: !isLocked ? 'radial-gradient(#d1d5db 1px, transparent 1px)' : 'none',
                                backgroundSize: '20px 20px'
                            }}
                        >
                            {/* Canvas Viewboard */}
                            <div
                                ref={canvasRef}
                                className="nodrag flex-1 relative overflow-visible outline-none cursor-crosshair h-full"
                                onMouseDown={handleCanvasMouseDown}
                                onMouseMove={handleCanvasMouseMove}
                                onMouseUp={handleCanvasMouseUp}
                                onMouseLeave={handleCanvasMouseUp}
                            >
                                    {/* Render Existing Elements */}
                                    {drawElements.map((el) => {
                                        const isSelected = selectedElementIds.includes(el.id);
                                        const isDraggingThis = draggingElementIds.includes(el.id);
                                        const rot = el.type === 'image' ? (el.imageRotation ?? 0) : 0;
                                        const previewPos = dragPreviewPositions?.[el.id];
                                        const commonStyle: React.CSSProperties = {
                                            position: 'absolute',
                                            left: previewPos?.x ?? el.x,
                                            top: previewPos?.y ?? el.y,
                                            width: el.width,
                                            height: el.height,
                                            zIndex: isDraggingThis ? 9999 : (el.zIndex || 1),
                                            transition: (isDrawing || isMoving) ? 'none' : 'all 0.1s ease',
                                            pointerEvents: isDrawing ? 'none' : 'auto',
                                            opacity: el.opacity !== undefined ? el.opacity : 1,
                                            ...(el.type === 'image' && rot !== 0
                                                ? { transform: `rotate(${rot}deg)`, transformOrigin: 'center center' }
                                                : {}),
                                        };

                                        return (
                                            <div
                                                key={el.id}
                                                style={commonStyle}
                                                onMouseDown={(e) => handleElementMouseDown(el.id, e)}
                                                onDoubleClick={(e) => handleElementDoubleClick(el.id, e)}
                                                className={`group-canvas-element ${isSelected ? 'ring-2 ring-offset-2' : ''} ${!isLocked && activeTool === 'select' ? 'cursor-move' : ''}`}
                                                data-element-id={el.id}
                                            >
                                                {el.type === 'rect' && (
                                                    <div className={`w-full h-full shadow-sm relative flex overflow-hidden ${el.verticalAlign === 'top' ? 'items-start' : el.verticalAlign === 'bottom' ? 'items-end' : 'items-center'
                                                        } ${el.textAlign === 'left' ? 'justify-start' : el.textAlign === 'right' ? 'justify-end' : 'justify-center'
                                                        }`} style={{ backgroundColor: hexToRgba(el.fill || '#ffffff', el.fillOpacity ?? 1), borderColor: hexToRgba(el.stroke || '#000000', el.strokeOpacity ?? 1), borderWidth: el.strokeWidth ?? 2, borderStyle: el.strokeStyle ?? 'solid', borderRadius: el.borderRadius ?? 0 }}>
                                                        {(el.text || editingTextId === el.id) && (
                                                            <DrawTextComponent
                                                                element={el}
                                                                isLocked={isLocked}
                                                                isSelected={isSelected}
                                                                onUpdate={(updates) => updateElement(el.id, updates)}
                                                                onSelectionChange={setTextSelectionRect}
                                                                autoFocus={editingTextId === el.id}
                                                                className="px-2"
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                                {el.type === 'circle' && (
                                                    <div className={`w-full h-full shadow-sm relative flex overflow-hidden ${el.verticalAlign === 'top' ? 'items-start' : el.verticalAlign === 'bottom' ? 'items-end' : 'items-center'
                                                        } ${el.textAlign === 'left' ? 'justify-start' : el.textAlign === 'right' ? 'justify-end' : 'justify-center'
                                                        }`} style={{ backgroundColor: hexToRgba(el.fill || '#ffffff', el.fillOpacity ?? 1), borderColor: hexToRgba(el.stroke || '#000000', el.strokeOpacity ?? 1), borderWidth: el.strokeWidth ?? 2, borderStyle: el.strokeStyle ?? 'solid', borderRadius: el.borderRadius !== undefined ? el.borderRadius : '50%' }}>
                                                        {(el.text || editingTextId === el.id) && (
                                                            <DrawTextComponent
                                                                element={el}
                                                                isLocked={isLocked}
                                                                isSelected={isSelected}
                                                                onUpdate={(updates) => updateElement(el.id, updates)}
                                                                onSelectionChange={setTextSelectionRect}
                                                                autoFocus={editingTextId === el.id}
                                                                className="px-4"
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                                {el.type === 'text' && (
                                                    <DrawTextComponent
                                                        element={el}
                                                        isLocked={isLocked}
                                                        isSelected={isSelected}
                                                        onUpdate={(updates) => updateElement(el.id, updates)}
                                                        onSelectionChange={setTextSelectionRect}
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
                                                    <div
                                                        className="w-full h-full overflow-hidden relative"
                                                        style={{
                                                            cursor: editingTableId === el.id ? 'default' : 'move',
                                                            outline: editingTableId === el.id ? '2px solid #3b82f6' : 'none',
                                                            outlineOffset: '1px',
                                                            userSelect: editingTableId === el.id ? 'none' : 'auto',
                                                            borderRadius: `${el.tableBorderRadiusTopLeft ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusTopRight ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusBottomRight ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusBottomLeft ?? el.tableBorderRadius ?? 0}px`,
                                                        }}
                                                        onDoubleClick={(e) => {
                                                            if (isLocked) return;
                                                            e.stopPropagation();
                                                            setEditingTableId(el.id);
                                                            setSelectedCellIndices([]);
                                                            setEditingCellIndex(null);
                                                        }}
                                                        onClick={(e) => {
                                                            if (editingTableId === el.id && e.target === e.currentTarget) {
                                                                setEditingTableId(null);
                                                                setSelectedCellIndices([]);
                                                                setEditingCellIndex(null);
                                                            }
                                                        }}
                                                    >
                                                        {/* CSS Grid Table Rendering */}
                                                        <div
                                                            className="w-full h-full overflow-hidden"
                                                            style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: (() => {
                                                                    const cols = el.tableCols || 3;
                                                                    const widths = el.tableColWidths || Array(cols).fill(100 / cols);
                                                                    return widths.map(w => `${w}%`).join(' ');
                                                                })(),
                                                                gridTemplateRows: (() => {
                                                                    const rows = el.tableRows || 3;
                                                                    const heights = el.tableRowHeights || Array(rows).fill(100 / rows);
                                                                    return heights.map(h => `${h}%`).join(' ');
                                                                })(),
                                                                borderRadius: `${el.tableBorderRadiusTopLeft ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusTopRight ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusBottomRight ?? el.tableBorderRadius ?? 0}px ${el.tableBorderRadiusBottomLeft ?? el.tableBorderRadius ?? 0}px`,
                                                                borderTop: `${el.tableBorderTopWidth ?? el.strokeWidth ?? 1}px ${el.tableBorderTopStyle ?? 'solid'} ${el.tableBorderTop || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                                                                borderBottom: `${el.tableBorderBottomWidth ?? el.strokeWidth ?? 1}px ${el.tableBorderBottomStyle ?? 'solid'} ${el.tableBorderBottom || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                                                                borderLeft: `${el.tableBorderLeftWidth ?? el.strokeWidth ?? 1}px ${el.tableBorderLeftStyle ?? 'solid'} ${el.tableBorderLeft || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                                                                borderRight: `${el.tableBorderRightWidth ?? el.strokeWidth ?? 1}px ${el.tableBorderRightStyle ?? 'solid'} ${el.tableBorderRight || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                                                            }}
                                                        >
                                                            {(() => {
                                                                const rows = el.tableRows || 3;
                                                                const cols = el.tableCols || 3;
                                                                const v2Cells = getV2Cells(el);
                                                                const totalCells = rows * cols;

                                                                const cellElements: React.ReactNode[] = [];

                                                                for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
                                                                    const { r, c } = flatIdxToRowCol(cellIndex, cols);
                                                                    const v2 = v2Cells[cellIndex];

                                                                    // isMerged: true인 셀은 렌더링에서 제외
                                                                    if (v2 && v2.isMerged) continue;

                                                                    const cellData = v2 ? v2.content : (el.tableCellData?.[cellIndex] || '');
                                                                    const cellColor = el.tableCellColors?.[cellIndex];
                                                                    const cellStyle = el.tableCellStyles?.[cellIndex] || {};
                                                                    const isCellSelected = editingTableId === el.id && selectedCellIndices.includes(cellIndex);
                                                                    const isCellEditing = editingTableId === el.id && editingCellIndex === cellIndex;
                                                                    const isHeaderRow = r === 0;


                                                                    const cellRowSpan = v2 ? v2.rowSpan : 1;
                                                                    const cellColSpan = v2 ? v2.colSpan : 1;

                                                                    // Determine if edge cell
                                                                    const isLastCol = (c + cellColSpan) === cols;
                                                                    const isLastRow = (r + cellRowSpan) === rows;

                                                                    const globalBorderColor = hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6);
                                                                    const globalBorderWidth = el.strokeWidth ?? 1;
                                                                    const innerHColor = el.tableBorderInsideH || globalBorderColor;
                                                                    const innerVColor = el.tableBorderInsideV || globalBorderColor;
                                                                    const innerHWidth = el.tableBorderInsideHWidth ?? globalBorderWidth;
                                                                    const innerVWidth = el.tableBorderInsideVWidth ?? globalBorderWidth;
                                                                    const innerHStyle = el.tableBorderInsideHStyle ?? 'solid';
                                                                    const innerVStyle = el.tableBorderInsideVStyle ?? 'solid';

                                                                    // 셀 테두리: 바깥쪽은 컨테이너가 그림. 셀은 Right/Bottom만 그려서 안쪽 가로·세로선 형성
                                                                    const getBorder = (side: 'Top' | 'Bottom' | 'Left' | 'Right', isEdge: boolean) => {
                                                                        const colorKey = `border${side}` as keyof typeof cellStyle;
                                                                        const widthKey = `border${side}Width` as keyof typeof cellStyle;
                                                                        const styleKey = `border${side}Style` as keyof typeof cellStyle;

                                                                        // 한 경계선은 한 셀만 그리도록 소유권 고정:
                                                                        // 내부 경계는 Bottom/Right만 렌더링하고 Top/Left는 가장자리에서만 허용.
                                                                        const canUseCellOverride = side === 'Bottom' || side === 'Right' || isEdge;
                                                                        if (canUseCellOverride && (cellStyle[colorKey] !== undefined || cellStyle[widthKey] !== undefined || cellStyle[styleKey] !== undefined)) {
                                                                            const w = cellStyle[widthKey] ?? el[`tableBorder${side}Width`] ?? globalBorderWidth;
                                                                            const s = cellStyle[styleKey] ?? el[`tableBorder${side}Style`] ?? 'solid';
                                                                            const c = cellStyle[colorKey] || el[`tableBorder${side}`] || globalBorderColor;
                                                                            return `${w}px ${s} ${c}`;
                                                                        }
                                                                        if (side === 'Top' || side === 'Left') return 'none';
                                                                        if (side === 'Right' && isEdge) return 'none';
                                                                        if (side === 'Bottom' && isEdge) return 'none';
                                                                        if (side === 'Bottom') return `${innerHWidth}px ${innerHStyle} ${innerHColor}`;
                                                                        if (side === 'Right') return `${innerVWidth}px ${innerVStyle} ${innerVColor}`;
                                                                        return 'none';
                                                                    };

                                                                    const borderTop = getBorder('Top', r === 0);
                                                                    const borderBottom = getBorder('Bottom', isLastRow);
                                                                    const borderLeft = getBorder('Left', c === 0);
                                                                    const borderRight = getBorder('Right', isLastCol);

                                                                    const cellBg = hexToRgba(cellColor || el.fill || (isHeaderRow ? '#f1f5f9' : '#ffffff'), el.fillOpacity ?? 1);

                                                                    cellElements.push(
                                                                        <div
                                                                            key={cellIndex}
                                                                            className={`relative px-1 py-0.5 text-[10px] leading-tight flex items-center justify-center ${isHeaderRow && !cellColor ? 'font-bold text-[#2c3e7c]' : 'text-gray-700'}`}
                                                                            style={{
                                                                                gridColumn: cellColSpan > 1 ? `span ${cellColSpan}` : undefined,
                                                                                gridRow: cellRowSpan > 1 ? `span ${cellRowSpan}` : undefined,
                                                                                backgroundColor: cellBg,
                                                                                borderTop,
                                                                                borderBottom,
                                                                                borderLeft,
                                                                                borderRight,
                                                                                outline: isCellSelected ? '2px solid #3b82f6' : 'none',
                                                                                outlineOffset: '-1px',
                                                                                cursor: editingTableId === el.id ? 'crosshair' : 'default',
                                                                                textAlign: cellStyle.textAlign || el.textAlign || 'center',
                                                                                verticalAlign: cellStyle.verticalAlign || el.verticalAlign || 'middle',
                                                                                overflow: 'hidden',
                                                                                minWidth: 0,
                                                                                minHeight: 0,
                                                                            }}
                                                                            onMouseDown={(e) => {
                                                                                if (isLocked) return;
                                                                                if (editingTableId !== el.id) return;
                                                                                e.stopPropagation();
                                                                                if (editingCellIndex !== null) setEditingCellIndex(null);

                                                                                // Start selection
                                                                                isDraggingCellSelectionRef.current = true;
                                                                                dragStartCellIndexRef.current = cellIndex;
                                                                                setSelectedCellIndices([cellIndex]);

                                                                                const onMouseUp = () => {
                                                                                    isDraggingCellSelectionRef.current = false;
                                                                                    window.removeEventListener('mouseup', onMouseUp);
                                                                                };
                                                                                window.addEventListener('mouseup', onMouseUp);
                                                                            }}
                                                                            onMouseEnter={() => {
                                                                                if (!isDraggingCellSelectionRef.current) return;
                                                                                if (editingTableId !== el.id) return;
                                                                                const startIdx = dragStartCellIndexRef.current;
                                                                                if (startIdx < 0) return;

                                                                                const start = flatIdxToRowCol(startIdx, cols);
                                                                                const rMin = Math.min(start.r, r);
                                                                                const rMax = Math.max(start.r, r);
                                                                                const cMin = Math.min(start.c, c);
                                                                                const cMax = Math.max(start.c, c);

                                                                                const newSelection: number[] = [];
                                                                                for (let ri = rMin; ri <= rMax; ri++) {
                                                                                    for (let ci = cMin; ci <= cMax; ci++) {
                                                                                        newSelection.push(rowColToFlatIdx(ri, ci, cols));
                                                                                    }
                                                                                }
                                                                                setSelectedCellIndices(newSelection);
                                                                            }}
                                                                            onDoubleClick={(e) => {
                                                                                if (isLocked) return;
                                                                                if (editingTableId !== el.id) return;
                                                                                e.stopPropagation();
                                                                                setEditingCellIndex(cellIndex);
                                                                            }}
                                                                        >
                                                                            {isCellEditing ? (
                                                                                <textarea
                                                                                    autoFocus
                                                                                    className="w-full h-full bg-white border-none outline-none resize-none p-1 text-[10px] absolute inset-0 z-[20]"
                                                                                    value={tableCellComposing?.cellIndex === cellIndex ? tableCellComposing.value : cellData}
                                                                                    onChange={(e) => {
                                                                                        const val = e.target.value;
                                                                                        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                                                                            setTableCellComposing({ cellIndex, value: val });
                                                                                            return;
                                                                                        }
                                                                                        setTableCellComposing(null);
                                                                                        // V2 업데이트
                                                                                        const newV2 = deepCopyCells(getV2Cells(el));
                                                                                        if (newV2[cellIndex]) {
                                                                                            newV2[cellIndex] = { ...newV2[cellIndex], content: val };
                                                                                        }
                                                                                        // Legacy도 동시 업데이트
                                                                                        const newData = [...(el.tableCellData || [])];
                                                                                        newData[cellIndex] = val;
                                                                                        const nextElements = drawElements.map(it => it.id === el.id ? { ...it, tableCellData: newData, tableCellDataV2: newV2 } : it);
                                                                                        update({ drawElements: nextElements });
                                                                                    }}
                                                                                    onCompositionEnd={(e) => {
                                                                                        const val = (e.target as HTMLTextAreaElement).value;
                                                                                        setTableCellComposing(null);
                                                                                        const newV2 = deepCopyCells(getV2Cells(el));
                                                                                        if (newV2[cellIndex]) newV2[cellIndex] = { ...newV2[cellIndex], content: val };
                                                                                        const newData = [...(el.tableCellData || [])];
                                                                                        newData[cellIndex] = val;
                                                                                        const nextElements = drawElements.map(it => it.id === el.id ? { ...it, tableCellData: newData, tableCellDataV2: newV2 } : it);
                                                                                        update({ drawElements: nextElements });
                                                                                    }}
                                                                                    onBlur={() => {
                                                                                        if (tableCellComposing?.cellIndex === cellIndex) {
                                                                                            const val = tableCellComposing.value;
                                                                                            setTableCellComposing(null);
                                                                                            const newV2 = deepCopyCells(getV2Cells(el));
                                                                                            if (newV2[cellIndex]) newV2[cellIndex] = { ...newV2[cellIndex], content: val };
                                                                                            const newData = [...(el.tableCellData || [])];
                                                                                            newData[cellIndex] = val;
                                                                                            const nextElements = drawElements.map(it => it.id === el.id ? { ...it, tableCellData: newData, tableCellDataV2: newV2 } : it);
                                                                                            update({ drawElements: nextElements });
                                                                                            syncUpdate({ drawElements: nextElements });
                                                                                        } else {
                                                                                            syncUpdate({ drawElements });
                                                                                        }
                                                                                        setEditingCellIndex(null);
                                                                                    }}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditingCellIndex(null); syncUpdate({ drawElements }); }
                                                                                    }}
                                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                                />
                                                                            ) : (
                                                                                <div
                                                                                    className="whitespace-pre-wrap w-full h-full flex"
                                                                                    style={{
                                                                                        alignItems: cellStyle.verticalAlign === 'top' ? 'flex-start' : cellStyle.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                                                                                        justifyContent: cellStyle.textAlign === 'left' ? 'flex-start' : cellStyle.textAlign === 'right' ? 'flex-end' : 'center',
                                                                                    }}
                                                                                >
                                                                                    {cellData}
                                                                                </div>
                                                                            )}

                                                                        </div>
                                                                    );
                                                                }

                                                                return cellElements;
                                                            })()}
                                                        </div>


                                                        {/* Column Resize Handles (오버레이 - 인접 셀에 가리지 않도록) */}
                                                        {editingTableId === el.id && !isLocked && (() => {
                                                            const colsLocal = el.tableCols || 3;
                                                            const widthsLocal = el.tableColWidths || Array(colsLocal).fill(100 / colsLocal);
                                                            let accLeft = 0;
                                                            return Array.from({ length: colsLocal - 1 }).map((_, colIdx) => {
                                                                accLeft += widthsLocal[colIdx];
                                                                return (
                                                                    <div
                                                                        key={`col-resize-${colIdx}`}
                                                                        className="nodrag absolute top-0 bottom-0 cursor-col-resize z-[115] group/colresize"
                                                                        style={{
                                                                            left: `calc(${accLeft}% - 4px)`,
                                                                            width: 8,
                                                                        }}
                                                                        onMouseDown={(e) => {
                                                                            e.stopPropagation();
                                                                            e.preventDefault();
                                                                            const startX = e.clientX;
                                                                            const startWidths = [...widthsLocal];
                                                                            const tableRect = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
                                                                            const tableWidthPx = tableRect?.width ?? el.width;
                                                                            const minWidthPercent = Math.max(5, (20 / tableWidthPx) * 100);

                                                                            const handleMove = (moveE: MouseEvent) => {
                                                                                moveE.preventDefault();
                                                                                moveE.stopPropagation();
                                                                                const deltaX = moveE.clientX - startX;
                                                                                const deltaPercent = (deltaX / tableWidthPx) * 100;
                                                                                const newWidths = [...startWidths];
                                                                                let w1 = startWidths[colIdx] + deltaPercent;
                                                                                let w2 = startWidths[colIdx + 1] - deltaPercent;

                                                                                if (w1 < minWidthPercent) { w2 -= (minWidthPercent - w1); w1 = minWidthPercent; }
                                                                                if (w2 < minWidthPercent) { w1 -= (minWidthPercent - w2); w2 = minWidthPercent; }

                                                                                newWidths[colIdx] = w1;
                                                                                newWidths[colIdx + 1] = w2;

                                                                                updateElement(el.id, { tableColWidths: newWidths });
                                                                            };

                                                                            const handleUp = () => {
                                                                                window.removeEventListener('mousemove', handleMove, true);
                                                                                window.removeEventListener('mouseup', handleUp, true);
                                                                                syncUpdate({ drawElements });
                                                                            };

                                                                            window.addEventListener('mousemove', handleMove, true);
                                                                            window.addEventListener('mouseup', handleUp, true);
                                                                        }}
                                                                    >
                                                                        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-blue-400 opacity-0 group-hover/colresize:opacity-100 transition-opacity" />
                                                                    </div>
                                                                );
                                                            });
                                                        })()}

                                                        {/* Row Resize Handles */}
                                                        {editingTableId === el.id && !isLocked && (() => {
                                                            const rows = el.tableRows || 3;
                                                            const cols = el.tableCols || 3;
                                                            const heights = el.tableRowHeights || Array(rows).fill(100 / rows);
                                                            const colWidths = el.tableColWidths || Array(cols).fill(100 / cols);
                                                            const v2CellsLocal = getV2Cells(el);

                                                            let accPercent = 0;

                                                            return Array.from({ length: rows - 1 }).map((_, idx) => {
                                                                const currentRowHeight = heights[idx];
                                                                accPercent += currentRowHeight;

                                                                const segments: { left: number, width: number }[] = [];

                                                                let currentLeft = 0;
                                                                colWidths.forEach((w, cIdx) => {
                                                                    const cellIdx = rowColToFlatIdx(idx, cIdx, cols);
                                                                    const v2Cell = v2CellsLocal[cellIdx];

                                                                    // Only show handle if the cell ends at this row (not spanning down)
                                                                    const cellRowSpan = v2Cell ? (v2Cell.isMerged ? 0 : v2Cell.rowSpan) : 1;
                                                                    if (cellRowSpan === 0 || cellRowSpan === 1) {
                                                                        segments.push({ left: currentLeft, width: w });
                                                                    }
                                                                    currentLeft += w;
                                                                });

                                                                return segments.map((seg, segIdx) => (
                                                                    <div
                                                                        key={`row-resize-${idx}-${segIdx}`}
                                                                        className="nodrag absolute cursor-row-resize z-[120] group/rowresize"
                                                                        style={{
                                                                            top: `${accPercent}%`,
                                                                            height: 8,
                                                                            marginTop: -4,
                                                                            left: `${seg.left}%`,
                                                                            width: `${seg.width}%`
                                                                        }}
                                                                        onMouseDown={(e) => {
                                                                            e.stopPropagation();
                                                                            e.preventDefault();
                                                                            tableRowResizeRef.current = {
                                                                                elId: el.id,
                                                                                rowIdx: idx,
                                                                                startY: e.clientY,
                                                                                startHeights: [...heights]
                                                                            };
                                                                            const handleMove = (moveE: MouseEvent) => {
                                                                                if (!tableRowResizeRef.current) return;
                                                                                moveE.preventDefault();
                                                                                const { rowIdx: ri, startY, startHeights: sh } = tableRowResizeRef.current;
                                                                                const deltaY = moveE.clientY - startY;
                                                                                const deltaPercent = (deltaY / el.height) * 100;
                                                                                const newHeights = [...sh];
                                                                                const minH = 2;
                                                                                let h1 = sh[ri] + deltaPercent;
                                                                                let h2 = sh[ri + 1] - deltaPercent;
                                                                                if (h1 < minH) { h2 -= (minH - h1); h1 = minH; }
                                                                                if (h2 < minH) { h1 -= (minH - h2); h2 = minH; }
                                                                                newHeights[ri] = h1;
                                                                                newHeights[ri + 1] = h2;
                                                                                updateElement(el.id, { tableRowHeights: newHeights });
                                                                            };
                                                                            const handleUp = () => {
                                                                                window.removeEventListener('mousemove', handleMove, true);
                                                                                window.removeEventListener('mouseup', handleUp, true);
                                                                                syncUpdate({ drawElements });
                                                                                tableRowResizeRef.current = null;
                                                                            };
                                                                            window.addEventListener('mousemove', handleMove, true);
                                                                            window.addEventListener('mouseup', handleUp, true);
                                                                        }}
                                                                    >
                                                                        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[2px] bg-blue-400 opacity-0 group-hover/rowresize:opacity-100 transition-opacity" />
                                                                    </div>
                                                                ));
                                                            });
                                                        })()}
                                                    </div>
                                                )
                                                }
                                                {el.type === 'func-no' && (
                                                    <div
                                                        className="w-full h-full rounded-full flex items-center justify-center font-bold text-white shadow-md select-none group/func"
                                                        style={{
                                                            backgroundColor: el.fill || '#ef4444',
                                                            fontSize: el.fontSize || 12,
                                                            border: `${el.strokeWidth || 2}px solid ${el.stroke || '#ffffff'}`,
                                                            lineHeight: 1,
                                                            padding: 0,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                    >
                                                        <span style={{ marginTop: '-1px' }}>{el.text}</span>
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
                                                                            x: el.x + 30, // Offset from original
                                                                            y: el.y + 30,
                                                                            zIndex: drawElements.length + 1,
                                                                            description: '' // New element starts with empty description
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
                                                                            x: el.x + 30, // Offset from original
                                                                            y: el.y + 30,
                                                                            zIndex: drawElements.length + 1,
                                                                            description: '' // New element starts with empty description
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
                                                {isSelected && !isLocked && selectedElementIds.length === 1 && (
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

                                                {/* Resize Handles (이미지 직접 크롭 모드에서는 ImageElement 크롭 핸들 사용) */}
                                                {isSelected && !isLocked && selectedElementIds.length === 1 && !(el.type === 'image' && imageCropMode) && (
                                                    <>
                                                        {/* Single blue selection border */}
                                                        <div className="absolute inset-0 border border-blue-500 pointer-events-none z-[125]" />
                                                        
                                                        {/* Corners */}
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'nw', e)} className="absolute -top-[2.5px] -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-nw-resize pointer-events-auto z-[130]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'ne', e)} className="absolute -top-[2.5px] -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-ne-resize pointer-events-auto z-[130]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'sw', e)} className="absolute -bottom-[2.5px] -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-sw-resize pointer-events-auto z-[130]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'se', e)} className="absolute -bottom-[2.5px] -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-se-resize pointer-events-auto z-[130]" />

                                                        {/* Middles */}
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'n', e)} className="absolute -top-[2.5px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-n-resize pointer-events-auto z-[130]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 's', e)} className="absolute -bottom-[2.5px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-s-resize pointer-events-auto z-[130]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'w', e)} className="absolute top-1/2 -translate-y-1/2 -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-w-resize pointer-events-auto z-[130]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'e', e)} className="absolute top-1/2 -translate-y-1/2 -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 hover:border-blue-600 transition-all duration-200 ease-out cursor-e-resize pointer-events-auto z-[130]" />
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Render Temporary Drawing Element */}
                                    {tempElement && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                left: tempElement.x,
                                                top: tempElement.y,
                                                width: tempElement.width,
                                                height: tempElement.height,
                                                zIndex: 9999,
                                                pointerEvents: 'none'
                                            }}
                                        >
                                            {tempElement.type === 'rect' && <div className="w-full h-full border-2 border-blue-500 border-dashed bg-blue-50/20 rounded-sm" />}
                                            {tempElement.type === 'circle' && <div className="w-full h-full border-2 border-blue-500 border-dashed bg-blue-50/20 rounded-full" />}
                                            {tempElement.type === 'table' && (
                                                <div className="w-full h-full border-2 border-blue-500 border-dashed bg-blue-50/20 rounded-sm flex items-center justify-center">
                                                    <Table2 size={24} className="text-blue-400 opacity-60" />
                                                </div>
                                            )}
                                            {tempElement.type === 'func-no' && (
                                                <div className="w-full h-full border-2 border-red-500 border-dashed bg-red-50/20 rounded-full flex items-center justify-center text-[10px] text-red-600 font-bold">
                                                    {tempElement.text}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Marquee Drag-Selection Rectangle */}
                                    {isDragSelecting && dragSelectRect && dragSelectRect.w > 2 && dragSelectRect.h > 2 && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                left: dragSelectRect.x,
                                                top: dragSelectRect.y,
                                                width: dragSelectRect.w,
                                                height: dragSelectRect.h,
                                                zIndex: 9998,
                                                pointerEvents: 'none',
                                                border: '1.5px dashed #3b82f6',
                                                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                                                borderRadius: 3
                                            }}
                                        />
                                    )}

                                    {/* Canvas Grid Lines (보조선) - 잠금/비활성화 시 숨김, 드래그 이동, 선택 시 삭제 버튼 표시 */}
                                    {!isLocked && screen.guideLinesVisible !== false && guideLines.vertical.map((vx) => (
                                        <div
                                            key={`grid-v-${vx}`}
                                            data-guide-line
                                            className="group nodrag"
                                            style={{
                                                position: 'absolute',
                                                left: vx - 12,
                                                top: 0,
                                                bottom: 0,
                                                width: 24,
                                                zIndex: 4500,
                                                cursor: 'col-resize',
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                if (!(e.target as HTMLElement).closest('[data-guide-delete]')) {
                                                    handleGuideLineDragStart('vertical', vx, e);
                                                }
                                            }}
                                        >
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: 11,
                                                    top: 0,
                                                    bottom: 0,
                                                    width: 2,
                                                    backgroundColor: 'rgba(232, 223, 177, 0.35)',
                                                    pointerEvents: 'none',
                                                }}
                                            />
                                            <div
                                                data-guide-delete
                                                className={`transition-opacity absolute ${selectedGuideLine?.axis === 'vertical' && selectedGuideLine?.value === vx ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                                                style={{ left: 0, top: 4 }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                <PremiumTooltip label="세로줄 삭제">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeGuideLine('vertical', vx);
                                                            setSelectedGuideLine(null);
                                                        }}
                                                        className="w-5 h-5 rounded-md bg-white/80 hover:bg-white text-slate-500 hover:text-red-500 border border-slate-200 flex items-center justify-center shadow-sm"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </PremiumTooltip>
                                            </div>
                                        </div>
                                    ))}
                                    {!isLocked && screen.guideLinesVisible !== false && guideLines.horizontal.map((vy) => (
                                        <div
                                            key={`grid-h-${vy}`}
                                            data-guide-line
                                            className="group nodrag"
                                            style={{
                                                position: 'absolute',
                                                left: 0,
                                                right: 0,
                                                top: vy - 12,
                                                height: 24,
                                                zIndex: 4500,
                                                cursor: 'row-resize',
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                if (!(e.target as HTMLElement).closest('[data-guide-delete]')) {
                                                    handleGuideLineDragStart('horizontal', vy, e);
                                                }
                                            }}
                                        >
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: 0,
                                                    right: 0,
                                                    top: 11,
                                                    height: 2,
                                                    backgroundColor: 'rgba(232, 223, 177, 0.35)',
                                                    pointerEvents: 'none',
                                                }}
                                            />
                                            <div
                                                data-guide-delete
                                                className={`transition-opacity absolute ${selectedGuideLine?.axis === 'horizontal' && selectedGuideLine?.value === vy ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                                                style={{ left: 4, top: 0 }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                <PremiumTooltip label="가로줄 삭제">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeGuideLine('horizontal', vy);
                                                            setSelectedGuideLine(null);
                                                        }}
                                                        className="w-5 h-5 rounded-md bg-white/80 hover:bg-white text-slate-500 hover:text-red-500 border border-slate-200 flex items-center justify-center shadow-sm"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </PremiumTooltip>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Smart Guides - 정렬 시 가이드라인 */}
                                    {alignmentGuides && <AlignmentGuidesOverlay guides={alignmentGuides} />}
                                </div>
                            </div>
                    </div>

                    </div>
                </div> {/* End Body Split Layout */}









                {/* Floating Panels (Style Panel, Layer Panel) */}
                {
                    !isLocked && (
                        <>
                            {/* Style Panel */}
                            {showStylePanel && selectedElementIds.length > 0 && createPortal(
                                <StylePanel
                                    show={showStylePanel}
                                    selectedElementIds={selectedElementIds}
                                    drawElements={drawElements}
                                    stylePanelPos={stylePanelPos}
                                    onPositionChange={setStylePanelPos}
                                    zoom={zoom}
                                    screenToFlowPosition={screenToFlowPosition}
                                    flowToScreenPosition={flowToScreenPosition}
                                    editingTableId={editingTableId}
                                    selectedCellIndices={selectedCellIndices}
                                    update={update}
                                    syncUpdate={syncUpdate}
                                    onClose={() => setShowStylePanel(false)}
                                    onDragStart={() => { isDraggingStylePanelRef.current = true; }}
                                    onDragEnd={() => { isDraggingStylePanelRef.current = false; }}
                                />,
                                getPanelPortalRoot()
                            )}



                            {/* ─── Table Panel ─── */}
                            {showTablePanel && (() => {
                                const selectedEl = drawElements.find(el => el.id === selectedElementIds[0]);
                                if (!selectedEl || selectedEl.type !== 'table') return null;
                                const rows = selectedEl.tableRows || 3;
                                const cols = selectedEl.tableCols || 3;
                                const totalCells = rows * cols;
                                const cellColorPresets = [
                                    'transparent', '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0',
                                    '#fee2e2', '#fef3c7', '#dcfce7', '#dbeafe', '#ede9fe',
                                    '#2c3e7c', '#1e40af', '#059669', '#d97706', '#dc2626'
                                ];
                                const handleTablePanelHeaderMouseDown = (e: React.MouseEvent) => {
                                    if (isLocked) return;
                                    e.stopPropagation();
                                    e.preventDefault();
                                    isDraggingTablePanelRef.current = true;
                                    const flowAtClick = screenToFlowPosition({ x: e.clientX, y: e.clientY });
                                    const offsetFlowX = flowAtClick.x - tablePanelPos.x;
                                    const offsetFlowY = flowAtClick.y - tablePanelPos.y;
                                    const onMove = (me: MouseEvent) => {
                                        if (!isDraggingTablePanelRef.current) return;
                                        me.stopImmediatePropagation();
                                        const flowAtMove = screenToFlowPosition({ x: me.clientX, y: me.clientY });
                                        setTablePanelPos({ x: flowAtMove.x - offsetFlowX, y: flowAtMove.y - offsetFlowY });
                                    };
                                    const onUp = () => {
                                        isDraggingTablePanelRef.current = false;
                                        window.removeEventListener('mousemove', onMove, true);
                                        window.removeEventListener('mouseup', onUp);
                                    };
                                    window.addEventListener('mousemove', onMove, true);
                                    window.addEventListener('mouseup', onUp);
                                };
                                const tablePanelScreenPos = flowToScreenPosition({ x: tablePanelPos.x, y: tablePanelPos.y });
                                return createPortal(
                                    <div
                                        data-table-panel
                                        className="nodrag floating-panel fixed z-[9000] bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[400px] animate-in fade-in zoom-in origin-top-left"
                                        style={{
                                            left: tablePanelScreenPos.x,
                                            top: tablePanelScreenPos.y,
                                            transform: `scale(${0.85 * zoom})`,
                                        }}
                                    >
                                        {/* Header */}
                                        <div
                                            className="flex items-center justify-between border-b border-gray-100 pb-2 cursor-grab active:cursor-grabbing group/header"
                                            onMouseDown={handleTablePanelHeaderMouseDown}
                                        >
                                            <div className="flex items-center gap-2">
                                                <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                                                <Settings2 size={14} className="text-[#2c3e7c]" />
                                                <span className="text-[12px] font-bold text-gray-700">표 설정</span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setShowTablePanel(false);
                                                    setSelectedCellIndices([]);
                                                    setEditingCellIndex(null);
                                                }}
                                                onMouseDown={e => e.stopPropagation()}
                                                className="p-1 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                                            >
                                                <X size={13} />
                                            </button>
                                        </div>

                                        {/* Row / Col controls */}
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-gray-600 font-medium">행 수</span>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onMouseDown={e => e.stopPropagation()}
                                                        onClick={() => {
                                                            if (rows <= 1) return;
                                                            const newRows = rows - 1;
                                                            const newCellData = Array(newRows * cols).fill('');
                                                            const newCellColors: (string | undefined)[] = Array(newRows * cols).fill(undefined);
                                                            for (let r = 0; r < newRows; r++) {
                                                                for (let c = 0; c < cols; c++) {
                                                                    newCellData[r * cols + c] = selectedEl.tableCellData?.[r * cols + c] || '';
                                                                    newCellColors[r * cols + c] = selectedEl.tableCellColors?.[r * cols + c];
                                                                }
                                                            }
                                                            const newRowHeights = Array(newRows).fill(100 / newRows);
                                                            const nextElements = drawElements.map(el =>
                                                                el.id === selectedEl.id ? { ...el, tableRows: newRows, tableCellData: newCellData, tableRowHeights: newRowHeights, tableCellColors: newCellColors, tableCellDataV2: undefined, tableCellSpans: undefined, tableRowColWidths: undefined } : el
                                                            );
                                                            update({ drawElements: nextElements }); syncUpdate({ drawElements: nextElements });
                                                            setSelectedCellIndices([]);
                                                            setEditingCellIndex(null);
                                                        }}
                                                        className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
                                                    >−</button>
                                                    <span className="w-8 text-center text-[13px] font-bold text-[#2c3e7c]">{rows}</span>
                                                    <button
                                                        onMouseDown={e => e.stopPropagation()}
                                                        onClick={() => {
                                                            const newRows = rows + 1;
                                                            const newCellData = Array(newRows * cols).fill('');
                                                            const newCellColors: (string | undefined)[] = Array(newRows * cols).fill(undefined);
                                                            for (let r = 0; r < rows; r++) {
                                                                for (let c = 0; c < cols; c++) {
                                                                    newCellData[r * cols + c] = selectedEl.tableCellData?.[r * cols + c] || '';
                                                                    newCellColors[r * cols + c] = selectedEl.tableCellColors?.[r * cols + c];
                                                                }
                                                            }
                                                            const newRowHeights = Array(newRows).fill(100 / newRows);
                                                            const nextElements = drawElements.map(el =>
                                                                el.id === selectedEl.id ? { ...el, tableRows: newRows, tableCellData: newCellData, tableRowHeights: newRowHeights, tableCellColors: newCellColors, tableCellDataV2: undefined, tableCellSpans: undefined, tableRowColWidths: undefined } : el
                                                            );
                                                            update({ drawElements: nextElements }); syncUpdate({ drawElements: nextElements });
                                                            setSelectedCellIndices([]);
                                                            setEditingCellIndex(null);
                                                        }}
                                                        className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
                                                    >+</button>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-gray-600 font-medium">열 수</span>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onMouseDown={e => e.stopPropagation()}
                                                        onClick={() => {
                                                            if (cols <= 1) return;
                                                            const newCols = cols - 1;
                                                            const newCellData = Array(rows * newCols).fill('');
                                                            const newCellColors: (string | undefined)[] = Array(rows * newCols).fill(undefined);
                                                            for (let r = 0; r < rows; r++) {
                                                                for (let c = 0; c < newCols; c++) {
                                                                    newCellData[r * newCols + c] = selectedEl.tableCellData?.[r * cols + c] || '';
                                                                    newCellColors[r * newCols + c] = selectedEl.tableCellColors?.[r * cols + c];
                                                                }
                                                            }
                                                            const newColWidths = Array(newCols).fill(100 / newCols);
                                                            const nextElements = drawElements.map(el =>
                                                                el.id === selectedEl.id ? { ...el, tableCols: newCols, tableCellData: newCellData, tableColWidths: newColWidths, tableCellColors: newCellColors, tableCellDataV2: undefined, tableCellSpans: undefined, tableRowColWidths: undefined } : el
                                                            );
                                                            update({ drawElements: nextElements }); syncUpdate({ drawElements: nextElements });
                                                            setSelectedCellIndices([]);
                                                            setEditingCellIndex(null);
                                                        }}
                                                        className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
                                                    >−</button>
                                                    <span className="w-8 text-center text-[13px] font-bold text-[#2c3e7c]">{cols}</span>
                                                    <button
                                                        onMouseDown={e => e.stopPropagation()}
                                                        onClick={() => {
                                                            const newCols = cols + 1;
                                                            const newCellData = Array(rows * newCols).fill('');
                                                            const newCellColors: (string | undefined)[] = Array(rows * newCols).fill(undefined);
                                                            for (let r = 0; r < rows; r++) {
                                                                for (let c = 0; c < newCols; c++) {
                                                                    newCellData[r * newCols + c] = c < cols ? (selectedEl.tableCellData?.[r * cols + c] || '') : '';
                                                                    newCellColors[r * newCols + c] = c < cols ? selectedEl.tableCellColors?.[r * cols + c] : undefined;
                                                                }
                                                            }
                                                            const newColWidths = Array(newCols).fill(100 / newCols);
                                                            const nextElements = drawElements.map(el =>
                                                                el.id === selectedEl.id ? { ...el, tableCols: newCols, tableCellData: newCellData, tableColWidths: newColWidths, tableCellColors: newCellColors, tableCellDataV2: undefined, tableCellSpans: undefined, tableRowColWidths: undefined } : el
                                                            );
                                                            update({ drawElements: nextElements }); syncUpdate({ drawElements: nextElements });
                                                            setSelectedCellIndices([]);
                                                            setEditingCellIndex(null);
                                                        }}
                                                        className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
                                                    >+</button>
                                                </div>
                                            </div>
                                            {/* Merge / Split Buttons */}
                                            {editingTableId === selectedEl.id && (
                                                <div className="flex flex-col gap-2 p-1.5 bg-gray-50/50 rounded-xl border border-gray-100">
                                                    <div className="flex items-center gap-1.5 px-1 mb-1">
                                                        <Combine size={12} className="text-blue-500" />
                                                        <span className="text-[11px] font-bold text-gray-600">셀 편집</span>
                                                    </div>
                                                    <div className="flex gap-1.5">
                                                        <button
                                                            onMouseDown={e => e.stopPropagation()}
                                                            onClick={() => handleMergeCells(selectedEl)}
                                                            disabled={selectedCellIndices.length < 2}
                                                            className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all ${selectedCellIndices.length >= 2 ? 'bg-white shadow-sm text-blue-600 border border-blue-100 hover:bg-blue-50' : 'bg-gray-50/50 text-gray-300 border border-transparent cursor-not-allowed'}`}
                                                        >
                                                            <Combine size={16} />
                                                            <span className="text-[10px] font-bold">합치기</span>
                                                        </button>
                                                        <div className="flex-1 relative">
                                                            <button
                                                                onMouseDown={e => e.stopPropagation()}
                                                                onClick={() => handleSplitCells(selectedEl)}
                                                                disabled={selectedCellIndices.length === 0}
                                                                className={`w-full flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all ${selectedCellIndices.length > 0 ? 'bg-white shadow-sm text-gray-600 border border-gray-100 hover:bg-gray-50' : 'bg-gray-50/50 text-gray-300 border border-transparent cursor-not-allowed'}`}
                                                            >
                                                                <Split size={16} />
                                                                <span className="text-[10px] font-bold">나누기</span>
                                                            </button>

                                                            {/* Step Id: 251 - Popover Split Dialog */}
                                                            {showSplitDialog && splitTarget && splitTarget.elId === selectedEl.id && (
                                                                <div
                                                                    className="absolute top-full right-0 mt-2 z-[300] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[220px] animate-in slide-in-from-top-2 duration-200"
                                                                    onMouseDown={e => e.stopPropagation()}
                                                                >
                                                                    <div className="flex items-center justify-between mb-4">
                                                                        <span className="text-[12px] font-bold text-gray-700">셀 분할 설정</span>
                                                                        <button onClick={() => setShowSplitDialog(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
                                                                            <X size={14} />
                                                                        </button>
                                                                    </div>

                                                                    <div className="space-y-3 mb-4">
                                                                        <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-100">
                                                                            <span className="text-[11px] text-gray-600 font-bold ml-1">행</span>
                                                                            <div className="flex items-center gap-2">
                                                                                <button onClick={() => setSplitRows(prev => Math.max(1, prev - 1))} className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors"><Minus size={10} /></button>
                                                                                <span className="w-4 text-center text-[12px] font-bold text-blue-600">{splitRows}</span>
                                                                                <button onClick={() => setSplitRows(prev => Math.min(10, prev + 1))} className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Plus size={10} /></button>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-100">
                                                                            <span className="text-[11px] text-gray-600 font-bold ml-1">열</span>
                                                                            <div className="flex items-center gap-2">
                                                                                <button onClick={() => setSplitCols(prev => Math.max(1, prev - 1))} className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors"><Minus size={10} /></button>
                                                                                <span className="w-4 text-center text-[12px] font-bold text-blue-600">{splitCols}</span>
                                                                                <button onClick={() => setSplitCols(prev => Math.min(10, prev + 1))} className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Plus size={10} /></button>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <button
                                                                        onClick={() => {
                                                                            handleExecSplit(selectedEl, splitTarget.cellIdx, splitRows, splitCols);
                                                                            setShowSplitDialog(false);
                                                                        }}
                                                                        className="w-full py-2 bg-[#2c3e7c] text-white rounded-lg text-[11px] font-bold hover:bg-[#1e2d5e] transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                                                                    >
                                                                        <Split size={12} />
                                                                        <span>분할 실행</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Table Border Settings */}
                                            <div className="flex flex-col gap-3 pt-3 border-t border-gray-100">
                                                <div className="flex items-center gap-1.5 text-gray-700">
                                                    <Square size={12} className="text-gray-400" />
                                                    <span className="text-[11px] font-bold">테두리 설정</span>
                                                </div>

                                                {/* All Borders Control */}
                                                <div className="flex flex-col gap-1.5 pb-3 border-b border-dashed border-gray-100">
                                                    <span className="text-[10px] text-gray-500 font-medium pl-0.5">전체</span>
                                                    <div className="flex items-center gap-2">
                                                        <div className="relative w-6 h-6 rounded border border-gray-200 shadow-sm overflow-hidden flex-shrink-0">
                                                            <input
                                                                type="color"
                                                                value={(selectedCellIndices.length > 0 && editingTableId === selectedEl.id)
                                                                    ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.borderTop || selectedEl.stroke || '#cbd5e1')
                                                                    : (selectedEl.tableBorderTop || selectedEl.stroke || '#cbd5e1')}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    if (selectedCellIndices.length > 0 && editingTableId === selectedEl.id) {
                                                                        const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                                        const tableCols = selectedEl.tableCols || 3;
                                                                        selectedCellIndices.forEach(idx => {
                                                                            const { r, c } = flatIdxToRowCol(idx, tableCols);
                                                                            const nextStyle = { ...(newStyles[idx] || {}), borderBottom: val, borderRight: val };
                                                                            if (r === 0) nextStyle.borderTop = val;
                                                                            if (c === 0) nextStyle.borderLeft = val;
                                                                            newStyles[idx] = nextStyle;
                                                                        });
                                                                        const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableCellStyles: newStyles } : it);
                                                                        update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                    } else {
                                                                        const next = drawElements.map(it => it.id === selectedEl.id ? {
                                                                            ...it,
                                                                            tableBorderTop: val, tableBorderBottom: val, tableBorderLeft: val, tableBorderRight: val
                                                                        } : it);
                                                                        update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                    }
                                                                }}
                                                                onMouseDown={e => e.stopPropagation()}
                                                                className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                                                            />
                                                            <div className="w-full h-full" style={{
                                                                backgroundColor: (selectedCellIndices.length > 0 && editingTableId === selectedEl.id)
                                                                    ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.borderTop || selectedEl.stroke || '#cbd5e1')
                                                                    : (selectedEl.tableBorderTop || selectedEl.stroke || '#cbd5e1')
                                                            }} />
                                                        </div>
                                                        <div className="flex items-center gap-1 bg-gray-50 rounded px-1.5 py-1 border border-gray-100 flex-1">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="10"
                                                                value={(selectedCellIndices.length > 0 && editingTableId === selectedEl.id)
                                                                    ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.borderTopWidth ?? 1)
                                                                    : (selectedEl.tableBorderTopWidth ?? selectedEl.strokeWidth ?? 1)}
                                                                onChange={(e) => {
                                                                    const val = parseInt(e.target.value) || 0;
                                                                    if (selectedCellIndices.length > 0 && editingTableId === selectedEl.id) {
                                                                        const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                                        const tableCols = selectedEl.tableCols || 3;
                                                                        selectedCellIndices.forEach(idx => {
                                                                            const { r, c } = flatIdxToRowCol(idx, tableCols);
                                                                            const nextStyle = { ...(newStyles[idx] || {}), borderBottomWidth: val, borderRightWidth: val };
                                                                            if (r === 0) nextStyle.borderTopWidth = val;
                                                                            if (c === 0) nextStyle.borderLeftWidth = val;
                                                                            newStyles[idx] = nextStyle;
                                                                        });
                                                                        const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableCellStyles: newStyles } : it);
                                                                        update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                    } else {
                                                                        const next = drawElements.map(it => it.id === selectedEl.id ? {
                                                                            ...it,
                                                                            tableBorderTopWidth: val, tableBorderBottomWidth: val, tableBorderLeftWidth: val, tableBorderRightWidth: val,
                                                                            strokeWidth: val
                                                                        } : it);
                                                                        update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                    }
                                                                }}
                                                                onMouseDown={e => e.stopPropagation()}
                                                                className="w-full bg-transparent text-[11px] font-bold text-gray-700 outline-none"
                                                            />
                                                            <span className="text-[9px] text-gray-400">px</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                                    {(['Top', 'Bottom', 'Left', 'Right'] as const).map(direction => {
                                                        const colorKey = `tableBorder${direction}` as keyof DrawElement;
                                                        const widthKey = `tableBorder${direction}Width` as keyof DrawElement;
                                                        const styleKey = `tableBorder${direction}Style` as keyof DrawElement;
                                                        const styleColorKey = `border${direction}`;
                                                        const styleWidthKey = `border${direction}Width`;
                                                        const label = direction === 'Top' ? '위' : direction === 'Bottom' ? '아래' : direction === 'Left' ? '왼쪽' : '오른쪽';

                                                        const isAnyCellSelected = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                                        const firstCellOverride = isAnyCellSelected ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]] || {}) : {};

                                                        const currentColor = isAnyCellSelected
                                                            ? (firstCellOverride[styleColorKey] || selectedEl[colorKey] || selectedEl.stroke || '#cbd5e1')
                                                            : ((selectedEl[colorKey] as string) || (selectedEl.stroke || '#cbd5e1'));

                                                        const currentWidth = isAnyCellSelected
                                                            ? (firstCellOverride[styleWidthKey] !== undefined ? firstCellOverride[styleWidthKey] : (selectedEl[widthKey] ?? selectedEl.strokeWidth ?? 1))
                                                            : (selectedEl[widthKey] !== undefined ? (selectedEl[widthKey] as number) : (selectedEl.strokeWidth ?? 1));

                                                        const borderStyles = ['solid', 'dashed', 'dotted', 'double', 'none'] as const;
                                                        const currentStyle = (selectedEl[styleKey] as typeof borderStyles[number]) ?? 'solid';

                                                        return (
                                                            <div key={direction} className="flex flex-col gap-1.5">
                                                                <span className="text-[10px] text-gray-500 font-medium pl-0.5">{label}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="relative w-6 h-6 rounded border border-gray-200 shadow-sm overflow-hidden flex-shrink-0">
                                                                        <input
                                                                            type="color"
                                                                            value={currentColor}
                                                                            onChange={(e) => {
                                                                                const val = e.target.value;
                                                                                if (isAnyCellSelected) {
                                                                                    const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                                                    const tableCols = selectedEl.tableCols || 3;
                                                                                    selectedCellIndices.forEach(idx => {
                                                                                        const { r, c } = flatIdxToRowCol(idx, tableCols);
                                                                                        let targetIdx = idx;
                                                                                        let targetKey = styleColorKey;
                                                                                        if (direction === 'Top' && r > 0) {
                                                                                            targetIdx = rowColToFlatIdx(r - 1, c, tableCols);
                                                                                            targetKey = 'borderBottom';
                                                                                        } else if (direction === 'Left' && c > 0) {
                                                                                            targetIdx = rowColToFlatIdx(r, c - 1, tableCols);
                                                                                            targetKey = 'borderRight';
                                                                                        }
                                                                                        newStyles[targetIdx] = { ...(newStyles[targetIdx] || {}), [targetKey]: val };
                                                                                    });
                                                                                    const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableCellStyles: newStyles } : it);
                                                                                    update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                                } else {
                                                                                    const next = drawElements.map(item => item.id === selectedEl.id ? { ...item, [colorKey]: val } : item);
                                                                                    update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                                }
                                                                            }}
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                            className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                                                                        />
                                                                        <div className="w-full h-full" style={{ backgroundColor: currentColor }} />
                                                                    </div>
                                                                    <div className="flex items-center gap-1 bg-gray-50 rounded px-1.5 py-1 border border-gray-100 flex-1">
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            max="10"
                                                                            value={currentWidth}
                                                                            onChange={(e) => {
                                                                                const val = parseInt(e.target.value) || 0;
                                                                                if (isAnyCellSelected) {
                                                                                    const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                                                    const tableCols = selectedEl.tableCols || 3;
                                                                                    selectedCellIndices.forEach(idx => {
                                                                                        const { r, c } = flatIdxToRowCol(idx, tableCols);
                                                                                        let targetIdx = idx;
                                                                                        let targetKey = styleWidthKey;
                                                                                        if (direction === 'Top' && r > 0) {
                                                                                            targetIdx = rowColToFlatIdx(r - 1, c, tableCols);
                                                                                            targetKey = 'borderBottomWidth';
                                                                                        } else if (direction === 'Left' && c > 0) {
                                                                                            targetIdx = rowColToFlatIdx(r, c - 1, tableCols);
                                                                                            targetKey = 'borderRightWidth';
                                                                                        }
                                                                                        newStyles[targetIdx] = { ...(newStyles[targetIdx] || {}), [targetKey]: val };
                                                                                    });
                                                                                    const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableCellStyles: newStyles } : it);
                                                                                    update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                                } else {
                                                                                    const next = drawElements.map(item => item.id === selectedEl.id ? { ...item, [widthKey]: val } : item);
                                                                                    update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                                }
                                                                            }}
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                            className="w-full bg-transparent text-[11px] font-bold text-gray-700 outline-none"
                                                                        />
                                                                        <span className="text-[9px] text-gray-400">px</span>
                                                                    </div>
                                                                </div>
                                                                {!isAnyCellSelected && (
                                                                    <div className="flex items-center gap-1 flex-wrap">
                                                                        {borderStyles.map((value) => {
                                                                            const isSelected = currentStyle === value;
                                                                            return (
                                                                                <button
                                                                                    key={value}
                                                                                    type="button"
                                                                                    title={value === 'solid' ? '실선' : value === 'dashed' ? '대시' : value === 'dotted' ? '점선' : value === 'double' ? '이중선' : '없음'}
                                                                                    onMouseDown={e => e.stopPropagation()}
                                                                                    onClick={() => {
                                                                                        const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, [styleKey]: value } : it);
                                                                                        update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                                    }}
                                                                                    className={`flex items-center justify-center w-7 h-7 rounded border transition-all shrink-0 ${isSelected ? 'border-[#2c3e7c] bg-blue-50 ring-1 ring-[#2c3e7c]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                                                                >
                                                                                    {value === 'none' ? (
                                                                                        <div className="w-3.5 h-3.5 rounded bg-gray-200" />
                                                                                    ) : (
                                                                                        <div
                                                                                            className="w-3.5 h-3.5 rounded bg-white"
                                                                                            style={{ borderWidth: 1.5, borderStyle: value, borderColor: isSelected ? '#2c3e7c' : '#94a3b8' }}
                                                                                        />
                                                                                    )}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    {!(selectedCellIndices.length > 0 && editingTableId === selectedEl.id) && (<>
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[10px] text-gray-500 font-medium pl-0.5">안쪽 가로선</span>
                                                            <div className="flex items-center gap-2">
                                                                <div className="relative w-6 h-6 rounded border border-gray-200 shadow-sm overflow-hidden flex-shrink-0">
                                                                    <input
                                                                        type="color"
                                                                        value={selectedEl.tableBorderInsideH || selectedEl.stroke || '#cbd5e1'}
                                                                        onChange={(e) => { const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableBorderInsideH: e.target.value } : it); update({ drawElements: next }); syncUpdate({ drawElements: next }); }}
                                                                        onMouseDown={e => e.stopPropagation()}
                                                                        className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                                                                    />
                                                                    <div className="w-full h-full" style={{ backgroundColor: selectedEl.tableBorderInsideH || selectedEl.stroke || '#cbd5e1' }} />
                                                                </div>
                                                                <div className="flex items-center gap-1 bg-gray-50 rounded px-1.5 py-1 border border-gray-100 flex-1">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        max="10"
                                                                        value={selectedEl.tableBorderInsideHWidth ?? selectedEl.strokeWidth ?? 1}
                                                                        onChange={(e) => { const val = parseInt(e.target.value) || 0; const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableBorderInsideHWidth: val } : it); update({ drawElements: next }); syncUpdate({ drawElements: next }); }}
                                                                        onMouseDown={e => e.stopPropagation()}
                                                                        className="w-full bg-transparent text-[11px] font-bold text-gray-700 outline-none"
                                                                    />
                                                                    <span className="text-[9px] text-gray-400">px</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1 flex-wrap">
                                                                {(['solid', 'dashed', 'dotted', 'double', 'none'] as const).map((value) => {
                                                                    const isSelected = (selectedEl.tableBorderInsideHStyle ?? 'solid') === value;
                                                                    return (
                                                                        <button
                                                                            key={value}
                                                                            type="button"
                                                                            title={value === 'solid' ? '실선' : value === 'dashed' ? '대시' : value === 'dotted' ? '점선' : value === 'double' ? '이중선' : '없음'}
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                            onClick={() => { const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableBorderInsideHStyle: value } : it); update({ drawElements: next }); syncUpdate({ drawElements: next }); }}
                                                                            className={`flex items-center justify-center w-7 h-7 rounded border transition-all shrink-0 ${isSelected ? 'border-[#2c3e7c] bg-blue-50 ring-1 ring-[#2c3e7c]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                                                        >
                                                                            {value === 'none' ? (
                                                                                <div className="w-3.5 h-3.5 rounded bg-gray-200" />
                                                                            ) : (
                                                                                <div className="w-3.5 h-3.5 rounded bg-white" style={{ borderWidth: 1.5, borderStyle: value, borderColor: isSelected ? '#2c3e7c' : '#94a3b8' }} />
                                                                            )}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[10px] text-gray-500 font-medium pl-0.5">안쪽 세로선</span>
                                                            <div className="flex items-center gap-2">
                                                                <div className="relative w-6 h-6 rounded border border-gray-200 shadow-sm overflow-hidden flex-shrink-0">
                                                                    <input
                                                                        type="color"
                                                                        value={selectedEl.tableBorderInsideV || selectedEl.stroke || '#cbd5e1'}
                                                                        onChange={(e) => { const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableBorderInsideV: e.target.value } : it); update({ drawElements: next }); syncUpdate({ drawElements: next }); }}
                                                                        onMouseDown={e => e.stopPropagation()}
                                                                        className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                                                                    />
                                                                    <div className="w-full h-full" style={{ backgroundColor: selectedEl.tableBorderInsideV || selectedEl.stroke || '#cbd5e1' }} />
                                                                </div>
                                                                <div className="flex items-center gap-1 bg-gray-50 rounded px-1.5 py-1 border border-gray-100 flex-1">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        max="10"
                                                                        value={selectedEl.tableBorderInsideVWidth ?? selectedEl.strokeWidth ?? 1}
                                                                        onChange={(e) => { const val = parseInt(e.target.value) || 0; const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableBorderInsideVWidth: val } : it); update({ drawElements: next }); syncUpdate({ drawElements: next }); }}
                                                                        onMouseDown={e => e.stopPropagation()}
                                                                        className="w-full bg-transparent text-[11px] font-bold text-gray-700 outline-none"
                                                                    />
                                                                    <span className="text-[9px] text-gray-400">px</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1 flex-wrap">
                                                                {(['solid', 'dashed', 'dotted', 'double', 'none'] as const).map((value) => {
                                                                    const isSelected = (selectedEl.tableBorderInsideVStyle ?? 'solid') === value;
                                                                    return (
                                                                        <button
                                                                            key={value}
                                                                            type="button"
                                                                            title={value === 'solid' ? '실선' : value === 'dashed' ? '대시' : value === 'dotted' ? '점선' : value === 'double' ? '이중선' : '없음'}
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                            onClick={() => { const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableBorderInsideVStyle: value } : it); update({ drawElements: next }); syncUpdate({ drawElements: next }); }}
                                                                            className={`flex items-center justify-center w-7 h-7 rounded border transition-all shrink-0 ${isSelected ? 'border-[#2c3e7c] bg-blue-50 ring-1 ring-[#2c3e7c]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                                                        >
                                                                            {value === 'none' ? (
                                                                                <div className="w-3.5 h-3.5 rounded bg-gray-200" />
                                                                            ) : (
                                                                                <div className="w-3.5 h-3.5 rounded bg-white" style={{ borderWidth: 1.5, borderStyle: value, borderColor: isSelected ? '#2c3e7c' : '#94a3b8' }} />
                                                                            )}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </>)}
                                                </div>

                                                {/* Border Radius Settings */}
                                                {!(selectedCellIndices.length > 0 && editingTableId === selectedEl.id) && (
                                                    <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                                                        <div className="flex items-center gap-1.5 text-gray-700">
                                                            <Circle size={10} className="text-gray-400" />
                                                            <span className="text-[10px] font-medium pl-0.5">테두리 곡률</span>
                                                        </div>

                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5 border border-gray-100">
                                                                <div className="w-2.5 h-2.5 border-2 border-gray-400 rounded-md" />
                                                                <div className="flex-1 flex gap-2 items-center">
                                                                    <input
                                                                        type="range"
                                                                        min="0"
                                                                        max="20"
                                                                        step="1"
                                                                        value={selectedEl.tableBorderRadius ?? 0}
                                                                        onChange={(e) => {
                                                                            const val = parseInt(e.target.value) || 0;
                                                                            const next = drawElements.map(it => it.id === selectedEl.id ? {
                                                                                ...it,
                                                                                tableBorderRadius: val,
                                                                                tableBorderRadiusTopLeft: val,
                                                                                tableBorderRadiusTopRight: val,
                                                                                tableBorderRadiusBottomLeft: val,
                                                                                tableBorderRadiusBottomRight: val
                                                                            } : it);
                                                                            update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                        }}
                                                                        onMouseDown={e => e.stopPropagation()}
                                                                        className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                                    />
                                                                    <span className="text-[10px] text-gray-700 font-mono w-4 text-right">{selectedEl.tableBorderRadius ?? 0}</span>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {[
                                                                    { key: 'tableBorderRadiusTopLeft', iconClass: 'border-t-2 border-l-2 rounded-tl-md' },
                                                                    { key: 'tableBorderRadiusTopRight', iconClass: 'border-t-2 border-r-2 rounded-tr-md' },
                                                                    { key: 'tableBorderRadiusBottomLeft', iconClass: 'border-b-2 border-l-2 rounded-bl-md' },
                                                                    { key: 'tableBorderRadiusBottomRight', iconClass: 'border-b-2 border-r-2 rounded-br-md' },
                                                                ].map(({ key, iconClass }) => (
                                                                    <div key={key} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5 border border-gray-100">
                                                                        <div className={`w-2.5 h-2.5 border-gray-400 ${iconClass}`} />
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            max="100"
                                                                            value={(selectedEl[key as keyof DrawElement] as number) ?? selectedEl.tableBorderRadius ?? 0}
                                                                            onChange={(e) => {
                                                                                const val = parseInt(e.target.value) || 0;
                                                                                const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, [key]: val } : it);
                                                                                update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                            }}
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                            className="w-full bg-transparent text-[11px] text-gray-700 outline-none text-right font-mono"
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Alignment Settings */}
                                            <div className="flex flex-col gap-3 pt-3 border-t border-gray-100">
                                                <div className="flex items-center gap-1.5 text-gray-700">
                                                    <AlignHorizontalJustifyCenter size={12} className="text-gray-400" />
                                                    <span className="text-[11px] font-bold">텍스트 정렬 설정</span>
                                                </div>
                                                <div className="flex flex-col gap-3">
                                                    {/* Horizontal Alignment */}
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="text-[10px] text-gray-500 font-medium pl-0.5">가로 정렬</span>
                                                        <div className="flex p-1 bg-gray-100 rounded-xl gap-1">
                                                            {[
                                                                { id: 'left', icon: <AlignHorizontalJustifyStart size={14} />, label: '왼쪽' },
                                                                { id: 'center', icon: <AlignHorizontalJustifyCenter size={14} />, label: '가운데' },
                                                                { id: 'right', icon: <AlignHorizontalJustifyEnd size={14} />, label: '오른쪽' }
                                                            ].map((opt) => {
                                                                const isAnyCellSelected = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                                                const activeVal = isAnyCellSelected
                                                                    ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.textAlign || selectedEl.textAlign || 'center')
                                                                    : (selectedEl.textAlign || 'center');
                                                                const isActive = activeVal === opt.id;

                                                                return (
                                                                    <button
                                                                        key={opt.id}
                                                                        onMouseDown={e => e.stopPropagation()}
                                                                        onClick={() => {
                                                                            if (isAnyCellSelected) {
                                                                                const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                                                selectedCellIndices.forEach(idx => {
                                                                                    newStyles[idx] = { ...(newStyles[idx] || {}), textAlign: opt.id };
                                                                                });
                                                                                const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableCellStyles: newStyles } : it);
                                                                                update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                            } else {
                                                                                const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, textAlign: opt.id as any } : it);
                                                                                update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                            }
                                                                        }}
                                                                        className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-all ${isActive ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                                        title={opt.label}
                                                                    >
                                                                        {opt.icon}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Vertical Alignment */}
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="text-[10px] text-gray-500 font-medium pl-0.5">세로 정렬</span>
                                                        <div className="flex p-1 bg-gray-100 rounded-xl gap-1">
                                                            {[
                                                                { id: 'top', icon: <AlignVerticalJustifyStart size={14} />, label: '상단' },
                                                                { id: 'middle', icon: <AlignVerticalJustifyCenter size={14} />, label: '중단' },
                                                                { id: 'bottom', icon: <AlignVerticalJustifyEnd size={14} />, label: '하단' }
                                                            ].map((opt) => {
                                                                const isAnyCellSelected = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                                                const activeVal = isAnyCellSelected
                                                                    ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.verticalAlign || selectedEl.verticalAlign || 'middle')
                                                                    : (selectedEl.verticalAlign || 'middle');
                                                                const isActive = activeVal === opt.id;

                                                                return (
                                                                    <button
                                                                        key={opt.id}
                                                                        onMouseDown={e => e.stopPropagation()}
                                                                        onClick={() => {
                                                                            if (isAnyCellSelected) {
                                                                                const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                                                selectedCellIndices.forEach(idx => {
                                                                                    newStyles[idx] = { ...(newStyles[idx] || {}), verticalAlign: opt.id };
                                                                                });
                                                                                const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableCellStyles: newStyles } : it);
                                                                                update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                            } else {
                                                                                const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, verticalAlign: opt.id as any } : it);
                                                                                update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                            }
                                                                        }}
                                                                        className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-all ${isActive ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                                        title={opt.label}
                                                                    >
                                                                        {opt.icon}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Cell color picker */}
                                            <div className="flex flex-col gap-3 pt-3 border-t border-gray-100">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[11px] font-bold text-gray-700">배경색</span>
                                                    {selectedCellIndices.length > 0 && editingTableId === selectedEl.id && (
                                                        <span className="text-[10px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded-full">
                                                            {selectedCellIndices.length}개 선택
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {cellColorPresets.map(color => (
                                                            <button
                                                                key={color}
                                                                onMouseDown={e => e.stopPropagation()}
                                                                onClick={() => {
                                                                    if (selectedCellIndices.length > 0) {
                                                                        // Update selected cells
                                                                        const newCellColors = [...(selectedEl.tableCellColors || Array(totalCells).fill(undefined))] as (string | undefined)[];
                                                                        selectedCellIndices.forEach(idx => { newCellColors[idx] = color === 'transparent' ? undefined : color; });
                                                                        const nextElements = drawElements.map(el => el.id === selectedEl.id ? { ...el, tableCellColors: newCellColors } : el);
                                                                        update({ drawElements: nextElements }); syncUpdate({ drawElements: nextElements });
                                                                    } else {
                                                                        // Update the entire table stroke/fill or all cells
                                                                        const nextElements = drawElements.map(el => el.id === selectedEl.id ? { ...el, fill: color === 'transparent' ? undefined : color } : el);
                                                                        update({ drawElements: nextElements }); syncUpdate({ drawElements: nextElements });
                                                                    }
                                                                }}
                                                                className="w-5 h-5 rounded-full border-2 border-gray-200 hover:border-blue-400 hover:scale-125 transition-all flex items-center justify-center overflow-hidden shadow-sm"
                                                                style={{ backgroundColor: color === 'transparent' ? 'white' : color }}
                                                                title={color === 'transparent' ? '색 없음' : color}
                                                            >
                                                                {color === 'transparent' && <div className="w-full h-[1.5px] bg-red-400 rotate-45" />}
                                                            </button>
                                                        ))}
                                                        <label className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300 hover:border-blue-400 hover:scale-125 transition-all flex items-center justify-center overflow-hidden cursor-pointer relative shadow-sm" title="직접 선택">
                                                            <Plus size={9} className="text-gray-400 pointer-events-none" />
                                                            <input
                                                                type="color"
                                                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                                                onMouseDown={e => e.stopPropagation()}
                                                                onChange={(e) => {
                                                                    const color = e.target.value;
                                                                    const newCellColors = [...(selectedEl.tableCellColors || Array(totalCells).fill(undefined))] as (string | undefined)[];
                                                                    selectedCellIndices.forEach(idx => { newCellColors[idx] = color; });
                                                                    const nextElements = drawElements.map(el => el.id === selectedEl.id ? { ...el, tableCellColors: newCellColors } : el);
                                                                    update({ drawElements: nextElements }); syncUpdate({ drawElements: nextElements });
                                                                }}
                                                            />
                                                        </label>
                                                    </div>
                                                    <button
                                                        onMouseDown={e => e.stopPropagation()}
                                                        onClick={() => {
                                                            const newCellColors = [...(selectedEl.tableCellColors || Array(totalCells).fill(undefined))] as (string | undefined)[];
                                                            selectedCellIndices.forEach(idx => { newCellColors[idx] = undefined; });
                                                            const nextElements = drawElements.map(el => el.id === selectedEl.id ? { ...el, tableCellColors: newCellColors } : el);
                                                            update({ drawElements: nextElements }); syncUpdate({ drawElements: nextElements });
                                                        }}
                                                        className="text-[10px] text-gray-400 hover:text-red-500 transition-colors text-left"
                                                    >색상 초기화</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>,
                                    getPanelPortalRoot()
                                );
                            })()}

                            {/* Layer Panel */}
                            {showLayerPanel && selectedElementIds.length > 0 && createPortal(
                                <LayerPanel
                                    show={showLayerPanel}
                                    selectedElementIds={selectedElementIds}
                                    layerPanelPos={layerPanelPos}
                                    onPositionChange={setLayerPanelPos}
                                    zoom={zoom}
                                    screenToFlowPosition={screenToFlowPosition}
                                    flowToScreenPosition={flowToScreenPosition}
                                    onClose={() => setShowLayerPanel(false)}
                                    onDragStart={() => { isDraggingLayerPanelRef.current = true; }}
                                    onDragEnd={() => { isDraggingLayerPanelRef.current = false; }}
                                    onLayerAction={handleLayerAction}
                                />,
                                getPanelPortalRoot()
                            )}
                        </>
                    )
                }

                <ScreenHandles />
            </div >
        </div >
    );
};

export default memo(ScreenNode);
