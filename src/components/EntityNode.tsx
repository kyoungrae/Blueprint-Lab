import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps, useStore } from 'reactflow';
import type { Entity, Attribute } from '../types/erd';
import { Database, Eye, Key, Link, Plus, Trash2, X, Lock, Unlock, GripVertical } from 'lucide-react';
import { useERDStore } from '../store/erdStore';
import { useProjectStore } from '../store/projectStore';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';
import type { DBType } from '../types/erd';
import { EntityLockBadge, useEntityLock } from './collaboration';
import PremiumTooltip from './screenNode/PremiumTooltip';
import { useConnectionViewStore, columnHandleId } from '../store/connectionViewStore';

/**
 * 컬럼 단위 연결 핸들 — '컬럼설정으로 보기' 모드에서 각 컬럼 행 좌/우에 표시.
 * 각 변(side)마다 source/target 핸들을 같은 id로 겹쳐 둬서 양방향 연결을 허용.
 * 부모 행(div)에는 position:relative 가 적용되어 있어 top:50% 가 행 중앙을 가리킴.
 */
const ColumnRowHandles: React.FC<{ attrId: string }> = ({ attrId }) => {
    const connectedHandleIds = useConnectionViewStore((s) => s.connectedHandleIds);
    return (
    <>
        {(['left', 'right'] as const).map((side) => {
            const pos = side === 'left' ? Position.Left : Position.Right;
            const edgeOffset = side === 'left' ? { left: -7 } : { right: -7 };
            const id = columnHandleId(attrId, side);
            const isConnected = connectedHandleIds.has(id);
            return (
                <React.Fragment key={side}>
                    <Handle
                        type="source"
                        position={pos}
                        id={id}
                        className="!bg-transparent !border-none flex items-center justify-center !cursor-pointer group/colh"
                        style={{ top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, zIndex: 60, ...edgeOffset }}
                    >
                        {/* 연결된 컬럼이면 항상 표시, 아니면 행 hover 시에만 표시 (hover 중에는 연결 드래그 가능) */}
                        <div
                            className={`w-2.5 h-2.5 bg-purple-500 border-2 border-white rounded-full shadow-sm pointer-events-none transition-all group-hover/colh:scale-150 ${isConnected ? 'opacity-100' : 'opacity-0 group-hover/attr:opacity-100'}`}
                        />
                    </Handle>
                    <Handle
                        type="target"
                        position={pos}
                        id={id}
                        className="!bg-transparent !border-none"
                        style={{ top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, zIndex: 59, ...edgeOffset }}
                    />
                </React.Fragment>
            );
        })}
    </>
    );
};

const DATA_TYPES: Record<DBType, string[]> = {
    MySQL: [
        // 정수
        'TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT',
        // 실수
        'FLOAT', 'DOUBLE', 'DECIMAL',
        // 비트
        'BIT', 'BOOLEAN',
        // 문자
        'CHAR', 'VARCHAR',
        'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT',
        // 이진
        'BINARY', 'VARBINARY',
        'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB',
        // 날짜/시간
        'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR',
        // 기타
        'ENUM', 'SET', 'JSON',
    ],
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
    isDragOver?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
}

const AttributeRow: React.FC<AttributeRowProps> = memo(({ attr, isLocked, isSelected, availableTypes, onUpdate, onDelete, isDragOver, onDragStart, onDragEnd, onDragOver, onDrop }) => {
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

    // 공통 행 스타일 — CSS subgrid로 부모 grid 트랙 상속
    const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1 / -1', alignItems: 'center', position: 'relative' };
    const isColumnMode = useConnectionViewStore((s) => s.mode === 'column');
    const rowCls = `nodrag group/attr rounded cursor-default transition-colors h-[28px] ${isDragOver ? 'border-t-2 border-blue-400' : 'border-t-2 border-transparent'} ${isLocked ? 'hover:bg-gray-50' : 'hover:bg-blue-50'}`;

    if (!isSelected) {
        return (
            <div
                style={rowStyle}
                className={rowCls}
                onMouseDown={(e) => !isLocked && e.stopPropagation()}
                onDragOver={onDragOver}
                onDrop={onDrop}
            >
                {/* Col 1: Grip — 이 아이콘을 드래그해야만 컬럼 순서 변경 */}
                <div className="flex justify-center">
                    {!isLocked && (
                        <div
                            className="opacity-0 group-hover/attr:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                            draggable
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <GripVertical size={13} className="text-gray-300" />
                        </div>
                    )}
                </div>
                {/* Col 2: PK */}
                <div className="flex justify-center">
                    <span className={`p-1 rounded ${attr.isPK ? 'text-yellow-500 bg-yellow-50' : 'text-gray-300'}`}>
                        <Key size={14} />
                    </span>
                </div>
                {/* Col 3: Name */}
                <div className="px-1.5 flex items-center h-full">
                    <span className={`text-sm whitespace-nowrap ${attr.isPK ? 'font-bold underline text-blue-900' : 'text-gray-700'}`}>
                        {attr.name}
                    </span>
                </div>
                {/* Col 4: Type */}
                <div className="flex items-center">
                    <span className={`text-sm whitespace-nowrap ${isLocked ? 'text-gray-400' : 'text-blue-600'}`}>
                        {attr.type.split('(')[0]}
                    </span>
                </div>
                {/* Col 5: Length */}
                <div className="pr-2">
                    <span className={`text-sm px-1 ${isLocked ? 'text-gray-400' : 'text-blue-500'}`}>
                        {attr.length || ''}
                    </span>
                </div>
                {/* Col 6: NN */}
                <div className="flex items-center justify-center gap-1">
                    <div className={`relative w-6 h-3.5 rounded-full flex items-center px-0.5 ${!attr.isNullable ? 'bg-red-500' : 'bg-gray-200'} ${isLocked ? 'opacity-40' : ''}`}>
                        <div className={`w-2.5 h-2.5 bg-white rounded-full shadow-sm ${!attr.isNullable ? 'translate-x-2.5' : 'translate-x-0'}`} />
                    </div>
                    <span className={`text-sm font-black tracking-tighter ${!attr.isNullable ? 'text-red-500' : 'text-gray-300'}`}>NN</span>
                </div>
                {/* Col 7: Comment */}
                <div className="flex items-center px-1 bg-gray-50/30 rounded h-[22px]">
                    {attr.comment && <span className="text-sm text-blue-500 italic whitespace-nowrap">{attr.comment}</span>}
                </div>
                {/* Col 8: FK */}
                <div className="flex justify-center">
                    <span className={`p-1 rounded ${attr.isFK ? 'text-purple-500 bg-purple-50' : 'text-gray-300'}`}>
                        <Link size={14} />
                    </span>
                </div>
                {/* Col 9: Delete placeholder */}
                <div />
                {isColumnMode && <ColumnRowHandles attrId={attr.id} />}
            </div>
        );
    }

    return (
        <div
            style={rowStyle}
            className={rowCls}
            onMouseDown={(e) => !isLocked && e.stopPropagation()}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            {/* Col 1: Grip — 이 아이콘을 드래그해야만 컬럼 순서 변경 */}
            <div className="flex justify-center">
                {!isLocked && (
                    <div
                        className="opacity-0 group-hover/attr:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <GripVertical size={13} className="text-gray-300" />
                    </div>
                )}
            </div>

            {/* Col 2: PK Toggle */}
            <div className="flex justify-center">
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

            {/* Col 3: Name — hidden span으로 그리드 트랙 크기 결정 */}
            <div className="relative">
                <span
                    className={`text-sm px-1.5 block whitespace-nowrap invisible pointer-events-none ${attr.isPK ? 'font-bold underline' : ''}`}
                    aria-hidden
                >
                    {displayValue('name', localName) || '컬럼 명'}
                </span>
                <input
                    type="text"
                    value={displayValue('name', localName)}
                    onChange={(e) => handleChange('name', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('name', (e.target as HTMLInputElement).value)}
                    onBlur={handleCommitName}
                    onKeyDown={(e) => e.key === 'Enter' && handleCommitName()}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`absolute inset-0 w-full ${!isLocked ? 'nodrag bg-blue-50/50 hover:bg-blue-50 focus:bg-white' : 'bg-transparent pointer-events-none'} border-none focus:ring-1 focus:ring-blue-100 text-sm outline-none px-1.5 rounded transition-all ${attr.isPK ? 'font-bold underline text-blue-900' : 'text-gray-700'} disabled:text-gray-600`}
                    placeholder="컬럼 명"
                    spellCheck={false}
                />
            </div>

            {/* Col 4: Type */}
            <div>
                <select
                    value={attr.type.includes('(') ? attr.type.split('(')[0] : attr.type}
                    onChange={(e) => onUpdate(attr.id, { type: e.target.value })}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`bg-transparent border-none focus:ring-0 text-sm outline-none w-full h-[28px] appearance-none overflow-hidden transition-colors ${!isLocked ? 'nodrag text-blue-600 hover:text-blue-800 cursor-pointer' : 'text-gray-400 pointer-events-none'}`}
                >
                    {availableTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
            </div>

            {/* Col 5: Length */}
            <div className="pr-2">
                <input
                    type="text"
                    value={displayValue('length', localLength)}
                    onChange={(e) => handleChange('length', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('length', (e.target as HTMLInputElement).value)}
                    onBlur={handleCommitLength}
                    onKeyDown={(e) => e.key === 'Enter' && handleCommitLength()}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`w-full h-[22px] bg-gray-50/50 border-gray-100 border rounded text-sm px-1 outline-none focus:border-blue-300 focus:bg-white transition-all ${isLocked ? 'text-gray-400 opacity-50' : 'text-blue-500'}`}
                    placeholder="len"
                />
            </div>

            {/* Col 6: NN */}
            <div className="flex items-center justify-center gap-1">
                <PremiumTooltip label={attr.isNullable ? "NULL 허용 (클릭 시 NOT NULL)" : "NOT NULL (클릭 시 NULL 허용)"} dotColor={!attr.isNullable ? '#ef4444' : undefined}>
                    <button
                        onClick={() => onUpdate(attr.id, { isNullable: !attr.isNullable })}
                        disabled={isLocked}
                        className={`relative w-6 h-3.5 rounded-full transition-colors flex items-center px-0.5 ${!attr.isNullable ? 'bg-red-500' : 'bg-gray-200'} ${isLocked ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                    >
                        <div className={`w-2.5 h-2.5 bg-white rounded-full transition-transform shadow-sm ${!attr.isNullable ? 'translate-x-2.5' : 'translate-x-0'}`} />
                    </button>
                </PremiumTooltip>
                <span className={`text-sm font-black tracking-tighter ${!attr.isNullable ? 'text-red-500' : 'text-gray-300'}`}>NN</span>
            </div>

            {/* Col 7: Comment */}
            <div className="relative flex items-center bg-gray-50/30 px-1 rounded hover:bg-gray-50">
                <span
                    className="text-sm italic block whitespace-nowrap invisible pointer-events-none"
                    aria-hidden
                >
                    {displayValue('comment', localComment) || '설명...'}
                </span>
                <input
                    type="text"
                    value={displayValue('comment', localComment)}
                    onChange={(e) => handleChange('comment', e.target.value, e)}
                    onCompositionEnd={(e) => handleCompositionEnd('comment', (e.target as HTMLInputElement).value)}
                    onBlur={handleCommitComment}
                    onKeyDown={(e) => e.key === 'Enter' && handleCommitComment()}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`absolute inset-0 w-full text-sm bg-transparent border-none focus:ring-0 px-1 outline-none italic placeholder-gray-300 transition-all ${isLocked ? 'text-gray-400' : 'text-blue-500'}`}
                    placeholder="설명..."
                />
            </div>

            {/* Col 8: FK */}
            <div className="flex justify-center">
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

            {/* Col 9: Delete */}
            <div className="flex justify-center">
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
            {isColumnMode && <ColumnRowHandles attrId={attr.id} />}
        </div>
    );
});

export interface EntityNodeData {
    entityId: string;
    entity?: Entity;
    inView?: boolean;
}

/** Lite/Full 공통 — 컬럼 행 높이를 맞추기 위한 보이지 않는 스켈레톤 */
const EntityAttributeRowSkeleton: React.FC<{ attr: Attribute; isLocked: boolean }> = ({ attr, isLocked }) => {
    const isColumnMode = useConnectionViewStore((s) => s.mode === 'column');
    return (
    <div className={`relative group/attr flex items-center gap-1 py-1 px-2 rounded ${isLocked ? 'hover:bg-gray-50' : 'hover:bg-blue-50'}`}>
        <div className="w-8 flex-shrink-0 flex justify-center">
            <span className="invisible p-1 rounded"><Key size={14} /></span>
        </div>
        <div className="shrink-0 mx-1">
            <span className="invisible text-sm px-1.5 py-0.5 block whitespace-nowrap">{attr.name || 'column'}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-20 flex-shrink-0 flex items-center h-4">
                <span className="invisible text-[10px] w-full block">type</span>
            </div>
            <div className="w-11 flex-shrink-0">
                <span className="invisible text-[9px] block">len</span>
            </div>
            <div className="w-12 flex-shrink-0 flex items-center justify-center gap-1">
                <span className="invisible text-[8px]">NN</span>
            </div>
            <div className="w-24 flex-shrink-0 flex items-center gap-1 bg-gray-50/30 px-1 rounded h-[18px]">
                <span className="invisible text-[9px]">comment</span>
            </div>
            <div className="w-8 flex-shrink-0 flex justify-center">
                <span className="invisible p-1 rounded"><Link size={14} /></span>
            </div>
            {!isLocked && <div className="w-[20px]" />}
        </div>
        {isColumnMode && <ColumnRowHandles attrId={attr.id} />}
    </div>
    );
};

/** Lite/Full 공통 — 컬럼 추가 버튼 영역 높이 */
const EntityAddAttributeSkeleton: React.FC = () => (
    <div className="w-full flex items-center justify-center gap-2 py-2 border-t-2 border-dashed border-transparent invisible pointer-events-none text-xs font-semibold">
        <Plus size={14} />
        <span>컬럼 추가</span>
    </div>
);

/** Lite 모드 — 헤더와 동일한 크기를 유지하는 보이지 않는 헤더 스켈레톤 (아이콘 제외) */
const EntityHeaderTextSkeleton: React.FC<{ entity: Entity; isLocked: boolean; isView: boolean }> = ({ entity, isLocked, isView }) => (
    <>
        {isView ? (
            <span className="invisible text-[9px] font-black uppercase tracking-wider shrink-0">VIEW</span>
        ) : null}
        <span className="invisible font-bold text-lg shrink-0 whitespace-nowrap">{entity.name || 'table'}</span>
        <span className="invisible font-bold text-lg shrink-0 whitespace-nowrap">{entity.comment || 'comment'}</span>
        <div className="invisible flex items-center gap-1 shrink-0">
            <span className="p-1"><Lock size={16} /></span>
            {!isLocked && <span className="p-1"><X size={16} /></span>}
        </div>
    </>
);

/** 줌아웃/오프스크린용 경량 플레이스홀더.
 *  EntityNode와 시각적으로 완전히 동일하나, React hook/이벤트 핸들러 없음
 *  → 100개 기준 ~500개 Zustand 구독 제거, 리렌더링 0회 */
export const EntityNodePlaceholder: React.FC<NodeProps<{ entityId: string; entity: Entity }>> = memo(({ data, selected }) => {
    const entity = data.entity;
    if (!entity) return null;

    const isLocked = entity.isLocked ?? true;
    const isView = entity.entityKind === 'VIEW';

    return (
        <div
            className={`bg-white rounded-lg shadow-xl border-2 min-w-[460px] w-max relative overflow-visible ${selected
                ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                : isLocked
                    ? 'border-gray-200 shadow-sm'
                    : isView
                        ? 'border-violet-400 shadow-violet-100'
                        : 'border-blue-500 shadow-blue-100'
                }`}
        >
            {/* ── 헤더 ── */}
            <div
                className={`px-4 py-2 flex items-center gap-2 text-white rounded-t-[calc(0.5rem-2px)] ${
                    isLocked ? 'bg-gray-400' : isView ? 'bg-gradient-to-r from-violet-500 to-purple-600' : 'bg-gradient-to-r from-blue-500 to-blue-600'
                }`}
            >
                {isView ? <Eye size={16} className="flex-shrink-0" /> : <Database size={16} className="flex-shrink-0" />}
                {isView ? (
                    <span className="text-[9px] font-black uppercase tracking-wider opacity-90 shrink-0">
                        {entity.isMaterializedView ? 'MAT VIEW' : 'VIEW'}
                    </span>
                ) : null}
                <span className="font-bold text-lg shrink-0 whitespace-nowrap">{entity.name}</span>
                <span className="font-bold text-lg shrink-0 whitespace-nowrap">{entity.comment || ''}</span>
            </div>

            {/* ── 컬럼 목록 — CSS Grid로 모든 행 정렬 ── */}
            <div
                className="px-2 pb-1 rounded-b-[calc(0.5rem-2px)]"
                style={{ display: 'grid', gridTemplateColumns: '16px 32px auto 100px 56px 48px minmax(6rem,auto) 32px 20px', gridAutoRows: '28px', alignItems: 'center' }}
            >
                {entity.attributes.map((attr) => (
                    <React.Fragment key={attr.id}>
                        {/* Col 1: grip placeholder */}
                        <div />
                        {/* Col 2: PK */}
                        <div className="flex justify-center py-0.5">
                            <span className={`p-1 rounded ${attr.isPK ? 'text-yellow-500 bg-yellow-50' : 'text-gray-300'}`}>
                                <Key size={14} />
                            </span>
                        </div>
                        {/* Col 3: Name */}
                        <div className="px-1.5 py-0.5">
                            <span className={`text-sm whitespace-nowrap ${attr.isPK ? 'font-bold underline text-blue-900' : 'text-gray-700'}`}>
                                {attr.name}
                            </span>
                        </div>
                        {/* Col 4: Type */}
                        <div>
                            <span className={`text-sm whitespace-nowrap ${isLocked ? 'text-gray-400' : 'text-blue-600'}`}>
                                {attr.type.split('(')[0]}
                            </span>
                        </div>
                        {/* Col 5: Length */}
                        <div>
                            <span className={`text-sm px-1 ${isLocked ? 'text-gray-400' : 'text-blue-500'}`}>
                                {attr.length || ''}
                            </span>
                        </div>
                        {/* Col 6: NN */}
                        <div className="flex items-center justify-center gap-1">
                            <div className={`relative w-6 h-3.5 rounded-full flex items-center px-0.5 ${!attr.isNullable ? 'bg-red-500' : 'bg-gray-200'}`}>
                                <div className={`w-2.5 h-2.5 bg-white rounded-full shadow-sm ${!attr.isNullable ? 'translate-x-2.5' : 'translate-x-0'}`} />
                            </div>
                            <span className={`text-sm font-black tracking-tighter ${!attr.isNullable ? 'text-red-500' : 'text-gray-300'}`}>NN</span>
                        </div>
                        {/* Col 7: Comment */}
                        <div className="px-1">
                            {attr.comment && <span className="text-sm text-blue-500 italic whitespace-nowrap">{attr.comment}</span>}
                        </div>
                        {/* Col 8: FK */}
                        <div className="flex justify-center">
                            <span className={`p-1 rounded ${attr.isFK ? 'text-purple-500 bg-purple-50' : 'text-gray-300'}`}>
                                <Link size={14} />
                            </span>
                        </div>
                        {/* Col 9: placeholder */}
                        <div />
                    </React.Fragment>
                ))}
            </div>

            {/* ── ReactFlow 연결 핸들 ── */}
            <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center" style={{ top: -20 }}><div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full shadow-sm pointer-events-none" /></Handle>
            <Handle type="target" position={Position.Top} id="top" className="!bg-transparent !border-none !w-4 !h-4" style={{ top: -2 }} />
            <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center" style={{ bottom: -20 }}><div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full shadow-sm pointer-events-none" /></Handle>
            <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-transparent !border-none !w-4 !h-4" style={{ bottom: -2 }} />
            <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center" style={{ left: -20 }}><div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full shadow-sm pointer-events-none" /></Handle>
            <Handle type="target" position={Position.Left} id="left" className="!bg-transparent !border-none !w-4 !h-4" style={{ left: -2 }} />
            <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center" style={{ right: -20 }}><div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full shadow-sm pointer-events-none" /></Handle>
            <Handle type="target" position={Position.Right} id="right" className="!bg-transparent !border-none !w-4 !h-4" style={{ right: -2 }} />
        </div>
    );
});

/** 줌아웃 시 단순화 모드 전환 임계값. */
const ZOOM_OUT_TO_LITE = 0.3;
/** Lite에서 Full로 복귀할 때의 임계값(경계 깜빡임 방지). */
const ZOOM_IN_TO_FULL = 0.38;
const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

const EntityNode: React.FC<NodeProps<EntityNodeData>> = ({ data, selected, id: nodeId }) => {
    const zoom = useStore(zoomSelector);
    const entityId = data.entityId ?? (data as { entity?: Entity }).entity?.id ?? nodeId;
    const modeRef = React.useRef<'lite' | 'full' | null>(null);
    if (modeRef.current === null) {
        modeRef.current = zoom < ZOOM_OUT_TO_LITE ? 'lite' : 'full';
    }
    let mode = modeRef.current;
    if (mode === 'full' && zoom < ZOOM_OUT_TO_LITE) {
        mode = 'lite';
    } else if (mode === 'lite' && zoom > ZOOM_IN_TO_FULL) {
        mode = 'full';
    }
    modeRef.current = mode;

    // ── 줌아웃 시 경량 렌더링 (store 구독·이벤트 핸들러 0개) ──
    if (mode === 'lite') {
        return <EntityNodeLite entityId={entityId} selected={selected} />;
    }

    // ── 줌인 시 전체 편집 UI ──
    return <EntityNodeFull entityId={entityId} selected={selected} nodeId={nodeId} />;
};

/** 간단 모드 — 줌에 따라 글자를 키우되 엔티티 밖으로 넘치지 않게 제한 */
function getLiteLabelScale(zoom: number) {
    return Math.min(2.4, 0.72 / Math.max(zoom, 0.22));
}

/** 줌아웃 시 사용되는 초경량 노드. 화면 디자인처럼 헤더 + 이름만 노출한다. */
const EntityNodeLite: React.FC<{ entityId: string; selected?: boolean }> = memo(({ entityId, selected }) => {
    const entity = useERDStore((s) => s.entitiesById[entityId]);
    const zoom = useStore(zoomSelector);
    if (!entity) return null;
    const isLocked = entity.isLocked ?? true;
    const isView = entity.entityKind === 'VIEW';
    const displayName = entity.name || (isView ? '새 뷰' : '새 테이블');
    const tooltipLabel = entity.comment ? `${displayName} · ${entity.comment}` : displayName;
    const labelScale = getLiteLabelScale(zoom);

    return (
        <PremiumTooltip
            label={tooltipLabel}
            forceBodyPortal
            passThroughDrag
            placement="top"
            zIndex={99999}
            wrapperClassName="block min-w-[460px] w-max"
        >
        <div
            className={`bg-white rounded-lg shadow-xl border-2 min-w-[460px] w-max relative overflow-visible ${selected
                ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                : isLocked
                    ? 'border-gray-200 shadow-sm'
                    : isView
                        ? 'border-violet-400 shadow-violet-100'
                        : 'border-blue-500 shadow-blue-100'
                }`}
            style={{ contain: 'layout style' }}
        >
            <EntityLockBadge entityId={entityId} />

            <div
                className={`px-4 py-2 flex items-center gap-2 text-white rounded-t-[calc(0.5rem-2px)] ${
                    isLocked ? 'bg-gray-400' : isView ? 'bg-gradient-to-r from-violet-500 to-purple-600' : 'bg-gradient-to-r from-blue-500 to-blue-600'
                }`}
            >
                {isView ? <Eye size={16} className="flex-shrink-0" /> : <Database size={16} className="flex-shrink-0" />}
                <EntityHeaderTextSkeleton entity={entity} isLocked={isLocked} isView={isView} />
            </div>

            <div className="relative rounded-b-[calc(0.5rem-2px)]">
                <div className="absolute inset-x-2 inset-y-0 z-[1] flex items-center justify-center pointer-events-none overflow-hidden">
                    <div
                        className="flex flex-col items-center justify-center gap-0.5 px-1"
                        style={{
                            transform: `scale(${labelScale})`,
                            transformOrigin: 'center center',
                            width: `${100 / labelScale}%`,
                        }}
                    >
                        <span className="text-[17px] font-bold leading-snug text-center text-gray-900 break-all w-full">
                            {displayName}
                        </span>
                        <span className="text-[14px] font-semibold leading-snug text-center text-gray-600 break-all w-full">
                            {entity.comment || '\u00a0'}
                        </span>
                    </div>
                </div>
                <div className="p-2 space-y-1">
                    {entity.attributes.map((attr) => (
                        <EntityAttributeRowSkeleton key={attr.id} attr={attr} isLocked={isLocked} />
                    ))}
                </div>
                {!isLocked && <EntityAddAttributeSkeleton />}
            </div>

            <PrivHandles />
        </div>
        </PremiumTooltip>
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

    // Drag-to-reorder state
    const dragIndexRef = React.useRef<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const handleAttrDragStart = (index: number) => (e: React.DragEvent) => {
        e.stopPropagation();
        dragIndexRef.current = index;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
    };

    const handleAttrDragEnd = () => {
        dragIndexRef.current = null;
        setDragOverIndex(null);
    };

    const handleAttrDragOver = (index: number) => (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
            setDragOverIndex(index);
        }
    };

    const handleAttrDrop = (index: number) => (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const from = dragIndexRef.current;
        if (from === null || from === index) {
            setDragOverIndex(null);
            return;
        }
        const currentEntity = useERDStore.getState().entitiesById[entity.id];
        if (!currentEntity) return;

        const newAttributes = [...currentEntity.attributes];
        const [moved] = newAttributes.splice(from, 1);
        newAttributes.splice(index, 0, moved);

        updateEntity(entity.id, { attributes: newAttributes });
        sendOperation({
            type: 'ATTRIBUTE_UPDATE',
            targetId: entity.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: { attributes: newAttributes },
        });

        dragIndexRef.current = null;
        setDragOverIndex(null);
    };

    if (!entity) return null;

    const isLocalLocked = entity.isLocked ?? true; // Default to locked
    const isLocked = isLocalLocked || isLockedByOther;
    const isView = entity.entityKind === 'VIEW';

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

    const handleCommentChange = (newComment: string) => {
        if (isLocked) return;
        updateEntity(entity.id, { comment: newComment });
        sendOperation({
            type: 'ENTITY_UPDATE',
            targetId: entity.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: { comment: newComment },
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

    const handleUpdateAttribute = (attrId: string, updates: Partial<Attribute>, isGranular = false) => {
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
    };

    const handleDeleteAttribute = (attrId: string, e: React.MouseEvent) => {
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
    };

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
            className={`bg-white rounded-lg shadow-xl border-2 min-w-[460px] w-max group relative overflow-visible ${isLockedByOther ? 'nodrag' : ''} ${selected
                ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                : isLocked
                    ? 'border-gray-200 shadow-sm'
                    : isView
                        ? 'border-violet-400 shadow-violet-100'
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

            <div
                className={`px-4 py-2 flex items-center gap-2 text-white rounded-t-[calc(0.5rem-2px)] ${
                    isLocked ? 'bg-gray-400' : isView ? 'bg-gradient-to-r from-violet-500 to-purple-600' : 'bg-gradient-to-r from-blue-500 to-blue-600'
                }`}
            >
                {isView ? <Eye size={16} className="flex-shrink-0" /> : <Database size={16} className="flex-shrink-0" />}
                {isView ? (
                    <span className="text-[9px] font-black uppercase tracking-wider opacity-90 shrink-0">
                        {entity.isMaterializedView ? 'MAT VIEW' : 'VIEW'}
                    </span>
                ) : null}
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
                    className={`${!isLocked ? 'nodrag bg-blue-400/20' : 'bg-transparent pointer-events-none'} border-none focus:ring-0 font-bold text-lg flex-1 min-w-0 p-0 outline-none placeholder-blue-200 rounded transition-colors disabled:text-white`}
                    placeholder="영문 테이블명"
                    spellCheck={false}
                />
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
                        handleCommentChange(v);
                    }}
                    onCompositionEnd={(e) => {
                        const v = (e.target as HTMLInputElement).value;
                        setEntityCommentComposing(null);
                        handleCommentChange(v);
                    }}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${!isLocked ? 'nodrag bg-blue-400/20' : 'bg-transparent pointer-events-none'} border-none focus:ring-0 font-bold text-lg flex-1 min-w-0 p-0 outline-none placeholder-blue-200 rounded transition-colors disabled:text-white`}
                    placeholder="한글 테이블명"
                    spellCheck={false}
                />
                <div className={`flex items-center gap-1 shrink-0 ${isLocked ? 'pointer-events-none opacity-0 group-hover:opacity-100' : ''}`}>
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

            {/* CSS Grid — subgrid로 모든 행의 컬럼 위치를 동기화 */}
            <div
                className="px-2 pb-1 rounded-b-[calc(0.5rem-2px)]"
                style={{ display: 'grid', gridTemplateColumns: '16px 32px auto 100px 56px 48px minmax(6rem,auto) 32px 20px', gridAutoRows: '28px', alignItems: 'center' }}
            >
                {entity.attributes.map((attr, index) => (
                    <AttributeRow
                        key={attr.id}
                        attr={attr}
                        isLocked={isLocked}
                        isSelected={selected ?? false}
                        availableTypes={availableTypes}
                        onUpdate={handleUpdateAttribute}
                        onDelete={handleDeleteAttribute}
                        isDragOver={dragOverIndex === index}
                        onDragStart={handleAttrDragStart(index)}
                        onDragEnd={handleAttrDragEnd}
                        onDragOver={handleAttrDragOver(index)}
                        onDrop={handleAttrDrop(index)}
                    />
                ))}
            </div>

            {!isLocked && (
                <PremiumTooltip label="컬럼 추가" wrapperClassName="w-full">
                    <button
                        onClick={handleAddAttribute}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="nodrag w-full flex items-center justify-center gap-2 py-2 border-t-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition-all text-xs font-semibold rounded-b-[calc(0.5rem-2px)]"
                    >
                        <Plus size={14} />
                        컬럼 추가
                    </button>
                </PremiumTooltip>
            )}

            <PrivHandles />
        </div>
    );
});

const PrivHandles = () => (
    <>
        <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center !cursor-pointer group/handle" style={{ top: -20, zIndex: 999 }}>
            <div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none opacity-0 group-hover/handle:opacity-100 group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
        <Handle type="target" position={Position.Top} id="top" className="!bg-transparent !border-none !w-4 !h-4" style={{ top: -2, zIndex: 998 }} />

        <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center !cursor-pointer group/handle" style={{ bottom: -20, zIndex: 999 }}>
            <div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none opacity-0 group-hover/handle:opacity-100 group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
        <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-transparent !border-none !w-4 !h-4" style={{ bottom: -2, zIndex: 998 }} />

        <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center !cursor-pointer group/handle" style={{ left: -20, zIndex: 999 }}>
            <div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none opacity-0 group-hover/handle:opacity-100 group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
        <Handle type="target" position={Position.Left} id="left" className="!bg-transparent !border-none !w-4 !h-4" style={{ left: -2, zIndex: 998 }} />

        <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-none !w-10 !h-10 flex items-center justify-center !cursor-pointer group/handle" style={{ right: -20, zIndex: 999 }}>
            <div className="w-4 h-4 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none opacity-0 group-hover/handle:opacity-100 group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
        <Handle type="target" position={Position.Right} id="right" className="!bg-transparent !border-none !w-4 !h-4" style={{ right: -2, zIndex: 998 }} />
    </>
);

export default memo(EntityNode);
