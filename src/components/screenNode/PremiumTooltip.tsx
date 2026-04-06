import React, { useState, useRef, useCallback, useContext } from 'react';
import { createPortal } from 'react-dom';
import { TooltipPortalContext } from '../../contexts/TooltipPortalContext';

/** 노드 안: 컨테이너 포탈(overflow-visible). 패널 포탈 안(격자/스타일/레이어 등): body 포탈(fixed). */
const DEFAULT_TOOLTIP_Z_INDEX = 1000;
const BODY_PORTAL_Z_INDEX = 99999;

const GAP = 8;

/** body로 포탈된 플로팅 패널 셀렉터. 이 안에 있으면 툴팁을 인라인으로 렌더해 패널 scale/줌에 따라 크기·위치가 맞게 동작 */
const FLOATING_PANEL_SELECTOR = '[data-grid-panel], [data-style-panel], [data-layer-panel], [data-table-panel], [data-image-style-panel], [data-font-style-panel]';

/** 트리거가 컨테이너 뷰포트 영역 안에 있는지 (패널이 body로 포탈된 경우 false) */
function isTriggerInsideContainer(tr: DOMRect, cr: DOMRect): boolean {
    const centerX = tr.left + tr.width / 2;
    const centerY = tr.top + tr.height / 2;
    return centerX >= cr.left && centerX <= cr.right && centerY >= cr.top && centerY <= cr.bottom;
}

interface PremiumTooltipProps {
    label: string;
    children: React.ReactNode;
    dotColor?: string;
    placement?: 'top' | 'bottom';
    /** bottom 배치 시 버튼과의 간격(px). 기본 8 */
    offsetBottom?: number;
    zIndex?: number;
    /** 래퍼 div에 붙일 클래스 (예: w-full로 부모 너비 채우기) */
    wrapperClassName?: string;
    /** true면 항상 document.body에 툴팁 렌더 (overflow로 잘림 방지) */
    forceBodyPortal?: boolean;
    /**
     * true면 body 포탈 툴팁 z-index를 zIndex 그대로 씀 (기본은 max(zIndex, 99999)로 앱 크롬보다 위).
     * 캔버스 보조 UI처럼 사이드바·툴바 아래에 두려면 forceBodyPortal과 함께 켜기.
     */
    bodyZIndexExact?: boolean;
    screenId?: string;
}

const PremiumTooltip: React.FC<PremiumTooltipProps> = ({
    label,
    children,
    dotColor,
    placement = 'bottom',
    offsetBottom,
    zIndex = DEFAULT_TOOLTIP_Z_INDEX,
    wrapperClassName,
    forceBodyPortal: forceBodyPortalProp,
    bodyZIndexExact = false,
    screenId,
}) => {
    const [visible, setVisible] = useState(false);
    const [portalPos, setPortalPos] = useState({ left: 0, top: 0 });
    const [viewportPos, setViewportPos] = useState({ left: 0, top: 0 });
    const [useBodyPortal, setUseBodyPortal] = useState(false);
    const [insideFloatingPanel, setInsideFloatingPanel] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const portalRootRef = useContext(TooltipPortalContext);
    const gap = offsetBottom ?? GAP;

    const updatePosition = useCallback(() => {
        const el = wrapperRef.current;
        if (!el) return;
        const tr = el.getBoundingClientRect();
        const centerX = tr.left + tr.width / 2;

        if (forceBodyPortalProp) {
            setViewportPos({ left: centerX, top: placement === 'top' ? tr.top - gap : tr.bottom + gap });
            setUseBodyPortal(true);
            return;
        }

        // 플로팅 패널 안이면 인라인 렌더 → 패널 transform/줌에 따라 툴팁 크기·위치가 버튼에 맞게 유지
        const isInsideFloatingPanel = el.closest(FLOATING_PANEL_SELECTOR) != null;
        if (isInsideFloatingPanel) {
            setInsideFloatingPanel(true);
            setUseBodyPortal(false);
            return;
        }
        setInsideFloatingPanel(false);

        const container = portalRootRef?.current;
        if (container) {
            const cr = container.getBoundingClientRect();
            if (isTriggerInsideContainer(tr, cr)) {
                const scaleX = cr.width > 0 && container.offsetWidth > 0 ? cr.width / container.offsetWidth : 1;
                const scaleY = cr.height > 0 && container.offsetHeight > 0 ? cr.height / container.offsetHeight : 1;
                setPortalPos({
                    left: (tr.left - cr.left + tr.width / 2) / scaleX,
                    top: placement === 'top'
                        ? (tr.top - cr.top - gap) / scaleY
                        : (tr.bottom - cr.top + gap) / scaleY,
                });
                setViewportPos({ left: centerX, top: placement === 'top' ? tr.top - gap : tr.bottom + gap });
                setUseBodyPortal(false);
                return;
            }
            // 컨테이너는 있지만 트리거가 밖에 있음 → body 포탈로 패널 위에 표시
            setViewportPos({
                left: centerX,
                top: placement === 'top' ? tr.top - gap : tr.bottom + gap,
            });
            setUseBodyPortal(true);
            return;
        }
        // 컨텍스트 없음(상단바/일반 UI 등) → body 포탈로 렌더해 부모 overflow/scroll 계산에 영향 없게
        setViewportPos({
            left: centerX,
            top: placement === 'top' ? tr.top - gap : tr.bottom + gap,
        });
        setUseBodyPortal(true);
    }, [placement, gap, portalRootRef, forceBodyPortalProp]);

    const handleMouseEnter = useCallback(() => {
        updatePosition();
        setVisible(true);
    }, [updatePosition]);

    const handleMouseLeave = useCallback(() => setVisible(false), []);
    const handleClickCapture = useCallback(() => setVisible(false), []);

    const inlineStyle: React.CSSProperties =
        placement === 'top'
            ? { left: '50%', bottom: '100%', transform: 'translate(-50%, 0)', marginBottom: gap, zIndex }
            : { left: '50%', top: '20px', transform: 'translate(-50%, 0)', marginTop: gap, zIndex };

    const containerPortalStyle: React.CSSProperties =
        placement === 'top'
            ? { position: 'absolute' as const, left: portalPos.left, top: portalPos.top, transform: 'translate(-50%, -100%)', zIndex }
            : { position: 'absolute' as const, left: portalPos.left, top: portalPos.top, transform: 'translate(-50%, 0)', zIndex };

    const bodyZ = bodyZIndexExact ? zIndex : Math.max(zIndex, BODY_PORTAL_Z_INDEX);
    const bodyPortalStyle: React.CSSProperties =
        placement === 'top'
            ? { position: 'fixed' as const, left: viewportPos.left, top: viewportPos.top, transform: 'translate(-50%, -100%)', zIndex: bodyZ }
            : { position: 'fixed' as const, left: viewportPos.left, top: viewportPos.top, transform: 'translate(-50%, 0)', zIndex: bodyZ };

    const useContainerPortal = visible && !useBodyPortal && !insideFloatingPanel && portalRootRef?.current != null;
    const useBody = visible && useBodyPortal && typeof document !== 'undefined' && document.body;
    const tooltipStyle = useBody ? bodyPortalStyle : useContainerPortal ? containerPortalStyle : inlineStyle;

    const tooltipContent = (
        <div
            className="absolute px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-[11px] font-medium rounded-lg shadow-2xl border border-slate-700/50 whitespace-nowrap flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
            style={tooltipStyle}
        >
            {dotColor && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />}
            {label}
            {placement === 'top' ? (
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-[5px] border-x-transparent border-b-transparent border-t-slate-900/95" style={{ pointerEvents: 'none' }} />
            ) : (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-1 border-[5px] border-x-transparent border-t-transparent border-b-slate-900/95" style={{ pointerEvents: 'none' }} />
            )}
        </div>
    );

    return (
        <div
            ref={wrapperRef}
            data-premium-tooltip
            data-screen-id={screenId}
            className={`nodrag nopan relative inline-flex items-center justify-center ${wrapperClassName ?? ''}`.trim()}
            onMouseDown={(e) => e.stopPropagation()}
            onClickCapture={handleClickCapture}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {useBody && createPortal(tooltipContent, document.body)}
            {useContainerPortal && createPortal(tooltipContent, portalRootRef!.current!)}
            {visible && !useBody && !useContainerPortal && tooltipContent}
        </div>
    );
};

export default PremiumTooltip;
