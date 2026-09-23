/**
 * Prozedurale Sounds über die Web Audio API (keine Audiodateien).
 * Der AudioContext wird erst nach einer Benutzerinteraktion erzeugt bzw. fortgesetzt.
 * Gleichzeitige Sounds werden begrenzt (Stimmenlimit + Mindestabstand je Typ).
 */

type SoundKind = 'cue' | 'ball' | 'cushion' | 'pocket' | 'end' | 'ui';

const MAX_VOICES = 10;
const MIN_INTERVAL: Record<SoundKind, number> = {
  cue: 0.05,
  ball: 0.022,
  cushion: 0.035,
  pocket: 0.08,
  end: 0.5,
  ui: 0.05,
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;
  private muted = false;
  private activeVoices = 0;
  private readonly lastPlayed: Record<SoundKind, number> = { cue: 0, ball: 0, cushion: 0, pocket: 0, end: 0, ui: 0 };

  /** Muss aus einem Nutzerereignis (Klick/Taste) aufgerufen werden. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.ratio.value = 4;
        this.master = this.ctx.createGain();
        this.master.connect(compressor);
        compressor.connect(this.ctx.destination);
        this.noise = this.createNoise(this.ctx);
        this.applyVolume();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyVolume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.master && this.ctx) {
      const target = this.muted ? 0 : this.volume * this.volume;
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
    }
  }

  private createNoise(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Prüft Stimmenlimit und Mindestabstand; reserviert bei Erfolg eine Stimme. */
  private acquire(kind: SoundKind, duration: number): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.volume <= 0 || ctx.state !== 'running') return false;
    const now = ctx.currentTime;
    if (now - this.lastPlayed[kind] < MIN_INTERVAL[kind]) return false;
    if (this.activeVoices >= MAX_VOICES) return false;
    this.lastPlayed[kind] = now;
    this.activeVoices++;
    window.setTimeout(() => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }, duration * 1000 + 30);
    return true;
  }

  private tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine', endFreq?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.master!);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private noiseBurst(start: number, dur: number, gain: number, filter: BiquadFilterType, freq: number, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(start, Math.random() * 0.3);
    src.stop(start + dur + 0.02);
  }

  /** Queue trifft die Weiße. */
  playCueHit(power: number): void {
    if (!this.acquire('cue', 0.12)) return;
    const t = this.ctx!.currentTime;
    const g = 0.25 + 0.55 * power;
    this.noiseBurst(t, 0.045, g * 0.7, 'bandpass', 1900, 1.2);
    this.tone(720 + power * 120, t, 0.07, g * 0.5, 'triangle', 480);
  }

  /** Kugel-Kugel-Klick, Lautstärke nach Aufprallgeschwindigkeit. */
  playBallClick(speed: number): void {
    if (speed < 0.05) return;
    const intensity = Math.min(1, Math.pow(speed / 3, 0.75));
    if (!this.acquire('ball', 0.09)) return;
    const t = this.ctx!.currentTime;
    const f = 2600 + Math.random() * 900;
    this.tone(f, t, 0.055, 0.55 * intensity, 'sine');
    this.tone(f * 1.52, t, 0.035, 0.25 * intensity, 'sine');
    this.noiseBurst(t, 0.012, 0.35 * intensity, 'highpass', 3000);
  }

  /** Dumpfer Bandenkontakt. */
  playCushion(speed: number): void {
    if (speed < 0.08) return;
    const intensity = Math.min(1, Math.pow(speed / 3, 0.8));
    if (!this.acquire('cushion', 0.16)) return;
    const t = this.ctx!.currentTime;
    this.tone(150, t, 0.13, 0.5 * intensity, 'sine', 85);
    this.noiseBurst(t, 0.06, 0.25 * intensity, 'lowpass', 500);
  }

  /** Kugel fällt in die Tasche. */
  playPocket(): void {
    if (!this.acquire('pocket', 0.45)) return;
    const t = this.ctx!.currentTime;
    this.tone(1500, t, 0.03, 0.2, 'triangle');
    this.tone(1250, t + 0.045, 0.03, 0.15, 'triangle');
    this.tone(105, t + 0.06, 0.28, 0.55, 'sine', 60);
    this.noiseBurst(t + 0.05, 0.3, 0.18, 'lowpass', 380);
  }

  /** Spielende: Akkord aufwärts (Sieg) bzw. gedämpft abwärts. */
  playGameEnd(positive: boolean): void {
    if (!this.acquire('end', 1.6)) return;
    const t = this.ctx!.currentTime;
    const notes = positive ? [523.25, 659.25, 783.99, 1046.5] : [440, 392, 349.23, 293.66];
    notes.forEach((f, i) => {
      this.tone(f, t + i * 0.13, 0.9, 0.22, 'triangle');
      this.tone(f * 2, t + i * 0.13, 0.5, 0.05, 'sine');
    });
  }

  /** Kurzer Hinweiston (Foul, Menü). */
  playNotice(): void {
    if (!this.acquire('ui', 0.3)) return;
    const t = this.ctx!.currentTime;
    this.tone(392, t, 0.16, 0.14, 'triangle');
    this.tone(311, t + 0.12, 0.2, 0.12, 'triangle');
  }
}
