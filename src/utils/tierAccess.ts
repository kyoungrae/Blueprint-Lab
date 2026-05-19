import type { UserTier } from '../store/authStore';

export function canManageTranslationMemory(tier?: UserTier | null): boolean {
    return tier === 'PRO' || tier === 'MASTER';
}
