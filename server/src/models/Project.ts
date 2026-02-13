import mongoose, { Schema, Document, Types } from 'mongoose';

// Attribute Interface
export interface IAttribute {
    id: string;
    name: string;
    type: string;
    isPK: boolean;
    isFK: boolean;
    isNullable?: boolean;
    defaultVal?: string;
    comment?: string;
    length?: string;
}

// Entity Interface
export interface IEntity {
    id: string;
    name: string;
    position: { x: number; y: number };
    attributes: IAttribute[];
    isLocked?: boolean;
    comment?: string;
}

// Relationship Interface
export interface IRelationship {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    type: '1:1' | '1:N' | 'N:M';
}

// Project Member Interface
export interface IProjectMember {
    userId: Types.ObjectId;
    role: 'OWNER' | 'EDITOR' | 'VIEWER';
    joinedAt: Date;
}

// ERD Snapshot Interface
export interface IERDSnapshot {
    version: number;
    entities: IEntity[];
    relationships: IRelationship[];
    savedAt: Date;
}

// Project Document Interface
export interface IProject extends Document {
    name: string;
    projectType: 'ERD' | 'SCREEN_DESIGN';
    dbType: 'MySQL' | 'PostgreSQL' | 'Oracle' | 'MSSQL';
    description?: string;
    members: IProjectMember[];
    currentSnapshot: IERDSnapshot;
    createdAt: Date;
    updatedAt: Date;
}

const AttributeSchema = new Schema<IAttribute>({
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    isPK: { type: Boolean, default: false },
    isFK: { type: Boolean, default: false },
    isNullable: { type: Boolean, default: true },
    defaultVal: { type: String },
    comment: { type: String },
    length: { type: String },
}, { _id: false });

const EntitySchema = new Schema<IEntity>({
    id: { type: String, required: true },
    name: { type: String, required: true },
    position: {
        x: { type: Number, required: true },
        y: { type: Number, required: true },
    },
    attributes: [AttributeSchema],
    isLocked: { type: Boolean, default: false },
    comment: { type: String },
}, { _id: false });

const RelationshipSchema = new Schema<IRelationship>({
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String },
    targetHandle: { type: String },
    type: { type: String, enum: ['1:1', '1:N', 'N:M'], required: true },
}, { _id: false });

const ProjectMemberSchema = new Schema<IProjectMember>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['OWNER', 'EDITOR', 'VIEWER'], required: true },
    joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const ERDSnapshotSchema = new Schema<IERDSnapshot>({
    version: { type: Number, default: 1 },
    entities: [EntitySchema],
    relationships: [RelationshipSchema],
    savedAt: { type: Date, default: Date.now },
}, { _id: false });

const ProjectSchema = new Schema<IProject>({
    name: { type: String, required: true },
    projectType: { type: String, enum: ['ERD', 'SCREEN_DESIGN'], default: 'ERD' },
    dbType: { type: String, enum: ['MySQL', 'PostgreSQL', 'Oracle', 'MSSQL'], required: true },
    description: { type: String },
    members: [ProjectMemberSchema],
    currentSnapshot: { type: ERDSnapshotSchema, default: { version: 1, entities: [], relationships: [], savedAt: new Date() } },
}, {
    timestamps: true, // createdAt, updatedAt 자동 생성
});

ProjectSchema.index({ 'members.userId': 1 });
ProjectSchema.index({ updatedAt: -1 });

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
