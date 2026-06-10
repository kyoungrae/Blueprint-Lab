/**
 * WBS 일정 시드 데이터
 * title 기준으로 작업자, 산출물명, 실적 시작/종료일, 진척도를 매핑합니다.
 * progress에 따라 status가 자동 결정됩니다: 100→완료, 0→대기, else→진행중
 */

export interface ScheduleSeedItem {
    worker?: string;
    deliverable?: string;
    actualStartDate?: string;
    actualEndDate?: string;
    progress?: number;
}

export const SCHEDULE_SEED: Record<string, ScheduleSeedItem> = {
    // ─── 1. 사업관리 및 모니터링 ────────────────────────────────────────
    '1.1.1 사업수행 계획 작성 및 제출': {
        worker: '이경태',
        deliverable: '사업수행계획서',
        actualStartDate: '2025.01.15',
        actualEndDate: '2025.01.31',
        progress: 100,
    },
    '1.1.2 착수보고서 작성 및 제출': {
        worker: '이경태',
        deliverable: '착수보고서',
        actualStartDate: '2025.01.20',
        actualEndDate: '2025.02.05',
        progress: 100,
    },
    '1.2.1 주간/월간 보고': {
        worker: '이경태',
        deliverable: '주간보고서, 월간보고서',
        actualStartDate: '2025.02.01',
        actualEndDate: '2025.11.30',
        progress: 100,
    },
    '1.2.2 이슈 관리': {
        worker: '이경태',
        deliverable: '이슈관리대장',
        actualStartDate: '2025.02.01',
        actualEndDate: '2025.11.30',
        progress: 100,
    },
    '1.2.3 품질 관리': {
        worker: '이경태',
        deliverable: '품질관리계획서',
        actualStartDate: '2025.02.01',
        actualEndDate: '2025.11.30',
        progress: 100,
    },
    '1.3.1 완료보고서 작성 및 제출': {
        worker: '이경태',
        deliverable: '완료보고서',
        actualStartDate: '2025.11.01',
        actualEndDate: '2025.12.15',
        progress: 100,
    },

    // ─── 2. 시스템 분석 및 설계 ─────────────────────────────────────────
    '2.1.1 현행 시스템 분석': {
        worker: '김철수',
        deliverable: '현행시스템분석서',
        actualStartDate: '2025.01.20',
        actualEndDate: '2025.02.28',
        progress: 100,
    },
    '2.1.2 요구사항 정의서 작성': {
        worker: '김철수',
        deliverable: '요구사항정의서',
        actualStartDate: '2025.02.01',
        actualEndDate: '2025.03.15',
        progress: 100,
    },
    '2.1.3 요구사항 검토 및 확정': {
        worker: '김철수',
        deliverable: '요구사항검토확인서',
        actualStartDate: '2025.03.10',
        actualEndDate: '2025.03.31',
        progress: 100,
    },
    '2.2.1 시스템 아키텍처 설계': {
        worker: '박지수',
        deliverable: '시스템아키텍처설계서',
        actualStartDate: '2025.03.15',
        actualEndDate: '2025.04.15',
        progress: 100,
    },
    '2.2.2 DB 설계': {
        worker: '박지수',
        deliverable: 'DB설계서, ERD',
        actualStartDate: '2025.03.20',
        actualEndDate: '2025.04.20',
        progress: 100,
    },
    '2.2.3 화면 설계': {
        worker: '최유진',
        deliverable: '화면설계서(UI/UX)',
        actualStartDate: '2025.03.20',
        actualEndDate: '2025.04.30',
        progress: 100,
    },
    '2.2.4 인터페이스 설계': {
        worker: '박지수',
        deliverable: '인터페이스설계서',
        actualStartDate: '2025.04.01',
        actualEndDate: '2025.04.30',
        progress: 100,
    },
    '2.3.1 설계 검토': {
        worker: '이경태',
        deliverable: '설계검토보고서',
        actualStartDate: '2025.04.25',
        actualEndDate: '2025.05.10',
        progress: 100,
    },
    '2.3.2 설계 확정': {
        worker: '이경태',
        deliverable: '설계확정서',
        actualStartDate: '2025.05.01',
        actualEndDate: '2025.05.15',
        progress: 100,
    },

    // ─── 3. 시스템 개발 및 테스트 ────────────────────────────────────────
    '3.1.1 개발환경 구성': {
        worker: '박지수',
        deliverable: '개발환경구성보고서',
        actualStartDate: '2025.04.15',
        actualEndDate: '2025.05.15',
        progress: 100,
    },
    '3.1.2 공통 컴포넌트 개발': {
        worker: '박지수',
        deliverable: '공통컴포넌트 소스코드',
        actualStartDate: '2025.05.01',
        actualEndDate: '2025.05.31',
        progress: 100,
    },
    '3.2.1 사용자 관리 기능 개발': {
        worker: '김철수',
        deliverable: '사용자관리 소스코드',
        actualStartDate: '2025.05.15',
        actualEndDate: '2025.06.30',
        progress: 100,
    },
    '3.2.2 권한 관리 기능 개발': {
        worker: '김철수',
        deliverable: '권한관리 소스코드',
        actualStartDate: '2025.05.20',
        actualEndDate: '2025.06.30',
        progress: 100,
    },
    '3.2.3 메인 대시보드 개발': {
        worker: '최유진',
        deliverable: '대시보드 소스코드',
        actualStartDate: '2025.05.20',
        actualEndDate: '2025.07.15',
        progress: 100,
    },
    '3.2.4 데이터 입력/조회 기능 개발': {
        worker: '박지수',
        deliverable: '데이터입출력 소스코드',
        actualStartDate: '2025.06.01',
        actualEndDate: '2025.07.31',
        progress: 100,
    },
    '3.2.5 보고서 기능 개발': {
        worker: '박지수',
        deliverable: '보고서모듈 소스코드',
        actualStartDate: '2025.07.01',
        actualEndDate: '2025.08.15',
        progress: 100,
    },
    '3.2.6 통계/분석 기능 개발': {
        worker: '최유진',
        deliverable: '통계분석 소스코드',
        actualStartDate: '2025.07.15',
        actualEndDate: '2025.08.31',
        progress: 100,
    },
    '3.2.7 알림/공지 기능 개발': {
        worker: '김철수',
        deliverable: '알림공지 소스코드',
        actualStartDate: '2025.08.01',
        actualEndDate: '2025.08.31',
        progress: 100,
    },
    '3.2.8 연계/인터페이스 개발': {
        worker: '박지수',
        deliverable: '인터페이스 소스코드',
        actualStartDate: '2025.08.01',
        actualEndDate: '2025.09.15',
        progress: 100,
    },
    '3.3.1 단위 테스트': {
        worker: '김철수',
        deliverable: '단위테스트결과서',
        actualStartDate: '2025.08.15',
        actualEndDate: '2025.09.15',
        progress: 100,
    },
    '3.3.2 통합 테스트': {
        worker: '이경태',
        deliverable: '통합테스트결과서',
        actualStartDate: '2025.09.01',
        actualEndDate: '2025.09.30',
        progress: 100,
    },
    '3.3.3 성능 테스트': {
        worker: '박지수',
        deliverable: '성능테스트결과서',
        actualStartDate: '2025.09.15',
        actualEndDate: '2025.10.10',
        progress: 100,
    },
    '3.3.4 보안 취약점 점검': {
        worker: '이경태',
        deliverable: '보안취약점점검결과서',
        actualStartDate: '2025.09.20',
        actualEndDate: '2025.10.15',
        progress: 100,
    },
    '3.4.1 결함 수정': {
        worker: '김철수',
        deliverable: '결함수정보고서',
        actualStartDate: '2025.10.01',
        actualEndDate: '2025.10.20',
        progress: 100,
    },
    '3.4.2 사용자 수락 테스트(UAT)': {
        worker: '이경태',
        deliverable: 'UAT결과서',
        actualStartDate: '2025.10.15',
        actualEndDate: '2025.10.31',
        progress: 100,
    },

    // ─── 4. 기자재 및 응용 S/W 설치 ────────────────────────────────────
    '4.1.1 서버 장비 도입 및 설치': {
        worker: '정민호',
        deliverable: '장비설치확인서',
        actualStartDate: '2025.09.01',
        actualEndDate: '2025.09.30',
        progress: 100,
    },
    '4.1.2 네트워크 장비 구성': {
        worker: '정민호',
        deliverable: '네트워크구성도',
        actualStartDate: '2025.09.15',
        actualEndDate: '2025.10.10',
        progress: 100,
    },
    '4.2.1 OS 설치 및 설정': {
        worker: '정민호',
        deliverable: 'OS설치확인서',
        actualStartDate: '2025.09.20',
        actualEndDate: '2025.10.05',
        progress: 100,
    },
    '4.2.2 미들웨어 설치 및 설정': {
        worker: '박지수',
        deliverable: '미들웨어설치확인서',
        actualStartDate: '2025.09.25',
        actualEndDate: '2025.10.10',
        progress: 100,
    },
    '4.2.3 DBMS 설치 및 설정': {
        worker: '박지수',
        deliverable: 'DBMS설치확인서',
        actualStartDate: '2025.10.01',
        actualEndDate: '2025.10.15',
        progress: 100,
    },
    '4.3.1 응용 S/W 배포': {
        worker: '박지수',
        deliverable: '배포확인서',
        actualStartDate: '2025.10.10',
        actualEndDate: '2025.10.25',
        progress: 100,
    },
    '4.3.2 설치 확인 및 검수': {
        worker: '이경태',
        deliverable: '설치검수결과서',
        actualStartDate: '2025.10.20',
        actualEndDate: '2025.10.31',
        progress: 100,
    },

    // ─── 5. 시스템 시범운영 및 사용자 교육 ──────────────────────────────
    '5.1.1 시범운영 계획 수립': {
        worker: '이경태',
        deliverable: '시범운영계획서',
        actualStartDate: '2025.10.20',
        actualEndDate: '2025.11.05',
        progress: 100,
    },
    '5.1.2 시범운영 실시': {
        worker: '이경태',
        deliverable: '시범운영결과보고서',
        actualStartDate: '2025.11.01',
        actualEndDate: '2025.11.30',
        progress: 100,
    },
    '5.1.3 운영 안정화': {
        worker: '정민호',
        deliverable: '운영안정화보고서',
        actualStartDate: '2025.11.15',
        actualEndDate: '2025.12.10',
        progress: 80,
    },
    '5.2.1 사용자 교육 계획 수립': {
        worker: '이경태',
        deliverable: '교육계획서',
        actualStartDate: '2025.10.25',
        actualEndDate: '2025.11.10',
        progress: 100,
    },
    '5.2.2 교육 교재 개발': {
        worker: '최유진',
        deliverable: '교육교재',
        actualStartDate: '2025.10.25',
        actualEndDate: '2025.11.15',
        progress: 100,
    },
    '5.2.3 사용자 교육 실시': {
        worker: '이경태',
        deliverable: '교육결과보고서',
        actualStartDate: '2025.11.10',
        actualEndDate: '2025.11.30',
        progress: 100,
    },

    // ─── 6. 인수시험 ────────────────────────────────────────────────────
    '6.1.1 인수시험 계획 수립': {
        worker: '이경태',
        deliverable: '인수시험계획서',
        actualStartDate: '2025.11.01',
        actualEndDate: '2025.11.15',
        progress: 100,
    },
    '6.1.2 인수시험 시나리오 작성': {
        worker: '김철수',
        deliverable: '인수시험시나리오',
        actualStartDate: '2025.11.05',
        actualEndDate: '2025.11.20',
        progress: 100,
    },
    '6.2.1 인수시험 실시': {
        worker: '이경태',
        deliverable: '인수시험결과서',
        actualStartDate: '2025.11.20',
        actualEndDate: '2025.12.05',
        progress: 100,
    },
    '6.2.2 인수시험 결과 보고': {
        worker: '이경태',
        deliverable: '인수시험결과보고서',
        actualStartDate: '2025.12.01',
        actualEndDate: '2025.12.10',
        progress: 100,
    },
    '6.3.1 지적사항 조치': {
        worker: '김철수',
        deliverable: '지적사항조치결과서',
        actualStartDate: '2025.12.05',
        actualEndDate: '2025.12.15',
        progress: 60,
    },
    '6.3.2 최종 검수': {
        worker: '이경태',
        deliverable: '최종검수확인서',
        actualStartDate: '',
        actualEndDate: '',
        progress: 0,
    },

    // ─── 7. 운영자교육, 시스템 오픈 및 사후관리 ─────────────────────────
    '7.1.1 운영자 교육 계획 수립': {
        worker: '이경태',
        deliverable: '운영자교육계획서',
        actualStartDate: '2025.11.20',
        actualEndDate: '2025.12.05',
        progress: 100,
    },
    '7.1.2 운영 매뉴얼 작성': {
        worker: '박지수',
        deliverable: '운영자매뉴얼',
        actualStartDate: '2025.11.15',
        actualEndDate: '2025.12.10',
        progress: 100,
    },
    '7.1.3 운영자 교육 실시': {
        worker: '이경태',
        deliverable: '운영자교육결과보고서',
        actualStartDate: '2025.12.05',
        actualEndDate: '2025.12.15',
        progress: 60,
    },
    '7.2.1 시스템 오픈 준비': {
        worker: '정민호',
        deliverable: '시스템오픈체크리스트',
        actualStartDate: '2025.12.10',
        actualEndDate: '2025.12.20',
        progress: 30,
    },
    '7.2.2 데이터 이관': {
        worker: '박지수',
        deliverable: '데이터이관결과서',
        actualStartDate: '',
        actualEndDate: '',
        progress: 0,
    },
    '7.2.3 시스템 오픈': {
        worker: '이경태',
        deliverable: '시스템오픈확인서',
        actualStartDate: '',
        actualEndDate: '',
        progress: 0,
    },
    '7.3.1 사후관리 계획 수립': {
        worker: '이경태',
        deliverable: '사후관리계획서',
        actualStartDate: '',
        actualEndDate: '',
        progress: 0,
    },
    '7.3.2 유지보수 계획 수립': {
        worker: '이경태',
        deliverable: '유지보수계획서',
        actualStartDate: '',
        actualEndDate: '',
        progress: 0,
    },
};

/**
 * progress 값을 기반으로 ScheduleStatus를 자동 결정합니다.
 */
export function deriveStatus(progress: number | undefined): '완료' | '진행중' | '대기' {
    if (progress === undefined || progress === 0) return '대기';
    if (progress >= 100) return '완료';
    return '진행중';
}
