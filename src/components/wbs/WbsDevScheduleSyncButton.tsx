import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useWbsStore } from '../../store/wbsStore';
import { syncDevDetailToSchedule } from '../../services/wbsDevScheduleSync';

interface WbsDevScheduleSyncButtonProps {
    className?: string;
    compact?: boolean;
    onDone?: () => void;
}

const WbsDevScheduleSyncButton: React.FC<WbsDevScheduleSyncButtonProps> = ({
    className,
    compact = false,
    onDone,
}) => {
    const currentProjectId = useWbsStore((s) => s.currentProjectId);
    const [busy, setBusy] = useState(false);

    const run = async () => {
        if (!currentProjectId || busy) return;
        setBusy(true);
        try {
            const result = await syncDevDetailToSchedule(currentProjectId, { force: true, rebuildLinks: true });
            const lines = [
                '개발상세 ↔ 시스템 개발 일정을 동기화했습니다.',
                `매칭 ${result.matched}건 · 업데이트 ${result.updated}건`,
            ];
            if (result.unmatched > 0) lines.push(`연결되지 않은 메뉴/담당자 ${result.unmatched}건`);
            window.alert(lines.join('\n'));
            onDone?.();
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={() => { void run(); }}
            disabled={busy || !currentProjectId}
            title="메뉴명·경로로 시스템 개발(3.2.x) 항목을 다시 매칭하고 개발 상세의 시작일·종료일·실적일을 반영합니다."
            className={className ?? (
                compact
                    ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors'
                    : 'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50 disabled:opacity-60 transition-colors'
            )}
        >
            <RefreshCw size={compact ? 13 : 15} className={busy ? 'animate-spin' : ''} />
            {busy ? '동기화 중…' : '시스템 개발 동기화'}
        </button>
    );
};

export default WbsDevScheduleSyncButton;
