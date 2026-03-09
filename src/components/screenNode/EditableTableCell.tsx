import React, { useRef, useEffect, useCallback } from 'react';
import { sanitizePasteHtml } from '../../utils/sanitizePasteHtml';

const TEXT_UPDATE_DEBOUNCE_MS = 120;


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

/** contentEditable 내에서 문자 오프셋으로 Selection 복원 */
function setSelectionAtOffset(container: HTMLElement, start: number, end: number) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    let current = 0;
    let startNode: Node | null = null;
    let startOffset = 0;
    let endNode: Node | null = null;
    let endOffset = 0;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const len = node.textContent?.length ?? 0;
        if (current <= start && start <= current + len) {
            startNode = node;
            startOffset = start - current;
        }
        if (current <= end && end <= current + len) {
            endNode = node;
            endOffset = end - current;
        }
        current += len;
    }
    if (startNode && endNode) {
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

/** contentEditable div 사용 - 리치 텍스트(색상, 크기, 폰트) 붙여넣기 지원 */
const EditableTableCell: React.FC<EditableTableCellProps> = ({
    tableId,
    value,
    cellIndex,
    isLocked,
    restoreSelectionRef,
    autoFocus,
    isComposing,
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
    const lastSelectionRef = useRef({ start: 0, end: 0 });
    const textUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSentTextRef = useRef<string | null>(null);

    // value → DOM 동기화(undo/원격 등). 편집 중(포커스 있음)이면 덮어쓰지 않아 커서 유지·역순 입력 버그 방지
    useEffect(() => {
        if (isComposing) return;
        const el = divRef.current;
        if (!el || el.innerHTML === (value || '')) return;
        if (document.activeElement && el.contains(document.activeElement)) return;
        el.innerHTML = value || '';
        lastSentTextRef.current = value || null;
    }, [value, isComposing]);

    useEffect(() => {
        return () => {
            if (textUpdateTimerRef.current) {
                clearTimeout(textUpdateTimerRef.current);
                textUpdateTimerRef.current = null;
            }
        };
    }, []);

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
                && !!target.closest('[data-text-style-toolbar], [data-style-panel], [data-font-style-panel], [data-font-style-trigger]');
        };
        document.addEventListener('mousedown', handleMouseDownCapture, true);
        return () => document.removeEventListener('mousedown', handleMouseDownCapture, true);
    }, []);

    useEffect(() => {
        if (!restoreSelectionRef?.current || divRef.current == null) return;
        const req = restoreSelectionRef.current;
        if (req.tableId !== tableId || req.cellIndex !== cellIndex) return;
        const el = divRef.current;
        const { start, end } = lastSelectionRef.current;
        requestAnimationFrame(() => {
            el.focus();
            setSelectionAtOffset(el, start, end);
            restoreSelectionRef!.current = null;
        });
    });

    const flushTextUpdate = useCallback(() => {
        if (textUpdateTimerRef.current) {
            clearTimeout(textUpdateTimerRef.current);
            textUpdateTimerRef.current = null;
        }
        if (!divRef.current) return;
        const html = divRef.current.innerHTML;
        if (lastSentTextRef.current === html) return;
        lastSentTextRef.current = html;
        onValueChange(html);
    }, [onValueChange]);

    const scheduleTextUpdate = useCallback(() => {
        if (!divRef.current) return;
        if (textUpdateTimerRef.current) clearTimeout(textUpdateTimerRef.current);
        textUpdateTimerRef.current = setTimeout(() => {
            textUpdateTimerRef.current = null;
            if (!divRef.current) return;
            const html = divRef.current.innerHTML;
            if (lastSentTextRef.current === html) return;
            lastSentTextRef.current = html;
            onValueChange(html);
        }, TEXT_UPDATE_DEBOUNCE_MS);
    }, [onValueChange]);

    const handleInput = (e?: React.FormEvent) => {
        if (!divRef.current) return;
        if (e?.nativeEvent && (e.nativeEvent as { isComposing?: boolean }).isComposing) return;
        if ((window as any)._isFormattingCell) return; // 폰트 사이즈/스타일 버튼 클릭으로 발생한 input 이벤트는 스토어 갱신을 우회
        scheduleTextUpdate();
    };

    const handleCompositionEnd = () => {
        if (divRef.current) {
            onComposingChange(null);
            flushTextUpdate();
        }
    };

    const handleCopy = (e: React.ClipboardEvent) => {
        const cd = e.clipboardData;
        if (!cd || !divRef.current) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!divRef.current.contains(range.commonAncestorContainer)) return;
        const fragment = range.cloneContents();
        const wrap = document.createElement('div');
        wrap.appendChild(fragment);
        const html = wrap.innerHTML;
        const plain = range.toString();
        if (html || plain) {
            e.preventDefault();
            if (html) cd.setData('text/html', html);
            if (plain) cd.setData('text/plain', plain);
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const cd = e.clipboardData;
        if (!cd || !divRef.current) return;
        const html = cd.getData('text/html');
        if (html) {
            e.preventDefault();
            const sanitized = sanitizePasteHtml(html);
            document.execCommand('insertHTML', false, sanitized);
            flushTextUpdate();
            return;
        }
        const text = cd.getData('text/plain');
        if (text) {
            e.preventDefault();
            document.execCommand('insertText', false, text);
            flushTextUpdate();
        }
    };

    const handleSelect = () => {
        const el = divRef.current;
        if (!el) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const pre = range.cloneRange();
        pre.selectNodeContents(el);
        pre.setEnd(range.startContainer, range.startOffset);
        const start = pre.toString().length;
        const end = start + range.toString().length;
        lastSelectionRef.current = { start, end };
        if (start !== end) {
            onSelectionChange(el.getBoundingClientRect());
            return;
        }
        onSelectionChange(null);
    };

    return (
        <div
            ref={divRef}
            contentEditable={!isLocked}
            suppressContentEditableWarning
            dir="ltr"
            onInput={handleInput}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onCompositionStart={() => onComposingChange('')}
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
                flushTextUpdate();
                onBlur();
            }}
            onKeyDown={onKeyDown}
            onMouseDown={onMouseDown}
            className={className}
            style={{ ...style, direction: 'ltr', resize: 'none', overflow: 'hidden', outline: 'none' }}
            data-cell-index={cellIndex}
            spellCheck={false}
        />
    );
};

export default EditableTableCell;
