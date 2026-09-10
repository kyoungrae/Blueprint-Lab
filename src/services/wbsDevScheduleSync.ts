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
    getSyncScopeLeaves,
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

export type DevScheduleLinkPreviewStatus =
    | 'linked'
    | 'candidate'
    | 'ambiguous'
    | 'unmatched'
    | 'broken';

export interface DevScheduleLinkPreviewItem {
    rowId: string;
    menuName: string;
    featureName: string;
    assignee: string;
    status: DevScheduleLinkPreviewStatus;
    scheduleId?: string;
    scheduleCode?: string;
    scheduleTitle?: string;
    candidates: Array<Pick<WbsDetailSchedule, 'id' | 'scheduleCode' | 'title'>>;
}

export interface DevScheduleLinkPreview {
    items: DevScheduleLinkPreviewItem[];
    availableSchedules: Array<Pick<WbsDetailSchedule, 'id' | 'scheduleCode' | 'title' | 'worker'>>;
    proposedLinks: WbsMenuScheduleLink[];
    nextLinks: WbsMenuScheduleLink[];
    counts: Record<DevScheduleLinkPreviewStatus, number>;
}

/**
 * 실제 양방향 동기화는 저장된 rowId ↔ scheduleId 키만 사용한다.
 * 문자열 비교는 buildDevScheduleLinkPreview의 최초 연결 후보 생성에서만 수행한다.
 */
export function resolveDevScheduleAssignments(
    _menus: WbsMenuNode[],
    rows: WbsDevRow[],
    detailSchedules: WbsDetailSchedule[],
    storedLinks: WbsMenuScheduleLink[],
): {
    assignments: DevScheduleAssignment[];
    links: WbsMenuScheduleLink[];
    linksChanged: boolean;
    unmatched: number;
} {
    const syncRows = rows.filter((row) => !isWbsDebugingCategoryRow(row));
    const rowById = new Map(syncRows.map((row) => [row.id, row]));
    const scope = getSyncScopeLeaves(detailSchedules);
    const scopeById = new Map(scope.map((item) => [item.id, item]));
    const keyedLinks = storedLinks.filter((link): link is WbsMenuScheduleLink & { rowId: string } => Boolean(link.rowId));
    const rowLinkCounts = new Map<string, number>();
    const scheduleLinkCounts = new Map<string, number>();
    for (const link of keyedLinks) {
        rowLinkCounts.set(link.rowId, (rowLinkCounts.get(link.rowId) ?? 0) + 1);
        scheduleLinkCounts.set(link.scheduleId, (scheduleLinkCounts.get(link.scheduleId) ?? 0) + 1);
    }

    const assignments: DevScheduleAssignment[] = [];
    for (const link of keyedLinks) {
        // 중복 키는 임의로 하나를 선택하지 않는다. 연결 관리 화면에서 충돌로 표시한다.
        if (rowLinkCounts.get(link.rowId) !== 1 || scheduleLinkCounts.get(link.scheduleId) !== 1) continue;
        const row = rowById.get(link.rowId);
        const schedule = scopeById.get(link.scheduleId);
        if (row && schedule) assignments.push({ row, schedule });
    }

    return {
        assignments,
        links: storedLinks,
        linksChanged: false,
        unmatched: syncRows.length - assignments.length,
    };
}

/**
 * 현재 업무 데이터는 변경하지 않고 최초 rowId ↔ scheduleId 연결 후보만 계산한다.
 * 자동 제안은 행과 일정 양쪽에서 모두 유일한 1:1 후보에 한정한다.
 */
export function buildDevScheduleLinkPreview(
    menus: WbsMenuNode[],
    rows: WbsDevRow[],
    detailSchedules: WbsDetailSchedule[],
    storedLinks: WbsMenuScheduleLink[],
): DevScheduleLinkPreview {
    const syncRows = rows.filter((row) => !isWbsDebugingCategoryRow(row));
    const menuById = new Map(menus.map((menu) => [menu.id, menu]));
    const scope = getSyncScopeLeaves(detailSchedules);
    const scopeById = new Map(scope.map((item) => [item.id, item]));
    const keyedLinks = storedLinks.filter((link): link is WbsMenuScheduleLink & { rowId: string } => Boolean(link.rowId));
    const rowLinkCounts = new Map<string, number>();
    const scheduleLinkCounts = new Map<string, number>();
    for (const link of keyedLinks) {
        rowLinkCounts.set(link.rowId, (rowLinkCounts.get(link.rowId) ?? 0) + 1);
        scheduleLinkCounts.set(link.scheduleId, (scheduleLinkCounts.get(link.scheduleId) ?? 0) + 1);
    }

    const claimedScheduleIds = new Set<string>();
    const itemsByRowId = new Map<string, DevScheduleLinkPreviewItem>();
    const pending: Array<{ row: WbsDevRow; menu: WbsMenuNode; candidates: WbsDetailSchedule[] }> = [];

    for (const row of syncRows) {
        const menu = menuById.get(row.menuId);
        const stored = keyedLinks.find((link) => link.rowId === row.id);
        if (stored) {
            const schedule = scopeById.get(stored.scheduleId);
            const valid = Boolean(
                schedule
                && rowLinkCounts.get(row.id) === 1
                && scheduleLinkCounts.get(stored.scheduleId) === 1
            );
            if (valid && schedule) claimedScheduleIds.add(schedule.id);
            itemsByRowId.set(row.id, {
                rowId: row.id,
                menuName: menu?.name ?? '',
                featureName: row.featureName,
                assignee: row.assignee,
                status: valid ? 'linked' : 'broken',
                ...(schedule ? {
                    scheduleId: schedule.id,
                    scheduleCode: schedule.scheduleCode,
                    scheduleTitle: schedule.title,
                } : {}),
                candidates: [],
            });
            continue;
        }
        if (!menu) {
            itemsByRowId.set(row.id, {
                rowId: row.id,
                menuName: '',
                featureName: row.featureName,
                assignee: row.assignee,
                status: 'unmatched',
                candidates: [],
            });
            continue;
        }
        pending.push({ row, menu, candidates: [] });
    }

    const availableScope = scope.filter((schedule) => !claimedScheduleIds.has(schedule.id));
    for (const entry of pending) {
        entry.candidates = findFeatureScheduleCandidates(
            entry.row,
            entry.menu,
            buildMenuPath(entry.row.menuId, menuById),
            availableScope,
        );
    }

    const candidateOwners = new Map<string, Set<string>>();
    for (const entry of pending) {
        for (const candidate of entry.candidates) {
            if (!candidateOwners.has(candidate.id)) candidateOwners.set(candidate.id, new Set());
            candidateOwners.get(candidate.id)!.add(entry.row.id);
        }
    }

    const proposedLinks: WbsMenuScheduleLink[] = [];
    for (const { row, menu, candidates } of pending) {
        const sole = candidates.length === 1 ? candidates[0] : undefined;
        const isUniquePair = Boolean(sole && candidateOwners.get(sole.id)?.size === 1);
        const status: DevScheduleLinkPreviewStatus = isUniquePair
            ? 'candidate'
            : candidates.length > 0 ? 'ambiguous' : 'unmatched';
        if (isUniquePair && sole) {
            proposedLinks.push({
                rowId: row.id,
                menuId: row.menuId,
                assignee: row.assignee.trim(),
                ...(row.assigneeUserId?.trim() ? { assigneeUserId: row.assigneeUserId.trim() } : {}),
                scheduleId: sole.id,
            });
        }
        itemsByRowId.set(row.id, {
            rowId: row.id,
            menuName: menu.name,
            featureName: row.featureName,
            assignee: row.assignee,
            status,
            ...(isUniquePair && sole ? {
                scheduleId: sole.id,
                scheduleCode: sole.scheduleCode,
                scheduleTitle: sole.title,
            } : {}),
            candidates: candidates.map(({ id, scheduleCode, title }) => ({ id, scheduleCode, title })),
        });
    }

    const items = syncRows.map((row) => itemsByRowId.get(row.id)!).filter(Boolean);
    const counts: Record<DevScheduleLinkPreviewStatus, number> = {
        linked: 0,
        candidate: 0,
        ambiguous: 0,
        unmatched: 0,
        broken: 0,
    };
    items.forEach((item) => { counts[item.status] += 1; });

    return {
        items,
        availableSchedules: scope.map(({ id, scheduleCode, title, worker }) => ({ id, scheduleCode, title, worker })),
        proposedLinks,
        // 기존 연결은 삭제·변경하지 않고 새로 확정된 rowId 연결만 추가한다.
        nextLinks: [...storedLinks, ...proposedLinks],
        counts,
    };
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
    options?: { force?: boolean },
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
        const resolved = resolveDevScheduleAssignments(menus, rows, detailSchedules, storedLinks);
        const { assignments, unmatched } = resolved;

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

        return { matched: assignments.length, updated, unmatched };
    } finally {
        devToScheduleSyncing = false;
    }
}

export function isDevToScheduleSyncing(): boolean {
    return devToScheduleSyncing;
}
