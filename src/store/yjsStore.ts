/**
 * yjsStore.ts
 *
 * Yjs CRDT 기반 실시간 협업 스토어.
 * SCREEN_DESIGN / COMPONENT 프로젝트의 캔버스 데이터(screens, flows, sections)를
 * 이 스토어를 통해 관리합니다.
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { create } from 'zustand';
import type { Screen, ScreenFlow, ScreenSection } from '../types/screenDesign';
import type { ProcessFlowNode, ProcessFlowEdge, ProcessFlowSection } from '../types/processFlow';
import { normalizeProcessFlowEdge } from '../utils/normalizeProcessFlowEdge';
import { useScreenDesignStore } from './screenDesignStore';
import { useComponentStore } from './componentStore';
import { useAuthStore } from './authStore';

// ✅ 수정: 현재 브라우저 주소창에 찍힌 정보를 그대로 따라가도록 변경
const host = window.location.hostname; // 'localhost', '192.168...', '210.92...' 자동 감지
const hostWithPort = window.location.host; // 포트가 있으면 포함, 기본 포트면 host만 사용
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

let YJS_WS_URL = "";

if (host === 'localhost' || host === '127.0.0.1') {
    // 1. 💻 로컬 개발 환경 (localhost:5173)
    // Yjs 서버가 4000번 포트에서 실행 중이므로 직접 연결합니다.
    YJS_WS_URL = `${protocol}//${host}:4000`; 
} else {
    // 2. 🌐 배포/서버 환경 (210.92... 또는 192.168...)
    // 이전에 에러가 났던 경로인 '/yjs' 프록시 경로를 사용합니다.
    // window.location.host를 사용하면 2000/8080 같은 포트는 유지하면서,
    // 기본 포트 배포에서 `host:/yjs`라는 잘못된 URL이 만들어지는 일을 막는다.
    YJS_WS_URL = `${protocol}//${hostWithPort}/yjs`;
}

// console.log("� Current Yjs URL:", YJS_WS_URL);

/** Y.Map에 객체/배열을 저장할 때 브라우저 객체 참조를 남기지 않는 JSON 경계. */
const cloneForYjs = <T,>(value: T): T => {
    if (value == null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value)) as T;
};

const setYMapField = (yMap: Y.Map<any>, key: string, value: unknown) => {
    if (value === undefined) yMap.delete(key);
    else yMap.set(key, cloneForYjs(value));
};

const createYRecord = (record: object): Y.Map<any> => {
    const yMap = new Y.Map<any>();
    Object.entries(record).forEach(([key, value]) => setYMapField(yMap, key, value));
    return yMap;
};

/**
 * 일반 병합은 ID가 없는 기존 레코드를 삭제하지 않는다.
 * 다른 탭이 방금 추가한 데이터가 오래된 배열 스냅샷 때문에 지워지는 것을 막는다.
 */
const upsertYRecord = (root: Y.Map<Y.Map<any>>, record: object) => {
    const id = typeof (record as { id?: unknown }).id === 'string'
        ? (record as { id: string }).id
        : '';
    if (!id) return;
    const existing = root.get(id);
    if (!existing) {
        root.set(id, createYRecord(record));
        return;
    }
    Object.entries(record).forEach(([key, value]) => setYMapField(existing, key, value));
};

const replaceYRecords = (root: Y.Map<Y.Map<any>>, records: object[]) => {
    root.clear();
    records.forEach((record) => {
        const id = typeof (record as { id?: unknown }).id === 'string'
            ? (record as { id: string }).id
            : '';
        if (id) root.set(id, createYRecord(record));
    });
};

interface YjsStore {
    ydoc: Y.Doc | null;
    provider: WebsocketProvider | null;
    screens: Screen[];
    flows: ScreenFlow[];
    sections: ScreenSection[];
    pfNodes: ProcessFlowNode[];
    pfEdges: ProcessFlowEdge[];
    pfSections: ProcessFlowSection[];
    isSynced: boolean;
    isConnected: boolean;
    wsUrl: string;
    lastStatus: string | null;
    lastError: string | null;
    lastSyncAt: number | null;
    currentProjectId: string | null;

    joinProject: (projectId: string) => void;
    leaveProject: () => void;
    updateScreen: (id: string, patch: Partial<Screen>) => void;
    moveScreen: (id: string, position: { x: number; y: number }) => void;
    addScreen: (screen: Screen) => void;
    deleteScreen: (id: string) => void;
    updateFlow: (id: string, patch: Partial<ScreenFlow>) => void;
    addFlow: (flow: ScreenFlow) => void;
    deleteFlow: (id: string) => void;
    updateSection: (id: string, patch: Partial<ScreenSection>) => void;
    addSection: (section: ScreenSection) => void;
    deleteSection: (id: string) => void;

    pfUpdateNode: (id: string, patch: Partial<ProcessFlowNode>) => void;
    pfAddNode: (node: ProcessFlowNode) => void;
    pfDeleteNode: (id: string) => void;
    pfUpdateEdge: (id: string, patch: Partial<ProcessFlowEdge>) => void;
    pfAddEdge: (edge: ProcessFlowEdge) => void;
    pfDeleteEdge: (id: string) => void;
    pfUpdateSection: (id: string, patch: Partial<ProcessFlowSection>) => void;
    pfAddSection: (section: ProcessFlowSection) => void;
    pfDeleteSection: (id: string) => void;

    exportData: () => {
        screens: Screen[];
        flows: ScreenFlow[];
        sections: ScreenSection[];
        pfNodes: ProcessFlowNode[];
        pfEdges: ProcessFlowEdge[];
        pfSections: ProcessFlowSection[];
    };
    /** 기존 데이터는 보존하는 ID/필드 단위 병합. 일반 import·검색치환에서 사용한다. */
    mergeData: (data: {
        screens?: Screen[];
        flows?: ScreenFlow[];
        sections?: ScreenSection[];
        pfNodes?: ProcessFlowNode[];
        pfEdges?: ProcessFlowEdge[];
        pfSections?: ProcessFlowSection[];
    }) => boolean;
    /** 사용자가 명시적으로 전체 교체를 승인한 경우에만 사용한다. */
    replaceData: (data: {
        screens?: Screen[];
        flows?: ScreenFlow[];
        sections?: ScreenSection[];
        pfNodes?: ProcessFlowNode[];
        pfEdges?: ProcessFlowEdge[];
        pfSections?: ProcessFlowSection[];
    }) => boolean;
    /** @deprecated `mergeData` 사용. 하위 호환을 위한 비파괴 별칭이다. */
    importData: (data: {
        screens?: Screen[];
        flows?: ScreenFlow[];
        sections?: ScreenSection[];
        pfNodes?: ProcessFlowNode[];
        pfEdges?: ProcessFlowEdge[];
        pfSections?: ProcessFlowSection[];
    }) => boolean;
    _observeYMaps: (ydoc: Y.Doc) => () => void;
    _cleanupObservers: (() => void) | null;
}

export const useYjsStore = create<YjsStore>((set, get) => ({
    ydoc: null,
    provider: null,
    screens: [],
    flows: [],
    sections: [],
    pfNodes: [],
    pfEdges: [],
    pfSections: [],
    isSynced: false,
    isConnected: false,
    wsUrl: YJS_WS_URL,
    lastStatus: null,
    lastError: null,
    lastSyncAt: null,
    currentProjectId: null,
    _cleanupObservers: null,

    joinProject: (projectId: string) => {
        get().leaveProject();
        if (projectId.startsWith('local_')) {
            set({
                currentProjectId: projectId,
                isSynced: true,
                isConnected: true,
                lastStatus: 'connected',
                lastError: null,
                lastSyncAt: Date.now(),
            });
            return;
        }

        const ydoc = new Y.Doc();
        const authUserId = useAuthStore.getState().user?.id;
        const yjsParams =
            authUserId && /^[a-f0-9]{24}$/i.test(authUserId) ? { userId: authUserId } : undefined;
        const provider = new WebsocketProvider(YJS_WS_URL, projectId, ydoc, {
            connect: true,
            ...(yjsParams ? { params: yjsParams } : {}),
        });

        // If WebSocket connects but initial Yjs sync never completes, surface a diagnostic error.
        // This typically indicates that the server at YJS_WS_URL is not a y-websocket server,
        // a path mismatch, or the room/projectId is not being handled correctly.
        const syncTimeoutMs = 5000;
        const syncTimeout = setTimeout(() => {
            const st = get();
            if (st.provider === provider && st.isConnected && !st.isSynced) {
                set({ lastError: `sync-timeout (${syncTimeoutMs}ms)` });
            }
        }, syncTimeoutMs);

        provider.on('status', ({ status }: { status: string }) => {
            set({
                isConnected: status === 'connected',
                // 연결이 끊긴 동안에는 오래된 로컬 Y.Doc에 쓰지 않도록 편집을 잠근다.
                // 재연결 후 서버가 시드된 문서를 sync했을 때만 다시 true가 된다.
                ...(status === 'connected' ? {} : { isSynced: false }),
                lastStatus: status,
            });
            if (status !== 'connected') {
                clearTimeout(syncTimeout);
            }
        });
        provider.on('sync', (synced: boolean) => {
            if (synced) {
                clearTimeout(syncTimeout);
                set({ isSynced: true, lastSyncAt: Date.now(), lastError: null });
            } else {
                set({ isSynced: false });
            }
        });

        // y-websocket provider diagnostic events
        // (helps identify cases where WS connects but sync never completes)
        provider.on('connection-error', (err: any) => {
            const msg = (err && (err.message || String(err))) || 'connection-error';
            clearTimeout(syncTimeout);
            set({ lastError: msg, isConnected: false, isSynced: false });
        });
        provider.on('connection-close', (evt: any) => {
            const msg = (evt && (evt.reason || evt.code || String(evt))) || 'connection-close';
            clearTimeout(syncTimeout);
            set({ lastError: String(msg), isConnected: false, isSynced: false });
        });

        set({
            ydoc,
            provider,
            currentProjectId: projectId,
            isSynced: false,
            isConnected: false,
            wsUrl: YJS_WS_URL,
            lastStatus: 'connecting',
            lastError: null,
            lastSyncAt: null,
        });
        const cleanup = get()._observeYMaps(ydoc);
        set({ _cleanupObservers: cleanup });
    },

    leaveProject: () => {
        const { provider, ydoc, _cleanupObservers } = get();
        if (_cleanupObservers) _cleanupObservers();
        provider?.disconnect();
        ydoc?.destroy();
        set({
            ydoc: null, provider: null, currentProjectId: null,
            isSynced: false, isConnected: false, screens: [], flows: [], sections: [], pfNodes: [], pfEdges: [], pfSections: [],
            lastStatus: null,
            lastError: null,
            lastSyncAt: null,
            _cleanupObservers: null,
        });
    },

    // 💡 핵심: Y.Map 안에 중첩 Y.Map을 사용하여 속성별 병합(Merge)이 가능하도록 처리
    _observeYMaps: (ydoc: Y.Doc) => {
        const yScreens = ydoc.getMap<Y.Map<any>>('screens');
        const yFlows = ydoc.getMap<Y.Map<any>>('flows');
        const ySections = ydoc.getMap<Y.Map<any>>('sections');
        const yPfNodes = ydoc.getMap<Y.Map<any>>('pf_nodes');
        const yPfEdges = ydoc.getMap<Y.Map<any>>('pf_edges');
        const yPfSections = ydoc.getMap<Y.Map<any>>('pf_sections');

        const screenIdByMap = new WeakMap<Y.Map<any>, string>();
        const flowIdByMap = new WeakMap<Y.Map<any>, string>();
        const sectionIdByMap = new WeakMap<Y.Map<any>, string>();
        const pfNodeIdByMap = new WeakMap<Y.Map<any>, string>();
        const pfEdgeIdByMap = new WeakMap<Y.Map<any>, string>();
        const pfSectionIdByMap = new WeakMap<Y.Map<any>, string>();

        const buildScreens = () =>
            Array.from(yScreens.entries()).map(([id, yMap]) => {
                screenIdByMap.set(yMap, id);
                return yMap.toJSON() as Screen;
            });

        const buildFlows = () =>
            Array.from(yFlows.entries()).map(([id, yMap]) => {
                flowIdByMap.set(yMap, id);
                return yMap.toJSON() as ScreenFlow;
            });

        const buildSections = () =>
            Array.from(ySections.entries()).map(([id, yMap]) => {
                sectionIdByMap.set(yMap, id);
                return yMap.toJSON() as ScreenSection;
            });

        const buildPfNodes = () =>
            Array.from(yPfNodes.entries()).map(([id, yMap]) => {
                pfNodeIdByMap.set(yMap, id);
                return yMap.toJSON() as ProcessFlowNode;
            });

        const buildPfEdges = () =>
            Array.from(yPfEdges.entries()).map(([id, yMap]) => {
                pfEdgeIdByMap.set(yMap, id);
                return normalizeProcessFlowEdge(yMap.toJSON() as ProcessFlowEdge);
            });

        const buildPfSections = () =>
            Array.from(yPfSections.entries()).map(([id, yMap]) => {
                pfSectionIdByMap.set(yMap, id);
                return yMap.toJSON() as ProcessFlowSection;
            });

        const applyScreens = (nextScreens: Screen[]) => {
            set({ screens: nextScreens });
            useScreenDesignStore.setState({ screens: nextScreens });
            useComponentStore.setState({ components: nextScreens });
        };

        const applyFlows = (nextFlows: ScreenFlow[]) => {
            set({ flows: nextFlows });
            useScreenDesignStore.setState({ flows: nextFlows });
            useComponentStore.setState({ flows: nextFlows });
        };

        const applySections = (nextSections: ScreenSection[]) => {
            set({ sections: nextSections });
            useScreenDesignStore.setState({ sections: nextSections });
        };

        const applyPfNodes = (nextNodes: ProcessFlowNode[]) => {
            set({ pfNodes: nextNodes });
        };

        const applyPfEdges = (nextEdges: ProcessFlowEdge[]) => {
            set({ pfEdges: nextEdges });
        };

        const applyPfSections = (nextSections: ProcessFlowSection[]) => {
            set({ pfSections: nextSections });
        };

        const collectChangedIds = (
            events: Y.YEvent<any>[],
            rootMap: Y.Map<Y.Map<any>>,
            idByMap: WeakMap<Y.Map<any>, string>,
        ) => {
            const changedIds = new Set<string>();
            const removedIds = new Set<string>();

            events.forEach((event) => {
                if (event.target === rootMap) {
                    const keyChanges = (event as { changes?: { keys?: Map<unknown, { action?: string }> } }).changes?.keys;
                    keyChanges?.forEach((change, key) => {
                        const id = String(key);
                        if (change?.action === 'delete') {
                            removedIds.add(id);
                            return;
                        }
                        changedIds.add(id);
                        const nestedMap = rootMap.get(id);
                        if (nestedMap) {
                            idByMap.set(nestedMap, id);
                        }
                    });
                    return;
                }

                if (event.target instanceof Y.Map) {
                    const id = idByMap.get(event.target as Y.Map<any>);
                    if (id) {
                        changedIds.add(id);
                    }
                }
            });

            return { changedIds, removedIds };
        };

        const syncScreens = (events?: Y.YEvent<any>[]) => {
            if (!events) {
                applyScreens(buildScreens());
                return;
            }

            const { changedIds, removedIds } = collectChangedIds(events, yScreens, screenIdByMap);
            if (changedIds.size === 0 && removedIds.size === 0) {
                applyScreens(buildScreens());
                return;
            }

            const nextById = new Map(get().screens.map((screen) => [screen.id, screen]));
            removedIds.forEach((id) => nextById.delete(id));
            changedIds.forEach((id) => {
                const yMap = yScreens.get(id);
                if (!yMap) return;
                screenIdByMap.set(yMap, id);
                nextById.set(id, yMap.toJSON() as Screen);
            });

            const nextScreens = Array.from(yScreens.entries())
                .map(([id]) => nextById.get(id))
                .filter((screen): screen is Screen => Boolean(screen));

            applyScreens(nextScreens);
        };

        const syncFlows = (events?: Y.YEvent<any>[]) => {
            if (!events) {
                applyFlows(buildFlows());
                return;
            }

            const { changedIds, removedIds } = collectChangedIds(events, yFlows, flowIdByMap);
            if (changedIds.size === 0 && removedIds.size === 0) {
                applyFlows(buildFlows());
                return;
            }

            const nextById = new Map(get().flows.map((flow) => [flow.id, flow]));
            removedIds.forEach((id) => nextById.delete(id));
            changedIds.forEach((id) => {
                const yMap = yFlows.get(id);
                if (!yMap) return;
                flowIdByMap.set(yMap, id);
                nextById.set(id, yMap.toJSON() as ScreenFlow);
            });

            const nextFlows = Array.from(yFlows.entries())
                .map(([id]) => nextById.get(id))
                .filter((flow): flow is ScreenFlow => Boolean(flow));

            applyFlows(nextFlows);
        };

        const syncSections = (events?: Y.YEvent<any>[]) => {
            if (!events) {
                applySections(buildSections());
                return;
            }

            const { changedIds, removedIds } = collectChangedIds(events, ySections, sectionIdByMap);
            if (changedIds.size === 0 && removedIds.size === 0) {
                applySections(buildSections());
                return;
            }

            const nextById = new Map(get().sections.map((section) => [section.id, section]));
            removedIds.forEach((id) => nextById.delete(id));
            changedIds.forEach((id) => {
                const yMap = ySections.get(id);
                if (!yMap) return;
                sectionIdByMap.set(yMap, id);
                nextById.set(id, yMap.toJSON() as ScreenSection);
            });

            const nextSections = Array.from(ySections.entries())
                .map(([id]) => nextById.get(id))
                .filter((section): section is ScreenSection => Boolean(section));

            applySections(nextSections);
        };

        const syncPfNodes = (events?: Y.YEvent<any>[]) => {
            if (!events) {
                applyPfNodes(buildPfNodes());
                return;
            }

            const { changedIds, removedIds } = collectChangedIds(events, yPfNodes, pfNodeIdByMap);
            if (changedIds.size === 0 && removedIds.size === 0) {
                applyPfNodes(buildPfNodes());
                return;
            }

            const nextById = new Map(get().pfNodes.map((n) => [n.id, n]));
            removedIds.forEach((id) => nextById.delete(id));
            changedIds.forEach((id) => {
                const yMap = yPfNodes.get(id);
                if (!yMap) return;
                pfNodeIdByMap.set(yMap, id);
                nextById.set(id, yMap.toJSON() as ProcessFlowNode);
            });

            const nextNodes = Array.from(yPfNodes.entries())
                .map(([id]) => nextById.get(id))
                .filter((n): n is ProcessFlowNode => Boolean(n));

            applyPfNodes(nextNodes);
        };

        const syncPfEdges = (events?: Y.YEvent<any>[]) => {
            if (!events) {
                applyPfEdges(buildPfEdges());
                return;
            }

            const { changedIds, removedIds } = collectChangedIds(events, yPfEdges, pfEdgeIdByMap);
            if (changedIds.size === 0 && removedIds.size === 0) {
                applyPfEdges(buildPfEdges());
                return;
            }

            const nextById = new Map(get().pfEdges.map((e) => [e.id, e]));
            removedIds.forEach((id) => nextById.delete(id));
            changedIds.forEach((id) => {
                const yMap = yPfEdges.get(id);
                if (!yMap) return;
                pfEdgeIdByMap.set(yMap, id);
                nextById.set(id, normalizeProcessFlowEdge(yMap.toJSON() as ProcessFlowEdge));
            });

            const nextEdges = Array.from(yPfEdges.entries())
                .map(([id]) => nextById.get(id))
                .filter((e): e is ProcessFlowEdge => Boolean(e));

            applyPfEdges(nextEdges);
        };

        const syncPfSections = (events?: Y.YEvent<any>[]) => {
            if (!events) {
                applyPfSections(buildPfSections());
                return;
            }

            const { changedIds, removedIds } = collectChangedIds(events, yPfSections, pfSectionIdByMap);
            if (changedIds.size === 0 && removedIds.size === 0) {
                applyPfSections(buildPfSections());
                return;
            }

            const nextById = new Map(get().pfSections.map((s) => [s.id, s]));
            removedIds.forEach((id) => nextById.delete(id));
            changedIds.forEach((id) => {
                const yMap = yPfSections.get(id);
                if (!yMap) return;
                pfSectionIdByMap.set(yMap, id);
                nextById.set(id, yMap.toJSON() as ProcessFlowSection);
            });

            const nextSections = Array.from(yPfSections.entries())
                .map(([id]) => nextById.get(id))
                .filter((s): s is ProcessFlowSection => Boolean(s));

            applyPfSections(nextSections);
        };

        const handleScreensChange = (events: Y.YEvent<any>[]) => syncScreens(events);
        const handleFlowsChange = (events: Y.YEvent<any>[]) => syncFlows(events);
        const handleSectionsChange = (events: Y.YEvent<any>[]) => syncSections(events);
        const handlePfNodesChange = (events: Y.YEvent<any>[]) => syncPfNodes(events);
        const handlePfEdgesChange = (events: Y.YEvent<any>[]) => syncPfEdges(events);
        const handlePfSectionsChange = (events: Y.YEvent<any>[]) => syncPfSections(events);

        yScreens.observeDeep(handleScreensChange);
        yFlows.observeDeep(handleFlowsChange);
        ySections.observeDeep(handleSectionsChange);
        yPfNodes.observeDeep(handlePfNodesChange);
        yPfEdges.observeDeep(handlePfEdgesChange);
        yPfSections.observeDeep(handlePfSectionsChange);

        syncScreens();
        syncFlows();
        syncSections();
        syncPfNodes();
        syncPfEdges();
        syncPfSections();

        return () => {
            yScreens.unobserveDeep(handleScreensChange);
            yFlows.unobserveDeep(handleFlowsChange);
            ySections.unobserveDeep(handleSectionsChange);
            yPfNodes.unobserveDeep(handlePfNodesChange);
            yPfEdges.unobserveDeep(handlePfEdgesChange);
            yPfSections.unobserveDeep(handlePfSectionsChange);
        };
    },

    updateScreen: (id, patch) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const yMap = ydoc.getMap<Y.Map<any>>('screens').get(id);
        if (yMap) {
            ydoc.transact(() => {
                Object.entries(patch).forEach(([key, value]) => setYMapField(yMap, key, value));
            });
        }
    },

    moveScreen: (id, position) => {
        get().updateScreen(id, { position });
    },

    addScreen: (screen) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        ydoc.getMap<Y.Map<any>>('screens').set(screen.id, createYRecord(screen));
    },

    deleteScreen: (id) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const yFlows = ydoc.getMap<Y.Map<any>>('flows');
        ydoc.transact(() => {
            ydoc.getMap<Y.Map<any>>('screens').delete(id);
            Array.from(yFlows.entries())
                .filter(([, yMap]) => yMap.get('source') === id || yMap.get('target') === id)
                .forEach(([fId]) => yFlows.delete(fId));
        });
    },

    updateFlow: (id, patch) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const yMap = ydoc.getMap<Y.Map<any>>('flows').get(id);
        if (yMap) {
            ydoc.transact(() => Object.entries(patch).forEach(([key, value]) => setYMapField(yMap, key, value)));
        }
    },

    addFlow: (flow) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        ydoc.getMap<Y.Map<any>>('flows').set(flow.id, createYRecord(flow));
    },

    deleteFlow: (id) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        ydoc.getMap<Y.Map<any>>('flows').delete(id);
    },

    updateSection: (id, patch) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const yMap = ydoc.getMap<Y.Map<any>>('sections').get(id);
        if (yMap) {
            ydoc.transact(() => Object.entries(patch).forEach(([key, value]) => setYMapField(yMap, key, value)));
        }
    },

    addSection: (section) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        ydoc.getMap<Y.Map<any>>('sections').set(section.id, createYRecord(section));
    },

    deleteSection: (id) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        ydoc.getMap('sections').delete(id);
    },

    pfUpdateNode: (id, patch) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const yMap = ydoc.getMap<Y.Map<any>>('pf_nodes').get(id);
        if (yMap) {
            ydoc.transact(() => {
                Object.entries(patch).forEach(([key, value]) => setYMapField(yMap, key, value));
            });
        }
    },

    pfAddNode: (node) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const root = ydoc.getMap<Y.Map<any>>('pf_nodes');
        if (root.get(node.id)) return;
        ydoc.transact(() => {
            root.set(node.id, createYRecord(node));
        });
    },

    pfDeleteNode: (id) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        ydoc.getMap('pf_nodes').delete(id);
    },

    pfUpdateEdge: (id, patch) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const yMap = ydoc.getMap<Y.Map<any>>('pf_edges').get(id);
        if (yMap) {
            ydoc.transact(() => {
                Object.entries(patch).forEach(([key, value]) => {
                    setYMapField(yMap, key, key === 'kindText' && value != null ? String(value) : value);
                });
            });
        }
    },

    pfAddEdge: (edge) => {
        const { ydoc, isSynced, pfNodes } = get();
        if (!ydoc || !isSynced) return;
        const root = ydoc.getMap<Y.Map<any>>('pf_edges');
        const src = edge.source;
        const tgt = edge.target;
        
        // 마름모 도형이 관련된 연결인지 확인
        const sourceNode = pfNodes.find(n => n.id === src);
        const targetNode = pfNodes.find(n => n.id === tgt);
        const isDiamondConnection = 
            (sourceNode && sourceNode.type === 'RECT' && sourceNode.shape === 'diamond') ||
            (targetNode && targetNode.type === 'RECT' && targetNode.shape === 'diamond');
        
        ydoc.transact(() => {
            // 마름모 연결이 아닌 경우에만 동일 노드 쌍 기존 선 제거
            if (!isDiamondConnection) {
                const toDelete: string[] = [];
                root.forEach((yMap, edgeId) => {
                    if (!(yMap instanceof Y.Map)) return;
                    const s = yMap.get('source') as string | undefined;
                    const t = yMap.get('target') as string | undefined;
                    if (
                        s != null &&
                        t != null &&
                        ((s === src && t === tgt) || (s === tgt && t === src))
                    ) {
                        toDelete.push(edgeId);
                    }
                });
                toDelete.forEach((id) => root.delete(id));
            }

            if (root.get(edge.id)) return;
            root.set(edge.id, createYRecord(normalizeProcessFlowEdge(edge)));
        });
    },

    pfDeleteEdge: (id) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        ydoc.getMap('pf_edges').delete(id);
    },

    pfUpdateSection: (id, patch) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const yMap = ydoc.getMap<Y.Map<any>>('pf_sections').get(id);
        if (yMap) {
            ydoc.transact(() => {
                Object.entries(patch).forEach(([key, value]) => setYMapField(yMap, key, value));
            });
        }
    },

    pfAddSection: (section) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const root = ydoc.getMap<Y.Map<any>>('pf_sections');
        if (root.get(section.id)) return;
        ydoc.transact(() => {
            root.set(section.id, createYRecord(section));
        });
    },

    pfDeleteSection: (id) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        ydoc.getMap('pf_sections').delete(id);
    },

    exportData: () => {
        const { screens, flows, sections, pfNodes, pfEdges, pfSections } = get();
        return { screens, flows, sections, pfNodes, pfEdges, pfSections };
    },

    mergeData: (data) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return false;
        ydoc.transact(() => {
            const yScreens = ydoc.getMap<Y.Map<any>>('screens');
            const yFlows = ydoc.getMap<Y.Map<any>>('flows');
            const ySections = ydoc.getMap<Y.Map<any>>('sections');
            const yPfNodes = ydoc.getMap<Y.Map<any>>('pf_nodes');
            const yPfEdges = ydoc.getMap<Y.Map<any>>('pf_edges');
            const yPfSections = ydoc.getMap<Y.Map<any>>('pf_sections');

            if (Array.isArray(data.screens)) data.screens.forEach((screen) => upsertYRecord(yScreens, screen));
            if (Array.isArray(data.flows)) data.flows.forEach((flow) => upsertYRecord(yFlows, flow));
            if (Array.isArray(data.sections)) data.sections.forEach((section) => upsertYRecord(ySections, section));
            if (Array.isArray(data.pfNodes)) data.pfNodes.forEach((node) => upsertYRecord(yPfNodes, node));
            if (Array.isArray(data.pfEdges)) {
                data.pfEdges.forEach((edge) => upsertYRecord(yPfEdges, normalizeProcessFlowEdge(edge)));
            }
            if (Array.isArray(data.pfSections)) data.pfSections.forEach((section) => upsertYRecord(yPfSections, section));
        });
        return true;
    },

    replaceData: (data) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return false;
        ydoc.transact(() => {
            const yScreens = ydoc.getMap<Y.Map<any>>('screens');
            const yFlows = ydoc.getMap<Y.Map<any>>('flows');
            const ySections = ydoc.getMap<Y.Map<any>>('sections');
            const yPfNodes = ydoc.getMap<Y.Map<any>>('pf_nodes');
            const yPfEdges = ydoc.getMap<Y.Map<any>>('pf_edges');
            const yPfSections = ydoc.getMap<Y.Map<any>>('pf_sections');

            if (Array.isArray(data.screens)) replaceYRecords(yScreens, data.screens);
            if (Array.isArray(data.flows)) replaceYRecords(yFlows, data.flows);
            if (Array.isArray(data.sections)) replaceYRecords(ySections, data.sections);
            if (Array.isArray(data.pfNodes)) replaceYRecords(yPfNodes, data.pfNodes);
            if (Array.isArray(data.pfEdges)) {
                replaceYRecords(yPfEdges, data.pfEdges.map((edge) => normalizeProcessFlowEdge(edge)));
            }
            if (Array.isArray(data.pfSections)) replaceYRecords(yPfSections, data.pfSections);
        });
        return true;
    },

    // 기존 호출부가 있어도 전체 삭제가 일어나지 않도록 비파괴 병합으로 유지한다.
    importData: (data) => get().mergeData(data),
}));
