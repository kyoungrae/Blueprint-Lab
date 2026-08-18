import path from 'path';
import { Response } from 'express';
import { Types } from 'mongoose';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/authMiddleware';
import {
    buildWbsScheduleImportPreview,
    type ScheduleImportPreview,
} from '../services/wbsScheduleImportService';
import {
    createScheduleImportBackup,
    finalizeScheduleImportAudit,
} from '../services/wbsBackupService';
import {
    applyWbsScheduleImportInYjs,
    readWbsScheduleSnapshotInYjs,
} from '../websocket/YjsServer';
import { touchProjectMemberLastEditedAt } from '../services/projectMemberActivity';
import logger from '../utils/logger';

type UploadRequest = AuthRequest & { file?: Express.Multer.File };

function publicPreview(preview: ScheduleImportPreview) {
    const { added: _added, updates: _updates, ...safePreview } = preview;
    return safePreview;
}

async function authorizeScheduleImport(req: AuthRequest): Promise<{
    project: { _id: Types.ObjectId; name: string; wbsSnapshot?: { version?: number } };
    user: { id: string; name: string };
} | null> {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId || !Types.ObjectId.isValid(id)) return null;

    const [project, user] = await Promise.all([
        Project.findOne({
            _id: id,
            projectType: 'WBS',
            'members.userId': new Types.ObjectId(userId),
        }).select('name members wbsSnapshot.version').lean(),
        User.findById(userId).select('name tier').lean(),
    ]);
    if (!project || !user) return null;
    const member = project.members?.find((item: any) => String(item.userId) === userId);
    if (member?.role === 'VIEWER') {
        const error = new Error('수정 권한이 없습니다.');
        (error as Error & { statusCode?: number }).statusCode = 403;
        throw error;
    }
    if (user.tier !== 'MASTER' && user.tier !== 'ADMIN') {
        const error = new Error('일정 엑셀 업로드는 Master tier 이상에서 사용할 수 있습니다.');
        (error as Error & { statusCode?: number }).statusCode = 403;
        throw error;
    }
    return {
        project: project as any,
        user: { id: userId, name: user.name || '알 수 없음' },
    };
}

function uploadFileOrError(req: UploadRequest): Buffer {
    const file = req.file;
    if (!file?.buffer?.length) throw new Error('업로드할 엑셀 파일이 필요합니다.');
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') throw new Error('`.xlsx` 또는 `.xls` 파일만 업로드할 수 있습니다.');
    return file.buffer;
}

function messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : '일정 import 처리 중 알 수 없는 오류가 발생했습니다.';
}

/**
 * 파일과 현재 Yjs 일정 원본을 비교만 한다. 이 엔드포인트는 DB/Yjs write를 하지 않는다.
 */
export const previewWbsScheduleImport = async (req: UploadRequest, res: Response) => {
    try {
        const authorized = await authorizeScheduleImport(req);
        if (!authorized) return res.status(404).json({ message: 'WBS 프로젝트를 찾을 수 없거나 접근 권한이 없습니다.' });
        const buffer = uploadFileOrError(req);
        const current = await readWbsScheduleSnapshotInYjs(authorized.project._id.toString());
        const preview = buildWbsScheduleImportPreview(buffer, current);
        return res.json(publicPreview(preview));
    } catch (error) {
        const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 422;
        logger.warn('previewWbsScheduleImport rejected: %s', messageFrom(error));
        return res.status(statusCode).json({ message: messageFrom(error) });
    }
};

/**
 * 최종 확인 후에만 실행한다. 서버에서 파일/현재 스냅샷을 다시 검증한 뒤,
 * 백업 생성 성공 → 일정 Y.Map 단일 transaction → MongoDB detailSchedules 저장 순서로 처리한다.
 */
export const applyWbsScheduleImport = async (req: UploadRequest, res: Response) => {
    let backupFilename: string | null = null;
    try {
        const authorized = await authorizeScheduleImport(req);
        if (!authorized) return res.status(404).json({ message: 'WBS 프로젝트를 찾을 수 없거나 접근 권한이 없습니다.' });
        const buffer = uploadFileOrError(req);
        const expectedBaseSnapshotHash = String(req.body?.baseSnapshotHash ?? '');
        const expectedPreviewHash = String(req.body?.previewHash ?? '');
        if (!expectedBaseSnapshotHash || !expectedPreviewHash) {
            return res.status(400).json({ message: '미리보기 확인 정보가 없습니다. 파일을 다시 분석하세요.' });
        }

        const projectId = authorized.project._id.toString();
        const current = await readWbsScheduleSnapshotInYjs(projectId);
        const preview = buildWbsScheduleImportPreview(buffer, current);
        if (preview.baseSnapshotHash !== expectedBaseSnapshotHash || preview.previewHash !== expectedPreviewHash) {
            return res.status(409).json({ message: '미리보기 이후 일정 또는 파일 내용이 변경되었습니다. 최신 상태로 다시 미리보기를 실행하세요.' });
        }
        if (!preview.canApply) {
            return res.status(422).json({
                message: '충돌·중복·형식 오류가 있는 파일은 부분 반영할 수 없습니다. 모든 제외/충돌 행을 해결한 뒤 다시 시도하세요.',
                preview: publicPreview(preview),
            });
        }
        if (preview.summary.added === 0 && preview.summary.updated === 0) {
            return res.json({
                message: '변경할 일정이 없습니다. 기존 일정은 그대로 유지했습니다.',
                noChanges: true,
                preview: publicPreview(preview),
            });
        }

        // 백업 생성 실패 시 여기서 throw되어 Yjs/MongoDB 변경은 전혀 시작되지 않는다.
        const backup = createScheduleImportBackup({
            projectId,
            projectName: authorized.project.name,
            wbsVersion: authorized.project.wbsSnapshot?.version,
            sourceFileName: path.basename(req.file!.originalname),
            uploadedBy: authorized.user,
            detailSchedules: current,
            affectedScheduleIds: [
                ...preview.updates.map((update) => update.id),
                ...preview.added.map((schedule) => schedule.id),
            ],
            importPreview: {
                sourceRowCount: preview.sourceRowCount,
                summary: preview.summary,
            },
        });
        backupFilename = backup.filename;

        const detailSchedules = await applyWbsScheduleImportInYjs(projectId, {
            expectedBaseSnapshotHash,
            added: preview.added,
            updates: preview.updates,
        });
        const actualChangedScheduleIds = [
            ...preview.updates.map((update) => update.id),
            ...preview.added.map((schedule) => schedule.id),
        ];
        finalizeScheduleImportAudit(backup.filename, {
            status: 'COMPLETED',
            actualChangedScheduleIds,
        });
        await touchProjectMemberLastEditedAt(projectId, authorized.user.id);

        return res.json({
            message: '일정 import를 안전하게 반영했습니다.',
            backup: { id: backup.backupId, filename: backup.filename, backedUpAt: backup.backedUpAt },
            changedScheduleIds: actualChangedScheduleIds,
            detailScheduleCount: detailSchedules.length,
            preview: publicPreview(preview),
        });
    } catch (error) {
        const message = messageFrom(error);
        if (backupFilename) {
            try {
                finalizeScheduleImportAudit(backupFilename, { status: 'FAILED', failureReason: message });
            } catch (auditError) {
                logger.error('WBS schedule import audit finalization failed: %o', auditError);
            }
        }
        const statusCode = message.includes('최신 상태') || message.includes('변경되었습니다') ? 409 : 500;
        logger.error('applyWbsScheduleImport error: %o', error);
        return res.status(statusCode).json({ message });
    }
};
