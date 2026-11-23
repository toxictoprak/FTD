import { motion, AnimatePresence } from 'motion/react';
import type { LiveMatchState, ScoreboardEdition } from '../types/ftd';
import type { GoalAlertPayload } from '../context/PlatformContext';
import { TeamCrest } from './TeamCrest';

interface BroadcastScoreboardProps {
  match: LiveMatchState;
  goalAlert: GoalAlertPayload | null;
  onDismissGoal?: () => void;
}

const editionThemes: Record<
  ScoreboardEdition,
  {
    label: string;
    wrapperClass: string;
    topBarClass: string;
    scoreBoxClass: string;
    clockBoxClass: string;
    accentLineClass: string;
  }
> = {
  'champions-league': {
    label: 'Champions League Edition',
    wrapperClass:
      'bg-gradient-to-r from-[#040B24] via-[#091A4F] to-[#040B24] border border-[#38BDF8]/35 shadow-[0_18px_50px_rgba(29,78,216,0.3)]',
    topBarClass: 'bg-[#03081C]/90 text-[#7DD3FC] border-b border-[#38BDF8]/25',
    scoreBoxClass: 'bg-white text-[#040B24]',
    clockBoxClass: 'bg-[#1D4ED8] text-white border border-[#38BDF8]/40',
    accentLineClass: 'bg-gradient-to-r from-transparent via-[#38BDF8] to-transparent',
  },
  'premier-league': {
    label: 'Premier League Edition',
    wrapperClass:
      'bg-gradient-to-r from-[#240030] via-[#37003C] to-[#240030] border border-[#FF2882]/45 shadow-[0_18px_50px_rgba(255,40,130,0.22)]',
    topBarClass: 'bg-[#190021]/95 text-[#00FF85] border-b border-[#FF2882]/30',
    scoreBoxClass: 'bg-white text-[#37003C]',
    clockBoxClass: 'bg-[#FF2882] text-white',
    accentLineClass: 'bg-gradient-to-r from-[#00FF85] via-[#FF2882] to-[#04F5FF]',
  },
  bundesliga: {
    label: 'Bundesliga Edition',
    wrapperClass:
      'bg-gradient-to-r from-[#111111] via-[#1C1C1C] to-[#111111] border border-[#D20515]/55 shadow-[0_18px_50px_rgba(210,5,21,0.25)]',
    topBarClass: 'bg-[#D20515] text-white border-b border-white/15',
    scoreBoxClass: 'bg-white text-[#111111]',
    clockBoxClass: 'bg-[#D20515] text-white',
    accentLineClass: 'bg-gradient-to-r from-[#D20515] via-white to-[#D20515]',
  },
  'world-cup': {
    label: 'World Cup Edition',
    wrapperClass:
      'bg-gradient-to-r from-[#061A14] via-[#0B2B21] to-[#061A14] border border-[#D4AF37]/50 shadow-[0_18px_50px_rgba(212,175,55,0.22)]',
    topBarClass: 'bg-[#04110D]/95 text-[#FDE047] border-b border-[#D4AF37]/30',
    scoreBoxClass: 'bg-[#F8FAFC] text-[#061A14]',
    clockBoxClass: 'bg-[#B48A1E] text-white border border-[#FDE047]/40',
    accentLineClass: 'bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent',
  },
};

function formatStatusLabel(status: LiveMatchState['status']): string {
  switch (status) {
    case 'LIVE':
      return 'LIVE';
    case 'HALFTIME':
      return 'HALF-TIME';
    case 'PAUSED':
      return 'PAUSED';
    case 'ENDED':
      return 'FULL-TIME';
    default:
      return 'PRE-MATCH';
  }
}

export function BroadcastScoreboard({
  match,
  goalAlert,
  onDismissGoal,
}: BroadcastScoreboardProps) {
  const theme = editionThemes[match.scoreboardEdition] || editionThemes['champions-league'];
  const minuteStr = String(match.matchMinute).padStart(2, '0');
  const secondStr = String(match.matchSecond).padStart(2, '0');

  return (
    <div className="relative">
      {/* Main Broadcast Scorebug */}
      <div className={`relative rounded-xl overflow-hidden transition-colors duration-300 ${theme.wrapperClass}`}>
        <div className={`h-0.5 w-full ${theme.accentLineClass}`} />

        {/* Top Broadcast Info Strip */}
        <div
          className={`px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-medium ${theme.topBarClass}`}
        >
          <div className="flex items-center gap-2.5">
            {match.status === 'LIVE' && (
              <span className="inline-flex items-center gap-1.5 font-bold tracking-wider uppercase text-white bg-red-600 px-2 py-0.5 rounded-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
            )}
            {match.status !== 'LIVE' && (
              <span className="font-bold tracking-wider uppercase">{formatStatusLabel(match.status)}</span>
            )}
            <span aria-hidden="true">·</span>
            <span className="truncate max-w-[240px] sm:max-w-none">{match.competitionName}</span>
          </div>

          <div className="flex items-center gap-2.5 text-white/80">
            <span className="hidden sm:inline">{match.stadiumName}</span>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <span className="uppercase tracking-wider text-[11px] font-semibold">{theme.label}</span>
          </div>
        </div>

        {/* Core Teams + Score + Clock Row */}
        <div className="px-4 sm:px-8 py-5 sm:py-6 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-5">
          {/* Home Team */}
          <div className="flex items-center justify-between lg:justify-end gap-4">
            <div className="text-left lg:text-right min-w-0">
              <div className="font-display text-2xl sm:text-3xl font-extrabold tracking-wide text-white uppercase truncate">
                {match.homeTeamName}
              </div>
              <div className="text-xs font-mono tracking-widest text-zinc-300 uppercase">
                {match.homeTeamShort} · HOME
              </div>
            </div>
            <TeamCrest
              name={match.homeTeamName}
              shortName={match.homeTeamShort}
              logoUrl={match.homeTeamLogo}
              primaryColor={match.homeTeamColor}
              size="lg"
            />
          </div>

          {/* Center Score + Match Clock */}
          <div className="flex flex-col items-center justify-center gap-2.5">
            <div className="flex items-center rounded-lg overflow-hidden shadow-lg border border-white/20">
              <div
                className={`px-5 sm:px-7 py-2.5 font-display text-4xl sm:text-5xl font-extrabold tabular-nums tracking-tight ${theme.scoreBoxClass}`}
              >
                {match.homeScore}
              </div>
              <div className="px-3 py-2.5 bg-black/85 text-zinc-400 font-display text-2xl font-bold select-none">
                -
              </div>
              <div
                className={`px-5 sm:px-7 py-2.5 font-display text-4xl sm:text-5xl font-extrabold tabular-nums tracking-tight ${theme.scoreBoxClass}`}
              >
                {match.awayScore}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-md font-mono text-xs sm:text-sm font-bold tabular-nums tracking-wider ${theme.clockBoxClass}`}
              >
                {minuteStr}:{secondStr} ({match.matchMinute}&apos;)
              </span>
              <span className="px-2.5 py-1 rounded-md bg-black/55 border border-white/15 text-xs font-semibold tracking-wider text-white uppercase">
                {match.halfLabel}
              </span>
            </div>
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-between lg:justify-start gap-4">
            <TeamCrest
              name={match.awayTeamName}
              shortName={match.awayTeamShort}
              logoUrl={match.awayTeamLogo}
              primaryColor={match.awayTeamColor}
              size="lg"
            />
            <div className="text-right lg:text-left min-w-0">
              <div className="font-display text-2xl sm:text-3xl font-extrabold tracking-wide text-white uppercase truncate">
                {match.awayTeamName}
              </div>
              <div className="text-xs font-mono tracking-widest text-zinc-300 uppercase">
                AWAY · {match.awayTeamShort}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dramatic GOOOOOAL! Broadcast Overlay */}
      <AnimatePresence>
        {goalAlert && (
          <motion.div
            key={goalAlert.goalId}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.03 }}
            transition={{ duration: 0.25 }}
            onClick={onDismissGoal}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 cursor-pointer"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="relative max-w-2xl w-full rounded-2xl overflow-hidden border border-white/25 bg-[#080B12] shadow-[0_30px_100px_rgba(255,255,255,0.2)] text-center p-8 sm:p-12"
            >
              <div
                className="absolute inset-0 opacity-25 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at 50% 30%, ${
                    goalAlert.side === 'home' ? match.homeTeamColor : match.awayTeamColor
                  }, transparent 70%)`,
                }}
              />
              <div className="relative z-10 flex flex-col items-center gap-4">
                <div className="text-xs font-mono tracking-[0.3em] text-zinc-300 uppercase">
                  {match.competitionName} · {goalAlert.minute}&apos;
                </div>
                <div className="font-display text-6xl sm:text-8xl font-extrabold tracking-tight text-white uppercase italic drop-shadow-[0_6px_28px_rgba(255,255,255,0.35)]">
                  GOOOOOAL!
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <TeamCrest
                    name={goalAlert.teamName}
                    shortName={goalAlert.side === 'home' ? match.homeTeamShort : match.awayTeamShort}
                    logoUrl={goalAlert.side === 'home' ? match.homeTeamLogo : match.awayTeamLogo}
                    primaryColor={goalAlert.side === 'home' ? match.homeTeamColor : match.awayTeamColor}
                    size="xl"
                  />
                  <div className="text-left">
                    <div className="font-display text-3xl sm:text-4xl font-bold text-white uppercase">
                      {goalAlert.teamName}
                    </div>
                    {goalAlert.scorer && (
                      <div className="text-base sm:text-lg font-medium text-amber-300">
                        Scored by {goalAlert.scorer}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 px-6 py-2 rounded-lg bg-white text-black font-display text-3xl font-extrabold tabular-nums">
                  {match.homeTeamShort} {goalAlert.homeScore} — {goalAlert.awayScore} {match.awayTeamShort}
                </div>
                <div className="text-xs text-zinc-400 mt-1">Click anywhere to dismiss</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
