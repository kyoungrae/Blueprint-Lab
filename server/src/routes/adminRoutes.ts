import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { adminMiddleware } from '../middleware/adminMiddleware';
import { translationManageMiddleware } from '../middleware/translationManageMiddleware';
import {
    getAdminUsers,
    getUserProjects,
    updateUserTier,
    updateUserName,
    deleteUser,
    getAdminProjects,
    getProjectHistory,
    rollbackProjectHistory,
    getAdminAccessLogs,
} from '../controllers/adminController';
import {
    listTranslations,
    syncTranslations,
    importTranslations,
    patchTranslation,
    deleteTranslation,
} from '../controllers/adminTranslationController';

const router = Router();

router.use(authMiddleware);

router.get('/translations', translationManageMiddleware, listTranslations);
router.post('/translations/sync', translationManageMiddleware, syncTranslations);
router.post('/translations/import', translationManageMiddleware, importTranslations);
router.patch('/translations/:id', translationManageMiddleware, patchTranslation);
router.delete('/translations/:id', translationManageMiddleware, deleteTranslation);

router.use(adminMiddleware);

router.get('/users', getAdminUsers);
router.get('/access-logs', getAdminAccessLogs);
router.get('/users/:id/projects', getUserProjects);
router.patch('/users/:id/tier', updateUserTier);
router.patch('/users/:id/name', updateUserName);
router.delete('/users/:id', deleteUser);

router.get('/projects', getAdminProjects);
router.get('/projects/:projectId/history', getProjectHistory);
router.post('/projects/:projectId/rollback', rollbackProjectHistory);

export default router;
