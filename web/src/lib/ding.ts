// Plays a short synthesized bell (no audio file). iOS Safari only starts audio inside a user gesture, so the context
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

export function playDing(): void {
  if (!context) return;
  const now = context.currentTime;
  const gain = context.createGain();
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  for (const freq of [1318.5, 2637]) {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start();
    osc.stop(now + 0.9);
  }
}
