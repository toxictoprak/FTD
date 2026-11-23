import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import type {
  BallonDorHistoryItem,
  BallonDorNominee,
  BallonDorState,
  ChatMessage,
  CompetitionItem,
  LiveMatchState,
  ManagedUser,
  MatchEvent,
  NewsItem,
  PlatformState,
  SiteSettings,
  Team,
  UpcomingEvent,
} from '../src/types/ftd.ts';

const dbPath = path.resolve(process.cwd(), 'ftd.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      brandName TEXT NOT NULL,
      logoUrl TEXT NOT NULL,
      heroEyebrow TEXT NOT NULL,
      heroTitle TEXT NOT NULL,
      heroSubtitle TEXT NOT NULL,
      gameIntroTitle TEXT NOT NULL,
      gameIntroBody TEXT NOT NULL,
      announcementText TEXT NOT NULL,
      announcementActive INTEGER NOT NULL DEFAULT 1,
      seasonLabel TEXT NOT NULL,
      maintenanceMode INTEGER NOT NULL DEFAULT 0,
      chatEnabled INTEGER NOT NULL DEFAULT 1,
      lastPublishedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      body TEXT NOT NULL,
      imageUrl TEXT NOT NULL DEFAULT '',
      featured INTEGER NOT NULL DEFAULT 0,
      publishedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS competitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      format TEXT NOT NULL,
      status TEXT NOT NULL,
      teamsCount INTEGER NOT NULL DEFAULT 16,
      prizePool TEXT NOT NULL,
      season TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS upcoming_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      competition TEXT NOT NULL,
      homeTeam TEXT NOT NULL,
      awayTeam TEXT NOT NULL,
      kickoffTime TEXT NOT NULL,
      venue TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ballon_dor_nominees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      club TEXT NOT NULL,
      position TEXT NOT NULL,
      nationality TEXT NOT NULL,
      kitNumber INTEGER NOT NULL DEFAULT 10,
      imageUrl TEXT NOT NULL DEFAULT '',
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      trophies INTEGER NOT NULL DEFAULT 0,
      rating REAL NOT NULL DEFAULT 88.0,
      votes INTEGER NOT NULL DEFAULT 0,
      rankOrder INTEGER NOT NULL DEFAULT 1,
      isWinner INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ballon_dor_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      ceremonyTitle TEXT NOT NULL,
      seasonYear TEXT NOT NULL,
      votingEnabled INTEGER NOT NULL DEFAULT 1,
      ceremonyPhase TEXT NOT NULL DEFAULT 'idle',
      winnerId INTEGER,
      ceremonyDate TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ballon_dor_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year TEXT NOT NULL,
      winnerName TEXT NOT NULL,
      club TEXT NOT NULL,
      statsSummary TEXT NOT NULL,
      imageUrl TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      shortName TEXT NOT NULL,
      primaryColor TEXT NOT NULL,
      secondaryColor TEXT NOT NULL,
      logoUrl TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS live_match (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      streamActive INTEGER NOT NULL DEFAULT 0,
      streamUrl TEXT NOT NULL DEFAULT '',
      streamTitle TEXT NOT NULL,
      competitionName TEXT NOT NULL,
      stadiumName TEXT NOT NULL,
      scoreboardEdition TEXT NOT NULL DEFAULT 'champions-league',
      homeTeamId INTEGER,
      awayTeamId INTEGER,
      homeTeamName TEXT NOT NULL,
      awayTeamName TEXT NOT NULL,
      homeTeamShort TEXT NOT NULL,
      awayTeamShort TEXT NOT NULL,
      homeTeamLogo TEXT NOT NULL DEFAULT '',
      awayTeamLogo TEXT NOT NULL DEFAULT '',
      homeTeamColor TEXT NOT NULL DEFAULT '#FFFFFF',
      awayTeamColor TEXT NOT NULL DEFAULT '#38BDF8',
      homeScore INTEGER NOT NULL DEFAULT 0,
      awayScore INTEGER NOT NULL DEFAULT 0,
      matchMinute INTEGER NOT NULL DEFAULT 0,
      matchSecond INTEGER NOT NULL DEFAULT 0,
      clockRunning INTEGER NOT NULL DEFAULT 0,
      halfLabel TEXT NOT NULL DEFAULT 'PRE-MATCH',
      status TEXT NOT NULL DEFAULT 'PRE_MATCH',
      lastGoalId INTEGER NOT NULL DEFAULT 0,
      lastGoalTeam TEXT,
      lastGoalScorer TEXT NOT NULL DEFAULT '',
      lastGoalMinute INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS match_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      teamSide TEXT NOT NULL,
      teamName TEXT NOT NULL,
      playerName TEXT NOT NULL,
      minute INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS live_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      isAdmin INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS managed_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      club TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      joinedAt TEXT NOT NULL
    );
  `);

  seedInitialData();
}

function seedInitialData(): void {
  const siteExists = db.prepare('SELECT id FROM site_settings WHERE id = 1').get();
  if (!siteExists) {
    db.prepare(`
      INSERT INTO site_settings (
        id, brandName, logoUrl, heroEyebrow, heroTitle, heroSubtitle,
        gameIntroTitle, gameIntroBody, announcementText, announcementActive,
        seasonLabel, maintenanceMode, chatEnabled, lastPublishedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'FTD',
      '/assets/aistudio/IMG_0674_a69c6a83.png',
      'Season 2026 Official Football Ecosystem',
      'Pure Competitive Football. Engineered for Every Matchday.',
      'FTD unites precision tactical gameplay, live Champions-grade broadcasts, and the prestigious FTD Ballon d\'Or ceremony in one real-time arena.',
      'Inside the FTD Experience',
      'Built for clubs, captains, and solo contenders, FTD delivers razor-sharp match mechanics, synchronized multi-league broadcasts, and verified seasonal player awards. Every goal, table point, and trophy ceremony syncs instantly across every supporter screen worldwide.',
      'FTD Champions Cup Finals & 2026 Ballon d\'Or Ceremony — Watch Live Broadcasts Now',
      1,
      '2026/27 Campaign',
      0,
      1,
      new Date().toISOString()
    );
  }

  const newsCount = db.prepare('SELECT COUNT(*) as count FROM news').get() as { count: number };
  if (newsCount.count === 0) {
    const insertNews = db.prepare(`
      INSERT INTO news (title, category, summary, body, imageUrl, featured, publishedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertNews.run(
      'FTD Champions Cup Quarter-Finals Schedule Confirmed',
      'Tournament',
      'Eight elite FTD clubs lock in for knockout ties under floodlights with multi-edition broadcast coverage.',
      'The FTD Competition Committee has finalized kickoff windows for the Quarter-Finals. All ties will stream live in the FTD Live Arena featuring Champions League, Premier League, Bundesliga, and World Cup scoreboard editions.',
      '',
      1,
      '2026-11-20'
    );
    insertNews.run(
      '2026 FTD Ballon d\'Or Shortlist Unveiled',
      'Awards',
      'Six standout performers headline this season\'s official shortlist ahead of the Golden Trophy gala.',
      'Goals, decisive assists, silverware, and match ratings determine the 2026 FTD Ballon d\'Or standings. Public fan voting is active alongside official committee adjudication.',
      '',
      0,
      '2026-11-18'
    );
    insertNews.run(
      'Broadcast Engine 2.0: Instant Goal Graphics & Audio',
      'Platform',
      'Supporters now experience real-time WebSocket scoreboards, instant goal overlays, and synchronized match clocks.',
      'Whether following a title decider or a cup tie, FTD Live delivers sub-second synchronization between match officials and every spectator device.',
      '',
      0,
      '2026-11-15'
    );
  }

  const compCount = db.prepare('SELECT COUNT(*) as count FROM competitions').get() as { count: number };
  if (compCount.count === 0) {
    const insertComp = db.prepare(`
      INSERT INTO competitions (name, format, status, teamsCount, prizePool, season, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertComp.run(
      'FTD Champions League',
      '32-Club Knockout & League Phase',
      'Knockout Stage',
      32,
      'FTD Silverware & Golden Seeding',
      '2026/27',
      'The pinnacle club competition in FTD football, decided under floodlights with two-legged knockout intensity.'
    );
    insertComp.run(
      'FTD Premier Division',
      '20-Club Double Round-Robin',
      'Matchweek 24',
      20,
      'League Championship Shield',
      '2026/27',
      'Relentless weekend-to-weekend domestic supremacy where consistency defines champions.'
    );
    insertComp.run(
      'FTD World Nations Cup',
      'International Group + Bracket',
      'Upcoming',
      24,
      'World Cup Gold Trophy',
      '2026',
      'National squads collide for global bragging rights in a high-stakes tournament format.'
    );
  }

  const eventCount = db.prepare('SELECT COUNT(*) as count FROM upcoming_events').get() as { count: number };
  if (eventCount.count === 0) {
    const insertEvent = db.prepare(`
      INSERT INTO upcoming_events (title, competition, homeTeam, awayTeam, kickoffTime, venue, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertEvent.run(
      'Champions Cup Semi-Final Leg 1',
      'FTD Champions League',
      'FC Obsidian',
      'Real Vanguard',
      '2026-11-24 20:45 UTC',
      'FTD National Arena',
      'Scheduled'
    );
    insertEvent.run(
      'Title Six-Pointer Clash',
      'FTD Premier Division',
      'Apex United',
      'Nordic Athletic',
      '2026-11-25 18:30 UTC',
      'Apex Bowl',
      'Scheduled'
    );
    insertEvent.run(
      'FTD Ballon d\'Or Gala Night',
      'Official Awards Ceremony',
      'Top 6 Nominees',
      'Live Reveal',
      '2026-11-28 21:00 UTC',
      'Grand Theatre Hall',
      'Upcoming'
    );
  }

  const nomineeCount = db.prepare('SELECT COUNT(*) as count FROM ballon_dor_nominees').get() as { count: number };
  if (nomineeCount.count === 0) {
    const insertNominee = db.prepare(`
      INSERT INTO ballon_dor_nominees (
        name, club, position, nationality, kitNumber, imageUrl,
        goals, assists, trophies, rating, votes, rankOrder, isWinner
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertNominee.run('Kieran Vance', 'FC Obsidian', 'ST', 'England', 9, '', 42, 14, 3, 94.6, 1280, 1, 0);
    insertNominee.run('Mateo Silva', 'Real Vanguard', 'CAM', 'Spain', 10, '', 29, 24, 3, 93.8, 1140, 2, 0);
    insertNominee.run('Lukas Brenner', 'Bayern Crest', 'RW', 'Germany', 7, '', 31, 18, 2, 92.4, 965, 3, 0);
    insertNominee.run('Tariq Mensah', 'Apex United', 'CM', 'France', 8, '', 16, 21, 2, 91.2, 740, 4, 0);
    insertNominee.run('Rafael Costa', 'Nordic Athletic', 'LW', 'Portugal', 11, '', 27, 15, 1, 90.5, 610, 5, 0);
    insertNominee.run('Jonas Lindqvist', 'FC Obsidian', 'CB', 'Sweden', 4, '', 6, 4, 3, 89.9, 495, 6, 0);
  }

  const bdStateExists = db.prepare('SELECT id FROM ballon_dor_state WHERE id = 1').get();
  if (!bdStateExists) {
    db.prepare(`
      INSERT INTO ballon_dor_state (id, ceremonyTitle, seasonYear, votingEnabled, ceremonyPhase, winnerId, ceremonyDate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'FTD Ballon d\'Or 2026', '2026', 1, 'idle', null, 'November 2026');
  }

  const historyCount = db.prepare('SELECT COUNT(*) as count FROM ballon_dor_history').get() as { count: number };
  if (historyCount.count === 0) {
    const insertHistory = db.prepare(`
      INSERT INTO ballon_dor_history (year, winnerName, club, statsSummary, imageUrl)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertHistory.run('2025', 'Mateo Silva', 'Real Vanguard', '34 Goals · 22 Assists · Champions Cup Winner', '');
    insertHistory.run('2024', 'Kieran Vance', 'FC Obsidian', '46 Goals · 11 Assists · Golden Boot & League Title', '');
    insertHistory.run('2023', 'Emil Lindholm', 'Bayern Crest', '28 Goals · 19 Assists · Domestic Double', '');
  }

  const teamCount = db.prepare('SELECT COUNT(*) as count FROM teams').get() as { count: number };
  if (teamCount.count === 0) {
    const insertTeam = db.prepare(`
      INSERT INTO teams (name, shortName, primaryColor, secondaryColor, logoUrl)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertTeam.run('FC Obsidian', 'OBS', '#FFFFFF', '#111827', '');
    insertTeam.run('Real Vanguard', 'RVD', '#38BDF8', '#0F172A', '');
    insertTeam.run('Bayern Crest', 'BAY', '#DC2626', '#111111', '');
    insertTeam.run('Apex United', 'APX', '#A855F7', '#2E1065', '');
    insertTeam.run('Nordic Athletic', 'NOR', '#10B981', '#064E3B', '');
    insertTeam.run('Inter Nova', 'INV', '#F59E0B', '#1E293B', '');
  }

  const liveExists = db.prepare('SELECT id FROM live_match WHERE id = 1').get();
  if (!liveExists) {
    db.prepare(`
      INSERT INTO live_match (
        id, streamActive, streamUrl, streamTitle, competitionName, stadiumName,
        scoreboardEdition, homeTeamId, awayTeamId, homeTeamName, awayTeamName,
        homeTeamShort, awayTeamShort, homeTeamLogo, awayTeamLogo,
        homeTeamColor, awayTeamColor, homeScore, awayScore,
        matchMinute, matchSecond, clockRunning, halfLabel, status,
        lastGoalId, lastGoalTeam, lastGoalScorer, lastGoalMinute
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      0,
      '',
      'FTD Champions Cup — Matchday Live Feed',
      'FTD Champions League',
      'FTD National Arena',
      'champions-league',
      1,
      2,
      'FC Obsidian',
      'Real Vanguard',
      'OBS',
      'RVD',
      '',
      '',
      '#FFFFFF',
      '#38BDF8',
      0,
      0,
      0,
      0,
      0,
      'PRE-MATCH',
      'PRE_MATCH',
      0,
      null,
      '',
      0
    );
  }

  const chatCount = db.prepare('SELECT COUNT(*) as count FROM live_chat').get() as { count: number };
  if (chatCount.count === 0) {
    db.prepare(`
      INSERT INTO live_chat (sender, message, isAdmin, createdAt)
      VALUES (?, ?, ?, ?)
    `).run(
      'FTD Broadcast Desk',
      'Welcome to FTD Live! Official match updates and live scoreboard sync are active.',
      1,
      new Date().toISOString()
    );
  }

  const usersCount = db.prepare('SELECT COUNT(*) as count FROM managed_users').get() as { count: number };
  if (usersCount.count === 0) {
    const insertUser = db.prepare(`
      INSERT INTO managed_users (username, club, role, status, joinedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertUser.run('kieran_vance9', 'FC Obsidian', 'Captain', 'Active', '2026-08-12');
    insertUser.run('msilva_10', 'Real Vanguard', 'Captain', 'Active', '2026-08-14');
    insertUser.run('ftd_broadcast_01', 'FTD Media', 'Broadcaster', 'Active', '2026-09-01');
    insertUser.run('lukas_b7', 'Bayern Crest', 'Player', 'Active', '2026-09-10');
  }
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPinHash(pin: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const actualBuf = crypto.scryptSync(pin, salt, 32);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function getAuthMeta(): { adminConfigured: boolean; envControlled: boolean } {
  const envPin = process.env.ADMIN_ACCESS_CODE?.trim() ?? '';
  if (/^\d{4}$/.test(envPin)) {
    return { adminConfigured: true, envControlled: true };
  }
  const row = db.prepare('SELECT value FROM kv_config WHERE key = ?').get('admin_pin_hash') as
    | { value: string }
    | undefined;
  return { adminConfigured: Boolean(row?.value), envControlled: false };
}

export function getFullPlatformState(viewerCount = 1): PlatformState {
  const siteRow = db.prepare('SELECT * FROM site_settings WHERE id = 1').get() as Record<string, unknown>;
  const site: SiteSettings = {
    brandName: String(siteRow.brandName),
    logoUrl: String(siteRow.logoUrl),
    heroEyebrow: String(siteRow.heroEyebrow),
    heroTitle: String(siteRow.heroTitle),
    heroSubtitle: String(siteRow.heroSubtitle),
    gameIntroTitle: String(siteRow.gameIntroTitle),
    gameIntroBody: String(siteRow.gameIntroBody),
    announcementText: String(siteRow.announcementText),
    announcementActive: Boolean(siteRow.announcementActive),
    seasonLabel: String(siteRow.seasonLabel),
    maintenanceMode: Boolean(siteRow.maintenanceMode),
    chatEnabled: Boolean(siteRow.chatEnabled),
    lastPublishedAt: String(siteRow.lastPublishedAt),
  };

  const newsRows = db.prepare('SELECT * FROM news ORDER BY featured DESC, id DESC').all() as Array<Record<string, unknown>>;
  const news: NewsItem[] = newsRows.map((r) => ({
    id: Number(r.id),
    title: String(r.title),
    category: String(r.category),
    summary: String(r.summary),
    body: String(r.body),
    imageUrl: String(r.imageUrl || ''),
    featured: Boolean(r.featured),
    publishedAt: String(r.publishedAt),
  }));

  const competitions = db.prepare('SELECT * FROM competitions ORDER BY id ASC').all() as CompetitionItem[];
  const upcomingEvents = db.prepare('SELECT * FROM upcoming_events ORDER BY id ASC').all() as UpcomingEvent[];

  const nomineeRows = db
    .prepare('SELECT * FROM ballon_dor_nominees ORDER BY isWinner DESC, rankOrder ASC, votes DESC, id ASC')
    .all() as Array<Record<string, unknown>>;
  const nominees: BallonDorNominee[] = nomineeRows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    club: String(r.club),
    position: String(r.position),
    nationality: String(r.nationality),
    kitNumber: Number(r.kitNumber),
    imageUrl: String(r.imageUrl || ''),
    goals: Number(r.goals),
    assists: Number(r.assists),
    trophies: Number(r.trophies),
    rating: Number(r.rating),
    votes: Number(r.votes),
    rankOrder: Number(r.rankOrder),
    isWinner: Boolean(r.isWinner),
  }));

  const bdRow = db.prepare('SELECT * FROM ballon_dor_state WHERE id = 1').get() as Record<string, unknown>;
  const ballonDorState: BallonDorState = {
    ceremonyTitle: String(bdRow.ceremonyTitle),
    seasonYear: String(bdRow.seasonYear),
    votingEnabled: Boolean(bdRow.votingEnabled),
    ceremonyPhase: (bdRow.ceremonyPhase as BallonDorState['ceremonyPhase']) || 'idle',
    winnerId: bdRow.winnerId !== null && bdRow.winnerId !== undefined ? Number(bdRow.winnerId) : null,
    ceremonyDate: String(bdRow.ceremonyDate),
  };

  const ballonDorHistory = db
    .prepare('SELECT * FROM ballon_dor_history ORDER BY year DESC, id DESC')
    .all() as BallonDorHistoryItem[];

  const teams = db.prepare('SELECT * FROM teams ORDER BY id ASC').all() as Team[];

  const liveRow = db.prepare('SELECT * FROM live_match WHERE id = 1').get() as Record<string, unknown>;
  const liveMatch: LiveMatchState = {
    streamActive: Boolean(liveRow.streamActive),
    streamUrl: String(liveRow.streamUrl || ''),
    streamTitle: String(liveRow.streamTitle),
    competitionName: String(liveRow.competitionName),
    stadiumName: String(liveRow.stadiumName),
    scoreboardEdition: liveRow.scoreboardEdition as LiveMatchState['scoreboardEdition'],
    homeTeamId: liveRow.homeTeamId ? Number(liveRow.homeTeamId) : null,
    awayTeamId: liveRow.awayTeamId ? Number(liveRow.awayTeamId) : null,
    homeTeamName: String(liveRow.homeTeamName),
    awayTeamName: String(liveRow.awayTeamName),
    homeTeamShort: String(liveRow.homeTeamShort),
    awayTeamShort: String(liveRow.awayTeamShort),
    homeTeamLogo: String(liveRow.homeTeamLogo || ''),
    awayTeamLogo: String(liveRow.awayTeamLogo || ''),
    homeTeamColor: String(liveRow.homeTeamColor || '#FFFFFF'),
    awayTeamColor: String(liveRow.awayTeamColor || '#38BDF8'),
    homeScore: Number(liveRow.homeScore),
    awayScore: Number(liveRow.awayScore),
    matchMinute: Number(liveRow.matchMinute),
    matchSecond: Number(liveRow.matchSecond),
    clockRunning: Boolean(liveRow.clockRunning),
    halfLabel: String(liveRow.halfLabel),
    status: liveRow.status as LiveMatchState['status'],
    lastGoalId: Number(liveRow.lastGoalId || 0),
    lastGoalTeam: (liveRow.lastGoalTeam as 'home' | 'away' | null) || null,
    lastGoalScorer: String(liveRow.lastGoalScorer || ''),
    lastGoalMinute: Number(liveRow.lastGoalMinute || 0),
    viewerCount,
  };

  const matchEvents = db
    .prepare('SELECT * FROM match_events ORDER BY id DESC LIMIT 50')
    .all() as MatchEvent[];

  const chatRows = db
    .prepare('SELECT * FROM live_chat ORDER BY id DESC LIMIT 60')
    .all() as Array<Record<string, unknown>>;
  const chatMessages: ChatMessage[] = chatRows.reverse().map((r) => ({
    id: Number(r.id),
    sender: String(r.sender),
    message: String(r.message),
    isAdmin: Boolean(r.isAdmin),
    createdAt: String(r.createdAt),
  }));

  const users = db.prepare('SELECT * FROM managed_users ORDER BY id ASC').all() as ManagedUser[];

  return {
    site,
    news,
    competitions,
    upcomingEvents,
    nominees,
    ballonDorState,
    ballonDorHistory,
    teams,
    liveMatch,
    matchEvents,
    chatMessages,
    users,
    authMeta: getAuthMeta(),
  };
}
