import React, { useState } from 'react';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';

interface OnboardingModalProps {
  isOpen: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setErrorMsg('Username can only contain English letters, numbers, and underscores');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters');
      return;
    }

    if (targetMode === 'register') {
      if (!cleanDisplayName) {
        setErrorMsg('Please enter a nickname / display name');
        return;
      }

      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match / تکرار رمز عبور یکسان نیست');
        return;
      }

      setIsSubmitting(true);
      const ok = await register(cleanUsername, cleanDisplayName, password);
      if (!ok) {
        const err = useAuthStore.getState().error || 'Registration failed';
        setErrorMsg(err);
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(true);
      const ok = await login(cleanUsername, password);
      if (!ok) {
        const err = useAuthStore.getState().error || 'Invalid username or password';
        setErrorMsg(err);
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="wrapper">
        <div className="card-switch">
          <div className="switch">
            <input
              id="auth-mode-toggle"
              className="toggle"
              type="checkbox"
              checked={mode === 'register'}
              onChange={(e) => {
                setMode(e.target.checked ? 'register' : 'login');
                setErrorMsg(null);
                setConfirmPassword('');
              }}
            />
            <label htmlFor="auth-mode-toggle" className="slider" title="Toggle Log in / Sign up"></label>
            <label htmlFor="auth-mode-toggle" className="card-side"></label>
            <div className="flip-card__inner">
              {/* Log in Front Card */}
              <div className="flip-card__front">
                <div className="title">Log in</div>
                <form onSubmit={(e) => handleAuthSubmit(e, 'login')} className="flip-card__form">
                  <input
                    type="text"
                    placeholder="Username"
                    name="username"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    className="flip-card__input"
                    autoFocus={mode === 'login'}
                    required
                  />
                  <div className="relative w-[250px]">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
                      name="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className="flip-card__input pr-9 !w-full"
                      required
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPassword((prev) => !prev); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors p-1"
                      tabIndex={-1}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errorMsg && mode === 'login' && (
                    <div className="text-[11px] text-rose-400 font-semibold px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-center max-w-[250px]">
                      {errorMsg}
                    </div>
                  )}
                  <button type="submit" disabled={isSubmitting} className="flip-card__btn">
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Let's go!"
                    )}
                  </button>
                </form>
              </div>

              {/* Sign up Back Card */}
              <div className="flip-card__back">
                <div className="title">Sign up</div>
                <form onSubmit={(e) => handleAuthSubmit(e, 'register')} className="flip-card__form">
                  <input
                    type="text"
                    placeholder="Name"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    className="flip-card__input"
                    autoFocus={mode === 'register'}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Username"
                    name="username"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    className="flip-card__input"
                    required
                  />
                  <div className="relative w-[250px]">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
                      name="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className="flip-card__input pr-9 !w-full"
                      required
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPassword((prev) => !prev); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors p-1"
                      tabIndex={-1}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="relative w-[250px]">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm Password"
                      name="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className="flip-card__input pr-9 !w-full"
                      required
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowConfirmPassword((prev) => !prev); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors p-1"
                      tabIndex={-1}
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errorMsg && mode === 'register' && (
                    <div className="text-[11px] text-rose-400 font-semibold px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-center max-w-[250px]">
                      {errorMsg}
                    </div>
                  )}
                  <button type="submit" disabled={isSubmitting} className="flip-card__btn">
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Confirm!'
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
