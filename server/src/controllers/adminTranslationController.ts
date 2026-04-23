import type { Response } from 'express';
import mongoose from 'mongoose';
import type { AuthRequest } from '../middleware/authMiddleware';
import { Project } from '../models/Project';
import { Translation } from '../models/Translation';
import { extractKoreanWords } from '../utils/translationExtractor';

/** 화면 설계 프로젝트 data에서 한글 문자열을 스캔해 Translation 컬렉션에 upsert */
export const syncTranslations = async (req: AuthRequest, res: Response) => {
    try {
        const projects = await Project.find({ projectType: 'SCREEN_DESIGN' }).select('screenSnapshot').lean();
        const allKoreanWords = extractKoreanWords(projects.map((p) => p.screenSnapshot ?? {}));

        if (allKoreanWords.length === 0) {
            return res.json({ success: true, newWordsCount: 0 });
        }

        const now = new Date();
        const bulkOps = allKoreanWords.map((word) => ({
            updateOne: {
                filter: { originalText: word },
                update: {
                    $setOnInsert: {
                        originalText: word,
                        translatedText: '',
                        status: 'PENDING' as const,
                    },
                    $set: { lastExtractedAt: now },
                },
                upsert: true,
            },
        }));

        const result = await Translation.bulkWrite(bulkOps, { ordered: false });
        const newWordsCount =
            (typeof result.upsertedCount === 'number' ? result.upsertedCount : 0) +
            (typeof result.insertedCount === 'number' ? result.insertedCount : 0);

        return res.json({ success: true, newWordsCount });
    } catch (error) {
        console.error('syncTranslations', error);
        return res.status(500).json({ message: '동기화 중 오류가 발생했습니다.' });
    }
};

export const listTranslations = async (_req: AuthRequest, res: Response) => {
    try {
        const list = await Translation.find().sort({ status: -1, originalText: 1 }).lean();
        return res.json(list);
    } catch (error) {
        console.error('listTranslations', error);
        return res.status(500).json({ message: '목록을 불러오지 못했습니다.' });
    }
};

type ImportRow = { originalText?: unknown; translatedText?: unknown };

/** 엑셀 등에서 일괄 업로드: originalText 기준 upsert */
export const importTranslations = async (req: AuthRequest, res: Response) => {
    try {
        const { translations } = req.body as { translations?: ImportRow[] };
        if (!Array.isArray(translations)) {
            return res.status(400).json({ message: '잘못된 데이터 형식입니다.' });
        }

        const now = new Date();
        const bulkOps: Parameters<typeof Translation.bulkWrite>[0] = [];

        for (const item of translations) {
            const raw = item?.originalText;
            const orig = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
            if (!orig) continue;

            const traw = item?.translatedText;
            const translated =
                typeof traw === 'string' ? traw : traw !== undefined && traw !== null ? String(traw) : '';
            const status = translated.trim() ? ('COMPLETED' as const) : ('PENDING' as const);

            bulkOps.push({
                updateOne: {
                    filter: { originalText: orig },
                    update: {
                        $set: {
                            translatedText: translated,
                            status,
                            lastExtractedAt: now,
                        },
                        $setOnInsert: {
                            originalText: orig,
                        },
                    },
                    upsert: true,
                },
            });
        }

        if (bulkOps.length === 0) {
            return res.status(400).json({ message: '유효한 행이 없습니다. 한글 원문(Key) 열을 확인해 주세요.' });
        }

        const result = await Translation.bulkWrite(bulkOps, { ordered: false });
        const upsertedCount = typeof result.upsertedCount === 'number' ? result.upsertedCount : 0;
        const modifiedCount = typeof result.modifiedCount === 'number' ? result.modifiedCount : 0;

        return res.json({
            success: true,
            upsertedCount: upsertedCount + modifiedCount,
            upsertedOnly: upsertedCount,
            modifiedOnly: modifiedCount,
        });
    } catch (error) {
        console.error('importTranslations', error);
        return res.status(500).json({ message: '서버 데이터 반영 중 오류가 발생했습니다.' });
    }
};

export const patchTranslation = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: '잘못된 ID입니다.' });
        }
        const { translatedText } = req.body as { translatedText?: string };
        const text = translatedText ?? '';
        const status = text.trim() ? 'COMPLETED' : 'PENDING';
        await Translation.findByIdAndUpdate(id, { translatedText: text, status });
        return res.json({ success: true });
    } catch (error) {
        console.error('patchTranslation', error);
        return res.status(500).json({ message: '저장 중 오류가 발생했습니다.' });
    }
};
