import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
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

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID = 40
const TICK_MS = 180

// Lichen types: 0 = empty, 1 = TypeA (blue), 2 = TypeB (orange), 3 = TypeC (green), 4 = AI type
// Player always uses types 1-3; AI uses the same types but mirrored across grid

// Type properties
interface LichenType {
  spreadChance: number    // base spread probability per tick
  toxinRange: number      // radius that kills type A (0 = no toxin)
  toxinImmune: boolean    // immune to toxin
  color: string
  name: string
}

const TYPES: Record<number, LichenType> = {
  1: { spreadChance: 0.30, toxinRange: 0, toxinImmune: false, color: '#4488ff', name: 'Alpha' },
  2: { spreadChance: 0.20, toxinRange: 2, toxinImmune: false, color: '#ff8844', name: 'Beta' },
  3: { spreadChance: 0.15, toxinRange: 0, toxinImmune: true,  color: '#44ff88', name: 'Gamma' },
  // AI variants (4=AI-A, 5=AI-B, 6=AI-C) — same mechanics, different palette
  4: { spreadChance: 0.30, toxinRange: 0, toxinImmune: false, color: '#cc44ff', name: 'AI-A' },
  5: { spreadChance: 0.20, toxinRange: 2, toxinImmune: false, color: '#ff44cc', name: 'AI-B' },
  6: { spreadChance: 0.15, toxinRange: 0, toxinImmune: true,  color: '#ff6644', name: 'AI-C' },
}

// Mutation bonuses that accumulate across rounds
interface Mutations {
  spreadBonus: number      // +spread chance for all player types
  toxinBonus: number       // +toxin range for type 2
  immuneBonus: boolean     // player types immune to toxin
}

// ── Game state ────────────────────────────────────────────────────────────────

type Phase = 'READY' | 'PLACE_PLAYER' | 'PLACE_AI' | 'SIMULATING' | 'ROUND_OVER' | 'MUTATION' | 'GAME_OVER'

interface State {
  phase: Phase
  grid: Uint8Array          // GRID*GRID cells, value = type (0 = empty)
  playerSeeds: number       // seeds placed so far this round
  aiSeeds: number
  tick: number
  maxTicks: number
  lastTick: number
  round: number
  score: number             // best territory % achieved
  bestScore: number
  mutations: Mutations
  mutationChoices: MutationOption[]
  roundScore: number        // territory % this round
  message: string | null
  messageTime: number
}

interface MutationOption {
  label: string
  desc: string
  apply: (m: Mutations) => void
}

let state: State = buildInitialState()

function buildInitialState(): State {
  return {
    phase: 'READY',
    grid: new Uint8Array(GRID * GRID),
    playerSeeds: 0, aiSeeds: 0,
    tick: 0, maxTicks: 200,
    lastTick: 0,
    round: 1, score: 0, bestScore: 0,
    mutations: { spreadBonus: 0, toxinBonus: 0, immuneBonus: false },
    mutationChoices: [],
    roundScore: 0,
    message: null, messageTime: 0,
  }
}

function idx(r: number, c: number): number { return r * GRID + c }
function getCell(grid: Uint8Array, r: number, c: number): number {
  if (r < 0 || r >= GRID || c < 0 || c >= GRID) return -1
  return grid[idx(r, c)]
}

// ── AI placement strategy ─────────────────────────────────────────────────────

function aiPlaceSeeds(grid: Uint8Array): void {
  // AI places 3 seeds: one of each type, spread across the far side of the grid
  const aiTypes = [4, 5, 6]
  const placed: number[] = []
  for (const t of aiTypes) {
    let attempts = 0
    while (attempts < 100) {
      const r = Math.floor(Math.random() * GRID)
      const c = Math.floor(Math.random() * GRID)
      // Keep AI seeds in the right half
      if (c < GRID / 2) { attempts++; continue }
      if (grid[idx(r, c)] !== 0) { attempts++; continue }
      let tooClose = false
      for (const pi of placed) {
        const pr = Math.floor(pi / GRID); const pc = pi % GRID
        if (Math.abs(r - pr) < 4 && Math.abs(c - pc) < 4) { tooClose = true; break }
      }
      if (tooClose) { attempts++; continue }
      grid[idx(r, c)] = t
      placed.push(idx(r, c))
      break
    }
  }
}

// ── Simulation step ───────────────────────────────────────────────────────────

function simulateTick(grid: Uint8Array, mutations: Mutations): Uint8Array {
  const next = new Uint8Array(grid)

  // Build adjacency counts per cell per type
  // For spread: each occupied cell may spread to adjacent empty cells
  const spreadVotes = new Map<number, Map<number, number>>() // cellIdx -> (typeId -> count)

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const type = grid[idx(r, c)]
      if (type === 0) continue
      const tProps = TYPES[type]
      const spread = Math.min(0.9, tProps.spreadChance + mutations.spreadBonus)
      // Try to spread to all 4 neighbors
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc
        if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue
        if (grid[idx(nr, nc)] !== 0) continue
        if (Math.random() < spread) {
          const ni = idx(nr, nc)
          if (!spreadVotes.has(ni)) spreadVotes.set(ni, new Map())
          const votes = spreadVotes.get(ni)!
          votes.set(type, (votes.get(type) ?? 0) + 1)
        }
      }
    }
  }

  // Resolve spread votes: most votes wins; ties broken randomly
  for (const [ni, votes] of spreadVotes) {
    let bestType = 0, bestCount = 0
    for (const [t, count] of votes) {
      if (count > bestCount || (count === bestCount && Math.random() < 0.5)) {
        bestType = t; bestCount = count
      }
    }
    next[ni] = bestType
  }

  // Toxin killing: types 2 and 5 produce toxin that kills type 1 / type 4 within range
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const type = grid[idx(r, c)]
      if (type !== 2 && type !== 5) continue
      const tProps = TYPES[type]
      const range = tProps.toxinRange + mutations.toxinBonus
      // Kill nearby type A / AI-A
      for (let dr = -range; dr <= range; dr++) {
        for (let dc = -range; dc <= range; dc++) {
          const nr = r + dr, nc = c + dc
          if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue
          const victim = next[idx(nr, nc)]
          // Type 1 killed by type 2 toxin; type 4 killed by type 5 toxin
          if ((type === 2 && victim === 1) || (type === 5 && victim === 4)) {
            // Type 3 / type 6 are immune to toxin
            const victimProps = TYPES[victim]
            const immune = victimProps.toxinImmune || (mutations.immuneBonus && (victim === 1 || victim === 2 || victim === 3))
            if (!immune) next[idx(nr, nc)] = 0
          }
        }
      }
    }
  }

  return next
}

// ── Round management ──────────────────────────────────────────────────────────

function startRound(): void {
  const grid = new Uint8Array(GRID * GRID)
  state.grid = grid
  state.playerSeeds = 0
  state.aiSeeds = 0
  state.tick = 0
  state.phase = 'PLACE_PLAYER'
  state.message = 'Place 3 lichen seeds (A=Blue, B=Orange, C=Green)'
  state.messageTime = performance.now()
}

function generateMutationChoices(): MutationOption[] {
  const options: MutationOption[] = [
    {
      label: 'RAPID SPREAD',
      desc: '+10% spread for all types',
      apply: m => { m.spreadBonus += 0.10 },
    },
    {
      label: 'WIDE TOXIN',
      desc: '+1 toxin range for Beta',
      apply: m => { m.toxinBonus += 1 },
    },
    {
      label: 'IMMUNITY',
      desc: 'All player types immune to toxin',
      apply: m => { m.immuneBonus = true },
    },
    {
      label: 'OVERCLOCK',
      desc: '+15% spread for Alpha only',
      apply: m => { m.spreadBonus += 0.15 },
    },
    {
      label: 'TOXIN BURST',
      desc: '+2 toxin range for Beta',
      apply: m => { m.toxinBonus += 2 },
    },
  ]
  // Return 3 random distinct options
  return options.sort(() => Math.random() - 0.5).slice(0, 3)
}

function computeScore(): number {
  let player = 0, ai = 0
  for (const v of state.grid) {
    if (v >= 1 && v <= 3) player++
    else if (v >= 4 && v <= 6) ai++
  }
  const total = GRID * GRID
  return Math.round((player / total) * 100)
}

function endRound(): void {
  const pct = computeScore()
  state.roundScore = pct
  if (pct > state.score) {
    state.score = pct
    saveBestScore(state.score)
  }
  if (pct > state.bestScore) {
    state.bestScore = pct
    bestEl.textContent = String(pct)
  }
  reportScore(state.score)
  state.phase = 'ROUND_OVER'
  audio.levelUp()
}

// ── Click handling ────────────────────────────────────────────────────────────

// Grid layout computed each frame
let gridOffsetX = 0, gridOffsetY = 0, cellSize = 0

function handleClick(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top

  if (state.phase === 'READY') { startGame(); return }
  if (state.phase === 'GAME_OVER') { startGame(); return }

  if (state.phase === 'ROUND_OVER') {
    // Show mutations
    state.mutationChoices = generateMutationChoices()
    state.phase = 'MUTATION'
    return
  }

  if (state.phase === 'MUTATION') {
    // Check which mutation button was clicked
    const btnH = 60, btnW = canvas.width - 60, btnX = 30
    const W = canvas.width, H = canvas.height
    for (let i = 0; i < state.mutationChoices.length; i++) {
      const btnY = H / 2 - 30 + i * (btnH + 10)
      if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
        state.mutationChoices[i].apply(state.mutations)
        audio.powerup()
        state.round++
        scoreEl.textContent = String(state.round)
        startRound()
        return
      }
    }
    return
  }

  if (state.phase === 'PLACE_PLAYER') {
    // Convert canvas click to grid cell
    const c = Math.floor((x - gridOffsetX) / cellSize)
    const r = Math.floor((y - gridOffsetY) / cellSize)
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return
    if (state.grid[idx(r, c)] !== 0) return
    // Limit player seeds to left half
    if (c >= GRID / 2) {
      state.message = 'Place seeds in the left half!'
      state.messageTime = performance.now()
      return
    }

    // Assign type based on placement order: 1st=A, 2nd=B, 3rd=C
    const typeMap = [1, 2, 3]
    const type = typeMap[state.playerSeeds]
    state.grid[idx(r, c)] = type
    state.playerSeeds++
    audio.click()

    if (state.playerSeeds === 3) {
      // AI places its seeds
      aiPlaceSeeds(state.grid)
      state.lastTick = performance.now()
      state.phase = 'SIMULATING'
      state.message = 'Simulation running!'
      state.messageTime = performance.now()
    } else {
      const names = ['Alpha (Blue)', 'Beta (Orange)', 'Gamma (Green)']
      state.message = `Place seed ${state.playerSeeds + 1}: ${names[state.playerSeeds]}`
      state.messageTime = performance.now()
    }
  }
}

canvas.addEventListener('click', e => handleClick(e.clientX, e.clientY))
canvas.addEventListener('touchend', e => {
  e.preventDefault()
  const t = e.changedTouches[0]
  handleClick(t.clientX, t.clientY)
})

window.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && (state.phase === 'READY' || state.phase === 'GAME_OVER')) {
    startGame()
  }
})

// ── Game start ────────────────────────────────────────────────────────────────

function startGame(): void {
  audio.start()
  state = buildInitialState()
  state.bestScore = state.bestScore  // preserve from SDK load
  scoreEl.textContent = '1'
  startRound()
}

// ── Rendering ─────────────────────────────────────────────────────────────────

// Color cache with alpha
const TYPE_COLORS_DARK: Record<number, string> = {
  1: '#2255aa', 2: '#aa5522', 3: '#225522',
  4: '#772299', 5: '#992277', 6: '#994422',
}

function drawGrid(now: number): void {
  const W = canvas.width, H = canvas.height
  const gridSize = Math.min(W, H) * 0.92
  cellSize = gridSize / GRID
  gridOffsetX = (W - gridSize) / 2
  gridOffsetY = (H - gridSize) / 2

  // Grid background
  ctx.fillStyle = '#0a0f0a'
  ctx.fillRect(gridOffsetX, gridOffsetY, gridSize, gridSize)

  // Draw cells
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const type = state.grid[idx(r, c)]
      if (type === 0) continue
      const x = gridOffsetX + c * cellSize
      const y = gridOffsetY + r * cellSize
      const tProps = TYPES[type]
      ctx.fillStyle = tProps.color
      ctx.fillRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1)
    }
  }

  // Grid lines (subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 0.5
  for (let r = 0; r <= GRID; r++) {
    ctx.beginPath()
    ctx.moveTo(gridOffsetX, gridOffsetY + r * cellSize)
    ctx.lineTo(gridOffsetX + gridSize, gridOffsetY + r * cellSize)
    ctx.stroke()
  }
  for (let c = 0; c <= GRID; c++) {
    ctx.beginPath()
    ctx.moveTo(gridOffsetX + c * cellSize, gridOffsetY)
    ctx.lineTo(gridOffsetX + c * cellSize, gridOffsetY + gridSize)
    ctx.stroke()
  }

  // Dividing line (left vs right half)
  if (state.phase === 'PLACE_PLAYER') {
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(gridOffsetX + gridSize / 2, gridOffsetY)
    ctx.lineTo(gridOffsetX + gridSize / 2, gridOffsetY + gridSize)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Territory percentages overlay
  if (state.phase === 'SIMULATING' || state.phase === 'ROUND_OVER') {
    let player = 0, ai = 0
    for (const v of state.grid) {
      if (v >= 1 && v <= 3) player++
      else if (v >= 4 && v <= 6) ai++
    }
    const total = GRID * GRID
    const pp = Math.round(player / total * 100)
    const ap = Math.round(ai / total * 100)

    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(gridOffsetX, gridOffsetY + gridSize - 22, gridSize, 22)
    ctx.font = 'bold 13px Courier New'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#88aaff'
    ctx.fillText(`YOU: ${pp}%`, gridOffsetX + 8, gridOffsetY + gridSize - 6)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#ff88cc'
    ctx.fillText(`AI: ${ap}%`, gridOffsetX + gridSize - 8, gridOffsetY + gridSize - 6)

    // Tick counter
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '11px Courier New'
    ctx.fillText(`TICK ${state.tick}/${state.maxTicks}`, gridOffsetX + gridSize / 2, gridOffsetY + gridSize - 6)
  }

  // Legend
  const legendY = gridOffsetY + gridSize + 12
  const types = [
    { type: 1, label: 'α Spread 30%' },
    { type: 2, label: 'β Toxin' },
    { type: 3, label: 'γ Immune' },
  ]
  const lW = gridSize / 3
  for (let i = 0; i < types.length; i++) {
    const lx = gridOffsetX + i * lW + lW / 2
    ctx.fillStyle = TYPES[types[i].type].color
    ctx.fillRect(lx - 30, legendY, 12, 12)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '11px Courier New'
    ctx.textAlign = 'left'
    ctx.fillText(types[i].label, lx - 14, legendY + 11)
  }

  // Flash message
  if (state.message) {
    const age = (now - state.messageTime) / 2000
    if (age < 1) {
      ctx.globalAlpha = Math.min(1, (1 - age) * 2)
      ctx.font = 'bold 14px Courier New'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(state.message, W / 2, gridOffsetY - 14)
      ctx.globalAlpha = 1
    } else {
      state.message = null
    }
  }
}

function renderGame(now: number): void {
  const W = canvas.width, H = canvas.height
  ctx.fillStyle = '#0a0f0a'
  ctx.fillRect(0, 0, W, H)

  if (state.phase === 'READY') { drawReadyScreen(W, H); return }
  if (state.phase === 'GAME_OVER') { drawGameOverScreen(W, H); return }
  if (state.phase === 'ROUND_OVER') { drawGrid(now); drawRoundOverScreen(W, H); return }
  if (state.phase === 'MUTATION') { drawMutationScreen(W, H); return }

  drawGrid(now)

  // Run simulation tick
  if (state.phase === 'SIMULATING') {
    if (now - state.lastTick >= TICK_MS) {
      state.grid = simulateTick(state.grid, state.mutations)
      state.tick++
      state.lastTick = now
      if (state.tick >= state.maxTicks) {
        endRound()
      } else {
        // Check if no empty cells remain
        let empty = 0
        for (const v of state.grid) if (v === 0) empty++
        if (empty === 0) endRound()
      }
    }
  }
}

function drawReadyScreen(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#44ff88'
  ctx.font = `bold ${Math.min(48, W * 0.1)}px Courier New`
  ctx.fillText('LICHEN WARS', W / 2, H / 2 - 100)

  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `${Math.min(14, W * 0.032)}px Courier New`
  const lines = [
    'A 40x40 petri dish. Place 3 seeds in the left half.',
    'α = fast spread  |  β = toxin kills α  |  γ = immune to toxin',
    'AI claims the right half. Simulation runs 200 ticks.',
    'Most territory wins! Earn mutations between rounds.',
    '',
    'CLICK or ENTER to start',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 40 + i * 24))
}

function drawRoundOverScreen(W: number, H: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillRect(W / 2 - 160, H / 2 - 60, 320, 130)
  ctx.strokeStyle = 'rgba(100,255,100,0.4)'
  ctx.lineWidth = 1
  ctx.strokeRect(W / 2 - 160, H / 2 - 60, 320, 130)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#44ff88'
  ctx.font = 'bold 22px Courier New'
  ctx.fillText(`ROUND ${state.round} COMPLETE`, W / 2, H / 2 - 30)
  ctx.fillStyle = '#ffffff'
  ctx.font = '18px Courier New'
  ctx.fillText(`Territory: ${state.roundScore}%`, W / 2, H / 2 + 5)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '13px Courier New'
  ctx.fillText('Click to choose a mutation', W / 2, H / 2 + 40)
}

function drawMutationScreen(W: number, H: number): void {
  ctx.fillStyle = '#0a0f0a'
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#44ff88'
  ctx.font = 'bold 24px Courier New'
  ctx.fillText('CHOOSE A MUTATION', W / 2, H / 2 - 100)

  const btnH = 60, btnW = W - 60, btnX = 30
  for (let i = 0; i < state.mutationChoices.length; i++) {
    const m = state.mutationChoices[i]
    const btnY = H / 2 - 30 + i * (btnH + 10)

    ctx.fillStyle = 'rgba(0,60,20,0.8)'
    ctx.strokeStyle = 'rgba(100,255,100,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 8); ctx.fill(); ctx.stroke()

    ctx.fillStyle = '#80ff80'
    ctx.font = 'bold 16px Courier New'
    ctx.textAlign = 'left'
    ctx.fillText(m.label, btnX + 16, btnY + 22)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '13px Courier New'
    ctx.fillText(m.desc, btnX + 16, btnY + 44)
  }
}

function drawGameOverScreen(W: number, H: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#44ff88'
  ctx.font = `bold ${Math.min(40, W * 0.09)}px Courier New`
  ctx.fillText('LICHEN WARS', W / 2, H / 2 - 80)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.min(24, W * 0.055)}px Courier New`
  ctx.fillText(`Best Territory: ${state.bestScore}%`, W / 2, H / 2 - 20)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `${Math.min(14, W * 0.032)}px Courier New`
  ctx.fillText('Click to play again', W / 2, H / 2 + 30)
}

// ── Main loop ─────────────────────────────────────────────────────────────────

function loop(): void {
  renderGame(performance.now())
  requestAnimationFrame(loop)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { bestScore } = await initSDK()
    state.bestScore = bestScore
    bestEl.textContent = String(bestScore)
  } catch { /* standalone */ }
  loop()
}

void boot()
