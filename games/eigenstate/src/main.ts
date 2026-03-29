import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────
type CellColor = 'red' | 'blue'
type CellState = 'superposition' | 'collapsed'

interface QuantumCell {
  state: CellState
  probRed: number   // 0-1, probability of being red
  collapsed: CellColor | null
  shimmerPhase: number  // animation
}

interface EntanglementLink {
  r1: number; c1: number
  r2: number; c2: number
  strength: number  // 0-1
}

interface PuzzleSnapshot {
  cells: QuantumCell[][]
  obsLeft: number
}

// ── Constants ──────────────────────────────────────────────────────────────────
const GRID = 6
const PUZZLES = 10
const UNDO_LIMIT = 2

// Observations allowed per puzzle level
const OBS_LIMITS = [8, 7, 7, 6, 6, 5, 5, 5, 4, 4]

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const canvasWrap = document.getElementById('canvas-wrap') as HTMLDivElement

let cellSize = 80

function resizeCanvas(): void {
  const avail = Math.min(
    canvasWrap.clientWidth || window.innerWidth,
    window.innerHeight - 120
  )
  cellSize = Math.floor(avail / GRID)
  canvas.width = cellSize * GRID
  canvas.height = cellSize * GRID
}

// ── State ──────────────────────────────────────────────────────────────────────
let cells: QuantumCell[][] = []
let entanglements: EntanglementLink[] = []
let puzzle = 1
let obsLeft = OBS_LIMITS[0]
let undosLeft = UNDO_LIMIT
let totalScore = 0
let bestScore = 0
let phase: 'play' | 'solved' | 'failed' | 'gameover' = 'play'
let history: PuzzleSnapshot[] = []
let animFrame = 0

// ── Puzzle generation ──────────────────────────────────────────────────────────
function generatePuzzle(level: number): void {
  cells = []
  entanglements = []
  history = []
  undosLeft = UNDO_LIMIT
  obsLeft = OBS_LIMITS[Math.min(level - 1, OBS_LIMITS.length - 1)]

  // Difficulty scaling: more extreme probabilities in early levels,
  // more balanced (harder to predict) in later levels
  const difficulty = (level - 1) / (PUZZLES - 1)  // 0-1

  for (let r = 0; r < GRID; r++) {
    cells.push([])
    for (let c = 0; c < GRID; c++) {
      // In easy levels, cells have strong bias. In hard levels, near 50/50
      let probRed: number
      if (difficulty < 0.3) {
        // Strong bias — easy to predict
        probRed = Math.random() < 0.5 ? 0.1 + Math.random() * 0.25 : 0.65 + Math.random() * 0.25
      } else if (difficulty < 0.6) {
        probRed = 0.25 + Math.random() * 0.5
      } else {
        probRed = 0.35 + Math.random() * 0.3
      }

      cells[r].push({
        state: 'superposition',
        probRed,
        collapsed: null,
        shimmerPhase: Math.random() * Math.PI * 2,
      })
    }
  }

  // Create entanglement links
  const linkCount = 4 + level * 2
  const attempted = new Set<string>()
  let links = 0
  while (links < linkCount) {
    const r1 = Math.floor(Math.random() * GRID)
    const c1 = Math.floor(Math.random() * GRID)
    const r2 = Math.floor(Math.random() * GRID)
    const c2 = Math.floor(Math.random() * GRID)
    const key = `${Math.min(r1*6+c1, r2*6+c2)},${Math.max(r1*6+c1, r2*6+c2)}`
    if (r1 === r2 && c1 === c2) continue
    if (attempted.has(key)) continue
    attempted.add(key)
    // Don't link cells in same row (that would make puzzle too easy)
    if (r1 === r2) continue
    entanglements.push({ r1, c1, r2, c2, strength: 0.2 + Math.random() * 0.4 })
    links++
  }

  updateUndoBtn()
  updateHUD()
}

// ── Observation logic ──────────────────────────────────────────────────────────
function observe(r: number, c: number): void {
  if (phase !== 'play') return
  if (cells[r][c].state === 'collapsed') return
  if (obsLeft <= 0) return

  // Save snapshot for undo
  if (history.length < UNDO_LIMIT * 2) {
    history.push(snapshotState())
  }

  // Collapse based on probability
  const cell = cells[r][c]
  const collapsed: CellColor = Math.random() < cell.probRed ? 'red' : 'blue'
  cell.state = 'collapsed'
  cell.collapsed = collapsed
  obsLeft--
  audio.blip()

  // Propagate entanglement effects
  propagateEntanglement(r, c, collapsed)

  // Check win/lose
  if (checkSolved()) {
    phase = 'solved'
    const bonus = obsLeft * 10
    totalScore += 100 + bonus
    reportScore(totalScore)
    if (totalScore > bestScore) { bestScore = totalScore; saveBestScore(bestScore) }
    audio.levelUp()
    updateHUD()
    setTimeout(() => showSolvedOverlay(bonus), 300)
  } else if (obsLeft <= 0 && !checkSolvable()) {
    phase = 'failed'
    audio.death()
    updateHUD()
    setTimeout(() => showFailedOverlay(), 300)
  } else {
    updateHUD()
  }
}

function propagateEntanglement(r: number, c: number, collapsed: CellColor): void {
  for (const link of entanglements) {
    let targetR = -1, targetC = -1
    let isLinked = false

    if (link.r1 === r && link.c1 === c) { targetR = link.r2; targetC = link.c2; isLinked = true }
    else if (link.r2 === r && link.c2 === c) { targetR = link.r1; targetC = link.c1; isLinked = true }

    if (!isLinked) continue
    const target = cells[targetR][targetC]
    if (target.state === 'collapsed') continue

    // Entanglement shifts probability toward same or opposite color
    // Positive entanglement = correlated (same color more likely)
    // For simplicity: half correlate, half anti-correlate
    const correlate = link.strength > 0.3
    if (correlate) {
      if (collapsed === 'red') target.probRed = Math.min(0.95, target.probRed + link.strength * 0.4)
      else target.probRed = Math.max(0.05, target.probRed - link.strength * 0.4)
    } else {
      if (collapsed === 'red') target.probRed = Math.max(0.05, target.probRed - link.strength * 0.4)
      else target.probRed = Math.min(0.95, target.probRed + link.strength * 0.4)
    }
  }
}

// ── Puzzle checks ──────────────────────────────────────────────────────────────
function checkSolved(): boolean {
  for (let r = 0; r < GRID; r++) {
    const row = cells[r]
    const collapsedCells = row.filter(c => c.state === 'collapsed')
    if (collapsedCells.length < GRID) continue  // row not fully collapsed

    const colors = new Set(collapsedCells.map(c => c.collapsed))
    if (colors.size > 1) return false  // mixed colors in this fully-collapsed row
  }
  // Check if ALL rows are fully collapsed and uniform
  for (let r = 0; r < GRID; r++) {
    const row = cells[r]
    if (row.some(c => c.state === 'superposition')) return false
    const colors = new Set(row.map(c => c.collapsed))
    if (colors.size > 1) return false
  }
  return true
}

function checkSolvable(): boolean {
  // Rough check: if any row has collapsed cells of different colors already, it's unsolvable
  for (let r = 0; r < GRID; r++) {
    const collapsed = cells[r].filter(c => c.state === 'collapsed')
    if (collapsed.length > 0) {
      const colors = new Set(collapsed.map(c => c.collapsed))
      if (colors.size > 1) return false
    }
  }
  return true
}

// ── Undo ───────────────────────────────────────────────────────────────────────
function snapshotState(): PuzzleSnapshot {
  return {
    cells: cells.map(row => row.map(cell => ({ ...cell }))),
    obsLeft,
  }
}

function undoLast(): void {
  if (history.length === 0 || undosLeft <= 0 || phase !== 'play') return
  const snap = history.pop()!
  cells = snap.cells
  obsLeft = snap.obsLeft
  undosLeft--
  audio.click()
  updateHUD()
  updateUndoBtn()
}

function updateUndoBtn(): void {
  const btn = document.getElementById('btn-undo') as HTMLButtonElement
  btn.textContent = `Undo (${undosLeft})`
  btn.disabled = undosLeft <= 0 || history.length === 0
}

// ── HUD ────────────────────────────────────────────────────────────────────────
function updateHUD(): void {
  setEl('hud-puzzle', `${puzzle}/${PUZZLES}`)
  setEl('hud-obs', String(obsLeft))
  setEl('hud-score', String(totalScore))
  setEl('hud-status', phase === 'play' ? 'PLAY' : phase === 'solved' ? 'SOLVED' : 'FAILED')
}

function setEl(id: string, text: string): void {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

// ── Renderer ───────────────────────────────────────────────────────────────────
function draw(): void {
  animFrame++
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#08080f'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const cs = cellSize

  // Draw entanglement lines first (behind cells)
  for (const link of entanglements) {
    const ax = link.c1 * cs + cs / 2
    const ay = link.r1 * cs + cs / 2
    const bx = link.c2 * cs + cs / 2
    const by = link.r2 * cs + cs / 2

    const cell1 = cells[link.r1][link.c1]
    const cell2 = cells[link.r2][link.c2]
    const bothCollapsed = cell1.state === 'collapsed' && cell2.state === 'collapsed'

    const alpha = bothCollapsed ? 0.15 : 0.25 + link.strength * 0.2
    const pulse = 0.5 + 0.3 * Math.sin(animFrame * 0.04 + link.r1 + link.c1)
    ctx.strokeStyle = `rgba(192,132,252,${alpha * pulse})`
    ctx.lineWidth = 1 + link.strength
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Draw cells
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = cells[r][c]
      const x = c * cs, y = r * cs
      const cx2 = x + cs / 2, cy2 = y + cs / 2

      // Cell background
      ctx.fillStyle = '#12121f'
      ctx.fillRect(x + 2, y + 2, cs - 4, cs - 4)

      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 2, y + 2, cs - 4, cs - 4)

      if (cell.state === 'collapsed' && cell.collapsed) {
        // Fully collapsed — solid color
        const col = cell.collapsed === 'red' ? '#ef4444' : '#3b82f6'
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.roundRect(x + 6, y + 6, cs - 12, cs - 12, 4)
        ctx.fill()

        // Border glow
        ctx.strokeStyle = cell.collapsed === 'red' ? '#fca5a5' : '#93c5fd'
        ctx.lineWidth = 2
        ctx.stroke()

        // Row solved indicator
        const rowSolved = cells[r].every(cc => cc.state === 'collapsed' && cc.collapsed === cells[r][0].collapsed)
        if (rowSolved) {
          ctx.strokeStyle = '#c084fc'
          ctx.lineWidth = 2.5
          ctx.strokeRect(x + 3, y + 3, cs - 6, cs - 6)
        }
      } else {
        // Superposition — shimmer between red and blue
        cell.shimmerPhase += 0.04
        const t = (Math.sin(cell.shimmerPhase) + 1) / 2  // 0-1
        const blended = blendColors('#ef4444', '#3b82f6', cell.probRed > 0.5 ? t * cell.probRed : 1 - t * (1 - cell.probRed))

        ctx.fillStyle = blended
        ctx.globalAlpha = 0.7
        ctx.beginPath()
        ctx.roundRect(x + 6, y + 6, cs - 12, cs - 12, 4)
        ctx.fill()
        ctx.globalAlpha = 1

        // Probability text
        const probPct = Math.round(cell.probRed * 100)
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.font = `bold ${cs * 0.18}px Courier New`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${probPct}R`, cx2, cy2 - cs * 0.1)
        ctx.fillStyle = 'rgba(200,200,255,0.7)'
        ctx.font = `${cs * 0.15}px Courier New`
        ctx.fillText(`${100 - probPct}B`, cx2, cy2 + cs * 0.1)

        // Pulsing outline
        const pulseAlpha = 0.3 + 0.2 * Math.sin(animFrame * 0.05 + r * 0.5 + c * 0.3)
        ctx.strokeStyle = cell.probRed > 0.5 ? `rgba(239,68,68,${pulseAlpha})` : `rgba(59,130,246,${pulseAlpha})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.roundRect(x + 6, y + 6, cs - 12, cs - 12, 4)
        ctx.stroke()
      }
    }
  }
}

function blendColors(c1: string, c2: string, t: number): string {
  const hex = (s: string) => [
    parseInt(s.slice(1, 3), 16),
    parseInt(s.slice(3, 5), 16),
    parseInt(s.slice(5, 7), 16),
  ]
  const [r1, g1, b1] = hex(c1)
  const [r2, g2, b2] = hex(c2)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r},${g},${b})`
}

// ── Input ──────────────────────────────────────────────────────────────────────
function getCellFromEvent(e: MouseEvent | TouchEvent): [number, number] | null {
  const rect = canvas.getBoundingClientRect()
  let clientX: number, clientY: number
  if (e instanceof TouchEvent) {
    if (e.touches.length === 0) return null
    clientX = e.touches[0].clientX; clientY = e.touches[0].clientY
  } else { clientX = (e as MouseEvent).clientX; clientY = (e as MouseEvent).clientY }
  const x = clientX - rect.left, y = clientY - rect.top
  const c = Math.floor(x / cellSize), r = Math.floor(y / cellSize)
  if (r < 0 || r >= GRID || c < 0 || c >= GRID) return null
  return [r, c]
}

canvas.addEventListener('click', (e) => {
  const pos = getCellFromEvent(e)
  if (!pos) return
  observe(pos[0], pos[1])
})

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const pos = getCellFromEvent(e)
  if (!pos) return
  observe(pos[0], pos[1])
}, { passive: false })

document.getElementById('btn-undo')!.addEventListener('click', undoLast)

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

function showSolvedOverlay(bonus: number): void {
  clearOverlay()
  overlay.appendChild(makeEl('h1', 'COLLAPSED!', 'color:#c084fc'))
  overlay.appendChild(makeEl('p', `All rows resolved. Observations remaining bonus: +${bonus}`))
  overlay.appendChild(makeEl('div', `+${100 + bonus}`, 'font-size:clamp(28px,6vw,48px);color:#c084fc;font-weight:bold'))

  if (puzzle < PUZZLES) {
    overlay.appendChild(makeOverlayBtn(`Next Puzzle (${OBS_LIMITS[puzzle]} obs)`, () => {
      overlay.style.display = 'none'
      puzzle++
      phase = 'play'
      generatePuzzle(puzzle)
    }))
  } else {
    phase = 'gameover'
    reportGameOver(totalScore)
    overlay.appendChild(makeEl('div', String(totalScore), 'font-size:clamp(32px,7vw,56px);color:#c084fc;font-weight:bold'))
    overlay.appendChild(makeEl('p', `Best: ${bestScore}`, 'color:#888'))
    overlay.appendChild(makeOverlayBtn('Play Again', () => {
      overlay.style.display = 'none'
      restartGame()
    }))
  }
  overlay.style.display = 'flex'
}

function showFailedOverlay(): void {
  clearOverlay()
  overlay.appendChild(makeEl('h1', 'DECOHERENCE', 'color:#f87171'))
  overlay.appendChild(makeEl('p', 'The quantum state is unsolvable. Too many wrong observations.'))
  overlay.appendChild(makeOverlayBtn('Retry Puzzle', () => {
    overlay.style.display = 'none'
    phase = 'play'
    generatePuzzle(puzzle)
  }))
  overlay.appendChild(makeOverlayBtn('Skip Puzzle', () => {
    overlay.style.display = 'none'
    if (puzzle < PUZZLES) {
      puzzle++
      phase = 'play'
      generatePuzzle(puzzle)
    } else {
      reportGameOver(totalScore)
      showFinalOverlay()
    }
  }))
  overlay.style.display = 'flex'
}

function showFinalOverlay(): void {
  clearOverlay()
  overlay.appendChild(makeEl('h1', 'GAME OVER', 'color:#c084fc'))
  overlay.appendChild(makeEl('div', String(totalScore), 'font-size:clamp(32px,7vw,56px);color:#c084fc;font-weight:bold'))
  overlay.appendChild(makeEl('p', `Best: ${bestScore}`, 'color:#888'))
  overlay.appendChild(makeOverlayBtn('Play Again', () => {
    overlay.style.display = 'none'
    restartGame()
  }))
  overlay.style.display = 'flex'
}

function restartGame(): void {
  puzzle = 1
  totalScore = 0
  phase = 'play'
  generatePuzzle(1)
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
  draw()
  requestAnimationFrame(mainLoop)
}

// ── Boot ───────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  try {
    const { bestScore: saved } = await initSDK('eigenstate')
    bestScore = saved
  } catch {
    // standalone
  }

  generatePuzzle(1)
  requestAnimationFrame(mainLoop)
}

void boot()
