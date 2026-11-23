import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createDefaultPlatformState } from '../data/defaultState';
import type { ChatMessage, PlatformState } from '../types/ftd';
import { getApiUrl, getWebSocketUrl, isJsonResponse, safeReadJson } from '../utils/api';
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
  soundEnabled: boolean;
  toggleSound: () => void;
  activeGoalAlert: GoalAlertPayload | null;
  dismissGoalAlert: () => void;
  setAdminToken: (token: string | null) => void;
  refreshState: () => Promise<void>;
  apiRequest: <T = unknown>(
    path: string,
    options?: RequestInit
  ) => Promise<{ ok: boolean; data?: T; error?: string; status: number }>;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

const ADMIN_TOKEN_STORAGE_KEY = 'ftd_admin_token';

function readStoredAdminToken(): string | null {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredAdminToken(token: string | null): void {
  try {
    if (token) {
      window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors in sandboxed iframes or private mode
  }
}

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlatformState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [adminToken, setAdminTokenState] = useState<string | null>(() => readStoredAdminToken());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [activeGoalAlert, setActiveGoalAlert] = useState<GoalAlertPayload | null>(null);

  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const goalTimerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const apiAvailableRef = useRef<boolean>(false);
  const hasLoadedOnceRef = useRef<boolean>(false);
  const prevGoalIdRef = useRef<number | null>(null);
  const prevCeremonyPhaseRef = useRef<string | null>(null);

  const setAdminToken = useCallback((token: string | null) => {
    setAdminTokenState(token);
    writeStoredAdminToken(token);
  }, []);

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

  const applySyncedState = useCallback(
    (nextState: PlatformState) => {
      if (hasLoadedOnceRef.current) {
        if (
          prevGoalIdRef.current !== null &&
          nextState.liveMatch.lastGoalId > prevGoalIdRef.current &&
          nextState.liveMatch.lastGoalTeam
        ) {
          const side = nextState.liveMatch.lastGoalTeam;
          triggerGoalAlert({
            goalId: nextState.liveMatch.lastGoalId,
            side,
            teamName:
              side === 'home' ? nextState.liveMatch.homeTeamName : nextState.liveMatch.awayTeamName,
            scorer: nextState.liveMatch.lastGoalScorer,
            minute: nextState.liveMatch.lastGoalMinute,
            homeScore: nextState.liveMatch.homeScore,
            awayScore: nextState.liveMatch.awayScore,
          });
        }

        if (
          prevCeremonyPhaseRef.current !== 'revealed' &&
          nextState.ballonDorState.ceremonyPhase === 'revealed' &&
          nextState.ballonDorState.winnerId !== null &&
          soundRef.current
        ) {
          playCeremonyFanfare();
        }
      }

      prevGoalIdRef.current = nextState.liveMatch.lastGoalId;
      prevCeremonyPhaseRef.current = nextState.ballonDorState.ceremonyPhase;
      hasLoadedOnceRef.current = true;
      setState(nextState);
      setError(null);
    },
    [triggerGoalAlert]
  );

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/state'), {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok || !isJsonResponse(res)) {
        // If static hosting returned index.html (SPA fallback) or an unreachable API route,
        // keep the platform operational with default seeded state rather than crashing with a JSON SyntaxError.
        apiAvailableRef.current = false;
        setState((prev) => {
          if (prev) return prev;
          const fallback = createDefaultPlatformState();
          prevGoalIdRef.current = fallback.liveMatch.lastGoalId;
          prevCeremonyPhaseRef.current = fallback.ballonDorState.ceremonyPhase;
          hasLoadedOnceRef.current = true;
          return fallback;
        });
        setError(null);
        return;
      }

      const data = await safeReadJson<PlatformState>(res);
      if (!data || !data.site || !data.liveMatch) {
        apiAvailableRef.current = false;
        setState((prev) => prev ?? createDefaultPlatformState());
        setError(null);
        return;
      }

      apiAvailableRef.current = true;
      applySyncedState(data);
    } catch {
      apiAvailableRef.current = false;
      setState((prev) => {
        if (prev) return prev;
        const fallback = createDefaultPlatformState();
        prevGoalIdRef.current = fallback.liveMatch.lastGoalId;
        prevCeremonyPhaseRef.current = fallback.ballonDorState.ceremonyPhase;
        hasLoadedOnceRef.current = true;
        return fallback;
      });
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [applySyncedState]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    let unmounted = false;
    let attempt = 0;
    let openedOnce = false;

    const connect = () => {
      if (unmounted) return;
      const wsUrl = getWebSocketUrl();
      if (!wsUrl) {
        setPollingEnabled(true);
        return;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setWsConnected(false);
        setPollingEnabled(true);
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        openedOnce = true;
        apiAvailableRef.current = true;
        setWsConnected(true);
        setPollingEnabled(false);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; payload: unknown };
          if (msg.type === 'state:sync') {
            applySyncedState(msg.payload as PlatformState);
            setLoading(false);
          } else if (msg.type === 'match:clock') {
            const clock = msg.payload as { matchMinute: number; matchSecond: number };
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    liveMatch: {
                      ...prev.liveMatch,
                      matchMinute: clock.matchMinute,
                      matchSecond: clock.matchSecond,
                    },
                  }
                : prev
            );
          } else if (msg.type === 'viewer:count') {
            const v = msg.payload as { viewerCount: number };
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    liveMatch: { ...prev.liveMatch, viewerCount: v.viewerCount },
                  }
                : prev
            );
          } else if (msg.type === 'chat:message') {
            const chatMsg = msg.payload as ChatMessage;
            setState((prev) => {
              if (!prev) return prev;
              if (prev.chatMessages.some((m) => m.id === chatMsg.id)) return prev;
              return {
                ...prev,
                chatMessages: [...prev.chatMessages.slice(-59), chatMsg],
              };
            });
          } else if (msg.type === 'match:goal') {
            triggerGoalAlert(msg.payload as GoalAlertPayload);
          } else if (msg.type === 'ceremony:reveal') {
            if (soundRef.current) {
              playCeremonyFanfare();
            }
          }
        } catch {
          // Ignore malformed WebSocket frames
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (unmounted) return;

        // If running on serverless/edge hosting (like Cloudflare Pages Functions) where /ws does not accept WebSockets,
        // stop reconnecting after 2 quick failed attempts and switch to HTTP state polling instead.
        if (!openedOnce && attempt >= 1) {
          setPollingEnabled(true);
          return;
        }

        const delay = Math.min(8000, 1000 * Math.pow(1.5, attempt));
        attempt += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // Ignore close error
        }
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (goalTimerRef.current) window.clearTimeout(goalTimerRef.current);
      try {
        wsRef.current?.close();
      } catch {
        // Ignore close error
      }
    };
  }, [applySyncedState, triggerGoalAlert]);

  useEffect(() => {
    if (!pollingEnabled || wsConnected) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && apiAvailableRef.current) {
        void refreshState();
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [pollingEnabled, wsConnected, refreshState]);

  const apiRequest = useCallback(
    async <T = unknown,>(
      path: string,
      options: RequestInit = {}
    ): Promise<{ ok: boolean; data?: T; error?: string; status: number }> => {
      try {
        const headers = new Headers(options.headers || {});
        if (!headers.has('Accept')) {
          headers.set('Accept', 'application/json');
        }
        if (!headers.has('Content-Type') && options.body) {
          headers.set('Content-Type', 'application/json');
        }
        if (adminToken) {
          headers.set('Authorization', `Bearer ${adminToken}`);
        }
        const res = await fetch(getApiUrl(path), { ...options, headers });

        if (!isJsonResponse(res)) {
          return {
            ok: false,
            error:
              'FTD API endpoint returned an unexpected non-JSON response. Make sure Cloudflare Pages Functions (/functions) or VITE_API_BASE_URL is deployed.',
            status: res.status || 503,
          };
        }

        const json = await safeReadJson<T & { error?: string }>(res);
        if (!res.ok) {
          if (res.status === 401 && path.startsWith('/api/admin/') && path !== '/api/admin/login') {
            setAdminToken(null);
          }
          return {
            ok: false,
            error: json?.error || `Request failed (${res.status})`,
            status: res.status,
          };
        }
        return { ok: true, data: (json ?? undefined) as T | undefined, status: res.status };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Network error',
          status: 0,
        };
      }
    },
    [adminToken, setAdminToken]
  );

  return (
    <PlatformContext.Provider
      value={{
        state,
        loading,
        error,
        wsConnected,
        adminToken,
        isAdmin: Boolean(adminToken),
        soundEnabled,
        toggleSound,
        activeGoalAlert,
        dismissGoalAlert,
        setAdminToken,
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
