import type { Entity, Attribute, Relationship } from '../types/erd';

export const parseSQLToERD = (sql: string): { entities: Entity[], relationships: Relationship[] } => {
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];

    // Normalize SQL: remove comments and extra whitespace
    const cleanSql = sql
        .replace(/\/\*[\s\S]*?\*\/|--.*/g, '') // Remove block and line comments
        .replace(/\s+/g, ' ')
        .trim();

    // Split by semicolons for multiple statements
    const statements = cleanSql.split(';').map(s => s.trim()).filter(Boolean);

    statements.forEach(statement => {
        // Handle CREATE TABLE
        const createMatch = statement.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([^\s(]+)\s*\(([\s\S]*)\)/i);
        if (createMatch) {
            const tableName = createMatch[1].replace(/[`"\[\]]/g, '');
            const body = createMatch[2];

            const attributes: Attribute[] = [];

            // Collect relationships to be added after entities are fully parsed
            const tableLevelFKs: { col: string, refTable: string, refCol: string }[] = [];

            // Split body into column/constraint definitions
            let depth = 0;
            let current = '';
            const sections: string[] = [];

            for (let i = 0; i < body.length; i++) {
                if (body[i] === '(') depth++;
                if (body[i] === ')') depth--;
                if (body[i] === ',' && depth === 0) {
                    sections.push(current.trim());
                    current = '';
                } else {
                    current += body[i];
                }
            }
            if (current) sections.push(current.trim());

            sections.forEach(section => {
                const upperSection = section.toUpperCase();

                // Handle Table-level PRIMARY KEY
                if (upperSection.startsWith('PRIMARY KEY')) {
                    const pkMatch = section.match(/PRIMARY KEY\s*\(([^)]+)\)/i);
                    if (pkMatch) {
                        const pkCols = pkMatch[1].split(',').map(c => c.trim().replace(/[`"\[\]]/g, ''));
                        pkCols.forEach(pkCol => {
                            const attr = attributes.find(a => a.name === pkCol);
                            if (attr) attr.isPK = true;
                        });
                    }
                    return;
                }

                // Handle Table-level FOREIGN KEY or CONSTRAINT ... FOREIGN KEY
                if (upperSection.includes('FOREIGN KEY')) {
                    const fkMatch = section.match(/(?:CONSTRAINT\s+[^\s]+\s+)?FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)/i);
                    if (fkMatch) {
                        const colName = fkMatch[1].trim().replace(/[`"\[\]]/g, '');
                        const refTable = fkMatch[2].trim().replace(/[`"\[\]]/g, '');
                        const refCol = fkMatch[3].trim().replace(/[`"\[\]]/g, '');

                        tableLevelFKs.push({ col: colName, refTable, refCol });

                        // Mark existing attribute as FK
                        const attr = attributes.find(a => a.name === colName);
                        if (attr) attr.isFK = true;
                    }
                    return;
                }

                // Handle normal column definition
                const parts = section.split(/\s+/);
                const colName = parts[0].replace(/[`"\[\]]/g, '');

                // Extract type and length - handle cases like VARCHAR(50)
                let colType = 'VARCHAR';
                let colLength: string | undefined;
                const typeMatch = section.match(/[^\s]+\s+([^\s,()]+)(?:\(([^)]+)\))?/i);
                if (typeMatch) {
                    colType = typeMatch[1].toUpperCase();
                    colLength = typeMatch[2]; // This will be "50" from VARCHAR(50)
                }

                const isPK = upperSection.includes('PRIMARY KEY');
                let isFK = upperSection.includes('REFERENCES');
                const isNullable = !upperSection.includes('NOT NULL');

                // Extract DEFAULT value
                let defaultVal: string | undefined;
                const defaultMatch = section.match(/DEFAULT\s+([^, ]+)/i);
                if (defaultMatch) {
                    defaultVal = defaultMatch[1].replace(/['"`]/g, '');
                }

                // Extract COMMENT
                let comment: string | undefined;
                const commentMatch = section.match(/COMMENT\s+['"]([^'"]+)['"]/i);
                if (commentMatch) {
                    comment = commentMatch[1];
                }

                // Column-level Foreign Key check
                if (isFK) {
                    const inlineFKMatch = section.match(/REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)/i);
                    if (inlineFKMatch) {
                        const refTable = inlineFKMatch[1].trim().replace(/[`"\[\]]/g, '');
                        const refCol = inlineFKMatch[2].trim().replace(/[`"\[\]]/g, '');
                        tableLevelFKs.push({ col: colName, refTable, refCol });
                    }
                }

                attributes.push({
                    id: `attr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: colName,
                    type: colType,
                    length: colLength,
                    isPK,
                    isFK,
                    isNullable,
                    defaultVal,
                    comment
                });
            });

            const newEntityId = `entity_${Date.now()}_${entities.length}`;

            // Try to extract Table COMMENT if it exists after the closing parenthesis
            let tableComment: string | undefined;
            const tableCommentMatch = statement.match(/\)\s*(?:[^;]*\s+)?COMMENT\s*=\s*['"]([^'"]+)['"]/i);
            if (tableCommentMatch) {
                tableComment = tableCommentMatch[1];
            }

            entities.push({
                id: newEntityId,
                name: tableName,
                position: {
                    x: 100 + (entities.length * 350) % 1000,
                    y: 100 + Math.floor(entities.length / 3) * 400
                },
                attributes,
                isLocked: true,
                comment: tableComment
            });

            // If we found table-level FKs, we'll process them outside to ensure all entities exist
            // Actually, since CREATE TABLE might reference a table not yet created in the script, 
            // we should store these and process after all CREATE statements.
            (entities[entities.length - 1] as any)._pendingFKs = tableLevelFKs;
        }

        // Handle ALTER TABLE for Foreign Keys
        const fkMatch = statement.match(/ALTER TABLE\s+([^\s]+)\s+(?:ADD\s+)?(?:CONSTRAINT\s+[^\s]+\s+)?FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)/i);
        if (fkMatch) {
            const sourceTable = fkMatch[1].replace(/[`"\[\]]/g, '');
            const sourceCol = fkMatch[2].replace(/[`"\[\]]/g, '');
            const targetTable = fkMatch[3].replace(/[`"\[\]]/g, '');

            const sourceEntity = entities.find(e => e.name === sourceTable);
            if (sourceEntity) {
                const attr = sourceEntity.attributes.find(a => a.name === sourceCol);
                if (attr) attr.isFK = true;

                relationships.push({
                    id: `rel_${Date.now()}_${relationships.length}`,
                    source: sourceTable, // Using names temporarily to resolve later or IDs if available
                    target: targetTable,
                    type: '1:N'
                });
            }
        }
    });

    // Final relationship resolution with proper IDs and handles
    const finalRelationships: Relationship[] = [];
    const relTracker = new Set<string>();

    // 1. Process explicit FKs
    entities.forEach(entity => {
        const pending = (entity as any)._pendingFKs;
        if (pending) {
            pending.forEach((fk: any) => {
                const targetEntity = entities.find(e => e.name === fk.refTable);
                if (targetEntity) {
                    const relKey = `${entity.id}-${targetEntity.id}`;
                    if (!relTracker.has(relKey)) {
                        finalRelationships.push({
                            id: `rel_${Date.now()}_${finalRelationships.length}`,
                            source: entity.id,
                            target: targetEntity.id,
                            sourceHandle: 'right', // Default to right-to-left
                            targetHandle: 'left',
                            type: '1:N'
                        });
                        relTracker.add(relKey);
                    }
                }
            });
            delete (entity as any)._pendingFKs;
        }
    });

    // 2. Process ALTER TABLE relationships
    relationships.forEach(rel => {
        const sourceEntity = entities.find(e => e.id === rel.source || e.name === rel.source);
        const targetEntity = entities.find(e => e.id === rel.target || e.name === rel.target);

        if (sourceEntity && targetEntity) {
            const relKey = `${sourceEntity.id}-${targetEntity.id}`;
            if (!relTracker.has(relKey)) {
                finalRelationships.push({
                    ...rel,
                    source: sourceEntity.id,
                    target: targetEntity.id,
                    sourceHandle: 'right',
                    targetHandle: 'left'
                });
                relTracker.add(relKey);
            }
        }
    });

    // 3. Smart Detection: Guess relationships based on naming patterns (e.g. user_id)
    entities.forEach(source => {
        source.attributes.forEach(attr => {
            if (attr.name.endsWith('_id') || attr.name.endsWith('_ID')) {
                const targetName = attr.name.substring(0, attr.name.length - 3);
                const target = entities.find(e => e.name.toLowerCase() === targetName.toLowerCase());

                if (target && source.id !== target.id) {
                    const relKey = `${source.id}-${target.id}`;
                    if (!relTracker.has(relKey)) {
                        attr.isFK = true; // Mark as FK if we found a match
                        finalRelationships.push({
                            id: `rel_smart_${Date.now()}_${finalRelationships.length}`,
                            source: source.id,
                            target: target.id,
                            sourceHandle: 'right',
                            targetHandle: 'left',
                            type: '1:N'
                        });
                        relTracker.add(relKey);
                    }
                }
            }
        });
    });

    return { entities, relationships: finalRelationships };
};

