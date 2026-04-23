import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getTranslationDictionary } from '../controllers/translationDictionaryController';

const router = Router();

router.use(authMiddleware);
router.get('/dictionary', getTranslationDictionary);

export default router;
