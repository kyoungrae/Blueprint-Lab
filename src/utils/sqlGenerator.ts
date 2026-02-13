import type { Entity, Relationship, DBType } from '../types/erd';

export const generateSQLFromERD = (entities: Entity[], relationships: Relationship[], dbType: DBType = 'MySQL'): string => {
    let sql = `-- ERD System SQL Export\n`;
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
    relationships.forEach(rel => {
        const sourceEntity = entities.find(e => e.id === rel.source);
        const targetEntity = entities.find(e => e.id === rel.target);

        if (sourceEntity && targetEntity) {
            // Find the handle attributes if possible, otherwise guess/default
            // In the current system, sourceHandle/targetHandle might be names or positions.
            // For now, we assume the relationship links the entities.
            // If the system stores which attribute is the FK, we can use that.

            // Look for attributes marked as FK that might correspond to this relationship
            const fkAttr = sourceEntity.attributes.find(a => a.isFK && a.name.toLowerCase().includes(targetEntity.name.toLowerCase()));
            const pkAttr = targetEntity.attributes.find(a => a.isPK);

            if (fkAttr && pkAttr) {
                const fkName = `FK_${sourceEntity.name}_${targetEntity.name}_${fkAttr.name}`;
                sql += `-- Relationship: ${sourceEntity.name} -> ${targetEntity.name} (${rel.type})\n`;
                sql += `ALTER TABLE ${quoteIdentifier(sourceEntity.name, dbType)}\n`;
                sql += `    ADD CONSTRAINT ${quoteIdentifier(fkName, dbType)}\n`;
                sql += `    FOREIGN KEY (${quoteIdentifier(fkAttr.name, dbType)})\n`;
                sql += `    REFERENCES ${quoteIdentifier(targetEntity.name, dbType)} (${quoteIdentifier(pkAttr.name, dbType)});\n\n`;
            } else {
                // Fallback: search for any _id column in source that matches target entity name
                const fallbackFk = sourceEntity.attributes.find(a =>
                    a.name.toLowerCase() === `${targetEntity.name.toLowerCase()}_id` ||
                    a.name.toLowerCase() === `${targetEntity.name.toLowerCase()}_ID`
                );

                if (fallbackFk && pkAttr) {
                    const fkName = `FK_${sourceEntity.name}_${targetEntity.name}_${fallbackFk.name}`;
                    sql += `-- Relationship: ${sourceEntity.name} -> ${targetEntity.name} (Guess based on name)\n`;
                    sql += `ALTER TABLE ${quoteIdentifier(sourceEntity.name, dbType)}\n`;
                    sql += `    ADD CONSTRAINT ${quoteIdentifier(fkName, dbType)}\n`;
                    sql += `    FOREIGN KEY (${quoteIdentifier(fallbackFk.name, dbType)})\n`;
                    sql += `    REFERENCES ${quoteIdentifier(targetEntity.name, dbType)} (${quoteIdentifier(pkAttr.name, dbType)});\n\n`;
                }
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
