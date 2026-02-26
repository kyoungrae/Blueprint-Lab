import React, { useState } from 'react';
import { useComponentStore } from '../store/componentStore';
import { Box, Search, ChevronRight, Focus } from 'lucide-react';
import { getImageDisplayUrl } from '../utils/imageUrl';
import { useReactFlow } from 'reactflow';

const ComponentSidebar: React.FC = () => {
    const { components } = useComponentStore();
    const { fitView, setNodes } = useReactFlow();
    const [search, setSearch] = useState('');
    const [composing, setComposing] = useState<string | null>(null);
    const displaySearch = composing !== null ? composing : search;

    const filteredComponents = components.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.screenId.toLowerCase().includes(search.toLowerCase())
    );

    const handleFocusNode = (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        e.preventDefault();

        fitView({
            nodes: [{ id: nodeId }],
            duration: 800,
            padding: 0.5,
        });

        setNodes((nodes) =>
            nodes.map((node) => ({
                ...node,
                selected: node.id === nodeId,
            }))
        );
    };

    return (
        <div className="w-full min-w-0 h-full bg-white flex flex-col z-20 overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-teal-600 rounded-lg text-white">
                        <Box size={18} />
                    </div>
                    <h2 className="text-lg font-bold text-gray-800 tracking-tight">컴포넌트 목록</h2>
                    <span className="ml-auto bg-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {components.length}
                    </span>
                </div>

                <div className="relative group">
                    <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-teal-600 transition-colors"
                    />
                    <input
                        type="text"
                        placeholder="컴포넌트 ID / 이름 검색..."
                        value={displaySearch}
                        onChange={(e) => {
                            const v = e.target.value;
                            if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                setComposing(v);
                                return;
                            }
                            setComposing(null);
                            setSearch(v);
                        }}
                        onCompositionEnd={(e) => {
                            const v = (e.target as HTMLInputElement).value;
                            setComposing(null);
                            setSearch(v);
                        }}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {filteredComponents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="p-3 bg-gray-50 rounded-full text-gray-300 mb-2">
                            <Search size={24} />
                        </div>
                        <p className="text-sm text-gray-400">컴포넌트를 찾을 수 없습니다</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {filteredComponents.map((screen) => (
                            <div key={screen.id} className="group/item">
                                <details className="group">
                                    <summary className="list-none flex items-center gap-2 p-2 hover:bg-teal-50 rounded-lg cursor-pointer transition-colors group/summary">
                                        <ChevronRight size={14} className="text-gray-400 group-open:rotate-90 transition-transform" />

                                        {screen.imageUrl ? (
                                            <div className="w-8 h-8 rounded border border-gray-200 overflow-hidden flex-shrink-0 bg-white">
                                                <img src={getImageDisplayUrl(screen.imageUrl)} className="w-full h-full object-cover" alt="thumb" />
                                            </div>
                                        ) : (
                                            <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-300">
                                                <Box size={14} />
                                            </div>
                                        )}

                                        <div className="flex flex-col min-w-0 flex-1 ml-1">
                                            <span className="text-sm font-semibold text-gray-700 truncate leading-tight">{screen.name}</span>
                                            <span className="text-[10px] text-gray-400 font-mono truncate leading-tight">{screen.screenId}</span>
                                        </div>
                                        <span className="text-[9px] bg-teal-600 text-white px-1.5 py-0.5 rounded font-bold">
                                            {screen.screenType}
                                        </span>
                                        <button
                                            onClick={(e) => handleFocusNode(e, screen.id)}
                                            className="p-1.5 hover:bg-teal-100 rounded text-teal-600 transition-all active:scale-90"
                                            title="컴포넌트 위치로 이동"
                                        >
                                            <Focus size={14} />
                                        </button>
                                    </summary>

                                    <div className="pl-8 pr-2 py-2 space-y-1.5 border-l border-gray-100 ml-4 mb-2 mt-1">
                                        <div className="text-[10px] text-gray-400 space-y-0.5">
                                            <div>작성자: <span className="text-gray-600">{screen.author || '-'}</span></div>
                                            <div>작성일: <span className="text-gray-600 font-mono">{screen.createdDate || '-'}</span></div>
                                        </div>
                                        {screen.subComponents && screen.subComponents.length > 0 && (
                                            <div className="pt-1 border-t border-gray-100 space-y-1">
                                                <div className="text-[9px] font-bold text-gray-400 uppercase">하위 컴포넌트 ({screen.subComponents.length})</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {screen.subComponents.map((sub) => (
                                                        <span
                                                            key={sub.id}
                                                            className="px-2 py-0.5 bg-violet-50 text-violet-700 text-[10px] font-bold rounded-md"
                                                        >
                                                            {sub.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {screen.fields.length > 0 && (
                                            <div className="pt-1 border-t border-gray-100 space-y-1">
                                                <div className="text-[9px] font-bold text-gray-400 uppercase">기능 항목 ({screen.fields.length})</div>
                                                {screen.fields.map((field) => (
                                                    <div key={field.id} className="flex items-center justify-between text-[11px]">
                                                        <div className="flex items-center gap-1.5 text-gray-600">
                                                            <div className="w-3.5 h-3.5 bg-teal-600 text-white rounded-full flex items-center justify-center text-[8px] font-black flex-shrink-0">
                                                                {field.no}
                                                            </div>
                                                            <span>{field.name || '(미입력)'}</span>
                                                        </div>
                                                        <span className="text-gray-400 font-mono text-[9px]">{field.fieldType}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </details>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-auto p-4 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <span>© 2026 Blueprint Lab</span>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-pulse" />
                        컴포넌트 설계
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ComponentSidebar;
