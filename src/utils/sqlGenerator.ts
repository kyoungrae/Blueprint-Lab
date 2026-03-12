import type { Entity, Relationship, DBType } from '../types/erd';

export const generateSQLFromERD = (entities: Entity[], relationships: Relationship[], dbType: DBType = 'MySQL'): string => {
    let sql = `-- Blue Print Lab SQL Export\n`;
    sql += `-- Database Type: ${dbType}\n`;
    sql += `-- Generated at: ${new Date().toISOString()}\n\n`;

    // 1. Generate CREATE TABLE statements
    entities.forEach(entity => {
        sql += `-- Table: ${entity.name}\n`;
        if (entity.comment) {
            sql += `-- Comment: ${entity.comment}\n`;
        }
        sql += `CREATE TABLE ${quoteIdentifier(entity.name, dbType)} (\n`;

        const columnLines = entity.attributes.map((attr) => {
            let line = `    ${quoteIdentifier(attr.name, dbType)} ${attr.type}`;

            if (attr.length) {
                line += `(${attr.length})`;
            }

            if (attr.isPK) {
                line += ` PRIMARY KEY`;
            }

            if (attr.isNullable === false) {
                line += ` NOT NULL`;
            }

            if (attr.defaultVal) {
                line += ` DEFAULT ${formatDefaultValue(attr.defaultVal, attr.type)}`;
            }

            if (attr.comment && dbType === 'MySQL') {
                line += ` COMMENT '${attr.comment.replace(/'/g, "''")}'`;
            }

            return line;
        });

        sql += columnLines.join(',\n');

        if (dbType === 'MySQL' && entity.comment) {
            sql += `\n) COMMENT='${entity.comment.replace(/'/g, "''")}';\n\n`;
        } else {
            sql += `\n);\n\n`;
        }

        // Post-table comments for PostgreSQL/Oracle
        if (entity.comment && (dbType === 'PostgreSQL' || dbType === 'Oracle' || dbType === 'MSSQL')) {
            if (dbType === 'PostgreSQL') {
                sql += `COMMENT ON TABLE ${quoteIdentifier(entity.name, dbType)} IS '${entity.comment.replace(/'/g, "''")}';\n`;
            }
            // Add attribute comments for non-MySQL
            entity.attributes.forEach(attr => {
                if (attr.comment) {
                    if (dbType === 'PostgreSQL') {
                        sql += `COMMENT ON COLUMN ${quoteIdentifier(entity.name, dbType)}.${quoteIdentifier(attr.name, dbType)} IS '${attr.comment.replace(/'/g, "''")}';\n`;
                    }
                }
            });
            sql += `\n`;
        }
    });

    // 2. Generate ALTER TABLE for Foreign Keys
    if (relationships.length > 0) {
        sql += `-- Foreign Key Constraints\n`;
        sql += `-- ======================\n\n`;
    }

    relationships.forEach(rel => {
        const sourceEntity = entities.find(e => e.id === rel.source);
        const targetEntity = entities.find(e => e.id === rel.target);

        if (sourceEntity && targetEntity) {
            // 관계 타입에 따른 FK 제약조건 생성
            const constraintName = `FK_${sourceEntity.name}_${targetEntity.name}_${rel.type}`;
            
            // PK 컬럼 찾기 (우선순위: 명시적 PK > id 컬럼)
            const pkAttr = targetEntity.attributes.find(a => a.isPK) || 
                          targetEntity.attributes.find(a => a.name.toLowerCase() === 'id');

            // FK 컬럼 찾기 (우선순위: 명시적 FK > target_name_id > handle 기반)
            let fkAttr = sourceEntity.attributes.find(a => a.isFK);
            
            if (!fkAttr) {
                // 관계의 sourceHandle/targetHandle에서 컬럼명 추출 시도
                if (rel.sourceHandle && typeof rel.sourceHandle === 'string') {
                    fkAttr = sourceEntity.attributes.find(a => a.name === rel.sourceHandle);
                }
            }
            
            if (!fkAttr) {
                // target_name_id 패턴으로 찾기
                const targetNamePattern = `${targetEntity.name.toLowerCase()}_id`;
                fkAttr = sourceEntity.attributes.find(a => 
                    a.name.toLowerCase() === targetNamePattern ||
                    a.name.toLowerCase() === `${targetNamePattern.toUpperCase()}`
                );
            }

            if (pkAttr && fkAttr) {
                sql += `-- Relationship: ${sourceEntity.name} -> ${targetEntity.name} (${rel.type})\n`;
                sql += `ALTER TABLE ${quoteIdentifier(sourceEntity.name, dbType)}\n`;
                sql += `    ADD CONSTRAINT ${quoteIdentifier(constraintName, dbType)}\n`;
                sql += `    FOREIGN KEY (${quoteIdentifier(fkAttr.name, dbType)})\n`;
                sql += `    REFERENCES ${quoteIdentifier(targetEntity.name, dbType)} (${quoteIdentifier(pkAttr.name, dbType)})`;
                
                // ON DELETE/UPDATE 옵션 추가 (관계 타입에 따라)
                if (rel.type === '1:N') {
                    sql += `\n    ON DELETE CASCADE`;
                }
                
                sql += `;\n\n`;
            } else {
                // 경고: FK 또는 PK를 찾지 못한 경우
                sql += `-- WARNING: Could not create foreign key for ${sourceEntity.name} -> ${targetEntity.name}\n`;
                sql += `-- Reason: ${!pkAttr ? 'Primary key not found in target table' : 'Foreign key column not found in source table'}\n\n`;
            }
        }
    });

    return sql;
};

const quoteIdentifier = (name: string, dbType: DBType): string => {
    switch (dbType) {
        case 'MySQL':
            return `\`${name}\``;
        case 'PostgreSQL':
        case 'Oracle':
            return `"${name}"`;
        case 'MSSQL':
            return `[${name}]`;
        default:
            return name;
    }
};

const formatDefaultValue = (val: string, type: string): string => {
    const upperType = type.toUpperCase();
    if (['INT', 'INTEGER', 'DECIMAL', 'FLOAT', 'DOUBLE', 'NUMBER'].some(t => upperType.includes(t))) {
        return val;
    }
    if (val.toUpperCase() === 'CURRENT_TIMESTAMP' || val.toUpperCase() === 'NOW()') {
        return val;
    }
    return `'${val.replace(/'/g, "''")}'`;
};
