import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Layers, User, CalendarDays, CalendarCheck, Activity, Percent, ChevronLeft, RotateCcw, Lock, PenLine } from 'lucide-react';
import WheelDatePicker, { WheelProgressPicker } from './WheelDatePicker';
import { buildAssigneeMenuDateRanges } from './wbsDateUtils';
import { useWbsStore } from '../../store/wbsStore';
import { useProjectStore } from '../../store/projectStore';
import { useWbsEditingStore } from '../../store/wbsEditingStore';
import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';
import { WBS_STATUS_ORDER, WBS_STATUS_LABEL, WBS_DEFAULT_CATEGORIES } from '../../types/wbs';
import type { WbsStatus } from '../../types/wbs';
import WbsMenuTree, { ASSIGNEE_PALETTE } from './WbsMenuTree';
import WbsDevDetailFilterBar from './WbsDevDetailFilterBar';
import { getAllAssignees } from './wbsDevFilterUtils';

/** '+ ALL' 클릭 시 자동 추가되는 산출물 구분 행 */
const ALL_ARTIFACT_CATEGORIES = ['Controller', 'Service', 'ServiceImpl', 'VO', 'Mapper', 'Html'];

/** 자물쇠 스마트 툴팁 */
export const LockTooltip: React.FC = () => {
    const [visible, setVisible] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    const show = () => {
        if (ref.current) {
            const r = ref.current.getBoundingClientRect();
            setPos({ top: r.top - 8, left: r.left + r.width / 2 });
        }
        setVisible(true);
    };

    return (
        <>
            <span
                ref={ref}
                onMouseEnter={show}
                onMouseLeave={() => setVisible(false)}
                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-500 cursor-default"
            >
                <Lock size={11} />
            </span>
            {visible && pos && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: pos.top,
                        left: pos.left,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 99999,
                        pointerEvents: 'none',
                    }}
                >
                    <div className="flex flex-col items-center">
                        <div className="bg-gray-900 text-white text-xs font-medium px-3 py-2 rounded-xl shadow-lg whitespace-nowrap max-w-[220px] text-center leading-snug">
                            🔒 모든 행의 작업이 완료(100%)되어야<br />잠금이 해제됩니다.
                        </div>
                        {/* 말풍선 꼬리 */}
                        <div className="w-2.5 h-2 overflow-hidden -mt-px">
                            <div className="w-2.5 h-2.5 bg-gray-900 rotate-45 translate-y-[-55%] translate-x-0 mx-auto" />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

/** 상태별 뱃지 스타일 */
const STATUS_STYLE: Record<WbsStatus, { badge: string; dot: string }> = {
    TODO:        { badge: 'bg-gray-100 text-gray-600 border-gray-200',       dot: 'bg-gray-400' },
    IN_PROGRESS: { badge: 'bg-blue-50 text-blue-700 border-blue-200',        dot: 'bg-blue-500' },
    DONE:        { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    HOLD:        { badge: 'bg-amber-50 text-amber-700 border-amber-200',     dot: 'bg-amber-400' },
};

/** 상태 뱃지 셀 — 클릭하면 드롭다운으로 변경 */
export const StatusCell: React.FC<{ value: WbsStatus; onChange: (v: WbsStatus) => void }> = ({ value, onChange }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const style = STATUS_STYLE[value];

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div ref={ref} className="relative px-1.5 py-1">
            {/* 현재 상태 뱃지 */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-bold whitespace-nowrap transition-all hover:opacity-80 ${style.badge}`}
            >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                {WBS_STATUS_LABEL[value]}
            </button>

            {/* 드롭다운 */}
            {open && (
                <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-100 rounded-xl shadow-lg p-1.5 flex flex-col gap-1 min-w-[100px]">
                    {WBS_STATUS_ORDER.map((s) => {
                        const st = STATUS_STYLE[s];
                        return (
                            <button
                                key={s}
                                type="button"
                                onClick={() => { onChange(s); setOpen(false); }}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors hover:opacity-80 ${st.badge} ${s === value ? 'ring-1 ring-offset-1 ring-current' : ''}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                                {WBS_STATUS_LABEL[s]}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

/** 구분(산출물) 카테고리 색상 맵 */
const CATEGORY_COLOR: Record<string, string> = {
    Controller:  'bg-blue-100 text-blue-700 border-blue-200',
    Service:     'bg-emerald-100 text-emerald-700 border-emerald-200',
    ServiceImpl: 'bg-teal-100 text-teal-700 border-teal-200',
    VO:          'bg-purple-100 text-purple-700 border-purple-200',
    Mapper:      'bg-orange-100 text-orange-700 border-orange-200',
    Html:        'bg-pink-100 text-pink-700 border-pink-200',
    '기능':      'bg-indigo-100 text-indigo-700 border-indigo-200',
    Debuging:    'bg-amber-100 text-amber-700 border-amber-200',
};
const CATEGORY_COLOR_DEFAULT = 'bg-gray-100 text-gray-700 border-gray-200';

const PRESET_CATEGORIES = WBS_DEFAULT_CATEGORIES.filter((c) => c !== '직접입력');

/**
 * 구분(산출물) 셀
 * - 값이 있으면 컬러 뱃지로 표시, 클릭하면 편집 모드
 * - 편집 모드: 셀렉트 or 직접입력 텍스트
 */
export const CategoryCell: React.FC<{ value: string; onChange: (v: string) => void; inputClass: string }> = ({ value, onChange }) => {
    const [editing, setEditing] = useState(!value);
    const [isCustom, setIsCustom] = useState(!PRESET_CATEGORIES.includes(value) && value !== '');

    const commit = (v: string) => {
        onChange(v);
        if (v) setEditing(false);
    };

    const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value;
        if (v === '__custom__') { setIsCustom(true); onChange(''); }
        else commit(v);
    };

    // 뱃지 표시 모드
    if (!editing && value) {
        const color = CATEGORY_COLOR[value] ?? CATEGORY_COLOR_DEFAULT;
        return (
            <button
                type="button"
                onClick={() => setEditing(true)}
                className="w-full px-2 py-1.5 text-left"
                title="클릭하여 변경"
            >
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-bold ${color}`}>
                    {value}
                </span>
            </button>
        );
    }

    // 편집 모드 — 직접입력
    if (isCustom) {
        return (
            <div className="flex items-center gap-0.5 px-1">
                <input
                    autoFocus
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={() => { if (value) setEditing(false); }}
                    placeholder="직접 입력"
                    className="flex-1 min-w-0 bg-transparent py-1.5 text-sm outline-none focus:bg-emerald-50/50 rounded"
                />
                <button type="button" title="목록으로" onClick={() => { setIsCustom(false); onChange(''); }}
                    className="shrink-0 p-1 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                    <RotateCcw size={11} />
                </button>
            </div>
        );
    }

    // 편집 모드 — 셀렉트
    return (
        <div className="flex items-center gap-0.5 px-1">
            <select
                autoFocus
                value={PRESET_CATEGORIES.includes(value) ? value : ''}
                onChange={handleSelect}
                onBlur={() => { if (value) setEditing(false); }}
                className="flex-1 min-w-0 bg-transparent py-1.5 text-sm outline-none focus:bg-emerald-50/50 rounded cursor-pointer"
            >
                <option value="" disabled>선택...</option>
                {PRESET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__custom__">✏️ 직접입력</option>
            </select>
        </div>
    );
};

/**
 * 담당자 일괄 적용 입력 — 멤버 선택 버튼 + 직접입력 토글
 */
const BulkAssigneeInput: React.FC<{
    value: string;
    onChange: (patch: { assignee: string; assigneeUserId?: string }) => void;
    onApply: () => void;
    members: { id: string; name: string; colorIdx: number }[];
}> = ({ value, onChange, onApply, members }) => {
    const [isCustom, setIsCustom] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isCustom) inputRef.current?.focus();
    }, [isCustom]);

    return (
        <div className="mt-2 flex flex-col gap-1.5">
            {/* 멤버 버튼 목록 */}
            <div className="flex flex-wrap gap-1">
                {members.map((m, i) => {
                    const pal = ASSIGNEE_PALETTE[i % ASSIGNEE_PALETTE.length];
                    return (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => { onChange({ assignee: m.name, assigneeUserId: m.id }); setIsCustom(false); }}
                            className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors hover:opacity-80 ${pal.badge} ${value === m.name ? 'ring-2 ring-offset-1 ring-current' : ''}`}
                        >
                            {m.name}
                        </button>
                    );
                })}
                {/* 직접입력 토글 버튼 */}
                <button
                    type="button"
                    onClick={() => { setIsCustom((v) => !v); if (!isCustom) onChange({ assignee: '', assigneeUserId: undefined }); }}
                    className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${isCustom ? 'bg-emerald-50 text-emerald-600 border-emerald-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                >
                    <span className="flex items-center gap-1"><PenLine size={10} /> 직접입력</span>
                </button>
            </div>
            {/* 직접입력 input */}
            {isCustom && (
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => onChange({ assignee: e.target.value, assigneeUserId: undefined })}
                    placeholder="담당자명 입력"
                    className="w-full px-2 py-1.5 text-sm border border-emerald-300 rounded-lg outline-none focus:border-emerald-400"
                    onKeyDown={(e) => { if (e.key === 'Enter') onApply(); if (e.key === 'Escape') { setIsCustom(false); onChange({ assignee: '', assigneeUserId: undefined }); } }}
                />
            )}
        </div>
    );
};

/**
 * 담당자 셀 — StatusCell과 동일한 절대 위치 드롭다운 패턴
 */
export const AssigneeCell: React.FC<{
    value: string;
    assigneeUserId?: string;
    onChange: (patch: { assignee: string; assigneeUserId?: string }) => void;
    members: { id: string; name: string; colorIdx: number }[];
    inputClass: string;
}> = ({ value, assigneeUserId, onChange, members }) => {
    const [open, setOpen] = useState(false);
    const [isCustom, setIsCustom] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const colorIdx = members.findIndex((m) => (assigneeUserId && m.id === assigneeUserId) || m.name === value);
    const palette = ASSIGNEE_PALETTE[(colorIdx >= 0 ? colorIdx : 0) % ASSIGNEE_PALETTE.length];

    // 외부 클릭 시 닫기
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
                setIsCustom(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // 직접입력 모드 전환 시 input 포커스
    useEffect(() => {
        if (isCustom) inputRef.current?.focus();
    }, [isCustom]);

    const select = (name: string, userId?: string) => {
        onChange({ assignee: name, assigneeUserId: userId });
        setOpen(false);
        setIsCustom(false);
    };

    return (
        <div ref={ref} className="relative px-1.5 py-1">
            {/* 뱃지 / 빈 상태 버튼 */}
            <button
                type="button"
                onClick={() => { setOpen((v) => !v); setIsCustom(false); }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-bold transition-all hover:opacity-80 ${
                    value ? palette.badge : 'bg-gray-50 text-gray-400 border-gray-200 border-dashed'
                }`}
            >
                {value || '담당자'}
            </button>

            {/* 드롭다운 패널 */}
            {open && (
                <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-100 rounded-xl shadow-lg p-1.5 flex flex-col gap-2 min-w-[130px]">
                    {/* 멤버 목록 */}
                    {members.map((m, i) => {
                        const pal = ASSIGNEE_PALETTE[i % ASSIGNEE_PALETTE.length];
                        return (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => select(m.name, m.id)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors hover:opacity-80 ${pal.badge} ${(assigneeUserId ? m.id === assigneeUserId : m.name === value) ? 'ring-1 ring-offset-1 ring-current' : ''}`}
                            >
                                {m.name}
                            </button>
                        );
                    })}

                    {/* 직접입력 */}
                    {!isCustom ? (
                        <>
                            <button
                                type="button"
                                onClick={() => setIsCustom(true)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold text-gray-500 border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
                            >
                                <PenLine size={11} /> 직접입력
                            </button>
                            <button
                                type="button"
                                onClick={() => select('', undefined)}
                                disabled={!value}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold text-gray-500 border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-gray-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <RotateCcw size={11} /> 초기화
                            </button>
                        </>
                    ) : (
                        <div className="flex items-center gap-1 px-1.5 pt-1 border-t border-gray-100">
                            <input
                                ref={inputRef}
                                value={value}
                                onChange={(e) => onChange({ assignee: e.target.value, assigneeUserId: undefined })}
                                onKeyDown={(e) => { if (e.key === 'Enter' && value) { setOpen(false); setIsCustom(false); } if (e.key === 'Escape') { setIsCustom(false); } }}
                                placeholder="이름 입력"
                                className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-300 focus:border-emerald-300"
                            />
                            <button type="button" title="목록으로" onClick={() => { setIsCustom(false); onChange({ assignee: '', assigneeUserId: undefined }); }}
                                className="shrink-0 p-1 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                                <RotateCcw size={11} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

type BulkField = 'assignee' | 'startDate' | 'endDate' | 'status' | 'progress';

const BULK_ACTIONS: { field: BulkField; label: string; icon: React.ReactNode }[] = [
    { field: 'assignee',  label: '담당자 일괄', icon: <User size={13} /> },
    { field: 'startDate', label: '시작일 일괄', icon: <CalendarDays size={13} /> },
    { field: 'endDate',   label: '종료일 일괄', icon: <CalendarCheck size={13} /> },
    { field: 'status',    label: '상태 일괄',   icon: <Activity size={13} /> },
    { field: 'progress',  label: '진행률 일괄', icon: <Percent size={13} /> },
];

const WbsDevDetail: React.FC<{
    menuSearch?: string;
    onMenuSearchChange?: (value: string) => void;
    activeAssignees?: Set<string>;
    onToggleAssignee?: (name: string) => void;
    onClearAssignees?: () => void;
}> = ({
    menuSearch: menuSearchProp,
    onMenuSearchChange,
    activeAssignees: activeAssigneesProp,
    onToggleAssignee: onToggleAssigneeProp,
    onClearAssignees: onClearAssigneesProp,
}) => {
    const menus     = useWbsStore((s) => s.menus);
    const rows      = useWbsStore((s) => s.rows);
    const addRow    = useWbsStore((s) => s.addRow);
    const addRows   = useWbsStore((s) => s.addRows);
    const updateRow = useWbsStore((s) => s.updateRow);
    const deleteRow = useWbsStore((s) => s.deleteRow);

    // 수정중 인디케이터
    const editingMap   = useWbsEditingStore((s) => s.editing);
    const emitFocus    = useSyncStore((s) => s.emitWbsFieldFocus);
    const emitBlur     = useSyncStore((s) => s.emitWbsFieldBlur);
    const currentUserId = useAuthStore((s) => s.user?.id);

    // 프로젝트 참여자 목록
    const currentProjectId = useProjectStore((s) => s.currentProjectId);
    const projects = useProjectStore((s) => s.projects);
    const projectMembers = useMemo(() => {
        const project = projects.find((p) => p.id === currentProjectId);
        return (project?.members ?? []).map((m, i) => ({ id: m.id, name: m.name, colorIdx: i }));
    }, [projects, currentProjectId]);

    const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
    useEffect(() => {
        if (!selectedMenuId && menus.length > 0) setSelectedMenuId(menus[0].id);
        if (selectedMenuId && !menus.some((m) => m.id === selectedMenuId)) {
            setSelectedMenuId(menus[0]?.id ?? null);
        }
    }, [menus, selectedMenuId]);

    const selectedMenu = menus.find((m) => m.id === selectedMenuId) || null;
    // Debugging 행은 항상 맨 아래
    const menuRows = rows
        .filter((r) => r.menuId === selectedMenuId)
        .sort((a, b) => (a.isDebugging ? 1 : 0) - (b.isDebugging ? 1 : 0));

    /** 일괄 적용 대상 — Debugging 행 제외 */
    const bulkTargetRows = useMemo(
        () => menuRows.filter((r) => !r.isDebugging),
        [menuRows],
    );

    // ── 담당자 필터 ──
    /** 전체 고유 담당자 (등장 순) */
    const allAssignees = useMemo(() => getAllAssignees(rows), [rows]);

    /** 담당자 → 팔레트 인덱스 */
    const assigneeColorIdx = useMemo(() => {
        const map = new Map<string, number>();
        allAssignees.forEach((a, i) => map.set(a, i));
        return map;
    }, [allAssignees]);

    const [activeAssigneesLocal, setActiveAssigneesLocal] = useState<Set<string>>(new Set());
    const activeAssignees = activeAssigneesProp ?? activeAssigneesLocal;
    useEffect(() => {
        if (activeAssigneesProp) return;
        const validAssignees = new Set(allAssignees);
        setActiveAssigneesLocal((prev) => {
            if (prev.size === 0) return prev;
            const next = new Set(Array.from(prev).filter((name) => validAssignees.has(name)));
            return next.size === prev.size ? prev : next;
        });
    }, [allAssignees, activeAssigneesProp]);

    const toggleAssignee = onToggleAssigneeProp ?? ((name: string) => {
        setActiveAssigneesLocal((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    });

    const clearAssignees = onClearAssigneesProp ?? (() => setActiveAssigneesLocal(new Set()));

    const [menuSearchLocal, setMenuSearchLocal] = useState('');
    const menuSearch = menuSearchProp ?? menuSearchLocal;
    const setMenuSearch = onMenuSearchChange ?? setMenuSearchLocal;

    // ── 좌/우 분할 리사이저 ──
    const [leftWidth, setLeftWidth]   = useState(300);
    const draggingRef                  = useRef(false);
    const containerRef                 = useRef<HTMLDivElement>(null);
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

    // ── 지니 패널 ──
    const [showBulk, setShowBulk]             = useState(false);
    const [bulkPos, setBulkPos]               = useState({ top: 0, right: 0 });
    const [bulkField, setBulkField]           = useState<BulkField | null>(null);
    const [bulkValue, setBulkValue]           = useState('');
    const [bulkAssigneeUserId, setBulkAssigneeUserId] = useState<string | undefined>(undefined);
    const bulkTriggerRef                       = useRef<HTMLButtonElement>(null);
    const bulkPanelRef                         = useRef<HTMLDivElement>(null);

    const openBulkPanel = () => {
        if (bulkTriggerRef.current) {
            const rect = bulkTriggerRef.current.getBoundingClientRect();
            setBulkPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        }
        setBulkField(null);
        setBulkValue('');
        setBulkAssigneeUserId(undefined);
        setShowBulk((v) => !v);
    };

    useEffect(() => {
        if (!showBulk) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (bulkPanelRef.current?.contains(t)) return;
            if (bulkTriggerRef.current?.contains(t)) return;
            // Wheel pickers render in a portal — clicks there must not close the bulk panel
            if ((t as Element).closest?.(
                '[data-wheel-date-picker-popup], [data-wheel-time-picker-popup], [data-wheel-color-picker-popup], [data-wheel-progress-picker-popup]'
            )) return;
            setShowBulk(false);
            setBulkField(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showBulk]);

    // 일괄 적용
    const applyBulk = () => {
        if (!selectedMenuId || bulkField === null || bulkTargetRows.length === 0) return;
        bulkTargetRows.forEach((r) => {
            if (bulkField === 'progress') {
                updateRow(r.id, { progress: Math.min(100, Math.max(0, Number(bulkValue) || 0)) });
            } else if (bulkField === 'status') {
                const status = bulkValue as typeof r.status;
                updateRow(r.id, status === 'DONE' ? { status, progress: 100 } : { status });
            } else if (bulkField === 'assignee') {
                updateRow(r.id, { assignee: bulkValue, assigneeUserId: bulkAssigneeUserId });
            } else {
                updateRow(r.id, { [bulkField]: bulkValue } as Parameters<typeof updateRow>[1]);
            }
        });
        setShowBulk(false);
        setBulkField(null);
        setBulkValue('');
        setBulkAssigneeUserId(undefined);
    };

    /** 담당자별 메뉴 일정 (달력 표시용) */
    const assigneeMenuRangesMap = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildAssigneeMenuDateRanges>>();
        for (const r of rows) {
            const name = r.assignee.trim();
            if (!name || map.has(name)) continue;
            map.set(name, buildAssigneeMenuDateRanges(name, menus, rows));
        }
        return map;
    }, [rows, menus]);

    const cellInput = 'w-full bg-transparent px-2 py-1.5 text-sm outline-none focus:bg-emerald-50/50 rounded';

    // Debugging 행의 상태/진행율 잠금 여부:
    // 일반 행(isDebugging 아닌) 모두 progress=100 && status=DONE 이면 해제
    const debugUnlocked = useMemo(() => {
        const normalRows = menuRows.filter((r) => !r.isDebugging);
        return normalRows.length > 0 && normalRows.every((r) => r.progress === 100 && r.status === 'DONE');
    }, [menuRows]);

    // 일괄 입력 컴포넌트
    const renderBulkInput = () => {
        if (bulkField === 'status') {
            return (
                <select
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    className="w-full mt-2 px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-400"
                    autoFocus
                >
                    <option value="">선택하세요</option>
                    {WBS_STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>{WBS_STATUS_LABEL[s]}</option>
                    ))}
                </select>
            );
        }
        if (bulkField === 'startDate' || bulkField === 'endDate') {
            return (
                <WheelDatePicker
                    value={bulkValue}
                    onChange={setBulkValue}
                    className="w-full mt-2"
                    placeholder="날짜 선택"
                />
            );
        }
        if (bulkField === 'progress') {
            return (
                <WheelProgressPicker
                    value={Math.min(100, Math.max(0, Number(bulkValue) || 0))}
                    onChange={(v) => setBulkValue(String(v))}
                    className="w-full mt-2"
                    accentColor="#10b981"
                />
            );
        }
        // assignee — 멤버 선택 + 직접입력
        return (
            <BulkAssigneeInput
                value={bulkValue}
                onChange={(patch) => {
                    setBulkValue(patch.assignee);
                    setBulkAssigneeUserId(patch.assigneeUserId);
                }}
                onApply={applyBulk}
                members={projectMembers}
            />
        );
    };

    return (
        <div ref={containerRef} className="flex h-full min-h-0">
            {/* 좌: 메뉴 트리 + 담당자 필터 */}
            <div className="shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden" style={{ width: leftWidth + 100 }}>
                <WbsDevDetailFilterBar
                    allAssignees={allAssignees}
                    assigneeColorIdx={assigneeColorIdx}
                    activeAssignees={activeAssignees}
                    onToggleAssignee={toggleAssignee}
                    onClearAssignees={clearAssignees}
                    menuSearch={menuSearch}
                    onMenuSearchChange={setMenuSearch}
                />
                <div className="flex-1 min-h-0 p-3 pt-0 overflow-hidden">
                    <WbsMenuTree
                        selectedId={selectedMenuId}
                        onSelect={setSelectedMenuId}
                        editable={false}
                        showProgress
                        showAssignee
                        showCollapseButtons
                        showSearch={false}
                        menuSearch={menuSearch}
                        onMenuSearchChange={setMenuSearch}
                        activeAssignees={activeAssignees}
                        assigneeColorIdx={assigneeColorIdx}
                    />
                </div>
            </div>

            {/* 리사이저 */}
            <div onMouseDown={onResizeDown} className="w-1.5 shrink-0 cursor-col-resize bg-gray-100 hover:bg-emerald-300 transition-colors" title="너비 조절" />

            {/* 우: 개발 상세 그리드 */}
            <div className="flex-1 min-w-0 flex flex-col bg-gray-50">
                {!selectedMenu ? (
                    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                        좌측에서 메뉴를 선택하세요. (메뉴는 '메뉴 구조도' 탭에서 추가)
                    </div>
                ) : (
                    <>
                        {/* 헤더 */}
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-white">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{selectedMenu.menuCode}</span>
                                    {selectedMenu.programId && (
                                        <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded" title="프로그램 ID">
                                            PID: {selectedMenu.programId}
                                        </span>
                                    )}
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
                                    onClick={() => {
                                        if (window.confirm(`${ALL_ARTIFACT_CATEGORIES.join(', ')} 행을 추가하시겠습니까?`))
                                            addRows(selectedMenu.id, ALL_ARTIFACT_CATEGORIES);
                                    }}
                                    title={`산출물 행 일괄 추가: ${ALL_ARTIFACT_CATEGORIES.join(', ')}`}
                                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50 transition-colors"
                                >
                                    <Plus size={15} /> ALL
                                </button>

                                {/* 지니 램프 트리거 */}
                                <style>{`
                                    @keyframes genieItem {
                                        0%   { opacity:0; transform:translateY(10px) scaleX(0.4) scaleY(0.6); filter:blur(3px); }
                                        60%  { opacity:1; transform:translateY(-3px) scaleX(1.04) scaleY(1.04); filter:blur(0); }
                                        100% { opacity:1; transform:translateY(0) scaleX(1) scaleY(1); filter:blur(0); }
                                    }
                                    @keyframes genieTriggerOpen {
                                        0%   { transform:scale(1) rotate(0deg); }
                                        40%  { transform:scale(0.85) rotate(-15deg); }
                                        100% { transform:scale(1) rotate(0deg); }
                                    }
                                    .genie-item { animation:genieItem 0.38s cubic-bezier(0.34,1.56,0.64,1) both; }
                                    .genie-trigger-anim { animation:genieTriggerOpen 0.35s ease both; }
                                `}</style>
                                <button
                                    ref={bulkTriggerRef}
                                    key={showBulk ? 'open' : 'closed'}
                                    type="button"
                                    onClick={openBulkPanel}
                                    className={`genie-trigger-anim flex items-center justify-center w-9 h-9 rounded-xl transition-colors shadow-sm ${
                                        showBulk
                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                            : 'bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100'
                                    }`}
                                    title="일괄 입력"
                                >
                                    <Layers size={16} />
                                </button>
                            </div>
                        </div>

                        {/* 테이블 */}
                        <div className="flex-1 overflow-auto">
                            <table className="w-full border-collapse text-sm">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-gray-100 text-gray-600 text-[11px] font-black uppercase tracking-wider">
                                        <th className="text-left px-2 py-2 w-40 border-b border-gray-200">구분(산출물)</th>
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
                                                아직 입력된 산출물이 없습니다. '행 추가'로 시작하세요.
                                            </td>
                                        </tr>
                                    ) : (
                                        menuRows.map((r) => {
                                            const isDbg = !!r.isDebugging;
                                            const dbgLocked = isDbg && !debugUnlocked;
                                            const rowEditEntry = editingMap.get(`row_${r.id}`);
                                            const isRowBeingEdited = !!rowEditEntry && rowEditEntry.userId !== currentUserId;
                                            return (
                                            <tr
                                                key={r.id}
                                                className={`border-b border-gray-100 ${
                                                    isDbg
                                                        ? 'bg-amber-50/60 hover:bg-amber-50'
                                                        : 'bg-white hover:bg-gray-50'
                                                } ${isRowBeingEdited ? 'pointer-events-none select-none' : ''}`}
                                                style={isRowBeingEdited ? { boxShadow: `inset 3px 0 0 ${rowEditEntry!.color}` } : undefined}
                                                onFocus={() => { if (!isRowBeingEdited) emitFocus(`row_${r.id}`); }}
                                                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) emitBlur(`row_${r.id}`); }}
                                            >
                                                <td className="align-middle">
                                                    {isDbg ? (
                                                        <span className="flex items-center gap-1.5 px-2 py-1.5">
                                                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold">Debuging</span>
                                                        </span>
                                                    ) : (
                                                        <CategoryCell value={r.category} onChange={(v) => updateRow(r.id, { category: v })} inputClass={cellInput} />
                                                    )}
                                                </td>
                                                <td className="align-middle">
                                                    <input value={r.featureName} onChange={(e) => updateRow(r.id, { featureName: e.target.value })} placeholder="기능명" className={cellInput} />
                                                </td>
                                                <td className="align-middle">
                                                    <AssigneeCell
                                                        value={r.assignee}
                                                        assigneeUserId={r.assigneeUserId}
                                                        onChange={(patch) => updateRow(r.id, patch)}
                                                        members={projectMembers}
                                                        inputClass={cellInput}
                                                    />
                                                </td>
                                                <td className="align-middle">
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
                                                <td className="align-middle">
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
                                                <td className="align-middle">
                                                    {dbgLocked ? (
                                                        <span className="flex items-center gap-1.5 px-2 py-1.5">
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
                                                <td className="align-middle">
                                                    {dbgLocked ? (
                                                        <div className="flex items-center gap-1 px-2 py-1.5 text-gray-400">
                                                            <span className="w-12 text-right text-sm tabular-nums">{r.progress}</span>
                                                            <span className="text-xs">%</span>
                                                            <LockTooltip />
                                                        </div>
                                                    ) : (
                                                        <div className="px-2">
                                                            <WheelProgressPicker
                                                                value={r.progress}
                                                                onChange={(v) => updateRow(r.id, { progress: v })}
                                                                variant="ghost"
                                                                accentColor="#10b981"
                                                            />
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="align-middle">
                                                    <input value={r.note ?? ''} onChange={(e) => updateRow(r.id, { note: e.target.value })} placeholder="비고" className={cellInput} />
                                                </td>
                                                <td className="align-middle text-center">
                                                    {isRowBeingEdited ? (
                                                        <span
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white whitespace-nowrap"
                                                            style={{ backgroundColor: rowEditEntry!.color }}
                                                        >
                                                            {rowEditEntry!.userName} <span className="opacity-80">수정중</span>
                                                        </span>
                                                    ) : (
                                                        (!isDbg || menuRows.filter((row) => !row.isDebugging).length === 0) && (
                                                            <button type="button" onClick={() => deleteRow(r.id)} className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded" title="행 삭제">
                                                                <Trash2 size={14} />
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
                    </>
                )}
            </div>

            {/* 지니 패널 — Portal로 body에 마운트 */}
            {showBulk && createPortal(
                <div
                    ref={bulkPanelRef}
                    style={{ position: 'fixed', top: bulkPos.top, right: bulkPos.right, zIndex: 9999, minWidth: 200 }}
                >
                    <div className="bg-white/95 backdrop-blur-md border border-gray-100 rounded-2xl shadow-2xl p-2 flex flex-col gap-1">
                        {bulkField === null ? (
                            /* 필드 선택 목록 */
                            BULK_ACTIONS.map((action, i) => (
                                <button
                                    key={action.field}
                                    type="button"
                                    onClick={() => { setBulkField(action.field); setBulkValue(action.field === 'progress' ? '0' : ''); }}
                                    style={{ animationDelay: `${i * 55}ms` }}
                                    className="genie-item flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap text-left
                                        bg-white text-indigo-700 border border-indigo-100 hover:bg-indigo-50 transition-colors"
                                >
                                    {action.icon}
                                    + {action.label}
                                </button>
                            ))
                        ) : (
                            /* 값 입력 폼 */
                            <div className="genie-item px-1 flex flex-col gap-2" style={{ minWidth: 220 }}>
                                {/* 상단: 뒤로 + 레이블 */}
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => { setBulkField(null); setBulkValue(''); }}
                                        className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <span className="text-xs font-bold text-gray-600">
                                        {BULK_ACTIONS.find((a) => a.field === bulkField)?.label} 적용
                                    </span>
                                </div>

                                {renderBulkInput()}

                                <button
                                    type="button"
                                    onClick={applyBulk}
                                    disabled={bulkValue === '' || bulkTargetRows.length === 0}
                                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    전체 {bulkTargetRows.length}행 적용
                                </button>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default WbsDevDetail;
