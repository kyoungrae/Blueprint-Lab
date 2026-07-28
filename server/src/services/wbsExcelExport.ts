/**
 * WBS 엑셀 export (프론트 wbsExcel.ts downloadWbsExcel 과 동일한 3시트 구조)
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import XLSXStyle from 'xlsx-js-style';
import * as XLSX from 'xlsx';

type WbsStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'HOLD';

interface WbsMenuNode {
    id: string;
    parentId: string | null;
    name: string;
    menuCode: string;
    programId?: string;
    order: number;
}

interface WbsDevRow {
    id: string;
    menuId: string;
    category: string;
    featureName: string;
    assignee: string;
    startDate: string;
    endDate: string;
    actualStartDate?: string;
    actualEndDate?: string;
    actualWorkDate?: string;
    status: WbsStatus;
    progress: number;
    note?: string;
    isDebugging?: boolean;
}

export interface WbsDetailPayload {
    menus: WbsMenuNode[];
    rows: WbsDevRow[];
}

const WBS_STATUS_LABEL: Record<WbsStatus, string> = {
    TODO: '대기',
    IN_PROGRESS: '진행중',
    DONE: '완료',
    HOLD: '보류',
};

type XStyle = {
    fill?: { patternType: 'solid'; fgColor: { rgb: string } };
    font?: { bold?: boolean; color?: { rgb: string }; sz?: number; name?: string };
    border?: { bottom?: { style: string; color: { rgb: string } }; right?: { style: string; color: { rgb: string } } };
    alignment?: { vertical?: string; horizontal?: string; wrapText?: boolean };
};
type XCell = { v: string | number; t: 's' | 'n'; s?: XStyle };
type XAoa = (XCell | null)[][];

const CATEGORY_ORDER = ['Controller', 'Service', 'ServiceImpl', 'VO', 'Mapper', 'Html', 'Debuging', '기능'];

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

    const dfs = (node: WbsMenuNode, depth: number): { start: number; end: number } => {
        if (depth > maxDepth) maxDepth = depth;
        const children = byParent.get(node.id) ?? [];
        if (children.length === 0) {
            const r = aoa.length;
            ensureRow(r)[depth] = node.name;
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

function toDotDate(v: string): string {
    const s = String(v ?? '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[1]}.${m[2]}.${m[3]}` : s;
}

/** 브라우저 개발 상세의 수행일 계산과 동일하게 시작·종료일을 포함해 계산한다. */
function formatWbsDuration(startDate: string, endDate: string): string {
    const toUtcDay = (value: string): number | null => {
        const match = String(value ?? '').trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
        return date.getTime();
    };
    const start = toUtcDay(startDate);
    const end = toUtcDay(endDate);
    if (start === null || end === null || end < start) return '';
    return `${Math.floor((end - start) / 86_400_000) + 1}일`;
}

export function buildWbsExcelBuffer(data: WbsDetailPayload, projectName: string): Buffer {
    const { menus, rows } = data;
    const menuCodeById = new Map(menus.map((m) => [m.id, m.menuCode]));
    const menuOrder = menuDfsOrder(menus);

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

    const GROUP_PALETTES = [
        { base: 'EFF6FF', debug: 'DBEAFE' },
        { base: 'F9FAFB', debug: 'F3F4F6' },
    ];
    const HEADER_BG = '1E293B';
    const HEADER_FG = 'FFFFFF';
    const BORDER_CLR = 'E2E8F0';

    const statusFgColors: Record<string, string> = {
        완료: '059669', 진행중: '2563EB', 보류: 'D97706', 대기: '6B7280',
    };

    const hdrStyle = (align: 'center' | 'left' = 'center'): XStyle => ({
        fill: { patternType: 'solid', fgColor: { rgb: HEADER_BG } },
        font: { bold: true, color: { rgb: HEADER_FG }, sz: 10, name: '맑은 고딕' },
        border: { bottom: { style: 'thin', color: { rgb: '334155' } }, right: { style: 'thin', color: { rgb: '334155' } } },
        alignment: { vertical: 'center', horizontal: align, wrapText: false },
    });

    const cellStyle = (bg: string, extra?: Partial<XStyle>): XStyle => ({
        fill: { patternType: 'solid', fgColor: { rgb: bg } },
        font: { name: '맑은 고딕', sz: 9, ...extra?.font },
        border: { bottom: { style: 'thin', color: { rgb: BORDER_CLR } }, right: { style: 'thin', color: { rgb: BORDER_CLR } } },
        alignment: { vertical: 'center', wrapText: false, ...extra?.alignment },
        ...extra,
    });

    const sc = (v: string | number, s: XStyle): XCell =>
        ({ v, t: typeof v === 'number' ? 'n' : 's', s });

    const detailAoa: XAoa = [];
    const hdrLabels = [
        'ID(수정금지)',
        ...Array.from({ length: pathDepth }, () => '메뉴경로'),
        '메뉴코드', '구분(산출물)', '기능명', '담당자', '시작일', '종료일', '수행일', '실적 시작일', '실적 종료일', '실적 수행일', '상태', '진행율(%)', '비고',
    ];
    detailAoa.push(hdrLabels.map((v) => sc(v, hdrStyle())));

    let groupColorIdx = -1;
    let lastMenuId = '';

    for (const r of sortedRows) {
        if (r.menuId !== lastMenuId) { groupColorIdx = (groupColorIdx + 1) % GROUP_PALETTES.length; lastMenuId = r.menuId; }
        const palette = GROUP_PALETTES[groupColorIdx];
        const bg = r.isDebugging ? palette.debug : palette.base;
        const parts = menuPathParts(menus, r.menuId);
        const statusLbl = WBS_STATUS_LABEL[r.status] ?? '대기';
        const sfg = statusFgColors[statusLbl] ?? '6B7280';

        detailAoa.push([
            sc(r.id, cellStyle(bg, { font: { name: '맑은 고딕', sz: 8, color: { rgb: '94A3B8' } } })),
            ...Array.from({ length: pathDepth }, (_, i) => sc(parts[i] ?? '', cellStyle(bg))),
            sc(menuCodeById.get(r.menuId) ?? '', cellStyle(bg, { font: { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: '4F46E5' } }, alignment: { horizontal: 'center', vertical: 'center' } })),
            sc(r.category, cellStyle(bg)),
            sc(r.featureName, cellStyle(bg)),
            sc(r.assignee, cellStyle(bg)),
            sc(toDotDate(r.startDate), cellStyle(bg, { alignment: { horizontal: 'center', vertical: 'center' } })),
            sc(toDotDate(r.endDate), cellStyle(bg, { alignment: { horizontal: 'center', vertical: 'center' } })),
            sc(formatWbsDuration(r.startDate, r.endDate), cellStyle(bg, { alignment: { horizontal: 'center', vertical: 'center' } })),
            sc(toDotDate(r.actualStartDate ?? ''), cellStyle(bg, { alignment: { horizontal: 'center', vertical: 'center' } })),
            sc(toDotDate(r.actualEndDate ?? ''), cellStyle(bg, { alignment: { horizontal: 'center', vertical: 'center' } })),
            sc(r.actualWorkDate || formatWbsDuration(r.actualStartDate ?? '', r.actualEndDate ?? ''), cellStyle(bg, { alignment: { horizontal: 'center', vertical: 'center' } })),
            sc(statusLbl, cellStyle(bg, { font: { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: sfg } }, alignment: { horizontal: 'center', vertical: 'center' } })),
            sc(r.progress, cellStyle(bg, { font: { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: r.progress === 100 ? '059669' : '374151' } }, alignment: { horizontal: 'center', vertical: 'center' } })),
            sc(r.note ?? '', cellStyle(bg)),
        ]);
    }

    const ws1 = XLSXStyle.utils.aoa_to_sheet(detailAoa);
    ws1['!cols'] = [
        { wch: 22 },
        ...Array.from({ length: pathDepth }, () => ({ wch: 18 })),
        { wch: 13 }, { wch: 13 }, { wch: 26 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 22 },
    ];
    ws1['!rows'] = [{ hpt: 22 }];
    ws1['!freeze'] = { xSplit: 0, ySplit: 1 };

    const { aoa, merges, maxDepth } = buildMenuTreeSheet(menus);
    const treeHdr = Array.from({ length: maxDepth + 1 }, (_, i) => sc(`${i + 1}단계`, hdrStyle()));
    const treeAoa: XAoa = [treeHdr, ...aoa.map((row) =>
        Array.from({ length: maxDepth + 1 }, (_, i) => sc(row[i] ?? '', cellStyle('FFFFFF')))
    )];
    const ws2 = XLSXStyle.utils.aoa_to_sheet(treeAoa);
    ws2['!cols'] = Array.from({ length: maxDepth + 1 }, () => ({ wch: 22 }));
    ws2['!merges'] = merges.map((m) => ({ s: { r: m.s.r + 1, c: m.s.c }, e: { r: m.e.r + 1, c: m.e.c } }));

    const menuHdr = ['ID(수정금지)', '메뉴코드', '메뉴명', '프로그램ID', '전체경로', '상위메뉴코드'].map((v) => sc(v, hdrStyle('left')));
    const menuBodyAoa: XAoa = [menuHdr, ...menus
        .slice()
        .sort((a, b) => (menuOrder.get(a.id) ?? 0) - (menuOrder.get(b.id) ?? 0))
        .map((m) => [
            sc(m.id, cellStyle('FFFFFF', { font: { name: '맑은 고딕', sz: 8, color: { rgb: '94A3B8' } } })),
            sc(m.menuCode, cellStyle('FFFFFF', { font: { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: '4F46E5' } } })),
            sc(m.name, cellStyle('FFFFFF')),
            sc(m.programId ?? '', cellStyle('FFFFFF', { font: { name: '맑은 고딕', sz: 9, color: { rgb: '64748B' } } })),
            sc(menuPath(menus, m.id), cellStyle('F8FAFC')),
            sc(m.parentId ? (menus.find((x) => x.id === m.parentId)?.menuCode ?? '') : '', cellStyle('FFFFFF')),
        ])
    ];
    const ws3 = XLSXStyle.utils.aoa_to_sheet(menuBodyAoa);
    ws3['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 40 }, { wch: 14 }];

    const wb = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, ws1, '개발상세');
    XLSXStyle.utils.book_append_sheet(wb, ws2, '메뉴구조');
    XLSXStyle.utils.book_append_sheet(wb, ws3, '메뉴데이터');

    const safeName = (projectName || 'WBS').replace(/[\\/:*?"<>|]/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    void safeName;
    void today;

    return XLSXStyle.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function wbsExcelDownloadName(projectName: string): string {
    const safeName = (projectName || 'WBS').replace(/[\\/:*?"<>|]/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    return `${safeName}_WBS_${today}.xlsx`;
}
