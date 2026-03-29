// Pipe Connect — main entry point

import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────

// Pipe connections encoded as bitmask: N=1 E=2 S=4 W=8
const N = 1, E = 2, S = 4, W = 8

type PipeType = 'straight' | 'elbow' | 'tee' | 'cross' | 'source' | 'drain' | 'empty'

interface Pipe {
  type: PipeType
  rotation: number   // 0,1,2,3 = 0,90,180,270 degrees
  fixed: boolean     // source/drain cannot rotate
  connected: boolean // lit up by BFS
  flowing: number    // animation fill progress 0..1
}

// Base connection masks for each pipe type at rotation=0
const BASE_MASKS: Record<PipeType, number> = {
  straight: N | S,          // vertical
  elbow:    N | E,          // top-right
  tee:      N | E | S,      // T pointing left open
  cross:    N | E | S | W,
  source:   S,              // faces down at rot=0
  drain:    N,              // faces up at rot=0
  empty:    0,
}

function getMask(pipe: Pipe): number {
  if (pipe.type === 'empty') return 0
  const base = BASE_MASKS[pipe.type]
  // Rotate the bitmask by pipe.rotation * 90 degrees clockwise
  let mask = base
  for (let i = 0; i < pipe.rotation; i++) {
    // Rotate CW: N->E->S->W->N
    const n = (mask & N) ? E : 0
    const e = (mask & E) ? S : 0
    const s = (mask & S) ? W : 0
    const w = (mask & W) ? N : 0
    mask = n | e | s | w
  }
  return mask
}

// ── Level definitions ──────────────────────────────────────────────────────────
// Each cell: [type, rotation]  — 6x6 grids
// Types: 0=empty, 1=straight, 2=elbow, 3=tee, 4=cross, 5=source, 6=drain

type CellDef = [PipeType, number]

const LEVELS: CellDef[][][] = [
  // Level 1 — simple straight line
  [
    [['empty',0],['empty',0],['source',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['drain',0],['empty',0],['empty',0],['empty',0]],
  ],
  // Level 2 — one elbow
  [
    [['empty',0],['source',0],['empty',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['straight',0],['empty',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['elbow',0],['straight',1],['straight',1],['elbow',1],['empty',0]],
    [['empty',0],['empty',0],['empty',0],['empty',0],['straight',0],['empty',0]],
    [['empty',0],['empty',0],['empty',0],['empty',0],['straight',0],['empty',0]],
    [['empty',0],['empty',0],['empty',0],['empty',0],['drain',0],['empty',0]],
  ],
  // Level 3 — S-bend scrambled
  [
    [['empty',0],['empty',0],['source',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['elbow',2],['straight',1],['elbow',1],['empty',0]],
    [['empty',0],['empty',0],['empty',0],['empty',0],['straight',0],['empty',0]],
    [['empty',0],['elbow',3],['straight',1],['straight',1],['elbow',2],['empty',0]],
    [['empty',0],['straight',0],['empty',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['drain',0],['empty',0],['empty',0],['empty',0],['empty',0]],
  ],
  // Level 4 — tee junction
  [
    [['source',0],['straight',0],['tee',1],['straight',0],['drain',0],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['tee',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['drain',0],['empty',0],['empty',0],['empty',0]],
  ],
  // Level 5 — cross piece
  [
    [['empty',0],['empty',0],['source',0],['empty',0],['empty',0],['empty',0]],
    [['source',2],['straight',1],['cross',0],['straight',1],['elbow',1],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['straight',0],['empty',0]],
    [['empty',0],['empty',0],['elbow',3],['straight',1],['elbow',2],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['drain',0],['empty',0],['empty',0],['empty',0]],
  ],
  // Level 6
  [
    [['source',0],['elbow',0],['empty',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['straight',1],['straight',1],['elbow',1],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['empty',0],['straight',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['empty',0],['elbow',3],['straight',1],['elbow',1]],
    [['empty',0],['empty',0],['empty',0],['empty',0],['empty',0],['straight',0]],
    [['empty',0],['empty',0],['empty',0],['empty',0],['empty',0],['drain',0]],
  ],
  // Level 7
  [
    [['empty',0],['source',0],['empty',0],['empty',0],['source',2],['empty',0]],
    [['empty',0],['straight',0],['empty',0],['empty',0],['straight',1],['empty',0]],
    [['elbow',0],['tee',2],['straight',1],['tee',0],['elbow',2],['empty',0]],
    [['straight',0],['empty',0],['empty',0],['straight',0],['empty',0],['empty',0]],
    [['elbow',3],['straight',1],['tee',3],['elbow',2],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['drain',0],['empty',0],['empty',0],['empty',0]],
  ],
  // Level 8
  [
    [['source',0],['straight',0],['elbow',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['straight',1],['straight',1],['elbow',1],['empty',0]],
    [['empty',0],['empty',0],['empty',0],['empty',0],['straight',0],['empty',0]],
    [['empty',0],['empty',0],['elbow',3],['straight',1],['elbow',2],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['drain',0],['empty',0],['empty',0],['empty',0]],
  ],
  // Level 9
  [
    [['source',0],['elbow',0],['straight',1],['elbow',1],['empty',0],['empty',0]],
    [['empty',0],['straight',0],['empty',0],['straight',0],['empty',0],['empty',0]],
    [['empty',0],['elbow',3],['straight',1],['elbow',2],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['tee',2],['straight',1],['straight',1],['elbow',1]],
    [['empty',0],['empty',0],['drain',0],['empty',0],['empty',0],['straight',0]],
  ],
  // Level 10
  [
    [['source',0],['straight',1],['tee',3],['straight',1],['straight',1],['drain',2]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['elbow',3],['tee',2],['straight',1],['elbow',1],['empty',0]],
    [['empty',0],['straight',0],['straight',0],['empty',0],['straight',0],['empty',0]],
    [['empty',0],['elbow',3],['tee',0],['straight',1],['elbow',2],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
  ],
  // Level 11
  [
    [['empty',0],['source',0],['empty',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['elbow',0],['straight',1],['straight',1],['elbow',1],['empty',0]],
    [['empty',0],['straight',0],['empty',0],['empty',0],['straight',0],['empty',0]],
    [['empty',0],['tee',3],['straight',1],['straight',1],['tee',1],['empty',0]],
    [['empty',0],['straight',0],['empty',0],['empty',0],['straight',0],['empty',0]],
    [['empty',0],['drain',0],['empty',0],['empty',0],['drain',0],['empty',0]],
  ],
  // Level 12
  [
    [['source',0],['tee',0],['straight',1],['tee',0],['straight',1],['drain',2]],
    [['empty',0],['straight',0],['empty',0],['straight',0],['empty',0],['empty',0]],
    [['empty',0],['elbow',3],['cross',0],['elbow',2],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['straight',0],['empty',0],['empty',0],['empty',0]],
    [['empty',0],['empty',0],['tee',2],['straight',1],['elbow',1],['empty',0]],
    [['empty',0],['empty',0],['drain',0],['empty',0],['straight',0],['empty',0]],
  ],
  // Level 13
  [
    [['source',0],['straight',0],['tee',1],['straight',0],['tee',1],['straight',0]],
    [['empty',0],['empty',0],['straight',1],['empty',0],['straight',1],['empty',0]],
    [['elbow',3],['straight',1],['cross',0],['straight',1],['cross',0],['elbow',1]],
    [['straight',0],['empty',0],['straight',0],['empty',0],['straight',0],['straight',0]],
    [['elbow',3],['straight',1],['elbow',2],['empty',0],['elbow',3],['elbow',2]],
    [['empty',0],['empty',0],['drain',0],['empty',0],['drain',0],['empty',0]],
  ],
  // Level 14
  [
    [['source',0],['tee',0],['straight',1],['tee',0],['tee',0],['straight',1]],
    [['empty',0],['straight',0],['empty',0],['straight',0],['straight',0],['empty',0]],
    [['empty',0],['cross',0],['straight',1],['cross',0],['cross',0],['empty',0]],
    [['empty',0],['straight',0],['empty',0],['straight',0],['straight',0],['empty',0]],
    [['empty',0],['tee',2],['straight',1],['tee',2],['tee',2],['empty',0]],
    [['empty',0],['drain',0],['empty',0],['drain',0],['drain',0],['empty',0]],
  ],
  // Level 15
  [
    [['source',0],['tee',0],['tee',0],['tee',0],['tee',0],['drain',2]],
    [['empty',0],['straight',0],['straight',0],['straight',0],['straight',0],['empty',0]],
    [['elbow',3],['cross',0],['cross',0],['cross',0],['cross',0],['elbow',1]],
    [['straight',0],['straight',0],['straight',0],['straight',0],['straight',0],['straight',0]],
    [['elbow',3],['tee',2],['tee',2],['tee',2],['tee',2],['elbow',2]],
    [['empty',0],['drain',0],['drain',0],['drain',0],['drain',0],['empty',0]],
  ],
]

// ── Game state ─────────────────────────────────────────────────────────────────

const COLS = 6, ROWS = 6

let grid: Pipe[][] = []
let levelIdx = 0
let score = 0
let highScore = 0
let timerSeconds = 0
let timerHandle = 0
let levelStartTime = 0
let solved = false
let solveAnimStart = 0
let connectedCells: Set<string> = new Set()

// Water flow animation state
let flowProgress: number[][] = [] // 0..1 per cell
let flowOrder: { r: number; c: number }[] = []

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx2d = canvas.getContext('2d')!
const levelEl = document.getElementById('level-value') as HTMLSpanElement
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const timerEl = document.getElementById('timer-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement
const msgEl = document.getElementById('msg') as HTMLDivElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

let cellSize = 80

// ── Canvas sizing ──────────────────────────────────────────────────────────────

function resizeCanvas(): void {
  const wrap = document.getElementById('canvas-wrap')!
  const avail = Math.min(wrap.clientWidth, wrap.clientHeight, 420)
  cellSize = Math.floor(avail / COLS)
  const actual = cellSize * COLS
  canvas.width = actual
  canvas.height = actual
  canvas.style.width = `${actual}px`
  canvas.style.height = `${actual}px`
  draw()
}

// ── Level loading ──────────────────────────────────────────────────────────────

function loadLevel(idx: number): void {
  levelIdx = idx
  solved = false
  timerSeconds = 0
  clearInterval(timerHandle)
  timerHandle = window.setInterval(() => { timerSeconds++; updateHUD() }, 1000)
  levelStartTime = Date.now()
  connectedCells = new Set()
  flowOrder = []

  const levelData = LEVELS[idx % LEVELS.length]
  grid = levelData.map(row =>
    row.map(([type, rot]) => ({
      type,
      rotation: rot,
      fixed: type === 'source' || type === 'drain',
      connected: false,
      flowing: 0,
    }))
  )
  flowProgress = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
  msgEl.textContent = `Level ${idx + 1} — tap pipes to rotate`
  updateHUD()
  runBFS()
  draw()
}

// ── BFS connectivity check ─────────────────────────────────────────────────────

function findSource(): { r: number; c: number } | null {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c].type === 'source') return { r, c }
  return null
}

function findDrain(): { r: number; c: number } | null {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c].type === 'drain') return { r, c }
  return null
}

// Returns true if pipe at (r,c) connects toward direction dir
function connects(r: number, c: number, dir: number): boolean {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false
  return (getMask(grid[r][c]) & dir) !== 0
}

function runBFS(): boolean {
  // Reset connected state
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      grid[r][c].connected = false

  connectedCells = new Set()
  const src = findSource()
  if (!src) return false

  const queue: { r: number; c: number }[] = [src]
  const visited = new Set<string>()
  const order: { r: number; c: number }[] = []
  visited.add(`${src.r},${src.c}`)

  while (queue.length > 0) {
    const { r, c } = queue.shift()!
    order.push({ r, c })
    grid[r][c].connected = true
    connectedCells.add(`${r},${c}`)

    // Check N neighbor
    if (connects(r, c, N) && r > 0 && connects(r-1, c, S) && !visited.has(`${r-1},${c}`)) {
      visited.add(`${r-1},${c}`); queue.push({ r: r-1, c })
    }
    // Check E neighbor
    if (connects(r, c, E) && c < COLS-1 && connects(r, c+1, W) && !visited.has(`${r},${c+1}`)) {
      visited.add(`${r},${c+1}`); queue.push({ r, c: c+1 })
    }
    // Check S neighbor
    if (connects(r, c, S) && r < ROWS-1 && connects(r+1, c, N) && !visited.has(`${r+1},${c}`)) {
      visited.add(`${r+1},${c}`); queue.push({ r: r+1, c })
    }
    // Check W neighbor
    if (connects(r, c, W) && c > 0 && connects(r, c-1, E) && !visited.has(`${r},${c-1}`)) {
      visited.add(`${r},${c-1}`); queue.push({ r, c: c-1 })
    }
  }

  // Check if drain is connected
  const drain = findDrain()
  if (!drain) return false
  const drainConnected = grid[drain.r][drain.c].connected
  if (drainConnected && !solved) {
    solved = true
    flowOrder = order
    solveAnimStart = Date.now()
    triggerSolve()
  }
  return drainConnected
}

function triggerSolve(): void {
  clearInterval(timerHandle)
  audio.levelUp()
  const timeBonus = Math.max(0, 300 - timerSeconds)
  const levelScore = timeBonus * 10
  score += levelScore
  if (score > highScore) { highScore = score; saveHighScore(highScore) }
  reportScore(score)
  updateHUD()
  msgEl.textContent = `+${levelScore} — Level ${levelIdx + 1} complete!`
  // Animate flow then auto-advance
  animateFlow(() => {
    setTimeout(() => {
      loadLevel(levelIdx + 1)
    }, 600)
  })
}

// ── Flow animation ─────────────────────────────────────────────────────────────

function animateFlow(onDone: () => void): void {
  const totalCells = flowOrder.length
  const duration = Math.min(1500, totalCells * 120)
  const start = Date.now()

  function step(): void {
    const elapsed = Date.now() - start
    const progress = Math.min(1, elapsed / duration)
    const cellsLit = Math.floor(progress * totalCells)

    flowProgress = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
    for (let i = 0; i < cellsLit; i++) {
      const { r, c } = flowOrder[i]
      flowProgress[r][c] = 1
    }
    // Partial fill on current cell
    if (cellsLit < totalCells) {
      const frac = (progress * totalCells) - cellsLit
      const { r, c } = flowOrder[cellsLit]
      flowProgress[r][c] = frac
    }

    draw()
    if (progress < 1) requestAnimationFrame(step)
    else onDone()
  }
  requestAnimationFrame(step)
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function draw(): void {
  const cs = cellSize
  ctx2d.clearRect(0, 0, canvas.width, canvas.height)

  // Background
  ctx2d.fillStyle = '#0d1117'
  ctx2d.fillRect(0, 0, canvas.width, canvas.height)

  // Draw each pipe
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const pipe = grid[r]?.[c]
      if (!pipe) continue
      drawPipe(c * cs, r * cs, cs, pipe, flowProgress[r]?.[c] ?? 0)
    }
  }

  // Grid lines
  ctx2d.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx2d.lineWidth = 1
  for (let i = 0; i <= COLS; i++) {
    ctx2d.beginPath(); ctx2d.moveTo(i * cs, 0); ctx2d.lineTo(i * cs, canvas.height); ctx2d.stroke()
  }
  for (let i = 0; i <= ROWS; i++) {
    ctx2d.beginPath(); ctx2d.moveTo(0, i * cs); ctx2d.lineTo(canvas.width, i * cs); ctx2d.stroke()
  }
}

function drawPipe(x: number, y: number, cs: number, pipe: Pipe, flow: number): void {
  if (pipe.type === 'empty') return

  const cx = x + cs / 2
  const cy = y + cs / 2
  const pipeW = cs * 0.22
  const halfW = pipeW / 2

  // Cell background
  ctx2d.fillStyle = 'rgba(255,255,255,0.04)'
  ctx2d.fillRect(x + 1, y + 1, cs - 2, cs - 2)

  const mask = getMask(pipe)
  const isConnected = pipe.connected
  const isFlowing = flow > 0

  // Pipe color
  let pipeColor: string
  if (isFlowing) {
    pipeColor = `rgba(40,160,255,${0.5 + flow * 0.5})`
  } else if (isConnected) {
    pipeColor = 'rgba(100,200,255,0.6)'
  } else {
    pipeColor = 'rgba(130,130,160,0.7)'
  }

  // Draw pipe segments from center toward each connected direction
  const dirs: Array<{ bit: number; dx: number; dy: number }> = [
    { bit: N, dx: 0,  dy: -1 },
    { bit: E, dx: 1,  dy: 0  },
    { bit: S, dx: 0,  dy: 1  },
    { bit: W, dx: -1, dy: 0  },
  ]

  // Draw center hub
  ctx2d.fillStyle = pipeColor
  ctx2d.fillRect(cx - halfW, cy - halfW, pipeW, pipeW)

  for (const dir of dirs) {
    if (!(mask & dir.bit)) continue
    const ex = cx + dir.dx * cs / 2
    const ey = cy + dir.dy * cs / 2
    // Draw rectangle from center toward edge
    const rx = Math.min(cx, ex) - (dir.dy !== 0 ? halfW : 0)
    const ry = Math.min(cy, ey) - (dir.dx !== 0 ? halfW : 0)
    const rw = dir.dy !== 0 ? pipeW : Math.abs(ex - cx)
    const rh = dir.dx !== 0 ? pipeW : Math.abs(ey - cy)
    ctx2d.fillStyle = pipeColor
    ctx2d.fillRect(rx, ry, rw, rh)
  }

  // Source/drain indicator
  if (pipe.type === 'source') {
    ctx2d.fillStyle = '#00ff88'
    ctx2d.beginPath()
    ctx2d.arc(cx, cy, cs * 0.14, 0, Math.PI * 2)
    ctx2d.fill()
  } else if (pipe.type === 'drain') {
    ctx2d.strokeStyle = '#ff6644'
    ctx2d.lineWidth = 2
    ctx2d.beginPath()
    ctx2d.arc(cx, cy, cs * 0.14, 0, Math.PI * 2)
    ctx2d.stroke()
  }
}

// ── Input ──────────────────────────────────────────────────────────────────────

canvas.addEventListener('click', (e: MouseEvent) => {
  if (solved) return
  const rect = canvas.getBoundingClientRect()
  const col = Math.floor((e.clientX - rect.left) / cellSize)
  const row = Math.floor((e.clientY - rect.top) / cellSize)
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return
  const pipe = grid[row][col]
  if (!pipe || pipe.fixed || pipe.type === 'empty') return
  pipe.rotation = (pipe.rotation + 1) % 4
  audio.click()
  runBFS()
  draw()
})

muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── HUD ────────────────────────────────────────────────────────────────────────

function updateHUD(): void {
  levelEl.textContent = String(levelIdx + 1)
  scoreEl.textContent = String(score)
  timerEl.textContent = String(timerSeconds)
  highScoreEl.textContent = String(highScore)
}

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: saved } = await initSDK()
    highScore = saved
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }
  window.addEventListener('resize', resizeCanvas)
  resizeCanvas()
  loadLevel(0)
}

void boot()
