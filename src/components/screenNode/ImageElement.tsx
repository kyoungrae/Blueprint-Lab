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
}

import { getImageDisplayUrl, normalizeImageUrlForStorage } from '../../utils/imageUrl';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

const ImageElement: React.FC<ImageElementProps> = ({ element, isSelected, isLocked, onUpdate, projectId }) => {
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

    const displayUrl = getImageDisplayUrl(element.imageUrl);

    return (
        <div className="w-full h-full relative select-none">
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
                            ...(element.imageCrop && (element.imageCrop.x !== 0 || element.imageCrop.y !== 0 || element.imageCrop.width !== 1 || element.imageCrop.height !== 1)
                                ? {
                                    width: `${100 / (element.imageCrop.width || 1)}%`,
                                    height: `${100 / (element.imageCrop.height || 1)}%`,
                                    left: `${-(element.imageCrop.x || 0) / (element.imageCrop.width || 1) * 100}%`,
                                    top: `${-(element.imageCrop.y || 0) / (element.imageCrop.height || 1) * 100}%`,
                                }
                                : { inset: 0, width: '100%', height: '100%' }),
                            objectFit: element.imageCrop && (element.imageCrop.x !== 0 || element.imageCrop.y !== 0 || element.imageCrop.width !== 1 || element.imageCrop.height !== 1) ? 'fill' : 'contain',
                            display: 'block',
                            pointerEvents: 'none',
                            transform: [
                                `rotate(${element.imageRotation ?? 0}deg)`,
                                element.imageFlipX ? 'scaleX(-1)' : '',
                                element.imageFlipY ? 'scaleY(-1)' : '',
                            ].filter(Boolean).join(' ') || undefined,
                        }}
                        draggable={false}
                        referrerPolicy="no-referrer"
                        onLoad={() => setLoadFailed(false)}
                        onError={() => {
                            setLoadFailed(true);
                            console.warn('[ImageElement] 이미지 로드 실패:', displayUrl);
                        }}
                    />
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

            {/* 리사이즈 핸들 (선택 시 표시) */}
            {isSelected && !isLocked && (
                <>
                    {RESIZE_HANDLES.map((handle) => (
                        <div
                            key={handle.position}
                            className="absolute w-2.5 h-2.5  border-blue-500 rounded-sm z-50 shadow-sm"
                            style={{ ...handle.style, cursor: handle.cursor }}
                            onMouseDown={(e) => handleResizeMouseDown(e, handle.position)}
                        />
                    ))}
                </>
            )}
        </div>
    );
};

export default ImageElement;
