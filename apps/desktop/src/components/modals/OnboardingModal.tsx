import React, { useState } from 'react';
import { ArrowRight, Loader2, Lock, User, AtSign, Server, Check } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { getApiBase, setApiBase } from '../../lib/api';

interface OnboardingModalProps {
  isOpen: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
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

  const handleAuthSubmit = async (e: React.FormEvent, targetMode: 'login' | 'register') => {
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

    if (targetMode === 'register') {
      if (!cleanDisplayName) {
        setErrorMsg('Please enter a nickname / display name');
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

  const isFlipped = mode === 'register';

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="flex flex-col items-center">
        {/* Sleek Toggle Switch on Top */}
        <div className="flex items-center gap-4 mb-4 z-10">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
            }}
            className={`text-xs font-bold tracking-wide transition-all cursor-pointer ${
              !isFlipped
                ? 'text-white underline underline-offset-4 decoration-accent-bright decoration-2 drop-shadow-[0_0_8px_rgba(35,165,90,0.5)]'
                : 'text-text-muted hover:text-white'
            }`}
          >
            Log in
          </button>

          {/* Toggle Slider Pill */}
          <button
            type="button"
            role="switch"
            aria-checked={isFlipped}
            onClick={() => {
              setMode(isFlipped ? 'login' : 'register');
              setErrorMsg(null);
            }}
            className="w-12 h-6 rounded-full bg-[#18191d] border border-white/10 p-0.5 cursor-pointer relative transition-colors hover:border-white/20 shadow-inner focus:outline-none"
            title="Toggle between Log in and Sign up"
          >
            <div
              className={`w-4.5 h-4.5 rounded-full bg-accent-bright shadow-[0_0_10px_rgba(35,165,90,0.6)] transition-all duration-300 transform ${
                isFlipped ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
            }}
            className={`text-xs font-bold tracking-wide transition-all cursor-pointer ${
              isFlipped
                ? 'text-white underline underline-offset-4 decoration-accent-bright decoration-2 drop-shadow-[0_0_8px_rgba(35,165,90,0.5)]'
                : 'text-text-muted hover:text-white'
            }`}
          >
            Sign up
          </button>
        </div>

        {/* 3D Flip Card Container */}
        <div className="auth-flip-container">
          <div className={`auth-flip-inner ${isFlipped ? 'is-flipped' : ''}`}>
            {/* FRONT FACE: LOG IN */}
            <div
              className={`auth-flip-face auth-flip-front bg-[#121316]/95 backdrop-blur-xl border border-white/10 shadow-[0_25px_65px_rgba(0,0,0,0.85)] p-6 flex flex-col justify-between overflow-hidden ${
                isFlipped ? 'pointer-events-none' : ''
              }`}
            >
              {/* Header */}
              <div className="flex flex-col items-center text-center">
                <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-1.5 shadow-sm">
                  <img src="/logo.png" className="w-full h-full object-contain" alt="Nightshift" />
                </div>
                <h3 className="text-base font-black text-white tracking-wide mt-2">Welcome Back</h3>
                <p className="text-[11px] text-text-muted mt-0.5">Enter your credentials to access NIGHTSHIFT</p>
              </div>

              {/* Login Form */}
              <form onSubmit={(e) => handleAuthSubmit(e, 'login')} className="space-y-3.5 my-auto text-left">
                {/* Username */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">
                    Username
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      autoFocus={!isFlipped}
                      placeholder="e.g. shadow_stalker"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#18191e] border border-white/10 text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-accent-bright focus:ring-1 focus:ring-accent-bright/30 transition-all font-mono"
                    />
                    <AtSign className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#18191e] border border-white/10 text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-accent-bright focus:ring-1 focus:ring-accent-bright/30 transition-all font-mono"
                    />
                    <Lock className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {errorMsg && !isFlipped && (
                  <div className="text-[11px] text-rose-400 font-semibold px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center animate-in fade-in">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !username.trim() || !password}
                  className="w-full py-2.5 rounded-xl bg-accent-bright hover:bg-white text-black font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-accent-bright/15 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed mt-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Card Footer */}
              <div className="text-center pt-2 border-t border-white/5">
                <p className="text-[11px] text-text-muted">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setErrorMsg(null);
                    }}
                    className="text-accent-bright font-bold hover:underline cursor-pointer"
                  >
                    Sign up
                  </button>
                </p>
              </div>
            </div>

            {/* BACK FACE: SIGN UP */}
            <div
              className={`auth-flip-face auth-flip-back bg-[#121316]/95 backdrop-blur-xl border border-white/10 shadow-[0_25px_65px_rgba(0,0,0,0.85)] p-6 flex flex-col justify-between overflow-hidden ${
                !isFlipped ? 'pointer-events-none' : ''
              }`}
            >
              {/* Header */}
              <div className="flex flex-col items-center text-center">
                <div className="w-9 h-9 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-1.5 shadow-sm">
                  <img src="/logo.png" className="w-full h-full object-contain" alt="Nightshift" />
                </div>
                <h3 className="text-base font-black text-white tracking-wide mt-2">Create Account</h3>
                <p className="text-[11px] text-text-muted mt-0.5">Join the private NIGHTSHIFT voice network</p>
              </div>

              {/* Register Form */}
              <form onSubmit={(e) => handleAuthSubmit(e, 'register')} className="space-y-2.5 my-auto text-left">
                {/* Username */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">
                    Username
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      autoFocus={isFlipped}
                      placeholder="e.g. ghost_operator"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#18191e] border border-white/10 text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-accent-bright focus:ring-1 focus:ring-accent-bright/30 transition-all font-mono"
                    />
                    <AtSign className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2 pointer-events-none" />
                  </div>
                </div>

                {/* Nickname / Display Name */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">
                    Display Name (Nickname)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. Ghost"
                      value={displayName}
                      onChange={(e) => {
                        setDisplayName(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#18191e] border border-white/10 text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-accent-bright focus:ring-1 focus:ring-accent-bright/30 transition-all"
                    />
                    <User className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2 pointer-events-none" />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">
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
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#18191e] border border-white/10 text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-accent-bright focus:ring-1 focus:ring-accent-bright/30 transition-all font-mono"
                    />
                    <Lock className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2 pointer-events-none" />
                  </div>
                </div>

                {errorMsg && isFlipped && (
                  <div className="text-[11px] text-rose-400 font-semibold px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center animate-in fade-in">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !username.trim() || !displayName.trim() || !password}
                  className="w-full py-2.5 rounded-xl bg-accent-bright hover:bg-white text-black font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-accent-bright/15 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed mt-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Card Footer */}
              <div className="text-center pt-2 border-t border-white/5">
                <p className="text-[11px] text-text-muted">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMsg(null);
                    }}
                    className="text-accent-bright font-bold hover:underline cursor-pointer"
                  >
                    Log in
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Server Connection Config (Minimalist & Unobtrusive) */}
        <div className="mt-4 flex flex-col items-center text-[11px] text-text-muted">
          {!showServerConfig ? (
            <button
              type="button"
              onClick={() => setShowServerConfig(true)}
              className="flex items-center gap-1.5 text-text-muted hover:text-white transition-colors cursor-pointer opacity-75 hover:opacity-100"
            >
              <Server className="w-3 h-3 text-text-muted" />
              <span>
                Backend:{' '}
                <span className="font-mono text-accent-bright font-semibold">
                  {serverUrl.replace(/^https?:\/\//, '')}
                </span>
              </span>
            </button>
          ) : (
            <div className="w-[320px] flex flex-col gap-1.5 bg-[#141518] p-2.5 rounded-xl border border-white/10 text-left shadow-lg animate-in fade-in">
              <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider">
                Backend API URL
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#18191e] border border-white/10 text-xs text-white focus:outline-none focus:border-accent-bright font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    setApiBase(serverUrl);
                    setServerSaved(true);
                    setTimeout(() => setServerSaved(false), 2000);
                    setShowServerConfig(false);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-accent-bright text-black font-bold text-xs flex items-center gap-1 shadow-sm hover:bg-white cursor-pointer"
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                  Save
                </button>
              </div>
            </div>
          )}
          {serverSaved && (
            <span className="text-[10px] text-accent-bright font-semibold mt-1">Server URL saved!</span>
          )}
        </div>
      </div>
    </div>
  );
};
