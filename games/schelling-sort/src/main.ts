import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────
type CellType = 'empty' | 'triangle' | 'circle' | 'center'

interface Cell {
  type: CellType
  happy: boolean
}

interface GameState {
  phase: 'place' | 'simulate' | 'result' | 'gameover'
  round: number
  step: number
  grid: Cell[][]
  centersLeft: number
  totalScore: number
  roundScore: number
  simTimer: number | null
}

// ── Constants ──────────────────────────────────────────────────────────────────
const GRID = 12
const ROUNDS = 5
const SIM_STEPS = 20
const SIM_INTERVAL_MS = 200
const THRESHOLDS = [0.25, 0.30, 0.35, 0.40, 0.45]
const CENTERS_PER_ROUND = 5

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const canvasWrap = document.getElementById('canvas-wrap') as HTMLDivElement

let cellSize = 40

function resizeCanvas(): void {
  const avail = Math.min(
    canvasWrap.clientWidth || window.innerWidth,
    window.innerHeight - 100
  )
  cellSize = Math.floor(avail / GRID)
  canvas.width = cellSize * GRID
  canvas.height = cellSize * GRID
}

// ── Game state ─────────────────────────────────────────────────────────────────
const state: GameState = {
  phase: 'place',
  round: 1,
  step: 0,
  grid: [],
  centersLeft: CENTERS_PER_ROUND,
  totalScore: 0,
  roundScore: 0,
  simTimer: null,
}

let bestScore = 0

// ── Grid helpers ───────────────────────────────────────────────────────────────
function makeGrid(): Cell[][] {
  const grid: Cell[][] = []
  for (let r = 0; r < GRID; r++) {
    grid.push([])
    for (let c = 0; c < GRID; c++) {
      grid[r].push({ type: 'empty', happy: true })
    }
  }
  return grid
}

function populateGrid(grid: Cell[][]): void {
  const cells: [number, number][] = []
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      cells.push([r, c])
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]]
  }
  const residents = Math.floor(GRID * GRID * 0.82)
  const triangles = Math.floor(residents * 0.5)
  for (let i = 0; i < residents; i++) {
    const [r, c] = cells[i]
    grid[r][c].type = i < triangles ? 'triangle' : 'circle'
  }
}

function getNeighbors(grid: Cell[][], r: number, c: number): Cell[] {
  const neighbors: Cell[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr, nc = c + dc
      if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID)
        neighbors.push(grid[nr][nc])
    }
  }
  return neighbors
}

function isHappy(grid: Cell[][], r: number, c: number, threshold: number): boolean {
  const cell = grid[r][c]
  if (cell.type === 'empty' || cell.type === 'center') return true
  const neighbors = getNeighbors(grid, r, c)
  const occupied = neighbors.filter(n => n.type !== 'empty')
  if (occupied.length === 0) return true
  const sameOrCenter = neighbors.filter(n => n.type === cell.type || n.type === 'center')
  return sameOrCenter.length / occupied.length >= threshold
}

function updateHappiness(grid: Cell[][], threshold: number): void {
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      grid[r][c].happy = isHappy(grid, r, c, threshold)
}

function simulateStep(grid: Cell[][], threshold: number): void {
  updateHappiness(grid, threshold)
  const unhappy: [number, number][] = []
  const empty: [number, number][] = []
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!grid[r][c].happy && (grid[r][c].type === 'triangle' || grid[r][c].type === 'circle'))
        unhappy.push([r, c])
      if (grid[r][c].type === 'empty')
        empty.push([r, c])
    }
  }
  for (let i = unhappy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unhappy[i], unhappy[j]] = [unhappy[j], unhappy[i]]
  }
  for (const [r, c] of unhappy) {
    if (empty.length === 0) break
    let bestIdx = -1
    let bestDist = Infinity
    for (let i = 0; i < empty.length; i++) {
      const [er, ec] = empty[i]
      const savedType = grid[er][ec].type
      grid[er][ec].type = grid[r][c].type
      const wouldBeHappy = isHappy(grid, er, ec, threshold)
      grid[er][ec].type = savedType
      if (wouldBeHappy) {
        const dist = Math.abs(er - r) + Math.abs(ec - c)
        if (dist < bestDist) { bestDist = dist; bestIdx = i }
      }
    }
    if (bestIdx >= 0) {
      const [er, ec] = empty[bestIdx]
      grid[er][ec].type = grid[r][c].type
      grid[r][c].type = 'empty'
      empty.splice(bestIdx, 1)
      empty.push([r, c])
    }
  }
  updateHappiness(grid, threshold)
}

// ── Scoring ────────────────────────────────────────────────────────────────────
function computeEntropy(grid: Cell[][]): number {
  let totalEntropy = 0
  let windows = 0
  for (let r = 0; r < GRID - 1; r++) {
    for (let c = 0; c < GRID - 1; c++) {
      const cells = [grid[r][c], grid[r][c+1], grid[r+1][c], grid[r+1][c+1]]
      const t = cells.filter(x => x.type === 'triangle').length
      const o = cells.filter(x => x.type === 'circle').length
      const total = t + o
      if (total < 2) continue
      const pt = t / total
      const po = o / total
      let entropy = 0
      if (pt > 0) entropy -= pt * Math.log2(pt)
      if (po > 0) entropy -= po * Math.log2(po)
      totalEntropy += entropy
      windows++
    }
  }
  return windows > 0 ? totalEntropy / windows : 0
}

function computeHappinessPercent(grid: Cell[][], threshold: number): number {
  let happy = 0, total = 0
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const t = grid[r][c].type
      if (t === 'triangle' || t === 'circle') {
        total++
        if (isHappy(grid, r, c, threshold)) happy++
      }
    }
  }
  return total > 0 ? (happy / total) * 100 : 0
}

// ── HUD update ─────────────────────────────────────────────────────────────────
function updateHUD(): void {
  const threshold = THRESHOLDS[state.round - 1]
  const happiness = computeHappinessPercent(state.grid, threshold)
  const entropy = computeEntropy(state.grid)
  setEl('hud-round', `${state.round}/${ROUNDS}`)
  setEl('hud-happiness', `${happiness.toFixed(0)}%`)
  setEl('hud-entropy', entropy.toFixed(2))
  setEl('hud-score', String(state.totalScore))
  setEl('hud-centers', String(state.centersLeft))
  setEl('hud-step',
    state.phase === 'simulate' ? `${state.step}/${SIM_STEPS}` :
    state.phase === 'place' ? 'PLACE' : 'DONE')
}

function setEl(id: string, text: string): void {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

// ── Renderer ───────────────────────────────────────────────────────────────────
let animFrame = 0

function drawGrid(): void {
  animFrame++
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#0f0f1a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const cs = cellSize
  const threshold = THRESHOLDS[state.round - 1]

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = state.grid[r][c]
      const x = c * cs
      const y = r * cs

      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2)

      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth = 0.5
      ctx.strokeRect(x, y, cs, cs)

      const cx2 = x + cs / 2
      const cy2 = y + cs / 2
      const radius = cs * 0.3

      if (cell.type === 'center') {
        const alpha = 0.6 + 0.15 * Math.sin(animFrame * 0.1)
        ctx.fillStyle = `rgba(167,139,250,${alpha})`
        ctx.beginPath()
        ctx.arc(cx2, cy2, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#a78bfa'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#fff'
        ctx.font = `${cs * 0.35}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('\u2605', cx2, cy2)
      } else if (cell.type === 'triangle') {
        const happy = isHappy(state.grid, r, c, threshold)
        if (!happy) {
          const grd = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, radius * 1.5)
          grd.addColorStop(0, 'rgba(239,68,68,0.4)')
          grd.addColorStop(1, 'rgba(239,68,68,0)')
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(cx2, cy2, radius * 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.beginPath()
        ctx.moveTo(cx2, cy2 - radius)
        ctx.lineTo(cx2 + radius * 0.87, cy2 + radius * 0.5)
        ctx.lineTo(cx2 - radius * 0.87, cy2 + radius * 0.5)
        ctx.closePath()
        ctx.fillStyle = happy ? '#60a5fa' : '#ef4444'
        ctx.fill()
        ctx.strokeStyle = happy ? '#93c5fd' : '#fca5a5'
        ctx.lineWidth = 1.5
        ctx.stroke()
      } else if (cell.type === 'circle') {
        const happy = isHappy(state.grid, r, c, threshold)
        if (!happy) {
          const grd = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, radius * 1.5)
          grd.addColorStop(0, 'rgba(239,68,68,0.4)')
          grd.addColorStop(1, 'rgba(239,68,68,0)')
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(cx2, cy2, radius * 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(cx2, cy2, radius, 0, Math.PI * 2)
        ctx.fillStyle = happy ? '#fb923c' : '#ef4444'
        ctx.fill()
        ctx.strokeStyle = happy ? '#fdba74' : '#fca5a5'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
  }
}

// ── Input ──────────────────────────────────────────────────────────────────────
function getCellFromEvent(e: MouseEvent | TouchEvent): [number, number] | null {
  const rect = canvas.getBoundingClientRect()
  let clientX: number, clientY: number
  if (e instanceof TouchEvent) {
    if (e.touches.length === 0) return null
    clientX = e.touches[0].clientX
    clientY = e.touches[0].clientY
  } else {
    clientX = (e as MouseEvent).clientX
    clientY = (e as MouseEvent).clientY
  }
  const x = clientX - rect.left
  const y = clientY - rect.top
  const c = Math.floor(x / cellSize)
  const r = Math.floor(y / cellSize)
  if (r < 0 || r >= GRID || c < 0 || c >= GRID) return null
  return [r, c]
}

canvas.addEventListener('click', (e) => {
  if (state.phase !== 'place') return
  const pos = getCellFromEvent(e)
  if (!pos) return
  const [r, c] = pos
  const cell = state.grid[r][c]
  if (cell.type === 'center') {
    cell.type = 'empty'
    state.centersLeft++
    audio.click()
  } else if (cell.type === 'empty' && state.centersLeft > 0) {
    cell.type = 'center'
    state.centersLeft--
    audio.blip()
  }
  updateHUD()
})

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  if (state.phase !== 'place') return
  const pos = getCellFromEvent(e)
  if (!pos) return
  const [r, c] = pos
  const cell = state.grid[r][c]
  if (cell.type === 'center') {
    cell.type = 'empty'
    state.centersLeft++
    audio.click()
  } else if (cell.type === 'empty' && state.centersLeft > 0) {
    cell.type = 'center'
    state.centersLeft--
    audio.blip()
  }
  updateHUD()
}, { passive: false })

// ── Controls ───────────────────────────────────────────────────────────────────
document.getElementById('btn-reset')!.addEventListener('click', () => {
  if (state.phase !== 'place') return
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      if (state.grid[r][c].type === 'center') state.grid[r][c].type = 'empty'
  state.centersLeft = CENTERS_PER_ROUND
  audio.click()
  updateHUD()
})

document.getElementById('btn-play')!.addEventListener('click', () => {
  if (state.phase !== 'place') return
  startSimulation()
})

// ── Simulation ─────────────────────────────────────────────────────────────────
function startSimulation(): void {
  state.phase = 'simulate'
  state.step = 0
  audio.start()
  const threshold = THRESHOLDS[state.round - 1]
  updateHappiness(state.grid, threshold)
  updateHUD()

  state.simTimer = window.setInterval(() => {
    const thr = THRESHOLDS[state.round - 1]
    simulateStep(state.grid, thr)
    state.step++
    updateHUD()
    if (state.step >= SIM_STEPS) {
      clearInterval(state.simTimer!)
      finishRound()
    }
  }, SIM_INTERVAL_MS)
}

function finishRound(): void {
  state.phase = 'result'
  const threshold = THRESHOLDS[state.round - 1]
  const entropy = computeEntropy(state.grid)
  const happiness = computeHappinessPercent(state.grid, threshold)
  const roundScore = Math.round(entropy * 100 + happiness * 0.5)
  state.roundScore = roundScore
  state.totalScore += roundScore
  reportScore(state.totalScore)

  if (state.totalScore > bestScore) {
    bestScore = state.totalScore
    saveBestScore(bestScore)
  }

  audio.levelUp()
  updateHUD()
  showResultOverlay(roundScore, entropy, happiness)
}

function nextRound(): void {
  if (state.round >= ROUNDS) {
    endGame()
    return
  }
  state.round++
  state.phase = 'place'
  state.centersLeft = CENTERS_PER_ROUND
  state.grid = makeGrid()
  populateGrid(state.grid)
  updateHUD()
}

function endGame(): void {
  state.phase = 'gameover'
  reportGameOver(state.totalScore)
  showGameOverOverlay()
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

function showResultOverlay(roundScore: number, entropy: number, happiness: number): void {
  clearOverlay()
  overlay.appendChild(makeEl('h1', `Round ${state.round} Complete!`, 'color:#a78bfa'))
  overlay.appendChild(makeEl('p', `Entropy: ${entropy.toFixed(3)}  |  Happiness: ${happiness.toFixed(0)}%`))
  overlay.appendChild(makeEl('div', `+${roundScore}`, 'font-size:clamp(28px,6vw,48px);color:#a78bfa;font-weight:bold'))
  overlay.appendChild(makeEl('p', `Total Score: ${state.totalScore}`))
  const nextLabel = state.round < ROUNDS
    ? `Next Round (threshold ${(THRESHOLDS[state.round] * 100).toFixed(0)}%)`
    : 'See Final Score'
  overlay.appendChild(makeOverlayBtn(nextLabel, () => {
    overlay.style.display = 'none'
    nextRound()
  }))
  overlay.style.display = 'flex'
}

function showGameOverOverlay(): void {
  clearOverlay()
  overlay.appendChild(makeEl('h1', 'Game Over', 'color:#a78bfa'))
  overlay.appendChild(makeEl('p', 'All 5 rounds complete!'))
  overlay.appendChild(makeEl('div', String(state.totalScore), 'font-size:clamp(28px,6vw,48px);color:#a78bfa;font-weight:bold'))
  overlay.appendChild(makeEl('p', `Best: ${bestScore}`, 'color:#888'))
  overlay.appendChild(makeOverlayBtn('Play Again', () => {
    overlay.style.display = 'none'
    state.round = 1
    state.phase = 'place'
    state.centersLeft = CENTERS_PER_ROUND
    state.totalScore = 0
    state.grid = makeGrid()
    populateGrid(state.grid)
    updateHUD()
  }))
  overlay.style.display = 'flex'
}

// ── Start overlay ──────────────────────────────────────────────────────────────
document.getElementById('overlay-btn')!.addEventListener('click', () => {
  overlay.style.display = 'none'
  audio.start()
})

// ── Mute ───────────────────────────────────────────────────────────────────────
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '\uD83D\uDD07' : '\uD83D\uDD0A'
})

// ── Main loop ──────────────────────────────────────────────────────────────────
function mainLoop(): void {
  drawGrid()
  requestAnimationFrame(mainLoop)
}

// ── Boot ───────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  try {
    const { bestScore: saved } = await initSDK('schelling-sort')
    bestScore = saved
  } catch {
    // standalone mode
  }

  state.grid = makeGrid()
  populateGrid(state.grid)
  updateHUD()
  requestAnimationFrame(mainLoop)
}

void boot()
