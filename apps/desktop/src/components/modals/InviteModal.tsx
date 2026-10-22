import React, { useState, useEffect } from 'react';
import { X, UserPlus, Copy, Check, Link, Shield, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useRoomStore } from '../../stores/room.store';
import { useAuthStore } from '../../stores/auth.store';
import { InvitationDto } from '@nightshift/shared';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose }) => {
  const [invitation, setInvitation] = useState<InvitationDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [claimCodeInput, setClaimCodeInput] = useState('');
  const [claimStatus, setClaimStatus] = useState<string | null>(null);

  const { selectedRoomId, getSelectedRoom } = useRoomStore();
  const { user } = useAuthStore();
  const selectedRoom = getSelectedRoom();

  const generateInvite = async () => {
    setIsLoading(true);
    try {
      const invite = await api.createInvitation(selectedRoomId || undefined, user?.deviceId);
      setInvitation(invite);
    } catch (err: any) {
      console.error('Failed to create invitation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      generateInvite();
      setClaimCodeInput('');
      setClaimStatus(null);
    }
  }, [isOpen, selectedRoomId]);

  if (!isOpen) return null;

  const inviteUrl = invitation
    ? `${window.location.origin}#invite=${invitation.code}`
    : '';

  const handleCopyLink = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = async () => {
    if (!invitation) return;
    await navigator.clipboard.writeText(invitation.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleValidateCode = async () => {
    if (!claimCodeInput.trim()) return;
    try {
      const res = await api.validateInvitation(claimCodeInput.trim());
      if (res.valid) {
        setClaimStatus(`Invitation valid! Associated with: ${res.roomName || 'All Space'}`);
      } else {
        setClaimStatus(`Invalid invitation: ${res.reason || 'Expired'}`);
      }
    } catch {
      setClaimStatus('Could not validate invitation');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-[520px] max-w-full bg-bg-secondary rounded-2xl border border-border-subtle shadow-card flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-bg-elevated border border-border-subtle flex items-center justify-center text-accent">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Invite Friends to NIGHTSHIFT
              </h3>
              <p className="text-xs text-text-secondary">
                {selectedRoom
                  ? `Invite link for "${selectedRoom.name}"`
                  : 'Private community invitation'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Generated Link */}
          <div>
            <label className="block text-xs font-bold tracking-wider text-text-secondary uppercase mb-2">
              Shareable Invitation Link
            </label>

            {isLoading ? (
              <div className="h-10 rounded-xl bg-bg-elevated border border-border-subtle flex items-center justify-center gap-2 text-xs text-text-secondary">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                Generating secure token...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary font-mono truncate">
                  <Link className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  <span className="truncate">{inviteUrl}</span>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-bg-main text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shrink-0"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>

          {/* Quick Code Badge */}
          {invitation && (
            <div className="p-3.5 rounded-xl bg-bg-elevated/60 border border-border-subtle flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-text-primary block">
                  Private Code:{' '}
                  <span className="font-mono text-accent font-semibold ml-1">
                    {invitation.code}
                  </span>
                </span>
                <span className="text-[11px] text-text-muted">
                  Valid for 72 hours • Max 20 uses
                </span>
              </div>
              <button
                onClick={handleCopyCode}
                className="px-3 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-border-subtle hover:border-accent text-xs font-medium text-text-primary transition-all flex items-center gap-1"
              >
                {copiedCode ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3" />}
                {copiedCode ? 'Copied' : 'Copy Code'}
              </button>
            </div>
          )}

          <div className="w-full h-[1px] bg-border-subtle" />

          {/* Manual Code Validation Input */}
          <div>
            <label className="block text-xs font-bold tracking-wider text-text-secondary uppercase mb-2">
              Have an invite code?
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Paste code (e.g. k8X9mP21)"
                value={claimCodeInput}
                onChange={(e) => setClaimCodeInput(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-accent font-mono"
              />
              <button
                onClick={handleValidateCode}
                className="px-4 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-border-subtle hover:border-accent text-xs font-medium text-text-primary transition-colors"
              >
                Verify
              </button>
            </div>
            {claimStatus && (
              <span className="text-xs text-accent mt-2 block font-medium">{claimStatus}</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-subtle bg-bg-secondary flex items-center justify-between text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-accent" />
            End-to-End Cryptographic Token
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover text-text-primary border border-border-subtle transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
