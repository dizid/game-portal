// Typing Speed — entry point. Wires game logic, DOM, and SDK.

import { TypingGame } from './game.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── DOM refs ──────────────────────────────────────────────────────────────────

const wpmEl         = document.getElementById('wpm-value') as HTMLSpanElement
const timerEl       = document.getElementById('timer-value') as HTMLSpanElement
const accEl         = document.getElementById('acc-value') as HTMLSpanElement
const timerPill     = document.getElementById('timer-pill') as HTMLDivElement
const progressBar   = document.getElementById('progress-bar') as HTMLDivElement
const passageText   = document.getElementById('passage-text') as HTMLDivElement
const typeInput     = document.getElementById('type-input') as HTMLInputElement
const liveWpmEl     = document.getElementById('live-wpm') as HTMLSpanElement
const liveAccEl     = document.getElementById('live-acc') as HTMLSpanElement
const liveScoreEl   = document.getElementById('live-score') as HTMLSpanElement

const overlayReady    = document.getElementById('overlay-ready') as HTMLDivElement
const overlayGameOver = document.getElementById('overlay-gameover') as HTMLDivElement

const btnStart   = document.getElementById('btn-start') as HTMLButtonElement
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement

const resultWpmEl   = document.getElementById('result-wpm') as HTMLSpanElement
const resultAccEl   = document.getElementById('result-acc') as HTMLSpanElement
const resultScoreEl = document.getElementById('result-score') as HTMLSpanElement
const resultBestEl  = document.getElementById('result-best') as HTMLSpanElement

// ── State ─────────────────────────────────────────────────────────────────────

const game    = new TypingGame()
let highScore = 0
let rafId     = 0

// ── Passage rendering ─────────────────────────────────────────────────────────

/** Rebuild the passage display using safe DOM methods only. */
function renderPassage(): void {
  const snap = game.getSnapshot()

  // Clear existing children
  while (passageText.firstChild) {
    passageText.removeChild(passageText.firstChild)
  }

  snap.charStates.forEach((cs, i) => {
    const span = document.createElement('span')
    span.textContent = cs.char

    if (i === snap.cursorIndex) {
      span.className = 'char cursor'
    } else if (cs.status === 'correct') {
      span.className = 'char correct'
    } else if (cs.status === 'wrong') {
      span.className = 'char wrong'
    } else {
      span.className = 'char'
    }

    passageText.appendChild(span)
  })
}

// ── HUD update ────────────────────────────────────────────────────────────────

function updateHUD(): void {
  const snap = game.getSnapshot()

  wpmEl.textContent   = String(snap.wpm)
  timerEl.textContent = String(Math.ceil(snap.timeLeft))
  accEl.textContent   = String(snap.accuracy)

  // Urgent styling under 10s
  if (snap.timeLeft <= 10) {
    timerPill.classList.add('urgent')
  } else {
    timerPill.classList.remove('urgent')
  }

  progressBar.style.width = `${snap.progress * 100}%`

  liveWpmEl.textContent   = String(snap.wpm)
  liveAccEl.textContent   = String(snap.accuracy)
  liveScoreEl.textContent = String(snap.score)
}

// ── Render loop ───────────────────────────────────────────────────────────────

function renderLoop(): void {
  renderPassage()
  updateHUD()
  rafId = requestAnimationFrame(renderLoop)
}

// ── Game over handling ────────────────────────────────────────────────────────

function handleGameOver(): void {
  cancelAnimationFrame(rafId)
  // Do one final render before showing overlay
  renderPassage()
  updateHUD()

  const snap = game.getSnapshot()
  typeInput.disabled = true

  if (snap.score > highScore) {
    highScore = snap.score
    saveHighScore(highScore)
  }

  resultWpmEl.textContent   = String(snap.wpm)
  resultAccEl.textContent   = String(snap.accuracy)
  resultScoreEl.textContent = String(snap.score)
  resultBestEl.textContent  = String(highScore)

  reportGameOver(snap.score)
  overlayGameOver.classList.remove('hidden')
}

// ── Input handling ────────────────────────────────────────────────────────────

typeInput.addEventListener('input', () => {
  const value = typeInput.value

  if (game.getState() === 'READY') {
    game.startIfReady()
    // Start render loop on first input
    rafId = requestAnimationFrame(renderLoop)
  }

  if (game.getState() !== 'PLAYING') return

  const result = game.processInput(value)

  if (result === 'passage_complete') {
    handleGameOver()
  } else {
    reportScore(game.getScore())
  }
})

// Prevent pasting
typeInput.addEventListener('paste', (e) => {
  e.preventDefault()
})

// ── Button listeners ──────────────────────────────────────────────────────────

btnStart.addEventListener('click', () => {
  overlayReady.classList.add('hidden')
  typeInput.disabled = false
  typeInput.value    = ''
  typeInput.focus()
  renderPassage()
})

btnRestart.addEventListener('click', () => {
  cancelAnimationFrame(rafId)
  game.reset()
  game.setOnTimeUp(handleGameOver)
  overlayGameOver.classList.add('hidden')
  typeInput.disabled = false
  typeInput.value    = ''
  typeInput.focus()
  renderPassage()
  updateHUD()
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  game.setOnTimeUp(handleGameOver)
  typeInput.disabled = true
  renderPassage()
  updateHUD()

  // Show READY overlay
  overlayReady.classList.remove('hidden')

  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
  } catch (err) {
    console.warn('SDK init failed, running in standalone mode:', err)
  }
}

void boot()
