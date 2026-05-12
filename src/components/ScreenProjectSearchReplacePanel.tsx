import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Screen, ScreenFlow, ScreenSection } from '../types/screenDesign';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useYjsStore } from '../store/yjsStore';
import { useProjectStore } from '../store/projectStore';
import { fetchWithAuth } from '../utils/fetchWithAuth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects';

/** id·연결 참조 등 치환 시 깨질 수 있는 필드는 문자열 치환에서 제외 */
const SKIP_REPLACE_KEYS = new Set([
    'id',
    'source',
    'target',
    'unlockedUserId',
    'authorId',
    'fromComponentId',
    'imageUrl',
]);

/** 화면 메모(memos)는 검색·치환에서 제외 (작성자명 등으로 검색 hit이 어긋나는 것 방지) */
const SKIP_PROJECT_SEARCH_SUBTREE_KEYS = new Set(['memos']);

function deepReplaceStrings(value: unknown, find: string, replace: string, key?: string): unknown {
    if (!find) return value;
    if (typeof value === 'string') {
        if (key && SKIP_REPLACE_KEYS.has(key)) return value;
        return value.split(find).join(replace);
    }
    if (Array.isArray(value)) {
        return value.map((item) => deepReplaceStrings(item, find, replace, key));
    }
    if (value !== null && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const next: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
            if (SKIP_PROJECT_SEARCH_SUBTREE_KEYS.has(k)) {
                next[k] = v;
            } else {
                next[k] = deepReplaceStrings(v, find, replace, k);
            }
        }
        return next;
    }
    return value;
}

function countOccurrences(value: unknown, find: string, key?: string): number {
    if (!find) return 0;
    if (typeof value === 'string') {
        if (key && SKIP_REPLACE_KEYS.has(key)) return 0;
        let count = 0;
        let i = 0;
        while ((i = value.indexOf(find, i)) !== -1) {
            count++;
            i += find.length;
        }
        return count;
    }
    if (Array.isArray(value)) {
        return value.reduce((acc, item) => acc + countOccurrences(item, find, key), 0);
    }
    if (value !== null && typeof value === 'object') {
        return Object.entries(value as object).reduce((acc, [k, v]) => {
            if (SKIP_PROJECT_SEARCH_SUBTREE_KEYS.has(k)) return acc;
            return acc + countOccurrences(v, find, k);
        }, 0);
    }
    return 0;
}

/** 캔버스로 스크롤할 검색 일치 항목 (화면 노드 / 연결 / 섹션 영역) */
export type ProjectSearchNavigateHit =
    | { kind: 'screen'; id: string }
    | { kind: 'flow'; id: string }
    | { kind: 'section'; id: string };

export interface ScreenProjectSearchReplacePanelProps {
    isOpen: boolean;
    onClose: () => void;
    currentProjectId: string | null;
    yjsIsSynced: boolean;
    /** 검색 버튼으로 현재 일치 항목으로 뷰 이동 (React Flow 쪽에서 구현) */
    onNavigateSearchHit?: (hit: ProjectSearchNavigateHit) => void;
}

const ScreenProjectSearchReplacePanel: React.FC<ScreenProjectSearchReplacePanelProps> = ({
    isOpen,
    onClose,
    currentProjectId,
    yjsIsSynced,
    onNavigateSearchHit,
}) => {
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [busy, setBusy] = useState(false);
    /** 바꿀 내용 입력란을 한 번이라도 수정했을 때만 치환 적용 버튼 표시 (빈 문자열로 삭제 치환 포함) */
    const [replaceDirty, setReplaceDirty] = useState(false);
    const [searchHitIndex, setSearchHitIndex] = useState(-1);

    const yjsScreens = useYjsStore((s) => s.screens);
    const yjsFlows = useYjsStore((s) => s.flows);
    const yjsSections = useYjsStore((s) => s.sections);
    const storeScreens = useScreenDesignStore((s) => s.screens);
    const storeFlows = useScreenDesignStore((s) => s.flows);
    const storeSections = useScreenDesignStore((s) => s.sections);

    const baseScreens = yjsIsSynced ? yjsScreens : storeScreens;
    const baseFlows = yjsIsSynced ? yjsFlows : storeFlows;
    const baseSections = yjsIsSynced ? yjsSections : storeSections;

    const matchCount = useMemo(() => {
        const f = findText.trim();
        if (!f) return 0;
        let n = 0;
        for (const sc of baseScreens) n += countOccurrences(sc as unknown, f);
        for (const fl of baseFlows) n += countOccurrences(fl as unknown, f);
        for (const sec of baseSections) n += countOccurrences(sec as unknown, f);
        return n;
    }, [findText, baseScreens, baseFlows, baseSections]);

    const searchHits = useMemo((): ProjectSearchNavigateHit[] => {
        const f = findText.trim();
        if (!f) return [];
        const out: ProjectSearchNavigateHit[] = [];
        for (const sc of baseScreens) {
            if (countOccurrences(sc as unknown, f) > 0) out.push({ kind: 'screen', id: sc.id });
        }
        for (const fl of baseFlows) {
            if (countOccurrences(fl as unknown, f) > 0) out.push({ kind: 'flow', id: fl.id });
        }
        for (const sec of baseSections) {
            if (countOccurrences(sec as unknown, f) > 0) out.push({ kind: 'section', id: sec.id });
        }
        return out;
    }, [findText, baseScreens, baseFlows, baseSections]);

    useEffect(() => {
        setSearchHitIndex(-1);
        setReplaceDirty(false);
    }, [findText]);

    useEffect(() => {
        if (!isOpen) {
            setSearchHitIndex(-1);
            useScreenDesignStore.getState().setProjectSearchHighlightTerm(null);
        }
    }, [isOpen]);

    useEffect(() => {
        if (searchHits.length === 0) setSearchHitIndex(-1);
        else if (searchHitIndex >= searchHits.length) setSearchHitIndex(-1);
    }, [searchHitIndex, searchHits.length]);

    useEffect(() => {
        if (!isOpen || busy) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose, busy]);

    useEffect(() => {
        if (!isOpen || busy) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            if (t?.closest('#screen-project-search-open-btn')) return;
            const el = document.getElementById('screen-project-search-replace-panel');
            if (el && !el.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', onDown, true);
        return () => document.removeEventListener('mousedown', onDown, true);
    }, [isOpen, onClose, busy]);

    const runReplace = useCallback(async () => {
        if (!replaceDirty) return;
        const find = findText.trim();
        if (!find) {
            alert('검색할 단어를 입력해 주세요.');
            return;
        }
        if (matchCount === 0) {
            alert('일치하는 항목이 없습니다.');
            return;
        }
        const replaceDesc =
            replaceText === ''
                ? '빈 문자열로 치환(삭제)합니다'
                : `"${replaceText}"(으)로 바꿉니다`;
        if (
            !window.confirm(
                `총 ${matchCount}곳에서 "${find}"을(를) ${replaceDesc}.\n\n연결 id·imageUrl 등은 보호되며, 나머지 텍스트 필드에만 적용됩니다.\n계속할까요?`
            )
        ) {
            return;
        }

        const tStart = Date.now();
        setBusy(true);
        let success = false;
        try {
            const nextScreens = baseScreens.map((s) =>
                deepReplaceStrings(structuredClone(s) as unknown, find, replaceText) as Screen
            );
            const nextFlows = baseFlows.map((f) =>
                deepReplaceStrings(structuredClone(f) as unknown, find, replaceText) as ScreenFlow
            );
            const nextSections = baseSections.map((sec) =>
                deepReplaceStrings(structuredClone(sec) as unknown, find, replaceText) as ScreenSection
            );

            if (yjsIsSynced) {
                const ok = useYjsStore.getState().importData({
                    screens: nextScreens,
                    flows: nextFlows,
                    sections: nextSections,
                });
                if (!ok) {
                    throw new Error('동기화(Yjs)가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
                }
            } else {
                useScreenDesignStore.getState().importData({
                    screens: nextScreens,
                    flows: nextFlows,
                    sections: nextSections,
                });
                if (currentProjectId && !currentProjectId.startsWith('local_')) {
                    const res = await fetchWithAuth(`${API_URL}/${currentProjectId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            data: { screens: nextScreens, flows: nextFlows, sections: nextSections },
                        }),
                    });
                    if (!res.ok) {
                        const errBody = await res.json().catch(() => ({}));
                        throw new Error((errBody as { message?: string }).message || '서버 저장에 실패했습니다.');
                    }
                }
                if (currentProjectId) {
                    useProjectStore.getState().updateProjectData(currentProjectId, {
                        screens: nextScreens,
                        flows: nextFlows,
                        sections: nextSections,
                    });
                }
            }

            success = true;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '치환 중 오류가 발생했습니다.';
            alert(msg);
        } finally {
            const elapsed = Date.now() - tStart;
            const minMs = 500;
            if (elapsed < minMs) {
                await new Promise((r) => setTimeout(r, minMs - elapsed));
            }
            setBusy(false);
        }
        if (success) onClose();
    }, [
        replaceDirty,
        findText,
        replaceText,
        matchCount,
        baseScreens,
        baseFlows,
        baseSections,
        yjsIsSynced,
        currentProjectId,
        onClose,
    ]);

    const goSearchHitPrev = useCallback(() => {
        const f = findText.trim();
        const n = searchHits.length;
        if (!f || n === 0 || !onNavigateSearchHit) return;
        const prev = searchHitIndex < 0 ? n - 1 : (searchHitIndex - 1 + n) % n;
        useScreenDesignStore.getState().setProjectSearchHighlightTerm(f);
        onNavigateSearchHit(searchHits[prev]);
        setSearchHitIndex(prev);
    }, [findText, searchHits, searchHitIndex, onNavigateSearchHit]);

    const goSearchHitNext = useCallback(() => {
        const f = findText.trim();
        const n = searchHits.length;
        if (!f || n === 0 || !onNavigateSearchHit) return;
        const next = searchHitIndex < 0 ? 0 : (searchHitIndex + 1) % n;
        useScreenDesignStore.getState().setProjectSearchHighlightTerm(f);
        onNavigateSearchHit(searchHits[next]);
        setSearchHitIndex(next);
    }, [findText, searchHits, searchHitIndex, onNavigateSearchHit]);

    if (!isOpen) return null;

    return (
        <>
            {busy && (
                <div
                    className="fixed inset-0 z-[10060] flex flex-col items-center justify-center bg-gray-900/50 backdrop-blur-[1px] text-white gap-3"
                    role="status"
                    aria-live="polite"
                >
                    <Loader2 className="w-10 h-10 animate-spin text-violet-200" />
                    <p className="text-sm font-bold">프로젝트 데이터를 저장하는 중입니다…</p>
                    <p className="text-xs text-white/80">잠시만 기다려 주세요.</p>
                </div>
            )}
            <div
                id="screen-project-search-replace-panel"
                className="absolute right-0 top-full z-[10002] mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white shadow-xl p-4 text-left"
            >
                <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 text-gray-800 font-black text-sm">
                        <Search size={16} className="text-violet-600 shrink-0" />
                        프로젝트 검색·치환
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                        title="닫기"
                    >
                        <X size={18} />
                    </button>
                </div>
                <p className="text-[11px] text-gray-500 mb-3 leading-snug">
                    화면·연결·섹션 데이터 안의 문자열을 검색합니다. (화면 메모는 제외) 이전 검색·다음 검색으로 캔버스에서 일치 항목을 순서대로 이동합니다.
                    바꿀 내용 칸을 수정한 뒤에만 치환 적용이 나타납니다. id·연결(source/target)·이미지 URL 등은 치환에서 제외됩니다.
                </p>
                <div className="space-y-2 mb-3">
                    <label className="block text-[11px] font-bold text-gray-600">검색</label>
                    <div className="flex gap-2 items-stretch flex-wrap">
                        <input
                            value={findText}
                            onChange={(e) => setFindText(e.target.value)}
                            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="찾을 단어 또는 문구"
                            disabled={busy}
                        />
                        {onNavigateSearchHit && (
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={goSearchHitPrev}
                                    disabled={busy || !findText.trim() || searchHits.length === 0}
                                    className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-bold bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap border border-gray-200"
                                    title="이전 일치 항목(화면·연결·섹션 순)으로 이동"
                                >
                                    <ChevronLeft size={16} className="shrink-0" />
                                    이전 검색
                                </button>
                                <span className="text-[10px] font-mono font-bold text-gray-500 tabular-nums px-1 min-w-[3.25rem] text-center self-center">
                                    {searchHits.length === 0 ? (
                                        '—'
                                    ) : searchHitIndex < 0 ? (
                                        <>
                                            —<span className="text-gray-400">/{searchHits.length}</span>
                                        </>
                                    ) : (
                                        <>
                                            {searchHitIndex + 1}
                                            <span className="text-gray-400">/{searchHits.length}</span>
                                        </>
                                    )}
                                </span>
                                <button
                                    type="button"
                                    onClick={goSearchHitNext}
                                    disabled={busy || !findText.trim() || searchHits.length === 0}
                                    className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-bold bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                                    title="다음 일치 항목(화면·연결·섹션 순)으로 이동"
                                >
                                    다음 검색
                                    <ChevronRight size={16} className="shrink-0" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="space-y-2 mb-3">
                    <label className="block text-[11px] font-bold text-gray-600">바꿀 내용</label>
                    <input
                        value={replaceText}
                        onChange={(e) => {
                            setReplaceText(e.target.value);
                            setReplaceDirty(true);
                        }}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="치환 후 문자열 (비워두면 삭제)"
                        disabled={busy}
                    />
                </div>
                <div className="flex items-center justify-between gap-2 mb-3 text-xs">
                    <span className="text-gray-600">
                        일치: <span className="font-mono font-bold text-violet-700">{matchCount}</span>곳
                    </span>
                    {!yjsIsSynced && currentProjectId && !currentProjectId.startsWith('local_') && (
                        <span className="text-amber-700 font-medium">Yjs 미연결 시 서버 PATCH로 저장합니다.</span>
                    )}
                </div>
                <div className="flex justify-end gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200"
                        disabled={busy}
                    >
                        닫기
                    </button>
                    {replaceDirty && (
                        <button
                            type="button"
                            onClick={runReplace}
                            disabled={busy || !findText.trim() || matchCount === 0}
                            className="px-3 py-2 rounded-lg text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            치환 적용
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};

export default ScreenProjectSearchReplacePanel;
