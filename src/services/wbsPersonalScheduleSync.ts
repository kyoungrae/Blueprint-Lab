import type { Project } from '../types/erd';
import type { WbsDevRow, WbsMenuNode } from '../types/wbs';
import { normalizeYmd } from '../components/wbs/wbsDateUtils';
import { getLinkedPersonalScheduleIds } from '../utils/linkedPersonalScheduleProjects';
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { useProjectStore } from '../store/projectStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

export const WBS_MIRROR_CATEGORY = 'wbs_sync';

export interface WbsMirrorScheduleEvent {
    id: string;
    title: string;
    category: string;
    startDate: string;
    endDate: string;
    allDay?: boolean;
    assignee?: string;
    progress?: number;
    description?: string;
    wbsProjectId?: string;
    wbsRowId?: string;
    isWbsMirror?: boolean;
    syncSource?: 'wbs' | 'personal' | 'manual';
    lastSyncedAt?: string;
    repeat: 'none';
}

type PersonalScheduleData = {
    events?: WbsMirrorScheduleEvent[];
    todos?: unknown[];
    categories?: Record<string, { label: string; color: string }>;
    visibleCats?: string[];
};

let syncGuard = false;

export function getProjectCreatorName(project: Project): string {
    const owner = project.members?.find((m) => m.role === 'OWNER');
    const ownerName = owner?.name?.trim() || '';
    const author = project.author?.trim() || '';
    // 개인일정은 OWNER 표시명이 실제 담당자 매칭 기준
    if (project.projectType === 'PERSONAL_SCHEDULE') return ownerName || author;
    return author || ownerName;
}

/** WBS 담당자 ↔ 개인일정 생성자(OWNER/author) 일치 여부 */
export function assigneeMatchesCreator(assignee: string, project: Project): boolean {
    const name = assignee.trim();
    if (!name) return false;
    const owner = project.members?.find((m) => m.role === 'OWNER')?.name?.trim();
    const author = project.author?.trim();
    return name === owner || (!!author && name === author);
}

export function shouldMirrorWbsRow(row: WbsDevRow, creatorName: string, psProject?: Project): boolean {
    if (row.isDebugging) return false;
    if (!row.featureName?.trim()) return false;
    const assignee = row.assignee?.trim() ?? '';
    if (!assignee) return false;
    const matches = psProject
        ? assigneeMatchesCreator(assignee, psProject)
        : assignee === creatorName;
    if (!matches) return false;
    const start = normalizeYmd(row.startDate);
    const end = normalizeYmd(row.endDate);
    return !!(start && end);
}

function buildMirrorEvent(
    row: WbsDevRow,
    menu: WbsMenuNode | undefined,
    wbsProjectId: string,
    existingId?: string,
): WbsMirrorScheduleEvent {
    const start = normalizeYmd(row.startDate);
    const end = normalizeYmd(row.endDate);
    const menuLabel = menu ? `${menu.name} (${menu.menuCode})` : '';
    return {
        id: existingId || `wbs_mirror_${row.id}`,
        title: row.featureName.trim(),
        category: WBS_MIRROR_CATEGORY,
        startDate: start,
        endDate: end,
        allDay: true,
        assignee: row.assignee.trim(),
        progress: row.progress ?? 0,
        description: menuLabel ? `WBS · ${menuLabel}` : 'WBS',
        wbsProjectId,
        wbsRowId: row.id,
        isWbsMirror: true,
        syncSource: 'wbs',
        lastSyncedAt: new Date().toISOString(),
        repeat: 'none',
    };
}

function detachMirrorMeta(event: WbsMirrorScheduleEvent): WbsMirrorScheduleEvent {
    return {
        ...event,
        wbsProjectId: undefined,
        wbsRowId: undefined,
        isWbsMirror: false,
        syncSource: 'manual',
    };
}

/** WBS 개발 상세 → 연결된 개인일정 달력 미러링 */
export async function syncWbsToLinkedPersonalSchedules(wbsProjectId: string): Promise<void> {
    if (syncGuard) return;

    const store = useProjectStore.getState();
    const wbsProject = store.projects.find((p) => p.id === wbsProjectId);
    if (!wbsProject || wbsProject.projectType !== 'WBS') return;

    const wbsData = wbsProject.data as { menus?: WbsMenuNode[]; rows?: WbsDevRow[] };
    const { useWbsStore } = await import('../store/wbsStore');
    const wbsState = useWbsStore.getState();
    const menus = wbsState.currentProjectId === wbsProjectId
        ? wbsState.menus
        : (wbsData.menus ?? []);
    const rows = wbsState.currentProjectId === wbsProjectId
        ? wbsState.rows
        : (wbsData.rows ?? []);
    const menuById = new Map(menus.map((m) => [m.id, m]));
    const linkedIds = getLinkedPersonalScheduleIds(wbsProject);
    if (linkedIds.length === 0) return;

    syncGuard = true;
    try {
        for (const psId of linkedIds) {
            const psProject = store.projects.find((p) => p.id === psId);
            if (!psProject || psProject.projectType !== 'PERSONAL_SCHEDULE') continue;

            const creatorName = getProjectCreatorName(psProject);
            const psData = (psProject.data || {}) as PersonalScheduleData;
            let events = [...(psData.events ?? [])];
            const categories = { ...(psData.categories ?? {}) };
            categories[WBS_MIRROR_CATEGORY] = categories[WBS_MIRROR_CATEGORY] ?? { label: 'WBS', color: '#10b981' };

            const activeRowIds = new Set<string>();

            for (const row of rows) {
                if (!shouldMirrorWbsRow(row, creatorName, psProject)) continue;
                activeRowIds.add(row.id);
                const idx = events.findIndex(
                    (e) => e.wbsProjectId === wbsProjectId && e.wbsRowId === row.id,
                );
                const mirror = buildMirrorEvent(
                    row,
                    menuById.get(row.menuId),
                    wbsProjectId,
                    idx >= 0 ? events[idx].id : undefined,
                );
                if (idx >= 0) events[idx] = mirror;
                else events.push(mirror);
            }

            events = events.map((e) => {
                if (
                    e.wbsProjectId === wbsProjectId
                    && e.wbsRowId
                    && e.isWbsMirror
                    && !activeRowIds.has(e.wbsRowId)
                ) {
                    return detachMirrorMeta(e);
                }
                return e;
            });

            const visibleCats = Array.isArray(psData.visibleCats) ? [...psData.visibleCats] : [];
            if (!visibleCats.includes(WBS_MIRROR_CATEGORY)) visibleCats.push(WBS_MIRROR_CATEGORY);

            const newData: PersonalScheduleData = {
                events,
                todos: psData.todos ?? [],
                categories,
                visibleCats,
            };

            store.updateProjectData(psId, newData);
            if (!psId.startsWith('local_')) {
                await fetchWithAuth(`${API_URL}/${psId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: newData }),
                });
            }
        }
    } finally {
        syncGuard = false;
    }
}

/** 개인일정 미러 이벤트 진행율 → WBS 행 역동기화 */
export async function syncPersonalProgressToWbs(
    personalProjectId: string,
    events: WbsMirrorScheduleEvent[],
): Promise<void> {
    if (syncGuard) return;

    const store = useProjectStore.getState();
    const psProject = store.projects.find((p) => p.id === personalProjectId);
    if (!psProject || psProject.projectType !== 'PERSONAL_SCHEDULE') return;

    const wbsProjectId = psProject.linkedWbsProjectId;
    if (!wbsProjectId) return;

    const wbsProject = store.projects.find((p) => p.id === wbsProjectId);
    if (!wbsProject || wbsProject.projectType !== 'WBS') return;

    const wbsData = wbsProject.data as { menus?: WbsMenuNode[]; rows?: WbsDevRow[] };
    const rows = [...(wbsData.rows ?? [])];
    let changed = false;

    for (const ev of events) {
        if (!ev.isWbsMirror || !ev.wbsRowId || ev.wbsProjectId !== wbsProjectId) continue;
        const idx = rows.findIndex((r) => r.id === ev.wbsRowId);
        if (idx < 0) continue;
        const prog = Math.min(100, Math.max(0, ev.progress ?? 0));
        if (rows[idx].progress !== prog) {
            rows[idx] = { ...rows[idx], progress: prog };
            changed = true;
        }
    }

    if (!changed) return;

    syncGuard = true;
    try {
        const newData = { ...wbsData, rows };
        store.updateProjectData(wbsProjectId, newData);
        if (useWbsStore.getState().currentProjectId === wbsProjectId) {
            useWbsStore.getState().loadProject(wbsProjectId, newData);
        }
        if (!wbsProjectId.startsWith('local_')) {
            await fetchWithAuth(`${API_URL}/${wbsProjectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: newData }),
            });
        }
    } finally {
        syncGuard = false;
    }
}
