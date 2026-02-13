import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { config } from '../config';
import { redis } from '../config/redis';
import { sendVerificationEmail } from '../services/EmailService';

const VERIFICATION_CODE_EXPIRY = 300; // 5 minutes

export const requestVerification = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: '이미 가입된 이메일입니다.' });
        }

        // Generate 6 digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Store in Redis with TTL
        await redis.set(`verify:${email}`, code, 'EX', VERIFICATION_CODE_EXPIRY);

        // Send email
        await sendVerificationEmail(email, code);

        res.json({ message: '인증 코드가 발송되었습니다.' });
    } catch (error: any) {
        console.error('Request verification error:', error);
        res.status(500).json({ message: error.message || '인증 코드 발송에 실패했습니다.' });
    }
};

export const signup = async (req: Request, res: Response) => {
    try {
        const { email, password, name, code } = req.body;

        // Verify code from Redis
        const storedCode = await redis.get(`verify:${email}`);
        if (!storedCode || storedCode !== code) {
            return res.status(400).json({ message: '인증 코드가 올바르지 않거나 만료되었습니다.' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: '이미 가입된 이메일입니다.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            email,
            password: hashedPassword,
            name,
        });

        await user.save();

        // Delete code from Redis after success
        await redis.del(`verify:${email}`);

        const token = jwt.sign({ id: user._id }, config.jwt.secret, {
            expiresIn: config.jwt.expiresIn as any,
        });

        res.status(201).json({
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
            },
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: '회원가입 중 오류가 발생했습니다.' });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user || !user.password) {
            return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        }

        user.lastLoginAt = new Date();
        await user.save();

        const token = jwt.sign({ id: user._id }, config.jwt.secret, {
            expiresIn: config.jwt.expiresIn as any,
        });

        res.json({
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                picture: user.picture,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: '로그인 중 오류가 발생했습니다.' });
    }
};

export const checkEmail = async (req: Request, res: Response) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ message: '이메일이 필요합니다.' });
        }

        const user = await User.findOne({ email });
        res.json({ exists: !!user });
    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({ message: '이메일 확인 중 오류가 발생했습니다.' });
    }
};
