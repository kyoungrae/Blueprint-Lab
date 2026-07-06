// WBS(Work Breakdown Structure) · 일정 관리 프로젝트 타입 정의

/** 개발 진행 상태 */
export type WbsStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'HOLD';

export const WBS_STATUS_LABEL: Record<WbsStatus, string> = {
    TODO: '대기',
    IN_PROGRESS: '진행중',
    DONE: '완료',
    HOLD: '보류',
};

export const WBS_STATUS_ORDER: WbsStatus[] = ['TODO', 'IN_PROGRESS', 'DONE', 'HOLD'];

/** 메뉴 구조도(Hierarchy)의 노드. parentId로 트리를 구성한다. */
export interface WbsMenuNode {
    id: string;
    parentId: string | null;
    /** 메뉴명 */
    name: string;
    /** 고유 메뉴 코드(개발 상세의 기본 정보 자동 세팅 기준) */
    menuCode: string;
    /** 메뉴 프로그램 ID (화면/프로그램 식별자) */
    programId?: string;
    /** 형제 간 정렬 순서 */
    order: number;
}

/** 개발 상세 그리드의 한 행. menuId로 메뉴와 연결된다. */
export interface WbsDevRow {
    id: string;
    menuId: string;
    /** 산출물 구분 (Controller / Service / VO / 기능 등) */
    category: string;
    /** 기능명 */
    featureName: string;
    /** 담당자 */
    assignee: string;
    /** 담당자 사용자 ID (WBS 프로젝트 members[].id, 개인일정 OWNER와 매칭) */
    assigneeUserId?: string;
    /** 기간 시작 (YYYY-MM-DD) */
    startDate: string;
    /** 기간 종료 (YYYY-MM-DD) */
    endDate: string;
    status: WbsStatus;
    /** 진행율 0~100 */
    progress: number;
    note?: string;
    /** Debugging 전용 행 여부 */
    isDebugging?: boolean;
}

export interface WbsProjectSchedule {
    startDate: string;
    endDate: string;
}

export type ScheduleStatus = '완료' | '진행중' | '대기';

export interface WbsDetailSchedule {
    id: string;
    /** 부모 항목 ID (null이면 최상위) */
    parentId?: string | null;
    /** 형제 간 정렬 순서 */
    order?: number;
    title: string;
    /** 계획 시작일 (YYYY.MM.DD) — 간트차트 기준 */
    startDate: string;
    /** 계획 종료일 (YYYY.MM.DD) — 간트차트 기준 */
    endDate: string;
    /** 진행율 0~100 */
    progress?: number;
    // ── 일정 상세 테이블 전용 ──────────────────────────
    worker?: string;               // 작업자
    deliverable?: string;          // 산출물명
    completionCriteria?: string;   // 완료기준
    status?: ScheduleStatus;       // 상태
    actualStartDate?: string;      // 실적 시작일
    actualEndDate?: string;        // 실적 종료일
}

export interface WbsData {
    menus: WbsMenuNode[];
    rows: WbsDevRow[];
    projectSchedule?: WbsProjectSchedule;
    detailSchedules?: WbsDetailSchedule[];
}

export const WBS_DEFAULT_CATEGORIES = ['Controller', 'Service', 'ServiceImpl', 'VO', 'Mapper', 'Html','Debuging', '기능','직접입력'];

/** 개발 상세 구분(산출물) — Debuging */
export const WBS_DEBUGING_CATEGORY = 'Debuging';

/** 구분(산출물)이 Debuging인 행 — 개인일정 캘린더 미러 제외 대상 */
export function isWbsDebugingCategoryRow(row: Pick<WbsDevRow, 'category' | 'isDebugging'>): boolean {
    return row.category === WBS_DEBUGING_CATEGORY || !!row.isDebugging;
}
