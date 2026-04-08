import mongoose, { Schema, Document, Types } from 'mongoose';

export type ProjectAccessLogKind = 'SOCKET_JOIN' | 'YJS_CONNECT' | 'MEMBER_SAVE';

export interface IProjectAccessLog extends Document {
    userId: Types.ObjectId;
    projectId: Types.ObjectId;
    /** 접속·협업 소켓 입장 / Yjs 연결 / 저장 반영 등 */
    kind: ProjectAccessLogKind;
    eventAt: Date;
}

const ProjectAccessLogSchema = new Schema<IProjectAccessLog>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
        kind: {
            type: String,
            enum: ['SOCKET_JOIN', 'YJS_CONNECT', 'MEMBER_SAVE'],
            required: true,
            index: true,
        },
        eventAt: { type: Date, required: true, default: Date.now, index: true },
    },
    { collection: 'project_access_logs' }
);

/** 7일(604800초) 경과 문서는 MongoDB TTL 모니터가 자동 삭제 */
const ACCESS_LOG_RETENTION_SECONDS = 7 * 24 * 60 * 60;
ProjectAccessLogSchema.index({ eventAt: 1 }, { expireAfterSeconds: ACCESS_LOG_RETENTION_SECONDS });
ProjectAccessLogSchema.index({ userId: 1, projectId: 1, eventAt: -1 });

export const ProjectAccessLog = mongoose.model<IProjectAccessLog>('ProjectAccessLog', ProjectAccessLogSchema);
