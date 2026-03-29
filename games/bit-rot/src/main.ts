import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas & HUD ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hudItems = document.getElementById('hud-items')!
const hudScore = document.getElementById('hud-score')!
const hudDecay = document.getElementById('hud-decay')!

const GRID = 10
let CELL = 48
let OFFSET_X = 0
let OFFSET_Y = 0

function resize(): void {
  const container = canvas.parentElement!
  const size = Math.min(container.clientWidth, container.clientHeight, 560)
  canvas.width = size
  canvas.height = size
  CELL = Math.floor(size / (GRID + 1))
  OFFSET_X = Math.floor((size - GRID * CELL) / 2)
  OFFSET_Y = Math.floor((size - GRID * CELL) / 2)
}
resize()
window.addEventListener('resize', () => { resize(); draw() })

// ── Types ──────────────────────────────────────────────────────────────────────

type CellType = 'empty' | 'wall'

interface Vec2 { row: number; col: number }

interface GlitchBlock {
  x: number; y: number; w: number; h: number
  r: number; g: number; b: number
  life: number; maxLife: number
}

// ── Game state ─────────────────────────────────────────────────────────────────

type GameState = 'start' | 'playing' | 'gameover'

let state: GameState = 'start'
let grid: CellType[][] = []
let player: Vec2 = { row: 1, col: 1 }
let items: Vec2[] = []       // yellow pickups
let repairs: Vec2[] = []     // blue pickups
let exit: Vec2 = { row: 8, col: 8 }

let itemsCollected = 0
let realScore = 0
let displayScore = 0          // corrupted display
let bestScore = 0
let startTime = 0
let decayLevel = 0            // 0..1
let repairUntil = 0           // timestamp when repair wears off
let lastTime = 0

// Glitch system
const glitchBlocks: GlitchBlock[] = []
let glitchTimer = 0
const MAX_GLITCH = 120

// Input corruption
const DIRS = [[-1,0],[1,0],[0,-1],[0,1]]
const DIR_KEYS: Record<string, number> = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, w: 0, s: 1, a: 2, d: 3 }

// Color corruption
let colorShift = 0

// Game messages
let message = ''
let messageTimer = 0

// ── Map generation ─────────────────────────────────────────────────────────────

const MAP = [
  '##########',
  '#........#',
  '#.##.###.#',
  '#.#......#',
  '#.#.####.#',
  '#........#',
  '#.####.#.#',
  '#......#.#',
  '#.###....#',
  '##########',
]

function buildGrid(): void {
  grid = MAP.map(row => row.split('').map(ch => ch === '#' ? 'wall' : 'empty'))
}

function getFloorCells(): Vec2[] {
  const cells: Vec2[] = []
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r][c] === 'empty') cells.push({ row: r, col: c })
    }
  }
  return cells
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function startGame(): void {
  buildGrid()
  player = { row: 1, col: 1 }
  exit = { row: 8, col: 8 }

  const floors = shuffle(getFloorCells().filter(c =>
    !(c.row === 1 && c.col === 1) && !(c.row === 8 && c.col === 8)
  ))

  items = floors.slice(0, 10)
  repairs = floors.slice(10, 13)

  itemsCollected = 0
  realScore = 0
  displayScore = 0
  decayLevel = 0
  repairUntil = 0
  glitchBlocks.length = 0
  glitchTimer = 0
  colorShift = 0
  message = ''
  messageTimer = 0
  startTime = performance.now()
  state = 'playing'
  audio.start()
}

// ── Decay system ───────────────────────────────────────────────────────────────

function updateDecay(now: number): void {
  const elapsed = (now - startTime) / 1000
  const repaired = now < repairUntil
  const rawDecay = Math.min(1, elapsed / 180) // full decay at 3 minutes
  decayLevel = repaired ? Math.max(0, rawDecay - 0.4) : rawDecay

  // Color shift
  colorShift = decayLevel * 0.5

  // Glitch blocks
  glitchTimer++
  const spawnRate = Math.floor(60 / (1 + decayLevel * 8))
  if (glitchTimer >= spawnRate && glitchBlocks.length < MAX_GLITCH) {
    glitchTimer = 0
    const count = Math.floor(1 + decayLevel * 4)
    for (let i = 0; i < count; i++) {
      glitchBlocks.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        w: 4 + Math.random() * 20,
        h: 2 + Math.random() * 8,
        r: Math.floor(Math.random() * 256),
        g: Math.floor(Math.random() * 256),
        b: Math.floor(Math.random() * 256),
        life: 10 + Math.random() * 30,
        maxLife: 10 + Math.random() * 30,
      })
    }
  }

  // Age glitch blocks
  for (let i = glitchBlocks.length - 1; i >= 0; i--) {
    glitchBlocks[i].life--
    if (glitchBlocks[i].life <= 0) glitchBlocks.splice(i, 1)
  }

  // Corrupt display score
  if (Math.random() < decayLevel * 0.3) {
    displayScore = realScore + Math.floor((Math.random() - 0.3) * decayLevel * 500)
  } else {
    displayScore = realScore
  }

  hudDecay.textContent = `${Math.floor(decayLevel * 100)}`
  hudItems.textContent = `${itemsCollected}`
  // Display corrupted score
  const shown = Math.max(0, displayScore)
  hudScore.textContent = decayLevel > 0.6 && Math.random() < 0.1 ? '?????' : `${shown}`
}

// ── Input ──────────────────────────────────────────────────────────────────────

function getCorruptedDir(intended: number): number {
  // With increasing probability, map to wrong direction
  if (Math.random() < decayLevel * 0.35) {
    return (intended + 1 + Math.floor(Math.random() * 3)) % 4
  }
  return intended
}

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (state !== 'playing') return
  if (e.key in DIR_KEYS) {
    e.preventDefault()
    movePlayer(DIR_KEYS[e.key])
  }
})

// Touch swipe
let touchStart: { x: number; y: number } | null = null
canvas.addEventListener('touchstart', (e: TouchEvent) => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }
}, { passive: true })
canvas.addEventListener('touchend', (e: TouchEvent) => {
  if (!touchStart || state !== 'playing') return
  const dx = e.changedTouches[0].clientX - touchStart.x
  const dy = e.changedTouches[0].clientY - touchStart.y
  touchStart = null
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
  if (Math.abs(dx) > Math.abs(dy)) {
    movePlayer(dx > 0 ? 3 : 2)
  } else {
    movePlayer(dy > 0 ? 1 : 0)
  }
}, { passive: true })

function movePlayer(intended: number): void {
  const dir = getCorruptedDir(intended)
  const [dr, dc] = DIRS[dir]
  const nr = player.row + dr
  const nc = player.col + dc
  if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) return
  if (grid[nr][nc] === 'wall') return

  player = { row: nr, col: nc }
  audio.blip()
  checkPickups()
}

function checkPickups(): void {
  // Check items
  const iIdx = items.findIndex(i => i.row === player.row && i.col === player.col)
  if (iIdx !== -1) {
    items.splice(iIdx, 1)
    itemsCollected++
    realScore += 100
    audio.score()
    showMessage('+100')
  }

  // Check repairs
  const rIdx = repairs.findIndex(r => r.row === player.row && r.col === player.col)
  if (rIdx !== -1) {
    repairs.splice(rIdx, 1)
    repairUntil = performance.now() + 5000
    audio.powerup()
    showMessage('REPAIR! -40% decay for 5s')
  }

  // Check exit
  if (player.row === exit.row && player.col === exit.col && itemsCollected >= 10) {
    const elapsed = (performance.now() - startTime) / 1000
    const timeBonus = Math.max(0, Math.floor((180 - elapsed) * 2))
    realScore += timeBonus
    audio.levelUp()
    state = 'gameover'
    if (realScore > bestScore) {
      bestScore = realScore
      saveBestScore(bestScore)
    }
    reportGameOver(realScore)
  }
}

function showMessage(msg: string): void {
  message = msg
  messageTimer = 120
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function hslShift(base: string, dh: number): string {
  // Simplified: just return the base with slight modification
  return base
}

function draw(): void {
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  // Background — darkens with decay
  const bgL = Math.floor(10 + decayLevel * 5)
  ctx.fillStyle = `rgb(${bgL},${bgL},${Math.floor(bgL * 1.2)})`
  ctx.fillRect(0, 0, W, H)

  // Draw grid
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const x = OFFSET_X + c * CELL
      const y = OFFSET_Y + r * CELL

      if (grid[r][c] === 'wall') {
        // Walls shift color with decay
        const hue = Math.floor(220 + colorShift * 60)
        ctx.fillStyle = `hsl(${hue}, 30%, 25%)`
        ctx.fillRect(x, y, CELL, CELL)
        // Grid border
        ctx.strokeStyle = `hsl(${hue}, 30%, 30%)`
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, CELL, CELL)
      } else {
        const hue = Math.floor(210 + colorShift * 80)
        ctx.fillStyle = `hsl(${hue}, 15%, 12%)`
        ctx.fillRect(x, y, CELL, CELL)
        ctx.strokeStyle = `hsl(${hue}, 15%, 16%)`
        ctx.lineWidth = 0.5
        ctx.strokeRect(x, y, CELL, CELL)
      }
    }
  }

  // Draw exit
  if (itemsCollected >= 10) {
    const ex = OFFSET_X + exit.col * CELL + CELL / 2
    const ey = OFFSET_Y + exit.row * CELL + CELL / 2
    ctx.fillStyle = `rgba(255,50,50,${0.5 + Math.sin(lastTime * 0.004) * 0.3})`
    ctx.beginPath()
    ctx.arc(ex, ey, CELL * 0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ff3232'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${CELL * 0.3}px Courier New`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('EXIT', ex, ey)
    ctx.textBaseline = 'alphabetic'
  } else {
    // Exit locked indicator
    const ex = OFFSET_X + exit.col * CELL + CELL / 2
    const ey = OFFSET_Y + exit.row * CELL + CELL / 2
    ctx.fillStyle = 'rgba(100,100,100,0.4)'
    ctx.beginPath()
    ctx.arc(ex, ey, CELL * 0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#666'
    ctx.font = `bold ${CELL * 0.25}px Courier New`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${10 - itemsCollected}`, ex, ey)
    ctx.textBaseline = 'alphabetic'
  }

  // Draw items
  for (const item of items) {
    const ix = OFFSET_X + item.col * CELL + CELL / 2
    const iy = OFFSET_Y + item.row * CELL + CELL / 2
    ctx.fillStyle = `rgba(255,220,0,${0.7 + Math.sin(lastTime * 0.003 + item.col) * 0.3})`
    ctx.beginPath()
    ctx.arc(ix, iy, CELL * 0.25, 0, Math.PI * 2)
    ctx.fill()
  }

  // Draw repairs
  const repairActive = performance.now() < repairUntil
  for (const repair of repairs) {
    const rx = OFFSET_X + repair.col * CELL + CELL / 2
    const ry = OFFSET_Y + repair.row * CELL + CELL / 2
    const alpha = 0.7 + Math.sin(lastTime * 0.005) * 0.3
    ctx.fillStyle = repairActive ? `rgba(0,200,255,${alpha})` : `rgba(0,150,255,${alpha})`
    ctx.beginPath()
    ctx.arc(rx, ry, CELL * 0.28, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${CELL * 0.3}px Courier New`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('R', rx, ry)
    ctx.textBaseline = 'alphabetic'
  }

  // Draw player
  const px = OFFSET_X + player.col * CELL + CELL / 2
  const py = OFFSET_Y + player.row * CELL + CELL / 2
  const pHue = repairActive ? 140 : Math.floor(200 + colorShift * 120)
  ctx.fillStyle = `hsl(${pHue}, 80%, 70%)`
  ctx.beginPath()
  ctx.arc(px, py, CELL * 0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(px - CELL * 0.1, py - CELL * 0.1, CELL * 0.12, 0, Math.PI * 2)
  ctx.fill()

  // Repair timer bar
  if (repairActive) {
    const remaining = (repairUntil - performance.now()) / 5000
    ctx.fillStyle = 'rgba(0,200,255,0.3)'
    ctx.fillRect(OFFSET_X, OFFSET_Y - 8, COLS_W() * remaining, 4)
    ctx.fillStyle = '#00c8ff'
    ctx.fillRect(OFFSET_X, OFFSET_Y - 8, COLS_W() * remaining, 4)
  }

  // Glitch blocks (overlay on everything)
  for (const gb of glitchBlocks) {
    const alpha = gb.life / gb.maxLife
    ctx.fillStyle = `rgba(${gb.r},${gb.g},${gb.b},${alpha * 0.8})`
    ctx.fillRect(gb.x, gb.y, gb.w, gb.h)
  }

  // Screen-wide tint at high decay
  if (decayLevel > 0.5) {
    const alpha = (decayLevel - 0.5) * 0.15
    ctx.fillStyle = `rgba(255,0,50,${alpha})`
    ctx.fillRect(0, 0, W, H)
  }

  // Scanlines at high decay
  if (decayLevel > 0.4) {
    ctx.strokeStyle = `rgba(0,0,0,${decayLevel * 0.2})`
    ctx.lineWidth = 1
    for (let y = 0; y < H; y += 4) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
  }

  // Message
  if (messageTimer > 0 && message) {
    const alpha = Math.min(1, messageTimer / 30)
    ctx.fillStyle = `rgba(255,220,100,${alpha})`
    ctx.font = `bold ${Math.min(24, W * 0.05)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText(message, W / 2, H * 0.88)
    messageTimer--
  }

  // Overlays
  if (state === 'start') drawStartOverlay()
  if (state === 'gameover') drawGameOverOverlay()
}

function COLS_W(): number { return GRID * CELL }

function drawStartOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(0,0,0,0.88)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#00ff88'
  ctx.font = `bold ${Math.min(44, W * 0.09)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('BIT ROT', W / 2, H * 0.2)
  ctx.fillStyle = '#aaa'
  ctx.font = `${Math.min(16, W * 0.033)}px Courier New`
  const lines = [
    'Collect 10 yellow items, reach the exit.',
    'But the system is decaying...',
    'Controls glitch. Colors shift. Visuals corrupt.',
    'Blue R = Repair (5s of sanity).',
    '',
    'Arrow keys / WASD / swipe to move.',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.32 + i * H * 0.062))

  const bw = Math.min(160, W * 0.38); const bh = 44
  const bx = W / 2 - bw / 2; const by = H * 0.78
  ctx.fillStyle = '#00ff88'
  ctx.beginPath()
  ctx.roundRect(bx, by, bw, bh, 8)
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.font = `bold ${Math.min(20, W * 0.042)}px Courier New`
  ctx.fillText('PLAY', W / 2, by + 28)
}

function drawGameOverOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(0,0,0,0.88)'
  ctx.fillRect(0, 0, W, H)
  const won = itemsCollected >= 10
  ctx.fillStyle = won ? '#00ff88' : '#ff4444'
  ctx.font = `bold ${Math.min(40, W * 0.085)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText(won ? 'ESCAPED!' : 'CORRUPTED', W / 2, H * 0.22)
  ctx.fillStyle = '#ccc'
  ctx.font = `${Math.min(18, W * 0.037)}px Courier New`
  ctx.fillText(`Items collected: ${itemsCollected}/10`, W / 2, H * 0.37)
  ctx.fillText(`Score: ${realScore}`, W / 2, H * 0.44)
  ctx.fillText(`Best: ${bestScore}`, W / 2, H * 0.51)

  const bw = Math.min(160, W * 0.38); const bh = 44
  const bx = W / 2 - bw / 2; const by = H * 0.68
  ctx.fillStyle = '#00ff88'
  ctx.beginPath()
  ctx.roundRect(bx, by, bw, bh, 8)
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.font = `bold ${Math.min(18, W * 0.038)}px Courier New`
  ctx.fillText('PLAY AGAIN', W / 2, by + 28)
}

// ── Click overlay buttons ──────────────────────────────────────────────────────

canvas.addEventListener('click', (e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect()
  const py = (e.clientY - rect.top) * (canvas.height / rect.height)
  const H = canvas.height
  if (state === 'start' && py > H * 0.75) { startGame(); return }
  if (state === 'gameover' && py > H * 0.65) { startGame(); return }
})

canvas.addEventListener('touchend', (e: TouchEvent) => {
  const rect = canvas.getBoundingClientRect()
  const py = (e.changedTouches[0].clientY - rect.top) * (canvas.height / rect.height)
  const H = canvas.height
  if (state === 'start' && py > H * 0.75) { e.preventDefault(); startGame(); return }
  if (state === 'gameover' && py > H * 0.65) { e.preventDefault(); startGame(); return }
}, { passive: false })

// ── Main loop ──────────────────────────────────────────────────────────────────

function loop(now: number): void {
  lastTime = now
  if (state === 'playing') updateDecay(now)
  draw()
  requestAnimationFrame(loop)
}

// Mute button
document.getElementById('mute-btn')!.addEventListener('click', () => {
  const m = audio.toggleMute()
  ;(document.getElementById('mute-btn') as HTMLButtonElement).textContent = m ? '🔇' : '🔊'
})

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { bestScore: saved } = await initSDK()
    bestScore = saved
  } catch { /* standalone */ }
  requestAnimationFrame(loop)
}

void boot()
