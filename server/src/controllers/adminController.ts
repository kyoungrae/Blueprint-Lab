import { Response } from 'express';
import bcrypt from 'bcrypt';
import { AuthRequest } from '../middleware/authMiddleware';
import { User } from '../models/User';
import { Project } from '../models/Project';
import { Invitation } from '../models/Invitation';
import { History, ProjectAccessLog, ACCESS_LOG_RETENTION_MS } from '../models';
import { Types } from 'mongoose';
import { projectStateManager, presenceManager } from '../services/PresenceManager';
import { lockManager } from '../services/LockManager';
import type { IEntity, IRelationship, IScreen, IScreenFlow, IERDSnapshot, IScreenSnapshot } from '../models/Project';
import type { OperationType } from '../models/History';

export const getAdminUsers = async (req: AuthRequest, res: Response) => {
    try {
        const users = await User.find()
            .select('name email picture tier createdAt lastLoginAt')
            .sort({ createdAt: -1 })
            .lean();

        const data = users.map((u: any) => ({
            id: u._id?.toString?.() || u._id,
            name: u.name,
            email: u.email,
            picture: u.picture,
            tier: u.tier || 'FREE',
            createdAt: u.createdAt,
            lastLoginAt: u.lastLoginAt,
        }));

        res.json(data);
    } catch (error) {
        // console.error('Get admin users error:', error);
        res.status(500).json({ message: '회원 목록을 가져오는 중 오류가 발생했습니다.' });
    }
};

export const updateUserTier = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { tier } = req.body;

        if (!id) {
            return res.status(400).json({ message: '회원 ID가 필요합니다.' });
        }
        if (!['FREE', 'PRO', 'MASTER'].includes(tier)) {
            return res.status(400).json({ message: '유효한 티어를 선택해 주세요. (FREE, PRO, MASTER)' });
        }

        const user = await User.findByIdAndUpdate(id, { tier }, { new: true });
        if (!user) {
            return res.status(404).json({ message: '회원을 찾을 수 없습니다.' });
        }

        res.json({ id: user._id, tier: user.tier });
    } catch (error) {
        // console.error('Update user tier error:', error);
        res.status(500).json({ message: '티어 변경 중 오류가 발생했습니다.' });
    }
};

export const updateUserName = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!id) {
            return res.status(400).json({ message: '회원 ID가 필요합니다.' });
        }
        if (!name || !name.trim()) {
            return res.status(400).json({ message: '사용자 이름을 입력해주세요.' });
        }
        if (name.trim().length > 50) {
            return res.status(400).json({ message: '사용자 이름은 50자 이하로 입력해주세요.' });
        }

        const user = await User.findByIdAndUpdate(id, { name: name.trim() }, { new: true });
        if (!user) {
            return res.status(404).json({ message: '회원을 찾을 수 없습니다.' });
        }

        res.json({ id: user._id, name: user.name });
    } catch (error) {
        // console.error('Update user name error:', error);
        res.status(500).json({ message: '이름 변경 중 오류가 발생했습니다.' });
    }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { adminPassword } = req.body;

        if (!id) {
            return res.status(400).json({ message: '회원 ID가 필요합니다.' });
        }
        if (!adminPassword) {
            return res.status(400).json({ message: '관리자 비밀번호를 입력해 주세요.' });
        }

        const adminId = req.user?.id;
        if (!adminId) {
            return res.status(401).json({ message: '인증이 필요합니다.' });
        }

        const admin = await User.findById(adminId);
        if (!admin) {
            return res.status(401).json({ message: '관리자 정보를 찾을 수 없습니다.' });
        }
        if (!admin.password) {
            return res.status(400).json({ message: 'Google 로그인 사용자는 비밀번호 확인을 할 수 없습니다. 이메일/비밀번호로 가입한 계정으로 관리자 권한을 설정해 주세요.' });
        }

        const isMatch = await bcrypt.compare(adminPassword, admin.password);
        if (!isMatch) {
            return res.status(401).json({ message: '관리자 비밀번호가 일치하지 않습니다.' });
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({ message: '삭제할 회원을 찾을 수 없습니다.' });
        }

        if (targetUser._id.toString() === adminId) {
            return res.status(400).json({ message: '자기 자신은 삭제할 수 없습니다.' });
        }

        await Project.updateMany(
            { 'members.userId': new Types.ObjectId(id) },
            { $pull: { members: { userId: new Types.ObjectId(id) } } }
        );

        await Invitation.deleteMany({ email: targetUser.email });

        await User.findByIdAndDelete(id);

        res.json({ message: '회원이 삭제되었습니다.' });
    } catch (error) {
        // console.error('Delete user error:', error);
        res.status(500).json({ message: '회원 삭제 중 오류가 발생했습니다.' });
    }
};

/** `project_access_logs` — 5일 TTL(모델 인덱스) + 관리자 조회 시 보관 기간 초과분 즉시 삭제 */
export const getAdminAccessLogs = async (req: AuthRequest, res: Response) => {
    try {
        const allowedSizes = new Set([10, 50, 100]);
        let pageSize = parseInt(String(req.query.pageSize || '50'), 10) || 50;
        if (!allowedSizes.has(pageSize)) pageSize = 50;
        let page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);

        const cutoff = new Date(Date.now() - ACCESS_LOG_RETENTION_MS);
        await ProjectAccessLog.deleteMany({ eventAt: { $lt: cutoff } });

        const total = await ProjectAccessLog.countDocuments({});
        const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
        page = Math.min(page, totalPages);
        const skip = (page - 1) * pageSize;

        const logs = await ProjectAccessLog.find()
            .sort({ eventAt: -1 })
            .skip(skip)
            .limit(pageSize)
            .populate('userId', 'name email')
            .populate('projectId', 'name')
            .lean();

        const items = logs.map((doc: any) => {
            const u = doc.userId;
            const p = doc.projectId;
            const uid = typeof u === 'object' && u?._id ? u._id.toString() : String(doc.userId ?? '');
            const pid = typeof p === 'object' && p?._id ? p._id.toString() : String(doc.projectId ?? '');
            return {
                id: doc._id?.toString?.() ?? '',
                userId: uid,
                userName: typeof u === 'object' && u?.name ? u.name : '—',
                userEmail: typeof u === 'object' && u?.email ? u.email : '—',
                projectId: pid,
                projectName: typeof p === 'object' && p?.name ? p.name : '—',
                accessedAt: doc.eventAt ? new Date(doc.eventAt).toISOString() : null,
                kind: doc.kind as string,
            };
        });

        res.json({
            items,
            total,
            page,
            pageSize,
            totalPages,
        });
    } catch (error) {
        // console.error('Get admin access logs error:', error);
        res.status(500).json({ message: '접속 로그를 가져오는 중 오류가 발생했습니다.' });
    }
};

export const getUserProjects = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ message: '회원 ID가 필요합니다.' });
        }

        const projects = await Project.find({
            'members.userId': new Types.ObjectId(id),
        })
            .populate('members.userId', 'name email picture')
            .sort({ updatedAt: -1 })
            .lean();

        const uid = id.toString();
        const data = projects.map((p: any) => {
            const member = (p.members || []).find((m: any) => m.userId?.toString?.() === uid);
            return {
                id: p._id?.toString?.() || p._id,
                name: p.name,
                projectType: p.projectType || 'ERD',
                dbType: p.dbType,
                description: p.description,
                updatedAt: p.updatedAt,
                /** 선택한 회원이 이 프로젝트에서 마지막으로 저장한 시각 */
                memberLastEditedAt: member?.lastEditedAt ?? null,
                memberCount: p.members?.length || 0,
            };
        });

        res.json(data);
    } catch (error) {
        // console.error('Get user projects error:', error);
        res.status(500).json({ message: '프로젝트 목록을 가져오는 중 오류가 발생했습니다.' });
    }
};

/** Admin: list projects (for rollback tab project selector) */
export const getAdminProjects = async (req: AuthRequest, res: Response) => {
    try {
        const q = (req.query.q as string) || '';
        const filter: any = {};
        if (q.trim()) {
            filter.name = { $regex: q.trim(), $options: 'i' };
        }
        const projects = await Project.find(filter)
            .select('name projectType dbType updatedAt')
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean();

        const data = projects.map((p: any) => ({
            id: p._id?.toString?.() || p._id,
            name: p.name,
            projectType: p.projectType || 'ERD',
            dbType: p.dbType,
            updatedAt: p.updatedAt,
        }));

        res.json(data);
    } catch (error) {
        // console.error('Get admin projects error:', error);
        res.status(500).json({ message: '프로젝트 목록을 가져오는 중 오류가 발생했습니다.' });
    }
};

/** Admin: get recent project history (e.g. last 24h) */
export const getProjectHistory = async (req: AuthRequest, res: Response) => {
    try {
        const { projectId } = req.params;
        const hours = 24;
        const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '200'), 10) || 200));

        if (!projectId || !Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ message: '유효한 프로젝트 ID가 필요합니다.' });
        }

        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        const historyTypes = [
            'ENTITY_CREATE', 'ENTITY_UPDATE', 'ENTITY_MOVE', 'ENTITY_DELETE',
            'ATTRIBUTE_ADD', 'ATTRIBUTE_UPDATE', 'ATTRIBUTE_FIELD_UPDATE', 'ATTRIBUTE_DELETE',
            'RELATIONSHIP_CREATE', 'RELATIONSHIP_UPDATE', 'RELATIONSHIP_DELETE',
            'SCREEN_CREATE', 'SCREEN_UPDATE', 'SCREEN_MOVE', 'SCREEN_DELETE',
            'SCREEN_DRAW_ELEMENTS_UPDATE', 'SCREEN_DRAW_DELETE',
            'FLOW_CREATE', 'FLOW_UPDATE', 'FLOW_DELETE',
            'SCREEN_FLOW_CREATE', 'SCREEN_FLOW_UPDATE', 'SCREEN_FLOW_DELETE',
            'ERD_IMPORT', 'SCREEN_IMPORT',
        ];
        const list = await History.find({
            projectId: new Types.ObjectId(projectId),
            timestamp: { $gte: since },
            operationType: { $in: historyTypes },
        })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        const project = await Project.findById(projectId)
            .select('screenSnapshot.screens.id screenSnapshot.screens.name screenSnapshot.screens.screenId')
            .lean();
        const screenMetaMap = new Map<string, { name?: string; screenId?: string }>();
        const screens = (project as any)?.screenSnapshot?.screens ?? [];
        for (const s of screens) {
            if (s?.id) {
                screenMetaMap.set(String(s.id), { name: s.name, screenId: s.screenId });
            }
        }

        const data = list.map((h: any) => ({
            ...(function () {
                const payload = h.operation?.payload ?? {};
                const prev = h.operation?.previousState ?? {};
                const targetId = String(h.targetId ?? '');
                const snapMeta = screenMetaMap.get(targetId);
                const fromPayloadOrPrevName = payload?.name || prev?.name;
                const fromPayloadOrPrevScreenId = payload?.screenId || prev?.screenId;
                const isScreenContext =
                    h.targetType === 'SCREEN' ||
                    String(h.operationType || '').startsWith('SCREEN_');
                return {
                    screenName: isScreenContext ? (fromPayloadOrPrevName || snapMeta?.name || null) : null,
                    screenCode: isScreenContext ? (fromPayloadOrPrevScreenId || snapMeta?.screenId || null) : null,
                };
            })(),
            id: h._id.toString(),
            projectId: h.projectId?.toString(),
            userId: h.userId?.toString(),
            userName: h.userName,
            userPicture: h.userPicture,
            operationType: h.operationType,
            targetType: h.targetType,
            targetId: h.targetId,
            targetName: h.targetName,
            details: h.details,
            operationPayload: h.operation?.payload ?? null,
            operationPreviousState: h.operation?.previousState ?? null,
            timestamp: h.timestamp?.toISOString?.(),
        }));

        res.json(data);
    } catch (error) {
        // console.error('Get project history error:', error);
        res.status(500).json({ message: '히스토리를 가져오는 중 오류가 발생했습니다.' });
    }
};

/** Apply inverse of one history operation to snapshot (ERD or screen). Mutates snap. */
function applyInverseToSnapshot(
    operationType: OperationType,
    targetId: string,
    previousState: Record<string, unknown> | undefined,
    erdSnap: IERDSnapshot | null,
    screenSnap: IScreenSnapshot | null
): void {
    const createTypes: OperationType[] = [
        'ENTITY_CREATE', 'RELATIONSHIP_CREATE', 'SCREEN_CREATE', 'FLOW_CREATE', 'SCREEN_FLOW_CREATE',
    ];
    const updateMoveTypes: OperationType[] = [
        'ENTITY_UPDATE', 'ENTITY_MOVE', 'ATTRIBUTE_ADD', 'ATTRIBUTE_UPDATE', 'ATTRIBUTE_DELETE',
        'RELATIONSHIP_UPDATE', 'SCREEN_UPDATE', 'SCREEN_MOVE', 'FLOW_UPDATE', 'SCREEN_FLOW_UPDATE',
    ];
    const deleteTypes: OperationType[] = [
        'ENTITY_DELETE', 'RELATIONSHIP_DELETE', 'SCREEN_DELETE', 'FLOW_DELETE', 'SCREEN_FLOW_DELETE',
    ];
    const drawDeleteType: OperationType = 'SCREEN_DRAW_DELETE';

    if (createTypes.includes(operationType)) {
        if (operationType === 'ENTITY_CREATE' && erdSnap) {
            erdSnap.entities = (erdSnap.entities || []).filter((e: IEntity) => e.id !== targetId);
            erdSnap.relationships = (erdSnap.relationships || []).filter(
                (r: IRelationship) => r.source !== targetId && r.target !== targetId
            );
        } else if (operationType === 'RELATIONSHIP_CREATE' && erdSnap) {
            erdSnap.relationships = (erdSnap.relationships || []).filter((r: IRelationship) => r.id !== targetId);
        } else if ((operationType === 'SCREEN_CREATE' || operationType === 'SCREEN_FLOW_CREATE') && screenSnap) {
            if (operationType === 'SCREEN_CREATE') {
                screenSnap.screens = (screenSnap.screens || []).filter((s: IScreen) => s.id !== targetId);
                screenSnap.flows = (screenSnap.flows || []).filter(
                    (f: IScreenFlow) => f.source !== targetId && f.target !== targetId
                );
            } else {
                screenSnap.flows = (screenSnap.flows || []).filter((f: IScreenFlow) => f.id !== targetId);
            }
        } else if ((operationType === 'FLOW_CREATE') && screenSnap) {
            screenSnap.flows = (screenSnap.flows || []).filter((f: IScreenFlow) => f.id !== targetId);
        }
    } else if (updateMoveTypes.includes(operationType) && previousState) {
        if (operationType.startsWith('ENTITY_') || operationType.startsWith('ATTRIBUTE_')) {
            if (erdSnap?.entities) {
                const idx = erdSnap.entities.findIndex((e: IEntity) => e.id === targetId);
                if (idx >= 0) erdSnap.entities[idx] = { ...erdSnap.entities[idx], ...previousState } as IEntity;
            }
        } else if (operationType.startsWith('RELATIONSHIP_')) {
            if (erdSnap?.relationships) {
                const idx = erdSnap.relationships.findIndex((r: IRelationship) => r.id === targetId);
                if (idx >= 0) erdSnap.relationships[idx] = { ...erdSnap.relationships[idx], ...previousState } as IRelationship;
            }
        } else if (operationType.startsWith('SCREEN_') && !operationType.includes('FLOW')) {
            if (screenSnap?.screens) {
                const idx = screenSnap.screens.findIndex((s: IScreen) => s.id === targetId);
                if (idx >= 0) screenSnap.screens[idx] = { ...screenSnap.screens[idx], ...previousState } as IScreen;
            }
        } else if (operationType.startsWith('FLOW_') || operationType.startsWith('SCREEN_FLOW_')) {
            if (screenSnap?.flows) {
                const idx = screenSnap.flows.findIndex((f: IScreenFlow) => f.id === targetId);
                if (idx >= 0) screenSnap.flows[idx] = { ...screenSnap.flows[idx], ...previousState } as IScreenFlow;
            }
        }
    } else if (deleteTypes.includes(operationType) && previousState) {
        if (operationType === 'ENTITY_DELETE' && erdSnap) {
            const entity = previousState as unknown as IEntity;
            if (entity.id) erdSnap.entities = [...(erdSnap.entities || []), entity];
        } else if (operationType === 'RELATIONSHIP_DELETE' && erdSnap) {
            const rel = previousState as unknown as IRelationship;
            if (rel.id) erdSnap.relationships = [...(erdSnap.relationships || []), rel];
        } else if (operationType === 'SCREEN_DELETE' && screenSnap) {
            const screen = previousState as unknown as IScreen;
            if (screen.id) screenSnap.screens = [...(screenSnap.screens || []), screen];
        } else if ((operationType === 'FLOW_DELETE' || operationType === 'SCREEN_FLOW_DELETE') && screenSnap) {
            const flow = previousState as unknown as IScreenFlow;
            if (flow.id) screenSnap.flows = [...(screenSnap.flows || []), flow];
        }
    } else if (operationType === drawDeleteType && screenSnap && previousState) {
        const prevDraw = previousState.drawElements as IScreen['drawElements'];
        if (Array.isArray(prevDraw)) {
            const idx = (screenSnap.screens || []).findIndex((s: IScreen) => s.id === targetId);
            if (idx >= 0) {
                const screen = screenSnap.screens![idx] as any;
                screenSnap.screens![idx] = { ...screen, drawElements: prevDraw };
            }
        }
    }
}

/** Admin: rollback a single history entry (inverse op + update snapshot + Redis + optional broadcast) */
export const rollbackProjectHistory = async (req: AuthRequest, res: Response) => {
    try {
        const { projectId } = req.params;
        const { historyId } = req.body || {};

        if (!projectId || !Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ message: '유효한 프로젝트 ID가 필요합니다.' });
        }
        if (!historyId || !Types.ObjectId.isValid(historyId)) {
            return res.status(400).json({ message: '유효한 히스토리 ID가 필요합니다.' });
        }

        const historyDoc = await History.findById(historyId).lean();
        if (!historyDoc) {
            return res.status(404).json({ message: '해당 히스토리를 찾을 수 없습니다.' });
        }
        if (historyDoc.projectId.toString() !== projectId) {
            return res.status(400).json({ message: '해당 히스토리는 이 프로젝트의 것이 아닙니다.' });
        }
        const deleteTypes = ['ENTITY_DELETE', 'RELATIONSHIP_DELETE', 'SCREEN_DELETE', 'FLOW_DELETE', 'SCREEN_FLOW_DELETE', 'ATTRIBUTE_DELETE', 'SCREEN_DRAW_DELETE'];
        if (!deleteTypes.includes(historyDoc.operationType)) {
            return res.status(400).json({ message: '삭제된 항목만 원복할 수 있습니다.' });
        }

        const project = await Project.findById(projectId).lean();
        if (!project) {
            return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다.' });
        }

        const projAny = project as any;
        const projectType = projAny.projectType || 'ERD';
        let erdSnap: IERDSnapshot | null = null;
        if (projectType === 'ERD') {
            const snap = projAny.currentSnapshot || { version: 1, entities: [], relationships: [], savedAt: new Date() };
            erdSnap = JSON.parse(JSON.stringify(snap)) as IERDSnapshot;
        }
        let screenSnap: IScreenSnapshot | null = null;
        if (projectType === 'SCREEN_DESIGN') {
            screenSnap = projAny.screenSnapshot
                ? (JSON.parse(JSON.stringify(projAny.screenSnapshot)) as IScreenSnapshot)
                : ({ version: 1, screens: [], flows: [], savedAt: new Date() } as IScreenSnapshot);
        }

        const prev = historyDoc.operation?.previousState;
        if (!prev) {
            return res.status(400).json({
                message: '이 삭제 이력은 복원할 수 없습니다. (저장 시점에 복원 데이터가 없었습니다. 최근에 삭제된 항목부터 복원 데이터가 저장됩니다.)',
            });
        }
        applyInverseToSnapshot(
            historyDoc.operationType as OperationType,
            historyDoc.targetId,
            prev,
            erdSnap,
            screenSnap
        );

        const update: any = { updatedAt: new Date() };
        if (erdSnap) {
            update.currentSnapshot = {
                ...erdSnap,
                version: (erdSnap.version || 1) + 1,
                savedAt: new Date(),
            };
        }
        if (screenSnap) {
            update.screenSnapshot = {
                ...screenSnap,
                version: (screenSnap.version || 1) + 1,
                savedAt: new Date(),
            };
        }

        await Project.updateOne({ _id: new Types.ObjectId(projectId) }, { $set: update });

        const entities = erdSnap?.entities ?? projAny.currentSnapshot?.entities ?? [];
        const relationships = erdSnap?.relationships ?? projAny.currentSnapshot?.relationships ?? [];
        const screens = screenSnap?.screens ?? projAny.screenSnapshot?.screens ?? [];
        const flows = screenSnap?.flows ?? projAny.screenSnapshot?.flows ?? [];
        const sections = erdSnap?.sections ?? projAny.currentSnapshot?.sections ?? screenSnap?.sections ?? projAny.screenSnapshot?.sections ?? [];
        const version = (erdSnap?.version ?? screenSnap?.version ?? 1) + 1;

        await projectStateManager.saveState(
            projectId,
            entities,
            relationships,
            version,
            screens,
            flows,
            sections
        );

        const io = (req.app as any)?.get?.('io');
        if (io) {
            const state = await projectStateManager.getState(projectId);
            const onlineUsers = await presenceManager.getOnlineUsers(projectId);
            const locks = await lockManager.getAllLocks(projectId);
            const locksObject: Record<string, { userId: string; userName: string }> = {};
            locks.forEach((lock, entityId) => {
                locksObject[entityId] = { userId: lock.userId, userName: lock.userName };
            });
            io.to(`project:${projectId}`).emit('state_sync', {
                state: state || { entities, relationships, screens, flows, sections, version },
                onlineUsers,
                locks: locksObject,
            });
        }

        res.json({ message: '해당 작업이 원복되었습니다.' });
    } catch (error) {
        // console.error('Rollback project history error:', error);
        res.status(500).json({ message: '작업 원복 중 오류가 발생했습니다.' });
    }
};
