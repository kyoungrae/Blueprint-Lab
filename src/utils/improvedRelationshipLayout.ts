import dagre from 'dagre';
import { type Node, type Edge } from 'reactflow';

/**
 * 개선된 관계 연결선 로직
 * 더 정확한 핸들 계산과 시각적 명확성 향상
 */

export interface OptimizedEdgeResult {
    nodes: Node[];
    edges: Edge[];
    connectionInfo: ConnectionInfo[];
}

export interface ConnectionInfo {
    edgeId: string;
    sourceEntity: string;
    targetEntity: string;
    sourceHandle: string;
    targetHandle: string;
    connectionType: 'horizontal' | 'vertical';
    distance: number;
}

/**
 * 개선된 최적 핸들 계산
 */
function getOptimalHandlesImproved(
    srcNode: Node,
    tgtNode: Node,
    srcSize: { width: number; height: number },
    tgtSize: { width: number; height: number }
): { sourceHandle: string; targetHandle: string; connectionType: string; distance: number } {
    const srcCenter = {
        x: srcNode.position.x + srcSize.width / 2,
        y: srcNode.position.y + srcSize.height / 2
    };
    const tgtCenter = {
        x: tgtNode.position.x + tgtSize.width / 2,
        y: tgtNode.position.y + tgtSize.height / 2
    };

    // 상대적 위치 계산
    const dx = tgtCenter.x - srcCenter.x;
    const dy = tgtCenter.y - srcCenter.y;
    
    // 연결 타입 결정
    const connectionType = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    
    let sourceHandle = 'right';
    let targetHandle = 'left';
    
    if (connectionType === 'horizontal') {
        // 수평 연결이 더 효율적일 때
        if (dx > 0) {
            sourceHandle = 'right';
            targetHandle = 'left';
        } else {
            sourceHandle = 'left';
            targetHandle = 'right';
        }
    } else {
        // 수직 연결이 더 효율적일 때
        if (dy > 0) {
            sourceHandle = 'bottom';
            targetHandle = 'top';
        } else {
            sourceHandle = 'top';
            targetHandle = 'bottom';
        }
    }
    
    const distance = Math.hypot(dx, dy);
    
    return { sourceHandle, targetHandle, connectionType: connectionType as 'horizontal' | 'vertical', distance };
}

/**
 * 관계 정보 검증 함수
 */
function validateRelationships(edges: Edge[], nodes: Node[]): {
    valid: Edge[];
    invalid: { edge: Edge; reason: string }[];
    connectionInfo: ConnectionInfo[];
} {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const valid: Edge[] = [];
    const invalid: { edge: Edge; reason: string }[] = [];
    const connectionInfo: ConnectionInfo[] = [];

    edges.forEach(edge => {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);
        
        // 1. 노드 존재 여부 검증
        if (!sourceNode) {
            invalid.push({ edge, reason: `Source node ${edge.source} not found` });
            return;
        }
        if (!targetNode) {
            invalid.push({ edge, reason: `Target node ${edge.target} not found` });
            return;
        }
        
        // 2. 자기 자신 참조 검증
        if (edge.source === edge.target) {
            invalid.push({ edge, reason: 'Self-referencing relationship' });
            return;
        }
        
        // 3. 유효한 관계 정보 생성
        const srcSize = { width: 300, height: 200 }; // 실제 크기 가져와야 함
        const tgtSize = { width: 300, height: 200 };
        
        const optimal = getOptimalHandlesImproved(sourceNode, targetNode, srcSize, tgtSize);
        
        connectionInfo.push({
            edgeId: edge.id,
            sourceEntity: sourceNode.id,
            targetEntity: targetNode.id,
            sourceHandle: optimal.sourceHandle,
            targetHandle: optimal.targetHandle,
            connectionType: optimal.connectionType as 'horizontal' | 'vertical',
            distance: optimal.distance
        });
        
        valid.push(edge);
    });
    
    return { valid, invalid, connectionInfo };
}

/**
 * 개선된 관계 레이아웃 함수
 */
export function getOptimizedRelationshipLayout(
    nodes: Node[],
    edges: Edge[],
    direction: 'TB' | 'LR' = 'LR'
): OptimizedEdgeResult {
    console.time('Optimized Relationship Layout');
    
    // 1. 관계 검증
    const { valid, invalid, connectionInfo } = validateRelationships(edges, nodes);
    
    // 2. 잘못된 관계 로그 출력
    if (invalid.length > 0) {
        console.warn('=== Invalid Relationships Found ===');
        invalid.forEach(({ edge, reason }) => {
            console.warn(`Invalid: ${edge.source} -> ${edge.target} (${reason})`);
        });
        console.warn('====================================');
    }
    
    // 3. 유효한 관계만으로 레이아웃 수행
    if (valid.length === 0) {
        console.log('No valid relationships to layout');
        return { nodes, edges: [], connectionInfo: [] };
    }
    
    // 4. 기존 레이아웃 로직 적용 (간소화 버전)
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    
    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 250,
        ranksep: 200,
        marginx: 100,
        marginy: 100
    });
    
    // 노드 추가
    nodes.forEach(node => {
        dagreGraph.setNode(node.id, { width: 300, height: 200 });
    });
    
    // 유효한 엣지만 추가
    valid.forEach(edge => {
        dagreGraph.setEdge(edge.source, edge.target);
    });
    
    // 레이아웃 실행
    dagre.layout(dagreGraph);
    
    // 노드 위치 업데이트
    const layoutedNodes = nodes.map(node => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - 150,
                y: nodeWithPosition.y - 100
            }
        };
    });
    
    // 5. 최적 핸들로 엣지 업데이트
    const nodeMap = new Map(layoutedNodes.map(n => [n.id, n]));
    const layoutedEdges = valid.map(edge => {
        const srcNode = nodeMap.get(edge.source);
        const tgtNode = nodeMap.get(edge.target);
        
        if (!srcNode || !tgtNode) return edge;
        
        const optimal = getOptimalHandlesImproved(srcNode, tgtNode, { width: 300, height: 200 }, { width: 300, height: 200 });
        
        return {
            ...edge,
            sourceHandle: optimal.sourceHandle,
            targetHandle: optimal.targetHandle,
            style: {
                strokeWidth: 2,
                stroke: optimal.connectionType === 'horizontal' ? '#3b82f6' : '#10b981',
                opacity: 0.8
            },
            label: `${optimal.connectionType} (${Math.round(optimal.distance)}px)`,
            labelStyle: {
                fontSize: 10,
                fill: '#6b7280'
            }
        };
    });
    
    console.timeEnd('Optimized Relationship Layout');
    console.log(`Layout complete: ${layoutedNodes.length} nodes, ${layoutedEdges.length} edges`);
    console.log(`Invalid relationships removed: ${invalid.length}`);
    
    return {
        nodes: layoutedNodes,
        edges: layoutedEdges,
        connectionInfo
    };
}

/**
 * 엑셀 데이터 기반 관계 검증 (엑셀 파일 구조 추정)
 */
export function validateExcelRelationships(excelData: any[]): {
    valid: any[];
    invalid: any[];
    summary: {
        total: number;
        validCount: number;
        invalidCount: number;
        selfReferencing: number;
        missingEntities: number;
    };
} {
    const valid: any[] = [];
    const invalid: any[] = [];
    const summary = {
        total: excelData.length,
        validCount: 0,
        invalidCount: 0,
        selfReferencing: 0,
        missingEntities: 0
    };
    
    excelData.forEach((row, index) => {
        // 엑셀 데이터 구조 추정:
        // - source_table: 소스 테이블명
        // - target_table: 타겟 테이블명  
        // - relationship_type: 관계 타입 (1:1, 1:N, N:M)
        // - source_column: 소스 컬럼명
        // - target_column: 타겟 컬럼명
        
        const sourceTable = row.source_table || row.소스테이블 || row.source;
        const targetTable = row.target_table || row.타겟테이블 || row.target;
        const relationshipType = row.relationship_type || row.관계타입 || row.type;
        
        // 검증 로직
        if (!sourceTable || !targetTable) {
            invalid.push({
                row: index + 1,
                data: row,
                reason: 'Missing source or target table'
            });
            summary.invalidCount++;
            return;
        }
        
        if (sourceTable === targetTable) {
            invalid.push({
                row: index + 1,
                data: row,
                reason: 'Self-referencing relationship'
            });
            summary.selfReferencing++;
            summary.invalidCount++;
            return;
        }
        
        // 유효한 관계
        valid.push({
            row: index + 1,
            sourceTable,
            targetTable,
            relationshipType: relationshipType || '1:N',
            sourceColumn: row.source_column || row.소스컬럼 || 'id',
            targetColumn: row.target_column || row.타겟컬럼 || 'id'
        });
        summary.validCount++;
    });
    
    console.log('=== Excel Relationship Validation ===');
    console.log(`Total: ${summary.total}`);
    console.log(`Valid: ${summary.validCount}`);
    console.log(`Invalid: ${summary.invalidCount}`);
    console.log(`Self-referencing: ${summary.selfReferencing}`);
    console.log('===================================');
    
    return { valid, invalid, summary };
}
