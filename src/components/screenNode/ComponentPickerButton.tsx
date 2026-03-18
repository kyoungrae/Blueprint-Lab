import React, { useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box, Crown, GripVertical } from 'lucide-react';
import type { Screen } from '../../types/screenDesign';
import type { Project } from '../../types/erd';
import { PAGE_SIZE_PRESETS, PAGE_SIZE_OPTIONS } from '../../types/screenDesign';
import { getImageDisplayUrl } from '../../utils/imageUrl';
import PremiumTooltip from './PremiumTooltip';
import DrawElementsPreview from './DrawElementsPreview';
import { useAuthStore } from '../../store/authStore';

const getCanvasSize = (c: Screen): { w: number; h: number } => {
    const sizeKey = c.pageSize && PAGE_SIZE_OPTIONS.includes(c.pageSize as any) ? c.pageSize! : 'A4';
    const preset = PAGE_SIZE_PRESETS[sizeKey];
    const orientation = c.pageOrientation || 'portrait';
    return orientation === 'landscape'
        ? { w: preset.height, h: preset.width }
        : { w: preset.width, h: preset.height };
};

const getPanelPortalRoot = () => document.getElementById('panel-portal-root') || document.body;

const useMeasure = () => {
    const ref = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 176, height: 96 });
    
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        
        const update = () => {
            // 🚀 핵심 수정: getBoundingClientRect() 삭제! 
            // offsetWidth와 offsetHeight는 부모의 scale(줌) 속성에 영향을 받지 않는 순수 고유 크기입니다.
            const width = el.offsetWidth;
            const height = el.offsetHeight;
            
            setSize({
                width: Math.max(1, width),
                height: Math.max(1, height),
            });
        };
        
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    
    return [ref, size] as const;
};

interface ComponentCardProps {
    c: Screen;
    validSubs: { id: string; name: string; elementIds: string[] }[];
    hoveredSub: { componentId: string; subId: string } | null;
    setHoveredSub: (v: { componentId: string; subId: string } | null) => void;
    onInsert: (component: Screen, subComponentId?: string) => void;
}

const ComponentCard: React.FC<ComponentCardProps> = ({ c, validSubs, hoveredSub, setHoveredSub, onInsert }) => {
    const [previewRef, previewSize] = useMeasure();
    const isHoveringSub = hoveredSub?.componentId === c.id;
    const hoveredSubData = isHoveringSub && hoveredSub
        ? validSubs.find((s) => s.id === hoveredSub.subId)
        : null;
    const previewElements = hoveredSubData
        ? (c.drawElements ?? []).filter((e) => hoveredSubData.elementIds?.includes(e.id))
        : c.drawElements ?? [];
    const showSubPreview = hoveredSubData && previewElements.length > 0;

    return (
        <div className="flex-none w-44 flex flex-col gap-2">
            <PremiumTooltip label="전체 추가" dotColor="#14b8a6">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onInsert(c);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseEnter={() => setHoveredSub(null)}
                    className="w-full bg-white p-2 rounded-lg shadow-sm hover:shadow-md transition-colors text-left border border-gray-100"
                >
                    <div
                        ref={previewRef}
                        className="w-full h-24 rounded-md overflow-hidden bg-gray-50 border border-gray-100 mb-2 flex items-center justify-center min-h-[96px]"
                    >
                        {c.imageUrl && !showSubPreview ? (
                            <img src={getImageDisplayUrl(c.imageUrl)} className="w-full h-full object-cover" alt="" />
                        ) : previewElements.length > 0 ? (
                            <DrawElementsPreview
                                elements={previewElements}
                                width={previewSize.width}
                                height={previewSize.height}
                                className="rounded-md"
                                canvasWidth={showSubPreview ? undefined : getCanvasSize(c).w}
                                canvasHeight={showSubPreview ? undefined : getCanvasSize(c).h}
                            />
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
                {validSubs.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {validSubs.map((sub) => (
                            <PremiumTooltip key={sub.id} label={`${sub.name} 삽입`} dotColor="#7c3aed">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onInsert(c, sub.id);
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onMouseEnter={() => setHoveredSub({ componentId: c.id, subId: sub.id })}
                                    onMouseLeave={() => setHoveredSub(null)}
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
    );
};

export interface ComponentPickerButtonProps {
    show: boolean;
    onShowChange: (show: boolean) => void;
    position: { x: number; y: number };
    onPositionChange: (pos: { x: number; y: number }) => void;
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
    // zoom, // 🗑️ 삭제: 더 이상 줌 배율을 사용하지 않음
    flowToScreenPosition,
    screenToFlowPosition,
    componentList,
    linkedComponentProject,
    onInsert,
    buttonRef,
    isDraggingRef,
}) => {
    const { user } = useAuthStore();
    const tier = user?.tier || 'FREE';
    const canUseComponentPicker = tier === 'PRO' || tier === 'MASTER';
    const [hoveredSub, setHoveredSub] = useState<{ componentId: string; subId: string } | null>(null);

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
            <PremiumTooltip
                label={canUseComponentPicker
                    ? '컴포넌트 추가'
                    : '컴포넌트 추가는 Pro tier 이상부터 사용 가능합니다. 관리자에게 문의해 주세요.'}
                dotColor={canUseComponentPicker ? '#14b8a6' : undefined}
            >
                <div className="relative">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!canUseComponentPicker) return;
                            if (!show) {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                onPositionChange({ x: flowPos.x, y: flowPos.y });
                            }
                            onShowChange(!show);
                        }}
                        className={`p-2 rounded-lg transition-colors ${!canUseComponentPicker ? 'cursor-not-allowed opacity-75' : ''} ${show ? 'bg-teal-100 text-teal-600' : 'hover:bg-gray-100 text-gray-500'}`}
                    >
                        <Box size={18} />
                    </button>
                    {!canUseComponentPicker && (
                        <div className="absolute flex items-center gap-0.5 px-1 py-px rounded bg-amber-100 text-amber-700 border border-amber-200/80 whitespace-nowrap" style={{ top: '-3.7px' }}>
                            <Crown size={8} className="text-amber-600 shrink-0" />
                            <span className="text-[7px] font-semibold leading-none">Pro</span>
                        </div>
                    )}
                </div>
            </PremiumTooltip>
            {show &&
                (() => {
                    const screenPos = flowToScreenPosition({ x: position.x, y: position.y });
                    return createPortal(
                        <div
                            data-component-picker-portal
                            className="nodrag nopan fixed bg-white border border-gray-200 rounded-xl shadow-2xl p-3 z-[9000] animate-in fade-in zoom-in origin-top-left min-w-[200px] max-h-[320px] overflow-y-auto"
                            style={{
                                // 1. 도화지를 움직이거나 줌을 해도 위치(X, Y)는 정확히 버튼을 따라갑니다.
                                left: screenPos.x,
                                top: screenPos.y,
                                
                                // 2. 🚀 핵심: 줌(zoom) 변수를 아예 삭제합니다! 
                                // 화면에서 항상 읽기 좋은 고정 크기(예: 0.9배 또는 1배)로 유지시킵니다.
                                transform: 'scale(0.9)', 
                                transformOrigin: 'top left',
                            }}
                        >
                            <PremiumTooltip label="드래그하여 이동">
                                <div
                                    className="w-full flex items-center justify-start -mx-3 px-3 border-b border-gray-100 pb-2 mb-2 cursor-grab active:cursor-grabbing group/header"
                                    onMouseDown={handleHeaderMouseDown}
                                >
                                    <div className="flex items-center gap-2" style={{minWidth:'175px'}}>
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
                                    componentList.map((c) => {
                                        const drawIds = new Set((c.drawElements ?? []).map((e) => e.id));
                                        const validSubs = (c.subComponents ?? []).filter((sub) =>
                                            sub.elementIds?.length > 0 && sub.elementIds.every((eid) => drawIds.has(eid))
                                        );
                                        return (
                                            <ComponentCard
                                                key={c.id}
                                                c={c}
                                                validSubs={validSubs}
                                                hoveredSub={hoveredSub}
                                                setHoveredSub={setHoveredSub}
                                                onInsert={onInsert}
                                            />
                                        );
                                    })
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
