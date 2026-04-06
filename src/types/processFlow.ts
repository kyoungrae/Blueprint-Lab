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
    position: { x: number; y: number };
    text?: string;
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
}

export interface ProcessFlowSection {
    id: string;
    name?: string;
    parentId?: string | null;
    position: { x: number; y: number };
    size: { width: number; height: number };
    color?: string;
}
