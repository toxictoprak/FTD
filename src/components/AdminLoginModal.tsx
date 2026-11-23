import { useState } from 'react';
import { Globe, Lock, ShieldCheck, X } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';

interface AdminLoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminLoginModal({ open, onClose, onSuccess }: AdminLoginModalProps) {
  const { signInWithGoogle, isAdmin, adminEmail } = usePlatform();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleGoogleLogin = async () => {
    setError(null);
    setSubmitting(true);
    const res = await signInWithGoogle();
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error || 'Authentication failed.');
      return;
    }

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
            {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase">
              FTD Global Admin Access
            </h2>
            <p className="text-xs text-zinc-400">
              Sign in with your verified Google admin account to publish changes worldwide in real time.
            </p>
          </div>
        </div>

        <div className="space-y-4 mt-6">
          <div className="rounded-lg bg-[#06080C] border border-white/10 p-3.5 text-xs text-zinc-300 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Worldwide Real-Time Database Sync</span>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              Every update made to the live scoreboard, Discord/stream feed, Ballon d&apos;Or, or homepage syncs immediately to all visitors globally.
            </p>
          </div>

          {isAdmin && adminEmail ? (
            <div className="space-y-3">
              <div className="px-3 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-xs text-emerald-200">
                Signed in as verified admin: <span className="font-semibold">{adminEmail}</span>
              </div>
              <button
                type="button"
                onClick={onSuccess}
                className="w-full py-3 rounded-lg bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                Open Admin Panel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={submitting}
              className="w-full py-3 px-4 rounded-lg bg-white text-black font-semibold text-sm hover:bg-zinc-200 disabled:opacity-40 transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{submitting ? 'Signing in...' : 'Sign in with Google Admin'}</span>
            </button>
          )}

          {error && (
            <div className="px-3 py-2 rounded-md bg-red-500/15 border border-red-500/40 text-xs text-red-200 leading-relaxed">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
