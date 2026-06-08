import React, { useEffect, useState } from 'react';
import { ArrowLeft, GanttChartSquare, FileSpreadsheet, Network, ListTree, BarChart3 } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { useWbsStore } from '../../store/wbsStore';
import type { WbsData } from '../../types/wbs';
import WbsMenuTree from './WbsMenuTree';
import WbsDevDetail from './WbsDevDetail';
import WbsProgress from './WbsProgress';
import { downloadWbsExcel } from './wbsExcel';

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
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);

    const project = projects.find((p) => p.id === currentProjectId);
    const [tab, setTab] = useState<WbsTab>('hierarchy');

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

                <button
                    onClick={() => downloadWbsExcel({ menus, rows }, project?.name ?? 'WBS')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
                    title="현재 WBS를 엑셀로 다운로드"
                >
                    <FileSpreadsheet size={15} />
                    <span className="hidden sm:inline">엑셀 다운로드</span>
                </button>
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
        </div>
    );
};

export default WbsCanvas;
