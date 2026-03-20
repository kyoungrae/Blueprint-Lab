import React, { memo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps, useStore } from 'reactflow';
import type { Entity, Attribute } from '../types/erd';
import { Database, Key, Link, Plus, Trash2, X, Lock, Unlock, MessageSquare } from 'lucide-react';
import { useERDStore } from '../store/erdStore';
import { useProjectStore } from '../store/projectStore';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';
import type { DBType } from '../types/erd';
import { EntityLockBadge, useEntityLock } from './collaboration';
import PremiumTooltip from './screenNode/PremiumTooltip';

const DATA_TYPES: Record<DBType, string[]> = {
    MySQL: ['INT', 'BIGINT', 'VARCHAR', 'TEXT', 'DATETIME', 'DATE', 'DECIMAL', 'ENUM', 'JSON', 'BOOLEAN', 'TINYINT', 'BLOB'],
    PostgreSQL: ['INTEGER', 'BIGINT', 'VARCHAR', 'TEXT', 'TIMESTAMP', 'DATE', 'NUMERIC', 'BOOLEAN', 'UUID', 'JSONB', 'BYTEA', 'SERIAL'],
    Oracle: ['NUMBER', 'VARCHAR2', 'CLOB', 'DATE', 'TIMESTAMP', 'RAW', 'BLOB', 'CHAR'],
    MSSQL: ['INT', 'BIGINT', 'VARCHAR', 'NVARCHAR', 'TEXT', 'DATETIME', 'DATE', 'DECIMAL', 'BIT', 'UNIQUEIDENTIFIER', 'IMAGE']
};

interface AttributeRowProps {
    attr: Attribute;
    isLocked: boolean;
    isSelected: boolean;
    availableTypes: string[];
    onUpdate: (attrId: string, updates: Partial<Attribute>, granular?: boolean) => void;
    onDelete: (attrId: string, e: React.MouseEvent) => void;
}

const AttributeRow: React.FC<AttributeRowProps> = memo(({ attr, isLocked, isSelected, availableTypes, onUpdate, onDelete }) => {
    const [localName, setLocalName] = useState(attr.name);
    const [localComment, setLocalComment] = useState(attr.comment || '');
    const [localLength, setLocalLength] = useState(attr.length || '');
    const [composing, setComposing] = useState<{ field: string; value: string } | null>(null);
    const displayValue = (field: string, propValue: string) =>
        composing?.field === field ? composing.value : propValue;

    // Sync local state when external data changes (but not while typing)
    useEffect(() => {
        setLocalName(attr.name);
    }, [attr.name]);

    useEffect(() => {
        setLocalComment(attr.comment || '');
    }, [attr.comment]);

    useEffect(() => {
        setLocalLength(attr.length || '');
    }, [attr.length]);

    const handleCommitName = () => {
        if (localName !== attr.name) {
            onUpdate(attr.id, { name: localName }, true);
        }
    };

    const handleCommitComment = () => {
        if (localComment !== (attr.comment || '')) {
            onUpdate(attr.id, { comment: localComment }, true);
        }
    };

    const handleCommitLength = () => {
        if (localLength !== (attr.length || '')) {
            onUpdate(attr.id, { length: localLength }, true);
        }
    };

    const handleChange = (field: 'name' | 'comment' | 'length', value: string, e: React.ChangeEvent<HTMLInputElement>) => {
        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
            setComposing({ field, value });
            return;
        }
        setComposing(null);
        if (field === 'name') setLocalName(value);
        else if (field === 'comment') setLocalComment(value);
        else setLocalLength(value);
    };

    const handleCompositionEnd = (field: 'name' | 'comment' | 'length', value: string) => {
        setComposing(null);
        if (field === 'name') setLocalName(value);
        else if (field === 'comment') setLocalComment(value);
        else setLocalLength(value);
    };

    if (!isSelected) {
        return (
            <div className={`flex items-center gap-1 py-1 px-2 rounded group/attr relative cursor-default ${isLocked ? 'hover:bg-gray-50' : 'hover:bg-blue-50'}`}>
                <div className="w-8 flex-shrink-0 flex justify-center">
                    <span className={`p-1 rounded ${attr.isPK ? 'text-yellow-500 bg-yellow-50' : 'text-gray-300'}`}>
                        <Key size={14} />
                    </span>
                </div>
                <div className="flex-1 min-w-0 mx-1">
                    <span className={`text-sm px-1.5 py-0.5 block truncate ${attr.isPK ? 'font-bold underline text-blue-900' : 'text-gray-700'}`}>
                        {attr.name}
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-16 flex-shrink-0 flex items-center h-4">
                        <span className={`text-[10px] w-full block truncate ${isLocked ? 'text-gray-400' : 'text-blue-600'}`}>
                            {attr.type.split('(')[0]}
                        </span>
                    </div>
                    <div className="w-10 flex-shrink-0">
                        <span className={`block w-full text-[9px] px-1 py-0.5 border border-transparent truncate ${isLocked ? 'text-gray-400' : 'text-blue-500'}`}>
                            {attr.length || ''}
                        </span>
                    </div>
                    <div className="w-12 flex-shrink-0 flex items-center justify-center gap-1">
                        <div className={`relative w-6 h-3.5 rounded-full flex items-center px-0.5 ${!attr.isNullable ? 'bg-red-500' : 'bg-gray-200'} ${isLocked ? 'opacity-40' : ''}`}>
                            <div className={`w-2.5 h-2.5 bg-white rounded-full shadow-sm ${!attr.isNullable ? 'translate-x-2.5' : 'translate-x-0'}`} />
                        </div>
                        <span className={`text-[8px] font-black tracking-tighter ${!attr.isNullable ? 'text-red-500' : 'text-gray-300'}`}>NN</span>
                    </div>
                    <div className="w-24 flex-shrink-0 flex items-center gap-1 bg-gray-50/30 px-1 rounded h-[18px]">
                        {attr.comment && <><MessageSquare size={11} className="shrink-0 text-blue-400" /><span className="text-[9px] text-blue-500 italic truncate">{attr.comment}</span></>}
                    </div>
                    <div className="w-8 flex-shrink-0 flex justify-center">
                        <span className={`p-1 rounded ${attr.isFK ? 'text-purple-500 bg-purple-50' : 'text-gray-300'}`}>
                            <Link size={14} />
                        </span>
                    </div>
                    {!isLocked && <div className="w-[20px]" />}
                </div>
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-1 py-1 px-2 rounded group/attr transition-colors relative cursor-default ${!isLocked ? 'hover:bg-blue-50' : 'hover:bg-gray-50'}`}>
            {/* PK Icon/Toggle */}
            <div className="w-8 flex-shrink-0 flex justify-center">
                <PremiumTooltip label={attr.isPK ? "기본 키 (클릭 해제)" : "기본 키 (클릭 설정)"} dotColor="#eab308">
                    <button
                        onClick={() => onUpdate(attr.id, { isPK: !attr.isPK })}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`${!isLocked ? 'nodrag' : 'pointer-events-auto cursor-grab'} p-1 rounded transition-colors ${attr.isPK ? 'text-yellow-500 bg-yellow-50' : 'text-gray-300 hover:text-gray-400'}`}
                    >
                        <Key size={14} />
                    </button>
                </PremiumTooltip>
            </div>

            {/* Name Input - Local state buffering */}
            <div className="flex-1 min-w-0 mx-1">
                <input
                    type="text"
                    value={displayValue('name', localName)}
                    onChange={(e) => handleChange('name', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('name', (e.target as HTMLInputElement).value)}
                    onBlur={handleCommitName}
                    onKeyDown={(e) => e.key === 'Enter' && handleCommitName()}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${!isLocked ? 'nodrag bg-blue-50/50 hover:bg-blue-50 focus:bg-white' : 'bg-transparent pointer-events-none'} w-full border-none focus:ring-1 focus:ring-blue-100 text-sm outline-none px-1.5 py-0.5 rounded transition-all ${attr.isPK ? 'font-bold underline text-blue-900' : 'text-gray-700'} disabled:text-gray-600`}
                    placeholder="컬럼 명"
                    spellCheck={false}
                />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
                {/* Type Column */}
                <div className="w-16 flex-shrink-0">
                    <select
                        value={attr.type.includes('(') ? attr.type.split('(')[0] : attr.type}
                        onChange={(e) => onUpdate(attr.id, { type: e.target.value })}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`bg-transparent border-none focus:ring-0 text-[10px] outline-none w-full appearance-none transition-colors ${!isLocked ? 'nodrag text-blue-600 hover:text-blue-800 cursor-pointer' : 'text-gray-400 pointer-events-none'}`}
                    >
                        {availableTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>

                {/* Length Column */}
                <div className="w-10 flex-shrink-0">
                    <input
                        type="text"
                        value={displayValue('length', localLength)}
                        onChange={(e) => handleChange('length', e.target.value, e)}
                        onCompositionEnd={(e) => handleCompositionEnd('length', (e.target as HTMLInputElement).value)}
                        onBlur={handleCommitLength}
                        onKeyDown={(e) => e.key === 'Enter' && handleCommitLength()}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`w-full bg-gray-50/50 border-gray-100 border rounded text-[9px] px-1 py-0.5 outline-none focus:border-blue-300 focus:bg-white transition-all ${isLocked ? 'text-gray-400 opacity-50' : 'text-blue-500'}`}
                        placeholder="len"
                    />
                </div>

                {/* NN Toggle */}
                <div className="w-12 flex-shrink-0 flex items-center justify-center gap-1">
                    <PremiumTooltip label={attr.isNullable ? "NULL 허용 (클릭 시 NOT NULL)" : "NOT NULL (클릭 시 NULL 허용)"} dotColor={!attr.isNullable ? '#ef4444' : undefined}>
                        <button
                            onClick={() => onUpdate(attr.id, { isNullable: !attr.isNullable })}
                            disabled={isLocked}
                            className={`relative w-6 h-3.5 rounded-full transition-colors flex items-center px-0.5 ${!attr.isNullable ? 'bg-red-500' : 'bg-gray-200'} ${isLocked ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                        >
                            <div className={`w-2.5 h-2.5 bg-white rounded-full transition-transform shadow-sm ${!attr.isNullable ? 'translate-x-2.5' : 'translate-x-0'}`} />
                        </button>
                    </PremiumTooltip>
                    <span className={`text-[8px] font-black tracking-tighter ${!attr.isNullable ? 'text-red-500' : 'text-gray-300'}`}>NN</span>
                </div>

                {/* Comment Column */}
                <div className="w-24 flex-shrink-0 flex items-center gap-1 group/cmt bg-gray-50/30 px-1 rounded transition-all hover:bg-gray-50">
                    <MessageSquare size={11} className={`shrink-0 ${attr.comment ? 'text-blue-400' : 'text-gray-200'}`} />
                    <input
                        type="text"
                        value={displayValue('comment', localComment)}
                        onChange={(e) => handleChange('comment', e.target.value, e)}
                        onCompositionEnd={(e) => handleCompositionEnd('comment', (e.target as HTMLInputElement).value)}
                        onBlur={handleCommitComment}
                        onKeyDown={(e) => e.key === 'Enter' && handleCommitComment()}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`text-[9px] bg-transparent border-none focus:ring-0 p-0 outline-none italic placeholder-gray-300 w-full transition-all ${isLocked ? 'text-gray-400' : 'text-blue-500'}`}
                        placeholder="설명..."
                    />
                </div>

                {/* FK Toggle */}
                <div className="w-8 flex-shrink-0 flex justify-center">
                    <PremiumTooltip label={attr.isFK ? "외래 키 (클릭 해제)" : "외래 키 (클릭 설정)"} dotColor="#a855f7">
                        <button
                            onClick={() => onUpdate(attr.id, { isFK: !attr.isFK })}
                            onMouseDown={(e) => !isLocked && e.stopPropagation()}
                            disabled={isLocked}
                            className={`${!isLocked ? 'nodrag' : 'pointer-events-auto cursor-grab'} p-1 rounded transition-colors ${attr.isFK ? 'text-purple-500 bg-purple-50' : 'text-gray-300'}`}
                        >
                            <Link size={14} />
                        </button>
                    </PremiumTooltip>
                </div>

                {/* Delete Column */}
                {!isLocked && (
                    <PremiumTooltip label="컬럼 삭제" dotColor="#ef4444">
                        <button
                            onClick={(e) => onDelete(attr.id, e)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="nodrag opacity-0 group-hover/attr:opacity-100 transition-opacity p-1 text-red-300 hover:text-red-500"
                        >
                            <Trash2 size={12} />
                        </button>
                    </PremiumTooltip>
                )}
            </div>
        </div>
    );
});

export interface EntityNodeData {
    entityId: string;
    entity?: Entity;
    inView?: boolean;
}

/** 줌아웃/오프스크린용 경량 플레이스홀더.
 *  EntityNode와 시각적으로 완전히 동일하나, React hook/이벤트 핸들러 없음
 *  → 100개 기준 ~500개 Zustand 구독 제거, 리렌더링 0회 */
export const EntityNodePlaceholder: React.FC<NodeProps<{ entityId: string; entity: Entity }>> = memo(({ data, selected }) => {
    const entity = data.entity;
    if (!entity) return null;

    const isLocked = entity.isLocked ?? true;

    return (
        <div
            className={`bg-white rounded-lg shadow-xl border-2 min-w-[300px] relative overflow-visible ${selected
                ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                : isLocked
                    ? 'border-gray-200 shadow-sm'
                    : 'border-blue-500 shadow-blue-100'
                }`}
        >
            {/* ── 헤더 ── */}
            <div className={`px-4 py-2 flex items-center gap-2 text-white rounded-t-[calc(0.5rem-2px)] ${isLocked ? 'bg-gray-400' : 'bg-gradient-to-r from-blue-500 to-blue-600'}`}>
                <Database size={16} className="flex-shrink-0" />
                <span className="font-bold text-lg flex-1 truncate">{entity.name}</span>
            </div>

            {/* ── 테이블 설명 (있을 때만) ── */}
            {entity.comment && (
                <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <MessageSquare size={12} className="text-gray-400 shrink-0" />
                    <span className="text-[11px] italic text-gray-400 truncate">{entity.comment}</span>
                </div>
            )}

            {/* ── 컬럼 목록 (span으로 정적 표시 — input 없음) ── */}
            <div className="p-2 space-y-1 rounded-b-[calc(0.5rem-2px)]">
                {entity.attributes.map((attr) => (
                    <div key={attr.id} className={`flex items-center gap-1 py-1 px-2 rounded ${isLocked ? 'hover:bg-gray-50' : 'hover:bg-blue-50'}`}>
                        {/* PK */}
                        <div className="w-8 flex-shrink-0 flex justify-center">
                            <span className={`p-1 rounded ${attr.isPK ? 'text-yellow-500 bg-yellow-50' : 'text-gray-300'}`}>
                                <Key size={14} />
                            </span>
                        </div>
                        {/* 컬럼명 */}
                        <div className="flex-1 min-w-0 mx-1">
                            <span className={`text-sm px-1.5 py-0.5 block truncate ${attr.isPK ? 'font-bold underline text-blue-900' : 'text-gray-700'}`}>
                                {attr.name}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {/* 타입 */}
                            <div className="w-16 flex-shrink-0">
                                <span className={`text-[10px] ${isLocked ? 'text-gray-400' : 'text-blue-600'}`}>
                                    {attr.type.split('(')[0]}{attr.length ? `(${attr.length})` : ''}
                                </span>
                            </div>
                            {/* NN (표시만) */}
                            <div className="w-12 flex-shrink-0 flex items-center justify-center gap-1">
                                <div className={`relative w-6 h-3.5 rounded-full flex items-center px-0.5 ${!attr.isNullable ? 'bg-red-500' : 'bg-gray-200'}`}>
                                    <div className={`w-2.5 h-2.5 bg-white rounded-full shadow-sm ${!attr.isNullable ? 'translate-x-2.5' : 'translate-x-0'}`} />
                                </div>
                                <span className={`text-[8px] font-black tracking-tighter ${!attr.isNullable ? 'text-red-500' : 'text-gray-300'}`}>NN</span>
                            </div>
                            {/* 코멘트 */}
                            <div className="w-24 flex-shrink-0 flex items-center gap-1 px-1">
                                {attr.comment && <><MessageSquare size={11} className="shrink-0 text-blue-400" /><span className="text-[9px] text-blue-500 italic truncate">{attr.comment}</span></>}
                            </div>
                            {/* FK */}
                            <div className="w-8 flex-shrink-0 flex justify-center">
                                <span className={`p-1 rounded ${attr.isFK ? 'text-purple-500 bg-purple-50' : 'text-gray-300'}`}>
                                    <Link size={14} />
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── ReactFlow 연결 핸들 ── */}
            <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center" style={{ top: -20 }}><div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full shadow-sm pointer-events-none" /></Handle>
            <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center" style={{ bottom: -20 }}><div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full shadow-sm pointer-events-none" /></Handle>
            <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center" style={{ left: -20 }}><div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full shadow-sm pointer-events-none" /></Handle>
            <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center" style={{ right: -20 }}><div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full shadow-sm pointer-events-none" /></Handle>
        </div>
    );
});

/** 줌아웃 임계값 — 이 줌 레벨 이하에서는 무거운 편집 UI 대신 경량 Placeholder를 렌더링한다.
 *  100개 노드 기준 Zustand 구독 500개 → 0으로 줄여 패닝/줌 시 프레임 드랍 완전 제거. */
const ZOOM_THRESHOLD = 0.35;
const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

const EntityNode: React.FC<NodeProps<EntityNodeData>> = ({ data, selected, id: nodeId }) => {
    const zoom = useStore(zoomSelector);
    const entityId = data.entityId ?? (data as { entity?: Entity }).entity?.id ?? nodeId;

    // ── 줌아웃 시 경량 렌더링 (store 구독·이벤트 핸들러 0개) ──
    if (zoom < ZOOM_THRESHOLD) {
        return <EntityNodeLite entityId={entityId} selected={selected} />;
    }

    // ── 줌인 시 전체 편집 UI ──
    return <EntityNodeFull entityId={entityId} selected={selected} nodeId={nodeId} />;
};

/** 줌아웃 시 사용되는 초경량 노드. Zustand 구독 1개(entity 데이터), useEffect 0개. */
const EntityNodeLite: React.FC<{ entityId: string; selected?: boolean }> = memo(({ entityId, selected }) => {
    const entity = useERDStore((s) => s.entitiesById[entityId]);
    if (!entity) return null;
    const isLocked = entity.isLocked ?? true;

    // 이 노드는 EntityNodeFull의 isLocked 상태(또는 렌더링 구조)와 레이아웃(높이)이 완전히 동일해야 덜컹거리지 않습니다.
    return (
        <div
            className={`bg-white rounded-lg shadow-xl border-2 min-w-[300px] group relative overflow-visible ${selected
                ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                : isLocked
                    ? 'border-gray-200 shadow-sm'
                    : 'border-blue-500 shadow-blue-100'
                }`}
            style={{ contain: 'layout style paint' }}
        >
            <EntityLockBadge entityId={entityId} />

            <div className={`px-4 py-2 flex items-center gap-2 text-white rounded-t-[calc(0.5rem-2px)] ${isLocked ? 'bg-gray-400' : 'bg-gradient-to-r from-blue-500 to-blue-600'}`}>
                <Database size={16} className="flex-shrink-0" />
                {/* Full의 input과 동일한 구조/크기 */}
                <span className={`${!isLocked ? 'nodrag bg-blue-400/20' : 'bg-transparent'} border-none font-bold text-lg w-full p-0 block truncate`}>
                    {entity.name}
                </span>
                <div className={`flex items-center gap-1 ${isLocked ? 'pointer-events-none opacity-0' : ''}`}>
                    <div className="nodrag p-1 rounded-md text-white pointer-events-none">
                        {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                    </div>
                </div>
            </div>

            {(!isLocked || entity.comment) && (
                <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <MessageSquare size={12} className="text-gray-400 shrink-0" />
                    <span className={`text-[11px] w-full bg-transparent p-0 italic block truncate ${isLocked ? 'text-gray-400' : 'text-blue-600'}`}>
                        {entity.comment}
                    </span>
                </div>
            )}

            <div className="p-2 space-y-1 rounded-b-[calc(0.5rem-2px)]">
                {entity.attributes.map((attr) => (
                    <div key={attr.id} className={`flex items-center gap-1 py-1 px-2 rounded group/attr relative cursor-default ${!isLocked ? 'hover:bg-blue-50' : 'hover:bg-gray-50'}`}>
                        {/* PK Icon/Toggle */}
                        <div className="w-8 flex-shrink-0 flex justify-center">
                            <span className={`p-1 rounded ${attr.isPK ? 'text-yellow-500 bg-yellow-50' : 'text-gray-300'}`}>
                                <Key size={14} />
                            </span>
                        </div>

                        {/* Name Input equivalent */}
                        <div className="flex-1 min-w-0 mx-1">
                            <span className={`w-full text-sm px-1.5 py-0.5 rounded block truncate ${attr.isPK ? 'font-bold underline text-blue-900' : 'text-gray-700'}`}>
                                {attr.name}
                            </span>
                        </div>

                        <div className="flex flex-nowrap items-center gap-2 flex-shrink-0">
                            {/* Type Column equivalent */}
                            <div className="w-16 flex-shrink-0 flex items-center h-4">
                                <span className={`text-[10px] w-full block truncate ${!isLocked ? 'text-blue-600' : 'text-gray-400'}`}>
                                    {attr.type.split('(')[0]}
                                </span>
                            </div>

                            {/* Length Column equivalent (렌더링은 input과 동일한 높이/크기로 빈공간 유지) */}
                            <div className="w-10 flex-shrink-0">
                                <span className={`block w-full text-[9px] px-1 py-0.5 border border-transparent truncate ${isLocked ? 'text-gray-400' : 'text-blue-500'}`}>
                                    {attr.length || ''}
                                </span>
                            </div>

                            {/* NN Toggle equivalent */}
                            <div className="w-12 flex-shrink-0 flex items-center justify-center gap-1">
                                <div className={`relative w-6 h-3.5 rounded-full flex items-center px-0.5 ${!attr.isNullable ? 'bg-red-500' : 'bg-gray-200'} ${isLocked ? 'opacity-40' : ''}`}>
                                    <div className={`w-2.5 h-2.5 bg-white rounded-full shadow-sm ${!attr.isNullable ? 'translate-x-2.5' : 'translate-x-0'}`} />
                                </div>
                                <span className={`text-[8px] font-black tracking-tighter ${!attr.isNullable ? 'text-red-500' : 'text-gray-300'}`}>NN</span>
                            </div>

                            {/* Comment Column equivalent */}
                            <div className="w-24 flex-shrink-0 flex items-center gap-1 bg-gray-50/30 px-1 rounded h-[18px]">
                                <MessageSquare size={11} className={`shrink-0 ${attr.comment ? 'text-blue-400' : 'text-gray-200'}`} />
                                <span className={`text-[9px] p-0 italic w-full truncate ${isLocked ? 'text-gray-400' : 'text-blue-500'}`}>
                                    {attr.comment}
                                </span>
                            </div>

                            {/* FK Toggle equivalent */}
                            <div className="w-8 flex-shrink-0 flex justify-center">
                                <span className={`p-1 rounded ${attr.isFK ? 'text-purple-500 bg-purple-50' : 'text-gray-300'}`}>
                                    <Link size={14} />
                                </span>
                            </div>

                            {/* Delete Column padding equivalent to maintain layout */}
                            {!isLocked && (
                                <div className="w-[20px]" />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {!isLocked && (
                <div className="px-2 pb-2">
                    <div className="w-full flex items-center justify-center gap-2 py-1.5 border-2 border-dashed border-gray-200 rounded text-gray-400 text-xs font-medium">
                        <Plus size={14} />
                        컬럼 추가
                    </div>
                </div>
            )}

            <PrivHandles />
        </div>
    );
});

/** 줌인 시 사용되는 전체 편집 가능 노드. */
const EntityNodeFull: React.FC<{ entityId: string; selected?: boolean; nodeId: string }> = memo(({ entityId, selected }) => {
    const entity = useERDStore((s) => s.entitiesById[entityId]);
    const updateEntity = useERDStore((s) => s.updateEntity);
    const deleteEntity = useERDStore((s) => s.deleteEntity);
    const dbType = useProjectStore((s) => {
        const p = s.projects.find((x) => x.id === s.currentProjectId);
        return (p?.dbType ?? 'MySQL') as DBType;
    });
    const sendOperation = useSyncStore((s) => s.sendOperation);
    const user = useAuthStore((s) => s.user);
    const availableTypes = DATA_TYPES[dbType];
    const { isLockedByOther, lockedBy, requestLock, releaseLock } = useEntityLock(entityId);
    const [entityNameComposing, setEntityNameComposing] = useState<string | null>(null);
    const [entityCommentComposing, setEntityCommentComposing] = useState<string | null>(null);

    if (!entity) return null;

    const isLocalLocked = entity.isLocked ?? true; // Default to locked
    const isLocked = isLocalLocked || isLockedByOther;

    const handleNameChange = (newName: string) => {
        if (isLocked) return;
        updateEntity(entity.id, { name: newName });

        sendOperation({
            type: 'ENTITY_UPDATE',
            targetId: entity.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: { name: newName }
        });
    };

    const handleToggleLock = (e: React.MouseEvent) => {
        e.stopPropagation();

        if (isLockedByOther) {
            alert(`Locked by ${lockedBy}`);
            return;
        }

        const newLockedState = !isLocalLocked;
        updateEntity(entity.id, { isLocked: newLockedState });

        sendOperation({
            type: 'ENTITY_UPDATE',
            targetId: entity.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: { isLocked: newLockedState }
        });

        if (!newLockedState) {
            requestLock();
        } else {
            releaseLock();
        }
    };

    const handleAddAttribute = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isLocked) return;
        const newAttr: Attribute = {
            id: `attr_${Date.now()}`,
            name: 'new_column',
            type: availableTypes[0] || 'VARCHAR',
            length: availableTypes[0] === 'VARCHAR' || availableTypes[0] === 'VARCHAR2' || availableTypes[0] === 'NVARCHAR' ? '255' : '',
            isPK: false,
            isFK: false,
            isNullable: true,
        };
        const newAttributes = [...entity.attributes, newAttr];
        updateEntity(entity.id, {
            attributes: newAttributes,
        });

        sendOperation({
            type: 'ATTRIBUTE_ADD',
            targetId: entity.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: { attributes: newAttributes }
        });
    };

    const handleUpdateAttribute = useCallback((attrId: string, updates: Partial<Attribute>, isGranular = false) => {
        if (isLocked) return;
        const currentEntity = useERDStore.getState().entitiesById[entity.id];
        if (!currentEntity) return;

        if (isGranular) {
            // Highly optimized granular update
            (useERDStore.getState() as any).updateAttribute(entity.id, attrId, updates, user);

            sendOperation({
                type: 'ATTRIBUTE_FIELD_UPDATE',
                targetId: entity.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: { attrId, updates }
            });
        } else {
            const newAttributes = currentEntity.attributes.map((attr) =>
                attr.id === attrId ? { ...attr, ...updates } : attr
            );
            updateEntity(entity.id, { attributes: newAttributes });

            sendOperation({
                type: 'ATTRIBUTE_UPDATE',
                targetId: entity.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: { attributes: newAttributes }
            });
        }
    }, [isLocked, entity.id, user, sendOperation, updateEntity]);

    const handleDeleteAttribute = useCallback((attrId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (isLocked) return;
        const currentEntity = useERDStore.getState().entitiesById[entity.id];
        if (!currentEntity) return;

        const newAttributes = currentEntity.attributes.filter((attr) => attr.id !== attrId);
        sendOperation({
            type: 'ATTRIBUTE_DELETE',
            targetId: entity.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: { attributes: newAttributes },
            previousState: { attributes: currentEntity.attributes },
        });
        updateEntity(entity.id, { attributes: newAttributes });
    }, [isLocked, entity.id, user, sendOperation, updateEntity]);

    const handleDeleteEntity = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`Delete entity "${entity.name}"?`)) {
            sendOperation({
                type: 'ENTITY_DELETE',
                targetId: entity.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: {},
                previousState: entity as unknown as Record<string, unknown>,
            });
            deleteEntity(entity.id);
        }
    };

    return (
        <div
            className={`bg-white rounded-lg shadow-xl border-2 min-w-[300px] group relative overflow-visible ${isLockedByOther ? 'nodrag' : ''} ${selected
                ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                : isLocked
                    ? 'border-gray-200 shadow-sm'
                    : 'border-blue-500 shadow-blue-100'
                }`}
            style={{ contain: 'layout style' }}
        >
            <EntityLockBadge entityId={entity.id} />

            {isLocalLocked && (
                <div
                    onDoubleClick={handleToggleLock}
                    className="absolute inset-0 z-[100] flex items-center justify-center cursor-pointer group/mask hover:bg-white/30 transition-all duration-300 rounded-[inherit]"
                >
                    <div className="bg-white/90 p-3 rounded-full shadow-lg border border-gray-100 opacity-0 group-hover/mask:opacity-100 transition-all transform scale-90 group-hover/mask:scale-100 flex flex-col items-center gap-1">
                        <Lock size={20} className={isLockedByOther ? "text-red-500" : "text-gray-400"} />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            {isLockedByOther ? lockedBy : "Double Click to Edit"}
                        </span>
                    </div>
                </div>
            )}

            <div className={`px-4 py-2 flex items-center gap-2 text-white rounded-t-[calc(0.5rem-2px)] ${isLocked ? 'bg-gray-400' : 'bg-gradient-to-r from-blue-500 to-blue-600'}`}>
                <Database size={16} className="flex-shrink-0" />
                <input
                    type="text"
                    value={entityNameComposing !== null ? entityNameComposing : entity.name}
                    onChange={(e) => {
                        const v = e.target.value;
                        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                            setEntityNameComposing(v);
                            return;
                        }
                        setEntityNameComposing(null);
                        handleNameChange(v);
                    }}
                    onCompositionEnd={(e) => {
                        const v = (e.target as HTMLInputElement).value;
                        setEntityNameComposing(null);
                        handleNameChange(v);
                    }}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${!isLocked ? 'nodrag bg-blue-400/20' : 'bg-transparent pointer-events-none'} border-none focus:ring-0 font-bold text-lg w-full p-0 outline-none placeholder-blue-200 rounded transition-colors disabled:text-white`}
                    placeholder="테이블 명"
                    spellCheck={false}
                />
                <div className={`flex items-center gap-1 ${isLocked ? 'pointer-events-none opacity-0 group-hover:opacity-100' : ''}`}>
                    <PremiumTooltip label={isLocked ? "잠금 해제" : "잠금"}>
                        <button onClick={handleToggleLock} onMouseDown={(e) => e.stopPropagation()} className="nodrag p-1 hover:bg-white/20 rounded-md transition-colors text-white pointer-events-auto">
                            {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                    </PremiumTooltip>
                    {!isLocked && (
                        <PremiumTooltip label="테이블 삭제" dotColor="#ef4444">
                            <button onClick={handleDeleteEntity} onMouseDown={(e) => e.stopPropagation()} className="nodrag opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500 rounded text-white">
                                <X size={16} />
                            </button>
                        </PremiumTooltip>
                    )}
                </div>
            </div>

            {(!isLocked || entity.comment) && (
                <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <MessageSquare size={12} className="text-gray-400 shrink-0" />
                    <input
                        type="text"
                        value={entityCommentComposing !== null ? entityCommentComposing : (entity.comment || '')}
                        onChange={(e) => {
                            const v = e.target.value;
                            if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                                setEntityCommentComposing(v);
                                return;
                            }
                            setEntityCommentComposing(null);
                            updateEntity(entity.id, { comment: v });
                        }}
                        onCompositionEnd={(e) => {
                            const v = (e.target as HTMLInputElement).value;
                            setEntityCommentComposing(null);
                            updateEntity(entity.id, { comment: v });
                        }}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`text-[11px] w-full bg-transparent border-none focus:ring-0 p-0 outline-none italic placeholder-gray-300 ${isLocked ? 'text-gray-400' : 'text-blue-600 focus:bg-white transition-colors'}`}
                        placeholder="테이블 설명 추가..."
                        spellCheck={false}
                    />
                </div>
            )}

            <div className="p-2 space-y-1 rounded-b-[calc(0.5rem-2px)]">
                {entity.attributes.map((attr) => (
                    <AttributeRow
                        key={attr.id}
                        attr={attr}
                        isLocked={isLocked}
                        isSelected={selected ?? false}
                        availableTypes={availableTypes}
                        onUpdate={handleUpdateAttribute}
                        onDelete={handleDeleteAttribute}
                    />
                ))}
            </div>

            {!isLocked && (
                <div className="px-2 pb-2">
                    <PremiumTooltip label="컬럼 추가">
                        <button
                            onClick={handleAddAttribute}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="nodrag w-full flex items-center justify-center gap-2 py-1.5 border-2 border-dashed border-gray-200 rounded text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition-all text-xs font-medium"
                        >
                            <Plus size={14} />
                            컬럼 추가
                        </button>
                    </PremiumTooltip>
                </div>
            )}

            <PrivHandles />
        </div>
    );
});

const PrivHandles = memo(() => (
    <>
        <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center !cursor-pointer group/handle" style={{ top: -20, zIndex: 999 }}>
            <div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
        <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center !cursor-pointer group/handle" style={{ bottom: -20, zIndex: 999 }}>
            <div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
        <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center !cursor-pointer group/handle" style={{ left: -20, zIndex: 999 }}>
            <div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
        <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center !cursor-pointer group/handle" style={{ right: -20, zIndex: 999 }}>
            <div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
    </>
));

export default memo(EntityNode);
