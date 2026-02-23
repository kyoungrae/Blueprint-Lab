import React, { useRef, useState, useCallback } from 'react';
import { Image as ImageIcon, Upload } from 'lucide-react';
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

const ImageElement: React.FC<ImageElementProps> = ({ element, isSelected, isLocked, onUpdate, projectId }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const resizeStateRef = useRef<{
        position: string;
        startX: number;
        startY: number;
        startElX: number;
        startElY: number;
        startW: number;
        startH: number;
    } | null>(null);

    const uploadToServer = async (dataUrl: string): Promise<string> => {
        if (!projectId || projectId.startsWith('local_')) return dataUrl;
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/${projectId}/images`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ data: dataUrl }),
        });
        if (!res.ok) return dataUrl;
        const json = await res.json() as { imageId: string; url: string };
        return json.url;
    };

    const loadFile = (file: File) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const dataUrl = e.target?.result as string;
            let imageUrl = dataUrl;
            try {
                imageUrl = await uploadToServer(dataUrl);
            } catch {
                // 업로드 실패 시 data URL 그대로 사용
            }
            onUpdate({ imageUrl });
        };
        reader.readAsDataURL(file);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) loadFile(file);
        e.target.value = '';
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

    return (
        <div className="w-full h-full relative select-none">
            {element.imageUrl ? (
                /* 이미지가 있을 때 */
                <div
                    className="w-full h-full relative overflow-hidden"
                    style={{ borderRadius: element.borderRadius ?? 0 }}
                >
                    <img
                        src={element.imageUrl}
                        alt=""
                        className="w-full h-full"
                        style={{ objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
                        draggable={false}
                    />
                    {/* 선택 시 이미지 교체 오버레이 */}
                    {isSelected && !isLocked && (
                        <div
                            className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/30 cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="flex flex-col items-center gap-1 text-white">
                                <Upload size={16} />
                                <span className="text-[10px] font-bold">이미지 교체</span>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* 이미지가 없을 때 드롭/클릭 영역 */
                <div
                    className={`w-full h-full flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded cursor-pointer transition-colors ${
                        isDragOver
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/30'
                    }`}
                    style={{ borderRadius: element.borderRadius ?? 4 }}
                    onClick={() => !isLocked && fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                >
                    <ImageIcon size={24} className="text-gray-400" />
                    <span className="text-[10px] text-gray-400 font-medium text-center leading-tight px-2">
                        클릭 또는<br />드래그하여 이미지 삽입
                    </span>
                </div>
            )}

            {/* 파일 입력 (숨김) */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />

            {/* 리사이즈 핸들 (선택 시 표시) */}
            {isSelected && !isLocked && (
                <>
                    {RESIZE_HANDLES.map((handle) => (
                        <div
                            key={handle.position}
                            className="absolute w-2.5 h-2.5 bg-white border-2 border-blue-500 rounded-sm z-50 shadow-sm"
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
