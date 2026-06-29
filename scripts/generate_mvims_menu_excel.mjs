/**
 * WBS 엑셀(메뉴구조도) + SYS_MENU 매핑 → 통합 엑셀 생성
 *
 * 기준 파일: MVISM WBS 일정 관리_WBS_*.xlsx (메뉴데이터·개발상세·트리 구조 유지)
 * SYS_MENU SQL: 메뉴명 일치 시 프로그램ID(MENU_CD) 자동 보강
 *
 * 실행:
 *   node scripts/generate_mvims_menu_excel.mjs [기준엑셀경로]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import XLSXStyle from 'xlsx-js-style';
import { buildProgramId, ensureUnique } from './menuNameEncoder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SRC = '/Users/ikyoungtae/Downloads/MVISM WBS 일정 관리_WBS_2026-06-29(1).xlsx';
const SQL_PATH = path.join(ROOT, 'docs/source/MVIMS_SYS_MENU_inserts.sql');
const OUT_PATH = path.join(ROOT, 'docs/MVIMS_메뉴구조도_WBS.xlsx');

const INSERT_RE =
    /VALUES\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*(\d+)\s*,\s*([^,]+)\s*,\s*'([^']*)'\s*\)/gi;

const STATUS_LABEL = { TODO: '대기', IN_PROGRESS: '진행중', DONE: '완료', HOLD: '보류' };
const LABEL_STATUS = Object.fromEntries(Object.entries(STATUS_LABEL).map(([k, v]) => [v, k]));

const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();

/** WBS 메뉴명 ↔ SYS_MENU 메뉴명 — 띄어쓰기·표기 차이만 (의미 다른 메뉴는 별칭 금지) */
const NAME_ALIASES = new Map([
    [norm('공지사항'), '공지 게시판'],
    [norm('공지 사항'), '공지 게시판'],
    [norm('자유게시판'), '자유게시판'],
    [norm('자유 게시판'), '자유게시판'],
    [norm('차량번호변경신청내역'), '차량번호 변경 신청 내역'],
    [norm('번호판재발급신청내역'), '번호판 재발급 신청 내역'],
    [norm('등록증재발급신청내역'), '자동차 등록증 재발급 신청 내역'],
    [norm('전자업무최종처리'), '전자업무 최종처리'],
    [norm('사용자목록'), '사용자 목록'],
    [norm('사용자등록신청'), '사용자 등록 신청'],
    [norm('메뉴관리'), '메뉴설정'],
    [norm('코드설정'), '코드설정'],
    [norm('그룹설정'), '그룹설정'],
    [norm('소속설정'), '소속설정'],
]);

function isSemanticSysCd(cd) {
    if (!cd) return false;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cd)) return false;
    return /^[A-Za-z][A-Za-z0-9_]*$/.test(cd);
}

function normalizeSysCd(cd) {
    if (/^[a-z][a-zA-Z0-9]*$/.test(cd)) return cd.toUpperCase();
    return cd;
}

function parseSql(text) {
    const rows = [];
    let m;
    while ((m = INSERT_RE.exec(text)) !== null) {
        rows.push({
            menuCd: m[1],
            nameKr: m[2].trim(),
            useYn: m[9] === '1',
        });
    }
    return rows;
}

function buildSysLookup(sysMenus) {
    const byNormName = new Map();
    const nameCounts = new Map();
    for (const s of sysMenus) {
        if (!s.useYn || !isSemanticSysCd(s.menuCd)) continue;
        const n = norm(s.nameKr);
        nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
    }
    for (const s of sysMenus) {
        if (!s.useYn || !isSemanticSysCd(s.menuCd)) continue;
        const n = norm(s.nameKr);
        if (nameCounts.get(n) > 1) continue;
        if (!byNormName.has(n)) byNormName.set(n, s.menuCd);
    }
    return byNormName;
}

function menuDfsList(menus) {
    const byParent = new Map();
    for (const m of menus) {
        const k = m.parentId ?? null;
        if (!byParent.has(k)) byParent.set(k, []);
        byParent.get(k).push(m);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);
    const out = [];
    const dfs = (pid) => {
        for (const m of byParent.get(pid) ?? []) {
            out.push(m);
            dfs(m.id);
        }
    };
    dfs(null);
    return out;
}

function enrichProgramIds(menus, sysLookup) {
    let sysMatched = 0;
    let kept = 0;
    let generated = 0;
    const used = new Set();

    for (const m of menuDfsList(menus)) {
        if (m.programId) {
            m.programId = ensureUnique(m.programId, used);
            used.add(m.programId);
            kept++;
            continue;
        }
        const cd = resolveSysMenuCd(m.name, sysLookup);
        if (cd) {
            const pid = ensureUnique(normalizeSysCd(cd), used);
            m.programId = pid;
            used.add(pid);
            sysMatched++;
        }
    }

    for (const m of menuDfsList(menus)) {
        if (m.programId) continue;
        const pathParts = menuPathParts(menus, m.id);
        const parent = m.parentId ? menus.find((x) => x.id === m.parentId) : null;
        let pid = buildProgramId(m, pathParts, parent?.programId);
        pid = ensureUnique(pid, used);
        m.programId = pid;
        used.add(pid);
        generated++;
    }

    return { sysMatched, kept, generated };
}

function shouldUseSysMatch(name) {
    const n = norm(name);
    // 짧은 단일 기능명(신규등록·이전등록 등)은 경로 기반 코드화 우선
    if (n.length <= 5) return false;
    return true;
}

function resolveSysMenuCd(wbsName, byNormName) {
    if (!shouldUseSysMatch(wbsName)) return '';

    const n = norm(wbsName);
    if (byNormName.has(n)) return byNormName.get(n);

    const aliasTarget = NAME_ALIASES.get(n);
    if (aliasTarget && byNormName.has(norm(aliasTarget))) {
        return byNormName.get(norm(aliasTarget));
    }

    return '';
}

function loadWbsFromExcel(srcPath) {
    const wb = XLSX.readFile(srcPath);
    const menuRows = XLSX.utils.sheet_to_json(wb.Sheets['메뉴데이터'], { defval: '' });
    const detailRows = XLSX.utils.sheet_to_json(wb.Sheets['개발상세'], { defval: '' });

    const codeToId = new Map();
    const menus = menuRows.map((r, idx) => {
        const id = String(r['ID(수정금지)'] || `menu_gen_${idx}`);
        const menuCode = String(r['메뉴코드'] || '').trim();
        const name = String(r['메뉴명'] || '').trim() || '이름 없음';
        const parentMenuCode = String(r['상위메뉴코드'] || '').trim();
        codeToId.set(menuCode, id);
        return {
            id,
            menuCode,
            name,
            programId: String(r['프로그램ID'] || '').trim(),
            parentMenuCode,
            parentId: null,
            order: idx,
        };
    });

    for (const m of menus) {
        m.parentId = m.parentMenuCode ? (codeToId.get(m.parentMenuCode) ?? null) : null;
    }

    // 형제 order: 원본 행 순서(DFS) 유지 — 엑셀 정렬 그대로
    const orderMap = new Map(menus.map((m, i) => [m.id, i]));
    menus.forEach((m, i) => { m.order = orderMap.get(m.id) ?? i; });

    const rows = detailRows.map((r) => {
        const menuCode = String(r['메뉴코드'] || '').trim();
        const statusLbl = String(r['상태'] || '대기').trim();
        return {
            id: String(r['ID(수정금지)'] || ''),
            menuId: codeToId.get(menuCode) || '',
            menuCode,
            category: String(r['구분(산출물)'] || ''),
            featureName: String(r['기능명'] || ''),
            assignee: String(r['담당자'] || ''),
            startDate: String(r['시작일'] || ''),
            endDate: String(r['종료일'] || ''),
            status: LABEL_STATUS[statusLbl] || 'TODO',
            statusLbl,
            progress: Number(r['진행율(%)']) || 0,
            note: String(r['비고'] || ''),
            isDebugging: String(r['구분(산출물)'] || '') === 'Debuging',
        };
    }).filter((r) => r.id);

    return { menus, rows };
}

function menuPathParts(menus, id) {
    const byId = new Map(menus.map((m) => [m.id, m]));
    const parts = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 100) {
        parts.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts;
}

function menuPath(menus, id) {
    return menuPathParts(menus, id).join(' > ');
}

function menuDfsOrder(menus) {
    const byParent = new Map();
    for (const m of menus) {
        const k = m.parentId ?? null;
        if (!byParent.has(k)) byParent.set(k, []);
        byParent.get(k).push(m);
    }
    for (const list of byParent.values()) {
        list.sort((a, b) => a.order - b.order);
    }
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
    const isNum = typeof v === 'number' && !Number.isNaN(v);
    const cell = { v: isNum ? v : String(v ?? ''), t: isNum ? 'n' : 's' };
    if (s) cell.s = s;
    return cell;
}

function hdrStyle(align = 'center') {
    return {
        fill: { patternType: 'solid', fgColor: { rgb: '1E293B' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10, name: '맑은 고딕' },
        border: {
            bottom: { style: 'thin', color: { rgb: '334155' } },
            right: { style: 'thin', color: { rgb: '334155' } },
        },
        alignment: { vertical: 'center', horizontal: align, wrapText: false },
    };
}

function cellStyle(bg, extra = {}) {
    return {
        fill: { patternType: 'solid', fgColor: { rgb: bg } },
        font: { name: '맑은 고딕', sz: 9, ...(extra.font || {}) },
        alignment: { vertical: 'center', wrapText: false, ...(extra.alignment || {}) },
        border: {
            bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
            right: { style: 'thin', color: { rgb: 'E2E8F0' } },
        },
        ...extra,
    };
}

function writeExcel(menus, rows, outPath) {
    const menuOrder = menuDfsOrder(menus);
    const menuCodeById = new Map(menus.map((m) => [m.id, m.menuCode]));
    const pathDepth = Math.max(1, ...rows.map((r) => (r.menuId ? menuPathParts(menus, r.menuId).length : 0)), ...menus.map((m) => menuPathParts(menus, m.id).length));

    const GROUP_PALETTES = [
        { base: 'EFF6FF', debug: 'DBEAFE' },
        { base: 'F9FAFB', debug: 'F3F4F6' },
    ];
    const statusFg = { 완료: '059669', 진행중: '2563EB', 보류: 'D97706', 대기: '6B7280' };

    // ── 시트1: 개발상세 ──
    const detailAoa = [];
    detailAoa.push([
        'ID(수정금지)',
        ...Array.from({ length: pathDepth }, () => '메뉴경로'),
        '메뉴코드', '구분(산출물)', '기능명', '담당자', '시작일', '종료일', '상태', '진행율(%)', '비고',
    ].map((v) => sc(v, hdrStyle())));

    let groupIdx = -1;
    let lastMenuId = '';
    const sortedRows = [...rows].sort((a, b) => {
        const ma = menuOrder.get(a.menuId) ?? 999999;
        const mb = menuOrder.get(b.menuId) ?? 999999;
        if (ma !== mb) return ma - mb;
        return a.id.localeCompare(b.id);
    });

    for (const r of sortedRows) {
        if (r.menuId !== lastMenuId) {
            groupIdx = (groupIdx + 1) % GROUP_PALETTES.length;
            lastMenuId = r.menuId;
        }
        const palette = GROUP_PALETTES[groupIdx];
        const bg = r.isDebugging ? palette.debug : palette.base;
        const parts = r.menuId ? menuPathParts(menus, r.menuId) : [];
        const lbl = r.statusLbl || STATUS_LABEL[r.status] || '대기';
        detailAoa.push([
            sc(r.id, cellStyle(bg, { font: { sz: 8, color: { rgb: '94A3B8' } } })),
            ...Array.from({ length: pathDepth }, (_, i) => sc(parts[i] ?? '', cellStyle(bg))),
            sc(menuCodeById.get(r.menuId) ?? r.menuCode, cellStyle(bg, { font: { bold: true, color: { rgb: '4F46E5' } }, alignment: { horizontal: 'center' } })),
            sc(r.category, cellStyle(bg)),
            sc(r.featureName, cellStyle(bg)),
            sc(r.assignee, cellStyle(bg)),
            sc(r.startDate, cellStyle(bg, { alignment: { horizontal: 'center' } })),
            sc(r.endDate, cellStyle(bg, { alignment: { horizontal: 'center' } })),
            sc(lbl, cellStyle(bg, { font: { bold: true, color: { rgb: statusFg[lbl] ?? '6B7280' } }, alignment: { horizontal: 'center' } })),
            sc(r.progress, cellStyle(bg, { font: { bold: true }, alignment: { horizontal: 'center' } })),
            sc(r.note, cellStyle(bg)),
        ]);
    }

    const ws1 = XLSXStyle.utils.aoa_to_sheet(detailAoa);
    ws1['!cols'] = [
        { wch: 22 },
        ...Array.from({ length: pathDepth }, () => ({ wch: 18 })),
        { wch: 13 }, { wch: 13 }, { wch: 26 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 22 },
    ];
    ws1['!freeze'] = { xSplit: 0, ySplit: 1 };

    // ── 시트2: 메뉴구조 ──
    const { aoa, merges, maxDepth } = buildMenuTreeSheet(menus);
    const treeAoa = [
        Array.from({ length: maxDepth + 1 }, (_, i) => sc(`${i + 1}단계`, hdrStyle('left'))),
        ...aoa.map((row) => Array.from({ length: maxDepth + 1 }, (_, i) => sc(row[i] ?? '', cellStyle('FFFFFF')))),
    ];
    const ws2 = XLSXStyle.utils.aoa_to_sheet(treeAoa);
    ws2['!cols'] = Array.from({ length: maxDepth + 1 }, () => ({ wch: 22 }));
    ws2['!merges'] = merges.map((m) => ({ s: { r: m.s.r + 1, c: m.s.c }, e: { r: m.e.r + 1, c: m.e.c } }));

    // ── 시트3: 메뉴데이터 ──
    const sortedMenus = [...menus].sort((a, b) => (menuOrder.get(a.id) ?? 0) - (menuOrder.get(b.id) ?? 0));
    const menuAoa = [
        ['ID(수정금지)', '메뉴코드', '메뉴명', '프로그램ID', '전체경로', '상위메뉴코드'].map((v) => sc(v, hdrStyle('left'))),
        ...sortedMenus.map((m) => [
            sc(m.id, cellStyle('FFFFFF', { font: { sz: 8, color: { rgb: '94A3B8' } } })),
            sc(m.menuCode, cellStyle('FFFFFF', { font: { bold: true, color: { rgb: '4F46E5' } } })),
            sc(m.name, cellStyle('FFFFFF')),
            sc(m.programId || '', cellStyle('FFFFFF', { font: { color: { rgb: '64748B' } } })),
            sc(menuPath(menus, m.id), cellStyle('F8FAFC')),
            sc(m.parentMenuCode || '', cellStyle('FFFFFF')),
        ]),
    ];
    const ws3 = XLSXStyle.utils.aoa_to_sheet(menuAoa);
    ws3['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 28 }, { wch: 28 }, { wch: 48 }, { wch: 14 }];

    const wb = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, ws1, '개발상세');
    XLSXStyle.utils.book_append_sheet(wb, ws2, '메뉴구조');
    XLSXStyle.utils.book_append_sheet(wb, ws3, '메뉴데이터');
    XLSXStyle.writeFile(wb, outPath);
}

// ── main ──
const srcPath = process.argv[2] || DEFAULT_SRC;
if (!fs.existsSync(srcPath)) {
    console.error('기준 엑셀 파일을 찾을 수 없습니다:', srcPath);
    process.exit(1);
}

const sql = fs.readFileSync(SQL_PATH, 'utf8');
const sysMenus = parseSql(sql);
const sysLookup = buildSysLookup(sysMenus);
const { menus, rows } = loadWbsFromExcel(srcPath);
const { sysMatched, kept, generated } = enrichProgramIds(menus, sysLookup);

// 전체경로 재계산은 write 시 자동
writeExcel(menus, rows, OUT_PATH);

const withPid = menus.filter((m) => m.programId).length;
console.log(`✓ 기준: ${path.basename(srcPath)}`);
console.log(`✓ 메뉴 ${menus.length}개 · 개발상세 ${rows.length}행`);
console.log(`✓ 프로그램ID: 기존 ${kept}개 · SYS_MENU ${sysMatched}개 · 한글명 코드화 ${generated}개 · 합계 ${withPid}개`);
console.log(`✓ 저장: ${OUT_PATH}`);
