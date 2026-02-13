import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { connectMongoDB } from './config/database';
import { redis } from './config/redis';
import { initializeSocketServer } from './websocket/SocketServer';
import authRoutes from './routes/authRoutes';
import projectRoutes from './routes/projectRoutes';
import logger from './utils/logger';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin
        if (!origin) return callback(null, true);

        // Allow specific origins and dynamic patterns
        const allowed = [
            config.frontendUrl,
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ];

        if (allowed.includes(origin) || origin.startsWith('http://192.168.')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
app.use(express.json());

// Request Logging Middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);

// API routes will be added here
app.get('/api', (req, res) => {
    res.json({
        message: 'ERD System API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            projects: '/api/projects (coming soon)',
        }
    });
});

// Initialize Socket.io
initializeSocketServer(httpServer);

// Start server
async function start() {
    try {
        // Connect to MongoDB
        await connectMongoDB();

        // Test Redis connection
        await redis.ping();
        logger.info('✅ Redis ping successful');

        // Start HTTP server
        httpServer.listen(config.port, () => {
            logger.info(`
🚀 ERD System Server is running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 HTTP:      http://localhost:${config.port}
🔌 WebSocket: ws://localhost:${config.port}
📊 Health:    http://localhost:${config.port}/health
🌍 Frontend:  ${config.frontendUrl}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
        });
    } catch (error) {
        logger.error('❌ Server startup error: %o', error);
        process.exit(1);
    }
}

start();
