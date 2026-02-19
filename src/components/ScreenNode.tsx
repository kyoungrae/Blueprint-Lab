import React, { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { Screen, DrawElement } from '../types/screenDesign';
import { SCREEN_TYPES } from '../types/screenDesign';
import { Plus, Trash2, Lock, Unlock, Image as ImageIcon, X, Monitor, ChevronDown, Database, Pencil, MousePointer2, Square, Type, Circle, Palette, Layers, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react';
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

// ── Draw Text Element (Handles IME/Korean Input) ───────────
const DrawTextComponent = ({
    element,
    isLocked,
    isSelected,
    onUpdate,
    autoFocus,
    className
}: {
    element: DrawElement,
    isLocked: boolean,
    isSelected: boolean,
    onUpdate: (text: string) => void,
    autoFocus?: boolean,
    className?: string
}) => {
    const [localText, setLocalText] = useState(element.text || '');
    const isComposing = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Sync local state with element.text when it changes externally
    useEffect(() => {
        if (!isComposing.current) {
            setLocalText(element.text || '');
        }
    }, [element.text]);

    // Auto-resize height based on content
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = '0px'; // Reset for measurement
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [localText, element.width, element.height]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setLocalText(value);
        if (!isComposing.current) {
            onUpdate(value);
        }
    };

    const handleCompositionStart = () => {
        isComposing.current = true;
    };

    const handleCompositionEnd = () => {
        isComposing.current = false;
        onUpdate(localText);
    };

    return (
        <textarea
            ref={textareaRef}
            value={localText}
            onChange={handleChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onBlur={() => onUpdate(localText)}
            autoFocus={autoFocus}
            onMouseDown={(e) => {
                if (isSelected && !isLocked) {
                    e.stopPropagation();
                }
            }}
            disabled={isLocked || !isSelected}
            className={`bg-transparent border-none outline-none resize-none p-0 text-xs text-gray-800 ${!isSelected ? 'pointer-events-none' : 'pointer-events-auto'} ${element.textAlign === 'center' ? 'text-center' : element.textAlign === 'right' ? 'text-right' : 'text-left'} ${className || ''}`}
            placeholder="내용 입력..."
            style={{
                overflow: 'hidden',
                lineHeight: '1.4',
                margin: 0,
                width: '100%',
                minHeight: '1em',
                boxSizing: 'border-box'
            }}
        />
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

    const contentMode = screen.contentMode || 'IMAGE';

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
    const [activeTool, setActiveTool] = useState<'select' | 'rect' | 'circle' | 'text' | 'image'>('select');
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
        setToolbarPos({ x: '50%', y: 16 });
        setStylePanelPos({ x: '50%', y: 64 });
        setLayerPanelPos({ x: '50%', y: 64 });
        setIsToolbarCollapsed(false);
    }, [isLocked]);

    const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);

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
            }
            return;
        }

        setIsDrawing(true);
        setDrawStartPos({ x, y });

        const newId = `draw_${Date.now()}`;
        const newElement: DrawElement = {
            id: newId,
            type: activeTool === 'rect' ? 'rect' : activeTool === 'circle' ? 'circle' : activeTool === 'text' ? 'text' : 'image',
            x,
            y,
            width: 0,
            height: 0,
            fill: '#ffffff',
            stroke: '#2c3e7c',
            strokeWidth: 2,
            zIndex: drawElements.length + 1,
            text: activeTool === 'text' ? '텍스트 입력' : undefined,
            fontSize: 14,
            color: '#333333'
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

        // Reset editing state on move
        setEditingTextId(null);
    };

    const handleElementDoubleClick = (id: string, e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        const el = drawElements.find(item => item.id === id);
        if (el && (el.type === 'rect' || el.type === 'circle')) {
            setEditingTextId(id);
        }
    };

    const handleToolbarDragStart = (e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();

        isDraggingToolbarRef.current = true;
        const toolbar = (e.target as HTMLElement).closest('.floating-toolbar') as HTMLElement;
        if (!toolbar || !canvasRef.current) return;

        const toolbarRect = toolbar.getBoundingClientRect();
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const scale = canvasRect.width / canvasRef.current.clientWidth;

        toolbarDragOffsetRef.current = {
            x: (e.clientX - toolbarRect.left) / scale,
            y: (e.clientY - toolbarRect.top) / scale
        };

        const handleWindowMouseMove = (moveEvent: MouseEvent) => {
            if (!isDraggingToolbarRef.current || !canvasRef.current) return;
            moveEvent.stopImmediatePropagation();

            const cRect = canvasRef.current.getBoundingClientRect();
            const layoutWidth = canvasRef.current.clientWidth;
            const layoutHeight = canvasRef.current.clientHeight;
            const currentScale = cRect.width / layoutWidth;

            const layoutX = (moveEvent.clientX - cRect.left) / currentScale;
            const layoutY = (moveEvent.clientY - cRect.top) / currentScale;

            let newX = layoutX - toolbarDragOffsetRef.current.x;
            let newY = layoutY - toolbarDragOffsetRef.current.y;

            const currentToolbarWidth = toolbar.offsetWidth;
            const currentToolbarHeight = toolbar.offsetHeight;

            newX = Math.max(0, Math.min(newX, layoutWidth - currentToolbarWidth));
            newY = Math.max(0, Math.min(newY, layoutHeight - currentToolbarHeight));

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
        if (!panel || !canvasRef.current) return;

        const panelRect = panel.getBoundingClientRect();
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const scale = canvasRect.width / canvasRef.current.clientWidth;

        const offset = {
            x: (e.clientX - panelRect.left) / scale,
            y: (e.clientY - panelRect.top) / scale
        };

        if (isStyle) stylePanelDragOffsetRef.current = offset;
        else layerPanelDragOffsetRef.current = offset;

        const handleWindowMouseMove = (moveEvent: MouseEvent) => {
            if ((isStyle && !isDraggingStylePanelRef.current) || (!isStyle && !isDraggingLayerPanelRef.current) || !canvasRef.current) return;
            moveEvent.stopImmediatePropagation();

            const cRect = canvasRef.current.getBoundingClientRect();
            const layoutWidth = canvasRef.current.clientWidth;
            const layoutHeight = canvasRef.current.clientHeight;
            const currentScale = cRect.width / layoutWidth;

            const layoutX = (moveEvent.clientX - cRect.left) / currentScale;
            const layoutY = (moveEvent.clientY - cRect.top) / currentScale;

            const currentOffset = isStyle ? stylePanelDragOffsetRef.current : layerPanelDragOffsetRef.current;
            let newX = layoutX - currentOffset.x;
            let newY = layoutY - currentOffset.y;

            const currentPanelWidth = panel.offsetWidth;
            const currentPanelHeight = panel.offsetHeight;

            newX = Math.max(0, Math.min(newX, layoutWidth - currentPanelWidth));
            newY = Math.max(0, Math.min(newY, layoutHeight - currentPanelHeight));

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
            const width = x - drawStartPos.x;
            const height = y - drawStartPos.y;

            setTempElement({
                ...tempElement,
                x: width < 0 ? x : drawStartPos.x,
                y: height < 0 ? y : drawStartPos.y,
                width: Math.abs(width),
                height: Math.abs(height)
            });
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
            // Skip if too small
            if (tempElement.width > 5 || tempElement.height > 5 || tempElement.type === 'text') {
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
            {/* Main Content Wrapper - Changed from overflow-hidden to visible to allow dropdowns to pop out */}
            <div className={`bg-white rounded-[15px] shadow-xl border-2 flex flex-col ${selected
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
                <div className="flex bg-white min-h-[500px]">

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
                                {/* Floating Toolbar */}
                                {!isLocked && (
                                    <div
                                        className="nodrag floating-toolbar absolute z-30 flex items-center gap-1 p-1 bg-white/80 backdrop-blur-md border border-gray-200 rounded-xl shadow-xl transition-shadow hover:shadow-2xl"
                                        style={{
                                            left: toolbarPos.x,
                                            top: toolbarPos.y,
                                            transform: toolbarPos.x === '50%' ? 'translateX(-50%)' : 'none'
                                        }}
                                    >
                                        {/* Drag Handle */}
                                        <div
                                            onMouseDown={handleToolbarDragStart}
                                            className="px-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 border-r border-gray-200 mr-0.5 flex items-center"
                                            title="도구 상자 이동"
                                        >
                                            <GripVertical size={16} />
                                        </div>

                                        {/* Collapse/Expand Toggle */}
                                        <button
                                            onClick={() => {
                                                setIsToolbarCollapsed(!isToolbarCollapsed);
                                                if (!isToolbarCollapsed) {
                                                    setShowStylePanel(false);
                                                    setShowLayerPanel(false);
                                                }
                                            }}
                                            className="p-1 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600 transition-colors"
                                            title={isToolbarCollapsed ? "펼치기" : "접기"}
                                        >
                                            {isToolbarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                                        </button>

                                        {!isToolbarCollapsed && (
                                            <>
                                                <div className="flex items-center gap-1 animate-in slide-in-from-left-1 duration-200">
                                                    <div className="flex items-center gap-0.5 border-r border-gray-200 pr-1 mr-1">
                                                        <button
                                                            onClick={() => setActiveTool('select')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'select' ? 'bg-blue-100 text-blue-600' : 'hover:bg-blue-50 text-gray-500'}`}
                                                            title="선택"
                                                        >
                                                            <MousePointer2 size={18} />
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-0.5">
                                                        <button
                                                            onClick={() => setActiveTool('rect')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'rect' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                            title="사각형"
                                                        >
                                                            <Square size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => setActiveTool('circle')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'circle' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                            title="원형"
                                                        >
                                                            <Circle size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => setActiveTool('text')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'text' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                            title="텍스트"
                                                        >
                                                            <Type size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => setActiveTool('image')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'image' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                            title="이미지"
                                                        >
                                                            <ImageIcon size={18} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {selectedElementIds.length > 0 && (
                                                    <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1 animate-in fade-in duration-200">
                                                        <div className="flex gap-0.5 bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                                                            {(['left', 'center', 'right'] as const).map((align) => (
                                                                <button
                                                                    key={align}
                                                                    onClick={() => {
                                                                        const nextElements = drawElements.map(el =>
                                                                            selectedElementIds.includes(el.id) ? { ...el, textAlign: align } : el
                                                                        );
                                                                        update({ drawElements: nextElements });
                                                                        syncUpdate({ drawElements: nextElements });
                                                                    }}
                                                                    className={`p-1.5 rounded-md transition-all ${(drawElements.find(el => el.id === selectedElementIds[0])?.textAlign === align || (align === 'center' && !drawElements.find(el => el.id === selectedElementIds[0])?.textAlign))
                                                                        ? 'bg-white shadow-sm text-blue-600'
                                                                        : 'text-gray-400 hover:text-gray-600'
                                                                        }`}
                                                                    title={`가로 ${align === 'left' ? '왼쪽' : align === 'right' ? '오른쪽' : '중앙'} 정렬`}
                                                                >
                                                                    {align === 'left' ? <AlignLeft size={16} /> : align === 'right' ? <AlignRight size={16} /> : <AlignCenter size={16} />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="flex gap-0.5 bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                                                            {(['top', 'middle', 'bottom'] as const).map((vAlign) => (
                                                                <button
                                                                    key={vAlign}
                                                                    onClick={() => {
                                                                        const nextElements = drawElements.map(el =>
                                                                            selectedElementIds.includes(el.id) ? { ...el, verticalAlign: vAlign } : el
                                                                        );
                                                                        update({ drawElements: nextElements });
                                                                        syncUpdate({ drawElements: nextElements });
                                                                    }}
                                                                    className={`p-1.5 rounded-md transition-all ${(drawElements.find(el => el.id === selectedElementIds[0])?.verticalAlign === vAlign || (vAlign === 'middle' && !drawElements.find(el => el.id === selectedElementIds[0])?.verticalAlign))
                                                                        ? 'bg-white shadow-sm text-blue-600'
                                                                        : 'text-gray-400 hover:text-gray-600'
                                                                        }`}
                                                                    title={`세로 ${vAlign === 'top' ? '상단' : vAlign === 'bottom' ? '하단' : '중앙'} 정렬`}
                                                                >
                                                                    {vAlign === 'top' ? <AlignStartVertical size={16} /> : vAlign === 'bottom' ? <AlignEndVertical size={16} /> : <AlignCenterVertical size={16} />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1 animate-in fade-in duration-200">
                                                    <button
                                                        onClick={() => {
                                                            setShowStylePanel(!showStylePanel);
                                                            setShowLayerPanel(false);
                                                        }}
                                                        className={`p-2 rounded-lg transition-colors ${showStylePanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        title="색상 및 스타일"
                                                    >
                                                        <Palette size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setShowLayerPanel(!showLayerPanel);
                                                            setShowStylePanel(false);
                                                        }}
                                                        className={`p-2 rounded-lg transition-colors ${showLayerPanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        title="레이어 순서"
                                                    >
                                                        <Layers size={18} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

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
                                                                onUpdate={(text) => updateElement(el.id, { text })}
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
                                                                onUpdate={(text) => updateElement(el.id, { text })}
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
                                                        onUpdate={(text) => updateElement(el.id, { text })}
                                                    />
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
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'nw', e)} className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-nw-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'ne', e)} className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-ne-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'sw', e)} className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-sw-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'se', e)} className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-se-resize z-[105]" />

                                                        {/* Middles */}
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'n', e)} className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-n-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 's', e)} className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-s-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'w', e)} className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-w-resize z-[105]" />
                                                        <div onMouseDown={(e) => handleElementResizeStart(el.id, 'e', e)} className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-e-resize z-[105]" />
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Properties Panel (appears when elements are selected AND color button is clicked) */}
                                    {!isLocked && selectedElementIds.length > 0 && showStylePanel && !isToolbarCollapsed && (
                                        <div
                                            className="nodrag floating-panel absolute z-40 bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[240px] animate-in fade-in zoom-in duration-200"
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

                                            {/* Border Color */}
                                            <div className="flex flex-col gap-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[11px] text-gray-600 font-medium">테두리</span>
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
                                                            className={`w-3.5 h-3.5 rounded-full border border-gray-200 transition-transform hover:scale-110 flex items-center justify-center`}
                                                            style={{ backgroundColor: color === 'transparent' ? '#eee' : color }}
                                                        >
                                                            {color === 'transparent' && <div className="w-[1px] h-2.5 bg-red-400 rotate-45" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Opacity Sliders */}
                                            <div className="flex flex-col gap-3 pt-1 border-t border-gray-100">
                                                {/* Background Opacity */}
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
                                    )}

                                    {/* Layer Panel */}
                                    {!isLocked && selectedElementIds.length > 0 && showLayerPanel && !isToolbarCollapsed && (
                                        <div
                                            className="nodrag floating-panel absolute z-40 bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 min-w-[240px] animate-in fade-in zoom-in duration-200"
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
                                                    <span className="text-[10px] font-bold text-gray-600">앞으로</span>
                                                </button>
                                                <button
                                                    onClick={() => handleLayerAction('backward')}
                                                    className="flex flex-col items-center justify-center gap-2 p-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-xl transition-all group"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center group-hover:text-blue-600 transition-colors">
                                                        <ChevronDown size={18} />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-gray-600">뒤로</span>
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

                                {/* Manual Add Input - Fixed at bottom of Panel 3, inside rounding */}
                                {!isLocked && (
                                    <div className="p-2 border-t border-gray-100 bg-gray-50/30">
                                        <div className="relative">
                                            <Plus size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder="직접 입력 추가..."
                                                className="w-full bg-white border border-gray-200 text-[9px] pl-6 pr-2 py-1.5 rounded focus:ring-1 focus:ring-blue-400 outline-none shadow-sm"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        const val = (e.target as HTMLInputElement).value.trim();
                                                        if (val) {
                                                            const newValue = screen.relatedTables ? `${screen.relatedTables}\n• ${val}` : `• ${val}`;
                                                            update({ relatedTables: newValue });
                                                            syncUpdate({ relatedTables: newValue });
                                                            (e.target as HTMLInputElement).value = '';
                                                        }
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Connection Handles (Outside overflow-hidden wrapper) */}
            <ScreenHandles />
        </div >
    );
};

export default memo(ScreenNode);
