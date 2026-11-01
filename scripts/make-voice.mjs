// Makes public/voice/winner.mp3 and scrapped.mp3, the robot announcer. Needs ffmpeg on the path.
// A small formant speech synthesizer: a buzzing source, shaped by moving resonances, plus noise for the consonants.
// It uses no outside voice or recording, so the result is entirely this game's own.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const voiceDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'voice');
const work = mkdtempSync(join(tmpdir(), 'voice-'));
const RATE = 44100;
const TEMPO = 1;
const HISS = 0.05;
const PITCH = 1;
const BRIGHT = 0.86;

// Each entry: length in ms, then the target it glides to. f: formants in Hz, bw: their widths, voice and noise: levels,
// noiseBand: [centre, width] of the hiss, nasal: dims the voice like a closed mouth.
const seg = (ms, o) => ({ ms, f: [500, 1500, 2500, 3500], bw: [90, 110, 170, 250], voice: 0, noise: 0, noiseBand: [3000, 2000], glide: 0.35, ...o });

const WORDS = {
  winner: [
    seg(45, { f: [310, 700, 2200, 3300], voice: 0.7, glide: 0.2 }),            // w
    seg(150, { f: [430, 2000, 2650, 3500], voice: 1, glide: 0.3 }),            // i
    seg(75, { f: [280, 1600, 2500, 3400], bw: [50, 170, 240, 320], voice: 0.6, nasal: 1, glide: 0.2 }), // n
    seg(210, { f: [490, 1350, 1680, 3200], voice: 1, glide: 0.3 }),            // er
    seg(90, { f: [480, 1320, 1650, 3200], voice: 0.15, glide: 0.6 }),
  ],
  scrapped: [
    seg(125, { noise: 0.42, noiseBand: [6000, 2600], glide: 0.1 }),            // s
    seg(55, {}),                                                               // k, held shut
    seg(20, { noise: 1.2, noiseBand: [1900, 1100], glide: 0 }),                // k, released
    seg(35, { noise: 0.5, noiseBand: [1500, 1400], f: [350, 1200, 1700, 3200], voice: 0.2, glide: 0.1 }),
    seg(75, { f: [340, 1080, 1480, 3100], voice: 0.8, glide: 0.45 }),          // r
    seg(205, { f: [780, 1680, 2480, 3400], bw: [110, 120, 170, 250], voice: 1, glide: 0.35 }), // a
    seg(30, { f: [620, 1300, 2300, 3300], voice: 0.45, glide: 0.5 }),
    seg(70, {}),                                                               // p, held shut
    seg(15, { noise: 0.5, noiseBand: [900, 1300], glide: 0 }),                 // p, released
    seg(40, {}),                                                               // t, held shut
    seg(40, { noise: 0.8, noiseBand: [4300, 2600], glide: 0.1 }),             // t, released
  ],
};

class Resonator {
  y1 = 0; y2 = 0;
  step(x, f, bw) {
    const r = Math.exp(-Math.PI * bw / RATE);
    const a1 = 2 * r * Math.cos(2 * Math.PI * f / RATE);
    const a2 = -r * r;
    const gain = 1 - a1 - a2;
    const y = gain * x + a1 * this.y1 + a2 * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

function speak(segments, { pitch, pitchEnd, seed }) {
  let random = seed;
  const noise = () => {
    random = (random * 1664525 + 1013904223) >>> 0;
    return random / 2147483648 - 1;
  };
  const total = Math.round(segments.reduce((sum, s) => sum + s.ms * TEMPO, 0) * RATE / 1000) + segments.length;
  const out = new Float64Array(total);
  const formants = [new Resonator(), new Resonator(), new Resonator(), new Resonator()];
  const hiss = new Resonator();
  const hissLow = new Resonator();
  const cur = { ...segments[0], f: [...segments[0].f], bw: [...segments[0].bw], nasal: 0 };
  let n = 0;
  let phase = 0;
  let lastExcitation = 0;
  let lastVoiced = 0;
  let low = 0;
  for (const s of segments) {
    const count = Math.round(s.ms * TEMPO * RATE / 1000);
    // Everything eases toward this sound's targets, which is what makes it run together like speech.
    const ease = 1 - Math.exp(-1 / Math.max(1, s.glide * count * 0.5));
    const hard = s.glide === 0;
    for (let i = 0; i < count && n < total; i++, n++) {
      for (let k = 0; k < 4; k++) {
        cur.f[k] += (s.f[k] - cur.f[k]) * ease;
        cur.bw[k] += (s.bw[k] - cur.bw[k]) * ease;
      }
      cur.voice += (s.voice - cur.voice) * Math.min(1, ease * 2);
      cur.noise += (s.noise - cur.noise) * (hard ? 1 : Math.min(1, ease * 2));
      cur.nasal += ((s.nasal ?? 0) - cur.nasal) * ease;
      cur.noiseBand[0] += (s.noiseBand[0] - cur.noiseBand[0]) * Math.min(1, ease * 3);
      cur.noiseBand[1] += (s.noiseBand[1] - cur.noiseBand[1]) * Math.min(1, ease * 3);

      const t = n / total;
      const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5.2 * n / RATE);
      const f0 = (pitch + (pitchEnd - pitch) * t) * vibrato;
      phase += f0 / RATE;
      if (phase >= 1) phase -= 1;
      // A glottal pulse: opens slowly, shuts fast. The sharp closing edge carries the high harmonics.
      const pulse = phase < 0.6 ? 0.5 * (1 - Math.cos(Math.PI * phase / 0.6)) : Math.cos(Math.PI * (phase - 0.6) / 0.2 * 0.5) ** 2 * (phase < 0.8 ? 1 : 0);
      const excitation = (pulse - 0.32) * cur.voice + noise() * 0.018 * cur.voice;

      // In series, like a real throat and mouth, so each resonance's level follows from where it sits.
      // The difference stands in for the sound leaving the lips, which lifts the highs.
      let voiced = excitation - lastExcitation;
      lastExcitation = excitation;
      for (let k = 0; k < 4; k++) voiced = formants[k].step(voiced, cur.f[k], cur.bw[k]);
      voiced *= 1 - 0.55 * cur.nasal;

      const band = hiss.step(noise(), cur.noiseBand[0], cur.noiseBand[1]);
      const unvoiced = (band - hissLow.step(band, 500, 700)) * cur.noise;
      // A lift to the highs, and nothing below the voice's own pitch.
      const lifted = voiced - lastVoiced * BRIGHT;
      lastVoiced = voiced;
      low += (lifted - low) * 0.012;
      out[n] = (lifted - low) * 32 + unvoiced * HISS;
    }
  }
  return out;
}

function wav(samples, file) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round((v / peak) * 0.89 * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([head, data]));
}

const LINES = { winner: { pitch: 132 * PITCH, pitchEnd: 88 * PITCH, seed: 7 }, scrapped: { pitch: 122 * PITCH, pitchEnd: 78 * PITCH, seed: 11 } };
for (const [word, voice] of Object.entries(LINES)) {
  const file = join(work, `${word}.wav`);
  wav(speak(WORDS[word], voice), file);
  const done = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-codec:a', 'libmp3lame', '-b:a', '96k', join(voiceDir, `${word}.mp3`)], { stdio: 'inherit' });
  if (done.status !== 0) throw new Error(`ffmpeg failed on ${word}`);
}
rmSync(work, { recursive: true });
console.log('written');
