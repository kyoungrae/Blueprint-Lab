import * as Y from 'yjs';
import { create } from 'zustand';
import type { WbsData, WbsDetailSchedule, WbsDevRow, WbsMenuNode, WbsMenuScheduleLink, WbsProjectSchedule } from '../types/wbs';
import { useProjectStore } from './projectStore';
import { normalizeMenuScheduleLinks } from '../utils/wbsScheduleMatch';
import { scheduleSyncScheduleToDevDetail } from '../services/wbsScheduleDevSync';

type WbsRecord = WbsMenuNode | WbsDevRow | WbsDetailSchedule;

interface WbsYjsState {
    ydoc: Y.Doc | null;
    currentProjectId: string | null;
    isReady: boolean;
    revision: number;
    menus: WbsMenuNode[];
    rows: WbsDevRow[];
    projectSchedule: WbsProjectSchedule | null;
    detailSchedules: WbsDetailSchedule[];
    menuScheduleLinks: WbsMenuScheduleLink[];
    _cleanup: (() => void) | null;

    bind: (projectId: string, ydoc: Y.Doc) => void;
    unbind: () => void;
    addMenus: (menus: WbsMenuNode[]) => boolean;
    updateMenus: (patches: Array<{ id: string; patch: Partial<Omit<WbsMenuNode, 'id'>> }>) => boolean;
    deleteMenusAndRows: (menuIds: string[], rowIds: string[]) => boolean;
    addRows: (rows: WbsDevRow[]) => boolean;
    updateRow: (id: string, patch: Partial<Omit<WbsDevRow, 'id' | 'menuId'>>) => boolean;
    deleteRow: (id: string) => boolean;
    setProjectSchedule: (schedule: WbsProjectSchedule | null) => boolean;
    addDetailSchedule: (schedule: WbsDetailSchedule) => boolean;
    updateDetailSchedule: (id: string, patch: Partial<Omit<WbsDetailSchedule, 'id'>>) => boolean;
    deleteDetailSchedule: (id: string) => boolean;
    setMenuScheduleLinks: (links: WbsMenuScheduleLink[]) => boolean;
    replaceData: (data: Partial<WbsData>) => boolean;
}

const cloneValue = (value: unknown): unknown => {
    if (value == null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
};

const createRecordMap = (record: WbsRecord): Y.Map<unknown> => {
    const yMap = new Y.Map<unknown>();
    Object.entries(record).forEach(([key, value]) => {
        if (value !== undefined) yMap.set(key, cloneValue(value));
    });
    return yMap;
};

const setFields = (yMap: Y.Map<unknown>, patch: object) => {
    Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined) yMap.delete(key);
        else yMap.set(key, cloneValue(value));
    });
};

const records = <T extends WbsRecord>(root: Y.Map<Y.Map<unknown>>): T[] =>
    Array.from(root.values()).map((yMap) => yMap.toJSON() as T);

const roots = (ydoc: Y.Doc) => ({
    meta: ydoc.getMap<unknown>('wbs_meta'),
    menus: ydoc.getMap<Y.Map<unknown>>('wbs_menus'),
    rows: ydoc.getMap<Y.Map<unknown>>('wbs_rows'),
    projectSchedule: ydoc.getMap<unknown>('wbs_project_schedule'),
    detailSchedules: ydoc.getMap<Y.Map<unknown>>('wbs_detail_schedules'),
});

export const useWbsYjsStore = create<WbsYjsState>((set, get) => {
    const syncFromDoc = (projectId: string, ydoc: Y.Doc) => {
        const root = roots(ydoc);
        if (root.meta.get('initialized') !== true) {
            set({ isReady: false });
            return;
        }

        const projectSchedule = root.meta.get('hasProjectSchedule') === true
            ? root.projectSchedule.toJSON() as WbsProjectSchedule
            : null;
        const data: WbsData = {
            menus: records<WbsMenuNode>(root.menus),
            rows: records<WbsDevRow>(root.rows),
            ...(projectSchedule ? { projectSchedule } : {}),
            detailSchedules: records<WbsDetailSchedule>(root.detailSchedules),
            menuScheduleLinks: normalizeMenuScheduleLinks(root.meta.get('menuScheduleLinks')),
        };

        // Yjs가 WBS의 단일 원본이다. projectStore는 다른 화면·개인일정 연동을 위한 캐시만 갱신한다.
        useProjectStore.getState().updateProjectData(projectId, data);
        set((state) => ({
            currentProjectId: projectId,
            isReady: true,
            menus: data.menus,
            rows: data.rows,
            projectSchedule,
            detailSchedules: data.detailSchedules ?? [],
            menuScheduleLinks: data.menuScheduleLinks ?? [],
            revision: state.revision + 1,
        }));
    };

    const withWritableDoc = (write: (doc: Y.Doc) => void): boolean => {
        const { ydoc, isReady } = get();
        if (!ydoc || !isReady) return false;
        ydoc.transact(() => write(ydoc));
        return true;
    };

    return {
        ydoc: null,
        currentProjectId: null,
        isReady: false,
        revision: 0,
        menus: [],
        rows: [],
        projectSchedule: null,
        detailSchedules: [],
        menuScheduleLinks: [],
        _cleanup: null,

        bind: (projectId, ydoc) => {
            const current = get();
            if (current.ydoc === ydoc && current.currentProjectId === projectId) return;
            current._cleanup?.();

            const root = roots(ydoc);
            const sync = () => syncFromDoc(projectId, ydoc);
            const syncDetailSchedules = (events: Y.YEvent<any>[] = []) => {
                syncFromDoc(projectId, ydoc);

                // 브라우저 인라인 수정뿐 아니라 서버 엑셀 import처럼 Yjs를 직접 갱신하는
                // 경로도 일정→개발상세 반영을 놓치지 않는다.
                const changedScheduleIds = new Set<string>();
                events.forEach((event) => {
                    const scheduleId = event.path[0];
                    if (typeof scheduleId === 'string') {
                        changedScheduleIds.add(scheduleId);
                        return;
                    }
                    if (event.path.length === 0 && 'keysChanged' in event) {
                        const keysChanged = event.keysChanged as Set<string | number>;
                        keysChanged.forEach((id) => changedScheduleIds.add(String(id)));
                    }
                });
                changedScheduleIds.forEach((scheduleId) => {
                    scheduleSyncScheduleToDevDetail(projectId, scheduleId);
                });
            };
            root.meta.observe(sync);
            root.menus.observeDeep(sync);
            root.rows.observeDeep(sync);
            root.projectSchedule.observe(sync);
            root.detailSchedules.observeDeep(syncDetailSchedules);

            set({
                ydoc,
                currentProjectId: projectId,
                isReady: false,
                menus: [],
                rows: [],
                projectSchedule: null,
                detailSchedules: [],
                menuScheduleLinks: [],
                _cleanup: () => {
                    root.meta.unobserve(sync);
                    root.menus.unobserveDeep(sync);
                    root.rows.unobserveDeep(sync);
                    root.projectSchedule.unobserve(sync);
                    root.detailSchedules.unobserveDeep(syncDetailSchedules);
                },
            });
            sync();
        },

        unbind: () => {
            get()._cleanup?.();
            set({
                ydoc: null,
                currentProjectId: null,
                isReady: false,
                menus: [],
                rows: [],
                projectSchedule: null,
                detailSchedules: [],
                menuScheduleLinks: [],
                _cleanup: null,
            });
        },

        addMenus: (menus) => withWritableDoc((ydoc) => {
            const root = roots(ydoc).menus;
            menus.forEach((menu) => {
                if (!root.has(menu.id)) root.set(menu.id, createRecordMap(menu));
            });
        }),

        updateMenus: (patches) => withWritableDoc((ydoc) => {
            const root = roots(ydoc).menus;
            patches.forEach(({ id, patch }) => {
                const record = root.get(id);
                if (record) setFields(record, patch);
            });
        }),

        deleteMenusAndRows: (menuIds, rowIds) => withWritableDoc((ydoc) => {
            const root = roots(ydoc);
            menuIds.forEach((id) => root.menus.delete(id));
            rowIds.forEach((id) => root.rows.delete(id));
        }),

        addRows: (rows) => withWritableDoc((ydoc) => {
            const root = roots(ydoc).rows;
            rows.forEach((row) => {
                if (!root.has(row.id)) root.set(row.id, createRecordMap(row));
            });
        }),

        updateRow: (id, patch) => withWritableDoc((ydoc) => {
            const row = roots(ydoc).rows.get(id);
            if (row) setFields(row, patch);
        }),

        deleteRow: (id) => withWritableDoc((ydoc) => {
            roots(ydoc).rows.delete(id);
        }),

        setProjectSchedule: (schedule) => withWritableDoc((ydoc) => {
            const root = roots(ydoc);
            root.projectSchedule.clear();
            if (schedule) {
                setFields(root.projectSchedule, schedule);
                root.meta.set('hasProjectSchedule', true);
            } else {
                root.meta.set('hasProjectSchedule', false);
            }
        }),

        addDetailSchedule: (schedule) => withWritableDoc((ydoc) => {
            const root = roots(ydoc).detailSchedules;
            if (!root.has(schedule.id)) root.set(schedule.id, createRecordMap(schedule));
        }),

        updateDetailSchedule: (id, patch) => withWritableDoc((ydoc) => {
            const schedule = roots(ydoc).detailSchedules.get(id);
            if (schedule) setFields(schedule, patch);
        }),

        deleteDetailSchedule: (id) => withWritableDoc((ydoc) => {
            roots(ydoc).detailSchedules.delete(id);
        }),

        setMenuScheduleLinks: (links) => withWritableDoc((ydoc) => {
            roots(ydoc).meta.set('menuScheduleLinks', cloneValue(normalizeMenuScheduleLinks(links)));
        }),

        // JSON/엑셀 업로드처럼 사용자가 명시적으로 전체 교체를 승인한 경우에만 사용한다.
        replaceData: (data) => withWritableDoc((ydoc) => {
            const root = roots(ydoc);
            if (Array.isArray(data.menus)) {
                root.menus.clear();
                data.menus.forEach((menu) => root.menus.set(menu.id, createRecordMap(menu)));
            }
            if (Array.isArray(data.rows)) {
                root.rows.clear();
                data.rows.forEach((row) => root.rows.set(row.id, createRecordMap(row)));
            }
            if (Array.isArray(data.detailSchedules)) {
                root.detailSchedules.clear();
                data.detailSchedules.forEach((schedule) => root.detailSchedules.set(schedule.id, createRecordMap(schedule)));
            }
            if (data.projectSchedule !== undefined) {
                root.projectSchedule.clear();
                if (data.projectSchedule) {
                    setFields(root.projectSchedule, data.projectSchedule);
                    root.meta.set('hasProjectSchedule', true);
                } else {
                    root.meta.set('hasProjectSchedule', false);
                }
            }
            if (data.menuScheduleLinks !== undefined) {
                root.meta.set('menuScheduleLinks', cloneValue(normalizeMenuScheduleLinks(data.menuScheduleLinks)));
            }
        }),
    };
});
