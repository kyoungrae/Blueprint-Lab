import { v4 as uuidv4 } from 'uuid';
import type { OperationType } from '../models';
import type { IEntity, IRelationship, IScreen, IScreenFlow } from '../models';

// CRDT Operation Interface
export interface CRDTOperation {
    id: string;
    type: OperationType;
    targetId: string;

    // Lamport Clock for ordering
    lamportClock: number;
    wallClock: number;
    userId: string;
    userName: string;

    // Operation payload
    payload: Record<string, unknown>;

    // For undo
    previousState?: Record<string, unknown>;
}

// ERD State Interface
export interface ERDState {
    entities: IEntity[];
    relationships: IRelationship[];
    screens?: IScreen[];
    flows?: IScreenFlow[];
    version: number;
}

export class SyncEngine {
    private lamportClocks: Map<string, number> = new Map(); // projectId -> clock

    /**
     * Get next Lamport clock for a project
     */
    getNextClock(projectId: string): number {
        const current = this.lamportClocks.get(projectId) || 0;
        const next = current + 1;
        this.lamportClocks.set(projectId, next);
        return next;
    }

    /**
     * Update Lamport clock when receiving operation
     */
    updateClock(projectId: string, receivedClock: number): void {
        const current = this.lamportClocks.get(projectId) || 0;
        this.lamportClocks.set(projectId, Math.max(current, receivedClock) + 1);
    }

    /**
     * Create a new operation
     */
    createOperation(
        projectId: string,
        type: OperationType,
        targetId: string,
        userId: string,
        userName: string,
        payload: Record<string, unknown>,
        previousState?: Record<string, unknown>
    ): CRDTOperation {
        return {
            id: uuidv4(),
            type,
            targetId,
            lamportClock: this.getNextClock(projectId),
            wallClock: Date.now(),
            userId,
            userName,
            payload,
            previousState,
        };
    }

    /**
     * Apply operation to ERD state (Last-Writer-Wins)
     */
    applyOperation(state: ERDState, operation: CRDTOperation): ERDState {
        const newState = { ...state, version: state.version + 1 };

        switch (operation.type) {
            case 'ENTITY_CREATE':
                newState.entities = [...state.entities, operation.payload as unknown as IEntity];
                break;

            case 'ENTITY_UPDATE':
            case 'ENTITY_MOVE':
                newState.entities = state.entities.map(e =>
                    e.id === operation.targetId
                        ? { ...e, ...operation.payload }
                        : e
                );
                break;

            case 'ENTITY_DELETE':
                newState.entities = state.entities.filter(e => e.id !== operation.targetId);
                // Also remove related relationships
                newState.relationships = state.relationships.filter(
                    r => r.source !== operation.targetId && r.target !== operation.targetId
                );
                break;

            case 'ATTRIBUTE_ADD':
            case 'ATTRIBUTE_UPDATE':
            case 'ATTRIBUTE_DELETE':
                newState.entities = state.entities.map(e => {
                    if (e.id === operation.targetId) {
                        return { ...e, attributes: operation.payload.attributes as IEntity['attributes'] };
                    }
                    return e;
                });
                break;

            case 'RELATIONSHIP_CREATE':
                newState.relationships = [...state.relationships, operation.payload as unknown as IRelationship];
                break;

            case 'RELATIONSHIP_UPDATE':
                newState.relationships = state.relationships.map(r =>
                    r.id === operation.targetId
                        ? { ...r, ...operation.payload }
                        : r
                );
                break;

            case 'RELATIONSHIP_DELETE':
                newState.relationships = state.relationships.filter(r => r.id !== operation.targetId);
                break;

            case 'ERD_IMPORT':
                const importPayload = operation.payload as any;
                if (importPayload.overwrite) {
                    newState.entities = importPayload.entities || [];
                    newState.relationships = importPayload.relationships || [];
                } else {
                    // Merge logic (roughly similar to frontend mergeData)
                    const importedEntities = importPayload.entities || [];
                    const importedRelationships = importPayload.relationships || [];

                    // Add new entities, avoid duplicates by name
                    const currentEntities = [...state.entities];
                    importedEntities.forEach((newE: any) => {
                        if (!currentEntities.some(e => e.name.toLowerCase() === newE.name.toLowerCase())) {
                            currentEntities.push(newE);
                        }
                    });
                    newState.entities = currentEntities;

                    // Add new relationships
                    const currentRelationships = [...state.relationships];
                    importedRelationships.forEach((newR: any) => {
                        if (!currentRelationships.some(r => r.id === newR.id)) {
                            currentRelationships.push(newR);
                        }
                    });
                    newState.relationships = currentRelationships;
                }
                break;

            case 'SCREEN_CREATE':
                newState.screens = [...(state.screens || []), operation.payload as unknown as IScreen];
                break;

            case 'SCREEN_UPDATE':
            case 'SCREEN_MOVE':
                newState.screens = (state.screens || []).map(s =>
                    s.id === operation.targetId
                        ? { ...s, ...operation.payload }
                        : s
                );
                break;

            case 'SCREEN_DELETE':
                newState.screens = (state.screens || []).filter(s => s.id !== operation.targetId);
                // Also remove connected flows
                newState.flows = (state.flows || []).filter(
                    f => f.source !== operation.targetId && f.target !== operation.targetId
                );
                break;

            case 'FLOW_CREATE':
                newState.flows = [...(state.flows || []), operation.payload as unknown as IScreenFlow];
                break;

            case 'FLOW_UPDATE':
                newState.flows = (state.flows || []).map(f =>
                    f.id === operation.targetId
                        ? { ...f, ...operation.payload }
                        : f
                );
                break;

            case 'FLOW_DELETE':
                newState.flows = (state.flows || []).filter(f => f.id !== operation.targetId);
                break;

            case 'SCREEN_IMPORT':
                const screenPayload = operation.payload as any;
                // Simple overwrite for now, or merge logic like ERD
                if (screenPayload.screens) {
                    newState.screens = screenPayload.screens;
                }
                if (screenPayload.flows) {
                    newState.flows = screenPayload.flows;
                }
                break;
        }

        // Integrity Check: Remove orphan relationships (relationships pointing to non-existent entities)
        const entityIds = new Set(newState.entities.map(e => e.id));
        newState.relationships = newState.relationships.filter(
            r => entityIds.has(r.source) && entityIds.has(r.target)
        );

        return newState;
    }

    /**
     * Merge two operations (LWW - Last Writer Wins based on Lamport clock)
     */
    shouldApply(existing: CRDTOperation | undefined, incoming: CRDTOperation): boolean {
        if (!existing) return true;

        // Higher Lamport clock wins
        if (incoming.lamportClock > existing.lamportClock) return true;

        // If same clock, use wall clock as tiebreaker
        if (incoming.lamportClock === existing.lamportClock) {
            return incoming.wallClock > existing.wallClock;
        }

        return false;
    }
}

export const syncEngine = new SyncEngine();
