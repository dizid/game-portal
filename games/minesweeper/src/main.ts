// Entry point — Minesweeper: click to reveal, long-press/right-click to flag

import { MinesweeperGame } from './game.js'
import type { GameSnapshot } from './game.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── Mute button ────────────────────────────────────────────────────────────────
const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── DOM ────────────────────────────────────────────────────────────────────────

const boardEl     = document.getElementById('board')       as HTMLDivElement
const mineCountEl = document.getElementById('mine-count')  as HTMLSpanElement
const timerEl     = document.getElementById('timer-value') as HTMLSpanElement
const scoreEl     = document.getElementById('score-value') as HTMLSpanElement
const resetBtn    = document.getElementById('reset-btn')   as HTMLButtonElement
const overlay     = document.getElementById('overlay')     as HTMLDivElement
const overlayCard = document.getElementById('overlay-card') as HTMLDivElement

// ── State ──────────────────────────────────────────────────────────────────────

const game = new MinesweeperGame()
let highScore = 0
let timerInterval: ReturnType<typeof setInterval> | null = null
let cellElements: HTMLDivElement[][] = []
let timerStarted = false

// Long-press detection for mobile flagging
const LONG_PRESS_MS = 400
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressFired = false

// ── Layout constants ───────────────────────────────────────────────────────────

const COLS = 9
const ROWS = 9

// ── Board rendering ────────────────────────────────────────────────────────────

const NUMBER_LABELS = ['', '1','2','3','4','5','6','7','8']

function buildBoard(): void {
  while (boardEl.firstChild) boardEl.removeChild(boardEl.firstChild)
  cellElements = []

  const wrap = document.getElementById('board-wrap') as HTMLDivElement
  const available = Math.min(wrap.clientWidth, wrap.clientHeight) - 4
  const cellSize = Math.floor(available / COLS)
  boardEl.style.width = `${cellSize * COLS + (COLS - 1) * 2}px`

  for (let r = 0; r < ROWS; r++) {
    cellElements[r] = []
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div')
      cell.className = 'cell hidden'
      cell.style.width = `${cellSize}px`
      cell.style.height = `${cellSize}px`

      // Desktop: left click = reveal, right click = flag
      cell.addEventListener('click', (e) => {
        if (longPressFired) return
        e.preventDefault()
        handleReveal(r, c)
      })

      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        handleFlag(r, c)
      })

      // Mobile: touchstart starts long-press timer
      cell.addEventListener('touchstart', (e) => {
        e.preventDefault()
        longPressFired = false
        longPressTimer = setTimeout(() => {
          longPressFired = true
          handleFlag(r, c)
        }, LONG_PRESS_MS)
      }, { passive: false })

      cell.addEventListener('touchend', (e) => {
        e.preventDefault()
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
        if (!longPressFired) {
          handleReveal(r, c)
        }
      })

      cell.addEventListener('touchmove', () => {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
      })

      boardEl.appendChild(cell)
      cellElements[r][c] = cell
    }
  }
}

function renderBoard(snap: GameSnapshot): void {
  let lastMineShowEl: HTMLDivElement | null = null

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = snap.cells[r][c]
      const el = cellElements[r][c]
      el.className = 'cell'

      if (cell.state === 'flagged') {
        el.className = 'cell flagged'
        el.textContent = '🚩'
        continue
      }

      if (cell.state === 'hidden') {
        el.className = 'cell hidden'
        el.textContent = ''
        continue
      }

      // Revealed
      if (cell.isMine) {
        if (snap.state === 'GAME_OVER' && !snap.won) {
          el.className = 'cell mine-show'
          el.textContent = '💣'
          lastMineShowEl = el
        }
        continue
      }

      // Non-mine revealed — check wrong flag (was flagged but not a mine)
      el.className = `cell revealed${cell.adjacent > 0 ? ` n${cell.adjacent}` : ''}`
      el.textContent = cell.adjacent > 0 ? NUMBER_LABELS[cell.adjacent] : ''
    }
  }

  // Mark the detonated mine with a distinctive style (last mine-show = the one hit)
  if (snap.state === 'GAME_OVER' && !snap.won && lastMineShowEl) {
    lastMineShowEl.className = 'cell mine-hit'
    lastMineShowEl.textContent = '💥'
  }

  // Update HUD
  mineCountEl.textContent = String(Math.max(0, snap.totalMines - snap.flagsPlaced))
  timerEl.textContent = String(snap.timeElapsed)
  if (snap.state === 'GAME_OVER' && snap.won) {
    scoreEl.textContent = String(snap.score)
  }
}

// ── Input ──────────────────────────────────────────────────────────────────────

function handleReveal(row: number, col: number): void {
  if (game.getState() === 'GAME_OVER') return

  const wasReady = game.getState() === 'READY' || !timerStarted

  const result = game.reveal(row, col)

  // Start timer on first reveal
  if (wasReady && game.getState() === 'PLAYING' && !timerStarted) {
    timerStarted = true
    audio.start()
    startTimer()
  }

  const snap = game.getSnapshot()
  renderBoard(snap)

  if (result === 'mine') {
    stopTimer()
    timerStarted = false
    resetBtn.textContent = '😵'
    audio.death()
    try { navigator.vibrate([100, 50, 100]) } catch {}
    reportGameOver(0)
    setTimeout(() => showGameOverOverlay(snap), 600)
    return
  }

  // Safe reveal
  audio.blip()
  try { navigator.vibrate(10) } catch {}

  if (snap.state === 'GAME_OVER' && snap.won) {
    stopTimer()
    timerStarted = false
    resetBtn.textContent = '😎'
    audio.levelUp()
    reportScore(snap.score)
    reportGameOver(snap.score)
    renderBoard(snap)
    setTimeout(() => showGameOverOverlay(snap), 400)
  }
}

function handleFlag(row: number, col: number): void {
  if (game.getState() === 'GAME_OVER') return
  game.toggleFlag(row, col)
  audio.click()
  try { navigator.vibrate(20) } catch {}
  renderBoard(game.getSnapshot())
}

// ── Timer ──────────────────────────────────────────────────────────────────────

function startTimer(): void {
  if (timerInterval) return
  timerInterval = setInterval(() => {
    game.tick()
    timerEl.textContent = String(game.getSnapshot().timeElapsed)
  }, 1000)
}

function stopTimer(): void {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
}

// ── Overlay ────────────────────────────────────────────────────────────────────

function clearOverlay(): void {
  while (overlayCard.firstChild) overlayCard.removeChild(overlayCard.firstChild)
}

function showReadyOverlay(): void {
  overlay.classList.remove('hidden')
  clearOverlay()

  const h2 = document.createElement('h2')
  h2.textContent = 'Minesweeper'
  overlayCard.appendChild(h2)

  const p = document.createElement('p')
  p.textContent = '9×9 grid, 10 mines. Tap to reveal. Long-press (or right-click) to flag. First click is always safe.'
  overlayCard.appendChild(p)

  const btn = document.createElement('button')
  btn.className = 'btn'
  btn.textContent = 'Play'
  btn.addEventListener('click', () => {
    overlay.classList.add('hidden')
  })
  overlayCard.appendChild(btn)
}

function showGameOverOverlay(snap: GameSnapshot): void {
  overlay.classList.remove('hidden')
  clearOverlay()

  if (snap.won && snap.score > highScore) {
    highScore = snap.score
    saveHighScore(highScore)
  }

  const h2 = document.createElement('h2')
  h2.textContent = snap.won ? 'You Win!' : 'Boom!'
  overlayCard.appendChild(h2)

  if (snap.won) {
    const scoreDiv = document.createElement('div')
    scoreDiv.className = 'score-big'
    scoreDiv.textContent = `${snap.score} pts`
    overlayCard.appendChild(scoreDiv)

    const time = document.createElement('p')
    time.textContent = `Cleared in ${snap.timeElapsed}s`
    overlayCard.appendChild(time)
  } else {
    const p = document.createElement('p')
    p.textContent = 'You hit a mine!'
    overlayCard.appendChild(p)
  }

  const btn = document.createElement('button')
  btn.className = 'btn'
  btn.textContent = 'Play Again'
  btn.addEventListener('click', () => {
    overlay.classList.add('hidden')
    resetGame()
  })
  overlayCard.appendChild(btn)
}

// ── Reset ──────────────────────────────────────────────────────────────────────

function resetGame(): void {
  stopTimer()
  timerStarted = false
  game.reset()
  resetBtn.textContent = '🙂'
  scoreEl.textContent = '—'
  timerEl.textContent = '0'
  mineCountEl.textContent = '10'
  buildBoard()
  renderBoard(game.getSnapshot())
}

resetBtn.addEventListener('click', () => {
  overlay.classList.add('hidden')
  resetGame()
})

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  buildBoard()
  renderBoard(game.getSnapshot())
  showReadyOverlay()
}

void boot()
