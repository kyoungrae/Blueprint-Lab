import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { Plus, FolderOpen, Trash2, LogOut, Database, Users, UserMinus, X, Share2, AlertTriangle, Link, Monitor, ArrowLeft, Box, Shield, Crown, Pencil, GanttChartSquare, MoreHorizontal } from 'lucide-react';
import './ProjectListPage.css';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useProjectStore } from '../store/projectStore';
import { useAuthStore } from '../store/authStore';
import { fetchWithAuth } from '../utils/fetchWithAuth';
import type { Project, DBType, ProjectType, ProjectMember } from '../types/erd';
import AdminPage from './AdminPage';
import PremiumTooltip from './screenNode/PremiumTooltip';

const PROJECT_TYPE_ORDER: Record<ProjectType, number> = { ERD: 0, SCREEN_DESIGN: 1, COMPONENT: 2, PROCESS_FLOW: 3, WBS: 4 };

const GROUP_PALETTE = [
    { letter: 'A', border: '#BFDBFE', bg: 'rgba(239,246,255,0.6)', text: '#2563EB', badgeBg: '#DBEAFE', badgeText: '#1D4ED8' },
    { letter: 'B', border: '#6EE7B7', bg: 'rgba(240,253,244,0.6)', text: '#059669', badgeBg: '#D1FAE5', badgeText: '#047857' },
    { letter: 'C', border: '#FED7AA', bg: 'rgba(255,247,237,0.6)', text: '#EA580C', badgeBg: '#FFEDD5', badgeText: '#C2410C' },
    { letter: 'D', border: '#FDE68A', bg: 'rgba(255,251,235,0.6)', text: '#D97706', badgeBg: '#FEF3C7', badgeText: '#B45309' },
    { letter: 'E', border: '#DDD6FE', bg: 'rgba(245,243,255,0.6)', text: '#7C3AED', badgeBg: '#EDE9FE', badgeText: '#6D28D9' },
    { letter: 'F', border: '#FBCFE8', bg: 'rgba(253,242,248,0.6)', text: '#DB2777', badgeBg: '#FCE7F3', badgeText: '#BE185D' },
];

function getProjectTypeInfo(project: Project) {
    switch (project.projectType) {
        case 'SCREEN_DESIGN': return { icon: <Monitor size={22} />, bg: 'bg-violet-100', color: 'text-violet-500', label: '화면설계' };
        case 'COMPONENT':     return { icon: <Box size={22} />,     bg: 'bg-teal-100',   color: 'text-teal-500',   label: '컴포넌트' };
        case 'PROCESS_FLOW':  return { icon: <Users size={22} />,   bg: 'bg-amber-100',  color: 'text-amber-500',  label: '프로세스흐름' };
        case 'WBS':           return { icon: <GanttChartSquare size={22} />, bg: 'bg-emerald-100', color: 'text-emerald-500', label: 'WBS' };
        default: {
            const isOracle = project.dbType === 'Oracle';
            const isPg     = project.dbType === 'PostgreSQL';
            const isMssql  = project.dbType === 'MSSQL';
            return {
                icon: <Database size={22} />,
                bg:    isOracle ? 'bg-orange-100' : 'bg-blue-100',
                color: isOracle ? 'text-orange-500' : 'text-blue-500',
                label: isOracle ? 'ORACLE' : isPg ? 'POSTGRESQL' : isMssql ? 'MSSQL' : 'MYSQL',
            };
        }
    }
}

const LegendItem: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
    <div className="flex items-center gap-1.5 text-gray-500">
        {icon}
        <span className="text-[11px] font-bold">{label}</span>
    </div>
);

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
    const [groupPositions, setGroupPositions] = useState<Record<string, { x: number, y: number, w: number, h: number }>>({});

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

        // 그룹 박스 위치 측정 (연결선이 그룹을 가로지르지 않도록 라우팅에 사용)
        const newGroupPositions: Record<string, { x: number, y: number, w: number, h: number }> = {};
        container.querySelectorAll('.project-group-box').forEach((el) => {
            const id = (el as HTMLElement).dataset.groupId;
            if (id) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0) {
                    newGroupPositions[id] = {
                        x: rect.left - containerRect.left,
                        y: rect.top - containerRect.top,
                        w: rect.width,
                        h: rect.height
                    };
                }
            }
        });
        if (Object.keys(newGroupPositions).length > 0) {
            setGroupPositions(prev => {
                const merged = { ...prev, ...newGroupPositions };
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

    // COMPONENT 프로젝트는 그룹에서 제외 → 독립 노드로 표시
    const standaloneComponents = useMemo(
        () => projects.filter((p) => p.projectType === 'COMPONENT'),
        [projects],
    );

    // screen design → component 연결 링크 (SVG 곡선용)
    const componentLinks = useMemo(() => {
        const links: { fromId: string; toId: string }[] = [];
        projects.forEach((p) => {
            if (p.projectType === 'SCREEN_DESIGN' && p.linkedComponentProjectId) {
                links.push({ fromId: p.id, toId: p.linkedComponentProjectId });
            }
        });
        return links;
    }, [projects]);

    // 그룹핑에 사용할 연결 (COMPONENT 연결 제외)
    const groupingConnections = useMemo(() => {
        const connections: { fromId: string; toId: string }[] = [];
        projects.forEach((p) => {
            if (p.projectType === 'SCREEN_DESIGN' || p.projectType === 'PROCESS_FLOW') {
                getLinkedErdIds(p).forEach((erdId) => connections.push({ fromId: p.id, toId: erdId }));
            }
        });
        return connections;
    }, [projects]);

    // COMPONENT 제외한 프로젝트로 그룹 구성
    const connectedGroups = useMemo(() => {
        const nonComp = projects.filter((p) => p.projectType !== 'COMPONENT');
        const idToProject = new Map(nonComp.map((p) => [p.id, p]));
        const adj = new Map<string, Set<string>>();
        nonComp.forEach((p) => adj.set(p.id, new Set()));
        groupingConnections.forEach(({ fromId, toId }) => {
            if (adj.has(fromId) && adj.has(toId)) {
                adj.get(fromId)?.add(toId);
                adj.get(toId)?.add(fromId);
            }
        });
        const visited = new Set<string>();
        const components: string[][] = [];
        nonComp.forEach((p) => {
            if (visited.has(p.id)) return;
            const stack = [p.id];
            const comp: string[] = [];
            while (stack.length) {
                const id = stack.pop()!;
                if (visited.has(id)) continue;
                visited.add(id);
                comp.push(id);
                adj.get(id)?.forEach((nb) => { if (!visited.has(nb)) stack.push(nb); });
            }
            if (comp.length) components.push(comp);
        });
        const groups = components.map((comp) =>
            comp.map((id) => idToProject.get(id)!).filter(Boolean)
                .sort((a, b) => PROJECT_TYPE_ORDER[a.projectType] - PROJECT_TYPE_ORDER[b.projectType]),
        );
        groups.sort((ga, gb) => {
            const orderA = PROJECT_TYPE_ORDER[ga[0]?.projectType ?? 'ERD'];
            const orderB = PROJECT_TYPE_ORDER[gb[0]?.projectType ?? 'ERD'];
            if (orderA !== orderB) return orderA - orderB;
            return (ga[0]?.name ?? '').localeCompare(gb[0]?.name ?? '');
        });
        return groups;
    }, [projects, groupingConnections]);

    // 컴포넌트와 연결된 그룹은 위쪽, 나머지는 아래쪽 (공유 컴포넌트 노드가 그 사이 중앙에 위치)
    const { topGroups, bottomGroups } = useMemo(() => {
        const linkedSourceIds = new Set(componentLinks.map((l) => l.fromId));
        if (standaloneComponents.length === 0 || linkedSourceIds.size === 0) {
            return { topGroups: connectedGroups, bottomGroups: [] as Project[][] };
        }
        const top: Project[][] = [];
        const bottom: Project[][] = [];
        connectedGroups.forEach((g) => (g.some((p) => linkedSourceIds.has(p.id)) ? top : bottom).push(g));
        if (top.length === 0) return { topGroups: connectedGroups, bottomGroups: [] as Project[][] };
        return { topGroups: top, bottomGroups: bottom };
    }, [connectedGroups, componentLinks, standaloneComponents]);

    const orderedGroups = useMemo(() => [...topGroups, ...bottomGroups], [topGroups, bottomGroups]);

    const groupIdByProjectId = useMemo(() => {
        const map = new Map<string, number>();
        orderedGroups.forEach((group, gi) => group.forEach((p) => map.set(p.id, gi)));
        return map;
    }, [orderedGroups]);


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
                (selectedProjectType === 'PROCESS_FLOW' || selectedProjectType === 'WBS') ? 'MySQL' : newProjectDbType, // Process Flow·WBS don't need DB but API requires it
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

    // 그룹 카드 렌더링 (흰 배경 그룹 + 아이콘/컬러 라벨/이름 카드)
    const renderProjectGroup = (group: Project[]) => {
        const groupIndex = groupIdByProjectId.get(group[0]?.id ?? '') ?? 0;
        const palette = GROUP_PALETTE[groupIndex % GROUP_PALETTE.length];
        return (
            <div
                key={group[0]?.id ?? groupIndex}
                data-group-id={group[0]?.id}
                className="project-group-box rounded-2xl border border-gray-200/70 bg-white p-6 shadow-sm animate-project-group-in"
                style={{ animationDelay: `${groupIndex * 120}ms` }}
            >
                {/* 그룹 헤더 */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <span className="text-base font-black" style={{ color: palette.text }}>{palette.letter} 그룹</span>
                        <span className="text-xs font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: palette.badgeBg, color: palette.badgeText }}>{group.length}</span>
                    </div>
                    <button className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors" title="그룹 옵션">
                        <MoreHorizontal size={16} />
                    </button>
                </div>

                {/* 카드 + 그룹 내부 연결선 */}
                <div className="flex items-center overflow-x-auto pb-1 gap-0">
                    {group.map((project, cardIdx) => {
                        const typeInfo = getProjectTypeInfo(project);
                        const isLocal = project.id.startsWith('local_');
                        const projectOwner = project.members?.find(m => m.role === 'OWNER');
                        const isOwner = isLocal || user?.id === projectOwner?.id;
                        const isLinkable = project.projectType === 'SCREEN_DESIGN' || project.projectType === 'PROCESS_FLOW';
                        const erdCount = getLinkedErdIds(project).length;
                        return (
                            <React.Fragment key={project.id}>
                                {cardIdx > 0 && (
                                    <svg width="40" height="16" className="shrink-0 self-center">
                                        <line x1="2" y1="8" x2="38" y2="8" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="5,3" strokeLinecap="round" />
                                    </svg>
                                )}
                                <div
                                    data-project-id={project.id}
                                    className="project-card group relative bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-1.5 cursor-pointer hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-0.5 transition-all animate-project-card-in shrink-0"
                                    style={{ width: 150, animationDelay: `${groupIndex * 120 + cardIdx * 80}ms` }}
                                    onClick={() => setCurrentProject(project.id)}
                                >
                                    {/* 호버 액션 */}
                                    <div className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-0.5 z-20">
                                        {isLinkable && <button onClick={(e) => { e.stopPropagation(); setLinkingProjectId(project.id); setLinkingMode('erd'); }} className={`p-1 rounded-lg hover:bg-blue-50 ${erdCount > 0 ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500'}`} title={erdCount > 0 ? `ERD 연결 (${erdCount})` : 'ERD 연결'}><Database size={11} /></button>}
                                        {project.projectType === 'SCREEN_DESIGN' && <button onClick={(e) => { e.stopPropagation(); setLinkingProjectId(project.id); setLinkingMode('component'); }} className={`p-1 rounded-lg hover:bg-teal-50 ${project.linkedComponentProjectId ? 'text-teal-500' : 'text-gray-300 hover:text-teal-500'}`} title="컴포넌트 연결"><Box size={11} /></button>}
                                        {isOwner && <button onClick={(e) => { e.stopPropagation(); setEditingProjectInfo({ project, name: project.name, description: project.description ?? '' }); }} className="p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg" title="수정"><Pencil size={11} /></button>}
                                        {!isLocal && <button onClick={(e) => { e.stopPropagation(); setEditingMembersProject(project.id); setTempMembers(project.members || []); setMemberInput(''); }} className="p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg" title="팀원"><Users size={11} /></button>}
                                        {isOwner && <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmProject(project); setDeletePassword(''); setDeleteError(null); }} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg" title="삭제"><Trash2 size={11} /></button>}
                                    </div>
                                    <div className={`mt-2 ${typeInfo.color}`}>{typeInfo.icon}</div>
                                    <span className={`text-[10px] font-black uppercase tracking-wider ${typeInfo.color}`}>{typeInfo.label}</span>
                                    <span className="text-[12px] font-bold text-gray-800 text-center leading-snug px-1 w-full truncate mb-1">{project.name}</span>
                                    {isLocal && <div className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[8px] font-black border border-amber-100">Local</div>}
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        );
    };

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
                        {user?.tier === 'ADMIN' && (
                            <button
                                onClick={() => setShowAdminPage(true)}
                                className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all active:scale-95"
                                title="관리자 페이지"
                            >
                                <Shield size={20} />
                            </button>
                        )}
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
                    <div ref={containerRef} className="relative flex flex-col gap-6">
                        {/* SVG: screen design → 독립 컴포넌트 노드 곡선 연결선 */}
                        <svg className="connection-svg absolute inset-0 w-full h-full pointer-events-none z-10" style={{ minHeight: '100%', overflow: 'visible' }}>
                            <defs>
                                <marker id="arrow-blue" markerWidth="0" markerHeight="0" refX="0" refY="0" />
                            </defs>
                            {(() => {
                                // 타겟 컴포넌트별로 링크를 모아 인덱스 부여 → 선 겹침 방지 오프셋 계산
                                const byTarget = new Map<string, { fromId: string; toId: string }[]>();
                                componentLinks.forEach((l) => {
                                    if (!byTarget.has(l.toId)) byTarget.set(l.toId, []);
                                    byTarget.get(l.toId)!.push(l);
                                });
                                const paths: React.ReactNode[] = [];
                                byTarget.forEach((links, toId) => {
                                    const to = cardPositions[toId];
                                    if (!to) return;
                                    const n = links.length;
                                    // 출발 카드 x좌표 순으로 정렬해 선이 교차하지 않게 진입점 배분
                                    const sorted = [...links].sort((a, b) => (cardPositions[a.fromId]?.x ?? 0) - (cardPositions[b.fromId]?.x ?? 0));
                                    sorted.forEach((link, i) => {
                                        const from = cardPositions[link.fromId];
                                        if (!from) return;
                                        const gi = groupIdByProjectId.get(link.fromId) ?? 0;
                                        const palette = GROUP_PALETTE[gi % GROUP_PALETTE.length];
                                        const groupRect = groupPositions[orderedGroups[gi]?.[0]?.id ?? ''];

                                        const sx = from.x + from.w / 2;          // 출발: 카드 하단 중앙
                                        const sy = from.y + from.h;
                                        const cx = to.x + to.w / 2;              // 컴포넌트 중앙 (그리드 컬럼 사이 통로와 일치)
                                        const ty = to.y;                          // 도착: 컴포넌트 상단

                                        // 진입점: 상단 모서리에 링크별로 분산 (겹침 방지)
                                        const spread = (i - (n - 1) / 2) * 12;
                                        const gx = Math.min(Math.max(cx + spread, to.x + 14), to.x + to.w - 14);

                                        // 1차 꺾임 높이: 출발 그룹 박스 바로 아래 행 간격 안 (링크별 오프셋, 그룹을 가로지르지 않음)
                                        const y1Base = groupRect ? groupRect.y + groupRect.h : sy + 28;
                                        const y1 = Math.min(y1Base + 8 + i * 6, ty - 10);

                                        paths.push(
                                            <path
                                                key={`cl-${link.fromId}-${toId}`}
                                                d={`M ${sx} ${sy} L ${sx} ${y1} L ${gx} ${y1} L ${gx} ${ty}`}
                                                fill="none"
                                                stroke={palette.text}
                                                strokeWidth="2"
                                                strokeDasharray="6,4"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                opacity="0.55"
                                            />
                                        );
                                    });
                                });
                                return paths;
                            })()}
                        </svg>

                        {/* 상단 그룹 (공유 컴포넌트와 연결된 그룹) */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
                            {topGroups.map((group) => renderProjectGroup(group))}
                        </div>

                        {/* ── 공유 컴포넌트 노드 (그룹 사이 중앙) ── */}
                        {standaloneComponents.length > 0 && (
                            <div className="relative z-10 flex items-start justify-center gap-12 py-6 flex-wrap">
                                {standaloneComponents.map((comp, ci) => {
                                    const isLocal = comp.id.startsWith('local_');
                                    const projectOwner = comp.members?.find(m => m.role === 'OWNER');
                                    const isOwner = isLocal || user?.id === projectOwner?.id;
                                    const linkedFromCount = componentLinks.filter(l => l.toId === comp.id).length;
                                    return (
                                        <div key={comp.id} className="flex flex-col items-center gap-3">
                                            <div
                                                data-project-id={comp.id}
                                                className="project-card group relative bg-white rounded-2xl border border-gray-100 shadow-md px-7 py-5 flex flex-col items-center gap-2.5 cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all animate-project-card-in"
                                                style={{ minWidth: 200, animationDelay: `${ci * 100}ms` }}
                                                onClick={() => setCurrentProject(comp.id)}
                                            >
                                                {/* 연결 수 뱃지 */}
                                                {linkedFromCount > 0 && (
                                                    <div className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center shadow">
                                                        {linkedFromCount}
                                                    </div>
                                                )}
                                                {/* 호버 액션 */}
                                                <div className="absolute top-1.5 left-1.5 hidden group-hover:flex gap-0.5 z-20">
                                                    {isOwner && <button onClick={(e) => { e.stopPropagation(); setEditingProjectInfo({ project: comp, name: comp.name, description: comp.description ?? '' }); }} className="p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg" title="수정"><Pencil size={11} /></button>}
                                                    {!isLocal && <button onClick={(e) => { e.stopPropagation(); setEditingMembersProject(comp.id); setTempMembers(comp.members || []); setMemberInput(''); }} className="p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg" title="팀원"><Users size={11} /></button>}
                                                    {isOwner && <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmProject(comp); setDeletePassword(''); setDeleteError(null); }} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg" title="삭제"><Trash2 size={11} /></button>}
                                                </div>
                                                <div className="flex items-center gap-2.5">
                                                    <Box size={24} className="text-teal-500" />
                                                    <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-600 text-[10px] font-black border border-teal-100">컴포넌트</span>
                                                </div>
                                                <span className="text-[15px] font-black text-gray-900 text-center uppercase tracking-tight leading-snug">{comp.name}</span>
                                                {isLocal && <div className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[8px] font-black border border-amber-100">Local</div>}
                                            </div>
                                            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-gray-200 bg-white text-gray-500 text-[11px] font-bold shadow-sm">
                                                <Share2 size={11} /> 공유 프로젝트
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 하단 그룹 (공유 컴포넌트와 연결되지 않은 그룹) */}
                        {bottomGroups.length > 0 && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
                                {bottomGroups.map((group) => renderProjectGroup(group))}
                            </div>
                        )}

                        {/* 범례 */}
                        <div className="flex items-center justify-center gap-5 mt-2 pt-5 border-t border-gray-100 flex-wrap">
                            <LegendItem icon={<Database size={13} className="text-blue-500" />}            label="MYSQL" />
                            <LegendItem icon={<Database size={13} className="text-orange-500" />}          label="ORACLE" />
                            <LegendItem icon={<Monitor size={13} className="text-violet-500" />}           label="화면설계" />
                            <LegendItem icon={<Box size={13} className="text-teal-500" />}                 label="컴포넌트" />
                            <LegendItem icon={<Users size={13} className="text-amber-500" />}              label="프로세스흐름" />
                            <LegendItem icon={<GanttChartSquare size={13} className="text-emerald-500" />} label="WBS" />
                            <div className="flex items-center gap-2 text-gray-500">
                                <svg width="38" height="10"><line x1="1" y1="5" x2="37" y2="5" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="5,3" strokeLinecap="round"/></svg>
                                <span className="text-[11px] font-bold">그룹 내부 관계</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-500">
                                <svg width="38" height="10"><line x1="1" y1="5" x2="37" y2="5" stroke="#10B981" strokeWidth="2" strokeDasharray="5,3" strokeLinecap="round"/></svg>
                                <span className="text-[11px] font-bold">공유 관계 (공통 프로젝트)</span>
                            </div>
                        </div>
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
                    <div className="bg-white rounded-[32px] w-full max-w-6xl shadow-2xl overflow-hidden scale-in">
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
                            <div className="grid grid-cols-5 gap-4">
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
                                    label={(user?.tier === 'PRO' || user?.tier === 'MASTER' || user?.tier === 'ADMIN')
                                        ? '컴포넌트 프로젝트 생성'
                                        : 'Pro tier 이상부터 사용 가능합니다. 관리자에게 문의해 주세요.'}
                                    dotColor={(user?.tier === 'PRO' || user?.tier === 'MASTER' || user?.tier === 'ADMIN') ? '#14b8a6' : undefined}
                                >
                                    <div className="relative">
                                        <button
                                            onClick={() => {
                                                const tier = user?.tier || 'FREE';
                                                if (tier !== 'PRO' && tier !== 'MASTER' && tier !== 'ADMIN') return;
                                                handleSelectProjectType('COMPONENT');
                                            }}
                                            className={`group relative flex flex-col items-center p-8 rounded-3xl border-2 border-gray-100 transition-all duration-300 w-full ${(user?.tier === 'PRO' || user?.tier === 'MASTER' || user?.tier === 'ADMIN')
                                                ? 'bg-gray-50/50 hover:border-teal-400 hover:bg-teal-50/80 active:scale-[0.97]'
                                                : 'cursor-not-allowed opacity-75'}`}
                                        >
                                            {(user?.tier !== 'PRO' && user?.tier !== 'MASTER' && user?.tier !== 'ADMIN') && (
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
                                <button onClick={() => handleSelectProjectType('WBS')} className="group relative flex flex-col items-center p-8 rounded-3xl border-2 border-gray-100 bg-gray-50/50 hover:border-emerald-400 hover:bg-emerald-50/80 transition-all duration-300 active:scale-[0.97]">
                                    <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-5 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                        <GanttChartSquare size={28} />
                                    </div>
                                    <h4 className="text-lg font-black text-gray-900 mb-2">WBS 일정관리</h4>
                                    <p className="text-xs text-gray-500 text-center font-medium">메뉴 구조·개발 상세·진척율로 일정을 관리합니다</p>
                                </button>
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
                                                    : selectedProjectType === 'WBS'
                                                        ? 'WBS 일정관리 생성'
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
