import dagre from 'dagre';
import { type Node, type Edge } from 'reactflow';

/**
 * Find connected components in the graph (undirected).
 * Returns array of node id arrays, each array is one component.
 */
function getConnectedComponents(nodes: Node[], edges: Edge[]): string[][] {
    const idToIndex = new Map<string, number>();
    nodes.forEach((n, i) => idToIndex.set(n.id, i));
    const n = nodes.length;
    const adj: number[][] = Array.from({ length: n }, () => []);
    edges.forEach((e) => {
        const i = idToIndex.get(e.source);
        const j = idToIndex.get(e.target);
        if (i !== undefined && j !== undefined) {
            adj[i].push(j);
            adj[j].push(i);
        }
    });

    const visited = new Array(n).fill(false);
    const components: string[][] = [];

    function dfs(v: number, comp: string[]) {
        visited[v] = true;
        comp.push(nodes[v].id);
        adj[v].forEach((u) => {
            if (!visited[u]) dfs(u, comp);
        });
    }

    for (let i = 0; i < n; i++) {
        if (!visited[i]) {
            const comp: string[] = [];
            dfs(i, comp);
            components.push(comp);
        }
    }
    components.sort((a, b) => b.length - a.length);
    return components;
}

/** 그룹 사이 간격 */
const COMPONENT_GAP = 300;
/** 그룹들을 한 줄에 배치할 최대 가로 폭 */
const MAX_ROW_WIDTH = 5000;

function getNodeSize(node: Node): { width: number; height: number } {
    const measured = (node as any).measured;
    const width = (measured?.width ?? node.width) || 300;
    const height = (measured?.height ?? node.height) || 400;
    return { width, height };
}

/**
 * 독립된 묶음(Component)에 대해 Dagre 계층 레이아웃을 수행합니다.
 * 실제 노드 크기를 기반으로 동적으로 여백을 계산하므로 절대 겹치지 않습니다.
 */
function layoutComponentDagre(compNodes: Node[], compEdges: Edge[], direction: 'TB' | 'LR'): Node[] {
    if (compNodes.length <= 1) {
        return compNodes.map(n => ({ ...n, position: { x: 0, y: 0 } }));
    }

    const dagreGraph = new dagre.graphlib.Graph();
    // increase ranksep and nodesep to ensure edges have plenty of space
    dagreGraph.setGraph({
        rankdir: direction,
        acyclicer: 'greedy',
        ranker: 'network-simplex', // better for avoiding crossings than tight-tree
        ranksep: direction === 'LR' ? 300 : 200,
        nodesep: 200,
    });
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    compNodes.forEach((node) => {
        const { width, height } = getNodeSize(node);
        dagreGraph.setNode(node.id, { width, height });
    });

    compEdges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    return compNodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const { width, height } = getNodeSize(node);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - width / 2,
                y: nodeWithPosition.y - height / 2,
            },
        };
    });
}

function getOptimalHandles(
    srcBounds: { x: number; y: number; w: number; h: number },
    tgtBounds: { x: number; y: number; w: number; h: number }
): { sourceHandle: string; targetHandle: string } {
    const handles = ['top', 'bottom', 'left', 'right'] as const;
    const getPoint = (b: { x: number; y: number; w: number; h: number }, h: typeof handles[number]) => {
        if (h === 'top') return { x: b.x + b.w / 2, y: b.y };
        if (h === 'bottom') return { x: b.x + b.w / 2, y: b.y + b.h };
        if (h === 'left') return { x: b.x, y: b.y + b.h / 2 };
        if (h === 'right') return { x: b.x + b.w, y: b.y + b.h / 2 };
        return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    };

    let minDist = Infinity;
    let best = { sourceHandle: 'right', targetHandle: 'left' };

    for (const sh of handles) {
        for (const th of handles) {
            const p1 = getPoint(srcBounds, sh);
            const p2 = getPoint(tgtBounds, th);
            let dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

            // Add heavy penalty if connection would cross the node body
            const sameX = Math.abs(srcBounds.x - tgtBounds.x) < 50;
            const sameY = Math.abs(srcBounds.y - tgtBounds.y) < 50;

            if (sh === 'right' && tgtBounds.x + tgtBounds.w / 2 < srcBounds.x + srcBounds.w && !sameX) dist += 10000;
            if (sh === 'left' && tgtBounds.x + tgtBounds.w / 2 > srcBounds.x && !sameX) dist += 10000;
            if (sh === 'bottom' && tgtBounds.y + tgtBounds.h / 2 < srcBounds.y + srcBounds.h && !sameY) dist += 10000;
            if (sh === 'top' && tgtBounds.y + tgtBounds.h / 2 > srcBounds.y && !sameY) dist += 10000;

            if (th === 'right' && srcBounds.x + srcBounds.w / 2 < tgtBounds.x + tgtBounds.w && !sameX) dist += 10000;
            if (th === 'left' && srcBounds.x + srcBounds.w / 2 > tgtBounds.x && !sameX) dist += 10000;
            if (th === 'bottom' && srcBounds.y + srcBounds.h / 2 < tgtBounds.y + tgtBounds.h && !sameY) dist += 10000;
            if (th === 'top' && srcBounds.y + srcBounds.h / 2 > tgtBounds.y && !sameY) dist += 10000;

            if (dist < minDist) {
                minDist = dist;
                best = { sourceHandle: sh, targetHandle: th };
            }
        }
    }
    return best;
}

/**
 * 관계 정렬: 연결된 그룹별로 분리 → 각 그룹 Dagre LR 배치 → 전체 타일 패킹
 */
export function getRelationshipLayoutedElements(
    nodes: Node[],
    edges: Edge[],
    direction: 'TB' | 'LR' = 'LR'
): { nodes: Node[]; edges: Edge[] } {
    if (nodes.length === 0) return { nodes, edges };

    const components = getConnectedComponents(nodes, edges);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const layoutedNodes: Node[] = [];

    let currentOffsetX = 0;
    let currentOffsetY = 0;
    let currentRowHeight = 0;

    for (const compIds of components) {
        const compNodes = compIds
            .map((id) => nodeById.get(id))
            .filter((n): n is Node => n != null);
        const compIdSet = new Set(compIds);
        const compEdges = edges.filter(
            (e) => compIdSet.has(e.source) && compIdSet.has(e.target)
        );

        const positioned = layoutComponentDagre(compNodes, compEdges, direction);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        positioned.forEach((node) => {
            const { width, height } = getNodeSize(node);
            minX = Math.min(minX, node.position.x);
            minY = Math.min(minY, node.position.y);
            maxX = Math.max(maxX, node.position.x + width);
            maxY = Math.max(maxY, node.position.y + height);
        });
        const compW = maxX - minX;
        const compH = maxY - minY;

        // 줄바꿈 처리
        if (currentOffsetX + compW > MAX_ROW_WIDTH && currentOffsetX > 0) {
            currentOffsetX = 0;
            currentOffsetY += currentRowHeight + COMPONENT_GAP;
            currentRowHeight = 0;
        }

        const withOffset = positioned.map((node) => ({
            ...node,
            position: {
                x: node.position.x - minX + currentOffsetX,
                y: node.position.y - minY + currentOffsetY,
            },
        }));

        layoutedNodes.push(...withOffset);

        currentOffsetX += compW + COMPONENT_GAP;
        currentRowHeight = Math.max(currentRowHeight, compH);
    }

    const layoutedById = new Map(layoutedNodes.map((n) => [n.id, n]));
    const resultNodes = nodes.map((node) => layoutedById.get(node.id) ?? node);

    // After all nodes are positioned, update edge handles to optimal points
    const resultEdges = edges.map(edge => {
        const srcNode = layoutedById.get(edge.source);
        const tgtNode = layoutedById.get(edge.target);
        if (!srcNode || !tgtNode) return edge;

        const srcSize = getNodeSize(srcNode);
        const tgtSize = getNodeSize(tgtNode);

        const optimal = getOptimalHandles(
            { x: srcNode.position.x, y: srcNode.position.y, w: srcSize.width, h: srcSize.height },
            { x: tgtNode.position.x, y: tgtNode.position.y, w: tgtSize.width, h: tgtSize.height }
        );

        return {
            ...edge,
            sourceHandle: optimal.sourceHandle,
            targetHandle: optimal.targetHandle,
        };
    });

    return { nodes: resultNodes, edges: resultEdges };
}

