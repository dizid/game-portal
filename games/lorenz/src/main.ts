import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const timeEl = document.getElementById('time-value') as HTMLSpanElement
const bestEl = document.getElementById('best-value') as HTMLSpanElement
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

// ── Lorenz system ─────────────────────────────────────────────────────────────

// Classic Lorenz parameters
const SIGMA = 10
const RHO = 28
const BETA = 8 / 3

interface Vec3 { x: number; y: number; z: number }

function lorenzDerivative(p: Vec3): Vec3 {
  return {
    x: SIGMA * (p.y - p.x),
    y: p.x * (RHO - p.z) - p.y,
    z: p.x * p.y - BETA * p.z,
  }
}

function lorenzStep(p: Vec3, dt: number): Vec3 {
  // RK4 integration
  const k1 = lorenzDerivative(p)
  const k2 = lorenzDerivative({ x: p.x + k1.x * dt / 2, y: p.y + k1.y * dt / 2, z: p.z + k1.z * dt / 2 })
  const k3 = lorenzDerivative({ x: p.x + k2.x * dt / 2, y: p.y + k2.y * dt / 2, z: p.z + k2.z * dt / 2 })
  const k4 = lorenzDerivative({ x: p.x + k3.x * dt, y: p.y + k3.y * dt, z: p.z + k3.z * dt })
  return {
    x: p.x + (k1.x + 2 * k2.x + 2 * k3.x + k4.x) * dt / 6,
    y: p.y + (k1.y + 2 * k2.y + 2 * k3.y + k4.y) * dt / 6,
    z: p.z + (k1.z + 2 * k2.z + 2 * k3.z + k4.z) * dt / 6,
  }
}

// Project 3D Lorenz space to 2D canvas
// Lorenz x/y/z spans roughly -20..20 / -25..25 / 0..50
function projectToCanvas(p: Vec3, W: number, H: number): { cx: number; cy: number } {
  const cx = W / 2 + (p.x / 25) * (W * 0.4)
  const cy = H / 2 + (p.z - 25) / 28 * -(H * 0.42)
  return { cx, cy }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'READY' | 'PLAYING' | 'GAME_OVER'

interface Target {
  pos3d: Vec3
  radius: number
  spawnTime: number
  collected: boolean
  glowing: boolean
}

interface TrailPoint {
  pos3d: Vec3
  t: number
}

interface State {
  phase: Phase
  pos: Vec3           // current position in Lorenz space
  basePos: Vec3       // reference trajectory (no input) for sensitivity meter
  trail: TrailPoint[]
  targets: Target[]
  score: number
  bestScore: number
  startTime: number
  gameTime: number    // 60s
  keysHeld: Set<string>
  sensitivity: number  // divergence from base trajectory
  nextTargetTime: number
  // Touch
  touchInput: Vec3
}

let state: State = buildInitial()

// Pre-bake a reference Lorenz trajectory for background rendering
const BG_TRACE: Vec3[] = []
function buildBackgroundTrace(): void {
  let p: Vec3 = { x: 0.1, y: 0, z: 0 }
  for (let i = 0; i < 8000; i++) {
    BG_TRACE.push({ ...p })
    p = lorenzStep(p, 0.005)
  }
}

function buildInitial(): State {
  return {
    phase: 'READY',
    pos: { x: 0.1, y: 0, z: 10 },
    basePos: { x: 0.1, y: 0, z: 10 },
    trail: [],
    targets: [],
    score: 0, bestScore: 0,
    startTime: 0,
    gameTime: 60,
    keysHeld: new Set(),
    sensitivity: 0,
    nextTargetTime: 0,
    touchInput: { x: 0, y: 0, z: 0 },
  }
}

function startGame(): void {
  audio.start()
  const newState = buildInitial()
  newState.bestScore = state.bestScore
  newState.phase = 'PLAYING'
  newState.startTime = performance.now()
  newState.nextTargetTime = performance.now() + 1500
  // Start near a nice point on the attractor
  newState.pos = { x: 1, y: 1, z: 25 }
  newState.basePos = { x: 1, y: 1, z: 25 }
  state = newState
  scoreEl.textContent = '0'
}

// ── Spawn targets ─────────────────────────────────────────────────────────────

function spawnTarget(now: number): void {
  // Pick a point near the current attractor trace
  if (BG_TRACE.length === 0) return
  const traceIdx = Math.floor(Math.random() * BG_TRACE.length)
  const tp = BG_TRACE[traceIdx]

  // Add small random offset so targets aren't exactly on trace
  state.targets.push({
    pos3d: {
      x: tp.x + (Math.random() - 0.5) * 4,
      y: tp.y + (Math.random() - 0.5) * 4,
      z: tp.z + (Math.random() - 0.5) * 3,
    },
    radius: 18,
    spawnTime: now,
    collected: false,
    glowing: true,
  })

  // Limit targets on screen
  if (state.targets.length > 5) state.targets.shift()

  // Next spawn: 2-4s
  state.nextTargetTime = now + 2000 + Math.random() * 2000
}

// ── Physics ───────────────────────────────────────────────────────────────────

const LORENZ_DT = 0.006
const FORCE_SCALE = 0.4

let lastPhysicsTime = 0

function updatePhysics(now: number): void {
  if (state.phase !== 'PLAYING') return

  const dt = Math.min(50, now - lastPhysicsTime) / 1000
  lastPhysicsTime = now

  const W = canvas.width
  const stepsPerFrame = Math.max(1, Math.round(dt / LORENZ_DT))

  const keys = state.keysHeld
  const ti = state.touchInput

  // Force to apply
  let fx = 0, fy = 0, fz = 0
  if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') || ti.x < -0.3) fx -= FORCE_SCALE
  if (keys.has('ArrowRight') || keys.has('d') || keys.has('D') || ti.x > 0.3) fx += FORCE_SCALE
  if (keys.has('ArrowUp') || keys.has('w') || keys.has('W') || ti.y < -0.3) fz += FORCE_SCALE
  if (keys.has('ArrowDown') || keys.has('s') || keys.has('S') || ti.y > 0.3) fz -= FORCE_SCALE

  for (let step = 0; step < stepsPerFrame; step++) {
    // Advance main position with force nudge
    const deriv = lorenzDerivative(state.pos)
    const nudged: Vec3 = {
      x: state.pos.x + (deriv.x + fx) * LORENZ_DT,
      y: state.pos.y + (deriv.y + fy) * LORENZ_DT,
      z: state.pos.z + (deriv.z + fz) * LORENZ_DT,
    }
    state.pos = nudged

    // Advance base (reference) with no force
    state.basePos = lorenzStep(state.basePos, LORENZ_DT)
  }

  // Compute sensitivity (divergence from reference)
  const dx = state.pos.x - state.basePos.x
  const dy = state.pos.y - state.basePos.y
  const dz = state.pos.z - state.basePos.z
  state.sensitivity = Math.min(100, Math.sqrt(dx * dx + dy * dy + dz * dz) * 5)

  // Trail
  state.trail.push({ pos3d: { ...state.pos }, t: now })
  if (state.trail.length > 300) state.trail.shift()

  // Spawn targets
  if (now >= state.nextTargetTime) spawnTarget(now)

  // Check target collection
  for (const target of state.targets) {
    if (target.collected) continue
    const tdx = state.pos.x - target.pos3d.x
    const tdy = state.pos.y - target.pos3d.y
    const tdz = state.pos.z - target.pos3d.z
    const dist3d = Math.sqrt(tdx * tdx + tdy * tdy + tdz * tdz)

    // Convert 3D radius to approximate screen radius
    if (dist3d < 5) {
      target.collected = true
      state.score++
      scoreEl.textContent = String(state.score)
      reportScore(state.score)
      audio.score()
    }
  }

  // Clean up old collected targets
  state.targets = state.targets.filter(t => !t.collected)

  // Check time
  const elapsed = (now - state.startTime) / 1000
  const timeLeft = Math.max(0, 60 - elapsed)
  timeEl.textContent = String(Math.ceil(timeLeft))

  if (timeLeft <= 0) {
    endGame()
  }
}

function endGame(): void {
  state.phase = 'GAME_OVER'
  if (state.score > state.bestScore) {
    state.bestScore = state.score
    bestEl.textContent = String(state.bestScore)
    saveBestScore(state.bestScore)
  }
  reportGameOver(state.score)
  audio.death()
}

// ── Input ─────────────────────────────────────────────────────────────────────

window.addEventListener('keydown', e => {
  state.keysHeld.add(e.key)
  if ((e.key === 'Enter' || e.key === ' ') && (state.phase === 'READY' || state.phase === 'GAME_OVER')) startGame()
})
window.addEventListener('keyup', e => state.keysHeld.delete(e.key))

// Touch joystick
let touchStart: { x: number; y: number } | null = null
canvas.addEventListener('touchstart', e => {
  e.preventDefault()
  if (state.phase === 'READY' || state.phase === 'GAME_OVER') { startGame(); return }
  const t = e.touches[0]
  const rect = canvas.getBoundingClientRect()
  touchStart = { x: t.clientX - rect.left, y: t.clientY - rect.top }
}, { passive: false })
canvas.addEventListener('touchmove', e => {
  e.preventDefault()
  if (!touchStart) return
  const t = e.touches[0]
  const rect = canvas.getBoundingClientRect()
  const dx = (t.clientX - rect.left - touchStart.x) / 50
  const dy = (t.clientY - rect.top - touchStart.y) / 50
  state.touchInput = { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)), z: 0 }
}, { passive: false })
canvas.addEventListener('touchend', e => {
  e.preventDefault()
  touchStart = null
  state.touchInput = { x: 0, y: 0, z: 0 }
})
canvas.addEventListener('click', e => {
  if (state.phase === 'READY' || state.phase === 'GAME_OVER') startGame()
})

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderGame(now: number): void {
  const W = canvas.width, H = canvas.height

  // Fade background (don't clear completely — creates trail effect)
  ctx.fillStyle = 'rgba(0, 0, 16, 0.12)'
  ctx.fillRect(0, 0, W, H)

  if (state.phase === 'READY') { ctx.fillStyle = 'rgba(0,0,16,0.8)'; ctx.fillRect(0,0,W,H); drawReady(W, H); return }
  if (state.phase === 'GAME_OVER') { ctx.fillStyle = 'rgba(0,0,16,0.8)'; ctx.fillRect(0,0,W,H); drawGameOver(W, H); return }

  updatePhysics(now)

  // Background trace (faint)
  if (BG_TRACE.length > 1) {
    ctx.beginPath()
    const first = projectToCanvas(BG_TRACE[0], W, H)
    ctx.moveTo(first.cx, first.cy)
    for (let i = 1; i < BG_TRACE.length; i += 4) {
      const pp = projectToCanvas(BG_TRACE[i], W, H)
      ctx.lineTo(pp.cx, pp.cy)
    }
    ctx.strokeStyle = 'rgba(60, 30, 100, 0.06)'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }

  // Player trail
  if (state.trail.length > 1) {
    for (let i = 1; i < state.trail.length; i++) {
      const p1 = projectToCanvas(state.trail[i - 1].pos3d, W, H)
      const p2 = projectToCanvas(state.trail[i].pos3d, W, H)
      const age = (now - state.trail[i].t) / 2000
      if (age > 1) continue
      const hue = (now * 0.05 + i * 0.5) % 360
      ctx.beginPath()
      ctx.moveTo(p1.cx, p1.cy)
      ctx.lineTo(p2.cx, p2.cy)
      ctx.strokeStyle = `hsla(${hue}, 80%, 65%, ${(1 - age) * 0.8})`
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }

  // Targets
  for (const target of state.targets) {
    if (target.collected) continue
    const tp = projectToCanvas(target.pos3d, W, H)
    const age = (now - target.spawnTime) / 1000
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.004)

    // Glow
    const gGrad = ctx.createRadialGradient(tp.cx, tp.cy, 0, tp.cx, tp.cy, target.radius * 2)
    gGrad.addColorStop(0, `rgba(255, 220, 50, ${0.3 * pulse})`)
    gGrad.addColorStop(1, 'rgba(255,200,0,0)')
    ctx.beginPath(); ctx.arc(tp.cx, tp.cy, target.radius * 2, 0, Math.PI * 2)
    ctx.fillStyle = gGrad; ctx.fill()

    // Core
    ctx.beginPath(); ctx.arc(tp.cx, tp.cy, target.radius * 0.5, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255, 230, 50, ${0.7 + 0.3 * pulse})`
    ctx.fill()
    ctx.strokeStyle = '#ffdd00'; ctx.lineWidth = 1.5; ctx.stroke()
  }

  // Player dot
  const playerCanvas = projectToCanvas(state.pos, W, H)
  const pcx = playerCanvas.cx, pcy = playerCanvas.cy
  const playerGrad = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, 12)
  playerGrad.addColorStop(0, 'rgba(255,255,255,1)')
  playerGrad.addColorStop(0.5, 'rgba(180,100,255,0.8)')
  playerGrad.addColorStop(1, 'rgba(100,0,200,0)')
  ctx.beginPath(); ctx.arc(pcx, pcy, 12, 0, Math.PI * 2)
  ctx.fillStyle = playerGrad; ctx.fill()
  ctx.beginPath(); ctx.arc(pcx, pcy, 4, 0, Math.PI * 2)
  ctx.fillStyle = 'white'; ctx.fill()

  // Sensitivity meter
  const sensW = 120, sensH = 8
  const sensX = W / 2 - sensW / 2, sensY = H - 30
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath(); ctx.roundRect(sensX, sensY, sensW, sensH, 3); ctx.fill()
  const sensColor = state.sensitivity < 30 ? '#44ff88' : state.sensitivity < 70 ? '#ffcc44' : '#ff4444'
  ctx.fillStyle = sensColor
  if (state.sensitivity > 0) {
    ctx.beginPath(); ctx.roundRect(sensX, sensY, sensW * state.sensitivity / 100, sensH, 3); ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '10px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText(`CHAOS: ${Math.round(state.sensitivity)}%`, W / 2, sensY - 4)

  // Controls hint
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.font = '10px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText('WASD/Arrows to nudge the attractor — collect glowing targets', W / 2, H - 10)
}

function drawReady(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#cc88ff'
  ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
  ctx.fillText('LORENZ', W / 2, H / 2 - 100)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `${Math.min(13, W * 0.03)}px Courier New`
  const lines = [
    'A dot follows the chaotic Lorenz attractor.',
    'Glowing targets appear along the path.',
    'Use WASD / Arrow Keys to nudge the dot.',
    'Small nudges = BIG divergence (butterfly effect).',
    'Collect as many targets as possible in 60 seconds.',
    '',
    'Click or ENTER to start',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 40 + i * 24))
}

function drawGameOver(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#cc88ff'
  ctx.font = `bold ${Math.min(40, W * 0.09)}px Courier New`
  ctx.fillText('CHAOS WINS', W / 2, H / 2 - 70)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.min(28, W * 0.065)}px Courier New`
  ctx.fillText(`Targets: ${state.score}`, W / 2, H / 2 - 10)
  if (state.score === state.bestScore && state.score > 0) {
    ctx.fillStyle = '#ffd700'
    ctx.font = `${Math.min(18, W * 0.04)}px Courier New`
    ctx.fillText('NEW BEST!', W / 2, H / 2 + 26)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `${Math.min(15, W * 0.034)}px Courier New`
  ctx.fillText('Click to attract again', W / 2, H / 2 + 60)
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
    bestEl.textContent = String(bestScore)
  } catch { /* standalone */ }
  buildBackgroundTrace()
  lastPhysicsTime = performance.now()
  requestAnimationFrame(loop)
}

void boot()
