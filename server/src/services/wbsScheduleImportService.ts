import crypto from 'crypto';
import * as XLSX from 'xlsx';

/**
 * `관리_WBS` 형식의 일정 전용 import 파서/비교기.
 *
 * 이 서비스는 WBS의 menus/rows(개발 상세)를 읽거나 변경하지 않는다. 오직
 * wbsSnapshot.detailSchedules에 대응하는 값만 후보로 만든다.
 */

export type ScheduleStatus = '완료' | '진행중' | '대기' | '보류';

export interface WbsDetailScheduleRecord {
    id: string;
    parentId?: string | null;
    order?: number;
    /** 원본 엑셀의 WBS 작업번호(B열) */
    scheduleCode?: string;
    title: string;
    startDate: string;
    endDate: string;
    /** 원본 엑셀 J열 계획일 */
    planDays?: number;
    /** 원본 엑셀 K열 계획 진척도(0~100) */
    planProgress?: number;
    /** 원본 엑셀 L열 계획율(0~100) */
    planRate?: number;
    progress?: number;
    worker?: string;
    deliverable?: string;
    completionCriteria?: string;
    status?: ScheduleStatus;
    actualStartDate?: string;
    actualEndDate?: string;
    /** 원본 엑셀 O열 실적 투입일 */
    actualDays?: number;
}

type ImportResult = '신규 추가' | '기존 일정 수정' | '변경 없음' | '웹 데이터 유지' | '충돌/검토 필요' | '제외';

export interface ScheduleImportFieldChange {
    field: string;
    label: string;
    before: string | number | null;
    after: string | number | null;
}

export interface ScheduleImportPreviewItem {
    key: string;
    sourceRows: number[];
    hierarchyPath: string;
    title: string;
    result: ImportResult;
    reason?: string;
    scheduleId?: string;
    changes: ScheduleImportFieldChange[];
}

export interface ScheduleImportSummary {
    total: number;
    added: number;
    updated: number;
    unchanged: number;
    protected: number;
    conflicts: number;
    excluded: number;
}

export interface ScheduleImportPreview {
    sheetName: string;
    sourceRowCount: number;
    baseSnapshotHash: string;
    previewHash: string;
    canApply: boolean;
    summary: ScheduleImportSummary;
    items: ScheduleImportPreviewItem[];
    added: WbsDetailScheduleRecord[];
    updates: Array<{ id: string; patch: Partial<Omit<WbsDetailScheduleRecord, 'id'>> }>;
}

interface ParsedLeaf {
    rowNumber: number;
    sourceCode: string;
    rootTitle: string;
    groupTitle: string;
    title: string;
    startDate: string;
    endDate: string;
    planDays?: number;
    planProgress?: number;
    planRate?: number;
    worker?: string;
    deliverable?: string;
    completionCriteria?: string;
    status?: ScheduleStatus;
    actualStartDate?: string;
    actualEndDate?: string;
    actualDays?: number;
    progress?: number;
}

interface Candidate {
    key: string;
    parentKey: string | null;
    /** 번호 우선 매칭용 코드. 제목이 바뀌어도 기존 일정을 찾는다. */
    matchCode: string;
    /** 보호 하위 분류가 있는 상위 집계는 기존 웹 집계값을 유지한다. */
    preserveAggregateFields?: boolean;
    sourceRows: number[];
    hierarchyPath: string;
    value: Omit<WbsDetailScheduleRecord, 'id' | 'parentId'>;
}

const COL = {
    group: 0, // A 구분
    code: 1, // B 작업 식별 코드
    title: 2, // C 작업명
    worker: 3,
    deliverable: 4,
    completionCriteria: 5,
    status: 6,
    planStart: 7,
    planEnd: 8,
    planDays: 9,
    planProgress: 10,
    planRate: 11,
    actualStart: 12,
    actualEnd: 13,
    actualDays: 14,
    actualProgress: 15,
} as const;

const FIELD_LABEL: Record<string, string> = {
    parentId: '상위 일정',
    order: '순서',
    scheduleCode: 'WBS 번호',
    title: '항목명',
    startDate: '계획 시작일',
    endDate: '계획 종료일',
    planDays: '계획일',
    planProgress: '계획 진척도',
    planRate: '계획율',
    worker: '작업자',
    deliverable: '산출물명',
    completionCriteria: '완료기준',
    status: '상태',
    actualStartDate: '실적 시작일',
    actualEndDate: '실적 종료일',
    actualDays: '실적 투입일',
    progress: '실적 진척도',
};

const PROTECTED_GROUP_CODE = '3.2';

const STATUS_MAP: Record<string, ScheduleStatus> = {
    완료: '완료',
    진행: '진행중',
    진행중: '진행중',
    대기: '대기',
    보류: '보류',
};

const normalizeText = (value: unknown): string => String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const keyPart = (value: string) => normalizeText(value);

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, item]) => item !== undefined)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => [key, canonicalize(item)]),
        );
    }
    return value;
}

function digest(value: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function getWbsScheduleSnapshotHash(schedules: WbsDetailScheduleRecord[]): string {
    return digest([...schedules].sort((a, b) => a.id.localeCompare(b.id)));
}

function readCell(ws: XLSX.WorkSheet, row: number, col: number): XLSX.CellObject | undefined {
    return ws[XLSX.utils.encode_cell({ r: row, c: col })];
}

function cellText(ws: XLSX.WorkSheet, row: number, col: number): string {
    const cell = readCell(ws, row, col);
    return normalizeText(cell?.v);
}

function formatExcelDate(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (!parsed) return '';
        const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
        if (date.getUTCFullYear() !== parsed.y || date.getUTCMonth() !== parsed.m - 1 || date.getUTCDate() !== parsed.d) return '';
        return `${parsed.y}.${String(parsed.m).padStart(2, '0')}.${String(parsed.d).padStart(2, '0')}`;
    }

    const text = normalizeText(value);
    const matched = text.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
    if (!matched) return '';
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    const day = Number(matched[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}

function cellDate(ws: XLSX.WorkSheet, row: number, col: number): string {
    return formatExcelDate(readCell(ws, row, col)?.v);
}

function cellProgress(ws: XLSX.WorkSheet, row: number, col: number): number | undefined | 'invalid' {
    const cell = readCell(ws, row, col);
    if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return undefined;
    const raw = typeof cell.v === 'number'
        ? cell.v
        : Number(normalizeText(cell.v).replace('%', '')) / (normalizeText(cell.v).includes('%') ? 100 : 1);
    if (!Number.isFinite(raw)) return 'invalid';
    const percent = raw <= 1 ? raw * 100 : raw;
    if (percent < 0 || percent > 100) return 'invalid';
    return Math.round(percent * 100) / 100;
}

function cellNonNegativeNumber(ws: XLSX.WorkSheet, row: number, col: number): number | undefined | 'invalid' {
    const cell = readCell(ws, row, col);
    if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return undefined;
    const normalized = normalizeText(cell.v).replace(/[^0-9.+-]/g, '');
    if (typeof cell.v !== 'number' && !normalized) return undefined;
    const raw = typeof cell.v === 'number' ? cell.v : Number(normalized);
    if (!Number.isFinite(raw) || raw < 0) return 'invalid';
    return Math.round(raw * 100) / 100;
}

function normalizeScheduleCode(value: string): string {
    return normalizeText(value).replace(/\s+/g, '');
}

function headingCode(value: string): string {
    return normalizeText(value).match(/^(\d+(?:\.\d+)*)\.?\s+/)?.[1] ?? '';
}

function parentCode(value: string, depth: number): string {
    return normalizeScheduleCode(value).split('.').slice(0, depth).join('.');
}

function orderFromCode(value: string, depth: number, fallback: number): number {
    const part = Number(normalizeScheduleCode(value).split('.')[depth - 1]);
    return Number.isInteger(part) && part > 0 ? part - 1 : fallback;
}

function isProtectedCode(value: string): boolean {
    const code = normalizeScheduleCode(value);
    return code === PROTECTED_GROUP_CODE || code.startsWith(`${PROTECTED_GROUP_CODE}.`);
}

function findHeaderRow(ws: XLSX.WorkSheet, maxRow: number): number {
    for (let row = 0; row <= Math.min(maxRow, 30); row += 1) {
        const group = cellText(ws, row, COL.group);
        const worker = cellText(ws, row, COL.worker);
        const deliverable = cellText(ws, row, COL.deliverable);
        const criteria = cellText(ws, row, COL.completionCriteria);
        const status = cellText(ws, row, COL.status);
        const planStart = cellText(ws, row, COL.planStart);
        const planEnd = cellText(ws, row, COL.planEnd);
        const actualStart = cellText(ws, row, COL.actualStart);
        const actualEnd = cellText(ws, row, COL.actualEnd);
        if (
            group === '구분'
            && worker === '작업자'
            && deliverable === '산출물명'
            && criteria === '완료기준'
            && status === '상태'
            && planStart === '시작일'
            && planEnd === '종료일'
            && actualStart === '시작일'
            && actualEnd === '종료일'
        ) return row;
    }
    return -1;
}

function parseLeaves(buffer: Buffer): {
    sheetName: string;
    leaves: ParsedLeaf[];
    excluded: ScheduleImportPreviewItem[];
    protectedItems: ScheduleImportPreviewItem[];
    protectedRootTitles: Set<string>;
} {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheetName = workbook.SheetNames.includes('관리_WBS') ? '관리_WBS' : '';
    if (!sheetName) throw new Error('`관리_WBS` 시트를 찾을 수 없습니다. 계약추진일정 표 형식의 파일만 업로드할 수 있습니다.');
    const ws = workbook.Sheets[sheetName];
    const ref = ws['!ref'];
    if (!ref) throw new Error('`관리_WBS` 시트에 데이터가 없습니다.');
    const range = XLSX.utils.decode_range(ref);
    const headerRow = findHeaderRow(ws, range.e.r);
    if (headerRow < 0) {
        throw new Error('필수 헤더(구분·작업자·산출물명·완료기준·상태·계획/실적 시작일·종료일)를 찾을 수 없습니다.');
    }

    const leaves: ParsedLeaf[] = [];
    const excluded: ScheduleImportPreviewItem[] = [];
    const protectedItems: ScheduleImportPreviewItem[] = [];
    const protectedRootTitles = new Set<string>();
    let rootTitle = '';
    let groupTitle = '';

    for (let row = headerRow + 1; row <= range.e.r; row += 1) {
        const group = cellText(ws, row, COL.group);
        const sourceCode = cellText(ws, row, COL.code);
        const title = cellText(ws, row, COL.title);

        // B/C가 비어 있는 행은 최상위 계약/과업 그룹의 집계 행이다.
        if (!sourceCode && !title) {
            if (group) {
                rootTitle = group;
                groupTitle = '';
            }
            continue;
        }

        const rowNumber = row + 1;
        const sourceRows = [rowNumber];

        if (group) groupTitle = group;
        if (isProtectedCode(sourceCode) || headingCode(groupTitle) === PROTECTED_GROUP_CODE) {
            if (rootTitle) protectedRootTitles.add(rootTitle);
            protectedItems.push({
                key: `protected:${rowNumber}`,
                sourceRows,
                hierarchyPath: [rootTitle, groupTitle].filter(Boolean).join(' > ') || '3.2 시스템 개발',
                title: title || sourceCode || '3.2 시스템 개발',
                result: '웹 데이터 유지',
                reason: '3.2 시스템 개발은 웹 WBS가 기준이므로 엑셀 값을 병합하지 않습니다.',
                changes: [],
            });
            continue;
        }

        if (!sourceCode || !title) {
            excluded.push({
                key: `excluded:${rowNumber}`,
                sourceRows,
                hierarchyPath: rootTitle || '식별 불가',
                title: title || group || '식별 불가 행',
                result: '제외',
                reason: '작업 식별 코드(B열)와 작업명(C열)이 모두 필요합니다.',
                changes: [],
            });
            continue;
        }

        if (!rootTitle || !groupTitle) {
            excluded.push({
                key: `excluded:${rowNumber}`,
                sourceRows,
                hierarchyPath: rootTitle || '식별 불가',
                title,
                result: '제외',
                reason: '상위 계약/과업 구분(A열)을 확정할 수 없습니다.',
                changes: [],
            });
            continue;
        }

        const startDate = cellDate(ws, row, COL.planStart);
        const endDate = cellDate(ws, row, COL.planEnd);
        if (!startDate || !endDate || startDate > endDate) {
            excluded.push({
                key: `excluded:${rowNumber}`,
                sourceRows,
                hierarchyPath: `${rootTitle} > ${groupTitle}`,
                title,
                result: '제외',
                reason: '계획 시작일/종료일(H/I열)이 없거나 날짜 순서가 올바르지 않습니다.',
                changes: [],
            });
            continue;
        }

        const actualStartDate = cellDate(ws, row, COL.actualStart);
        const actualEndDate = cellDate(ws, row, COL.actualEnd);
        if ((actualStartDate && !actualEndDate) || (!actualStartDate && actualEndDate) || (actualStartDate && actualStartDate > actualEndDate)) {
            excluded.push({
                key: `excluded:${rowNumber}`,
                sourceRows,
                hierarchyPath: `${rootTitle} > ${groupTitle}`,
                title,
                result: '제외',
                reason: '실적 시작일/종료일(M/N열)은 함께 입력되고 시작일이 종료일보다 빠르거나 같아야 합니다.',
                changes: [],
            });
            continue;
        }

        const rawStatus = cellText(ws, row, COL.status);
        if (rawStatus === '삭제') {
            excluded.push({
                key: `excluded:${rowNumber}`,
                sourceRows,
                hierarchyPath: `${rootTitle} > ${groupTitle}`,
                title,
                result: '제외',
                reason: '`삭제` 상태 행은 자동 삭제하지 않습니다. 일정 삭제는 화면에서 별도로 처리하세요.',
                changes: [],
            });
            continue;
        }
        const status = rawStatus ? STATUS_MAP[rawStatus] : undefined;
        if (rawStatus && !status) {
            excluded.push({
                key: `excluded:${rowNumber}`,
                sourceRows,
                hierarchyPath: `${rootTitle} > ${groupTitle}`,
                title,
                result: '제외',
                reason: `지원하지 않는 상태값입니다: ${rawStatus}`,
                changes: [],
            });
            continue;
        }
        const progress = cellProgress(ws, row, COL.actualProgress);
        if (progress === 'invalid') {
            excluded.push({
                key: `excluded:${rowNumber}`,
                sourceRows,
                hierarchyPath: `${rootTitle} > ${groupTitle}`,
                title,
                result: '제외',
                reason: '실적 진척도(P열)는 0%~100% 값이어야 합니다.',
                changes: [],
            });
            continue;
        }

        const planDays = cellNonNegativeNumber(ws, row, COL.planDays);
        const actualDays = cellNonNegativeNumber(ws, row, COL.actualDays);
        if (planDays === 'invalid' || actualDays === 'invalid') {
            excluded.push({
                key: `excluded:${rowNumber}`,
                sourceRows,
                hierarchyPath: `${rootTitle} > ${groupTitle}`,
                title,
                result: '제외',
                reason: '계획일(J열)과 실적 투입일(O열)은 0 이상의 숫자여야 합니다.',
                changes: [],
            });
            continue;
        }
        const planProgress = cellProgress(ws, row, COL.planProgress);
        const planRate = cellProgress(ws, row, COL.planRate);
        if (planProgress === 'invalid' || planRate === 'invalid') {
            excluded.push({
                key: `excluded:${rowNumber}`,
                sourceRows,
                hierarchyPath: `${rootTitle} > ${groupTitle}`,
                title,
                result: '제외',
                reason: '계획 진척도(K열)와 계획율(L열)은 0%~100% 값이어야 합니다.',
                changes: [],
            });
            continue;
        }

        leaves.push({
            rowNumber,
            sourceCode,
            rootTitle,
            groupTitle,
            title,
            startDate,
            endDate,
            planDays,
            planProgress,
            planRate,
            worker: cellText(ws, row, COL.worker) || undefined,
            deliverable: cellText(ws, row, COL.deliverable) || undefined,
            completionCriteria: cellText(ws, row, COL.completionCriteria) || undefined,
            status,
            actualStartDate: actualStartDate || undefined,
            actualEndDate: actualEndDate || undefined,
            actualDays,
            progress: typeof progress === 'number' ? progress : undefined,
        });
    }

    return { sheetName, leaves, excluded, protectedItems, protectedRootTitles };
}

function deriveStatus(progress: number): ScheduleStatus {
    if (progress >= 100) return '완료';
    if (progress > 0) return '진행중';
    return '대기';
}

function minDate(values: Array<string | undefined>): string {
    return values.filter((value): value is string => Boolean(value)).sort()[0] ?? '';
}

function maxDate(values: Array<string | undefined>): string {
    return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? '';
}

function average(values: Array<number | undefined>): number | undefined {
    const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (numbers.length === 0) return undefined;
    return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 100) / 100;
}

function sum(values: Array<number | undefined>): number | undefined {
    const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (numbers.length === 0) return undefined;
    return Math.round(numbers.reduce((total, value) => total + value, 0) * 100) / 100;
}

function makeKey(parentKey: string | null, title: string): string {
    return parentKey ? `${parentKey}\u001F${keyPart(title)}` : keyPart(title);
}

/** 파일 재검증 시에도 동일한 후보 ID가 나오도록 계층 식별 조합에서 생성한다. */
function importedScheduleId(identityKey: string): string {
    return `schimp_${crypto.createHash('sha256').update(identityKey).digest('hex')}`;
}

function buildCandidates(
    leaves: ParsedLeaf[],
    excluded: ScheduleImportPreviewItem[],
    protectedRootTitles: Set<string>,
): Candidate[] {
    const duplicateKeys = new Map<string, ParsedLeaf[]>();
    const duplicateCodes = new Map<string, ParsedLeaf[]>();
    for (const leaf of leaves) {
        const rootKey = makeKey(null, leaf.rootTitle);
        const groupKey = makeKey(rootKey, leaf.groupTitle);
        const leafKey = makeKey(groupKey, leaf.title);
        const group = duplicateKeys.get(leafKey) ?? [];
        group.push(leaf);
        duplicateKeys.set(leafKey, group);

        const code = normalizeScheduleCode(leaf.sourceCode);
        const sameCode = duplicateCodes.get(code) ?? [];
        sameCode.push(leaf);
        duplicateCodes.set(code, sameCode);
    }
    const duplicateLeafKeys = new Set([...duplicateKeys.entries()]
        .filter(([, same]) => same.length > 1)
        .map(([key]) => key));
    const duplicateSourceCodes = new Set([...duplicateCodes.entries()]
        .filter(([, same]) => same.length > 1)
        .map(([code]) => code));

    const validLeaves = leaves.filter((leaf) => {
        const leafKey = makeKey(makeKey(makeKey(null, leaf.rootTitle), leaf.groupTitle), leaf.title);
        const sourceCode = normalizeScheduleCode(leaf.sourceCode);
        if (!duplicateLeafKeys.has(leafKey) && !duplicateSourceCodes.has(sourceCode)) return true;
        excluded.push({
            key: `duplicate:${leaf.rowNumber}`,
            sourceRows: [leaf.rowNumber],
            hierarchyPath: `${leaf.rootTitle} > ${leaf.groupTitle}`,
            title: leaf.title,
            result: '충돌/검토 필요',
            reason: duplicateSourceCodes.has(sourceCode)
                ? `동일한 WBS 번호(${leaf.sourceCode})가 여러 행에 있습니다. 자동 병합하지 않습니다.`
                : '같은 상위 계약/과업 안에 동일한 일정명이 여러 번 있습니다. 자동 병합하지 않습니다.',
            changes: [],
        });
        return false;
    });

    const byRoot = new Map<string, ParsedLeaf[]>();
    const byGroup = new Map<string, ParsedLeaf[]>();
    for (const leaf of validLeaves) {
        const rootKey = makeKey(null, leaf.rootTitle);
        const groupKey = makeKey(rootKey, leaf.groupTitle);
        if (!byRoot.has(rootKey)) byRoot.set(rootKey, []);
        if (!byGroup.has(groupKey)) byGroup.set(groupKey, []);
        byRoot.get(rootKey)!.push(leaf);
        byGroup.get(groupKey)!.push(leaf);
    }

    const candidates: Candidate[] = [];
    let rootOrder = 0;
    for (const [rootKey, rootLeaves] of byRoot) {
        const rootTitle = rootLeaves[0].rootTitle;
        const rootMatchCode = headingCode(rootTitle) || parentCode(rootLeaves[0].sourceCode, 1);
        const rootProgress = Math.round((rootLeaves.reduce((sum, leaf) => sum + (leaf.progress ?? 0), 0) / rootLeaves.length) * 100) / 100;
        candidates.push({
            key: rootKey,
            parentKey: null,
            matchCode: rootMatchCode,
            preserveAggregateFields: protectedRootTitles.has(rootTitle),
            sourceRows: rootLeaves.map((leaf) => leaf.rowNumber),
            hierarchyPath: rootTitle,
            value: {
                order: orderFromCode(rootMatchCode, 1, rootOrder++),
                title: rootTitle,
                startDate: minDate(rootLeaves.map((leaf) => leaf.startDate)),
                endDate: maxDate(rootLeaves.map((leaf) => leaf.endDate)),
                planDays: sum(rootLeaves.map((leaf) => leaf.planDays)),
                planProgress: average(rootLeaves.map((leaf) => leaf.planProgress)),
                planRate: average(rootLeaves.map((leaf) => leaf.planRate)),
                actualStartDate: minDate(rootLeaves.map((leaf) => leaf.actualStartDate)) || undefined,
                actualEndDate: maxDate(rootLeaves.map((leaf) => leaf.actualEndDate)) || undefined,
                actualDays: sum(rootLeaves.map((leaf) => leaf.actualDays)),
                progress: rootProgress,
                status: deriveStatus(rootProgress),
            },
        });

        let groupOrder = 0;
        for (const [groupKey, groupLeaves] of byGroup) {
            if (!groupKey.startsWith(`${rootKey}\u001F`)) continue;
            const groupTitle = groupLeaves[0].groupTitle;
            const groupMatchCode = headingCode(groupTitle) || parentCode(groupLeaves[0].sourceCode, 2);
            const groupProgress = Math.round((groupLeaves.reduce((sum, leaf) => sum + (leaf.progress ?? 0), 0) / groupLeaves.length) * 100) / 100;
            candidates.push({
                key: groupKey,
                parentKey: rootKey,
                matchCode: groupMatchCode,
                sourceRows: groupLeaves.map((leaf) => leaf.rowNumber),
                hierarchyPath: `${rootTitle} > ${groupTitle}`,
                value: {
                    order: orderFromCode(groupMatchCode, 2, groupOrder++),
                    title: groupTitle,
                    startDate: minDate(groupLeaves.map((leaf) => leaf.startDate)),
                    endDate: maxDate(groupLeaves.map((leaf) => leaf.endDate)),
                    planDays: sum(groupLeaves.map((leaf) => leaf.planDays)),
                    planProgress: average(groupLeaves.map((leaf) => leaf.planProgress)),
                    planRate: average(groupLeaves.map((leaf) => leaf.planRate)),
                    actualStartDate: minDate(groupLeaves.map((leaf) => leaf.actualStartDate)) || undefined,
                    actualEndDate: maxDate(groupLeaves.map((leaf) => leaf.actualEndDate)) || undefined,
                    actualDays: sum(groupLeaves.map((leaf) => leaf.actualDays)),
                    progress: groupProgress,
                    status: deriveStatus(groupProgress),
                },
            });

            let leafOrder = 0;
            for (const leaf of groupLeaves) {
                const leafMatchCode = normalizeScheduleCode(leaf.sourceCode);
                candidates.push({
                    key: makeKey(groupKey, leaf.title),
                    parentKey: groupKey,
                    matchCode: leafMatchCode,
                    sourceRows: [leaf.rowNumber],
                    hierarchyPath: `${rootTitle} > ${groupTitle}`,
                    value: {
                        order: orderFromCode(leafMatchCode, 3, leafOrder++),
                        scheduleCode: leaf.sourceCode,
                        title: leaf.title,
                        startDate: leaf.startDate,
                        endDate: leaf.endDate,
                        planDays: leaf.planDays,
                        planProgress: leaf.planProgress,
                        planRate: leaf.planRate,
                        worker: leaf.worker,
                        deliverable: leaf.deliverable,
                        completionCriteria: leaf.completionCriteria,
                        status: leaf.status,
                        actualStartDate: leaf.actualStartDate,
                        actualEndDate: leaf.actualEndDate,
                        actualDays: leaf.actualDays,
                        progress: leaf.progress,
                    },
                });
            }
        }
    }
    return candidates;
}

function currentPathById(current: WbsDetailScheduleRecord[]): Map<string, string | null> {
    const byId = new Map(current.map((item) => [item.id, item]));
    const cache = new Map<string, string | null>();
    const pathFor = (id: string, visited = new Set<string>()): string | null => {
        if (cache.has(id)) return cache.get(id)!;
        const item = byId.get(id);
        if (!item || visited.has(id)) return null;
        visited.add(id);
        const parentPath = item.parentId ? pathFor(item.parentId, visited) : '';
        const value = item.parentId && parentPath === null
            ? null
            : makeKey(parentPath || null, item.title);
        cache.set(id, value);
        return value;
    };
    current.forEach((item) => pathFor(item.id));
    return cache;
}

function changedFields(
    before: WbsDetailScheduleRecord,
    after: Partial<Omit<WbsDetailScheduleRecord, 'id'>>,
): ScheduleImportFieldChange[] {
    return Object.entries(after)
        .filter(([field, value]) => before[field as keyof WbsDetailScheduleRecord] !== value)
        .map(([field, value]) => ({
            field,
            label: FIELD_LABEL[field] ?? field,
            before: (before[field as keyof WbsDetailScheduleRecord] as string | number | null | undefined) ?? null,
            after: (value as string | number | null | undefined) ?? null,
        }));
}

/**
 * Excel 파일과 현재 Yjs 일정 스냅샷을 비교한다. 이 함수는 순수 계산만 수행하며
 * MongoDB/Yjs/파일에 쓰지 않으므로 미리보기 요청은 항상 DB write 0건이다.
 */
export function buildWbsScheduleImportPreview(
    fileBuffer: Buffer,
    current: WbsDetailScheduleRecord[],
): ScheduleImportPreview {
    const { sheetName, leaves, excluded, protectedItems, protectedRootTitles } = parseLeaves(fileBuffer);
    const candidates = buildCandidates(leaves, excluded, protectedRootTitles);
    const pathById = currentPathById(current);
    const currentByKey = new Map<string, WbsDetailScheduleRecord[]>();
    const currentByCode = new Map<string, WbsDetailScheduleRecord[]>();
    for (const item of current) {
        const key = pathById.get(item.id);
        if (!key) continue;
        const same = currentByKey.get(key) ?? [];
        same.push(item);
        currentByKey.set(key, same);

        const code = normalizeScheduleCode(item.scheduleCode || headingCode(item.title));
        if (code) {
            const sameCode = currentByCode.get(code) ?? [];
            sameCode.push(item);
            currentByCode.set(code, sameCode);
        }
    }

    const items: ScheduleImportPreviewItem[] = [...excluded, ...protectedItems];
    const added: WbsDetailScheduleRecord[] = [];
    const updates: Array<{ id: string; patch: Partial<Omit<WbsDetailScheduleRecord, 'id'>> }> = [];
    const resolvedIdByKey = new Map<string, string>();

    for (const candidate of candidates) {
        const codeMatches = candidate.matchCode ? currentByCode.get(candidate.matchCode) ?? [] : [];
        const pathMatches = currentByKey.get(candidate.key) ?? [];
        // 3.2 외 항목은 엑셀이 최신 원본이므로 WBS 번호를 절대 우선한다.
        // 제목/계층이 바뀌어 경로 매칭이 다른 기존 항목을 가리켜도,
        // 번호가 유일하면 해당 항목을 엑셀 경로/제목으로 재배치한다.
        const matches = codeMatches.length > 0 ? codeMatches : pathMatches;
        const parentId = candidate.parentKey ? resolvedIdByKey.get(candidate.parentKey) : null;
        if (candidate.parentKey && !parentId) {
            items.push({
                key: candidate.key,
                sourceRows: candidate.sourceRows,
                hierarchyPath: candidate.hierarchyPath,
                title: candidate.value.title,
                result: '충돌/검토 필요',
                reason: '상위 일정 식별 조합을 하나로 확정할 수 없습니다.',
                changes: [],
            });
            continue;
        }
        if (matches.length > 1) {
            items.push({
                key: candidate.key,
                sourceRows: candidate.sourceRows,
                hierarchyPath: candidate.hierarchyPath,
                title: candidate.value.title,
                result: '충돌/검토 필요',
                reason: '동일한 계약/과업/일정 식별 조합의 기존 일정이 여러 건입니다. 자동 수정하지 않습니다.',
                changes: [],
            });
            continue;
        }

        const candidateValue = { ...candidate.value } as Partial<Omit<WbsDetailScheduleRecord, 'id'>>;
        if (candidate.preserveAggregateFields && matches.length === 1) {
            for (const field of [
                'startDate', 'endDate', 'planDays', 'planProgress', 'planRate',
                'actualStartDate', 'actualEndDate', 'actualDays', 'progress', 'status',
            ] as const) delete candidateValue[field];
        }
        const nextPatch: Partial<Omit<WbsDetailScheduleRecord, 'id'>> = {
            ...candidateValue,
            parentId: parentId ?? null,
        };
        if (matches.length === 0) {
            const id = importedScheduleId(candidate.matchCode ? `code:${candidate.matchCode}` : candidate.key);
            if (current.some((item) => item.id === id)) {
                items.push({
                    key: candidate.key,
                    sourceRows: candidate.sourceRows,
                    hierarchyPath: candidate.hierarchyPath,
                    title: candidate.value.title,
                    result: '충돌/검토 필요',
                    reason: '신규 일정 식별자가 기존 일정과 충돌했습니다. 자동 병합하지 않습니다.',
                    changes: [],
                });
                continue;
            }
            resolvedIdByKey.set(candidate.key, id);
            const next = { id, ...nextPatch } as WbsDetailScheduleRecord;
            added.push(next);
            items.push({
                key: candidate.key,
                sourceRows: candidate.sourceRows,
                hierarchyPath: candidate.hierarchyPath,
                title: candidate.value.title,
                result: '신규 추가',
                changes: Object.entries(nextPatch).map(([field, value]) => ({
                    field,
                    label: FIELD_LABEL[field] ?? field,
                    before: null,
                    after: (value as string | number | null | undefined) ?? null,
                })),
            });
            continue;
        }

        const existing = matches[0];
        resolvedIdByKey.set(candidate.key, existing.id);
        const changes = changedFields(existing, nextPatch);
        if (changes.length === 0) {
            items.push({
                key: candidate.key,
                sourceRows: candidate.sourceRows,
                hierarchyPath: candidate.hierarchyPath,
                title: candidate.value.title,
                result: '변경 없음',
                scheduleId: existing.id,
                changes,
            });
        } else {
            updates.push({ id: existing.id, patch: nextPatch });
            items.push({
                key: candidate.key,
                sourceRows: candidate.sourceRows,
                hierarchyPath: candidate.hierarchyPath,
                title: candidate.value.title,
                result: '기존 일정 수정',
                scheduleId: existing.id,
                changes,
            });
        }
    }

    const summary: ScheduleImportSummary = {
        total: items.length,
        added: items.filter((item) => item.result === '신규 추가').length,
        updated: items.filter((item) => item.result === '기존 일정 수정').length,
        unchanged: items.filter((item) => item.result === '변경 없음').length,
        protected: items.filter((item) => item.result === '웹 데이터 유지').length,
        conflicts: items.filter((item) => item.result === '충돌/검토 필요').length,
        excluded: items.filter((item) => item.result === '제외').length,
    };
    const baseSnapshotHash = getWbsScheduleSnapshotHash(current);
    const previewHash = digest({
        sheetName,
        baseSnapshotHash,
        items: items.map(({ key, result, reason, changes }) => ({ key, result, reason, changes })),
    });

    return {
        sheetName,
        sourceRowCount: new Set([
            ...leaves.map((leaf) => leaf.rowNumber),
            ...protectedItems.flatMap((item) => item.sourceRows),
            ...excluded.flatMap((item) => item.sourceRows),
        ]).size,
        baseSnapshotHash,
        previewHash,
        canApply: summary.conflicts === 0 && summary.excluded === 0,
        summary,
        items,
        added,
        updates,
    };
}
