import type { SceneKind } from './sceneTypes';

type ToneKind = 'charge' | 'release' | 'land' | 'fail';

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private enabled = false;
  private nextBeat = 0;
  private beat = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  activate(): void {
    if (!this.enabled || typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.context) {
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.master.gain.value = 0.17;
        this.master.connect(this.context.destination);
      }
      const context = this.context;
      const master = this.master;
      if (!context || !master) return;
      const time = context.currentTime;
      master.gain.cancelScheduledValues(time);
      master.gain.setTargetAtTime(0.17, time, 0.018);
      void context.resume().catch(() => undefined);
      if (this.timer === null) {
        this.nextBeat = context.currentTime + 0.04;
        this.timer = window.setInterval(() => this.schedule(), 45);
      }
    } catch {
      // WebAudio can be disabled by the browser or an embedded document.
    }
  }

  hint(): void {
    if (!this.enabled || !this.context) return;
    this.voice(880, this.context.currentTime + 0.005, 0.14, 'sine', 0.16, 0.12);
  }

  pause(): void {
    this.stop();
  }

  finish(): void {
    // Let a landing chord ring out while ending the repeating 112 BPM bed.
    this.stopBeat();
  }

  stop(): void {
    this.stopBeat();
    if (this.context && this.master) {
      const time = this.context.currentTime;
      this.master.gain.cancelScheduledValues(time);
      this.master.gain.setTargetAtTime(0.0001, time, 0.018);
    }
  }

  private stopBeat(): void {
    if (this.timer !== null && typeof window !== 'undefined') window.clearInterval(this.timer);
    this.timer = null;
  }

  tone(kind: ToneKind, combo = 0, scene: SceneKind = 'ocean'): void {
    if (!this.enabled) return;
    if (kind === 'fail' && this.context) this.stopBeat();
    else this.activate();
    if (!this.context || !this.master) return;
    const time = this.context.currentTime + 0.005;
    if (kind === 'fail') this.stopBeat();
    if (kind === 'charge') {
      this.voice(270 + Math.min(260, combo * 15), time, 0.34, 'triangle', 0.11, 0.28);
      if (this.context) {
        const sweep = this.context.createOscillator();
        const envelope = this.context.createGain();
        sweep.type = 'sine';
        sweep.frequency.setValueAtTime(340, time);
        sweep.frequency.exponentialRampToValueAtTime(720 + Math.min(260, combo * 20), time + 0.3);
        envelope.gain.setValueAtTime(0.0001, time);
        envelope.gain.exponentialRampToValueAtTime(0.07, time + 0.02);
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
        sweep.connect(envelope); envelope.connect(this.master);
        sweep.addEventListener('ended', () => { sweep.disconnect(); envelope.disconnect(); });
        sweep.start(time); sweep.stop(time + 0.36);
      }
    } else if (kind === 'release') {
      this.voice(620 + Math.min(260, combo * 15), time, 0.12, 'square', 0.07, 0.1);
    } else if (kind === 'land') {
      const root = 220 + Math.min(180, combo * 11);
      this.voice(root, time, 0.2, 'sine', 0.16, 0.17);
      this.voice(root * 1.25, time, 0.23, 'triangle', 0.11, 0.2);
      this.voice(root * 1.5, time + 0.025, 0.24, 'sine', 0.08, 0.22);
    } else {
      const notes = {ocean:[145,78], lava:[65,43], sky:[440,220], ice:[1500,2300], vines:[240,130]}[scene];
      this.voice(notes[0], time, 0.28, scene === 'ice' ? 'triangle' : 'sine', 0.18, 0.25);
      this.voice(notes[1], time + 0.05, 0.35, 'sine', 0.12, 0.32);
      const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 0.42), this.context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      source.buffer = buffer;
      filter.type = scene === 'sky' || scene === 'vines' ? 'bandpass' : 'lowpass';
      const bands = {ocean:[2600,350],lava:[850,100],sky:[1800,600],ice:[6000,2000],vines:[3000,800]}[scene];
      filter.frequency.setValueAtTime(bands[0], time);
      filter.frequency.exponentialRampToValueAtTime(bands[1], time + 0.4);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.38, time + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
      source.connect(filter); filter.connect(gain); gain.connect(this.master);
      source.addEventListener('ended', () => { source.disconnect(); filter.disconnect(); gain.disconnect(); });
      source.start(time); source.stop(time + 0.42);
    }
  }

  dispose(): void {
    this.stop();
  }

  private schedule(): void {
    if (!this.enabled || !this.context || !this.master) return;
    const horizon = this.context.currentTime + 0.12;
    const beatLength = 60 / 112;
    while (this.nextBeat < horizon) {
      const beat = this.beat % 4;
      this.voice(beat === 0 || beat === 2 ? 70 : 58, this.nextBeat, 0.12, 'sine', beat === 0 ? 0.16 : 0.1, 0.09);
      this.voice(1800, this.nextBeat + beatLength * 0.5, 0.035, 'square', 0.035, 0.025);
      if (beat === 0 || beat === 2) this.voice(110 + (this.beat % 8) * 5, this.nextBeat, 0.19, 'triangle', 0.045, 0.16);
      this.nextBeat += beatLength;
      this.beat += 1;
    }
  }

  private voice(frequency: number, start: number, duration: number, type: OscillatorType, volume: number, decay: number): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (frequency < 100) oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * 0.55), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      gain.disconnect();
    });
    oscillator.start(start);
    oscillator.stop(start + duration);
  }
}

let sharedDirector: AudioDirector | null = null;
export const getAudioDirector = (): AudioDirector => {
  if (!sharedDirector) sharedDirector = new AudioDirector();
  return sharedDirector;
};
