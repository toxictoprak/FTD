import { useState, type FormEvent } from 'react';
import { Lock, ShieldCheck, X } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';

interface AdminLoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminLoginModal({ open, onClose, onSuccess }: AdminLoginModalProps) {
  const { state, setAdminToken, apiRequest, refreshState } = usePlatform();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isSetupMode = state ? !state.authMeta.adminConfigured && !state.authMeta.envControlled : false;

  const handleDigit = (d: string) => {
    setError(null);
    if (pin.length < 4) {
      setPin((p) => p + d);
    }
  };

  const handleBackspace = () => {
    setError(null);
    setPin((p) => p.slice(0, -1));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(pin)) {
      setError('Please enter a 4-digit numeric access code.');
      return;
    }

    if (isSetupMode && pin !== confirmPin) {
      setError('Access codes do not match.');
      return;
    }

    setSubmitting(true);
    const endpoint = isSetupMode ? '/api/admin/setup' : '/api/admin/login';
    const res = await apiRequest<{ token: string }>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
    setSubmitting(false);

    if (!res.ok || !res.data?.token) {
      setError(res.error || 'Authentication failed.');
      return;
    }

    setAdminToken(res.data.token);
    setPin('');
    setConfirmPin('');
    await refreshState();
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-xl bg-[#0D1017] border border-white/15 shadow-2xl p-6 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-md cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-white text-black flex items-center justify-center shrink-0">
            {isSetupMode ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
              {isSetupMode ? 'Create 4-Digit Admin Code' : 'FTD Admin Access'}
            </h2>
            <p className="text-xs text-zinc-400">
              {isSetupMode
                ? 'First-run setup: define your server-encrypted 4-digit admin PIN.'
                : 'Enter your 4-digit access code to unlock live controls.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              {isSetupMode ? 'New 4-Digit Access Code' : '4-Digit Access Code'}
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                setError(null);
                setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
              }}
              placeholder="••••"
              autoFocus
              className="w-full px-4 py-3 text-center font-mono text-2xl tracking-[0.65em] bg-[#06080C] border border-white/15 rounded-lg text-white focus:outline-none focus:border-white"
            />
          </div>

          {isSetupMode && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-2">
                Confirm 4-Digit Access Code
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => {
                  setError(null);
                  setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                }}
                placeholder="••••"
                className="w-full px-4 py-3 text-center font-mono text-2xl tracking-[0.65em] bg-[#06080C] border border-white/15 rounded-lg text-white focus:outline-none focus:border-white"
              />
            </div>
          )}

          {!isSetupMode && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Del'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (key === 'Clear') {
                      setPin('');
                    } else if (key === 'Del') {
                      handleBackspace();
                    } else {
                      handleDigit(key);
                    }
                  }}
                  className="py-2.5 rounded-md bg-white/5 hover:bg-white/15 text-sm font-mono font-semibold text-white transition-colors cursor-pointer"
                >
                  {key}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-md bg-red-500/15 border border-red-500/40 text-xs text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || pin.length !== 4}
            className="w-full py-3 rounded-lg bg-white text-black font-semibold text-sm hover:bg-zinc-200 disabled:opacity-40 transition-colors cursor-pointer"
          >
            {submitting
              ? 'Verifying...'
              : isSetupMode
              ? 'Save Admin Code & Unlock'
              : 'Unlock Admin Panel'}
          </button>
        </form>
      </div>
    </div>
  );
}
