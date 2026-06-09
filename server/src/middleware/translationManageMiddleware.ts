import { Response, NextFunction } from 'express';
import { User } from '../models/User';
import { AuthRequest } from './authMiddleware';

/** Pro/Master/Admin tier — 번역 메모리 관리 API */
export const translationManageMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
        return res.status(401).json({ message: '인증이 필요합니다.' });
    }

    try {
        const user = await User.findById(req.user.id).select('tier').lean();
        if (!user) {
            return res.status(401).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        const tier = user.tier || 'FREE';
        if (tier === 'PRO' || tier === 'MASTER' || tier === 'ADMIN') {
            return next();
        }

        return res.status(403).json({
            message: '번역 메모리 관리는 Pro tier 이상부터 사용할 수 있습니다.',
        });
    } catch {
        res.status(500).json({ message: '권한 확인 중 오류가 발생했습니다.' });
    }
};
