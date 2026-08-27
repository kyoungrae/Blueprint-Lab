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
            const now = Date.now();
            const lockData: LockInfo = {
                userId,
                userName,
                lockedAt: now,
                expiresAt: now + this.LOCK_TTL,
            };

            // HGET → HSET은 두 사용자가 같은 순간에 요청했을 때 둘 다 성공할 수 있다.
            // Redis Lua에서 검사와 설정을 한 번에 수행해 잠금 획득을 원자적으로 보장한다.
            const result = await redis.eval(
                `
                local existing = redis.call('HGET', KEYS[1], ARGV[1])
                if existing then
                    local ok, lock = pcall(cjson.decode, existing)
                    if ok and lock and tonumber(lock.expiresAt) > tonumber(ARGV[2]) and lock.userId ~= ARGV[3] then
                        return {0, existing}
                    end
                end
                redis.call('HSET', KEYS[1], ARGV[1], ARGV[4])
                return {1, ''}
                `,
                1,
                lockKey,
                entityId,
                String(now),
                userId,
                JSON.stringify(lockData),
            ) as [number, string];

            if (result[0] === 1) return { success: true };
            return { success: false, holder: JSON.parse(result[1]) as LockInfo };

        } catch (error) {
            // console.error('Lock acquisition error:', error);
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
            // console.error('Lock release error:', error);
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
            // console.error('Lock extend error:', error);
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
                }
            }

        } catch (error) {
            // console.error('Get locks error:', error);
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
            // console.error('Release all user locks error:', error);
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
            // console.error('Clear project locks error:', error);
        }
    }
}

export const lockManager = new LockManager();
