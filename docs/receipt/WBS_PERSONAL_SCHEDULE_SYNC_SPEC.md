# WBS ↔ 개인일정 프로젝트 연동 기능 명세서

**문서 버전:** 1.1  
**작성일:** 2026-07-06  
**위치:** `docs/receipt/WBS_PERSONAL_SCHEDULE_SYNC_SPEC.md`  
**목적:** WBS 개발 상세 일정을 개인일정 프로젝트 달력에 자동 반영하고, 진행율을 양방향 동기화한다.

---

## 1. 개요

### 1.1 배경

WBS 프로젝트의 **개발 상세** 탭에는 메뉴별 산출물·기능 단위 일정(담당자, 시작일, 종료일, 진행율)이 관리된다. 담당자는 별도의 **개인일정** 프로젝트에서 자신의 업무를 달력으로 확인한다. 두 프로젝트를 연결하여 WBS에서 입력한 일정이 담당자 개인 달력에 자동 표시되도록 한다.

### 1.2 목표

| # | 목표 |
|---|------|
| 1 | WBS 프로젝트 ↔ 개인일정 프로젝트 **연결** |
| 2 | 담당자 = 개인일정 프로젝트 **생성자**인 행만 개인 달력에 표시 |
| 3 | 프로젝트 목록에서 **기존 연결(ERD·화면설계·컴포넌트)과 동일한 시각적 그룹/연결선** 표시 |
| 4 | WBS 행 ↔ 개인일정 이벤트 **진행율 양방향 동기화** |
| 5 | **기능명 없는 행**은 개인일정에 미표시 |
| 6 | WBS 카드에 **연결된 개인일정 개수 뱃지** 및 **호버 시 이름 목록** 표시 (컴포넌트 카드 패턴) |

### 1.3 범위

- **포함:** 프로젝트 연결 설정, 일정 미러링, 진행율 동기화, 프로젝트 목록 UI(그룹·연결선·뱃지·툴팁), 동기화 규칙
- **제외(1차):** WBS GANTT CHART 탭, 일정 상세(`detailSchedules`), Debugging 전용 행, 반복 일정 자동 변환

---

## 2. 용어 정의

| 용어 | 설명 |
|------|------|
| WBS 프로젝트 | `projectType: 'WBS'`, 데이터: `menus`, `rows` (`WbsDevRow`) |
| 개인일정 프로젝트 | `projectType: 'PERSONAL_SCHEDULE'`, 데이터: `events` (`ScheduleEvent`) |
| 개발 상세 행 | `WbsDevRow` — `menuId`, `category`, `featureName`, `assignee`, `startDate`, `endDate`, `progress` 등 |
| 생성자 | 개인일정 프로젝트의 `author` 또는 `members` 중 `role: 'OWNER'`인 멤버의 **표시명(`name`)** |
| 미러 이벤트 | WBS 행에서 자동 생성·갱신되는 개인일정 `ScheduleEvent` (동기화 대상) |

---

## 3. 현행 시스템 참고

### 3.1 WBS 개발 상세 (`WbsDevRow`)

```typescript
{
  id, menuId, category, featureName, assignee,
  startDate, endDate,  // YYYY-MM-DD
  status, progress,    // 0~100
  isDebugging?
}
```

### 3.2 개인일정 (`ScheduleEvent`)

```typescript
{
  id, title, category, startDate, endDate,
  allDay?, assignee?, progress?,
  projectId?, description?, ...
}
```

### 3.3 기존 프로젝트 연결 UI 패턴

| 연결 유형 | 데이터 | 목록 UI |
|-----------|--------|---------|
| 화면설계 ↔ ERD | `linkedErdProjectIds` | 그룹핑 + SVG 연결선 |
| 화면설계 ↔ 컴포넌트 | `linkedComponentProjectId` | 연결 버튼 + 그룹 |
| 컴포넌트 ← 화면설계 | (역참조 집계) | **우상단 원형 뱃지(연결 수)** + 호버 액션 |

WBS ↔ 개인일정은 **화면설계·ERD 그룹 패턴**과 **컴포넌트 연결 수 뱃지 패턴**을 함께 따른다.

---

## 4. 기능 요구사항

### FR-01. 프로젝트 연결

#### 4.1.1 연결 관계

- WBS 프로젝트에서 **개인일정 프로젝트를 1개 이상** 연결 가능 (`linkedPersonalScheduleProjectIds`)
- 개인일정 프로젝트는 연결된 WBS를 역참조 (`linkedWbsProjectId` 또는 배열)
- 동일 개인일정을 여러 WBS에 연결하는 것은 **불가** (개인일정 1개 ↔ WBS 1개 권장)

#### 4.1.2 데이터 모델 (신규 필드)

```typescript
// Project (서버/클라이언트 공통)
/** WBS → 연결된 개인일정 프로젝트 ID 목록 */
linkedPersonalScheduleProjectIds?: string[];

/** 개인일정 → 연결된 WBS 프로젝트 ID */
linkedWbsProjectId?: string;
```

#### 4.1.3 연결 조건

- WBS는 `PERSONAL_SCHEDULE` 타입만 연결 가능
- 개인일정은 `WBS` 타입만 연결 가능
- 이미 다른 WBS와 연결된 개인일정은 추가 연결 **거부**
- 연결/해제 권한: 프로젝트 `OWNER`

#### 4.1.4 API (예시)

| Method | Endpoint | 설명 |
|--------|----------|------|
| `PATCH` | `/api/projects/:wbsId/link-personal-schedule` | `{ personalScheduleProjectId }` 추가 |
| `DELETE` | `/api/projects/:wbsId/link-personal-schedule/:psId` | 개별 연결 해제 |

---

### FR-02. 개인일정 달력 표시 조건

WBS 개발 상세 **한 행**이 개인일정 달력에 표시되려면 **아래를 모두** 만족한다.

| # | 조건 | 상세 |
|---|------|------|
| C1 | 프로젝트 연결 | WBS와 해당 담당자의 개인일정 프로젝트가 연결됨 |
| C2 | 담당자 일치 | `row.assignee.trim()` === 개인일정 프로젝트 **생성자 표시명** |
| C3 | 기능명 존재 | `row.featureName.trim() !== ''` |
| C4 | 일정 유효 | `startDate`, `endDate` 모두 유효 (YYYY-MM-DD) |
| C5 | Debugging 제외 | `row.isDebugging !== true` (1차 권장) |

#### 생성자 매칭

```
creatorName =
  personalScheduleProject.author?.trim()
  || personalScheduleProject.members.find(m => m.role === 'OWNER')?.name?.trim()
```

#### 미표시 케이스 (요구사항 5)

- `assignee`만 있고 `featureName`이 비어 있으면 → **개인일정 미표시**
- 담당자가 생성자와 다르면 → **미표시**

#### 이벤트 매핑

| WBS | 개인일정 `ScheduleEvent` |
|-----|--------------------------|
| `featureName` | `title` |
| `startDate` / `endDate` | `startDate` / `endDate` |
| `progress` | `progress` |
| `assignee` | `assignee` |
| `menu.name`, `menu.menuCode` | `description` 등 |
| — | `allDay: true` |
| — | `wbsProjectId`, `wbsRowId`, `isWbsMirror: true` |

---

### FR-03. 프로젝트 목록 시각적 연결 표시

#### 4.3.1 공통 UI (기존 연결과 동일)

1. **그룹핑:** 연결된 WBS + 개인일정 카드가 인접 그룹으로 묶임
2. **연결선:** 그룹 내 카드 간 SVG 직교 연결선 (ERD 연결선과 동일 스타일)
3. **연결 버튼:** WBS 카드 호버 시 개인일정 연결 버튼 (`CalendarDays`, rose 계열)
4. **연결 모달:** 연결된 개인일정 목록 / 추가 / 해제 (ERD 연결 모달 패턴)
5. **범례:** `WBS ↔ 개인일정` 항목 추가

#### 4.3.2 WBS 카드 — 연결 수 뱃지 (신규, FR-03-2)

**참조 UI:** 컴포넌트 프로젝트 카드 우상단 연결 수 뱃지  
(`ProjectListPage.tsx` — `linkedFromCount`, `absolute -top-2.5 -right-2.5`, `w-6 h-6`, `rounded-full`, `bg-blue-500`)

| 항목 | 명세 |
|------|------|
| 표시 위치 | WBS 프로젝트 카드 **우상단** (`absolute -top-2.5 -right-2.5`) |
| 표시 조건 | `linkedPersonalScheduleProjectIds.length > 0` |
| 표시 내용 | 연결된 개인일정 프로젝트 **개수** (정수) |
| 스타일 | 원형 뱃지, 흰색 숫자, `text-[10px] font-black` |
| 색상 | `bg-rose-500` (개인일정 테마 rose, 컴포넌트 `bg-blue-500`와 구분) |
| z-index | 카드 호버 액션보다 낮지 않게 (`z-10` 이상), 클릭 시 카드 진입과 충돌 없도록 `pointer-events` 처리 |

**개수 계산:**

```typescript
const linkedPsCount = (project.linkedPersonalScheduleProjectIds ?? []).length;
```

#### 4.3.3 WBS 카드 — 뱃지 호버 툴팁 (신규, FR-03-3)

| 항목 | 명세 |
|------|------|
| 트리거 | 연결 수 뱃지에 **마우스 오버** |
| 표시 내용 | 연결된 개인일정 프로젝트 **이름 목록** (프로젝트 `name`) |
| 정렬 | 연결된 순서 또는 이름 가나다순 (구현 시 하나로 통일) |
| 형식 | 툴팁 본문 예: `연결된 개인일정` (제목) + `· 홍길동 일정` / `· 팀 WBS 일정` (목록) |
| 다중 연결 | 2개 이상이면 **줄바꿈 목록**으로 모두 표시 |
| 삭제된 프로젝트 | ID만 있고 프로젝트가 없으면 `(삭제됨)` 또는 ID 생략 |
| 구현 방식 | `title` 속성(단순) 또는 `createPortal` 툴팁(다행 표시 시 권장, LockTooltip 패턴) |
| 모바일 | 탭 시 동일 정보 표시 (접근성) |

**툴팁 예시:**

```
연결된 개인일정 (2)
─────────────────
· 홍길동 개인일정
· MVIMS WBS 일정
```

#### 4.3.4 `groupingConnections` 확장

```typescript
projects
  .filter((p) => p.projectType === 'WBS')
  .forEach((wbs) => {
    (wbs.linkedPersonalScheduleProjectIds ?? []).forEach((psId) => {
      connections.push({ fromId: wbs.id, toId: psId });
    });
  });
```

#### 4.3.5 개인일정 카드 (역방향, 선택)

개인일정 카드에도 WBS 연결 뱃지 `1` 표시 가능 (1:1 기준). 호버 시 연결된 WBS 프로젝트명 표시.

---

### FR-04. 진행율 양방향 동기화

#### WBS → 개인일정

| 트리거 | 동작 |
|--------|------|
| `progress` 변경 | 미러 이벤트 `progress` 갱신 |
| `startDate` / `endDate` 변경 | 미러 이벤트 날짜 갱신 |
| `featureName` / `assignee` 변경 | 표시 조건 재평가 → 생성/수정/삭제 |
| 행 삭제 | 미러 이벤트 삭제 |

#### 개인일정 → WBS

| 트리거 | 동작 |
|--------|------|
| 미러 이벤트 `progress` 변경 | `row.progress` 갱신 |

#### 루프 방지

- `syncSource: 'wbs' | 'personal'` 또는 `lastSyncedAt`으로 에코 업데이트 방지
- 충돌 시 **최종 수정 시각 우선**

---

### FR-05. 동기화 엔진

#### 실행 시점

1. WBS 스냅샷 저장 시
2. 개인일정 스냅샷 저장 시
3. 프로젝트 연결/해제 시 전체 재동기화

#### 연결 해제 시 (권장 정책 A)

- 미러 이벤트 **유지**, `wbsRowId` 메타 제거 → 수동 일정으로 전환

---

## 5. 데이터 모델 상세

### 5.1 `ScheduleEvent` 확장

```typescript
interface ScheduleEvent {
  wbsProjectId?: string;
  wbsRowId?: string;
  isWbsMirror?: boolean;
  syncSource?: 'wbs' | 'personal' | 'manual';
  lastSyncedAt?: string;
}
```

### 5.2 `Project` 확장

```typescript
linkedPersonalScheduleProjectIds?: string[];
linkedWbsProjectId?: string;
```

### 5.3 유니크 제약

- 개인일정 스냅샷 내 `(wbsProjectId, wbsRowId)` 쌍당 미러 이벤트 **최대 1개**

---

## 6. UI 와이어프레임 (WBS 카드 뱃지)

```
┌─────────────────────────┐
│                    (2) │  ← rose 원형 뱃지, 연결 개수
│      [WBS 아이콘]       │
│         WBS             │
│    MVIMS 개발일정       │
│                         │
└─────────────────────────┘
         ↓ hover
   ┌──────────────────────┐
   │ 연결된 개인일정 (2)   │
   │ · 홍길동 개인일정     │
   │ · MVIMS WBS 일정      │
   └──────────────────────┘
```

컴포넌트 카드 뱃지와 **동일한 크기·위치·타이포**, 색상만 rose로 구분한다.

---

## 7. 예외·엣지 케이스

| 상황 | 처리 |
|------|------|
| 연결 0개 | 뱃지 **숨김** |
| 연결 1개 | 뱃지 `1`, 툴팁에 이름 1줄 |
| 담당자 ≠ 생성자 | 미러링 안 됨 |
| 기능명 없음 | 미표시, 미러 삭제 |
| 연결된 개인일정 삭제됨 | 뱃지 개수에서 제외 또는 `(삭제됨)` 표시 후 정리 배치 |

---

## 8. 테스트 시나리오

### TC-01 뱃지·툴팁

1. WBS에 개인일정 0개 연결 → 뱃지 없음
2. 1개 연결 → 뱃지 `1`, 호버 시 프로젝트명 1개
3. 2개 연결 → 뱃지 `2`, 호버 시 이름 2개 목록
4. 연결 해제 후 개수·툴팁 즉시 갱신

### TC-02 그룹·연결선

1. WBS + 개인일정 연결 시 목록에서 **동일 그룹 + 연결선** 표시

### TC-03 일정·진행율

1. 기능명·담당자·날짜 충족 시 달력 표시
2. 기능명 없으면 미표시
3. progress 양방향 동기화, 루프 없음

---

## 9. 구현 단계

| Phase | 내용 |
|-------|------|
| 1 | `linkedPersonalScheduleProjectIds`, 연결 API, **WBS 뱃지·툴팁**, 그룹핑 |
| 2 | WBS → 개인일정 미러링 |
| 3 | 진행율 양방향 동기화 |
| 4 | 연결 모달, 실시간(선택) |

---

## 10. 미결정 사항

1. 개인일정에서 날짜 수정 시 WBS 역반영 여부
2. 연결 해제 시 미러 이벤트 유지 vs 삭제
3. 이벤트 제목 형식 (`featureName` only vs `[메뉴명] featureName`)
4. WBS당 개인일정 **다중 연결** 허용 여부 (UI는 개수 뱃지로 대비, 1차는 1:1도 가능)

---

## 변경 이력

| 버전 | 일자 | 내용 |
|------|------|------|
| 1.0 | 2026-07-06 | 초안 작성 |
| 1.1 | 2026-07-06 | WBS 카드 연결 수 뱃지·호버 툴팁 명세 추가 (FR-03-2, FR-03-3) |
