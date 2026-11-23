import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ChatMessage, PlatformState } from '../types/ftd';
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

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlatformState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [activeGoalAlert, setActiveGoalAlert] = useState<GoalAlertPayload | null>(null);

  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const goalTimerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

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

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('Failed to load FTD platform state');
      const data = (await res.json()) as PlatformState;
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to FTD server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  useEffect(() => {
    let unmounted = false;
    let attempt = 0;

    const connect = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; payload: unknown };
          if (msg.type === 'state:sync') {
            setState(msg.payload as PlatformState);
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
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!unmounted) {
          const delay = Math.min(8000, 1000 * Math.pow(1.5, attempt));
          attempt += 1;
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (goalTimerRef.current) window.clearTimeout(goalTimerRef.current);
      wsRef.current?.close();
    };
  }, [triggerGoalAlert]);

  const apiRequest = useCallback(
    async <T = unknown,>(
      path: string,
      options: RequestInit = {}
    ): Promise<{ ok: boolean; data?: T; error?: string; status: number }> => {
      try {
        const headers = new Headers(options.headers || {});
        if (!headers.has('Content-Type') && options.body) {
          headers.set('Content-Type', 'application/json');
        }
        if (adminToken) {
          headers.set('Authorization', `Bearer ${adminToken}`);
        }
        const res = await fetch(path, { ...options, headers });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401 && path.startsWith('/api/admin/') && path !== '/api/admin/login') {
            setAdminToken(null);
          }
          return {
            ok: false,
            error: (json as { error?: string }).error || 'Request failed',
            status: res.status,
          };
        }
        return { ok: true, data: json as T, status: res.status };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Network error',
          status: 0,
        };
      }
    },
    [adminToken]
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
