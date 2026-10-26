// Plays a short, bright two-note chime (no audio file), similar to Google Tasks' completion sound: quick attack,
// about 0.3 s decay, no long tail. iOS Safari only starts audio inside a user gesture, so the context
// is created and resumed by primeDing() in the tap handler, before any await. playDing() then reuses it.
let context: AudioContext | null = null;

export function primeDing(): void {
  try {
    context ??= new AudioContext();
    void context.resume();
  } catch {
    // No audio support: the task still completes silently.
  }
}

const NOTES = [
  { freq: 1568, at: 0 },
  { freq: 2093, at: 0.07 },
];

export function playDing(): void {
  if (!context) return;
  const start = context.currentTime;
  for (const note of NOTES) {
    const t = start + note.at;
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = note.freq;
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + 0.3);
  }
}
