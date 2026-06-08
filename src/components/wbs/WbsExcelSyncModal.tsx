import React, { useRef, useState } from 'react';
import { X, UploadCloud, Loader2, AlertCircle, FileSpreadsheet, Plus, RefreshCw, EyeOff, ShieldCheck } from 'lucide-react';
import type { WbsData } from '../../types/wbs';
import { analyzeWbsExcelMerge, type WbsMergeAnalysis } from './wbsExcel';
import { downloadWbsJson } from './wbsIO';

interface WbsExcelSyncModalProps {
    open: boolean;
    current: WbsData;
    projectName: string;
    onApply: (data: WbsData) => void;
    onClose: () => void;
}

const DiffSection: React.FC<{ icon: React.ReactNode; title: string; tone: string; items: { label: string }[] }> = ({ icon, title, tone, items }) => {
    if (items.length === 0) return null;
    return (
        <div className="rounded-lg border border-gray-100">
            <div className={`flex items-center gap-1.5 px-3 py-2 text-xs font-black ${tone}`}>
                {icon}
                {title} <span className="tabular-nums">{items.length}</span>건
            </div>
            <div className="max-h-32 overflow-auto px-3 pb-2 space-y-0.5">
                {items.slice(0, 200).map((it, i) => (
                    <div key={i} className="text-[11px] text-gray-600 truncate" title={it.label}>· {it.label}</div>
                ))}
                {items.length > 200 && <div className="text-[11px] text-gray-400">… 외 {items.length - 200}건</div>}
            </div>
        </div>
    );
};

const WbsExcelSyncModal: React.FC<WbsExcelSyncModalProps> = ({ open, current, projectName, onApply, onClose }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<WbsMergeAnalysis | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [applied, setApplied] = useState(false);

    if (!open) return null;

    const reset = () => {
        setAnalysis(null);
        setError(null);
        setFileName(null);
        setApplied(false);
        if (inputRef.current) inputRef.current.value = '';
    };
    const close = () => {
        if (busy) return;
        reset();
        setDragOver(false);
        onClose();
    };

    const handleFile = async (file: File) => {
        setError(null);
        setAnalysis(null);
        setApplied(false);
        setFileName(file.name);
        if (!/\.(xlsx|xls)$/i.test(file.name)) {
            setError('엑셀(.xlsx) 파일을 올려주세요.');
            return;
        }
        setBusy(true);
        try {
            const result = await analyzeWbsExcelMerge(current, file);
            setAnalysis(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : '엑셀 분석 중 오류가 발생했습니다.');
        } finally {
            setBusy(false);
        }
    };

    const apply = () => {
        if (!analysis) return;
        // 적용 직전 현재 데이터를 JSON으로 자동 백업(롤백용)
        downloadWbsJson(current, `${projectName}_백업_${new Date().toISOString().slice(0, 10)}`);
        onApply(analysis.data);
        setApplied(true);
    };

    const s = analysis?.summary;
    const noChange = s && s.rowsAdded === 0 && s.rowsUpdated === 0 && s.menusAdded === 0 && s.menusUpdated === 0;

    return (
        <div className="fixed inset-0 z-[10050] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={close}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h3 className="text-base font-black text-gray-900 flex items-center gap-2"><FileSpreadsheet size={18} className="text-emerald-600" /> 엑셀 업로드 · 변경 미리보기</h3>
                    <button onClick={close} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"><X size={18} /></button>
                </div>

                <div className="p-5">
                    {applied ? (
                        <div className="flex flex-col items-center gap-2 py-6 text-center">
                            <ShieldCheck size={36} className="text-emerald-500" />
                            <p className="text-sm font-bold text-gray-800">반영 완료</p>
                            <p className="text-xs text-gray-500">현재 데이터 백업(JSON)이 자동 다운로드되었습니다. 문제가 있으면 ‘JSON 업로드’로 되돌릴 수 있습니다.</p>
                        </div>
                    ) : !analysis ? (
                        <>
                            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                                ‘엑셀 다운로드’로 받은 파일을 팀원이 수정한 뒤 올리면, 행의 <b>ID(수정금지)</b>로 정확히 매칭해 변경분을 반영합니다. 먼저 무엇이 바뀌는지 보여드립니다.
                            </p>
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
                                onClick={() => !busy && inputRef.current?.click()}
                                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer transition-colors ${dragOver ? 'border-emerald-400 bg-emerald-50/60' : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'}`}
                            >
                                {busy ? <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /> : <UploadCloud className="w-8 h-8 text-gray-400" />}
                                <p className="text-sm font-bold text-gray-700">엑셀 파일을 끌어다 놓거나 클릭해서 선택</p>
                                <p className="text-[11px] text-gray-400">.xlsx · .xls</p>
                                {fileName && <p className="text-[11px] text-gray-500 mt-1">{fileName}</p>}
                            </div>
                            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
                        </>
                    ) : (
                        <>
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                <div className="rounded-lg bg-emerald-50 p-2.5 text-center">
                                    <div className="text-lg font-black text-emerald-700 tabular-nums">{s!.rowsAdded}</div>
                                    <div className="text-[10px] font-bold text-emerald-600">행 추가</div>
                                </div>
                                <div className="rounded-lg bg-blue-50 p-2.5 text-center">
                                    <div className="text-lg font-black text-blue-700 tabular-nums">{s!.rowsUpdated}</div>
                                    <div className="text-[10px] font-bold text-blue-600">행 수정</div>
                                </div>
                                <div className="rounded-lg bg-gray-100 p-2.5 text-center">
                                    <div className="text-lg font-black text-gray-700 tabular-nums">{s!.rowsOnlyOnWeb}</div>
                                    <div className="text-[10px] font-bold text-gray-500">웹에만 있음</div>
                                </div>
                            </div>
                            <p className="text-[11px] text-gray-500 mb-3">
                                메뉴: 추가 {s!.menusAdded} · 수정 {s!.menusUpdated}
                                {s!.skipped > 0 && <span className="text-amber-600"> · 메뉴 못 찾아 건너뜀 {s!.skipped}</span>}
                                {fileName && <span className="text-gray-400"> · {fileName}</span>}
                            </p>

                            <div className="space-y-2">
                                <DiffSection icon={<Plus size={13} />} title="추가될 행" tone="text-emerald-700 bg-emerald-50/60" items={analysis.addedRows} />
                                <DiffSection icon={<RefreshCw size={13} />} title="수정될 행" tone="text-blue-700 bg-blue-50/60" items={analysis.updatedRows} />
                                <DiffSection icon={<EyeOff size={13} />} title="엑셀에 없어 유지되는 행" tone="text-gray-600 bg-gray-50" items={analysis.onlyOnWebRows} />
                            </div>

                            {s!.rowsOnlyOnWeb > 0 && (
                                <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] text-amber-700">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                    <span>엑셀에 없는 {s!.rowsOnlyOnWeb}개 행은 <b>삭제하지 않고 그대로 유지</b>합니다. (데이터 누락 방지)</span>
                                </div>
                            )}
                            {noChange && <p className="mt-3 text-xs text-gray-500 text-center">변경된 내용이 없습니다.</p>}
                        </>
                    )}

                    {error && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                            <AlertCircle size={15} className="shrink-0 mt-0.5" /><span>{error}</span>
                        </div>
                    )}

                    <div className="mt-4 flex justify-end gap-2">
                        {applied ? (
                            <button onClick={close} className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">닫기</button>
                        ) : analysis ? (
                            <>
                                <button onClick={reset} disabled={busy} className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40">다른 파일</button>
                                <button onClick={apply} disabled={busy || noChange} className="px-3 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">백업 후 반영</button>
                            </>
                        ) : (
                            <button onClick={close} disabled={busy} className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40">취소</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WbsExcelSyncModal;
