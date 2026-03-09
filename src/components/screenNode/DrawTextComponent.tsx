import React, { useRef, useEffect } from 'react';
import type { DrawElement } from '../../types/screenDesign';
import { resolveFontFamilyCSS } from '../../utils/fontFamily';

interface DrawTextComponentProps {
    element: DrawElement;
    isLocked: boolean;
    isSelected: boolean;
    onUpdate: (updates: Partial<DrawElement>) => void;
    onSelectionChange: (rect: DOMRect | null) => void;
    autoFocus?: boolean;
    className?: string;
    /** 작은 도형 안에서 텍스트를 도형 기준 중앙 정렬 (lineHeight: 1.5, padding: 0, 100% 채워서 flex 중앙 정렬) */
    compact?: boolean;
}

const DrawTextComponent: React.FC<DrawTextComponentProps> = ({
    element,
    isLocked,
    isSelected,
    onUpdate,
    onSelectionChange,
    autoFocus,
    className,
    compact = false
}) => {
    const divRef = useRef<HTMLDivElement>(null);
    const blurFromToolbarRef = useRef(false);

    // Sync content with element.text (using innerHTML for rich text support)
    useEffect(() => {
        if (divRef.current && divRef.current.innerHTML !== (element.text || '')) {
            divRef.current.innerHTML = element.text || '';
        }
    }, [element.text]);

    useEffect(() => {
        if (autoFocus && divRef.current) {
            divRef.current.focus();
            // Move cursor to end
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(divRef.current);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
    }, [autoFocus]);

    useEffect(() => {
        const handleMouseDownCapture = (e: MouseEvent) => {
            const target = e.target;
            blurFromToolbarRef.current = target instanceof Element
                && !!target.closest('[data-text-style-toolbar], [data-style-panel], [data-font-style-panel], [data-font-style-trigger]');
        };
        document.addEventListener('mousedown', handleMouseDownCapture, true);
        return () => document.removeEventListener('mousedown', handleMouseDownCapture, true);
    }, []);

    const handleInput = (e?: React.FormEvent) => {
        if (divRef.current) {
            // Check if we are in the middle of IME composition (Korean, Japanese, etc.)
            if (e?.nativeEvent && (e.nativeEvent as any).isComposing) return;
            onUpdate({ text: divRef.current.innerHTML });
        }
    };

    const handleCompositionEnd = () => {
        if (divRef.current) {
            onUpdate({ text: divRef.current.innerHTML });
        }
    };

    const handleSelect = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (!range.collapsed) {
                const rect = range.getBoundingClientRect();
                onSelectionChange(rect);
                return;
            }
        }
        onSelectionChange(null);
    };

    return (
        <div
            ref={divRef}
            contentEditable={!isLocked && isSelected && (element.type === 'text' || !element.hasComponentText)}
            onInput={handleInput}
            onCompositionEnd={handleCompositionEnd}
            onSelect={handleSelect}
            onMouseUp={handleSelect}
            onKeyUp={handleSelect}
            onBlur={() => {
                handleInput();
                // 포커스가 텍스트 스타일 툴바(글자 크기 등)로 이동한 경우 툴바가 사라지지 않도록
                // 한 프레임 뒤 activeElement 확인 (blur 시점에는 아직 갱신 안 됨)
                requestAnimationFrame(() => {
                    if (blurFromToolbarRef.current) {
                        return;
                    }
                    const active = document.activeElement;
                    if (active instanceof Element && active.closest('[data-text-style-toolbar], [data-style-panel], [data-font-style-panel], [data-font-style-trigger]')) {
                        return;
                    }
                    onSelectionChange(null);
                });
            }}
            onMouseDown={(e) => {
                if (isSelected && !isLocked) {
                    e.stopPropagation();
                }
            }}
            className={`outline-none text-gray-800 break-words ${compact ? 'min-h-0 h-full w-full p-0' : 'p-0 min-h-[1.4em] w-full'} ${!isSelected ? 'pointer-events-none' : 'pointer-events-auto'} ${element.textAlign === 'center' ? 'text-center' : element.textAlign === 'right' ? 'text-right' : 'text-left'} ${className || ''}`}
            style={{
                fontSize: `${element.fontSize || 14}px`,
                color: element.color || '#333333',
                fontWeight: element.fontWeight || 'normal',
                fontStyle: element.fontStyle || 'normal',
                textDecoration: element.textDecoration || 'none',
                fontFamily: resolveFontFamilyCSS(element.fontFamily),
                lineHeight: compact ? 1.5 : 1.4,
                whiteSpace: 'pre-wrap',
                cursor: isSelected && (element.type === 'text' || !element.hasComponentText) ? 'text' : 'default',
                ...(compact ? { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: 0 } : {})
            }}
        />
    );
};

export default DrawTextComponent;
