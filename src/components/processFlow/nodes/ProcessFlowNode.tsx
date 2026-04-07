import React, { memo, useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useReactFlow } from 'reactflow';
import { useYjsStore } from '../../../store/yjsStore';
import { useProjectStore } from '../../../store/projectStore';
import type { ProcessFlowNode as ProcessFlowNodeType, ProcessFlowRectShape } from '../../../types/processFlow';
import type { Project } from '../../../types/erd';
import { User as UserIcon, UserCog, Search, ClipboardList, StickyNote, X, GripVertical } from 'lucide-react';
import PremiumTooltip from '../../screenNode/PremiumTooltip';
import ErdTableDetailPanel from '../../erd/ErdTableDetailPanel';
import {
    collectErdTableNames,
    resolveLinkedErdProjects,
    findErdEntityByPhysicalName,
    getErdTableKoreanName,
} from '../../../utils/linkedErdProjects';

interface ProcessFlowNodeProps {
    data: ProcessFlowNodeType & { label?: string };
    selected?: boolean;
}

function resolveRectShape(data: ProcessFlowNodeType): ProcessFlowRectShape {
    if (data.type !== 'RECT') return 'rectangle';
    return data.shape ?? 'rectangle';
}

/** 플로우차트 입출력형 평행사변형: 상·하변 수평, 좌·우변 평행 기울기 */
function parallelogramParams(W: number, H: number, bw: number) {
    const pad = Math.max(4, Math.ceil(bw));
    const maxSkew = Math.max(0, W - 2 * pad - 20);
    const desired = Math.min(Math.round(W * 0.22), Math.round(H * 0.42), 72);
    const skew = maxSkew <= 0 ? 0 : Math.max(8, Math.min(desired, maxSkew));
    return { pad, skew };
}

const ProcessFlowNodeComponent: React.FC<ProcessFlowNodeProps> = ({ data, selected }) => {
    const yjsUpdateNode = useYjsStore((s: any) => s.pfUpdateNode);
    const isYjsSynced = useYjsStore((s: any) => s.isSynced);
    const { projects, currentProjectId } = useProjectStore();
    const { getViewport } = useReactFlow();
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(data.text ?? '');
    const [dbTableSearchOpen, setDbTableSearchOpen] = useState(false);
    const [dbDetailOpen, setDbDetailOpen] = useState(false);
    const [memoOpen, setMemoOpen] = useState(false);
    const [memoText, setMemoText] = useState(data.memo ?? '');
    const [memoEditMode, setMemoEditMode] = useState(false);
    const [tableSearch, setTableSearch] = useState('');
    
    // 메모 패널 상태
    const [memoPanelPos, setMemoPanelPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [memoPanelSize, setMemoPanelSize] = useState<{ w: number; h: number }>({ w: 240, h: 180 });
    const [isDraggingMemo, setIsDraggingMemo] = useState(false);
    const [isResizingMemo, setIsResizingMemo] = useState(false);
    const memoDragStartRef = useRef<{ x: number; y: number } | null>(null);
    const memoPanelStartRef = useRef<{ x: number; y: number } | null>(null);
    const memoSizeStartRef = useRef<{ w: number; h: number } | null>(null);
    
    // 테이블 검색 패널 상태
    const [tablePanelPos, setTablePanelPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [tablePanelSize, setTablePanelSize] = useState<{ w: number; h: number }>({ w: 260, h: 280 });
    const [isDraggingTable, setIsDraggingTable] = useState(false);
    const [isResizingTable, setIsResizingTable] = useState(false);
    const tableDragStartRef = useRef<{ x: number; y: number } | null>(null);
    const tablePanelStartRef = useRef<{ x: number; y: number } | null>(null);
    const tableSizeStartRef = useRef<{ w: number; h: number } | null>(null);
    
    const dbErdAnchorRef = useRef<HTMLDivElement>(null);
    const memoAnchorRef = useRef<HTMLButtonElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const memoTextareaRef = useRef<HTMLTextAreaElement>(null);

    const memoPanelElRef = useRef<HTMLDivElement>(null);
    const tablePanelElRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!memoOpen && !dbTableSearchOpen) return;
        let raf = 0;

        const tick = () => {
            const { zoom } = getViewport();

            if (memoOpen) {
                const anchor = memoAnchorRef.current;
                const panel = memoPanelElRef.current;
                if (anchor && panel) {
                    const rect = anchor.getBoundingClientRect();
                    const left = rect.left + window.scrollX + memoPanelPos.x;
                    const top = rect.bottom + window.scrollY + memoPanelPos.y;
                    panel.style.left = `${left}px`;
                    panel.style.top = `${top}px`;
                    panel.style.transform = `scale(${zoom})`;
                }
            }

            if (dbTableSearchOpen) {
                const anchor = dbErdAnchorRef.current;
                const panel = tablePanelElRef.current;
                if (anchor && panel) {
                    const rect = anchor.getBoundingClientRect();
                    const left = rect.left + window.scrollX + tablePanelPos.x;
                    const top = rect.bottom + window.scrollY + tablePanelPos.y;
                    panel.style.left = `${left}px`;
                    panel.style.top = `${top}px`;
                    panel.style.transform = `scale(${zoom})`;
                }
            }

            raf = window.requestAnimationFrame(tick);
        };

        raf = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(raf);
    }, [memoOpen, dbTableSearchOpen, getViewport, memoPanelPos.x, memoPanelPos.y, tablePanelPos.x, tablePanelPos.y]);

    const currentProject = useMemo(
        () => projects.find((p) => p.id === currentProjectId),
        [projects, currentProjectId],
    );
    const linkedErdProjects = useMemo(
        () => resolveLinkedErdProjects(projects as Project[], currentProject as Project | undefined),
        [projects, currentProject],
    );
    const erdTableNames = useMemo(() => collectErdTableNames(linkedErdProjects), [linkedErdProjects]);

    const erdDetailColumnRows = useMemo(() => {
        const nameEn = data.linkedErdTableName;
        if (!nameEn) return [];
        const found = findErdEntityByPhysicalName(linkedErdProjects, nameEn);
        if (!found) return [];
        return found.entity.attributes.map((a) => ({
            nameEn: a.name,
            nameKr: (a.comment ?? '').trim(),
            dataType: a.type ?? '',
            length: a.length ?? '',
        }));
    }, [data.linkedErdTableName, linkedErdProjects, isYjsSynced]);

    const erdDetailTableKr = useMemo(() => {
        const en = data.linkedErdTableName;
        if (!en) return '';
        return getErdTableKoreanName(linkedErdProjects, en);
    }, [data.linkedErdTableName, linkedErdProjects, isYjsSynced]);

    useEffect(() => {
        if (!dbTableSearchOpen && !dbDetailOpen && !memoOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (dbDetailOpen) {
                e.preventDefault();
                setDbDetailOpen(false);
            } else if (dbTableSearchOpen) {
                e.preventDefault();
                setDbTableSearchOpen(false);
            } else if (memoOpen) {
                e.preventDefault();
                setMemoOpen(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [dbTableSearchOpen, dbDetailOpen, memoOpen]);

    // 메모 데이터 동기화
    useEffect(() => {
        setMemoText(data.memo ?? '');
    }, [data.memo]);

    useEffect(() => {
        if (!memoOpen) {
            setMemoEditMode(false);
            return;
        }
        const hasSavedText = (data.memo ?? '').trim().length > 0;
        if (!hasSavedText) {
            setMemoEditMode(true);
            window.setTimeout(() => memoTextareaRef.current?.focus(), 0);
        }
    }, [memoOpen, data.memo]);

    const flushMemoSave = useCallback(() => {
        if (!isYjsSynced) {
            window.alert('동기화가 끝난 뒤에 메모를 저장할 수 있습니다.');
            return;
        }
        const next = memoText.trim();
        if (next !== (data.memo ?? '')) {
            yjsUpdateNode(data.id, { memo: next || undefined });
        }
    }, [data.id, data.memo, memoText, isYjsSynced, yjsUpdateNode]);

    // 드래그 및 리사이즈 이벤트 핸들러
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // 메모 패널 드래그
            if (isDraggingMemo && memoDragStartRef.current && memoPanelStartRef.current) {
                const dx = e.clientX - memoDragStartRef.current.x;
                const dy = e.clientY - memoDragStartRef.current.y;
                setMemoPanelPos({
                    x: memoPanelStartRef.current.x + dx,
                    y: memoPanelStartRef.current.y + dy,
                });
            }
            // 메모 패널 리사이즈
            if (isResizingMemo && memoDragStartRef.current && memoSizeStartRef.current) {
                const dx = e.clientX - memoDragStartRef.current.x;
                const dy = e.clientY - memoDragStartRef.current.y;
                setMemoPanelSize({
                    w: Math.max(200, memoSizeStartRef.current.w + dx),
                    h: Math.max(150, memoSizeStartRef.current.h + dy),
                });
            }
            // 테이블 패널 드래그
            if (isDraggingTable && tableDragStartRef.current && tablePanelStartRef.current) {
                const dx = e.clientX - tableDragStartRef.current.x;
                const dy = e.clientY - tableDragStartRef.current.y;
                setTablePanelPos({
                    x: tablePanelStartRef.current.x + dx,
                    y: tablePanelStartRef.current.y + dy,
                });
            }
            // 테이블 패널 리사이즈
            if (isResizingTable && tableDragStartRef.current && tableSizeStartRef.current) {
                const dx = e.clientX - tableDragStartRef.current.x;
                const dy = e.clientY - tableDragStartRef.current.y;
                setTablePanelSize({
                    w: Math.max(220, tableSizeStartRef.current.w + dx),
                    h: Math.max(200, tableSizeStartRef.current.h + dy),
                });
            }
        };

        const handleMouseUp = () => {
            setIsDraggingMemo(false);
            setIsResizingMemo(false);
            setIsDraggingTable(false);
            setIsResizingTable(false);
            memoDragStartRef.current = null;
            memoPanelStartRef.current = null;
            memoSizeStartRef.current = null;
            tableDragStartRef.current = null;
            tablePanelStartRef.current = null;
            tableSizeStartRef.current = null;
        };

        if (isDraggingMemo || isResizingMemo || isDraggingTable || isResizingTable) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingMemo, isResizingMemo, isDraggingTable, isResizingTable]);

    const handleDoubleClick = useCallback(() => {
        setIsEditing(true);
        setEditText(data.text ?? '');
    }, [data.text]);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            const textarea = textareaRef.current;
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 80)}px`;
        }
    }, [editText, isEditing]);

    const handleSave = useCallback(() => {
        const trimmed = editText.trim();
        if (trimmed !== (data.text ?? '')) {
            yjsUpdateNode(data.id, { text: trimmed });
        }
        setIsEditing(false);
    }, [data.text, editText, yjsUpdateNode, data.id]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSave();
            }
            if (e.key === 'Escape') {
                setIsEditing(false);
                setEditText(data.text ?? '');
            }
        },
        [handleSave, data.text]
    );

    const nodeStyle = {
        background: data.style?.fill ?? '#ffffff',
        borderColor: data.style?.stroke ?? '#94a3b8',
        borderWidth: data.style?.strokeWidth ?? 1,
        borderRadius: data.style?.radius ?? 12,
        width: data.style?.width ?? 240,
        height: data.style?.height ?? 120,
        color: data.textStyle?.color ?? '#0f172a',
        fontSize: data.textStyle?.fontSize ?? 14,
        fontWeight: data.textStyle?.bold ? 700 : 500,
        fontStyle: data.textStyle?.italic ? 'italic' : 'normal',
    };

    const isUserNode = data.type === 'USER';
    const rectShape = resolveRectShape(data);
    const bw = Number(nodeStyle.borderWidth) || 1;
    const W = nodeStyle.width;
    const H = nodeStyle.height;

    const connDot: React.CSSProperties = {
        width: 10,
        height: 10,
        minWidth: 10,
        minHeight: 10,
        background: '#10b981',
        border: '2px solid #fff',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.2)',
    };

    const connHandleClass = 'pf-process-flow-conn-handle';
    /**
     * 연결점(10px + 흰 테두리)이 부모 노드 박스 밖으로 나가면 잘림.
     * 모든 도형 공통으로 W×H 경계 안쪽에 중심을 둔다 (상·하·좌·우 변 중앙).
     */
    const handleInset = -5;
    const handleCenterStyle = { transform: 'translate(-50%, -50%)' as const };

    const handlesInParentBox = rectShape === 'diamond' ? (
        <>
            {/* 마름모 도형을 위한 다중 연결 핸들 - 상단 (같은 위치에 겹쳐서 배치) */}
            <Handle type="target" position={Position.Top} id="in-top-1" className={connHandleClass} style={{ ...connDot, left: '50%', top: handleInset, ...handleCenterStyle }} />
            <Handle type="target" position={Position.Top} id="in-top-2" className={connHandleClass} style={{ ...connDot, left: '50%', top: handleInset, ...handleCenterStyle, opacity: 0 }} />
            <Handle type="target" position={Position.Top} id="in-top-3" className={connHandleClass} style={{ ...connDot, left: '50%', top: handleInset, ...handleCenterStyle, opacity: 0 }} />
            <Handle type="source" position={Position.Top} id="top-1" className={connHandleClass} style={{ ...connDot, left: '50%', top: handleInset, ...handleCenterStyle }} />
            <Handle type="source" position={Position.Top} id="top-2" className={connHandleClass} style={{ ...connDot, left: '50%', top: handleInset, ...handleCenterStyle, opacity: 0 }} />
            <Handle type="source" position={Position.Top} id="top-3" className={connHandleClass} style={{ ...connDot, left: '50%', top: handleInset, ...handleCenterStyle, opacity: 0 }} />
            
            {/* 마름모 도형을 위한 다중 연결 핸들 - 하단 (같은 위치에 겹쳐서 배치) */}
            <Handle type="target" position={Position.Bottom} id="in-bottom-1" className={connHandleClass} style={{ ...connDot, left: '50%', top: H - handleInset, ...handleCenterStyle }} />
            <Handle type="target" position={Position.Bottom} id="in-bottom-2" className={connHandleClass} style={{ ...connDot, left: '50%', top: H - handleInset, ...handleCenterStyle, opacity: 0 }} />
            <Handle type="target" position={Position.Bottom} id="in-bottom-3" className={connHandleClass} style={{ ...connDot, left: '50%', top: H - handleInset, ...handleCenterStyle, opacity: 0 }} />
            <Handle type="source" position={Position.Bottom} id="bottom-1" className={connHandleClass} style={{ ...connDot, left: '50%', top: H - handleInset, ...handleCenterStyle }} />
            <Handle type="source" position={Position.Bottom} id="bottom-2" className={connHandleClass} style={{ ...connDot, left: '50%', top: H - handleInset, ...handleCenterStyle, opacity: 0 }} />
            <Handle type="source" position={Position.Bottom} id="bottom-3" className={connHandleClass} style={{ ...connDot, left: '50%', top: H - handleInset, ...handleCenterStyle, opacity: 0 }} />
            
            {/* 마름모 도형을 위한 다중 연결 핸들 - 좌측 (같은 위치에 겹쳐서 배치) */}
            <Handle type="target" position={Position.Left} id="in-left-1" className={connHandleClass} style={{ ...connDot, left: handleInset, top: '50%', ...handleCenterStyle }} />
            <Handle type="target" position={Position.Left} id="in-left-2" className={connHandleClass} style={{ ...connDot, left: handleInset, top: '50%', ...handleCenterStyle, opacity: 0 }} />
            <Handle type="source" position={Position.Left} id="left-1" className={connHandleClass} style={{ ...connDot, left: handleInset, top: '50%', ...handleCenterStyle }} />
            <Handle type="source" position={Position.Left} id="left-2" className={connHandleClass} style={{ ...connDot, left: handleInset, top: '50%', ...handleCenterStyle, opacity: 0 }} />
            
            {/* 마름모 도형을 위한 다중 연결 핸들 - 우측 (같은 위치에 겹쳐서 배치) */}
            <Handle type="target" position={Position.Right} id="in-right-1" className={connHandleClass} style={{ ...connDot, left: W - handleInset, top: '50%', ...handleCenterStyle }} />
            <Handle type="target" position={Position.Right} id="in-right-2" className={connHandleClass} style={{ ...connDot, left: W - handleInset, top: '50%', ...handleCenterStyle, opacity: 0 }} />
            <Handle type="source" position={Position.Right} id="right-1" className={connHandleClass} style={{ ...connDot, left: W - handleInset, top: '50%', ...handleCenterStyle }} />
            <Handle type="source" position={Position.Right} id="right-2" className={connHandleClass} style={{ ...connDot, left: W - handleInset, top: '50%', ...handleCenterStyle, opacity: 0 }} />
        </>
    ) : (
        <>
            <Handle
                type="target"
                position={Position.Top}
                id="in-top"
                className={connHandleClass}
                style={{ ...connDot, left: '50%', top: handleInset, ...handleCenterStyle }}
            />
            <Handle
                type="source"
                position={Position.Top}
                id="top"
                className={connHandleClass}
                style={{ ...connDot, left: '50%', top: handleInset, ...handleCenterStyle }}
            />
            <Handle
                type="target"
                position={Position.Right}
                id="in-right"
                className={connHandleClass}
                style={{ ...connDot, left: W - handleInset, top: '50%', ...handleCenterStyle }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="right"
                className={connHandleClass}
                style={{ ...connDot, left: W - handleInset, top: '50%', ...handleCenterStyle }}
            />
            <Handle
                type="target"
                position={Position.Bottom}
                id="in-bottom"
                className={connHandleClass}
                style={{ ...connDot, left: '50%', top: H - handleInset, ...handleCenterStyle }}
            />
            <Handle
                type="source"
                position={Position.Bottom}
                id="bottom"
                className={connHandleClass}
                style={{ ...connDot, left: '50%', top: H - handleInset, ...handleCenterStyle }}
            />
            <Handle
                type="target"
                position={Position.Left}
                id="in-left"
                className={connHandleClass}
                style={{ ...connDot, left: handleInset, top: '50%', ...handleCenterStyle }}
            />
            <Handle
                type="source"
                position={Position.Left}
                id="left"
                className={connHandleClass}
                style={{ ...connDot, left: handleInset, top: '50%', ...handleCenterStyle }}
            />
        </>
    );

    const textStyleProps: React.CSSProperties = {
        fontSize: nodeStyle.fontSize,
        color: nodeStyle.color,
        fontWeight: nodeStyle.fontWeight,
        fontStyle: nodeStyle.fontStyle,
    };

    const rectBody = (
        <>
            {isEditing ? (
                <textarea
                    ref={textareaRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    className="w-full max-w-[90%] bg-transparent border-none outline-none text-center resize-none overflow-hidden"
                    style={{ ...textStyleProps, minHeight: '22px', maxHeight: '80px' }}
                    autoFocus
                    rows={1}
                />
            ) : (
                <span className="px-1 text-center" style={{ ...textStyleProps, whiteSpace: 'pre-wrap', wordBreak: 'break-word' ,backgroundColor: '#ffffff'}}>
                    {data.text ?? 'Process'}
                </span>
            )}
        </>
    );

    const ringClass = selected ? 'ring-2 ring-amber-400 ring-offset-2' : '';

    const renderRectShell = () => {
        switch (rectShape) {
            case 'diamond': {
                const o = Math.max(4, Math.ceil(bw));
                const cx = W / 2;
                const cy = H / 2;
                const pts = `${cx},${o} ${W - o},${cy} ${cx},${H - o} ${o},${cy}`;
                return (
                    <div
                        className={`relative cursor-pointer transition-all duration-200 hover:shadow-lg ${ringClass}`}
                        style={{ width: W, height: H }}
                        onDoubleClick={handleDoubleClick}
                    >
                        <svg className="absolute inset-0 h-full w-full" aria-hidden>
                            <polygon points={pts} fill={nodeStyle.background} stroke={nodeStyle.borderColor} strokeWidth={bw} strokeLinejoin="round" />
                        </svg>
                        <div className="relative z-10 flex h-full w-full items-center justify-center px-3 py-2">{rectBody}</div>
                    </div>
                );
            }
            case 'trapezoid': {
                const { pad, skew } = parallelogramParams(W, H, bw);
                const pts = `${pad + skew},${pad} ${W - pad},${pad} ${W - pad - skew},${H - pad} ${pad},${H - pad}`;
                return (
                    <div
                        className={`relative cursor-pointer transition-all duration-200 hover:shadow-lg ${ringClass}`}
                        style={{ width: W, height: H }}
                        onDoubleClick={handleDoubleClick}
                    >
                        <svg className="absolute inset-0 h-full w-full" aria-hidden>
                            <polygon points={pts} fill={nodeStyle.background} stroke={nodeStyle.borderColor} strokeWidth={bw} strokeLinejoin="round" />
                        </svg>
                        <div className="relative z-10 flex h-full w-full items-center justify-center px-4 py-2">{rectBody}</div>
                    </div>
                );
            }
            case 'db': {
                const pad = Math.max(2, bw);
                const cx = W / 2;
                const rx = Math.min((W - 2 * pad) * 0.4, W / 2 - pad - 1);
                const ry = Math.min(H * 0.085, 11);
                const ty = pad + ry + 2;
                const gapBetweenTiers = Math.max(4, bw * 1.5);
                /** 윗타원 좌·우 끝점 (cx±rx, ty)에서 세로가 이어지도록 몸통 시작 = 타원 중심 높이 */
                const bodyStart = ty;
                const bottomArcCenterY = H - pad - ry - 2;
                const usable = Math.max(0, bottomArcCenterY - bodyStart - 2 * gapBetweenTiers);
                const tierV = usable > 0 ? usable / 3 : Math.max(8, (H - bodyStart - 2 * gapBetweenTiers) / 3);
                const c0 = bodyStart + tierV;
                const c1 = c0 + gapBetweenTiers + tierV;
                const c2 = c1 + gapBetweenTiers + tierV;
                const y0 = bodyStart;
                const y1 = c0 + gapBetweenTiers;
                const y2 = c1 + gapBetweenTiers;
                const arcSweepDown = 0;
                /** 본체 채움: (cx±rx,ty)에서 내려가 맨 아래 호로 닫고, 윗면은 타원 아래쪽 반원으로 상단 경계 연결 */
                const bodyFill = [
                    `M ${cx - rx} ${ty}`,
                    `L ${cx - rx} ${c2}`,
                    `A ${rx} ${ry} 0 0 ${arcSweepDown} ${cx + rx} ${c2}`,
                    `L ${cx + rx} ${ty}`,
                    `A ${rx} ${ry} 0 0 0 ${cx - rx} ${ty}`,
                    'Z',
                ].join(' ');
                const bulletR = Math.max(2, Math.min(3.5, bw + 1.2));
                const bulletX = cx - rx + bulletR + Math.max(3, bw);
                const tiers = [
                    { yTop: y0, c: c0 },
                    { yTop: y1, c: c1 },
                    { yTop: y2, c: c2 },
                ] as const;
                const showErdUi = linkedErdProjects.length > 0;
                return (
                    <div
                        className={`relative cursor-pointer transition-all duration-200 hover:shadow-lg ${ringClass}`}
                        style={{ width: W, height: H }}
                        onDoubleClick={handleDoubleClick}
                    >
                        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                            <ellipse cx={cx} cy={ty} rx={rx} ry={ry} fill={nodeStyle.background} />
                            <path d={bodyFill} fill={nodeStyle.background} />
                            <g
                                fill="none"
                                stroke={nodeStyle.borderColor}
                                strokeWidth={bw}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            >
                                <ellipse cx={cx} cy={ty} rx={rx} ry={ry} />
                                {tiers.map(({ yTop, c }) => (
                                    <React.Fragment key={`${yTop}-${c}`}>
                                        <line x1={cx - rx} y1={yTop} x2={cx - rx} y2={c} />
                                        <line x1={cx + rx} y1={yTop} x2={cx + rx} y2={c} />
                                        <path d={`M ${cx - rx} ${c} A ${rx} ${ry} 0 0 ${arcSweepDown} ${cx + rx} ${c}`} />
                                    </React.Fragment>
                                ))}
                            </g>
                            <g fill={nodeStyle.borderColor}>
                                {tiers.map(({ yTop, c }) => (
                                    <circle
                                        key={`b-${yTop}`}
                                        cx={bulletX}
                                        cy={(yTop + c) / 2}
                                        r={bulletR}
                                    />
                                ))}
                            </g>
                        </svg>
                        <div className="relative z-10 flex h-full w-full items-center justify-center px-3 py-5">{rectBody}</div>
                        {showErdUi ? (
                            <>
                                <div
                                    ref={dbErdAnchorRef}
                                    className="nodrag nopan absolute right-1 top-1 z-20 flex gap-0.5 rounded-md border border-amber-200/80 bg-white/95 p-0.5 shadow-sm pointer-events-auto"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                >
                                    <PremiumTooltip placement="bottom" offsetBottom={8} label="연결 ERD에서 테이블 검색">
                                        <button
                                            type="button"
                                            title="테이블 검색"
                                            className="rounded p-1 text-amber-800 transition-colors hover:bg-amber-50"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDbTableSearchOpen((o) => !o);
                                            }}
                                        >
                                            <Search size={13} strokeWidth={2.25} className="shrink-0" />
                                        </button>
                                    </PremiumTooltip>
                                    {data.linkedErdTableName ? (
                                        <PremiumTooltip placement="bottom" offsetBottom={8} label="컬럼(영·한·타입·길이) 상세">
                                            <button
                                                type="button"
                                                title="테이블 상세"
                                                className="rounded p-1 text-slate-700 transition-colors hover:bg-slate-100"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDbDetailOpen(true);
                                                }}
                                            >
                                                <ClipboardList size={13} strokeWidth={2.25} className="shrink-0" />
                                            </button>
                                        </PremiumTooltip>
                                    ) : null}
                                    {/* 메모 버튼 - DB 테이블 객체 */}
                                    <PremiumTooltip placement="bottom" offsetBottom={8} label={data.memo ? '메모 보기/수정' : '메모 추가'}>
                                        <button
                                            ref={memoAnchorRef}
                                            type="button"
                                            title="메모"
                                            className={`rounded p-1 transition-colors ${data.memo ? 'text-amber-600 bg-amber-50' : 'text-gray-500 hover:bg-amber-50 hover:text-amber-600'}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setMemoOpen((o) => !o);
                                            }}
                                        >
                                            <StickyNote size={13} strokeWidth={2.25} className="shrink-0" />
                                        </button>
                                    </PremiumTooltip>
                                </div>
                                {/* 테이블 검색 패널 - createPortal로 body에 렌더링 */}
                                {dbTableSearchOpen && createPortal(
                                    <div
                                        ref={tablePanelElRef}
                                        className="bg-white border border-amber-200 rounded-xl shadow-2xl overflow-hidden flex flex-col"
                                        style={{
                                            position: 'fixed',
                                            left: 0,
                                            top: 0,
                                            width: tablePanelSize.w,
                                            height: tablePanelSize.h,
                                            minWidth: 220,
                                            minHeight: 200,
                                            zIndex: 2147483647,
                                            transformOrigin: 'left top',
                                        }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                        onWheel={(e) => e.stopPropagation()}
                                    >
                                        {/* 헤더 - 드래그 영역 */}
                                        <div
                                            className="flex items-center justify-between px-3 py-2 border-b border-amber-100 bg-amber-50/50 cursor-grab active:cursor-grabbing select-none"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setIsDraggingTable(true);
                                                tableDragStartRef.current = { x: e.clientX, y: e.clientY };
                                                tablePanelStartRef.current = { ...tablePanelPos };
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <GripVertical size={14} className="text-gray-400" />
                                                <span className="text-xs font-semibold text-gray-700">테이블 검색</span>
                                            </div>
                                            <button
                                                type="button"
                                                className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDbTableSearchOpen(false);
                                                    setTableSearch('');
                                                }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                        {/* 검색 입력 */}
                                        <div className="p-2 border-b border-gray-100 shrink-0">
                                            <div className="relative">
                                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                <input
                                                    type="text"
                                                    value={tableSearch}
                                                    onChange={(e) => setTableSearch(e.target.value)}
                                                    placeholder="영문명·한글명 검색"
                                                    className="nodrag w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
                                                    onClick={(e) => e.stopPropagation()}
                                                    autoComplete="off"
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                        {/* 스크롤 가능한 리스트 */}
                                        <div className="flex-1 overflow-y-auto p-1">
                                            {erdTableNames.length > 0 ? (
                                                (() => {
                                                    const searchQ = tableSearch.trim().toLowerCase();
                                                    const filtered = !searchQ
                                                        ? erdTableNames
                                                        : erdTableNames.filter((table) => {
                                                              const en = table.toLowerCase();
                                                              const ko = getErdTableKoreanName(linkedErdProjects, table).toLowerCase();
                                                              return en.includes(searchQ) || (ko.length > 0 && ko.includes(searchQ));
                                                          });
                                                    return filtered.length > 0 ? (
                                                        filtered.map((table) => {
                                                            const koreanName = getErdTableKoreanName(linkedErdProjects, table);
                                                            return (
                                                                <button
                                                                    key={table}
                                                                    type="button"
                                                                    className="w-full text-left px-2 py-1.5 hover:bg-amber-50 text-xs text-gray-700 rounded block"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const ko = getErdTableKoreanName(linkedErdProjects, table);
                                                                        const text = ko ? `${ko}\n${table}` : table;
                                                                        yjsUpdateNode(data.id, {
                                                                            linkedErdTableName: table,
                                                                            text,
                                                                        });
                                                                        setDbTableSearchOpen(false);
                                                                        setTableSearch('');
                                                                    }}
                                                                >
                                                                    <div className="flex items-center justify-between gap-2 min-w-0">
                                                                        <span className="truncate font-medium">{table}</span>
                                                                        {koreanName ? (
                                                                            <span className="text-gray-400 text-[10px] truncate">{koreanName}</span>
                                                                        ) : null}
                                                                    </div>
                                                                </button>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="px-2 py-2 text-xs text-gray-400 text-center">검색 결과가 없습니다</div>
                                                    );
                                                })()
                                            ) : (
                                                <div className="px-2 py-2 text-xs text-gray-400 text-center">테이블이 없습니다</div>
                                            )}
                                        </div>
                                        {/* 리사이즈 핸들 */}
                                        <div
                                            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-amber-200/50 hover:bg-amber-300/50"
                                            style={{ 
                                                clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
                                                borderBottomRightRadius: '12px'
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                setIsResizingTable(true);
                                                tableDragStartRef.current = { x: e.clientX, y: e.clientY };
                                                tableSizeStartRef.current = { ...tablePanelSize };
                                            }}
                                        />
                                    </div>,
                                    document.body
                                )}
                                <ErdTableDetailPanel
                                    open={dbDetailOpen && Boolean(data.linkedErdTableName)}
                                    onClose={() => setDbDetailOpen(false)}
                                    tableNameEn={data.linkedErdTableName ?? ''}
                                    tableNameKr={erdDetailTableKr}
                                    columns={erdDetailColumnRows}
                                    isLoading={!isYjsSynced || projects.length === 0}
                                />
                            </>
                        ) : null}
                    </div>
                );
            }
            default:
                return (
                    <div
                        className={`cursor-pointer border-2 px-3 py-2 transition-all duration-200 hover:shadow-lg ${ringClass} rounded-xl`}
                        style={{
                            ...nodeStyle,
                            borderStyle: 'solid',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                        }}
                        onDoubleClick={handleDoubleClick}
                    >
                        {rectBody}
                    </div>
                );
        }
    };

    return (
        <>
            {handlesInParentBox}

            {isUserNode ? (
                <div
                    className={`cursor-pointer transition-all duration-200 ${selected ? 'ring-2 ring-emerald-400 ring-offset-2 rounded-2xl' : ''}`}
                    style={{
                        width: nodeStyle.width - 135,
                        height: nodeStyle.height - 20,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                    }}
                    onDoubleClick={handleDoubleClick}
                >
                    <div
                        className="flex items-center justify-center border-2 shadow-sm"
                        style={{
                            width: 56,
                            height: 56,
                            borderRadius: 9999,
                            background: '#ffffff',
                            borderColor: nodeStyle.borderColor,
                            borderWidth: nodeStyle.borderWidth,
                            borderStyle: 'solid',
                        }}
                    >
                        {data.userRole === 'admin' ? (
                            <UserCog size={24} className="text-slate-700" />
                        ) : (
                            <UserIcon size={24} className="text-slate-700" />
                        )}
                    </div>

                    {isEditing ? (
                        <textarea
                            ref={textareaRef}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-transparent border-b border-gray-200 outline-none text-center px-2 resize-none overflow-hidden"
                            style={{
                                ...textStyleProps,
                                minHeight: '20px',
                                maxHeight: '80px',
                            }}
                            autoFocus
                            rows={1}
                        />
                    ) : (
                        <div
                            className="w-full text-center px-2"
                            style={{
                                ...textStyleProps,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}
                        >
                            {data.text ?? (data.userRole === 'admin' ? '관리자' : '사용자')}
                        </div>
                    )}
                    {/* 메모 버튼 - 사용자 노드 */}
                    <div
                        className="nodrag nopan absolute -right-3 -top-3 z-20 flex gap-0.5 rounded-md border border-amber-200/80 bg-white/95 p-0.5 shadow-sm pointer-events-auto"
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                    >
                        <PremiumTooltip placement="bottom" offsetBottom={8} label={data.memo ? '메모 보기/수정' : '메모 추가'}>
                            <button
                                ref={memoAnchorRef}
                                type="button"
                                title="메모"
                                className={`rounded p-1 transition-colors ${data.memo ? 'text-amber-600 bg-amber-50' : 'text-gray-500 hover:bg-amber-50 hover:text-amber-600'}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setMemoOpen((o) => !o);
                                }}
                            >
                                <StickyNote size={13} strokeWidth={2.25} className="shrink-0" />
                            </button>
                        </PremiumTooltip>
                    </div>
                </div>
            ) : (
                <>
                    {renderRectShell()}
                    {/* 메모 버튼 - RECT 노드 (DB 제외) */}
                    {rectShape !== 'db' && (
                        <div
                            className="nodrag nopan absolute right-1 top-1 z-20 flex gap-0.5 rounded-md border border-amber-200/80 bg-white/95 p-0.5 shadow-sm pointer-events-auto"
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                        >
                            <PremiumTooltip placement="bottom" offsetBottom={8} label={data.memo ? '메모 보기/수정' : '메모 추가'}>
                                <button
                                    ref={memoAnchorRef}
                                    type="button"
                                    title="메모"
                                    className={`rounded p-1 transition-colors ${data.memo ? 'text-amber-600 bg-amber-50' : 'text-gray-500 hover:bg-amber-50 hover:text-amber-600'}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMemoOpen((o) => !o);
                                    }}
                                >
                                    <StickyNote size={13} strokeWidth={2.25} className="shrink-0" />
                                </button>
                            </PremiumTooltip>
                        </div>
                    )}
                </>
            )}
            
            {/* 메모 편집 패널 - createPortal로 body에 렌더링 */}
            {memoOpen && createPortal(
                <div
                    ref={memoPanelElRef}
                    className="bg-white border border-amber-200 rounded-xl shadow-2xl overflow-hidden flex flex-col"
                    style={{
                        position: 'fixed',
                        left: 0,
                        top: 0,
                        width: memoPanelSize.w,
                        height: memoPanelSize.h,
                        minWidth: 200,
                        minHeight: 150,
                        zIndex: 2147483647,
                        transformOrigin: 'left top',
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                >
                    {/* 헤더 - 드래그 영역 */}
                    <div
                        className="flex items-center justify-between px-3 py-2 border-b border-amber-100 bg-amber-50/50 cursor-grab active:cursor-grabbing select-none"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            setIsDraggingMemo(true);
                            memoDragStartRef.current = { x: e.clientX, y: e.clientY };
                            memoPanelStartRef.current = { ...memoPanelPos };
                        }}
                    >
                        <div className="flex items-center gap-2">
                            <GripVertical size={14} className="text-gray-400" />
                            <span className="text-xs font-semibold text-gray-700">메모</span>
                        </div>
                        <button
                            type="button"
                            className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMemoOpen(false);
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                    {/* 스크롤 가능한 콘텐츠 */}
                    <div className="flex-1 overflow-auto p-3">
                        <textarea
                            ref={memoTextareaRef}
                            value={memoText}
                            onChange={(e) => {
                                const next = e.target.value;
                                setMemoText(next);
                            }}
                            readOnly={!memoEditMode}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="메모를 입력하세요..."
                            className={`w-full h-full p-2 text-xs border border-gray-200 rounded-lg outline-none resize-none ${memoEditMode ? 'focus:border-amber-400 focus:ring-1 focus:ring-amber-100' : 'bg-gray-50 text-gray-700'}`}
                        />
                    </div>
                    <div className="shrink-0 border-t border-amber-100 bg-amber-50/30 px-3 py-2 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            className={`px-2.5 py-1 text-xs rounded-md ${memoEditMode ? 'bg-amber-600 text-white hover:bg-amber-700' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!memoEditMode) {
                                    setMemoEditMode(true);
                                    window.setTimeout(() => memoTextareaRef.current?.focus(), 0);
                                    return;
                                }
                                flushMemoSave();
                                setMemoEditMode(false);
                            }}
                        >
                            {memoEditMode ? '저장' : '수정'}
                        </button>
                    </div>
                    {/* 리사이즈 핸들 */}
                    <div
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-amber-200/50 hover:bg-amber-300/50"
                        style={{ 
                            clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
                            borderBottomRightRadius: '12px'
                        }}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setIsResizingMemo(true);
                            memoDragStartRef.current = { x: e.clientX, y: e.clientY };
                            memoSizeStartRef.current = { ...memoPanelSize };
                        }}
                    />
                </div>,
                document.body
            )}
        </>
    );
};

export const ProcessFlowNode = memo(ProcessFlowNodeComponent);
