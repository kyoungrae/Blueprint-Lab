import { redis } from '../config/redis';
import type { IEntity, IRelationship, IScreen, IScreenFlow } from '../models';

interface CursorInfo {
    x: number;
    y: number;
    viewport?: { x: number; y: number; zoom: number };
    lastUpdated: number;
}

interface OnlineUser {
    id: string;
    clientId: string; // Connection/Socket ID
    name: string;
    picture?: string;
    joinedAt: number;
    lastActive: number;
}

export class PresenceManager {
    private readonly CURSOR_TTL = 10; // 10 seconds
    private readonly ONLINE_MAX_AGE = 1000 * 30; // 30 seconds stale limit

    /**
     * Add user to online list
     */
    async userJoin(
        projectId: string,
        clientId: string,
        userId: string,
        userName: string,
        userPicture?: string
    ): Promise<OnlineUser[]> {
        const onlineKey = `project:${projectId}:online`;
        const userInfo: OnlineUser = {
            id: userId,
            clientId: clientId,
            name: userName,
            picture: userPicture,
            joinedAt: Date.now(),
            lastActive: Date.now(),
        };

        await redis.hset(onlineKey, clientId, JSON.stringify(userInfo));
        return this.getOnlineUsers(projectId);
    }

    /**
     * Remove user from online list
     */
    async userLeave(projectId: string, clientId: string): Promise<OnlineUser[]> {
        const onlineKey = `project:${projectId}:online`;
        const cursorKey = `project:${projectId}:cursors`;

        await redis.hdel(onlineKey, clientId);
        await redis.hdel(cursorKey, clientId);
        return this.getOnlineUsers(projectId);
    }

    /**
     * Get all online users
     */
    async getOnlineUsers(projectId: string): Promise<OnlineUser[]> {
        const onlineKey = `project:${projectId}:online`;
        const all = await redis.hgetall(onlineKey);
        const now = Date.now();

        const users: OnlineUser[] = [];
        for (const [clientId, data] of Object.entries(all)) {
            try {
                const user: OnlineUser = JSON.parse(data);
                // Filter out stale users (older than 1 hour)
                if (now - user.lastActive < this.ONLINE_MAX_AGE) {
                    users.push(user);
                } else {
                    // Implicitly cleanup stale data
                    await redis.hdel(onlineKey, clientId);
                }
            } catch (e) {
                // If parsing fails, it's corrupt data, so remove it.
                await redis.hdel(onlineKey, clientId);
            }
        }

        return users;
    }

    /**
     * Update user cursor position
     */
    async updateCursor(
        projectId: string,
        userId: string,
        clientId: string,
        position: { x: number; y: number; viewport?: { x: number; y: number; zoom: number } }
    ): Promise<void> {
        const cursorKey = `project:${projectId}:cursors`;
        const onlineKey = `project:${projectId}:online`;
        const cursorInfo: CursorInfo = {
            ...position,
            userId, // Store who this cursor belongs to
            lastUpdated: Date.now(),
        } as any;

        // Use clientId as the field key to support multiple tabs
        await redis.hset(cursorKey, clientId, JSON.stringify(cursorInfo));
        await redis.expire(cursorKey, this.CURSOR_TTL);

        // Heartbeat: Update lastActive in online list
        const userData = await redis.hget(onlineKey, clientId);
        if (userData) {
            const user: OnlineUser = JSON.parse(userData);
            user.lastActive = Date.now();
            await redis.hset(onlineKey, clientId, JSON.stringify(user));
        }
    }

    /**
     * Get all cursors
     */
    async getAllCursors(projectId: string): Promise<Record<string, CursorInfo & { userId: string }>> {
        const cursorKey = `project:${projectId}:cursors`;
        const cursors: Record<string, CursorInfo & { userId: string }> = {};
        const now = Date.now();

        const all = await redis.hgetall(cursorKey);

        for (const [clientId, data] of Object.entries(all)) {
            try {
                const cursor = JSON.parse(data);
                if (now - cursor.lastUpdated < 15000) {
                    cursors[clientId] = cursor;
                } else {
                    await redis.hdel(cursorKey, clientId);
                }
            } catch (e) {
                await redis.hdel(cursorKey, clientId);
            }
        }

        return cursors;
    }
    /**
     * Clear all project-related keys from Redis using pattern matching (Robust)
     */
    async clearAllProjectKeys(projectId: string): Promise<void> {
        const pattern = `project:${projectId}:*`;
        let cursor = '0';
        try {
            do {
                const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                cursor = nextCursor;
                if (keys.length > 0) {
                    await redis.del(...keys);
                }
            } while (cursor !== '0');
            console.log(`🧹 Cleaned up all Redis keys for project: ${projectId}`);
        } catch (error) {
            console.error('Clear all project keys error:', error);
        }
    }

    /**
     * Clear all presence data for a project (when project is deleted)
     * @deprecated Use clearAllProjectKeys for complete cleanup
     */
    async clearAllData(projectId: string): Promise<void> {
        await this.clearAllProjectKeys(projectId);
    }

    /**
     * Remove a specific user's presence from a project (when excluded)
     */
    async removeUserPresence(projectId: string, userId: string): Promise<void> {
        const onlineKey = `project:${projectId}:online`;
        const cursorKey = `project:${projectId}:cursors`;

        try {
            // Remove from online list (find all clientIds for this userId)
            const allOnline = await redis.hgetall(onlineKey);
            for (const [clientId, data] of Object.entries(allOnline)) {
                const user = JSON.parse(data);
                if (user.id === userId) {
                    await redis.hdel(onlineKey, clientId);
                }
            }

            // Remove cursor (find all clientIds for this userId)
            const allCursors = await redis.hgetall(cursorKey);
            for (const [clientId, data] of Object.entries(allCursors)) {
                const cursor = JSON.parse(data);
                if (cursor.userId === userId) {
                    await redis.hdel(cursorKey, clientId);
                }
            }
        } catch (error) {
            console.error('Remove user presence error:', error);
        }
    }
}

// Project State Manager
export class ProjectStateManager {
    /**
     * Save project state to Redis
     */
    async saveState(
        projectId: string,
        entities: IEntity[],
        relationships: IRelationship[],
        version: number,
        screens: IScreen[] = [],
        flows: IScreenFlow[] = [],
        sections: Array<{ id: string; name?: string; position: { x: number; y: number }; size: { width: number; height: number } }> = []
    ): Promise<void> {
        const stateKey = `project:${projectId}:state`;

        await redis.hmset(stateKey, {
            entities: JSON.stringify(entities),
            relationships: JSON.stringify(relationships),
            screens: JSON.stringify(screens),
            flows: JSON.stringify(flows),
            sections: JSON.stringify(sections),
            version: version.toString(),
            lastUpdatedAt: Date.now().toString(),
        });
    }

    /**
     * Get project state from Redis
     */
    async getState(projectId: string): Promise<{
        entities: IEntity[];
        relationships: IRelationship[];
        screens: IScreen[];
        flows: IScreenFlow[];
        sections: Array<{ id: string; name?: string; position: { x: number; y: number }; size: { width: number; height: number } }>;
        version: number;
    } | null> {
        const stateKey = `project:${projectId}:state`;
        const data = await redis.hgetall(stateKey);

        if (!data || !data.entities) {
            return null;
        }

        return {
            entities: JSON.parse(data.entities),
            relationships: JSON.parse(data.relationships),
            screens: data.screens ? JSON.parse(data.screens) : [],
            flows: data.flows ? JSON.parse(data.flows) : [],
            sections: data.sections ? JSON.parse(data.sections) : [],
            version: parseInt(data.version || '0', 10),
        };
    }

    /**
     * Initialize state from MongoDB
     */
    async initializeFromDB(
        projectId: string,
        entities: IEntity[],
        relationships: IRelationship[],
        version: number,
        screens: IScreen[] = [],
        flows: IScreenFlow[] = [],
        sections: Array<{ id: string; name?: string; position: { x: number; y: number }; size: { width: number; height: number } }> = []
    ): Promise<void> {
        const existing = await this.getState(projectId);

        // Only initialize if Redis doesn't have state
        if (!existing) {
            await this.saveState(projectId, entities, relationships, version, screens, flows, sections);
        }
    }
    /**
     * Clear project state from Redis (when project is deleted)
     */
    async clearAllData(projectId: string): Promise<void> {
        const stateKey = `project:${projectId}:state`;
        try {
            await redis.del(stateKey);
        } catch (error) {
            console.error('Clear project state error:', error);
        }
    }
}

export const presenceManager = new PresenceManager();
export const projectStateManager = new ProjectStateManager();
