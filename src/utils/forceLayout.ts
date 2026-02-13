import { type Node, type Edge } from 'reactflow';

interface Vector {
    x: number;
    y: number;
}

export const getForceLayoutedElements = (nodes: Node[], edges: Edge[], iterations = 250) => {
    // 1. Initialize nodes with dimensions
    const layoutNodes = nodes.map(node => {
        const measured = (node as any).measured;
        const width = measured?.width || node.width || 320;
        const height = measured?.height || node.height || 220;

        return {
            ...node,
            width,
            height,
            position: { ...node.position },
            velocity: { x: 0, y: 0 } as Vector
        };
    });

    // Strategy: 
    // - High attraction for related nodes to keep them "clumped"
    // - Lower global repulsion so and they don't fly apart too far
    // - Strong local repulsion only when overlapping
    const globalRepulsion = 150000;
    const linkStrength = 0.15; // Increased link strength for better grouping
    const padding = 80;
    const friction = 0.5; // High friction to prevent oscillation

    const avgX = layoutNodes.reduce((sum, n) => sum + n.position.x + n.width / 2, 0) / layoutNodes.length;
    const avgY = layoutNodes.reduce((sum, n) => sum + n.position.y + n.height / 2, 0) / layoutNodes.length;
    const initialCenter = { x: avgX, y: avgY };

    for (let i = 0; i < iterations; i++) {
        const alpha = Math.pow(0.985, i); // Cooling factor

        // A. Global Repulsion - Keeps disconnected groups apart
        for (let j = 0; j < layoutNodes.length; j++) {
            for (let k = j + 1; k < layoutNodes.length; k++) {
                const a = layoutNodes[j];
                const b = layoutNodes[k];

                const dx = (b.position.x + b.width / 2) - (a.position.x + a.width / 2);
                const dy = (b.position.y + b.height / 2) - (a.position.y + a.height / 2);
                const distSq = dx * dx + dy * dy || 1;
                const dist = Math.sqrt(distSq);

                // Box-aware repulsion: stronger when boxes are physically close
                const minDistX = (a.width + b.width) / 2 + padding;
                const minDistY = (a.height + b.height) / 2 + padding;

                let force = 0;
                if (Math.abs(dx) < minDistX && Math.abs(dy) < minDistY) {
                    // Overlapping or very close - push away HARD
                    force = (globalRepulsion * 3) / dist;
                } else {
                    // Regular repulsion for general spacing
                    force = globalRepulsion / distSq;
                }

                const fx = (dx / dist) * force * alpha;
                const fy = (dy / dist) * force * alpha;

                a.velocity.x -= fx;
                a.velocity.y -= fy;
                b.velocity.x += fx;
                b.velocity.y += fy;
            }
        }

        // B. Strong Link Attraction - Groups related entities
        edges.forEach(edge => {
            const source = layoutNodes.find(n => n.id === edge.source);
            const target = layoutNodes.find(n => n.id === edge.target);
            if (source && target) {
                const dx = (target.position.x + target.width / 2) - (source.position.x + source.width / 2);
                const dy = (target.position.y + target.height / 2) - (source.position.y + source.height / 2);
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                // Related nodes want to be relatively close but not overlapping
                const idealDist = Math.max(350, (source.width + target.width + source.height + target.height) / 4 + padding);

                const force = (dist - idealDist) * linkStrength * alpha;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                source.velocity.x += fx;
                source.velocity.y += fy;
                target.velocity.x -= fx;
                target.velocity.y -= fy;
            }
        });

        // C. Gravity pull towards center (prevents floating away)
        layoutNodes.forEach(node => {
            const centerX = node.position.x + node.width / 2;
            const centerY = node.position.y + node.height / 2;
            node.velocity.x += (initialCenter.x - centerX) * 0.02 * alpha;
            node.velocity.y += (initialCenter.y - centerY) * 0.02 * alpha;
        });

        // D. Apply Velocity & High Friction
        layoutNodes.forEach(node => {
            node.position.x += node.velocity.x;
            node.position.y += node.velocity.y;
            node.velocity.x *= friction;
            node.velocity.y *= friction;
        });
    }

    // Final Pass: Strict Overlap Prevention
    for (let pass = 0; pass < 10; pass++) {
        let overlapsFound = false;
        for (let j = 0; j < layoutNodes.length; j++) {
            for (let k = j + 1; k < layoutNodes.length; k++) {
                const a = layoutNodes[j];
                const b = layoutNodes[k];

                const aBox = {
                    l: a.position.x,
                    r: a.position.x + a.width,
                    t: a.position.y,
                    b: a.position.y + a.height
                };
                const bBox = {
                    l: b.position.x,
                    r: b.position.x + b.width,
                    t: b.position.y,
                    b: b.position.y + b.height
                };

                // Collision with small buffer
                const buffer = 30;
                if (aBox.l - buffer < bBox.r && aBox.r + buffer > bBox.l &&
                    aBox.t - buffer < bBox.b && aBox.b + buffer > bBox.t) {
                    overlapsFound = true;

                    const dx = (b.position.x + b.width / 2) - (a.position.x + a.width / 2);
                    const dy = (b.position.y + b.height / 2) - (a.position.y + a.height / 2);

                    // Push apart
                    if (Math.abs(dx) > Math.abs(dy)) {
                        const overlap = (a.width + b.width) / 2 + buffer - Math.abs(dx);
                        const move = (overlap / 2) + 2;
                        if (dx > 0) { a.position.x -= move; b.position.x += move; }
                        else { a.position.x += move; b.position.x -= move; }
                    } else {
                        const overlap = (a.height + b.height) / 2 + buffer - Math.abs(dy);
                        const move = (overlap / 2) + 2;
                        if (dy > 0) { a.position.y -= move; b.position.y += move; }
                        else { a.position.y += move; b.position.y -= move; }
                    }
                }
            }
        }
        if (!overlapsFound) break;
    }

    return {
        nodes: layoutNodes.map(({ velocity, width, height, ...node }) => node),
        edges
    };
};
