import { useCallback, useRef, useEffect } from 'react';
import type { Screen, DrawElement } from '../../types/screenDesign';
import { useScreenNodeStore } from '../../contexts/ScreenCanvasStoreContext';
import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';
import { useEntityLock } from '../collaboration';

export const useScreenLockAndSync = (screen: Screen) => {
    const {
        updateScreen,
        updateDrawElements,
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
    
    // 수정 가능 여부: 잠금 해제 상태이고, 자신이 잠금 해제한 사용자여야 함
    const canEdit = !isLocked && (!screen.unlockedUserId || screen.unlockedUserId === user?.id);

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

    // drawElements 전용 실시간 동기화 함수
    const syncDrawElements = useCallback(
        (drawElements: DrawElement[]) => {
            // console.log(`📤 [Sync] Sending SCREEN_DRAW_ELEMENTS_UPDATE for screen ${screen.id}:`, drawElements.length, 'elements');
            sendOperation({
                type: 'SCREEN_DRAW_ELEMENTS_UPDATE',
                targetId: screen.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: { drawElements },
            });
        },
        [sendOperation, screen.id, user?.id, user?.name],
    );

    // 1시간 후 자동 잠금 타이머
    const autoLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const startAutoLockTimer = useCallback(() => {
        // 기존 타이머 클리어
        if (autoLockTimerRef.current) {
            clearTimeout(autoLockTimerRef.current);
        }
        
        // 1시간 후 자동 잠금 설정
        autoLockTimerRef.current = setTimeout(() => {
            if (!isLockedByOther && screen.unlockedAt) {
                // console.log(`🔒 [AutoLock] Auto-locking screen ${screen.id} after 1 hour`);
                const updates = { isLocked: true, unlockedAt: undefined };
                updateScreen(screen.id, updates);
                syncUpdate(updates);
                releaseLock();
            }
        }, 3600000); // 1시간
    }, [isLockedByOther, screen.unlockedAt, updateScreen, syncUpdate, releaseLock]);

    // 새로고침 시 자동 잠금 타이머 재설정
    useEffect(() => {
        if (!isLockedByOther && screen.unlockedAt) {
            const unlockedTime = screen.unlockedAt;
            const now = Date.now();
            const elapsed = now - unlockedTime;
            const remaining = 3600000 - elapsed; // 1시간 - 경과 시간
            
            if (remaining > 0) {
                // console.log(`🔒 [AutoLock] Screen ${screen.id} will auto-lock in ${Math.round(remaining/60000)} minutes`);
                startAutoLockTimer();
            } else {
                // 1시간이 지났으면 즉시 잠금
                // console.log(`🔒 [AutoLock] Screen ${screen.id} exceeded 1 hour, locking immediately`);
                const updates = { isLocked: true, unlockedAt: undefined };
                updateScreen(screen.id, updates);
                syncUpdate(updates);
                releaseLock();
            }
        }
    }, [screen.id, screen.unlockedAt, isLockedByOther, startAutoLockTimer, updateScreen, syncUpdate, releaseLock]);

    const update = useCallback(
        (updates: Partial<Screen>) => {
            if (isLocked) return;
            // drawElements만 업데이트하는 경우 전체 screen 객체 대신 drawElements만 교체
            // 이를 통해 ScreenNodeFull로 전달되는 screen prop의 레퍼런스가 변하지 않아
            // drawElements 변경 시 ScreenNodeFull 전체 리렌더링을 회피함
            if ('drawElements' in updates && Object.keys(updates).length === 1 && updates.drawElements) {
                updateDrawElements(screen.id, updates.drawElements);
                // drawElements 변경 시 실시간 동기화 추가
                syncDrawElements(updates.drawElements);
            } else {
                updateScreen(screen.id, updates);
            }
            
            // 업데이트 시 자동 잠금 타이머 리셋
            if (updates.isLocked === false && updates.unlockedAt !== undefined) {
                startAutoLockTimer();
            }
        },
        [isLocked, updateScreen, updateDrawElements, screen.id, startAutoLockTimer, syncDrawElements],
    );

    const handleToggleLock = useCallback(
        (e?: React.MouseEvent) => {
            e?.stopPropagation();
            if (isLockedByOther) {
                alert(`${lockedBy}님이 수정 중입니다.`);
                return;
            }
            const newLockedState = !isLocalLocked;
            const updates: Partial<Screen> = { isLocked: newLockedState };
            
            // 잠금 해제 시 현재 시간과 사용자 ID 기록
            if (!newLockedState) {
                updates.unlockedAt = Date.now();
                updates.unlockedUserId = user?.id;
            } else {
                updates.unlockedAt = undefined;
                updates.unlockedUserId = undefined;
            }
            
            updateScreen(screen.id, updates);
            syncUpdate(updates);
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
        canEdit,
        update,
        updateScreen,
        syncUpdate,
        syncDrawElements,
        handleToggleLock,
        handleDelete,
        releaseLock,
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

