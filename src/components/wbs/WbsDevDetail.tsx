import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useWbsStore } from '../../store/wbsStore';
import { WBS_STATUS_ORDER, WBS_STATUS_LABEL, WBS_DEFAULT_CATEGORIES } from '../../types/wbs';
import WbsMenuTree from './WbsMenuTree';

/** ‘+ ALL’ 클릭 시 자동 추가되는 산출물 구분 행 */
const ALL_ARTIFACT_CATEGORIES = ['Controller', 'Service', 'ServiceImpl', 'VO', 'Mapper', 'Html'];

const WbsDevDetail: React.FC = () => {
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);
    const addRow = useWbsStore((s) => s.addRow);
    const addRows = useWbsStore((s) => s.addRows);
    const updateRow = useWbsStore((s) => s.updateRow);
    const deleteRow = useWbsStore((s) => s.deleteRow);

    const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
    // 첫 메뉴 자동 선택
    useEffect(() => {
        if (!selectedMenuId && menus.length > 0) setSelectedMenuId(menus[0].id);
        if (selectedMenuId && !menus.some((m) => m.id === selectedMenuId)) {
            setSelectedMenuId(menus[0]?.id ?? null);
        }
    }, [menus, selectedMenuId]);

    const selectedMenu = menus.find((m) => m.id === selectedMenuId) || null;
    const menuRows = rows.filter((r) => r.menuId === selectedMenuId);

    // ── 좌/우 분할 리사이저 ──
    const [leftWidth, setLeftWidth] = useState(300);
    const draggingRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const onResizeDown = useCallback(() => { draggingRef.current = true; }, []);
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!draggingRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const w = Math.min(Math.max(e.clientX - rect.left, 200), rect.width - 360);
            setLeftWidth(w);
        };
        const onUp = () => { draggingRef.current = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, []);

    const cellInput = 'w-full bg-transparent px-2 py-1.5 text-sm outline-none focus:bg-emerald-50/50 rounded';

    return (
        <div ref={containerRef} className="flex h-full min-h-0">
            {/* 좌: 메뉴 트리(선택 전용) */}
            <div className="shrink-0 border-r border-gray-200 bg-white p-3 overflow-hidden" style={{ width: leftWidth }}>
                <WbsMenuTree selectedId={selectedMenuId} onSelect={setSelectedMenuId} editable={false} showProgress />
            </div>

            {/* 리사이저 */}
            <div onMouseDown={onResizeDown} className="w-1.5 shrink-0 cursor-col-resize bg-gray-100 hover:bg-emerald-300 transition-colors" title="너비 조절" />

            {/* 우: 개발 상세 그리드 */}
            <div className="flex-1 min-w-0 flex flex-col bg-gray-50">
                {!selectedMenu ? (
                    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                        좌측에서 메뉴를 선택하세요. (메뉴는 ‘메뉴 구조도’ 탭에서 추가)
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-white">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{selectedMenu.menuCode}</span>
                                    <h3 className="text-base font-black text-gray-900 truncate">{selectedMenu.name}</h3>
                                </div>
                                <p className="text-[11px] text-gray-400 mt-0.5">선택한 메뉴의 산출물·기능별 일정을 입력합니다.</p>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => addRow(selectedMenu.id)}
                                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                >
                                    <Plus size={15} /> 행 추가
                                </button>
                                <button
                                    type="button"
                                    onClick={() => addRows(selectedMenu.id, ALL_ARTIFACT_CATEGORIES)}
                                    title={`산출물 행 일괄 추가: ${ALL_ARTIFACT_CATEGORIES.join(', ')}`}
                                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50 transition-colors"
                                >
                                    <Plus size={15} /> ALL
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto">
                            <table className="w-full border-collapse text-sm">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-gray-100 text-gray-600 text-[11px] font-black uppercase tracking-wider">
                                        <th className="text-left px-2 py-2 w-32 border-b border-gray-200">구분(산출물)</th>
                                        <th className="text-left px-2 py-2 border-b border-gray-200">기능명</th>
                                        <th className="text-left px-2 py-2 w-28 border-b border-gray-200">담당자</th>
                                        <th className="text-left px-2 py-2 w-36 border-b border-gray-200">시작일</th>
                                        <th className="text-left px-2 py-2 w-36 border-b border-gray-200">종료일</th>
                                        <th className="text-left px-2 py-2 w-28 border-b border-gray-200">상태</th>
                                        <th className="text-left px-2 py-2 w-28 border-b border-gray-200">진행율</th>
                                        <th className="text-left px-2 py-2 border-b border-gray-200">비고</th>
                                        <th className="w-10 border-b border-gray-200" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {menuRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="text-center text-gray-400 py-10 text-sm">
                                                아직 입력된 산출물이 없습니다. ‘행 추가’로 시작하세요.
                                            </td>
                                        </tr>
                                    ) : (
                                        menuRows.map((r) => (
                                            <tr key={r.id} className="bg-white hover:bg-gray-50 border-b border-gray-100">
                                                <td className="align-middle">
                                                    <input list="wbs-categories" value={r.category} onChange={(e) => updateRow(r.id, { category: e.target.value })} placeholder="Controller…" className={cellInput} />
                                                </td>
                                                <td className="align-middle">
                                                    <input value={r.featureName} onChange={(e) => updateRow(r.id, { featureName: e.target.value })} placeholder="기능명" className={cellInput} />
                                                </td>
                                                <td className="align-middle">
                                                    <input value={r.assignee} onChange={(e) => updateRow(r.id, { assignee: e.target.value })} placeholder="담당자" className={cellInput} />
                                                </td>
                                                <td className="align-middle">
                                                    <input type="date" value={r.startDate} onChange={(e) => updateRow(r.id, { startDate: e.target.value })} className={cellInput} />
                                                </td>
                                                <td className="align-middle">
                                                    <input type="date" value={r.endDate} onChange={(e) => updateRow(r.id, { endDate: e.target.value })} className={cellInput} />
                                                </td>
                                                <td className="align-middle">
                                                    <select value={r.status} onChange={(e) => updateRow(r.id, { status: e.target.value as typeof r.status })} className={`${cellInput} cursor-pointer`}>
                                                        {WBS_STATUS_ORDER.map((s) => <option key={s} value={s}>{WBS_STATUS_LABEL[s]}</option>)}
                                                    </select>
                                                </td>
                                                <td className="align-middle">
                                                    <div className="flex items-center gap-1 px-2">
                                                        <input type="number" min={0} max={100} value={r.progress} onChange={(e) => updateRow(r.id, { progress: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} className="w-12 bg-transparent text-sm outline-none focus:bg-emerald-50/50 rounded text-right" />
                                                        <span className="text-xs text-gray-400">%</span>
                                                    </div>
                                                </td>
                                                <td className="align-middle">
                                                    <input value={r.note ?? ''} onChange={(e) => updateRow(r.id, { note: e.target.value })} placeholder="비고" className={cellInput} />
                                                </td>
                                                <td className="align-middle text-center">
                                                    <button type="button" onClick={() => deleteRow(r.id)} className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded" title="행 삭제">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                            <datalist id="wbs-categories">
                                {WBS_DEFAULT_CATEGORIES.map((c) => <option key={c} value={c} />)}
                            </datalist>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default WbsDevDetail;
