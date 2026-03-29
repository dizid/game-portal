// Chess — main entry point

import type { Color, Move, Position } from './types.js'
import {
  createInitialBoard,
  applyMove,
  getLegalMoves,
  getAllLegalMoves,
  isKingInCheck,
  getBestMove,
  getEnPassantTarget,
} from './board.js'
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
const statusEl = document.querySelector('#status-bar') as HTMLDivElement

let cellSize = 60
let boardOffset = 0 // pixel offset for board left/top inside canvas

function resize(): void {
  const container = canvas.parentElement!
  const maxSize = Math.min(container.clientWidth, container.clientHeight - 80)
  const size = Math.floor(maxSize / 8) * 8
  canvas.width = size
  canvas.height = size
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
  cellSize = size / 8
  boardOffset = 0
  render()
}

window.addEventListener('resize', resize)

// ── Game state ────────────────────────────────────────────────────────────────

let board = createInitialBoard()
let selectedPos: Position | null = null
let legalMovesForSelected: Move[] = []
let currentTurn: Color = 'white'
let enPassantTarget: Position | null = null
let gameOver = false
let checkFlash = false
let checkFlashTimer = 0
let score = 0
let highScore = 0
let gameStartTime = 0

// ── Unicode pieces ────────────────────────────────────────────────────────────

const PIECE_GLYPHS: Record<string, string> = {
  'white-king':   '♔',
  'white-queen':  '♕',
  'white-rook':   '♖',
  'white-bishop': '♗',
  'white-knight': '♘',
  'white-pawn':   '♙',
  'black-king':   '♚',
  'black-queen':  '♛',
  'black-rook':   '♜',
  'black-bishop': '♝',
  'black-knight': '♞',
  'black-pawn':   '♟',
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const lightColor = '#f0d9b5'
  const darkColor  = '#b58863'
  const selectedColor = 'rgba(20, 85, 30, 0.5)'
  const legalDotColor = 'rgba(20, 85, 30, 0.4)'
  const checkColor  = checkFlash ? 'rgba(220, 50, 50, 0.6)' : 'rgba(220, 50, 50, 0.35)'

  // Find king in check
  let kingInCheckPos: Position | null = null
  if (isKingInCheck(board, currentTurn)) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c]
        if (p && p.type === 'king' && p.color === currentTurn) {
          kingInCheckPos = { row: r, col: c }
        }
      }
    }
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const x = boardOffset + c * cellSize
      const y = boardOffset + r * cellSize

      // Board square color
      const isLight = (r + c) % 2 === 0
      ctx.fillStyle = isLight ? lightColor : darkColor
      ctx.fillRect(x, y, cellSize, cellSize)

      // Selected square highlight
      if (selectedPos && selectedPos.row === r && selectedPos.col === c) {
        ctx.fillStyle = selectedColor
        ctx.fillRect(x, y, cellSize, cellSize)
      }

      // King in check highlight
      if (kingInCheckPos && kingInCheckPos.row === r && kingInCheckPos.col === c) {
        ctx.fillStyle = checkColor
        ctx.fillRect(x, y, cellSize, cellSize)
      }

      // Legal move dots
      const isLegalTarget = legalMovesForSelected.some(
        m => m.to.row === r && m.to.col === c
      )
      if (isLegalTarget) {
        const target = board[r][c]
        if (target) {
          // Ring around capture square
          ctx.strokeStyle = legalDotColor
          ctx.lineWidth = cellSize * 0.08
          ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4)
        } else {
          // Dot on empty square
          ctx.fillStyle = legalDotColor
          ctx.beginPath()
          ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.15, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Piece
      const piece = board[r][c]
      if (piece) {
        const glyph = PIECE_GLYPHS[`${piece.color}-${piece.type}`]
        ctx.font = `${cellSize * 0.72}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Shadow for white pieces to show on light squares
        ctx.shadowColor = piece.color === 'white' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.15)'
        ctx.shadowBlur = 3
        ctx.fillStyle = piece.color === 'white' ? '#ffffff' : '#1a1a1a'
        ctx.fillText(glyph, x + cellSize / 2, y + cellSize / 2 + cellSize * 0.03)
        ctx.shadowBlur = 0
      }
    }
  }
}

// ── Check flash animation ─────────────────────────────────────────────────────

function tickCheckFlash(): void {
  if (!isKingInCheck(board, currentTurn)) {
    checkFlash = false
    return
  }
  checkFlashTimer++
  checkFlash = Math.floor(checkFlashTimer / 5) % 2 === 0
}

// ── Update status bar ─────────────────────────────────────────────────────────

function updateStatus(msg: string): void {
  statusEl.textContent = msg
}

// ── Handle player click ───────────────────────────────────────────────────────

function handleClick(evt: MouseEvent | TouchEvent): void {
  if (gameOver || currentTurn !== 'white') return

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

  // Scale from CSS pixels to canvas pixels
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const canvasX = (clientX - rect.left) * scaleX
  const canvasY = (clientY - rect.top) * scaleY

  const col = Math.floor((canvasX - boardOffset) / cellSize)
  const row = Math.floor((canvasY - boardOffset) / cellSize)

  if (col < 0 || col > 7 || row < 0 || row > 7) return

  const clickedPos: Position = { row, col }
  const clickedPiece = board[row][col]

  if (selectedPos) {
    // Try to execute move
    const moveToMake = legalMovesForSelected.find(
      m => m.to.row === row && m.to.col === col
    )

    if (moveToMake) {
      executePlayerMove(moveToMake)
      return
    }

    // Re-select own piece
    if (clickedPiece && clickedPiece.color === 'white') {
      selectedPos = clickedPos
      legalMovesForSelected = getLegalMoves(board, clickedPos, enPassantTarget)
      render()
      return
    }

    // Deselect
    selectedPos = null
    legalMovesForSelected = []
    render()
    return
  }

  // Select white piece
  if (clickedPiece && clickedPiece.color === 'white') {
    selectedPos = clickedPos
    legalMovesForSelected = getLegalMoves(board, clickedPos, enPassantTarget)
    render()
  }
}

// ── Execute a player move ─────────────────────────────────────────────────────

function executePlayerMove(move: Move): void {
  const newEP = getEnPassantTarget(move, board)
  // Play capture sound vs normal move sound
  if (move.capturedPiece || move.isEnPassant) {
    audio.score()
  } else {
    audio.blip()
  }
  try { navigator.vibrate(10) } catch {}
  board = applyMove(board, move)
  enPassantTarget = newEP
  selectedPos = null
  legalMovesForSelected = []
  currentTurn = 'black'
  checkFlashTimer = 0

  render()

  if (checkGameEnd('black')) return

  updateStatus('AI thinking...')

  // Let the render paint before starting AI calculation
  requestAnimationFrame(() => {
    setTimeout(() => {
      executeAIMove()
    }, 50)
  })
}

// ── Execute AI move ───────────────────────────────────────────────────────────

function executeAIMove(): void {
  const aiMove = getBestMove(board, enPassantTarget)

  if (!aiMove) {
    // AI has no moves — should have been caught by checkGameEnd
    return
  }

  const newEP = getEnPassantTarget(aiMove, board)
  board = applyMove(board, aiMove)
  enPassantTarget = newEP
  currentTurn = 'white'
  checkFlashTimer = 0

  // Subtle click for AI move
  audio.click()
  render()

  if (checkGameEnd('white')) return

  if (isKingInCheck(board, 'white')) {
    updateStatus('Check! White to move')
  } else {
    updateStatus('White to move')
  }
}

// ── Game end detection ────────────────────────────────────────────────────────

function checkGameEnd(colorToCheck: Color): boolean {
  const moves = getAllLegalMoves(board, colorToCheck, enPassantTarget)

  if (moves.length === 0) {
    if (isKingInCheck(board, colorToCheck)) {
      const winner = colorToCheck === 'white' ? 'Black' : 'White'
      const playerWon = colorToCheck === 'black'

      if (playerWon) {
        const elapsed = Math.max(1, (Date.now() - gameStartTime) / 1000)
        const speedBonus = Math.floor(Math.max(0, 300 - elapsed))
        score = 1000 + speedBonus
        if (score > highScore) {
          highScore = score
          highScoreEl.textContent = String(highScore)
          saveHighScore(highScore)
        }
        scoreEl.textContent = String(score)
        reportScore(score)
        reportGameOver(score)
        audio.levelUp()
        updateStatus(`Checkmate! ${winner} wins! Score: ${score}`)
      } else {
        audio.death()
        try { navigator.vibrate([100, 50, 100]) } catch {}
        reportGameOver(0)
        updateStatus(`Checkmate! ${winner} wins.`)
      }
    } else {
      audio.click()
      reportGameOver(score)
      updateStatus('Stalemate! Draw.')
    }

    gameOver = true
    render()
    showRestartPrompt()
    return true
  }

  return false
}

// ── Restart prompt ────────────────────────────────────────────────────────────

function showRestartPrompt(): void {
  setTimeout(() => {
    updateStatus(statusEl.textContent + ' Tap/click to play again.')
    canvas.addEventListener('click', restartOnce)
    canvas.addEventListener('touchend', restartOnce)
  }, 1500)
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
  currentTurn = 'white'
  enPassantTarget = null
  gameOver = false
  checkFlash = false
  checkFlashTimer = 0
  score = 0
  scoreEl.textContent = '0'
  gameStartTime = Date.now()
  updateStatus('White to move')
  render()
}

// ── Input listeners ───────────────────────────────────────────────────────────

canvas.addEventListener('click', handleClick)
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  handleClick(e)
}, { passive: false })

// ── Animation loop for check flash ───────────────────────────────────────────

function animLoop(): void {
  if (!gameOver) {
    tickCheckFlash()
    render()
  }
  requestAnimationFrame(animLoop)
}

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
  gameStartTime = Date.now()
  audio.start()
  updateStatus('White to move')
  requestAnimationFrame(animLoop)
}

void boot()
