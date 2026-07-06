import type { Project } from '../types/erd';

export function getLinkedPersonalScheduleIds(project: Project, allProjects?: Project[]): string[] {
    const direct = project.linkedPersonalScheduleProjectIds ?? [];
    if (direct.length > 0) return direct;
    if (!allProjects || project.projectType !== 'WBS') return direct;
    return allProjects
        .filter((p) => p.projectType === 'PERSONAL_SCHEDULE' && p.linkedWbsProjectId === project.id)
        .map((p) => p.id);
}

export function resolveLinkedWbsProjectId(
    personalProject: Project,
    allProjects?: Project[],
): string | undefined {
    if (personalProject.linkedWbsProjectId) return personalProject.linkedWbsProjectId;
    if (!allProjects || personalProject.projectType !== 'PERSONAL_SCHEDULE') return undefined;
    return allProjects.find(
        (p) => p.projectType === 'WBS'
            && (p.linkedPersonalScheduleProjectIds ?? []).includes(personalProject.id),
    )?.id;
}

export function resolveLinkedPersonalScheduleProjects(
    project: Project,
    allProjects: Project[],
): Project[] {
    const ids = getLinkedPersonalScheduleIds(project, allProjects);
    const byId = new Map(allProjects.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is Project => !!p);
}

/** 개인일정 OWNER 표시명 (툴팁용) */
export function getPersonalScheduleOwnerLabel(project: Project): string {
    const owner = project.members?.find((m) => m.role === 'OWNER');
    return owner?.name?.trim() || project.author?.trim() || project.name;
}

/** WBS에 연결된 개인일정 툴팁 — 접근 가능한 프로젝트는 이름, 그 외는 멤버 일정으로 표시 */
export function getWbsLinkedPsTooltipLines(wbsProject: Project, allProjects: Project[]): string[] {
    const ids = getLinkedPersonalScheduleIds(wbsProject, allProjects);
    const byId = new Map(allProjects.map((p) => [p.id, p]));
    return ids.map((id) => {
        const ps = byId.get(id);
        if (ps) {
            const owner = getPersonalScheduleOwnerLabel(ps);
            return owner === ps.name ? owner : `${owner} · ${ps.name}`;
        }
        return '다른 멤버 개인일정';
    });
}

/** 화면에 카드가 있는 연결만 (연결선·그룹핑용) */
export function getVisibleWbsPersonalScheduleLinks(
    allProjects: Project[],
): { fromId: string; toId: string }[] {
    const links: { fromId: string; toId: string }[] = [];
    for (const p of allProjects) {
        if (p.projectType !== 'WBS') continue;
        for (const ps of resolveLinkedPersonalScheduleProjects(p, allProjects)) {
            links.push({ fromId: p.id, toId: ps.id });
        }
    }
    return links;
}

/** 현재 사용자 소유 개인일정이 WBS에 연결됐는지 */
export function userOwnsLinkedPersonalSchedule(
    wbsProject: Project,
    allProjects: Project[],
    userId?: string,
): boolean {
    if (!userId) return false;
    return resolveLinkedPersonalScheduleProjects(wbsProject, allProjects).some((ps) =>
        isPersonalScheduleOwnedByUser(ps, userId),
    );
}

export function isPersonalScheduleOwnedByUser(project: Project, userId?: string): boolean {
    if (!userId || project.projectType !== 'PERSONAL_SCHEDULE') return false;
    const owner = project.members?.find((m) => m.role === 'OWNER');
    return owner?.id === userId;
}

export function getPersonalScheduleProjectsOwnedByUser(allProjects: Project[], userId?: string): Project[] {
    if (!userId) return [];
    return allProjects.filter((p) => isPersonalScheduleOwnedByUser(p, userId));
}

export function isWbsProjectMember(wbsProject: Project, userId?: string): boolean {
    if (!userId) return false;
    return (wbsProject.members ?? []).some((m) => m.id === userId);
}

/** WBS 멤버면 개인일정 연결 UI 열기 가능 (본인 일정 생성 후 연결) */
export function canOpenWbsPersonalScheduleLink(
    wbsProject: Project,
    _allProjects: Project[],
    userId?: string,
): boolean {
    if (wbsProject.projectType !== 'WBS' || !userId) return false;
    return isWbsProjectMember(wbsProject, userId);
}
