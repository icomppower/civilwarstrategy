let ctx: AudioContext | null = null;
let unlocked = false;

function ac(): AudioContext | null {
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  return ctx;
}

// Browser autoplay policy: resume on first pointerdown.
document.addEventListener('pointerdown', () => {
  const a = ac();
  if (a && a.state === 'suspended') a.resume();
  unlocked = true;
}, { once: true });

export function beep(enabled: boolean, kind: 'click' | 'error' | 'battle') {
  if (!enabled || !unlocked) return;
  const a = ac();
  if (!a) return;
  const seq = kind === 'click' ? [[880, 0.04]] : kind === 'error' ? [[220, 0.12]] : [[392, 0.08], [523, 0.08], [659, 0.12]];
  let t = a.currentTime;
  for (const [f, d] of seq) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'square';
    o.frequency.value = f;
    g.gain.value = 0.05;
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + d);
    t += d;
  }
}
