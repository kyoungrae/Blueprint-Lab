import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, GanttChartSquare, FileSpreadsheet, FileDown, FileUp, FileJson, Network, ListTree, BarChart3, Layers, ShieldCheck, TableProperties, Hash, Copy, Check, CalendarDays } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { useWbsStore } from '../../store/wbsStore';
import { useAuthStore } from '../../store/authStore';
import type { WbsData, WbsDetailSchedule } from '../../types/wbs';
import WbsMenuTree from './WbsMenuTree';
import WbsDevDetail from './WbsDevDetail';
import WbsProgress from './WbsProgress';
import WbsSchedule from './WbsSchedule';
import WbsUploadModal from './WbsUploadModal';
import WbsExcelSyncModal from './WbsExcelSyncModal';
import WbsAdminModal from './WbsAdminModal';
import WbsScheduleImportModal from './WbsScheduleImportModal';
import WbsScheduleTable from './WbsScheduleTable';
import { downloadWbsExcel } from './wbsExcel';
import { downloadWbsJson, parseWbsJson } from './wbsIO';
import { downloadScheduleExcel, downloadScheduleJson } from './wbsScheduleIO';
import { copyToClipboard } from '../../utils/clipboard';

type WbsTab = 'hierarchy' | 'detail' | 'progress' | 'schedule' | 'schedule-table';

const DEV_TABS: { key: WbsTab; label: string; icon: React.ReactNode }[] = [
    { key: 'hierarchy', label: '메뉴 구조도', icon: <Network size={15} /> },
    { key: 'detail', label: '개발 상세', icon: <ListTree size={15} /> },
    { key: 'progress', label: '진척율', icon: <BarChart3 size={15} /> },
];

const SCHEDULE_TABS: { key: WbsTab; label: string; icon: React.ReactNode }[] = [
    { key: 'schedule', label: 'GANTT CHART', icon: <CalendarDays size={15} /> },
    { key: 'schedule-table', label: '일정', icon: <TableProperties size={15} /> },
];

const WbsCanvas: React.FC = () => {
    const currentProjectId = useProjectStore((s) => s.currentProjectId);
    const projects = useProjectStore((s) => s.projects);
    const setCurrentProject = useProjectStore((s) => s.setCurrentProject);
    const loadProject = useWbsStore((s) => s.loadProject);
    const importData = useWbsStore((s) => s.importData);
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);
    const detailSchedules = useWbsStore((s) => s.detailSchedules);

    const { user } = useAuthStore();
    const isMaster = user?.tier === 'MASTER' || user?.tier === 'ADMIN';

    const project = projects.find((p) => p.id === currentProjectId);
    const [tab, setTab] = useState<WbsTab>('hierarchy');
    const [uploadKind, setUploadKind] = useState<'json' | 'excel' | null>(null);
    // 일정 탭 전용 업로드 모달
    const [scheduleUploadKind, setScheduleUploadKind] = useState<'excel' | 'json' | null>(null);
    const [showActions, setShowActions] = useState(false);
    const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // 프로젝트 ID 패널
    const [showIdPanel, setShowIdPanel] = useState(false);
    const [idPanelPos, setIdPanelPos] = useState({ top: 0, right: 0 });
    const [copied, setCopied] = useState(false);
    const idTriggerRef = useRef<HTMLButtonElement>(null);
    const idPanelRef = useRef<HTMLDivElement>(null);

    const openIdPanel = () => {
        if (idTriggerRef.current) {
            const rect = idTriggerRef.current.getBoundingClientRect();
            setIdPanelPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        }
        setShowIdPanel((v) => !v);
    };

    useEffect(() => {
        if (!showIdPanel) return;
        const handler = (e: MouseEvent) => {
            if (
                idPanelRef.current && !idPanelRef.current.contains(e.target as Node) &&
                idTriggerRef.current && !idTriggerRef.current.contains(e.target as Node)
            ) setShowIdPanel(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showIdPanel]);

    const handleCopyId = async () => {
        if (!currentProjectId) return;
        const ok = await copyToClipboard(currentProjectId);
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // 관리자 패널
    const [showAdmin, setShowAdmin] = useState(false);
    const [adminPanelPos, setAdminPanelPos] = useState({ top: 0, right: 0 });
    const adminTriggerRef = useRef<HTMLButtonElement>(null);
    const adminPanelRef = useRef<HTMLDivElement>(null);
    const [showAdminModal, setShowAdminModal] = useState(false);

    const openAdmin = () => {
        if (adminTriggerRef.current) {
            const rect = adminTriggerRef.current.getBoundingClientRect();
            setAdminPanelPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        }
        setShowAdmin((v) => !v);
    };

    useEffect(() => {
        if (!showAdmin) return;
        const handler = (e: MouseEvent) => {
            if (
                adminPanelRef.current && !adminPanelRef.current.contains(e.target as Node) &&
                adminTriggerRef.current && !adminTriggerRef.current.contains(e.target as Node)
            ) setShowAdmin(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showAdmin]);

    const openActions = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPanelPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        }
        setShowActions((v) => !v);
    };

    useEffect(() => {
        if (!showActions) return;
        const handler = (e: MouseEvent) => {
            if (
                panelRef.current && !panelRef.current.contains(e.target as Node) &&
                triggerRef.current && !triggerRef.current.contains(e.target as Node)
            ) {
                setShowActions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showActions]);

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
                <nav className="flex items-center gap-2 ml-4">
                    {/* 개발 그룹 */}
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                        <span className="text-[10px] font-bold text-gray-400 px-2 select-none">개발</span>
                        <div className="w-px h-4 bg-gray-300 mx-0.5" />
                        {DEV_TABS.map((t) => (
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
                    </div>
                    {/* 일정 그룹 */}
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                        <span className="text-[10px] font-bold text-gray-400 px-2 select-none">일정</span>
                        <div className="w-px h-4 bg-gray-300 mx-0.5" />
                        {SCHEDULE_TABS.map((t) => (
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
                    </div>
                </nav>

                <div className="flex-1" />

                {/* 지니(Magic Lamp) 트리거 버튼 */}
                <style>{`
                    @keyframes genieItem {
                        0%   { opacity: 0; transform: translateY(10px) scaleX(0.4) scaleY(0.6); filter: blur(3px); }
                        60%  { opacity: 1; transform: translateY(-3px) scaleX(1.04) scaleY(1.04); filter: blur(0); }
                        100% { opacity: 1; transform: translateY(0) scaleX(1) scaleY(1); filter: blur(0); }
                    }
                    @keyframes genieTriggerOpen {
                        0%   { transform: scale(1) rotate(0deg); }
                        40%  { transform: scale(0.85) rotate(-15deg); }
                        100% { transform: scale(1) rotate(0deg); }
                    }
                    .genie-item { animation: genieItem 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
                    .genie-trigger-anim { animation: genieTriggerOpen 0.35s ease both; }
                `}</style>

                {/* 프로젝트 ID 버튼 */}
                <button
                    ref={idTriggerRef}
                    onClick={openIdPanel}
                    className={`genie-trigger-anim flex items-center justify-center w-9 h-9 rounded-xl transition-colors shadow-sm ${
                        showIdPanel
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : 'bg-indigo-50 text-indigo-500 border border-indigo-200 hover:bg-indigo-100'
                    }`}
                    title="프로젝트 ID"
                >
                    <Hash size={16} />
                </button>

                <button
                    ref={triggerRef}
                    key={showActions ? 'open' : 'closed'}
                    onClick={openActions}
                    className={`genie-trigger-anim flex items-center justify-center w-9 h-9 rounded-xl transition-colors shadow-sm ${
                        showActions
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                    }`}
                    title="내보내기 / 가져오기"
                >
                    <Layers size={16} />
                </button>

                {/* 관리자 트리거 버튼 — MASTER tier + 개발 상세 탭에서만 표시 */}
                {isMaster && tab === 'detail' && <button
                    ref={adminTriggerRef}
                    key={showAdmin ? 'admin-open' : 'admin-closed'}
                    onClick={openAdmin}
                    className={`genie-trigger-anim flex items-center justify-center w-9 h-9 rounded-xl transition-colors shadow-sm ${
                        showAdmin
                            ? 'bg-violet-600 text-white hover:bg-violet-700'
                            : 'bg-violet-50 text-violet-600 border border-violet-200 hover:bg-violet-100'
                    }`}
                    title="관리자"
                >
                    <ShieldCheck size={16} />
                </button>}
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
                {tab === 'schedule' && <WbsSchedule />}
                {tab === 'schedule-table' && <WbsScheduleTable />}
            </main>

            {/* 프로젝트 ID 패널 — Portal */}
            {showIdPanel && createPortal(
                <div
                    ref={idPanelRef}
                    style={{ position: 'fixed', top: idPanelPos.top, right: idPanelPos.right, zIndex: 9999 }}
                >
                    <div className="bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 w-72">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                                <Hash size={13} />
                            </div>
                            <span className="text-sm font-black text-gray-800">프로젝트 ID</span>
                        </div>
                        <p className="text-[11px] text-gray-400 leading-relaxed">
                            다른 사용자를 초대하거나 프로젝트를 연결할 때 사용하는 고유 ID입니다.
                        </p>
                        <div
                            className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer group hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                            onClick={handleCopyId}
                            title="클릭하여 복사"
                        >
                            <span className="flex-1 text-xs font-mono font-bold text-gray-700 truncate select-all">
                                {currentProjectId}
                            </span>
                            <span className={`shrink-0 transition-colors ${copied ? 'text-emerald-500' : 'text-gray-400 group-hover:text-indigo-500'}`}>
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                            </span>
                        </div>
                        {copied && (
                            <p className="text-[11px] text-emerald-600 font-bold text-center -mt-1">복사되었습니다!</p>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* 지니 패널 — 탭별 컨텍스트 분리 */}
            {showActions && createPortal(
                <div
                    ref={panelRef}
                    style={{ position: 'fixed', top: panelPos.top, right: panelPos.right, zIndex: 9999 }}
                >
                    <div className="bg-white/90 backdrop-blur-md border border-gray-100 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 min-w-[200px]">
                        {/* 어떤 데이터인지 레이블 */}
                        {(tab === 'schedule' || tab === 'schedule-table') ? (
                            <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5">
                                <CalendarDays size={11} className="text-blue-500" />
                                <span className="text-[10px] font-black text-blue-600 tracking-wide">일정 WBS 데이터</span>
                                <span className="ml-auto text-[10px] text-gray-400">{detailSchedules.length}개 항목</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5">
                                <ListTree size={11} className="text-emerald-500" />
                                <span className="text-[10px] font-black text-emerald-600 tracking-wide">개발 WBS 데이터</span>
                                <span className="ml-auto text-[10px] text-gray-400">{menus.length}메뉴 · {rows.length}행</span>
                            </div>
                        )}
                        <div className="h-px bg-gray-100 mx-1 mb-1" />

                        {(tab === 'schedule' || tab === 'schedule-table') ? (
                            // ── 일정 탭 전용 버튼 ──
                            <>
                                {[
                                    {
                                        delay: '0ms',
                                        icon: <FileSpreadsheet size={14} />,
                                        label: '엑셀 다운로드',
                                        className: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
                                        onClick: () => { downloadScheduleExcel(detailSchedules, project?.name ?? 'WBS'); setShowActions(false); },
                                        title: '일정 WBS를 엑셀로 다운로드',
                                    },
                                    {
                                        delay: '55ms',
                                        icon: <FileUp size={14} />,
                                        label: '엑셀 업로드',
                                        className: 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50',
                                        onClick: () => { setScheduleUploadKind('excel'); setShowActions(false); },
                                        title: '엑셀 파일로 일정 데이터 업데이트',
                                    },
                                    {
                                        delay: '110ms',
                                        icon: <FileDown size={14} />,
                                        label: 'JSON 다운로드',
                                        className: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50',
                                        onClick: () => { downloadScheduleJson(detailSchedules, project?.name ?? 'WBS'); setShowActions(false); },
                                        title: '일정 WBS 데이터를 JSON으로 다운로드',
                                    },
                                    {
                                        delay: '165ms',
                                        icon: <FileJson size={14} />,
                                        label: 'JSON 업로드',
                                        className: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50',
                                        onClick: () => { setScheduleUploadKind('json'); setShowActions(false); },
                                        title: 'JSON 파일로 일정 데이터 업데이트',
                                    },
                                ].map((item) => (
                                    <button
                                        key={item.label}
                                        onClick={item.onClick}
                                        title={item.title}
                                        style={{ animationDelay: item.delay }}
                                        className={`genie-item flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${item.className}`}
                                    >
                                        {item.icon}
                                        {item.label}
                                    </button>
                                ))}
                            </>
                        ) : (
                            // ── 개발 탭 버튼 ──
                            <>
                                {[
                                    {
                                        delay: '0ms',
                                        icon: <FileSpreadsheet size={14} />,
                                        label: '엑셀 다운로드',
                                        className: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
                                        onClick: () => { downloadWbsExcel({ menus, rows }, project?.name ?? 'WBS'); setShowActions(false); },
                                        title: '현재 WBS를 엑셀로 다운로드',
                                    },
                                    {
                                        delay: '55ms',
                                        icon: <FileUp size={14} />,
                                        label: '엑셀 업로드',
                                        className: 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50',
                                        onClick: () => { setUploadKind('excel'); setShowActions(false); },
                                        title: '엑셀 파일을 업로드하여 현재 데이터에 반영',
                                    },
                                    {
                                        delay: '110ms',
                                        icon: <FileDown size={14} />,
                                        label: 'JSON 다운로드',
                                        className: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50',
                                        onClick: () => { downloadWbsJson({ menus, rows }, project?.name ?? 'WBS'); setShowActions(false); },
                                        title: '현재 WBS 데이터를 JSON으로 다운로드',
                                    },
                                    {
                                        delay: '165ms',
                                        icon: <FileJson size={14} />,
                                        label: 'JSON 업로드',
                                        className: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50',
                                        onClick: () => { setUploadKind('json'); setShowActions(false); },
                                        title: 'JSON 파일을 업로드하여 데이터 최신화',
                                    },
                                ].map((item) => (
                                    <button
                                        key={item.label}
                                        onClick={item.onClick}
                                        title={item.title}
                                        style={{ animationDelay: item.delay }}
                                        className={`genie-item flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${item.className}`}
                                    >
                                        {item.icon}
                                        {item.label}
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* 관리자 패널 — Portal */}
            {showAdmin && createPortal(
                <div
                    ref={adminPanelRef}
                    style={{ position: 'fixed', top: adminPanelPos.top, right: adminPanelPos.right, zIndex: 9999 }}
                >
                    <div className="bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl shadow-2xl p-2 flex flex-col gap-1">
                        <button
                            type="button"
                            style={{ animationDelay: '0ms' }}
                            onClick={() => { setShowAdminModal(true); setShowAdmin(false); }}
                            className="genie-item flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap
                                bg-white text-violet-700 border border-violet-100 hover:bg-violet-50 transition-colors"
                        >
                            <TableProperties size={14} />
                            기능 Row 수정
                        </button>
                    </div>
                </div>,
                document.body
            )}

            <WbsAdminModal open={showAdminModal} onClose={() => setShowAdminModal(false)} />

            <WbsUploadModal
                open={uploadKind === 'json'}
                title="JSON 업로드"
                description="'JSON 다운로드'로 받은 것과 동일한 형식의 .json 파일을 올리면 현재 데이터를 그 내용으로 최신화합니다. (전체 교체 — 적용 직전 현재 데이터가 JSON으로 자동 백업됩니다.)"
                accept=".json"
                onFile={async (file) => {
                    const text = await file.text();
                    const data = parseWbsJson(text);
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

            {/* 일정 탭 전용 업로드 모달 */}
            {scheduleUploadKind && (
                <WbsScheduleImportModal
                    open={true}
                    kind={scheduleUploadKind}
                    current={detailSchedules}
                    projectName={project?.name ?? 'WBS'}
                    onApply={(next: WbsDetailSchedule[]) => importData({ detailSchedules: next })}
                    onClose={() => setScheduleUploadKind(null)}
                />
            )}
        </div>
    );
};

export default WbsCanvas;
