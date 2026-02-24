import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { config } from '../config';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

const UPLOAD_BASE = path.join(config.upload.dir, 'images');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// 허용 MIME 타입
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const projectId = req.params.id;
        if (!projectId || !/^[a-f0-9]{24}$/i.test(projectId)) {
            cb(new Error('Invalid project ID'), '');
            return;
        }
        const dir = path.join(UPLOAD_BASE, projectId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || getExtFromMime(file.mimetype) || '.png';
        const safeExt = /^\.(jpe?g|png|gif|webp|svg)$/i.test(ext) ? ext : '.png';
        cb(null, `${uuidv4()}${safeExt}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}`));
        }
    },
});

function getExtFromMime(mime: string): string {
    const map: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
    };
    return map[mime] || '.png';
}

// Path traversal 방지: imageId는 UUID 형식만 허용
function isValidImageId(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|gif|webp|svg)$/i.test(id);
}

// POST /api/projects/:id/images
// Body: multipart/form-data, field name: image
router.post('/:id/images', authMiddleware, (req: Request, res: Response, next: () => void) => {
    upload.single('image')(req, res, (err: unknown) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    res.status(400).json({ error: 'File too large (max 10MB)' });
                    return;
                }
            }
            res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown upload error' });
            return;
        }
        next();
    });
}, async (req: Request, res: Response) => {
    const { id: projectId } = req.params;
    const file = req.file;

    if (!file) {
        res.status(400).json({ error: 'No image file provided' });
        return;
    }

    const imageId = file.filename;
    const url = `/api/projects/${projectId}/images/${imageId}`;

    res.json({ imageId, url });
});

// GET /api/projects/:id/images/:imageId
router.get('/:id/images/:imageId', async (req: Request, res: Response) => {
    const { id: projectId, imageId } = req.params;

    if (!projectId || !/^[a-f0-9]{24}$/i.test(projectId)) {
        res.status(400).json({ error: 'Invalid project ID' });
        return;
    }
    if (!isValidImageId(imageId)) {
        res.status(400).json({ error: 'Invalid image ID' });
        return;
    }

    const filePath = path.join(UPLOAD_BASE, projectId, imageId);

    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Image not found' });
        return;
    }

    const ext = path.extname(imageId).toLowerCase();
    const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';

    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=2592000'); // 30일 캐시
    res.set('Access-Control-Allow-Origin', '*'); // cross-origin 이미지 로딩 허용
    res.sendFile(path.resolve(filePath));
});

export default router;
