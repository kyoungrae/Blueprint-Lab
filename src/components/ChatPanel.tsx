import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Users, MessageSquare, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';

interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    senderPicture?: string;
    text: string;
    timestamp: number;
    targetId: string | null;
}

interface ChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    activeTab?: 'GLOBAL' | string;
    onActiveTabChange?: (tab: 'GLOBAL' | string) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose, activeTab: controlledActiveTab, onActiveTabChange }) => {
    const currentUser = useAuthStore((s) => s.user);
    const onlineUsers = useSyncStore((s) => s.onlineUsers);
    const sendOperation = useSyncStore((s) => s.sendOperation);

    const uniqueUsers = useMemo(() => {
        return Array.from(new Map(onlineUsers.map((u) => [u.id, u])).values());
    }, [onlineUsers]);

    const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState<'GLOBAL' | string>('GLOBAL');
    const activeTab = controlledActiveTab ?? uncontrolledActiveTab;
    const setActiveTab = (tab: 'GLOBAL' | string) => {
        onActiveTabChange?.(tab);
        if (controlledActiveTab === undefined) {
            setUncontrolledActiveTab(tab);
        }
    };
    const [messageInput, setMessageInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onRemote = (e: Event) => {
            const detail = (e as CustomEvent).detail as {
                id: string;
                userId: string;
                userName: string;
                payload: Record<string, unknown>;
            };

            const payload = detail?.payload as unknown as {
                chatMessage?: ChatMessage;
            };
            const msg = payload?.chatMessage;
            if (!msg) return;

            setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, msg];
            });
        };

        window.addEventListener('chat:remote_message', onRemote);
        return () => window.removeEventListener('chat:remote_message', onRemote);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const container = scrollContainerRef.current;
        if (!container) return;

        const isNearBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight < 150;

        if (isNearBottom) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, activeTab, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setActiveTab('GLOBAL');
        }
    }, [isOpen]);

    const filteredMessages = useMemo(() => {
        if (!currentUser) return [];

        return messages.filter((msg) => {
            if (activeTab === 'GLOBAL') return msg.targetId === null;
            return (
                (msg.senderId === currentUser.id && msg.targetId === activeTab) ||
                (msg.senderId === activeTab && msg.targetId === currentUser.id)
            );
        });
    }, [messages, activeTab, currentUser]);

    const handleSendMessage = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!currentUser) return;
        const text = messageInput.trim();
        if (!text) return;

        const newMessage: ChatMessage = {
            id: `msg_${Date.now()}`,
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderPicture: currentUser.picture,
            text,
            timestamp: Date.now(),
            targetId: activeTab === 'GLOBAL' ? null : activeTab,
        };

        setMessages((prev) => [...prev, newMessage]);
        sendOperation({
            type: 'CHAT_MESSAGE',
            targetId: activeTab === 'GLOBAL' ? 'GLOBAL' : activeTab,
            userId: currentUser.id,
            userName: currentUser.name,
            payload: {
                chatMessage: newMessage,
            },
        });
        setMessageInput('');
    };

    if (!isOpen) return null;

    const activeDmUser = activeTab === 'GLOBAL' ? null : uniqueUsers.find((u) => u.id === activeTab);

    return createPortal(
        <div className="fixed top-20 right-4 w-80 h-[500px] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden z-[10000] animate-in slide-in-from-right-4 fade-in duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white shrink-0">
                <div className="flex items-center gap-2">
                    <MessageSquare size={16} className="text-violet-500" />
                    <span className="font-black text-gray-800 text-sm">프로젝트 채팅</span>
                </div>
                <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-lg transition-colors">
                    <X size={16} />
                </button>
            </div>

            <div className="flex flex-1 min-h-0">
                <div className="w-16 bg-gray-50 border-r border-gray-100 flex flex-col items-center py-2 gap-2 overflow-y-auto shrink-0">
                    <div className="relative group">
                        <button
                            onClick={() => setActiveTab('GLOBAL')}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTab === 'GLOBAL' ? 'bg-violet-100 text-violet-600 ring-2 ring-violet-500 ring-offset-1' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'}`}
                        >
                            <Users size={18} />
                        </button>
                    </div>

                    <div className="w-8 h-px bg-gray-200 my-1" />

                    {uniqueUsers
                        .filter((u) => u.id !== currentUser?.id)
                        .map((u) => (
                            <div key={u.id} className="relative group">
                                <button
                                    onClick={() => setActiveTab(u.id)}
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border ${activeTab === u.id ? 'ring-2 ring-violet-500 ring-offset-1 border-transparent' : 'border-gray-200 hover:border-violet-300'}`}
                                    style={{ backgroundColor: activeTab === u.id ? '#8b5cf620' : 'white' }}
                                    title={u.name}
                                >
                                    {u.picture ? (
                                        <img src={u.picture} alt={u.name} className="w-full h-full rounded-xl object-cover" />
                                    ) : (
                                        <span className="text-xs font-bold text-violet-600">{u.name.substring(0, 2)}</span>
                                    )}
                                </button>
                                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />
                            </div>
                        ))}
                </div>

                <div className="flex-1 flex flex-col bg-white min-w-0">
                    <div className="px-4 py-2 border-b border-gray-50 flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-gray-600 truncate">
                            {activeTab === 'GLOBAL' ? '전체 메시지' : `${activeDmUser?.name || ''} 님과의 1:1 대화`}
                        </span>
                    </div>

                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                        {filteredMessages.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
                                <MessageSquare size={24} className="opacity-50" />
                                <span className="text-xs font-medium">첫 메시지를 보내보세요!</span>
                            </div>
                        ) : (
                            filteredMessages.map((msg) => {
                                const isMe = msg.senderId === currentUser?.id;
                                return (
                                    <div key={msg.id} className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                                        <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                            {!isMe && (
                                                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200">
                                                    {msg.senderPicture ? (
                                                        <img src={msg.senderPicture} className="w-full h-full rounded-full" alt="" />
                                                    ) : (
                                                        <UserIcon size={12} className="text-gray-400" />
                                                    )}
                                                </div>
                                            )}
                                            <div
                                                className={`px-3 py-2 rounded-2xl max-w-[180px] text-[13px] break-words shadow-sm ${
                                                    isMe
                                                        ? 'bg-violet-500 text-white rounded-br-sm'
                                                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                                                }`}
                                            >
                                                {msg.text}
                                            </div>
                                        </div>
                                        <span className="text-[9px] text-gray-400 px-8">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form onSubmit={handleSendMessage} className="p-3 bg-gray-50 border-t border-gray-100 shrink-0">
                        <div className="relative flex items-center">
                            <input
                                type="text"
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                placeholder="메시지 입력..."
                                className="w-full pl-3 pr-10 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
                            />
                            <button
                                type="submit"
                                disabled={!messageInput.trim()}
                                className="absolute right-1.5 p-1.5 bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                            >
                                <Send size={14} />
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ChatPanel;
