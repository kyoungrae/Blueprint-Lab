import { Types } from 'mongoose';
import { ProjectAccessLog, type ProjectAccessLogKind } from '../models/ProjectAccessLog';

const THROTTLE_MS = 2 * 60 * 1000;
const SAVE_THROTTLE_MS = 10 * 60 * 1000;

/**
 * 프로젝트 접속·활동 로그 (관리자 로그관리 탭).
 * 동일 사용자·프로젝트·종류에 대해 짧은 시간 내 중복 기록을 줄인다.
 */
export async function recordProjectAccessLog(
    userId: string | undefined | null,
    projectId: string | undefined | null,
    kind: ProjectAccessLogKind
): Promise<void> {
    if (!userId || userId === 'anonymous') return;
    if (!projectId || !Types.ObjectId.isValid(projectId) || !Types.ObjectId.isValid(userId)) return;

    const throttle = kind === 'MEMBER_SAVE' ? SAVE_THROTTLE_MS : THROTTLE_MS;
    const since = new Date(Date.now() - throttle);

    try {
        const uid = new Types.ObjectId(userId);
        const pid = new Types.ObjectId(projectId);

        if (kind === 'SOCKET_JOIN') {
            await ProjectAccessLog.deleteMany({ userId: uid, projectId: pid, kind: 'SOCKET_JOIN' });
            await ProjectAccessLog.create({
                userId: uid,
                projectId: pid,
                kind,
                eventAt: new Date(),
            });
            return;
        }

        const recent = await ProjectAccessLog.findOne({
            userId: uid,
            projectId: pid,
            kind,
            eventAt: { $gte: since },
        })
            .select('_id')
            .lean();
        if (recent) return;

        await ProjectAccessLog.create({
            userId: uid,
            projectId: pid,
            kind,
            eventAt: new Date(),
        });
    } catch {
        // 협업·저장 경로를 막지 않음
    }
}
