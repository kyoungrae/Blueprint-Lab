import type { WbsDevRow, WbsMenuNode } from '../../types/wbs';

/** 산출물 구분 정렬 순서 (엑셀 개발상세 시트와 동일) */
export const WBS_CATEGORY_ORDER = ['Controller', 'Service', 'ServiceImpl', 'VO', 'Mapper', 'Html', 'Debuging', '기능'];

/** 메뉴의 상위→현재 이름 배열 */
export function menuPathParts(menus: WbsMenuNode[], id: string): string[] {
    const byId = new Map(menus.map((m) => [m.id, m]));
    const parts: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 100) {
        parts.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts;
}

/** 메뉴 트리 전위 순서 (DFS) */
export function menuDfsOrder(menus: WbsMenuNode[]): Map<string, number> {
    const byParent = new Map<string | null, WbsMenuNode[]>();
    for (const m of menus) {
        const key = m.parentId ?? null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(m);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);
    const order = new Map<string, number>();
    let idx = 0;
    const dfs = (parentId: string | null) => {
        for (const m of byParent.get(parentId) ?? []) {
            order.set(m.id, idx++);
            dfs(m.id);
        }
    };
    dfs(null);
    return order;
}

/** 엑셀 개발상세 시트와 동일한 행 정렬 */
export function sortWbsDevRows(menus: WbsMenuNode[], rows: WbsDevRow[]): WbsDevRow[] {
    const menuOrder = menuDfsOrder(menus);
    return [...rows].sort((a, b) => {
        const ma = menuOrder.get(a.menuId) ?? 999999;
        const mb = menuOrder.get(b.menuId) ?? 999999;
        if (ma !== mb) return ma - mb;
        const ca = WBS_CATEGORY_ORDER.indexOf(a.category);
        const cb = WBS_CATEGORY_ORDER.indexOf(b.category);
        if (ca !== cb) return (ca < 0 ? 999 : ca) - (cb < 0 ? 999 : cb);
        return a.featureName.localeCompare(b.featureName, 'ko');
    });
}

/** 메뉴경로 열 최대 깊이 */
export function wbsPathDepth(menus: WbsMenuNode[], rows: WbsDevRow[]): number {
    if (rows.length === 0) return 1;
    return Math.max(1, ...rows.map((r) => menuPathParts(menus, r.menuId).length));
}

/** 메뉴 그룹별 교대 배경 (엑셀 팔레트 대응) */
export const WBS_GROUP_ROW_BG = [
    { base: 'bg-blue-50/80', debug: 'bg-blue-100/70' },
    { base: 'bg-gray-50/80', debug: 'bg-gray-100/70' },
] as const;
