/**
 * 이미지 URL 변환: 저장된 경로를 개발/운영 모드에 맞게 img src용 URL로 변환
 *
 * 저장 형식(DB): /api/projects/{projectId}/images/{imageId}
 * - 개발: 상대 경로 /api/... → Vite proxy가 localhost:3001로 전달 (same-origin 요청)
 * - 운영: origin + /erd-api + /api/...
 */
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';
const API_BASE = API_URL.replace(/\/api\/projects\/?$/, '') || 'http://localhost:3001';

function getImageBaseUrl(): string {
    if (import.meta.env.DEV) {
        // 개발: 빈 문자열 → 상대 경로 사용 (Vite proxy /api → localhost:3001)
        return '';
    }
    // 운영: origin + /erd-api
    if (API_BASE.startsWith('http')) {
        return API_BASE;
    }
    return (typeof window !== 'undefined' ? window.location.origin : '') + API_BASE;
}

/** DB 저장용: 서버에서 받은 URL을 환경 무관한 표준 형식으로 정규화 (/api/projects/...) */
export function normalizeImageUrlForStorage(url: string | undefined): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('data:')) return url;
    // /erd-api/api/... → /api/..., http(s)://.../api/... → /api/...
    const match = url.match(/(\/api\/projects\/[^/]+\/images\/[^\s]+)/);
    return match ? match[1] : url;
}

/** img src용 URL로 변환. data: URL은 그대로, /api/... 경로는 환경에 맞게 변환 */
export function getImageDisplayUrl(url: string | undefined): string {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/api/') || url.startsWith('/erd-api/api/')) {
        // /erd-api/api/... 형태로 저장된 경우도 /api/... 경로 추출
        const path = url.startsWith('/erd-api') ? url.replace(/^\/erd-api/, '') : url;
        const base = getImageBaseUrl();
        return base ? `${base}${path}` : path;
    }
    return url;
}
