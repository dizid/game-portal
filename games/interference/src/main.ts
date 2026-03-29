import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const levelEl = document.getElementById('level-value') as HTMLSpanElement
const matchEl = document.getElementById('match-value') as HTMLSpanElement
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

function resizeCanvas(): void {
  const cont = canvas.parentElement!
  const sz = Math.min(cont.clientWidth, cont.clientHeight - 50)
  canvas.width = sz; canvas.height = sz
  canvas.style.width = `${sz}px`; canvas.style.height = `${sz}px`
}
resizeCanvas()
window.addEventListener('resize', resizeCanvas)
muteBtn.addEventListener('click', () => { muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊' })

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'READY' | 'PLAYING' | 'LEVEL_CLEAR' | 'GAME_OVER'

interface Emitter {
  x: number; y: number
  frequency: number   // wave frequency (affects wavelength)
  amplitude: number
}

interface State {
  phase: Phase
  level: number
  score: number
  bestScore: number
  emitters: Emitter[]
  targetEmitters: Emitter[]  // the goal configuration
  matchPercent: number
  time: number               // simulation time (s) for animation
  dragging: number | null    // index of emitter being dragged
  dragOffsetX: number; dragOffsetY: number
  levelClearTime: number
  confirmTimer: number       // when player hasn't moved for 2s, auto-confirm
  lastMoveTime: number
}

const MAX_EMITTERS = 3
const GRID_RESOLUTION = 80  // pixels per cell for wave grid
const WAVE_SPEED = 200      // pixels/sec

let state: State = buildInitial()

function buildInitial(): State {
  return {
    phase: 'READY', level: 1, score: 0, bestScore: 0,
    emitters: [], targetEmitters: [],
    matchPercent: 0, time: 0,
    dragging: null, dragOffsetX: 0, dragOffsetY: 0,
    levelClearTime: 0, confirmTimer: 0, lastMoveTime: 0,
  }
}

// ── Level definitions ─────────────────────────────────────────────────────────

function buildLevel(level: number): { emitters: Emitter[], targets: Emitter[] } {
  const W = canvas.width
  const center = W / 2
  const pad = W * 0.15

  // Target configurations (pre-defined interesting patterns)
  const configs: Emitter[][] = [
    // Level 1: simple 2-emitter
    [
      { x: center - W * 0.2, y: center, frequency: 0.02, amplitude: 1 },
      { x: center + W * 0.2, y: center, frequency: 0.02, amplitude: 1 },
    ],
    // Level 2: 2-emitter vertical
    [
      { x: center, y: center - W * 0.2, frequency: 0.025, amplitude: 1 },
      { x: center, y: center + W * 0.2, frequency: 0.025, amplitude: 1 },
    ],
    // Level 3: different frequencies
    [
      { x: center - W * 0.15, y: center, frequency: 0.018, amplitude: 1 },
      { x: center + W * 0.15, y: center - W * 0.1, frequency: 0.03, amplitude: 0.8 },
    ],
    // Level 4: 3 emitters triangle
    [
      { x: center, y: center - W * 0.25, frequency: 0.022, amplitude: 1 },
      { x: center - W * 0.22, y: center + W * 0.15, frequency: 0.022, amplitude: 1 },
      { x: center + W * 0.22, y: center + W * 0.15, frequency: 0.022, amplitude: 1 },
    ],
    // Level 5: 3 emitters with mixed freq
    [
      { x: center - W * 0.25, y: center - W * 0.2, frequency: 0.02, amplitude: 1 },
      { x: center + W * 0.1, y: center - W * 0.05, frequency: 0.035, amplitude: 0.9 },
      { x: center - W * 0.05, y: center + W * 0.25, frequency: 0.015, amplitude: 1 },
    ],
    // Level 6
    [
      { x: center - W * 0.3, y: center, frequency: 0.028, amplitude: 1 },
      { x: center + W * 0.3, y: center, frequency: 0.028, amplitude: 1 },
      { x: center, y: center - W * 0.3, frequency: 0.018, amplitude: 0.7 },
    ],
    // Level 7
    [
      { x: pad, y: pad, frequency: 0.02, amplitude: 1 },
      { x: W - pad, y: W - pad, frequency: 0.02, amplitude: 1 },
      { x: W - pad, y: pad, frequency: 0.03, amplitude: 0.8 },
    ],
    // Level 8
    [
      { x: center - W * 0.25, y: center - W * 0.25, frequency: 0.025, amplitude: 1 },
      { x: center + W * 0.25, y: center - W * 0.25, frequency: 0.025, amplitude: 1 },
      { x: center, y: center + W * 0.3, frequency: 0.02, amplitude: 1.2 },
    ],
  ]

  const targetConfig = configs[Math.min(level - 1, configs.length - 1)]

  // Player starts with emitters roughly placed but not matching
  const playerEmitters: Emitter[] = targetConfig.map((t, i) => {
    const angle = (i / targetConfig.length) * Math.PI * 2
    const offset = W * 0.15
    return {
      x: Math.max(30, Math.min(W - 30, center + Math.cos(angle) * offset * 0.5)),
      y: Math.max(30, Math.min(W - 30, center + Math.sin(angle) * offset * 0.5)),
      frequency: t.frequency,
      amplitude: t.amplitude,
    }
  })

  return { emitters: playerEmitters, targets: targetConfig }
}

function startLevel(level: number): void {
  const { emitters, targets } = buildLevel(level)
  state.emitters = emitters
  state.targetEmitters = targets
  state.matchPercent = 0
  state.dragging = null
  state.levelClearTime = 0
  state.lastMoveTime = performance.now()
  state.phase = 'PLAYING'
  levelEl.textContent = String(level)
}

function startGame(): void {
  audio.start()
  state = buildInitial()
  state.bestScore = state.bestScore
  state.level = 1
  startLevel(1)
}

// ── Wave simulation ───────────────────────────────────────────────────────────

// Compute wave amplitude at (x,y) for a set of emitters at time t
function waveAt(emitters: Emitter[], x: number, y: number, t: number): number {
  let sum = 0
  for (const e of emitters) {
    const dx = x - e.x, dy = y - e.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    // Circular wave: amplitude * sin(2π * freq * dist - speed * t) / (dist^0.5 + 1)
    const phase = e.frequency * dist * 2 * Math.PI - t * 3
    const decay = 1 / (Math.sqrt(dist) * 0.1 + 1)
    sum += e.amplitude * Math.sin(phase) * decay
  }
  return sum
}

// Compare patterns: sample grid and compute match %
function computeMatchPercent(now: number): number {
  const W = canvas.width
  const step = GRID_RESOLUTION
  const t = now * 0.001

  let totalDiff = 0
  let count = 0

  for (let x = step / 2; x < W; x += step) {
    for (let y = step / 2; y < W; y += step) {
      const playerVal = waveAt(state.emitters, x, y, t)
      const targetVal = waveAt(state.targetEmitters, x, y, t)
      totalDiff += Math.abs(playerVal - targetVal)
      count++
    }
  }

  // Normalize: perfect match = 0 diff, worst = ~4 total diff per sample
  const avgDiff = totalDiff / count
  const match = Math.max(0, Math.round((1 - avgDiff / 2.5) * 100))
  return match
}

// ── Drag handling ─────────────────────────────────────────────────────────────

function hitTestEmitter(x: number, y: number): number {
  for (let i = 0; i < state.emitters.length; i++) {
    const e = state.emitters[i]
    const dx = x - e.x, dy = y - e.y
    if (Math.sqrt(dx * dx + dy * dy) <= 18) return i
  }
  return -1
}

canvas.addEventListener('mousedown', e => {
  if (state.phase !== 'PLAYING') return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left, y = e.clientY - rect.top
  const hit = hitTestEmitter(x, y)
  if (hit !== -1) {
    state.dragging = hit
    state.dragOffsetX = state.emitters[hit].x - x
    state.dragOffsetY = state.emitters[hit].y - y
  }
})

canvas.addEventListener('mousemove', e => {
  if (state.dragging === null || state.phase !== 'PLAYING') return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left, y = e.clientY - rect.top
  const W = canvas.width
  state.emitters[state.dragging].x = Math.max(20, Math.min(W - 20, x + state.dragOffsetX))
  state.emitters[state.dragging].y = Math.max(20, Math.min(W - 20, y + state.dragOffsetY))
  state.lastMoveTime = performance.now()
})

canvas.addEventListener('mouseup', () => { state.dragging = null })

// Touch drag
canvas.addEventListener('touchstart', e => {
  e.preventDefault()
  if (state.phase === 'READY' || state.phase === 'GAME_OVER') { startGame(); return }
  if (state.phase === 'LEVEL_CLEAR') { advanceLevel(); return }
  const rect = canvas.getBoundingClientRect()
  const t = e.touches[0]
  const x = t.clientX - rect.left, y = t.clientY - rect.top
  const hit = hitTestEmitter(x, y)
  if (hit !== -1) {
    state.dragging = hit
    state.dragOffsetX = state.emitters[hit].x - x
    state.dragOffsetY = state.emitters[hit].y - y
  }
}, { passive: false })

canvas.addEventListener('touchmove', e => {
  e.preventDefault()
  if (state.dragging === null) return
  const rect = canvas.getBoundingClientRect()
  const t = e.touches[0]
  const x = t.clientX - rect.left, y = t.clientY - rect.top
  const W = canvas.width
  state.emitters[state.dragging].x = Math.max(20, Math.min(W - 20, x + state.dragOffsetX))
  state.emitters[state.dragging].y = Math.max(20, Math.min(W - 20, y + state.dragOffsetY))
  state.lastMoveTime = performance.now()
}, { passive: false })

canvas.addEventListener('touchend', e => {
  e.preventDefault()
  state.dragging = null
})

canvas.addEventListener('click', e => {
  if (state.phase === 'READY' || state.phase === 'GAME_OVER') startGame()
  else if (state.phase === 'LEVEL_CLEAR') advanceLevel()
})

window.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && (state.phase === 'READY' || state.phase === 'GAME_OVER')) startGame()
  if ((e.key === 'Enter' || e.key === ' ') && state.phase === 'LEVEL_CLEAR') advanceLevel()
  if ((e.key === 'Enter' || e.key === ' ') && state.phase === 'PLAYING') confirmMatch()
})

function confirmMatch(): void {
  if (state.matchPercent >= 60) {
    const levelScore = state.matchPercent * 10
    state.score += levelScore
    scoreEl.textContent = String(state.score)
    reportScore(state.score)
    state.levelClearTime = performance.now()
    state.phase = 'LEVEL_CLEAR'
    audio.levelUp()
    if (state.score > state.bestScore) {
      state.bestScore = state.score
      saveBestScore(state.bestScore)
    }
  }
}

function advanceLevel(): void {
  state.level++
  if (state.level > 8) {
    reportGameOver(state.score)
    state.phase = 'GAME_OVER'
  } else {
    startLevel(state.level)
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

// Offscreen canvas for wave rendering
let waveCanvas: HTMLCanvasElement | null = null
let waveCtx: CanvasRenderingContext2D | null = null
let targetWaveCanvas: HTMLCanvasElement | null = null
let targetWaveCtx: CanvasRenderingContext2D | null = null

function ensureWaveCanvases(W: number): void {
  const step = 4  // render at 4px resolution for performance
  const wW = Math.ceil(W / step), wH = wW

  if (!waveCanvas || waveCanvas.width !== wW) {
    waveCanvas = document.createElement('canvas')
    waveCanvas.width = wW; waveCanvas.height = wH
    waveCtx = waveCanvas.getContext('2d')!
    targetWaveCanvas = document.createElement('canvas')
    targetWaveCanvas.width = wW; targetWaveCanvas.height = wH
    targetWaveCtx = targetWaveCanvas.getContext('2d')!
  }
}

function renderWaveToCanvas(
  wCtx: CanvasRenderingContext2D,
  emitters: Emitter[],
  W: number,
  t: number,
  alpha: number,
): void {
  const step = 4
  const wW = Math.ceil(W / step)
  const imageData = wCtx.createImageData(wW, wW)
  const data = imageData.data

  for (let px = 0; px < wW; px++) {
    for (let py = 0; py < wW; py++) {
      const x = px * step + step / 2
      const y = py * step + step / 2
      const val = waveAt(emitters, x, y, t)
      // Map -2..2 to color
      const normalized = (val + 2) / 4  // 0..1
      const idx = (py * wW + px) * 4

      if (val > 0) {
        // Constructive: bright blue
        const brightness = Math.min(255, normalized * 300)
        data[idx] = Math.round(brightness * 0.1)
        data[idx + 1] = Math.round(brightness * 0.5)
        data[idx + 2] = Math.round(brightness)
      } else {
        // Destructive: dark purple
        const brightness = Math.min(255, (1 - normalized) * 200)
        data[idx] = Math.round(brightness * 0.3)
        data[idx + 1] = 0
        data[idx + 2] = Math.round(brightness * 0.5)
      }
      data[idx + 3] = Math.round(alpha * 255)
    }
  }
  wCtx.putImageData(imageData, 0, 0)
}

function renderGame(now: number): void {
  const W = canvas.width, H = canvas.height
  ctx.fillStyle = '#000818'
  ctx.fillRect(0, 0, W, H)

  if (state.phase === 'READY') { drawReady(W, H); return }
  if (state.phase === 'GAME_OVER') { drawGameOver(W, H); return }

  state.time = now * 0.001
  const t = state.time

  ensureWaveCanvases(W)

  if (!waveCtx || !waveCanvas || !targetWaveCtx || !targetWaveCanvas) return

  // Render target pattern (ghost overlay, lower alpha)
  renderWaveToCanvas(targetWaveCtx, state.targetEmitters, W, t, 0.35)
  ctx.drawImage(targetWaveCanvas, 0, 0, W, H)

  // Render player pattern
  renderWaveToCanvas(waveCtx, state.emitters, W, t, 0.75)
  ctx.globalCompositeOperation = 'screen'
  ctx.drawImage(waveCanvas, 0, 0, W, H)
  ctx.globalCompositeOperation = 'source-over'

  // Draw emitters
  for (let i = 0; i < state.emitters.length; i++) {
    const e = state.emitters[i]
    const isDragging = state.dragging === i
    const pulse = 0.6 + 0.4 * Math.sin(now * 0.004 * (1 + i * 0.3))

    // Ripple circles
    for (let r = 0; r < 3; r++) {
      const rippleR = ((now * 0.05 * (1 + r * 0.5)) % 80) + 20
      ctx.beginPath()
      ctx.arc(e.x, e.y, rippleR, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(100,200,255,${0.15 * (1 - rippleR / 100)})`
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Core
    ctx.beginPath()
    ctx.arc(e.x, e.y, isDragging ? 16 : 12, 0, Math.PI * 2)
    ctx.fillStyle = isDragging ? 'rgba(255,200,50,0.9)' : `rgba(100,200,255,${pulse})`
    ctx.fill()
    ctx.strokeStyle = isDragging ? '#ffcc00' : 'white'
    ctx.lineWidth = 2
    ctx.stroke()

    // Label
    ctx.fillStyle = 'white'
    ctx.font = 'bold 11px Courier New'
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), e.x, e.y + 4)
  }

  // Target emitter positions (ghost markers)
  for (let i = 0; i < state.targetEmitters.length; i++) {
    const t2 = state.targetEmitters[i]
    ctx.beginPath()
    ctx.arc(t2.x, t2.y, 10, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,0,0.3)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 3])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Compute match
  const match = computeMatchPercent(now)
  state.matchPercent = match
  matchEl.textContent = String(match)

  // Match bar
  const barY = H - 50
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath(); ctx.roundRect(20, barY, W - 40, 14, 4); ctx.fill()
  const matchColor = match >= 80 ? '#00ff88' : match >= 60 ? '#88ff44' : match >= 40 ? '#ffcc00' : '#ff4444'
  ctx.fillStyle = matchColor
  if (match > 0) {
    ctx.beginPath(); ctx.roundRect(20, barY, (W - 40) * match / 100, 14, 4); ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '11px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText(`PATTERN MATCH: ${match}%  (need 60% — drag emitters to match the ghost pattern)`, W / 2, barY - 6)

  // Confirm button
  if (match >= 60) {
    ctx.fillStyle = 'rgba(0,80,0,0.8)'
    ctx.beginPath(); ctx.roundRect(W / 2 - 80, H - 30, 160, 26, 6); ctx.fill()
    ctx.strokeStyle = '#00ff88'
    ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = '#00ff88'
    ctx.font = 'bold 12px Courier New'
    ctx.textAlign = 'center'
    ctx.fillText('CONFIRM MATCH  [SPACE]', W / 2, H - 12)
  }

  if (state.phase === 'LEVEL_CLEAR') drawLevelClear(W, H)
}

function drawLevelClear(W: number, H: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#00ff88'
  ctx.font = `bold ${Math.min(36, W * 0.08)}px Courier New`
  ctx.fillText('PATTERN MATCHED!', W / 2, H / 2 - 40)
  ctx.fillStyle = '#88ccff'
  ctx.font = `${Math.min(18, W * 0.04)}px Courier New`
  ctx.fillText(`+${state.matchPercent * 10} points`, W / 2, H / 2 + 0)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `${Math.min(14, W * 0.032)}px Courier New`
  ctx.fillText('Click to continue', W / 2, H / 2 + 38)
}

function drawReady(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#88ccff'
  ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
  ctx.fillText('INTERFERENCE', W / 2, H / 2 - 100)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `${Math.min(13, W * 0.03)}px Courier New`
  const lines = [
    'Waves interfere constructively and destructively.',
    'A ghost target pattern is shown.',
    'Drag the emitter dots to match the pattern.',
    'When match is 60%+, press SPACE to confirm.',
    '8 levels of increasing complexity.',
    '',
    'Click to start',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 40 + i * 24))
}

function drawGameOver(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#88ccff'
  ctx.font = `bold ${Math.min(40, W * 0.09)}px Courier New`
  ctx.fillText(state.level > 8 ? 'ALL PATTERNS SOLVED!' : 'GAME OVER', W / 2, H / 2 - 70)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.min(28, W * 0.065)}px Courier New`
  ctx.fillText(`Score: ${state.score}`, W / 2, H / 2 - 10)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `${Math.min(15, W * 0.034)}px Courier New`
  ctx.fillText('Click to play again', W / 2, H / 2 + 50)
}

// ── Main loop ─────────────────────────────────────────────────────────────────

function loop(now: number): void {
  renderGame(now)
  requestAnimationFrame(loop)
}

async function boot(): Promise<void> {
  try {
    const { bestScore } = await initSDK()
    state.bestScore = bestScore
  } catch { /* standalone */ }
  requestAnimationFrame(loop)
}

void boot()
