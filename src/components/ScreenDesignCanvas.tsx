import React, { useCallback, useEffect, useState, useRef } from 'react';
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
    reconnectEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';

import ScreenNode from './ScreenNode';
import SpecNode from './SpecNode';
import ScreenEdge from './ScreenEdge';
import ScreenSidebar from './ScreenSidebar';
import ScreenExportModal from './ScreenExportModal';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';
import type { Screen } from '../types/screenDesign';
import {
    Plus, Download, Upload, ChevronLeft, ChevronRight, LogOut, User as UserIcon, Home, FileText, X, ArrowLeft
} from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';
import { toPng } from 'html-to-image';
import { useSyncStore } from '../store/syncStore';

const nodeTypes: NodeTypes = {
    screen: ScreenNode,
    spec: SpecNode,
};

const edgeTypes = {
    screenEdge: ScreenEdge,
};

// ── Canvas Content ──────────────────────────────────────────
const ScreenDesignCanvasContent: React.FC = () => {
    const {
        screens, flows,
        addScreen, updateScreen, deleteScreen,
        addFlow, updateFlow, deleteFlow,
        importData
    } = useScreenDesignStore();

    const { user, logout } = useAuthStore();
    const { sendOperation } = useSyncStore();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
    const [reconnectingEdgeId, setReconnectingEdgeId] = useState<string | null>(null);

    const { projects, currentProjectId, setCurrentProject, updateProjectData } = useProjectStore();
    const currentProject = projects.find(p => p.id === currentProjectId);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const flowWrapper = useRef<HTMLDivElement>(null);
    const { getNodes } = useReactFlow();

    // Initial load for local projects
    useEffect(() => {
        if (currentProjectId?.startsWith('local_') && currentProject) {
            // Priority: currentProject.data contains screens/flows directly 
            const data = (currentProject.data as any)?.screens ? currentProject.data : (currentProject as any).screenData;
            if (data) {
                importData(data);
            }
        }
    }, [currentProjectId]);

    // Auto-save to ProjectStore for LOCAL projects
    useEffect(() => {
        if (currentProjectId?.startsWith('local_')) {
            const timer = setTimeout(() => {
                updateProjectData(currentProjectId, {
                    screens,
                    flows,
                });
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [screens, flows, currentProjectId, updateProjectData]);

    // Sync screens → ReactFlow nodes
    useEffect(() => {
        setNodes((prevNodes) => {
            return screens.map((screen) => {
                const existingNode = prevNodes.find((n) => n.id === screen.id);
                return {
                    id: screen.id,
                    width: undefined, height: undefined, // Clear style
                    type: screen.variant === 'SPEC' ? 'spec' : 'screen',
                    position: screen.position,
                    data: { screen },
                    selected: existingNode?.selected,
                };
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
                hidden: flow.id === reconnectingEdgeId, // Hide while being "moved"
                data: { color: '#2c3e7c' },
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
        const handleSync = (e: CustomEvent) => {
            const { screens, flows } = e.detail;
            // Always import if data is provided, even if empty
            if (screens || flows) {
                importData({ screens: screens || [], flows: flows || [] });
            }
        };
        window.addEventListener('erd:state_sync', handleSync as EventListener);

        // Listen for Remote Operations
        const handleRemoteOp = (e: CustomEvent) => {
            const op = e.detail;
            if (op.type.startsWith('SCREEN_')) {
                if (op.type === 'SCREEN_CREATE') addScreen(op.payload as any);
                else if (op.type === 'SCREEN_UPDATE' || op.type === 'SCREEN_MOVE') updateScreen(op.targetId, op.payload as any);
                else if (op.type === 'SCREEN_DELETE') deleteScreen(op.targetId);
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
    }, [importData, addScreen, updateScreen, deleteScreen]);

    // Keyboard shortcuts: Delete selected screens or flows
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

                const selectedNodes = getNodes().filter(n => n.selected && (n.type === 'screen' || n.type === 'spec'));
                const selectedEdges = edges.filter(e => e.selected);

                if (selectedNodes.length > 0 || selectedEdges.length > 0) {
                    e.preventDefault();
                    if (selectedNodes.length > 0) {
                        const confirmMsg = selectedNodes.length === 1
                            ? `'${selectedNodes[0].data.screen.name}' 화면을 삭제하시겠습니까?`
                            : `${selectedNodes.length}개의 화면을 삭제하시겠습니까?`;

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

        // Check if a flow already exists between these two nodes
        const existingFlow = flows.find(f =>
            f.source === params.source && f.target === params.target
        );

        if (existingFlow) {
            // MOVE/UPDATE existing connection instead of creating duplicate
            updateFlow(existingFlow.id, {
                sourceHandle: params.sourceHandle || undefined,
                targetHandle: params.targetHandle || undefined,
            });

            sendOperation({
                type: 'SCREEN_FLOW_UPDATE',
                targetId: existingFlow.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: {
                    sourceHandle: params.sourceHandle || undefined,
                    targetHandle: params.targetHandle || undefined,
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
            label: '페이징',
        };
        addFlow(newFlow);

        sendOperation({
            type: 'SCREEN_FLOW_CREATE',
            targetId: flowId,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: newFlow as any
        });
    }, [addFlow, updateFlow, flows, sendOperation, user]);

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
        setReconnectingEdgeId(null);
    }, [updateFlow, setEdges, flows, sendOperation, user]);

    const onEdgeUpdateEnd = useCallback((_: any, _edge: RFEdge) => {
        setReconnectingEdgeId(null);
    }, []);

    const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: RFEdge) => {
        setEditingFlowId(edge.id);
    }, []);

    const isValidConnection = useCallback((connection: any) => {
        return connection.source !== connection.target;
    }, []);

    const handleAddScreen = useCallback(() => {
        const baseName = '새 화면';
        const existingNames = new Set(screens.map(s => s.name));
        let newName = baseName;
        if (existingNames.has(baseName)) {
            let counter = 1;
            while (existingNames.has(`${baseName}(${counter})`)) counter++;
            newName = `${baseName}(${counter})`;
        }

        const existingIds = screens.map(s => {
            const match = s.screenId.match(/SCR-(\d+)/);
            return match ? parseInt(match[1]) : 0;
        });
        const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
        const screenId = `SCR-${String(nextNum).padStart(3, '0')}`;
        const today = new Date().toISOString().split('T')[0];

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
        };
        addScreen(newScreen);

        sendOperation({
            type: 'SCREEN_CREATE',
            targetId: newScreen.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: newScreen as unknown as Record<string, unknown>
        });
    }, [screens, addScreen, currentProject, user, sendOperation]);

    const handleAddSpec = useCallback(() => {
        const baseName = '새 기능명세';
        const existingNames = new Set(screens.map(s => s.name));
        let newName = baseName;
        if (existingNames.has(baseName)) {
            let counter = 1;
            while (existingNames.has(`${baseName}(${counter})`)) counter++;
            newName = `${baseName}(${counter})`;
        }

        const existingIds = screens.map(s => {
            const match = s.screenId.match(/SCR-(\d+)/);
            return match ? parseInt(match[1]) : 0;
        });
        const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
        const screenId = `SCR-${String(nextNum).padStart(3, '0')}`;
        const today = new Date().toISOString().split('T')[0];

        const newScreen: Screen = {
            id: `spec_${Date.now()}`,
            systemName: currentProject?.name || '',
            screenId,
            name: newName,
            author: user?.name || '',
            createdDate: today,
            screenType: '기타',
            page: '1/1',
            screenDescription: '',
            initialSettings: '',
            functionDetails: '',
            relatedTables: '',
            position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
            fields: [],
            variant: 'SPEC',
            specs: [],
            isLocked: true,
        };
        addScreen(newScreen);

        sendOperation({
            type: 'SCREEN_CREATE',
            targetId: newScreen.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: newScreen as unknown as Record<string, unknown>
        });
    }, [screens, addScreen, currentProject, user, sendOperation]);

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

    const handleExportImage = useCallback((_selectedIds: string[]) => {
        setIsExportModalOpen(false);

        const element = document.querySelector('.react-flow') as HTMLElement;
        if (!element) {
            alert('캔버스를 찾을 수 없습니다.');
            return;
        }

        toPng(element, {
            backgroundColor: '#f9fafb',
            quality: 1,
            pixelRatio: 2,
        }).then((dataUrl) => {
            const link = document.createElement('a');
            link.download = `screen-design-${Date.now()}.png`;
            link.href = dataUrl;
            link.click();
        }).catch((err) => {
            console.error('Export failed:', err);
            alert('이미지 내보내기에 실패했습니다.');
        });
    }, []);

    return (
        <div className="flex w-full h-screen overflow-hidden bg-gray-50">
            <div className="relative flex h-full">
                <div
                    className={`h-full transition-all duration-300 ease-in-out border-r border-gray-200 overflow-hidden bg-white shadow-xl ${isSidebarOpen ? 'w-72 flex-shrink-0' : 'w-0 border-none'}`}
                >
                    <div className="w-72 h-full">
                        <ScreenSidebar />
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

            <div className="flex-1 h-full relative" ref={flowWrapper}>
                <div className={`absolute top-4 ${isSidebarOpen ? 'left-6' : 'left-8'} z-10 bg-white/80 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 p-1.5 flex gap-1.5 transition-all duration-300`}>
                    <button
                        onClick={() => setCurrentProject(null)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95"
                        title="프로젝트 목록으로 돌아가기"
                    >
                        <Home size={16} className="text-violet-500" />
                    </button>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1 self-center" />

                    <div className="flex flex-col justify-center px-1 mr-2" title="클릭하여 ID 복사">
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
                            className="text-xs font-mono font-bold text-gray-700 hover:text-violet-600 transition-colors text-left"
                        >
                            {currentProject?.id}
                        </button>
                    </div>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1 self-center" />

                    <button
                        onClick={handleAddScreen}
                        className="flex items-center gap-2 px-3.5 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-all text-sm font-bold shadow-md hover:shadow-lg active:scale-95"
                    >
                        <Plus size={16} />
                        화면 추가
                    </button>

                    <button
                        onClick={handleAddSpec}
                        className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-bold shadow-md hover:shadow-lg active:scale-95"
                    >
                        <FileText size={16} />
                        명세 추가
                    </button>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1 self-center" />

                    <button
                        onClick={() => setIsExportModalOpen(true)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95"
                    >
                        <Upload size={16} className="text-green-500" />
                        <span>내보내기</span>
                    </button>

                    <button
                        disabled
                        className="flex items-center gap-2 px-3.5 py-2 bg-white text-gray-400 border border-gray-200 rounded-lg text-sm font-bold shadow-sm cursor-not-allowed opacity-60"
                        title="가져오기 기능 준비중"
                    >
                        <Download size={16} className="text-gray-400" />
                        가져오기
                    </button>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1 self-center" />

                    <div className="flex items-center gap-2 px-1">
                        <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                            {user?.picture ? (
                                <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full border border-white shadow-sm" />
                            ) : (
                                <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                                    <UserIcon size={14} />
                                </div>
                            )}
                            <span className="text-sm font-bold text-gray-700">{user?.name}</span>
                        </div>
                        <button
                            onClick={() => {
                                if (window.confirm('로그아웃 하시겠습니까?')) {
                                    setCurrentProject(null);
                                    logout();
                                }
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all active:scale-95"
                            title="로그아웃"
                        >
                            <LogOut size={18} />
                        </button>
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
                    zoomOnScroll={false}
                    zoomOnDoubleClick={false}
                    zoomActivationKeyCode="Control"
                    minZoom={0.05}
                    maxZoom={4}
                    fitView
                    multiSelectionKeyCode="Shift"
                    selectionKeyCode="Shift"
                    deleteKeyCode={null}
                >
                    <Controls />
                    <MiniMap
                        nodeColor={() => '#8b5cf6'}
                        className="!bg-white !border-2 !border-gray-100 !rounded-xl !shadow-lg"
                    />
                    <Background
                        variant={BackgroundVariant.Dots}
                        gap={20}
                        size={1.5}
                        color="#84878bff"
                    />
                </ReactFlow>

                {isExportModalOpen && (
                    <ScreenExportModal
                        screens={screens}
                        onExport={handleExportImage}
                        onClose={() => setIsExportModalOpen(false)}
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
                                                    value={editingFlow.label || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
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
                                            className="px-6 py-2.5 text-xs font-black text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
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
    );
};

const ScreenDesignCanvas: React.FC = () => {
    return (
        <ReactFlowProvider>
            <ScreenDesignCanvasContent />
        </ReactFlowProvider>
    );
};

export default ScreenDesignCanvas;
