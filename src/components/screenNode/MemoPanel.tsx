import React, { useState, useEffect } from 'react';
import type { Screen, ScreenMemo } from '../../types/screenDesign';
import { X, Save, Clock, User as UserIcon, Plus, ChevronLeft, Trash2, Edit3, MessageSquare } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface MemoPanelProps {
    screen: Screen;
    isVisible: boolean;
    onClose: () => void;
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
}

type ViewMode = 'LIST' | 'DETAIL' | 'EDIT' | 'ADD';

export const MemoPanel: React.FC<MemoPanelProps> = ({
    screen,
    isVisible,
    onClose,
    update,
    syncUpdate,
}) => {
    const { user } = useAuthStore();
    const [viewMode, setViewMode] = useState<ViewMode>('LIST');
    const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
    const [editorContent, setEditorContent] = useState('');

    const memos = screen.memos || [];
    const selectedMemo = memos.find(m => m.id === selectedMemoId);

    // Initial conversion of legacy memo if array is empty
    useEffect(() => {
        if (isVisible && screen.memo && (!screen.memos || screen.memos.length === 0)) {
            const legacyMemo: ScreenMemo = {
                id: `memo_legacy_${Date.now()}`,
                content: screen.memo,
                author: screen.memoAuthor || '기본 작성자',
                updatedAt: screen.memoUpdatedAt || new Date().toLocaleString('ko-KR')
            };
            const updates = {
                memos: [legacyMemo],
                memo: undefined, // Clear legacy to avoid re-run
                memoAuthor: undefined,
                memoUpdatedAt: undefined
            };
            update(updates);
            syncUpdate(updates);
        }
    }, [isVisible, screen.memo, screen.memos]);

    const getFormattedTimestamp = () => {
        return new Date().toLocaleString('ko-KR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };

    const handleSave = () => {
        if (!editorContent.trim()) return;

        let newMemos = [...memos];
        const timestamp = getFormattedTimestamp();
        const author = user?.name || '익명';

        if (viewMode === 'ADD') {
            const newMemo: ScreenMemo = {
                id: `memo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                content: editorContent,
                author,
                updatedAt: timestamp
            };
            newMemos = [newMemo, ...newMemos]; // Newest first
        } else if (viewMode === 'EDIT' && selectedMemoId) {
            newMemos = newMemos.map(m =>
                m.id === selectedMemoId
                    ? { ...m, content: editorContent, author, updatedAt: timestamp }
                    : m
            );
        }

        update({ memos: newMemos });
        syncUpdate({ memos: newMemos });
        setViewMode('LIST');
        setEditorContent('');
        setSelectedMemoId(null);
    };

    const handleDelete = (id: string) => {
        if (!window.confirm('이 메모를 삭제하시겠습니까?')) return;
        const newMemos = memos.filter(m => m.id !== id);
        update({ memos: newMemos });
        syncUpdate({ memos: newMemos });
        setViewMode('LIST');
        setSelectedMemoId(null);
    };

    const enterDetail = (memo: ScreenMemo) => {
        setSelectedMemoId(memo.id);
        setViewMode('DETAIL');
    };

    const enterEdit = () => {
        if (selectedMemo) {
            setEditorContent(selectedMemo.content);
            setViewMode('EDIT');
        }
    };

    const enterAdd = () => {
        setEditorContent('');
        setViewMode('ADD');
    };

    if (!isVisible) return null;

    return (
        <div
            className="absolute top-0 right-0 w-[340px] bg-white border-l border-gray-200 shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex flex-col pointer-events-auto"
            style={{ height: '100%' }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 shrink-0">
                <div className="flex items-center gap-2">
                    {viewMode !== 'LIST' && (
                        <button
                            onClick={() => setViewMode('LIST')}
                            className="p-1 -ml-1 hover:bg-gray-200 rounded transition-colors mr-1"
                        >
                            <ChevronLeft size={20} className="text-gray-500" />
                        </button>
                    )}
                    <MessageSquare size={18} className="text-blue-500" />
                    <h3 className="text-sm font-bold text-gray-800">
                        {viewMode === 'LIST' ? '화면 메모 목록' :
                            viewMode === 'ADD' ? '메모 추가' :
                                viewMode === 'EDIT' ? '메모 수정' : '메모 상세'}
                    </h3>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-400 hover:text-gray-600"
                    title="닫기"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/30">
                {viewMode === 'LIST' ? (
                    <div className="p-4 space-y-3">
                        <button
                            onClick={enterAdd}
                            className="w-full py-3 bg-white border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-2 text-gray-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 transition-all group"
                        >
                            <Plus size={18} className="group-hover:scale-110 transition-transform" />
                            <span className="text-sm font-bold">새 메모 작성</span>
                        </button>

                        {memos.length === 0 ? (
                            <div className="py-20 flex flex-col items-center justify-center text-gray-300">
                                <MessageSquare size={48} className="opacity-10 mb-2" />
                                <p className="text-xs font-bold">등록된 메모가 없습니다.</p>
                            </div>
                        ) : (
                            memos.map(m => (
                                <div
                                    key={m.id}
                                    onClick={() => enterDetail(m)}
                                    className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all cursor-pointer group"
                                >
                                    <p className="text-sm text-gray-700 line-clamp-3 leading-relaxed mb-3">
                                        {m.content}
                                    </p>
                                    <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium">
                                        <div className="flex items-center gap-1.5">
                                            <UserIcon size={12} className="text-gray-300" />
                                            <span>{m.author}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Clock size={12} className="text-gray-300" />
                                            <span>{m.updatedAt.split(' ').slice(0, 3).join(' ')}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : viewMode === 'DETAIL' && selectedMemo ? (
                    <div className="flex flex-col h-full">
                        <div className="p-4 bg-white border-b border-gray-100">
                            <div className="flex items-center justify-between mb-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <UserIcon size={14} />
                                        <span className="text-xs font-bold text-gray-600">{selectedMemo.author}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <Clock size={14} />
                                        <span className="text-[11px] font-medium">{selectedMemo.updatedAt}</span>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={enterEdit}
                                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                        title="수정"
                                    >
                                        <Edit3 size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(selectedMemo.id)}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        title="삭제"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                                <p className="text-sm text-gray-800 leading-7 whitespace-pre-wrap font-medium">
                                    {selectedMemo.content}
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 flex flex-col h-full">
                        <textarea
                            value={editorContent}
                            onChange={(e) => setEditorContent(e.target.value)}
                            placeholder="메모 내용을 입력하세요..."
                            className="w-full flex-1 min-h-[300px] p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm leading-relaxed mb-4 shadow-inner"
                            autoFocus
                        />
                        <div className="flex gap-2 shrink-0">
                            <button
                                onClick={() => setViewMode(viewMode === 'EDIT' ? 'DETAIL' : 'LIST')}
                                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!editorContent.trim()}
                                className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                <Save size={18} />
                                {viewMode === 'EDIT' ? '수정 완료' : '메모 저장'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
