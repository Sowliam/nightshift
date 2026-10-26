import React, { useState, useEffect, useMemo } from 'react';
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
  Search,
  Check,
  X,
  Music,
} from 'lucide-react';
import { useServerStore } from '../../stores/server.store';
import { useAuthStore } from '../../stores/auth.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { UserContextMenu, UserContextMenuTarget } from '../common/UserContextMenu';
import { ServerMemberDto } from '@nightshift/shared';
import { getFullAvatarUrl } from '../../lib/api';
import { PingIndicator } from '../common/PingIndicator';

export const ParticipantPanel: React.FC = () => {
  const { activeServerId, servers, members, fetchMembers, moderateMember } = useServerStore();
  const { user } = useAuthStore();
  const { activeSpeakers, isLocallySpeaking, activeSoundboardPlayers, currentPing, participantPings } = useLiveKitStore();
  const localMutedUsers = useSettingsStore((s) => s.localMutedUsers);
  const localActiveSounds = useSoundboardStore((s) => s.activeSounds);

  const [searchQuery, setSearchQuery] = useState('');
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

  const getInitials = (name?: string | null) => {
    if (!name || typeof name !== 'string') return 'U';
    const clean = name.trim();
    if (!clean) return 'U';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  // Filter members by search query
  const query = searchQuery.trim().toLowerCase();
  const filteredMembers = useMemo(() => {
    if (!query) return members;
    return members.filter(
      (m) =>
        (m.displayName && m.displayName.toLowerCase().includes(query)) ||
        (m.username && m.username.toLowerCase().includes(query)) ||
        (m.role && m.role.toLowerCase().includes(query))
    );
  }, [members, query]);

  // Partition filtered members into online & offline
  const onlineMembers = filteredMembers.filter((m) => m && m.isOnline);
  const offlineMembers = filteredMembers.filter((m) => m && !m.isOnline);

  const canModerate = (target: ServerMemberDto) => {
    if (!target) return false;
    if (!isOwnerOrAdmin) return false;
    if (target.userId === user?.id) return false;
    if (currentMember?.role === 'owner') return true;
    if (currentMember?.role === 'admin') return target.role === 'member';
    return false;
  };

  const handleToggleMute = async (target: ServerMemberDto) => {
    if (!activeServerId || !target) return;
    const action = target.isServerMuted ? 'unmute' : 'mute';
    setModActionPending(target.userId);
    await moderateMember(activeServerId, target.userId, action);
    setModActionPending(null);
    setActiveMenuUserId(null);
  };

  const handleToggleDeafen = async (target: ServerMemberDto) => {
    if (!activeServerId || !target) return;
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

  // Helper to determine member custom subtitle (matching Image 1)
  const getMemberSubtitle = (member: ServerMemberDto) => {
    if (!member) return '';
    const nameLower = ((member.displayName || '') + ' ' + (member.username || '')).toLowerCase();
    if (nameLower.includes('garlic') || nameLower.includes('gartic')) return 'garticbot.gg';
    if (nameLower.includes('google')) return '/help | google-bot.xyz';
    if (nameLower.includes('jockie')) return 'm!help';
    if (nameLower.includes('luna')) return '!help | /help';
    if (nameLower.includes('maki')) return '/help • Maki.gg';
    if (nameLower.includes('mee6')) return '🔗 mee6bot.com';
    if (nameLower.includes('rythm')) return 'rythm.fm';
    if (nameLower.includes('soundcloud') || nameLower.includes('music')) return 'Listening to /play';
    if (nameLower.includes('translat')) return '-t help | translator.nvu.io';
    if (nameLower.includes('snail')) return '/help';
    if (nameLower.includes('silent')) return 'silent';
    return member.username ? `@${member.username}` : '';
  };

  const isBotUser = (member: ServerMemberDto) => {
    if (!member) return false;
    const str = ((member.displayName || '') + ' ' + (member.username || '') + ' ' + (member.role || '')).toLowerCase();
    return str.includes('bot') || (member.role as string) === 'bot' || str.includes('app');
  };

  const renderMemberItem = (member: ServerMemberDto, isOnline: boolean) => {
    const isMe = member.userId === user?.id;
    const isSpeakingNow = (isMe && isLocallySpeaking) || activeSpeakers.has(member.userId);
    const hasModPermissions = canModerate(member);
    const isBot = isBotUser(member);
    const subtitle = getMemberSubtitle(member);

    const remotePlaying = !isMe ? activeSoundboardPlayers[member.userId] : null;
    const isPlayingSound = isMe ? localActiveSounds.length > 0 : !!remotePlaying;
    const soundTitle = isMe ? localActiveSounds[0]?.name : remotePlaying?.soundName;

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
        className="relative group flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-[#35373c]/50 active:scale-[0.99] transition-all duration-150 cursor-pointer"
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
              className={`w-9 h-9 rounded-full border flex items-center justify-center text-xs font-black transition-all shadow-sm overflow-hidden ${
                isSpeakingNow
                  ? 'bg-[#23a55a] border-[#23a55a] text-black ring-2 ring-[#23a55a]/70 ring-offset-2 ring-offset-[#111214]'
                  : isOnline
                  ? 'bg-[#18191c] border-[#2b2d31] text-[#f2f3f5] group-hover:border-[#5865f2] group-hover:scale-105'
                  : 'bg-[#18191c] border-[#2b2d31] text-[#80848e] opacity-60'
              }`}
            >
              {member.avatarUrl ? (
                <img
                  src={getFullAvatarUrl(member.avatarUrl)!}
                  alt={member.displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                getInitials(member.displayName)
              )}
            </div>

            {/* Online / Offline status badge */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#111214] shadow-sm ${
                isOnline ? 'bg-[#23a55a]' : 'bg-[#80848e]/60'
              }`}
            />
          </div>

          {/* Names, Discord Badges & Subtitle */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`text-[13.5px] font-semibold truncate ${
                  isSpeakingNow
                    ? 'text-[#23a55a] font-bold'
                    : isOnline
                    ? 'text-[#dbdee1] group-hover:text-white'
                    : 'text-[#80848e]'
                }`}
              >
                {member.displayName}
              </span>

              {/* Real voice ping indicator if user is in voice channel */}
              {(isMe ? typeof currentPing === 'number' : typeof participantPings[member.userId] === 'number') && (
                <PingIndicator ping={isMe ? currentPing : participantPings[member.userId]} />
              )}

              {/* Bot APP Badge matching Image 1 */}
              {isBot && (
                <span className="bg-[#5865f2] text-white text-[9.5px] font-black px-1.5 py-0.2 rounded-md tracking-wider flex items-center gap-0.5 shrink-0 shadow-sm leading-tight">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                  APP
                </span>
              )}

              {/* Owner Crown */}
              {member.role === 'owner' && (
                <span title="Server Owner">
                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                </span>
              )}

              {/* Admin Shield */}
              {member.role === 'admin' && (
                <span title="Server Administrator">
                  <Shield className="w-3.5 h-3.5 text-[#52B788] shrink-0" />
                </span>
              )}
            </div>

            {/* Subtitle / Activity / Soundboard Playing indicator */}
            <div className="flex items-center gap-1 text-[11.5px] text-[#949ba4] leading-tight truncate mt-0.5 font-normal">
              {isPlayingSound ? (
                <span className="flex items-center gap-1 text-[10.5px] font-semibold text-accent-bright bg-accent-bright/10 px-1.5 py-0.2 rounded border border-accent-bright/20 animate-pulse truncate" title={`Playing: ${soundTitle}`}>
                  <Music className="w-2.5 h-2.5 animate-bounce shrink-0" />
                  <span className="truncate">{soundTitle}</span>
                </span>
              ) : (
                <span>{subtitle}</span>
              )}
              {isMe && <span className="text-[#5865f2] font-semibold text-[10.5px]">(You)</span>}
            </div>
          </div>
        </div>

        {/* Server Muted / Deafened / Local Muted Indicators & Moderation Button */}
        <div className="flex items-center gap-1 shrink-0">
          {isPlayingSound && (
            <span
              className="p-1 rounded-md bg-accent-bright/20 text-accent-bright border border-accent-bright/40 animate-pulse"
              title={`Playing Sound: ${soundTitle}`}
            >
              <Music className="w-3.5 h-3.5" />
            </span>
          )}
          {localMutedUsers[member.userId] && !isMe && (
            <span
              className="p-1 rounded-md bg-destructive/20 text-destructive border border-destructive/40"
              title="Muted for you"
            >
              <VolumeX className="w-3.5 h-3.5" />
            </span>
          )}
          {member.isServerMuted && (
            <span
              className="p-1 rounded-md bg-destructive/15 text-destructive"
              title="Server Muted by Admin"
            >
              <MicOff className="w-3.5 h-3.5" />
            </span>
          )}
          {member.isServerDeafened && (
            <span
              className="p-1 rounded-md bg-destructive/15 text-destructive"
              title="Server Deafened by Admin"
            >
              <VolumeX className="w-3.5 h-3.5" />
            </span>
          )}

          {hasModPermissions && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuUserId(activeMenuUserId === member.userId ? null : member.userId);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-all"
              title="Moderate Member"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown Moderation Menu */}
        {activeMenuUserId === member.userId && hasModPermissions && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-10 right-2 w-48 bg-[#18191c] border border-[#232428] rounded-xl shadow-2xl p-1.5 z-50 space-y-1 text-xs select-none animate-fade-in"
          >
            <div className="px-2 py-1 text-[10px] font-bold text-[#949ba4] uppercase border-b border-[#232428]">
              Manage @{member.username}
            </div>

            {/* Server Mute */}
            <button
              onClick={() => handleToggleMute(member)}
              disabled={modActionPending === member.userId}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#dbdee1] hover:text-white hover:bg-[#35373c] transition-colors"
            >
              {member.isServerMuted ? (
                <>
                  <Mic className="w-3.5 h-3.5 text-[#23a55a]" />
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
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#dbdee1] hover:text-white hover:bg-[#35373c] transition-colors"
            >
              {member.isServerDeafened ? (
                <>
                  <Headphones className="w-3.5 h-3.5 text-[#23a55a]" />
                  <span>Server Undeafen</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-destructive" />
                  <span>Server Deafen</span>
                </>
              )}
            </button>

            <div className="w-full h-[1px] bg-[#232428]" />

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
    <div className="w-[260px] h-full bg-[#111214] border-l border-[#232428] flex flex-col justify-between select-none shrink-0 z-10">
      {/* 1. Discord Top Search Bar (Matching Image 1) */}
      <div className="p-3 border-b border-[#232428] shrink-0">
        <div className="relative flex items-center bg-[#0e0f11] border border-[#232428] focus-within:border-[#5865f2] rounded-xl px-3 py-1.5 transition-all duration-200 shadow-inner group">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeServer ? `Search ${activeServer.name}...` : 'Search server...'}
            className="w-full bg-transparent text-[13px] text-[#f2f3f5] placeholder:text-[#949ba4] focus:outline-none pr-6"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 text-[#949ba4] hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Search className="w-4 h-4 text-[#949ba4] absolute right-2.5 pointer-events-none group-focus-within:text-[#5865f2] transition-colors" />
          )}
        </div>
      </div>

      {/* 2. Scrollable Body: Activity Section + Online List + Offline List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {!activeServer ? (
          <div className="text-center py-8 text-xs text-[#949ba4]">
            No server selected
          </div>
        ) : (
          <>
            {/* ONLINE SECTION */}
            <div>
              <div className="text-[12px] font-bold tracking-wider text-[#949ba4] uppercase mb-1.5 px-1 flex items-center justify-between">
                <span>Online — {onlineMembers.length}</span>
              </div>
              <div className="space-y-1">
                {onlineMembers.length === 0 ? (
                  <div className="text-xs text-[#949ba4] px-2 py-2">
                    {query ? 'No matching online members' : 'No members online'}
                  </div>
                ) : (
                  onlineMembers.map((m) => renderMemberItem(m, true))
                )}
              </div>
            </div>

            {/* OFFLINE SECTION */}
            {offlineMembers.length > 0 && (
              <div>
                <div className="text-[12px] font-bold tracking-wider text-[#949ba4] uppercase mb-1.5 px-1 flex items-center justify-between">
                  <span>Offline — {offlineMembers.length}</span>
                </div>
                <div className="space-y-1">
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
            className="w-96 bg-[#18191c] rounded-2xl border border-[#232428] shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#f2f3f5] capitalize">
                  {modPrompt.action} {modPrompt.member.displayName}?
                </h4>
                <p className="text-xs text-[#949ba4]">
                  @{modPrompt.member.username} ({modPrompt.member.role})
                </p>
              </div>
            </div>

            <p className="text-xs text-[#dbdee1] leading-relaxed">
              {modPrompt.action === 'kick'
                ? 'Kicking will remove this user from the server. They can re-join if they receive an active invite code.'
                : 'Banning will permanently prevent this user from entering the server or using its invite codes.'}
            </p>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4] block mb-1">
                Reason (Optional)
              </label>
              <input
                type="text"
                value={modReason}
                onChange={(e) => setModReason(e.target.value)}
                placeholder="e.g. Inappropriate behavior"
                className="w-full px-3 py-2 rounded-xl bg-[#0e0f11] border border-[#232428] focus:border-[#5865f2] text-xs text-[#f2f3f5] placeholder:text-[#949ba4] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#232428]">
              <button
                type="button"
                onClick={() => setModPrompt(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#dbdee1] hover:text-white hover:bg-[#2b2d31] transition-colors"
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
