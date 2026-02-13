import { Router } from 'express';
import { createProject, getProjects, deleteProject, updateProject, getProject, createInvitation, joinProjectWithCode, joinProjectById } from '../controllers/projectController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// This route allowed for guests to fetch project metadata when joining via ID
router.get('/:id', getProject);

// All other project routes require authentication
router.use(authMiddleware);

router.post('/', createProject);
router.post('/invite', createInvitation);
router.post('/join-with-code', joinProjectWithCode);
router.post('/:id/join', joinProjectById);
router.get('/', getProjects);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);

export default router;
