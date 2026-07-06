import React, { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import WheelDatePicker, { WheelProgressPicker } from './WheelDatePicker';
import { buildAssigneeMenuDateRanges } from './wbsDateUtils';
import {
    menuPathParts,
    sortWbsDevRows,
    wbsPathDepth,
    WBS_GROUP_ROW_BG,
} from './wbsDevRowUtils';
import { StatusCell, CategoryCell, AssigneeCell, LockTooltip } from './WbsDevDetail';
import { useWbsStore } from '../../store/wbsStore';
import { useProjectStore } from '../../store/projectStore';
import { useWbsEditingStore } from '../../store/wbsEditingStore';
import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';

const cellInput = 'w-full bg-transparent px-2 py-1.5 text-[11px] outline-none focus:bg-emerald-50/50 rounded';

const WbsDevDetailExcelView: React.FC = () => {
    const menus = useWbsStore((s) => s.menus);
    const rows = useWbsStore((s) => s.rows);
    const updateRow = useWbsStore((s) => s.updateRow);
    const deleteRow = useWbsStore((s) => s.deleteRow);

    const editingMap = useWbsEditingStore((s) => s.editing);
    const emitFocus = useSyncStore((s) => s.emitWbsFieldFocus);
    const emitBlur = useSyncStore((s) => s.emitWbsFieldBlur);
    const currentUserId = useAuthStore((s) => s.user?.id);

    const currentProjectId = useProjectStore((s) => s.currentProjectId);
    const projects = useProjectStore((s) => s.projects);
    const projectMembers = useMemo(() => {
        const project = projects.find((p) => p.id === currentProjectId);
        return (project?.members ?? []).map((m, i) => ({ id: m.id, name: m.name, colorIdx: i }));
    }, [projects, currentProjectId]);

    const menuCodeById = useMemo(() => new Map(menus.map((m) => [m.id, m.menuCode])), [menus]);
    const sortedRows = useMemo(() => sortWbsDevRows(menus, rows), [menus, rows]);
    const pathDepth = useMemo(() => wbsPathDepth(menus, rows), [menus, rows]);

    const debugUnlockedByMenu = useMemo(() => {
        const map = new Map<string, boolean>();
        for (const menu of menus) {
            const menuRows = rows.filter((r) => r.menuId === menu.id);
            const normalRows = menuRows.filter((r) => !r.isDebugging);
            map.set(
                menu.id,
                normalRows.length > 0 && normalRows.every((r) => r.progress === 100 && r.status === 'DONE'),
            );
        }
        return map;
    }, [menus, rows]);

    const assigneeMenuRangesMap = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildAssigneeMenuDateRanges>>();
        for (const r of rows) {
            const name = r.assignee.trim();
            if (!name || map.has(name)) continue;
            map.set(name, buildAssigneeMenuDateRanges(name, menus, rows));
        }
        return map;
    }, [rows, menus]);

    let groupColorIdx = -1;
    let lastMenuId = '';

    const totals = useMemo(() => {
        const done = sortedRows.filter((r) => r.status === 'DONE').length;
        const avg = sortedRows.length
            ? Math.round(sortedRows.reduce((sum, r) => sum + (r.progress ?? 0), 0) / sortedRows.length)
            : 0;
        return { count: sortedRows.length, done, avg };
    }, [sortedRows]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-white shrink-0">
                <div>
                    <h2 className="text-sm font-black text-gray-900">개발 상세 · 엑셀형태</h2>
                    <p className="text-[11px] text-gray-400">
                        엑셀 다운로드 개발상세 시트와 동일한 열 구조 · {totals.count}행
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                <table className="w-full text-xs border-collapse" style={{ minWidth: 1200 + pathDepth * 120 }}>
                    <thead className="sticky top-0 z-20">
                        <tr className="bg-slate-700 text-white">
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black w-28">ID(수정금지)</th>
                            {Array.from({ length: pathDepth }, (_, i) => (
                                <th key={i} className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[100px]">
                                    메뉴경로
                                </th>
                            ))}
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black w-24">메뉴코드</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black w-28">구분(산출물)</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[160px]">기능명</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black w-24">담당자</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black w-24 bg-indigo-800">시작일</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black w-24 bg-indigo-800">종료일</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black w-20">상태</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black w-20 bg-emerald-800">진행율(%)</th>
                            <th className="border border-slate-600 px-2 py-1.5 text-center text-[10px] font-black min-w-[120px]">비고</th>
                            <th className="border border-slate-600 w-8" />
                        </tr>
                        <tr className="bg-slate-100 border-b-2 border-slate-300">
                            <td colSpan={pathDepth + 6} className="border border-slate-200 px-2 py-1.5 font-black text-slate-700 text-[11px]">
                                전체 ({totals.done}/{totals.count} 완료)
                            </td>
                            <td colSpan={2} className="border border-slate-200" />
                            <td className="border border-slate-200 px-2 py-1.5 text-center font-black text-[11px] text-emerald-700">
                                {totals.avg}%
                            </td>
                            <td colSpan={2} className="border border-slate-200" />
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.length === 0 ? (
                            <tr>
                                <td colSpan={pathDepth + 11} className="text-center text-gray-400 py-16 text-sm">
                                    개발 상세 데이터가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            sortedRows.map((r) => {
                                if (r.menuId !== lastMenuId) {
                                    groupColorIdx = (groupColorIdx + 1) % WBS_GROUP_ROW_BG.length;
                                    lastMenuId = r.menuId;
                                }
                                const palette = WBS_GROUP_ROW_BG[groupColorIdx];
                                const isDbg = !!r.isDebugging;
                                const dbgLocked = isDbg && !debugUnlockedByMenu.get(r.menuId);
                                const rowBg = isDbg ? palette.debug : palette.base;
                                const parts = menuPathParts(menus, r.menuId);
                                const rowEditEntry = editingMap.get(`row_${r.id}`);
                                const isRowBeingEdited = !!rowEditEntry && rowEditEntry.userId !== currentUserId;

                                return (
                                    <tr
                                        key={r.id}
                                        className={`border-b border-gray-100 hover:bg-sky-50/50 transition-colors group ${rowBg} ${isRowBeingEdited ? 'pointer-events-none select-none' : ''}`}
                                        style={isRowBeingEdited ? { boxShadow: `inset 3px 0 0 ${rowEditEntry!.color}` } : undefined}
                                        onFocus={() => { if (!isRowBeingEdited) emitFocus(`row_${r.id}`); }}
                                        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) emitBlur(`row_${r.id}`); }}
                                    >
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle">
                                            <span className="text-[9px] font-mono text-slate-400 truncate block max-w-[100px]" title={r.id}>
                                                {r.id}
                                            </span>
                                        </td>
                                        {Array.from({ length: pathDepth }, (_, i) => (
                                            <td key={i} className="border border-gray-100 px-2 py-1.5 align-middle text-[11px] text-gray-700">
                                                {parts[i] ?? ''}
                                            </td>
                                        ))}
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle text-center">
                                            <span className="text-[10px] font-mono font-bold text-indigo-600">
                                                {menuCodeById.get(r.menuId) ?? ''}
                                            </span>
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle">
                                            {isDbg ? (
                                                <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-bold">
                                                    Debuging
                                                </span>
                                            ) : (
                                                <CategoryCell value={r.category} onChange={(v) => updateRow(r.id, { category: v })} inputClass={cellInput} />
                                            )}
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle">
                                            <input
                                                value={r.featureName}
                                                onChange={(e) => updateRow(r.id, { featureName: e.target.value })}
                                                placeholder="기능명"
                                                className={cellInput}
                                            />
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle">
                                            <AssigneeCell
                                                value={r.assignee}
                                                assigneeUserId={r.assigneeUserId}
                                                onChange={(patch) => updateRow(r.id, patch)}
                                                members={projectMembers}
                                                inputClass={cellInput}
                                            />
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle text-center bg-indigo-50/30">
                                            <WheelDatePicker
                                                value={r.startDate}
                                                onChange={(v) => updateRow(r.id, { startDate: v })}
                                                rangeStart={r.startDate}
                                                rangeEnd={r.endDate}
                                                onRangeChange={(start, end) => updateRow(r.id, { startDate: start, endDate: end })}
                                                className="w-full"
                                                menuDateRanges={assigneeMenuRangesMap.get(r.assignee.trim()) ?? []}
                                            />
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle text-center bg-indigo-50/30">
                                            <WheelDatePicker
                                                value={r.endDate}
                                                onChange={(v) => updateRow(r.id, { endDate: v })}
                                                rangeStart={r.startDate}
                                                rangeEnd={r.endDate}
                                                onRangeChange={(start, end) => updateRow(r.id, { startDate: start, endDate: end })}
                                                className="w-full"
                                                menuDateRanges={assigneeMenuRangesMap.get(r.assignee.trim()) ?? []}
                                            />
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle">
                                            {dbgLocked ? (
                                                <span className="flex items-center gap-1 justify-center">
                                                    <span className="pointer-events-none select-none">
                                                        <StatusCell value={r.status} onChange={() => {}} />
                                                    </span>
                                                    <LockTooltip />
                                                </span>
                                            ) : (
                                                <StatusCell
                                                    value={r.status}
                                                    onChange={(status) => updateRow(r.id, status === 'DONE' ? { status, progress: 100 } : { status })}
                                                />
                                            )}
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle bg-emerald-50/30">
                                            {dbgLocked ? (
                                                <div className="flex items-center justify-center gap-1 text-gray-400 text-[11px]">
                                                    <span className="tabular-nums">{r.progress}</span>%
                                                    <LockTooltip />
                                                </div>
                                            ) : (
                                                <WheelProgressPicker
                                                    value={r.progress}
                                                    onChange={(v) => updateRow(r.id, { progress: v })}
                                                    variant="ghost"
                                                    accentColor="#10b981"
                                                />
                                            )}
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle">
                                            <input
                                                value={r.note ?? ''}
                                                onChange={(e) => updateRow(r.id, { note: e.target.value })}
                                                placeholder="비고"
                                                className={cellInput}
                                            />
                                        </td>
                                        <td className="border border-gray-100 px-2 py-1.5 align-middle text-center">
                                            {isRowBeingEdited ? (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white whitespace-nowrap"
                                                    style={{ backgroundColor: rowEditEntry!.color }}
                                                >
                                                    {rowEditEntry!.userName}
                                                </span>
                                            ) : (
                                                !isDbg && (
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteRow(r.id)}
                                                        className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100"
                                                        title="행 삭제"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default WbsDevDetailExcelView;
