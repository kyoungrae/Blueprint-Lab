import React, { useRef } from 'react';
import { RotateCw, FlipHorizontal, FlipVertical, Crop, GripVertical } from 'lucide-react';
import type { DrawElement } from '../../types/screenDesign';

interface ImageStylePanelProps {
    element: DrawElement;
    onUpdate: (updates: Partial<DrawElement>) => void;
    onClose: () => void;
    position: { x: number; y: number };
    onPositionChange: (pos: { x: number; y: number }) => void;
    screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
    flowToScreenPosition: (pos: { x: number; y: number }) => { x: number; y: number };
    onDragStart?: () => void;
    onDragEnd?: () => void;
    /** 직접 크롭 모드 (캔버스에서 핸들로 영역 조절) */
    isCropMode?: boolean;
    onCropModeToggle?: (enabled: boolean) => void;
}

const ROTATION_PRESETS = [0, 90, 180, 270];
const normalizeAngle = (deg: number) => ((deg % 360) + 360) % 360;

export const ImageStylePanel: React.FC<ImageStylePanelProps> = ({ element, onUpdate, onClose, position, onPositionChange, screenToFlowPosition, flowToScreenPosition, onDragStart, onDragEnd, isCropMode, onCropModeToggle }) => {
    const isDraggingRef = useRef(false);
    const rotation = normalizeAngle(element.imageRotation ?? 0);
    const flipX = element.imageFlipX ?? false;
    const flipY = element.imageFlipY ?? false;
    const crop = element.imageCrop ?? { x: 0, y: 0, width: 1, height: 1 };

    const stopAll = (e: React.MouseEvent | React.PointerEvent | React.TouchEvent) => {
        e.stopPropagation();
    };

    const handleRotate = (deg: number) => {
        onUpdate({ imageRotation: deg });
    };

    const handleRotationDialMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const updateFromPointer = (clientX: number, clientY: number) => {
            const angleRad = Math.atan2(clientY - centerY, clientX - centerX);
            const degFromTopClockwise = normalizeAngle((angleRad * 180) / Math.PI + 90);
            // 0.1도 단위로 미세 조절
            const snapped = Math.round(degFromTopClockwise * 10) / 10;
            onUpdate({ imageRotation: snapped });
        };

        updateFromPointer(e.clientX, e.clientY);

        const onMove = (me: MouseEvent) => updateFromPointer(me.clientX, me.clientY);
        const onUp = () => {
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp, true);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp, true);
    };

    const handleFlipX = () => {
        onUpdate({ imageFlipX: !flipX });
    };

    const handleFlipY = () => {
        onUpdate({ imageFlipY: !flipY });
    };

    const handleCropChange = (key: 'x' | 'y' | 'width' | 'height', value: number) => {
        const next = { ...crop, [key]: Math.max(0, Math.min(1, value)) };
        if (key === 'x' || key === 'width') {
            if (next.x + next.width > 1) next.width = 1 - next.x;
        }
        if (key === 'y' || key === 'height') {
            if (next.y + next.height > 1) next.height = 1 - next.y;
        }
        onUpdate({ imageCrop: next });
    };

    const resetCrop = () => {
        onUpdate({ imageCrop: { x: 0, y: 0, width: 1, height: 1 } });
    };

    const handleHeaderMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingRef.current = true;
        onDragStart?.();
        const flowAtClick = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const offsetFlowX = flowAtClick.x - position.x;
        const offsetFlowY = flowAtClick.y - position.y;
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
            window.removeEventListener('mouseup', onUp, true);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp, true);
    };

    return (
        <div
            className="nodrag nopan fixed bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-[9000] min-w-[240px] animate-in fade-in origin-top-left"
            style={{
                left: flowToScreenPosition({ x: position.x, y: position.y }).x,
                top: flowToScreenPosition({ x: position.x, y: position.y }).y,
                transform: 'scale(0.85)',
            }}
            onPointerDown={stopAll}
            onPointerUp={stopAll}
            onMouseDown={stopAll}
            onMouseUp={stopAll}
            onClick={stopAll}
            onDoubleClick={stopAll}
        >
            <div
                className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 cursor-grab active:cursor-grabbing"
                onMouseDown={handleHeaderMouseDown}
            >
                <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-gray-300" />
                    <span className="text-sm font-semibold text-gray-700">이미지 스타일</span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    onPointerDown={stopAll}
                    onPointerUp={stopAll}
                    onMouseDown={stopAll}
                    onMouseUp={stopAll}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                    ✕
                </button>
            </div>

            {/* 회전 */}
            <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                    <RotateCw size={16} className="text-gray-500" />
                    <span className="text-xs font-medium text-gray-600">회전</span>
                </div>
                <div className="flex gap-1">
                    {ROTATION_PRESETS.map((deg) => (
                        <button
                            key={deg}
                            type="button"
                            onClick={() => handleRotate(deg)}
                            onPointerDown={stopAll}
                            onPointerUp={stopAll}
                            onMouseDown={stopAll}
                            onMouseUp={stopAll}
                            className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${rotation === deg ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
                                }`}
                        >
                            {deg}°
                        </button>
                    ))}
                </div>
                <div className="mt-3 flex items-center gap-3">
                    <div
                        className="relative w-20 h-20 cursor-grab active:cursor-grabbing select-none"
                        onMouseDown={(e) => { stopAll(e); handleRotationDialMouseDown(e); }}
                        onPointerDown={stopAll}
                        onPointerUp={stopAll}
                        onMouseUp={stopAll}
                    >
                        {(() => {
                            const center = 40;
                            const radius = 28;
                            const rad = ((rotation - 90) * Math.PI) / 180;
                            const lineX = center + Math.cos(rad) * (radius - 8);
                            const lineY = center + Math.sin(rad) * (radius - 8);
                            const knobX = center + Math.cos(rad) * radius;
                            const knobY = center + Math.sin(rad) * radius;
                            return (
                                <svg width="80" height="80" viewBox="0 0 80 80" className="block">
                                    <circle cx={center} cy={center} r={radius} fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
                                    <line x1={center} y1={center} x2={lineX} y2={lineY} stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                                    <circle cx={knobX} cy={knobY} r="5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                                    <circle cx={center} cy={center} r="2.5" fill="#94a3b8" />
                                </svg>
                            );
                        })()}
                    </div>
                    <div className="text-xs text-gray-600">
                        <div className="font-medium">미세 조절</div>
                        <div className="text-[11px] text-gray-500">{rotation.toFixed(1)}°</div>
                    </div>
                </div>
            </div>

            {/* 대칭 */}
            <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                    <FlipHorizontal size={16} className="text-gray-500" />
                    <span className="text-xs font-medium text-gray-600">대칭</span>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleFlipX}
                        onPointerDown={stopAll}
                        onPointerUp={stopAll}
                        onMouseDown={stopAll}
                        onMouseUp={stopAll}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-colors ${flipX ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                            }`}
                    >
                        <FlipHorizontal size={16} />
                        <span className="text-xs">좌우</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleFlipY}
                        onPointerDown={stopAll}
                        onPointerUp={stopAll}
                        onMouseDown={stopAll}
                        onMouseUp={stopAll}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border transition-colors ${flipY ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                            }`}
                    >
                        <FlipVertical size={16} />
                        <span className="text-xs">상하</span>
                    </button>
                </div>
            </div>

            {/* 크롭 */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <Crop size={16} className="text-gray-500" />
                    <span className="text-xs font-medium text-gray-600">크롭</span>
                    {(crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1) && (
                        <button
                            type="button"
                            onClick={resetCrop}
                            onPointerDown={stopAll}
                            onPointerUp={stopAll}
                            onMouseDown={stopAll}
                            onMouseUp={stopAll}
                            className="ml-auto text-xs text-blue-500 hover:text-blue-600"
                        >
                            초기화
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => onCropModeToggle?.(!isCropMode)}
                    onPointerDown={stopAll}
                    onPointerUp={stopAll}
                    onMouseDown={stopAll}
                    onMouseUp={stopAll}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors mb-2 ${isCropMode ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                        }`}
                >
                    <Crop size={16} />
                    <span className="text-xs font-medium">직접 크롭</span>
                </button>
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="w-8 text-xs text-gray-500">X</span>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={crop.x}
                            onChange={(e) => handleCropChange('x', parseFloat(e.target.value))}
                            onPointerDown={stopAll}
                            onPointerUp={stopAll}
                            onMouseDown={stopAll}
                            onMouseUp={stopAll}
                            className="flex-1 h-2 rounded-lg appearance-none bg-gray-200 accent-blue-500"
                        />
                        <span className="w-10 text-xs text-gray-500">{(crop.x * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-8 text-xs text-gray-500">Y</span>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={crop.y}
                            onChange={(e) => handleCropChange('y', parseFloat(e.target.value))}
                            onPointerDown={stopAll}
                            onPointerUp={stopAll}
                            onMouseDown={stopAll}
                            onMouseUp={stopAll}
                            className="flex-1 h-2 rounded-lg appearance-none bg-gray-200 accent-blue-500"
                        />
                        <span className="w-10 text-xs text-gray-500">{(crop.y * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-8 text-xs text-gray-500">W</span>
                        <input
                            type="range"
                            min={0.01}
                            max={1}
                            step={0.01}
                            value={crop.width}
                            onChange={(e) => handleCropChange('width', parseFloat(e.target.value))}
                            onPointerDown={stopAll}
                            onPointerUp={stopAll}
                            onMouseDown={stopAll}
                            onMouseUp={stopAll}
                            className="flex-1 h-2 rounded-lg appearance-none bg-gray-200 accent-blue-500"
                        />
                        <span className="w-10 text-xs text-gray-500">{(crop.width * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-8 text-xs text-gray-500">H</span>
                        <input
                            type="range"
                            min={0.01}
                            max={1}
                            step={0.01}
                            value={crop.height}
                            onChange={(e) => handleCropChange('height', parseFloat(e.target.value))}
                            onPointerDown={stopAll}
                            onPointerUp={stopAll}
                            onMouseDown={stopAll}
                            onMouseUp={stopAll}
                            className="flex-1 h-2 rounded-lg appearance-none bg-gray-200 accent-blue-500"
                        />
                        <span className="w-10 text-xs text-gray-500">{(crop.height * 100).toFixed(0)}%</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
