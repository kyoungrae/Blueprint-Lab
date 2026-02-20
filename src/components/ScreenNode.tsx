import React, { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { Screen, DrawElement } from '../types/screenDesign';
import { SCREEN_TYPES } from '../types/screenDesign';
import { Plus, Minus, Trash2, Lock, Unlock, Image as ImageIcon, X, Monitor, ChevronDown, Database, Pencil, MousePointer2, Square, Type, Circle, Palette, Layers, GripVertical, ChevronLeft, ChevronRight, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Table2, Settings2, Combine, Split } from 'lucide-react';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useProjectStore } from '../store/projectStore';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';



// ── Editable Cell ────────────────────────
interface EditableCellProps {
    value: string;
    onChange: (val: string) => void;
    onBlur?: (val: string) => void;
    isLocked: boolean;
    placeholder?: string;
    className?: string;
    isSelect?: boolean;
    options?: readonly string[];
    mono?: boolean;
}

const EditableCell: React.FC<EditableCellProps> = memo(({ value, onChange, onBlur, isLocked, placeholder, className = '', isSelect, options, mono }) => {
    if (isSelect && options) {
        return (
            <div className="relative w-full h-full flex items-center">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={(e) => onBlur?.(e.target.value)}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`w-full h-full bg-transparent border-none outline-none text-xs p-1 appearance-none ${isLocked ? 'text-gray-700' : 'nodrag text-gray-900 cursor-pointer hover:bg-blue-50 transition-colors'} ${className}`}
                >
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {!isLocked && <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />}
            </div>
        );
    }
    return (
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onBlur?.(e.target.value)}
            onMouseDown={(e) => !isLocked && e.stopPropagation()}
            disabled={isLocked}
            className={`w-full bg-transparent border-none outline-none text-xs p-1 ${isLocked ? 'text-gray-700' : 'nodrag text-gray-900 hover:bg-blue-50 focus:bg-blue-50 rounded transition-colors'} ${mono ? 'font-mono' : ''} ${className}`}
            placeholder={placeholder}
            spellCheck={false}
        />
    );
});

// ── Screen Node Handles ──────────────────────────────────────
const ScreenHandles = memo(() => (
    <>
        <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ top: -6 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ bottom: -6 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ left: -6 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ right: -6 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
    </>
));

// ── Draw Text Element (Handles Selection & Floating Tooltip) ───────────
const DrawTextComponent = ({
    element,
    isLocked,
    isSelected,
    onUpdate,
    onSelectionChange,
    autoFocus,
    className
}: {
    element: DrawElement,
    isLocked: boolean,
    isSelected: boolean,
    onUpdate: (updates: Partial<DrawElement>) => void,
    onSelectionChange: (rect: DOMRect | null) => void,
    autoFocus?: boolean,
    className?: string
}) => {
    const divRef = useRef<HTMLDivElement>(null);

    // Sync content with element.text (using innerHTML for rich text support)
    useEffect(() => {
        if (divRef.current && divRef.current.innerHTML !== (element.text || '')) {
            divRef.current.innerHTML = element.text || '';
        }
    }, [element.text]);

    useEffect(() => {
        if (autoFocus && divRef.current) {
            divRef.current.focus();
            // Move cursor to end
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(divRef.current);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
    }, [autoFocus]);

    const handleInput = () => {
        if (divRef.current) {
            onUpdate({ text: divRef.current.innerHTML });
        }
    };

    const handleSelect = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (!range.collapsed) {
                const rect = range.getBoundingClientRect();
                onSelectionChange(rect);
                return;
            }
        }
        onSelectionChange(null);
    };

    return (
        <div
            ref={divRef}
            contentEditable={!isLocked && isSelected}
            onInput={handleInput}
            onSelect={handleSelect}
            onMouseUp={handleSelect}
            onKeyUp={handleSelect}
            onBlur={() => {
                handleInput();
                onSelectionChange(null);
            }}
            onMouseDown={(e) => {
                if (isSelected && !isLocked) {
                    e.stopPropagation();
                }
            }}
            className={`outline-none p-0 text-gray-800 break-words min-h-[1.4em] w-full ${!isSelected ? 'pointer-events-none' : 'pointer-events-auto'} ${element.textAlign === 'center' ? 'text-center' : element.textAlign === 'right' ? 'text-right' : 'text-left'} ${className || ''}`}
            style={{
                fontSize: `${element.fontSize || 14}px`,
                color: element.color || '#333333',
                fontWeight: element.fontWeight || 'normal',
                lineHeight: '1.4',
                whiteSpace: 'pre-wrap',
                cursor: isSelected ? 'text' : 'default'
            }}
        />
    );
};

// ── Premium Tooltip Component ─────────────────────────────────────────────
const PremiumTooltip = ({ label, children, dotColor }: { label: string, children: React.ReactNode, dotColor?: string }) => {
    return (
        <div className="relative group/premium-tooltip flex items-center justify-center">
            {children}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-[11px] font-medium rounded-lg shadow-2xl border border-slate-700/50 whitespace-nowrap opacity-0 group-hover/premium-tooltip:opacity-100 transition-all duration-200 pointer-events-none scale-90 group-hover/premium-tooltip:scale-100 z-[310] flex items-center gap-2">
                {dotColor && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />}
                {label}
                {/* Pointer Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-[5px] border-x-transparent border-b-transparent border-t-slate-900/95" />
            </div>
        </div>
    );
};

// ── Screen Node ─────────────────────────────────────────────
interface ScreenNodeData {
    screen: Screen;
}

const ScreenNode: React.FC<NodeProps<ScreenNodeData>> = ({ data, selected }) => {
    const { screen } = data;
    const { updateScreen, deleteScreen } = useScreenDesignStore();
    const { sendOperation } = useSyncStore();
    const { user } = useAuthStore();

    const syncUpdate = (updates: Partial<Screen>) => {
        sendOperation({
            type: 'SCREEN_UPDATE',
            targetId: screen.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: updates
        });
    };

    const isLocked = screen.isLocked ?? true;
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [isTableListOpen, setIsTableListOpen] = React.useState(false);
    const tableListRef = useRef<HTMLDivElement>(null);
    const rightPaneRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Close table list on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (tableListRef.current && !tableListRef.current.contains(e.target as Node)) {
                setIsTableListOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Linked ERD Project Data
    const { projects, currentProjectId } = useProjectStore();
    const currentProject = projects.find(p => p.id === currentProjectId);
    const linkedErdProject = projects.find(p => p.id === currentProject?.linkedErdProjectId);
    // Extract table names safely
    const erdTables = React.useMemo(() => {
        if (!linkedErdProject?.data?.entities) return [];
        return linkedErdProject.data.entities.map(e => e.name).sort();
    }, [linkedErdProject]);

    const hexToRgba = (hex: string, opacity: number = 1) => {
        if (!hex) return 'transparent';
        if (hex === 'transparent') return 'transparent';

        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.substring(1, 3), 16);
            g = parseInt(hex.substring(3, 5), 16);
            b = parseInt(hex.substring(5, 7), 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    const update = (updates: Partial<Screen>) => {
        if (isLocked) return;
        updateScreen(screen.id, updates);
    };

    const handleToggleLock = (e: React.MouseEvent) => {
        e.stopPropagation();
        updateScreen(screen.id, { isLocked: !isLocked });
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`화면 "${screen.name}"을(를) 삭제하시겠습니까?`)) {
            deleteScreen(screen.id);
        }
    };


    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) return alert('이미지 크기는 5MB 이하여야 합니다.');
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                update({ imageUrl: result });
                syncUpdate({ imageUrl: result });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (isLocked) return;
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (isLocked) return;

        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            if (file.size > 5 * 1024 * 1024) return alert('이미지 크기는 5MB 이하여야 합니다.');
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                update({ imageUrl: result });
                syncUpdate({ imageUrl: result });
            };
            reader.readAsDataURL(file);
        }
    };

    const contentMode = screen.contentMode || 'DRAW';

    const handleTabChange = (mode: 'IMAGE' | 'DRAW') => {
        if (isLocked) return;
        update({ contentMode: mode });
        syncUpdate({ contentMode: mode });
    };

    // Label cell style: Navy(#2c3e7c) background, White text
    const labelCell = "bg-[#2c3e7c] text-white text-[11px] font-bold px-3 py-2 border-r border-[#1e2d5e] select-none text-center align-middle whitespace-nowrap";
    // Value cell style
    // Value cell style
    const valueCell = "bg-white text-xs text-gray-800 px-2 py-1 border-r border-[#e2e8f0] align-middle";

    // Image Resizing Logic
    const [imgSize, setImgSize] = useState<{ w: number | undefined, h: number | undefined }>({ w: screen.imageWidth, h: screen.imageHeight });
    const [isImageSelected, setIsImageSelected] = useState(false);
    const resizeStartRef = useRef<{ x: number, y: number, w: number, h: number, dir: string, maxW: number, maxH: number } | null>(null);
    const imageContainerRef = useRef<HTMLDivElement>(null);

    // ── 4. Drawing Mode Logic ──
    const [activeTool, setActiveTool] = useState<'select' | 'rect' | 'circle' | 'text' | 'image' | 'table'>('select');
    const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStartPos, setDrawStartPos] = useState({ x: 0, y: 0 });
    const [tempElement, setTempElement] = useState<DrawElement | null>(null);
    const [draggingElementIds, setDraggingElementIds] = useState<string[]>([]);
    const [dragOffsets, setDragOffsets] = useState<Record<string, { x: number, y: number }>>({});
    const [isMoving, setIsMoving] = useState(false);
    const [showStylePanel, setShowStylePanel] = useState(false);
    const [showLayerPanel, setShowLayerPanel] = useState(false);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [showTablePicker, setShowTablePicker] = useState(false);
    const [tablePickerHover, setTablePickerHover] = useState<{ r: number, c: number } | null>(null);

    const tableRowResizeRef = useRef<{ elId: string, rowIdx: number, startY: number, startHeights: number[] } | null>(null);
    const [editingCellIndex, setEditingCellIndex] = useState<number | null>(null);
    const [selectedCellIndices, setSelectedCellIndices] = useState<number[]>([]);
    const [editingTableId, setEditingTableId] = useState<string | null>(null);
    const [showTablePanel, setShowTablePanel] = useState(false);
    const [tablePanelPos, setTablePanelPos] = useState<{ x: number | string, y: number }>({ x: '50%', y: 64 });
    const isDraggingTablePanelRef = useRef(false);
    const tablePanelDragOffsetRef = useRef({ x: 0, y: 0 });
    const isComposingRef = useRef(false); // IME composition flag (Korean, CJK, etc.)
    const isDraggingCellSelectionRef = useRef(false); // drag-to-select cells
    const dragStartCellIndexRef = useRef<number>(-1); // cell index where drag started

    // Split Dialog State
    const [showSplitDialog, setShowSplitDialog] = useState(false);
    const [splitTarget, setSplitTarget] = useState<{ elId: string, cellIdx: number } | null>(null);
    const [splitRows, setSplitRows] = useState(2);
    const [splitCols, setSplitCols] = useState(1);

    // Panel Dragging State
    const [toolbarPos, setToolbarPos] = useState<{ x: number | string, y: number }>({ x: '50%', y: 16 });
    const isDraggingToolbarRef = useRef(false);
    const toolbarDragOffsetRef = useRef({ x: 0, y: 0 });

    const [stylePanelPos, setStylePanelPos] = useState<{ x: number | string, y: number }>({ x: '50%', y: 64 });
    const isDraggingStylePanelRef = useRef(false);
    const stylePanelDragOffsetRef = useRef({ x: 0, y: 0 });

    const [layerPanelPos, setLayerPanelPos] = useState<{ x: number | string, y: number }>({ x: '50%', y: 64 });
    const isDraggingLayerPanelRef = useRef(false);
    const layerPanelDragOffsetRef = useRef({ x: 0, y: 0 });

    // Reset positions when locked/unlocked
    useEffect(() => {
        setToolbarPos({ x: '50%', y: 200 });
        setStylePanelPos({ x: '50%', y: 240 });
        setLayerPanelPos({ x: '50%', y: 240 });
        setIsToolbarCollapsed(false);
    }, [isLocked]);

    const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
    const [textSelectionRect, setTextSelectionRect] = useState<DOMRect | null>(null);

    const drawElements = screen.drawElements || [];

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
            if (!elementResizeStartRef.current) return;
            const { x, y, elX, elY, w, h, dir, id: targetId } = elementResizeStartRef.current;
            const dx = moveEvent.clientX - x;
            const dy = moveEvent.clientY - y;

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
            const currentElements = useScreenDesignStore.getState().screens.find(s => s.id === screen.id)?.drawElements || [];
            const updated = currentElements.map(item =>
                item.id === targetId ? { ...item, x: nextX, y: nextY, width: nextW, height: nextH } : item
            );
            update({ drawElements: updated });
        };

        const handleWindowMouseUp = () => {
            if (elementResizeStartRef.current) {
                const currentElements = useScreenDesignStore.getState().screens.find(s => s.id === screen.id)?.drawElements || [];
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
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);

        if (activeTool === 'select') {
            // Deselect if clicking on background
            if (e.target === canvasRef.current) {
                setSelectedElementIds([]);
                setEditingTableId(null);
                setEditingTextId(null);
                setSelectedCellIndices([]);
                setEditingCellIndex(null);
            }
            return;
        }

        setIsDrawing(true);
        setDrawStartPos({ x, y });

        const newId = `draw_${Date.now()}`;
        const newElement: DrawElement = {
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
        setTempElement(newElement);
    };

    const handleElementMouseDown = (id: string, e: React.MouseEvent) => {
        if (isLocked || activeTool !== 'select') return;
        e.stopPropagation();

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        let nextSelected = [...selectedElementIds];
        if (e.shiftKey) {
            if (nextSelected.includes(id)) {
                nextSelected = nextSelected.filter(sid => sid !== id);
            } else {
                nextSelected.push(id);
            }
        } else {
            if (!nextSelected.includes(id)) {
                nextSelected = [id];
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

        const offsets: Record<string, { x: number, y: number }> = {};
        nextSelected.forEach(sid => {
            const el = drawElements.find(item => item.id === sid);
            if (el) {
                offsets[sid] = {
                    x: (e.clientX - rect.left) - el.x,
                    y: (e.clientY - rect.top) - el.y
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

    const handleToolbarDragStart = (e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();

        isDraggingToolbarRef.current = true;
        const toolbar = (e.target as HTMLElement).closest('.floating-toolbar') as HTMLElement;
        if (!toolbar || !nodeRef.current) return;

        const toolbarRect = toolbar.getBoundingClientRect();
        const containerRect = nodeRef.current.getBoundingClientRect();
        const scale = containerRect.width / nodeRef.current.clientWidth;

        toolbarDragOffsetRef.current = {
            x: (e.clientX - toolbarRect.left) / scale,
            y: (e.clientY - toolbarRect.top) / scale
        };

        const handleWindowMouseMove = (moveEvent: MouseEvent) => {
            if (!isDraggingToolbarRef.current || !nodeRef.current) return;
            moveEvent.stopImmediatePropagation();

            const cRect = nodeRef.current.getBoundingClientRect();
            const layoutWidth = nodeRef.current.clientWidth;
            const currentScale = cRect.width / layoutWidth;

            const layoutX = (moveEvent.clientX - cRect.left) / currentScale;
            const layoutY = (moveEvent.clientY - cRect.top) / currentScale;

            let newX = layoutX - toolbarDragOffsetRef.current.x;
            let newY = layoutY - toolbarDragOffsetRef.current.y;

            setToolbarPos({ x: newX, y: newY });
        };

        const handleWindowMouseUp = () => {
            isDraggingToolbarRef.current = false;
            window.removeEventListener('mousemove', handleWindowMouseMove, true);
            window.removeEventListener('mouseup', handleWindowMouseUp, true);
        };

        window.addEventListener('mousemove', handleWindowMouseMove, true);
        window.addEventListener('mouseup', handleWindowMouseUp, true);
    };

    const handlePanelDragStart = (e: React.MouseEvent, type: 'style' | 'layer') => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();

        const isStyle = type === 'style';
        if (isStyle) isDraggingStylePanelRef.current = true;
        else isDraggingLayerPanelRef.current = true;

        const panel = (e.target as HTMLElement).closest('.floating-panel') as HTMLElement;
        if (!panel || !nodeRef.current) return;

        const panelRect = panel.getBoundingClientRect();
        const containerRect = nodeRef.current.getBoundingClientRect();
        const scale = containerRect.width / nodeRef.current.clientWidth;

        const offset = {
            x: (e.clientX - panelRect.left) / scale,
            y: (e.clientY - panelRect.top) / scale
        };

        if (isStyle) stylePanelDragOffsetRef.current = offset;
        else layerPanelDragOffsetRef.current = offset;

        const handleWindowMouseMove = (moveEvent: MouseEvent) => {
            if ((isStyle && !isDraggingStylePanelRef.current) || (!isStyle && !isDraggingLayerPanelRef.current) || !nodeRef.current) return;
            moveEvent.stopImmediatePropagation();

            const cRect = nodeRef.current.getBoundingClientRect();
            const layoutWidth = nodeRef.current.clientWidth;
            const currentScale = cRect.width / layoutWidth;

            const layoutX = (moveEvent.clientX - cRect.left) / currentScale;
            const layoutY = (moveEvent.clientY - cRect.top) / currentScale;

            const currentOffset = isStyle ? stylePanelDragOffsetRef.current : layerPanelDragOffsetRef.current;
            let newX = layoutX - currentOffset.x;
            let newY = layoutY - currentOffset.y;

            if (isStyle) setStylePanelPos({ x: newX, y: newY });
            else setLayerPanelPos({ x: newX, y: newY });
        };

        const handleWindowMouseUp = () => {
            if (isStyle) isDraggingStylePanelRef.current = false;
            else isDraggingLayerPanelRef.current = false;
            window.removeEventListener('mousemove', handleWindowMouseMove, true);
            window.removeEventListener('mouseup', handleWindowMouseUp, true);
        };

        window.addEventListener('mousemove', handleWindowMouseMove, true);
        window.addEventListener('mouseup', handleWindowMouseUp, true);
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);

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

        // Moving Logic
        if (draggingElementIds.length > 0) {
            const nextElements = drawElements.map(item => {
                if (draggingElementIds.includes(item.id)) {
                    const offset = dragOffsets[item.id];
                    if (offset) {
                        return {
                            ...item,
                            x: x - offset.x,
                            y: y - offset.y
                        };
                    }
                }
                return item;
            });
            update({ drawElements: nextElements });
        }
    };

    const handleCanvasMouseUp = () => {
        if (isDrawing && tempElement) {
            // Skip if too small (but always allow tables and text)
            if (tempElement.width > 5 || tempElement.height > 5 || tempElement.type === 'text' || tempElement.type === 'table') {
                const nextElements = [...drawElements, tempElement];
                update({ drawElements: nextElements });
                syncUpdate({ drawElements: nextElements });
                setSelectedElementIds([tempElement.id]);
            }
        } else if (draggingElementIds.length > 0) {
            // Finalize move sync
            syncUpdate({ drawElements });
            setDraggingElementIds([]);
            setIsMoving(false);
        }

        setIsDrawing(false);
        setTempElement(null);
        if (activeTool !== 'select') setActiveTool('select');
    };

    const updateElement = (id: string, updates: Partial<DrawElement>) => {
        const nextElements = drawElements.map(el => el.id === id ? { ...el, ...updates } : el);
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
    };

    const deleteElements = (ids: string[]) => {
        const nextElements = drawElements.filter(el => !ids.includes(el.id));
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
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
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedElementIds.length > 0 && (e.key === 'Backspace' || e.key === 'Delete')) {
                // Prevent deletion if focus is on input/textarea
                if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

                // Prevent event from bubbling up to React Flow (which would delete the whole node)
                e.preventDefault();
                e.stopPropagation();

                if (window.confirm(`선택한 ${selectedElementIds.length}개의 그리기 개체를 삭제하시겠습니까?`)) {
                    deleteElements(selectedElementIds);
                }
            }
        };
        // Use capturing phase to catch the event before React Flow
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [selectedElementIds, drawElements]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (imageContainerRef.current && !imageContainerRef.current.contains(e.target as Node)) {
                setIsImageSelected(false);
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setImgSize({ w: screen.imageWidth, h: screen.imageHeight });
    }, [screen.imageWidth, screen.imageHeight]);

    // Resizing Logic for Right Panels
    const [tableHeight, setTableHeight] = useState(screen.tablePanelHeight || 200);
    const [functionHeight, setFunctionHeight] = useState(screen.functionPanelHeight || 250);

    useEffect(() => {
        if (screen.tablePanelHeight) setTableHeight(screen.tablePanelHeight);
    }, [screen.tablePanelHeight]);

    useEffect(() => {
        if (screen.functionPanelHeight) setFunctionHeight(screen.functionPanelHeight);
    }, [screen.functionPanelHeight]);

    const handleTablePanelResize = (e: React.MouseEvent) => {
        if (isLocked) return;
        e.preventDefault();
        e.stopPropagation();

        const container = rightPaneRef.current;
        if (!container) return;

        const startY = e.clientY;
        const startTableH = tableHeight;
        const startFunctionH = functionHeight;
        let finalTableH = startTableH;
        let finalFunctionH = startFunctionH;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const dy = moveEvent.clientY - startY;

            // Dragging UP (dy < 0) -> Table grows, Function shrinks
            // Dragging DOWN (dy > 0) -> Table shrinks, Function grows

            // Constrain 1: Function Details min-height (100)
            // startFunctionH + dy >= 100  =>  dy >= 100 - startFunctionH
            const minDy = 100 - startFunctionH;

            // Constrain 2: Related Tables min-height (100)
            // startTableH - dy >= 100  =>  dy <= startTableH - 100
            const maxDy = startTableH - 100;

            const clampedDy = Math.max(minDy, Math.min(maxDy, dy));

            const newTableH = startTableH - clampedDy;
            const newFunctionH = startFunctionH + clampedDy;

            setTableHeight(newTableH);
            setFunctionHeight(newFunctionH);
            finalTableH = newTableH;
            finalFunctionH = newFunctionH;
        };

        const onMouseUp = () => {
            update({
                tablePanelHeight: finalTableH,
                functionPanelHeight: finalFunctionH
            });
            syncUpdate({
                tablePanelHeight: finalTableH,
                functionPanelHeight: finalFunctionH
            });
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleFunctionPanelResize = (e: React.MouseEvent) => {
        if (isLocked) return;
        e.preventDefault();
        e.stopPropagation();

        const container = rightPaneRef.current;
        if (!container) return;
        const totalHeight = container.clientHeight;

        const startY = e.clientY;
        const startH = functionHeight;
        let finalH = startH;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const dy = moveEvent.clientY - startY;

            // Dragging UP (dy < 0) -> Function grows, Initial Settings shrinks
            // Dragging DOWN (dy > 0) -> Function shrinks, Initial Settings grows

            // Initial Settings is flex-1. Its height is: total - function - table.
            // total - (startH - dy) - tableHeight >= 100
            // startH - dy <= total - tableHeight - 100
            // dy >= startH - (total - tableHeight - 100)
            const minDy = startH - (totalHeight - tableHeight - 100);

            // Function Details min-height (100)
            // startH - dy >= 100  =>  dy <= startH - 100
            const maxDy = startH - 100;

            const clampedDy = Math.max(minDy, Math.min(maxDy, dy));
            const newH = startH - clampedDy;

            setFunctionHeight(newH);
            finalH = newH;
        };

        const onMouseUp = () => {
            update({ functionPanelHeight: finalH });
            syncUpdate({ functionPanelHeight: finalH });
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    // 최대공약수 계산 도우미
    const gcd = (a: number, b: number): number => {
        return b === 0 ? a : gcd(b, a % b);
    };

    const handleExecSplit = (el: DrawElement, cellIdx: number, r: number, c: number) => {
        if (!el.tableRows || isLocked) return;

        const rows = el.tableRows;

        // Ensure tableRowColWidths populated
        let rowColWidths = el.tableRowColWidths ? JSON.parse(JSON.stringify(el.tableRowColWidths)) : undefined;
        let cellData = el.tableCellData ? [...el.tableCellData] : Array(rows * (el.tableCols || 1)).fill('');
        let cellColors = el.tableCellColors ? [...el.tableCellColors] : [];
        let cellStyles = el.tableCellStyles ? [...el.tableCellStyles] : [];

        // Fallback initialization
        if (!rowColWidths) {
            const cols = el.tableCols || 1;
            const singleRowWidths = el.tableColWidths || Array(cols).fill(100 / cols);
            rowColWidths = Array(rows).fill(null).map(() => [...singleRowWidths]);
        }

        // Find target row and col index within that row
        let currentIdx = 0;
        let targetRow = -1;
        let targetColInRow = -1;

        for (let i = 0; i < rows; i++) {
            const colsInRow = rowColWidths[i].length;
            if (cellIdx >= currentIdx && cellIdx < currentIdx + colsInRow) {
                targetRow = i;
                targetColInRow = cellIdx - currentIdx;
                break;
            }
            currentIdx += colsInRow;
        }

        if (targetRow === -1) return;

        let targetEl: DrawElement = { ...el };

        // Apply Column Split (c > 1) - Row Level Isolation
        if (c > 1) {
            const oldWidth = rowColWidths[targetRow][targetColInRow];
            const newWidth = oldWidth / c;
            const newWidths = Array(c).fill(newWidth);

            // Update widths
            rowColWidths[targetRow].splice(targetColInRow, 1, ...newWidths);

            // Update data arrays
            const insertIdx = cellIdx + 1;
            const newItems = Array(c - 1).fill('');
            const newUndefined = Array(c - 1).fill(undefined);

            cellData.splice(insertIdx, 0, ...newItems);
            cellColors.splice(insertIdx, 0, ...newUndefined);
            cellStyles.splice(insertIdx, 0, ...newUndefined);
        }

        // Apply Row Split (r > 1) - Insert Rows logic
        if (r > 1) {
            // Insert r-1 rows after targetRow with same structure
            const templateWidths = [...rowColWidths[targetRow]];
            const newRowsData = Array(r - 1).fill(null).map(() => [...templateWidths]);
            rowColWidths.splice(targetRow + 1, 0, ...newRowsData);

            // Update Row Heights
            const defaultHeights = el.tableRowHeights ? [...el.tableRowHeights] : Array(rows).fill(100 / rows);
            // If heights array is shorter than rows (due to old data), fill it
            while (defaultHeights.length < rows) defaultHeights.push(100 / rows);

            const oldHeight = defaultHeights[targetRow];
            const newHeight = oldHeight / r;
            const newHeights = Array(r).fill(newHeight);

            defaultHeights.splice(targetRow, 1, ...newHeights);

            // Update Data
            // We need to insert empty data for the new rows.
            // Calculate where the new rows start in the flat array.
            // After the split above, targetRow has new length.
            let endOfTargetRowIdx = 0;
            for (let i = 0; i <= targetRow; i++) {
                endOfTargetRowIdx += rowColWidths[i].length;
            }

            const colsInRow = rowColWidths[targetRow].length;
            const totalNewCells = (r - 1) * colsInRow;

            const dataToInsert = Array(totalNewCells).fill('');
            const dataUndefined = Array(totalNewCells).fill(undefined);

            cellData.splice(endOfTargetRowIdx, 0, ...dataToInsert);
            cellColors.splice(endOfTargetRowIdx, 0, ...dataUndefined);
            cellStyles.splice(endOfTargetRowIdx, 0, ...dataUndefined);

            // Normalize heights to sum to 100? Or just let them be?
            // Usually we might want to re-normalize if they Drift, but let's trust the split.

            targetEl.tableRowHeights = defaultHeights;
            targetEl.tableRows = rows + (r - 1);
        }

        targetEl.tableRowColWidths = rowColWidths;
        targetEl.tableCellData = cellData;
        targetEl.tableCellColors = cellColors;
        targetEl.tableCellStyles = cellStyles;
        targetEl.tableCellSpans = undefined; // Clear spans

        const nextElements = drawElements.map(it => it.id === el.id ? targetEl : it);
        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        setSelectedCellIndices([]);
    };

    const handleMergeCells = (selectedEl: DrawElement) => {
        if (!selectedEl.tableCols || !selectedEl.tableRows || selectedCellIndices.length < 2) return;

        const rows = selectedEl.tableRows;
        // Construct or get structure
        let rowColWidths = selectedEl.tableRowColWidths
            ? JSON.parse(JSON.stringify(selectedEl.tableRowColWidths))
            : Array(rows).fill(null).map(() => {
                const c = selectedEl.tableCols || 1;
                return selectedEl.tableColWidths || Array(c).fill(100 / c);
            });

        let cellData = selectedEl.tableCellData ? [...selectedEl.tableCellData] : Array(rows * (selectedEl.tableCols || 1)).fill('');
        let cellColors = selectedEl.tableCellColors ? [...selectedEl.tableCellColors] : [];
        let cellStyles = selectedEl.tableCellStyles ? [...selectedEl.tableCellStyles] : [];

        // Helper to get coordinates
        const getCoords = (idx: number) => {
            let counter = 0;
            for (let r = 0; r < rows; r++) {
                const w = rowColWidths[r];
                if (idx < counter + w.length) {
                    return { r, c: idx - counter };
                }
                counter += w.length;
            }
            return null;
        };

        const coords = selectedCellIndices.map(getCoords).filter(x => x !== null) as { r: number, c: number }[];
        if (!coords.length) return;

        // Group by row
        const rowsMap = new Map<number, number[]>();
        coords.forEach(({ r, c }) => {
            if (!rowsMap.has(r)) rowsMap.set(r, []);
            rowsMap.get(r)!.push(c);
        });

        // Apply merge PER ROW

        // Actually, we must process from Bottom to Top or be careful with indices.
        // Or simpler: Reconstruct the new data arrays completely.

        // It's safer to process modifications on the structured data then flatten.
        // Let's build a structured representation of data first.
        let dataStructure: any[][] = [];
        let colorStructure: any[][] = [];
        let styleStructure: any[][] = [];

        let counter = 0;
        for (let r = 0; r < rows; r++) {
            const cols = rowColWidths[r].length;
            const sliceEnd = counter + cols;
            dataStructure.push(cellData.slice(counter, sliceEnd));
            if (cellColors.length) colorStructure.push(cellColors.slice(counter, sliceEnd));
            if (cellStyles.length) styleStructure.push(cellStyles.slice(counter, sliceEnd));
            counter += cols;
        }

        let changed = false;

        // Iterate rows in the map
        rowsMap.forEach((colIndices, r) => {
            if (colIndices.length < 2) return; // Need at least 2 cells to merge
            colIndices.sort((a, b) => a - b);

            // Check adjacency
            for (let i = 0; i < colIndices.length - 1; i++) {
                if (colIndices[i + 1] !== colIndices[i] + 1) return; // Non-adjacent selection in row, skip
            }

            const startC = colIndices[0];
            const count = colIndices.length;

            // Calculate new width
            const widths = rowColWidths[r];
            let newWidth = 0;
            for (let i = startC; i < startC + count; i++) {
                newWidth += widths[i];
            }

            // Update widths: splice out merged, insert one big
            widths.splice(startC, count, newWidth);

            // Update Data: keep first, remove others
            if (dataStructure[r]) {
                dataStructure[r].splice(startC, count, dataStructure[r][startC]); // Keep one
            }
            if (colorStructure[r] && colorStructure[r].length) {
                colorStructure[r].splice(startC, count, colorStructure[r][startC]);
            }
            if (styleStructure[r] && styleStructure[r].length) {
                styleStructure[r].splice(startC, count, styleStructure[r][startC]);
            }

            changed = true;
        });

        if (changed) {
            // Flatten back
            const newCellData = dataStructure.flat();
            const newCellColors = colorStructure.length ? colorStructure.flat() : undefined;
            const newCellStyles = styleStructure.length ? styleStructure.flat() : undefined;

            const targetEl = {
                ...selectedEl,
                tableRowColWidths: rowColWidths,
                tableCellData: newCellData,
                tableCellColors: newCellColors, // Might need to ensure undefineds are handled
                tableCellStyles: newCellStyles,
                tableCellSpans: undefined // Clear legacy spans
            };

            // Flatten colors/styles properly if they were partial? 
            // The slice approach is safe if arrays were full length. ScreenNode logic usually fills them.

            const nextElements = drawElements.map(el => el.id === selectedEl.id ? targetEl : el);
            update({ drawElements: nextElements });
            syncUpdate({ drawElements: nextElements });
            setSelectedCellIndices([]);
        }
    };

    const handleSplitCells = (selectedEl: DrawElement) => {
        if (!selectedEl.tableCols || !selectedCellIndices.length || isLocked) return;

        // Removing legacy "Unmerge" logic since we now use structural merging.
        // If multiple cells selected, we ignore or could iterate. Currently just take first.

        const cellIdx = selectedCellIndices[0];

        // We don't have spans anymore, so just suggest 2x1 split default
        setSplitTarget({ elId: selectedEl.id, cellIdx });
        setSplitRows(2); // Default to horizontal split
        setSplitCols(1);
        setShowSplitDialog(true);
    };



    const handleResizeStart = (direction: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isLocked) return;

        const imgWrapper = e.currentTarget.parentElement as HTMLDivElement;
        const scrollContainer = imgWrapper.parentElement as HTMLDivElement;
        const currentW = imgWrapper.offsetWidth;
        const currentH = imgWrapper.offsetHeight;

        // Get parent container dimensions to restrict resizing
        // We use scrollWidth/Height if we want to allow growth up to content, but here we want to restrict to *visible* area?
        // User said: "할당된 영역을 넘어가지 못하도록". 
        // If we use scrollContainer.clientWidth, it's the visible width.
        const startMaxW = scrollContainer.clientWidth;
        const startMaxH = scrollContainer.clientHeight;

        resizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            w: currentW,
            h: currentH,
            dir: direction,
            maxW: startMaxW,
            maxH: startMaxH
        };

        const handleWindowMouseMove = (moveEvent: MouseEvent) => {
            if (!resizeStartRef.current) return;
            const { x, y, w, h, dir, maxW, maxH } = resizeStartRef.current;
            const dx = moveEvent.clientX - x;
            const dy = moveEvent.clientY - y;

            let newW = w;
            let newH = h;

            if (dir.includes('e')) newW = w + dx;
            if (dir.includes('w')) newW = w - dx;
            if (dir.includes('s')) newH = h + dy;
            if (dir.includes('n')) newH = h - dy;

            // Constrain to parent container size, keeping min size 50
            newW = Math.max(50, Math.min(maxW, newW));
            newH = Math.max(50, Math.min(maxH, newH));

            setImgSize({ w: newW, h: newH });
        };

        const handleWindowMouseUp = (upEvent: MouseEvent) => {
            if (resizeStartRef.current) {
                const { x, y, w, h, dir, maxW, maxH } = resizeStartRef.current;
                const dx = upEvent.clientX - x;
                const dy = upEvent.clientY - y;

                let newW = w;
                let newH = h;

                if (dir.includes('e')) newW = w + dx;
                if (dir.includes('w')) newW = w - dx;
                if (dir.includes('s')) newH = h + dy;
                if (dir.includes('n')) newH = h - dy;

                newW = Math.max(50, Math.min(maxW, newW));
                newH = Math.max(50, Math.min(maxH, newH));

                update({ imageWidth: newW, imageHeight: newH });
                syncUpdate({ imageWidth: newW, imageHeight: newH });
            }
            resizeStartRef.current = null;
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };

        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
    };



    return (
        <div
            className={`transition-all group relative`}
            style={{ width: 1000, height: 'auto' }}
        >
            <div
                ref={nodeRef}
                className={`bg-white rounded-[15px] shadow-xl border-2 flex flex-col ${selected
                    ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                    : isLocked
                        ? 'border-gray-200 shadow-md'
                        : 'border-[#2c3e7c] shadow-blue-100'
                    }`}>
                {/* Lock Overlay */}
                {isLocked && (
                    <div
                        onDoubleClick={handleToggleLock}
                        className="absolute inset-0 z-[100] cursor-pointer group/mask hover:bg-white/10 transition-all duration-300 rounded-[inherit]"
                    >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-sm px-4 py-3 rounded-2xl shadow-2xl border border-gray-200 opacity-0 group-hover/mask:opacity-100 transition-all transform scale-90 group-hover/mask:scale-100 flex flex-col items-center gap-1.5 pointer-events-none">
                            <Lock size={20} className="text-gray-400" />
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                Double Click to Edit
                            </span>
                        </div>
                    </div>
                )}

                {/* ── 1. Top Header Bar (ERD Style) ── */}
                <div className={`px-4 py-2 flex items-center gap-2 text-white bg-[#2c3e7c] border-b border-white rounded-t-[13px]`}>
                    <Monitor size={16} className="flex-shrink-0 text-white/90" />
                    <input
                        type="text"
                        value={screen.name}
                        onChange={(e) => update({ name: e.target.value })}
                        onBlur={(e) => syncUpdate({ name: e.target.value })}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`${!isLocked ? 'nodrag bg-white/10' : 'bg-transparent pointer-events-none'} border-none focus:ring-0 font-bold text-lg w-full p-0 px-2 outline-none placeholder-white/50 rounded transition-colors disabled:text-white`}
                        placeholder="화면명"
                        spellCheck={false}
                    />

                    {/* Header Actions */}
                    <div className={`flex items-center gap-1 ${isLocked ? 'pointer-events-none opacity-0 group-hover:opacity-100' : ''}`}>
                        <button
                            onClick={handleToggleLock}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="nodrag p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/90 pointer-events-auto"
                            title={isLocked ? "잠금 해제" : "잠금"}
                        >
                            {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                        {!isLocked && (
                            <button
                                onClick={handleDelete}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="nodrag opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-500 rounded-md text-white/90"
                                title="삭제"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── 2. Meta Info Table (Refined) ── */}
                <div className="border-b border-gray-200">
                    <table className="nodrag w-full border-collapse">
                        <tbody>
                            {/* Row 1 */}
                            <tr className="border-b border-[#e2e8f0]">
                                <td className={labelCell} style={{ width: 100 }}>시스템명</td>
                                <td className={valueCell} style={{ width: 180 }}>
                                    <EditableCell value={screen.systemName} onChange={(v) => update({ systemName: v })} onBlur={(v) => syncUpdate({ systemName: v })} isLocked={isLocked} placeholder="시스템명" className="text-center font-bold" />
                                </td>
                                <td className={labelCell} style={{ width: 80 }}>작성자</td>
                                <td className={valueCell} style={{ width: 140 }}>
                                    <EditableCell value={screen.author} onChange={(v) => update({ author: v })} onBlur={(v) => syncUpdate({ author: v })} isLocked={isLocked} placeholder="작성자" className="text-center" />
                                </td>
                                <td className={labelCell} style={{ width: 90 }}>작성일자</td>
                                <td className={`${valueCell} border-r-0`}>
                                    <EditableCell value={screen.createdDate} onChange={(v) => update({ createdDate: v })} onBlur={(v) => syncUpdate({ createdDate: v })} isLocked={isLocked} placeholder="YYYY-MM-DD" mono className="text-center" />
                                </td>
                            </tr>

                            {/* Row 2 */}
                            <tr className="border-b border-[#e2e8f0]">
                                <td className={labelCell}>화면ID</td>
                                <td className={valueCell}>
                                    <EditableCell value={screen.screenId} onChange={(v) => update({ screenId: v })} onBlur={(v) => syncUpdate({ screenId: v })} isLocked={isLocked} placeholder="화면ID" mono className="font-bold text-[#2c3e7c]" />
                                </td>
                                <td className={labelCell}>화면유형</td>
                                <td className={valueCell}>
                                    <EditableCell value={screen.screenType} onChange={(v) => update({ screenType: v })} onBlur={(v) => syncUpdate({ screenType: v })} isLocked={isLocked} isSelect options={SCREEN_TYPES} className="text-center h-full" />
                                </td>
                                <td className={labelCell}>페이지</td>
                                <td className={`${valueCell} border-r-0`}>
                                    <EditableCell value={screen.page} onChange={(v) => update({ page: v })} onBlur={(v) => syncUpdate({ page: v })} isLocked={isLocked} placeholder="1/1" mono className="text-center" />
                                </td>
                            </tr>

                            {/* Row 3 - Description */}
                            <tr>
                                <td className={labelCell}>화면설명</td>
                                <td className={`${valueCell} border-r-0`} colSpan={5}>
                                    <EditableCell value={screen.screenDescription} onChange={(v) => update({ screenDescription: v })} onBlur={(v) => syncUpdate({ screenDescription: v })} isLocked={isLocked} placeholder="화면에 대한 구체적인 설명을 입력하세요" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* ── Tabs (IMAGE vs DRAW) ── */}
                {!isLocked && (
                    <div className="flex bg-gray-50/50 border-b border-gray-200">
                        <button
                            onClick={() => handleTabChange('DRAW')}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`flex-1 py-2 text-[11px] font-bold flex items-center justify-center gap-2 transition-all ${contentMode === 'DRAW'
                                ? 'bg-white text-[#2c3e7c] border-b-2 border-[#2c3e7c] shadow-sm'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            <Pencil size={14} />
                            직접 그리기
                        </button>
                        <button
                            onClick={() => handleTabChange('IMAGE')}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`flex-1 py-2 text-[11px] font-bold flex items-center justify-center gap-2 transition-all ${contentMode === 'IMAGE'
                                ? 'bg-white text-[#2c3e7c] border-b-2 border-[#2c3e7c] shadow-sm'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            <ImageIcon size={14} />
                            이미지 업로드
                        </button>
                    </div>
                )}

                {/* ── 3. Body Content (Split Layout) ── */}
                <div className="flex bg-white min-h-[500px] rounded-[15px]">

                    {/* [LEFT PANE 70%] - Image & Function Items */}
                    <div className="w-[70%] flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50/10 overflow-hidden rounded-bl-[13px]">

                        {/* Content Area Rendering based on contentMode */}
                        {contentMode === 'IMAGE' ? (
                            <div
                                className={`nodrag relative group/image flex-1 flex items-center justify-center overflow-auto transition-colors scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent ${isDragOver && !isLocked
                                    ? 'bg-blue-50 border-2 border-dashed border-blue-400'
                                    : 'bg-white border-b border-gray-200 hover:bg-gray-50'
                                    }`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                {screen.imageUrl ? (
                                    <div
                                        ref={imageContainerRef}
                                        className={`relative inline-block m-auto transition-all ${!isLocked && isImageSelected ? 'border-[3px] border-[#3b82f6]' : 'border-[3px] border-transparent'}`}
                                        style={{ width: imgSize.w, height: imgSize.h, minWidth: 50, minHeight: 50 }}
                                        onMouseDown={() => {
                                            if (!isLocked) {
                                                setIsImageSelected(true);
                                            }
                                        }}
                                    >
                                        <img
                                            src={screen.imageUrl}
                                            alt="UI Mockup"
                                            className="w-full h-full object-contain pointer-events-none select-none block"
                                            draggable={false}
                                        />
                                        {!isLocked && isImageSelected && (
                                            <>
                                                {/* Resize Handles - All Corners */}
                                                <div className="nodrag absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-[#3b82f6] cursor-nwse-resize z-20" onMouseDown={handleResizeStart('nw')} />
                                                <div className="nodrag absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-[#3b82f6] cursor-nesw-resize z-20" onMouseDown={handleResizeStart('ne')} />
                                                <div className="nodrag absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-[#3b82f6] cursor-nesw-resize z-20" onMouseDown={handleResizeStart('sw')} />
                                                <div className="nodrag absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-[#3b82f6] cursor-nwse-resize z-20" onMouseDown={handleResizeStart('se')} />

                                                {/* Delete Button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm('이미지를 삭제하시겠습니까?')) {
                                                            update({ imageUrl: '' });
                                                            syncUpdate({ imageUrl: '' });
                                                        }
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-full opacity-0 hover:opacity-100 transition-all shadow-sm backdrop-blur-sm z-30"
                                                    title="이미지 삭제"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <label className={`flex flex-col items-center justify-center gap-2 p-8 text-gray-300 select-none w-full h-full ${!isLocked ? 'cursor-pointer' : ''}`}>
                                        <div className="w-16 h-16 rounded-2xl bg-gray-50/50 flex items-center justify-center mb-2 border border-dashed border-gray-200">
                                            <ImageIcon size={32} className="opacity-40" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-bold text-gray-400">UI 목업 이미지</p>
                                            <p className="text-[10px] text-gray-400">
                                                {isLocked ? '잠금 상태입니다' : '클릭하여 업로드하거나 이미지를 드래그하세요'}
                                            </p>
                                        </div>
                                        {!isLocked && <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />}
                                    </label>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 overflow-hidden relative flex flex-col bg-white border-b border-gray-200"
                                style={{
                                    backgroundImage: !isLocked ? 'radial-gradient(#d1d5db 1px, transparent 1px)' : 'none',
                                    backgroundSize: '20px 20px'
                                }}
                            >
                                {/* Canvas Viewboard */}
                                <div
                                    ref={canvasRef}
                                    className="nodrag flex-1 relative overflow-hidden outline-none cursor-crosshair h-full"
                                    onMouseDown={handleCanvasMouseDown}
                                    onMouseMove={handleCanvasMouseMove}
                                    onMouseUp={handleCanvasMouseUp}
                                    onMouseLeave={handleCanvasMouseUp}
                                >
                                    {/* Render Existing Elements */}
                                    {drawElements.map((el) => {
                                        const isSelected = selectedElementIds.includes(el.id);
                                        const isDraggingThis = draggingElementIds.includes(el.id);
                                        const commonStyle: React.CSSProperties = {
                                            position: 'absolute',
                                            left: el.x,
                                            top: el.y,
                                            width: el.width,
                                            height: el.height,
                                            zIndex: isDraggingThis ? 9999 : (el.zIndex || 1),
                                            transition: (isDrawing || isMoving) ? 'none' : 'all 0.1s ease',
                                            pointerEvents: isDrawing ? 'none' : 'auto',
                                            opacity: el.opacity !== undefined ? el.opacity : 1
                                        };

                                        return (
                                            <div
                                                key={el.id}
                                                style={commonStyle}
                                                onMouseDown={(e) => handleElementMouseDown(el.id, e)}
                                                onDoubleClick={(e) => handleElementDoubleClick(el.id, e)}
                                                className={`group-canvas-element ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''} ${!isLocked && activeTool === 'select' ? 'cursor-move' : ''}`}
                                            >
                                                {el.type === 'rect' && (
                                                    <div className={`w-full h-full border-2 rounded-sm shadow-sm relative flex overflow-hidden ${el.verticalAlign === 'top' ? 'items-start' : el.verticalAlign === 'bottom' ? 'items-end' : 'items-center'
                                                        } ${el.textAlign === 'left' ? 'justify-start' : el.textAlign === 'right' ? 'justify-end' : 'justify-center'
                                                        }`} style={{ backgroundColor: hexToRgba(el.fill || '#ffffff', el.fillOpacity ?? 1), borderColor: hexToRgba(el.stroke || '#000000', el.strokeOpacity ?? 1) }}>
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
                                                    <div className={`w-full h-full border-2 rounded-full shadow-sm relative flex overflow-hidden ${el.verticalAlign === 'top' ? 'items-start' : el.verticalAlign === 'bottom' ? 'items-end' : 'items-center'
                                                        } ${el.textAlign === 'left' ? 'justify-start' : el.textAlign === 'right' ? 'justify-end' : 'justify-center'
                                                        }`} style={{ backgroundColor: hexToRgba(el.fill || '#ffffff', el.fillOpacity ?? 1), borderColor: hexToRgba(el.stroke || '#000000', el.strokeOpacity ?? 1) }}>
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
                                                {el.type === 'table' && (
                                                    <div
                                                        className="w-full h-full overflow-hidden relative"
                                                        style={{
                                                            borderColor: hexToRgba(el.stroke || '#2c3e7c', el.strokeOpacity ?? 1),
                                                            border: `${el.strokeWidth || 1}px solid ${hexToRgba(el.stroke || '#2c3e7c', el.strokeOpacity ?? 1)}`,
                                                            cursor: editingTableId === el.id ? 'default' : 'move',
                                                            outline: editingTableId === el.id ? '2px solid #3b82f6' : 'none',
                                                            outlineOffset: '1px',
                                                            userSelect: editingTableId === el.id ? 'none' : 'auto'
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
                                                        <div
                                                            className="w-full h-full border-collapse overflow-hidden flex flex-col"
                                                            style={{
                                                                // Removed gridTemplateRows/Columns
                                                            }}
                                                        >
                                                            {(() => {
                                                                const rows = el.tableRows || 3;
                                                                const rowColWidths = el.tableRowColWidths;
                                                                const cols = el.tableCols || 3;
                                                                const globalWidths = el.tableColWidths || Array(cols).fill(100 / cols);
                                                                const rowHeights = el.tableRowHeights || Array(rows).fill(100 / rows);

                                                                let cellIdxCounter = 0;

                                                                return Array.from({ length: rows }).map((_, r) => {
                                                                    const currentWidths = rowColWidths ? rowColWidths[r] : globalWidths;
                                                                    const rowHeight = rowHeights[r];

                                                                    return (
                                                                        <div
                                                                            key={r}
                                                                            className="flex w-full relative"
                                                                            style={{ height: `${rowHeight}%` }}
                                                                        >
                                                                            {currentWidths.map((width, c) => {
                                                                                const cellIndex = cellIdxCounter++;
                                                                                const cellData = el.tableCellData?.[cellIndex] || '';
                                                                                const cellColor = el.tableCellColors?.[cellIndex];
                                                                                const cellStyle = el.tableCellStyles?.[cellIndex] || {};
                                                                                const isCellSelected = editingTableId === el.id && selectedCellIndices.includes(cellIndex);
                                                                                const isCellEditing = editingTableId === el.id && editingCellIndex === cellIndex;
                                                                                const isHeaderRow = r === 0;
                                                                                const defaultBg = isHeaderRow ? hexToRgba('#2c3e7c', 0.1) : '#ffffff';

                                                                                const borderTop = `${cellStyle.borderTopWidth ?? el.tableBorderTopWidth ?? el.strokeWidth ?? 1}px solid ${cellStyle.borderTop || el.tableBorderTop || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`;
                                                                                const borderBottom = `${cellStyle.borderBottomWidth ?? el.tableBorderBottomWidth ?? el.strokeWidth ?? 1}px solid ${cellStyle.borderBottom || el.tableBorderBottom || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`;
                                                                                const borderLeft = `${cellStyle.borderLeftWidth ?? el.tableBorderLeftWidth ?? el.strokeWidth ?? 1}px solid ${cellStyle.borderLeft || el.tableBorderLeft || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`;
                                                                                const borderRight = `${cellStyle.borderRightWidth ?? el.tableBorderRightWidth ?? el.strokeWidth ?? 1}px solid ${cellStyle.borderRight || el.tableBorderRight || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`;

                                                                                return (
                                                                                    <div
                                                                                        key={cellIndex}
                                                                                        className={`relative px-1 py-0.5 text-[10px] leading-tight flex items-center justify-center overflow-hidden h-full ${isHeaderRow && !cellColor ? 'font-bold text-[#2c3e7c]' : 'text-gray-700'}`}
                                                                                        style={{
                                                                                            width: `${width}%`,
                                                                                            backgroundColor: cellColor || defaultBg,
                                                                                            borderTop, borderBottom, borderLeft, borderRight,
                                                                                            outline: isCellSelected ? '2px solid #3b82f6' : 'none',
                                                                                            outlineOffset: '-1px',
                                                                                            cursor: editingTableId === el.id ? 'crosshair' : 'default',
                                                                                            textAlign: cellStyle.textAlign || el.textAlign || 'center',
                                                                                            verticalAlign: cellStyle.verticalAlign || el.verticalAlign || 'middle',
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

                                                                                            // Get Coords
                                                                                            const getCoordsInternal = (flatIdx: number) => {
                                                                                                const rList = el.tableRowColWidths || Array(rows).fill(null).map(() => Array(cols).fill(100 / cols));
                                                                                                let ctr = 0;
                                                                                                for (let i = 0; i < rList.length; i++) {
                                                                                                    const len = rList[i].length;
                                                                                                    if (flatIdx < ctr + len) return { r: i, c: flatIdx - ctr };
                                                                                                    ctr += len;
                                                                                                }
                                                                                                return { r: 0, c: 0 };
                                                                                            };

                                                                                            const start = getCoordsInternal(startIdx);
                                                                                            const rMin = Math.min(start.r, r);
                                                                                            const rMax = Math.max(start.r, r);
                                                                                            const cMin = Math.min(start.c, c);
                                                                                            const cMax = Math.max(start.c, c);

                                                                                            const newSelection: number[] = [];
                                                                                            const rList = el.tableRowColWidths || Array(rows).fill(null).map(() => Array(cols).fill(100 / cols));
                                                                                            let ctr = 0;
                                                                                            for (let i = 0; i < rList.length; i++) {
                                                                                                const rowLen = rList[i].length;
                                                                                                if (i >= rMin && i <= rMax) {
                                                                                                    const effectiveCMax = Math.min(cMax, rowLen - 1);
                                                                                                    for (let j = cMin; j <= effectiveCMax; j++) {
                                                                                                        newSelection.push(ctr + j);
                                                                                                    }
                                                                                                }
                                                                                                ctr += rowLen;
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
                                                                                                className="w-full h-full bg-white border-none outline-none resize-none p-1 text-[10px]"
                                                                                                value={cellData}
                                                                                                onChange={(e) => {
                                                                                                    const newData = [...(el.tableCellData || [])];
                                                                                                    newData[cellIndex] = e.target.value;
                                                                                                    const nextElements = drawElements.map(it => it.id === el.id ? { ...it, tableCellData: newData } : it);
                                                                                                    update({ drawElements: nextElements });
                                                                                                }}
                                                                                                onBlur={() => { setEditingCellIndex(null); syncUpdate({ drawElements }); }}
                                                                                                onKeyDown={(e) => {
                                                                                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditingCellIndex(null); syncUpdate({ drawElements }); }
                                                                                                }}
                                                                                            />
                                                                                        ) : (
                                                                                            <div className="w-full h-full flex items-center justify-center whitespace-pre-wrap">{cellData}</div>
                                                                                        )}

                                                                                        {/* Column Resize Handle for this cell */}
                                                                                        {isSelected && !isLocked && selectedElementIds.length === 1 && c < currentWidths.length - 1 && (
                                                                                            <div
                                                                                                className="absolute top-0 bottom-0 right-0 w-[4px] cursor-col-resize z-[10] hover:bg-blue-400 opacity-0 hover:opacity-100 transition-opacity"
                                                                                                style={{ marginRight: -2 }}
                                                                                                onMouseDown={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    e.preventDefault();
                                                                                                    // Need to track row-specific widths
                                                                                                    // But tableColResizeRef structure might need update or we handle it here locally
                                                                                                    // Let's use a temp ref or closure? No, need persistent ref for window events.
                                                                                                    // We can reuse tableColResizeRef but we need to know WHICH row we are editing if we support per-row resize.
                                                                                                    // For now, let's implement per-row resize.
                                                                                                    const startX = e.clientX;
                                                                                                    const startWidths = [...currentWidths];

                                                                                                    const handleMove = (moveE: MouseEvent) => {
                                                                                                        moveE.preventDefault();
                                                                                                        const deltaX = moveE.clientX - startX;
                                                                                                        const deltaPercent = (deltaX / el.width) * 100;
                                                                                                        const newWidths = [...startWidths];
                                                                                                        const minW = 2;
                                                                                                        let w1 = startWidths[c] + deltaPercent;
                                                                                                        let w2 = startWidths[c + 1] - deltaPercent;

                                                                                                        if (w1 < minW) { w2 -= (minW - w1); w1 = minW; }
                                                                                                        if (w2 < minW) { w1 -= (minW - w2); w2 = minW; }

                                                                                                        newWidths[c] = w1;
                                                                                                        newWidths[c + 1] = w2;

                                                                                                        // Update ONLY this row's widths in tableRowColWidths
                                                                                                        const newRowColWidths = el.tableRowColWidths ? JSON.parse(JSON.stringify(el.tableRowColWidths)) : Array(rows).fill(null).map(() => [...globalWidths]);
                                                                                                        newRowColWidths[r] = newWidths;

                                                                                                        updateElement(el.id, { tableRowColWidths: newRowColWidths });
                                                                                                    };

                                                                                                    const handleUp = () => {
                                                                                                        window.removeEventListener('mousemove', handleMove, true);
                                                                                                        window.removeEventListener('mouseup', handleUp, true);
                                                                                                        syncUpdate({ drawElements });
                                                                                                    };

                                                                                                    window.addEventListener('mousemove', handleMove, true);
                                                                                                    window.addEventListener('mouseup', handleUp, true);
                                                                                                }}
                                                                                            />
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    );
                                                                });
                                                            })()}
                                                        </div>


                                                        {/* Row Resize Handles */}
                                                        {isSelected && !isLocked && selectedElementIds.length === 1 && (() => {
                                                            const rows = el.tableRows || 3;
                                                            const heights = el.tableRowHeights || Array(rows).fill(100 / rows);
                                                            let accPercent = 0;
                                                            return Array.from({ length: rows - 1 }).map((_, idx) => {
                                                                accPercent += heights[idx];
                                                                return (
                                                                    <div
                                                                        key={`row-resize-${idx}`}
                                                                        className="absolute left-0 right-0 cursor-row-resize z-[120] group/rowresize"
                                                                        style={{ top: `${accPercent}%`, height: 8, marginTop: -4 }}
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
                                                                                tableRowResizeRef.current = null;
                                                                                window.removeEventListener('mousemove', handleMove, true);
                                                                                window.removeEventListener('mouseup', handleUp, true);
                                                                                syncUpdate({ drawElements });
                                                                            };
                                                                            window.addEventListener('mousemove', handleMove, true);
                                                                            window.addEventListener('mouseup', handleUp, true);
                                                                        }}
                                                                    >
                                                                        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[2px] bg-blue-400 opacity-0 group-hover/rowresize:opacity-100 transition-opacity" />
                                                                    </div>
                                                                );
                                                            });
                                                        })()}
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

                                                {/* Resize Handles */}
                                                {isSelected && !isLocked && selectedElementIds.length === 1 && (
                                                    <>
                                                        {/* Corners */}
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'nw', e)} className="absolute -top-[5px] -left-[5px] w-[10px] h-[10px] bg-white border-[1.5px] border-blue-500 rounded-full shadow-sm hover:scale-150 hover:border-blue-600 transition-all duration-200 ease-out cursor-nw-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'ne', e)} className="absolute -top-[5px] -right-[5px] w-[10px] h-[10px] bg-white border-[1.5px] border-blue-500 rounded-full shadow-sm hover:scale-150 hover:border-blue-600 transition-all duration-200 ease-out cursor-ne-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'sw', e)} className="absolute -bottom-[5px] -left-[5px] w-[10px] h-[10px] bg-white border-[1.5px] border-blue-500 rounded-full shadow-sm hover:scale-150 hover:border-blue-600 transition-all duration-200 ease-out cursor-sw-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'se', e)} className="absolute -bottom-[5px] -right-[5px] w-[10px] h-[10px] bg-white border-[1.5px] border-blue-500 rounded-full shadow-sm hover:scale-150 hover:border-blue-600 transition-all duration-200 ease-out cursor-se-resize z-[105]" />

                                                        {/* Middles */}
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'n', e)} className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] bg-white border-[1.5px] border-blue-500 rounded-full shadow-sm hover:scale-150 hover:border-blue-600 transition-all duration-200 ease-out cursor-n-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 's', e)} className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] bg-white border-[1.5px] border-blue-500 rounded-full shadow-sm hover:scale-150 hover:border-blue-600 transition-all duration-200 ease-out cursor-s-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'w', e)} className="absolute top-1/2 -translate-y-1/2 -left-[5px] w-[10px] h-[10px] bg-white border-[1.5px] border-blue-500 rounded-full shadow-sm hover:scale-150 hover:border-blue-600 transition-all duration-200 ease-out cursor-w-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'e', e)} className="absolute top-1/2 -translate-y-1/2 -right-[5px] w-[10px] h-[10px] bg-white border-[1.5px] border-blue-500 rounded-full shadow-sm hover:scale-150 hover:border-blue-600 transition-all duration-200 ease-out cursor-e-resize z-[105]" />
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
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* [RIGHT PANE 30%] - Details & Settings */}
                    <div ref={rightPaneRef} className="w-[30%] flex-shrink-0 flex flex-col bg-white rounded-br-[13px]" style={{ minWidth: 250 }}>
                        {/* Panel 1: 초기화면설정 */}
                        <div className="flex-1 flex flex-col border-b border-gray-200 min-h-[100px]">
                            <div className="bg-[#5c6b9e] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a588a] select-none shadow-sm flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 초기화면설정
                            </div>
                            <div className="flex-1 p-0 relative group/area">
                                <textarea
                                    value={screen.initialSettings}
                                    onChange={(e) => update({ initialSettings: e.target.value })}
                                    onBlur={(e) => syncUpdate({ initialSettings: e.target.value })}
                                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                                    disabled={isLocked}
                                    className={`w-full h-full text-[11px] leading-relaxed bg-transparent border-none outline-none p-3 resize-none scrollbar-thin ${isLocked ? 'text-gray-600' : 'nodrag text-gray-800 bg-white hover:bg-blue-50/10 focus:bg-blue-50/10 transition-colors'}`}
                                    placeholder="• 화면 진입 시 초기 설정..."
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        {/* Panel 2: 기능상세 */}
                        <div
                            className="flex-none flex flex-col border-b border-gray-200 relative min-h-[100px]"
                            style={{ height: functionHeight }}
                        >
                            {/* Resize Handle at the Top Border */}
                            {!isLocked && (
                                <div
                                    className="nodrag absolute -top-1 left-0 right-0 h-2 cursor-ns-resize z-[60] group/hr"
                                    onMouseDown={handleFunctionPanelResize}
                                >
                                    <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-transparent group-hover/hr:bg-blue-400 transition-colors" />
                                </div>
                            )}

                            <div className="bg-[#5c6b9e] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a588a] select-none shadow-sm flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 기능상세
                            </div>
                            <div className="flex-1 p-0 relative group/area">
                                <textarea
                                    value={screen.functionDetails}
                                    onChange={(e) => update({ functionDetails: e.target.value })}
                                    onBlur={(e) => syncUpdate({ functionDetails: e.target.value })}
                                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                                    disabled={isLocked}
                                    className={`w-full h-full text-[11px] leading-relaxed bg-transparent border-none outline-none p-3 resize-none scrollbar-thin ${isLocked ? 'text-gray-600' : 'nodrag text-gray-800 bg-white hover:bg-blue-50/10 focus:bg-blue-50/10 transition-colors'}`}
                                    placeholder="1. 상세 기능 설명 입력...&#13;&#10;2. 주요 로직 기술..."
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        {/* Panel 3: 관련테이블 */}
                        <div
                            className="flex-none flex flex-col relative min-h-[100px]"
                            style={{ height: tableHeight }}
                        >
                            {/* Resize Handle at the Top Border */}
                            {!isLocked && (
                                <div
                                    className="nodrag absolute -top-1 left-0 right-0 h-2 cursor-ns-resize z-[60] group/hr"
                                    onMouseDown={handleTablePanelResize}
                                >
                                    <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-transparent group-hover/hr:bg-blue-400 transition-colors" />
                                </div>
                            )}

                            {/* Header (Contains the dropdown trigger - Overflow must be visible here) */}
                            <div className="bg-[#5e6b7c] text-white text-[11px] font-bold px-3 py-1.5 border-t border-b border-[#4a5463] select-none shadow-sm flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 관련테이블
                                </div>
                                {/* ERD Table Selector */}
                                {!isLocked && linkedErdProject && (
                                    <div className="relative" ref={tableListRef}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsTableListOpen(!isTableListOpen);
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            className="nodrag flex items-center gap-1 text-[9px] bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded transition-colors"
                                        >
                                            <Database size={10} />
                                            <span>추가</span>
                                        </button>
                                        {isTableListOpen && (
                                            <div
                                                ref={(el) => {
                                                    if (el) {
                                                        el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
                                                    }
                                                }}
                                                className="nodrag nopan absolute right-0 top-full mt-1 w-48 max-h-56 overflow-y-auto bg-white border border-gray-200 shadow-xl rounded-lg z-[1001] animate-in fade-in zoom-in duration-150 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
                                                onWheel={(e) => e.stopPropagation()}
                                                onWheelCapture={(e) => e.stopPropagation()}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                <div className="p-1">
                                                    {erdTables.length > 0 ? erdTables.map(table => (
                                                        <button
                                                            key={table}
                                                            className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-[10px] text-gray-700 rounded block"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const current = screen.relatedTables || '';
                                                                const toAdd = `• ${table}`;
                                                                if (!current.includes(table)) {
                                                                    const newValue = current ? `${current}\n${toAdd}` : toAdd;
                                                                    update({ relatedTables: newValue });
                                                                    syncUpdate({ relatedTables: newValue });
                                                                }
                                                                setIsTableListOpen(false);
                                                            }}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                        >
                                                            {table}
                                                        </button>
                                                    )) : (
                                                        <div className="px-2 py-2 text-[10px] text-gray-400 text-center">테이블이 없습니다</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Content Area - Scrollable list and Manual Input, clipped to node rounding */}
                            <div className="flex-1 flex flex-col bg-white overflow-hidden rounded-br-[13px]">
                                <div
                                    className="flex-1 overflow-y-auto custom-scrollbar nodrag nopan max-h-[160px] bg-white"
                                    onWheel={(e) => e.stopPropagation()}
                                >
                                    {(() => {
                                        const tableLines = (screen.relatedTables || '').split('\n').filter(line => line.trim() !== '');

                                        if (tableLines.length > 0) {
                                            return (
                                                <div className="p-2">
                                                    <div className="grid grid-cols-2 gap-1 px-1">
                                                        {tableLines.map((line, idx) => {
                                                            const displayLine = line.trim().startsWith('•') ? line.trim().substring(1).trim() : line.trim();
                                                            return (
                                                                <div key={idx} className="flex items-center justify-between group/table p-1.5 hover:bg-blue-50/50 rounded transition-colors text-[10px] font-mono min-w-0">
                                                                    <div className="flex items-center gap-1.5 truncate flex-1">
                                                                        <span className="text-blue-500 font-bold shrink-0 text-[8px]">•</span>
                                                                        <span className="text-gray-700 truncate font-bold" title={displayLine}>{displayLine}</span>
                                                                    </div>
                                                                    {!isLocked && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                const newLines = tableLines.filter((_, i) => i !== idx);
                                                                                const newValue = newLines.join('\n');
                                                                                update({ relatedTables: newValue });
                                                                                syncUpdate({ relatedTables: newValue });
                                                                            }}
                                                                            onMouseDown={(e) => e.stopPropagation()}
                                                                            className="p-1 text-gray-400 hover:text-red-500 transition-all active:scale-90 shrink-0"
                                                                            title="삭제"
                                                                        >
                                                                            <Trash2 size={11} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="flex-1 flex flex-col items-center justify-center p-4 text-gray-300 text-center min-h-[100px]">
                                                <Database size={20} className="opacity-20 mb-2" />
                                                <p className="text-[10px] font-bold">관련 테이블 없음</p>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div> {/* End Right Pane */}
                </div> {/* End Body Split Layout */}

                {/* Relocated Floating Components (Toolbar, Panels) to Root Level for Free Movement */}
                {
                    !isLocked && contentMode === 'DRAW' && (
                        <>
                            {/* Floating Toolbar */}
                            <div
                                className="nodrag floating-toolbar absolute z-[200] flex items-center gap-1 p-1 bg-white/80 border border-gray-200 rounded-xl shadow-xl transition-shadow hover:shadow-2xl"
                                style={{
                                    left: toolbarPos.x,
                                    top: toolbarPos.y,
                                    transform: toolbarPos.x === '50%' ? 'translateX(-50%)' : 'none'
                                }}
                            >
                                {/* Drag Handle */}
                                <PremiumTooltip label="도구 상자 이동">
                                    <div
                                        onMouseDown={handleToolbarDragStart}
                                        className="px-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 border-r border-gray-200 mr-0.5 flex items-center"
                                    >
                                        <GripVertical size={16} />
                                    </div>
                                </PremiumTooltip>

                                {/* Collapse/Expand Toggle */}
                                <PremiumTooltip label={isToolbarCollapsed ? "펼치기" : "접기"}>
                                    <button
                                        onClick={() => {
                                            setIsToolbarCollapsed(!isToolbarCollapsed);
                                            if (!isToolbarCollapsed) {
                                                setShowStylePanel(false);
                                                setShowLayerPanel(false);
                                            }
                                        }}
                                        className="p-1 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        {isToolbarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                                    </button>
                                </PremiumTooltip>

                                {!isToolbarCollapsed && (
                                    <>
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
                                                <div className="relative">
                                                    <PremiumTooltip label="표 삽입">
                                                        <button
                                                            onClick={() => {
                                                                setShowTablePicker(!showTablePicker);
                                                                setTablePickerHover(null);
                                                            }}
                                                            className={`p-2 rounded-lg transition-colors ${showTablePicker ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        >
                                                            <Table2 size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                    {showTablePicker && (
                                                        <div
                                                            className="nodrag absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 z-[300] animate-in fade-in zoom-in duration-150"
                                                            onMouseLeave={() => setTablePickerHover(null)}
                                                        >
                                                            <div className="text-[11px] font-bold text-gray-600 mb-2 flex items-center gap-1.5">
                                                                <Table2 size={12} className="text-[#2c3e7c]" />
                                                                표 삽입
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
                                                                                    onClick={() => {
                                                                                        const rows = rIdx + 1;
                                                                                        const cols = cIdx + 1;
                                                                                        const canvasRect = canvasRef.current?.getBoundingClientRect();
                                                                                        const cx = canvasRect ? canvasRect.width / 2 - (cols * 60) / 2 : 50;
                                                                                        const cy = canvasRect ? canvasRect.height / 2 - (rows * 30) / 2 : 50;
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
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Table Panel Button — shown only when a table is selected */}
                                                {(() => {
                                                    const selEl = drawElements.find(el => selectedElementIds.includes(el.id));
                                                    if (!selEl || selEl.type !== 'table') return null;
                                                    return <div className="flex items-center gap-1 border-l border-gray-200 pl-1 ml-1">
                                                        <PremiumTooltip label="표 설정">
                                                            <button
                                                                onClick={() => setShowTablePanel(prev => !prev)}
                                                                className={`p-2 rounded-lg transition-colors ${showTablePanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                            >
                                                                <Settings2 size={18} />
                                                            </button>
                                                        </PremiumTooltip>
                                                        <PremiumTooltip label="셀 배경색">
                                                            <button
                                                                onClick={() => {
                                                                    setShowTablePanel(true);
                                                                    // Focus on the cell color section if needed (already visible in panel)
                                                                }}
                                                                className={`p-2 rounded-lg transition-colors ${showTablePanel && selectedCellIndices.length > 0 ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                            >
                                                                <Palette size={18} />
                                                            </button>
                                                        </PremiumTooltip>
                                                    </div>
                                                        ;
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
                                                <PremiumTooltip label="이미지">
                                                    <button
                                                        onClick={() => setActiveTool('image')}
                                                        className={`p-2 rounded-lg transition-colors ${activeTool === 'image' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                    >
                                                        <ImageIcon size={18} />
                                                    </button>
                                                </PremiumTooltip>
                                            </div>
                                        </div>

                                        {selectedElementIds.length > 0 && (
                                            <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1 animate-in fade-in duration-200">
                                                <div className="flex gap-0.5 bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                                                    {(['left', 'center', 'right'] as const).map((align) => (
                                                        <PremiumTooltip key={align} label={textSelectionRect ? `텍스트 ${align === 'left' ? '왼쪽' : align === 'right' ? '오른쪽' : '중앙'} 정렬` : `캔버스 ${align === 'left' ? '왼쪽' : align === 'right' ? '오른쪽' : '중앙'} 정렬`}>
                                                            <button
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
                                                    <button
                                                        onClick={() => handleObjectAlign('align-left')}
                                                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                        title="객체 왼쪽 정렬"
                                                    >
                                                        <AlignHorizontalJustifyStart size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleObjectAlign('align-center-h')}
                                                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                        title="객체 가로 중앙 정렬"
                                                    >
                                                        <AlignHorizontalJustifyCenter size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleObjectAlign('align-right')}
                                                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                        title="객체 오른쪽 정렬"
                                                    >
                                                        <AlignHorizontalJustifyEnd size={16} />
                                                    </button>
                                                </div>
                                                <div className="flex gap-0.5 bg-gradient-to-r from-indigo-50 to-blue-50 p-0.5 rounded-lg border border-indigo-100">
                                                    <button
                                                        onClick={() => handleObjectAlign('align-top')}
                                                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                        title="객체 상단 정렬"
                                                    >
                                                        <AlignVerticalJustifyStart size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleObjectAlign('align-center-v')}
                                                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                        title="객체 세로 중앙 정렬"
                                                    >
                                                        <AlignVerticalJustifyCenter size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleObjectAlign('align-bottom')}
                                                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                                                        title="객체 하단 정렬"
                                                    >
                                                        <AlignVerticalJustifyEnd size={16} />
                                                    </button>
                                                </div>
                                                {selectedElementIds.length >= 3 && (
                                                    <div className="flex gap-0.5 bg-gradient-to-r from-purple-50 to-pink-50 p-0.5 rounded-lg border border-purple-100">
                                                        <button
                                                            onClick={() => handleObjectAlign('distribute-h')}
                                                            className="p-1.5 rounded-md transition-all text-purple-400 hover:text-purple-600 hover:bg-white hover:shadow-sm"
                                                            title="가로 균등 분배"
                                                        >
                                                            <AlignHorizontalDistributeCenter size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleObjectAlign('distribute-v')}
                                                            className="p-1.5 rounded-md transition-all text-purple-400 hover:text-purple-600 hover:bg-white hover:shadow-sm"
                                                            title="세로 균등 분배"
                                                        >
                                                            <AlignVerticalDistributeCenter size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1 animate-in fade-in duration-200">
                                            <PremiumTooltip label="색상 및 스타일">
                                                <button
                                                    onClick={() => {
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
                                                    onClick={() => {
                                                        setShowLayerPanel(!showLayerPanel);
                                                        setShowStylePanel(false);
                                                    }}
                                                    className={`p-2 rounded-lg transition-colors ${showLayerPanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                >
                                                    <Layers size={18} />
                                                </button>
                                            </PremiumTooltip>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* ─── Floating Text Selection Toolbar (Below Toolbox) ─── */}
                            {textSelectionRect && selectedElementIds.length > 0 && (() => {
                                const el = drawElements.find(it => it.id === selectedElementIds[0]);
                                if (!el) return null;
                                return (
                                    <div
                                        className="nodrag absolute z-[201] flex items-center gap-2 bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-2xl p-2 animate-in fade-in zoom-in slide-in-from-top-2 duration-200"
                                        style={{
                                            left: toolbarPos.x,
                                            top: (typeof toolbarPos.y === 'number' ? toolbarPos.y : 20) + 55,
                                            transform: toolbarPos.x === '50%' ? 'translateX(-50%)' : 'none'
                                        }}
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <div className="flex items-center gap-1.5 px-1 border-r border-gray-100 pr-2">
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
                                                            // Force update text to save HTML
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
                                                            // Prevent focus loss to keep selection
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
                                );
                            })()}

                            {/* Style Panel */}
                            {selectedElementIds.length > 0 && showStylePanel && !isToolbarCollapsed && (
                                <div
                                    className="nodrag floating-panel absolute z-[210] bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[240px] animate-in fade-in zoom-in duration-200"
                                    style={{
                                        left: stylePanelPos.x,
                                        top: stylePanelPos.y,
                                        transform: stylePanelPos.x === '50%' ? 'translateX(-50%)' : 'none'
                                    }}
                                >
                                    <div
                                        className="flex items-center justify-between border-b border-gray-100 pb-2 mb-1 cursor-grab active:cursor-grabbing group/header"
                                        onMouseDown={(e) => handlePanelDragStart(e, 'style')}
                                        title="드래그하여 이동"
                                    >
                                        <div className="flex items-center gap-2">
                                            <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                                            <Palette size={14} className="text-[#2c3e7c]" />
                                            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">스타일 편집 ({selectedElementIds.length})</span>
                                        </div>
                                        <button onClick={() => setShowStylePanel(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors">
                                            <X size={14} />
                                        </button>
                                    </div>

                                    {/* Background Color */}
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] text-gray-600 font-medium">배경색</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-gray-400 font-mono uppercase">{drawElements.find(el => selectedElementIds.includes(el.id))?.fill || '#ffffff'}</span>
                                                <div className="relative w-6 h-6 rounded-lg border border-gray-200 overflow-hidden shadow-sm hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer">
                                                    <input
                                                        type="color"
                                                        value={drawElements.find(el => selectedElementIds.includes(el.id))?.fill || '#ffffff'}
                                                        onChange={(e) => {
                                                            const color = e.target.value;
                                                            const nextElements = drawElements.map(el =>
                                                                selectedElementIds.includes(el.id) ? { ...el, fill: color } : el
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
                                            {['#ffffff', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#2c3e7c'].map(color => (
                                                <button
                                                    key={color}
                                                    onClick={() => {
                                                        const nextElements = drawElements.map(el =>
                                                            selectedElementIds.includes(el.id) ? { ...el, fill: color } : el
                                                        );
                                                        update({ drawElements: nextElements });
                                                        syncUpdate({ drawElements: nextElements });
                                                    }}
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

                                    {/* [Table settings and cell color picker moved to dedicated Table Panel] */}

                                    {/* [Cell color picker moved to dedicated Table Panel] */}
                                </div>
                            )}



                            {/* ─── Table Panel ─── */}
                            {(showTablePanel && !isToolbarCollapsed) ? (() => {
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
                                return (
                                    <div
                                        className="nodrag floating-panel absolute z-[210] bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[400px] animate-in fade-in zoom-in"
                                        style={{
                                            left: tablePanelPos.x,
                                            top: tablePanelPos.y,
                                            transform: tablePanelPos.x === '50%' ? 'translateX(-50%)' : 'none'
                                        }}
                                    >
                                        {/* Header */}
                                        <div
                                            className="flex items-center justify-between border-b border-gray-100 pb-2 cursor-grab active:cursor-grabbing group/header"
                                            onMouseDown={(e) => {
                                                if (isLocked) return;
                                                e.stopPropagation();
                                                e.preventDefault();
                                                isDraggingTablePanelRef.current = true;
                                                const panel = (e.target as HTMLElement).closest('.floating-panel') as HTMLElement;
                                                if (!panel || !nodeRef.current) return;
                                                const panelRect = panel.getBoundingClientRect();
                                                const containerRect = nodeRef.current.getBoundingClientRect();
                                                const scale = containerRect.width / nodeRef.current.clientWidth;
                                                tablePanelDragOffsetRef.current = {
                                                    x: (e.clientX - panelRect.left) / scale,
                                                    y: (e.clientY - panelRect.top) / scale
                                                };
                                                const onMove = (me: MouseEvent) => {
                                                    if (!isDraggingTablePanelRef.current || !nodeRef.current) return;
                                                    me.stopImmediatePropagation();
                                                    const cRect = nodeRef.current.getBoundingClientRect();
                                                    const layoutWidth = nodeRef.current.clientWidth;
                                                    const currentScale = cRect.width / layoutWidth;
                                                    const layoutX = (me.clientX - cRect.left) / currentScale;
                                                    const layoutY = (me.clientY - cRect.top) / currentScale;
                                                    setTablePanelPos({
                                                        x: layoutX - tablePanelDragOffsetRef.current.x,
                                                        y: layoutY - tablePanelDragOffsetRef.current.y
                                                    });
                                                };
                                                const onUp = () => {
                                                    isDraggingTablePanelRef.current = false;
                                                    window.removeEventListener('mousemove', onMove, true);
                                                    window.removeEventListener('mouseup', onUp);
                                                };
                                                window.addEventListener('mousemove', onMove, true);
                                                window.addEventListener('mouseup', onUp);
                                            }}
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
                                                                el.id === selectedEl.id ? { ...el, tableRows: newRows, tableCellData: newCellData, tableRowHeights: newRowHeights, tableCellColors: newCellColors } : el
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
                                                                el.id === selectedEl.id ? { ...el, tableRows: newRows, tableCellData: newCellData, tableRowHeights: newRowHeights, tableCellColors: newCellColors } : el
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
                                                                el.id === selectedEl.id ? { ...el, tableCols: newCols, tableCellData: newCellData, tableColWidths: newColWidths, tableCellColors: newCellColors } : el
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
                                                                el.id === selectedEl.id ? { ...el, tableCols: newCols, tableCellData: newCellData, tableColWidths: newColWidths, tableCellColors: newCellColors } : el
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
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                                    {(['Top', 'Bottom', 'Left', 'Right'] as const).map(direction => {
                                                        const colorKey = `tableBorder${direction}` as keyof DrawElement;
                                                        const widthKey = `tableBorder${direction}Width` as keyof DrawElement;
                                                        const styleColorKey = `border${direction}`;
                                                        const styleWidthKey = `border${direction}Width`;
                                                        const label = direction === 'Top' ? '위' : direction === 'Bottom' ? '아래' : direction === 'Left' ? '왼쪽' : '오른쪽';

                                                        // If cells are selected, show first selected cell's border or global as fallback
                                                        const isAnyCellSelected = selectedCellIndices.length > 0 && editingTableId === selectedEl.id;
                                                        const firstCellOverride = isAnyCellSelected ? (selectedEl.tableCellStyles?.[selectedCellIndices[0]] || {}) : {};

                                                        const currentColor = isAnyCellSelected
                                                            ? (firstCellOverride[styleColorKey] || selectedEl[colorKey] || selectedEl.stroke || '#cbd5e1')
                                                            : ((selectedEl[colorKey] as string) || (selectedEl.stroke || '#cbd5e1'));

                                                        const currentWidth = isAnyCellSelected
                                                            ? (firstCellOverride[styleWidthKey] !== undefined ? firstCellOverride[styleWidthKey] : (selectedEl[widthKey] ?? selectedEl.strokeWidth ?? 1))
                                                            : (selectedEl[widthKey] !== undefined ? (selectedEl[widthKey] as number) : (selectedEl.strokeWidth ?? 1));

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
                                                                                    // Update specific cells
                                                                                    const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                                                    selectedCellIndices.forEach(idx => {
                                                                                        newStyles[idx] = { ...(newStyles[idx] || {}), [styleColorKey]: val };
                                                                                    });
                                                                                    const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableCellStyles: newStyles } : it);
                                                                                    update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                                } else {
                                                                                    // Update global table border
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
                                                                                    // Update specific cells
                                                                                    const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                                                    selectedCellIndices.forEach(idx => {
                                                                                        newStyles[idx] = { ...(newStyles[idx] || {}), [styleWidthKey]: val };
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
                                                            </div>
                                                        );
                                                    })}
                                                </div>
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
                                    </div>
                                );
                            })() : null}

                            {/* Layer Panel */}
                            {selectedElementIds.length > 0 && showLayerPanel && !isToolbarCollapsed && (
                                <div
                                    className="nodrag floating-panel absolute z-[210] bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[240px] animate-in fade-in zoom-in duration-200"
                                    style={{
                                        left: layerPanelPos.x,
                                        top: layerPanelPos.y,
                                        transform: layerPanelPos.x === '50%' ? 'translateX(-50%)' : 'none'
                                    }}
                                >
                                    <div
                                        className="flex items-center justify-between border-b border-gray-100 pb-2 mb-1 cursor-grab active:cursor-grabbing group/header"
                                        onMouseDown={(e) => handlePanelDragStart(e, 'layer')}
                                        title="드래그하여 이동"
                                    >
                                        <div className="flex items-center gap-2">
                                            <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                                            <Layers size={14} className="text-[#2c3e7c]" />
                                            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">레이어 순서 변경 ({selectedElementIds.length})</span>
                                        </div>
                                        <button onClick={() => setShowLayerPanel(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors">
                                            <X size={14} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => handleLayerAction('front')}
                                            className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-xl transition-all group"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center group-hover:text-blue-600 transition-colors">
                                                <ChevronDown size={18} className="rotate-180 scale-y-150" />
                                            </div>
                                            <span className="text-[10px] font-bold text-gray-600">맨 앞으로</span>
                                        </button>
                                        <button
                                            onClick={() => handleLayerAction('forward')}
                                            className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-xl transition-all group"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center group-hover:text-blue-600 transition-colors">
                                                <ChevronDown size={18} className="rotate-180" />
                                            </div>
                                            <span className="text-[10px] font-bold text-gray-600">한 단계 위로</span>
                                        </button>
                                        <button
                                            onClick={() => handleLayerAction('backward')}
                                            className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-xl transition-all group"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center group-hover:text-blue-600 transition-colors">
                                                <ChevronDown size={18} />
                                            </div>
                                            <span className="text-[10px] font-bold text-gray-600">한 단계 아래로</span>
                                        </button>
                                        <button
                                            onClick={() => handleLayerAction('back')}
                                            className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-xl transition-all group"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center group-hover:text-blue-600 transition-colors">
                                                <ChevronDown size={18} className="scale-y-150" />
                                            </div>
                                            <span className="text-[10px] font-bold text-gray-600">맨 뒤로</span>
                                        </button>
                                    </div>
                                </div>
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
