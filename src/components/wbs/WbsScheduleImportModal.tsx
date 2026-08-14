import React, { useRef, useState } from 'react';
import { X, UploadCloud, Loader2, AlertCircle, FileSpreadsheet, FileJson, Plus, RefreshCw, Minus, ShieldCheck, ArrowRight, Ban, CheckCircle2 } from 'lucide-react';
import type { WbsDetailSchedule } from '../../types/wbs';
import { fetchWithAuth } from '../../utils/fetchWithAuth';
import { parseScheduleExcel, parseScheduleJson, type ScheduleExcelParseResult } from './wbsScheduleIO';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

interface PreviewChange {
    field: string;
    label: string;
    before: string | number | null;
    after: string | number | null;
}

interface RemotePreviewItem {
    key: string;
    sourceRows: number[];
    hierarchyPath: string;
    title: string;
    result: '신규 추가' | '기존 일정 수정' | '변경 없음' | '충돌/검토 필요' | '제외';
    reason?: string;
    changes: PreviewChange[];
}

interface RemotePreview {
    sheetName: string;
    sourceRowCount: number;
    baseSnapshotHash: string;
    previewHash: string;
    canApply: boolean;
    summary: {
        total: number;
        added: number;
        updated: number;
        unchanged: number;
        conflicts: number;
        excluded: number;
    };
    items: RemotePreviewItem[];
}

interface Props {
    open: boolean;
    kind: 'excel' | 'json';
    current: WbsDetailSchedule[];
    projectName: string;
    projectId: string | null;
    onApply: (next: WbsDetailSchedule[]) => void;
    onClose: () => void;
}

type Mode = 'merge' | 'replace';

const resultStyle: Record<RemotePreviewItem['result'], string> = {
    '신규 추가': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    '기존 일정 수정': 'bg-blue-50 text-blue-700 border-blue-200',
    '변경 없음': 'bg-gray-50 text-gray-600 border-gray-200',
    '충돌/검토 필요': 'bg-amber-50 text-amber-700 border-amber-200',
    '제외': 'bg-rose-50 text-rose-700 border-rose-200',
};

const WbsScheduleImportModal: React.FC<Props> = ({ open, kind, current, projectName, projectId, onApply, onClose }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [analysis, setAnalysis] = useState<ScheduleExcelParseResult | null>(null);
    const [jsonItems, setJsonItems] = useState<WbsDetailSchedule[] | null>(null);
    const [remotePreview, setRemotePreview] = useState<RemotePreview | null>(null);
    const [mode, setMode] = useState<Mode>('merge');
    const [applied, setApplied] = useState(false);
    const [backupMessage, setBackupMessage] = useState<string | null>(null);

    if (!open) return null;

    const isExcel = kind === 'excel';
    const isRemoteExcel = isExcel && Boolean(projectId && !projectId.startsWith('local_'));
    const accept = isExcel ? '.xlsx,.xls' : '.json';
    const Icon = isExcel ? FileSpreadsheet : FileJson;

    const reset = () => {
        setAnalysis(null);
        setJsonItems(null);
        setRemotePreview(null);
        setError(null);
        setFileName(null);
        setSelectedFile(null);
        setApplied(false);
        setBackupMessage(null);
        setMode('merge');
        if (inputRef.current) inputRef.current.value = '';
    };

    const close = () => {
        if (busy) return;
        reset();
        onClose();
    };

    const requestRemotePreview = async (file: File) => {
        if (!projectId) throw new Error('프로젝트 정보를 찾을 수 없습니다.');
        const form = new FormData();
        form.append('file', file);
        const response = await fetchWithAuth(`${API_URL}/${encodeURIComponent(projectId)}/wbs/schedule-import/preview`, {
            method: 'POST',
            body: form,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || '일정 파일 미리보기를 만들지 못했습니다.');
        setRemotePreview(payload as RemotePreview);
    };

    const handleFile = async (file: File) => {
        setError(null);
        setAnalysis(null);
        setJsonItems(null);
        setRemotePreview(null);
        setApplied(false);
        setBackupMessage(null);
        setBusy(true);
        setFileName(file.name);
        setSelectedFile(file);
        try {
            if (isRemoteExcel) {
                await requestRemotePreview(file);
            } else if (isExcel) {
                // local_* 프로젝트는 기존 브라우저 전용 import 동작을 유지한다.
                setAnalysis(await parseScheduleExcel(file, current));
            } else {
                setJsonItems(parseScheduleJson(await file.text()));
            }
        } catch (e) {
            setSelectedFile(null);
            setError(e instanceof Error ? e.message : '파싱 오류');
        } finally {
            setBusy(false);
        }
    };

    const applyRemoteExcel = async () => {
        if (!projectId || !selectedFile || !remotePreview) return;
        setBusy(true);
        setError(null);
        try {
            const form = new FormData();
            form.append('file', selectedFile);
            form.append('baseSnapshotHash', remotePreview.baseSnapshotHash);
            form.append('previewHash', remotePreview.previewHash);
            const response = await fetchWithAuth(`${API_URL}/${encodeURIComponent(projectId)}/wbs/schedule-import/apply`, {
                method: 'POST',
                body: form,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.message || '일정 import 반영에 실패했습니다.');
            setApplied(true);
            setBackupMessage(payload.noChanges
                ? '변경할 일정이 없어 기존 데이터는 그대로 유지했습니다.'
                : `백업 ${payload.backup?.id ?? ''} 생성 후 일정 ${payload.changedScheduleIds?.length ?? 0}건을 반영했습니다.`);
        } catch (e) {
            setError(e instanceof Error ? e.message : '일정 import 반영에 실패했습니다.');
        } finally {
            setBusy(false);
        }
    };

    const applyLegacyImport = () => {
        if (isExcel && analysis) {
            const updatedIds = new Set([...analysis.updated, ...analysis.unchanged].map((item) => item.id));
            const next = mode === 'replace'
                ? [...analysis.added, ...analysis.updated, ...analysis.unchanged]
                : [...current.filter((item) => !updatedIds.has(item.id)), ...analysis.updated, ...analysis.unchanged, ...analysis.added];
            onApply(next);
            setApplied(true);
        } else if (!isExcel && jsonItems) {
            if (mode === 'replace') onApply(jsonItems);
            else {
                const incomingIds = new Set(jsonItems.map((item) => item.id));
                onApply([...current.filter((item) => !incomingIds.has(item.id)), ...jsonItems]);
            }
            setApplied(true);
        }
    };

    const addedCount = remotePreview?.summary.added ?? analysis?.added.length ?? (jsonItems ? jsonItems.filter((item) => !current.some((currentItem) => currentItem.id === item.id)).length : 0);
    const updatedCount = remotePreview?.summary.updated ?? analysis?.updated.length ?? (jsonItems ? jsonItems.filter((item) => current.some((currentItem) => currentItem.id === item.id)).length : 0);
    const unchangedCount = remotePreview?.summary.unchanged ?? analysis?.unchanged.length ?? 0;
    const conflictsCount = remotePreview?.summary.conflicts ?? 0;
    const excludedCount = remotePreview?.summary.excluded ?? analysis?.errors.length ?? 0;
    const hasPreview = Boolean(remotePreview || analysis || jsonItems);
    const canApply = !applied && !busy && !error && (isRemoteExcel
        ? Boolean(remotePreview?.canApply && selectedFile)
        : hasPreview);

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[88vh] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                            <Icon size={16} />
                        </div>
                        <div>
                            <p className="text-sm font-black text-gray-900">일정 WBS {isExcel ? '엑셀' : 'JSON'} 업로드</p>
                            <p className="text-[10px] text-gray-400 leading-tight">{projectName} · 일정 탭 데이터</p>
                        </div>
                    </div>
                    <button onClick={close} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-40">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-3">
                        <ShieldCheck size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-xs font-black text-emerald-700 mb-0.5">일정 탭 데이터만 영향받습니다</p>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                메뉴 구조도·개발 상세·개발 상세 진척률·진척률 계산식은 변경하지 않습니다.<br />
                                {isRemoteExcel
                                    ? '미리보기와 취소 단계에서는 서버 데이터가 변경되지 않으며, 최종 확인 뒤 백업 성공 시에만 일정 항목을 병합합니다.'
                                    : `현재 저장된 일정 항목: ${current.length}개`}
                            </p>
                        </div>
                    </div>

                    {!hasPreview && !error && (
                        <div
                            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(event) => {
                                event.preventDefault();
                                setDragOver(false);
                                const file = event.dataTransfer.files[0];
                                if (file) void handleFile(file);
                            }}
                            onClick={() => !busy && inputRef.current?.click()}
                            className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors ${dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                        >
                            {busy ? <Loader2 size={28} className="text-gray-400 animate-spin" /> : <UploadCloud size={28} className="text-gray-300" />}
                            <p className="text-sm font-bold text-gray-500">{busy ? '분석 중…' : `${isExcel ? '.xlsx' : '.json'} 파일을 드래그하거나 클릭하여 선택`}</p>
                            <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void handleFile(file);
                            }} />
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-3">
                            <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
                            <div className="flex-1">
                                <p className="text-xs text-red-700 font-medium">{error}</p>
                                <button onClick={() => { reset(); setTimeout(() => inputRef.current?.click(), 50); }} className="mt-2 text-[11px] font-bold text-red-600 hover:text-red-800">다른 파일 선택</button>
                            </div>
                        </div>
                    )}

                    {hasPreview && !error && (
                        <>
                            <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-2.5">
                                <div className="flex min-w-0 items-center gap-2">
                                    <Icon size={14} className="text-gray-400 shrink-0" />
                                    <span className="text-xs font-bold text-gray-700 truncate">{fileName}</span>
                                    {remotePreview && <span className="text-[10px] text-gray-400 shrink-0">{remotePreview.sheetName} · 원본 작업 행 {remotePreview.sourceRowCount}건</span>}
                                </div>
                                <button onClick={() => { reset(); setTimeout(() => inputRef.current?.click(), 50); }} className="text-[11px] text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors shrink-0">
                                    <RefreshCw size={11} />다시 선택
                                </button>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {[
                                    { label: '신규 추가', count: addedCount, cls: 'bg-emerald-50 border-emerald-100 text-emerald-700', icon: <Plus size={12} /> },
                                    { label: '기존 일정 수정', count: updatedCount, cls: 'bg-blue-50 border-blue-100 text-blue-700', icon: <RefreshCw size={12} /> },
                                    { label: '변경 없음', count: unchangedCount, cls: 'bg-gray-50 border-gray-200 text-gray-600', icon: <Minus size={12} /> },
                                    { label: '충돌/검토', count: conflictsCount, cls: 'bg-amber-50 border-amber-100 text-amber-700', icon: <AlertCircle size={12} /> },
                                    { label: '제외', count: excludedCount, cls: 'bg-rose-50 border-rose-100 text-rose-700', icon: <Ban size={12} /> },
                                ].map((item) => (
                                    <div key={item.label} className={`rounded-xl border px-2 py-2.5 text-center ${item.cls}`}>
                                        <div className="flex items-center justify-center gap-1 mb-1 text-[10px] font-black">{item.icon}{item.label}</div>
                                        <p className="text-lg font-black">{item.count}</p>
                                    </div>
                                ))}
                            </div>

                            {isRemoteExcel && remotePreview && (
                                <>
                                    {!remotePreview.canApply && (
                                        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-[11px] leading-relaxed text-amber-800">
                                            충돌·중복·형식 오류가 있는 파일은 부분 반영하지 않습니다. 아래 제외/충돌 행을 모두 해결한 새 파일로 다시 미리보기하세요.
                                        </div>
                                    )}
                                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                                        <div className="px-3.5 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-500">행별 처리 결과 · 변경 전 → 변경 후</div>
                                        <div className="max-h-72 overflow-auto divide-y divide-gray-100">
                                            {remotePreview.items.map((item) => (
                                                <div key={item.key} className="px-3.5 py-2.5 text-[11px]">
                                                    <div className="flex items-start gap-2">
                                                        <span className={`shrink-0 border rounded-full px-1.5 py-0.5 text-[10px] font-black ${resultStyle[item.result]}`}>{item.result}</span>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-bold text-gray-800 truncate" title={item.hierarchyPath}>{item.hierarchyPath} <span className="text-gray-400">/</span> {item.title}</p>
                                                            <p className="mt-0.5 text-[10px] text-gray-400">엑셀 {item.sourceRows.map((row) => `${row}행`).join(', ')}</p>
                                                            {item.reason && <p className="mt-1 text-amber-700">{item.reason}</p>}
                                                            {item.changes.length > 0 && (
                                                                <div className="mt-1.5 space-y-0.5 text-[10px] text-gray-600">
                                                                    {item.changes.map((change) => <p key={change.field}><span className="font-bold text-gray-500">{change.label}</span> · {String(change.before ?? '—')} <ArrowRight size={10} className="inline mx-0.5 text-gray-400" /> <span className="font-bold text-gray-800">{String(change.after ?? '—')}</span></p>)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {!isRemoteExcel && analysis && analysis.errors.length > 0 && (
                                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3">
                                    <p className="text-[11px] font-black text-amber-700 mb-1.5">⚠ 건너뜀 {analysis.errors.length}행</p>
                                    {analysis.errors.map((item, index) => <p key={index} className="text-[10px] text-amber-600">· {item}</p>)}
                                </div>
                            )}

                            {!isRemoteExcel && (
                                <div className="rounded-xl border border-gray-200 overflow-hidden">
                                    <p className="text-[10px] font-black text-gray-500 px-3.5 py-2 bg-gray-50 border-b border-gray-100">적용 방식</p>
                                    <div className="p-2 space-y-1.5">
                                        {([
                                            { key: 'merge', label: '병합 (추천)', desc: '파일에 있는 항목만 추가/업데이트하고 파일에 없는 기존 항목은 유지' },
                                            { key: 'replace', label: '전체 교체', desc: '현재 일정 데이터를 파일 내용으로 완전히 대체' },
                                        ] as { key: Mode; label: string; desc: string }[]).map((option) => (
                                            <label key={option.key} className={`flex items-start gap-2.5 rounded-lg p-2.5 cursor-pointer border ${mode === option.key ? 'border-emerald-300 bg-emerald-50' : 'border-transparent hover:bg-gray-50'}`}>
                                                <input type="radio" name="mode" checked={mode === option.key} onChange={() => setMode(option.key)} className="mt-0.5 accent-emerald-600" />
                                                <span><span className="block text-xs font-black text-gray-800">{option.label}</span><span className="block text-[10px] text-gray-500 mt-0.5">{option.desc}</span></span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {applied && (
                        <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-3">
                            <CheckCircle2 size={17} className="text-emerald-600 mt-0.5 shrink-0" />
                            <div><p className="text-xs font-black text-emerald-800">일정 데이터가 반영됐습니다</p><p className="text-[11px] text-emerald-700 mt-0.5">{backupMessage ?? `신규 ${addedCount}건 추가 · ${updatedCount}건 업데이트`}</p></div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 shrink-0">
                    <button onClick={close} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-40">{applied ? '닫기' : '취소'}</button>
                    {!applied && (
                        <button onClick={() => { if (isRemoteExcel) void applyRemoteExcel(); else applyLegacyImport(); }} disabled={!canApply} className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors ${canApply ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                            {busy ? '처리 중…' : isRemoteExcel ? '백업 후 병합' : '적용'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WbsScheduleImportModal;
