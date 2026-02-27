import { Response } from 'express';
import bcrypt from 'bcrypt';
import { AuthRequest } from '../middleware/authMiddleware';
import { User } from '../models/User';
import { Project } from '../models/Project';
import { Invitation } from '../models/Invitation';
import { Types } from 'mongoose';

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
        console.error('Get admin users error:', error);
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
        console.error('Update user tier error:', error);
        res.status(500).json({ message: '티어 변경 중 오류가 발생했습니다.' });
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
        console.error('Delete user error:', error);
        res.status(500).json({ message: '회원 삭제 중 오류가 발생했습니다.' });
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

        const data = projects.map((p: any) => ({
            id: p._id?.toString?.() || p._id,
            name: p.name,
            projectType: p.projectType || 'ERD',
            dbType: p.dbType,
            description: p.description,
            updatedAt: p.updatedAt,
            memberCount: p.members?.length || 0,
        }));

        res.json(data);
    } catch (error) {
        console.error('Get user projects error:', error);
        res.status(500).json({ message: '프로젝트 목록을 가져오는 중 오류가 발생했습니다.' });
    }
};
