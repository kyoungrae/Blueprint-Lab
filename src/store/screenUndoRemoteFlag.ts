/**
 * 원격(다른 유저) SCREEN_UPDATE/SCREEN_MOVE 적용 시 설정.
 * ScreenNode의 position useEffect에서 이 값을 보고 saveHistory를 스킵하여,
 * 해당 유저의 undo 스택에 다른 유저의 수정이 쌓이지 않도록 함.
 */
let lastRemoteUpdateScreenId: string | null = null;

export function setLastRemoteUpdateScreenId(id: string | null): void {
    lastRemoteUpdateScreenId = id;
}

export function getLastRemoteUpdateScreenId(): string | null {
    return lastRemoteUpdateScreenId;
}

export function consumeLastRemoteUpdateScreenIdIfMatch(screenId: string): boolean {
    if (lastRemoteUpdateScreenId === screenId) {
        lastRemoteUpdateScreenId = null;
        return true;
    }
    return false;
}
