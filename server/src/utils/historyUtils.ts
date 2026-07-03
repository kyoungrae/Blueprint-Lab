const LOCK_KEYS = new Set(['isLocked', 'unlockedAt', 'unlockedUserId']);

/** SCREEN_UPDATE payload가 잠금 상태만 바꾸는지 */
export function isLockOnlyScreenPayload(payload: Record<string, unknown> | null | undefined): boolean {
    if (!payload || typeof payload !== 'object') return false;
    const { historyLog: _, ...rest } = payload;
    const keys = Object.keys(rest);
    if (keys.length === 0) return false;
    return keys.every((k) => LOCK_KEYS.has(k));
}

/** 관리자 UI·저장용: historyLog·잠금 필드 제거 */
export function sanitizeHistoryPayload(
    payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') return {};
    const { historyLog, isLocked, unlockedAt, unlockedUserId, ...rest } = payload;
    return rest;
}

export function sanitizeHistoryPreviousState(
    prev: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
    if (!prev || typeof prev !== 'object') return {};
    const { isLocked, unlockedAt, unlockedUserId, ...rest } = prev;
    return rest;
}
