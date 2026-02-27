import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
        }
    )
);
