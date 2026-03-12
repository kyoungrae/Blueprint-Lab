import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Save, Trash2, Edit3, MessageSquare, Clock, User } from 'lucide-react';
import type { Screen, ScreenMemo } from '../../types/screenDesign';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface MemoPanelProps {
    show: boolean;
    onClose: () => void;
    screen: Screen;
    syncUpdate: (updates: Partial<Screen>) => void;
    user: { id: string; name: string } | null;
}

const MemoPanel: React.FC<MemoPanelProps> = ({ show, onClose, screen, syncUpdate, user }) => {
    const [memos, setMemos] = useState<ScreenMemo[]>(screen.memos || []);
    const [content, setContent] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Sync local memos when screen.memos changes from socket
    useEffect(() => {
        setMemos(screen.memos || []);
    }, [screen.memos]);

    const handleSave = () => {
        if (!content.trim() || !user) return;

        let nextMemos: ScreenMemo[];
        const now = new Date().toISOString();

        if (editingId) {
            nextMemos = memos.map(m => 
                m.id === editingId 
                    ? { ...m, content: content.trim(), updatedAt: now } 
                    : m
            );
            setEditingId(null);
        } else {
            const newMemo: ScreenMemo = {
                id: `memo_${Date.now()}`,
                content: content.trim(),
                authorId: user.id,
                authorName: user.name,
                createdAt: now,
                updatedAt: now,
            };
            nextMemos = [newMemo, ...memos];
        }

        setMemos(nextMemos);
        syncUpdate({ memos: nextMemos });
        setContent('');
        
        // Scroll to top after adding
        if (!editingId && scrollRef.current) {
            scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleDelete = (id: string) => {
        if (!window.confirm('메모를 삭제하시겠습니까?')) return;
        const nextMemos = memos.filter(m => m.id !== id);
        setMemos(nextMemos);
        syncUpdate({ memos: nextMemos });
    };

    const handleEdit = (memo: ScreenMemo) => {
        setContent(memo.content);
        setEditingId(memo.id);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setContent('');
    };

    if (!show) return null;

    return (
        <div 
            className="absolute top-0 right-0 h-full w-[320px] bg-white/95 backdrop-blur-md border-l border-gray-200 shadow-2xl flex flex-col z-[50] animate-in slide-in-from-right duration-300 pointer-events-auto"
            style={{ borderRadius: '15px' }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-[#2c3e7c] text-white rounded-tl-xl transition-all">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <MessageSquare size={18} className="text-blue-300" />
                        {memos.length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] min-w-[12px] h-[12px] flex items-center justify-center rounded-full px-0.5 border border-[#2c3e7c] font-black ring-1 ring-blue-300/30">
                                {memos.length}
                            </span>
                        )}
                    </div>
                    <span className="font-bold text-sm tracking-tight">화면 메모</span>
                </div>
                <button 
                    onClick={onClose}
                    className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Memo Input */}
            <div className="p-4 bg-gray-50/50 border-b border-gray-100">
                <div className="relative">
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="새로운 메모를 작성하세요..."
                        className="w-full h-24 p-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none bg-white shadow-sm transition-all placeholder:text-gray-400"
                    />
                    <div className="absolute bottom-2 right-2 flex gap-2">
                        {editingId && (
                            <button
                                onClick={cancelEdit}
                                className="px-3 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                취소
                            </button>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={!content.trim()}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all shadow-sm ${
                                content.trim() 
                                    ? 'bg-[#2c3e7c] text-white hover:bg-[#3d52a0] hover:shadow-blue-200 active:scale-95' 
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            {editingId ? <Save size={14} /> : <Plus size={14} />}
                            {editingId ? '수정 저장' : '메모 저장'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Memo List */}
            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar"
            >
                {memos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-300 text-center gap-3">
                        <div className="p-4 bg-gray-50 rounded-full">
                            <MessageSquare size={32} />
                        </div>
                        <p className="text-xs font-medium">작성된 메모가 없습니다.<br/>첫 번째 의견을 남겨보세요!</p>
                    </div>
                ) : (
                    memos.map((memo) => (
                        <div 
                            key={memo.id}
                            className={`group bg-white border border-gray-100 p-4 rounded-xl shadow-sm hover:shadow-md hover:border-blue-100 transition-all ${
                                editingId === memo.id ? 'ring-2 ring-blue-400 border-transparent' : ''
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-[#2c3e7c]">
                                        <User size={12} />
                                    </div>
                                    <span className="text-xs font-bold text-gray-700">{memo.authorName}</span>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => handleEdit(memo)}
                                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="수정"
                                    >
                                        <Edit3 size={14} />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(memo.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="삭제"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            
                            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap mb-3">
                                {memo.content}
                            </p>
                            
                            <div className="flex items-center gap-3 text-[10px] text-gray-400 font-medium">
                                <div className="flex items-center gap-1">
                                    <Clock size={12} />
                                    {format(new Date(memo.createdAt), 'yyyy.MM.dd HH:mm', { locale: ko })}
                                </div>
                                {memo.updatedAt !== memo.createdAt && (
                                    <span className="text-blue-400 font-semibold">(수정됨)</span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }
            `}</style>
        </div>
    );
};

export default MemoPanel;
