import React, { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { Screen, DrawElement, TableCellData } from '../types/screenDesign';
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

    // ── Table V2 Utilities ──────────────────────────────────
    // 1차원 인덱스를 (row, col) 좌표로 변환
    const flatIdxToRowCol = (flatIdx: number, totalCols: number): { r: number, c: number } => {
        return { r: Math.floor(flatIdx / totalCols), c: flatIdx % totalCols };
    };

    // (row, col)을 1차원 인덱스로 변환
    const rowColToFlatIdx = (r: number, c: number, totalCols: number): number => {
        return r * totalCols + c;
    };

    // Legacy tableCellData (string[]) + tableCellSpans를 TableCellData[]로 변환
    const getV2Cells = (el: DrawElement): TableCellData[] => {
        // V2가 이미 있으면 그대로 반환
        if (el.tableCellDataV2 && el.tableCellDataV2.length > 0) {
            return el.tableCellDataV2;
        }

        const rows = el.tableRows || 3;
        const cols = el.tableCols || 3;
        const totalCells = rows * cols;
        const legacyCells = el.tableCellData || Array(totalCells).fill('');
        const legacySpans = el.tableCellSpans;

        const v2Cells: TableCellData[] = [];
        for (let i = 0; i < totalCells; i++) {
            const span = legacySpans?.[i];
            const isHidden = span ? (span.rowSpan === 0 && span.colSpan === 0) : false;
            v2Cells.push({
                content: legacyCells[i] || '',
                rowSpan: span ? (span.rowSpan === 0 ? 1 : span.rowSpan) : 1,
                colSpan: span ? (span.colSpan === 0 ? 1 : span.colSpan) : 1,
                isMerged: isHidden,
            });
        }
        return v2Cells;
    };

    // TableCellData[]를 깊은 복사
    const deepCopyCells = (cells: TableCellData[]): TableCellData[] => {
        return cells.map(c => ({ ...c }));
    };

    // V2 셀 데이터를 요소에 저장하고 동기화
    const saveV2Cells = (elId: string, v2Cells: TableCellData[], extraUpdates?: Partial<DrawElement>) => {
        // Legacy 호환을 위해 tableCellData도 동시에 업데이트
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
    };

    // 최대공약수 계산 도우미
    const gcd = (a: number, b: number): number => {
        return b === 0 ? a : gcd(b, a % b);
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
        setSelectedCellIndices([]);
    };

    const handleMergeCells = (selectedEl: DrawElement) => {
        if (!selectedEl.tableCols || !selectedEl.tableRows || selectedCellIndices.length < 2) return;

        const rows = selectedEl.tableRows;
        const cols = selectedEl.tableCols;

        // Construct or get structure
        let rowColWidths = selectedEl.tableRowColWidths
            ? JSON.parse(JSON.stringify(selectedEl.tableRowColWidths))
            : Array(rows).fill(null).map(() => {
                const c = selectedEl.tableCols || 1;
                return selectedEl.tableColWidths || Array(c).fill(100 / c);
            });

        let cellData = selectedEl.tableCellData ? [...selectedEl.tableCellData] : Array(rows * cols).fill('');
        let cellColors = selectedEl.tableCellColors ? [...selectedEl.tableCellColors] : [];
        let cellStyles = selectedEl.tableCellStyles ? [...selectedEl.tableCellStyles] : [];

        // Get or create V2 cells
        let v2Cells = deepCopyCells(getV2Cells(selectedEl));

        // Helper to get coordinates (supports jagged row widths)
        const getCoords = (idx: number) => {
            let counter = 0;
            for (let r = 0; r < rows; r++) {
                const w = rowColWidths[r];
                if (idx < counter + w.length) {
                    return { r, c: idx - counter, flatIdx: idx };
                }
                counter += w.length;
            }
            return null;
        };

        const coords = selectedCellIndices.map(getCoords).filter(x => x !== null) as { r: number, c: number, flatIdx: number }[];
        if (!coords.length) return;

        // Group by row
        const rowsMap = new Map<number, number[]>();
        coords.forEach(({ r, c }) => {
            if (!rowsMap.has(r)) rowsMap.set(r, []);
            rowsMap.get(r)!.push(c);
        });

        // 1. Attempt Horizontal Structural Merge
        let horizontalChange = false;

        // Build Structure for splice ops
        let dataStructure: any[][] = [];
        let colorStructure: any[][] = [];
        let styleStructure: any[][] = [];

        let counter = 0;
        for (let r = 0; r < rows; r++) {
            const colsInRow = rowColWidths[r].length;
            const sliceEnd = counter + colsInRow;
            dataStructure.push(cellData.slice(counter, sliceEnd));
            if (cellColors.length) colorStructure.push(cellColors.slice(counter, sliceEnd));
            if (cellStyles.length) styleStructure.push(cellStyles.slice(counter, sliceEnd));
            counter += colsInRow;
        }

        rowsMap.forEach((colIndices, r) => {
            if (colIndices.length < 2) return;

            colIndices.sort((a, b) => a - b);
            // Check adjacency
            for (let i = 0; i < colIndices.length - 1; i++) {
                if (colIndices[i + 1] !== colIndices[i] + 1) return;
            }

            const startC = colIndices[0];
            const count = colIndices.length;

            // Update width
            const widths = rowColWidths[r];
            let newWidth = 0;
            for (let i = startC; i < startC + count; i++) {
                newWidth += widths[i];
            }
            widths.splice(startC, count, newWidth);

            // Update Data
            if (dataStructure[r]) dataStructure[r].splice(startC, count, dataStructure[r][startC]);
            if (colorStructure[r] && colorStructure[r].length) colorStructure[r].splice(startC, count, colorStructure[r][startC]);
            if (styleStructure[r] && styleStructure[r].length) styleStructure[r].splice(startC, count, styleStructure[r][startC]);

            horizontalChange = true;
        });

        if (horizontalChange) {
            const newCellData = dataStructure.flat();
            const newCellColors = colorStructure.length ? colorStructure.flat() : undefined;
            const newCellStyles = styleStructure.length ? styleStructure.flat() : undefined;

            const targetEl = {
                ...selectedEl,
                tableRowColWidths: rowColWidths,
                tableCellData: newCellData,
                tableCellColors: newCellColors,
                tableCellStyles: newCellStyles,
                tableCellSpans: undefined,
                tableCellDataV2: undefined, // Reset V2 so it re-derives from legacy
            };

            const nextElements = drawElements.map(el => el.id === selectedEl.id ? targetEl : el);
            update({ drawElements: nextElements });
            syncUpdate({ drawElements: nextElements });
            setSelectedCellIndices([]);
            return;
        }

        // 2. Attempt Vertical/Rectangular Merge (using V2 structure)
        const distinctRows = Array.from(new Set(coords.map(c => c.r))).sort((a, b) => a - b);

        if (distinctRows.length > 1) {
            // Calculate bounding rectangle
            const minRow = Math.min(...coords.map(c => c.r));
            const maxRow = Math.max(...coords.map(c => c.r));
            const minCol = Math.min(...coords.map(c => c.c));
            const maxCol = Math.max(...coords.map(c => c.c));

            const rowSpanVal = maxRow - minRow + 1;
            const colSpanVal = maxCol - minCol + 1;

            // Ensure V2 has correct size (use uniform grid: rows * cols for V2)
            // Note: V2 uses uniform grid, not jagged. If we have jagged widths, V2 spans are metadata-only.
            const totalCells = rows * cols;
            while (v2Cells.length < totalCells) {
                v2Cells.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });
            }

            // Master cell index (top-left of the selection rectangle)
            const masterFlatIdx = rowColToFlatIdx(minRow, minCol, cols);

            // Set master cell
            v2Cells[masterFlatIdx] = {
                ...v2Cells[masterFlatIdx],
                rowSpan: rowSpanVal,
                colSpan: colSpanVal,
                isMerged: false,
            };

            // Set slave cells
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

            // Also update legacy spans for backward compat
            const nextSpans = v2Cells.map(cell => ({
                rowSpan: cell.isMerged ? 0 : cell.rowSpan,
                colSpan: cell.isMerged ? 0 : cell.colSpan,
            }));

            const targetEl = {
                ...selectedEl,
                tableCellDataV2: v2Cells,
                tableCellSpans: nextSpans,
            };
            const nextElements = drawElements.map(el => el.id === selectedEl.id ? targetEl : el);
            update({ drawElements: nextElements });
            syncUpdate({ drawElements: nextElements });
            setSelectedCellIndices([]);
            return;
        }
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
            };
            const nextElements = drawElements.map(el => el.id === selectedEl.id ? targetEl : el);
            update({ drawElements: nextElements });
            syncUpdate({ drawElements: nextElements });
            setSelectedCellIndices([]);
            return;
        }

        // No existing merge → Open split dialog
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
                                                                borderTop: `${el.tableBorderTopWidth ?? el.strokeWidth ?? 1}px solid ${el.tableBorderTop || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                                                                borderBottom: `${el.tableBorderBottomWidth ?? el.strokeWidth ?? 1}px solid ${el.tableBorderBottom || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                                                                borderLeft: `${el.tableBorderLeftWidth ?? el.strokeWidth ?? 1}px solid ${el.tableBorderLeft || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                                                                borderRight: `${el.tableBorderRightWidth ?? el.strokeWidth ?? 1}px solid ${el.tableBorderRight || hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6)}`,
                                                            }}
                                                        >
                                                            {(() => {
                                                                const rows = el.tableRows || 3;
                                                                const cols = el.tableCols || 3;
                                                                const globalWidths = el.tableColWidths || Array(cols).fill(100 / cols);
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
                                                                    const defaultBg = isHeaderRow ? hexToRgba('#2c3e7c', 0.1) : '#ffffff';

                                                                    const cellRowSpan = v2 ? v2.rowSpan : 1;
                                                                    const cellColSpan = v2 ? v2.colSpan : 1;

                                                                    // Determine if edge cell
                                                                    const isLastCol = (c + cellColSpan) === cols;
                                                                    const isLastRow = (r + cellRowSpan) === rows;

                                                                    const globalBorderColor = hexToRgba(el.stroke || '#cbd5e1', el.strokeOpacity ?? 0.6);
                                                                    const globalBorderWidth = el.strokeWidth ?? 1;

                                                                    // Determine borders based on position and overrides
                                                                    const getBorder = (side: 'Top' | 'Bottom' | 'Left' | 'Right', isEdge: boolean) => {
                                                                        const styleKey = `border${side}` as keyof typeof cellStyle;
                                                                        const widthKey = `border${side}Width` as keyof typeof cellStyle;

                                                                        // 1. Cell-specific override?
                                                                        if (cellStyle[styleKey] !== undefined || cellStyle[widthKey] !== undefined) {
                                                                            return `${cellStyle[widthKey] ?? el[`tableBorder${side}Width`] ?? globalBorderWidth}px solid ${cellStyle[styleKey] || el[`tableBorder${side}`] || globalBorderColor}`;
                                                                        }

                                                                        // 2. Default Selective Logic
                                                                        if (side === 'Top' || side === 'Left') return 'none'; // Handled by container or prev cell
                                                                        if (side === 'Right' && isEdge) return 'none'; // Handled by container
                                                                        if (side === 'Bottom' && isEdge) return 'none'; // Handled by container

                                                                        // 3. Inner border
                                                                        return `${globalBorderWidth}px solid ${globalBorderColor}`;
                                                                    };

                                                                    const borderTop = getBorder('Top', r === 0);
                                                                    const borderBottom = getBorder('Bottom', isLastRow);
                                                                    const borderLeft = getBorder('Left', c === 0);
                                                                    const borderRight = getBorder('Right', isLastCol);

                                                                    cellElements.push(
                                                                        <div
                                                                            key={cellIndex}
                                                                            className={`relative px-1 py-0.5 text-[10px] leading-tight flex items-center justify-center ${isHeaderRow && !cellColor ? 'font-bold text-[#2c3e7c]' : 'text-gray-700'}`}
                                                                            style={{
                                                                                gridColumn: cellColSpan > 1 ? `span ${cellColSpan}` : undefined,
                                                                                gridRow: cellRowSpan > 1 ? `span ${cellRowSpan}` : undefined,
                                                                                // backgroundColor: cellColor || defaultBg,
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
                                                                                borderRadius: cellStyle.borderRadius !== undefined ? `${cellStyle.borderRadius}px` : undefined,
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
                                                                                    value={cellData}
                                                                                    onChange={(e) => {
                                                                                        // V2 업데이트
                                                                                        const newV2 = deepCopyCells(getV2Cells(el));
                                                                                        if (newV2[cellIndex]) {
                                                                                            newV2[cellIndex] = { ...newV2[cellIndex], content: e.target.value };
                                                                                        }
                                                                                        // Legacy도 동시 업데이트
                                                                                        const newData = [...(el.tableCellData || [])];
                                                                                        newData[cellIndex] = e.target.value;
                                                                                        const nextElements = drawElements.map(it => it.id === el.id ? { ...it, tableCellData: newData, tableCellDataV2: newV2 } : it);
                                                                                        update({ drawElements: nextElements });
                                                                                    }}
                                                                                    onBlur={() => { setEditingCellIndex(null); syncUpdate({ drawElements }); }}
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

                                                                            {/* Column Resize Handle (between columns) */}
                                                                            {editingTableId === el.id && !isLocked && c + cellColSpan - 1 < cols - 1 && r === 0 && (
                                                                                <div
                                                                                    className="absolute top-0 bottom-0 right-0 w-[6px] cursor-col-resize z-[15] hover:bg-blue-400/60 opacity-0 hover:opacity-100 transition-opacity"
                                                                                    style={{ marginRight: -3 }}
                                                                                    onMouseDown={(e) => {
                                                                                        e.stopPropagation();
                                                                                        e.preventDefault();
                                                                                        const startX = e.clientX;
                                                                                        const colIdx = c + cellColSpan - 1;
                                                                                        const startWidths = [...globalWidths];
                                                                                        const minWidthPercent = (20 / el.width) * 100; // 20px minimum

                                                                                        const handleMove = (moveE: MouseEvent) => {
                                                                                            moveE.preventDefault();
                                                                                            moveE.stopPropagation();
                                                                                            const deltaX = moveE.clientX - startX;
                                                                                            const deltaPercent = (deltaX / el.width) * 100;
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
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    );
                                                                }

                                                                return cellElements;
                                                            })()}
                                                        </div>


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
                                                                        className="absolute cursor-row-resize z-[120] group/rowresize"
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
                                    className="nodrag floating-panel absolute z-[210] bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[240px] animate-in fade-in zoom-in"
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
                                                                        selectedCellIndices.forEach(idx => {
                                                                            newStyles[idx] = { ...(newStyles[idx] || {}), borderTop: val, borderBottom: val, borderLeft: val, borderRight: val };
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
                                                                        selectedCellIndices.forEach(idx => {
                                                                            newStyles[idx] = { ...(newStyles[idx] || {}), borderTopWidth: val, borderBottomWidth: val, borderLeftWidth: val, borderRightWidth: val };
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
                                                                                    selectedCellIndices.forEach(idx => {
                                                                                        newStyles[idx] = { ...(newStyles[idx] || {}), [styleColorKey]: val };
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

                                                {/* Border Radius Settings */}
                                                <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                                                    <div className="flex items-center gap-1.5 text-gray-700">
                                                        <Circle size={10} className="text-gray-400" />
                                                        <span className="text-[10px] font-medium pl-0.5">테두리 곡률</span>
                                                    </div>

                                                    {selectedCellIndices.length > 0 && editingTableId === selectedEl.id ? (
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                                                                <span>All Corners</span>
                                                                <span>{selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.borderRadius ?? 0}px</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="20"
                                                                step="1"
                                                                value={selectedEl.tableCellStyles?.[selectedCellIndices[0]]?.borderRadius ?? selectedEl.tableBorderRadius ?? 0}
                                                                onChange={(e) => {
                                                                    const val = parseInt(e.target.value);
                                                                    const newStyles = [...(selectedEl.tableCellStyles || Array(totalCells).fill(undefined))];
                                                                    selectedCellIndices.forEach(idx => {
                                                                        newStyles[idx] = { ...(newStyles[idx] || {}), borderRadius: val };
                                                                    });
                                                                    const next = drawElements.map(it => it.id === selectedEl.id ? { ...it, tableCellStyles: newStyles } : it);
                                                                    update({ drawElements: next }); syncUpdate({ drawElements: next });
                                                                }}
                                                                onMouseDown={e => e.stopPropagation()}
                                                                className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                            />
                                                        </div>
                                                    ) : (
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
                                                                            value={selectedEl[key as keyof DrawElement] ?? selectedEl.tableBorderRadius ?? 0}
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
                                                    )}
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
                                    className="nodrag floating-panel absolute z-[210] bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[240px] animate-in fade-in zoom-in"
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
