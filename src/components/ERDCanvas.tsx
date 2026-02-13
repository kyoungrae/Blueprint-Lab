import React, { useCallback, useEffect, useState } from 'react';
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
    useViewport,
} from 'reactflow';
import 'reactflow/dist/style.css';

import EntityNode from './EntityNode';
import ERDEdge from './ERDEdge';
import EdgeEditModal from './EdgeEditModal';
import ImportModal from './ImportModal';
import Sidebar from './Sidebar';
import HistoryModal from './HistoryModal';
import { useERDStore } from '../store/erdStore';
import { type Relationship } from '../types/erd';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';
import { useSyncStore } from '../store/syncStore';
import { OnlineUsers, UserCursors } from './collaboration';
import { Plus, Download, Upload, ChevronLeft, ChevronRight, LogOut, User as UserIcon, Home, Layout, ArrowDown, ArrowRight, ChevronDown, Frame, Zap, Undo2, Redo2, History } from 'lucide-react';
import { getLayoutedElements } from '../utils/layout';
import { getForceLayoutedElements } from '../utils/forceLayout';
import { generateSQLFromERD } from '../utils/sqlGenerator';
import { copyToClipboard } from '../utils/clipboard';

const nodeTypes: NodeTypes = {
    entity: EntityNode,
};

const edgeTypes = {
    erd: ERDEdge,
};

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



const ERDCanvasContent: React.FC = () => {
    const {
        entities,
        relationships,
        addEntity,
        updateEntity,
        deleteEntity,
        addRelationship,
        updateRelationship,
        deleteRelationship,
        exportData,
        importData,
        mergeData,
        addLog,
        undo,
        redo,
        canUndo,
        canRedo
    } = useERDStore();

    const { user, logout } = useAuthStore();
    const { projects, currentProjectId, setCurrentProject, updateProjectData } = useProjectStore();

    const currentProject = projects.find(p => p.id === currentProjectId);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [reconnectingEdgeId, setReconnectingEdgeId] = useState<string | null>(null);
    const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const flowWrapper = React.useRef<HTMLDivElement>(null);
    const { getViewport, screenToFlowPosition, getNodes } = useReactFlow();

    // Collaboration Store
    const { updateCursor, sendOperation, isSynced } = useSyncStore();

    // Broadcast cursor position
    const onPaneMouseMove = useCallback((event: React.MouseEvent) => {
        const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        updateCursor({ ...position });
    }, [screenToFlowPosition, getViewport, updateCursor]);


    // Handle remote operations
    useEffect(() => {
        const handleRemoteOperation = (e: CustomEvent<any>) => {
            const op = e.detail;
            if (!op) return;

            // Skip if this is our own operation echoed back from the server
            if (user && op.userId === user.id) return;

            const remoteUser: any = {
                id: op.userId || 'remote',
                name: op.userName || 'Remote User',
                email: 'remote@user.com',
                picture: ''
            };

            switch (op.type) {
                case 'IMPORT':
                    addLog(op.payload);
                    break;
                case 'ENTITY_CREATE':
                    addEntity(op.payload, remoteUser);
                    break;
                case 'ENTITY_UPDATE':
                case 'ENTITY_MOVE':
                    updateEntity(op.targetId, op.payload, remoteUser);
                    break;
                case 'ENTITY_DELETE':
                    deleteEntity(op.targetId, remoteUser);
                    break;
                case 'ATTRIBUTE_ADD':
                case 'ATTRIBUTE_UPDATE':
                case 'ATTRIBUTE_DELETE':
                    // Payload should contain full attributes list for these operations based on SyncEngine logic
                    if (op.payload.attributes) {
                        updateEntity(op.targetId, { attributes: op.payload.attributes }, remoteUser);
                    }
                    break;
                case 'ATTRIBUTE_FIELD_UPDATE':
                    // Granular update for a single field in a single attribute
                    if (op.payload.attrId && op.payload.updates) {
                        (useERDStore.getState() as any).updateAttribute(op.targetId, op.payload.attrId, op.payload.updates, remoteUser);
                    }
                    break;
                case 'RELATIONSHIP_CREATE':
                    addRelationship(op.payload, remoteUser);
                    break;
                case 'RELATIONSHIP_UPDATE':
                    updateRelationship(op.targetId, op.payload, remoteUser);
                    break;
                case 'RELATIONSHIP_DELETE':
                    deleteRelationship(op.targetId, remoteUser);
                    break;
                case 'ERD_IMPORT':
                    if (op.payload.historyLog) {
                        addLog(op.payload.historyLog);
                    }
                    mergeData(op.payload, op.payload.overwrite);
                    break;
            }
        };

        window.addEventListener('erd:remote_operation', handleRemoteOperation as EventListener);
        return () => window.removeEventListener('erd:remote_operation', handleRemoteOperation as EventListener);
    }, [addEntity, updateEntity, deleteEntity, addRelationship, updateRelationship, deleteRelationship, user, addLog, mergeData]);

    // Handle state sync (initial load from server)
    useEffect(() => {
        const handleStateSync = (e: CustomEvent<any>) => {
            const state = e.detail;
            if (!state) return;

            console.log('Applying synced state:', state);
            importData(state);
        };

        window.addEventListener('erd:state_sync', handleStateSync as EventListener);
        return () => window.removeEventListener('erd:state_sync', handleStateSync as EventListener);
    }, [importData]);


    // Initial load for local projects
    useEffect(() => {
        if (currentProjectId?.startsWith('local_') && currentProject) {
            importData(currentProject.data);
        }
    }, [currentProjectId]);

    // Auto-save ERDStore changes to ProjectStore for LOCAL projects
    useEffect(() => {
        if (currentProjectId?.startsWith('local_')) {
            const timer = setTimeout(() => {
                updateProjectData(currentProjectId, {
                    entities,
                    relationships,
                });
            }, 1000); // 1s debounce
            return () => clearTimeout(timer);
        }
    }, [entities, relationships, currentProjectId, updateProjectData]);

    useEffect(() => {
        setNodes((prevNodes) => {
            return entities.map((entity) => {
                const existingNode = prevNodes.find((n) => n.id === entity.id);
                return {
                    id: entity.id,
                    type: 'entity',
                    position: entity.position,
                    data: { entity },
                    // Preserve selected state from React Flow's internal state
                    selected: existingNode?.selected,
                };
            });
        });
    }, [entities, setNodes]);

    // Keyboard shortcuts for Undo/Redo and Deletion
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = e.metaKey || e.ctrlKey;

            // Delete selected entities on Escape, Backspace, or Delete with confirmation
            if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Delete') {
                // Ignore if typing in an input/textarea
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

                const selectedNodes = getNodes().filter(n => n.selected && n.type === 'entity');
                if (selectedNodes.length > 0) {
                    e.preventDefault(); // Prevent browser back navigation on backspace
                    const confirmMsg = selectedNodes.length === 1
                        ? `'${selectedNodes[0].data.entity.name}' 테이블을 삭제하시겠습니까?`
                        : `${selectedNodes.length}개의 테이블을 삭제하시겠습니까?`;

                    if (window.confirm(confirmMsg)) {
                        selectedNodes.forEach(node => {
                            deleteEntity(node.id, user);
                            sendOperation({
                                type: 'ENTITY_DELETE',
                                targetId: node.id,
                                userId: user?.id || 'anonymous',
                                userName: user?.name || 'Anonymous',
                                payload: {}
                            });
                        });
                    }
                }
                return;
            }

            if (isMod && e.key === 'z') {
                if (e.shiftKey) {
                    // Redo (Cmd+Shift+Z)
                    e.preventDefault();
                    redo();
                } else {
                    // Undo (Cmd+Z)
                    e.preventDefault();
                    undo();
                }
            } else if (isMod && e.key === 'y') {
                // Redo (Cmd+Y)
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, deleteEntity, sendOperation, user, getNodes]);

    // Convert relationships to ReactFlow edges
    useEffect(() => {
        const getRelColor = (type: string) => {
            switch (type) {
                case '1:1': return '#10b981'; // Green
                case '1:N': return '#3b82f6'; // Blue
                case 'N:M': return '#8b5cf6'; // Purple
                default: return '#3b82f6';
            }
        };

        const flowEdges: Edge[] = relationships.map((rel) => ({
            id: rel.id,
            source: rel.source,
            target: rel.target,
            sourceHandle: rel.sourceHandle,
            targetHandle: rel.targetHandle,
            type: 'erd',
            label: rel.type,
            animated: true,
            reconnectable: true,
            hidden: rel.id === reconnectingEdgeId, // Hide while being "moved"
            interactionWidth: 40,
            style: { stroke: getRelColor(rel.type), strokeWidth: 2 },
            data: { color: getRelColor(rel.type) }
        }));
        setEdges(flowEdges);
    }, [relationships, setEdges, reconnectingEdgeId]);

    const isValidConnection = useCallback((connection: Connection) => {
        if (connection.source === connection.target) return false;
        return true;
    }, []);

    const onConnectStart = useCallback((_event: any, params: any) => {
        // Find if any relationship is already using this handle
        const existingRel = relationships.find(rel =>
            (rel.source === params.nodeId && rel.sourceHandle === params.handleId) ||
            (rel.target === params.nodeId && rel.targetHandle === params.handleId)
        );
        if (existingRel) {
            setReconnectingEdgeId(existingRel.id);
        }
    }, [relationships]);

    const onConnect = useCallback(
        (connection: Connection) => {
            if (connection.source && connection.target && connection.source !== connection.target) {
                if (reconnectingEdgeId) {
                    const updates = {
                        source: connection.source,
                        target: connection.target,
                        sourceHandle: connection.sourceHandle || undefined,
                        targetHandle: connection.targetHandle || undefined,
                    };
                    updateRelationship(reconnectingEdgeId, updates, user);

                    sendOperation({
                        type: 'RELATIONSHIP_UPDATE',
                        targetId: reconnectingEdgeId,
                        userId: user?.id || 'anonymous',
                        userName: user?.name || 'Anonymous',
                        payload: updates as unknown as Record<string, unknown>
                    });

                    setReconnectingEdgeId(null);
                } else {
                    const newRelationship = {
                        id: `rel_${Date.now()}`,
                        source: connection.source,
                        target: connection.target,
                        sourceHandle: connection.sourceHandle || undefined,
                        targetHandle: connection.targetHandle || undefined,
                        type: '1:N' as const, // Default relationship type
                    };
                    addRelationship(newRelationship, user);

                    sendOperation({
                        type: 'RELATIONSHIP_CREATE',
                        targetId: newRelationship.id,
                        userId: user?.id || 'anonymous',
                        userName: user?.name || 'Anonymous',
                        payload: newRelationship as unknown as Record<string, unknown>
                    });
                }
            }
            setReconnectingEdgeId(null);
        },
        [reconnectingEdgeId, addRelationship, updateRelationship, user, sendOperation]
    );

    const onConnectEnd = useCallback(() => {
        // Delay clearing to allow onConnect to catch it
        setTimeout(() => setReconnectingEdgeId(null), 100);
    }, []);

    const onReconnectStart = useCallback((_: any, edge: Edge) => {
        setReconnectingEdgeId(edge.id);
    }, []);

    const onReconnect = useCallback(
        (oldEdge: Edge, newConnection: Connection) => {
            const updates = {
                source: newConnection.source || oldEdge.source,
                target: newConnection.target || oldEdge.target,
                sourceHandle: newConnection.sourceHandle || undefined,
                targetHandle: newConnection.targetHandle || undefined,
            };

            updateRelationship(oldEdge.id, updates, user); // 4. user 객체 전달

            sendOperation({
                type: 'RELATIONSHIP_UPDATE',
                targetId: oldEdge.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: updates as unknown as Record<string, unknown>
            });

            setReconnectingEdgeId(null);
        },
        [updateRelationship, user, sendOperation]
    );

    const onReconnectEnd = useCallback(() => {
        setReconnectingEdgeId(null);
    }, []);

    const onEdgeDoubleClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
        const rel = relationships.find(r => r.id === edge.id);
        if (rel) {
            setEditingRelationship(rel);
        }
    }, [relationships]);

    const handleAddEntity = useCallback(() => {
        // Generate unique entity name
        const baseName = 'New Entity';
        const existingNames = new Set(entities.map(e => e.name));

        let newName = baseName;
        if (existingNames.has(baseName)) {
            let counter = 1;
            while (existingNames.has(`${baseName}(${counter})`)) {
                counter++;
            }
            newName = `${baseName}(${counter})`;
        }

        const newEntity = {
            id: `entity_${Date.now()}`,
            name: newName,
            position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
            attributes: [
                {
                    id: `attr_${Date.now()}`,
                    name: 'id',
                    type: 'INT',
                    isPK: true,
                    isFK: false,
                },
            ],
            isLocked: false,
        };
        addEntity(newEntity, user); // 4. user 객체 전달

        sendOperation({
            type: 'ENTITY_CREATE',
            targetId: newEntity.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: newEntity as unknown as Record<string, unknown>
        });
    }, [entities, addEntity, user, sendOperation]);

    const handleExportJSON = () => {
        const data = exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `erd-diagram-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setIsExportMenuOpen(false);
    };

    const handleExportSQL = () => {
        const sql = generateSQLFromERD(entities, relationships, currentProject?.dbType || 'MySQL');
        const blob = new Blob([sql], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `erd-schema-${Date.now()}.sql`;
        a.click();
        URL.revokeObjectURL(url);
        setIsExportMenuOpen(false);
    };

    const handleExport = () => {
        setIsExportMenuOpen(!isExportMenuOpen);
    };



    const onLayout = useCallback((direction: 'TB' | 'LR' = 'TB', scope: 'ALL' | 'VISIBLE' = 'ALL') => {
        let nodesToLayout = nodes;
        let edgesToLayout = edges;

        // If filtering by visibility
        if (scope === 'VISIBLE' && flowWrapper.current) {
            const { x, y, zoom } = getViewport();
            const { width, height } = flowWrapper.current.getBoundingClientRect();

            // Calculate visible bounds (world coordinates)
            const minX = -x / zoom;
            const minY = -y / zoom;
            const maxX = minX + width / zoom;
            const maxY = minY + height / zoom;

            nodesToLayout = nodes.filter(node => {
                const nodeX = node.position.x;
                const nodeY = node.position.y;
                const nodeW = (node.width || 200);
                const nodeH = (node.height || 100);

                // Simple intersection check
                return (
                    nodeX < maxX &&
                    nodeX + nodeW > minX &&
                    nodeY < maxY &&
                    nodeY + nodeH > minY
                );
            });

            const nodeIds = new Set(nodesToLayout.map(n => n.id));
            edgesToLayout = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
        }

        if (nodesToLayout.length === 0) {
            alert("화면에 정렬할 테이블이 없습니다.");
            setIsLayoutMenuOpen(false);
            return;
        }

        const { nodes: layoutedNodes } = getLayoutedElements(
            nodesToLayout,
            edgesToLayout,
            direction
        );

        let finalNodes = layoutedNodes;

        // If we only laid out a subset, we need to position them relative to where they were,
        // essentially centering the new group in the bounding box of the old group.
        if (scope === 'VISIBLE') {
            const getBounds = (nodeList: Node[]) => {
                if (nodeList.length === 0) return { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                nodeList.forEach(n => {
                    minX = Math.min(minX, n.position.x);
                    minY = Math.min(minY, n.position.y);
                    maxX = Math.max(maxX, n.position.x + (n.width || 0));
                    maxY = Math.max(maxY, n.position.y + (n.height || 0));
                });
                return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
            };

            const oldBounds = getBounds(nodesToLayout);
            const newBounds = getBounds(layoutedNodes);

            const dx = oldBounds.cx - newBounds.cx;
            const dy = oldBounds.cy - newBounds.cy;

            finalNodes = layoutedNodes.map(n => ({
                ...n,
                position: {
                    x: n.position.x + dx,
                    y: n.position.y + dy
                }
            }));
        }

        // Merge updated nodes back into the main list
        const newAllNodes = nodes.map(node => {
            const updated = finalNodes.find(n => n.id === node.id);
            return updated ? updated : node;
        });

        const newAllEdges = edges.map(edge => {
            const updated = (edgesToLayout as Edge[]).find(e => e.id === edge.id);
            // Note: getLayoutedElements returns edges, but typically dagre doesn't change edges unless purely routing points (which dagre doesn't do for reactflow simple edges usually).
            // But we should use the returned edges just in case.
            return updated ? updated : edge;
        });

        setNodes(newAllNodes);
        setEdges(newAllEdges);

        // Sync with store
        const updatedEntities = entities.map(entity => {
            const layoutNode = finalNodes.find(n => n.id === entity.id);
            if (layoutNode) {
                return { ...entity, position: layoutNode.position };
            }
            return entity;
        });

        importData({
            entities: updatedEntities,
            relationships: relationships
        });


        // Broadcast Batch Move
        finalNodes.forEach(node => {
            sendOperation({
                type: 'ENTITY_MOVE',
                targetId: node.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: { position: node.position }
            });
        });

        setIsLayoutMenuOpen(false);
    }, [nodes, edges, entities, relationships, setNodes, setEdges, importData, getViewport, sendOperation, user]);

    const onForceLayout = useCallback(() => {
        const { nodes: layoutedNodes } = getForceLayoutedElements(nodes, edges);

        setNodes(layoutedNodes);

        // Sync with store
        const updatedEntities = entities.map(entity => {
            const layoutNode = layoutedNodes.find(n => n.id === entity.id);
            if (layoutNode) {
                return { ...entity, position: layoutNode.position };
            }
            return entity;
        });

        importData({
            entities: updatedEntities,
            relationships: relationships
        });

        // Broadcast Batch Move
        layoutedNodes.forEach(node => {
            sendOperation({
                type: 'ENTITY_MOVE',
                targetId: node.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: { position: node.position }
            });
        });

        setIsLayoutMenuOpen(false);
    }, [nodes, edges, entities, relationships, setNodes, importData, sendOperation, user]);

    const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
        // Update local
        updateEntity(node.id, { position: node.position }, user);

        // Broadcast
        sendOperation({
            type: 'ENTITY_MOVE',
            targetId: node.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: { position: node.position }
        });
    }, [updateEntity, user, sendOperation]);

    if (currentProjectId && !isSynced) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50">
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
                <p className="text-gray-500 font-medium">서버와 동기화 중...</p>
            </div>
        );
    }

    return (
        <div className="flex w-full h-screen overflow-hidden bg-gray-50">
            {/* Left Sidebar wrapper with transition */}
            <div className="relative flex h-full">
                <div
                    className={`h-full transition-all duration-300 ease-in-out border-r border-gray-200 overflow-hidden bg-white shadow-xl ${isSidebarOpen ? 'w-72 flex-shrink-0' : 'w-0 border-none'
                        }`}
                >
                    <div className="w-72 h-full">
                        <Sidebar />
                    </div>
                </div>

                {/* Attached Toggle Button */}
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className={`absolute top-1/2 -translate-y-1/2 z-30 w-5 h-12 bg-white rounded-r-lg shadow-md border border-l-0 border-gray-200 text-gray-400 hover:text-blue-500 hover:w-6 transition-all active:scale-95 flex items-center justify-center ${isSidebarOpen ? '-right-5' : 'left-0'
                        }`}
                    title={isSidebarOpen ? "사이드바 닫기" : "사이드바 열기"}
                >
                    {isSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                </button>
            </div>

            {/* Main Canvas Area */}
            <div className="flex-1 h-full relative" ref={flowWrapper}>
                {/* Toolbar */}
                <div className={`absolute top-4 ${isSidebarOpen ? 'left-6' : 'left-8'} z-10 bg-white/80 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 p-1.5 flex gap-1.5 transition-all duration-300`}>
                    <button
                        onClick={() => setCurrentProject(null)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95"
                        title="프로젝트 목록으로 돌아가기"
                    >
                        <Home size={16} className="text-blue-500" />
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
                            className="text-xs font-mono font-bold text-gray-700 hover:text-blue-600 transition-colors text-left"
                        >
                            {currentProject?.id}
                        </button>
                    </div>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1 self-center" />

                    <button
                        onClick={handleAddEntity}
                        className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-bold shadow-md hover:shadow-lg active:scale-95"
                    >
                        <Plus size={16} />
                        테이블 추가
                    </button>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1 self-center" />

                    <div className="relative">
                        <button
                            onClick={() => setIsLayoutMenuOpen(!isLayoutMenuOpen)}
                            className="flex items-center gap-2 px-3.5 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95"
                        >
                            <Layout size={16} className="text-orange-500" />
                            <span>정렬</span>
                            <ChevronDown size={14} className={`text-gray-400 transition-transform ${isLayoutMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isLayoutMenuOpen && (
                            <div className="absolute top-full lg:left-0 right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-200">
                                <button
                                    onClick={() => onLayout('TB')}
                                    className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors text-left"
                                >
                                    <ArrowRight size={16} className="text-green-500" />
                                    <span>가로 정렬 (기본)</span>
                                </button>
                                <button
                                    onClick={() => onLayout('LR')}
                                    className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors text-left"
                                >
                                    <ArrowDown size={16} className="text-blue-500" />
                                    <span>세로 정렬</span>
                                </button>
                                <div className="h-[1px] bg-gray-100 my-1" />
                                <button
                                    onClick={() => onLayout('TB', 'VISIBLE')}
                                    className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors text-left"
                                >
                                    <Frame size={16} className="text-purple-500" />
                                    <span>화면 내 가로 정렬</span>
                                </button>
                                <button
                                    onClick={() => onLayout('LR', 'VISIBLE')}
                                    className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors text-left"
                                >
                                    <Frame size={16} className="text-orange-500" />
                                    <span>화면 내 세로 정렬</span>
                                </button>
                                <div className="h-[1px] bg-gray-100 my-1" />
                                <button
                                    onClick={onForceLayout}
                                    className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors text-left"
                                >
                                    <Zap size={16} className="text-yellow-500" />
                                    <span>자동 분산 정렬 (Force)</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1 self-center" />

                    <div className="flex bg-gray-50/50 rounded-lg border border-gray-100 p-0.5">
                        <button
                            onClick={undo}
                            disabled={!canUndo}
                            className={`p-2 rounded-md transition-all ${canUndo ? 'text-gray-700 hover:bg-white hover:shadow-sm active:scale-95' : 'text-gray-200 cursor-not-allowed'}`}
                            title="Undo (Cmd+Z)"
                        >
                            <Undo2 size={18} />
                        </button>
                        <div className="w-[1px] h-4 bg-gray-200 self-center mx-0.5" />
                        <button
                            onClick={redo}
                            disabled={!canRedo}
                            className={`p-2 rounded-md transition-all ${canRedo ? 'text-gray-700 hover:bg-white hover:shadow-sm active:scale-95' : 'text-gray-200 cursor-not-allowed'}`}
                            title="Redo (Cmd+Shift+Z)"
                        >
                            <Redo2 size={18} />
                        </button>
                    </div>

                    {/* 5. 툴바의 Undo/Redo 버튼 옆에 히스토리 버튼 배치 */}
                    <button
                        onClick={() => setIsHistoryModalOpen(true)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95"
                        title="변경 이력 보기"
                    >
                        <History size={16} className="text-blue-500" />
                        <span>히스토리</span>
                    </button>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1 self-center" />

                    <div className="relative">
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 px-3.5 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95"
                        >
                            <Upload size={16} className="text-green-500" />
                            <span>내보내기</span>
                            <ChevronDown size={14} className={`text-gray-400 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isExportMenuOpen && (
                            <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-200">
                                <button
                                    onClick={handleExportJSON}
                                    className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors text-left"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500">
                                        <span className="text-[10px] font-bold">JSON</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold">JSON으로 내보내기</span>
                                        <span className="text-[10px] text-gray-400">프로젝트 데이터 원본</span>
                                    </div>
                                </button>
                                <button
                                    onClick={handleExportSQL}
                                    className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors text-left"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-500">
                                        <span className="text-[10px] font-bold">SQL</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold">SQL DDL로 내보내기</span>
                                        <span className="text-[10px] text-gray-400">DDL 스크립트 (.sql)</span>
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="flex items-center gap-2 px-3.5 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95"
                    >
                        <Download size={16} className="text-purple-500" />
                        가져오기
                    </button>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1 self-center" />

                    {/* Online Users */}
                    <div className="flex items-center gap-2 px-1">
                        <OnlineUsers />
                    </div>

                    <div className="w-[1px] h-8 bg-gray-200 mx-1 self-center" />

                    {/* User Profile & Logout */}
                    <div className="flex items-center gap-2 px-1">
                        <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                            {user?.picture ? (
                                <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full border border-white shadow-sm" />
                            ) : (
                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
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
                </div> {/* This closes the toolbar div from line 481 */}

                {/* React Flow Canvas */}
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onConnectStart={onConnectStart}
                    onConnectEnd={onConnectEnd}
                    onReconnect={onReconnect}
                    onReconnectStart={onReconnectStart}
                    onReconnectEnd={onReconnectEnd}
                    isValidConnection={isValidConnection}
                    onEdgeDoubleClick={onEdgeDoubleClick}
                    onNodeDragStop={onNodeDragStop}
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
                    onPaneMouseMove={onPaneMouseMove}
                >
                    <UserCursorsLayer />
                    <Controls />
                    <MiniMap
                        nodeColor={() => '#3b82f6'}
                        className="!bg-white !border-2 !border-gray-100 !rounded-xl !shadow-lg"
                    />
                    <Background
                        variant={BackgroundVariant.Dots}
                        gap={20}
                        size={1.5}
                        color="#84878bff"
                    />
                </ReactFlow>

                {/* Modals */}
                {isImportModalOpen && (
                    <ImportModal onClose={() => setIsImportModalOpen(false)} />
                )}

                {isHistoryModalOpen && (
                    <HistoryModal
                        isOpen={isHistoryModalOpen}
                        onClose={() => setIsHistoryModalOpen(false)}
                    />
                )}

                {editingRelationship && (
                    <EdgeEditModal
                        relationship={editingRelationship}
                        sourceEntityName={entities.find(e => e.id === editingRelationship.source)?.name || 'Unknown'}
                        targetEntityName={entities.find(e => e.id === editingRelationship.target)?.name || 'Unknown'}
                        onSave={(updated) => updateRelationship(updated.id, updated, user)}
                        onDelete={() => {
                            deleteRelationship(editingRelationship.id, user);
                            setEditingRelationship(null);
                        }}
                        onClose={() => setEditingRelationship(null)}
                    />
                )}
            </div>
        </div>
    );
};

const ERDCanvas: React.FC = () => {
    return (
        <ReactFlowProvider>
            <ERDCanvasContent />
        </ReactFlowProvider>
    );
};

export default ERDCanvas;
