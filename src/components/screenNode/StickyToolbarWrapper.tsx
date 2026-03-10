import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore as useRFStore } from 'reactflow';

const getPanelPortalRoot = () => document.getElementById('panel-portal-root') || document.body;

export const StickyToolbarWrapper: React.FC<{
    children: React.ReactNode;
    forceShow?: boolean;
}> = ({ children, forceShow }) => {
    const placeholderRef = useRef<HTMLDivElement>(null);
    const [isFloating, setIsFloating] = useState(false);

    // Subscribe to viewport transformations to re-calculate exact DOM rect during pan/zoom
    const transform = useRFStore(s => s.transform);
    // Use 0.7 (70%) as a slightly more forgiving threshold for zooming in
    const isZoomedIn = transform[2] >= 0.70;

    useEffect(() => {
        if (!placeholderRef.current) return;
        const rect = placeholderRef.current.getBoundingClientRect();

        // Find the bounding box of the whole screen node to ensure we don't float if it's completely out of view
        const screenNodeEl = placeholderRef.current.closest('.react-flow__node');
        const screenNodeRect = screenNodeEl?.getBoundingClientRect();

        // 상단 헤더의 기본 높이를 70px로 가정
        // placeholder가 70px보다 높은 위치로 올라가면 (즉 캔버스를 아래로 스크롤하여 엔티티 위쪽이 화면 밖으로 나갈 때)
        const isAboveTop = rect.top <= 70;

        // 화면 엔티티의 하단부가 여전히 화면 내에 있는지 확인 (하단부도 스크롤 위로 사라지면 고정 해제)
        const isScreenVisible = screenNodeRect ? screenNodeRect.bottom > 120 : true;

        if (isAboveTop && isScreenVisible && forceShow && isZoomedIn) {
            setIsFloating(true);
        } else {
            setIsFloating(false);
        }
    }, [transform, forceShow, isZoomedIn]);

    const shouldFloat = isFloating && forceShow && isZoomedIn;

    const toolbarClassName = shouldFloat
        ? "nodrag flex flex-col border border-gray-200 shadow-2xl z-[9000] rounded-[15px] bg-white fixed top-[70px] left-1/2 -translate-x-1/2 animate-in fade-in zoom-in-95 duration-200 transition-all pointer-events-auto"
        : "nodrag w-full flex flex-col border-b border-gray-200 shadow-sm z-[200] rounded-t-[15px]";

    const content = (
        <div className={toolbarClassName}>
            {children}
        </div>
    );

    return (
        <div ref={placeholderRef} className="nodrag w-full" style={{ minHeight: '46px' }}>
            {shouldFloat ? createPortal(content, getPanelPortalRoot()) : content}
        </div>
    );
};
