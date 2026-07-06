import { create } from 'zustand';
import type { WbsData, WbsMenuNode, WbsDevRow, WbsStatus, WbsProjectSchedule, WbsDetailSchedule } from '../types/wbs';
import { SCHEDULE_SEED, deriveStatus } from '../data/scheduleSeedData';
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { useProjectStore } from './projectStore';
import { syncWbsToLinkedPersonalSchedules } from '../services/wbsPersonalScheduleSync';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

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

export const useWbsStore = create<WbsState>((set, get) => ({
    menus: [],
    rows: [],
    currentProjectId: null,
    projectSchedule: null,
    detailSchedules: [],

    loadProject: (projectId, data) => {
        set({
            currentProjectId: projectId,
            menus: Array.isArray(data?.menus) ? (data!.menus as WbsMenuNode[]) : [],
            rows: Array.isArray(data?.rows) ? (data!.rows as WbsDevRow[]) : [],
            projectSchedule: (data as WbsData)?.projectSchedule ?? null,
            detailSchedules: Array.isArray((data as WbsData)?.detailSchedules) ? ((data as WbsData).detailSchedules as WbsDetailSchedule[]) : [],
        });
    },

    importData: (data) => {
        set({
            menus: Array.isArray(data.menus) ? (data.menus as WbsMenuNode[]) : get().menus,
            rows: Array.isArray(data.rows) ? (data.rows as WbsDevRow[]) : get().rows,
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
        set({ menus: [...menus, node] });
        get().scheduleSave();
        return id;
    },

    updateMenu: (id, patch) => {
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
        const hasDebugging = existing.some((r) => r.menuId === menuId && r.isDebugging);
        const debugRow: WbsDevRow | null = hasDebugging ? null : {
            id: uid('row'),
            menuId,
            category: 'Debuging',
            featureName: '',
            assignee: '',
            startDate: '',
            endDate: '',
            status: 'TODO' as WbsStatus,
            progress: 0,
            isDebugging: true,
        };
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
        const hasDebugging = existing.some((r) => r.menuId === menuId && r.isDebugging);
        const debugRow: WbsDevRow | null = hasDebugging ? null : {
            id: uid('row'),
            menuId,
            category: 'Debuging',
            featureName: '',
            assignee: '',
            startDate: '',
            endDate: '',
            status: 'TODO' as WbsStatus,
            progress: 0,
            isDebugging: true,
        };
        set({ rows: [...existing, ...newRows, ...(debugRow ? [debugRow] : [])] });
        get().scheduleSave();
    },

    updateRow: (id, patch) => {
        set({ rows: get().rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
        get().scheduleSave();
    },

    deleteRow: (id) => {
        set({ rows: get().rows.filter((r) => r.id !== id) });
        get().scheduleSave();
    },

    scheduleSave: () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            void get().saveNow();
        }, 800);
    },

    saveNow: async () => {
        const { currentProjectId, menus, rows, projectSchedule, detailSchedules } = get();
        if (!currentProjectId) return;
        const data = { menus, rows, ...(projectSchedule ? { projectSchedule } : {}), detailSchedules };
        // 전역 프로젝트 캐시 즉시 갱신(새로고침 전까지 데이터 유지)
        useProjectStore.getState().updateProjectData(currentProjectId, data);
        // 연결된 개인일정 미러링 — 서버 저장 성공 여부와 무관하게 로컬 반영
        await syncWbsToLinkedPersonalSchedules(currentProjectId);
        if (currentProjectId.startsWith('local_')) return;
        try {
            await fetchWithAuth(`${API_URL}/${currentProjectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data }),
            });
        } catch {
            // 네트워크 오류는 조용히 무시(다음 변경 시 재시도). 로컬 캐시에는 이미 반영됨.
        }
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
