import type { WbsDetailSchedule, WbsMenuScheduleLink } from '../types/wbs';
import {
    aggregateMenuAssigneeRows,
    buildMenuPath,
    buildParentDateRollups,
    buildSchedulePatchFromAggregate,
    collectMenuAssigneeGroups,
    findScheduleCandidates,
    findStoredMenuScheduleLink,
    getSyncScopeLeaves,
    menuScheduleLinkKey,
    pruneMenuScheduleLinks,
    upsertMenuScheduleLink,
    type MenuAssigneeGroup,
} from '../utils/wbsScheduleMatch';

export interface DevScheduleSyncResult {
    matched: number;
    updated: number;
    unmatched: number;
}

const EMPTY_RESULT: DevScheduleSyncResult = { matched: 0, updated: 0, unmatched: 0 };

let devToScheduleSyncing = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** 개발 상세 저장 등 빈번한 변경 — 디바운스 후 일정 탭 3.2.x에 반영 */
export function scheduleSyncDevDetailToSchedule(wbsProjectId: string): void {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        syncTimer = null;
        void syncDevDetailToSchedule(wbsProjectId);
    }, 1000);
}

export async function syncDevDetailToSchedule(
    wbsProjectId: string,
    /** rebuildLinks: 저장된 연결을 버리고 메뉴명·경로로 다시 매칭한다 */
    options?: { force?: boolean; rebuildLinks?: boolean },
): Promise<DevScheduleSyncResult> {
    if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
    }
    if (devToScheduleSyncing && !options?.force) return EMPTY_RESULT;

    const { useWbsStore } = await import('../store/wbsStore');
    const { useWbsYjsStore } = await import('../store/wbsYjsStore');
    const wbs = useWbsStore.getState();
    if (wbs.currentProjectId !== wbsProjectId) return EMPTY_RESULT;

    const yjs = useWbsYjsStore.getState();
    const yjsReady = yjs.currentProjectId === wbsProjectId && yjs.isReady;
    // 서버 프로젝트는 Yjs 문서로만 쓰기가 반영되므로 준비되기 전에는 건너뛴다.
    if (!yjsReady && !wbsProjectId.startsWith('local_')) return EMPTY_RESULT;

    const source = yjsReady ? yjs : wbs;
    const menus = source.menus;
    const rows = source.rows;
    const detailSchedules = source.detailSchedules;
    if (detailSchedules.length === 0 || menus.length === 0) return EMPTY_RESULT;

    const latestSchedules = (): WbsDetailSchedule[] => {
        const yjsState = useWbsYjsStore.getState();
        const wbsState = useWbsStore.getState();
        return yjsState.currentProjectId === wbsProjectId && yjsState.isReady
            ? yjsState.detailSchedules
            : wbsState.detailSchedules;
    };

    const groups = collectMenuAssigneeGroups(rows);
    const menuById = new Map(menus.map((menu) => [menu.id, menu]));
    const storedLinks: WbsMenuScheduleLink[] = source.menuScheduleLinks ?? [];
    let links: WbsMenuScheduleLink[] = options?.rebuildLinks ? [] : [...storedLinks];
    let linksChanged = options?.rebuildLinks === true && storedLinks.length > 0;
    let updated = 0;
    let unmatched = 0;

    devToScheduleSyncing = true;
    try {
        // 저장된 링크를 먼저 확정한 뒤 남은 항목만 이름·경로로 매칭한다.
        const scope = getSyncScopeLeaves(detailSchedules);
        const scopeById = new Map(scope.map((item) => [item.id, item]));
        const claimedScheduleIds = new Set<string>();
        const assignments: Array<{ group: MenuAssigneeGroup; schedule: WbsDetailSchedule }> = [];
        const pending: Array<{ group: MenuAssigneeGroup; candidates: WbsDetailSchedule[] }> = [];

        for (const group of groups) {
            const menu = menuById.get(group.menuId);
            if (!menu) {
                unmatched += 1;
                continue;
            }
            const stored = findStoredMenuScheduleLink(links, group.menuId, group.assignee, group.assigneeUserId);
            const linked = stored ? scopeById.get(stored.scheduleId) : undefined;
            if (linked && !claimedScheduleIds.has(linked.id)) {
                claimedScheduleIds.add(linked.id);
                assignments.push({ group, schedule: linked });
            } else {
                pending.push({ group, candidates: [] });
            }
        }

        const unlinkedScope = scope.filter((item) => !claimedScheduleIds.has(item.id));
        for (const entry of pending) {
            entry.candidates = findScheduleCandidates(
                {
                    menu: menuById.get(entry.group.menuId)!,
                    path: buildMenuPath(entry.group.menuId, menuById),
                    assignee: entry.group.assignee,
                },
                unlinkedScope,
            );
        }
        // 후보가 적은 그룹부터 확정해야 선점 때문에 다른 그룹이 밀리는 일이 줄어든다.
        pending.sort((a, b) => a.candidates.length - b.candidates.length);

        for (const { group, candidates } of pending) {
            const schedule = candidates.find((item) => !claimedScheduleIds.has(item.id));
            if (!schedule) {
                unmatched += 1;
                continue;
            }
            claimedScheduleIds.add(schedule.id);
            assignments.push({ group, schedule });
            links = upsertMenuScheduleLink(links, {
                menuId: group.menuId,
                assignee: group.assignee,
                ...(group.assigneeUserId ? { assigneeUserId: group.assigneeUserId } : {}),
                scheduleId: schedule.id,
            });
            linksChanged = true;
        }

        for (const { group, schedule } of assignments) {
            const aggregate = aggregateMenuAssigneeRows(
                rows,
                group.menuId,
                group.assignee,
                group.assigneeUserId,
            );
            if (!aggregate) continue;

            const latest = latestSchedules().find((item) => item.id === schedule.id) ?? schedule;
            const patch = buildSchedulePatchFromAggregate(latest, aggregate);
            if (patch) {
                useWbsStore.getState().updateDetailSchedule(schedule.id, patch);
                updated += 1;
            }
        }

        for (const { id, patch } of buildParentDateRollups(latestSchedules())) {
            useWbsStore.getState().updateDetailSchedule(id, patch);
            updated += 1;
        }

        const activeKeys = new Set(
            assignments.map(({ group }) => menuScheduleLinkKey(group.menuId, group.assignee, group.assigneeUserId)),
        );
        const scopeIds = new Set(getSyncScopeLeaves(latestSchedules()).map((item) => item.id));
        const pruned = pruneMenuScheduleLinks(
            links,
            groups.filter((group) => activeKeys.has(menuScheduleLinkKey(group.menuId, group.assignee, group.assigneeUserId))),
            scopeIds,
        );
        if (JSON.stringify(pruned) !== JSON.stringify(links)) {
            links = pruned;
            linksChanged = true;
        }

        if (linksChanged) {
            useWbsStore.getState().setMenuScheduleLinks(links);
        }

        return { matched: assignments.length, updated, unmatched };
    } finally {
        devToScheduleSyncing = false;
    }
}

export function isDevToScheduleSyncing(): boolean {
    return devToScheduleSyncing;
}
