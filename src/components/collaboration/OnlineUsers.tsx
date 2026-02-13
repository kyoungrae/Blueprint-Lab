import { User as UserIcon } from 'lucide-react';
import { useSyncStore, type OnlineUser } from '../../store/syncStore';

export function OnlineUsers() {
    const onlineUsers = useSyncStore((state) => state.onlineUsers);
    const isConnected = useSyncStore((state) => state.isConnected);

    // Group by unique user ID for display
    const uniqueUsers = Array.from(
        new Map(onlineUsers.map((u) => [u.id, u])).values()
    );

    if (!isConnected) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 rounded-full">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-xs text-red-400">Offline</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            {/* Connection status */}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/20 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-green-400">Connected</span>
            </div>

            {/* Online users avatars */}
            <div className="flex -space-x-2">
                {uniqueUsers.slice(0, 5).map((user, index) => (
                    <UserAvatar key={user.id} user={user} index={index} />
                ))}
                {uniqueUsers.length > 5 && (
                    <div
                        className="w-8 h-8 rounded-full bg-zinc-700 border-2 border-zinc-800 flex items-center justify-center"
                        title={`+${uniqueUsers.length - 5} more`}
                    >
                        <span className="text-xs text-zinc-300">+{uniqueUsers.length - 5}</span>
                    </div>
                )}
            </div>

            {/* User count */}
            {uniqueUsers.length > 0 && (
                <span className="text-xs text-zinc-400">
                    {uniqueUsers.length} person{uniqueUsers.length > 1 ? 's' : ''}
                    {onlineUsers.length > uniqueUsers.length &&
                        ` (${onlineUsers.length} tabs)`}
                </span>
            )}
        </div>
    );
}

function UserAvatar({ user, index }: { user: OnlineUser; index: number }) {
    return (
        <div
            className="relative group"
            style={{ zIndex: 10 - index }}
        >
            {user.picture ? (
                <img
                    src={user.picture}
                    alt={user.name}
                    className="w-8 h-8 rounded-full border-2 border-zinc-800 object-cover"
                    title={user.name}
                />
            ) : (
                <div
                    className="w-8 h-8 rounded-full border-2 border-zinc-800 flex items-center justify-center text-zinc-400 bg-zinc-800"
                    title={user.name}
                >
                    <UserIcon size={14} />
                </div>
            )}

            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {user.name}
            </div>
        </div>
    );
}
