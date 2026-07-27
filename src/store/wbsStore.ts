import { create } from 'zustand';
import type { WbsData, WbsMenuNode, WbsDevRow, WbsStatus, WbsProjectSchedule, WbsDetailSchedule } from '../types/wbs';
import { normalizeWbsDevRows, isWbsDebugingCategoryRow, WBS_DEBUGING_CATEGORY } from '../types/wbs';
import { SCHEDULE_SEED, deriveStatus } from '../data/scheduleSeedData';
import { useProjectStore } from './projectStore';
import { enrichRowsWithAssigneeUserIds } from '../utils/wbsAssigneeMatch';
import { scheduleSyncWbsToLinkedPersonalSchedules } from '../services/wbsPersonalScheduleSync';
import { useWbsYjsStore } from './wbsYjsStore';

const uid = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** 기존 메뉴 코드 최대 번호 +1로 MENU-XXXX 생성 */
function nextMenuCode(menus: WbsMenuNode[]): string {
    let max = 0;
    for (const m of menus) {
        const match = /^MENU-(\d+)$/.exec(m.menuCode || '');
        if (match) max = Math.max(max, parseInt(match[1], 10));
    }
    return `MENU-${String(max + 1).padStart(4, '0')}`;
}

interface WbsState {
    menus: WbsMenuNode[];
    rows: WbsDevRow[];
    currentProjectId: string | null;
    projectSchedule: WbsProjectSchedule | null;
    detailSchedules: WbsDetailSchedule[];

    /** 프로젝트 진입 시 데이터 로드 */
    loadProject: (projectId: string, data: Partial<WbsData> | undefined | null) => void;
    importData: (data: Partial<WbsData>) => void;
    exportData: () => WbsData;
    setProjectSchedule: (schedule: WbsProjectSchedule | null) => void;
    addDetailSchedule: (schedule: Omit<WbsDetailSchedule, 'id'>) => void;
    updateDetailSchedule: (id: string, patch: Partial<Omit<WbsDetailSchedule, 'id'>>) => void;
    deleteDetailSchedule: (id: string) => void;
    /** title 기준으로 seed 데이터(작업자, 산출물명, 실적일, progress) 일괄 적용 */
    applySeedData: () => void;

    addMenu: (parentId: string | null) => string;
    updateMenu: (id: string, patch: Partial<Omit<WbsMenuNode, 'id'>>) => void;
    deleteMenu: (id: string) => void;
    /** 드래그앤드롭: 부모/순서 변경 */
    moveMenu: (id: string, newParentId: string | null, newOrder: number) => void;

    addRow: (menuId: string) => string;
    /** 여러 산출물 구분(category)을 한 번에 행으로 추가 */
    addRows: (menuId: string, categories: string[]) => void;
    updateRow: (id: string, patch: Partial<Omit<WbsDevRow, 'id' | 'menuId'>>) => void;
    deleteRow: (id: string) => void;

    /** 디바운스 서버 저장 */
    scheduleSave: () => void;
    saveNow: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function activeWbsYjs(projectId: string | null) {
    const state = useWbsYjsStore.getState();
    return projectId
        && !projectId.startsWith('local_')
        && state.currentProjectId === projectId
        && state.isReady
        ? state
        : null;
}

function syncLinkedPersonalSchedulesAfterYjsChange(projectId: string | null, changed: boolean): void {
    if (changed && projectId) scheduleSyncWbsToLinkedPersonalSchedules(projectId);
}

export const useWbsStore = create<WbsState>((set, get) => ({
    menus: [],
    rows: [],
    currentProjectId: null,
    projectSchedule: null,
    detailSchedules: [],

    loadProject: (projectId, data) => {
        const rawRows = Array.isArray(data?.rows) ? (data!.rows as WbsDevRow[]) : [];
        const wbsProject = useProjectStore.getState().projects.find((p) => p.id === projectId);
        const rows = normalizeWbsDevRows(enrichRowsWithAssigneeUserIds(rawRows, wbsProject?.members ?? []));
        set({
            currentProjectId: projectId,
            menus: Array.isArray(data?.menus) ? (data!.menus as WbsMenuNode[]) : [],
            rows,
            projectSchedule: (data as WbsData)?.projectSchedule ?? null,
            detailSchedules: Array.isArray((data as WbsData)?.detailSchedules) ? ((data as WbsData).detailSchedules as WbsDetailSchedule[]) : [],
        });
    },

    importData: (data) => {
        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            const changed = yjs.replaceData(data);
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return;
        }
        // 서버 WBS는 Yjs 초기화 완료 전에는 쓰기를 허용하지 않는다.
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;
        const rawRows = Array.isArray(data.rows) ? (data.rows as WbsDevRow[]) : get().rows;
        set({
            menus: Array.isArray(data.menus) ? (data.menus as WbsMenuNode[]) : get().menus,
            rows: normalizeWbsDevRows(rawRows),
            projectSchedule: data.projectSchedule !== undefined ? (data.projectSchedule ?? null) : get().projectSchedule,
            detailSchedules: Array.isArray(data.detailSchedules) ? (data.detailSchedules as WbsDetailSchedule[]) : get().detailSchedules,
        });
        get().scheduleSave();
    },

    exportData: () => ({
        menus: get().menus,
        rows: get().rows,
        projectSchedule: get().projectSchedule ?? undefined,
        detailSchedules: get().detailSchedules,
    }),

    setProjectSchedule: (schedule) => {
        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            const changed = yjs.setProjectSchedule(schedule);
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;
        set({ projectSchedule: schedule });
        get().scheduleSave();
    },

    addDetailSchedule: (schedule: Omit<WbsDetailSchedule, 'id'>) => {
        const existing = get().detailSchedules;
        const siblings = existing.filter((s) => (s.parentId ?? null) === (schedule.parentId ?? null));
        const maxOrder = siblings.length ? Math.max(...siblings.map((s) => s.order ?? 0)) + 1 : 0;
        const newItem: WbsDetailSchedule = {
            id: uid('schedule'),
            parentId: null,
            order: maxOrder,
            progress: 0,
            ...schedule,
        };
        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            const changed = yjs.addDetailSchedule(newItem);
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;
        set({ detailSchedules: [...existing, newItem] });
        get().scheduleSave();
    },

    updateDetailSchedule: (id, patch) => {
        // 1. 해당 항목 업데이트 (progress 변경 시 status 자동 반영)
        const patchWithStatus = 'progress' in patch
            ? { ...patch, status: deriveStatus(patch.progress as number) }
            : patch;
        let updated = get().detailSchedules.map((s) => (s.id === id ? { ...s, ...patchWithStatus } : s));

        // 2. progress가 변경된 경우, 조상 항목들의 progress를 자동 재계산 (leaf → root 방향)
        if ('progress' in patch) {
            const recalcParent = (items: typeof updated, childId: string): typeof updated => {
                const child = items.find((s) => s.id === childId);
                if (!child?.parentId) return items;
                const parentId = child.parentId;
                const children = items.filter((s) => s.parentId === parentId);
                if (children.length === 0) return items;
                const avg = Math.round(children.reduce((sum, c) => sum + (c.progress ?? 0), 0) / children.length);
                const next = items.map((s) => (s.id === parentId ? { ...s, progress: avg, status: deriveStatus(avg) } : s));
                return recalcParent(next, parentId);
            };
            updated = recalcParent(updated, id);
        }

        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            let changed = false;
            const beforeById = new Map(get().detailSchedules.map((schedule) => [schedule.id, schedule]));
            updated.forEach((schedule) => {
                const before = beforeById.get(schedule.id);
                if (JSON.stringify(before) === JSON.stringify(schedule)) return;
                const { id: scheduleId, ...nextPatch } = schedule;
                changed = yjs.updateDetailSchedule(scheduleId, nextPatch) || changed;
            });
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;

        set({ detailSchedules: updated });
        get().scheduleSave();
    },

    applySeedData: () => {
        const items = get().detailSchedules;
        const updated = items.map((s) => {
            const seed = SCHEDULE_SEED[s.title];
            if (!seed) return s;
            const progress = seed.progress ?? s.progress ?? 0;
            return {
                ...s,
                worker: seed.worker ?? s.worker,
                deliverable: seed.deliverable ?? s.deliverable,
                actualStartDate: seed.actualStartDate ?? s.actualStartDate,
                actualEndDate: seed.actualEndDate ?? s.actualEndDate,
                progress,
                status: deriveStatus(progress),
            };
        });

        // 부모 progress 재계산 (leaf → root)
        let result = updated;
        const recalcAll = () => {
            let changed = true;
            while (changed) {
                changed = false;
                const parentIds = new Set(result.filter((s) => s.parentId).map((s) => s.parentId as string));
                for (const parentId of parentIds) {
                    const children = result.filter((s) => s.parentId === parentId);
                    if (children.length === 0) continue;
                    const avg = Math.round(children.reduce((sum, c) => sum + (c.progress ?? 0), 0) / children.length);
                    const parent = result.find((s) => s.id === parentId);
                    if (parent && parent.progress !== avg) {
                        result = result.map((s) => s.id === parentId ? { ...s, progress: avg, status: deriveStatus(avg) } : s);
                        changed = true;
                    }
                }
            }
        };
        recalcAll();

        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            let changed = false;
            const beforeById = new Map(items.map((schedule) => [schedule.id, schedule]));
            result.forEach((schedule) => {
                const before = beforeById.get(schedule.id);
                if (JSON.stringify(before) === JSON.stringify(schedule)) return;
                const { id, ...nextPatch } = schedule;
                changed = yjs.updateDetailSchedule(id, nextPatch) || changed;
            });
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;

        set({ detailSchedules: result });
        get().scheduleSave();
    },

    deleteDetailSchedule: (id) => {
        // 자식까지 함께 삭제
        const toDelete = new Set<string>([id]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const s of get().detailSchedules) {
                if (s.parentId && toDelete.has(s.parentId) && !toDelete.has(s.id)) {
                    toDelete.add(s.id);
                    changed = true;
                }
            }
        }
        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            let didChange = false;
            toDelete.forEach((scheduleId) => { didChange = yjs.deleteDetailSchedule(scheduleId) || didChange; });
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, didChange);
            return;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;
        set({ detailSchedules: get().detailSchedules.filter((s) => !toDelete.has(s.id)) });
        get().scheduleSave();
    },

    addMenu: (parentId) => {
        const { menus } = get();
        const siblings = menus.filter((m) => m.parentId === parentId);
        const order = siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
        const id = uid('menu');
        const node: WbsMenuNode = {
            id,
            parentId,
            name: '새 메뉴',
            menuCode: nextMenuCode(menus),
            order,
        };
        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            const changed = yjs.addMenus([node]);
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return id;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return id;
        set({ menus: [...menus, node] });
        get().scheduleSave();
        return id;
    },

    updateMenu: (id, patch) => {
        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            const changed = yjs.updateMenus([{ id, patch }]);
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;
        set({ menus: get().menus.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
        get().scheduleSave();
    },

    deleteMenu: (id) => {
        // 자식까지 재귀 수집
        const { menus, rows } = get();
        const toDelete = new Set<string>([id]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const m of menus) {
                if (m.parentId && toDelete.has(m.parentId) && !toDelete.has(m.id)) {
                    toDelete.add(m.id);
                    changed = true;
                }
            }
        }
        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            const rowIds = rows.filter((row) => toDelete.has(row.menuId)).map((row) => row.id);
            const didChange = yjs.deleteMenusAndRows(Array.from(toDelete), rowIds);
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, didChange);
            return;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;
        set({
            menus: menus.filter((m) => !toDelete.has(m.id)),
            rows: rows.filter((r) => !toDelete.has(r.menuId)),
        });
        get().scheduleSave();
    },

    moveMenu: (id, newParentId, newOrder) => {
        // 자기 자신/후손으로의 이동은 막는다(순환 방지)
        const { menus } = get();
        if (id === newParentId) return;
        const descendants = new Set<string>([id]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const m of menus) {
                if (m.parentId && descendants.has(m.parentId) && !descendants.has(m.id)) {
                    descendants.add(m.id);
                    changed = true;
                }
            }
        }
        if (newParentId && descendants.has(newParentId)) return;

        const moving = menus.find((m) => m.id === id);
        if (!moving) return;

        // 대상 부모의 형제 목록을 순서대로 정렬 후 삽입
        const siblings = menus
            .filter((m) => m.parentId === newParentId && m.id !== id)
            .sort((a, b) => a.order - b.order);
        siblings.splice(Math.max(0, Math.min(newOrder, siblings.length)), 0, { ...moving, parentId: newParentId });

        const reordered = new Map<string, number>();
        siblings.forEach((s, i) => reordered.set(s.id, i));

        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            const patches: Array<{ id: string; patch: Partial<Omit<WbsMenuNode, 'id'>> }> = [];
            menus.forEach((menu) => {
                if (menu.id === id) {
                    patches.push({ id: menu.id, patch: { parentId: newParentId, order: reordered.get(id) ?? 0 } });
                } else if (reordered.has(menu.id)) {
                    patches.push({ id: menu.id, patch: { order: reordered.get(menu.id)! } });
                }
            });
            const changed = yjs.updateMenus(patches);
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;

        set({
            menus: menus.map((m) => {
                if (m.id === id) return { ...m, parentId: newParentId, order: reordered.get(id) ?? 0 };
                if (reordered.has(m.id)) return { ...m, order: reordered.get(m.id)! };
                return m;
            }),
        });
        get().scheduleSave();
    },

    addRow: (menuId) => {
        const id = uid('row');
        const row: WbsDevRow = {
            id,
            menuId,
            category: '',
            featureName: '',
            assignee: '',
            startDate: '',
            endDate: '',
            status: 'TODO' as WbsStatus,
            progress: 0,
        };
        // 이미 Debugging 행이 없는 경우에만 함께 추가
        const existing = get().rows;
        const hasDebugging = existing.some((r) => r.menuId === menuId && isWbsDebugingCategoryRow(r));
        const debugRow: WbsDevRow | null = hasDebugging ? null : {
            id: uid('row'),
            menuId,
            category: WBS_DEBUGING_CATEGORY,
            featureName: '',
            assignee: '',
            startDate: '',
            endDate: '',
            status: 'TODO' as WbsStatus,
            progress: 0,
            isDebugging: true,
        };
        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            const changed = yjs.addRows([row, ...(debugRow ? [debugRow] : [])]);
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return id;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return id;
        set({ rows: [...existing, row, ...(debugRow ? [debugRow] : [])] });
        get().scheduleSave();
        return id;
    },

    addRows: (menuId, categories) => {
        const existing = get().rows;
        const newRows: WbsDevRow[] = categories.map((category) => ({
            id: uid('row'),
            menuId,
            category,
            featureName: '',
            assignee: '',
            startDate: '',
            endDate: '',
            status: 'TODO' as WbsStatus,
            progress: 0,
        }));
        const hasDebugging = existing.some((r) => r.menuId === menuId && isWbsDebugingCategoryRow(r));
        const debugRow: WbsDevRow | null = hasDebugging ? null : {
            id: uid('row'),
            menuId,
            category: WBS_DEBUGING_CATEGORY,
            featureName: '',
            assignee: '',
            startDate: '',
            endDate: '',
            status: 'TODO' as WbsStatus,
            progress: 0,
            isDebugging: true,
        };
        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            const changed = yjs.addRows([...newRows, ...(debugRow ? [debugRow] : [])]);
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;
        set({ rows: [...existing, ...newRows, ...(debugRow ? [debugRow] : [])] });
        get().scheduleSave();
    },

    updateRow: (id, patch) => {
        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            const changed = yjs.updateRow(id, patch);
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;
        set({
            rows: get().rows.map((r) => {
                if (r.id !== id) return r;
                return normalizeWbsDevRows([{ ...r, ...patch }])[0];
            }),
        });
        get().scheduleSave();
    },

    deleteRow: (id) => {
        const currentProjectId = get().currentProjectId;
        const yjs = activeWbsYjs(currentProjectId);
        if (yjs) {
            const changed = yjs.deleteRow(id);
            syncLinkedPersonalSchedulesAfterYjsChange(currentProjectId, changed);
            return;
        }
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;
        set({ rows: get().rows.filter((r) => r.id !== id) });
        get().scheduleSave();
    },

    scheduleSave: () => {
        const currentProjectId = get().currentProjectId;
        if (currentProjectId && !currentProjectId.startsWith('local_')) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            void get().saveNow();
        }, 800);
    },

    saveNow: async () => {
        const { currentProjectId, menus, rows, projectSchedule, detailSchedules } = get();
        if (!currentProjectId) return;
        if (!currentProjectId.startsWith('local_')) return;
        const wbsProject = useProjectStore.getState().projects.find((p) => p.id === currentProjectId);
        const enrichedRows = enrichRowsWithAssigneeUserIds(rows, wbsProject?.members ?? []);
        if (enrichedRows !== rows) set({ rows: enrichedRows });
        const data = { menus, rows: enrichedRows, ...(projectSchedule ? { projectSchedule } : {}), detailSchedules };
        // 전역 프로젝트 캐시 즉시 갱신(새로고침 전까지 데이터 유지)
        useProjectStore.getState().updateProjectData(currentProjectId, data);
        // 연결된 개인일정 미러링 — 디바운스(과도한 API 호출 방지)
        scheduleSyncWbsToLinkedPersonalSchedules(currentProjectId);
    },
}));

/**
 * 메뉴 진행율 (재귀)
 * - 자식 메뉴가 있으면 → 자식들의 진행율 평균 (재귀적으로 적용)
 * - 자식 메뉴가 없으면(리프) → 해당 메뉴 행들의 평균 progress
 */
export function calcMenuProgress(menus: WbsMenuNode[], rows: WbsDevRow[], menuId: string): number {
    const children = menus.filter((m) => m.parentId === menuId);
    if (children.length > 0) {
        const childProgresses = children.map((c) => calcMenuProgress(menus, rows, c.id));
        return Math.round(childProgresses.reduce((a, v) => a + v, 0) / childProgresses.length);
    }
    const mine = rows.filter((r) => r.menuId === menuId);
    if (mine.length === 0) return 0;
    return Math.round(mine.reduce((a, r) => a + (r.progress || 0), 0) / mine.length);
}

/** 전체 진행율 = 모든 행 평균 progress */
export function calcOverallProgress(rows: WbsDevRow[]): number {
    if (rows.length === 0) return 0;
    return Math.round(rows.reduce((a, r) => a + (r.progress || 0), 0) / rows.length);
}
