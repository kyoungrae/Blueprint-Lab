import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { DrawElement } from '../../types/screenDesign';

interface ResizeHandle {
    cursor: string;
    position: 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';
    style: React.CSSProperties;
}

const RESIZE_HANDLES: ResizeHandle[] = [
    { cursor: 'nw-resize', position: 'nw', style: { top: -4, left: -4 } },
    { cursor: 'n-resize',  position: 'n',  style: { top: -4, left: '50%', transform: 'translateX(-50%)' } },
    { cursor: 'ne-resize', position: 'ne', style: { top: -4, right: -4 } },
    { cursor: 'w-resize',  position: 'w',  style: { top: '50%', left: -4, transform: 'translateY(-50%)' } },
    { cursor: 'e-resize',  position: 'e',  style: { top: '50%', right: -4, transform: 'translateY(-50%)' } },
    { cursor: 'sw-resize', position: 'sw', style: { bottom: -4, left: -4 } },
    { cursor: 's-resize',  position: 's',  style: { bottom: -4, left: '50%', transform: 'translateX(-50%)' } },
    { cursor: 'se-resize', position: 'se', style: { bottom: -4, right: -4 } },
];

interface ImageElementProps {
    element: DrawElement;
    isSelected: boolean;
    isLocked: boolean;
    onUpdate: (updates: Partial<DrawElement>) => void;
    projectId?: string;
    /** 직접 크롭 모드: 핸들을 드래그하면 imageCrop 영역 조절 */
    isCropMode?: boolean;
}

import { getImageDisplayUrl, normalizeImageUrlForStorage } from '../../utils/imageUrl';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

const ImageElement: React.FC<ImageElementProps> = ({ element, isSelected, isLocked, onUpdate, projectId, isCropMode }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    useEffect(() => setLoadFailed(false), [element.imageUrl]);
    const resizeStateRef = useRef<{
        position: string;
        startX: number;
        startY: number;
        startElX: number;
        startElY: number;
        startW: number;
        startH: number;
    } | null>(null);
    const cropStateRef = useRef<{
        position: string;
        startX: number;
        startY: number;
        startCrop: { x: number; y: number; width: number; height: number };
        rectWidth: number;
        rectHeight: number;
        rotation: number;
        flipX: boolean;
        flipY: boolean;
    } | null>(null);

    const uploadToServer = async (file: File): Promise<string> => {
        if (!projectId || projectId.startsWith('local_')) {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            return dataUrl;
        }
        const token = localStorage.getItem('auth-token');
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch(`${API_URL}/${projectId}/images`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
        });
        if (!res.ok) {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            return dataUrl;
        }
        const json = await res.json() as { imageId: string; url: string };
        return normalizeImageUrlForStorage(json.url) ?? json.url;
    };

    const loadFile = async (file: File) => {
        if (!file.type.startsWith('image/')) return;
        try {
            const imageUrl = await uploadToServer(file);
            onUpdate({ imageUrl });
        } catch {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            onUpdate({ imageUrl: dataUrl });
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) loadFile(file);
    };

    const handleResizeMouseDown = useCallback((e: React.MouseEvent, position: string) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();

        resizeStateRef.current = {
            position,
            startX: e.clientX,
            startY: e.clientY,
            startElX: element.x,
            startElY: element.y,
            startW: element.width,
            startH: element.height,
        };

        const onMouseMove = (me: MouseEvent) => {
            const state = resizeStateRef.current;
            if (!state) return;

            const dx = me.clientX - state.startX;
            const dy = me.clientY - state.startY;
            const MIN = 30;

            let newX = state.startElX;
            let newY = state.startElY;
            let newW = state.startW;
            let newH = state.startH;

            const pos = state.position;

            // Horizontal
            if (pos.includes('e')) newW = Math.max(MIN, state.startW + dx);
            if (pos.includes('w')) {
                newW = Math.max(MIN, state.startW - dx);
                newX = state.startElX + state.startW - newW;
            }
            // Vertical
            if (pos.includes('s')) newH = Math.max(MIN, state.startH + dy);
            if (pos.includes('n')) {
                newH = Math.max(MIN, state.startH - dy);
                newY = state.startElY + state.startH - newH;
            }

            onUpdate({ x: newX, y: newY, width: newW, height: newH });
        };

        const onMouseUp = () => {
            resizeStateRef.current = null;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [element, isLocked, onUpdate]);

    const handleCropMouseDown = useCallback((e: React.MouseEvent, position: string) => {
        if (isLocked || !element.imageUrl) return;
        e.stopPropagation();
        e.preventDefault();

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;

        const crop = element.imageCrop ?? { x: 0, y: 0, width: 1, height: 1 };
        const rot = ((element.imageRotation ?? 0) % 360 + 360) % 360;
        const rotSnap = Math.round(rot / 90) % 4 * 90;

        cropStateRef.current = {
            position,
            startX: e.clientX,
            startY: e.clientY,
            startCrop: { ...crop },
            rectWidth: rect.width,
            rectHeight: rect.height,
            rotation: rotSnap,
            flipX: element.imageFlipX ?? false,
            flipY: element.imageFlipY ?? false,
        };

        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        const MIN_DIM = 0.02;

        const onMouseMove = (me: MouseEvent) => {
            const state = cropStateRef.current;
            if (!state) return;

            const dx = (me.clientX - state.startX) / state.rectWidth;
            const dy = (me.clientY - state.startY) / state.rectHeight;

            // 화면 좌표(dx, dy) → 이미지 좌표(dImgX, dImgY) 변환 (회전·플립 반영, wrapper가 회전 적용)
            let dImgX: number;
            let dImgY: number;
            if (state.rotation === 90) {
                dImgX = dy;
                dImgY = -dx;
            } else if (state.rotation === 180) {
                dImgX = -dx;
                dImgY = -dy;
            } else if (state.rotation === 270) {
                dImgX = -dy;
                dImgY = dx;
            } else {
                dImgX = dx;
                dImgY = dy;
            }
            if (state.flipX) dImgX = -dImgX;
            if (state.flipY) dImgY = -dImgY;

            let { x, y, width, height } = { ...state.startCrop };
            const pos = state.position;

            if (pos.includes('e')) {
                width = clamp(state.startCrop.width + dImgX, MIN_DIM, 1 - x);
            }
            if (pos.includes('w')) {
                const newX = clamp(state.startCrop.x + dImgX, 0, state.startCrop.x + state.startCrop.width - MIN_DIM);
                width = state.startCrop.width + (state.startCrop.x - newX);
                x = newX;
            }
            if (pos.includes('s')) {
                height = clamp(state.startCrop.height + dImgY, MIN_DIM, 1 - y);
            }
            if (pos.includes('n')) {
                const newY = clamp(state.startCrop.y + dImgY, 0, state.startCrop.y + state.startCrop.height - MIN_DIM);
                height = state.startCrop.height + (state.startCrop.y - newY);
                y = newY;
            }

            onUpdate({ imageCrop: { x, y, width, height } });
        };

        const onMouseUp = () => {
            cropStateRef.current = null;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [element, isLocked, onUpdate]);

    const displayUrl = getImageDisplayUrl(element.imageUrl);
    const crop = element.imageCrop ?? { x: 0, y: 0, width: 1, height: 1 };
    const hasCrop = crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1;

    // 회전은 부모 wrapper(ScreenNode)에서 적용됨. 여기서는 플립만 적용
    const rot = element.imageRotation ?? 0;
    const rotNorm = ((rot % 360) + 360) % 360;
    const rot90 = Math.round(rotNorm / 90) % 4;

    const imageTransform = [
        element.imageFlipX ? 'scaleX(-1)' : '',
        element.imageFlipY ? 'scaleY(-1)' : '',
    ].filter(Boolean).join(' ') || undefined;

    // 회전·플립에 따라 크롭 핸들 커서를 화면 방향에 맞게 변환
    const getCropCursor = (pos: 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'): string => {
        const rotMap: Record<number, Record<string, string>> = {
            0: { n: 'n', s: 's', e: 'e', w: 'w', nw: 'nw', ne: 'ne', sw: 'sw', se: 'se' },
            1: { n: 'e', s: 'w', e: 's', w: 'n', nw: 'ne', ne: 'se', sw: 'nw', se: 'sw' },
            2: { n: 's', s: 'n', e: 'w', w: 'e', nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' },
            3: { n: 'w', s: 'e', e: 'n', w: 's', nw: 'sw', ne: 'nw', sw: 'se', se: 'ne' },
        };
        let dir = rotMap[rot90]?.[pos] ?? pos;
        if (element.imageFlipX) {
            const swap: Record<string, string> = { e: 'w', w: 'e', ne: 'nw', nw: 'ne', se: 'sw', sw: 'se' };
            dir = swap[dir] ?? dir;
        }
        if (element.imageFlipY) {
            const swap: Record<string, string> = { n: 's', s: 'n', ne: 'se', se: 'ne', nw: 'sw', sw: 'nw' };
            dir = swap[dir] ?? dir;
        }
        return `${dir}-resize`;
    };

    return (
        <div ref={containerRef} className="w-full h-full relative select-none">
            {element.imageUrl && !loadFailed ? (
                /* 이미지가 있을 때 */
                <div
                    className="w-full h-full relative overflow-hidden"
                    style={{ borderRadius: element.borderRadius ?? 0 }}
                >
                    <img
                        src={displayUrl}
                        alt=""
                        className="absolute"
                        style={{
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            // hasCrop일 때는 항상 fill로 통일 → 크롭 모드 전환 시 objectFit 점프 방지
                            objectFit: hasCrop ? 'fill' : 'contain',
                            display: 'block',
                            pointerEvents: 'none',
                            ...(!isCropMode && hasCrop
                                ? {
                                    clipPath: `inset(${crop.y * 100}% ${(1 - crop.x - crop.width) * 100}% ${(1 - crop.y - crop.height) * 100}% ${crop.x * 100}%)`,
                                }
                                : {}),
                            transform: imageTransform,
                            transformOrigin: 'center center',
                        }}
                        draggable={false}
                        referrerPolicy="no-referrer"
                        onLoad={() => setLoadFailed(false)}
                        onError={() => {
                            setLoadFailed(true);
                            console.warn('[ImageElement] 이미지 로드 실패:', displayUrl);
                        }}
                    />
                    {isSelected && isCropMode && (
                        <div className="absolute inset-0 z-[120]">
                            {/* 이미지와 동일한 transform 적용 → 회전/플립 시 크롭 오버레이가 이미지와 정렬됨 */}
                            <div
                                className="absolute inset-0"
                                style={{
                                    transform: imageTransform,
                                    transformOrigin: 'center center',
                                    pointerEvents: 'auto',
                                }}
                            >
                                <div
                                    className="absolute border border-amber-500 rounded-sm"
                                    style={{
                                        left: `${crop.x * 100}%`,
                                        top: `${crop.y * 100}%`,
                                        width: `${crop.width * 100}%`,
                                        height: `${crop.height * 100}%`,
                                        boxShadow: '0 0 0 9999px rgba(17, 24, 39, 0.35)',
                                    }}
                                />

                                {/* Crop line drag areas */}
                                <div
                                    data-image-crop-handle
                                    className="absolute pointer-events-auto"
                                    style={{
                                        left: `${crop.x * 100}%`,
                                        top: `${crop.y * 100}%`,
                                        width: `${crop.width * 100}%`,
                                        height: 10,
                                        transform: 'translateY(-50%)',
                                        cursor: getCropCursor('n'),
                                    }}
                                    onMouseDown={(e) => handleCropMouseDown(e, 'n')}
                                />
                                <div
                                    data-image-crop-handle
                                    className="absolute pointer-events-auto"
                                    style={{
                                        left: `${crop.x * 100}%`,
                                        top: `${(crop.y + crop.height) * 100}%`,
                                        width: `${crop.width * 100}%`,
                                        height: 10,
                                        transform: 'translateY(-50%)',
                                        cursor: getCropCursor('s'),
                                    }}
                                    onMouseDown={(e) => handleCropMouseDown(e, 's')}
                                />
                                <div
                                    data-image-crop-handle
                                    className="absolute pointer-events-auto"
                                    style={{
                                        left: `${crop.x * 100}%`,
                                        top: `${crop.y * 100}%`,
                                        width: 10,
                                        height: `${crop.height * 100}%`,
                                        transform: 'translateX(-50%)',
                                        cursor: getCropCursor('w'),
                                    }}
                                    onMouseDown={(e) => handleCropMouseDown(e, 'w')}
                                />
                                <div
                                    data-image-crop-handle
                                    className="absolute pointer-events-auto"
                                    style={{
                                        left: `${(crop.x + crop.width) * 100}%`,
                                        top: `${crop.y * 100}%`,
                                        width: 10,
                                        height: `${crop.height * 100}%`,
                                        transform: 'translateX(-50%)',
                                        cursor: getCropCursor('e'),
                                    }}
                                    onMouseDown={(e) => handleCropMouseDown(e, 'e')}
                                />

                                {/* Crop corner handles */}
                                {[
                                    { pos: 'nw' as const, left: crop.x, top: crop.y },
                                    { pos: 'ne' as const, left: crop.x + crop.width, top: crop.y },
                                    { pos: 'sw' as const, left: crop.x, top: crop.y + crop.height },
                                    { pos: 'se' as const, left: crop.x + crop.width, top: crop.y + crop.height },
                                ].map((h) => (
                                    <div
                                        key={h.pos}
                                        data-image-crop-handle
                                        className="absolute w-2.5 h-2.5 border border-amber-500 bg-amber-100 rounded-sm shadow-sm pointer-events-auto z-[200]"
                                        style={{
                                            left: `${h.left * 100}%`,
                                            top: `${h.top * 100}%`,
                                            transform: 'translate(-50%, -50%)',
                                            cursor: getCropCursor(h.pos),
                                        }}
                                        onMouseDown={(e) => handleCropMouseDown(e, h.pos)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* 이미지가 없을 때 또는 로드 실패 시 드롭 전용 영역 (클릭 업로드 없음) */
                <div
                    className={`w-full h-full flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded transition-colors ${
                        isDragOver
                            ? 'border-blue-400 bg-blue-50 cursor-pointer'
                            : loadFailed
                                ? 'border-amber-400 bg-amber-50/50'
                                : 'border-gray-300 bg-gray-50'
                    }`}
                    style={{ borderRadius: element.borderRadius ?? 4 }}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                >
                    <ImageIcon size={24} className={loadFailed ? 'text-amber-500' : 'text-gray-400'} />
                    <span className={`text-[10px] font-medium text-center leading-tight px-2 ${loadFailed ? 'text-amber-600' : 'text-gray-400'}`}>
                        {loadFailed ? '이미지 로드 실패\n드래그하여 다시 시도' : '클릭 또는\n드래그하여 이미지 삽입'}
                    </span>
                </div>
            )}

            {/* 리사이즈 핸들 (선택 시 표시, 크롭 모드 제외) */}
            {isSelected && !isLocked && !isCropMode && (
                <>
                    {RESIZE_HANDLES.map((handle) => (
                        <div
                            key={handle.position}
                            data-image-crop-handle={isCropMode ? '' : undefined}
                            className={`absolute w-2.5 h-2.5 rounded-sm shadow-sm nodrag nopan ${isCropMode ? 'border-amber-500 bg-amber-100 z-[200]' : 'border-blue-500 z-50'}`}
                            style={{ ...handle.style, cursor: handle.cursor }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                isCropMode ? handleCropMouseDown(e, handle.position) : handleResizeMouseDown(e, handle.position);
                            }}
                        />
                    ))}
                </>
            )}
        </div>
    );
};

export default ImageElement;
