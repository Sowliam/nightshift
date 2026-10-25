import React, { useState, useEffect, useRef } from 'react';
import {
  Hash,
  Users,
  Plus,
  Smile,
  Image as ImageIcon,
  Send,
  Loader2,
  X,
  Maximize2,
  AlertCircle,
  Reply,
  Copy,
  Check,
} from 'lucide-react';
import { useServerStore } from '../../stores/server.store';
import { useAuthStore } from '../../stores/auth.store';
import { useChatStore } from '../../stores/chat.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { ScreenStage } from '../stage/ScreenStage';
import { getApiBase } from '../../lib/api';

interface ChatStageProps {
  onToggleMembers: () => void;
  isMembersOpen: boolean;
  onOpenScreenShareModal: () => void;
  onOpenSettings: () => void;
  onOpenInvite: () => void;
  onOpenServers: () => void;
}

const APPLE_EMOJIS = {
  smileys: [
    '😀', '😃', '😄', '😁', '😆', '🥹', '😅', '😂', '🤣', '🥲', '☺️', '😊', '😇',
    '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '🤨',
    '🧐', '🤓', '😎', '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁',
    '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳',
    '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🫣', '🤭', '🫢', '🤫',
    '🫡', '🤥', '😶', '😐', '😑', '😬', '🫨', '🫠', '🙄', '😯', '😦', '😮', '😲',
    '🥱', '😴', '🤤', '😪', '😵', '😵‍💫', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒',
  ],
  gestures: [
    '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌', '🤌', '🤏', '✌️',
    '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵', '👍',
    '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️',
    '💅', '🤳', '💪', '🦾', '🦵', '🦶', '👂', '👃', '👀', '👁️', '👅', '👄', '🫦',
  ],
  hearts: [
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️',
    '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '✨', '⭐️', '🌟', '💫', '🔥',
    '⚡️', '💥', '🫧', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '👑', '💎',
  ],
  vibes: [
    '🎧', '🎮', '🕹️', '🎤', '🎬', '🍿', '🎨', '🎯', '🎲', '🎰', '🎳', '🎼', '🎹',
    '🥁', '🎸', '🎺', '🎷', '🪗', '🪕', '🎻', '⚽️', '🏀', '🏈', '⚾️', '🎾', '🏐',
    '🏓', '🏸', '🥊', '🛹', '🚴', '🚀', '🛸', '🛰️', '🪐', '🌙', '☀️', '⛅️', '⚡️',
  ],
  food: [
    '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑',
    '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯',
    '🫔', '🥙', '🧆', '🍜', '🍝', '🍣', '🍱', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂',
    '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '☕️', '🧋', '🥤', '🧃', '🍺', '🍻', '🥂',
  ],
};

export const ChatStage: React.FC<ChatStageProps> = ({
  onToggleMembers,
  isMembersOpen,
  onOpenScreenShareModal,
  onOpenSettings,
  onOpenInvite,
  onOpenServers,
}) => {
  const {
    activeServerId,
    servers,
    activeChannelId,
    channels,
    members,
    addMention,
    clearMentions,
  } = useServerStore();

  const { user } = useAuthStore();
  const { messagesByChannel, loadMessages, sendMessage, uploadImage } = useChatStore();
  const { broadcastChatMessage } = useLiveKitStore();

  const [messageText, setMessageText] = useState('');
  const [viewMode, setViewMode] = useState<'chat' | 'stream'>('chat');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Reply & Copy State
  const [replyingTo, setReplyingTo] = useState<{ id: string; displayName: string; username: string; content: string } | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // Apple Emoji Picker State
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState<'smileys' | 'gestures' | 'hearts' | 'vibes' | 'food'>('smileys');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeServer = servers.find((s) => s.id === activeServerId) || null;
  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;

  const channelId = activeChannel?.id || '';
  const isVoiceChannel = activeChannel?.type === 'voice';

  // Load message history on channel change
  useEffect(() => {
    if (channelId) {
      loadMessages(channelId);
      clearMentions(channelId);

      if (isVoiceChannel) {
        setViewMode('stream');
      } else {
        setViewMode('chat');
      }
    }
  }, [channelId, isVoiceChannel]);

  const messages = (channelId && messagesByChannel[channelId]) || [];
  const filteredMessages = messages;

  // Auto scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Handle copy text to clipboard
  const handleCopyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageId(id);
    setTimeout(() => {
      setCopiedMessageId(null);
    }, 1500);
  };

  // Handle image upload selection
  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !channelId) return;

    // Reset input value so re-selecting same file works
    e.target.value = '';
    setUploadError(null);

    // Validate size (5MB max)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('Image file is too large. Maximum supported size is 5MB.');
      setTimeout(() => setUploadError(null), 4000);
      return;
    }

    // Validate format
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setUploadError('Invalid format: Only legitimate PNG, JPG, and JPEG images are allowed.');
      setTimeout(() => setUploadError(null), 4000);
      return;
    }

    setIsUploading(true);
    try {
      const uploadResult = await uploadImage(file);
      if (!uploadResult) {
        throw new Error('Image upload failed. Server rejected the file.');
      }

      const caption = messageText.trim();
      setMessageText('');

      const newMsg = await sendMessage(
        channelId,
        caption || file.name,
        uploadResult.url,
        file.type
      );

      if (newMsg) {
        await broadcastChatMessage(channelId, newMsg);
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Image upload failed');
      setTimeout(() => setUploadError(null), 4000);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageText.trim() || !user || !channelId) return;

    let content = messageText.trim();
    if (replyingTo) {
      content = `> 💬 Replying to @${replyingTo.displayName}: "${replyingTo.content.slice(0, 60)}${replyingTo.content.length > 60 ? '...' : ''}"\n\n${content}`;
      setReplyingTo(null);
    }

    setMessageText('');
    setIsEmojiPickerOpen(false);

    // Check for mentions: @username
    const mentionMatches = content.match(/@([a-zA-Z0-9_-]+)/g);
    if (mentionMatches && members.length > 0) {
      for (const rawMention of mentionMatches) {
        const usernameWithoutAt = rawMention.substring(1).toLowerCase();
        const targetMember = members.find(
          (m) => m.username.toLowerCase() === usernameWithoutAt
        );
        if (targetMember && targetMember.userId !== user.id) {
          addMention(channelId);
        }
      }
    }

    const newMsg = await sendMessage(channelId, content);
    if (newMsg) {
      await broadcastChatMessage(channelId, newMsg);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getFullAttachmentUrl = (url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${getApiBase()}${url}`;
  };

  // Render message content with highlighted @mentions and quote replies
  const renderMessageContent = (content: string) => {
    // Check for reply quote block
    const quoteMatch = content.match(/^> 💬 Replying to @([^:]+): "([^"]+)"\n\n([\s\S]*)$/);
    if (quoteMatch) {
      const [, quotedUser, quotedText, mainMessage] = quoteMatch;
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border-l-2 border-highlight text-[11px] text-white/70 italic max-w-lg">
            <Reply className="w-3 h-3 text-highlight shrink-0" />
            <span className="font-bold text-highlight">@{quotedUser}:</span>
            <span className="truncate">{quotedText}</span>
          </div>
          <div>{renderFormattedText(mainMessage)}</div>
        </div>
      );
    }

    return renderFormattedText(content);
  };

  const renderFormattedText = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_-]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const username = part.substring(1);
        const isMe = user?.username.toLowerCase() === username.toLowerCase();
        return (
          <span
            key={index}
            className={`inline-flex items-center px-1.5 py-0.5 rounded font-bold mx-0.5 ${
              isMe
                ? 'bg-highlight text-highlight-text shadow-sm'
                : 'bg-highlight/15 text-highlight hover:bg-highlight/25'
            }`}
          >
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="flex-1 h-full bg-bg-main flex flex-col relative overflow-hidden select-none">
      {/* Top Bar Header */}
      {(!isVoiceChannel || viewMode !== 'stream') && (
        <div className="h-12 px-5 border-b border-[#232428] flex items-center justify-between shrink-0 bg-[#0e0f11]/85 backdrop-blur-md z-10 select-none">
          {/* Left: Channel Name */}
          <div className="flex items-center gap-2 min-w-0">
            <Hash className="w-5 h-5 text-[#949ba4] shrink-0" />
            <span className="text-[14px] font-bold text-[#f2f3f5] tracking-wide truncate">
              {activeChannel ? activeChannel.name : 'select a channel'}
            </span>
            {activeServer && (
              <span className="text-[11px] text-[#949ba4] px-2 py-0.5 rounded-md bg-[#18191c] border border-[#232428] font-medium truncate max-w-[140px]">
                {activeServer.name}
              </span>
            )}
          </div>

          {/* Right Action: Toggle Member List */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onToggleMembers}
              className={`p-2 rounded-xl transition-all duration-200 active:scale-90 hover:scale-105 cursor-pointer ${
                isMembersOpen
                  ? 'text-white bg-[#35373c]/70 shadow-sm border border-[#35373c]'
                  : 'text-[#949ba4] hover:text-[#f2f3f5] hover:bg-[#35373c]/40'
              }`}
              title="Toggle Member List"
            >
              <Users className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area: Voice Stage or Text Chat */}
      {viewMode === 'stream' && isVoiceChannel ? (
        <ScreenStage
          onOpenScreenShareModal={onOpenScreenShareModal}
          onOpenSettings={onOpenSettings}
          onOpenInvite={onOpenInvite}
          onOpenServers={onOpenServers}
        />
      ) : (
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Scrollable Messages Container */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
            {!activeChannel ? (
              <div className="h-full flex flex-col items-center justify-center text-center select-none pb-12">
                <p className="text-xs text-text-secondary">Select a channel from the left sidebar to view messages.</p>
              </div>
            ) : filteredMessages.length === 0 ? (
              /* Sleek Discord-Native Empty State (No AI Sparkles) */
              <div className="h-full flex flex-col items-center justify-center text-center select-none pb-12 animate-in fade-in duration-200">
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-3xl bg-[#14161f] border border-white/10 flex items-center justify-center shadow-xl relative group">
                    <div className="w-13 h-13 rounded-2xl bg-highlight/15 border border-highlight/30 flex items-center justify-center text-highlight shadow-[0_0_24px_rgba(35,165,90,0.3)]">
                      <Hash className="w-8 h-8 stroke-[2.5]" />
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-black text-white tracking-wide mb-1">
                  Welcome to #{activeChannel.name}!
                </h3>
                <p className="text-xs text-text-secondary max-w-xs leading-relaxed">
                  This is the start of the #{activeChannel.name} channel. Send a message to start chatting!
                </p>
              </div>
            ) : (
              /* Real Message Feed */
              <div className="space-y-4">
                {filteredMessages.map((msg) => {
                  const isMe = msg.userId === user?.id;
                  const fullAttachment = msg.attachmentUrl ? getFullAttachmentUrl(msg.attachmentUrl) : null;

                  return (
                    <div
                      key={msg.id}
                      className="group flex items-start gap-3.5 py-1.5 px-2 -mx-2 rounded-xl hover:bg-bg-elevated/40 transition-colors relative"
                    >
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-highlight text-highlight-text border border-border flex items-center justify-center text-xs font-black shadow-sm shrink-0 mt-0.5 overflow-hidden">
                        {msg.avatarUrl ? (
                          <img
                            src={getFullAttachmentUrl(msg.avatarUrl)}
                            alt={msg.displayName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          (msg.displayName || msg.username || 'U').slice(0, 1).toUpperCase()
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span
                            className={`text-xs font-bold ${
                              isMe ? 'text-highlight' : 'text-text-primary'
                            }`}
                          >
                            {msg.displayName}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono">
                            @{msg.username}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>

                        {/* Content text */}
                        {msg.content && (
                          <div className="text-xs text-text-primary leading-relaxed break-words whitespace-pre-wrap select-text">
                            {renderMessageContent(msg.content)}
                          </div>
                        )}

                        {/* Attachment Image */}
                        {fullAttachment && (
                          <div
                            className="mt-2 relative inline-block max-w-sm rounded-xl overflow-hidden border border-border-subtle bg-bg-elevated group/img cursor-pointer shadow-md"
                            onClick={() => setLightboxUrl(fullAttachment)}
                            title="Click to view full image"
                          >
                            <img
                              src={fullAttachment}
                              alt="attachment"
                              className="max-h-72 w-auto object-cover rounded-xl group-hover/img:scale-[1.02] transition-transform duration-200"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                              <Maximize2 className="w-5 h-5 text-white drop-shadow" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Quick Action Toolbar on Hover: Reply & Copy */}
                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-[#151720] border border-white/10 rounded-lg p-0.5 shadow-lg z-10">
                        <button
                          type="button"
                          onClick={() => setReplyingTo({ id: msg.id, displayName: msg.displayName, username: msg.username, content: msg.content })}
                          className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-highlight transition-colors cursor-pointer"
                          title="Reply to message"
                        >
                          <Reply className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
                          title="Copy text"
                        >
                          {copiedMessageId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-[#23a55a]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Upload Error Banner */}
          {uploadError && (
            <div className="mx-6 mb-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Bottom Chat Input Form Area */}
          <div className="p-4 bg-bg-main relative">
            {/* Replying Banner Preview */}
            {replyingTo && (
              <div className="flex items-center justify-between px-4 py-2 mb-2 bg-[#141822] border border-highlight/30 rounded-2xl text-xs shadow-md animate-in fade-in duration-150">
                <div className="flex items-center gap-2 min-w-0">
                  <Reply className="w-3.5 h-3.5 text-highlight shrink-0" />
                  <span className="text-white/80 font-semibold">Replying to <span className="text-highlight">@{replyingTo.displayName}</span>:</span>
                  <span className="truncate text-white/40 italic text-[11px] max-w-[220px] sm:max-w-md">"{replyingTo.content}"</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="w-5 h-5 rounded-full hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Cancel reply"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png, image/jpeg, image/jpg"
              onChange={handleImageSelected}
              className="hidden"
            />

            {/* Apple iOS Emoji Picker Popup */}
            {isEmojiPickerOpen && (
              <div className="absolute right-6 bottom-18 w-80 bg-[#12151e]/98 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-3 z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
                {/* Categories Tab Bar */}
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1">
                    {(['smileys', 'gestures', 'hearts', 'vibes', 'food'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setEmojiCategory(cat)}
                        className={`px-2 py-0.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                          emojiCategory === cat
                            ? 'bg-highlight/20 text-highlight'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        {cat === 'smileys' ? '😀' : cat === 'gestures' ? '👋' : cat === 'hearts' ? '❤️' : cat === 'vibes' ? '🎧' : '🍔'}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEmojiPickerOpen(false)}
                    className="w-5 h-5 rounded-full hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {/* Emojis Grid (Apple typography) */}
                <div
                  className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto custom-scrollbar p-1 text-xl select-none"
                  style={{ fontFamily: '-apple-system, "Apple Color Emoji", "SF Pro", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}
                >
                  {APPLE_EMOJIS[emojiCategory].map((emoji, idx) => (
                    <button
                      key={`${emoji}-${idx}`}
                      type="button"
                      onClick={() => {
                        setMessageText((prev) => prev + emoji);
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 hover:scale-125 transition-all cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Form */}
            <form
              onSubmit={handleSend}
              className="relative flex items-center bg-bg-elevated border border-border-subtle focus-within:border-highlight rounded-full px-4 py-2.5 shadow-card transition-all"
            >
              {/* Left Plus Button -> Triggers Image file picker */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || !channelId}
                className="w-8 h-8 rounded-full bg-bg-main hover:bg-highlight hover:text-highlight-text border border-border-subtle flex items-center justify-center text-highlight transition-colors shrink-0 mr-3 shadow-sm disabled:opacity-50 cursor-pointer"
                title="Upload Image (PNG, JPG, JPEG)"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-highlight" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                disabled={!channelId}
                placeholder={
                  activeChannel
                    ? `Message #${activeChannel.name}... (type @username to mention)`
                    : 'Select a channel...'
                }
                className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none min-w-0"
              />

              {/* Right Action Icons: Emoji, Image file button, Send Button */}
              <div className="flex items-center gap-2.5 shrink-0 ml-3">
                <button
                  type="button"
                  className={`transition-colors p-1 cursor-pointer ${isEmojiPickerOpen ? 'text-highlight' : 'text-highlight hover:text-white'}`}
                  title="Apple Emojis"
                  onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                >
                  <Smile className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || !channelId}
                  className="text-highlight hover:text-white transition-colors p-1 disabled:opacity-50 cursor-pointer"
                  title="Upload Image (PNG, JPG, JPEG)"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>

                {/* Send Paperplane Button */}
                <button
                  type="submit"
                  disabled={!messageText.trim() || isUploading || !channelId}
                  className="w-8 h-8 rounded-full bg-highlight hover:bg-white text-highlight-text disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-md shrink-0 cursor-pointer"
                  title="Send Message"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal for full size attachments */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[85vh] bg-bg-elevated border border-border rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-bg-main/60">
              <span className="text-xs font-semibold text-text-secondary">Image Preview</span>
              <button
                onClick={() => setLightboxUrl(null)}
                className="w-7 h-7 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-primary flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center overflow-auto max-h-[calc(85vh-50px)]">
              <img
                src={lightboxUrl}
                alt="Enlarged"
                className="max-h-[75vh] w-auto object-contain rounded-lg shadow-inner"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
