import mongoose, { Schema, Document } from 'mongoose';

// User Document Interface
export interface IUser extends Document {
    email: string;
    name: string;
    password?: string;
    picture?: string;
    googleId?: string;
    createdAt: Date;
    lastLoginAt: Date;
}

const UserSchema = new Schema<IUser>({
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String },
    picture: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    createdAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date, default: Date.now },
});

// Hide password when converting to JSON
UserSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.password;
        return ret;
    }
});

UserSchema.index({ email: 1 });
UserSchema.index({ googleId: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
