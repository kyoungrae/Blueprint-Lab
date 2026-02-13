import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInvitation extends Document {
    projectId: Types.ObjectId;
    email: string;
    code: string;
    role: 'EDITOR' | 'VIEWER';
    inviterId: Types.ObjectId;
    status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
    createdAt: Date;
    expiresAt: Date;
}

const InvitationSchema = new Schema<IInvitation>({
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    email: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    role: { type: String, enum: ['EDITOR', 'VIEWER'], default: 'EDITOR' },
    inviterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'EXPIRED'], default: 'PENDING' },
    expiresAt: { type: Date, required: true },
}, {
    timestamps: { createdAt: true, updatedAt: false }
});

// Index for cleanup and lookup
InvitationSchema.index({ email: 1, code: 1 });
InvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invitation = mongoose.model<IInvitation>('Invitation', InvitationSchema);
