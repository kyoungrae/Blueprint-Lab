import dagre from 'dagre';
import { type Node, type Edge } from 'reactflow';

const COMPONENT_GAP = 150;
const MAX_ROW_WIDTH = 3000;

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
    // 가장 큰 그룹부터 배치하기 위해 정렬
    components.sort((a, b) => b.length - a.length);
    return components;
}

function getNodeSize(node: Node): { width: number; height: number } {
    const measured = (node as any).measured;
    const width = (measured?.width ?? node.width) || 250;
    const height = (measured?.height ?? node.height) || 200;
    return { width, height };
}

/**
 * 독립된 묶음(Component)에 대해 Dagre 계층 레이아웃을 수행합니다.
 * 이를 통해 선(Edge) 꼬임과 겹침을 최소화하고, 노드간 겹침을 원천 차단합니다.
 */
function layoutComponentDagre(compNodes: Node[], compEdges: Edge[]): Node[] {
    if (compNodes.length <= 1) {
        return compNodes.map(n => ({ ...n, position: { x: 0, y: 0 } }));
    }

    const dagreGraph = new dagre.graphlib.Graph();
    // rankdir 'TB': 위에서 아래로 흐름. ranksep: 상하 간격, nodesep: 좌우 간격
    dagreGraph.setGraph({ rankdir: 'TB', ranksep: 120, nodesep: 140 });
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

/**
 * 관계 정렬:
 * 연결된 엔티티 묶음별로 그룹을 분리 → 각 그룹 내부는 Dagre로 깔끔하게 정렬(겹침 X)
 * → 완성된 그룹 덩어리들을 화면에 타일처럼 줄바꿈 배치
 */
export function getRelationshipLayoutedElements(
    nodes: Node[],
    edges: Edge[],
    _direction: 'TB' | 'LR' = 'TB'
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

        // 1. 그룹 내 노드들을 Dagre로 배치
        const positioned = layoutComponentDagre(compNodes, compEdges);

        // 2. 그룹의 bounding box(전체 크기) 계산
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

        // 3. 줄바꿈 처리 (가로로 너무 길어지면 다음 줄로)
        if (currentOffsetX + compW > MAX_ROW_WIDTH && currentOffsetX > 0) {
            currentOffsetX = 0;
            currentOffsetY += currentRowHeight + COMPONENT_GAP;
            currentRowHeight = 0;
        }

        // 4. 오프셋 적용하여 실제 위치 결정
        const withOffset = positioned.map((node) => ({
            ...node,
            position: {
                x: node.position.x - minX + currentOffsetX,
                y: node.position.y - minY + currentOffsetY,
            },
        }));

        layoutedNodes.push(...withOffset);

        // 다음 요소를 위한 포인터 업데이트
        currentOffsetX += compW + COMPONENT_GAP;
        currentRowHeight = Math.max(currentRowHeight, compH);
    }

    const layoutedById = new Map(layoutedNodes.map((n) => [n.id, n]));
    const resultNodes = nodes.map((node) => layoutedById.get(node.id) ?? node);

    return { nodes: resultNodes, edges };
}
