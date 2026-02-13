import React, { useState } from 'react';
import { X, Download, Code, Check } from 'lucide-react';
import { useERDStore } from '../store/erdStore';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';
import { parseSQLToERD } from '../utils/sqlParser';

interface ImportModalProps {
    onClose: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ onClose }) => {
    const { entities, mergeData, addLog } = useERDStore();
    const { sendOperation } = useSyncStore();
    const { user } = useAuthStore();
    const { currentProjectId, updateProjectData } = useProjectStore();
    const [tab, setTab] = useState<'file' | 'code'>('file');
    const [sqlCode, setSqlCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    const checkDuplicates = (newData: any) => {
        const duplicates = newData.entities.filter((newEntity: any) =>
            entities.some(e => e.name.toLowerCase() === newEntity.name.toLowerCase())
        );
        return duplicates.map((d: any) => d.name);
    };

    const processImport = (data: any, importType: 'JSON' | 'SQL') => {
        const duplicateNames = checkDuplicates(data);
        let overwrite = false;

        if (duplicateNames.length > 0) {
            const message = `다음 테이블이 이미 존재합니다: ${duplicateNames.join(', ')}.\n\n기존 테이블을 덮어쓰시겠습니까?\n(확인을 누르면 덮어쓰고, 취소를 누르면 중복을 제외한 새 테이블만 추가합니다)`;
            overwrite = window.confirm(message);
            mergeData(data, overwrite);
        } else {
            mergeData(data, false);
        }

        // Add history log & broadcast
        const logData = {
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            userPicture: user?.picture,
            type: 'IMPORT' as const,
            targetType: 'PROJECT' as const,
            targetName: 'Project',
            details: `${importType === 'SQL' ? 'SQL 스크립트' : 'JSON 파일'}에서 ${data.entities.length}개의 테이블을 가져왔습니다.`,
            payload: {
                importedTables: data.entities.map((e: any) => e.name)
            }
        };

        addLog(logData);

        // Broadcast the imported data as a single atomic operation
        sendOperation({
            type: 'ERD_IMPORT',
            targetId: currentProjectId || 'project',
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: {
                ...data,
                overwrite,
                historyLog: logData // Pass the log for others to add
            }
        });

        // Force a project save if we have a real project ID
        if (currentProjectId && !currentProjectId.startsWith('proj_')) {
            const { entities, relationships } = useERDStore.getState();
            updateProjectData(currentProjectId, {
                entities,
                relationships,
            });
        }

        onClose();
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target?.result as string);
                    processImport(data, 'JSON');
                } catch (err) {
                    setError('Failed to parse JSON file. Please check the format.');
                }
            };
            reader.readAsText(file);
        }
    };

    const handleSqlImport = () => {
        if (!sqlCode.trim()) {
            setError('Please enter some SQL DDL code.');
            return;
        }

        try {
            const data = parseSQLToERD(sqlCode);
            if (data.entities.length === 0) {
                setError('No valid CREATE TABLE statements found.');
                return;
            }
            processImport(data, 'SQL');
        } catch (err) {
            setError('Failed to parse SQL. Please check your syntax.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">데이터 가져오기</h2>
                        <p className="text-sm text-gray-500 mt-1">JSON 파일 업로드 또는 SQL(DDL) 코드를 입력하세요</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-gray-600 border border-transparent hover:border-gray-200"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex p-2 bg-gray-100/50 gap-1">
                    <button
                        onClick={() => setTab('file')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium transition-all ${tab === 'file'
                            ? 'bg-white shadow-sm text-blue-600'
                            : 'text-gray-500 hover:bg-gray-200/50'
                            }`}
                    >
                        <Download size={18} />
                        파일 가져오기
                    </button>
                    <button
                        onClick={() => setTab('code')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium transition-all ${tab === 'code'
                            ? 'bg-white shadow-sm text-blue-600'
                            : 'text-gray-500 hover:bg-gray-200/50'
                            }`}
                    >
                        <Code size={18} />
                        SQL 스크립트
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 flex-1">
                    {tab === 'file' ? (
                        <div className="relative flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/30 group hover:border-blue-400 transition-colors">
                            <div className="p-4 bg-blue-50 text-blue-500 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
                                <Download size={32} />
                            </div>
                            <p className="text-gray-600 font-medium">클릭하여 파일을 선택하거나 드래그 앤 드롭하세요</p>
                            <p className="text-xs text-gray-400 mt-2">이 시스템에서 내보낸 .json 파일을 지원합니다</p>
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleFileUpload}
                                className="absolute inset-0 cursor-pointer opacity-0"
                            />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="relative group">
                                <textarea
                                    value={sqlCode}
                                    onChange={(e) => {
                                        setSqlCode(e.target.value);
                                        setError(null);
                                    }}
                                    className="w-full h-64 p-4 bg-gray-900 text-blue-100 font-mono text-sm rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                    placeholder={`-- 예시 SQL DDL\nCREATE TABLE users (\n  id INT PRIMARY KEY,\n  username VARCHAR(255),\n  email VARCHAR(255) NOT NULL\n);`}
                                />
                                <div className="absolute top-3 right-3 opacity-30 group-hover:opacity-100 transition-opacity">
                                    <div className="px-2 py-1 bg-gray-700 text-[10px] text-gray-300 rounded uppercase tracking-widest font-bold">SQL</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 text-red-500 text-sm rounded-lg border border-red-100 flex items-center gap-2 animate-in slide-in-from-top-1">
                            <div className="w-1 h-1 bg-red-500 rounded-full" />
                            {error}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors text-sm"
                    >
                        취소
                    </button>
                    {tab === 'code' && (
                        <button
                            onClick={handleSqlImport}
                            className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-shadow hover:shadow-lg hover:shadow-blue-200 flex items-center justify-center gap-2 text-sm"
                        >
                            <Check size={18} />
                            엔티티 생성
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportModal;
