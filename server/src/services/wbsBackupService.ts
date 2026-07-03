import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { Project } from '../models/Project';
import logger from '../utils/logger';

export type WbsBackupKind = 'wbs-detail' | 'wbs-schedule';

export interface WbsBackupManifest {
    projects: Record<string, Partial<Record<WbsBackupKind, string>>>;
}

export interface WbsBackupFileMeta {
    filename: string;
    projectId: string;
    projectName: string;
    backupKind: WbsBackupKind;
    backupKindLabel: string;
    backedUpAt: string;
    wbsVersion?: number;
    sizeBytes: number;
}

const MANIFEST_NAME = 'manifest.json';

const BACKUP_KIND_LABEL: Record<WbsBackupKind, string> = {
    'wbs-detail': '메뉴·개발상세',
    'wbs-schedule': '간트·일정',
};

function backupDir(): string {
    return config.backup.dir;
}

function manifestPath(): string {
    return path.join(backupDir(), MANIFEST_NAME);
}

function safeSegment(s: string): string {
    return (s || 'WBS').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

function hashPayload(obj: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function readManifest(): WbsBackupManifest {
    const p = manifestPath();
    if (!fs.existsSync(p)) return { projects: {} };
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as WbsBackupManifest;
        return { projects: raw.projects ?? {} };
    } catch {
        return { projects: {} };
    }
}

function writeManifest(manifest: WbsBackupManifest): void {
    const content = JSON.stringify(manifest, null, 2);
    const p = manifestPath();
    try {
        if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === content) return;
    } catch {
        // 읽기 실패 시 덮어씀
    }
    fs.writeFileSync(p, content, 'utf8');
}

function isoFileTimestamp(d: Date): string {
    return d.toISOString().replace(/[:.]/g, '-');
}

function buildFilename(projectId: string, projectName: string, kind: WbsBackupKind, at: Date): string {
    return `${projectId}__${safeSegment(projectName)}__${kind}__${isoFileTimestamp(at)}.json`;
}

export function ensureBackupDir(): void {
    fs.mkdirSync(backupDir(), { recursive: true });
}

/** 백업 파일명 → 절대 경로 (path traversal 방지) */
export function resolveBackupFilePath(filename: string): string | null {
    const base = path.basename(filename);
    if (!base || base !== filename || base.includes('..')) return null;
    if (!base.endsWith('.json') || base === MANIFEST_NAME) return null;
    const full = path.join(backupDir(), base);
    const resolved = path.resolve(full);
    const root = path.resolve(backupDir());
    if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
    if (!fs.existsSync(resolved)) return null;
    return resolved;
}

function parseBackupFilename(filename: string): {
    projectId: string;
    projectName: string;
    backupKind: WbsBackupKind;
    backedUpAt: string;
} | null {
    const m = filename.match(/^(.+?)__(.+?)__(wbs-detail|wbs-schedule)__(.+)\.json$/);
    if (!m) return null;
    const [, projectId, projectName, kind, tsPart] = m;
    if (kind !== 'wbs-detail' && kind !== 'wbs-schedule') return null;
    const backedUpAt = tsPart.replace(/-/g, (ch, i) => {
        if (i === 4 || i === 7) return '-';
        if (i === 13 || i === 16) return ':';
        if (i === 19) return '.';
        return ch;
    });
    return { projectId, projectName, backupKind: kind, backedUpAt };
}

/** 관리자 다운로드용 파일명: `{프로젝트명}_backup_{YYYYMMDD}.{ext}` */
export function buildBackupDownloadFilename(
    projectName: string,
    backedUpAt: string,
    ext: 'json' | 'xlsx',
): string {
    const d = new Date(backedUpAt);
    const y = Number.isNaN(d.getTime()) ? new Date() : d;
    const ymd = [
        y.getFullYear(),
        String(y.getMonth() + 1).padStart(2, '0'),
        String(y.getDate()).padStart(2, '0'),
    ].join('');
    const safeName = safeSegment(projectName);
    return `${safeName}_backup_${ymd}.${ext}`;
}

export function readBackupFileMeta(filePath: string, filename: string): {
    projectId: string;
    projectName: string;
    backedUpAt: string;
} {
    try {
        const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
            projectId: String(doc.projectId ?? ''),
            projectName: String(doc.projectName ?? 'WBS'),
            backedUpAt: String(doc.backedUpAt ?? new Date().toISOString()),
        };
    } catch {
        const parsed = parseBackupFilename(filename);
        return {
            projectId: parsed?.projectId ?? 'unknown',
            projectName: parsed?.projectName ?? 'WBS',
            backedUpAt: parsed?.backedUpAt ?? new Date().toISOString(),
        };
    }
}

export function listBackupFiles(): WbsBackupFileMeta[] {
    ensureBackupDir();
    const files = fs.readdirSync(backupDir()).filter((f) => f.endsWith('.json') && f !== MANIFEST_NAME);
    const result: WbsBackupFileMeta[] = [];

    for (const filename of files) {
        const parsed = parseBackupFilename(filename);
        const full = path.join(backupDir(), filename);
        let stat: fs.Stats;
        try {
            stat = fs.statSync(full);
        } catch {
            continue;
        }

        let projectName = parsed?.projectName ?? '알 수 없음';
        let projectId = parsed?.projectId ?? '';
        let backupKind: WbsBackupKind = parsed?.backupKind ?? 'wbs-detail';
        let backedUpAt = parsed?.backedUpAt ?? stat.mtime.toISOString();
        let wbsVersion: number | undefined;

        try {
            const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
            if (doc.projectName) projectName = doc.projectName;
            if (doc.projectId) projectId = doc.projectId;
            if (doc.backupKind === 'wbs-detail' || doc.backupKind === 'wbs-schedule') backupKind = doc.backupKind;
            if (doc.backedUpAt) backedUpAt = doc.backedUpAt;
            if (typeof doc.wbsVersion === 'number') wbsVersion = doc.wbsVersion;
        } catch {
            // 파일명·mtime 기준으로 표시
        }

        result.push({
            filename,
            projectId,
            projectName,
            backupKind,
            backupKindLabel: BACKUP_KIND_LABEL[backupKind],
            backedUpAt,
            wbsVersion,
            sizeBytes: stat.size,
        });
    }

    return result.sort((a, b) => new Date(b.backedUpAt).getTime() - new Date(a.backedUpAt).getTime());
}

async function backupProjectKind(
    project: { _id: { toString(): string }; name: string; wbsSnapshot?: any },
    kind: WbsBackupKind,
    manifest: WbsBackupManifest,
): Promise<boolean> {
    const projectId = project._id.toString();
    const snap = project.wbsSnapshot ?? {};
    const payload =
        kind === 'wbs-detail'
            ? { menus: snap.menus ?? [], rows: snap.rows ?? [] }
            : {
                  projectSchedule: snap.projectSchedule ?? null,
                  detailSchedules: snap.detailSchedules ?? [],
              };

    const hash = hashPayload(payload);
    const prev = manifest.projects[projectId]?.[kind];
    if (prev === hash) return false;

    const at = new Date();
    const filename = buildFilename(projectId, project.name, kind, at);
    const doc = {
        type: 'WBS_BACKUP',
        backupKind: kind,
        projectId,
        projectName: project.name,
        projectType: 'WBS',
        wbsVersion: snap.version ?? 0,
        backedUpAt: at.toISOString(),
        payload,
    };

    fs.writeFileSync(path.join(backupDir(), filename), JSON.stringify(doc, null, 2), 'utf8');

    if (!manifest.projects[projectId]) manifest.projects[projectId] = {};
    manifest.projects[projectId][kind] = hash;

    logger.info(`WBS backup saved: ${filename}`);
    return true;
}

export async function runWbsBackups(): Promise<{ saved: number; skipped: number }> {
    ensureBackupDir();
    const projects = await Project.find({ projectType: 'WBS' })
        .select('name wbsSnapshot')
        .lean();

    const manifest = readManifest();
    let saved = 0;
    let skipped = 0;

    for (const p of projects) {
        const okDetail = await backupProjectKind(p as any, 'wbs-detail', manifest);
        const okSchedule = await backupProjectKind(p as any, 'wbs-schedule', manifest);
        if (okDetail) saved++;
        else skipped++;
        if (okSchedule) saved++;
        else skipped++;
    }

    writeManifest(manifest);
    return { saved, skipped };
}

let backupTimer: ReturnType<typeof setInterval> | null = null;

export function startWbsBackupScheduler(): void {
    ensureBackupDir();
    const interval = config.backup.intervalMs;

    void runWbsBackups().catch((err) => logger.error('Initial WBS backup failed: %o', err));

    if (backupTimer) clearInterval(backupTimer);
    backupTimer = setInterval(() => {
        void runWbsBackups().catch((err) => logger.error('Scheduled WBS backup failed: %o', err));
    }, interval);

    logger.info(`WBS backup scheduler started (every ${Math.round(interval / 3600000)}h) → ${backupDir()}`);
}
