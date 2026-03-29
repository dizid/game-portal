import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas setup ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const bestEl = document.getElementById('best-value') as HTMLSpanElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement
const charInput = document.getElementById('char-input') as HTMLInputElement

function resizeCanvas(): void {
  const container = canvas.parentElement!
  const w = container.clientWidth
  const h = container.clientHeight
  canvas.width = w
  canvas.height = h
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
}
resizeCanvas()
window.addEventListener('resize', () => { resizeCanvas(); renderGame() })

muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── Phrase bank ───────────────────────────────────────────────────────────────

// Phrases grouped by length; game picks longer ones as score increases
const PHRASES: string[] = [
  'HOLD ON',
  'SIGNAL',
  'TRANSMIT',
  'RELAY NODE',
  'DATA STREAM',
  'KEEP SIGNAL',
  'NOISE FLOOR',
  'CARRIER WAVE',
  'BANDWIDTH OK',
  'PACKET LOSS',
  'ERROR CHECK',
  'FREQUENCY HOP',
  'SIGNAL INTACT',
  'DECODE LAYER',
  'PHASE LOCKED',
  'INTERFERENCE',
  'CLEAR CHANNEL',
  'TRANSMISSION',
  'AMPLIFY GAIN',
  'MODULATION WAVE',
  'SPREAD SPECTRUM',
  'DIGITAL SIGNAL',
  'NOISE REDUCTION',
  'FULL BANDWIDTH',
  'SECURE CHANNEL NOW',
  'ENCRYPT PAYLOAD',
  'QUANTUM ENTANGLED',
  'HANDSHAKE COMPLETE',
]

// Visible chars (no spaces for corruption purposes, but spaces shown)
const CORRUPTIBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'

// ── Game state ────────────────────────────────────────────────────────────────

type GamePhase = 'READY' | 'PLAYING' | 'GAME_OVER'

interface CharState {
  original: string   // The correct character
  current: string    // What is currently displayed (may be corrupted)
  corrupted: boolean
  glowPhase: number  // 0..2π, used for pulsing glow on corrupted chars
}

interface GameState {
  phase: GamePhase
  phrase: CharState[]
  score: number
  bestScore: number
  // Relay countdown bar: 0 = relay just fired, 1 = about to fire
  relayProgress: number
  relayInterval: number   // ms between relays (decreases over time)
  lastRelayTime: number
  corruptionRatio: number // fraction of non-space chars that are corrupted
  // Clicking state
  selectedCharIndex: number  // -1 = none selected
  // Animation
  flashChars: Map<number, number> // charIndex -> flash start time
  relayFlash: number  // timestamp when relay fired (for screen flash)
  messageFlash: string | null // brief message top of screen
  messageFlashTime: number
}

let state: GameState = {
  phase: 'READY',
  phrase: [],
  score: 0,
  bestScore: 0,
  relayProgress: 0,
  relayInterval: 3000,
  lastRelayTime: 0,
  corruptionRatio: 0,
  selectedCharIndex: -1,
  flashChars: new Map(),
  relayFlash: 0,
  messageFlash: null,
  messageFlashTime: 0,
}

// ── Phrase helpers ────────────────────────────────────────────────────────────

function pickPhrase(score: number): string {
  // As score grows, pick longer phrases
  const minLen = Math.min(8 + score * 2, 25)
  const candidates = PHRASES.filter(p => p.replace(/ /g, '').length >= minLen)
  const pool = candidates.length > 0 ? candidates : PHRASES.slice(-8)
  return pool[Math.floor(Math.random() * pool.length)]
}

function buildPhrase(text: string): CharState[] {
  return text.split('').map(ch => ({
    original: ch,
    current: ch,
    corrupted: false,
    glowPhase: Math.random() * Math.PI * 2,
  }))
}

function corruptableIndices(phrase: CharState[]): number[] {
  return phrase
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.original !== ' ' && !c.corrupted)
    .map(({ i }) => i)
}

function randomCorruptChar(): string {
  return CORRUPTIBLE[Math.floor(Math.random() * CORRUPTIBLE.length)]
}

function corruptionCount(phrase: CharState[]): number {
  return phrase.filter(c => c.original !== ' ' && c.corrupted).length
}

function nonSpaceCount(phrase: CharState[]): number {
  return phrase.filter(c => c.original !== ' ').length
}

// ── Game logic ────────────────────────────────────────────────────────────────

function startGame(): void {
  audio.start()
  const phrase = pickPhrase(0)
  state = {
    phase: 'PLAYING',
    phrase: buildPhrase(phrase),
    score: 0,
    bestScore: state.bestScore,
    relayProgress: 0,
    relayInterval: 3000,
    lastRelayTime: performance.now(),
    corruptionRatio: 0,
    selectedCharIndex: -1,
    flashChars: new Map(),
    relayFlash: 0,
    messageFlash: null,
    messageFlashTime: 0,
  }
  scoreEl.textContent = '0'
}

function fireRelay(now: number): void {
  const { phrase } = state
  const available = corruptableIndices(phrase)
  if (available.length === 0) {
    // All chars corrupted — game over immediately
    endGame()
    return
  }

  // Corrupt 1–3 random characters
  const count = Math.min(1 + Math.floor(state.score / 3), 3)
  const corruptions = Math.min(count, available.length)
  const toCorrupt = [...available].sort(() => Math.random() - 0.5).slice(0, corruptions)

  for (const idx of toCorrupt) {
    let corrupt = randomCorruptChar()
    while (corrupt === phrase[idx].original) corrupt = randomCorruptChar()
    phrase[idx].current = corrupt
    phrase[idx].corrupted = true
    phrase[idx].glowPhase = 0
    state.flashChars.set(idx, now)
  }

  // Check if we've exceeded 50% corruption
  const ratio = corruptionCount(phrase) / nonSpaceCount(phrase)
  state.corruptionRatio = ratio

  if (ratio > 0.5) {
    endGame()
    return
  }

  state.score++
  scoreEl.textContent = String(state.score)
  reportScore(state.score)
  state.relayFlash = now
  state.lastRelayTime = now

  // Speed up relay interval (min 1s)
  state.relayInterval = Math.max(1000, 3000 - state.score * 80)

  // Add 1 more char to phrase every 3 relays
  if (state.score % 3 === 0) {
    const letter = CORRUPTIBLE[Math.floor(Math.random() * 26)] // A-Z
    const insert = Math.floor(Math.random() * phrase.length)
    phrase.splice(insert, 0, {
      original: letter,
      current: letter,
      corrupted: false,
      glowPhase: 0,
    })
  }

  audio.blip()

  // After relay 5, add a new phrase segment
  if (state.score === 5 || state.score === 10 || state.score === 15) {
    const ext = pickPhrase(state.score)
    for (const ch of ext.split('')) {
      phrase.push({ original: ch, current: ch, corrupted: false, glowPhase: 0 })
    }
    audio.levelUp()
    showMessage('RELAY EXTENDED')
  }
}

function endGame(): void {
  audio.death()
  state.phase = 'GAME_OVER'
  if (state.score > state.bestScore) {
    state.bestScore = state.score
    bestEl.textContent = String(state.bestScore)
    saveBestScore(state.bestScore)
  }
  reportGameOver(state.score)
}

function showMessage(msg: string): void {
  state.messageFlash = msg
  state.messageFlashTime = performance.now()
}

// ── Input: click on a character ───────────────────────────────────────────────

// Layout is computed each frame and stored here for hit-testing
interface CharLayout {
  x: number; y: number; w: number; h: number; index: number
}
let charLayouts: CharLayout[] = []

function handleCanvasClick(clientX: number, clientY: number): void {
  if (state.phase === 'READY') { startGame(); return }
  if (state.phase === 'GAME_OVER') { startGame(); return }

  const rect = canvas.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top

  // Find which character was clicked
  let hit = -1
  for (const layout of charLayouts) {
    if (x >= layout.x && x <= layout.x + layout.w &&
        y >= layout.y && y <= layout.y + layout.h) {
      hit = layout.index
      break
    }
  }

  if (hit === -1) {
    state.selectedCharIndex = -1
    return
  }

  const ch = state.phrase[hit]
  if (!ch.corrupted) {
    audio.click()
    state.selectedCharIndex = -1
    return
  }

  // Select this corrupted character
  state.selectedCharIndex = hit
  audio.click()
  // Focus the hidden input to receive keyboard
  charInput.value = ''
  charInput.focus()
}

canvas.addEventListener('click', e => handleCanvasClick(e.clientX, e.clientY))
canvas.addEventListener('touchend', e => {
  e.preventDefault()
  const t = e.changedTouches[0]
  handleCanvasClick(t.clientX, t.clientY)
})

// Handle keyboard input to fix selected char
charInput.addEventListener('input', () => {
  if (state.phase !== 'PLAYING') return
  const idx = state.selectedCharIndex
  if (idx === -1) return

  const typed = charInput.value.toUpperCase()
  charInput.value = ''

  if (typed.length === 0) return
  const key = typed[typed.length - 1]

  const ch = state.phrase[idx]
  if (!ch.corrupted) { state.selectedCharIndex = -1; return }

  if (key === ch.original) {
    // Correct fix
    ch.current = ch.original
    ch.corrupted = false
    state.corruptionRatio = corruptionCount(state.phrase) / nonSpaceCount(state.phrase)
    audio.score()
    state.selectedCharIndex = -1
    state.flashChars.set(idx, -performance.now()) // negative = correct flash (green)
    showMessage('FIXED!')
  } else {
    // Wrong
    audio.death()
    showMessage('WRONG!')
  }
})

// Also handle physical keyboard Enter/Escape to deselect
window.addEventListener('keydown', e => {
  if (state.phase === 'READY' || state.phase === 'GAME_OVER') {
    if (e.key === 'Enter' || e.key === ' ') startGame()
    return
  }
  if (e.key === 'Escape') state.selectedCharIndex = -1
})

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderGame(): void {
  const W = canvas.width
  const H = canvas.height
  const now = performance.now()

  // Background
  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, W, H)

  // Relay flash effect
  if (state.relayFlash > 0) {
    const age = (now - state.relayFlash) / 300
    if (age < 1) {
      ctx.fillStyle = `rgba(255, 100, 0, ${0.15 * (1 - age)})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  // Grid lines (subtle scanlines)
  ctx.strokeStyle = 'rgba(0, 255, 200, 0.03)'
  ctx.lineWidth = 1
  for (let y = 0; y < H; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  if (state.phase === 'READY') {
    drawReadyScreen(W, H)
    return
  }

  if (state.phase === 'GAME_OVER') {
    drawGameOverScreen(W, H)
    return
  }

  // PLAYING ──────────────────────────────────────────────────────────────────

  // Relay countdown bar
  const relayAge = (now - state.lastRelayTime) / state.relayInterval
  const relayProgress = Math.min(relayAge, 1)
  const barY = H - 60
  const barH = 12
  const barMargin = 20
  const barW = W - barMargin * 2

  // Bar background
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath()
  ctx.roundRect(barMargin, barY, barW, barH, 4)
  ctx.fill()

  // Bar fill — color shifts from green to red as relay approaches
  const relayHue = Math.round(120 - relayProgress * 120)
  const barFill = Math.max(0, barW * relayProgress)
  ctx.fillStyle = `hsl(${relayHue}, 80%, 55%)`
  if (barFill > 0) {
    ctx.beginPath()
    ctx.roundRect(barMargin, barY, barFill, barH, 4)
    ctx.fill()
  }

  // Bar label
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = '11px Courier New'
  ctx.textAlign = 'center'
  const secLeft = Math.max(0, ((state.relayInterval - (now - state.lastRelayTime)) / 1000))
  ctx.fillText(`NEXT RELAY IN ${secLeft.toFixed(1)}s`, W / 2, barY - 6)

  // Corruption ratio warning
  const corrRatio = state.corruptionRatio
  if (corrRatio > 0.3) {
    const warningAlpha = 0.4 + 0.4 * Math.sin(now * 0.005)
    ctx.fillStyle = `rgba(255, 50, 50, ${warningAlpha * Math.min(1, (corrRatio - 0.3) / 0.2)})`
    ctx.font = 'bold 13px Courier New'
    ctx.textAlign = 'center'
    ctx.fillText(`SIGNAL INTEGRITY: ${Math.round((1 - corrRatio) * 100)}%`, W / 2, barY - 24)
  }

  // Draw phrase
  drawPhrase(W, H, now)

  // Flash message
  if (state.messageFlash) {
    const age = (now - state.messageFlashTime) / 800
    if (age < 1) {
      ctx.globalAlpha = 1 - age
      ctx.font = 'bold 22px Courier New'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#00ffc8'
      ctx.fillText(state.messageFlash, W / 2, H / 2 - 80)
      ctx.globalAlpha = 1
    } else {
      state.messageFlash = null
    }
  }

  // Update glow phases for corrupted chars
  for (const ch of state.phrase) {
    if (ch.corrupted) ch.glowPhase += 0.08
  }

  // Fire relay when bar fills
  if (relayProgress >= 1 && state.phase === 'PLAYING') {
    fireRelay(now)
  }
}

function drawPhrase(W: number, H: number, now: number): void {
  const phrase = state.phrase
  if (phrase.length === 0) return

  // Lay out chars with wrapping
  const fontSize = Math.min(36, Math.max(20, Math.floor(W / (phrase.length * 0.7))))
  ctx.font = `bold ${fontSize}px Courier New`
  const charW = fontSize * 0.65
  const charH = fontSize * 1.4
  const lineH = charH + 8

  const maxCharsPerLine = Math.floor((W - 60) / charW)
  const lines: CharState[][] = []
  for (let i = 0; i < phrase.length; i += maxCharsPerLine) {
    lines.push(phrase.slice(i, i + maxCharsPerLine))
  }

  const totalH = lines.length * lineH
  const startY = H / 2 - totalH / 2 - 20

  charLayouts = []
  let globalIdx = 0

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const lineW = line.length * charW
    const startX = W / 2 - lineW / 2
    const lineY = startY + li * lineH

    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci]
      const x = startX + ci * charW
      const y = lineY

      charLayouts.push({ x, y, w: charW, h: charH, index: globalIdx })

      const isSelected = state.selectedCharIndex === globalIdx
      const flashTime = state.flashChars.get(globalIdx)
      const isFlashing = flashTime !== undefined

      if (ch.original === ' ') {
        globalIdx++
        continue
      }

      if (ch.corrupted) {
        // Pulsing red glow for corrupted chars
        const glow = 0.5 + 0.5 * Math.sin(ch.glowPhase)
        const glowR = Math.round(180 + 75 * glow)

        // Glow circle
        const gradient = ctx.createRadialGradient(
          x + charW / 2, y + charH / 2, 0,
          x + charW / 2, y + charH / 2, charW
        )
        gradient.addColorStop(0, `rgba(${glowR}, 0, 0, 0.4)`)
        gradient.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = gradient
        ctx.fillRect(x - charW * 0.5, y - charH * 0.2, charW * 2, charH * 1.4)

        // Selection highlight
        if (isSelected) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.strokeRect(x - 2, y - 2, charW + 4, charH + 4)
        }

        // Char text
        ctx.fillStyle = `rgb(${glowR}, 50, 50)`
        ctx.font = `bold ${fontSize}px Courier New`
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'
        ctx.fillText(ch.current, x, y)

        // Cursor indicator if selected
        if (isSelected) {
          ctx.fillStyle = 'rgba(255,255,255,0.8)'
          ctx.font = `${fontSize * 0.4}px Courier New`
          ctx.textAlign = 'center'
          ctx.fillText('▾', x + charW / 2, y - fontSize * 0.45)
        }
      } else {
        // Normal char
        let alpha = 1
        let color = '#e0ffe8'

        if (isFlashing && flashTime !== undefined && flashTime < 0) {
          // Correct fix flash (green)
          const age = (now - (-flashTime)) / 400
          if (age < 1) {
            color = '#00ffc8'
            ctx.shadowColor = '#00ffc8'
            ctx.shadowBlur = 20 * (1 - age)
          } else {
            state.flashChars.delete(globalIdx)
            ctx.shadowBlur = 0
          }
        } else {
          ctx.shadowBlur = 0
        }

        ctx.globalAlpha = alpha
        ctx.fillStyle = color
        ctx.font = `bold ${fontSize}px Courier New`
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'
        ctx.fillText(ch.current, x, y)
        ctx.globalAlpha = 1
        ctx.shadowBlur = 0
      }

      globalIdx++
    }
  }
}

function drawReadyScreen(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#00ffc8'
  ctx.font = `bold ${Math.min(48, W * 0.1)}px Courier New`
  ctx.fillText('SIGNAL DECAY', W / 2, H / 2 - 100)

  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `${Math.min(15, W * 0.035)}px Courier New`
  const lines = [
    'You ARE the message.',
    'Relays corrupt characters every few seconds.',
    'CLICK a corrupted character, then TYPE the correct letter.',
    'If more than 50% corrupts — signal lost.',
    '',
    'CLICK or PRESS ENTER to start',
  ]
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, H / 2 - 40 + i * 26)
  })
}

function drawGameOverScreen(W: number, H: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ff4444'
  ctx.font = `bold ${Math.min(48, W * 0.1)}px Courier New`
  ctx.fillText('SIGNAL LOST', W / 2, H / 2 - 80)

  ctx.fillStyle = '#00ffc8'
  ctx.font = `bold ${Math.min(32, W * 0.07)}px Courier New`
  ctx.fillText(`${state.score} RELAYS SURVIVED`, W / 2, H / 2 - 20)

  if (state.score === state.bestScore && state.score > 0) {
    ctx.fillStyle = '#ffd700'
    ctx.font = `${Math.min(18, W * 0.04)}px Courier New`
    ctx.fillText('NEW BEST!', W / 2, H / 2 + 20)
  }

  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `${Math.min(16, W * 0.035)}px Courier New`
  ctx.fillText('CLICK or PRESS ENTER to retry', W / 2, H / 2 + 60)
}

// ── Main loop ─────────────────────────────────────────────────────────────────

function loop(): void {
  renderGame()
  requestAnimationFrame(loop)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { bestScore } = await initSDK()
    state.bestScore = bestScore
    bestEl.textContent = String(bestScore)
  } catch {
    // Standalone mode
  }
  loop()
}

void boot()
