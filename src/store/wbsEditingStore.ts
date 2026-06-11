import { create } from 'zustand';
import { getUserColor } from '../utils/userColor';

export interface WbsEditingEntry {
    userId: string;
    userName: string;
    color: string;
}

interface WbsEditingState {
    /** elementId → 수정 중인 유저 정보 */
    editing: Map<string, WbsEditingEntry>;
    _timers: Map<string, ReturnType<typeof setTimeout>>;

    setEditing: (elementId: string, userId: string, userName: string) => void;
    clearEditing: (elementId: string, userId: string) => void;
    clearAll: () => void;
}

/** 네트워크 문제 등으로 blur 이벤트가 누락될 경우 자동 만료 시간 */
const AUTO_EXPIRE_MS = 8000;

export const useWbsEditingStore = create<WbsEditingState>((set, get) => ({
    editing: new Map(),
    _timers: new Map(),

    setEditing: (elementId, userId, userName) => {
        const existing = get()._timers.get(elementId);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
            get().clearEditing(elementId, userId);
        }, AUTO_EXPIRE_MS);

        set((s) => {
            const editing = new Map(s.editing);
            editing.set(elementId, { userId, userName, color: getUserColor(userId) });
            const _timers = new Map(s._timers);
            _timers.set(elementId, timer);
            return { editing, _timers };
        });
    },

    clearEditing: (elementId, userId) => {
        set((s) => {
            const entry = s.editing.get(elementId);
            if (!entry || entry.userId !== userId) return s;
            const editing = new Map(s.editing);
            editing.delete(elementId);
            const _timers = new Map(s._timers);
            const t = _timers.get(elementId);
            if (t) clearTimeout(t);
            _timers.delete(elementId);
            return { editing, _timers };
        });
    },

    clearAll: () => {
        for (const t of get()._timers.values()) clearTimeout(t);
        set({ editing: new Map(), _timers: new Map() });
    },
}));
