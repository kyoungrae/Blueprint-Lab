import { fetchWithAuth } from '../utils/fetchWithAuth';
import { useProjectStore } from './projectStore';
import { syncPersonalProgressToWbs, type WbsMirrorScheduleEvent } from '../services/wbsPersonalScheduleSync';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

export type PersonalSchedulePersist = {
    events: unknown[];
    todos: unknown[];
    categories: Record<string, { label: string; color: string }>;
    visibleCats: string[];
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { projectId: string; data: PersonalSchedulePersist } | null = null;
let lastScheduledKey: string | null = null;

export function schedulePersonalScheduleSave(projectId: string, data: PersonalSchedulePersist) {
    const key = `${projectId}:${JSON.stringify(data)}`;
    if (key === lastScheduledKey) return;
    lastScheduledKey = key;
    pending = { projectId, data };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        void flushPersonalScheduleSave();
    }, 800);
}

export async function flushPersonalScheduleSave() {
    if (!pending) return;
    const { projectId, data } = pending;
    pending = null;
    if (projectId.startsWith('local_')) return;
    try {
        await syncPersonalProgressToWbs(projectId, data.events as WbsMirrorScheduleEvent[]);
        await fetchWithAuth(`${API_URL}/${projectId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });
        useProjectStore.getState().updateProjectData(projectId, data);
    } catch {
        // 네트워크 오류는 조용히 무시(다음 변경 시 재시도). 로컬 캐시에는 이미 반영됨.
    }
}
