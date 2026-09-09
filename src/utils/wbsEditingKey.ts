import type { WbsDevRow, WbsMenuScheduleLink } from '../types/wbs';

/** 일정과 연결된 개발상세 행은 같은 수정중 키를 사용해 화면을 가로질러 잠근다. */
export function scheduleEditingKey(scheduleId: string): string {
    return `wbs_schedule_link_${scheduleId}`;
}

export function rowEditingKey(row: WbsDevRow, links: WbsMenuScheduleLink[]): string {
    // 메뉴 코드·담당자가 같아도 기능 행은 서로 다른 일정과 연결된다.
    // rowId 없는 이전 연결은 공유 잠금으로 사용하지 않아 기능 행끼리 편집이 막히지 않게 한다.
    const link = links.find((item) => item.rowId === row.id);
    return link ? scheduleEditingKey(link.scheduleId) : `wbs_row_${row.id}`;
}
