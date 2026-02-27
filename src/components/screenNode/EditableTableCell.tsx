import React, { useRef, useEffect } from 'react';

interface EditableTableCellProps {
    value: string;
    cellIndex: number;
    isLocked: boolean;
    autoFocus?: boolean;
    isComposing: boolean;
    composingValue: string | null;
    onComposingChange: (value: string | null) => void;
    onValueChange: (html: string) => void;
    onSelectionChange: (rect: DOMRect | null) => void;
    onBlur: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onMouseDown: (e: React.MouseEvent) => void;
    className?: string;
    style?: React.CSSProperties;
}

/** contentEditable table cell for rich text (font size, color, etc.) */
const EditableTableCell: React.FC<EditableTableCellProps> = ({
    value,
    cellIndex,
    isLocked,
    autoFocus,
    isComposing,
    composingValue,
    onComposingChange,
    onValueChange,
    onSelectionChange,
    onBlur,
    onKeyDown,
    onMouseDown,
    className = '',
    style = {},
}) => {
    const divRef = useRef<HTMLDivElement>(null);
    const blurFromToolbarRef = useRef(false);

    useEffect(() => {
        if (!divRef.current) return;
        if (isComposing && composingValue != null) {
            if (divRef.current.innerHTML !== composingValue) divRef.current.innerHTML = composingValue;
        } else if (!isComposing && divRef.current.innerHTML !== (value || '')) {
            divRef.current.innerHTML = value || '';
        }
    }, [value, isComposing, composingValue]);

    useEffect(() => {
        if (autoFocus && divRef.current) {
            divRef.current.focus();
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
        if (divRef.current && !isComposing) {
            if (e?.nativeEvent && (e.nativeEvent as any).isComposing) return;
            onValueChange(divRef.current.innerHTML);
        }
    };

    const handleCompositionEnd = () => {
        if (divRef.current) {
            onComposingChange(null);
            onValueChange(divRef.current.innerHTML);
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
            contentEditable={!isLocked}
            suppressContentEditableWarning
            onInput={(e) => {
                if ((e.nativeEvent as any).isComposing) {
                    onComposingChange((e.target as HTMLDivElement).innerHTML);
                    return;
                }
                onComposingChange(null);
                onValueChange((e.target as HTMLDivElement).innerHTML);
            }}
            onCompositionEnd={handleCompositionEnd}
            onSelect={handleSelect}
            onMouseUp={handleSelect}
            onKeyUp={handleSelect}
            onBlur={() => {
                handleInput();
                requestAnimationFrame(() => {
                    if (blurFromToolbarRef.current) return;
                    const active = document.activeElement;
                    if (active instanceof Element && active.closest('[data-text-style-toolbar], [data-style-panel]')) return;
                    onSelectionChange(null);
                });
                onBlur();
            }}
            onKeyDown={onKeyDown}
            onMouseDown={onMouseDown}
            className={className}
            style={style}
            data-cell-index={cellIndex}
        />
    );
};

export default EditableTableCell;
