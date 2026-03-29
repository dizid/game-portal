import { audio } from './audio.js'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ─────────────────────────────────────────────────────────────────────

type Grid = boolean[][]

interface Level {
  name: string
  description: string
  seeds: number
  maxGenerations: number
  target: number[][]  // [row, col] pairs of live cells in target
  startHints?: number[][]  // optional starting hints
}

// ── Levels ────────────────────────────────────────────────────────────────────

// All patterns centered around col 15, row 15
const LEVELS: Level[] = [
  {
    name: 'Block (Still Life)',
    description: 'Make a 2x2 block. Still lifes never change!',
    seeds: 4,
    maxGenerations: 5,
    target: [[14,14],[14,15],[15,14],[15,15]],
  },
  {
    name: 'Beehive (Still Life)',
    description: 'Form the beehive — a stable 6-cell pattern.',
    seeds: 6,
    maxGenerations: 8,
    target: [[13,14],[13,15],[14,13],[14,16],[15,14],[15,15]],
  },
  {
    name: 'Loaf (Still Life)',
    description: 'Create the loaf still life pattern.',
    seeds: 7,
    maxGenerations: 10,
    target: [[13,14],[13,15],[14,13],[14,16],[15,14],[15,16],[16,15]],
  },
  {
    name: 'Blinker (Oscillator)',
    description: 'Blinkers oscillate between horizontal and vertical. Plant 3 in a row!',
    seeds: 3,
    maxGenerations: 3,
    target: [[15,14],[15,15],[15,16]],
  },
  {
    name: 'Toad (Oscillator)',
    description: 'A 2-generation period oscillator. Needs 6 cells arranged carefully.',
    seeds: 6,
    maxGenerations: 5,
    target: [[14,14],[14,15],[14,16],[15,13],[15,14],[15,15]],
  },
  {
    name: 'Beacon (Oscillator)',
    description: 'Two blocks that flash! A period-2 oscillator.',
    seeds: 8,
    maxGenerations: 6,
    target: [[13,13],[13,14],[14,13],[14,14],[15,15],[15,16],[16,15],[16,16]],
  },
  {
    name: 'Glider (Spaceship)',
    description: 'The famous glider moves diagonally! Plant it pointing right-down.',
    seeds: 5,
    maxGenerations: 20,
    target: [[11,12],[12,13],[13,11],[13,12],[13,13]],
  },
  {
    name: 'Glider II',
    description: 'Another glider orientation. Can you navigate it to the target?',
    seeds: 5,
    maxGenerations: 20,
    target: [[14,16],[15,17],[16,15],[16,16],[16,17]],
  },
  {
    name: 'R-Pentomino',
    description: 'The R-pentomino is chaotic. Seed it and watch it stabilize near the target!',
    seeds: 6,
    maxGenerations: 50,
    target: [[10,14],[10,15],[11,13],[11,14],[12,14]],
  },
  {
    name: 'Pulsar Seed',
    description: 'A complex oscillator. Find the right seed configuration!',
    seeds: 8,
    maxGenerations: 60,
    target: [[11,15],[12,14],[12,16],[13,14],[13,16],[14,15]],
  },
]

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID_W = 30
const GRID_H = 30
const MAX_AUTO_GENS = 200

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const canvasWrap = document.getElementById('canvas-wrap')!

let cellSize = 16

function resize(): void {
  const w = canvasWrap.clientWidth
  const h = canvasWrap.clientHeight
  cellSize = Math.floor(Math.min(w / GRID_W, h / GRID_H))
  cellSize = Math.max(8, Math.min(20, cellSize))
  canvas.width = cellSize * GRID_W
  canvas.height = cellSize * GRID_H
  canvas.style.width = canvas.width + 'px'
  canvas.style.height = canvas.height + 'px'
}
resize()
window.addEventListener('resize', resize)

// ── State ─────────────────────────────────────────────────────────────────────

let currentLevel = 0
let score = 0
let bestScore = 0
let seedsPlaced = 0
let grid: Grid = []
let history: Grid[] = []
let generation = 0
let playing = false
let won = false
let autoPlayInterval: ReturnType<typeof setInterval> | null = null
let running = false

// ── Grid helpers ──────────────────────────────────────────────────────────────

function emptyGrid(): Grid {
  return Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(false))
}

function cloneGrid(g: Grid): Grid {
  return g.map(row => [...row])
}

function gridEquals(a: Grid, b: Grid): boolean {
  for (let r = 0; r < GRID_H; r++)
    for (let c = 0; c < GRID_W; c++)
      if (a[r][c] !== b[r][c]) return false
  return true
}

function targetToGrid(coords: number[][]): Grid {
  const g = emptyGrid()
  for (const [r, c] of coords) {
    if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W) g[r][c] = true
  }
  return g
}

function stepGrid(g: Grid): Grid {
  const next = emptyGrid()
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      let neighbors = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = (r + dr + GRID_H) % GRID_H
          const nc = (c + dc + GRID_W) % GRID_W
          if (g[nr][nc]) neighbors++
        }
      }
      if (g[r][c]) {
        next[r][c] = neighbors === 2 || neighbors === 3
      } else {
        next[r][c] = neighbors === 3
      }
    }
  }
  return next
}

function checkWin(level: Level): boolean {
  const targetGrid = targetToGrid(level.target)
  // Check if current grid matches OR contains target pattern
  for (let r = 0; r < GRID_H; r++)
    for (let c = 0; c < GRID_W; c++)
      if (targetGrid[r][c] && !grid[r][c]) return false
  return true
}

// ── Game controls ─────────────────────────────────────────────────────────────

function startLevel(levelIdx: number): void {
  currentLevel = levelIdx
  grid = emptyGrid()
  history = [cloneGrid(grid)]
  generation = 0
  playing = false
  won = false
  seedsPlaced = 0
  stopAutoPlay()

  const level = LEVELS[levelIdx]
  ;(document.getElementById('level-val') as HTMLSpanElement).textContent = String(levelIdx + 1)
  ;(document.getElementById('gen-val') as HTMLSpanElement).textContent = '0'
  ;(document.getElementById('status-val') as HTMLSpanElement).textContent = 'Placing'
  ;(document.getElementById('level-info') as HTMLDivElement).textContent = level.description

  updateSeedsDisplay()
  updateButtons()
  draw()
}

function playStep(): void {
  if (won) return
  const level = LEVELS[currentLevel]
  grid = stepGrid(grid)
  generation++
  history.push(cloneGrid(grid))
  ;(document.getElementById('gen-val') as HTMLSpanElement).textContent = String(generation)

  if (checkWin(level)) {
    won = true
    stopAutoPlay()
    playing = false
    audio.levelUp()
    const seedsLeft = level.seeds - seedsPlaced
    const points = 10 + seedsLeft * 5
    score += points
    ;(document.getElementById('score-val') as HTMLSpanElement).textContent = String(score)
    ;(document.getElementById('status-val') as HTMLSpanElement).textContent = 'Won!'

    setTimeout(() => {
      if (currentLevel + 1 >= LEVELS.length) {
        endGame()
      } else {
        startLevel(currentLevel + 1)
      }
    }, 1500)
    return
  }

  if (generation >= Math.max(level.maxGenerations, MAX_AUTO_GENS)) {
    stopAutoPlay()
    playing = false
    ;(document.getElementById('status-val') as HTMLSpanElement).textContent = 'Try again'
    updateButtons()
  }
}

function startAutoPlay(): void {
  if (autoPlayInterval) return
  playing = true
  ;(document.getElementById('status-val') as HTMLSpanElement).textContent = 'Running'
  updateButtons()
  audio.start()
  autoPlayInterval = setInterval(() => {
    if (!running || !playing) { stopAutoPlay(); return }
    playStep()
    draw()
  }, 120)
}

function stopAutoPlay(): void {
  if (autoPlayInterval) {
    clearInterval(autoPlayInterval)
    autoPlayInterval = null
  }
  playing = false
  updateButtons()
}

function rewind(): void {
  stopAutoPlay()
  // Rewind to placement state (first in history)
  grid = cloneGrid(history[0])
  generation = 0
  won = false
  ;(document.getElementById('gen-val') as HTMLSpanElement).textContent = '0'
  ;(document.getElementById('status-val') as HTMLSpanElement).textContent = 'Placing'
  updateButtons()
  draw()
}

function updateButtons(): void {
  const playBtn = document.getElementById('play-btn') as HTMLButtonElement
  const stepBtn = document.getElementById('step-btn') as HTMLButtonElement
  playBtn.textContent = playing ? 'Pause' : 'Play'
  stepBtn.disabled = playing || won
}

function updateSeedsDisplay(): void {
  const level = LEVELS[currentLevel]
  const display = document.getElementById('seeds-display')!
  while (display.firstChild) display.removeChild(display.firstChild)
  for (let i = 0; i < level.seeds; i++) {
    const pip = document.createElement('span')
    pip.className = 'seed-pip' + (i < seedsPlaced ? ' used' : '')
    display.appendChild(pip)
  }
  ;(document.getElementById('seeds-val') as HTMLSpanElement).textContent = String(level.seeds - seedsPlaced)
}

// ── Render ────────────────────────────────────────────────────────────────────

function draw(): void {
  const w = canvas.width
  const h = canvas.height
  const cs = cellSize
  const level = LEVELS[currentLevel]
  const targetGrid = targetToGrid(level.target)

  ctx.clearRect(0, 0, w, h)

  // Background
  ctx.fillStyle = '#0a0a14'
  ctx.fillRect(0, 0, w, h)

  // Grid lines
  ctx.strokeStyle = 'rgba(60,70,100,0.3)'
  ctx.lineWidth = 0.5
  for (let c = 0; c <= GRID_W; c++) {
    ctx.beginPath(); ctx.moveTo(c * cs, 0); ctx.lineTo(c * cs, h); ctx.stroke()
  }
  for (let r = 0; r <= GRID_H; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * cs); ctx.lineTo(w, r * cs); ctx.stroke()
  }

  // Target ghost overlay (blue)
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      if (targetGrid[r][c]) {
        ctx.fillStyle = 'rgba(60,100,255,0.3)'
        ctx.fillRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2)
        ctx.strokeStyle = 'rgba(80,130,255,0.6)'
        ctx.lineWidth = 1
        ctx.strokeRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2)
      }
    }
  }

  // Live cells
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      if (!grid[r][c]) continue
      const isTarget = targetGrid[r][c]
      const color = isTarget ? '#88ff88' : '#44aaff'
      const grad = ctx.createRadialGradient(
        c * cs + cs / 2, r * cs + cs / 2, 0,
        c * cs + cs / 2, r * cs + cs / 2, cs / 2,
      )
      grad.addColorStop(0, color)
      grad.addColorStop(1, isTarget ? '#228822' : '#1144aa')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.roundRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2, 2)
      ctx.fill()
    }
  }

  // Win flash
  if (won) {
    ctx.fillStyle = 'rgba(100,255,100,0.15)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(100,255,100,0.9)'
    ctx.font = `bold ${Math.floor(cs * 1.5)}px Courier New`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('LEVEL COMPLETE!', w / 2, h / 2)
  }
}

// ── Interaction ───────────────────────────────────────────────────────────────

function toggleCell(cx: number, cy: number): void {
  if (playing || won) return
  const c = Math.floor(cx / cellSize)
  const r = Math.floor(cy / cellSize)
  if (r < 0 || r >= GRID_H || c < 0 || c >= GRID_W) return

  const level = LEVELS[currentLevel]
  if (!grid[r][c] && seedsPlaced >= level.seeds) return  // no seeds left

  if (grid[r][c]) {
    grid[r][c] = false
    seedsPlaced--
  } else {
    grid[r][c] = true
    seedsPlaced++
    audio.click()
  }
  history[0] = cloneGrid(grid)
  updateSeedsDisplay()
  draw()
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  toggleCell((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy)
})

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const t = e.touches[0]
  toggleCell((t.clientX - rect.left) * sx, (t.clientY - rect.top) * sy)
}, { passive: false })

// ── Buttons ───────────────────────────────────────────────────────────────────

document.getElementById('play-btn')!.addEventListener('click', () => {
  if (playing) stopAutoPlay()
  else startAutoPlay()
})

document.getElementById('step-btn')!.addEventListener('click', () => {
  if (!playing && !won) { playStep(); draw() }
})

document.getElementById('rewind-btn')!.addEventListener('click', rewind)

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function buildOverlay(title: string, body: string, btnLabel: string, onBtn: () => void): void {
  const ov = document.getElementById('overlay')!
  while (ov.firstChild) ov.removeChild(ov.firstChild)
  const h1 = document.createElement('h1')
  h1.textContent = title
  const p = document.createElement('p')
  p.textContent = body
  const btn = document.createElement('button')
  btn.textContent = btnLabel
  btn.addEventListener('click', onBtn)
  ov.appendChild(h1)
  ov.appendChild(p)
  ov.appendChild(btn)
  ov.style.display = 'flex'
}

function endGame(): void {
  running = false
  stopAutoPlay()
  audio.levelUp()
  if (score > bestScore) {
    bestScore = score
    saveBestScore(score)
  }
  reportGameOver(score)
  const msg = score >= 100 ? 'Master Gardener!' : score >= 50 ? 'Great botanist!' : 'Keep seeding!'
  buildOverlay('Garden Complete!', `All 10 levels done! Score: ${score} (unused seeds = bonus points). ${msg}`, 'Plant Again', startGame)
}

function startGame(): void {
  score = 0
  running = true
  ;(document.getElementById('score-val') as HTMLSpanElement).textContent = '0'
  const ov = document.getElementById('overlay')!
  ov.style.display = 'none'
  startLevel(0)
}

// ── Loop (only for animation, not game step) ──────────────────────────────────

let lastTime = 0
function loop(ts: number): void {
  if (!playing) draw()  // redraw static states
  lastTime = ts
  requestAnimationFrame(loop)
}

const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

document.getElementById('start-btn')!.addEventListener('click', startGame)
initSDK().then(({ bestScore: saved }) => { bestScore = saved })
requestAnimationFrame((ts) => { lastTime = ts; loop(ts) })
