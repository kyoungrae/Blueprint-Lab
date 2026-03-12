import { Response, NextFunction } from 'express';
import { User } from '../models/User';
import { AuthRequest } from './authMiddleware';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
        return res.status(401).json({ message: '인증이 필요합니다.' });
    }

    if (ADMIN_EMAILS.length === 0) {
        return res.status(503).json({ message: '관리자 기능이 설정되지 않았습니다. ADMIN_EMAILS 환경변수를 확인하세요.' });
    }

    try {
        const user = await User.findById(req.user.id).select('email');
        if (!user) {
            return res.status(401).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        const email = (user.email || '').toLowerCase();
        if (!ADMIN_EMAILS.includes(email)) {
            return res.status(403).json({ message: '관리자 권한이 없습니다.' });
        }

        next();
    } catch (error) {
        // console.error('Admin middleware error:', error);
        res.status(500).json({ message: '권한 확인 중 오류가 발생했습니다.' });
    }
};
