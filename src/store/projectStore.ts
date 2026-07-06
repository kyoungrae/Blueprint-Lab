import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { Project, DBType, ProjectType, ProjectMember } from '../types/erd';
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { mapServerProjectResponse } from '../utils/mapServerProject';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

/**
 * createJSONStorage가 사용할 "원본" storage 래퍼.
 * localStorage quota 초과 시에도 앱이 죽지 않도록 안전하게 저장한다.
 * (quota 초과 상황에서 setItem이 DOMException을 던지며, uncaught로 앱 렌더가 깨질 수 있음)
 */
const safeStateStorage: StateStorage<void> = {
    getItem: (name: string) => {
        try {
            return localStorage.getItem(name);
        } catch {
            return null;
        }
    },
    setItem: (name: string, value: string) => {
        try {
            localStorage.setItem(name, value);
        } catch (err: any) {
            // Typically: QuotaExceededError / DOMException
            // ⚠️ 이전에는 여기서 localStorage.removeItem(name)으로 'project-storage' 전체를
            //    삭제했는데, 한 번의 용량 초과로 모든 프로젝트의 영속 데이터가 날아가
            //    새로고침 시 (정렬 결과 등) 작업이 통째로 사라지는 원인이 됐다.
            //    => 기존에 저장된 값은 보존하고, 이번 쓰기만 건너뛴다.
            console.warn('[project-storage] localStorage 저장 실패(용량 초과 가능). 기존 데이터는 유지합니다.', err);
        }
        return undefined;
    },
    removeItem: (name: string) => {
        try {
            localStorage.removeItem(name);
        } catch {
            // ignore
        }
        return undefined;
    },
};




interface ProjectStore {
    projects: Project[];
    currentProjectId: string | null;
    isOpeningProject: boolean;
    openingProjectName: string | null;
    fetchProjects: () => Promise<void>;
    openProject: (id: string) => Promise<void>;
    addProject: (name: string, dbType: DBType, members: ProjectMember[], description?: string, projectType?: ProjectType) => Promise<Project>;
    addRemoteProject: (id: string) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    setCurrentProject: (id: string | null) => void;
    updateProjectData: (id: string, data: any) => void;
    updateProjectMetadata: (id: string, metadata: Partial<Project>) => Promise<void>;
    updateProjectMembers: (id: string, members: ProjectMember[]) => void;
    inviteMember: (projectId: string, email: string) => Promise<void>;
    joinWithCode: (code: string) => Promise<string>;
}

export const useProjectStore = create<ProjectStore>()(
    persist(
        (set, get) => ({
            projects: [],
            currentProjectId: null,
            isOpeningProject: false,
            openingProjectName: null,

            fetchProjects: async () => {
                const token = localStorage.getItem('auth-token');
                if (!token) return;

                try {
                    const response = await fetchWithAuth(`${API_URL}?t=${Date.now()}`, {
                        headers: { 'Cache-Control': 'no-cache' },
                        cache: 'no-store'
                    });
                    if (response.ok) {
                        const data = await response.json();
                        const currentProjects = get().projects;
                        const projects = data.map((p: any) =>
                            mapServerProjectResponse(p, currentProjects.find((lp) => lp.id === p._id)),
                        );
                        set({ projects });
                    }
                } catch {
                    // ignore
                }
            },

            openProject: async (id) => {
                const existing = get().projects.find((p) => p.id === id);
                set({
                    isOpeningProject: true,
                    openingProjectName: existing?.name ?? '프로젝트',
                });

                try {
                    if (id.startsWith('local_')) {
                        const local = get().projects.find((p) => p.id === id);
                        if (local?.projectType === 'WBS') {
                            const { useWbsStore } = await import('./wbsStore');
                            useWbsStore.getState().loadProject(id, (local.data ?? { menus: [], rows: [] }) as unknown as import('../types/wbs').WbsData);
                        }
                        set({ currentProjectId: id });
                        return;
                    }

                    const token = localStorage.getItem('auth-token');
                    if (token) {
                        const response = await fetchWithAuth(`${API_URL}/${id}?t=${Date.now()}`, {
                            headers: { 'Cache-Control': 'no-cache' },
                            cache: 'no-store',
                        });
                        if (response.ok) {
                            const p = await response.json();
                            const mapped = mapServerProjectResponse(p, existing);
                            set((state) => ({
                                projects: state.projects.some((x) => x.id === id)
                                    ? state.projects.map((x) => (x.id === id ? { ...x, ...mapped } : x))
                                    : [mapped, ...state.projects],
                            }));

                            if (mapped.projectType === 'WBS') {
                                const { useWbsStore } = await import('./wbsStore');
                                useWbsStore.getState().loadProject(id, (mapped.data ?? { menus: [], rows: [] }) as unknown as import('../types/wbs').WbsData);
                            }

                            if (mapped.projectType === 'PERSONAL_SCHEDULE') {
                                const { resolveLinkedWbsProjectId } = await import('../utils/linkedPersonalScheduleProjects');
                                const wbsId = resolveLinkedWbsProjectId(mapped, get().projects);
                                if (wbsId) {
                                    const wbsExisting = get().projects.find((x) => x.id === wbsId);
                                    const wbsRes = await fetchWithAuth(`${API_URL}/${wbsId}?t=${Date.now()}`, {
                                        headers: { 'Cache-Control': 'no-cache' },
                                        cache: 'no-store',
                                    });
                                    if (wbsRes.ok) {
                                        const wbsJson = await wbsRes.json();
                                        const wbsMapped = mapServerProjectResponse(wbsJson, wbsExisting);
                                        set((state) => ({
                                            projects: state.projects.some((x) => x.id === wbsId)
                                                ? state.projects.map((x) => (x.id === wbsId ? { ...x, ...wbsMapped } : x))
                                                : [wbsMapped, ...state.projects],
                                        }));
                                    }
                                    const { syncWbsToLinkedPersonalSchedules } = await import('../services/wbsPersonalScheduleSync');
                                    await syncWbsToLinkedPersonalSchedules(wbsId, { force: true });
                                }
                            }
                        }
                    }

                    set({ currentProjectId: id });
                } catch {
                    alert('프로젝트를 불러오지 못했습니다. 다시 시도해 주세요.');
                } finally {
                    set({ isOpeningProject: false, openingProjectName: null });
                }
            },

            addProject: async (name, dbType, _members, description, projectType = 'ERD') => {
                const token = localStorage.getItem('auth-token');

                // Guest / Local Mode
                if (!token) {
                    const newProject: Project = {
                        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        name,
                        projectType,
                        dbType,
                        description: description || '',
                        members: [],
                        data: projectType === 'COMPONENT'
                            ? { components: [], flows: [] }
                            : projectType === 'SCREEN_DESIGN'
                                ? { screens: [], flows: [], sections: [] }
                                : projectType === 'PROCESS_FLOW'
                                    ? { nodes: [], edges: [], sections: [] }
                                : projectType === 'WBS'
                                    ? { menus: [], rows: [] }
                                : projectType === 'PERSONAL_SCHEDULE'
                                    ? { events: [], todos: [], categories: {}, visibleCats: [] }
                                : { entities: [], relationships: [], sections: [] },
                        updatedAt: new Date().toISOString()
                    };

                    set((state) => ({
                        projects: [newProject, ...state.projects],
                    }));
                    return newProject;
                }

                try {
                    const response = await fetchWithAuth(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, dbType, description, projectType }),
                    });

                    if (!response.ok) {
                        const err = await response.json().catch(() => ({}));
                        throw new Error(err.message || '프로젝트 생성에 실패했습니다.');
                    }

                    const p = await response.json();
                    const newProject: Project = {
                        ...p,
                        id: p._id,
                        projectType: p.projectType || projectType,
                        members: p.members?.map((m: any) => ({
                            id: String(m.userId?._id ?? m.userId ?? ''),
                            name: m.userId?.name || 'Unknown',
                            email: m.userId?.email || '',
                            picture: m.userId?.picture,
                            role: m.role || 'MEMBER'
                        })),
                        data: (p.projectType || projectType) === 'COMPONENT'
                            ? { components: [], flows: [] }
                            : (p.projectType || projectType) === 'SCREEN_DESIGN'
                                ? { screens: [], flows: [], sections: [] }
                                : (p.projectType || projectType) === 'PROCESS_FLOW'
                                    ? { nodes: [], edges: [], sections: [] }
                                    : (p.projectType || projectType) === 'WBS'
                                        ? { menus: [], rows: [] }
                                    : (p.projectType || projectType) === 'PERSONAL_SCHEDULE'
                                        ? { events: [], todos: [], categories: {}, visibleCats: [] }
                                    : { entities: [], relationships: [], sections: [] },
                        bugReports: [],
                    };

                    set((state) => ({
                        projects: [newProject, ...state.projects],
                    }));
                    return newProject;
                } catch (error) {
                    // console.error('Add project error:', error);
                    throw error;
                }
            },

            addRemoteProject: async (id) => {
                const token = localStorage.getItem('auth-token');

                // Check if already in list
                const { projects, fetchProjects } = useProjectStore.getState();
                if (projects.find((p) => p.id === id)) {
                    set({ currentProjectId: id });
                    return;
                }

                try {
                    const headers: Record<string, string> = {};
                    if (token) {
                        headers['Authorization'] = `Bearer ${token}`;
                        // Officially join the project on the server
                        const joinResponse = await fetchWithAuth(`${API_URL}/${id}/join`, {
                            method: 'POST',
                            headers
                        });

                        if (!joinResponse.ok) {
                            const errorData = await joinResponse.json();
                            throw new Error(errorData.message || 'Failed to join project');
                        }

                        // After joining, refresh the full projects list
                        await fetchProjects();
                        set({ currentProjectId: id });
                    } else {
                        // Guest mode: just fetch and add to local list
                        const response = await fetchWithAuth(`${API_URL}/${id}`, { headers });
                        if (!response.ok) throw new Error('Project not found or access denied');

                        const p = await response.json();
                        const newProject: Project = {
                            ...p,
                            id: p._id,
                            members: p.members?.map((m: any) => ({
                                id: String(m.userId?._id ?? m.userId ?? ''),
                                name: m.userId?.name || 'Unknown',
                                email: m.userId?.email || '',
                                picture: m.userId?.picture,
                                role: m.role || 'MEMBER'
                            })),
                            data: p.data || (p.currentSnapshot?.entities ? p.currentSnapshot : { entities: [], relationships: [] })
                        };

                        set((state) => ({
                            projects: [newProject, ...state.projects],
                            currentProjectId: id,
                        }));
                    }
                } catch (error: any) {
                    // console.error('Add remote project error:', error);
                    alert(error.message || '프로젝트를 찾을 수 없거나 접근 권한이 없습니다.');
                }
            },

            deleteProject: async (id) => {
                // If it's a local project, just remove it
                if (id.startsWith('local_')) {
                    set((state) => ({
                        projects: state.projects.filter((p) => p.id !== id),
                        currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
                    }));
                    return;
                }

                const token = localStorage.getItem('auth-token');
                // If token exists, try to delete from server
                if (token) {
                    try {
                        const response = await fetchWithAuth(`${API_URL}/${id}`, {
                            method: 'DELETE',
                        });

                        // If not successful and not 404, stop here
                        if (!response.ok && response.status !== 404) {
                            return;
                        }
                    } catch (error) {
                        // console.error('Delete project error:', error);
                        return;
                    }
                }

                // Remove from local state (runs if no token OR if server delete was successful/404)
                set((state) => ({
                    projects: state.projects.filter((p) => p.id !== id),
                    currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
                }));
            },

            setCurrentProject: (id) => set({ currentProjectId: id }),

            updateProjectData: (id, data) => {
                /**
                 * ✅ 로컬 Zustand 상태만 업데이트 (UI 즉시 반영용)
                 *
                 * ❌ 제거됨: setTimeout 디바운스 + sendProjectDataPatch REST 호출
                 *    캔버스 데이터(screens/flows)는 yjsStore를 통해 Yjs CRDT로 저장됩니다.
                 *    섹션·메타데이터는 updateProjectMetadata()를 사용하세요.
                 */
                set((state) => ({
                    projects: state.projects.map((p) =>
                        p.id === id ? { ...p, data: { ...p.data, ...data }, updatedAt: new Date().toISOString() } : p
                    ),
                }));
            },

            updateProjectMetadata: async (id, metadata) => {
                set((state) => ({
                    projects: state.projects.map((p) =>
                        p.id === id ? { ...p, ...metadata, updatedAt: new Date().toISOString() } : p
                    ),
                }));

                const token = localStorage.getItem('auth-token');
                if (!token || id.startsWith('local_')) return;

                try {
                    const response = await fetchWithAuth(`${API_URL}/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(metadata),
                    });

                    if (!response.ok) {
                        // console.error('Failed to sync project metadata to server');
                    }
                } catch (error) {
                    // console.error('Update project metadata error:', error);
                }
            },

            updateProjectMembers: async (id, members) => {
                const token = localStorage.getItem('auth-token');
                if (token) {
                    try {
                        const response = await fetchWithAuth(`${API_URL}/${id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ members }),
                        });

                        if (!response.ok) {
                            // console.error('Failed to sync project members to server');
                            return;
                        }
                    } catch (error) {
                        // console.error('Update project members error:', error);
                        return;
                    }
                }

                set((state) => ({
                    projects: state.projects.map((p) =>
                        p.id === id ? { ...p, members, updatedAt: new Date().toISOString() } : p
                    ),
                }));
            },

            inviteMember: async (projectId, email) => {
                const token = localStorage.getItem('auth-token');
                if (!token) throw new Error('Authentication required');

                const response = await fetchWithAuth(`${API_URL}/invite`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId, email }),
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.message || 'Failed to send invitation');
                }
            },

            joinWithCode: async (code) => {
                const token = localStorage.getItem('auth-token');
                if (!token) throw new Error('Authentication required');

                const response = await fetchWithAuth(`${API_URL}/join-with-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code }),
                });

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || 'Failed to join project');
                }

                return data.projectId;
            },
        }),
        {
            name: 'project-storage',
            version: 3, // 버전 업: 연결된 ERD 프로젝트 데이터 유지
            storage: createJSONStorage(() => safeStateStorage),
            // localStorage quota 초과 방지를 위해 ERD/SCREEN_DESIGN/COMPONENT의 큰 data를 저장하지 않는다.
            // 단, 다른 프로젝트에 연결된(linked) ERD 프로젝트는 데이터를 유지한다.
            partialize: (state) => {
                const allLinkedErdIds = new Set<string>();
                const keepDataIds = new Set<string>();
                if (state.currentProjectId) keepDataIds.add(state.currentProjectId);

                state.projects.forEach((p) => {
                    const erdIds = p.linkedErdProjectIds || (p.linkedErdProjectId ? [p.linkedErdProjectId] : []);
                    erdIds.forEach((id) => allLinkedErdIds.add(id));

                    const psIds = p.linkedPersonalScheduleProjectIds ?? [];
                    if (p.projectType === 'WBS' && psIds.length > 0) {
                        keepDataIds.add(p.id);
                        psIds.forEach((id) => keepDataIds.add(id));
                    }
                    if (p.linkedWbsProjectId) {
                        keepDataIds.add(p.id);
                        keepDataIds.add(p.linkedWbsProjectId);
                    }
                });

                return {
                    currentProjectId: state.currentProjectId,
                    projects: state.projects.map((p) => {
                        const isLinkedErd = p.projectType === 'ERD' && allLinkedErdIds.has(p.id);
                        const keepData = keepDataIds.has(p.id) || isLinkedErd;
                        const base = {
                            id: p.id,
                            name: p.name,
                            projectType: p.projectType,
                            dbType: p.dbType,
                            description: p.description,
                            author: p.author,
                            groupLabel: p.groupLabel,
                            updatedAt: p.updatedAt,
                            linkedErdProjectIds: p.linkedErdProjectIds,
                            linkedErdProjectId: p.linkedErdProjectId,
                            linkedComponentProjectId: p.linkedComponentProjectId,
                            linkedPersonalScheduleProjectIds: p.linkedPersonalScheduleProjectIds,
                            linkedWbsProjectId: p.linkedWbsProjectId,
                            members: p.members,
                            // 현재·연결된 ERD·연결된 WBS↔개인일정 프로젝트는 데이터 유지
                            data:
                                keepData
                                    ? p.data
                                    : p.projectType === 'ERD'
                                        ? { entities: [], relationships: [], sections: [] }
                                        : p.projectType === 'SCREEN_DESIGN'
                                            ? { screens: [], flows: [], sections: [] }
                                            : p.projectType === 'PROCESS_FLOW'
                                                ? { nodes: [], edges: [], sections: [] }
                                                : p.projectType === 'WBS'
                                                    ? { menus: [], rows: [], projectSchedule: undefined, detailSchedules: [] }
                                                    : p.projectType === 'PERSONAL_SCHEDULE'
                                                        ? { events: [], todos: [], categories: {}, visibleCats: [] }
                                                        : { components: [], flows: [] },
                            bugReports: [],
                        };
                        return base as Project;
                    }),
                };
            },
            migrate: (persistedState: any, _version: number) => {
                // v2->v3: 연결된 ERD 프로젝트 데이터 유지를 위해 마이그레이션 (_version: persist 스키마 버전, 필요 시 분기)
                const ps = persistedState as any;
                if (!ps?.projects?.length) return ps;
                
                // 모든 프로젝트의 linkedErdProjectIds 수집
                const allLinkedErdIds = new Set<string>();
                ps.projects.forEach((p: any) => {
                    const ids = p.linkedErdProjectIds || (p.linkedErdProjectId ? [p.linkedErdProjectId] : []);
                    ids.forEach((id: string) => allLinkedErdIds.add(id));
                });
                
                return {
                    ...ps,
                    projects: ps.projects.map((p: any) => {
                        const isLinkedErd = p.projectType === 'ERD' && allLinkedErdIds.has(p.id);
                        return {
                            ...p,
                            data:
                                isLinkedErd && p.data?.entities?.length > 0
                                    ? p.data // 연결된 ERD 프로젝트는 기존 데이터 유지
                                    : p.projectType === 'ERD'
                                        ? { entities: [], relationships: [], sections: [] }
                                        : p.projectType === 'SCREEN_DESIGN'
                                            ? { screens: [], flows: [], sections: [] }
                                            : p.projectType === 'PROCESS_FLOW'
                                                ? { nodes: [], edges: [], sections: [] }
                                                : p.projectType === 'WBS'
                                                    ? { menus: [], rows: [], projectSchedule: undefined, detailSchedules: [] }
                                                    : p.projectType === 'PERSONAL_SCHEDULE'
                                                        ? { events: [], todos: [], categories: {}, visibleCats: [] }
                                                        : { components: [], flows: [] },
                            bugReports: [],
                        };
                    }),
                };
            },
        }
    )
);
