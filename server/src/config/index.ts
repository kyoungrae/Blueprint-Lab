import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// server/src/config -> __dirname = dist/config, SERVER_ROOT = server/
const SERVER_ROOT = path.resolve(__dirname, '..', '..');

export const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3001', 10),

    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/blueprint-lab',
    },

    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
    },

    jwt: {
        secret: process.env.JWT_SECRET || 'dev-secret',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },

    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    basePath: process.env.BASE_PATH || '', // e.g. /erd

    // 이미지 업로드 경로: 개발=server/upload, 운영=UPLOAD_DIR env (예: /app/upload)
    upload: {
        dir: process.env.UPLOAD_DIR || path.join(SERVER_ROOT, 'upload'),
    },

    /** WBS 자동 백업 저장 경로 */
    backup: {
        dir: process.env.BACKUP_DIR || path.join(SERVER_ROOT, 'backups'),
        /** 백업 주기 (ms). 기본 3시간 */
        intervalMs: parseInt(process.env.BACKUP_INTERVAL_MS || String(3 * 60 * 60 * 1000), 10),
    },

    email: {
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587', 10),
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
        from: process.env.EMAIL_FROM || 'Blue Print Lab <noreply@example.com>',
    },
};
