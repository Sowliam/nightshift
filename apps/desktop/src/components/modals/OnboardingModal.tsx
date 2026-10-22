import React, { useState } from 'react';
import { ArrowRight, Loader2, Lock, User, AtSign, Server, Check } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { getApiBase, setApiBase } from '../../lib/api';

interface OnboardingModalProps {
  isOpen: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen }) => {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => getApiBase());
  const [serverSaved, setServerSaved] = useState(false);

  const { register, login } = useAuthStore();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();

    if (!cleanUsername) {
      setErrorMsg('Please enter a username');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);

    if (mode === 'register') {
      if (!cleanDisplayName) {
        setErrorMsg('Please enter a display name (nickname)');
        setIsSubmitting(false);
        return;
      }

      const ok = await register(cleanUsername, cleanDisplayName, password);
      if (!ok) {
        const err = useAuthStore.getState().error || 'Registration failed';
        setErrorMsg(err);
        if (err.includes('reach backend') || err.includes('Insecure Connection') || err.includes('connection error')) {
          setShowServerConfig(true);
        }
        setIsSubmitting(false);
      }
    } else {
      const ok = await login(cleanUsername, password);
      if (!ok) {
        const err = useAuthStore.getState().error || 'Invalid username or password';
        setErrorMsg(err);
        if (err.includes('reach backend') || err.includes('Insecure Connection') || err.includes('connection error')) {
          setShowServerConfig(true);
        }
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-[460px] max-w-full bg-bg-secondary rounded-2xl border border-border-subtle shadow-card flex flex-col overflow-hidden p-6 text-center">
        {/* Brand Logo */}
        <div className="w-16 h-16 rounded-2xl bg-bg-elevated border border-border-subtle flex items-center justify-center p-2.5 mx-auto mb-4 shadow-subtle">
          <img
            src="/logo.png"
            className="w-full h-full object-contain"
            alt="Nightshift Logo"
          />
        </div>

        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-1">
          {mode === 'register' ? 'Create an Account' : 'Welcome Back'}
        </h2>

        <p className="text-xs text-text-secondary mb-6 leading-relaxed">
          {mode === 'register'
            ? 'Set up your unique username and private identity on NIGHTSHIFT.'
            : 'Enter your credentials to access your servers and channels.'}
        </p>

        {/* Tab switch between Register and Login */}
        <div className="flex rounded-xl bg-bg-main p-1 border border-border-subtle mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'register'
                ? 'bg-highlight text-highlight-text shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'login'
                ? 'bg-highlight text-highlight-text shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Log In
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {/* Username Field */}
          <div>
            <label className="block text-xs font-bold tracking-wider text-text-secondary uppercase mb-1.5">
              Unique Username
            </label>
            <div className="relative">
              <input
                type="text"
                autoFocus
                placeholder="e.g. shadow_stalker"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight transition-all placeholder:text-text-muted font-mono"
              />
              <AtSign className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Display Name Field (Register only) */}
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-bold tracking-wider text-text-secondary uppercase mb-1.5">
                Display Name (Nickname)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Shadow"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight transition-all placeholder:text-text-muted"
                />
                <User className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Password Field */}
          <div>
            <label className="block text-xs font-bold tracking-wider text-text-secondary uppercase mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight transition-all placeholder:text-text-muted font-mono"
              />
              <Lock className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>

          {errorMsg && (
            <div className="text-xs text-destructive font-medium px-1 bg-destructive/10 p-2 rounded-lg border border-destructive/20">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !username.trim() || !password}
            className="w-full py-2.5 rounded-xl bg-highlight hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-highlight-text font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-highlight-text" />
                Authenticating...
              </>
            ) : (
              <>
                {mode === 'register' ? 'Register & Continue' : 'Sign In'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Server Connection Info */}
          <div className="mt-3 pt-3 border-t border-border-subtle flex flex-col items-center gap-1.5 text-[11px] text-text-muted">
            {!showServerConfig ? (
              <button
                type="button"
                onClick={() => setShowServerConfig(true)}
                className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors hover:underline"
              >
                <Server className="w-3 h-3 text-text-muted" />
                <span>Backend: <span className="font-mono text-highlight font-semibold">{serverUrl}</span></span>
              </button>
            ) : (
              <div className="w-full flex flex-col gap-1.5 mt-1 bg-bg-elevated p-2.5 rounded-xl border border-border-subtle text-left">
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">
                  Backend API URL
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-bg-main border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setApiBase(serverUrl);
                      setServerSaved(true);
                      setTimeout(() => setServerSaved(false), 2000);
                      setShowServerConfig(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-highlight text-highlight-text font-bold text-xs flex items-center gap-1 shadow-sm"
                  >
                    <Check className="w-3 h-3" />
                    Save
                  </button>
                </div>
              </div>
            )}
            {serverSaved && (
              <span className="text-[10px] text-accent font-semibold">Server URL saved!</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
