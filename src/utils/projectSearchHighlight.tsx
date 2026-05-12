import React from 'react';

export function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** HTML/리치텍스트에서 검색·하이라이트용 평문 추출 (브라우저 외 환경에서는 태그만 제거) */
export function stripHtmlToPlainText(html: string): string {
    if (!html) return '';
    if (typeof document === 'undefined') {
        return html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '');
    }
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent ?? '';
}

/** 검색어가 문자열에 포함되는지(대소문자 무시) */
export function textMatchesSearchHighlight(text: string, term: string | null | undefined): boolean {
    if (!term || !text) return false;
    return text.toLowerCase().includes(term.toLowerCase());
}

/** 일치 부분을 <mark>로 감싼 React 노드 (검색어가 없거나 일치 없으면 원문 문자열) */
export function renderTextWithSearchHighlight(
    text: string,
    term: string | null | undefined,
    keyPrefix: string
): React.ReactNode {
    if (!term || !text) return text;
    let re: RegExp;
    try {
        re = new RegExp(`(${escapeRegExp(term)})`, 'gi');
    } catch {
        return text;
    }
    const parts = text.split(re);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
        if (part.toLowerCase() === term.toLowerCase()) {
            return (
                <mark
                    key={`${keyPrefix}-${i}`}
                    className="bg-amber-300/90 text-inherit rounded-sm px-0.5 ring-1 ring-amber-500/40"
                >
                    {part}
                </mark>
            );
        }
        return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
    });
}
