import mongoose, { Schema, Document } from 'mongoose';

export type TranslationStatus = 'PENDING' | 'COMPLETED' | 'IGNORED';

export interface ITranslation extends Document {
    originalText: string;
    translatedText: string;
    status: TranslationStatus;
    lastExtractedAt: Date;
}

const translationSchema = new Schema<ITranslation>(
    {
        originalText: { type: String, required: true, unique: true },
        translatedText: { type: String, default: '' },
        status: { type: String, enum: ['PENDING', 'COMPLETED', 'IGNORED'], default: 'PENDING' },
        lastExtractedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export const Translation =
    mongoose.models.Translation || mongoose.model<ITranslation>('Translation', translationSchema);
