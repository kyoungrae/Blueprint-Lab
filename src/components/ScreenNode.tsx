import React, { memo, useState, useRef, useEffect, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { type NodeProps, useReactFlow, useStore as useRFStore } from 'reactflow';
import type { Screen, DrawElement, TableCellData, PolygonPreset, ArrowPreset, LineEnd } from '../types/screenDesign';
import { getCanvasDimensions } from '../types/screenDesign';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useComponentStore } from '../store/componentStore';
import { useScreenCanvasStore } from '../contexts/ScreenCanvasStoreContext';

import { Minus, X, Image as ImageIcon, MousePointer2, Square, Type, Circle, Palette, Layers, GripVertical, Table2, Settings2, Group, Ungroup, Crop, Grid3x3, Trash2, Package, PackageX, Triangle, Copy } from 'lucide-react';
import { useProjectStore } from '../store/projectStore';
import type { Project } from '../types/erd';
import { collectErdTableNames, resolveLinkedErdProjects } from '../utils/linkedErdProjects';

import { useScreenLockAndSync } from './screenNode/useScreenLockAndSync';
import { useCanvasHistory } from './screenNode/useCanvasHistory';
import { useCanvasElementActions } from './screenNode/useCanvasElementActions';
import { useGuideLines } from './screenNode/useGuideLines';

// ── Sub-Components ────────────────────────────────────────────

import ScreenHandles from './screenNode/ScreenHandles';
import DrawElementsList from './screenNode/DrawElementsList';
import { useDragStore } from '../store/dragStore';
import { ExportModeContext } from '../contexts/ExportModeContext';
import { CanvasOnlyModeContext } from '../contexts/CanvasOnlyModeContext';
import { TooltipPortalContext } from '../contexts/TooltipPortalContext';
import { useScreenDesignUndoRedo } from '../contexts/ScreenDesignUndoRedoContext';
import PremiumTooltip from './screenNode/PremiumTooltip';
import MetaInfoTable from './screenNode/MetaInfoTable';
import RightPane from './screenNode/RightPane';
import StylePanel from './screenNode/StylePanel';
import { TextStyleToolbar } from './screenNode/TextStyleToolbar';
import LayerPanel from './screenNode/LayerPanel';
import { ImageStylePanel } from './screenNode/ImageStylePanel';
import { normalizeImageUrlForStorage } from '../utils/imageUrl';
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { EntityLockBadge } from './collaboration';
import { hexToRgba, flatIdxToRowCol, rowColToFlatIdx, getV2Cells, deepCopyCells } from './screenNode/types';
import { getSmartGuidesAndSnap, type AlignmentGuides, type SnapState } from './screenNode/smartGuides';
import { AlignmentGuidesOverlay } from './screenNode/AlignmentGuidesOverlay';
import { GRID_STEP } from '../constants/canvasGrid';
import { ScreenHeader } from './screenNode/ScreenHeader';
import { LockOverlay } from './screenNode/LockOverlay';
import MemoPanel from './screenNode/MemoPanel';

import ComponentPickerButton from './screenNode/ComponentPickerButton';
import CanvasRulers from './screenNode/CanvasRulers';
import TablePanelFloating from './screenNode/TablePanelFloating';
import { parsePptHtmlToElements } from '../utils/pptHtmlParser';
import { scaleElementsToFitCanvas } from '../utils/canvasPasteUtils';
import { Monitor } from 'lucide-react';
import UndoRedoControls from './screenNode/UndoRedoControls';
import CanvasAlignToolbar from './screenNode/CanvasAlignToolbar';
import GuideClipboardControls from './screenNode/GuideClipboardControls';
import ObjectAlignToolbar from './screenNode/ObjectAlignToolbar';
import { StickyToolbarWrapper } from './screenNode/StickyToolbarWrapper';
import { useYjsStore } from '../store/yjsStore';

type TableCellClipboard = {
    type: 'table-cells';
    sourceCols: number;
    sourceRows: number;
    cells: Array<{ r: number; c: number; content: string; style: any }>;
};

const getPanelPortalRoot = () => document.getElementById('panel-portal-root') || document.body;

/** 스타일 복사(PPT식 포맷 페인터): 배경·테두리·텍스트·그림자·투명도 등 시각 속성만 스냅샷 */
const STYLE_SNAPSHOT_KEYS: (keyof DrawElement)[] = [
    'fill', 'stroke', 'strokeWidth', 'strokeStyle',
    'borderRadius', 'borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft',
    'fontSize', 'fontWeight', 'fontStyle', 'textDecoration', 'fontFamily', 'color', 'textAlign', 'verticalAlign',
    'shadowColor', 'shadowOpacity', 'shadowOffsetX', 'shadowOffsetY',
    'opacity', 'fillOpacity', 'strokeOpacity',
    'tableBorderTop', 'tableBorderTopWidth', 'tableBorderTopStyle',
    'tableBorderBottom', 'tableBorderBottomWidth', 'tableBorderBottomStyle',
    'tableBorderLeft', 'tableBorderLeftWidth', 'tableBorderLeftStyle',
    'tableBorderRight', 'tableBorderRightWidth', 'tableBorderRightStyle',
    'tableBorderInsideH', 'tableBorderInsideHWidth', 'tableBorderInsideHStyle',
    'tableBorderInsideV', 'tableBorderInsideVWidth', 'tableBorderInsideVStyle',
    'tableBorderRadius', 'tableBorderRadiusTopLeft', 'tableBorderRadiusTopRight',
    'tableBorderRadiusBottomLeft', 'tableBorderRadiusBottomRight',
];

function extractStyleSnapshot(src: DrawElement): Partial<DrawElement> {
    const out: Partial<DrawElement> = {};
    for (const k of STYLE_SNAPSHOT_KEYS) {
        const v = src[k];
        if (v !== undefined) (out as Record<string, unknown>)[k as string] = v as unknown;
    }
    return out;
}

const STYLE_PAINT_CURSOR_CSS =
    `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect width='14' height='14' x='8' y='8' rx='2' ry='2'/><path d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'/></svg>`
    )}") 12 12, crosshair`;

/** 포털로 렌더링되는 패널들이 뷰포트 이동/줌에 기민하게 반응하도록 감싸는 컴포넌트 */
const FloatingPanelWrapper: React.FC<{
    children: React.ReactNode;
    flowPos?: { x: number; y: number };
    anchorRef?: React.RefObject<HTMLDivElement | null>;
    flowToScreenPosition?: (pos: { x: number; y: number }) => { x: number; y: number };
    className?: string;
    [key: string]: any;
}> = ({ children, flowPos, anchorRef, flowToScreenPosition, className, ...props }) => {
    useRFStore(s => s.transform); // Force re-render on pan/zoom

    let screenX = 0;
    let screenY = 0;

    // 1. 기준이 되는 버튼(anchorRef)이 있는 경우 (도형, 선 패널 등)
    if (anchorRef && anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        screenX = rect.left;
        screenY = rect.bottom + 4;
    } 
    // 2. 캔버스 상의 특정 좌표(flowPos)를 따라가는 경우 (표 삽입, 격자 보기 등)
    else if (flowPos && flowToScreenPosition) {
        const screenPos = flowToScreenPosition(flowPos);
        screenX = screenPos.x;
        screenY = screenPos.y;
    }

    return (
        <div
            className={className}
            style={{
                left: screenX,
                top: screenY,
                // 🚀 크기는 무조건 원래 크기로 고정!
                transform: 'scale(1)', 
                transformOrigin: 'top left',
                position: 'fixed',
                ...props.style
            }}
            {...props}
        >
            {children}
        </div>
    );
};

/** 다각형 프리셋에 따른 정규화된 꼭짓점 (0~1). [x,y] 배열 */
const POLYGON_PRESET_NORM: Record<PolygonPreset, [number, number][]> = {
    triangle: [[0.5, 0], [0, 1], [1, 1]],
    diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
    pentagon: (() => {
        const pts: [number, number][] = [];
        for (let i = 0; i < 5; i++) {
            const a = (i * 360) / 5 - 90;
            const rad = (a * Math.PI) / 180;
            pts.push([0.5 + 0.5 * Math.cos(rad), 0.5 + 0.5 * Math.sin(rad)]);
        }
        return pts;
    })(),
    hexagon: (() => {
        const pts: [number, number][] = [];
        for (let i = 0; i < 6; i++) {
            const a = (i * 360) / 6 - 90;
            const rad = (a * Math.PI) / 180;
            pts.push([0.5 + 0.5 * Math.cos(rad), 0.5 + 0.5 * Math.sin(rad)]);
        }
        return pts;
    })(),
    // 🚀 x-shape는 꼭짓점 기반이 아니므로 더미 값 추가
    'x-shape': [[0, 0], [1, 1]], // 실제로는 사용되지 않음, getPolygonPointsForPreset에서 빈 배열 반환
};

function getPolygonPointsForPreset(preset: PolygonPreset, left: number, top: number, w: number, h: number): { x: number; y: number }[] {
    // 🚀 X 도형은 특별 처리 (꼭짓점이 아닌 선으로 그려짐)
    if (preset === 'x-shape') {
        return []; // X 도형은 getPolygonPointsForPreset 사용 안 함
    }
    return POLYGON_PRESET_NORM[preset].map(([nx, ny]) => ({ x: left + w * nx, y: top + h * ny }));
}

/** mousedown target이 Text/SVG 등일 수 있어 Element로 안전하게 변환 */
function getClickTargetElement(target: EventTarget | null): Element | null {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (target instanceof Node && target.parentElement) return target.parentElement;
    return null;
}

/** 줌이 이 값 미만이면 경량 UI(Lite)로 전환 (기존 단일 임계값과 동일). */
const ZOOM_OUT_TO_LITE = 0.09;
/** Lite에서 다시 Full로 올릴 때는 더 높은 줌이 필요 — 경계에서 Lite/Full이 번갈아 깜빡이지 않게 함. */
const ZOOM_IN_TO_FULL = 0.12;
const INTERACTION_SYNC_INTERVAL_MS = 120;
const rfZoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

/** 줌아웃 시 사용되는 초경량 화면 노드.
 *  5000줄짜리 전체 ScreenNode의 모든 useState/useEffect/store 구독을 건너뛴다. */
const ScreenNodeLite: React.FC<{ screen: Screen; selected?: boolean }> = memo(({ screen, selected }) => {
    const MIN_CANVAS_WIDTH = 794;
    const CANVAS_WIDTH_RATIO = 0.7;
    const FIXED_TOP_HEIGHT = 162;
    const FIXED_TOP_HEIGHT_COMPONENT = 88;
    const ENTITY_CANVAS_GAP = 0;
    let { width: canvasW, height: canvasH } = getCanvasDimensions(screen);
    if (canvasW < MIN_CANVAS_WIDTH) {
        const scale = MIN_CANVAS_WIDTH / canvasW;
        canvasW = MIN_CANVAS_WIDTH;
        canvasH = Math.round(canvasH * scale);
    }
    const isComponent = screen.screenId?.startsWith('CMP-');
    const entityWidth = isComponent
        ? canvasW + ENTITY_CANVAS_GAP * 2
        : Math.ceil((canvasW + ENTITY_CANVAS_GAP * 2) / CANVAS_WIDTH_RATIO);
    const entityHeight = canvasH + ENTITY_CANVAS_GAP * 2 + (isComponent ? FIXED_TOP_HEIGHT_COMPONENT : FIXED_TOP_HEIGHT);
    const isLocked = screen.isLocked ?? true;

    return (
        <div
            className="group relative overflow-visible"
            style={{ width: entityWidth, height: entityHeight, contain: 'layout style paint' }}
        >
            <div
                className={`relative h-full w-full bg-white rounded-[15px] shadow-xl border-2 flex flex-col overflow-hidden ${selected
                    ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                    : isLocked
                        ? 'border-gray-200 shadow-md'
                        : 'border-[#2c3e7c] shadow-blue-100'
                    }`}
            >
                {/* 헤더만 간략 표시 */}
                <div className="px-4 py-2 flex items-center gap-2 text-white bg-[#2c3e7c] border-b border-white rounded-t-[15px]">
                    <Monitor size={16} className="flex-shrink-0 text-white/90" />
                    <span className="font-bold text-lg flex-1 truncate">{screen.name || (isComponent ? '컴포넌트명' : '화면명')}</span>
                </div>
                {/* 빈 캔버스 영역 (줌아웃 시 중앙에 화면명 표시) */}
                <div className="relative flex-1 bg-gray-50">
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="px-3 py-1.5 rounded-lg bg-white/90 border border-gray-200 text-gray-600 text-[100px] font-semibold max-w-[80%] truncate shadow-sm">
                            {screen.name || (isComponent ? '컴포넌트명' : '화면명')}
                        </span>
                    </div>
                </div>
            </div>
            <ScreenHandles />
        </div>
    );
});

// ── Screen Node ─────────────────────────────────────────────
interface ScreenNodeData {
    screen: Screen;
    /** 보조선 등 변경 직후 프로젝트 저장(새로고침 시 유지). 화면 설계/컴포넌트 캔버스에서 주입 */
    onFlushProjectData?: () => void;
}

const ScreenNode: React.FC<NodeProps<ScreenNodeData>> = ({ data, selected }) => {
    // ── 줌아웃 시 경량 렌더링 (store 구독·이벤트 핸들러 0개) ──
    const rfZoom = useRFStore(rfZoomSelector);
    const modeRef = useRef<'lite' | 'full' | null>(null);
    if (modeRef.current === null) {
        modeRef.current = rfZoom < ZOOM_OUT_TO_LITE ? 'lite' : 'full';
    }
    let mode = modeRef.current;
    if (mode === 'full' && rfZoom < ZOOM_OUT_TO_LITE) {
        mode = 'lite';
    } else if (mode === 'lite' && rfZoom > ZOOM_IN_TO_FULL) {
        mode = 'full';
    }
    modeRef.current = mode;

    if (mode === 'lite') {
        return <ScreenNodeLite screen={data.screen} selected={selected} />;
    }

    return <ScreenNodeFull data={data} selected={selected} />;
};
const ScreenNodeFull: React.FC<{ data: ScreenNodeData; selected?: boolean }> = memo(({ data, selected }) => {
    const isExporting = useContext(ExportModeContext);
    const canvasOnlyMode = useContext(CanvasOnlyModeContext);
    const yjsIsSynced = useYjsStore(s => s.isSynced);

    const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
    const { setHandlers } = useScreenDesignUndoRedo();
    const { screen } = data;
    const {
        isLocked,
        isLockedByOther,
        lockedBy,
        canEdit,
        update,
        updateScreen,
        syncUpdate,
        syncDrawElements,
        handleToggleLock,
        handleDelete,
        sendOperation,
        user,
        canvasClipboard,
        setCanvasClipboard,
        gridClipboard,
        setGridClipboard,
        lastInteractedScreenId,
        setLastInteractedScreenId,
        getScreenById,
        getPasteTargetScreenId,
    } = useScreenLockAndSync(screen);

    const cellClipboard = useScreenDesignStore(s => s.cellClipboard) as TableCellClipboard | null;
    const setCellClipboard = useScreenDesignStore(s => s.setCellClipboard) as (clip: TableCellClipboard | null) => void;
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

    const uploadImage = async (file: File): Promise<string> => {
        if (!currentProjectId || currentProjectId.startsWith('local_')) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetchWithAuth(`${API_URL}/${currentProjectId}/images`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) throw new Error('Image upload failed');
        const json = await res.json() as { imageId: string; url: string };
        return normalizeImageUrlForStorage(json.url) ?? json.url;
    };

    const [isTableListOpen, setIsTableListOpen] = useState(false);
    const [showScreenOptionsPanel, setShowScreenOptionsPanel] = useState(false);
    const [showMemoPanel, setShowMemoPanel] = useState(false);
    const [funcNoDeleteConfirm, setFuncNoDeleteConfirm] = useState<{ elementId: string; elementText: string } | null>(null);

    const tableListRef = useRef<HTMLDivElement>(null);
    const screenOptionsRef = useRef<HTMLDivElement>(null);
    const rightPaneRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);
    const pendingSyncDrawElementsRef = useRef<DrawElement[] | null>(null);
    const pendingSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** 폰트 크기만 변경 시 전체 리렌더 지연: 디바운스 후 한 번만 스토어 반영 */
    const pendingFontSizeRef = useRef<{ elementId: string; px: number } | null>(null);
    const pendingFontSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const PENDING_FONT_SIZE_DEBOUNCE_MS = 380;

    const { projects, currentProjectId } = useProjectStore();
    const currentProject = projects.find(p => p.id === currentProjectId);
    const linkedErdProjects = React.useMemo(
        () => resolveLinkedErdProjects(projects as Project[], currentProject as Project | undefined),
        [currentProject, projects],
    );
    const linkedComponentProject = projects.find(p => p.id === currentProject?.linkedComponentProjectId);
    const erdTables = React.useMemo(() => collectErdTableNames(linkedErdProjects), [linkedErdProjects]);
    const componentList = React.useMemo(() => {
        // 연결된 프로젝트가 COMPONENT 타입일 때만 컴포넌트 목록 사용 (화면 설계 프로젝트의 screens와 혼동 방지)
        if (linkedComponentProject?.projectType !== 'COMPONENT') return [];
        // 🚀 수정: 새로운 Yjs 저장소(componentSnapshot)를 먼저 찾도록 추가!
        const components = (linkedComponentProject as any)?.componentSnapshot?.components || 
                          (linkedComponentProject.data as { components?: Screen[] })?.components || [];
        return components
            .filter((c: Screen) => c.screenId?.startsWith('CMP-'))
            .filter((c: Screen) => (c.drawElements?.length ?? 0) > 0); // drawElements가 있는 컴포넌트만 표시 (캔버스에 그린 내용이 없으면 제외)
    }, [linkedComponentProject]);

    /** Paste: drop component link metadata when the component id is not in the linked COMPONENT project */
    const linkedComponentScreenIdSet = React.useMemo(() => {
        if (linkedComponentProject?.projectType !== 'COMPONENT') return new Set<string>();
        const components =
            (linkedComponentProject as any)?.componentSnapshot?.components ||
            (linkedComponentProject.data as { components?: Screen[] })?.components ||
            [];
        return new Set((components as Screen[]).map((c) => c.id));
    }, [linkedComponentProject]);

    // ── 4. Drawing Mode Logic ──
    const [activeTool, setActiveTool] = useState<'select' | 'rect' | 'circle' | 'text' | 'image' | 'table' | 'func-no' | 'polygon' | 'line' | 'arrow'>('select');
    const [shapeSubPanelOpen, setShapeSubPanelOpen] = useState(false);
    const shapePanelAnchorRef = useRef<HTMLDivElement>(null);
    const [polygonPresetToCreate, setPolygonPresetToCreate] = useState<PolygonPreset | null>(null);
    const [arrowPresetToCreate, setArrowPresetToCreate] = useState<ArrowPreset | null>(null);
    const [linePanelOpen, setLinePanelOpen] = useState(false);
    const linePanelAnchorRef = useRef<HTMLDivElement>(null);
    const [linePresetToCreate, setLinePresetToCreate] = useState<{ strokeStyle: 'solid' | 'dashed' | 'dotted'; lineEnd: LineEnd } | null>(null);
    const [lineDrawStart, setLineDrawStart] = useState<{ x: number; y: number } | null>(null);
    const [lineDrawEnd, setLineDrawEnd] = useState<{ x: number; y: number } | null>(null);
    const lineDrawStartRef = useRef<{ x: number; y: number } | null>(null);
    const lineDrawEndRef = useRef<{ x: number; y: number } | null>(null);
    /** 다각형 드로잉 중 사용한 프리셋 (mouseup 시 폴리곤 생성에 사용) */
    const [drawingPolygonPreset, setDrawingPolygonPreset] = useState<PolygonPreset | null>(null);
    /** 다각형 꼭짓점 드래그: { elementId, pointIndex, startPoints } + window listener로 좌표 갱신 */
    const polygonVertexDragRef = useRef<{ elementId: string; pointIndex: number; startPoints: { x: number; y: number }[] } | null>(null);
    const polygonVertexSnapStateRef = useRef<SnapState>({});
    const lineVertexDragRef = useRef<{ elementId: string; pointIndex: 0 | 1 } | null>(null);
    const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
    /** 도형 스타일 복사 → 대상 클릭 시 적용 (포맷 페인터) */
    const [stylePaintActive, setStylePaintActive] = useState(false);
    const [stylePaintSnapshot, setStylePaintSnapshot] = useState<Partial<DrawElement> | null>(null);
    const [stylePaintSourceId, setStylePaintSourceId] = useState<string | null>(null);
    const tryApplyStylePaintRef = useRef<(id: string, e: React.MouseEvent) => boolean>(() => false);
    const canvasRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipContainerRef = useRef<HTMLDivElement>(null);
    const canvasAreaRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStartPos, setDrawStartPos] = useState({ x: 0, y: 0 });
    const [tempElement, setTempElement] = useState<DrawElement | null>(null);
    const [draggingElementIds, setDraggingElementIds] = useState<string[]>([]);
    const [dragOffsets, setDragOffsets] = useState<Record<string, { x: number, y: number }>>({});
    const [isMoving, setIsMoving] = useState(false);
    const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides | null>(null);
    const snapStateRef = useRef<SnapState>({});
    const resizeSnapStateRef = useRef<SnapState>({});
    const setDragPreviews = useDragStore(state => state.setPreviews);
    /** rAF throttle refs — 드래그·리사이즈 중 setState 호출 빈도를 requestAnimationFrame으로 제한 */
    const dragRafIdRef = useRef<number | undefined>(undefined);
    const resizeRafIdRef = useRef<number | undefined>(undefined);
    /** 협업 데이터는 1프레임마다 영속 반영하지 않고 짧은 간격으로만 전송 */
    const lastDragSyncAtRef = useRef(0);
    const lastResizeSyncAtRef = useRef(0);
    const [showGridPanel, setShowGridPanel] = useState(false);
    const [gridPanelPos, setGridPanelPos] = useState({ x: 0, y: 0 });
    const gridPanelAnchorRef = useRef<HTMLDivElement>(null);
    const isDraggingFontStylePanelRef = useRef(false);

    const [showStylePanel, setShowStylePanel] = useState(false);
    const [showLayerPanel, setShowLayerPanel] = useState(false);
    const [showTablePicker, setShowTablePicker] = useState(false);
    const [tablePickerHover, setTablePickerHover] = useState<{ r: number, c: number } | null>(null);
    const [tablePickerPos, setTablePickerPos] = useState({ x: 0, y: 0 });
    const [showComponentPicker, setShowComponentPicker] = useState(false);
    const [subComponentNameComposing, setSubComponentNameComposing] = useState<{ subId: string; value: string } | null>(null);
    useEffect(() => {
        setSubComponentNameComposing(null);
    }, [selectedElementIds]);
    useEffect(() => {
        // 선택 대상이 바뀌면 폰트 스타일 패널은 닫는다.
        setShowFontStylePanel(false);
        setShowStylePanel(false);
        setShowLayerPanel(false);
        setShowTablePanel(false);
    }, [selectedElementIds]);
    const [componentPickerPos, setComponentPickerPos] = useState({ x: 0, y: 0 });
    const isDraggingTablePickerRef = useRef(false);
    const isDraggingComponentPickerRef = useRef(false);

    const syncDrawElementsDuringInteraction = useCallback(
        (elements: DrawElement[], lastSyncAtRef: React.MutableRefObject<number>) => {
            const now = Date.now();
            if (now - lastSyncAtRef.current < INTERACTION_SYNC_INTERVAL_MS) return;
            lastSyncAtRef.current = now;
            syncDrawElements(elements);
        },
        [syncDrawElements]
    );
    const tablePickerRef = useRef<HTMLDivElement>(null);
    const componentPickerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const handleTablePickerHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        isDraggingTablePickerRef.current = true;
        const flowAtClick = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const offsetFlowX = flowAtClick.x - tablePickerPos.x;
        const offsetFlowY = flowAtClick.y - tablePickerPos.y;
        const onMove = (me: MouseEvent) => {
            if (!isDraggingTablePickerRef.current) return;
            me.stopImmediatePropagation();
            const flowAtMove = screenToFlowPosition({ x: me.clientX, y: me.clientY });
            setTablePickerPos({ x: flowAtMove.x - offsetFlowX, y: flowAtMove.y - offsetFlowY });
        };
        const onUp = () => {
            isDraggingTablePickerRef.current = false;
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp);
    }, [screenToFlowPosition, tablePickerPos]);
    const handleGridPanelHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const flowAtClick = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const offsetFlowX = flowAtClick.x - gridPanelPos.x;
        const offsetFlowY = flowAtClick.y - gridPanelPos.y;
        const onMove = (me: MouseEvent) => {
            me.stopImmediatePropagation();
            const flowAtMove = screenToFlowPosition({ x: me.clientX, y: me.clientY });
            setGridPanelPos({ x: flowAtMove.x - offsetFlowX, y: flowAtMove.y - offsetFlowY });
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp);
    }, [screenToFlowPosition, gridPanelPos]);
    const [showImageStylePanel, setShowImageStylePanel] = useState(false);
    const [imageStylePanelPos, setImageStylePanelPos] = useState({ x: 0, y: 0 });
    const [imageCropMode, setImageCropMode] = useState(false);
    const isDraggingImageStylePanelRef = useRef(false);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);

    // Close table list, screen options, table picker on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            const el = getClickTargetElement(e.target);
            if (tableListRef.current && !tableListRef.current.contains(target) && !el?.closest('[data-table-list-portal]')) {
                setIsTableListOpen(false);
            }
            if (screenOptionsRef.current && !screenOptionsRef.current.contains(target)) {
                setShowScreenOptionsPanel(false);
            }
            if (showTablePicker && !isDraggingTablePickerRef.current && tablePickerRef.current && !tablePickerRef.current.contains(target) && !el?.closest('[data-table-picker-portal]')) {
                setShowTablePicker(false);
            }
            if (showComponentPicker && !isDraggingComponentPickerRef.current && componentPickerRef.current && !componentPickerRef.current.contains(target) && !el?.closest('[data-component-picker-portal]')) {
                setShowComponentPicker(false);
            }
            if (showGridPanel && gridPanelAnchorRef.current && !gridPanelAnchorRef.current.contains(target) && !el?.closest('[data-grid-panel]')) {
                setShowGridPanel(false);
            }
            if (shapeSubPanelOpen && shapePanelAnchorRef.current && !shapePanelAnchorRef.current.contains(target) && !el?.closest('[data-shape-panel]')) {
                setShapeSubPanelOpen(false);
            }
            if (linePanelOpen && linePanelAnchorRef.current && !linePanelAnchorRef.current.contains(target) && !el?.closest('[data-line-panel]')) {
                setLinePanelOpen(false);
            }
            if (!el?.closest('[data-guide-line]')) {
                setSelectedGuideLine(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, [showTablePicker, showComponentPicker, showGridPanel, shapeSubPanelOpen, linePanelOpen]);

    // 이미지 스타일 패널이 닫히면 크롭 모드도 항상 해제
    useEffect(() => {
        if (!showImageStylePanel && imageCropMode) {
            setImageCropMode(false);
        }
    }, [showImageStylePanel, imageCropMode]);



    const [editingCellIndex, setEditingCellIndex] = useState<number | null>(null);
    const [selectedCellIndices, setSelectedCellIndices] = useState<number[]>([]);

    // ── Undo/Redo History (extracted to useCanvasHistory) ──────────────────
    const {
        history,
        saveHistory,
        undo,
        redo,
    } = useCanvasHistory({
        screen,
        screenId: screen.id,
        selected,
        updateScreen,
        syncUpdate,
        setHandlers,
    });

    const handlePartialComponentize = useCallback(() => {
        if (selectedElementIds.length === 0 || isLocked) return;
        const existing = screen.subComponents ?? [];
        const alreadyRegisteredIds = new Set(existing.flatMap((s) => s.elementIds));
        const availableIds = selectedElementIds.filter((id) => !alreadyRegisteredIds.has(id));
        if (availableIds.length === 0) {
            alert('선택한 객체는 이미 하위 컴포넌트로 등록되어 있습니다. 객체 하나당 하나의 하위 컴포넌트만 등록할 수 있습니다.');
            return;
        }
        if (availableIds.length < selectedElementIds.length) {
            const count = selectedElementIds.length - availableIds.length;
            if (!window.confirm(`${count}개 객체는 이미 등록되어 있어 제외됩니다. 나머지 ${availableIds.length}개만 등록할까요?`)) return;
        }
        const defaultName = `하위 ${existing.length + 1}`;
        const name = window.prompt('하위 컴포넌트 이름', defaultName)?.trim() || defaultName;
        const newSub: { id: string; name: string; elementIds: string[] } = {
            id: `sub_${Date.now()}`,
            name,
            elementIds: availableIds,
        };
        const nextSubComponents = [...existing, newSub];
        update({ subComponents: nextSubComponents });
        syncUpdate({ subComponents: nextSubComponents });
        saveHistory(screen.drawElements || [], screen.position, nextSubComponents);
    }, [selectedElementIds, isLocked, screen.subComponents, screen.position, screen.drawElements, update, syncUpdate, saveHistory]);

    const handleUnregisterPartialComponent = useCallback(() => {
        if (selectedElementIds.length === 0 || isLocked) return;
        const existing = screen.subComponents ?? [];
        const nextSubComponents = existing
            .map((s) => ({ ...s, elementIds: s.elementIds.filter((id) => !selectedElementIds.includes(id)) }))
            .filter((s) => s.elementIds.length > 0);
        update({ subComponents: nextSubComponents });
        syncUpdate({ subComponents: nextSubComponents });
        saveHistory(screen.drawElements || [], screen.position, nextSubComponents);
    }, [selectedElementIds, isLocked, screen.subComponents, screen.position, screen.drawElements, update, syncUpdate, saveHistory]);

    const handleUpdateSubComponentName = useCallback((subId: string, newName: string) => {
        if (isLocked || !newName.trim()) return;
        const existing = screen.subComponents ?? [];
        const nextSubComponents = existing.map((s) =>
            s.id === subId ? { ...s, name: newName.trim() } : s
        );
        update({ subComponents: nextSubComponents });
        syncUpdate({ subComponents: nextSubComponents });
        saveHistory(screen.drawElements || [], screen.position, nextSubComponents);
    }, [isLocked, screen.subComponents, screen.position, screen.drawElements, update, syncUpdate, saveHistory]);

    const selectionBounds = React.useMemo(() => {
        if (selectedElementIds.length === 0) return null;
        const elements = screen.drawElements || [];
        const selected = elements.filter((el) => selectedElementIds.includes(el.id));
        if (selected.length === 0) return null;
        const getPos = (el: DrawElement) => {
            const preview = useDragStore.getState().previews?.[el.id];
            return preview ? { x: preview.x, y: preview.y } : { x: el.x, y: el.y };
        };
        const minX = Math.min(...selected.map((el) => getPos(el).x));
        const minY = Math.min(...selected.map((el) => getPos(el).y));
        const maxX = Math.max(...selected.map((el) => getPos(el).x + el.width));
        const maxY = Math.max(...selected.map((el) => getPos(el).y + el.height));
        return { minX, minY, maxX, maxY, centerX: (minX + maxX) / 2, topY: minY };
    }, [selectedElementIds, screen.drawElements, useDragStore.getState().previews]);

    const isUnifiedGroupSelection = React.useMemo(() => {
        if (selectedElementIds.length < 2) return false;
        const elements = screen.drawElements || [];
        const selected = elements.filter((el) => selectedElementIds.includes(el.id));
        const firstGroupId = selected[0]?.groupId;
        if (!firstGroupId) return false;
        return selected.every((el) => el.groupId === firstGroupId);
    }, [selectedElementIds, screen.drawElements]);

    const insertComponent = useCallback((component: Screen, subComponentId?: string) => {
        let elements: DrawElement[];
        if (subComponentId) {
            const sub = component.subComponents?.find((s) => s.id === subComponentId);
            if (!sub) return;
            const all = component.drawElements ?? [];
            const idSet = new Set(sub.elementIds);
            elements = all.filter((el) => idSet.has(el.id));
        } else {
            elements = component.drawElements ?? [];
        }
        const { width: targetW, height: targetH } = getCanvasDimensions(screen);
        let offsetX: number;
        let offsetY: number;
        if (subComponentId && elements.length > 0) {
            const minX = Math.min(...elements.map((e) => e.x));
            const minY = Math.min(...elements.map((e) => e.y));
            const compW = Math.max(...elements.map((e) => e.x + e.width)) - minX;
            const compH = Math.max(...elements.map((e) => e.y + e.height)) - minY;
            offsetX = Math.max(10, targetW ? targetW / 2 - minX - compW / 2 : 50);
            offsetY = Math.max(10, targetH ? targetH / 2 - minY - compH / 2 : 50);
        } else {
            const compW = component.imageWidth ?? 400;
            const compH = component.imageHeight ?? 300;
            const sameSize = targetW === compW && targetH === compH;
            offsetX = sameSize ? 0 : Math.max(10, targetW ? targetW / 2 - compW / 2 : 50);
            offsetY = sameSize ? 0 : Math.max(10, targetH ? targetH / 2 - compH / 2 : 50);
        }

        const idMap = new Map<string, string>();
        // 🚀 그룹 ID 매핑을 위한 별도 Map 생성 (이게 핵심입니다!)
        const groupIdMap = new Map<string, string>();
        
        const newElements: DrawElement[] = elements.map((el, i) => {
            const newId = `draw_${Date.now()}_${i}`;
            idMap.set(el.id, newId);
            
            // 🚀 그룹 ID가 있다면 새로 발급해서 매핑
            let newGroupId = el.groupId;
            if (el.groupId) {
                if (!groupIdMap.has(el.groupId)) {
                    // 이 그룹 ID를 처음 본다면 새 그룹 ID 생성
                    groupIdMap.set(el.groupId, `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
                }
                // 매핑된 새 그룹 ID 부여
                newGroupId = groupIdMap.get(el.groupId);
            }
            
            let tableCellLockedIndices: number[] | undefined;
            if (el.type === 'table' && (el.tableCellData || el.tableCellDataV2)) {
                const rows = el.tableRows || 3;
                const cols = el.tableCols || 3;
                const total = rows * cols;
                tableCellLockedIndices = [];
                for (let ci = 0; ci < total; ci++) {
                    const c = (el.tableCellDataV2?.[ci]?.content ?? el.tableCellData?.[ci] ?? '').trim();
                    if (c.length > 0) tableCellLockedIndices.push(ci);
                }
                if (tableCellLockedIndices.length === 0) tableCellLockedIndices = undefined;
            }
            return { 
                ...el, 
                id: newId, 
                groupId: newGroupId, // 🚀 갱신된 그룹 ID 적용
                x: el.x + offsetX, 
                y: el.y + offsetY, 
                fromComponentId: component.id, 
                fromElementId: el.id, 
                hasComponentText: undefined, 
                tableCellLockedIndices 
            };
        });
        
        // 🚀 groupId 매핑 로직 제거 (위에서 이미 처리 완료)
        // newElements.forEach((el) => {
        //     if (el.groupId && idMap.has(el.groupId)) {
        //         el.groupId = idMap.get(el.groupId)!;
        //     }
        // });

        if (newElements.length === 0) return;

        const existing = screen.drawElements || [];
        const maxZ = Math.max(0, ...existing.map((e: DrawElement) => e.zIndex ?? 1));
        newElements.forEach((e, i) => {
            e.zIndex = maxZ + i + 1;
        });

        const nextElements = [...existing, ...newElements];
        update({ drawElements: nextElements });
        syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
        saveHistory(nextElements);
        setSelectedElementIds(newElements.map((e) => e.id));
        setShowComponentPicker(false);
    }, [screen.drawElements, screen, update, syncDrawElements, saveHistory]);

    const [editingTableId, setEditingTableId] = useState<string | null>(null);
    // IME 조합 중(한글 등) 자음/모음 분리 방지
    const [showTablePanel, setShowTablePanel] = useState(false);

    // 표 패널 열릴 때 현재 V2 셀 분포와 잠금 인덱스를 스냅샷으로 확인
    useEffect(() => {
        if (!showTablePanel) return;
        const currentElements = screen.drawElements || [];
        const selectedEl = currentElements.find(el => el.id === selectedElementIds[0]);
        if (!selectedEl || selectedEl.type !== 'table') return;
    }, [showTablePanel, screen.drawElements, selectedElementIds]);
    const [tablePanelPos, setTablePanelPos] = useState({ x: 200, y: 100 });
    const isDraggingTablePanelRef = useRef(false);
    const isDraggingCellSelectionRef = useRef(false); // drag-to-select cells
    const dragStartCellIndexRef = useRef<number>(-1); // cell index where drag started
    // Split Dialog State
    const [showSplitDialog, setShowSplitDialog] = useState(false);
    const [splitTarget, setSplitTarget] = useState<{ elId: string, cellIdx: number } | null>(null);
    const [splitRows, setSplitRows] = useState(2);
    const [splitCols, setSplitCols] = useState(1);

    // Panel Dragging State (toolbarPos removed as toolbar is now inside canvas area)

    const [stylePanelPos, setStylePanelPos] = useState({ x: 200, y: 100 });
    const isDraggingStylePanelRef = useRef(false);

    const [layerPanelPos, setLayerPanelPos] = useState({ x: 200, y: 100 });
    const isDraggingLayerPanelRef = useRef(false);

    const [textSelectionRect, setTextSelectionRect] = useState<DOMRect | null>(null);
    const [textSelectionFromTable, setTextSelectionFromTable] = useState<{ tableId: string; cellIndex: number } | null>(null);
    const tableCellSelectionRestoreRef = useRef<{ tableId: string; cellIndex: number } | null>(null);

    const [showFontStylePanel, setShowFontStylePanel] = useState(false);
    const [fontStylePanelPos, setFontStylePanelPos] = useState({ x: 0, y: 0 });
    const handleFontStylePanelHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        isDraggingFontStylePanelRef.current = true;
        const flowAtClick = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const offsetFlowX = flowAtClick.x - fontStylePanelPos.x;
        const offsetFlowY = flowAtClick.y - fontStylePanelPos.y;
        const onMove = (me: MouseEvent) => {
            if (!isDraggingFontStylePanelRef.current) return;
            me.stopImmediatePropagation();
            const flowAtMove = screenToFlowPosition({ x: me.clientX, y: me.clientY });
            setFontStylePanelPos({ x: flowAtMove.x - offsetFlowX, y: flowAtMove.y - offsetFlowY });
        };
        const onUp = () => {
            isDraggingFontStylePanelRef.current = false;
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp);
    }, [screenToFlowPosition, fontStylePanelPos]);

    const handleElementTextSelectionChange = useCallback((rect: DOMRect | null) => {
        setTextSelectionRect(rect);
        setTextSelectionFromTable(null);
    }, []);

    // Marquee drag-selection state
    const [isDragSelecting, setIsDragSelecting] = useState(false);
    const [dragSelectStart, setDragSelectStart] = useState({ x: 0, y: 0 });
    const [dragSelectRect, setDragSelectRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);





    // Reset positions when locked/unlocked
    useEffect(() => {
        setStylePanelPos({ x: 200, y: 240 });
        setLayerPanelPos({ x: 200, y: 240 });
        setTablePanelPos({ x: 200, y: 240 });
    }, [isLocked]);

    // 새로고침 시 자동 잠금 타이머 재설정
    useEffect(() => {
        // 잠금 해제 상태이고, unlockedAt이 있으면 자동 잠금 타이머 시작
        if (!isLocked && !isLockedByOther && screen.unlockedAt) {
            // console.log(`🔒 [AutoLock] Resetting auto-lock timer for screen ${screen.id} (unlocked at: ${new Date(screen.unlockedAt).toLocaleTimeString()})`);
            // useScreenLockAndSync의 startAutoLockTimer가 이미 호출되어 있음
            // 여기서는 로깅만 함
        }
    }, [screen.id, isLocked, isLockedByOther, screen.unlockedAt]);

    // 텍스트 선택 해제 시 스타일 패널 숨김 (selectionchange + 선택 요소 변경 시)
    useEffect(() => {
        const handleSelectionChange = () => {
            if (tableCellSelectionRestoreRef.current) return;
            const sel = window.getSelection();
            if (!sel || !sel.isCollapsed) return;
            const active = document.activeElement;
            if (active instanceof Element && active.closest('[data-text-style-toolbar], [data-style-panel], [data-font-style-panel], [data-font-style-trigger]')) return;
            setTextSelectionRect(null);
            setTextSelectionFromTable(null);
        };
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, []);

    useEffect(() => {
        if (!textSelectionRect && !textSelectionFromTable) return;
        const fromTable = textSelectionFromTable != null;
        const elId = fromTable ? textSelectionFromTable.tableId : selectedElementIds[0];
        if (!elId) {
            setTextSelectionRect(null);
            setTextSelectionFromTable(null);
            return;
        }
        if (fromTable) {
            if (editingTableId !== elId || !selectedElementIds.includes(elId)) {
                setTextSelectionRect(null);
                setTextSelectionFromTable(null);
            }
        } else {
            if (!selectedElementIds.includes(elId)) {
                setTextSelectionRect(null);
                setTextSelectionFromTable(null);
            }
        }
    }, [selectedElementIds, editingTableId, textSelectionRect, textSelectionFromTable]);

    useEffect(() => {
        if (stylePaintActive) {
            document.body.style.cursor = STYLE_PAINT_CURSOR_CSS;
        } else {
            document.body.style.cursor = '';
        }
        return () => {
            document.body.style.cursor = '';
        };
    }, [stylePaintActive]);

    useEffect(() => {
        if (selectedElementIds.length !== 1) {
            setStylePaintActive(false);
            setStylePaintSnapshot(null);
            setStylePaintSourceId(null);
        }
    }, [selectedElementIds.length]);

    // Clear selection when clicking outside the node (on the outer ReactFlow canvas)
    useEffect(() => {
        const clearSelection = () => {
            setSelectedElementIds([]);
            setEditingTableId(null);
            setEditingTextId(null);
            setSelectedCellIndices([]);
            setEditingCellIndex(null);
            setTextSelectionRect(null);
            setTextSelectionFromTable(null);
            setShowFontStylePanel(false);
            setStylePaintActive(false);
            setStylePaintSnapshot(null);
            setStylePaintSourceId(null);
        };

        const handleMouseDownCapture = (e: MouseEvent) => {
            // Capture Phase: Check if click is on THIS screen's content or panels
            if (containerRef.current && containerRef.current.contains(e.target as Node)) {
                setLastInteractedScreenId(screen.id);
                return;
            }

            // Check for panels portaled to body - identify by data attributes
            const target = e.target as HTMLElement;
            const el = getClickTargetElement(target);
            const panel = el?.closest('[data-premium-tooltip], [data-ignore-selection-clear], [data-sticky-toolbar], [data-shape-panel], [data-line-panel], [data-image-style-panel], [data-table-picker-portal], [data-table-list-portal], [data-style-panel], [data-layer-panel], [data-table-panel], [data-grid-panel], [data-font-style-panel], [data-font-dropdown], [data-text-style-toolbar]');

            if (panel) {
                // If it's a panel, we only set 'lastInteractedScreen' if it belongs to THIS screen.
                // We use screenId attribute on panels to distinguish.
                const panelScreenId = panel.getAttribute('data-screen-id');
                if (panelScreenId === screen.id || (panel.hasAttribute('data-sticky-toolbar') && panel.getAttribute('data-screen-id') === screen.id)) {
                setLastInteractedScreenId(screen.id);
                return;
            }

                // If click is on a panel that belongs to ANOTHER screen, don't clear THIS screen's selection.
                if (panelScreenId && panelScreenId !== screen.id) return;

                // If it's a generic UI element (like a global tooltip), also return to be safe
                if (panel.hasAttribute('data-premium-tooltip') || panel.hasAttribute('data-ignore-selection-clear')) return;
            }

            // If it's a dragging operation for any panel, it's safe
            if (isDraggingImageStylePanelRef.current || isDraggingStylePanelRef.current || isDraggingLayerPanelRef.current || isDraggingTablePanelRef.current || isDraggingTablePickerRef.current || isDraggingFontStylePanelRef.current) {
                setLastInteractedScreenId(screen.id);
                return;
            }

            clearSelection();
        };

        document.addEventListener('mousedown', handleMouseDownCapture, true);
        window.addEventListener('clear-screen-selection', clearSelection);

        return () => {
            document.removeEventListener('mousedown', handleMouseDownCapture, true);
            window.removeEventListener('clear-screen-selection', clearSelection);
        };
    }, [setLastInteractedScreenId, screen.id]);

    const screenCanvasCtx = useScreenCanvasStore();
    const isComponentCtx = Boolean(screenCanvasCtx);

    // drawElements는 이제 DrawElementsList 하위 컴포넌트에서 직접 구독함.
    // ScreenNodeFull에서 구독을 제거함으로써, 요소가 이동하거나 변경될 때 3900줄이 넘는 이 거대한 컴포넌트 전체가
    // 리렌더링되는 비용을 획기적으로 줄임 (Figma 스타일 격리)
    const getDrawElements = useCallback(() => (
        isComponentCtx
            ? useComponentStore.getState().components.find(s => s.id === screen.id)?.drawElements
            : useScreenDesignStore.getState().screens.find(s => s.id === screen.id)?.drawElements
    ) ?? [], [isComponentCtx, screen.id]);

    const elementsRefForHandlers = useRef<DrawElement[]>(getDrawElements());

    useEffect(() => {
        // 핸들러에서 최신 데이터를 참조하기 위한 ref 업데이트 (구독은 하지 않음)
        const unsubscribe = isComponentCtx
            ? useComponentStore.subscribe(state => {
                elementsRefForHandlers.current = state.components.find(s => s.id === screen.id)?.drawElements ?? [];
            })
            : useScreenDesignStore.subscribe(state => {
                elementsRefForHandlers.current = state.screens.find(s => s.id === screen.id)?.drawElements ?? [];
            });
        return unsubscribe;
    }, [isComponentCtx, screen.id]);

    // 하위 핸들러들이 리렌더링 없이도 최신 배열을 참조할 수 있게 함 (기존 ref 방식 유지)
    // 다만 UI 렌더링(RightPane 등)에는 prop 데이터를 우선 사용하여 초기 로딩 버그를 방지함
    const drawElements = screen.drawElements || elementsRefForHandlers.current;

    // 텍스트 선택이 없어도 "텍스트/도형 객체 선택"만으로 폰트 스타일 패널을 열 수 있는 대상
    const fontStyleTargetIds = React.useMemo(() => {
        const textCapableTypes = new Set<DrawElement['type']>(['text', 'rect', 'circle', 'polygon', 'arrow', 'func-no']);
        return drawElements
            .filter((el) => selectedElementIds.includes(el.id))
            .filter((el) => textCapableTypes.has(el.type) && typeof el.text === 'string' && el.text.trim().length > 0)
            .map((el) => el.id);
    }, [drawElements, selectedElementIds]);

    const MIN_CANVAS_WIDTH = 794; // A4 너비 - 이하일 때만 스케일
    let { width: canvasW, height: canvasH } = getCanvasDimensions(screen);
    if (canvasW < MIN_CANVAS_WIDTH) {
        const scale = MIN_CANVAS_WIDTH / canvasW;
        canvasW = MIN_CANVAS_WIDTH;
        canvasH = Math.round(canvasH * scale);
    }
    const {
        guideLines,
        guideLineDragPreview,
        selectedGuideLine,
        setSelectedGuideLine,
        addGuideLine,
        removeGuideLine,
        removeAllGuideLines,
        addAllGuideLines,
        handleGuideLineDragStart,
    } = useGuideLines({
        screen,
        canvasW,
        canvasH,
        update,
        syncUpdate,
        onFlushProjectData: data.onFlushProjectData,
    });

    // 방향키로 선택된 객체 이동 (1px 또는 Shift+방향키 시 GRID_STEP)
    const ARROW_MOVE_STEP = 1;
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedElementIds.length === 0 || isLocked) return;
            const active = document.activeElement as HTMLElement | null;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)) return;
            const key = e.key;
            if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return;
            const step = e.shiftKey ? GRID_STEP : ARROW_MOVE_STEP;
            let dx = 0;
            let dy = 0;
            if (key === 'ArrowLeft') dx = -step;
            else if (key === 'ArrowRight') dx = step;
            else if (key === 'ArrowUp') dy = -step;
            else if (key === 'ArrowDown') dy = step;
            if (dx === 0 && dy === 0) return;
            e.preventDefault();
            e.stopPropagation();
            const nextElements = getDrawElements().map(el => {
                if (!selectedElementIds.includes(el.id)) return el;
                if (el.type === 'polygon' && el.polygonPoints?.length) {
                    const newPoints = el.polygonPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    const minX = Math.min(...newPoints.map(q => q.x));
                    const minY = Math.min(...newPoints.map(q => q.y));
                    const maxX = Math.max(...newPoints.map(q => q.x));
                    const maxY = Math.max(...newPoints.map(q => q.y));
                    return { ...el, x: minX, y: minY, width: maxX - minX, height: maxY - minY, polygonPoints: newPoints };
                }
                if (el.type === 'line' && el.lineX1 != null && el.lineY1 != null && el.lineX2 != null && el.lineY2 != null) {
                    const lineX1 = el.lineX1 + dx;
                    const lineY1 = el.lineY1 + dy;
                    const lineX2 = el.lineX2 + dx;
                    const lineY2 = el.lineY2 + dy;
                    const minX = Math.min(lineX1, lineX2);
                    const minY = Math.min(lineY1, lineY2);
                    const maxX = Math.max(lineX1, lineX2);
                    const maxY = Math.max(lineY1, lineY2);
                    return { ...el, x: minX, y: minY, width: maxX - minX || 1, height: maxY - minY || 1, lineX1, lineY1, lineX2, lineY2 };
                }
                return { ...el, x: el.x + dx, y: el.y + dy };
            });
            update({ drawElements: nextElements });
            syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
            saveHistory(nextElements);
        };
        document.addEventListener('keydown', handleKeyDown, true);
        return () => document.removeEventListener('keydown', handleKeyDown, true);
    }, [selectedElementIds, drawElements, isLocked, update, syncDrawElements, saveHistory]);



    // Drawing Element Resizing Logic
    const elementResizeStartRef = useRef<{
        x: number, y: number,
        elX: number, elY: number,
        w: number, h: number,
        dir: string, id: string
    } | null>(null);

    const groupResizeStartRef = useRef<{
        clientX: number;
        clientY: number;
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        dir: string;
        groupId?: string;
        elements: Array<{ id: string; x: number; y: number; width: number; height: number; polygonPoints?: { x: number; y: number }[]; lineX1?: number; lineY1?: number; lineX2?: number; lineY2?: number }>;
    } | null>(null);

    const handleGroupResizeStart = (groupId: string, dir: string, e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();
        const groupEls = drawElements.filter((el) => el.groupId === groupId);
        if (groupEls.length === 0) return;
        const minX = Math.min(...groupEls.map((el) => el.x));
        const minY = Math.min(...groupEls.map((el) => el.y));
        const maxX = Math.max(...groupEls.map((el) => el.x + el.width));
        const maxY = Math.max(...groupEls.map((el) => el.y + el.height));
        const elements = groupEls.map((el) => ({
            id: el.id,
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            polygonPoints: el.polygonPoints ? el.polygonPoints.map((p) => ({ ...p })) : undefined,
            lineX1: el.lineX1,
            lineY1: el.lineY1,
            lineX2: el.lineX2,
            lineY2: el.lineY2,
        }));
        groupResizeStartRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            minX,
            minY,
            maxX,
            maxY,
            dir,
            groupId,
            elements,
        };
        const handleMove = (moveEvent: MouseEvent) => {
            const ref = groupResizeStartRef.current;
            if (!ref || !canvasRef.current) return;
            const cRect = canvasRef.current.getBoundingClientRect();
            const sX = canvasRef.current.clientWidth / cRect.width;
            const sY = canvasRef.current.clientHeight / cRect.height;
            const dx = (moveEvent.clientX - ref.clientX) * sX;
            const dy = (moveEvent.clientY - ref.clientY) * sY;
            let nextMinX = ref.minX;
            let nextMinY = ref.minY;
            let nextMaxX = ref.maxX;
            let nextMaxY = ref.maxY;
            const w = ref.maxX - ref.minX;
            const h = ref.maxY - ref.minY;
            if (dir.includes('e')) nextMaxX = ref.maxX + dx;
            if (dir.includes('w')) nextMinX = ref.minX + dx;
            if (dir.includes('s')) nextMaxY = ref.maxY + dy;
            if (dir.includes('n')) nextMinY = ref.minY + dy;
            const RESIZE_MIN = 16;
            let newW = Math.max(RESIZE_MIN, nextMaxX - nextMinX);
            let newH = Math.max(RESIZE_MIN, nextMaxY - nextMinY);
            const isCorner = (dir.includes('n') || dir.includes('s')) && (dir.includes('e') || dir.includes('w'));
            const shiftLockAspect = moveEvent.shiftKey && isCorner && h > 0;
            if (shiftLockAspect) {
                const aspectRatio = w / h;
                let fitW = Math.max(newW, newH * aspectRatio);
                let fitH = fitW / aspectRatio;
                if (fitH < RESIZE_MIN) {
                    fitH = RESIZE_MIN;
                    fitW = fitH * aspectRatio;
                }
                if (fitW < RESIZE_MIN) {
                    fitW = RESIZE_MIN;
                    fitH = fitW / aspectRatio;
                }
                newW = fitW;
                newH = fitH;
                if (dir.includes('e') && dir.includes('s')) {
                    nextMinX = ref.maxX - fitW;
                    nextMinY = ref.maxY - fitH;
                } else if (dir.includes('w') && dir.includes('s')) {
                    nextMinX = ref.minX;
                    nextMinY = ref.maxY - fitH;
                } else if (dir.includes('e') && dir.includes('n')) {
                    nextMinX = ref.maxX - fitW;
                    nextMinY = ref.minY;
                } else if (dir.includes('w') && dir.includes('n')) {
                    nextMinX = ref.minX;
                    nextMinY = ref.minY;
                }
            } else {
                if (newW < RESIZE_MIN) {
                    if (dir.includes('w')) nextMinX = ref.maxX - RESIZE_MIN;
                    newW = RESIZE_MIN;
                }
                if (newH < RESIZE_MIN) {
                    if (dir.includes('n')) nextMinY = ref.maxY - RESIZE_MIN;
                    newH = RESIZE_MIN;
                }
            }

            const scaleX = newW / w;
            const scaleY = newH / h;
            const nextElements = getDrawElements().map(el => {
                if (!ref.elements.find(re => re.id === el.id)) return el;
                const rel = ref.elements.find(re => re.id === el.id)!;
                const nextEl = { ...el };
                if (el.type === 'polygon' && el.polygonPoints?.length) {
                    const centerPoints = ref.elements.map(re => {
                        const cx = re.x + re.width / 2;
                        const cy = re.y + re.height / 2;
                        return { cx, cy };
                    });
                    const avgCenterX = centerPoints.reduce((sum, p) => sum + p.cx, 0) / centerPoints.length;
                    const avgCenterY = centerPoints.reduce((sum, p) => sum + p.cy, 0) / centerPoints.length;
                    const oldRelX = rel.x - avgCenterX;
                    const oldRelY = rel.y - avgCenterY;
                    const newRelX = oldRelX * scaleX;
                    const newRelY = oldRelY * scaleY;
                    nextEl.x = avgCenterX + newRelX;
                    nextEl.y = avgCenterY + newRelY;
                    nextEl.polygonPoints = rel.polygonPoints?.map(p => {
                        const oldPx = p.x - avgCenterX;
                        const oldPy = p.y - avgCenterY;
                        return {
                            x: avgCenterX + oldPx * scaleX,
                            y: avgCenterY + oldPy * scaleY,
                        };
                    });
                } else if (el.type === 'line' && el.lineX1 != null && el.lineY1 != null && el.lineX2 != null && el.lineY2 != null) {
                    const oldRelX1 = rel.lineX1! - ref.minX;
                    const oldRelY1 = rel.lineY1! - ref.minY;
                    const oldRelX2 = rel.lineX2! - ref.minX;
                    const oldRelY2 = rel.lineY2! - ref.minY;
                    nextEl.lineX1 = nextMinX + oldRelX1 * scaleX;
                    nextEl.lineY1 = nextMinY + oldRelY1 * scaleY;
                    nextEl.lineX2 = nextMinX + oldRelX2 * scaleX;
                    nextEl.lineY2 = nextMinY + oldRelY2 * scaleY;
                } else {
                    const oldRelX = rel.x - ref.minX;
                    const oldRelY = rel.y - ref.minY;
                    nextEl.x = nextMinX + oldRelX * scaleX;
                    nextEl.y = nextMinY + oldRelY * scaleY;
                    nextEl.width = Math.max(RESIZE_MIN, rel.width * scaleX);
                    nextEl.height = Math.max(RESIZE_MIN, rel.height * scaleY);
                }
                return nextEl;
            });
            update({ drawElements: nextElements });
        };
        const handleUp = () => {
            const ref = groupResizeStartRef.current;
            if (ref) {
                // 마우스업 시 리사이즈 시작값(ref.elements)으로 되돌리지 않고, 현재 프리뷰 상태를 확정한다.
                const currentElements = getDrawElements();
                update({ drawElements: currentElements });
                syncDrawElements(currentElements); // drawElements 전용 실시간 동기화
                saveHistory(currentElements);
                groupResizeStartRef.current = null;
            }
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    const handleMultiSelectionResizeStart = (dir: string, e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();
        const currentElements = getDrawElements(); // getDrawElements() 사용
        const selectedEls = currentElements.filter((el) => selectedElementIds.includes(el.id));
        if (selectedEls.length === 0) return;
        const minX = Math.min(...selectedEls.map((el) => el.x));
        const minY = Math.min(...selectedEls.map((el) => el.y));
        const maxX = Math.max(...selectedEls.map((el) => el.x + el.width));
        const maxY = Math.max(...selectedEls.map((el) => el.y + el.height));
        const elements = selectedEls.map((el) => ({
            id: el.id,
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            polygonPoints: el.polygonPoints ? el.polygonPoints.map((p) => ({ ...p })) : undefined,
            lineX1: el.lineX1,
            lineY1: el.lineY1,
            lineX2: el.lineX2,
            lineY2: el.lineY2,
        }));
        groupResizeStartRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            minX,
            minY,
            maxX,
            maxY,
            dir,
            elements,
        };
        const handleMove = (moveEvent: MouseEvent) => {
            const ref = groupResizeStartRef.current;
            if (!ref || !canvasRef.current) return;
            const cRect = canvasRef.current.getBoundingClientRect();
            const sX = canvasRef.current.clientWidth / cRect.width;
            const sY = canvasRef.current.clientHeight / cRect.height;
            const dx = (moveEvent.clientX - ref.clientX) * sX;
            const dy = (moveEvent.clientY - ref.clientY) * sY;
            let nextMinX = ref.minX;
            let nextMinY = ref.minY;
            let nextMaxX = ref.maxX;
            let nextMaxY = ref.maxY;
            const w = ref.maxX - ref.minX;
            const h = ref.maxY - ref.minY;
            if (dir.includes('e')) nextMaxX = ref.maxX + dx;
            if (dir.includes('w')) nextMinX = ref.minX + dx;
            if (dir.includes('s')) nextMaxY = ref.maxY + dy;
            if (dir.includes('n')) nextMinY = ref.minY + dy;
            const RESIZE_MIN = 16;
            let newW = Math.max(RESIZE_MIN, nextMaxX - nextMinX);
            let newH = Math.max(RESIZE_MIN, nextMaxY - nextMinY);
            const isCorner = (dir.includes('n') || dir.includes('s')) && (dir.includes('e') || dir.includes('w'));
            const shiftLockAspect = moveEvent.shiftKey && isCorner && h > 0;
            if (shiftLockAspect) {
                const aspectRatio = w / h;
                let fitW = Math.max(newW, newH * aspectRatio);
                let fitH = fitW / aspectRatio;
                if (fitH < RESIZE_MIN) {
                    fitH = RESIZE_MIN;
                    fitW = fitH * aspectRatio;
                }
                if (fitW < RESIZE_MIN) {
                    fitW = RESIZE_MIN;
                    fitH = fitW / aspectRatio;
                }
                if (dir.includes('w')) {
                    nextMinX = ref.maxX - fitW;
                    newW = fitW;
                }
                if (dir.includes('n')) {
                    nextMinY = ref.maxY - fitH;
                    newH = fitH;
                }
            }
            const scaleX = newW / w;
            const scaleY = newH / h;
            const nextElements = getDrawElements().map(el => {
                if (!ref.elements.find(re => re.id === el.id)) return el;
                const rel = ref.elements.find(re => re.id === el.id)!;
                const nextEl = { ...el };
                if (el.type === 'polygon' && el.polygonPoints?.length) {
                    const centerPoints = ref.elements.map(re => {
                        const cx = re.x + re.width / 2;
                        const cy = re.y + re.height / 2;
                        return { cx, cy };
                    });
                    const avgCenterX = centerPoints.reduce((sum, p) => sum + p.cx, 0) / centerPoints.length;
                    const avgCenterY = centerPoints.reduce((sum, p) => sum + p.cy, 0) / centerPoints.length;
                    const oldRelX = rel.x - avgCenterX;
                    const oldRelY = rel.y - avgCenterY;
                    const newRelX = oldRelX * scaleX;
                    const newRelY = oldRelY * scaleY;
                    nextEl.x = avgCenterX + newRelX;
                    nextEl.y = avgCenterY + newRelY;
                    nextEl.polygonPoints = rel.polygonPoints?.map(p => {
                        const oldPx = p.x - avgCenterX;
                        const oldPy = p.y - avgCenterY;
                        return {
                            x: avgCenterX + oldPx * scaleX,
                            y: avgCenterY + oldPy * scaleY,
                        };
                    });
                } else if (el.type === 'line' && el.lineX1 != null && el.lineY1 != null && el.lineX2 != null && el.lineY2 != null) {
                    const oldRelX1 = rel.lineX1! - ref.minX;
                    const oldRelY1 = rel.lineY1! - ref.minY;
                    const oldRelX2 = rel.lineX2! - ref.minX;
                    const oldRelY2 = rel.lineY2! - ref.minY;
                    nextEl.lineX1 = nextMinX + oldRelX1 * scaleX;
                    nextEl.lineY1 = nextMinY + oldRelY1 * scaleY;
                    nextEl.lineX2 = nextMinX + oldRelX2 * scaleX;
                    nextEl.lineY2 = nextMinY + oldRelY2 * scaleY;
                } else {
                    const oldRelX = rel.x - ref.minX;
                    const oldRelY = rel.y - ref.minY;
                    nextEl.x = nextMinX + oldRelX * scaleX;
                    nextEl.y = nextMinY + oldRelY * scaleY;
                    nextEl.width = Math.max(RESIZE_MIN, rel.width * scaleX);
                    nextEl.height = Math.max(RESIZE_MIN, rel.height * scaleY);
                }
                return nextEl;
            });
            update({ drawElements: nextElements });
        };
        const handleUp = () => {
            const ref = groupResizeStartRef.current;
            if (ref) {
                // 현재 drawElements 상태를 그대로 저장 (리사이즈된 상태 유지)
                const currentElements = getDrawElements();
                update({ drawElements: currentElements });
                saveHistory(currentElements);
                groupResizeStartRef.current = null;
            }
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    const handleElementResizeStart = (id: string, dir: string, e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();

        const el = drawElements.find(item => item.id === id);
        if (!el) return;

        elementResizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            elX: el.x,
            elY: el.y,
            w: el.width,
            h: el.height,
            dir,
            id
        };

        const handleWindowMouseMove = (moveEvent: MouseEvent) => {
            if (!elementResizeStartRef.current || !canvasRef.current) return;
            const { x, y, elX, elY, w, h, dir, id: targetId } = elementResizeStartRef.current;
            const cRect = canvasRef.current.getBoundingClientRect();
            const sX = canvasRef.current.clientWidth / cRect.width;
            const sY = canvasRef.current.clientHeight / cRect.height;
            const dx = (moveEvent.clientX - x) * sX;
            const dy = (moveEvent.clientY - y) * sY;

            let nextX = elX;
            let nextY = elY;
            let nextW = w;
            let nextH = h;

            if (dir.includes('e')) nextW = w + dx;
            if (dir.includes('w')) {
                nextW = w - dx;
                nextX = elX + dx;
            }
            if (dir.includes('s')) nextH = h + dy;
            if (dir.includes('n')) {
                nextH = h - dy;
                nextY = elY + dy;
            }

            const RESIZE_MIN = 8;
            const isCorner = (dir.includes('n') || dir.includes('s')) && (dir.includes('e') || dir.includes('w'));
            const shiftLockAspect = moveEvent.shiftKey && isCorner && h > 0;

            // Shift + 꼭짓점: 비율 유지하며 크기 변경
            if (shiftLockAspect) {
                const aspectRatio = w / h;
                let newW = Math.max(nextW, nextH * aspectRatio);
                let newH = newW / aspectRatio;
                if (newH < RESIZE_MIN) {
                    newH = RESIZE_MIN;
                    newW = newH * aspectRatio;
                }
                if (newW < RESIZE_MIN) {
                    newW = RESIZE_MIN;
                    newH = newW / aspectRatio;
                }
                nextW = newW;
                nextH = newH;
                // 고정 꼭짓점 기준으로 위치 보정
                if (dir.includes('e') && dir.includes('s')) {
                    nextX = elX;
                    nextY = elY;
                } else if (dir.includes('w') && dir.includes('s')) {
                    nextX = elX + w - nextW;
                    nextY = elY;
                } else if (dir.includes('e') && dir.includes('n')) {
                    nextX = elX;
                    nextY = elY + h - nextH;
                } else if (dir.includes('w') && dir.includes('n')) {
                    nextX = elX + w - nextW;
                    nextY = elY + h - nextH;
                }
            } else {
                if (nextW < RESIZE_MIN) {
                    if (dir.includes('w')) nextX = elX + w - RESIZE_MIN;
                    nextW = RESIZE_MIN;
                }
                if (nextH < RESIZE_MIN) {
                    if (dir.includes('n')) nextY = elY + h - RESIZE_MIN;
                    nextH = RESIZE_MIN;
                }
            }

            // Smart Guides 스냅: 다른 객체/보조선에 맞춰 리사이즈 엣지를 정렬
            if (!isLocked && screen.guideLinesVisible !== false) {
                const left = nextX;
                const right = nextX + nextW;
                const top = nextY;
                const bottom = nextY + nextH;
                const centerX = (left + right) / 2;
                const centerY = (top + bottom) / 2;

            const currentElements = getScreenById(screen.id)?.drawElements || [];
                const otherElements = currentElements
                    .filter(el => el.id !== targetId)
                    .map(el => ({
                        id: el.id,
                        x: el.x,
                        y: el.y,
                        width: el.width,
                        height: el.height,
                    }));

                const allowedXEdges: ('left' | 'right' | 'centerX')[] =
                    dir.includes('e') ? ['right', 'centerX']
                        : dir.includes('w') ? ['left', 'centerX']
                            : ['left', 'right', 'centerX'];
                const allowedYEdges: ('top' | 'bottom' | 'centerY')[] =
                    dir.includes('n') ? ['top', 'centerY']
                        : dir.includes('s') ? ['bottom', 'centerY']
                            : ['top', 'bottom', 'centerY'];

                const { deltaX, deltaY, guides, nextSnap } = getSmartGuidesAndSnap(
                    { left, right, top, bottom, centerX, centerY },
                    otherElements,
                    resizeSnapStateRef.current,
                    guideLines,
                    { allowedXEdges, allowedYEdges }
                );
                resizeSnapStateRef.current = nextSnap;

                // 방향에 따라 스냅 보정 적용
                if (deltaX !== 0) {
                    if (dir.includes('w')) {
                        // 왼쪽 엣지를 스냅, 오른쪽은 시작 기준 유지
                        const fixedRight = elX + w;
                        const snappedLeft = left + deltaX;
                        nextX = snappedLeft;
                        nextW = Math.max(8, fixedRight - snappedLeft);
                    } else if (dir.includes('e')) {
                        // 오른쪽 엣지를 스냅, 왼쪽은 고정
                        const snappedRight = right + deltaX;
                        nextW = Math.max(8, snappedRight - nextX);
                    }
                }
                if (deltaY !== 0) {
                    if (dir.includes('n')) {
                        const fixedBottom = elY + h;
                        const snappedTop = top + deltaY;
                        nextY = snappedTop;
                        nextH = Math.max(8, fixedBottom - snappedTop);
                    } else if (dir.includes('s')) {
                        const snappedBottom = bottom + deltaY;
                        nextH = Math.max(8, snappedBottom - nextY);
                    }
                }

                setAlignmentGuides(guides.vertical.length > 0 || guides.horizontal.length > 0 ? guides : null);
            } else {
                resizeSnapStateRef.current = {};
                setAlignmentGuides(null);
            }

            // Shift + 꼭짓점: 스냅 적용 후에도 비율 유지
            if (shiftLockAspect && h > 0) {
                const aspectRatio = w / h;
                let newW = Math.max(nextW, nextH * aspectRatio);
                let newH = newW / aspectRatio;
                if (newH < RESIZE_MIN) {
                    newH = RESIZE_MIN;
                    newW = newH * aspectRatio;
                }
                if (newW < RESIZE_MIN) {
                    newW = RESIZE_MIN;
                    newH = newW / aspectRatio;
                }
                nextW = newW;
                nextH = newH;
                if (dir.includes('e') && dir.includes('s')) {
                    nextX = elX;
                    nextY = elY;
                } else if (dir.includes('w') && dir.includes('s')) {
                    nextX = elX + w - nextW;
                    nextY = elY;
                } else if (dir.includes('e') && dir.includes('n')) {
                    nextX = elX;
                    nextY = elY + h - nextH;
                } else if (dir.includes('w') && dir.includes('n')) {
                    nextX = elX + w - nextW;
                    nextY = elY + h - nextH;
                }
            }
            // Update in-place for smooth visual
            const currentElements = getScreenById(screen.id)?.drawElements || [];
            const updated = currentElements.map(it => {
                if (it.id !== targetId) return it;
                const base = { ...it, x: nextX, y: nextY, width: nextW, height: nextH };
                // 다각형: 현재 bbox 기준으로 새 bbox로 스케일 (매 프레임 현재 상태→다음 상태만 적용해 과도한 늘어남 방지)
                if (it.type === 'polygon' && it.polygonPoints?.length && it.width > 0 && it.height > 0) {
                    const sx = nextW / it.width;
                    const sy = nextH / it.height;
                    base.polygonPoints = it.polygonPoints.map(p => ({
                        x: nextX + (p.x - it.x) * sx,
                        y: nextY + (p.y - it.y) * sy,
                    }));
                } else if (it.type === 'line' && it.lineX1 != null && it.lineY1 != null && it.lineX2 != null && it.lineY2 != null && it.width > 0 && it.height > 0) {
                    const sx = nextW / it.width;
                    const sy = nextH / it.height;
                    const lineX1 = nextX + (it.lineX1 - it.x) * sx;
                    const lineY1 = nextY + (it.lineY1 - it.y) * sy;
                    const lineX2 = nextX + (it.lineX2 - it.x) * sx;
                    const lineY2 = nextY + (it.lineY2 - it.y) * sy;
                    base.lineX1 = lineX1;
                    base.lineY1 = lineY1;
                    base.lineX2 = lineX2;
                    base.lineY2 = lineY2;
                }
                return base;
            });
            // rAF throttle: 리사이즈 중 Zustand 업데이트를 60fps로 제한
            if (resizeRafIdRef.current !== undefined) cancelAnimationFrame(resizeRafIdRef.current);
            resizeRafIdRef.current = requestAnimationFrame(() => {
                resizeRafIdRef.current = undefined;
            update({ drawElements: updated });
                syncDrawElementsDuringInteraction(updated, lastResizeSyncAtRef);
            });
        };

        const handleWindowMouseUp = () => {
            if (resizeRafIdRef.current !== undefined) {
                cancelAnimationFrame(resizeRafIdRef.current);
                resizeRafIdRef.current = undefined;
            }
            if (elementResizeStartRef.current) {
                const currentElements = getScreenById(screen.id)?.drawElements || [];
                syncDrawElements(currentElements); // drawElements 전용 실시간 동기화
            }
            lastResizeSyncAtRef.current = 0;
            resizeSnapStateRef.current = {};
            setAlignmentGuides(null);
            elementResizeStartRef.current = null;
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };

        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (!canEdit || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.clientWidth / rect.width;
        const scaleY = canvasRef.current.clientHeight / rect.height;
        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);

        if (activeTool === 'polygon' && !polygonPresetToCreate) return;
        if (activeTool === 'line' && !linePresetToCreate) return;
        if (activeTool === 'arrow' && !arrowPresetToCreate) return;

        if (activeTool === 'line' && linePresetToCreate) {
            const start = { x, y };
            setLineDrawStart(start);
            lineDrawStartRef.current = start;
            setLineDrawEnd(null);
            lineDrawEndRef.current = null;
            setIsDrawing(true);
            return;
        }

        if (activeTool === 'select') {
            // Start marquee drag-selection on background click
            // Check if we clicked the canvas background or an element that should allow marquee
            const target = e.target as HTMLElement;
            const isBackground = target === canvasRef.current || 
                               target.classList.contains('react-flow__pane') ||
                               (!target.closest('.group-canvas-element') && !target.closest('.floating-panel') && !target.closest('.nodrag'));
            
            if (isBackground) {
                if (!e.shiftKey) {
                    setSelectedElementIds([]);
                    setEditingTableId(null);
                    setEditingTextId(null);
                    setSelectedCellIndices([]);
                    setEditingCellIndex(null);
                    setSelectedGuideLine(null);
                    setStylePaintActive(false);
                    setStylePaintSnapshot(null);
                    setStylePaintSourceId(null);
                }
                setIsDragSelecting(true);
                setDragSelectStart({ x, y });
                setDragSelectRect({ x, y, w: 0, h: 0 });
            }
            return;
        }

        setIsDrawing(true);
        setDrawStartPos({ x, y });

        const newId = `draw_${Date.now()}`;
        let newElement: DrawElement;

        if (activeTool === 'polygon' && polygonPresetToCreate) {
            setDrawingPolygonPreset(polygonPresetToCreate);
            newElement = {
                id: newId,
                type: 'polygon',
                x,
                y,
                width: 0,
                height: 0,
                fill: '#ffffff',
                stroke: '#2c3e7c',
                strokeWidth: 2,
                polygonPreset: polygonPresetToCreate,
                zIndex: drawElements.length + 1,
            };
        } else if (activeTool === 'arrow' && arrowPresetToCreate) {
            newElement = {
                id: newId,
                type: 'arrow',
                x,
                y,
                width: 0, // 🚀 드래그로 크기 지정을 위해 0으로 시작
                height: 0, // 🚀 드래그로 크기 지정을 위해 0으로 시작
                fill: '#2c3e7c',
                stroke: '#2c3e7c',
                strokeWidth: 2,
                arrowPreset: arrowPresetToCreate,
                zIndex: drawElements.length + 1,
            };
        } else if (activeTool === 'func-no') {
            // Find the highest number in existing func-no elements
            const existingFuncNos = drawElements.filter(el => el.type === 'func-no');
            let nextNo = 1;
            if (existingFuncNos.length > 0) {
                const numbers = existingFuncNos
                    .map(el => parseInt(el.text || '0'))
                    .filter(n => !isNaN(n));
                if (numbers.length > 0) {
                    nextNo = Math.max(...numbers) + 1;
                }
            }

            newElement = {
                id: newId,
                type: 'func-no',
                x,
                y,
                width: 24,
                height: 24,
                fill: '#ef4444', // Red color for function numbers
                stroke: '#ffffff',
                strokeWidth: 2,
                zIndex: drawElements.length + 1,
                text: nextNo.toString(),
                fontSize: 12,
                color: '#ffffff',
                borderRadius: 12, // Circle shape
            };
        } else {
            newElement = {
                id: newId,
                type: activeTool === 'table' ? 'table' : activeTool === 'rect' ? 'rect' : activeTool === 'circle' ? 'circle' : activeTool === 'text' ? 'text' : 'image',
                x,
                y,
                width: activeTool === 'table' ? 200 : 0,
                height: activeTool === 'table' ? 120 : 0,
                fill: '#ffffff',
                stroke: '#2c3e7c',
                strokeWidth: 2,
                zIndex: drawElements.length + 1,
                text: activeTool === 'text' ? '텍스트 입력' : undefined,
                fontSize: 14,
                color: '#333333',
                ...(activeTool === 'table' ? {
                    tableRows: 3,
                    tableCols: 3,
                    tableCellData: Array(9).fill(''),
                    tableColWidths: [100 / 3, 100 / 3, 100 / 3]
                } : {})
            };
        }
        setTempElement(newElement);
    };

    const handleElementMouseDown = (id: string, e: React.MouseEvent) => {
        if (!canEdit) return;

        if (tryApplyStylePaintRef.current(id, e)) return;

        // 그리기 도구일 때는 객체 위에서도 드래그로 새 객체 생성 가능하도록 이벤트를 캔버스까지 전파
        const isDrawingTool = ['rect', 'circle', 'polygon', 'line', 'func-no', 'table', 'text', 'image', 'arrow'].includes(activeTool) ||
            (activeTool === 'polygon' && polygonPresetToCreate) ||
            (activeTool === 'line' && linePresetToCreate) ||
            (activeTool === 'arrow' && arrowPresetToCreate);
        if (isDrawingTool) {
            return; // stopPropagation 하지 않음 → 캔버스에서 handleCanvasMouseDown이 받아서 그리기 시작
        }

        e.stopPropagation();

        // select 도구: 선택 및 드래그 이동

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || !canvasRef.current) return;
        const scaleX = canvasRef.current.clientWidth / rect.width;
        const scaleY = canvasRef.current.clientHeight / rect.height;

        const clickedEl = drawElements.find(el => el.id === id);

        let nextSelected: string[];
        if (e.shiftKey) {
            nextSelected = [...selectedElementIds];
            if (clickedEl?.groupId) {
                const groupIds = drawElements.filter(el => el.groupId === clickedEl.groupId).map(el => el.id);
                const allInSelected = groupIds.every(gid => nextSelected.includes(gid));
                if (allInSelected) {
                    nextSelected = nextSelected.filter(sid => !groupIds.includes(sid));
                } else {
                    nextSelected = [...new Set([...nextSelected, ...groupIds])];
                }
            } else if (nextSelected.includes(id)) {
                nextSelected = nextSelected.filter(sid => sid !== id);
            } else {
                nextSelected.push(id);
            }
        } else {
            // 이미 다중 선택된 요소를 다시 잡아 드래그할 때는 선택을 유지해야 함께 이동된다.
            if (selectedElementIds.includes(id)) {
                nextSelected = selectedElementIds;
            } else if (clickedEl?.groupId) {
                nextSelected = drawElements.filter(el => el.groupId === clickedEl.groupId).map(el => el.id);
            } else {
                nextSelected = [id];
            }
        }
        setSelectedElementIds(nextSelected);

        // Exit table cell-edit mode when the edited table is no longer among selected elements (e.g. clicked a shape)
        if (editingTableId && !nextSelected.includes(editingTableId)) {
            setEditingTableId(null);
            setSelectedCellIndices([]);
            setEditingCellIndex(null);
        }

        // 테이블 선택 해제 시 셀 선택도 초기화
        if (clickedEl?.type === 'table' && e.shiftKey && !nextSelected.includes(id)) {
            setEditingTableId(null);
            setSelectedCellIndices([]);
            setEditingCellIndex(null);
        }

        // Disable moving if we are in an editing mode for this specific element
        if (editingTableId === id || editingTextId === id) {
            return;
        }

        // 표는 일반 요소와 동일하게 즉시 드래그 준비 (편집 모드는 위에서 이미 return됨)

        // Prepare for dragging all selected elements
        setIsMoving(true);
        setDraggingElementIds(nextSelected);
        snapStateRef.current = {};
        setDragPreviews(null);

        const offsets: Record<string, { x: number, y: number }> = {};
        nextSelected.forEach(sid => {
            const el = drawElements.find(item => item.id === sid);
            if (el) {
                offsets[sid] = {
                    x: (e.clientX - rect.left) * scaleX - el.x,
                    y: (e.clientY - rect.top) * scaleY - el.y
                };
            }
        });
        setDragOffsets(offsets);

        // Reset text editing state when starting to move a DIFFERENT element
        if (editingTextId && !nextSelected.includes(editingTextId)) {
            setEditingTextId(null);
        }
    };

    const handleElementDoubleClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!canEdit) return;
        const el = drawElements.find(item => item.id === id);
        if (el && (el.type === 'rect' || el.type === 'circle' || el.type === 'text')) {
            // 모든 도형 및 텍스트 상은 더블 클릭 시 편집 모드로 진입 허용 (컴포넌트 인스턴스 포함)
            setEditingTextId(id);
        }
        // 테이블 더블 클릭은 셀 레벨에서 처리하므로 여기서 명시적으로 무시
        if (el && el.type === 'table') {
            return;
        }
    };


    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.clientWidth / rect.width;
        const scaleY = canvasRef.current.clientHeight / rect.height;
        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);

        if (lineDrawStartRef.current) {
            const start = lineDrawStartRef.current;
            let end = { x, y };
            if (e.shiftKey) {
                const dx = x - start.x;
                const dy = y - start.y;
                end = Math.abs(dx) >= Math.abs(dy) ? { x, y: start.y } : { x: start.x, y };
            }
            setLineDrawEnd(end);
            lineDrawEndRef.current = end;
            return;
        }

        // Marquee drag-selection logic
        if (isDragSelecting) {
            const selX = Math.min(x, dragSelectStart.x);
            const selY = Math.min(y, dragSelectStart.y);
            const selW = Math.abs(x - dragSelectStart.x);
            const selH = Math.abs(y - dragSelectStart.y);
            setDragSelectRect({ x: selX, y: selY, w: selW, h: selH });

            // Select elements that intersect with the drag selection rectangle
            let intersecting = drawElements.filter(el => {
                const elRight = el.x + el.width;
                const elBottom = el.y + el.height;
                return (
                    el.x < selX + selW &&
                    elRight > selX &&
                    el.y < selY + selH &&
                    elBottom > selY
                );
            }).map(el => el.id);
            // 그룹된 객체가 포함된 경우 그룹 전체 선택
            const groupIds = new Set(drawElements.filter(el => intersecting.includes(el.id) && el.groupId).map(el => el.groupId!).filter(Boolean));
            groupIds.forEach(gid => {
                const inGroup = drawElements.filter(el => el.groupId === gid).map(el => el.id);
                intersecting = [...new Set([...intersecting, ...inGroup])];
            });
            setSelectedElementIds(intersecting);
            return;
        }

        // Drawing Logic
        if (isDrawing && tempElement) {
            if (tempElement.type === 'table') {
                // Tables use fixed initial size, just track position
                setTempElement({
                    ...tempElement,
                    x: drawStartPos.x,
                    y: drawStartPos.y,
                });
            } else if (tempElement.type === 'arrow') {
                // 🚀 화살표도 크기 지정 가능하도록 수정
                let width = x - drawStartPos.x;
                let height = y - drawStartPos.y;

                // Shift + 드래그: 정사각형 비율로 초기 크기 설정
                if (e.shiftKey) {
                    const side = Math.max(Math.abs(width), Math.abs(height));
                    const signW = width < 0 ? -1 : 1;
                    const signH = height < 0 ? -1 : 1;
                    width = signW * side;
                    height = signH * side;
                }

                setTempElement({
                    ...tempElement,
                    x: width < 0 ? drawStartPos.x + width : drawStartPos.x,
                    y: height < 0 ? drawStartPos.y + height : drawStartPos.y,
                    width: Math.max(20, Math.abs(width)), // 최소 크기 20px
                    height: Math.max(20, Math.abs(height)) // 최소 크기 20px
                });
            } else {
                let width = x - drawStartPos.x;
                let height = y - drawStartPos.y;

                // Shift + 드래그: 정사각형 비율로 초기 크기 설정
                if (e.shiftKey) {
                    const side = Math.max(Math.abs(width), Math.abs(height));
                    const signW = width < 0 ? -1 : 1;
                    const signH = height < 0 ? -1 : 1;
                    width = signW * side;
                    height = signH * side;
                }

                setTempElement({
                    ...tempElement,
                    x: width < 0 ? drawStartPos.x + width : drawStartPos.x,
                    y: height < 0 ? drawStartPos.y + height : drawStartPos.y,
                    width: Math.abs(width),
                    height: Math.abs(height)
                });
            }
            return;
        }

        // Moving Logic - keep objects within canvas bounds (논리 캔버스 크기 사용, FIXED_TOP 등과 무관하게 이동 영역 고정)
        if (draggingElementIds.length > 0) {
            const cw = canvasW;
            const ch = canvasH;
            const dragged = drawElements.filter(el => draggingElementIds.includes(el.id));
            const withOffsets = dragged.map(item => {
                const offset = dragOffsets[item.id];
                if (!offset) return null;
                return { ...item, newX: x - offset.x, newY: y - offset.y };
            }).filter(Boolean) as Array<{ newX: number; newY: number } & (typeof dragged[0])>;
            if (withOffsets.length === 0) return;

            let minNewX = Math.min(...withOffsets.map(o => o.newX));
            const maxRight = Math.max(...withOffsets.map(o => o.newX + o.width));
            let minNewY = Math.min(...withOffsets.map(o => o.newY));
            const maxBottom = Math.max(...withOffsets.map(o => o.newY + o.height));
            const centerX = (minNewX + maxRight) / 2;
            const centerY = (minNewY + maxBottom) / 2;

            // Smart Guides: 다른 요소와 정렬 시 스냅 + 가이드라인 표시
            // - 드래그 중인 그룹을 완전히 감싸는 rect(컨테이너)도 정렬 후보에 포함하여,
            //   자식 도형(B)이 컨테이너(A)의 가로/세로 중앙에 맞춰질 때 스마트 그리드가 나오도록 함.
            // - groupId 로 묶인 요소들은 하나의 바운딩 박스로만 스냅/정렬 대상으로 사용하여,
            //   그룹 내부 개별 요소들이 각각 따로 스냅되지 않도록 함.

            // 드래그 중이 아닌 요소들만 대상 (컨테이너 rect 포함 → 중앙 정렬 시 가이드 표시)
            const staticAll = drawElements.filter(el => !draggingElementIds.includes(el.id));

            // A(컨테이너) 안에 있는 B,C 만 서로 스마트 그리드가 적용되도록,
            // 드래그 중인 요소들을 모두 포함하는 "부모 컨테이너"가 있으면
            // 그 컨테이너 내부 요소들만 정렬 대상으로 제한한다.
            let staticElements = staticAll;
            let isInsideContainer = false; // 컨테이너 내부로 제한된 경우 → B,C 끼리도 스마트 가이드 적용
            if (staticAll.length > 0) {
                // 드래그 중인 요소들의 바운딩 박스
                const draggedBoxes = dragged.map(el => ({
                    left: el.x,
                    top: el.y,
                    right: el.x + el.width,
                    bottom: el.y + el.height,
                }));

                const containerCandidates = staticAll.filter(el => {
                    const left = el.x;
                    const top = el.y;
                    const right = el.x + el.width;
                    const bottom = el.y + el.height;
                    if (right <= left || bottom <= top) return false;
                    // 모든 드래그 요소를 감싸는 요소만 컨테이너 후보로 사용
                    return draggedBoxes.every(b =>
                        b.left >= left &&
                        b.right <= right &&
                        b.top >= top &&
                        b.bottom <= bottom
                    );
                });

                if (containerCandidates.length > 0) {
                    // 가장 작은(타이트한) 컨테이너 하나만 사용
                    const primary = containerCandidates.reduce((best, cur) => {
                        const bestArea = best.width * best.height;
                        const curArea = cur.width * cur.height;
                        return curArea < bestArea ? cur : best;
                    });
                    const pLeft = primary.x;
                    const pTop = primary.y;
                    const pRight = primary.x + primary.width;
                    const pBottom = primary.y + primary.height;

                    staticElements = staticAll.filter(el => {
                        if (el.id === primary.id) return true;
                        const left = el.x;
                        const top = el.y;
                        const right = el.x + el.width;
                        const bottom = el.y + el.height;
                        // 컨테이너 안에 완전히 들어있는 요소만 후보
                        return left >= pLeft && right <= pRight && top >= pTop && bottom <= pBottom;
                    });
                    isInsideContainer = true;
                }
            }

            // groupId 가 있는 요소들은 그룹 바운딩 박스로 합치고, 나머지는 단일 요소로 사용
            // 단, 현재 드래그 중인 그룹 내부 요소들은 서로에 대해 개별 스냅이 가능해야 하므로
            // draggingElementIds 에 속한 요소들의 groupId 에 대해서는 그룹 합치기를 하지 않는다.
            const groupedById = new Map<string, typeof staticElements>();
            const singles: typeof staticElements = [];
            const draggingGroupIds = new Set(
                drawElements
                    .filter(el => draggingElementIds.includes(el.id) && el.groupId)
                    .map(el => el.groupId as string),
            );

            for (const el of staticElements) {
                if (el.groupId && !draggingGroupIds.has(el.groupId)) {
                    if (!groupedById.has(el.groupId)) {
                        groupedById.set(el.groupId, []);
                    }
                    groupedById.get(el.groupId)!.push(el);
                } else {
                    singles.push(el);
                }
            }

            const groupBoxes = Array.from(groupedById.entries()).map(([groupId, els]) => {
                const left = Math.min(...els.map(e => e.x));
                const right = Math.max(...els.map(e => e.x + e.width));
                const top = Math.min(...els.map(e => e.y));
                const bottom = Math.max(...els.map(e => e.y + e.height));
                return {
                    id: groupId,
                    x: left,
                    y: top,
                    width: right - left,
                    height: bottom - top,
                };
            });

            const otherElements = [
                ...singles.map(el => ({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height })),
                ...groupBoxes,
            ];
            const { deltaX, deltaY, guides, nextSnap } = getSmartGuidesAndSnap(
                { left: minNewX, right: maxRight, centerX, top: minNewY, bottom: maxBottom, centerY },
                otherElements,
                snapStateRef.current,
                screen.guideLinesVisible !== false ? guideLines : undefined,
                { skipProximityFilter: isInsideContainer }
            );
            snapStateRef.current = nextSnap;

            const snapX = deltaX;
            const snapY = deltaY;
            const snappedMinX = minNewX + snapX;
            const snappedMaxRight = maxRight + snapX;
            const snappedMinY = minNewY + snapY;
            const snappedMaxBottom = maxBottom + snapY;

            // Single correction so entire group stays in bounds while preserving relative positions
            const corrX = Math.max(-snappedMinX, Math.min(cw - snappedMaxRight, 0));
            const corrY = Math.max(-snappedMinY, Math.min(ch - snappedMaxBottom, 0));

            const nextElements = getDrawElements().map(item => {
                const o = withOffsets.find(w => w.id === item.id);
                if (!o) return item;

                const nextX = o.newX + snapX + corrX;
                const nextY = o.newY + snapY + corrY;
                const dx = nextX - item.x;
                const dy = nextY - item.y;

                // 드래그 중에도 선/다각형의 내부 좌표를 함께 이동시켜
                // 프레임 중간 상태 동기화 시 "원위치로 튕김"처럼 보이는 현상을 방지한다.
                if (item.type === 'polygon' && item.polygonPoints?.length) {
                    const movedPoints = item.polygonPoints.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
                    const minX = Math.min(...movedPoints.map((pt) => pt.x));
                    const minY = Math.min(...movedPoints.map((pt) => pt.y));
                    const maxX = Math.max(...movedPoints.map((pt) => pt.x));
                    const maxY = Math.max(...movedPoints.map((pt) => pt.y));
                    return {
                        ...item,
                        x: minX,
                        y: minY,
                        width: maxX - minX,
                        height: maxY - minY,
                        polygonPoints: movedPoints,
                    };
                }

                if (item.type === 'line' && item.lineX1 != null && item.lineY1 != null && item.lineX2 != null && item.lineY2 != null) {
                    const lineX1 = item.lineX1 + dx;
                    const lineY1 = item.lineY1 + dy;
                    const lineX2 = item.lineX2 + dx;
                    const lineY2 = item.lineY2 + dy;
                    const minX = Math.min(lineX1, lineX2);
                    const minY = Math.min(lineY1, lineY2);
                    const maxX = Math.max(lineX1, lineX2);
                    const maxY = Math.max(lineY1, lineY2);
                    return {
                        ...item,
                        x: minX,
                        y: minY,
                        width: maxX - minX || 1,
                        height: maxY - minY || 1,
                        lineX1,
                        lineY1,
                        lineX2,
                        lineY2,
                    };
                }

                return { ...item, x: nextX, y: nextY };
            });
            const preview: Record<string, { x: number; y: number }> = {};
            nextElements.forEach((el) => {
                if (draggingElementIds.includes(el.id)) {
                    preview[el.id] = { x: el.x, y: el.y };
                }
            });
            // rAF throttle: 60fps로 setState 제한 (매 mousemove마다 리렌더 방지)
            if (dragRafIdRef.current !== undefined) cancelAnimationFrame(dragRafIdRef.current);
            dragRafIdRef.current = requestAnimationFrame(() => {
                dragRafIdRef.current = undefined;
                setDragPreviews(preview);
            setAlignmentGuides(guides.vertical.length > 0 || guides.horizontal.length > 0 ? guides : null);

                // 드래그 중 협업 전송은 유지하되, 짧은 간격으로만 보내 메인 스레드 부담을 낮춘다.
                if (draggingElementIds.length > 0) {
                    syncDrawElementsDuringInteraction(nextElements, lastDragSyncAtRef);
                }
            });
        }
    };

    const handleCanvasMouseUp = () => {
        // End marquee drag-selection
        if (isDragSelecting) {
            setIsDragSelecting(false);
            setDragSelectRect(null);
            return;
        }

        if (lineDrawStartRef.current && lineDrawEndRef.current && linePresetToCreate) {
            const start = lineDrawStartRef.current;
            const end = lineDrawEndRef.current;
            const minX = Math.min(start.x, end.x);
            const minY = Math.min(start.y, end.y);
            const maxX = Math.max(start.x, end.x);
            const maxY = Math.max(start.y, end.y);
            const lineEl: DrawElement = {
                id: `draw_${Date.now()}`,
                type: 'line',
                x: minX,
                y: minY,
                width: maxX - minX || 1,
                height: maxY - minY || 1,
                lineX1: start.x,
                lineY1: start.y,
                lineX2: end.x,
                lineY2: end.y,
                stroke: '#2c3e7c',
                strokeWidth: 2,
                strokeStyle: linePresetToCreate.strokeStyle,
                lineEnd: linePresetToCreate.lineEnd,
                zIndex: drawElements.length + 1,
            };
            const nextElements = [...drawElements, lineEl];
            update({ drawElements: nextElements });
            syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
            saveHistory(nextElements);
            setSelectedElementIds([lineEl.id]);
            setLineDrawStart(null);
            setLineDrawEnd(null);
            lineDrawStartRef.current = null;
            lineDrawEndRef.current = null;
            setIsDrawing(false);
            if (activeTool !== 'select') setActiveTool('select');
            return;
        }

        if (isDrawing && tempElement) {
            // Skip if too small (but always allow tables and text)
            if (tempElement.width > 5 || tempElement.height > 5 || tempElement.type === 'text' || tempElement.type === 'table') {
                if (drawingPolygonPreset) {
                    const pts = getPolygonPointsForPreset(drawingPolygonPreset, tempElement.x, tempElement.y, tempElement.width, tempElement.height);
                    const polygonEl: DrawElement = {
                        ...tempElement,
                        id: tempElement.id,
                        type: 'polygon',
                        x: tempElement.x,
                        y: tempElement.y,
                        width: tempElement.width,
                        height: tempElement.height,
                        polygonPoints: pts,
                        polygonPreset: drawingPolygonPreset,
                        fill: tempElement.fill ?? '#ffffff',
                        stroke: tempElement.stroke ?? '#2c3e7c',
                        strokeWidth: tempElement.strokeWidth ?? 2,
                        zIndex: tempElement.zIndex ?? drawElements.length + 1,
                    };
                    const nextElements = [...drawElements, polygonEl];
                    update({ drawElements: nextElements });
                    syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
                    saveHistory(nextElements);
                    setSelectedElementIds([polygonEl.id]);
                } else if (tempElement.type === 'arrow') {
                    // 🚀 화살표는 최소 크기 체크 후 추가
                    if (tempElement.width >= 20 && tempElement.height >= 20) {
                const nextElements = [...drawElements, tempElement];
                update({ drawElements: nextElements });
                        syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
                saveHistory(nextElements);
                setSelectedElementIds([tempElement.id]);
            }
                } else {
                    // 🚀 일반 도형들만 드래그 선 적용
                    const nextElements = [...drawElements, tempElement];
                    update({ drawElements: nextElements });
                    syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
                    saveHistory(nextElements);
                    setSelectedElementIds([tempElement.id]);
                }
            }
            setDrawingPolygonPreset(null);
        } else if (draggingElementIds.length > 0) {
            // 진행 중인 rAF를 먼저 취소 (commit 후 stale preview setState 방지)
            if (dragRafIdRef.current !== undefined) {
                cancelAnimationFrame(dragRafIdRef.current);
                dragRafIdRef.current = undefined;
            }
            // Finalize move: 드래그 중에는 프리뷰만 갱신하고, mouseup 시점에 한 번만 커밋
            const currentPreviews = useDragStore.getState().previews;
            const committedElements = currentPreviews
                ? drawElements.map((el) => {
                    const p = currentPreviews[el.id];
                    if (!p) return el;
                    const dx = p.x - el.x;
                    const dy = p.y - el.y;
                    if (el.type === 'polygon' && el.polygonPoints?.length) {
                        const newPoints = el.polygonPoints.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
                        const minX = Math.min(...newPoints.map(q => q.x));
                        const minY = Math.min(...newPoints.map(q => q.y));
                        const maxX = Math.max(...newPoints.map(q => q.x));
                        const maxY = Math.max(...newPoints.map(q => q.y));
                        return { ...el, x: minX, y: minY, width: maxX - minX, height: maxY - minY, polygonPoints: newPoints };
                    }
                    if (el.type === 'line' && el.lineX1 != null && el.lineY1 != null && el.lineX2 != null && el.lineY2 != null) {
                        const lineX1 = el.lineX1 + dx;
                        const lineY1 = el.lineY1 + dy;
                        const lineX2 = el.lineX2 + dx;
                        const lineY2 = el.lineY2 + dy;
                        const minX = Math.min(lineX1, lineX2);
                        const minY = Math.min(lineY1, lineY2);
                        const maxX = Math.max(lineX1, lineX2);
                        const maxY = Math.max(lineY1, lineY2);
                        return { ...el, x: minX, y: minY, width: maxX - minX || 1, height: maxY - minY || 1, lineX1, lineY1, lineX2, lineY2 };
                    }
                    return { ...el, x: p.x, y: p.y };
                })
                : drawElements;
            update({ drawElements: committedElements });
            syncDrawElements(committedElements); // drawElements 전용 실시간 동기화
            lastDragSyncAtRef.current = 0;
            saveHistory(committedElements);
            setDraggingElementIds([]);
            setIsMoving(false);
            setAlignmentGuides(null);
            snapStateRef.current = {};
            setDragPreviews(null);
        }

        setIsDrawing(false);
        setTempElement(null);
        setDrawingPolygonPreset(null);
        setLineDrawStart(null);
        setLineDrawEnd(null);
        lineDrawStartRef.current = null;
        lineDrawEndRef.current = null;
        if (activeTool !== 'select') setActiveTool('select');
    };

    const flushPendingFontSize = useCallback(() => {
        const pending = pendingFontSizeRef.current;
        if (!pending) return;
        pendingFontSizeRef.current = null;
        if (pendingFontSizeTimerRef.current) {
            clearTimeout(pendingFontSizeTimerRef.current);
            pendingFontSizeTimerRef.current = null;
        }
        const current = getScreenById(screen.id)?.drawElements ?? [];
        const next = current.map((el) => el.id === pending.elementId ? { ...el, fontSize: pending.px } : el);
        update({ drawElements: next });
        pendingSyncDrawElementsRef.current = next;
        if (pendingSyncTimerRef.current) clearTimeout(pendingSyncTimerRef.current);
        pendingSyncTimerRef.current = setTimeout(() => {
            pendingSyncTimerRef.current = null;
            const toSend = pendingSyncDrawElementsRef.current;
            if (toSend) {
                pendingSyncDrawElementsRef.current = null;
                syncDrawElements(toSend); // drawElements 전용 실시간 동기화
            }
        }, 300);
    }, [getScreenById, screen.id, update, saveHistory, syncDrawElements]);

    // const elementsRef = useRef(drawElements || []);
    // useEffect(() => { elementsRef.current = drawElements || []; }, [drawElements]);
    // const getDrawElements = useCallback(() => elementsRef.current, []);

    const {
        updateElement,
        updateElements,
        deleteElements,
        handleLayerAction,
        handleObjectAlign,
        handleGroup,
        handleUngroup,
        flushPendingSync,
    } = useCanvasElementActions({
        screen,
        getDrawElements,
        selectedElementIds,
        update,
        syncUpdate,
        saveHistory,
        setSelectedElementIds,
        sendOperation,
        user,
        pendingFontSizeRef,
        pendingFontSizeTimerRef,
        pendingSyncDrawElementsRef,
        pendingSyncTimerRef,
        flushPendingFontSize,
        PENDING_FONT_SIZE_DEBOUNCE_MS,
    });

    const tryApplyStylePaint = useCallback(
        (id: string, e: React.MouseEvent): boolean => {
            if (!stylePaintActive || !stylePaintSnapshot || isLocked) return false;
            e.preventDefault();
            e.stopPropagation();
            if (id === stylePaintSourceId) {
                setStylePaintActive(false);
                setStylePaintSnapshot(null);
                setStylePaintSourceId(null);
                return true;
            }
            updateElement(id, stylePaintSnapshot);
            flushPendingSync();
            setStylePaintActive(false);
            setStylePaintSnapshot(null);
            setStylePaintSourceId(null);
            setSelectedElementIds([id]);
            setIsMoving(false);
            setDraggingElementIds([]);
            setDragPreviews(null);
            return true;
        },
        [
            stylePaintActive,
            stylePaintSnapshot,
            stylePaintSourceId,
            isLocked,
            updateElement,
            flushPendingSync,
        ]
    );
    tryApplyStylePaintRef.current = tryApplyStylePaint;

    // 텍스트 선택 상태를 저장하는 함수
    const saveTextSelection = useCallback(() => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
            return {
                range: sel.getRangeAt(0).cloneRange(),
                element: sel.anchorNode?.parentElement || null
            };
        }
        return null;
    }, []);

    const applyToSelection = useCallback((fn: () => void, fromTable: boolean): boolean => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            fn();
            // Find the contenteditable parent even if not activeElement
            let node: Node | null = sel.anchorNode;
            while (node && node !== document.body) {
                if (node instanceof HTMLElement && node.getAttribute('contenteditable') === 'true') {
                    node.dispatchEvent(new Event('input', { bubbles: true }));
                    break;
                }
                node = node.parentNode;
            }
            return false;
        }
        return !fromTable;
    }, []);

    const applyFontSizePx = useCallback((): boolean => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;

        // Find the contenteditable container from selection
        let editableNode: Node | null = sel.anchorNode;
        let editable: HTMLElement | null = null;
        while (editableNode && editableNode !== document.body) {
            if (editableNode instanceof HTMLElement && editableNode.getAttribute('contenteditable') === 'true') {
                editable = editableNode;
                break;
            }
            editableNode = editableNode.parentNode;
        }
        if (!editable) return false;

        // document.execCommand('fontSize', false, '7') and FONT/SPAN search logic removed
        // to prevent <font> tag generation. Font size is now managed at cell level only.
        return false;
    }, []);

    const handlePolygonVertexDragStart = (id: string, pointIndex: number, e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();
        const el = drawElements.find(item => item.id === id && item.type === 'polygon' && item.polygonPoints?.length);
        if (!el?.polygonPoints) return;
        polygonVertexDragRef.current = { elementId: id, pointIndex, startPoints: [...el.polygonPoints] };
        const handleMove = (moveE: MouseEvent) => {
            if (!polygonVertexDragRef.current || !canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const scaleX = canvasRef.current.clientWidth / rect.width;
            const scaleY = canvasRef.current.clientHeight / rect.height;
            const rawX = Math.round((moveE.clientX - rect.left) * scaleX);
            const rawY = Math.round((moveE.clientY - rect.top) * scaleY);
            const currentEl = getScreenById(screen.id)?.drawElements?.find(item => item.id === id);
            if (!currentEl || currentEl.type !== 'polygon' || !currentEl.polygonPoints) return;

            // 다각형 꼭짓점 전용 스마트 가이드: 끌고 있는 점을 다른 요소·다른 꼭짓점에 맞춤
            const currentElements = getScreenById(screen.id)?.drawElements || [];
            const otherElements: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
            currentElements.forEach(item => {
                if (item.id === id) {
                    if (item.type === 'polygon' && Array.isArray(item.polygonPoints)) {
                        item.polygonPoints.forEach((pt: { x: number; y: number }, i: number) => {
                            if (i !== pointIndex) otherElements.push({ id: `polygon-vertex-${id}-${i}`, x: pt.x, y: pt.y, width: 0, height: 0 });
                        });
                    }
                } else {
                    otherElements.push({ id: item.id, x: item.x, y: item.y, width: item.width || 0, height: item.height || 0 });
                    if (item.type === 'polygon' && Array.isArray(item.polygonPoints)) {
                        item.polygonPoints.forEach((pt: { x: number; y: number }, i: number) => {
                            otherElements.push({ id: `polygon-vertex-${item.id}-${i}`, x: pt.x, y: pt.y, width: 0, height: 0 });
                        });
                    }
                }
            });
            const pointBounds = { left: rawX, right: rawX, top: rawY, bottom: rawY, centerX: rawX, centerY: rawY };
            const currentScreen = getScreenById(screen.id);
            const guideLinesInput = currentScreen?.guideLinesVisible !== false && currentScreen?.guideLines ? currentScreen.guideLines : undefined;
            const { deltaX, deltaY, guides, nextSnap } = getSmartGuidesAndSnap(
                pointBounds,
                otherElements,
                polygonVertexSnapStateRef.current,
                guideLinesInput,
                { allowedXEdges: ['left', 'right', 'centerX'], allowedYEdges: ['top', 'bottom', 'centerY'] }
            );
            polygonVertexSnapStateRef.current = nextSnap;
            setAlignmentGuides(guides.vertical.length > 0 || guides.horizontal.length > 0 ? guides : null);

            const x = rawX + deltaX;
            const y = rawY + deltaY;
            const newPoints = currentEl.polygonPoints.map((p, i) => i === pointIndex ? { x, y } : p);
            const minX = Math.min(...newPoints.map(p => p.x));
            const minY = Math.min(...newPoints.map(p => p.y));
            const maxX = Math.max(...newPoints.map(p => p.x));
            const maxY = Math.max(...newPoints.map(p => p.y));
            updateElement(id, { polygonPoints: newPoints, x: minX, y: minY, width: maxX - minX, height: maxY - minY });
        };
        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove, true);
            window.removeEventListener('mouseup', handleUp, true);
            polygonVertexDragRef.current = null;
            polygonVertexSnapStateRef.current = {};
            setAlignmentGuides(null);
        };
        window.addEventListener('mousemove', handleMove, true);
        window.addEventListener('mouseup', handleUp, true);
    };

    const handleLineVertexDragStart = (id: string, pointIndex: 0 | 1, e: React.MouseEvent) => {
        if (isLocked) return;
        e.stopPropagation();
        e.preventDefault();
        const el = drawElements.find(item => item.id === id && item.type === 'line' && item.lineX1 != null && item.lineY1 != null && item.lineX2 != null && item.lineY2 != null);
        if (!el) return;
        lineVertexDragRef.current = { elementId: id, pointIndex };
        const handleMove = (moveE: MouseEvent) => {
            if (!lineVertexDragRef.current || !canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const scaleX = canvasRef.current.clientWidth / rect.width;
            const scaleY = canvasRef.current.clientHeight / rect.height;
            let x = Math.round((moveE.clientX - rect.left) * scaleX);
            let y = Math.round((moveE.clientY - rect.top) * scaleY);
            const currentEl = getScreenById(screen.id)?.drawElements?.find(item => item.id === id);
            if (!currentEl || currentEl.type !== 'line' || currentEl.lineX1 == null || currentEl.lineY1 == null || currentEl.lineX2 == null || currentEl.lineY2 == null) return;
            if (moveE.shiftKey) {
                const anchorX = pointIndex === 0 ? currentEl.lineX2 : currentEl.lineX1;
                const anchorY = pointIndex === 0 ? currentEl.lineY2 : currentEl.lineY1;
                const dx = x - anchorX;
                const dy = y - anchorY;
                if (Math.abs(dx) >= Math.abs(dy)) y = anchorY;
                else x = anchorX;
            }
            const lineX1 = pointIndex === 0 ? x : currentEl.lineX1;
            const lineY1 = pointIndex === 0 ? y : currentEl.lineY1;
            const lineX2 = pointIndex === 1 ? x : currentEl.lineX2;
            const lineY2 = pointIndex === 1 ? y : currentEl.lineY2;
            const minX = Math.min(lineX1, lineX2);
            const minY = Math.min(lineY1, lineY2);
            const maxX = Math.max(lineX1, lineX2);
            const maxY = Math.max(lineY1, lineY2);
            updateElement(id, { lineX1, lineY1, lineX2, lineY2, x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) });
        };
        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove, true);
            window.removeEventListener('mouseup', handleUp, true);
            lineVertexDragRef.current = null;
        };
        window.addEventListener('mousemove', handleMove, true);
        window.addEventListener('mouseup', handleUp, true);
    };



    // 삭제 계층: 1) 화면 엔티티(캔버스에서 처리) 2) 그리기 객체 3) 텍스트 입력 영역(문자만 삭제)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const active = document.activeElement as HTMLElement | null;
            const isInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable || editingTextId != null || (editingTableId != null && editingCellIndex != null);
            const hotkeyTargetId = getPasteTargetScreenId?.() ?? lastInteractedScreenId ?? (selected ? screen.id : null);

            // Ctrl+C (Copy) - Table cell copy (content + per-cell styles)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                if (editingTableId && selectedCellIndices.length > 0 && editingCellIndex === null) {
                    e.preventDefault();
                    e.stopPropagation();
                    const tableEl = drawElements.find(it => it.id === editingTableId);
                    if (!tableEl || tableEl.type !== 'table') return;
                    const cols = tableEl.tableCols ?? 1;
                    const rows = tableEl.tableRows ?? 1;
                    const v2Cells = getV2Cells(tableEl);
                    const styles = tableEl.tableCellStyles || [];

                    const sorted = [...selectedCellIndices].sort((a, b) => a - b);
                    const cells = sorted.map(idx => {
                        const pos = flatIdxToRowCol(idx, cols);
                        return {
                            r: pos.r,
                            c: pos.c,
                            content: v2Cells[idx]?.content ?? '',
                            style: styles[idx] ?? {},
                        };
                    });
                    setCellClipboard({ type: 'table-cells', sourceCols: cols, sourceRows: rows, cells });
                    return;
                }
            }

            // Ctrl+V (Paste) - Table cell paste (relative positioning)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                if (editingTableId && selectedCellIndices.length > 0 && editingCellIndex === null && cellClipboard?.type === 'table-cells' && cellClipboard.cells.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    const tableEl = drawElements.find(it => it.id === editingTableId);
                    if (!tableEl || tableEl.type !== 'table') return;

                    const cols = tableEl.tableCols ?? 1;
                    const rows = tableEl.tableRows ?? 1;
                    const total = rows * cols;

                    const newV2 = deepCopyCells(getV2Cells(tableEl));
                    while (newV2.length < total) newV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });

                    const newStyles = [...(tableEl.tableCellStyles || Array(total).fill(undefined))];
                    while (newStyles.length < total) newStyles.push(undefined);

                    const targetBaseIdx = [...selectedCellIndices].sort((a, b) => a - b)[0];
                    const targetBasePos = flatIdxToRowCol(targetBaseIdx, cols);
                    const sourceBase = cellClipboard.cells[0];

                    cellClipboard.cells.forEach(item => {
                        const dr = item.r - sourceBase.r;
                        const dc = item.c - sourceBase.c;
                        const tr = targetBasePos.r + dr;
                        const tc = targetBasePos.c + dc;
                        if (tr < 0 || tc < 0 || tr >= rows || tc >= cols) return;
                        const tIdx = rowColToFlatIdx(tr, tc, cols);
                        if (!newV2[tIdx]) return;
                        newV2[tIdx] = { ...newV2[tIdx], content: item.content ?? '' };
                        newStyles[tIdx] = item.style ? { ...item.style } : undefined;
                    });

                    updateElement(tableEl.id, {
                        tableCellDataV2: newV2,
                        tableCellStyles: newStyles,
                    });
                    return;
                }
            }

            // Ctrl+C (Copy) - 메모리 + 시스템 클립보드에 저장 (탭/세션 넘어서 붙여넣기 가능)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                if (isInput || selectedElementIds.length === 0) return;
                e.preventDefault();
                const toCopy = drawElements.filter(el => selectedElementIds.includes(el.id));
                const copied = JSON.parse(JSON.stringify(toCopy)).map((el: any) => ({ ...el, _sourceScreenId: screen.id }));
                setCanvasClipboard(copied);
                if (navigator.clipboard?.writeText && window.isSecureContext) {
                    navigator.clipboard.writeText(JSON.stringify(copied)).catch(() => { });
                }
                return;
            }

            // Ctrl+V (Paste) - paste 이벤트에서 처리 (clipboardData 직접 접근, 권한 문제 회피)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                if (isInput) return;
                const pasteTargetId = getPasteTargetScreenId?.() ?? lastInteractedScreenId;
                if (pasteTargetId !== screen.id) return;
                // keydown에서는 preventDefault 하지 않음 → paste 이벤트 발생 후 그곳에서 처리
            }

            // Ctrl+Z (Undo)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                if (isInput) return;
                if (!hotkeyTargetId || hotkeyTargetId !== screen.id) return;
                e.preventDefault();
                undo();
                return;
            }

            // Ctrl+Y or Ctrl+Shift+Z (Redo)
            if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
                if (isInput) return;
                if (!hotkeyTargetId || hotkeyTargetId !== screen.id) return;
                e.preventDefault();
                redo();
                return;
            }

            if (e.key !== 'Backspace' && e.key !== 'Delete') return;

            // 표 다중 셀 선택 상태: 표 자체 삭제가 아니라 선택된 셀의 텍스트만 일괄 삭제
            if (editingTableId && selectedCellIndices.length > 0 && editingCellIndex === null) {
                e.preventDefault();
                e.stopPropagation();

                const tableEl = drawElements.find(it => it.id === editingTableId);
                if (tableEl && tableEl.type === 'table') {
                    const cols = tableEl.tableCols ?? 1;
                    const rows = tableEl.tableRows ?? 1;
                    const total = rows * cols;

                    const newV2 = deepCopyCells(getV2Cells(tableEl));
                    while (newV2.length < total) newV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });

                    const newData = [...(tableEl.tableCellData || Array(total).fill(''))];
                    while (newData.length < total) newData.push('');

                    let isChanged = false;
                    selectedCellIndices.forEach(idx => {
                        if (newV2[idx] && newV2[idx].content !== '') {
                            newV2[idx] = { ...newV2[idx], content: '' };
                            isChanged = true;
                        }
                        if (newData[idx] !== undefined && newData[idx] !== '') {
                            newData[idx] = '';
                            isChanged = true;
                        }
                    });

                    if (isChanged) {
                        updateElement(tableEl.id, {
                            tableCellDataV2: newV2,
                            tableCellData: newData,
                        });
                    }
                }
                return;
            }
            if (selectedElementIds.length === 0) return;

            // ── 3단계: 텍스트 입력 영역 ──
            // 포커스가 텍스트 입력 중이면 가로채지 않음 → Backspace는 글자만 삭제
            if (isInput) return;

            // ── 2단계: 그리기 객체 ──
            // 객체만 선택된 상태(텍스트 편집 아님)에서만 객체 삭제 확인 후 삭제
            e.preventDefault();
            e.stopPropagation();

            // 기능 상세 번호(func-no) 타입 확인
            const selectedElements = drawElements.filter(el => selectedElementIds.includes(el.id));
            const funcNoElement = selectedElements.find(el => el.type === 'func-no');

            if (funcNoElement && selectedElementIds.length === 1) {
                // 기능 상세 번호 삭제 시 팝업 띄우기
                setFuncNoDeleteConfirm({ elementId: funcNoElement.id, elementText: funcNoElement.text || '?' });
            } else if (window.confirm(`선택한 ${selectedElementIds.length}개의 그리기 개체를 삭제하시겠습니까?`)) {
                deleteElements(selectedElementIds);
            }
            // 1단계(화면 엔티티 삭제)는 ScreenDesignCanvas에서 화면 노드 선택 시 처리
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [selectedElementIds, selectedCellIndices, drawElements, editingTextId, editingTableId, editingCellIndex, cellClipboard, setCellClipboard, canvasClipboard, lastInteractedScreenId, screen.id, setCanvasClipboard, getScreenById, updateElement, update, syncUpdate, saveHistory, setSelectedElementIds, uploadImage, getPasteTargetScreenId]);

    // Paste 이벤트: clipboardData 직접 접근 (navigator.clipboard.read 권한 불필요)
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const active = document.activeElement as HTMLElement | null;
            const isInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable || editingTextId != null || (editingTableId != null && editingCellIndex != null);
            if (isInput) return;

            const cd = e.clipboardData;
            if (!cd) return;

            const pasteTargetId = getPasteTargetScreenId?.() ?? lastInteractedScreenId;
            if (pasteTargetId !== screen.id) return;

            const { width: canvasW, height: canvasH } = getCanvasDimensions(screen);

            const doPaste = (toPaste: DrawElement[], scaleToFit = false) => {
                const isSameScreen = (toPaste[0] as any)?._sourceScreenId === screen.id;
                const processed = scaleToFit ? scaleElementsToFitCanvas(toPaste, canvasW, canvasH) : toPaste;
                // 붙여넣기 배치마다 groupId를 새로 발급해, 이전 붙여넣기본과 그룹이 합쳐지지 않게 한다.
                const groupIdRemap = new Map<string, string>();
                const remapGroupId = (gid?: string) => {
                    if (!gid) return gid;
                    if (!groupIdRemap.has(gid)) {
                        groupIdRemap.set(
                            gid,
                            `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                        );
                    }
                    return groupIdRemap.get(gid);
                };
                const newElements = processed.map((el, idx) => {
                    const offset = scaleToFit ? 0 : (isSameScreen ? 20 : 0);
                    const base = {
                        ...el,
                        id: `el_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
                        groupId: remapGroupId(el.groupId),
                        x: el.x + offset,
                        y: el.y + offset,
                        _sourceScreenId: screen.id, // next paste on same screen shifts by 20px (see isSameScreen)
                    } as DrawElement & { _sourceScreenId?: string };
                    if (base.fromComponentId && !linkedComponentScreenIdSet.has(base.fromComponentId)) {
                        return {
                            ...base,
                            fromComponentId: undefined,
                            fromElementId: undefined,
                            hasComponentText: undefined,
                            tableCellLockedIndices: undefined,
                        };
                    }
                    return base;
                });
                const current = getScreenById(screen.id);
                const currentElements = current?.drawElements ?? drawElements;
                const nextElements = [...currentElements, ...newElements];
                update({ drawElements: nextElements });
                syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
                saveHistory(nextElements);
                setSelectedElementIds(newElements.map((el) => el.id));
                setCanvasClipboard(newElements);
            };

            if (canvasClipboard.length > 0) {
                e.preventDefault();
                doPaste(canvasClipboard);
                return;
            }

            const text = cd.getData('text/plain');
            if (text) {
                try {
                    const parsed = JSON.parse(text);
                    const isValid = Array.isArray(parsed) && parsed.length > 0 &&
                        parsed.every((el: unknown) => el && typeof (el as DrawElement).id === 'string' &&
                            (el as DrawElement).type && typeof (el as DrawElement).x === 'number' &&
                            typeof (el as DrawElement).y === 'number' && typeof (el as DrawElement).width === 'number' &&
                            typeof (el as DrawElement).height === 'number' && (el as DrawElement).zIndex != null);
                    if (isValid) {
                        e.preventDefault();
                        doPaste(parsed as DrawElement[]);
                        return;
                    }
                } catch { /* not JSON */ }
            }

            const htmlData = cd.getData('text/html');
            if (htmlData) {
                if (import.meta.env.DEV) {
                    // console.log('[Paste] text/html length:', htmlData.length);
                    // console.log('[Paste] text/html sample:', htmlData.slice(0, 500));
                }
                const pptElements = parsePptHtmlToElements(htmlData);
                if (import.meta.env.DEV) {
                    // console.log('[Paste] pptElements:', pptElements);
                }
                if (pptElements.length > 0) {
                    e.preventDefault();
                    doPaste(pptElements, true);
                    return;
                }
            }

            for (const item of cd.items) {
                if (item.kind !== 'file') continue;
                const file = item.getAsFile();
                if (!file || !file.type.startsWith('image/')) continue;
                e.preventDefault();
                (async () => {
                    // ── ✨ 수정: 붙여넣은 "로컬 파일"에서 직접 크기를 잽니다 ──
                    const tempUrl = URL.createObjectURL(file);
                    const img = new Image();
                    img.src = tempUrl;
                    await new Promise(resolve => {
                        img.onload = resolve;
                        img.onerror = resolve;
                    });
                    const natW = img.naturalWidth || 200;
                    const natH = img.naturalHeight || 150;
                    const ratio = natW / natH;
                    URL.revokeObjectURL(tempUrl); // 메모리 누수 방지 해제

                    // 그 다음 서버에 업로드
                    let imageUrl: string;
                    try {
                        imageUrl = await uploadImage(file);
                    } catch {
                        imageUrl = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                        });
                    }

                    // 초기 캔버스 삽입 시 너무 크지 않도록 최대 크기 지정 (비율 유지)
                    let w = natW;
                    let h = natH;
                    const MAX_W = 400;
                    const MAX_H = 300;

                    if (w > MAX_W) { w = MAX_W; h = w / ratio; }
                    if (h > MAX_H) { h = MAX_H; w = h * ratio; }

                    const cw = canvasRef.current?.clientWidth ?? 400;
                    const ch = canvasRef.current?.clientHeight ?? 300;
                    const newId = `el_${Date.now()}_0_${Math.random().toString(36).substr(2, 5)}`;
                    
                    const imgEl: DrawElement = {
                        id: newId,
                        type: 'image',
                        x: Math.max(10, cw / 2 - w / 2),
                        y: Math.max(10, ch / 2 - h / 2),
                        width: w,
                        height: h,
                        zIndex: (getScreenById(screen.id)?.drawElements?.length ?? drawElements.length) + 1,
                        imageUrl,
                    };
                    const current = getScreenById(screen.id);
                    const currentElements = current?.drawElements ?? drawElements;
                    const nextElements = [...currentElements, imgEl];
                    update({ drawElements: nextElements });
                    syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
                    saveHistory(nextElements);
                    setSelectedElementIds([newId]);
                })();
                return;
            }
        };

        document.addEventListener('paste', handlePaste, true);
        return () => document.removeEventListener('paste', handlePaste, true);
    }, [drawElements, editingTextId, editingTableId, editingCellIndex, canvasClipboard, lastInteractedScreenId, screen.id, setCanvasClipboard, getScreenById, getPasteTargetScreenId, update, syncDrawElements, saveHistory, setSelectedElementIds, uploadImage, linkedComponentScreenIdSet]);


    // ── Table V2 Utilities (flatIdxToRowCol, rowColToFlatIdx, getV2Cells, deepCopyCells, gcd imported from ./screenNode/types) ──────────────────────────────────

    // V2 셀 데이터를 요소에 저장하고 동기화 (항상 스토어 최신 drawElements 기준으로 병합)
    const saveV2Cells = (elId: string, v2Cells: TableCellData[], extraUpdates?: Partial<DrawElement>) => {
        const currentElements = getScreenById(screen.id)?.drawElements ?? drawElements;

        const legacyCellData = v2Cells.map(c => c.content);
        const legacySpans = v2Cells.map(c => ({
            rowSpan: c.isMerged ? 0 : c.rowSpan,
            colSpan: c.isMerged ? 0 : c.colSpan,
        }));

        const updates: Partial<DrawElement> = {
            tableCellDataV2: v2Cells,
            tableCellData: legacyCellData,
            tableCellSpans: legacySpans,
            ...extraUpdates,
        };

        const nextElements = currentElements.map(el => el.id === elId ? { ...el, ...updates } : el);

        update({ drawElements: nextElements });
        syncUpdate({ drawElements: nextElements });
        saveHistory(nextElements);
    };

    const handleExecSplit = (el: DrawElement, cellIdx: number, splitRowCount: number, splitColCount: number) => {
        if (!el.tableRows || !el.tableCols || isLocked) return;

        const rows = el.tableRows;
        const cols = el.tableCols;

        // Determine which row/col the selected cell is in
        const { r: targetRow, c: targetCol } = flatIdxToRowCol(cellIdx, cols);

        let newRows = rows;
        let newCols = cols;
        let colWidths = el.tableColWidths ? [...el.tableColWidths] : Array(cols).fill(100 / cols);
        let rowHeights = el.tableRowHeights ? [...el.tableRowHeights] : Array(rows).fill(100 / rows);
        let cellData = el.tableCellData ? [...el.tableCellData] : Array(rows * cols).fill('');
        let cellColors = el.tableCellColors ? [...el.tableCellColors] : Array(rows * cols).fill(undefined);
        let cellStyles = el.tableCellStyles ? [...el.tableCellStyles] : Array(rows * cols).fill(undefined);

        // Start from existing V2 data if available, to preserve existing spans
        let existingV2 = getV2Cells(el);

        // ── Column Split (splitColCount > 1) ──
        // Adds columns to grid, but only target row gets individual cells;
        // other rows' cells at the split position get colSpan to look unchanged.
        if (splitColCount > 1) {
            const colsToAdd = splitColCount - 1;
            const oldColWidth = colWidths[targetCol];
            const newSubWidth = oldColWidth / splitColCount;

            // Update column widths
            const newColWidths = [...colWidths];
            newColWidths.splice(targetCol, 1, ...Array(splitColCount).fill(newSubWidth));
            colWidths = newColWidths;
            newCols = cols + colsToAdd;

            // Rebuild all cell arrays with new column layout
            const newCellData: string[] = [];
            const newCellColors: (string | undefined)[] = [];
            const newCellStyles: (Record<string, any> | undefined)[] = [];
            const newV2: TableCellData[] = [];

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const oldIdx = r * cols + c;
                    const oldV2Cell = existingV2[oldIdx] || { content: '', rowSpan: 1, colSpan: 1, isMerged: false };

                    if (c === targetCol) {
                        if (r === targetRow) {
                            // Target cell: split into splitColCount individual cells
                            newCellData.push(cellData[oldIdx] || '');
                            newCellColors.push(cellColors[oldIdx]);
                            newCellStyles.push(cellStyles[oldIdx]);
                            newV2.push({ content: cellData[oldIdx] || '', rowSpan: 1, colSpan: 1, isMerged: false });

                            for (let k = 0; k < colsToAdd; k++) {
                                newCellData.push('');
                                newCellColors.push(undefined);
                                newCellStyles.push(undefined);
                                newV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });
                            }
                        } else {
                            // Other rows: master cell spans all new sub-columns
                            newCellData.push(cellData[oldIdx] || '');
                            newCellColors.push(cellColors[oldIdx]);
                            newCellStyles.push(cellStyles[oldIdx]);

                            // Check if this cell already has a colSpan from prior merge
                            const existingColSpan = oldV2Cell.isMerged ? 1 : (oldV2Cell.colSpan || 1);
                            newV2.push({
                                content: cellData[oldIdx] || '',
                                rowSpan: oldV2Cell.isMerged ? 1 : (oldV2Cell.rowSpan || 1),
                                colSpan: oldV2Cell.isMerged ? 1 : (existingColSpan + colsToAdd),
                                isMerged: oldV2Cell.isMerged,
                            });

                            // Slave cells for the new sub-columns (hidden via isMerged)
                            for (let k = 0; k < colsToAdd; k++) {
                                newCellData.push('');
                                newCellColors.push(undefined);
                                newCellStyles.push(undefined);
                                newV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: true });
                            }
                        }
                    } else {
                        // Non-target columns: check if this cell spans across targetCol
                        newCellData.push(cellData[oldIdx] || '');
                        newCellColors.push(cellColors[oldIdx]);
                        newCellStyles.push(cellStyles[oldIdx]);

                        if (!oldV2Cell.isMerged && c < targetCol && c + (oldV2Cell.colSpan || 1) > targetCol) {
                            // This cell spans across targetCol - extend its colSpan
                            newV2.push({
                                ...oldV2Cell,
                                content: cellData[oldIdx] || '',
                                colSpan: (oldV2Cell.colSpan || 1) + colsToAdd,
                            });
                        } else {
                            newV2.push({ ...oldV2Cell, content: cellData[oldIdx] || '' });
                        }
                    }
                }
            }

            cellData = newCellData;
            cellColors = newCellColors;
            cellStyles = newCellStyles;
            existingV2 = newV2;
        }

        // ── Row Split (splitRowCount > 1) ──
        // Adds rows to grid, but only target column gets individual cells;
        // other columns' cells at the split position get rowSpan to look unchanged.
        if (splitRowCount > 1) {
            const rowsToAdd = splitRowCount - 1;
            const oldRowHeight = rowHeights[targetRow];
            const newSubHeight = oldRowHeight / splitRowCount;

            // Update row heights
            const newRowHeights = [...rowHeights];
            newRowHeights.splice(targetRow, 1, ...Array(splitRowCount).fill(newSubHeight));
            rowHeights = newRowHeights;

            const adjustedCols = newCols;

            // First, check cells ABOVE targetRow that span across it
            // If a cell from an earlier row spans into/past targetRow, it needs rowSpan extended
            for (let r = 0; r < targetRow; r++) {
                for (let c = 0; c < adjustedCols; c++) {
                    const idx = r * adjustedCols + c;
                    const v2Cell = existingV2[idx];
                    if (!v2Cell || v2Cell.isMerged) continue;

                    // Does this cell span across the insertion point?
                    if (r + (v2Cell.rowSpan || 1) > targetRow) {
                        existingV2[idx] = {
                            ...v2Cell,
                            rowSpan: (v2Cell.rowSpan || 1) + rowsToAdd,
                        };
                    }
                }
            }

            // Update cells IN targetRow:
            // Non-target columns should get rowSpan extended to cover new rows
            for (let c = 0; c < adjustedCols; c++) {
                const idx = targetRow * adjustedCols + c;
                const v2Cell = existingV2[idx];
                if (!v2Cell || v2Cell.isMerged) continue;

                // Check if this column is part of the split target area
                const isTargetArea = (splitColCount > 1)
                    ? (c >= targetCol && c < targetCol + splitColCount)
                    : (c === targetCol);

                if (!isTargetArea) {
                    // Non-target column: extend rowSpan to cover new rows
                    existingV2[idx] = {
                        ...v2Cell,
                        rowSpan: (v2Cell.rowSpan || 1) + rowsToAdd,
                    };
                }
            }

            // Insert new rows of data after targetRow
            const endOfTargetRow = (targetRow + 1) * adjustedCols;
            const newRowData: string[] = [];
            const newRowColors: (string | undefined)[] = [];
            const newRowStyles: (Record<string, any> | undefined)[] = [];
            const newRowV2: TableCellData[] = [];

            for (let k = 0; k < rowsToAdd; k++) {
                for (let c = 0; c < adjustedCols; c++) {
                    newRowData.push('');
                    newRowColors.push(undefined);
                    newRowStyles.push(undefined);

                    const isTargetArea = (splitColCount > 1)
                        ? (c >= targetCol && c < targetCol + splitColCount)
                        : (c === targetCol);

                    if (isTargetArea) {
                        // Target column area: individual cells
                        newRowV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });
                    } else {
                        // Non-target column: slave cell (hidden by the master's rowSpan above)
                        newRowV2.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: true });
                    }
                }
            }

            cellData.splice(endOfTargetRow, 0, ...newRowData);
            cellColors.splice(endOfTargetRow, 0, ...newRowColors);
            cellStyles.splice(endOfTargetRow, 0, ...newRowStyles);
            existingV2.splice(endOfTargetRow, 0, ...newRowV2);

            newRows = rows + rowsToAdd;
        }

        // Build legacy spans from V2
        const legacySpans = existingV2.map(cell => ({
            rowSpan: cell.isMerged ? 0 : cell.rowSpan,
            colSpan: cell.isMerged ? 0 : cell.colSpan,
        }));

        // Build update
        const targetEl: DrawElement = {
            ...el,
            tableRows: newRows,
            tableCols: newCols,
            tableColWidths: colWidths,
            tableRowHeights: rowHeights,
            tableCellData: cellData,
            tableCellColors: cellColors,
            tableCellStyles: cellStyles,
            tableCellSpans: legacySpans,
            tableCellDataV2: existingV2,
            tableRowColWidths: undefined,
        };

        const nextElements = getDrawElements().map(it => it.id === el.id ? targetEl : it);
        update({ drawElements: nextElements });
        syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
        saveHistory(nextElements);
        setSelectedCellIndices([]);
    };

    const handleMergeCells = (selectedEl: DrawElement) => {
        if (!selectedEl.tableCols || !selectedEl.tableRows || selectedCellIndices.length < 2) return;

        const rows = selectedEl.tableRows;
        const cols = selectedEl.tableCols;

        // 렌더러는 항상 uniform grid(rows×cols)를 사용하므로 flatIdx → (r,c) 매핑은 flatIdxToRowCol 사용
        const coords = selectedCellIndices.map(idx => {
            const { r, c } = flatIdxToRowCol(idx, cols);
            return { r, c, flatIdx: idx };
        });
        if (!coords.length) return;

        // 모든 병합을 V2(rowSpan/colSpan) 방식으로 통일 (가로/세로/사각형 모두)
        const minRow = Math.min(...coords.map(c => c.r));
        const maxRow = Math.max(...coords.map(c => c.r));
        const minCol = Math.min(...coords.map(c => c.c));
        const maxCol = Math.max(...coords.map(c => c.c));

        const rowSpanVal = maxRow - minRow + 1;
        const colSpanVal = maxCol - minCol + 1;

        let v2Cells = deepCopyCells(getV2Cells(selectedEl));
        const totalCells = rows * cols;
        while (v2Cells.length < totalCells) {
            v2Cells.push({ content: '', rowSpan: 1, colSpan: 1, isMerged: false });
        }

        const masterFlatIdx = rowColToFlatIdx(minRow, minCol, cols);

        // 병합된 영역의 내용: 좌상단 셀 내용 사용 (기존 master 유지)
        v2Cells[masterFlatIdx] = {
            ...v2Cells[masterFlatIdx],
            rowSpan: rowSpanVal,
            colSpan: colSpanVal,
            isMerged: false,
        };

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const idx = rowColToFlatIdx(r, c, cols);
                if (idx === masterFlatIdx) continue;
                v2Cells[idx] = {
                    ...v2Cells[idx],
                    rowSpan: 1,
                    colSpan: 1,
                    isMerged: true,
                };
            }
        }

        const nextSpans = v2Cells.map(cell => ({
            rowSpan: cell.isMerged ? 0 : cell.rowSpan,
            colSpan: cell.isMerged ? 0 : cell.colSpan,
        }));

        const targetEl = {
            ...selectedEl,
            tableCellDataV2: v2Cells,
            tableCellSpans: nextSpans,
            tableRowColWidths: undefined, // jagged 구조 제거, uniform grid만 사용
        };
        const nextElements = getDrawElements().map(el => el.id === selectedEl.id ? targetEl : el);
        update({ drawElements: nextElements });
        syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
        saveHistory(nextElements);
        setSelectedCellIndices([]);
    };

    const handleSplitCells = (selectedEl: DrawElement) => {
        if (!selectedEl.tableCols || !selectedCellIndices.length || isLocked) return;

        const cols = selectedEl.tableCols;
        const cellIdx = selectedCellIndices[0];

        // Check if the selected cell is a merged master (V2 structure)
        const v2Cells = getV2Cells(selectedEl);
        const masterCell = v2Cells[cellIdx];

        if (masterCell && !masterCell.isMerged && (masterCell.rowSpan > 1 || masterCell.colSpan > 1)) {
            // This is a merged master cell → Unmerge it
            const newV2 = deepCopyCells(v2Cells);
            const { r: masterRow, c: masterCol } = flatIdxToRowCol(cellIdx, cols);

            // Reset master
            newV2[cellIdx] = { ...newV2[cellIdx], rowSpan: 1, colSpan: 1 };

            // Restore slave cells
            for (let r = masterRow; r < masterRow + masterCell.rowSpan; r++) {
                for (let c = masterCol; c < masterCol + masterCell.colSpan; c++) {
                    const slaveIdx = rowColToFlatIdx(r, c, cols);
                    if (slaveIdx === cellIdx) continue;
                    newV2[slaveIdx] = { ...newV2[slaveIdx], isMerged: false, rowSpan: 1, colSpan: 1 };
                }
            }

            saveV2Cells(selectedEl.id, newV2);
            setSelectedCellIndices([]);
            return;
        }

        // Also check legacy tableCellSpans for backward compat
        const legacySpan = selectedEl.tableCellSpans?.[cellIdx];
        if (legacySpan && legacySpan.rowSpan > 1) {
            // Unmerge via legacy spans
            const nextSpans = [...(selectedEl.tableCellSpans || [])];
            const { r: masterRow, c: masterCol } = flatIdxToRowCol(cellIdx, cols);

            for (let r = masterRow; r < masterRow + legacySpan.rowSpan; r++) {
                for (let c = masterCol; c < masterCol + (legacySpan.colSpan || 1); c++) {
                    const idx = rowColToFlatIdx(r, c, cols);
                    nextSpans[idx] = { rowSpan: 1, colSpan: 1 };
                }
            }

            const targetEl = {
                ...selectedEl,
                tableCellSpans: nextSpans,
                tableCellDataV2: undefined, // Reset V2 to re-derive
                tableRowColWidths: undefined,
            };
            const nextElements = getDrawElements().map(el => el.id === selectedEl.id ? targetEl : el);
            update({ drawElements: nextElements });
            syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
            saveHistory(nextElements);
            setSelectedCellIndices([]);
            return;
        }

        // No existing merge → Open split dialog
        setSplitTarget({ elId: selectedEl.id, cellIdx });
        setSplitRows(2); // Default to horizontal split
        setSplitCols(1);
        setShowSplitDialog(true);
    };

    /** 선택된 셀들의 행 높이를 먼저 선택한 셀의 행 높이로 통일 (2개 이상 선택 시) */
    const handleEqualizeRowHeights = (selectedEl: DrawElement) => {
        if (!selectedEl.tableCols || !selectedEl.tableRows || selectedCellIndices.length < 2 || isLocked) return;
        const rows = selectedEl.tableRows;
        const cols = selectedEl.tableCols;
        const refIdx = selectedCellIndices[0];
        const { r: refRow } = flatIdxToRowCol(refIdx, cols);
        const rowHeights = selectedEl.tableRowHeights ? [...selectedEl.tableRowHeights] : Array(rows).fill(100 / rows);
        const refHeight = rowHeights[refRow];
        const selectedRows = [...new Set(selectedCellIndices.map(i => flatIdxToRowCol(i, cols).r))];
        selectedRows.forEach(r => { rowHeights[r] = refHeight; });
        const sum = rowHeights.reduce((a, b) => a + b, 0);
        if (sum <= 0) return;
        const normalized = rowHeights.map(h => (h / sum) * 100);
        const nextElements = getDrawElements().map(el =>
            el.id === selectedEl.id ? { ...el, tableRowHeights: normalized } : el
        );
        update({ drawElements: nextElements });
        syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
        saveHistory(nextElements);
    };

    /** 선택된 셀들의 열 너비를 먼저 선택한 셀의 열 너비로 통일 (2개 이상 선택 시) */
    const handleEqualizeColWidths = (selectedEl: DrawElement) => {
        if (!selectedEl.tableCols || !selectedEl.tableRows || selectedCellIndices.length < 2 || isLocked) return;
        const cols = selectedEl.tableCols;
        const refIdx = selectedCellIndices[0];
        const { c: refCol } = flatIdxToRowCol(refIdx, cols);
        const colWidths = selectedEl.tableColWidths ? [...selectedEl.tableColWidths] : Array(cols).fill(100 / cols);
        const refWidth = colWidths[refCol];
        const selectedCols = [...new Set(selectedCellIndices.map(i => flatIdxToRowCol(i, cols).c))];
        selectedCols.forEach(c => { colWidths[c] = refWidth; });
        const sum = colWidths.reduce((a, b) => a + b, 0);
        if (sum <= 0) return;
        const normalized = colWidths.map(w => (w / sum) * 100);
        const nextElements = getDrawElements().map(el =>
            el.id === selectedEl.id ? { ...el, tableColWidths: normalized } : el
        );
        update({ drawElements: nextElements });
        syncDrawElements(nextElements); // drawElements 전용 실시간 동기화
        saveHistory(nextElements);
    };



    // Entity dimensions from getCanvasDimensions (컴포넌트는 용지=캔버스, 화면 설계는 70% 비율)
    const CANVAS_WIDTH_RATIO = 0.7; // 화면 설계: 캔버스가 entity의 70%
    const FIXED_TOP_HEIGHT = 162; // 화면 설계: 헤더+메타 포함 고정 상단 영역
    const FIXED_TOP_HEIGHT_COMPONENT = 88; // 컴포넌트: 헤더 + 툴바 2행
    const CANVAS_INSET = 14; // 캔버스 여백 (눈금자 숫자 표시 공간 확보)
    const TOOLBAR_AREA_HEIGHT = 44; // 화면 설계 수정 모드에서만 노출되는 툴바 영역 높이
    const ENTITY_CANVAS_GAP = 0; // 캔버스와 엔티티 테두리 사이 간격 (0=영역 딱 맞춤)
    const isComponent = screen.screenId?.startsWith('CMP-');
    const entityWidth = isComponent
        ? canvasW + ENTITY_CANVAS_GAP * 2
        : Math.ceil((canvasW + ENTITY_CANVAS_GAP * 2) / CANVAS_WIDTH_RATIO);
    const screenTopHeight = isLocked
        ? Math.max(0, FIXED_TOP_HEIGHT - TOOLBAR_AREA_HEIGHT)
        : FIXED_TOP_HEIGHT;
    const entityHeight =
        canvasH + ENTITY_CANVAS_GAP * 2 + (isComponent ? FIXED_TOP_HEIGHT_COMPONENT : screenTopHeight);
    // 잠금/수정 전환 시에도 inset(스케일)을 동일하게 유지해 객체 위치가 달라 보이지 않도록 고정
    const canvasInset = CANVAS_INSET;
    return (
        <>
        <div
            ref={containerRef}
            className={`transition-all group relative overflow-visible ${isLockedByOther ? 'nodrag' : ''}`}
            style={{ width: entityWidth, height: entityHeight }}
        >
                <TooltipPortalContext.Provider value={tooltipContainerRef}>
                    {/* 툴팁 포탈: overflow-hidden 밖에 있어서 잘리지 않고, 노드와 함께 줌/이동됨 */}
                    <div ref={tooltipContainerRef} className="absolute inset-0 pointer-events-none overflow-visible z-[99999]" aria-hidden />
            <EntityLockBadge entityId={screen.id} />
            <div
                ref={nodeRef}
                        className={`relative h-full w-full bg-white rounded-[15px] shadow-xl border-2 flex flex-col overflow-hidden ${selected && !isExporting
                    ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                    : isLocked
                        ? 'border-gray-200 shadow-md'
                        : 'border-[#2c3e7c] shadow-blue-100'
                    }`}>
                {/* Lock Overlay */}
                <LockOverlay
                    isLocked={isLocked}
                    isLockedByOther={isLockedByOther}
                    lockedBy={lockedBy}
                    onDoubleClick={handleToggleLock}
                />

                        <MemoPanel
                            show={showMemoPanel}
                            onClose={() => setShowMemoPanel(false)}
                            screen={screen}
                            update={update}
                            syncUpdate={syncUpdate}
                            user={user}
                            isLocked={isLocked}
                            isYjsSynced={yjsIsSynced}
                            onMemoHistory={(nextMemos, meta) => {
                                sendOperation({
                                    type: 'SCREEN_UPDATE',
                                    targetId: screen.id,
                                    userId: user?.id || 'anonymous',
                                    userName: user?.name || 'Anonymous',
                                    payload: {
                                        memos: nextMemos,
                                        historyLog: {
                                            details: meta.details,
                                            targetName: meta.targetName,
                                            targetType: 'SCREEN',
                                        },
                                    },
                                });
                            }}
                        />

                {/* ── 1. Top Header Bar (ERD Style) ── */}
                {!canvasOnlyMode && (
                <ScreenHeader
                    screen={screen}
                    isLocked={isLocked}
                    isLockedByOther={isLockedByOther}
                    lockedBy={lockedBy}
                                isSynced={yjsIsSynced}
                    update={update}
                    syncUpdate={syncUpdate}
                    onToggleLock={handleToggleLock}
                    onDelete={handleDelete}

                    showScreenOptionsPanel={showScreenOptionsPanel}
                    setShowScreenOptionsPanel={setShowScreenOptionsPanel}
                    screenOptionsRef={screenOptionsRef}
                                onToggleMemoPanel={() => setShowMemoPanel(v => !v)}
                />
                )}

                {/* ── 2. Meta Info Table (화면 설계용, 컴포넌트일 때 숨김) ── */}
                {!canvasOnlyMode && !screen.screenId?.startsWith('CMP-') && (
                <MetaInfoTable screen={screen} isLocked={isLocked} update={update} syncUpdate={syncUpdate} />
                )}

                        {/* ── 3. Body Content: Toolbar full width, then Split Layout (shrink-0으로 하단 여백 제거) ── */}
                        <div className="nodrag nopan flex flex-col shrink-0 bg-white rounded-b-[15px]" onMouseDown={(e) => e.stopPropagation()}>

                            {/* Drawing Toolbar - Full width (100%), 2 rows: main tools + text style (below) */}
                    {!canvasOnlyMode && !isLocked && (
                                <StickyToolbarWrapper
                                    screenId={screen.id}
                                    forceShow={selected || selectedElementIds.length > 0 || lastInteractedScreenId === screen.id}
                                >
                                    <div
                                        className="nodrag nopan w-full flex flex-col"
                                        onMouseDown={() => {
                                            setLastInteractedScreenId(screen.id);
                                        }}
                                    >
                                        {/* Row 1: Main tools */}
                                        <div
                                            className="flex flex-nowrap items-center gap-1 p-1 bg-white/80 overflow-x-auto custom-scrollbar rounded-[15px]"
                        >
                                    <div className="flex flex-nowrap items-center gap-1 flex-1 min-w-max px-1">
                                            {/* Undo/Redo Controls */}
                                                <UndoRedoControls
                                                    undo={undo}
                                                    redo={redo}
                                                    pastLength={history.past.length}
                                                    futureLength={history.future.length}
                                                />
                                            <div className="flex flex-nowrap items-center gap-1 animate-in slide-in-from-left-1 duration-200">
                                                <div className="flex flex-nowrap items-center gap-0.5 border-r border-gray-200 pr-1 mr-1">
                                                        <PremiumTooltip label="선택" dotColor="#3b82f6" screenId={screen.id}>
                                                        <button
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    setLastInteractedScreenId(screen.id);
                                                                }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setActiveTool('select');
                                                                }}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'select' ? 'bg-blue-100 text-blue-600' : 'hover:bg-blue-50 text-gray-500'}`}
                                                        >
                                                            <MousePointer2 size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                </div>
                                                {selectedElementIds.length === 1 && !isLocked && (
                                                <div className="flex flex-nowrap items-center gap-0.5 border-r border-gray-200 pr-1 mr-1">
                                                    <PremiumTooltip label="스타일 복사" dotColor="#8b5cf6" screenId={screen.id}>
                                                        <button
                                                            type="button"
                                                            data-ignore-selection-clear
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                setLastInteractedScreenId(screen.id);
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const sid = selectedElementIds[0];
                                                                const src = drawElements.find((el) => el.id === sid);
                                                                if (!src) return;
                                                                setStylePaintSnapshot(extractStyleSnapshot(src));
                                                                setStylePaintSourceId(src.id);
                                                                setStylePaintActive(true);
                                                                setActiveTool('select');
                                                            }}
                                                            className={`p-2 rounded-lg transition-colors ${stylePaintActive ? 'bg-violet-100 text-violet-700' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        >
                                                            <Copy size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                </div>
                                                )}
                                                <div className="flex flex-nowrap items-center gap-0.5 shrink-0">
                                                    <div className="nodrag nopan relative flex items-center justify-center" ref={tablePickerRef}>
                                                            <PremiumTooltip label="표 삽입" screenId={screen.id}>
                                                            <button
                                                                    onMouseDown={(e) => {
                                                                        e.stopPropagation();
                                                                        setLastInteractedScreenId(screen.id);
                                                                    }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (!showTablePicker) {
                                                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                        const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                        setTablePickerPos({ x: flowPos.x, y: flowPos.y });
                                                                    }
                                                                    setShowTablePicker(!showTablePicker);
                                                                    setTablePickerHover(null);
                                                                }}
                                                                className={`p-2 rounded-lg transition-colors ${showTablePicker ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                            >
                                                                <Table2 size={18} />
                                                            </button>
                                                        </PremiumTooltip>
                                                            {showTablePicker && createPortal(
                                                                <FloatingPanelWrapper
                                                                data-table-picker-portal
                                                                    data-screen-id={screen.id}
                                                                    className="nodrag nopan fixed z-[9000]"
                                                                    flowPos={tablePickerPos}
                                                                    flowToScreenPosition={flowToScreenPosition}
                                                                >
                                                                    <div
                                                                        className="bg-white border border-gray-200 rounded-xl shadow-2xl p-3 animate-in fade-in zoom-in duration-150 origin-top-left"
                                                                onMouseLeave={() => setTablePickerHover(null)}
                                                            >
                                                                <div
                                                                    className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2 cursor-grab active:cursor-grabbing group/header"
                                                                    onMouseDown={handleTablePickerHeaderMouseDown}
                                                                    title="드래그하여 이동"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                                                                        <Table2 size={12} className="text-[#2c3e7c]" />
                                                                        <span className="text-[11px] font-bold text-gray-600">표 삽입</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col gap-[2px]">
                                                                    {Array.from({ length: 8 }).map((_, rIdx) => (
                                                                        <div key={rIdx} className="flex gap-[2px]">
                                                                            {Array.from({ length: 8 }).map((_, cIdx) => {
                                                                                const isHighlighted = tablePickerHover && rIdx <= tablePickerHover.r && cIdx <= tablePickerHover.c;
                                                                                return (
                                                                                    <div
                                                                                        key={cIdx}
                                                                                        className={`w-[18px] h-[18px] border rounded-[2px] cursor-pointer transition-all duration-75 ${isHighlighted
                                                                                            ? 'bg-blue-500 border-blue-600 shadow-sm'
                                                                                            : 'bg-gray-50 border-gray-300 hover:border-gray-400'
                                                                                            }`}
                                                                                        onMouseEnter={() => setTablePickerHover({ r: rIdx, c: cIdx })}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            e.preventDefault();
                                                                                            const rows = rIdx + 1;
                                                                                            const cols = cIdx + 1;
                                                                                            const cw = canvasRef.current?.clientWidth ?? 0;
                                                                                            const ch = canvasRef.current?.clientHeight ?? 0;
                                                                                            const cx = cw ? cw / 2 - (cols * 60) / 2 : 50;
                                                                                            const cy = ch ? ch / 2 - (rows * 30) / 2 : 50;
                                                                                            const newId = `draw_${Date.now()}`;
                                                                                            const tableEl: DrawElement = {
                                                                                                id: newId,
                                                                                                type: 'table',
                                                                                                x: Math.max(10, cx),
                                                                                                y: Math.max(10, cy),
                                                                                                width: Math.max(200, cols * 60),
                                                                                                height: Math.max(80, rows * 30),
                                                                                                fill: '#ffffff',
                                                                                                stroke: '#2c3e7c',
                                                                                                strokeWidth: 1,
                                                                                                zIndex: drawElements.length + 1,
                                                                                                fontSize: 14,
                                                                                                color: '#333333',
                                                                                                tableRows: rows,
                                                                                                tableCols: cols,
                                                                                                tableCellData: Array(rows * cols).fill(''),
                                                                                                tableColWidths: Array(cols).fill(100 / cols),
                                                                                                tableRowHeights: Array(rows).fill(100 / rows)
                                                                                            };
                                                                                            const nextElements = [...drawElements, tableEl];
                                                                                            update({ drawElements: nextElements });
                                                                                            syncUpdate({ drawElements: nextElements });
                                                                                            setSelectedElementIds([newId]);
                                                                                            setShowTablePicker(false);
                                                                                            setTablePickerHover(null);
                                                                                        }}
                                                                                    />
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <div className="mt-2 text-center text-[10px] font-medium text-gray-500 h-4">
                                                                    {tablePickerHover
                                                                        ? <span className="text-blue-600 font-bold">{tablePickerHover.r + 1} × {tablePickerHover.c + 1} 표 삽입</span>
                                                                        : '행 × 열 선택'
                                                                    }
                                                                </div>
                                                                    </div>
                                                                </FloatingPanelWrapper>,
                                                            getPanelPortalRoot()
                                                            )}
                                                        {!screen.screenId?.startsWith('CMP-') && (
                                                            <ComponentPickerButton
                                                                show={showComponentPicker}
                                                                onShowChange={setShowComponentPicker}
                                                                position={componentPickerPos}
                                                                onPositionChange={setComponentPickerPos}
                                                                    // zoom={1} // 🗑️ 삭제: 더 이상 줌 배율을 사용하지 않음
                                                                flowToScreenPosition={flowToScreenPosition}
                                                                screenToFlowPosition={screenToFlowPosition}
                                                                componentList={componentList}
                                                                linkedComponentProject={linkedComponentProject}
                                                                onInsert={insertComponent}
                                                                buttonRef={componentPickerRef}
                                                                isDraggingRef={isDraggingComponentPickerRef}
                                                            />
                                                        )}
                                                        {showImageStylePanel && (() => {
                                                            const imgEl = drawElements.find(el => selectedElementIds.includes(el.id) && el.type === 'image');
                                                            if (!imgEl || imgEl.type !== 'image') return null;
                                                            return createPortal(
                                                                    <FloatingPanelWrapper
                                                                        data-image-style-panel
                                                                        data-screen-id={screen.id}
                                                                        flowPos={imageStylePanelPos}
                                                                        flowToScreenPosition={flowToScreenPosition}
                                                                    >
                                                                    <ImageStylePanel
                                                                        element={imgEl}
                                                                        onUpdate={(u) => updateElement(imgEl.id, u)}
                                                                        onClose={() => { setShowImageStylePanel(false); setImageCropMode(false); }}
                                                                        position={imageStylePanelPos}
                                                                        onPositionChange={setImageStylePanelPos}
                                                                        screenToFlowPosition={screenToFlowPosition}
                                                                        onDragStart={() => { isDraggingImageStylePanelRef.current = true; }}
                                                                        onDragEnd={() => { isDraggingImageStylePanelRef.current = false; }}
                                                                        isCropMode={imageCropMode}
                                                                        onCropModeToggle={setImageCropMode}
                                                                    />
                                                                    </FloatingPanelWrapper>,
                                                                getPanelPortalRoot()
                                                            );
                                                        })()}
                                                    </div>
                                                    {/* Table Panel Button — shown only when a table is selected */}
                                                    {(() => {
                                                        const selEl = drawElements.find(el => selectedElementIds.includes(el.id));
                                                        if (!selEl || selEl.type !== 'table') return null;
                                                        return <div className="flex items-center gap-1 border-l border-gray-200 pl-1 ml-1">
                                                                <PremiumTooltip label="표 설정" screenId={screen.id}>
                                                                <button
                                                                        onMouseDown={(e) => {
                                                                            e.stopPropagation();
                                                                            setLastInteractedScreenId(screen.id);
                                                                        }}
                                                                    onClick={(e) => {
                                                                        if (!showTablePanel) {
                                                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                            const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                            setTablePanelPos({ x: flowPos.x, y: flowPos.y });
                                                                            setShowStylePanel(false);
                                                                            setShowLayerPanel(false);
                                                                        }
                                                                        setShowTablePanel(prev => !prev);
                                                                    }}
                                                                    className={`p-2 rounded-lg transition-colors ${showTablePanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                                >
                                                                    <Settings2 size={18} />
                                                                </button>
                                                            </PremiumTooltip>
                                                                <PremiumTooltip label="셀 배경색" screenId={screen.id}>
                                                                <button
                                                                        onMouseDown={(e) => {
                                                                            e.stopPropagation();
                                                                            setLastInteractedScreenId(screen.id);
                                                                        }}
                                                                    onClick={() => {
                                                                        setShowStylePanel(false);
                                                                        setShowLayerPanel(false);
                                                                        setShowTablePanel(true);
                                                                    }}
                                                                    className={`p-2 rounded-lg transition-colors ${showTablePanel && selectedCellIndices.length > 0 ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                                >
                                                                    <Palette size={18} />
                                                                </button>
                                                            </PremiumTooltip>
                                                        </div>
                                                            ;
                                                    })()}
                                                    {/* 이미지 스타일 버튼 - 이미지 선택 시 표시 */}
                                                    {(() => {
                                                        const selEl = drawElements.find(el => selectedElementIds.includes(el.id));
                                                        if (!selEl || selEl.type !== 'image') return null;
                                                        return (
                                                            <div className="flex items-center gap-1 border-l border-gray-200 pl-1 ml-1">
                                                                    <PremiumTooltip label="이미지 스타일" screenId={screen.id}>
                                                                    <button
                                                                            onMouseDown={(e) => {
                                                                                e.stopPropagation();
                                                                                setLastInteractedScreenId(screen.id);
                                                                            }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                            const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                            setImageStylePanelPos({ x: flowPos.x, y: flowPos.y });
                                                                            const willOpen = !showImageStylePanel;
                                                                            setShowImageStylePanel(prev => !prev);
                                                                            if (willOpen) setImageCropMode(true);
                                                                        }}
                                                                        className={`p-2 rounded-lg transition-colors ${showImageStylePanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                                    >
                                                                        <Crop size={18} />
                                                                    </button>
                                                                </PremiumTooltip>
                                                            </div>
                                                        );
                                                    })()}
                                                        <PremiumTooltip label="사각형" screenId={screen.id}>
                                                        <button
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    setLastInteractedScreenId(screen.id);
                                                                }}
                                                            onClick={() => setActiveTool('rect')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'rect' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        >
                                                            <Square size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                        <PremiumTooltip label="원형" screenId={screen.id}>
                                                        <button
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    setLastInteractedScreenId(screen.id);
                                                                }}
                                                            onClick={() => setActiveTool('circle')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'circle' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        >
                                                            <Circle size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                        <div className="relative" ref={shapePanelAnchorRef}>
                                                            <PremiumTooltip label="도형 (삼각형·다각형)" screenId={screen.id}>
                                                        <button
                                                                    type="button"
                                                                    onMouseDown={(e) => {
                                                                        e.stopPropagation();
                                                                        setLastInteractedScreenId(screen.id);
                                                                    }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            e.preventDefault();
                                                                            setShapeSubPanelOpen(prev => !prev);
                                                                        }}
                                                                    className={`p-2 rounded-lg transition-colors ${activeTool === 'polygon' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                                >
                                                                    <Triangle size={18} />
                                                                </button>
                                                            </PremiumTooltip>
                                                            {shapeSubPanelOpen && shapePanelAnchorRef.current && createPortal(
                                                                <FloatingPanelWrapper
                                                                    anchorRef={shapePanelAnchorRef}
                                                                    data-shape-panel
                                                                    data-screen-id={screen.id}
                                                                    className="nodrag nopan fixed bg-white border border-gray-200 rounded-xl shadow-2xl z-[9000] py-2 min-w-[140px] animate-in fade-in zoom-in-95 origin-top-left"
                                                                    onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                                                                >
                                                                    <div className="px-3 pb-2 mb-1 border-b border-gray-100">
                                                                        <span className="text-[11px] font-bold text-gray-600">도형</span>
                                                                    </div>
                                                                    {(['triangle', 'diamond', 'pentagon', 'hexagon', 'x-shape'] as PolygonPreset[]).map((preset) => (
                                                                        <button
                                                                            key={preset}
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setPolygonPresetToCreate(preset);
                                                                                setActiveTool('polygon');
                                                                                setShapeSubPanelOpen(false);
                                                                            }}
                                                                            className="w-full px-3 py-2 text-left text-[11px] hover:bg-gray-100 flex items-center gap-2 rounded-none"
                                                                        >
                                                                            {preset === 'triangle' && '삼각형'}
                                                                            {preset === 'diamond' && '다이아몬드'}
                                                                            {preset === 'pentagon' && '오각형'}
                                                                            {preset === 'hexagon' && '육각형'}
                                                                            {preset === 'x-shape' && 'X 도형'}
                                                                        </button>
                                                                    ))}
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setArrowPresetToCreate('arrow');
                                                                            setActiveTool('arrow');
                                                                            setShapeSubPanelOpen(false);
                                                                        }}
                                                                        className="w-full px-3 py-2 text-left text-[11px] hover:bg-gray-100 flex items-center gap-2 rounded-none"
                                                                    >
                                                                        화살표
                                                                    </button>
                                                                </FloatingPanelWrapper>,
                                                                document.body
                                                            )}
                                                        </div>
                                                        <div className="relative" ref={linePanelAnchorRef}>
                                                            <PremiumTooltip label="선 생성" screenId={screen.id}>
                                                                <button
                                                                    type="button"
                                                                    onMouseDown={(e) => {
                                                                        e.stopPropagation();
                                                                        setLastInteractedScreenId(screen.id);
                                                                    }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            e.preventDefault();
                                                                            setLinePanelOpen(prev => !prev);
                                                                        }}
                                                                    className={`p-2 rounded-lg transition-colors ${activeTool === 'line' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                                >
                                                                    <Minus size={18} style={{ transform: 'rotate(-45deg)' }} />
                                                                </button>
                                                            </PremiumTooltip>
                                                            {linePanelOpen && linePanelAnchorRef.current && createPortal(
                                                                <FloatingPanelWrapper
                                                                    anchorRef={linePanelAnchorRef}
                                                                    data-line-panel
                                                                    data-screen-id={screen.id}
                                                                    className="nodrag nopan fixed bg-white border border-gray-200 rounded-xl shadow-2xl z-[9000] py-2 min-w-[160px] animate-in fade-in zoom-in-95 origin-top-left"
                                                                    onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                                                                >
                                                                    <div className="px-3 pb-2 mb-1 border-b border-gray-100">
                                                                        <span className="text-[11px] font-bold text-gray-600">선</span>
                                                                    </div>
                                                                    {[
                                                                        { strokeStyle: 'solid' as const, lineEnd: 'none' as LineEnd, label: '실선' },
                                                                        { strokeStyle: 'dashed' as const, lineEnd: 'none' as LineEnd, label: '점선' },
                                                                        { strokeStyle: 'solid' as const, lineEnd: 'start' as LineEnd, label: '화살표(왼쪽)' },
                                                                        { strokeStyle: 'solid' as const, lineEnd: 'end' as LineEnd, label: '화살표(오른쪽)' },
                                                                        { strokeStyle: 'solid' as const, lineEnd: 'both' as LineEnd, label: '화살표(양쪽)' },
                                                                    ].map((preset) => (
                                                                        <button
                                                                            key={`${preset.strokeStyle}-${preset.lineEnd}`}
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setLinePresetToCreate({ strokeStyle: preset.strokeStyle, lineEnd: preset.lineEnd });
                                                                                setActiveTool('line');
                                                                                setLinePanelOpen(false);
                                                                            }}
                                                                            className="w-full px-3 py-2 text-left text-[11px] hover:bg-gray-100 flex items-center gap-2 rounded-none"
                                                                        >
                                                                            {preset.label}
                                                                        </button>
                                                                    ))}
                                                                </FloatingPanelWrapper>,
                                                                document.body
                                                            )}
                                                        </div>
                                                        <PremiumTooltip label="텍스트" screenId={screen.id}>
                                                            <button
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    setLastInteractedScreenId(screen.id);
                                                                }}
                                                            onClick={() => setActiveTool('text')}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'text' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                        >
                                                            <Type size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                        <PremiumTooltip label="이미지 삽입" screenId={screen.id}>
                                                        <button
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    setLastInteractedScreenId(screen.id);
                                                                }}
                                                            onClick={() => imageInputRef.current?.click()}
                                                            className="p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-500"
                                                        >
                                                            <ImageIcon size={18} />
                                                        </button>
                                                    </PremiumTooltip>
                                                    <input
                                                        ref={imageInputRef}
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file || !file.type.startsWith('image/')) return;
                                                            const cw = canvasRef.current?.clientWidth ?? 400;
                                                            const ch = canvasRef.current?.clientHeight ?? 300;
                                                            const newId = `draw_${Date.now()}`;

                                                                // ── ✨ 수정: 서버에 올리기 전에 "로컬 파일"에서 직접 크기를 잽니다 (CORS 에러 완벽 차단) ──
                                                                const tempUrl = URL.createObjectURL(file);
                                                                const img = new Image();
                                                                img.src = tempUrl;
                                                                await new Promise(resolve => {
                                                                    img.onload = resolve;
                                                                    img.onerror = resolve;
                                                                });
                                                                const natW = img.naturalWidth || 200;
                                                                const natH = img.naturalHeight || 150;
                                                                const ratio = natW / natH;
                                                                URL.revokeObjectURL(tempUrl); // 메모리 누수 방지 해제

                                                                // 그 다음 서버에 실제 업로드를 진행합니다.
                                                            let imageUrl: string;
                                                            try {
                                                                imageUrl = await uploadImage(file);
                                                            } catch {
                                                                imageUrl = await new Promise<string>((resolve, reject) => {
                                                                    const reader = new FileReader();
                                                                    reader.onload = () => resolve(reader.result as string);
                                                                    reader.onerror = reject;
                                                                    reader.readAsDataURL(file);
                                                                });
                                                            }

                                                                // 초기 캔버스 삽입 시 너무 크지 않도록 최대 크기 지정 (비율 유지)
                                                                let w = natW;
                                                                let h = natH;
                                                                const MAX_W = 400;
                                                                const MAX_H = 300;
                                                                
                                                                if (w > MAX_W) { w = MAX_W; h = w / ratio; }
                                                                if (h > MAX_H) { h = MAX_H; w = h * ratio; }

                                                            const imgEl: DrawElement = {
                                                                id: newId,
                                                                type: 'image',
                                                                x: Math.max(10, cw / 2 - w / 2),
                                                                y: Math.max(10, ch / 2 - h / 2),
                                                                width: w,
                                                                height: h,
                                                                zIndex: drawElements.length + 1,
                                                                imageUrl,
                                                            };
                                                            const nextElements = [...drawElements, imgEl];
                                                            update({ drawElements: nextElements });
                                                            syncUpdate({ drawElements: nextElements });
                                                            saveHistory(nextElements);
                                                            setSelectedElementIds([newId]);
                                                            e.target.value = '';
                                                        }}
                                                    />
                                                    <div className="w-px h-6 bg-gray-200 mx-1" />
                                                        <PremiumTooltip label="기능 번호" screenId={screen.id}>
                                                        <button
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    setLastInteractedScreenId(screen.id);
                                                                }}
                                                            onClick={() => {
                                                                // If already select tool, just set tool. 
                                                                // But user wants "auto-add" when clicking this button.
                                                                const existingFuncNos = drawElements.filter(el => el.type === 'func-no');
                                                                let nextNo = 1;
                                                                let nextX = 20;
                                                                let nextY = 20;

                                                                if (existingFuncNos.length > 0) {
                                                                    const numbers = existingFuncNos
                                                                        .map(el => parseInt(el.text || '0'))
                                                                        .filter(n => !isNaN(n));
                                                                    if (numbers.length > 0) {
                                                                        nextNo = Math.max(...numbers) + 1;
                                                                    }

                                                                    // Find a position that doesn't overlap with existing func-nos
                                                                    // We'll try to find the "last" added func-no and offset from it, 
                                                                    // or just keep shifting until we find a clear spot.
                                                                    const lastFuncNo = existingFuncNos[existingFuncNos.length - 1];
                                                                    nextX = lastFuncNo.x + 30;
                                                                    nextY = lastFuncNo.y;

                                                                    // If we go too far right, move down and reset X
                                                                    if (nextX > 400) {
                                                                        nextX = 20;
                                                                        nextY += 40;
                                                                    }
                                                                }

                                                                const newId = `draw_${Date.now()}`;
                                                                const newElement: DrawElement = {
                                                                    id: newId,
                                                                    type: 'func-no',
                                                                    x: nextX,
                                                                    y: nextY,
                                                                    width: 24,
                                                                    height: 24,
                                                                    fill: '#ef4444',
                                                                    stroke: '#ffffff',
                                                                    strokeWidth: 2,
                                                                    zIndex: drawElements.length + 1,
                                                                    text: nextNo.toString(),
                                                                    fontSize: 12,
                                                                    color: '#ffffff',
                                                                    borderRadius: 12,
                                                                };

                                                                const nextElements = [...drawElements, newElement];
                                                                update({ drawElements: nextElements });
                                                                syncUpdate({ drawElements: nextElements });
                                                                saveHistory(nextElements);
                                                                setSelectedElementIds([newId]);
                                                                setActiveTool('select');
                                                            }}
                                                            className={`p-2 rounded-lg transition-colors ${activeTool === 'func-no' ? 'bg-red-100 text-red-600' : 'hover:bg-red-50 text-gray-500'}`}
                                                        >
                                                            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ${activeTool === 'func-no' ? 'bg-red-600 text-white' : 'bg-red-500 text-white'}`}>N</div>
                                                        </button>
                                                    </PremiumTooltip>
                                                    <div className="relative" ref={gridPanelAnchorRef}>
                                                            <PremiumTooltip label="격자 보기" screenId={screen.id}>
                                                            <button
                                                                    onMouseDown={(e) => {
                                                                        e.stopPropagation();
                                                                        setLastInteractedScreenId(screen.id);
                                                                    }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (!showGridPanel) {
                                                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                        const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                        setGridPanelPos({ x: flowPos.x, y: flowPos.y });
                                                                    }
                                                                    setShowGridPanel(prev => !prev);
                                                                }}
                                                                className={`p-2 rounded-lg transition-colors ${showGridPanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                            >
                                                                <Grid3x3 size={18} />
                                                            </button>
                                                        </PremiumTooltip>
                                                        {showGridPanel && createPortal(
                                                            (() => {
                                                                const screenPos = flowToScreenPosition({ x: gridPanelPos.x, y: gridPanelPos.y });
                                                                return (
                                                            <div
                                                                data-grid-panel
                                                                            data-screen-id={screen.id}
                                                                className="nodrag nopan floating-panel fixed bg-white border border-gray-200 rounded-xl shadow-2xl p-2 z-[9000] flex flex-col animate-in fade-in zoom-in origin-top-left"
                                                                style={{
                                                                    left: screenPos.x,
                                                                    top: screenPos.y,
                                                                                transform: 'scale(1)',
                                                                }}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                            >
                                                                <div
                                                                    className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2 cursor-grab active:cursor-grabbing group/header"
                                                                    onMouseDown={handleGridPanelHeaderMouseDown}
                                                                    title="드래그하여 이동"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                                                                        <Grid3x3 size={12} className="text-[#2c3e7c]" />
                                                                        <span className="text-[11px] font-bold text-gray-600">격자 보기</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between py-2 mb-2 border-b border-gray-100">
                                                                    <span className="text-[11px] font-medium text-gray-600">격자 활성화</span>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const next = !(screen.guideLinesVisible !== false);
                                                                            update({ guideLinesVisible: next });
                                                                            syncUpdate({ guideLinesVisible: next });
                                                                        }}
                                                                        className={`px-3 py-1 text-[11px] rounded-lg font-medium transition-colors ${screen.guideLinesVisible !== false ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}
                                                                    >
                                                                        {screen.guideLinesVisible !== false ? 'ON' : 'OFF'}
                                                                    </button>
                                                                </div>
                                                                            <div className="flex items-center justify-between py-2 mb-2 border-b border-gray-100">
                                                                                <span className="text-[11px] font-medium text-gray-600">격자 잠금</span>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const next = !(screen.guideLinesLocked === true);
                                                                                        update({ guideLinesLocked: next });
                                                                                        syncUpdate({ guideLinesLocked: next });
                                                                                    }}
                                                                                    className={`px-3 py-1 text-[11px] rounded-lg font-medium transition-colors ${screen.guideLinesLocked === true ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}
                                                                                >
                                                                                    {screen.guideLinesLocked === true ? 'ON' : 'OFF'}
                                                                                </button>
                                                                            </div>
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-[10px] font-medium text-gray-500">격자 추가</span>
                                                                    <div className="flex items-center gap-1">
                                                                                    <PremiumTooltip label="세로줄 추가" screenId={screen.id}>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            addGuideLine('vertical');
                                                                        }}
                                                                        className="px-2 py-1 text-[11px] rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700"
                                                                    >
                                                                        세로줄 추가
                                                                    </button>
                                                                </PremiumTooltip>
                                                                                    <PremiumTooltip label="가로줄 추가" screenId={screen.id}>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            addGuideLine('horizontal');
                                                                        }}
                                                                        className="px-2 py-1 text-[11px] rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700"
                                                                    >
                                                                        가로줄 추가
                                                                    </button>
                                                                </PremiumTooltip>
                                                                    </div>
                                                                </div>
                                                                            <div className="flex flex-col gap-1 pt-1 mt-1 border-t border-gray-100">
                                                                                <span className="text-[10px] font-medium text-gray-500">격자 삭제</span>
                                                                                <div className="flex items-center gap-1">
                                                                                    <PremiumTooltip label="모든 세로·가로 격자선 제거" screenId={screen.id}>
                                                                <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                removeAllGuideLines();
                                                                                            }}
                                                                                            className="px-2 py-1 text-[11px] rounded-md bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600"
                                                                                        >
                                                                                            모든 격자 삭제
                                                                </button>
                                                            </PremiumTooltip>
                                                                                    <PremiumTooltip label="눈금자 간격으로 세로·가로 격자선 전부 추가" screenId={screen.id}>
                                                                <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                addAllGuideLines();
                                                                                            }}
                                                                                            className="px-2 py-1 text-[11px] rounded-md bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-600"
                                                                                        >
                                                                                            모든 격자 추가
                                                                </button>
                                                            </PremiumTooltip>
                                                    </div>
                                                </div>
                                                                            {screen.guideLinesVisible !== false && (
                                                                                <GuideClipboardControls
                                                                                    guideLines={guideLines}
                                                                                    gridClipboard={gridClipboard}
                                                                                    setGridClipboard={setGridClipboard}
                                                                                    update={update}
                                                                                    syncUpdate={syncUpdate}
                                                                                />
                                                                            )}
                                                    </div>
                                                                    );
                                                                })(),
                                                                getPanelPortalRoot()
                                                            )}
                                                    </div>
                                                        </div>
                                                </div>

                                                <CanvasAlignToolbar
                                                    selectedElementIds={selectedElementIds}
                                                    textSelectionRect={textSelectionRect}
                                                    drawElements={drawElements}
                                                    canvasW={canvasW}
                                                    canvasH={canvasH}
                                                    update={update}
                                                    syncUpdate={syncUpdate}
                                                />

                                                {/* Object-to-Object Alignment (2+ selected) */}
                                                <ObjectAlignToolbar
                                                    selectedElementIds={selectedElementIds}
                                                    onAlign={handleObjectAlign}
                                                />

                                            {/* 그룹화 / 그룹화 해제 */}
                                            {selectedElementIds.length >= 1 && (() => {
                                                const selectedEls = drawElements.filter(el => selectedElementIds.includes(el.id));
                                                const hasGrouped = selectedEls.some(el => el.groupId != null);
                                                const groupEnabled = selectedElementIds.length >= 2 && !hasGrouped;
                                                const ungroupEnabled = hasGrouped;
                                                return (
                                                    <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1">
                                                            <PremiumTooltip label="객체 그룹화" screenId={screen.id}>
                                                            <button
                                                                    onMouseDown={(e) => {
                                                                        e.stopPropagation();
                                                                        setLastInteractedScreenId(screen.id);
                                                                    }}
                                                                onClick={() => handleGroup()}
                                                                disabled={!groupEnabled}
                                                                className={`p-2 rounded-lg transition-colors ${groupEnabled ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300 cursor-not-allowed'}`}
                                                            >
                                                                <Group size={18} />
                                                            </button>
                                                        </PremiumTooltip>
                                                            <PremiumTooltip label="그룹화 해제" screenId={screen.id}>
                                                            <button
                                                                    onMouseDown={(e) => {
                                                                        e.stopPropagation();
                                                                        setLastInteractedScreenId(screen.id);
                                                                    }}
                                                                onClick={() => handleUngroup()}
                                                                disabled={!ungroupEnabled}
                                                                className={`p-2 rounded-lg transition-colors ${ungroupEnabled ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300 cursor-not-allowed'}`}
                                                            >
                                                                <Ungroup size={18} />
                                                            </button>
                                                        </PremiumTooltip>
                                                    </div>
                                                );
                                            })()}

                                                {(textSelectionRect || textSelectionFromTable || fontStyleTargetIds.length > 0) && (
                                                    <div data-font-style-trigger className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1 animate-in fade-in duration-200">
                                                        <PremiumTooltip label="폰트 스타일" screenId={screen.id}>
                                                            <button
                                                                type="button"
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    setLastInteractedScreenId(screen.id);
                                                                }}
                                                                onClick={(e) => {
                                                                    if (!showFontStylePanel) {
                                                                        // 패널 열기 전 텍스트 선택 저장
                                                                        const savedSelection = saveTextSelection();
                                                                        if (savedSelection && (textSelectionRect || textSelectionFromTable)) {
                                                                            // 전역 상태에 저장 (TextStyleToolbar에서 사용)
                                                                            (window as any).__savedTextSelection = savedSelection;
                                                                        }

                                                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                        const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                        setFontStylePanelPos({ x: flowPos.x, y: flowPos.y });
                                                                    }
                                                                    setShowFontStylePanel(!showFontStylePanel);
                                                                }}
                                                                className={`p-2 rounded-lg transition-colors ${showFontStylePanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                            >
                                                                <Type size={18} />
                                                            </button>
                                                        </PremiumTooltip>
                                                    </div>
                                                )}
                                            <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1 animate-in fade-in duration-200">
                                                    <PremiumTooltip label="색상 및 스타일" screenId={screen.id}>
                                                    <button
                                                            type="button"
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                setLastInteractedScreenId(screen.id);
                                                            }}
                                                        onClick={(e) => {
                                                                e.stopPropagation();
                                                            if (!showStylePanel) {
                                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                setStylePanelPos({ x: flowPos.x, y: flowPos.y });
                                                            }
                                                            setShowStylePanel(!showStylePanel);
                                                            setShowLayerPanel(false);
                                                            setShowTablePanel(false);
                                                        }}
                                                        className={`p-2 rounded-lg transition-colors ${showStylePanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                    >
                                                        <Palette size={18} />
                                                    </button>
                                                </PremiumTooltip>
                                                    <PremiumTooltip label="레이어 순서" screenId={screen.id}>
                                                    <button
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                setLastInteractedScreenId(screen.id);
                                                            }}
                                                        onClick={(e) => {
                                                            if (!showLayerPanel) {
                                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                const flowPos = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 });
                                                                setLayerPanelPos({ x: flowPos.x, y: flowPos.y });
                                                            }
                                                            setShowLayerPanel(!showLayerPanel);
                                                            setShowStylePanel(false);
                                                            setShowTablePanel(false);
                                                        }}
                                                        className={`p-2 rounded-lg transition-colors ${showLayerPanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                                                    >
                                                        <Layers size={18} />
                                                    </button>
                                                </PremiumTooltip>
                                            </div>
                                            </div>
                                        </div>
                                    </div>
                                </StickyToolbarWrapper>
                            )}

                            {/* 폰트 스타일 패널 - 드롭다운 방식 (텍스트 선택 시 버튼 클릭으로 표시) */}
                            {
                                showFontStylePanel && (textSelectionRect || textSelectionFromTable || fontStyleTargetIds.length > 0) && (selectedElementIds.length > 0 || textSelectionFromTable) && (() => {
                                        const fromTable = textSelectionFromTable != null;
                                    const elId = fromTable ? textSelectionFromTable!.tableId : (fontStyleTargetIds[0] ?? selectedElementIds[0]);
                                    const el = drawElements.find(it => it.id === elId);
                                        if (!el) return null;

                                    const defaultColor = fromTable && textSelectionFromTable
                                        ? (el.tableCellStyles?.[textSelectionFromTable.cellIndex]?.color ?? el.color ?? '#333333')
                                        : (el.color || '#333333');
                                        const defaultFontSize = el.fontSize || 14;

                                    const tableCellFontSize = fromTable && textSelectionFromTable
                                        ? (el.tableCellStyles?.[textSelectionFromTable.cellIndex]?.fontSize ?? el.fontSize ?? 14)
                                        : null;
                                    const displayFontSize = (fromTable && tableCellFontSize != null)
                                        ? tableCellFontSize
                                        : defaultFontSize;

                                    return createPortal(
                                        <FloatingPanelWrapper
                                            data-font-style-panel
                                            data-screen-id={screen.id}
                                            className="nodrag nopan bg-white border border-gray-200 rounded-xl shadow-2xl p-3 z-[9000] animate-in fade-in zoom-in-95"
                                            flowPos={fontStylePanelPos}
                                            zoom={1}
                                            flowToScreenPosition={flowToScreenPosition}
                                            onMouseDown={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                            }}
                                        >
                                            <div
                                                className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2 cursor-grab active:cursor-grabbing group/header select-none"
                                                onMouseDown={handleFontStylePanelHeaderMouseDown}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <GripVertical size={14} className="text-gray-300 group-hover/header:text-gray-400 transition-colors" />
                                                    <Type size={14} className="text-[#2c3e7c]" />
                                                    <span className="text-[11px] font-bold text-gray-600">폰트 스타일</span>
                                                    </div>
                                                                <button
                                                    type="button"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={() => setShowFontStylePanel(false)}
                                                    className="p-1 rounded hover:bg-gray-100 text-gray-500"
                                                >
                                                    <X size={14} />
                                                </button>
                                                        </div>
                                            <TextStyleToolbar
                                                el={el}
                                                fromTable={fromTable}
                                                defaultColor={defaultColor}
                                                displayFontSize={displayFontSize}
                                                updateElement={updateElement}
                                                applyToSelection={(fn) => applyToSelection(fn, fromTable)}
                                                applyFontSizePx={applyFontSizePx}
                                                getDrawElements={getDrawElements}
                                                update={update}
                                                syncUpdate={syncUpdate}
                                                textSelectionFromTable={textSelectionFromTable}
                                                selectedCellIndices={selectedCellIndices}
                                                editingTableId={editingTableId}
                                                targetElementIds={fromTable ? [el.id] : fontStyleTargetIds}
                                                tableCellSelectionRestoreRef={tableCellSelectionRestoreRef}
                                                screenId={screen.id}
                                            />
                                        </FloatingPanelWrapper>,
                                        getPanelPortalRoot()
                                    );
                                })()
                            }

                            {/* Left + Right pane row - 고정 크기로 영역 딱 맞게 (선택 박스 부자연스러움 해소) */}
                            <div
                                className="flex flex-shrink-0"
                                style={{ height: canvasH + ENTITY_CANVAS_GAP * 2, minHeight: canvasH + ENTITY_CANVAS_GAP * 2 }}
                            >
                                {/* [LEFT PANE] - Drawing Canvas, 콘텐츠 크기에 정확히 맞춤 (GAP=0으로 영역 딱 맞춤) */}
                                <div
                                    className={`${canvasOnlyMode || screen.screenId?.startsWith('CMP-') ? 'rounded-b-[15px]' : 'border-r border-gray-200 rounded-bl-[15px]'} flex-shrink-0 relative bg-gray-50/10 overflow-visible`}
                                    style={{
                                        width: canvasW + ENTITY_CANVAS_GAP * 2 + (!canvasOnlyMode && !screen.screenId?.startsWith('CMP-') ? 1 : 0),
                                        height: canvasH + ENTITY_CANVAS_GAP * 2,
                                        padding: ENTITY_CANVAS_GAP,
                                    }}
                                >
                                    {/* Canvas + Rulers - 패딩으로 상하좌우 균일, 중앙 정렬 제거로 영역 정확히 맞춤
                            - 눈금자 ON: inset = CANVAS_INSET (눈금자 + 여백)
                            - 눈금자 OFF 또는 잠금: inset = 0 (여백 없이 캔버스가 영역 꽉 채움) */}
                                    <div className="relative shrink-0" style={{ width: canvasW, height: canvasH }}>
                                        {/* 격자 dots를 캔버스 전체(하단·우측 inset 스트립 포함)에 채우기 */}
                                        {!isLocked && canvasInset > 0 && (
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    backgroundImage: 'radial-gradient(circle at 0 0, #84878b 1.5px, transparent 1.5px)',
                                                    backgroundSize: `${GRID_STEP}px ${GRID_STEP}px`,
                                                    backgroundPosition: `${(canvasW / 2) % GRID_STEP}px ${(canvasH / 2) % GRID_STEP}px`,
                                                }}
                                            />
                                        )}
                                        <CanvasRulers
                                            canvasWidth={canvasW - canvasInset * 2}
                                            canvasHeight={canvasH - canvasInset * 2}
                                            inset={canvasInset}
                                            visible={!isLocked && screen.guideLinesVisible !== false}
                                        >
                                            {/* Drawing Canvas Area - 캔버스와 감싸는 영역 크기를 동일하게 (스크롤/잘림 없음) */}
                        {(() => {
                            return (
                        <div
                            ref={canvasAreaRef}
                                                        className={`relative flex flex-col shrink-0 overflow-visible`}
                            style={{
                                                            width: canvasW - canvasInset * 2,
                                                            height: canvasH - canvasInset * 2,
                            }}
                        >
                                                        {/* Canvas Viewboard - flex로 캔버스 높이만큼 채움, 스케일 div가 줄어들어 canvasRef가 전체 높이 사용 */}
                            <div
                                                            className="nodrag flex-1 min-h-0 w-full flex flex-col origin-top-left"
                                                            style={{ minHeight: 0 }}
                                                        >
                                                            <div
                                                                className="nodrag flex-1 min-h-0 w-full overflow-visible origin-top-left"
                                style={{
                                                                    minHeight: 0,
                                    width: canvasW,
                                    height: canvasH,
                                                                    transform: `scale(${(canvasW - canvasInset * 2) / canvasW}, ${(canvasH - canvasInset * 2) / canvasH})`,
                                }}
                            >
                            <div
                                ref={canvasRef}
                                className="nodrag w-full h-full relative overflow-visible outline-none cursor-crosshair"
                                onMouseDown={handleCanvasMouseDown}
                                onMouseMove={handleCanvasMouseMove}
                                onMouseUp={handleCanvasMouseUp}
                                onMouseLeave={handleCanvasMouseUp}
                            >
                                                                    {/* Render Existing Elements - Isolated Component */}
                                                                    <DrawElementsList
                                                                        screenId={screen.id}
                                                                isLocked={isLocked}
                                                                        activeTool={activeTool}
                                                                        isDrawing={isDrawing}
                                                                        isMoving={isMoving}
                                                                        isUnifiedGroupSelection={isUnifiedGroupSelection}
                                                                        selectedElementIds={selectedElementIds}
                                                                        editingTextId={editingTextId}
                                                                        editingTableId={editingTableId}
                                                                        editingCellIndex={editingCellIndex}
                                                                        selectedCellIndices={selectedCellIndices}
                                                                        tableCellSelectionRestoreRef={tableCellSelectionRestoreRef}
                                                                        setEditingTableId={setEditingTableId}
                                                                        setEditingCellIndex={setEditingCellIndex}
                                                                        setSelectedCellIndices={setSelectedCellIndices}
                                                                        setTextSelectionRect={setTextSelectionRect}
                                                                        setTextSelectionFromTable={setTextSelectionFromTable}
                                                                        syncUpdate={syncUpdate}
                                                                        updateElement={updateElement}
                                                                        update={update}
                                                                        saveHistory={saveHistory}
                                                                        setSelectedElementIds={setSelectedElementIds}
                                                                        getDrawElements={getDrawElements}
                                                                        isDraggingCellSelectionRef={isDraggingCellSelectionRef}
                                                                        dragStartCellIndexRef={dragStartCellIndexRef}
                                                                        handleElementMouseDown={handleElementMouseDown}
                                                                        handleElementDoubleClick={handleElementDoubleClick}
                                                                        handleElementTextSelectionChange={handleElementTextSelectionChange}
                                                                        handleLineVertexDragStart={handleLineVertexDragStart}
                                                                        handleElementResizeStart={handleElementResizeStart}
                                                                        handlePolygonVertexDragStart={handlePolygonVertexDragStart}
                                                                        deleteElements={deleteElements}
                                                                        currentProjectId={currentProjectId}
                                                                        imageCropMode={imageCropMode}
                                                                        flushPendingSync={flushPendingSync}
                                                                    />

                                                                    {/* Overlays (Group handles, previews, etc.) - rendered once per canvas */}
                                                                    {/* 통합 그룹 선택 시 아웃라인 */}
                                                                    {isUnifiedGroupSelection && selectionBounds && !isLocked && (() => {
                                                                        const gid = drawElements.find((el) => selectedElementIds.includes(el.id))?.groupId;
                                                                        if (!gid) return null;
                                                                return (
                                                                    <div
                                                                                className="absolute pointer-events-none border-2 border-blue-500 z-[125]"
                                                                        style={{
                                                                                    left: selectionBounds.minX,
                                                                                    top: selectionBounds.minY,
                                                                                    width: selectionBounds.maxX - selectionBounds.minX,
                                                                                    height: selectionBounds.maxY - selectionBounds.minY
                                                                                }}
                                                                            >
                                                                                <div onMouseDown={(e) => handleGroupResizeStart(gid, 'nw', e)} className="absolute -top-[2.5px] -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-nw-resize pointer-events-auto z-[130]" />
                                                                                <div onMouseDown={(e) => handleGroupResizeStart(gid, 'ne', e)} className="absolute -top-[2.5px] -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-ne-resize pointer-events-auto z-[130]" />
                                                                                <div onMouseDown={(e) => handleGroupResizeStart(gid, 'sw', e)} className="absolute -bottom-[2.5px] -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-sw-resize pointer-events-auto z-[130]" />
                                                                                <div onMouseDown={(e) => handleGroupResizeStart(gid, 'se', e)} className="absolute -bottom-[2.5px] -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-se-resize pointer-events-auto z-[130]" />
                                                                                <div onMouseDown={(e) => handleGroupResizeStart(gid, 'n', e)} className="absolute -top-[2.5px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-n-resize pointer-events-auto z-[130]" />
                                                                                <div onMouseDown={(e) => handleGroupResizeStart(gid, 's', e)} className="absolute -bottom-[2.5px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-s-resize pointer-events-auto z-[130]" />
                                                                                <div onMouseDown={(e) => handleGroupResizeStart(gid, 'w', e)} className="absolute top-1/2 -translate-y-1/2 -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-w-resize pointer-events-auto z-[130]" />
                                                                                <div onMouseDown={(e) => handleGroupResizeStart(gid, 'e', e)} className="absolute top-1/2 -translate-y-1/2 -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-e-resize pointer-events-auto z-[130]" />
                                                                    </div>
                                                                );
                                                        })()}

                                                                    {/* 일반 다중 선택 시 아웃라인 */}
                                                                    {!isUnifiedGroupSelection && selectedElementIds.length > 1 && selectionBounds && !isLocked && (
                                                                        <div
                                                                            className="absolute pointer-events-none border-2 border-blue-500 z-[125]"
                                                                        style={{
                                                                                left: selectionBounds.minX,
                                                                                top: selectionBounds.minY,
                                                                                width: selectionBounds.maxX - selectionBounds.minX,
                                                                                height: selectionBounds.maxY - selectionBounds.minY
                                                                            }}
                                                                        >
                                                                            <div onMouseDown={(e) => handleMultiSelectionResizeStart('nw', e)} className="absolute -top-[2.5px] -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-nw-resize pointer-events-auto z-[130]" />
                                                                            <div onMouseDown={(e) => handleMultiSelectionResizeStart('ne', e)} className="absolute -top-[2.5px] -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-ne-resize pointer-events-auto z-[130]" />
                                                                            <div onMouseDown={(e) => handleMultiSelectionResizeStart('sw', e)} className="absolute -bottom-[2.5px] -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-sw-resize pointer-events-auto z-[130]" />
                                                                            <div onMouseDown={(e) => handleMultiSelectionResizeStart('se', e)} className="absolute -bottom-[2.5px] -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-se-resize pointer-events-auto z-[130]" />
                                                                            <div onMouseDown={(e) => handleMultiSelectionResizeStart('n', e)} className="absolute -top-[2.5px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-n-resize pointer-events-auto z-[130]" />
                                                                            <div onMouseDown={(e) => handleMultiSelectionResizeStart('s', e)} className="absolute -bottom-[2.5px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-s-resize pointer-events-auto z-[130]" />
                                                                            <div onMouseDown={(e) => handleMultiSelectionResizeStart('w', e)} className="absolute top-1/2 -translate-y-1/2 -left-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-w-resize pointer-events-auto z-[130]" />
                                                                            <div onMouseDown={(e) => handleMultiSelectionResizeStart('e', e)} className="absolute top-1/2 -translate-y-1/2 -right-[2.5px] w-[5px] h-[5px] bg-white border-[1px] border-blue-500 rounded-full shadow-sm hover:scale-125 cursor-e-resize pointer-events-auto z-[130]" />
                                                            </div>
                                                                    )}

                                                                    {/* 부분 컴포넌트화 버튼 */}
                                    {screen.screenId?.startsWith('CMP-') && selectionBounds && selectedElementIds.length >= 1 && !isLocked && (() => {
                                        const alreadyRegistered = new Set((screen.subComponents ?? []).flatMap((s) => s.elementIds));
                                        const hasUnregistered = selectedElementIds.some((id) => !alreadyRegistered.has(id));
                                        const hasRegistered = selectedElementIds.some((id) => alreadyRegistered.has(id));
                                        const showButton = hasUnregistered || hasRegistered;
                                        const isUnregisterMode = hasRegistered;
                                        if (!showButton) return null;
                                        return (
                                            <div
                                                className="absolute nodrag nopan z-[120]"
                                                style={{
                                                    left: selectionBounds.centerX,
                                                                                    top: Math.max(8, selectionBounds.topY - 56),
                                                    transform: 'translateX(-50%)',
                                                }}
                                            >
                                                {isUnregisterMode ? (
                                                    <div className="flex items-center gap-1.5">
                                                                                        <PremiumTooltip label="부분 컴포넌트화 해제" screenId={screen.id}>
                                                                                            <button onClick={(e) => { e.stopPropagation(); handleUnregisterPartialComponent(); }} className="px-2 py-1 bg-gray-400 text-white text-[10px] font-bold rounded-md shadow-md hover:bg-gray-500 flex items-center gap-1">
                                                                                                <PackageX size={12} /> 부분 컴포넌트화 해제
                                                            </button>
                                                        </PremiumTooltip>
                                                        {(() => {
                                                                                            const sub = (screen.subComponents ?? []).find((s) => selectedElementIds.some((id) => s.elementIds.includes(id)));
                                                            if (!sub) return null;
                                                            return (
                                                                <input
                                                                    type="text"
                                                                                                    value={subComponentNameComposing?.subId === sub.id ? subComponentNameComposing.value : sub.name}
                                                                    onChange={(e) => {
                                                                        const v = e.target.value;
                                                                                                        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) { setSubComponentNameComposing({ subId: sub.id, value: v }); return; }
                                                                        setSubComponentNameComposing(null);
                                                                                                        const next = (screen.subComponents ?? []).map((x) => x.id === sub.id ? { ...x, name: v } : x);
                                                                                                        update({ subComponents: next }); syncUpdate({ subComponents: next });
                                                                    }}
                                                                    onCompositionEnd={(e) => {
                                                                        const v = (e.target as HTMLInputElement).value;
                                                                        setSubComponentNameComposing(null);
                                                                                                        const next = (screen.subComponents ?? []).map((x) => x.id === sub.id ? { ...x, name: v } : x);
                                                                                                        update({ subComponents: next }); syncUpdate({ subComponents: next });
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        const v = e.target.value.trim();
                                                                        setSubComponentNameComposing(null);
                                                                                                        if (v && v !== sub.name) { handleUpdateSubComponentName(sub.id, v); }
                                                                    }}
                                                                    className="w-24 px-2 py-1 text-[10px] font-medium border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
                                                                    placeholder="하위 컴포넌트명"
                                                                />
                                                            );
                                                        })()}
                                                    </div>
                                                ) : (
                                                                                    <PremiumTooltip label="부분 컴포넌트화" screenId={screen.id}>
                                                                                        <button onClick={(e) => { e.stopPropagation(); handlePartialComponentize(); }} className="px-2 py-1 bg-violet-500 text-white text-[10px] font-bold rounded-md shadow-md hover:bg-violet-600 flex items-center gap-1">
                                                                                            <Package size={12} /> 부분 컴포넌트화
                                                        </button>
                                                    </PremiumTooltip>
                                                )}
                                            </div>
                                        );
                                    })()}

                                                                    {/* 선 그리기 미리보기 */}
                                                                    {lineDrawStart && lineDrawEnd && linePresetToCreate && (
                                                                        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 9999 }}>
                                                                            <line x1={lineDrawStart.x} y1={lineDrawStart.y} x2={lineDrawEnd.x} y2={lineDrawEnd.y} stroke={hexToRgba('#2c3e7c', 1)} strokeWidth={2} strokeDasharray={linePresetToCreate.strokeStyle === 'dashed' ? '4 2' : linePresetToCreate.strokeStyle === 'dotted' ? '1 2' : undefined} />
                                                                        </svg>
                                                                    )}

                                    {/* Render Temporary Drawing Element */}
                                    {tempElement && (
                                                                        <div style={{ position: 'absolute', left: tempElement.x, top: tempElement.y, width: tempElement.width, height: tempElement.height, zIndex: 9999, pointerEvents: 'none' }}>
                                            {tempElement.type === 'rect' && <div className="w-full h-full border-2 border-blue-500 border-dashed bg-blue-50/20 rounded-sm" />}
                                            {tempElement.type === 'circle' && <div className="w-full h-full border-2 border-blue-500 border-dashed bg-blue-50/20 rounded-full" />}
                                                                            {tempElement.type === 'polygon' && <div className="w-full h-full border-2 border-blue-500 border-dashed bg-blue-50/20 rounded-sm" />}
                                                                            {tempElement.type === 'arrow' && <div className="w-full h-full border-2 border-blue-500 border-dashed bg-blue-50/20 rounded-sm" />}
                                                                            {tempElement.type === 'table' && <div className="w-full h-full border-2 border-blue-500 border-dashed bg-blue-50/20 rounded-sm flex items-center justify-center"><Table2 size={24} className="text-blue-400 opacity-60" /></div>}
                                                                            {tempElement.type === 'func-no' && <div className="w-full h-full border-2 border-red-500 border-dashed bg-red-50/20 rounded-full flex items-center justify-center text-[10px] text-red-600 font-bold">{tempElement.text}</div>}
                                        </div>
                                    )}

                                    {/* Marquee Drag-Selection Rectangle */}
                                    {isDragSelecting && dragSelectRect && dragSelectRect.w > 2 && dragSelectRect.h > 2 && (
                                                                        <div style={{ position: 'absolute', left: dragSelectRect.x, top: dragSelectRect.y, width: dragSelectRect.w, height: dragSelectRect.h, zIndex: 9998, pointerEvents: 'none', border: '1.5px dashed #3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.08)', borderRadius: 3 }} />
                                                                    )}

                                                                    {/* Canvas Grid Lines */}
                                                                    {!isLocked && screen.guideLinesVisible !== false && (() => {
                                                                        const verticalPositions = guideLineDragPreview?.axis === 'vertical'
                                                                            ? (() => {
                                                                                const rest = guideLines.vertical.filter(v => v !== guideLineDragPreview.startValue);
                                                                                if (rest.some(v => Math.abs(v - guideLineDragPreview.currentValue) < 2)) return rest;
                                                                                return [...rest, guideLineDragPreview.currentValue].sort((a, b) => a - b);
                                                                            })()
                                                                            : guideLines.vertical;
                                                                        return verticalPositions.map((vx) => (
                                                                            <div
                                                                                key={guideLineDragPreview?.axis === 'vertical' && guideLineDragPreview.currentValue === vx ? `grid-v-preview-${vx}` : `grid-v-${vx}`}
                                            className="group nodrag"
                                                                                style={{ position: 'absolute', left: vx - 12, top: 0, height: canvasH, width: 24, zIndex: 4500, cursor: screen.guideLinesLocked ? 'default' : 'col-resize', pointerEvents: screen.guideLinesLocked ? 'none' : 'auto' }}
                                                                                onMouseDown={screen.guideLinesLocked ? undefined : (e) => { e.stopPropagation(); if (!(e.target as HTMLElement).closest('[data-guide-delete]')) { handleGuideLineDragStart('vertical', vx, e); } }}
                                                                            >
                                                                                <div style={{ position: 'absolute', left: 11, top: 0, height: canvasH, width: 2, backgroundColor: screen.guideLinesLocked ? 'rgba(239, 239, 239, 0.5)' : 'rgba(232, 223, 177, 0.35)', pointerEvents: 'none', ...(guideLineDragPreview?.axis === 'vertical' && guideLineDragPreview.currentValue === vx ? { boxShadow: '0 2px 12px rgba(0,0,0,0.2)' } : {}) }} />
                                                                                <div data-guide-delete className={`transition-opacity absolute ${!screen.guideLinesLocked && selectedGuideLine?.axis === 'vertical' && selectedGuideLine?.value === vx ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} style={{ left: 0, top: 4 }}>
                                                                                    <PremiumTooltip label="세로줄 삭제" screenId={screen.id}>
                                                                                        <button onClick={(e) => { e.stopPropagation(); removeGuideLine('vertical', vx); setSelectedGuideLine(null); }} className="w-5 h-5 rounded-md bg-white/80 hover:bg-white text-slate-500 hover:text-red-500 border border-slate-200 flex items-center justify-center shadow-sm"><Trash2 size={12} /></button>
                                                </PremiumTooltip>
                                            </div>
                                        </div>
                                                                        ));
                                                                    })()}
                                                                    {!isLocked && screen.guideLinesVisible !== false && (() => {
                                                                        const horizontalPositions = guideLineDragPreview?.axis === 'horizontal'
                                                                            ? (() => {
                                                                                const rest = guideLines.horizontal.filter(v => v !== guideLineDragPreview.startValue);
                                                                                if (rest.some(v => Math.abs(v - guideLineDragPreview.currentValue) < 2)) return rest;
                                                                                return [...rest, guideLineDragPreview.currentValue].sort((a, b) => a - b);
                                                                            })()
                                                                            : guideLines.horizontal;
                                                                        return horizontalPositions.map((vy) => (
                                                                            <div
                                                                                key={guideLineDragPreview?.axis === 'horizontal' && guideLineDragPreview.currentValue === vy ? `grid-h-preview-${vy}` : `grid-h-${vy}`}
                                            className="group nodrag"
                                                                                style={{ position: 'absolute', left: 0, right: 0, top: vy - 12, height: 24, zIndex: 4500, cursor: screen.guideLinesLocked ? 'default' : 'row-resize', pointerEvents: screen.guideLinesLocked ? 'none' : 'auto' }}
                                                                                onMouseDown={screen.guideLinesLocked ? undefined : (e) => { e.stopPropagation(); if (!(e.target as HTMLElement).closest('[data-guide-delete]')) { handleGuideLineDragStart('horizontal', vy, e); } }}
                                                                            >
                                                                                <div style={{ position: 'absolute', left: 0, right: 0, top: 11, height: 2, backgroundColor: screen.guideLinesLocked ? 'rgba(239, 239, 239, 0.5)' : 'rgba(232, 223, 177, 0.35)', pointerEvents: 'none', ...(guideLineDragPreview?.axis === 'horizontal' && guideLineDragPreview.currentValue === vy ? { boxShadow: '0 2px 12px rgba(0,0,0,0.2)' } : {}) }} />
                                                                                <div data-guide-delete className={`transition-opacity absolute ${!screen.guideLinesLocked && selectedGuideLine?.axis === 'horizontal' && selectedGuideLine?.value === vy ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} style={{ left: 4, top: 0 }}>
                                                                                    <PremiumTooltip label="가로줄 삭제" screenId={screen.id}>
                                                                                        <button onClick={(e) => { e.stopPropagation(); removeGuideLine('horizontal', vy); setSelectedGuideLine(null); }} className="w-5 h-5 rounded-md bg-white/80 hover:bg-white text-slate-500 hover:text-red-500 border border-slate-200 flex items-center justify-center shadow-sm"><Trash2 size={12} /></button>
                                                </PremiumTooltip>
                                            </div>
                                        </div>
                                                                        ));
                                                                    })()}

                                                                    {/* Smart Guides */}
                                    {alignmentGuides && <AlignmentGuidesOverlay guides={alignmentGuides} />}
                                                                </div>
                                </div>
                            </div>
                        </div>
                            );
                        })()}

                                        </CanvasRulers>
                                    </div>
                    </div>

                    {/* [RIGHT PANE 30%] - 초기화면설정/기능상세/관련테이블 (화면 설계에만 표시, 컴포넌트 캔버스에서는 숨김) */}
                    {!canvasOnlyMode && !screen.screenId?.startsWith('CMP-') && (
                                    <div className="heavy-node-content h-full w-full"> {/* 🚀 LOD 최적화: 줌아웃 시 속성창 숨김 */}
                    <RightPane
                        screen={screen}
                        isLocked={isLocked}
                        update={update}
                        syncUpdate={syncUpdate}
                        rightPaneRef={rightPaneRef}
                        tableListRef={tableListRef}
                        isTableListOpen={isTableListOpen}
                        setIsTableListOpen={setIsTableListOpen}
                                            linkedErdProjects={linkedErdProjects}
                        erdTables={erdTables}
                        drawElements={drawElements}
                                            screenId={screen.id}
                    />
                                    </div>
                    )}
                    </div>
                        </div > {/* End Body Split Layout */}









                {/* Floating Panels (Style Panel, Layer Panel) */}
                {
                    !isLocked && (
                        <>
                            {/* Style Panel */}
                            {showStylePanel && selectedElementIds.length > 0 && createPortal(
                                <StylePanel
                                    show={showStylePanel}
                                    selectedElementIds={selectedElementIds}
                                    drawElements={drawElements}
                                    stylePanelPos={stylePanelPos}
                                    onPositionChange={setStylePanelPos}
                                            zoom={1}
                                    screenToFlowPosition={screenToFlowPosition}
                                    flowToScreenPosition={flowToScreenPosition}
                                    editingTableId={editingTableId}
                                    selectedCellIndices={selectedCellIndices}
                                            updateElements={updateElements}
                                    onClose={() => setShowStylePanel(false)}
                                    onDragStart={() => { isDraggingStylePanelRef.current = true; }}
                                    onDragEnd={() => { isDraggingStylePanelRef.current = false; }}
                                            screenId={screen.id}
                                />,
                                getPanelPortalRoot()
                            )}



                            {/* ─── Table Panel ─── */}
                            {showTablePanel && (() => {
                                        const tablePanelElements = getScreenById(screen.id)?.drawElements ?? drawElements;
                                        const selectedEl = tablePanelElements.find(el => el.id === selectedElementIds[0]);
                                if (!selectedEl || selectedEl.type !== 'table') return null;
                                                        return (
                                            <TablePanelFloating
                                                show={showTablePanel}
                                                selectedEl={selectedEl}
                                                drawElements={drawElements}
                                                tablePanelPos={tablePanelPos}
                                                setTablePanelPos={setTablePanelPos}
                                                isLocked={isLocked}
                                                editingTableId={editingTableId}
                                                selectedCellIndices={selectedCellIndices}
                                                setSelectedCellIndices={setSelectedCellIndices}
                                                setEditingCellIndex={setEditingCellIndex}
                                                showSplitDialog={showSplitDialog}
                                                setShowSplitDialog={setShowSplitDialog}
                                                splitTarget={splitTarget}
                                                splitRows={splitRows}
                                                setSplitRows={setSplitRows}
                                                splitCols={splitCols}
                                                setSplitCols={setSplitCols}
                                                screenToFlowPosition={screenToFlowPosition}
                                                flowToScreenPosition={flowToScreenPosition}
                                                update={update as (updates: Record<string, unknown>) => void}
                                                syncUpdate={syncUpdate as (updates: Record<string, unknown>) => void}
                                                handleMergeCells={handleMergeCells}
                                                handleSplitCells={handleSplitCells}
                                                handleEqualizeRowHeights={handleEqualizeRowHeights}
                                                handleEqualizeColWidths={handleEqualizeColWidths}
                                                handleExecSplit={handleExecSplit}
                                                saveV2Cells={saveV2Cells}
                                                getScreenById={getScreenById as (id: string) => { drawElements: DrawElement[] } | undefined}
                                                screenId={screen.id}
                                                onClose={() => setShowTablePanel(false)}
                                            />
                                );
                            })()}

                            {/* Layer Panel */}
                            {showLayerPanel && selectedElementIds.length > 0 && createPortal(
                                <LayerPanel
                                    show={showLayerPanel}
                                    selectedElementIds={selectedElementIds}
                                    layerPanelPos={layerPanelPos}
                                    onPositionChange={setLayerPanelPos}
                                    screenToFlowPosition={screenToFlowPosition}
                                    flowToScreenPosition={flowToScreenPosition}
                                    onClose={() => setShowLayerPanel(false)}
                                    onDragStart={() => { isDraggingLayerPanelRef.current = true; }}
                                    onDragEnd={() => { isDraggingLayerPanelRef.current = false; }}
                                    onLayerAction={handleLayerAction}
                                            screenId={screen.id}
                                />,
                                getPanelPortalRoot()
                            )}
                        </>
                    )
                }
            </div >
                    <ScreenHandles />
                </TooltipPortalContext.Provider >
            </div>

            {/* 기능 상세 번호 삭제 확인 팝업 */}
            {funcNoDeleteConfirm && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-80">
                        <h3 className="text-sm font-semibold text-gray-800 mb-3">
                            기능 상세 번호 삭제
                        </h3>
                        <p className="text-xs text-gray-600 mb-4">
                            [{funcNoDeleteConfirm.elementText}]번 기능 상세 번호를 삭제합니다.<br />
                            삭제 후 번호를 어떻게 처리할까요?
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setFuncNoDeleteConfirm(null);
                                    deleteElements([funcNoDeleteConfirm.elementId]);
                                }}
                                className="flex-1 px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                            >
                                그냥 삭제 (순서 유지)
                            </button>
                            <button
                                onClick={() => {
                                    const element = drawElements.find(el => el.id === funcNoDeleteConfirm.elementId);
                                    if (!element) return;
                                    const deletedNumber = parseInt(element.text || '0');

                                    // 순서 초기화: 삭제 후 번호 재할당
                                    const updatedElements = drawElements
                                        .filter(e => e.id !== funcNoDeleteConfirm.elementId)
                                        .map(e => {
                                            if (e.type === 'func-no') {
                                                const currentNum = parseInt(e.text || '0');
                                                if (currentNum > deletedNumber) {
                                                    return { ...e, text: (currentNum - 1).toString() };
                                                }
                                            }
                                            return e;
                                        });

                                    update({ drawElements: updatedElements });
                                    syncUpdate({ drawElements: updatedElements });
                                    saveHistory(updatedElements);
                                    setSelectedElementIds([]);
                                    setFuncNoDeleteConfirm(null);
                                }}
                                className="flex-1 px-3 py-2 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                            >
                                순서 초기화
                            </button>
                        </div>
                        <button
                            onClick={() => setFuncNoDeleteConfirm(null)}
                            className="w-full mt-2 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                        >
                            취소
                        </button>
                    </div>
                </div>,
                document.body
            )}

        </>
    );
});

// 🚀 줌/드래그 시에도 무관한 속성이면 무시. 성능 향상의 핵심
export default memo(ScreenNode, (prevProps, nextProps) => {
    return (
        prevProps.selected === nextProps.selected &&
        prevProps.data.screen === nextProps.data.screen
    );
});
