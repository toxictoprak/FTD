import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, Radio, Send, Tv, Users, Volume2, VolumeX } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { BroadcastScoreboard } from '../components/BroadcastScoreboard';
import { TeamCrest } from '../components/TeamCrest';
import { resolveStreamSource } from '../utils/stream';

export function LivePage() {
  const {
    state,
    wsConnected,
    soundEnabled,
    toggleSound,
    activeGoalAlert,
    dismissGoalAlert,
    apiRequest,
  } = usePlatform();

  const [senderName, setSenderName] = useState('Supporter');
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const streamSource = useMemo(
    () => resolveStreamSource(state?.liveMatch.streamUrl || ''),
    [state?.liveMatch.streamUrl]
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state?.chatMessages.length]);

  if (!state) return null;

  const { liveMatch, matchEvents, chatMessages, site } = state;

  const handleSendChat = async (e: FormEvent) => {
    e.preventDefault();
    setChatError(null);
    if (!chatInput.trim()) return;
    setSendingChat(true);
    const res = await apiRequest('/api/public/chat', {
      method: 'POST',
      body: JSON.stringify({
        sender: senderName.trim() || 'Supporter',
        message: chatInput.trim(),
      }),
    });
    setSendingChat(false);
    if (!res.ok) {
      setChatError(res.error || 'Could not send message.');
      return;
    }
    setChatInput('');
  };

  return (
    <div className="min-h-screen bg-[#050608] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Top Broadcast Utility Row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 text-xs text-zinc-400">
              <span className="font-semibold text-white uppercase tracking-wider">FTD Live Broadcast</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}
                />
                {wsConnected ? 'Real-Time Sync Connected' : 'Reconnecting'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Users className="w-3.5 h-3.5" />
                {liveMatch.viewerCount} Watching
              </span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-white">
              {liveMatch.streamTitle}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {liveMatch.streamActive && streamSource.kind === 'discord' && (
              <a
                href={streamSource.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-xs font-bold text-white transition-colors whitespace-nowrap shrink-0"
              >
                <span>Watch Live on Discord</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={toggleSound}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0D1017] hover:bg-white/10 border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-zinc-400" />
              )}
              <span>{soundEnabled ? 'Goal Audio Enabled' : 'Enable Goal Audio'}</span>
            </button>
          </div>
        </div>

        {/* Live Broadcast Scoreboard (4 Editions) */}
        <BroadcastScoreboard
          match={liveMatch}
          goalAlert={activeGoalAlert}
          onDismissGoal={dismissGoalAlert}
        />

        {/* Central Video Player + Live Chat Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Center Video Stream Player */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-[#090B10] border border-white/15 shadow-2xl">
              {liveMatch.streamActive ? (
                streamSource.kind === 'iframe' ? (
                  <iframe
                    src={streamSource.src}
                    title={liveMatch.streamTitle}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                ) : streamSource.kind === 'video' ? (
                  <video
                    src={streamSource.src}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                ) : streamSource.kind === 'discord' ? (
                  /* Discord Stream Broadcast Stage */
                  <div className="relative w-full h-full flex flex-col justify-between p-6 sm:p-10 bg-gradient-to-br from-[#121528] via-[#0B0E18] to-[#06070B]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#5865F2] text-white text-xs font-bold uppercase tracking-wider">
                        <Radio className="w-3.5 h-3.5 animate-pulse" />
                        <span>Live on Discord</span>
                      </div>
                      <span className="text-xs font-mono text-zinc-300">
                        {liveMatch.competitionName}
                      </span>
                    </div>

                    <div className="my-auto flex flex-col items-center text-center gap-5">
                      <div className="flex items-center gap-5 sm:gap-8">
                        <TeamCrest
                          name={liveMatch.homeTeamName}
                          shortName={liveMatch.homeTeamShort}
                          logoUrl={liveMatch.homeTeamLogo}
                          primaryColor={liveMatch.homeTeamColor}
                          size="lg"
                        />
                        <div className="font-display text-4xl sm:text-5xl font-extrabold tabular-nums text-white">
                          {liveMatch.homeScore} : {liveMatch.awayScore}
                        </div>
                        <TeamCrest
                          name={liveMatch.awayTeamName}
                          shortName={liveMatch.awayTeamShort}
                          logoUrl={liveMatch.awayTeamLogo}
                          primaryColor={liveMatch.awayTeamColor}
                          size="lg"
                        />
                      </div>

                      <div className="space-y-1.5 max-w-md">
                        <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase text-white">
                          {liveMatch.homeTeamName} vs {liveMatch.awayTeamName}
                        </h2>
                        <p className="text-xs sm:text-sm text-zinc-300">
                          This match is streaming live in the official FTD Discord channel. Keep this scoreboard open for instant goals and match clock updates.
                        </p>
                      </div>

                      <a
                        href={streamSource.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold text-sm shadow-lg transition-colors"
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                        </svg>
                        <span>Watch Live on Discord</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span>{liveMatch.stadiumName}</span>
                      <span>{liveMatch.halfLabel} · {liveMatch.matchMinute}&apos;</span>
                    </div>
                  </div>
                ) : (
                  /* FTD Official Tactical Broadcast Feed when stream is active without external URL */
                  <div className="relative w-full h-full flex flex-col justify-between p-6 sm:p-8 bg-gradient-to-b from-[#0C141D] via-[#07110D] to-[#05080B]">
                    <svg
                      viewBox="0 0 800 450"
                      className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
                      aria-hidden="true"
                    >
                      <rect x="40" y="30" width="720" height="390" fill="none" stroke="#FFFFFF" strokeWidth="2" />
                      <line x1="400" y1="30" x2="400" y2="420" stroke="#FFFFFF" strokeWidth="2" />
                      <circle cx="400" cy="225" r="70" fill="none" stroke="#FFFFFF" strokeWidth="2" />
                      <rect x="40" y="125" width="95" height="200" fill="none" stroke="#FFFFFF" strokeWidth="2" />
                      <rect x="665" y="125" width="95" height="200" fill="none" stroke="#FFFFFF" strokeWidth="2" />
                    </svg>

                    <div className="relative z-10 flex items-center justify-between">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-red-600 text-white text-xs font-bold uppercase tracking-wider">
                        <Radio className="w-3.5 h-3.5 animate-pulse" />
                        <span>On Air · FTD Broadcast Feed</span>
                      </div>
                      <span className="text-xs font-mono text-zinc-300">
                        {liveMatch.competitionName}
                      </span>
                    </div>

                    <div className="relative z-10 flex items-center justify-center gap-6 sm:gap-12 my-auto">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <TeamCrest
                          name={liveMatch.homeTeamName}
                          shortName={liveMatch.homeTeamShort}
                          logoUrl={liveMatch.homeTeamLogo}
                          primaryColor={liveMatch.homeTeamColor}
                          size="xl"
                        />
                        <span className="font-display text-xl sm:text-2xl font-bold uppercase">
                          {liveMatch.homeTeamName}
                        </span>
                      </div>

                      <div className="text-center">
                        <div className="font-display text-5xl sm:text-7xl font-extrabold tabular-nums">
                          {liveMatch.homeScore} : {liveMatch.awayScore}
                        </div>
                        <div className="text-xs font-mono text-emerald-300 mt-1">
                          {liveMatch.halfLabel} · {liveMatch.matchMinute}&apos;
                        </div>
                      </div>

                      <div className="flex flex-col items-center gap-2 text-center">
                        <TeamCrest
                          name={liveMatch.awayTeamName}
                          shortName={liveMatch.awayTeamShort}
                          logoUrl={liveMatch.awayTeamLogo}
                          primaryColor={liveMatch.awayTeamColor}
                          size="xl"
                        />
                        <span className="font-display text-xl sm:text-2xl font-bold uppercase">
                          {liveMatch.awayTeamName}
                        </span>
                      </div>
                    </div>

                    <div className="relative z-10 flex items-center justify-between text-xs text-zinc-400">
                      <span>{liveMatch.stadiumName}</span>
                      <span>Configure external YouTube / Twitch / MP4 URL in Admin Panel</span>
                    </div>
                  </div>
                )
              ) : (
                /* Broadcast Offline Standby View */
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 bg-gradient-to-b from-[#0E121A] to-[#06080C] space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <Tv className="w-8 h-8 text-zinc-400" />
                  </div>
                  <div className="space-y-1.5 max-w-md">
                    <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                      Broadcast Standby
                    </div>
                    <h2 className="font-display text-3xl font-bold text-white uppercase">
                      Livestream Currently Offline
                    </h2>
                    <p className="text-sm text-zinc-400">
                      The scoreboard and match updates remain synced in real time. Once an FTD Admin starts the broadcast, the live stream will appear here automatically.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Match Information & Live Event Timeline */}
            <div className="rounded-xl bg-[#0D1017] border border-white/10 p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <h2 className="font-display text-2xl font-bold uppercase text-white">
                    Match Timeline &amp; Events
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {liveMatch.competitionName} · {liveMatch.stadiumName}
                  </p>
                </div>
                <span className="text-xs font-mono text-zinc-300 uppercase">
                  Status: {liveMatch.status.replace('_', ' ')}
                </span>
              </div>

              {matchEvents.length === 0 ? (
                <div className="py-6 text-sm text-zinc-400 text-center">
                  No match events logged yet. Goals, cards, and official whistles will appear here live.
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {matchEvents.map((ev) => (
                    <div key={ev.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs font-bold text-zinc-300 w-10 shrink-0 tabular-nums">
                          {ev.minute}&apos;
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider shrink-0 ${
                            ev.type === 'GOAL'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : ev.type === 'RED_CARD'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                              : ev.type === 'YELLOW_CARD'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-white/10 text-zinc-200'
                          }`}
                        >
                          {ev.type.replace('_', ' ')}
                        </span>
                        <div className="min-w-0 truncate">
                          <span className="font-semibold text-white">{ev.playerName}</span>
                          <span className="text-zinc-400"> · {ev.teamName}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Spectator Chat */}
          <aside className="lg:col-span-4 rounded-xl bg-[#0D1017] border border-white/10 flex flex-col h-[540px] lg:h-auto lg:max-h-[760px]">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold uppercase text-white">
                  Live Match Chat
                </h2>
                <p className="text-xs text-zinc-400">
                  {site.chatEnabled ? 'Real-time supporter feed' : 'Chat paused by admin'}
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-400 tabular-nums">
                {chatMessages.length} msgs
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg p-3 text-sm ${
                    msg.isAdmin
                      ? 'bg-white/10 border border-white/20'
                      : 'bg-[#080A0F] border border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-xs font-bold ${msg.isAdmin ? 'text-amber-300' : 'text-zinc-200'}`}>
                      {msg.sender}
                      {msg.isAdmin ? ' · FTD Official' : ''}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-zinc-200 text-xs sm:text-sm break-words">{msg.message}</p>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {site.chatEnabled ? (
              <form onSubmit={handleSendChat} className="p-4 border-t border-white/10 space-y-2.5">
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value.slice(0, 32))}
                  placeholder="Your display name"
                  className="w-full px-3 py-2 rounded-lg bg-[#06080C] border border-white/10 text-xs text-white focus:outline-none focus:border-white/40"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value.slice(0, 240))}
                    placeholder="Send a live match message..."
                    className="flex-1 px-3 py-2.5 rounded-lg bg-[#06080C] border border-white/10 text-sm text-white focus:outline-none focus:border-white/40"
                  />
                  <button
                    type="submit"
                    disabled={sendingChat || !chatInput.trim()}
                    className="px-4 py-2.5 rounded-lg bg-white text-black hover:bg-zinc-200 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
                    aria-label="Send chat message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                {chatError && <p className="text-xs text-red-400">{chatError}</p>}
              </form>
            ) : (
              <div className="p-4 border-t border-white/10 text-xs text-zinc-400 text-center">
                Live chat is currently disabled by match administration.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
