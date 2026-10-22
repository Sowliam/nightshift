import React from 'react';
import { Volume2, Plus, UserPlus, Radio, LogIn } from 'lucide-react';
import { useRoomStore } from '../../stores/room.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useAuthStore } from '../../stores/auth.store';
import { api } from '../../lib/api';
import { ConnectionState } from 'livekit-client';

interface RoomSidebarProps {
  onOpenInvite: () => void;
}

export const RoomSidebar: React.FC<RoomSidebarProps> = ({ onOpenInvite }) => {
  const { rooms, selectedRoomId, activeRoomId, selectRoom, setActiveRoom } = useRoomStore();
  const { connect, connectionState } = useLiveKitStore();
  const { user } = useAuthStore();

  const handleJoinRoom = async (roomId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) return;

    if (activeRoomId === roomId && connectionState === ConnectionState.Connected) {
      // Already connected to this room
      return;
    }

    try {
      const joinData = await api.joinRoom(roomId, user.id);
      setActiveRoom(roomId);
      await connect(joinData.livekitUrl, joinData.token);
    } catch (err: any) {
      console.error('Failed to join room:', err);
      alert(err.message || 'Could not join room');
    }
  };

  // Mock friends online for community presence demonstration
  const onlineFriends = [
    { name: 'Kian', status: 'In Late lobby', avatar: 'K' },
    { name: 'Arash', status: 'Online', avatar: 'A' },
    { name: 'Sina', status: 'Online', avatar: 'S' },
  ];

  return (
    <div className="w-[250px] h-full bg-bg-secondary border-r border-border-subtle flex flex-col justify-between select-none shrink-0 z-10">
      {/* Top Section: Room Header and Rooms List */}
      <div className="flex flex-col h-full overflow-hidden">
        {/* Room Header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-border-subtle shrink-0">
          <span className="text-xs font-bold tracking-wider text-text-secondary uppercase">
            Your Space
          </span>
          <span className="text-[11px] text-text-muted px-2 py-0.5 rounded bg-bg-elevated border border-border-subtle">
            {rooms.length} Rooms
          </span>
        </div>

        {/* Rooms Scroll List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-text-muted uppercase">
            Voice Channels
          </div>

          {rooms.map((room) => {
            const isSelected = selectedRoomId === room.id;
            const isActive = activeRoomId === room.id && connectionState === ConnectionState.Connected;

            return (
              <div
                key={room.id}
                onClick={() => selectRoom(room.id)}
                className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-bg-elevated text-text-primary border border-border-subtle'
                    : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                }`}
              >
                {/* Active Connected Room Indicator Line */}
                {isActive && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 bg-accent rounded-r-md" />
                )}

                <div className="flex items-center gap-2.5 min-w-0">
                  {isActive ? (
                    <Radio className="w-4 h-4 text-accent shrink-0 animate-pulse" />
                  ) : (
                    <Volume2
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? 'text-text-primary' : 'text-text-muted group-hover:text-text-secondary'
                      }`}
                    />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span
                      className={`text-sm font-medium truncate ${
                        isActive ? 'text-accent font-semibold' : ''
                      }`}
                    >
                      {room.name}
                    </span>
                    {room.description && (
                      <span className="text-[11px] text-text-muted truncate">
                        {room.description}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {/* Join Button if not currently active in this room */}
                  {!isActive && isSelected && (
                    <button
                      onClick={(e) => handleJoinRoom(room.id, e)}
                      className="px-2 py-1 text-[11px] font-medium bg-accent text-bg-main rounded hover:bg-accent-hover transition-colors flex items-center gap-1"
                      title="Join voice"
                    >
                      <LogIn className="w-3 h-3" />
                      Join
                    </button>
                  )}

                  {/* Connected Badge */}
                  {isActive && (
                    <span className="text-[10px] font-bold tracking-wider text-accent uppercase bg-accent-subtle px-1.5 py-0.5 rounded">
                      Live
                    </span>
                  )}

                  {/* Participant count */}
                  {room.participantCount > 0 && (
                    <span className="text-xs text-text-muted bg-bg-main px-1.5 py-0.5 rounded-md border border-border-subtle">
                      {room.participantCount}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Friends Online Section */}
        <div className="p-3 border-t border-border-subtle bg-bg-secondary shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold tracking-wider text-text-muted uppercase">
              Friends Online
            </span>
            <button
              onClick={onOpenInvite}
              className="text-text-muted hover:text-accent transition-colors"
              title="Invite Friends"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1.5">
            {onlineFriends.map((friend) => (
              <div
                key={friend.name}
                className="flex items-center justify-between p-1.5 rounded-md hover:bg-bg-elevated transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <div className="w-7 h-7 rounded-full bg-bg-elevated border border-border-subtle flex items-center justify-center text-xs font-semibold text-text-primary">
                      {friend.avatar}
                    </div>
                    <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-online border border-bg-secondary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-text-primary">
                      {friend.name}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {friend.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Invite Button */}
          <button
            onClick={onOpenInvite}
            className="w-full mt-3 py-1.5 px-3 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-border-subtle hover:border-accent text-xs font-medium text-text-primary flex items-center justify-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-accent" />
            Invite Friends
          </button>
        </div>
      </div>
    </div>
  );
};
