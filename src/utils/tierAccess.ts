import type { UserTier } from '../store/authStore';

export function canManageTranslationMemory(tier?: UserTier | null): boolean {
    return tier === 'PRO' || tier === 'MASTER' || tier === 'ADMIN';
}

/** GANTT / 일정 탭 표시 */
export function canViewWbsSchedule(tier?: UserTier | null): boolean {
    return tier === 'PRO' || tier === 'MASTER' || tier === 'ADMIN';
}

/** WBS 엑셀 업로드 — Master 이상만. Pro는 열람·편집만 */
export function canUploadWbsExcel(tier?: UserTier | null): boolean {
    return tier === 'MASTER' || tier === 'ADMIN';
}

/** WBS JSON 업로드 */
export function canUploadWbsJson(tier?: UserTier | null): boolean {
    return tier === 'PRO' || tier === 'MASTER' || tier === 'ADMIN';
}
