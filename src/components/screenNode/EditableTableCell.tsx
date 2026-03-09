import React, { useRef, useEffect } from 'react';

interface EditableTableCellProps {
    tableId: string;
    value: string;
    cellIndex: number;
    isLocked: boolean;
    restoreSelectionRef?: React.MutableRefObject<{ tableId: string; cellIndex: number } | null>;
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

/** Strip HTML tags to get plain text (avoids contentEditable BiDi reversal bug) */
function stripHtml(html: string): string {
    if (!html || typeof html !== 'string') return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

/** Table cell using textarea - avoids contentEditable BiDi reversal with Korean/IME */
const EditableTableCell: React.FC<EditableTableCellProps> = ({
    tableId,
    value,
    cellIndex,
    isLocked,
    restoreSelectionRef,
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
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const blurFromToolbarRef = useRef(false);
    const lastSelectionRef = useRef({ start: 0, end: 0 });

    const plainValue = stripHtml(value || '');
    const displayValue = isComposing && composingValue != null ? stripHtml(composingValue) : plainValue;

    useEffect(() => {
        if (autoFocus && textareaRef.current) {
            textareaRef.current.focus();
            const len = displayValue.length;
            textareaRef.current.setSelectionRange(len, len);
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

    useEffect(() => {
        if (!restoreSelectionRef?.current || textareaRef.current == null) return;
        const req = restoreSelectionRef.current;
        if (req.tableId !== tableId || req.cellIndex !== cellIndex) return;
        const el = textareaRef.current;
        const { start, end } = lastSelectionRef.current;
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(start, end);
            restoreSelectionRef!.current = null;
        });
    });

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const v = e.target.value;
        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
            onComposingChange(v);
            return;
        }
        onComposingChange(null);
        onValueChange(v);
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
        const v = (e.target as HTMLTextAreaElement).value;
        onComposingChange(null);
        onValueChange(v);
    };

    const handleSelect = () => {
        const el = textareaRef.current;
        if (!el) return;
        const { selectionStart, selectionEnd } = el;
        lastSelectionRef.current = { start: selectionStart, end: selectionEnd };
        if (selectionStart !== selectionEnd) {
            const rect = el.getBoundingClientRect();
            onSelectionChange(rect);
            return;
        }
        onSelectionChange(null);
    };

    return (
        <textarea
            ref={textareaRef}
            dir="ltr"
            value={displayValue}
            onChange={handleChange}
            onCompositionEnd={handleCompositionEnd}
            onSelect={handleSelect}
            onMouseUp={handleSelect}
            onKeyUp={handleSelect}
            onBlur={() => {
                requestAnimationFrame(() => {
                    if (blurFromToolbarRef.current) return;
                    const active = document.activeElement;
                    if (active instanceof Element && active.closest('[data-text-style-toolbar], [data-style-panel], [data-font-style-panel], [data-font-style-trigger]')) return;
                    onSelectionChange(null);
                });
                onBlur();
            }}
            onKeyDown={onKeyDown}
            onMouseDown={onMouseDown}
            readOnly={isLocked}
            disabled={isLocked}
            className={className}
            style={{ ...style, direction: 'ltr', resize: 'none', overflow: 'hidden' }}
            data-cell-index={cellIndex}
            spellCheck={false}
        />
    );
};

export default EditableTableCell;
