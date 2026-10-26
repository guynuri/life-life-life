// Plays a short synthesized bell (no audio file). Browsers allow audio only after a user gesture, which the Done tap is.
export function playDing(): void {
  try {
    const context = new AudioContext();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.9);
    for (const freq of [1318.5, 2637]) {
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      osc.stop(context.currentTime + 0.9);
    }
    setTimeout(() => void context.close(), 1000);
  } catch {
    // No audio support: the task still completes silently.
  }
}
