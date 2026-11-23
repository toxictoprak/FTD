import { useState } from 'react';
import { ArrowRight, Calendar, ExternalLink, Play, Trophy, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { NewsItem, PageRoute } from '../types/ftd';
import { usePlatform } from '../context/PlatformContext';
import { TeamCrest } from '../components/TeamCrest';
import { BallonDorTrophy } from '../components/BallonDorTrophy';
import { isDiscordStreamUrl, normalizeStreamHref } from '../utils/stream';

interface HomePageProps {
  onNavigate: (route: PageRoute) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { state } = usePlatform();
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);

  if (!state) return null;

  const { site, news, competitions, upcomingEvents, nominees, ballonDorState, liveMatch } = state;
  const topThree = nominees.slice(0, 3);
  const featuredNews = news[0];
  const secondaryNews = news.slice(1, 5);

  return (
    <div className="min-h-screen bg-[#050608] text-white">
      {/* Optional Announcement Strip */}
      {site.announcementActive && site.announcementText && (
        <div className="bg-white text-black border-b border-black/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4 text-xs sm:text-sm font-semibold">
            <span className="truncate">{site.announcementText}</span>
            <button
              type="button"
              onClick={() => onNavigate('live')}
              className="underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Live Arena
            </button>
          </div>
        </div>
      )}

      {/* Hero Section with Prominent FTD Logo & Stadium Floodlight Atmosphere */}
      <section className="relative overflow-hidden border-b border-white/10">
        {/* Pitch & Floodlight Radial Geometry */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              radial-gradient(ellipse 70% 50% at 22% 18%, rgba(255,255,255,0.12), transparent 70%),
              radial-gradient(ellipse 60% 45% at 85% 25%, rgba(56,189,248,0.09), transparent 70%),
              linear-gradient(180deg, rgba(13,16,23,0.4) 0%, #050608 100%)
            `,
          }}
        />
        {/* Crisp Architectural Pitch Lines */}
        <svg
          viewBox="0 0 1440 620"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none"
          aria-hidden="true"
        >
          <rect x="70" y="50" width="1300" height="520" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
          <line x1="720" y1="50" x2="720" y2="570" stroke="#FFFFFF" strokeWidth="1.5" />
          <circle cx="720" cy="310" r="110" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
          <rect x="70" y="170" width="160" height="280" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
          <rect x="1210" y="170" width="160" height="280" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
        </svg>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="lg:col-span-7 space-y-6"
            >
              <div className="flex items-center gap-4">
                <img
                  src={site.logoUrl || '/assets/aistudio/IMG_0674_a69c6a83.png'}
                  alt="FTD Emblem"
                  referrerPolicy="no-referrer"
                  className="h-14 sm:h-16 w-auto object-contain"
                />
                <div className="text-xs sm:text-sm font-medium text-zinc-400">
                  {site.heroEyebrow}
                </div>
              </div>

              <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[0.95] text-white uppercase [text-wrap:balance]">
                {site.heroTitle}
              </h1>

              <p className="text-base sm:text-lg text-zinc-300 max-w-2xl leading-relaxed">
                {site.heroSubtitle}
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('live')}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-lg bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Open Livestream</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('ballon-dor')}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-lg bg-[#121620] border border-amber-400/45 text-amber-200 font-semibold text-sm hover:bg-amber-400/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Explore Ballon d&apos;Or</span>
                </button>
              </div>
            </motion.div>

            {/* Right Matchday Spotlight Card */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 }}
              className="lg:col-span-5"
            >
              <div className="rounded-xl bg-[#0B0E14] border border-white/15 p-6 sm:p-7 space-y-6">
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                  <span className="font-semibold text-white uppercase tracking-wider">
                    {liveMatch.status === 'LIVE' ? 'Live Matchday Feed' : 'Featured Matchday'}
                  </span>
                  <span>{liveMatch.competitionName}</span>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2">
                  <div className="flex flex-col items-center text-center gap-2.5">
                    <TeamCrest
                      name={liveMatch.homeTeamName}
                      shortName={liveMatch.homeTeamShort}
                      logoUrl={liveMatch.homeTeamLogo}
                      primaryColor={liveMatch.homeTeamColor}
                      size="lg"
                    />
                    <span className="font-display text-lg font-bold uppercase tracking-wide text-white leading-tight">
                      {liveMatch.homeTeamName}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1.5">
                    <div className="font-display text-4xl font-extrabold tabular-nums tracking-tight text-white">
                      {liveMatch.homeScore} : {liveMatch.awayScore}
                    </div>
                    <span className="text-xs font-mono text-zinc-400 tabular-nums">
                      {liveMatch.halfLabel} · {liveMatch.matchMinute}&apos;
                    </span>
                  </div>

                  <div className="flex flex-col items-center text-center gap-2.5">
                    <TeamCrest
                      name={liveMatch.awayTeamName}
                      shortName={liveMatch.awayTeamShort}
                      logoUrl={liveMatch.awayTeamLogo}
                      primaryColor={liveMatch.awayTeamColor}
                      size="lg"
                    />
                    <span className="font-display text-lg font-bold uppercase tracking-wide text-white leading-tight">
                      {liveMatch.awayTeamName}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-4">
                  <div className="text-xs text-zinc-400 truncate">{liveMatch.stadiumName}</div>
                  {liveMatch.streamActive && isDiscordStreamUrl(liveMatch.streamUrl) ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => onNavigate('live')}
                        className="text-xs font-medium text-zinc-300 hover:text-white cursor-pointer whitespace-nowrap"
                      >
                        Scoreboard
                      </button>
                      <a
                        href={normalizeStreamHref(liveMatch.streamUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8EA1FF] hover:underline whitespace-nowrap"
                      >
                        <span>Watch Live</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate('live')}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white hover:underline cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Watch Live</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Game Introduction & Core Numbers */}
      <section className="border-b border-white/10 bg-[#080A0F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-widest">
              {site.seasonLabel}
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight text-white">
              {site.gameIntroTitle}
            </h2>
            <p className="text-zinc-300 text-base leading-relaxed max-w-2xl">
              {site.gameIntroBody}
            </p>
          </div>

          <div className="lg:col-span-5 grid grid-cols-3 gap-4 border-t lg:border-t-0 lg:border-l border-white/10 pt-6 lg:pt-0 lg:pl-8">
            <div>
              <div className="font-display text-3xl sm:text-4xl font-extrabold text-white tabular-nums">
                {competitions.length}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Active Competitions</div>
            </div>
            <div>
              <div className="font-display text-3xl sm:text-4xl font-extrabold text-white tabular-nums">
                {nominees.length}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Ballon d&apos;Or Nominees</div>
            </div>
            <div>
              <div className="font-display text-3xl sm:text-4xl font-extrabold text-white tabular-nums">
                {state.teams.length}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Registered Clubs</div>
            </div>
          </div>
        </div>
      </section>

      {/* Latest News & Announcements */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-b border-white/10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">
              Official Press Desk
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight text-white">
              Latest News &amp; Announcements
            </h2>
          </div>
          <div className="text-xs text-zinc-400">
            Updated {new Date(site.lastPublishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {featuredNews && (
            <article className="lg:col-span-6 rounded-xl bg-[#0D1017] border border-white/10 p-6 sm:p-8 flex flex-col justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="font-semibold text-white">{featuredNews.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{featuredNews.publishedAt}</span>
                </div>
                {featuredNews.imageUrl && (
                  <img
                    src={featuredNews.imageUrl}
                    alt={featuredNews.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-52 object-cover rounded-lg border border-white/10"
                  />
                )}
                <h3 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight">
                  {featuredNews.title}
                </h3>
                <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
                  {featuredNews.summary}
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedArticle(featuredNews)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:underline cursor-pointer"
                >
                  <span>Read Full Briefing</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </article>
          )}

          <div className="lg:col-span-6 divide-y divide-white/10 rounded-xl bg-[#0D1017] border border-white/10">
            {secondaryNews.map((item) => (
              <article key={item.id} className="p-5 sm:p-6 flex flex-col justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-200">{item.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.publishedAt}</span>
                </div>
                <h3 className="font-display text-xl font-bold text-white">{item.title}</h3>
                <p className="text-sm text-zinc-400 line-clamp-2">{item.summary}</p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedArticle(item)}
                    className="text-xs font-semibold text-white hover:underline cursor-pointer"
                  >
                    Read Article
                  </button>
                </div>
              </article>
            ))}
            {secondaryNews.length === 0 && (
              <div className="p-8 text-sm text-zinc-400">More FTD press releases coming soon.</div>
            )}
          </div>
        </div>
      </section>

      {/* Ballon d'Or Preview & Active Competitions */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-b border-white/10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Ballon d'Or Spotlight */}
          <div className="lg:col-span-5 rounded-xl bg-gradient-to-b from-[#151107] to-[#0A0B0E] border border-amber-400/30 p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold tracking-widest text-amber-300 uppercase">
                  {ballonDorState.ceremonyDate}
                </div>
                <h2 className="font-display text-3xl font-extrabold uppercase text-white">
                  {ballonDorState.ceremonyTitle}
                </h2>
                <p className="text-sm text-zinc-300">
                  Current Top 3 contenders competing for football&apos;s highest individual honour in FTD.
                </p>
              </div>
              <BallonDorTrophy className="w-20 h-28 shrink-0" />
            </div>

            <div className="divide-y divide-amber-400/15">
              {topThree.map((player, index) => (
                <div key={player.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-display text-xl font-extrabold text-amber-400 w-5 tabular-nums">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {player.name}
                      </div>
                      <div className="text-xs text-zinc-400 truncate">
                        {player.club} · {player.position}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-bold text-amber-300 tabular-nums">
                      {player.goals}G / {player.assists}A
                    </div>
                    <div className="text-[11px] text-zinc-400 tabular-nums">
                      {player.rating.toFixed(1)} RTG
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('ballon-dor')}
              className="w-full py-3 rounded-lg bg-amber-400 text-black font-semibold text-sm hover:bg-amber-300 transition-colors cursor-pointer"
            >
              Go to Ballon d&apos;Or Ceremony
            </button>
          </div>

          {/* Active Competitions + Upcoming Matches */}
          <div className="lg:col-span-7 space-y-8">
            <div>
              <div className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">
                Tournament Structure
              </div>
              <h2 className="font-display text-3xl font-bold uppercase text-white mb-5">
                Current Competitions
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {competitions.map((comp) => (
                  <div
                    key={comp.id}
                    className="rounded-xl bg-[#0D1017] border border-white/10 p-5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                      <span>{comp.season}</span>
                      <span className="text-white font-semibold">{comp.status}</span>
                    </div>
                    <h3 className="font-display text-2xl font-bold text-white uppercase">
                      {comp.name}
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">{comp.description}</p>
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-zinc-300">
                      <span>{comp.format}</span>
                      <span className="font-mono tabular-nums">{comp.teamsCount} Teams</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <h3 className="font-display text-2xl font-bold uppercase text-white">
                  Upcoming Matches &amp; Events
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigate('live')}
                  className="text-xs font-semibold text-white hover:underline cursor-pointer"
                >
                  Open Live Broadcasts
                </button>
              </div>
              <div className="divide-y divide-white/10 rounded-xl bg-[#0D1017] border border-white/10">
                {upcomingEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs text-zinc-400">
                        {ev.competition} · {ev.venue}
                      </div>
                      <div className="font-display text-xl font-bold text-white mt-0.5">
                        {ev.homeTeam} vs {ev.awayTeam}
                      </div>
                      <div className="text-xs text-zinc-400">{ev.title}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-200 shrink-0">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{ev.kickoffTime}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Article Reader Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-2xl rounded-xl bg-[#0D1017] border border-white/15 p-6 sm:p-8 max-h-[85vh] overflow-y-auto space-y-4">
            <button
              type="button"
              onClick={() => setSelectedArticle(null)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white cursor-pointer"
              aria-label="Close article"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-xs text-zinc-400">
              {selectedArticle.category} · {selectedArticle.publishedAt}
            </div>
            <h2 className="font-display text-3xl font-bold text-white uppercase">
              {selectedArticle.title}
            </h2>
            {selectedArticle.imageUrl && (
              <img
                src={selectedArticle.imageUrl}
                alt={selectedArticle.title}
                referrerPolicy="no-referrer"
                className="w-full h-64 object-cover rounded-lg border border-white/10"
              />
            )}
            <p className="text-sm sm:text-base text-zinc-200 leading-relaxed whitespace-pre-line">
              {selectedArticle.body}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
