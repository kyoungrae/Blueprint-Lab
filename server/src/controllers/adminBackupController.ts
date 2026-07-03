import { Response } from 'express';
import fs from 'fs';
import { AuthRequest } from '../middleware/authMiddleware';
import {
    listBackupFiles,
    resolveBackupFilePath,
    runWbsBackups,
    buildBackupDownloadFilename,
    readBackupFileMeta,
} from '../services/wbsBackupService';
import { buildWbsExcelBuffer } from '../services/wbsExcelExport';
import logger from '../utils/logger';

export const getAdminBackups = async (_req: AuthRequest, res: Response) => {
    try {
        const items = listBackupFiles();
        res.json(items);
    } catch (error) {
        logger.error('getAdminBackups error: %o', error);
        res.status(500).json({ message: '백업 목록을 불러오는 중 오류가 발생했습니다.' });
    }
};

export const triggerAdminBackup = async (_req: AuthRequest, res: Response) => {
    try {
        const result = await runWbsBackups();
        res.json({ message: '백업을 실행했습니다.', ...result });
    } catch (error) {
        logger.error('triggerAdminBackup error: %o', error);
        res.status(500).json({ message: '백업 실행 중 오류가 발생했습니다.' });
    }
};

export const downloadAdminBackupJson = async (req: AuthRequest, res: Response) => {
    try {
        const { filename } = req.params;
        const filePath = resolveBackupFilePath(filename);
        if (!filePath) {
            return res.status(404).json({ message: '백업 파일을 찾을 수 없습니다.' });
        }
        const meta = readBackupFileMeta(filePath, filename);
        const downloadName = buildBackupDownloadFilename(meta.projectName, meta.backedUpAt, 'json');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
        fs.createReadStream(filePath).pipe(res);
    } catch (error) {
        logger.error('downloadAdminBackupJson error: %o', error);
        res.status(500).json({ message: '백업 파일 다운로드 중 오류가 발생했습니다.' });
    }
};

export const downloadAdminBackupExcel = async (req: AuthRequest, res: Response) => {
    try {
        const { filename } = req.params;
        const filePath = resolveBackupFilePath(filename);
        if (!filePath) {
            return res.status(404).json({ message: '백업 파일을 찾을 수 없습니다.' });
        }

        const raw = fs.readFileSync(filePath, 'utf8');
        const doc = JSON.parse(raw);
        if (doc.backupKind !== 'wbs-detail') {
            return res.status(400).json({ message: '메뉴·개발상세 백업만 엑셀로 변환할 수 있습니다.' });
        }

        const payload = doc.payload ?? {};
        const menus = Array.isArray(payload.menus) ? payload.menus : [];
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        const projectName = doc.projectName ?? 'WBS';
        const backedUpAt = String(doc.backedUpAt ?? new Date().toISOString());

        const buffer = buildWbsExcelBuffer({ menus, rows }, projectName);
        const excelName = buildBackupDownloadFilename(projectName, backedUpAt, 'xlsx');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(excelName)}"`);
        res.send(buffer);
    } catch (error) {
        logger.error('downloadAdminBackupExcel error: %o', error);
        res.status(500).json({ message: '엑셀 변환 중 오류가 발생했습니다.' });
    }
};
