import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { createDefaultPlatformState } from '../data/defaultState';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  BallonDorHistoryItem,
  BallonDorNominee,
  BallonDorState,
  ChatMessage,
  CompetitionItem,
  LiveMatchState,
  ManagedUser,
  MatchEvent,
  MatchStatus,
  NewsItem,
  PlatformState,
  ScoreboardEdition,
  SiteSettings,
  Team,
  UpcomingEvent,
} from '../types/ftd';

export interface FirestoreLiveMatchDoc extends LiveMatchState {
  clockAnchorMs: number | null;
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
    return trimmed.length <= 390_000 ? trimmed : '';
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

function nextNumericId(): number {
  return Date.now() * 100 + Math.floor(Math.random() * 100);
}

export function computeSyncedClock(liveMatch: FirestoreLiveMatchDoc): {
  matchMinute: number;
  matchSecond: number;
} {
  if (liveMatch.clockRunning && liveMatch.status === 'LIVE' && liveMatch.clockAnchorMs) {
    const elapsedSec = Math.max(0, Math.floor((Date.now() - liveMatch.clockAnchorMs) / 1000));
    const totalSec = liveMatch.matchMinute * 60 + liveMatch.matchSecond + elapsedSec;
    return {
      matchMinute: Math.min(130, Math.floor(totalSec / 60)),
      matchSecond: totalSec % 60,
    };
  }
  return {
    matchMinute: liveMatch.matchMinute,
    matchSecond: liveMatch.matchSecond,
  };
}

function toLiveMatchDoc(lm: LiveMatchState, clockAnchorMs: number | null): FirestoreLiveMatchDoc {
  return {
    streamActive: Boolean(lm.streamActive),
    streamUrl: sanitizeStreamUrl(lm.streamUrl),
    streamTitle: sanitizeText(lm.streamTitle, 140) || 'FTD Live Broadcast',
    competitionName: sanitizeText(lm.competitionName, 100) || 'FTD Champions League',
    stadiumName: sanitizeText(lm.stadiumName, 100) || 'FTD National Arena',
    scoreboardEdition: lm.scoreboardEdition,
    homeTeamId: lm.homeTeamId ?? null,
    awayTeamId: lm.awayTeamId ?? null,
    homeTeamName: sanitizeText(lm.homeTeamName, 60) || 'Home Team',
    awayTeamName: sanitizeText(lm.awayTeamName, 60) || 'Away Team',
    homeTeamShort: sanitizeText(lm.homeTeamShort, 6).toUpperCase() || 'HOM',
    awayTeamShort: sanitizeText(lm.awayTeamShort, 6).toUpperCase() || 'AWY',
    homeTeamLogo: sanitizeImageUrl(lm.homeTeamLogo),
    awayTeamLogo: sanitizeImageUrl(lm.awayTeamLogo),
    homeTeamColor: sanitizeColor(lm.homeTeamColor, '#FFFFFF'),
    awayTeamColor: sanitizeColor(lm.awayTeamColor, '#38BDF8'),
    homeScore: Math.max(0, Math.min(99, Number(lm.homeScore) || 0)),
    awayScore: Math.max(0, Math.min(99, Number(lm.awayScore) || 0)),
    matchMinute: Math.max(0, Math.min(130, Number(lm.matchMinute) || 0)),
    matchSecond: Math.max(0, Math.min(59, Number(lm.matchSecond) || 0)),
    clockRunning: Boolean(lm.clockRunning),
    clockAnchorMs,
    halfLabel: sanitizeText(lm.halfLabel, 30) || 'PRE-MATCH',
    status: lm.status,
    lastGoalId: Math.max(0, Number(lm.lastGoalId) || 0),
    lastGoalTeam: lm.lastGoalTeam ?? null,
    lastGoalScorer: sanitizeText(lm.lastGoalScorer, 80),
    lastGoalMinute: Math.max(0, Math.min(130, Number(lm.lastGoalMinute) || 0)),
    viewerCount: Math.max(1, Number(lm.viewerCount) || 1),
  };
}

let seedPromise: Promise<void> | null = null;

export async function ensureFirestoreSeeded(adminUid?: string, adminEmail?: string): Promise<void> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      const siteRef = doc(db, 'platform', 'site');
      const siteSnap = await getDoc(siteRef);
      if (siteSnap.exists()) {
        return;
      }

      const defaults = createDefaultPlatformState();
      const batch = writeBatch(db);

      batch.set(doc(db, 'platform', 'site'), defaults.site);
      batch.set(doc(db, 'platform', 'liveMatch'), toLiveMatchDoc(defaults.liveMatch, null));
      batch.set(doc(db, 'platform', 'ballonDor'), defaults.ballonDorState);

      for (const item of defaults.news) {
        batch.set(doc(db, 'news', String(item.id)), item);
      }
      for (const comp of defaults.competitions) {
        batch.set(doc(db, 'competitions', String(comp.id)), comp);
      }
      for (const ev of defaults.upcomingEvents) {
        batch.set(doc(db, 'upcomingEvents', String(ev.id)), ev);
      }
      for (const nom of defaults.nominees) {
        batch.set(doc(db, 'nominees', String(nom.id)), nom);
      }
      for (const hist of defaults.ballonDorHistory) {
        batch.set(doc(db, 'ballonDorHistory', String(hist.id)), hist);
      }
      for (const team of defaults.teams) {
        batch.set(doc(db, 'teams', String(team.id)), team);
      }
      for (const msg of defaults.chatMessages) {
        batch.set(doc(db, 'chatMessages', String(msg.id)), msg);
      }
      for (const u of defaults.users) {
        batch.set(doc(db, 'managedUsers', String(u.id)), u);
      }
      if (adminUid && adminEmail) {
        batch.set(doc(db, 'admins', adminUid), {
          uid: adminUid,
          email: adminEmail.slice(0, 200),
          createdAt: new Date().toISOString().slice(0, 40),
        });
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'platform/site');
    } finally {
      seedPromise = null;
    }
  })();

  return seedPromise;
}

export interface LiveSubscriptionCallbacks {
  onSite: (site: SiteSettings) => void;
  onLiveMatch: (liveMatch: FirestoreLiveMatchDoc) => void;
  onBallonDor: (bd: BallonDorState) => void;
  onNews: (news: NewsItem[]) => void;
  onCompetitions: (competitions: CompetitionItem[]) => void;
  onUpcomingEvents: (events: UpcomingEvent[]) => void;
  onNominees: (nominees: BallonDorNominee[]) => void;
  onHistory: (history: BallonDorHistoryItem[]) => void;
  onTeams: (teams: Team[]) => void;
  onMatchEvents: (events: MatchEvent[]) => void;
  onChatMessages: (messages: ChatMessage[]) => void;
  onError: (err: Error) => void;
}

export function subscribePublicFirestore(cb: LiveSubscriptionCallbacks): () => void {
  const unsubs: Unsubscribe[] = [];

  const handleErr = (op: OperationType, path: string) => (err: unknown) => {
    try {
      handleFirestoreError(err, op, path);
    } catch (wrapped) {
      cb.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
    }
  };

  unsubs.push(
    onSnapshot(
      doc(db, 'platform', 'site'),
      (snap) => {
        if (snap.exists()) cb.onSite(snap.data() as SiteSettings);
      },
      handleErr(OperationType.GET, 'platform/site')
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'platform', 'liveMatch'),
      (snap) => {
        if (snap.exists()) cb.onLiveMatch(snap.data() as FirestoreLiveMatchDoc);
      },
      handleErr(OperationType.GET, 'platform/liveMatch')
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'platform', 'ballonDor'),
      (snap) => {
        if (snap.exists()) cb.onBallonDor(snap.data() as BallonDorState);
      },
      handleErr(OperationType.GET, 'platform/ballonDor')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'news'),
      (snap) => {
        const items = snap.docs
          .map((d) => d.data() as NewsItem)
          .sort((a, b) => Number(b.featured) - Number(a.featured) || b.id - a.id);
        if (!snap.empty || snap.metadata.fromCache === false) cb.onNews(items);
      },
      handleErr(OperationType.LIST, 'news')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'competitions'),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as CompetitionItem).sort((a, b) => a.id - b.id);
        if (!snap.empty || snap.metadata.fromCache === false) cb.onCompetitions(items);
      },
      handleErr(OperationType.LIST, 'competitions')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'upcomingEvents'),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as UpcomingEvent).sort((a, b) => a.id - b.id);
        if (!snap.empty || snap.metadata.fromCache === false) cb.onUpcomingEvents(items);
      },
      handleErr(OperationType.LIST, 'upcomingEvents')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'nominees'),
      (snap) => {
        const items = snap.docs
          .map((d) => d.data() as BallonDorNominee)
          .sort((a, b) => a.rankOrder - b.rankOrder || b.votes - a.votes || a.id - b.id);
        if (!snap.empty || snap.metadata.fromCache === false) cb.onNominees(items);
      },
      handleErr(OperationType.LIST, 'nominees')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'ballonDorHistory'),
      (snap) => {
        const items = snap.docs
          .map((d) => d.data() as BallonDorHistoryItem)
          .sort((a, b) => b.year.localeCompare(a.year));
        if (!snap.empty || snap.metadata.fromCache === false) cb.onHistory(items);
      },
      handleErr(OperationType.LIST, 'ballonDorHistory')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'teams'),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as Team).sort((a, b) => a.id - b.id);
        if (!snap.empty || snap.metadata.fromCache === false) cb.onTeams(items);
      },
      handleErr(OperationType.LIST, 'teams')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'matchEvents'),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as MatchEvent).sort((a, b) => b.id - a.id);
        if (!snap.empty || snap.metadata.fromCache === false) cb.onMatchEvents(items);
      },
      handleErr(OperationType.LIST, 'matchEvents')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'chatMessages'),
      (snap) => {
        const items = snap.docs
          .map((d) => d.data() as ChatMessage)
          .sort((a, b) => a.id - b.id)
          .slice(-60);
        if (!snap.empty || snap.metadata.fromCache === false) cb.onChatMessages(items);
      },
      handleErr(OperationType.LIST, 'chatMessages')
    )
  );

  return () => {
    unsubs.forEach((fn) => fn());
  };
}

export function subscribeAdminUsers(
  onUsers: (users: ManagedUser[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'managedUsers'),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as ManagedUser).sort((a, b) => b.id - a.id);
      onUsers(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'managedUsers');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function executeFirestoreApi<T = unknown>(
  path: string,
  options: RequestInit,
  currentState: PlatformState,
  liveClockAnchorMs: number | null,
  isAdmin: boolean
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  const method = (options.method || 'GET').toUpperCase();
  let body: Record<string, unknown> = {};
  if (typeof options.body === 'string' && options.body.trim()) {
    try {
      body = JSON.parse(options.body) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  try {
    // Ensure database is initialized with baseline collections before mutating
    if (isAdmin && path.startsWith('/api/admin/')) {
      const siteSnap = await getDoc(doc(db, 'platform', 'site'));
      if (!siteSnap.exists()) {
        await ensureFirestoreSeeded();
      }
    }

    // ---- Public Endpoints ----
    if (method === 'POST' && path === '/api/public/vote') {
      if (!currentState.ballonDorState.votingEnabled) {
        return { ok: false, error: 'Fan voting is currently closed by the FTD Committee.', status: 403 };
      }
      const nomineeId = Number(body.nomineeId);
      if (!Number.isInteger(nomineeId) || nomineeId <= 0) {
        return { ok: false, error: 'Invalid nominee.', status: 400 };
      }
      const nomineeRef = doc(db, 'nominees', String(nomineeId));
      const snap = await getDoc(nomineeRef);
      if (!snap.exists()) {
        return { ok: false, error: 'Nominee not found.', status: 404 };
      }
      await updateDoc(nomineeRef, { votes: increment(1) });
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/public/chat') {
      if (!currentState.site.chatEnabled) {
        return { ok: false, error: 'Live chat is currently disabled.', status: 403 };
      }
      const sender = sanitizeText(body.sender, 32) || 'Supporter';
      const message = sanitizeText(body.message, 240);
      if (!message) {
        return { ok: false, error: 'Message cannot be empty.', status: 400 };
      }
      const id = nextNumericId();
      const chatMsg: ChatMessage = {
        id,
        sender,
        message,
        isAdmin,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'chatMessages', String(id)), chatMsg);
      return { ok: true, data: chatMsg as T, status: 200 };
    }

    // ---- Protected Admin Endpoints ----
    if (!isAdmin) {
      return { ok: false, error: 'Admin Google Sign-In required.', status: 401 };
    }

    if (method === 'PUT' && path === '/api/admin/site') {
      const s = currentState.site;
      const nextSite: SiteSettings = {
        brandName: sanitizeText(body.brandName, 40) || s.brandName,
        logoUrl:
          body.logoUrl !== undefined
            ? sanitizeImageUrl(body.logoUrl) || '/assets/aistudio/IMG_0674_a69c6a83.png'
            : s.logoUrl,
        heroEyebrow: sanitizeText(body.heroEyebrow, 120) || s.heroEyebrow,
        heroTitle: sanitizeText(body.heroTitle, 180) || s.heroTitle,
        heroSubtitle: sanitizeText(body.heroSubtitle, 450) || s.heroSubtitle,
        gameIntroTitle: sanitizeText(body.gameIntroTitle, 140) || s.gameIntroTitle,
        gameIntroBody: sanitizeText(body.gameIntroBody, 1400) || s.gameIntroBody,
        announcementText:
          body.announcementText !== undefined
            ? sanitizeText(body.announcementText, 240)
            : s.announcementText,
        announcementActive:
          body.announcementActive !== undefined ? Boolean(body.announcementActive) : s.announcementActive,
        seasonLabel: sanitizeText(body.seasonLabel, 60) || s.seasonLabel,
        maintenanceMode:
          body.maintenanceMode !== undefined ? Boolean(body.maintenanceMode) : s.maintenanceMode,
        chatEnabled: body.chatEnabled !== undefined ? Boolean(body.chatEnabled) : s.chatEnabled,
        lastPublishedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'platform', 'site'), nextSite);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/news') {
      const title = sanitizeText(body.title, 140);
      const summary = sanitizeText(body.summary, 320);
      if (!title || !summary) {
        return { ok: false, error: 'Title and summary are required.', status: 400 };
      }
      const id = nextNumericId();
      const article: NewsItem = {
        id,
        title,
        category: sanitizeText(body.category, 40) || 'News',
        summary,
        body: sanitizeText(body.body, 2400) || summary,
        imageUrl: sanitizeImageUrl(body.imageUrl),
        featured: Boolean(body.featured),
        publishedAt: sanitizeText(body.publishedAt, 30) || new Date().toISOString().slice(0, 10),
      };
      await setDoc(doc(db, 'news', String(id)), article);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'PUT' && path.startsWith('/api/admin/news/')) {
      const id = Number(path.split('/').pop());
      const existing = currentState.news.find((n) => n.id === id);
      if (!existing) return { ok: false, error: 'Article not found.', status: 404 };
      const updated: NewsItem = {
        ...existing,
        title: sanitizeText(body.title, 140) || existing.title,
        category: sanitizeText(body.category, 40) || existing.category,
        summary: sanitizeText(body.summary, 320) || existing.summary,
        body: sanitizeText(body.body, 2400) || existing.body,
        imageUrl: body.imageUrl !== undefined ? sanitizeImageUrl(body.imageUrl) : existing.imageUrl,
        featured: body.featured !== undefined ? Boolean(body.featured) : existing.featured,
      };
      await setDoc(doc(db, 'news', String(id)), updated);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/news/')) {
      const id = path.split('/').pop() || '';
      await deleteDoc(doc(db, 'news', id));
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/competitions') {
      const name = sanitizeText(body.name, 100);
      if (!name) return { ok: false, error: 'Competition name is required.', status: 400 };
      const id = nextNumericId();
      const comp: CompetitionItem = {
        id,
        name,
        format: sanitizeText(body.format, 80) || 'League & Knockout',
        status: sanitizeText(body.status, 40) || 'Active',
        teamsCount: Math.max(2, Math.min(128, Number(body.teamsCount) || 16)),
        prizePool: sanitizeText(body.prizePool, 100) || 'Championship Trophy',
        season: sanitizeText(body.season, 30) || '2026/27',
        description: sanitizeText(body.description, 500),
      };
      await setDoc(doc(db, 'competitions', String(id)), comp);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/competitions/')) {
      const id = path.split('/').pop() || '';
      await deleteDoc(doc(db, 'competitions', id));
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/events') {
      const title = sanitizeText(body.title, 100);
      if (!title) return { ok: false, error: 'Event title is required.', status: 400 };
      const id = nextNumericId();
      const ev: UpcomingEvent = {
        id,
        title,
        competition: sanitizeText(body.competition, 80) || 'FTD League',
        homeTeam: sanitizeText(body.homeTeam, 60) || 'TBD',
        awayTeam: sanitizeText(body.awayTeam, 60) || 'TBD',
        kickoffTime: sanitizeText(body.kickoffTime, 60) || 'Upcoming',
        venue: sanitizeText(body.venue, 80) || 'FTD Arena',
        status: sanitizeText(body.status, 40) || 'Scheduled',
      };
      await setDoc(doc(db, 'upcomingEvents', String(id)), ev);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/events/')) {
      const id = path.split('/').pop() || '';
      await deleteDoc(doc(db, 'upcomingEvents', id));
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/nominees') {
      const name = sanitizeText(body.name, 80);
      const club = sanitizeText(body.club, 80);
      if (!name || !club) {
        return { ok: false, error: 'Player name and club are required.', status: 400 };
      }
      const id = nextNumericId();
      const nom: BallonDorNominee = {
        id,
        name,
        club,
        position: sanitizeText(body.position, 12) || 'FW',
        nationality: sanitizeText(body.nationality, 40) || 'International',
        kitNumber: Math.max(1, Math.min(99, Number(body.kitNumber) || 10)),
        imageUrl: sanitizeImageUrl(body.imageUrl),
        goals: Math.max(0, Number(body.goals) || 0),
        assists: Math.max(0, Number(body.assists) || 0),
        trophies: Math.max(0, Number(body.trophies) || 0),
        rating: Math.max(50, Math.min(99.9, Number(body.rating) || 89)),
        votes: Math.max(0, Number(body.votes) || 0),
        rankOrder: Math.max(1, Number(body.rankOrder) || currentState.nominees.length + 1),
        isWinner: false,
      };
      await setDoc(doc(db, 'nominees', String(id)), nom);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'PUT' && path.startsWith('/api/admin/nominees/')) {
      const id = Number(path.split('/').pop());
      const existing = currentState.nominees.find((n) => n.id === id);
      if (!existing) return { ok: false, error: 'Nominee not found.', status: 404 };
      const updated: BallonDorNominee = {
        ...existing,
        name: sanitizeText(body.name, 80) || existing.name,
        club: sanitizeText(body.club, 80) || existing.club,
        position: sanitizeText(body.position, 12) || existing.position,
        nationality: sanitizeText(body.nationality, 40) || existing.nationality,
        kitNumber:
          body.kitNumber !== undefined
            ? Math.max(1, Math.min(99, Number(body.kitNumber)))
            : existing.kitNumber,
        imageUrl: body.imageUrl !== undefined ? sanitizeImageUrl(body.imageUrl) : existing.imageUrl,
        goals: body.goals !== undefined ? Math.max(0, Number(body.goals)) : existing.goals,
        assists: body.assists !== undefined ? Math.max(0, Number(body.assists)) : existing.assists,
        trophies: body.trophies !== undefined ? Math.max(0, Number(body.trophies)) : existing.trophies,
        rating:
          body.rating !== undefined ? Math.max(50, Math.min(99.9, Number(body.rating))) : existing.rating,
        votes: body.votes !== undefined ? Math.max(0, Number(body.votes)) : existing.votes,
        rankOrder:
          body.rankOrder !== undefined ? Math.max(1, Number(body.rankOrder)) : existing.rankOrder,
      };
      await setDoc(doc(db, 'nominees', String(id)), updated);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/nominees/')) {
      const id = Number(path.split('/').pop());
      const batch = writeBatch(db);
      batch.delete(doc(db, 'nominees', String(id)));
      if (currentState.ballonDorState.winnerId === id) {
        batch.set(doc(db, 'platform', 'ballonDor'), {
          ...currentState.ballonDorState,
          winnerId: null,
        });
      }
      await batch.commit();
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'PUT' && path === '/api/admin/ballondor/state') {
      const bd = currentState.ballonDorState;
      const nextWinnerId =
        body.winnerId !== undefined ? (body.winnerId === null ? null : Number(body.winnerId)) : bd.winnerId;
      const nextPhase =
        typeof body.ceremonyPhase === 'string' && ['idle', 'countdown', 'revealed'].includes(body.ceremonyPhase)
          ? (body.ceremonyPhase as BallonDorState['ceremonyPhase'])
          : bd.ceremonyPhase;

      const nextBd: BallonDorState = {
        ceremonyTitle: sanitizeText(body.ceremonyTitle, 120) || bd.ceremonyTitle,
        seasonYear: sanitizeText(body.seasonYear, 20) || bd.seasonYear,
        ceremonyDate: sanitizeText(body.ceremonyDate, 50) || bd.ceremonyDate,
        votingEnabled: body.votingEnabled !== undefined ? Boolean(body.votingEnabled) : bd.votingEnabled,
        ceremonyPhase: nextPhase,
        winnerId: nextWinnerId,
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'platform', 'ballonDor'), nextBd);
      if (body.winnerId !== undefined) {
        for (const nom of currentState.nominees) {
          const isWinner = nom.id === nextWinnerId;
          if (nom.isWinner !== isWinner || (isWinner && nom.rankOrder !== 1)) {
            batch.set(doc(db, 'nominees', String(nom.id)), {
              ...nom,
              isWinner,
              rankOrder: isWinner ? 1 : nom.rankOrder,
            });
          }
        }
      }
      await batch.commit();
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/ballondor/history') {
      const year = sanitizeText(body.year, 12);
      const winnerName = sanitizeText(body.winnerName, 80);
      const club = sanitizeText(body.club, 80);
      if (!year || !winnerName || !club) {
        return { ok: false, error: 'Year, winner name, and club are required.', status: 400 };
      }
      const id = nextNumericId();
      const item: BallonDorHistoryItem = {
        id,
        year,
        winnerName,
        club,
        statsSummary: sanitizeText(body.statsSummary, 180) || "Official FTD Ballon d'Or Winner",
        imageUrl: sanitizeImageUrl(body.imageUrl),
      };
      await setDoc(doc(db, 'ballonDorHistory', String(id)), item);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/ballondor/history/')) {
      const id = path.split('/').pop() || '';
      await deleteDoc(doc(db, 'ballonDorHistory', id));
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/teams') {
      const name = sanitizeText(body.name, 60);
      if (!name) return { ok: false, error: 'Team name is required.', status: 400 };
      const id = nextNumericId();
      const team: Team = {
        id,
        name,
        shortName: (sanitizeText(body.shortName, 6) || name.slice(0, 3)).toUpperCase(),
        primaryColor: sanitizeColor(body.primaryColor, '#FFFFFF'),
        secondaryColor: sanitizeColor(body.secondaryColor, '#111827'),
        logoUrl: sanitizeImageUrl(body.logoUrl),
      };
      await setDoc(doc(db, 'teams', String(id)), team);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'PUT' && path.startsWith('/api/admin/teams/')) {
      const id = Number(path.split('/').pop());
      const existing = currentState.teams.find((t) => t.id === id);
      if (!existing) return { ok: false, error: 'Team not found.', status: 404 };
      const updated: Team = {
        ...existing,
        name: sanitizeText(body.name, 60) || existing.name,
        shortName: (sanitizeText(body.shortName, 6) || existing.shortName).toUpperCase(),
        primaryColor: body.primaryColor
          ? sanitizeColor(body.primaryColor, existing.primaryColor)
          : existing.primaryColor,
        secondaryColor: body.secondaryColor
          ? sanitizeColor(body.secondaryColor, existing.secondaryColor)
          : existing.secondaryColor,
        logoUrl: body.logoUrl !== undefined ? sanitizeImageUrl(body.logoUrl) : existing.logoUrl,
      };
      await setDoc(doc(db, 'teams', String(id)), updated);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/teams/')) {
      const id = path.split('/').pop() || '';
      await deleteDoc(doc(db, 'teams', id));
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'PUT' && path === '/api/admin/live') {
      const lm = { ...currentState.liveMatch };
      const synced = computeSyncedClock({ ...lm, clockAnchorMs: liveClockAnchorMs });
      lm.matchMinute = synced.matchMinute;
      lm.matchSecond = synced.matchSecond;

      if (body.streamActive !== undefined) lm.streamActive = Boolean(body.streamActive);
      if (body.streamUrl !== undefined) lm.streamUrl = sanitizeStreamUrl(body.streamUrl);
      if (body.streamTitle !== undefined) lm.streamTitle = sanitizeText(body.streamTitle, 140) || lm.streamTitle;
      if (body.competitionName !== undefined) {
        lm.competitionName = sanitizeText(body.competitionName, 100) || lm.competitionName;
      }
      if (body.stadiumName !== undefined) lm.stadiumName = sanitizeText(body.stadiumName, 100) || lm.stadiumName;
      if (
        typeof body.scoreboardEdition === 'string' &&
        ['champions-league', 'premier-league', 'bundesliga', 'world-cup'].includes(body.scoreboardEdition)
      ) {
        lm.scoreboardEdition = body.scoreboardEdition as ScoreboardEdition;
      }
      if (
        typeof body.status === 'string' &&
        ['PRE_MATCH', 'LIVE', 'HALFTIME', 'PAUSED', 'ENDED'].includes(body.status)
      ) {
        lm.status = body.status as MatchStatus;
      }
      if (body.selectHomeTeamId) {
        const t = currentState.teams.find((x) => x.id === Number(body.selectHomeTeamId));
        if (t) {
          lm.homeTeamId = t.id;
          lm.homeTeamName = t.name;
          lm.homeTeamShort = t.shortName;
          lm.homeTeamLogo = t.logoUrl;
          lm.homeTeamColor = t.primaryColor;
        }
      }
      if (body.selectAwayTeamId) {
        const t = currentState.teams.find((x) => x.id === Number(body.selectAwayTeamId));
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
      if (body.homeTeamShort !== undefined) {
        lm.homeTeamShort = sanitizeText(body.homeTeamShort, 6).toUpperCase() || lm.homeTeamShort;
      }
      if (body.awayTeamShort !== undefined) {
        lm.awayTeamShort = sanitizeText(body.awayTeamShort, 6).toUpperCase() || lm.awayTeamShort;
      }
      if (body.homeTeamLogo !== undefined) lm.homeTeamLogo = sanitizeImageUrl(body.homeTeamLogo);
      if (body.awayTeamLogo !== undefined) lm.awayTeamLogo = sanitizeImageUrl(body.awayTeamLogo);
      if (body.homeTeamColor !== undefined) lm.homeTeamColor = sanitizeColor(body.homeTeamColor, lm.homeTeamColor);
      if (body.awayTeamColor !== undefined) lm.awayTeamColor = sanitizeColor(body.awayTeamColor, lm.awayTeamColor);
      if (body.homeScore !== undefined) lm.homeScore = Math.max(0, Math.min(99, Number(body.homeScore)));
      if (body.awayScore !== undefined) lm.awayScore = Math.max(0, Math.min(99, Number(body.awayScore)));
      if (body.matchMinute !== undefined) lm.matchMinute = Math.max(0, Math.min(130, Number(body.matchMinute)));
      if (body.matchSecond !== undefined) lm.matchSecond = Math.max(0, Math.min(59, Number(body.matchSecond)));
      if (body.clockRunning !== undefined) lm.clockRunning = Boolean(body.clockRunning);
      if (body.halfLabel !== undefined) lm.halfLabel = sanitizeText(body.halfLabel, 30) || lm.halfLabel;

      const anchor = lm.clockRunning && lm.status === 'LIVE' ? Date.now() : null;
      await setDoc(doc(db, 'platform', 'liveMatch'), toLiveMatchDoc(lm, anchor));
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/live/goal') {
      const lm = { ...currentState.liveMatch };
      const synced = computeSyncedClock({ ...lm, clockAnchorMs: liveClockAnchorMs });
      lm.matchMinute = synced.matchMinute;
      lm.matchSecond = synced.matchSecond;

      const side = body.side === 'away' ? 'away' : 'home';
      const scorer = sanitizeText(body.scorer, 80);
      const minute = lm.matchMinute || 1;
      if (side === 'home') lm.homeScore = Math.min(99, lm.homeScore + 1);
      else lm.awayScore = Math.min(99, lm.awayScore + 1);

      const teamName = side === 'home' ? lm.homeTeamName : lm.awayTeamName;
      const goalId = lm.lastGoalId + 1;
      lm.lastGoalId = goalId;
      lm.lastGoalTeam = side;
      lm.lastGoalScorer = scorer;
      lm.lastGoalMinute = minute;

      const eventId = nextNumericId();
      const ev: MatchEvent = {
        id: eventId,
        type: 'GOAL',
        teamSide: side,
        teamName: sanitizeText(teamName, 60),
        playerName: scorer || `${sanitizeText(teamName, 50)} Goal`,
        minute,
        createdAt: new Date().toISOString(),
      };

      const anchor = lm.clockRunning && lm.status === 'LIVE' ? Date.now() : null;
      const batch = writeBatch(db);
      batch.set(doc(db, 'platform', 'liveMatch'), toLiveMatchDoc(lm, anchor));
      batch.set(doc(db, 'matchEvents', String(eventId)), ev);
      await batch.commit();
      return { ok: true, data: { ok: true, goalId } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/live/undo-goal') {
      const latestGoal = currentState.matchEvents.find((e) => e.type === 'GOAL');
      if (!latestGoal) {
        return { ok: false, error: 'No goal event available to undo.', status: 400 };
      }
      const lm = { ...currentState.liveMatch };
      const synced = computeSyncedClock({ ...lm, clockAnchorMs: liveClockAnchorMs });
      lm.matchMinute = synced.matchMinute;
      lm.matchSecond = synced.matchSecond;
      if (latestGoal.teamSide === 'home') lm.homeScore = Math.max(0, lm.homeScore - 1);
      if (latestGoal.teamSide === 'away') lm.awayScore = Math.max(0, lm.awayScore - 1);

      const anchor = lm.clockRunning && lm.status === 'LIVE' ? Date.now() : null;
      const batch = writeBatch(db);
      batch.set(doc(db, 'platform', 'liveMatch'), toLiveMatchDoc(lm, anchor));
      batch.delete(doc(db, 'matchEvents', String(latestGoal.id)));
      await batch.commit();
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/live/control') {
      const lm = { ...currentState.liveMatch };
      const synced = computeSyncedClock({ ...lm, clockAnchorMs: liveClockAnchorMs });
      lm.matchMinute = synced.matchMinute;
      lm.matchSecond = synced.matchSecond;

      const action = String(body.action || '');
      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);

      if (action === 'start') {
        lm.status = 'LIVE';
        lm.clockRunning = true;
        lm.halfLabel = '1ST HALF';
        lm.matchSecond = 0;
        const id = nextNumericId();
        batch.set(doc(db, 'matchEvents', String(id)), {
          id,
          type: 'KICKOFF',
          teamSide: 'neutral',
          teamName: 'Match Official',
          playerName: 'Kick-off — 1st Half Underway',
          minute: 0,
          createdAt: nowIso,
        } satisfies MatchEvent);
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
        const id = nextNumericId();
        batch.set(doc(db, 'matchEvents', String(id)), {
          id,
          type: 'HALFTIME',
          teamSide: 'neutral',
          teamName: 'Match Official',
          playerName: 'Half-Time Whistle',
          minute: lm.matchMinute,
          createdAt: nowIso,
        } satisfies MatchEvent);
      } else if (action === 'second_half') {
        lm.status = 'LIVE';
        lm.clockRunning = true;
        lm.halfLabel = '2ND HALF';
        lm.matchMinute = Math.max(45, lm.matchMinute);
        lm.matchSecond = 0;
        const id = nextNumericId();
        batch.set(doc(db, 'matchEvents', String(id)), {
          id,
          type: 'KICKOFF',
          teamSide: 'neutral',
          teamName: 'Match Official',
          playerName: '2nd Half Underway',
          minute: lm.matchMinute,
          createdAt: nowIso,
        } satisfies MatchEvent);
      } else if (action === 'end') {
        lm.status = 'ENDED';
        lm.clockRunning = false;
        lm.halfLabel = 'FT';
        const id = nextNumericId();
        batch.set(doc(db, 'matchEvents', String(id)), {
          id,
          type: 'FULLTIME',
          teamSide: 'neutral',
          teamName: 'Match Official',
          playerName: 'Full-Time Whistle',
          minute: lm.matchMinute,
          createdAt: nowIso,
        } satisfies MatchEvent);
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
        const eventsSnap = await getDocs(collection(db, 'matchEvents'));
        eventsSnap.forEach((evDoc) => batch.delete(evDoc.ref));
      }

      const anchor = lm.clockRunning && lm.status === 'LIVE' ? Date.now() : null;
      batch.set(doc(db, 'platform', 'liveMatch'), toLiveMatchDoc(lm, anchor));
      await batch.commit();
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/live/events') {
      const lm = currentState.liveMatch;
      const validTypes = ['GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUB', 'KICKOFF', 'HALFTIME', 'FULLTIME'];
      const type = validTypes.includes(String(body.type))
        ? (String(body.type) as MatchEvent['type'])
        : 'YELLOW_CARD';
      const teamSide = ['home', 'away', 'neutral'].includes(String(body.teamSide))
        ? (String(body.teamSide) as MatchEvent['teamSide'])
        : 'home';
      const defaultTeam =
        teamSide === 'home' ? lm.homeTeamName : teamSide === 'away' ? lm.awayTeamName : 'Match Official';
      const id = nextNumericId();
      const ev: MatchEvent = {
        id,
        type,
        teamSide,
        teamName: sanitizeText(body.teamName, 60) || sanitizeText(defaultTeam, 60),
        playerName: sanitizeText(body.playerName, 80) || 'Match Event',
        minute: Math.max(0, Math.min(130, Number(body.minute ?? lm.matchMinute))),
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'matchEvents', String(id)), ev);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/live/events/')) {
      const id = path.split('/').pop() || '';
      await deleteDoc(doc(db, 'matchEvents', id));
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/chat/clear') {
      const chatSnap = await getDocs(collection(db, 'chatMessages'));
      const batch = writeBatch(db);
      chatSnap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/chat/')) {
      const id = path.split('/').pop() || '';
      await deleteDoc(doc(db, 'chatMessages', id));
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'POST' && path === '/api/admin/users') {
      const username = sanitizeText(body.username, 50);
      if (!username) return { ok: false, error: 'Username is required.', status: 400 };
      const role = ['Player', 'Captain', 'Broadcaster', 'Moderator'].includes(String(body.role))
        ? (String(body.role) as ManagedUser['role'])
        : 'Player';
      const id = nextNumericId();
      const user: ManagedUser = {
        id,
        username,
        club: sanitizeText(body.club, 60) || 'Free Agent',
        role,
        status: body.status === 'Suspended' ? 'Suspended' : 'Active',
        joinedAt: new Date().toISOString().slice(0, 10),
      };
      await setDoc(doc(db, 'managedUsers', String(id)), user);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'PUT' && path.startsWith('/api/admin/users/')) {
      const id = Number(path.split('/').pop());
      const existing = currentState.users.find((u) => u.id === id);
      if (!existing) return { ok: false, error: 'User not found.', status: 404 };
      const role = ['Player', 'Captain', 'Broadcaster', 'Moderator'].includes(String(body.role))
        ? (String(body.role) as ManagedUser['role'])
        : existing.role;
      const status =
        body.status === 'Suspended' || body.status === 'Active' ? body.status : existing.status;
      const updated: ManagedUser = {
        ...existing,
        username: body.username !== undefined ? sanitizeText(body.username, 50) || existing.username : existing.username,
        club: body.club !== undefined ? sanitizeText(body.club, 60) || existing.club : existing.club,
        role,
        status,
      };
      await setDoc(doc(db, 'managedUsers', String(id)), updated);
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/users/')) {
      const id = path.split('/').pop() || '';
      await deleteDoc(doc(db, 'managedUsers', id));
      return { ok: true, data: { ok: true } as T, status: 200 };
    }

    return { ok: false, error: 'Unsupported operation.', status: 404 };
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (wrapped) {
      return {
        ok: false,
        error: wrapped instanceof Error ? wrapped.message : 'Database request failed.',
        status: 403,
      };
    }
  }
}
