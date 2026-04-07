import type { Entity, Attribute, Relationship } from '../types/erd';

function splitTopLevelCommas(body: string): string[] {
    let depth = 0;
    let current = '';
    const sections: string[] = [];
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            sections.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) sections.push(current.trim());
    return sections;
}

function findClosingParen(s: string, openIdx: number): number {
    let depth = 0;
    for (let i = openIdx; i < s.length; i++) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function isIdentifierChar(c: string): boolean {
    return /[A-Za-z0-9_$#@]/.test(c);
}

/** depth 0에서의 첫 FROM 키워드 시작 인덱스 */
function findTopLevelFromKeyword(sql: string, fromIndex: number): number {
    let depth = 0;
    const upper = sql.toUpperCase();
    for (let i = fromIndex; i < sql.length; i++) {
        const ch = sql[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (depth !== 0) continue;
        if (i + 4 > sql.length) continue;
        if (upper.slice(i, i + 4) !== 'FROM') continue;
        const before = i === 0 ? ' ' : sql[i - 1];
        const after = i + 4 >= sql.length ? ' ' : sql[i + 4];
        if (isIdentifierChar(before)) continue;
        if (isIdentifierChar(after)) continue;
        return i;
    }
    return -1;
}

/** 메인 SELECT 목록 구간 [start, end) — 첫 depth-0 SELECT 이후 ~ 그 다음 depth-0 FROM 직전 */
function findMainSelectListBounds(query: string): { start: number; end: number } | null {
    let depth = 0;
    const upper = query.toUpperCase();
    let selectPos = -1;
    for (let i = 0; i < query.length; i++) {
        const ch = query[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (depth !== 0) continue;
        if (i + 6 > query.length) continue;
        if (upper.slice(i, i + 6) !== 'SELECT') continue;
        const before = i === 0 ? ' ' : query[i - 1];
        const after = i + 6 >= query.length ? ' ' : query[i + 6];
        if (isIdentifierChar(before)) continue;
        if (isIdentifierChar(after)) continue;
        selectPos = i + 6;
        break;
    }
    if (selectPos < 0) return null;
    const fromPos = findTopLevelFromKeyword(query, selectPos);
    if (fromPos < 0) return null;
    return { start: selectPos, end: fromPos };
}

function parseSelectItemAlias(part: string): string {
    const trimmed = part.trim();
    if (!trimmed) return 'expr';
    const asMatch = trimmed.match(/\s+AS\s+([`"[\w][`"\]\w.$]*|`[^`]+`|"[^"]+"|\[[^\]]+\])\s*$/i);
    if (asMatch) {
        return asMatch[1].replace(/[`"\[\]]/g, '').split('.').pop() || 'expr';
    }
    const lastTok = trimmed.split(/\s+/).pop() || trimmed;
    const cleaned = lastTok.replace(/[`"\[\]]/g, '');
    if (cleaned.includes('.')) return cleaned.split('.').pop() || 'expr';
    return cleaned || 'expr';
}

function inferColumnsFromSelect(query: string): string[] {
    const bounds = findMainSelectListBounds(query);
    if (!bounds) return [];
    const listStr = query.slice(bounds.start, bounds.end).trim();
    if (!listStr) return [];
    const parts = splitTopLevelCommas(listStr);
    return parts.map(parseSelectItemAlias);
}

type ParsedView = {
    name: string;
    explicitColumns: string[] | null;
    query: string;
    viewSql: string;
    materialized: boolean;
};

function tryParseCreateView(statement: string): ParsedView | null {
    let s = statement.trim();
    if (!/^CREATE\s+/i.test(s)) return null;

    let rest = s.replace(/^CREATE\s+/i, '').trim();
    if (/^OR\s+REPLACE\s+/i.test(rest)) {
        rest = rest.replace(/^OR\s+REPLACE\s+/i, '').trim();
    }
    rest = rest.replace(/^(?:FORCE|NOFORCE)\s+/i, '').trim();
    rest = rest.replace(
        /^(?:ALGORITHM\s*=\s*\w+\s+|DEFINER\s*=\s*(?:`[^`]*`|'[^']*'|"[^"]*"|\S+)\s+|SQL\s+SECURITY\s+(?:DEFINER|INVOKER)\s+)*/i,
        ''
    );

    let materialized = false;
    if (/^MATERIALIZED\s+VIEW\s+/i.test(rest)) {
        materialized = true;
        rest = rest.replace(/^MATERIALIZED\s+VIEW\s+/i, '').trim();
    } else if (/^VIEW\s+/i.test(rest)) {
        rest = rest.replace(/^VIEW\s+/i, '').trim();
    } else {
        return null;
    }

    if (/^IF\s+NOT\s+EXISTS\s+/i.test(rest)) {
        rest = rest.replace(/^IF\s+NOT\s+EXISTS\s+/i, '').trim();
    }

    const nameMatch = rest.match(/^(`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$.]+)\s*/);
    if (!nameMatch) return null;
    const viewName = nameMatch[1].replace(/[`"\[\]]/g, '');
    rest = rest.slice(nameMatch[0].length).trim();

    let explicitColumns: string[] | null = null;
    if (rest.startsWith('(')) {
        const close = findClosingParen(rest, 0);
        if (close < 0) return null;
        const inner = rest.slice(1, close);
        explicitColumns = splitTopLevelCommas(inner)
            .map((c) => c.trim().replace(/[`"\[\]]/g, ''))
            .filter(Boolean);
        rest = rest.slice(close + 1).trim();
    }

    if (!/^AS\s+/i.test(rest)) return null;
    let query = rest.replace(/^AS\s+/i, '').trim();
    query = query.replace(/;+\s*$/, '').trim();

    return {
        name: viewName,
        explicitColumns,
        query,
        viewSql: s.replace(/;+\s*$/, ''),
        materialized,
    };
}

function buildViewAttributes(explicit: string[] | null, query: string): Attribute[] {
    const ts = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    let colNames: string[];
    if (explicit && explicit.length > 0) {
        colNames = explicit;
    } else {
        colNames = inferColumnsFromSelect(query);
    }
    if (colNames.length === 0) {
        return [
            {
                id: `attr_${ts()}`,
                name: '_view',
                type: 'VARCHAR',
                isPK: false,
                isFK: false,
                isNullable: true,
                comment: 'VIEW 컬럼을 스크립트에서 자동 추출하지 못했습니다. 필요 시 수동으로 추가하세요.',
            },
        ];
    }
    return colNames.map((name, idx) => ({
        id: `attr_${ts()}_${idx}`,
        name,
        type: 'VARCHAR',
        isPK: false,
        isFK: false,
        isNullable: true,
    }));
}

export const parseSQLToERD = (sql: string): { entities: Entity[], relationships: Relationship[] } => {
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];

    // Normalize SQL: remove comments, support Oracle "/" delimiter, and compact whitespace
    const cleanSql = sql
        .replace(/\/\*[\s\S]*?\*\/|--.*/g, '') // Remove block and line comments
        // Oracle SQL*Plus delimiter: "/" on its own line
        .replace(/^\s*\/\s*$/gm, ';')
        // Also support ") / CREATE ..." style delimiter
        .replace(/\)\s*\/\s*(?=(CREATE|ALTER|DROP|TRUNCATE)\b)/gi, '); ')
        .replace(/\s+/g, ' ')
        .trim();

    // Split by semicolons for multiple statements (Oracle "/" converted above)
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
        } else {
            const viewParsed = tryParseCreateView(statement);
            if (viewParsed) {
                const idx = entities.length;
                const newEntityId = `entity_${Date.now()}_${idx}`;
                const attributes = buildViewAttributes(viewParsed.explicitColumns, viewParsed.query);
                entities.push({
                    id: newEntityId,
                    name: viewParsed.name,
                    position: {
                        x: 100 + (idx * 350) % 1000,
                        y: 100 + Math.floor(idx / 3) * 400 + 40,
                    },
                    attributes,
                    isLocked: true,
                    entityKind: 'VIEW',
                    viewSql: viewParsed.viewSql,
                    isMaterializedView: viewParsed.materialized,
                    comment: viewParsed.materialized ? 'Materialized view' : undefined,
                });
            }
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
        if (source.entityKind === 'VIEW') return;
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

