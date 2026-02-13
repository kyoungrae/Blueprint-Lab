import { useSyncStore, type CursorInfo } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';

// User colors for cursor identification
const CURSOR_COLORS = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange
];

function getUserColor(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

export function UserCursors() {
    const cursors = useSyncStore((state) => state.cursors);
    const currentUser = useAuthStore((state) => state.user);

    return (
        <>
            {Array.from(cursors.entries()).map(([userId, cursor]) => {
                // Don't show own cursor
                if (userId === currentUser?.id) return null;

                return (
                    <UserCursor
                        key={userId}
                        cursor={cursor}
                        color={getUserColor(userId)}
                    />
                );
            })}
        </>
    );
}

interface UserCursorProps {
    cursor: CursorInfo;
    color: string;
}

function UserCursor({ cursor, color }: UserCursorProps) {
    return (
        <div
            className="absolute pointer-events-none z-50 transition-all duration-75"
            style={{
                left: cursor.x,
                top: cursor.y,
                transform: 'translate(-2px, -2px)',
            }}
        >
            {/* Cursor arrow */}
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
            >
                <path
                    d="M5.65376 12.4563L5.65377 12.4563L11.8862 5.33128L8.13762 19.9085L5.65376 12.4563Z"
                    fill={color}
                    stroke="white"
                    strokeWidth="1.5"
                />
            </svg>

            {/* User name label */}
            <div
                className="absolute left-4 top-4 px-2 py-0.5 rounded text-xs text-white whitespace-nowrap"
                style={{ backgroundColor: color }}
            >
                {cursor.userName}
            </div>
        </div>
    );
}
