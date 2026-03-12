import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, DBType, ProjectType, ProjectMember } from '../types/erd';
import { fetchWithAuth } from '../utils/fetchWithAuth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

/** PATCH 요청 디바운스: 프로젝트별로 마지막 데이터만 일정 시간 후 한 번만 전송 (기능 유지, 체감 지연 완화) */
const SAVE_DEBOUNCE_MS = 500;
const pendingSave: Record<string, { timer: ReturnType<typeof setTimeout>; data: any }> = {};

// 연결 간 구분을 위한 고유 키 생성
const getConnectionKey = () => {
    let connectionKey = sessionStorage.getItem('connectionKey');
    if (!connectionKey) {
        connectionKey = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('connectionKey', connectionKey);
    }
    return connectionKey;
};

// 연결별로 독립적인 저장 상태 관리
const getConnectionSpecificKey = (projectId: string) => `${getConnectionKey()}_${projectId}`;

async function sendProjectDataPatch(id: string, data: any) {
    const token = localStorage.getItem('auth-token');
    if (!token || id.startsWith('local_')) return;
    try {
        const response = await fetchWithAuth(`${API_URL}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data }),
        });
        if (!response.ok) {
            let serverMessage = 'Failed to sync project data to server';
            try {
                const body = await response.json();
                if (body?.message) serverMessage = body.message;
            } catch (error) {
                console.error('Error parsing response JSON:', error);
            }
            
            // 버전 충돌 시 자동으로 다시 시도
            if (response.status === 500 && serverMessage.includes('No matching document found')) {
                // console.warn('🔄 Version conflict detected, retrying...');
                setTimeout(() => {
                    // 최신 데이터를 다시 가져와서 다시 시도
                    window.location.reload();
                }, 1000);
                return;
            }
            
            // console.error(serverMessage + suffix);
        }
    } catch (error: any) {
        const isNetworkError =
            error?.name === 'TypeError' &&
            (error?.message?.includes('fetch') || error?.message?.includes('NetworkError') || error?.message?.includes('Failed to fetch'));
        if (isNetworkError) {
            // console.warn(
            //     '프로젝트 저장 요청을 보낼 수 없습니다. 백엔드 서버가 실행 중인지, 인터넷 연결을 확인해 주세요.',
            //     error
            // );
        } else {
            // console.error('Update project data error:', error);
        }
    }
}

interface ProjectStore {
    projects: Project[];
    currentProjectId: string | null;
    fetchProjects: () => Promise<void>;
    addProject: (name: string, dbType: DBType, members: ProjectMember[], description?: string, projectType?: ProjectType) => Promise<Project>;
    addRemoteProject: (id: string) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    setCurrentProject: (id: string | null) => void;
    updateProjectData: (id: string, data: any, immediate?: boolean) => void;
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
                        // Map Mongo _id to id
                        const currentProjects = get().projects;
                        const projects = data.map((p: any) => {
                            const pt = p.projectType || 'ERD';
                            // 로컬에 저장된 기존 프로젝트 (persist로 유지됨)
                            const localProject = currentProjects.find((lp) => lp.id === p._id);
                            let projData: any;

                            if (pt === 'COMPONENT') {
                                // 컴포넌트 캔버스: 한 번이라도 로컬에 components가 생기면,
                                // 이후에는 항상 localProject.data를 우선 사용해 snapshot이 격자 정보를 덮어쓰지 않게 한다.
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
                                // 화면 설계: 서버에 screens가 없는데 로컬에 있으면 로컬 유지 (가져오기 후 섹션 추가·새로고침 시 데이터 유지)
                                const serverTs = new Date(p.updatedAt || 0).getTime();
                                const localTs = new Date(localProject?.updatedAt || 0).getTime();
                                const serverScreens = (p.data as any)?.screens ?? (p.screenSnapshot as any)?.screens ?? [];
                                const serverFlows = (p.data as any)?.flows ?? (p.screenSnapshot as any)?.flows ?? [];
                                const serverSections = (p.screenSnapshot as any)?.sections ?? (p.data as any)?.sections ?? [];
                                const localScreens = (localProject?.data as any)?.screens;
                                const localHasScreens = Array.isArray(localScreens) && localScreens.length > 0;
                                const serverHasScreens = Array.isArray(serverScreens) && serverScreens.length > 0;

                                if (localProject?.data && localHasScreens && !serverHasScreens) {
                                    // 서버에 화면 목록이 없고 로컬에만 있으면 로컬 screens/flows 유지, 섹션은 서버 것 우선(섹션 추가 반영)
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
                            } else {
                                // ERD: always build from currentSnapshot so sections are never dropped (API returns currentSnapshot, not data)
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
                                id: p._id,
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
                                    role: m.role || 'MEMBER'
                                })),
                                data: projData,
                                bugReports: p.bugReports || []
                            };
                        });
                        set({ projects });
                    }
                } catch (error) {
                    // console.error('Fetch projects error:', error);
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
                            id: m.userId?._id || m.userId,
                            name: m.userId?.name || 'Unknown',
                            email: m.userId?.email || '',
                            picture: m.userId?.picture,
                            role: m.role || 'MEMBER'
                        })),
                        data: { entities: [], relationships: [] },
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
                                id: m.userId?._id || m.userId,
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

            updateProjectData: (id, data, immediate = false) => {
                // Update local state immediately for responsiveness
                set((state) => ({
                    projects: state.projects.map((p) =>
                        p.id === id ? { ...p, data: { ...p.data, ...data }, updatedAt: new Date().toISOString() } : p
                    ),
                }));

                if (!id || id.startsWith('local_')) return;
                const token = localStorage.getItem('auth-token');
                if (!token) return;

                const merged = pendingSave[getConnectionSpecificKey(id)] ? { ...pendingSave[getConnectionSpecificKey(id)].data, ...data } : { ...data };

                if (immediate) {
                    if (pendingSave[getConnectionSpecificKey(id)]?.timer) clearTimeout(pendingSave[getConnectionSpecificKey(id)].timer);
                    delete pendingSave[getConnectionSpecificKey(id)];
                    sendProjectDataPatch(id, merged);
                    return;
                }

                if (pendingSave[getConnectionSpecificKey(id)]?.timer) clearTimeout(pendingSave[getConnectionSpecificKey(id)].timer);
                pendingSave[getConnectionSpecificKey(id)] = {
                    data: merged,
                    timer: setTimeout(() => {
                        sendProjectDataPatch(id, pendingSave[getConnectionSpecificKey(id)].data);
                        delete pendingSave[getConnectionSpecificKey(id)];
                    }, SAVE_DEBOUNCE_MS),
                };
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
            // Only persist essential state, not the full project list if fetched from API
            partialize: (state) => ({
                currentProjectId: state.currentProjectId,
                projects: state.projects
            }),
        }
    )
);
