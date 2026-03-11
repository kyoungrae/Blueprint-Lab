import React, { memo, useContext } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ExportModeContext } from '../contexts/ExportModeContext';
import type { Screen, ScreenSpecItem } from '../types/screenDesign';
import { SCREEN_FIELD_TYPES, SCREEN_TYPES, PAGE_SIZE_PRESETS, PAGE_SIZE_OPTIONS, PAGE_SIZE_DIMENSIONS_MM } from '../types/screenDesign';
import { Plus, Trash2, Lock, Unlock, X, ChevronDown, GripVertical, FileText, SlidersHorizontal, RectangleVertical, RectangleHorizontal } from 'lucide-react';
import { useScreenNodeStore } from '../contexts/ScreenCanvasStoreContext';
import { useProjectStore } from '../store/projectStore';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';
import { EntityLockBadge, useEntityLock } from './collaboration';
import { useScreenDesignUndoRedo } from '../contexts/ScreenDesignUndoRedoContext';

// 명세 그리드 기본 컬럼 너비(px): [테이블명(한글), 테이블명(영어), 항목명(한글), 필드명(영문), 항목타입, Format, 자릿수, 초기값, Validation, 비고]
const DEFAULT_SPEC_COLUMN_WIDTHS = [110, 110, 128, 128, 96, 80, 64, 64, 80, 96];
const MIN_COL_WIDTH = 48;
const MAX_COL_WIDTH = 400;

// ── Resize Handle ─────────────────────────────────────────
const ColResizeHandle: React.FC<{
    onResizeStart: (colIdx: number, clientX: number) => void;
    colIdx: number;
    disabled?: boolean;
}> = memo(({ onResizeStart, colIdx, disabled }) => (
    <div
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) onResizeStart(colIdx, e.clientX); }}
        className={`nodrag absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-20 flex items-center justify-center group/resize ${disabled ? 'pointer-events-none' : 'hover:bg-blue-400/60'}`}
        title="드래그하여 너비 조절"
    >
        <div className="w-0.5 h-4 bg-gray-300 group-hover/resize:bg-blue-500 rounded-full opacity-0 group-hover/resize:opacity-100 transition-opacity" />
    </div>
));

// DB Types Map
const DB_TYPES: Record<string, string[]> = {
    'MySQL': ['INT', 'VARCHAR', 'TEXT', 'DATETIME', 'BOOLEAN', 'FLOAT', 'DOUBLE', 'JSON'],
    'Oracle': ['NUMBER', 'VARCHAR2', 'CLOB', 'DATE', 'CHAR', 'BLOB', 'TIMESTAMP'],
    'PostgreSQL': ['INTEGER', 'VARCHAR', 'TEXT', 'TIMESTAMP', 'BOOLEAN', 'JSONB', 'NUMERIC'],
    'MariaDB': ['INT', 'VARCHAR', 'TEXT', 'DATETIME', 'BOOLEAN', 'FLOAT', 'DOUBLE', 'JSON'],
    'SQLite': ['INTEGER', 'TEXT', 'REAL', 'BLOB'],
    'MSSQL': ['INT', 'VARCHAR', 'TEXT', 'DATETIME', 'BIT', 'FLOAT'],
};

// ── Spec Row (명세 항목 행) ────────────────────────────────────
interface SpecRowProps {
    item: ScreenSpecItem;
    isLocked: boolean;
    htmlTypes: readonly string[];
    dbTypes: string[];
    onUpdate: (updates: Partial<ScreenSpecItem>) => void;
    onBlur?: (updates: Partial<ScreenSpecItem>) => void;
    onDelete: () => void;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    isDragging: boolean;
}

const SpecRow: React.FC<SpecRowProps> = memo(({
    item, isLocked, htmlTypes, dbTypes, onUpdate, onBlur, onDelete,
    onDragStart, onDragEnter, onDragEnd, isDragging
}) => {
    // IME 조합 중(한글 등) 자음/모음 분리 방지
    const [composing, setComposing] = React.useState<{ field: string; value: string } | null>(null);
    const displayValue = (field: string, propValue: string) =>
        composing?.field === field ? composing.value : propValue;
    const handleChange = (field: string, value: string, e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
            setComposing({ field, value });
            return;
        }
        setComposing(null);
        onUpdate({ [field]: value } as Partial<ScreenSpecItem>);
    };
    const handleCompositionEnd = (field: string, value: string) => {
        setComposing(null);
        onUpdate({ [field]: value } as Partial<ScreenSpecItem>);
        onBlur?.({ [field]: value } as Partial<ScreenSpecItem>);
    };

    // 공통 셀 스타일
    const cellClass = `px-2 py-1.5 border-r border-gray-200 align-middle bg-white relative`;
    const inputClass = `w-full bg-transparent border-none outline-none text-xs p-1 ${isLocked ? 'text-gray-800' : 'nodrag text-gray-900 hover:bg-blue-50 focus:bg-blue-50 rounded transition-colors'}`;

    return (
        <tr
            draggable={!isLocked}
            onDragStart={onDragStart}
            onDragEnter={onDragEnter}
            onDragEnd={onDragEnd}
            onDragOver={(e) => e.preventDefault()}
            className={`nodrag group/row border-b border-gray-200 last:border-b-0 transition-colors
                ${isDragging ? 'opacity-40 bg-blue-100 scale-[0.99] border-2 border-blue-400' : 'hover:bg-blue-50/30'}`}
        >
            {/* 드래그 핸들 (좌측 고정) */}
            {!isLocked && (
                <td className="w-8 bg-gray-50/50 border-r border-gray-200 align-middle">
                    <div className="flex items-center justify-center">
                        <div
                            className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-blue-500 rounded transition-colors"
                            title="드래그하여 순서 변경"
                        >
                            <GripVertical size={14} />
                        </div>
                    </div>
                </td>
            )}

            {/* 테이블명(한글) */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={displayValue('tableNameKr', item.tableNameKr || '')}
                    onChange={(e) => handleChange('tableNameKr', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('tableNameKr', (e.target as HTMLInputElement).value)}
                    onBlur={(e) => { if (!composing?.field) onBlur?.({ tableNameKr: e.target.value }); }}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass}`}
                    placeholder="테이블명(한글)"
                />
            </td>
            {/* 테이블명(영문) */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={displayValue('tableNameEn', item.tableNameEn || '')}
                    onChange={(e) => handleChange('tableNameEn', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('tableNameEn', (e.target as HTMLInputElement).value)}
                    onBlur={(e) => { if (!composing?.field) onBlur?.({ tableNameEn: e.target.value }); }}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass} font-mono`}
                    placeholder="TABLE_NAME"
                />
            </td>

            {/* 항목명(한글) */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={displayValue('fieldName', item.fieldName)}
                    onChange={(e) => handleChange('fieldName', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('fieldName', (e.target as HTMLInputElement).value)}
                    onBlur={(e) => { if (!composing?.field) onBlur?.({ fieldName: e.target.value }); }}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass} font-bold`}
                    placeholder="항목명"
                />
            </td>
            {/* 필드명(영문) */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={displayValue('controlName', item.controlName)}
                    onChange={(e) => handleChange('controlName', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('controlName', (e.target as HTMLInputElement).value)}
                    onBlur={(e) => { if (!composing?.field) onBlur?.({ controlName: e.target.value }); }}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass} font-mono text-blue-800`}
                    placeholder="CONTROL_ID"
                />
            </td>
            {/* 항목타입 (HTML 속성) */}
            <td className={cellClass}>
                <div className="relative w-full">
                    <select
                        value={item.dataType}
                        onChange={(e) => onUpdate({ dataType: e.target.value })}
                        onBlur={(e) => onBlur?.({ dataType: e.target.value })}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`w-full bg-transparent border-none outline-none text-[11px] p-1 appearance-none ${isLocked ? 'text-gray-600' : 'nodrag text-gray-900 cursor-pointer hover:bg-blue-50 rounded'}`}
                    >
                        {htmlTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {!isLocked && <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />}
                </div>
            </td>

            {/* ── 항목정의 4개 컬럼 ── */}
            {/* Format (DB 타입) */}
            <td className={cellClass}>
                <div className="relative w-full">
                    <select
                        value={item.format}
                        onChange={(e) => onUpdate({ format: e.target.value })}
                        onBlur={(e) => onBlur?.({ format: e.target.value })}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`w-full bg-transparent border-none outline-none text-[11px] p-1 appearance-none text-center ${isLocked ? 'text-gray-600' : 'nodrag text-gray-900 cursor-pointer hover:bg-blue-50 rounded'}`}
                    >
                        {dbTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {!isLocked && <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />}
                </div>
            </td>
            {/* 자릿수 */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={displayValue('length', item.length)}
                    onChange={(e) => handleChange('length', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('length', (e.target as HTMLInputElement).value)}
                    onBlur={(e) => { if (!composing?.field) onBlur?.({ length: e.target.value }); }}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass} text-center`}
                    placeholder="100"
                />
            </td>
            {/* 초기값 */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={displayValue('defaultValue', item.defaultValue)}
                    onChange={(e) => handleChange('defaultValue', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('defaultValue', (e.target as HTMLInputElement).value)}
                    onBlur={(e) => { if (!composing?.field) onBlur?.({ defaultValue: e.target.value }); }}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass} text-center`}
                    placeholder="-"
                />
            </td>
            {/* Validation */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={displayValue('validation', item.validation)}
                    onChange={(e) => handleChange('validation', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('validation', (e.target as HTMLInputElement).value)}
                    onBlur={(e) => { if (!composing?.field) onBlur?.({ validation: e.target.value }); }}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass}`}
                    placeholder=""
                />
            </td>

            {/* 비고 */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={displayValue('memo', item.memo)}
                    onChange={(e) => handleChange('memo', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('memo', (e.target as HTMLInputElement).value)}
                    onBlur={(e) => { if (!composing?.field) onBlur?.({ memo: e.target.value }); }}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass}`}
                    placeholder=""
                />
            </td>

            {/* 삭제 버튼 (우측 고정) */}
            {!isLocked && (
                <td className="w-10 text-center align-middle bg-white border-l border-gray-200">
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all active:scale-90"
                        title="삭제"
                    >
                        <Trash2 size={14} />
                    </button>
                </td>
            )}
        </tr>
    );
});

// ── Editable Cell ────────────────────────
interface EditableCellProps {
    value: string;
    onChange: (val: string) => void;
    onBlur?: (val: string) => void;
    isLocked: boolean;
    placeholder?: string;
    className?: string;
    isSelect?: boolean;
    options?: readonly string[];
    mono?: boolean;
}

const EditableCell: React.FC<EditableCellProps> = memo(({ value, onChange, onBlur, isLocked, placeholder, className = '', isSelect, options, mono }) => {
    // IME 조합 중(한글 등) 자음/모음 분리 방지
    const [composing, setComposing] = React.useState<string | null>(null);
    const displayValue = composing !== null ? composing : value;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
            setComposing(v);
            return;
        }
        setComposing(null);
        onChange(v);
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
        const v = (e.target as HTMLInputElement).value;
        setComposing(null);
        onChange(v);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setComposing(null);
        onChange(v);
        onBlur?.(v);
    };

    if (isSelect && options) {
        return (
            <div className="relative w-full h-full flex items-center">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={(e) => onBlur?.(e.target.value)}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`w-full h-full bg-transparent border-none outline-none text-xs p-1 appearance-none ${isLocked ? 'text-gray-700' : 'nodrag text-gray-900 cursor-pointer hover:bg-blue-50 transition-colors'} ${className}`}
                >
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {!isLocked && <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />}
            </div>
        );
    }
    return (
        <input
            type="text"
            value={displayValue}
            onChange={handleChange}
            onCompositionEnd={handleCompositionEnd}
            onBlur={handleBlur}
            onMouseDown={(e) => !isLocked && e.stopPropagation()}
            disabled={isLocked}
            className={`w-full bg-transparent border-none outline-none text-xs p-1 ${isLocked ? 'text-gray-700' : 'nodrag text-gray-900 hover:bg-blue-50 focus:bg-blue-50 rounded transition-colors'} ${mono ? 'font-mono' : ''} ${className}`}
            placeholder={placeholder}
            spellCheck={false}
        />
    );
});

// ── Screen Node Handles ──────────────────────────────────────
const ScreenHandles = memo(() => (
    <>
        <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ top: -8 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ bottom: -8 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ left: -8 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ right: -8 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
    </>
));

// ── Spec Node ─────────────────────────────────────────────
interface SpecNodeData {
    screen: Screen;
}

type SpecHistorySnapshot = Pick<
    Screen,
    | 'name'
    | 'systemName'
    | 'author'
    | 'createdDate'
    | 'screenId'
    | 'screenType'
    | 'page'
    | 'screenDescription'
    | 'pageSize'
    | 'pageOrientation'
    | 'specs'
    | 'specColumnWidths'
    | 'specMetaColumnWidths'
>;

const cloneSpecs = (specs?: ScreenSpecItem[]) => (specs || []).map((s) => ({ ...s }));
const makeSpecSnapshot = (screen: Screen): SpecHistorySnapshot => ({
    name: screen.name,
    systemName: screen.systemName,
    author: screen.author,
    createdDate: screen.createdDate,
    screenId: screen.screenId,
    screenType: screen.screenType,
    page: screen.page,
    screenDescription: screen.screenDescription,
    pageSize: screen.pageSize,
    pageOrientation: screen.pageOrientation,
    specs: cloneSpecs(screen.specs),
    specColumnWidths: screen.specColumnWidths ? [...screen.specColumnWidths] : undefined,
    specMetaColumnWidths: screen.specMetaColumnWidths ? [...screen.specMetaColumnWidths] : undefined,
});

const SpecNode: React.FC<NodeProps<SpecNodeData>> = ({ data, selected }) => {
    const { screen } = data;
    const isExporting = useContext(ExportModeContext);
    const { updateScreen, deleteScreen, getScreenById } = useScreenNodeStore();
    const { sendOperation } = useSyncStore();
    const { user } = useAuthStore();
    const { isLockedByOther, lockedBy, requestLock, releaseLock } = useEntityLock(screen.id);
    const { setHandlers } = useScreenDesignUndoRedo();
    const isLocalLocked = screen.isLocked ?? true;
    const isLocked = isLocalLocked || isLockedByOther;
    const MAX_HISTORY = 50;
    const restoringRef = React.useRef(false);
    const [history, setHistory] = React.useState<{ past: SpecHistorySnapshot[]; future: SpecHistorySnapshot[] }>({
        past: [],
        future: [],
    });

    const syncUpdate = (updates: Partial<Screen>) => {
        sendOperation({
            type: 'SCREEN_UPDATE',
            targetId: screen.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: updates
        });
    };

    // Linked ERD Project Data (여러 개 연결 시 첫 번째 기준)
    const { projects, currentProjectId } = useProjectStore();
    const currentProject = projects.find(p => p.id === currentProjectId);
    const linkedErdProjects = React.useMemo(() => {
        if (!currentProject) return [];
        const ids = currentProject.linkedErdProjectIds?.length ? currentProject.linkedErdProjectIds : (currentProject.linkedErdProjectId ? [currentProject.linkedErdProjectId] : []);
        return projects.filter(p => ids.includes(p.id));
    }, [currentProject, projects]);
    const linkedErdProject = linkedErdProjects[0];

    // DB Types for Format column
    const dbFieldTypes = React.useMemo(() => {
        const dbType = linkedErdProject?.dbType || currentProject?.dbType;
        if (dbType && DB_TYPES[dbType]) {
            return DB_TYPES[dbType];
        }
        return DB_TYPES['MySQL']; // Default back to MySQL for DB types
    }, [linkedErdProject, currentProject]);

    // Default Specs if empty
    const specs = screen.specs || [];

    const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);
    const [showScreenOptionsPanel, setShowScreenOptionsPanel] = React.useState(false);
    const [specNameComposing, setSpecNameComposing] = React.useState<string | null>(null);
    const screenOptionsRef = React.useRef<HTMLDivElement>(null);

    // 명세 그리드 컬럼 너비
    const colWidths = React.useMemo(() => {
        const saved = screen.specColumnWidths;
        if (saved && saved.length === 10) return [...saved];
        return [...DEFAULT_SPEC_COLUMN_WIDTHS];
    }, [screen.specColumnWidths]);

    const handleSpecColResizeStart = React.useCallback((colIdx: number, clientX: number) => {
        const startWidth = colWidths[colIdx];
        const onMove = (e: MouseEvent) => {
            const dx = e.clientX - clientX;
            const nextWidth = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, startWidth + dx));
            const currentScreen = getScreenById(screen.id);
            const currentWidths = currentScreen?.specColumnWidths || colWidths;
            const next = [...currentWidths];
            next[colIdx] = nextWidth;
            updateScreen(screen.id, { specColumnWidths: next });
        };
        const onUp = () => {
            const currentScreen = getScreenById(screen.id);
            if (currentScreen?.specColumnWidths) {
                syncUpdate({ specColumnWidths: currentScreen.specColumnWidths });
            }
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [colWidths, screen.id, syncUpdate, getScreenById, updateScreen]);

    // 용지 옵션 패널 외부 클릭 시 닫기
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (screenOptionsRef.current && !screenOptionsRef.current.contains(target)) {
                setShowScreenOptionsPanel(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, []);

    const update = (updates: Partial<Screen>) => {
        if (isLocked) return;
        updateScreen(screen.id, updates);
    };

    const applySnapshot = React.useCallback((snapshot: SpecHistorySnapshot) => {
        restoringRef.current = true;
        updateScreen(screen.id, snapshot);
        syncUpdate(snapshot);
        requestAnimationFrame(() => {
            restoringRef.current = false;
        });
    }, [screen.id]);

    const undo = React.useCallback(() => {
        if (history.past.length <= 1) return;
        setHistory((prev) => {
            const newPast = [...prev.past];
            const current = newPast.pop();
            const previous = newPast[newPast.length - 1];
            if (!current || !previous) return prev;
            applySnapshot(previous);
            return {
                past: newPast,
                future: [current, ...prev.future].slice(0, MAX_HISTORY),
            };
        });
    }, [history.past.length, applySnapshot]);

    const redo = React.useCallback(() => {
        if (history.future.length === 0) return;
        setHistory((prev) => {
            const newFuture = [...prev.future];
            const next = newFuture.shift();
            if (!next) return prev;
            applySnapshot(next);
            return {
                past: [...prev.past, next].slice(-MAX_HISTORY),
                future: newFuture,
            };
        });
    }, [history.future.length, applySnapshot]);

    const snapshot = React.useMemo(() => makeSpecSnapshot(screen), [screen]);
    const snapshotKey = React.useMemo(() => JSON.stringify(snapshot), [snapshot]);

    // Initial history
    React.useEffect(() => {
        if (history.past.length === 0) {
            setHistory({ past: [snapshot], future: [] });
        }
    }, [history.past.length, snapshot]);

    // Track spec-level edits for undo/redo
    React.useEffect(() => {
        if (restoringRef.current) return;
        setHistory((prev) => {
            const last = prev.past[prev.past.length - 1];
            if (last && JSON.stringify(last) === snapshotKey) return prev;
            return {
                past: [...prev.past, snapshot].slice(-MAX_HISTORY),
                future: [],
            };
        });
    }, [snapshotKey, snapshot]);

    // 상단 툴바에 Undo/Redo 노출 (선택된 명세면 잠금 여부와 관계없이 항상 노출)
    React.useEffect(() => {
        if (selected) {
            setHandlers(screen.id, {
                undo,
                redo,
                canUndo: history.past.length > 1,
                canRedo: history.future.length > 0,
            });
        } else {
            setHandlers(screen.id, null);
        }
        return () => setHandlers(screen.id, null);
    }, [selected, history.past.length, history.future.length, setHandlers, screen.id, undo, redo]);

    const handleToggleLock = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isLockedByOther) {
            alert(`${lockedBy}님이 수정 중입니다.`);
            return;
        }
        const newLockedState = !isLocalLocked;
        updateScreen(screen.id, { isLocked: newLockedState });
        syncUpdate({ isLocked: newLockedState });
        if (!newLockedState) {
            requestLock();
        } else {
            releaseLock();
        }
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`기능명세서 "${screen.name}"을(를) 삭제하시겠습니까?`)) {
            sendOperation({
                type: 'SCREEN_DELETE',
                targetId: screen.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: {},
                previousState: screen as unknown as Record<string, unknown>,
            });
            deleteScreen(screen.id);
        }
    };

    const handleAddSpec = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isLocked) return;
        const newSpec: ScreenSpecItem = {
            id: `spec_${Date.now()}`,
            tableNameKr: '',
            tableNameEn: '',
            fieldName: '',
            controlName: '',
            dataType: 'INPUT',
            format: dbFieldTypes[0] || 'VARCHAR',
            length: '100',
            defaultValue: '',
            validation: '',
            memo: '',
        };
        const nextSpecs = [...specs, newSpec];
        updateScreen(screen.id, { specs: nextSpecs });
        syncUpdate({ specs: nextSpecs });
    };

    const handleUpdateSpec = (specId: string, updates: Partial<ScreenSpecItem>) => {
        if (isLocked) return;
        const newSpecs = specs.map(s => s.id === specId ? { ...s, ...updates } : s);
        updateScreen(screen.id, { specs: newSpecs });
    };

    const handleSyncSpec = (specId: string, updates: Partial<ScreenSpecItem>) => {
        if (isLocked) return;
        const newSpecs = specs.map(s => s.id === specId ? { ...s, ...updates } : s);
        syncUpdate({ specs: newSpecs });
    };

    const handleDeleteSpec = (specId: string) => {
        if (isLocked) return;
        const newSpecs = specs.filter(s => s.id !== specId);
        updateScreen(screen.id, { specs: newSpecs });
        syncUpdate({ specs: newSpecs });
    };

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragEnter = (index: number) => {
        if (draggedIndex === null || draggedIndex === index) return;

        const newSpecs = [...specs];
        const dragItem = newSpecs[draggedIndex];
        newSpecs.splice(draggedIndex, 1);
        newSpecs.splice(index, 0, dragItem);

        setDraggedIndex(index);
        updateScreen(screen.id, { specs: newSpecs });
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        syncUpdate({ specs });
    };

    // Label/Value cell styles (스크린샷과 동일: 중앙 정렬)
    const labelCell = "bg-[#2c3e7c] text-white text-[11px] font-bold px-3 py-2 border-r border-[#1e2d5e] select-none text-center align-middle whitespace-nowrap";
    const valueCell = "bg-white text-xs text-gray-800 px-2 py-1 border-r border-[#e2e8f0] align-middle text-center";

    // 메타 테이블 컬럼 너비 (6열)
    const DEFAULT_META_COL_WIDTHS = [100, 180, 80, 140, 90, 120];
    const metaColWidths = React.useMemo(() => {
        const saved = screen.specMetaColumnWidths;
        if (saved && saved.length === 6) return [...saved];
        return [...DEFAULT_META_COL_WIDTHS];
    }, [screen.specMetaColumnWidths]);

    const handleMetaColResizeStart = React.useCallback((colIdx: number, clientX: number) => {
        const startWidth = metaColWidths[colIdx];
        const onMove = (e: MouseEvent) => {
            const dx = e.clientX - clientX;
            const nextWidth = Math.max(48, Math.min(400, startWidth + dx));
            const currentScreen = getScreenById(screen.id);
            const currentWidths = currentScreen?.specMetaColumnWidths || metaColWidths;
            const next = [...currentWidths];
            next[colIdx] = nextWidth;
            updateScreen(screen.id, { specMetaColumnWidths: next });
        };
        const onUp = () => {
            const currentScreen = getScreenById(screen.id);
            if (currentScreen?.specMetaColumnWidths) {
                syncUpdate({ specMetaColumnWidths: currentScreen.specMetaColumnWidths });
            }
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [metaColWidths, screen.id, syncUpdate, getScreenById, updateScreen]);

    // Entity dimensions from page size/orientation (ScreenNode과 동일 로직)
    const MIN_CANVAS_WIDTH = 794;
    const CANVAS_WIDTH_RATIO = 0.7;
    const FIXED_TOP_HEIGHT = 180;
    const sizeKey = screen.pageSize && PAGE_SIZE_OPTIONS.includes(screen.pageSize as (typeof PAGE_SIZE_OPTIONS)[number]) ? screen.pageSize! : 'A4';
    const preset = PAGE_SIZE_PRESETS[sizeKey];
    const orientation = (screen.pageOrientation || 'portrait') as 'portrait' | 'landscape';
    let canvasW = orientation === 'landscape' ? preset.height : preset.width;
    let canvasH = orientation === 'landscape' ? preset.width : preset.height;
    if (canvasW < MIN_CANVAS_WIDTH) {
        const scale = MIN_CANVAS_WIDTH / canvasW;
        canvasW = MIN_CANVAS_WIDTH;
        canvasH = Math.round(canvasH * scale);
    }
    const entityWidth = Math.ceil(canvasW / CANVAS_WIDTH_RATIO);
    const entityHeight = canvasH + FIXED_TOP_HEIGHT;

    return (
        <div
            className={`transition-all group relative overflow-visible ${isLockedByOther ? 'nodrag' : ''}`}
            style={{ width: entityWidth, height: entityHeight }}
        >
            <EntityLockBadge entityId={screen.id} />
            {/* Main Content Wrapper with Overflow Hidden */}
            <div className={`relative h-full w-full bg-white rounded-[15px] overflow-hidden shadow-xl border-2 flex flex-col ${selected && !isExporting
                ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                : isLocked
                    ? 'border-gray-200 shadow-md'
                    : 'border-gray-200 shadow-blue-100'
                }`}>
                {/* Lock Overlay */}
                {isLocked && (
                    <div
                        onDoubleClick={!isLockedByOther ? handleToggleLock : undefined}
                        className="absolute inset-0 z-[100] cursor-pointer group/mask hover:bg-white/10 transition-all duration-300 rounded-[inherit]"
                    >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-sm px-4 py-3 rounded-2xl shadow-2xl border border-gray-200 opacity-0 group-hover/mask:opacity-100 transition-all transform scale-90 group-hover/mask:scale-100 flex flex-col items-center gap-1.5 pointer-events-none">
                            <Lock size={20} className={isLockedByOther ? 'text-amber-500' : 'text-gray-400'} />
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                {isLockedByOther ? `${lockedBy}님이 수정 중` : 'Double Click to Edit'}
                            </span>
                        </div>
                    </div>
                )}

                {/* ── 1. Top Header Bar (Spec Style - Slightly different icon) ── */}
                <div className={`px-4 py-2 flex items-center gap-2 text-white bg-[#2c3e7c] border-b border-white`}>
                    <FileText size={16} className="flex-shrink-0 text-white/90" />
                    <input
                        type="text"
                        value={specNameComposing !== null ? specNameComposing : screen.name}
                        onChange={(e) => {
                            const v = e.target.value;
                            if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                setSpecNameComposing(v);
                                return;
                            }
                            setSpecNameComposing(null);
                            update({ name: v });
                        }}
                        onCompositionEnd={(e) => {
                            const v = (e.target as HTMLInputElement).value;
                            setSpecNameComposing(null);
                            update({ name: v });
                        }}
                        onBlur={(e) => {
                            const v = e.target.value;
                            setSpecNameComposing(null);
                            update({ name: v });
                            syncUpdate({ name: v });
                        }}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`${!isLocked ? 'nodrag bg-white/10' : 'bg-transparent pointer-events-none'} border-none focus:ring-0 font-bold text-lg w-full p-0 px-2 outline-none placeholder-white/50 rounded transition-colors disabled:text-white`}
                        placeholder="화면명 (기능명세)"
                        spellCheck={false}
                    />

                    {/* Header Actions */}
                    <div className={`flex items-center gap-1 ${isLocked ? 'pointer-events-none opacity-0 group-hover:opacity-100' : ''}`}>
                        {/* 화면 옵션 (용지 크기/방향) */}
                        <div className="relative" ref={screenOptionsRef}>
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowScreenOptionsPanel(v => !v); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="nodrag p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/90 pointer-events-auto"
                                title="화면 옵션"
                            >
                                <SlidersHorizontal size={16} />
                            </button>
                            {showScreenOptionsPanel && (
                                <div
                                    className="nodrag absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 z-[300] animate-in fade-in zoom-in-95 duration-150"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">용지 크기</div>
                                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                                        {PAGE_SIZE_OPTIONS.map((s) => {
                                            const dim = PAGE_SIZE_DIMENSIONS_MM[s];
                                            const ori = (screen.pageOrientation || 'portrait') as 'portrait' | 'landscape';
                                            const labelW = ori === 'portrait' ? dim.w : dim.h;
                                            const labelH = ori === 'portrait' ? dim.h : dim.w;
                                            return (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => { update({ pageSize: s }); syncUpdate({ pageSize: s }); }}
                                                    className={`nodrag w-full px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${(screen.pageSize || 'A4') === s
                                                        ? 'bg-[#2c3e7c] text-white'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                        }`}
                                                >
                                                    <span className="block">{s}</span>
                                                    <span className="block text-[8px] font-normal opacity-90">{labelW}×{labelH}mm</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">방향</div>
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => { update({ pageOrientation: 'portrait' }); syncUpdate({ pageOrientation: 'portrait' }); }}
                                            className={`nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${(screen.pageOrientation || 'portrait') === 'portrait' ? 'bg-[#2c3e7c] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >
                                            <RectangleVertical size={12} /> 세로
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { update({ pageOrientation: 'landscape' }); syncUpdate({ pageOrientation: 'landscape' }); }}
                                            className={`nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${screen.pageOrientation === 'landscape' ? 'bg-[#2c3e7c] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >
                                            <RectangleHorizontal size={12} /> 가로
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleToggleLock}
                            onMouseDown={(e) => e.stopPropagation()}
                            disabled={isLockedByOther}
                            className={`nodrag p-1.5 rounded-md transition-colors pointer-events-auto ${isLockedByOther ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 text-white/90'}`}
                            title={isLockedByOther ? `${lockedBy}님이 수정 중` : isLocked ? "잠금 해제" : "잠금"}
                        >
                            {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                        {!isLocked && (
                            <button
                                onClick={handleDelete}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="nodrag opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-500 rounded-md text-white/90"
                                title="삭제"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── 2. Meta Info Table (너비 조절 + 중앙 정렬) ── */}
                <div className="border-b border-gray-200">
                    <table className="nodrag w-full border-collapse table-fixed">
                        <colgroup>
                            {metaColWidths.map((w, i) => (
                                <col key={i} style={{ width: w }} />
                            ))}
                        </colgroup>
                        <tbody>
                            {/* Row 1 */}
                            <tr className="border-b border-[#e2e8f0]">
                                <td className={`${labelCell} relative`}>
                                    시스템명
                                    {!isLocked && <ColResizeHandle onResizeStart={handleMetaColResizeStart} colIdx={0} />}
                                </td>
                                <td className={`${valueCell} relative`}>
                                    <EditableCell value={screen.systemName} onChange={(v) => update({ systemName: v })} onBlur={(v) => syncUpdate({ systemName: v })} isLocked={isLocked} placeholder="시스템명" className="text-center font-bold" />
                                    {!isLocked && <ColResizeHandle onResizeStart={handleMetaColResizeStart} colIdx={1} />}
                                </td>
                                <td className={`${labelCell} relative`}>
                                    작성자
                                    {!isLocked && <ColResizeHandle onResizeStart={handleMetaColResizeStart} colIdx={2} />}
                                </td>
                                <td className={`${valueCell} relative`}>
                                    <EditableCell value={screen.author} onChange={(v) => update({ author: v })} onBlur={(v) => syncUpdate({ author: v })} isLocked={isLocked} placeholder="작성자" className="text-center" />
                                    {!isLocked && <ColResizeHandle onResizeStart={handleMetaColResizeStart} colIdx={3} />}
                                </td>
                                <td className={`${labelCell} relative`}>
                                    작성일자
                                    {!isLocked && <ColResizeHandle onResizeStart={handleMetaColResizeStart} colIdx={4} />}
                                </td>
                                <td className={`${valueCell} border-r-0 relative`}>
                                    <EditableCell value={screen.createdDate} onChange={(v) => update({ createdDate: v })} onBlur={(v) => syncUpdate({ createdDate: v })} isLocked={isLocked} placeholder="YYYY-MM-DD" mono className="text-center" />
                                    {!isLocked && <ColResizeHandle onResizeStart={handleMetaColResizeStart} colIdx={5} />}
                                </td>
                            </tr>

                            {/* Row 2 */}
                            <tr className="border-b border-[#e2e8f0]">
                                <td className={labelCell}>화면ID</td>
                                <td className={valueCell}>
                                    <EditableCell value={screen.screenId} onChange={(v) => update({ screenId: v })} onBlur={(v) => syncUpdate({ screenId: v })} isLocked={isLocked} placeholder="화면ID" mono className="font-bold text-[#2c3e7c] text-center" />
                                </td>
                                <td className={labelCell}>화면유형</td>
                                <td className={valueCell}>
                                    <EditableCell value={screen.screenType} onChange={(v) => update({ screenType: v })} onBlur={(v) => syncUpdate({ screenType: v })} isLocked={isLocked} isSelect options={SCREEN_TYPES} className="text-center h-full" />
                                </td>
                                <td className={labelCell}>페이지</td>
                                <td className={`${valueCell} border-r-0`}>
                                    <EditableCell value={screen.page} onChange={(v) => update({ page: v })} onBlur={(v) => syncUpdate({ page: v })} isLocked={isLocked} placeholder="1/1" mono className="text-center" />
                                </td>
                            </tr>

                            {/* Row 3 - Description */}
                            <tr>
                                <td className={labelCell}>화면설명</td>
                                <td className={`${valueCell} border-r-0`} colSpan={5}>
                                    <EditableCell value={screen.screenDescription} onChange={(v) => update({ screenDescription: v })} onBlur={(v) => syncUpdate({ screenDescription: v })} isLocked={isLocked} placeholder="화면에 대한 구체적인 설명을 입력하세요" className="text-left" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* ── 3. Spec Table (Main Body) ── */}
                <div className="flex-1 bg-white flex flex-col min-h-[400px]">
                    <div className="flex-1 overflow-auto no-pan-scroll">
                        <table className="nodrag w-full border-collapse border border-gray-200 text-xs table-fixed">
                            <colgroup>
                                {!isLocked && <col style={{ width: 32 }} />}
                                <col style={{ width: colWidths[0] }} />
                                <col style={{ width: colWidths[1] }} />
                                <col style={{ width: colWidths[2] }} />
                                <col style={{ width: colWidths[3] }} />
                                <col style={{ width: colWidths[4] }} />
                                <col style={{ width: colWidths[5] }} />
                                <col style={{ width: colWidths[6] }} />
                                <col style={{ width: colWidths[7] }} />
                                <col style={{ width: colWidths[8] }} />
                                <col style={{ width: colWidths[9] }} />
                                {!isLocked && <col style={{ width: 40 }} />}
                            </colgroup>
                            {/* Table Header with sticky */}
                            <thead className="nodrag sticky top-0 z-10">
                                {/* Header Row 1 */}
                                <tr className="bg-blue-50/80 border-b border-gray-200">
                                    {!isLocked && <th rowSpan={2} className="w-8 bg-gray-50 border-r border-gray-200"></th>}
                                    <th rowSpan={2} className="border-r border-gray-200 px-2 py-1.5 font-bold text-gray-700 relative">
                                        테이블명(한글)
                                        {!isLocked && <ColResizeHandle onResizeStart={handleSpecColResizeStart} colIdx={0} />}
                                    </th>
                                    <th rowSpan={2} className="border-r border-gray-200 px-2 py-1.5 font-bold text-gray-700 relative">
                                        테이블명(영어)
                                        {!isLocked && <ColResizeHandle onResizeStart={handleSpecColResizeStart} colIdx={1} />}
                                    </th>
                                    <th rowSpan={2} className="border-r border-gray-200 px-2 py-1.5 font-bold text-gray-700 relative">
                                        항목명(한글)
                                        {!isLocked && <ColResizeHandle onResizeStart={handleSpecColResizeStart} colIdx={2} />}
                                    </th>
                                    <th rowSpan={2} className="border-r border-gray-200 px-2 py-1.5 font-bold text-gray-700 relative">
                                        필드명(영문)
                                        {!isLocked && <ColResizeHandle onResizeStart={handleSpecColResizeStart} colIdx={3} />}
                                    </th>
                                    <th rowSpan={2} className="border-r border-gray-200 px-2 py-1.5 font-bold text-gray-700 relative">
                                        항목타입
                                        {!isLocked && <ColResizeHandle onResizeStart={handleSpecColResizeStart} colIdx={4} />}
                                    </th>
                                    <th colSpan={4} className="border-r border-gray-200 border-b px-2 py-1 font-bold text-gray-700 bg-blue-100/50">항목정의</th>
                                    <th rowSpan={2} className="px-2 py-1.5 font-bold text-gray-700 border-r border-gray-200 relative">
                                        비고
                                        {!isLocked && <ColResizeHandle onResizeStart={handleSpecColResizeStart} colIdx={9} />}
                                    </th>
                                    {!isLocked && <th rowSpan={2} className="w-10 bg-gray-50 border-l border-gray-200"></th>}
                                </tr>
                                {/* Header Row 2 */}
                                <tr className="bg-blue-50/80 border-b border-gray-200">
                                    <th className="border-r border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 relative">
                                        Format
                                        {!isLocked && <ColResizeHandle onResizeStart={handleSpecColResizeStart} colIdx={5} />}
                                    </th>
                                    <th className="border-r border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 relative">
                                        자릿수
                                        {!isLocked && <ColResizeHandle onResizeStart={handleSpecColResizeStart} colIdx={6} />}
                                    </th>
                                    <th className="border-r border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 relative">
                                        초기값
                                        {!isLocked && <ColResizeHandle onResizeStart={handleSpecColResizeStart} colIdx={7} />}
                                    </th>
                                    <th className="border-r border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 relative">
                                        Validation
                                        {!isLocked && <ColResizeHandle onResizeStart={handleSpecColResizeStart} colIdx={8} />}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {specs.map((spec, idx) => (
                                    <SpecRow
                                        key={spec.id}
                                        item={spec}
                                        isLocked={isLocked}
                                        htmlTypes={SCREEN_FIELD_TYPES}
                                        dbTypes={dbFieldTypes}
                                        onUpdate={(updates) => handleUpdateSpec(spec.id, updates)}
                                        onBlur={(updates) => handleSyncSpec(spec.id, updates)}
                                        onDelete={() => handleDeleteSpec(spec.id)}
                                        onDragStart={() => handleDragStart(idx)}
                                        onDragEnter={() => handleDragEnter(idx)}
                                        onDragEnd={handleDragEnd}
                                        isDragging={draggedIndex === idx}
                                    />
                                ))}
                                {specs.length === 0 && (
                                    <tr>
                                        <td colSpan={isLocked ? 8 : 10} className="py-12 text-center text-gray-300 italic">
                                            기능 명세 항목을 추가하세요.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Add Button */}
                    {!isLocked && (
                        <div className="p-2 bg-gray-50 border-t border-gray-200">
                            <button
                                onClick={handleAddSpec}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="nodrag w-full py-2 flex items-center justify-center gap-1.5 border border-dashed border-gray-400 rounded-lg text-gray-500 hover:border-[#2c3e7c] hover:text-[#2c3e7c] hover:bg-blue-50 transition-all text-sm font-bold shadow-sm bg-white"
                            >
                                <Plus size={14} />
                                명세 항목 추가
                            </button>
                        </div>
                    )}
                </div>

            </div>

            {/* Connection Handles (Outside overflow-hidden wrapper) */}
            <ScreenHandles />
        </div >
    );
};

export default memo(SpecNode);
