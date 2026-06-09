import { Response, NextFunction } from 'express';
import { User } from '../models/User';
import { AuthRequest } from './authMiddleware';

export const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
        return res.status(401).json({ message: '인증이 필요합니다.' });
    }

    try {
        const user = await User.findById(req.user.id).select('tier');
        if (!user) {
            return res.status(401).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        if (user.tier !== 'ADMIN') {
            return res.status(403).json({ message: '관리자 권한이 없습니다.' });
        }

        next();
    } catch (error) {
        // console.error('Admin middleware error:', error);
        res.status(500).json({ message: '권한 확인 중 오류가 발생했습니다.' });
    }
};
