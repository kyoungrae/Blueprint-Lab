import type { WbsDevRow, WbsMenuScheduleLink } from '../types/wbs';

/** 일정과 연결된 개발상세 행은 같은 수정중 키를 사용해 화면을 가로질러 잠근다. */
export function scheduleEditingKey(scheduleId: string): string {
    return `wbs_schedule_link_${scheduleId}`;
}

export function rowEditingKey(row: WbsDevRow, links: WbsMenuScheduleLink[]): string {
    const userId = row.assigneeUserId?.trim();
    const assignee = row.assignee.trim();
    const link = links.find((item) => (
        item.menuId === row.menuId
        && (
            (userId && item.assigneeUserId === userId)
            || item.assignee.trim() === assignee
        )
    ));
    return link ? scheduleEditingKey(link.scheduleId) : `wbs_row_${row.id}`;
}
