/**
 * 한글 메뉴명 → 읽을 수 있는 프로그램 ID (UPPER_SNAKE)
 * 예: 신규등록 → NEW_REG, 기간별 국가별 신규등록 → PRD_CNTRY_NEW_REG
 */

const DICT = [
    // ── 긴 구문 (우선 매칭) ──
    ['자동차 등록증 재발급 신청 내역', 'VHCL_CERT_RISSU_LIST'],
    ['자동차 번호 예약 신청 내역', 'PLATE_RSV_LIST'],
    ['차량번호변경 신청 내역', 'CHNG_PLT_LIST'],
    ['번호판재발급 신청 내역', 'NOPLT_RISSU_LIST'],
    ['등록증재발급 신청 내역', 'VHCL_CERT_RISSU_LIST'],
    ['신규등록 신청 내역', 'NEW_REG_LIST'],
    ['이전등록 신청 내역', 'TRNS_REG_LIST'],
    ['말소등록 신청 내역', 'ERSR_REG_LIST'],
    ['전자업무 최종처리', 'WORK_PROC'],
    ['시,도(아이막),군(솜)별 자동차 등록 현황', 'PROV_DIST_VHCL_REG_STTS'],
    ['시,도(아이막)별 자동차 등록 현황', 'PROV_VHCL_REG_STTS'],
    ['기간별 지역별 번호 발급 통계', 'PRD_RGN_NO_ISSUE_STAT'],
    ['기간별 지역별 전체 현황', 'PRD_RGN_ALL_STTS'],
    ['기간별 지역별 변경등록', 'PRD_RGN_CHNG_REG'],
    ['기간별 지역별 말소등록', 'PRD_RGN_ERSR_REG'],
    ['기간별 지역별 이전등록', 'PRD_RGN_TRNS_REG'],
    ['기간별 국가별 신규등록', 'PRD_CNTRY_NEW_REG'],
    ['담당자별 자동차 등록 현황', 'PIC_VHCL_REG_STTS'],
    ['등록소별 자동차 등록 현황', 'REG_OFFC_VHCL_REG_STTS'],
    ['국가별 자동차 수입통계', 'CNTRY_VHCL_IMP_STAT'],
    ['제조사별 자동차 통계', 'MFR_VHCL_STAT'],
    ['대민포털 접수 통계', 'PORTAL_ACPT_STAT'],
    ['등록소 방문 접수 통계', 'REG_OFFC_VISIT_ACPT_STAT'],
    ['지급수단별 수수료 통계', 'PAY_MTH_FEE_STAT'],
    ['차량정보 조회(이력정보)', 'VHCL_INFO_HIST_INQ'],
    ['차량정보 조회 (이력정보)', 'VHCL_INFO_HIST_INQ'],
    ['차대번호 표기승인 신청(재표기)', 'VIN_MARK_APPR_REQ_RE'],
    ['자동차 번호 예약 (UB)', 'VHCL_NO_RSV_UB'],
    ['등록번호 생성(UB)', 'REG_NO_GEN_UB'],
    ['등록번호 생성(아이막)', 'REG_NO_GEN_AIMAK'],
    ['신규번호 관리(UB/아이막)', 'NEW_NO_MNG_UB_AIMAK'],
    ['번호판 제작(인쇄)', 'PLT_MFG_PRINT'],
    ['등록증 재발급(교체)', 'CERT_RISSU_REPLACE'],
    ['등록증 재발급 (교체)', 'CERT_RISSU_REPLACE'],
    ['자동차 등록 번호판 관리', 'VHCL_PLT_MNG'],
    ['자동차 사용자 관리', 'VHCL_USER_MNG'],
    ['자동차 등록번호 생성', 'VHCL_REG_NO_GEN'],
    ['자동차 등록증 관리', 'VHCL_CERT_MNG'],
    ['경정등록 이력 관리', 'MDFY_REG_HIST_MNG'],
    ['경정등록 이력', 'MDFY_REG_HIST'],
    ['업무처리 내역 조회', 'WORK_PROC_HIST_INQ'],
    ['등록번호 관리 현황', 'REG_NO_MNG_STTS'],
    ['등록번호판 관리 현황', 'REG_PLT_MNG_STTS'],
    ['등록증 관리 현황', 'CERT_MNG_STTS'],
    ['임시운행등록 현황', 'TEMP_RUN_REG_STTS'],
    ['경정등록 현황', 'MDFY_REG_STTS'],
    ['복원등록 현황', 'RCVRY_REG_STTS'],
    ['말소등록 현황', 'ERSR_REG_STTS'],
    ['변경등록 현황', 'CHNG_REG_STTS'],
    ['이전등록 현황', 'TRNS_REG_STTS'],
    ['신규등록 현황', 'NEW_REG_STTS'],
    ['번호판 제작 현황', 'PLT_MFG_STTS'],
    ['처리결과 알림 발송', 'PROC_RSLT_NTFY'],
    ['말소등록 예고 발송', 'ERSR_REG_NOTICE'],
    ['등록번호 배정 신청', 'REG_NO_ASSIGN_REQ'],
    ['등록증 재발급 신청', 'CERT_RISSU_REQ'],
    ['등록증 교체 신청', 'CERT_REPLACE_REQ'],
    ['번호판 재발급 신청', 'PLT_RISSU_REQ'],
    ['차량번호변경 신청', 'CHNG_PLT_REQ'],
    ['말소등록 신청', 'ERSR_REG_REQ'],
    ['이전등록 신청', 'TRNS_REG_REQ'],
    ['신규등록 신청', 'NEW_REG_REQ'],
    ['자동차 번호 예약 신청', 'PLATE_RSV_REQ'],
    ['사용자 등록 신청', 'USER_REG_REQ'],
    ['수입 절차 및 준비사항 안내', 'IMP_PROC_PREP_GUIDE'],
    ['제작 차량 정보 등록 안내', 'MFG_VHCL_INFO_REG_GUIDE'],
    ['등록 절차 및 서류 안내', 'REG_PROC_DOC_GUIDE'],
    ['검사 절차 및 서류 안내', 'INSP_PROC_DOC_GUIDE'],
    ['검사절차 안내', 'INSP_PROC_GUIDE'],
    ['등록절차 안내', 'REG_PROC_GUIDE'],
    ['서비스 업무 신청', 'SRV_WORK_REQ'],
    ['보고서 및 통계', 'RPT_STAT'],
    ['마감/정산 관리', 'CLOSE_SETTLE_MNG'],
    ['개인정보 처리 방침', 'PRIV_POLICY'],
    ['개인정보보호 방침', 'PRIV_POLICY'],
    ['개인정보처리방침', 'PRIV_POLICY'],
    ['알림 관리 (내외부)', 'NTFY_MNG_INOUT'],
    ['ID/PW 찾기', 'ID_PW_FIND'],
    ['POP-UP 관리', 'POPUP_MNG'],
    ['MY-PAGE', 'MYPAGE'],
    ['MVIMS(WEB)', 'MVIMS_WEB'],
    ['MVIMS(APP)', 'MVIMS_APP'],

    // ── 검사 도메인 ──
    ['내압용기 검사 예약', 'PRESS_VSL_INSP_RSV'],
    ['내압용기 검사 접수', 'PRESS_VSL_INSP_ACPT'],
    ['내압용기 검사 판정', 'PRESS_VSL_INSP_JDG'],
    ['내압용기 제원 관리', 'PRESS_VSL_SPEC_MNG'],
    ['차대번호 표기시행 접수', 'VIN_MARK_EXEC_ACPT'],
    ['차대번호 표기시행 신청', 'VIN_MARK_EXEC_REQ'],
    ['차대번호 표기시행 현황', 'VIN_MARK_EXEC_STTS'],
    ['차대번호 표기시행', 'VIN_MARK_EXEC'],
    ['차대번호 표기승인 접수', 'VIN_MARK_APPR_ACPT'],
    ['차대번호 표기승인 현황', 'VIN_MARK_APPR_STTS'],
    ['차대번호 표기승인', 'VIN_MARK_APPR'],
    ['차대번호 표기 승인 접수', 'VIN_MARK_APPR_ACPT'],
    ['차대번호 표기 신청', 'VIN_MARK_REQ'],
    ['차대번호 표기', 'VIN_MARK'],
    ['튜닝승인 신청', 'TUN_APPR_REQ'],
    ['튜닝 승인 접수', 'TUN_APPR_ACPT'],
    ['튜닝 승인 현황', 'TUN_APPR_STTS'],
    ['튜닝 검사 예약', 'TUN_INSP_RSV'],
    ['튜닝 검사 접수', 'TUN_INSP_ACPT'],
    ['튜닝 승인', 'TUN_APPR'],
    ['튜닝 현황', 'TUN_STTS'],
    ['정기 검사 예약', 'REGU_INSP_RSV'],
    ['정기 검사 접수', 'REGU_INSP_ACPT'],
    ['신규 검사 예약', 'NEW_INSP_RSV'],
    ['신규 검사 접수', 'NEW_INSP_ACPT'],
    ['기타 검사 접수', 'ETC_INSP_ACPT'],
    ['부분 검사 접수', 'PART_INSP_ACPT'],
    ['검사 경과 차량 조회', 'INSP_ELAPSE_VHCL_INQ'],
    ['재검사 이월 차량 조회', 'REINSP_CARRY_VHCL_INQ'],
    ['검사 내역 조회', 'INSP_HIST_INQ'],
    ['검사 모니터링', 'INSP_MON'],
    ['검사 판정', 'INSP_JDG'],
    ['검사 보고서', 'INSP_RPT'],
    ['검사 예약', 'INSP_RSV'],
    ['검사 장비 관리', 'INSP_EQP_MNG'],
    ['검사소 예약 정원 설정', 'INSP_STN_RSV_CAP_SET'],
    ['검사소 시설 관리', 'INSP_STN_FAC_MNG'],
    ['검사소 관리', 'INSP_STN_MNG'],
    ['검사소 안내', 'INSP_STN_GUIDE'],
    ['자동차 검사 현황', 'VHCL_INSP_STTS'],
    ['자동차 검사', 'VHCL_INSP'],
    ['전자 예약 접수', 'E_RSV_ACPT'],
    ['수검 차량 통계표', 'INSP_RECV_VHCL_STAT_TBL'],
    ['부적합 원인 분석표', 'NONCONF_CAUSE_ANAL_TBL'],
    ['정도검사 일정 관리', 'CALIB_INSP_SCH_MNG'],
    ['정도검사 관리', 'CALIB_INSP_MNG'],
    ['정도검사 현황', 'CALIB_INSP_STTS'],

    // ── 등록·조회·통계 ──
    ['등록 전문가 보고서', 'REG_EXPERT_RPT'],
    ['등록 전문가 상세 내역', 'REG_EXPERT_DTL_LIST'],
    ['등록 전문가 지급 내역', 'REG_EXPERT_PAY_LIST'],
    ['이전 세부 보고서', 'TRNS_DTL_RPT'],
    ['수입차량 세부 보고서', 'IMP_VHCL_DTL_RPT'],
    ['말소 자동차 보고서', 'ERSR_VHCL_RPT'],
    ['번호판 제조사 보고서', 'PLT_MFR_RPT'],
    ['번호판 색상별 보고서', 'PLT_COLOR_RPT'],
    ['번호판 보관 보고서', 'PLT_STORE_RPT'],
    ['등록증 보고서', 'CERT_RPT'],
    ['전체 전문가 보고서', 'ALL_EXPERT_RPT'],
    ['연령 보고서', 'AGE_RPT'],
    ['지점 보고서', 'BRCH_RPT'],
    ['전자결제 보고서', 'E_PAY_RPT'],
    ['수입 보고서', 'IMP_RPT'],
    ['마감 보고서', 'CLOSE_RPT'],
    ['부가세 보고서', 'VAT_RPT'],
    ['경고 보고서', 'WARN_RPT'],
    ['조건별 자료 조회', 'COND_DATA_INQ'],
    ['수입차량 정보처리', 'IMP_VHCL_INFO_PROC'],
    ['수입차 정보관리', 'IMP_VHCL_INFO_MNG'],
    ['수입 차량 정보 등록', 'IMP_VHCL_INFO_REG'],
    ['수입 차량 승인 신청', 'IMP_VHCL_APPR_REQ'],
    ['수입차량 관리', 'IMP_VHCL_MNG'],
    ['수입 차량', 'IMP_VHCL'],
    ['MMA 차량 등록', 'MMA_VHCL_REG'],
    ['차량 튜닝 제원 관리', 'VHCL_TUN_SPEC_MNG'],
    ['차량 제원 관리', 'VHCL_SPEC_MNG'],
    ['차량 내역 조회', 'VHCL_HIST_INQ'],
    ['차량 통합 정보', 'VHCL_INTG_INFO'],
    ['차량 관리', 'VHCL_MNG'],
    ['경고 차량 관리', 'WARN_VHCL_MNG'],
    ['경고 차량 현황', 'WARN_VHCL_STTS'],
    ['특이사항 관리', 'REMARK_MNG'],
    ['외부 공문 처리', 'EXT_DOC_PROC'],
    ['세금계산서 발급', 'TAX_INV_ISSUE'],
    ['환불 관리', 'REFUND_MNG'],
    ['연계 정보 관리', 'LINK_INFO_MNG'],
    ['연계 기관 조회', 'LINK_ORG_INQ'],
    ['운영 기준 관리', 'OPS_STD_MNG'],
    ['구비서류 관리', 'REQ_DOC_MNG'],
    ['SMS 발송 설정', 'SMS_SEND_SET'],
    ['SMS 발송 조회', 'SMS_SEND_INQ'],
    ['SMS 수동 발송', 'SMS_MANUAL_SEND'],
    ['진행 상황 조회', 'PROG_STTS_INQ'],
    ['진행상황 조회', 'PROG_STTS_INQ'],
    ['개인 정보 수정', 'PRIV_INFO_UPD'],
    ['개인정보 수정', 'PRIV_INFO_UPD'],
    ['자주 묻는 질문', 'FAQ'],
    ['번호 보관 연장', 'NO_STORE_EXT'],
    ['번호보관 연장 신청', 'NO_STORE_EXT_REQ'],
    ['자동차 정보 등록', 'VHCL_INFO_REG'],
    ['자동차 번호 선택', 'VHCL_NO_SEL'],
    ['자동차 등록', 'VHCL_REG'],
    ['등록신청', 'REG_REQ'],
    ['정보 센터', 'INFO_CTR'],
    ['기관 안내', 'ORG_GUIDE'],
    ['회원가입 화면', 'SIGNUP_SCR'],
    ['로그인 화면', 'LOGIN_SCR'],
    ['메인 화면', 'MAIN_SCR'],
    ['전자아카이브 관리', 'E_ARCHIVE_MNG'],
    ['번호판 제작사 관리', 'PLT_MFR_MNG'],
    ['번호판 제작 관리', 'PLT_MFG_MNG'],
    ['업무처리 현황', 'WORK_PROC_STTS'],
    ['사용자 권한 관리', 'USER_AUTH_MNG'],
    ['사용자 그룹 관리', 'USER_GRP_MNG'],
    ['사용기관 관리', 'USER_ORG_MNG'],
    ['사용자 관리', 'USER_MNG'],
    ['공통코드 관리', 'COM_CD_MNG'],
    ['접속 로그 확인', 'ACCS_LOG_INQ'],
    ['압류 등록 관리', 'SEIZURE_REG_MNG'],
    ['일마감 처리', 'DAILY_CLOSE_PROC'],
    ['일 마감 처리', 'DAILY_CLOSE_PROC'],
    ['보관번호 조회', 'STORE_NO_INQ'],
    ['신규번호 현황', 'NEW_NO_STTS'],
    ['경매번호 현황', 'AUCT_NO_STTS'],
    ['말소알림 관리', 'ERSR_NTFY_MNG'],
    ['자동차번호 보관', 'VHCL_NO_STORE'],
    ['등록 서비스', 'REG_SVC'],
    ['서비스 접수', 'SRV_ACPT'],
    ['서비스 정책', 'SRV_POLICY'],
    ['관리 업무', 'MGMT_WORK'],
    ['번호판 분실 재발급', 'PLT_LOST_RISSU'],
    ['차량번호 변경', 'CHNG_PLT'],
    ['차량 번호 변경', 'CHNG_PLT'],
    ['등록증 재발급', 'CERT_RISSU'],
    ['등록증 교체', 'CERT_REPLACE'],
    ['번호판 재발급', 'PLT_RISSU'],
    ['번호판 제작', 'PLT_MFG'],
    ['임시운행 등록', 'TEMP_RUN_REG'],
    ['전자업무', 'E_WORK'],
    ['공지 사항', 'NOTICE'],
    ['공지사항', 'NOTICE'],
    ['자유 게시판', 'FREE_BBS'],
    ['메뉴 관리', 'MENU_MNG'],
    ['환경 관리', 'ENV_MNG'],
    ['시스템 관리', 'SYSTEM_MNG'],
    ['코드 관리', 'CD_MNG'],
    ['권한 관리', 'AUTH_MNG'],
    ['로그 관리', 'LOG_MNG'],
    ['알림 관리', 'NTFY_MNG'],
    ['수수료 관리', 'FEE_MNG'],
    ['운영 관리', 'OPS_MNG'],
    ['교육 과정 관리', 'EDU_CRS_MNG'],
    ['교육 관리', 'EDU_MNG'],
    ['교육 신청', 'EDU_REQ'],
    ['교육 현황', 'EDU_STTS'],
    ['기술위원 관리', 'TECH_MNG'],
    ['예비 부품 관리', 'SPARE_PART_MNG'],
    ['유지보수 기록 관리', 'MAINT_REC_MNG'],
    ['장비 관리', 'EQP_MNG'],
    ['참조 정보', 'REF_INFO'],
    ['주소 조회', 'ADDR_INQ'],
    ['제조국 조회', 'MFG_CNTRY_INQ'],
    ['법규 조회', 'LAW_INQ'],
    ['업무 처리', 'WORK_PROC'],
    ['기타 업무', 'ETC_WORK'],
    ['복원등록', 'RCVRY_REG'],
    ['경정등록', 'MDFY_REG'],
    ['변경등록', 'CHNG_REG'],
    ['말소등록', 'ERSR_REG'],
    ['이전등록', 'TRNS_REG'],
    ['신규등록', 'NEW_REG'],
    ['등록번호 생성', 'REG_NO_GEN'],
    ['압류 관리', 'SEIZURE_MNG'],
    ['압류 조회', 'SEIZURE_INQ'],
    ['자료실', 'ARCHIVE'],
    ['마이페이지', 'MYPAGE'],
    ['메인화면', 'MAIN'],
    ['로그인', 'LOGIN'],
    ['게시판', 'BBS'],
    ['서비스', 'SRV'],
    ['일마감', 'DAILY_CLOSE'],
    ['일 마감', 'DAILY_CLOSE'],
    ['조회', 'INQ'],
    ['통계', 'STAT'],
    ['보고서', 'RPT'],
    ['검사', 'INSP'],
    ['등록', 'REG'],
    ['아카이브', 'ARCHIVE'],
    ['이용약관', 'TERMS'],
    ['전체 자동차', 'ALL_VHCL'],
    ['자동차 소유자', 'VHCL_OWNER'],
    ['이전 소유자', 'PREV_OWNER'],
    ['제작사 관리', 'MFR_MNG'],
    ['신규번호 관리', 'NEW_NO_MNG'],
    ['MVIMS', 'MVIMS'],
    ['공통', 'COMMON'],

    ['임시 제원 관리', 'TEMP_SPEC_MNG'],
    ['자동차 통합 정보', 'VHCL_INTG_INFO'],
    ['차량정보 조회', 'VHCL_INFO_INQ'],
    ['이력정보', 'HIST_INFO'],
    ['이력', 'HIST'],
    ['차량정보', 'VHCL_INFO'],
    ['제원', 'SPEC'],
    ['임시', 'TEMP'],
    ['통합', 'INTG'],
    ['정보', 'INFO'],
    ['번호', 'NO'],
    ['예약', 'RSV'],
    ['선택', 'SEL'],
    ['시도', 'PROV'],
    ['군', 'DIST'],

    // ── 단어 조각 (별·접미) ──
    ['기간별', 'PRD'],
    ['국가별', 'CNTRY'],
    ['지역별', 'RGN'],
    ['담당자별', 'PIC'],
    ['제조사별', 'MFR'],
    ['지급수단별', 'PAY_MTH'],
    ['조건별', 'COND'],
    ['등록소별', 'REG_OFFC'],
    ['색상별', 'COLOR'],
];

const SORTED = [...DICT].sort((a, b) => b[0].replace(/\s/g, '').length - a[0].replace(/\s/g, '').length);

function extractParenCodes(name) {
    const codes = [];
    const re = /\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(name)) !== null) {
        for (const part of m[1].split(/[/,]/)) {
            const t = part.trim();
            if (/^UB$/i.test(t)) codes.push('UB');
            else if (t.includes('아이막')) codes.push('AIMAK');
            else if (/솜/.test(t)) codes.push('SOM');
            else if (/인쇄/.test(t)) codes.push('PRINT');
            else if (t) codes.push(t.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10));
        }
    }
    return codes.filter(Boolean);
}

function normalizeForMatch(name) {
    return name
        .replace(/,/g, '')
        .replace(/\s+/g, '')
        .trim();
}

function appendParenCodes(code, parenCodes) {
    const parts = [code];
    for (const pc of parenCodes) {
        if (code === pc || code.endsWith(`_${pc}`) || code.includes(`_${pc}_`)) continue;
        parts.push(pc);
    }
    return joinParts(...parts);
}

function greedyEncode(remain) {
    const tokens = [];
    let guard = 0;
    while (remain.length > 0 && guard++ < 200) {
        let hit = null;
        for (const [phrase, code] of SORTED) {
            const pc = normalizeForMatch(phrase);
            if (remain.startsWith(pc)) {
                hit = [pc, code];
                break;
            }
        }
        if (!hit) break;
        tokens.push(hit[1]);
        remain = remain.slice(hit[0].length);
    }
    return { tokens, remain };
}

export function encodeMenuName(name) {
    const parenCodes = extractParenCodes(name);
    const fullNorm = normalizeForMatch(name);

    // 1) 전체 메뉴명 정확 일치 (괄호 포함)
    for (const [phrase, code] of SORTED) {
        if (normalizeForMatch(phrase) === fullNorm) {
            return appendParenCodes(code, parenCodes);
        }
    }

    // 2) 괄호 포함 상태에서 greedy 분해
    let { tokens, remain } = greedyEncode(fullNorm);

    // 3) 괄호 내용만 제거 후 재시도 (더 잘 맞으면 교체)
    const noParenNorm = normalizeForMatch(name.replace(/\([^)]*\)/g, ''));
    if (tokens.length === 0 || remain.length > 0) {
        const alt = greedyEncode(noParenNorm);
        if (alt.tokens.length > tokens.length || (alt.tokens.length > 0 && remain.length > 0)) {
            tokens = alt.tokens;
            remain = alt.remain;
        }
    }

    if (tokens.length === 0) {
        return appendParenCodes('UNK', parenCodes);
    }

    return appendParenCodes(joinParts(...tokens), parenCodes);
}

function inferPathPrefix(pathParts) {
    const p = pathParts.join('>');
    if (/^MVIMS\s*\(WEB\)/i.test(p)) return 'WEB';
    if (/^MVIMS\s*\(APP\)/i.test(p)) return 'APP';
    if (p.includes('전자업무>전자업무>') && p.includes('최종처리')) return 'E';
    if (/전자업무>전자업무/.test(p)) return 'E';
    if (/등록>전자업무$/.test(p) || (p.endsWith('>전자업무') && !p.includes('전자업무>전자업무'))) return 'E_SECT';
    if (p.includes('등록>서비스')) return 'SRV';
    if (p.includes('등록>통계')) return 'STAT';
    if (p.includes('관리 업무') || p.includes('관리업무')) return 'MGMT';
    if (p.includes('번호판 제작')) return 'PLT';
    if (p.includes('MVIMS>등록>조회') || (p.includes('>조회>') && !p.includes('압류 조회'))) return 'INQ';
    if (/^MVIMS>검사/.test(p) || (p.includes('>검사>') && !p.includes('자동차 검사'))) return 'INSP';
    if (p.includes('게시판>')) return 'BBS';
    if (p.includes('시스템 관리')) return 'SYS';
    if (p.includes('MVIMS>공통')) return 'COM';
    return '';
}

function joinParts(...parts) {
    return parts.filter(Boolean).join('_').replace(/__+/g, '_').replace(/^_|_$/g, '');
}

function dedupeSuffix(leaf, ctx) {
    if (!ctx) return leaf;
    const ctxParts = ctx.split('_');
    const leafParts = leaf.split('_');
    while (leafParts.length && ctxParts.includes(leafParts[0])) leafParts.shift();
    return leafParts.join('_') || leaf;
}

export function buildProgramId(menu, pathParts, parentProgramId) {
    const leaf = encodeMenuName(menu.name);
    const ctx = inferPathPrefix(pathParts);

    if (menu.name === 'MVIMS') return 'MVIMS';
    if (menu.name === '등록' && pathParts.length === 2) return 'REGISTER';
    if (menu.name === '검사' && pathParts.length === 2) return 'INSP';
    if (menu.name === '통계' && pathParts.join('>').includes('등록>통계')) return 'STAT';
    if (menu.name === '조회' && pathParts.join('>').includes('등록>조회')) return 'INQ';

    if (ctx === 'E_SECT') {
        if (leaf === 'E_WORK') return 'REGISTERSERVICE';
        return joinParts('REGISTER', dedupeSuffix(leaf, 'REGISTER'));
    }
    if (ctx === 'E') {
        if (leaf === 'E_WORK') return 'E_WORK';
        return joinParts('E', dedupeSuffix(leaf, 'E'));
    }
    if (ctx === 'E_WORK_PROC') return joinParts('E', dedupeSuffix(leaf, 'E'));

    const ctxMap = {
        WEB: 'WEB',
        APP: 'APP',
        SRV: 'SRV',
        MGMT: 'MGMT',
        PLT: 'PLT',
        INQ: 'INQ',
        INSP: 'INSP',
        STAT: 'STAT',
        SYS: 'SYS',
        COM: 'COM',
        BBS: 'BBS',
    };

    if (ctx && ctxMap[ctx]) {
        const prefix = ctxMap[ctx];
        if (ctx === 'SRV' && leaf === 'SRV') return 'SRV_REG';
        const body = dedupeSuffix(leaf, prefix);
        if (!body || body === prefix) return prefix;
        return joinParts(prefix, body);
    }

    return leaf;
}

export function ensureUnique(id, used) {
    if (!used.has(id)) return id;
    let n = 2;
    while (used.has(`${id}_${n}`)) n++;
    return `${id}_${n}`;
}
