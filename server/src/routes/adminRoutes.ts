import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { adminMiddleware } from '../middleware/adminMiddleware';
import { getAdminUsers, getUserProjects, updateUserTier, deleteUser, getAdminProjects, getProjectHistory, rollbackProjectHistory } from '../controllers/adminController';

const router = Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/users', getAdminUsers);
router.get('/users/:id/projects', getUserProjects);
router.patch('/users/:id/tier', updateUserTier);
router.delete('/users/:id', deleteUser);

router.get('/projects', getAdminProjects);
router.get('/projects/:projectId/history', getProjectHistory);
router.post('/projects/:projectId/rollback', rollbackProjectHistory);

export default router;
