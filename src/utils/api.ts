function readConfiguredApiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '';
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.origin;
    }
  } catch {
    return '';
  }
  return '';
}

export const API_BASE_URL = readConfiguredApiBase();

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

export function getWebSocketUrl(): string | null {
  try {
    if (API_BASE_URL) {
      const parsed = new URL(API_BASE_URL);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${parsed.host}/ws`;
    }
    if (typeof window === 'undefined' || !window.location.host) {
      return null;
    }
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${window.location.host}/ws`;
  } catch {
    return null;
  }
}

export function isJsonResponse(res: Response): boolean {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  return ct.includes('application/json') || ct.includes('+json');
}

export async function safeReadJson<T = unknown>(res: Response): Promise<T | null> {
  if (!isJsonResponse(res)) {
    return null;
  }
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
