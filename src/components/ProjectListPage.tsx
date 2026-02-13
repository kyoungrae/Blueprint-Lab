import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { Plus, FolderOpen, Trash2, Clock, ChevronRight, LogOut, Database, Users, UserPlus, UserMinus, X, Share2, AlertTriangle, Link, Monitor, ArrowLeft } from 'lucide-react';
import './ProjectListPage.css';
import { useProjectStore } from '../store/projectStore';
import { useAuthStore } from '../store/authStore';
import { type DBType, type ProjectType, type ProjectMember } from '../types/erd';

const ProjectListPage: React.FC = () => {
    const { projects, fetchProjects, addProject, addRemoteProject, deleteProject, setCurrentProject, updateProjectMembers, updateProjectMetadata, inviteMember, joinWithCode } = useProjectStore();
    const { user, logout } = useAuthStore();
    const [isTypeSelectionOpen, setIsTypeSelectionOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedProjectType, setSelectedProjectType] = useState<ProjectType>('ERD');
    const [editingMembersProject, setEditingMembersProject] = useState<string | null>(null);
    const [linkingProjectId, setLinkingProjectId] = useState<string | null>(null);
    const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const containerRef = useRef<HTMLDivElement>(null);
    const [cardPositions, setCardPositions] = useState<Record<string, { x: number, y: number, w: number, h: number }>>({});
    const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [newProjectDbType, setNewProjectDbType] = useState<DBType>('MySQL');
    const [newProjectMembers, setNewProjectMembers] = useState<ProjectMember[]>([]);
    const [tempMembers, setTempMembers] = useState<ProjectMember[]>([]);
    const [memberInput, setMemberInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [joinMode, setJoinMode] = useState<'CODE' | 'ID'>('CODE');
    const [joinCode, setJoinCode] = useState('');

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

    // Graph Line Positioning Logic
    useEffect(() => {
        const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const updatePositions = () => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const newPositions: Record<string, { x: number, y: number, w: number, h: number }> = {};

        Object.entries(cardRefs.current).forEach(([id, el]) => {
            if (el) {
                const rect = el.getBoundingClientRect();
                newPositions[id] = {
                    x: rect.left - containerRect.left,
                    y: rect.top - containerRect.top,
                    w: rect.width,
                    h: rect.height
                };
            }
        });
        setCardPositions(newPositions);
    };

    useLayoutEffect(() => {
        updatePositions();
        // Fallback for async content load
        const timer = setTimeout(updatePositions, 500);
        return () => clearTimeout(timer);
    }, [projects, windowSize]);

    // Update positions on any scroll
    useEffect(() => {
        window.addEventListener('scroll', updatePositions, true);
        return () => window.removeEventListener('scroll', updatePositions, true);
    }, []);

    const projectConnections = useMemo(() => {
        return projects
            .filter(p => p.projectType === 'SCREEN_DESIGN' && p.linkedErdProjectId)
            .map(p => ({
                fromId: p.id,
                toId: p.linkedErdProjectId!
            }));
    }, [projects]);

    const targetProject = projects.find(p => p.id === editingMembersProject);

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
                const updatedProject = projects.find(p => p.id === editingMembersProject);
                if (updatedProject) setTempMembers(updatedProject.members || []);
            } catch (err: any) {
                alert(err.message || '초대에 실패했습니다.');
            } finally {
                setIsLoading(false);
            }
            return;
        }

        const currentMembers = isEditing ? tempMembers : newProjectMembers;

        // ... (existing mock logic for new projects)
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
                newProjectDbType,
                [],
                newProjectDesc,
                selectedProjectType
            );

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
                {/* Dashboard Controls */}
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

                {/* Project Grid */}
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
                    <div ref={containerRef} className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16">
                        {/* SVG Layer for Connections */}
                        <svg className="absolute inset-0 pointer-events-none overflow-visible z-0" style={{ width: '100%', height: '100%' }}>
                            <defs>
                                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                                    <circle cx="3" cy="3" r="2" fill="rgba(59, 130, 246, 0.4)" />
                                </marker>
                                <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="rgba(139, 92, 246, 0.3)" />
                                    <stop offset="100%" stopColor="rgba(59, 130, 246, 0.3)" />
                                </linearGradient>
                            </defs>
                            {projectConnections.map(({ fromId, toId }, idx) => {
                                const from = cardPositions[fromId];
                                const to = cardPositions[toId];
                                if (!from || !to) return null;

                                // Center of From Card to Center of To Card
                                const startX = from.x + from.w / 2;
                                const startY = from.y + from.h / 2;
                                const endX = to.x + to.w / 2;
                                const endY = to.y + to.h / 2;

                                // Smoother, more direct curve
                                const dx = endX - startX;
                                const dy = endY - startY;
                                const cp1x = startX + dx * 0.2;
                                const cp1y = startY + dy * 0.8;
                                const cp2x = startX + dx * 0.8;
                                const cp2y = startY + dy * 0.2;

                                return (
                                    <path
                                        key={`conn-${fromId}-${toId}-${idx}`}
                                        d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                                        stroke="url(#lineGrad)"
                                        strokeWidth="3.5"
                                        strokeDasharray="10 6"
                                        fill="none"
                                        markerEnd="url(#arrowhead)"
                                        className="flowing-line"
                                        style={{
                                            opacity: 0.8,
                                        }}
                                    />
                                );
                            })}
                        </svg>

                        {projects.map((project) => (
                            <div
                                key={project.id}
                                ref={(el) => { cardRefs.current[project.id] = el; }}
                                onClick={() => setCurrentProject(project.id)}
                                className="group relative bg-white rounded-[28px] p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 transition-all cursor-pointer flex flex-col h-full ring-0 hover:ring-2 ring-blue-500/20 z-10"
                            >
                                {(() => {
                                    const isLocal = project.id.startsWith('local_');
                                    const projectOwner = project.members?.find((m) => m.role === 'OWNER');
                                    const isOwner = isLocal || user?.id === projectOwner?.id;
                                    return (
                                        <>
                                            <div className="flex items-start justify-between mb-6">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-3 rounded-2xl transition-colors duration-300 ${project.projectType === 'SCREEN_DESIGN'
                                                        ? 'bg-violet-50 text-violet-500 group-hover:bg-violet-600 group-hover:text-white'
                                                        : 'bg-gray-50 text-blue-500 group-hover:bg-blue-600 group-hover:text-white'
                                                        }`}>
                                                        {project.projectType === 'SCREEN_DESIGN' ? <Monitor size={24} /> : <Database size={24} />}
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        {isLocal && (
                                                            <div className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-[8px] font-black uppercase tracking-wider border border-amber-100 flex items-center justify-center gap-1">
                                                                Local
                                                            </div>
                                                        )}
                                                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${project.projectType === 'SCREEN_DESIGN'
                                                            ? 'bg-violet-50 text-violet-600'
                                                            : 'bg-blue-50 text-blue-600'
                                                            }`}>
                                                            {project.projectType === 'SCREEN_DESIGN' ? '화면설계' : project.dbType}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                                            {isOwner ? <Users size={18} /> : <Users size={18} />}
                                                        </button>
                                                    )}

                                                    {/* Delete (Owner only) */}
                                                    {isOwner && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const message = `'${project.name}' 프로젝트를 영구적으로 삭제하시겠습니까? (복구 불가)`;

                                                                if (window.confirm(message)) {
                                                                    deleteProject(project.id);
                                                                }
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
                                                <h3 className="text-xl font-black text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">{project.name}</h3>

                                                {/* Creator Info */}
                                                {(() => {
                                                    const projectOwner = project.members?.find((m) => m.role === 'OWNER');
                                                    if (projectOwner) {
                                                        return (
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
                                                        );
                                                    }
                                                    return null;
                                                })()}

                                                <p className="text-gray-500 text-sm line-clamp-2 font-medium">
                                                    {project.description || '상세 설명이 없습니다.'}
                                                </p>
                                            </div>

                                            <div className="mt-auto pt-6 border-t border-gray-50 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    {/* Linked ERD Indicator / Action - Only for Screen Design projects */}
                                                    {project.projectType === 'SCREEN_DESIGN' && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setLinkingProjectId(project.id);
                                                            }}
                                                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold transition-all ${project.linkedErdProjectId
                                                                ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                                                                }`}
                                                            title="ERD 프로젝트 연결"
                                                        >
                                                            <Database size={10} />
                                                            {project.linkedErdProjectId
                                                                ? (projects.find(p => p.id === project.linkedErdProjectId)?.name || 'ERD 연결됨')
                                                                : 'ERD 연결'}
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
                                                                <img src={member.picture} alt={member.name || 'User'} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-gray-400">
                                                                    {(member.name || '?').charAt(0)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Join Project Modal */}
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
                            <button
                                onClick={() => setIsJoinModalOpen(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                            >
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
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(joinMode === 'CODE' ? e.target.value.toUpperCase() : e.target.value)}
                                    placeholder={joinMode === 'CODE' ? '8자리 초대 코드 입력' : '프로젝트 ID (mongoId 등) 입력'}
                                    className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold tracking-wider text-center text-lg"
                                />
                            </div>

                            <button
                                disabled={!localStorage.getItem('auth-token')}
                                onClick={async () => {
                                    if (joinCode.trim()) {
                                        await handleJoinProject(joinCode.trim());
                                        setIsJoinModalOpen(false);
                                        setJoinCode('');
                                    }
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

            {/* Project Type Selection Modal */}
            {isTypeSelectionOpen && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden scale-in">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 mb-2">프로젝트 유형 선택</h3>
                                <p className="text-gray-500 font-medium text-sm">생성할 프로젝트의 유형을 선택해주세요.</p>
                            </div>
                            <button
                                onClick={() => setIsTypeSelectionOpen(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-8">
                            <div className="grid grid-cols-2 gap-4">
                                {/* ERD Project */}
                                <button
                                    onClick={() => handleSelectProjectType('ERD')}
                                    className="group relative flex flex-col items-center p-8 rounded-3xl border-2 border-gray-100 bg-gray-50/50 hover:border-blue-400 hover:bg-blue-50/80 transition-all duration-300 hover:shadow-lg hover:shadow-blue-100/50 active:scale-[0.97]"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-5 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-blue-200">
                                        <Database size={28} />
                                    </div>
                                    <h4 className="text-lg font-black text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">ERD 프로젝트</h4>
                                    <p className="text-xs text-gray-500 text-center font-medium leading-relaxed">데이터베이스 엔티티 관계를<br />설계하고 관리합니다</p>
                                    <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                                        <span className="px-2 py-0.5 bg-blue-100/80 text-blue-600 text-[9px] font-bold rounded-full">Entity</span>
                                        <span className="px-2 py-0.5 bg-blue-100/80 text-blue-600 text-[9px] font-bold rounded-full">Relation</span>
                                        <span className="px-2 py-0.5 bg-blue-100/80 text-blue-600 text-[9px] font-bold rounded-full">SQL</span>
                                    </div>
                                </button>

                                {/* Screen Design Project */}
                                <button
                                    onClick={() => handleSelectProjectType('SCREEN_DESIGN')}
                                    className="group relative flex flex-col items-center p-8 rounded-3xl border-2 border-gray-100 bg-gray-50/50 hover:border-violet-400 hover:bg-violet-50/80 transition-all duration-300 hover:shadow-lg hover:shadow-violet-100/50 active:scale-[0.97]"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center mb-5 group-hover:bg-violet-600 group-hover:text-white transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-violet-200">
                                        <Monitor size={28} />
                                    </div>
                                    <h4 className="text-lg font-black text-gray-900 mb-2 group-hover:text-violet-700 transition-colors">화면 설계서</h4>
                                    <p className="text-xs text-gray-500 text-center font-medium leading-relaxed">UI/UX 화면 구조를<br />설계하고 관리합니다</p>
                                    <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                                        <span className="px-2 py-0.5 bg-violet-100/80 text-violet-600 text-[9px] font-bold rounded-full">Screen</span>
                                        <span className="px-2 py-0.5 bg-violet-100/80 text-violet-600 text-[9px] font-bold rounded-full">Layout</span>
                                        <span className="px-2 py-0.5 bg-violet-100/80 text-violet-600 text-[9px] font-bold rounded-full">Flow</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Project Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden scale-in">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCreateModalOpen(false);
                                        setIsTypeSelectionOpen(true);
                                        setCreateError(null);
                                    }}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                                    title="프로젝트 유형 선택으로 돌아가기"
                                >
                                    <ArrowLeft size={20} />
                                </button>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className={`p-1.5 rounded-lg ${selectedProjectType === 'SCREEN_DESIGN'
                                            ? 'bg-violet-100 text-violet-600'
                                            : 'bg-blue-100 text-blue-600'
                                            }`}>
                                            {selectedProjectType === 'SCREEN_DESIGN' ? <Monitor size={16} /> : <Database size={16} />}
                                        </div>
                                        <h3 className="text-2xl font-black text-gray-900">
                                            {selectedProjectType === 'SCREEN_DESIGN' ? '화면 설계서 생성' : 'ERD 프로젝트 생성'}
                                        </h3>
                                    </div>
                                    <p className="text-gray-500 font-medium text-sm">
                                        {selectedProjectType === 'SCREEN_DESIGN'
                                            ? '새로운 화면 설계서 프로젝트를 시작합니다.'
                                            : '새로운 데이터베이스 설계 프로젝트를 시작합니다.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setIsCreateModalOpen(false);
                                    setCreateError(null);
                                }}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateProject} className="p-8 space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">프로젝트 명</label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    placeholder={selectedProjectType === 'SCREEN_DESIGN' ? '예: 회원관리 화면설계' : '예: 서비스 설계'}
                                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium"
                                />
                            </div>

                            {/* DB Type selector - only for ERD projects */}
                            {selectedProjectType === 'ERD' && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-3 ml-1">데이터베이스 엔진</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {(['MySQL', 'PostgreSQL', 'Oracle', 'MSSQL'] as DBType[]).map((type) => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setNewProjectDbType(type)}
                                                className={`py-3 px-4 rounded-2xl border-2 transition-all font-bold text-sm flex items-center justify-center gap-2 ${newProjectDbType === type
                                                    ? 'border-blue-500 bg-blue-50 text-blue-600 shadow-sm shadow-blue-100'
                                                    : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'
                                                    }`}
                                            >
                                                <div className={`w-2 h-2 rounded-full ${newProjectDbType === type ? 'bg-blue-500' : 'bg-gray-300'}`} />
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">설명 (선택사항)</label>
                                <textarea
                                    value={newProjectDesc}
                                    onChange={(e) => setNewProjectDesc(e.target.value)}
                                    placeholder="프로젝트에 대한 간단한 설명을 입력하세요."
                                    rows={2}
                                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium resize-none"
                                />
                            </div>

                            {createError && (
                                <div className="p-3 bg-red-50 text-red-500 text-xs rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-1">
                                    {createError}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    disabled={isLoading}
                                    onClick={() => {
                                        setIsCreateModalOpen(false);
                                        setNewProjectMembers([]);
                                        setMemberInput('');
                                        setCreateError(null);
                                    }}
                                    className="flex-1 py-4 px-6 bg-gray-50 text-gray-600 rounded-2xl font-bold hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className={`flex-[2] py-4 px-6 text-white rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 ${selectedProjectType === 'SCREEN_DESIGN'
                                        ? 'bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-200'
                                        : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200'
                                        }`}
                                >
                                    {isLoading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        '생성하기'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Members Modal */}
            {editingMembersProject && targetProject && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden scale-in">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            {(() => {
                                const isOwner = targetProject.members?.find(m => m.role === 'OWNER')?.id === user?.id;
                                return (
                                    <div>
                                        <h3 className="text-2xl font-black text-gray-900 mb-1">
                                            {isOwner ? '팀원 관리' : '참여자 목록'}
                                        </h3>
                                        <p className="text-gray-500 font-medium text-sm">
                                            {isOwner
                                                ? `'${targetProject.name}' 프로젝트의 협업자 목록 및 초대`
                                                : `'${targetProject.name}' 프로젝트에 참여 중인 인원`}
                                        </p>
                                    </div>
                                );
                            })()}
                            <button
                                onClick={() => setEditingMembersProject(null)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            {/* Current Members List */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-3 ml-1">참여 중인 팀원</label>
                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                    {(() => {
                                        const isOwner = targetProject.members?.find(m => m.role === 'OWNER')?.id === user?.id;
                                        return tempMembers.map((member) => (
                                            <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100 hover:border-blue-200 transition-all">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                                                        {member.picture ? (
                                                            <img src={member.picture} alt={member.name || 'User'} className="w-full h-full rounded-full object-cover" />
                                                        ) : (
                                                            (member.name || '?').charAt(0)
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                                            {member.name || 'Unknown User'}
                                                            {member.role === 'OWNER' && (
                                                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-[10px] rounded font-black tracking-tight">OWNER</span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 font-medium">{member.email}</div>
                                                    </div>
                                                </div>
                                                {isOwner && member.role !== 'OWNER' && (
                                                    <button
                                                        onClick={() => {
                                                            if (window.confirm(`'${member.name}' 팀원을 프로젝트에서 제외하시겠습니까?`)) {
                                                                handleRemoveMember(member.id, true);
                                                            }
                                                        }}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                        title="팀원에서 제외"
                                                    >
                                                        <UserMinus size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>

                            {(() => {
                                const isOwner = targetProject.members?.find(m => m.role === 'OWNER')?.id === user?.id;
                                if (!isOwner) return null;
                                return (
                                    <>
                                        {/* Add New Member */}
                                        <div className="pt-4 border-t border-gray-100">
                                            <label className="block text-sm font-bold text-gray-700 mb-3 ml-1">새 팀원 초대</label>
                                            <div className="flex gap-2">
                                                <div className="relative flex-1">
                                                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                                    <input
                                                        type="text"
                                                        value={memberInput}
                                                        onChange={(e) => setMemberInput(e.target.value)}
                                                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMember(true))}
                                                        placeholder="초대할 팀원의 이메일을 입력하세요"
                                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium text-sm"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleAddMember(true)}
                                                    className="px-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-black transition-all active:scale-95 flex items-center gap-2"
                                                >
                                                    <UserPlus size={18} />
                                                    초대
                                                </button>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleUpdateMembers}
                                            className="w-full py-4 px-6 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 mt-4"
                                        >
                                            저장하기
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Link ERD Project Modal */}
            {linkingProjectId && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden scale-in">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 mb-1">ERD 프로젝트 연결</h3>
                                <p className="text-gray-500 font-medium text-xs">연동할 ERD 프로젝트를 선택하세요.</p>
                            </div>
                            <button
                                onClick={() => setLinkingProjectId(null)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-2 max-h-[400px] overflow-y-auto">
                            {projects.filter(p => !p.projectType || p.projectType === 'ERD').length > 0 ? (
                                <div className="space-y-1">
                                    {projects.filter(p => !p.projectType || p.projectType === 'ERD').map(erdProject => (
                                        <button
                                            key={erdProject.id}
                                            onClick={async () => {
                                                await updateProjectMetadata(linkingProjectId, { linkedErdProjectId: erdProject.id });
                                                setLinkingProjectId(null);
                                            }}
                                            className={`w-full p-4 rounded-xl flex items-center gap-4 hover:bg-blue-50 transition-colors group text-left ${projects.find(p => p.id === linkingProjectId)?.linkedErdProjectId === erdProject.id
                                                ? 'bg-blue-50 ring-1 ring-blue-200'
                                                : 'bg-white'
                                                }`}
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                                <Database size={18} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-gray-900 truncate">{erdProject.name}</h4>
                                                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                                    <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] uppercase font-bold tracking-wider">{erdProject.dbType}</span>
                                                    <span>• {new Date(erdProject.updatedAt).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                            {projects.find(p => p.id === linkingProjectId)?.linkedErdProjectId === erdProject.id && (
                                                <div className="text-blue-500 font-bold text-xs">연결됨</div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-gray-400">
                                    <Database size={32} className="mx-auto mb-3 opacity-20" />
                                    <p className="text-sm">연결 가능한 ERD 프로젝트가 없습니다.</p>
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={async () => {
                                    // Disconnect logic
                                    await updateProjectMetadata(linkingProjectId, { linkedErdProjectId: undefined });
                                    setLinkingProjectId(null);
                                }}
                                className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                연결 해제
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <footer className="py-10 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">
                © 2026 2QuadrillionTae. 모든 권리 보유.
            </footer>
        </div>
    );
};

export default ProjectListPage;
