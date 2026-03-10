import { create } from 'zustand';

/**
 * DragStore
 * 드래그 중인 요소들의 실시간 위치를 관리하는 전용 스토어.
 * ScreenNodeFull 전체 리렌더링을 피하기 위해 분리함.
 */
interface DragState {
    // Record<elementId, { x, y }>
    previews: Record<string, { x: number; y: number }> | null;
    setPreviews: (previews: Record<string, { x: number; y: number }> | null) => void;
}

export const useDragStore = create<DragState>((set) => ({
    previews: null,
    setPreviews: (previews) => set({ previews }),
}));
