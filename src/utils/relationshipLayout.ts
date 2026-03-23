import { type Node, type Edge } from 'reactflow';

/**
 * 테이블의 실제 크기를 계산하거나 컬럼 개수로 추정합니다.
 */
function getNodeSize(node: Node): { width: number; height: number } {
    const measured = (node as any).measured;
    const width =
        (measured && measured.width > 0 ? measured.width : undefined) ??
        (typeof node.width === 'number' && node.width > 0 ? node.width : undefined) ??
        350;

    // height는 measured/node.height가 있으면 그것을 최우선으로 사용 (추정치로 과대 계산 방지)
    const measuredHeight = measured && measured.height > 0 ? measured.height : undefined;
    const nodeHeight = typeof node.height === 'number' && node.height > 0 ? node.height : undefined;
    if (measuredHeight != null || nodeHeight != null) {
        return { width, height: measuredHeight ?? nodeHeight! };
    }

    const data = node.data as any;
    const attributes = data?.entity?.attributes || data?.attributes;
    if (Array.isArray(attributes)) {
        // 컬럼당 40px + 헤더/여백 160px
        return { width, height: 160 + (attributes.length * 40) };
    }

    // 속성 정보도 없으면 보수적인 기본값 사용
    return { width, height: 400 };
}

/**
 * 연결된 그룹(군락)을 찾는 DFS 알고리즘
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
            adj[i].push(j); adj[j].push(i);
        }
    });
    const visited = new Array(n).fill(false);
    const components: Node[][] = [];
    function dfs(v: number, comp: Node[]) {
        visited[v] = true; comp.push(nodes[v]);
        adj[v].forEach((u) => { if (!visited[u]) dfs(u, comp); });
    }
    for (let i = 0; i < n; i++) {
        if (!visited[i]) { const comp: Node[] = []; dfs(i, comp); components.push(comp); }
    }
    components.sort((a, b) => b.length - a.length);
    return components;
}

// 레이아웃 시 결정된 핸들 정보를 저장 (엣지 연결 시 사용)
const nodeToMasterHandleMap = new Map<string, { source: string; target: string }>();

/**
 * [핵심] 군락 내 방사형 레이아웃: 마스터의 높이에 비례해 간격을 동적으로 조절
 */
function layoutRadialIsland(compNodes: Node[], compEdges: Edge[]): { nodes: Node[], width: number, height: number } {
    if (compNodes.length === 1) {
        const size = getNodeSize(compNodes[0]);
        return { nodes: [{ ...compNodes[0], position: { x: 0, y: 0 } }], width: size.width, height: size.height };
    }

    // 마스터 노드 찾기 (연결선이 가장 많은 노드)
    const degreeMap = new Map<string, number>();
    compNodes.forEach(n => degreeMap.set(n.id, 0));
    compEdges.forEach(e => {
        if (degreeMap.has(e.source)) degreeMap.set(e.source, degreeMap.get(e.source)! + 1);
        if (degreeMap.has(e.target)) degreeMap.set(e.target, degreeMap.get(e.target)! + 1);
    });

    let masterNode = compNodes[0];
    let maxDeg = -1;
    degreeMap.forEach((deg, id) => {
        if (deg > maxDeg) { maxDeg = deg; masterNode = compNodes.find(n => n.id === id)!; }
    });

    const satelliteNodes = compNodes.filter(n => n.id !== masterNode.id);
    const masterSize = getNodeSize(masterNode);
    const positionedNodes: Node[] = [];

    // 마스터 중앙 배치
    positionedNodes.push({ ...masterNode, position: { x: 0, y: 0 } });

    // 자식들을 4방향으로 분배 (우, 하, 좌, 상 순서로 핑퐁)
    const sides: Node[][] = [[], [], [], []]; 
    satelliteNodes.forEach((node, i) => sides[i % 4].push(node));

    // ★ 마스터의 크기에 따른 동적 안전 거리 계산
    const marginX = 800; // 가로 기본 여백
    const marginY = 600; // 세로 기본 여백
    const safeDistX = (masterSize.width / 2) + marginX;
    const safeDistY = (masterSize.height / 2) + marginY;

    let minX = 0, minY = 0, maxX = masterSize.width, maxY = masterSize.height;
    const handleNames = ['right', 'bottom', 'left', 'top'];
    const targetOppositeNames = ['left', 'top', 'right', 'bottom'];

    sides.forEach((group, sideIdx) => {
        group.forEach((node, inIdx) => {
            const size = getNodeSize(node);
            // 같은 방향에 여러 개일 때의 퍼짐 정도
            const spread = (inIdx - (group.length - 1) / 2) * 600;
            let x = 0, y = 0;

            if (sideIdx === 0) { // Right
                x = (masterSize.width / 2) + safeDistX - (size.width / 2);
                y = (masterSize.height / 2) + spread - (size.height / 2);
            } else if (sideIdx === 1) { // Bottom
                x = (masterSize.width / 2) + spread - (size.width / 2);
                y = (masterSize.height / 2) + safeDistY - (size.height / 2);
            } else if (sideIdx === 2) { // Left
                x = (masterSize.width / 2) - safeDistX - (size.width / 2);
                y = (masterSize.height / 2) + spread - (size.height / 2);
            } else if (sideIdx === 3) { // Top
                x = (masterSize.width / 2) + spread - (size.width / 2);
                y = (masterSize.height / 2) - safeDistY - (size.height / 2);
            }

            nodeToMasterHandleMap.set(node.id, {
                source: handleNames[sideIdx],
                target: targetOppositeNames[sideIdx]
            });

            // 스냅 그리드 유지 (선택적)
            const snapX = Math.round(x / 50) * 50;
            const snapY = Math.round(y / 50) * 50;

            positionedNodes.push({ ...node, position: { x: snapX, y: snapY } });
            minX = Math.min(minX, snapX); minY = Math.min(minY, snapY);
            maxX = Math.max(maxX, snapX + size.width); maxY = Math.max(maxY, snapY + size.height);
        });
    });

    const normalizedNodes = positionedNodes.map(n => ({
        ...n,
        position: { x: n.position.x - minX, y: n.position.y - minY }
    }));

    return { nodes: normalizedNodes, width: maxX - minX, height: maxY - minY };
}

/**
 * [외톨이 그룹] 바둑판 정렬
 */
function layoutGridIsland(compNodes: Node[]): { nodes: Node[], width: number, height: number } {
    const GAP_X = 300, GAP_Y = 300;
    const maxRowWidth = compNodes.length > 20 ? 8000 : 4000;
    let currentX = 0, currentY = 0, currentRowHeight = 0;
    let islandWidth = 0, islandHeight = 0;
    
    compNodes.sort((a, b) => {
        const nameA = (a.data?.entity?.name || a.data?.name || a.id).toLowerCase();
        const nameB = (b.data?.entity?.name || b.data?.name || b.id).toLowerCase();
        return nameA.localeCompare(nameB);
    });
    
    const positionedNodes = compNodes.map(node => {
        const { width, height } = getNodeSize(node);
        if (currentX + width > maxRowWidth && currentX > 0) {
            currentX = 0; currentY += currentRowHeight + GAP_Y; currentRowHeight = 0;
        }
        const pos = { x: currentX, y: currentY };
        currentX += width + GAP_X;
        currentRowHeight = Math.max(currentRowHeight, height);
        islandWidth = Math.max(islandWidth, currentX);
        islandHeight = Math.max(islandHeight, currentY + currentRowHeight);
        return { ...node, position: pos };
    });
    return { nodes: positionedNodes, width: islandWidth, height: islandHeight };
}

export function getRelationshipLayoutedElements(nodes: Node[], edges: Edge[], _direction: 'TB' | 'LR' = 'LR'): { nodes: Node[]; edges: Edge[] } {
    if (nodes.length === 0) return { nodes, edges };
    nodeToMasterHandleMap.clear();

    const allComponents = getConnectedComponents(nodes, edges);
    const linkedComponents: Node[][] = [];
    const isolatedNodes: Node[] = [];
    allComponents.forEach(comp => { if (comp.length > 1) linkedComponents.push(comp); else isolatedNodes.push(comp[0]); });

    const islands: Array<{ nodes: Node[], width: number, height: number }> = [];
    linkedComponents.forEach(comp => islands.push(layoutRadialIsland(comp, edges)));
    if (isolatedNodes.length > 0) islands.push(layoutGridIsland(isolatedNodes));

    // 섬(군락) 배치: 새로고침 직후 measured가 불안정해도 흔들리지 않도록 고정 열 그리드 배치
    const ISLAND_GAP = 800;
    const COLUMNS_PER_ROW = 3;

    let finalNodes: Node[] = [];
    let currentX = 0;
    let currentY = 0;
    let maxHInRow = 0;

    islands.forEach((island, index) => {
        if (index > 0 && index % COLUMNS_PER_ROW === 0) {
            currentX = 0;
            currentY += maxHInRow + ISLAND_GAP;
            maxHInRow = 0;
        }

        island.nodes.forEach(node => {
            finalNodes.push({
                ...node,
                position: {
                    x: node.position.x + currentX,
                    y: node.position.y + currentY,
                }
            });
        });

        currentX += island.width + ISLAND_GAP;
        maxHInRow = Math.max(maxHInRow, island.height);
    });

    // 전체 좌표 정규화: 좌상단이 (0,0) 근처로 오도록 평행이동
    if (finalNodes.length > 0) {
        let minWorldX = Infinity;
        let minWorldY = Infinity;
        finalNodes.forEach((n) => {
            minWorldX = Math.min(minWorldX, n.position.x);
            minWorldY = Math.min(minWorldY, n.position.y);
        });
        finalNodes = finalNodes.map((n) => ({
            ...n,
            position: {
                x: Math.round(((n.position.x - minWorldX) / 50)) * 50,
                y: Math.round(((n.position.y - minWorldY) / 50)) * 50,
            },
        }));
    }

    // 레이아웃 결과가 과도하게 커질 경우 전체를 축소해 안정화
    const MAX_WORLD = 12000;
    let maxX = 0;
    let maxY = 0;
    finalNodes.forEach((n) => {
        const { width, height } = getNodeSize(n);
        maxX = Math.max(maxX, n.position.x + width);
        maxY = Math.max(maxY, n.position.y + height);
    });
    const maxDim = Math.max(maxX, maxY);
    if (maxDim > MAX_WORLD) {
        const scale = MAX_WORLD / maxDim;
        finalNodes = finalNodes.map((n) => ({
            ...n,
            position: {
                x: Math.round((n.position.x * scale) / 50) * 50,
                y: Math.round((n.position.y * scale) / 50) * 50,
            },
        }));
    }

    const finalEdges = edges.map(edge => {
        const forced = nodeToMasterHandleMap.get(edge.source) || nodeToMasterHandleMap.get(edge.target);
        if (forced) {
            const isTargetMaster = nodeToMasterHandleMap.has(edge.source);
            return {
                ...edge,
                sourceHandle: isTargetMaster ? forced.target : forced.source,
                targetHandle: isTargetMaster ? forced.source : forced.target,
                style: { strokeWidth: 2, stroke: '#3b82f6' }
            };
        }
        return edge;
    });

    return { nodes: finalNodes, edges: finalEdges };
}
