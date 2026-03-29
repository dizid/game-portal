// Sudoku — main entry point

import { SudokuGame } from './game.js'
import type { Difficulty } from './puzzles.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── DOM refs ──────────────────────────────────────────────────────────────────

const overlayReady = document.getElementById('overlay-ready') as HTMLDivElement
const overlayGameover = document.getElementById('overlay-gameover') as HTMLDivElement
const hudTimer = document.getElementById('hud-timer') as HTMLSpanElement
const hudScore = document.getElementById('hud-score') as HTMLSpanElement
const hudDiff = document.getElementById('hud-diff') as HTMLDivElement
const gridEl = document.getElementById('sudoku-grid') as HTMLDivElement
const numBtns = document.querySelectorAll<HTMLButtonElement>('.num-btn')
const btnErase = document.getElementById('btn-erase') as HTMLButtonElement
const btnNotes = document.getElementById('btn-notes') as HTMLButtonElement
const btnHint = document.getElementById('btn-hint') as HTMLButtonElement
const btnNew = document.getElementById('btn-new') as HTMLButtonElement
const finalScoreDisplay = document.getElementById('final-score-display') as HTMLDivElement
const solveTimeText = document.getElementById('solve-time-text') as HTMLParagraphElement
const bestScoreText = document.getElementById('best-score-text') as HTMLParagraphElement

// ── State ─────────────────────────────────────────────────────────────────────

const game = new SudokuGame()
let highScore = 0
let timerInterval: ReturnType<typeof setInterval> | null = null

// Cache the 81 cell DOM elements after grid build
let cellEls: HTMLDivElement[] = []

// ── Grid builder — run once per new game ─────────────────────────────────────

function buildGrid(): void {
  // Remove existing cells
  while (gridEl.firstChild) {
    gridEl.removeChild(gridEl.firstChild)
  }
  cellEls = []

  for (let i = 0; i < 81; i++) {
    const row = Math.floor(i / 9)
    const cell = document.createElement('div')
    cell.className = 'sudoku-cell'
    cell.dataset.idx = String(i)

    // Mark row-end for box boundary rendering (rows 2 and 5, 0-indexed)
    if (row === 2 || row === 5) {
      cell.classList.add('row-end')
    }

    // Notes sub-grid (always present, hidden when cell has value)
    const notesEl = document.createElement('div')
    notesEl.className = 'cell-notes'
    for (let n = 1; n <= 9; n++) {
      const noteDigit = document.createElement('div')
      noteDigit.className = 'note-digit'
      noteDigit.dataset.note = String(n)
      notesEl.appendChild(noteDigit)
    }
    cell.appendChild(notesEl)

    cell.addEventListener('click', () => {
      const idx = parseInt(cell.dataset.idx ?? '0', 10)
      game.selectCell(idx)
      renderGrid()
    })

    gridEl.appendChild(cell)
    cellEls.push(cell)
  }
}

// ── Grid renderer — fast re-render on state change ────────────────────────────

function renderGrid(): void {
  const snap = game.getSnapshot()
  const highlighted = game.getHighlightedIndices()

  // Determine which number to highlight (same digit as selected cell)
  const selectedVal = snap.selectedIndex !== null ? snap.cells[snap.selectedIndex].value : 0

  for (let i = 0; i < 81; i++) {
    const cell = snap.cells[i]
    const el = cellEls[i]
    const isSelected = i === snap.selectedIndex
    const isHighlighted = highlighted.has(i)
    const isSameDigit = selectedVal !== 0 && cell.value === selectedVal

    // Classes
    el.className = 'sudoku-cell'
    if (Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5) {
      el.classList.add('row-end')
    }
    if (cell.given) el.classList.add('given')
    if (isSelected) el.classList.add('selected')
    else if (isHighlighted) el.classList.add('highlighted')
    if (cell.state === 'error') el.classList.add('error')
    if (isSameDigit && !isSelected && cell.state !== 'error') el.classList.add('solved-highlight')

    // Value display vs notes
    const notesEl = el.querySelector('.cell-notes') as HTMLDivElement

    if (cell.value !== 0) {
      // Show the number, hide notes
      // Remove any previous value text node (first text child)
      // We use a dedicated span for the value to avoid clashing with notes child
      let valueSpan = el.querySelector('.cell-value') as HTMLSpanElement | null
      if (!valueSpan) {
        valueSpan = document.createElement('span')
        valueSpan.className = 'cell-value'
        el.insertBefore(valueSpan, notesEl)
      }
      valueSpan.textContent = String(cell.value)
      notesEl.style.display = 'none'
    } else {
      // Show notes, hide value span
      const valueSpan = el.querySelector('.cell-value') as HTMLSpanElement | null
      if (valueSpan) {
        valueSpan.textContent = ''
      }
      notesEl.style.display = 'grid'

      // Update individual note digits
      for (let n = 1; n <= 9; n++) {
        const noteEl = notesEl.querySelector(`[data-note="${n}"]`) as HTMLDivElement
        noteEl.textContent = cell.notes.has(n) ? String(n) : ''
      }
    }
  }
}

// ── UI update ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function updateHUD(): void {
  const snap = game.getSnapshot()
  hudTimer.textContent = formatTime(snap.elapsedSeconds)
  hudScore.textContent = String(snap.score)

  const diffColors: Record<string, string> = { easy: '#34d399', medium: '#fbbf24', hard: '#f87171' }
  hudDiff.textContent = snap.difficulty.charAt(0).toUpperCase() + snap.difficulty.slice(1)
  hudDiff.style.color = diffColors[snap.difficulty] ?? '#38bdf8'

  // Notes mode button
  btnNotes.classList.toggle('notes-active', snap.notesMode)
}

function updateOverlays(): void {
  const snap = game.getSnapshot()
  overlayReady.classList.toggle('hidden', snap.state !== 'READY')
  overlayGameover.classList.toggle('hidden', snap.state !== 'GAME_OVER')
}

function handleSolved(): void {
  const snap = game.getSnapshot()
  stopTimer()

  if (snap.score > highScore) {
    highScore = snap.score
    saveHighScore(highScore)
  }

  reportGameOver(snap.score)

  finalScoreDisplay.textContent = `${snap.score} pts`
  solveTimeText.textContent = `Solved in ${formatTime(snap.elapsedSeconds)}`
  bestScoreText.textContent = `Best: ${highScore} pts`

  updateOverlays()
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer(): void {
  stopTimer()
  timerInterval = setInterval(() => {
    game.tickTimer()
    updateHUD()
    reportScore(game.getScore())
  }, 1000)
}

function stopTimer(): void {
  if (timerInterval !== null) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

// ── Start game helper ─────────────────────────────────────────────────────────

function startGame(difficulty: Difficulty): void {
  stopTimer()
  game.newGame(difficulty)
  buildGrid()
  renderGrid()
  updateHUD()
  updateOverlays()
  startTimer()
}

// ── Events ────────────────────────────────────────────────────────────────────

// Difficulty selection (on both overlays)
document.querySelectorAll<HTMLButtonElement>('.diff-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const diff = btn.dataset.difficulty as Difficulty
    if (diff) startGame(diff)
  })
})

numBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const num = parseInt(btn.dataset.num ?? '0', 10)
    if (num < 1 || num > 9) return
    game.enterNumber(num)
    renderGrid()
    updateHUD()

    if (game.getState() === 'GAME_OVER') {
      handleSolved()
    }
  })
})

btnErase.addEventListener('click', () => {
  game.eraseCell()
  renderGrid()
  updateHUD()
})

btnNotes.addEventListener('click', () => {
  game.toggleNotes()
  updateHUD()
})

btnHint.addEventListener('click', () => {
  game.useHint()
  renderGrid()
  updateHUD()

  if (game.getState() === 'GAME_OVER') {
    handleSolved()
  }
})

btnNew.addEventListener('click', () => {
  game.reset()
  stopTimer()
  updateOverlays()
})

// Keyboard support
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (game.getState() !== 'PLAYING') return

  if (e.key >= '1' && e.key <= '9') {
    game.enterNumber(parseInt(e.key, 10))
    renderGrid()
    updateHUD()
    if (game.getState() === 'GAME_OVER') handleSolved()
    return
  }

  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    game.eraseCell()
    renderGrid()
    updateHUD()
    return
  }

  // Arrow key navigation
  const snap = game.getSnapshot()
  if (snap.selectedIndex === null) return
  const idx = snap.selectedIndex
  const row = Math.floor(idx / 9)
  const col = idx % 9

  let newIdx: number | null = null
  if (e.key === 'ArrowUp' && row > 0) newIdx = (row - 1) * 9 + col
  if (e.key === 'ArrowDown' && row < 8) newIdx = (row + 1) * 9 + col
  if (e.key === 'ArrowLeft' && col > 0) newIdx = row * 9 + (col - 1)
  if (e.key === 'ArrowRight' && col < 8) newIdx = row * 9 + (col + 1)

  if (newIdx !== null) {
    e.preventDefault()
    game.selectCell(newIdx)
    renderGrid()
  }
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  updateOverlays()
}

void boot()
