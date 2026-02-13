import React from 'react';
import { X, Clock, User, ArrowRight, Trash2, Plus, Edit3, Link as LinkIcon, Database } from 'lucide-react';
import { useERDStore } from '../store/erdStore';

interface HistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
    const { history } = useERDStore();
    const [expandedLogs, setExpandedLogs] = React.useState<Set<string>>(new Set());

    if (!isOpen) return null;

    const toggleExpand = (logId: string) => {
        const newExpanded = new Set(expandedLogs);
        if (newExpanded.has(logId)) {
            newExpanded.delete(logId);
        } else {
            newExpanded.add(logId);
        }
        setExpandedLogs(newExpanded);
    };

    const getIcon = (type: string, targetType: string) => {
        if (type === 'CREATE') return <Plus size={14} className="text-green-500" />;
        if (type === 'DELETE') return <Trash2 size={14} className="text-red-500" />;
        if (type === 'IMPORT') return <Database size={14} className="text-indigo-500" />;
        if (type === 'UPDATE') {
            if (targetType === 'RELATIONSHIP') return <LinkIcon size={14} className="text-purple-500" />;
            return <Edit3 size={14} className="text-blue-500" />;
        }
        return <Database size={14} className="text-gray-500" />;
    };

    const formatTimestamp = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };

    const getGroupDate = (isoString: string) => {
        const date = new Date(isoString);
        return date.toISOString().split('T')[0];
    };

    const formatGroupHeader = (dateString: string) => {
        const date = new Date(dateString);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        if (dateString === today.toISOString().split('T')[0]) {
            return '오늘 (Today)';
        } else if (dateString === yesterday.toISOString().split('T')[0]) {
            return '어제 (Yesterday)';
        } else {
            return date.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
        }
    };

    // Grouping logic
    const groupedHistory = history.reduce((groups, log) => {
        const date = getGroupDate(log.timestamp);
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(log);
        return groups;
    }, {} as Record<string, typeof history>);

    const sortedDates = Object.keys(groupedHistory).sort((a, b) => b.localeCompare(a));

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 text-left">
            <div className="bg-white rounded-[32px] w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden scale-in">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                            <Clock className="text-blue-500" size={20} />
                            변경 이력 히스토리
                        </h3>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Real-time update tracking</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white rounded-xl text-gray-400 hover:text-gray-900 transition-all active:scale-90 shadow-sm border border-transparent hover:border-gray-100"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50/30">
                    {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <Clock size={48} className="opacity-10 mb-4" />
                            <p className="font-bold">기록된 이력이 없습니다.</p>
                        </div>
                    ) : (
                        sortedDates.map((date) => (
                            <div key={date} className="mb-8 last:mb-2">
                                {/* Sticky Date Header */}
                                <div className="sticky top-0 z-10 py-2 mb-4 bg-transparent">
                                    <div className="inline-flex items-center px-4 py-1.5 bg-white/80 backdrop-blur shadow-sm border border-gray-100 rounded-full">
                                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2" />
                                        <span className="text-[11px] font-black text-gray-600 uppercase tracking-wider">
                                            {formatGroupHeader(date)}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {groupedHistory[date].map((log) => (
                                        <div
                                            key={log.id}
                                            onClick={() => log.type === 'IMPORT' && toggleExpand(log.id)}
                                            className={`group bg-white border border-gray-100 hover:border-blue-100 hover:shadow-md rounded-2xl p-4 transition-all duration-200 ${log.type === 'IMPORT' ? 'cursor-pointer active:scale-[0.99]' : ''}`}
                                        >
                                            <div className="flex items-start gap-4">
                                                {/* User Avatar */}
                                                <div className="flex-shrink-0">
                                                    {log.userPicture ? (
                                                        <img src={log.userPicture} alt={log.userName} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 border-2 border-white shadow-sm">
                                                            <User size={18} />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <span className="text-sm font-black text-gray-900">{log.userName}</span>
                                                        <span className="text-[10px] text-gray-400 font-bold px-2 py-0.5 bg-gray-50 rounded-full border border-gray-100">
                                                            {formatTimestamp(log.timestamp)}
                                                        </span>
                                                        <div className={`ml-auto px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter flex items-center gap-1 ${log.type === 'CREATE' ? 'bg-green-50 text-green-600 border border-green-100' :
                                                            log.type === 'DELETE' ? 'bg-red-50 text-red-600 border border-red-100' :
                                                                log.type === 'IMPORT' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                                                                    'bg-blue-50 text-blue-600 border border-blue-100'
                                                            }`}>
                                                            {getIcon(log.type, log.targetType)}
                                                            {log.type}
                                                            {log.type === 'IMPORT' && (
                                                                <span className="ml-1 opacity-50">
                                                                    {expandedLogs.has(log.id) ? '▲' : '▼'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-1.5 rounded">
                                                            {log.targetType}
                                                        </span>
                                                        <span className="text-sm font-bold text-blue-600 truncate">{log.targetName}</span>
                                                    </div>

                                                    <div className="bg-gray-50/50 rounded-xl p-3 border border-gray-100/50 group-hover:bg-blue-50/30 transition-colors">
                                                        <p className="text-xs text-gray-600 leading-relaxed font-medium">
                                                            {log.details.split(',').map((part, i) => (
                                                                <span key={i} className="block">
                                                                    {part.includes('->') ? (
                                                                        <span className="flex items-center gap-1.5">
                                                                            <span className="opacity-60">{part.split('->')[0].trim()}</span>
                                                                            <ArrowRight size={10} className="text-blue-400" />
                                                                            <span className="font-bold text-gray-800">{part.split('->')[1].trim()}</span>
                                                                        </span>
                                                                    ) : (
                                                                        part.trim()
                                                                    )}
                                                                </span>
                                                            ))}
                                                        </p>

                                                        {/* Expanded Tables List for IMPORT */}
                                                        {log.type === 'IMPORT' && expandedLogs.has(log.id) && log.payload?.importedTables && (
                                                            <div className="mt-3 pt-3 border-t border-gray-200/50 animate-in fade-in slide-in-from-top-2 duration-300">
                                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">가져온 테이블 목록</p>
                                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                                                    {log.payload.importedTables.map((tableName: string, idx: number) => (
                                                                        <div key={idx} className="flex items-center gap-2 bg-white/50 px-2 py-1.5 rounded-lg border border-gray-100">
                                                                            <div className="w-1 h-1 bg-indigo-400 rounded-full" />
                                                                            <span className="text-[11px] font-bold text-gray-700 truncate">{tableName}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                        최근 100개의 변경 이력만 유지됩니다.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default HistoryModal;
