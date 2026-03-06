import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import ReactFlow, {
    type Node as RFNode,
    type Edge as RFEdge,
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    MiniMap,
    type NodeTypes,
    ConnectionMode,
    BackgroundVariant,
    ReactFlowProvider,
    PanOnScrollMode,
    useReactFlow,
    useViewport,
    reconnectEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';

import ScreenNode from './ScreenNode';
import SpecNode from './SpecNode';
import ScreenEdge from './ScreenEdge';
import ComponentSidebar from './ComponentSidebar';
import AddScreenModal from './AddScreenModal';
import { useComponentStore } from '../store/componentStore';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { ScreenCanvasStoreProvider } from '../contexts/ScreenCanvasStoreContext';
import { CanvasOnlyModeContext } from '../contexts/CanvasOnlyModeContext';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';
import type { Screen, PageSizeOption, PageOrientation } from '../types/screenDesign';
import { getCanvasDimensions } from '../types/screenDesign';
import {
    Plus, ChevronLeft, ChevronRight, LogOut, User as UserIcon, Home, X, ArrowLeft, Undo2, Redo2
} from 'lucide-react';
import { ScreenDesignUndoRedoProvider, useScreenDesignUndoRedo } from '../contexts/ScreenDesignUndoRedoContext';
import { RecentTextColorsProvider } from '../contexts/RecentTextColorsContext';
import { RecentStyleColorsProvider } from '../contexts/RecentStyleColorsContext';
import { copyToClipboard } from '../utils/clipboard';
import { OnlineUsers, UserCursors } from './collaboration';
import { useSyncStore } from '../store/syncStore';

const nodeTypes: NodeTypes = {
    screen: ScreenNode,
    spec: SpecNode,
};

const edgeTypes = {
    screenEdge: ScreenEdge,
};

import { ExportModeContext } from '../contexts/ExportModeContext';
import PremiumTooltip from './screenNode/PremiumTooltip';

// ── User Cursors Layer (ERD와 동일한 실시간 포인터) ─────────
const UserCursorsLayer: React.FC = () => {
    const { x, y, zoom } = useViewport();
    return (
        <div
            className="absolute top-0 left-0 w-full h-full pointer-events-none z-50 origin-top-left"
            style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})` }}
        >
            <UserCursors />
        </div>
    );
};

// ── Toolbar Undo/Redo (ERD 스타일) ──────────────────────────
const ToolbarUndoRedo: React.FC = () => {
    const { handlers } = useScreenDesignUndoRedo();
    return (
        <div className="flex bg-gray-50/50 rounded-lg border border-gray-100 p-0.5">
            <button
                onClick={handlers.undo}
                disabled={!handlers.canUndo}
                className={`p-2 rounded-md transition-all ${handlers.canUndo ? 'text-gray-700 hover:bg-white hover:shadow-sm active:scale-95' : 'text-gray-200 cursor-not-allowed'}`}
                title="되돌리기 (Ctrl+Z)"
            >
                <Undo2 size={18} />
            </button>
            <div className="w-[1px] h-4 bg-gray-200 self-center mx-0.5" />
            <button
                onClick={handlers.redo}
                disabled={!handlers.canRedo}
                className={`p-2 rounded-md transition-all ${handlers.canRedo ? 'text-gray-700 hover:bg-white hover:shadow-sm active:scale-95' : 'text-gray-200 cursor-not-allowed'}`}
                title="다시실행 (Ctrl+Y)"
            >
                <Redo2 size={18} />
            </button>
        </div>
    );
};

// ── Canvas Content ──────────────────────────────────────────
const ComponentCanvasContent: React.FC = () => {
    const {
        components, flows,
        addComponent, updateComponent, deleteComponent,
        addFlow, updateFlow, deleteFlow,
        importData,
        canvasClipboard,
        setCanvasClipboard,
        lastInteractedScreenId,
        setLastInteractedScreenId,
    } = useComponentStore();
    const { gridClipboard, setGridClipboard } = useScreenDesignStore();
    const screens = components;
    const updateScreen = updateComponent;
    const deleteScreen = deleteComponent;

    const { user, logout } = useAuthStore();
    const { sendOperation, updateCursor, isSynced } = useSyncStore();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
    const [flowLabelComposing, setFlowLabelComposing] = useState<string | null>(null);
    const [reconnectingEdgeId, setReconnectingEdgeId] = useState<string | null>(null);
    useEffect(() => {
        if (!editingFlowId) setFlowLabelComposing(null);
    }, [editingFlowId]);

    const { projects, currentProjectId, setCurrentProject, updateProjectData } = useProjectStore();
    const currentProject = projects.find(p => p.id === currentProjectId);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isAddScreenModalOpen, setIsAddScreenModalOpen] = useState(false);
    const flowWrapper = useRef<HTMLDivElement>(null);
    const { getNodes, screenToFlowPosition, getViewport, setViewport } = useReactFlow();

    // Broadcast cursor position (ERD와 동일)
    const onPaneMouseMove = useCallback((event: React.MouseEvent) => {
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        updateCursor({ ...position });
    }, [screenToFlowPosition, updateCursor]);

    // 그리기 도구 팝업 위 휠 입력을 캔버스 줌/팬으로 전달
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            // 폰트 드롭다운: 캔버스 팬 방지하고 드롭다운만 스크롤 (팝업 여부와 무관)
            const fontDropdown = (e.target as Element)?.closest?.('[data-font-dropdown]') as HTMLElement | null;
            if (fontDropdown) {
                e.preventDefault();
                e.stopPropagation();
                fontDropdown.scrollTop += e.deltaY;
                fontDropdown.scrollLeft += e.deltaX;
                return;
            }

            // 컴포넌트 추가 패널: 패널 자체 스크롤
            const componentPicker = (e.target as Element)?.closest?.('[data-component-picker-portal]') as HTMLElement | null;
            if (componentPicker) {
                e.preventDefault();
                e.stopPropagation();
                componentPicker.scrollTop += e.deltaY;
                componentPicker.scrollLeft += e.deltaX;
                return;
            }

            const isOverPopup = (e.target as Element)?.closest?.(
                '[data-style-panel], [data-layer-panel], [data-table-panel], [data-image-style-panel], [data-table-picker-portal], [data-table-list-portal], [data-grid-panel], [data-text-style-toolbar], [data-font-style-panel], .floating-panel'
            );
            if (!isOverPopup) return;

            e.preventDefault();
            e.stopPropagation();

            // Ctrl/Cmd + wheel: zoom (포인터 앵커 기준으로 x/y 동시 보정)
            if (e.ctrlKey || e.metaKey) {
                const factor = (e.ctrlKey || e.metaKey) ? 10 : 1;
                const wheelDelta = -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * factor;
                const { x, y, zoom } = getViewport();
                const nextZoom = Math.max(0.05, Math.min(4, zoom * Math.pow(2, wheelDelta)));

                const wrapperRect = flowWrapper.current?.getBoundingClientRect();
                if (!wrapperRect) {
                    setViewport({ x, y, zoom: nextZoom });
                    return;
                }

                // 화면 좌표(포인터)를 flow 좌표로 고정하여, 줌 후에도 같은 포인터 위치를 유지
                const px = e.clientX - wrapperRect.left;
                const py = e.clientY - wrapperRect.top;
                const flowX = (px - x) / zoom;
                const flowY = (py - y) / zoom;
                const nextX = px - flowX * nextZoom;
                const nextY = py - flowY * nextZoom;

                setViewport({ x: nextX, y: nextY, zoom: nextZoom });
                return;
            }

            // 일반 wheel: pan
            const { x, y, zoom } = getViewport();
            const deltaNormalize = e.deltaMode === 1 ? 20 : 1;
            const nextX = x - e.deltaX * deltaNormalize * 0.5;
            const nextY = y - e.deltaY * deltaNormalize * 0.5;
            setViewport({ x: nextX, y: nextY, zoom });
        };
        document.addEventListener('wheel', handleWheel, { passive: false, capture: true });
        return () => document.removeEventListener('wheel', handleWheel, { capture: true });
    }, [getViewport, setViewport]);

    // Initial load from project data (local or server)
    useEffect(() => {
        if (currentProjectId && currentProject) {
            const data = (currentProject.data as any)?.components !== undefined
                ? currentProject.data
                : (currentProject as any).componentData;
            if (data?.components || data?.flows) {
                importData({ components: data.components || [], flows: data.flows || [] });
            }
        }
    }, [currentProjectId, currentProject?.id, importData]);

    // Auto-save to ProjectStore (local and server)
    useEffect(() => {
        if (currentProjectId) {
            const timer = setTimeout(() => {
                updateProjectData(currentProjectId, {
                    components,
                    flows,
                });
            }, 1000);
            return () => {
                clearTimeout(timer);
            };
        }
    }, [components, flows, currentProjectId, updateProjectData]);

    const flushAndLeaveProject = useCallback(async () => {
        if (currentProjectId) {
            const { components: comps, flows: flws } = useComponentStore.getState();
            await updateProjectData(currentProjectId, { components: comps, flows: flws }, true);
        }
        setCurrentProject(null);
    }, [currentProjectId, updateProjectData, setCurrentProject]);

    // Save on unmount: flush pending edits when leaving Component project (prevents loss when switching before debounce)
    useEffect(() => {
        const projectId = currentProjectId;
        return () => {
            if (projectId) {
                const { components: comps, flows: flws } = useComponentStore.getState();
                const { updateProjectData: save } = useProjectStore.getState();
                save(projectId, { components: comps, flows: flws }, true);
            }
        };
    }, [currentProjectId]);

    // Sync screens → ReactFlow nodes (컴포넌트는 용지=캔버스 크기, 화면 설계는 70% 비율)
    const computeNodeStyle = (screen: Screen): React.CSSProperties | undefined => {
        const MIN_CANVAS_WIDTH = 794; // A4 너비 - 이하일 때만 스케일
        const CANVAS_WIDTH_RATIO = 0.7; // 화면 설계: 캔버스가 entity의 70%
        const FIXED_TOP_HEIGHT_COMPONENT = 52; // 컴포넌트: 헤더 1행만
        let { width: canvasW, height: canvasH } = getCanvasDimensions(screen);
        if (canvasW < MIN_CANVAS_WIDTH) {
            const scale = MIN_CANVAS_WIDTH / canvasW;
            canvasW = MIN_CANVAS_WIDTH;
            canvasH = Math.round(canvasH * scale);
        }
        const isComponent = screen.screenId?.startsWith('CMP-');
        const width = isComponent ? canvasW : Math.ceil(canvasW / CANVAS_WIDTH_RATIO);
        const height = canvasH + FIXED_TOP_HEIGHT_COMPONENT; // ComponentCanvas는 항상 컴포넌트
        return { width, height };
    };

    useEffect(() => {
        setNodes((prevNodes) => {
            return screens.map((screen) => {
                const existingNode = prevNodes.find((n) => n.id === screen.id);
                const style = computeNodeStyle(screen);
                const node: RFNode = {
                    id: screen.id,
                    type: screen.variant === 'SPEC' ? 'spec' : 'screen',
                    position: screen.position,
                    data: {
                        screen,
                        onFlushProjectData: () => {
                            const pid = useProjectStore.getState().currentProjectId;
                            if (pid) {
                                const { components: comps, flows: flws } = useComponentStore.getState();
                                useProjectStore.getState().updateProjectData(pid, { components: comps, flows: flws }, true);
                            }
                        },
                    },
                    selected: existingNode?.selected,
                };
                if (style) {
                    node.style = style;
                    node.width = typeof style.width === 'number' ? style.width : undefined;
                    node.height = typeof style.height === 'number' ? style.height : undefined;
                }
                return node;
            });
        });
    }, [screens, setNodes]);

    useEffect(() => {
        setEdges(
            flows.map((flow) => ({
                id: flow.id,
                source: flow.source,
                target: flow.target,
                sourceHandle: flow.sourceHandle,
                targetHandle: flow.targetHandle,
                label: flow.label,
                type: 'screenEdge',
                animated: true,
                hidden: flow.id === reconnectingEdgeId,
                data: {
                    color: flow.label === '팝업' ? '#f59e0b' : // Yellow
                        (flow.label === '명세서' || flow.label === '명세서 연결') ? '#10b981' : // Green
                            '#2c3e7c' // Blue (default/paging)
                },
            }))
        );
    }, [flows, setEdges, reconnectingEdgeId]);

    // ── Auto-update Paging Labels ──────────────────────────────────
    useEffect(() => {
        // Find all flows with '페이징' label
        const pagingFlows = flows.filter(f => f.label === '페이징');
        const screenIds = new Set(screens.map(s => s.id));
        const currentPageValues = new Map(screens.map(s => [s.id, s.page]));

        // Build adjacency maps for paging chains
        const nextNodes = new Map<string, string>();
        const prevNodes = new Map<string, string>();

        pagingFlows.forEach(f => {
            // Only consider connections between existing screens
            if (screenIds.has(f.source) && screenIds.has(f.target)) {
                // If a source has multiple outgoing paging flows, we just take the first one
                if (!nextNodes.has(f.source)) nextNodes.set(f.source, f.target);
                if (!prevNodes.has(f.target)) prevNodes.set(f.target, f.source);
            }
        });

        const updates: Record<string, string> = {};
        const processed = new Set<string>();

        // We iterate through all screens to identify and process all disjoint paging chains
        screens.forEach(screen => {
            if (processed.has(screen.id)) return;

            // Find the start of the chain (root)
            let startNode = screen.id;
            const walkVisited = new Set<string>();
            while (prevNodes.has(startNode) && !walkVisited.has(startNode)) {
                const prev = prevNodes.get(startNode)!;
                if (!screenIds.has(prev)) break;
                walkVisited.add(startNode);
                startNode = prev;
            }

            // Trace the chain from startNode to its end
            const chain: string[] = [];
            let curr: string | null = startNode;
            while (curr && !processed.has(curr) && screenIds.has(curr)) {
                processed.add(curr);
                chain.push(curr);
                curr = nextNodes.get(curr) || null;
            }

            // If it's a chain of 2 or more, calculate and set paging labels
            if (chain.length > 1) {
                const total = chain.length;
                chain.forEach((id, idx) => {
                    const newPage = `${idx + 1}/${total}`;
                    if (currentPageValues.get(id) !== newPage) {
                        updates[id] = newPage;
                    }
                });
            } else if (chain.length === 1) {
                // Reset standalone screens to '1/1' if they were previously in a composite paging format
                const currentVal = currentPageValues.get(chain[0]) || "";
                if (currentVal.match(/^\d+\/\d+$/) && currentVal !== "1/1") {
                    // Only reset if they truly have no incoming/outgoing paging flows
                    if (!nextNodes.has(chain[0]) && !prevNodes.has(chain[0])) {
                        updates[chain[0]] = "1/1";
                    }
                }
            }
        });

        // Apply page updates locally and sync to other users
        const updateIds = Object.keys(updates);
        if (updateIds.length > 0) {
            updateIds.forEach(id => {
                const newPage = updates[id];
                updateScreen(id, { page: newPage });
                sendOperation({
                    type: 'SCREEN_UPDATE',
                    targetId: id,
                    userId: user?.id || 'anonymous',
                    userName: user?.name || 'Anonymous',
                    payload: { page: newPage }
                });
            });
        }
    }, [flows, screens.length, updateScreen, sendOperation, user]);

    // Listen for initial Sync from Server
    useEffect(() => {
        const countNonEmptyTableCells = (items: any[]) => {
            return (items || []).reduce((acc: number, comp: any) => {
                const tables = (comp?.drawElements || []).filter((de: any) => de.type === 'table');
                const tableCount = tables.reduce((tAcc: number, t: any) => {
                    const v2 = t.tableCellDataV2 || [];
                    if (v2.length > 0) {
                        return tAcc + v2.reduce((n: number, c: any) => n + (((c?.content || '').trim().length > 0) ? 1 : 0), 0);
                    }
                    const legacy = t.tableCellData || [];
                    return tAcc + legacy.reduce((n: number, c: any) => n + (((c || '').trim().length > 0) ? 1 : 0), 0);
                }, 0);
                return acc + tableCount;
            }, 0);
        };

        const handleSync = (e: CustomEvent) => {
            const { components: comps, screens, flows: flws } = e.detail;
            const items = comps || screens;
            if (items || flws) {
                const localItems = useComponentStore.getState().components || [];
                const localNonEmpty = countNonEmptyTableCells(localItems);
                const syncNonEmpty = countNonEmptyTableCells(items || []);
                // Skip when sync would regress: (1) sync has fewer filled cells, or (2) same count but we have content (prefer local edits)
                const shouldSkipStaleSync = localItems.length > 0 && (localNonEmpty > syncNonEmpty || (localNonEmpty === syncNonEmpty && localNonEmpty > 0));
                if (shouldSkipStaleSync) return;

                // sync 데이터와 로컬 데이터를 병합:
                // 서버 sync에 없더라도 로컬에 guideLines 등이 있으면 보존 (서버 PATCH가 아직 반영 전일 때 발생하는 race condition 방지)
                const mergedItems = (items || []).map((syncComp: any) => {
                    const localComp = localItems.find((lc: any) => lc.id === syncComp.id);
                    if (!localComp) return syncComp;

                    const merged: any = { ...syncComp };
                    // guideLines: 로컬에만 있거나, 로컬이 더 많은 경우 보존
                    const syncGuideCount = (syncComp.guideLines?.vertical?.length ?? 0) + (syncComp.guideLines?.horizontal?.length ?? 0);
                    const localGuideCount = (localComp.guideLines?.vertical?.length ?? 0) + (localComp.guideLines?.horizontal?.length ?? 0);
                    if (localGuideCount > syncGuideCount) {
                        merged.guideLines = localComp.guideLines;
                        merged.guideLinesVisible = localComp.guideLinesVisible;
                        merged.guideLinesLocked = localComp.guideLinesLocked;
                    }
                    // drawElements: 로컬이 더 많은 경우 보존 (서버 sync가 구버전일 때)
                    if ((localComp.drawElements?.length ?? 0) > (syncComp.drawElements?.length ?? 0)) {
                        merged.drawElements = localComp.drawElements;
                    }
                    return merged;
                });

                importData({ components: mergedItems, flows: flws || [] });
            }
        };
        window.addEventListener('erd:state_sync', handleSync as EventListener);

        // Listen for Remote Operations
        const handleRemoteOp = (e: CustomEvent) => {
            const op = e.detail;
            if (!op) return;
            // Skip own operations (본인 작업은 이미 로컬에 반영됨)
            if (user && op.userId === user.id) return;

            if (op.type.startsWith('SCREEN_')) {
                if (op.type === 'SCREEN_CREATE') addComponent(op.payload as any);
                else if (op.type === 'SCREEN_UPDATE' || op.type === 'SCREEN_MOVE') updateComponent(op.targetId, op.payload as any);
                else if (op.type === 'SCREEN_DELETE') deleteComponent(op.targetId);
                else if (op.type === 'SCREEN_FLOW_CREATE') addFlow(op.payload as any);
                else if (op.type === 'SCREEN_FLOW_UPDATE') updateFlow(op.targetId, op.payload as any);
                else if (op.type === 'SCREEN_FLOW_DELETE') deleteFlow(op.targetId);
            }
        };
        window.addEventListener('erd:remote_operation', handleRemoteOp as EventListener);

        return () => {
            window.removeEventListener('erd:state_sync', handleSync as EventListener);
            window.removeEventListener('erd:remote_operation', handleRemoteOp as EventListener);
        };
    }, [importData, addComponent, updateComponent, deleteComponent, addFlow, updateFlow, deleteFlow, user]);

    // Keyboard shortcuts: Delete selected screens or flows
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                const target = e.target as HTMLElement;
                // 텍스트 입력 중에는 화면/연결 삭제 묻지 않음
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
                if (target.isContentEditable || target.closest?.('[contenteditable="true"]')) return;

                const selectedNodes = getNodes().filter(n => n.selected && (n.type === 'screen' || n.type === 'spec'));
                const selectedEdges = edges.filter(e => e.selected);

                if (selectedNodes.length > 0 || selectedEdges.length > 0) {
                    e.preventDefault();
                    if (selectedNodes.length > 0) {
                        const confirmMsg = selectedNodes.length === 1
                            ? `'${selectedNodes[0].data.screen.name}' 컴포넌트를 삭제하시겠습니까?`
                            : `${selectedNodes.length}개의 컴포넌트를 삭제하시겠습니까?`;

                        if (window.confirm(confirmMsg)) {
                            selectedNodes.forEach(node => {
                                deleteScreen(node.id);

                                sendOperation({
                                    type: 'SCREEN_DELETE',
                                    targetId: node.id,
                                    userId: user?.id || 'anonymous',
                                    userName: user?.name || 'Anonymous',
                                    payload: {}
                                });
                            });
                        }
                    }

                    if (selectedEdges.length > 0) {
                        if (window.confirm(`${selectedEdges.length}개의 연결을 삭제하시겠습니까?`)) {
                            selectedEdges.forEach(edge => {
                                deleteFlow(edge.id);
                                sendOperation({
                                    type: 'SCREEN_FLOW_DELETE',
                                    targetId: edge.id,
                                    userId: user?.id || 'anonymous',
                                    userName: user?.name || 'Anonymous',
                                    payload: {}
                                });
                            });
                        }
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteScreen, deleteFlow, getNodes, edges, user, sendOperation]);

    const onConnect = useCallback((params: any) => {
        if (params.source === params.target) return;

        // Check node types to determine default label
        const sourceScreen = screens.find(s => s.id === params.source);
        const targetScreen = screens.find(s => s.id === params.target);

        const isSpecConnection = sourceScreen?.variant === 'SPEC' || targetScreen?.variant === 'SPEC';
        const defaultLabel = isSpecConnection ? '명세서 연결' : '페이징';

        // ── Auto-populate specs from related tables (Screen -> Spec) ──
        if (isSpecConnection) {
            const uiScreen = sourceScreen?.variant !== 'SPEC' ? sourceScreen : targetScreen;
            const specScreen = sourceScreen?.variant === 'SPEC' ? sourceScreen : targetScreen;

            if (uiScreen && specScreen && uiScreen.variant !== 'SPEC' && specScreen.variant === 'SPEC') {
                // 부모 화면상세 설계 엔티티의 메타 값을 명세 엔티티에 반영
                const metaUpdates: Partial<Screen> = {
                    systemName: uiScreen.systemName,
                    author: uiScreen.author,
                    createdDate: uiScreen.createdDate,
                    screenId: uiScreen.screenId,
                    screenType: uiScreen.screenType,
                    screenDescription: uiScreen.screenDescription,
                };
                updateScreen(specScreen.id, metaUpdates);
                sendOperation({
                    type: 'SCREEN_UPDATE',
                    targetId: specScreen.id,
                    userId: user?.id || 'anonymous',
                    userName: user?.name || 'Anonymous',
                    payload: metaUpdates
                });

                const relatedTablesText = uiScreen.relatedTables || '';
                const tableNames = relatedTablesText.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.startsWith('•'))
                    .map(line => line.substring(1).trim());

                const linkedErdProject = projects.find(p => p.id === currentProject?.linkedErdProjectId);
                const erdData = linkedErdProject?.data as { entities?: { name: string; attributes: { name: string; comment?: string; type?: string; length?: string; defaultVal?: string }[] }[] } | undefined;
                // Component project: no ERD linking - skip spec auto-populate from ERD
                if (tableNames.length > 0 && erdData?.entities) {
                    const existingSpecs = specScreen.specs || [];
                    const existingControlNames = new Set(existingSpecs.map(s => s.controlName));
                    const newSpecs: any[] = [];

                    tableNames.forEach(tableName => {
                        const entity = erdData.entities!.find((e: { name: string }) => e.name === tableName);
                        if (entity) {
                            entity.attributes.forEach((attr: { name: string; comment?: string; type?: string; length?: string; defaultVal?: string }) => {
                                if (!existingControlNames.has(attr.name)) {
                                    newSpecs.push({
                                        id: `spec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                        fieldName: attr.comment || attr.name,
                                        controlName: attr.name,
                                        dataType: 'INPUT',
                                        format: attr.type || '',
                                        length: attr.length || '',
                                        defaultValue: attr.defaultVal || '',
                                        validation: '',
                                        memo: '',
                                    });
                                    existingControlNames.add(attr.name);
                                }
                            });
                        }
                    });

                    if (newSpecs.length > 0) {
                        const updatedSpecs = [...existingSpecs, ...newSpecs];
                        updateScreen(specScreen.id, { specs: updatedSpecs });
                        sendOperation({
                            type: 'SCREEN_UPDATE',
                            targetId: specScreen.id,
                            userId: user?.id || 'anonymous',
                            userName: user?.name || 'Anonymous',
                            payload: { specs: updatedSpecs }
                        });
                    }
                }
            }
        }

        // Check if a flow already exists between these two nodes
        const existingFlow = flows.find(f =>
            f.source === params.source && f.target === params.target
        );

        if (existingFlow) {
            // MOVE/UPDATE existing connection instead of creating duplicate
            updateFlow(existingFlow.id, {
                sourceHandle: params.sourceHandle || undefined,
                targetHandle: params.targetHandle || undefined,
                // Also update label if it was '페이징' and now it's a spec connection
                ...(isSpecConnection && existingFlow.label === '페이징' ? { label: '명세서 연결' } : {})
            });

            sendOperation({
                type: 'SCREEN_FLOW_UPDATE',
                targetId: existingFlow.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: {
                    sourceHandle: params.sourceHandle || undefined,
                    targetHandle: params.targetHandle || undefined,
                    ...(isSpecConnection && existingFlow.label === '페이징' ? { label: '명세서 연결' } : {})
                }
            });
            return;
        }

        const flowId = `flow_${Date.now()}`;
        const newFlow = {
            id: flowId,
            source: params.source!,
            target: params.target!,
            sourceHandle: params.sourceHandle || undefined,
            targetHandle: params.targetHandle || undefined,
            label: defaultLabel,
        };
        addFlow(newFlow);

        sendOperation({
            type: 'SCREEN_FLOW_CREATE',
            targetId: flowId,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: newFlow as any
        });
    }, [addFlow, updateFlow, updateScreen, flows, screens, sendOperation, user, projects, currentProject]);

    const onEdgeUpdateStart = useCallback((_: any, edge: RFEdge) => {
        setReconnectingEdgeId(edge.id);
    }, []);

    const onEdgeUpdate = useCallback((oldEdge: RFEdge, newConnection: any) => {
        if (newConnection.source === newConnection.target) {
            setReconnectingEdgeId(null);
            return;
        }

        // Only block if we are trying to reconnect to a node pair that ALREADY has a DIFFERENT line
        const anotherExists = flows.some(f =>
            f.id !== oldEdge.id &&
            f.source === newConnection.source &&
            f.target === newConnection.target
        );
        if (anotherExists) {
            setReconnectingEdgeId(null);
            return;
        }

        setEdges((els) => reconnectEdge(oldEdge, newConnection, els));
        updateFlow(oldEdge.id, {
            source: newConnection.source!,
            target: newConnection.target!,
            sourceHandle: newConnection.sourceHandle || undefined,
            targetHandle: newConnection.targetHandle || undefined,
        });

        sendOperation({
            type: 'SCREEN_FLOW_UPDATE',
            targetId: oldEdge.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: {
                source: newConnection.source!,
                target: newConnection.target!,
                sourceHandle: newConnection.sourceHandle || undefined,
                targetHandle: newConnection.targetHandle || undefined,
            }
        });

        // 재연결 시에도 명세서 연결이면 부모 화면의 메타 값을 명세에 반영
        const sourceScreen = screens.find(s => s.id === newConnection.source);
        const targetScreen = screens.find(s => s.id === newConnection.target);
        const uiScreen = sourceScreen?.variant !== 'SPEC' ? sourceScreen : targetScreen;
        const specScreen = sourceScreen?.variant === 'SPEC' ? sourceScreen : targetScreen;
        if (uiScreen && specScreen && uiScreen.variant !== 'SPEC' && specScreen.variant === 'SPEC') {
            const metaUpdates: Partial<Screen> = {
                systemName: uiScreen.systemName,
                author: uiScreen.author,
                createdDate: uiScreen.createdDate,
                screenId: uiScreen.screenId,
                screenType: uiScreen.screenType,
                screenDescription: uiScreen.screenDescription,
            };
            updateScreen(specScreen.id, metaUpdates);
            sendOperation({
                type: 'SCREEN_UPDATE',
                targetId: specScreen.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: metaUpdates
            });
        }

        setReconnectingEdgeId(null);
    }, [updateFlow, setEdges, flows, sendOperation, user, screens, updateScreen]);

    const onEdgeUpdateEnd = useCallback((_: any, _edge: RFEdge) => {
        setReconnectingEdgeId(null);
    }, []);

    const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: RFEdge) => {
        setEditingFlowId(edge.id);
    }, []);

    const isValidConnection = useCallback((connection: any) => {
        return connection.source !== connection.target;
    }, []);

    const handleAddScreenClick = useCallback(() => {
        setIsAddScreenModalOpen(true);
    }, []);

    const handleAddScreenConfirm = useCallback((pageSize: PageSizeOption, pageOrientation: PageOrientation) => {
        const baseName = '새 컴포넌트';
        const existingNames = new Set(components.map(s => s.name));
        let newName = baseName;
        if (existingNames.has(baseName)) {
            let counter = 1;
            while (existingNames.has(`${baseName}(${counter})`)) counter++;
            newName = `${baseName}(${counter})`;
        }

        const existingIds = components.map(s => {
            const match = s.screenId.match(/CMP-(\d+)/);
            return match ? parseInt(match[1]) : 0;
        });
        const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
        const screenId = `CMP-${String(nextNum).padStart(3, '0')}`;
        const today = new Date().toISOString().split('T')[0];
        const { width: imageWidth, height: imageHeight } = getCanvasDimensions({
            pageSize,
            pageOrientation: pageOrientation || 'portrait',
        } as Screen);

        const newScreen: Screen = {
            id: `screen_${Date.now()}`,
            systemName: currentProject?.name || '',
            screenId,
            name: newName,
            author: user?.name || '',
            createdDate: today,
            screenType: '조회',
            page: '1/1',
            screenDescription: '',
            initialSettings: '',
            functionDetails: '',
            relatedTables: '',
            position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
            fields: [],
            isLocked: true,
            pageSize,
            pageOrientation,
            imageWidth,
            imageHeight,
        };
        addComponent(newScreen);

        sendOperation({
            type: 'SCREEN_CREATE',
            targetId: newScreen.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: newScreen as unknown as Record<string, unknown>
        });
    }, [components, addComponent, currentProject, user, sendOperation]);

    const onNodeDragStop = useCallback((_: React.MouseEvent, node: RFNode) => {
        updateScreen(node.id, { position: node.position });

        sendOperation({
            type: 'SCREEN_MOVE',
            targetId: node.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: { position: node.position }
        });
    }, [updateScreen, sendOperation, user]);

    const storeValue = useMemo(() => ({
        screens: components,
        updateScreen: updateComponent,
        deleteScreen: deleteComponent,
        canvasClipboard,
        setCanvasClipboard,
        gridClipboard,
        setGridClipboard,
        lastInteractedScreenId,
        setLastInteractedScreenId,
        getScreenById: (id: string) => useComponentStore.getState().components.find((c) => c.id === id),
        getPasteTargetScreenId: () => {
            const s = useComponentStore.getState();
            return s.lastInteractedScreenId ?? (s.components.length === 1 ? s.components[0].id : null);
        },
    }), [components, updateComponent, deleteComponent, canvasClipboard, setCanvasClipboard, gridClipboard, setGridClipboard, lastInteractedScreenId, setLastInteractedScreenId]);

    // 서버 프로젝트: state_sync 도착 전 편집 시 이미지 등이 덮어쓰여 사라지는 것 방지
    if (currentProjectId && !currentProjectId.startsWith('local_') && !isSynced) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50">
                <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mb-4" />
                <p className="text-gray-500 font-medium">서버와 동기화 중...</p>
            </div>
        );
    }

    return (
        <CanvasOnlyModeContext.Provider value={false}>
            <ScreenCanvasStoreProvider value={storeValue}>
                <ScreenDesignUndoRedoProvider>
                    <RecentTextColorsProvider>
                    <RecentStyleColorsProvider>
                    <ExportModeContext.Provider value={false}>
                        <div className="flex w-full h-screen overflow-hidden bg-gray-50">
                            <div className="relative flex h-full min-w-0">
                                <div
                                    className={`relative h-full transition-all duration-300 ease-in-out border-r border-gray-200 overflow-hidden bg-white shadow-xl z-[10001] ${isSidebarOpen ? 'w-56 sm:w-64 md:w-72 flex-shrink-0' : 'w-0 border-none'}`}
                                >
                                    <div className="w-56 sm:w-64 md:w-72 h-full min-w-0">
                                        <ComponentSidebar />
                                    </div>
                                </div>

                                <button
                                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                    className={`absolute top-1/2 -translate-y-1/2 z-30 w-5 h-12 bg-white rounded-r-lg shadow-md border border-l-0 border-gray-200 text-gray-400 hover:text-violet-500 hover:w-6 transition-all active:scale-95 flex items-center justify-center ${isSidebarOpen ? '-right-5' : 'left-0'}`}
                                    title={isSidebarOpen ? "사이드바 닫기" : "사이드바 열기"}
                                >
                                    {isSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                                </button>
                            </div>

                            <div className="flex-1 min-w-0 h-full relative" ref={flowWrapper}>
                                <div className={`absolute top-4 right-4 z-[10001] bg-white/80 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 p-2 flex flex-wrap items-center gap-2 max-w-[calc(100%-2rem)] ${isSidebarOpen ? 'left-6' : 'left-4'} transition-all duration-300`}>
                                    <PremiumTooltip placement="bottom" offsetBottom={30} label="프로젝트 목록으로 돌아가기">
                                        <button
                                            onClick={() => { void flushAndLeaveProject(); }}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95 shrink-0"
                                            title="프로젝트 목록으로 돌아가기"
                                        >
                                            <Home size={16} className="text-teal-500 shrink-0" />
                                        </button>
                                    </PremiumTooltip>
                                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

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
                                            className="text-xs font-mono font-bold text-gray-700 hover:text-violet-600 transition-colors text-left truncate max-w-[140px] sm:max-w-[180px]"
                                        >
                                            {currentProject?.id}
                                        </button>
                                    </div>

                                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                                    <PremiumTooltip placement="bottom" offsetBottom={30} label="컴포넌트 추가">
                                        <button
                                            onClick={handleAddScreenClick}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-all text-sm font-bold shadow-md hover:shadow-lg active:scale-95 shrink-0"
                                        >
                                            <Plus size={16} className="shrink-0" />
                                            <span className="whitespace-nowrap">컴포넌트 추가</span>
                                        </button>
                                    </PremiumTooltip>
                                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                                    <ToolbarUndoRedo />

                                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                                    <div className="shrink-0">
                                        <OnlineUsers />
                                    </div>

                                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                                    <div className="flex items-center gap-2 px-1 shrink-0">
                                        <div className="flex items-center gap-2 pl-2 pr-2 sm:pr-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 min-w-0">
                                            {user?.picture ? (
                                                <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full border border-white shadow-sm shrink-0" />
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 shrink-0">
                                                    <UserIcon size={14} />
                                                </div>
                                            )}
                                            <span className="text-sm font-bold text-gray-700 truncate max-w-[80px] sm:max-w-none">{user?.name}</span>
                                        </div>
                                        <PremiumTooltip placement="bottom" offsetBottom={30} label="로그아웃">
                                            <button
                                                onClick={() => {
                                                    if (window.confirm('로그아웃 하시겠습니까?')) {
                                                        void (async () => {
                                                            await flushAndLeaveProject();
                                                            logout();
                                                        })();
                                                    }
                                                }}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all active:scale-95 shrink-0"
                                                title="로그아웃"
                                            >
                                                <LogOut size={18} />
                                            </button>
                                        </PremiumTooltip>
                                    </div>
                                </div>

                                <ReactFlow
                                    nodes={nodes}
                                    edges={edges}
                                    onNodesChange={onNodesChange}
                                    onEdgesChange={onEdgesChange}
                                    onNodeDragStop={onNodeDragStop}
                                    onConnect={onConnect}
                                    onEdgeUpdateStart={onEdgeUpdateStart}
                                    onEdgeUpdate={onEdgeUpdate}
                                    onEdgeUpdateEnd={onEdgeUpdateEnd}
                                    onEdgeDoubleClick={onEdgeDoubleClick}
                                    isValidConnection={isValidConnection}
                                    nodeTypes={nodeTypes}
                                    edgeTypes={edgeTypes}
                                    connectionMode={ConnectionMode.Loose}
                                    panOnScroll={true}
                                    panOnScrollMode={PanOnScrollMode.Free}
                                    noPanClassName="no-pan-scroll"
                                    zoomOnScroll={false}
                                    zoomOnDoubleClick={false}
                                    zoomActivationKeyCode="Control"
                                    minZoom={0.05}
                                    maxZoom={4}
                                    fitView
                                    multiSelectionKeyCode="Shift"
                                    selectionKeyCode="Shift"
                                    deleteKeyCode={null}
                                    onPaneClick={() => {
                                        // Notify all ScreenNodes to clear selection
                                        window.dispatchEvent(new CustomEvent('clear-screen-selection'));
                                    }}
                                    onPaneMouseMove={onPaneMouseMove}
                                >
                                    <UserCursorsLayer />
                                    <Controls />
                                    <MiniMap
                                        nodeColor={() => '#0d9488'}
                                        className="!bg-white !border-2 !border-gray-100 !rounded-xl !shadow-lg"
                                    />
                                    <Background
                                        variant={BackgroundVariant.Dots}
                                        gap={20}
                                        size={1.5}
                                        color="#84878bff"
                                    />
                                </ReactFlow>

                                {/* 그리기 도구 팝업 포털 - 상단 메뉴바/사이드바(z-10001) 아래에 렌더링 */}
                                <div id="panel-portal-root" className="fixed inset-0 z-[9000] pointer-events-none [&>*]:pointer-events-auto" aria-hidden="true" />

                                {isAddScreenModalOpen && (
                                    <AddScreenModal
                                        variant="component"
                                        onConfirm={handleAddScreenConfirm}
                                        onClose={() => setIsAddScreenModalOpen(false)}
                                    />
                                )}

                                {/* Relationship Edit Modal */}
                                {editingFlowId && (
                                    (() => {
                                        const editingFlow = flows.find(f => f.id === editingFlowId);
                                        const sourceNode = screens.find(s => s.id === editingFlow?.source);
                                        const targetNode = screens.find(s => s.id === editingFlow?.target);

                                        if (!editingFlow) return null;

                                        return (
                                            <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
                                                <div className="bg-white rounded-[15px] w-full max-w-md shadow-2xl overflow-hidden scale-in">
                                                    {/* Header */}
                                                    <div className="px-8 py-6 flex items-center justify-between border-b border-gray-100">
                                                        <h3 className="text-xl font-black text-gray-900">관계 편집</h3>
                                                        <button
                                                            onClick={() => setEditingFlowId(null)}
                                                            className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
                                                        >
                                                            <X size={20} />
                                                        </button>
                                                    </div>

                                                    <div className="p-8">
                                                        {/* Connection Info */}
                                                        <div className="bg-blue-50/50 rounded-2xl p-5 border border-blue-100 mb-8">
                                                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-1">연결 정보</span>
                                                            <div className="flex items-center gap-3 text-sm font-black text-gray-700">
                                                                <span className="truncate max-w-[140px]">{sourceNode?.name || 'Unknown'}</span>
                                                                <ArrowLeft size={14} className="text-gray-400 rotate-180" />
                                                                <span className="truncate max-w-[140px]">{targetNode?.name || 'Unknown'}</span>
                                                            </div>
                                                        </div>

                                                        {/* Relationship Type Options */}
                                                        <div className="space-y-3">
                                                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2">관계 유형</span>

                                                            {[
                                                                { id: '페이징', label: '페이징', desc: '페이지 이동' },
                                                                { id: '팝업', label: '팝업', desc: '팝업/모달 호출' },
                                                                { id: '명세서 연결', label: '명세서 연결', desc: '화면-명세 연결' }
                                                            ].map((opt) => (
                                                                <label
                                                                    key={opt.id}
                                                                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${editingFlow.label === opt.id
                                                                        ? 'border-blue-500 bg-blue-50/30'
                                                                        : 'border-gray-100 hover:border-blue-200'
                                                                        }`}
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${editingFlow.label === opt.id ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                                                                            }`}>
                                                                            {editingFlow.label === opt.id && <div className="w-2 h-2 bg-white rounded-full" />}
                                                                        </div>
                                                                        <span className="text-sm font-black text-gray-800">{opt.label}</span>
                                                                    </div>
                                                                    <span className="text-[11px] font-bold text-gray-400">{opt.desc}</span>
                                                                    <input
                                                                        type="radio"
                                                                        className="hidden"
                                                                        name="relType"
                                                                        checked={editingFlow.label === opt.id}
                                                                        onChange={() => {
                                                                            updateFlow(editingFlow.id, { label: opt.id });
                                                                            sendOperation({
                                                                                type: 'SCREEN_FLOW_UPDATE',
                                                                                targetId: editingFlow.id,
                                                                                userId: user?.id || 'anonymous',
                                                                                userName: user?.name || 'Anonymous',
                                                                                payload: { label: opt.id }
                                                                            });
                                                                        }}
                                                                    />
                                                                </label>
                                                            ))}

                                                            {/* Custom Input */}
                                                            <div className="mt-4">
                                                                <input
                                                                    type="text"
                                                                    value={flowLabelComposing !== null ? flowLabelComposing : (editingFlow.label || '')}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                                                            setFlowLabelComposing(val);
                                                                            return;
                                                                        }
                                                                        setFlowLabelComposing(null);
                                                                        updateFlow(editingFlow.id, { label: val });
                                                                        sendOperation({
                                                                            type: 'SCREEN_FLOW_UPDATE',
                                                                            targetId: editingFlow.id,
                                                                            userId: user?.id || 'anonymous',
                                                                            userName: user?.name || 'Anonymous',
                                                                            payload: { label: val }
                                                                        });
                                                                    }}
                                                                    onCompositionEnd={(e) => {
                                                                        const val = (e.target as HTMLInputElement).value;
                                                                        setFlowLabelComposing(null);
                                                                        updateFlow(editingFlow.id, { label: val });
                                                                        sendOperation({
                                                                            type: 'SCREEN_FLOW_UPDATE',
                                                                            targetId: editingFlow.id,
                                                                            userId: user?.id || 'anonymous',
                                                                            userName: user?.name || 'Anonymous',
                                                                            payload: { label: val }
                                                                        });
                                                                    }}
                                                                    placeholder="직접 입력..."
                                                                    className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-sm font-bold text-gray-700 transition-all"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Footer */}
                                                    <div className="px-8 py-6 bg-gray-50 flex items-center justify-between">
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm('정말로 이 관계를 삭제하시겠습니까?')) {
                                                                    deleteFlow(editingFlow.id);
                                                                    sendOperation({
                                                                        type: 'SCREEN_FLOW_DELETE',
                                                                        targetId: editingFlow.id,
                                                                        userId: user?.id || 'anonymous',
                                                                        userName: user?.name || 'Anonymous',
                                                                        payload: {}
                                                                    });
                                                                    setEditingFlowId(null);
                                                                }
                                                            }}
                                                            className="px-4 py-2 text-sm bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-all font-semibold active:scale-95"
                                                        >
                                                            관계 삭제
                                                        </button>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => setEditingFlowId(null)}
                                                                className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
                                                            >
                                                                닫기
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()
                                )}
                            </div>
                        </div>
                    </ExportModeContext.Provider>
                    </RecentStyleColorsProvider>
                    </RecentTextColorsProvider>
                </ScreenDesignUndoRedoProvider>
            </ScreenCanvasStoreProvider>
        </CanvasOnlyModeContext.Provider>
    );
};

const ComponentCanvas: React.FC = () => {
    return (
        <ReactFlowProvider>
            <ComponentCanvasContent />
        </ReactFlowProvider>
    );
};

export default ComponentCanvas;
