import type { ScheduleStatus, WbsDevRow } from '../types/wbs';
import { normalizeYmd } from '../components/wbs/wbsDateUtils';
import { isWbsDebugingCategoryRow } from '../types/wbs';
import { isDevToScheduleSyncing, resolveDevScheduleAssignments } from './wbsDevScheduleSync';

export interface ScheduleDevSyncResult {
    matched: number;
    updatedRows: number;
}

const EMPTY_RESULT: ScheduleDevSyncResult = { matched: 0, updatedRows: 0 };

let scheduleToDevSyncing = false;
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 일정에서 연속으로 시작일·종료일을 바꿔도 마지막 값 한 번만 개발상세로 반영한다. */
export function scheduleSyncScheduleToDevDetail(wbsProjectId: string, scheduleId: string): void {
    const key = `${wbsProjectId}:${scheduleId}`;
    const existing = syncTimers.get(key);
    if (existing) clearTimeout(existing);
    syncTimers.set(key, setTimeout(() => {
        syncTimers.delete(key);
        void syncScheduleToDevDetail(wbsProjectId, scheduleId);
    }, 100));
}

function toDevDate(value: string | undefined): string {
    const normalized = normalizeYmd(value ?? '');
    return normalized || String(value ?? '').trim();
}

function matchesGroup(row: WbsDevRow, group: { menuId: string; assignee: string; assigneeUserId?: string }): boolean {
    if (row.menuId !== group.menuId || isWbsDebugingCategoryRow(row)) return false;
    const groupUserId = group.assigneeUserId?.trim();
    if (groupUserId && row.assigneeUserId?.trim() === groupUserId) return true;
    return row.assignee.trim() === group.assignee.trim();
}

function statusPatch(
    scheduleStatus: ScheduleStatus | undefined,
    scheduleProgress: number | undefined,
    row: WbsDevRow,
): Partial<Pick<WbsDevRow, 'status' | 'progress'>> {
    if (!scheduleStatus) return {};

    switch (scheduleStatus) {
        case '보류':
            return row.status === 'HOLD' ? {} : { status: 'HOLD' };
        case '완료':
            return row.status === 'DONE' && row.progress === 100 ? {} : { status: 'DONE', progress: 100 };
        case '대기':
            return row.status === 'TODO' && row.progress === 0 ? {} : { status: 'TODO', progress: 0 };
        case '진행중': {
            const numeric = typeof scheduleProgress === 'number' && Number.isFinite(scheduleProgress)
                ? Math.round(scheduleProgress)
                : row.progress;
            const progress = Math.min(99, Math.max(1, numeric || 1));
            return row.status === 'IN_PROGRESS' && row.progress === progress
                ? {}
                : { status: 'IN_PROGRESS', progress };
        }
    }
}

/**
 * 연결된 일정(3.2.x)을 수정하면 메뉴·담당자 그룹의 개발상세 행으로 날짜·상태를 되돌린다.
 * 개발상세→일정 동기화 중에 호출될 때는 반대 방향으로 되돌아가는 순환을 막는다.
 */
export async function syncScheduleToDevDetail(
    wbsProjectId: string,
    scheduleId: string,
): Promise<ScheduleDevSyncResult> {
    if (scheduleToDevSyncing || isDevToScheduleSyncing()) return EMPTY_RESULT;

    const [{ useWbsStore }, { useWbsYjsStore }] = await Promise.all([
        import('../store/wbsStore'),
        import('../store/wbsYjsStore'),
    ]);
    const wbs = useWbsStore.getState();
    if (wbs.currentProjectId !== wbsProjectId) return EMPTY_RESULT;

    const yjs = useWbsYjsStore.getState();
    const yjsReady = yjs.currentProjectId === wbsProjectId && yjs.isReady;
    if (!yjsReady && !wbsProjectId.startsWith('local_')) return EMPTY_RESULT;

    const source = yjsReady ? yjs : wbs;
    const schedule = source.detailSchedules.find((item) => item.id === scheduleId);
    if (!schedule) return EMPTY_RESULT;

    const resolved = resolveDevScheduleAssignments(
        source.menus,
        source.rows,
        source.detailSchedules,
        source.menuScheduleLinks ?? [],
    );
    if (resolved.linksChanged) useWbsStore.getState().setMenuScheduleLinks(resolved.links);

    const assignments = resolved.assignments.filter((item) => item.schedule.id === scheduleId);
    if (assignments.length === 0) return EMPTY_RESULT;

    scheduleToDevSyncing = true;
    try {
        let updatedRows = 0;
        const latestRows = () => {
            const latestYjs = useWbsYjsStore.getState();
            return latestYjs.currentProjectId === wbsProjectId && latestYjs.isReady
                ? latestYjs.rows
                : useWbsStore.getState().rows;
        };

        for (const assignment of assignments) {
            const matchingRows = latestRows().filter((item) => matchesGroup(item, assignment.group));
            // 일정 연결은 레거시상 메뉴·담당자 단위다. 같은 그룹에 기능 행이 여러 개면
            // 일정의 집계값을 어느 한 행의 원본값으로 볼 수 없으므로 개발상세에 역반영하지 않는다.
            // 각 기능·Debugging 행의 상태와 진행률은 독립적으로 유지한다.
            if (matchingRows.length !== 1) continue;

            const row = matchingRows[0];
            const patch: Partial<Omit<WbsDevRow, 'id' | 'menuId'>> = {};
            const startDate = toDevDate(schedule.startDate);
            const endDate = toDevDate(schedule.endDate);
            const actualStartDate = toDevDate(schedule.actualStartDate);
            const actualEndDate = toDevDate(schedule.actualEndDate);

            if (row.startDate !== startDate) patch.startDate = startDate;
            if (row.endDate !== endDate) patch.endDate = endDate;
            if ((row.actualStartDate ?? '') !== actualStartDate) patch.actualStartDate = actualStartDate;
            if ((row.actualEndDate ?? '') !== actualEndDate) patch.actualEndDate = actualEndDate;
            Object.assign(patch, statusPatch(schedule.status, schedule.progress, row));

            if (Object.keys(patch).length === 0) continue;
            useWbsStore.getState().updateRow(row.id, patch);
            updatedRows += 1;
        }

        return { matched: assignments.length, updatedRows };
    } finally {
        scheduleToDevSyncing = false;
    }
}

export function isScheduleToDevSyncing(): boolean {
    return scheduleToDevSyncing;
}
