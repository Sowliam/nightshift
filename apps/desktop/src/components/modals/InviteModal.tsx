import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Copy,
  Check,
  Link,
  Shield,
  Loader2,
  Trash2,
  LogIn,
  AlertCircle,
} from 'lucide-react';
import { useServerStore } from '../../stores/server.store';
import { ServerInviteDto } from '@nightshift/shared';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  onClose,
  initialCode = '',
}) => {
  const {
    activeServerId,
    servers,
    invites,
    fetchInvites,
    createInvite,
    revokeInvite,
    joinByInvite,
  } = useServerStore();

  const [activeTab, setActiveTab] = useState<'invite' | 'join'>(
    initialCode ? 'join' : 'invite'
  );
  const [createdInvite, setCreatedInvite] = useState<ServerInviteDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Invite creation options
  const [expiresInHours, setExpiresInHours] = useState<number>(72);
  const [maxUses, setMaxUses] = useState<number>(0);

  // Join input state
  const [joinInput, setJoinInput] = useState(initialCode);
  const [joinStatus, setJoinStatus] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const activeServer = servers.find((s) => s.id === activeServerId) || null;
  const isOwnerOrAdmin = activeServer?.role === 'owner' || activeServer?.role === 'admin';

  useEffect(() => {
    if (initialCode) {
      setJoinInput(initialCode);
      setActiveTab('join');
    }
  }, [initialCode]);

  useEffect(() => {
    if (isOpen && activeServerId) {
      fetchInvites(activeServerId);
      // Auto-generate or load default invite
      handleGenerateInvite();
    }
  }, [isOpen, activeServerId]);

  if (!isOpen) return null;

  const handleGenerateInvite = async () => {
    if (!activeServerId) return;
    setIsLoading(true);
    try {
      const invite = await createInvite(activeServerId, maxUses, expiresInHours);
      if (invite) {
        setCreatedInvite(invite);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const currentOrigin =
    typeof window !== 'undefined' &&
    window.location.origin &&
    !window.location.origin.startsWith('file:')
      ? window.location.origin
      : 'http://localhost:5173';

  const defaultInviteUrl = createdInvite
    ? `${currentOrigin}#invite=${createdInvite.code}`
    : '';

  const handleCopyLink = async () => {
    if (!defaultInviteUrl) return;
    await navigator.clipboard.writeText(defaultInviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleRevoke = async (code: string) => {
    if (!activeServerId) return;
    await revokeInvite(activeServerId, code);
    if (createdInvite?.code === code) {
      setCreatedInvite(null);
    }
  };

  const handleJoinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!joinInput.trim()) return;

    let cleanCode = joinInput.trim();
    if (cleanCode.includes('#invite=')) {
      cleanCode = cleanCode.split('#invite=')[1].split('&')[0];
    } else if (cleanCode.includes('/invite/')) {
      cleanCode = cleanCode.split('/invite/')[1].split('&')[0];
    }

    setIsJoining(true);
    setJoinStatus(null);
    try {
      const server = await joinByInvite(cleanCode);
      if (server) {
        setJoinStatus({
          success: true,
          message: `Successfully joined "${server.name}"!`,
        });
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setJoinStatus({
          success: false,
          message: 'Invalid, expired, or revoked invite code.',
        });
      }
    } catch (err: any) {
      setJoinStatus({
        success: false,
        message: err.message || 'Failed to join server using this invite.',
      });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-[540px] max-w-full bg-bg-secondary rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between shrink-0 bg-bg-secondary/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-bg-elevated border border-border-subtle flex items-center justify-center text-highlight">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">
                {activeTab === 'invite'
                  ? `Invite Friends to ${activeServer?.name || 'Server'}`
                  : 'Join a Server'}
              </h3>
              <p className="text-[11px] text-text-muted">
                {activeTab === 'invite'
                  ? 'Generate secure, unguessable invite links or codes'
                  : 'Enter a private invite code or paste a link from a friend'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border-subtle bg-bg-elevated/40 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('invite')}
            disabled={!activeServer}
            className={`flex-1 py-3 text-center transition-colors border-b-2 flex items-center justify-center gap-2 ${
              activeTab === 'invite'
                ? 'border-highlight text-highlight font-bold bg-bg-elevated/60'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create & Manage Invites</span>
          </button>

          <button
            onClick={() => setActiveTab('join')}
            className={`flex-1 py-3 text-center transition-colors border-b-2 flex items-center justify-center gap-2 ${
              activeTab === 'join'
                ? 'border-highlight text-highlight font-bold bg-bg-elevated/60'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Join with Code</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {activeTab === 'invite' ? (
            <>
              {/* Shareable Link Box */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center justify-between mb-2">
                  <span>Shareable Invite Link</span>
                  <span className="text-[10px] text-highlight font-normal">
                    Expires in {expiresInHours === 0 ? 'Never' : `${expiresInHours / 24} days`}
                  </span>
                </label>

                {isLoading ? (
                  <div className="h-10 rounded-xl bg-bg-elevated border border-border-subtle flex items-center justify-center gap-2 text-xs text-text-secondary">
                    <Loader2 className="w-4 h-4 animate-spin text-highlight" />
                    Generating secure invite code...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary font-mono truncate">
                      <Link className="w-3.5 h-3.5 text-text-muted shrink-0" />
                      <span className="truncate">{defaultInviteUrl || 'Generating...'}</span>
                    </div>
                    <button
                      onClick={handleCopyLink}
                      disabled={!defaultInviteUrl}
                      className="px-4 py-2 rounded-xl bg-highlight hover:bg-white text-highlight-text text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shrink-0 disabled:opacity-50"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedLink ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>

              {/* Private Code Badge */}
              {createdInvite && (
                <div className="p-3.5 rounded-xl bg-bg-elevated/70 border border-border-subtle flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-text-primary block">
                      Private Code:{' '}
                      <span className="font-mono text-highlight font-bold text-sm ml-1">
                        {createdInvite.code}
                      </span>
                    </span>
                    <span className="text-[11px] text-text-muted">
                      Direct 10-character code to share with friends
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopyCode(createdInvite.code)}
                    className="px-3 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-border-subtle text-xs font-semibold text-text-primary transition-all flex items-center gap-1"
                  >
                    {copiedCode ? <Check className="w-3 h-3 text-online" /> : <Copy className="w-3 h-3" />}
                    {copiedCode ? 'Copied' : 'Copy Code'}
                  </button>
                </div>
              )}

              {/* Configuration options for new invites */}
              {isOwnerOrAdmin && (
                <div className="p-4 rounded-xl bg-bg-elevated/40 border border-border-subtle space-y-3">
                  <div className="text-xs font-bold text-text-primary">
                    Invite Settings
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase block mb-1">
                        Expire After
                      </label>
                      <select
                        value={expiresInHours}
                        onChange={(e) => setExpiresInHours(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border-subtle text-text-primary text-xs focus:outline-none"
                      >
                        <option value={24}>24 Hours</option>
                        <option value={72}>3 Days</option>
                        <option value={168}>7 Days</option>
                        <option value={0}>Never</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-text-muted uppercase block mb-1">
                        Max Number of Uses
                      </label>
                      <select
                        value={maxUses}
                        onChange={(e) => setMaxUses(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border-subtle text-text-primary text-xs focus:outline-none"
                      >
                        <option value={0}>No limit</option>
                        <option value={1}>1 use</option>
                        <option value={5}>5 uses</option>
                        <option value={10}>10 uses</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateInvite}
                    disabled={isLoading}
                    className="w-full py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover text-text-primary border border-border-subtle font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    Generate New Link with Custom Options
                  </button>
                </div>
              )}

              {/* Active Invites List (Manage / Revoke) */}
              {isOwnerOrAdmin && invites.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    Active Server Invites ({invites.length})
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {invites.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-bg-elevated/50 border border-border-subtle text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-highlight">{inv.code}</span>
                          <span className="text-[10px] text-text-muted">
                            ({inv.usesCount} {inv.maxUses > 0 ? `/ ${inv.maxUses}` : ''} uses)
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopyCode(inv.code)}
                            className="p-1 text-text-muted hover:text-text-primary"
                            title="Copy Code"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRevoke(inv.code)}
                            className="p-1 text-destructive hover:bg-destructive/15 rounded"
                            title="Revoke / Delete Invite"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Tab 2: Join with Code */
            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-text-muted block mb-2">
                  Enter Invite Code or Link
                </label>
                <input
                  type="text"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  placeholder="e.g. k8X9mP21 or http://localhost:5173#invite=k8X9mP21"
                  className="w-full px-3 py-2.5 rounded-xl bg-bg-elevated border border-border-subtle focus:border-highlight text-xs text-text-primary placeholder:text-text-muted focus:outline-none font-mono"
                  autoFocus
                />
              </div>

              {joinStatus && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    joinStatus.success
                      ? 'bg-online/20 text-online border border-online/30 font-semibold'
                      : 'bg-destructive/20 text-destructive border border-destructive/30'
                  }`}
                >
                  {joinStatus.success ? (
                    <Check className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{joinStatus.message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!joinInput.trim() || isJoining}
                className="w-full py-2.5 rounded-xl bg-highlight hover:bg-white text-highlight-text font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Joining Server...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Join Server
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border-subtle bg-bg-secondary flex items-center justify-between text-xs text-text-muted shrink-0">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-highlight" />
            Encrypted Server Token
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover text-text-primary border border-border-subtle transition-colors text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
