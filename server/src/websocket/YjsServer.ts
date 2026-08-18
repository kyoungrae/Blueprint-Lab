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
import { recordProjectAccessLog } from '../services/recordProjectAccessLog';
import {
    getWbsScheduleSnapshotHash,
    type WbsDetailScheduleRecord,
} from '../services/wbsScheduleImportService';

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
    /** MongoDB 시드 대기 중인 WebSocket 연결 수 (시드 실패/취소 정리 경쟁 방지) */
    pendingConnections: number;
    snapshotTimer: NodeJS.Timeout | null;
    /** 이 저장 주기 동안 문서를 수정한 멤버 userId (WebSocket에 yjsUserId 부착) */
    editorsSinceLastSave: Set<string>;
    /** 즉시 저장용 디바운스 타이머 */
    immediateSaveTimer: NodeJS.Timeout | null;
    /** MongoDB 스냅샷을 Y.Doc으로 이관하는 단일 초기화 작업 */
    seedPromise: Promise<void> | null;
    /**
     * 같은 문서의 MongoDB 저장을 순서대로 처리한다.
     * 네트워크 지연으로 이전 스냅샷 저장이 나중에 끝나 최신 변경을 되돌리는 것을 막는다.
     */
    saveQueue: Promise<void>;
}

/** projectId → DocInfo */
const docs = new Map<string, DocInfo>();

const IMMEDIATE_SAVE_DEBOUNCE_MS = 2000; // 2초 후 즉시 저장
/** 일정 import는 별도 원자 저장 경로를 사용하므로 일반 debounce 저장을 만들지 않는다. */
const WBS_SCHEDULE_IMPORT_ORIGIN = { kind: 'wbs-schedule-import' };
/** MongoDB 원본을 빈 Y.Doc에 읽어 넣는 초기화는 저장 변경이 아니다. */
const MONGO_SEED_ORIGIN = { kind: 'mongo-seed' };

function getOrCreateDoc(projectId: string): DocInfo {
    return map.setIfUndefined(docs, projectId, () => {
        const doc = new Y.Doc({ gc: true });
        const awareness = new awarenessProtocol.Awareness(doc);

        const info: DocInfo = {
            doc,
            awareness,
            conns: new Map(),
            pendingConnections: 0,
            snapshotTimer: null,
            editorsSinceLastSave: new Set(),
            immediateSaveTimer: null,
            seedPromise: null,
            saveQueue: Promise.resolve(),
        };

        doc.on('update', (_update: Uint8Array, origin: unknown) => {
            // 편집자 추적: WebSocket origin일 때만 (로컬 transact/시드는 origin 없을 수 있음)
            if (origin && typeof origin === 'object') {
                const ws = origin as WebSocket & { yjsUserId?: string };
                const uid = ws.yjsUserId;
                if (uid && Types.ObjectId.isValid(uid)) {
                    info.editorsSinceLastSave.add(uid);
                }
            }

            // 일정 import는 백업 이후 단일 MongoDB update를 직접 기다린다.
            // 여기서 별도 debounce 저장이 끼어들면 이전 스냅샷과 순서가 뒤바뀔 수 있다.
            if (origin === WBS_SCHEDULE_IMPORT_ORIGIN || origin === MONGO_SEED_ORIGIN) return;

            // 모든 문서 변경마다 디바운스 저장 (origin 조건 제거 — 화면 memos 등이 누락되던 원인)
            if (info.immediateSaveTimer) {
                clearTimeout(info.immediateSaveTimer);
            }
            info.immediateSaveTimer = setTimeout(() => {
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

/** 마지막 연결 종료 시 Mongo 저장이 끝난 뒤에만 doc을 제거 (새로고침 직후 시드가 옛 스냅샷을 읽는 레이스 방지) */
async function closeConnAndPersist(projectId: string, ws: WebSocket): Promise<void> {
    const info = docs.get(projectId);
    if (!info) return;

    const subscribedTopics = Array.from(info.conns.get(ws) || []);
    info.conns.delete(ws);

    awarenessProtocol.removeAwarenessStates(info.awareness, subscribedTopics, null);

    // 새 연결이 시드 완료를 기다리는 동안 마지막 기존 연결이 끊겨도
    // 문서를 먼저 제거하면 새 연결이 빈/파기된 문서를 받게 된다.
    if (info.conns.size !== 0 || info.pendingConnections !== 0) return;

    await persistAndUnloadIdleDoc(projectId, info);
}

/** 연결·시드 대기가 모두 끝난 문서는 최신 상태를 저장한 뒤에만 메모리에서 제거한다. */
async function persistAndUnloadIdleDoc(projectId: string, info: DocInfo): Promise<void> {
    if (docs.get(projectId) !== info || info.conns.size !== 0 || info.pendingConnections !== 0) return;

    awarenessProtocol.removeAwarenessStates(info.awareness, Array.from(info.awareness.getStates().keys()), null);

    if (info.immediateSaveTimer) {
        clearTimeout(info.immediateSaveTimer);
        info.immediateSaveTimer = null;
    }

    try {
        await saveDocToMongo(projectId, info.doc);
    } catch (_e) {
        /* logged inside saveDocToMongo */
    }

    const latest = docs.get(projectId);
    if (latest === info && latest.conns.size === 0 && latest.pendingConnections === 0) {
        if (latest.snapshotTimer) {
            clearInterval(latest.snapshotTimer);
            latest.snapshotTimer = null;
        }
        latest.awareness.destroy();
        latest.doc.destroy();
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
    if (!Types.ObjectId.isValid(projectId)) {
        throw new Error(`Invalid Yjs project id: ${projectId}`);
    }

    try {
        const project = await Project.findById(projectId)
            .select('projectType screenSnapshot componentSnapshot processFlowSnapshot wbsSnapshot')
            .lean();
        if (!project) {
            throw new Error(`Yjs project not found: ${projectId}`);
        }

        const p = project as any;
        const projectType: string = p.projectType || 'ERD';

        // WBS는 행·필드 단위 Y.Map으로 관리한다. initialized 플래그는 빈 WBS도
        // "MongoDB 시드 완료" 상태임을 클라이언트에 명확히 알린다.
        if (projectType === 'WBS') {
            doc.transact(() => {
                const meta = doc.getMap<any>('wbs_meta');
                if (meta.get('initialized') === true) return;

                const menusMap = doc.getMap<any>('wbs_menus');
                const rowsMap = doc.getMap<any>('wbs_rows');
                const detailSchedulesMap = doc.getMap<any>('wbs_detail_schedules');
                const projectScheduleMap = doc.getMap<any>('wbs_project_schedule');
                const snapshot = p.wbsSnapshot || {};

                const addRecords = (target: Y.Map<any>, records: any[]) => {
                    records.forEach((record: any) => {
                        if (!record?.id || target.has(record.id)) return;
                        const yMap = new Y.Map<any>();
                        Object.entries(record).forEach(([key, value]) => yMap.set(key, value));
                        target.set(record.id, yMap);
                    });
                };

                addRecords(menusMap, Array.isArray(snapshot.menus) ? snapshot.menus : []);
                addRecords(rowsMap, Array.isArray(snapshot.rows) ? snapshot.rows : []);
                addRecords(detailSchedulesMap, Array.isArray(snapshot.detailSchedules) ? snapshot.detailSchedules : []);

                const projectSchedule = snapshot.projectSchedule;
                if (projectSchedule && typeof projectSchedule === 'object') {
                    Object.entries(projectSchedule).forEach(([key, value]) => projectScheduleMap.set(key, value));
                    meta.set('hasProjectSchedule', true);
                } else {
                    meta.set('hasProjectSchedule', false);
                }
                const links = Array.isArray(snapshot.menuScheduleLinks) ? snapshot.menuScheduleLinks : [];
                meta.set('menuScheduleLinks', links);
                meta.set('initialized', true);
            }, MONGO_SEED_ORIGIN);
            logger.info(`✅ Yjs WBS doc seeded from MongoDB: project ${projectId}`);
            return;
        }

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
        }, MONGO_SEED_ORIGIN);

        logger.info(`✅ Yjs doc seeded from MongoDB: project ${projectId}`);
    } catch (err) {
        logger.error('Yjs seed from MongoDB failed: %o', err);
        throw err;
    }
}

/** 같은 프로젝트의 동시 연결·REST 변경에서도 MongoDB 시드는 한 번만 실행한다. */
async function ensureDocSeeded(projectId: string): Promise<DocInfo> {
    const info = getOrCreateDoc(projectId);
    if (!info.seedPromise) {
        info.seedPromise = seedDocFromMongo(projectId, info.doc).catch((error) => {
            info.seedPromise = null;
            throw error;
        });
    }
    await info.seedPromise;
    return info;
}

/**
 * 시드 실패 후 비어 있는 문서가 이후 접속에서 원본처럼 사용되지 않도록 즉시 폐기한다.
 * 연결된 클라이언트가 있는 문서는 여기서 제거하지 않는다.
 */
function discardUnseededDoc(projectId: string): void {
    const info = docs.get(projectId);
    if (!info || info.conns.size > 0 || info.pendingConnections > 0) return;
    if (info.snapshotTimer) clearInterval(info.snapshotTimer);
    if (info.immediateSaveTimer) clearTimeout(info.immediateSaveTimer);
    info.awareness.destroy();
    info.doc.destroy();
    docs.delete(projectId);
}

/**
 * Y.Doc 현재 상태 → MongoDB screenSnapshot 저장
 */
async function persistDocToMongo(projectId: string, doc: Y.Doc): Promise<void> {
    if (!Types.ObjectId.isValid(projectId)) return;

    const info = docs.get(projectId);
    const editors = info ? Array.from(info.editorsSinceLastSave) : [];

    try {
        const project = await Project.findById(projectId).select('projectType wbsSnapshot.version').lean();
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
        } else if (projectType === 'WBS') {
            const wbsMeta = doc.getMap<any>('wbs_meta');
            // 서버 시드가 아직 끝나지 않은 빈 문서를 저장해 기존 WBS를 지우지 않도록 보호한다.
            if (wbsMeta.get('initialized') !== true) return;

            const menusArr = extractJson(doc.getMap<any>('wbs_menus').values());
            const rowsArr = extractJson(doc.getMap<any>('wbs_rows').values());
            const detailSchedulesArr = extractJson(doc.getMap<any>('wbs_detail_schedules').values());
            const scheduleMap = doc.getMap<any>('wbs_project_schedule');
            const projectSchedule = wbsMeta.get('hasProjectSchedule') === true ? scheduleMap.toJSON() : null;
            const menuScheduleLinks = Array.isArray(wbsMeta.get('menuScheduleLinks'))
                ? wbsMeta.get('menuScheduleLinks')
                : [];
            const previousVersion = Number((project as any).wbsSnapshot?.version || 0);

            await Project.findByIdAndUpdate(projectId, {
                wbsSnapshot: {
                    version: previousVersion + 1,
                    menus: menusArr,
                    rows: rowsArr,
                    projectSchedule,
                    detailSchedules: detailSchedulesArr,
                    menuScheduleLinks,
                    savedAt: new Date(),
                },
                updatedAt: new Date(),
            });
            didPersist = true;
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

/**
 * 문서별 MongoDB 저장 직렬화 진입점.
 *
 * `doc`은 큐가 실행되는 시점에 읽으므로, 짧은 시간에 여러 변경이 들어오면
 * 마지막 저장도 항상 가장 최신 Yjs 상태를 기록한다.
 */
export function saveDocToMongo(projectId: string, doc: Y.Doc): Promise<void> {
    const info = docs.get(projectId);
    if (!info || info.doc !== doc) {
        return persistDocToMongo(projectId, doc);
    }

    const queuedSave = info.saveQueue
        .catch(() => {})
        .then(() => persistDocToMongo(projectId, doc));

    // 이후 저장은 실패한 이전 저장에도 계속 진행되어야 한다.
    info.saveQueue = queuedSave.catch(() => {});
    return queuedSave;
}

/**
 * 개인일정의 WBS 진행율 역동기화처럼 브라우저에 WBS 문서가 열려 있지 않은 경우에도
 * 단일 행 필드만 안전하게 Yjs 문서에 반영한다.
 */
export async function patchWbsRowInYjs(
    projectId: string,
    rowId: string,
    patch: Record<string, unknown>,
): Promise<boolean> {
    const info = await ensureDocSeeded(projectId);
    const meta = info.doc.getMap<any>('wbs_meta');
    if (meta.get('initialized') !== true) return false;

    const row = info.doc.getMap<Y.Map<any>>('wbs_rows').get(rowId);
    if (!row) return false;

    info.doc.transact(() => {
        Object.entries(patch).forEach(([key, value]) => {
            if (value === undefined) row.delete(key);
            else row.set(key, value);
        });
    });

    // REST 역동기화만으로 임시 생성된 문서는 즉시 저장·정리한다.
    if (info.conns.size === 0) {
        if (info.immediateSaveTimer) {
            clearTimeout(info.immediateSaveTimer);
            info.immediateSaveTimer = null;
        }
        await saveDocToMongo(projectId, info.doc);
        const latest = docs.get(projectId);
        if (latest === info && latest.conns.size === 0) {
            if (latest.snapshotTimer) clearInterval(latest.snapshotTimer);
            docs.delete(projectId);
        }
    }
    return true;
}

function wbsDetailSchedulesFromDoc(doc: Y.Doc): WbsDetailScheduleRecord[] {
    return Array.from(doc.getMap<any>('wbs_detail_schedules').values())
        .map((item) => item instanceof Y.Map ? item.toJSON() : item)
        .filter((item): item is WbsDetailScheduleRecord => Boolean(item?.id));
}

function createWbsScheduleRecord(record: WbsDetailScheduleRecord): Y.Map<any> {
    const map = new Y.Map<any>();
    Object.entries(record).forEach(([key, value]) => {
        if (value !== undefined) map.set(key, value);
    });
    return map;
}

async function persistImportedWbsSchedules(
    projectId: string,
    detailSchedules: WbsDetailScheduleRecord[],
): Promise<void> {
    const now = new Date();
    const updated = await Project.findOneAndUpdate(
        { _id: projectId, projectType: 'WBS' },
        {
            $set: {
                'wbsSnapshot.detailSchedules': detailSchedules,
                'wbsSnapshot.savedAt': now,
                updatedAt: now,
            },
            $inc: { 'wbsSnapshot.version': 1 },
        },
        { new: false },
    ).lean();
    if (!updated) throw new Error('일정 스냅샷을 저장할 WBS 프로젝트를 찾을 수 없습니다.');
}

/** 서버 import 미리보기는 Yjs의 최신 일정 원본만 읽는다. DB write는 수행하지 않는다. */
export async function readWbsScheduleSnapshotInYjs(projectId: string): Promise<WbsDetailScheduleRecord[]> {
    const info = await ensureDocSeeded(projectId);
    const meta = info.doc.getMap<any>('wbs_meta');
    if (meta.get('initialized') !== true) throw new Error('WBS 원본 시드가 완료되지 않았습니다.');
    return wbsDetailSchedulesFromDoc(info.doc);
}

export interface WbsScheduleImportMutation {
    expectedBaseSnapshotHash: string;
    added: WbsDetailScheduleRecord[];
    updates: Array<{ id: string; patch: Partial<Omit<WbsDetailScheduleRecord, 'id'>> }>;
}

/**
 * 일정 import의 최종 반영 경로.
 *
 * - 이미 대기 중인 일반 Yjs 저장을 먼저 끝내고 최신 hash를 다시 확인한다.
 * - 일정 Y.Map의 각 레코드만 upsert한다. menus/rows/프로젝트 일정은 전혀 건드리지 않는다.
 * - 모든 일정 변경은 하나의 Yjs transaction으로 broadcast되고, MongoDB도 detailSchedules만
 *   단일 update로 저장한다. MongoDB 저장 실패 시 방금 변경한 필드만 원상 복구한다.
 */
export async function applyWbsScheduleImportInYjs(
    projectId: string,
    mutation: WbsScheduleImportMutation,
): Promise<WbsDetailScheduleRecord[]> {
    const info = await ensureDocSeeded(projectId);
    const meta = info.doc.getMap<any>('wbs_meta');
    if (meta.get('initialized') !== true) throw new Error('WBS 원본 시드가 완료되지 않았습니다.');

    // 기존 일반 편집의 저장이 import보다 뒤늦게 오래된 스냅샷을 덮어쓰지 않게 직렬화한다.
    if (info.immediateSaveTimer) {
        clearTimeout(info.immediateSaveTimer);
        info.immediateSaveTimer = null;
        await saveDocToMongo(projectId, info.doc);
    }
    await info.saveQueue;

    const before = wbsDetailSchedulesFromDoc(info.doc);
    if (getWbsScheduleSnapshotHash(before) !== mutation.expectedBaseSnapshotHash) {
        throw new Error('미리보기 이후 일정 데이터가 변경되었습니다. 최신 상태로 다시 미리보기를 실행하세요.');
    }

    const records = info.doc.getMap<Y.Map<any>>('wbs_detail_schedules');
    const existingIds = new Set(before.map((item) => item.id));
    const addedIds = new Set(mutation.added.map((item) => item.id));
    if (addedIds.size !== mutation.added.length || [...addedIds].some((id) => existingIds.has(id))) {
        throw new Error('신규 일정 식별자가 현재 일정과 충돌했습니다. 최신 상태로 다시 미리보기를 실행하세요.');
    }
    for (const update of mutation.updates) {
        if (!records.has(update.id)) throw new Error('수정할 기존 일정이 없어졌습니다. 최신 상태로 다시 미리보기를 실행하세요.');
    }

    const beforePatchValues = new Map<string, Record<string, unknown>>();
    for (const update of mutation.updates) {
        const record = records.get(update.id)!;
        const previous: Record<string, unknown> = {};
        Object.keys(update.patch).forEach((key) => { previous[key] = record.get(key); });
        beforePatchValues.set(update.id, previous);
    }

    info.doc.transact(() => {
        for (const update of mutation.updates) {
            const record = records.get(update.id)!;
            Object.entries(update.patch).forEach(([key, value]) => {
                if (value === undefined) record.delete(key);
                else record.set(key, value);
            });
        }
        mutation.added.forEach((record) => records.set(record.id, createWbsScheduleRecord(record)));
    }, WBS_SCHEDULE_IMPORT_ORIGIN);

    const after = wbsDetailSchedulesFromDoc(info.doc);
    try {
        // saveQueue 뒤에 추가해 일반 Yjs 저장과 MongoDB 쓰기 순서를 보장한다.
        const persisted = info.saveQueue
            .catch(() => {})
            .then(() => persistImportedWbsSchedules(projectId, after));
        info.saveQueue = persisted.catch(() => {});
        await persisted;
    } catch (error) {
        // 저장 실패 시 import가 만든 레코드/필드만 되돌린다. 전체 Y.Map clear는 사용하지 않는다.
        info.doc.transact(() => {
            mutation.added.forEach((record) => records.delete(record.id));
            mutation.updates.forEach((update) => {
                const record = records.get(update.id);
                const previous = beforePatchValues.get(update.id);
                if (!record || !previous) return;
                Object.entries(previous).forEach(([key, value]) => {
                    if (value === undefined) record.delete(key);
                    else record.set(key, value);
                });
            });
        });
        throw error;
    }

    return after;
}

// ─── WebSocket 연결 처리 ─────────────────────────────────────────────────────

async function handleConnection(ws: WebSocket, projectId: string, yjsUserId?: string): Promise<void> {
    const pendingInfo = getOrCreateDoc(projectId);
    pendingInfo.pendingConnections += 1;

    /**
     * `WebsocketProvider`는 open 직후 syncStep1을 보낸다. MongoDB 시드를 await한 뒤에
     * message listener를 등록하면 이 첫 메시지가 유실되어 WebSocket은 connected인데
     * provider의 sync 이벤트가 영원히 오지 않을 수 있다.
     *
     * 시드 전에는 편집 update를 받지 않고, 최초 syncStep1만 보관한다. 시드가 끝난 뒤
     * 정상 핸들러에서 이를 처리해 syncStep2를 응답한다.
     */
    let queuedSyncStep1: Uint8Array | null = null;
    const captureInitialSyncStep1 = (rawData: Buffer) => {
        if (queuedSyncStep1) return;
        try {
            const data = new Uint8Array(rawData);
            const decoder = decoding.createDecoder(data);
            if (decoding.readVarUint(decoder) !== MESSAGE_SYNC) return;
            if (decoding.readVarUint(decoder) !== syncProtocol.messageYjsSyncStep1) return;
            queuedSyncStep1 = data;
        } catch {
            // 시드 전의 malformed/편집 메시지는 버린다. 빈 문서에 반영하지 않는다.
        }
    };
    ws.on('message', captureInitialSyncStep1);

    let info: DocInfo;
    try {
        /**
         * 빈 Y.Doc을 먼저 sync하면 클라이언트가 이를 "준비 완료"로 오인해
         * 오래된 REST 캐시나 신규 편집으로 MongoDB 원본을 덮어쓸 수 있다.
         * 따라서 MongoDB 시드 완료 전에는 연결을 문서에 참여시키거나 sync를 시작하지 않는다.
         */
        info = await ensureDocSeeded(projectId);
    } catch (error) {
        ws.off('message', captureInitialSyncStep1);
        pendingInfo.pendingConnections = Math.max(0, pendingInfo.pendingConnections - 1);
        discardUnseededDoc(projectId);
        throw error;
    }

    // 시드 대기 중 브라우저가 떠난 경우 빈/미사용 문서를 연결하지 않는다.
    if (ws.readyState !== WebSocket.OPEN) {
        ws.off('message', captureInitialSyncStep1);
        info.pendingConnections = Math.max(0, info.pendingConnections - 1);
        if (info.conns.size === 0) await persistAndUnloadIdleDoc(projectId, info);
        return;
    }

    info.pendingConnections = Math.max(0, info.pendingConnections - 1);
    (ws as WebSocket & { yjsUserId?: string }).yjsUserId =
        yjsUserId && Types.ObjectId.isValid(yjsUserId) ? yjsUserId : undefined;
    info.conns.set(ws, new Set());

    if (yjsUserId && Types.ObjectId.isValid(projectId)) {
        void recordProjectAccessLog(yjsUserId, projectId, 'YJS_CONNECT');
    }

    const handleMessage = (rawData: Buffer | Uint8Array) => {
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
    };
    ws.off('message', captureInitialSyncStep1);
    ws.on('message', handleMessage);

    ws.on('close', () => {
        awarenessProtocol.removeAwarenessStates(
            info.awareness,
            Array.from(info.conns.get(ws) || []),
            null
        );
        void closeConnAndPersist(projectId, ws);
    });

    ws.on('error', () => {
        awarenessProtocol.removeAwarenessStates(
            info.awareness,
            Array.from(info.conns.get(ws) || []),
            null
        );
        void closeConnAndPersist(projectId, ws);
    });

    // 보관한 client syncStep1에는 syncStep2를 응답해야 provider가 isSynced=true가 된다.
    // (서버 syncStep1만 보내면 client는 step2를 돌려줄 뿐 자체 sync 완료로 판단하지 않는다.)
    if (queuedSyncStep1) {
        handleMessage(queuedSyncStep1);
    } else {
        // 비표준 클라이언트/재접속 예외에서는 서버 측 step1로 동기화를 시작한다.
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
            // 시드 실패를 정상 빈 문서처럼 보이지 않게 하여 클라이언트 편집을 차단한다.
            ws.close(1011, 'Yjs source snapshot unavailable');
        });
    });

    httpServer.listen(YJS_PORT, () => {
        logger.info(`✅ Yjs WebSocket Server running on ws://localhost:${YJS_PORT}`);
    });
}
