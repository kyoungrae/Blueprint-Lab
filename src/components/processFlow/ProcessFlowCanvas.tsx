import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { ChevronLeft, ChevronRight, Plus, Home, LogOut, User as UserIcon, Square, Palette, X, UserCog } from 'lucide-react';
import { createPortal } from 'react-dom';

import type { ProcessFlowNode, ProcessFlowEdge } from '../../types/processFlow';
import ProcessFlowSidebar from './ProcessFlowSidebar';
import { ProcessFlowNode as ProcessFlowNodeComponent } from './nodes/ProcessFlowNode';
import { ProcessFlowEdge as ProcessFlowEdgeComponent } from './edges/ProcessFlowEdge';
import type { Connection, Node, Edge } from 'reactflow';
import { copyToClipboard } from '../../utils/clipboard';
import PremiumTooltip from '../screenNode/PremiumTooltip';

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

const ProcessFlowCanvasInner: React.FC = () => {
    const { logout, user } = useAuthStore();
    const { projects, currentProjectId, setCurrentProject } = useProjectStore();

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(PROCESS_FLOW_SIDEBAR_DEFAULT_WIDTH);
    const sidebarResizingRef = useRef(false);
    const [sidebarListKey, setSidebarListKey] = useState(0);
    const [isSectionDrawMode, setIsSectionDrawMode] = useState(false);
    const [sectionDrag, setSectionDrag] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
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
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);

    const {
        joinProject: yjsJoin,
        leaveProject: yjsLeave,
        isSynced: yjsIsSynced,
        isConnected: yjsIsConnected,
        wsUrl: yjsWsUrl,
        lastStatus: yjsLastStatus,
        lastError: yjsLastError,
        lastSyncAt: yjsLastSyncAt,
        pfNodes,
        pfEdges,
        pfSections,
        pfAddNode,
        pfUpdateNode,
        pfAddEdge,
        pfUpdateEdge,
        pfUpdateSection,
        pfAddSection,
        pfDeleteSection,
        pfDeleteNode,
    } = useYjsStore();

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { getViewport, screenToFlowPosition, fitView } = useReactFlow();
    const selectedNodes = nodes.filter(n => n.selected);

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

    const currentProject = projects.find(p => p.id === currentProjectId);
    const flowWrapper = useRef<HTMLDivElement>(null);
    const layerRef = useRef<HTMLDivElement>(null);
    const sectionHeadersContainerRef = useRef<HTMLDivElement>(null);

    // 🚀 ReactFlow의 진짜 도화지(줌/팬 엔진) DOM을 찾아냅니다.
    useEffect(() => {
        const target = document.querySelector('.react-flow__viewport');
        setPortalTarget(target);
    }, []);

    // 🚀 React 상태 업데이트 대신, DOM의 CSS 변수(--zoom)만 조용히 바꿉니다. (리렌더링 0번!)
    useOnViewportChange({
        onChange: (vp) => {
            if (layerRef.current) {
                layerRef.current.style.setProperty('--zoom', vp.zoom.toString());
            }
        },
    });

    // 섹션 그리기: 마우스로 영역 지정
    const onSectionOverlayMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (!isSectionDrawMode || e.button !== 0) return;
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            setSectionDrag({ start: pos, current: pos });
        },
        [isSectionDrawMode, screenToFlowPosition]
    );
    const onSectionOverlayMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!sectionDrag) return;
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            setSectionDrag((d) => (d ? { ...d, current: pos } : null));
        },
        [sectionDrag, screenToFlowPosition]
    );
    const onSectionOverlayMouseUp = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0 || !sectionDrag) return;
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
            console.log('[DEBUG] Creating section:', newSection);
            pfAddSection(newSection);
            console.log('[DEBUG] pfAddSection called, yjs isSynced:', yjsIsSynced);
            setSectionDrag(null);
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
        [sectionDrag, pfSections, pfAddSection, nodes, pfUpdateNode]
    );
    const onSectionOverlayMouseLeave = useCallback(() => {
        setSectionDrag(null);
    }, []);

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

    // 섹션 이동 useEffect
    useEffect(() => {
        if (!sectionMoveState) return;
        const { sectionId, startFlow, startSectionPositions, startNodePositions } = sectionMoveState;
        
        const onMove = (e: MouseEvent) => {
            const cur = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const dx = cur.x - startFlow.x;
            const dy = cur.y - startFlow.y;
            
            // 🚀 1. 모든 타겟 섹션들을 같은 이동 거리(dx, dy)만큼 함께 이동
            Object.entries(startSectionPositions).forEach(([secId, pos]) => {
                pfUpdateSection(secId, { position: { x: pos.x + dx, y: pos.y + dy } });
            });
            
            // 🚀 2. 하위 섹션들에 속한 모든 프로세스 노드들도 함께 이동
            Object.entries(startNodePositions).forEach(([nodeId, pos]) => {
                pfUpdateNode(nodeId, { position: { x: pos.x + dx, y: pos.y + dy } });
            });
        };
        
        const onUp = () => {
            // 🚀 3. 이동한 섹션의 새로운 위치에서 parentId 재계산
            const movedSection = (pfSections as any[]).find((s) => s.id === sectionId);
            if (movedSection) {
                const cx = movedSection.position.x + movedSection.size.width / 2;
                const cy = movedSection.position.y + movedSection.size.height / 2;
                
                // 🚀 자신의 모든 하위 섹션 ID들을 찾아서 제외해야 함
                const getDescendantIds = (parentId: string, visited: Set<string>): string[] => {
                    if (visited.has(parentId)) return [];
                    visited.add(parentId);
                    const children = (pfSections as any[]).filter((s) => s.parentId === parentId).map((s) => s.id);
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
                const newParent = (pfSections as any[])
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
                    console.log('[DEBUG] Moving section', sectionId, 'from parent', movedSection.parentId, 'to new parent', newParentId);
                    pfUpdateSection(sectionId, { parentId: newParentId });
                }
            }
            setSectionMoveState(null);
        };
        
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [sectionMoveState, pfUpdateSection, pfUpdateNode, pfSections, screenToFlowPosition]);

    // 섹션 리사이즈 useEffect
    useEffect(() => {
        if (!sectionResizeState) return;
        const sec = (pfSections as any[]).find((s) => s.id === sectionResizeState.sectionId);
        if (!sec) return;
        const MIN_SECTION_SIZE = 50;
        const onMove = (e: MouseEvent) => {
            const cur = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const dx = cur.x - sectionResizeState.startFlow.x;
            const dy = cur.y - sectionResizeState.startFlow.y;
            const { handle, startPosition, startSize } = sectionResizeState;
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
            pfUpdateSection(sectionResizeState.sectionId, { position: { x, y }, size: { width: w, height: h } });
        };
        const onUp = () => {
            const x = sec.position.x;
            const y = sec.position.y;
            const width = sec.size.width;
            const height = sec.size.height;

            pfNodes.forEach((node) => {
                if (node.type !== 'RECT' && node.type !== 'USER') return;
                const nw = node.style?.width || 240;
                const nh = node.style?.height || 120;
                const cx = node.position.x + nw / 2;
                const cy = node.position.y + nh / 2;
                // 리사이즈한 섹션 영역 안에 있는 노드만 소속을 다시 계산
                if (cx >= x && cx <= x + width && cy >= y && cy <= y + height) {
                    const containingSection = (pfSections as any[])
                        .filter(
                            (s) =>
                                cx >= s.position.x &&
                                cx <= s.position.x + s.size.width &&
                                cy >= s.position.y &&
                                cy <= s.position.y + s.size.height
                        )
                        .sort((a, b) => a.size.width * a.size.height - b.size.width * b.size.height)[0];
                    pfUpdateNode(node.id, { sectionId: containingSection?.id });
                } else if (node.sectionId === sectionResizeState.sectionId) {
                    // 섹션 밖으로 나간 노드는 섹션 연결 해제
                    pfUpdateNode(node.id, { sectionId: null });
                }
            });
            setSectionResizeState(null);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [sectionResizeState, pfSections, pfNodes, pfUpdateSection, pfUpdateNode]);

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
        const nextNodes: Node[] = (pfNodes ?? []).map((n: ProcessFlowNode) => ({
            id: n.id,
            type: 'processFlow',
            position: n.position,
            data: n,
            zIndex: 100, // 객체는 항상 섹션보다 위에 표시
            style: {
                width: n.style?.width ?? DEFAULT_NODE_STYLE.width,
                height: n.style?.height ?? DEFAULT_NODE_STYLE.height,
                fontStyle: n.textStyle?.italic ? 'italic' : 'normal',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                textAlign: 'center',
                whiteSpace: 'pre-wrap',
            },
        }));
        setNodes(nextNodes);
    }, [pfNodes, setNodes]);

    useEffect(() => {
        const nextEdges: Edge[] = (pfEdges ?? []).map((e: ProcessFlowEdge) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            animated: e.animated ?? true,
            label: '연결방향 설정',
            type: 'processFlow',
            data: e,
            style: {
                stroke: e.style?.stroke ?? '#2563eb',
                strokeWidth: e.style?.strokeWidth ?? 2,
            },
        }));
        setEdges(nextEdges);
    }, [pfEdges, setEdges]);

    const isValidConnection = useCallback((connection: Connection) => {
        if (!connection.source || !connection.target) return false;
        return connection.source !== connection.target;
    }, []);

    const onConnect = useCallback(
        (connection: Connection) => {
            if (!connection.source || !connection.target) return;
            if (connection.source === connection.target) return;
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
        [pfAddEdge]
    );

    const onReconnect = useCallback(
        (oldEdge: Edge, connection: Connection) => {
            if (!connection.source || !connection.target) return;
            if (connection.source === connection.target) return;
            pfUpdateEdge(oldEdge.id, {
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle ?? undefined,
                targetHandle: connection.targetHandle ?? undefined,
            } as Partial<ProcessFlowEdge>);
        },
        [pfUpdateEdge]
    );

    const createNodeAtCenter = useCallback(
        (type: ProcessFlowNode['type'], options?: { text?: string; userRole?: 'user' | 'admin' }) => {
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
                position: { x: center.x - nodeWidth / 2, y: center.y - nodeHeight / 2 },
                text: options?.text || (type === 'USER' ? 'User' : 'Process'),
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

    // Shift 키 상태 추적
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                setIsShiftPressed(true);
            }
            
            // 텍스트 입력 중이거나 인풋 요소가 포커스된 경우 삭제 로직 무시
            const activeElement = document.activeElement;
            const isInputFocused = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.getAttribute('contenteditable') === 'true'
            );
            
            if (e.key === 'Backspace' && selectedNodes.length > 0 && !isInputFocused) {
                e.preventDefault();
                setDeleteConfirmOpen(true);
            }
            
            // 삭제 확인 팝업에서 Enter 키로 삭제
            if (e.key === 'Enter' && deleteConfirmOpen) {
                e.preventDefault();
                handleDeleteSelectedNodes();
            }
            
            // 삭제 확인 팝업에서 Escape 키로 취소
            if (e.key === 'Escape' && deleteConfirmOpen) {
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
    }, [selectedNodes, deleteConfirmOpen]);

    const handleDeleteSelectedNodes = () => {
        selectedNodes.forEach((node: any) => {
            pfDeleteNode(node.id);
        });
        setDeleteConfirmOpen(false);
    };

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

                        {import.meta.env.DEV && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (!currentProjectId) return;
                                    yjsJoin(currentProjectId);
                                    if (!yjsIsSynced) {
                                        const syncText = yjsLastSyncAt ? new Date(yjsLastSyncAt).toLocaleString() : '-';
                                        alert(`Yjs 재연결 시도\n\nurl: ${yjsWsUrl}\nstatus: ${yjsLastStatus ?? '-'}\nerror: ${yjsLastError ?? '-'}\nlastSync: ${syncText}`);
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
                        )}

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
                                onClick={() => setUserTypePanelOpen((v) => !v)}
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
                        
                        <button
                            onClick={() => createNodeAtCenter('RECT')}
                            className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all text-sm font-bold shadow-md hover:shadow-lg active:scale-95 shrink-0"
                            title="사각형 노드 추가"
                        >
                            <Plus size={16} className="shrink-0" />
                            <span className="whitespace-nowrap">사각형</span>
                        </button>

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
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onReconnect={onReconnect}
                    isValidConnection={isValidConnection}
                    onNodeClick={(_, node) => {
                        // Shift+클릭: 다중 선택 토글
                        if (isShiftPressed) {
                            setNodes((currentNodes) =>
                                currentNodes.map((n) => ({
                                    ...n,
                                    selected: n.id === node.id ? !n.selected : n.selected,
                                }))
                            );
                        } else {
                            // 일반 클릭: 단일 선택
                            setNodes((currentNodes) =>
                                currentNodes.map((n) => ({
                                    ...n,
                                    selected: n.id === node.id,
                                }))
                            );
                        }
                    }}
                    onPaneClick={() => {
                        // 배경 클릭 시 선택 해제
                        setNodes((currentNodes) =>
                            currentNodes.map((n) => ({
                                ...n,
                                selected: false,
                            }))
                        );
                        setSelectionBox(null);
                    }}
                    onSelectionStart={(e: any) => {
                        if (isShiftPressed) {
                            const { x, y } = getViewport();
                            setSelectionBox({
                                start: { x: e.x - x, y: e.y - y },
                                end: { x: e.x - x, y: e.y - y },
                            });
                        }
                    }}
                    onSelectionDrag={(e: any) => {
                        if (isShiftPressed && selectionBox) {
                            const { x, y } = getViewport();
                            setSelectionBox({
                                ...selectionBox,
                                end: { x: e.x - x, y: e.y - y },
                            });
                        }
                    }}
                    onSelectionEnd={() => {
                        if (isShiftPressed && selectionBox) {
                            // 선택 박스 안의 노드들을 찾아서 선택
                            const box = {
                                x: Math.min(selectionBox.start.x, selectionBox.end.x),
                                y: Math.min(selectionBox.start.y, selectionBox.end.y),
                                width: Math.abs(selectionBox.end.x - selectionBox.start.x),
                                height: Math.abs(selectionBox.end.y - selectionBox.start.y),
                            };
                            
                            setNodes((currentNodes) =>
                                currentNodes.map((n: any) => {
                                    const nodeWidth = Number(n.style?.width || 240);
                                    const nodeHeight = Number(n.style?.height || 120);
                                    const nodeInBox = (
                                        n.position.x >= box.x &&
                                        n.position.x + nodeWidth <= box.x + box.width &&
                                        n.position.y >= box.y &&
                                        n.position.y + nodeHeight <= box.y + box.height
                                    );
                                    return {
                                        ...n,
                                        selected: nodeInBox || n.selected,
                                    };
                                })
                            );
                            setSelectionBox(null);
                        }
                    }}
                    onNodeDragStop={(_evt, node) => {
                        // 🚀 1. 노드 위치 업데이트
                        pfUpdateNode(node.id, { position: node.position });
                        
                        // 🚀 2. 드롭한 위치의 섹션 재계산 (ScreenDesign과 동일)
                        const nw = node.width || 240;
                        const nh = node.height || 120;
                        const cx = node.position.x + nw / 2;
                        const cy = node.position.y + nh / 2;
                        
                        // 중첩된 섹션 중 가장 작은(안쪽) 섹션을 찾아 할당
                        const containingSection = (pfSections as any[])
                            .filter((s) =>
                                cx >= s.position.x &&
                                cx <= s.position.x + s.size.width &&
                                cy >= s.position.y &&
                                cy <= s.position.y + s.size.height
                            )
                            .sort((a, b) => a.size.width * a.size.height - b.size.width * b.size.height)[0];
                        
                        pfUpdateNode(node.id, { sectionId: containingSection?.id || null });
                    }}
                    connectionMode={ConnectionMode.Strict}
                    connectionRadius={28}
                    fitView
                    panOnScroll
                    zoomOnDoubleClick={false}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    deleteKeyCode={null}
                >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#84878bff" />
                    <MiniMap className="!bg-white !border-2 !border-gray-100 !rounded-xl !shadow-lg" />
                    
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
                            className="pf-process-flow-section-chrome absolute inset-0 pointer-events-none z-[12]"
                            style={{ '--zoom': '1' } as React.CSSProperties}
                        >
                            {/* 섹션 헤더 및 리사이즈 핸들: 마우스로 클릭하고 끌 수 있도록 설정합니다 */}
                            <div 
                                ref={sectionHeadersContainerRef}
                                className="absolute top-0 left-0 w-full h-full pointer-events-none z-[15]"
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
                    
                    {/* 섹션 그리기 오버레이 */}
                    {isSectionDrawMode && (
                        <div
                            className="absolute inset-0 z-[100] cursor-crosshair"
                            onMouseDown={onSectionOverlayMouseDown}
                            onMouseMove={onSectionOverlayMouseMove}
                            onMouseUp={onSectionOverlayMouseUp}
                            onMouseLeave={onSectionOverlayMouseLeave}
                        >
                            {sectionDrag && (() => {
                                const { x: vx, y: vy, zoom } = getViewport();
                                
                                // 오버레이는 ReactFlow 내부에 absolute inset-0으로 위치하므로
                                // getViewport() 기준 좌표를 그대로 사용 (추가 변환 불필요)
                                const left = Math.min(
                                    sectionDrag.start.x * zoom + vx,
                                    sectionDrag.current.x * zoom + vx
                                );
                                const top = Math.min(
                                    sectionDrag.start.y * zoom + vy,
                                    sectionDrag.current.y * zoom + vy
                                );
                                const width = Math.max(1, Math.abs(
                                    (sectionDrag.current.x - sectionDrag.start.x) * zoom
                                ));
                                const height = Math.max(1, Math.abs(
                                    (sectionDrag.current.y - sectionDrag.start.y) * zoom
                                ));
                                
                                return (
                                    <div
                                        className="absolute border-2 border-amber-500 bg-amber-500/10 pointer-events-none"
                                        style={{ left, top, width, height }}
                                    />
                                );
                            })()}
                        </div>
                    )}
                </ReactFlow>
                
                {/* Shift+drag 선택 박스 */}
                {selectionBox && createPortal(
                    <div
                        className="absolute border-2 border-emerald-500 bg-emerald-500/20 pointer-events-none z-[100]"
                        style={{
                            left: Math.min(selectionBox.start.x, selectionBox.end.x),
                            top: Math.min(selectionBox.start.y, selectionBox.end.y),
                            width: Math.abs(selectionBox.end.x - selectionBox.start.x),
                            height: Math.abs(selectionBox.end.y - selectionBox.start.y),
                        }}
                    />,
                    portalTarget || document.body
                )}
                
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
