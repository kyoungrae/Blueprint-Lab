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
const port = window.location.port;     // '5173', '8080', '2000' 자동 감지
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

let YJS_WS_URL = "";

if (host === 'localhost' || host === '127.0.0.1') {
    // 1. 💻 로컬 개발 환경 (localhost:5173)
    // Yjs 서버가 4000번 포트에서 실행 중이므로 직접 연결합니다.
    YJS_WS_URL = `${protocol}//${host}:4000`; 
} else {
    // 2. 🌐 배포/서버 환경 (210.92... 또는 192.168...)
    // 이전에 에러가 났던 경로인 '/yjs' 프록시 경로를 사용합니다.
    // 포트는 현재 접속한 포트(2000 또는 8080)를 그대로 따라갑니다.
    YJS_WS_URL = `${protocol}//${host}:${port}/yjs`;
}

// console.log("� Current Yjs URL:", YJS_WS_URL);

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
            set({ isConnected: status === 'connected', lastStatus: status });
            if (status !== 'connected') {
                clearTimeout(syncTimeout);
            }
        });
        provider.on('sync', (synced: boolean) => {
            if (synced) {
                clearTimeout(syncTimeout);
                set({ isSynced: true, lastSyncAt: Date.now(), lastError: null });
            }
        });

        // y-websocket provider diagnostic events
        // (helps identify cases where WS connects but sync never completes)
        provider.on('connection-error', (err: any) => {
            const msg = (err && (err.message || String(err))) || 'connection-error';
            clearTimeout(syncTimeout);
            set({ lastError: msg, isConnected: false });
        });
        provider.on('connection-close', (evt: any) => {
            const msg = (evt && (evt.reason || evt.code || String(evt))) || 'connection-close';
            clearTimeout(syncTimeout);
            set({ lastError: String(msg), isConnected: false });
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
                Object.entries(patch).forEach(([k, v]) => yMap.set(k, v));
            });
        }
    },

    moveScreen: (id, position) => {
        get().updateScreen(id, { position });
    },

    addScreen: (screen) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const yMap = new Y.Map();
        Object.entries(screen).forEach(([k, v]) => yMap.set(k, v));
        ydoc.getMap<Y.Map<any>>('screens').set(screen.id, yMap);
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
            ydoc.transact(() => Object.entries(patch).forEach(([k, v]) => yMap.set(k, v)));
        }
    },

    addFlow: (flow) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const yMap = new Y.Map();
        Object.entries(flow).forEach(([k, v]) => yMap.set(k, v));
        ydoc.getMap<Y.Map<any>>('flows').set(flow.id, yMap);
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
            ydoc.transact(() => Object.entries(patch).forEach(([k, v]) => yMap.set(k, v)));
        }
    },

    addSection: (section) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const yMap = new Y.Map();
        Object.entries(section).forEach(([k, v]) => yMap.set(k, v));
        ydoc.getMap<Y.Map<any>>('sections').set(section.id, yMap);
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
                Object.entries(patch).forEach(([k, v]) => yMap.set(k, v));
            });
        }
    },

    pfAddNode: (node) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const root = ydoc.getMap<Y.Map<any>>('pf_nodes');
        if (root.get(node.id)) return;
        ydoc.transact(() => {
            const yMap = new Y.Map<any>();
            Object.entries(node).forEach(([k, v]) => yMap.set(k, v));
            root.set(node.id, yMap);
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
                Object.entries(patch).forEach(([k, v]) => yMap.set(k, v));
            });
        }
    },

    pfAddEdge: (edge) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const root = ydoc.getMap<Y.Map<any>>('pf_edges');
        const src = edge.source;
        const tgt = edge.target;
        ydoc.transact(() => {
            // 동일 노드 쌍(A↔B)에 이미 선이 있으면 제거 후 새 방향·핸들로 한 줄만 유지
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

            if (root.get(edge.id)) return;
            const yMap = new Y.Map<any>();
            Object.entries(edge).forEach(([k, v]) => yMap.set(k, v));
            root.set(edge.id, yMap);
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
                Object.entries(patch).forEach(([k, v]) => yMap.set(k, v));
            });
        }
    },

    pfAddSection: (section) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return;
        const root = ydoc.getMap<Y.Map<any>>('pf_sections');
        if (root.get(section.id)) return;
        ydoc.transact(() => {
            const yMap = new Y.Map<any>();
            Object.entries(section).forEach(([k, v]) => yMap.set(k, v));
            root.set(section.id, yMap);
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

    importData: (data) => {
        const { ydoc, isSynced } = get();
        if (!ydoc || !isSynced) return false;
        ydoc.transact(() => {
            const yScreens = ydoc.getMap<Y.Map<any>>('screens');
            const yFlows = ydoc.getMap<Y.Map<any>>('flows');
            const ySections = ydoc.getMap<Y.Map<any>>('sections');
            const yPfNodes = ydoc.getMap<Y.Map<any>>('pf_nodes');
            const yPfEdges = ydoc.getMap<Y.Map<any>>('pf_edges');
            const yPfSections = ydoc.getMap<Y.Map<any>>('pf_sections');

            if (data.screens) {
                yScreens.clear();
                data.screens.forEach((screen) => {
                    const yMap = new Y.Map();
                    Object.entries(screen).forEach(([k, v]) => yMap.set(k, v));
                    yScreens.set(screen.id, yMap);
                });
            }

            if (data.flows) {
                yFlows.clear();
                data.flows.forEach((flow) => {
                    const yMap = new Y.Map();
                    Object.entries(flow).forEach(([k, v]) => yMap.set(k, v));
                    yFlows.set(flow.id, yMap);
                });
            }

            if (data.sections) {
                ySections.clear();
                data.sections.forEach((section) => {
                    const yMap = new Y.Map();
                    Object.entries(section).forEach(([k, v]) => yMap.set(k, v));
                    ySections.set(section.id, yMap);
                });
            }

            if (data.pfNodes) {
                yPfNodes.clear();
                data.pfNodes.forEach((node) => {
                    const yMap = new Y.Map();
                    Object.entries(node).forEach(([k, v]) => yMap.set(k, v));
                    yPfNodes.set(node.id, yMap);
                });
            }

            if (data.pfEdges) {
                yPfEdges.clear();
                data.pfEdges.forEach((edge) => {
                    const normalized = normalizeProcessFlowEdge(edge);
                    const yMap = new Y.Map();
                    Object.entries(normalized).forEach(([k, v]) => yMap.set(k, v));
                    yPfEdges.set(edge.id, yMap);
                });
            }

            if (data.pfSections) {
                yPfSections.clear();
                data.pfSections.forEach((section) => {
                    const yMap = new Y.Map();
                    Object.entries(section).forEach(([k, v]) => yMap.set(k, v));
                    yPfSections.set(section.id, yMap);
                });
            }
        });
        return true;
    },
}));
