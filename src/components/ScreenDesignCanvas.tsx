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
    useViewport,
    reconnectEdge,
} from 'reactflow';

const SECTION_HANDLE_SIZE = 8;
interface SectionOverlayLayerProps {
    sections: ScreenSection[];
    hoveredSectionId: string | null;
    setHoveredSectionId: (id: string | null) => void;
    editingSectionId: string | null;
    editingSectionName: string;
    setEditingSectionName: (s: string) => void;
    setEditingSectionId: (id: string | null) => void;
    startEditingSectionName: (section: ScreenSection) => void;
    saveSectionName: (sectionId: string) => void;
    deleteSection: (id: string) => void;
    onSectionBodyMouseDown: (e: React.MouseEvent, sectionId: string) => void;
    onSectionResizeMouseDown: (e: React.MouseEvent, sectionId: string, handle: string) => void;
    sectionHeadersContainerRef: React.RefObject<HTMLDivElement | null>;
}
const SectionOverlayLayer: React.FC<SectionOverlayLayerProps> = (props) => {
    const { x, y, zoom } = useViewport();
    const {
        sections,
        hoveredSectionId,
        setHoveredSectionId,
        editingSectionId,
        editingSectionName,
        setEditingSectionName,
        setEditingSectionId,
        startEditingSectionName,
        saveSectionName,
        deleteSection,
        onSectionBodyMouseDown,
        onSectionResizeMouseDown,
        sectionHeadersContainerRef,
    } = props;
    if (sections.length === 0) return null;
    const transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    return (
        <>
            <div
                className="absolute inset-0 z-[1] overflow-visible pointer-events-none"
                style={{ transform, transformOrigin: '0 0' }}
            >
                {sections.map((s) => (
                    <div
                        key={s.id}
                        className={`absolute border-2 border-violet-400/80 bg-violet-400/5 rounded-lg transition-shadow duration-200 ${hoveredSectionId === s.id ? 'shadow-xl ring-2 ring-violet-400/40' : 'shadow-none'}`}
                        style={{ left: s.position.x, top: s.position.y, width: s.size.width, height: s.size.height }}
                    />
                ))}
            </div>
            <div
                ref={sectionHeadersContainerRef}
                className="absolute inset-0 z-[15] overflow-visible pointer-events-none"
                style={{ transform, transformOrigin: '0 0' }}
            >
                {sections.map((s) => {
                    const isEditing = editingSectionId === s.id;
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
                            style={{ left: s.position.x, top: s.position.y, width: s.size.width, height: s.size.height }}
                        >
                            <div
                                data-section-header
                                className="flex items-center h-14 min-h-14 px-2 rounded-t-md bg-violet-400/15 border-b border-violet-400/30 cursor-grab active:cursor-grabbing pointer-events-auto"
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
                                        className="flex-1 min-w-0 bg-white/90 border border-violet-300 rounded px-1.5 py-0.5 text-xs font-semibold text-gray-800 outline-none focus:ring-1 focus:ring-violet-400"
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
                                        <X size={18} />
                                    </button>
                                </PremiumTooltip>
                            </div>
                            {handles.map((handle) => (
                                <div
                                    key={handle.key}
                                    className="absolute bg-violet-500 border border-white rounded-sm shadow cursor-pointer hover:bg-violet-600 z-10 pointer-events-auto"
                                    style={{
                                        left: handle.left,
                                        top: handle.top,
                                        width: SECTION_HANDLE_SIZE,
                                        height: SECTION_HANDLE_SIZE,
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
        </>
    );
};
import 'reactflow/dist/style.css';

import ScreenNode from './ScreenNode';
import SpecNode from './SpecNode';
import ScreenEdge from './ScreenEdge';
import ScreenSidebar from './ScreenSidebar';
import ScreenExportModal from './ScreenExportModal';
import AddScreenModal from './AddScreenModal';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';
import type { Screen, ScreenSection, PageSizeOption, PageOrientation } from '../types/screenDesign';
import PremiumTooltip from './screenNode/PremiumTooltip';
import { getCanvasDimensions } from '../types/screenDesign';
import {
    Plus, Download, Upload, ChevronLeft, ChevronRight, LogOut, User as UserIcon, Home, FileText, X, ArrowLeft, Undo2, Redo2, Square
} from 'lucide-react';
import { ScreenDesignUndoRedoProvider, useScreenDesignUndoRedo } from '../contexts/ScreenDesignUndoRedoContext';
import { RecentTextColorsProvider } from '../contexts/RecentTextColorsContext';
import { RecentStyleColorsProvider } from '../contexts/RecentStyleColorsContext';
import { copyToClipboard } from '../utils/clipboard';
import { syncComponentStyles } from '../utils/componentStyleSync';
import { OnlineUsers, UserCursors } from './collaboration';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useSyncStore } from '../store/syncStore';
import { setLastRemoteUpdateScreenId } from '../store/screenUndoRemoteFlag';
import type { ExportFormat } from './ScreenExportModal';

const nodeTypes: NodeTypes = {
    screen: ScreenNode,
    spec: SpecNode,
};

const edgeTypes = {
    screenEdge: ScreenEdge,
};

import { ExportModeContext } from '../contexts/ExportModeContext';

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
const ScreenDesignCanvasContent: React.FC = () => {
    const {
        screens, flows, sections,
        addScreen, updateScreen, deleteScreen,
        addFlow, updateFlow, deleteFlow,
        addSection, updateSection, deleteSection,
        importData
    } = useScreenDesignStore();

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

    const { projects, currentProjectId, setCurrentProject, updateProjectData, fetchProjects } = useProjectStore();
    const currentProject = projects.find(p => p.id === currentProjectId);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isAddScreenModalOpen, setIsAddScreenModalOpen] = useState(false);
    const [isAddSpecModalOpen, setIsAddSpecModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const flowWrapper = useRef<HTMLDivElement>(null);
    const sectionHeadersContainerRef = useRef<HTMLDivElement>(null);
    const { getNodes, fitView, screenToFlowPosition, flowToScreenPosition, getViewport, setViewport } = useReactFlow();

    const [isSectionDrawMode, setIsSectionDrawMode] = useState(false);
    const [sectionDrag, setSectionDrag] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
    const [sectionMoveState, setSectionMoveState] = useState<{
        sectionId: string;
        startFlow: { x: number; y: number };
        startSectionPosition: { x: number; y: number };
        startScreenPositions: Record<string, { x: number; y: number }>;
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

    // Broadcast cursor position (ERD와 동일)
    const onPaneMouseMove = useCallback((event: React.MouseEvent) => {
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        updateCursor({ ...position });
    }, [screenToFlowPosition, updateCursor]);

    const MIN_SECTION_SIZE = 50;
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
            const existingNames = new Set(sections.map((s) => s.name ?? baseName));
            let name = baseName;
            if (existingNames.has(baseName)) {
                let n = 1;
                while (existingNames.has(`${baseName} ${n}`)) n++;
                name = `${baseName} ${n}`;
            }
            const sectionId = `section_${Date.now()}`;
            addSection({ id: sectionId, name, position: { x, y }, size: { width, height } });
            setSectionDrag(null);
            setIsSectionDrawMode(false);
            // 드래그 영역 안에 있는 화면 노드는 해당 섹션에 포함
            const nodes = getNodes();
            nodes.forEach((node) => {
                if (node.type !== 'screen' && node.type !== 'spec') return;
                const nw = typeof node.width === 'number' ? node.width : 200;
                const nh = typeof node.height === 'number' ? node.height : 100;
                const cx = node.position.x + nw / 2;
                const cy = node.position.y + nh / 2;
                if (cx >= x && cx <= x + width && cy >= y && cy <= y + height) {
                    updateScreen(node.id, { sectionId });
                    sendOperation({
                        type: 'SCREEN_MOVE',
                        targetId: node.id,
                        userId: user?.id || 'anonymous',
                        userName: user?.name || 'Anonymous',
                        payload: { sectionId },
                    });
                }
            });
        },
        [sectionDrag, sections, addSection, getNodes, updateScreen, sendOperation, user]
    );
    const onSectionOverlayMouseLeave = useCallback(() => {
        if (sectionDrag) setSectionDrag(null);
    }, [sectionDrag]);

    const onSectionBodyMouseDown = useCallback(
        (e: React.MouseEvent, sectionId: string) => {
            if (e.button !== 0 || sectionResizeState || editingSectionId) return;
            e.stopPropagation();
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const sec = sections.find((s) => s.id === sectionId);
            if (!sec) return;
            const startScreenPositions: Record<string, { x: number; y: number }> = {};
            screens.filter((sc) => sc.sectionId === sectionId).forEach((sc) => {
                startScreenPositions[sc.id] = { ...sc.position };
            });
            setSectionMoveState({
                sectionId,
                startFlow: pos,
                startSectionPosition: { ...sec.position },
                startScreenPositions,
            });
        },
        [screenToFlowPosition, sectionResizeState, editingSectionId, sections, screens]
    );

    const onSectionResizeMouseDown = useCallback(
        (e: React.MouseEvent, sectionId: string, handle: string) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            const sec = sections.find((s) => s.id === sectionId);
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
        const { sectionId, startFlow, startSectionPosition, startScreenPositions } = sectionMoveState;
        const onMove = (e: MouseEvent) => {
            const cur = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const dx = cur.x - startFlow.x;
            const dy = cur.y - startFlow.y;
            updateSection(sectionId, {
                position: { x: startSectionPosition.x + dx, y: startSectionPosition.y + dy },
            });
            Object.entries(startScreenPositions).forEach(([screenId, pos]) => {
                updateScreen(screenId, { position: { x: pos.x + dx, y: pos.y + dy } });
            });
        };
        const onUp = () => setSectionMoveState(null);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [sectionMoveState, updateSection, updateScreen, screenToFlowPosition]);

    useEffect(() => {
        if (!sectionResizeState) return;
        const sec = sections.find((s) => s.id === sectionResizeState.sectionId);
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

    const startEditingSectionName = useCallback((section: ScreenSection) => {
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
                '[data-style-panel], [data-layer-panel], [data-table-panel], [data-image-style-panel], [data-table-picker-portal], [data-table-list-portal], [data-grid-panel], [data-component-picker-portal], [data-text-style-toolbar], [data-font-style-panel], .floating-panel'
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

    // 섹션 제목/삭제 버튼 위에서 휠: 브라우저 줌 차단 + 캔버스와 동일하게 휠=패닝, Ctrl/Cmd+휠=줌
    React.useLayoutEffect(() => {
        const container = sectionHeadersContainerRef.current;
        const paneEl = flowWrapper.current;
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
                const deltaNormalize = we.deltaMode === 1 ? 20 : 1;
                setViewport({ x: x - we.deltaX * deltaNormalize * 0.5, y: y - we.deltaY * deltaNormalize * 0.5, zoom });
            }
        };
        const opts: AddEventListenerOptions = { passive: false, capture: true };
        headers.forEach((el) => el.addEventListener('wheel', handler, opts));
        return () => headers.forEach((el) => el.removeEventListener('wheel', handler, opts));
    }, [sections.length, getViewport, setViewport]);

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

    // 연결된 컴포넌트 프로젝트 최신 데이터 확보 (스타일 동기화용)
    useEffect(() => {
        const linkedId = currentProject?.linkedComponentProjectId;
        if (!linkedId) return;
        fetchProjects();
        const onFocus = () => fetchProjects();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [currentProject?.linkedComponentProjectId, fetchProjects]);

    // 컴포넌트 스타일 동기화: 연결된 컴포넌트 프로젝트의 스타일 변경을 화면 설계에 반영
    useEffect(() => {
        const linkedId = currentProject?.linkedComponentProjectId;
        if (!linkedId || !screens.length) return;

        const linkedProject = projects.find((p) => p.id === linkedId);
        const compData = linkedProject?.data as { components?: Screen[] } | undefined;
        const components = compData?.components ?? [];
        const hasRefs = screens.some((s) =>
            (s.drawElements ?? []).some((e) => e.fromComponentId && e.fromElementId)
        );
        if (!components.length) return;
        if (!hasRefs) return;

        const updates = syncComponentStyles(screens, components);
        if (updates.size === 0) return;

        updates.forEach((drawElements, screenId) => {
            updateScreen(screenId, { drawElements });
            sendOperation({
                type: 'SCREEN_UPDATE',
                targetId: screenId,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: { drawElements },
            });
        });
    }, [screens, projects, currentProject, updateScreen, sendOperation, user]);

    // Auto-save to ProjectStore (로컬: 주기적 저장, 원격: 섹션 포함해 PATCH 전송)
    useEffect(() => {
        if (!currentProjectId) return;
        const timer = setTimeout(() => {
            updateProjectData(currentProjectId, {
                screens,
                flows,
                sections,
            });
        }, currentProjectId.startsWith('local_') ? 1000 : 500);
        return () => clearTimeout(timer);
    }, [screens, flows, sections, currentProjectId, updateProjectData]);

    // Unmount 시 현재 스토어 기준으로 즉시 저장 (격자 이동 등 직후 새로고침해도 유지)
    useEffect(() => {
        const projectId = currentProjectId;
        return () => {
            if (projectId) {
                const { screens: scr, flows: flw, sections: sec } = useScreenDesignStore.getState();
                const { updateProjectData: save } = useProjectStore.getState();
                save(projectId, { screens: scr, flows: flw, sections: sec });
            }
        };
    }, [currentProjectId]);

    // Sync screens → ReactFlow nodes (캔버스 70% 반영하여 entity 크기 계산, getCanvasDimensions 단일 소스)
    const computeNodeStyle = (screen: Screen): React.CSSProperties | undefined => {
        const MIN_CANVAS_WIDTH = 794; // A4 너비 - 이하일 때만 스케일
        const CANVAS_WIDTH_RATIO = 0.7;
        const FIXED_TOP_HEIGHT = 180;
        let { width: canvasW, height: canvasH } = getCanvasDimensions(screen);
        if (canvasW < MIN_CANVAS_WIDTH) {
            const scale = MIN_CANVAS_WIDTH / canvasW;
            canvasW = MIN_CANVAS_WIDTH;
            canvasH = Math.round(canvasH * scale);
        }
        const width = Math.ceil(canvasW / CANVAS_WIDTH_RATIO);
        const height = canvasH + FIXED_TOP_HEIGHT;
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
                                const { screens: scr, flows: flw } = useScreenDesignStore.getState();
                                useProjectStore.getState().updateProjectData(pid, { screens: scr, flows: flw }, true);
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
        const handleSync = (e: CustomEvent) => {
            const { screens, flows } = e.detail;
            // Always import if data is provided, even if empty
            if (screens || flows) {
                const localScreens = useScreenDesignStore.getState().screens || [];

                // sync 데이터와 로컬 데이터 병합: 로컬에 guideLines 등이 더 많으면 보존
                const mergedScreens = (screens || []).map((syncScr: any) => {
                    const localScr = localScreens.find((ls: any) => ls.id === syncScr.id);
                    if (!localScr) return syncScr;
                    const merged: any = { ...syncScr };
                    const syncGuideCount = (syncScr.guideLines?.vertical?.length ?? 0) + (syncScr.guideLines?.horizontal?.length ?? 0);
                    const localGuideCount = (localScr.guideLines?.vertical?.length ?? 0) + (localScr.guideLines?.horizontal?.length ?? 0);
                    if (localGuideCount > syncGuideCount) {
                        merged.guideLines = localScr.guideLines;
                        merged.guideLinesVisible = localScr.guideLinesVisible;
                        merged.guideLinesLocked = localScr.guideLinesLocked;
                    }
                    if ((localScr.drawElements?.length ?? 0) > (syncScr.drawElements?.length ?? 0)) {
                        merged.drawElements = localScr.drawElements;
                    }
                    return merged;
                });

                const syncSections = (e.detail as any).sections;
                importData({ screens: mergedScreens, flows: flows || [], sections: Array.isArray(syncSections) ? syncSections : [] });
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
                if (op.type === 'SCREEN_CREATE') addScreen(op.payload as any);
                else if (op.type === 'SCREEN_UPDATE' || op.type === 'SCREEN_MOVE') {
                    setLastRemoteUpdateScreenId(op.targetId);
                    updateScreen(op.targetId, op.payload as any);
                }
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
    }, [importData, addScreen, updateScreen, deleteScreen, addFlow, updateFlow, deleteFlow, user]);

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
        addScreen(newScreen);

        sendOperation({
            type: 'SCREEN_CREATE',
            targetId: newScreen.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: newScreen as unknown as Record<string, unknown>
        });
    }, [screens, addScreen, currentProject, user, sendOperation]);

    const handleAddSpecClick = useCallback(() => {
        setIsAddSpecModalOpen(true);
    }, []);

    const handleAddSpecConfirm = useCallback((pageSize: PageSizeOption, pageOrientation: PageOrientation) => {
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
        const { width: imageWidth, height: imageHeight } = getCanvasDimensions({
            pageSize,
            pageOrientation: pageOrientation || 'portrait',
        } as Screen);

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
            pageSize,
            pageOrientation,
            imageWidth,
            imageHeight,
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

    const onNodeDragStop = useCallback(
        (_: React.MouseEvent, node: RFNode) => {
            const nodeWidth = typeof node.width === 'number' ? node.width : 200;
            const nodeHeight = typeof node.height === 'number' ? node.height : 100;
            const nodeCenter = {
                x: node.position.x + nodeWidth / 2,
                y: node.position.y + nodeHeight / 2,
            };
            const containingSection = sections.find(
                (s) =>
                    nodeCenter.x >= s.position.x &&
                    nodeCenter.x <= s.position.x + s.size.width &&
                    nodeCenter.y >= s.position.y &&
                    nodeCenter.y <= s.position.y + s.size.height
            );
            const sectionId = containingSection?.id ?? undefined;
            updateScreen(node.id, { position: node.position, sectionId: sectionId ?? undefined });

            sendOperation({
                type: 'SCREEN_MOVE',
                targetId: node.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: { position: node.position, sectionId: sectionId ?? undefined },
            });
        },
        [updateScreen, sendOperation, user, sections]
    );

    const handleExportImage = useCallback((selectedIds: string[], format: ExportFormat) => {
        setIsExportModalOpen(false);

        const element = document.querySelector('.react-flow') as HTMLElement;
        if (!element) {
            alert('캔버스를 찾을 수 없습니다.');
            return;
        }

        const selectedSet = new Set(selectedIds);

        const baseOptions = {
            backgroundColor: 'transparent',
            quality: 1,
            pixelRatio: 1.5,
            cacheBust: true,
            imagePlaceholder: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23f3f4f6" width="100" height="100"/%3E%3Ctext x="50" y="55" fill="%239ca3af" font-size="12" text-anchor="middle"%3E?%3C/text%3E%3C/svg%3E',
        };

        const doCapture = (opts: { filter?: (node: HTMLElement) => boolean }) =>
            toPng(element, { ...baseOptions, ...opts });

        const filterWithSelection = (filterSet: Set<string>) => (node: HTMLElement) => {
            const excludeSelectors = [
                '.react-flow__controls',
                '.react-flow__minimap',
                '.react-flow__background',
                '.react-flow__panel',
                '.react-flow__edges',
                '.react-flow__edgelabel-renderer',
                '.react-flow__handle',
            ];
            if (excludeSelectors.some(sel => node.closest?.(sel))) return false;
            if (node.classList?.contains('react-flow__node')) {
                const id = node.getAttribute?.('data-id');
                return id ? filterSet.has(id) : false;
            }
            return true;
        };

        const fallbackFilter = (node: HTMLElement) => {
            const excludeSelectors = [
                '.react-flow__controls',
                '.react-flow__minimap',
                '.react-flow__background',
                '.react-flow__panel',
                '.react-flow__edges',
                '.react-flow__edgelabel-renderer',
                '.react-flow__handle',
            ];
            return !excludeSelectors.some(sel => node.closest?.(sel));
        };

        setIsExporting(true);

        const runExport = () => {
            if (format === 'pdf') {
                // PDF: 각 화면을 별도 페이지로
                const doc = new jsPDF({ unit: 'mm', format: 'a4' });
                const pageW = 210;
                const pageH = 297;
                const margin = 10;
                const usableW = pageW - margin * 2;
                const usableH = pageH - margin * 2;

                const captureNext = (index: number): Promise<void> => {
                    if (index >= selectedIds.length) {
                        doc.save(`screen-design-${Date.now()}.pdf`);
                        setIsExporting(false);
                        return Promise.resolve();
                    }
                    const id = selectedIds[index];
                    try {
                        fitView({
                            nodes: [{ id }],
                            padding: 0.15,
                            duration: 0,
                            includeHiddenNodes: false,
                        });
                    } catch (_) { /* ignore */ }

                    return new Promise<void>((resolve, reject) => {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                setTimeout(() => {
                                    const singleSet = new Set([id]);
                                    doCapture({ filter: filterWithSelection(singleSet) })
                                        .then((dataUrl) => {
                                            const img = new Image();
                                            img.onload = () => {
                                                const imgW = img.naturalWidth;
                                                const imgH = img.naturalHeight;
                                                const ratio = imgW / imgH;
                                                let w = usableW;
                                                let h = usableW / ratio;
                                                if (h > usableH) {
                                                    h = usableH;
                                                    w = usableH * ratio;
                                                }
                                                const x = margin + (usableW - w) / 2;
                                                const y = margin + (usableH - h) / 2;
                                                if (index > 0) doc.addPage();
                                                doc.addImage(dataUrl, 'PNG', x, y, w, h);
                                                captureNext(index + 1).then(resolve).catch(reject);
                                            };
                                            img.onerror = () => reject(new Error('Image load failed'));
                                            img.src = dataUrl;
                                        })
                                        .catch(() =>
                                            doCapture({ filter: fallbackFilter })
                                                .then((dataUrl) => {
                                                    const img = new Image();
                                                    img.onload = () => {
                                                        const imgW = img.naturalWidth;
                                                        const imgH = img.naturalHeight;
                                                        const ratio = imgW / imgH;
                                                        let w = usableW;
                                                        let h = usableW / ratio;
                                                        if (h > usableH) {
                                                            h = usableH;
                                                            w = usableH * ratio;
                                                        }
                                                        const x = margin + (usableW - w) / 2;
                                                        const y = margin + (usableH - h) / 2;
                                                        if (index > 0) doc.addPage();
                                                        doc.addImage(dataUrl, 'PNG', x, y, w, h);
                                                        captureNext(index + 1).then(resolve).catch(reject);
                                                    };
                                                    img.onerror = () => reject(new Error('Image load failed'));
                                                    img.src = dataUrl;
                                                })
                                                .catch(reject)
                                        );
                                }, 100);
                            });
                        });
                    });
                };

                captureNext(0).catch((err: unknown) => {
                    console.error('PDF export failed:', err);
                    alert('PDF 내보내기에 실패했습니다.');
                    setIsExporting(false);
                });
                return;
            }

            // PNG: 선택된 노드만 보이도록 뷰 맞춤 후 단일 이미지
            try {
                fitView({
                    nodes: selectedIds.map(id => ({ id })),
                    padding: 0.15,
                    duration: 0,
                    includeHiddenNodes: false,
                });
            } catch (_) { /* ignore */ }

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const downloadPng = (dataUrl: string) => {
                            const link = document.createElement('a');
                            link.download = `screen-design-${Date.now()}.png`;
                            link.href = dataUrl;
                            link.click();
                        };

                        doCapture({ filter: filterWithSelection(selectedSet) })
                            .then(downloadPng)
                            .catch(() =>
                                doCapture({ filter: fallbackFilter })
                                    .then(downloadPng)
                                    .catch(() =>
                                        doCapture({})
                                            .then(downloadPng)
                                            .catch((err: unknown) => {
                                                console.error('Export failed:', err);
                                                alert('이미지 내보내기에 실패했습니다.');
                                            })
                                    )
                            )
                            .finally(() => setIsExporting(false));
                    }, 100);
                });
            });
        };

        runExport();
    }, [fitView]);

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
        <ScreenDesignUndoRedoProvider>
            <RecentTextColorsProvider>
            <RecentStyleColorsProvider>
            <ExportModeContext.Provider value={isExporting}>
                <div className="flex w-full h-screen overflow-hidden bg-gray-50">
                    <div className="relative flex h-full min-w-0">
                        <div
                            className={`relative h-full transition-all duration-300 ease-in-out border-r border-gray-200 overflow-hidden bg-white shadow-xl z-[10001] ${isSidebarOpen ? 'w-56 sm:w-64 md:w-72 flex-shrink-0' : 'w-0 border-none'}`}
                        >
                            <div className="w-56 sm:w-64 md:w-72 h-full min-w-0">
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

                    <div className="flex-1 min-w-0 h-full relative" ref={flowWrapper}>
                        <div className={`absolute top-4 right-4 z-[10001] bg-white/80 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 p-2 flex flex-wrap items-center gap-2 max-w-[calc(100%-2rem)] ${isSidebarOpen ? 'left-6' : 'left-4'} transition-all duration-300`}>
                            <PremiumTooltip placement="bottom" offsetBottom={30} label="프로젝트 목록으로 돌아가기">
                                <button
                                    onClick={() => setCurrentProject(null)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95 shrink-0"
                                >
                                    <Home size={16} className="text-violet-500 shrink-0" />
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
                            <PremiumTooltip placement="bottom" offsetBottom={30} label="화면 추가">
                                <button
                                    onClick={handleAddScreenClick}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-all text-sm font-bold shadow-md hover:shadow-lg active:scale-95 shrink-0"
                                >
                                    <Plus size={16} className="shrink-0" />
                                    <span className="whitespace-nowrap">화면 추가</span>
                                </button>
                            </PremiumTooltip>
                            <PremiumTooltip placement="bottom" offsetBottom={30} label="명세 추가">
                                <button
                                    onClick={handleAddSpecClick}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-bold shadow-md hover:shadow-lg active:scale-95 shrink-0"
                                >
                                    <FileText size={16} className="shrink-0" />
                                    <span className="whitespace-nowrap hidden sm:inline">명세 추가</span>
                                </button>
                            </PremiumTooltip>

                            <PremiumTooltip placement="bottom" offsetBottom={30} label={isSectionDrawMode ? '캔버스에서 영역을 드래그해 섹션을 만드세요' : '섹션 추가'}>
                                <button
                                    onClick={() => setIsSectionDrawMode((v) => !v)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm font-bold shadow-md shrink-0 ${isSectionDrawMode ? 'bg-violet-600 text-white ring-2 ring-violet-300' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <Square size={16} className="shrink-0" />
                                    <span className="whitespace-nowrap hidden sm:inline">섹션 추가</span>
                                </button>
                            </PremiumTooltip>

                            <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                            <ToolbarUndoRedo />

                            <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                            <PremiumTooltip placement="bottom" offsetBottom={30} label="내보내기">
                                <button
                                    onClick={() => setIsExportModalOpen(true)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95 shrink-0"
                                >
                                    <Upload size={16} className="text-green-500 shrink-0" />
                                    <span className="whitespace-nowrap hidden sm:inline">내보내기</span>
                                </button>
                            </PremiumTooltip>

                            <PremiumTooltip placement="bottom" offsetBottom={30} label="가져오기">
                                <button
                                    disabled
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-400 border border-gray-200 rounded-lg text-sm font-bold shadow-sm cursor-not-allowed opacity-60 shrink-0"
                                    title="가져오기 기능 준비중"
                                >
                                    <Download size={16} className="text-gray-400 shrink-0" />
                                    <span className="whitespace-nowrap hidden sm:inline">가져오기</span>
                                </button>
                            </PremiumTooltip>

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
                                        <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 shrink-0">
                                            <UserIcon size={14} />
                                        </div>
                                    )}
                                    <span className="text-sm font-bold text-gray-700 truncate max-w-[80px] sm:max-w-none">{user?.name}</span>
                                </div>
                                <PremiumTooltip placement="bottom" offsetBottom={30} label="로그아웃">
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
                            <SectionOverlayLayer
                                sections={sections}
                                hoveredSectionId={hoveredSectionId}
                                setHoveredSectionId={setHoveredSectionId}
                                editingSectionId={editingSectionId}
                                editingSectionName={editingSectionName}
                                setEditingSectionName={setEditingSectionName}
                                setEditingSectionId={setEditingSectionId}
                                startEditingSectionName={startEditingSectionName}
                                saveSectionName={saveSectionName}
                                deleteSection={deleteSection}
                                onSectionBodyMouseDown={onSectionBodyMouseDown}
                                onSectionResizeMouseDown={onSectionResizeMouseDown}
                                sectionHeadersContainerRef={sectionHeadersContainerRef}
                            />
                            <UserCursorsLayer />
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

                        {/* 섹션 그리기 오버레이 (영역 지정 시에만) */}
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
                                            className="absolute border-2 border-violet-500 bg-violet-500/10 pointer-events-none"
                                            style={{ left, top, width, height }}
                                        />
                                    );
                                })()}
                            </div>
                        )}

                        {/* 그리기 도구 팝업 포털 - 상단 메뉴바/사이드바(z-10001) 아래에 렌더링 */}
                        <div id="panel-portal-root" className="fixed inset-0 z-[9000] pointer-events-none [&>*]:pointer-events-auto" aria-hidden="true" />

                        {isExportModalOpen && (
                            <ScreenExportModal
                                screens={screens}
                                onExport={handleExportImage}
                                onClose={() => setIsExportModalOpen(false)}
                            />
                        )}

                        {isAddScreenModalOpen && (
                            <AddScreenModal
                                onConfirm={handleAddScreenConfirm}
                                onClose={() => setIsAddScreenModalOpen(false)}
                            />
                        )}

                        {isAddSpecModalOpen && (
                            <AddScreenModal
                                variant="spec"
                                onConfirm={handleAddSpecConfirm}
                                onClose={() => setIsAddSpecModalOpen(false)}
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
