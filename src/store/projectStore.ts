import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, DBType, ProjectType, ProjectMember } from '../types/erd';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

interface ProjectStore {
    projects: Project[];
    currentProjectId: string | null;
    fetchProjects: () => Promise<void>;
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
        (set) => ({
            projects: [],
            currentProjectId: null,

            fetchProjects: async () => {
                const token = localStorage.getItem('auth-token');
                if (!token) return;

                try {
                    const response = await fetch(`${API_URL}?t=${Date.now()}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Cache-Control': 'no-cache'
                        },
                        cache: 'no-store'
                    });
                    if (response.ok) {
                        const data = await response.json();
                        // Map Mongo _id to id
                        const projects = data.map((p: any) => ({
                            ...p,
                            id: p._id,
                            projectType: p.projectType || 'ERD',
                            members: p.members?.map((m: any) => ({
                                id: m.userId?._id || m.userId,
                                name: m.userId?.name || 'Unknown',
                                email: m.userId?.email || '',
                                picture: m.userId?.picture,
                                role: m.role || 'MEMBER'
                            })),
                            data: p.data || (p.currentSnapshot?.entities ? p.currentSnapshot : { entities: [], relationships: [] })
                        }));
                        set({ projects });
                    }
                } catch (error) {
                    console.error('Fetch projects error:', error);
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
                        data: { entities: [], relationships: [] },
                        updatedAt: new Date().toISOString()
                    };

                    set((state) => ({
                        projects: [newProject, ...state.projects],
                    }));
                    return newProject;
                }

                try {
                    const response = await fetch(API_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ name, dbType, description, projectType }),
                    });

                    if (!response.ok) throw new Error('Failed to create project');

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
                    };

                    set((state) => ({
                        projects: [newProject, ...state.projects],
                    }));
                    return newProject;
                } catch (error) {
                    console.error('Add project error:', error);
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
                        const joinResponse = await fetch(`${API_URL}/${id}/join`, {
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
                        const response = await fetch(`${API_URL}/${id}`, { headers });
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
                    console.error('Add remote project error:', error);
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
                        const response = await fetch(`${API_URL}/${id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });

                        // If not successful and not 404, stop here
                        if (!response.ok && response.status !== 404) {
                            return;
                        }
                    } catch (error) {
                        console.error('Delete project error:', error);
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

            updateProjectData: async (id, data) => {
                // Update local state immediately for responsiveness
                set((state) => ({
                    projects: state.projects.map((p) =>
                        p.id === id ? { ...p, data, updatedAt: new Date().toISOString() } : p
                    ),
                }));

                // Skip server sync for local projects or if no token
                const token = localStorage.getItem('auth-token');
                if (!token || id.startsWith('local_')) return;

                try {
                    const response = await fetch(`${API_URL}/${id}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ data }),
                    });

                    if (!response.ok) {
                        console.error('Failed to sync project data to server');
                    }
                } catch (error) {
                    console.error('Update project data error:', error);
                }
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
                    const response = await fetch(`${API_URL}/${id}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(metadata),
                    });

                    if (!response.ok) {
                        console.error('Failed to sync project metadata to server');
                    }
                } catch (error) {
                    console.error('Update project metadata error:', error);
                }
            },

            updateProjectMembers: async (id, members) => {
                const token = localStorage.getItem('auth-token');
                if (token) {
                    try {
                        const response = await fetch(`${API_URL}/${id}`, {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ members }),
                        });

                        if (!response.ok) {
                            console.error('Failed to sync project members to server');
                            return;
                        }
                    } catch (error) {
                        console.error('Update project members error:', error);
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

                const response = await fetch(`${API_URL}/invite`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
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

                const response = await fetch(`${API_URL}/join-with-code`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
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
