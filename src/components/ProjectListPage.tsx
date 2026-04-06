import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { Plus, FolderOpen, Trash2, LogOut, Database, Users, UserMinus, X, Share2, AlertTriangle, Link, Monitor, ArrowLeft, Box, Shield, Crown, Pencil } from 'lucide-react';
import './ProjectListPage.css';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useProjectStore } from '../store/projectStore';
import { useAuthStore } from '../store/authStore';
import { fetchWithAuth } from '../utils/fetchWithAuth';
import type { Project, DBType, ProjectType, ProjectMember } from '../types/erd';
import AdminPage from './AdminPage';
import PremiumTooltip from './screenNode/PremiumTooltip';

const PROJECT_TYPE_ORDER: Record<ProjectType, number> = { ERD: 0, SCREEN_DESIGN: 1, COMPONENT: 2, PROCESS_FLOW: 3 };

/** 화면 설계에 연결된 ERD 프로젝트 ID 목록 (단일/다중 모두 지원) */
function getLinkedErdIds(project: Project): string[] {
    if (project.linkedErdProjectIds?.length) return project.linkedErdProjectIds;
    return project.linkedErdProjectId ? [project.linkedErdProjectId] : [];
}

const ProjectListPage: React.FC = () => {
    const { projects, fetchProjects, addProject, addRemoteProject, deleteProject, setCurrentProject, currentProjectId, updateProjectMembers, updateProjectMetadata, inviteMember, joinWithCode } = useProjectStore();
    const { user, logout } = useAuthStore();

    // UI States
    const [isTypeSelectionOpen, setIsTypeSelectionOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [editingMembersProject, setEditingMembersProject] = useState<string | null>(null);
    const [linkingProjectId, setLinkingProjectId] = useState<string | null>(null);
    const [linkingMode, setLinkingMode] = useState<'erd' | 'component' | null>(null);
    const [showAdminPage, setShowAdminPage] = useState(false);

    // Form States
    const [selectedProjectType, setSelectedProjectType] = useState<ProjectType>('ERD');
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [newProjectDbType, setNewProjectDbType] = useState<DBType>('MySQL');
    const [newProjectMembers, setNewProjectMembers] = useState<ProjectMember[]>([]);
    const [tempMembers, setTempMembers] = useState<ProjectMember[]>([]);
    const [memberInput, setMemberInput] = useState('');
    const [joinMode, setJoinMode] = useState<'CODE' | 'ID'>('CODE');
    const [joinCode, setJoinCode] = useState('');

    const [composing, setComposing] = useState<{ field: string; value: string } | null>(null);
    const displayValue = (field: string, propValue: string) =>
        composing?.field === field ? composing.value : propValue;

    // Utility States
    const [isLoading, setIsLoading] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // 프로젝트 삭제 확인 (생성자: 비밀번호 검증 + 안내문구 후 삭제)
    const [deleteConfirmProject, setDeleteConfirmProject] = useState<Project | null>(null);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteVerifying, setDeleteVerifying] = useState(false);

    // 프로젝트 명 / 프로젝트 설명 편집 패널
    const [editingProjectInfo, setEditingProjectInfo] = useState<{ project: Project; name: string; description: string } | null>(null);

    // Connection States
    const containerRef = useRef<HTMLDivElement>(null);
    const [cardPositions, setCardPositions] = useState<Record<string, { x: number, y: number, w: number, h: number }>>({});

    const updatePositions = () => {
        const container = containerRef.current;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        if (containerRect.width === 0) return;

        const newPositions: Record<string, { x: number, y: number, w: number, h: number }> = {};
        const cardElements = container.querySelectorAll('.project-card');

        cardElements.forEach((el) => {
            const id = (el as HTMLElement).dataset.projectId;
            if (id) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0) {
                    newPositions[id] = {
                        x: rect.left - containerRect.left,
                        y: rect.top - containerRect.top,
                        w: rect.width,
                        h: rect.height
                    };
                }
            }
        });

        if (Object.keys(newPositions).length > 0) {
            setCardPositions(prev => {
                const merged = { ...prev, ...newPositions };
                if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
                return merged;
            });
        }
    };

    useLayoutEffect(() => {
        updatePositions();
    }, [projects]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver(() => updatePositions());
        observer.observe(container);

        // Multiple fallbacks for dynamic layouts (images loading, etc)
        const timeouts = [100, 500, 1000, 3000].map(ms => setTimeout(updatePositions, ms));

        window.addEventListener('resize', updatePositions);
        window.addEventListener('load', updatePositions);

        return () => {
            observer.disconnect();
            timeouts.forEach(clearTimeout);
            window.removeEventListener('resize', updatePositions);
            window.removeEventListener('load', updatePositions);
        };
    }, []);

    const projectConnections = useMemo(() => {
        const connections: { fromId: string; toId: string }[] = [];
        projects.forEach((p) => {
            if (p.projectType === 'SCREEN_DESIGN' || p.projectType === 'PROCESS_FLOW') {
                getLinkedErdIds(p).forEach((erdId) => connections.push({ fromId: p.id, toId: erdId }));
            }

            if (p.projectType === 'SCREEN_DESIGN') {
                if (p.linkedComponentProjectId) connections.push({ fromId: p.id, toId: p.linkedComponentProjectId });
            }
        });
        return connections;
    }, [projects]);

    // 연결된 프로젝트끼리 그룹핑 (연결 요소). 그룹 내·그룹 간 순서: ERD → 화면설계 → 컴포넌트 고정
    const connectedGroups = useMemo(() => {
        const idToProject = new Map(projects.map((p) => [p.id, p]));
        const adj = new Map<string, Set<string>>();
        projects.forEach((p) => adj.set(p.id, new Set()));
        projectConnections.forEach(({ fromId, toId }) => {
            adj.get(fromId)?.add(toId);
            adj.get(toId)?.add(fromId);
        });
        const visited = new Set<string>();
        const components: string[][] = [];
        projects.forEach((p) => {
            if (visited.has(p.id)) return;
            const stack = [p.id];
            const comp: string[] = [];
            while (stack.length) {
                const id = stack.pop()!;
                if (visited.has(id)) continue;
                visited.add(id);
                comp.push(id);
                adj.get(id)?.forEach((nb) => {
                    if (!visited.has(nb)) stack.push(nb);
                });
            }
            if (comp.length) components.push(comp);
        });
        const groups = components.map((comp) =>
            comp
                .map((id) => idToProject.get(id)!)
                .filter(Boolean)
                .sort((a, b) => PROJECT_TYPE_ORDER[a.projectType] - PROJECT_TYPE_ORDER[b.projectType])
        );
        groups.sort((ga, gb) => {
            const orderA = PROJECT_TYPE_ORDER[ga[0]?.projectType ?? 'ERD'];
            const orderB = PROJECT_TYPE_ORDER[gb[0]?.projectType ?? 'ERD'];
            if (orderA !== orderB) return orderA - orderB;
            return (ga[0]?.name ?? '').localeCompare(gb[0]?.name ?? '');
        });
        return groups;
    }, [projects, projectConnections]);

    const groupIdByProjectId = useMemo(() => {
        const map = new Map<string, number>();
        connectedGroups.forEach((group, gi) => group.forEach((p) => map.set(p.id, gi)));
        return map;
    }, [connectedGroups]);


    useEffect(() => {
        fetchProjects();

        // Check for pending invitation from login redirect OR direct URL params if already logged in
        const params = new URLSearchParams(window.location.search);
        const urlInvite = params.get('invite');
        const pendingInvite = sessionStorage.getItem('pending-invite');

        const inviteToProcess = urlInvite || pendingInvite;

        if (inviteToProcess) {
            setJoinCode(inviteToProcess.toUpperCase());
            setJoinMode('CODE');
            setIsJoinModalOpen(true);

            // Clean up
            if (urlInvite) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            if (pendingInvite) {
                sessionStorage.removeItem('pending-invite');
            }
        }
    }, [fetchProjects]);

    const handleAddMember = async (isEditing: boolean = false) => {
        if (!memberInput.trim()) return;

        if (isEditing && editingMembersProject) {
            try {
                setIsLoading(true);
                await inviteMember(editingMembersProject, memberInput.trim());
                alert('초대 메일이 발송되었습니다.');
                setMemberInput('');
                // Refresh members list
                await fetchProjects();
                const updatedProject = useProjectStore.getState().projects.find(p => p.id === editingMembersProject);
                if (updatedProject) setTempMembers(updatedProject.members || []);
            } catch (err: any) {
                alert(err.message || '초대에 실패했습니다.');
            } finally {
                setIsLoading(false);
            }
            return;
        }

        const currentMembers = isEditing ? tempMembers : newProjectMembers;

        if (currentMembers.some(m => m.name === memberInput.trim() || m.email === memberInput.trim())) {
            alert('이미 추가된 팀원입니다.');
            return;
        }

        const newMember: ProjectMember = {
            id: `mem_${Date.now()}`,
            name: memberInput.trim().split('@')[0],
            email: memberInput.trim(),
            role: 'MEMBER'
        };

        if (isEditing) {
            setTempMembers([...tempMembers, newMember]);
        } else {
            setNewProjectMembers([...newProjectMembers, newMember]);
        }
        setMemberInput('');
    };

    const handleRemoveMember = (id: string, isEditing: boolean = false) => {
        if (isEditing) {
            const memberToRemove = tempMembers.find(m => m.id === id);
            if (memberToRemove?.role === 'OWNER') {
                alert('소유자는 삭제할 수 없습니다.');
                return;
            }
            setTempMembers(tempMembers.filter(m => m.id !== id));
        } else {
            setNewProjectMembers(newProjectMembers.filter(m => m.id !== id));
        }
    };

    const handleUpdateMembers = async () => {
        if (editingMembersProject) {
            try {
                setIsLoading(true);
                await updateProjectMembers(editingMembersProject, tempMembers);
                setEditingMembersProject(null);
                setMemberInput('');
                alert('팀원 구성이 저장되었습니다.');
                await fetchProjects();
            } catch (err: any) {
                alert(err.message || '저장에 실패했습니다.');
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleJoinProject = async (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;

        try {
            setIsLoading(true);
            if (trimmed.length === 8) {
                // Invitation code
                await joinWithCode(trimmed);
                alert('프로젝트에 참여되었습니다.');
                await fetchProjects();
            } else {
                // Project ID
                await addRemoteProject(trimmed);
            }
        } catch (err: any) {
            alert(err.message || '프로젝트 참여에 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectProjectType = (type: ProjectType) => {
        setSelectedProjectType(type);
        setIsTypeSelectionOpen(false);
        setIsCreateModalOpen(true);
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;

        setIsLoading(true);
        setCreateError(null);

        try {
            const project = await addProject(
                newProjectName,
                selectedProjectType === 'PROCESS_FLOW' ? 'MySQL' : newProjectDbType, // Process Flow doesn't need DB but API requires it
                [],
                newProjectDesc,
                selectedProjectType
            );

            // 새로운 프로젝트 생성 시 screenDesignStore 클리어 (이전 데이터 잔재 방지)
            if (selectedProjectType === 'SCREEN_DESIGN') {
                const { setCanvasClipboard, setGridClipboard, setLastInteractedScreenId } = useScreenDesignStore.getState();
                setCanvasClipboard([]);
                setGridClipboard(null);
                setLastInteractedScreenId(null);
            }

            setNewProjectName('');
            setNewProjectDesc('');
            setNewProjectMembers([]);
            setIsCreateModalOpen(false);
            setCurrentProject(project.id);
        } catch (err: any) {
            setCreateError(err.message || '프로젝트 생성에 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    const targetProject = projects.find(p => p.id === editingMembersProject);

    if (showAdminPage) {
        return <AdminPage onBack={() => setShowAdminPage(false)} />;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col relative">
            {/* Full Screen Loading Overlay */}
            {isLoading && (
                <div className="fixed inset-0 bg-white/60 backdrop-blur-[2px] z-[100] flex flex-col items-center justify-center animate-in fade-in duration-200">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Database className="text-blue-600 animate-pulse" size={20} />
                        </div>
                    </div>
                    <div className="mt-6 flex flex-col items-center">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">처리 중입니다</h3>
                        <p className="text-sm text-gray-500 font-medium tracking-tight">잠시만 기다려주세요...</p>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
                            <Database size={24} />
                        </div>
                        <h1 className="text-xl font-black text-gray-900 tracking-tight uppercase">Blue Print Lab</h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 pl-2 pr-4 py-1.5 bg-gray-50 rounded-full border border-gray-100">
                            <img src={user?.picture} alt="" className="w-8 h-8 rounded-full border-2 border-white shadow-sm" />
                            <span className="text-sm font-bold text-gray-700 hidden sm:block">{user?.name}</span>
                        </div>
                        <button
                            onClick={() => setShowAdminPage(true)}
                            className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all active:scale-95"
                            title="관리자 페이지"
                        >
                            <Shield size={20} />
                        </button>
                        <button
                            onClick={() => {
                                if (window.confirm('로그아웃 하시겠습니까?')) {
                                    setCurrentProject(null);
                                    logout();
                                }
                            }}
                            className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all active:scale-95"
                            title="로그아웃"
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Guest Warning Banner */}
            {!localStorage.getItem('auth-token') && (
                <div className="bg-amber-50 border-b border-amber-100 py-3">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-3 text-amber-700">
                        <AlertTriangle size={18} className="flex-shrink-0" />
                        <div className="text-sm font-bold leading-tight">
                            참고: 현재 게스트 모드로 사용 중입니다. 프로젝트는 언제든지 삭제될 수 있으며 실시간 협업이 제한됩니다. 중요한 작업은 <button onClick={logout} className="underline hover:text-amber-900 transition-colors">로그인</button> 후 공식 프로젝트로 관리해 주세요.
                        </div>
                    </div>
                </div>
            )}

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 gap-4">
                    <div>
                        <h2 className="text-3xl font-black text-gray-900 mb-2">내 프로젝트</h2>
                        <p className="text-gray-500 font-medium">관리 중인 모든 프로젝트 리스트입니다.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => {
                                setJoinMode('ID');
                                setIsJoinModalOpen(true);
                            }}
                            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white border border-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm active:scale-95 whitespace-nowrap"
                        >
                            <Link size={20} className="text-purple-500" />
                            프로젝트 ID로 참여
                        </button>
                        <button
                            onClick={() => {
                                setJoinMode('CODE');
                                setIsJoinModalOpen(true);
                            }}
                            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white border border-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm active:scale-95 whitespace-nowrap"
                        >
                            <Share2 size={20} className="text-blue-500" />
                            초대 코드로 참여
                        </button>
                        <button
                            onClick={() => setIsTypeSelectionOpen(true)}
                            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95 whitespace-nowrap"
                        >
                            <Plus size={20} />
                            새 프로젝트 생성
                        </button>
                    </div>
                </div>

                {projects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[32px] border-2 border-dashed border-gray-200 shadow-sm">
                        <div className="p-6 bg-blue-50 rounded-full text-blue-400 mb-6">
                            <FolderOpen size={48} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">진행 중인 프로젝트가 없습니다.</h3>
                        <p className="text-gray-500 mb-8 max-w-xs text-center font-medium">우측 상단의 버튼을 눌러 첫 번째 프로젝트를 시작해보세요!</p>
                        <button
                            onClick={() => setIsTypeSelectionOpen(true)}
                            className="text-blue-600 font-bold hover:underline py-2 px-4 rounded-lg"
                        >
                            프로젝트 생성하기 →
                        </button>
                    </div>
                ) : (
                    <div ref={containerRef} className="relative flex flex-col gap-12">
                        {/* 연결선: 전체 컨테이너 기준 한 레이어 (같은 그룹 내 연결만 표시) */}
                        <svg className="connection-svg absolute inset-0 w-full h-full pointer-events-none z-0" style={{ minHeight: '100%' }}>
                            {projectConnections.map((conn, idx) => {
                                if (groupIdByProjectId.get(conn.fromId) !== groupIdByProjectId.get(conn.toId)) return null;
                                const from = cardPositions[conn.fromId];
                                const to = cardPositions[conn.toId];
                                if (!from || !to) return null;
                                const startX = from.x + from.w;
                                const startY = from.y + from.h / 2;
                                const endX = to.x;
                                const endY = to.y + to.h / 2;
                                const actualStartX = startX < endX ? startX : from.x;
                                const actualEndX = startX < endX ? endX : to.x + to.w;
                                const cp1x = actualStartX + (actualEndX - actualStartX) / 2;
                                const cp2x = actualStartX + (actualEndX - actualStartX) / 2;
                                const pathData = `M ${actualStartX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${actualEndX} ${endY}`;
                                return (
                                    <path
                                        key={`${conn.fromId}-${conn.toId}-${idx}`}
                                        d={pathData}
                                        fill="none"
                                        stroke="#3b82f6"
                                        strokeWidth="2.5"
                                        className="flowing-line"
                                    />
                                );
                            })}
                        </svg>
                        {connectedGroups.map((group, groupIndex) => (
                                <div
                                    key={groupIndex}
                                    className="project-group relative rounded-[32px] border border-gray-100 bg-white/50 p-8 md:p-10 shadow-sm animate-project-group-in"
                                    style={{ animationDelay: `${groupIndex * 120}ms` }}
                                >
                                    <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16 z-10">
                                        {group.map((project, cardIndex) => {
                            const isLocal = project.id.startsWith('local_');
                            const projectOwner = project.members?.find((m) => m.role === 'OWNER');
                            const isOwner = isLocal || user?.id === projectOwner?.id;
                            const linkedComponentProject = project.linkedComponentProjectId ? projects.find(p => p.id === project.linkedComponentProjectId) : undefined;
                            const hasLinkedComponent = !!linkedComponentProject;

                            return (
                                <div
                                    key={project.id}
                                    data-project-id={project.id}
                                    onClick={() => setCurrentProject(project.id)}
                                    className="group project-card bg-white rounded-[28px] p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 transition-all cursor-pointer flex flex-col h-full ring-0 hover:ring-2 ring-blue-500/20 z-10 animate-project-card-in"
                                    style={{ animationDelay: `${groupIndex * 120 + cardIndex * 80}ms` }}
                                >

                                    <div className="flex items-start justify-between mb-6">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-3 rounded-2xl transition-colors duration-300 ${project.projectType === 'SCREEN_DESIGN'
                                                ? 'bg-violet-50 text-violet-500 group-hover:bg-violet-600 group-hover:text-white'
                                                : project.projectType === 'COMPONENT'
                                                    ? 'bg-teal-50 text-teal-500 group-hover:bg-teal-600 group-hover:text-white'
                                                    : project.projectType === 'PROCESS_FLOW'
                                                        ? 'bg-amber-50 text-amber-500 group-hover:bg-amber-600 group-hover:text-white'
                                                        : 'bg-gray-50 text-blue-500 group-hover:bg-blue-600 group-hover:text-white'
                                                }`}>
                                                {project.projectType === 'SCREEN_DESIGN' ? <Monitor size={24} /> : project.projectType === 'COMPONENT' ? <Box size={24} /> : project.projectType === 'PROCESS_FLOW' ? <Users size={24} /> : <Database size={24} />}
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                {isLocal && (
                                                    <div className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-[8px] font-black uppercase tracking-wider border border-amber-100 flex items-center justify-center gap-1">
                                                        Local
                                                    </div>
                                                )}
                                                <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${project.projectType === 'SCREEN_DESIGN'
                                                    ? 'bg-violet-50 text-violet-600'
                                                    : project.projectType === 'COMPONENT'
                                                        ? 'bg-teal-50 text-teal-600'
                                                        : project.projectType === 'PROCESS_FLOW'
                                                            ? 'bg-amber-50 text-amber-600'
                                                            : 'bg-blue-50 text-blue-600'
                                                    }`}>
                                                    {project.projectType === 'SCREEN_DESIGN' ? '화면설계' : project.projectType === 'COMPONENT' ? '컴포넌트' : project.projectType === 'PROCESS_FLOW' ? '프로세스흐름' : project.dbType}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {isOwner && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingProjectInfo({
                                                            project,
                                                            name: project.name,
                                                            description: project.description ?? '',
                                                        });
                                                    }}
                                                    className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                                                    title="프로젝트 명·설명 수정"
                                                >
                                                    <Pencil size={18} />
                                                </button>
                                            )}
                                            {!isLocal && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingMembersProject(project.id);
                                                        setTempMembers(project.members || []);
                                                        setMemberInput('');
                                                    }}
                                                    className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                                                    title={isOwner ? "팀원 관리" : "참여자 목록"}
                                                >
                                                    <Users size={18} />
                                                </button>
                                            )}

                                            {isOwner && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteConfirmProject(project);
                                                        setDeletePassword('');
                                                        setDeleteError(null);
                                                    }}
                                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                    title="프로젝트 삭제"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <h3 className="text-xl font-black text-gray-900 mb-1 group-hover:text-blue-600 transition-colors uppercase">{project.name}</h3>

                                        {projectOwner && (
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Created by</span>
                                                <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                                                    {projectOwner.picture ? (
                                                        <img src={projectOwner.picture} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                                                    ) : (
                                                        <div className="w-3.5 h-3.5 rounded-full bg-blue-100 flex items-center justify-center text-[8px] text-blue-600 font-bold">
                                                            {(projectOwner.name || '?').charAt(0)}
                                                        </div>
                                                    )}
                                                    <span className="text-xs text-gray-600 font-bold">{projectOwner.name}</span>
                                                </div>
                                            </div>
                                        )}

                                        <p className="text-gray-500 text-sm line-clamp-2 font-medium">
                                            {project.description || '상세 설명이 없습니다.'}
                                        </p>
                                    </div>

                                        <div className="mt-auto pt-6 border-t border-gray-50 flex items-center justify-between" style={{display:'flex',flexDirection:'column',alignItems:'baseline'}}>
                                        <div className="flex items-center gap-2">
                                            {(project.projectType === 'SCREEN_DESIGN' || project.projectType === 'PROCESS_FLOW') && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setLinkingProjectId(project.id);
                                                        setLinkingMode('erd');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold transition-all ${getLinkedErdIds(project).length > 0
                                                        ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                                                        }`}
                                                    title="ERD 프로젝트 연결"
                                                >
                                                    <Database size={10} />
                                                    {getLinkedErdIds(project).length > 0
                                                        ? `ERD 연결 (${getLinkedErdIds(project).length}개)`
                                                        : 'ERD 연결'}
                                                </button>
                                            )}

                                            {project.projectType === 'SCREEN_DESIGN' && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setLinkingProjectId(project.id);
                                                        setLinkingMode('component');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold transition-all ${hasLinkedComponent
                                                        ? 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                                                        }`}
                                                    title="컴포넌트 프로젝트 연결"
                                                >
                                                    <Box size={10} />
                                                    {hasLinkedComponent
                                                        ? (linkedComponentProject?.name || '컴포넌트 연결됨')
                                                        : '컴포넌트 연결하기'}
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex -space-x-2">
                                            {project.members?.map((member) => (
                                                <div
                                                    key={member.id}
                                                    className="w-7 h-7 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center overflow-hidden shadow-sm"
                                                    title={`${member.name || 'Unknown'} (${member.role})`}
                                                >
                                                    {member.picture ? (
                                                        <img src={member.picture} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-gray-400">
                                                            {(member.name || '?').charAt(0)}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                                        })}
                                    </div>
                                </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Modals */}
            {isJoinModalOpen && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden scale-in">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 mb-1">
                                    {joinMode === 'CODE' ? '초대 코드로 참여' : '프로젝트 ID로 참여'}
                                </h3>
                                <p className="text-gray-500 font-medium text-sm">
                                    {joinMode === 'CODE' ? '공유받은 초대 코드를 입력하세요.' : '참여할 프로젝트의 고유 ID를 입력하세요.'}
                                </p>
                            </div>
                            <button onClick={() => setIsJoinModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 ml-1">
                                    {joinMode === 'CODE' ? <Share2 size={14} className="text-blue-500" /> : <Link size={14} className="text-purple-500" />}
                                    {joinMode === 'CODE' ? '초대 코드' : '프로젝트 ID'}
                                </label>
                                <input
                                    type="text"
                                    value={displayValue('joinCode', joinCode)}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                            setComposing({ field: 'joinCode', value: v });
                                            return;
                                        }
                                        setComposing(null);
                                        setJoinCode(joinMode === 'CODE' ? v.toUpperCase() : v);
                                    }}
                                    onCompositionEnd={(e) => {
                                        const v = (e.target as HTMLInputElement).value;
                                        setComposing(null);
                                        setJoinCode(joinMode === 'CODE' ? v.toUpperCase() : v);
                                    }}
                                    placeholder={joinMode === 'CODE' ? '8자리 초대 코드 입력' : '프로젝트 ID 입력'}
                                    className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold tracking-wider text-center text-lg"
                                />
                            </div>
                            <button
                                disabled={!localStorage.getItem('auth-token') || !joinCode.trim()}
                                onClick={async () => {
                                    await handleJoinProject(joinCode);
                                    setIsJoinModalOpen(false);
                                    setJoinCode('');
                                }}
                                className="w-full py-4 px-6 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:bg-gray-400"
                            >
                                <Share2 size={18} />
                                {!localStorage.getItem('auth-token') ? '로그인 후 참여 가능' : '프로젝트 참여하기'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 프로젝트 명·프로젝트 설명 편집 패널 */}
            {editingProjectInfo && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditingProjectInfo(null)}>
                    <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden scale-in" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="text-lg font-black text-gray-900">프로젝트 정보 수정</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">프로젝트 명</label>
                                <input
                                    type="text"
                                    value={editingProjectInfo.name}
                                    onChange={(e) => setEditingProjectInfo((prev) => prev ? { ...prev, name: e.target.value } : null)}
                                    placeholder="프로젝트 이름"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">프로젝트 설명</label>
                                <textarea
                                    value={editingProjectInfo.description}
                                    onChange={(e) => setEditingProjectInfo((prev) => prev ? { ...prev, description: e.target.value } : null)}
                                    placeholder="상세 설명을 입력하세요"
                                    rows={3}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none"
                                />
                            </div>
                            <div className="flex gap-3 justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingProjectInfo(null)}
                                    className="px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const { project, name, description } = editingProjectInfo;
                                        await updateProjectMetadata(project.id, { name: name.trim() || project.name, description: description.trim() || '' });
                                        setEditingProjectInfo(null);
                                    }}
                                    className="px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
                                >
                                    저장
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 프로젝트 삭제 확인: 생성자 비밀번호 검증 + 안내문구 후 삭제 */}
            {deleteConfirmProject && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden scale-in">
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="text-lg font-black text-gray-900">프로젝트 삭제</h3>
                            <p className="text-sm text-gray-500 mt-1">"{deleteConfirmProject.name}"</p>
                        </div>
                        <div className="p-6 space-y-4">
                            {!deleteConfirmProject.id.startsWith('local_') && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">비밀번호 확인</label>
                                    <input
                                        type="password"
                                        value={deletePassword}
                                        onChange={(e) => {
                                            setDeletePassword(e.target.value);
                                            setDeleteError(null);
                                        }}
                                        placeholder="로그인한 계정의 비밀번호를 입력하세요"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400"
                                        disabled={deleteVerifying}
                                    />
                                    {deleteError && (
                                        <p className="mt-1.5 text-sm text-red-600 font-medium">{deleteError}</p>
                                    )}
                                </div>
                            )}
                            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800 font-medium">
                                한번 삭제한 프로젝트는 되돌릴 수 없습니다. 정말 삭제 하시겠습니까?
                            </div>
                            <div className="flex gap-3 justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDeleteConfirmProject(null);
                                        setDeletePassword('');
                                        setDeleteError(null);
                                    }}
                                    disabled={deleteVerifying}
                                    className="px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    disabled={!deleteConfirmProject.id.startsWith('local_') && !deletePassword.trim()}
                                    onClick={async () => {
                                        if (!deleteConfirmProject) return;
                                        const isLocal = deleteConfirmProject.id.startsWith('local_');
                                        if (isLocal) {
                                            deleteProject(deleteConfirmProject.id);
                                            if (currentProjectId === deleteConfirmProject.id) setCurrentProject(null);
                                            setDeleteConfirmProject(null);
                                            setDeletePassword('');
                                            setDeleteError(null);
                                            return;
                                        }
                                        setDeleteVerifying(true);
                                        setDeleteError(null);
                                        const AUTH_API = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:3001/api/auth';
                                        try {
                                            const res = await fetchWithAuth(`${AUTH_API}/verify-password`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ password: deletePassword }),
                                            });
                                            const data = res.ok ? await res.json() : await res.json().catch(() => ({}));
                                            if (!res.ok) {
                                                setDeleteError(data?.message || '비밀번호가 일치하지 않습니다.');
                                                setDeleteVerifying(false);
                                                return;
                                            }
                                            await deleteProject(deleteConfirmProject.id);
                                            if (currentProjectId === deleteConfirmProject.id) setCurrentProject(null);
                                            setDeleteConfirmProject(null);
                                            setDeletePassword('');
                                            setDeleteError(null);
                                        } catch (err: any) {
                                            setDeleteError(err?.message || '확인 중 오류가 발생했습니다.');
                                        } finally {
                                            setDeleteVerifying(false);
                                        }
                                    }}
                                    className="px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    {deleteVerifying ? '확인 중...' : '확인'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isTypeSelectionOpen && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-4xl shadow-2xl overflow-hidden scale-in">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 mb-2">프로젝트 유형 선택</h3>
                                <p className="text-gray-500 font-medium text-sm">생성할 프로젝트의 유형을 선택해주세요.</p>
                            </div>
                            <button onClick={() => setIsTypeSelectionOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-8">
                            <div className="grid grid-cols-4 gap-4">
                                <button onClick={() => handleSelectProjectType('ERD')} className="group relative flex flex-col items-center p-8 rounded-3xl border-2 border-gray-100 bg-gray-50/50 hover:border-blue-400 hover:bg-blue-50/80 transition-all duration-300 active:scale-[0.97]">
                                    <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-5 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                        <Database size={28} />
                                    </div>
                                    <h4 className="text-lg font-black text-gray-900 mb-2">ERD 프로젝트</h4>
                                    <p className="text-xs text-gray-500 text-center font-medium">데이터베이스 엔티티 관계를 설계하고 관리합니다</p>
                                </button>
                                <button onClick={() => handleSelectProjectType('SCREEN_DESIGN')} className="group relative flex flex-col items-center p-8 rounded-3xl border-2 border-gray-100 bg-gray-50/50 hover:border-violet-400 hover:bg-violet-50/80 transition-all duration-300 active:scale-[0.97]">
                                    <div className="w-16 h-16 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center mb-5 group-hover:bg-violet-600 group-hover:text-white transition-all">
                                        <Monitor size={28} />
                                    </div>
                                    <h4 className="text-lg font-black text-gray-900 mb-2">화면 설계서</h4>
                                    <p className="text-xs text-gray-500 text-center font-medium">UI/UX 화면 구조를 설계하고 관리합니다</p>
                                </button>
                                <button onClick={() => handleSelectProjectType('PROCESS_FLOW')} className="group relative flex flex-col items-center p-8 rounded-3xl border-2 border-gray-100 bg-gray-50/50 hover:border-amber-400 hover:bg-amber-50/80 transition-all duration-300 active:scale-[0.97]">
                                    <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-5 group-hover:bg-amber-600 group-hover:text-white transition-all">
                                        <Users size={28} />
                                    </div>
                                    <h4 className="text-lg font-black text-gray-900 mb-2">프로세스 흐름도</h4>
                                    <p className="text-xs text-gray-500 text-center font-medium">업무/사용자 흐름을 도형과 연결선으로 설계합니다</p>
                                </button>
                                <PremiumTooltip
                                    label={(user?.tier === 'PRO' || user?.tier === 'MASTER')
                                        ? '컴포넌트 프로젝트 생성'
                                        : 'Pro tier 이상부터 사용 가능합니다. 관리자에게 문의해 주세요.'}
                                    dotColor={(user?.tier === 'PRO' || user?.tier === 'MASTER') ? '#14b8a6' : undefined}
                                >
                                    <div className="relative">
                                        <button
                                            onClick={() => {
                                                const tier = user?.tier || 'FREE';
                                                if (tier !== 'PRO' && tier !== 'MASTER') return;
                                                handleSelectProjectType('COMPONENT');
                                            }}
                                            className={`group relative flex flex-col items-center p-8 rounded-3xl border-2 border-gray-100 transition-all duration-300 w-full ${(user?.tier === 'PRO' || user?.tier === 'MASTER')
                                                ? 'bg-gray-50/50 hover:border-teal-400 hover:bg-teal-50/80 active:scale-[0.97]'
                                                : 'cursor-not-allowed opacity-75'}`}
                                        >
                                            {(user?.tier !== 'PRO' && user?.tier !== 'MASTER') && (
                                                <div className="absolute top-1 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                                    <Crown size={14} className="text-amber-600" />
                                                    <span className="text-xs font-bold">Pro tier</span>
                                                </div>
                                            )}
                                            <div className="w-16 h-16 rounded-2xl bg-teal-100 text-teal-600 flex items-center justify-center mb-5 group-hover:bg-teal-600 group-hover:text-white transition-all">
                                                <Box size={28} />
                                            </div>
                                            <h4 className="text-lg font-black text-gray-900 mb-2">컴포넌트 프로젝트</h4>
                                            <p className="text-xs text-gray-500 text-center font-medium">재사용 가능한 UI 컴포넌트를 설계하고 관리합니다</p>
                                        </button>
                                    </div>
                                </PremiumTooltip>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden scale-in">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => {
                                        setIsCreateModalOpen(false);
                                        setIsTypeSelectionOpen(true);
                                    }}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                                >
                                    <ArrowLeft size={20} />
                                </button>
                                <div>
                                    <h3 className="text-2xl font-black text-gray-900">
                                        {selectedProjectType === 'SCREEN_DESIGN'
                                            ? '화면 설계서 생성'
                                            : selectedProjectType === 'COMPONENT'
                                                ? '컴포넌트 프로젝트 생성'
                                                : selectedProjectType === 'PROCESS_FLOW'
                                                    ? '프로세스 흐름도 생성'
                                                    : 'ERD 프로젝트 생성'}
                                    </h3>
                                </div>
                            </div>
                            <button onClick={() => setIsCreateModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateProject} className="p-8 space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">프로젝트 명</label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={displayValue('newProjectName', newProjectName)}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                            setComposing({ field: 'newProjectName', value: v });
                                            return;
                                        }
                                        setComposing(null);
                                        setNewProjectName(v);
                                    }}
                                    onCompositionEnd={(e) => {
                                        const v = (e.target as HTMLInputElement).value;
                                        setComposing(null);
                                        setNewProjectName(v);
                                    }}
                                    placeholder="프로젝트명을 입력하세요"
                                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white outline-none transition-all font-medium"
                                />
                            </div>
                            {(selectedProjectType === 'ERD' || selectedProjectType === 'SCREEN_DESIGN') && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-3 ml-1">
                                        데이터베이스 엔진
                                        {selectedProjectType === 'SCREEN_DESIGN' && <span className="text-[10px] text-gray-400 font-normal ml-2">(명세서의 기본 데이터 타입을 결정합니다)</span>}
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {(['MySQL', 'PostgreSQL', 'Oracle', 'MSSQL'] as DBType[]).map((type) => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setNewProjectDbType(type)}
                                                className={`py-3 px-4 rounded-2xl border-2 transition-all font-bold text-sm ${newProjectDbType === type
                                                    ? (selectedProjectType === 'SCREEN_DESIGN' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-blue-500 bg-blue-50 text-blue-600')
                                                    : 'border-gray-100 bg-gray-50 text-gray-400'}`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedProjectType === 'PROCESS_FLOW' && (
                                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                                    <div className="flex items-center gap-2 text-amber-700">
                                        <Users size={16} />
                                        <span className="text-sm font-medium">프로세스 흐름도는 데이터베이스가 필요 없습니다</span>
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">설명 (선택사항)</label>
                                <textarea
                                    value={displayValue('newProjectDesc', newProjectDesc)}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                            setComposing({ field: 'newProjectDesc', value: v });
                                            return;
                                        }
                                        setComposing(null);
                                        setNewProjectDesc(v);
                                    }}
                                    onCompositionEnd={(e) => {
                                        const v = (e.target as HTMLTextAreaElement).value;
                                        setComposing(null);
                                        setNewProjectDesc(v);
                                    }}
                                    placeholder="프로젝트 설명을 입력하세요"
                                    rows={2}
                                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white outline-none transition-all font-medium resize-none"
                                />
                            </div>
                            {createError && <div className="p-3 bg-red-50 text-red-500 text-xs rounded-xl border border-red-100">{createError}</div>}
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-4 px-6 bg-gray-50 text-gray-600 rounded-2xl font-bold">취소</button>
                                <button type="submit" disabled={isLoading} className={`flex-[2] py-4 px-6 text-white rounded-2xl font-bold ${selectedProjectType === 'SCREEN_DESIGN' ? 'bg-violet-600' : selectedProjectType === 'COMPONENT' ? 'bg-teal-600' : selectedProjectType === 'PROCESS_FLOW' ? 'bg-amber-600' : 'bg-blue-600'}`}>
                                    {isLoading ? '생성 중...' : '생성하기'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingMembersProject && targetProject && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden scale-in">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 mb-1">팀원 관리</h3>
                                <p className="text-gray-500 font-medium text-sm">{targetProject.name}의 협업자 목록</p>
                            </div>
                            <button onClick={() => setEditingMembersProject(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                {tempMembers.map((member) => (
                                    <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                                                {member.picture ? <img src={member.picture} alt="" className="w-full h-full rounded-full object-cover" /> : (member.name || '?').charAt(0)}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-800">{member.name || 'Unknown User'}</div>
                                                <div className="text-[10px] text-gray-400 font-medium">{member.email}</div>
                                            </div>
                                        </div>
                                        {member.role !== 'OWNER' && (
                                            <button onClick={() => handleRemoveMember(member.id, true)} className="p-1.5 text-gray-400 hover:text-red-500">
                                                <UserMinus size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="pt-4 border-t border-gray-100">
                                <label className="block text-sm font-bold text-gray-700 mb-3 ml-1">새 팀원 초대</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={displayValue('memberInput', memberInput)}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                                setComposing({ field: 'memberInput', value: v });
                                                return;
                                            }
                                            setComposing(null);
                                            setMemberInput(v);
                                        }}
                                        onCompositionEnd={(e) => {
                                            const v = (e.target as HTMLInputElement).value;
                                            setComposing(null);
                                            setMemberInput(v);
                                        }}
                                        placeholder="이메일 입력"
                                        className="flex-1 px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl outline-none"
                                    />
                                    <button onClick={() => handleAddMember(true)} className="px-4 bg-gray-900 text-white rounded-2xl font-bold">초대</button>
                                </div>
                            </div>
                            <button onClick={handleUpdateMembers} className="w-full py-4 px-6 bg-blue-600 text-white rounded-2xl font-bold">저장하기</button>
                        </div>
                    </div>
                </div>
            )}

            {linkingProjectId && linkingMode && (() => {
                const linkingProject = projects.find(p => p.id === linkingProjectId);
                const linkedErdIds = linkingProject ? getLinkedErdIds(linkingProject) : [];
                const erdProjects = projects.filter(p => p.projectType === 'ERD');
                const unlinkedErdProjects = erdProjects.filter(p => !linkedErdIds.includes(p.id));

                return (
                    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden scale-in">
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 mb-1">
                                        {linkingMode === 'erd' ? 'ERD 프로젝트 연결' : '컴포넌트 프로젝트 연결'}
                                    </h3>
                                    <p className="text-gray-500 font-medium text-xs">
                                        {linkingMode === 'erd' ? '연결된 ERD를 관리하거나 추가하세요. (여러 개 연결 가능)' : '연동할 컴포넌트 프로젝트를 선택하세요.'}
                                    </p>
                                </div>
                                <button onClick={() => { setLinkingProjectId(null); setLinkingMode(null); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                                    <X size={20} />
                                </button>
                            </div>
                            {linkingMode === 'erd' ? (
                                <>
                                    <div className="p-4 border-b border-gray-100">
                                        <p className="text-xs font-bold text-gray-500 mb-2">연결된 ERD 프로젝트</p>
                                        {linkedErdIds.length === 0 ? (
                                            <p className="text-sm text-gray-400">연결된 ERD가 없습니다.</p>
                                        ) : (
                                            <ul className="space-y-2 max-h-[180px] overflow-y-auto">
                                                {linkedErdIds.map((erdId) => {
                                                    const proj = projects.find(p => p.id === erdId);
                                                    return (
                                                        <li key={erdId} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                                                                    <Database size={16} />
                                                                </div>
                                                                <span className="font-bold text-gray-900 truncate">{proj?.name || erdId}</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    const next = linkedErdIds.filter(id => id !== erdId);
                                                                    await updateProjectMetadata(linkingProjectId, { linkedErdProjectIds: next });
                                                                }}
                                                                className="flex-shrink-0 px-2 py-1 text-xs font-bold text-red-500 hover:bg-red-100 rounded-lg"
                                                            >
                                                                제거
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                    <div className="p-4">
                                        <p className="text-xs font-bold text-gray-500 mb-2">ERD 프로젝트 추가</p>
                                        {unlinkedErdProjects.length === 0 ? (
                                            <p className="text-sm text-gray-400">추가할 수 있는 ERD 프로젝트가 없습니다.</p>
                                        ) : (
                                            <ul className="space-y-1 max-h-[200px] overflow-y-auto">
                                                {unlinkedErdProjects.map((proj) => (
                                                    <button
                                                        key={proj.id}
                                                        type="button"
                                                        onClick={async () => {
                                                            const next = [...linkedErdIds, proj.id];
                                                            await updateProjectMetadata(linkingProjectId, { linkedErdProjectIds: next });
                                                        }}
                                                        className="w-full p-3 rounded-xl flex items-center gap-3 text-left hover:bg-blue-50 border border-transparent hover:border-blue-100"
                                                    >
                                                        <div className="w-9 h-9 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0">
                                                            <Database size={16} />
                                                        </div>
                                                        <span className="font-bold text-gray-900 truncate">{proj.name}</span>
                                                    </button>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                                        <button
                                            onClick={async () => {
                                                await updateProjectMetadata(linkingProjectId, { linkedErdProjectIds: [] });
                                                setLinkingProjectId(null);
                                                setLinkingMode(null);
                                            }}
                                            className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg"
                                        >
                                            전체 연결 해제
                                        </button>
                                        <button
                                            onClick={() => { setLinkingProjectId(null); setLinkingMode(null); }}
                                            className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200 rounded-lg"
                                        >
                                            닫기
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="p-2 max-h-[400px] overflow-y-auto">
                                        {projects.filter(p => p.projectType === 'COMPONENT').map((proj) => (
                                            <button
                                                key={proj.id}
                                                onClick={async () => {
                                                    await updateProjectMetadata(linkingProjectId, { linkedComponentProjectId: proj.id });
                                                    setLinkingProjectId(null);
                                                    setLinkingMode(null);
                                                }}
                                                className="w-full p-4 rounded-xl flex items-center gap-4 text-left hover:bg-teal-50"
                                            >
                                                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-100 text-teal-600">
                                                    <Box size={18} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-gray-900 truncate">{proj.name}</h4>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                                        <button
                                            onClick={async () => {
                                                await updateProjectMetadata(linkingProjectId, { linkedComponentProjectId: undefined });
                                                setLinkingProjectId(null);
                                                setLinkingMode(null);
                                            }}
                                            className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg"
                                        >
                                            연결 해제
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}

            <footer className="py-10 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">
                © 2026 Blue Print Lab. 모든 권리 보유.
            </footer>
        </div>
    );
};

export default ProjectListPage;
