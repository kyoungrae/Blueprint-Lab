const KOREAN = /[가-힣]/;

function hasKorean(text: string): boolean {
    return KOREAN.test(text);
}

/** 줄바꿈·탭·연속 공백(유니코드 공백 포함)을 단일 스페이스로 — 동일 문구의 억울한 중복 키 방지 */
export function normalizeTranslationWhitespace(s: string): string {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 번역 추출용: HTML 주석·태그만 제거하고 일반 텍스트의 `>` 는 유지.
 * 기존 /<[^>]*>/g 는 `<전자업무 > 메뉴>` 처럼 `<` 뒤에 태그명이 아닌 경우까지 한 덩어리로 지워
 * 한글이 전부 사라질 수 있음 → `<` 다음이 ASCII 태그명인 경우만 태그로 간주.
 */
function stripHtmlForExtract(raw: string): string {
    let s = raw.replace(/&nbsp;/gi, ' ');
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
    // </? + (영문 태그명) + 속성… + >
    s = s.replace(/<\/?[a-zA-Z][\w:-]*(?:\s[^>]*)?>/g, '');
    return normalizeTranslationWhitespace(s);
}

/** 줄바꿈 유지 — PPT 한 상자 안 여러 줄을 줄별 사전 키로도 등록 */
function stripHtmlPreserveLines(raw: string): string {
    let s = raw.replace(/&nbsp;/gi, ' ');
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
    return s
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
}

/** HTML 태그 제거 후 한글이 포함된 문자열만 수집 */
export function extractKoreanWords(projectsData: unknown): string[] {
    const textSet = new Set<string>();

    const traverse = (obj: unknown): void => {
        if (typeof obj === 'string') {
            const clean = stripHtmlForExtract(obj);
            if (clean && hasKorean(clean)) {
                textSet.add(clean);
            }
            const withLines = stripHtmlPreserveLines(obj);
            if (withLines && hasKorean(withLines)) {
                for (const part of withLines.split('\n')) {
                    const line = normalizeTranslationWhitespace(part);
                    if (line && hasKorean(line)) {
                        textSet.add(line);
                    }
                }
            }
        } else if (Array.isArray(obj)) {
            obj.forEach(traverse);
        } else if (typeof obj === 'object' && obj !== null) {
            Object.values(obj as Record<string, unknown>).forEach(traverse);
        }
    };

    traverse(projectsData);
    return Array.from(textSet);
}
