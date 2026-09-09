import {
    isWbsDebugingCategoryRow,
    type WbsDetailSchedule,
    type WbsDevRow,
    type WbsMenuNode,
    type WbsMenuScheduleLink,
} from '../types/wbs';
import {
    buildMenuPath,
    buildParentDateRollups,
    buildSchedulePatchFromRow,
    findFeatureScheduleCandidates,
    findStoredMenuScheduleLink,
    findStoredRowScheduleLink,
    getSyncScopeLeaves,
    menuScheduleLinkKey,
    pruneMenuScheduleLinks,
    upsertRowScheduleLink,
} from '../utils/wbsScheduleMatch';

export interface DevScheduleSyncResult {
    matched: number;
    updated: number;
    unmatched: number;
}

/** 개발상세 기능 행과 시스템 개발 일정(3.2.x) 간 확정 연결. */
export interface DevScheduleAssignment {
    row: WbsDevRow;
    schedule: WbsDetailSchedule;
}

/**
 * 저장된 행별 연결을 우선 사용하고, 없는 경우에만 기능명·메뉴 경로·담당자로 안전하게 후보를 좁힌다.
 * 양방향 동기화가 동일한 연결 규칙을 쓰도록 이 함수로 통합한다.
 */
export function resolveDevScheduleAssignments(
    menus: WbsMenuNode[],
    rows: WbsDevRow[],
    detailSchedules: WbsDetailSchedule[],
    storedLinks: WbsMenuScheduleLink[],
    options?: { rebuildLinks?: boolean },
): {
    assignments: DevScheduleAssignment[];
    links: WbsMenuScheduleLink[];
    linksChanged: boolean;
    unmatched: number;
} {
    const syncRows = rows.filter((row) => !isWbsDebugingCategoryRow(row));
    const rowCountByLegacyGroup = new Map<string, number>();
    for (const row of syncRows) {
        const key = menuScheduleLinkKey(row.menuId, row.assignee.trim(), row.assigneeUserId?.trim());
        rowCountByLegacyGroup.set(key, (rowCountByLegacyGroup.get(key) ?? 0) + 1);
    }
    const menuById = new Map(menus.map((menu) => [menu.id, menu]));
    let links: WbsMenuScheduleLink[] = options?.rebuildLinks ? [] : [...storedLinks];
    let linksChanged = options?.rebuildLinks === true && storedLinks.length > 0;
    let unmatched = 0;

    const scope = getSyncScopeLeaves(detailSchedules);
    const scopeById = new Map(scope.map((item) => [item.id, item]));
    const claimedScheduleIds = new Set<string>();
    const assignments: DevScheduleAssignment[] = [];
    const pending: Array<{ row: WbsDevRow; candidates: WbsDetailSchedule[] }> = [];

    for (const row of syncRows) {
        const menu = menuById.get(row.menuId);
        if (!menu) {
            unmatched += 1;
            continue;
        }
        const stored = findStoredRowScheduleLink(links, row.id);
        const linked = stored ? scopeById.get(stored.scheduleId) : undefined;
        if (linked && !claimedScheduleIds.has(linked.id)) {
            claimedScheduleIds.add(linked.id);
            assignments.push({ row, schedule: linked });
            continue;
        }

        // 이전 버전은 메뉴+담당자 한 묶음에 일정 하나만 연결했다. 그 묶음에 기능 행이
        // 하나뿐일 때만 안전하게 행별 연결로 승격한다. 둘 이상이면 절대 공유하지 않는다.
        const legacyKey = menuScheduleLinkKey(row.menuId, row.assignee.trim(), row.assigneeUserId?.trim());
        const legacy = rowCountByLegacyGroup.get(legacyKey) === 1
            ? findStoredMenuScheduleLink(links, row.menuId, row.assignee, row.assigneeUserId)
            : undefined;
        const legacySchedule = legacy ? scopeById.get(legacy.scheduleId) : undefined;
        if (legacySchedule && !claimedScheduleIds.has(legacySchedule.id)) {
            claimedScheduleIds.add(legacySchedule.id);
            assignments.push({ row, schedule: legacySchedule });
            links = upsertRowScheduleLink(links, {
                rowId: row.id,
                menuId: row.menuId,
                assignee: row.assignee.trim(),
                ...(row.assigneeUserId?.trim() ? { assigneeUserId: row.assigneeUserId.trim() } : {}),
                scheduleId: legacySchedule.id,
            });
            linksChanged = true;
            continue;
        }

        pending.push({ row, candidates: [] });
    }

    const unlinkedScope = scope.filter((item) => !claimedScheduleIds.has(item.id));
    for (const entry of pending) {
        entry.candidates = findFeatureScheduleCandidates(
            entry.row,
            menuById.get(entry.row.menuId)!,
            buildMenuPath(entry.row.menuId, menuById),
            unlinkedScope,
        );
    }
    // 후보가 적은 기능 행부터 확정해야 선점 때문에 다른 행이 밀리는 일이 줄어든다.
    pending.sort((a, b) => a.candidates.length - b.candidates.length);

    for (const { row, candidates } of pending) {
        const schedule = candidates.find((item) => !claimedScheduleIds.has(item.id));
        if (!schedule) {
            unmatched += 1;
            continue;
        }
        claimedScheduleIds.add(schedule.id);
        assignments.push({ row, schedule });
        links = upsertRowScheduleLink(links, {
            rowId: row.id,
            menuId: row.menuId,
            assignee: row.assignee.trim(),
            ...(row.assigneeUserId?.trim() ? { assigneeUserId: row.assigneeUserId.trim() } : {}),
            scheduleId: schedule.id,
        });
        linksChanged = true;
    }

    return { assignments, links, linksChanged, unmatched };
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
    /** rebuildLinks: 저장된 연결을 버리고 기능명·메뉴 경로로 다시 매칭한다 */
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

    const storedLinks: WbsMenuScheduleLink[] = source.menuScheduleLinks ?? [];
    let updated = 0;

    devToScheduleSyncing = true;
    try {
        const resolved = resolveDevScheduleAssignments(menus, rows, detailSchedules, storedLinks, options);
        const { assignments, unmatched } = resolved;
        let { links, linksChanged } = resolved;

        for (const { row, schedule } of assignments) {
            const latest = latestSchedules().find((item) => item.id === schedule.id) ?? schedule;
            const patch = buildSchedulePatchFromRow(latest, row);
            if (patch) {
                useWbsStore.getState().updateDetailSchedule(schedule.id, patch);
                updated += 1;
            }
        }

        for (const { id, patch } of buildParentDateRollups(latestSchedules())) {
            useWbsStore.getState().updateDetailSchedule(id, patch);
            updated += 1;
        }

        const scopeIds = new Set(getSyncScopeLeaves(latestSchedules()).map((item) => item.id));
        const pruned = pruneMenuScheduleLinks(
            links,
            rows,
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
