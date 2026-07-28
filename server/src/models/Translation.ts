import mongoose, { Schema, Document } from 'mongoose';

export type TranslationStatus = 'PENDING' | 'COMPLETED' | 'IGNORED';

export interface ITranslation extends Document {
    originalText: string;
    translatedText: string;
    status: TranslationStatus;
    lastExtractedAt: Date;
    /** 현재 화면 설계 스냅샷에서 더 이상 발견되지 않은 단어는 삭제 대신 보관한다. */
    isArchived: boolean;
    archivedAt?: Date | null;
    /** 마지막 전체 화면설계 단어 스캔 식별자. 활성 단어 판별에만 사용한다. */
    lastSeenSyncId?: string;
    /** 새 데이터 기준 수집 출처. 기존 문서는 source가 없어도 SCREEN_SYNC로 호환 처리한다. */
    source?: 'SCREEN_SYNC' | 'MANUAL';
}

const translationSchema = new Schema<ITranslation>(
    {
        originalText: { type: String, required: true, unique: true },
        translatedText: { type: String, default: '' },
        status: { type: String, enum: ['PENDING', 'COMPLETED', 'IGNORED'], default: 'PENDING' },
        lastExtractedAt: { type: Date, default: Date.now },
        isArchived: { type: Boolean, default: false },
        archivedAt: { type: Date, default: null },
        lastSeenSyncId: { type: String },
        source: { type: String, enum: ['SCREEN_SYNC', 'MANUAL'] },
    },
    { timestamps: true }
);

export const Translation =
    mongoose.models.Translation || mongoose.model<ITranslation>('Translation', translationSchema);
