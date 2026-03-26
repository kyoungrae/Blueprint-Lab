import React, { useMemo, useState } from 'react';
import type { Attribute, DBType, Entity, Relationship } from '../types/erd';

const DATA_TYPES: Record<DBType, string[]> = {
    MySQL: ['INT', 'BIGINT', 'VARCHAR', 'TEXT', 'DATETIME', 'DATE', 'DECIMAL', 'ENUM', 'JSON', 'BOOLEAN', 'TINYINT', 'BLOB'],
    PostgreSQL: ['INTEGER', 'BIGINT', 'VARCHAR', 'TEXT', 'TIMESTAMP', 'DATE', 'NUMERIC', 'BOOLEAN', 'UUID', 'JSONB', 'BYTEA', 'SERIAL'],
    Oracle: ['NUMBER', 'VARCHAR2', 'CLOB', 'DATE', 'TIMESTAMP', 'RAW', 'BLOB', 'CHAR'],
    MSSQL: ['INT', 'BIGINT', 'VARCHAR', 'NVARCHAR', 'TEXT', 'DATETIME', 'DATE', 'DECIMAL', 'BIT', 'UNIQUEIDENTIFIER', 'IMAGE'],
};

type RelationshipType = Relationship['type'];

interface ERDExcelViewProps {
    entities: Entity[];
    relationships: Relationship[];
    dbType: DBType;
    onAddEntity: () => void;
    onDeleteEntity: (entityId: string) => void;
    onUpdateEntity: (entityId: string, updates: Partial<Entity>) => void;
    onAddAttribute: (entityId: string) => void;
    onDeleteAttribute: (entityId: string, attrId: string) => void;
    onUpdateAttribute: (entityId: string, attrId: string, updates: Partial<Attribute>, isGranular?: boolean) => void;
    onAddRelationship: (source: string, target: string, type: RelationshipType) => void;
    onDeleteRelationship: (relationshipId: string) => void;
    onEditRelationship: (relationshipId: string) => void;
}

const ERDExcelView: React.FC<ERDExcelViewProps> = ({
    entities,
    relationships,
    dbType,
    onAddEntity,
    onDeleteEntity,
    onUpdateEntity,
    onAddAttribute,
    onDeleteAttribute,
    onUpdateAttribute,
    onAddRelationship,
    onDeleteRelationship,
    onEditRelationship,
}) => {
    const [newRelSource, setNewRelSource] = useState('');
    const [newRelTarget, setNewRelTarget] = useState('');
    const [newRelType, setNewRelType] = useState<RelationshipType>('1:N');
    const availableTypes = DATA_TYPES[dbType] ?? DATA_TYPES.MySQL;

    const entityNameById = useMemo(() => {
        return new Map(entities.map((e) => [e.id, e.name]));
    }, [entities]);

    const rows = useMemo(() => {
        let seq = 1;
        return entities.map((entity) => {
            const attrs = entity.attributes.length > 0
                ? entity.attributes
                : [{
                    id: `${entity.id}_empty`,
                    name: '',
                    type: availableTypes[0] || 'VARCHAR',
                    length: '',
                    isPK: false,
                    isFK: false,
                    defaultVal: '',
                    comment: '',
                } as Attribute];
            const mapped = attrs.map((attr) => ({ entity, attr, seq: seq++ }));
            return mapped;
        });
    }, [entities, availableTypes]);

    const handleCreateRelationship = () => {
        if (!newRelSource || !newRelTarget) {
            alert('관계 소스/타겟 테이블을 선택하세요.');
            return;
        }
        if (newRelSource === newRelTarget) {
            alert('같은 테이블끼리는 관계를 생성할 수 없습니다.');
            return;
        }
        onAddRelationship(newRelSource, newRelTarget, newRelType);
    };

    const tryAutoCreateRelationshipForFK = (entity: Entity) => {
        const hasAnyRelationship = relationships.some((r) => r.source === entity.id || r.target === entity.id);
        if (hasAnyRelationship) return;
        const candidates = entities.filter((e) => e.id !== entity.id);
        if (candidates.length === 0) return;
        const candidateNames = candidates.map((c) => c.name).join(', ');
        const picked = window.prompt(`FK 관계 대상 테이블명을 입력하세요.\n가능한 값: ${candidateNames}`);
        if (!picked) return;
        const target = candidates.find((c) => c.name === picked.trim());
        if (!target) {
            alert('대상 테이블명을 찾을 수 없습니다.');
            return;
        }
        onAddRelationship(target.id, entity.id, '1:N');
    };

    const tryAutoDeleteRelationshipForFK = (entity: Entity, attrId: string) => {
        const wouldHaveAnyFK = entity.attributes.some((a) => a.id !== attrId && a.isFK);
        if (wouldHaveAnyFK) return;
        const rels = relationships.filter((r) => r.target === entity.id || r.source === entity.id);
        if (rels.length === 0) return;
        if (!window.confirm('이 테이블의 FK가 모두 해제됩니다. 연결된 관계선도 함께 삭제할까요?')) return;
        rels.forEach((r) => onDeleteRelationship(r.id));
    };

    return (
        <div className="absolute inset-0 z-[10] bg-white/70 backdrop-blur-[1px] overflow-auto">
            <div className="p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                    <button
                        onClick={onAddEntity}
                        className="px-3 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        테이블 추가
                    </button>
                    <div className="h-6 w-px bg-gray-200" />
                    <select
                        value={newRelSource}
                        onChange={(e) => setNewRelSource(e.target.value)}
                        className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                    >
                        <option value="">관계 소스</option>
                        {entities.map((e) => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                    </select>
                    <select
                        value={newRelTarget}
                        onChange={(e) => setNewRelTarget(e.target.value)}
                        className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                    >
                        <option value="">관계 타겟</option>
                        {entities.map((e) => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                    </select>
                    <select
                        value={newRelType}
                        onChange={(e) => setNewRelType(e.target.value as RelationshipType)}
                        className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                    >
                        <option value="1:1">1:1</option>
                        <option value="1:N">1:N</option>
                        <option value="N:M">N:M</option>
                    </select>
                    <button
                        onClick={handleCreateRelationship}
                        className="px-3 py-1.5 text-sm font-semibold border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        관계 추가
                    </button>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 text-gray-700 sticky top-0 z-10">
                            <tr className="border-b border-gray-200">
                                <th className="px-2 py-2 text-left font-bold">순번</th>
                                <th className="px-2 py-2 text-left font-bold">테이블명</th>
                                <th className="px-2 py-2 text-left font-bold">테이블한글명</th>
                                <th className="px-2 py-2 text-left font-bold">컬럼명</th>
                                <th className="px-2 py-2 text-left font-bold">타입</th>
                                <th className="px-2 py-2 text-left font-bold">크기</th>
                                <th className="px-2 py-2 text-center font-bold">PK(Y)</th>
                                <th className="px-2 py-2 text-center font-bold">FK(Y)</th>
                                <th className="px-2 py-2 text-left font-bold">Default</th>
                                <th className="px-2 py-2 text-left font-bold">비고</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.flatMap((groupRows) => {
                                const rowSpan = groupRows.length;
                                return groupRows.map(({ entity, attr, seq }, idx) => {
                                    const isPlaceholder = attr.id.endsWith('_empty');
                                    const isGroupLast = idx === groupRows.length - 1;
                                    return (
                                        <tr
                                            key={`${entity.id}_${attr.id}_${idx}`}
                                            className={`${isGroupLast ? 'border-b-4 border-blue-100' : 'border-b border-gray-100'} hover:bg-blue-50/40`}
                                        >
                                            <td className="px-2 py-1.5 text-gray-500">{seq}</td>
                                            {idx === 0 && (
                                                <>
                                                    <td rowSpan={rowSpan} className="px-2 py-1.5 align-top">
                                                        <input
                                                            value={entity.name}
                                                            onChange={(e) => onUpdateEntity(entity.id, { name: e.target.value })}
                                                            className="w-full px-2 py-1 border border-gray-200 rounded"
                                                        />
                                                        <div className="mt-2 flex gap-1">
                                                            <button
                                                                onClick={() => onAddAttribute(entity.id)}
                                                                className="px-2 py-1 rounded border border-gray-200 text-[11px] hover:bg-gray-50"
                                                            >
                                                                컬럼 추가
                                                            </button>
                                                            <button
                                                                onClick={() => onDeleteEntity(entity.id)}
                                                                className="px-2 py-1 rounded border border-red-200 text-red-600 text-[11px] hover:bg-red-50"
                                                            >
                                                                테이블 삭제
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td rowSpan={rowSpan} className="px-2 py-1.5 align-top">
                                                        <input
                                                            value={entity.comment || ''}
                                                            onChange={(e) => onUpdateEntity(entity.id, { comment: e.target.value })}
                                                            className="w-full px-2 py-1 border border-gray-200 rounded"
                                                            placeholder="한글명/설명"
                                                        />
                                                    </td>
                                                </>
                                            )}
                                            <td className="px-2 py-1.5">
                                                {isPlaceholder ? (
                                                    <span className="text-gray-400">컬럼 없음</span>
                                                ) : (
                                                    <input
                                                        value={attr.name}
                                                        onChange={(e) => onUpdateAttribute(entity.id, attr.id, { name: e.target.value }, true)}
                                                        className="w-full px-2 py-1 border border-gray-200 rounded"
                                                    />
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                {isPlaceholder ? (
                                                    <span className="text-gray-400">-</span>
                                                ) : (
                                                    <select
                                                        value={attr.type}
                                                        onChange={(e) => onUpdateAttribute(entity.id, attr.id, { type: e.target.value }, true)}
                                                        className="w-full px-2 py-1 border border-gray-200 rounded bg-white"
                                                    >
                                                        {availableTypes.map((t) => (
                                                            <option key={t} value={t}>{t}</option>
                                                        ))}
                                                    </select>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                {isPlaceholder ? (
                                                    <span className="text-gray-400">-</span>
                                                ) : (
                                                    <input
                                                        value={attr.length || ''}
                                                        onChange={(e) => onUpdateAttribute(entity.id, attr.id, { length: e.target.value }, true)}
                                                        className="w-full px-2 py-1 border border-gray-200 rounded"
                                                    />
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 text-center">
                                                {isPlaceholder ? (
                                                    '-'
                                                ) : (
                                                    <input
                                                        type="checkbox"
                                                        checked={!!attr.isPK}
                                                        onChange={(e) => onUpdateAttribute(entity.id, attr.id, { isPK: e.target.checked }, true)}
                                                    />
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 text-center">
                                                {isPlaceholder ? (
                                                    '-'
                                                ) : (
                                                    <input
                                                        type="checkbox"
                                                        checked={!!attr.isFK}
                                                        onChange={(e) => {
                                                            onUpdateAttribute(entity.id, attr.id, { isFK: e.target.checked }, true);
                                                            if (e.target.checked) {
                                                                tryAutoCreateRelationshipForFK(entity);
                                                            } else {
                                                                tryAutoDeleteRelationshipForFK(entity, attr.id);
                                                            }
                                                        }}
                                                    />
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                {isPlaceholder ? (
                                                    <span className="text-gray-400">-</span>
                                                ) : (
                                                    <input
                                                        value={attr.defaultVal || ''}
                                                        onChange={(e) => onUpdateAttribute(entity.id, attr.id, { defaultVal: e.target.value }, true)}
                                                        className="w-full px-2 py-1 border border-gray-200 rounded"
                                                    />
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                {isPlaceholder ? (
                                                    <span className="text-gray-400">-</span>
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            value={attr.comment || ''}
                                                            onChange={(e) => onUpdateAttribute(entity.id, attr.id, { comment: e.target.value }, true)}
                                                            className="w-full px-2 py-1 border border-gray-200 rounded"
                                                        />
                                                        <button
                                                            onClick={() => onDeleteAttribute(entity.id, attr.id)}
                                                            style={{minWidth:'40px'}}
                                                            className="px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 text-[11px]"
                                                        >
                                                            삭제
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                });
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">관계 목록</h3>
                    <div className="space-y-1">
                        {relationships.length === 0 ? (
                            <div className="text-xs text-gray-500">등록된 관계가 없습니다.</div>
                        ) : (
                            relationships.map((rel) => (
                                <div key={rel.id} className="flex items-center justify-between gap-2 px-2 py-1.5 border border-gray-100 rounded">
                                    <span className="text-xs text-gray-700">
                                        {entityNameById.get(rel.source) || rel.source} → {entityNameById.get(rel.target) || rel.target} ({rel.type})
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => onEditRelationship(rel.id)}
                                            className="px-2 py-1 text-[11px] rounded border border-gray-200 hover:bg-gray-50"
                                        >
                                            수정
                                        </button>
                                        <button
                                            onClick={() => onDeleteRelationship(rel.id)}
                                            className="px-2 py-1 text-[11px] rounded border border-red-200 text-red-600 hover:bg-red-50"
                                        >
                                            삭제
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ERDExcelView;
