import type { WbsDevRow, WbsMenuNode } from '../../types/wbs';

const MENU_RANGE_COLORS = [
    '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
    '#06b6d4', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#f43f5e', '#64748b',
];

export interface AssigneeMenuDateRange {
    menuId: string;
    menuName: string;
    menuCode: string;
    startDate: string;
    endDate: string;
    color: string;
}

/** YYYY-MM-DD / YYYY.MM.DD 등을 YYYY-MM-DD로 정규화 */
export function normalizeYmd(value: string): string {
    const s = String(value ?? '').trim();
    if (!s) return '';
    const parts = s.split(/\s*[-./]\s*/);
    if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }
    const digits = s.replace(/\D/g, '');
    if (digits.length === 8) {
        const y = parseInt(digits.slice(0, 4), 10);
        const m = parseInt(digits.slice(4, 6), 10);
        const d = parseInt(digits.slice(6, 8), 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }
    return '';
}

/** 담당자가 배정된 메뉴별 시작·종료일(행 집계) */
export function buildAssigneeMenuDateRanges(
    assignee: string,
    menus: WbsMenuNode[],
    rows: WbsDevRow[],
    excludeRowId?: string,
): AssigneeMenuDateRange[] {
    const name = assignee.trim();
    if (!name) return [];

    const menuById = new Map(menus.map((m) => [m.id, m]));
    const grouped = new Map<string, { starts: string[]; ends: string[] }>();

    for (const row of rows) {
        if (excludeRowId && row.id === excludeRowId) continue;
        if (row.assignee.trim() !== name) continue;
        if (!grouped.has(row.menuId)) grouped.set(row.menuId, { starts: [], ends: [] });
        const bucket = grouped.get(row.menuId)!;
        const start = normalizeYmd(row.startDate);
        const end = normalizeYmd(row.endDate);
        if (start) bucket.starts.push(start);
        if (end) bucket.ends.push(end);
    }

    const result: AssigneeMenuDateRange[] = [];
    let colorIdx = 0;

    for (const [menuId, { starts, ends }] of grouped) {
        const menu = menuById.get(menuId);
        if (!menu) continue;
        const startDate = starts.length ? starts.sort()[0] : '';
        const endDate = ends.length ? ends.sort().reverse()[0] : '';
        if (!startDate && !endDate) continue;
        result.push({
            menuId,
            menuName: menu.name,
            menuCode: menu.menuCode,
            startDate,
            endDate,
            color: MENU_RANGE_COLORS[colorIdx++ % MENU_RANGE_COLORS.length],
        });
    }

    return result.sort((a, b) => {
        const aKey = a.startDate || a.endDate;
        const bKey = b.startDate || b.endDate;
        if (aKey !== bKey) return bKey.localeCompare(aKey);
        return b.menuName.localeCompare(a.menuName, 'ko');
    });
}

export function isWeekendDate(d: Date): boolean {
    const dow = d.getDay();
    return dow === 0 || dow === 6;
}

export function isWeekendYmd(ymd: string): boolean {
    if (!ymd) return false;
    const parts = ymd.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => isNaN(n))) return false;
    return isWeekendDate(new Date(parts[0], parts[1] - 1, parts[2]));
}

export function sortRangeBounds(a: string, b: string): { start: string; end: string } {
    return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** 달력 range 하이라이트 — 주말은 구간에서 제외 */
export function isWeekdayInRangeSpan(ymd: string, rangeStart: string, rangeEnd: string): boolean {
    if (!rangeStart || !rangeEnd || isWeekendYmd(ymd)) return false;
    const { start, end } = sortRangeBounds(rangeStart, rangeEnd);
    return ymd >= start && ymd <= end;
}
