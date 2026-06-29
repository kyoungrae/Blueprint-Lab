// xlsx-js-style: xlsx 호환 + 셀 스타일(fill/font/border) 지원 브라우저 라이브러리
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import XLSXStyle from 'xlsx-js-style';
import * as XLSX from 'xlsx';   // 업로드 파싱은 기존 xlsx 유지

import type { WbsData, WbsMenuNode, WbsDevRow, WbsStatus } from '../../types/wbs';
import { WBS_STATUS_LABEL, WBS_STATUS_ORDER } from '../../types/wbs';

// ── xlsx-js-style 타입 헬퍼 ──────────────────────────
type XStyle = {
    fill?:      { patternType: 'solid'; fgColor: { rgb: string } };
    font?:      { bold?: boolean; color?: { rgb: string }; sz?: number; name?: string };
    border?:    { bottom?: { style: string; color: { rgb: string } }; right?: { style: string; color: { rgb: string } } };
    alignment?: { vertical?: string; horizontal?: string; wrapText?: boolean };
};
type XCell = { v: string | number; t: 's' | 'n'; s?: XStyle };
type XAoa  = (XCell | null)[][];

const uid = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** 메뉴 전체 경로 ("상위 > 하위 > 현재") */
function menuPath(menus: WbsMenuNode[], id: string): string {
    const byId = new Map(menus.map((m) => [m.id, m]));
    const parts: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 100) {
        parts.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(' > ');
}

/** 메뉴의 상위→현재 이름 배열 (["MVIMS","등록","전자업무","신규등록 신청 내역"]) */
function menuPathParts(menus: WbsMenuNode[], id: string): string[] {
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

/**
 * 메뉴를 뎁스(단계)별 열로 펼친 시트 데이터 생성.
 * - 각 메뉴명은 자신의 depth 열에 배치
 * - 자식이 있는 메뉴는 자손 행 범위만큼 세로 병합(상위가 한 번만 보이도록) → 두 번째 스크린샷 형태
 */
function buildMenuTreeSheet(menus: WbsMenuNode[]): { aoa: string[][]; merges: XLSX.Range[]; maxDepth: number } {
    const byParent = new Map<string | null, WbsMenuNode[]>();
    for (const m of menus) {
        const key = m.parentId ?? null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(m);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);

    const aoa: string[][] = [];
    const merges: XLSX.Range[] = [];
    let maxDepth = 0;

    const ensureRow = (r: number) => {
        while (aoa.length <= r) aoa.push([]);
        return aoa[r];
    };

    // leaf-행 모델: 잎(자식 없는 메뉴)만 한 행을 차지하고, 상위는 자손 범위를 병합한다.
    const dfs = (node: WbsMenuNode, depth: number): { start: number; end: number } => {
        if (depth > maxDepth) maxDepth = depth;
        const children = byParent.get(node.id) ?? [];
        if (children.length === 0) {
            const r = aoa.length;
            const row = ensureRow(r);
            row[depth] = node.name;
            return { start: r, end: r };
        }
        let start = -1;
        let end = -1;
        for (const c of children) {
            const range = dfs(c, depth + 1);
            if (start === -1) start = range.start;
            end = range.end;
        }
        ensureRow(start)[depth] = node.name;
        if (end > start) merges.push({ s: { r: start, c: depth }, e: { r: end, c: depth } });
        return { start, end };
    };

    for (const root of byParent.get(null) ?? []) dfs(root, 0);

    return { aoa, merges, maxDepth };
}

/** 산출물 구분 정렬 순서 */
const CATEGORY_ORDER = ['Controller', 'Service', 'ServiceImpl', 'VO', 'Mapper', 'Html', 'Debuging', '기능'];

/** 메뉴 트리 전위 순서 id 배열 (DFS) — 메뉴별 행 정렬 기준 */
function menuDfsOrder(menus: WbsMenuNode[]): Map<string, number> {
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

/** 현재 WBS 상태를 엑셀(.xlsx)로 다운로드 */
export function downloadWbsExcel(data: WbsData, projectName: string): void {
    const { menus, rows } = data;
    const menuCodeById = new Map(menus.map((m) => [m.id, m.menuCode]));
    const menuOrder = menuDfsOrder(menus);

    // ── 행 정렬: 메뉴 트리 순 → 산출물 구분 순 → 기능명 순 ──
    const sortedRows = [...rows].sort((a, b) => {
        const ma = menuOrder.get(a.menuId) ?? 999999;
        const mb = menuOrder.get(b.menuId) ?? 999999;
        if (ma !== mb) return ma - mb;
        const ca = CATEGORY_ORDER.indexOf(a.category);
        const cb = CATEGORY_ORDER.indexOf(b.category);
        if (ca !== cb) return (ca < 0 ? 999 : ca) - (cb < 0 ? 999 : cb);
        return a.featureName.localeCompare(b.featureName, 'ko');
    });

    const pathDepth = Math.max(1, ...sortedRows.map((r) => menuPathParts(menus, r.menuId).length));

    // ── 팔레트 (메뉴 그룹 색 — 2색 교대) ──
    const GROUP_PALETTES = [
        { base: 'EFF6FF', debug: 'DBEAFE' }, // light blue
        { base: 'F9FAFB', debug: 'F3F4F6' }, // light gray
    ];
    const HEADER_BG  = '1E293B';
    const HEADER_FG  = 'FFFFFF';
    const BORDER_CLR = 'E2E8F0';

    const statusFgColors: Record<string, string> = {
        '완료': '059669', '진행중': '2563EB', '보류': 'D97706', '대기': '6B7280',
    };

    const hdrStyle = (align: 'center' | 'left' = 'center'): XStyle => ({
        fill:      { patternType: 'solid', fgColor: { rgb: HEADER_BG } },
        font:      { bold: true, color: { rgb: HEADER_FG }, sz: 10, name: '맑은 고딕' },
        border:    { bottom: { style: 'thin', color: { rgb: '334155' } }, right: { style: 'thin', color: { rgb: '334155' } } },
        alignment: { vertical: 'center', horizontal: align, wrapText: false },
    });

    const cellStyle = (bg: string, extra?: Partial<XStyle>): XStyle => ({
        fill:      { patternType: 'solid', fgColor: { rgb: bg } },
        font:      { name: '맑은 고딕', sz: 9, ...extra?.font },
        border:    { bottom: { style: 'thin', color: { rgb: BORDER_CLR } }, right: { style: 'thin', color: { rgb: BORDER_CLR } } },
        alignment: { vertical: 'center', wrapText: false, ...extra?.alignment },
        ...extra,
    });

    const sc = (v: string | number, s: XStyle): XCell =>
        ({ v, t: typeof v === 'number' ? 'n' : 's', s });

    // ─────────────────────────────────────────────
    // 시트1: 개발 상세
    // ─────────────────────────────────────────────
    const detailAoa: XAoa = [];

    // 헤더 행
    const hdrLabels = [
        'ID(수정금지)',
        ...Array.from({ length: pathDepth }, () => '메뉴경로'),
        '메뉴코드', '구분(산출물)', '기능명', '담당자', '시작일', '종료일', '상태', '진행율(%)', '비고',
    ];
    detailAoa.push(hdrLabels.map((v) => sc(v, hdrStyle())));

    // 데이터
    let groupColorIdx = -1;
    let lastMenuId = '';

    for (const r of sortedRows) {
        if (r.menuId !== lastMenuId) { groupColorIdx = (groupColorIdx + 1) % GROUP_PALETTES.length; lastMenuId = r.menuId; }
        const palette   = GROUP_PALETTES[groupColorIdx];
        const bg        = r.isDebugging ? palette.debug : palette.base;
        const parts     = menuPathParts(menus, r.menuId);
        const statusLbl = WBS_STATUS_LABEL[r.status];
        const sfg       = statusFgColors[statusLbl] ?? '6B7280';

        const row: XCell[] = [
            sc(r.id,   cellStyle(bg, { font: { name: '맑은 고딕', sz: 8, color: { rgb: '94A3B8' } } })),
            // 메뉴경로 열
            ...Array.from({ length: pathDepth }, (_, i) =>
                sc(parts[i] ?? '', cellStyle(bg))
            ),
            // 메뉴코드
            sc(menuCodeById.get(r.menuId) ?? '', cellStyle(bg, { font: { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: '4F46E5' } }, alignment: { horizontal: 'center', vertical: 'center' } })),
            // 구분
            sc(r.category,    cellStyle(bg)),
            // 기능명
            sc(r.featureName, cellStyle(bg)),
            // 담당자
            sc(r.assignee,    cellStyle(bg)),
            // 시작일·종료일
            sc(r.startDate,   cellStyle(bg, { alignment: { horizontal: 'center', vertical: 'center' } })),
            sc(r.endDate,     cellStyle(bg, { alignment: { horizontal: 'center', vertical: 'center' } })),
            // 상태
            sc(statusLbl, cellStyle(bg, { font: { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: sfg } }, alignment: { horizontal: 'center', vertical: 'center' } })),
            // 진행율
            sc(r.progress, cellStyle(bg, { font: { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: r.progress === 100 ? '059669' : '374151' } }, alignment: { horizontal: 'center', vertical: 'center' } })),
            // 비고
            sc(r.note ?? '', cellStyle(bg)),
        ];
        detailAoa.push(row);
    }

    const ws1 = XLSXStyle.utils.aoa_to_sheet(detailAoa);
    ws1['!cols'] = [
        { wch: 22 },
        ...Array.from({ length: pathDepth }, () => ({ wch: 18 })),
        { wch: 13 }, { wch: 13 }, { wch: 26 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 22 },
    ];
    ws1['!rows'] = [{ hpt: 22 }];
    ws1['!freeze'] = { xSplit: 0, ySplit: 1 };

    // ─────────────────────────────────────────────
    // 시트2: 메뉴 구조
    // ─────────────────────────────────────────────
    const { aoa, merges, maxDepth } = buildMenuTreeSheet(menus);
    const treeHdr = Array.from({ length: maxDepth + 1 }, (_, i) => sc(`${i + 1}단계`, hdrStyle()));
    const treeAoa: XAoa = [treeHdr, ...aoa.map((row) =>
        Array.from({ length: maxDepth + 1 }, (_, i) =>
            sc(row[i] ?? '', cellStyle('FFFFFF'))
        )
    )];
    const ws2 = XLSXStyle.utils.aoa_to_sheet(treeAoa);
    ws2['!cols'] = Array.from({ length: maxDepth + 1 }, () => ({ wch: 22 }));
    ws2['!merges'] = merges.map((m) => ({ s: { r: m.s.r + 1, c: m.s.c }, e: { r: m.e.r + 1, c: m.e.c } }));

    // ─────────────────────────────────────────────
    // 시트3: 메뉴 데이터 (재업로드용)
    // ─────────────────────────────────────────────
    const menuHdr = ['ID(수정금지)', '메뉴코드', '메뉴명', '프로그램ID', '전체경로', '상위메뉴코드'].map((v) => sc(v, hdrStyle('left')));
    const menuBodyAoa: XAoa = [menuHdr, ...menus
        .slice()
        .sort((a, b) => (menuOrder.get(a.id) ?? 0) - (menuOrder.get(b.id) ?? 0))
        .map((m) => [
            sc(m.id, cellStyle('FFFFFF', { font: { name: '맑은 고딕', sz: 8, color: { rgb: '94A3B8' } } })),
            sc(m.menuCode,  cellStyle('FFFFFF', { font: { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: '4F46E5' } } })),
            sc(m.name,      cellStyle('FFFFFF')),
            sc(m.programId ?? '', cellStyle('FFFFFF', { font: { name: '맑은 고딕', sz: 9, color: { rgb: '64748B' } } })),
            sc(menuPath(menus, m.id), cellStyle('F8FAFC')),
            sc(m.parentId ? (menus.find((x) => x.id === m.parentId)?.menuCode ?? '') : '', cellStyle('FFFFFF')),
        ])
    ];
    const ws3 = XLSXStyle.utils.aoa_to_sheet(menuBodyAoa);
    ws3['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 40 }, { wch: 14 }];

    // ─────────────────────────────────────────────
    // 워크북 조립
    // ─────────────────────────────────────────────
    const wb = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, ws1, '개발상세');
    XLSXStyle.utils.book_append_sheet(wb, ws2, '메뉴구조');
    XLSXStyle.utils.book_append_sheet(wb, ws3, '메뉴데이터');

    const safeName = (projectName || 'WBS').replace(/[\\/:*?"<>|]/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    const fileName = `${safeName}_WBS_${today}.xlsx`;

    XLSXStyle.writeFile(wb, fileName);
}

// ─────────────────────────────────────────────────────────────────────────────
// 엑셀 업로드 → 현재 데이터와 비교 병합 (다운로드 형식과 동일한 파일 기준)
// ─────────────────────────────────────────────────────────────────────────────

export interface WbsMergeSummary {
    menusAdded: number;
    menusUpdated: number;
    rowsAdded: number;
    rowsUpdated: number;
    /** 웹에만 있고 엑셀엔 없는 행 (유지됨) */
    rowsOnlyOnWeb: number;
    /** 웹에만 있고 엑셀엔 없는 메뉴 (유지됨) */
    menusOnlyOnWeb: number;
    /** 매칭되는 메뉴를 못 찾아 건너뛴 엑셀 행 */
    skipped: number;
}

export interface WbsDiffItem {
    label: string;
}

export interface WbsMergeAnalysis {
    data: WbsData;
    summary: WbsMergeSummary;
    addedRows: WbsDiffItem[];
    updatedRows: WbsDiffItem[];
    /** 웹에만 있는 행 목록 (엑셀에 없음 → 유지하되 표시) */
    onlyOnWebRows: WbsDiffItem[];
    onlyOnWebMenus: WbsDiffItem[];
}

const labelToStatus: Record<string, WbsStatus> = (() => {
    const m: Record<string, WbsStatus> = {};
    (Object.keys(WBS_STATUS_LABEL) as WbsStatus[]).forEach((k) => { m[WBS_STATUS_LABEL[k]] = k; });
    return m;
})();

function toStatus(v: unknown): WbsStatus {
    const s = String(v ?? '').trim();
    if (labelToStatus[s]) return labelToStatus[s];
    if ((WBS_STATUS_ORDER as string[]).includes(s)) return s as WbsStatus;
    return 'TODO';
}

const rowKey = (menuCode: string, category: string, featureName: string) =>
    `${menuCode}||${category}||${featureName}`;

const cell = (dr: Record<string, unknown>, ...keys: string[]): string => {
    for (const k of keys) {
        if (dr[k] !== undefined && dr[k] !== null && String(dr[k]).trim() !== '') return String(dr[k]).trim();
    }
    return '';
};

/**
 * 다운로드한 형식의 엑셀(.xlsx)을 읽어 현재 WBS 데이터와 비교 분석한다.
 * - 행(개발상세)은 'ID(수정금지)'로 매칭하므로 기능명·구분을 바꿔도 정확히 갱신(누락·중복 방지).
 *   ID가 비었으면 (메뉴코드+구분+기능명) 키로 보조 매칭, 그래도 없으면 신규 추가.
 * - 메뉴는 메뉴코드 기준 upsert(이름·상위 갱신).
 * - 엑셀에 없는 항목은 삭제하지 않고 유지하되, onlyOnWeb 목록으로 표시한다.
 */
export async function analyzeWbsExcelMerge(current: WbsData, file: File): Promise<WbsMergeAnalysis> {
    const buf = await file.arrayBuffer();
    let wb: XLSX.WorkBook;
    try {
        wb = XLSX.read(buf, { type: 'array' });
    } catch {
        throw new Error('엑셀 파일을 읽을 수 없습니다. 올바른 .xlsx 파일인지 확인해 주세요.');
    }
    // 재업로드용 코드 데이터는 '메뉴데이터' 시트에서 읽는다(구버전 호환: 평면 '메뉴구조' 시트도 허용).
    const menuWs = wb.Sheets['메뉴데이터'] || wb.Sheets['메뉴구조'];
    const detailWs = wb.Sheets['개발상세'];
    if (!menuWs && !detailWs) {
        throw new Error('‘메뉴데이터’ 또는 ‘개발상세’ 시트를 찾을 수 없습니다. 다운로드한 엑셀과 동일한 형식이어야 합니다.');
    }

    const menus: WbsMenuNode[] = current.menus.map((m) => ({ ...m }));
    const rows: WbsDevRow[] = current.rows.map((r) => ({ ...r }));
    const menuByCode = new Map<string, WbsMenuNode>(menus.map((m) => [m.menuCode, m]));
    const originalMenuCodes = new Set<string>(current.menus.map((m) => m.menuCode));
    const seenMenuCodes = new Set<string>();

    const summary: WbsMergeSummary = {
        menusAdded: 0, menusUpdated: 0, rowsAdded: 0, rowsUpdated: 0, rowsOnlyOnWeb: 0, menusOnlyOnWeb: 0, skipped: 0,
    };
    const addedRows: WbsDiffItem[] = [];
    const updatedRows: WbsDiffItem[] = [];

    // ── 1) 메뉴 upsert (메뉴코드 기준) ──
    if (menuWs) {
        const menuRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(menuWs, { raw: false, defval: '' });
        for (const mr of menuRows) {
            const code = cell(mr, '메뉴코드');
            if (!code) continue;
            seenMenuCodes.add(code);
            const name = cell(mr, '메뉴명') || '이름 없음';
            const programId = cell(mr, '프로그램ID');
            const existing = menuByCode.get(code);
            if (existing) {
                let changed = false;
                if (existing.name !== name) { existing.name = name; changed = true; }
                const nextProgramId = programId || undefined;
                if ((existing.programId ?? '') !== (nextProgramId ?? '')) {
                    existing.programId = nextProgramId;
                    changed = true;
                }
                if (changed) summary.menusUpdated++;
            } else {
                const created: WbsMenuNode = {
                    id: uid('menu'),
                    parentId: null,
                    name,
                    menuCode: code,
                    programId: programId || undefined,
                    order: 1_000_000 + summary.menusAdded,
                };
                menus.push(created);
                menuByCode.set(code, created);
                summary.menusAdded++;
            }
        }
        // 상위(부모) 코드 반영
        for (const mr of menuRows) {
            const code = cell(mr, '메뉴코드');
            if (!code) continue;
            const m = menuByCode.get(code);
            if (!m) continue;
            const parentCode = cell(mr, '상위메뉴코드');
            const parent = parentCode ? menuByCode.get(parentCode) : null;
            if (parentCode && !parent) continue;
            const newParentId = parent ? parent.id : null;
            if (m.parentId !== newParentId && m.id !== newParentId) m.parentId = newParentId;
        }
        // 부모별 order 정규화
        const orderByParent = new Map<string | null, number>();
        for (const m of menus.slice().sort((a, b) => a.order - b.order)) {
            const key = m.parentId ?? null;
            const idx = orderByParent.get(key) ?? 0;
            m.order = idx;
            orderByParent.set(key, idx + 1);
        }
    }

    const menuCodeById = new Map<string, string>(menus.map((m) => [m.id, m.menuCode]));
    const labelFor = (menuCode: string, category: string, featureName: string) =>
        `${menuCode || '?'} · ${featureName || category || '(미입력)'}`;

    // ── 2) 개발상세 upsert (ID 우선, 키 보조) ──
    const originalRowIds = new Set<string>(current.rows.map((r) => r.id));
    const seenRowIds = new Set<string>();
    if (detailWs) {
        const rowById = new Map<string, WbsDevRow>(rows.map((r) => [r.id, r]));
        const rowByKey = new Map<string, WbsDevRow>();
        for (const r of rows) rowByKey.set(rowKey(menuCodeById.get(r.menuId) ?? '', r.category, r.featureName), r);

        const detailRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(detailWs, { raw: false, defval: '' });
        for (const dr of detailRows) {
            const code = cell(dr, '메뉴코드');
            const menu = code ? menuByCode.get(code) : undefined;
            if (!menu) { summary.skipped++; continue; }
            const id = cell(dr, 'ID(수정금지)', 'ID');
            const category = cell(dr, '구분(산출물)', '구분');
            const featureName = cell(dr, '기능명');
            const next = {
                assignee: cell(dr, '담당자'),
                startDate: cell(dr, '시작일'),
                endDate: cell(dr, '종료일'),
                status: toStatus(dr['상태']),
                progress: Math.min(100, Math.max(0, Number(dr['진행율(%)'] ?? dr['진행율']) || 0)),
                note: cell(dr, '비고'),
            };

            let target: WbsDevRow | undefined;
            if (id && rowById.has(id)) target = rowById.get(id);
            else if (!id) target = rowByKey.get(rowKey(code, category, featureName)); // 보조 매칭

            if (target && !seenRowIds.has(target.id)) {
                Object.assign(target, next, { menuId: menu.id, category, featureName });
                seenRowIds.add(target.id);
                summary.rowsUpdated++;
                updatedRows.push({ label: labelFor(code, category, featureName) });
            } else {
                // 신규: 엑셀의 ID가 웹에 없으면 그 ID를 유지(재업로드 안정), 없으면 새로 발급
                const newId = id && !rowById.has(id) ? id : uid('row');
                const created: WbsDevRow = { id: newId, menuId: menu.id, category, featureName, ...next };
                rows.push(created);
                rowById.set(newId, created);
                rowByKey.set(rowKey(code, category, featureName), created);
                seenRowIds.add(newId);
                summary.rowsAdded++;
                addedRows.push({ label: labelFor(code, category, featureName) });
            }
        }
    }

    // ── 3) 엑셀에 없는(웹에만 있는) 항목 표시 (유지) ──
    const onlyOnWebRows: WbsDiffItem[] = rows
        .filter((r) => originalRowIds.has(r.id) && !seenRowIds.has(r.id))
        .map((r) => ({ label: labelFor(menuCodeById.get(r.menuId) ?? '', r.category, r.featureName) }));
    summary.rowsOnlyOnWeb = onlyOnWebRows.length;

    const onlyOnWebMenus: WbsDiffItem[] = menuWs
        ? menus
              .filter((m) => originalMenuCodes.has(m.menuCode) && !seenMenuCodes.has(m.menuCode))
              .map((m) => ({ label: `${m.menuCode} · ${m.name}` }))
        : [];
    summary.menusOnlyOnWeb = onlyOnWebMenus.length;

    return { data: { menus, rows }, summary, addedRows, updatedRows, onlyOnWebRows, onlyOnWebMenus };
}
