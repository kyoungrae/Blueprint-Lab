import type { Project } from '../types/erd';

function mergeBugReports(server: any[], local: any[]) {
    const localById = new Map((local || []).map((b: any) => [b.id, b]));
    return (server || []).map((b: any) => {
        const lb = localById.get(b.id);
        if (!lb) return b;
        const serverReplies = b.replies;
        const localReplies = lb.replies;
        const replies = (Array.isArray(serverReplies) && serverReplies.length > 0)
            ? serverReplies
            : (Array.isArray(localReplies) ? localReplies : undefined);
        return { ...lb, ...b, replies };
    });
}

/** 서버 프로젝트 응답(목록·단건) → 프론트 Project 형식 */
export function mapServerProjectResponse(p: any, localProject?: Project | null): Project {
    const pt = p.projectType || 'ERD';
    let projData: any;

    if (pt === 'COMPONENT') {
        if (localProject?.data && (localProject.data as any).components) {
            projData = localProject.data;
        } else if (p.data && (p.data as any).components) {
            projData = p.data;
        } else if (p.componentSnapshot) {
            projData = {
                components: p.componentSnapshot.components || [],
                flows: p.componentSnapshot.flows || [],
            };
        } else {
            projData = { components: [], flows: [] };
        }
    } else if (pt === 'SCREEN_DESIGN') {
        const serverTs = new Date(p.updatedAt || 0).getTime();
        const localTs = new Date(localProject?.updatedAt || 0).getTime();
        const serverScreens = (p.data as any)?.screens ?? (p.screenSnapshot as any)?.screens ?? [];
        const serverFlows = (p.data as any)?.flows ?? (p.screenSnapshot as any)?.flows ?? [];
        const serverSections = (p.screenSnapshot as any)?.sections ?? (p.data as any)?.sections ?? [];
        const localScreens = (localProject?.data as any)?.screens;
        const localHasScreens = Array.isArray(localScreens) && localScreens.length > 0;
        const serverHasScreens = Array.isArray(serverScreens) && serverScreens.length > 0;

        if (localProject?.data && localHasScreens && !serverHasScreens) {
            projData = {
                screens: (localProject.data as any).screens ?? [],
                flows: (localProject.data as any).flows ?? [],
                sections: Array.isArray(serverSections) && serverSections.length > 0 ? serverSections : ((localProject.data as any).sections ?? []),
            };
        } else if (localProject?.data && (localProject.data as any).screens && localTs > serverTs) {
            projData = localProject.data;
        } else if (p.data && (p.data as any).screens) {
            projData = p.data;
        } else if (p.screenSnapshot || serverScreens.length || serverFlows.length || (Array.isArray(serverSections) && serverSections.length)) {
            projData = {
                screens: serverScreens || [],
                flows: serverFlows || [],
                sections: Array.isArray(serverSections) ? serverSections : [],
            };
        } else {
            projData = { screens: [], flows: [], sections: [] };
        }
    } else if (pt === 'WBS') {
        if (p.wbsSnapshot) {
            projData = {
                menus: p.wbsSnapshot.menus || [],
                rows: p.wbsSnapshot.rows || [],
                projectSchedule: (p.wbsSnapshot as any).projectSchedule ?? undefined,
                detailSchedules: (p.wbsSnapshot as any).detailSchedules || [],
            };
        } else {
            projData = { menus: [], rows: [] };
        }
    } else if (pt === 'PERSONAL_SCHEDULE') {
        if (p.personalScheduleSnapshot) {
            projData = {
                events: p.personalScheduleSnapshot.events || [],
                todos: p.personalScheduleSnapshot.todos || [],
                categories: p.personalScheduleSnapshot.categories || {},
                visibleCats: p.personalScheduleSnapshot.visibleCats || [],
            };
        } else {
            projData = { events: [], todos: [], categories: {}, visibleCats: [] };
        }
    } else if (pt === 'PROCESS_FLOW') {
        const snap = p.processFlowSnapshot ?? p.data;
        projData = snap
            ? {
                nodes: snap.nodes || [],
                edges: snap.edges || [],
                sections: snap.sections || [],
            }
            : { nodes: [], edges: [], sections: [] };
    } else {
        const snap = p.currentSnapshot;
        projData = snap
            ? {
                entities: snap.entities || [],
                relationships: snap.relationships || [],
                sections: snap.sections || [],
            }
            : { entities: [], relationships: [], sections: [] };
    }

    return {
        ...p,
        id: p._id ?? p.id,
        projectType: pt,
        author: p.author || '',
        linkedErdProjectIds: (p.linkedErdProjectIds && p.linkedErdProjectIds.length) ? p.linkedErdProjectIds : (p.linkedErdProjectId ? [p.linkedErdProjectId] : []),
        linkedErdProjectId: p.linkedErdProjectId || (p.linkedErdProjectIds && p.linkedErdProjectIds[0]),
        linkedComponentProjectId: p.linkedComponentProjectId,
        members: p.members?.map((m: any) => ({
            id: m.userId?._id || m.userId,
            name: m.userId?.name || 'Unknown',
            email: m.userId?.email || '',
            picture: m.userId?.picture,
            role: m.role || 'MEMBER',
        })),
        data: projData,
        bugReports: mergeBugReports(p.bugReports || [], localProject?.bugReports || []),
    } as Project;
}
