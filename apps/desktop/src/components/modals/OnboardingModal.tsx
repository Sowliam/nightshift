import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';

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
        setIsSubmitting(false);
      }
    } else {
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
      <div className="wrapper pt-[210px]">
        <div className="card-switch">
          <label className="switch">
            <input
              className="toggle"
              type="checkbox"
              checked={mode === 'register'}
              onChange={(e) => {
                setMode(e.target.checked ? 'register' : 'login');
                setErrorMsg(null);
              }}
            />
            <span className="slider"></span>
            <span className="card-side"></span>
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
                  <input
                    type="password"
                    placeholder="Password"
                    name="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    className="flip-card__input"
                    required
                  />
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
                  <input
                    type="password"
                    placeholder="Password"
                    name="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    className="flip-card__input"
                    required
                  />
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
          </label>
        </div>
      </div>
    </div>
    );
  };
