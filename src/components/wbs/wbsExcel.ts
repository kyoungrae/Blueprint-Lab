// xlsx-js-style: xlsx 호환 + 셀 스타일(fill/font/border) 지원 브라우저 라이브러리
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import XLSXStyle from 'xlsx-js-style';
import * as XLSX from 'xlsx';   // 업로드 파싱은 기존 xlsx 유지

import type { WbsData, WbsMenuNode, WbsDevRow, WbsStatus } from '../../types/wbs';
import { WBS_STATUS_LABEL, WBS_STATUS_ORDER, isWbsDebugingCategoryRow, normalizeWbsDevRowDebugging, normalizeWbsDevRows } from '../../types/wbs';
import { menuPathParts, menuDfsOrder, sortWbsDevRows, wbsPathDepth } from './wbsDevRowUtils';

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

/** 현재 WBS 상태를 엑셀(.xlsx)로 다운로드 */
export function downloadWbsExcel(data: WbsData, projectName: string): void {
    const { menus, rows } = data;
    const menuCodeById = new Map(menus.map((m) => [m.id, m.menuCode]));
    const menuOrder = menuDfsOrder(menus);
    const sortedRows = sortWbsDevRows(menus, rows);
    const pathDepth = wbsPathDepth(menus, sortedRows);

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
        const bg        = isWbsDebugingCategoryRow(r) ? palette.debug : palette.base;
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
            // 시작일·종료일 (YYYY-MM-DD → YYYY.MM.DD 표기)
            sc(toDotDate(r.startDate), cellStyle(bg, { alignment: { horizontal: 'center', vertical: 'center' } })),
            sc(toDotDate(r.endDate),   cellStyle(bg, { alignment: { horizontal: 'center', vertical: 'center' } })),
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
    /** 어떤 필드가 어떻게 바뀌었는지 (변경 전 → 후) — '수정' 항목에서 사용 */
    changes?: string[];
}

export interface WbsMergeAnalysis {
    data: WbsData;
    summary: WbsMergeSummary;
    addedRows: WbsDiffItem[];
    updatedRows: WbsDiffItem[];
    updatedMenus: WbsDiffItem[];
    /** 웹에만 있는 행 목록 (엑셀에 없음 → 유지하되 표시) */
    onlyOnWebRows: WbsDiffItem[];
    onlyOnWebMenus: WbsDiffItem[];
}

/** 엑셀 업로드 병합 범위 — 활성 탭에 따라 메뉴 또는 개발상세만 반영 */
export type WbsExcelMergeScope = 'menus' | 'rows';

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

/** 엑셀 행 → 기존 웹 행 매칭 (ID 우선, 키·메뉴+구분 보조 — 빈 기능명/담당자도 수정 가능, 중복 방지) */
function findMergeTarget(
    rows: WbsDevRow[],
    rowById: Map<string, WbsDevRow>,
    rowByKey: Map<string, WbsDevRow>,
    menuId: string,
    menuCode: string,
    category: string,
    featureName: string,
    excelId: string,
    seenRowIds: Set<string>,
): WbsDevRow | undefined {
    const available = (r?: WbsDevRow) => (r && !seenRowIds.has(r.id) ? r : undefined);

    if (excelId) {
        const byId = rowById.get(excelId);
        if (byId) return available(byId);
    }

    const byKey = rowByKey.get(rowKey(menuCode, category, featureName));
    if (byKey) return available(byKey);

    if (isWbsDebugingCategoryRow({ category })) {
        const dbg = rows.find((r) => r.menuId === menuId && isWbsDebugingCategoryRow(r));
        if (dbg) return available(dbg);
    }

    const sameCategory = rows.filter(
        (r) => r.menuId === menuId && r.category === category && !seenRowIds.has(r.id) && !isWbsDebugingCategoryRow(r),
    );
    if (sameCategory.length === 0) return undefined;

    const exactFn = sameCategory.find((r) => r.featureName === featureName);
    if (exactFn) return exactFn;

    const trimmedFn = featureName.trim();
    if (trimmedFn) {
        const emptyWeb = sameCategory.filter((r) => !r.featureName.trim());
        if (emptyWeb.length === 1) return emptyWeb[0];
    } else {
        const filledWeb = sameCategory.filter((r) => r.featureName.trim());
        if (filledWeb.length === 1) return filledWeb[0];
    }

    if (sameCategory.length === 1) return sameCategory[0];

    return undefined;
}

const cell = (dr: Record<string, unknown>, ...keys: string[]): string => {
    for (const k of keys) {
        if (dr[k] !== undefined && dr[k] !== null && String(dr[k]).trim() !== '') return String(dr[k]).trim();
    }
    return '';
};

/**
 * 엑셀에서 읽은 날짜 값을 화면(WheelDatePicker)이 이해하는 YYYY-MM-DD 형식으로 정규화한다.
 * - 엑셀에서 날짜 칸을 수정하면 형식이 제각각(2026. 7. 2 / 7/2/2026 / 날짜 일련번호 등)으로 저장되므로
 *   여기서 통일하지 않으면 웹 화면에 날짜가 표시되지 않는다.
 * - 파싱 불가한 값은 원본을 그대로 반환한다.
 */
function normalizeDate(v: string): string {
    let s = String(v ?? '').trim();
    if (!s) return '';

    const toIso = (y: number, m: number, d: number) => {
        if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return null;
        const yyyy = y < 100 ? 2000 + y : y;
        return `${yyyy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    };

    // 엑셀 날짜 일련번호(예: "46204")
    if (/^\d+(\.\d+)?$/.test(s)) {
        const serial = Number(s);
        // 20000(≈1954년) ~ 80000(≈2119년) 범위만 날짜로 간주 (진행율 등 일반 숫자 오인 방지)
        if (serial > 20000 && serial < 80000) {
            const parsed = (XLSX as { SSF?: { parse_date_code?: (n: number) => { y: number; m: number; d: number } | null } }).SSF?.parse_date_code?.(serial);
            if (parsed && parsed.y) {
                const iso = toIso(parsed.y, parsed.m, parsed.d);
                if (iso) return iso;
            }
        }
        return s;
    }

    // 시간 부분 제거 후 공백 제거 ("2026-07-02 00:00:00", "2026. 7. 2" 등)
    s = s.split(/[T ]/)[0].replace(/\s/g, '');

    const m = s.match(/^(\d{1,4})[.\-/](\d{1,2})[.\-/](\d{1,4})$/);
    if (m) {
        const [, a, b, c] = m;
        let iso: string | null;
        if (a.length === 4) {
            // YYYY-MM-DD
            iso = toIso(parseInt(a, 10), parseInt(b, 10), parseInt(c, 10));
        } else {
            // MM-DD-YYYY / M/D/YY (미국식 가정)
            iso = toIso(parseInt(c, 10), parseInt(a, 10), parseInt(b, 10));
        }
        if (iso) return iso;
    }

    return s;
}

/** 시작일·종료일 엑셀 병합: 빈→insert, 값→update, 웹에 값 있는데 엑셀 빈값→삭제 불가(기존 유지) */
function mergeDateFromExcel(existing: string, fromExcel: string): string {
    const excel = fromExcel.trim();
    if (excel) return excel;
    const current = existing.trim();
    if (current) return existing;
    return '';
}

/** 저장 형식(YYYY-MM-DD)을 엑셀 표기용 YYYY.MM.DD로 변환. 형식이 다르면 원본 유지 */
function toDotDate(v: string): string {
    const s = String(v ?? '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[1]}.${m[2]}.${m[3]}` : s;
}

/** 변경 내역 표시용: 빈 값은 (빈값)으로 감싼다 */
const quote = (v: string) => (v && v.length ? `'${v}'` : '(빈값)');

/**
 * 다운로드한 형식의 엑셀(.xlsx)을 읽어 현재 WBS 데이터와 비교 분석한다.
 * - scope 'menus': 메뉴 구조도 탭 — 메뉴데이터 시트만 병합, 개발상세(rows)는 변경하지 않음
 * - scope 'rows': 개발 상세 탭 — 개발상세 시트만 병합, 메뉴(menus)는 변경하지 않음
 * - 엑셀에 없는 항목은 삭제하지 않고 유지 (추가·수정만)
 */
export async function analyzeWbsExcelMerge(current: WbsData, file: File, scope: WbsExcelMergeScope): Promise<WbsMergeAnalysis> {
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
    if (scope === 'menus' && !menuWs) {
        throw new Error('‘메뉴데이터’ 또는 ‘메뉴구조’ 시트를 찾을 수 없습니다. 메뉴 구조도 탭에서 업로드할 때는 메뉴 시트가 포함된 엑셀이어야 합니다.');
    }
    if (scope === 'rows' && !detailWs) {
        throw new Error('‘개발상세’ 시트를 찾을 수 없습니다. 개발 상세 탭에서 업로드할 때는 개발상세 시트가 포함된 엑셀이어야 합니다.');
    }

    const menus: WbsMenuNode[] = current.menus.map((m) => ({ ...m }));
    const rows: WbsDevRow[] = current.rows.map((r) => ({ ...r }));
    const menuById = new Map<string, WbsMenuNode>(menus.map((m) => [m.id, m]));
    const menuByCode = new Map<string, WbsMenuNode>(menus.map((m) => [m.menuCode, m]));
    const originalMenuIds = new Set<string>(current.menus.map((m) => m.id));
    const seenMenuIds = new Set<string>();

    const summary: WbsMergeSummary = {
        menusAdded: 0, menusUpdated: 0, rowsAdded: 0, rowsUpdated: 0, rowsOnlyOnWeb: 0, menusOnlyOnWeb: 0, skipped: 0,
    };
    const addedRows: WbsDiffItem[] = [];
    const updatedRows: WbsDiffItem[] = [];
    const updatedMenus: WbsDiffItem[] = [];
    // 메뉴별 변경 내역 (메뉴명·코드·PID·상위(계층) 변경을 한 곳에 모아 집계/표시)
    const menuChanges = new Map<string, string[]>();
    const addMenuChange = (id: string, change: string) => {
        const arr = menuChanges.get(id);
        if (arr) arr.push(change);
        else menuChanges.set(id, [change]);
    };

    const applyMenuFields = (
        existing: WbsMenuNode,
        fields: { name: string; menuCode: string; programId?: string },
    ): void => {
        if (existing.name !== fields.name) {
            addMenuChange(existing.id, `메뉴명 ${quote(existing.name)} → ${quote(fields.name)}`);
            existing.name = fields.name;
        }

        if (fields.menuCode && existing.menuCode !== fields.menuCode) {
            const conflict = menuByCode.get(fields.menuCode);
            if (conflict && conflict.id !== existing.id) {
                summary.skipped++;
            } else {
                addMenuChange(existing.id, `코드 ${quote(existing.menuCode)} → ${quote(fields.menuCode)}`);
                menuByCode.delete(existing.menuCode);
                existing.menuCode = fields.menuCode;
                menuByCode.set(fields.menuCode, existing);
            }
        }

        const nextProgramId = fields.programId;
        if ((existing.programId ?? '') !== (nextProgramId ?? '')) {
            addMenuChange(existing.id, nextProgramId ? `프로그램ID ${quote(existing.programId ?? '')} → ${quote(nextProgramId)}` : '프로그램ID 삭제');
            existing.programId = nextProgramId;
        }
    };

    // ── 1) 메뉴 upsert — 메뉴 구조도 탭에서만 ──
    if (scope === 'menus' && menuWs) {
        const menuRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(menuWs, { raw: false, defval: '' });
        for (const mr of menuRows) {
            const id = cell(mr, 'ID(수정금지)', 'ID');
            const code = cell(mr, '메뉴코드');
            if (!id && !code) continue;

            const name = cell(mr, '메뉴명') || '이름 없음';
            const programId = cell(mr, '프로그램ID') || undefined;

            let existing: WbsMenuNode | undefined;
            if (id && menuById.has(id)) {
                existing = menuById.get(id);
            } else if (code) {
                existing = menuByCode.get(code);
            }

            if (existing) {
                seenMenuIds.add(existing.id);
                applyMenuFields(existing, { name, menuCode: code || existing.menuCode, programId });
            } else {
                const newId = id && !menuById.has(id) ? id : uid('menu');
                const newCode = code || `MENU-${String(summary.menusAdded + 1).padStart(4, '0')}`;
                if (menuByCode.has(newCode)) {
                    summary.skipped++;
                    continue;
                }
                const created: WbsMenuNode = {
                    id: newId,
                    parentId: null,
                    name,
                    menuCode: newCode,
                    programId,
                    order: 1_000_000 + summary.menusAdded,
                };
                menus.push(created);
                menuById.set(newId, created);
                menuByCode.set(newCode, created);
                seenMenuIds.add(newId);
                summary.menusAdded++;
            }
        }
        // 상위(부모) 코드 반영 — 계층(상위 메뉴) 변경도 감지·집계한다
        for (const mr of menuRows) {
            const code = cell(mr, '메뉴코드');
            if (!code) continue;
            const m = menuByCode.get(code);
            if (!m) continue;
            const parentCode = cell(mr, '상위메뉴코드');
            const parent = parentCode ? menuByCode.get(parentCode) : null;
            if (parentCode && !parent) continue;
            const newParentId = parent ? parent.id : null;
            if (m.parentId !== newParentId && m.id !== newParentId) {
                // 기존 메뉴의 계층 변경만 '수정'으로 집계 (신규 메뉴는 추가로 이미 집계됨)
                if (originalMenuIds.has(m.id)) {
                    const oldParentCode = m.parentId ? (menuById.get(m.parentId)?.menuCode ?? '') : '';
                    const newParentCode = parent ? parent.menuCode : '';
                    addMenuChange(m.id, `상위 ${oldParentCode ? `'${oldParentCode}'` : '(최상위)'} → ${newParentCode ? `'${newParentCode}'` : '(최상위)'}`);
                }
                m.parentId = newParentId;
            }
        }
        // 부모별 order 정규화
        const orderByParent = new Map<string | null, number>();
        for (const m of menus.slice().sort((a, b) => a.order - b.order)) {
            const key = m.parentId ?? null;
            const idx = orderByParent.get(key) ?? 0;
            m.order = idx;
            orderByParent.set(key, idx + 1);
        }
        // 메뉴 변경 내역 → 요약/미리보기 반영
        for (const [id, changes] of menuChanges) {
            const m = menuById.get(id);
            updatedMenus.push({ label: m ? `${m.menuCode} · ${m.name}` : id, changes });
        }
        summary.menusUpdated = menuChanges.size;
    }

    const menuCodeById = new Map<string, string>(menus.map((m) => [m.id, m.menuCode]));
    const labelFor = (menuCode: string, category: string, featureName: string) =>
        `${menuCode || '?'} · ${featureName || category || menuByCode.get(menuCode)?.name || '(미입력)'}`;

    // ── 2) 개발상세 upsert — 개발 상세 탭에서만 ──
    const originalRowIds = new Set<string>(current.rows.map((r) => r.id));
    const seenRowIds = new Set<string>();
    if (scope === 'rows' && detailWs) {
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
            const excelStart = normalizeDate(cell(dr, '시작일'));
            const excelEnd = normalizeDate(cell(dr, '종료일'));
            const next = {
                assignee: cell(dr, '담당자'),
                startDate: excelStart,
                endDate: excelEnd,
                status: toStatus(dr['상태']),
                progress: Math.min(100, Math.max(0, Number(dr['진행율(%)'] ?? dr['진행율']) || 0)),
                note: cell(dr, '비고'),
            };

            let target: WbsDevRow | undefined = findMergeTarget(
                rows, rowById, rowByKey, menu.id, code, category, featureName, id, seenRowIds,
            );

            if (target) {
                next.startDate = mergeDateFromExcel(target.startDate, excelStart);
                next.endDate = mergeDateFromExcel(target.endDate, excelEnd);
                // 실제 값이 바뀐 필드만 수집 (동일 파일 재업로드 시 오탐 방지 + 변경 내역 표시)
                const q = (v: string) => (v && v.length ? `'${v}'` : '(빈값)');
                const changes: string[] = [];
                if (target.menuId !== menu.id) {
                    changes.push(`메뉴 ${q(menuCodeById.get(target.menuId) ?? '')} → ${q(code)}`);
                }
                if (target.category !== category) changes.push(`구분 ${q(target.category)} → ${q(category)}`);
                if (target.featureName !== featureName) changes.push(`기능명 ${q(target.featureName)} → ${q(featureName)}`);
                if (target.assignee !== next.assignee) changes.push(`담당자 ${q(target.assignee)} → ${q(next.assignee)}`);
                if (target.startDate !== next.startDate) changes.push(`시작일 ${q(target.startDate)} → ${q(next.startDate)}`);
                if (target.endDate !== next.endDate) changes.push(`종료일 ${q(target.endDate)} → ${q(next.endDate)}`);
                if (target.status !== next.status) {
                    changes.push(`상태 '${WBS_STATUS_LABEL[target.status]}' → '${WBS_STATUS_LABEL[next.status]}'`);
                }
                if (target.progress !== next.progress) changes.push(`진행율 ${target.progress}% → ${next.progress}%`);
                if ((target.note ?? '') !== (next.note ?? '')) changes.push(`비고 ${q(target.note ?? '')} → ${q(next.note ?? '')}`);

                Object.assign(target, next, { menuId: menu.id, category, featureName });
                Object.assign(target, normalizeWbsDevRowDebugging(target));
                rowByKey.set(rowKey(code, category, featureName), target);
                seenRowIds.add(target.id);
                if (changes.length > 0) {
                    summary.rowsUpdated++;
                    updatedRows.push({ label: labelFor(code, category, featureName), changes });
                }
            } else {
                // 신규: 엑셀의 ID가 웹에 없으면 그 ID를 유지(재업로드 안정), 없으면 새로 발급
                const newId = id && !rowById.has(id) ? id : uid('row');
                const created: WbsDevRow = normalizeWbsDevRowDebugging({ id: newId, menuId: menu.id, category, featureName, ...next });
                rows.push(created);
                rowById.set(newId, created);
                rowByKey.set(rowKey(code, category, featureName), created);
                seenRowIds.add(newId);
                summary.rowsAdded++;
                addedRows.push({ label: labelFor(code, category, featureName) });
            }
        }
    }

    // ── 3) 엑셀에 없는(웹에만 있는) 항목 표시 (유지, 삭제 없음) ──
    const onlyOnWebRows: WbsDiffItem[] = scope === 'rows'
        ? rows
              .filter((r) => originalRowIds.has(r.id) && !seenRowIds.has(r.id))
              .map((r) => ({ label: labelFor(menuCodeById.get(r.menuId) ?? '', r.category, r.featureName) }))
        : [];
    summary.rowsOnlyOnWeb = onlyOnWebRows.length;

    const onlyOnWebMenus: WbsDiffItem[] = scope === 'menus'
        ? menus
              .filter((m) => originalMenuIds.has(m.id) && !seenMenuIds.has(m.id))
              .map((m) => ({ label: `${m.menuCode} · ${m.name}` }))
        : [];
    summary.menusOnlyOnWeb = onlyOnWebMenus.length;

    return { data: { menus, rows: normalizeWbsDevRows(rows) }, summary, addedRows, updatedRows, updatedMenus, onlyOnWebRows, onlyOnWebMenus };
}
