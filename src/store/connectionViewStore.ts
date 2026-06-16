import { create } from 'zustand';

/**
 * ConnectionViewStore
 * ERD 연결선(관계선)을 어떻게 그릴지 결정하는 전역 UI 상태.
 * - 'entity': 기존처럼 엔티티(테이블) 끼리 연결
 * - 'column': 컬럼(필드) 끼리 연결
 * 선택값은 localStorage에 저장되어 새로고침 후에도 유지됨.
 */
export type ConnectionViewMode = 'entity' | 'column';

const STORAGE_KEY = 'erd-connection-view-mode';

const loadInitial = (): ConnectionViewMode => {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v === 'column' ? 'column' : 'entity';
    } catch {
        return 'entity';
    }
};

interface ConnectionViewState {
    mode: ConnectionViewMode;
    setMode: (mode: ConnectionViewMode) => void;
    /** 컬럼 모드에서 실제로 관계선이 붙어 있는 컬럼 핸들 id 집합 */
    connectedHandleIds: Set<string>;
    setConnectedHandleIds: (ids: Set<string>) => void;
}

export const useConnectionViewStore = create<ConnectionViewState>((set) => ({
    mode: loadInitial(),
    setMode: (mode) => {
        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch {
            /* ignore */
        }
        set({ mode });
    },
    connectedHandleIds: new Set<string>(),
    setConnectedHandleIds: (ids) => set({ connectedHandleIds: ids }),
}));

/** 컬럼 핸들 id 유틸 — 'col__<side>__<attrId>' 형식 */
const COLUMN_HANDLE_PREFIX = 'col__';

export const columnHandleId = (attrId: string, side: 'left' | 'right') =>
    `${COLUMN_HANDLE_PREFIX}${side}__${attrId}`;

export const parseColumnHandle = (
    handleId?: string | null,
): { side: 'left' | 'right'; attrId: string } | null => {
    if (!handleId || !handleId.startsWith(COLUMN_HANDLE_PREFIX)) return null;
    const rest = handleId.slice(COLUMN_HANDLE_PREFIX.length);
    const idx = rest.indexOf('__');
    if (idx < 0) return null;
    const side = rest.slice(0, idx);
    if (side !== 'left' && side !== 'right') return null;
    return { side, attrId: rest.slice(idx + 2) };
};
