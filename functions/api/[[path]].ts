import { createDefaultPlatformState } from '../../src/data/defaultState';
import type { PlatformState, ScoreboardEdition, MatchStatus } from '../../src/types/ftd';

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface PagesEnv {
  FTD_KV?: KVNamespaceLike;
  ADMIN_ACCESS_CODE?: string;
  SESSION_SECRET?: string;
}

interface PagesContext {
  request: Request;
  env: PagesEnv;
  params: { path?: string | string[] };
}

interface StoredEdgeData {
  state: PlatformState;
  adminPinHash: string | null;
  sessionSecret?: string;
  clockAnchorAt: number | null;
  nextIds: {
    news: number;
    competitions: number;
    events: number;
    nominees: number;
    history: number;
    teams: number;
    matchEvents: number;
    chat: number;
    users: number;
    goal: number;
  };
}

const STATE_KEY = 'ftd_platform_v1';
let memoryStore: StoredEdgeData | null = null;
let fallbackSecret: string | null = null;

function generateHexSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function createInitialEdgeData(): StoredEdgeData {
  return {
    state: createDefaultPlatformState(),
    adminPinHash: null,
    sessionSecret: generateHexSecret(),
    clockAnchorAt: null,
    nextIds: {
      news: 10,
      competitions: 10,
      events: 10,
      nominees: 10,
      history: 10,
      teams: 10,
      matchEvents: 10,
      chat: 10,
      users: 10,
      goal: 1,
    },
  };
}

async function loadData(env: PagesEnv): Promise<StoredEdgeData> {
  if (env.FTD_KV) {
    try {
      const raw = await env.FTD_KV.get(STATE_KEY);
      if (raw) {
        return JSON.parse(raw) as StoredEdgeData;
      }
    } catch {
      // Fallback below
    }
    const seeded = createInitialEdgeData();
    try {
      await env.FTD_KV.put(STATE_KEY, JSON.stringify(seeded));
    } catch {
      // Ignore write error
    }
    return seeded;
  }

  if (!memoryStore) {
    memoryStore = createInitialEdgeData();
  }
  return memoryStore;
}

async function saveData(env: PagesEnv, data: StoredEdgeData): Promise<void> {
  memoryStore = data;
  if (env.FTD_KV) {
    await env.FTD_KV.put(STATE_KEY, JSON.stringify(data));
  }
}

function getSecret(env: PagesEnv, data?: StoredEdgeData): string {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 16) {
    return env.SESSION_SECRET;
  }
  if (data?.sessionSecret && data.sessionSecret.length >= 16) {
    return data.sessionSecret;
  }
  if (!fallbackSecret) {
    fallbackSecret = generateHexSecret();
  }
  return fallbackSecret;
}

function toBase64Url(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

async function signAdminToken(env: PagesEnv, data: StoredEdgeData): Promise<string> {
  const payloadObj = {
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 12,
  };
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const sig = await hmacSign(payload, getSecret(env, data));
  return `${payload}.${sig}`;
}

async function verifyAdminToken(
  token: string | undefined,
  env: PagesEnv,
  data: StoredEdgeData
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = await hmacSign(payload, getSecret(env, data));
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return false;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      role?: string;
      exp?: number;
    };
    return parsed.role === 'admin' && typeof parsed.exp === 'number' && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

async function hashPinEdge(pin: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const saltHex = Array.from(saltBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    256
  );
  const hashHex = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

async function verifyPinEdge(pin: string, stored: string): Promise<boolean> {
  const [saltHex, expectedHex] = stored.split(':');
  if (!saltHex || !expectedHex) return false;
  const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || []);
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    256
  );
  const actualHex = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) {
    diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}

function getBearer(req: Request): string | undefined {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
}

function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowed =
    origin === 'https://ftd-dew.pages.dev' ||
    /^https:\/\/[a-z0-9-]+\.ftd-dew\.pages\.dev$/i.test(origin) ||
    /^https:\/\/[a-z0-9.-]+\.pages\.dev$/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

  if (!allowed || !origin) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    vary: 'Origin',
  };
}

function jsonResponse(body: unknown, status = 200, request?: Request): Response {
  const cors = request ? buildCorsHeaders(request) : {};
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...cors,
    },
  });
}

function sanitizeText(val: unknown, maxLen = 500): string {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

function sanitizeImageUrl(val: unknown): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/assets/')) return trimmed.slice(0, 500);
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed.length <= 2_600_000 ? trimmed : '';
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString().slice(0, 1000);
    }
  } catch {
    return '';
  }
  return '';
}

function sanitizeStreamUrl(val: unknown): string {
  if (typeof val !== 'string') return '';
  let trimmed = val.trim();
  if (!trimmed) return '';
  if (/^(www\.)?(discord\.gg|discord\.com|discordapp\.com)\b/i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'discord:') {
      return parsed.toString().slice(0, 1000);
    }
  } catch {
    return '';
  }
  return '';
}

function sanitizeColor(val: unknown, fallback = '#FFFFFF'): string {
  return typeof val === 'string' && /^#[0-9A-Fa-f]{6}$/.test(val.trim()) ? val.trim() : fallback;
}

function withSyncedClock(data: StoredEdgeData, env: PagesEnv): PlatformState {
  const envPin = env.ADMIN_ACCESS_CODE?.trim() ?? '';
  const envControlled = /^\d{4}$/.test(envPin);
  const lm = { ...data.state.liveMatch };

  if (lm.clockRunning && lm.status === 'LIVE' && data.clockAnchorAt) {
    const elapsedSec = Math.max(0, Math.floor((Date.now() - data.clockAnchorAt) / 1000));
    const totalSec = lm.matchMinute * 60 + lm.matchSecond + elapsedSec;
    lm.matchMinute = Math.floor(totalSec / 60);
    lm.matchSecond = totalSec % 60;
  }

  return {
    ...data.state,
    liveMatch: lm,
    authMeta: {
      adminConfigured: envControlled || Boolean(data.adminPinHash),
      envControlled,
    },
  };
}

function syncAnchor(data: StoredEdgeData): void {
  const lm = data.state.liveMatch;
  if (lm.clockRunning && lm.status === 'LIVE' && data.clockAnchorAt) {
    const elapsedSec = Math.max(0, Math.floor((Date.now() - data.clockAnchorAt) / 1000));
    const totalSec = lm.matchMinute * 60 + lm.matchSecond + elapsedSec;
    lm.matchMinute = Math.floor(totalSec / 60);
    lm.matchSecond = totalSec % 60;
  }
  data.clockAnchorAt = lm.clockRunning && lm.status === 'LIVE' ? Date.now() : null;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(request),
    });
  }

  const segments = Array.isArray(params.path)
    ? params.path
    : typeof params.path === 'string' && params.path.length > 0
    ? params.path.split('/')
    : [];
  const route = '/' + segments.join('/');

  const data = await loadData(env);
  if (!data.sessionSecret) {
    data.sessionSecret = generateHexSecret();
    await saveData(env, data);
  }

  if (method === 'GET' && route === '/health') {
    return jsonResponse({ ok: true, edge: true }, 200, request);
  }

  if (method === 'GET' && route === '/state') {
    return jsonResponse(withSyncedClock(data, env), 200, request);
  }

  if (method === 'GET' && route === '/admin/auth-status') {
    const envPin = env.ADMIN_ACCESS_CODE?.trim() ?? '';
    const envControlled = /^\d{4}$/.test(envPin);
    const authenticated = await verifyAdminToken(getBearer(request), env, data);
    return jsonResponse(
      {
        adminConfigured: envControlled || Boolean(data.adminPinHash),
        envControlled,
        authenticated,
      },
      200,
      request
    );
  }

  let body: Record<string, unknown> = {};
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  if (method === 'POST' && route === '/admin/setup') {
    const envPin = env.ADMIN_ACCESS_CODE?.trim() ?? '';
    if (/^\d{4}$/.test(envPin) || data.adminPinHash) {
      return jsonResponse({ error: 'Admin access code is already configured.' }, 409, request);
    }
    const pin = sanitizeText(body.pin, 10);
    if (!/^\d{4}$/.test(pin)) {
      return jsonResponse({ error: 'Access code must be exactly 4 digits.' }, 400, request);
    }
    data.adminPinHash = await hashPinEdge(pin);
    await saveData(env, data);
    const token = await signAdminToken(env, data);
    return jsonResponse({ token, authenticated: true }, 200, request);
  }

  if (method === 'POST' && route === '/admin/login') {
    const pin = sanitizeText(body.pin, 10);
    if (!/^\d{4}$/.test(pin)) {
      return jsonResponse({ error: 'Please enter a valid 4-digit access code.' }, 400, request);
    }
    const envPin = env.ADMIN_ACCESS_CODE?.trim() ?? '';
    let valid = false;
    if (/^\d{4}$/.test(envPin)) {
      valid = pin === envPin;
    } else if (data.adminPinHash) {
      valid = await verifyPinEdge(pin, data.adminPinHash);
    } else {
      return jsonResponse({ error: 'Admin access code has not been set up yet.' }, 400, request);
    }
    if (!valid) {
      return jsonResponse({ error: 'Incorrect 4-digit access code.' }, 401, request);
    }
    const token = await signAdminToken(env, data);
    return jsonResponse({ token, authenticated: true }, 200, request);
  }

  if (method === 'POST' && route === '/public/vote') {
    if (!data.state.ballonDorState.votingEnabled) {
      return jsonResponse({ error: 'Fan voting is currently closed by the FTD Committee.' }, 403, request);
    }
    const nomineeId = Number(body.nomineeId);
    const nominee = data.state.nominees.find((n) => n.id === nomineeId);
    if (!nominee) {
      return jsonResponse({ error: 'Nominee not found.' }, 404, request);
    }
    nominee.votes += 1;
    await saveData(env, data);
    return jsonResponse({ ok: true }, 200, request);
  }

  if (method === 'POST' && route === '/public/chat') {
    if (!data.state.site.chatEnabled) {
      return jsonResponse({ error: 'Live chat is currently disabled.' }, 403, request);
    }
    const sender = sanitizeText(body.sender, 32) || 'Supporter';
    const message = sanitizeText(body.message, 240);
    if (!message) {
      return jsonResponse({ error: 'Message cannot be empty.' }, 400, request);
    }
    const isAdmin = await verifyAdminToken(getBearer(request), env, data);
    const chatMsg = {
      id: data.nextIds.chat++,
      sender,
      message,
      isAdmin,
      createdAt: new Date().toISOString(),
    };
    data.state.chatMessages = [...data.state.chatMessages.slice(-59), chatMsg];
    await saveData(env, data);
    return jsonResponse(chatMsg, 200, request);
  }

  // ---- Protected Admin Routes ----
  if (route.startsWith('/admin/')) {
    const authorized = await verifyAdminToken(getBearer(request), env, data);
    if (!authorized) {
      return jsonResponse({ error: 'Admin authentication required.' }, 401, request);
    }

    if (method === 'POST' && route === '/admin/change-pin') {
      const envPin = env.ADMIN_ACCESS_CODE?.trim() ?? '';
      if (/^\d{4}$/.test(envPin)) {
        return jsonResponse({ error: 'Access code is controlled by environment configuration.' }, 400);
      }
      const currentPin = sanitizeText(body.currentPin, 10);
      const newPin = sanitizeText(body.newPin, 10);
      if (!/^\d{4}$/.test(newPin)) {
        return jsonResponse({ error: 'New access code must be exactly 4 digits.' }, 400);
      }
      if (data.adminPinHash && !(await verifyPinEdge(currentPin, data.adminPinHash))) {
        return jsonResponse({ error: 'Current access code is incorrect.' }, 401);
      }
      data.adminPinHash = await hashPinEdge(newPin);
      await saveData(env, data);
      return jsonResponse({ ok: true, message: '4-digit access code updated securely.' });
    }

    if (method === 'PUT' && route === '/admin/site') {
      const s = data.state.site;
      s.brandName = sanitizeText(body.brandName, 40) || s.brandName;
      if (body.logoUrl !== undefined) {
        s.logoUrl = sanitizeImageUrl(body.logoUrl) || '/assets/aistudio/IMG_0674_a69c6a83.png';
      }
      s.heroEyebrow = sanitizeText(body.heroEyebrow, 100) || s.heroEyebrow;
      s.heroTitle = sanitizeText(body.heroTitle, 160) || s.heroTitle;
      s.heroSubtitle = sanitizeText(body.heroSubtitle, 400) || s.heroSubtitle;
      s.gameIntroTitle = sanitizeText(body.gameIntroTitle, 120) || s.gameIntroTitle;
      s.gameIntroBody = sanitizeText(body.gameIntroBody, 1200) || s.gameIntroBody;
      if (body.announcementText !== undefined) s.announcementText = sanitizeText(body.announcementText, 220);
      if (body.announcementActive !== undefined) s.announcementActive = Boolean(body.announcementActive);
      s.seasonLabel = sanitizeText(body.seasonLabel, 60) || s.seasonLabel;
      if (body.maintenanceMode !== undefined) s.maintenanceMode = Boolean(body.maintenanceMode);
      if (body.chatEnabled !== undefined) s.chatEnabled = Boolean(body.chatEnabled);
      s.lastPublishedAt = new Date().toISOString();
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'POST' && route === '/admin/news') {
      const title = sanitizeText(body.title, 140);
      const summary = sanitizeText(body.summary, 300);
      if (!title || !summary) return jsonResponse({ error: 'Title and summary are required.' }, 400);
      data.state.news.unshift({
        id: data.nextIds.news++,
        title,
        category: sanitizeText(body.category, 40) || 'News',
        summary,
        body: sanitizeText(body.body, 2000) || summary,
        imageUrl: sanitizeImageUrl(body.imageUrl),
        featured: Boolean(body.featured),
        publishedAt: sanitizeText(body.publishedAt, 20) || new Date().toISOString().slice(0, 10),
      });
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'PUT' && route.startsWith('/admin/news/')) {
      const id = Number(segments[2]);
      const article = data.state.news.find((n) => n.id === id);
      if (!article) return jsonResponse({ error: 'Article not found.' }, 404);
      article.title = sanitizeText(body.title, 140) || article.title;
      article.category = sanitizeText(body.category, 40) || article.category;
      article.summary = sanitizeText(body.summary, 300) || article.summary;
      article.body = sanitizeText(body.body, 2000) || article.body;
      if (body.imageUrl !== undefined) article.imageUrl = sanitizeImageUrl(body.imageUrl);
      if (body.featured !== undefined) article.featured = Boolean(body.featured);
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE' && route.startsWith('/admin/news/')) {
      const id = Number(segments[2]);
      data.state.news = data.state.news.filter((n) => n.id !== id);
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'POST' && route === '/admin/competitions') {
      const name = sanitizeText(body.name, 100);
      if (!name) return jsonResponse({ error: 'Competition name is required.' }, 400);
      data.state.competitions.push({
        id: data.nextIds.competitions++,
        name,
        format: sanitizeText(body.format, 80) || 'League & Knockout',
        status: sanitizeText(body.status, 40) || 'Active',
        teamsCount: Math.max(2, Math.min(128, Number(body.teamsCount) || 16)),
        prizePool: sanitizeText(body.prizePool, 80) || 'Championship Trophy',
        season: sanitizeText(body.season, 30) || '2026/27',
        description: sanitizeText(body.description, 400) || '',
      });
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE' && route.startsWith('/admin/competitions/')) {
      const id = Number(segments[2]);
      data.state.competitions = data.state.competitions.filter((c) => c.id !== id);
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'POST' && route === '/admin/events') {
      const title = sanitizeText(body.title, 100);
      if (!title) return jsonResponse({ error: 'Event title is required.' }, 400);
      data.state.upcomingEvents.push({
        id: data.nextIds.events++,
        title,
        competition: sanitizeText(body.competition, 80) || 'FTD League',
        homeTeam: sanitizeText(body.homeTeam, 60) || 'TBD',
        awayTeam: sanitizeText(body.awayTeam, 60) || 'TBD',
        kickoffTime: sanitizeText(body.kickoffTime, 60) || 'Upcoming',
        venue: sanitizeText(body.venue, 80) || 'FTD Arena',
        status: sanitizeText(body.status, 40) || 'Scheduled',
      });
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE' && route.startsWith('/admin/events/')) {
      const id = Number(segments[2]);
      data.state.upcomingEvents = data.state.upcomingEvents.filter((ev) => ev.id !== id);
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'POST' && route === '/admin/nominees') {
      const name = sanitizeText(body.name, 80);
      const club = sanitizeText(body.club, 80);
      if (!name || !club) return jsonResponse({ error: 'Player name and club are required.' }, 400);
      data.state.nominees.push({
        id: data.nextIds.nominees++,
        name,
        club,
        position: sanitizeText(body.position, 10) || 'FW',
        nationality: sanitizeText(body.nationality, 40) || 'International',
        kitNumber: Math.max(1, Math.min(99, Number(body.kitNumber) || 10)),
        imageUrl: sanitizeImageUrl(body.imageUrl),
        goals: Math.max(0, Number(body.goals) || 0),
        assists: Math.max(0, Number(body.assists) || 0),
        trophies: Math.max(0, Number(body.trophies) || 0),
        rating: Math.max(50, Math.min(99.9, Number(body.rating) || 89.0)),
        votes: Math.max(0, Number(body.votes) || 0),
        rankOrder: Number(body.rankOrder) || data.state.nominees.length + 1,
        isWinner: false,
      });
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'PUT' && route.startsWith('/admin/nominees/')) {
      const id = Number(segments[2]);
      const nom = data.state.nominees.find((n) => n.id === id);
      if (!nom) return jsonResponse({ error: 'Nominee not found.' }, 404);
      nom.name = sanitizeText(body.name, 80) || nom.name;
      nom.club = sanitizeText(body.club, 80) || nom.club;
      nom.position = sanitizeText(body.position, 10) || nom.position;
      nom.nationality = sanitizeText(body.nationality, 40) || nom.nationality;
      if (body.kitNumber !== undefined) nom.kitNumber = Math.max(1, Math.min(99, Number(body.kitNumber)));
      if (body.imageUrl !== undefined) nom.imageUrl = sanitizeImageUrl(body.imageUrl);
      if (body.goals !== undefined) nom.goals = Math.max(0, Number(body.goals));
      if (body.assists !== undefined) nom.assists = Math.max(0, Number(body.assists));
      if (body.trophies !== undefined) nom.trophies = Math.max(0, Number(body.trophies));
      if (body.rating !== undefined) nom.rating = Math.max(50, Math.min(99.9, Number(body.rating)));
      if (body.votes !== undefined) nom.votes = Math.max(0, Number(body.votes));
      if (body.rankOrder !== undefined) nom.rankOrder = Math.max(1, Number(body.rankOrder));
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE' && route.startsWith('/admin/nominees/')) {
      const id = Number(segments[2]);
      data.state.nominees = data.state.nominees.filter((n) => n.id !== id);
      if (data.state.ballonDorState.winnerId === id) {
        data.state.ballonDorState.winnerId = null;
      }
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'PUT' && route === '/admin/ballondor/state') {
      const bd = data.state.ballonDorState;
      bd.ceremonyTitle = sanitizeText(body.ceremonyTitle, 100) || bd.ceremonyTitle;
      bd.seasonYear = sanitizeText(body.seasonYear, 20) || bd.seasonYear;
      bd.ceremonyDate = sanitizeText(body.ceremonyDate, 40) || bd.ceremonyDate;
      if (body.votingEnabled !== undefined) bd.votingEnabled = Boolean(body.votingEnabled);
      if (typeof body.ceremonyPhase === 'string' && ['idle', 'countdown', 'revealed'].includes(body.ceremonyPhase)) {
        bd.ceremonyPhase = body.ceremonyPhase as PlatformState['ballonDorState']['ceremonyPhase'];
      }
      if (body.winnerId !== undefined) {
        bd.winnerId = body.winnerId === null ? null : Number(body.winnerId);
        data.state.nominees.forEach((n) => {
          n.isWinner = n.id === bd.winnerId;
          if (n.isWinner) n.rankOrder = 1;
        });
      }
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'POST' && route === '/admin/ballondor/history') {
      const year = sanitizeText(body.year, 10);
      const winnerName = sanitizeText(body.winnerName, 80);
      const club = sanitizeText(body.club, 80);
      if (!year || !winnerName || !club) return jsonResponse({ error: 'Year, winner name, and club are required.' }, 400);
      data.state.ballonDorHistory.unshift({
        id: data.nextIds.history++,
        year,
        winnerName,
        club,
        statsSummary: sanitizeText(body.statsSummary, 160) || "Official FTD Ballon d'Or Winner",
        imageUrl: sanitizeImageUrl(body.imageUrl),
      });
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE' && route.startsWith('/admin/ballondor/history/')) {
      const id = Number(segments[3]);
      data.state.ballonDorHistory = data.state.ballonDorHistory.filter((h) => h.id !== id);
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'POST' && route === '/admin/teams') {
      const name = sanitizeText(body.name, 60);
      if (!name) return jsonResponse({ error: 'Team name is required.' }, 400);
      data.state.teams.push({
        id: data.nextIds.teams++,
        name,
        shortName: (sanitizeText(body.shortName, 5) || name.slice(0, 3)).toUpperCase(),
        primaryColor: sanitizeColor(body.primaryColor, '#FFFFFF'),
        secondaryColor: sanitizeColor(body.secondaryColor, '#111827'),
        logoUrl: sanitizeImageUrl(body.logoUrl),
      });
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'PUT' && route.startsWith('/admin/teams/')) {
      const id = Number(segments[2]);
      const team = data.state.teams.find((t) => t.id === id);
      if (!team) return jsonResponse({ error: 'Team not found.' }, 404);
      team.name = sanitizeText(body.name, 60) || team.name;
      team.shortName = (sanitizeText(body.shortName, 5) || team.shortName).toUpperCase();
      if (body.primaryColor) team.primaryColor = sanitizeColor(body.primaryColor, team.primaryColor);
      if (body.secondaryColor) team.secondaryColor = sanitizeColor(body.secondaryColor, team.secondaryColor);
      if (body.logoUrl !== undefined) team.logoUrl = sanitizeImageUrl(body.logoUrl);
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE' && route.startsWith('/admin/teams/')) {
      const id = Number(segments[2]);
      data.state.teams = data.state.teams.filter((t) => t.id !== id);
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'PUT' && route === '/admin/live') {
      syncAnchor(data);
      const lm = data.state.liveMatch;
      if (body.streamActive !== undefined) lm.streamActive = Boolean(body.streamActive);
      if (body.streamUrl !== undefined) lm.streamUrl = sanitizeStreamUrl(body.streamUrl);
      if (body.streamTitle !== undefined) lm.streamTitle = sanitizeText(body.streamTitle, 120) || lm.streamTitle;
      if (body.competitionName !== undefined) lm.competitionName = sanitizeText(body.competitionName, 80) || lm.competitionName;
      if (body.stadiumName !== undefined) lm.stadiumName = sanitizeText(body.stadiumName, 80) || lm.stadiumName;
      if (
        typeof body.scoreboardEdition === 'string' &&
        ['champions-league', 'premier-league', 'bundesliga', 'world-cup'].includes(body.scoreboardEdition)
      ) {
        lm.scoreboardEdition = body.scoreboardEdition as ScoreboardEdition;
      }
      if (typeof body.status === 'string' && ['PRE_MATCH', 'LIVE', 'HALFTIME', 'PAUSED', 'ENDED'].includes(body.status)) {
        lm.status = body.status as MatchStatus;
      }
      if (body.selectHomeTeamId) {
        const t = data.state.teams.find((x) => x.id === Number(body.selectHomeTeamId));
        if (t) {
          lm.homeTeamId = t.id;
          lm.homeTeamName = t.name;
          lm.homeTeamShort = t.shortName;
          lm.homeTeamLogo = t.logoUrl;
          lm.homeTeamColor = t.primaryColor;
        }
      }
      if (body.selectAwayTeamId) {
        const t = data.state.teams.find((x) => x.id === Number(body.selectAwayTeamId));
        if (t) {
          lm.awayTeamId = t.id;
          lm.awayTeamName = t.name;
          lm.awayTeamShort = t.shortName;
          lm.awayTeamLogo = t.logoUrl;
          lm.awayTeamColor = t.primaryColor;
        }
      }
      if (body.homeTeamName !== undefined) lm.homeTeamName = sanitizeText(body.homeTeamName, 60) || lm.homeTeamName;
      if (body.awayTeamName !== undefined) lm.awayTeamName = sanitizeText(body.awayTeamName, 60) || lm.awayTeamName;
      if (body.homeTeamShort !== undefined) lm.homeTeamShort = sanitizeText(body.homeTeamShort, 5).toUpperCase() || lm.homeTeamShort;
      if (body.awayTeamShort !== undefined) lm.awayTeamShort = sanitizeText(body.awayTeamShort, 5).toUpperCase() || lm.awayTeamShort;
      if (body.homeTeamLogo !== undefined) lm.homeTeamLogo = sanitizeImageUrl(body.homeTeamLogo);
      if (body.awayTeamLogo !== undefined) lm.awayTeamLogo = sanitizeImageUrl(body.awayTeamLogo);
      if (body.homeTeamColor !== undefined) lm.homeTeamColor = sanitizeColor(body.homeTeamColor, lm.homeTeamColor);
      if (body.awayTeamColor !== undefined) lm.awayTeamColor = sanitizeColor(body.awayTeamColor, lm.awayTeamColor);
      if (body.homeScore !== undefined) lm.homeScore = Math.max(0, Math.min(99, Number(body.homeScore)));
      if (body.awayScore !== undefined) lm.awayScore = Math.max(0, Math.min(99, Number(body.awayScore)));
      if (body.matchMinute !== undefined) lm.matchMinute = Math.max(0, Math.min(130, Number(body.matchMinute)));
      if (body.matchSecond !== undefined) lm.matchSecond = Math.max(0, Math.min(59, Number(body.matchSecond)));
      if (body.clockRunning !== undefined) lm.clockRunning = Boolean(body.clockRunning);
      if (body.halfLabel !== undefined) lm.halfLabel = sanitizeText(body.halfLabel, 24) || lm.halfLabel;
      data.clockAnchorAt = lm.clockRunning && lm.status === 'LIVE' ? Date.now() : null;
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'POST' && route === '/admin/live/goal') {
      syncAnchor(data);
      const lm = data.state.liveMatch;
      const side = body.side === 'away' ? 'away' : 'home';
      const scorer = sanitizeText(body.scorer, 60);
      const minute = lm.matchMinute || 1;
      if (side === 'home') lm.homeScore += 1;
      else lm.awayScore += 1;
      const teamName = side === 'home' ? lm.homeTeamName : lm.awayTeamName;
      const goalId = data.nextIds.goal++;
      lm.lastGoalId = goalId;
      lm.lastGoalTeam = side;
      lm.lastGoalScorer = scorer;
      lm.lastGoalMinute = minute;

      data.state.matchEvents.unshift({
        id: data.nextIds.matchEvents++,
        type: 'GOAL',
        teamSide: side,
        teamName,
        playerName: scorer || `${teamName} Goal`,
        minute,
        createdAt: new Date().toISOString(),
      });
      await saveData(env, data);
      return jsonResponse({ ok: true, goalId });
    }

    if (method === 'POST' && route === '/admin/live/undo-goal') {
      const idx = data.state.matchEvents.findIndex((e) => e.type === 'GOAL');
      if (idx === -1) return jsonResponse({ error: 'No goal event available to undo.' }, 400);
      const [removed] = data.state.matchEvents.splice(idx, 1);
      if (removed.teamSide === 'home') data.state.liveMatch.homeScore = Math.max(0, data.state.liveMatch.homeScore - 1);
      if (removed.teamSide === 'away') data.state.liveMatch.awayScore = Math.max(0, data.state.liveMatch.awayScore - 1);
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'POST' && route === '/admin/live/control') {
      syncAnchor(data);
      const lm = data.state.liveMatch;
      const action = String(body.action || '');
      const now = new Date().toISOString();
      if (action === 'start') {
        lm.status = 'LIVE';
        lm.clockRunning = true;
        lm.halfLabel = '1ST HALF';
        lm.matchSecond = 0;
        data.state.matchEvents.unshift({
          id: data.nextIds.matchEvents++,
          type: 'KICKOFF',
          teamSide: 'neutral',
          teamName: 'Match Official',
          playerName: 'Kick-off — 1st Half Underway',
          minute: 0,
          createdAt: now,
        });
      } else if (action === 'pause') {
        lm.status = 'PAUSED';
        lm.clockRunning = false;
      } else if (action === 'resume') {
        lm.status = 'LIVE';
        lm.clockRunning = true;
      } else if (action === 'halftime') {
        lm.status = 'HALFTIME';
        lm.clockRunning = false;
        lm.halfLabel = 'HT';
        data.state.matchEvents.unshift({
          id: data.nextIds.matchEvents++,
          type: 'HALFTIME',
          teamSide: 'neutral',
          teamName: 'Match Official',
          playerName: 'Half-Time Whistle',
          minute: lm.matchMinute,
          createdAt: now,
        });
      } else if (action === 'second_half') {
        lm.status = 'LIVE';
        lm.clockRunning = true;
        lm.halfLabel = '2ND HALF';
        lm.matchMinute = Math.max(45, lm.matchMinute);
        lm.matchSecond = 0;
        data.state.matchEvents.unshift({
          id: data.nextIds.matchEvents++,
          type: 'KICKOFF',
          teamSide: 'neutral',
          teamName: 'Match Official',
          playerName: '2nd Half Underway',
          minute: lm.matchMinute,
          createdAt: now,
        });
      } else if (action === 'end') {
        lm.status = 'ENDED';
        lm.clockRunning = false;
        lm.halfLabel = 'FT';
        data.state.matchEvents.unshift({
          id: data.nextIds.matchEvents++,
          type: 'FULLTIME',
          teamSide: 'neutral',
          teamName: 'Match Official',
          playerName: 'Full-Time Whistle',
          minute: lm.matchMinute,
          createdAt: now,
        });
      } else if (action === 'reset') {
        lm.homeScore = 0;
        lm.awayScore = 0;
        lm.matchMinute = 0;
        lm.matchSecond = 0;
        lm.clockRunning = false;
        lm.halfLabel = 'PRE-MATCH';
        lm.status = 'PRE_MATCH';
        lm.lastGoalId = 0;
        lm.lastGoalTeam = null;
        lm.lastGoalScorer = '';
        lm.lastGoalMinute = 0;
        data.state.matchEvents = [];
      }
      data.clockAnchorAt = lm.clockRunning && lm.status === 'LIVE' ? Date.now() : null;
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'POST' && route === '/admin/live/events') {
      const lm = data.state.liveMatch;
      const validTypes = ['GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUB', 'KICKOFF', 'HALFTIME', 'FULLTIME'];
      const type = validTypes.includes(String(body.type)) ? String(body.type) : 'YELLOW_CARD';
      const teamSide = ['home', 'away', 'neutral'].includes(String(body.teamSide))
        ? (String(body.teamSide) as 'home' | 'away' | 'neutral')
        : 'home';
      const defaultTeam =
        teamSide === 'home' ? lm.homeTeamName : teamSide === 'away' ? lm.awayTeamName : 'Match Official';
      data.state.matchEvents.unshift({
        id: data.nextIds.matchEvents++,
        type: type as PlatformState['matchEvents'][number]['type'],
        teamSide,
        teamName: sanitizeText(body.teamName, 60) || defaultTeam,
        playerName: sanitizeText(body.playerName, 80) || 'Match Event',
        minute: Math.max(0, Math.min(130, Number(body.minute ?? lm.matchMinute))),
        createdAt: new Date().toISOString(),
      });
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE' && route.startsWith('/admin/live/events/')) {
      const id = Number(segments[3]);
      data.state.matchEvents = data.state.matchEvents.filter((ev) => ev.id !== id);
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE' && route.startsWith('/admin/chat/')) {
      const id = Number(segments[2]);
      data.state.chatMessages = data.state.chatMessages.filter((m) => m.id !== id);
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'POST' && route === '/admin/chat/clear') {
      data.state.chatMessages = [];
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'POST' && route === '/admin/users') {
      const username = sanitizeText(body.username, 50);
      if (!username) return jsonResponse({ error: 'Username is required.' }, 400);
      const role = ['Player', 'Captain', 'Broadcaster', 'Moderator'].includes(String(body.role))
        ? (String(body.role) as PlatformState['users'][number]['role'])
        : 'Player';
      data.state.users.push({
        id: data.nextIds.users++,
        username,
        club: sanitizeText(body.club, 60) || 'Free Agent',
        role,
        status: body.status === 'Suspended' ? 'Suspended' : 'Active',
        joinedAt: new Date().toISOString().slice(0, 10),
      });
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'PUT' && route.startsWith('/admin/users/')) {
      const id = Number(segments[2]);
      const user = data.state.users.find((u) => u.id === id);
      if (!user) return jsonResponse({ error: 'User not found.' }, 404);
      if (body.username !== undefined) user.username = sanitizeText(body.username, 50) || user.username;
      if (body.club !== undefined) user.club = sanitizeText(body.club, 60) || user.club;
      if (['Player', 'Captain', 'Broadcaster', 'Moderator'].includes(String(body.role))) {
        user.role = String(body.role) as PlatformState['users'][number]['role'];
      }
      if (body.status === 'Suspended' || body.status === 'Active') {
        user.status = body.status;
      }
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE' && route.startsWith('/admin/users/')) {
      const id = Number(segments[2]);
      data.state.users = data.state.users.filter((u) => u.id !== id);
      await saveData(env, data);
      return jsonResponse({ ok: true });
    }
  }

  return jsonResponse({ error: 'API route not found.' }, 404);
}
