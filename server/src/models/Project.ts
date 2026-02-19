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

// Screen Field Interface
export interface IScreenField {
    id: string;
    no: number;
    name: string;
    fieldType: string;
    description?: string;
}

// Screen Spec Item Interface
export interface IScreenSpecItem {
    id: string;
    fieldName: string;
    controlName: string;
    dataType: string;
    format: string;
    length: string;
    defaultValue: string;
    validation: string;
    memo: string;
}

// Screen Interface
export interface IScreen {
    id: string;
    systemName: string;
    screenId: string;
    name: string;
    author: string;
    createdDate: string;
    screenType: string;
    page: string;
    screenDescription: string;
    imageUrl?: string;
    initialSettings: string;
    functionDetails: string;
    relatedTables: string;
    fields: IScreenField[];
    variant?: 'UI' | 'SPEC';
    specs?: IScreenSpecItem[];
    position: { x: number; y: number };
    imageWidth?: number;
    imageHeight?: number;
    isLocked?: boolean;
}

// Screen Flow Interface
export interface IScreenFlow {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
}

// Screen Design Snapshot Interface
export interface IScreenSnapshot {
    version: number;
    screens: IScreen[];
    flows: IScreenFlow[];
    savedAt: Date;
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
    screenSnapshot?: IScreenSnapshot;
    linkedErdProjectId?: string;
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

const ScreenFieldSchema = new Schema<IScreenField>({
    id: { type: String, required: true },
    no: { type: Number, required: true },
    name: { type: String, required: true },
    fieldType: { type: String, required: true },
    description: { type: String },
}, { _id: false });

const ScreenSpecItemSchema = new Schema<IScreenSpecItem>({
    id: { type: String, required: true },
    fieldName: { type: String, default: '' },
    controlName: { type: String, default: '' },
    dataType: { type: String, default: '' },
    format: { type: String, default: '' },
    length: { type: String, default: '' },
    defaultValue: { type: String, default: '' },
    validation: { type: String, default: '' },
    memo: { type: String, default: '' },
}, { _id: false });

const ScreenSchema = new Schema<IScreen>({
    id: { type: String, required: true },
    systemName: { type: String, default: '' },
    screenId: { type: String, default: '' },
    name: { type: String, default: '' },
    author: { type: String, default: '' },
    createdDate: { type: String, default: '' },
    screenType: { type: String, default: '' },
    page: { type: String, default: '' },
    screenDescription: { type: String, default: '' },
    imageUrl: { type: String },
    initialSettings: { type: String, default: '' },
    functionDetails: { type: String, default: '' },
    relatedTables: { type: String, default: '' },
    fields: [ScreenFieldSchema],
    variant: { type: String, enum: ['UI', 'SPEC'], default: 'UI' },
    specs: [ScreenSpecItemSchema],
    position: {
        x: { type: Number, required: true },
        y: { type: Number, required: true },
    },
    imageWidth: { type: Number },
    imageHeight: { type: Number },
    isLocked: { type: Boolean, default: false },
}, { _id: false });

const ScreenFlowSchema = new Schema<IScreenFlow>({
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String },
    targetHandle: { type: String },
    label: { type: String },
}, { _id: false });

const ScreenSnapshotSchema = new Schema<IScreenSnapshot>({
    version: { type: Number, default: 1 },
    screens: [ScreenSchema],
    flows: [ScreenFlowSchema],
    savedAt: { type: Date, default: Date.now },
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
    screenSnapshot: { type: ScreenSnapshotSchema, default: { version: 1, screens: [], flows: [], savedAt: new Date() } },
    linkedErdProjectId: { type: String },
}, {
    timestamps: true, // createdAt, updatedAt 자동 생성
});

ProjectSchema.index({ 'members.userId': 1 });
ProjectSchema.index({ updatedAt: -1 });

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
