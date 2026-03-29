// Color Mixing — match target colors using RGB sliders

import { gameSDK } from '@game-portal/game-sdk'
import { audio } from './audio.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RGB { r: number; g: number; b: number }
interface TargetColor { name: string; rgb: RGB }

// ── Target colors ─────────────────────────────────────────────────────────────

const TARGET_COLORS: TargetColor[] = [
  { name: 'Coral',         rgb: { r: 255, g: 127, b: 80 } },
  { name: 'Teal',          rgb: { r: 0,   g: 128, b: 128 } },
  { name: 'Gold',          rgb: { r: 255, g: 215, b: 0 } },
  { name: 'Lavender',      rgb: { r: 230, g: 190, b: 255 } },
  { name: 'Crimson',       rgb: { r: 220, g: 20,  b: 60 } },
  { name: 'Mint',          rgb: { r: 152, g: 255, b: 152 } },
  { name: 'Slate Blue',    rgb: { r: 106, g: 90,  b: 205 } },
  { name: 'Tangerine',     rgb: { r: 255, g: 140, b: 0 } },
  { name: 'Dusty Rose',    rgb: { r: 210, g: 140, b: 150 } },
  { name: 'Ocean Blue',    rgb: { r: 0,   g: 105, b: 148 } },
]

// ── State ─────────────────────────────────────────────────────────────────────

interface GameState {
  round: number
  totalScore: number
  bestScore: number
  roundScores: number[]
  submitted: boolean
  // Shuffle order for targets so each game is different
  order: number[]
}

const state: GameState = {
  round: 0,
  totalScore: 0,
  bestScore: 0,
  roundScores: [],
  submitted: false,
  order: [],
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function currentTarget(): TargetColor {
  return TARGET_COLORS[state.order[state.round]]
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const roundDisplay = document.getElementById('round-display') as HTMLSpanElement
const scoreDisplay = document.getElementById('score-display') as HTMLSpanElement
const bestDisplay = document.getElementById('best-display') as HTMLSpanElement
const targetCircle = document.getElementById('target-circle') as HTMLDivElement
const mixCircle = document.getElementById('mix-circle') as HTMLDivElement
const colorName = document.getElementById('color-name') as HTMLDivElement
const scoreFeedback = document.getElementById('score-feedback') as HTMLDivElement
const distanceDisplay = document.getElementById('distance-display') as HTMLDivElement
const sliderR = document.getElementById('slider-r') as HTMLInputElement
const sliderG = document.getElementById('slider-g') as HTMLInputElement
const sliderB = document.getElementById('slider-b') as HTMLInputElement
const valR = document.getElementById('val-r') as HTMLSpanElement
const valG = document.getElementById('val-g') as HTMLSpanElement
const valB = document.getElementById('val-b') as HTMLSpanElement
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement
const scoreHistory = document.getElementById('score-history') as HTMLDivElement
const endScreen = document.getElementById('end-screen') as HTMLDivElement
const finalScore = document.getElementById('final-score') as HTMLDivElement
const finalBestLabel = document.getElementById('final-best-label') as HTMLDivElement
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Color helpers ─────────────────────────────────────────────────────────────

function rgbToCss(rgb: RGB): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
}

function colorDistance(a: RGB, b: RGB): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function calcRoundScore(distance: number): number {
  return Math.max(0, Math.round(100 - distance / 4))
}

function getMixRGB(): RGB {
  return {
    r: parseInt(sliderR.value),
    g: parseInt(sliderG.value),
    b: parseInt(sliderB.value),
  }
}

// ── Live preview (updates on every slider move) ───────────────────────────────

function updatePreview(): void {
  const mix = getMixRGB()
  mixCircle.style.backgroundColor = rgbToCss(mix)
  valR.textContent = sliderR.value
  valG.textContent = sliderG.value
  valB.textContent = sliderB.value

  // Show live distance as you slide
  if (!state.submitted) {
    const target = currentTarget()
    const dist = colorDistance(mix, target.rgb)
    const pts = calcRoundScore(dist)
    distanceDisplay.textContent = `Distance: ${dist.toFixed(1)} — Preview: ${pts} pts`
  }
}

sliderR.addEventListener('input', updatePreview)
sliderG.addEventListener('input', updatePreview)
sliderB.addEventListener('input', updatePreview)

// ── Load round ────────────────────────────────────────────────────────────────

function loadRound(): void {
  state.submitted = false
  submitBtn.disabled = false
  submitBtn.textContent = 'Submit Color'

  const target = currentTarget()
  targetCircle.style.backgroundColor = rgbToCss(target.rgb)
  colorName.textContent = target.name

  // Reset sliders to mid
  sliderR.value = '128'
  sliderG.value = '128'
  sliderB.value = '128'
  updatePreview()

  scoreFeedback.textContent = '\u00a0'
  distanceDisplay.textContent = '\u00a0'

  roundDisplay.textContent = `${state.round + 1} / 10`
  scoreDisplay.textContent = String(state.totalScore)
  bestDisplay.textContent = String(state.bestScore)
}

// ── Submit ────────────────────────────────────────────────────────────────────

function submitColor(): void {
  if (state.submitted) return
  state.submitted = true
  submitBtn.disabled = true

  const target = currentTarget()
  const mix = getMixRGB()
  const dist = colorDistance(mix, target.rgb)
  const pts = calcRoundScore(dist)

  state.roundScores.push(pts)
  state.totalScore += pts
  gameSDK.reportScore(state.totalScore)

  scoreDisplay.textContent = String(state.totalScore)

  // Feedback
  if (pts >= 90) {
    scoreFeedback.textContent = `Perfect! +${pts}`
    scoreFeedback.style.color = '#00ff88'
    audio.levelUp()
  } else if (pts >= 70) {
    scoreFeedback.textContent = `Great! +${pts}`
    scoreFeedback.style.color = '#ffd700'
    audio.score()
  } else if (pts >= 40) {
    scoreFeedback.textContent = `Not bad — +${pts}`
    scoreFeedback.style.color = '#ff9900'
    audio.blip()
  } else {
    scoreFeedback.textContent = `Keep practicing — +${pts}`
    scoreFeedback.style.color = '#ff4444'
    audio.death()
  }

  distanceDisplay.textContent = `Distance: ${dist.toFixed(1)} | Target: rgb(${target.rgb.r}, ${target.rgb.g}, ${target.rgb.b})`

  // Show chip in history
  const chip = document.createElement('span')
  chip.className = 'history-chip'
  chip.textContent = `R${state.round + 1}: ${pts}`
  chip.style.color = pts >= 70 ? '#a8e063' : pts >= 40 ? '#ffd700' : '#ff6666'
  scoreHistory.appendChild(chip)

  // Advance
  if (state.round + 1 >= TARGET_COLORS.length) {
    submitBtn.textContent = 'See Results'
    submitBtn.disabled = false
    submitBtn.addEventListener('click', () => showEndScreen(), { once: true })
  } else {
    submitBtn.textContent = 'Next Color'
    submitBtn.disabled = false
    submitBtn.addEventListener('click', () => {
      state.round++
      loadRound()
    }, { once: true })
  }
}

// ── End screen ────────────────────────────────────────────────────────────────

function showEndScreen(): void {
  gameSDK.gameOver(state.totalScore)

  finalScore.textContent = String(state.totalScore)

  if (state.totalScore > state.bestScore) {
    state.bestScore = state.totalScore
    gameSDK.save({ bestScore: state.bestScore })
    finalBestLabel.textContent = 'NEW PERSONAL BEST!'
    audio.levelUp()
  } else {
    finalBestLabel.textContent = `Personal Best: ${state.bestScore}`
    audio.combo()
  }

  // Color the score based on performance
  const pct = state.totalScore / 1000
  finalScore.style.color = pct >= 0.8 ? '#00ff88' : pct >= 0.6 ? '#ffd700' : pct >= 0.4 ? '#ff9900' : '#ff4444'

  endScreen.classList.add('visible')
}

// ── Restart ───────────────────────────────────────────────────────────────────

function startGame(): void {
  state.round = 0
  state.totalScore = 0
  state.roundScores = []
  state.submitted = false
  state.order = shuffle([...Array(TARGET_COLORS.length).keys()])
  scoreHistory.textContent = ''
  endScreen.classList.remove('visible')
  loadRound()
}

// ── Event listeners ───────────────────────────────────────────────────────────

submitBtn.addEventListener('click', () => {
  if (!state.submitted) {
    audio.click()
    submitColor()
  }
})

btnRestart.addEventListener('click', () => {
  audio.start()
  startGame()
})

muteBtn.addEventListener('click', () => {
  const muted = audio.toggleMute()
  muteBtn.textContent = muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    await gameSDK.init({ gameId: 'color-mixing', gameSlug: 'color-mixing' })
    await gameSDK.showAd('preroll')
    const saved = await gameSDK.load<{ bestScore: number }>()
    if (saved?.bestScore) state.bestScore = saved.bestScore
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  audio.start()
  startGame()
}

void boot()
