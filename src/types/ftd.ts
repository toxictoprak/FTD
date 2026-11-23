export type ScoreboardEdition =
  | 'champions-league'
  | 'premier-league'
  | 'bundesliga'
  | 'world-cup';

export type MatchStatus =
  | 'PRE_MATCH'
  | 'LIVE'
  | 'HALFTIME'
  | 'PAUSED'
  | 'ENDED';

export type CeremonyPhase = 'idle' | 'countdown' | 'revealed';

export type PageRoute = 'home' | 'ballon-dor' | 'live' | 'admin';

export interface SiteSettings {
  brandName: string;
  logoUrl: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  gameIntroTitle: string;
  gameIntroBody: string;
  announcementText: string;
  announcementActive: boolean;
  seasonLabel: string;
  maintenanceMode: boolean;
  chatEnabled: boolean;
  lastPublishedAt: string;
}

export interface NewsItem {
  id: number;
  title: string;
  category: string;
  summary: string;
  body: string;
  imageUrl: string;
  featured: boolean;
  publishedAt: string;
}

export interface CompetitionItem {
  id: number;
  name: string;
  format: string;
  status: string;
  teamsCount: number;
  prizePool: string;
  season: string;
  description: string;
}

export interface UpcomingEvent {
  id: number;
  title: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  venue: string;
  status: string;
}

export interface BallonDorNominee {
  id: number;
  name: string;
  club: string;
  position: string;
  nationality: string;
  kitNumber: number;
  imageUrl: string;
  goals: number;
  assists: number;
  trophies: number;
  rating: number;
  votes: number;
  rankOrder: number;
  isWinner: boolean;
}

export interface BallonDorState {
  ceremonyTitle: string;
  seasonYear: string;
  votingEnabled: boolean;
  ceremonyPhase: CeremonyPhase;
  winnerId: number | null;
  ceremonyDate: string;
}

export interface BallonDorHistoryItem {
  id: number;
  year: string;
  winnerName: string;
  club: string;
  statsSummary: string;
  imageUrl: string;
}

export interface Team {
  id: number;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
}

export interface LiveMatchState {
  streamActive: boolean;
  streamUrl: string;
  streamTitle: string;
  competitionName: string;
  stadiumName: string;
  scoreboardEdition: ScoreboardEdition;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShort: string;
  awayTeamShort: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  homeTeamColor: string;
  awayTeamColor: string;
  homeScore: number;
  awayScore: number;
  matchMinute: number;
  matchSecond: number;
  clockRunning: boolean;
  halfLabel: string;
  status: MatchStatus;
  lastGoalId: number;
  lastGoalTeam: 'home' | 'away' | null;
  lastGoalScorer: string;
  lastGoalMinute: number;
  viewerCount: number;
}

export interface MatchEvent {
  id: number;
  type: 'GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUB' | 'KICKOFF' | 'HALFTIME' | 'FULLTIME';
  teamSide: 'home' | 'away' | 'neutral';
  teamName: string;
  playerName: string;
  minute: number;
  createdAt: string;
}

export interface ChatMessage {
  id: number;
  sender: string;
  message: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface ManagedUser {
  id: number;
  username: string;
  club: string;
  role: 'Player' | 'Captain' | 'Broadcaster' | 'Moderator';
  status: 'Active' | 'Suspended';
  joinedAt: string;
}

export interface PlatformState {
  site: SiteSettings;
  news: NewsItem[];
  competitions: CompetitionItem[];
  upcomingEvents: UpcomingEvent[];
  nominees: BallonDorNominee[];
  ballonDorState: BallonDorState;
  ballonDorHistory: BallonDorHistoryItem[];
  teams: Team[];
  liveMatch: LiveMatchState;
  matchEvents: MatchEvent[];
  chatMessages: ChatMessage[];
  users: ManagedUser[];
  authMeta: {
    adminConfigured: boolean;
    envControlled: boolean;
  };
}
