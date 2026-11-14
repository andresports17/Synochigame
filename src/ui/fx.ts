// Match-day atmosphere: stadium sound, live commentary, voice and haptics.
// Everything is generated in code (Web Audio, Speech Synthesis, Vibration),
// so there are no audio files to license and nothing to download.
// None of this touches the rules engine: the game stays fully deterministic.

import { ROLE_NAMES, TEAM_NAMES, type GameEvent, type GameState, type Side } from '../engine';

// ---------------------------------------------------------------- settings

export type FxSettings = { sound: boolean; voice: boolean };
const KEY = 'synochi.fx';

export function loadFx(): FxSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '');
    return { sound: v.sound !== false, voice: v.voice === true };
  } catch {
    return { sound: true, voice: false };
  }
}

export function saveFx(s: FxSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage can be unavailable; settings then last for this visit only */
  }
}

// ---------------------------------------------------------------- stadium sound

type AC = AudioContext;

class Stadium {
  private ctx: AC | null = null;
  private master: GainNode | null = null;
  private crowd: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;

  /** Browsers only allow audio after a tap, so this is called from the first pointer event. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(ctx.destination);

    // Two seconds of pink-ish noise, reused for crowd, roar and kicks.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }

    // Crowd bed: looping noise through a band-pass, like a distant murmur.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.crowdFilter = ctx.createBiquadFilter();
    this.crowdFilter.type = 'bandpass';
    this.crowdFilter.frequency.value = 700;
    this.crowdFilter.Q.value = 0.6;
    this.crowd = ctx.createGain();
    this.crowd.gain.value = 0.05;
    src.connect(this.crowdFilter).connect(this.crowd).connect(this.master);
    src.start();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  /** 0 = quiet midfield, 1 = attack right at the goal. The crowd rises as the ball nears goal. */
  tension(level: number) {
    if (!this.ctx || !this.crowd || !this.crowdFilter) return;
    const t = this.ctx.currentTime;
    const l = Math.max(0, Math.min(1, level));
    this.crowd.gain.setTargetAtTime(0.045 + l * 0.11, t, 0.6);
    this.crowdFilter.frequency.setTargetAtTime(650 + l * 650, t, 0.6);
  }

  private burst(opts: { dur: number; peak: number; attack: number; freq: number; q?: number; sweepTo?: number; type?: BiquadFilterType; delay?: number }) {
    if (!this.ctx || !this.master || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.dur);
    f.Q.value = opts.q ?? 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.peak, t + opts.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + opts.dur + 0.05);
  }

  /** Boot on ball: a short low thump plus a leather click. */
  kick(power = 1) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * power, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.16);
    this.burst({ dur: 0.05, peak: 0.25 * power, attack: 0.002, freq: 2400, q: 1.2 });
  }

  /** Referee's whistle: a pea whistle is a high tone with a fast warble. */
  whistle(blasts: number[] = [0.25]) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.02;
    for (const len of blasts) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 2650;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 32;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 140;
      lfo.connect(lfoGain).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2700;
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + len - 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(f).connect(g).connect(this.master);
      o.start(t);
      lfo.start(t);
      o.stop(t + len + 0.02);
      lfo.stop(t + len + 0.02);
      t += len + 0.12;
    }
  }

  roar() {
    this.burst({ dur: 4.2, peak: 0.55, attack: 0.25, freq: 500, sweepTo: 1300, q: 0.5 });
    this.burst({ dur: 3.4, peak: 0.25, attack: 0.15, freq: 2200, q: 0.8, delay: 0.1 });
  }

  groan() {
    this.burst({ dur: 1.6, peak: 0.22, attack: 0.15, freq: 900, sweepTo: 320, q: 0.9 });
  }

  cheer() {
    this.burst({ dur: 1.3, peak: 0.2, attack: 0.1, freq: 1100, sweepTo: 1500, q: 0.7 });
  }
}

export const stadium = new Stadium();

// ---------------------------------------------------------------- commentary

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const ROLE_LIST = Object.values(ROLE_NAMES).sort((a, b) => b.length - a.length);

/** First and second role named in an event's text, e.g. "Blue Frontliner passes to Anchor". */
function roles(text: string): string[] {
  const found: Array<{ i: number; r: string }> = [];
  for (const r of ROLE_LIST) {
    let i = text.indexOf(r);
    while (i >= 0) {
      if (!found.some((f) => i >= f.i && i < f.i + f.r.length)) found.push({ i, r });
      i = text.indexOf(r, i + 1);
    }
  }
  return found.sort((a, b) => a.i - b.i).map((f) => f.r);
}

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export type Line = { text: string; big: boolean };

/** A TV-style line for an event, or null for routine moments the commentator lets go. */
export function commentate(e: GameEvent, s: GameState): Line | null {
  const team = TEAM_NAMES[e.side];
  const opp = TEAM_NAMES[other(e.side)];
  const [who, to] = roles(e.text);
  const late = s.timed && s.half === 2 && s.clock.halfMs < 60_000;
  const lead = s.score[e.side] - s.score[other(e.side)];
  switch (e.kind) {
    case 'kickoff':
      return { text: pick([`We're under way! ${team} get us started.`, `And we're off. ${team} kick off.`, `The whistle goes and ${team} set off.`]), big: false };
    case 'pass':
      if (Math.random() < 0.55) return null;
      return {
        text: pick([
          `Neat ball from the ${who ?? 'midfield'}${to ? ` into the ${to}` : ''}.`,
          `${team} keep it moving.`,
          `Lovely weight on that pass.`,
          `Patient from ${team}, probing for an opening.`,
          `${to ? `The ${to} takes it` : 'Taken'} in stride.`,
        ]),
        big: false,
      };
    case 'oneTwo':
      return { text: pick([`Give and go! Beautiful one-two from ${team}.`, `Wall pass, and ${team} are through!`, `Textbook one-two. That's straight off the training ground.`]), big: true };
    case 'recover':
      return { text: pick([`Loose ball, and it's ${team} who react first.`, `${team} pounce on the loose ball.`]), big: false };
    case 'intercept':
    case 'blocked':
      return { text: pick([`Cut out! ${team} read that all the way.`, `Intercepted. Great anticipation from ${team}.`, `That pass never had a chance. ${team} win it back.`]), big: false };
    case 'contested':
      return { text: pick([`Too much pressure on the receiver. ${team} nick it.`, `Swarmed! ${team} win it as the pass arrives.`]), big: false };
    case 'offside':
      return { text: pick([`The flag is up! Offside.`, `Offside. Timed that run a fraction too early.`, `${opp} have been caught by the line. Offside.`]), big: true };
    case 'tackle':
    case 'reactiveTackle':
      return { text: pick([`Strong tackle from the ${who ?? 'defender'}!`, `Won it cleanly! ${team} break up the attack.`, `What a challenge. ${team} take the ball away.`, `Read it perfectly and steps in. Great defending.`]), big: true };
    case 'shot':
      return { text: pick([`${team} shoot!`, `The ${who ?? 'attacker'} lets fly!`, `Here's the strike!`]), big: false };
    case 'goal': {
      const tag = lead === 0 ? `It's all square!` : lead === 1 ? `${team} lead!` : lead > 1 ? `${team} are running away with this!` : `${team} pull one back!`;
      const drama = late ? ` And so late in the game!` : '';
      return { text: `GOAL! ${pick([`What a finish`, `Buried it`, `Into the net`, `Unstoppable`])} from the ${who ?? 'striker'}! ${tag}${drama} ${TEAM_NAMES.home} ${s.score.home}, ${TEAM_NAMES.away} ${s.score.away}.`, big: true };
    }
    case 'save':
      return { text: pick([`Saved! The Box Keeper is equal to it.`, `What a stop from the keeper!`, `Denied! Brilliant goalkeeping.`]), big: true };
    case 'block':
    case 'rebound':
      return { text: pick([`Blocked! Bodies on the line.`, `Charged down. Brave defending.`, `It's blocked, and the ball spins loose.`]), big: false };
    case 'goalKick':
      return { text: pick([`Wide! That's off target.`, `Pulled wide. A chance goes begging.`, `Off target. Goal kick.`]), big: false };
    case 'stall':
      return { text: `${team} have dawdled on the ball too long, and it's turned over.`, big: false };
    case 'timeout':
      return { text: `Time's up on that turn for ${team}.`, big: false };
    case 'halftime':
      return { text: `That's half-time. ${TEAM_NAMES.home} ${s.score.home}, ${TEAM_NAMES.away} ${s.score.away}.`, big: true };
    case 'fulltime': {
      const h = s.score.home, a = s.score.away;
      const res = h === a ? `It finishes all square` : `${h > a ? TEAM_NAMES.home : TEAM_NAMES.away} take the win`;
      return { text: `Full-time! ${res}, ${TEAM_NAMES.home} ${h}, ${TEAM_NAMES.away} ${a}.`, big: true };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- voice and haptics

let voice: SpeechSynthesisVoice | null = null;

export function say(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (!voice) {
      const vs = synth.getVoices();
      voice = vs.find((v) => /en[-_]GB/i.test(v.lang)) ?? vs.find((v) => /^en/i.test(v.lang)) ?? null;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/GOAL!/g, 'Goooal!'));
    if (voice) u.voice = voice;
    u.rate = 1.08;
    u.pitch = 1;
    synth.speak(u);
  } catch {
    /* no speech engine on this device */
  }
}

export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no vibration motor or not allowed (iOS Safari) */
  }
}

/** Sound and haptics for one event. */
export function soundFor(e: GameEvent) {
  switch (e.kind) {
    case 'kickoff':
      stadium.whistle([0.45]);
      break;
    case 'pass':
    case 'oneTwo':
      stadium.kick(0.7);
      break;
    case 'shot':
      stadium.kick(1.2);
      break;
    case 'goal':
      stadium.roar();
      buzz([90, 60, 180]);
      break;
    case 'save':
    case 'block':
      stadium.groan();
      buzz(30);
      break;
    case 'goalKick':
      stadium.groan();
      break;
    case 'tackle':
    case 'reactiveTackle':
    case 'intercept':
    case 'contested':
      stadium.cheer();
      buzz(25);
      break;
    case 'offside':
      stadium.whistle([0.18]);
      break;
    case 'halftime':
      stadium.whistle([0.3, 0.6]);
      break;
    case 'fulltime':
      stadium.whistle([0.3, 0.3, 0.9]);
      break;
  }
}
