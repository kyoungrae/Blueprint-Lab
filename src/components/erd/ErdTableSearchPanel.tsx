import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from 'reactflow';
import { Database, GripVertical, Search, X } from 'lucide-react';
import type { Project } from '../../types/erd';
import { getErdTableKoreanName } from '../../utils/linkedErdProjects';

const getPanelPortalRoot = () => document.getElementById('panel-portal-root') || document.body;

export interface ErdTableSearchPanelProps {
    open: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<Element | null>;
    panelPos: { x: number; y: number } | null;
    onPanelPosChange: (p: { x: number; y: number } | null) => void;
    linkedErdProjects: Project[];
    erdTables: string[];
    /** 물리 테이블명 선택 시 */
    onPickTable: (physicalNameEn: string) => void;
    /** 화면 설계 우측 패널 잠금 등 */
    disabled?: boolean;
    screenId?: string;
    /** data-screen-id 등 구분용 */
    dataContextId?: string;
    portalTitle?: string;
}

/**
 * 화면 설계 관련테이블「추가」·프로세스 흐름 DB 도형 테이블 검색에 공통으로 쓰는 플로팅 패널.
 * ReactFlowProvider 안에서만 사용 (screenToFlowPosition / flowToScreenPosition).
 */
const ErdTableSearchPanel: React.FC<ErdTableSearchPanelProps> = ({
    open,
    onClose,
    anchorRef,
    panelPos,
    onPanelPosChange,
    linkedErdProjects,
    erdTables,
    onPickTable,
    disabled = false,
    screenId,
    dataContextId,
    portalTitle = '테이블 추가',
}) => {
    const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (open) setSearch('');
    }, [open]);

    const handleTableListHeaderMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!panelPos) return;

            const panelScreenPos = flowToScreenPosition(panelPos);
            const offsetX = e.clientX - panelScreenPos.x;
            const offsetY = e.clientY - panelScreenPos.y;

            const onMove = (me: MouseEvent) => {
                const nextScreenX = Math.max(8, me.clientX - offsetX);
                const nextScreenY = Math.max(8, me.clientY - offsetY);
                onPanelPosChange(screenToFlowPosition({ x: nextScreenX, y: nextScreenY }));
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        },
        [panelPos, flowToScreenPosition, screenToFlowPosition, onPanelPosChange],
    );

    if (!open || !anchorRef.current) return null;

    const rect = anchorRef.current.getBoundingClientRect();
    const panelFlowPos = panelPos ?? screenToFlowPosition({ x: rect.left, y: rect.bottom });
    const panelScreenPos = flowToScreenPosition(panelFlowPos);
    const panelLeft = panelScreenPos.x;
    const panelTop = panelScreenPos.y;

    const searchQ = search.trim().toLowerCase();
    const filteredErdTables =
        !searchQ
            ? erdTables
            : erdTables.filter((table) => {
                  const en = table.toLowerCase();
                  const ko = getErdTableKoreanName(linkedErdProjects, table).toLowerCase();
                  return en.includes(searchQ) || (ko.length > 0 && ko.includes(searchQ));
              });

    return createPortal(
        <div
            data-table-list-portal
            data-screen-id={screenId}
            data-context-id={dataContextId}
            className="nodrag nopan nowheel floating-panel fixed min-w-[220px] max-w-[min(100vw-16px,360px)] max-h-[280px] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-2xl z-[9000] animate-in fade-in zoom-in origin-top-left scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
            style={{
                width: 'auto',
                left: panelLeft,
                top: panelTop,
                maxHeight: Math.max(100, Math.min(280, window.innerHeight - panelTop - 8, window.innerHeight * 0.7)),
            }}
            onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
                e.preventDefault();
                e.stopPropagation();
                return false;
            }}
            onWheelCapture={(e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
                e.preventDefault();
                e.stopPropagation();
                return false;
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div
                className="flex items-center justify-between border-b border-gray-100 px-2 py-1.5 cursor-grab active:cursor-grabbing group/header"
                onMouseDown={handleTableListHeaderMouseDown}
                title="드래그하여 이동"
            >
                <div className="flex items-center gap-1.5">
                    <GripVertical size={12} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                    <Database size={12} className="text-[#2c3e7c]" />
                    <span className="text-[10px] font-bold text-gray-600">{portalTitle}</span>
                </div>
                <button
                    type="button"
                    className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <X size={14} />
                </button>
            </div>
            <div className="px-2 py-1.5 border-b border-gray-100" onMouseDown={(e) => e.stopPropagation()}>
                <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="영문명·한글명 검색"
                        className="nodrag w-full pl-7 pr-2 py-1 text-[10px] border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                        onMouseDown={(e) => e.stopPropagation()}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
            </div>
            <div className="p-1">
                {erdTables.length > 0 ? (
                    filteredErdTables.length > 0 ? (
                        filteredErdTables.map((table) => {
                            const koreanName = getErdTableKoreanName(linkedErdProjects, table);
                            return (
                                <button
                                    key={table}
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-[12px] text-gray-700 rounded block"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (disabled) return;
                                        onPickTable(table);
                                        onClose();
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <div className="flex items-center justify-between gap-2 min-w-0">
                                        <span className="truncate">{table}</span>
                                        {koreanName ? (
                                            <span className="text-gray-400 font-normal truncate">{koreanName}</span>
                                        ) : null}
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <div className="px-2 py-2 text-[10px] text-gray-400 text-center">검색 결과가 없습니다</div>
                    )
                ) : (
                    <div className="px-2 py-2 text-[10px] text-gray-400 text-center">테이블이 없습니다</div>
                )}
            </div>
        </div>,
        getPanelPortalRoot(),
    );
};

export default ErdTableSearchPanel;
