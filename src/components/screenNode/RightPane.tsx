import React from 'react';
import { Trash2, Database } from 'lucide-react';
import type { Screen } from '../../types/screenDesign';

interface RightPaneProps {
    screen: Screen;
    isLocked: boolean;
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
    rightPaneRef: React.RefObject<HTMLDivElement | null>;
    tableListRef: React.RefObject<HTMLDivElement | null>;
    isTableListOpen: boolean;
    setIsTableListOpen: (v: boolean) => void;
    linkedErdProject: any;
    erdTables: string[];
    tableHeight: number;
    functionHeight: number;
    handleTablePanelResize: (e: React.MouseEvent) => void;
    handleFunctionPanelResize: (e: React.MouseEvent) => void;
}

const RightPane: React.FC<RightPaneProps> = ({
    screen,
    isLocked,
    update,
    syncUpdate,
    rightPaneRef,
    tableListRef,
    isTableListOpen,
    setIsTableListOpen,
    linkedErdProject,
    erdTables,
    tableHeight,
    functionHeight,
    handleTablePanelResize,
    handleFunctionPanelResize,
}) => {
    return (
        <div ref={rightPaneRef} className="w-[30%] flex-shrink-0 flex flex-col bg-white rounded-br-[13px]" style={{ minWidth: 250 }}>
            {/* Panel 1: 기능상세 */}
            <div
                className="flex-none flex flex-col border-b border-gray-200 relative min-h-[100px]"
                style={{ height: functionHeight }}
            >
                {/* Resize Handle at the Top Border */}
                {!isLocked && (
                    <div
                        className="nodrag absolute -top-1 left-0 right-0 h-2 cursor-ns-resize z-[60] group/hr"
                        onMouseDown={handleFunctionPanelResize}
                    >
                        <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-transparent group-hover/hr:bg-blue-400 transition-colors" />
                    </div>
                )}

                <div className="bg-[#5c6b9e] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a588a] select-none shadow-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 기능상세
                </div>
                <div className="flex-1 p-0 relative group/area">
                    <textarea
                        value={screen.functionDetails}
                        onChange={(e) => update({ functionDetails: e.target.value })}
                        onBlur={(e) => syncUpdate({ functionDetails: e.target.value })}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`w-full h-full text-[11px] leading-relaxed bg-transparent border-none outline-none p-3 resize-none scrollbar-thin ${isLocked ? 'text-gray-600' : 'nodrag text-gray-800 bg-white hover:bg-blue-50/10 focus:bg-blue-50/10 transition-colors'}`}
                        placeholder={"1. 상세 기능 설명 입력...\r\n2. 주요 로직 기술..."}
                        spellCheck={false}
                    />
                </div>
            </div>

            {/* Panel 2: 관련테이블 */}
            <div
                className="flex-none flex flex-col relative min-h-[100px]"
                style={{ height: tableHeight }}
            >
                {/* Resize Handle at the Top Border */}
                {!isLocked && (
                    <div
                        className="nodrag absolute -top-1 left-0 right-0 h-2 cursor-ns-resize z-[60] group/hr"
                        onMouseDown={handleTablePanelResize}
                    >
                        <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-transparent group-hover/hr:bg-blue-400 transition-colors" />
                    </div>
                )}

                {/* Header (Contains the dropdown trigger) */}
                <div className="bg-[#5e6b7c] text-white text-[11px] font-bold px-3 py-1.5 border-t border-b border-[#4a5463] select-none shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 관련테이블
                    </div>
                    {/* ERD Table Selector */}
                    {!isLocked && linkedErdProject && (
                        <div className="relative" ref={tableListRef}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsTableListOpen(!isTableListOpen);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="nodrag flex items-center gap-1 text-[9px] bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded transition-colors"
                            >
                                <Database size={10} />
                                <span>추가</span>
                            </button>
                            {isTableListOpen && (
                                <div
                                    ref={(el) => {
                                        if (el) {
                                            el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
                                        }
                                    }}
                                    className="nodrag nopan absolute right-0 top-full mt-1 w-48 max-h-56 overflow-y-auto bg-white border border-gray-200 shadow-xl rounded-lg z-[1001] animate-in fade-in zoom-in duration-150 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
                                    onWheel={(e) => e.stopPropagation()}
                                    onWheelCapture={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <div className="p-1">
                                        {erdTables.length > 0 ? erdTables.map(table => (
                                            <button
                                                key={table}
                                                className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-[10px] text-gray-700 rounded block"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const current = screen.relatedTables || '';
                                                    const toAdd = `• ${table}`;
                                                    if (!current.includes(table)) {
                                                        const newValue = current ? `${current}\n${toAdd}` : toAdd;
                                                        update({ relatedTables: newValue });
                                                        syncUpdate({ relatedTables: newValue });
                                                    }
                                                    setIsTableListOpen(false);
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                {table}
                                            </button>
                                        )) : (
                                            <div className="px-2 py-2 text-[10px] text-gray-400 text-center">테이블이 없습니다</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col bg-white overflow-hidden rounded-br-[13px]">
                    <div
                        className="flex-1 overflow-y-auto custom-scrollbar nodrag nopan max-h-[160px] bg-white"
                        onWheel={(e) => e.stopPropagation()}
                    >
                        {(() => {
                            const tableLines = (screen.relatedTables || '').split('\n').filter(line => line.trim() !== '');

                            if (tableLines.length > 0) {
                                return (
                                    <div className="p-2">
                                        <div className="grid grid-cols-2 gap-1 px-1">
                                            {tableLines.map((line, idx) => {
                                                const displayLine = line.trim().startsWith('•') ? line.trim().substring(1).trim() : line.trim();
                                                return (
                                                    <div key={idx} className="flex items-center justify-between group/table p-1.5 hover:bg-blue-50/50 rounded transition-colors text-[10px] font-mono min-w-0">
                                                        <div className="flex items-center gap-1.5 truncate flex-1">
                                                            <span className="text-blue-500 font-bold shrink-0 text-[8px]">•</span>
                                                            <span className="text-gray-700 truncate font-bold" title={displayLine}>{displayLine}</span>
                                                        </div>
                                                        {!isLocked && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const newLines = tableLines.filter((_, i) => i !== idx);
                                                                    const newValue = newLines.join('\n');
                                                                    update({ relatedTables: newValue });
                                                                    syncUpdate({ relatedTables: newValue });
                                                                }}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                className="p-1 text-gray-400 hover:text-red-500 transition-all active:scale-90 shrink-0"
                                                                title="삭제"
                                                            >
                                                                <Trash2 size={11} />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div className="flex-1 flex flex-col items-center justify-center p-4 text-gray-300 text-center min-h-[100px]">
                                    <Database size={20} className="opacity-20 mb-2" />
                                    <p className="text-[10px] font-bold">관련 테이블 없음</p>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {/* Panel 3: 초기화면설정 (아래로 이동) */}
            <div className="flex-1 flex flex-col border-t border-gray-200 min-h-[100px]">
                <div className="bg-[#5c6b9e] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a588a] select-none shadow-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 초기화면설정
                </div>
                <div className="flex-1 p-0 relative group/area">
                    <textarea
                        value={screen.initialSettings}
                        onChange={(e) => update({ initialSettings: e.target.value })}
                        onBlur={(e) => syncUpdate({ initialSettings: e.target.value })}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`w-full h-full text-[11px] leading-relaxed bg-transparent border-none outline-none p-3 resize-none scrollbar-thin ${isLocked ? 'text-gray-600' : 'nodrag text-gray-800 bg-white hover:bg-blue-50/10 focus:bg-blue-50/10 transition-colors'}`}
                        placeholder="• 화면 진입 시 초기 설정..."
                        spellCheck={false}
                    />
                </div>
            </div>
        </div>
    );
};

export default RightPane;
