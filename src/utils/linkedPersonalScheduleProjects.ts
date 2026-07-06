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
