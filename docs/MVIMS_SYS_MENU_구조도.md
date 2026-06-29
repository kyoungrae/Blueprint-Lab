# MVIMS SYS_MENU 메뉴 구조도

> DB 테이블 `NEW_MVIMS.SYS_MENU` 기준 메뉴 코드·프로그램 ID 매핑 문서
> Blueprint-Lab WBS 메뉴 구조도 입력 시 `menuCode` = `MENU_CD`, `programId` = `PRGM_URL` 로 사용
>
> 관련 파일: `MVIMS_SYS_MENU_WBS.json`(JSON 가져오기), `MVIMS_SYS_MENU_메뉴데이터.tsv`(엑셀 메뉴데이터 시트 붙여넣기)

총 메뉴 수: **69**개 (사용 중: **63**개)

## 필드 매핑

| DB 컬럼 | WBS 필드 | 설명 |
|---------|----------|------|
| `MENU_CD` | menuCode | 메뉴 코드 (고유) |
| `MENU_NM_KR` | name | 메뉴명 |
| `PRGM_URL` | programId | 프로그램 ID |
| `TOP_MENU_CD` | parentId (코드로 연결) | 상위 메뉴 코드 (`-` = 최상위) |
| `MENU_NO` | order | 형제 간 정렬 순서 |
| `MENU_UNQ_NO` | — | DB 고유번호 (참고용) |
| `URL` | — | 화면 URL 경로 (참고용) |
| `USE_YN` | — | 사용 여부 (`1`=사용) |

## 메뉴 트리

- **전자업무** `registerService`
  - 프로그램 ID: `/reg` · URL: # · UNQ: 120 · LVL: 0
  - **전자업무** `E_WORK`
    - 프로그램 ID: `#` · URL: # · UNQ: 121 · LVL: 1
    - **신규등록 신청 내역** `E_NEW_REG_LIST`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 125 · LVL: 2
    - **이전등록 신청 내역** `E_TRNS_REG`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 126 · LVL: 2
    - **말소등록 신청 내역** `E_ERSR_REG`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 127 · LVL: 2
    - **차량번호 변경 신청 내역** `E_CHNG_PLT`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 128 · LVL: 2
    - **번호판 재발급 신청 내역** `E_NOPLT_RISSU`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 129 · LVL: 2
    - **자동차 등록증 재발급 신청 내역** `E_VHCL_CERT_RISSU`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 130 · LVL: 2
    - **자동차 번호 예약 신청 내역** `E_PLATE_RSV`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 131 · LVL: 2
  - **전자 업무 최종 처리** `E_WORK_PROC`
    - 프로그램 ID: `#` · URL: # · UNQ: 134 · LVL: 1
    - **전자업무 최종처리** `E_WORK_PROC_LIST`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 135 · LVL: 2
- **서비스** `SRV`
  - 프로그램 ID: `#` · URL: # · UNQ: 136 · LVL: 0
  - **등록 서비스** `SRV_REG`
    - 프로그램 ID: `#` · URL: # · UNQ: 137 · LVL: 1
    - **신규등록** `SRV_NEW_REG`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 139 · LVL: 2
    - **이전등록** `SRV_TRNS_REG`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 140 · LVL: 2
    - **변경등록** `SRV_VHCL_CHNG_REG`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 141 · LVL: 2
    - **말소등록** `SRV_ERSR_REG`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 142 · LVL: 2
    - **복원등록** `SRV_RCVRY_ERSR_REG`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 143 · LVL: 2
    - **경정등록** `SRV_MDFY_REG`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 144 · LVL: 2
  - **자동차 등록 번호판 관리** `SRV_VHCL_PLT_MNG`
    - 프로그램 ID: `/reg` · URL: # · UNQ: 145 · LVL: 1
    - **번호판 분실 재발급** `SRV_PLT_REISSU`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 146 · LVL: 2
  - **자동차 사용자 관리** `SRV_VHCL_USER_MNG`
    - 프로그램 ID: `/reg` · URL: # · UNQ: 147 · LVL: 1
    - **자동차 사용자 관리** `SRV_VHCL_USER`
      - 프로그램 ID: `/reg` · URL: # · UNQ: 148 · LVL: 2
- **테스트 페이지** `test1` `[미사용]`
  - 프로그램 ID: — · URL: # · UNQ: 14 · LVL: 0
  - **테스트 페이지 목록** `test11`
    - 프로그램 ID: `#` · URL: `1` · UNQ: 52 · LVL: 1
    - **list** `test111`
      - 프로그램 ID: `/cms` · URL: `/sample/test/sysUserList` · UNQ: 53 · LVL: 2
    - **testest** `testtest`
      - 프로그램 ID: `/cms` · URL: `/sample/test/sysBbsBoardRegister` · UNQ: 108 · LVL: 2
    - **detail** `test222`
      - 프로그램 ID: `/cms` · URL: `/sample/test/sysUserDetail` · UNQ: 81 · LVL: 2
    - **modify** `test333`
      - 프로그램 ID: `/cms` · URL: `/sample/test/sysUserModify` · UNQ: 82 · LVL: 2
    - **register** `test444`
      - 프로그램 ID: `/cms` · URL: `/sample/test/sysUserRegister` · UNQ: 83 · LVL: 2
- **설정/관리** `SETTINGS`
  - 프로그램 ID: — · URL: # · UNQ: 2 · LVL: 0
  - **사용자 관리** `USER_MANAGEMENT`
    - 프로그램 ID: — · URL: # · UNQ: 63 · LVL: 1
    - **사용자 목록** `USER_LIST`
      - 프로그램 ID: `/cms` · URL: `/user/sysUserList` · UNQ: 64 · LVL: 2
    - **사용자 등록 신청** `USER_REQ`
      - 프로그램 ID: `/cms` · URL: `/user/sysUserReqList` · UNQ: 149 · LVL: 2
  - **소속/그룹관리** `GROUP_MANAGEMENT`
    - 프로그램 ID: — · URL: # · UNQ: 45 · LVL: 1
    - **소속설정** `OFFICE_SETTINGS`
      - 프로그램 ID: `/cms` · URL: `/office/sysOfficeList` · UNQ: 66 · LVL: 2
    - **그룹설정** `GROUP_SETTINGS`
      - 프로그램 ID: `/cms` · URL: `/group/sysDeptGroupList` · UNQ: 46 · LVL: 2
  - **메뉴관리** `MENU_MANAGEMENT`
    - 프로그램 ID: — · URL: # · UNQ: 3 · LVL: 1
    - **메뉴설정** `MENU_SETTINGS`
      - 프로그램 ID: `/cms` · URL: `/menu/menuSettingsV2` · UNQ: 1 · LVL: 2
  - **시스템관리** `SYSTEM_MANAGEMENT`
    - 프로그램 ID: — · URL: # · UNQ: 48 · LVL: 1
    - **코드설정** `COM_CODE_SETTINGS`
      - 프로그램 ID: `/cms` · URL: `/code/codeSetting` · UNQ: 67 · LVL: 2
    - **시스템설정** `SYSTEM_SETTINGS`
      - 프로그램 ID: `/cms` · URL: `/site/siteConfigList` · UNQ: 49 · LVL: 2
    - **로그 확인** `COM_EVENT_LOG`
      - 프로그램 ID: `/cms` · URL: `/site/sysEventLogList` · UNQ: 86 · LVL: 2
    - **접속 로그 확인** `SYS_ACS_LOG`
      - 프로그램 ID: `/cms` · URL: `/site/sysAccsLogList` · UNQ: 87 · LVL: 2
  - **게시판 관리** `SYS_BBS_MST`
    - 프로그램 ID: `#` · URL: # · UNQ: 88 · LVL: 1
    - **게시판 유형 관리** `SYS_BBS_MST_LIST`
      - 프로그램 ID: `/cms` · URL: `/bbs/sysBbsMstList` · UNQ: 89 · LVL: 2
    - **게시판 관리** `SYS_BBS_POST_MNG` `[미사용]`
      - 프로그램 ID: `/cms` · URL: `/bbs/sysBbsList` · UNQ: 90 · LVL: 2
- **게시판** `SYS_BBS`
  - 프로그램 ID: `#` · URL: # · UNQ: 91 · LVL: 0
  - **게시판 목록** `BBS_LIST`
    - 프로그램 ID: `#` · URL: # · UNQ: 92 · LVL: 1
    - **기본형 게시판** `BASIC` `[미사용]`
      - 프로그램 ID: `/cms` · URL: `/bbs/bbsLayout_basic` · UNQ: 93 · LVL: 2
    - **자유게시판** `6d827cc7-f881-4a72-b482-2e48c3268637`
      - 프로그램 ID: `cms` · URL: `/bbs/view` · UNQ: 104 · LVL: 2
    - **갤러리** `ec9302c6-e509-4250-a518-e2c7fe9fe161`
      - 프로그램 ID: `cms` · URL: `/bbs/view` · UNQ: 105 · LVL: 2
    - **공지 게시판** `99de7413-878a-4db4-8549-6f8004b35064`
      - 프로그램 ID: `cms` · URL: `/bbs/view` · UNQ: 106 · LVL: 2
    - **갤러리형 게시판** `GALLERY` `[미사용]`
      - 프로그램 ID: `/cms` · URL: `/bbs/bbsLayout_gallery` · UNQ: 94 · LVL: 2
    - **공지형 게시판** `NOTICE` `[미사용]`
      - 프로그램 ID: `/cms` · URL: `/bbs/bbsLayout_notice` · UNQ: 95 · LVL: 2
- **개발가이드** `DEVELOPER_GUID_MANAGEMENT`
  - 프로그램 ID: — · URL: # · UNQ: 59 · LVL: 0
  - **기능 가이드** `DEVELOPER_FUNCTION`
    - 프로그램 ID: `#` · URL: # · UNQ: 68 · LVL: 1
    - **JS 기능 목록** `JS_FUNCTION_LIST`
      - 프로그램 ID: `/cms` · URL: `/guid/jsGuid` · UNQ: 69 · LVL: 2
  - **개발가이드** `DEVELOPER_GUID`
    - 프로그램 ID: — · URL: # · UNQ: 60 · LVL: 1
    - **JS 개발 가이드 목록** `JS_FUNC_DEV_GUID`
      - 프로그램 ID: `/cms` · URL: `/guid/jsDevGuid` · UNQ: 70 · LVL: 2
    - **CSS 개발 가이드 목록** `CSS_DEVELOP_GUID` `[미사용]`
      - 프로그램 ID: `/cms` · URL: `/guid/cssGuid` · UNQ: 62 · LVL: 2
    - **BACK-END 개발 가이드 목록** `BACKEND_DEVELOP_GUID`
      - 프로그램 ID: `/cms` · URL: `/guid/backendGuid` · UNQ: 65 · LVL: 2
- **샘플페이지** `SAMPLE`
  - 프로그램 ID: — · URL: # · UNQ: 71 · LVL: 0
  - **샘플페이지** `SAMPLE_PAGE`
    - 프로그램 ID: — · URL: # · UNQ: 73 · LVL: 1
    - **등록페이지 샘플** `SAMPLE_REG`
      - 프로그램 ID: `/cms` · URL: `/sample/sampleRegister` · UNQ: 74 · LVL: 2
    - **수정페이지 샘플** `SAMPLE_MOD`
      - 프로그램 ID: `/cms` · URL: `/sample/sampleModify` · UNQ: 75 · LVL: 2
    - **상세페이지 샘플** `SAMPLE_DETAIL`
      - 프로그램 ID: `/cms` · URL: `/sample/sampleDetail` · UNQ: 79 · LVL: 2
    - **목록페이지 샘플(팝업형)** `SAMPLE_LIST`
      - 프로그램 ID: `/cms` · URL: `/sample/samplePopupList` · UNQ: 80 · LVL: 2
    - **목록페이지 샘플(이동형)** `SAMPLE_R_LIST`
      - 프로그램 ID: `/cms` · URL: `/sample/sampleRedirectList` · UNQ: 85 · LVL: 2

## 전체 목록 (정렬: 레벨 → 상위코드 → 순번)

| LVL | MENU_CD | 메뉴명 | 상위코드 | PRGM_URL | URL | UNQ | 사용 |
|-----|---------|--------|----------|----------|-----|-----|------|
| 0 | `registerService` | 전자업무 | `-` | `/reg` | `#` | 120 | Y |
| 0 | `SRV` | 서비스 | `-` | `#` | `#` | 136 | Y |
| 0 | `test1` | 테스트 페이지 | `-` | `` | `#` | 14 | N |
| 0 | `SETTINGS` | 설정/관리 | `-` | `` | `#` | 2 | Y |
| 0 | `SYS_BBS` | 게시판 | `-` | `#` | `#` | 91 | Y |
| 0 | `DEVELOPER_GUID_MANAGEMENT` | 개발가이드 | `-` | `` | `#` | 59 | Y |
| 0 | `SAMPLE` | 샘플페이지 | `-` | `` | `#` | 71 | Y |
| 1 | `DEVELOPER_FUNCTION` | 기능 가이드 | `DEVELOPER_GUID_MANAGEMENT` | `#` | `#` | 68 | Y |
| 1 | `DEVELOPER_GUID` | 개발가이드 | `DEVELOPER_GUID_MANAGEMENT` | `` | `#` | 60 | Y |
| 1 | `SAMPLE_PAGE` | 샘플페이지 | `SAMPLE` | `` | `#` | 73 | Y |
| 1 | `USER_MANAGEMENT` | 사용자 관리 | `SETTINGS` | `` | `#` | 63 | Y |
| 1 | `GROUP_MANAGEMENT` | 소속/그룹관리 | `SETTINGS` | `` | `#` | 45 | Y |
| 1 | `MENU_MANAGEMENT` | 메뉴관리 | `SETTINGS` | `` | `#` | 3 | Y |
| 1 | `SYSTEM_MANAGEMENT` | 시스템관리 | `SETTINGS` | `` | `#` | 48 | Y |
| 1 | `SYS_BBS_MST` | 게시판 관리 | `SETTINGS` | `#` | `#` | 88 | Y |
| 1 | `SRV_REG` | 등록 서비스 | `SRV` | `#` | `#` | 137 | Y |
| 1 | `SRV_VHCL_PLT_MNG` | 자동차 등록 번호판 관리 | `SRV` | `/reg` | `#` | 145 | Y |
| 1 | `SRV_VHCL_USER_MNG` | 자동차 사용자 관리 | `SRV` | `/reg` | `#` | 147 | Y |
| 1 | `BBS_LIST` | 게시판 목록 | `SYS_BBS` | `#` | `#` | 92 | Y |
| 1 | `E_WORK` | 전자업무 | `registerService` | `#` | `#` | 121 | Y |
| 1 | `E_WORK_PROC` | 전자 업무 최종 처리 | `registerService` | `#` | `#` | 134 | Y |
| 1 | `test11` | 테스트 페이지 목록 | `test1` | `#` | `1` | 52 | Y |
| 2 | `BASIC` | 기본형 게시판 | `BBS_LIST` | `/cms` | `/bbs/bbsLayout_basic` | 93 | N |
| 2 | `6d827cc7-f881-4a72-b482-2e48c3268637` | 자유게시판 | `BBS_LIST` | `cms` | `/bbs/view` | 104 | Y |
| 2 | `ec9302c6-e509-4250-a518-e2c7fe9fe161` | 갤러리 | `BBS_LIST` | `cms` | `/bbs/view` | 105 | Y |
| 2 | `99de7413-878a-4db4-8549-6f8004b35064` | 공지 게시판 | `BBS_LIST` | `cms` | `/bbs/view` | 106 | Y |
| 2 | `GALLERY` | 갤러리형 게시판 | `BBS_LIST` | `/cms` | `/bbs/bbsLayout_gallery` | 94 | N |
| 2 | `NOTICE` | 공지형 게시판 | `BBS_LIST` | `/cms` | `/bbs/bbsLayout_notice` | 95 | N |
| 2 | `JS_FUNCTION_LIST` | JS 기능 목록 | `DEVELOPER_FUNCTION` | `/cms` | `/guid/jsGuid` | 69 | Y |
| 2 | `JS_FUNC_DEV_GUID` | JS 개발 가이드 목록 | `DEVELOPER_GUID` | `/cms` | `/guid/jsDevGuid` | 70 | Y |
| 2 | `CSS_DEVELOP_GUID` | CSS 개발 가이드 목록 | `DEVELOPER_GUID` | `/cms` | `/guid/cssGuid` | 62 | N |
| 2 | `BACKEND_DEVELOP_GUID` | BACK-END 개발 가이드 목록 | `DEVELOPER_GUID` | `/cms` | `/guid/backendGuid` | 65 | Y |
| 2 | `E_NEW_REG_LIST` | 신규등록 신청 내역 | `E_WORK` | `/reg` | `#` | 125 | Y |
| 2 | `E_TRNS_REG` | 이전등록 신청 내역 | `E_WORK` | `/reg` | `#` | 126 | Y |
| 2 | `E_ERSR_REG` | 말소등록 신청 내역 | `E_WORK` | `/reg` | `#` | 127 | Y |
| 2 | `E_CHNG_PLT` | 차량번호 변경 신청 내역 | `E_WORK` | `/reg` | `#` | 128 | Y |
| 2 | `E_NOPLT_RISSU` | 번호판 재발급 신청 내역 | `E_WORK` | `/reg` | `#` | 129 | Y |
| 2 | `E_VHCL_CERT_RISSU` | 자동차 등록증 재발급 신청 내역 | `E_WORK` | `/reg` | `#` | 130 | Y |
| 2 | `E_PLATE_RSV` | 자동차 번호 예약 신청 내역 | `E_WORK` | `/reg` | `#` | 131 | Y |
| 2 | `E_WORK_PROC_LIST` | 전자업무 최종처리 | `E_WORK_PROC` | `/reg` | `#` | 135 | Y |
| 2 | `OFFICE_SETTINGS` | 소속설정 | `GROUP_MANAGEMENT` | `/cms` | `/office/sysOfficeList` | 66 | Y |
| 2 | `GROUP_SETTINGS` | 그룹설정 | `GROUP_MANAGEMENT` | `/cms` | `/group/sysDeptGroupList` | 46 | Y |
| 2 | `MENU_SETTINGS` | 메뉴설정 | `MENU_MANAGEMENT` | `/cms` | `/menu/menuSettingsV2` | 1 | Y |
| 2 | `SAMPLE_REG` | 등록페이지 샘플 | `SAMPLE_PAGE` | `/cms` | `/sample/sampleRegister` | 74 | Y |
| 2 | `SAMPLE_MOD` | 수정페이지 샘플 | `SAMPLE_PAGE` | `/cms` | `/sample/sampleModify` | 75 | Y |
| 2 | `SAMPLE_DETAIL` | 상세페이지 샘플 | `SAMPLE_PAGE` | `/cms` | `/sample/sampleDetail` | 79 | Y |
| 2 | `SAMPLE_LIST` | 목록페이지 샘플(팝업형) | `SAMPLE_PAGE` | `/cms` | `/sample/samplePopupList` | 80 | Y |
| 2 | `SAMPLE_R_LIST` | 목록페이지 샘플(이동형) | `SAMPLE_PAGE` | `/cms` | `/sample/sampleRedirectList` | 85 | Y |
| 2 | `SRV_NEW_REG` | 신규등록 | `SRV_REG` | `/reg` | `#` | 139 | Y |
| 2 | `SRV_TRNS_REG` | 이전등록 | `SRV_REG` | `/reg` | `#` | 140 | Y |
| 2 | `SRV_VHCL_CHNG_REG` | 변경등록 | `SRV_REG` | `/reg` | `#` | 141 | Y |
| 2 | `SRV_ERSR_REG` | 말소등록 | `SRV_REG` | `/reg` | `#` | 142 | Y |
| 2 | `SRV_RCVRY_ERSR_REG` | 복원등록 | `SRV_REG` | `/reg` | `#` | 143 | Y |
| 2 | `SRV_MDFY_REG` | 경정등록 | `SRV_REG` | `/reg` | `#` | 144 | Y |
| 2 | `SRV_PLT_REISSU` | 번호판 분실 재발급 | `SRV_VHCL_PLT_MNG` | `/reg` | `#` | 146 | Y |
| 2 | `SRV_VHCL_USER` | 자동차 사용자 관리 | `SRV_VHCL_USER_MNG` | `/reg` | `#` | 148 | Y |
| 2 | `COM_CODE_SETTINGS` | 코드설정 | `SYSTEM_MANAGEMENT` | `/cms` | `/code/codeSetting` | 67 | Y |
| 2 | `SYSTEM_SETTINGS` | 시스템설정 | `SYSTEM_MANAGEMENT` | `/cms` | `/site/siteConfigList` | 49 | Y |
| 2 | `COM_EVENT_LOG` | 로그 확인 | `SYSTEM_MANAGEMENT` | `/cms` | `/site/sysEventLogList` | 86 | Y |
| 2 | `SYS_ACS_LOG` | 접속 로그 확인 | `SYSTEM_MANAGEMENT` | `/cms` | `/site/sysAccsLogList` | 87 | Y |
| 2 | `SYS_BBS_MST_LIST` | 게시판 유형 관리 | `SYS_BBS_MST` | `/cms` | `/bbs/sysBbsMstList` | 89 | Y |
| 2 | `SYS_BBS_POST_MNG` | 게시판 관리 | `SYS_BBS_MST` | `/cms` | `/bbs/sysBbsList` | 90 | N |
| 2 | `USER_LIST` | 사용자 목록 | `USER_MANAGEMENT` | `/cms` | `/user/sysUserList` | 64 | Y |
| 2 | `USER_REQ` | 사용자 등록 신청 | `USER_MANAGEMENT` | `/cms` | `/user/sysUserReqList` | 149 | Y |
| 2 | `test111` | list | `test11` | `/cms` | `/sample/test/sysUserList` | 53 | Y |
| 2 | `testtest` | testest | `test11` | `/cms` | `/sample/test/sysBbsBoardRegister` | 108 | Y |
| 2 | `test222` | detail | `test11` | `/cms` | `/sample/test/sysUserDetail` | 81 | Y |
| 2 | `test333` | modify | `test11` | `/cms` | `/sample/test/sysUserModify` | 82 | Y |
| 2 | `test444` | register | `test11` | `/cms` | `/sample/test/sysUserRegister` | 83 | Y |
