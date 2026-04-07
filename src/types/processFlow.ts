export type ProcessFlowNodeType = 'RECT' | 'USER';

/** RECT 노드의 시각적 도형 (미지정 시 사각형과 동일) */
export type ProcessFlowRectShape = 'rectangle' | 'diamond' | 'trapezoid' | 'db';

export interface ProcessFlowTextStyle {
    fontSize?: number;
    color?: string;
    bold?: boolean;
    italic?: boolean;
}

export interface ProcessFlowNodeStyle {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    width?: number;
    height?: number;
    radius?: number;
}

export interface ProcessFlowNode {
    id: string;
    type: ProcessFlowNodeType;
    /** type이 RECT일 때만 사용. 생략 시 rectangle */
    shape?: ProcessFlowRectShape;
    /** 데이터베이스 도형(shape: db)에서 연결된 ERD 테이블 물리명 */
    linkedErdTableName?: string;
    position: { x: number; y: number };
    text?: string;
    /** 노드에 대한 메모/노트 */
    memo?: string;
    userRole?: 'user' | 'admin';
    textStyle?: ProcessFlowTextStyle;
    style?: ProcessFlowNodeStyle;
    sectionId?: string | null;
    isLocked?: boolean;
}

export interface ProcessFlowEdgeStyle {
    stroke?: string;
    strokeWidth?: number;
}

export type ProcessFlowArrowType = 'none' | 'arrow';

export interface ProcessFlowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: 'top' | 'right' | 'bottom' | 'left' | string;
    targetHandle?: 'top' | 'right' | 'bottom' | 'left' | string;
    animated?: boolean;
    style?: ProcessFlowEdgeStyle;
    arrow?: { start?: ProcessFlowArrowType; end?: ProcessFlowArrowType };
    /** 연결선 종류(라벨) - 사용자가 직접 입력. 없으면 색상 프리셋 기반 라벨 사용 */
    kindText?: string;
}

export interface ProcessFlowSection {
    id: string;
    name?: string;
    parentId?: string | null;
    position: { x: number; y: number };
    size: { width: number; height: number };
    color?: string;
}
