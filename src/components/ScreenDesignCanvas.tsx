import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import ReactFlow, {
    type Node,
    type Edge,
    type Connection,
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
} from 'reactflow';
import 'reactflow/dist/style.css';

import ScreenNode from './ScreenNode';
import SpecNode from './SpecNode';
import ScreenSidebar from './ScreenSidebar';
import ScreenExportModal from './ScreenExportModal';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';
import type { Screen, ScreenFlow } from '../types/screenDesign';
import {
    Plus, Download, Upload, ChevronLeft, ChevronRight, LogOut, User as UserIcon, Home, FileText, X, ArrowLeft
} from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';
import { toPng } from 'html-to-image';

const nodeTypes: NodeTypes = {
    screen: ScreenNode,
    spec: SpecNode,
};

// ── Canvas Content ──────────────────────────────────────────
const ScreenDesignCanvasContent: React.FC = () => {
    const { screens, flows, addScreen, updateScreen, deleteScreen, addFlow, updateFlow, importData } = useScreenDesignStore();
    const { user, logout } = useAuthStore();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { projects, currentProjectId, setCurrentProject, updateProjectData } = useProjectStore();
    const currentProject = projects.find(p => p.id === currentProjectId);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
    const [reconnectingEdgeId, setReconnectingEdgeId] = useState<string | null>(null);
    const [reconnectingSide, setReconnectingSide] = useState<'source' | 'target' | null>(null);
    const flowWrapper = useRef<HTMLDivElement>(null);
    const { getNodes } = useReactFlow();

    // Initial load for local projects
    useEffect(() => {
        if (currentProjectId?.startsWith('local_') && currentProject) {
            const data = (currentProject as any).screenData;
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
                    entities: [],
                    relationships: [],
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

    // Sync flows → ReactFlow edges
    useEffect(() => {
        const flowEdges: Edge[] = flows.map((flow) => {
            let color = '#64748b'; // Default: Slate
            if (flow.label === '페이징') {
                color = '#8b5cf6'; // Violet
            } else if (flow.label === '팝업') {
                color = '#3b82f6'; // Blue
            } else if (flow.label && flow.label.length > 0) {
                color = '#10b981'; // Emerald
            }

            return {
                id: flow.id,
                source: flow.source,
                target: flow.target,
                sourceHandle: flow.sourceHandle,
                targetHandle: flow.targetHandle,
                type: 'smoothstep',
                label: flow.label || '',
                animated: true,
                hidden: flow.id === reconnectingEdgeId,
                style: {
                    stroke: color,
                    strokeWidth: 3,
                },
                labelBgStyle: {
                    fill: '#fff',
                    fillOpacity: 1,
                    stroke: `${color}44`,
                    strokeWidth: 1.5,
                    rx: 8,
                    ry: 8,
                },
                labelStyle: {
                    fill: color,
                    fontWeight: 900,
                    fontSize: 11,
                    fontFamily: 'Inter, sans-serif'
                },
                labelBgPadding: [10, 5],
                labelBgBorderRadius: 8,
            };
        });
        setEdges(flowEdges);
    }, [flows, setEdges, reconnectingEdgeId]);

    // Keyboard shortcuts: Delete selected screens
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Delete') {
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

                const selectedNodes = getNodes().filter(n => n.selected && (n.type === 'screen' || n.type === 'spec'));
                if (selectedNodes.length > 0) {
                    e.preventDefault();
                    const confirmMsg = selectedNodes.length === 1
                        ? `'${selectedNodes[0].data.screen.name}' 화면을 삭제하시겠습니까?`
                        : `${selectedNodes.length}개의 화면을 삭제하시겠습니까?`;

                    if (window.confirm(confirmMsg)) {
                        selectedNodes.forEach(node => {
                            deleteScreen(node.id);
                        });
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteScreen, getNodes]);

    const isValidConnection = useCallback((connection: Connection) => {
        if (connection.source === connection.target) return false;

        const { flows } = useScreenDesignStore.getState();

        // If reconnecting, check against the stable side
        if (reconnectingEdgeId && reconnectingSide) {
            const existingFlow = flows.find(f => f.id === reconnectingEdgeId);
            if (existingFlow) {
                const stableNodeId = reconnectingSide === 'source' ? existingFlow.target : existingFlow.source;
                // connection.target is where we are currently hovering
                if (stableNodeId === connection.target) return false;
            }
        }

        // Prevent duplicate connections unless we are reconnecting an existing line
        const isDuplicate = flows.some(f =>
            f.id !== reconnectingEdgeId && (
                (f.source === connection.source && f.target === connection.target) ||
                (f.source === connection.target && f.target === connection.source)
            )
        );

        return !isDuplicate;
    }, [reconnectingEdgeId, reconnectingSide]);

    const onConnectStart = useCallback((_event: any, params: any) => {
        const { flows } = useScreenDesignStore.getState();
        const existingFlow = flows.find(f =>
            (f.source === params.nodeId && f.sourceHandle === params.handleId) ||
            (f.target === params.nodeId && f.targetHandle === params.handleId)
        );
        if (existingFlow) {
            setReconnectingEdgeId(existingFlow.id);
            setReconnectingSide(existingFlow.source === params.nodeId && existingFlow.sourceHandle === params.handleId ? 'source' : 'target');
        }
    }, []);

    const onConnect = useCallback(
        (connection: Connection) => {
            if (connection.source && connection.target && connection.source !== connection.target) {
                const { screens, updateScreen, addFlow, updateFlow, flows } = useScreenDesignStore.getState();

                if (reconnectingEdgeId && reconnectingSide) {
                    const existingFlow = flows.find(f => f.id === reconnectingEdgeId);
                    if (existingFlow) {
                        const updates = reconnectingSide === 'source' ? {
                            source: connection.target,
                            sourceHandle: connection.targetHandle || undefined,
                        } : {
                            target: connection.target,
                            targetHandle: connection.targetHandle || undefined,
                        };
                        updateFlow(reconnectingEdgeId, updates);
                    }
                    setReconnectingEdgeId(null);
                    setReconnectingSide(null);
                    return;
                }

                const sourceScreen = screens.find(s => s.id === connection.source);
                const targetScreen = screens.find(s => s.id === connection.target);

                if (sourceScreen && targetScreen) {
                    const isSourceUI = !sourceScreen.variant || sourceScreen.variant === 'UI';
                    const isTargetUI = !targetScreen.variant || targetScreen.variant === 'UI';
                    const isSourceSpec = sourceScreen.variant === 'SPEC';
                    const isTargetSpec = targetScreen.variant === 'SPEC';

                    // Determine default label
                    let defaultLabel = '';
                    const isPagingConnection = (isSourceUI && isTargetUI) || (isSourceSpec && isTargetSpec);

                    if (isPagingConnection) {
                        defaultLabel = '페이징';

                        // ── Advanced Paging Logic ──
                        // 1. Find the entire chain of screens connected by "페이징" edges
                        const { flows } = useScreenDesignStore.getState();

                        // Current potential chain including the new connection
                        const allPagingFlows = [...flows, { source: connection.source, target: connection.target, label: '페이징' }]
                            .filter(f => f.label === '페이징');

                        // Find all nodes involved in this specific chain
                        const chainNodeIds = new Set<string>();
                        const traverse = (nodeId: string) => {
                            if (chainNodeIds.has(nodeId)) return;
                            chainNodeIds.add(nodeId);
                            // Find outgoing and incoming paging connections
                            allPagingFlows.forEach(f => {
                                if (f.source === nodeId) traverse(f.target);
                                if (f.target === nodeId) traverse(f.source);
                            });
                        };
                        traverse(connection.source);

                        // 2. Sort the chain nodes by their existing page numbers or topological order
                        const chainArray = Array.from(chainNodeIds);
                        const findHead = (ids: string[]) => {
                            return ids.find(id => !allPagingFlows.some(f => f.target === id && ids.includes(f.source))) || ids[0];
                        };

                        const sortedChain: string[] = [];
                        let current: string | undefined = findHead(chainArray);
                        const visited = new Set();
                        while (current && !visited.has(current)) {
                            visited.add(current);
                            sortedChain.push(current);
                            const nextFlow = allPagingFlows.find(f => f.source === current && chainNodeIds.has(f.target));
                            current = nextFlow ? nextFlow.target : undefined;
                        }

                        // 3. Update all screens in the chain with new N/M
                        const totalUnits = sortedChain.length;
                        sortedChain.forEach((nodeId, index) => {
                            updateScreen(nodeId, {
                                page: `${index + 1}/${totalUnits}`
                            });
                        });
                    } else if (isTargetSpec && (isSourceUI || isSourceSpec)) {
                        defaultLabel = '명세서 연결';
                    }

                    // 1. Add Edge
                    const newFlow: ScreenFlow = {
                        id: `flow_${Date.now()}`,
                        source: connection.source,
                        target: connection.target,
                        sourceHandle: connection.sourceHandle || undefined,
                        targetHandle: connection.targetHandle || undefined,
                        label: defaultLabel,
                    };
                    addFlow(newFlow);

                    // 2. Data Sync (Source -> Target Spec)
                    if (isTargetSpec && (isSourceUI || isSourceSpec)) {
                        const sourceDesc = isSourceUI ? '화면' : '기능 명세를';
                        if (window.confirm(`'${sourceScreen.name}' ${sourceDesc} 정보를 '${targetScreen.name}' 기능 명세에 적용하시겠습니까?`)) {
                            updateScreen(targetScreen.id, {
                                systemName: sourceScreen.systemName,
                                author: sourceScreen.author,
                                screenId: sourceScreen.screenId,
                                screenType: sourceScreen.screenType,
                                name: sourceScreen.name,
                            });
                        }
                    }
                }
            }
        },
        [addFlow, updateScreen, updateFlow, reconnectingEdgeId]
    );

    const onEdgeDoubleClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
        setEditingFlowId(edge.id);
    }, []);

    const editingFlow = useMemo(() => flows.find(f => f.id === editingFlowId), [flows, editingFlowId]);
    const sourceNode = useMemo(() => screens.find(s => s.id === editingFlow?.source), [screens, editingFlow]);
    const targetNode = useMemo(() => screens.find(s => s.id === editingFlow?.target), [screens, editingFlow]);

    const handleAddScreen = useCallback(() => {
        const baseName = '새 화면';
        const existingNames = new Set(screens.map(s => s.name));
        let newName = baseName;
        if (existingNames.has(baseName)) {
            let counter = 1;
            while (existingNames.has(`${baseName}(${counter})`)) counter++;
            newName = `${baseName}(${counter})`;
        }

        // Auto-increment screen ID
        const existingIds = screens.map(s => {
            const match = s.screenId.match(/SCR-(\d+)/);
            return match ? parseInt(match[1]) : 0;
        });
        const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
        const screenId = `SCR-${String(nextNum).padStart(3, '0')}`;

        // Today's date
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
    }, [screens, addScreen, currentProject, user]);

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
    }, [screens, addScreen, currentProject, user]);

    const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
        updateScreen(node.id, { position: node.position });
    }, [updateScreen]);

    // Image Export using html-to-image
    const handleExportImage = useCallback((_selectedIds: string[]) => {
        setIsExportModalOpen(false);

        const element = document.querySelector('.react-flow') as HTMLElement;
        if (!element) {
            alert('캔버스를 찾을 수 없습니다.');
            return;
        }

        // Temporarily highlight only the selected nodes
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
            {/* Left Sidebar */}
            <div className="relative flex h-full">
                <div
                    className={`h-full transition-all duration-300 ease-in-out border-r border-gray-200 overflow-hidden bg-white shadow-xl ${isSidebarOpen ? 'w-72 flex-shrink-0' : 'w-0 border-none'}`}
                >
                    <div className="w-72 h-full">
                        <ScreenSidebar />
                    </div>
                </div>

                {/* Toggle Button */}
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={`absolute top-1/2 -translate-y-1/2 z-30 w-5 h-12 bg-white rounded-r-lg shadow-md border border-l-0 border-gray-200 text-gray-400 hover:text-violet-500 hover:w-6 transition-all active:scale-95 flex items-center justify-center ${isSidebarOpen ? '-right-5' : 'left-0'}`}
                    title={isSidebarOpen ? "사이드바 닫기" : "사이드바 열기"}
                >
                    {isSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                </button>
            </div>

            {/* Main Canvas */}
            <div className="flex-1 h-full relative" ref={flowWrapper}>
                {/* Toolbar */}
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

                    {/* Export Button */}
                    <button
                        onClick={() => setIsExportModalOpen(true)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95"
                    >
                        <Upload size={16} className="text-green-500" />
                        <span>내보내기</span>
                    </button>

                    {/* Import Button (placeholder) */}
                    <button
                        disabled
                        className="flex items-center gap-2 px-3.5 py-2 bg-white text-gray-400 border border-gray-200 rounded-lg text-sm font-bold shadow-sm cursor-not-allowed opacity-60"
                        title="가져오기 기능 준비중"
                    >
                        <Download size={16} className="text-gray-400" />
                        가져오기
                    </button>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1 self-center" />

                    {/* User Profile & Logout */}
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

                {/* React Flow Canvas */}
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onConnectStart={onConnectStart}
                    onConnectEnd={() => {
                        setTimeout(() => {
                            setReconnectingEdgeId(null);
                            setReconnectingSide(null);
                        }, 100);
                    }}
                    isValidConnection={isValidConnection}
                    onEdgeDoubleClick={onEdgeDoubleClick}
                    onNodeDragStop={onNodeDragStop}
                    nodeTypes={nodeTypes}
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

                {/* Export Modal */}
                {isExportModalOpen && (
                    <ScreenExportModal
                        screens={screens}
                        onExport={handleExportImage}
                        onClose={() => setIsExportModalOpen(false)}
                    />
                )}

                {/* Relationship Edit Modal */}
                {editingFlowId && editingFlow && (
                    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
                        <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden scale-in">
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
                                            className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${editingFlow.label === opt.id
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
                                                    const { updateFlow } = useScreenDesignStore.getState();
                                                    updateFlow(editingFlow.id, { label: opt.id });
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
                                                const { updateFlow } = useScreenDesignStore.getState();
                                                updateFlow(editingFlow.id, { label: e.target.value });
                                            }}
                                            placeholder="직접 입력..."
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none text-sm font-bold text-gray-700 transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-8 py-6 bg-gray-50 flex items-center justify-between">
                                <button
                                    onClick={() => {
                                        if (window.confirm('정말로 이 관계를 삭제하시겠습니까?')) {
                                            const { deleteFlow } = useScreenDesignStore.getState();
                                            deleteFlow(editingFlow.id);
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
                                        className="px-6 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-black hover:bg-gray-50 transition-all shadow-sm"
                                    >
                                        취소
                                    </button>
                                    <button
                                        onClick={() => setEditingFlowId(null)}
                                        className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
                                    >
                                        저장
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

// ── Wrapper with ReactFlowProvider ──────────────────────────
const ScreenDesignCanvas: React.FC = () => {
    return (
        <ReactFlowProvider>
            <ScreenDesignCanvasContent />
        </ReactFlowProvider>
    );
};

export default ScreenDesignCanvas;
