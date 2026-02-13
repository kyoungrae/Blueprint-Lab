import { Response } from 'express';
import { Project, Invitation, User } from '../models';
import { AuthRequest } from '../middleware/authMiddleware';
import { Types } from 'mongoose';
import { sendInvitationEmail } from '../services/EmailService';
import { presenceManager, projectStateManager } from '../services/PresenceManager';
import { lockManager } from '../services/LockManager';
import crypto from 'crypto';

export const createProject = async (req: AuthRequest, res: Response) => {
    try {
        const { name, dbType, description, projectType } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: '사용자 인증이 필요합니다.' });
        }

        const project = new Project({
            name,
            projectType: projectType || 'ERD',
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
            }
        });

        await project.save();

        // Populate owner info before responding
        await project.populate('members.userId', 'name email picture');

        res.status(201).json(project);
    } catch (error) {
        console.error('Create project error:', error);
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
        console.error('Get projects error:', error);
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
        console.error('Delete project error:', error);
        res.status(500).json({ message: '프로젝트 삭제 중 오류가 발생했습니다.' });
    }
};
export const updateProject = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, description, data } = req.body;
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

        if (name) project.name = name;
        if (description !== undefined) project.description = description;
        if (data) {
            project.currentSnapshot = {
                ...data,
                version: (project.currentSnapshot?.version || 0) + 1,
                savedAt: new Date()
            };
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
        res.json(project);
    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({ message: '프로젝트 수정 중 오류가 발생했습니다.' });
    }
};

export const getProject = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        // Find project by ID and populate members to show creator/team info
        const project = await Project.findById(id)
            .populate('members.userId', 'name email picture');

        if (!project) {
            return res.status(404).json({ message: '프로젝트를 찾을 수 없습니다.' });
        }

        res.json(project);
    } catch (error) {
        console.error('Get project error:', error);
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
        console.error('Create invitation error:', error);
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
        console.error('Join project error:', error);
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
        console.error('Join project by ID error:', error);
        res.status(500).json({ message: '프로젝트 참여 중 오류가 발생했습니다.' });
    }
};
