import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ArrowLeft, Users, FolderOpen, Database, Monitor, Box, Trash2, RotateCcw, Search, FileSpreadsheet, Copy, Edit2, Check, X, ScrollText, ChevronLeft, ChevronRight, Languages, Globe, Save, RefreshCw } from 'lucide-react';
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { getEffectiveMnDict, persistMnDictSession } from '../utils/translation';
import { useAuthStore } from '../store/authStore';
import * as XLSX from 'xlsx';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects').replace(/\/projects\/?$/, '');

type SheetColIdx = { tableName: number; tableNameKr: number; columnName: number; columnNameKr: number; type: number; size: number; pk: number; fk: number; notNull: number; default: number };

/** 엑셀에서 헤더 행을 찾아 (행 인덱스, 컬럼 인덱스 맵) 반환. 없으면 null */
function findHeaderRowAndIndices(rows: (string | number)[][]): { headerRowIndex: number; idx: SheetColIdx } | null {
    const normalize = (v: string) => String(v ?? '').trim().replace(/\s/g, '');
    for (let r = 0; r < Math.min(25, rows.length); r++) {
        const row = rows[r] || [];
        let tableNameIdx = -1;
        let tableNameKrIdx = -1;
        let columnNameIdx = -1;
        let columnNameKrIdx = -1;
        let typeIdx = -1;
        let sizeIdx = -1;
        let pkIdx = -1;
        let fkIdx = -1;
        let notNullIdx = -1;
        let defaultIdx = -1;
        for (let c = 0; c < row.length; c++) {
            const cell = normalize(String(row[c] ?? ''));
            if (/테이블명/.test(cell) && !/한글/.test(cell)) tableNameIdx = c;
            else if (/테이블한글명|테이블\s*한글/.test(cell) || (cell === '한글명' && tableNameIdx >= 0 && c === tableNameIdx + 1)) tableNameKrIdx = c;
            else if (/컬럼명/.test(cell) && !/한글/.test(cell)) columnNameIdx = c;
            else if (/컬럼한글명|컬럼\s*한글/.test(cell) || (cell === '한글명' && columnNameIdx >= 0 && c === columnNameIdx + 1)) columnNameKrIdx = c;
            else if (/^타입$/.test(cell) || cell === '데이터타입') typeIdx = c;
            else if (/^크기$/.test(cell) || /길이/.test(cell)) sizeIdx = c;
            else if (/^PK$/i.test(cell) || /PK\s*\(/i.test(cell) || cell === 'PK(Y)') pkIdx = c;
            else if (/^FK$/i.test(cell) || /FK\s*\(/i.test(cell) || cell === 'FK(Y)') fkIdx = c;
            else if (/NOT\s*NULL/i.test(cell) || /NOTNULL/i.test(cell) || cell === 'NOT NULL(Y)') notNullIdx = c;
            else if (/^Default$/i.test(cell) || /기본값/.test(cell)) defaultIdx = c;
        }
        if (tableNameIdx >= 0 && columnNameIdx >= 0) {
            return {
                headerRowIndex: r,
                idx: {
                    tableName: tableNameIdx,
                    tableNameKr: tableNameKrIdx >= 0 ? tableNameKrIdx : tableNameIdx + 1,
                    columnName: columnNameIdx,
                    columnNameKr: columnNameKrIdx >= 0 ? columnNameKrIdx : columnNameIdx + 1,
                    type: typeIdx >= 0 ? typeIdx : columnNameIdx + 2,
                    size: sizeIdx >= 0 ? sizeIdx : columnNameIdx + 3,
                    pk: pkIdx >= 0 ? pkIdx : columnNameIdx + 4,
                    fk: fkIdx >= 0 ? fkIdx : columnNameIdx + 5,
                    notNull: notNullIdx >= 0 ? notNullIdx : columnNameIdx + 6,
                    default: defaultIdx >= 0 ? defaultIdx : columnNameIdx + 7,
                },
            };
        }
    }
    return null;
}

type ColumnDef = { name: string; type: string; size: string; pk: boolean; fk: string; notNull: boolean; defaultVal: string; comment: string };
type TableDef = { tableComment: string; columns: ColumnDef[] };

/** 엑셀 시트 행 배열에서 테이블/컬럼 정보 추출 (헤더 자동 감지 또는 고정 위치) */
function parseSheetToTableColumns(rows: (string | number)[][], startRow: number, idx: SheetColIdx): Record<string, TableDef> {
    const result: Record<string, TableDef> = {};
    for (let i = startRow; i < rows.length; i++) {
        const row = rows[i] || [];
        const tableName = String(row[idx.tableName] ?? '').trim();
        const columnName = String(row[idx.columnName] ?? '').trim();
        if (!tableName || !columnName) continue;
        if (/테이블명|컬럼명|순번|타입|한글/.test(tableName) || /테이블명|컬럼명|순번|한글/.test(columnName)) continue;
        const tableComment = String(row[idx.tableNameKr] ?? '').trim();
        const columnComment = String(row[idx.columnNameKr] ?? '').trim();
        const type = String(row[idx.type] ?? 'VARCHAR').trim().toUpperCase() || 'VARCHAR';
        const size = row[idx.size] !== undefined && row[idx.size] !== '' ? String(row[idx.size]).trim() : '';
        const pk = /^Y$/i.test(String(row[idx.pk] ?? '').trim());
        const fkRaw = String(row[idx.fk] ?? '').trim();
        const notNull = /^Y$/i.test(String(row[idx.notNull] ?? '').trim());
        let defaultVal = String(row[idx.default] ?? '').trim();
        if (defaultVal && !/^default\s+/i.test(defaultVal)) defaultVal = 'default ' + defaultVal;
        if (!result[tableName]) result[tableName] = { tableComment: '', columns: [] };
        if (tableComment && !result[tableName].tableComment) result[tableName].tableComment = tableComment;
        result[tableName].columns.push({
            name: columnName, type, size, pk, fk: fkRaw, notNull, defaultVal,
            comment: columnComment,
        });
    }
    return result;
}

function escapeComment(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function tableDefsToDdl(tableDefs: Record<string, TableDef>): string {
    const lines: string[] = [];
    for (const [tableName, def] of Object.entries(tableDefs)) {
        const cols = def.columns;
        if (!cols.length) continue;
        const tableComment = def.tableComment ? ` COMMENT='${escapeComment(def.tableComment)}'` : '';
        const pkCols = cols.filter(c => c.pk).map(c => c.name);
        const colDefs = cols.map((c) => {
            let typeStr = c.type;
            if (['VARCHAR', 'CHAR', 'NVARCHAR', 'NCHAR'].includes(c.type) && c.size) typeStr += `(${c.size})`;
            if (c.type === 'DECIMAL' && c.size) typeStr += `(${c.size})`;
            let line = `  \`${c.name}\` ${typeStr}`;
            if (c.notNull) line += ' NOT NULL';
            if (c.defaultVal) {
                const d = c.defaultVal.replace(/^default\s+/i, '').trim();
                if (/^NOW\(\)|CURRENT_TIMESTAMP$/i.test(d)) line += ' DEFAULT CURRENT_TIMESTAMP';
                else if (/^'[^']*'$/.test(d) || /^\d+$/.test(d)) line += ` DEFAULT ${d}`;
                else line += ` DEFAULT ${d}`;
            }
            if (c.comment) line += ` COMMENT '${escapeComment(c.comment)}'`;
            return line;
        });
        if (pkCols.length) colDefs.push(`  PRIMARY KEY (\`${pkCols.join('`, `')}\`)`);
        const fkRefs = cols.filter(c => c.fk);
        for (const c of fkRefs) {
            const m = c.fk.match(/^([^.]+)\.([^.]+)$/);
            if (m) colDefs.push(`  CONSTRAINT \`fk_${tableName}_${c.name}\` FOREIGN KEY (\`${c.name}\`) REFERENCES \`${m[1]}\` (\`${m[2]}\`)`);
        }
        lines.push(`CREATE TABLE \`${tableName}\` (\n${colDefs.join(',\n')}\n)${tableComment};\n`);
    }
    return lines.join('\n');
}

/** 엑셀 파일 파싱 → DDL 문자열 */
function parseExcelToDdl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                if (!data || !(data instanceof ArrayBuffer)) {
                    reject(new Error('파일을 읽을 수 없습니다.'));
                    return;
                }
                const wb = XLSX.read(data, { type: 'array', cellDates: false });
                let allTableDefs: Record<string, TableDef> = {};

                for (const sheetName of wb.SheetNames) {
                    const sheet = wb.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as (string | number)[][];
                    if (!rows.length) continue;

                    const headerFound = findHeaderRowAndIndices(rows);
                    let startRow: number;
                    let idx: SheetColIdx;

                    if (headerFound) {
                        startRow = headerFound.headerRowIndex + 1;
                        idx = headerFound.idx;
                    } else {
                        const isHeaderRow = (r: (string | number)[]) =>
                            String(r[0] ?? '').trim() === '순번' || String(r[1] ?? '').trim() === '테이블명';
                        startRow = isHeaderRow(rows[0]) ? 1 : 0;
                        idx = {
                            tableName: 1,
                            tableNameKr: 2,
                            columnName: 3,
                            columnNameKr: 4,
                            type: 5,
                            size: 6,
                            pk: 7,
                            fk: 8,
                            notNull: 9,
                            default: 10,
                        };
                    }

                    const parsed = parseSheetToTableColumns(rows, startRow, idx);
                    for (const [t, def] of Object.entries(parsed)) {
                        if (!allTableDefs[t]) allTableDefs[t] = { tableComment: '', columns: [] };
                        if (def.tableComment && !allTableDefs[t].tableComment) allTableDefs[t].tableComment = def.tableComment;
                        const existingNames = new Set(allTableDefs[t].columns.map(c => c.name));
                        for (const c of def.columns) {
                            if (!existingNames.has(c.name)) {
                                existingNames.add(c.name);
                                allTableDefs[t].columns.push(c);
                            }
                        }
                    }
                }

                resolve(tableDefsToDdl(allTableDefs) || '-- 추출된 테이블이 없습니다.');
            } catch (err: any) {
                reject(err?.message || err || new Error('엑셀 파싱 실패'));
            }
        };
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsArrayBuffer(file);
    });
}

type UserTier = 'FREE' | 'PRO' | 'MASTER';

const TIER_LABELS: Record<UserTier, string> = {
    FREE: 'Free tier',
    PRO: 'Pro tier',
    MASTER: 'Master tier',
};

interface AdminUser {
    id: string;
    name: string;
    email: string;
    picture?: string;
    tier: UserTier;
    createdAt: string;
    lastLoginAt: string;
}

interface AdminProject {
    id: string;
    name: string;
    projectType: string;
    dbType: string;
    description?: string;
    updatedAt: string;
    /** 관리자가 선택한 회원 기준 마지막 편집(저장) 시각 */
    memberLastEditedAt?: string | null;
    memberCount: number;
}

type AdminTab = 'members' | 'projects' | 'accessLogs' | 'rollback' | 'ddl' | 'translation';

type AdminAccessLogRow = {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    projectId: string;
    projectName: string;
    accessedAt: string | null;
    kind?: string;
};

const ACCESS_LOG_PAGE_SIZES = [10, 50, 100] as const;
type AccessLogPageSize = (typeof ACCESS_LOG_PAGE_SIZES)[number];

interface AdminHistoryEntry {
    id: string;
    projectId: string;
    userId: string;
    userName: string;
    userPicture?: string;
    operationType: string;
    targetType: string;
    targetId: string;
    targetName: string;
    details: string;
    timestamp: string;
}

const AdminPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { user, updateUser } = useAuthStore();
    const [activeTab, setActiveTab] = useState<AdminTab>('members');
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [userProjects, setUserProjects] = useState<AdminProject[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);
    
    // 사용자 이름 편집 상태
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editingUserName, setEditingUserName] = useState('');
    const [nameUpdateLoading, setNameUpdateLoading] = useState(false);

    const [rollbackProjects, setRollbackProjects] = useState<AdminProject[]>([]);
    const [rollbackProjectSearch, setRollbackProjectSearch] = useState('');
    const [rollbackSelectedProjectId, setRollbackSelectedProjectId] = useState<string | null>(null);
    const [rollbackHistory, setRollbackHistory] = useState<AdminHistoryEntry[]>([]);
    const [rollbackHistoryLoading, setRollbackHistoryLoading] = useState(false);
    const [rollbackEntryToRollback, setRollbackEntryToRollback] = useState<AdminHistoryEntry | null>(null);
    const [rollbackSubmitLoading, setRollbackSubmitLoading] = useState(false);

    const [ddlResult, setDdlResult] = useState<string>('');
    const [ddlError, setDdlError] = useState<string | null>(null);
    const [ddlDragOver, setDdlDragOver] = useState(false);

    const [accessLogs, setAccessLogs] = useState<AdminAccessLogRow[]>([]);
    const [accessLogsLoading, setAccessLogsLoading] = useState(false);
    const [accessLogsPage, setAccessLogsPage] = useState(1);
    const [accessLogsPageSize, setAccessLogsPageSize] = useState<AccessLogPageSize>(50);
    const [accessLogsTotal, setAccessLogsTotal] = useState(0);
    const [accessLogsTotalPages, setAccessLogsTotalPages] = useState(1);

    type TranslationRow = { key: string; value: string; isEditing: boolean };
    const [translations, setTranslations] = useState<TranslationRow[]>(() =>
        Object.entries(getEffectiveMnDict()).map(([key, value]) => ({
            key,
            value: String(value ?? ''),
            isEditing: false,
        }))
    );
    const [transSearch, setTransSearch] = useState('');
    const [isAutoTranslating, setIsAutoTranslating] = useState(false);

    const handleEditTranslation = useCallback((key: string, newValue: string) => {
        setTranslations((prev) => prev.map((row) => (row.key === key ? { ...row, value: newValue } : row)));
    }, []);

    const toggleEdit = useCallback((key: string) => {
        setTranslations((prev) =>
            prev.map((row) => (row.key === key ? { ...row, isEditing: !row.isEditing } : row))
        );
    }, []);

    const filteredTranslations = useMemo(
        () =>
            translations.filter(
                (row) =>
                    row.key.toLowerCase().includes(transSearch.toLowerCase()) ||
                    row.value.toLowerCase().includes(transSearch.toLowerCase())
            ),
        [translations, transSearch]
    );

    const handleSaveMnTranslations = useCallback(() => {
        const dict = Object.fromEntries(translations.map((row) => [row.key, row.value]));
        persistMnDictSession(dict);
        alert(
            '세션에 저장했습니다. PPT_BETA 몽골어 보내기에 바로 반영됩니다. (탭을 닫거나 브라우저를 종료하면 코드 기본 사전으로 돌아갑니다.)'
        );
    }, [translations]);

    const onBackRef = useRef(onBack);
    onBackRef.current = onBack;

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        if (activeTab === 'projects' && selectedUserId) {
            fetchUserProjects(selectedUserId);
        } else {
            setUserProjects([]);
        }
    }, [activeTab, selectedUserId]);

    useEffect(() => {
        if (activeTab === 'rollback') {
            fetchRollbackProjects();
        } else {
            setRollbackProjects([]);
            setRollbackSelectedProjectId(null);
            setRollbackHistory([]);
        }
    }, [activeTab]);

    const fetchAccessLogs = useCallback(async (page: number, pageSize: AccessLogPageSize) => {
        setAccessLogsLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/access-logs?page=${page}&pageSize=${pageSize}`);
            if (!res.ok) {
                if (res.status === 403) {
                    setError('관리자 권한이 없습니다.');
                    return;
                }
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '접속 로그를 불러오지 못했습니다.');
            }
            const data = await res.json();
            if (data.items && Array.isArray(data.items)) {
                setAccessLogs(data.items);
                setAccessLogsTotal(typeof data.total === 'number' ? data.total : 0);
                setAccessLogsTotalPages(typeof data.totalPages === 'number' ? Math.max(1, data.totalPages) : 1);
                if (typeof data.page === 'number') setAccessLogsPage(data.page);
            } else {
                setAccessLogs([]);
                setAccessLogsTotal(0);
                setAccessLogsTotalPages(1);
            }
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
            setAccessLogs([]);
            setAccessLogsTotal(0);
            setAccessLogsTotalPages(1);
            if (err.message?.includes('세션')) onBackRef.current();
        } finally {
            setAccessLogsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'accessLogs') {
            void fetchAccessLogs(accessLogsPage, accessLogsPageSize);
        }
    }, [activeTab, accessLogsPage, accessLogsPageSize, fetchAccessLogs]);

    useEffect(() => {
        if (activeTab === 'rollback' && rollbackSelectedProjectId) {
            fetchRollbackHistory(rollbackSelectedProjectId);
        } else {
            setRollbackHistory([]);
        }
    }, [activeTab, rollbackSelectedProjectId]);

    const fetchUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/users`);
            if (!res.ok) {
                if (res.status === 403) {
                    setError('관리자 권한이 없습니다.');
                    return;
                }
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '회원 목록을 불러오지 못했습니다.');
            }
            const data = await res.json();
            setUsers(data);
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
            if (err.message?.includes('세션')) onBack();
        } finally {
            setLoading(false);
        }
    };

    const fetchUserProjects = async (userId: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/users/${userId}/projects`);
            if (!res.ok) {
                if (res.status === 403) {
                    setError('관리자 권한이 없습니다.');
                    return;
                }
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '프로젝트 목록을 불러오지 못했습니다.');
            }
            const data = await res.json();
            setUserProjects(data);
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
            if (err.message?.includes('세션')) onBack();
        } finally {
            setLoading(false);
        }
    };

    const handleTierChange = async (userId: string, tier: UserTier) => {
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/users/${userId}/tier`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '티어 변경에 실패했습니다.');
            }
            setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, tier } : u)));
            if (userId === user?.id) {
                updateUser({ tier });
            }
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
        }
    };

    const handleNameChange = async (userId: string, newName: string) => {
        if (!newName.trim()) {
            setError('사용자 이름을 입력해주세요.');
            return;
        }
        
        setNameUpdateLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/users/${userId}/name`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '이름 변경에 실패했습니다.');
            }
            setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, name: newName.trim() } : u)));
            if (userId === user?.id) {
                updateUser({ name: newName.trim() });
            }
            setEditingUserId(null);
            setEditingUserName('');
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
        } finally {
            setNameUpdateLoading(false);
        }
    };

    const startEditingName = (userId: string, currentName: string) => {
        setEditingUserId(userId);
        setEditingUserName(currentName);
        setError(null);
    };

    const cancelEditingName = () => {
        setEditingUserId(null);
        setEditingUserName('');
        setError(null);
    };

    const handleDeleteUser = async () => {
        if (!deleteTarget) return;
        if (!deletePassword.trim()) {
            setError('관리자 비밀번호를 입력해 주세요.');
            return;
        }
        setDeleteLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/users/${deleteTarget.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminPassword: deletePassword }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '회원 삭제에 실패했습니다.');
            }
            setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
            setDeleteTarget(null);
            setDeletePassword('');
            if (selectedUserId === deleteTarget.id) {
                setSelectedUserId(null);
                setUserProjects([]);
            }
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
        } finally {
            setDeleteLoading(false);
        }
    };

    const fetchRollbackProjects = async () => {
        setError(null);
        try {
            const url = `${API_BASE}/admin/projects${rollbackProjectSearch.trim() ? `?q=${encodeURIComponent(rollbackProjectSearch.trim())}` : ''}`;
            const res = await fetchWithAuth(url);
            if (!res.ok) {
                if (res.status === 403) setError('관리자 권한이 없습니다.');
                else throw new Error('프로젝트 목록을 불러오지 못했습니다.');
                return;
            }
            const data = await res.json();
            setRollbackProjects(data);
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
            if (err.message?.includes('세션')) onBack();
        }
    };

    const fetchRollbackHistory = async (projectId: string) => {
        setRollbackHistoryLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/projects/${projectId}/history?hours=24&limit=200`);
            if (!res.ok) {
                if (res.status === 403) setError('관리자 권한이 없습니다.');
                else throw new Error('히스토리를 불러오지 못했습니다.');
                return;
            }
            const data = await res.json();
            setRollbackHistory(data);
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
            setRollbackHistory([]);
        } finally {
            setRollbackHistoryLoading(false);
        }
    };

    const handleRollbackConfirm = async () => {
        if (!rollbackEntryToRollback || !rollbackSelectedProjectId) return;
        setRollbackSubmitLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/admin/projects/${rollbackSelectedProjectId}/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ historyId: rollbackEntryToRollback.id }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || '원복에 실패했습니다.');
            }
            setRollbackEntryToRollback(null);
            await fetchRollbackHistory(rollbackSelectedProjectId);
        } catch (err: any) {
            setError(err.message || '오류가 발생했습니다.');
        } finally {
            setRollbackSubmitLoading(false);
        }
    };

    const handleDdlFile = async (file: File | null) => {
        if (!file) return;
        const ok = /\.(xlsx|xls)$/i.test(file.name);
        if (!ok) {
            setDdlError('엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.');
            return;
        }
        setDdlError(null);
        setDdlResult('');
        try {
            const ddl = await parseExcelToDdl(file);
            setDdlResult(ddl);
        } catch (err: any) {
            setDdlError(err?.message || 'DDL 추출 실패');
        }
    };

    const formatDate = (d: string) => {
        if (!d) return '-';
        const date = new Date(d);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const accessLogKindLabel = (kind: string | undefined) => {
        switch (kind) {
            case 'SOCKET_JOIN':
                return '협업 소켓 입장';
            case 'YJS_CONNECT':
                return 'Yjs 연결';
            case 'MEMBER_SAVE':
                return '저장·동기화';
            default:
                return kind || '—';
        }
    };

    const projectTypeIcon = (type: string) => {
        switch (type) {
            case 'SCREEN_DESIGN': return <Monitor size={16} className="text-purple-500" />;
            case 'COMPONENT': return <Box size={16} className="text-teal-500" />;
            default: return <Database size={16} className="text-blue-500" />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                        >
                            <ArrowLeft size={20} />
                            <span className="font-bold">프로젝트 목록</span>
                        </button>
                        <div className="w-px h-6 bg-gray-200" />
                        <h1 className="text-lg font-black text-gray-900">관리자</h1>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-gray-100">
                    <div className="flex gap-1 pt-2">
                        <button
                            onClick={() => { setActiveTab('members'); setSelectedUserId(null); }}
                            className={`px-4 py-2.5 rounded-t-lg font-bold text-sm transition-all ${activeTab === 'members'
                                ? 'bg-white border border-b-0 border-gray-200 text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            <Users size={16} className="inline-block mr-2 align-middle" />
                            회원관리
                        </button>
                        <button
                            onClick={() => setActiveTab('projects')}
                            className={`px-4 py-2.5 rounded-t-lg font-bold text-sm transition-all ${activeTab === 'projects'
                                ? 'bg-white border border-b-0 border-gray-200 text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            <FolderOpen size={16} className="inline-block mr-2 align-middle" />
                            회원 프로젝트 목록
                        </button>
                        <button
                            onClick={() => {
                                setActiveTab('accessLogs');
                                setAccessLogsPage(1);
                            }}
                            className={`px-4 py-2.5 rounded-t-lg font-bold text-sm transition-all ${activeTab === 'accessLogs'
                                ? 'bg-white border border-b-0 border-gray-200 text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            <ScrollText size={16} className="inline-block mr-2 align-middle" />
                            로그관리
                        </button>
                        <button
                            onClick={() => { setActiveTab('rollback'); setRollbackEntryToRollback(null); }}
                            className={`px-4 py-2.5 rounded-t-lg font-bold text-sm transition-all ${activeTab === 'rollback'
                                ? 'bg-white border border-b-0 border-gray-200 text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            <RotateCcw size={16} className="inline-block mr-2 align-middle" />
                            작업 원복
                        </button>
                        <button
                            onClick={() => { setActiveTab('ddl'); setDdlError(null); setDdlResult(''); }}
                            className={`px-4 py-2.5 rounded-t-lg font-bold text-sm transition-all ${activeTab === 'ddl'
                                ? 'bg-white border border-b-0 border-gray-200 text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            <FileSpreadsheet size={16} className="inline-block mr-2 align-middle" />
                            DDL추출
                        </button>
                        <button
                            onClick={() => setActiveTab('translation')}
                            className={`px-4 py-2.5 rounded-t-lg font-bold text-sm transition-all ${activeTab === 'translation'
                                ? 'bg-white border border-b-0 border-gray-200 text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            <Languages size={16} className="inline-block mr-2 align-middle" />
                            번역관리
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
                {error && (
                    <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 text-sm font-medium">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                )}

                {!loading && activeTab === 'members' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">이름</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">이메일</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">티어</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">가입일</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">최근 로그인</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase w-20">삭제</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {u.picture ? (
                                                    <img src={u.picture} alt="" className="w-8 h-8 rounded-full" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                                                        {u.name?.[0] || '?'}
                                                    </div>
                                                )}
                                                {editingUserId === u.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="text"
                                                            value={editingUserName}
                                                            onChange={(e) => setEditingUserName(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    handleNameChange(u.id, editingUserName);
                                                                } else if (e.key === 'Escape') {
                                                                    cancelEditingName();
                                                                }
                                                            }}
                                                            className="text-sm font-medium px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                                            autoFocus
                                                            disabled={nameUpdateLoading}
                                                        />
                                                        <button
                                                            onClick={() => handleNameChange(u.id, editingUserName)}
                                                            disabled={nameUpdateLoading}
                                                            className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                                                            title="저장"
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                        <button
                                                            onClick={cancelEditingName}
                                                            disabled={nameUpdateLoading}
                                                            className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                                            title="취소"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-gray-900">{u.name}</span>
                                                        <button
                                                            onClick={() => startEditingName(u.id, u.name)}
                                                            className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                                            title="이름 변경"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{u.email}</td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={u.tier || 'FREE'}
                                                onChange={(e) => handleTierChange(u.id, e.target.value as UserTier)}
                                                className="text-sm font-medium px-2 py-1 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                            >
                                                <option value="FREE">{TIER_LABELS.FREE}</option>
                                                <option value="PRO">{TIER_LABELS.PRO}</option>
                                                <option value="MASTER">{TIER_LABELS.MASTER}</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(u.createdAt)}</td>
                                        <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(u.lastLoginAt)}</td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => setDeleteTarget(u)}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                title="회원 삭제"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {users.length === 0 && (
                            <div className="py-12 text-center text-gray-500 font-medium">등록된 회원이 없습니다.</div>
                        )}
                    </div>
                )}

                {!loading && activeTab === 'projects' && (
                    <div className="flex gap-6">
                        <div className="w-72 shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-sm text-gray-700">
                                회원 선택
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                                {users.length === 0 ? (
                                    <div className="p-4 text-sm text-gray-500">회원관리 탭에서 회원을 불러오세요.</div>
                                ) : (
                                    users.map((u) => (
                                        <button
                                            key={u.id}
                                            onClick={() => setSelectedUserId(u.id)}
                                            className={`w-full px-4 py-3 text-left flex items-center gap-2 transition-colors ${selectedUserId === u.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
                                        >
                                            {u.picture ? (
                                                <img src={u.picture} alt="" className="w-8 h-8 rounded-full shrink-0" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-sm shrink-0">
                                                    {u.name?.[0] || '?'}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-900 truncate">{u.name}</div>
                                                <div className="text-xs text-gray-500 truncate">{u.email}</div>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-sm text-gray-700">
                                {selectedUserId ? '프로젝트 목록' : '회원을 선택하면 프로젝트 목록이 표시됩니다.'}
                            </div>
                            {selectedUserId && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">프로젝트</th>
                                                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">유형</th>
                                                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">DB</th>
                                                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">멤버 수</th>
                                                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">회원 수정일</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {userProjects.map((p) => (
                                                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            {projectTypeIcon(p.projectType)}
                                                            {p.projectType}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600">{p.dbType}</td>
                                                    <td className="px-4 py-3 text-gray-600">{p.memberCount}</td>
                                                    <td
                                                        className="px-4 py-3 text-gray-500 text-sm"
                                                        title={p.memberLastEditedAt ? undefined : '이 회원의 편집 기록이 없어 프로젝트 전체 수정일을 표시합니다.'}
                                                    >
                                                        {p.memberLastEditedAt
                                                            ? formatDate(p.memberLastEditedAt)
                                                            : formatDate(p.updatedAt)}
                                                        {!p.memberLastEditedAt && (
                                                            <span className="block text-[10px] text-gray-400 font-medium mt-0.5">(프로젝트 기준)</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {userProjects.length === 0 && (
                                        <div className="py-12 text-center text-gray-500 font-medium">프로젝트가 없습니다.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'projects' && users.length === 0 && !loading && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-amber-800 text-sm font-medium">
                        회원 프로젝트 목록을 보려면 먼저 회원관리 탭에서 회원 목록을 불러오세요.
                    </div>
                )}

                {!loading && activeTab === 'accessLogs' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-sm text-gray-700">
                            회원–프로젝트 활동 로그
                        </div>
                        <p className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100 leading-relaxed">
                            서버의 <code className="text-gray-600">project_access_logs</code>에 기록되며, <strong className="text-gray-600">약 5일 보관</strong> 후 삭제됩니다(관리자 목록 조회 시에도 만료분 정리). 최신 순입니다. 협업 소켓 입장(SOCKET_JOIN)은 사용자·프로젝트당 최신 1건만 남깁니다. 그 외 유형은 짧은 간격(접속 2분·저장 10분) 내 중복 기록을 생략합니다.
                        </p>
                        <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/80">
                            <span className="text-sm text-gray-600 font-medium">
                                총 <span className="text-gray-900 font-bold">{accessLogsTotal}</span>건
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                                <label className="text-xs text-gray-500 font-medium whitespace-nowrap">페이지당</label>
                                <select
                                    value={accessLogsPageSize}
                                    onChange={(e) => {
                                        const v = Number(e.target.value) as AccessLogPageSize;
                                        const next = ACCESS_LOG_PAGE_SIZES.includes(v as AccessLogPageSize) ? (v as AccessLogPageSize) : 50;
                                        setAccessLogsPageSize(next);
                                        setAccessLogsPage(1);
                                    }}
                                    className="text-sm font-medium px-2 py-1.5 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                >
                                    {ACCESS_LOG_PAGE_SIZES.map((n) => (
                                        <option key={n} value={n}>{n}개</option>
                                    ))}
                                </select>
                                <div className="flex items-center gap-1 ml-1">
                                    <button
                                        type="button"
                                        disabled={accessLogsPage <= 1 || accessLogsLoading}
                                        onClick={() => setAccessLogsPage((p) => Math.max(1, p - 1))}
                                        className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label="이전 페이지"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <span className="text-sm text-gray-700 font-bold tabular-nums px-2 min-w-[5.5rem] text-center">
                                        {accessLogsPage} / {accessLogsTotalPages}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={accessLogsPage >= accessLogsTotalPages || accessLogsLoading}
                                        onClick={() => setAccessLogsPage((p) => Math.min(accessLogsTotalPages, p + 1))}
                                        className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label="다음 페이지"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        {accessLogsLoading ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                            </div>
                        ) : (
                            <>
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">이름</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">이메일</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">활동 일시</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">프로젝트명</th>
                                            <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">유형</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {accessLogs.map((row) => (
                                            <tr key={row.id || `${row.userId}-${row.projectId}-${row.accessedAt}`} className="border-b border-gray-100 hover:bg-gray-50">
                                                <td className="px-4 py-3 font-medium text-gray-900">{row.userName}</td>
                                                <td className="px-4 py-3 text-gray-600">{row.userEmail}</td>
                                                <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(row.accessedAt ?? '')}</td>
                                                <td className="px-4 py-3 text-gray-900">{row.projectName || '—'}</td>
                                                <td className="px-4 py-3 text-gray-600 text-sm">{accessLogKindLabel(row.kind)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {accessLogs.length === 0 && (
                                    <div className="py-12 text-center text-gray-500 font-medium">표시할 로그가 없습니다.</div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'translation' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <Languages size={20} className="text-violet-600" />
                                <h3 className="font-bold text-gray-900">번역 메모리 관리</h3>
                                <span className="ml-2 px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full text-xs font-bold">
                                    {translations.length}개 항목
                                </span>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text"
                                        value={transSearch}
                                        onChange={(e) => setTransSearch(e.target.value)}
                                        placeholder="한글 또는 번역어 검색..."
                                        className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none w-64 transition-all"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAutoTranslating(true);
                                        setTimeout(() => {
                                            alert('기계 번역 초안을 불러왔습니다. (시뮬레이션)');
                                            setIsAutoTranslating(false);
                                        }, 1000);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all"
                                >
                                    <RefreshCw size={16} className={isAutoTranslating ? 'animate-spin' : ''} />
                                    일괄 자동 번역
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50/50 sticky top-0 z-10 backdrop-blur-md">
                                    <tr className="h-11 align-middle">
                                        <th className="h-11 px-6 py-0 align-middle text-xs font-bold text-gray-500 uppercase tracking-wider w-1/3">
                                            한글 원문 (Key)
                                        </th>
                                        <th className="h-11 px-6 py-0 align-middle text-xs font-bold text-gray-500 uppercase tracking-wider w-1/3">
                                            몽골어 번역 (Translation)
                                        </th>
                                        <th className="h-11 px-6 py-0 align-middle text-xs font-bold text-gray-500 uppercase tracking-wider w-24 text-center">
                                            상태
                                        </th>
                                        <th className="h-11 px-6 py-0 align-middle text-xs font-bold text-gray-500 uppercase tracking-wider w-24 text-center">
                                            관리
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredTranslations.map((row) => (
                                        <tr key={row.key} className="h-11 align-middle hover:bg-gray-50/80 transition-colors">
                                            <td className="h-11 px-6 py-0 align-middle">
                                                <span className="text-sm font-medium text-gray-900 leading-none">{row.key}</span>
                                            </td>
                                            <td className="h-11 px-6 py-0 align-middle">
                                                {row.isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={row.value}
                                                        onChange={(e) => handleEditTranslation(row.key, e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && toggleEdit(row.key)}
                                                        className="w-full h-8 px-2 py-0 text-sm border border-violet-300 rounded-md focus:ring-2 focus:ring-violet-500/20 outline-none"
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <span
                                                        className={`text-sm leading-none ${row.value ? 'text-gray-600' : 'text-red-400 italic'}`}
                                                    >
                                                        {row.value || '미번역 항목'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="h-11 px-6 py-0 align-middle text-center">
                                                {row.value ? (
                                                    <span className="inline-flex items-center justify-center px-2 py-0.5 bg-green-50 text-green-600 rounded-md text-[10px] font-bold leading-none">
                                                        완료
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center justify-center px-2 py-0.5 bg-red-50 text-red-600 rounded-md text-[10px] font-bold leading-none">
                                                        미비
                                                    </span>
                                                )}
                                            </td>
                                            <td className="h-11 px-6 py-0 align-middle text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleEdit(row.key)}
                                                    className={`inline-flex items-center justify-center p-1.5 rounded-lg transition-all ${
                                                        row.isEditing
                                                            ? 'text-green-600 bg-green-50 hover:bg-green-100'
                                                            : 'text-gray-400 hover:text-violet-600 hover:bg-violet-50'
                                                    }`}
                                                >
                                                    {row.isEditing ? <Check size={18} /> : <Edit2 size={18} />}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {filteredTranslations.length === 0 && (
                                <div className="py-20 text-center flex flex-col items-center justify-center">
                                    <Globe size={40} className="text-gray-200 mb-2" />
                                    <p className="text-gray-500 text-sm">검색 결과와 일치하는 단어가 없습니다.</p>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-[11px] text-gray-500 flex flex-wrap justify-between items-center gap-3">
                            <span>
                                * 기본 사전은 <code className="font-mono text-gray-700">src/utils/translation.ts</code>의{' '}
                                <code className="font-mono text-gray-700">mnDict</code>입니다. [변경사항 일괄 저장] 시{' '}
                                <code className="font-mono text-gray-700">sessionStorage</code>에 합쳐 저장되어 같은 탭에서 PPT
                                몽골어 보내기에 반영됩니다.
                            </span>
                            <button
                                type="button"
                                onClick={handleSaveMnTranslations}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg font-bold hover:bg-violet-700 transition-all shadow-sm shrink-0"
                            >
                                <Save size={14} />
                                변경사항 일괄 저장
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'ddl' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-sm text-gray-700">
                            DDL 추출 — 엑셀 파일 업로드
                        </div>
                        <p className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
                            컬럼 구성: 순번(A), 테이블명(B), 테이블한글명(C), 컬럼명(D), 컬럼한글명(E), 타입(F), 크기(G), PK(H), FK(I), NOT NULL(J), Default(K). 업로드 시 CREATE TABLE DDL로 변환됩니다.
                        </p>
                        <div
                            className={`mx-4 mt-4 rounded-xl border-2 border-dashed transition-colors ${ddlDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50/50'}`}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDdlDragOver(true); }}
                            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDdlDragOver(false); }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDdlDragOver(false);
                                const file = e.dataTransfer.files?.[0];
                                handleDdlFile(file ?? null);
                            }}
                        >
                            <div className="p-6 flex flex-col sm:flex-row items-center justify-center gap-4">
                                <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm cursor-pointer hover:bg-blue-700 transition-colors shrink-0">
                                    <FileSpreadsheet size={18} />
                                    엑셀 파일 선택
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls"
                                        className="sr-only"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            handleDdlFile(file ?? null);
                                        }}
                                    />
                                </label>
                                <span className="text-sm text-gray-500">또는</span>
                                <span className="text-sm text-gray-600 font-medium">여기에 엑셀 파일을 드래그하여 놓으세요</span>
                            </div>
                        </div>
                        <div className="p-4 flex flex-wrap items-center gap-3">
                            {ddlResult && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(ddlResult);
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-sm text-gray-700 transition-colors"
                                >
                                    <Copy size={16} /> 복사
                                </button>
                            )}
                        </div>
                        {ddlError && (
                            <div className="mx-4 mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium">
                                {ddlError}
                            </div>
                        )}
                        {ddlResult && (
                            <div className="px-4 pb-4">
                                <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg text-sm overflow-x-auto max-h-[480px] overflow-y-auto whitespace-pre font-mono">
                                    {ddlResult}
                                </pre>
                            </div>
                        )}
                    </div>
                )}

                {!loading && activeTab === 'rollback' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-sm text-gray-700">
                                프로젝트 선택 (최근 24시간 삭제 이력 · 원복 시 해당 항목만 복원)
                            </div>
                            <div className="p-4 flex flex-wrap items-center gap-2">
                                <div className="flex flex-1 min-w-[200px] flex-wrap items-center gap-2">
                                    <input
                                        type="text"
                                        value={rollbackProjectSearch}
                                        onChange={(e) => setRollbackProjectSearch(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && fetchRollbackProjects()}
                                        placeholder="프로젝트 이름 검색"
                                        className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={fetchRollbackProjects}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700"
                                    >
                                        <Search size={16} /> 검색
                                    </button>
                                </div>
                            </div>
                            <div className="border-t border-gray-100 max-h-[220px] overflow-y-auto">
                                {rollbackProjects.length === 0 ? (
                                    <div className="p-4 text-sm text-gray-500">검색 버튼을 눌러 프로젝트 목록을 불러오세요.</div>
                                ) : (
                                    <ul className="divide-y divide-gray-100">
                                        {rollbackProjects.map((p) => (
                                            <li key={p.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setRollbackSelectedProjectId(p.id)}
                                                    className={`w-full px-4 py-3 text-left flex items-center gap-2 transition-colors ${rollbackSelectedProjectId === p.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
                                                >
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {projectTypeIcon(p.projectType)}
                                                        {p.projectType}
                                                    </span>
                                                    <span className="font-medium text-gray-900 truncate">{p.name}</span>
                                                    <span className="text-xs text-gray-500 ml-auto shrink-0">{formatDate(p.updatedAt)}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        {rollbackSelectedProjectId && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                                    <div className="font-bold text-sm text-gray-700">최근 24시간 삭제 이력</div>
                                    <div className="text-xs text-gray-500 mt-0.5">테이블, 관계, 화면, 연결선, 컬럼, 표·그리기 요소(화면 내) 삭제만 표시됩니다.</div>
                                </div>
                                {rollbackHistoryLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                                        {rollbackHistory.length === 0 ? (
                                            <div className="p-8 text-center text-gray-500 text-sm">이 기간 내 삭제된 항목이 없습니다.</div>
                                        ) : (
                                            rollbackHistory.map((entry) => (
                                                <div
                                                    key={entry.id}
                                                    className="px-4 py-3 flex flex-wrap items-center gap-2 sm:gap-4"
                                                >
                                                    <span className="text-xs text-gray-500 shrink-0 w-20 sm:w-24">
                                                        {formatDate(entry.timestamp)}
                                                    </span>
                                                    <span className="text-sm font-medium text-gray-700 shrink-0">{entry.userName}</span>
                                                    <span className="text-sm font-medium text-gray-900 truncate min-w-0 flex-1" title={entry.details}>
                                                        {entry.details}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setRollbackEntryToRollback(entry)}
                                                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200"
                                                    >
                                                        <RotateCcw size={14} /> 원복
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* 회원 삭제 확인 모달 */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">회원 삭제</h3>
                        <p className="text-gray-600 text-sm mb-4">
                            <span className="font-medium">{deleteTarget.name}</span>({deleteTarget.email}) 회원을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                        </p>
                        <p className="text-amber-700 text-sm mb-4 font-medium">관리자 비밀번호를 입력해 주세요.</p>
                        <input
                            type="password"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            placeholder="비밀번호"
                            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none mb-6"
                            autoFocus
                        />
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setDeleteTarget(null);
                                    setDeletePassword('');
                                }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleDeleteUser}
                                disabled={deleteLoading || !deletePassword.trim()}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {deleteLoading ? '처리 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 작업 원복 확인 모달 */}
            {rollbackEntryToRollback && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">삭제 항목 원복</h3>
                        <p className="text-gray-600 text-sm mb-2">
                            삭제된 항목만 복원합니다. 다른 데이터에는 영향을 주지 않고, 해당 항목만 다시 추가됩니다.
                        </p>
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                            <div className="font-medium text-gray-700">{rollbackEntryToRollback.details}</div>
                            <div className="text-gray-500 mt-1">{rollbackEntryToRollback.userName} · {formatDate(rollbackEntryToRollback.timestamp)}</div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setRollbackEntryToRollback(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleRollbackConfirm}
                                disabled={rollbackSubmitLoading}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {rollbackSubmitLoading ? '처리 중...' : '원복 실행'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPage;
