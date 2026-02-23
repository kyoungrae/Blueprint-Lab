const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';
const API_BASE = API_URL.replace(/\/api\/projects\/?$/, '') || 'http://localhost:3001';

/** img src용 URL: /api/... 경로면 API_BASE 붙임, data: URL이면 그대로 */
export function getImageDisplayUrl(url: string | undefined): string {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/api/')) {
        // 개발 모드: Vite proxy(/api -> localhost:3001) 사용을 위해 상대 경로 반환
        if (import.meta.env.DEV) {
            return url;
        }
        // 프로덕션: 절대 URL 생성 (origin + /erd-api + /api/...)
        if (API_BASE.startsWith('http')) {
            return `${API_BASE}${url}`;
        }
        const base = typeof window !== 'undefined' ? window.location.origin : '';
        return `${base}${API_BASE}${url}`;
    }
    return url;
}
