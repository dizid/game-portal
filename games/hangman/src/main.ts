// Hangman — entry point. Wires game logic, renderer, DOM keyboard, and SDK.

import { HangmanGame } from './game.js'
import { HangmanRenderer } from './renderer.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── DOM refs ──────────────────────────────────────────────────────────────────

const scoreEl       = document.getElementById('score-value') as HTMLSpanElement
const highScoreEl   = document.getElementById('high-score-value') as HTMLSpanElement
const categoryEl    = document.getElementById('category-badge') as HTMLDivElement
const wordDisplay   = document.getElementById('word-display') as HTMLDivElement
const keyboardEl    = document.getElementById('keyboard') as HTMLDivElement
const streakEl      = document.getElementById('streak-value') as HTMLSpanElement

const overlayReady    = document.getElementById('overlay-ready') as HTMLDivElement
const overlaySolved   = document.getElementById('overlay-solved') as HTMLDivElement
const overlayGameOver = document.getElementById('overlay-gameover') as HTMLDivElement

const btnStart    = document.getElementById('btn-start') as HTMLButtonElement
const btnNext     = document.getElementById('btn-next') as HTMLButtonElement
const btnRestart  = document.getElementById('btn-restart') as HTMLButtonElement

const solvedMsg       = document.getElementById('solved-msg') as HTMLParagraphElement
const revealWordEl    = document.getElementById('reveal-word') as HTMLDivElement
const finalScoreMsgEl = document.getElementById('final-score-msg') as HTMLParagraphElement

const canvas = document.getElementById('hangman-canvas') as HTMLCanvasElement

// ── Setup ─────────────────────────────────────────────────────────────────────

const game     = new HangmanGame()
const renderer = new HangmanRenderer(canvas)
let highScore  = 0

// Mute button
const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// Keyboard layout rows
const KEY_ROWS = [
  'QWERTYUIOP'.split(''),
  'ASDFGHJKL'.split(''),
  'ZXCVBNM'.split(''),
]

// Map of letter -> button element for fast lookups
const keyButtons = new Map<string, HTMLButtonElement>()

function buildKeyboard(): void {
  // Remove all existing children safely
  while (keyboardEl.firstChild) {
    keyboardEl.removeChild(keyboardEl.firstChild)
  }
  keyButtons.clear()

  for (const row of KEY_ROWS) {
    const rowEl = document.createElement('div')
    rowEl.className = 'key-row'

    for (const letter of row) {
      const btn = document.createElement('button')
      btn.className = 'key-btn'
      btn.textContent = letter
      btn.dataset['letter'] = letter.toLowerCase()
      btn.addEventListener('click', () => handleGuess(letter.toLowerCase()))
      rowEl.appendChild(btn)
      keyButtons.set(letter.toLowerCase(), btn)
    }

    keyboardEl.appendChild(rowEl)
  }
}

function resizeCanvas(): void {
  // Use whatever height budget the container has, max 160px
  const size = Math.min(160, window.innerWidth)
  renderer.resize(size)
}

// ── Render current state ──────────────────────────────────────────────────────

function renderWordDisplay(word: string, guessed: Set<string>, wordRevealed: boolean): void {
  // Remove all existing children safely
  while (wordDisplay.firstChild) {
    wordDisplay.removeChild(wordDisplay.firstChild)
  }

  for (const ch of word) {
    const box = document.createElement('div')
    box.className = 'letter-box'
    if (guessed.has(ch)) {
      box.textContent = ch.toUpperCase()
      box.style.color = '#00ff88'
    } else if (wordRevealed) {
      // Show unrevealed letters in red on game over
      box.textContent = ch.toUpperCase()
      box.style.color = '#ff6b6b'
    } else {
      box.textContent = ''
    }
    wordDisplay.appendChild(box)
  }
}

function renderAll(): void {
  const snap = game.getSnapshot()

  // Canvas figure
  renderer.draw(snap.wrongCount, snap.state === 'GAME_OVER')

  // Word display
  renderWordDisplay(snap.word, snap.guessed, snap.wordRevealed)

  // Category
  categoryEl.textContent = snap.category

  // Keyboard button states
  for (const [letter, btn] of keyButtons) {
    const st = snap.letterStates[letter]
    btn.className = 'key-btn'
    if (st === 'correct') {
      btn.classList.add('correct')
      btn.disabled = true
    } else if (st === 'wrong') {
      btn.classList.add('wrong')
      btn.disabled = true
    } else {
      btn.disabled = snap.state !== 'PLAYING'
    }
  }

  // HUD
  scoreEl.textContent     = String(snap.score)
  highScoreEl.textContent = String(highScore)
  streakEl.textContent    = String(snap.streak)
}

// ── Game flow ─────────────────────────────────────────────────────────────────

function handleGuess(letter: string): void {
  const result = game.guess(letter)

  if (result === 'solved') {
    const snap = game.getSnapshot()
    renderAll()
    solvedMsg.textContent = `Score: ${snap.score} — streak: ${snap.streak}`
    showOverlay('solved')
    reportScore(snap.score)
    maybeUpdateHighScore(snap.score)
  } else if (result === 'dead') {
    renderAll()
    const snap = game.getSnapshot()
    revealWordEl.textContent    = snap.word.toUpperCase()
    finalScoreMsgEl.textContent = `Final score: ${snap.score}`
    showOverlay('gameover')
    reportGameOver(snap.score)
    maybeUpdateHighScore(snap.score)
  } else {
    renderAll()
    if (result !== 'already' && result !== 'invalid') {
      reportScore(game.getScore())
    }
  }
}

function maybeUpdateHighScore(score: number): void {
  if (score > highScore) {
    highScore = score
    highScoreEl.textContent = String(highScore)
    saveHighScore(highScore)
  }
}

function showOverlay(which: 'ready' | 'solved' | 'gameover'): void {
  overlayReady.classList.add('hidden')
  overlaySolved.classList.add('hidden')
  overlayGameOver.classList.add('hidden')

  if (which === 'ready')    overlayReady.classList.remove('hidden')
  if (which === 'solved')   overlaySolved.classList.remove('hidden')
  if (which === 'gameover') overlayGameOver.classList.remove('hidden')
}

// ── Button listeners ──────────────────────────────────────────────────────────

btnStart.addEventListener('click', () => {
  game.start()
  overlayReady.classList.add('hidden')
  buildKeyboard()
  renderAll()
})

btnNext.addEventListener('click', () => {
  game.nextWord()
  overlaySolved.classList.add('hidden')
  buildKeyboard()
  renderAll()
})

btnRestart.addEventListener('click', () => {
  game.reset()
  game.start()
  overlayGameOver.classList.add('hidden')
  buildKeyboard()
  renderAll()
})

// ── Physical keyboard support ─────────────────────────────────────────────────

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (game.getState() !== 'PLAYING') return
  const key = e.key.toLowerCase()
  if (/^[a-z]$/.test(key)) {
    handleGuess(key)
  }
})

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  resizeCanvas()
  renderAll()
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  resizeCanvas()
  buildKeyboard()
  renderAll()
  showOverlay('ready')

  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
    highScoreEl.textContent = String(highScore)
  } catch (err) {
    console.warn('SDK init failed, running in standalone mode:', err)
  }
}

void boot()
