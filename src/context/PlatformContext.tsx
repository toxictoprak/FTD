import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { createDefaultPlatformState } from '../data/defaultState';
import { auth, db, googleProvider, PRIMARY_ADMIN_EMAIL } from '../firebase';
import {
  computeSyncedClock,
  ensureFirestoreSeeded,
  executeFirestoreApi,
  subscribeAdminUsers,
  subscribePublicFirestore,
  type FirestoreLiveMatchDoc,
} from '../services/ftdFirestore';
import type { PlatformState } from '../types/ftd';
import { playCeremonyFanfare, playGoalSound, primeBroadcastAudio } from '../utils/sound';

export interface GoalAlertPayload {
  goalId: number;
  side: 'home' | 'away';
  teamName: string;
  scorer: string;
  minute: number;
  homeScore: number;
  awayScore: number;
}

interface PlatformContextValue {
  state: PlatformState | null;
  loading: boolean;
  error: string | null;
  wsConnected: boolean;
  adminToken: string | null;
  isAdmin: boolean;
  adminEmail: string | null;
  authReady: boolean;
  soundEnabled: boolean;
  toggleSound: () => void;
  activeGoalAlert: GoalAlertPayload | null;
  dismissGoalAlert: () => void;
  setAdminToken: (token: string | null) => void;
  signInWithGoogle: () => Promise<{ ok: boolean; error?: string }>;
  signOutAdmin: () => Promise<void>;
  refreshState: () => Promise<void>;
  apiRequest: <T = unknown>(
    path: string,
    options?: RequestInit
  ) => Promise<{ ok: boolean; data?: T; error?: string; status: number }>;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

async function checkUserIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if ((user.email || '').toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    return adminSnap.exists();
  } catch {
    return false;
  }
}

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlatformState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [activeGoalAlert, setActiveGoalAlert] = useState<GoalAlertPayload | null>(null);

  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const stateRef = useRef<PlatformState | null>(null);
  stateRef.current = state;

  const liveMatchDocRef = useRef<FirestoreLiveMatchDoc | null>(null);
  const goalTimerRef = useRef<number | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const prevGoalIdRef = useRef<number | null>(null);
  const prevCeremonyPhaseRef = useRef<string | null>(null);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) {
        primeBroadcastAudio();
      }
      return next;
    });
  }, []);

  const dismissGoalAlert = useCallback(() => {
    setActiveGoalAlert(null);
  }, []);

  const triggerGoalAlert = useCallback((payload: GoalAlertPayload) => {
    setActiveGoalAlert(payload);
    if (soundRef.current) {
      playGoalSound();
    }
    if (goalTimerRef.current) {
      window.clearTimeout(goalTimerRef.current);
    }
    goalTimerRef.current = window.setTimeout(() => {
      setActiveGoalAlert(null);
    }, 5500);
  }, []);

  const signOutAdmin = useCallback(async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore sign out error
    }
    setIsAdmin(false);
    setAdminEmail(null);
  }, []);

  const setAdminToken = useCallback(
    (token: string | null) => {
      if (token === null) {
        void signOutAdmin();
      }
    },
    [signOutAdmin]
  );

  const signInWithGoogle = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const allowed = await checkUserIsAdmin(user);
      if (!allowed) {
        await signOut(auth);
        setIsAdmin(false);
        setAdminEmail(null);
        return {
          ok: false,
          error: `Account "${user.email || 'unknown'}" is not authorized as an FTD Admin.`,
        };
      }
      setIsAdmin(true);
      setAdminEmail(user.email);
      await ensureFirestoreSeeded(user.uid, user.email || PRIMARY_ADMIN_EMAIL);
      return { ok: true };
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
        return {
          ok: false,
          error: `Domain "${host}" must be added to Firebase Console → Authentication → Settings → Authorized domains before signing in here.`,
        };
      }
      if (code === 'auth/popup-closed-by-user') {
        return { ok: false, error: 'Google sign-in popup was closed.' };
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Google authentication failed.',
      };
    }
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      const allowed = await checkUserIsAdmin(user);
      setIsAdmin(allowed);
      setAdminEmail(allowed ? user?.email || PRIMARY_ADMIN_EMAIL : null);
      setAuthReady(true);
      if (allowed && user) {
        try {
          await ensureFirestoreSeeded(user.uid, user.email || PRIMARY_ADMIN_EMAIL);
        } catch {
          // Handled cleanly in ErrorBoundary / notice if rules reject
        }
      }
    });
    return () => unsubAuth();
  }, []);

  // Global real-time Firestore subscriptions (worldwide live updates)
  useEffect(() => {
    const baseState = createDefaultPlatformState();
    baseState.authMeta = { adminConfigured: true, envControlled: false };
    setState(baseState);
    prevGoalIdRef.current = baseState.liveMatch.lastGoalId;
    prevCeremonyPhaseRef.current = baseState.ballonDorState.ceremonyPhase;
    setLoading(false);

    const unsubPublic = subscribePublicFirestore({
      onSite: (site) => {
        setWsConnected(true);
        setError(null);
        setState((prev) => (prev ? { ...prev, site } : prev));
      },
      onLiveMatch: (lmDoc) => {
        liveMatchDocRef.current = lmDoc;
        setWsConnected(true);
        const synced = computeSyncedClock(lmDoc);
        const nextLiveMatch = {
          ...lmDoc,
          matchMinute: synced.matchMinute,
          matchSecond: synced.matchSecond,
        };

        if (
          hasLoadedOnceRef.current &&
          prevGoalIdRef.current !== null &&
          nextLiveMatch.lastGoalId > prevGoalIdRef.current &&
          nextLiveMatch.lastGoalTeam
        ) {
          const side = nextLiveMatch.lastGoalTeam;
          triggerGoalAlert({
            goalId: nextLiveMatch.lastGoalId,
            side,
            teamName:
              side === 'home' ? nextLiveMatch.homeTeamName : nextLiveMatch.awayTeamName,
            scorer: nextLiveMatch.lastGoalScorer,
            minute: nextLiveMatch.lastGoalMinute,
            homeScore: nextLiveMatch.homeScore,
            awayScore: nextLiveMatch.awayScore,
          });
        }

        prevGoalIdRef.current = nextLiveMatch.lastGoalId;
        hasLoadedOnceRef.current = true;
        setState((prev) => (prev ? { ...prev, liveMatch: nextLiveMatch } : prev));
      },
      onBallonDor: (ballonDorState) => {
        setWsConnected(true);
        if (
          hasLoadedOnceRef.current &&
          prevCeremonyPhaseRef.current !== 'revealed' &&
          ballonDorState.ceremonyPhase === 'revealed' &&
          ballonDorState.winnerId !== null &&
          soundRef.current
        ) {
          playCeremonyFanfare();
        }
        prevCeremonyPhaseRef.current = ballonDorState.ceremonyPhase;
        hasLoadedOnceRef.current = true;
        setState((prev) => (prev ? { ...prev, ballonDorState } : prev));
      },
      onNews: (news) => setState((prev) => (prev ? { ...prev, news } : prev)),
      onCompetitions: (competitions) =>
        setState((prev) => (prev ? { ...prev, competitions } : prev)),
      onUpcomingEvents: (upcomingEvents) =>
        setState((prev) => (prev ? { ...prev, upcomingEvents } : prev)),
      onNominees: (nominees) => setState((prev) => (prev ? { ...prev, nominees } : prev)),
      onHistory: (ballonDorHistory) =>
        setState((prev) => (prev ? { ...prev, ballonDorHistory } : prev)),
      onTeams: (teams) => setState((prev) => (prev ? { ...prev, teams } : prev)),
      onMatchEvents: (matchEvents) => setState((prev) => (prev ? { ...prev, matchEvents } : prev)),
      onChatMessages: (chatMessages) =>
        setState((prev) => (prev ? { ...prev, chatMessages } : prev)),
      onError: (err) => {
        setWsConnected(false);
        setError(err.message);
      },
    });

    return () => {
      unsubPublic();
      if (goalTimerRef.current) window.clearTimeout(goalTimerRef.current);
    };
  }, [triggerGoalAlert]);

  // Admin-only roster subscription
  useEffect(() => {
    if (!isAdmin) return;
    const unsubUsers = subscribeAdminUsers(
      (users) => setState((prev) => (prev ? { ...prev, users } : prev)),
      (err) => setError(err.message)
    );
    return () => unsubUsers();
  }, [isAdmin]);

  // Synchronized client-side match clock ticker driven by Firestore clockAnchorMs
  useEffect(() => {
    const timer = window.setInterval(() => {
      const lmDoc = liveMatchDocRef.current;
      if (!lmDoc || !lmDoc.clockRunning || lmDoc.status !== 'LIVE' || !lmDoc.clockAnchorMs) {
        return;
      }
      const synced = computeSyncedClock(lmDoc);
      setState((prev) =>
        prev
          ? {
              ...prev,
              liveMatch: {
                ...prev.liveMatch,
                matchMinute: synced.matchMinute,
                matchSecond: synced.matchSecond,
              },
            }
          : prev
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshState = useCallback(async () => {
    setError(null);
  }, []);

  const apiRequest = useCallback(
    async <T = unknown,>(
      path: string,
      options: RequestInit = {}
    ): Promise<{ ok: boolean; data?: T; error?: string; status: number }> => {
      const current = stateRef.current;
      if (!current) {
        return { ok: false, error: 'Platform state is still initializing.', status: 503 };
      }
      return executeFirestoreApi<T>(
        path,
        options,
        current,
        liveMatchDocRef.current?.clockAnchorMs ?? null,
        isAdmin
      );
    },
    [isAdmin]
  );

  return (
    <PlatformContext.Provider
      value={{
        state,
        loading,
        error,
        wsConnected,
        adminToken: isAdmin ? 'firebase-admin' : null,
        isAdmin,
        adminEmail,
        authReady,
        soundEnabled,
        toggleSound,
        activeGoalAlert,
        dismissGoalAlert,
        setAdminToken,
        signInWithGoogle,
        signOutAdmin,
        refreshState,
        apiRequest,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
}
