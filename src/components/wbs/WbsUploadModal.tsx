import React, { useRef, useState } from 'react';
import { X, UploadCloud, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';

interface WbsUploadModalProps {
    open: boolean;
    title: string;
    description: string;
    /** 허용 확장자 (예: '.json' 또는 '.xlsx,.xls') */
    accept: string;
    /** 파일 처리. 성공 시 요약 메시지 반환, 실패 시 throw */
    onFile: (file: File) => Promise<string>;
    onClose: () => void;
}

const WbsUploadModal: React.FC<WbsUploadModalProps> = ({ open, title, description, accept, onFile, onClose }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);

    if (!open) return null;

    const acceptExts = accept.split(',').map((s) => s.trim().toLowerCase());
    const matchesAccept = (name: string) => acceptExts.some((ext) => name.toLowerCase().endsWith(ext));

    const handleFile = async (file: File) => {
        setError(null);
        setSuccess(null);
        setFileName(file.name);
        if (!matchesAccept(file.name)) {
            setError(`허용되는 파일 형식이 아닙니다. (${accept})`);
            return;
        }
        setBusy(true);
        try {
            const summary = await onFile(file);
            setSuccess(summary || '반영되었습니다.');
        } catch (e) {
            setError(e instanceof Error ? e.message : '파일 처리 중 오류가 발생했습니다.');
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const close = () => {
        if (busy) return;
        setError(null);
        setSuccess(null);
        setFileName(null);
        setDragOver(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[10050] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={close}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h3 className="text-base font-black text-gray-900">{title}</h3>
                    <button onClick={close} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-5">
                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">{description}</p>

                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            const f = e.dataTransfer.files?.[0];
                            if (f) void handleFile(f);
                        }}
                        onClick={() => !busy && inputRef.current?.click()}
                        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer transition-colors ${
                            dragOver ? 'border-emerald-400 bg-emerald-50/60' : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                        }`}
                    >
                        {busy ? (
                            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                        ) : (
                            <UploadCloud className="w-8 h-8 text-gray-400" />
                        )}
                        <p className="text-sm font-bold text-gray-700">파일을 끌어다 놓거나 클릭해서 선택</p>
                        <p className="text-[11px] text-gray-400">{accept} 형식</p>
                        {fileName && (
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500">
                                <FileText size={13} /> {fileName}
                            </div>
                        )}
                    </div>

                    <input
                        ref={inputRef}
                        type="file"
                        accept={accept}
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
                    />

                    {error && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                            <AlertCircle size={15} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}
                    {success && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-700">
                            <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                            <span>{success}</span>
                        </div>
                    )}

                    <div className="mt-4 flex justify-end gap-2">
                        <button onClick={close} disabled={busy} className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40">
                            {success ? '닫기' : '취소'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WbsUploadModal;
