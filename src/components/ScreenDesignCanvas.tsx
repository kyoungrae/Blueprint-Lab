import React, { useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
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
    useOnViewportChange,
    reconnectEdge,
} from 'reactflow';

const SECTION_HANDLE_SIZE = 8;
interface SectionOverlayLayerProps {
    sections: ScreenSection[];
    hoveredSectionId: string | null;
    setHoveredSectionId: (id: string | null) => void;
    selectedSectionId: string | null;
    setSelectedSectionId: (id: string | null) => void;
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
    updateSection: (id: string, updates: Partial<ScreenSection>) => void;
    yjsUpdateSection: (id: string, updates: Partial<ScreenSection>) => void;
}



// ── 2. Section Layer ─────────────────────────
const SectionOverlayLayer: React.FC<SectionOverlayLayerProps> = (props) => {
    const layerRef = useRef<HTMLDivElement>(null);
    const [portalTarget, setPortalTarget] = useState<Element | null>(null);
    const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);

    useEffect(() => {
        // 🚀 ReactFlow의 진짜 도화지(줌/팬 엔진) DOM을 찾아냅니다.
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

    const {
        sections, hoveredSectionId, setHoveredSectionId, selectedSectionId, setSelectedSectionId,
        editingSectionId, editingSectionName, setEditingSectionName, setEditingSectionId,
        startEditingSectionName, saveSectionName, deleteSection, onSectionBodyMouseDown,
        onSectionResizeMouseDown, sectionHeadersContainerRef,
    } = props;

    // 도화지가 아직 안 찾아졌거나 섹션이 없으면 렌더링하지 않음
    if (!portalTarget || sections.length === 0) return null;

    // 🚀 도화지 안쪽으로 섹션을 텔레포트 시킵니다!
    return createPortal(
        <div ref={layerRef} style={{ '--zoom': '1' } as React.CSSProperties}>
            {/* 섹션 배경: z-index를 낮게 설정해서 화면 엔티티 뒤에 깔리게 합니다 */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-[-1]">
                {sections.map((s) => (
                    <div
                        key={s.id}
                        className={`absolute border-2 border-violet-400/80 rounded-lg transition-shadow duration-200 ${hoveredSectionId === s.id ? 'shadow-xl ring-2 ring-violet-400/40' : 'shadow-none'}`}
                        style={{ 
                            left: s.position.x, 
                            top: s.position.y, 
                            width: s.size.width, 
                            height: s.size.height,
                            backgroundColor: s.color ? `${s.color}20` : '#e9d5ff20'
                        }}
                    />
                ))}
            </div>

            {/* 섹션 헤더 및 리사이즈 핸들: 마우스로 클릭하고 끌 수 있도록 설정합니다 */}
            <div 
                ref={sectionHeadersContainerRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none z-[15]"
            >
                {sections.map((s) => {
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
                                // 🚀 수정: select-none 클래스 추가
                                className="flex items-center h-14 min-h-14 px-2 rounded-t-md border-b cursor-grab active:cursor-grabbing pointer-events-auto select-none"
                                style={{ 
                                    backgroundColor: s.color ? `${s.color}15` : '#e9d5ff15',
                                    borderColor: s.color ? `${s.color}30` : '#e9d5ff30'
                                }}
                                onMouseDown={(ev) => {
                                    // 🚀 수정: 브라우저 텍스트 드래그 방지
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
                                        className="flex-1 min-w-0 bg-white/90 border border-violet-300 rounded px-1.5 py-0.5 text-xs font-semibold text-gray-800 outline-none focus:ring-1 focus:ring-violet-400"
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
                                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/20 text-gray-500 hover:text-red-600 transition-colors"
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
                                                            props.updateSection(s.id, { color: colorToSet });
                                                            props.yjsUpdateSection(s.id, { color: colorToSet });
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
                                            deleteSection(s.id);
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/20 text-gray-500 hover:text-red-600 transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </PremiumTooltip>
                            </div>
                            
                            {/* 크기 조절 핸들 */}
                            {selectedSectionId === s.id && handles.map((handle) => (
                                <div
                                    key={handle.key}
                                    className="absolute bg-violet-500 border border-white rounded-sm shadow cursor-pointer hover:bg-violet-600 z-10 pointer-events-auto"
                                    style={{
                                        left: handle.left, top: handle.top,
                                        width: SECTION_HANDLE_SIZE, height: SECTION_HANDLE_SIZE,
                                        // 🚀 JavaScript(React) 대신 CSS의 calc() 함수가 직접 계산하게 맡깁니다!
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
import { useDatabasePolling } from '../hooks/useDatabasePolling';
import type { Screen, ScreenFlow, ScreenSection, PageSizeOption, PageOrientation } from '../types/screenDesign';
import PremiumTooltip from './screenNode/PremiumTooltip';
import { getCanvasDimensions } from '../types/screenDesign';
import {
    Plus, Download, Upload, ChevronLeft, ChevronRight, LogOut, User as UserIcon, Home, FileText, X, ArrowLeft, Undo2, Redo2, Square, Edit3, MessageCircle,
    Palette
} from 'lucide-react';
import { ScreenDesignUndoRedoProvider, useScreenDesignUndoRedo } from '../contexts/ScreenDesignUndoRedoContext';
import { RecentTextColorsProvider } from '../contexts/RecentTextColorsContext';
import { RecentStyleColorsProvider } from '../contexts/RecentStyleColorsContext';
import { copyToClipboard } from '../utils/clipboard';
import { syncComponentStyles } from '../utils/componentStyleSync';
import { OnlineUsers, UserCursors } from './collaboration';
import ChatPanel from './ChatPanel';
import { BugReportButton } from './bug/BugReport';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useSyncStore } from '../store/syncStore';
import { useYjsStore } from '../store/yjsStore';

import type { ExportFormat } from './ScreenExportModal';
import PPTBetaExporter from './PPTBetaExporter';

const nodeTypes: NodeTypes = {
    screen: ScreenNode,
    spec: SpecNode,
};

const edgeTypes = {
    screenEdge: ScreenEdge,
};

import { ExportModeContext } from '../contexts/ExportModeContext';

// ── 1. Cursors Layer ─────────────────────────
const UserCursorsLayer: React.FC = () => {
    const [portalTarget, setPortalTarget] = useState<Element | null>(null);

    useEffect(() => {
        // 🚀 ReactFlow의 진짜 도화지(줌/팬 엔진) DOM을 찾아냅니다.
        const target = document.querySelector('.react-flow__viewport');
        setPortalTarget(target);
    }, []);

    if (!portalTarget) return null;

    // 🚀 도화지 안쪽으로 커서를 텔레포트 시킵니다! (이제 좌표 계산이 필요 없습니다)
    return createPortal(
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-50">
            <UserCursors />
        </div>,
        portalTarget
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
        exportData, importData, mergeImportData,
    } = useScreenDesignStore();

    const { user, logout } = useAuthStore();
    const { updateCursor, isSynced, isConnected } = useSyncStore();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
    const [flowLabelComposing, setFlowLabelComposing] = useState<string | null>(null);
    const [reconnectingEdgeId, setReconnectingEdgeId] = useState<string | null>(null);
    useEffect(() => {
        if (!editingFlowId) setFlowLabelComposing(null);
    }, [editingFlowId]);

    const { projects, currentProjectId, setCurrentProject, fetchProjects } = useProjectStore();
    const { 
        addScreen, updateScreen, deleteScreen,
        addFlow, updateFlow, deleteFlow,
        addSection, updateSection, deleteSection,
        joinProject: yjsJoin, leaveProject: yjsLeave, moveScreen: yjsMoveScreen,
        isSynced: yjsIsSynced,
        isConnected: yjsIsConnected,
        wsUrl: yjsWsUrl,
        lastStatus: yjsLastStatus,
        lastError: yjsLastError,
        lastSyncAt: yjsLastSyncAt,
        updateSection: yjsUpdateSection,
        addSection: yjsAddSection,
    } = useYjsStore();
    const currentProject = projects.find(p => p.id === currentProjectId);

    // Yjs가 정상 동기화 중일 때는 폴링을 꺼서 불필요한 대형 상태 갱신을 줄인다.
    useDatabasePolling({
        projectId: currentProjectId || '',
        interval: 5000,
        enabled: Boolean(currentProjectId && !currentProjectId.startsWith('local_') && !yjsIsSynced),
    });
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(280); // Default width in pixels
    const sidebarResizingRef = useRef(false);
    const [sidebarListKey, setSidebarListKey] = useState(0); // 가져오기 후 사이드바 목록 갱신용
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importJsonText, setImportJsonText] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    const [isAddScreenModalOpen, setIsAddScreenModalOpen] = useState(false);
    const [isAddSpecModalOpen, setIsAddSpecModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatActiveTab, setChatActiveTab] = useState<'GLOBAL' | string>('GLOBAL');
    const [chatUnreadTabs, setChatUnreadTabs] = useState<Set<string>>(() => new Set());
    const [pptBetaExportOpen, setPptBetaExportOpen] = useState(false);
    const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
    const flowWrapper = useRef<HTMLDivElement>(null);
    const sectionHeadersContainerRef = useRef<HTMLDivElement>(null);
    const lastSyncedComponentAtRef = useRef<string | null>(null);
    const { getNodes, fitView, screenToFlowPosition, flowToScreenPosition, getViewport, setViewport } = useReactFlow();

    const [isSectionDrawMode, setIsSectionDrawMode] = useState(false);
    const [sectionDrag, setSectionDrag] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
    const [sectionMoveState, setSectionMoveState] = useState<{
        targetSectionIds: string[]; // 🚀 단일 ID가 아닌 이동할 모든 섹션 ID 배열
        startFlow: { x: number; y: number };
        startSectionPositions: Record<string, { x: number; y: number }>; // 🚀 섹션별 시작 위치 매핑
        startScreenPositions: Record<string, { x: number; y: number }>;
    } | null>(null);

    // ── Sidebar Resize Logic ────────────────────────────────────
    const startSidebarResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        sidebarResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!sidebarResizingRef.current) return;
            const newWidth = Math.max(200, Math.min(600, moveEvent.clientX));
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
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

    useEffect(() => {
        const onRemoteChat = (e: Event) => {
            const detail = (e as CustomEvent).detail as { payload?: any };
            const msg = detail?.payload?.chatMessage as { senderId: string; targetId: string | null } | undefined;
            if (!msg) return;
            if (msg.senderId === user?.id) return;

            // Ignore DM messages that are not for me
            if (msg.targetId !== null && msg.targetId !== user?.id) return;

            // GLOBAL: one shared room
            // DM: tab is keyed by the *other user* (sender)
            const tabKey = msg.targetId === null ? 'GLOBAL' : msg.senderId;
            const shouldMarkUnread = !isChatOpen || chatActiveTab !== tabKey;
            if (!shouldMarkUnread) return;

            setChatUnreadTabs((prev) => {
                const next = new Set(prev);
                next.add(tabKey);
                return next;
            });
        };

        window.addEventListener('chat:remote_message', onRemoteChat);
        return () => window.removeEventListener('chat:remote_message', onRemoteChat);
    }, [user?.id, isChatOpen, chatActiveTab]);

    const clearUnreadForTab = (tab: 'GLOBAL' | string) => {
        setChatUnreadTabs((prev) => {
            if (!prev.size) return prev;
            const next = new Set(prev);
            next.delete(tab);
            return next;
        });
    };

    const chatHasUnread = chatUnreadTabs.size > 0;

    // Broadcast cursor position (ERD와 동일하게 throttle)
    const cursorThrottleRef = useRef<number>(0);
    const onPaneMouseMove = useCallback((event: React.MouseEvent) => {
        const now = Date.now();
        if (now - cursorThrottleRef.current < 50) return;
        cursorThrottleRef.current = now;
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
            const cx = x + width / 2;
            const cy = y + height / 2;

            // 🚀 새 섹션을 감싸고 있는 기존 섹션 중 '가장 작은(안쪽에 있는)' 섹션을 부모로 찾습니다.
            const parentSection = sections
                .filter((s) => cx >= s.position.x && cx <= s.position.x + s.size.width && cy >= s.position.y && cy <= s.position.y + s.size.height)
                .sort((a, b) => (a.size.width * a.size.height) - (b.size.width * b.size.height))[0];

            const newSection = { 
                id: sectionId, 
                name, 
                position: { x, y }, 
                size: { width, height }, 
                color: '#e9d5ff',
                parentId: parentSection ? parentSection.id : null // 👈 부모 ID 저장
            };
            addSection(newSection);
            yjsAddSection(newSection);
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
                    // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.
                }
            });
        },
        [sectionDrag, sections, addSection, getNodes, updateScreen]
    );
    const onSectionOverlayMouseLeave = useCallback(() => {
        if (sectionDrag) setSectionDrag(null);
    }, [sectionDrag]);

    const onSectionBodyMouseDown = useCallback(
        (e: React.MouseEvent, sectionId: string) => {
            if (e.button !== 0 || sectionResizeState || editingSectionId) return;
            e.stopPropagation();
            setSelectedSectionId(sectionId);
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const sec = sections.find((s) => s.id === sectionId);
            if (!sec) return;

            // 🚀 1. 이 섹션의 모든 하위 자식(손자 포함) 섹션 ID를 재귀적으로 찾습니다.
            const getDescendantSectionIds = (parentId: string): string[] => {
                const children = sections.filter(s => s.parentId === parentId).map(s => s.id);
                let descendants = [...children];
                children.forEach(childId => {
                    descendants = [...descendants, ...getDescendantSectionIds(childId)];
                });
                return descendants;
            };

            // 나와 나의 모든 하위 섹션 ID들
            const targetSectionIds = [sectionId, ...getDescendantSectionIds(sectionId)];

            // 🚀 2. 이동할 모든 섹션의 시작 위치를 저장합니다.
            const startSectionPositions: Record<string, { x: number; y: number }> = {};
            targetSectionIds.forEach(id => {
                const s = sections.find(sec => sec.id === id);
                if (s) startSectionPositions[id] = { ...s.position };
            });

            // 🚀 3. 이동할 모든 섹션에 포함된 화면 노드들의 시작 위치를 저장합니다.
            const startScreenPositions: Record<string, { x: number; y: number }> = {};
            screens.filter((sc) => sc.sectionId && targetSectionIds.includes(sc.sectionId)).forEach((sc) => {
                startScreenPositions[sc.id] = { ...sc.position };
            });

            setSectionMoveState({
                targetSectionIds,
                startFlow: pos,
                startSectionPositions,
                startScreenPositions,
            });
        },
        [screenToFlowPosition, sectionResizeState, editingSectionId, sections, screens]
    );

    const onSectionResizeMouseDown = useCallback(
        (e: React.MouseEvent, sectionId: string, handle: string) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            setSelectedSectionId(sectionId);
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
        const { targetSectionIds, startFlow, startSectionPositions, startScreenPositions } = sectionMoveState;
        
        const onMove = (e: MouseEvent) => {
            const cur = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            const dx = cur.x - startFlow.x;
            const dy = cur.y - startFlow.y;
            
            // 🚀 1. 모든 타겟 섹션들을 같은 이동 거리(dx, dy)만큼 함께 이동
            targetSectionIds.forEach(id => {
                const startPos = startSectionPositions[id];
                if (startPos) {
                    updateSection(id, { position: { x: startPos.x + dx, y: startPos.y + dy } });
                }
            });
            
            // 🚀 2. 하위 섹션들에 속한 모든 화면 노드들도 함께 이동
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
        const onUp = () => {
            const x = sec.position.x;
            const y = sec.position.y;
            const width = sec.size.width;
            const height = sec.size.height;

            const nodes = getNodes();
            nodes.forEach((node) => {
                if (node.type !== 'screen' && node.type !== 'spec') return;
                const nw = typeof node.width === 'number' ? node.width : 200;
                const nh = typeof node.height === 'number' ? node.height : 100;
                const cx = node.position.x + nw / 2;
                const cy = node.position.y + nh / 2;
                // 리사이즈한 섹션 영역 안에 있는 노드만 소속을 다시 계산 (중첩 시 가장 안쪽 섹션 = onNodeDragStop와 동일)
                if (cx >= x && cx <= x + width && cy >= y && cy <= y + height) {
                    const containingSection = sections
                        .filter(
                            (s) =>
                                cx >= s.position.x &&
                                cx <= s.position.x + s.size.width &&
                                cy >= s.position.y &&
                                cy <= s.position.y + s.size.height
                        )
                        .sort((a, b) => a.size.width * a.size.height - b.size.width * b.size.height)[0];
                    updateScreen(node.id, { sectionId: containingSection?.id });
                    // Yjs CRDT가 자동으로 전파합니다.
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
    }, [sectionResizeState, sections, updateSection, screenToFlowPosition, getNodes, updateScreen]);

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

    // ⚠️ 구 방식: document 전역에 passive:false 등록 → 브라우저 HW 가속 스크롤 비활성화
    // ✅ 신 방식: flowWrapper 컨테이너에만 등록 + 팝업 위에 있을 때만 preventDefault
    useEffect(() => {
        const el = flowWrapper.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            const target = e.target as Element;

            // 폰트 드롭다운: 드롭다운만 스크롤, 캔버스 팝 차단
            const fontDropdown = target?.closest?.('[data-font-dropdown]') as HTMLElement | null;
            if (fontDropdown) {
                e.preventDefault();
                fontDropdown.scrollTop += e.deltaY;
                fontDropdown.scrollLeft += e.deltaX;
                return;
            }

            // 컴포넌트 추가 패널 / 관련 테이블 리스트 등 모달 내부 스크롤
            const scrollablePopup = target?.closest?.('[data-component-picker-portal], [data-table-list-portal]') as HTMLElement | null;
            if (scrollablePopup) {
                e.preventDefault();
                scrollablePopup.scrollTop += e.deltaY;
                scrollablePopup.scrollLeft += e.deltaX;
                return;
            }

            // 팝업(style/layer/table 등) 위에 있을 때만 캔버스 줄/팬으로 로직 적용
            const isOverPopup = target?.closest?.(
                '[data-style-panel], [data-layer-panel], [data-table-panel], [data-image-style-panel], [data-table-picker-portal], [data-table-list-portal], [data-grid-panel], [data-component-picker-portal], [data-text-style-toolbar], [data-font-style-panel], .floating-panel'
            );
            if (!isOverPopup) return; // 팝업 밖 → 터치 안 함, 브라우저 HW 가속 유지

            e.preventDefault();

            // Ctrl/Cmd + wheel: zoom (포인터 앙커 기준으로 x/y 동시 보정)
            if (e.ctrlKey || e.metaKey) {
                const factor = 10;
                const wheelDelta = -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * factor;
                const { x, y, zoom } = getViewport();
                const nextZoom = Math.max(0.05, Math.min(4, zoom * Math.pow(2, wheelDelta)));

                const wrapperRect = el.getBoundingClientRect();
                const px = e.clientX - wrapperRect.left;
                const py = e.clientY - wrapperRect.top;
                const flowX = (px - x) / zoom;
                const flowY = (py - y) / zoom;
                setViewport({ x: px - flowX * nextZoom, y: py - flowY * nextZoom, zoom: nextZoom });
                return;
            }

            // 일반 wheel: pan
            const { x, y, zoom } = getViewport();
            const dn = e.deltaMode === 1 ? 20 : 1;
            setViewport({ x: x - e.deltaX * dn * 0.5, y: y - e.deltaY * dn * 0.5, zoom });
        };

        // 컨테이너에만 passive:false 등록 → 해당 영역 외 스크롤은 브라우저 HW 가속 유지
        el.addEventListener('wheel', handleWheel, { passive: false, capture: false });
        return () => el.removeEventListener('wheel', handleWheel, { capture: false });
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

    // 진입 시 현재 프로젝트 데이터로 스토어 초기화 (로컬 + 원격 공통)
    // 새로고침 시 state_sync 전에 빈 화면이 보이는 것을 방지: persist/fetchProjects 결과로 먼저 채운 뒤,
    // state_sync 도착 시 서버 기준으로 다시 덮어쓴다.
    useEffect(() => {
        if (!currentProjectId || !currentProject) return;

        // 프로젝트 변경 시 이전 데이터 클리어 (새 프로젝트 생성 시 이전 데이터 잔재 방지)
        const { setCanvasClipboard, setGridClipboard, setLastInteractedScreenId } = useScreenDesignStore.getState();
        setCanvasClipboard([]);
        setGridClipboard(null);
        setLastInteractedScreenId(null);

        const data = (currentProject.data as any)?.screens ? currentProject.data : (currentProject as any).screenData;
        if (data && Array.isArray(data.screens)) {
            importData({
                screens: data.screens || [],
                flows: data.flows || [],
                sections: Array.isArray((data as any).sections) ? (data as any).sections : [],
            });
        } else {
            // 새로운 빈 프로젝트의 경우 모든 데이터 클리어
            importData({
                screens: [],
                flows: [],
                sections: [],
            });
        }
    }, [currentProjectId, currentProject?.id, importData]);

    const isConnectedOnSocket = useSyncStore(s => s.isConnected);
    useEffect(() => {
        // 🗑️ 이 블록은 Yjs CRDT와 충돌을 야기하므로 제거됨
        // if (!isConnectedOnSocket && currentProjectId && currentProject?.data) {
        //     const data = (currentProject.data as any)?.screens ? currentProject.data : (currentProject as any).screenData;
        //     if (data && Array.isArray(data.screens)) {
        //         const local = useScreenDesignStore.getState();
        //         const localCount = local.screens.length;
        //         const serverCount = data.screens.length;
        //         if (localCount !== serverCount || (localCount === 0 && serverCount > 0)) {
        //             importData({
        //                 screens: data.screens || [],
        //                 flows: data.flows || [],
        //                 sections: Array.isArray((data as any).sections) ? (data as any).sections : [],
        //             });
        //         }
        //     }
        // }
    }, [isConnectedOnSocket, currentProjectId, currentProject?.data, importData]);

    // 원격 프로젝트: 진입 시 서버에서 최신 데이터 fetch (새로고침 후 복원 시 currentProject.data 보강)
    useEffect(() => {
        if (currentProjectId && !currentProjectId.startsWith('local_') && typeof fetchProjects === 'function') {
            fetchProjects();
        }
    }, [currentProjectId, fetchProjects]);

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
    const linkedComponentProjectId = currentProject?.linkedComponentProjectId;
    const linkedProject = projects.find(p => p.id === linkedComponentProjectId);

    useEffect(() => {
        const linkedId = currentProject?.linkedComponentProjectId;
        const linkedAt = linkedProject?.updatedAt;
        
        // 🚀 핵심 수정: Yjs 데이터 로딩(yjsIsSynced)이 완료되기 전에는 절대 실행하지 않음!
        if (!linkedId || !linkedAt || !yjsIsSynced) return;

        // 이미 동기화한 시점이면 중단 (무한 루프 방지)
        if (lastSyncedComponentAtRef.current === linkedAt) return;

        // 프로젝트 자동 저장 등과 겹치지 않도록 약간의 지연 후 1회 수행
        const timer = setTimeout(() => {
            // screens를 의존성에서 제외하여 로컬 편집 시 즉시 초기화되는 현상 방지.
            // 대신 최신 screens를 스토어에서 직접 가져와 사용한다.
            const currentScreens = useScreenDesignStore.getState().screens;
            if (!currentScreens.length) return;

            // 🚀 수정: 컴포넌트 데이터를 더 안전한 경로로 추출
            const components = (linkedProject?.data as any)?.components || (linkedProject as any)?.componentSnapshot?.components || [];
            if (!components.length) return;

            const hasRefs = currentScreens.some((s) =>
                (s.drawElements ?? []).some((e) => e.fromComponentId && e.fromElementId)
            );
            if (!hasRefs) {
                lastSyncedComponentAtRef.current = linkedAt;
                return;
            }

            const updates = syncComponentStyles(currentScreens, components);
            lastSyncedComponentAtRef.current = linkedAt;

            if (updates.size === 0) return;

            updates.forEach((drawElements, screenId) => {
                updateScreen(screenId, { drawElements });
                // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.
            });
        }, 1000);

        return () => clearTimeout(timer);
    }, [linkedProject?.updatedAt, currentProject?.linkedComponentProjectId, updateScreen, yjsIsSynced]); // 🚀 의존성 배열에 yjsIsSynced 추가

    // ── Yjs 프로젝트 입장/퇴장 ───────────────────────────────────────────────
    useEffect(() => {
        if (!currentProjectId) return;
        yjsJoin(currentProjectId);
        return () => { yjsLeave(); };
    }, [currentProjectId, yjsJoin, yjsLeave]);

    // ❌ 제거됨: screens/flows/sections 변경 시 400ms debounce 후 REST PATCH (LWW 덯어쓰기 → 데이터 손실 원인)
    // Yjs CRDT가 모든 캔버스 변경을 실시간으로 동기화합니다.

    // ❌ 제거됨: 섹션 변경 시 immediate=true REST PATCH
    // ❌ 제거됨: unmount 시 immediate=true REST PATCH
    // 위 두 로직도 Yjs disconnect 시 서버 YjsServer.ts가 MongoDB에 자동 저장합니다.

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

    // 노드 생성 헬퍼 (변경된 노드만 새로 만들 때 사용)
    const createNodeFromScreen = useCallback((screen: Screen, existingNode?: RFNode): RFNode => {
        const style = computeNodeStyle(screen);
        const node: RFNode = {
            id: screen.id,
            type: screen.variant === 'SPEC' ? 'spec' : 'screen',
            position: screen.position,
            data: {
                screen,
                // ❌ 제거됨: onFlushProjectData (REST 즉시 저장 콜백)
                // Yjs CRDT가 모든 변경을 자동 동기화합니다.
            },
            selected: existingNode?.selected,
        };
        if (style) {
            node.style = style;
            node.width = typeof style.width === 'number' ? style.width : undefined;
            node.height = typeof style.height === 'number' ? style.height : undefined;
        }
        return node;
    }, []);

    // Sync screens → ReactFlow nodes (변경된 screen만 새 노드 생성, 나머지는 prev 노드 재사용 → 해당 노드만 리렌더)
    useEffect(() => {
        setNodes((prevNodes) => {
            const prevById = new Map(prevNodes.map((n) => [n.id, n]));
            return screens.map((screen) => {
                const prevNode = prevById.get(screen.id);
                if (prevNode && prevNode.data?.screen === screen) return prevNode;
                return createNodeFromScreen(screen, prevNode ?? undefined);
            });
        });
    }, [screens, setNodes, createNodeFromScreen]);

    // Sync flows → edges (변경된 flow만 새 edge 생성, 나머지는 prev 재사용 → 해당 엣지만 리렌더)
    useEffect(() => {
        setEdges((prevEdges) => {
            const prevById = new Map(prevEdges.map((e) => [e.id, e]));
            return flows.map((flow) => {
                const prevEdge = prevById.get(flow.id);
                const flowRef = (prevEdge?.data as { flow?: ScreenFlow })?.flow;
                if (prevEdge && flowRef === flow) return prevEdge;
                return {
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
                        flow,
                        color: flow.label === '팝업' ? '#f59e0b' : // Yellow
                            (flow.label === '명세서' || flow.label === '명세서 연결') ? '#10b981' : // Green
                                '#2c3e7c' // Blue (default/paging)
                    },
                };
            });
        });
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

        // Apply page updates locally — Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.
        const updateIds = Object.keys(updates);
        if (updateIds.length > 0) {
            updateIds.forEach(id => {
                updateScreen(id, { page: updates[id] });
            });
        }
    }, [flows, screens.length, updateScreen]);

    // 🗑️ 이 블록은 Yjs CRDT 적용으로 인해 더 이상 사용하지 않음
    // Listen for initial Sync from Server
    // useEffect(() => {
    //     ... (Yjs가 전담하므로 삭제) ...
    // }, [importData, user]);

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
                                // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.
                            });
                        }
                    }

                    if (selectedEdges.length > 0) {
                        if (window.confirm(`${selectedEdges.length}개의 연결을 삭제하시겠습니까?`)) {
                            selectedEdges.forEach(edge => {
                                deleteFlow(edge.id);
                            });
                        }
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteScreen, deleteFlow, getNodes, edges, screens, flows]);

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
                // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.

                const relatedTablesText = uiScreen.relatedTables || '';
                const tableNames = relatedTablesText.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.startsWith('•'))
                    .map(line => line.substring(1).trim());

                const linkedErdProjects = currentProject?.linkedErdProjectIds?.length
                    ? projects.filter(p => currentProject.linkedErdProjectIds!.includes(p.id))
                    : currentProject?.linkedErdProjectId
                        ? projects.filter(p => p.id === currentProject.linkedErdProjectId)
                        : [];

                if (tableNames.length > 0 && linkedErdProjects.length > 0) {
                    // 관련테이블이 있고 ERD 프로젝트가 연결되어 있으면 팝업 표시
                    const shouldAutoPopulate = window.confirm(
                        '화면 설계와 명세서를 연결합니다.\n\n' +
                        '관련테이블의 컬럼 데이터를 자동으로 만들겠습니까?\n\n' +
                        '• [확인]: 연결하면서 관련테이블 컬럼 데이터 자동 생성\n' +
                        '• [취소]: 명세서 연결만 수행'
                    );

                    if (shouldAutoPopulate) {
                        // 자동으로 관련테이블 컬럼 데이터 생성 (기존 로직 실행)
                        const existingSpecs = specScreen.specs || [];
                        const existingKeys = new Set(existingSpecs.map(s => `${s.tableNameEn}.${s.controlName}`));
                        const newSpecsToProcess: any[] = [];

                    tableNames.forEach(rawName => {
                        let entity: { name: string; comment?: string; attributes: { name: string; comment?: string; type?: string; length?: string; defaultVal?: string }[] } | undefined;
                        const match = rawName.match(/\(([^)]+)\)$/);
                        const physicalFromRaw = match ? match[1] : rawName;

                        for (const erdProj of linkedErdProjects) {
                            const erdData = erdProj?.data as { entities?: { name: string; comment?: string; attributes: { name: string; comment?: string; type?: string; length?: string; defaultVal?: string }[] }[] } | undefined;
                            entity = erdData?.entities?.find((e: { name: string; comment?: string }) =>
                                e.name === physicalFromRaw || e.name === rawName || e.comment === rawName
                            );
                            if (entity) break;
                        }

                        if (entity) {
                            entity.attributes.forEach((attr: { name: string; comment?: string; type?: string; length?: string; defaultVal?: string }) => {
                                const itemKey = `${entity!.name}.${attr.name}`;
                                if (!existingKeys.has(itemKey)) {
                                    newSpecsToProcess.push({
                                        id: `spec_item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                        tableNameKr: entity!.comment || entity!.name,
                                        tableNameEn: entity!.name,
                                        fieldName: attr.comment || attr.name,
                                        controlName: attr.name,
                                        dataType: 'INPUT',
                                        format: attr.type || '',
                                        length: attr.length || '',
                                        defaultValue: attr.defaultVal || '',
                                        validation: '',
                                        memo: '',
                                    });
                                    existingKeys.add(itemKey);
                                }
                            });
                        }
                    });

                    if (newSpecsToProcess.length > 0) {
                        const ITEMS_PER_PAGE = 20;
                        const allSpecs = [...existingSpecs, ...newSpecsToProcess];
                        const totalNeededPages = Math.ceil(allSpecs.length / ITEMS_PER_PAGE);

                        // Ensure landscape orientation for both existing and new pages as requested
                        const orientationUpdates = {
                            pageSize: 'A4' as const,
                            pageOrientation: 'landscape' as const
                        };

                        if (totalNeededPages > 1) {
                            // ── Split Logic: Multiple Pages ──
                            // 1. Update the first page (original specScreen)
                            const page1Specs = allSpecs.slice(0, ITEMS_PER_PAGE);
                            const page1Updates = {
                                ...metaUpdates,
                                ...orientationUpdates,
                                specs: page1Specs,
                                page: `1/${totalNeededPages}`,
                                historyLog: {
                                    details: `기능명세서 '${specScreen.name}' 항목이 많아 A4 가로 기준으로 ${totalNeededPages}개로 분할 생성되었습니다. (1/${totalNeededPages})`,
                                    targetName: specScreen.name,
                                    targetType: 'SCREEN' as const
                                }
                            };
                            updateScreen(specScreen.id, page1Updates);
                            // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.

                            // 2. Create additional pages
                            const targetNode = getNodes().find(n => n.id === specScreen.id);
                            const basePos = targetNode?.position || { x: 0, y: 0 };
                            let prevId = specScreen.id;

                            // Based on landscape width, 1600 is a safe horizontal gap
                            const HORIZONTAL_GAP = 1600;

                            for (let p = 2; p <= totalNeededPages; p++) {
                                const newId = `screen_${Date.now()}_${p}`;
                                const pageSpecs = allSpecs.slice((p - 1) * ITEMS_PER_PAGE, p * ITEMS_PER_PAGE);

                                const newSpecNode: Screen = {
                                    ...specScreen, // Copy properties from original spec
                                    ...metaUpdates, // Ensure meta is up to date
                                    ...orientationUpdates, // Set to landscape
                                    id: newId,
                                    name: `${specScreen.name} (${p}페이지)`,
                                    specs: pageSpecs,
                                    page: `${p}/${totalNeededPages}`,
                                    position: { x: basePos.x + (p - 1) * HORIZONTAL_GAP, y: basePos.y },
                                    isLocked: true, // Default to locked state
                                    unlockedAt: undefined,
                                };

                                addScreen(newSpecNode);
                                // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.

                                // 3. Create "Paging" flow connection
                                const newFlowId = `flow_${Date.now()}_p${p}`;
                                const pagingFlow = {
                                    id: newFlowId,
                                    source: prevId,
                                    target: newId,
                                    sourceHandle: 'right',
                                    targetHandle: 'left',
                                    label: '페이징',
                                };
                                addFlow(pagingFlow);
                                // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.

                                prevId = newId;
                            }
                        } else {
                            // ── Single Page Logic ──
                            const finalUpdates = {
                                ...metaUpdates,
                                ...orientationUpdates,
                                specs: allSpecs
                            };
                            updateScreen(specScreen.id, finalUpdates);
                            // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.
                        }
                    }
                } else {
                        // 연결만 수행 - 아래의 일반 연결 생성 로직으로 이동
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
                ...(isSpecConnection && existingFlow.label === '페이징' ? { label: '명세서 연결' } : {})
            });
            // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.
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
        // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.
    }, [addFlow, updateFlow, updateScreen, flows, screens, projects, currentProject]);

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
        // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.

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
            // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.
        }

        setReconnectingEdgeId(null);
    }, [updateFlow, setEdges, flows, screens, updateScreen]);

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

    const getViewportCenterFlowPosition = useCallback((): { x: number; y: number } => {
        const wrapper = flowWrapper.current;
        if (!wrapper) return { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 };
        const rect = wrapper.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return screenToFlowPosition({ x: centerX, y: centerY });
    }, [screenToFlowPosition]);

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

        const viewportCenter = getViewportCenterFlowPosition();
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
            position: viewportCenter,
            fields: [],
            isLocked: true,
            pageSize,
            pageOrientation,
            imageWidth,
            imageHeight,
        };
        addScreen(newScreen);
        // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.
    }, [screens, addScreen, currentProject, user, getViewportCenterFlowPosition]);

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

        const viewportCenter = getViewportCenterFlowPosition();
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
            position: viewportCenter,
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
        // Yjs CRDT가 자동으로 다른 사용자에게 전파합니다.
    }, [screens, addScreen, currentProject, user, getViewportCenterFlowPosition]);

    const onNodeDragStop = useCallback(
        (_: React.MouseEvent, node: RFNode) => {
            const nodeWidth = typeof node.width === 'number' ? node.width : 200;
            const nodeHeight = typeof node.height === 'number' ? node.height : 100;
            const nodeCenter = {
                x: node.position.x + nodeWidth / 2,
                y: node.position.y + nodeHeight / 2,
            };
            const containingSection = sections
                .filter(
                    (s) =>
                        nodeCenter.x >= s.position.x &&
                        nodeCenter.x <= s.position.x + s.size.width &&
                        nodeCenter.y >= s.position.y &&
                        nodeCenter.y <= s.position.y + s.size.height
                )
                // 🚀 여러 섹션에 겹쳐 있다면, 크기가 가장 작은(최하위) 섹션을 선택합니다.
                .sort((a, b) => (a.size.width * a.size.height) - (b.size.width * b.size.height))[0];
            const sectionId = containingSection?.id ?? undefined;
            updateScreen(node.id, { position: node.position, sectionId: sectionId ?? undefined });
            // Yjs CRDT 업데이트 → WebSocket으로 모든 피어에 자동 전파
            yjsMoveScreen(node.id, node.position);
        },
        [updateScreen, yjsMoveScreen, sections]
    );

    const handleExportImage = useCallback((selectedIds: string[], format: ExportFormat) => {
        setIsExportModalOpen(false);

        const element = document.querySelector('.react-flow') as HTMLElement;
        if (!element) {
            alert('캔버스를 찾을 수 없습니다.');
            return;
        }

        const selectedSet = new Set(selectedIds);

        // 🚀 1. 데이터(JSON) 내보내기 처리
        if (format === 'json') {
            const allData = exportData(); // 스토어의 전체 데이터 가져오기
            
            // 선택된 화면만 필터링
            const filteredScreens = allData.screens.filter(s => selectedSet.has(s.id));
            
            // 선택된 화면들 사이의 연결(Flow)만 필터링
            const filteredFlows = allData.flows.filter(f => 
                selectedSet.has(f.source) && selectedSet.has(f.target)
            );

            // 선택된 화면들이 속한 섹션(Section) 필터링
            const selectedSectionIds = new Set(filteredScreens.map(s => s.sectionId).filter(Boolean));
            const filteredSections = allData.sections?.filter(sec => selectedSectionIds.has(sec.id)) ?? [];

            const finalData = {
                screens: filteredScreens,
                flows: filteredFlows,
                sections: filteredSections
            };

            const json = JSON.stringify(finalData, null, 2);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            a.download = `screen-data-selected-${Date.now()}.json`;
            a.click();
            
            alert(`선택된 ${filteredScreens.length}개 화면의 데이터 내보내기가 완료되었습니다.`);
            setIsExporting(false);
            return;
        }

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
                '[data-entity-lock-badge]',
                '[data-lock-overlay]',
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
                '[data-entity-lock-badge]',
                '[data-lock-overlay]',
            ];
            return !excludeSelectors.some(sel => node.closest?.(sel));
        };

        setIsExporting(true);

        const runExport = () => {
            // 🚀 PPT_BETA 처리
            if (format === 'ppt_beta') {
                // PPT_BETA 컴포넌트를 사용하여 내보내기
                setSelectedExportIds(selectedIds);
                setPptBetaExportOpen(true);
                setIsExporting(false);
                return;
            }

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

                captureNext(0).catch((_err: unknown) => {
                    // console.error('PDF export failed:', _err);
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
                                            .catch((_err: unknown) => {
                                                // console.error('Export failed:', _err);
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

    // 서버 프로젝트: Yjs sync 도착 전 편집 시 상태가 덮어쓰여 롤백되는 것 방지
    // Socket(state_sync)은 ERD/락/커서 등 보조 기능에 가까우므로 화면 설계 편집 게이트는 Yjs를 기준으로 한다.
    if (currentProjectId && !currentProjectId.startsWith('local_') && !yjsIsSynced) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 px-6">
                <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mb-4" />
                <p className="text-gray-500 font-medium mb-2">서버와 동기화 중...</p>
                <div className="mt-2 flex gap-2">
                    <button
                        type="button"
                        onClick={() => yjsJoin(currentProjectId)}
                        className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-bold hover:bg-violet-700 transition-colors"
                    >
                        재연결 시도
                    </button>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="px-3 py-1.5 rounded-lg bg-white text-gray-700 font-bold border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                        새로고침
                    </button>
                </div>
                {import.meta.env.DEV && (
                    <div className="text-xs text-gray-500 max-w-[680px] w-full bg-white rounded-xl border border-gray-200 p-3 mt-3">
                        <div className="font-bold text-gray-700 mb-1">진단 정보</div>
                        <div>Socket: {isConnected ? 'connected' : 'disconnected'} / {isSynced ? 'synced' : 'not-synced'}</div>
                        <div>Yjs: {yjsIsConnected ? 'connected' : 'disconnected'} / {yjsIsSynced ? 'synced' : 'not-synced'}</div>
                        <div>Yjs url: {yjsWsUrl}</div>
                        <div>Yjs status: {yjsLastStatus ?? '-'}</div>
                        <div>Yjs error: {yjsLastError ?? '-'}</div>
                        <div>Yjs lastSync: {yjsLastSyncAt ? new Date(yjsLastSyncAt).toLocaleString() : '-'}</div>
                    </div>
                )}
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
                                    className={`relative h-full border-r border-gray-200 overflow-hidden bg-white shadow-xl z-[10001] ${isSidebarOpen ? 'flex-shrink-0' : 'w-0 border-none'}`}
                                    style={{ width: isSidebarOpen ? sidebarWidth : 0, transition: sidebarResizingRef.current ? 'none' : 'width 0.3s ease-in-out' }}
                                >
                                    <div className="h-full min-w-0" style={{ width: sidebarWidth }}>
                                        <ScreenSidebar key={`sidebar-${sidebarListKey}`} screens={screens} sections={sections} />
                                    </div>

                                    {/* Sidebar Resizer Handle */}
                                    {isSidebarOpen && (
                                        <div
                                            onMouseDown={startSidebarResize}
                                            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-violet-500/30 transition-colors z-[10002]"
                                        />
                                    )}
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
                                            <span className={`text-[10px] font-black ${isConnected ? 'text-emerald-700' : 'text-rose-700'}`}>Socket</span>
                                            <span className={`text-[10px] font-black ${isSynced ? 'text-emerald-700' : 'text-amber-700'}`}>{isSynced ? 'SYNC' : '...'}</span>
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

                                    
                                    <PremiumTooltip placement="bottom" offsetBottom={30} label="가져오기 (다른 프로젝트에서 내보낸 데이터 붙여넣기)">
                                        <button
                                            onClick={() => { setIsImportModalOpen(true); setImportError(null); setImportJsonText(''); }}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all text-sm font-bold shadow-sm active:scale-95 shrink-0"
                                        >
                                            <Download size={16} className="text-violet-500 shrink-0" />
                                            <span className="whitespace-nowrap hidden sm:inline">가져오기</span>
                                        </button>
                                    </PremiumTooltip>

                                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                                    <div className="shrink-0">
                                        <OnlineUsers />
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <PremiumTooltip placement="bottom" offsetBottom={30} label="프로젝트 채팅">
                                            <button
                                                onClick={() =>
                                                    setIsChatOpen((v) => {
                                                        const next = !v;
                                                        if (next) {
                                                            clearUnreadForTab(chatActiveTab);
                                                        }
                                                        return next;
                                                    })
                                                }
                                                className={`relative p-2 rounded-lg transition-all active:scale-95 ${
                                                    isChatOpen
                                                        ? 'bg-violet-100 text-violet-600'
                                                        : 'text-gray-400 hover:text-violet-500 hover:bg-gray-50'
                                                }`}
                                            >
                                                <MessageCircle size={18} />
                                                {chatHasUnread && !isChatOpen && (
                                                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px] font-black bg-rose-500 text-white rounded-full border border-white">
                                                        New
                                                    </span>
                                                )}
                                            </button>
                                        </PremiumTooltip>
                                    </div>

                                    <div className="w-px h-6 bg-gray-200 shrink-0 hidden sm:block" />

                                    {currentProject && <BugReportButton project={currentProject} />}

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

                                <ChatPanel
                                    isOpen={isChatOpen}
                                    onClose={() => setIsChatOpen(false)}
                                    activeTab={chatActiveTab}
                                    onActiveTabChange={(tab) => {
                                        setChatActiveTab(tab);
                                        if (isChatOpen) {
                                            clearUnreadForTab(tab);
                                        }
                                    }}
                                />

                                <ReactFlow
                                    nodes={nodes}
                                    edges={edges}
                                    onNodesChange={onNodesChange}
                                    onEdgesChange={onEdgesChange}
                                    onNodeDragStop={onNodeDragStop}
                                    nodesDraggable={yjsIsSynced}
                                    nodesConnectable={yjsIsSynced}
                                    elementsSelectable={yjsIsSynced}
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
                                    onlyRenderVisibleElements={true}
                                    fitView
                                    multiSelectionKeyCode="Shift"
                                    selectionKeyCode="Shift"
                                    deleteKeyCode={null}
                                    style={{ transition: 'none', willChange: 'transform' }}
                                    onPaneClick={() => {
                                        // Notify all ScreenNodes to clear selection
                                        window.dispatchEvent(new CustomEvent('clear-screen-selection'));
                                        setSelectedSectionId(null);
                                    }}
                                    onPaneMouseMove={onPaneMouseMove}
                                >
                                    <SectionOverlayLayer
                                        sections={sections}
                                        hoveredSectionId={hoveredSectionId}
                                        setHoveredSectionId={setHoveredSectionId}
                                        selectedSectionId={selectedSectionId}
                                        setSelectedSectionId={setSelectedSectionId}
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
                                        updateSection={updateSection}
                                        yjsUpdateSection={yjsUpdateSection}
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
                                        sections={sections}
                                        onExport={handleExportImage}
                                        onClose={() => setIsExportModalOpen(false)}
                                    />
                                )}

                                {pptBetaExportOpen && (
                                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                        <div className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden" style={{maxWidth:'34rem'}}>
                                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-purple-100 rounded-xl text-purple-600">
                                                        <Edit3 size={20} />
                                                    </div>
                                                    <div>
                                                        <h2 className="text-lg font-black text-gray-900">PPT_BETA 내보내기</h2>
                                                        <p className="text-xs text-gray-500">레이아웃 구조를 PPT로 내보내는 중...</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setPptBetaExportOpen(false)}
                                                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400"
                                                >
                                                    <X size={20} />
                                                </button>
                                            </div>
                                            <PPTBetaExporter
                                                screenIds={selectedExportIds}
                                                onComplete={() => {
                                                    setPptBetaExportOpen(false);
                                                    setSelectedExportIds([]);
                                                }}
                                                onError={(error) => {
                                                    alert(error);
                                                    setPptBetaExportOpen(false);
                                                    setSelectedExportIds([]);
                                                }}
                                            />
                                        </div>
                                    </div>
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

                                {isImportModalOpen && (
                                    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
                                        <div className="bg-white rounded-[15px] w-full max-w-2xl shadow-2xl overflow-hidden scale-in max-h-[90vh] flex flex-col">
                                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                                                <h3 className="text-lg font-black text-gray-900">데이터 가져오기</h3>
                                                <button onClick={() => { setIsImportModalOpen(false); setImportError(null); }} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                                                    <X size={20} />
                                                </button>
                                            </div>
                                            <p className="px-6 py-2 text-sm text-gray-500 shrink-0">
                                                다른 화면 설계 프로젝트에서 <strong>데이터 내보내기</strong>로 저장한 JSON을 붙여넣거나 파일을 선택하세요. 기존 데이터에 추가됩니다.
                                            </p>
                                            {importError && (
                                                <div className="mx-6 mb-2 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium shrink-0">{importError}</div>
                                            )}
                                            <div className="px-6 py-2 flex-1 min-h-0 flex flex-col">
                                                <textarea
                                                    value={importJsonText}
                                                    onChange={(e) => { setImportJsonText(e.target.value); setImportError(null); }}
                                                    placeholder='{"screens":[...],"flows":[...],"sections":[...]}'
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
                                                                r.onload = () => { setImportJsonText(String(r.result ?? '')); setImportError(null); };
                                                                r.readAsText(f);
                                                            }}
                                                        />
                                                    </label>
                                                    <button
                                                        onClick={() => {
                                                            setImportError(null);
                                                            try {
                                                                const parsed = JSON.parse(importJsonText.trim());
                                                                const screens = Array.isArray(parsed?.screens) ? parsed.screens : [];
                                                                const flows = Array.isArray(parsed?.flows) ? parsed.flows : [];
                                                                const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
                                                                if (!screens.length && !flows.length && !sections.length) {
                                                                    setImportError('화면, 연결, 섹션 데이터가 없습니다.');
                                                                    return;
                                                                }
                                                                const merged = mergeImportData({ screens, flows, sections });
                                                                // Yjs importData를 통해 Y.Doc에 반영 (WebSocket으로 모든 피어에 자동 전파)
                                                                useYjsStore.getState().importData({ screens: merged.screens, flows: merged.flows, sections: merged.sections ?? [] });
                                                                setSidebarListKey((k) => k + 1);
                                                                setIsImportModalOpen(false);
                                                                setImportJsonText('');
                                                                alert(`가져오기 완료. 화면 ${screens.length}개, 연결 ${flows.length}개, 섹션 ${sections.length}개가 추가되었습니다.`);
                                                            } catch (err: any) {
                                                                setImportError(err?.message || 'JSON 형식이 올바르지 않습니다.');
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
                                                                            // Yjs CRDT가 자동으로 전파합니다.
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
                                                                        // Yjs CRDT가 자동으로 전파합니다.
                                                                    }}
                                                                    onCompositionEnd={(e) => {
                                                                        const val = (e.target as HTMLInputElement).value;
                                                                        setFlowLabelComposing(null);
                                                                        updateFlow(editingFlow.id, { label: val });
                                                                        // Yjs CRDT가 자동으로 전파합니다.
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
                                                                    // Yjs CRDT가 자동으로 전파합니다.
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
