import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const tickEl = document.getElementById('tick-value') as HTMLSpanElement
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

type Phase = 'READY' | 'BETTING' | 'RESOLVING' | 'GAME_OVER'
type Bet = 'DECAY' | 'SURVIVE' | null

interface Atom {
  id: number
  halfLife: number       // 1-10
  decayed: boolean
  x: number; y: number
  radius: number
  color: string
  bet: Bet
  flashTime: number      // when decay/survive resolved
  correct: boolean | null
  decayAnim: number      // 0-1 animation progress for decay
}

interface State {
  phase: Phase
  atoms: Atom[]
  tick: number
  maxTicks: number
  score: number
  bestScore: number
  tickCountdown: number   // ms until tick fires
  tickDuration: number    // 1500ms
  lastTickTime: number
  resolving: boolean
  resolveResults: Map<number, boolean>  // atomId -> didDecay
  feedbackItems: FeedbackItem[]
}

interface FeedbackItem {
  x: number; y: number; text: string; color: string
  spawnTime: number
}

const ATOM_COUNT = 20
const TICK_DURATION = 1500  // ms
const ATOM_COLORS = [
  '#ff4488', '#ff8844', '#ffcc44', '#88ff44',
  '#44ffcc', '#44aaff', '#aa44ff', '#ff44cc',
  '#aaffaa', '#ffaaaa', '#aaaaff', '#ffeeaa',
]

// ── Generate atoms layout ─────────────────────────────────────────────────────

function generateAtoms(W: number): Atom[] {
  const atoms: Atom[] = []
  const cols = 5, rows = 4
  const cellW = (W - 80) / cols
  const cellH = (W - 160) / rows
  const startX = 40
  const startY = 100

  for (let i = 0; i < ATOM_COUNT; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = startX + col * cellW + cellW / 2
    const y = startY + row * cellH + cellH / 2
    atoms.push({
      id: i,
      halfLife: Math.floor(Math.random() * 10) + 1,
      decayed: false,
      x, y,
      radius: Math.min(cellW, cellH) * 0.38,
      color: ATOM_COLORS[i % ATOM_COLORS.length],
      bet: null,
      flashTime: 0,
      correct: null,
      decayAnim: 0,
    })
  }
  return atoms
}

// ── Game state ────────────────────────────────────────────────────────────────

let state: State = buildInitial()

function buildInitial(): State {
  return {
    phase: 'READY', atoms: [], tick: 0, maxTicks: 10,
    score: 0, bestScore: 0,
    tickCountdown: TICK_DURATION, tickDuration: TICK_DURATION,
    lastTickTime: 0, resolving: false,
    resolveResults: new Map(),
    feedbackItems: [],
  }
}

function startGame(): void {
  audio.start()
  const W = canvas.width
  state = buildInitial()
  state.bestScore = state.bestScore
  state.atoms = generateAtoms(W)
  state.phase = 'BETTING'
  state.lastTickTime = performance.now()
  tickEl.textContent = '0'
  scoreEl.textContent = '0'
}

// ── Decay probability ─────────────────────────────────────────────────────────

function decayProb(halfLife: number): number {
  // Probability of decaying in 1 tick: 1 - 0.5^(1/halfLife)
  return 1 - Math.pow(0.5, 1 / halfLife)
}

// ── Tick resolution ───────────────────────────────────────────────────────────

function resolveTick(now: number): void {
  state.resolving = true
  const results = new Map<number, boolean>()

  let totalPoints = 0
  for (const atom of state.atoms) {
    if (atom.decayed) { results.set(atom.id, false); continue }
    const prob = decayProb(atom.halfLife)
    const didDecay = Math.random() < prob
    results.set(atom.id, didDecay)

    if (didDecay) {
      atom.decayed = true
      atom.decayAnim = 0
      atom.flashTime = now

      if (atom.bet === 'DECAY') {
        // Correct: reward is inversely proportional to probability (higher reward for less likely)
        const improbability = 1 - prob
        const points = Math.max(10, Math.round(improbability * 200))
        atom.correct = true
        totalPoints += points
        state.feedbackItems.push({ x: atom.x, y: atom.y - atom.radius - 10, text: `+${points}`, color: '#00ff88', spawnTime: now })
      } else if (atom.bet === 'SURVIVE') {
        const penalty = Math.max(10, Math.round(prob * 100))
        atom.correct = false
        totalPoints -= penalty
        state.feedbackItems.push({ x: atom.x, y: atom.y - atom.radius - 10, text: `-${penalty}`, color: '#ff4444', spawnTime: now })
      }
    } else {
      atom.flashTime = now
      if (atom.bet === 'SURVIVE') {
        // Correct: reward based on how risky survival was
        const improbability = prob // surviving is surprising if prob is high
        const points = Math.max(5, Math.round(improbability * 150))
        atom.correct = true
        totalPoints += points
        state.feedbackItems.push({ x: atom.x, y: atom.y - atom.radius - 10, text: `+${points}`, color: '#00ff88', spawnTime: now })
      } else if (atom.bet === 'DECAY') {
        const penalty = Math.max(5, Math.round((1 - prob) * 100))
        atom.correct = false
        totalPoints -= penalty
        state.feedbackItems.push({ x: atom.x, y: atom.y - atom.radius - 10, text: `-${penalty}`, color: '#ff4444', spawnTime: now })
      }
    }
  }

  state.score = Math.max(0, state.score + totalPoints)
  scoreEl.textContent = String(state.score)
  state.resolveResults = results
  state.tick++
  tickEl.textContent = String(state.tick)
  reportScore(state.score)

  // Clear bets for next tick
  for (const atom of state.atoms) {
    atom.bet = null
    atom.correct = null
  }

  if (state.tick >= state.maxTicks) {
    setTimeout(() => endGame(), 1200)
  } else {
    state.phase = 'BETTING'
    state.lastTickTime = now + 400  // brief pause before next countdown
    state.resolving = false
    state.resolveResults = new Map()
  }
}

function endGame(): void {
  state.phase = 'GAME_OVER'
  if (state.score > state.bestScore) {
    state.bestScore = state.score
    bestEl.textContent = String(state.bestScore)
    saveBestScore(state.bestScore)
  }
  reportGameOver(state.score)
  audio.death()
}

// ── Hit testing ───────────────────────────────────────────────────────────────

// Atom layout for hit-testing (same as generation, but needs W at click time)
function hitTestAtom(x: number, y: number): Atom | null {
  for (const atom of state.atoms) {
    if (atom.decayed) continue
    const dx = x - atom.x, dy = y - atom.y
    if (Math.sqrt(dx * dx + dy * dy) <= atom.radius + 8) return atom
  }
  return null
}

function handleClick(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top

  if (state.phase === 'READY') { startGame(); return }
  if (state.phase === 'GAME_OVER') { startGame(); return }
  if (state.phase !== 'BETTING') return

  const W = canvas.width, H = canvas.height

  // Check mode buttons at bottom
  const btnY = H - 50, btnH = 38
  const decayBtnX = W / 2 - 105, survBtnX = W / 2 + 10
  if (y >= btnY && y <= btnY + btnH) {
    if (x >= decayBtnX && x <= decayBtnX + 95) { state.atoms.forEach(a => { if (!a.decayed && a.bet === null) {} }); return }
    if (x >= survBtnX && x <= survBtnX + 95) { return }
  }

  // Click on an atom to toggle bet
  const atom = hitTestAtom(x, y)
  if (!atom) return

  // Cycle: null -> DECAY -> SURVIVE -> null
  if (atom.bet === null) atom.bet = 'DECAY'
  else if (atom.bet === 'DECAY') atom.bet = 'SURVIVE'
  else atom.bet = null
  audio.click()
}

canvas.addEventListener('click', e => handleClick(e.clientX, e.clientY))
canvas.addEventListener('touchend', e => {
  e.preventDefault()
  const t = e.changedTouches[0]
  handleClick(t.clientX, t.clientY)
})
window.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && (state.phase === 'READY' || state.phase === 'GAME_OVER')) startGame()
})

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderGame(now: number): void {
  const W = canvas.width, H = canvas.height
  ctx.fillStyle = '#0d1a0d'
  ctx.fillRect(0, 0, W, H)

  if (state.phase === 'READY') { drawReady(W, H); return }
  if (state.phase === 'GAME_OVER') { drawGameOver(W, H); return }

  // Tick countdown
  if (state.phase === 'BETTING' && !state.resolving) {
    const elapsed = now - state.lastTickTime
    if (elapsed >= TICK_DURATION) {
      resolveTick(now)
    }
  }

  // Background grid
  ctx.strokeStyle = 'rgba(100,200,100,0.03)'
  ctx.lineWidth = 1
  for (let y = 0; y < H; y += 24) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // Draw atoms
  for (const atom of state.atoms) {
    drawAtom(atom, now, W, H)
  }

  // Countdown bar
  if (state.phase === 'BETTING') {
    const elapsed = Math.min(now - state.lastTickTime, TICK_DURATION)
    const progress = elapsed / TICK_DURATION
    const barY = H - 8, barH = 5, margin = 20
    const barW = W - margin * 2
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(margin, barY - barH, barW, barH)
    const hue = Math.round((1 - progress) * 120)
    ctx.fillStyle = `hsl(${hue}, 80%, 55%)`
    ctx.fillRect(margin, barY - barH, barW * progress, barH)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '11px Courier New'
    ctx.textAlign = 'center'
    const left = Math.max(0, (TICK_DURATION - elapsed) / 1000)
    ctx.fillText(`TICK ${state.tick + 1}/10  |  ${left.toFixed(1)}s to decay event`, W / 2, barY - 8)
  }

  // Feedback floating text
  for (let i = state.feedbackItems.length - 1; i >= 0; i--) {
    const item = state.feedbackItems[i]
    const age = (now - item.spawnTime) / 800
    if (age > 1) { state.feedbackItems.splice(i, 1); continue }
    ctx.globalAlpha = 1 - age
    ctx.font = 'bold 14px Courier New'
    ctx.textAlign = 'center'
    ctx.fillStyle = item.color
    ctx.fillText(item.text, item.x, item.y - age * 30)
    ctx.globalAlpha = 1
  }

  // Instructions bar
  if (state.phase === 'BETTING') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '11px Courier New'
    ctx.textAlign = 'center'
    ctx.fillText('Click atom to bet: once = DECAY (red ring), twice = SURVIVE (green ring)', W / 2, H - 18)
  }
}

function drawAtom(atom: Atom, now: number, W: number, H: number): void {
  const { x, y, radius, color, halfLife, decayed, bet, flashTime, correct } = atom

  if (decayed) {
    // Decay animation: shrink and fade
    const age = (now - flashTime) / 800
    if (age < 1) {
      ctx.globalAlpha = 1 - age
      const r = radius * (1 - age * 0.5)
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = '#ffaa00'
      ctx.fill()
      // Particle burst
      for (let p = 0; p < 6; p++) {
        const angle = (p / 6) * Math.PI * 2
        const dist = age * radius * 2
        const px = x + Math.cos(angle) * dist
        const py = y + Math.sin(angle) * dist
        ctx.beginPath()
        ctx.arc(px, py, 3 * (1 - age), 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    return
  }

  // Glow ring for bet
  if (bet) {
    const betColor = bet === 'DECAY' ? '#ff4444' : '#44ff88'
    ctx.beginPath()
    ctx.arc(x, y, radius + 5 + 2 * Math.sin(now * 0.006), 0, Math.PI * 2)
    ctx.strokeStyle = betColor
    ctx.lineWidth = 2.5
    ctx.stroke()
  }

  // Main circle
  const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius)
  grad.addColorStop(0, lightenColor(color, 40))
  grad.addColorStop(1, darkenColor(color, 40))
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = lightenColor(color, 20)
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Half-life label
  ctx.fillStyle = 'rgba(0,0,0,0.8)'
  ctx.font = `bold ${Math.round(radius * 0.52)}px Courier New`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`t½=${halfLife}`, x, y)
  ctx.textBaseline = 'alphabetic'

  // Probability indicator (small bar below)
  const prob = decayProb(halfLife)
  const barW = radius * 1.4
  const barH = 4
  const barX = x - barW / 2
  const barY = y + radius + 6
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fillRect(barX, barY, barW, barH)
  ctx.fillStyle = `hsl(${Math.round((1 - prob) * 120)}, 80%, 55%)`
  ctx.fillRect(barX, barY, barW * prob, barH)

  // Bet label
  if (bet) {
    const betLabel = bet === 'DECAY' ? 'DECAY' : 'SURV'
    const betColor = bet === 'DECAY' ? '#ff6666' : '#66ff88'
    ctx.fillStyle = betColor
    ctx.font = `bold ${Math.round(radius * 0.35)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText(betLabel, x, y + radius + 18)
  }
}

function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${Math.min(255, r + amount)},${Math.min(255, g + amount)},${Math.min(255, b + amount)})`
}

function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${Math.max(0, r - amount)},${Math.max(0, g - amount)},${Math.max(0, b - amount)})`
}

function drawReady(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#88ff88'
  ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
  ctx.fillText('HALF-LIFE', W / 2, H / 2 - 100)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `${Math.min(14, W * 0.032)}px Courier New`
  const lines = [
    '20 atoms, each with a half-life (1-10).',
    'Every 1.5 seconds, atoms may decay.',
    'Click atoms to bet: DECAY or SURVIVE.',
    'Correct = points based on improbability.',
    'Wrong = points deducted.',
    '10 ticks total.',
    '',
    'Click to start',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 40 + i * 22))
}

function drawGameOver(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#88ff88'
  ctx.font = `bold ${Math.min(40, W * 0.09)}px Courier New`
  ctx.fillText('EXPERIMENT OVER', W / 2, H / 2 - 70)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.min(28, W * 0.06)}px Courier New`
  ctx.fillText(`Score: ${state.score}`, W / 2, H / 2 - 10)
  if (state.score === state.bestScore && state.score > 0) {
    ctx.fillStyle = '#ffd700'
    ctx.font = `${Math.min(18, W * 0.04)}px Courier New`
    ctx.fillText('NEW BEST!', W / 2, H / 2 + 26)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `${Math.min(15, W * 0.034)}px Courier New`
  ctx.fillText('Click to play again', W / 2, H / 2 + 60)
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
  requestAnimationFrame(loop)
}

void boot()
