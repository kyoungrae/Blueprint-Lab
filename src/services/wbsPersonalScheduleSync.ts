import type { Project } from '../types/erd';
import type { WbsDevRow, WbsMenuNode } from '../types/wbs';
import { isWbsDebugingCategoryRow } from '../types/wbs';
import { normalizeYmd } from '../components/wbs/wbsDateUtils';
import { getLinkedPersonalScheduleIds } from '../utils/linkedPersonalScheduleProjects';
import {
    enrichRowsWithAssigneeUserIds,
    getRowAssigneeDisplayName,
    rowMatchesPersonalScheduleOwner,
} from '../utils/wbsAssigneeMatch';
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

let wbsToPsSyncing = false;
let psToWbsSyncing = false;
let wbsSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const lastWbsSyncAt = new Map<string, number>();
const MIN_SYNC_INTERVAL_MS = 2000;

function getProjectFromStore(projectId: string): Project | null {
    return useProjectStore.getState().projects.find((p) => p.id === projectId) ?? null;
}

/** WBS 저장 등 빈번한 변경 — 디바운스 후 동기화 */
export function scheduleSyncWbsToLinkedPersonalSchedules(wbsProjectId: string): void {
    if (wbsSyncDebounceTimer) clearTimeout(wbsSyncDebounceTimer);
    wbsSyncDebounceTimer = setTimeout(() => {
        wbsSyncDebounceTimer = null;
        void syncWbsToLinkedPersonalSchedules(wbsProjectId);
    }, 1000);
}

export function getProjectCreatorName(project: Project): string {
    const owner = project.members?.find((m) => m.role === 'OWNER');
    const ownerName = owner?.name?.trim() || '';
    const author = project.author?.trim() || '';
    // 개인일정은 OWNER 표시명이 실제 담당자 매칭 기준
    if (project.projectType === 'PERSONAL_SCHEDULE') return ownerName || author;
    return author || ownerName;
}

/** @deprecated 이름 매칭만 사용 — rowMatchesPersonalScheduleOwner 사용 권장 */
export function assigneeMatchesCreator(assignee: string, project: Project): boolean {
    const name = assignee.trim();
    if (!name) return false;
    const owner = project.members?.find((m) => m.role === 'OWNER')?.name?.trim();
    const author = project.author?.trim();
    return name === owner || (!!author && name === author);
}

export function shouldMirrorWbsRow(
    row: WbsDevRow,
    _creatorName: string,
    psProject?: Project,
    wbsMembers: import('../types/erd').ProjectMember[] = [],
): boolean {
    if (isWbsDebugingCategoryRow(row)) return false;
    if (!row.featureName?.trim()) return false;
    if (!psProject) return false;
    if (!rowMatchesPersonalScheduleOwner(row, psProject, wbsMembers)) return false;
    const start = normalizeYmd(row.startDate);
    const end = normalizeYmd(row.endDate);
    return !!(start && end);
}

function buildMirrorEvent(
    row: WbsDevRow,
    menu: WbsMenuNode | undefined,
    wbsProjectId: string,
    existingId?: string,
    wbsMembers: import('../types/erd').ProjectMember[] = [],
): WbsMirrorScheduleEvent {
    const start = normalizeYmd(row.startDate);
    const end = normalizeYmd(row.endDate);
    const menuLabel = menu ? `${menu.name} (${menu.menuCode})` : '';
    const assignee = getRowAssigneeDisplayName(row, wbsMembers);
    return {
        id: existingId || `wbs_mirror_${row.id}`,
        title: row.featureName.trim(),
        category: WBS_MIRROR_CATEGORY,
        startDate: start,
        endDate: end,
        allDay: true,
        assignee,
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

/** WBS 개발 상세 → 연결된 개인일정 달력 미러링 (로컬 store 기준, 서버 GET 없음) */
export async function syncWbsToLinkedPersonalSchedules(
    wbsProjectId: string,
    options?: { force?: boolean },
): Promise<void> {
    if (wbsToPsSyncing) return;

    const now = Date.now();
    const last = lastWbsSyncAt.get(wbsProjectId) ?? 0;
    if (!options?.force && now - last < MIN_SYNC_INTERVAL_MS) return;

    const store = useProjectStore.getState();
    const wbsProject = getProjectFromStore(wbsProjectId);
    if (!wbsProject || wbsProject.projectType !== 'WBS') return;

    const wbsData = wbsProject.data as { menus?: WbsMenuNode[]; rows?: WbsDevRow[] };
    const { useWbsStore } = await import('../store/wbsStore');
    const wbsState = useWbsStore.getState();
    const localWbs = wbsProject;
    const localWbsData = localWbs?.data as { menus?: WbsMenuNode[]; rows?: WbsDevRow[] } | undefined;

    const menus = wbsState.currentProjectId === wbsProjectId && wbsState.menus.length > 0
        ? wbsState.menus
        : (wbsData.menus?.length ? wbsData.menus : (localWbsData?.menus ?? []));
    const wbsMembers = wbsProject.members ?? localWbs?.members ?? [];

    let rawRows = wbsState.currentProjectId === wbsProjectId && wbsState.rows.length > 0
        ? wbsState.rows
        : (wbsData.rows ?? []);
    const localRows = localWbsData?.rows ?? [];
    if (localRows.length > rawRows.length) rawRows = localRows;

    const rows = enrichRowsWithAssigneeUserIds(rawRows, wbsMembers);
    const menuById = new Map(menus.map((m) => [m.id, m]));
    const linkedIds = getLinkedPersonalScheduleIds(wbsProject, store.projects);
    if (linkedIds.length === 0) return;

    wbsToPsSyncing = true;
    try {
        for (const psId of linkedIds) {
            const psProject = getProjectFromStore(psId);
            if (!psProject || psProject.projectType !== 'PERSONAL_SCHEDULE') continue;

            const creatorName = getProjectCreatorName(psProject);
            const psData = (psProject.data || {}) as PersonalScheduleData;
            let events = [...(psData.events ?? [])];
            const categories = { ...(psData.categories ?? {}) };
            categories[WBS_MIRROR_CATEGORY] = categories[WBS_MIRROR_CATEGORY] ?? { label: 'WBS', color: '#10b981' };

            const activeRowIds = new Set<string>();
            const debuggingRowIds = new Set(rows.filter(isWbsDebugingCategoryRow).map((r) => r.id));

            for (const row of rows) {
                if (!shouldMirrorWbsRow(row, creatorName, psProject, wbsMembers)) continue;
                activeRowIds.add(row.id);
                const idx = events.findIndex(
                    (e) => e.wbsProjectId === wbsProjectId && e.wbsRowId === row.id,
                );
                const mirror = buildMirrorEvent(
                    row,
                    menuById.get(row.menuId),
                    wbsProjectId,
                    idx >= 0 ? events[idx].id : undefined,
                    wbsMembers,
                );
                if (idx >= 0) events[idx] = mirror;
                else events.push(mirror);
            }

            events = events.filter((e) => !(e.wbsRowId && debuggingRowIds.has(e.wbsRowId)));

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
                try {
                    await fetchWithAuth(`${API_URL}/${psId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: newData }),
                    });
                } catch {
                    // 로컬 store에는 반영됨 — 다음 동기화 시 재시도
                }
            }
        }
        lastWbsSyncAt.set(wbsProjectId, Date.now());
    } finally {
        wbsToPsSyncing = false;
    }
}

/** 개인일정 미러 이벤트 진행율 → WBS 행 역동기화 */
export async function syncPersonalProgressToWbs(
    personalProjectId: string,
    events: WbsMirrorScheduleEvent[],
): Promise<void> {
    if (psToWbsSyncing) return;

    const store = useProjectStore.getState();
    const psProject = store.projects.find((p) => p.id === personalProjectId);
    if (!psProject || psProject.projectType !== 'PERSONAL_SCHEDULE') return;

    const wbsProjectId = psProject.linkedWbsProjectId
        ?? store.projects.find(
            (p) => p.projectType === 'WBS'
                && (p.linkedPersonalScheduleProjectIds ?? []).includes(personalProjectId),
        )?.id;
    if (!wbsProjectId) return;

    const wbsProject = store.projects.find((p) => p.id === wbsProjectId);
    if (!wbsProject || wbsProject.projectType !== 'WBS') return;

    const wbsData = wbsProject.data as { menus?: WbsMenuNode[]; rows?: WbsDevRow[] };
    const rows = [...(wbsData.rows ?? [])];
    let changed = false;
    const progressPatches: Array<{ rowId: string; progress: number }> = [];

    for (const ev of events) {
        if (!ev.isWbsMirror || !ev.wbsRowId || ev.wbsProjectId !== wbsProjectId) continue;
        const idx = rows.findIndex((r) => r.id === ev.wbsRowId);
        if (idx < 0) continue;
        if (isWbsDebugingCategoryRow(rows[idx])) continue;
        const prog = Math.min(100, Math.max(0, ev.progress ?? 0));
        if (rows[idx].progress !== prog) {
            rows[idx] = { ...rows[idx], progress: prog };
            progressPatches.push({ rowId: rows[idx].id, progress: prog });
            changed = true;
        }
    }

    if (!changed) return;

    psToWbsSyncing = true;
    try {
        const newData = { ...wbsData, rows };
        if (!wbsProjectId.startsWith('local_')) {
            // WBS 전체 스냅샷을 PATCH하면 다른 사용자의 행을 덮어쓸 수 있다.
            // 개인일정에서 바뀐 진행율 행만 Yjs 서버에 반영한다.
            await Promise.all(progressPatches.map(async ({ rowId, progress }) => {
                const response = await fetchWithAuth(`${API_URL}/${wbsProjectId}/wbs/rows/${encodeURIComponent(rowId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ progress }),
                });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.message || 'WBS 진행율 동기화에 실패했습니다.');
                }
            }));
        }
        store.updateProjectData(wbsProjectId, newData);
    } finally {
        psToWbsSyncing = false;
    }
}
