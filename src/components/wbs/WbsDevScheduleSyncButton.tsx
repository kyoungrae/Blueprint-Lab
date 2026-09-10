import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, Link2, ShieldCheck, X } from 'lucide-react';
import { useWbsStore } from '../../store/wbsStore';
import {
    buildDevScheduleLinkPreview,
    type DevScheduleLinkPreviewItem,
    type DevScheduleLinkPreviewStatus,
} from '../../services/wbsDevScheduleSync';

interface WbsDevScheduleSyncButtonProps {
    className?: string;
    compact?: boolean;
    onDone?: () => void;
}

const STATUS_LABEL: Record<DevScheduleLinkPreviewStatus, string> = {
    linked: '연결됨',
    candidate: '연결 가능',
    ambiguous: '검토 필요',
    unmatched: '미연결',
    broken: '끊어진 연결',
};

const STATUS_CLASS: Record<DevScheduleLinkPreviewStatus, string> = {
    linked: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    candidate: 'bg-blue-50 text-blue-700 border-blue-200',
    ambiguous: 'bg-amber-50 text-amber-700 border-amber-200',
    unmatched: 'bg-gray-50 text-gray-500 border-gray-200',
    broken: 'bg-rose-50 text-rose-700 border-rose-200',
};

function scheduleLabel(item: DevScheduleLinkPreviewItem): string {
    if (item.scheduleTitle) return [item.scheduleCode, item.scheduleTitle].filter(Boolean).join(' · ');
    if (item.candidates.length > 0) {
        return item.candidates
            .map((candidate) => [candidate.scheduleCode, candidate.title].filter(Boolean).join(' · '))
            .join(' / ');
    }
    return '-';
}

const WbsDevScheduleSyncButton: React.FC<WbsDevScheduleSyncButtonProps> = ({
    className,
    compact = false,
    onDone,
}) => {
    const currentProjectId = useWbsStore((s) => s.currentProjectId);
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);
    const detailSchedules = useWbsStore((s) => s.detailSchedules);
    const menuScheduleLinks = useWbsStore((s) => s.menuScheduleLinks);
    const setMenuScheduleLinks = useWbsStore((s) => s.setMenuScheduleLinks);
    const [open, setOpen] = useState(false);
    const [savedCount, setSavedCount] = useState<number | null>(null);

    const preview = useMemo(() => buildDevScheduleLinkPreview(
        menus,
        rows,
        detailSchedules,
        menuScheduleLinks,
    ), [detailSchedules, menuScheduleLinks, menus, rows]);

    const openPreview = () => {
        setSavedCount(null);
        setOpen(true);
    };

    const applyLinksOnly = () => {
        if (!currentProjectId || preview.proposedLinks.length === 0) return;
        const before = JSON.stringify({
            menus: useWbsStore.getState().menus,
            rows: useWbsStore.getState().rows,
            detailSchedules: useWbsStore.getState().detailSchedules,
        });
        setMenuScheduleLinks(preview.nextLinks);
        const afterState = useWbsStore.getState();
        const after = JSON.stringify({
            menus: afterState.menus,
            rows: afterState.rows,
            detailSchedules: afterState.detailSchedules,
        });
        if (before !== after) {
            window.alert('연결 키 저장 중 업무 데이터 변경이 감지되어 결과를 확인해야 합니다.');
            return;
        }
        setSavedCount(preview.proposedLinks.length);
        onDone?.();
    };

    return (
        <>
            <button
                type="button"
                onClick={openPreview}
                disabled={!currentProjectId}
                title="현재 값은 변경하지 않고 개발상세 행과 일정 행의 연결 키만 설정합니다."
                className={className ?? (
                    compact
                        ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50 disabled:opacity-60 transition-colors'
                        : 'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50 disabled:opacity-60 transition-colors'
                )}
            >
                <KeyRound size={compact ? 13 : 15} /> 연결 키 설정
            </button>

            {open && createPortal(
                <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/45 p-4">
                    <div className="flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Link2 size={18} className="text-emerald-600" />
                                    <h2 className="text-base font-black text-gray-900">개발상세 ↔ 일정 연결 키 설정</h2>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    문자열은 최초 후보 탐색에만 사용합니다. 적용해도 현재 행과 일정의 값은 변경되지 않습니다.
                                </p>
                            </div>
                            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="닫기">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 border-b border-gray-100 bg-gray-50/70 px-5 py-3 sm:grid-cols-5">
                            {(Object.keys(STATUS_LABEL) as DevScheduleLinkPreviewStatus[]).map((status) => (
                                <div key={status} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                                    <div className="text-[10px] font-bold text-gray-400">{STATUS_LABEL[status]}</div>
                                    <div className="mt-0.5 text-lg font-black text-gray-800">{preview.counts[status]}</div>
                                </div>
                            ))}
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto">
                            <table className="w-full min-w-[900px] table-fixed border-collapse text-xs">
                                <thead className="sticky top-0 z-10 bg-slate-700 text-white">
                                    <tr>
                                        <th className="w-24 border border-slate-600 px-2 py-2 text-center">상태</th>
                                        <th className="w-52 border border-slate-600 px-2 py-2 text-left">메뉴</th>
                                        <th className="w-64 border border-slate-600 px-2 py-2 text-left">개발상세 기능명</th>
                                        <th className="w-24 border border-slate-600 px-2 py-2 text-center">담당자</th>
                                        <th className="border border-slate-600 px-2 py-2 text-left">일정 연결 대상</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.items.map((item) => (
                                        <tr key={item.rowId} className="odd:bg-white even:bg-gray-50/60">
                                            <td className="border border-gray-100 px-2 py-2 text-center">
                                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${STATUS_CLASS[item.status]}`}>
                                                    {STATUS_LABEL[item.status]}
                                                </span>
                                            </td>
                                            <td className="border border-gray-100 px-2 py-2 text-gray-600">{item.menuName || '-'}</td>
                                            <td className="border border-gray-100 px-2 py-2 font-bold text-gray-800">{item.featureName || '-'}</td>
                                            <td className="border border-gray-100 px-2 py-2 text-center text-gray-600">{item.assignee || '-'}</td>
                                            <td className="border border-gray-100 px-2 py-2 text-gray-600">
                                                <span className={item.status === 'candidate' ? 'font-bold text-blue-700' : ''}>{scheduleLabel(item)}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center justify-between gap-4 border-t border-gray-100 px-5 py-4">
                            <div className="min-w-0 text-xs">
                                {savedCount !== null ? (
                                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                                        <ShieldCheck size={15} /> 연결 키 {savedCount}건 저장 완료 · 업무 데이터 변경 없음
                                    </span>
                                ) : (
                                    <span className="text-gray-500">자동 적용은 양쪽에서 유일한 1:1 후보 {preview.proposedLinks.length}건으로 제한됩니다.</span>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50">
                                    닫기
                                </button>
                                <button
                                    type="button"
                                    onClick={applyLinksOnly}
                                    disabled={preview.proposedLinks.length === 0 || savedCount !== null}
                                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    연결 키만 저장
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

export default WbsDevScheduleSyncButton;
