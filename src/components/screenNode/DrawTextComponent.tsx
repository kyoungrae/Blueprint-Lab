import React, { useRef, useEffect } from 'react';
import type { DrawElement } from '../../types/screenDesign';

interface DrawTextComponentProps {
    element: DrawElement;
    isLocked: boolean;
    isSelected: boolean;
    onUpdate: (updates: Partial<DrawElement>) => void;
    onSelectionChange: (rect: DOMRect | null) => void;
    autoFocus?: boolean;
    className?: string;
}

const DrawTextComponent: React.FC<DrawTextComponentProps> = ({
    element,
    isLocked,
    isSelected,
    onUpdate,
    onSelectionChange,
    autoFocus,
    className
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
                && !!target.closest('[data-text-style-toolbar], [data-style-panel]');
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
            contentEditable={!isLocked && isSelected && (!element.fromComponentId || !(element.text || '').trim())}
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
                    if (active instanceof Element && active.closest('[data-text-style-toolbar], [data-style-panel]')) {
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
            className={`outline-none p-0 text-gray-800 break-words min-h-[1.4em] w-full ${!isSelected ? 'pointer-events-none' : 'pointer-events-auto'} ${element.textAlign === 'center' ? 'text-center' : element.textAlign === 'right' ? 'text-right' : 'text-left'} ${className || ''}`}
            style={{
                fontSize: `${element.fontSize || 14}px`,
                color: element.color || '#333333',
                fontWeight: element.fontWeight || 'normal',
                lineHeight: '1.4',
                whiteSpace: 'pre-wrap',
                cursor: isSelected && (!element.fromComponentId || !(element.text || '').trim()) ? 'text' : 'default'
            }}
        />
    );
};

export default DrawTextComponent;
