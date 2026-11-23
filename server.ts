import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import {
  db,
  initDatabase,
  getAuthMeta,
  getFullPlatformState,
  hashPin,
  verifyPinHash,
} from './server/db.ts';

initDatabase();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (reqUrl.pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '4mb' }));

// Rate-limit tracking for admin PIN login attempts & public voting
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const recentVoters = new Map<string, number>();

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function signAdminToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      role: 'admin',
      iat: Date.now(),
      exp: Date.now() + 1000 * 60 * 60 * 12,
      nonce: crypto.randomBytes(8).toString('hex'),
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: string;
      exp?: number;
    };
    return parsed.role === 'admin' && typeof parsed.exp === 'number' && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

function extractBearer(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  next();
}

function sanitizeText(val: unknown, maxLen = 500): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
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
    if (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'discord:'
    ) {
      return parsed.toString().slice(0, 1000);
    }
  } catch {
    return '';
  }
  return '';
}

function sanitizeColor(val: unknown, fallback = '#FFFFFF'): string {
  if (typeof val !== 'string') return fallback;
  return /^#[0-9A-Fa-f]{6}$/.test(val.trim()) ? val.trim() : fallback;
}

function activeViewerCount(): number {
  let count = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) count += 1;
  });
  return Math.max(1, count);
}

function broadcastEvent(type: string, payload: unknown): void {
  const frame = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(frame);
    }
  });
}

function broadcastFullState(extraEvent?: { type: string; payload: unknown }): void {
  const state = getFullPlatformState(activeViewerCount());
  broadcastEvent('state:sync', state);
  if (extraEvent) {
    broadcastEvent(extraEvent.type, extraEvent.payload);
  }
}

wss.on('connection', (ws) => {
  const state = getFullPlatformState(activeViewerCount());
  ws.send(JSON.stringify({ type: 'state:sync', payload: state }));
  broadcastEvent('viewer:count', { viewerCount: activeViewerCount() });

  ws.on('close', () => {
    broadcastEvent('viewer:count', { viewerCount: activeViewerCount() });
  });
});

// Server-authoritative match clock (ticks every second when clockRunning is active)
setInterval(() => {
  const row = db
    .prepare('SELECT clockRunning, status, matchMinute, matchSecond FROM live_match WHERE id = 1')
    .get() as {
    clockRunning: number;
    status: string;
    matchMinute: number;
    matchSecond: number;
  };
  if (row && row.clockRunning === 1 && row.status === 'LIVE') {
    let nextSec = row.matchSecond + 1;
    let nextMin = row.matchMinute;
    if (nextSec >= 60) {
      nextSec = 0;
      nextMin += 1;
    }
    db.prepare('UPDATE live_match SET matchMinute = ?, matchSecond = ? WHERE id = 1').run(
      nextMin,
      nextSec
    );
    broadcastEvent('match:clock', { matchMinute: nextMin, matchSecond: nextSec });
  }
}, 1000);

// ---- Health & Public State ----

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, viewers: activeViewerCount() });
});

app.get('/api/state', (_req, res) => {
  res.json(getFullPlatformState(activeViewerCount()));
});

// ---- Admin Authentication (4-Digit Server-Verified Access Code) ----

app.get('/api/admin/auth-status', (req, res) => {
  const meta = getAuthMeta();
  const authenticated = verifyAdminToken(extractBearer(req));
  res.json({
    adminConfigured: meta.adminConfigured,
    envControlled: meta.envControlled,
    authenticated,
  });
});

app.post('/api/admin/setup', (req, res) => {
  const meta = getAuthMeta();
  if (meta.envControlled || meta.adminConfigured) {
    res.status(409).json({ error: 'Admin access code is already configured.' });
    return;
  }
  const pin = sanitizeText(req.body?.pin, 10);
  if (!/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'Access code must be exactly 4 digits.' });
    return;
  }
  const hashed = hashPin(pin);
  db.prepare('INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)').run(
    'admin_pin_hash',
    hashed
  );
  const token = signAdminToken();
  broadcastFullState();
  res.json({ token, authenticated: true });
});

app.post('/api/admin/login', (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 8) {
    res.status(429).json({ error: 'Too many attempts. Please wait 60 seconds before trying again.' });
    return;
  }

  const pin = sanitizeText(req.body?.pin, 10);
  if (!/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'Please enter a valid 4-digit access code.' });
    return;
  }

  const envPin = process.env.ADMIN_ACCESS_CODE?.trim() ?? '';
  let valid = false;

  if (/^\d{4}$/.test(envPin)) {
    valid = crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(envPin));
  } else {
    const row = db.prepare('SELECT value FROM kv_config WHERE key = ?').get('admin_pin_hash') as
      | { value: string }
      | undefined;
    if (!row) {
      res.status(400).json({ error: 'Admin access code has not been set up yet.' });
      return;
    }
    valid = verifyPinHash(pin, row.value);
  }

  if (!valid) {
    const nextCount = attempt && attempt.resetAt > now ? attempt.count + 1 : 1;
    loginAttempts.set(ip, { count: nextCount, resetAt: now + 60_000 });
    res.status(401).json({ error: 'Incorrect 4-digit access code.' });
    return;
  }

  loginAttempts.delete(ip);
  const token = signAdminToken();
  res.json({ token, authenticated: true });
});

app.post('/api/admin/change-pin', requireAdmin, (req, res) => {
  const meta = getAuthMeta();
  if (meta.envControlled) {
    res.status(400).json({
      error: 'Access code is controlled by server environment configuration (ADMIN_ACCESS_CODE).',
    });
    return;
  }
  const currentPin = sanitizeText(req.body?.currentPin, 10);
  const newPin = sanitizeText(req.body?.newPin, 10);
  if (!/^\d{4}$/.test(newPin)) {
    res.status(400).json({ error: 'New access code must be exactly 4 digits.' });
    return;
  }
  const row = db.prepare('SELECT value FROM kv_config WHERE key = ?').get('admin_pin_hash') as
    | { value: string }
    | undefined;
  if (row && !verifyPinHash(currentPin, row.value)) {
    res.status(401).json({ error: 'Current access code is incorrect.' });
    return;
  }
  const hashed = hashPin(newPin);
  db.prepare('INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)').run(
    'admin_pin_hash',
    hashed
  );
  res.json({ ok: true, message: '4-digit access code updated securely.' });
});

// ---- Public Spectator Interactions ----

app.post('/api/public/vote', (req, res) => {
  const bdState = db.prepare('SELECT votingEnabled FROM ballon_dor_state WHERE id = 1').get() as {
    votingEnabled: number;
  };
  if (!bdState?.votingEnabled) {
    res.status(403).json({ error: 'Fan voting is currently closed by the FTD Committee.' });
    return;
  }
  const nomineeId = Number(req.body?.nomineeId);
  if (!Number.isInteger(nomineeId) || nomineeId <= 0) {
    res.status(400).json({ error: 'Invalid nominee.' });
    return;
  }
  const ip = getClientIp(req);
  const voterKey = `${ip}:${sanitizeText(req.body?.voterId, 64)}`;
  const lastVote = recentVoters.get(voterKey) || 0;
  if (Date.now() - lastVote < 8000) {
    res.status(429).json({ error: 'Please wait a moment before casting another vote.' });
    return;
  }
  const existing = db.prepare('SELECT id FROM ballon_dor_nominees WHERE id = ?').get(nomineeId);
  if (!existing) {
    res.status(404).json({ error: 'Nominee not found.' });
    return;
  }
  recentVoters.set(voterKey, Date.now());
  db.prepare('UPDATE ballon_dor_nominees SET votes = votes + 1 WHERE id = ?').run(nomineeId);
  broadcastFullState();
  res.json({ ok: true });
});

app.post('/api/public/chat', (req, res) => {
  const site = db.prepare('SELECT chatEnabled FROM site_settings WHERE id = 1').get() as {
    chatEnabled: number;
  };
  if (!site?.chatEnabled) {
    res.status(403).json({ error: 'Live chat is currently disabled.' });
    return;
  }
  const sender = sanitizeText(req.body?.sender, 32) || 'Supporter';
  const message = sanitizeText(req.body?.message, 240);
  if (!message) {
    res.status(400).json({ error: 'Message cannot be empty.' });
    return;
  }
  const isAdmin = verifyAdminToken(extractBearer(req)) ? 1 : 0;
  const createdAt = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO live_chat (sender, message, isAdmin, createdAt) VALUES (?, ?, ?, ?)')
    .run(sender, message, isAdmin, createdAt);

  const chatMsg = {
    id: Number(info.lastInsertRowid),
    sender,
    message,
    isAdmin: Boolean(isAdmin),
    createdAt,
  };
  broadcastEvent('chat:message', chatMsg);
  res.json(chatMsg);
});

// ---- Admin A: Website & Content Management ----

app.put('/api/admin/site', requireAdmin, (req, res) => {
  const current = db.prepare('SELECT * FROM site_settings WHERE id = 1').get() as Record<string, unknown>;
  const logoUrl =
    req.body?.logoUrl !== undefined
      ? sanitizeImageUrl(req.body.logoUrl) || '/assets/aistudio/IMG_0674_a69c6a83.png'
      : String(current.logoUrl);

  db.prepare(`
    UPDATE site_settings SET
      brandName = ?,
      logoUrl = ?,
      heroEyebrow = ?,
      heroTitle = ?,
      heroSubtitle = ?,
      gameIntroTitle = ?,
      gameIntroBody = ?,
      announcementText = ?,
      announcementActive = ?,
      seasonLabel = ?,
      maintenanceMode = ?,
      chatEnabled = ?,
      lastPublishedAt = ?
    WHERE id = 1
  `).run(
    sanitizeText(req.body?.brandName, 40) || String(current.brandName),
    logoUrl,
    sanitizeText(req.body?.heroEyebrow, 100) || String(current.heroEyebrow),
    sanitizeText(req.body?.heroTitle, 160) || String(current.heroTitle),
    sanitizeText(req.body?.heroSubtitle, 400) || String(current.heroSubtitle),
    sanitizeText(req.body?.gameIntroTitle, 120) || String(current.gameIntroTitle),
    sanitizeText(req.body?.gameIntroBody, 1200) || String(current.gameIntroBody),
    sanitizeText(req.body?.announcementText, 220),
    req.body?.announcementActive !== undefined ? (req.body.announcementActive ? 1 : 0) : Number(current.announcementActive),
    sanitizeText(req.body?.seasonLabel, 60) || String(current.seasonLabel),
    req.body?.maintenanceMode !== undefined ? (req.body.maintenanceMode ? 1 : 0) : Number(current.maintenanceMode),
    req.body?.chatEnabled !== undefined ? (req.body.chatEnabled ? 1 : 0) : Number(current.chatEnabled),
    new Date().toISOString()
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.post('/api/admin/news', requireAdmin, (req, res) => {
  const title = sanitizeText(req.body?.title, 140);
  const summary = sanitizeText(req.body?.summary, 300);
  if (!title || !summary) {
    res.status(400).json({ error: 'Title and summary are required.' });
    return;
  }
  const category = sanitizeText(req.body?.category, 40) || 'News';
  const body = sanitizeText(req.body?.body, 2000) || summary;
  const imageUrl = sanitizeImageUrl(req.body?.imageUrl);
  const featured = req.body?.featured ? 1 : 0;
  const publishedAt = sanitizeText(req.body?.publishedAt, 20) || new Date().toISOString().slice(0, 10);

  db.prepare(
    'INSERT INTO news (title, category, summary, body, imageUrl, featured, publishedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(title, category, summary, body, imageUrl, featured, publishedAt);
  broadcastFullState();
  res.json({ ok: true });
});

app.put('/api/admin/news/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM news WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Article not found.' });
    return;
  }
  db.prepare(
    'UPDATE news SET title = ?, category = ?, summary = ?, body = ?, imageUrl = ?, featured = ? WHERE id = ?'
  ).run(
    sanitizeText(req.body?.title, 140) || String(existing.title),
    sanitizeText(req.body?.category, 40) || String(existing.category),
    sanitizeText(req.body?.summary, 300) || String(existing.summary),
    sanitizeText(req.body?.body, 2000) || String(existing.body),
    req.body?.imageUrl !== undefined ? sanitizeImageUrl(req.body.imageUrl) : String(existing.imageUrl),
    req.body?.featured !== undefined ? (req.body.featured ? 1 : 0) : Number(existing.featured),
    id
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.delete('/api/admin/news/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM news WHERE id = ?').run(Number(req.params.id));
  broadcastFullState();
  res.json({ ok: true });
});

app.post('/api/admin/competitions', requireAdmin, (req, res) => {
  const name = sanitizeText(req.body?.name, 100);
  if (!name) {
    res.status(400).json({ error: 'Competition name is required.' });
    return;
  }
  db.prepare(
    'INSERT INTO competitions (name, format, status, teamsCount, prizePool, season, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    name,
    sanitizeText(req.body?.format, 80) || 'League & Knockout',
    sanitizeText(req.body?.status, 40) || 'Active',
    Math.max(2, Math.min(128, Number(req.body?.teamsCount) || 16)),
    sanitizeText(req.body?.prizePool, 80) || 'Championship Trophy',
    sanitizeText(req.body?.season, 30) || '2026/27',
    sanitizeText(req.body?.description, 400) || ''
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.delete('/api/admin/competitions/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM competitions WHERE id = ?').run(Number(req.params.id));
  broadcastFullState();
  res.json({ ok: true });
});

app.post('/api/admin/events', requireAdmin, (req, res) => {
  const title = sanitizeText(req.body?.title, 100);
  if (!title) {
    res.status(400).json({ error: 'Event title is required.' });
    return;
  }
  db.prepare(
    'INSERT INTO upcoming_events (title, competition, homeTeam, awayTeam, kickoffTime, venue, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    title,
    sanitizeText(req.body?.competition, 80) || 'FTD League',
    sanitizeText(req.body?.homeTeam, 60) || 'TBD',
    sanitizeText(req.body?.awayTeam, 60) || 'TBD',
    sanitizeText(req.body?.kickoffTime, 60) || 'Upcoming',
    sanitizeText(req.body?.venue, 80) || 'FTD Arena',
    sanitizeText(req.body?.status, 40) || 'Scheduled'
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.delete('/api/admin/events/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM upcoming_events WHERE id = ?').run(Number(req.params.id));
  broadcastFullState();
  res.json({ ok: true });
});

// ---- Admin B: Ballon d'Or Management ----

app.post('/api/admin/nominees', requireAdmin, (req, res) => {
  const name = sanitizeText(req.body?.name, 80);
  const club = sanitizeText(req.body?.club, 80);
  if (!name || !club) {
    res.status(400).json({ error: 'Player name and club are required.' });
    return;
  }
  const maxRankRow = db.prepare('SELECT MAX(rankOrder) as maxRank FROM ballon_dor_nominees').get() as {
    maxRank: number | null;
  };
  const nextRank = Number(req.body?.rankOrder) || (maxRankRow?.maxRank ? maxRankRow.maxRank + 1 : 1);

  db.prepare(`
    INSERT INTO ballon_dor_nominees (
      name, club, position, nationality, kitNumber, imageUrl,
      goals, assists, trophies, rating, votes, rankOrder, isWinner
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    club,
    sanitizeText(req.body?.position, 10) || 'FW',
    sanitizeText(req.body?.nationality, 40) || 'International',
    Math.max(1, Math.min(99, Number(req.body?.kitNumber) || 10)),
    sanitizeImageUrl(req.body?.imageUrl),
    Math.max(0, Number(req.body?.goals) || 0),
    Math.max(0, Number(req.body?.assists) || 0),
    Math.max(0, Number(req.body?.trophies) || 0),
    Math.max(50, Math.min(99.9, Number(req.body?.rating) || 89.0)),
    Math.max(0, Number(req.body?.votes) || 0),
    nextRank,
    0
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.put('/api/admin/nominees/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM ballon_dor_nominees WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Nominee not found.' });
    return;
  }

  db.prepare(`
    UPDATE ballon_dor_nominees SET
      name = ?,
      club = ?,
      position = ?,
      nationality = ?,
      kitNumber = ?,
      imageUrl = ?,
      goals = ?,
      assists = ?,
      trophies = ?,
      rating = ?,
      votes = ?,
      rankOrder = ?
    WHERE id = ?
  `).run(
    sanitizeText(req.body?.name, 80) || String(existing.name),
    sanitizeText(req.body?.club, 80) || String(existing.club),
    sanitizeText(req.body?.position, 10) || String(existing.position),
    sanitizeText(req.body?.nationality, 40) || String(existing.nationality),
    req.body?.kitNumber !== undefined ? Math.max(1, Math.min(99, Number(req.body.kitNumber))) : Number(existing.kitNumber),
    req.body?.imageUrl !== undefined ? sanitizeImageUrl(req.body.imageUrl) : String(existing.imageUrl),
    req.body?.goals !== undefined ? Math.max(0, Number(req.body.goals)) : Number(existing.goals),
    req.body?.assists !== undefined ? Math.max(0, Number(req.body.assists)) : Number(existing.assists),
    req.body?.trophies !== undefined ? Math.max(0, Number(req.body.trophies)) : Number(existing.trophies),
    req.body?.rating !== undefined ? Math.max(50, Math.min(99.9, Number(req.body.rating))) : Number(existing.rating),
    req.body?.votes !== undefined ? Math.max(0, Number(req.body.votes)) : Number(existing.votes),
    req.body?.rankOrder !== undefined ? Math.max(1, Number(req.body.rankOrder)) : Number(existing.rankOrder),
    id
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.delete('/api/admin/nominees/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM ballon_dor_nominees WHERE id = ?').run(id);
  db.prepare('UPDATE ballon_dor_state SET winnerId = NULL WHERE winnerId = ?').run(id);
  broadcastFullState();
  res.json({ ok: true });
});

app.put('/api/admin/ballondor/state', requireAdmin, (req, res) => {
  const current = db.prepare('SELECT * FROM ballon_dor_state WHERE id = 1').get() as Record<string, unknown>;
  const nextWinnerId =
    req.body?.winnerId !== undefined
      ? req.body.winnerId === null
        ? null
        : Number(req.body.winnerId)
      : current.winnerId !== null
      ? Number(current.winnerId)
      : null;

  const nextPhase = req.body?.ceremonyPhase || String(current.ceremonyPhase);
  const validPhase = ['idle', 'countdown', 'revealed'].includes(nextPhase) ? nextPhase : 'idle';

  db.transaction(() => {
    db.prepare(`
      UPDATE ballon_dor_state SET
        ceremonyTitle = ?,
        seasonYear = ?,
        votingEnabled = ?,
        ceremonyPhase = ?,
        winnerId = ?,
        ceremonyDate = ?
      WHERE id = 1
    `).run(
      sanitizeText(req.body?.ceremonyTitle, 100) || String(current.ceremonyTitle),
      sanitizeText(req.body?.seasonYear, 20) || String(current.seasonYear),
      req.body?.votingEnabled !== undefined ? (req.body.votingEnabled ? 1 : 0) : Number(current.votingEnabled),
      validPhase,
      nextWinnerId,
      sanitizeText(req.body?.ceremonyDate, 40) || String(current.ceremonyDate)
    );

    if (req.body?.winnerId !== undefined) {
      db.prepare('UPDATE ballon_dor_nominees SET isWinner = 0').run();
      if (nextWinnerId !== null) {
        db.prepare('UPDATE ballon_dor_nominees SET isWinner = 1, rankOrder = 1 WHERE id = ?').run(nextWinnerId);
      }
    }
  })();

  broadcastFullState(
    validPhase === 'revealed' && nextWinnerId
      ? { type: 'ceremony:reveal', payload: { winnerId: nextWinnerId } }
      : undefined
  );
  res.json({ ok: true });
});

app.post('/api/admin/ballondor/history', requireAdmin, (req, res) => {
  const year = sanitizeText(req.body?.year, 10);
  const winnerName = sanitizeText(req.body?.winnerName, 80);
  const club = sanitizeText(req.body?.club, 80);
  if (!year || !winnerName || !club) {
    res.status(400).json({ error: 'Year, winner name, and club are required.' });
    return;
  }
  db.prepare(
    'INSERT INTO ballon_dor_history (year, winnerName, club, statsSummary, imageUrl) VALUES (?, ?, ?, ?, ?)'
  ).run(
    year,
    winnerName,
    club,
    sanitizeText(req.body?.statsSummary, 160) || 'Official FTD Ballon d\'Or Winner',
    sanitizeImageUrl(req.body?.imageUrl)
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.delete('/api/admin/ballondor/history/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM ballon_dor_history WHERE id = ?').run(Number(req.params.id));
  broadcastFullState();
  res.json({ ok: true });
});

// ---- Admin C: Teams & Live Match / Scoreboard / Stream Management ----

app.post('/api/admin/teams', requireAdmin, (req, res) => {
  const name = sanitizeText(req.body?.name, 60);
  const shortName = (sanitizeText(req.body?.shortName, 5) || name.slice(0, 3)).toUpperCase();
  if (!name) {
    res.status(400).json({ error: 'Team name is required.' });
    return;
  }
  db.prepare(
    'INSERT INTO teams (name, shortName, primaryColor, secondaryColor, logoUrl) VALUES (?, ?, ?, ?, ?)'
  ).run(
    name,
    shortName,
    sanitizeColor(req.body?.primaryColor, '#FFFFFF'),
    sanitizeColor(req.body?.secondaryColor, '#111827'),
    sanitizeImageUrl(req.body?.logoUrl)
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.put('/api/admin/teams/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Team not found.' });
    return;
  }
  db.prepare(
    'UPDATE teams SET name = ?, shortName = ?, primaryColor = ?, secondaryColor = ?, logoUrl = ? WHERE id = ?'
  ).run(
    sanitizeText(req.body?.name, 60) || String(existing.name),
    (sanitizeText(req.body?.shortName, 5) || String(existing.shortName)).toUpperCase(),
    req.body?.primaryColor ? sanitizeColor(req.body.primaryColor, String(existing.primaryColor)) : String(existing.primaryColor),
    req.body?.secondaryColor ? sanitizeColor(req.body.secondaryColor, String(existing.secondaryColor)) : String(existing.secondaryColor),
    req.body?.logoUrl !== undefined ? sanitizeImageUrl(req.body.logoUrl) : String(existing.logoUrl),
    id
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.delete('/api/admin/teams/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM teams WHERE id = ?').run(Number(req.params.id));
  broadcastFullState();
  res.json({ ok: true });
});

app.put('/api/admin/live', requireAdmin, (req, res) => {
  const current = db.prepare('SELECT * FROM live_match WHERE id = 1').get() as Record<string, unknown>;
  const edition = ['champions-league', 'premier-league', 'bundesliga', 'world-cup'].includes(
    req.body?.scoreboardEdition
  )
    ? req.body.scoreboardEdition
    : String(current.scoreboardEdition);

  const status = ['PRE_MATCH', 'LIVE', 'HALFTIME', 'PAUSED', 'ENDED'].includes(req.body?.status)
    ? req.body.status
    : String(current.status);

  let homeTeamId = req.body?.homeTeamId !== undefined ? Number(req.body.homeTeamId) : Number(current.homeTeamId);
  let awayTeamId = req.body?.awayTeamId !== undefined ? Number(req.body.awayTeamId) : Number(current.awayTeamId);

  let homeTeamName = req.body?.homeTeamName !== undefined ? sanitizeText(req.body.homeTeamName, 60) : String(current.homeTeamName);
  let awayTeamName = req.body?.awayTeamName !== undefined ? sanitizeText(req.body.awayTeamName, 60) : String(current.awayTeamName);
  let homeTeamShort = req.body?.homeTeamShort !== undefined ? sanitizeText(req.body.homeTeamShort, 5).toUpperCase() : String(current.homeTeamShort);
  let awayTeamShort = req.body?.awayTeamShort !== undefined ? sanitizeText(req.body.awayTeamShort, 5).toUpperCase() : String(current.awayTeamShort);
  let homeTeamLogo = req.body?.homeTeamLogo !== undefined ? sanitizeImageUrl(req.body.homeTeamLogo) : String(current.homeTeamLogo);
  let awayTeamLogo = req.body?.awayTeamLogo !== undefined ? sanitizeImageUrl(req.body.awayTeamLogo) : String(current.awayTeamLogo);
  let homeTeamColor = req.body?.homeTeamColor !== undefined ? sanitizeColor(req.body.homeTeamColor, '#FFFFFF') : String(current.homeTeamColor);
  let awayTeamColor = req.body?.awayTeamColor !== undefined ? sanitizeColor(req.body.awayTeamColor, '#38BDF8') : String(current.awayTeamColor);

  // If admin selected a team preset by ID, hydrate team fields automatically unless overridden
  if (req.body?.selectHomeTeamId) {
    const t = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(req.body.selectHomeTeamId)) as
      | Record<string, unknown>
      | undefined;
    if (t) {
      homeTeamId = Number(t.id);
      homeTeamName = String(t.name);
      homeTeamShort = String(t.shortName);
      homeTeamLogo = String(t.logoUrl || '');
      homeTeamColor = String(t.primaryColor || '#FFFFFF');
    }
  }
  if (req.body?.selectAwayTeamId) {
    const t = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(req.body.selectAwayTeamId)) as
      | Record<string, unknown>
      | undefined;
    if (t) {
      awayTeamId = Number(t.id);
      awayTeamName = String(t.name);
      awayTeamShort = String(t.shortName);
      awayTeamLogo = String(t.logoUrl || '');
      awayTeamColor = String(t.primaryColor || '#38BDF8');
    }
  }

  db.prepare(`
    UPDATE live_match SET
      streamActive = ?,
      streamUrl = ?,
      streamTitle = ?,
      competitionName = ?,
      stadiumName = ?,
      scoreboardEdition = ?,
      homeTeamId = ?,
      awayTeamId = ?,
      homeTeamName = ?,
      awayTeamName = ?,
      homeTeamShort = ?,
      awayTeamShort = ?,
      homeTeamLogo = ?,
      awayTeamLogo = ?,
      homeTeamColor = ?,
      awayTeamColor = ?,
      homeScore = ?,
      awayScore = ?,
      matchMinute = ?,
      matchSecond = ?,
      clockRunning = ?,
      halfLabel = ?,
      status = ?
    WHERE id = 1
  `).run(
    req.body?.streamActive !== undefined ? (req.body.streamActive ? 1 : 0) : Number(current.streamActive),
    req.body?.streamUrl !== undefined ? sanitizeStreamUrl(req.body.streamUrl) : String(current.streamUrl),
    sanitizeText(req.body?.streamTitle, 120) || String(current.streamTitle),
    sanitizeText(req.body?.competitionName, 80) || String(current.competitionName),
    sanitizeText(req.body?.stadiumName, 80) || String(current.stadiumName),
    edition,
    homeTeamId || null,
    awayTeamId || null,
    homeTeamName || 'Home Team',
    awayTeamName || 'Away Team',
    homeTeamShort || 'HOM',
    awayTeamShort || 'AWY',
    homeTeamLogo,
    awayTeamLogo,
    homeTeamColor,
    awayTeamColor,
    req.body?.homeScore !== undefined ? Math.max(0, Math.min(99, Number(req.body.homeScore))) : Number(current.homeScore),
    req.body?.awayScore !== undefined ? Math.max(0, Math.min(99, Number(req.body.awayScore))) : Number(current.awayScore),
    req.body?.matchMinute !== undefined ? Math.max(0, Math.min(130, Number(req.body.matchMinute))) : Number(current.matchMinute),
    req.body?.matchSecond !== undefined ? Math.max(0, Math.min(59, Number(req.body.matchSecond))) : Number(current.matchSecond),
    req.body?.clockRunning !== undefined ? (req.body.clockRunning ? 1 : 0) : Number(current.clockRunning),
    sanitizeText(req.body?.halfLabel, 24) || String(current.halfLabel),
    status
  );

  broadcastFullState();
  res.json({ ok: true });
});

app.post('/api/admin/live/goal', requireAdmin, (req, res) => {
  const side = req.body?.side === 'away' ? 'away' : 'home';
  const scorer = sanitizeText(req.body?.scorer, 60);
  const current = db.prepare('SELECT * FROM live_match WHERE id = 1').get() as Record<string, unknown>;

  const minute = Number(current.matchMinute) || 1;
  const nextHomeScore = side === 'home' ? Number(current.homeScore) + 1 : Number(current.homeScore);
  const nextAwayScore = side === 'away' ? Number(current.awayScore) + 1 : Number(current.awayScore);
  const teamName = side === 'home' ? String(current.homeTeamName) : String(current.awayTeamName);
  const goalId = Number(current.lastGoalId || 0) + 1;

  db.transaction(() => {
    db.prepare(`
      UPDATE live_match SET
        homeScore = ?,
        awayScore = ?,
        lastGoalId = ?,
        lastGoalTeam = ?,
        lastGoalScorer = ?,
        lastGoalMinute = ?
      WHERE id = 1
    `).run(nextHomeScore, nextAwayScore, goalId, side, scorer, minute);

    db.prepare(
      'INSERT INTO match_events (type, teamSide, teamName, playerName, minute, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('GOAL', side, teamName, scorer || `${teamName} Goal`, minute, new Date().toISOString());
  })();

  broadcastFullState({
    type: 'match:goal',
    payload: {
      goalId,
      side,
      teamName,
      scorer,
      minute,
      homeScore: nextHomeScore,
      awayScore: nextAwayScore,
    },
  });

  res.json({ ok: true, goalId });
});

app.post('/api/admin/live/undo-goal', requireAdmin, (_req, res) => {
  const latestGoal = db
    .prepare("SELECT * FROM match_events WHERE type = 'GOAL' ORDER BY id DESC LIMIT 1")
    .get() as Record<string, unknown> | undefined;
  const current = db.prepare('SELECT * FROM live_match WHERE id = 1').get() as Record<string, unknown>;

  if (!latestGoal) {
    res.status(400).json({ error: 'No goal event available to undo.' });
    return;
  }

  const side = String(latestGoal.teamSide);
  const nextHome = side === 'home' ? Math.max(0, Number(current.homeScore) - 1) : Number(current.homeScore);
  const nextAway = side === 'away' ? Math.max(0, Number(current.awayScore) - 1) : Number(current.awayScore);

  db.transaction(() => {
    db.prepare('DELETE FROM match_events WHERE id = ?').run(Number(latestGoal.id));
    db.prepare('UPDATE live_match SET homeScore = ?, awayScore = ? WHERE id = 1').run(nextHome, nextAway);
  })();

  broadcastFullState();
  res.json({ ok: true });
});

app.post('/api/admin/live/control', requireAdmin, (req, res) => {
  const action = String(req.body?.action || '');
  const current = db.prepare('SELECT * FROM live_match WHERE id = 1').get() as Record<string, unknown>;
  const minute = Number(current.matchMinute);
  const now = new Date().toISOString();

  db.transaction(() => {
    switch (action) {
      case 'start':
        db.prepare(
          "UPDATE live_match SET status = 'LIVE', clockRunning = 1, halfLabel = '1ST HALF', matchMinute = ?, matchSecond = 0 WHERE id = 1"
        ).run(minute === 0 ? 0 : minute);
        db.prepare(
          'INSERT INTO match_events (type, teamSide, teamName, playerName, minute, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('KICKOFF', 'neutral', 'Match Official', 'Kick-off — 1st Half Underway', 0, now);
        break;
      case 'pause':
        db.prepare("UPDATE live_match SET status = 'PAUSED', clockRunning = 0 WHERE id = 1").run();
        break;
      case 'resume':
        db.prepare("UPDATE live_match SET status = 'LIVE', clockRunning = 1 WHERE id = 1").run();
        break;
      case 'halftime':
        db.prepare(
          "UPDATE live_match SET status = 'HALFTIME', clockRunning = 0, halfLabel = 'HT' WHERE id = 1"
        ).run();
        db.prepare(
          'INSERT INTO match_events (type, teamSide, teamName, playerName, minute, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('HALFTIME', 'neutral', 'Match Official', 'Half-Time Whistle', minute, now);
        break;
      case 'second_half':
        db.prepare(
          "UPDATE live_match SET status = 'LIVE', clockRunning = 1, halfLabel = '2ND HALF', matchMinute = ?, matchSecond = 0 WHERE id = 1"
        ).run(Math.max(45, minute));
        db.prepare(
          'INSERT INTO match_events (type, teamSide, teamName, playerName, minute, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('KICKOFF', 'neutral', 'Match Official', '2nd Half Underway', Math.max(45, minute), now);
        break;
      case 'end':
        db.prepare(
          "UPDATE live_match SET status = 'ENDED', clockRunning = 0, halfLabel = 'FT' WHERE id = 1"
        ).run();
        db.prepare(
          'INSERT INTO match_events (type, teamSide, teamName, playerName, minute, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('FULLTIME', 'neutral', 'Match Official', 'Full-Time Whistle', minute, now);
        break;
      case 'reset':
        db.prepare(`
          UPDATE live_match SET
            homeScore = 0, awayScore = 0, matchMinute = 0, matchSecond = 0,
            clockRunning = 0, halfLabel = 'PRE-MATCH', status = 'PRE_MATCH',
            lastGoalId = 0, lastGoalTeam = NULL, lastGoalScorer = '', lastGoalMinute = 0
          WHERE id = 1
        `).run();
        db.prepare('DELETE FROM match_events').run();
        break;
      default:
        break;
    }
  })();

  broadcastFullState();
  res.json({ ok: true });
});

app.post('/api/admin/live/events', requireAdmin, (req, res) => {
  const validTypes = ['GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUB', 'KICKOFF', 'HALFTIME', 'FULLTIME'];
  const type = validTypes.includes(req.body?.type) ? req.body.type : 'YELLOW_CARD';
  const teamSide = ['home', 'away', 'neutral'].includes(req.body?.teamSide) ? req.body.teamSide : 'home';
  const current = db.prepare('SELECT * FROM live_match WHERE id = 1').get() as Record<string, unknown>;
  const defaultTeam =
    teamSide === 'home'
      ? String(current.homeTeamName)
      : teamSide === 'away'
      ? String(current.awayTeamName)
      : 'Match Official';

  db.prepare(
    'INSERT INTO match_events (type, teamSide, teamName, playerName, minute, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    type,
    teamSide,
    sanitizeText(req.body?.teamName, 60) || defaultTeam,
    sanitizeText(req.body?.playerName, 80) || 'Match Event',
    Math.max(0, Math.min(130, Number(req.body?.minute ?? current.matchMinute))),
    new Date().toISOString()
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.delete('/api/admin/live/events/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM match_events WHERE id = ?').run(Number(req.params.id));
  broadcastFullState();
  res.json({ ok: true });
});

app.delete('/api/admin/chat/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM live_chat WHERE id = ?').run(Number(req.params.id));
  broadcastFullState();
  res.json({ ok: true });
});

app.post('/api/admin/chat/clear', requireAdmin, (_req, res) => {
  db.prepare('DELETE FROM live_chat').run();
  broadcastFullState();
  res.json({ ok: true });
});

// ---- Admin D: User & General Roster Management ----

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const username = sanitizeText(req.body?.username, 50);
  if (!username) {
    res.status(400).json({ error: 'Username is required.' });
    return;
  }
  const role = ['Player', 'Captain', 'Broadcaster', 'Moderator'].includes(req.body?.role)
    ? req.body.role
    : 'Player';
  const status = req.body?.status === 'Suspended' ? 'Suspended' : 'Active';
  db.prepare('INSERT INTO managed_users (username, club, role, status, joinedAt) VALUES (?, ?, ?, ?, ?)').run(
    username,
    sanitizeText(req.body?.club, 60) || 'Free Agent',
    role,
    status,
    new Date().toISOString().slice(0, 10)
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM managed_users WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const role = ['Player', 'Captain', 'Broadcaster', 'Moderator'].includes(req.body?.role)
    ? req.body.role
    : String(existing.role);
  const status = req.body?.status === 'Suspended' ? 'Suspended' : req.body?.status === 'Active' ? 'Active' : String(existing.status);
  db.prepare('UPDATE managed_users SET username = ?, club = ?, role = ?, status = ? WHERE id = ?').run(
    sanitizeText(req.body?.username, 50) || String(existing.username),
    sanitizeText(req.body?.club, 60) || String(existing.club),
    role,
    status,
    id
  );
  broadcastFullState();
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM managed_users WHERE id = ?').run(Number(req.params.id));
  broadcastFullState();
  res.json({ ok: true });
});

// ---- Vite Dev Middleware / Production Static Serving ----

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`FTD platform server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
