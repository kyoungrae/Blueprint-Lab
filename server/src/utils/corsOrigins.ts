import { config } from '../config';

const normalize = (url: string) => url.replace(/\/$/, '');

/** Dev browsers may send Origin as http://[::1]:5173 or alternate Vite ports. */
const DEV_LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Shared CORS allowlist for Express and Socket.IO.
 * Browsers may send Origin as http://[::1]:5173; Vite may use 5174+ when 5173 is taken.
 */
export function isAllowedCorsOrigin(origin: string | undefined): boolean {
    if (!origin) return true;

    const normalizedOrigin = normalize(origin);

    const explicit = new Set([
        normalize(config.frontendUrl),
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://[::1]:5173',
    ]);

    if (explicit.has(normalizedOrigin)) return true;
    if (normalizedOrigin.startsWith('http://192.168.')) return true;

    if (config.env !== 'production' && DEV_LOOPBACK.test(normalizedOrigin)) {
        return true;
    }

    return false;
}
