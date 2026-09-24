let audio: AudioContext | null = null;

/** Call from a tap: iPhone only lets a page play sound after a user gesture. */
export function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    // no Web Audio
  }
}

/** Beep and vibrate after a scan, so the result is clear without looking at the screen:
 * a short high beep when the code was accepted, a long low one when something is wrong. */
export function scanFeedback(ok: boolean): void {
  try {
    navigator.vibrate?.(ok ? 40 : [90, 60, 90]);
  } catch {
    // not supported (iPhone)
  }
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = ok ? 1250 : 280;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + (ok ? 0.08 : 0.3));
  } catch {
    // audio blocked until the first tap — the message on screen is enough
  }
}
