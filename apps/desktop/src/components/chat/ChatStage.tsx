import React, { useState, useEffect, useRef } from 'react';
import {
  Hash,
  Users,
  Search,
  Plus,
  Smile,
  Image as ImageIcon,
  Send,
  Radio,
  MessageSquare,
  Sparkles,
  Loader2,
  X,
  Maximize2,
  AlertCircle,
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
  const { broadcastChatMessage, activeScreenTrack } = useLiveKitStore();

  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'chat' | 'stream'>('chat');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeServer = servers.find((s) => s.id === activeServerId) || null;
  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;

  const channelId = activeChannel?.id || '';
  const isVoiceChannel = activeChannel?.type === 'voice';
  const isStreaming = !!activeScreenTrack;

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

  // Filter messages by search if search query typed
  const filteredMessages = searchQuery.trim()
    ? messages.filter(
        (m) =>
          m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  // Auto scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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

    const content = messageText.trim();
    setMessageText('');

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

  // Render message content with highlighted @mentions
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(@[a-zA-Z0-9_-]+)/g);
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
      <div className="h-14 px-6 border-b border-border-subtle flex items-center justify-between shrink-0 bg-bg-secondary/40 backdrop-blur-md z-10">
        {/* Left: Channel Name */}
        <div className="flex items-center gap-2 min-w-0">
          {isVoiceChannel ? (
            <Radio className="w-5 h-5 text-highlight animate-pulse shrink-0" />
          ) : (
            <Hash className="w-5 h-5 text-text-muted shrink-0" />
          )}
          <span className="text-sm font-bold text-text-primary tracking-wide truncate">
            {activeChannel ? activeChannel.name : 'select a channel'}
          </span>
          {activeServer && (
            <span className="text-[11px] text-text-muted px-2 py-0.5 rounded bg-bg-elevated border border-border-subtle font-medium truncate max-w-[120px]">
              {activeServer.name}
            </span>
          )}

          {/* Voice Room / Chat Toggle */}
          {isVoiceChannel && (
            <div className="ml-4 flex items-center gap-1 p-0.5 rounded-lg bg-bg-elevated border border-border-subtle text-xs">
              <button
                onClick={() => setViewMode('stream')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
                  viewMode === 'stream'
                    ? 'bg-highlight text-highlight-text font-bold shadow-sm'
                    : 'text-text-secondary hover:text-highlight'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                Voice Stage {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-online animate-ping" />}
              </button>
              <button
                onClick={() => setViewMode('chat')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
                  viewMode === 'chat'
                    ? 'bg-highlight text-highlight-text font-bold shadow-sm'
                    : 'text-text-secondary hover:text-highlight'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Chat
              </button>
            </div>
          )}
        </div>

        {/* Right Action Icons & Search */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onToggleMembers}
            className={`p-1.5 rounded-lg transition-colors ${
              isMembersOpen
                ? 'text-highlight bg-bg-elevated border border-border-subtle'
                : 'text-text-secondary hover:text-highlight hover:bg-bg-elevated'
            }`}
            title="Toggle Member List"
          >
            <Users className="w-4 h-4" />
          </button>

          {/* Search Bar */}
          <div className="relative flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-40 focus:w-56 h-8 pl-8 pr-3 rounded-xl bg-bg-elevated border border-border-subtle focus:border-highlight text-xs text-text-primary placeholder:text-text-muted focus:outline-none transition-all"
            />
            <Search className="w-3.5 h-3.5 text-highlight absolute left-2.5 pointer-events-none" />
          </div>
        </div>
      </div>

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
          {/* Error Banner for file upload failures */}
          {uploadError && (
            <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-destructive/90 text-white text-xs font-semibold flex items-center gap-2 shadow-card z-20 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
            {!activeChannel ? (
              <div className="h-full flex flex-col items-center justify-center text-center select-none pb-12">
                <p className="text-xs text-text-secondary">Select a channel from the left sidebar to view messages.</p>
              </div>
            ) : filteredMessages.length === 0 ? (
              /* Empty state */
              <div className="h-full flex flex-col items-center justify-center text-center select-none pb-12">
                <div className="relative mb-5">
                  <div className="w-20 h-20 rounded-3xl bg-bg-elevated border border-border flex items-center justify-center shadow-lg relative">
                    <svg
                      className="w-10 h-10 text-highlight"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                      <path d="M8 12h.01" />
                      <path d="M12 12h.01" />
                      <path d="M16 12h.01" />
                    </svg>
                    <Sparkles className="w-5 h-5 text-highlight absolute -top-1.5 -right-1.5 animate-pulse" />
                  </div>
                </div>

                <h3 className="text-base font-bold text-text-primary tracking-wide mb-1.5">
                  No messages yet
                </h3>
                <p className="text-xs text-text-secondary max-w-xs leading-relaxed">
                  Be the first to start the conversation in #{activeChannel.name}.
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
                      className="group flex items-start gap-3.5 py-1.5 px-2 -mx-2 rounded-xl hover:bg-bg-elevated/40 transition-colors"
                    >
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-highlight text-highlight-text border border-border flex items-center justify-center text-xs font-black shadow-sm shrink-0 mt-0.5">
                        {(msg.displayName || msg.username || 'U').slice(0, 1).toUpperCase()}
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
                          <p className="text-xs text-text-primary leading-relaxed break-words whitespace-pre-wrap select-text">
                            {renderMessageContent(msg.content)}
                          </p>
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
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Floating Rounded Pill Chat Input */}
          <div className="px-6 pb-6 pt-2 shrink-0">
            {/* Hidden File Input for strict Image Upload */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png, image/jpeg, image/jpg"
              onChange={handleImageSelected}
              className="hidden"
            />

            <form
              onSubmit={handleSend}
              className="relative flex items-center bg-bg-elevated border border-border-subtle focus-within:border-highlight rounded-full px-4 py-2.5 shadow-card transition-all"
            >
              {/* Left Plus Button -> Strictly triggers Image file picker */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || !channelId}
                className="w-8 h-8 rounded-full bg-bg-main hover:bg-highlight hover:text-highlight-text border border-border-subtle flex items-center justify-center text-highlight transition-colors shrink-0 mr-3 shadow-sm disabled:opacity-50"
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

              {/* Right Action Icons: Smile, Image file button, Send Button */}
              <div className="flex items-center gap-2.5 shrink-0 ml-3">
                <button
                  type="button"
                  className="text-highlight hover:text-white transition-colors p-1"
                  title="Emoji"
                  onClick={() => setMessageText((prev) => prev + ' 😊')}
                >
                  <Smile className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || !channelId}
                  className="text-highlight hover:text-white transition-colors p-1 disabled:opacity-50"
                  title="Upload Image (PNG, JPG, JPEG)"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>

                {/* Send Paperplane Button */}
                <button
                  type="submit"
                  disabled={!messageText.trim() || isUploading || !channelId}
                  className="w-8 h-8 rounded-full bg-highlight hover:bg-white text-highlight-text disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-md shrink-0"
                  title="Send Message"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Image Preview Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 select-none animate-fade-in"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-10 right-0 text-text-secondary hover:text-white transition-colors p-1"
              title="Close Preview"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={lightboxUrl}
              alt="Full size attachment"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-border-subtle"
            />
            <div className="mt-3 flex items-center gap-3">
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-highlight hover:underline font-semibold"
              >
                Open Original in Browser
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
