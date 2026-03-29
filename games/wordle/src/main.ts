// Entry point — wires together Wordle game logic, UI rendering, input, and SDK

import { WordleGame } from './game.js'
import type { GameSnapshot, TileStatus } from './game.js'
import {
  initSDK,
  reportScore,
  reportGameOver,
  saveHighScore,
  shareResult,
} from './sdk-bridge.js'
import { audio } from './audio.js'

// ── Mute button ────────────────────────────────────────────────────────────────
const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── DOM references ─────────────────────────────────────────────────────────────

const gridContainer = document.getElementById('grid-container') as HTMLDivElement
const keyboardEl = document.getElementById('keyboard') as HTMLDivElement
const overlay = document.getElementById('overlay') as HTMLDivElement
const overlayCard = document.getElementById('overlay-card') as HTMLDivElement
const toastContainer = document.getElementById('toast-container') as HTMLDivElement

// ── Game instance ──────────────────────────────────────────────────────────────

const game = new WordleGame()
let highScore = 0

// ── Grid rendering ─────────────────────────────────────────────────────────────

const WORD_LENGTH = 5
const MAX_GUESSES = 6

/** Build the 6×5 grid of tile elements */
function buildGrid(): void {
  while (gridContainer.firstChild) gridContainer.removeChild(gridContainer.firstChild)

  for (let row = 0; row < MAX_GUESSES; row++) {
    const rowEl = document.createElement('div')
    rowEl.className = 'grid-row'
    rowEl.dataset['row'] = String(row)
    for (let col = 0; col < WORD_LENGTH; col++) {
      const tile = document.createElement('div')
      tile.className = 'tile'
      tile.dataset['row'] = String(row)
      tile.dataset['col'] = String(col)
      // Inner structure for 3D flip
      const inner = document.createElement('div')
      inner.className = 'tile-inner'
      const front = document.createElement('div')
      front.className = 'tile-front'
      const back = document.createElement('div')
      back.className = 'tile-back'
      inner.appendChild(front)
      inner.appendChild(back)
      tile.appendChild(inner)
      rowEl.appendChild(tile)
    }
    gridContainer.appendChild(rowEl)
  }
}

/** Get a specific tile element */
function getTile(row: number, col: number): HTMLDivElement {
  return gridContainer.querySelector(`[data-row="${row}"][data-col="${col}"]`) as HTMLDivElement
}

/** Get a row element */
function getRow(row: number): HTMLDivElement {
  return gridContainer.querySelector(`.grid-row[data-row="${row}"]`) as HTMLDivElement
}

/** Render current input letters into the active row */
function renderActiveRow(snap: GameSnapshot): void {
  const rowIdx = snap.guesses.length
  if (rowIdx >= MAX_GUESSES) return

  for (let col = 0; col < WORD_LENGTH; col++) {
    const tile = getTile(rowIdx, col)
    const front = tile.querySelector('.tile-front') as HTMLElement
    const letter = snap.currentInput[col] ?? ''
    front.textContent = letter.toUpperCase()
    tile.className = letter ? 'tile filled' : 'tile'
    // Reset back tile class in case it was previously revealed
    const back = tile.querySelector('.tile-back') as HTMLElement
    back.className = 'tile-back'
  }
}

/** Reveal a completed guess row with flip animation */
function revealRow(rowIdx: number, snap: GameSnapshot): Promise<void> {
  return new Promise((resolve) => {
    const guess = snap.guesses[rowIdx]
    const FLIP_DELAY = 300 // ms between tiles
    const FLIP_DURATION = 450 // matches CSS transition

    guess.tiles.forEach(({ letter, status }, col) => {
      setTimeout(() => {
        const tile = getTile(rowIdx, col)
        const front = tile.querySelector('.tile-front') as HTMLElement
        const back = tile.querySelector('.tile-back') as HTMLElement
        front.textContent = letter.toUpperCase()
        back.textContent = letter.toUpperCase()
        back.className = `tile-back ${status}`
        tile.classList.add('flipping')

        setTimeout(() => {
          tile.classList.remove('flipping')
          tile.classList.add('revealed', status)
          if (col === WORD_LENGTH - 1) {
            setTimeout(resolve, 50)
          }
        }, FLIP_DURATION)
      }, col * FLIP_DELAY)
    })
  })
}

// ── Keyboard rendering ─────────────────────────────────────────────────────────

const KB_LAYOUT: string[][] = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['Enter','z','x','c','v','b','n','m','⌫'],
]

function buildKeyboard(): void {
  while (keyboardEl.firstChild) keyboardEl.removeChild(keyboardEl.firstChild)

  KB_LAYOUT.forEach((row) => {
    const rowEl = document.createElement('div')
    rowEl.className = 'kb-row'
    row.forEach((key) => {
      const btn = document.createElement('button')
      btn.className = 'kb-key'
      btn.textContent = key.toUpperCase() === 'ENTER' ? 'Enter' : key.toUpperCase()
      if (key === 'Enter' || key === '⌫') btn.classList.add('wide')
      btn.dataset['key'] = key
      btn.addEventListener('click', () => { void handleKey(key) })
      rowEl.appendChild(btn)
    })
    keyboardEl.appendChild(rowEl)
  })
}

function updateKeyboard(keyColors: Map<string, TileStatus>): void {
  keyColors.forEach((status, letter) => {
    const btn = keyboardEl.querySelector(`[data-key="${letter}"]`) as HTMLButtonElement | null
    if (!btn) return
    btn.classList.remove('correct', 'present', 'absent')
    btn.classList.add(status)
  })
}

// ── Overlay (READY / GAME_OVER) — built with DOM methods ──────────────────────

function clearOverlay(): void {
  while (overlayCard.firstChild) overlayCard.removeChild(overlayCard.firstChild)
}

function showReadyOverlay(): void {
  overlay.classList.remove('hidden')
  clearOverlay()

  const h2 = document.createElement('h2')
  h2.textContent = 'Wordle'
  overlayCard.appendChild(h2)

  const p = document.createElement('p')
  p.textContent = 'Guess the 5-letter word in 6 tries. Green = correct position. Yellow = wrong position. Gray = not in word.'
  overlayCard.appendChild(p)

  const btn = document.createElement('button')
  btn.className = 'btn'
  btn.textContent = "Play Today's Word"
  btn.addEventListener('click', () => {
    overlay.classList.add('hidden')
    audio.start()
    game.start()
    renderActiveRow(game.getSnapshot())
  })
  overlayCard.appendChild(btn)
}

function showGameOverOverlay(snap: GameSnapshot): void {
  overlay.classList.remove('hidden')
  clearOverlay()

  const scorePoints = snap.won ? snap.score : 0
  if (scorePoints > highScore) {
    highScore = scorePoints
    saveHighScore(highScore)
  }

  const h2 = document.createElement('h2')
  h2.textContent = snap.won ? 'Brilliant!' : 'Game Over'
  overlayCard.appendChild(h2)

  if (snap.won) {
    const scoreLine = document.createElement('p')
    scoreLine.className = 'score-line'
    scoreLine.textContent = `+${scorePoints} points`
    overlayCard.appendChild(scoreLine)
  } else {
    const answerDiv = document.createElement('div')
    answerDiv.className = 'answer-reveal'
    answerDiv.textContent = snap.answer.toUpperCase()
    overlayCard.appendChild(answerDiv)
  }

  // Share grid (emoji)
  const shareBox = document.createElement('div')
  shareBox.id = 'share-result'
  shareBox.textContent = snap.shareEmoji
  overlayCard.appendChild(shareBox)

  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px;'
  overlayCard.appendChild(btnRow)

  const shareBtn = document.createElement('button')
  shareBtn.className = 'btn btn-secondary'
  shareBtn.textContent = 'Copy Share'
  shareBtn.addEventListener('click', () => {
    shareResult(snap.shareEmoji)
    navigator.clipboard?.writeText(snap.shareEmoji).catch(() => { /* ignore in non-secure context */ })
    showToast('Copied!')
  })
  btnRow.appendChild(shareBtn)

  const playAgainBtn = document.createElement('button')
  playAgainBtn.className = 'btn'
  playAgainBtn.textContent = 'New Game'
  playAgainBtn.addEventListener('click', () => {
    overlay.classList.add('hidden')
    audio.start()
    game.reset()
    buildGrid()
    buildKeyboard()
    game.start()
    renderActiveRow(game.getSnapshot())
  })
  btnRow.appendChild(playAgainBtn)
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function showToast(message: string, duration: number = 1800): void {
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.textContent = message
  toastContainer.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

// ── Input handling ─────────────────────────────────────────────────────────────

let isAnimating = false

async function handleKey(key: string): Promise<void> {
  if (isAnimating) return
  const snap = game.getSnapshot()
  if (snap.state !== 'PLAYING') return

  if (key === '⌫' || key === 'Backspace') {
    game.deleteLetter()
    renderActiveRow(game.getSnapshot())
    return
  }

  if (key === 'Enter') {
    const result = game.submitGuess()
    if (result === 'short') {
      shakeRow(snap.guesses.length)
      showToast('Not enough letters')
      audio.click()
      return
    }
    if (result === 'invalid') {
      shakeRow(snap.guesses.length)
      showToast('Not in word list')
      audio.click()
      return
    }

    // Accepted — animate the reveal
    isAnimating = true
    const newSnap = game.getSnapshot()
    const revealedRowIdx = newSnap.guesses.length - 1

    await revealRow(revealedRowIdx, newSnap)
    updateKeyboard(newSnap.keyColors)
    isAnimating = false

    if (newSnap.state === 'GAME_OVER') {
      reportScore(newSnap.score)
      reportGameOver(newSnap.score)
      if (newSnap.won) {
        // Earlier guess = more impressive = combo/levelUp sounds
        if (revealedRowIdx <= 1) {
          audio.levelUp()
        } else if (revealedRowIdx <= 3) {
          audio.combo()
        } else {
          audio.score()
        }
        showToast(CONGRATS[Math.min(revealedRowIdx, CONGRATS.length - 1)], 2000)
        setTimeout(() => showGameOverOverlay(newSnap), 1600)
      } else {
        audio.death()
        setTimeout(() => showGameOverOverlay(newSnap), 400)
      }
      return
    }

    // Valid guess but not game over — blip per correct tile
    audio.blip()
    try { navigator.vibrate(10) } catch {}
    renderActiveRow(newSnap)
    return
  }

  // Letter key
  if (/^[a-zA-Z]$/.test(key)) {
    game.addLetter(key)
    audio.click()
    renderActiveRow(game.getSnapshot())
  }
}

const CONGRATS = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!']

function shakeRow(rowIdx: number): void {
  const row = getRow(rowIdx)
  row.classList.remove('shake')
  void row.offsetWidth // reflow to restart animation
  row.classList.add('shake')
  setTimeout(() => row.classList.remove('shake'), 600)
}

// ── Physical keyboard ──────────────────────────────────────────────────────────

function setupKeyboardInput(): void {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'Backspace') { void handleKey('Backspace'); return }
    if (e.key === 'Enter') { void handleKey('Enter'); return }
    if (/^[a-zA-Z]$/.test(e.key)) { void handleKey(e.key); return }
  })
}

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  buildGrid()
  buildKeyboard()
  setupKeyboardInput()

  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  showReadyOverlay()
}

void boot()
