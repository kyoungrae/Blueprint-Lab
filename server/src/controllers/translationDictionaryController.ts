import type { Response } from 'express';
import type { AuthRequest } from '../middleware/authMiddleware';
import { Translation } from '../models/Translation';

/** 로그인 사용자용: PPT 등에서 사용할 원문→번역문 맵 (빈 번역 제외) */
export const getTranslationDictionary = async (_req: AuthRequest, res: Response) => {
    try {
        const list = await Translation.find({ translatedText: { $ne: '' } }).select('originalText translatedText').lean();
        const dictionary: Record<string, string> = {};
        for (const item of list) {
            if (item.originalText && item.translatedText) {
                dictionary[item.originalText] = item.translatedText;
            }
        }
        return res.json(dictionary);
    } catch (error) {
        console.error('getTranslationDictionary', error);
        return res.status(500).json({ message: '사전을 불러오지 못했습니다.' });
    }
};
