import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { DrawElement } from '../../types/screenDesign';
import { resolveFontFamilyCSS } from '../../utils/fontFamily';
import { sanitizePasteHtml } from '../../utils/sanitizePasteHtml';

const TEXT_UPDATE_DEBOUNCE_MS = 120;

/** 툴바 +/- 클릭 시 캔버스에 즉시 반영하기 위한 커스텀 이벤트 (ScreenNode 전체 리렌더 없이 해당 텍스트만 갱신) */
export const FONT_SIZE_OVERRIDE_EVENT = 'font-size-override';

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
    /** 낙관적 폰트 크기 표시 (툴바 +/- 클릭 시 즉시 반영) */
    fontSizeOverride?: number;
}

const DrawTextComponent: React.FC<DrawTextComponentProps> = ({
    element,
    isLocked,
    isSelected,
    onUpdate,
    onSelectionChange,
    autoFocus,
    className,
    compact = false,
    fontSizeOverride
}) => {
    const divRef = useRef<HTMLDivElement>(null);
    const blurFromToolbarRef = useRef(false);
    const textUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSentTextRef = useRef<string | null>(null);
    /** 툴바 +/- 클릭 시 즉시 표시 (이벤트로만 갱신해 ScreenNode 리렌더 없음) */
    const [localFontSizeOverride, setLocalFontSizeOverride] = useState<number | null>(null);

    useEffect(() => {
        const handler = (e: Event) => {
            const { elementId, px } = (e as CustomEvent<{ elementId: string; px: number }>).detail;
            if (elementId === element.id) setLocalFontSizeOverride(px);
        };
        window.addEventListener(FONT_SIZE_OVERRIDE_EVENT, handler);
        return () => window.removeEventListener(FONT_SIZE_OVERRIDE_EVENT, handler);
    }, [element.id]);

    useEffect(() => {
        if (localFontSizeOverride != null && (element.fontSize ?? 14) === localFontSizeOverride) setLocalFontSizeOverride(null);
    }, [element.fontSize, localFontSizeOverride]);

    // Sync content with element.text (undo/remote 등). 편집 중(포커스 있음)이면 덮어쓰지 않아 커서 유지·역순 입력 버그 방지
    useEffect(() => {
        const el = divRef.current;
        if (!el || el.innerHTML === (element.text || '')) return;
        if (document.activeElement && el.contains(document.activeElement)) return;
        el.innerHTML = element.text || '';
        lastSentTextRef.current = element.text || null;
    }, [element.text]);

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

    const flushTextUpdate = useCallback(() => {
        if (textUpdateTimerRef.current) {
            clearTimeout(textUpdateTimerRef.current);
            textUpdateTimerRef.current = null;
        }
        if (!divRef.current) return;
        const html = divRef.current.innerHTML;
        if (lastSentTextRef.current === html) return;
        lastSentTextRef.current = html;
        onUpdate({ text: html });
    }, [onUpdate]);

    const scheduleTextUpdate = useCallback(() => {
        if (!divRef.current) return;
        if (textUpdateTimerRef.current) clearTimeout(textUpdateTimerRef.current);
        textUpdateTimerRef.current = setTimeout(() => {
            textUpdateTimerRef.current = null;
            if (!divRef.current) return;
            const html = divRef.current.innerHTML;
            if (lastSentTextRef.current === html) return;
            lastSentTextRef.current = html;
            onUpdate({ text: html });
        }, TEXT_UPDATE_DEBOUNCE_MS);
    }, [onUpdate]);

    const handleInput = (e?: React.FormEvent) => {
        if (!divRef.current) return;
        if (e?.nativeEvent && (e.nativeEvent as any).isComposing) return;
        scheduleTextUpdate();
    };

    const handleCompositionEnd = () => {
        if (divRef.current) flushTextUpdate();
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

    return (
        <div
            ref={divRef}
            contentEditable={!isLocked && isSelected}
            onInput={handleInput}
            onPaste={handlePaste}
            onCompositionEnd={handleCompositionEnd}
            onSelect={handleSelect}
            onMouseUp={handleSelect}
            onKeyUp={handleSelect}
            onBlur={() => {
                flushTextUpdate();
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
            className={`nodrag nopan outline-none text-gray-800 break-words ${compact ? 'min-h-0 h-full w-full p-0' : 'p-0 min-h-[1.4em] w-full'} ${!isSelected ? 'pointer-events-none' : 'pointer-events-auto'} ${element.textAlign === 'center' ? 'text-center' : element.textAlign === 'right' ? 'text-right' : 'text-left'} ${className || ''}`}
            style={{
                fontSize: `${localFontSizeOverride ?? fontSizeOverride ?? element.fontSize ?? 14}px`,
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
