/**
 * fetch 래퍼: 인증 헤더 추가 + 401 시 자동 로그아웃
 * 토큰 만료 시 auth:unauthorized 이벤트를 발생시켜 App에서 logout 처리
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem('auth-token');
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        localStorage.removeItem('auth-token');
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
    }

    return response;
}
