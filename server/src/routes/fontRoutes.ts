import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { config } from '../config';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

const FONT_DIR = path.join(config.upload.dir, 'font');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_EXT = ['.ttf', '.otf', '.woff', '.woff2'];
const ALLOWED_MIMES = [
    'font/ttf', 'font/otf', 'application/font-woff', 'font/woff', 'font/woff2',
    'application/x-font-ttf', 'application/x-font-otf', 'application/octet-stream'
];

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        fs.mkdirSync(FONT_DIR, { recursive: true });
        cb(null, FONT_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeExt = ALLOWED_EXT.includes(ext) ? ext : '.ttf';
        const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
        const filename = `${baseName}${safeExt}`;
        cb(null, filename);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED_EXT.includes(ext) || ALLOWED_MIMES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid font file. Allowed: ${ALLOWED_EXT.join(', ')}`));
        }
    },
});

// GET /api/fonts - list available fonts
router.get('/', async (_req: Request, res: Response) => {
    try {
        if (!fs.existsSync(FONT_DIR)) {
            return res.json({ fonts: [] });
        }
        const files = fs.readdirSync(FONT_DIR);
        const fonts = files
            .filter(f => ALLOWED_EXT.some(ext => f.toLowerCase().endsWith(ext)))
            .map(filename => {
                const name = path.basename(filename, path.extname(filename));
                return { name, filename, url: `/api/fonts/${filename}` };
            });
        res.json({ fonts });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list fonts' });
    }
});

// POST /api/fonts - upload font file
router.post('/', authMiddleware, (req: Request, res: Response, next: () => void) => {
    upload.single('font')(req, res, (err: unknown) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    res.status(400).json({ error: 'File too large (max 5MB)' });
                    return;
                }
            }
            res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' });
            return;
        }
        next();
    });
}, (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
        res.status(400).json({ error: 'No font file provided' });
        return;
    }
    const name = path.basename(file.filename, path.extname(file.filename));
    res.json({ name, filename: file.filename, url: `/api/fonts/${file.filename}` });
});

// GET /api/fonts/:filename - serve font file
router.get('/:filename', (req: Request, res: Response) => {
    const { filename } = req.params;
    if (!filename || /[^a-zA-Z0-9._-]/.test(filename)) {
        res.status(400).json({ error: 'Invalid filename' });
        return;
    }
    const filePath = path.join(FONT_DIR, filename);
    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Font not found' });
        return;
    }
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
    };
    res.set('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.set('Access-Control-Allow-Origin', '*');
    res.sendFile(path.resolve(filePath));
});

export default router;
