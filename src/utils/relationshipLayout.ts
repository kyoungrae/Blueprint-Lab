import { type Node, type Edge } from 'reactflow';

/** 노드 실제 크기 (measured → width/height → 컬럼수 추정) */
function getNodeSize(node: Node): { width: number; height: number } {
    const m = (node as any).measured;
    const w =
        (m?.width  > 0 ? m.width  : undefined) ??
        (typeof node.width  === 'number' && node.width  > 0 ? node.width  : undefined) ??
        340;
    const mh =
        (m?.height > 0 ? m.height : undefined) ??
        (typeof node.height === 'number' && node.height > 0 ? node.height : undefined);
    if (mh != null) return { width: w, height: mh };
    const attrs = (node.data as any)?.entity?.attributes ?? (node.data as any)?.attributes;
    const h = Array.isArray(attrs) ? 96 + attrs.length * 34 : 280;
    return { width: w, height: h };
}

/** 노드의 대각선(충돌 반지름) */
function nodeRadius(node: Node): number {
    const { width, height } = getNodeSize(node);
    return Math.sqrt(width * width + height * height) / 2;
}

/** BFS로 연결 컴포넌트 분리 */
function getConnectedComponents(nodes: Node[], edges: Edge[]): Node[][] {
    const adj = new Map<string, Set<string>>();
    nodes.forEach(n => adj.set(n.id, new Set()));
    edges.forEach(e => {
        adj.get(e.source)?.add(e.target);
        adj.get(e.target)?.add(e.source);
    });
    const visited = new Set<string>();
    const components: Node[][] = [];
    for (const node of nodes) {
        if (visited.has(node.id)) continue;
        const comp: Node[] = [];
        const queue = [node.id];
        visited.add(node.id);
        while (queue.length) {
            const cur = queue.shift()!;
            const found = nodes.find(n => n.id === cur);
            if (found) comp.push(found);
            for (const nb of adj.get(cur) ?? []) {
                if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
            }
        }
        components.push(comp);
    }
    return components.sort((a, b) => b.length - a.length);
}

/**
 * 방사형 트리 레이아웃.
 * - 중심(루트): 연결수 최다 노드
 * - 각 노드는 BFS 부모의 각도 구간(angular slice) 안에 배치
 *   → 부모-자식이 항상 같은 방향에 있어 연결선이 다른 엔티티를 관통하지 않음
 * - 각 링 반지름은 원주에 충분한 공간이 확보되도록 자동 계산
 */
function layoutRadial(
    compNodes: Node[],
    compEdges: Edge[],
): { nodes: Node[]; edges: Edge[]; width: number; height: number } {
    if (compNodes.length === 0) return { nodes: [], edges: compEdges, width: 0, height: 0 };

    const RING_GAP = 120;   // 링 간 최소 여백 (px)
    const NODE_GAP = 50;    // 같은 링 내 노드 간 최소 여백 (px)

    if (compNodes.length === 1) {
        const { width, height } = getNodeSize(compNodes[0]);
        return {
            nodes: [{ ...compNodes[0], position: { x: 0, y: 0 } }],
            edges: compEdges,
            width,
            height,
        };
    }

    // 인접 리스트
    const adj = new Map<string, Set<string>>();
    compNodes.forEach(n => adj.set(n.id, new Set()));
    compEdges.forEach(e => {
        adj.get(e.source)?.add(e.target);
        adj.get(e.target)?.add(e.source);
    });

    // 중심 = 연결수 최다 노드
    const center = [...compNodes].sort(
        (a, b) => (adj.get(b.id)?.size ?? 0) - (adj.get(a.id)?.size ?? 0),
    )[0];

    // BFS — 레벨 + 부모 기록
    const levelOf  = new Map<string, number>();
    const parentOf = new Map<string, string | null>();
    const bfsQueue: string[] = [center.id];
    levelOf.set(center.id, 0);
    parentOf.set(center.id, null);
    while (bfsQueue.length) {
        const cur = bfsQueue.shift()!;
        for (const nb of adj.get(cur) ?? []) {
            if (!levelOf.has(nb)) {
                levelOf.set(nb, (levelOf.get(cur) ?? 0) + 1);
                parentOf.set(nb, cur);
                bfsQueue.push(nb);
            }
        }
    }

    // 레벨별 그룹화
    const maxLevel = Math.max(...levelOf.values());
    const rings: Node[][] = Array.from({ length: maxLevel + 1 }, () => []);
    compNodes.forEach(n => rings[levelOf.get(n.id) ?? 0].push(n));

    // 각 노드의 서브트리 크기 계산 → 부모가 자식에게 각도 구간을 배분할 때 사용
    const subtreeSize = new Map<string, number>();
    // 잎부터 위로 올라가며 계산
    for (let lvl = maxLevel; lvl >= 0; lvl--) {
        for (const n of rings[lvl]) {
            const childSizes = [...(adj.get(n.id) ?? [])]
                .filter(nb => (levelOf.get(nb) ?? 0) > lvl)
                .reduce((s, nb) => s + (subtreeSize.get(nb) ?? 1), 0);
            subtreeSize.set(n.id, Math.max(1, childSizes));
        }
    }

    // 각 노드에 할당된 각도 구간 [angleStart, angleEnd]
    const angleSlice = new Map<string, { start: number; end: number }>();
    angleSlice.set(center.id, { start: 0, end: 2 * Math.PI });

    // 각 링의 반지름 (겹침 없도록 동적 계산)
    const ringRadius: number[] = [0]; // 링 0 = 중심 (r=0)
    let prevOuterR = nodeRadius(rings[0][0]);

    for (let lvl = 1; lvl <= maxLevel; lvl++) {
        const ring = rings[lvl];
        const avgDiag = ring.reduce((s, n) => s + nodeRadius(n) * 2, 0) / ring.length;
        const maxDiag = Math.max(...ring.map(n => nodeRadius(n)));

        // 원주 기반 반지름
        const rByCirc = (ring.length * (avgDiag + NODE_GAP)) / (2 * Math.PI);
        // 이전 링에서 갭 확보
        const rByGap  = prevOuterR + RING_GAP + maxDiag;

        const r = Math.max(rByCirc, rByGap);
        ringRadius.push(r);
        prevOuterR = r + maxDiag;
    }

    // 위치 계산
    const posMap = new Map<string, { x: number; y: number }>();
    const { width: cw, height: ch } = getNodeSize(center);
    posMap.set(center.id, { x: -cw / 2, y: -ch / 2 });

    for (let lvl = 1; lvl <= maxLevel; lvl++) {
        const r = ringRadius[lvl];
        const ring = rings[lvl];

        // 부모별로 그룹화
        const byParent = new Map<string, Node[]>();
        for (const n of ring) {
            const p = parentOf.get(n.id) ?? center.id;
            if (!byParent.has(p)) byParent.set(p, []);
            byParent.get(p)!.push(n);
        }

        // 각 부모의 구간 안에서 자식 노드를 서브트리 크기 비례로 배치
        byParent.forEach((children, parentId) => {
            const { start, end } = angleSlice.get(parentId) ?? { start: 0, end: 2 * Math.PI };
            const span = end - start;
            const totalSize = children.reduce((s, c) => s + (subtreeSize.get(c.id) ?? 1), 0);

            let cursor = start;
            for (const child of children) {
                const size = subtreeSize.get(child.id) ?? 1;
                const childSpan = (size / totalSize) * span;
                const childMid = cursor + childSpan / 2;
                angleSlice.set(child.id, { start: cursor, end: cursor + childSpan });
                cursor += childSpan;

                const { width, height } = getNodeSize(child);
                posMap.set(child.id, {
                    x: Math.cos(childMid) * r - width / 2,
                    y: Math.sin(childMid) * r - height / 2,
                });
            }
        });
    }

    const layoutedNodes = compNodes.map(n => ({
        ...n,
        position: posMap.get(n.id) ?? n.position,
    }));

    // bbox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    layoutedNodes.forEach(n => {
        const { width, height } = getNodeSize(n);
        minX = Math.min(minX, n.position.x);
        minY = Math.min(minY, n.position.y);
        maxX = Math.max(maxX, n.position.x + width);
        maxY = Math.max(maxY, n.position.y + height);
    });

    const normalized = layoutedNodes.map(n => ({
        ...n,
        position: { x: n.position.x - minX, y: n.position.y - minY },
    }));

    // 핸들 할당 — 배치 후 상대 각도 기반
    const centerPosOf = (n: Node) => {
        const p = posMap.get(n.id) ?? { x: 0, y: 0 };
        const { width, height } = getNodeSize(n);
        return { x: p.x + width / 2, y: p.y + height / 2 };
    };

    const assignHandles = (src: Node, tgt: Node): { sourceHandle: string; targetHandle: string } => {
        const sc = centerPosOf(src);
        const tc = centerPosOf(tgt);
        const deg = Math.atan2(tc.y - sc.y, tc.x - sc.x) * (180 / Math.PI);
        if (deg > -45 && deg <= 45)         return { sourceHandle: 'right',  targetHandle: 'left'   };
        if (deg > 45  && deg <= 135)        return { sourceHandle: 'bottom', targetHandle: 'top'    };
        if (deg > 135 || deg <= -135)       return { sourceHandle: 'left',   targetHandle: 'right'  };
        /* -135 ~ -45 */                    return { sourceHandle: 'top',    targetHandle: 'bottom' };
    };

    const nodeMap = new Map(compNodes.map(n => [n.id, n]));
    const edgesWithHandles = compEdges.map(e => {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (!src || !tgt) return e;
        return { ...e, ...assignHandles(src, tgt) };
    });

    return {
        nodes: normalized,
        edges: edgesWithHandles,
        width: maxX - minX,
        height: maxY - minY,
    };
}

/** 고립 노드를 가로 그리드로 배치 */
function layoutIsolated(nodes: Node[]): { nodes: Node[]; width: number; height: number } {
    const GAP = 80;
    const COLS = Math.ceil(Math.sqrt(nodes.length));
    let cx = 0, cy = 0, rowH = 0, col = 0;
    let maxW = 0;
    const result = nodes.map(n => {
        const { width, height } = getNodeSize(n);
        const pos = { x: cx, y: cy };
        cx += width + GAP;
        rowH = Math.max(rowH, height);
        col++;
        if (col >= COLS) {
            maxW = Math.max(maxW, cx - GAP);
            cx = 0; cy += rowH + GAP; rowH = 0; col = 0;
        }
        return { ...n, position: pos };
    });
    return { nodes: result, width: Math.max(maxW, cx), height: cy + rowH };
}

/**
 * ERD 관계 정렬 진입점.
 * 연결 컴포넌트별로 방사형 레이아웃 적용 후
 * 컴포넌트끼리 겹치지 않게 그리드로 배치.
 */
export function getRelationshipLayoutedElements(
    nodes: Node[],
    edges: Edge[],
    _direction: 'TB' | 'LR' = 'LR',
): { nodes: Node[]; edges: Edge[] } {
    if (nodes.length === 0) return { nodes, edges };

    const ISLAND_GAP = 180;
    const MARGIN = 100;

    const components = getConnectedComponents(nodes, edges);
    const linked   = components.filter(c => c.length > 1);
    const isolated = components.filter(c => c.length === 1).map(c => c[0]);

    const islands: Array<{ nodes: Node[]; edges: Edge[]; width: number; height: number }> = [];

    for (const comp of linked) {
        const compEdges = edges.filter(
            e => comp.some(n => n.id === e.source) && comp.some(n => n.id === e.target),
        );
        islands.push(layoutRadial(comp, compEdges));
    }

    if (isolated.length > 0) {
        const { nodes: iso, width, height } = layoutIsolated(isolated);
        islands.push({ nodes: iso, edges: [], width, height });
    }

    // 컴포넌트를 그리드로 배치 (가로 방향 우선)
    const GRID_COLS = Math.max(1, Math.ceil(Math.sqrt(islands.length)));
    let col = 0, cx = 0, cy = 0, rowH = 0;

    const placedIslands = islands.map(island => {
        const ox = cx, oy = cy;
        cx += island.width + ISLAND_GAP;
        rowH = Math.max(rowH, island.height);
        col++;
        if (col >= GRID_COLS) {
            cx = 0; cy += rowH + ISLAND_GAP; rowH = 0; col = 0;
        }
        return { island, ox, oy };
    });

    let allNodes: Node[] = [];
    const edgeMap = new Map<string, Edge>();
    edges.forEach(e => edgeMap.set(e.id, e));

    for (const { island, ox, oy } of placedIslands) {
        island.nodes.forEach(n => {
            allNodes.push({ ...n, position: { x: n.position.x + ox, y: n.position.y + oy } });
        });
        island.edges.forEach(e => edgeMap.set(e.id, e));
    }

    // 전체 정규화 + 여백
    let minX = Infinity, minY = Infinity;
    allNodes.forEach(n => { minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y); });

    allNodes = allNodes.map(n => ({
        ...n,
        position: {
            x: Math.round((n.position.x - minX + MARGIN)),
            y: Math.round((n.position.y - minY + MARGIN)),
        },
    }));

    return { nodes: allNodes, edges: Array.from(edgeMap.values()) };
}
