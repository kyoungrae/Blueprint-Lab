import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, FolderOpen, Database, Monitor, Box, Trash2, RotateCcw, Search } from 'lucide-react';
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { useAuthStore } from '../store/authStore';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects').replace(/\/projects\/?$/, '');

type UserTier = 'FREE' | 'PRO' | 'MASTER';

const TIER_LABELS: Record<UserTier, string> = {
    FREE: 'Free tier',
    PRO: 'Pro tier',
    MASTER: 'Master tier',
};

interface AdminUser {
    id: string;
    name: string;
    email: string;
    picture?: string;
    tier: UserTier;
    createdAt: string;
    lastLoginAt: string;
}

interface AdminProject {
    id: string;
    name: string;
    projectType: string;
    dbType: string;
    description?: string;
    updatedAt: string;
    memberCount: number;
}

type AdminTab = 'members' | 'projects' | 'rollback';

interface AdminHistoryEntry {
    id: string;
    projectId: string;
    userId: string;
    userName: string;
    userPicture?: string;
    operationType: string;
    targetType: string;
    targetId: string;
    targetName: string;
    details: string;
    timestamp: string;
}

const AdminPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { user, updateUser } = useAuthStore();
    const [activeTab, setActiveTab] = useState<AdminTab>('members');
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [userProjects, setUserProjects] = useState<AdminProject[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);

    const [rollbackProjects, setRollbackProjects] = useState<AdminProject[]>([]);
    const [rollbackProjectSearch, setRollbackProjectSearch] = useState('');
    const [rollbackSelectedProjectId, setRollbackSelectedProjectId] = useState<string | null>(null);
    const [rollbackHistory, setRollbackHistory] = useState<AdminHistoryEntry[]>([]);
    const [rollbackHistoryLoading, setRollbackHistoryLoading] = useState(false);
    const [rollbackEntryToRollback, setRollbackEntryToRollback] = useState<AdminHistoryEntry | null>(null);
    const [rollbackSubmitLoading, setRollbackSubmitLoading] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        if (activeTab === 'projects' && selectedUserId) {
            fetchUserProjects(selectedUserId);
        } else {
            setUserProjects([]);
        }
    }, [activeTab, selectedUserId]);

    useEffect(() => {
        if (activeTab === 'rollback') {
            fetchRollbackProjects();
        } else {
            setRollbackProjects([]);
            setRollbackSelectedProjectId(null);
            setRollbackHistory([]);
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'rollback' && rollbackSelectedProjectId) {
            fetchRollbackHistory(rollbackSelectedProjectId);
        } else {
            setRollbackHistory([]);
        }
    }, [activeTab, rollbackSelectedProjectId]);

    const fetchUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/users`);
            if (!res.ok) {
                if (res.status === 403) {
                    setError('관리자 권한이 없습니다.');
                    return;
                }
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '회원 목록을 불러오지 못했습니다.');
            }
            const data = await res.json();
            setUsers(data);
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
            if (err.message?.includes('세션')) onBack();
        } finally {
            setLoading(false);
        }
    };

    const fetchUserProjects = async (userId: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/users/${userId}/projects`);
            if (!res.ok) {
                if (res.status === 403) {
                    setError('관리자 권한이 없습니다.');
                    return;
                }
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '프로젝트 목록을 불러오지 못했습니다.');
            }
            const data = await res.json();
            setUserProjects(data);
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
            if (err.message?.includes('세션')) onBack();
        } finally {
            setLoading(false);
        }
    };

    const handleTierChange = async (userId: string, tier: UserTier) => {
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/users/${userId}/tier`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '티어 변경에 실패했습니다.');
            }
            setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, tier } : u)));
            if (userId === user?.id) {
                updateUser({ tier });
            }
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteTarget) return;
        if (!deletePassword.trim()) {
            setError('관리자 비밀번호를 입력해 주세요.');
            return;
        }
        setDeleteLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/users/${deleteTarget.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminPassword: deletePassword }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '회원 삭제에 실패했습니다.');
            }
            setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
            setDeleteTarget(null);
            setDeletePassword('');
            if (selectedUserId === deleteTarget.id) {
                setSelectedUserId(null);
                setUserProjects([]);
            }
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
        } finally {
            setDeleteLoading(false);
        }
    };

    const fetchRollbackProjects = async () => {
        setError(null);
        try {
            const url = `${API_BASE}/admin/projects${rollbackProjectSearch.trim() ? `?q=${encodeURIComponent(rollbackProjectSearch.trim())}` : ''}`;
            const res = await fetchWithAuth(url);
            if (!res.ok) {
                if (res.status === 403) setError('관리자 권한이 없습니다.');
                else throw new Error('프로젝트 목록을 불러오지 못했습니다.');
                return;
            }
            const data = await res.json();
            setRollbackProjects(data);
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
            if (err.message?.includes('세션')) onBack();
        }
    };

    const fetchRollbackHistory = async (projectId: string) => {
        setRollbackHistoryLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/projects/${projectId}/history?hours=24&limit=200`);
            if (!res.ok) {
                if (res.status === 403) setError('관리자 권한이 없습니다.');
                else throw new Error('히스토리를 불러오지 못했습니다.');
                return;
            }
            const data = await res.json();
            setRollbackHistory(data);
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
            setRollbackHistory([]);
        } finally {
            setRollbackHistoryLoading(false);
        }
    };

    const handleRollbackConfirm = async () => {
        if (!rollbackEntryToRollback || !rollbackSelectedProjectId) return;
        setRollbackSubmitLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/projects/${rollbackSelectedProjectId}/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ historyId: rollbackEntryToRollback.id }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '원복에 실패했습니다.');
            }
            setRollbackEntryToRollback(null);
            await fetchRollbackHistory(rollbackSelectedProjectId);
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
        } finally {
            setRollbackSubmitLoading(false);
        }
    };

    const formatDate = (d: string) => {
        if (!d) return '-';
        const date = new Date(d);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const projectTypeIcon = (type: string) => {
        switch (type) {
            case 'SCREEN_DESIGN': return <Monitor size={16} className="text-purple-500" />;
            case 'COMPONENT': return <Box size={16} className="text-teal-500" />;
            default: return <Database size={16} className="text-blue-500" />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                        >
                            <ArrowLeft size={20} />
                            <span className="font-bold">프로젝트 목록</span>
                        </button>
                        <div className="w-px h-6 bg-gray-200" />
                        <h1 className="text-lg font-black text-gray-900">관리자</h1>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-gray-100">
                    <div className="flex gap-1 pt-2">
                        <button
                            onClick={() => { setActiveTab('members'); setSelectedUserId(null); }}
                            className={`px-4 py-2.5 rounded-t-lg font-bold text-sm transition-all ${activeTab === 'members'
                                ? 'bg-white border border-b-0 border-gray-200 text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            <Users size={16} className="inline-block mr-2 align-middle" />
                            회원관리
                        </button>
                        <button
                            onClick={() => setActiveTab('projects')}
                            className={`px-4 py-2.5 rounded-t-lg font-bold text-sm transition-all ${activeTab === 'projects'
                                ? 'bg-white border border-b-0 border-gray-200 text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            <FolderOpen size={16} className="inline-block mr-2 align-middle" />
                            회원 프로젝트 목록
                        </button>
                        <button
                            onClick={() => { setActiveTab('rollback'); setRollbackEntryToRollback(null); }}
                            className={`px-4 py-2.5 rounded-t-lg font-bold text-sm transition-all ${activeTab === 'rollback'
                                ? 'bg-white border border-b-0 border-gray-200 text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            <RotateCcw size={16} className="inline-block mr-2 align-middle" />
                            작업 원복
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
                {error && (
                    <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 text-sm font-medium">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                )}

                {!loading && activeTab === 'members' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">이름</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">이메일</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">티어</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">가입일</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">최근 로그인</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase w-20">삭제</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {u.picture ? (
                                                    <img src={u.picture} alt="" className="w-8 h-8 rounded-full" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                                                        {u.name?.[0] || '?'}
                                                    </div>
                                                )}
                                                <span className="font-medium text-gray-900">{u.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{u.email}</td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={u.tier || 'FREE'}
                                                onChange={(e) => handleTierChange(u.id, e.target.value as UserTier)}
                                                className="text-sm font-medium px-2 py-1 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                            >
                                                <option value="FREE">{TIER_LABELS.FREE}</option>
                                                <option value="PRO">{TIER_LABELS.PRO}</option>
                                                <option value="MASTER">{TIER_LABELS.MASTER}</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(u.createdAt)}</td>
                                        <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(u.lastLoginAt)}</td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => setDeleteTarget(u)}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="회원 삭제"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {users.length === 0 && (
                            <div className="py-12 text-center text-gray-500 font-medium">등록된 회원이 없습니다.</div>
                        )}
                    </div>
                )}

                {!loading && activeTab === 'projects' && (
                    <div className="flex gap-6">
                        <div className="w-72 shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-sm text-gray-700">
                                회원 선택
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                                {users.length === 0 ? (
                                    <div className="p-4 text-sm text-gray-500">회원관리 탭에서 회원을 불러오세요.</div>
                                ) : (
                                    users.map((u) => (
                                        <button
                                            key={u.id}
                                            onClick={() => setSelectedUserId(u.id)}
                                            className={`w-full px-4 py-3 text-left flex items-center gap-2 transition-colors ${selectedUserId === u.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
                                        >
                                            {u.picture ? (
                                                <img src={u.picture} alt="" className="w-8 h-8 rounded-full shrink-0" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-sm shrink-0">
                                                    {u.name?.[0] || '?'}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-900 truncate">{u.name}</div>
                                                <div className="text-xs text-gray-500 truncate">{u.email}</div>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-sm text-gray-700">
                                {selectedUserId ? '프로젝트 목록' : '회원을 선택하면 프로젝트 목록이 표시됩니다.'}
                            </div>
                            {selectedUserId && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">프로젝트</th>
                                                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">유형</th>
                                                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">DB</th>
                                                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">멤버 수</th>
                                                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">수정일</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {userProjects.map((p) => (
                                                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            {projectTypeIcon(p.projectType)}
                                                            {p.projectType}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600">{p.dbType}</td>
                                                    <td className="px-4 py-3 text-gray-600">{p.memberCount}</td>
                                                    <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(p.updatedAt)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {userProjects.length === 0 && (
                                        <div className="py-12 text-center text-gray-500 font-medium">프로젝트가 없습니다.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'projects' && users.length === 0 && !loading && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-amber-800 text-sm font-medium">
                        회원 프로젝트 목록을 보려면 먼저 회원관리 탭에서 회원 목록을 불러오세요.
                    </div>
                )}

                {!loading && activeTab === 'rollback' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-sm text-gray-700">
                                프로젝트 선택 (최근 24시간 삭제 이력 · 원복 시 해당 항목만 복원)
                            </div>
                            <div className="p-4 flex flex-wrap items-center gap-2">
                                <div className="flex flex-1 min-w-[200px] flex-wrap items-center gap-2">
                                    <input
                                        type="text"
                                        value={rollbackProjectSearch}
                                        onChange={(e) => setRollbackProjectSearch(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && fetchRollbackProjects()}
                                        placeholder="프로젝트 이름 검색"
                                        className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={fetchRollbackProjects}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700"
                                    >
                                        <Search size={16} /> 검색
                                    </button>
                                </div>
                            </div>
                            <div className="border-t border-gray-100 max-h-[220px] overflow-y-auto">
                                {rollbackProjects.length === 0 ? (
                                    <div className="p-4 text-sm text-gray-500">검색 버튼을 눌러 프로젝트 목록을 불러오세요.</div>
                                ) : (
                                    <ul className="divide-y divide-gray-100">
                                        {rollbackProjects.map((p) => (
                                            <li key={p.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setRollbackSelectedProjectId(p.id)}
                                                    className={`w-full px-4 py-3 text-left flex items-center gap-2 transition-colors ${rollbackSelectedProjectId === p.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
                                                >
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {projectTypeIcon(p.projectType)}
                                                        {p.projectType}
                                                    </span>
                                                    <span className="font-medium text-gray-900 truncate">{p.name}</span>
                                                    <span className="text-xs text-gray-500 ml-auto shrink-0">{formatDate(p.updatedAt)}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        {rollbackSelectedProjectId && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                                    <div className="font-bold text-sm text-gray-700">최근 24시간 삭제 이력</div>
                                    <div className="text-xs text-gray-500 mt-0.5">테이블, 관계, 화면, 연결선, 컬럼, 표·그리기 요소(화면 내) 삭제만 표시됩니다.</div>
                                </div>
                                {rollbackHistoryLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                                        {rollbackHistory.length === 0 ? (
                                            <div className="p-8 text-center text-gray-500 text-sm">이 기간 내 삭제된 항목이 없습니다.</div>
                                        ) : (
                                            rollbackHistory.map((entry) => (
                                                <div
                                                    key={entry.id}
                                                    className="px-4 py-3 flex flex-wrap items-center gap-2 sm:gap-4"
                                                >
                                                    <span className="text-xs text-gray-500 shrink-0 w-20 sm:w-24">
                                                        {formatDate(entry.timestamp)}
                                                    </span>
                                                    <span className="text-sm font-medium text-gray-700 shrink-0">{entry.userName}</span>
                                                    <span className="text-sm font-medium text-gray-900 truncate min-w-0 flex-1" title={entry.details}>
                                                        {entry.details}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setRollbackEntryToRollback(entry)}
                                                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200"
                                                    >
                                                        <RotateCcw size={14} /> 원복
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* 회원 삭제 확인 모달 */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">회원 삭제</h3>
                        <p className="text-gray-600 text-sm mb-4">
                            <span className="font-medium">{deleteTarget.name}</span>({deleteTarget.email}) 회원을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                        </p>
                        <p className="text-amber-700 text-sm mb-4 font-medium">관리자 비밀번호를 입력해 주세요.</p>
                        <input
                            type="password"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            placeholder="비밀번호"
                            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none mb-6"
                            autoFocus
                        />
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setDeleteTarget(null);
                                    setDeletePassword('');
                                }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleDeleteUser}
                                disabled={deleteLoading || !deletePassword.trim()}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {deleteLoading ? '처리 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 작업 원복 확인 모달 */}
            {rollbackEntryToRollback && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">삭제 항목 원복</h3>
                        <p className="text-gray-600 text-sm mb-2">
                            삭제된 항목만 복원합니다. 다른 데이터에는 영향을 주지 않고, 해당 항목만 다시 추가됩니다.
                        </p>
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                            <div className="font-medium text-gray-700">{rollbackEntryToRollback.details}</div>
                            <div className="text-gray-500 mt-1">{rollbackEntryToRollback.userName} · {formatDate(rollbackEntryToRollback.timestamp)}</div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setRollbackEntryToRollback(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleRollbackConfirm}
                                disabled={rollbackSubmitLoading}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {rollbackSubmitLoading ? '처리 중...' : '원복 실행'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPage;
