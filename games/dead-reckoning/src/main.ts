import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const roundEl = document.getElementById('round-value') as HTMLSpanElement
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
muteBtn.addEventListener('click', () => { muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊' })

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'READY' | 'NAVIGATING' | 'REVEALED' | 'GAME_OVER'

interface Vec2 { x: number; y: number }

interface Wind {
  angle: number    // radians, direction wind is blowing toward
  speed: number    // pixels/sec
  changeAt: number // when to change
}

interface State {
  phase: Phase
  round: number
  score: number
  bestScore: number
  ship: Vec2          // actual ship position
  heading: number     // radians (0 = up/north)
  speed: number       // pixels/sec
  destination: Vec2
  initialBearing: number
  initialDistance: number
  wind: Wind
  trail: Vec2[]
  revealTime: number
  roundScore: number
  // Input
  keysHeld: Set<string>
  // Touch joystick
  touchJoystick: Vec2 | null
  // Fog of war: only shows vicinity
  fogRadius: number
}

const MAP_SIZE_FRAC = 0.95  // fraction of canvas
const FOG_RADIUS = 60
const SHIP_SPEED = 80
const WIND_INTERVAL = 15000  // ms
const VISIBILITY = FOG_RADIUS

let state: State = buildInitial()

function buildInitial(): State {
  return {
    phase: 'READY', round: 1, score: 0, bestScore: 0,
    ship: { x: 0, y: 0 }, heading: 0, speed: 0,
    destination: { x: 0, y: 0 },
    initialBearing: 0, initialDistance: 0,
    wind: { angle: Math.random() * Math.PI * 2, speed: 0, changeAt: 0 },
    trail: [], revealTime: 0, roundScore: 0,
    keysHeld: new Set(),
    touchJoystick: null,
    fogRadius: FOG_RADIUS,
  }
}

function startRound(round: number): void {
  const W = canvas.width
  const mapSize = W * MAP_SIZE_FRAC
  const margin = (W - mapSize) / 2 + 30

  // Place ship in one quadrant, destination in another
  const sx = margin + Math.random() * mapSize * 0.3
  const sy = margin + mapSize * 0.5 + Math.random() * mapSize * 0.3
  const dx = margin + mapSize * 0.5 + Math.random() * mapSize * 0.35
  const dy = margin + Math.random() * mapSize * 0.3

  const bearing = Math.atan2(dx - sx, -(dy - sy))  // 0 = north
  const dist = Math.sqrt((dx - sx) ** 2 + (dy - sy) ** 2)

  const windSpeed = round * 10 + Math.random() * 15  // increases per round

  state.ship = { x: sx, y: sy }
  state.heading = bearing + (Math.random() - 0.5) * 0.4  // start roughly toward dest
  state.speed = 0
  state.destination = { x: dx, y: dy }
  state.initialBearing = bearing
  state.initialDistance = dist
  state.wind = {
    angle: Math.random() * Math.PI * 2,
    speed: windSpeed,
    changeAt: performance.now() + WIND_INTERVAL,
  }
  state.trail = [{ x: sx, y: sy }]
  state.phase = 'NAVIGATING'
  state.round = round
  roundEl.textContent = String(round)
}

function startGame(): void {
  audio.start()
  state = buildInitial()
  state.bestScore = state.bestScore
  startRound(1)
}

// ── Physics ───────────────────────────────────────────────────────────────────

let lastPhysicsTime = 0

function updatePhysics(now: number): void {
  if (state.phase !== 'NAVIGATING') return
  const dt = Math.min(50, now - lastPhysicsTime) / 1000
  lastPhysicsTime = now

  const W = canvas.width
  const mapSize = W * MAP_SIZE_FRAC
  const margin = (W - mapSize) / 2

  // Wind changes
  if (now >= state.wind.changeAt) {
    state.wind.angle = Math.random() * Math.PI * 2
    state.wind.speed = state.round * 10 + Math.random() * 15
    state.wind.changeAt = now + WIND_INTERVAL
    audio.blip()
  }

  // Input
  const keys = state.keysHeld
  const tj = state.touchJoystick
  const turnSpeed = 2.0  // radians/sec
  const accel = 60
  const decel = 40

  if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') || (tj && tj.x < -0.3)) {
    state.heading -= turnSpeed * dt
  }
  if (keys.has('ArrowRight') || keys.has('d') || keys.has('D') || (tj && tj.x > 0.3)) {
    state.heading += turnSpeed * dt
  }
  if (keys.has('ArrowUp') || keys.has('w') || keys.has('W') || (tj && tj.y < -0.3)) {
    state.speed = Math.min(SHIP_SPEED, state.speed + accel * dt)
  } else if (keys.has('ArrowDown') || keys.has('s') || keys.has('S') || (tj && tj.y > 0.3)) {
    state.speed = Math.max(0, state.speed - accel * dt)
  } else {
    state.speed = Math.max(0, state.speed - decel * dt)
  }

  // Wind drift
  const windVx = Math.sin(state.wind.angle) * state.wind.speed
  const windVy = -Math.cos(state.wind.angle) * state.wind.speed

  // Ship velocity (heading-based) + wind drift
  const shipVx = Math.sin(state.heading) * state.speed
  const shipVy = -Math.cos(state.heading) * state.speed
  const totalVx = shipVx + windVx * 0.3
  const totalVy = shipVy + windVy * 0.3

  let nx = state.ship.x + totalVx * dt
  let ny = state.ship.y + totalVy * dt

  // Clamp to map
  nx = Math.max(margin + 10, Math.min(margin + mapSize - 10, nx))
  ny = Math.max(margin + 10, Math.min(margin + mapSize - 10, ny))
  state.ship = { x: nx, y: ny }

  // Trail (every 4px moved)
  const last = state.trail[state.trail.length - 1]
  if (Math.abs(nx - last.x) + Math.abs(ny - last.y) > 4) {
    state.trail.push({ x: nx, y: ny })
    if (state.trail.length > 500) state.trail.shift()
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────

window.addEventListener('keydown', e => {
  state.keysHeld.add(e.key)
  if ((e.key === ' ' || e.key === 'Enter') && state.phase === 'NAVIGATING') {
    dropAnchor()
  }
  if ((e.key === ' ' || e.key === 'Enter') && (state.phase === 'READY' || state.phase === 'GAME_OVER')) {
    startGame()
  }
  if ((e.key === ' ' || e.key === 'Enter') && state.phase === 'REVEALED') {
    advanceRound()
  }
})
window.addEventListener('keyup', e => state.keysHeld.delete(e.key))

// Touch joystick
let touchStartPos: Vec2 | null = null

canvas.addEventListener('touchstart', e => {
  e.preventDefault()
  const t = e.touches[0]
  const rect = canvas.getBoundingClientRect()
  touchStartPos = { x: t.clientX - rect.left, y: t.clientY - rect.top }
}, { passive: false })

canvas.addEventListener('touchmove', e => {
  e.preventDefault()
  if (!touchStartPos) return
  const t = e.touches[0]
  const rect = canvas.getBoundingClientRect()
  const dx = (t.clientX - rect.left - touchStartPos.x) / 40
  const dy = (t.clientY - rect.top - touchStartPos.y) / 40
  state.touchJoystick = { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) }
}, { passive: false })

canvas.addEventListener('touchend', e => {
  e.preventDefault()
  const now = performance.now()
  state.touchJoystick = null
  touchStartPos = null
  if (state.phase === 'READY' || state.phase === 'GAME_OVER') { startGame(); return }
  if (state.phase === 'NAVIGATING') { dropAnchor(); return }
  if (state.phase === 'REVEALED') { advanceRound(); return }
})

canvas.addEventListener('click', e => {
  if (state.phase === 'READY' || state.phase === 'GAME_OVER') startGame()
  else if (state.phase === 'REVEALED') advanceRound()
})

function dropAnchor(): void {
  const dest = state.destination
  const ship = state.ship
  const dx = ship.x - dest.x, dy = ship.y - dest.y
  const error = Math.sqrt(dx * dx + dy * dy)
  const roundScore = Math.max(0, Math.round(1000 - error * 10))
  state.roundScore = roundScore
  state.score += roundScore
  state.revealTime = performance.now()
  state.phase = 'REVEALED'
  scoreEl.textContent = String(state.score)
  reportScore(state.score)
  audio.score()
}

function advanceRound(): void {
  if (state.round >= 5) {
    if (state.score > state.bestScore) {
      state.bestScore = state.score
      bestEl.textContent = String(state.bestScore)
      saveBestScore(state.bestScore)
    }
    reportGameOver(state.score)
    state.phase = 'GAME_OVER'
  } else {
    startRound(state.round + 1)
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderGame(now: number): void {
  const W = canvas.width, H = canvas.height
  ctx.fillStyle = '#0a0a1a'
  ctx.fillRect(0, 0, W, H)

  if (state.phase === 'READY') { drawReady(W, H); return }
  if (state.phase === 'GAME_OVER') { drawGameOver(W, H); return }

  updatePhysics(now)

  const mapSize = W * MAP_SIZE_FRAC
  const mapX = (W - mapSize) / 2
  const mapY = (H - mapSize) / 2

  // Full map (only shown in REVEALED state)
  if (state.phase === 'REVEALED') {
    drawFullMap(mapX, mapY, mapSize)
  } else {
    // Dark ocean in fog
    ctx.fillStyle = '#050510'
    ctx.fillRect(mapX, mapY, mapSize, mapSize)

    // Draw only within fog of war circle
    ctx.save()
    ctx.beginPath()
    ctx.arc(state.ship.x, state.ship.y, VISIBILITY, 0, Math.PI * 2)
    ctx.clip()

    // Ocean texture in visible area
    ctx.fillStyle = '#0a1520'
    ctx.fillRect(mapX, mapY, mapSize, mapSize)
    drawOceanGrid(mapX, mapY, mapSize)

    ctx.restore()

    // Fog gradient
    const fGrad = ctx.createRadialGradient(state.ship.x, state.ship.y, VISIBILITY * 0.7, state.ship.x, state.ship.y, VISIBILITY * 1.2)
    fGrad.addColorStop(0, 'rgba(0,0,0,0)')
    fGrad.addColorStop(1, 'rgba(5,5,16,1)')
    ctx.fillStyle = fGrad
    ctx.beginPath()
    ctx.rect(mapX, mapY, mapSize, mapSize)
    ctx.arc(state.ship.x, state.ship.y, VISIBILITY * 1.2, 0, Math.PI * 2, true)
    ctx.fill()

    // Map border
    ctx.strokeStyle = 'rgba(100,150,200,0.3)'
    ctx.lineWidth = 1
    ctx.strokeRect(mapX, mapY, mapSize, mapSize)
  }

  // Trail (always visible)
  if (state.trail.length > 1) {
    ctx.beginPath()
    ctx.moveTo(state.trail[0].x, state.trail[0].y)
    for (const pt of state.trail) ctx.lineTo(pt.x, pt.y)
    ctx.strokeStyle = 'rgba(100,200,150,0.3)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // Ship
  drawShip(state.ship.x, state.ship.y, state.heading, state.speed)

  // HUD instruments
  drawInstruments(W, H, now)

  // Destination indicator (bearing + distance only, no position shown)
  drawDestinationHUD(W, H)

  // Revealed overlay
  if (state.phase === 'REVEALED') {
    // Draw destination marker
    const dest = state.destination
    ctx.beginPath()
    ctx.arc(dest.x, dest.y, 12, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,200,0,0.3)'
    ctx.fill()
    ctx.strokeStyle = '#ffcc00'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#ffcc00'
    ctx.font = 'bold 11px Courier New'
    ctx.textAlign = 'center'
    ctx.fillText('TARGET', dest.x, dest.y + 22)

    // Error line
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = '#ff8844'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(state.ship.x, state.ship.y)
    ctx.lineTo(dest.x, dest.y)
    ctx.stroke()
    ctx.setLineDash([])

    // Score overlay
    drawRevealedScore(W, H)
  }
}

function drawOceanGrid(mx: number, my: number, mz: number): void {
  // Subtle ocean grid
  ctx.strokeStyle = 'rgba(40,80,120,0.2)'
  ctx.lineWidth = 0.5
  const step = mz / 20
  for (let x = mx; x <= mx + mz; x += step) {
    ctx.beginPath(); ctx.moveTo(x, my); ctx.lineTo(x, my + mz); ctx.stroke()
  }
  for (let y = my; y <= my + mz; y += step) {
    ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(mx + mz, y); ctx.stroke()
  }
}

function drawFullMap(mx: number, my: number, mz: number): void {
  ctx.fillStyle = '#0a1520'
  ctx.fillRect(mx, my, mz, mz)
  drawOceanGrid(mx, my, mz)
  ctx.strokeStyle = 'rgba(100,150,200,0.4)'
  ctx.lineWidth = 1
  ctx.strokeRect(mx, my, mz, mz)
}

function drawShip(x: number, y: number, heading: number, speed: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading)

  const s = 10
  ctx.beginPath()
  ctx.moveTo(0, -s * 1.6)
  ctx.lineTo(s * 0.7, s)
  ctx.lineTo(0, s * 0.4)
  ctx.lineTo(-s * 0.7, s)
  ctx.closePath()
  ctx.fillStyle = '#88ddcc'
  ctx.fill()
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Speed lines
  if (speed > 20) {
    ctx.strokeStyle = `rgba(100,200,180,${(speed / SHIP_SPEED) * 0.5})`
    ctx.lineWidth = 1
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo((i - 1) * 5, s)
      ctx.lineTo((i - 1) * 5, s + 8 + speed / 10)
      ctx.stroke()
    }
  }

  ctx.restore()
}

function drawInstruments(W: number, H: number, now: number): void {
  const iX = W - 110, iY = H - 200

  // Compass
  const cx = iX + 40, cy = iY + 40
  ctx.beginPath()
  ctx.arc(cx, cy, 35, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(100,200,150,0.5)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Compass rose labels
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '9px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText('N', cx, cy - 22)
  ctx.fillText('S', cx, cy + 28)
  ctx.fillText('E', cx + 25, cy + 4)
  ctx.fillText('W', cx - 25, cy + 4)

  // Needle (heading)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(state.heading)
  ctx.beginPath()
  ctx.moveTo(0, -26)
  ctx.lineTo(4, 8)
  ctx.lineTo(0, 4)
  ctx.lineTo(-4, 8)
  ctx.closePath()
  ctx.fillStyle = '#ff4444'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0, 26)
  ctx.lineTo(4, -8)
  ctx.lineTo(0, -4)
  ctx.lineTo(-4, -8)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()

  // Heading degrees
  const deg = ((state.heading * 180 / Math.PI) % 360 + 360) % 360
  ctx.fillStyle = '#88ddcc'
  ctx.font = 'bold 10px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText(`${Math.round(deg)}°`, cx, cy + 50)

  // Speedometer
  const speedPct = state.speed / SHIP_SPEED
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.beginPath(); ctx.roundRect(iX, iY + 90, 80, 14, 4); ctx.fill()
  ctx.fillStyle = `hsl(${Math.round(speedPct * 120)}, 70%, 55%)`
  if (speedPct > 0) {
    ctx.beginPath(); ctx.roundRect(iX, iY + 90, 80 * speedPct, 14, 4); ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '10px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText(`SPD ${Math.round(state.speed)}`, iX + 40, iY + 102)

  // Wind indicator
  const wX = iX + 40, wY = iY + 130
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath(); ctx.arc(wX, wY, 22, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(180,180,255,0.4)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Wind arrow
  ctx.save()
  ctx.translate(wX, wY)
  ctx.rotate(state.wind.angle)
  ctx.strokeStyle = '#aaaaff'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 10); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(-5, -8); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(5, -8); ctx.stroke()
  ctx.restore()

  ctx.fillStyle = 'rgba(180,180,255,0.6)'
  ctx.font = '9px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText('WIND', wX, wY + 34)
  ctx.fillText(`${Math.round(state.wind.speed)}kt`, wX, wY + 44)
}

function drawDestinationHUD(W: number, H: number): void {
  // Show bearing and distance to destination
  const dest = state.destination
  const ship = state.ship
  const dx = dest.x - ship.x
  const dy = dest.y - ship.y
  const bearing = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360
  const dist = Math.sqrt(dx * dx + dy * dy)

  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.beginPath(); ctx.roundRect(16, H - 100, 130, 80, 8); ctx.fill()
  ctx.strokeStyle = 'rgba(100,200,100,0.3)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = '#88ddcc'
  ctx.font = 'bold 11px Courier New'
  ctx.textAlign = 'left'
  ctx.fillText('DESTINATION', 24, H - 82)

  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.font = '12px Courier New'
  ctx.fillText(`BRG: ${Math.round(bearing)}°`, 24, H - 62)
  ctx.fillText(`DST: ${Math.round(dist)}px`, 24, H - 44)

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '10px Courier New'
  ctx.fillText('SPACE = anchor', 24, H - 26)
}

function drawRevealedScore(W: number, H: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.beginPath()
  ctx.roundRect(W / 2 - 150, H / 2 - 60, 300, 130, 10)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,200,0,0.5)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  const dest = state.destination
  const ship = state.ship
  const error = Math.round(Math.sqrt((ship.x - dest.x) ** 2 + (ship.y - dest.y) ** 2))

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffcc44'
  ctx.font = 'bold 18px Courier New'
  ctx.fillText(`ANCHOR DROPPED`, W / 2, H / 2 - 34)
  ctx.fillStyle = '#ffffff'
  ctx.font = '14px Courier New'
  ctx.fillText(`Error: ${error}px  Points: ${state.roundScore}`, W / 2, H / 2 - 4)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px Courier New'
  ctx.fillText('Click / SPACE to continue', W / 2, H / 2 + 30)
  ctx.fillText(`Total: ${state.score}`, W / 2, H / 2 + 48)
}

function drawReady(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#88ddcc'
  ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
  ctx.fillText('DEAD RECKONING', W / 2, H / 2 - 100)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `${Math.min(13, W * 0.03)}px Courier New`
  const lines = [
    'Navigate a ship in dense fog.',
    'Only a compass, speedometer, and destination bearing.',
    'Wind drifts your ship — account for it.',
    'Press SPACE or tap to drop anchor.',
    'Fog lifts! Score = 1000 - (error × 10).',
    '5 rounds, wind gets stronger.',
    '',
    'WASD / Arrow Keys to sail   |   SPACE to anchor',
    '',
    'Click or ENTER to start',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 40 + i * 22))
}

function drawGameOver(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#88ddcc'
  ctx.font = `bold ${Math.min(40, W * 0.09)}px Courier New`
  ctx.fillText('VOYAGE COMPLETE', W / 2, H / 2 - 70)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.min(28, W * 0.065)}px Courier New`
  ctx.fillText(`Total Score: ${state.score}`, W / 2, H / 2 - 10)
  if (state.score === state.bestScore && state.score > 0) {
    ctx.fillStyle = '#ffd700'
    ctx.font = `${Math.min(18, W * 0.04)}px Courier New`
    ctx.fillText('NEW BEST!', W / 2, H / 2 + 26)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `${Math.min(15, W * 0.034)}px Courier New`
  ctx.fillText('Click to sail again', W / 2, H / 2 + 60)
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
