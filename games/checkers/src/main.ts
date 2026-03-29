// Checkers — main entry point

import type { Move, Position } from './types.js'
import {
  createInitialBoard,
  applyMove,
  getAllMoves,
  countPieces,
  getBestMove,
} from './logic.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── Mute button ────────────────────────────────────────────────────────────────
const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── Canvas setup ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement
const statusEl = document.getElementById('status-bar') as HTMLDivElement

let cellSize = 60

function resize(): void {
  const container = canvas.parentElement!
  const maxSize = Math.min(container.clientWidth, container.clientHeight - 80)
  const size = Math.floor(maxSize / 8) * 8
  canvas.width = size
  canvas.height = size
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
  cellSize = size / 8
  render()
}

window.addEventListener('resize', resize)

// ── Game state ────────────────────────────────────────────────────────────────

let board = createInitialBoard()
let selectedPos: Position | null = null
let legalMovesForSelected: Move[] = []
let gameOver = false
let score = 0
let highScore = 0
// Track initial black count to compute captures
let blackCaptured = 0

// ── Render ────────────────────────────────────────────────────────────────────

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const lightSq = '#f0d9b5'
  const darkSq  = '#7a4a2a'

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const x = c * cellSize
      const y = r * cellSize

      // Board color — checkers only uses dark squares
      const isDark = (r + c) % 2 !== 0
      ctx.fillStyle = isDark ? darkSq : lightSq
      ctx.fillRect(x, y, cellSize, cellSize)

      // Selection highlight
      if (selectedPos && selectedPos.row === r && selectedPos.col === c) {
        ctx.fillStyle = 'rgba(50, 200, 80, 0.5)'
        ctx.fillRect(x, y, cellSize, cellSize)
      }

      // Legal move highlight
      const isLegal = legalMovesForSelected.some(m => m.to.row === r && m.to.col === c)
      if (isLegal) {
        ctx.fillStyle = 'rgba(50, 200, 80, 0.3)'
        ctx.fillRect(x, y, cellSize, cellSize)

        // Small dot
        ctx.fillStyle = 'rgba(50, 220, 80, 0.6)'
        ctx.beginPath()
        ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.13, 0, Math.PI * 2)
        ctx.fill()
      }

      // Piece
      const piece = board[r][c]
      if (!piece) continue

      const cx = x + cellSize / 2
      const cy = y + cellSize / 2
      const radius = cellSize * 0.38

      // Outer shadow ring
      ctx.beginPath()
      ctx.arc(cx, cy + cellSize * 0.03, radius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fill()

      // Main piece
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      const isRed = piece.color === 'red'
      ctx.fillStyle = isRed ? '#e03030' : '#222222'
      ctx.fill()

      // Highlight sheen
      ctx.beginPath()
      ctx.arc(cx - radius * 0.25, cy - radius * 0.25, radius * 0.4, 0, Math.PI * 2)
      ctx.fillStyle = isRed ? 'rgba(255,160,160,0.4)' : 'rgba(180,180,180,0.2)'
      ctx.fill()

      // King crown indicator
      if (piece.isKing) {
        ctx.font = `${cellSize * 0.38}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#ffd700'
        ctx.fillText('♛', cx, cy + 1)
      }
    }
  }
}

// ── Update status ─────────────────────────────────────────────────────────────

function setStatus(msg: string): void {
  statusEl.textContent = msg
}

// ── Handle player input ───────────────────────────────────────────────────────

function handleClick(evt: MouseEvent | TouchEvent): void {
  if (gameOver) return

  const rect = canvas.getBoundingClientRect()
  let clientX: number, clientY: number

  if ('touches' in evt) {
    if (evt.touches.length === 0) return
    clientX = evt.touches[0].clientX
    clientY = evt.touches[0].clientY
  } else {
    clientX = evt.clientX
    clientY = evt.clientY
  }

  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const canvasX = (clientX - rect.left) * scaleX
  const canvasY = (clientY - rect.top) * scaleY

  const col = Math.floor(canvasX / cellSize)
  const row = Math.floor(canvasY / cellSize)

  if (col < 0 || col > 7 || row < 0 || row > 7) return

  const pos: Position = { row, col }
  const piece = board[row][col]

  if (selectedPos) {
    // Try to execute the move
    const moveToMake = legalMovesForSelected.find(
      m => m.to.row === row && m.to.col === col
    )

    if (moveToMake) {
      executePlayerMove(moveToMake)
      return
    }

    // Re-select red piece
    if (piece && piece.color === 'red') {
      const allMoves = getAllMoves(board, 'red')
      const movesForPiece = allMoves.filter(
        m => m.from.row === row && m.from.col === col
      )
      if (movesForPiece.length > 0) {
        selectedPos = pos
        legalMovesForSelected = movesForPiece
        render()
        return
      }
    }

    // Deselect
    selectedPos = null
    legalMovesForSelected = []
    render()
    return
  }

  // Select red piece
  if (piece && piece.color === 'red') {
    const allMoves = getAllMoves(board, 'red')
    const movesForPiece = allMoves.filter(
      m => m.from.row === row && m.from.col === col
    )
    if (movesForPiece.length > 0) {
      selectedPos = pos
      legalMovesForSelected = movesForPiece
      render()
    }
  }
}

// ── Execute player move ───────────────────────────────────────────────────────

function executePlayerMove(move: Move): void {
  board = applyMove(board, move)
  selectedPos = null
  legalMovesForSelected = []

  // Update score for captures
  blackCaptured += move.captures.length
  score = blackCaptured * 10
  scoreEl.textContent = String(score)
  reportScore(score)

  // Sound: capture > move
  if (move.captures.length > 0) {
    audio.score()
    try { navigator.vibrate(15) } catch {}
  } else {
    audio.blip()
    try { navigator.vibrate(10) } catch {}
  }

  render()

  // Check if black has moves left
  const blackMoves = getAllMoves(board, 'black')
  if (blackMoves.length === 0) {
    handleGameEnd(true)
    return
  }

  setStatus('AI thinking...')

  requestAnimationFrame(() => {
    setTimeout(() => {
      executeAIMove()
    }, 80)
  })
}

// ── Execute AI move ───────────────────────────────────────────────────────────

function executeAIMove(): void {
  const aiMove = getBestMove(board)
  if (!aiMove) {
    handleGameEnd(true)
    return
  }

  board = applyMove(board, aiMove)
  render()

  // Check if player has moves
  const redMoves = getAllMoves(board, 'red')
  if (redMoves.length === 0) {
    handleGameEnd(false)
    return
  }

  setStatus('Red to move')
}

// ── Game end ──────────────────────────────────────────────────────────────────

function handleGameEnd(playerWon: boolean): void {
  gameOver = true

  if (playerWon) {
    score += 100 // win bonus
    scoreEl.textContent = String(score)
    audio.levelUp()
  } else {
    audio.death()
    try { navigator.vibrate([100, 50, 100]) } catch {}
  }

  if (score > highScore) {
    highScore = score
    highScoreEl.textContent = String(highScore)
    saveHighScore(highScore)
  }

  reportGameOver(score)

  const msg = playerWon ? `You win! Score: ${score}` : 'Black wins!'
  setStatus(msg + ' Tap to play again.')

  render()

  canvas.addEventListener('click', restartOnce)
  canvas.addEventListener('touchend', restartOnce)
}

function restartOnce(): void {
  canvas.removeEventListener('click', restartOnce)
  canvas.removeEventListener('touchend', restartOnce)
  restartGame()
}

function restartGame(): void {
  board = createInitialBoard()
  selectedPos = null
  legalMovesForSelected = []
  gameOver = false
  score = 0
  blackCaptured = 0
  scoreEl.textContent = '0'
  setStatus('Red to move')
  render()
}

// ── Input ─────────────────────────────────────────────────────────────────────

canvas.addEventListener('click', handleClick)
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  handleClick(e)
}, { passive: false })

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
    highScoreEl.textContent = String(highScore)
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  resize()
  audio.start()
  setStatus('Red to move')
}

void boot()
