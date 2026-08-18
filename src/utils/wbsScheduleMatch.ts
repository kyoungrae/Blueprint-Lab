import { deriveStatus } from '../data/scheduleSeedData';
import { normalizeYmd } from '../components/wbs/wbsDateUtils';
import {
    isWbsDebugingCategoryRow,
    type ScheduleStatus,
    type WbsDetailSchedule,
    type WbsDevRow,
    type WbsMenuNode,
    type WbsMenuScheduleLink,
} from '../types/wbs';

export const DEV_SCHEDULE_SYNC_CODE_RE = /^3\.2(\.|$)/;
const SYSTEM_DEV_GROUP_TITLE = '시스템 개발';

export const DEV_SCHEDULE_SYNC_TRIGGER_FIELDS = [
    'startDate',
    'endDate',
    'actualStartDate',
    'actualEndDate',
    'status',
    'progress',
    'assignee',
    'assigneeUserId',
] as const;

export interface ScheduleTreeNode extends WbsDetailSchedule {
    depth: number;
    isLeaf: boolean;
}

export interface MenuAssigneeGroup {
    menuId: string;
    assignee: string;
    assigneeUserId?: string;
}

export interface MenuAssigneeAggregate {
    /** 값이 없으면 빈 문자열 — 일정 탭도 빈 값으로 맞춘다 */
    startDate: string;
    endDate: string;
    actualStartDate: string;
    actualEndDate: string;
    progress: number;
    status: ScheduleStatus;
}

export function isDevScheduleSyncTriggerPatch(patch: object): boolean {
    return DEV_SCHEDULE_SYNC_TRIGGER_FIELDS.some((field) => field in patch);
}

export function normalizeMenuScheduleLinks(value: unknown): WbsMenuScheduleLink[] {
    if (!Array.isArray(value)) return [];
    const result: WbsMenuScheduleLink[] = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const menuId = typeof (item as WbsMenuScheduleLink).menuId === 'string'
            ? (item as WbsMenuScheduleLink).menuId.trim()
            : '';
        const assignee = typeof (item as WbsMenuScheduleLink).assignee === 'string'
            ? (item as WbsMenuScheduleLink).assignee.trim()
            : '';
        const scheduleId = typeof (item as WbsMenuScheduleLink).scheduleId === 'string'
            ? (item as WbsMenuScheduleLink).scheduleId.trim()
            : '';
        if (!menuId || !scheduleId) continue;
        const assigneeUserId = typeof (item as WbsMenuScheduleLink).assigneeUserId === 'string'
            && (item as WbsMenuScheduleLink).assigneeUserId!.trim()
            ? (item as WbsMenuScheduleLink).assigneeUserId!.trim()
            : undefined;
        result.push({ menuId, assignee, ...(assigneeUserId ? { assigneeUserId } : {}), scheduleId });
    }
    return result;
}

export function menuScheduleLinkKey(menuId: string, assignee: string, assigneeUserId?: string): string {
    return `${menuId}||${assigneeUserId?.trim() || assignee.trim()}`;
}

export function toScheduleDate(value: string | undefined): string {
    const ymd = normalizeYmd(value ?? '');
    return ymd ? ymd.replace(/-/g, '.') : '';
}

export function stripScheduleTitlePrefix(title: string): string {
    return title.replace(/^\d+(\.\d+)*\s+/, '').trim();
}

export function buildScheduleTree(schedules: WbsDetailSchedule[]): ScheduleTreeNode[] {
    const childParentIds = new Set(
        schedules.map((item) => item.parentId).filter((id): id is string => Boolean(id)),
    );
    const byParent = new Map<string | null, WbsDetailSchedule[]>();
    for (const item of schedules) {
        const key = item.parentId ?? null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(item);
    }
    for (const list of byParent.values()) {
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    const result: ScheduleTreeNode[] = [];
    const walk = (parentId: string | null, depth: number) => {
        for (const item of byParent.get(parentId) ?? []) {
            result.push({
                ...item,
                depth,
                isLeaf: !childParentIds.has(item.id),
            });
            walk(item.id, depth + 1);
        }
    };
    walk(null, 0);
    return result;
}

function ancestorInSystemDevGroup(
    item: WbsDetailSchedule,
    byId: Map<string, WbsDetailSchedule>,
): boolean {
    let parentId = item.parentId ?? null;
    let guard = 0;
    while (parentId && guard++ < 40) {
        const parent = byId.get(parentId);
        if (!parent) break;
        const code = parent.scheduleCode?.trim() ?? '';
        if (DEV_SCHEDULE_SYNC_CODE_RE.test(code)) return true;
        const title = stripScheduleTitlePrefix(parent.title);
        if (title === SYSTEM_DEV_GROUP_TITLE) return true;
        parentId = parent.parentId ?? null;
    }
    return false;
}

export function getSyncScopeLeaves(schedules: WbsDetailSchedule[]): WbsDetailSchedule[] {
    const tree = buildScheduleTree(schedules);
    const byId = new Map(schedules.map((item) => [item.id, item]));
    return tree.filter((node) => {
        if (!node.isLeaf) return false;
        const code = node.scheduleCode?.trim() ?? '';
        if (DEV_SCHEDULE_SYNC_CODE_RE.test(code)) return true;
        return ancestorInSystemDevGroup(node, byId);
    });
}

function workersMatch(worker: string | undefined, assignee: string): boolean {
    const w = worker?.trim() ?? '';
    const a = assignee.trim();
    if (!w || !a) return false;
    return w === a || w.toLowerCase() === a.toLowerCase();
}

function compareScheduleCode(a?: string, b?: string): number {
    const left = (a ?? '').split('.').map((part) => Number.parseInt(part, 10));
    const right = (b ?? '').split('.').map((part) => Number.parseInt(part, 10));
    const len = Math.max(left.length, right.length);
    for (let i = 0; i < len; i++) {
        const lv = Number.isFinite(left[i]) ? left[i] : 0;
        const rv = Number.isFinite(right[i]) ? right[i] : 0;
        if (lv !== rv) return lv - rv;
    }
    return (a ?? '').localeCompare(b ?? '', 'ko');
}

/** "이전등록 신청 내역 기능 개발"처럼 붙는 개발 접미사 */
const DEV_TITLE_SUFFIX_RE = /\s*(화면|기능)?\s*(개발|구현|작업)\s*$/;

/**
 * 일정 3.2.x 제목은 "웹-자동차등록-차량번호변경"처럼 메뉴 경로를 하이픈으로 이어 붙이고
 * 공백을 없앤 형태다. 표기 차이를 흡수하려면 공백·하이픈·괄호를 모두 지우고 비교해야 한다.
 */
function normalizeCompact(value: string): string {
    return value.trim().toLowerCase().replace(/[\s\-_()[\]]/g, '');
}

function titleSegments(title: string): string[] {
    return stripScheduleTitlePrefix(title).split('-').map((part) => part.trim()).filter(Boolean);
}

type MenuPlatform = 'web' | 'app';

function platformOfTitle(segments: string[]): MenuPlatform | null {
    const first = (segments[0] ?? '').trim().toLowerCase();
    if (first === '웹' || first === 'web') return 'web';
    if (first === '앱' || first === 'app') return 'app';
    return null;
}

function platformOfMenuPath(path: string[]): MenuPlatform | null {
    const root = (path[0] ?? '').toUpperCase();
    if (root.includes('WEB')) return 'web';
    if (root.includes('APP')) return 'app';
    return null;
}

const LEVEL_SEGMENT = 4;
const LEVEL_SEGMENT_SUFFIX = 3;
const LEVEL_JOINED = 2;
const LEVEL_TAIL = 1;

/**
 * 제목 꼬리와 메뉴명의 일치 강도.
 * 4 = 마지막 세그먼트가 그대로 메뉴명, 3 = 개발 접미사만 붙은 경우,
 * 2 = "POP-UP 관리"처럼 메뉴명에 하이픈이 있어 세그먼트가 쪼개진 경우,
 * 1 = "MYPAGE개인정보수정"처럼 구분자 없이 이어 붙은 경우.
 */
function tailMatchLevel(segments: string[], menuName: string): number {
    const leaf = normalizeCompact(menuName);
    if (!leaf || segments.length === 0) return 0;

    const last = segments[segments.length - 1];
    if (normalizeCompact(last) === leaf) return LEVEL_SEGMENT;
    if (normalizeCompact(last.replace(DEV_TITLE_SUFFIX_RE, '')) === leaf) return LEVEL_SEGMENT_SUFFIX;

    for (let k = 2; k <= Math.min(3, segments.length); k++) {
        const joined = segments.slice(segments.length - k).join('-');
        if (normalizeCompact(joined) === leaf) return LEVEL_JOINED;
        if (normalizeCompact(joined.replace(DEV_TITLE_SUFFIX_RE, '')) === leaf) return LEVEL_JOINED;
    }

    if (leaf.length >= 3 && normalizeCompact(last).endsWith(leaf)) return LEVEL_TAIL;
    return 0;
}

export interface MenuMatchTarget {
    menu: WbsMenuNode;
    /** 루트 → 리프 순서의 메뉴명 경로 */
    path: string[];
    assignee: string;
}

export function buildMenuPath(
    menuId: string,
    menus: WbsMenuNode[] | Map<string, WbsMenuNode>,
): string[] {
    const byId = menus instanceof Map ? menus : new Map(menus.map((menu) => [menu.id, menu]));
    const path: string[] = [];
    let current = byId.get(menuId);
    let guard = 0;
    while (current && guard++ < 40) {
        path.unshift(current.name);
        current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
}

/** 메뉴 하나에 대응할 수 있는 일정 항목을 좁혀 scheduleCode 순으로 돌려준다. */
export function findScheduleCandidates(
    target: MenuMatchTarget,
    candidates: WbsDetailSchedule[],
): WbsDetailSchedule[] {
    let scored = candidates
        .map((item) => {
            const segments = titleSegments(item.title);
            return { item, segments, level: tailMatchLevel(segments, target.menu.name) };
        })
        .filter((entry) => entry.level > 0);
    if (scored.length === 0) return [];

    // 제목의 "웹-"/"App-" 접두사는 작성자가 명시한 신호이므로 이름 일치 강도보다 먼저 적용한다.
    // 그래야 웹 메뉴가 이름이 더 깔끔한 App 항목에 붙는 일이 없다.
    const menuPlatform = platformOfMenuPath(target.path);
    if (menuPlatform) {
        const samePlatform = scored.filter((entry) => {
            const titlePlatform = platformOfTitle(entry.segments);
            return titlePlatform === null || titlePlatform === menuPlatform;
        });
        if (samePlatform.length > 0) scored = samePlatform;
    }

    const bestLevel = Math.max(...scored.map((entry) => entry.level));
    let narrowed = scored.filter((entry) => entry.level === bestLevel);

    if (narrowed.length > 1 && menuPlatform) {
        const byPlatform = narrowed.filter((entry) => platformOfTitle(entry.segments) === menuPlatform);
        if (byPlatform.length > 0) narrowed = byPlatform;
    }
    if (narrowed.length > 1) {
        const byWorker = narrowed.filter((entry) => workersMatch(entry.item.worker, target.assignee));
        if (byWorker.length > 0) narrowed = byWorker;
    }
    if (narrowed.length > 1) {
        const pathNorm = new Set(target.path.map(normalizeCompact));
        const byAncestor = narrowed.filter((entry) => {
            const parentSegment = entry.segments[entry.segments.length - 2];
            return parentSegment ? pathNorm.has(normalizeCompact(parentSegment)) : false;
        });
        if (byAncestor.length > 0) narrowed = byAncestor;
    }

    // 구분자 없이 이어 붙은 약한 일치는 하나로 좁혀질 때만 인정한다.
    if (bestLevel === LEVEL_TAIL && narrowed.length > 1) return [];

    return narrowed
        .map((entry) => entry.item)
        .sort((a, b) => compareScheduleCode(a.scheduleCode, b.scheduleCode));
}

export function findStoredMenuScheduleLink(
    links: WbsMenuScheduleLink[],
    menuId: string,
    assignee: string,
    assigneeUserId?: string,
): WbsMenuScheduleLink | undefined {
    const userId = assigneeUserId?.trim();
    if (userId) {
        const byUser = links.find((link) => link.menuId === menuId && link.assigneeUserId === userId);
        if (byUser) return byUser;
    }
    const name = assignee.trim();
    return links.find((link) => link.menuId === menuId && link.assignee.trim() === name);
}

function minDate(values: string[]): string {
    const dates = values.map(toScheduleDate).filter(Boolean).sort();
    return dates[0] ?? '';
}

function maxDate(values: string[]): string {
    const dates = values.map(toScheduleDate).filter(Boolean).sort();
    return dates[dates.length - 1] ?? '';
}

function rowMatchesAssignee(row: WbsDevRow, assignee: string, assigneeUserId?: string): boolean {
    const userId = assigneeUserId?.trim();
    if (userId && row.assigneeUserId?.trim() === userId) return true;
    return row.assignee.trim() === assignee.trim();
}

export function aggregateMenuAssigneeRows(
    rows: WbsDevRow[],
    menuId: string,
    assignee: string,
    assigneeUserId?: string,
): MenuAssigneeAggregate | null {
    const group = rows.filter((row) => (
        row.menuId === menuId
        && !isWbsDebugingCategoryRow(row)
        && rowMatchesAssignee(row, assignee, assigneeUserId)
    ));
    if (group.length === 0) return null;

    const progress = Math.round(group.reduce((sum, row) => sum + (row.progress || 0), 0) / group.length);
    return {
        startDate: minDate(group.map((row) => row.startDate)),
        endDate: maxDate(group.map((row) => row.endDate)),
        actualStartDate: minDate(group.map((row) => row.actualStartDate ?? '')),
        actualEndDate: maxDate(group.map((row) => row.actualEndDate ?? '')),
        progress,
        status: deriveStatus(progress),
    };
}

export function collectMenuAssigneeGroups(rows: WbsDevRow[]): MenuAssigneeGroup[] {
    const seen = new Set<string>();
    const groups: MenuAssigneeGroup[] = [];
    for (const row of rows) {
        if (isWbsDebugingCategoryRow(row)) continue;
        const assignee = row.assignee.trim();
        const assigneeUserId = row.assigneeUserId?.trim() || undefined;
        if (!assignee && !assigneeUserId) continue;
        const key = menuScheduleLinkKey(row.menuId, assignee, assigneeUserId);
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push({ menuId: row.menuId, assignee, assigneeUserId });
    }

    const menusWithAssignee = new Set(groups.map((group) => group.menuId));
    for (const row of rows) {
        if (isWbsDebugingCategoryRow(row)) continue;
        if (menusWithAssignee.has(row.menuId)) continue;
        if (row.assignee.trim() || row.assigneeUserId?.trim()) continue;
        const key = menuScheduleLinkKey(row.menuId, '', undefined);
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push({ menuId: row.menuId, assignee: '' });
    }
    return groups;
}

export function upsertMenuScheduleLink(
    links: WbsMenuScheduleLink[],
    next: WbsMenuScheduleLink,
): WbsMenuScheduleLink[] {
    const key = menuScheduleLinkKey(next.menuId, next.assignee, next.assigneeUserId);
    const filtered = links.filter(
        (link) => menuScheduleLinkKey(link.menuId, link.assignee, link.assigneeUserId) !== key,
    );
    return [...filtered, next];
}

export function pruneMenuScheduleLinks(
    links: WbsMenuScheduleLink[],
    groups: MenuAssigneeGroup[],
    validScheduleIds: Set<string>,
): WbsMenuScheduleLink[] {
    const activeKeys = new Set(
        groups.map((group) => menuScheduleLinkKey(group.menuId, group.assignee, group.assigneeUserId)),
    );
    return links.filter((link) => (
        validScheduleIds.has(link.scheduleId)
        && activeKeys.has(menuScheduleLinkKey(link.menuId, link.assignee, link.assigneeUserId))
    ));
}

export function buildSchedulePatchFromAggregate(
    current: WbsDetailSchedule,
    aggregate: MenuAssigneeAggregate,
): Partial<Omit<WbsDetailSchedule, 'id'>> | null {
    const patch: Partial<Omit<WbsDetailSchedule, 'id'>> = {};
    // 개발 상세가 단일 원본이므로 빈 값도 그대로 반영해 100% 동일하게 맞춘다.
    if (toScheduleDate(current.startDate) !== aggregate.startDate) {
        patch.startDate = aggregate.startDate;
    }
    if (toScheduleDate(current.endDate) !== aggregate.endDate) {
        patch.endDate = aggregate.endDate;
    }
    if (toScheduleDate(current.actualStartDate) !== aggregate.actualStartDate) {
        patch.actualStartDate = aggregate.actualStartDate;
    }
    if (toScheduleDate(current.actualEndDate) !== aggregate.actualEndDate) {
        patch.actualEndDate = aggregate.actualEndDate;
    }
    if ((current.progress ?? 0) !== aggregate.progress) {
        patch.progress = aggregate.progress;
    }
    if (current.status !== aggregate.status && !('progress' in patch)) {
        patch.status = aggregate.status;
    }
    return Object.keys(patch).length > 0 ? patch : null;
}

/** 3.2.x / 시스템 개발 구간의 부모 항목 시작·종료일을 자식 min/max로 재계산 */
export function buildParentDateRollups(
    schedules: WbsDetailSchedule[],
): Array<{ id: string; patch: Partial<Omit<WbsDetailSchedule, 'id'>> }> {
    const byId = new Map(schedules.map((item) => [item.id, item]));
    const childrenOf = new Map<string, WbsDetailSchedule[]>();
    for (const item of schedules) {
        if (!item.parentId) continue;
        if (!childrenOf.has(item.parentId)) childrenOf.set(item.parentId, []);
        childrenOf.get(item.parentId)!.push(item);
    }

    const depthOf = new Map<string, number>();
    for (const node of buildScheduleTree(schedules)) depthOf.set(node.id, node.depth);

    const ancestorIds = new Set<string>();
    for (const leaf of getSyncScopeLeaves(schedules)) {
        let parentId = leaf.parentId ?? null;
        let guard = 0;
        while (parentId && guard++ < 40) {
            ancestorIds.add(parentId);
            parentId = byId.get(parentId)?.parentId ?? null;
        }
    }

    // 조상 행은 자식이 갱신된 뒤 계산해야 하므로 깊은 단계부터 처리한다.
    const ordered = [...ancestorIds].sort((a, b) => (depthOf.get(b) ?? 0) - (depthOf.get(a) ?? 0));
    const working = new Map(schedules.map((item) => [item.id, { ...item }]));

    const result: Array<{ id: string; patch: Partial<Omit<WbsDetailSchedule, 'id'>> }> = [];
    for (const parentId of ordered) {
        const parent = working.get(parentId);
        const children = (childrenOf.get(parentId) ?? [])
            .map((child) => working.get(child.id) ?? child);
        if (!parent || children.length === 0) continue;
        const dateOnly: MenuAssigneeAggregate = {
            startDate: minDate(children.map((child) => child.startDate)),
            endDate: maxDate(children.map((child) => child.endDate)),
            actualStartDate: minDate(children.map((child) => child.actualStartDate ?? '')),
            actualEndDate: maxDate(children.map((child) => child.actualEndDate ?? '')),
            progress: parent.progress ?? 0,
            status: parent.status ?? '대기',
        };
        const patch = buildSchedulePatchFromAggregate(parent, dateOnly);
        if (!patch) continue;
        delete patch.progress;
        delete patch.status;
        if (Object.keys(patch).length === 0) continue;
        working.set(parentId, { ...parent, ...patch });
        result.push({ id: parentId, patch });
    }
    return result;
}
