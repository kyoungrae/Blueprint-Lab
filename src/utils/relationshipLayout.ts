import { type Node, type Edge } from 'reactflow';

const COMPONENT_GAP = 120;
const RADIAL_GAP = 80;

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
    return components;
}

/**
 * Get width/height for a node (same fallbacks as layout.ts).
 */
function getNodeSize(node: Node): { width: number; height: number } {
    const measured = (node as any).measured;
    const width = (measured?.width ?? node.width) || 250;
    const height = (measured?.height ?? node.height) || 200;
    return { width, height };
}

/**
 * Star/radial layout: one center node (max degree), others arranged in a circle around it
 * so they don't overlap. Radius is computed so chord between adjacent nodes >= node size + gap.
 */
function layoutComponentRadial(
    compNodes: Node[],
    getSize: (n: Node) => { width: number; height: number },
    compEdges: Edge[]
): Node[] {
    if (compNodes.length === 1) {
        const n = compNodes[0];
        const { width, height } = getSize(n);
        return [{ ...n, position: { x: 0, y: 0 } }];
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

    // Center = node with highest degree (most relationships)
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
    let maxSurroundingDim = 0;
    surrounding.forEach((n) => {
        const s = getSize(n);
        maxSurroundingDim = Math.max(maxSurroundingDim, s.width, s.height);
    });
    const centerDim = Math.max(centerSize.width, centerSize.height);

    // Radius so that (1) adjacent nodes on circle don't overlap, (2) center and surrounding don't overlap
    // Chord between adjacent = 2*R*sin(π/k). Need >= maxSurroundingDim + RADIAL_GAP.
    // Also R >= (centerDim/2 + maxSurroundingDim/2) + RADIAL_GAP.
    const minRadiusByChord =
        k >= 2
            ? (maxSurroundingDim + RADIAL_GAP) / (2 * Math.sin(Math.PI / k))
            : 0;
    const minRadiusByCenter =
        centerDim / 2 + maxSurroundingDim / 2 + RADIAL_GAP;
    const R = Math.max(minRadiusByChord, minRadiusByCenter, 200);

    // Center node: place so its center is at (0, 0) -> top-left = (-w/2, -h/2)
    const centerPos = {
        x: -centerSize.width / 2,
        y: -centerSize.height / 2,
    };

    // Surrounding: evenly on circle, start from top (-π/2)
    const positions: { id: string; x: number; y: number }[] = [
        { id: centerNode.id, ...centerPos },
    ];
    for (let i = 0; i < k; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / k;
        const cx = R * Math.cos(angle);
        const cy = R * Math.sin(angle);
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
 * Relationship layout: group by connected components; for each group,
 * put the most-connected entity in the center and arrange the rest in a circle
 * around it (no overlap). Components are then placed in a row so they don't overlap.
 */
export function getRelationshipLayoutedElements(
    nodes: Node[],
    edges: Edge[],
    _direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
    if (nodes.length === 0) return { nodes, edges };

    const components = getConnectedComponents(nodes, edges);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const getSize = getNodeSize;
    const layoutedNodes: Node[] = [];
    let offsetX = 0;
    let offsetY = 0;

    for (const compIds of components) {
        const compNodes = compIds
            .map((id) => nodeById.get(id))
            .filter((n): n is Node => n != null);
        const compIdSet = new Set(compIds);
        const compEdges = edges.filter(
            (e) => compIdSet.has(e.source) && compIdSet.has(e.target)
        );

        const positioned = layoutComponentRadial(
            compNodes,
            getSize,
            compEdges
        );

        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        positioned.forEach((node) => {
            const { width, height } = getSize(node);
            minX = Math.min(minX, node.position.x);
            minY = Math.min(minY, node.position.y);
            maxX = Math.max(maxX, node.position.x + width);
            maxY = Math.max(maxY, node.position.y + height);
        });
        const compW = maxX - minX;
        const compH = maxY - minY;

        const withOffset = positioned.map((node) => ({
            ...node,
            position: {
                x: node.position.x - minX + offsetX,
                y: node.position.y - minY + offsetY,
            },
        }));
        layoutedNodes.push(...withOffset);
        offsetX += compW + COMPONENT_GAP;
    }

    const layoutedById = new Map(layoutedNodes.map((n) => [n.id, n]));
    const resultNodes = nodes.map((node) => layoutedById.get(node) ?? node);

    return { nodes: resultNodes, edges };
}
