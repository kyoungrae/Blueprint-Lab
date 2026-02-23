import { Request, Response, NextFunction } from 'express';
import jwt, { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { config } from '../config';

export interface AuthRequest extends Request {
    user?: {
        id: string;
    };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: '인증 토큰이 없습니다.' });
    }

    try {
        const decoded = jwt.verify(token, config.jwt.secret) as { id: string };
        req.user = { id: decoded.id };
        next();
    } catch (error) {
        if (error instanceof TokenExpiredError) {
            return res.status(401).json({ message: '토큰이 만료되었습니다. 다시 로그인해 주세요.' });
        }
        if (error instanceof JsonWebTokenError) {
            return res.status(401).json({ message: '유효하지 않은 토큰입니다. 다시 로그인해 주세요.' });
        }
        return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
    }
};
