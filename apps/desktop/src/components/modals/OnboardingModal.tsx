import React, { useState } from 'react';
import { ShieldCheck, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';

interface OnboardingModalProps {
  isOpen: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen }) => {
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { register } = useAuthStore();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a display name');
      return;
    }
    if (trimmed.length < 2) {
      setErrorMsg('Display name must be at least 2 characters');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const success = await register(trimmed);
    if (!success) {
      setErrorMsg('Failed to set up identity. Please ensure the backend is running.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-[440px] max-w-full bg-bg-secondary rounded-2xl border border-border-subtle shadow-card flex flex-col overflow-hidden p-6 text-center">
        {/* Brand Icon */}
        <div className="w-14 h-14 rounded-2xl bg-bg-elevated border border-border-subtle flex items-center justify-center text-accent mx-auto mb-4 shadow-subtle">
          <ShieldCheck className="w-8 h-8" />
        </div>

        <h2 className="text-lg font-bold text-text-primary tracking-wide mb-1">
          Welcome to NIGHTSHIFT
        </h2>

        <p className="text-xs text-text-secondary mb-6 leading-relaxed">
          A private, low-latency voice and screen-sharing network for your inner circle. Choose your display name to start.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-bold tracking-wider text-text-secondary uppercase mb-2">
              Your Display Name
            </label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Ghost, Kian, Shadow"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg-elevated border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-muted"
            />
          </div>

          {errorMsg && (
            <div className="text-xs text-destructive font-medium px-1">{errorMsg}</div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !displayName.trim()}
            className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-bg-main font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-bg-main" />
                Initializing Comms...
              </>
            ) : (
              <>
                Enter NIGHTSHIFT
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-border-subtle/80 flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span>No passwords or trackable accounts required</span>
        </div>
      </div>
    </div>
  );
};
