import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────
type VoterColor = 'red' | 'blue'
type Phase = 'draw' | 'result' | 'ai' | 'gameover'

interface Voter {
  color: VoterColor
  district: number  // 0 = unassigned, 1-5 = district
}

// ── Constants ──────────────────────────────────────────────────────────────────
const GRID = 10
const DISTRICTS = 5
const CELLS_PER_DISTRICT = 20
const ROUNDS = 6

// District colors (semi-transparent)
const DISTRICT_COLORS = [
  'rgba(239,68,68,0.45)',    // red-tinted
  'rgba(59,130,246,0.45)',   // blue-tinted
  'rgba(34,197,94,0.45)',    // green
  'rgba(234,179,8,0.45)',    // yellow
  'rgba(168,85,247,0.45)',   // purple
]

const DISTRICT_BORDER_COLORS = ['#ef4444','#3b82f6','#22c55e','#eab308','#a855f7']

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const gCtx = canvas.getContext('2d')!
const canvasWrap = document.getElementById('canvas-wrap') as HTMLDivElement

let cellSize = 40

function resizeCanvas(): void {
  const avail = Math.min(
    canvasWrap.clientWidth || window.innerWidth,
    window.innerHeight - 120
  )
  cellSize = Math.floor(avail / GRID)
  canvas.width = cellSize * GRID
  canvas.height = cellSize * GRID
}

// ── Game state ─────────────────────────────────────────────────────────────────
let grid: Voter[][] = []
let phase: Phase = 'draw'
let currentDistrict = 1
let cellsInCurrent = 0
let round = 1
let totalScore = 0
let bestScore = 0
let hoverCell: [number, number] | null = null

// Compactness mode (rounds 5-6)
let compactnessMode = false

// ── Grid creation ──────────────────────────────────────────────────────────────
function makeGrid(): void {
  grid = []
  const total = GRID * GRID
  const redCount = Math.floor(total * 0.5)
  const colors: VoterColor[] = Array(redCount).fill('red').concat(Array(total - redCount).fill('blue'))
  // Shuffle
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]]
  }
  for (let r = 0; r < GRID; r++) {
    grid.push([])
    for (let c = 0; c < GRID; c++) {
      grid[r].push({ color: colors[r * GRID + c], district: 0 })
    }
  }
}

// ── Contiguity check ──────────────────────────────────────────────────────────
function isAdjacentToDistrict(r: number, c: number, d: number): boolean {
  if (cellsInCurrent === 0 && d === currentDistrict) return true
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]]
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && grid[nr][nc].district === d)
      return true
  }
  return false
}

// ── District scoring ───────────────────────────────────────────────────────────
function scoreDistricts(): { redWins: number, blueWins: number, perDistrict: { winner: VoterColor, red: number, blue: number }[] } {
  const perDistrict: { winner: VoterColor, red: number, blue: number }[] = []
  let redWins = 0, blueWins = 0

  for (let d = 1; d <= DISTRICTS; d++) {
    let red = 0, blue = 0
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (grid[r][c].district === d) {
          if (grid[r][c].color === 'red') red++
          else blue++
        }
    const winner: VoterColor = red > blue ? 'red' : 'blue'
    if (winner === 'red') redWins++
    else blueWins++
    perDistrict.push({ winner, red, blue })
  }

  return { redWins, blueWins, perDistrict }
}

function computeEfficiencyGap(): number {
  // Simplified efficiency gap: wasted votes / total votes
  let totalWasted = 0
  let totalVotes = 0
  for (let d = 1; d <= DISTRICTS; d++) {
    let red = 0, blue = 0
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (grid[r][c].district === d) {
          if (grid[r][c].color === 'red') red++
          else blue++
        }
    const tot = red + blue
    totalVotes += tot
    const needed = Math.floor(tot / 2) + 1
    if (red > blue) {
      totalWasted += (red - needed) + blue  // winner surplus + loser all
    } else {
      totalWasted += (blue - needed) + red
    }
  }
  return totalVotes > 0 ? totalWasted / totalVotes : 0
}

function computeCompactness(d: number): number {
  // Polsby-Popper compactness = 4π * area / perimeter^2
  let area = 0
  let perimeter = 0
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]]
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r][c].district === d) {
        area++
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc
          if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID || grid[nr][nc].district !== d)
            perimeter++
        }
      }
    }
  }
  if (perimeter === 0) return 1
  return (4 * Math.PI * area) / (perimeter * perimeter)
}

// ── AI gerrymander ─────────────────────────────────────────────────────────────
function aiGerrymander(): void {
  // AI tries to win maximum districts for blue
  // Simple greedy: BFS from high-blue-concentration seeds
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      grid[r][c].district = 0

  const unassigned = new Set<string>()
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      unassigned.add(`${r},${c}`)

  for (let d = 1; d <= DISTRICTS; d++) {
    // Find cell with most blue neighbors that is unassigned
    let bestSeed = ''
    let bestBlue = -1
    for (const key of unassigned) {
      const [r, c] = key.split(',').map(Number)
      let blueCount = grid[r][c].color === 'blue' ? 2 : 0
      const dirs = [[0,1],[0,-1],[1,0],[-1,0]]
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc
        if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && grid[nr][nc].color === 'blue')
          blueCount++
      }
      if (blueCount > bestBlue) { bestBlue = blueCount; bestSeed = key }
    }
    if (!bestSeed) break

    // BFS from seed, preferring blue cells
    const queue: string[] = [bestSeed]
    const inDistrict = new Set<string>([bestSeed])
    unassigned.delete(bestSeed)
    const [sr, sc] = bestSeed.split(',').map(Number)
    grid[sr][sc].district = d

    while (inDistrict.size < CELLS_PER_DISTRICT && queue.length > 0) {
      const key = queue.shift()!
      const [r, c] = key.split(',').map(Number)
      const dirs = [[0,1],[0,-1],[1,0],[-1,0]]
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc
        const nkey = `${nr},${nc}`
        if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID
          && unassigned.has(nkey) && !inDistrict.has(nkey)) {
          inDistrict.add(nkey)
          unassigned.delete(nkey)
          grid[nr][nc].district = d
          queue.push(nkey)
          if (inDistrict.size >= CELLS_PER_DISTRICT) break
        }
      }
    }
  }
}

// ── Drawing ────────────────────────────────────────────────────────────────────
function draw(): void {
  gCtx.clearRect(0, 0, canvas.width, canvas.height)
  gCtx.fillStyle = '#0d1117'
  gCtx.fillRect(0, 0, canvas.width, canvas.height)

  const cs = cellSize

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const voter = grid[r][c]
      const x = c * cs, y = r * cs
      const isHovered = hoverCell?.[0] === r && hoverCell?.[1] === c

      // District background
      if (voter.district > 0) {
        gCtx.fillStyle = DISTRICT_COLORS[voter.district - 1]
        gCtx.fillRect(x, y, cs, cs)
      } else {
        gCtx.fillStyle = '#1c2333'
        gCtx.fillRect(x + 1, y + 1, cs - 2, cs - 2)
      }

      // Hover highlight for valid next cell
      if (isHovered && phase === 'draw' && voter.district === 0) {
        const valid = isAdjacentToDistrict(r, c, currentDistrict) && currentDistrict <= DISTRICTS
        gCtx.fillStyle = valid ? 'rgba(255,255,255,0.2)' : 'rgba(255,0,0,0.1)'
        gCtx.fillRect(x, y, cs, cs)
      }

      // Voter dot
      const cx = x + cs / 2, cy = y + cs / 2
      const dotR = cs * 0.22
      gCtx.beginPath()
      gCtx.arc(cx, cy, dotR, 0, Math.PI * 2)
      gCtx.fillStyle = voter.color === 'red' ? '#ef4444' : '#3b82f6'
      gCtx.fill()

      // Grid border
      gCtx.strokeStyle = 'rgba(255,255,255,0.08)'
      gCtx.lineWidth = 0.5
      gCtx.strokeRect(x, y, cs, cs)
    }
  }

  // Draw district borders (thick lines between different districts)
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const d = grid[r][c].district
      if (d === 0) continue
      const x = c * cs, y = r * cs
      gCtx.lineWidth = 2.5
      gCtx.strokeStyle = DISTRICT_BORDER_COLORS[d - 1]
      // Right
      if (c + 1 < GRID && grid[r][c+1].district !== d) {
        gCtx.beginPath(); gCtx.moveTo(x + cs, y); gCtx.lineTo(x + cs, y + cs); gCtx.stroke()
      }
      // Bottom
      if (r + 1 < GRID && grid[r+1][c].district !== d) {
        gCtx.beginPath(); gCtx.moveTo(x, y + cs); gCtx.lineTo(x + cs, y + cs); gCtx.stroke()
      }
      // Left edge
      if (c === 0 || grid[r][c-1].district !== d) {
        gCtx.beginPath(); gCtx.moveTo(x, y); gCtx.lineTo(x, y + cs); gCtx.stroke()
      }
      // Top edge
      if (r === 0 || grid[r-1][c].district !== d) {
        gCtx.beginPath(); gCtx.moveTo(x, y); gCtx.lineTo(x + cs, y); gCtx.stroke()
      }
    }
  }
}

// ── HUD update ─────────────────────────────────────────────────────────────────
function updateHUD(): void {
  const eg = phase === 'result' || phase === 'ai' ? computeEfficiencyGap() : 0
  setEl('hud-round', `${round}/${ROUNDS}`)
  setEl('hud-district', String(currentDistrict))
  setEl('hud-cells', String(CELLS_PER_DISTRICT - cellsInCurrent))
  setEl('hud-wins', String(scoreDistricts().redWins))
  setEl('hud-score', String(totalScore))
  setEl('hud-fairness', phase === 'draw' ? '-' : `${(eg * 100).toFixed(0)}%`)
}

function setEl(id: string, text: string): void {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

// ── Input ──────────────────────────────────────────────────────────────────────
function getCellFromEvent(e: MouseEvent | TouchEvent): [number, number] | null {
  const rect = canvas.getBoundingClientRect()
  let clientX: number, clientY: number
  if (e instanceof TouchEvent) {
    if (e.touches.length === 0) return null
    clientX = e.touches[0].clientX; clientY = e.touches[0].clientY
  } else {
    clientX = (e as MouseEvent).clientX; clientY = (e as MouseEvent).clientY
  }
  const x = clientX - rect.left, y = clientY - rect.top
  const c = Math.floor(x / cellSize), r = Math.floor(y / cellSize)
  if (r < 0 || r >= GRID || c < 0 || c >= GRID) return null
  return [r, c]
}

canvas.addEventListener('mousemove', (e) => {
  hoverCell = getCellFromEvent(e)
})

canvas.addEventListener('mouseleave', () => { hoverCell = null })

canvas.addEventListener('click', (e) => {
  if (phase !== 'draw') return
  const pos = getCellFromEvent(e)
  if (!pos) return
  const [r, c] = pos
  if (grid[r][c].district !== 0) return
  if (currentDistrict > DISTRICTS) return
  if (!isAdjacentToDistrict(r, c, currentDistrict)) return

  grid[r][c].district = currentDistrict
  cellsInCurrent++
  audio.blip()

  if (cellsInCurrent >= CELLS_PER_DISTRICT) {
    if (currentDistrict < DISTRICTS) {
      currentDistrict++
      cellsInCurrent = 0
      audio.combo()
    } else {
      // All districts drawn
      finishDrawing()
    }
  }
  updateHUD()
})

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  if (phase !== 'draw') return
  const pos = getCellFromEvent(e)
  if (!pos) return
  const [r, c] = pos
  if (grid[r][c].district !== 0 || currentDistrict > DISTRICTS) return
  if (!isAdjacentToDistrict(r, c, currentDistrict)) return
  grid[r][c].district = currentDistrict
  cellsInCurrent++
  audio.blip()
  if (cellsInCurrent >= CELLS_PER_DISTRICT) {
    if (currentDistrict < DISTRICTS) { currentDistrict++; cellsInCurrent = 0; audio.combo() }
    else finishDrawing()
  }
  updateHUD()
}, { passive: false })

// ── Game flow ──────────────────────────────────────────────────────────────────
function finishDrawing(): void {
  phase = 'result'
  audio.levelUp()
  const { redWins, perDistrict } = scoreDistricts()
  const eg = computeEfficiencyGap()

  // Check compactness constraint
  let compactnessOk = true
  if (compactnessMode) {
    for (let d = 1; d <= DISTRICTS; d++) {
      if (computeCompactness(d) < 0.1) { compactnessOk = false; break }
    }
  }

  const won = redWins >= 4 && compactnessOk
  const roundScore = won ? Math.round(100 - eg * 100) + redWins * 10 : redWins * 10
  totalScore += roundScore

  if (totalScore > bestScore) {
    bestScore = totalScore
    saveBestScore(bestScore)
  }

  reportScore(totalScore)
  updateHUD()
  updateResultsPanel(perDistrict)
  showResultOverlay(won, redWins, roundScore, eg, compactnessOk)
}

function updateResultsPanel(perDistrict: { winner: VoterColor, red: number, blue: number }[]): void {
  const panel = document.getElementById('results-panel')!
  while (panel.firstChild) panel.removeChild(panel.firstChild)
  perDistrict.forEach((d, i) => {
    const div = document.createElement('div')
    div.className = 'district-result'
    div.textContent = `D${i+1}: ${d.winner === 'red' ? 'RED' : 'BLUE'} (${d.red}R/${d.blue}B)`
    div.setAttribute('style', `background:${DISTRICT_COLORS[i]};border:1px solid ${DISTRICT_BORDER_COLORS[i]}`)
    panel.appendChild(div)
  })
}

function showResultOverlay(won: boolean, redWins: number, roundScore: number, eg: number, compactnessOk: boolean): void {
  clearOverlay()
  overlay.appendChild(makeEl('h1', won ? 'You Win!' : 'Round Lost', `color:${won ? '#fbbf24' : '#f87171'}`))
  overlay.appendChild(makeEl('p', `Red won ${redWins}/5 districts`))
  if (compactnessMode && !compactnessOk) {
    overlay.appendChild(makeEl('p', 'Compactness constraint violated!', 'color:#f87171'))
  }
  overlay.appendChild(makeEl('p', `Efficiency gap: ${(eg * 100).toFixed(0)}% (lower = fairer)`))
  overlay.appendChild(makeEl('div', `+${roundScore}`, 'font-size:clamp(24px,5vw,40px);color:#fbbf24;font-weight:bold'))

  if (round < ROUNDS) {
    const nextLabel = round + 1 <= 2 ? 'Watch AI Gerrymander' : `Round ${round + 1}`
    overlay.appendChild(makeOverlayBtn(nextLabel, () => {
      overlay.style.display = 'none'
      if (round % 2 === 1 && round < ROUNDS) {
        // AI round
        showAIRound()
      } else {
        startNextRound()
      }
    }))
  } else {
    phase = 'gameover'
    reportGameOver(totalScore)
    overlay.appendChild(makeEl('p', `Best: ${bestScore}`, 'color:#888'))
    overlay.appendChild(makeOverlayBtn('Play Again', () => {
      overlay.style.display = 'none'
      restartGame()
    }))
  }
  overlay.style.display = 'flex'
}

function showAIRound(): void {
  phase = 'ai'
  makeGrid()
  aiGerrymander()
  const { blueWins, perDistrict } = scoreDistricts()
  const eg = computeEfficiencyGap()
  updateResultsPanel(perDistrict)

  clearOverlay()
  overlay.appendChild(makeEl('h1', 'AI Gerrymandr!', 'color:#3b82f6'))
  overlay.appendChild(makeEl('p', `The AI drew districts for Blue. Blue won ${blueWins}/5!`))
  overlay.appendChild(makeEl('p', `Efficiency gap: ${(eg * 100).toFixed(0)}%`))
  overlay.appendChild(makeOverlayBtn('Your Turn Next', () => {
    overlay.style.display = 'none'
    round++
    startNextRound()
  }))
  overlay.style.display = 'flex'
}

function startNextRound(): void {
  round++
  phase = 'draw'
  currentDistrict = 1
  cellsInCurrent = 0
  compactnessMode = round >= 5
  makeGrid()
  updateHUD()

  const panel = document.getElementById('results-panel')!
  while (panel.firstChild) panel.removeChild(panel.firstChild)
}

function restartGame(): void {
  round = 1
  totalScore = 0
  phase = 'draw'
  currentDistrict = 1
  cellsInCurrent = 0
  compactnessMode = false
  makeGrid()
  updateHUD()
  const panel = document.getElementById('results-panel')!
  while (panel.firstChild) panel.removeChild(panel.firstChild)
}

// ── Overlay helpers ────────────────────────────────────────────────────────────
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
    const { bestScore: saved } = await initSDK('gerrymandr')
    bestScore = saved
  } catch {
    // standalone
  }

  makeGrid()
  updateHUD()
  requestAnimationFrame(mainLoop)
}

void boot()
