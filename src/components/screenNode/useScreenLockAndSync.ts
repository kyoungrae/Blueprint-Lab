import { useCallback, useRef, useEffect } from 'react';
import type { Screen, DrawElement } from '../../types/screenDesign';
import { useScreenNodeStore } from '../../contexts/ScreenCanvasStoreContext';
import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';
import { useEntityLock } from '../collaboration';
import { useYjsStore } from '../../store/yjsStore';

/** Socket 히스토리용 등 Y.Doc에 넣으면 안 되는 필드 제거 */
function screenPatchForYjs(updates: Partial<Screen>): Partial<Screen> {
    const { historyLog: _, ...rest } = updates as Partial<Screen> & { historyLog?: unknown };
    return rest;
}

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
    const { updateScreen: yjsUpdate, deleteScreen: yjsDelete } = useYjsStore();
    const { isLockedByOther, lockedBy, requestLock, releaseLock } = useEntityLock(screen.id);
    const isLocalLocked = screen.isLocked ?? true;
    const isLocked = isLocalLocked || isLockedByOther;
    
    // 수정 가능 여부: 잠금 해제 상태이고, 자신이 잠금 해제한 사용자여야 함
    const canEdit = !isLocked && (!screen.unlockedUserId || screen.unlockedUserId === user?.id);

    // 🔴 Yjs 단일 소스(SSOT): 모든 화면 데이터는 Yjs를 통해 저장·브로드캐스트
    // 잠금 상태(isLocked/unlockedAt)는 즉시 협업 조율을 위해 Socket.IO도 병행
    const syncUpdate = useCallback(
        (updates: Partial<Screen>) => {
            const yjsPatch = screenPatchForYjs(updates);
            if (Object.keys(yjsPatch).length === 0) return;
            // Yjs: 데이터 영속성 + 실시간 브로드캐스트 (단일 채널)
            yjsUpdate(screen.id, yjsPatch);
            // Socket.IO: 잠금 상태 변경만 즉시 전파 (락 UI 실시간 반영)
            if ('isLocked' in updates || 'unlockedAt' in updates) {
                sendOperation({
                    type: 'SCREEN_UPDATE',
                    targetId: screen.id,
                    userId: user?.id || 'anonymous',
                    userName: user?.name || 'Anonymous',
                    payload: yjsPatch,
                });
            }
        },
        [yjsUpdate, sendOperation, screen.id, user?.id, user?.name],
    );

    // drawElements 전용 동기화 → Yjs 직접 호출 (Socket.IO 이중 전송 제거)
    const syncDrawElements = useCallback(
        (drawElements: DrawElement[]) => {
            yjsUpdate(screen.id, { drawElements });
        },
        [yjsUpdate, screen.id],
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
            const yjsPatch = screenPatchForYjs(updates);
            // drawElements만 업데이트하는 경우 전체 screen 객체 대신 drawElements만 교체
            // 이를 통해 ScreenNodeFull로 전달되는 screen prop의 레퍼런스가 변하지 않아
            // drawElements 변경 시 ScreenNodeFull 전체 리렌더링을 회피함
            if ('drawElements' in yjsPatch && Object.keys(yjsPatch).length === 1 && yjsPatch.drawElements) {
                updateDrawElements(screen.id, yjsPatch.drawElements);
                // Yjs 단일 채널로 동기화 (Socket.IO SCREEN_DRAW_ELEMENTS_UPDATE 제거)
                yjsUpdate(screen.id, { drawElements: yjsPatch.drawElements });
            } else {
                updateScreen(screen.id, yjsPatch);
                // Yjs로 비-drawElements 업데이트도 동기화
                yjsUpdate(screen.id, yjsPatch);
            }

            // 업데이트 시 자동 잠금 타이머 리셋
            if (updates.isLocked === false && updates.unlockedAt !== undefined) {
                startAutoLockTimer();
            }
        },
        [isLocked, updateScreen, updateDrawElements, screen.id, startAutoLockTimer, yjsUpdate],
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
                // 1. 로컬 상태에서 즉시 삭제
                deleteScreen(screen.id);
                // 2. Yjs 삭제: 다른 클라이언트 실시간 반영 + MongoDB 저장 (BUG-08 수정)
                yjsDelete(screen.id);
                // 3. Socket.IO: 히스토리 기록 전용
                sendOperation({
                    type: 'SCREEN_DELETE',
                    targetId: screen.id,
                    userId: user?.id || 'anonymous',
                    userName: user?.name || 'Anonymous',
                    payload: { name: screen.name },
                    previousState: screen as unknown as Record<string, unknown>,
                });
            }
        },
        [deleteScreen, yjsDelete, sendOperation, screen, user?.id, user?.name],
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

