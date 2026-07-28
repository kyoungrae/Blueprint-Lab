import type { WbsData, WbsMenuNode, WbsDevRow, WbsStatus } from '../../types/wbs';
import { WBS_STATUS_ORDER } from '../../types/wbs';

const uid = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function safeName(name: string): string {
    return (name || 'WBS').replace(/[\\/:*?"<>|]/g, '_');
}
function today(): string {
    return new Date().toISOString().slice(0, 10);
}
function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 현재 WBS 데이터를 JSON 파일로 다운로드 (업로드와 동일 형식) */
export function downloadWbsJson(data: WbsData, projectName: string): void {
    const payload = {
        type: 'WBS',
        version: 1,
        exportedAt: new Date().toISOString(),
        menus: data.menus,
        rows: data.rows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `${safeName(projectName)}_WBS_${today()}.json`);
}

function normalizeMenu(m: any, idx: number): WbsMenuNode {
    return {
        id: typeof m?.id === 'string' && m.id ? m.id : uid('menu'),
        parentId: typeof m?.parentId === 'string' && m.parentId ? m.parentId : null,
        name: typeof m?.name === 'string' ? m.name : '이름 없음',
        menuCode: typeof m?.menuCode === 'string' && m.menuCode ? m.menuCode : `MENU-${String(idx + 1).padStart(4, '0')}`,
        programId: typeof m?.programId === 'string' && m.programId.trim() ? m.programId.trim() : undefined,
        order: Number.isFinite(m?.order) ? Number(m.order) : idx,
    };
}

function normalizeRow(r: any): WbsDevRow {
    const status: WbsStatus = WBS_STATUS_ORDER.includes(r?.status) ? r.status : 'TODO';
    const progress = Math.min(100, Math.max(0, Number(r?.progress) || 0));
    return {
        id: typeof r?.id === 'string' && r.id ? r.id : uid('row'),
        menuId: typeof r?.menuId === 'string' ? r.menuId : '',
        category: String(r?.category ?? ''),
        featureName: String(r?.featureName ?? ''),
        assignee: String(r?.assignee ?? ''),
        assigneeUserId: typeof r?.assigneeUserId === 'string' && r.assigneeUserId ? r.assigneeUserId : undefined,
        startDate: String(r?.startDate ?? ''),
        endDate: String(r?.endDate ?? ''),
        actualStartDate: String(r?.actualStartDate ?? ''),
        actualEndDate: String(r?.actualEndDate ?? ''),
        actualWorkDate: String(r?.actualWorkDate ?? ''),
        status,
        progress,
        note: r?.note != null ? String(r.note) : undefined,
    };
}

/** 업로드된 JSON 텍스트를 WBS 데이터로 파싱·검증 (다운로드 형식과 동일해야 함) */
export function parseWbsJson(text: string): WbsData {
    let obj: any;
    try {
        obj = JSON.parse(text);
    } catch {
        throw new Error('JSON 형식이 올바르지 않습니다. 파일을 확인해 주세요.');
    }
    const menus = obj?.menus;
    const rows = obj?.rows;
    if (!Array.isArray(menus) || !Array.isArray(rows)) {
        throw new Error('WBS JSON 형식이 아닙니다. (menus / rows 배열이 필요 — 다운로드한 파일과 동일한 형식)');
    }
    // 메뉴 id 집합으로 잘못된 menuId 참조는 정리
    const normMenus = menus.map(normalizeMenu);
    const menuIds = new Set(normMenus.map((m) => m.id));
    const normRows = rows.map(normalizeRow).filter((r) => r.menuId === '' || menuIds.has(r.menuId));
    return { menus: normMenus, rows: normRows };
}
