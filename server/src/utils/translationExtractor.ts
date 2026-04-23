const KOREAN = /[가-힣]/;

function hasKorean(text: string): boolean {
    return KOREAN.test(text);
}

/** HTML 태그 제거 후 한글이 포함된 문자열만 수집 */
export function extractKoreanWords(projectsData: unknown): string[] {
    const textSet = new Set<string>();

    const traverse = (obj: unknown): void => {
        if (typeof obj === 'string') {
            const clean = obj.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            if (clean && hasKorean(clean)) {
                textSet.add(clean);
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
