import type { Project, ProjectMember } from '../types/erd';
import type { WbsDevRow } from '../types/wbs';

/** Mongo ObjectId / populate 객체 → 문자열 ID */
export function normalizeUserId(id: unknown): string {
    if (id == null || id === '') return '';
    if (typeof id === 'object' && id !== null && '_id' in id) {
        return String((id as { _id: unknown })._id);
    }
    return String(id).trim();
}

/** 개인일정 프로젝트 OWNER 사용자 ID */
export function getPersonalScheduleOwnerId(project: Project): string | undefined {
    const owner = project.members?.find((m) => m.role === 'OWNER');
    const id = normalizeUserId(owner?.id);
    return id || undefined;
}

/** 담당자 표시명으로 WBS 프로젝트 멤버 userId 조회 */
export function resolveAssigneeUserId(assignee: string, members: ProjectMember[]): string | undefined {
    const name = assignee.trim();
    if (!name) return undefined;
    const exact = members.find((m) => m.name.trim() === name);
    if (exact) return exact.id;
    return members.find((m) => m.name.trim().toLowerCase() === name.toLowerCase())?.id;
}

/** WBS 행의 담당자 userId (저장값 또는 이름으로 역추적) */
export function getRowAssigneeUserId(row: WbsDevRow, wbsMembers: ProjectMember[] = []): string | undefined {
    const stored = row.assigneeUserId?.trim();
    if (stored) return stored;
    return resolveAssigneeUserId(row.assignee ?? '', wbsMembers);
}

/** 담당자 표시명 (없으면 userId로 멤버에서 조회) */
export function getRowAssigneeDisplayName(row: WbsDevRow, members: ProjectMember[] = []): string {
    const name = row.assignee?.trim();
    if (name) return name;
    const userId = row.assigneeUserId?.trim();
    if (!userId) return '';
    return members.find((m) => m.id === userId)?.name?.trim() || '';
}

/** WBS 행 담당자 ↔ 개인일정 OWNER 일치 (userId 우선, 불일치·미설정 시 이름 fallback) */
export function rowMatchesPersonalScheduleOwner(
    row: WbsDevRow,
    psProject: Project,
    wbsMembers: ProjectMember[] = [],
): boolean {
    const owner = psProject.members?.find((m) => m.role === 'OWNER');
    const ownerId = normalizeUserId(owner?.id);
    const rowUserId = normalizeUserId(getRowAssigneeUserId(row, wbsMembers));
    const assignee = getRowAssigneeDisplayName(row, wbsMembers).trim();
    const ownerName = owner?.name?.trim() ?? '';
    const author = psProject.author?.trim() ?? '';

    if (ownerId && rowUserId && ownerId === rowUserId) return true;

    if (!assignee) return false;
    if (ownerName && assignee === ownerName) return true;
    if (author && assignee === author) return true;

    // 연결된 개인일정 프로젝트명에 담당자명 포함 (예: "이경태 개인일정")
    if (assignee.length >= 2 && psProject.name?.includes(assignee)) return true;

    return false;
}

/** 기존 행에 assigneeUserId가 없으면 WBS 멤버 이름으로 보강 */
export function enrichRowsWithAssigneeUserIds(
    rows: WbsDevRow[],
    members: ProjectMember[],
): WbsDevRow[] {
    if (members.length === 0) return rows;
    let changed = false;
    const next = rows.map((row) => {
        if (row.assigneeUserId?.trim()) return row;
        const id = resolveAssigneeUserId(row.assignee ?? '', members);
        if (!id) return row;
        changed = true;
        return { ...row, assigneeUserId: id };
    });
    return changed ? next : rows;
}
