import * as XLSX from 'xlsx';
import type { WbsData, WbsMenuNode } from '../../types/wbs';
import { WBS_STATUS_LABEL } from '../../types/wbs';

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

/** 현재 WBS 상태를 엑셀(.xlsx)로 다운로드 */
export function downloadWbsExcel(data: WbsData, projectName: string): void {
    const { menus, rows } = data;

    // 시트1: 개발 상세 (행 단위)
    const detail = rows.map((r) => ({
        '메뉴경로': menuPath(menus, r.menuId),
        '메뉴코드': menus.find((m) => m.id === r.menuId)?.menuCode ?? '',
        '구분(산출물)': r.category,
        '기능명': r.featureName,
        '담당자': r.assignee,
        '시작일': r.startDate,
        '종료일': r.endDate,
        '상태': WBS_STATUS_LABEL[r.status],
        '진행율(%)': r.progress,
        '비고': r.note ?? '',
    }));

    // 시트2: 메뉴 구조
    const menuSheet = menus
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((m) => ({
            '메뉴코드': m.menuCode,
            '메뉴명': m.name,
            '전체경로': menuPath(menus, m.id),
            '상위메뉴코드': m.parentId ? (menus.find((x) => x.id === m.parentId)?.menuCode ?? '') : '',
        }));

    const wb = XLSX.utils.book_new();
    const wsDetail = XLSX.utils.json_to_sheet(detail.length ? detail : [{ '메뉴경로': '', '메뉴코드': '', '구분(산출물)': '', '기능명': '', '담당자': '', '시작일': '', '종료일': '', '상태': '', '진행율(%)': '', '비고': '' }]);
    wsDetail['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 9 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsDetail, '개발상세');

    const wsMenu = XLSX.utils.json_to_sheet(menuSheet.length ? menuSheet : [{ '메뉴코드': '', '메뉴명': '', '전체경로': '', '상위메뉴코드': '' }]);
    wsMenu['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 36 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsMenu, '메뉴구조');

    const safeName = (projectName || 'WBS').replace(/[\\/:*?"<>|]/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${safeName}_WBS_${today}.xlsx`);
}
