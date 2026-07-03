import type { Screen, ScreenFlow } from '../types/screenDesign';

type HistoryOperationEmitter = (op: {
    type: string;
    targetId: string;
    userId: string;
    userName: string;
    payload: Record<string, unknown>;
    previousState?: Record<string, unknown>;
}) => void;

/** 화면 삭제 시 관리자 작업 이력 기록 (Socket.IO) */
export function emitScreenDeleteHistory(
    sendOperation: HistoryOperationEmitter,
    screen: Screen,
    user: { id?: string; name?: string } | null | undefined,
) {
    sendOperation({
        type: 'SCREEN_DELETE',
        targetId: screen.id,
        userId: user?.id || 'anonymous',
        userName: user?.name || 'Anonymous',
        payload: { name: screen.name, screenId: screen.screenId },
        previousState: screen as unknown as Record<string, unknown>,
    });
}

/** 연결선 삭제 시 관리자 작업 이력 기록 */
export function emitFlowDeleteHistory(
    sendOperation: HistoryOperationEmitter,
    flow: ScreenFlow,
    user: { id?: string; name?: string } | null | undefined,
) {
    sendOperation({
        type: 'SCREEN_FLOW_DELETE',
        targetId: flow.id,
        userId: user?.id || 'anonymous',
        userName: user?.name || 'Anonymous',
        payload: { label: flow.label, source: flow.source, target: flow.target },
        previousState: flow as unknown as Record<string, unknown>,
    });
}

export const SCREEN_LOCK_KEYS = new Set(['isLocked', 'unlockedAt', 'unlockedUserId']);

export const SCREEN_FIELD_LABELS: Record<string, string> = {
    name: '화면명',
    systemName: '시스템명',
    author: '작성자',
    createdDate: '작성일',
    screenId: '화면ID',
    screenType: '화면유형',
    page: '페이지',
    screenDescription: '화면설명',
    specs: '명세',
    specColumnWidths: '명세 열 너비',
    specMetaColumnWidths: '메타 열 너비',
    pageSize: '용지 크기',
    pageOrientation: '용지 방향',
    initialSettings: '초기 설정',
    functionDetails: '기능 상세',
    relatedTables: '관련 테이블',
    rightPaneRatios: '우측 패널 비율',
    memos: '메모',
    drawElements: '그리기 요소',
};

export function isLockOnlyScreenPatch(updates: Record<string, unknown>): boolean {
    const keys = Object.keys(updates).filter((k) => k !== 'historyLog');
    return keys.length > 0 && keys.every((k) => SCREEN_LOCK_KEYS.has(k));
}

export function buildScreenHistoryFromPatch(
    screen: Screen,
    updates: Partial<Screen> & { historyLog?: unknown },
): {
    payload: Record<string, unknown>;
    previousState: Record<string, unknown>;
    historyLog: { details: string; targetName: string; targetType: 'SCREEN' };
} | null {
    if (updates.historyLog) {
        const { historyLog, ...raw } = updates as Record<string, unknown>;
        const keys = Object.keys(raw).filter((k) => !SCREEN_LOCK_KEYS.has(k));
        if (keys.length === 0) return null;
        const previousState: Record<string, unknown> = {};
        const payload: Record<string, unknown> = {};
        for (const k of keys) {
            payload[k] = raw[k];
            previousState[k] = (screen as unknown as Record<string, unknown>)[k];
        }
        return {
            payload,
            previousState,
            historyLog: historyLog as { details: string; targetName: string; targetType: 'SCREEN' },
        };
    }

    const raw = { ...updates } as Record<string, unknown>;
    delete raw.historyLog;
    const keys = Object.keys(raw).filter((k) => !SCREEN_LOCK_KEYS.has(k));
    if (keys.length === 0) return null;

    const previousState: Record<string, unknown> = {};
    const payload: Record<string, unknown> = {};
    const labels: string[] = [];
    for (const k of keys) {
        payload[k] = raw[k];
        previousState[k] = (screen as unknown as Record<string, unknown>)[k];
        labels.push(SCREEN_FIELD_LABELS[k] || k);
    }

    return {
        payload,
        previousState,
        historyLog: {
            details: `${labels.join(', ')} 수정`,
            targetName: `${screen.name} (${screen.screenId || screen.id})`,
            targetType: 'SCREEN',
        },
    };
}

/** 관리자 이력 표시용 */
export function sanitizeHistoryPayloadForDisplay(
    payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') return {};
    const { historyLog, isLocked, unlockedAt, unlockedUserId, ...rest } = payload;
    return rest;
}
