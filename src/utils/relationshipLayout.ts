import { type Node, type Edge } from 'reactflow';

/**
 * 테이블 크기 계산 (겹침 방지)
 */
function getNodeSize(node: Node): { width: number; height: number } {
    const measured = (node as any).measured;
    
    let width = 350;
    if (measured && measured.width > 0) width = Math.max(width, measured.width);
    else if (node.width) width = Math.max(width, node.width);

    let estimatedHeight = 200;
    const data = node.data as any;
    const attributes = data?.entity?.attributes || data?.attributes;

    if (Array.isArray(attributes)) {
        estimatedHeight = 80 + (attributes.length * 40) + 50;
    } else {
        estimatedHeight = 800; 
    }

    let height = estimatedHeight;
    if (measured && measured.height > 0) height = Math.max(height, measured.height);
    else if (node.height) height = Math.max(height, node.height);

    return { width, height };
}

/**
 * 1. 그래프 탐색(DFS)을 통해 선(Edge)으로 연결된 테이블 묶음들을 찾아냅니다.
 */
function getConnectedComponents(nodes: Node[], edges: Edge[]): Node[][] {
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
    const components: Node[][] = [];

    function dfs(v: number, comp: Node[]) {
        visited[v] = true;
        comp.push(nodes[v]);
        adj[v].forEach((u) => {
            if (!visited[u]) dfs(u, comp);
        });
    }

    for (let i = 0; i < n; i++) {
        if (!visited[i]) {
            const comp: Node[] = [];
            dfs(i, comp);
            components.push(comp);
        }
    }

    components.sort((a, b) => b.length - a.length);
    return components;
}

/**
 * 2. 식별 관계 군락별로 섬을 만들고, 외톨이들은 하나의 섬으로 묶어 배치합니다.
 */
export function getRelationshipLayoutedElements(
    nodes: Node[],
    edges: Edge[],
    _direction: 'TB' | 'LR' = 'LR'
): { nodes: Node[]; edges: Edge[] } {
    if (nodes.length === 0) return { nodes, edges };

    const allComponents = getConnectedComponents(nodes, edges);

    // ★ 핵심 추가 로직: 식별 관계가 있는 그룹과 없는 그룹 분리
    const linkedComponents: Node[][] = [];
    const isolatedNodes: Node[] = [];

    allComponents.forEach(comp => {
        if (comp.length > 1) {
            linkedComponents.push(comp); // 2개 이상 연결된 군락
        } else {
            isolatedNodes.push(comp[0]); // 아무와도 연결 안 된 외톨이
        }
    });

    // 연결된 군락들을 먼저 섬으로 만들고, 마지막에 외톨이들을 싹 다 모아 '거대한 1개의 섬'으로 만듭니다.
    const finalComponents = [...linkedComponents];
    if (isolatedNodes.length > 0) {
        finalComponents.push(isolatedNodes);
    }

    const GAP_X = 250;     // 섬 내부 테이블 간 가로 간격
    const GAP_Y = 250;     // 섬 내부 테이블 간 세로 간격
    const ISLAND_GAP = 1200; // 섬과 섬 사이의 거대한 간격

    // 1단계: 각 군락(섬)의 내부 레이아웃을 계산합니다.
    const islands = finalComponents.map(compNodes => {
        // 섬 내부에서는 알파벳 순 정렬 (공통코드끼리 예쁘게 모임)
        compNodes.sort((a, b) => {
            const nameA = (a.data?.entity?.name || a.data?.name || a.id).toLowerCase();
            const nameB = (b.data?.entity?.name || b.data?.name || b.id).toLowerCase();
            return nameA.localeCompare(nameB);
        });

        // 섬의 크기에 따라 가로폭 유동적 조절
        let maxRowWidth = 4000; 
        if (compNodes.length <= 3) maxRowWidth = 1200;
        else if (compNodes.length <= 10) maxRowWidth = 2500;
        else if (compNodes.length > 20) maxRowWidth = 6000; // 외톨이 섬이 아주 클 경우를 대비해 가로를 넓게 퍼트림

        let currentX = 0;
        let currentY = 0;
        let currentRowHeight = 0;

        let islandWidth = 0;
        let islandHeight = 0;

        const positionedNodes = compNodes.map(node => {
            const { width, height } = getNodeSize(node);

            if (currentX + width > maxRowWidth && currentX > 0) {
                currentX = 0;
                currentY += currentRowHeight + GAP_Y;
                currentRowHeight = 0;
            }

            const posX = currentX;
            const posY = currentY;

            currentX += width + GAP_X;
            currentRowHeight = Math.max(currentRowHeight, height);

            islandWidth = Math.max(islandWidth, currentX);
            islandHeight = Math.max(islandHeight, currentY + currentRowHeight);

            return { ...node, position: { x: posX, y: posY } };
        });

        return {
            nodes: positionedNodes,
            width: islandWidth,
            height: islandHeight
        };
    });

    // 2단계: 완성된 섬(Island)들을 거대한 세계(World) 지도에 정사각형 비율로 바둑판 배치합니다.
    let totalArea = 0;
    islands.forEach(island => {
        totalArea += (island.width + ISLAND_GAP) * (island.height + ISLAND_GAP);
    });

    const worldWidth = Math.max(
        Math.sqrt(totalArea) * 1.2, 
        Math.max(...islands.map(i => i.width)) + ISLAND_GAP * 2
    );

    let worldX = 0;
    let worldY = 0;
    let worldRowHeight = 0;

    const finalNodes: Node[] = [];

    islands.forEach(island => {
        if (worldX + island.width > worldWidth && worldX > 0) {
            worldX = 0;
            worldY += worldRowHeight + ISLAND_GAP;
            worldRowHeight = 0;
        }

        island.nodes.forEach(node => {
            finalNodes.push({
                ...node,
                position: {
                    x: node.position.x + worldX,
                    y: node.position.y + worldY
                }
            });
        });

        worldX += island.width + ISLAND_GAP;
        worldRowHeight = Math.max(worldRowHeight, island.height);
    });

    return { nodes: finalNodes, edges };
}
