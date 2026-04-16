import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    MiniMap,
    ConnectionMode,
    ReactFlowProvider,
    useEdgesState,
    useNodesState,
    useReactFlow,
    useOnViewportChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';
import { useYjsStore } from '../../store/yjsStore';
import {
    ChevronLeft,
    ChevronRight,
    Plus,
    Home,
    LogOut,
    User as UserIcon,
    Square,
    Palette,
    X,
    UserCog,
    Database,
    Diamond,
    Upload,
    Download,
    AlignHorizontalDistributeCenter,
    AlignVerticalDistributeCenter,
    AlignHorizontalJustifyStart,
    AlignHorizontalJustifyCenter,
    AlignHorizontalJustifyEnd,
    AlignVerticalJustifyStart,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

import type { ProcessFlowNode, ProcessFlowEdge, ProcessFlowRectShape, ProcessFlowSection } from '../../types/processFlow';
import type { Screen } from '../../types/screenDesign';
import ProcessFlowSidebar from './ProcessFlowSidebar';
import { ProcessFlowNode as ProcessFlowNodeComponent } from './nodes/ProcessFlowNode';
import { ProcessFlowEdge as ProcessFlowEdgeComponent } from './edges/ProcessFlowEdge';
import type { Connection, Node, Edge } from 'reactflow';
import { copyToClipboard } from '../../utils/clipboard';
import PremiumTooltip from '../screenNode/PremiumTooltip';
import ScreenExportModal, { type ExportFormat } from '../ScreenExportModal';
import { getSmartGuidesAndSnap, type AlignmentGuides, type SnapState } from '../screenNode/smartGuides';

const nodeTypes = {
    processFlow: ProcessFlowNodeComponent,
};

const edgeTypes = {
    processFlow: ProcessFlowEdgeComponent,
};

const DEFAULT_NODE_STYLE = {
    fill: '#ffffff',
    stroke: '#94a3b8',
    strokeWidth: 1,
    width: 240,
    height: 120,
    radius: 12,
};

const DEFAULT_TEXT_STYLE = {
    fontSize: 14,
    color: '#0f172a',
    bold: false,
    italic: false,
};

const PROCESS_FLOW_SIDEBAR_DEFAULT_WIDTH = 280;
const PROCESS_FLOW_SIDEBAR_MIN_WIDTH = 200;
const PROCESS_FLOW_SIDEBAR_MAX_WIDTH = 600;
const PROCESS_FLOW_UI_COMPACT_SCALE = 0.85;
const SECTION_HANDLE_SIZE = 8;
const ZOOM_OUT_TO_LITE = 0.3;
const ZOOM_IN_TO_FULL = 0.38;

type ProcessFlowSectionDragState = { start: { x: number; y: number }; current: { x: number; y: number } };

type ProcessFlowShiftSelectionApi = {
    onSelectionStart: (e: { x: number; y: number }) => void;
    onSelectionDrag: (e: { x: number; y: number }) => void;
    onSelectionEnd: () => void;
    clear: () => void;
};

type ProcessFlowDragGuides = AlignmentGuides & {
    spacingSegments?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
};

/** 선택 노드들의 외곽 간격을 동일하게 (가로: 왼→오 순, 세로: 위→아래 순). 선택 박스 span 유지. */
function distributeProcessFlowNodesEvenGap(selected: Node[], axis: 'x' | 'y'): Array<{ id: string; position: { x: number; y: number } }> {
    if (selected.length < 2) return [];
    const items = selected.map((n) => {
        const r = getNodeRect(n);
        return { id: n.id, left: r.left, top: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    });
    if (axis === 'x') {
        items.sort((a, b) => a.left - b.left);
        const minLeft = Math.min(...items.map((i) => i.left));
        const maxRight = Math.max(...items.map((i) => i.right));
        const sumW = items.reduce((s, i) => s + i.w, 0);
        const span = maxRight - minLeft;
        let gap = (span - sumW) / (items.length - 1);
        if (!Number.isFinite(gap) || gap < 0) gap = 0;
        let x = minLeft;
        return items.map((it) => {
            const pos = { x, y: it.top };
            x += it.w + gap;
            return { id: it.id, position: pos };
        });
    }
    items.sort((a, b) => a.top - b.top);
    const minTop = Math.min(...items.map((i) => i.top));
    const maxBottom = Math.max(...items.map((i) => i.bottom));
    const sumH = items.reduce((s, i) => s + i.h, 0);
    const span = maxBottom - minTop;
    let gap = (span - sumH) / (items.length - 1);
    if (!Number.isFinite(gap) || gap < 0) gap = 0;
    let y = minTop;
    return items.map((it) => {
        const pos = { x: it.left, y };
        y += it.h + gap;
        return { id: it.id, position: pos };
    });
}

/** 선택 박스 기준 가로 정렬: 왼쪽 / 가운데 / 오른쪽 (세로 위치 유지) */
function alignProcessFlowNodesHorizontal(selected: Node[], mode: 'left' | 'center' | 'right'): Array<{ id: string; position: { x: number; y: number } }> {
    if (selected.length < 2) return [];
    const rects = selected.map((n) => ({ id: n.id, ...getNodeRect(n) }));
    const minLeft = Math.min(...rects.map((r) => r.left));
    const maxRight = Math.max(...rects.map((r) => r.right));
    const bboxCenterX = (minLeft + maxRight) / 2;
    return rects.map((r) => {
        let x = r.left;
        if (mode === 'left') x = minLeft;
        else if (mode === 'right') x = maxRight - r.width;
        else x = bboxCenterX - r.width / 2;
        return { id: r.id, position: { x, y: r.top } };
    });
}

/** 선택 박스 기준 세로 정렬: 위 / 가운데 / 아래 (가로 위치 유지) */
function alignProcessFlowNodesVertical(selected: Node[], mode: 'top' | 'center' | 'bottom'): Array<{ id: string; position: { x: number; y: number } }> {
    if (selected.length < 2) return [];
    const rects = selected.map((n) => ({ id: n.id, ...getNodeRect(n) }));
    const minTop = Math.min(...rects.map((r) => r.top));
    const maxBottom = Math.max(...rects.map((r) => r.bottom));
    const bboxCenterY = (minTop + maxBottom) / 2;
    return rects.map((r) => {
        let y = r.top;
        if (mode === 'top') y = minTop;
        else if (mode === 'bottom') y = maxBottom - r.height;
        else y = bboxCenterY - r.height / 2;
        return { id: r.id, position: { x: r.left, y } };
    });
}

function getNodeRect(node: Node): { left: number; top: number; right: number; bottom: number; centerX: number; centerY: number; width: number; height: number } {
    const width = Number((node.style as React.CSSProperties)?.width ?? node.width ?? 240);
    const height = Number((node.style as React.CSSProperties)?.height ?? node.height ?? 120);
    const left = node.position.x;
    const top = node.position.y;
    const right = left + width;
    const bottom = top + height;
    return {
        left,
        top,
        right,
        bottom,
        centerX: left + width / 2,
        centerY: top + height / 2,
        width,
        height,
    };
}

function minBoxDistance(
    a: { left: number; right: number; top: number; bottom: number },
    b: { left: number; right: number; top: number; bottom: number }
): number {
    const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
    const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
    return Math.sqrt(dx * dx + dy * dy);
}

type PfRect = ReturnType<typeof getNodeRect>;

/** 바운딩 박스 최소 거리 기준으로 가장 가까운 peer — 스마트 가이드·세로 3선 해석의 단일 참조 */
function pickNearestProcessFlowPeer(draggedRect: PfRect, others: Node[]): { rect: PfRect; refId: string } | null {
    let nearest: Node | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const candidate of others) {
        const rect = getNodeRect(candidate);
        const dist = minBoxDistance(draggedRect, rect);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = candidate;
        }
    }
    if (!nearest) return null;
    const r = getNodeRect(nearest);
    return { rect: r, refId: nearest.id };
}

/** 세로 가이드용: 같은 열(중심 X 근접) 후보 중 세로로 가장 가까운 노드. 행 가이드용: 같은 행(중심 Y 근접) 후보 중 가로로 가장 가까운 노드(L자 배치 등). */
const PF_COL_CENTER_X_EPS = 40;
const PF_ROW_CENTER_Y_EPS = 40;

function pickAxisPeersForSmartGuides(draggedRect: PfRect, others: Node[]): { xPeer: { rect: PfRect; refId: string }; yPeer: { rect: PfRect; refId: string } } | null {
    const nearest = pickNearestProcessFlowPeer(draggedRect, others);
    if (!nearest) return null;

    let bestCol: { rect: PfRect; refId: string; dy: number } | null = null;
    let bestRow: { rect: PfRect; refId: string; dx: number } | null = null;
    for (const n of others) {
        const r = getNodeRect(n);
        const dcx = Math.abs(draggedRect.centerX - r.centerX);
        if (dcx <= PF_COL_CENTER_X_EPS) {
            const dy = Math.abs(draggedRect.centerY - r.centerY);
            if (!bestCol || dy < bestCol.dy) bestCol = { rect: r, refId: n.id, dy };
        }
        const dcy = Math.abs(draggedRect.centerY - r.centerY);
        if (dcy <= PF_ROW_CENTER_Y_EPS) {
            const dx = Math.abs(draggedRect.centerX - r.centerX);
            if (!bestRow || dx < bestRow.dx) bestRow = { rect: r, refId: n.id, dx };
        }
    }

    const xPeer = bestCol ? { rect: bestCol.rect, refId: bestCol.refId } : nearest;
    const yPeer = bestRow ? { rect: bestRow.rect, refId: bestRow.refId } : nearest;
    return { xPeer, yPeer };
}

/**
 * 동일 너비 + 중앙 정렬 시 세로 가이드 3개(좌·중·우) 강제.
 * 왼쪽/오른쪽 단일 정렬 시 해당 축 1개만 표시해 "2개만 나오는" 중앙 정렬 버그 방지.
 */
function resolveProcessFlowVerticalGuides(ref: PfRect, snapped: PfRect, mergedVertical: number[], EDGE: number, SIZE_MATCH: number): number[] {
    const sameW = Math.abs(snapped.width - ref.width) <= SIZE_MATCH;
    const leftOn = Math.abs(snapped.left - ref.left) <= EDGE;
    const centerOn = Math.abs(snapped.centerX - ref.centerX) <= EDGE;
    const rightOn = Math.abs(snapped.right - ref.right) <= EDGE;

    const count = [leftOn, centerOn, rightOn].filter(Boolean).length;

    if (sameW && centerOn) {
        return [ref.left, ref.centerX, ref.right].sort((a, b) => a - b);
    }
    if (count === 1) {
        if (leftOn) return [ref.left];
        if (centerOn) return [ref.centerX];
        if (rightOn) return [ref.right];
    }
    if (count >= 2 && sameW) {
        return [ref.left, ref.centerX, ref.right].sort((a, b) => a - b);
    }
    if (count >= 2 && !sameW) {
        if (leftOn && centerOn) return [ref.left, ref.centerX].sort((a, b) => a - b);
        if (centerOn && rightOn) return [ref.centerX, ref.right].sort((a, b) => a - b);
        if (leftOn && rightOn) return [ref.left, ref.right].sort((a, b) => a - b);
    }

    return mergedVertical;
}

function buildProcessFlowReactNodes(
    pfNodes: ProcessFlowNode[] | undefined,
    prev: Node[],
    viewportMode: 'lite' | 'full'
): Node[] {
    const selectedById = new Map(prev.map((n) => [n.id, !!n.selected]));
    return (pfNodes ?? []).map((n: ProcessFlowNode) => ({
        id: n.id,
        type: 'processFlow' as const,
        position: n.position,
        data: { ...n, __viewportLite: viewportMode === 'lite' },
        zIndex: 100,
        selected: selectedById.get(n.id) ?? false,
        style: {
            width: n.style?.width ?? DEFAULT_NODE_STYLE.width,
            height: n.style?.height ?? DEFAULT_NODE_STYLE.height,
            fontStyle: n.textStyle?.italic ? 'italic' : 'normal',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'visible',
            textAlign: 'center',
            whiteSpace: 'pre-wrap',
        },
    }));
}

function processFlowReactNodesUnchanged(prev: Node[], next: Node[]): boolean {
    if (prev.length !== next.length) return false;
    const prevById = new Map(prev.map((n) => [n.id, n]));
    for (const n of next) {
        const p = prevById.get(n.id);
        if (!p) return false;
        if (p.position.x !== n.position.x || p.position.y !== n.position.y) return false;
        if (p.data !== n.data) return false;
        if (!!p.selected !== !!n.selected) return false;
        if (Number(p.style?.width ?? 240) !== Number(n.style?.width ?? 240)) return false;
        if (Number(p.style?.height ?? 120) !== Number(n.style?.height ?? 120)) return false;
        if (String((p.style as React.CSSProperties)?.fontStyle ?? 'normal') !== String((n.style as React.CSSProperties)?.fontStyle ?? 'normal'))
            return false;
    }
    return true;
}

function buildProcessFlowReactEdges(
    pfEdges: ProcessFlowEdge[] | undefined,
    viewportMode: 'lite' | 'full'
): Edge[] {
    return (pfEdges ?? []).map((e: ProcessFlowEdge) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        animated: e.animated ?? true,
        label: '연결방향 설정',
        type: 'processFlow' as const,
        data: { ...e, __viewportLite: viewportMode === 'lite' },
        style: {
            stroke: e.style?.stroke ?? '#2563eb',
            strokeWidth: e.style?.strokeWidth ?? 2,
        },
    }));
}

/** React Flow edge.data와 Yjs 동기화 시 참조만 같고 kindText 등만 바뀐 경우 setEdges 스킵되는 것 방지 */
function pfEdgeDomainFingerprint(data: unknown): string {
    if (data == null || typeof data !== 'object') return String(data ?? '');
    const d = data as ProcessFlowEdge;
    return JSON.stringify({
        source: d.source,
        target: d.target,
        sourceHandle: d.sourceHandle,
        targetHandle: d.targetHandle,
        kindText: d.kindText ?? '',
        style: d.style,
        arrow: d.arrow,
        animated: d.animated,
        viewportLite: (d as any).__viewportLite ?? false,
    });
}

function processFlowReactEdgesUnchanged(prev: Edge[], next: Edge[]): boolean {
    if (prev.length !== next.length) return false;
    const prevById = new Map(prev.map((e) => [e.id, e]));
    for (const n of next) {
        const p = prevById.get(n.id);
        if (!p) return false;
        if (p.source !== n.source || p.target !== n.target) return false;
        if (p.sourceHandle !== n.sourceHandle) return false;
        if (p.targetHandle !== n.targetHandle) return false;
        if (pfEdgeDomainFingerprint(p.data) !== pfEdgeDomainFingerprint(n.data)) return false;
        if (!!p.animated !== !!n.animated) return false;
        if (String((p.style as React.CSSProperties)?.stroke) !== String((n.style as React.CSSProperties)?.stroke)) return false;
        if (Number((p.style as React.CSSProperties)?.strokeWidth ?? 2) !== Number((n.style as React.CSSProperties)?.strokeWidth ?? 2)) return false;
    }
    return true;
}

/** 섹션 영역 드래그는 로컬 state만 갱신해 부모(전체 캔버스) 리렌더를 줄입니다. */
const ProcessFlowSectionDrawOverlay: React.FC<{
    active: boolean;
    screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number };
    getViewport: () => { x: number; y: number; zoom: number };
    onCommitted: (drag: ProcessFlowSectionDragState) => void;
}> = ({ active, screenToFlowPosition, getViewport, onCommitted }) => {
    const [drag, setDrag] = useState<ProcessFlowSectionDragState | null>(null);

    useEffect(() => {
        if (!active) setDrag(null);
    }, [active]);

    if (!active) return null;

    return (
        <div
            className="absolute inset-0 z-[100] cursor-crosshair"
            onMouseDown={(e) => {
                if (e.button !== 0) return;
                const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
                setDrag({ start: pos, current: pos });
            }}
            onMouseMove={(e) => {
                setDrag((prev) => {
                    if (!prev) return null;
                    return { ...prev, current: screenToFlowPosition({ x: e.clientX, y: e.clientY }) };
                });
            }}
            onMouseUp={(e) => {
                if (e.button !== 0) return;
                setDrag((d) => {
                    if (!d) return null;
                    const current = screenToFlowPosition({ x: e.clientX, y: e.clientY });
                    onCommitted({ start: d.start, current });
                    return null;
                });
            }}
            onMouseLeave={() => setDrag(null)}
        >
            {drag &&
                (() => {
                    const { x: vx, y: vy, zoom } = getViewport();
                    const left = Math.min(drag.start.x * zoom + vx, drag.current.x * zoom + vx);
                    const top = Math.min(drag.start.y * zoom + vy, drag.current.y * zoom + vy);
                    const width = Math.max(1, Math.abs((drag.current.x - drag.start.x) * zoom));
                    const height = Math.max(1, Math.abs((drag.current.y - drag.start.y) * zoom));
                    return (
                        <div
                            className="absolute border-2 border-amber-500 bg-amber-500/10 pointer-events-none"
                            style={{ left, top, width, height }}
                        />
                    );
                })()}
        </div>
    );
};

/** Shift+드래그 선택 박스 preview만 이 컴포넌트에서 리렌더합니다. */
const ProcessFlowShiftSelectionLayer = forwardRef<
    ProcessFlowShiftSelectionApi,
    {
        portalTarget: Element | null;
        getViewport: () => { x: number; y: number; zoom: number };
        setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    }
>(function ProcessFlowShiftSelectionLayer({ portalTarget, getViewport, setNodes }, ref) {
    const [box, setBox] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);

    const clear = useCallback(() => setBox(null), []);

    useImperativeHandle(
        ref,
        () => ({
            onSelectionStart: (e) => {
                const { x, y } = getViewport();
                setBox({
                    start: { x: e.x - x, y: e.y - y },
                    end: { x: e.x - x, y: e.y - y },
                });
            },
            onSelectionDrag: (e) => {
                setBox((prev) => {
                    if (!prev) return null;
                    const { x, y } = getViewport();
                    return { ...prev, end: { x: e.x - x, y: e.y - y } };
                });
            },
            onSelectionEnd: () => {
                setBox((sb) => {
                    if (!sb) return null;
                    const boxGeom = {
                        x: Math.min(sb.start.x, sb.end.x),
                        y: Math.min(sb.start.y, sb.end.y),
                        width: Math.abs(sb.end.x - sb.start.x),
                        height: Math.abs(sb.end.y - sb.start.y),
                    };
                    queueMicrotask(() => {
                        setNodes((currentNodes) =>
                            currentNodes.map((n) => {
                                const nodeWidth = Number((n.style as React.CSSProperties)?.width ?? 240);
                                const nodeHeight = Number((n.style as React.CSSProperties)?.height ?? 120);
                                const nodeInBox =
                                    n.position.x >= boxGeom.x &&
                                    n.position.x + nodeWidth <= boxGeom.x + boxGeom.width &&
                                    n.position.y >= boxGeom.y &&
                                    n.position.y + nodeHeight <= boxGeom.y + boxGeom.height;
                                return {
                                    ...n,
                                    selected: nodeInBox || n.selected,
                                };
                            })
                        );
                    });
                    return null;
                });
            },
            clear,
        }),
        [clear, getViewport, setNodes]
    );

    if (!portalTarget || !box) return null;

    return createPortal(
        <div
            className="absolute border-2 border-emerald-500 bg-emerald-500/20 pointer-events-none z-[100]"
            style={{
                left: Math.min(box.start.x, box.end.x),
                top: Math.min(box.start.y, box.end.y),
                width: Math.abs(box.end.x - box.start.x),
                height: Math.abs(box.end.y - box.start.y),
            }}
        />,
        portalTarget
    );
});

const ProcessFlowYjsDevSocketButton: React.FC<{ currentProjectId: string | null }> = ({ currentProjectId }) => {
    const yjsJoin = useYjsStore((s) => s.joinProject);
    const yjsIsSynced = useYjsStore((s) => s.isSynced);
    const yjsIsConnected = useYjsStore((s) => s.isConnected);
    const yjsWsUrl = useYjsStore((s) => s.wsUrl);
    const yjsLastStatus = useYjsStore((s) => s.lastStatus);
    const yjsLastError = useYjsStore((s) => s.lastError);
    const yjsLastSyncAt = useYjsStore((s) => s.lastSyncAt);

    return (
        <button
            type="button"
            onClick={() => {
                if (!currentProjectId) return;
                yjsJoin(currentProjectId);
                if (!yjsIsSynced) {
                    const syncText = yjsLastSyncAt ? new Date(yjsLastSyncAt).toLocaleString() : '-';
                    alert(
                        `Yjs 재연결 시도\n\nurl: ${yjsWsUrl}\nstatus: ${yjsLastStatus ?? '-'}\nerror: ${yjsLastError ?? '-'}\nlastSync: ${syncText}`
                    );
                }
            }}
            className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 rounded-lg border border-gray-100 shrink-0 hover:bg-gray-100 transition-colors"
            title={`동기화가 멈춘 것 같으면 클릭해서 재연결을 시도하세요\n\nYjs url: ${yjsWsUrl}\nYjs status: ${yjsLastStatus ?? '-'}\nYjs error: ${yjsLastError ?? '-'}\nYjs lastSync: ${yjsLastSyncAt ? new Date(yjsLastSyncAt).toLocaleString() : '-'}`}
        >
            <span className={`text-[10px] font-black ${yjsIsConnected ? 'text-emerald-700' : 'text-rose-700'}`}>Socket</span>
            <span className={`text-[10px] font-black ${yjsIsSynced ? 'text-emerald-700' : 'text-amber-700'}`}>{yjsIsSynced ? 'SYNC' : '...'}</span>
            <span className="text-[10px] font-black text-gray-300">|</span>
            <span className={`text-[10px] font-black ${yjsIsConnected ? 'text-emerald-700' : 'text-rose-700'}`}>Yjs</span>
            <span className={`text-[10px] font-black ${yjsIsSynced ? 'text-emerald-700' : 'text-amber-700'}`}>{yjsIsSynced ? 'SYNC' : '...'}</span>
        </button>
    );
};

function mergeProcessFlowImport(
    existing: { pfNodes: ProcessFlowNode[]; pfEdges: ProcessFlowEdge[]; pfSections: ProcessFlowSection[] },
    incoming: { nodes: ProcessFlowNode[]; edges: ProcessFlowEdge[]; sections: ProcessFlowSection[] }
): { pfNodes: ProcessFlowNode[]; pfEdges: ProcessFlowEdge[]; pfSections: ProcessFlowSection[] } {
    const ts = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const existingSectionIds = new Set(existing.pfSections.map((s) => s.id));
    const sectionIdMap = new Map<string, string>();

    const incomingSections = incoming.sections ?? [];
    for (const sec of incomingSections) {
        const newId = existingSectionIds.has(sec.id) ? `pf_sec_${ts()}` : sec.id;
        sectionIdMap.set(sec.id, newId);
        existingSectionIds.add(newId);
    }

    const mergedSections: ProcessFlowSection[] = [...existing.pfSections];
    for (const sec of incomingSections) {
        const newId = sectionIdMap.get(sec.id)!;
        let parentId = sec.parentId;
        if (parentId != null && sectionIdMap.has(parentId)) {
            parentId = sectionIdMap.get(parentId)!;
        }
        mergedSections.push({ ...sec, id: newId, parentId: parentId ?? null });
    }

    const existingNodeIds = new Set(existing.pfNodes.map((n) => n.id));
    const nodeIdMap = new Map<string, string>();
    const incomingNodes = incoming.nodes ?? [];
    for (const node of incomingNodes) {
        const newId = existingNodeIds.has(node.id) ? `pf_node_${ts()}` : node.id;
        if (newId !== node.id) nodeIdMap.set(node.id, newId);
        existingNodeIds.add(newId);
    }

    const mergedNodes: ProcessFlowNode[] = [...existing.pfNodes];
    for (const node of incomingNodes) {
        const newId = nodeIdMap.get(node.id) ?? node.id;
        let sectionId = node.sectionId;
        if (sectionId != null && sectionIdMap.has(sectionId)) {
            sectionId = sectionIdMap.get(sectionId)!;
        }
        mergedNodes.push({ ...node, id: newId, sectionId: sectionId ?? undefined });
    }

    const incomingMappedNodeIds = new Set(incomingNodes.map((node) => nodeIdMap.get(node.id) ?? node.id));
    const mergedEdges: ProcessFlowEdge[] = [...existing.pfEdges];
    const existingEdgeIds = new Set(existing.pfEdges.map((e) => e.id));
    for (const edge of incoming.edges ?? []) {
        const src = nodeIdMap.get(edge.source) ?? edge.source;
        const tgt = nodeIdMap.get(edge.target) ?? edge.target;
        // 가져오기 데이터의 엣지는 "가져온 노드 집합 내부"에서만 연결되도록 제한한다.
        // (기존 캔버스에 우연히 같은 ID가 있을 때 잘못 붙는 현상 방지)
        if (!incomingMappedNodeIds.has(src) || !incomingMappedNodeIds.has(tgt)) continue;
        const newEdgeId =
            existingEdgeIds.has(edge.id) || mergedEdges.some((e) => e.id === edge.id)
                ? `pf_edge_${ts()}`
                : edge.id;
        existingEdgeIds.add(newEdgeId);
        mergedEdges.push({ ...edge, id: newEdgeId, source: src, target: tgt });
    }

    return { pfNodes: mergedNodes, pfEdges: mergedEdges, pfSections: mergedSections };
}

const ProcessFlowCanvasInner: React.FC = () => {
    const { logout, user } = useAuthStore();
    const { projects, currentProjectId, setCurrentProject } = useProjectStore();

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(PROCESS_FLOW_SIDEBAR_DEFAULT_WIDTH);
    const sidebarResizingRef = useRef(false);
    const [sidebarListKey, setSidebarListKey] = useState(0);
    const [isSectionDrawMode, setIsSectionDrawMode] = useState(false);
    const [portalTarget, setPortalTarget] = useState<Element | null>(null);
    const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [editingSectionName, setEditingSectionName] = useState('');
    const [sectionMoveState, setSectionMoveState] = useState<{
        sectionId: string;
        startFlow: { x: number; y: number };
        startSectionPositions: Record<string, { x: number; y: number }>;
        startNodePositions: Record<string, { x: number; y: number }>;
    } | null>(null);
    const [sectionResizeState, setSectionResizeState] = useState<{
        sectionId: string;
        handle: string;
        startFlow: { x: number; y: number };
        startPosition: { x: number; y: number };
        startSize: { width: number; height: number };
    } | null>(null);
    const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);
    const [userTypePanelOpen, setUserTypePanelOpen] = useState(false);
    const [shapePanelOpen, setShapePanelOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importJsonText, setImportJsonText] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [clipboardNodes, setClipboardNodes] = useState<any[]>([]);
    const [dragGuides, setDragGuides] = useState<ProcessFlowDragGuides | null>(null);
    /** 멀티 선택 툴바 위치: 팬/줌 시 다시 계산 */
    const [multiSelectToolbarVp, setMultiSelectToolbarVp] = useState(0);
    const showMultiSelectToolbarRef = useRef(false);
    const toolbarVpRafRef = useRef<number | null>(null);

    const yjsJoin = useYjsStore((s) => s.joinProject);
    const yjsLeave = useYjsStore((s) => s.leaveProject);
    const yjsIsSynced = useYjsStore((s) => s.isSynced);
    const pfNodes = useYjsStore((s) => s.pfNodes);
    const pfEdges = useYjsStore((s) => s.pfEdges);
    const pfSections = useYjsStore((s) => s.pfSections);
    const pfAddNode = useYjsStore((s) => s.pfAddNode);
    const pfUpdateNode = useYjsStore((s) => s.pfUpdateNode);
    const pfAddEdge = useYjsStore((s) => s.pfAddEdge);
    const pfUpdateEdge = useYjsStore((s) => s.pfUpdateEdge);
    const pfUpdateSection = useYjsStore((s) => s.pfUpdateSection);
    const pfAddSection = useYjsStore((s) => s.pfAddSection);
    const pfDeleteSection = useYjsStore((s) => s.pfDeleteSection);
    const pfDeleteNode = useYjsStore((s) => s.pfDeleteNode);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { getViewport, setViewport, screenToFlowPosition, flowToScreenPosition, fitView } = useReactFlow();
    const [viewportMode, setViewportMode] = useState<'lite' | 'full'>(() =>
        getViewport().zoom < ZOOM_OUT_TO_LITE ? 'lite' : 'full'
    );
    const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
    const selectedPfNodes = useMemo(() => selectedNodes.filter((n) => n.type === 'processFlow'), [selectedNodes]);
    const showMultiSelectToolbar = selectedPfNodes.length >= 2;
    useEffect(() => {
        showMultiSelectToolbarRef.current = showMultiSelectToolbar;
    }, [showMultiSelectToolbar]);

    /** 화면 고정(px), 너비는 아이콘만큼만(w-max + translateX -50%) */
    const MULTI_SELECT_TOOLBAR_APPROX_H = 36;
    const multiSelectToolbarScreen = useMemo(() => {
        if (!showMultiSelectToolbar) return null;
        void multiSelectToolbarVp;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const n of selectedPfNodes) {
            const r = getNodeRect(n);
            minX = Math.min(minX, r.left);
            minY = Math.min(minY, r.top);
            maxX = Math.max(maxX, r.right);
            maxY = Math.max(maxY, r.bottom);
        }
        const cx = (minX + maxX) / 2;
        const edgeGap = 10;
        const topMid = flowToScreenPosition({ x: cx, y: minY });
        let top = topMid.y - MULTI_SELECT_TOOLBAR_APPROX_H - edgeGap;
        if (top < 8) {
            const botMid = flowToScreenPosition({ x: cx, y: maxY });
            top = botMid.y + edgeGap;
        }
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const approxHalf = 200;
        const centerX = Math.max(approxHalf + 8, Math.min(topMid.x, vw - approxHalf - 8));
        return { centerX, top };
    }, [selectedPfNodes, showMultiSelectToolbar, multiSelectToolbarVp, flowToScreenPosition]);

    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const pfNodesRef = useRef(pfNodes);
    const clipboardRef = useRef(clipboardNodes);
    const deleteConfirmOpenRef = useRef(false);
    const shiftSelectionRef = useRef<ProcessFlowShiftSelectionApi>(null);
    const dragSnapRef = useRef<SnapState>({});
    nodesRef.current = nodes;
    edgesRef.current = edges;
    pfNodesRef.current = pfNodes;
    clipboardRef.current = clipboardNodes;
    deleteConfirmOpenRef.current = deleteConfirmOpen;

    // 마름모 관련 edge가 제거되지 않도록 커스텀 핸들러 (edges/pfNodes는 ref로 읽어 콜백 안정화)
    const handleEdgesChange = useCallback(
        (changes: any) => {
            const removeChanges = changes.filter((c: any) => c.type === 'remove');
            const otherChanges = changes.filter((c: any) => c.type !== 'remove');

            const safeRemoveChanges = removeChanges.filter((c: any) => {
                const edge = edgesRef.current.find((e) => e.id === c.id);
                if (!edge) return true;

                const sourceNode = pfNodesRef.current.find((n) => n.id === edge.source);
                const targetNode = pfNodesRef.current.find((n) => n.id === edge.target);

                const isDiamondEdge =
                    (sourceNode && sourceNode.type === 'RECT' && sourceNode.shape === 'diamond') ||
                    (targetNode && targetNode.type === 'RECT' && targetNode.shape === 'diamond');

                if (isDiamondEdge) return false;
                return true;
            });

            onEdgesChange([...otherChanges, ...safeRemoveChanges]);
        },
        [onEdgesChange]
    );

    // 커스텀 노드 변경 핸들러 - 선택 동작 제어
    const handleNodesChange = useCallback((changes: any[]) => {
        const selectionChanges = changes.filter(change => change.type === 'select');
        
        if (selectionChanges.length > 0) {
            // 선택 변경만 있는 경우 - 기본 동작 유지
            onNodesChange(changes);
        } else {
            // 다른 변경사항이 있는 경우
            onNodesChange(changes);
        }
    }, [onNodesChange]);

    const applyDistributeSpacingX = useCallback(() => {
        const sel = nodesRef.current.filter((n) => n.selected && n.type === 'processFlow');
        distributeProcessFlowNodesEvenGap(sel, 'x').forEach((u) => pfUpdateNode(u.id, { position: u.position }));
    }, [pfUpdateNode]);

    const applyDistributeSpacingY = useCallback(() => {
        const sel = nodesRef.current.filter((n) => n.selected && n.type === 'processFlow');
        distributeProcessFlowNodesEvenGap(sel, 'y').forEach((u) => pfUpdateNode(u.id, { position: u.position }));
    }, [pfUpdateNode]);

    const applyAlignLeft = useCallback(() => {
        const sel = nodesRef.current.filter((n) => n.selected && n.type === 'processFlow');
        alignProcessFlowNodesHorizontal(sel, 'left').forEach((u) => pfUpdateNode(u.id, { position: u.position }));
    }, [pfUpdateNode]);

    const applyAlignCenterH = useCallback(() => {
        const sel = nodesRef.current.filter((n) => n.selected && n.type === 'processFlow');
        alignProcessFlowNodesHorizontal(sel, 'center').forEach((u) => pfUpdateNode(u.id, { position: u.position }));
    }, [pfUpdateNode]);

    const applyAlignRight = useCallback(() => {
        const sel = nodesRef.current.filter((n) => n.selected && n.type === 'processFlow');
        alignProcessFlowNodesHorizontal(sel, 'right').forEach((u) => pfUpdateNode(u.id, { position: u.position }));
    }, [pfUpdateNode]);

    const applyAlignTop = useCallback(() => {
        const sel = nodesRef.current.filter((n) => n.selected && n.type === 'processFlow');
        alignProcessFlowNodesVertical(sel, 'top').forEach((u) => pfUpdateNode(u.id, { position: u.position }));
    }, [pfUpdateNode]);

    const applyAlignCenterV = useCallback(() => {
        const sel = nodesRef.current.filter((n) => n.selected && n.type === 'processFlow');
        alignProcessFlowNodesVertical(sel, 'center').forEach((u) => pfUpdateNode(u.id, { position: u.position }));
    }, [pfUpdateNode]);

    const applyAlignBottom = useCallback(() => {
        const sel = nodesRef.current.filter((n) => n.selected && n.type === 'processFlow');
        alignProcessFlowNodesVertical(sel, 'bottom').forEach((u) => pfUpdateNode(u.id, { position: u.position }));
    }, [pfUpdateNode]);

    const currentProject = projects.find(p => p.id === currentProjectId);

    const processFlowExportScreens = useMemo((): Screen[] => {
        const name = currentProject?.name ? `${currentProject.name} 프로세스 흐름` : '프로세스 흐름';
        return [
            {
                id: 'process-flow-canvas',
                sectionId: null,
                systemName: '',
                screenId: 'PROCESS_FLOW',
                name,
                author: '',
                createdDate: '',
                screenType: '프로세스 흐름',
                page: '1/1',
                screenDescription: '',
                initialSettings: '',
                functionDetails: '',
                relatedTables: '',
                fields: [],
                position: { x: 0, y: 0 },
            },
        ];
    }, [currentProject?.name]);

    const flowWrapper = useRef<HTMLDivElement>(null);
    const layerRef = useRef<HTMLDivElement>(null);
    const sectionHeadersContainerRef = useRef<HTMLDivElement>(null);
    const zoomWheelRafRef = useRef<number | null>(null);
    const pendingZoomWheelRef = useRef<{ deltaY: number; deltaMode: number; clientX: number; clientY: number } | null>(null);
    const bumpMultiSelectToolbarVp = useCallback(() => {
        if (toolbarVpRafRef.current != null) return;
        toolbarVpRafRef.current = window.requestAnimationFrame(() => {
            toolbarVpRafRef.current = null;
            setMultiSelectToolbarVp((c) => c + 1);
        });
    }, []);

    // 🚀 ReactFlow의 진짜 도화지(줌/팬 엔진) DOM을 찾아냅니다.
    useEffect(() => {
        const target = document.querySelector('.react-flow__viewport');
        setPortalTarget(target);
    }, []);
    useEffect(() => {
        return () => {
            if (toolbarVpRafRef.current != null) {
                window.cancelAnimationFrame(toolbarVpRafRef.current);
                toolbarVpRafRef.current = null;
            }
            if (zoomWheelRafRef.current != null) {
                window.cancelAnimationFrame(zoomWheelRafRef.current);
                zoomWheelRafRef.current = null;
            }
        };
    }, []);

    // Ctrl/Cmd + wheel(트랙패드 핀치 포함)를 캔버스에서 직접 처리:
    // - 브라우저 페이지 줌 방지
    // - 줌 업데이트를 rAF 1회로 묶어 버벅임 완화
    useEffect(() => {
        const el = flowWrapper.current;
        if (!el) return;

        const flushZoom = () => {
            zoomWheelRafRef.current = null;
            const wheel = pendingZoomWheelRef.current;
            pendingZoomWheelRef.current = null;
            if (!wheel) return;

            const { x, y, zoom } = getViewport();
            const wheelDelta = -wheel.deltaY * (wheel.deltaMode === 1 ? 0.05 : wheel.deltaMode ? 1 : 0.002) * 10;
            const nextZoom = Math.max(0.05, Math.min(4, zoom * Math.pow(2, wheelDelta)));
            if (nextZoom === zoom) return;

            const rect = el.getBoundingClientRect();
            const px = wheel.clientX - rect.left;
            const py = wheel.clientY - rect.top;
            const flowX = (px - x) / zoom;
            const flowY = (py - y) / zoom;
            setViewport({ x: px - flowX * nextZoom, y: py - flowY * nextZoom, zoom: nextZoom });
        };

        const onWheel = (e: WheelEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            pendingZoomWheelRef.current = {
                deltaY: e.deltaY,
                deltaMode: e.deltaMode,
                clientX: e.clientX,
                clientY: e.clientY,
            };
            if (zoomWheelRafRef.current == null) {
                zoomWheelRafRef.current = window.requestAnimationFrame(flushZoom);
            }
        };

        el.addEventListener('wheel', onWheel, { passive: false, capture: true });
        return () => {
            el.removeEventListener('wheel', onWheel, { capture: true } as AddEventListenerOptions);
            if (zoomWheelRafRef.current != null) {
                window.cancelAnimationFrame(zoomWheelRafRef.current);
                zoomWheelRafRef.current = null;
            }
            pendingZoomWheelRef.current = null;
        };
    }, [getViewport, setViewport]);

    // 🚀 React 상태 업데이트 대신, DOM의 CSS 변수(--zoom)만 조용히 바꿉니다. (리렌더링 0번!)
    useOnViewportChange({
        onChange: (vp) => {
            if (layerRef.current) {
                layerRef.current.style.setProperty('--zoom', vp.zoom.toString());
            }
            setViewportMode((prev) => {
                if (prev === 'full' && vp.zoom < ZOOM_OUT_TO_LITE) return 'lite';
                if (prev === 'lite' && vp.zoom > ZOOM_IN_TO_FULL) return 'full';
                return prev;
            });
            // 멀티 선택 툴바가 실제로 표시 중일 때만, 프레임당 1회로 갱신
            if (showMultiSelectToolbarRef.current) {
                bumpMultiSelectToolbarVp();
            }
        },
    });

    const handleSectionDrawCommitted = useCallback(
        (sectionDrag: ProcessFlowSectionDragState) => {
            const { start, current } = sectionDrag;
            const x = Math.min(start.x, current.x);
            const y = Math.min(start.y, current.y);
            const width = Math.max(20, Math.abs(current.x - start.x));
            const height = Math.max(20, Math.abs(current.y - start.y));
            const baseName = 'Section';
            const existingNames = new Set((pfSections as any[]).map((s) => s.name ?? baseName));
            let name = baseName;
            if (existingNames.has(baseName)) {
                let n = 1;
                while (existingNames.has(`${baseName} ${n}`)) n++;
                name = `${baseName} ${n}`;
            }
            const sectionId = `section_${Date.now()}`;
            const newRect = { x, y, w: width, h: height };
            const rectContainsRect = (outer: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }) =>
                inner.x >= outer.x &&
                inner.y >= outer.y &&
                inner.x + inner.w <= outer.x + outer.w &&
                inner.y + inner.h <= outer.y + outer.h;
            const rectArea = (s: { size?: { width: number; height: number }; w?: number; h?: number; position?: { x: number; y: number }; }) =>
                (s.size ? s.size.width * s.size.height : (s.w ?? 0) * (s.h ?? 0));

            // 🚀 새 섹션이 "완전히 포함되는" 기존 섹션 중 가장 작은(안쪽) 것을 부모로 선택합니다.
            // - 기존 로직(cx/cy 중심점)에서는 parentId가 서로 꼬여 사이클이 생길 수 있어, full containment으로 교정합니다.
            const parentSection = (pfSections as any[])
                .filter((s) => rectContainsRect(
                    { x: s.position.x, y: s.position.y, w: s.size.width, h: s.size.height },
                    newRect
                ))
                .sort((a, b) => rectArea(a) - rectArea(b))[0];

            const newSection = { 
                id: sectionId, 
                name, 
                position: { x, y }, 
                size: { width, height }, 
                color: '#fef3c7', // amber color theme
                parentId: parentSection ? parentSection.id : null
            };
            // console.log('[DEBUG] Creating section:', newSection);
            pfAddSection(newSection);
            setIsSectionDrawMode(false);
            
            // 🚀 드래그 영역(새 섹션)이 "완전히 포함"하는 최상위 기존 섹션들만 새 섹션의 자식으로 설정
            pfSections.forEach((existingSection: any) => {
                if (existingSection.id === sectionId) return;
                if (existingSection.parentId) return; // 이미 계층이 있는 섹션은 건드리지 않음
                const existingRect = {
                    x: existingSection.position.x,
                    y: existingSection.position.y,
                    w: existingSection.size.width,
                    h: existingSection.size.height,
                };
                if (rectContainsRect(newRect, existingRect)) {
                    pfUpdateSection(existingSection.id, { parentId: sectionId });
                }
            });
            
            // 드래그 영역 안에 있는 프로세스 노드는 "가장 안쪽(가장 작은) 섹션"에 포함되도록 sectionId 재계산
            const currentNodes = nodes;
            const sectionsWithNew = [...(pfSections as any[]), newSection];
            currentNodes.forEach((node: Node) => {
                if (node.type !== 'processFlow') return;
                const nw = node.width || 240;
                const nh = node.height || 120;
                const ncx = node.position.x + nw / 2;
                const ncy = node.position.y + nh / 2;
                const containing = sectionsWithNew
                    .filter((s) =>
                        ncx >= s.position.x &&
                        ncx <= s.position.x + s.size.width &&
                        ncy >= s.position.y &&
                        ncy <= s.position.y + s.size.height
                    )
                    .sort((a, b) => (a.size.width * a.size.height) - (b.size.width * b.size.height));
                const deepest = containing[0];
                pfUpdateNode(node.id, { sectionId: deepest?.id ?? null });
            });
        },
        [pfSections, pfAddSection, pfUpdateSection, nodes, pfUpdateNode]
    );

    // 섹션 이동 기능
    const onSectionBodyMouseDown = useCallback(
        (e: React.MouseEvent, sectionId: string) => {
            if (e.button !== 0 || sectionResizeState || editingSectionId) return;
            e.stopPropagation();
            setSelectedSectionId(sectionId);
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const sec = (pfSections as any[]).find((s) => s.id === sectionId);
            if (!sec) return;

            // 🚀 1. 이 섹션의 모든 하위 자식(손자 포함) 섹션 ID를 재귀적으로 찾습니다.
            const getDescendantSectionIds = (parentId: string, visited: Set<string>): string[] => {
                if (visited.has(parentId)) return [];
                visited.add(parentId);
                const children = (pfSections as any[]).filter((s) => s.parentId === parentId).map((s) => s.id);
                let descendants: string[] = [];
                children.forEach((childId) => {
                    descendants.push(childId);
                    descendants = [...descendants, ...getDescendantSectionIds(childId, visited)];
                });
                return descendants;
            };

            // 나와 나의 모든 하위 섹션 ID들
            const targetSectionIds = [sectionId, ...getDescendantSectionIds(sectionId, new Set<string>())];

            // 🚀 2. 이동할 모든 섹션의 시작 위치를 저장합니다.
            const startSectionPositions: Record<string, { x: number; y: number }> = {};
            targetSectionIds.forEach(id => {
                const s = (pfSections as any[]).find(sec => sec.id === id);
                if (s) startSectionPositions[id] = { ...s.position };
            });

            // 🚀 3. 이동할 모든 섹션에 포함된 프로세스 노드들의 시작 위치를 저장합니다.
            const startNodePositions: Record<string, { x: number; y: number }> = {};
            pfNodes.filter((node) => node.sectionId && targetSectionIds.includes(node.sectionId)).forEach((node) => {
                startNodePositions[node.id] = { ...node.position };
            });

            setSectionMoveState({
                sectionId,
                startFlow: pos,
                startSectionPositions,
                startNodePositions,
            });
        },
        [screenToFlowPosition, sectionResizeState, editingSectionId, pfSections, pfNodes]
    );

    // 섹션 리사이즈 기능
    const onSectionResizeMouseDown = useCallback(
        (e: React.MouseEvent, sectionId: string, handle: string) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            setSelectedSectionId(sectionId);
            const sec = (pfSections as any[]).find((s) => s.id === sectionId);
            if (!sec) return;

            setSectionResizeState({
                sectionId,
                handle,
                startFlow: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                startPosition: { ...sec.position },
                startSize: { ...sec.size },
            });
        },
        [pfSections, screenToFlowPosition]
    );

    // 섹션 이름 저장 기능
    const saveSectionName = useCallback(
        (sectionId: string) => {
            const trimmed = editingSectionName.trim();
            if (trimmed) pfUpdateSection(sectionId, { name: trimmed });
            setEditingSectionId(null);
            setEditingSectionName('');
        },
        [editingSectionName, pfUpdateSection]
    );

    // 섹션 이름 편집 시작 기능
    const startEditingSectionName = useCallback((section: any) => {
        setEditingSectionId(section.id);
        setEditingSectionName(section.name || 'Section');
    }, []);

    // 섹션 이동 useEffect (mousemove당 Yjs 갱신을 rAF로 묶어 리렌더 횟수를 줄임)
    useEffect(() => {
        if (!sectionMoveState) return;
        const { sectionId, startFlow, startSectionPositions, startNodePositions } = sectionMoveState;

        let rafId = 0;
        let latestDx = 0;
        let latestDy = 0;

        const flush = () => {
            rafId = 0;
            const dx = latestDx;
            const dy = latestDy;
            Object.entries(startSectionPositions).forEach(([secId, pos]) => {
                pfUpdateSection(secId, { position: { x: pos.x + dx, y: pos.y + dy } });
            });
            Object.entries(startNodePositions).forEach(([nodeId, pos]) => {
                pfUpdateNode(nodeId, { position: { x: pos.x + dx, y: pos.y + dy } });
            });
        };

        const onMove = (e: MouseEvent) => {
            const cur = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            latestDx = cur.x - startFlow.x;
            latestDy = cur.y - startFlow.y;
            if (!rafId) rafId = requestAnimationFrame(flush);
        };

        const onUp = () => {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = 0;
            }
            flush();

            const liveSections = useYjsStore.getState().pfSections as any[];
            const movedSection = liveSections.find((s) => s.id === sectionId);
            if (movedSection) {
                const cx = movedSection.position.x + movedSection.size.width / 2;
                const cy = movedSection.position.y + movedSection.size.height / 2;
                
                // 🚀 자신의 모든 하위 섹션 ID들을 찾아서 제외해야 함
                const getDescendantIds = (parentId: string, visited: Set<string>): string[] => {
                    if (visited.has(parentId)) return [];
                    visited.add(parentId);
                    const children = liveSections.filter((s) => s.parentId === parentId).map((s) => s.id);
                    let descendants: string[] = [];
                    children.forEach((childId) => {
                        descendants.push(childId);
                        descendants = [...descendants, ...getDescendantIds(childId, visited)];
                    });
                    return descendants;
                };
                
                const descendantIds = getDescendantIds(sectionId, new Set<string>());
                const excludeIds = new Set([sectionId, ...descendantIds]);
                
                // 중첩된 섹션 중 가장 작은(안쪽) 섹션을 새로운 부모로 찾기 (자기 자신과 자손 제외)
                const newParent = liveSections
                    .filter((s) => !excludeIds.has(s.id) && // 자기 자신과 자손 제외
                        cx >= s.position.x &&
                        cx <= s.position.x + s.size.width &&
                        cy >= s.position.y &&
                        cy <= s.position.y + s.size.height
                    )
                    .sort((a, b) => a.size.width * a.size.height - b.size.width * b.size.height)[0];
                
                // 부모가 변경되었으면 업데이트
                const newParentId = newParent ? newParent.id : null;
                if (newParentId !== movedSection.parentId) {
                    // console.log('[DEBUG] Moving section', sectionId, 'from parent', movedSection.parentId, 'to new parent', newParentId);
                    pfUpdateSection(sectionId, { parentId: newParentId });
                }
            }
            setSectionMoveState(null);
        };
        
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        
        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [sectionMoveState, pfUpdateSection, pfUpdateNode, screenToFlowPosition]);

    // 섹션 리사이즈 useEffect
    useEffect(() => {
        if (!sectionResizeState) return;
        const sec = (pfSections as any[]).find((s) => s.id === sectionResizeState.sectionId);
        if (!sec) return;
        const MIN_SECTION_SIZE = 50;
        const st = sectionResizeState;
        let rafId = 0;
        let hasMoved = false;
        const lastClient = { x: 0, y: 0 };

        const flush = () => {
            rafId = 0;
            const cur = screenToFlowPosition({ x: lastClient.x, y: lastClient.y });
            const dx = cur.x - st.startFlow.x;
            const dy = cur.y - st.startFlow.y;
            const { handle, startPosition, startSize } = st;
            let x = startPosition.x;
            let y = startPosition.y;
            let w = startSize.width;
            let h = startSize.height;
            if (handle.includes('e')) w = Math.max(MIN_SECTION_SIZE, w + dx);
            if (handle.includes('w')) {
                const dw = Math.min(dx, w - MIN_SECTION_SIZE);
                x = startPosition.x + dw;
                w = startSize.width - dw;
            }
            if (handle.includes('s')) h = Math.max(MIN_SECTION_SIZE, h + dy);
            if (handle.includes('n')) {
                const dh = Math.min(dy, h - MIN_SECTION_SIZE);
                y = startPosition.y + dh;
                h = startSize.height - dh;
            }
            pfUpdateSection(st.sectionId, { position: { x, y }, size: { width: w, height: h } });
        };

        const onMove = (e: MouseEvent) => {
            hasMoved = true;
            lastClient.x = e.clientX;
            lastClient.y = e.clientY;
            if (!rafId) rafId = requestAnimationFrame(flush);
        };
        const onUp = () => {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = 0;
            }
            if (hasMoved) flush();

            const liveSections = useYjsStore.getState().pfSections as any[];
            const liveNodes = useYjsStore.getState().pfNodes;
            const resized = liveSections.find((s) => s.id === st.sectionId);
            if (!resized) {
                setSectionResizeState(null);
                return;
            }
            const x = resized.position.x;
            const y = resized.position.y;
            const width = resized.size.width;
            const height = resized.size.height;

            liveNodes.forEach((node) => {
                if (node.type !== 'RECT' && node.type !== 'USER') return;
                const nw = node.style?.width || 240;
                const nh = node.style?.height || 120;
                const cx = node.position.x + nw / 2;
                const cy = node.position.y + nh / 2;
                // 리사이즈한 섹션 영역 안에 있는 노드만 소속을 다시 계산
                if (cx >= x && cx <= x + width && cy >= y && cy <= y + height) {
                    const containingSection = liveSections
                        .filter(
                            (s) =>
                                cx >= s.position.x &&
                                cx <= s.position.x + s.size.width &&
                                cy >= s.position.y &&
                                cy <= s.position.y + s.size.height
                        )
                        .sort((a, b) => a.size.width * a.size.height - b.size.width * b.size.height)[0];
                    pfUpdateNode(node.id, { sectionId: containingSection?.id });
                } else if (node.sectionId === st.sectionId) {
                    // 섹션 밖으로 나간 노드는 섹션 연결 해제
                    pfUpdateNode(node.id, { sectionId: null });
                }
            });
            setSectionResizeState(null);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [sectionResizeState, pfSections, pfUpdateSection, pfUpdateNode, screenToFlowPosition]);

    // ── Sidebar Resize Logic ────────────────────────────────────
    const startSidebarResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        sidebarResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!sidebarResizingRef.current) return;
            const newWidth = Math.max(
                PROCESS_FLOW_SIDEBAR_MIN_WIDTH,
                Math.min(PROCESS_FLOW_SIDEBAR_MAX_WIDTH, moveEvent.clientX),
            );
            setSidebarWidth(newWidth);
        };

        const onMouseUp = () => {
            sidebarResizingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, []);

    useEffect(() => {
        if (!currentProjectId) return;
        yjsJoin(currentProjectId);
        return () => {
            yjsLeave();
        };
    }, [currentProjectId, yjsJoin, yjsLeave]);

    useEffect(() => {
        setNodes((curr) => {
            const next = buildProcessFlowReactNodes(pfNodes, curr, viewportMode);
            return processFlowReactNodesUnchanged(curr, next) ? curr : next;
        });
    }, [pfNodes, viewportMode, setNodes]);

    useEffect(() => {
        setEdges((curr) => {
            const next = buildProcessFlowReactEdges(pfEdges, viewportMode);
            return processFlowReactEdgesUnchanged(curr, next) ? curr : next;
        });
    }, [pfEdges, viewportMode, setEdges]);

    const isValidConnection = useCallback((connection: Connection) => {
        if (!connection.source || !connection.target) return false;
        if (connection.source === connection.target) return false;
        
        // 마름모 도형은 항상 연결 허용
        const targetNode = pfNodes.find(node => node.id === connection.target);
        const sourceNode = pfNodes.find(node => node.id === connection.source);
        
        const isDiamondTarget = targetNode && targetNode.type === 'RECT' && targetNode.shape === 'diamond';
        const isDiamondSource = sourceNode && sourceNode.type === 'RECT' && sourceNode.shape === 'diamond';

        if (isDiamondTarget || isDiamondSource) {
            return true;
        }

        const hasExistingConnection = pfEdges.some(
            (edge) => edge.source === connection.source && edge.target === connection.target
        );

        return !hasExistingConnection;
    }, [pfNodes, pfEdges]);

    const onConnect = useCallback(
        (connection: Connection) => {
            if (!connection.source || !connection.target) return;
            if (connection.source === connection.target) return;

            const sourceNode = pfNodes.find((node) => node.id === connection.source);
            const targetNode = pfNodes.find((node) => node.id === connection.target);
            const isDiamondConnection =
                (sourceNode && sourceNode.type === 'RECT' && sourceNode.shape === 'diamond') ||
                (targetNode && targetNode.type === 'RECT' && targetNode.shape === 'diamond');

            if (!isDiamondConnection) {
                const existingConnection = pfEdges.some(
                    (edge) => edge.source === connection.source && edge.target === connection.target
                );
                if (existingConnection) {
                    return;
                }
            }

            const id = `pf_edge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            pfAddEdge({
                id,
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle ?? undefined,
                targetHandle: connection.targetHandle ?? undefined,
                animated: true,
                style: { stroke: '#2563eb', strokeWidth: 2 },
                arrow: { start: 'none', end: 'arrow' },
            });
        },
        [pfAddEdge, pfNodes, pfEdges]
    );

    const onReconnect = useCallback(
        (oldEdge: Edge, connection: Connection) => {
            if (!connection.source || !connection.target) return;
            if (connection.source === connection.target) return;

            const sourceNode = pfNodes.find((node) => node.id === connection.source);
            const targetNode = pfNodes.find((node) => node.id === connection.target);
            const isDiamondConnection =
                (sourceNode && sourceNode.type === 'RECT' && sourceNode.shape === 'diamond') ||
                (targetNode && targetNode.type === 'RECT' && targetNode.shape === 'diamond');

            if (isDiamondConnection) {
                const id = `pf_edge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                pfAddEdge({
                    id,
                    source: connection.source,
                    target: connection.target,
                    sourceHandle: connection.sourceHandle ?? undefined,
                    targetHandle: connection.targetHandle ?? undefined,
                    animated: true,
                    style: { stroke: '#2563eb', strokeWidth: 2 },
                    arrow: { start: 'none', end: 'arrow' },
                });
            } else {
                pfUpdateEdge(oldEdge.id, {
                    source: connection.source,
                    target: connection.target,
                    sourceHandle: connection.sourceHandle ?? undefined,
                    targetHandle: connection.targetHandle ?? undefined,
                } as Partial<ProcessFlowEdge>);
            }
        },
        [pfUpdateEdge, pfAddEdge, pfNodes]
    );

    /** 섹션만 해제 — 노드 선택은 React Flow(+ multiSelectionKeyCode)에 맡김 */
    const onFlowNodeClick = useCallback((_evt: React.MouseEvent, _node: Node) => {
        setSelectedSectionId(null);
    }, []);

    const onFlowPaneClick = useCallback(() => {
        setSelectedSectionId(null);
        setNodes((currentNodes) => {
            let hasSelected = false;
            for (const n of currentNodes) {
                if (n.selected) {
                    hasSelected = true;
                    break;
                }
            }
            if (!hasSelected) return currentNodes;
            return currentNodes.map((n) => (n.selected ? { ...n, selected: false } : n));
        });
        shiftSelectionRef.current?.clear();
        setDragGuides(null);
        dragSnapRef.current = {};
    }, [setNodes]);

    const onFlowSelectionStart = useCallback(
        (e: { x: number; y: number }) => {
            if (isShiftPressed) shiftSelectionRef.current?.onSelectionStart(e);
        },
        [isShiftPressed]
    );

    const onFlowSelectionDrag = useCallback((e: { x: number; y: number }) => {
        shiftSelectionRef.current?.onSelectionDrag(e);
    }, []);

    const onFlowSelectionEnd = useCallback(() => {
        shiftSelectionRef.current?.onSelectionEnd();
    }, []);

    const onFlowNodeDrag = useCallback(
        (_evt: React.MouseEvent, draggingNode: Node) => {
            const liveNodes = nodesRef.current;
            const draggedRect = getNodeRect(draggingNode);
            const others = liveNodes.filter((n) => n.id !== draggingNode.id && n.type === 'processFlow');
            if (others.length === 0) {
                setDragGuides(null);
                dragSnapRef.current = {};
                return;
            }

            const axisPeers = pickAxisPeersForSmartGuides(draggedRect, others);
            if (!axisPeers) return;

            const { xPeer, yPeer } = axisPeers;
            const nearRectX = xPeer.rect;
            const nearRectY = yPeer.rect;

            const prevSnap = dragSnapRef.current;
            const smartX = getSmartGuidesAndSnap(
                draggedRect,
                [{ id: xPeer.refId, x: nearRectX.left, y: nearRectX.top, width: nearRectX.width, height: nearRectX.height }],
                { x: prevSnap.x },
                undefined,
                { skipProximityFilter: true, allowedYEdges: [] }
            );
            const smartY = getSmartGuidesAndSnap(
                draggedRect,
                [{ id: yPeer.refId, x: nearRectY.left, y: nearRectY.top, width: nearRectY.width, height: nearRectY.height }],
                { y: prevSnap.y },
                undefined,
                { skipProximityFilter: true, allowedXEdges: [] }
            );
            dragSnapRef.current = { x: smartX.nextSnap.x, y: smartY.nextSnap.y };

            const smart = {
                deltaX: smartX.deltaX,
                deltaY: smartY.deltaY,
                guides: {
                    vertical: [...smartX.guides.vertical],
                    horizontal: [...smartY.guides.horizontal],
                } satisfies AlignmentGuides,
            };

            let extraDx = 0;
            let extraDy = 0;
            let spacingCandidate: { score: number; targetLeft: number; targetCenterY: number; leftRect: ReturnType<typeof getNodeRect>; rightRect: ReturnType<typeof getNodeRect> } | null = null;
            const otherRects = others.map((n) => ({ node: n, rect: getNodeRect(n) }));
            const SPACING_THRESHOLD = 2;
            const LEVEL_THRESHOLD = 12;
            const spacingPeerIds = new Set([xPeer.refId, yPeer.refId]);
            for (let i = 0; i < otherRects.length; i++) {
                for (let j = i + 1; j < otherRects.length; j++) {
                    if (!spacingPeerIds.has(otherRects[i].node.id) && !spacingPeerIds.has(otherRects[j].node.id)) continue;
                    const a = otherRects[i].rect;
                    const b = otherRects[j].rect;
                    const leftRect = a.centerX <= b.centerX ? a : b;
                    const rightRect = a.centerX <= b.centerX ? b : a;
                    if (Math.abs(leftRect.centerY - rightRect.centerY) > LEVEL_THRESHOLD) continue;
                    if (draggedRect.centerX <= leftRect.centerX || draggedRect.centerX >= rightRect.centerX) continue;
                    const targetLeft = (leftRect.right + rightRect.left - draggedRect.width) / 2;
                    const gapDist = Math.abs(draggedRect.left - targetLeft);
                    if (gapDist > SPACING_THRESHOLD) continue;
                    const targetCenterY = (leftRect.centerY + rightRect.centerY) / 2;
                    const levelDist = Math.abs(draggedRect.centerY - targetCenterY);
                    const score = gapDist + levelDist * 0.4;
                    if (!spacingCandidate || score < spacingCandidate.score) {
                        spacingCandidate = { score, targetLeft, targetCenterY, leftRect, rightRect };
                    }
                }
            }

            const nextGuides: ProcessFlowDragGuides = {
                vertical: [...smart.guides.vertical],
                horizontal: [...smart.guides.horizontal],
            };
            if (spacingCandidate) {
                const targetTop = spacingCandidate.targetCenterY - draggedRect.height / 2;
                const dxFromSpacing = spacingCandidate.targetLeft - draggedRect.left;
                const dyFromSpacing = targetTop - draggedRect.top;
                if (Math.abs(dxFromSpacing) <= SPACING_THRESHOLD) {
                    extraDx = dxFromSpacing;
                    nextGuides.vertical = Array.from(new Set([...nextGuides.vertical, draggedRect.width ? spacingCandidate.targetLeft + draggedRect.width / 2 : draggedRect.centerX])).sort(
                        (a, b) => a - b
                    );
                    nextGuides.spacingSegments = [
                        { x1: spacingCandidate.leftRect.right, y1: spacingCandidate.targetCenterY, x2: spacingCandidate.targetLeft, y2: spacingCandidate.targetCenterY },
                        {
                            x1: spacingCandidate.targetLeft + draggedRect.width,
                            y1: spacingCandidate.targetCenterY,
                            x2: spacingCandidate.rightRect.left,
                            y2: spacingCandidate.targetCenterY,
                        },
                    ];
                }
                if (Math.abs(dyFromSpacing) <= LEVEL_THRESHOLD) {
                    extraDy = dyFromSpacing;
                    nextGuides.horizontal = Array.from(new Set([...nextGuides.horizontal, spacingCandidate.targetCenterY])).sort((a, b) => a - b);
                }
            }

            const dx = smart.deltaX + extraDx;
            const dy = smart.deltaY + extraDy;
            const snappedRect: PfRect = {
                left: draggedRect.left + dx,
                right: draggedRect.right + dx,
                centerX: draggedRect.centerX + dx,
                top: draggedRect.top + dy,
                bottom: draggedRect.bottom + dy,
                centerY: draggedRect.centerY + dy,
                width: draggedRect.width,
                height: draggedRect.height,
            };
            const EDGE_MATCH_EPS = 0.5;
            const SIZE_MATCH_EPS = 0.5;
            const nearXEdges = [nearRectX.left, nearRectX.centerX, nearRectX.right];
            const nearYEdgesM = [nearRectY.top, nearRectY.centerY, nearRectY.bottom];
            const snappedXEdges = [snappedRect.left, snappedRect.centerX, snappedRect.right];
            const snappedYEdges = [snappedRect.top, snappedRect.centerY, snappedRect.bottom];
            for (let i = 0; i < nearXEdges.length; i++) {
                for (let j = 0; j < snappedXEdges.length; j++) {
                    if (Math.abs(nearXEdges[i] - snappedXEdges[j]) <= EDGE_MATCH_EPS) {
                        nextGuides.vertical.push(nearXEdges[i]);
                    }
                }
            }
            for (let i = 0; i < nearYEdgesM.length; i++) {
                for (let j = 0; j < snappedYEdges.length; j++) {
                    if (Math.abs(nearYEdgesM[i] - snappedYEdges[j]) <= EDGE_MATCH_EPS) {
                        nextGuides.horizontal.push(nearYEdgesM[i]);
                    }
                }
            }
            const sameHeight = Math.abs((nearRectY.bottom - nearRectY.top) - (snappedRect.bottom - snappedRect.top)) <= SIZE_MATCH_EPS;
            const centerYAligned = Math.abs(nearRectY.centerY - snappedRect.centerY) <= EDGE_MATCH_EPS;
            const yAlignedCount = nearYEdgesM.reduce(
                (acc, target) => acc + (snappedYEdges.some((v) => Math.abs(v - target) <= EDGE_MATCH_EPS) ? 1 : 0),
                0
            );
            if (sameHeight && (centerYAligned || yAlignedCount >= 2)) {
                nextGuides.horizontal.push(nearRectY.top, nearRectY.centerY, nearRectY.bottom);
            }

            const hasHTop = nextGuides.horizontal.some((v) => Math.abs(v - nearRectY.top) <= EDGE_MATCH_EPS);
            const hasHCenter = nextGuides.horizontal.some((v) => Math.abs(v - nearRectY.centerY) <= EDGE_MATCH_EPS);
            const hasHBottom = nextGuides.horizontal.some((v) => Math.abs(v - nearRectY.bottom) <= EDGE_MATCH_EPS);
            if ((hasHTop && hasHCenter) || (hasHCenter && hasHBottom) || (hasHTop && hasHBottom)) {
                nextGuides.horizontal.push(nearRectY.top, nearRectY.centerY, nearRectY.bottom);
            }

            nextGuides.vertical = resolveProcessFlowVerticalGuides(
                nearRectX,
                snappedRect,
                nextGuides.vertical,
                EDGE_MATCH_EPS,
                SIZE_MATCH_EPS
            );

            if (spacingCandidate) {
                const spacingAlignedX = Math.abs(snappedRect.left - spacingCandidate.targetLeft) <= EDGE_MATCH_EPS;
                const spacingAlignedY = Math.abs(snappedRect.centerY - spacingCandidate.targetCenterY) <= EDGE_MATCH_EPS;
                if (!spacingAlignedX || !spacingAlignedY) {
                    nextGuides.spacingSegments = [];
                }
            }
            nextGuides.vertical = Array.from(new Set(nextGuides.vertical)).sort((a, b) => a - b);
            nextGuides.horizontal = Array.from(new Set(nextGuides.horizontal)).sort((a, b) => a - b);

            if (dx !== 0 || dy !== 0) {
                setNodes((currentNodes) =>
                    currentNodes.map((n) => (n.id === draggingNode.id ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n))
                );
            }
            setDragGuides(nextGuides.vertical.length > 0 || nextGuides.horizontal.length > 0 || (nextGuides.spacingSegments?.length ?? 0) > 0 ? nextGuides : null);
        },
        [setNodes]
    );

    const onFlowNodeDragStop = useCallback(
        (_evt: React.MouseEvent, node: Node) => {
            const finalNode = nodesRef.current.find((n) => n.id === node.id) ?? node;
            pfUpdateNode(finalNode.id, { position: finalNode.position });
            setDragGuides(null);
            dragSnapRef.current = {};

            const nw = finalNode.width || 240;
            const nh = finalNode.height || 120;
            const cx = finalNode.position.x + nw / 2;
            const cy = finalNode.position.y + nh / 2;

            const containingSection = (pfSections as any[])
                .filter((s) =>
                    cx >= s.position.x &&
                    cx <= s.position.x + s.size.width &&
                    cy >= s.position.y &&
                    cy <= s.position.y + s.size.height
                )
                .sort((a, b) => a.size.width * a.size.height - b.size.width * b.size.height)[0];

            pfUpdateNode(finalNode.id, { sectionId: containingSection?.id || null });
        },
        [pfSections, pfUpdateNode]
    );

    const createNodeAtCenter = useCallback(
        (
            type: ProcessFlowNode['type'],
            options?: { text?: string; userRole?: 'user' | 'admin'; shape?: ProcessFlowRectShape }
        ) => {
            const el = flowWrapper.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const center = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

            const id = `pf_node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const nodeWidth = type === 'USER' ? 120 : (DEFAULT_NODE_STYLE.width ?? 240);
            const nodeHeight = type === 'USER' ? 120 : (DEFAULT_NODE_STYLE.height ?? 120);

            pfAddNode({
                id,
                type,
                ...(type === 'RECT' && options?.shape ? { shape: options.shape } : {}),
                position: { x: center.x - nodeWidth / 2, y: center.y - nodeHeight / 2 },
                text:
                    options?.text ||
                    (type === 'USER' ? 'User' : options?.shape === 'db' ? '데이터베이스' : 'Process'),
                userRole: options?.userRole,
                textStyle: { ...DEFAULT_TEXT_STYLE },
                style: {
                    ...DEFAULT_NODE_STYLE,
                    width: nodeWidth,
                    height: nodeHeight,
                },
            });
        },
        [pfAddNode, screenToFlowPosition]
    );

    const [didFit, setDidFit] = useState(false);
    useEffect(() => {
        if (didFit) return;
        if ((pfNodes ?? []).length === 0) return;
        fitView({ padding: 0.2, duration: 0 });
        setDidFit(true);
    }, [didFit, fitView, pfNodes]);

    // 진입 시 REST로 받은 processFlowSnapshot을 Y.Doc에 한 번 반영 (Yjs sync 완료 후에만 동작)
    useEffect(() => {
        if (!currentProjectId || !currentProject || !yjsIsSynced) return;

        const hasBeenImported = (currentProject as any).__pfDataImported;
        if (hasBeenImported) return;

        const data = (currentProject as any).processFlowSnapshot || currentProject.data as any;

        const hasData = data && (
            (data.nodes && data.nodes.length > 0) ||
            (data.edges && data.edges.length > 0) ||
            (data.sections && data.sections.length > 0)
        );

        if (hasData) {
            const ok = useYjsStore.getState().importData({
                pfNodes: data.nodes || [],
                pfEdges: data.edges || [],
                pfSections: Array.isArray(data.sections) ? data.sections : [],
            });
            if (ok) {
                setSidebarListKey((prev) => prev + 1);
                (currentProject as any).__pfDataImported = true;
            }
        }
    }, [currentProjectId, currentProject?.id, yjsIsSynced]);

    const handleDeleteSelectedNodes = useCallback(() => {
        nodesRef.current.filter((n) => n.selected).forEach((n) => pfDeleteNode(n.id));
        setDeleteConfirmOpen(false);
    }, [pfDeleteNode]);

    // Shift 키 + 단축키: nodes/clipboard/모달 상태는 ref로 읽어 effect가 불필요하게 재등록되지 않게 함
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                setIsShiftPressed(true);
            }

            const activeElement = document.activeElement;
            const isInputFocused =
                activeElement &&
                (activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.getAttribute('contenteditable') === 'true');

            const selected = nodesRef.current.filter((n) => n.selected);

            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selected.length > 0 && !isInputFocused) {
                e.preventDefault();
                setClipboardNodes(selected.map((node) => ({ ...node.data, position: node.position })));
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardRef.current.length > 0 && !isInputFocused) {
                e.preventDefault();
                const offset = 50;
                const toPaste = clipboardRef.current;
                toPaste.forEach((nodeData) => {
                    const newId = `pf_node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    pfAddNode({
                        ...nodeData,
                        id: newId,
                        position: {
                            x: nodeData.position.x + offset,
                            y: nodeData.position.y + offset,
                        },
                    });
                });
            }

            if (e.key === 'Backspace' && selected.length > 0 && !isInputFocused) {
                e.preventDefault();
                setDeleteConfirmOpen(true);
            }

            if (e.key === 'Enter' && deleteConfirmOpenRef.current) {
                e.preventDefault();
                handleDeleteSelectedNodes();
            }

            if (e.key === 'Escape' && deleteConfirmOpenRef.current) {
                e.preventDefault();
                setDeleteConfirmOpen(false);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                setIsShiftPressed(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [pfAddNode, handleDeleteSelectedNodes]);

    const handleProcessFlowExport = useCallback(
        async (_selectedIds: string[], format: ExportFormat) => {
            const projectName = (currentProject?.name || 'process_flow').replace(/[/\\?%*:|"<>]/g, '_');
            const now = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

            if (format === 'json') {
                const payload = {
                    nodes: pfNodes ?? [],
                    edges: pfEdges ?? [],
                    sections: pfSections ?? [],
                };
                const json = JSON.stringify(payload, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${projectName}_process_flow_${now}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setIsExportModalOpen(false);
                return;
            }

            const target = flowWrapper.current;
            if (!target) {
                alert('보내기 영역을 찾을 수 없습니다.');
                return;
            }
            const canvas = await html2canvas(target, {
                backgroundColor: '#f8fafc',
                scale: 2,
                useCORS: true,
                allowTaint: false,
                logging: false,
            });

            if (format === 'pdf') {
                const imgData = canvas.toDataURL('image/png');
                const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
                const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
                pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
                pdf.save(`${projectName}_process_flow_${now}.pdf`);
                setIsExportModalOpen(false);
                return;
            }

            if (format === 'ppt_beta') {
                alert('프로세스 흐름 PPT_BETA는 준비 중입니다. PNG로 저장합니다.');
            }
            const imageUrl = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = imageUrl;
            a.download = `${projectName}_process_flow_${now}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setIsExportModalOpen(false);
        },
        [currentProject?.name, pfNodes, pfEdges, pfSections]
    );

    return (
        <div className="flex w-full h-screen overflow-hidden bg-gray-50">
            <div className="relative flex h-full min-w-0">
                <div
                    className={`relative h-full border-r border-gray-200 overflow-hidden bg-white shadow-xl z-[10001] ${isSidebarOpen ? 'flex-shrink-0' : 'w-0 border-none'}`}
                    style={{ width: isSidebarOpen ? sidebarWidth : 0, transition: sidebarResizingRef.current ? 'none' : 'width 0.3s ease-in-out' }}
                >
                    <div
                        className="h-full min-w-0"
                        style={{
                            width: sidebarWidth / PROCESS_FLOW_UI_COMPACT_SCALE,
                            height: `${100 / PROCESS_FLOW_UI_COMPACT_SCALE}%`,
                            transform: `scale(${PROCESS_FLOW_UI_COMPACT_SCALE})`,
                            transformOrigin: 'top left',
                        }}
                    >
                        <ProcessFlowSidebar key={`sidebar-${sidebarListKey}`} nodes={pfNodes} sections={pfSections} />
                    </div>

                    {/* Sidebar Resizer Handle */}
                    {isSidebarOpen && (
                        <div
                            onMouseDown={startSidebarResize}
                            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-amber-500/30 transition-colors z-[10002]"
                        />
                    )}
                </div>

                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={`absolute top-1/2 -translate-y-1/2 z-[10003] w-4 h-10 bg-white rounded-r-lg shadow-md border border-l-0 border-gray-200 text-gray-400 hover:text-amber-500 transition-all active:scale-95 flex items-center justify-center ${isSidebarOpen ? '-right-4' : 'left-0'}`}
                    title={isSidebarOpen ? "사이드바 닫기" : "사이드바 열기"}
                >
                    {isSidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
                </button>
            </div>

            <div className="flex-1 min-w-0 h-full relative" ref={flowWrapper}>
                <div
                    className="absolute top-4 left-1/2 z-[10001] transition-all duration-300"
                    style={{
                        transform: `translateX(-50%) scale(${PROCESS_FLOW_UI_COMPACT_SCALE})`,
                        transformOrigin: 'top center',
                    }}
                >
                    <div className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 p-2 flex flex-nowrap items-center gap-2 whitespace-nowrap overflow-x-auto max-w-[calc(100%-2rem)]">
                        <button
                            onClick={() => setCurrentProject(null)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95 shrink-0"
                            title="프로젝트 목록으로 돌아가기"
                        >
                            <Home size={16} className="text-amber-500 shrink-0" />
                        </button>
                        <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                        {import.meta.env.DEV && <ProcessFlowYjsDevSocketButton currentProjectId={currentProjectId} />}

                        <div className="flex flex-col justify-center min-w-0 shrink" title="클릭하여 ID 복사">
                            <span className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-0.5">Project ID</span>
                            <button
                                onClick={async () => {
                                    if (currentProject?.id) {
                                        const success = await copyToClipboard(currentProject.id);
                                        if (success) {
                                            alert('프로젝트 ID가 복사되었습니다: ' + currentProject.id);
                                        } else {
                                            alert('복사에 실패했습니다. 직접 복사해주세요: ' + currentProject.id);
                                        }
                                    }
                                }}
                                className="text-xs font-mono font-bold text-gray-700 hover:text-amber-600 transition-colors text-left truncate max-w-[140px] sm:max-w-[180px]"
                            >
                                {currentProject?.id}
                            </button>
                        </div>

                        <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                        {/* 사용자 버튼 + 선택 패널 */}
                        <div className="relative shrink-0" id="user-type-button-container">
                            <button
                                onClick={() => {
                                    setShapePanelOpen(false);
                                    setUserTypePanelOpen((v) => !v);
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-all text-sm font-bold shadow-md hover:shadow-lg active:scale-95 shrink-0"
                                title="사용자 노드 추가"
                            >
                                <Plus size={16} className="shrink-0" />
                                <span className="whitespace-nowrap hidden sm:inline">사용자</span>
                            </button>
                        </div>
                        
                        {userTypePanelOpen && createPortal(
                            <div 
                                className="fixed bg-white border border-gray-200 rounded-lg shadow-lg p-1 z-[99999] min-w-[120px]"
                                style={(() => {
                                    const btn = document.getElementById('user-type-button-container')?.getBoundingClientRect();
                                    return btn ? {
                                        left: btn.left,
                                        top: btn.bottom + 8,
                                    } : {};
                                })()}
                            >
                                <button
                                    onClick={() => {
                                        createNodeAtCenter('USER', { text: '사용자', userRole: 'user' });
                                        setUserTypePanelOpen(false);
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 rounded-md transition-colors flex items-center gap-2"
                                >
                                    <UserIcon size={14} className="text-amber-600" />
                                    사용자
                                </button>
                                <button
                                    onClick={() => {
                                        createNodeAtCenter('USER', { text: '관리자', userRole: 'admin' });
                                        setUserTypePanelOpen(false);
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 rounded-md transition-colors flex items-center gap-2"
                                >
                                    <UserCog size={14} className="text-amber-600" />
                                    관리자
                                </button>
                            </div>,
                            document.body
                        )}
                        
                        <div className="relative shrink-0" id="shape-button-container">
                            <button
                                onClick={() => {
                                    setUserTypePanelOpen(false);
                                    setShapePanelOpen((v) => !v);
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all text-sm font-bold shadow-md hover:shadow-lg active:scale-95 shrink-0"
                                title="도형 노드 추가"
                            >
                                <Plus size={16} className="shrink-0" />
                                <span className="whitespace-nowrap">도형</span>
                            </button>
                        </div>

                        {shapePanelOpen && createPortal(
                            <div
                                className="fixed z-[99999] min-w-[168px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                                style={(() => {
                                    const btn = document.getElementById('shape-button-container')?.getBoundingClientRect();
                                    return btn
                                        ? {
                                              left: btn.left,
                                              top: btn.bottom + 8,
                                          }
                                        : {};
                                })()}
                            >
                                <button
                                    type="button"
                                    onClick={() => {
                                        createNodeAtCenter('RECT', { shape: 'db' });
                                        setShapePanelOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-yellow-50 hover:text-yellow-800"
                                >
                                    <Database size={14} className="shrink-0 text-yellow-700" />
                                    데이터베이스
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        createNodeAtCenter('RECT', { shape: 'rectangle' });
                                        setShapePanelOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-yellow-50 hover:text-yellow-800"
                                >
                                    <Square size={14} className="shrink-0 text-yellow-700" />
                                    사각형
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        createNodeAtCenter('RECT', { shape: 'diamond' });
                                        setShapePanelOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-yellow-50 hover:text-yellow-800"
                                >
                                    <Diamond size={14} className="shrink-0 text-yellow-700" />
                                    마름모 (true,false)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        createNodeAtCenter('RECT', { shape: 'trapezoid' });
                                        setShapePanelOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-yellow-50 hover:text-yellow-800"
                                >
                                    <svg className="h-[14px] w-[14px] shrink-0 text-yellow-700" viewBox="0 0 14 12" aria-hidden>
                                        <polygon
                                            points="3,1.5 12.5,1.5 11,10.5 1.5,10.5"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.35"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                    사다리꼴 (입/출력)
                                </button>
                            </div>,
                            document.body
                        )}

                        <PremiumTooltip placement="bottom" offsetBottom={10} label={isSectionDrawMode ? '캔버스에서 영역을 드래그해 섹션을 만드세요' : '섹션 추가'}>
                            <button
                                onClick={() => setIsSectionDrawMode((v) => !v)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm font-bold shadow-md shrink-0 ${isSectionDrawMode ? 'bg-amber-600 text-white ring-2 ring-amber-300' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
                            >
                                <Square size={16} className="shrink-0" />
                                <span className="whitespace-nowrap hidden sm:inline">섹션 추가</span>
                            </button>
                        </PremiumTooltip>

                        <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />
                        <PremiumTooltip placement="bottom" offsetBottom={10} label="내보내기">
                            <button
                                type="button"
                                onClick={() => setIsExportModalOpen(true)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95 shrink-0"
                            >
                                <Upload size={16} className="text-green-500 shrink-0" />
                                <span className="whitespace-nowrap hidden sm:inline">내보내기</span>
                            </button>
                        </PremiumTooltip>
                        <PremiumTooltip placement="bottom" offsetBottom={10} label="가져오기 (다른 프로젝트에서보낸 데이터 붙여넣기)">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsImportModalOpen(true);
                                    setImportError(null);
                                    setImportJsonText('');
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95 shrink-0"
                            >
                                <Download size={16} className="text-violet-500 shrink-0" />
                                <span className="whitespace-nowrap hidden sm:inline">가져오기</span>
                            </button>
                        </PremiumTooltip>


                        <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                        <div className="flex items-center gap-2 px-1 shrink-0">
                            <div className="flex items-center gap-2 pl-2 pr-2 sm:pr-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 shrink-0">
                                {user?.picture ? (
                                    <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full border border-white shadow-sm shrink-0" />
                                ) : (
                                    <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                                        <UserIcon size={14} />
                                    </div>
                                )}
                                <span className="text-sm font-bold text-gray-700 whitespace-nowrap">
                                    {user?.name}
                                </span>
                            </div>
                            <button
                                onClick={() => {
                                    if (window.confirm('로그아웃 하시겠습니까?')) {
                                        setCurrentProject(null);
                                        logout();
                                    }
                                }}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all active:scale-95 shrink-0"
                                title="로그아웃"
                            >
                                <LogOut size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                <ReactFlow
                    className="process-flow-canvas-rf"
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleEdgesChange}
                    onConnect={onConnect}
                    onReconnect={onReconnect}
                    isValidConnection={isValidConnection}
                    onNodeClick={onFlowNodeClick}
                    onPaneClick={onFlowPaneClick}
                    onSelectionStart={onFlowSelectionStart as any}
                    onSelectionDrag={onFlowSelectionDrag as any}
                    onSelectionEnd={onFlowSelectionEnd}
                    onNodeDrag={onFlowNodeDrag}
                    onNodeDragStop={onFlowNodeDragStop}
                    connectionMode={ConnectionMode.Strict}
                    connectionRadius={28}
                    fitView
                    panOnScroll
                    zoomOnScroll={false}
                    minZoom={0.05}
                    maxZoom={4}
                    zoomOnDoubleClick={false}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    deleteKeyCode={null}
                    multiSelectionKeyCode="Shift"
                    selectionKeyCode="Shift"
                >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#84878bff" />
                    <MiniMap className="!bg-white !border-2 !border-gray-100 !rounded-xl !shadow-lg" />

                    {multiSelectToolbarScreen &&
                        showMultiSelectToolbar &&
                        typeof document !== 'undefined' &&
                        createPortal(
                            <div
                                className="pointer-events-auto fixed z-[8500] inline-flex flex-row items-center gap-[7px] px-1.5 py-1 rounded-xl border border-gray-200 bg-white/95 shadow-xl backdrop-blur-sm w-max max-w-[calc(100vw-16px)] box-border"
                                style={{
                                    left: multiSelectToolbarScreen.centerX,
                                    top: multiSelectToolbarScreen.top,
                                    transform: 'translateX(-50%)',
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <PremiumTooltip placement="top" offsetBottom={8} label="왼쪽 정렬" wrapperClassName="shrink-0">
                                    <button
                                        type="button"
                                        onClick={applyAlignLeft}
                                        className="shrink-0 flex size-8 items-center justify-center rounded-lg text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                                        aria-label="왼쪽 정렬"
                                    >
                                        <AlignHorizontalJustifyStart size={16} strokeWidth={2} />
                                    </button>
                                </PremiumTooltip>
                                <PremiumTooltip placement="top" offsetBottom={8} label="가로 가운데 정렬" wrapperClassName="shrink-0">
                                    <button
                                        type="button"
                                        onClick={applyAlignCenterH}
                                        className="shrink-0 flex size-8 items-center justify-center rounded-lg text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                                        aria-label="가로 가운데 정렬"
                                    >
                                        <AlignHorizontalJustifyCenter size={16} strokeWidth={2} />
                                    </button>
                                </PremiumTooltip>
                                <PremiumTooltip placement="top" offsetBottom={8} label="오른쪽 정렬" wrapperClassName="shrink-0">
                                    <button
                                        type="button"
                                        onClick={applyAlignRight}
                                        className="shrink-0 flex size-8 items-center justify-center rounded-lg text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                                        aria-label="오른쪽 정렬"
                                    >
                                        <AlignHorizontalJustifyEnd size={16} strokeWidth={2} />
                                    </button>
                                </PremiumTooltip>
                                <PremiumTooltip placement="top" offsetBottom={8} label="위쪽 정렬" wrapperClassName="shrink-0">
                                    <button
                                        type="button"
                                        onClick={applyAlignTop}
                                        className="shrink-0 flex size-8 items-center justify-center rounded-lg text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                                        aria-label="위쪽 정렬"
                                    >
                                        <AlignVerticalJustifyStart size={16} strokeWidth={2} />
                                    </button>
                                </PremiumTooltip>
                                <PremiumTooltip placement="top" offsetBottom={8} label="세로 가운데 정렬" wrapperClassName="shrink-0">
                                    <button
                                        type="button"
                                        onClick={applyAlignCenterV}
                                        className="shrink-0 flex size-8 items-center justify-center rounded-lg text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                                        aria-label="세로 가운데 정렬"
                                    >
                                        <AlignVerticalJustifyCenter size={16} strokeWidth={2} />
                                    </button>
                                </PremiumTooltip>
                                <PremiumTooltip placement="top" offsetBottom={8} label="아래쪽 정렬" wrapperClassName="shrink-0">
                                    <button
                                        type="button"
                                        onClick={applyAlignBottom}
                                        className="shrink-0 flex size-8 items-center justify-center rounded-lg text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                                        aria-label="아래쪽 정렬"
                                    >
                                        <AlignVerticalJustifyEnd size={16} strokeWidth={2} />
                                    </button>
                                </PremiumTooltip>
                                <div className="w-px h-5 shrink-0 self-center bg-gray-200" aria-hidden />
                                <PremiumTooltip placement="top" offsetBottom={8} label="가로 간격 동일하게" wrapperClassName="shrink-0">
                                    <button
                                        type="button"
                                        onClick={applyDistributeSpacingX}
                                        className="shrink-0 flex size-8 items-center justify-center rounded-lg text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                                        aria-label="가로 간격 맞추기"
                                    >
                                        <AlignHorizontalDistributeCenter size={16} strokeWidth={2} />
                                    </button>
                                </PremiumTooltip>
                                <PremiumTooltip placement="top" offsetBottom={8} label="세로 간격 동일하게" wrapperClassName="shrink-0">
                                    <button
                                        type="button"
                                        onClick={applyDistributeSpacingY}
                                        className="shrink-0 flex size-8 items-center justify-center rounded-lg text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                                        aria-label="세로 간격 맞추기"
                                    >
                                        <AlignVerticalDistributeCenter size={16} strokeWidth={2} />
                                    </button>
                                </PremiumTooltip>
                            </div>,
                            document.body
                        )}
                    
                    {/* 섹션 렌더링 레이어 */}
                    {portalTarget && pfSections.length > 0 && createPortal(
                        <div className="pf-process-flow-section-fill absolute inset-0 pointer-events-none z-[1]">
                            {pfSections.map((s: any) => (
                                <div
                                    key={s.id}
                                    className={`absolute border-2 border-amber-400/80 rounded-lg transition-shadow duration-200 pointer-events-none ${hoveredSectionId === s.id ? 'shadow-xl ring-2 ring-amber-400/40' : 'shadow-none'}`}
                                    style={{
                                        left: s.position.x,
                                        top: s.position.y,
                                        width: s.size.width,
                                        height: s.size.height,
                                        backgroundColor: s.color ? `${s.color}20` : '#fef3c720',
                                    }}
                                />
                            ))}
                        </div>,
                        portalTarget
                    )}
                    {portalTarget && pfSections.length > 0 && createPortal(
                        <div
                            ref={layerRef}
                            /* 노드(z≈10)·핸들보다 낮게: 섹션 좌우 레일이 연결점 클릭을 가로채지 않게 함 (엣지 z≈5보다는 위) */
                            className="pf-process-flow-section-chrome absolute inset-0 pointer-events-none z-[7]"
                            style={{ '--zoom': '1' } as React.CSSProperties}
                        >
                            {/* 섹션 헤더 및 리사이즈 핸들: 마우스로 클릭하고 끌 수 있도록 설정합니다 */}
                            <div 
                                ref={sectionHeadersContainerRef}
                                className="absolute top-0 left-0 w-full h-full pointer-events-none z-[1]"
                            >
                                {pfSections.map((s: any) => {
                    const isEditing = editingSectionId === s.id;
                    const w = s.size.width;
                    const h = s.size.height;
                    const handles = [
                        { key: 'nw', cursor: 'nwse-resize', left: 0, top: 0 }, { key: 'n', cursor: 'ns-resize', left: w / 2, top: 0 },
                        { key: 'ne', cursor: 'nesw-resize', left: w, top: 0 }, { key: 'e', cursor: 'ew-resize', left: w, top: h / 2 },
                        { key: 'se', cursor: 'nwse-resize', left: w, top: h }, { key: 's', cursor: 'ns-resize', left: w / 2, top: h },
                        { key: 'sw', cursor: 'nesw-resize', left: 0, top: h }, { key: 'w', cursor: 'ew-resize', left: 0, top: h / 2 },
                    ];
                    return (
                        <div
                            key={s.id}
                            className="absolute pointer-events-none"
                            style={{ left: s.position.x, top: s.position.y, width: s.size.width, height: s.size.height }}
                        >
                            <div
                                data-section-header
                                className="relative z-30 flex items-center h-14 min-h-14 px-2 rounded-t-md border-b cursor-grab active:cursor-grabbing pointer-events-auto select-none"
                                style={{ 
                                    backgroundColor: s.color ? `${s.color}15` : '#fef3c715',
                                    borderColor: s.color ? `${s.color}30` : '#fef3c730'
                                }}
                                onMouseDown={(ev) => {
                                    ev.preventDefault();
                                    onSectionBodyMouseDown(ev, s.id);
                                }}
                                onMouseEnter={() => setHoveredSectionId(s.id)}
                                onMouseLeave={() => setHoveredSectionId(null)}
                            >
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={editingSectionName}
                                        onChange={(e) => setEditingSectionName(e.target.value)}
                                        onBlur={() => saveSectionName(s.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveSectionName(s.id);
                                            if (e.key === 'Escape') { setEditingSectionId(null); setEditingSectionName(''); }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="flex-1 min-w-0 bg-white/90 border border-amber-300 rounded px-1.5 py-0.5 text-xs font-semibold text-gray-800 outline-none focus:ring-1 focus:ring-amber-400"
                                        autoFocus
                                    />
                                ) : (
                                    <span
                                        className="text-xl font-semibold text-gray-700 truncate flex-1 min-w-0"
                                        onDoubleClick={(e) => { e.stopPropagation(); startEditingSectionName(s); }}
                                    >
                                        {s.name || 'Section'}
                                    </span>
                                )}
                                <div className="relative">
                                    <PremiumTooltip placement="bottom" offsetBottom={30} label="색상변경">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                setColorPickerOpen(colorPickerOpen === s.id ? null : s.id);
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded hover:bg-amber-500/20 text-gray-500 hover:text-amber-600 transition-colors"
                                        >
                                            <Palette size={18} />
                                        </button>
                                    </PremiumTooltip>
                                    {colorPickerOpen === s.id && (
                                        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 min-w-[120px]">
                                            <div className="grid grid-cols-4 gap-1">
                                                {['#e5e7eb', '#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#fed7aa', '#e9d5ff', '#f3f4f6'].map((color) => (
                                                    <button
                                                        key={color}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const colorToSet = color;
                                                            pfUpdateSection(s.id, { color: colorToSet });
                                                            setColorPickerOpen(null);
                                                        }}
                                                        className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <PremiumTooltip placement="bottom" offsetBottom={30} label="섹션 삭제">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            pfDeleteSection(s.id);
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/20 text-gray-500 hover:text-red-600 transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </PremiumTooltip>
                            </div>

                            <div
                                data-section-footer
                                className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-center gap-2 h-14 min-h-14 px-2 rounded-b-md border-t cursor-grab active:cursor-grabbing pointer-events-auto select-none"
                                style={{
                                    backgroundColor: s.color ? `${s.color}15` : '#fef3c715',
                                    borderColor: s.color ? `${s.color}30` : '#fef3c730',
                                }}
                                onMouseDown={(ev) => {
                                    ev.preventDefault();
                                    onSectionBodyMouseDown(ev, s.id);
                                }}
                                onMouseEnter={() => setHoveredSectionId(s.id)}
                                onMouseLeave={() => setHoveredSectionId(null)}
                            >
                            </div>

                            <div
                                data-section-left-rail
                                className="absolute inset-y-0 left-0 z-20 flex w-14 min-w-14 shrink-0 flex-col items-center justify-center gap-1 border-r cursor-grab active:cursor-grabbing pointer-events-auto select-none rounded-l-md"
                                style={{
                                    backgroundColor: s.color ? `${s.color}15` : '#fef3c715',
                                    borderColor: s.color ? `${s.color}30` : '#fef3c730',
                                }}
                                onMouseDown={(ev) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    onSectionBodyMouseDown(ev, s.id);
                                }}
                                onMouseEnter={() => setHoveredSectionId(s.id)}
                                onMouseLeave={() => setHoveredSectionId(null)}
                            >
                            </div>
                            <div
                                data-section-right-rail
                                className="absolute inset-y-0 right-0 z-20 flex w-14 min-w-14 shrink-0 flex-col items-center justify-center gap-1 border-l cursor-grab active:cursor-grabbing pointer-events-auto select-none rounded-r-md"
                                style={{
                                    backgroundColor: s.color ? `${s.color}15` : '#fef3c715',
                                    borderColor: s.color ? `${s.color}30` : '#fef3c730',
                                }}
                                onMouseDown={(ev) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    onSectionBodyMouseDown(ev, s.id);
                                }}
                                onMouseEnter={() => setHoveredSectionId(s.id)}
                                onMouseLeave={() => setHoveredSectionId(null)}
                            >
                            </div>

                            {/* 크기 조절 핸들 */}
                            {selectedSectionId === s.id && handles.map((handle) => (
                                <div
                                    key={handle.key}
                                    className="absolute bg-amber-500 border border-white rounded-sm shadow cursor-pointer hover:bg-amber-600 z-[40] pointer-events-auto"
                                    style={{
                                        left: handle.left, top: handle.top,
                                        width: SECTION_HANDLE_SIZE, height: SECTION_HANDLE_SIZE,
                                        transform: `translate(-50%, -50%) scale(calc(1 / var(--zoom)))`,
                                        cursor: handle.cursor,
                                    }}
                                    onMouseDown={(ev) => { setSelectedSectionId(s.id); onSectionResizeMouseDown(ev, s.id, handle.key); }}
                                />
                            ))}
                        </div>
                    );
                })}
                            </div>
                        </div>,
                        portalTarget
                    )}
                    {portalTarget && dragGuides && createPortal(
                        <div className="absolute inset-0 pointer-events-none z-[30]">
                            {(() => {
                                const vp = getViewport();
                                const wrapperRect = flowWrapper.current?.getBoundingClientRect();
                                const visibleFlowWidth = wrapperRect ? wrapperRect.width / vp.zoom : 2000;
                                const visibleFlowHeight = wrapperRect ? wrapperRect.height / vp.zoom : 1200;
                                const visibleLeft = -vp.x / vp.zoom;
                                const visibleTop = -vp.y / vp.zoom;
                                const visibleRight = visibleLeft + visibleFlowWidth;
                                const visibleBottom = visibleTop + visibleFlowHeight;
                                return (
                                    <>
                                        {dragGuides.vertical.map((vx) => (
                                            <div
                                                key={`pf-guide-v-${vx}`}
                                                style={{
                                                    position: 'absolute',
                                                    left: vx,
                                                    top: visibleTop,
                                                    width: 1,
                                                    height: Math.max(1, visibleBottom - visibleTop),
                                                    backgroundColor: '#facc15',
                                                    opacity: 0.95,
                                                    boxShadow: '0 0 0.5px #ca8a04, 0 0 8px rgba(250, 204, 21, 0.35)',
                                                }}
                                            />
                                        ))}
                                        {dragGuides.horizontal.map((vy) => (
                                            <div
                                                key={`pf-guide-h-${vy}`}
                                                style={{
                                                    position: 'absolute',
                                                    left: visibleLeft,
                                                    top: vy,
                                                    width: Math.max(1, visibleRight - visibleLeft),
                                                    height: 1,
                                                    backgroundColor: '#facc15',
                                                    opacity: 0.95,
                                                    boxShadow: '0 0 0.5px #ca8a04, 0 0 8px rgba(250, 204, 21, 0.35)',
                                                }}
                                            />
                                        ))}
                                        {(dragGuides.spacingSegments ?? []).map((seg, idx) => (
                                            <div
                                                key={`pf-guide-spacing-${idx}`}
                                                style={{
                                                    position: 'absolute',
                                                    left: Math.min(seg.x1, seg.x2),
                                                    top: seg.y1 - 1,
                                                    width: Math.max(1, Math.abs(seg.x2 - seg.x1)),
                                                    height: 2,
                                                    backgroundColor: '#facc15',
                                                    opacity: 0.95,
                                                    borderRadius: 9999,
                                                }}
                                            />
                                        ))}
                                    </>
                                );
                            })()}
                        </div>,
                        portalTarget
                    )}
                    
                    <ProcessFlowSectionDrawOverlay
                        active={isSectionDrawMode}
                        screenToFlowPosition={screenToFlowPosition}
                        getViewport={getViewport}
                        onCommitted={handleSectionDrawCommitted}
                    />
                </ReactFlow>

                <ProcessFlowShiftSelectionLayer
                    ref={shiftSelectionRef}
                    portalTarget={portalTarget}
                    getViewport={getViewport}
                    setNodes={setNodes}
                />
                
                {/* 삭제 확인 팝업 */}
                {deleteConfirmOpen && createPortal(
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
                        <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                선택된 노드 삭제
                            </h3>
                            <p className="text-sm text-gray-600 mb-6">
                                {selectedNodes.length > 1 
                                    ? `${selectedNodes.length}개의 선택된 노드를 삭제하시겠습니까?`
                                    : '선택된 노드를 삭제하시겠습니까?'
                                }
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setDeleteConfirmOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleDeleteSelectedNodes}
                                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                                >
                                    삭제
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
                {isExportModalOpen && (
                    <ScreenExportModal
                        screens={processFlowExportScreens}
                        sections={[]}
                        onExport={handleProcessFlowExport}
                        onClose={() => setIsExportModalOpen(false)}
                    />
                )}
                {isImportModalOpen && (
                    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[10050] p-4">
                        <div className="bg-white rounded-[15px] w-full max-w-2xl shadow-2xl overflow-hidden scale-in max-h-[90vh] flex flex-col">
                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                                <h3 className="text-lg font-black text-gray-900">데이터 가져오기</h3>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsImportModalOpen(false);
                                        setImportError(null);
                                    }}
                                    className="p-2 hover:bg-gray-100 rounded-full text-gray-400"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <p className="px-6 py-2 text-sm text-gray-500 shrink-0">
                                다른 프로젝트에서 <strong>데이터(JSON) 보내기</strong>로 저장한 JSON을 붙여넣거나 파일을 선택하세요. 기존 다이어그램에
                                병합됩니다.
                            </p>
                            {importError && (
                                <div className="mx-6 mb-2 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium shrink-0">{importError}</div>
                            )}
                            <div className="px-6 py-2 flex-1 min-h-0 flex flex-col">
                                <textarea
                                    value={importJsonText}
                                    onChange={(e) => {
                                        setImportJsonText(e.target.value);
                                        setImportError(null);
                                    }}
                                    placeholder='{"nodes":[...],"edges":[...],"sections":[...]}'
                                    className="flex-1 min-h-[200px] w-full p-4 border border-gray-200 rounded-xl font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                                <div className="flex items-center gap-3 mt-3 shrink-0">
                                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-700 cursor-pointer transition-colors">
                                        <Download size={16} />
                                        파일 선택
                                        <input
                                            type="file"
                                            accept=".json"
                                            className="sr-only"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                e.target.value = '';
                                                if (!f) return;
                                                const r = new FileReader();
                                                r.onload = () => {
                                                    setImportJsonText(String(r.result ?? ''));
                                                    setImportError(null);
                                                };
                                                r.readAsText(f);
                                            }}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setImportError(null);
                                            try {
                                                const parsed = JSON.parse(importJsonText.trim());
                                                const nodes: ProcessFlowNode[] = Array.isArray(parsed?.pfNodes)
                                                    ? parsed.pfNodes
                                                    : Array.isArray(parsed?.nodes)
                                                      ? parsed.nodes
                                                      : [];
                                                const edges: ProcessFlowEdge[] = Array.isArray(parsed?.pfEdges)
                                                    ? parsed.pfEdges
                                                    : Array.isArray(parsed?.edges)
                                                      ? parsed.edges
                                                      : [];
                                                const sections: ProcessFlowSection[] = Array.isArray(parsed?.pfSections)
                                                    ? parsed.pfSections
                                                    : Array.isArray(parsed?.sections)
                                                      ? parsed.sections
                                                      : [];
                                                if (nodes.length === 0 && edges.length === 0 && sections.length === 0) {
                                                    setImportError('노드, 연결, 섹션 데이터가 없습니다.');
                                                    return;
                                                }
                                                const { pfNodes, pfEdges, pfSections } = useYjsStore.getState();
                                                const merged = mergeProcessFlowImport(
                                                    { pfNodes, pfEdges, pfSections },
                                                    { nodes, edges, sections }
                                                );
                                                const ok = useYjsStore.getState().importData(merged);
                                                if (!ok) {
                                                    setImportError('동기화 연결 후 다시 시도해주세요.');
                                                    return;
                                                }
                                                setSidebarListKey((k) => k + 1);
                                                setIsImportModalOpen(false);
                                                setImportJsonText('');
                                                alert(
                                                    `가져오기 완료. 노드 ${nodes.length}개, 연결 ${edges.length}개, 섹션 ${sections.length}개가 병합되었습니다.`
                                                );
                                            } catch (err: unknown) {
                                                const msg = err instanceof Error ? err.message : 'JSON 형식이 올바르지 않습니다.';
                                                setImportError(msg);
                                            }
                                        }}
                                        disabled={!importJsonText.trim()}
                                        className="px-5 py-2 bg-violet-600 text-white rounded-lg font-bold text-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        가져오기
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const ProcessFlowCanvas: React.FC = () => {
    return (
        <ReactFlowProvider>
            <ProcessFlowCanvasInner />
        </ReactFlowProvider>
    );
};

export default ProcessFlowCanvas;
