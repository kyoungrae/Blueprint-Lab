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
    /** 이 엔티티가 속한 섹션 id (없으면 루트) */
    sectionId?: string | null;
}

// Relationship Interface
export interface IRelationship {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    type: '1:1' | '1:N' | 'N:M';
    sourceEnd?: string;
    targetEnd?: string;
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
    tableNameKr: string;
    tableNameEn: string;
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
    /** 이 화면이 속한 섹션 id (없으면 루트) */
    sectionId?: string | null;
    imageWidth?: number;
    imageHeight?: number;
    isLocked?: boolean;
    /** RightPane 패널 비율 (0–100, 합 100). [초기화면설정, 기능상세, 관련테이블] */
    rightPaneRatios?: [number, number, number];
    contentMode?: 'IMAGE' | 'DRAW';
    drawElements?: Record<string, unknown>[];  // 직접 그리기 요소 (이미지 포함)
    pageSize?: string;
    pageOrientation?: string;
    /** 하위 컴포넌트 (부분 컴포넌트화) */
    subComponents?: Array<{ id: string; name: string; elementIds: string[] }>;
    /** 화면 메모 */
    memo?: string;
    /** 화면 메모 리스트 (고도화용) */
    memos?: Array<{
        id: string;
        content: string;
        authorId: string;
        authorName: string;
        createdAt: string;
        updatedAt: string;
    }>;
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
    sections?: ISection[];
    savedAt: Date;
}

// Section (ERD grouping area)
export interface ISection {
    id: string;
    name?: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    color?: string;
    parentId?: string | null; // 👈 추가
}

// ERD Snapshot Interface
export interface IERDSnapshot {
    version: number;
    entities: IEntity[];
    relationships: IRelationship[];
    sections?: ISection[];
    savedAt: Date;
}

// Component Snapshot Interface (reuses Screen structure)
export interface IComponentSnapshot {
    version: number;
    components: IScreen[];
    flows: IScreenFlow[];
    savedAt: Date;
}

// Project Document Interface
export interface IBugReport {
    id: string;
    projectId: string;
    content: string;
    reporterId: string;
    reporterName: string;
    reporterPicture?: string;
    createdAt: Date;
    updatedAt: Date;
    isResolved: boolean;
    resolvedAt?: Date;
    resolvedBy?: string;
    resolvedByName?: string;
}

export interface IProject extends Document {
    name: string;
    projectType: 'ERD' | 'SCREEN_DESIGN' | 'COMPONENT';
    dbType: 'MySQL' | 'PostgreSQL' | 'Oracle' | 'MSSQL';
    description?: string;
    /** 프로젝트 생성자 표시명 (미설정 시 members OWNER의 name 사용) */
    author?: string;
    members: IProjectMember[];
    currentSnapshot: IERDSnapshot;
    createdAt: Date;
    updatedAt: Date;
    screenSnapshot?: IScreenSnapshot;
    componentSnapshot?: IComponentSnapshot;
    linkedErdProjectId?: string;
    /** 화면 설계에 연결된 ERD 프로젝트 ID 배열 (여러 개 연결 가능) */
    linkedErdProjectIds?: string[];
    linkedComponentProjectId?: string;
    bugReports?: IBugReport[];
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
    sectionId: { type: String, default: null },
}, { _id: false });

const RelationshipSchema = new Schema<IRelationship>({
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String },
    targetHandle: { type: String },
    type: { type: String, enum: ['1:1', '1:N', 'N:M'], required: true },
    sourceEnd: { type: String },
    targetEnd: { type: String },
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
    tableNameKr: { type: String, default: '' },
    tableNameEn: { type: String, default: '' },
    fieldName: { type: String, default: '' },
    controlName: { type: String, default: '' },
    dataType: { type: String, default: '' },
    format: { type: String, default: '' },
    length: { type: String, default: '' },
    defaultValue: { type: String, default: '' },
    validation: { type: String, default: '' },
    memo: { type: String, default: '' },
}, { _id: false });

const ScreenMemoSchema = new Schema({
    id: { type: String, required: true },
    content: { type: String, required: true },
    authorId: { type: String },
    authorName: { type: String },
    createdAt: { type: String },
    updatedAt: { type: String },
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
    sectionId: { type: String },
    imageWidth: { type: Number },
    imageHeight: { type: Number },
    isLocked: { type: Boolean, default: false },
    /** RightPane 패널 비율 (0–100, 합 100). [초기화면설정, 기능상세, 관련테이블] */
    rightPaneRatios: { type: [Number], default: undefined },
    contentMode: { type: String, enum: ['IMAGE', 'DRAW'] },
    drawElements: { type: [Schema.Types.Mixed], default: [] },
    pageSize: { type: String },
    pageOrientation: { type: String },
    subComponents: { type: [Schema.Types.Mixed], default: [] },
    /** 화면 메모 */
    memo: { type: String },
    /** 화면 메모 리스트 (고도화용) */
    memos: {
        type: [ScreenMemoSchema],
        default: []
    },
}, { _id: false });

const ScreenFlowSchema = new Schema<IScreenFlow>({
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String },
    targetHandle: { type: String },
    label: { type: String },
}, { _id: false });

const SectionSchema = new Schema<ISection>({
    id: { type: String, required: true },
    name: { type: String },
    position: { x: { type: Number, required: true }, y: { type: Number, required: true } },
    size: { width: { type: Number, required: true }, height: { type: Number, required: true } },
    color: { type: String },
    parentId: { type: String, default: null }, // 👈 추가
}, { _id: false });

const ScreenSnapshotSchema = new Schema<IScreenSnapshot>({
    version: { type: Number, default: 1 },
    screens: [ScreenSchema],
    flows: [ScreenFlowSchema],
    sections: { type: [SectionSchema], default: [] },
    savedAt: { type: Date, default: Date.now },
}, { _id: false });

const ComponentSnapshotSchema = new Schema<IComponentSnapshot>({
    version: { type: Number, default: 1 },
    components: [ScreenSchema],
    flows: [ScreenFlowSchema],
    savedAt: { type: Date, default: Date.now },
}, { _id: false });

const ERDSnapshotSchema = new Schema<IERDSnapshot>({
    version: { type: Number, default: 1 },
    entities: [EntitySchema],
    relationships: [RelationshipSchema],
    sections: { type: [SectionSchema], default: [] },
    savedAt: { type: Date, default: Date.now },
}, { _id: false });

const BugReportSchema = new Schema<IBugReport>({
    id: { type: String, required: true },
    projectId: { type: String, required: true },
    content: { type: String, required: true },
    reporterId: { type: String, required: true },
    reporterName: { type: String, required: true },
    reporterPicture: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    isResolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
    resolvedByName: { type: String },
}, { _id: false });

const ProjectSchema = new Schema<IProject>({
    name: { type: String, required: true },
    projectType: { type: String, enum: ['ERD', 'SCREEN_DESIGN', 'COMPONENT'], default: 'ERD' },
    dbType: { type: String, enum: ['MySQL', 'PostgreSQL', 'Oracle', 'MSSQL'], required: true },
    description: { type: String },
    author: { type: String, default: '' },
    members: [ProjectMemberSchema],
    currentSnapshot: { type: ERDSnapshotSchema, default: { version: 1, entities: [], relationships: [], savedAt: new Date() } },
    screenSnapshot: { type: ScreenSnapshotSchema, default: { version: 1, screens: [], flows: [], savedAt: new Date() } },
    componentSnapshot: { type: ComponentSnapshotSchema, default: { version: 1, components: [], flows: [], savedAt: new Date() } },
    linkedErdProjectId: { type: String },
    linkedErdProjectIds: [{ type: String }],
    linkedComponentProjectId: { type: String },
    bugReports: { type: [BugReportSchema], default: [] },
}, {
    timestamps: true, // createdAt, updatedAt 자동 생성
});

ProjectSchema.index({ 'members.userId': 1 });
ProjectSchema.index({ updatedAt: -1 });

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
