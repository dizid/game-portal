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

// Win particle for celebration burst
interface CParticle {
  x: number; y: number; vx: number; vy: number
  alpha: number; size: number
}

// Level transition phases
type TransitionPhase = 'none' | 'fadeOut' | 'showText' | 'fadeIn'

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

// Win particles — green sparkle burst on level complete
let winParticles: CParticle[] = []
let winParticleLastTime = 0

// Hint system — show hint button after 3 failed attempts
let failedAttempts = 0
let hintCell: [number, number] | null = null
let hintTimer = 0  // seconds remaining for hint highlight

// Level transition — fade out, show level text, fade in
let transitionPhase: TransitionPhase = 'none'
let transitionAlpha = 0  // 0 = transparent, 1 = black overlay
let transitionTimer = 0
let nextLevelIdx = 0

// Generation counter pulse — brief visual feedback each step
let genPulseTimer = 0  // seconds remaining for glow

// Speed control — toggle between normal (120ms) and fast (40ms)
let simSpeed: 120 | 40 = 120

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

function startLevel(levelIdx: number, fromTransition = false): void {
  const isNewLevel = levelIdx !== currentLevel
  currentLevel = levelIdx
  grid = emptyGrid()
  history = [cloneGrid(grid)]
  generation = 0
  playing = false
  won = false
  seedsPlaced = 0
  winParticles = []
  hintCell = null
  hintTimer = 0
  genPulseTimer = 0
  // Reset failed attempts when advancing to a new level
  if (isNewLevel) failedAttempts = 0
  // Only reset transition if not called from within the transition sequence
  if (!fromTransition) {
    transitionPhase = 'none'
    transitionAlpha = 0
  }
  stopAutoPlay()
  updateHintButton()

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

  // Pulse the generation counter visually
  genPulseTimer = 0.35

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

    // Spawn win particles from matched cells
    const targetGrid = targetToGrid(level.target)
    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        if (targetGrid[r][c] && grid[r][c]) {
          const cx = c * cellSize + cellSize / 2
          const cy = r * cellSize + cellSize / 2
          for (let i = 0; i < 2; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 30 + Math.random() * 80
            winParticles.push({
              x: cx, y: cy,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 20,
              alpha: 1.0,
              size: 2 + Math.random() * 2,
            })
          }
        }
      }
    }

    // Start level transition instead of instant jump
    nextLevelIdx = currentLevel + 1
    transitionPhase = 'fadeOut'
    transitionAlpha = 0
    transitionTimer = 0
    return
  }

  if (generation >= Math.max(level.maxGenerations, MAX_AUTO_GENS)) {
    stopAutoPlay()
    playing = false
    failedAttempts++
    ;(document.getElementById('status-val') as HTMLSpanElement).textContent = 'Try again'
    updateButtons()
    updateHintButton()
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
  }, simSpeed)
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

function updateHintButton(): void {
  const btn = document.getElementById('hint-btn') as HTMLButtonElement
  if (!btn) return
  btn.style.display = failedAttempts >= 3 && !won ? 'inline-flex' : 'none'
}

function revealHint(): void {
  const level = LEVELS[currentLevel]
  const targetCells = level.target.filter(([r, c]) => !grid[r][c])
  if (targetCells.length === 0) return
  const pick = targetCells[Math.floor(Math.random() * targetCells.length)]
  hintCell = [pick[0], pick[1]]
  hintTimer = 2.0  // show for 2 seconds
  draw()
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

  // Live cells — draw first so ghost overlay renders on top
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

  // Target ghost overlay — always visible so player can see goal during simulation.
  // Only rendered on cells NOT currently alive so it doesn't obscure live cells.
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      if (!targetGrid[r][c] || grid[r][c]) continue  // skip alive or non-target
      ctx.fillStyle = 'rgba(60,100,255,0.25)'
      ctx.fillRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2)
      ctx.strokeStyle = 'rgba(80,130,255,0.5)'
      ctx.lineWidth = 1
      ctx.strokeRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2)
    }
  }

  // Hint cell — gold highlight for 2s after player requests hint
  if (hintCell && hintTimer > 0) {
    const [hr, hc] = hintCell
    ctx.save()
    ctx.globalAlpha = Math.min(1, hintTimer)
    ctx.fillStyle = 'rgba(255,200,40,0.7)'
    ctx.strokeStyle = '#ffcc28'
    ctx.lineWidth = 2
    ctx.fillRect(hc * cs + 1, hr * cs + 1, cs - 2, cs - 2)
    ctx.strokeRect(hc * cs + 1, hr * cs + 1, cs - 2, cs - 2)
    ctx.restore()
  }

  // Win particles — green sparkles rising upward
  for (const p of winParticles) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, p.alpha)
    ctx.fillStyle = '#44ff88'
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Win flash overlay
  if (won && transitionPhase === 'none') {
    ctx.fillStyle = 'rgba(100,255,100,0.12)'
    ctx.fillRect(0, 0, w, h)
  }

  // Level transition overlay — fade to black, show level text, fade back in
  if (transitionPhase !== 'none') {
    ctx.save()
    ctx.globalAlpha = transitionAlpha
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)

    if (transitionPhase === 'showText') {
      ctx.globalAlpha = 1
      ctx.fillStyle = '#88aaff'
      ctx.font = `bold ${Math.floor(cs * 1.4)}px Courier New`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`LEVEL ${nextLevelIdx + 1}`, w / 2, h / 2)
    }
    ctx.restore()
  }

  // Generation counter glow — brief DOM highlight each step
  const genEl = document.getElementById('gen-val') as HTMLSpanElement | null
  if (genEl) {
    if (genPulseTimer > 0) {
      genEl.style.textShadow = `0 0 ${Math.floor(genPulseTimer * 12)}px #88aaff`
      genEl.style.color = '#ccddff'
    } else {
      genEl.style.textShadow = ''
      genEl.style.color = ''
    }
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

document.getElementById('speed-btn')!.addEventListener('click', () => {
  // Restart interval at new speed if currently playing
  const wasPlaying = playing
  if (wasPlaying) stopAutoPlay()
  simSpeed = simSpeed === 120 ? 40 : 120
  const btn = document.getElementById('speed-btn') as HTMLButtonElement
  btn.textContent = simSpeed === 40 ? 'Speed: Fast' : 'Speed: Normal'
  if (wasPlaying) startAutoPlay()
})

document.getElementById('hint-btn')!.addEventListener('click', revealHint)

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
  failedAttempts = 0
  simSpeed = 120
  winParticles = []
  transitionPhase = 'none'
  ;(document.getElementById('score-val') as HTMLSpanElement).textContent = '0'
  const ov = document.getElementById('overlay')!
  ov.style.display = 'none'
  startLevel(0)
}

// ── Loop (animation timers — game steps run via setInterval) ──────────────────

let lastTime = 0
function loop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.1)
  lastTime = ts

  // Update win particles
  if (winParticles.length > 0) {
    for (let i = winParticles.length - 1; i >= 0; i--) {
      const p = winParticles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 80 * dt  // gravity
      p.alpha -= dt * 2.0  // fade over 0.5s
      if (p.alpha <= 0) winParticles.splice(i, 1)
    }
  }

  // Update hint timer
  if (hintTimer > 0) {
    hintTimer = Math.max(0, hintTimer - dt)
    if (hintTimer <= 0) hintCell = null
  }

  // Update generation pulse
  if (genPulseTimer > 0) {
    genPulseTimer = Math.max(0, genPulseTimer - dt)
  }

  // Update level transition
  if (transitionPhase === 'fadeOut') {
    transitionTimer += dt
    transitionAlpha = Math.min(1, transitionTimer / 0.3)
    if (transitionAlpha >= 1) {
      transitionPhase = 'showText'
      transitionTimer = 0
      // Advance to next level data so the level text is correct
    }
  } else if (transitionPhase === 'showText') {
    transitionTimer += dt
    if (transitionTimer >= 0.5) {
      // Trigger next level and begin fade-in
      if (nextLevelIdx >= LEVELS.length) {
        transitionPhase = 'none'
        endGame()
      } else {
        startLevel(nextLevelIdx, true)  // fromTransition=true preserves transition state
        transitionPhase = 'fadeIn'
        transitionAlpha = 1
        transitionTimer = 0
      }
    }
  } else if (transitionPhase === 'fadeIn') {
    transitionTimer += dt
    transitionAlpha = Math.max(0, 1 - transitionTimer / 0.3)
    if (transitionAlpha <= 0) {
      transitionPhase = 'none'
    }
  }

  // Always redraw to animate particles/transitions even when not playing
  if (!playing || winParticles.length > 0 || transitionPhase !== 'none' ||
      hintTimer > 0 || genPulseTimer > 0) {
    draw()
  }

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
