import { Router } from 'express';
import { signup, login, requestVerification, checkEmail } from '../controllers/authController';

const router = Router();

router.post('/request-verification', requestVerification);
router.post('/signup', signup);
router.post('/login', login);
router.get('/check-email', checkEmail);

export default router;
