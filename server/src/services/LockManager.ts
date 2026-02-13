import { redis } from '../config/redis';

interface LockInfo {
    userId: string;
    userName: string;
    lockedAt: number;
    expiresAt: number;
}

export class LockManager {
    private readonly LOCK_TTL = 30000; // 30 seconds

    /**
     * Try to acquire lock on an entity
     */
    async acquireLock(
        projectId: string,
        entityId: string,
        userId: string,
        userName: string
    ): Promise<{ success: boolean; holder?: LockInfo }> {
        const lockKey = `project:${projectId}:locks`;

        try {
            const existing = await redis.hget(lockKey, entityId);

            if (existing) {
                const lock: LockInfo = JSON.parse(existing);

                // Check if lock is expired
                if (Date.now() < lock.expiresAt && lock.userId !== userId) {
                    return { success: false, holder: lock };
                }
            }

            const lockData: LockInfo = {
                userId,
                userName,
                lockedAt: Date.now(),
                expiresAt: Date.now() + this.LOCK_TTL,
            };

            await redis.hset(lockKey, entityId, JSON.stringify(lockData));
            return { success: true };

        } catch (error) {
            console.error('Lock acquisition error:', error);
            return { success: false };
        }
    }

    /**
     * Release lock on an entity
     */
    async releaseLock(
        projectId: string,
        entityId: string,
        userId: string
    ): Promise<boolean> {
        const lockKey = `project:${projectId}:locks`;

        try {
            const existing = await redis.hget(lockKey, entityId);

            if (existing) {
                const lock: LockInfo = JSON.parse(existing);

                // Only owner can release
                if (lock.userId === userId) {
                    await redis.hdel(lockKey, entityId);
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('Lock release error:', error);
            return false;
        }
    }

    /**
     * Extend lock TTL (heartbeat)
     */
    async extendLock(
        projectId: string,
        entityId: string,
        userId: string
    ): Promise<boolean> {
        const lockKey = `project:${projectId}:locks`;

        try {
            const existing = await redis.hget(lockKey, entityId);

            if (existing) {
                const lock: LockInfo = JSON.parse(existing);

                if (lock.userId === userId) {
                    lock.expiresAt = Date.now() + this.LOCK_TTL;
                    await redis.hset(lockKey, entityId, JSON.stringify(lock));
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('Lock extend error:', error);
            return false;
        }
    }

    /**
     * Get all locks for a project
     */
    async getAllLocks(projectId: string): Promise<Map<string, LockInfo>> {
        const lockKey = `project:${projectId}:locks`;
        const locks = new Map<string, LockInfo>();

        try {
            const all = await redis.hgetall(lockKey);
            const now = Date.now();

            for (const [entityId, lockData] of Object.entries(all)) {
                const lock: LockInfo = JSON.parse(lockData);

                // Only include non-expired locks
                if (now < lock.expiresAt) {
                    locks.set(entityId, lock);
                } else {
                    // Clean up expired lock
                    await redis.hdel(lockKey, entityId);
                }
            }

        } catch (error) {
            console.error('Get locks error:', error);
        }

        return locks;
    }

    /**
     * Release all locks held by a user (on disconnect)
     */
    async releaseAllUserLocks(projectId: string, userId: string): Promise<void> {
        const lockKey = `project:${projectId}:locks`;

        try {
            const all = await redis.hgetall(lockKey);

            for (const [entityId, lockData] of Object.entries(all)) {
                const lock: LockInfo = JSON.parse(lockData);

                if (lock.userId === userId) {
                    await redis.hdel(lockKey, entityId);
                }
            }
        } catch (error) {
            console.error('Release all user locks error:', error);
        }
    }

    /**
     * Clear all locks for a project (when project is deleted)
     */
    async clearAllData(projectId: string): Promise<void> {
        const lockKey = `project:${projectId}:locks`;
        try {
            await redis.del(lockKey);
        } catch (error) {
            console.error('Clear project locks error:', error);
        }
    }
}

export const lockManager = new LockManager();
