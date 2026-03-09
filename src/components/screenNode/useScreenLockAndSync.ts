import { useCallback } from 'react';
import type { Screen } from '../../types/screenDesign';
import { useScreenNodeStore } from '../../contexts/ScreenCanvasStoreContext';
import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';
import { useEntityLock } from '../collaboration';

export const useScreenLockAndSync = (screen: Screen) => {
    const {
        updateScreen,
        deleteScreen,
        canvasClipboard,
        setCanvasClipboard,
        gridClipboard,
        setGridClipboard,
        lastInteractedScreenId,
        setLastInteractedScreenId,
        getScreenById,
        getPasteTargetScreenId,
    } = useScreenNodeStore();
    const { sendOperation } = useSyncStore();
    const { user } = useAuthStore();
    const { isLockedByOther, lockedBy, requestLock, releaseLock } = useEntityLock(screen.id);
    const isLocalLocked = screen.isLocked ?? true;
    const isLocked = isLocalLocked || isLockedByOther;

    const syncUpdate = useCallback(
        (updates: Partial<Screen>) => {
            sendOperation({
                type: 'SCREEN_UPDATE',
                targetId: screen.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: updates,
            });
        },
        [sendOperation, screen.id, user?.id, user?.name],
    );

    const update = useCallback(
        (updates: Partial<Screen>) => {
            if (isLocked) return;
            updateScreen(screen.id, updates);
        },
        [isLocked, updateScreen, screen.id],
    );

    const handleToggleLock = useCallback(
        (e?: React.MouseEvent) => {
            e?.stopPropagation();
            if (isLockedByOther) {
                alert(`${lockedBy}님이 수정 중입니다.`);
                return;
            }
            const newLockedState = !isLocalLocked;
            updateScreen(screen.id, { isLocked: newLockedState });
            syncUpdate({ isLocked: newLockedState });
            if (!newLockedState) {
                requestLock();
            } else {
                releaseLock();
            }
        },
        [isLockedByOther, isLocalLocked, lockedBy, updateScreen, screen.id, syncUpdate, requestLock, releaseLock],
    );

    const handleDelete = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            if (window.confirm(`화면 "${screen.name}"을(를) 삭제하시겠습니까?`)) {
                sendOperation({
                    type: 'SCREEN_DELETE',
                    targetId: screen.id,
                    userId: user?.id || 'anonymous',
                    userName: user?.name || 'Anonymous',
                    payload: {},
                    previousState: screen as unknown as Record<string, unknown>,
                });
                deleteScreen(screen.id);
            }
        },
        [deleteScreen, sendOperation, screen, user?.id, user?.name],
    );

    return {
        isLocked,
        isLockedByOther,
        lockedBy,
        update,
        updateScreen,
        syncUpdate,
        handleToggleLock,
        handleDelete,
        sendOperation,
        user,
        canvasClipboard,
        setCanvasClipboard,
        gridClipboard,
        setGridClipboard,
        lastInteractedScreenId,
        setLastInteractedScreenId,
        getScreenById,
        getPasteTargetScreenId,
    };
};

