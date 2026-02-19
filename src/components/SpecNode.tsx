import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { Screen, ScreenSpecItem } from '../types/screenDesign';
import { SCREEN_FIELD_TYPES, SCREEN_TYPES } from '../types/screenDesign';
import { Plus, Trash2, Lock, Unlock, X, ChevronDown, FileText } from 'lucide-react';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useProjectStore } from '../store/projectStore';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';

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
    dataTypes?: string[] | readonly string[];
    onUpdate: (updates: Partial<ScreenSpecItem>) => void;
    onBlur?: (updates: Partial<ScreenSpecItem>) => void;
    onDelete: () => void;
}

const SpecRow: React.FC<SpecRowProps> = memo(({ item, isLocked, dataTypes, onUpdate, onBlur, onDelete }) => {
    // 공통 셀 스타일
    const cellClass = `px-2 py-1.5 border-r border-gray-200 align-middle bg-white relative`;
    const inputClass = `w-full bg-transparent border-none outline-none text-xs p-1 ${isLocked ? 'text-gray-800' : 'nodrag text-gray-900 hover:bg-blue-50 focus:bg-blue-50 rounded transition-colors'}`;

    const types = dataTypes || SCREEN_FIELD_TYPES;

    return (
        <tr className="group/row border-b border-gray-200 last:border-b-0 hover:bg-blue-50/30 transition-colors">
            {/* 항목명(한글) */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={item.fieldName}
                    onChange={(e) => onUpdate({ fieldName: e.target.value })}
                    onBlur={(e) => onBlur?.({ fieldName: e.target.value })}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass} font-bold`}
                    placeholder="항목명"
                />
            </td>
            {/* 컨트롤명(영문) */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={item.controlName}
                    onChange={(e) => onUpdate({ controlName: e.target.value })}
                    onBlur={(e) => onBlur?.({ controlName: e.target.value })}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass} font-mono text-blue-800`}
                    placeholder="CONTROL_ID"
                />
            </td>
            {/* 항목타입 */}
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
                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {!isLocked && <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />}
                </div>
            </td>

            {/* ── 항목정의 4개 컬럼 ── */}
            {/* Format */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={item.format}
                    onChange={(e) => onUpdate({ format: e.target.value })}
                    onBlur={(e) => onBlur?.({ format: e.target.value })}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass} text-center`}
                    placeholder="VARCHAR2"
                />
            </td>
            {/* 자릿수 */}
            <td className={cellClass}>
                <input
                    type="text"
                    value={item.length}
                    onChange={(e) => onUpdate({ length: e.target.value })}
                    onBlur={(e) => onBlur?.({ length: e.target.value })}
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
                    value={item.defaultValue}
                    onChange={(e) => onUpdate({ defaultValue: e.target.value })}
                    onBlur={(e) => onBlur?.({ defaultValue: e.target.value })}
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
                    value={item.validation}
                    onChange={(e) => onUpdate({ validation: e.target.value })}
                    onBlur={(e) => onBlur?.({ validation: e.target.value })}
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
                    value={item.memo}
                    onChange={(e) => onUpdate({ memo: e.target.value })}
                    onBlur={(e) => onBlur?.({ memo: e.target.value })}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${inputClass}`}
                    placeholder=""
                />
            </td>

            {/* 삭제 버튼 (테이블 밖 혹은 별도 컬럼) -> 여기서는 별도 컬럼 없이 hover시 오버레이? 
               아니면 마지막 컬럼에 포함? 스크린샷엔 삭제 버튼이 없지만 기능상 필요함.
               일단 비고 컬럼 우측에 아주 좁게 추가하거나, 비고 안에 버튼을 둠.
               스크린샷에는 '비고'가 마지막임.
               -> 편의상 비고 오른쪽에 아주 좁은 '삭제' 컬럼 추가하겠음.
            */}
            <td className="w-8 text-center align-middle bg-white border-l border-gray-200">
                {!isLocked && (
                    <button
                        onClick={onDelete}
                        className="nodrag p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover/row:opacity-100 transition-all"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </td>
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
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onBlur?.(e.target.value)}
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

const SpecNode: React.FC<NodeProps<SpecNodeData>> = ({ data, selected }) => {
    const { screen } = data;
    const { updateScreen, deleteScreen } = useScreenDesignStore();
    const { sendOperation } = useSyncStore();
    const { user } = useAuthStore();
    const isLocked = screen.isLocked ?? true;

    const syncUpdate = (updates: Partial<Screen>) => {
        sendOperation({
            type: 'SCREEN_UPDATE',
            targetId: screen.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: updates
        });
    };

    // Linked ERD Project Data
    const { projects, currentProjectId } = useProjectStore();
    const currentProject = projects.find(p => p.id === currentProjectId);
    const linkedErdProject = projects.find(p => p.id === currentProject?.linkedErdProjectId);

    // Determine Data Types based on DB Type
    const dataTypes = React.useMemo(() => {
        // Priority: 1. Linked ERD DB Type, 2. Current Project DB Type, 3. Default
        const dbType = linkedErdProject?.dbType || currentProject?.dbType;
        if (dbType && DB_TYPES[dbType]) {
            return DB_TYPES[dbType];
        }
        return SCREEN_FIELD_TYPES;
    }, [linkedErdProject, currentProject]);

    // Default Specs if empty
    const specs = screen.specs || [];

    const update = (updates: Partial<Screen>) => {
        if (isLocked) return;
        updateScreen(screen.id, updates);
    };

    const handleToggleLock = (e: React.MouseEvent) => {
        e.stopPropagation();
        const nextLocked = !isLocked;
        updateScreen(screen.id, { isLocked: nextLocked });
        syncUpdate({ isLocked: nextLocked });
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`기능명세서 "${screen.name}"을(를) 삭제하시겠습니까?`)) {
            deleteScreen(screen.id);
            sendOperation({
                type: 'SCREEN_DELETE',
                targetId: screen.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: {}
            });
        }
    };

    const handleAddSpec = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isLocked) return;
        const newSpec: ScreenSpecItem = {
            id: `spec_${Date.now()}`,
            fieldName: '',
            controlName: '',
            dataType: 'INPUT',
            format: 'VARCHAR2',
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

    // Label/Value cell styles (Shared with ScreenNode for consistency)
    const labelCell = "bg-[#2c3e7c] text-white text-[11px] font-bold px-3 py-2 border-r border-[#1e2d5e] select-none text-center align-middle whitespace-nowrap";
    const valueCell = "bg-white text-xs text-gray-800 px-2 py-1 border-r border-[#e2e8f0] align-middle";

    return (
        <div
            className={`transition-all group relative`}
            style={{ width: 1000 }}
        >
            {/* Main Content Wrapper with Overflow Hidden */}
            <div className={`bg-white rounded-[15px] overflow-hidden shadow-xl border-2 flex flex-col ${selected
                ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                : isLocked
                    ? 'border-gray-200 shadow-md'
                    : 'border-gray-200 shadow-blue-100'
                }`}>
                {/* Lock Overlay */}
                {isLocked && (
                    <div
                        onDoubleClick={handleToggleLock}
                        className="absolute inset-0 z-[100] cursor-pointer group/mask hover:bg-white/10 transition-all duration-300 rounded-[inherit]"
                    >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-sm px-4 py-3 rounded-2xl shadow-2xl border border-gray-200 opacity-0 group-hover/mask:opacity-100 transition-all transform scale-90 group-hover/mask:scale-100 flex flex-col items-center gap-1.5 pointer-events-none">
                            <Lock size={20} className="text-gray-400" />
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                Double Click to Edit
                            </span>
                        </div>
                    </div>
                )}

                {/* ── 1. Top Header Bar (Spec Style - Slightly different icon) ── */}
                <div className={`px-4 py-2 flex items-center gap-2 text-white bg-[#2c3e7c] border-b border-white`}>
                    <FileText size={16} className="flex-shrink-0 text-white/90" />
                    <input
                        type="text"
                        value={screen.name}
                        onChange={(e) => update({ name: e.target.value })}
                        onBlur={(e) => syncUpdate({ name: e.target.value })}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`${!isLocked ? 'nodrag bg-white/10' : 'bg-transparent pointer-events-none'} border-none focus:ring-0 font-bold text-lg w-full p-0 px-2 outline-none placeholder-white/50 rounded transition-colors disabled:text-white`}
                        placeholder="화면명 (기능명세)"
                        spellCheck={false}
                    />

                    {/* Header Actions */}
                    <div className={`flex items-center gap-1 ${isLocked ? 'pointer-events-none opacity-0 group-hover:opacity-100' : ''}`}>
                        <button
                            onClick={handleToggleLock}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="nodrag p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/90 pointer-events-auto"
                            title={isLocked ? "잠금 해제" : "잠금"}
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

                {/* ── 2. Meta Info Table (Same as ScreenNode) ── */}
                <div className="border-b border-gray-200">
                    <table className="w-full border-collapse">
                        <tbody>
                            {/* Row 1 */}
                            <tr className="border-b border-[#e2e8f0]">
                                <td className={labelCell} style={{ width: 100 }}>시스템명</td>
                                <td className={valueCell} style={{ width: 180 }}>
                                    <EditableCell value={screen.systemName} onChange={(v) => update({ systemName: v })} onBlur={(v) => syncUpdate({ systemName: v })} isLocked={isLocked} placeholder="시스템명" className="text-center font-bold" />
                                </td>
                                <td className={labelCell} style={{ width: 80 }}>작성자</td>
                                <td className={valueCell} style={{ width: 140 }}>
                                    <EditableCell value={screen.author} onChange={(v) => update({ author: v })} onBlur={(v) => syncUpdate({ author: v })} isLocked={isLocked} placeholder="작성자" className="text-center" />
                                </td>
                                <td className={labelCell} style={{ width: 90 }}>작성일자</td>
                                <td className={`${valueCell} border-r-0`}>
                                    <EditableCell value={screen.createdDate} onChange={(v) => update({ createdDate: v })} onBlur={(v) => syncUpdate({ createdDate: v })} isLocked={isLocked} placeholder="YYYY-MM-DD" mono className="text-center" />
                                </td>
                            </tr>

                            {/* Row 2 */}
                            <tr className="border-b border-[#e2e8f0]">
                                <td className={labelCell}>화면ID</td>
                                <td className={valueCell}>
                                    <EditableCell value={screen.screenId} onChange={(v) => update({ screenId: v })} onBlur={(v) => syncUpdate({ screenId: v })} isLocked={isLocked} placeholder="화면ID" mono className="font-bold text-[#2c3e7c]" />
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
                                    <EditableCell value={screen.screenDescription} onChange={(v) => update({ screenDescription: v })} onBlur={(v) => syncUpdate({ screenDescription: v })} isLocked={isLocked} placeholder="화면에 대한 구체적인 설명을 입력하세요" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* ── 3. Spec Table (Main Body) ── */}
                <div className="flex-1 bg-white flex flex-col min-h-[400px]">
                    <div className="flex-1 overflow-auto">
                        <table className="w-full border-collapse border border-gray-200 text-xs table-fixed">
                            {/* Table Header with sticky */}
                            <thead className="sticky top-0 z-10">
                                {/* Header Row 1 */}
                                <tr className="bg-blue-50/80 border-b border-gray-200">
                                    <th rowSpan={2} className="border-r border-gray-200 px-2 py-1.5 font-bold text-gray-700 w-32">항목명(한글)</th>
                                    <th rowSpan={2} className="border-r border-gray-200 px-2 py-1.5 font-bold text-gray-700 w-32">컨트롤명(영문)</th>
                                    <th rowSpan={2} className="border-r border-gray-200 px-2 py-1.5 font-bold text-gray-700 w-24">항목타입</th>
                                    <th colSpan={4} className="border-r border-gray-200 border-b px-2 py-1 font-bold text-gray-700 bg-blue-100/50">항목정의</th>
                                    <th rowSpan={2} className="px-2 py-1.5 font-bold text-gray-700 border-r border-gray-200 w-24">비고</th>
                                    <th rowSpan={2} className="w-8 bg-gray-50 border-gray-200"></th>
                                </tr>
                                {/* Header Row 2 */}
                                <tr className="bg-blue-50/80 border-b border-gray-200">
                                    <th className="border-r border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 w-20">Format</th>
                                    <th className="border-r border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 w-16">자릿수</th>
                                    <th className="border-r border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 w-16">초기값</th>
                                    <th className="border-r border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 w-20">Validation</th>
                                </tr>
                            </thead>
                            <tbody>
                                {specs.map(spec => (
                                    <SpecRow
                                        key={spec.id}
                                        item={spec}
                                        isLocked={isLocked}
                                        dataTypes={dataTypes}
                                        onUpdate={(updates) => handleUpdateSpec(spec.id, updates)}
                                        onBlur={(updates) => handleSyncSpec(spec.id, updates)}
                                        onDelete={() => handleDeleteSpec(spec.id)}
                                    />
                                ))}
                                {specs.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="py-12 text-center text-gray-300 italic">
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
        </div>
    );
};

export default memo(SpecNode);
