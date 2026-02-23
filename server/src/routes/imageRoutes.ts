import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../config/redis';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// 30일 TTL (초 단위)
const IMAGE_TTL = 60 * 60 * 24 * 30;

const imageKey = (projectId: string, imageId: string) =>
    `project:${projectId}:image:${imageId}`;

// POST /api/projects/:id/images
// Body: { data: "data:image/png;base64,...", mimeType: "image/png" }
router.post('/:id/images', authMiddleware, async (req: Request, res: Response) => {
    const { id: projectId } = req.params;
    const { data } = req.body as { data: string };

    if (!data || !data.startsWith('data:')) {
        res.status(400).json({ error: 'Invalid image data' });
        return;
    }

    // data URL에서 mimeType 파싱
    const mimeMatch = data.match(/^data:([^;]+);base64,/);
    if (!mimeMatch) {
        res.status(400).json({ error: 'Invalid data URL format' });
        return;
    }

    const imageId = uuidv4();
    const key = imageKey(projectId, imageId);

    // Redis에 data URL 전체 저장 (base64 포함), TTL 30일
    await redis.set(key, data, 'EX', IMAGE_TTL);

    res.json({ imageId, url: `/api/projects/${projectId}/images/${imageId}` });
});

// GET /api/projects/:id/images/:imageId
router.get('/:id/images/:imageId', async (req: Request, res: Response) => {
    const { id: projectId, imageId } = req.params;
    const key = imageKey(projectId, imageId);

    const data = await redis.get(key);
    if (!data) {
        res.status(404).json({ error: 'Image not found' });
        return;
    }

    // data URL에서 mimeType과 base64 추출
    const match = data.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) {
        res.status(500).json({ error: 'Corrupted image data' });
        return;
    }

    const [, mimeType, base64] = match;
    const buffer = Buffer.from(base64, 'base64');

    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=2592000'); // 30일 캐시
    res.send(buffer);
});

export default router;
