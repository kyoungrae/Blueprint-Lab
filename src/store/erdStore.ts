import { create } from 'zustand';
import type { Entity, Relationship, ERDState, HistoryLog, Attribute } from '../types/erd';

interface ERDStore extends ERDState {
    past: ERDState[];
    future: ERDState[];
    canUndo: boolean;
    canRedo: boolean;

    history: HistoryLog[];

    addEntity: (entity: Entity, user?: any) => void;
    updateEntity: (id: string, entity: Partial<Entity>, user?: any) => void;
    updateEntities: (updates: { id: string; updates: Partial<Entity> }[]) => void;
    deleteEntity: (id: string, user?: any) => void;
    addRelationship: (relationship: Relationship, user?: any) => void;
    updateRelationship: (id: string, updates: Partial<Relationship>, user?: any) => void;
    deleteRelationship: (id: string, user?: any) => void;
    exportData: () => ERDState;
    importData: (data: ERDState) => void;
    mergeData: (data: ERDState, overwrite?: boolean) => void;

    updateAttribute: (entityId: string, attrId: string, updates: Partial<Attribute>, user?: any) => void;
    undo: () => void;
    redo: () => void;
    addLog: (log: Omit<HistoryLog, 'id' | 'timestamp'>) => void;
}

const MAX_HISTORY = 50;

export const useERDStore = create<ERDStore>((set, get) => {
    const pushHistory = (state: ERDStore) => {
        const { entities, relationships, past, history } = state;
        const newPast = [...past, { entities, relationships, history }].slice(-MAX_HISTORY);
        return {
            past: newPast,
            future: [],
            canUndo: true,
            canRedo: false
        };
    };

    const createLog = (user: any, type: any, targetType: any, targetName: string, details: string): HistoryLog => ({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: user?.id || 'anonymous',
        userName: user?.name || 'Anonymous',
        userPicture: user?.picture,
        timestamp: new Date().toISOString(),
        type,
        targetType,
        targetName,
        details
    });

    const diffAttributes = (oldAttrs: Attribute[], newAttrs: Attribute[]) => {
        const details: string[] = [];

        // Find modified attributes
        newAttrs.forEach(newAttr => {
            const oldAttr = oldAttrs.find(a => a.id === newAttr.id);
            if (oldAttr) {
                const changes: string[] = [];
                if (oldAttr.name !== newAttr.name) changes.push(`Name: ${oldAttr.name} -> ${newAttr.name}`);
                if (oldAttr.type !== newAttr.type) changes.push(`Type: ${oldAttr.type} -> ${newAttr.type}`);
                if ((oldAttr.length || '') !== (newAttr.length || '')) changes.push(`Length: ${oldAttr.length || 'none'} -> ${newAttr.length || 'none'}`);
                if (oldAttr.isNullable !== newAttr.isNullable) changes.push(`Nullable: ${oldAttr.isNullable ? 'Y' : 'N'} -> ${newAttr.isNullable ? 'Y' : 'N'}`);
                if (oldAttr.isPK !== newAttr.isPK) changes.push(`PK: ${oldAttr.isPK ? 'Y' : 'N'} -> ${newAttr.isPK ? 'Y' : 'N'}`);
                if (oldAttr.isFK !== newAttr.isFK) changes.push(`FK: ${oldAttr.isFK ? 'Y' : 'N'} -> ${newAttr.isFK ? 'Y' : 'N'}`);

                if (changes.length > 0) {
                    details.push(`Column '${newAttr.name}': ${changes.join(', ')}`);
                }
            }
        });

        // Check for added/removed
        if (newAttrs.length > oldAttrs.length) {
            const added = newAttrs.find(na => !oldAttrs.some(oa => oa.id === na.id));
            if (added) details.push(`Added column: ${added.name}`);
        } else if (newAttrs.length < oldAttrs.length) {
            const removed = oldAttrs.find(oa => !newAttrs.some(na => na.id === oa.id));
            if (removed) details.push(`Deleted column: ${removed.name}`);
        }

        return details;
    };

    return {
        entities: [],
        relationships: [],
        history: [],
        past: [],
        future: [],
        canUndo: false,
        canRedo: false,

        addEntity: (entity, user) =>
            set((state) => {
                if (state.entities.some(e => e.id === entity.id)) {
                    return state;
                }
                return {
                    ...pushHistory(state),
                    entities: [...state.entities, entity],
                    history: [createLog(user, 'CREATE', 'ENTITY', entity.name, `Created table: ${entity.name}`), ...state.history].slice(0, 100)
                };
            }),

        updateEntity: (id, updates, user) =>
            set((state) => {
                const entity = state.entities.find(e => e.id === id);
                if (!entity) return state;

                // Special case: ignore lock/unlock for history
                const updateKeys = Object.keys(updates);
                const isOnlyLockToggle = updateKeys.length === 1 && updateKeys[0] === 'isLocked';

                const newEntities = state.entities.map((e) =>
                    e.id === id ? { ...e, ...updates } : e
                );

                if (isOnlyLockToggle) {
                    return { entities: newEntities };
                }

                let detailParts: string[] = [];
                if (updates.name && updates.name !== entity.name) {
                    detailParts.push(`Table Name: ${entity.name} -> ${updates.name}`);
                }
                if (updates.attributes) {
                    detailParts.push(...diffAttributes(entity.attributes, updates.attributes));
                }
                if (updates.comment !== undefined && updates.comment !== entity.comment) {
                    detailParts.push(`Comment: ${entity.comment || 'none'} -> ${updates.comment || 'none'}`);
                }

                // If no real data changes were detected, don't add a log or push history
                if (detailParts.length === 0) {
                    return { entities: newEntities };
                }

                const detailsText = detailParts.join(', ');
                const now = new Date();
                const lastLog = state.history[0];
                const targetName = updates.name || entity.name;

                // Merging Logic: If same user, same entity, same type, and within 3 seconds, update the previous log
                const isMergeable = lastLog &&
                    lastLog.userId === (user?.id || 'anonymous') &&
                    lastLog.targetName === targetName &&
                    lastLog.type === 'UPDATE' &&
                    (now.getTime() - new Date(lastLog.timestamp).getTime() < 3000);

                if (isMergeable) {
                    const updatedLog = { ...lastLog, details: detailsText, timestamp: now.toISOString() };
                    return {
                        ...pushHistory(state),
                        entities: newEntities,
                        history: [updatedLog, ...state.history.slice(1)]
                    };
                }

                const log = createLog(user, 'UPDATE', 'ENTITY', targetName, detailsText);
                return {
                    ...pushHistory(state),
                    entities: newEntities,
                    history: [log, ...state.history].slice(0, 100)
                };
            }),

        updateEntities: (entityUpdates) =>
            set((state) => {
                const updatesMap = new Map(entityUpdates.map(u => [u.id, u.updates]));
                return {
                    ...pushHistory(state),
                    entities: state.entities.map((e) => {
                        const updates = updatesMap.get(e.id);
                        return updates ? { ...e, ...updates } : e;
                    }),
                };
            }),

        deleteEntity: (id, user) =>
            set((state) => {
                const entity = state.entities.find(e => e.id === id);
                const log = createLog(user, 'DELETE', 'ENTITY', entity?.name || 'Unknown', `Deleted table: ${entity?.name || id}`);
                return {
                    ...pushHistory(state),
                    entities: state.entities.filter((e) => e.id !== id),
                    relationships: state.relationships.filter(
                        (r) => r.source !== id && r.target !== id
                    ),
                    history: [log, ...state.history].slice(0, 100)
                };
            }),

        addRelationship: (relationship, user) =>
            set((state) => {
                if (state.relationships.some(r => r.id === relationship.id)) {
                    return state;
                }
                return {
                    ...pushHistory(state),
                    relationships: [...state.relationships, relationship],
                    history: [createLog(user, 'CREATE', 'RELATIONSHIP', relationship.id, `Created relationship: ${relationship.type}`), ...state.history].slice(0, 100)
                };
            }),

        updateRelationship: (id, updates, user) =>
            set((state) => ({
                ...pushHistory(state),
                relationships: state.relationships.map((r) =>
                    r.id === id ? { ...r, ...updates } : r
                ),
                history: [createLog(user, 'UPDATE', 'RELATIONSHIP', id, `Updated relationship properties`), ...state.history].slice(0, 100)
            })),

        deleteRelationship: (id, user) =>
            set((state) => ({
                ...pushHistory(state),
                relationships: state.relationships.filter((r) => r.id !== id),
                history: [createLog(user, 'DELETE', 'RELATIONSHIP', id, `Deleted relationship`), ...state.history].slice(0, 100)
            })),

        updateAttribute: (entityId, attrId, updates, user) =>
            set((state) => {
                const entity = state.entities.find(e => e.id === entityId);
                if (!entity) return state;

                const newAttributes = entity.attributes.map(attr =>
                    attr.id === attrId ? { ...attr, ...updates } : attr
                );

                const newEntities = state.entities.map(e =>
                    e.id === entityId ? { ...e, attributes: newAttributes } : e
                );

                // For history logging
                const attr = entity.attributes.find(a => a.id === attrId);
                const changes = Object.entries(updates)
                    .map(([key, value]) => `${key}: ${(attr as any)?.[key]} -> ${value}`)
                    .join(', ');

                const log = createLog(user, 'UPDATE', 'ENTITY', entity.name, `Updated column '${attr?.name}': ${changes}`);

                return {
                    ...pushHistory(state),
                    entities: newEntities,
                    history: [log, ...state.history].slice(0, 100)
                };
            }),

        undo: () =>
            set((state) => {
                if (state.past.length === 0) return state;
                const previous = state.past[state.past.length - 1];
                const newPast = state.past.slice(0, state.past.length - 1);
                return {
                    past: newPast,
                    future: [{ entities: state.entities, relationships: state.relationships }, ...state.future].slice(0, MAX_HISTORY),
                    entities: previous.entities,
                    relationships: previous.relationships,
                    canUndo: newPast.length > 0,
                    canRedo: true
                };
            }),

        redo: () =>
            set((state) => {
                if (state.future.length === 0) return state;
                const next = state.future[0];
                const newFuture = state.future.slice(1);
                return {
                    past: [...state.past, { entities: state.entities, relationships: state.relationships }].slice(-MAX_HISTORY),
                    future: newFuture,
                    entities: next.entities,
                    relationships: next.relationships,
                    canUndo: true,
                    canRedo: newFuture.length > 0
                };
            }),

        exportData: () => {
            const state = get();
            return {
                entities: state.entities,
                relationships: state.relationships,
            };
        },

        importData: (data) =>
            set((state) => {
                const cleanedRelationships = (data.relationships || []).filter(r =>
                    data.entities.some((e: any) => e.id === r.source) &&
                    data.entities.some((e: any) => e.id === r.target)
                );
                return {
                    ...pushHistory(state),
                    entities: data.entities,
                    relationships: cleanedRelationships,
                    history: data.history || state.history,
                };
            }),

        addLog: (logData) =>
            set((state) => ({
                history: [{
                    id: `log_${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    ...logData
                }, ...state.history].slice(0, 100)
            })),

        mergeData: (data, overwrite = false) =>
            set((state) => {
                const history = pushHistory(state);
                let newEntities = [...state.entities];
                let newRelationships = [...state.relationships];

                data.entities.forEach((newEntity) => {
                    const existingIndex = newEntities.findIndex(
                        (e) => e.name.toLowerCase() === newEntity.name.toLowerCase()
                    );

                    if (existingIndex !== -1) {
                        if (overwrite) {
                            const oldId = newEntities[existingIndex].id;
                            newEntities[existingIndex] = { ...newEntity };
                            newRelationships = newRelationships.filter(
                                (r) => r.source !== oldId && r.target !== oldId
                            );
                        } else {
                            return;
                        }
                    } else {
                        newEntities.push(newEntity);
                    }
                });

                data.relationships.forEach((newRel) => {
                    const exists = newRelationships.some(
                        (r) =>
                            (r.source === newRel.source &&
                                r.target === newRel.target &&
                                r.sourceHandle === newRel.sourceHandle &&
                                r.targetHandle === newRel.targetHandle) ||
                            (r.id === newRel.id)
                    );
                    if (!exists) {
                        newRelationships.push(newRel);
                    }
                });

                const finalEntities = newEntities;
                const finalRelationships = newRelationships.filter(r =>
                    finalEntities.some(e => e.id === r.source) &&
                    finalEntities.some(e => e.id === r.target)
                );

                return {
                    ...history,
                    entities: finalEntities,
                    relationships: finalRelationships,
                };
            }),
    };
});
