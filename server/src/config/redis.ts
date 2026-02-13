import Redis from 'ioredis';
import { config } from './index';

export const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
    console.log('✅ Redis connected successfully');
});

redis.on('error', (err) => {
    console.error('❌ Redis error:', err.message);
});

redis.on('close', () => {
    console.log('⚠️ Redis connection closed');
});

// Pub/Sub용 별도 클라이언트
export const redisSub = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
});

export const redisPub = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
});
