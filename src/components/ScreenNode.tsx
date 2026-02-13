import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { Screen, ScreenField } from '../types/screenDesign';
import { SCREEN_FIELD_TYPES, SCREEN_TYPES } from '../types/screenDesign';
import { Plus, Trash2, Lock, Unlock, Image as ImageIcon, Upload, X, Monitor, ChevronDown, Check, FileText } from 'lucide-react';
import { useScreenDesignStore } from '../store/screenDesignStore';

// ── Field Row (기능 항목 행) ────────────────────────────────────
interface FieldRowProps {
    field: ScreenField;
    isLocked: boolean;
    onUpdate: (updates: Partial<ScreenField>) => void;
    onDelete: () => void;
}

const FieldRow: React.FC<FieldRowProps> = memo(({ field, isLocked, onUpdate, onDelete }) => {
    return (
        <tr className="group/row border-b border-gray-200 last:border-b-0 hover:bg-blue-50/50 transition-colors">
            {/* No */}
            <td className="px-2 py-1.5 text-center w-10 border-r border-gray-200 align-middle bg-white">
                <div className="w-5 h-5 bg-[#2c3e7c] text-white rounded-full flex items-center justify-center text-[10px] font-black mx-auto shadow-sm">
                    {field.no}
                </div>
            </td>
            {/* 항목명 */}
            <td className="px-2 py-1.5 border-r border-gray-200 align-top bg-white">
                <input
                    type="text"
                    value={field.name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`w-full text-xs font-bold bg-transparent border-none outline-none p-1 ${isLocked ? 'text-gray-800' : 'nodrag text-gray-900 hover:bg-blue-50 focus:bg-blue-50 focus:ring-1 ring-blue-200 rounded transition-all'}`}
                    placeholder="항목명"
                    spellCheck={false}
                />
            </td>
            {/* 유형 */}
            <td className="px-2 py-1.5 border-r border-gray-200 w-24 align-top bg-white">
                <div className="relative w-full h-full flex items-center">
                    <select
                        value={field.fieldType}
                        onChange={(e) => onUpdate({ fieldType: e.target.value })}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`w-full text-[11px] bg-transparent border-none outline-none p-1 appearance-none pr-4 ${isLocked ? 'text-gray-500' : 'nodrag text-[#2c3e7c] font-medium cursor-pointer hover:bg-blue-50 rounded transition-colors'}`}
                    >
                        {SCREEN_FIELD_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                    {!isLocked && <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />}
                </div>
            </td>
            {/* 설명 */}
            <td className="px-2 py-1.5 border-r border-gray-200 align-top bg-white">
                <textarea
                    value={field.description || ''}
                    onChange={(e) => onUpdate({ description: e.target.value })}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    rows={1}
                    className={`w-full text-[11px] leading-relaxed bg-transparent border-none outline-none p-1 resize-none overflow-hidden ${isLocked ? 'text-gray-600' : 'nodrag text-gray-700 hover:bg-blue-50 focus:bg-blue-50 focus:ring-1 ring-blue-200 rounded transition-all min-h-[26px]'}`}
                    placeholder="기능 설명..."
                    spellCheck={false}
                    style={{ height: 'auto' }}
                    onInput={(e) => {
                        e.currentTarget.style.height = 'auto';
                        e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                    }}
                />
            </td>
            {/* 삭제 */}
            <td className="w-8 text-center align-middle bg-white">
                {!isLocked && (
                    <button
                        onClick={onDelete}
                        onMouseDown={(e) => e.stopPropagation()}
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
    isLocked: boolean;
    placeholder?: string;
    className?: string;
    isSelect?: boolean;
    options?: readonly string[];
    mono?: boolean;
}

const EditableCell: React.FC<EditableCellProps> = memo(({ value, onChange, isLocked, placeholder, className = '', isSelect, options, mono }) => {
    if (isSelect && options) {
        return (
            <div className="relative w-full h-full flex items-center">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
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
            onMouseDown={(e) => !isLocked && e.stopPropagation()}
            disabled={isLocked}
            className={`w-full bg-transparent border-none outline-none text-xs p-1 ${isLocked ? 'text-gray-700' : 'nodrag text-gray-900 hover:bg-blue-50 focus:bg-blue-50 rounded transition-colors'} ${mono ? 'font-mono' : ''} ${className}`}
            placeholder={placeholder}
            spellCheck={false}
        />
    );
});

// ── Screen Node ─────────────────────────────────────────────
interface ScreenNodeData {
    screen: Screen;
}

const ScreenNode: React.FC<NodeProps<ScreenNodeData>> = ({ data, selected }) => {
    const { screen } = data;
    const { updateScreen, deleteScreen } = useScreenDesignStore();
    const isLocked = screen.isLocked ?? true;

    const update = (updates: Partial<Screen>) => {
        if (isLocked) return;
        updateScreen(screen.id, updates);
    };

    const handleToggleLock = (e: React.MouseEvent) => {
        e.stopPropagation();
        updateScreen(screen.id, { isLocked: !isLocked });
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`화면 "${screen.name}"을(를) 삭제하시겠습니까?`)) {
            deleteScreen(screen.id);
        }
    };

    const handleAddField = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isLocked) return;
        const maxNo = screen.fields.length > 0 ? Math.max(...screen.fields.map(f => f.no)) : 0;
        const newField: ScreenField = {
            id: `field_${Date.now()}`,
            no: maxNo + 1,
            name: '',
            fieldType: 'BUTTON',
            description: '',
        };
        updateScreen(screen.id, { fields: [...screen.fields, newField] });
    };

    const handleUpdateField = (fieldId: string, updates: Partial<ScreenField>) => {
        if (isLocked) return;
        const newFields = screen.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f);
        updateScreen(screen.id, { fields: newFields });
    };

    const handleDeleteField = (fieldId: string) => {
        if (isLocked) return;
        const newFields = screen.fields.filter(f => f.id !== fieldId);
        // Re-number
        const renumbered = newFields.map((f, i) => ({ ...f, no: i + 1 }));
        updateScreen(screen.id, { fields: renumbered });
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) return alert('이미지 크기는 5MB 이하여야 합니다.');
            const reader = new FileReader();
            reader.onloadend = () => {
                update({ imageUrl: reader.result as string });
            };
            reader.readAsDataURL(file);
        }
    };

    // Label cell style: Navy(#2c3e7c) background, White text
    const labelCell = "bg-[#2c3e7c] text-white text-[11px] font-bold px-3 py-2 border-r border-[#1e2d5e] select-none text-center align-middle whitespace-nowrap";
    // Value cell style
    const valueCell = "bg-white text-xs text-gray-800 px-2 py-1 border-r border-[#e2e8f0] align-middle";

    return (
        <div
            className={`bg-white rounded-lg shadow-xl border-2 transition-all group relative overflow-hidden ${selected
                ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                : isLocked
                    ? 'border-gray-200 shadow-md'
                    : 'border-[#2c3e7c] shadow-blue-100'
                }`}
            style={{ width: 1000 }}
        >
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

            {/* ── 1. Top Header Bar (ERD Style) ── */}
            <div className={`px-4 py-2 flex items-center gap-2 text-white bg-[#2c3e7c] border-b border-white`}>
                <Monitor size={16} className="flex-shrink-0 text-white/90" />
                <input
                    type="text"
                    value={screen.name}
                    onChange={(e) => update({ name: e.target.value })}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${!isLocked ? 'nodrag bg-white/10' : 'bg-transparent pointer-events-none'} border-none focus:ring-0 font-bold text-lg w-full p-0 px-2 outline-none placeholder-white/50 rounded transition-colors disabled:text-white`}
                    placeholder="화면명"
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

            {/* ── 2. Meta Info Table (Refined) ── */}
            <div className="border-b border-gray-200">
                <table className="w-full border-collapse">
                    <tbody>
                        {/* Row 1 */}
                        <tr className="border-b border-[#e2e8f0]">
                            <td className={labelCell} style={{ width: 100 }}>시스템명</td>
                            <td className={valueCell} style={{ width: 180 }}>
                                <EditableCell value={screen.systemName} onChange={(v) => update({ systemName: v })} isLocked={isLocked} placeholder="시스템명" className="text-center font-bold" />
                            </td>
                            <td className={labelCell} style={{ width: 80 }}>작성자</td>
                            <td className={valueCell} style={{ width: 140 }}>
                                <EditableCell value={screen.author} onChange={(v) => update({ author: v })} isLocked={isLocked} placeholder="작성자" className="text-center" />
                            </td>
                            <td className={labelCell} style={{ width: 90 }}>작성일자</td>
                            <td className={`${valueCell} border-r-0`}>
                                <EditableCell value={screen.createdDate} onChange={(v) => update({ createdDate: v })} isLocked={isLocked} placeholder="YYYY-MM-DD" mono className="text-center" />
                            </td>
                        </tr>

                        {/* Row 2 */}
                        <tr className="border-b border-[#e2e8f0]">
                            <td className={labelCell}>화면ID</td>
                            <td className={valueCell}>
                                <EditableCell value={screen.screenId} onChange={(v) => update({ screenId: v })} isLocked={isLocked} placeholder="화면ID" mono className="font-bold text-[#2c3e7c]" />
                            </td>
                            <td className={labelCell}>화면유형</td>
                            <td className={valueCell}>
                                <EditableCell value={screen.screenType} onChange={(v) => update({ screenType: v })} isLocked={isLocked} isSelect options={SCREEN_TYPES} className="text-center h-full" />
                            </td>
                            <td className={labelCell}>페이지</td>
                            <td className={`${valueCell} border-r-0`}>
                                <EditableCell value={screen.page} onChange={(v) => update({ page: v })} isLocked={isLocked} placeholder="1/1" mono className="text-center" />
                            </td>
                        </tr>

                        {/* Row 3 - Description */}
                        <tr>
                            <td className={labelCell}>화면설명</td>
                            <td className={`${valueCell} border-r-0`} colSpan={5}>
                                <EditableCell value={screen.screenDescription} onChange={(v) => update({ screenDescription: v })} isLocked={isLocked} placeholder="화면에 대한 구체적인 설명을 입력하세요" />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* ── 3. Body Content (Split Layout) ── */}
            <div className="flex bg-white min-h-[500px]">

                {/* [LEFT PANE 70%] - Image & Function Items */}
                <div className="flex-[7] border-r border-gray-200 flex flex-col bg-gray-50/10">

                    {/* Image Area */}
                    <div className="relative group/image border-b border-gray-200 bg-white flex-1 flex items-center justify-center overflow-hidden transition-colors hover:bg-gray-50">
                        {screen.imageUrl ? (
                            <img src={screen.imageUrl} alt="UI Mockup" className="max-w-full max-h-[500px] object-contain shadow-sm" />
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-2 p-8 text-gray-300 select-none">
                                <div className="w-16 h-16 rounded-2xl bg-gray-50/50 flex items-center justify-center mb-2 border border-dashed border-gray-200">
                                    <ImageIcon size={32} className="opacity-40" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-bold text-gray-400">UI 목업 이미지</p>
                                    <p className="text-[10px] text-gray-400">이미지를 업로드하거나 드래그하세요</p>
                                </div>
                            </div>
                        )}

                        {/* Image Actions Overlay */}
                        {!isLocked && (
                            <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover/image:opacity-100 transition-opacity">
                                <label className="cursor-pointer bg-white/90 backdrop-blur hover:bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg shadow border border-blue-100 text-xs font-bold flex items-center gap-2 transition-transform hover:scale-105 active:scale-95">
                                    <Upload size={13} />
                                    {screen.imageUrl ? '변경' : '업로드'}
                                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </label>
                                {screen.imageUrl && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm('이미지를 삭제하시겠습니까?')) update({ imageUrl: undefined });
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="bg-white/90 backdrop-blur hover:bg-red-50 text-red-500 px-3 py-1.5 rounded-lg shadow border border-red-100 text-xs font-bold flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
                                    >
                                        <X size={13} />
                                        삭제
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                </div>

                {/* [RIGHT PANE 30%] - Details & Settings */}
                <div className="flex-[3] flex flex-col bg-white" style={{ minWidth: 250 }}>
                    {/* Panel 1: 초기화면설정 */}
                    <div className="flex-1 flex flex-col border-b border-gray-200 min-h-[120px]">
                        <div className="bg-[#5c6b9e] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a588a] select-none shadow-sm flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 초기화면설정
                        </div>
                        <div className="flex-1 p-0 relative group/area">
                            <textarea
                                value={screen.initialSettings}
                                onChange={(e) => update({ initialSettings: e.target.value })}
                                onMouseDown={(e) => !isLocked && e.stopPropagation()}
                                disabled={isLocked}
                                className={`w-full h-full text-[11px] leading-relaxed bg-transparent border-none outline-none p-3 resize-none scrollbar-thin ${isLocked ? 'text-gray-600' : 'nodrag text-gray-800 bg-white hover:bg-blue-50/10 focus:bg-blue-50/10 transition-colors'}`}
                                placeholder="• 화면 진입 시 초기 설정..."
                                spellCheck={false}
                            />
                        </div>
                    </div>

                    {/* Panel 2: 기능상세 */}
                    <div className="flex-[2] flex flex-col border-b border-gray-200 min-h-[200px]">
                        <div className="bg-[#5c6b9e] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a588a] select-none shadow-sm flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 기능상세
                        </div>
                        <div className="flex-1 p-0 relative group/area">
                            <textarea
                                value={screen.functionDetails}
                                onChange={(e) => update({ functionDetails: e.target.value })}
                                onMouseDown={(e) => !isLocked && e.stopPropagation()}
                                disabled={isLocked}
                                className={`w-full h-full text-[11px] leading-relaxed bg-transparent border-none outline-none p-3 resize-none scrollbar-thin ${isLocked ? 'text-gray-600' : 'nodrag text-gray-800 bg-white hover:bg-blue-50/10 focus:bg-blue-50/10 transition-colors'}`}
                                placeholder="1. 상세 기능 설명 입력...&#13;&#10;2. 주요 로직 기술..."
                                spellCheck={false}
                            />
                        </div>
                    </div>

                    {/* Panel 3: 관련테이블 */}
                    <div className="flex-1 flex flex-col min-h-[120px]">
                        <div className="bg-[#5e6b7c] text-white text-[11px] font-bold px-3 py-1.5 border-b border-[#4a5463] select-none shadow-sm flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-white rounded-full opacity-50" /> 관련테이블
                        </div>
                        <div className="flex-1 p-0 relative group/area">
                            <textarea
                                value={screen.relatedTables}
                                onChange={(e) => update({ relatedTables: e.target.value })}
                                onMouseDown={(e) => !isLocked && e.stopPropagation()}
                                disabled={isLocked}
                                className={`w-full h-full text-[11px] leading-relaxed bg-transparent border-none outline-none p-3 resize-none font-mono scrollbar-thin ${isLocked ? 'text-gray-600' : 'nodrag text-gray-800 bg-white hover:bg-blue-50/10 focus:bg-blue-50/10 transition-colors'}`}
                                placeholder="• TABLE_NAME_1&#13;&#10;• TABLE_NAME_2"
                                spellCheck={false}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Connection Handles */}
            <ScreenHandles />
        </div>
    );
};

const ScreenHandles = memo(() => (
    <>
        <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-50" style={{ top: -8 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-50" style={{ bottom: -8 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-50" style={{ left: -8 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-50" style={{ right: -8 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
    </>
));

export default memo(ScreenNode);
