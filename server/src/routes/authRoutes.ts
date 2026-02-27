import { Router } from 'express';
import { signup, login, requestVerification, checkEmail, getMe } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/request-verification', requestVerification);
router.post('/signup', signup);
router.post('/login', login);
router.get('/check-email', checkEmail);
router.get('/me', authMiddleware, getMe);

export default router;
