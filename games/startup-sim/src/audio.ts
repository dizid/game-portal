// Shared audio engine — Web Audio API, no external files

let ctx: AudioContext | null = null
let muted = false

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.12): void {
  if (muted) return
  try {
    const c = getCtx()
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.value = vol
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration)
    osc.connect(gain).connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + duration)
  } catch { /* Audio not available */ }
}

export const audio = {
  blip() { tone(660, 0.06, 'sine', 0.1) },
  score() { tone(880, 0.08, 'sine', 0.12) },
  coin() {
    tone(523, 0.08, 'sine', 0.1)
    setTimeout(() => tone(659, 0.08, 'sine', 0.1), 60)
    setTimeout(() => tone(784, 0.12, 'sine', 0.12), 120)
  },
  death() {
    tone(400, 0.3, 'square', 0.1)
    setTimeout(() => tone(200, 0.3, 'square', 0.08), 100)
    setTimeout(() => tone(100, 0.4, 'square', 0.06), 200)
  },
  start() {
    tone(330, 0.1, 'sine', 0.08)
    setTimeout(() => tone(440, 0.1, 'sine', 0.08), 80)
    setTimeout(() => tone(660, 0.15, 'sine', 0.1), 160)
  },
  click() { tone(800, 0.02, 'triangle', 0.06) },
  hire() {
    tone(440, 0.08, 'sine', 0.1)
    setTimeout(() => tone(550, 0.08, 'sine', 0.1), 60)
  },
  levelUp() {
    tone(523, 0.1, 'sine', 0.1)
    setTimeout(() => tone(659, 0.1, 'sine', 0.1), 100)
    setTimeout(() => tone(784, 0.1, 'sine', 0.1), 200)
    setTimeout(() => tone(1047, 0.2, 'sine', 0.12), 300)
  },
  toggleMute(): boolean { muted = !muted; return muted },
  isMuted(): boolean { return muted },
}
