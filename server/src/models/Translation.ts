import mongoose, { Schema, Document } from 'mongoose';

export type TranslationStatus = 'PENDING' | 'COMPLETED';

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
        status: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
        lastExtractedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

translationSchema.index({ originalText: 1 });

export const Translation =
    mongoose.models.Translation || mongoose.model<ITranslation>('Translation', translationSchema);
