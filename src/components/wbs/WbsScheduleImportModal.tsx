import React, { useRef, useState } from 'react';
import { X, UploadCloud, Loader2, AlertCircle, FileSpreadsheet, FileJson, Plus, RefreshCw, Minus } from 'lucide-react';
import type { WbsDetailSchedule } from '../../types/wbs';
import { parseScheduleExcel, parseScheduleJson, type ScheduleExcelParseResult } from './wbsScheduleIO';

interface Props {
    open: boolean;
    kind: 'excel' | 'json';
    current: WbsDetailSchedule[];
    projectName: string;
    onApply: (next: WbsDetailSchedule[]) => void;
    onClose: () => void;
}

type Mode = 'merge' | 'replace';

const WbsScheduleImportModal: React.FC<Props> = ({ open, kind, current, projectName, onApply, onClose }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<ScheduleExcelParseResult | null>(null);
    const [jsonItems, setJsonItems] = useState<WbsDetailSchedule[] | null>(null);
    const [mode, setMode] = useState<Mode>('merge');
    const [applied, setApplied] = useState(false);

    if (!open) return null;

    const reset = () => {
        setAnalysis(null);
        setJsonItems(null);
        setError(null);
        setFileName(null);
        setApplied(false);
        if (inputRef.current) inputRef.current.value = '';
    };

    const close = () => {
        if (busy) return;
        reset();
        onClose();
    };

    const handleFile = async (file: File) => {
        setError(null);
        setAnalysis(null);
        setJsonItems(null);
        setBusy(true);
        setFileName(file.name);
        try {
            if (kind === 'excel') {
                const result = await parseScheduleExcel(file, current);
                setAnalysis(result);
            } else {
                const text = await file.text();
                const items = parseScheduleJson(text);
                setJsonItems(items);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '파싱 오류');
        } finally {
            setBusy(false);
        }
    };

    const handleApply = () => {
        if (kind === 'excel' && analysis) {
            let next: WbsDetailSchedule[];
            if (mode === 'replace') {
                next = [...analysis.added, ...analysis.updated, ...analysis.unchanged];
            } else {
                // merge: 기존 유지 + 업데이트 + 신규 추가
                const updatedIds = new Set([...analysis.updated, ...analysis.unchanged].map((x) => x.id));
                const kept = current.filter((x) => !updatedIds.has(x.id));
                next = [...kept, ...analysis.updated, ...analysis.unchanged, ...analysis.added];
            }
            onApply(next);
            setApplied(true);
        } else if (kind === 'json' && jsonItems) {
            if (mode === 'replace') {
                onApply(jsonItems);
            } else {
                const incomingIds = new Set(jsonItems.map((x) => x.id));
                const kept = current.filter((x) => !incomingIds.has(x.id));
                onApply([...kept, ...jsonItems]);
            }
            setApplied(true);
        }
    };

    const isExcel = kind === 'excel';
    const accept = isExcel ? '.xlsx,.xls' : '.json';
    const Icon = isExcel ? FileSpreadsheet : FileJson;
    const accentColor = isExcel ? 'emerald' : 'blue';

    const canApply = !applied && !busy && (analysis !== null || jsonItems !== null) && !error;

    // 요약 수치
    const addedCount = analysis?.added.length ?? (jsonItems ? jsonItems.filter((x) => !current.some((c) => c.id === x.id)).length : 0);
    const updatedCount = analysis?.updated.length ?? (jsonItems ? jsonItems.filter((x) => current.some((c) => c.id === x.id)).length : 0);
    const unchangedCount = analysis?.unchanged.length ?? 0;
    const errorCount = analysis?.errors.length ?? 0;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden">
                {/* 헤더 */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg bg-${accentColor}-100 text-${accentColor}-600 flex items-center justify-center`}>
                            <Icon size={16} />
                        </div>
                        <div>
                            <p className="text-sm font-black text-gray-900">
                                일정 WBS {isExcel ? '엑셀' : 'JSON'} 업로드
                            </p>
                            <p className="text-[10px] text-gray-400 leading-tight">
                                {projectName} · 일정 탭 데이터
                            </p>
                        </div>
                    </div>
                    <button onClick={close} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {/* 데이터 범위 안내 배너 */}
                    <div className={`flex items-start gap-2.5 rounded-xl bg-${accentColor}-50 border border-${accentColor}-200 px-3.5 py-3`}>
                        <div className={`mt-0.5 w-5 h-5 rounded-full bg-${accentColor}-100 text-${accentColor}-600 flex items-center justify-center shrink-0`}>
                            <Icon size={11} />
                        </div>
                        <div>
                            <p className={`text-xs font-black text-${accentColor}-700 mb-0.5`}>일정 탭 데이터만 영향받습니다</p>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                메뉴 구조도·개발 상세·진척율 데이터는 변경되지 않습니다.<br />
                                현재 저장된 일정 항목: <strong className="text-gray-700">{current.length}개</strong>
                            </p>
                        </div>
                    </div>

                    {/* 파일 드롭존 */}
                    {!analysis && !jsonItems && (
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDragOver(false);
                                const file = e.dataTransfer.files[0];
                                if (file) handleFile(file);
                            }}
                            onClick={() => inputRef.current?.click()}
                            className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors ${
                                dragOver
                                    ? `border-${accentColor}-400 bg-${accentColor}-50`
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                            {busy ? (
                                <Loader2 size={28} className="text-gray-400 animate-spin" />
                            ) : (
                                <UploadCloud size={28} className="text-gray-300" />
                            )}
                            <p className="text-sm font-bold text-gray-500">
                                {busy ? '분석 중…' : `${isExcel ? '.xlsx' : '.json'} 파일을 드래그하거나 클릭하여 선택`}
                            </p>
                            {fileName && <p className="text-[11px] text-gray-400">{fileName}</p>}
                            <input
                                ref={inputRef}
                                type="file"
                                accept={accept}
                                className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                            />
                        </div>
                    )}

                    {/* 에러 */}
                    {error && (
                        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-3">
                            <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-red-700 font-medium">{error}</p>
                        </div>
                    )}

                    {/* 분석 결과 */}
                    {(analysis || jsonItems) && !error && (
                        <>
                            {/* 파일명 + 다시 선택 */}
                            <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-2.5">
                                <div className="flex items-center gap-2">
                                    <Icon size={14} className="text-gray-400" />
                                    <span className="text-xs font-bold text-gray-700 truncate max-w-[220px]">{fileName}</span>
                                </div>
                                <button
                                    onClick={() => { reset(); setTimeout(() => inputRef.current?.click(), 50); }}
                                    className="text-[11px] text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors"
                                >
                                    <RefreshCw size={11} />다시 선택
                                </button>
                            </div>

                            {/* 변경 요약 */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-center">
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        <Plus size={12} className="text-emerald-600" />
                                        <span className="text-[10px] font-black text-emerald-700">신규 추가</span>
                                    </div>
                                    <p className="text-lg font-black text-emerald-600">{addedCount}</p>
                                    <p className="text-[10px] text-emerald-500">건</p>
                                </div>
                                <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 text-center">
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        <RefreshCw size={12} className="text-blue-600" />
                                        <span className="text-[10px] font-black text-blue-700">업데이트</span>
                                    </div>
                                    <p className="text-lg font-black text-blue-600">{updatedCount}</p>
                                    <p className="text-[10px] text-blue-500">건</p>
                                </div>
                                <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5 text-center">
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        <Minus size={12} className="text-gray-400" />
                                        <span className="text-[10px] font-black text-gray-500">변경없음</span>
                                    </div>
                                    <p className="text-lg font-black text-gray-500">{unchangedCount}</p>
                                    <p className="text-[10px] text-gray-400">건</p>
                                </div>
                            </div>

                            {/* 파싱 에러 목록 */}
                            {errorCount > 0 && (
                                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3">
                                    <p className="text-[11px] font-black text-amber-700 mb-1.5">⚠ 건너뜀 {errorCount}행</p>
                                    <div className="max-h-24 overflow-auto space-y-0.5">
                                        {analysis!.errors.map((e, i) => (
                                            <p key={i} className="text-[10px] text-amber-600">· {e}</p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 병합 모드 선택 */}
                            <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <p className="text-[10px] font-black text-gray-500 px-3.5 py-2 bg-gray-50 border-b border-gray-100">
                                    적용 방식
                                </p>
                                <div className="p-2 space-y-1.5">
                                    {([
                                        {
                                            key: 'merge',
                                            label: '병합 (추천)',
                                            desc: '파일에 있는 항목만 추가/업데이트하고 파일에 없는 기존 항목은 유지',
                                            icon: '🔀',
                                        },
                                        {
                                            key: 'replace',
                                            label: '전체 교체',
                                            desc: '현재 일정 데이터를 파일 내용으로 완전히 대체 (기존 항목 삭제)',
                                            icon: '🔄',
                                        },
                                    ] as { key: Mode; label: string; desc: string; icon: string }[]).map((opt) => (
                                        <label
                                            key={opt.key}
                                            className={`flex items-start gap-2.5 rounded-lg p-2.5 cursor-pointer border transition-colors ${
                                                mode === opt.key
                                                    ? `border-${accentColor}-300 bg-${accentColor}-50`
                                                    : 'border-transparent hover:bg-gray-50'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="mode"
                                                value={opt.key}
                                                checked={mode === opt.key}
                                                onChange={() => setMode(opt.key)}
                                                className="mt-0.5 accent-emerald-600"
                                            />
                                            <div>
                                                <p className="text-xs font-black text-gray-800">{opt.icon} {opt.label}</p>
                                                <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* 성공 */}
                    {applied && (
                        <div className="flex flex-col items-center gap-2 py-4 text-center">
                            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">✓</div>
                            <p className="text-sm font-black text-gray-800">일정 데이터가 반영됐습니다</p>
                            <p className="text-[11px] text-gray-400">신규 {addedCount}건 추가 · {updatedCount}건 업데이트</p>
                        </div>
                    )}
                </div>

                {/* 푸터 */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 shrink-0">
                    <button
                        onClick={close}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                        {applied ? '닫기' : '취소'}
                    </button>
                    {!applied && (
                        <button
                            onClick={handleApply}
                            disabled={!canApply}
                            className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors ${
                                canApply
                                    ? `bg-${accentColor}-600 hover:bg-${accentColor}-700`
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            적용
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WbsScheduleImportModal;
