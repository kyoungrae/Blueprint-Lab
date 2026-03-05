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
    reconnectEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';

import EntityNode from './EntityNode';
import ERDEdge from './ERDEdge';
import EdgeEditModal from './EdgeEditModal';
import ImportModal from './ImportModal';
import Sidebar from './Sidebar';
import HistoryModal from './HistoryModal';
import { useERDStore } from '../store/erdStore';
import { type Relationship, type Section } from '../types/erd';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';
import { useSyncStore } from '../store/syncStore';
import { OnlineUsers, UserCursors } from './collaboration';
import PremiumTooltip from './screenNode/PremiumTooltip';
import { Plus, Download, Upload, ChevronLeft, ChevronRight, LogOut, User as UserIcon, Home, Layout, ArrowDown, ArrowRight, ChevronDown, Frame, Zap, Undo2, Redo2, History, Square } from 'lucide-react';
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
        sections = [],
        addEntity,
        updateEntity,
        deleteEntity,
        addRelationship,
        updateRelationship,
        deleteRelationship,
        addSection,
        updateSection,
        deleteSection,
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
    const { projects, currentProjectId, setCurrentProject, updateProjectData, fetchProjects } = useProjectStore();

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
    const [isSectionDrawMode, setIsSectionDrawMode] = useState(false);
    const [sectionDrag, setSectionDrag] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
    const [sectionMoveState, setSectionMoveState] = useState<{
        sectionId: string;
        startFlow: { x: number; y: number };
        startSectionPosition: { x: number; y: number };
        startEntityPositions: Record<string, { x: number; y: number }>;
    } | null>(null);
    const [sectionResizeState, setSectionResizeState] = useState<{
        sectionId: string;
        handle: string;
        startFlow: { x: number; y: number };
        startPosition: { x: number; y: number };
        startSize: { width: number; height: number };
    } | null>(null);
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [editingSectionName, setEditingSectionName] = useState('');
    const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
    const flowWrapper = React.useRef<HTMLDivElement>(null);
    const paneContainerRef = React.useRef<HTMLDivElement>(null);
    const sectionHeadersContainerRef = React.useRef<HTMLDivElement>(null);
    const { getViewport, setViewport, screenToFlowPosition, flowToScreenPosition, getNodes } = useReactFlow();
    const { x: viewportX, y: viewportY, zoom: viewportZoom } = useViewport();

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
            const existingNames = new Set((sections as Section[]).map((s) => s.name ?? baseName));
            let name = baseName;
            if (existingNames.has(baseName)) {
                let n = 1;
                while (existingNames.has(`${baseName} ${n}`)) n++;
                name = `${baseName} ${n}`;
            }
            addSection({
                id: `section_${Date.now()}`,
                name,
                position: { x, y },
                size: { width, height },
            });
            setSectionDrag(null);
            setIsSectionDrawMode(false);
        },
        [sectionDrag, sections, addSection]
    );
    const onSectionOverlayMouseLeave = useCallback(() => {
        if (sectionDrag) setSectionDrag(null);
    }, [sectionDrag]);

    const MIN_SECTION_SIZE = 50;

    // 섹션 드래그: 이동 시 하위 엔티티 함께 이동
    const onSectionBodyMouseDown = useCallback(
        (e: React.MouseEvent, sectionId: string) => {
            if (e.button !== 0 || sectionResizeState || editingSectionId) return;
            e.stopPropagation();
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const sec = (sections as Section[]).find((s) => s.id === sectionId);
            if (!sec) return;
            const startEntityPositions: Record<string, { x: number; y: number }> = {};
            entities.filter((ent) => ent.sectionId === sectionId).forEach((ent) => {
                startEntityPositions[ent.id] = { ...ent.position };
            });
            setSectionMoveState({
                sectionId,
                startFlow: pos,
                startSectionPosition: { ...sec.position },
                startEntityPositions,
            });
        },
        [screenToFlowPosition, sectionResizeState, editingSectionId, sections, entities]
    );

    // 섹션 리사이즈 핸들 mousedown
    const onSectionResizeMouseDown = useCallback(
        (e: React.MouseEvent, sectionId: string, handle: string) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            const sec = (sections as Section[]).find((s) => s.id === sectionId);
            if (!sec) return;
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            setSectionResizeState({
                sectionId,
                handle,
                startFlow: pos,
                startPosition: { ...sec.position },
                startSize: { ...sec.size },
            });
        },
        [sections, screenToFlowPosition]
    );

    useEffect(() => {
        if (!sectionMoveState) return;
        const { sectionId, startFlow, startSectionPosition, startEntityPositions } = sectionMoveState;
        const onMove = (e: MouseEvent) => {
            const cur = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const dx = cur.x - startFlow.x;
            const dy = cur.y - startFlow.y;
            updateSection(sectionId, {
                position: { x: startSectionPosition.x + dx, y: startSectionPosition.y + dy },
            });
            Object.entries(startEntityPositions).forEach(([entId, pos]) => {
                updateEntity(entId, {
                    position: { x: pos.x + dx, y: pos.y + dy },
                }, user);
            });
        };
        const onUp = () => setSectionMoveState(null);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [sectionMoveState, updateSection, updateEntity, user, screenToFlowPosition]);

    useEffect(() => {
        if (!sectionResizeState) return;
        const sec = (sections as Section[]).find((s) => s.id === sectionResizeState.sectionId);
        if (!sec) return;

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
            updateSection(sectionResizeState.sectionId, { position: { x, y }, size: { width: w, height: h } });
        };
        const onUp = () => setSectionResizeState(null);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [sectionResizeState, sections, updateSection, screenToFlowPosition]);

    const startEditingSectionName = useCallback((section: Section) => {
        setEditingSectionId(section.id);
        setEditingSectionName(section.name ?? '');
    }, []);
    const saveSectionName = useCallback(
        (sectionId: string) => {
            const trimmed = editingSectionName.trim();
            if (trimmed) updateSection(sectionId, { name: trimmed });
            setEditingSectionId(null);
            setEditingSectionName('');
        },
        [editingSectionName, updateSection]
    );

    // 섹션 제목/X 버튼 위에서 휠: 브라우저 동작 차단 + 캔버스와 동일하게 휠=패닝, Ctrl/Cmd+휠=마우스 위치 기준 줌
    React.useLayoutEffect(() => {
        const container = sectionHeadersContainerRef.current;
        const paneEl = paneContainerRef.current;
        if (!container || !paneEl || sections.length === 0) return;
        const headers = container.querySelectorAll('[data-section-header]');
        const MIN_ZOOM = 0.05;
        const MAX_ZOOM = 4;
        const handler = (e: Event) => {
            const we = e as WheelEvent;
            e.preventDefault();
            const { x, y, zoom } = getViewport();
            const isZoom = we.ctrlKey || we.metaKey;
            if (isZoom) {
                const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.pow(2, -we.deltaY / 200)));
                const rect = paneEl.getBoundingClientRect();
                const paneX = we.clientX - rect.left;
                const paneY = we.clientY - rect.top;
                const newX = paneX - (paneX - x) * (nextZoom / zoom);
                const newY = paneY - (paneY - y) * (nextZoom / zoom);
                setViewport({ x: newX, y: newY, zoom: nextZoom });
            } else {
                setViewport({ x: x - we.deltaX, y: y - we.deltaY, zoom });
            }
        };
        const opts: AddEventListenerOptions = { passive: false, capture: true };
        headers.forEach((el) => el.addEventListener('wheel', handler, opts));
        return () => headers.forEach((el) => el.removeEventListener('wheel', handler, opts));
    }, [sections.length, sections, getViewport, setViewport]);

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
            // #region agent log
            fetch('http://127.0.0.1:7788/ingest/b67387ba-eb25-4cfc-be0f-3dc7938c6bf2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9b5a26'},body:JSON.stringify({sessionId:'9b5a26',location:'ERDCanvas.tsx:state_sync',message:'state_sync received',data:{sectionsLen:state.sections?.length??-1},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
            // #endregion
            console.log('Applying synced state:', state);
            importData(state);
        };

        window.addEventListener('erd:state_sync', handleStateSync as EventListener);
        return () => window.removeEventListener('erd:state_sync', handleStateSync as EventListener);
    }, [importData]);


    // For remote projects: fetch latest from server on mount so we get sections (rehydrated state may be stale)
    useEffect(() => {
        if (currentProjectId && !currentProjectId.startsWith('local_') && typeof fetchProjects === 'function') {
            // #region agent log
            fetch('http://127.0.0.1:7788/ingest/b67387ba-eb25-4cfc-be0f-3dc7938c6bf2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9b5a26'},body:JSON.stringify({sessionId:'9b5a26',location:'ERDCanvas.tsx:fetchEffect',message:'calling fetchProjects',data:{currentProjectId},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
            // #endregion
            fetchProjects();
        }
    }, [currentProjectId, fetchProjects]);

    // Initial load: restore ERD state from project data (local from persist, remote from fetchProjects)
    // Only re-run when switching project (currentProjectId/currentProject.id) or when projects list is first populated.
    // Do NOT depend on currentProject.updatedAt or currentProject.data — that would re-run after our own auto-save and cause an infinite loop with mergeData/importData.
    useEffect(() => {
        if (currentProjectId && currentProject?.data) {
            const d = currentProject.data as import('../types/erd').ERDState;
            importData({
                entities: d.entities ?? [],
                relationships: d.relationships ?? [],
                sections: d.sections ?? [],
                history: d.history ?? [],
            });
        }
    }, [currentProjectId, currentProject?.id, importData, projects.length]);

    // Auto-save ERDStore (entities, relationships, sections) to ProjectStore
    // - Local: persist to localStorage via projectStore
    // - Remote: PATCH to server so refresh/state_sync restores sections
    useEffect(() => {
        if (!currentProjectId) return;
        const timer = setTimeout(() => {
            updateProjectData(currentProjectId, {
                entities,
                relationships,
                sections,
            });
        }, 300); // 300ms debounce
        return () => clearTimeout(timer);
    }, [entities, relationships, sections, currentProjectId, updateProjectData]);

    // Save immediately when sections change (so refresh before debounce doesn't lose sections)
    const prevSectionsRef = React.useRef(sections);
    useEffect(() => {
        if (!currentProjectId) return;
        if (prevSectionsRef.current !== sections) {
            prevSectionsRef.current = sections;
            updateProjectData(currentProjectId, {
                entities,
                relationships,
                sections,
            });
        }
    }, [sections, currentProjectId, entities, relationships, updateProjectData]);

    // Flush save on page unload (refresh/close) so sections aren't lost when user refreshes before debounce
    useEffect(() => {
        const flush = () => {
            const pid = useProjectStore.getState().currentProjectId;
            if (!pid) return;
            const { entities: e, relationships: r, sections: s } = useERDStore.getState();
            useProjectStore.getState().updateProjectData(pid, { entities: e, relationships: r, sections: s ?? [] }, true);
        };
        window.addEventListener('beforeunload', flush);
        window.addEventListener('pagehide', flush);
        return () => {
            window.removeEventListener('beforeunload', flush);
            window.removeEventListener('pagehide', flush);
        };
    }, []);

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
                const selectedEdges = edges.filter(e => e.selected);

                if (selectedNodes.length > 0 || selectedEdges.length > 0) {
                    e.preventDefault();
                    if (selectedNodes.length > 0) {
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

                    if (selectedEdges.length > 0) {
                        if (window.confirm(`${selectedEdges.length}개의 관계를 삭제하시겠습니까?`)) {
                            selectedEdges.forEach(edge => {
                                deleteRelationship(edge.id, user);
                                sendOperation({
                                    type: 'RELATIONSHIP_DELETE',
                                    targetId: edge.id,
                                    userId: user?.id || 'anonymous',
                                    userName: user?.name || 'Anonymous',
                                    payload: {}
                                });
                            });
                        }
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
    }, [undo, redo, deleteEntity, deleteRelationship, edges, sendOperation, user, getNodes]);

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
            animated: false,
            reconnectable: true,
            hidden: rel.id === reconnectingEdgeId,
            interactionWidth: 40,
            style: { stroke: getRelColor(rel.type), strokeWidth: 2, strokeDasharray: 'none' },
            data: {
                color: getRelColor(rel.type),
                type: rel.type,
                sourceEnd: rel.sourceEnd,
                targetEnd: rel.targetEnd,
            },
        }));
        setEdges(flowEdges);
    }, [relationships, setEdges, reconnectingEdgeId]);

    const isValidConnection = useCallback((connection: Connection) => {
        return connection.source !== connection.target;
    }, []);

    const onConnectStart = useCallback((_event: any, _params: any) => {
        // Optional: Add logging or other start/drag logic if needed
    }, []);

    const onConnect = useCallback(
        (connection: Connection) => {
            if (connection.source && connection.target && connection.source !== connection.target) {
                // Check if relationship exists (bi-directional check for ERD)
                const existingRel = relationships.find(r =>
                    (r.source === connection.source && r.target === connection.target) ||
                    (r.source === connection.target && r.target === connection.source)
                );

                if (existingRel) {
                    // MOVE/UPDATE existing relationship instead of creating duplicate
                    const updates = {
                        sourceHandle: connection.sourceHandle || undefined,
                        targetHandle: connection.targetHandle || undefined,
                    };
                    updateRelationship(existingRel.id, updates, user);

                    sendOperation({
                        type: 'RELATIONSHIP_UPDATE',
                        targetId: existingRel.id,
                        userId: user?.id || 'anonymous',
                        userName: user?.name || 'Anonymous',
                        payload: updates as unknown as Record<string, unknown>
                    });
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
        [reconnectingEdgeId, addRelationship, updateRelationship, relationships, user, sendOperation]
    );

    const onConnectEnd = useCallback(() => {
        // Delay clearing to allow onConnect to catch it
        setTimeout(() => {
            setReconnectingEdgeId(null);
        }, 100);
    }, []);

    const onEdgeUpdateStart = useCallback((_: any, edge: Edge) => {
        setReconnectingEdgeId(edge.id);
    }, []);

    const onEdgeUpdate = useCallback(
        (oldEdge: Edge, newConnection: Connection) => {
            const updates = {
                source: newConnection.source || oldEdge.source,
                target: newConnection.target || oldEdge.target,
                sourceHandle: newConnection.sourceHandle || undefined,
                targetHandle: newConnection.targetHandle || undefined,
            };

            updateRelationship(oldEdge.id, updates, user);

            sendOperation({
                type: 'RELATIONSHIP_UPDATE',
                targetId: oldEdge.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: updates as unknown as Record<string, unknown>
            });

            setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
            setReconnectingEdgeId(null);
        },
        [updateRelationship, user, sendOperation, setEdges]
    );

    const onEdgeUpdateEnd = useCallback((_: any, _edge: Edge) => {
        // If edge was dragged but not connected to a new node, snap back
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
            isLocked: true,
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

    const onNodeDragStop = useCallback(
        (_: React.MouseEvent, node: Node) => {
            const nodeCenter = {
                x: node.position.x + (typeof node.width === 'number' ? node.width : 200) / 2,
                y: node.position.y + (typeof node.height === 'number' ? node.height : 100) / 2,
            };
            const sectionList = sections as Section[];
            const containingSection = sectionList.find(
                (s) =>
                    nodeCenter.x >= s.position.x &&
                    nodeCenter.x <= s.position.x + s.size.width &&
                    nodeCenter.y >= s.position.y &&
                    nodeCenter.y <= s.position.y + s.size.height
            );
            const sectionId = containingSection?.id ?? undefined;
            updateEntity(node.id, { position: node.position, sectionId: sectionId || null }, user);

            sendOperation({
                type: 'ENTITY_MOVE',
                targetId: node.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: { position: node.position, sectionId: sectionId ?? null },
            });
        },
        [updateEntity, user, sendOperation, sections]
    );

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
            {/* Left Sidebar wrapper with transition (반응형: 화면 설계와 동일) */}
            <div className="relative flex h-full min-w-0">
                <div
                    className={`relative h-full transition-all duration-300 ease-in-out border-r border-gray-200 overflow-hidden bg-white shadow-xl z-[10001] ${isSidebarOpen ? 'w-56 sm:w-64 md:w-72 flex-shrink-0' : 'w-0 border-none'}`}
                >
                    <div className="w-56 sm:w-64 md:w-72 h-full min-w-0">
                        <Sidebar />
                    </div>
                </div>

                {/* Attached Toggle Button */}
                <PremiumTooltip placement="bottom" offsetBottom={20} label={isSidebarOpen ? "사이드바 닫기" : "사이드바 열기"}>
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className={`absolute top-1/2 -translate-y-1/2 z-30 w-5 h-12 bg-white rounded-r-lg shadow-md border border-l-0 border-gray-200 text-gray-400 hover:text-blue-500 hover:w-6 transition-all active:scale-95 flex items-center justify-center ${isSidebarOpen ? '-right-5' : 'left-0'
                            }`}
                    >
                        {isSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                    </button>
                </PremiumTooltip>
            </div>

            {/* Main Canvas Area - pr-4 pt-4 prevents edge/handle clipping at boundaries */}
            <div className="flex-1 min-w-0 h-full relative select-none pr-4 pt-4 pb-4 pl-4" ref={flowWrapper}>
                {/* Toolbar (반응형: 화면 설계와 동일) */}
                <div className={`absolute top-4 right-4 z-[10001] bg-white/80 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 p-2 flex flex-wrap items-center gap-2 max-w-[calc(100%-2rem)] ${isSidebarOpen ? 'left-6' : 'left-4'} transition-all duration-300`}>
                    <PremiumTooltip placement="bottom" offsetBottom={30} label="프로젝트 목록으로 돌아가기">
                        <button
                            onClick={() => setCurrentProject(null)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95 shrink-0"
                        >
                            <Home size={16} className="text-blue-500 shrink-0" />
                        </button>
                    </PremiumTooltip>

                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                    <PremiumTooltip placement="bottom" offsetBottom={30} label="클릭하여 ID 복사">
                        <div className="flex flex-col justify-center min-w-0 shrink">
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
                                className="text-xs font-mono font-bold text-gray-700 hover:text-blue-600 transition-colors text-left truncate max-w-[140px] sm:max-w-[180px]"
                            >
                                {currentProject?.id}
                            </button>
                        </div>
                    </PremiumTooltip>

                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                    <PremiumTooltip placement="bottom" offsetBottom={30} label="테이블 추가">
                        <button
                            onClick={handleAddEntity}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-bold shadow-md hover:shadow-lg active:scale-95 shrink-0"
                        >
                            <Plus size={16} className="shrink-0" />
                            <span className="whitespace-nowrap hidden sm:inline">테이블 추가</span>
                        </button>
                    </PremiumTooltip>

                    <PremiumTooltip placement="bottom" offsetBottom={30} label={isSectionDrawMode ? '캔버스에서 영역을 드래그해 섹션을 만드세요' : '섹션 추가'}>
                        <button
                            onClick={() => setIsSectionDrawMode((v) => !v)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm font-bold shadow-md shrink-0 ${isSectionDrawMode ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
                        >
                            <Square size={16} className="shrink-0" />
                            <span className="whitespace-nowrap hidden sm:inline">섹션 추가</span>
                        </button>
                    </PremiumTooltip>

                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                    <div className="relative shrink-0">
                        <PremiumTooltip placement="bottom" offsetBottom={30} label="노드 정렬">
                            <button
                                onClick={() => setIsLayoutMenuOpen(!isLayoutMenuOpen)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95"
                            >
                                <Layout size={16} className="text-orange-500 shrink-0" />
                                <span className="whitespace-nowrap hidden sm:inline">정렬</span>
                                <ChevronDown size={14} className={`text-gray-400 transition-transform shrink-0 ${isLayoutMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </PremiumTooltip>

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

                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                    <div className="flex bg-gray-50/50 rounded-lg border border-gray-100 p-0.5 shrink-0">
                        <PremiumTooltip placement="bottom" offsetBottom={30} label="Undo (Cmd+Z)">
                            <button
                                onClick={undo}
                                disabled={!canUndo}
                                className={`p-2 rounded-md transition-all ${canUndo ? 'text-gray-700 hover:bg-white hover:shadow-sm active:scale-95' : 'text-gray-200 cursor-not-allowed'}`}
                            >
                                <Undo2 size={18} />
                            </button>
                        </PremiumTooltip>
                        <div className="w-[1px] h-4 bg-gray-200 self-center mx-0.5" />
                        <PremiumTooltip placement="bottom" offsetBottom={30} label="Redo (Cmd+Shift+Z)">
                            <button
                                onClick={redo}
                                disabled={!canRedo}
                                className={`p-2 rounded-md transition-all ${canRedo ? 'text-gray-700 hover:bg-white hover:shadow-sm active:scale-95' : 'text-gray-200 cursor-not-allowed'}`}
                            >
                                <Redo2 size={18} />
                            </button>
                        </PremiumTooltip>
                    </div>

                    {/* 5. 툴바의 Undo/Redo 버튼 옆에 히스토리 버튼 배치 */}
                    <PremiumTooltip placement="bottom" offsetBottom={30} label="변경 이력 보기">
                        <button
                            onClick={() => setIsHistoryModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95 shrink-0"
                        >
                            <History size={16} className="text-blue-500 shrink-0" />
                            <span className="whitespace-nowrap hidden sm:inline">히스토리</span>
                        </button>
                    </PremiumTooltip>

                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                    <div className="relative shrink-0">
                        <PremiumTooltip placement="bottom" offsetBottom={30} label="JSON/SQL 내보내기">
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95"
                            >
                                <Upload size={16} className="text-green-500 shrink-0" />
                                <span className="whitespace-nowrap hidden sm:inline">내보내기</span>
                                <ChevronDown size={14} className={`text-gray-400 transition-transform shrink-0 ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </PremiumTooltip>

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

                    <PremiumTooltip placement="bottom" offsetBottom={30} label="JSON 가져오기">
                        <button
                            onClick={() => setIsImportModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95 shrink-0"
                        >
                            <Download size={16} className="text-purple-500 shrink-0" />
                            <span className="whitespace-nowrap hidden sm:inline">가져오기</span>
                        </button>
                    </PremiumTooltip>

                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                    {/* Online Users */}
                    <div className="flex items-center gap-2 px-1 shrink-0">
                        <OnlineUsers />
                    </div>

                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                    {/* User Profile & Logout */}
                    <div className="flex items-center gap-2 px-1 shrink-0">
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
                        <PremiumTooltip placement="bottom" offsetBottom={30} label="로그아웃">
                            <button
                                onClick={() => {
                                    if (window.confirm('로그아웃 하시겠습니까?')) {
                                        setCurrentProject(null);
                                        logout();
                                    }
                                }}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all active:scale-95"
                            >
                                <LogOut size={18} />
                            </button>
                        </PremiumTooltip>
                    </div>
                </div> {/* This closes the toolbar div from line 481 */}

                {/* 1) React Flow Canvas - z-[10]으로 섹션 배경(z-[1])보다 위에 그려서 엔티티 색상이 섹션 채움에 틴트되지 않음 */}
                <div className="absolute inset-0 z-[10]" ref={paneContainerRef}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onConnectStart={onConnectStart}
                    onConnectEnd={onConnectEnd}
                    onEdgeUpdate={onEdgeUpdate}
                    onEdgeUpdateStart={onEdgeUpdateStart}
                    onEdgeUpdateEnd={onEdgeUpdateEnd}
                    edgeUpdaterRadius={20}
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
                    fitViewOptions={{ padding: 0.25 }}
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
                </div>

                {/* 2a) 섹션 배경만 - 노드 뒤(z-[1])에 그려서 엔티티 색상이 가려지지 않음 */}
                {sections.length > 0 && (
                    <div
                        className="absolute inset-0 z-[1] overflow-visible pointer-events-none"
                        style={{
                            transform: `translate(${viewportX}px, ${viewportY}px) scale(${viewportZoom})`,
                            transformOrigin: '0 0',
                        }}
                    >
                        {(sections as Section[]).map((s) => (
                            <div
                                key={s.id}
                                className={`absolute border-2 border-blue-400/80 bg-blue-400/5 rounded-lg transition-shadow duration-200 ${hoveredSectionId === s.id ? 'shadow-xl ring-2 ring-blue-400/40' : 'shadow-none'}`}
                                style={{
                                    left: s.position.x,
                                    top: s.position.y,
                                    width: s.size.width,
                                    height: s.size.height,
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* 2b) 섹션 제목 바 + 리사이즈 핸들만 노드 위(z-[15])에 그리기 - 드래그/리사이즈 가능 */}
                {sections.length > 0 && (
                    <div
                        ref={sectionHeadersContainerRef}
                        className="absolute inset-0 z-[15] overflow-visible pointer-events-none"
                        style={{
                            transform: `translate(${viewportX}px, ${viewportY}px) scale(${viewportZoom})`,
                            transformOrigin: '0 0',
                        }}
                    >
                        {(sections as Section[]).map((s) => {
                            const isEditing = editingSectionId === s.id;
                            const HANDLE_SIZE = 8;
                            const w = s.size.width;
                            const h = s.size.height;
                            const handles: { key: string; cursor: string; left: number; top: number }[] = [
                                { key: 'nw', cursor: 'nwse-resize', left: 0, top: 0 },
                                { key: 'n', cursor: 'ns-resize', left: w / 2, top: 0 },
                                { key: 'ne', cursor: 'nesw-resize', left: w, top: 0 },
                                { key: 'e', cursor: 'ew-resize', left: w, top: h / 2 },
                                { key: 'se', cursor: 'nwse-resize', left: w, top: h },
                                { key: 's', cursor: 'ns-resize', left: w / 2, top: h },
                                { key: 'sw', cursor: 'nesw-resize', left: 0, top: h },
                                { key: 'w', cursor: 'ew-resize', left: 0, top: h / 2 },
                            ];
                            return (
                                <div
                                    key={s.id}
                                    className="absolute pointer-events-none"
                                    style={{
                                        left: s.position.x,
                                        top: s.position.y,
                                        width: s.size.width,
                                        height: s.size.height,
                                    }}
                                >
                                    <div
                                        data-section-header
                                        className="flex items-center h-14 min-h-14 px-2 rounded-t-md bg-blue-400/15 border-b border-blue-400/30 cursor-grab active:cursor-grabbing pointer-events-auto"
                                        onMouseDown={(ev) => onSectionBodyMouseDown(ev, s.id)}
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
                                                    if (e.key === 'Escape') {
                                                        setEditingSectionId(null);
                                                        setEditingSectionName('');
                                                    }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="flex-1 min-w-0 bg-white/90 border border-blue-300 rounded px-1.5 py-0.5 text-xs font-semibold text-gray-800 outline-none focus:ring-1 focus:ring-blue-400"
                                                autoFocus
                                            />
                                        ) : (
                                            <span
                                                className="text-xl font-semibold text-gray-700 truncate flex-1 min-w-0"
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation();
                                                    startEditingSectionName(s);
                                                }}
                                            >
                                                {s.name || 'Section'}
                                            </span>
                                        )}
                                        <PremiumTooltip placement="bottom" offsetBottom={30} label="섹션 삭제">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    deleteSection(s.id);
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="shrink-0 w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/20 text-gray-500 hover:text-red-600 transition-colors"
                                                >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                            </button>
                                        </PremiumTooltip>
                                    </div>
                                    {handles.map((handle) => (
                                        <div
                                            key={handle.key}
                                            className="absolute bg-blue-500 border border-white rounded-sm shadow cursor-pointer hover:bg-blue-600 z-10 pointer-events-auto"
                                            style={{
                                                left: handle.left,
                                                top: handle.top,
                                                width: HANDLE_SIZE,
                                                height: HANDLE_SIZE,
                                                transform: 'translate(-50%, -50%)',
                                                cursor: handle.cursor,
                                            }}
                                            onMouseDown={(ev) => onSectionResizeMouseDown(ev, s.id, handle.key)}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* 3) 섹션 그리기 오버레이 (영역 지정 시에만) */}
                {isSectionDrawMode && (
                    <div
                        className="absolute inset-0 z-[100] cursor-crosshair"
                        onMouseDown={onSectionOverlayMouseDown}
                        onMouseMove={onSectionOverlayMouseMove}
                        onMouseUp={onSectionOverlayMouseUp}
                        onMouseLeave={onSectionOverlayMouseLeave}
                    >
                        {sectionDrag && flowWrapper.current && (() => {
                            const a = flowToScreenPosition(sectionDrag.start);
                            const b = flowToScreenPosition(sectionDrag.current);
                            const r = flowWrapper.current.getBoundingClientRect();
                            const left = Math.min(a.x, b.x) - r.left;
                            const top = Math.min(a.y, b.y) - r.top;
                            const width = Math.max(1, Math.abs(b.x - a.x));
                            const height = Math.max(1, Math.abs(b.y - a.y));
                            return (
                                <div
                                    className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none"
                                    style={{ left, top, width, height }}
                                />
                            );
                        })()}
                    </div>
                )}

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
                        onSave={(updated) => {
                            updateRelationship(updated.id, updated, user);
                            sendOperation({
                                type: 'RELATIONSHIP_UPDATE',
                                targetId: updated.id,
                                userId: user?.id || 'anonymous',
                                userName: user?.name || 'Anonymous',
                                payload: updated as unknown as Record<string, unknown>,
                            });
                        }}
                        onDelete={() => {
                            deleteRelationship(editingRelationship.id, user);
                            sendOperation({
                                type: 'RELATIONSHIP_DELETE',
                                targetId: editingRelationship.id,
                                userId: user?.id || 'anonymous',
                                userName: user?.name || 'Anonymous',
                                payload: {},
                            });
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
