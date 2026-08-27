/**
 * 일정(WbsDetailSchedule) 전용 엑셀 / JSON 입출력 유틸
 */
// @ts-ignore
import XLSXStyle from 'xlsx-js-style';
import * as XLSX from 'xlsx';
import type { ScheduleStatus, WbsDetailSchedule } from '../../types/wbs';

const SCHEDULE_STATUSES: ScheduleStatus[] = ['완료', '진행중', '대기', '보류'];

function parseScheduleStatus(value: unknown): ScheduleStatus | undefined {
    const status = String(value ?? '').trim();
    return SCHEDULE_STATUSES.includes(status as ScheduleStatus)
        ? status as ScheduleStatus
        : undefined;
}

// ── 타입 헬퍼 ──────────────────────────────────────────
type XStyle = {
    fill?: { patternType: 'solid'; fgColor: { rgb: string } };
    font?: { bold?: boolean; color?: { rgb: string }; sz?: number; name?: string };
    border?: {
        top?: { style: string; color: { rgb: string } };
        bottom?: { style: string; color: { rgb: string } };
        left?: { style: string; color: { rgb: string } };
        right?: { style: string; color: { rgb: string } };
    };
    alignment?: { vertical?: string; horizontal?: string; wrapText?: boolean };
};
type XCell = { v: string | number; t: 's' | 'n'; s?: XStyle };

const uid = () => `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const thin = { style: 'thin', color: { rgb: 'CCCCCC' } };
const thinBorder: XStyle['border'] = { top: thin, bottom: thin, left: thin, right: thin };

function sc(v: string | number, s?: XStyle): XCell {
    return { v, t: typeof v === 'number' ? 'n' : 's', s };
}

function headerCell(v: string): XCell {
    return sc(v, {
        fill: { patternType: 'solid', fgColor: { rgb: '1F4E79' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10, name: 'Arial' },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder,
    });
}

// ── DFS 평탄화 (계층 순서 유지) ──────────────────────────
function flattenDfs(items: WbsDetailSchedule[]): WbsDetailSchedule[] {
    const byParent = new Map<string | null | undefined, WbsDetailSchedule[]>();
    for (const item of items) {
        const key = item.parentId ?? null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(item);
    }
    for (const arr of byParent.values()) {
        arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    const result: WbsDetailSchedule[] = [];
    function dfs(parentId: string | null) {
        for (const item of byParent.get(parentId) ?? []) {
            result.push(item);
            dfs(item.id);
        }
    }
    dfs(null);
    return result;
}

// ── 엑셀 다운로드 ──────────────────────────────────────
export function downloadScheduleExcel(items: WbsDetailSchedule[], projectName: string): void {
    const flat = flattenDfs(items);

    const headers = [
        'ID', '부모ID', '순서', '항목명',
        '계획시작일', '계획종료일', '상태', '진행율(%)',
        '작업자', '산출물명',
        '실적시작일', '실적종료일',
    ];

    // 실적 투입일 계산 헬퍼
    function calcActualDays(start?: string, end?: string): number {
        if (!start || !end) return 0;
        const s = new Date(start.replace(/\./g, '-'));
        const e = new Date(end.replace(/\./g, '-'));
        if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
        return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
    }

    const dataRows = flat.map((item, i) => {
        const depth = getDepth(items, item.id);
        const indent = '  '.repeat(depth);
        const isParent = items.some((x) => x.parentId === item.id);
        const baseFg = isParent ? 'BDD7EE' : (i % 2 === 0 ? 'FFFFFF' : 'F2F2F2');
        const bold = isParent;

        const cellStyle = (align: 'left' | 'center' = 'left'): XStyle => ({
            fill: { patternType: 'solid', fgColor: { rgb: baseFg } },
            font: { bold, sz: 9, name: 'Arial' },
            alignment: { horizontal: align, vertical: 'center' },
            border: thinBorder,
        });

        const actualDays = calcActualDays(item.actualStartDate, item.actualEndDate);

        return [
            sc(item.id, cellStyle('center')),
            sc(item.parentId ?? '', cellStyle('center')),
            sc(item.order ?? 0, cellStyle('center')),
            sc(indent + item.title, cellStyle('left')),
            sc(item.startDate, cellStyle('center')),
            sc(item.endDate, cellStyle('center')),
            sc(item.status ?? '', cellStyle('center')),
            sc(item.progress ?? 0, cellStyle('center')),
            sc(item.worker ?? '', cellStyle('center')),
            sc(item.deliverable ?? '', cellStyle('left')),
            sc(item.actualStartDate ?? '', cellStyle('center')),
            sc(item.actualEndDate ?? '', cellStyle('center')),
            sc(actualDays > 0 ? actualDays : '', cellStyle('center')),
        ];
    });

    // 실적 투입일 헤더 추가 (읽기전용 안내)
    const allHeaders = [...headers, '실적투입일(자동)'];
    const aoa = [allHeaders.map(headerCell), ...dataRows];
    const ws = XLSXStyle.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
        { wch: 26 }, { wch: 26 }, { wch: 6 }, { wch: 40 },
        { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 30 },
        { wch: 14 }, { wch: 14 }, { wch: 12 },
    ];
    ws['!rows'] = [{ hpt: 22 }, ...dataRows.map(() => ({ hpt: 16 }))];

    // 안내 시트
    const guideAoa = [
        [headerCell('필드'), headerCell('설명'), headerCell('예시')],
        [sc('ID'), sc('항목 고유 ID (수정 금지 — 기존 항목 업데이트에 사용)'), sc('sch_abc123')],
        [sc('부모ID'), sc('부모 항목의 ID (최상위면 빈 값)'), sc('')],
        [sc('순서'), sc('같은 부모 내 정렬 순서 (숫자)'), sc('1')],
        [sc('항목명'), sc('WBS 항목명 (들여쓰기는 표시용 — 실제 계층은 부모ID로 결정)'), sc('사업관리')],
        [sc('계획시작일'), sc('계획 시작일 (YYYY.MM.DD 형식)'), sc('2025.10.15')],
        [sc('계획종료일'), sc('계획 종료일 (YYYY.MM.DD 형식)'), sc('2027.12.31')],
        [sc('상태'), sc('완료 / 진행중 / 대기 / 보류. 보류는 개발상세 HOLD와 동기화됩니다.'), sc('보류')],
        [sc('진행율(%)'), sc('진행율 0~100 숫자'), sc('0')],
        [sc('작업자'), sc('담당 작업자명'), sc('홍길동')],
        [sc('산출물명'), sc('작업 결과 산출물 이름'), sc('설계서')],
        [sc('실적시작일'), sc('실제 시작일 (YYYY.MM.DD 형식)'), sc('2025.11.01')],
        [sc('실적종료일'), sc('실제 종료일 (YYYY.MM.DD 형식)'), sc('2025.11.30')],
        [sc('실적투입일(자동)'), sc('실적시작일~종료일 기간 자동 계산 (입력 불필요)'), sc('30')],
        [sc('')],
        [sc('※ 신규 항목 추가 시 ID 열을 비워두면 자동 생성됩니다.')],
        [sc('※ ID가 있으면 기존 항목을 업데이트하고, 없으면 신규 추가합니다.')],
    ];
    const wsGuide = XLSXStyle.utils.aoa_to_sheet(guideAoa);
    wsGuide['!cols'] = [{ wch: 18 }, { wch: 60 }, { wch: 20 }];

    const wb = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, ws, '일정_WBS');
    XLSXStyle.utils.book_append_sheet(wb, wsGuide, '작성가이드');

    const safeName = projectName.replace(/[\\/:*?"<>|]/g, '_');
    XLSXStyle.writeFile(wb, `${safeName}_일정WBS.xlsx`);
}

function getDepth(items: WbsDetailSchedule[], id: string, guard = 0): number {
    if (guard > 20) return 0;
    const item = items.find((x) => x.id === id);
    if (!item || !item.parentId) return 0;
    return 1 + getDepth(items, item.parentId, guard + 1);
}

// ── 엑셀 업로드 파싱 ──────────────────────────────────────
export interface ScheduleExcelParseResult {
    added: WbsDetailSchedule[];
    updated: WbsDetailSchedule[];
    unchanged: WbsDetailSchedule[];
    errors: string[];
}

export async function parseScheduleExcel(
    file: File,
    current: WbsDetailSchedule[],
): Promise<ScheduleExcelParseResult> {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    // '일정_WBS' 시트 우선, 없으면 첫 번째
    const sheetName = wb.SheetNames.includes('일정_WBS') ? '일정_WBS' : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as string[][];

    if (raw.length < 2) throw new Error('데이터가 없습니다.');

    const header = raw[0].map((h) => String(h ?? '').trim());

    // 여러 헤더명 후보를 지원 (첫 번째 매치 사용)
    const colFirst = (...candidates: string[]) => {
        for (const c of candidates) {
            const i = header.indexOf(c);
            if (i !== -1) return i;
        }
        return -1;
    };

    const colId = colFirst('ID', 'id');
    const colParent = colFirst('부모ID', '부모 ID', 'parentId');
    const colOrder = colFirst('순서', 'order', 'No.');
    const colTitle = colFirst('항목명', 'WBS 항목명', '항목', 'title', '작업명');
    const colStart = colFirst('계획시작일', '시작일', '시작', 'startDate', 'start');
    const colEnd = colFirst('계획종료일', '종료일', '종료', 'endDate', 'end');
    const colStatus = colFirst('상태', 'status');
    const colProgress = colFirst('진행율(%)', '진행율', '진행률(%)', '진행률', 'progress');
    const colWorker = colFirst('작업자', 'worker');
    const colDeliverable = colFirst('산출물명', 'deliverable');
    const colActualStart = colFirst('실적시작일', 'actualStartDate');
    const colActualEnd = colFirst('실적종료일', 'actualEndDate');

    if (colTitle === -1 || colStart === -1 || colEnd === -1) {
        throw new Error(`필수 열을 찾을 수 없습니다.\n인식된 헤더: [${header.filter(Boolean).join(', ')}]\n필요한 열: 항목명(또는 WBS 항목명), 계획시작일, 계획종료일`);
    }

    const currentMap = new Map(current.map((x) => [x.id, x]));
    const added: WbsDetailSchedule[] = [];
    const updated: WbsDetailSchedule[] = [];
    const unchanged: WbsDetailSchedule[] = [];
    const errors: string[] = [];

    for (let i = 1; i < raw.length; i++) {
        const row = raw[i];
        if (!row || row.every((c) => !c)) continue;

        const rawTitle = String(row[colTitle] ?? '').trim().replace(/^\s+/, '');
        const title = rawTitle.replace(/^[\s　]+/, ''); // 들여쓰기 공백 제거
        const startDate = String(row[colStart] ?? '').trim();
        const endDate = String(row[colEnd] ?? '').trim();

        if (!title || !startDate || !endDate) {
            errors.push(`${i + 1}행: 항목명/시작일/종료일이 비어있어 건너뜀`);
            continue;
        }

        const rawId = colId !== -1 ? String(row[colId] ?? '').trim() : '';
        const parentId = colParent !== -1 ? String(row[colParent] ?? '').trim() || undefined : undefined;
        const order = colOrder !== -1 ? Number(row[colOrder] ?? 0) : 0;
        const progress = colProgress !== -1 ? Math.min(100, Math.max(0, Number(row[colProgress] ?? 0))) : 0;
        const status = colStatus !== -1 ? parseScheduleStatus(row[colStatus]) : undefined;
        const worker = colWorker !== -1 ? String(row[colWorker] ?? '').trim() || undefined : undefined;
        const deliverable = colDeliverable !== -1 ? String(row[colDeliverable] ?? '').trim() || undefined : undefined;
        const actualStartDate = colActualStart !== -1 ? String(row[colActualStart] ?? '').trim() || undefined : undefined;
        const actualEndDate = colActualEnd !== -1 ? String(row[colActualEnd] ?? '').trim() || undefined : undefined;

        if (rawId && currentMap.has(rawId)) {
            const prev = currentMap.get(rawId)!;
            const next: WbsDetailSchedule = {
                ...prev, title, startDate, endDate, progress, order,
                parentId: parentId ?? null,
                worker, deliverable, actualStartDate, actualEndDate,
                ...(status ? { status } : {}),
            };
            const changed = JSON.stringify(prev) !== JSON.stringify(next);
            if (changed) updated.push(next);
            else unchanged.push(next);
        } else {
            added.push({
                id: rawId || uid(),
                parentId: parentId ?? null,
                order,
                title,
                startDate,
                endDate,
                progress,
                ...(status ? { status } : {}),
                worker,
                deliverable,
                actualStartDate,
                actualEndDate,
            });
        }
    }

    return { added, updated, unchanged, errors };
}

// ── JSON 다운로드 ──────────────────────────────────────
export function downloadScheduleJson(items: WbsDetailSchedule[], projectName: string): void {
    const json = JSON.stringify({ detailSchedules: items }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[\\/:*?"<>|]/g, '_')}_일정WBS.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── JSON 파싱 ──────────────────────────────────────────
export function parseScheduleJson(text: string): WbsDetailSchedule[] {
    const obj = JSON.parse(text);
    const arr = Array.isArray(obj) ? obj : (obj?.detailSchedules ?? obj?.items ?? null);
    if (!Array.isArray(arr)) throw new Error('올바른 일정 JSON 형식이 아닙니다. (detailSchedules 배열 필요)');
    return arr.map((x: WbsDetailSchedule) => ({
        id: String(x.id ?? uid()),
        parentId: x.parentId ?? null,
        order: Number(x.order ?? 0),
        title: String(x.title ?? ''),
        startDate: String(x.startDate ?? ''),
        endDate: String(x.endDate ?? ''),
        progress: Math.min(100, Math.max(0, Number(x.progress ?? 0))),
        ...(x.worker !== undefined ? { worker: x.worker } : {}),
        ...(x.deliverable !== undefined ? { deliverable: x.deliverable } : {}),
        ...(x.completionCriteria !== undefined ? { completionCriteria: x.completionCriteria } : {}),
        ...(x.status !== undefined ? { status: x.status } : {}),
        ...(x.actualStartDate !== undefined ? { actualStartDate: x.actualStartDate } : {}),
        ...(x.actualEndDate !== undefined ? { actualEndDate: x.actualEndDate } : {}),
    }));
}
