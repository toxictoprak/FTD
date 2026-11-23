// Synthesized Web Audio API broadcast sound effects (user-activated only)

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      audioCtx = new Ctx();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function primeBroadcastAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.02);
}

export function playGoalSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Stadium horn triad
  const freqs = [146.83, 220.0, 293.66];
  freqs.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = idx === 0 ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(f, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 1.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 2.15);
  });

  // Filtered crowd noise swell
  const bufferSize = ctx.sampleRate * 2.2;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  const whiteNoise = ctx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(650, now);
  filter.Q.setValueAtTime(0.8, now);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.11, now + 0.35);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

  whiteNoise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  whiteNoise.start(now);
  whiteNoise.stop(now + 2.2);
}

export function playWhistleSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const mainGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(2850, now);
  lfo.frequency.setValueAtTime(38, now);
  lfoGain.gain.setValueAtTime(95, now);

  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  mainGain.gain.setValueAtTime(0.001, now);
  mainGain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
  mainGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  osc.connect(mainGain);
  mainGain.connect(ctx.destination);
  osc.start(now);
  lfo.start(now);
  osc.stop(now + 0.48);
  lfo.stop(now + 0.48);
}

export function playCeremonyFanfare(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [
    { freq: 261.63, start: 0, dur: 0.4 },
    { freq: 329.63, start: 0.16, dur: 0.4 },
    { freq: 392.0, start: 0.32, dur: 0.5 },
    { freq: 523.25, start: 0.5, dur: 1.5 },
  ];
  notes.forEach(({ freq, start, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now + start);
    gain.gain.setValueAtTime(0.001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.1, now + start + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.05);
  });
}
