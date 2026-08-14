import { Router } from 'express';
import multer from 'multer';
import { createProject, getProjects, deleteProject, updateProject, getProject, getProjectScreensDebug, createInvitation, joinProjectWithCode, joinProjectById, recordProjectActionLog, addMemberDirect, removeMemberDirect, patchWbsRow } from '../controllers/projectController';
import { authMiddleware } from '../middleware/authMiddleware';
import { applyWbsScheduleImport, previewWbsScheduleImport } from '../controllers/wbsScheduleImportController';

const router = Router();
// 일정 import 파일은 미리보기/적용 요청 수명 동안에만 메모리에 둔다. 원본 엑셀을 서버에 저장하지 않는다.
const scheduleImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

// This route allowed for guests to fetch project metadata when joining via ID
router.get('/:id', getProject);

// All other project routes require authentication
router.use(authMiddleware);

// 디버그: 화면 drawElements/imageUrl 저장 여부 확인 (GET /api/projects/:id/screens-debug, 인증 필요)
router.get('/:id/screens-debug', getProjectScreensDebug);

router.post('/', createProject);
router.post('/invite', createInvitation);
router.post('/join-with-code', joinProjectWithCode);
router.post('/:id/join', joinProjectById);
router.post('/:id/members', addMemberDirect);
router.delete('/:id/members/:memberId', removeMemberDirect);
router.get('/', getProjects);
router.patch('/:id/wbs/rows/:rowId', patchWbsRow);
router.post('/:id/wbs/schedule-import/preview', scheduleImportUpload.single('file'), previewWbsScheduleImport);
router.post('/:id/wbs/schedule-import/apply', scheduleImportUpload.single('file'), applyWbsScheduleImport);
router.patch('/:id', updateProject);
router.post('/:id/access-log', recordProjectActionLog);
router.delete('/:id', deleteProject);

export default router;
