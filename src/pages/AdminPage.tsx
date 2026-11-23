import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Award,
  Check,
  Crown,
  Globe,
  Lock,
  LogOut,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Settings,
  Shield,
  Square,
  Trash2,
  Trophy,
  Undo2,
  Upload,
  Users,
} from 'lucide-react';
import type {
  BallonDorNominee,
  ScoreboardEdition,
  Team,
} from '../types/ftd';
import { usePlatform } from '../context/PlatformContext';
import { BroadcastScoreboard } from '../components/BroadcastScoreboard';
import { TeamCrest } from '../components/TeamCrest';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { isDiscordStreamUrl } from '../utils/stream';

interface AdminPageProps {
  onOpenLogin: () => void;
}

type AdminTab = 'live' | 'ballon-dor' | 'website' | 'general';

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      reject(new Error('Please upload a PNG, JPG, or WebP image.'));
      return;
    }
    if (file.size > 4_000_000) {
      reject(new Error('Image file must be smaller than 4 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const maxSide = 640;
        const scale = Math.min(1, maxSide / Math.max(img.width || maxSide, img.height || maxSide));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/webp', 0.82);
        resolve(compressed.length <= 360_000 ? compressed : canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export function AdminPage({ onOpenLogin }: AdminPageProps) {
  const {
    state,
    isAdmin,
    adminEmail,
    setAdminToken,
    apiRequest,
    activeGoalAlert,
    dismissGoalAlert,
  } = usePlatform();

  const [tab, setTab] = useState<AdminTab>('live');
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Live Management State
  const [scorerName, setScorerName] = useState('');
  const [streamUrlInput, setStreamUrlInput] = useState('');
  const [streamTitleInput, setStreamTitleInput] = useState('');
  const [compNameInput, setCompNameInput] = useState('');
  const [stadiumInput, setStadiumInput] = useState('');
  const [manualHomeScore, setManualHomeScore] = useState('0');
  const [manualAwayScore, setManualAwayScore] = useState('0');
  const [manualMinute, setManualMinute] = useState('0');
  const [manualSecond, setManualSecond] = useState('0');
  const [manualHalf, setManualHalf] = useState('PRE-MATCH');
  const [homeNameOverride, setHomeNameOverride] = useState('');
  const [homeShortOverride, setHomeShortOverride] = useState('');
  const [homeLogoOverride, setHomeLogoOverride] = useState('');
  const [homeColorOverride, setHomeColorOverride] = useState('#FFFFFF');
  const [awayNameOverride, setAwayNameOverride] = useState('');
  const [awayShortOverride, setAwayShortOverride] = useState('');
  const [awayLogoOverride, setAwayLogoOverride] = useState('');
  const [awayColorOverride, setAwayColorOverride] = useState('#38BDF8');

  // New Club Form
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamShort, setNewTeamShort] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#FFFFFF');
  const [newTeamLogo, setNewTeamLogo] = useState('');

  // New Match Event Form
  const [evType, setEvType] = useState<'YELLOW_CARD' | 'RED_CARD' | 'SUB' | 'GOAL'>('YELLOW_CARD');
  const [evSide, setEvSide] = useState<'home' | 'away'>('home');
  const [evPlayer, setEvPlayer] = useState('');
  const [evMinute, setEvMinute] = useState('');

  // Ballon d'Or Forms
  const [editingNominee, setEditingNominee] = useState<BallonDorNominee | null>(null);
  const [nomName, setNomName] = useState('');
  const [nomClub, setNomClub] = useState('');
  const [nomPos, setNomPos] = useState('ST');
  const [nomNat, setNomNat] = useState('');
  const [nomKit, setNomKit] = useState('10');
  const [nomImg, setNomImg] = useState('');
  const [nomGoals, setNomGoals] = useState('0');
  const [nomAssists, setNomAssists] = useState('0');
  const [nomTrophies, setNomTrophies] = useState('0');
  const [nomRating, setNomRating] = useState('90.0');
  const [nomRank, setNomRank] = useState('1');
  const [nomVotes, setNomVotes] = useState('0');

  const [ceremonyTitle, setCeremonyTitle] = useState('');
  const [seasonYear, setSeasonYear] = useState('');
  const [ceremonyDate, setCeremonyDate] = useState('');
  const [histYear, setHistYear] = useState('');
  const [histWinner, setHistWinner] = useState('');
  const [histClub, setHistClub] = useState('');
  const [histSummary, setHistSummary] = useState('');

  // Website Management Forms
  const [heroEyebrow, setHeroEyebrow] = useState('');
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [introTitle, setIntroTitle] = useState('');
  const [introBody, setIntroBody] = useState('');
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementActive, setAnnouncementActive] = useState(true);
  const [seasonLabel, setSeasonLabel] = useState('');
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [chatEnabled, setChatEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const [newsTitle, setNewsTitle] = useState('');
  const [newsCategory, setNewsCategory] = useState('Tournament');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsBody, setNewsBody] = useState('');
  const [newsImage, setNewsImage] = useState('');
  const [newsFeatured, setNewsFeatured] = useState(false);

  const [compTitle, setCompTitle] = useState('');
  const [compFormat, setCompFormat] = useState('Knockout & League');
  const [compStatus, setCompStatus] = useState('Active');
  const [compTeamsCount, setCompTeamsCount] = useState('16');
  const [compPrize, setCompPrize] = useState('Championship Cup');
  const [compDesc, setCompDesc] = useState('');

  const [eventTitle, setEventTitle] = useState('');
  const [eventComp, setEventComp] = useState('FTD Champions League');
  const [eventHome, setEventHome] = useState('');
  const [eventAway, setEventAway] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventVenue, setEventVenue] = useState('FTD National Arena');

  // General Management Forms
  const [newUserName, setNewUserName] = useState('');
  const [newUserClub, setNewUserClub] = useState('');
  const [newUserRole, setNewUserRole] = useState<'Player' | 'Captain' | 'Broadcaster' | 'Moderator'>('Player');

  // Hydrate inputs when server state changes
  useEffect(() => {
    if (!state) return;
    const { liveMatch, site, ballonDorState } = state;
    setStreamUrlInput(liveMatch.streamUrl);
    setStreamTitleInput(liveMatch.streamTitle);
    setCompNameInput(liveMatch.competitionName);
    setStadiumInput(liveMatch.stadiumName);
    setManualHomeScore(String(liveMatch.homeScore));
    setManualAwayScore(String(liveMatch.awayScore));
    setManualMinute(String(liveMatch.matchMinute));
    setManualSecond(String(liveMatch.matchSecond));
    setManualHalf(liveMatch.halfLabel);
    setHomeNameOverride(liveMatch.homeTeamName);
    setHomeShortOverride(liveMatch.homeTeamShort);
    setHomeLogoOverride(liveMatch.homeTeamLogo);
    setHomeColorOverride(liveMatch.homeTeamColor);
    setAwayNameOverride(liveMatch.awayTeamName);
    setAwayShortOverride(liveMatch.awayTeamShort);
    setAwayLogoOverride(liveMatch.awayTeamLogo);
    setAwayColorOverride(liveMatch.awayTeamColor);

    setCeremonyTitle(ballonDorState.ceremonyTitle);
    setSeasonYear(ballonDorState.seasonYear);
    setCeremonyDate(ballonDorState.ceremonyDate);

    setHeroEyebrow(site.heroEyebrow);
    setHeroTitle(site.heroTitle);
    setHeroSubtitle(site.heroSubtitle);
    setIntroTitle(site.gameIntroTitle);
    setIntroBody(site.gameIntroBody);
    setAnnouncementText(site.announcementText);
    setAnnouncementActive(site.announcementActive);
    setSeasonLabel(site.seasonLabel);
    setLogoUrlInput(site.logoUrl);
    setChatEnabled(site.chatEnabled);
    setMaintenanceMode(site.maintenanceMode);
  }, [state]);

  const showNotice = (type: 'ok' | 'err', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => {
      setNotice((curr) => (curr?.text === text ? null : curr));
    }, 4000);
  };

  if (!state) return null;

  // Unauthenticated Gate
  if (!isAdmin) {
    return (
      <div className="min-h-[80vh] bg-[#050608] text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl bg-[#0D1017] border border-white/15 p-8 text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-xl bg-white text-black flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-extrabold uppercase text-white">
              FTD Admin Command Center
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Protected by verified Google Admin authentication. Normal visitors cannot execute broadcast, Ballon d&apos;Or, or website mutations.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenLogin}
            className="w-full py-3 rounded-lg bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            Admin Login
          </button>
        </div>
      </div>
    );
  }

  const { liveMatch, nominees, ballonDorState, ballonDorHistory, teams, news, competitions, upcomingEvents, users, chatMessages, matchEvents } = state;

  const handleFileUpload = async (
    e: ChangeEvent<HTMLInputElement>,
    setter: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setter(dataUrl);
      showNotice('ok', 'Image ready — save or submit to publish live.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Image upload failed.');
    }
  };

  // ---- Live Broadcast Handlers ----
  const updateLive = async (payload: Record<string, unknown>, msg = 'Live match updated.') => {
    const res = await apiRequest('/api/admin/live', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!res.ok) showNotice('err', res.error || 'Update failed.');
    else showNotice('ok', msg);
  };

  const triggerGoal = async (side: 'home' | 'away') => {
    const res = await apiRequest('/api/admin/live/goal', {
      method: 'POST',
      body: JSON.stringify({ side, scorer: scorerName.trim() }),
    });
    if (!res.ok) showNotice('err', res.error || 'Could not record goal.');
    else {
      setScorerName('');
      showNotice('ok', `Goal recorded for ${side === 'home' ? liveMatch.homeTeamName : liveMatch.awayTeamName}!`);
    }
  };

  const undoGoal = async () => {
    const res = await apiRequest('/api/admin/live/undo-goal', { method: 'POST' });
    if (!res.ok) showNotice('err', res.error || 'No goal to undo.');
    else showNotice('ok', 'Last goal undone.');
  };

  const matchControl = async (action: string) => {
    const res = await apiRequest('/api/admin/live/control', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    if (!res.ok) showNotice('err', res.error || 'Control failed.');
    else showNotice('ok', `Match action applied: ${action.replace('_', ' ')}`);
  };

  const addTeam = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    const res = await apiRequest('/api/admin/teams', {
      method: 'POST',
      body: JSON.stringify({
        name: newTeamName.trim(),
        shortName: newTeamShort.trim() || newTeamName.trim().slice(0, 3),
        primaryColor: newTeamColor,
        logoUrl: newTeamLogo,
      }),
    });
    if (!res.ok) showNotice('err', res.error || 'Could not add team.');
    else {
      setNewTeamName('');
      setNewTeamShort('');
      setNewTeamLogo('');
      showNotice('ok', 'Club added to FTD roster.');
    }
  };

  const addMatchEvent = async (e: FormEvent) => {
    e.preventDefault();
    const res = await apiRequest('/api/admin/live/events', {
      method: 'POST',
      body: JSON.stringify({
        type: evType,
        teamSide: evSide,
        playerName: evPlayer.trim() || 'Squad Player',
        minute: evMinute ? Number(evMinute) : liveMatch.matchMinute,
      }),
    });
    if (!res.ok) showNotice('err', res.error || 'Failed to add event.');
    else {
      setEvPlayer('');
      setEvMinute('');
      showNotice('ok', 'Match event published.');
    }
  };

  // ---- Ballon d'Or Handlers ----
  const startEditNominee = (nom: BallonDorNominee) => {
    setEditingNominee(nom);
    setNomName(nom.name);
    setNomClub(nom.club);
    setNomPos(nom.position);
    setNomNat(nom.nationality);
    setNomKit(String(nom.kitNumber));
    setNomImg(nom.imageUrl);
    setNomGoals(String(nom.goals));
    setNomAssists(String(nom.assists));
    setNomTrophies(String(nom.trophies));
    setNomRating(String(nom.rating));
    setNomRank(String(nom.rankOrder));
    setNomVotes(String(nom.votes));
  };

  const resetNomineeForm = () => {
    setEditingNominee(null);
    setNomName('');
    setNomClub('');
    setNomPos('ST');
    setNomNat('');
    setNomKit('10');
    setNomImg('');
    setNomGoals('0');
    setNomAssists('0');
    setNomTrophies('0');
    setNomRating('90.0');
    setNomRank(String(nominees.length + 1));
    setNomVotes('0');
  };

  const saveNominee = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      name: nomName.trim(),
      club: nomClub.trim(),
      position: nomPos.trim() || 'FW',
      nationality: nomNat.trim() || 'International',
      kitNumber: Number(nomKit) || 10,
      imageUrl: nomImg,
      goals: Number(nomGoals) || 0,
      assists: Number(nomAssists) || 0,
      trophies: Number(nomTrophies) || 0,
      rating: Number(nomRating) || 88.0,
      rankOrder: Number(nomRank) || 1,
      votes: Number(nomVotes) || 0,
    };

    const res = editingNominee
      ? await apiRequest(`/api/admin/nominees/${editingNominee.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      : await apiRequest('/api/admin/nominees', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

    if (!res.ok) showNotice('err', res.error || 'Could not save player.');
    else {
      showNotice('ok', editingNominee ? 'Nominee updated live!' : 'New nominee added to Ballon d\'Or!');
      resetNomineeForm();
    }
  };

  const triggerCeremonyReveal = async (winnerId: number | null) => {
    if (!winnerId) {
      showNotice('err', 'Select a winner first before starting the ceremony.');
      return;
    }
    await apiRequest('/api/admin/ballondor/state', {
      method: 'PUT',
      body: JSON.stringify({ winnerId, ceremonyPhase: 'countdown' }),
    });
    showNotice('ok', 'Ceremony countdown started live on Ballon d\'Or page!');
    window.setTimeout(async () => {
      await apiRequest('/api/admin/ballondor/state', {
        method: 'PUT',
        body: JSON.stringify({ winnerId, ceremonyPhase: 'revealed' }),
      });
    }, 2800);
  };

  // ---- Website Handlers ----
  const saveWebsiteSettings = async (e: FormEvent) => {
    e.preventDefault();
    const res = await apiRequest('/api/admin/site', {
      method: 'PUT',
      body: JSON.stringify({
        logoUrl: logoUrlInput,
        heroEyebrow,
        heroTitle,
        heroSubtitle,
        gameIntroTitle: introTitle,
        gameIntroBody: introBody,
        announcementText,
        announcementActive,
        seasonLabel,
        chatEnabled,
        maintenanceMode,
      }),
    });
    if (!res.ok) showNotice('err', res.error || 'Failed to publish site settings.');
    else showNotice('ok', 'Website changes published live to all visitors!');
  };

  const publishNews = async (e: FormEvent) => {
    e.preventDefault();
    const res = await apiRequest('/api/admin/news', {
      method: 'POST',
      body: JSON.stringify({
        title: newsTitle,
        category: newsCategory,
        summary: newsSummary,
        body: newsBody || newsSummary,
        imageUrl: newsImage,
        featured: newsFeatured,
      }),
    });
    if (!res.ok) showNotice('err', res.error || 'Failed to publish article.');
    else {
      setNewsTitle('');
      setNewsSummary('');
      setNewsBody('');
      setNewsImage('');
      setNewsFeatured(false);
      showNotice('ok', 'News article published live!');
    }
  };

  const addCompetition = async (e: FormEvent) => {
    e.preventDefault();
    const res = await apiRequest('/api/admin/competitions', {
      method: 'POST',
      body: JSON.stringify({
        name: compTitle,
        format: compFormat,
        status: compStatus,
        teamsCount: Number(compTeamsCount) || 16,
        prizePool: compPrize,
        season: seasonLabel,
        description: compDesc,
      }),
    });
    if (!res.ok) showNotice('err', res.error || 'Failed to add competition.');
    else {
      setCompTitle('');
      setCompDesc('');
      showNotice('ok', 'Competition added.');
    }
  };

  const addUpcomingEvent = async (e: FormEvent) => {
    e.preventDefault();
    const res = await apiRequest('/api/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: eventTitle,
        competition: eventComp,
        homeTeam: eventHome,
        awayTeam: eventAway,
        kickoffTime: eventTime,
        venue: eventVenue,
      }),
    });
    if (!res.ok) showNotice('err', res.error || 'Failed to add event.');
    else {
      setEventTitle('');
      setEventHome('');
      setEventAway('');
      setEventTime('');
      showNotice('ok', 'Upcoming fixture added.');
    }
  };

  const editions: Array<{ id: ScoreboardEdition; label: string; accent: string }> = [
    { id: 'champions-league', label: 'Champions League Edition', accent: 'border-sky-400/50 text-sky-300' },
    { id: 'premier-league', label: 'Premier League Edition', accent: 'border-pink-400/50 text-pink-300' },
    { id: 'bundesliga', label: 'Bundesliga Edition', accent: 'border-red-500/50 text-red-300' },
    { id: 'world-cup', label: 'World Cup Edition', accent: 'border-amber-400/50 text-amber-300' },
  ];

  return (
    <div className="min-h-screen bg-[#050608] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Admin Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 uppercase tracking-widest">
              <Shield className="w-3.5 h-3.5" />
              <span>Authenticated Admin Session · Instant Global Sync</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase text-white mt-1">
              FTD Administration Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateLive({}, 'Broadcast state published.')}
              className="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase tracking-wide hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              Publish Sync
            </button>
            <button
              type="button"
              onClick={() => setAdminToken(null)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Lock Admin</span>
            </button>
          </div>
        </div>

        {/* Toast Feedback */}
        {notice && (
          <div
            className={`px-4 py-3 rounded-lg border text-sm font-medium ${
              notice.type === 'ok'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : 'bg-red-500/15 border-red-500/40 text-red-200'
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* 4 Admin Workspace Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
          {[
            { id: 'live' as AdminTab, label: 'C) Live & Scoreboard', icon: Radio },
            { id: 'ballon-dor' as AdminTab, label: "B) Ballon d'Or", icon: Trophy },
            { id: 'website' as AdminTab, label: 'A) Website & News', icon: Globe },
            { id: 'general' as AdminTab, label: 'D) General & Security', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-black'
                    : 'bg-[#0D1017] text-zinc-300 border border-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* ============================================================
            TAB C: LIVE BROADCAST & SCOREBOARD MANAGEMENT
           ============================================================ */}
        {tab === 'live' && (
          <div className="space-y-8">
            {/* Live Preview of Scoreboard */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Live Public Scoreboard Preview
              </div>
              <BroadcastScoreboard
                match={liveMatch}
                goalAlert={activeGoalAlert}
                onDismissGoal={dismissGoalAlert}
              />
            </div>

            {/* GOAL SYSTEM + MATCH CLOCK */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-2xl font-bold uppercase text-white">
                    Live Goal System
                  </h2>
                  <button
                    type="button"
                    onClick={undoGoal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo Last Goal</span>
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">
                    Optional Goalscorer Name (shown in GOOOOOAL! overlay)
                  </label>
                  <input
                    type="text"
                    value={scorerName}
                    onChange={(e) => setScorerName(e.target.value)}
                    placeholder="e.g. Kieran Vance"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => triggerGoal('home')}
                    className="py-4 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-display text-xl font-extrabold uppercase tracking-wide transition-colors cursor-pointer"
                  >
                    +1 GOAL {liveMatch.homeTeamShort}
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerGoal('away')}
                    className="py-4 px-4 rounded-xl bg-sky-400 hover:bg-sky-300 text-black font-display text-xl font-extrabold uppercase tracking-wide transition-colors cursor-pointer"
                  >
                    +1 GOAL {liveMatch.awayTeamShort}
                  </button>
                </div>

                {/* Manual Score Override */}
                <div className="pt-4 border-t border-white/10 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Home Score</label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={manualHomeScore}
                      onChange={(e) => setManualHomeScore(e.target.value)}
                      className="w-20 px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Away Score</label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={manualAwayScore}
                      onChange={(e) => setManualAwayScore(e.target.value)}
                      className="w-20 px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm font-mono text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateLive(
                        {
                          homeScore: Number(manualHomeScore) || 0,
                          awayScore: Number(manualAwayScore) || 0,
                        },
                        'Score updated manually.'
                      )
                    }
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer"
                  >
                    Set Score
                  </button>
                </div>
              </div>

              {/* Match Clock & Status Controls */}
              <div className="lg:col-span-6 rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-5">
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Match Clock &amp; Status
                </h2>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => matchControl('start')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 text-black text-xs font-bold uppercase cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Kick Off</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => matchControl('pause')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-400 text-black text-xs font-bold uppercase cursor-pointer"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => matchControl('resume')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => matchControl('halftime')}
                    className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold uppercase text-white cursor-pointer"
                  >
                    Half-Time
                  </button>
                  <button
                    type="button"
                    onClick={() => matchControl('second_half')}
                    className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold uppercase text-white cursor-pointer"
                  >
                    2nd Half
                  </button>
                  <button
                    type="button"
                    onClick={() => matchControl('end')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold uppercase text-white cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>End Match</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => matchControl('reset')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/15 text-xs font-bold uppercase text-zinc-300 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Match</span>
                  </button>
                </div>

                <div className="pt-4 border-t border-white/10 grid grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Minute</label>
                    <input
                      type="number"
                      min={0}
                      max={130}
                      value={manualMinute}
                      onChange={(e) => setManualMinute(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Second</label>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={manualSecond}
                      onChange={(e) => setManualSecond(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Half Label</label>
                    <input
                      type="text"
                      value={manualHalf}
                      onChange={(e) => setManualHalf(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateLive(
                      {
                        matchMinute: Number(manualMinute) || 0,
                        matchSecond: Number(manualSecond) || 0,
                        halfLabel: manualHalf,
                      },
                      'Match time updated.'
                    )
                  }
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer"
                >
                  Apply Clock &amp; Half
                </button>
              </div>
            </div>

            {/* SCOREBOARD EDITION + LIVESTREAM SOURCE */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-5">
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Scoreboard Design Mode
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {editions.map((ed) => {
                    const active = liveMatch.scoreboardEdition === ed.id;
                    return (
                      <button
                        key={ed.id}
                        type="button"
                        onClick={() => updateLive({ scoreboardEdition: ed.id }, `Switched to ${ed.label}`)}
                        className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          active
                            ? `bg-white/10 ${ed.accent}`
                            : 'bg-[#06080C] border-white/10 text-zinc-300 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold">{ed.label}</span>
                          {active && <Check className="w-4 h-4" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-6 rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-display text-2xl font-bold uppercase text-white">
                    Livestream Control
                  </h2>
                  <button
                    type="button"
                    onClick={() =>
                      updateLive(
                        { streamActive: !liveMatch.streamActive },
                        !liveMatch.streamActive ? 'Livestream started!' : 'Livestream stopped.'
                      )
                    }
                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide cursor-pointer ${
                      liveMatch.streamActive
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                    }`}
                  >
                    {liveMatch.streamActive ? 'Stop Livestream' : 'Start Livestream'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Stream Title</label>
                    <input
                      type="text"
                      value={streamTitleInput}
                      onChange={(e) => setStreamTitleInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Competition Label</label>
                    <input
                      type="text"
                      value={compNameInput}
                      onChange={(e) => setCompNameInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Stream Link (Discord, YouTube, Twitch, Kick, or MP4)
                    </label>
                    <input
                      type="text"
                      value={streamUrlInput}
                      onChange={(e) => setStreamUrlInput(e.target.value)}
                      placeholder="https://discord.gg/... or https://discord.com/channels/..."
                      className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                    />
                    {isDiscordStreamUrl(streamUrlInput) && (
                      <p className="text-[11px] text-[#8EA1FF] mt-1">
                        Discord stream link detected — &ldquo;Watch Live&rdquo; will open this stream on Discord.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Stadium / Venue</label>
                    <input
                      type="text"
                      value={stadiumInput}
                      onChange={(e) => setStadiumInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    updateLive(
                      {
                        streamUrl: streamUrlInput,
                        streamTitle: streamTitleInput,
                        competitionName: compNameInput,
                        stadiumName: stadiumInput,
                      },
                      'Stream configuration saved!'
                    )
                  }
                  className="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                >
                  Save Stream Settings
                </button>
              </div>
            </div>

            {/* TEAM SELECTION & LOGOS */}
            <div className="rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-6">
              <h2 className="font-display text-2xl font-bold uppercase text-white">
                Match Teams &amp; Logos
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Home Team Config */}
                <div className="p-4 rounded-lg bg-[#080A0F] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                      Home Team
                    </span>
                    <TeamCrest
                      name={homeNameOverride || liveMatch.homeTeamName}
                      shortName={homeShortOverride || liveMatch.homeTeamShort}
                      logoUrl={homeLogoOverride}
                      primaryColor={homeColorOverride}
                      size="sm"
                    />
                  </div>
                  <select
                    value={liveMatch.homeTeamId || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        updateLive({ selectHomeTeamId: Number(e.target.value) }, 'Home team selected.');
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  >
                    <option value="">Select Registered Club...</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.shortName})
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={homeNameOverride}
                      onChange={(e) => setHomeNameOverride(e.target.value)}
                      placeholder="Team Name"
                      className="col-span-2 px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={homeShortOverride}
                      onChange={(e) => setHomeShortOverride(e.target.value.toUpperCase().slice(0, 4))}
                      placeholder="TAG"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs font-mono text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={homeColorOverride}
                      onChange={(e) => setHomeColorOverride(e.target.value)}
                      className="w-9 h-9 rounded bg-transparent border border-white/15 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={homeLogoOverride}
                      onChange={(e) => setHomeLogoOverride(e.target.value)}
                      placeholder="Logo URL or upload..."
                      className="flex-1 px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <label className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer inline-flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, setHomeLogoOverride)}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateLive(
                        {
                          homeTeamName: homeNameOverride,
                          homeTeamShort: homeShortOverride,
                          homeTeamLogo: homeLogoOverride,
                          homeTeamColor: homeColorOverride,
                        },
                        'Home team details updated.'
                      )
                    }
                    className="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                  >
                    Apply Home Team
                  </button>
                </div>

                {/* Away Team Config */}
                <div className="p-4 rounded-lg bg-[#080A0F] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                      Away Team
                    </span>
                    <TeamCrest
                      name={awayNameOverride || liveMatch.awayTeamName}
                      shortName={awayShortOverride || liveMatch.awayTeamShort}
                      logoUrl={awayLogoOverride}
                      primaryColor={awayColorOverride}
                      size="sm"
                    />
                  </div>
                  <select
                    value={liveMatch.awayTeamId || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        updateLive({ selectAwayTeamId: Number(e.target.value) }, 'Away team selected.');
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  >
                    <option value="">Select Registered Club...</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.shortName})
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={awayNameOverride}
                      onChange={(e) => setAwayNameOverride(e.target.value)}
                      placeholder="Team Name"
                      className="col-span-2 px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={awayShortOverride}
                      onChange={(e) => setAwayShortOverride(e.target.value.toUpperCase().slice(0, 4))}
                      placeholder="TAG"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs font-mono text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={awayColorOverride}
                      onChange={(e) => setAwayColorOverride(e.target.value)}
                      className="w-9 h-9 rounded bg-transparent border border-white/15 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={awayLogoOverride}
                      onChange={(e) => setAwayLogoOverride(e.target.value)}
                      placeholder="Logo URL or upload..."
                      className="flex-1 px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <label className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer inline-flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, setAwayLogoOverride)}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateLive(
                        {
                          awayTeamName: awayNameOverride,
                          awayTeamShort: awayShortOverride,
                          awayTeamLogo: awayLogoOverride,
                          awayTeamColor: awayColorOverride,
                        },
                        'Away team details updated.'
                      )
                    }
                    className="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                  >
                    Apply Away Team
                  </button>
                </div>
              </div>

              {/* Add Club to Roster */}
              <form onSubmit={addTeam} className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">Add New Club to Roster</label>
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Club Name"
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Short (3 Letters)</label>
                  <input
                    type="text"
                    value={newTeamShort}
                    onChange={(e) => setNewTeamShort(e.target.value.toUpperCase().slice(0, 4))}
                    placeholder="FTD"
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs font-mono text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newTeamColor}
                    onChange={(e) => setNewTeamColor(e.target.value)}
                    className="w-9 h-9 rounded bg-transparent border border-white/15 cursor-pointer"
                  />
                  <label className="flex-1 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer text-center">
                    Logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, setNewTeamLogo)}
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  className="py-2 px-4 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                >
                  Add Club
                </button>
              </form>

              <div className="flex flex-wrap gap-2">
                {teams.map((t: Team) => (
                  <div
                    key={t.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#080A0F] border border-white/10 text-xs"
                  >
                    <TeamCrest
                      name={t.name}
                      shortName={t.shortName}
                      logoUrl={t.logoUrl}
                      primaryColor={t.primaryColor}
                      size="sm"
                    />
                    <span>{t.name}</span>
                    <button
                      type="button"
                      onClick={() => apiRequest(`/api/admin/teams/${t.id}`, { method: 'DELETE' })}
                      className="text-zinc-500 hover:text-red-400 cursor-pointer"
                      aria-label={`Delete ${t.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* MATCH EVENTS & CHAT MODERATION */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-4">
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Manage Match Events
                </h2>
                <form onSubmit={addMatchEvent} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <select
                    value={evType}
                    onChange={(e) => setEvType(e.target.value as typeof evType)}
                    className="px-2.5 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                  >
                    <option value="YELLOW_CARD">Yellow Card</option>
                    <option value="RED_CARD">Red Card</option>
                    <option value="SUB">Substitution</option>
                    <option value="GOAL">Goal Note</option>
                  </select>
                  <select
                    value={evSide}
                    onChange={(e) => setEvSide(e.target.value as 'home' | 'away')}
                    className="px-2.5 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                  >
                    <option value="home">{liveMatch.homeTeamShort}</option>
                    <option value="away">{liveMatch.awayTeamShort}</option>
                  </select>
                  <input
                    type="text"
                    value={evPlayer}
                    onChange={(e) => setEvPlayer(e.target.value)}
                    placeholder="Player / Note"
                    className="px-2.5 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                  >
                    Log Event
                  </button>
                </form>

                <div className="divide-y divide-white/10 max-h-56 overflow-y-auto">
                  {matchEvents.map((ev) => (
                    <div key={ev.id} className="py-2 flex items-center justify-between text-xs">
                      <span>
                        <strong className="font-mono">{ev.minute}&apos;</strong> · {ev.type} · {ev.playerName}
                      </span>
                      <button
                        type="button"
                        onClick={() => apiRequest(`/api/admin/live/events/${ev.id}`, { method: 'DELETE' })}
                        className="text-zinc-500 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-2xl font-bold uppercase text-white">
                    Live Chat Moderation
                  </h2>
                  <button
                    type="button"
                    onClick={() => apiRequest('/api/admin/chat/clear', { method: 'POST' })}
                    className="px-3 py-1.5 rounded bg-red-600/20 border border-red-500/40 text-xs font-semibold text-red-300 cursor-pointer"
                  >
                    Clear All Chat
                  </button>
                </div>
                <div className="divide-y divide-white/10 max-h-64 overflow-y-auto">
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0 truncate">
                        <strong className="text-white">{msg.sender}:</strong>{' '}
                        <span className="text-zinc-300">{msg.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => apiRequest(`/api/admin/chat/${msg.id}`, { method: 'DELETE' })}
                        className="text-zinc-500 hover:text-red-400 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            TAB B: BALLON D'OR MANAGEMENT
           ============================================================ */}
        {tab === 'ballon-dor' && (
          <div className="space-y-8">
            {/* Ceremony & Voting Controls */}
            <div className="rounded-xl bg-[#0D1017] border border-amber-400/30 p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-bold uppercase text-white">
                    Ceremony &amp; Voting Controls
                  </h2>
                  <p className="text-xs text-zinc-400">
                    All updates appear instantly on the public Ballon d&apos;Or page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    apiRequest('/api/admin/ballondor/state', {
                      method: 'PUT',
                      body: JSON.stringify({ votingEnabled: !ballonDorState.votingEnabled }),
                    })
                  }
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase cursor-pointer ${
                    ballonDorState.votingEnabled
                      ? 'bg-emerald-500 text-black'
                      : 'bg-white/10 text-zinc-300 border border-white/15'
                  }`}
                >
                  {ballonDorState.votingEnabled ? 'Voting Mode: ACTIVE' : 'Voting Mode: LOCKED'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Ceremony Title</label>
                  <input
                    type="text"
                    value={ceremonyTitle}
                    onChange={(e) => setCeremonyTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Season Year</label>
                  <input
                    type="text"
                    value={seasonYear}
                    onChange={(e) => setSeasonYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Ceremony Date</label>
                  <input
                    type="text"
                    value={ceremonyDate}
                    onChange={(e) => setCeremonyDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    apiRequest('/api/admin/ballondor/state', {
                      method: 'PUT',
                      body: JSON.stringify({ ceremonyTitle, seasonYear, ceremonyDate }),
                    })
                  }
                  className="py-2 px-4 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                >
                  Save Ceremony Info
                </button>
              </div>

              {/* Select Winner + Trigger Reveal */}
              <div className="pt-4 border-t border-white/10 flex flex-wrap items-center gap-3">
                <select
                  value={ballonDorState.winnerId ?? ''}
                  onChange={(e) =>
                    apiRequest('/api/admin/ballondor/state', {
                      method: 'PUT',
                      body: JSON.stringify({
                        winnerId: e.target.value ? Number(e.target.value) : null,
                      }),
                    })
                  }
                  className="px-3.5 py-2.5 rounded-lg bg-[#06080C] border border-amber-400/40 text-sm text-white min-w-[220px]"
                >
                  <option value="">Select Official Winner...</option>
                  {nominees.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} ({n.club})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => triggerCeremonyReveal(ballonDorState.winnerId)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase tracking-wide cursor-pointer"
                >
                  <Crown className="w-4 h-4" />
                  <span>Start Ceremony Reveal</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    apiRequest('/api/admin/ballondor/state', {
                      method: 'PUT',
                      body: JSON.stringify({ ceremonyPhase: 'idle', winnerId: null }),
                    })
                  }
                  className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer"
                >
                  Reset Ceremony
                </button>
              </div>
            </div>

            {/* Add / Edit Player Form */}
            <form onSubmit={saveNominee} className="rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  {editingNominee ? `Edit Player: ${editingNominee.name}` : 'Add Ballon d\'Or Nominee'}
                </h2>
                {editingNominee && (
                  <button
                    type="button"
                    onClick={resetNomineeForm}
                    className="text-xs text-zinc-400 hover:text-white underline cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={nomName}
                  onChange={(e) => setNomName(e.target.value)}
                  placeholder="Player Name"
                  className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                />
                <input
                  type="text"
                  required
                  value={nomClub}
                  onChange={(e) => setNomClub(e.target.value)}
                  placeholder="Club Name"
                  className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                />
                <input
                  type="text"
                  value={nomPos}
                  onChange={(e) => setNomPos(e.target.value.toUpperCase())}
                  placeholder="Position (e.g. ST, CAM)"
                  className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                />
                <input
                  type="text"
                  value={nomNat}
                  onChange={(e) => setNomNat(e.target.value)}
                  placeholder="Nationality"
                  className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                />
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Kit #</label>
                  <input
                    type="number"
                    value={nomKit}
                    onChange={(e) => setNomKit(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Goals</label>
                  <input
                    type="number"
                    value={nomGoals}
                    onChange={(e) => setNomGoals(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Assists</label>
                  <input
                    type="number"
                    value={nomAssists}
                    onChange={(e) => setNomAssists(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Trophies</label>
                  <input
                    type="number"
                    value={nomTrophies}
                    onChange={(e) => setNomTrophies(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Season Rating</label>
                  <input
                    type="number"
                    step="0.1"
                    value={nomRating}
                    onChange={(e) => setNomRating(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Rank Position</label>
                  <input
                    type="number"
                    min={1}
                    value={nomRank}
                    onChange={(e) => setNomRank(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Votes</label>
                  <input
                    type="number"
                    min={0}
                    value={nomVotes}
                    onChange={(e) => setNomVotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Player Image (Upload or URL)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nomImg}
                      onChange={(e) => setNomImg(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <label className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer inline-flex items-center">
                      <Upload className="w-3.5 h-3.5" />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, setNomImg)}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{editingNominee ? 'Update Player Card' : 'Add Player to Shortlist'}</span>
              </button>
            </form>

            {/* Nominees List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nominees.map((nom) => (
                <div
                  key={nom.id}
                  className="rounded-xl bg-[#0D1017] border border-white/10 p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-white/10">
                      <PlayerAvatar
                        name={nom.name}
                        kitNumber={nom.kitNumber}
                        imageUrl={nom.imageUrl}
                        accent={nom.isWinner ? 'gold' : 'white'}
                        className="w-14 h-14"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-amber-300">
                        Rank #{nom.rankOrder} {nom.isWinner ? '· WINNER' : ''}
                      </div>
                      <div className="font-bold text-white truncate">{nom.name}</div>
                      <div className="text-xs text-zinc-400 truncate">
                        {nom.club} · {nom.goals}G {nom.assists}A · {nom.rating} RTG
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditNominee(nom)}
                      className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => apiRequest(`/api/admin/nominees/${nom.id}`, { method: 'DELETE' })}
                      className="p-1.5 text-zinc-500 hover:text-red-400 cursor-pointer"
                      aria-label={`Remove ${nom.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Past Winners History */}
            <div className="rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-4">
              <h2 className="font-display text-2xl font-bold uppercase text-white">
                Past Ballon d&apos;Or Winners History
              </h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await apiRequest('/api/admin/ballondor/history', {
                    method: 'POST',
                    body: JSON.stringify({
                      year: histYear,
                      winnerName: histWinner,
                      club: histClub,
                      statsSummary: histSummary,
                    }),
                  });
                  if (res.ok) {
                    setHistYear('');
                    setHistWinner('');
                    setHistClub('');
                    setHistSummary('');
                    showNotice('ok', 'Added to Ballon d\'Or Hall of Fame.');
                  }
                }}
                className="grid grid-cols-1 sm:grid-cols-5 gap-2"
              >
                <input
                  type="text"
                  required
                  value={histYear}
                  onChange={(e) => setHistYear(e.target.value)}
                  placeholder="Year (e.g. 2022)"
                  className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                />
                <input
                  type="text"
                  required
                  value={histWinner}
                  onChange={(e) => setHistWinner(e.target.value)}
                  placeholder="Winner Name"
                  className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                />
                <input
                  type="text"
                  required
                  value={histClub}
                  onChange={(e) => setHistClub(e.target.value)}
                  placeholder="Club"
                  className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                />
                <input
                  type="text"
                  value={histSummary}
                  onChange={(e) => setHistSummary(e.target.value)}
                  placeholder="Stats summary"
                  className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                >
                  Add History
                </button>
              </form>

              <div className="divide-y divide-white/10">
                {ballonDorHistory.map((h) => (
                  <div key={h.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-amber-400" />
                      <strong className="text-amber-300 font-mono">{h.year}</strong>
                      <span className="font-semibold text-white">{h.winnerName}</span>
                      <span className="text-zinc-400">({h.club}) · {h.statsSummary}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => apiRequest(`/api/admin/ballondor/history/${h.id}`, { method: 'DELETE' })}
                      className="text-zinc-500 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            TAB A: WEBSITE MANAGEMENT
           ============================================================ */}
        {tab === 'website' && (
          <div className="space-y-8">
            <form onSubmit={saveWebsiteSettings} className="rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-5">
              <h2 className="font-display text-2xl font-bold uppercase text-white">
                Homepage Hero, Branding &amp; Announcements
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Hero Eyebrow</label>
                  <input
                    type="text"
                    value={heroEyebrow}
                    onChange={(e) => setHeroEyebrow(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Season Label</label>
                  <input
                    type="text"
                    value={seasonLabel}
                    onChange={(e) => setSeasonLabel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">Hero Headline</label>
                  <input
                    type="text"
                    value={heroTitle}
                    onChange={(e) => setHeroTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">Hero Subtitle</label>
                  <textarea
                    rows={2}
                    value={heroSubtitle}
                    onChange={(e) => setHeroSubtitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Game Intro Title</label>
                  <input
                    type="text"
                    value={introTitle}
                    onChange={(e) => setIntroTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">FTD Brand Logo (URL or Upload)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={logoUrlInput}
                      onChange={(e) => setLogoUrlInput(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <label className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer inline-flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, setLogoUrlInput)}
                      />
                    </label>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1">Game Introduction Body</label>
                  <textarea
                    rows={3}
                    value={introBody}
                    onChange={(e) => setIntroBody(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  />
                </div>
                <div className="md:col-span-2 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[240px]">
                    <label className="block text-xs text-zinc-400 mb-1">Top Announcement Banner</label>
                    <input
                      type="text"
                      value={announcementText}
                      onChange={(e) => setAnnouncementText(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300 pt-5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={announcementActive}
                      onChange={(e) => setAnnouncementActive(e.target.checked)}
                    />
                    <span>Show Announcement Banner</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
              >
                Publish Homepage Changes
              </button>
            </form>

            {/* News Publisher */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form onSubmit={publishNews} className="lg:col-span-6 rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-4">
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Publish News &amp; Announcements
                </h2>
                <input
                  type="text"
                  required
                  value={newsTitle}
                  onChange={(e) => setNewsTitle(e.target.value)}
                  placeholder="Headline"
                  className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newsCategory}
                    onChange={(e) => setNewsCategory(e.target.value)}
                    placeholder="Category"
                    className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                  />
                  <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{newsImage ? 'Image Attached' : 'Upload Article Image'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, setNewsImage)}
                    />
                  </label>
                </div>
                <input
                  type="text"
                  required
                  value={newsSummary}
                  onChange={(e) => setNewsSummary(e.target.value)}
                  placeholder="Short Summary"
                  className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                />
                <textarea
                  rows={3}
                  value={newsBody}
                  onChange={(e) => setNewsBody(e.target.value)}
                  placeholder="Full Article Body"
                  className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-sm text-white"
                />
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newsFeatured}
                      onChange={(e) => setNewsFeatured(e.target.checked)}
                    />
                    <span>Feature at Top of News Desk</span>
                  </label>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                  >
                    Publish Article
                  </button>
                </div>
              </form>

              <div className="lg:col-span-6 rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-4">
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Published Articles ({news.length})
                </h2>
                <div className="divide-y divide-white/10 max-h-80 overflow-y-auto">
                  {news.map((n) => (
                    <div key={n.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-400">
                          {n.category} · {n.publishedAt} {n.featured ? '· FEATURED' : ''}
                        </div>
                        <div className="font-semibold text-sm text-white truncate">{n.title}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => apiRequest(`/api/admin/news/${n.id}`, { method: 'DELETE' })}
                        className="text-zinc-500 hover:text-red-400 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Competitions & Upcoming Matches */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-4">
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Competitions Manager
                </h2>
                <form onSubmit={addCompetition} className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={compTitle}
                      onChange={(e) => setCompTitle(e.target.value)}
                      placeholder="Competition Name"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={compStatus}
                      onChange={(e) => setCompStatus(e.target.value)}
                      placeholder="Status (e.g. Knockout)"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={compFormat}
                      onChange={(e) => setCompFormat(e.target.value)}
                      placeholder="Format"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <input
                      type="number"
                      value={compTeamsCount}
                      onChange={(e) => setCompTeamsCount(e.target.value)}
                      placeholder="Teams"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                  </div>
                  <input
                    type="text"
                    value={compDesc}
                    onChange={(e) => setCompDesc(e.target.value)}
                    placeholder="Description"
                    className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                  >
                    Add Competition
                  </button>
                </form>

                <div className="divide-y divide-white/10">
                  {competitions.map((c) => (
                    <div key={c.id} className="py-2 flex items-center justify-between text-xs">
                      <span>
                        <strong className="text-white">{c.name}</strong> · {c.status} ({c.teamsCount} teams)
                      </span>
                      <button
                        type="button"
                        onClick={() => apiRequest(`/api/admin/competitions/${c.id}`, { method: 'DELETE' })}
                        className="text-zinc-500 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-4">
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Upcoming Fixtures &amp; Events
                </h2>
                <form onSubmit={addUpcomingEvent} className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder="Fixture Title"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={eventComp}
                      onChange={(e) => setEventComp(e.target.value)}
                      placeholder="Competition"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={eventHome}
                      onChange={(e) => setEventHome(e.target.value)}
                      placeholder="Home Team"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={eventAway}
                      onChange={(e) => setEventAway(e.target.value)}
                      placeholder="Away Team"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                      placeholder="Kickoff (e.g. 2026-11-29 20:00 UTC)"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={eventVenue}
                      onChange={(e) => setEventVenue(e.target.value)}
                      placeholder="Venue"
                      className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                  >
                    Add Upcoming Match
                  </button>
                </form>

                <div className="divide-y divide-white/10">
                  {upcomingEvents.map((ev) => (
                    <div key={ev.id} className="py-2 flex items-center justify-between text-xs">
                      <span>
                        <strong className="text-white">{ev.homeTeam} vs {ev.awayTeam}</strong> · {ev.kickoffTime}
                      </span>
                      <button
                        type="button"
                        onClick={() => apiRequest(`/api/admin/events/${ev.id}`, { method: 'DELETE' })}
                        className="text-zinc-500 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            TAB D: GENERAL MANAGEMENT & ACCESS SECURITY
           ============================================================ */}
        {tab === 'general' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Users & Roster Management */}
            <div className="lg:col-span-7 rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-white" />
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Manage FTD Users &amp; Officials
                </h2>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await apiRequest('/api/admin/users', {
                    method: 'POST',
                    body: JSON.stringify({
                      username: newUserName,
                      club: newUserClub,
                      role: newUserRole,
                    }),
                  });
                  if (res.ok) {
                    setNewUserName('');
                    setNewUserClub('');
                    showNotice('ok', 'User added to FTD directory.');
                  }
                }}
                className="grid grid-cols-1 sm:grid-cols-4 gap-2"
              >
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Username"
                  className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                />
                <input
                  type="text"
                  value={newUserClub}
                  onChange={(e) => setNewUserClub(e.target.value)}
                  placeholder="Club / Division"
                  className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                />
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as typeof newUserRole)}
                  className="px-3 py-2 rounded-lg bg-[#06080C] border border-white/15 text-xs text-white"
                >
                  <option value="Player">Player</option>
                  <option value="Captain">Captain</option>
                  <option value="Broadcaster">Broadcaster</option>
                  <option value="Moderator">Moderator</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold uppercase cursor-pointer"
                >
                  Add User
                </button>
              </form>

              <div className="divide-y divide-white/10">
                {users.map((u) => (
                  <div key={u.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-semibold text-white">{u.username}</span>
                      <span className="text-zinc-400"> · {u.club} · {u.role}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          apiRequest(`/api/admin/users/${u.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({
                              status: u.status === 'Active' ? 'Suspended' : 'Active',
                            }),
                          })
                        }
                        className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                          u.status === 'Active'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {u.status}
                      </button>
                      <button
                        type="button"
                        onClick={() => apiRequest(`/api/admin/users/${u.id}`, { method: 'DELETE' })}
                        className="text-zinc-500 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform Settings & 4-Digit Code Update */}
            <div className="lg:col-span-5 space-y-6">
              <div className="rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-4">
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Platform Controls
                </h2>
                <label className="flex items-center justify-between py-2 border-b border-white/10 text-sm cursor-pointer">
                  <span>Enable Live Spectator Chat</span>
                  <input
                    type="checkbox"
                    checked={chatEnabled}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setChatEnabled(val);
                      apiRequest('/api/admin/site', {
                        method: 'PUT',
                        body: JSON.stringify({ chatEnabled: val }),
                      });
                    }}
                  />
                </label>
                <label className="flex items-center justify-between py-2 border-b border-white/10 text-sm cursor-pointer">
                  <span>Maintenance Notice Banner</span>
                  <input
                    type="checkbox"
                    checked={maintenanceMode}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setMaintenanceMode(val);
                      apiRequest('/api/admin/site', {
                        method: 'PUT',
                        body: JSON.stringify({ maintenanceMode: val }),
                      });
                    }}
                  />
                </label>
              </div>

              <div className="rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-4">
                <h2 className="font-display text-2xl font-bold uppercase text-white">
                  Global Cloud Sync &amp; Admin Session
                </h2>
                <div className="rounded-lg bg-[#06080C] border border-white/10 p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Cloud Database</span>
                    <span className="text-emerald-400 font-semibold">Firebase Firestore Live Sync</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Visibility</span>
                    <span className="text-white font-semibold">Worldwide Real-Time</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Authenticated Admin</span>
                    <span className="text-white font-mono">{adminEmail || 'Verified Admin'}</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  All updates published in this dashboard are stored in Firestore and broadcast live to every visitor worldwide.
                </p>
                <button
                  type="button"
                  onClick={() => setAdminToken(null)}
                  className="w-full py-2.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold uppercase cursor-pointer"
                >
                  Sign Out Admin
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
