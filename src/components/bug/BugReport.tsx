import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Bug, X, Plus, Trash2, Edit3, CheckCircle2, Clock, Check } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';
import type { BugReport, Project } from '../../types/erd';
import PremiumTooltip from '../screenNode/PremiumTooltip';

interface BugReportModalProps {
    project: Project;
    onClose: () => void;
}

export const BugReportModal: React.FC<BugReportModalProps> = ({ project, onClose }) => {
    const { user } = useAuthStore();
    const { updateProjectMetadata } = useProjectStore();
    const bugReports = project.bugReports || [];

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newReportContent, setNewReportContent] = useState('');
    const [editingReportId, setEditingReportId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');

    const isAdmin = project.members.some(m => m.id === user?.id && (m.role === 'OWNER' || m.role === 'EDITOR'));

    const handleSubmit = async () => {
        if (!user || !newReportContent.trim()) return;
        setIsSubmitting(true);
        const newReport: BugReport = {
            id: `bug_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            projectId: project.id,
            content: newReportContent.trim(),
            reporterId: user.id,
            reporterName: user.name,
            reporterPicture: user.picture,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isResolved: false
        };

        const updatedBugs = [newReport, ...bugReports];
        await updateProjectMetadata(project.id, { bugReports: updatedBugs });
        setNewReportContent('');
        setIsSubmitting(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('정말 이 버그 리포트를 삭제하시겠습니까?')) return;
        const updatedBugs = bugReports.filter(b => b.id !== id);
        await updateProjectMetadata(project.id, { bugReports: updatedBugs });
    };

    const handleSaveEdit = async () => {
        if (!editingReportId || !editingContent.trim()) return;
        const updatedBugs = bugReports.map(b => {
            if (b.id === editingReportId) {
                return { ...b, content: editingContent.trim(), updatedAt: new Date().toISOString() };
            }
            return b;
        });
        await updateProjectMetadata(project.id, { bugReports: updatedBugs });
        setEditingReportId(null);
        setEditingContent('');
    };

    const handleToggleResolve = async (report: BugReport) => {
        if (!user) return;
        const updatedBugs = bugReports.map(b => {
            if (b.id === report.id) {
                const isResolved = !b.isResolved;
                return {
                    ...b,
                    isResolved,
                    resolvedAt: isResolved ? new Date().toISOString() : undefined,
                    resolvedBy: isResolved ? user.id : undefined,
                    resolvedByName: isResolved ? user.name : undefined,
                };
            }
            return b;
        });
        await updateProjectMetadata(project.id, { bugReports: updatedBugs });
    };

    const modalContent = (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] min-h-0 flex flex-col border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between p-5 sm:p-6 border-b border-gray-100 bg-gray-50/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shadow-sm">
                            <Bug className="text-orange-500" size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg sm:text-xl font-bold text-gray-800 tracking-tight">버그 신고 및 이슈 관리</h2>
                            <p className="text-xs sm:text-sm text-gray-500 font-medium">프로젝트의 문제를 제보하고 진행 상황을 관리하세요.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 rounded-full transition-colors active:scale-95"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 bg-gray-50/20">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 transition-all focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-500/50">
                        <textarea
                            className="w-full text-sm text-gray-700 bg-transparent border-none outline-none resize-none min-h-[80px]"
                            placeholder="발견한 문제를 상세히 적어주세요. (어떤 화면에서 어떤 조작을 할 때 문제가 발생했는지 등)"
                            value={newReportContent}
                            onChange={(e) => setNewReportContent(e.target.value)}
                        />
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                            <span className="text-xs text-gray-400 font-medium">{newReportContent.length} / 500자</span>
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || !newReportContent.trim()}
                                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:opacity-50 disabled:active:scale-100 text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-orange-500/20"
                            >
                                <Plus size={16} />
                                버그 등록
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center justify-between mb-2">
                            등록된 버그 ({bugReports.length})
                            <div className="flex gap-2 text-xs font-normal">
                                <span className="flex items-center gap-1 text-gray-500"><Clock size={12} /> {bugReports.filter(b => !b.isResolved).length} 진행중</span>
                                <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={12} /> {bugReports.filter(b => b.isResolved).length} 해결됨</span>
                            </div>
                        </h3>
                        {bugReports.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-100 border-dashed">
                                <Bug className="mx-auto text-gray-200 mb-2" size={32} />
                                <p className="text-gray-400 text-sm font-medium">아직 등록된 버그나 이슈가 없습니다!</p>
                            </div>
                        ) : (
                            bugReports.map((report) => (
                                <div key={report.id} className={`bg-white rounded-xl border ${report.isResolved ? 'border-green-100 shadow-sm' : 'border-gray-200 shadow-md'} overflow-visible transition-all hover:shadow-lg`}>
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-3 border-b border-gray-50 bg-gray-50/50">
                                        <div className="flex items-center gap-2.5">
                                            {report.reporterPicture ? (
                                                <img src={report.reporterPicture} alt={report.reporterName} className="w-8 h-8 rounded-full shadow-sm object-cover" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shadow-sm">
                                                    {report.reporterName.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm text-gray-800">{report.reporterName}</span>
                                                <span className="text-[10px] text-gray-400 font-medium">
                                                    {new Date(report.createdAt).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-gray-100 justify-end pr-1 shrink-0">
                                            {report.isResolved ? (
                                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-600 rounded-md text-[11px] font-bold">
                                                    <CheckCircle2 size={12} />
                                                    해결 완료 (by {report.resolvedByName})
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-600 rounded-md text-[11px] font-bold">
                                                    <Clock size={12} />
                                                    처리 대기중
                                                </div>
                                            )}

                                            {(report.reporterId === user?.id || isAdmin) && (
                                                <div className="flex gap-1 ml-2 shrink-0">
                                                    {isAdmin && (
                                                        <PremiumTooltip forceBodyPortal label={report.isResolved ? "미해결로 변경" : "해결 완료로 변경"} placement="top">
                                                            <button
                                                                onClick={() => handleToggleResolve(report)}
                                                                className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${report.isResolved ? 'text-gray-500' : 'text-green-500'}`}
                                                            >
                                                                {report.isResolved ? <Clock size={14} /> : <Check size={14} />}
                                                            </button>
                                                        </PremiumTooltip>
                                                    )}
                                                    {report.reporterId === user?.id && !report.isResolved && (
                                                        <PremiumTooltip forceBodyPortal label="수정" placement="top">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingReportId(report.id);
                                                                    setEditingContent(report.content);
                                                                }}
                                                                className="p-1.5 text-blue-500 rounded hover:bg-blue-50 transition-colors"
                                                            >
                                                                <Edit3 size={14} />
                                                            </button>
                                                        </PremiumTooltip>
                                                    )}
                                                    <PremiumTooltip forceBodyPortal label="삭제" placement="top">
                                                        <button
                                                            onClick={() => handleDelete(report.id)}
                                                            className="p-1.5 text-red-500 rounded hover:bg-red-50 transition-colors"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </PremiumTooltip>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                        {editingReportId === report.id ? (
                                            <div className="flex flex-col gap-2">
                                                <textarea
                                                    className="w-full text-sm text-gray-700 bg-white border border-blue-200 rounded p-2 outline-none resize-none min-h-[60px] focus:ring-2 focus:ring-blue-500/20"
                                                    value={editingContent}
                                                    onChange={(e) => setEditingContent(e.target.value)}
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => setEditingReportId(null)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded">취소</button>
                                                    <button onClick={handleSaveEdit} className="px-3 py-1.5 text-xs bg-blue-500 text-white hover:bg-blue-600 rounded font-bold shadow-sm">수정 저장</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className={report.isResolved ? 'line-through text-gray-400' : ''}>
                                                {report.content}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export const BugReportButton: React.FC<{ project: Project }> = ({ project }) => {
    const [isOpen, setIsOpen] = useState(false);
    const unresolvedCount = (project.bugReports || []).filter(b => !b.isResolved).length;

    return (
        <>
            <PremiumTooltip placement="bottom" offsetBottom={30} label="버그 신고 / 이슈 목록">
                <button
                    onClick={() => setIsOpen(true)}
                    className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-white text-gray-600 hover:text-orange-500 hover:bg-orange-50 transition-all border border-gray-200 shadow-sm active:scale-95 shrink-0"
                >
                    <Bug size={16} />
                    {unresolvedCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                            {unresolvedCount > 9 ? '9+' : unresolvedCount}
                        </span>
                    )}
                </button>
            </PremiumTooltip>

            {isOpen && <BugReportModal project={project} onClose={() => setIsOpen(false)} />}
        </>
    );
};
