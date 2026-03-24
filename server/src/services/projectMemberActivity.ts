import { Types } from 'mongoose';
import { Project } from '../models';

/**
 * 멤버별 "이 사용자가 이 프로젝트를 마지막으로 편집해 DB에 반영된 시각".
 * 프로젝트 전역 updatedAt 과 별도로 관리한다.
 */
export async function touchProjectMemberLastEditedAt(
    projectId: string,
    userId: string | undefined | null
): Promise<void> {
    if (!userId || userId === 'anonymous') return;
    if (!Types.ObjectId.isValid(projectId) || !Types.ObjectId.isValid(userId)) return;

    const pid = new Types.ObjectId(projectId);
    const uid = new Types.ObjectId(userId);

    try {
        await Project.updateOne(
            { _id: pid, 'members.userId': uid },
            { $set: { 'members.$[m].lastEditedAt': new Date() } },
            { arrayFilters: [{ 'm.userId': uid }] }
        );
    } catch {
        // 목록·협업 주 경로를 막지 않음
    }
}

export async function touchProjectMemberLastEditedAtMany(
    projectId: string,
    userIds: Iterable<string>
): Promise<void> {
    const seen = new Set<string>();
    for (const id of userIds) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        await touchProjectMemberLastEditedAt(projectId, id);
    }
}
