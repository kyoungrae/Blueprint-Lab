import type { Response } from 'express';
import mongoose from 'mongoose';
import type { AuthRequest } from '../middleware/authMiddleware';
import { Project } from '../models/Project';
import { Translation } from '../models/Translation';
import { extractKoreanWords, normalizeTranslationWhitespace } from '../utils/translationExtractor';

/**
 * 화면 설계 스냅샷에서 한글 문자열을 수집한다.
 *
 * 더 이상 사용되지 않는 단어는 삭제하지 않고 보관 처리한다. 그래야 치환 전 원문과
 * 기존 번역문을 복구할 수 있으면서, 기본 목록·PPT 사전에는 남지 않는다.
 */
export const syncTranslations = async (req: AuthRequest, res: Response) => {
    try {
        const projects = await Project.find({ projectType: 'SCREEN_DESIGN' }).select('screenSnapshot').lean();
        const allKoreanWords = extractKoreanWords(projects.map((p) => p.screenSnapshot ?? {}));
        const uniqueWords = [...new Set(allKoreanWords)];
        const now = new Date();
        const scanId = new mongoose.Types.ObjectId().toString();
        const bulkOps = uniqueWords.map((word) => ({
            updateOne: {
                filter: { originalText: word },
                update: {
                    $setOnInsert: {
                        originalText: word,
                        translatedText: '',
                        status: 'PENDING' as const,
                        source: 'SCREEN_SYNC' as const,
                    },
                    $set: {
                        lastExtractedAt: now,
                        lastSeenSyncId: scanId,
                        isArchived: false,
                        archivedAt: null,
                    },
                },
                upsert: true,
            },
        }));

        const result = bulkOps.length > 0
            ? await Translation.bulkWrite(bulkOps, { ordered: false })
            : null;

        // 빈 스냅샷/일시적 저장 지연이 모든 메모리를 한꺼번에 숨기지 않도록,
        // 현재 한글 단어가 하나 이상 관찰된 정상 전체 스캔에서만 미사용 항목을 보관한다.
        let archivedWordsCount = 0;
        if (uniqueWords.length > 0) {
            const archiveResult = await Translation.updateMany(
                {
                    isArchived: { $ne: true },
                    lastSeenSyncId: { $ne: scanId },
                    // source 없는 기존 데이터는 과거 화면 동기화 데이터로 호환 처리한다.
                    $or: [{ source: 'SCREEN_SYNC' }, { source: { $exists: false } }],
                },
                {
                    $set: { isArchived: true, archivedAt: now },
                }
            );
            archivedWordsCount = typeof archiveResult.modifiedCount === 'number' ? archiveResult.modifiedCount : 0;
        }

        const newWordsCount =
            (typeof result?.upsertedCount === 'number' ? result.upsertedCount : 0) +
            (typeof result?.insertedCount === 'number' ? result.insertedCount : 0);

        return res.json({ success: true, newWordsCount, archivedWordsCount });
    } catch (error) {
        console.error('syncTranslations', error);
        return res.status(500).json({ message: '동기화 중 오류가 발생했습니다.' });
    }
};

export const listTranslations = async (req: AuthRequest, res: Response) => {
    try {
        const includeArchived = String(req.query.includeArchived || '').toLowerCase() === 'true';
        const filter = includeArchived ? {} : { isArchived: { $ne: true } };
        const list = await Translation.find(filter).sort({ status: -1, originalText: 1 }).lean();
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
        const rowByOriginal = new Map<
            string,
            { orig: string; translated: string; status: 'PENDING' | 'COMPLETED' }
        >();

        for (const item of translations) {
            const raw = item?.originalText;
            const orig = normalizeTranslationWhitespace(typeof raw === 'string' ? raw : String(raw ?? ''));
            if (!orig) continue;

            const traw = item?.translatedText;
            const translated = normalizeTranslationWhitespace(
                typeof traw === 'string' ? traw : traw !== undefined && traw !== null ? String(traw) : ''
            );
            const status = translated ? ('COMPLETED' as const) : ('PENDING' as const);
            rowByOriginal.set(orig, { orig, translated, status });
        }

        const bulkOps: Parameters<typeof Translation.bulkWrite>[0] = [];
        for (const { orig, translated, status } of rowByOriginal.values()) {
            bulkOps.push({
                updateOne: {
                    filter: { originalText: orig },
                    update: {
                        $set: {
                            translatedText: translated,
                            status,
                            lastExtractedAt: now,
                            isArchived: false,
                            archivedAt: null,
                        },
                        $setOnInsert: {
                            originalText: orig,
                            source: 'MANUAL' as const,
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
        const text = normalizeTranslationWhitespace(translatedText ?? '');
        const status = text ? ('COMPLETED' as const) : ('PENDING' as const);
        await Translation.findByIdAndUpdate(id, {
            translatedText: text,
            status,
            isArchived: false,
            archivedAt: null,
        });
        return res.json({ success: true });
    } catch (error) {
        console.error('patchTranslation', error);
        return res.status(500).json({ message: '저장 중 오류가 발생했습니다.' });
    }
};

export const deleteTranslation = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: '잘못된 ID입니다.' });
            return;
        }
        const deleted = await Translation.findByIdAndDelete(id);
        if (!deleted) {
            res.status(404).json({ message: '항목을 찾을 수 없습니다.' });
            return;
        }
        res.json({ success: true });
    } catch (error) {
        console.error('deleteTranslation', error);
        res.status(500).json({ message: '삭제 중 오류가 발생했습니다.' });
    }
};
