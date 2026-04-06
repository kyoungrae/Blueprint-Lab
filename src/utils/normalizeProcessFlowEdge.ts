import type { ProcessFlowEdge } from '../types/processFlow';

/**
 * 예전 노드는 타겟 핸들이 left 하나뿐이었고, Loose 모드에서 top 등 source끼리 연결 시
 * React Flow가 source/target 노드를 뒤집어 저장할 수 있었음.
 * 타겟 쪽 id는 in-top, in-left … 로 통일한다.
 */
export function normalizePfTargetHandle(h?: string | null): string | undefined {
    if (h == null || h === '') return undefined;
    if (h.startsWith('in-')) return h;
    if (h === 'top' || h === 'right' || h === 'bottom' || h === 'left') return `in-${h}`;
    return h;
}

export function normalizeProcessFlowEdge(e: ProcessFlowEdge): ProcessFlowEdge {
    const targetHandle = normalizePfTargetHandle(e.targetHandle);
    if (targetHandle === e.targetHandle) return e;
    return { ...e, targetHandle };
}
