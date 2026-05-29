const KOREAN = /[가-힣]/;

export function hasKoreanText(text: string): boolean {
    return KOREAN.test(text);
}

/** DB 추출·엑셀과 동일 — 연속 공백·줄바꿈을 하나의 스페이스로 */
export function normalizeTranslationWhitespace(text: string): string {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 번역 사전 조회용 HTML 정리 (서버 translationExtractor.stripHtmlForExtract 와 동일 규칙)
 * `<전자업무 > 메뉴>` 처럼 태그가 아닌 `<` 는 유지한다.
 */
export function stripHtmlForTranslationLookup(raw: string): string {
    let s = String(raw ?? '').replace(/&nbsp;/gi, ' ');
    s = s
        .replace(/&#(\d+);/g, (m, n) => {
            const code = parseInt(n, 10);
            return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCharCode(code) : m;
        })
        .replace(/&#x([0-9a-f]+);/gi, (m, h) => {
            const code = parseInt(h, 16);
            return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCharCode(code) : m;
        })
        .replace(/&gt;/gi, '>')
        .replace(/&lt;/gi, '<')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/gi, '&');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<\/?[a-zA-Z][\w:-]*(?:\s[^>]*)?>/g, '');
    return s;
}

/** 줄 단위로 공백 정리 (줄바꿈 유지) */
export function stripHtmlPreserveLines(raw: string): string {
    const stripped = stripHtmlForTranslationLookup(raw);
    if (!stripped) return '';
    return stripped
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
}

export function plainForTranslationLookup(text: string): string {
    return String(text ?? '')
        .replace(/\u00A0/g, ' ')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'");
}

export function translationLookupKeySpaced(text: string): string {
    return normalizeTranslationWhitespace(stripHtmlForTranslationLookup(plainForTranslationLookup(text)));
}

export function translationLookupKeyCompact(text: string): string {
    const spaced = translationLookupKeySpaced(text);
    return spaced ? spaced.replace(/\s/g, '') : '';
}
