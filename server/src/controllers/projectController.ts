import { Response } from 'express';
import { Project, Invitation, User } from '../models';
import { AuthRequest } from '../middleware/authMiddleware';
import { Types } from 'mongoose';
import { sendInvitationEmail } from '../services/EmailService';
import { presenceManager, projectStateManager } from '../services/PresenceManager';
import { touchProjectMemberLastEditedAt } from '../services/projectMemberActivity';
import { recordProjectAccessLog } from '../services/recordProjectAccessLog';
import { lockManager } from '../services/LockManager';
import crypto from 'crypto';

export const createProject = async (req: AuthRequest, res: Response) => {
    try {
        const { name, dbType, description, projectType } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: '사용자 인증이 필요합니다.' });
        }

        const pt = projectType || 'ERD';
        if (pt === 'COMPONENT') {
            const user = await User.findById(userId).select('tier').lean();
            const tier = user?.tier || 'FREE';
            if (tier !== 'PRO' && tier !== 'MASTER') {
                return res.status(403).json({ message: '컴포넌트 프로젝트는 Pro tier 이상부터 생성할 수 있습니다.' });
            }
        }

        const project = new Project({
            name,
            projectType: pt,
            dbType,
            description,
            members: [{
                userId: new Types.ObjectId(userId),
                role: 'OWNER',
                joinedAt: new Date()
            }],
            currentSnapshot: {
                version: 1,
                entities: [],
                relationships: [],
                savedAt: new Date()
            },
            // Add appropriate snapshot based on project type
            ...(pt === 'SCREEN_DESIGN' && {
                screenSnapshot: {
                    version: 1,
                    screens: [],
                    flows: [],
                    sections: [],
                    savedAt: new Date()
                }
            }),
            ...(pt === 'COMPONENT' && {
                componentSnapshot: {
                    version: 1,
                    components: [],
                    flows: [],
                    savedAt: new Date()
                }
            }),
            ...(pt === 'PROCESS_FLOW' && {
                processFlowSnapshot: {
                    version: 1,
                    nodes: [],
                    edges: [],
                    sections: [],
                    savedAt: new Date()
                }
            })
        });

        await project.save();

        // Populate owner info before responding
        await project.populate('members.userId', 'name email picture');

        res.status(201).json(project);
    } catch (error) {
        // console.error('Create project error:', error);
        res.status(500).json({ message: '프로젝트 생성 중 오류가 발생했습니다.' });
    }
};

export const getProjects = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: '사용자 인증이 필요합니다.' });
        }

        const projects = await Project.find({
            'members.userId': new Types.ObjectId(userId)
        })
            .populate('members.userId', 'name email picture')
            .sort({ updatedAt: -1 });

        res.set('Cache-Control', 'no-store');
        res.json(projects);
    } catch (error) {
        // console.error('Get projects error:', error);
        res.status(500).json({ message: '프로젝트 목록을 가져오는 중 오류가 발생했습니다.' });
    }
};

export const deleteProject = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: '사용자 인증이 필요합니다.' });
        }

        const project = await Project.findOne({
            _id: id,
            'members.userId': new Types.ObjectId(userId),
            'members.role': 'OWNER'
        });

        if (!project) {
            return res.status(404).json({ message: '프로젝트를 찾을 수 없거나 삭제 권한이 없습니다.' });
        }

        await Project.findByIdAndDelete(id);

        // Robust cleanup of all project-related keys in Redis
        await presenceManager.clearAllProjectKeys(id);

        res.json({ message: '프로젝트가 삭제되었습니다.' });
    } catch (error) {
        // console.error('Delete project error:', error);
        res.status(500).json({ message: '프로젝트 삭제 중 오류가 발생했습니다.' });
    }
};
export const updateProject = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, description, data, linkedErdProjectId, linkedErdProjectIds, linkedComponentProjectId, author, bugReports } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: '사용자 인증이 필요합니다.' });
        }

        const project = await Project.findOne({
            _id: id,
            'members.userId': new Types.ObjectId(userId)
        });

        if (!project) {
            return res.status(404).json({ message: '프로젝트를 찾을 수 없거나 수정 권한이 없습니다.' });
        }

        // Check if member is OWNER or EDITOR
        const member = project.members.find(m => m.userId.toString() === userId);
        if (member?.role === 'VIEWER') {
            return res.status(403).json({ message: '수정 권한이 없습니다.' });
        }

        // Pro tier required for adding components in screen design (fromComponentId)
        if (data && project.projectType === 'SCREEN_DESIGN' && project.linkedComponentProjectId && data.screens) {
            const countComponentRefs = (screens: { drawElements?: Array<{ fromComponentId?: string }> }[]) =>
                screens.reduce((n, s) => n + (s.drawElements || []).filter((e: { fromComponentId?: string }) => e.fromComponentId).length, 0);
            const prevCount = countComponentRefs(project.screenSnapshot?.screens ?? []);
            const newCount = countComponentRefs(data.screens);
            if (newCount > prevCount) {
                const userDoc = await User.findById(userId).select('tier').lean();
                const tier = userDoc?.tier || 'FREE';
                if (tier !== 'PRO' && tier !== 'MASTER') {
                    return res.status(403).json({
                        message: '컴포넌트 추가 기능은 Pro tier 이상부터 사용할 수 있습니다.'
                    });
                }
            }
        }

        if (name) project.name = name;
        if (description !== undefined) project.description = description;
        if (author !== undefined) project.author = author;
        if (bugReports !== undefined) project.bugReports = bugReports;
        if (linkedErdProjectIds !== undefined) {
            project.linkedErdProjectIds = Array.isArray(linkedErdProjectIds) ? linkedErdProjectIds : [];
            project.linkedErdProjectId = project.linkedErdProjectIds[0]; // 하위 호환
        } else if (linkedErdProjectId !== undefined) {
            project.linkedErdProjectId = linkedErdProjectId;
            project.linkedErdProjectIds = linkedErdProjectId ? [linkedErdProjectId] : [];
        }
        if (linkedComponentProjectId !== undefined) project.linkedComponentProjectId = linkedComponentProjectId;
        if (data) {
            if (project.projectType === 'COMPONENT' && (data.components !== undefined || data.flows !== undefined)) {
                project.componentSnapshot = {
                    version: (project.componentSnapshot?.version || 0) + 1,
                    components: data.components ?? project.componentSnapshot?.components ?? [],
                    flows: data.flows ?? project.componentSnapshot?.flows ?? [],
                    savedAt: new Date()
                };
            } else if (project.projectType === 'SCREEN_DESIGN' && (data.screens !== undefined || data.flows !== undefined || data.sections !== undefined)) {
                project.screenSnapshot = {
                    version: (project.screenSnapshot?.version || 0) + 1,
                    screens: data.screens ?? project.screenSnapshot?.screens ?? [],
                    flows: data.flows ?? project.screenSnapshot?.flows ?? [],
                    sections: Array.isArray(data.sections) ? data.sections : (project.screenSnapshot?.sections ?? []),
                    savedAt: new Date()
                };
            } else if (project.projectType === 'PROCESS_FLOW' && (data.nodes !== undefined || data.edges !== undefined || data.sections !== undefined)) {
                project.processFlowSnapshot = {
                    version: (project.processFlowSnapshot?.version || 0) + 1,
                    nodes: data.nodes ?? project.processFlowSnapshot?.nodes ?? [],
                    edges: data.edges ?? project.processFlowSnapshot?.edges ?? [],
                    sections: Array.isArray(data.sections) ? data.sections : (project.processFlowSnapshot?.sections ?? []),
                    savedAt: new Date()
                };
            } else {
                // MongoDB document size limit is 16MB; reject before save to return clear error
                const payloadSize = Buffer.byteLength(JSON.stringify(data), 'utf8');
                const MAX_SNAPSHOT_BYTES = 14 * 1024 * 1024; // 14MB to stay under 16MB doc limit
                if (payloadSize > MAX_SNAPSHOT_BYTES) {
                    return res.status(413).json({
                        message: '저장 데이터가 너무 큽니다. 테이블을 여러 번에 나누어 추가하거나, 일부 테이블을 삭제한 뒤 다시 시도해 주세요.',
                        code: 'PAYLOAD_TOO_LARGE',
                        size: payloadSize,
                        limit: MAX_SNAPSHOT_BYTES,
                    });
                }
                // Sanitize entities so every attribute has required fields (Mongoose validation)
                const sanitizedEntities = Array.isArray(data.entities) ? data.entities.map((ent: any) => ({
                    ...ent,
                    attributes: Array.isArray(ent.attributes) ? ent.attributes.map((attr: any, idx: number) => ({
                        id: attr?.id ?? `attr_${idx}`,
                        name: attr?.name != null && String(attr.name).trim() !== '' ? String(attr.name).trim() : `column_${idx + 1}`,
                        type: attr?.type != null && String(attr.type).trim() !== '' ? String(attr.type).trim() : 'VARCHAR',
                        isPK: Boolean(attr?.isPK),
                        isFK: Boolean(attr?.isFK),
                        isNullable: attr?.isNullable !== false,
                        defaultVal: attr?.defaultVal != null ? String(attr.defaultVal) : undefined,
                        comment: attr?.comment != null ? String(attr.comment) : undefined,
                        length: attr?.length != null ? String(attr.length) : undefined,
                    })) : [],
                })) : [];
                project.currentSnapshot = {
                    ...data,
                    entities: sanitizedEntities,
                    version: (project.currentSnapshot?.version || 0) + 1,
                    savedAt: new Date()
                };
            }
        }

        // Only OWNER can modify members
        if (req.body.members && member?.role === 'OWNER') {
            const oldMemberIds = project.members.map(m => m.userId.toString());
            const newMembers = req.body.members.map((m: any) => ({
                userId: new Types.ObjectId(m.id),
                role: m.role,
                joinedAt: m.joinedAt || new Date()
            }));
            const newMemberIds = newMembers.map((m: any) => m.userId.toString());

            // Identify removed members logic
            const removedMemberIds = oldMemberIds.filter(id => !newMemberIds.includes(id));

            // Ensure owner remains
            const hasOwner = newMembers.some((m: any) => m.role === 'OWNER');
            if (hasOwner) {
                project.members = newMembers;

                // Cleanup Redis for removed members asynchronously
                removedMemberIds.forEach(async (mid) => {
                    await presenceManager.removeUserPresence(id, mid);
                    await lockManager.releaseAllUserLocks(id, mid);
                });
            }
        }

        await project.save();
        await touchProjectMemberLastEditedAt(id, userId);
        res.json(project);
    } catch (error: any) {
        // console.error('Update project error:', error);
        const msg = error?.message ?? (error ? String(error) : '');
        const isMongoTooLarge = error?.code === 10334 || msg.includes('document is too large') || msg.includes('BSON');
        if (isMongoTooLarge) {
            return res.status(413).json({
                message: '저장 데이터가 너무 큽니다. 테이블을 여러 번에 나누어 추가하거나, 일부를 삭제한 뒤 다시 시도해 주세요.',
                code: 'PAYLOAD_TOO_LARGE',
            });
        }
        res.status(500).json({
            message: '프로젝트 수정 중 오류가 발생했습니다.',
            ...(process.env.NODE_ENV !== 'production' ? { detail: msg || (error?.stack ?? 'Unknown error') } : {}),
        });
    }
};

export const recordProjectActionLog = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { kind } = req.body as { kind?: string };

        if (!userId) {
            return res.status(401).json({ message: '사용자 인증이 필요합니다.' });
        }
        if (!id || !Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: '유효한 프로젝트 ID가 필요합니다.' });
        }
        if (kind !== 'EXPORT_PPT') {
            return res.status(400).json({ message: '유효하지 않은 로그 유형입니다.' });
        }

        const hasAccess = await Project.exists({
            _id: new Types.ObjectId(id),
            'members.userId': new Types.ObjectId(userId),
        });
        if (!hasAccess) {
            return res.status(404).json({ message: '프로젝트를 찾을 수 없거나 접근 권한이 없습니다.' });
        }

        await recordProjectAccessLog(userId, id, kind);
        return res.status(204).send();
    } catch {
        return res.status(500).json({ message: '로그 기록 중 오류가 발생했습니다.' });
    }
};

/** 디버그: MongoDB에 저장된 화면 목록 (drawElements 포함) - 이미지 경로 저장 여부 확인용 */
export const getProjectScreensDebug = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const project = await Project.findById(id).select('screenSnapshot.screens').lean();
        if (!project) return res.status(404).json({ message: 'Project not found' });
        const screens = (project as any).screenSnapshot?.screens || [];
        const summary = screens.map((s: any) => ({
            id: s.id,
            name: s.name,
            drawElementsCount: s.drawElements?.length ?? 0,
            imageElements: s.drawElements?.filter((e: any) => e.type === 'image').map((e: any) => ({
                id: e.id,
                hasImageUrl: !!e.imageUrl,
                imageUrl: e.imageUrl ? (typeof e.imageUrl === 'string' ? (e.imageUrl.length > 60 ? e.imageUrl.substring(0, 60) + '...' : e.imageUrl) : '[non-string]') : null,
            })) ?? [],
        }));
        res.json({ screens: summary });
    } catch (error) {
        // console.error('getProjectScreensDebug error:', error);
        res.status(500).json({ message: 'Error fetching screens' });
    }
};

export const getProject = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        // Find project by ID and populate members to show creator/team info
        // .lean() ensures plain objects so nested drawElements/imageUrl are preserved in JSON
        const project = await Project.findById(id)
            .populate('members.userId', 'name email picture')
            .lean();

        if (!project) {
            return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다.' });
        }

        res.json(project);
    } catch (error) {
        // console.error('Get project error:', error);
        res.status(500).json({ message: '프로젝트 정보를 가져오는 중 오류가 발생했습니다.' });
    }
};

export const createInvitation = async (req: AuthRequest, res: Response) => {
    try {
        const { projectId, email, role = 'EDITOR' } = req.body;
        const inviterId = req.user?.id;

        if (!inviterId) return res.status(401).json({ message: '인증 필요' });

        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: '프로젝트 없음' });

        // Check if inviter is owner
        const inviterMember = project.members.find(m => m.userId.toString() === inviterId);
        if (inviterMember?.role !== 'OWNER') {
            return res.status(403).json({ message: '초대 권한이 없습니다.' });
        }

        // Generate 8-char random code
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();

        // Expire in 7 days
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const invitation = await Invitation.create({
            projectId,
            email,
            code,
            role,
            inviterId,
            expiresAt
        });

        // Get inviter info for email
        const inviter = await User.findById(inviterId);

        await sendInvitationEmail(email, project.name, inviter?.name || '관리자', code);

        res.json({ message: '초대 메일이 발송되었습니다.', code });
    } catch (error) {
        // console.error('Create invitation error:', error);
        res.status(500).json({ message: '초대 생성 중 오류가 발생했습니다.' });
    }
};

export const joinProjectWithCode = async (req: AuthRequest, res: Response) => {
    try {
        const { code } = req.body;
        const userId = req.user?.id;

        if (!userId) return res.status(401).json({ message: '인증 필요' });

        const invitation = await Invitation.findOne({
            code,
            status: 'PENDING',
            expiresAt: { $gt: new Date() }
        });

        if (!invitation) {
            return res.status(404).json({ message: '유효하지 않거나 만료된 초대 코드입니다.' });
        }

        const project = await Project.findById(invitation.projectId);
        if (!project) return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다.' });

        // Check if already a member
        const isAlreadyMember = project.members.some(m => m.userId.toString() === userId);
        if (isAlreadyMember) {
            invitation.status = 'ACCEPTED';
            await invitation.save();
            return res.status(400).json({ message: '이미 참여 중인 프로젝트입니다.' });
        }

        // Add member
        project.members.push({
            userId: new Types.ObjectId(userId),
            role: invitation.role,
            joinedAt: new Date()
        });

        await project.save();

        // Mark invitation as accepted
        invitation.status = 'ACCEPTED';
        await invitation.save();

        res.json({ message: '프로젝트에 참여되었습니다.', projectId: project._id });
    } catch (error) {
        // console.error('Join project error:', error);
        res.status(500).json({ message: '프로젝트 참여 중 오류가 발생했습니다.' });
    }
};

export const joinProjectById = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) return res.status(401).json({ message: '인증 필요' });

        const project = await Project.findById(id);
        if (!project) return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다.' });

        // Check if already a member
        const isAlreadyMember = project.members.some(m => m.userId.toString() === userId);
        if (isAlreadyMember) {
            return res.json({ message: '이미 참여 중인 프로젝트입니다.', projectId: project._id });
        }

        // Add member as EDITOR by default when joining via ID
        project.members.push({
            userId: new Types.ObjectId(userId),
            role: 'EDITOR',
            joinedAt: new Date()
        });

        await project.save();

        res.json({ message: '프로젝트에 참여되었습니다.', projectId: project._id });
    } catch (error) {
        // console.error('Join project by ID error:', error);
        res.status(500).json({ message: '프로젝트 참여 중 오류가 발생했습니다.' });
    }
};
