// 화면 설계서(Screen Design) 타입 정의

/** 기능 명세서 상세 항목 (New) */
export interface ScreenSpecItem {
    id: string;
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

/** 화면(Screen) - 설계 문서 한 장에 해당 */
export interface Screen {
    id: string;
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

    // ── 캔버스 위치 ──
    // ── 캔버스 위치 ──
    position: { x: number; y: number };
    imageWidth?: number;
    imageHeight?: number;
    tablePanelHeight?: number;
    functionPanelHeight?: number;
    contentPanelHeight?: number;
    isLocked?: boolean;
    contentMode?: 'IMAGE' | 'DRAW'; // UI 콘텐츠 모드 (이미지 업로드 vs 직접 그리기)
    drawElements?: DrawElement[];   // 직접 그리기 영역의 요소들
}

/** 직접 그리기 요소 타입 */
export interface DrawElement {
    id: string;
    type: 'rect' | 'circle' | 'text' | 'image' | 'table';
    x: number;
    y: number;
    width: number;
    height: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    text?: string;
    fontSize?: number;
    fontWeight?: string;
    color?: string;
    imageUrl?: string;
    opacity?: number;
    fillOpacity?: number;
    strokeOpacity?: number;
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    zIndex: number;
    // Table-specific properties
    tableRows?: number;
    tableCols?: number;
    tableCellData?: string[];  // flat array: cellData[row * cols + col]
    tableColWidths?: number[]; // percentage widths for each column (should sum to 100)
    tableRowHeights?: number[]; // percentage heights for each row (should sum to 100)
    tableCellColors?: (string | undefined)[]; // per-cell background colors (flat array)
    tableCellStyles?: (Record<string, any> | undefined)[]; // per-cell style overrides (borders, etc.)
    // Global/Default border settings for table
    tableBorderTop?: string;
    tableBorderTopWidth?: number;
    tableBorderBottom?: string;
    tableBorderBottomWidth?: number;
    tableBorderLeft?: string;
    tableBorderLeftWidth?: number;
    tableBorderRight?: string;
    tableBorderRightWidth?: number;
    tableCellSpans?: { rowSpan: number, colSpan: number }[]; // per-cell span info (flat array)
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
}

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
