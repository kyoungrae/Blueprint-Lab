import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
    buildWbsScheduleImportPreview,
    type WbsDetailScheduleRecord,
} from '../src/services/wbsScheduleImportService';

const header = [
    '구분', '', '', '작업자', '산출물명', '완료기준', '상태',
    '시작일', '종료일', '계획일', '진척도', '계획율',
    '시작일', '종료일', '투입일', '진척도',
];

function sourceWorkbook(): Buffer {
    const rows = [
        header,
        ['1. 사업관리', '', ''],
        ['1.1 계획', '1.1.1', '엑셀 최신 제목', '엑셀 작업자', '', '승인 완료', '진행', '2026.01.01', '2026.01.10', 8, 0.5, 0.4, '', '', '', 0.25],
        ['3. 시스템 개발 및 테스트', '', ''],
        ['3.1 프로토타입', '3.1.1', '프로토타입 작업', '분석팀', '', '', '완료', '2026.02.01', '2026.02.05', 5, 1, 1, '2026.02.01', '2026.02.05', 5, 1],
        // 보호 분류는 필드가 잘못되어 있어도 검증/병합 대상이 아니다.
        ['3.2 시스템 개발', '3.2.1', '엑셀의 오래된 시스템 개발', '엑셀 작업자', '', '', '잘못된 상태', '', '', '', '', '', '', '', '', ''],
        ['3.3 데이터 이관', '3.3.1', '데이터 이관 작업', '이관팀', '', '', '대기', '2026.03.01', '2026.03.10', 8, 0, 0, '', '', '', 0],
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '관리_WBS');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function currentSchedules(): WbsDetailScheduleRecord[] {
    return [
        { id: 'root-1', parentId: null, order: 0, title: '1. 기존 사업관리', startDate: '2025.01.01', endDate: '2025.12.31', progress: 0 },
        { id: 'group-11', parentId: 'root-1', order: 0, title: '1.1 기존 계획', startDate: '2025.01.01', endDate: '2025.01.31', progress: 0 },
        {
            id: 'leaf-111', parentId: 'group-11', order: 0, scheduleCode: '1.1.1', title: '웹 예전 제목',
            startDate: '2025.01.01', endDate: '2025.01.02', worker: '웹 예전 작업자', deliverable: '삭제될 산출물',
            actualStartDate: '2025.01.01', actualEndDate: '2025.01.02', actualDays: 2, progress: 0,
        },
        { id: 'root-3', parentId: null, order: 2, title: '3. 시스템 개발 및 테스트', startDate: '2099.01.01', endDate: '2099.12.31', progress: 87 },
        { id: 'group-31', parentId: 'root-3', order: 0, title: '3.1 프로토타입', startDate: '2026.02.01', endDate: '2026.02.05', progress: 100 },
        { id: 'leaf-311', parentId: 'group-31', order: 0, scheduleCode: '3.1.1', title: '프로토타입 작업', startDate: '2026.02.01', endDate: '2026.02.05', progress: 100 },
        { id: 'group-32', parentId: 'root-3', order: 1, title: '3.2 시스템 개발', startDate: '2099.01.01', endDate: '2099.01.31', progress: 91 },
        { id: 'leaf-321', parentId: 'group-32', order: 0, scheduleCode: '3.2.1', title: '웹 최신 시스템 개발', startDate: '2099.01.01', endDate: '2099.01.31', worker: '웹 작업자', progress: 91 },
        { id: 'group-33', parentId: 'root-3', order: 2, title: '3.3 데이터 이관', startDate: '2026.03.01', endDate: '2026.03.10', progress: 0 },
        { id: 'leaf-331', parentId: 'group-33', order: 0, scheduleCode: '3.3.1', title: '데이터 이관 작업', startDate: '2026.03.01', endDate: '2026.03.10', progress: 0 },
        { id: 'web-only', parentId: null, order: 99, title: '웹에만 있는 일정', startDate: '2026.04.01', endDate: '2026.04.02', progress: 0 },
    ];
}

test('3.2 branch stays web-owned while other rows merge by WBS number', () => {
    const preview = buildWbsScheduleImportPreview(sourceWorkbook(), currentSchedules());

    assert.equal(preview.canApply, true);
    assert.equal(preview.summary.protected, 1);
    assert.equal(preview.summary.conflicts, 0);
    assert.equal(preview.summary.excluded, 0);
    assert.equal(preview.added.length, 0);
    assert.equal(preview.updates.some((item) => item.id === 'group-32' || item.id === 'leaf-321'), false);

    const root3Update = preview.updates.find((item) => item.id === 'root-3');
    assert.equal(root3Update, undefined, '3.2를 포함하는 상위 집계값도 엑셀 값으로 덮지 않는다');

    const leafUpdate = preview.updates.find((item) => item.id === 'leaf-111');
    assert.ok(leafUpdate);
    assert.equal(leafUpdate.patch.title, '엑셀 최신 제목');
    assert.equal(leafUpdate.patch.worker, '엑셀 작업자');
    assert.equal(leafUpdate.patch.planDays, 8);
    assert.equal(leafUpdate.patch.planProgress, 50);
    assert.equal(leafUpdate.patch.planRate, 40);
    assert.equal(leafUpdate.patch.progress, 25);
    assert.equal(leafUpdate.patch.status, '진행중');
    assert.equal(Object.prototype.hasOwnProperty.call(leafUpdate.patch, 'deliverable'), true);
    assert.equal(leafUpdate.patch.deliverable, undefined, '엑셀의 빈 값은 기존 웹 값을 지운다');

    const group33Update = preview.updates.find((item) => item.id === 'group-33');
    assert.ok(group33Update);
    assert.equal(group33Update.patch.order, 2, '보호 분류를 건너뛰어도 3.3 순서는 2로 유지한다');
    assert.equal(preview.updates.some((item) => item.id === 'web-only'), false, '파일에 없는 웹 일정은 삭제하지 않는다');
});
