import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';

interface PollingOptions {
    interval?: number; // 폴링 간격 (ms)
    projectId: string;
    enabled?: boolean;
}

/**
 * 데이터베이스 폴링 훅 - 실시간 소켓 대신 주기적으로 데이터 변경 확인
 * 다른 사용자의 변경사항을 감지하여 UI 업데이트
 */
export function useDatabasePolling({ interval = 5000, projectId, enabled = true }: PollingOptions) {
    const { fetchProjectDetail } = useProjectStore();
    const lastUpdateRef = useRef<number>(Date.now());
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!projectId || !enabled) return;

        const startPolling = () => {
            pollingIntervalRef.current = setInterval(async () => {
                try {
                    // 전체 프로젝트 목록이 아니라 현재 프로젝트 상세만 다시 가져온다.
                    await fetchProjectDetail(projectId, { force: true });
                    lastUpdateRef.current = Date.now();
                } catch (error) {
                    // console.warn('Database polling error:', error);
                }
            }, interval);
        };

        // 즉시 한번 실행 후 폴링 시작
        fetchProjectDetail(projectId, { force: true }).then(() => {
            lastUpdateRef.current = Date.now();
            startPolling();
        }).catch(() => {
            // console.warn('Database polling initial fetch failed');
        });

        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };
    }, [projectId, interval, enabled, fetchProjectDetail]);

    // 수동으로 새로고침하는 함수
    const refresh = async () => {
        if (projectId) {
            try {
                await fetchProjectDetail(projectId, { force: true });
                lastUpdateRef.current = Date.now();
            } catch (error) {
                // console.error('Manual refresh error:', error);
            }
        }
    };

    return {
        lastUpdate: lastUpdateRef.current,
        refresh,
        isPolling: !!pollingIntervalRef.current
    };
}
