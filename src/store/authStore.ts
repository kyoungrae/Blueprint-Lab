import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

const safeStateStorage: StateStorage<void> = {
    getItem: (name: string) => {
        try {
            return localStorage.getItem(name);
        } catch {
            return null;
        }
    },
    setItem: (name: string, value: string) => {
        try {
            localStorage.setItem(name, value);
        } catch {
            try {
                localStorage.removeItem(name);
            } catch {
                /* ignore */
            }
        }
        return undefined;
    },
    removeItem: (name: string) => {
        try {
            localStorage.removeItem(name);
        } catch {
            /* ignore */
        }
        return undefined;
    },
};

export type UserTier = 'FREE' | 'PRO' | 'MASTER';

interface User {
    id: string;
    email: string;
    name: string;
    picture?: string;
    tier?: UserTier;
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    login: (user: User, token?: string) => void;
    logout: () => void;
    updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            login: (user, token) => set({
                user,
                token: token || null,
                isAuthenticated: true
            }),
            logout: () => {
                localStorage.removeItem('auth-token');
                set({ user: null, token: null, isAuthenticated: false });
            },
            updateUser: (updates) => set((state) => ({
                user: state.user ? { ...state.user, ...updates } : null,
            })),
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() => ({
                getItem: (name) => {
                    try {
                        const raw = localStorage.getItem(name);
                        if (raw == null) return null;
                        JSON.parse(raw);
                        return raw;
                    } catch {
                        try {
                            localStorage.removeItem(name);
                        } catch {
                            /* ignore */
                        }
                        return null;
                    }
                },
                setItem: (name, value) => safeStateStorage.setItem(name, value),
                removeItem: (name) => safeStateStorage.removeItem(name),
            })),
        }
    )
);
