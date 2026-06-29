/**
 * SYS_MENU INSERT SQL → WBS 엑셀(메뉴구조 + 메뉴데이터) 단일 파일 생성
 * 실행: node scripts/generate_mvims_menu_excel.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSXStyle from 'xlsx-js-style';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SQL_PATH = path.join(ROOT, 'docs/source/MVIMS_SYS_MENU_inserts.sql');
const OUT_PATH = path.join(ROOT, 'docs/MVIMS_메뉴구조도_WBS.xlsx');

const INSERT_RE =
    /VALUES\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*(\d+)\s*,\s*([^,]+)\s*,\s*'([^']*)'\s*\)/gi;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // 참고용

function assignMenuCode(rawCode, usedCodes) {
    const code = (rawCode || '').trim();
    if (code) {
        usedCodes.add(code);
        return code;
    }
    const generated = nextMenuCode(usedCodes);
    usedCodes.add(generated);
    return generated;
}

function nextMenuCode(used) {
    let max = 0;
    for (const c of used) {
        const m = /^MENU-(\d+)$/.exec(c);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    let n = max + 1;
    while (used.has(`MENU-${String(n).padStart(4, '0')}`)) n++;
    return `MENU-${String(n).padStart(4, '0')}`;
}

function parseSql(text) {
    const raw = [];
    let m;
    while ((m = INSERT_RE.exec(text)) !== null) {
        raw.push({
            menuCd: m[1],
            nameKr: m[2],
            menuNo: parseInt(m[5], 10) || 0,
            menuLvl: parseInt(m[6], 10) || 0,
            topMenuCd: m[7] === '-' ? null : m[7],
            url: m[8],
            useYn: m[9] === '1',
            menuUnqNo: parseInt(m[14], 10),
            prgmUrl: m[16],
        });
    }
    return raw;
}

/** SYS_MENU → WBS WbsMenuNode (menuCode/name 없으면 MENU-XXXX / 이름 없음 생성) */
function toWbsMenus(raw) {
    const usedCodes = new Set();
    const codeMap = new Map(); // 원본 MENU_CD → WBS menuCode

    for (const r of raw) {
        codeMap.set(r.menuCd, assignMenuCode(r.menuCd, usedCodes));
    }

    const menus = [];
    for (const r of raw) {
        const menuCode = codeMap.get(r.menuCd);
        const name = (r.nameKr || '').trim() || '이름 없음';
        const parentOrig = r.topMenuCd;
        const parentCode = parentOrig ? (codeMap.get(parentOrig) ?? parentOrig) : '';

        let programId = (r.prgmUrl || '').trim();
        if (programId === '-') programId = '';

        const id = `mvims_${menuCode.replace(/[^a-zA-Z0-9_]/g, '_')}`;

        menus.push({
            id,
            parentId: null,
            name,
            menuCode,
            order: r.menuNo,
            programId: programId || undefined,
            _parentMenuCode: parentCode,
            _useYn: r.useYn,
            _sourceMenuCd: r.menuCd,
            _url: r.url,
        });
    }

    const codeToId = new Map(menus.map((m) => [m.menuCode, m.id]));
    for (const m of menus) {
        m.parentId = m._parentMenuCode ? (codeToId.get(m._parentMenuCode) ?? null) : null;
    }

    const byParent = new Map();
    for (const m of menus) {
        const k = m.parentId ?? '__root__';
        if (!byParent.has(k)) byParent.set(k, []);
        byParent.get(k).push(m);
    }
    for (const list of byParent.values()) {
        list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ko'));
        list.forEach((m, i) => { m.order = i; });
    }

    return menus;
}

function menuPath(menus, id) {
    const byId = new Map(menus.map((m) => [m.id, m]));
    const parts = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 100) {
        parts.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(' > ');
}

function menuDfsOrder(menus) {
    const byParent = new Map();
    for (const m of menus) {
        const k = m.parentId ?? null;
        if (!byParent.has(k)) byParent.set(k, []);
        byParent.get(k).push(m);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);
    const order = new Map();
    let idx = 0;
    const dfs = (pid) => {
        for (const m of byParent.get(pid) ?? []) {
            order.set(m.id, idx++);
            dfs(m.id);
        }
    };
    dfs(null);
    return order;
}

function buildMenuTreeSheet(menus) {
    const byParent = new Map();
    for (const m of menus) {
        const k = m.parentId ?? null;
        if (!byParent.has(k)) byParent.set(k, []);
        byParent.get(k).push(m);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);

    const aoa = [];
    const merges = [];
    let maxDepth = 0;

    const ensureRow = (r) => {
        while (aoa.length <= r) aoa.push([]);
        return aoa[r];
    };

    const dfs = (node, depth) => {
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

function sc(v, s) {
    const cell = { v: String(v ?? ''), t: 's' };
    if (s) cell.s = s;
    return cell;
}

function hdrStyle(align = 'center') {
    return {
        fill: { patternType: 'solid', fgColor: { rgb: '1E293B' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10, name: '맑은 고딕' },
        alignment: { vertical: 'center', horizontal: align, wrapText: true },
        border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } },
    };
}

function cellStyle(bg, extra = {}) {
    return {
        fill: { patternType: 'solid', fgColor: { rgb: bg } },
        font: { name: '맑은 고딕', sz: 9, ...(extra.font || {}) },
        alignment: { vertical: 'center', horizontal: 'left', wrapText: true, ...(extra.alignment || {}) },
        border: {
            bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
            right: { style: 'thin', color: { rgb: 'E2E8F0' } },
        },
        ...extra,
    };
}

function writeExcel(menus, outPath) {
    const menuOrder = menuDfsOrder(menus);
    const { aoa, merges, maxDepth } = buildMenuTreeSheet(menus);

    // 시트1: 개발상세 (헤더만 — 메뉴 구조도 전용)
    const detailHdr = [
        'ID(수정금지)', '메뉴코드', '구분(산출물)', '기능명', '담당자',
        '시작일', '종료일', '상태', '진행율(%)', '비고',
    ].map((v) => sc(v, hdrStyle('center')));
    const ws1 = XLSXStyle.utils.aoa_to_sheet([detailHdr]);
    ws1['!cols'] = Array.from({ length: 10 }, () => ({ wch: 14 }));

    // 시트2: 메뉴구조
    const treeHdr = Array.from({ length: maxDepth + 1 }, (_, i) => sc(`${i + 1} Depth`, hdrStyle('left')));
    const treeBody = aoa.map((row) =>
        Array.from({ length: maxDepth + 1 }, (_, i) => sc(row[i] ?? '', cellStyle('FFFFFF')))
    );
    const ws2 = XLSXStyle.utils.aoa_to_sheet([treeHdr, ...treeBody]);
    ws2['!cols'] = Array.from({ length: maxDepth + 1 }, () => ({ wch: 24 }));
    ws2['!merges'] = merges.map((m) => ({ s: { r: m.s.r + 1, c: m.s.c }, e: { r: m.e.r + 1, c: m.e.c } }));

    // 시트3: 메뉴데이터
    const menuHdr = ['ID(수정금지)', '메뉴코드', '메뉴명', '프로그램ID', '전체경로', '상위메뉴코드', '원본MENU_CD', '사용여부'].map((v) =>
        sc(v, hdrStyle('left'))
    );
    const sorted = [...menus].sort((a, b) => (menuOrder.get(a.id) ?? 0) - (menuOrder.get(b.id) ?? 0));
    const menuBody = sorted.map((m) => [
        sc(m.id, cellStyle('FFFFFF', { font: { name: '맑은 고딕', sz: 8, color: { rgb: '94A3B8' } } })),
        sc(m.menuCode, cellStyle('FFFFFF', { font: { name: '맑은 고딕', sz: 9, bold: true, color: { rgb: '4F46E5' } } })),
        sc(m.name, cellStyle('FFFFFF')),
        sc(m.programId ?? '', cellStyle('FFFFFF', { font: { color: { rgb: '64748B' } } })),
        sc(menuPath(menus, m.id), cellStyle('F8FAFC')),
        sc(m._parentMenuCode, cellStyle('FFFFFF')),
        sc(m._sourceMenuCd, cellStyle('FFFFFF', { font: { sz: 8, color: { rgb: '94A3B8' } } })),
        sc(m._useYn ? 'Y' : 'N', cellStyle(m._useYn ? 'FFFFFF' : 'FEF2F2')),
    ]);
    const ws3 = XLSXStyle.utils.aoa_to_sheet([menuHdr, ...menuBody]);
    ws3['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 42 }, { wch: 22 }, { wch: 28 }, { wch: 8 }];

    const wb = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, ws1, '개발상세');
    XLSXStyle.utils.book_append_sheet(wb, ws2, '메뉴구조');
    XLSXStyle.utils.book_append_sheet(wb, ws3, '메뉴데이터');
    XLSXStyle.writeFile(wb, outPath);
}

const sql = fs.readFileSync(SQL_PATH, 'utf8');
const raw = parseSql(sql);
const menus = toWbsMenus(raw);
writeExcel(menus, OUT_PATH);

console.log(`✓ ${raw.length}개 SYS_MENU → ${menus.length}개 WBS 메뉴`);
console.log(`✓ 저장: ${OUT_PATH}`);
console.log(`  - 시트: 개발상세(헤더), 메뉴구조, 메뉴데이터`);
const generated = menus.filter((m) => /^MENU-\d{4}$/.test(m.menuCode));
if (generated.length) {
    console.log(`  - MENU-XXXX 신규 부여: ${generated.length}개`);
}
