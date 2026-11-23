import { useEffect, useState } from 'react';
import { Award, CheckCircle2, Crown, Trophy, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePlatform } from '../context/PlatformContext';
import { BallonDorTrophy } from '../components/BallonDorTrophy';
import { PlayerAvatar } from '../components/PlayerAvatar';

export function BallonDorPage() {
  const { state, apiRequest, soundEnabled, toggleSound } = usePlatform();
  const [votingId, setVotingId] = useState<number | null>(null);
  const [voteFeedback, setVoteFeedback] = useState<string | null>(null);
  const [voterToken] = useState(() => Math.random().toString(36).slice(2, 12));
  const [countdownNum, setCountdownNum] = useState(3);

  const phase = state?.ballonDorState.ceremonyPhase || 'idle';

  useEffect(() => {
    if (phase !== 'countdown') {
      setCountdownNum(3);
      return;
    }
    const t1 = window.setTimeout(() => setCountdownNum(2), 900);
    const t2 = window.setTimeout(() => setCountdownNum(1), 1800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [phase]);

  if (!state) return null;

  const { nominees, ballonDorState, ballonDorHistory } = state;

  const sortedNominees = [...nominees].sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
    if (a.rankOrder !== b.rankOrder) return a.rankOrder - b.rankOrder;
    return b.votes - a.votes;
  });

  const winner =
    sortedNominees.find((n) => n.id === ballonDorState.winnerId) ||
    sortedNominees.find((n) => n.isWinner) ||
    null;

  const topThree = sortedNominees.slice(0, 3);

  const handleVote = async (nomineeId: number) => {
    setVoteFeedback(null);
    setVotingId(nomineeId);
    const res = await apiRequest('/api/public/vote', {
      method: 'POST',
      body: JSON.stringify({ nomineeId, voterId: voterToken }),
    });
    setVotingId(null);
    if (!res.ok) {
      setVoteFeedback(res.error || 'Could not record vote.');
    } else {
      setVoteFeedback('Your Ballon d\'Or ballot has been recorded.');
    }
  };

  return (
    <div className="min-h-screen bg-[#050608] text-white">
      {/* Prestigious Black & Gold Ceremony Hero */}
      <section className="relative overflow-hidden border-b border-amber-400/20 bg-gradient-to-b from-[#161105] via-[#090807] to-[#050608]">
        <div
          className="absolute inset-0 pointer-events-none opacity-45"
          style={{
            backgroundImage:
              'radial-gradient(circle at 75% 30%, rgba(234,179,8,0.22), transparent 55%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.06), transparent 45%)',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 space-y-5">
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-amber-300 uppercase tracking-widest">
                <span>Official FTD Awards Gala</span>
                <span aria-hidden="true">·</span>
                <span>{ballonDorState.ceremonyDate}</span>
                <span aria-hidden="true">·</span>
                <span>{ballonDorState.votingEnabled ? 'Fan Voting Open' : 'Official Jury Locked'}</span>
              </div>

              <h1 className="font-display text-5xl sm:text-7xl font-extrabold uppercase tracking-tight leading-[0.95] text-white">
                {ballonDorState.ceremonyTitle}
              </h1>

              <p className="text-base sm:text-lg text-zinc-300 max-w-2xl leading-relaxed">
                Celebrating the defining footballer of the {ballonDorState.seasonYear} FTD campaign.
                Rankings combine goal contributions, major silverware, match ratings, and verified supporter ballots.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={toggleSound}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4" />}
                  <span>{soundEnabled ? 'Ceremony Audio On' : 'Enable Ceremony Audio'}</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col items-center justify-center">
              <BallonDorTrophy className="w-52 h-68 sm:w-60 sm:h-76" />
            </div>
          </div>
        </div>
      </section>

      {/* Animated Winner Reveal / Highlighted Winner Stage */}
      <AnimatePresence mode="wait">
        {ballonDorState.ceremonyPhase === 'countdown' && (
          <motion.section
            key="countdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="border-b border-amber-400/30 bg-[#0D0A04] py-16 text-center px-4"
          >
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="text-xs font-mono tracking-[0.35em] text-amber-300 uppercase">
                Live Envelope Ceremony
              </div>
              <h2 className="font-display text-4xl sm:text-5xl font-extrabold uppercase text-white">
                Preparing Winner Announcement...
              </h2>
              <div className="font-display text-8xl font-extrabold text-amber-400 tabular-nums">
                {countdownNum}
              </div>
            </div>
          </motion.section>
        )}

        {(ballonDorState.ceremonyPhase === 'revealed' || winner) &&
          ballonDorState.ceremonyPhase !== 'countdown' &&
          winner && (
            <motion.section
              key={`winner-${winner.id}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="border-b border-amber-400/35 bg-gradient-to-r from-[#1A1305] via-[#0F0C06] to-[#1A1305]"
            >
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="rounded-2xl border border-amber-400/50 bg-[#0A0907]/90 p-6 sm:p-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-center shadow-[0_24px_80px_rgba(234,179,8,0.16)]">
                  <div className="md:col-span-4 rounded-xl overflow-hidden border border-amber-400/35">
                    <PlayerAvatar
                      name={winner.name}
                      kitNumber={winner.kitNumber}
                      imageUrl={winner.imageUrl}
                      accent="gold"
                      className="w-full h-72"
                    />
                  </div>
                  <div className="md:col-span-8 space-y-5">
                    <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-amber-300">
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span>{ballonDorState.seasonYear} FTD Ballon d&apos;Or Laureate</span>
                    </div>

                    <div>
                      <h2 className="font-display text-4xl sm:text-6xl font-extrabold uppercase tracking-tight text-white">
                        {winner.name}
                      </h2>
                      <p className="text-base sm:text-lg text-amber-200/90 font-medium mt-1">
                        {winner.club} · {winner.position} · {winner.nationality}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-amber-400/20">
                      <div>
                        <div className="font-display text-3xl font-extrabold text-amber-400 tabular-nums">
                          {winner.goals}
                        </div>
                        <div className="text-xs text-zinc-400">Goals</div>
                      </div>
                      <div>
                        <div className="font-display text-3xl font-extrabold text-amber-400 tabular-nums">
                          {winner.assists}
                        </div>
                        <div className="text-xs text-zinc-400">Assists</div>
                      </div>
                      <div>
                        <div className="font-display text-3xl font-extrabold text-amber-400 tabular-nums">
                          {winner.trophies}
                        </div>
                        <div className="text-xs text-zinc-400">Trophies</div>
                      </div>
                      <div>
                        <div className="font-display text-3xl font-extrabold text-amber-400 tabular-nums">
                          {winner.rating.toFixed(1)}
                        </div>
                        <div className="text-xs text-zinc-400">Season Rating</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          )}
      </AnimatePresence>

      {/* Current Top 3 Podium */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 border-b border-white/10">
        <div className="mb-8">
          <div className="text-xs font-medium text-amber-300 uppercase tracking-widest mb-1">
            Official Podium
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase text-white">
            Top 3 Contenders
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {topThree.map((player, idx) => {
            const isFirst = idx === 0;
            return (
              <div
                key={player.id}
                className={`rounded-xl overflow-hidden border p-6 flex flex-col justify-between gap-5 ${
                  isFirst
                    ? 'bg-gradient-to-b from-[#1B1506] to-[#0B0C10] border-amber-400/55'
                    : 'bg-[#0D1017] border-white/15'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-display text-4xl font-extrabold tabular-nums ${
                      isFirst ? 'text-amber-400' : idx === 1 ? 'text-zinc-200' : 'text-amber-600'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <span className="text-xs font-mono text-zinc-400 tabular-nums">
                    {player.votes.toLocaleString()} Votes
                  </span>
                </div>

                <div className="rounded-lg overflow-hidden border border-white/10">
                  <PlayerAvatar
                    name={player.name}
                    kitNumber={player.kitNumber}
                    imageUrl={player.imageUrl}
                    accent={isFirst ? 'gold' : 'white'}
                    className="w-full h-48"
                  />
                </div>

                <div>
                  <h3 className="font-display text-2xl font-bold uppercase text-white">
                    {player.name}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {player.club} · {player.position} · {player.nationality}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-center">
                  <div>
                    <div className="font-display text-xl font-bold text-white tabular-nums">
                      {player.goals}
                    </div>
                    <div className="text-[11px] text-zinc-400">Goals</div>
                  </div>
                  <div>
                    <div className="font-display text-xl font-bold text-white tabular-nums">
                      {player.assists}
                    </div>
                    <div className="text-[11px] text-zinc-400">Assists</div>
                  </div>
                  <div>
                    <div className="font-display text-xl font-bold text-amber-300 tabular-nums">
                      {player.rating.toFixed(1)}
                    </div>
                    <div className="text-[11px] text-zinc-400">Rating</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* All Nominated Player Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 border-b border-white/10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">
              Official Shortlist
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase text-white">
              All Nominated Players
            </h2>
          </div>
          {voteFeedback && (
            <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-300">
              <CheckCircle2 className="w-4 h-4" />
              <span>{voteFeedback}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedNominees.map((player, index) => (
            <div
              key={player.id}
              className={`rounded-xl overflow-hidden border transition-colors ${
                player.isWinner
                  ? 'bg-[#141006] border-amber-400/60'
                  : 'bg-[#0D1017] border-white/10 hover:border-white/25'
              }`}
            >
              <div className="relative">
                <PlayerAvatar
                  name={player.name}
                  kitNumber={player.kitNumber}
                  imageUrl={player.imageUrl}
                  accent={player.isWinner ? 'gold' : 'white'}
                  className="w-full h-56"
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-black/80 border border-white/15 font-mono text-xs font-bold text-white tabular-nums">
                  Rank #{index + 1}
                </div>
                {player.isWinner && (
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded bg-amber-400 text-black text-xs font-bold uppercase tracking-wider">
                    Winner
                  </div>
                )}
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <h3 className="font-display text-2xl font-bold uppercase text-white">
                    {player.name}
                  </h3>
                  <div className="text-xs text-zinc-400">
                    {player.club} · {player.position} · #{player.kitNumber} · {player.nationality}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 py-3 border-y border-white/10 text-center">
                  <div>
                    <div className="font-mono text-sm font-bold text-white tabular-nums">
                      {player.goals}
                    </div>
                    <div className="text-[11px] text-zinc-400">Goals</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm font-bold text-white tabular-nums">
                      {player.assists}
                    </div>
                    <div className="text-[11px] text-zinc-400">Assists</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm font-bold text-white tabular-nums">
                      {player.trophies}
                    </div>
                    <div className="text-[11px] text-zinc-400">Trophies</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm font-bold text-amber-300 tabular-nums">
                      {player.rating.toFixed(1)}
                    </div>
                    <div className="text-[11px] text-zinc-400">Rating</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-mono text-zinc-300 tabular-nums">
                    {player.votes.toLocaleString()} Ballots
                  </div>
                  {ballonDorState.votingEnabled && (
                    <button
                      type="button"
                      disabled={votingId === player.id}
                      onClick={() => handleVote(player.id)}
                      className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {votingId === player.id ? 'Voting...' : 'Vote Player'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Official Rankings Table & Past Winners History */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-5">
          <div>
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">
              Season Standings
            </div>
            <h2 className="font-display text-3xl font-bold uppercase text-white">
              Official Player Rankings
            </h2>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0D1017]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs text-zinc-400">
                  <th className="py-3 px-4 font-medium">Pos</th>
                  <th className="py-3 px-4 font-medium">Player</th>
                  <th className="py-3 px-4 font-medium">Club</th>
                  <th className="py-3 px-4 font-medium text-right">G / A</th>
                  <th className="py-3 px-4 font-medium text-right">Rating</th>
                  <th className="py-3 px-4 font-medium text-right">Votes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-sm">
                {sortedNominees.map((player, index) => (
                  <tr key={player.id} className="hover:bg-white/[0.03]">
                    <td className="py-3 px-4 font-mono font-bold text-amber-300 tabular-nums">
                      {index + 1}
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {player.name}
                      {player.isWinner && (
                        <Trophy className="inline w-3.5 h-3.5 text-amber-400 ml-2" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-zinc-400">{player.club}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-200">
                      {player.goals} / {player.assists}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-300">
                      {player.rating.toFixed(1)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-white">
                      {player.votes.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-5">
          <div>
            <div className="text-xs font-medium text-amber-300 uppercase tracking-widest mb-1">
              Hall of Laureates
            </div>
            <h2 className="font-display text-3xl font-bold uppercase text-white">
              Past Ballon d&apos;Or Winners
            </h2>
          </div>

          <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0D1017]">
            {ballonDorHistory.map((item) => (
              <div key={item.id} className="p-5 flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-amber-400/15 border border-amber-400/35 flex items-center justify-center shrink-0">
                  <Award className="w-6 h-6 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-mono text-amber-300">{item.year} Winner</div>
                  <div className="font-display text-2xl font-bold text-white uppercase">
                    {item.winnerName}
                  </div>
                  <div className="text-xs font-medium text-zinc-300">{item.club}</div>
                  <div className="text-xs text-zinc-400 mt-1">{item.statsSummary}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
