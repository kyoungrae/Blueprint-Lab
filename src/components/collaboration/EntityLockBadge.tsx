import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';

interface EntityLockBadgeProps {
    entityId: string;
}

export function EntityLockBadge({ entityId }: EntityLockBadgeProps) {
    const locks = useSyncStore((state) => state.locks);
    const currentUser = useAuthStore((state) => state.user);

    const lock = locks.get(entityId);

    if (!lock) return null;

    const isOwnLock = lock.userId === currentUser?.id;

    return (
        <div
            className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs flex items-center gap-1 shadow-lg z-10 ${isOwnLock
                ? 'bg-blue-500 text-white'
                : 'bg-amber-500 text-black'
                }`}
        >
            {isOwnLock ? (
                <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>Editing</span>
                </>
            ) : (
                <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>{lock.userName}</span>
                </>
            )}
        </div>
    );
}

// Hook to check if entity is locked by another user
export function useEntityLock(entityId: string) {
    const locks = useSyncStore((state) => state.locks);
    const currentUser = useAuthStore((state) => state.user);
    const requestLock = useSyncStore((state) => state.requestLock);
    const releaseLock = useSyncStore((state) => state.releaseLock);

    const lock = locks.get(entityId);
    const isLocked = !!lock;
    const isLockedByMe = lock?.userId === currentUser?.id;
    const isLockedByOther = isLocked && !isLockedByMe;

    return {
        isLocked,
        isLockedByMe,
        isLockedByOther,
        lockedBy: lock?.userName,
        requestLock: () => requestLock(entityId),
        releaseLock: () => releaseLock(entityId),
    };
}
