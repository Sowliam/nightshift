import React, { useState, useEffect } from 'react';
import {
  Crown,
  Shield,
  MicOff,
  VolumeX,
  MoreVertical,
  UserX,
  Ban,
  Mic,
  Headphones,
  AlertTriangle,
} from 'lucide-react';
import { useServerStore } from '../../stores/server.store';
import { useAuthStore } from '../../stores/auth.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useSettingsStore } from '../../stores/settings.store';
import { UserContextMenu, UserContextMenuTarget } from '../common/UserContextMenu';
import { ServerMemberDto } from '@nightshift/shared';

export const ParticipantPanel: React.FC = () => {
  const { activeServerId, servers, members, fetchMembers, moderateMember } = useServerStore();
  const { user } = useAuthStore();
  const { activeSpeakers, isLocallySpeaking } = useLiveKitStore();
  const localMutedUsers = useSettingsStore((s) => s.localMutedUsers);

  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    target: UserContextMenuTarget | null;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    target: null,
  });

  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);
  const [modActionPending, setModActionPending] = useState<string | null>(null);
  const [modPrompt, setModPrompt] = useState<{
    member: ServerMemberDto;
    action: 'kick' | 'ban';
  } | null>(null);
  const [modReason, setModReason] = useState('');

  const activeServer = servers.find((s) => s.id === activeServerId) || null;
  const currentMember = members.find((m) => m.userId === user?.id);
  const isOwnerOrAdmin = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  // Periodic member presence sync for active server
  useEffect(() => {
    if (activeServerId) {
      fetchMembers(activeServerId);
      const interval = setInterval(() => {
        fetchMembers(activeServerId);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeServerId, fetchMembers]);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuUserId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const getInitials = (name: string) => {
    return (name || 'U')
      .split(' ')
      .map((part) => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Partition real server members into online & offline
  const onlineMembers = members.filter((m) => m.isOnline);
  const offlineMembers = members.filter((m) => !m.isOnline);

  const canModerate = (target: ServerMemberDto) => {
    if (!isOwnerOrAdmin) return false;
    if (target.userId === user?.id) return false; // Cannot moderate oneself
    if (currentMember?.role === 'owner') return true; // Owner can moderate anyone
    if (currentMember?.role === 'admin') return target.role === 'member'; // Admin can only moderate members
    return false;
  };

  const handleToggleMute = async (target: ServerMemberDto) => {
    if (!activeServerId) return;
    const action = target.isServerMuted ? 'unmute' : 'mute';
    setModActionPending(target.userId);
    await moderateMember(activeServerId, target.userId, action);
    setModActionPending(null);
    setActiveMenuUserId(null);
  };

  const handleToggleDeafen = async (target: ServerMemberDto) => {
    if (!activeServerId) return;
    const action = target.isServerDeafened ? 'undeafen' : 'deafen';
    setModActionPending(target.userId);
    await moderateMember(activeServerId, target.userId, action);
    setModActionPending(null);
    setActiveMenuUserId(null);
  };

  const handleConfirmKickBan = async () => {
    if (!activeServerId || !modPrompt) return;
    setModActionPending(modPrompt.member.userId);
    await moderateMember(
      activeServerId,
      modPrompt.member.userId,
      modPrompt.action,
      modReason.trim() || undefined
    );
    setModActionPending(null);
    setModPrompt(null);
    setModReason('');
    setActiveMenuUserId(null);
  };

  const renderMemberItem = (member: ServerMemberDto, isOnline: boolean) => {
    const isMe = member.userId === user?.id;
    const isSpeakingNow = (isMe && isLocallySpeaking) || activeSpeakers.has(member.userId);
    const hasModPermissions = canModerate(member);

    return (
      <div
        key={member.id}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            target: {
              identity: member.userId,
              name: member.displayName || member.username,
              isLocal: isMe,
              role: member.role,
              isServerMuted: member.isServerMuted,
              isServerDeafened: member.isServerDeafened,
            },
          });
        }}
        className="relative group flex items-center justify-between p-1.5 rounded-xl hover:bg-bg-elevated/50 transition-colors cursor-context-menu"
        onClick={(e) => {
          e.stopPropagation();
          if (hasModPermissions) {
            setActiveMenuUserId(activeMenuUserId === member.userId ? null : member.userId);
          }
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar with Status Dot */}
          <div className="relative shrink-0">
            <div
              className={`w-9 h-9 rounded-full border flex items-center justify-center text-xs font-black transition-all shadow-sm ${
                isSpeakingNow
                  ? 'bg-highlight border-online text-highlight-text ring-2 ring-online/60'
                  : isOnline
                  ? 'bg-bg-elevated border-border-subtle text-highlight group-hover:border-highlight group-hover:bg-highlight group-hover:text-highlight-text'
                  : 'bg-bg-elevated border-border-subtle text-text-muted opacity-70'
              }`}
            >
              {getInitials(member.displayName)}
            </div>

            {/* Online / Offline status badge */}
            <span
              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-bg-secondary ${
                isOnline ? 'bg-online' : 'bg-text-muted/60'
              }`}
            />
          </div>

          {/* Names & Role Badges */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`text-xs font-semibold truncate ${
                  isSpeakingNow
                    ? 'text-online font-bold'
                    : isOnline
                    ? 'text-text-primary group-hover:text-highlight'
                    : 'text-text-muted'
                }`}
              >
                {member.displayName}
              </span>

              {/* Owner / Admin Role Icon */}
              {member.role === 'owner' && (
                <span title="Server Owner">
                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                </span>
              )}
              {member.role === 'admin' && (
                <span title="Server Administrator">
                  <Shield className="w-3 h-3 text-highlight shrink-0" />
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 text-[10px] text-text-muted font-mono leading-tight truncate">
              <span>@{member.username}</span>
              {isMe && <span className="text-highlight font-semibold">(You)</span>}
            </div>
          </div>
        </div>

        {/* Server Muted / Deafened / Local Muted Indicators & Moderation Button */}
        <div className="flex items-center gap-1 shrink-0">
          {localMutedUsers[member.userId] && !isMe && (
            <span
              className="p-1 rounded bg-destructive/20 text-destructive border border-destructive/40"
              title="Muted for you (بی‌صدا شده برای شما)"
            >
              <VolumeX className="w-3 h-3" />
            </span>
          )}
          {member.isServerMuted && (
            <span
              className="p-1 rounded bg-destructive/15 text-destructive"
              title="Server Muted by Admin"
            >
              <MicOff className="w-3 h-3" />
            </span>
          )}
          {member.isServerDeafened && (
            <span
              className="p-1 rounded bg-destructive/15 text-destructive"
              title="Server Deafened by Admin"
            >
              <VolumeX className="w-3 h-3" />
            </span>
          )}

          {hasModPermissions && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuUserId(activeMenuUserId === member.userId ? null : member.userId);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-text-muted hover:text-highlight hover:bg-bg-hover transition-all"
              title="Moderate Member"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown Moderation Menu */}
        {activeMenuUserId === member.userId && hasModPermissions && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-10 right-2 w-48 bg-bg-elevated border border-border rounded-xl shadow-2xl p-1.5 z-50 space-y-1 text-xs select-none animate-fade-in"
          >
            <div className="px-2 py-1 text-[10px] font-bold text-text-muted uppercase border-b border-border-subtle">
              Manage @{member.username}
            </div>

            {/* Server Mute */}
            <button
              onClick={() => handleToggleMute(member)}
              disabled={modActionPending === member.userId}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              {member.isServerMuted ? (
                <>
                  <Mic className="w-3.5 h-3.5 text-online" />
                  <span>Server Unmute</span>
                </>
              ) : (
                <>
                  <MicOff className="w-3.5 h-3.5 text-destructive" />
                  <span>Server Mute</span>
                </>
              )}
            </button>

            {/* Server Deafen */}
            <button
              onClick={() => handleToggleDeafen(member)}
              disabled={modActionPending === member.userId}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              {member.isServerDeafened ? (
                <>
                  <Headphones className="w-3.5 h-3.5 text-online" />
                  <span>Server Undeafen</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-destructive" />
                  <span>Server Deafen</span>
                </>
              )}
            </button>

            <div className="w-full h-[1px] bg-border-subtle" />

            {/* Kick Member */}
            <button
              onClick={() => setModPrompt({ member, action: 'kick' })}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-destructive hover:bg-destructive/15 transition-colors font-medium"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Kick @{member.username}</span>
            </button>

            {/* Ban Member */}
            <button
              onClick={() => setModPrompt({ member, action: 'ban' })}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-destructive hover:bg-destructive/15 transition-colors font-medium"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Ban @{member.username}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-[240px] h-full bg-bg-secondary border-l border-border-subtle flex flex-col justify-between select-none shrink-0 z-10">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {!activeServer ? (
          <div className="text-center py-8 text-xs text-text-muted">
            No server selected
          </div>
        ) : (
          <>
            {/* ONLINE Section */}
            <div>
              <div className="text-[11px] font-bold tracking-wider text-text-muted uppercase mb-3 px-1">
                Online — {onlineMembers.length}
              </div>
              <div className="space-y-2">
                {onlineMembers.length === 0 ? (
                  <div className="text-[11px] text-text-muted px-2 py-1">No members online</div>
                ) : (
                  onlineMembers.map((m) => renderMemberItem(m, true))
                )}
              </div>
            </div>

            {/* OFFLINE Section */}
            {offlineMembers.length > 0 && (
              <div>
                <div className="text-[11px] font-bold tracking-wider text-text-muted uppercase mb-3 px-1">
                  Offline — {offlineMembers.length}
                </div>
                <div className="space-y-2">
                  {offlineMembers.map((m) => renderMemberItem(m, false))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirmation Modal for Kick & Ban */}
      {modPrompt && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setModPrompt(null)}
        >
          <div
            className="w-96 bg-bg-secondary rounded-2xl border border-border shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-text-primary capitalize">
                  {modPrompt.action} {modPrompt.member.displayName}?
                </h4>
                <p className="text-xs text-text-muted">
                  @{modPrompt.member.username} ({modPrompt.member.role})
                </p>
              </div>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              {modPrompt.action === 'kick'
                ? 'Kicking will remove this user from the server. They can re-join if they receive an active invite code.'
                : 'Banning will permanently prevent this user from entering the server or using its invite codes.'}
            </p>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-text-muted block mb-1">
                Reason (Optional)
              </label>
              <input
                type="text"
                value={modReason}
                onChange={(e) => setModReason(e.target.value)}
                placeholder="e.g. Inappropriate behavior"
                className="w-full px-3 py-2 rounded-xl bg-bg-elevated border border-border-subtle focus:border-highlight text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setModPrompt(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmKickBan}
                disabled={modActionPending !== null}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-destructive hover:bg-destructive-hover text-white transition-all shadow-md capitalize"
              >
                Confirm {modPrompt.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Context Menu for Right-Click on Members */}
      <UserContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        target={contextMenu.target}
        onClose={() => setContextMenu((c) => ({ ...c, isOpen: false }))}
        canModerate={
          contextMenu.target
            ? canModerate(
                members.find((m) => m.userId === contextMenu.target?.identity) || ({} as any)
              )
            : false
        }
        onServerMute={(userId) => {
          const m = members.find((x) => x.userId === userId);
          if (m) handleToggleMute(m);
        }}
        onServerDeafen={(userId) => {
          const m = members.find((x) => x.userId === userId);
          if (m) handleToggleDeafen(m);
        }}
        onKick={(userId) => {
          const m = members.find((x) => x.userId === userId);
          if (m) setModPrompt({ member: m, action: 'kick' });
        }}
        onBan={(userId) => {
          const m = members.find((x) => x.userId === userId);
          if (m) setModPrompt({ member: m, action: 'ban' });
        }}
      />
    </div>
  );
};
