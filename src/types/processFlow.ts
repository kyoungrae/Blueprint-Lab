export type ProcessFlowNodeType = 'RECT' | 'USER';

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
