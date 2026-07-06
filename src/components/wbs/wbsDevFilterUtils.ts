import type { WbsDevRow, WbsMenuNode } from '../../types/wbs';

interface TreeNode extends WbsMenuNode {
    children: TreeNode[];
}

function buildTree(menus: WbsMenuNode[]): TreeNode[] {
    const validIds = new Set(menus.map((m) => m.id));
    const byParent = new Map<string | null, WbsMenuNode[]>();
    for (const m of menus) {
        const key = m.parentId && validIds.has(m.parentId) ? m.parentId : null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(m);
    }
    const build = (parentId: string | null): TreeNode[] =>
        (byParent.get(parentId) ?? [])
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((m) => ({ ...m, children: build(m.id) }));
    return build(null);
}

export function normalizeSearch(q: string) {
    return q.trim().toLowerCase();
}

function menuMatchesSearch(m: WbsMenuNode, q: string): boolean {
    if (!q) return true;
    const needle = normalizeSearch(q);
    return (
        m.name.toLowerCase().includes(needle) ||
        m.menuCode.toLowerCase().includes(needle) ||
        (m.programId ?? '').toLowerCase().includes(needle)
    );
}

/** 검색어가 있을 때 표시할 메뉴 ID 집합 (매칭 + 상위·하위 포함). null이면 전체 표시 */
export function buildSearchVisibleIds(menus: WbsMenuNode[], query: string): Set<string> | null {
    const q = normalizeSearch(query);
    if (!q) return null;

    const matching = menus.filter((m) => menuMatchesSearch(m, q));
    if (matching.length === 0) return new Set();

    const byId = new Map(menus.map((m) => [m.id, m]));
    const visible = new Set<string>();

    const addAncestors = (id: string) => {
        let cur = byId.get(id);
        while (cur) {
            visible.add(cur.id);
            cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
    };

    const addDescendants = (parentId: string) => {
        for (const m of menus) {
            if (m.parentId === parentId) {
                visible.add(m.id);
                addDescendants(m.id);
            }
        }
    };

    for (const m of matching) {
        addAncestors(m.id);
        addDescendants(m.id);
    }

    return visible;
}

export function buildRowsByMenu(rows: WbsDevRow[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const r of rows) {
        if (!r.assignee) continue;
        if (!map.has(r.menuId)) map.set(r.menuId, []);
        const arr = map.get(r.menuId)!;
        if (!arr.includes(r.assignee)) arr.push(r.assignee);
    }
    return map;
}

function nodeMatchesFilter(node: TreeNode, activeAssignees: Set<string>, rowsByMenu: Map<string, string[]>): boolean {
    const assignees = rowsByMenu.get(node.id) ?? [];
    if (assignees.some((a) => activeAssignees.has(a))) return true;
    return node.children.some((c) => nodeMatchesFilter(c, activeAssignees, rowsByMenu));
}

/** 담당자 필터가 켜져 있을 때 트리에 표시되는 메뉴 ID. null이면 전체 */
export function getAssigneeVisibleMenuIds(
    menus: WbsMenuNode[],
    rows: WbsDevRow[],
    activeAssignees: Set<string>,
): Set<string> | null {
    if (activeAssignees.size === 0) return null;

    const rowsByMenu = buildRowsByMenu(rows);
    const tree = buildTree(menus);
    const visible = new Set<string>();

    const collect = (node: TreeNode) => {
        if (!nodeMatchesFilter(node, activeAssignees, rowsByMenu)) return;
        visible.add(node.id);
        node.children.forEach(collect);
    };
    tree.forEach(collect);
    return visible;
}

/**
 * 검색 + 담당자 필터를 합친 표시 대상 메뉴 ID.
 * null = 필터 없음(전체), 빈 Set = 결과 없음
 */
export function getFilteredMenuIds(
    menus: WbsMenuNode[],
    rows: WbsDevRow[],
    searchQuery: string,
    activeAssignees: Set<string>,
): Set<string> | null {
    const searchIds = buildSearchVisibleIds(menus, searchQuery);
    const assigneeIds = getAssigneeVisibleMenuIds(menus, rows, activeAssignees);

    if (searchIds === null && assigneeIds === null) return null;
    if (searchIds !== null && searchIds.size === 0) return new Set();
    if (assigneeIds !== null && assigneeIds.size === 0) return new Set();

    if (searchIds === null) return assigneeIds;
    if (assigneeIds === null) return searchIds;

    const result = new Set<string>();
    for (const id of searchIds) {
        if (assigneeIds.has(id)) result.add(id);
    }
    return result;
}

/** 전체 고유 담당자 (등장 순) */
export function getAllAssignees(rows: WbsDevRow[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of rows) {
        if (r.assignee && !seen.has(r.assignee)) {
            seen.add(r.assignee);
            result.push(r.assignee);
        }
    }
    return result;
}
