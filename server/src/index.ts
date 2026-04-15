import fs from 'fs';
import path from 'path';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { connectMongoDB } from './config/database';
import { redis } from './config/redis';
import { initializeSocketServer } from './websocket/SocketServer';
import { startYjsServer } from './websocket/YjsServer';
import authRoutes from './routes/authRoutes';
import projectRoutes from './routes/projectRoutes';
import imageRoutes from './routes/imageRoutes';
import fontRoutes from './routes/fontRoutes';
import adminRoutes from './routes/adminRoutes';
import logger from './utils/logger';
import { isAllowedCorsOrigin } from './utils/corsOrigins';

const app = express();
const httpServer = createServer(app);

// Middleware (이미지 cross-origin 로딩 허용: localhost:5173 → localhost:3001)
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedCorsOrigin(origin)) {
            callback(null, true);
        } else {
            // console.warn(`🛑 CORS Rejected: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Request Logging Middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes (이미지 라우트를 먼저 등록 - /:id/images/:imageId가 /:id보다 먼저 매칭되도록)
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/fonts', fontRoutes);
app.use('/api/projects', imageRoutes);
app.use('/api/projects', projectRoutes);

// API routes will be added here
app.get('/api', (req, res) => {
    res.json({
        message: 'Blue Print Lab API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            projects: '/api/projects (coming soon)',
        }
    });
});

// Initialize Socket.io and attach for admin rollback broadcast
const io = initializeSocketServer(httpServer);
app.set('io', io);

// Start server
async function start() {
    try {
        // Connect to MongoDB
        await connectMongoDB();

        // Test Redis connection
        await redis.ping();
        logger.info('✅ Redis ping successful');

        // 이미지/폰트 업로드 폴더 생성 (없으면 자동 생성)
        const uploadDir = path.join(config.upload.dir, 'images');
        const fontDir = path.join(config.upload.dir, 'font');
        fs.mkdirSync(uploadDir, { recursive: true });
        fs.mkdirSync(fontDir, { recursive: true });
        logger.info(`✅ Upload directory ready: ${uploadDir}`);

        // Start HTTP server
        httpServer.listen(config.port, () => {
            logger.info(`
🚀 Blue Print Lab Server is running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 HTTP:      http://localhost:${config.port}
🔌 Socket.IO: ws://localhost:${config.port}
📊 Health:    http://localhost:${config.port}/health
🌍 Frontend:  ${config.frontendUrl}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
        });

        // Yjs CRDT 서버 시작 (port 4000) - SCREEN_DESIGN / COMPONENT 실시간 협업
        startYjsServer();
    } catch (error) {
        logger.error('❌ Server startup error: %o', error);
        process.exit(1);
    }
}

start();
