// 화면 설계서(Screen Design) 타입 정의

export interface ScreenSpecItem {
    id: string;
    tableNameKr: string;    // 테이블명(한글)
    tableNameEn: string;    // 테이블명(영문)
    fieldName: string;      // 항목명(한글)
    controlName: string;    // 필드명(영문)
    dataType: string;       // 항목타입

    // 항목정의
    format: string;         // Format
    length: string;         // 자릿수
    defaultValue: string;   // 초기값
    validation: string;     // Validation

    memo: string;           // 비고
}

/** 화면 내 개별 필드/항목 (기능 번호가 붙는 항목 - UI 설계용) */
export interface ScreenField {
    id: string;
    no: number;             // 기능 번호 (①, ②, ...)
    name: string;           // 항목명
    fieldType: string;      // 유형
    description?: string;   // 기능 설명
}

/** ERD와 동일: 드래그로 만든 그룹 영역. 화면 노드를 섹션 안에 넣을 수 있음 */
export interface ScreenSection {
    id: string;
    name?: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
}

/** 화면(Screen) - 설계 문서 한 장에 해당 */
export interface Screen {
    id: string;
    /** 이 화면이 속한 섹션 id (없으면 루트) */
    sectionId?: string | null;
    // ── 헤더 정보 ──
    systemName: string;     // 시스템명
    screenId: string;       // 화면 ID
    name: string;           // 화면명
    author: string;         // 작성자
    createdDate: string;    // 작성일자
    screenType: string;     // 화면유형
    page: string;           // 페이지
    screenDescription: string; // 화면설명

    // ── 본문 좌측 패널 (UI 모드) ──
    imageUrl?: string;         // UI 목업 이미지

    // ── 본문 우측 패널 (UI 모드) ──
    initialSettings: string;   // 초기화면설정
    functionDetails: string;   // 기능상세
    relatedTables: string;     // 관련테이블

    // ── 기능 항목 (UI 모드) ──
    fields: ScreenField[];

    // ── 노드 변형 (UI 설계 vs 기능 명세) ──
    variant?: 'UI' | 'SPEC';   // 기본값 'UI'

    // ── 기능 명세 데이터 (SPEC 모드) ──
    specs?: ScreenSpecItem[];
    /** 명세 그리드 컬럼 너비(px): [항목명, 필드명, 항목타입, Format, 자릿수, 초기값, Validation, 비고] */
    specColumnWidths?: number[];
    /** 명세 메타 테이블 컬럼 너비(px): [시스템명,값, 작성자,값, 작성일자,값] 6열 */
    specMetaColumnWidths?: number[];

    // ── 캔버스 위치 ──
    position: { x: number; y: number };

    // ── 화면 엔티티 크기 설정 (용지 사이즈) ──
    pageSize?: PageSizeOption;
    pageOrientation?: PageOrientation;
    imageWidth?: number;
    imageHeight?: number;
    tablePanelHeight?: number;
    functionPanelHeight?: number;
    contentPanelHeight?: number;
    /** RightPane 패널 비율 (0–100, 합 100). [초기화면설정, 기능상세, 관련테이블] */
    rightPaneRatios?: [number, number, number];
    isLocked?: boolean;
    /** 사용자가 잠금 해제한 시간 (자동 잠금용) */
    unlockedAt?: number;
    contentMode?: 'IMAGE' | 'DRAW'; // UI 콘텐츠 모드 (이미지 업로드 vs 직접 그리기)
    drawElements?: DrawElement[];   // 직접 그리기 영역의 요소들
    /** 캔버스 격자 보조선 (draw 요소와 분리 관리) */
    guideLines?: {
        vertical: number[];
        horizontal: number[];
    };
    /** 격자 보조선 표시 여부 (기본 true) */
    guideLinesVisible?: boolean;
    /** 격자 보조선 잠금 - 잠금 시 이동/선택 불가 */
    guideLinesLocked?: boolean;
    /** 하위 컴포넌트 (부분 컴포넌트화) - 화면 설계에서 개별 추가 가능 */
    subComponents?: Array<{
        id: string;
        name: string;
        elementIds: string[];  // drawElements 중 포함할 ID 목록
    }>;
    /** 화면 메모 */
    memo?: string;
}

/** 테이블 셀 데이터 (엑셀형 고도화) */
export interface TableCellData {
    content: string;
    rowSpan: number;
    colSpan: number;
    isMerged: boolean;   // true이면 다른 셀에 병합되어 렌더링에서 제외되는 '슬레이브' 셀
    width?: number;      // 개별 셀 너비 오버라이드 (px)
    height?: number;     // 개별 셀 높이 오버라이드 (px)
}

/** 다각형 도형 프리셋 (삼각형, 다이아몬드, N각형 등) */
export type PolygonPreset = 'triangle' | 'diamond' | 'pentagon' | 'hexagon';

/** 선 요소 화살표 끝 (없음 / 시작점 / 끝점 / 양쪽) */
export type LineEnd = 'none' | 'start' | 'end' | 'both';

/** 직접 그리기 요소 타입 */
export interface DrawElement {
    id: string;
    type: 'rect' | 'circle' | 'text' | 'image' | 'table' | 'func-no' | 'polygon' | 'line';
    x: number;
    y: number;
    width: number;
    height: number;
    /** polygon 전용: 꼭짓점 좌표 (캔버스 절대 좌표). x,y,width,height는 이 점들의 bbox */
    polygonPoints?: { x: number; y: number }[];
    /** polygon 전용: 프리셋 이름 (편집 시 참고용) */
    polygonPreset?: PolygonPreset;
    /** line 전용: 양 끝점 (캔버스 절대 좌표). x,y,width,height는 이 두 점의 bbox */
    lineX1?: number;
    lineY1?: number;
    lineX2?: number;
    lineY2?: number;
    /** line 전용: 화살표 (없음 / 시작 / 끝 / 양쪽) */
    lineEnd?: LineEnd;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    strokeStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
    text?: string;
    fontSize?: number;
    fontWeight?: string;
    fontStyle?: 'normal' | 'italic';
    textDecoration?: 'none' | 'underline';
    fontFamily?: string;
    color?: string;
    imageUrl?: string;
    /** 이미지 회전 (도, 0-360) */
    imageRotation?: number;
    /** 도형/텍스트 등 회전 (도, 0-360). 이미지는 imageRotation 사용 */
    rotation?: number;
    /** 이미지 좌우 대칭 */
    imageFlipX?: boolean;
    /** 이미지 상하 대칭 */
    imageFlipY?: boolean;
    /** 이미지 크롭 영역 (0-1 정규화: x,y=좌상단, width,height=크롭 크기) */
    imageCrop?: { x: number; y: number; width: number; height: number };
    opacity?: number;
    fillOpacity?: number;
    strokeOpacity?: number;
    description?: string;
    borderRadius?: number;
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    zIndex: number;
    groupId?: string;
    /** 컴포넌트로 추가된 경우 원본 컴포넌트 ID (선택 시 보라색 링 표시) */
    fromComponentId?: string;
    /** 컴포넌트로 추가된 경우 원본 drawElement ID (스타일 동기화용) */
    fromElementId?: string;
    /** 텍스트/rect/circle: 컴포넌트에 작성된 텍스트가 있으면 true (삽입 시점 기준, 수정 불가) */
    hasComponentText?: boolean;
    /** 테이블: 컴포넌트에 작성된 텍스트가 있는 셀 인덱스 (해당 셀만 수정 불가) */
    tableCellLockedIndices?: number[];
    // Table-specific properties
    tableRows?: number;
    tableCols?: number;
    tableCellData?: string[];  // [LEGACY] flat array: cellData[row * cols + col]
    tableCellDataV2?: TableCellData[];  // [NEW] 엑셀형 셀 데이터 (flat array, row-major)
    tableColWidths?: number[]; // percentage widths for each column (should sum to 100)
    tableRowColWidths?: number[][]; // independent percentage widths for each row
    tableRowHeights?: number[]; // percentage heights for each row (should sum to 100)
    tableCellColors?: (string | undefined)[]; // per-cell background colors (flat array)
    tableCellStyles?: (Record<string, any> | undefined)[]; // per-cell style overrides (borders, etc.)
    // Global/Default border settings for table
    tableBorderTop?: string;
    tableBorderTopWidth?: number;
    tableBorderTopStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
    tableBorderBottom?: string;
    tableBorderBottomWidth?: number;
    tableBorderBottomStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
    tableBorderLeft?: string;
    tableBorderLeftWidth?: number;
    tableBorderLeftStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
    tableBorderRight?: string;
    tableBorderRightWidth?: number;
    tableBorderRightStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
    /** 안쪽 가로선(행 사이) - 전체 표 선택 시 일괄 설정 */
    tableBorderInsideH?: string;
    tableBorderInsideHWidth?: number;
    tableBorderInsideHStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
    /** 안쪽 세로선(열 사이) - 전체 표 선택 시 일괄 설정 */
    tableBorderInsideV?: string;
    tableBorderInsideVWidth?: number;
    tableBorderInsideVStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
    tableBorderRadius?: number;
    tableBorderRadiusTopLeft?: number;
    tableBorderRadiusTopRight?: number;
    tableBorderRadiusBottomLeft?: number;
    tableBorderRadiusBottomRight?: number;
    tableCellSpans?: { rowSpan: number, colSpan: number }[]; // [LEGACY] per-cell span info
}

/** 화면 간의 흐름/연결 (Flow/Connection) */
export interface ScreenFlow {
    id: string;
    source: string;       // Screen.id (Source)
    target: string;       // Screen.id (Target)
    label?: string;       // 연결 라벨 (예: "페이징", "팝업 호출")
    sourceHandle?: string;
    targetHandle?: string;
}

/** 화면 설계서 전체 상태 */
export interface ScreenDesignState {
    screens: Screen[];
    flows: ScreenFlow[];
    sections?: ScreenSection[];
}

/** 용지 크기 프리셋 (px, 96dpi 기준) */
export const PAGE_SIZE_PRESETS: Record<string, { width: number; height: number }> = {
    A4: { width: 794, height: 1123 },
    B4: { width: 945, height: 1334 },
    A3: { width: 1123, height: 1587 },
    Letter: { width: 816, height: 1056 },
};

/** 용지 크기 표시용 치수 (mm, 세로 기준) */
export const PAGE_SIZE_DIMENSIONS_MM: Record<string, { w: number; h: number }> = {
    A4: { w: 210, h: 297 },
    B4: { w: 250, h: 353 },
    A3: { w: 297, h: 420 },
    Letter: { w: 216, h: 279 },
};

/** 화면 엔티티 용지 크기 선택지 */
export const PAGE_SIZE_OPTIONS = ['A4', 'B4', 'A3', 'Letter'] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

/** 화면의 드로잉 캔버스 크기 (imageWidth/imageHeight 우선, 없으면 pageSize+orientation으로 계산) */
export function getCanvasDimensions(screen: Screen): { width: number; height: number } {
    if (screen.imageWidth != null && screen.imageHeight != null) {
        return { width: screen.imageWidth, height: screen.imageHeight };
    }
    const sizeKey = screen.pageSize && PAGE_SIZE_OPTIONS.includes(screen.pageSize as PageSizeOption) ? screen.pageSize! : 'A4';
    const preset = PAGE_SIZE_PRESETS[sizeKey];
    const orientation = (screen.pageOrientation || 'portrait') as PageOrientation;
    const width = orientation === 'landscape' ? preset.height : preset.width;
    const height = orientation === 'landscape' ? preset.width : preset.height;
    return { width, height };
}

/** 용지 방향 */
export type PageOrientation = 'portrait' | 'landscape';

/** 화면 유형 목록 */
export const SCREEN_TYPES = [
    '조회', '신청', '등록', '수정', '삭제', '관리', '팝업', '대시보드', '로그인', '기타'
] as const;

/** 화면 필드 유형 목록 */
export const SCREEN_FIELD_TYPES = [
    'INPUT',       // 텍스트 입력
    'TEXT',        // 일반 텍스트
    'SELECT',      // 드롭다운 선택
    'TEXTAREA',    // 텍스트 영역
    'PASSWORD',    // 비밀번호 입력
    'CHECKBOX',    // 체크박스
    'RADIO',       // 라디오 버튼
    'BUTTON',      // 버튼
    'LABEL',       // 레이블
    'TABLE',       // 테이블/그리드
    'IMAGE',       // 이미지
    'DATE',        // 날짜 선택
    'FILE',        // 파일 업로드
    'LINK',        // 링크
    'TAB',         // 탭
    'MODAL',       // 모달/팝업
] as const;
