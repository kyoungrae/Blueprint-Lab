/**
 * 폰트 표시 이름 → CSS font-family (폴백 포함)
 * Windows/Mac 크로스플랫폼 및 한글 폰트 실제 반영용
 */
const FONT_CSS_MAP: Record<string, string> = {
    'Pretendard': 'Pretendard, -apple-system, BlinkMacSystemFont, sans-serif',
    '맑은 고딕': '"맑은 고딕", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
    '굴림': '"굴림", "Gulim", "AppleGothic", sans-serif',
    '돋움': '"돋움", "Dotum", "AppleGothic", sans-serif',
    '바탕': '"바탕", "Batang", "AppleMyungjo", serif',
    '바탕체': '"바탕체", "Batangche", "Batang", serif',
    '궁서': '"궁서", "Gungsuh", "AppleMyungjo", serif',
    '궁서체': '"궁서체", "Gungsuhche", "Gungsuh", serif',
    '새굴림': '"새굴림", "New Gulim", "Gulim", sans-serif',
    'Arial': 'Arial, Helvetica, sans-serif',
    'Helvetica': 'Helvetica, Arial, sans-serif',
    'Georgia': 'Georgia, serif',
    'Times New Roman': '"Times New Roman", Times, serif',
    'Courier New': '"Courier New", Courier, monospace',
    'Verdana': 'Verdana, sans-serif',
    'Calibri': 'Calibri, "Helvetica Neue", sans-serif',
    'Cambria': 'Cambria, Georgia, serif',
};

/** 저장된 fontFamily → 실제 렌더링용 CSS font-family 문자열 */
export function resolveFontFamilyCSS(fontFamily: string | undefined): string {
    if (!fontFamily || !fontFamily.trim()) {
        return FONT_CSS_MAP['Pretendard'] ?? 'Pretendard, sans-serif';
    }
    const primary = fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    const resolved = FONT_CSS_MAP[primary];
    if (resolved) return resolved;
    // 업로드된 커스텀 폰트 등: 공백 있으면 따옴표로 감싸기
    if (primary.includes(' ')) {
        return `"${primary}", sans-serif`;
    }
    return `${primary}, sans-serif`;
}
