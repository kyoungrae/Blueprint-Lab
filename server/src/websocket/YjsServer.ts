/**
 * YjsServer.ts
 *
 * 독립적인 Yjs WebSocket 서버 (y-websocket v3 서버 측 구현).
 * 기존 Socket.IO 서버(port 3001)와 별도로 port 4000에서 실행됩니다.
 *
 * ─ 역할 분담 ──────────────────────────────────────────────────────────────
 *  Yjs Server (port 4000) : 실시간 캔버스 데이터 CRDT 동기화 (screens, flows, sections)
 *  Socket.IO (port 3001)  : 커서·온라인 유저·잠금·히스토리·ERD 연산
 *
 * ─ 자동 영속성 ────────────────────────────────────────────────────────────
 *  문서 변경 시마다 메모리 내 Y.Doc을 유지하고, 30초마다 MongoDB에 스냅샷을 저장합니다.
 *  서버 재시작 시 MongoDB screenSnapshot에서 초기 데이터를 로드합니다.
 */

import { createServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as map from 'lib0/map';
import { Project } from '../models';
import { Types } from 'mongoose';
import logger from '../utils/logger';
import { touchProjectMemberLastEditedAtMany } from '../services/projectMemberActivity';

// ─── 상수 ───────────────────────────────────────────────────────────────────
const YJS_PORT = parseInt(process.env.YJS_PORT || '4000', 10);
const MONGO_SNAPSHOT_INTERVAL_MS = 30_000; // 30초마다 MongoDB 저장

// y-websocket 메시지 타입
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

// ─── 인메모리 문서 관리 ──────────────────────────────────────────────────────

interface DocInfo {
    doc: Y.Doc;
    awareness: awarenessProtocol.Awareness;
    conns: Map<WebSocket, Set<number>>;       // ws → subscribedTopics
    snapshotTimer: NodeJS.Timeout | null;
    /** 이 저장 주기 동안 문서를 수정한 멤버 userId (WebSocket에 yjsUserId 부착) */
    editorsSinceLastSave: Set<string>;
    /** 즉시 저장용 디바운스 타이머 */
    immediateSaveTimer: NodeJS.Timeout | null;
}

/** projectId → DocInfo */
const docs = new Map<string, DocInfo>();

const IMMEDIATE_SAVE_DEBOUNCE_MS = 2000; // 2초 후 즉시 저장

function getOrCreateDoc(projectId: string): DocInfo {
    return map.setIfUndefined(docs, projectId, () => {
        const doc = new Y.Doc({ gc: true });
        const awareness = new awarenessProtocol.Awareness(doc);

        const info: DocInfo = { doc, awareness, conns: new Map(), snapshotTimer: null, editorsSinceLastSave: new Set(), immediateSaveTimer: null };

        doc.on('update', (_update: Uint8Array, origin: unknown) => {
            if (!origin || typeof origin !== 'object') return;
            const ws = origin as WebSocket & { yjsUserId?: string };
            const uid = ws.yjsUserId;
            if (uid && Types.ObjectId.isValid(uid)) {
                info.editorsSinceLastSave.add(uid);
            }

            // 🚀 ProcessFlow 타입은 변경 시 즉시 저장 (2초 디바운스)
            if (info.immediateSaveTimer) {
                clearTimeout(info.immediateSaveTimer);
            }
            info.immediateSaveTimer = setTimeout(() => {
                // logger.info(`[DEBUG] Immediate save triggered for project ${projectId}`);
                saveDocToMongo(projectId, doc).catch(() => {});
            }, IMMEDIATE_SAVE_DEBOUNCE_MS);
        });

        // 문서가 변경될 때마다 연결된 모든 클라이언트에 브로드캐스트
        doc.on('update', (update: Uint8Array, _origin: unknown, _doc: Y.Doc) => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_SYNC);
            syncProtocol.writeUpdate(encoder, update);
            const message = encoding.toUint8Array(encoder);
            broadcastToDoc(projectId, message);
        });

        awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
            const changedClients = added.concat(updated, removed);
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
            const message = encoding.toUint8Array(encoder);
            broadcastToDoc(projectId, message);
        });

        // 30초마다 MongoDB에 스냅샷 저장
        info.snapshotTimer = setInterval(() => {
            // logger.info(`[DEBUG] Periodic save triggered for project ${projectId}`);
            saveDocToMongo(projectId, doc).catch(() => {});
        }, MONGO_SNAPSHOT_INTERVAL_MS);

        return info;
    });
}

function broadcastToDoc(projectId: string, message: Uint8Array): void {
    const info = docs.get(projectId);
    if (!info) return;
    info.conns.forEach((_topics, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });
}

function closeConn(projectId: string, ws: WebSocket): void {
    const info = docs.get(projectId);
    if (!info) return;

    info.conns.delete(ws);

    if (info.conns.size === 0) {
        // 모든 유저가 나갔을 때 awareness 정리 + 최종 MongoDB 저장
        awarenessProtocol.removeAwarenessStates(
            info.awareness,
            Array.from(info.awareness.getStates().keys()),
            null
        );

        // 즉시 저장 타이머 정리
        if (info.immediateSaveTimer) {
            clearTimeout(info.immediateSaveTimer);
            info.immediateSaveTimer = null;
        }

        saveDocToMongo(projectId, info.doc).catch(() => {});

        if (info.snapshotTimer) clearInterval(info.snapshotTimer);
        docs.delete(projectId);
        logger.info(`🗑️  Yjs doc unloaded: project ${projectId}`);
    }
}

// ─── MongoDB 연동 ────────────────────────────────────────────────────────────

/**
 * MongoDB screenSnapshot → Y.Doc 초기 로드
 * (room에 첫 번째 클라이언트가 접속했을 때 한 번만 호출)
 */
async function seedDocFromMongo(projectId: string, doc: Y.Doc): Promise<void> {
    if (!Types.ObjectId.isValid(projectId)) return;

    try {
        const project = await Project.findById(projectId)
            .select('projectType screenSnapshot componentSnapshot processFlowSnapshot')
            .lean();
        if (!project) return;

        const p = project as any;
        const projectType: string = p.projectType || 'ERD';

        doc.transact(() => {
            const screensMap = doc.getMap<any>('screens');
            const flowsMap   = doc.getMap<any>('flows');
            const sectionsMap = doc.getMap<any>('sections');

            // 이미 데이터가 있으면 덮어쓰지 않음
            if (screensMap.size > 0) return;

            let screens: any[] = [];
            let flows: any[] = [];
            let sections: any[] = [];

            if (projectType === 'COMPONENT') {
                screens  = p.componentSnapshot?.components || [];
                flows    = p.componentSnapshot?.flows || [];
            } else if (projectType === 'SCREEN_DESIGN') {
                screens  = p.screenSnapshot?.screens || [];
                flows    = p.screenSnapshot?.flows || [];
                sections = p.screenSnapshot?.sections || [];
            } else if (projectType === 'PROCESS_FLOW') {
                // ProcessFlow는 별도의 Map 사용
                const pfNodes   = p.processFlowSnapshot?.nodes || [];
                const pfEdges   = p.processFlowSnapshot?.edges || [];
                const pfSections = p.processFlowSnapshot?.sections || [];
                
                // logger.info(`[DEBUG] Loading ProcessFlow data from MongoDB: ${pfNodes.length} nodes, ${pfEdges.length} edges, ${pfSections.length} sections`);
                
                const pfNodesMap = doc.getMap<any>('pf_nodes');
                const pfEdgesMap = doc.getMap<any>('pf_edges');
                const pfSectionsMap = doc.getMap<any>('pf_sections');
                
                // logger.info(`[DEBUG] Current Yjs map sizes - pf_nodes: ${pfNodesMap.size}, pf_edges: ${pfEdgesMap.size}, pf_sections: ${pfSectionsMap.size}`);
                
                if (pfNodesMap.size === 0 && pfEdgesMap.size === 0 && pfSectionsMap.size === 0) {
                    // logger.info(`[DEBUG] Yjs maps are empty, seeding from MongoDB...`);
                    pfNodes.forEach((n: any) => {
                        if (n?.id) {
                            const yMap = new Y.Map();
                            Object.entries(n).forEach(([k, v]) => yMap.set(k, v));
                            pfNodesMap.set(n.id, yMap);
                        }
                    });
                    pfEdges.forEach((e: any) => {
                        if (e?.id) {
                            const yMap = new Y.Map();
                            Object.entries(e).forEach(([k, v]) => yMap.set(k, v));
                            pfEdgesMap.set(e.id, yMap);
                        }
                    });
                    pfSections.forEach((s: any) => {
                        if (s?.id) {
                            const yMap = new Y.Map();
                            Object.entries(s).forEach(([k, v]) => yMap.set(k, v));
                            pfSectionsMap.set(s.id, yMap);
                        }
                    });
                    // logger.info(`[DEBUG] Seeded ProcessFlow data into Yjs - pf_nodes: ${pfNodesMap.size}, pf_edges: ${pfEdgesMap.size}, pf_sections: ${pfSectionsMap.size}`);
                } else {
                    logger.info(`[DEBUG] Yjs maps already have data, skipping seed`);
                }
            }

            // 🚀 수정: 일반 객체를 Y.Map으로 변환하여 삽입
            screens.forEach((s: any) => {
                if (s?.id) {
                    const yMap = new Y.Map();
                    Object.entries(s).forEach(([k, v]) => yMap.set(k, v));
                    screensMap.set(s.id, yMap);
                }
            });
            flows.forEach((f: any) => {
                if (f?.id) {
                    const yMap = new Y.Map();
                    Object.entries(f).forEach(([k, v]) => yMap.set(k, v));
                    flowsMap.set(f.id, yMap);
                }
            });
            sections.forEach((sec: any) => {
                if (sec?.id) {
                    const yMap = new Y.Map();
                    Object.entries(sec).forEach(([k, v]) => yMap.set(k, v));
                    sectionsMap.set(sec.id, yMap);
                }
            });
        });

        logger.info(`✅ Yjs doc seeded from MongoDB: project ${projectId}`);
    } catch (err) {
        logger.error('Yjs seed from MongoDB failed: %o', err);
    }
}

/**
 * Y.Doc 현재 상태 → MongoDB screenSnapshot 저장
 */
export async function saveDocToMongo(projectId: string, doc: Y.Doc): Promise<void> {
    if (!Types.ObjectId.isValid(projectId)) return;

    const info = docs.get(projectId);
    const editors = info ? Array.from(info.editorsSinceLastSave) : [];

    try {
        const project = await Project.findById(projectId).select('projectType').lean();
        if (!project) return;

        const projectType: string = (project as any).projectType || 'ERD';

        // 🚀 수정: Y.Map 객체인 경우 .toJSON()을 호출하여 순수 JSON으로 변환 후 추출
        const extractJson = (mapData: IterableIterator<any>) =>
            Array.from(mapData).map(item => (item instanceof Y.Map ? item.toJSON() : item));

        const screensArr  = extractJson(doc.getMap<any>('screens').values());
        const flowsArr    = extractJson(doc.getMap<any>('flows').values());
        const sectionsArr = extractJson(doc.getMap<any>('sections').values());

        let didPersist = false;
        if (projectType === 'COMPONENT') {
            await Project.findByIdAndUpdate(projectId, {
                componentSnapshot: {
                    components: screensArr,
                    flows: flowsArr,
                    savedAt: new Date(),
                },
                updatedAt: new Date(),
            });
            didPersist = true;
        } else if (projectType === 'SCREEN_DESIGN') {
            await Project.findByIdAndUpdate(projectId, {
                screenSnapshot: {
                    screens: screensArr,
                    flows: flowsArr,
                    sections: sectionsArr,
                    savedAt: new Date(),
                },
                updatedAt: new Date(),
            });
            didPersist = true;
        } else if (projectType === 'PROCESS_FLOW') {
            const pfNodesArr    = extractJson(doc.getMap<any>('pf_nodes').values());
            const pfEdgesArr    = extractJson(doc.getMap<any>('pf_edges').values());
            const pfSectionsArr = extractJson(doc.getMap<any>('pf_sections').values());
            
            // logger.info(`[DEBUG] Saving ProcessFlow data: ${pfNodesArr.length} nodes, ${pfEdgesArr.length} edges, ${pfSectionsArr.length} sections`);
            
            await Project.findByIdAndUpdate(projectId, {
                processFlowSnapshot: {
                    nodes: pfNodesArr,
                    edges: pfEdgesArr,
                    sections: pfSectionsArr,
                    savedAt: new Date(),
                },
                updatedAt: new Date(),
            });
            didPersist = true;
            // logger.info(`[DEBUG] ProcessFlow data saved successfully for project ${projectId}`);
        }

        if (didPersist) {
            if (info) {
                info.editorsSinceLastSave.clear();
            }
            await touchProjectMemberLastEditedAtMany(projectId, editors);
        }
    } catch (err) {
        logger.error('Yjs saveDocToMongo failed: %o', err);
    }
}

// ─── WebSocket 연결 처리 ─────────────────────────────────────────────────────

async function handleConnection(ws: WebSocket, projectId: string, yjsUserId?: string): Promise<void> {
    const info = getOrCreateDoc(projectId);
    (ws as WebSocket & { yjsUserId?: string }).yjsUserId =
        yjsUserId && Types.ObjectId.isValid(yjsUserId) ? yjsUserId : undefined;
    info.conns.set(ws, new Set());

    // MongoDB에서 초기 데이터 로드 (첫 연결 시)
    if (info.conns.size === 1) {
        // 🚀 중요: 초기 sync를 DB I/O로 막지 않도록 비동기로 시드 처리
        // DB가 느리거나 멈춘 경우에도 클라이언트는 빈 doc으로 우선 sync 완료 후
        // 시드가 완료되면 update broadcast를 통해 데이터를 받게 됩니다.
        seedDocFromMongo(projectId, info.doc).catch(() => {});
    }

    ws.on('message', (rawData: Buffer) => {
        try {
            const data = new Uint8Array(rawData);
            const decoder = decoding.createDecoder(data);
            const msgType = decoding.readVarUint(decoder);

            switch (msgType) {
                case MESSAGE_SYNC: {
                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, MESSAGE_SYNC);
                    syncProtocol.readSyncMessage(decoder, encoder, info.doc, ws);
                    // syncStep1 응답이 있으면 전송
                    if (encoding.length(encoder) > 1) {
                        ws.send(encoding.toUint8Array(encoder));
                    }
                    break;
                }
                case MESSAGE_AWARENESS: {
                    awarenessProtocol.applyAwarenessUpdate(
                        info.awareness,
                        decoding.readVarUint8Array(decoder),
                        ws
                    );
                    break;
                }
            }
        } catch (_err) {
            logger.error('Yjs message handling error: %o', _err);
        }
    });

    ws.on('close', () => {
        awarenessProtocol.removeAwarenessStates(
            info.awareness,
            Array.from(info.conns.get(ws) || []),
            null
        );
        closeConn(projectId, ws);
    });

    ws.on('error', () => {
        closeConn(projectId, ws);
    });

    // 클라이언트에게 현재 문서 상태 + awareness 전송 (syncStep1)
    {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(encoder, info.doc);
        ws.send(encoding.toUint8Array(encoder));
    }

    // awareness 상태 전송
    const awarenessStates = info.awareness.getStates();
    if (awarenessStates.size > 0) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(
                info.awareness,
                Array.from(awarenessStates.keys())
            )
        );
        ws.send(encoding.toUint8Array(encoder));
    }
}

// ─── 서버 시작 ───────────────────────────────────────────────────────────────

export function startYjsServer(): void {
    const httpServer = createServer((_req, res) => {
        res.writeHead(200);
        res.end('Yjs WebSocket Server');
    });

    const wss = new WebSocketServer({ server: httpServer });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        /**
         * URL 형식: ws://localhost:4000/<projectId>?userId=<mongoObjectId>
         */
        const raw = (req.url || '/').replace(/^\//, '');
        const [pathPart, queryPart] = raw.split('?');
        const segments = pathPart.split('/').filter(Boolean);
        // localhost: /<projectId>  ·  프록시: /yjs/<projectId>
        const projectId = segments[segments.length - 1] || '';
        let yjsUserId: string | undefined;
        if (queryPart) {
            const uid = new URLSearchParams(queryPart).get('userId') || '';
            if (uid && Types.ObjectId.isValid(uid)) yjsUserId = uid;
        }

        if (!projectId) {
            ws.close();
            return;
        }

        handleConnection(ws, projectId, yjsUserId).catch((err) => {
            logger.error('Yjs handleConnection error: %o', err);
            ws.close();
        });
    });

    httpServer.listen(YJS_PORT, () => {
        logger.info(`✅ Yjs WebSocket Server running on ws://localhost:${YJS_PORT}`);
    });
}
