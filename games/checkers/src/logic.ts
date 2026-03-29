// Checkers game logic — move generation, AI (minimax depth 4)

import type { Board, Color, Move, Piece, Position, Square } from './types.js'

// ── Board initialization ──────────────────────────────────────────────────────

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null))

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 !== 0) {
        board[r][c] = { color: 'black', isKing: false }
      }
    }
  }

  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 !== 0) {
        board[r][c] = { color: 'red', isKing: false }
      }
    }
  }

  return board
}

export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(sq => (sq ? { ...sq } : null)))
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8
}

// ── Single-step moves for one piece ──────────────────────────────────────────

function getSimpleMoves(board: Board, pos: Position): Move[] {
  const piece = board[pos.row][pos.col]
  if (!piece) return []

  const moves: Move[] = []
  const dirs: number[] = piece.isKing ? [-1, 1] : piece.color === 'red' ? [-1] : [1]

  for (const dr of dirs) {
    for (const dc of [-1, 1]) {
      const nr = pos.row + dr
      const nc = pos.col + dc
      if (inBounds(nr, nc) && !board[nr][nc]) {
        moves.push({ from: pos, to: { row: nr, col: nc }, captures: [] })
      }
    }
  }

  return moves
}

// ── Multi-jump expansion ──────────────────────────────────────────────────────

function getJumps(
  board: Board,
  pos: Position,
  piece: Piece,
  capturedSoFar: Position[],
): Move[] {
  const dirs: number[] = piece.isKing ? [-1, 1] : piece.color === 'red' ? [-1] : [1]
  const jumps: Move[] = []

  for (const dr of dirs) {
    for (const dc of [-1, 1]) {
      const mr = pos.row + dr  // middle (captured piece)
      const mc = pos.col + dc
      const nr = pos.row + 2 * dr // landing square
      const nc = pos.col + 2 * dc

      if (!inBounds(nr, nc)) continue
      const middlePiece = board[mr][mc]
      if (!middlePiece || middlePiece.color === piece.color) continue

      // Don't re-capture already captured squares
      if (capturedSoFar.some(p => p.row === mr && p.col === mc)) continue

      if (!board[nr][nc]) {
        const newCaptures = [...capturedSoFar, { row: mr, col: mc }]
        const jump: Move = {
          from: capturedSoFar.length === 0 ? pos : capturedSoFar[0], // not used internally
          to: { row: nr, col: nc },
          captures: newCaptures,
        }

        // Try to continue jumping from the landing square
        // Temporarily apply the jump to check further jumps
        const tempBoard = cloneBoard(board)
        tempBoard[nr][nc] = piece
        tempBoard[pos.row][pos.col] = null
        for (const cap of newCaptures) tempBoard[cap.row][cap.col] = null

        const further = getJumps(tempBoard, { row: nr, col: nc }, piece, newCaptures)

        if (further.length > 0) {
          jumps.push(...further)
        } else {
          jumps.push(jump)
        }
      }
    }
  }

  return jumps
}

// ── All moves for a piece ─────────────────────────────────────────────────────

function getPieceMoves(board: Board, pos: Position): Move[] {
  const piece = board[pos.row][pos.col]
  if (!piece) return []

  const jumps = getJumps(board, pos, piece, [])
  if (jumps.length > 0) {
    // Attach correct 'from' position
    return jumps.map(j => ({ ...j, from: pos }))
  }

  return getSimpleMoves(board, pos)
}

// ── All legal moves for a color (mandatory capture enforced) ─────────────────

export function getAllMoves(board: Board, color: Color): Move[] {
  const allMoves: Move[] = []
  const allJumps: Move[] = []

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (p && p.color === color) {
        const pieceMoves = getPieceMoves(board, { row: r, col: c })
        for (const m of pieceMoves) {
          if (m.captures.length > 0) {
            allJumps.push(m)
          } else {
            allMoves.push(m)
          }
        }
      }
    }
  }

  // If any jumps exist, only jumps are legal (mandatory capture)
  return allJumps.length > 0 ? allJumps : allMoves
}

// ── Apply move to board ───────────────────────────────────────────────────────

export function applyMove(board: Board, move: Move): Board {
  const next = cloneBoard(board)
  const piece = next[move.from.row][move.from.col]!

  // Move piece
  next[move.to.row][move.to.col] = { ...piece }
  next[move.from.row][move.from.col] = null

  // Remove captured pieces
  for (const cap of move.captures) {
    next[cap.row][cap.col] = null
  }

  // King promotion
  if (
    (piece.color === 'red' && move.to.row === 0) ||
    (piece.color === 'black' && move.to.row === 7)
  ) {
    next[move.to.row][move.to.col] = { ...piece, isKing: true }
  }

  return next
}

// ── Count pieces ──────────────────────────────────────────────────────────────

export function countPieces(board: Board): { red: number; black: number } {
  let red = 0, black = 0
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (!p) continue
      if (p.color === 'red') red++
      else black++
    }
  }
  return { red, black }
}

// ── Board evaluation ──────────────────────────────────────────────────────────

function evaluate(board: Board): number {
  let score = 0
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (!p) continue
      const val = p.isKing ? 3 : 1
      // Black AI maximizes
      if (p.color === 'black') score += val
      else score -= val
    }
  }
  return score
}

// ── Minimax with alpha-beta pruning (depth 4) ─────────────────────────────────

export function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
): number {
  const color: Color = isMaximizing ? 'black' : 'red'
  const moves = getAllMoves(board, color)

  if (depth === 0 || moves.length === 0) {
    return evaluate(board)
  }

  if (isMaximizing) {
    let maxEval = -Infinity
    for (const move of moves) {
      const next = applyMove(board, move)
      const val = minimax(next, depth - 1, alpha, beta, false)
      maxEval = Math.max(maxEval, val)
      alpha = Math.max(alpha, val)
      if (beta <= alpha) break
    }
    return maxEval
  } else {
    let minEval = Infinity
    for (const move of moves) {
      const next = applyMove(board, move)
      const val = minimax(next, depth - 1, alpha, beta, true)
      minEval = Math.min(minEval, val)
      beta = Math.min(beta, val)
      if (beta <= alpha) break
    }
    return minEval
  }
}

export function getBestMove(board: Board): Move | null {
  const moves = getAllMoves(board, 'black')
  if (moves.length === 0) return null

  let bestMove: Move | null = null
  let bestValue = -Infinity

  for (const move of moves) {
    const next = applyMove(board, move)
    const val = minimax(next, 3, -Infinity, Infinity, false)
    if (val > bestValue) {
      bestValue = val
      bestMove = move
    }
  }

  return bestMove
}
