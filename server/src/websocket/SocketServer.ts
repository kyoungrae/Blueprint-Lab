import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { Types } from 'mongoose';
import { config } from '../config';
import { syncEngine, type CRDTOperation, type ERDState } from '../services/SyncEngine';
import { lockManager } from '../services/LockManager';
import { presenceManager, projectStateManager } from '../services/PresenceManager';
import { Project, History, User } from '../models';

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
                    const project = await Project.findById(projectId).lean();
                    if (project) {
                        const snap = project as any;
                        const projectType = snap.projectType || 'ERD';
                        const isComponent = projectType === 'COMPONENT';
                        state = {
                            entities: snap.currentSnapshot?.entities || [],
                            relationships: snap.currentSnapshot?.relationships || [],
                            sections: isComponent ? [] : (projectType === 'SCREEN_DESIGN' ? (Array.isArray((snap.screenSnapshot as any)?.sections) ? (snap.screenSnapshot as any).sections : []) : ((snap.currentSnapshot as any)?.sections || [])),
                            screens: isComponent ? (snap.componentSnapshot?.components || []) : (snap.screenSnapshot?.screens || []),
                            flows: isComponent ? (snap.componentSnapshot?.flows || []) : (snap.screenSnapshot?.flows || []),
                            version: isComponent ? (snap.componentSnapshot?.version || 0) : ((snap.screenSnapshot?.version ?? snap.currentSnapshot?.version) || 0),
                        };
                        await projectStateManager.initializeFromDB(
                            projectId,
                            state.entities,
                            state.relationships,
                            state.version,
                            state.screens,
                            state.flows,
                            state.sections || []
                        );
                    } else {
                        // Project not found in DB
                        state = { entities: [], relationships: [], sections: [], screens: [], flows: [], version: 0 };
                    }
                } else {
                    // Invalid ObjectId (e.g. temporary ID 'proj_...'), treat as new empty project
                    console.log(`ℹ️ Project ID ${projectId} is not a valid ObjectId (likely temporary), initializing empty state.`);
                    state = { entities: [], relationships: [], sections: [], screens: [], flows: [], version: 0 };
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
                // Overlay latest snapshot from MongoDB so state_sync sends consistent data
                // (Redis may be stale when user only PATCHes e.g. after section/ScreenDesign changes without sending operations)
                const project = await Project.findById(projectId).select('projectType currentSnapshot.entities currentSnapshot.relationships currentSnapshot.sections screenSnapshot.screens screenSnapshot.flows screenSnapshot.sections').lean();
                const projAny = project as any;
                const projectType = projAny?.projectType || 'ERD';

                // ERD: entities/relationships/sections from currentSnapshot
                const erdSnap = projAny?.currentSnapshot;
                if (erdSnap && Array.isArray(erdSnap.entities)) {
                    state = {
                        ...state,
                        entities: erdSnap.entities || state.entities,
                        relationships: erdSnap.relationships ?? state.relationships,
                        // ERD 섹션은 currentSnapshot.sections 기준으로 덮어씀
                        sections: Array.isArray(erdSnap.sections) ? erdSnap.sections : (state.sections || []),
                    };
                }

                // SCREEN_DESIGN: screens/flows/sections는 screenSnapshot 기준으로 덮어씀
                if (projectType === 'SCREEN_DESIGN') {
                    const screenSnap = projAny?.screenSnapshot;
                    if (screenSnap) {
                        state = {
                            ...state,
                            screens: Array.isArray(screenSnap.screens) ? screenSnap.screens : (state.screens || []),
                            flows: Array.isArray(screenSnap.flows) ? screenSnap.flows : (state.flows || []),
                            sections: Array.isArray(screenSnap.sections) ? screenSnap.sections : (state.sections || []),
                        };
                    }
                }
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
                // Pro tier required for adding components (fromComponentId) in screen design
                if (operation.type === 'SCREEN_UPDATE') {
                    const payload = operation.payload as Record<string, unknown>;
                    const drawElements = payload?.drawElements as Array<{ fromComponentId?: string }> | undefined;
                    const hasComponentRefs = Array.isArray(drawElements) && drawElements.some(e => e?.fromComponentId);

                    if (hasComponentRefs && Types.ObjectId.isValid(projectId)) {
                        const project = await Project.findById(projectId).select('linkedComponentProjectId projectType').lean();
                        if (project?.linkedComponentProjectId && project?.projectType === 'SCREEN_DESIGN') {
                            const userId = operation.userId || socketData.user.id;
                            if (userId && userId !== 'anonymous') {
                                const userDoc = await User.findById(userId).select('tier').lean();
                                const tier = userDoc?.tier || 'FREE';
                                if (tier !== 'PRO' && tier !== 'MASTER') {
                                    socket.emit('operation_rejected', {
                                        reason: 'tier',
                                        message: '컴포넌트 추가 기능은 Pro tier 이상부터 사용할 수 있습니다.'
                                    });
                                    return;
                                }
                            }
                        }
                    }
                }

                // Update Lamport clock
                syncEngine.updateClock(projectId, operation.lamportClock);

                // Get current state
                let state = await projectStateManager.getState(projectId);
                if (!state) {
                    state = { entities: [], relationships: [], sections: [], screens: [], flows: [], version: 0 };
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
                    newState.flows || [],
                    newState.sections || []
                );

                // Broadcast to all other clients in the project
                socket.to(`project:${projectId}`).emit('operation', {
                    ...operation,
                    appliedAt: Date.now(),
                });

                // Save to MongoDB
                // Force immediate save for critical operations to prevent data loss on refresh
                const payload = operation.payload as Record<string, unknown>;
                const hasDrawElements = payload && 'drawElements' in payload;
                const isCriticalOperation =
                    operation.type.includes('DELETE') ||
                    operation.type === 'ERD_IMPORT' ||
                    (operation.type === 'SCREEN_UPDATE' && hasDrawElements) ||
                    operation.type === 'SCREEN_DRAW_DELETE';
                const savePromise = debouncedSaveToMongo(projectId, newState, isCriticalOperation);
                if (savePromise) await savePromise;

                // Record history in MongoDB
                if (Types.ObjectId.isValid(projectId)) {
                    try {
                        const histPayload = operation.payload as any;
                        let details = histPayload.historyLog?.details || `Operation ${operation.type} performed`;
                        let targetName = histPayload.historyLog?.targetName || operation.targetId;
                        let targetType: 'ENTITY' | 'RELATIONSHIP' | 'PROJECT' | 'SCREEN' | 'FLOW' = 'PROJECT';

                        if (operation.type.startsWith('ENTITY_')) targetType = 'ENTITY';
                        else if (operation.type.startsWith('RELATIONSHIP_')) targetType = 'RELATIONSHIP';
                        else if (operation.type.startsWith('ATTRIBUTE_')) targetType = 'ENTITY';
                        else if (operation.type.startsWith('SCREEN_FLOW_')) targetType = 'FLOW';
                        else if (operation.type.startsWith('SCREEN_')) targetType = 'SCREEN';
                        else if (operation.type === 'SCREEN_DRAW_DELETE') targetType = 'SCREEN';
                        else if (operation.type.startsWith('FLOW_')) targetType = 'FLOW';

                        // Specific handling for common operations to make them look nice if historyLog is missing
                        const prev = operation.previousState as Record<string, unknown> | undefined;
                        if (!histPayload.historyLog) {
                            if (operation.type === 'ENTITY_CREATE') {
                                details = `새 테이블 '${histPayload.name || '알 수 없음'}'을 생성했습니다.`;
                                targetName = histPayload.name || 'New Entity';
                            } else if (operation.type === 'ENTITY_DELETE') {
                                const name = (prev?.name as string) || histPayload.name || operation.targetId;
                                targetName = name;
                                details = `테이블 '${name}' 삭제`;
                            } else if (operation.type === 'RELATIONSHIP_DELETE') {
                                targetName = '관계';
                                details = `관계 삭제`;
                            } else if (operation.type === 'SCREEN_DELETE') {
                                const name = (prev?.name as string) || histPayload.name || operation.targetId;
                                targetName = name;
                                details = `화면 '${name}' 삭제`;
                            } else if (operation.type === 'FLOW_DELETE' || operation.type === 'SCREEN_FLOW_DELETE') {
                                targetName = '연결선';
                                details = `연결선 삭제`;
                            } else if (operation.type === 'ATTRIBUTE_DELETE') {
                                const prevAttrs = prev?.attributes as Array<{ id: string; name: string }> | undefined;
                                const payloadAttrs = histPayload.attributes as Array<{ id: string }> | undefined;
                                const deletedAttr = prevAttrs && payloadAttrs
                                    ? prevAttrs.find((a: { id: string }) => !payloadAttrs.some((p: { id: string }) => p.id === a.id))
                                    : undefined;
                                const attrName = deletedAttr?.name || '컬럼';
                                targetName = attrName;
                                details = `컬럼 '${attrName}' 삭제`;
                            } else if (operation.type === 'SCREEN_DRAW_DELETE') {
                                const prevDraw = (prev?.drawElements || []) as Array<{ id: string; type?: string }>;
                                const payloadDraw = (histPayload.drawElements || []) as Array<{ id: string }>;
                                const deletedCount = prevDraw.length - payloadDraw.length;
                                const deletedEl = prevDraw.find((e: { id: string }) => !payloadDraw.some((p: { id: string }) => p.id === e.id));
                                const typeLabel = deletedEl?.type === 'table' ? '표 객체' : deletedEl?.type ? `그리기 요소(${deletedEl.type})` : '그리기 요소';
                                targetName = deletedCount > 1 ? `그리기 요소 ${deletedCount}개` : typeLabel;
                                details = deletedCount > 1 ? `그리기 요소 ${deletedCount}개 삭제` : `${typeLabel} 삭제`;
                            }
                        }

                        await History.create({
                            projectId: new Types.ObjectId(projectId),
                            userId: new Types.ObjectId(operation.userId),
                            userName: operation.userName,
                            userPicture: histPayload.historyLog?.userPicture,
                            operationType: operation.type,
                            targetType: histPayload.historyLog?.targetType || targetType,
                            targetId: operation.targetId,
                            targetName: targetName,
                            operation: {
                                lamportClock: operation.lamportClock,
                                payload: histPayload,
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

                // Notify others (clientId로 커서 제거 - 같은 사람 여러 커서 방지)
                socket.to(`project:${socketData.projectId}`).emit('user_left', {
                    userId: socketData.user.id,
                    clientId: socket.id,
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
        const project = await Project.findById(projectId).select('projectType screenSnapshot.sections').lean();
        const projectType = (project as any)?.projectType || 'ERD';
        // Deep clone screens to ensure drawElements (incl. imageUrl) are stored as-is
        const screensToSave = JSON.parse(JSON.stringify(stateToSave.screens || []));
        if (projectType === 'COMPONENT') {
            await Project.findByIdAndUpdate(projectId, {
                componentSnapshot: {
                    version: stateToSave.version,
                    components: screensToSave,
                    flows: stateToSave.flows || [],
                    savedAt: new Date(),
                },
                updatedAt: new Date(),
            });
        } else {
            // ERD 섹션은 state.sections를 사용하지만,
            // 화면 설계(Screen Design)의 섹션은 REST PATCH를 통해 screenSnapshot.sections에만 저장하므로
            // 여기서 state.sections로 덮어쓰지 않는다.
            if (projectType === 'SCREEN_DESIGN') {
                await Project.findByIdAndUpdate(projectId, {
                    currentSnapshot: {
                        version: stateToSave.version,
                        entities: stateToSave.entities,
                        relationships: stateToSave.relationships,
                        sections: stateToSave.sections || [],
                        savedAt: new Date(),
                    },
                    screenSnapshot: {
                        version: stateToSave.version,
                        screens: screensToSave,
                        flows: stateToSave.flows || [],
                        // 섹션은 기존 Mongo 값을 유지
                        sections: (project as any)?.screenSnapshot?.sections || [],
                        savedAt: new Date(),
                    },
                    updatedAt: new Date(),
                });
            } else {
                // ERD 프로젝트: 섹션은 state.sections 기준으로 저장
                await Project.findByIdAndUpdate(projectId, {
                    currentSnapshot: {
                        version: stateToSave.version,
                        entities: stateToSave.entities,
                        relationships: stateToSave.relationships,
                        sections: stateToSave.sections || [],
                        savedAt: new Date(),
                    },
                    screenSnapshot: {
                        version: stateToSave.version,
                        screens: screensToSave,
                        flows: stateToSave.flows || [],
                        sections: stateToSave.sections || [],
                        savedAt: new Date(),
                    },
                    updatedAt: new Date(),
                });
            }
        }
        console.log(`💾 Project ${projectId} FLUSHED to MongoDB (immediate)`);
    } catch (error) {
        console.error('MongoDB flush error:', error);
    }
}

function debouncedSaveToMongo(projectId: string, state: ERDState, immediate = false): Promise<void> | void {
    const existing = pendingSaves.get(projectId);
    if (existing) {
        clearTimeout(existing.timer);
    }

    if (immediate) {
        // Execute immediately and return promise so caller can await (prevents stale state on refresh)
        return flushPendingSave(projectId, state);
    }

    const timer = setTimeout(async () => {
        await flushPendingSave(projectId, state);
    }, 1500); // 1.5 seconds debounce

    pendingSaves.set(projectId, { timer, state });
}
