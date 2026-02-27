import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { ERDState, HistoryLog } from '../types/erd';

// Socket Server URL
// - Dev: localhost:3001 (backend)
// - Prod with VITE_SOCKET_URL empty: same origin (window.location.origin)
// - Prod with VITE_SOCKET_URL set: use that value
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
    || (import.meta.env.DEV ? 'http://localhost:3001' : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'));

// Online User Interface
export interface OnlineUser {
    id: string;
    name: string;
    picture?: string;
    joinedAt: number;
}

// Cursor Info Interface
export interface CursorInfo {
    userId: string;
    userName: string;
    userPicture?: string;
    x: number;
    y: number;
    viewport?: { x: number; y: number; zoom: number };
}

// Lock Info Interface
export interface LockInfo {
    userId: string;
    userName: string;
    lockedAt: number;
    expiresAt: number;
}

// CRDT Operation Interface
export interface CRDTOperation {
    id: string;
    type: string;
    targetId: string;
    lamportClock: number;
    wallClock: number;
    userId: string;
    userName: string;
    payload: Record<string, unknown>;
    previousState?: Record<string, unknown>;
}

interface SyncStore {
    // Connection state
    socket: Socket | null;
    isConnected: boolean;
    isAuthenticatedOnSocket: boolean;
    isSynced: boolean; // Track if initial state has been received from server
    currentProjectId: string | null;

    // Online users
    onlineUsers: OnlineUser[];

    // Cursors (other sessions)
    cursors: Map<string, CursorInfo & { userId: string; clientId: string; userName: string; userPicture?: string }>; // clientId -> cursor
    locks: Map<string, LockInfo>;

    // Lamport clock
    lamportClock: number;

    // Actions
    connect: () => void;
    disconnect: () => void;
    authenticate: (user: { id: string; name: string; picture?: string }) => void;
    joinProject: (projectId: string) => void;
    leaveProject: () => void;

    sendOperation: (operation: Omit<CRDTOperation, 'id' | 'lamportClock' | 'wallClock'>) => void;
    updateCursor: (position: { x: number; y: number }) => void;
    requestLock: (entityId: string) => Promise<boolean>;
    releaseLock: (entityId: string) => void;

    // Internal setters
    _setOnlineUsers: (users: OnlineUser[]) => void;
    _setCursor: (clientId: string, cursor: any) => void;
    _removeCursor: (clientId: string) => void;
    _removeCursorsByUserId: (userId: string) => void;
    _setLock: (entityId: string, lock: LockInfo) => void;
    _removeLock: (entityId: string) => void;
    _incrementClock: () => number;
}

export const useSyncStore = create<SyncStore>((set, get) => ({
    socket: null,
    isConnected: false,
    isAuthenticatedOnSocket: false,
    isSynced: false,
    currentProjectId: null,
    onlineUsers: [],
    cursors: new Map(),
    locks: new Map(),
    lamportClock: 0,

    connect: () => {
        const { socket: existingSocket } = get();
        if (existingSocket) {
            console.log('🔌 Socket already exists, skipping connect');
            return;
        }

        console.log('🔌 Creating new socket connection...');
        const socket = io(SOCKET_URL, {
            path: import.meta.env.VITE_SOCKET_PATH || '/socket.io',
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        // Set socket immediately
        set({ socket });

        socket.on('connect', () => {
            console.log('🔌 Connected to collaboration server');
            set({ isConnected: true });
        });

        socket.on('authenticated', (data: { success: boolean }) => {
            if (data.success) {
                console.log('✅ Identity confirmed by server');
                set({ isAuthenticatedOnSocket: true });
            }
        });

        socket.on('disconnect', () => {
            console.log('🔌 Disconnected from collaboration server');
            set({
                isConnected: false,
                isAuthenticatedOnSocket: false,
                isSynced: false, // Reset sync state on disconnect
                onlineUsers: [],
                cursors: new Map(),
                locks: new Map()
            });
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error.message);
        });

        // State sync on join
        socket.on('state_sync', (data: {
            state: ERDState & { version: number };
            onlineUsers: OnlineUser[];
            locks: Record<string, LockInfo>;
            history: HistoryLog[];
        }) => {
            console.log('📥 State synced from server (including history)');
            set({
                onlineUsers: data.onlineUsers,
                isSynced: true // Mark as synced
            });

            const locksMap = new Map<string, LockInfo>();
            Object.entries(data.locks).forEach(([entityId, lock]) => {
                locksMap.set(entityId, lock);
            });
            set({ locks: locksMap });

            // Dispatch custom event for ERD store to handle
            window.dispatchEvent(new CustomEvent('erd:state_sync', {
                detail: {
                    ...data.state,
                    history: data.history
                }
            }));
        });

        // User events
        socket.on('user_joined', (data: { user: OnlineUser; onlineUsers: OnlineUser[] }) => {
            console.log(`👤 ${data.user.name} joined`);
            set({ onlineUsers: data.onlineUsers });
        });

        socket.on('user_left', (data: { userId: string; clientId?: string; onlineUsers: OnlineUser[] }) => {
            console.log(`👤 User left`);
            set({ onlineUsers: data.onlineUsers });
            if (data.clientId) {
                get()._removeCursor(data.clientId);
            } else {
                get()._removeCursorsByUserId(data.userId);
            }
        });

        // Operation from other users
        socket.on('operation', (operation: CRDTOperation) => {
            console.log('📥 Received operation:', operation.type);
            // Update local clock
            const { lamportClock } = get();
            set({ lamportClock: Math.max(lamportClock, operation.lamportClock) + 1 });

            // Dispatch custom event for ERD store to handle
            window.dispatchEvent(new CustomEvent('erd:remote_operation', { detail: operation }));
        });

        // Operation rejected by server (e.g. tier restriction)
        socket.on('operation_rejected', (data: { reason?: string; message?: string }) => {
            const msg = data?.message || '작업이 거부되었습니다.';
            alert(msg);
            window.dispatchEvent(new CustomEvent('erd:operation_rejected', { detail: data }));
            // Refetch projects to sync state with server (revert optimistic update)
            if (data?.reason === 'tier') {
                import('./projectStore').then(({ useProjectStore }) => {
                    useProjectStore.getState().fetchProjects();
                });
            }
        });

        // Cursor updates
        socket.on('cursor_update', (data: any) => {
            get()._setCursor(data.clientId, data);
        });

        // Lock events
        socket.on('lock_acquired', (data: { entityId: string; userId: string; userName: string }) => {
            get()._setLock(data.entityId, {
                userId: data.userId,
                userName: data.userName,
                lockedAt: Date.now(),
                expiresAt: Date.now() + 30000,
            });
        });

        socket.on('lock_released', (data: { entityId: string }) => {
            get()._removeLock(data.entityId);
        });
    },

    disconnect: () => {
        const { socket } = get();
        if (socket) {
            socket.disconnect();
            set({ socket: null, isConnected: false });
        }
    },

    authenticate: (user) => {
        const { socket } = get();
        if (socket) {
            socket.emit('authenticate', user);
        }
    },

    joinProject: (projectId) => {
        // Handle local project
        if (projectId.startsWith('local_')) {
            console.log('🏠 Joining local project (Guest Mode)');
            set({
                currentProjectId: projectId,
                isSynced: true, // Local state is always "synced"
                onlineUsers: [],
                cursors: new Map(),
                locks: new Map()
            });
            return;
        }

        const { socket } = get();
        if (socket) {
            set({ cursors: new Map(), currentProjectId: projectId });
            socket.emit('join_project', { projectId });
        }
    },

    leaveProject: () => {
        const { socket, currentProjectId } = get();
        if (socket && currentProjectId) {
            socket.emit('leave_project', { projectId: currentProjectId });
            set({ currentProjectId: null, onlineUsers: [], cursors: new Map(), locks: new Map() });
        }
    },

    sendOperation: (operationData) => {
        const { socket, currentProjectId } = get();
        if (socket && currentProjectId && !currentProjectId.startsWith('local_')) {
            const operation: CRDTOperation = {
                ...operationData,
                id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                lamportClock: get()._incrementClock(),
                wallClock: Date.now(),
            };
            socket.emit('operation', operation);
        }
    },

    updateCursor: (position) => {
        const { socket, currentProjectId } = get();
        if (socket && currentProjectId && !currentProjectId.startsWith('local_')) {
            socket.emit('cursor_move', position);
        }
    },

    requestLock: async (entityId) => {
        const { currentProjectId } = get();
        if (currentProjectId?.startsWith('local_')) return true;

        return new Promise((resolve) => {
            const { socket } = get();
            if (!socket) {
                resolve(false);
                return;
            }

            socket.emit('request_lock', { entityId });

            const handler = (result: { success: boolean; entityId: string }) => {
                if (result.entityId === entityId) {
                    socket.off('lock_result', handler);
                    resolve(result.success);
                }
            };

            socket.on('lock_result', handler);

            // Timeout after 5 seconds
            setTimeout(() => {
                socket.off('lock_result', handler);
                resolve(false);
            }, 5000);
        });
    },

    releaseLock: (entityId) => {
        const { socket, currentProjectId } = get();
        if (socket && currentProjectId && !currentProjectId.startsWith('local_')) {
            socket.emit('release_lock', { entityId });
        }
    },

    _setOnlineUsers: (users) => set({ onlineUsers: users }),

    _setCursor: (clientId, cursor) => {
        const cursors = new Map(get().cursors);
        cursors.set(clientId, cursor);
        set({ cursors });
    },

    _removeCursor: (clientId) => {
        const cursors = new Map(get().cursors);
        cursors.delete(clientId);
        set({ cursors });
    },

    _removeCursorsByUserId: (userId) => {
        const cursors = new Map(get().cursors);
        for (const [clientId, cursor] of cursors) {
            if ((cursor as any).userId === userId) cursors.delete(clientId);
        }
        set({ cursors });
    },

    _setLock: (entityId, lock) => {
        const locks = new Map(get().locks);
        locks.set(entityId, lock);
        set({ locks });
    },

    _removeLock: (entityId) => {
        const locks = new Map(get().locks);
        locks.delete(entityId);
        set({ locks });
    },

    _incrementClock: () => {
        const newClock = get().lamportClock + 1;
        set({ lamportClock: newClock });
        return newClock;
    },
}));
