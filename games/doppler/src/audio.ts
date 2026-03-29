// Custom Doppler audio engine — persistent oscillators with real-time frequency
// and stereo panning modulation based on player position relative to walls/items.

let audioCtx: AudioContext | null = null
let muted = false

// Persistent ambient oscillator for the player's "sonar pulse"
let ambientOsc: OscillatorNode | null = null
let ambientGain: GainNode | null = null
let ambientPanner: StereoPannerNode | null = null

// Doppler parameters
const BASE_FREQ = 440

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

// Start the persistent ambient tone (called once on game start)
export function startAmbientTone(): void {
  if (muted) return
  try {
    const c = getCtx()
    stopAmbientTone()

    ambientGain = c.createGain()
    ambientGain.gain.value = 0.06

    ambientPanner = c.createStereoPanner()
    ambientPanner.pan.value = 0

    ambientOsc = c.createOscillator()
    ambientOsc.type = 'sine'
    ambientOsc.frequency.value = BASE_FREQ

    ambientOsc.connect(ambientGain)
    ambientGain.connect(ambientPanner)
    ambientPanner.connect(c.destination)
    ambientOsc.start()
  } catch { /* Audio not available */ }
}

export function stopAmbientTone(): void {
  try {
    if (ambientOsc) { ambientOsc.stop(); ambientOsc.disconnect() }
    if (ambientGain) ambientGain.disconnect()
    if (ambientPanner) ambientPanner.disconnect()
  } catch { /* ignore */ }
  ambientOsc = null
  ambientGain = null
  ambientPanner = null
}

// Called each frame with player velocity and nearest wall distance/direction
// dx, dy: player velocity vector (-1..1 normalized)
// wallDist: distance to nearest wall in player direction (0=touching, 1=far)
// lateralBias: -1=wall left, 0=centered, 1=wall right
export function updateDopplerTone(
  velocityMag: number,
  approachingWall: boolean,
  wallDist: number,
  lateralBias: number
): void {
  if (!ambientOsc || !ambientPanner || muted) return
  const c = getCtx()

  // Doppler shift: approaching wall = higher pitch, receding = lower
  // When moving fast toward a wall, freq goes up
  let targetFreq = BASE_FREQ
  if (velocityMag > 0.1) {
    const shift = approachingWall ? 1 + velocityMag * 0.3 : 1 - velocityMag * 0.15
    // Close wall = more intense reflection
    const wallBoost = Math.max(0, 1 - wallDist / 5)
    targetFreq = BASE_FREQ * (1 + (shift - 1) * wallBoost)
  }

  // Volume increases when near walls (reflection effect)
  const reflectionVol = 0.04 + Math.max(0, 1 - wallDist / 4) * 0.08
  if (ambientGain) {
    ambientGain.gain.setTargetAtTime(muted ? 0 : reflectionVol, c.currentTime, 0.1)
  }

  // Stereo panning based on lateral wall position
  ambientPanner.pan.setTargetAtTime(lateralBias * 0.7, c.currentTime, 0.15)

  // Smooth frequency transition
  ambientOsc.frequency.setTargetAtTime(targetFreq, c.currentTime, 0.1)
}

// Item ping — distinctive, positional ping sound
export function playItemPing(pan: number, isCollect: boolean): void {
  if (muted) return
  try {
    const c = getCtx()
    const panner = c.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, pan))

    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'triangle'
    osc.frequency.value = isCollect ? 1320 : 880
    gain.gain.value = isCollect ? 0.18 : 0.1
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (isCollect ? 0.4 : 0.2))

    osc.connect(gain)
    gain.connect(panner)
    panner.connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + (isCollect ? 0.4 : 0.2))

    if (isCollect) {
      // Collect flourish
      const osc2 = c.createOscillator()
      const gain2 = c.createGain()
      osc2.type = 'sine'
      osc2.frequency.value = 1760
      gain2.gain.value = 0.1
      gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3)
      osc2.connect(gain2)
      gain2.connect(panner)
      panner.connect(c.destination)
      osc2.start(c.currentTime + 0.1)
      osc2.stop(c.currentTime + 0.4)
    }
  } catch { /* Audio not available */ }
}

// Wall collision bump
export function playWallBump(): void {
  if (muted) return
  try {
    const c = getCtx()
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'square'
    osc.frequency.value = 80
    gain.gain.value = 0.08
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06)
    osc.connect(gain).connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + 0.06)
  } catch { /* Audio not available */ }
}

// Level complete jingle
export function playLevelComplete(): void {
  if (muted) return
  try {
    const c = getCtx()
    const freqs = [523, 659, 784, 1047]
    freqs.forEach((f, i) => {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      gain.gain.value = 0.1
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1 + i * 0.1)
      osc.connect(gain).connect(c.destination)
      osc.start(c.currentTime + i * 0.1)
      osc.stop(c.currentTime + 0.2 + i * 0.1)
    })
  } catch { /* Audio not available */ }
}

// Game over
export function playGameOver(): void {
  if (muted) return
  try {
    const c = getCtx()
    const freqs = [300, 240, 180, 120]
    freqs.forEach((f, i) => {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'square'
      osc.frequency.value = f
      gain.gain.value = 0.06
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3)
      osc.connect(gain).connect(c.destination)
      osc.start(c.currentTime + i * 0.1)
      osc.stop(c.currentTime + 0.4 + i * 0.1)
    })
  } catch { /* Audio not available */ }
}

export function toggleMute(): boolean {
  muted = !muted
  if (muted && ambientGain && audioCtx) {
    ambientGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05)
  } else if (!muted && ambientGain && audioCtx) {
    ambientGain.gain.setTargetAtTime(0.06, audioCtx.currentTime, 0.05)
  }
  return muted
}

export function isMuted(): boolean { return muted }
