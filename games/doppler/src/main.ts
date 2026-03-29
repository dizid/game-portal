import {
  startAmbientTone,
  stopAmbientTone,
  updateDopplerTone,
  playItemPing,
  playWallBump,
  playLevelComplete,
  playGameOver,
  toggleMute,
  isMuted,
} from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Wall {
  x: number; y: number; w: number; h: number
}

interface Item {
  x: number; y: number
  collected: boolean
  pingTimer: number
}

interface TrailPoint {
  x: number; y: number; age: number
}

type Phase = 'intro' | 'playing' | 'levelcomplete' | 'gameover'

// ── Constants ──────────────────────────────────────────────────────────────────
const TILE = 40
const PLAYER_SPEED = 3.0
const TIME_LIMIT = 180  // 3 minutes per level
const ITEMS_PER_LEVEL = 10
const LEVELS = 5
const PING_INTERVAL = 2000  // ms

// Maze layouts per level (5 levels, 5 different maze configs)
// Each maze is 15x11 tiles, represented as a string (# = wall, . = open)
const MAZE_TEMPLATES = [
  // Level 1 — simple corridors
  [
    '###############',
    '#.............#',
    '#.###.#####.#.#',
    '#.#.....#...#.#',
    '#.#.###.#.###.#',
    '#...#.....#...#',
    '#.###.###.#.###',
    '#.#...#...#...#',
    '#.#.###.###.#.#',
    '#.............#',
    '###############',
  ],
  // Level 2 — more walls
  [
    '###############',
    '#.....#.......#',
    '#.###.#.#####.#',
    '#.#.#...#.....#',
    '#.#.#####.###.#',
    '#.#.......#...#',
    '#.#.#####.#.#.#',
    '#.#.#...#...#.#',
    '#.#.#.###.###.#',
    '#...#.........#',
    '###############',
  ],
  // Level 3 — zigzag
  [
    '###############',
    '#.............#',
    '#.#####.#####.#',
    '#.#...#.#...#.#',
    '#.#.#.#.#.#.#.#',
    '#...#...#.#...#',
    '#####.###.#####',
    '#...#.....#...#',
    '#.#.#######.#.#',
    '#.#...........#',
    '###############',
  ],
  // Level 4 — spiral-ish
  [
    '###############',
    '#.............#',
    '#.###########.#',
    '#.#...........#',
    '#.#.#########.#',
    '#.#.#.......#.#',
    '#.#.#.#####.#.#',
    '#.#.#.#...#.#.#',
    '#.#.#.#...#.#.#',
    '#...#.....#...#',
    '###############',
  ],
  // Level 5 — dense
  [
    '###############',
    '#.#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#.#',
    '#...........#.#',
    '#.#.#######.#.#',
    '#.#.#.......#.#',
    '#.#.#.#####.#.#',
    '#...#.....#...#',
    '#.###.###.###.#',
    '#.............#',
    '###############',
  ],
]

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let W = 600, H = 440

function resizeCanvas(): void {
  const container = document.getElementById('game-container')!
  W = container.clientWidth || window.innerWidth
  H = window.innerHeight
  canvas.width = W
  canvas.height = H
}

// ── State ──────────────────────────────────────────────────────────────────────
let phase: Phase = 'intro'
let level = 1
let walls: Wall[] = []
let items: Item[] = []
let trail: TrailPoint[] = []
let bestScore = 0
let totalScore = 0
let visionMode = false

let player = { x: 0, y: 0, vx: 0, vy: 0 }
let timeLeft = TIME_LIMIT
let itemsCollected = 0
let lastPingTime = 0

let keys: Set<string> = new Set()
let lastTime = 0
let pingTimers: Map<number, number> = new Map()

// Touch control
let touchStartX = 0, touchStartY = 0
let touchVx = 0, touchVy = 0
let isTouching = false

// Map offset (center map in canvas)
let mapOffX = 0, mapOffY = 0

// ── Maze building ──────────────────────────────────────────────────────────────
function buildLevel(lvl: number): void {
  walls = []
  items = []
  trail = []
  pingTimers.clear()
  itemsCollected = 0
  timeLeft = TIME_LIMIT

  const template = MAZE_TEMPLATES[(lvl - 1) % MAZE_TEMPLATES.length]
  const rows = template.length
  const cols = template[0].length

  mapOffX = (W - cols * TILE) / 2
  mapOffY = (H - rows * TILE) / 2

  // Parse walls
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (template[r][c] === '#') {
        walls.push({ x: mapOffX + c * TILE, y: mapOffY + r * TILE, w: TILE, h: TILE })
      }
    }
  }

  // Find open cells for player start and items
  const openCells: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (template[r][c] === '.') openCells.push([r, c])
    }
  }

  // Shuffle open cells
  for (let i = openCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [openCells[i], openCells[j]] = [openCells[j], openCells[i]]
  }

  // Player starts at first open cell
  const [pr, pc] = openCells[0]
  player.x = mapOffX + pc * TILE + TILE / 2
  player.y = mapOffY + pr * TILE + TILE / 2
  player.vx = 0; player.vy = 0

  // Place items in remaining open cells
  for (let i = 1; i < Math.min(ITEMS_PER_LEVEL + 1, openCells.length); i++) {
    const [ir, ic] = openCells[i]
    items.push({
      x: mapOffX + ic * TILE + TILE / 2,
      y: mapOffY + ir * TILE + TILE / 2,
      collected: false,
      pingTimer: 0,
    })
  }
}

// ── Collision detection ────────────────────────────────────────────────────────
function rectOverlap(ax: number, ay: number, aw: number, ah: number,
                      bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function movePlayer(dx: number, dy: number): void {
  const PLAYER_R = 10
  const px = player.x - PLAYER_R
  const py = player.y - PLAYER_R
  const ps = PLAYER_R * 2

  let newX = player.x + dx
  let newY = player.y + dy

  // X collision
  let hitWallX = false
  for (const w of walls) {
    if (rectOverlap(newX - PLAYER_R, py, ps, ps, w.x, w.y, w.w, w.h)) {
      if (dx > 0) newX = w.x - PLAYER_R
      else if (dx < 0) newX = w.x + w.w + PLAYER_R
      hitWallX = true
    }
  }

  // Y collision
  let hitWallY = false
  for (const w of walls) {
    if (rectOverlap(newX - PLAYER_R, newY - PLAYER_R, ps, ps, w.x, w.y, w.w, w.h)) {
      if (dy > 0) newY = w.y - PLAYER_R
      else if (dy < 0) newY = w.y + w.h + PLAYER_R
      hitWallY = true
    }
  }

  if (hitWallX || hitWallY) playWallBump()

  player.x = newX
  player.y = newY

  // Add to trail
  trail.push({ x: player.x, y: player.y, age: 0 })
  if (trail.length > 40) trail.shift()
  trail.forEach(p => p.age++)
}

// ── Doppler calculation ────────────────────────────────────────────────────────
function computeDopplerParams(): { velocityMag: number, approachingWall: boolean, wallDist: number, lateralBias: number } {
  const vx = player.vx
  const vy = player.vy
  const velocityMag = Math.sqrt(vx * vx + vy * vy) / PLAYER_SPEED

  // Find nearest wall in movement direction
  let minDist = 10  // in tiles
  let lateralBias = 0
  let approachingWall = false

  for (const w of walls) {
    const wCx = w.x + w.w / 2 - player.x
    const wCy = w.y + w.h / 2 - player.y
    const dist = Math.sqrt(wCx * wCx + wCy * wCy) / TILE

    if (dist < minDist) {
      minDist = dist
      // Is player moving toward this wall?
      const dot = (vx * wCx + vy * wCy)
      approachingWall = dot > 0
      // Lateral: is wall to the left or right of movement?
      const cross = vx * wCy - vy * wCx
      lateralBias = Math.sign(cross) * Math.min(1, Math.abs(cross) / (dist * TILE))
    }
  }

  return { velocityMag, approachingWall, wallDist: minDist, lateralBias }
}

// ── Game logic ─────────────────────────────────────────────────────────────────
function update(dt: number): void {
  if (phase !== 'playing') return

  timeLeft -= dt
  if (timeLeft <= 0) {
    timeLeft = 0
    gameOver()
    return
  }

  // Input
  let dx = 0, dy = 0
  if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= PLAYER_SPEED
  if (keys.has('ArrowRight') || keys.has('KeyD')) dx += PLAYER_SPEED
  if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= PLAYER_SPEED
  if (keys.has('ArrowDown') || keys.has('KeyS')) dy += PLAYER_SPEED

  // Normalize diagonal
  if (dx !== 0 && dy !== 0) {
    dx *= 0.707
    dy *= 0.707
  }

  // Touch input
  if (isTouching) {
    dx += touchVx * PLAYER_SPEED
    dy += touchVy * PLAYER_SPEED
  }

  player.vx = dx
  player.vy = dy

  if (dx !== 0 || dy !== 0) movePlayer(dx, dy)

  // Doppler audio
  const params = computeDopplerParams()
  updateDopplerTone(params.velocityMag, params.approachingWall, params.wallDist, params.lateralBias)

  // Item collection
  const COLLECT_DIST = 18
  for (const item of items) {
    if (item.collected) continue
    const dist = Math.sqrt((item.x - player.x) ** 2 + (item.y - player.y) ** 2)
    if (dist < COLLECT_DIST) {
      item.collected = true
      itemsCollected++
      playItemPing(0, true)
      totalScore += Math.ceil(timeLeft / 10)
      reportScore(totalScore)

      if (itemsCollected >= ITEMS_PER_LEVEL) {
        levelComplete()
        return
      }
    }
  }

  // Item pings (every 2 seconds, positional)
  const now = Date.now()
  if (now - lastPingTime > PING_INTERVAL) {
    lastPingTime = now
    // Ping nearest uncollected item
    let nearest: Item | null = null
    let nearestDist = Infinity
    for (const item of items) {
      if (item.collected) continue
      const dist = Math.sqrt((item.x - player.x) ** 2 + (item.y - player.y) ** 2)
      if (dist < nearestDist) { nearestDist = dist; nearest = item }
    }
    if (nearest) {
      const pan = (nearest.x - player.x) / (W / 2)
      playItemPing(Math.max(-1, Math.min(1, pan)), false)
    }
  }

  updateHUD()
}

function levelComplete(): void {
  phase = 'levelcomplete'
  stopAmbientTone()
  playLevelComplete()
  totalScore += 200  // level bonus

  if (level >= LEVELS) {
    setTimeout(() => gameOver(), 1500)
  } else {
    showLevelCompleteOverlay()
  }
}

function gameOver(): void {
  phase = 'gameover'
  stopAmbientTone()
  playGameOver()

  if (totalScore > bestScore) {
    bestScore = totalScore
    saveBestScore(bestScore)
  }

  reportGameOver(totalScore)
  showGameOverOverlay()
}

// ── Rendering ──────────────────────────────────────────────────────────────────
function draw(): void {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#080808'
  ctx.fillRect(0, 0, W, H)

  if (phase === 'intro') return

  if (visionMode) {
    // Debug wireframe — show walls faintly
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    for (const w of walls) {
      ctx.strokeRect(w.x, w.y, w.w, w.h)
    }

    // Items visible in vision mode
    for (const item of items) {
      if (item.collected) continue
      ctx.beginPath()
      ctx.arc(item.x, item.y, 6, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,200,0,0.4)'
      ctx.stroke()
    }
  }

  // Trail — shows recent movement path
  for (let i = 0; i < trail.length; i++) {
    const p = trail[i]
    const alpha = (1 - p.age / 40) * 0.4
    ctx.beginPath()
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${alpha})`
    ctx.fill()
  }

  // Player — white dot
  ctx.beginPath()
  ctx.arc(player.x, player.y, 10, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Player glow
  const grd = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 20)
  grd.addColorStop(0, 'rgba(255,255,255,0.2)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.arc(player.x, player.y, 20, 0, Math.PI * 2)
  ctx.fill()

  // Particles showing echo/doppler waves (when moving)
  if (Math.abs(player.vx) > 0.5 || Math.abs(player.vy) > 0.5) {
    const waveR = 15 + (Date.now() % 800) / 800 * 30
    const alpha = 0.15 * (1 - waveR / 45)
    ctx.beginPath()
    ctx.arc(player.x, player.y, waveR, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

// ── HUD ────────────────────────────────────────────────────────────────────────
function updateHUD(): void {
  const mins = Math.floor(timeLeft / 60)
  const secs = Math.floor(timeLeft % 60)
  setEl('hud-level', `${level}/${LEVELS}`)
  setEl('hud-items', `${itemsCollected}/${ITEMS_PER_LEVEL}`)
  setEl('hud-time', `${mins}:${secs.toString().padStart(2, '0')}`)
  setEl('hud-score', String(totalScore))
}

function setEl(id: string, text: string): void {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

// ── Overlays ───────────────────────────────────────────────────────────────────
const overlay = document.getElementById('overlay') as HTMLElement

function clearOverlay(): void {
  while (overlay.firstChild) overlay.removeChild(overlay.firstChild)
}

function makeOverlayBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.addEventListener('click', onClick)
  return btn
}

function makeEl(tag: string, text: string, style?: string): HTMLElement {
  const el = document.createElement(tag)
  el.textContent = text
  if (style) el.setAttribute('style', style)
  return el
}

function showLevelCompleteOverlay(): void {
  clearOverlay()
  overlay.appendChild(makeEl('h1', `LEVEL ${level} CLEAR`, 'color:#e5e7eb;letter-spacing:4px'))
  overlay.appendChild(makeEl('p', `Items: ${itemsCollected}/${ITEMS_PER_LEVEL}  |  Time left: ${Math.ceil(timeLeft)}s`))
  overlay.appendChild(makeEl('div', String(totalScore), 'font-size:clamp(28px,6vw,48px);color:#e5e7eb;font-weight:bold'))
  overlay.appendChild(makeOverlayBtn('NEXT LEVEL', () => {
    overlay.style.display = 'none'
    level++
    buildLevel(level)
    phase = 'playing'
    startAmbientTone()
    updateHUD()
  }))
  overlay.style.display = 'flex'
}

function showGameOverOverlay(): void {
  clearOverlay()
  const won = level >= LEVELS && itemsCollected >= ITEMS_PER_LEVEL
  overlay.appendChild(makeEl('h1', won ? 'COMPLETE' : 'TIME UP', 'color:#e5e7eb;letter-spacing:4px'))
  overlay.appendChild(makeEl('p', `Levels cleared: ${level}/${LEVELS}`))
  overlay.appendChild(makeEl('div', String(totalScore), 'font-size:clamp(32px,7vw,56px);color:#e5e7eb;font-weight:bold'))
  overlay.appendChild(makeEl('p', `Best: ${bestScore}`, 'color:#6b7280'))
  overlay.appendChild(makeOverlayBtn('PLAY AGAIN', () => {
    overlay.style.display = 'none'
    startNewGame()
  }))
  overlay.style.display = 'flex'
}

function startNewGame(): void {
  level = 1
  totalScore = 0
  buildLevel(level)
  phase = 'playing'
  startAmbientTone()
  updateHUD()
}

// ── Input ──────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  keys.add(e.code)

  if (e.code === 'KeyV') {
    visionMode = !visionMode
    const vBtn = document.getElementById('vision-btn')
    if (vBtn) vBtn.textContent = `V: ${visionMode ? 'ON' : 'OFF'}`
  }

  // Prevent page scroll
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
    e.preventDefault()
  }
})

window.addEventListener('keyup', (e) => { keys.delete(e.code) })

// Touch control
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  if (e.touches.length > 0) {
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
    isTouching = true
    touchVx = 0; touchVy = 0
  }
}, { passive: false })

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault()
  if (e.touches.length > 0 && isTouching) {
    const dx = e.touches[0].clientX - touchStartX
    const dy = e.touches[0].clientY - touchStartY
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 10) {
      touchVx = dx / len
      touchVy = dy / len
    } else {
      touchVx = 0; touchVy = 0
    }
  }
}, { passive: false })

canvas.addEventListener('touchend', () => { isTouching = false; touchVx = 0; touchVy = 0 })

document.getElementById('vision-btn')!.addEventListener('click', () => {
  visionMode = !visionMode
  const vBtn = document.getElementById('vision-btn')!
  vBtn.textContent = `V: ${visionMode ? 'ON' : 'OFF'}`
})

// ── Mute ───────────────────────────────────────────────────────────────────────
document.getElementById('mute-btn')!.addEventListener('click', () => {
  const m = toggleMute()
  ;(document.getElementById('mute-btn') as HTMLElement).textContent = m ? '\uD83D\uDD07' : '\uD83D\uDD0A'
})

// ── Start overlay ──────────────────────────────────────────────────────────────
document.getElementById('overlay-btn')!.addEventListener('click', () => {
  overlay.style.display = 'none'
  startNewGame()
})

// ── Main loop ──────────────────────────────────────────────────────────────────
function mainLoop(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1)
  lastTime = now
  update(dt)
  draw()
  requestAnimationFrame(mainLoop)
}

// ── Boot ───────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  try {
    const { bestScore: saved } = await initSDK('doppler')
    bestScore = saved
  } catch {
    // standalone
  }

  requestAnimationFrame((now) => { lastTime = now; requestAnimationFrame(mainLoop) })
}

void boot()
