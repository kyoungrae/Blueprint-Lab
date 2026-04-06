import type { Entity, ERDState, Project } from '../types/erd';

/** 프로젝트에 연결된 ERD id 목록 (다중 연결 + 단일 필드 하위 호환) */
export function getLinkedErdProjectIds(project: Project | undefined | null): string[] {
    if (!project) return [];
    if (project.linkedErdProjectIds?.length) return project.linkedErdProjectIds;
    return project.linkedErdProjectId ? [project.linkedErdProjectId] : [];
}

/** 현재 프로젝트에 연결된 ERD 프로젝트 문서 목록 */
export function resolveLinkedErdProjects(allProjects: Project[], project: Project | undefined | null): Project[] {
    const ids = getLinkedErdProjectIds(project);
    if (ids.length === 0) return [];
    return allProjects.filter((p) => ids.includes(p.id));
}

function entitiesFromProject(erdProj: Project): Entity[] {
    const data = erdProj?.data as ERDState | undefined;
    return data?.entities ?? [];
}

/** 연결된 ERD 전체에서 테이블 물리명(엔티티 name) 목록 — 중복 제거 후 정렬 */
export function collectErdTableNames(linkedErdProjects: Project[]): string[] {
    const names = new Set<string>();
    linkedErdProjects.forEach((erdProj) => {
        entitiesFromProject(erdProj).forEach((e) => names.add(e.name));
    });
    return Array.from(names).sort();
}

/** 물리명으로 엔티티 검색 (여러 ERD 중 먼저 매칭된 것) */
export function findErdEntityByPhysicalName(
    linkedErdProjects: Project[],
    physicalName: string,
): { entity: Entity; projectId: string } | null {
    const trimmed = physicalName.trim();
    if (!trimmed) return null;
    const upper = trimmed.toUpperCase();
    for (const erdProj of linkedErdProjects) {
        const entity = entitiesFromProject(erdProj).find(
            (e) => e.name === trimmed || (e.name && e.name.toUpperCase() === upper),
        );
        if (entity) return { entity, projectId: erdProj.id };
    }
    return null;
}

/** 테이블 물리명에 대응하는 한글(코멘트)명 — 연결된 ERD 전체 검색 */
export function getErdTableKoreanName(linkedErdProjects: Project[], tableNameEn: string): string {
    const found = findErdEntityByPhysicalName(linkedErdProjects, tableNameEn);
    const ko = found?.entity.comment?.trim();
    return ko ?? '';
}
