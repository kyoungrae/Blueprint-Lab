import React from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import type { Screen } from '../../types/screenDesign';

interface ImageContentProps {
    screen: Screen;
    isLocked: boolean;
    isDragOver: boolean;
    imgSize: { w: number | undefined; h: number | undefined };
    isImageSelected: boolean;
    imageContainerRef: React.RefObject<HTMLDivElement | null>;
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
    setIsDragOver: (v: boolean) => void;
    setIsImageSelected: (v: boolean) => void;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;
    handleResizeStart: (direction: string) => (e: React.MouseEvent) => void;
    handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const ImageContent: React.FC<ImageContentProps> = ({
    screen,
    isLocked,
    isDragOver,
    imgSize,
    isImageSelected,
    imageContainerRef,
    update,
    syncUpdate,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleResizeStart,
    handleImageUpload,
    setIsImageSelected,
}) => {
    return (
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
    );
};

export default ImageContent;
