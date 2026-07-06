import type { Project } from '../types/erd';

export function getLinkedPersonalScheduleIds(project: Project): string[] {
    return project.linkedPersonalScheduleProjectIds ?? [];
}

export function resolveLinkedPersonalScheduleProjects(
    project: Project,
    allProjects: Project[],
): Project[] {
    const ids = getLinkedPersonalScheduleIds(project);
    const byId = new Map(allProjects.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is Project => !!p);
}
