# MVIMS 스키마 FK(관계) 점검 리포트

대상: `CREATE TABLE COM_ADDR ...` (전체 약 110개 테이블, FK 503개)

아래 문제들은 대부분 **실제로 `CREATE TABLE` 실행 시 에러가 나거나(1~4)**, 문법은 통과해도 **설계 의미가 틀린(5~6)** 경우입니다.

---

## 1. 존재하지 않는 테이블을 참조 (실행 에러) — 20건

FK 대상 테이블명이 실제 정의된 테이블명과 다릅니다. 대부분 접두사(prefix) 오타로 보입니다.

| 참조한 이름 (틀림) | 실제 존재하는 테이블 (추정) |
|---|---|
| `REF_BFR_ADDR` (COM_ADDR.BFR_ADDR_CD) | `COM_BFR_ADDR` |
| `REF_ADDR` (REG_OWNR_MST.ADDR_CD) | `COM_ADDR` |
| `TB_INSP_RCPT_MST` (INSP_PRSCTN_INSP_FAL, INSP_INTG_STLM_DTL) | `INSP_RCPT_MST` |
| `WEB_REG_SRVC_MST` / `WEB_INSP_SRVC_RSVT_MST` / `WEB_RFND_APLY` / `WEB_IF_TRGT_LINK_MST` | 스키마에 정의 없음 (별도 WEB 스키마?) |

→ `WEB_*` 테이블들이 같은 DB에 없다면 FK 자체를 만들 수 없습니다. 정의를 추가하거나 FK를 제거해야 합니다.

## 2. 존재하지 않는 컬럼을 참조 (실행 에러) — 10건

| FK | 참조 컬럼 (틀림) | 실제 컬럼 |
|---|---|---|
| 여러 REG_*_APLY → REG_SRVC_MST | `REG_SRVC_CD` | REG_SRVC_MST엔 그 컬럼 없음 (PK는 `REG_SRVC_TYPE_CD` 등) |
| INSP_VIN_MARK_MST → SYS_FILE | `UUID` | `FILE_UUID` |
| COM_EXT_OFDOC → COM_LINK_INST | `ID` | `LINK_INST_ID` |

## 3. PK/UNIQUE가 아닌 컬럼을 참조 (실행 에러) — 가장 큰 문제

MySQL FK는 대상이 **PK 또는 UNIQUE 전체**여야 합니다.

### 3-a. `SYS_USER(USER_ID)` 참조 — 169건 ⚠️ 가장 광범위
- `SYS_USER`의 PK는 `ID`(BIGINT)이고 `USER_ID`에는 UNIQUE가 없습니다.
- 따라서 모든 `RGTR_ID/MDFR_ID/..._USER_ID → SYS_USER(USER_ID)` FK가 **전부 생성 실패**합니다.
- 해결책 둘 중 하나:
  1. `SYS_USER.USER_ID VARCHAR(255)`에 `UNIQUE` 추가 (단, 등록자 컬럼들이 VARCHAR(20)이라 길이도 맞춰야 함 → 5번 참고), 또는
  2. 등록자 컬럼을 `BIGINT`로 바꿔 `SYS_USER(ID)`를 참조.

### 3-b. 복합 PK 중 일부 컬럼만 참조 — 다수
FK가 복합 PK의 일부 컬럼만 가리켜 무효입니다. 대표 사례:

| 대상 테이블 (복합 PK) | 잘못 참조한 예 |
|---|---|
| `REG_OWNR_MST` (OWNR_ID, **CTZN_ID**) | REG_VHCL_MST.OWNR_ID → (OWNR_ID만) |
| `REG_SRVC` (SRVC_CD, **FEE_APLCN_YMD**) | REG_VHCL_HIST.SRVC_CD → (SRVC_CD만) |
| `REG_SRVC_MST` (4개 컬럼 PK) | REG_NOPLT_CRT 등에서 일부만 참조 (약 32건) |
| `INSP_RCPT_MST` (INSPST_CD, RCPT_YMD, RCPT_SEQ) | 자식 테이블이 3개 컬럼을 각각 별개 FK로 분리 (약 52건) |
| `REG_VHCL_NO_KPNG` (3개), `INSP_SRVC` (3개) 등 | 부분 참조 |

→ 자식 쪽에 대응되는 컬럼 전부를 두고, **하나의 복합 FK** `FOREIGN KEY (A,B,C) REFERENCES T(A,B,C)`로 묶어야 합니다. 지금처럼 컬럼당 FK를 따로 만들면 안 됩니다.

### 3-c. 기타 비PK 참조
- `REG_BURTGEL_NO_DTL.VHRNO → REG_VHCL_MST(VHRNO)` : REG_VHCL_MST PK는 `FRST_VIN`. VHRNO는 PK 아님.
- `INSP_TUN_MST.SPEC_MNG_NO → REG_VHCL_SPEC(SPEC_MNG_NO)` : PK는 `SPEC_ID`.
- `COM_TSTR_EDU_ATNLC.(EDU_YR, EDU_CLSF_CD) → COM_TSTR_EDU(...)` : PK는 `EDU_ID`.

→ 참조하려면 대상 컬럼에 UNIQUE가 있어야 하거나, 진짜 PK 컬럼을 참조하도록 바꿔야 합니다.

## 4. 데이터 타입 불일치 (실행 에러) — 6건

| 자식 컬럼 | 부모 컬럼 |
|---|---|
| SYS_USER_GRP.ID `INT` | SYS_USER.ID `BIGINT` |
| REG_VHCL_HIST.SPEC_ID `INT` | REG_VHCL_SPEC.SPEC_ID `BIGINT` |
| INSP_TUN_APRV_APLY.SPEC_ID `INT` | REG_VHCL_SPEC.SPEC_ID `BIGINT` |
| INSP_TUN_MST.SPEC_ID `VARCHAR(17)` | REG_VHCL_SPEC.SPEC_ID `BIGINT` |
| COM_SPC_RCD.LMT_TYPE_CD `NUMBER` | SYS_CD_GRP.GRP_ID `VARCHAR(100)` (※ `NUMBER`는 MySQL 타입도 아님) |
| COM_EQP_RPR.EQP_TECH_MBCMT_ID `VARCHAR(20)` | COM_EQP_TECH_MBCMT...ID `BIGINT` |

## 5. 길이 불일치 (문자셋/엔진 따라 에러 또는 경고)

- `_ID → SYS_USER(USER_ID)` : 자식 `VARCHAR(20)` vs 부모 `VARCHAR(255)` — 169건
- 코드 컬럼 → `SYS_CD_GRP(GRP_ID)` : 자식 `VARCHAR(1~4)` vs 부모 `VARCHAR(100)` — 109건
- `SYS_ACS_GRP_MENU.GRP_ID VARCHAR(100)` → `SYS_DEPT_GRP.GRP_ID VARCHAR(32)`

→ FK 양쪽 컬럼 타입/길이는 동일해야 합니다.

## 6. 설계 의미 오류 — 코드값이 "코드 그룹" 테이블을 참조 (109건)

`ADDR_SE_CD`, `FUEL_TYPE_CD`, `NTN_CD`, `USG_CD` 등 **개별 코드값** 컬럼들이 모두 `SYS_CD_GRP(GRP_ID)`(=코드 그룹 식별자)를 참조하고 있습니다.

- 실제 코드값은 `SYS_CD (GRP_ID, CD_ID)`에 들어 있습니다. `SYS_CD_GRP`는 그룹 머리글일 뿐입니다.
- 즉 코드값 FK는 `SYS_CD`를 참조해야 하며, `SYS_CD`의 PK가 복합(`GRP_ID, CD_ID`)이므로 단일 컬럼만으로는 참조할 수 없습니다.
- 일반적 해법: 자식 테이블에 그룹ID 상수와 코드값을 함께 두거나, `SYS_CD`에 코드값 단독 UNIQUE를 두는 식의 코드 모델 재정의가 필요합니다.

---

## 우선순위 권고
1. **3-a (SYS_USER.USER_ID 169건)** 와 **6번 (코드 참조 109건)** 이 가장 구조적·광범위 → 먼저 정책 결정 필요.
2. **1·2번 (오타성 32건)** 은 이름만 고치면 되는 quick win.
3. **3-b 복합 PK** 는 자식 컬럼을 묶어 복합 FK로 재작성.
4. **4·5번 타입/길이** 정렬.
