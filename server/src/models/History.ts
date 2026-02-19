import mongoose, { Schema, Document, Types } from 'mongoose';

// Operation Type
export type OperationType =
    | 'ENTITY_CREATE'
    | 'ENTITY_UPDATE'
    | 'ENTITY_DELETE'
    | 'ENTITY_MOVE'
    | 'ATTRIBUTE_ADD'
    | 'ATTRIBUTE_UPDATE'
    | 'ATTRIBUTE_DELETE'
    | 'RELATIONSHIP_CREATE'
    | 'RELATIONSHIP_UPDATE'
    | 'RELATIONSHIP_DELETE'
    | 'ERD_IMPORT'
    | 'SCREEN_CREATE'
    | 'SCREEN_UPDATE'
    | 'SCREEN_DELETE'
    | 'SCREEN_MOVE'
    | 'FLOW_CREATE'
    | 'FLOW_UPDATE'
    | 'FLOW_DELETE'
    | 'SCREEN_IMPORT';

// History Document Interface
export interface IHistory extends Document {
    projectId: Types.ObjectId;
    userId: Types.ObjectId;
    userName: string;
    userPicture?: string;

    operationType: OperationType;
    targetType: 'ENTITY' | 'RELATIONSHIP' | 'PROJECT' | 'SCREEN' | 'FLOW';
    targetId: string;
    targetName: string;

    // Operation data for CRDT
    operation: {
        lamportClock: number;
        payload: Record<string, unknown>;
        previousState?: Record<string, unknown>;
    };

    details: string;
    timestamp: Date;
}

const HistorySchema = new Schema<IHistory>({
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userPicture: { type: String },

    operationType: {
        type: String,
        enum: [
            'ENTITY_CREATE', 'ENTITY_UPDATE', 'ENTITY_DELETE', 'ENTITY_MOVE',
            'ATTRIBUTE_ADD', 'ATTRIBUTE_UPDATE', 'ATTRIBUTE_DELETE',
            'RELATIONSHIP_CREATE', 'RELATIONSHIP_UPDATE', 'RELATIONSHIP_DELETE',
            'ERD_IMPORT',
            'SCREEN_CREATE', 'SCREEN_UPDATE', 'SCREEN_DELETE', 'SCREEN_MOVE',
            'FLOW_CREATE', 'FLOW_UPDATE', 'FLOW_DELETE',
            'SCREEN_IMPORT'
        ],
        required: true
    },
    targetType: { type: String, enum: ['ENTITY', 'RELATIONSHIP', 'PROJECT', 'SCREEN', 'FLOW'], required: true },
    targetId: { type: String, required: true },
    targetName: { type: String, required: true },

    operation: {
        lamportClock: { type: Number, required: true },
        payload: { type: Schema.Types.Mixed },
        previousState: { type: Schema.Types.Mixed },
    },

    details: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});

HistorySchema.index({ projectId: 1, timestamp: -1 });
HistorySchema.index({ userId: 1, timestamp: -1 });

export const History = mongoose.model<IHistory>('History', HistorySchema);
