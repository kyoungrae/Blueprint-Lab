import { create } from 'zustand';
import type { Entity, Relationship, ERDState, HistoryLog, Attribute, Section } from '../types/erd';

function arrayToEntitiesById(entities: Entity[]): Record<string, Entity> {
    const out: Record<string, Entity> = {};
    entities.forEach((e) => { out[e.id] = e; });
    return out;
}
function arrayToRelationshipsById(relationships: Relationship[]): Record<string, Relationship> {
    const out: Record<string, Relationship> = {};
    relationships.forEach((r) => { out[r.id] = r; });
    return out;
}

interface HistorySnapshot {
    entitiesById: Record<string, Entity>;
    relationshipsById: Record<string, Relationship>;
    sections: Section[];
    history: HistoryLog[];
}

interface ERDStore {
    entitiesById: Record<string, Entity>;
    relationshipsById: Record<string, Relationship>;
    sections: Section[];
    history: HistoryLog[];
    past: HistorySnapshot[];
    future: HistorySnapshot[];
    canUndo: boolean;
    canRedo: boolean;

    getEntities: () => Entity[];
    getRelationships: () => Relationship[];

    addEntity: (entity: Entity, user?: any) => void;
    updateEntity: (id: string, entity: Partial<Entity>, user?: any) => void;
    updateEntities: (updates: { id: string; updates: Partial<Entity> }[]) => void;
    deleteEntity: (id: string, user?: any) => void;
    addRelationship: (relationship: Relationship, user?: any) => void;
    updateRelationship: (id: string, updates: Partial<Relationship>, user?: any) => void;
    deleteRelationship: (id: string, user?: any) => void;
    addSection: (section: Section, user?: any) => void;
    updateSection: (id: string, updates: Partial<Section>, user?: any) => void;
    deleteSection: (id: string, user?: any) => void;
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
    const pushHistory = (state: ERDStore): Partial<ERDStore> => {
        const snap: HistorySnapshot = {
            entitiesById: { ...state.entitiesById },
            relationshipsById: { ...state.relationshipsById },
            sections: [...state.sections],
            history: [...state.history],
        };
        const newPast = [...state.past, snap].slice(-MAX_HISTORY);
        return { past: newPast, future: [], canUndo: true, canRedo: false };
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
                if (changes.length > 0) details.push(`Column '${newAttr.name}': ${changes.join(', ')}`);
            }
        });
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
        entitiesById: {},
        relationshipsById: {},
        sections: [],
        history: [],
        past: [],
        future: [],
        canUndo: false,
        canRedo: false,

        getEntities: () => Object.values(get().entitiesById),
        getRelationships: () => Object.values(get().relationshipsById),

        addEntity: (entity, user) =>
            set((state) => {
                if (state.entitiesById[entity.id]) return state;
                const nextById = { ...state.entitiesById, [entity.id]: entity };
                return {
                    ...state,
                    ...pushHistory(state),
                    entitiesById: nextById,
                    history: [createLog(user, 'CREATE', 'ENTITY', entity.name, `Created table: ${entity.name}`), ...state.history].slice(0, 100),
                };
            }),

        updateEntity: (id, updates, user) =>
            set((state) => {
                const entity = state.entitiesById[id];
                if (!entity) return state;

                const updateKeys = Object.keys(updates);
                const isOnlyLockToggle = updateKeys.length === 1 && updateKeys[0] === 'isLocked';

                const updated = { ...entity, ...updates };
                if (isOnlyLockToggle) {
                    return { entitiesById: { ...state.entitiesById, [id]: updated } };
                }

                let detailParts: string[] = [];
                if (updates.name && updates.name !== entity.name) detailParts.push(`Table Name: ${entity.name} -> ${updates.name}`);
                if (updates.attributes) detailParts.push(...diffAttributes(entity.attributes, updates.attributes));
                if (updates.comment !== undefined && updates.comment !== entity.comment) detailParts.push(`Comment: ${entity.comment || 'none'} -> ${updates.comment || 'none'}`);

                if (detailParts.length === 0) {
                    return { entitiesById: { ...state.entitiesById, [id]: updated } };
                }

                const detailsText = detailParts.join(', ');
                const now = new Date();
                const lastLog = state.history[0];
                const targetName = updates.name || entity.name;
                const isMergeable = lastLog &&
                    lastLog.userId === (user?.id || 'anonymous') &&
                    lastLog.targetName === targetName &&
                    lastLog.type === 'UPDATE' &&
                    (now.getTime() - new Date(lastLog.timestamp).getTime() < 3000);

                if (isMergeable) {
                    const updatedLog = { ...lastLog, details: detailsText, timestamp: now.toISOString() };
                    return {
                        ...state,
                        ...pushHistory(state),
                        entitiesById: { ...state.entitiesById, [id]: updated },
                        history: [updatedLog, ...state.history.slice(1)],
                    };
                }

                const log = createLog(user, 'UPDATE', 'ENTITY', targetName, detailsText);
                return {
                    ...state,
                    ...pushHistory(state),
                    entitiesById: { ...state.entitiesById, [id]: updated },
                    history: [log, ...state.history].slice(0, 100),
                };
            }),

        updateEntities: (entityUpdates) =>
            set((state) => {
                const nextById = { ...state.entitiesById };
                entityUpdates.forEach(({ id, updates }) => {
                    const e = nextById[id];
                    if (e) nextById[id] = { ...e, ...updates };
                });
                return { ...state, ...pushHistory(state), entitiesById: nextById };
            }),

        deleteEntity: (id, user) =>
            set((state) => {
                const entity = state.entitiesById[id];
                const log = createLog(user, 'DELETE', 'ENTITY', entity?.name || 'Unknown', `Deleted table: ${entity?.name || id}`);
                const nextById = { ...state.entitiesById };
                delete nextById[id];
                const nextRels = { ...state.relationshipsById };
                Object.keys(nextRels).forEach(rid => {
                    const r = nextRels[rid];
                    if (r.source === id || r.target === id) delete nextRels[rid];
                });
                return {
                    ...state,
                    ...pushHistory(state),
                    entitiesById: nextById,
                    relationshipsById: nextRels,
                    history: [log, ...state.history].slice(0, 100),
                };
            }),

        addRelationship: (relationship, user) =>
            set((state) => {
                if (state.relationshipsById[relationship.id]) return state;
                const nextRels = { ...state.relationshipsById, [relationship.id]: relationship };
                return {
                    ...state,
                    ...pushHistory(state),
                    relationshipsById: nextRels,
                    history: [createLog(user, 'CREATE', 'RELATIONSHIP', relationship.id, `Created relationship: ${relationship.type}`), ...state.history].slice(0, 100),
                };
            }),

        updateRelationship: (id, updates, user) =>
            set((state) => {
                const r = state.relationshipsById[id];
                if (!r) return state;
                const nextRels = { ...state.relationshipsById, [id]: { ...r, ...updates } };
                return {
                    ...state,
                    ...pushHistory(state),
                    relationshipsById: nextRels,
                    history: [createLog(user, 'UPDATE', 'RELATIONSHIP', id, `Updated relationship properties`), ...state.history].slice(0, 100),
                };
            }),

        deleteRelationship: (id, user) =>
            set((state) => {
                const nextRels = { ...state.relationshipsById };
                delete nextRels[id];
                return {
                    ...state,
                    ...pushHistory(state),
                    relationshipsById: nextRels,
                    history: [createLog(user, 'DELETE', 'RELATIONSHIP', id, `Deleted relationship`), ...state.history].slice(0, 100),
                };
            }),

        addSection: (section, _user) =>
            set((state) => {
                if (state.sections.some(s => s.id === section.id)) return state;
                return { ...state, ...pushHistory(state), sections: [...state.sections, section] };
            }),

        updateSection: (id, updates, _user) =>
            set((state) => ({
                ...state,
                ...pushHistory(state),
                sections: state.sections.map((s) => (s.id === id ? { ...s, ...updates } : s)),
            })),

        deleteSection: (id, _user) =>
            set((state) => {
                const sections = state.sections.filter((s) => s.id !== id);
                const nextById = { ...state.entitiesById };
                Object.keys(nextById).forEach(eid => {
                    if (nextById[eid].sectionId === id) nextById[eid] = { ...nextById[eid], sectionId: undefined as string | undefined };
                });
                return { ...state, ...pushHistory(state), sections, entitiesById: nextById };
            }),

        updateAttribute: (entityId, attrId, updates, user) =>
            set((state) => {
                const entity = state.entitiesById[entityId];
                if (!entity) return state;

                const newAttributes = entity.attributes.map(attr =>
                    attr.id === attrId ? { ...attr, ...updates } : attr
                );
                const attr = entity.attributes.find(a => a.id === attrId);
                const changes = Object.entries(updates)
                    .map(([key, value]) => `${key}: ${(attr as any)?.[key]} -> ${value}`)
                    .join(', ');
                const log = createLog(user, 'UPDATE', 'ENTITY', entity.name, `Updated column '${attr?.name}': ${changes}`);

                return {
                    ...state,
                    ...pushHistory(state),
                    entitiesById: { ...state.entitiesById, [entityId]: { ...entity, attributes: newAttributes } },
                    history: [log, ...state.history].slice(0, 100),
                };
            }),

        undo: () =>
            set((state) => {
                if (state.past.length === 0) return state;
                const previous = state.past[state.past.length - 1];
                const newPast = state.past.slice(0, state.past.length - 1);
                const futureSnap: HistorySnapshot = {
                    entitiesById: { ...state.entitiesById },
                    relationshipsById: { ...state.relationshipsById },
                    sections: [...state.sections],
                    history: [...state.history],
                };
                return {
                    past: newPast,
                    future: [futureSnap, ...state.future].slice(0, MAX_HISTORY),
                    entitiesById: previous.entitiesById,
                    relationshipsById: previous.relationshipsById,
                    sections: previous.sections,
                    history: previous.history,
                    canUndo: newPast.length > 0,
                    canRedo: true,
                };
            }),

        redo: () =>
            set((state) => {
                if (state.future.length === 0) return state;
                const next = state.future[0];
                const newFuture = state.future.slice(1);
                const pastSnap: HistorySnapshot = {
                    entitiesById: { ...state.entitiesById },
                    relationshipsById: { ...state.relationshipsById },
                    sections: [...state.sections],
                    history: [...state.history],
                };
                return {
                    past: [...state.past, pastSnap].slice(-MAX_HISTORY),
                    future: newFuture,
                    entitiesById: next.entitiesById,
                    relationshipsById: next.relationshipsById,
                    sections: next.sections,
                    history: next.history,
                    canUndo: true,
                    canRedo: newFuture.length > 0,
                };
            }),

        exportData: () => {
            const state = get();
            return {
                entities: Object.values(state.entitiesById),
                relationships: Object.values(state.relationshipsById),
                sections: state.sections,
            };
        },

        importData: (data) =>
            set((state) => {
                const entities = data.entities ?? [];
                const relationships = (data.relationships || []).filter((r: Relationship) =>
                    entities.some((e: Entity) => e.id === r.source) &&
                    entities.some((e: Entity) => e.id === r.target)
                );
                // sections 미전달 시 기존 유지 → 정렬/state_sync 등에서 섹션이 사라지는 버그 방지
                const nextSections = Array.isArray(data.sections) ? data.sections : state.sections;
                return {
                    ...state,
                    ...pushHistory(state),
                    entitiesById: arrayToEntitiesById(entities),
                    relationshipsById: arrayToRelationshipsById(relationships),
                    sections: nextSections,
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
                let newById = { ...state.entitiesById };
                let newRelsById = { ...state.relationshipsById };
                const entitiesList = Object.values(newById);
                const nameToId = Object.fromEntries(entitiesList.map(e => [e.name.toLowerCase(), e.id]));

                (data.entities ?? []).forEach((newEntity: Entity) => {
                    const existingId = nameToId[newEntity.name.toLowerCase()];
                    if (existingId !== undefined) {
                        if (overwrite) {
                            Object.keys(newRelsById).forEach(rid => {
                                const r = newRelsById[rid];
                                if (r.source === existingId || r.target === existingId) delete newRelsById[rid];
                            });
                            delete newById[existingId];
                            newById[newEntity.id] = newEntity;
                            nameToId[newEntity.name.toLowerCase()] = newEntity.id;
                        }
                    } else {
                        newById[newEntity.id] = newEntity;
                        nameToId[newEntity.name.toLowerCase()] = newEntity.id;
                    }
                });

                (data.relationships ?? []).forEach((newRel: Relationship) => {
                    const exists = Object.values(newRelsById).some(
                        (r) =>
                            (r.source === newRel.source && r.target === newRel.target &&
                                r.sourceHandle === newRel.sourceHandle && r.targetHandle === newRel.targetHandle) ||
                            r.id === newRel.id
                    );
                    if (!exists && newById[newRel.source] && newById[newRel.target]) {
                        newRelsById[newRel.id] = newRel;
                    }
                });

                const finalRels = Object.values(newRelsById).filter(r =>
                    newById[r.source] && newById[r.target]
                );
                newRelsById = arrayToRelationshipsById(finalRels);

                const mergedSections = [...state.sections];
                (data.sections ?? []).forEach((newSec: Section) => {
                    if (!mergedSections.some(s => s.id === newSec.id)) mergedSections.push(newSec);
                });

                return { ...state, ...history, entitiesById: newById, relationshipsById: newRelsById, sections: mergedSections };
            }),
    };
});
