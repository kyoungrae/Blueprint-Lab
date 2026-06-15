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
 * 방사형 레이아웃 — 연결수가 가장 많은 노드를 중심에 놓고
 * 나머지를 BFS 레벨별 동심원으로 배치.
 *
 * 각 링의 반지름은:
 *   r = max(  innerRadius + gap + maxNodeDiag/2,
 *             N * (avgNodeDiag + gap) / (2π)  )
 * 로 결정하여 노드끼리 겹치지 않도록 보장.
 */
function layoutRadial(
    compNodes: Node[],
    compEdges: Edge[],
): { nodes: Node[]; edges: Edge[]; width: number; height: number } {
    if (compNodes.length === 0) return { nodes: [], edges: compEdges, width: 0, height: 0 };

    const RING_GAP = 100;   // 링 사이 최소 여백
    const NODE_GAP = 60;    // 같은 링 내 노드 간 최소 여백

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

    // 중심 = 연결수 최대 노드
    const center = [...compNodes].sort(
        (a, b) => (adj.get(b.id)?.size ?? 0) - (adj.get(a.id)?.size ?? 0),
    )[0];

    // BFS 레벨 할당
    const levelOf = new Map<string, number>();
    const queue: string[] = [center.id];
    levelOf.set(center.id, 0);
    while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of adj.get(cur) ?? []) {
            if (!levelOf.has(nb)) {
                levelOf.set(nb, (levelOf.get(cur) ?? 0) + 1);
                queue.push(nb);
            }
        }
    }

    // 레벨별 그룹화
    const maxLevel = Math.max(...levelOf.values());
    const rings: Node[][] = Array.from({ length: maxLevel + 1 }, () => []);
    compNodes.forEach(n => rings[levelOf.get(n.id) ?? 0].push(n));

    // 각 링의 반지름 계산 (겹침 방지)
    const posMap = new Map<string, { x: number; y: number }>();
    const centerNode = rings[0][0];
    const { width: cw, height: ch } = getNodeSize(centerNode);
    posMap.set(centerNode.id, { x: -cw / 2, y: -ch / 2 });

    let prevOuterRadius = Math.max(nodeRadius(centerNode), 80);

    for (let lvl = 1; lvl <= maxLevel; lvl++) {
        const ring = rings[lvl];
        const avgDiag = ring.reduce((s, n) => s + nodeRadius(n) * 2, 0) / ring.length;

        // 이 링이 차지해야 할 최소 원주 = N * (avgDiag + gap)
        const minCircumference = ring.length * (avgDiag + NODE_GAP);
        const rByCirc = minCircumference / (2 * Math.PI);

        // 이전 링의 바깥 경계 + 갭 + 이 링 최대 노드 반지름
        const maxDiag = Math.max(...ring.map(n => nodeRadius(n)));
        const rByGap = prevOuterRadius + RING_GAP + maxDiag;

        const r = Math.max(rByCirc, rByGap);

        // 이 링의 노드 배치 — 균등 각도 분할
        // 시작 각도: 정상(12시)에서 시작, 첫 노드가 너무 중심 위에 오지 않도록 약간 회전
        const angleStep = (2 * Math.PI) / ring.length;
        const startAngle = ring.length === 1 ? Math.PI / 2 * 3 : -Math.PI / 2; // 12시 방향

        ring.forEach((n, i) => {
            const angle = startAngle + i * angleStep;
            const { width, height } = getNodeSize(n);
            posMap.set(n.id, {
                x: Math.cos(angle) * r - width / 2,
                y: Math.sin(angle) * r - height / 2,
            });
        });

        prevOuterRadius = r + maxDiag;
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

    // 정규화 (0, 0) 기준
    const normalized = layoutedNodes.map(n => ({
        ...n,
        position: { x: n.position.x - minX, y: n.position.y - minY },
    }));

    // 포지션 맵 (center 기준) — 핸들 할당에 사용
    const centerOf = (n: Node) => {
        const p = posMap.get(n.id) ?? n.position;
        const { width, height } = getNodeSize(n);
        return { x: p.x + width / 2, y: p.y + height / 2 };
    };

    // 두 노드의 중심 간 각도로 최적 핸들 결정
    const assignHandles = (src: Node, tgt: Node): { sourceHandle: string; targetHandle: string } => {
        const sc = centerOf(src);
        const tc = centerOf(tgt);
        const dx = tc.x - sc.x;
        const dy = tc.y - sc.y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 ~ 180

        // 45도 구간으로 4방향 분류
        if (angle > -45 && angle <= 45) {
            return { sourceHandle: 'right', targetHandle: 'left' };
        } else if (angle > 45 && angle <= 135) {
            return { sourceHandle: 'bottom', targetHandle: 'top' };
        } else if (angle > 135 || angle <= -135) {
            return { sourceHandle: 'left', targetHandle: 'right' };
        } else {
            return { sourceHandle: 'top', targetHandle: 'bottom' };
        }
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
