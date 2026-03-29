import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const levelEl = document.getElementById('level-value') as HTMLSpanElement
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
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

muteBtn.addEventListener('click', () => {
  muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊'
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number }

interface Source {
  pos: Vec2
  type: 'hot' | 'cold'
}

interface Wall {
  x: number; y: number; w: number; h: number
}

interface TrailPoint {
  x: number; y: number; t: number
}

interface LevelDef {
  timeLimit: number
  walls: Wall[]
  targetRadius: number
}

// ── Level definitions ─────────────────────────────────────────────────────────

function makeLevels(W: number): LevelDef[] {
  return [
    { timeLimit: 30, walls: [], targetRadius: 30 },
    { timeLimit: 28, walls: [{ x: 0.3 * W, y: 0.2 * W, w: 0.08 * W, h: 0.4 * W }], targetRadius: 28 },
    { timeLimit: 26, walls: [
      { x: 0.2 * W, y: 0.5 * W, w: 0.3 * W, h: 0.06 * W },
      { x: 0.6 * W, y: 0.2 * W, w: 0.06 * W, h: 0.35 * W },
    ], targetRadius: 26 },
    { timeLimit: 24, walls: [
      { x: 0.1 * W, y: 0.3 * W, w: 0.06 * W, h: 0.45 * W },
      { x: 0.4 * W, y: 0.1 * W, w: 0.06 * W, h: 0.4 * W },
      { x: 0.65 * W, y: 0.5 * W, w: 0.25 * W, h: 0.06 * W },
    ], targetRadius: 24 },
    { timeLimit: 20, walls: [
      { x: 0.2 * W, y: 0.15 * W, w: 0.06 * W, h: 0.5 * W },
      { x: 0.5 * W, y: 0.35 * W, w: 0.06 * W, h: 0.5 * W },
      { x: 0.7 * W, y: 0.1 * W, w: 0.06 * W, h: 0.4 * W },
      { x: 0.3 * W, y: 0.65 * W, w: 0.3 * W, h: 0.06 * W },
    ], targetRadius: 22 },
  ]
}

// ── Game state ────────────────────────────────────────────────────────────────

type Phase = 'READY' | 'PLAYING' | 'LEVEL_CLEAR' | 'GAME_OVER'
type PlaceMode = 'hot' | 'cold' | 'none'

interface State {
  phase: Phase
  level: number        // 0-indexed
  score: number
  bestScore: number
  sources: Source[]
  hotLeft: number
  coldLeft: number
  particle: Vec2
  particleVel: Vec2
  trail: TrailPoint[]
  target: Vec2
  targetReached: boolean
  levelStartTime: number
  timeLimit: number
  walls: Wall[]
  targetRadius: number
  placeMode: PlaceMode
  levelClearTime: number
}

let state: State = buildInitial()

function buildInitial(): State {
  return {
    phase: 'READY', level: 0, score: 0, bestScore: 0,
    sources: [], hotLeft: 3, coldLeft: 3,
    particle: { x: 0, y: 0 }, particleVel: { x: 0, y: 0 },
    trail: [], target: { x: 0, y: 0 }, targetReached: false,
    levelStartTime: 0, timeLimit: 30, walls: [], targetRadius: 30,
    placeMode: 'hot', levelClearTime: 0,
  }
}

function startLevel(levelIdx: number): void {
  const W = canvas.width
  const defs = makeLevels(W)
  const def = defs[Math.min(levelIdx, defs.length - 1)]

  // Place particle in lower-left, target in upper-right area (away from walls)
  const margin = 60
  const px = margin + Math.random() * (W * 0.25)
  const py = W - margin - Math.random() * (W * 0.25)
  const tx = W - margin - Math.random() * (W * 0.25)
  const ty = margin + Math.random() * (W * 0.25)

  state.particle = { x: px, y: py }
  state.particleVel = { x: 0, y: 0 }
  state.target = { x: tx, y: ty }
  state.sources = []
  state.hotLeft = 3
  state.coldLeft = 3
  state.trail = []
  state.targetReached = false
  state.levelStartTime = performance.now()
  state.timeLimit = def.timeLimit
  state.walls = def.walls
  state.targetRadius = def.targetRadius
  state.placeMode = 'hot'
  state.phase = 'PLAYING'

  levelEl.textContent = String(levelIdx + 1)
}

function startGame(): void {
  audio.start()
  state = buildInitial()
  state.bestScore = state.bestScore
  state.level = 0
  state.score = 0
  scoreEl.textContent = '0'
  startLevel(0)
}

// ── Physics ───────────────────────────────────────────────────────────────────

const BROWNIAN_STRENGTH = 0.8
const DRIFT_STRENGTH = 0.06
const FRICTION = 0.94
const MAX_SPEED = 3.5
const SOURCE_RADIUS = 120

function computeTemperatureGradient(pos: Vec2): Vec2 {
  let gx = 0, gy = 0
  for (const s of state.sources) {
    const dx = pos.x - s.pos.x
    const dy = pos.y - s.pos.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 2) continue
    const influence = Math.min(1, SOURCE_RADIUS / (dist * dist * 0.1 + 1))
    const sign = s.type === 'hot' ? 1 : -1
    // Gradient points away from hot (particle drifts toward cold)
    gx += sign * (dx / dist) * influence
    gy += sign * (dy / dist) * influence
  }
  return { x: gx, y: gy }
}

function isInWall(x: number, y: number): boolean {
  for (const w of state.walls) {
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true
  }
  return false
}

let lastPhysicsTime = 0

function updatePhysics(now: number): void {
  if (state.phase !== 'PLAYING') return
  const dt = Math.min(50, now - lastPhysicsTime) / 16
  lastPhysicsTime = now

  const W = canvas.width

  // Brownian motion
  state.particleVel.x += (Math.random() - 0.5) * BROWNIAN_STRENGTH * dt
  state.particleVel.y += (Math.random() - 0.5) * BROWNIAN_STRENGTH * dt

  // Temperature gradient drift
  const grad = computeTemperatureGradient(state.particle)
  state.particleVel.x -= grad.x * DRIFT_STRENGTH * dt
  state.particleVel.y -= grad.y * DRIFT_STRENGTH * dt

  // Friction
  state.particleVel.x *= FRICTION
  state.particleVel.y *= FRICTION

  // Clamp speed
  const spd = Math.sqrt(state.particleVel.x ** 2 + state.particleVel.y ** 2)
  if (spd > MAX_SPEED) {
    state.particleVel.x = (state.particleVel.x / spd) * MAX_SPEED
    state.particleVel.y = (state.particleVel.y / spd) * MAX_SPEED
  }

  // Move
  let nx = state.particle.x + state.particleVel.x * dt
  let ny = state.particle.y + state.particleVel.y * dt

  // Wall collision
  const margin = 8
  if (isInWall(nx, ny)) {
    if (!isInWall(state.particle.x, ny)) {
      nx = state.particle.x
      state.particleVel.x *= -0.5
    } else if (!isInWall(nx, state.particle.y)) {
      ny = state.particle.y
      state.particleVel.y *= -0.5
    } else {
      nx = state.particle.x; ny = state.particle.y
      state.particleVel.x *= -0.5; state.particleVel.y *= -0.5
    }
  }

  // Canvas bounds
  nx = Math.max(margin, Math.min(W - margin, nx))
  ny = Math.max(margin, Math.min(W - margin, ny))
  if (nx <= margin || nx >= W - margin) state.particleVel.x *= -0.5
  if (ny <= margin || ny >= W - margin) state.particleVel.y *= -0.5

  state.particle = { x: nx, y: ny }

  // Trail
  state.trail.push({ x: nx, y: ny, t: now })
  if (state.trail.length > 200) state.trail.shift()

  // Check target reached
  const dx = nx - state.target.x, dy = ny - state.target.y
  if (Math.sqrt(dx * dx + dy * dy) < state.targetRadius) {
    const timeLeft = Math.max(0, state.timeLimit - (now - state.levelStartTime) / 1000)
    const levelScore = Math.round(timeLeft * 10)
    state.score += levelScore
    state.targetReached = true
    audio.levelUp()
    reportScore(state.score)
    scoreEl.textContent = String(state.score)

    if (state.score > state.bestScore) {
      state.bestScore = state.score
      bestEl.textContent = String(state.bestScore)
      saveBestScore(state.bestScore)
    }

    state.levelClearTime = now
    state.phase = 'LEVEL_CLEAR'
  }

  // Check time expired
  const elapsed = (now - state.levelStartTime) / 1000
  if (elapsed >= state.timeLimit && state.phase === 'PLAYING') {
    audio.death()
    reportGameOver(state.score)
    state.phase = 'GAME_OVER'
  }
}

// ── Click handling ────────────────────────────────────────────────────────────

function handleClick(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top

  if (state.phase === 'READY') { startGame(); return }
  if (state.phase === 'GAME_OVER') { startGame(); return }
  if (state.phase === 'LEVEL_CLEAR') {
    const now = performance.now()
    if (now - state.levelClearTime > 600) {
      state.level++
      if (state.level >= 5) {
        // Won all levels!
        audio.levelUp()
        reportGameOver(state.score)
        state.phase = 'GAME_OVER'
      } else {
        startLevel(state.level)
      }
    }
    return
  }
  if (state.phase !== 'PLAYING') return

  // Determine placement type based on current mode buttons drawn at bottom
  const W = canvas.width, H = canvas.height
  const btnY = H - 44, btnH = 36
  // Hot button: left side, cold button: right side
  if (y >= btnY && y <= btnY + btnH) {
    const hotX = W / 2 - 100, coldX = W / 2 + 10
    if (x >= hotX && x <= hotX + 90) { state.placeMode = 'hot'; audio.click(); return }
    if (x >= coldX && x <= coldX + 90) { state.placeMode = 'cold'; audio.click(); return }
  }

  // Place a source
  if (isInWall(x, y)) return
  if (state.placeMode === 'hot' && state.hotLeft > 0) {
    state.sources.push({ pos: { x, y }, type: 'hot' })
    state.hotLeft--
    audio.blip()
  } else if (state.placeMode === 'cold' && state.coldLeft > 0) {
    state.sources.push({ pos: { x, y }, type: 'cold' })
    state.coldLeft--
    audio.blip()
  }
}

canvas.addEventListener('click', e => handleClick(e.clientX, e.clientY))
canvas.addEventListener('touchend', e => {
  e.preventDefault()
  const t = e.changedTouches[0]
  handleClick(t.clientX, t.clientY)
})
window.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && (state.phase === 'READY' || state.phase === 'GAME_OVER')) startGame()
  if (e.key === 'h' || e.key === 'H') state.placeMode = 'hot'
  if (e.key === 'c' || e.key === 'C') state.placeMode = 'cold'
})

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderGame(now: number): void {
  const W = canvas.width, H = canvas.height
  ctx.fillStyle = '#0d0d1e'
  ctx.fillRect(0, 0, W, H)

  if (state.phase === 'READY') { drawReady(W, H); return }
  if (state.phase === 'GAME_OVER') { drawGameOver(W, H); return }

  updatePhysics(now)

  // Temperature field overlay (very subtle background)
  drawTemperatureField(W, H)

  // Walls
  ctx.fillStyle = '#334'
  for (const w of state.walls) {
    ctx.fillRect(w.x, w.y, w.w, w.h)
    ctx.strokeStyle = 'rgba(100,120,180,0.4)'
    ctx.lineWidth = 1
    ctx.strokeRect(w.x, w.y, w.w, w.h)
  }

  // Target zone
  const tpulse = 0.5 + 0.5 * Math.sin(now * 0.003)
  ctx.beginPath()
  ctx.arc(state.target.x, state.target.y, state.targetRadius, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(0, 255, 100, ${0.15 + 0.1 * tpulse})`
  ctx.fill()
  ctx.strokeStyle = `rgba(0, 255, 100, ${0.5 + 0.3 * tpulse})`
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = 'rgba(0,255,100,0.8)'
  ctx.font = 'bold 12px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText('TARGET', state.target.x, state.target.y + 4)

  // Sources
  for (const s of state.sources) {
    const isHot = s.type === 'hot'
    const color = isHot ? '#ff4422' : '#2244ff'
    const glow = isHot ? 'rgba(255,68,34,' : 'rgba(34,68,255,'

    ctx.beginPath()
    ctx.arc(s.pos.x, s.pos.y, SOURCE_RADIUS, 0, Math.PI * 2)
    const grad = ctx.createRadialGradient(s.pos.x, s.pos.y, 0, s.pos.x, s.pos.y, SOURCE_RADIUS)
    grad.addColorStop(0, `${glow}0.12)`)
    grad.addColorStop(1, `${glow}0)`)
    ctx.fillStyle = grad
    ctx.fill()

    ctx.beginPath()
    ctx.arc(s.pos.x, s.pos.y, 10, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = 'white'
    ctx.font = 'bold 12px Courier New'
    ctx.textAlign = 'center'
    ctx.fillText(isHot ? '🔥' : '❄️', s.pos.x, s.pos.y + 4)
  }

  // Particle trail
  for (let i = 1; i < state.trail.length; i++) {
    const p = state.trail[i], pp = state.trail[i - 1]
    const age = (now - p.t) / 2000
    if (age > 1) continue
    ctx.beginPath()
    ctx.moveTo(pp.x, pp.y)
    ctx.lineTo(p.x, p.y)
    ctx.strokeStyle = `rgba(180, 220, 255, ${(1 - age) * 0.5})`
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // Particle
  const p = state.particle
  const pGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14)
  pGrad.addColorStop(0, 'rgba(255,255,255,0.9)')
  pGrad.addColorStop(0.4, 'rgba(180,200,255,0.6)')
  pGrad.addColorStop(1, 'rgba(100,140,255,0)')
  ctx.beginPath()
  ctx.arc(p.x, p.y, 14, 0, Math.PI * 2)
  ctx.fillStyle = pGrad
  ctx.fill()
  ctx.beginPath()
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
  ctx.fillStyle = 'white'
  ctx.fill()

  // Timer bar
  const timeLeft = Math.max(0, state.timeLimit - (now - state.levelStartTime) / 1000)
  const timerFrac = timeLeft / state.timeLimit
  const barY = H - 8, barH = 5, barMargin = 20
  const barW = W - barMargin * 2
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fillRect(barMargin, barY - barH, barW, barH)
  const hue = Math.round(timerFrac * 120)
  ctx.fillStyle = `hsl(${hue}, 80%, 55%)`
  ctx.fillRect(barMargin, barY - barH, barW * timerFrac, barH)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '11px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText(`${timeLeft.toFixed(1)}s`, W / 2, barY - 8)

  // Source controls
  drawControls(W, H)

  // Level clear overlay
  if (state.phase === 'LEVEL_CLEAR') {
    drawLevelClear(W, H, now)
  }
}

function drawTemperatureField(W: number, H: number): void {
  if (state.sources.length === 0) return
  // Sample a grid and draw colored dots
  const step = 20
  for (let gx = 0; gx < W; gx += step) {
    for (let gy = 0; gy < H; gy += step) {
      let temp = 0
      for (const s of state.sources) {
        const dx = gx - s.pos.x, dy = gy - s.pos.y
        const d2 = dx * dx + dy * dy
        const sign = s.type === 'hot' ? 1 : -1
        temp += sign * Math.max(0, 1 - d2 / (SOURCE_RADIUS * SOURCE_RADIUS))
      }
      if (Math.abs(temp) < 0.05) continue
      const alpha = Math.min(0.1, Math.abs(temp) * 0.08)
      if (temp > 0) ctx.fillStyle = `rgba(255, 50, 0, ${alpha})`
      else ctx.fillStyle = `rgba(0, 80, 255, ${alpha})`
      ctx.fillRect(gx, gy, step, step)
    }
  }
}

function drawControls(W: number, H: number): void {
  const btnY = H - 44, btnH = 36
  const hotX = W / 2 - 100, coldX = W / 2 + 10

  // Hot button
  const isHot = state.placeMode === 'hot'
  ctx.fillStyle = isHot ? 'rgba(255,80,30,0.7)' : 'rgba(80,20,0,0.5)'
  ctx.strokeStyle = isHot ? '#ff6644' : 'rgba(200,80,30,0.3)'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.roundRect(hotX, btnY, 90, btnH, 6); ctx.fill(); ctx.stroke()
  ctx.fillStyle = 'white'
  ctx.font = `bold 12px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText(`🔥 HOT (${state.hotLeft})`, hotX + 45, btnY + 22)

  // Cold button
  const isCold = state.placeMode === 'cold'
  ctx.fillStyle = isCold ? 'rgba(30,80,255,0.7)' : 'rgba(0,20,80,0.5)'
  ctx.strokeStyle = isCold ? '#4466ff' : 'rgba(30,80,200,0.3)'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.roundRect(coldX, btnY, 90, btnH, 6); ctx.fill(); ctx.stroke()
  ctx.fillStyle = 'white'
  ctx.font = `bold 12px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText(`❄️ COLD (${state.coldLeft})`, coldX + 45, btnY + 22)
}

function drawLevelClear(W: number, H: number, now: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#00ff88'
  ctx.font = `bold ${Math.min(38, W * 0.08)}px Courier New`
  ctx.fillText('LEVEL CLEAR!', W / 2, H / 2 - 40)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = '16px Courier New'
  ctx.fillText('Click to continue', W / 2, H / 2 + 10)
}

function drawReady(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#88aaff'
  ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
  ctx.fillText('THERMAL DRIFT', W / 2, H / 2 - 100)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `${Math.min(14, W * 0.032)}px Courier New`
  const lines = [
    'A particle drifts via Brownian motion.',
    'Place HEAT sources to push it, COLD sinks to pull it.',
    'Guide the particle to the green target zone.',
    '3 heat + 3 cold sources per level. 5 levels total.',
    '',
    'Click to start',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 40 + i * 24))
}

function drawGameOver(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = state.level >= 5 ? '#ffd700' : '#ff4444'
  ctx.font = `bold ${Math.min(40, W * 0.09)}px Courier New`
  ctx.fillText(state.level >= 5 ? 'ALL LEVELS CLEAR!' : 'TIME IS UP!', W / 2, H / 2 - 60)
  ctx.fillStyle = '#88aaff'
  ctx.font = `bold ${Math.min(28, W * 0.065)}px Courier New`
  ctx.fillText(`Score: ${state.score}`, W / 2, H / 2 - 10)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `${Math.min(15, W * 0.034)}px Courier New`
  ctx.fillText('Click to play again', W / 2, H / 2 + 40)
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
  lastPhysicsTime = performance.now()
  requestAnimationFrame(loop)
}

void boot()
