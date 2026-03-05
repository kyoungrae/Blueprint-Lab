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
    // 가장 큰 그룹부터 배치하기 위해 정렬
    components.sort((a, b) => b.length - a.length);
    return components;
}

const COMPONENT_GAP = 200;
const RADIAL_GAP = 160;
const MAX_ROW_WIDTH = 4000;

function getNodeSize(node: Node): { width: number; height: number } {
    const measured = (node as any).measured;
    const width = (measured?.width ?? node.width) || 250;
    const height = (measured?.height ?? node.height) || 200;
    return { width, height };
}

/**
 * 개선된 방사형(별모양) 레이아웃:
 * 중심(가장 연결 많은 노드)을 기준으로 주변에 자식 테이블을 빙 둘러 배치.
 * 테이블 특성상 세로가 길기 때문에 타원 궤적(또는 반경을 매우 넉넉히)을 주어 귀퉁이 겹침을 방지.
 */
function layoutComponentRadial(
    compNodes: Node[],
    getSize: (n: Node) => { width: number; height: number },
    compEdges: Edge[]
): Node[] {
    if (compNodes.length === 1) {
        return [{ ...compNodes[0], position: { x: 0, y: 0 } }];
    }

    const compIdSet = new Set(compNodes.map((n) => n.id));
    const degree = new Map<string, number>();
    compNodes.forEach((n) => degree.set(n.id, 0));
    compEdges.forEach((e) => {
        if (compIdSet.has(e.source) && compIdSet.has(e.target)) {
            degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
            degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
        }
    });

    // Center = 가장 관계가 많은 (degree가 높은) 노드
    let centerNode = compNodes[0];
    let maxDeg = degree.get(centerNode.id) ?? 0;
    compNodes.forEach((n) => {
        const d = degree.get(n.id) ?? 0;
        if (d > maxDeg) {
            maxDeg = d;
            centerNode = n;
        }
    });

    const surrounding = compNodes.filter((n) => n.id !== centerNode.id);
    const k = surrounding.length;
    const centerSize = getSize(centerNode);
    let maxSurroundingWidth = 0;
    let maxSurroundingHeight = 0;
    surrounding.forEach((n) => {
        const s = getSize(n);
        maxSurroundingWidth = Math.max(maxSurroundingWidth, s.width);
        maxSurroundingHeight = Math.max(maxSurroundingHeight, s.height);
    });

    // 겹침 방지를 위해 반경(R) 계산을 가로/세로 분리해서 넉넉히 주거나 가장 긴 변을 기준으로 크게 잡습니다.
    const maxSurroundingDim = Math.max(maxSurroundingWidth, maxSurroundingHeight);

    // 외곽 노드끼리 겹치지 않기 위한 둘레 확보
    const minRadiusByChord = k >= 2
        ? (maxSurroundingDim * 1.5 + RADIAL_GAP) / (2 * Math.sin(Math.PI / k))
        : 0;

    // 중앙 노드와 겹치지 않기 위한 거리 확보
    const minRadiusByCenterY = centerSize.height / 2 + maxSurroundingHeight / 2 + RADIAL_GAP;
    const minRadiusByCenterX = centerSize.width / 2 + maxSurroundingWidth / 2 + RADIAL_GAP;

    const R_x = Math.max(minRadiusByChord, minRadiusByCenterX, 300);
    const R_y = Math.max(minRadiusByChord, minRadiusByCenterY, 300);

    const centerPos = {
        x: -centerSize.width / 2,
        y: -centerSize.height / 2,
    };

    const positions: { id: string; x: number; y: number }[] = [
        { id: centerNode.id, ...centerPos },
    ];

    // 주변 노드들을 분산 배치 (타원형)
    for (let i = 0; i < k; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / k;
        const cx = R_x * Math.cos(angle);
        const cy = R_y * Math.sin(angle);
        const node = surrounding[i];
        const { width, height } = getSize(node);
        positions.push({
            id: node.id,
            x: cx - width / 2,
            y: cy - height / 2,
        });
    }

    const posById = new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]));
    return compNodes.map((node) => ({
        ...node,
        position: posById.get(node.id) ?? { x: 0, y: 0 },
    }));
}

/**
 * 관계 정렬:
 * 연결된 엔티티 묶음별로 그룹을 분리 → 각 그룹 내부는 중심(코어)테이블을 가운데 두고 주변에 둥글게 배치(겹침 안 나게 넓게 확장)
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

        // 1. 그룹 내 노드들을 방사형(별모양)으로 겹치지 않게 널찍이 배치
        const positioned = layoutComponentRadial(compNodes, getNodeSize, compEdges);

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
