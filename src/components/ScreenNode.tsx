import React, { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { Screen } from '../types/screenDesign';
import { SCREEN_TYPES } from '../types/screenDesign';
import { Plus, Trash2, Lock, Unlock, Image as ImageIcon, X, Monitor, ChevronDown, Database } from 'lucide-react';
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
                    <table className="w-full border-collapse">
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

                {/* ── 3. Body Content (Split Layout) ── */}
                <div className="flex bg-white min-h-[500px]">

                    {/* [LEFT PANE 70%] - Image & Function Items */}
                    <div className="w-[70%] flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50/10 overflow-hidden rounded-bl-[13px]">

                        {/* Image Area */}
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
        </div>
    );
};

export default memo(ScreenNode);
