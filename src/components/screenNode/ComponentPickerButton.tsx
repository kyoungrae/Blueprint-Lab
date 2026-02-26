import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Box, GripVertical } from 'lucide-react';
import type { Screen } from '../../types/screenDesign';
import type { Project } from '../../types/erd';
import { getImageDisplayUrl } from '../../utils/imageUrl';
import PremiumTooltip from './PremiumTooltip';

const getPanelPortalRoot = () => document.getElementById('panel-portal-root') || document.body;

export interface ComponentPickerButtonProps {
    show: boolean;
    onShowChange: (show: boolean) => void;
    position: { x: number; y: number };
    onPositionChange: (pos: { x: number; y: number }) => void;
    zoom: number;
    flowToScreenPosition: (pos: { x: number; y: number }) => { x: number; y: number };
    screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
    componentList: Screen[];
    linkedComponentProject: Project | undefined;
    onInsert: (component: Screen, subComponentId?: string) => void;
    buttonRef: React.RefObject<HTMLDivElement | null>;
    isDraggingRef: React.MutableRefObject<boolean>;
}

const ComponentPickerButton: React.FC<ComponentPickerButtonProps> = ({
    show,
    onShowChange,
    position,
    onPositionChange,
    zoom,
    flowToScreenPosition,
    screenToFlowPosition,
    componentList,
    linkedComponentProject,
    onInsert,
    buttonRef,
    isDraggingRef,
}) => {
    const handleHeaderMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            isDraggingRef.current = true;
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
                window.removeEventListener('mousemove', onMove, true);
                window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove, true);
            window.addEventListener('mouseup', onUp);
        },
        [screenToFlowPosition, position, onPositionChange, isDraggingRef]
    );

    return (
        <div className="nodrag nopan relative flex items-center justify-center" ref={buttonRef}>
            <PremiumTooltip label="컴포넌트 추가">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!show) {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                            onPositionChange({ x: flowPos.x, y: flowPos.y });
                        }
                        onShowChange(!show);
                    }}
                    className={`p-2 rounded-lg transition-colors ${show ? 'bg-teal-100 text-teal-600' : 'hover:bg-gray-100 text-gray-500'}`}
                >
                    <Box size={18} />
                </button>
            </PremiumTooltip>
            {show &&
                (() => {
                    const screenPos = flowToScreenPosition({ x: position.x, y: position.y });
                    return createPortal(
                        <div
                            data-component-picker-portal
                            className="nodrag nopan fixed bg-white border border-gray-200 rounded-xl shadow-2xl p-3 z-[9000] animate-in fade-in zoom-in origin-top-left min-w-[200px] max-h-[320px] overflow-y-auto"
                            style={{
                                left: screenPos.x,
                                top: screenPos.y,
                                transform: `scale(${0.85 * zoom})`,
                            }}
                        >
                        <PremiumTooltip label="드래그하여 이동">
                        <div
                            className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2 cursor-grab active:cursor-grabbing group/header"
                            onMouseDown={handleHeaderMouseDown}
                        >
                            <div className="flex items-center gap-2">
                                <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                                <Box size={12} className="text-teal-600" />
                                <span className="text-[11px] font-bold text-gray-600">컴포넌트 추가</span>
                            </div>
                        </div>
                        </PremiumTooltip>
                        <div className="flex gap-3 py-2 overflow-x-auto">
                            {!linkedComponentProject ? (
                                <div className="px-3 py-4 text-center text-[11px] text-gray-500 w-full">
                                    컴포넌트 프로젝트를 연결해 주세요
                                </div>
                            ) : componentList.length === 0 ? (
                                <div className="px-3 py-4 text-center text-[11px] text-gray-500 w-full">
                                    컴포넌트가 없습니다
                                </div>
                            ) : (
                                componentList.map((c) => (
                                    <div key={c.id} className="flex-none w-44 flex flex-col gap-2">
                                        <PremiumTooltip label="전체 추가" dotColor="#14b8a6">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onInsert(c);
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            className="w-full bg-white p-2 rounded-lg shadow-sm hover:shadow-md transition-colors text-left border border-gray-100"
                                        >
                                            <div className="w-full h-20 rounded-md overflow-hidden bg-gray-50 border border-gray-100 mb-2 flex items-center justify-center">
                                                {c.imageUrl ? (
                                                    <img src={getImageDisplayUrl(c.imageUrl)} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <div className="text-gray-300">
                                                        <Box size={28} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-gray-700 truncate">{c.name}</span>
                                                <span className="text-[10px] text-gray-400 font-mono truncate">{c.screenId}</span>
                                                <span className="text-[9px] text-teal-600 font-medium mt-0.5">전체 추가</span>
                                            </div>
                                        </button>
                                        </PremiumTooltip>
                                        <div className="flex flex-col gap-1 pt-1 border-t border-gray-100">
                                            <div className="text-[9px] font-bold text-gray-400 uppercase">하위 컴포넌트</div>
                                            {c.subComponents && c.subComponents.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {c.subComponents.map((sub) => (
                                                        <PremiumTooltip key={sub.id} label={`${sub.name} 삽입`} dotColor="#7c3aed">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onInsert(c, sub.id);
                                                            }}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            className="px-2 py-1 bg-violet-50 text-violet-700 text-[10px] font-bold rounded-md hover:bg-violet-100 transition-colors truncate max-w-full"
                                                        >
                                                            {sub.name}
                                                        </button>
                                                        </PremiumTooltip>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-[10px] text-gray-400 py-0.5">
                                                    없음 (컴포넌트 캔버스에서 부분 컴포넌트화로 등록)
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>,
                    getPanelPortalRoot()
                );
                })()}
        </div>
    );
};

export default ComponentPickerButton;
