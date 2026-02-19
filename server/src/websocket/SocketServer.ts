import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { Types } from 'mongoose';
import { config } from '../config';
import { syncEngine, type CRDTOperation, type ERDState } from '../services/SyncEngine';
import { lockManager } from '../services/LockManager';
import { presenceManager, projectStateManager } from '../services/PresenceManager';
import { Project, History } from '../models';

interface UserInfo {
    id: string;
    name: string;
    picture?: string;
}

interface SocketData {
    user: UserInfo;
    projectId?: string;
}

// Operation Queue for serializing project updates
class ProjectOperationQueue {
    private queue: Promise<void> = Promise.resolve();

    enqueue(task: () => Promise<void>): Promise<void> {
        this.queue = this.queue.then(task).catch(err => {
            console.error("Queue task error:", err);
        });
        return this.queue;
    }
}
const projectQueues = new Map<string, ProjectOperationQueue>();

export function initializeSocketServer(httpServer: HTTPServer): SocketIOServer {
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: (origin, callback) => {
                const allowed = [
                    config.frontendUrl,
                    'http://localhost:5173',
                    'http://127.0.0.1:5173',
                ];
                if (!origin || allowed.includes(origin) || origin.startsWith('http://192.168.')) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            methods: ['GET', 'POST'],
            credentials: true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        maxHttpBufferSize: 1e7, // 10MB
    });

    io.on('connection', (socket: Socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        // Store user data on socket
        const socketData: SocketData = {
            user: { id: 'anonymous', name: 'Anonymous' },
        };

        // Authenticate user
        socket.on('authenticate', async (userData: UserInfo) => {
            if (!userData) {
                console.log('⚠️ Authenticate called with no user data');
                return;
            }
            const oldUserId = socketData.user.id;
            socketData.user = userData;
            console.log(`✅ User authenticated: ${userData.name}`);

            // If already in a project, update the presence with new identity
            if (socketData.projectId) {
                const onlineUsers = await presenceManager.userJoin(
                    socketData.projectId,
                    socket.id, // Use socket.id as key
                    userData.id,
                    userData.name,
                    userData.picture
                );

                // Notify others of identity update
                io.to(`project:${socketData.projectId}`).emit('user_joined', {
                    user: userData,
                    onlineUsers,
                });
            }

            socket.emit('authenticated', { success: true });
        });

        // Join project room
        socket.on('join_project', async (data: { projectId: string }) => {
            const { projectId } = data;
            socketData.projectId = projectId;

            // Leave previous rooms
            socket.rooms.forEach(room => {
                if (room !== socket.id) {
                    socket.leave(room);
                }
            });

            // Join new project room
            socket.join(`project:${projectId}`);

            // Add to online users
            const onlineUsers = await presenceManager.userJoin(
                projectId,
                socket.id, // clientId
                socketData.user.id,
                socketData.user.name,
                socketData.user.picture
            );

            // ... (rest of join logic)

            // Get current state
            let state = await projectStateManager.getState(projectId);

            // If no state in Redis, load from MongoDB
            if (!state) {
                // Check if projectId is a valid MongoDB ObjectId
                if (Types.ObjectId.isValid(projectId)) {
                    const project = await Project.findById(projectId);
                    if (project) {
                        state = {
                            entities: project.currentSnapshot.entities || [],
                            relationships: project.currentSnapshot.relationships || [],
                            screens: project.screenSnapshot?.screens || [],
                            flows: project.screenSnapshot?.flows || [],
                            version: project.currentSnapshot.version || 0,
                        };
                        await projectStateManager.initializeFromDB(
                            projectId,
                            state.entities,
                            state.relationships,
                            state.version,
                            state.screens,
                            state.flows
                        );
                    } else {
                        // Project not found in DB
                        state = { entities: [], relationships: [], screens: [], flows: [], version: 0 };
                    }
                } else {
                    // Invalid ObjectId (e.g. temporary ID 'proj_...'), treat as new empty project
                    console.log(`ℹ️ Project ID ${projectId} is not a valid ObjectId (likely temporary), initializing empty state.`);
                    state = { entities: [], relationships: [], screens: [], flows: [], version: 0 };
                }
            }

            // Get current locks
            const locks = await lockManager.getAllLocks(projectId);
            const locksObject: Record<string, unknown> = {};
            locks.forEach((value, key) => {
                locksObject[key] = value;
            });

            // Fetch recent history from MongoDB
            let projectHistory: any[] = [];
            if (Types.ObjectId.isValid(projectId)) {
                projectHistory = await History.find({ projectId })
                    .sort({ timestamp: -1 })
                    .limit(100);
            }

            // Send current state to joining user
            socket.emit('state_sync', {
                state,
                onlineUsers,
                locks: locksObject,
                history: projectHistory.map(h => ({
                    id: h._id.toString(),
                    userId: h.userId.toString(),
                    userName: h.userName,
                    userPicture: h.userPicture,
                    timestamp: h.timestamp.toISOString(),
                    type: h.operationType === 'ERD_IMPORT' ? 'IMPORT' :
                        h.operationType.startsWith('ENTITY_') ? h.operationType.split('_')[1] :
                            h.operationType.startsWith('RELATIONSHIP_') ? h.operationType.split('_')[1] :
                                h.operationType.startsWith('ATTRIBUTE_') ? h.operationType.split('_')[1] : 'UPDATE',
                    targetType: h.targetType,
                    targetName: h.targetName,
                    details: h.details,
                    payload: h.operation.payload?.payload || h.operation.payload // Support nested payload if needed
                })),
            });

            // Notify others of new user
            socket.to(`project:${projectId}`).emit('user_joined', {
                user: socketData.user,
                onlineUsers,
            });

            console.log(`👤 ${socketData.user.name} joined project ${projectId}`);
        });

        // Handle ERD operations
        socket.on('operation', async (operation: CRDTOperation) => {
            if (!socketData.projectId) return;

            const projectId = socketData.projectId;

            // Get or create queue for this project
            if (!projectQueues.has(projectId)) {
                projectQueues.set(projectId, new ProjectOperationQueue());
            }
            const queue = projectQueues.get(projectId)!;

            // Enqueue operation used queue to serialize requests
            await queue.enqueue(async () => {
                // Update Lamport clock
                syncEngine.updateClock(projectId, operation.lamportClock);

                // Get current state
                let state = await projectStateManager.getState(projectId);
                if (!state) {
                    state = { entities: [], relationships: [], screens: [], flows: [], version: 0 };
                }

                // Apply operation
                const newState = syncEngine.applyOperation(state, operation);

                // Save to Redis
                await projectStateManager.saveState(
                    projectId,
                    newState.entities,
                    newState.relationships,
                    newState.version,
                    newState.screens || [],
                    newState.flows || []
                );

                // Broadcast to all other clients in the project
                socket.to(`project:${projectId}`).emit('operation', {
                    ...operation,
                    appliedAt: Date.now(),
                });

                // Save to MongoDB
                // Force immediate save for critical operations (DELETE, IMPORT) to prevent data loss on refresh
                const isCriticalOperation = operation.type.includes('DELETE') || operation.type === 'ERD_IMPORT';
                debouncedSaveToMongo(projectId, newState, isCriticalOperation);

                // Record history in MongoDB
                if (Types.ObjectId.isValid(projectId)) {
                    try {
                        const payload = operation.payload as any;
                        let details = payload.historyLog?.details || `Operation ${operation.type} performed`;
                        let targetName = payload.historyLog?.targetName || operation.targetId;
                        let targetType: 'ENTITY' | 'RELATIONSHIP' | 'PROJECT' | 'SCREEN' | 'FLOW' = 'PROJECT';

                        if (operation.type.startsWith('ENTITY_')) targetType = 'ENTITY';
                        else if (operation.type.startsWith('RELATIONSHIP_')) targetType = 'RELATIONSHIP';
                        else if (operation.type.startsWith('ATTRIBUTE_')) targetType = 'ENTITY';
                        else if (operation.type.startsWith('SCREEN_FLOW_')) targetType = 'FLOW';
                        else if (operation.type.startsWith('SCREEN_')) targetType = 'SCREEN';
                        else if (operation.type.startsWith('FLOW_')) targetType = 'FLOW';

                        // Specific handling for common operations to make them look nice if historyLog is missing
                        if (!payload.historyLog) {
                            if (operation.type === 'ENTITY_CREATE') {
                                details = `새 테이블 '${payload.name || '알 수 없음'}'을 생성했습니다.`;
                                targetName = payload.name || 'New Entity';
                            } else if (operation.type === 'ENTITY_DELETE') {
                                details = `테이블(ID: ${operation.targetId})을 삭제했습니다.`;
                            }
                        }

                        await History.create({
                            projectId: new Types.ObjectId(projectId),
                            userId: new Types.ObjectId(operation.userId),
                            userName: operation.userName,
                            userPicture: payload.historyLog?.userPicture,
                            operationType: operation.type,
                            targetType: payload.historyLog?.targetType || targetType,
                            targetId: operation.targetId,
                            targetName: targetName,
                            operation: {
                                lamportClock: operation.lamportClock,
                                payload: payload,
                                previousState: operation.previousState,
                            },
                            details: details,
                            timestamp: new Date(operation.wallClock),
                        });
                    } catch (err) {
                        console.error('Failed to save history to MongoDB:', err);
                    }
                }
            });
        });

        // Handle cursor movement
        socket.on('cursor_move', async (data: { x: number; y: number; viewport?: { x: number; y: number; zoom: number } }) => {
            if (!socketData.projectId) return;

            await presenceManager.updateCursor(socketData.projectId, socketData.user.id, socket.id, data);

            // Broadcast to others
            socket.to(`project:${socketData.projectId}`).emit('cursor_update', {
                userId: socketData.user.id,
                clientId: socket.id, // Support multi-tab sessions
                userName: socketData.user.name,
                userPicture: socketData.user.picture,
                ...data,
            });
        });

        // Handle lock requests
        socket.on('request_lock', async (data: { entityId: string }) => {
            if (!socketData.projectId) return;

            const result = await lockManager.acquireLock(
                socketData.projectId,
                data.entityId,
                socketData.user.id,
                socketData.user.name
            );

            if (result.success) {
                // Notify all clients of lock acquisition
                io.to(`project:${socketData.projectId}`).emit('lock_acquired', {
                    entityId: data.entityId,
                    userId: socketData.user.id,
                    userName: socketData.user.name,
                });
                socket.emit('lock_result', { success: true, entityId: data.entityId });
            } else {
                socket.emit('lock_result', {
                    success: false,
                    entityId: data.entityId,
                    holder: result.holder,
                });
            }
        });

        // Handle lock release
        socket.on('release_lock', async (data: { entityId: string }) => {
            if (!socketData.projectId) return;

            const released = await lockManager.releaseLock(
                socketData.projectId,
                data.entityId,
                socketData.user.id
            );

            if (released) {
                io.to(`project:${socketData.projectId}`).emit('lock_released', {
                    entityId: data.entityId,
                });
            }
        });

        // Handle disconnect
        socket.on('disconnect', async () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);

            if (socketData.projectId) {
                // If this was the last user (or just to be safe), flush pending saves
                await flushPendingSave(socketData.projectId);

                // Remove from online users using socket.id
                const onlineUsers = await presenceManager.userLeave(
                    socketData.projectId,
                    socket.id
                );

                // Release all locks held by this user
                await lockManager.releaseAllUserLocks(socketData.projectId, socketData.user.id);

                // Notify others
                socket.to(`project:${socketData.projectId}`).emit('user_left', {
                    userId: socketData.user.id,
                    onlineUsers,
                });
            }
        });
    });

    return io;
}

// Debounced save to MongoDB
// Queue for pending saves
const pendingSaves = new Map<string, { timer: NodeJS.Timeout; state: ERDState }>();

// Force save immediately (e.g., on disconnect or critical op)
async function flushPendingSave(projectId: string, state?: ERDState) {
    const pending = pendingSaves.get(projectId);

    // If no pending save and no state provided, nothing to do
    if (!pending && !state) return;

    // If pending exists, clear timer
    if (pending) {
        clearTimeout(pending.timer);
        pendingSaves.delete(projectId);
    }

    // Use provided state or pending state
    const stateToSave = state || pending?.state;
    if (!stateToSave) return;

    // Initial check for valid ID
    if (!Types.ObjectId.isValid(projectId)) return;

    try {
        await Project.findByIdAndUpdate(projectId, {
            currentSnapshot: {
                version: stateToSave.version,
                entities: stateToSave.entities,
                relationships: stateToSave.relationships,
                savedAt: new Date(),
            },
            screenSnapshot: {
                version: stateToSave.version,
                screens: stateToSave.screens || [],
                flows: stateToSave.flows || [],
                savedAt: new Date(),
            },
            updatedAt: new Date(),
        });
        console.log(`💾 Project ${projectId} FLUSHED to MongoDB (immediate)`);
    } catch (error) {
        console.error('MongoDB flush error:', error);
    }
}

function debouncedSaveToMongo(projectId: string, state: ERDState, immediate = false): void {
    const existing = pendingSaves.get(projectId);
    if (existing) {
        clearTimeout(existing.timer);
    }

    if (immediate) {
        // Execute immediately
        flushPendingSave(projectId, state);
        return;
    }

    const timer = setTimeout(async () => {
        await flushPendingSave(projectId, state);
    }, 1500); // 1.5 seconds debounce

    pendingSaves.set(projectId, { timer, state });
}
