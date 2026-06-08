import React, { useEffect, useState } from 'react';
import { ArrowLeft, GanttChartSquare, FileSpreadsheet, FileDown, FileUp, FileJson, Network, ListTree, BarChart3 } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { useWbsStore } from '../../store/wbsStore';
import type { WbsData } from '../../types/wbs';
import WbsMenuTree from './WbsMenuTree';
import WbsDevDetail from './WbsDevDetail';
import WbsProgress from './WbsProgress';
import WbsUploadModal from './WbsUploadModal';
import WbsExcelSyncModal from './WbsExcelSyncModal';
import { downloadWbsExcel } from './wbsExcel';
import { downloadWbsJson, parseWbsJson } from './wbsIO';

type WbsTab = 'hierarchy' | 'detail' | 'progress';

const TABS: { key: WbsTab; label: string; icon: React.ReactNode }[] = [
    { key: 'hierarchy', label: '메뉴 구조도', icon: <Network size={15} /> },
    { key: 'detail', label: '개발 상세', icon: <ListTree size={15} /> },
    { key: 'progress', label: '진척율', icon: <BarChart3 size={15} /> },
];

const WbsCanvas: React.FC = () => {
    const currentProjectId = useProjectStore((s) => s.currentProjectId);
    const projects = useProjectStore((s) => s.projects);
    const setCurrentProject = useProjectStore((s) => s.setCurrentProject);
    const loadProject = useWbsStore((s) => s.loadProject);
    const importData = useWbsStore((s) => s.importData);
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);

    const project = projects.find((p) => p.id === currentProjectId);
    const [tab, setTab] = useState<WbsTab>('hierarchy');
    const [uploadKind, setUploadKind] = useState<'json' | 'excel' | null>(null);

    // 프로젝트 진입 시 데이터 로드
    useEffect(() => {
        if (!currentProjectId) return;
        const data = (project?.data as Partial<WbsData> | undefined) ?? { menus: [], rows: [] };
        loadProject(currentProjectId, data);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProjectId, project?.id]);

    return (
        <div className="flex flex-col w-full h-screen bg-gray-50">
            {/* 헤더 */}
            <header className="shrink-0 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shadow-sm z-10">
                <button
                    onClick={() => setCurrentProject(null)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                    title="프로젝트 목록"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <GanttChartSquare size={18} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-sm font-black text-gray-900 truncate leading-tight">{project?.name ?? 'WBS'}</h1>
                        <p className="text-[10px] text-gray-400 leading-tight">WBS · 일정관리</p>
                    </div>
                </div>

                {/* 탭 */}
                <nav className="flex items-center gap-1 ml-4 bg-gray-100 rounded-xl p-1">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                                tab === t.key ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            {t.icon}
                            <span className="hidden sm:inline">{t.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="flex-1" />

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => downloadWbsExcel({ menus, rows }, project?.name ?? 'WBS')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
                        title="현재 WBS를 엑셀로 다운로드"
                    >
                        <FileSpreadsheet size={15} />
                        <span className="hidden lg:inline">엑셀 다운로드</span>
                    </button>
                    <button
                        onClick={() => setUploadKind('excel')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 transition-colors"
                        title="엑셀 파일을 업로드하여 현재 데이터에 반영"
                    >
                        <FileUp size={15} />
                        <span className="hidden lg:inline">엑셀 업로드</span>
                    </button>
                    <div className="w-px h-6 bg-gray-200 mx-0.5" />
                    <button
                        onClick={() => downloadWbsJson({ menus, rows }, project?.name ?? 'WBS')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                        title="현재 WBS 데이터를 JSON으로 다운로드"
                    >
                        <FileDown size={15} />
                        <span className="hidden lg:inline">JSON 다운로드</span>
                    </button>
                    <button
                        onClick={() => setUploadKind('json')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                        title="JSON 파일을 업로드하여 데이터 최신화"
                    >
                        <FileJson size={15} />
                        <span className="hidden lg:inline">JSON 업로드</span>
                    </button>
                </div>
            </header>

            {/* 본문 */}
            <main className="flex-1 min-h-0">
                {tab === 'hierarchy' && (
                    <div className="h-full overflow-auto p-6">
                        <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-4 h-[calc(100%-0px)] min-h-[300px]">
                            <p className="text-[11px] text-gray-400 mb-3 px-1 leading-relaxed">
                                메뉴를 추가/삭제하고, 드래그하여 다른 메뉴 위로 놓으면 하위로 이동합니다. 빈 영역에 놓으면 최상위로 이동합니다.
                            </p>
                            <div className="h-[calc(100%-2rem)]">
                                <WbsMenuTree editable showProgress />
                            </div>
                        </div>
                    </div>
                )}
                {tab === 'detail' && <WbsDevDetail />}
                {tab === 'progress' && <WbsProgress />}
            </main>

            <WbsUploadModal
                open={uploadKind === 'json'}
                title="JSON 업로드"
                description="‘JSON 다운로드’로 받은 것과 동일한 형식의 .json 파일을 올리면 현재 데이터를 그 내용으로 최신화합니다. (전체 교체 — 적용 직전 현재 데이터가 JSON으로 자동 백업됩니다.)"
                accept=".json"
                onFile={async (file) => {
                    const text = await file.text();
                    const data = parseWbsJson(text);
                    // 적용 직전 현재 데이터를 자동 백업(롤백용)
                    downloadWbsJson({ menus, rows }, `${project?.name ?? 'WBS'}_백업_${new Date().toISOString().slice(0, 10)}`);
                    importData(data);
                    return `메뉴 ${data.menus.length}개, 항목 ${data.rows.length}개로 최신화했습니다. (백업 JSON 자동 다운로드됨)`;
                }}
                onClose={() => setUploadKind(null)}
            />
            <WbsExcelSyncModal
                open={uploadKind === 'excel'}
                current={{ menus, rows }}
                projectName={project?.name ?? 'WBS'}
                onApply={(data) => importData(data)}
                onClose={() => setUploadKind(null)}
            />
        </div>
    );
};

export default WbsCanvas;
