// Audio engine — Web Audio API, no external files

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
  slice() {
    tone(800, 0.04, 'sawtooth', 0.1)
    setTimeout(() => tone(600, 0.06, 'sine', 0.08), 30)
  },
  combo() {
    tone(440, 0.06, 'sine', 0.1)
    setTimeout(() => tone(660, 0.06, 'sine', 0.1), 50)
    setTimeout(() => tone(880, 0.1, 'sine', 0.12), 100)
  },
  bomb() {
    tone(200, 0.4, 'square', 0.14)
    setTimeout(() => tone(100, 0.5, 'square', 0.12), 80)
    setTimeout(() => tone(60,  0.6, 'square', 0.1),  180)
  },
  miss() { tone(300, 0.15, 'triangle', 0.08) },
  start() {
    tone(330, 0.1, 'sine', 0.08)
    setTimeout(() => tone(440, 0.1, 'sine', 0.08), 80)
    setTimeout(() => tone(660, 0.15, 'sine', 0.1), 160)
  },
  death() {
    tone(400, 0.3, 'square', 0.1)
    setTimeout(() => tone(200, 0.3, 'square', 0.08), 100)
    setTimeout(() => tone(100, 0.4, 'square', 0.06), 200)
  },
  tick() { tone(1000, 0.02, 'triangle', 0.05) },
  toggleMute(): boolean { muted = !muted; return muted },
  isMuted(): boolean { return muted },
}
