export interface Attribute {
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

export interface Entity {
    id: string;
    name: string;
    position: { x: number; y: number };
    attributes: Attribute[];
    isLocked?: boolean;
    comment?: string;
}

export interface Relationship {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    type: '1:1' | '1:N' | 'N:M';
}

export type DBType = 'MySQL' | 'PostgreSQL' | 'Oracle' | 'MSSQL';

export type ProjectType = 'ERD' | 'SCREEN_DESIGN' | 'COMPONENT';

export interface ProjectMember {
    id: string;
    name: string;
    email: string;
    picture?: string;
    role: 'OWNER' | 'MEMBER';
}

export interface Project {
    id: string;
    name: string;
    projectType: ProjectType;
    dbType: DBType;
    description?: string;
    updatedAt: string;
    members: ProjectMember[];
    data: ERDState | Record<string, unknown>;
    linkedErdProjectId?: string;
    linkedComponentProjectId?: string;
}

export type ChangeType = 'CREATE' | 'UPDATE' | 'DELETE' | 'PROJECT_SET' | 'IMPORT' | 'MOVE';

export interface HistoryLog {
    id: string;
    userId: string;
    userName: string;
    userPicture?: string;
    timestamp: string;
    type: ChangeType;
    targetType: 'ENTITY' | 'RELATIONSHIP' | 'PROJECT';
    targetName: string;
    details: string; // e.g., "Name: USER -> USERS", "Added column: id"
    payload?: any;   // Additional data for detailed view
}

export interface ERDState {
    entities: Entity[];
    relationships: Relationship[];
    history?: HistoryLog[];
}

export interface ScreenDesignState {
    screens: unknown[];
    flows: unknown[];
}

export interface ComponentState {
    components: unknown[];
    flows: unknown[];
}

export type ProjectData = ERDState | ScreenDesignState | ComponentState;
