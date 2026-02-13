import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { Entity, Attribute } from '../types/erd';
import { Database, Key, Link, Plus, Trash2, X, Lock, Unlock, MessageSquare } from 'lucide-react';
import { useERDStore } from '../store/erdStore';
import { useProjectStore } from '../store/projectStore';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';
import type { DBType } from '../types/erd';
import { EntityLockBadge, useEntityLock } from './collaboration';

const DATA_TYPES: Record<DBType, string[]> = {
    MySQL: ['INT', 'BIGINT', 'VARCHAR', 'TEXT', 'DATETIME', 'DATE', 'DECIMAL', 'ENUM', 'JSON', 'BOOLEAN', 'TINYINT', 'BLOB'],
    PostgreSQL: ['INTEGER', 'BIGINT', 'VARCHAR', 'TEXT', 'TIMESTAMP', 'DATE', 'NUMERIC', 'BOOLEAN', 'UUID', 'JSONB', 'BYTEA', 'SERIAL'],
    Oracle: ['NUMBER', 'VARCHAR2', 'CLOB', 'DATE', 'TIMESTAMP', 'RAW', 'BLOB', 'CHAR'],
    MSSQL: ['INT', 'BIGINT', 'VARCHAR', 'NVARCHAR', 'TEXT', 'DATETIME', 'DATE', 'DECIMAL', 'BIT', 'UNIQUEIDENTIFIER', 'IMAGE']
};

interface AttributeRowProps {
    attr: Attribute;
    isLocked: boolean;
    availableTypes: string[];
    onUpdate: (updates: Partial<Attribute>, granular?: boolean) => void;
    onDelete: (e: React.MouseEvent) => void;
}

const AttributeRow: React.FC<AttributeRowProps> = memo(({ attr, isLocked, availableTypes, onUpdate, onDelete }) => {
    const [localName, setLocalName] = useState(attr.name);
    const [localComment, setLocalComment] = useState(attr.comment || '');
    const [localLength, setLocalLength] = useState(attr.length || '');

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
            onUpdate({ name: localName }, true);
        }
    };

    const handleCommitComment = () => {
        if (localComment !== (attr.comment || '')) {
            onUpdate({ comment: localComment }, true);
        }
    };

    const handleCommitLength = () => {
        if (localLength !== (attr.length || '')) {
            onUpdate({ length: localLength }, true);
        }
    };

    return (
        <div className={`flex items-center gap-1 py-1 px-2 rounded group/attr transition-colors relative cursor-default ${!isLocked ? 'hover:bg-blue-50' : 'hover:bg-gray-50'}`}>
            {/* PK Icon/Toggle */}
            <div className="w-8 flex-shrink-0 flex justify-center">
                <div className="relative group/tooltip">
                    <button
                        onClick={() => onUpdate({ isPK: !attr.isPK })}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`${!isLocked ? 'nodrag' : 'pointer-events-auto cursor-grab'} p-1 rounded transition-colors ${attr.isPK ? 'text-yellow-500 bg-yellow-50' : 'text-gray-300 hover:text-gray-400'}`}
                    >
                        <Key size={14} />
                    </button>
                </div>
            </div>

            {/* Name Input - Local state buffering */}
            <div className="flex-1 min-w-0 mx-1">
                <input
                    type="text"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
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
                        onChange={(e) => onUpdate({ type: e.target.value })}
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
                        value={localLength}
                        onChange={(e) => setLocalLength(e.target.value)}
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
                    <button
                        onClick={() => onUpdate({ isNullable: !attr.isNullable })}
                        disabled={isLocked}
                        className={`relative w-6 h-3.5 rounded-full transition-colors flex items-center px-0.5 ${!attr.isNullable ? 'bg-red-500' : 'bg-gray-200'} ${isLocked ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                    >
                        <div className={`w-2.5 h-2.5 bg-white rounded-full transition-transform shadow-sm ${!attr.isNullable ? 'translate-x-2.5' : 'translate-x-0'}`} />
                    </button>
                    <span className={`text-[8px] font-black tracking-tighter ${!attr.isNullable ? 'text-red-500' : 'text-gray-300'}`}>NN</span>
                </div>

                {/* Comment Column */}
                <div className="w-24 flex-shrink-0 flex items-center gap-1 group/cmt bg-gray-50/30 px-1 rounded transition-all hover:bg-gray-50">
                    <MessageSquare size={11} className={`shrink-0 ${attr.comment ? 'text-blue-400' : 'text-gray-200'}`} />
                    <input
                        type="text"
                        value={localComment}
                        onChange={(e) => setLocalComment(e.target.value)}
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
                    <button
                        onClick={() => onUpdate({ isFK: !attr.isFK })}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`${!isLocked ? 'nodrag' : 'pointer-events-auto cursor-grab'} p-1 rounded transition-colors ${attr.isFK ? 'text-purple-500 bg-purple-50' : 'text-gray-300'}`}
                    >
                        <Link size={14} />
                    </button>
                </div>

                {/* Delete Column */}
                {!isLocked && (
                    <button
                        onClick={onDelete}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="nodrag opacity-0 group-hover/attr:opacity-100 transition-opacity p-1 text-red-300 hover:text-red-500"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>
        </div>
    );
});

interface EntityNodeData {
    entity: Entity;
}

const EntityNode: React.FC<NodeProps<EntityNodeData>> = ({ data, selected }) => {
    const { entity } = data;
    const { updateEntity, deleteEntity } = useERDStore();
    const { projects, currentProjectId } = useProjectStore();
    const { sendOperation } = useSyncStore();
    const { user } = useAuthStore();
    const currentProject = projects.find(p => p.id === currentProjectId);
    const dbType = currentProject?.dbType || 'MySQL';
    const availableTypes = DATA_TYPES[dbType];

    const { isLockedByOther, lockedBy, requestLock, releaseLock } = useEntityLock(entity.id);
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

    const handleUpdateAttribute = (attrId: string, updates: Partial<Attribute>, isGranular = false) => {
        if (isLocked) return;

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
            const newAttributes = entity.attributes.map((attr) =>
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

    const handleDeleteAttribute = (e: React.MouseEvent, attrId: string) => {
        e.stopPropagation();
        if (isLocked) return;
        const newAttributes = entity.attributes.filter((attr) => attr.id !== attrId);
        updateEntity(entity.id, { attributes: newAttributes });

        sendOperation({
            type: 'ATTRIBUTE_DELETE',
            targetId: entity.id,
            userId: user?.id || 'anonymous',
            userName: user?.name || 'Anonymous',
            payload: { attributes: newAttributes }
        });
    };

    const handleDeleteEntity = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`Delete entity "${entity.name}"?`)) {
            deleteEntity(entity.id);

            sendOperation({
                type: 'ENTITY_DELETE',
                targetId: entity.id,
                userId: user?.id || 'anonymous',
                userName: user?.name || 'Anonymous',
                payload: {}
            });
        }
    };

    return (
        <div
            className={`bg-white rounded-lg shadow-xl border-2 transition-all min-w-[300px] group relative ${selected
                ? 'border-orange-500 shadow-orange-200 shadow-lg ring-2 ring-orange-300 ring-offset-2'
                : isLocked
                    ? 'border-gray-200 shadow-sm'
                    : 'border-blue-500 shadow-blue-100'
                }`}
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
                    value={entity.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`${!isLocked ? 'nodrag bg-blue-400/20' : 'bg-transparent pointer-events-none'} border-none focus:ring-0 font-bold text-lg w-full p-0 outline-none placeholder-blue-200 rounded transition-colors disabled:text-white`}
                    placeholder="테이블 명"
                    spellCheck={false}
                />
                <div className={`flex items-center gap-1 ${isLocked ? 'pointer-events-none opacity-0 group-hover:opacity-100' : ''}`}>
                    <button onClick={handleToggleLock} onMouseDown={(e) => e.stopPropagation()} className="nodrag p-1 hover:bg-white/20 rounded-md transition-colors text-white pointer-events-auto">
                        {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                    </button>
                    {!isLocked && (
                        <button onClick={handleDeleteEntity} onMouseDown={(e) => e.stopPropagation()} className="nodrag opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500 rounded text-white">
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {(!isLocked || entity.comment) && (
                <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <MessageSquare size={12} className="text-gray-400 shrink-0" />
                    <input
                        type="text"
                        value={entity.comment || ''}
                        onChange={(e) => updateEntity(entity.id, { comment: e.target.value })}
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
                        availableTypes={availableTypes}
                        onUpdate={(updates, granular) => handleUpdateAttribute(attr.id, updates, granular)}
                        onDelete={(e) => handleDeleteAttribute(e, attr.id)}
                    />
                ))}
            </div>

            {!isLocked && (
                <div className="px-2 pb-2">
                    <button
                        onClick={handleAddAttribute}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="nodrag w-full flex items-center justify-center gap-2 py-1.5 border-2 border-dashed border-gray-200 rounded text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition-all text-xs font-medium"
                    >
                        <Plus size={14} />
                        컬럼 추가
                    </button>
                </div>
            )}

            <PrivHandles />
        </div>
    );
};

const PrivHandles = memo(() => (
    <>
        <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-none !w-5 !h-5 flex items-center justify-center !cursor-pointer group/handle" style={{ top: -10 }}>
            <div className="w-2 h-2 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
        <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-none !w-5 !h-5 flex items-center justify-center !cursor-pointer group/handle" style={{ bottom: -10 }}>
            <div className="w-2 h-2 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
        <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-none !w-5 !h-5 flex items-center justify-center !cursor-pointer group/handle" style={{ left: -10 }}>
            <div className="w-2 h-2 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
        <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-none !w-5 !h-5 flex items-center justify-center !cursor-pointer group/handle" style={{ right: -10 }}>
            <div className="w-2 h-2 bg-blue-500 border-white border-2 rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:scale-150" />
        </Handle>
    </>
));

export default memo(EntityNode);
