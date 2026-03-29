// Chess board logic — move generation, validation, and game state

import type { Board, Color, Move, Piece, PieceType, Position, Square } from './types.js'

// ── Piece-square tables for AI evaluation ────────────────────────────────────
// Values from white's perspective (row 0 = rank 8 from black's pov)

const PST: Record<PieceType, number[][]> = {
  pawn: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [ 5,  5, 10, 25, 25, 10,  5,  5],
    [ 0,  0,  0, 20, 20,  0,  0,  0],
    [ 5, -5,-10,  0,  0,-10, -5,  5],
    [ 5, 10, 10,-20,-20, 10, 10,  5],
    [ 0,  0,  0,  0,  0,  0,  0,  0],
  ],
  knight: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  bishop: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  rook: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [ 5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [ 0,  0,  0,  5,  5,  0,  0,  0],
  ],
  queen: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20],
  ],
  king: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20],
  ],
}

const PIECE_VALUE: Record<PieceType, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20000,
}

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null))

  const backRank: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook']

  // Black pieces on rows 0–1
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRank[c], color: 'black', hasMoved: false }
    board[1][c] = { type: 'pawn', color: 'black', hasMoved: false }
  }

  // White pieces on rows 6–7
  for (let c = 0; c < 8; c++) {
    board[6][c] = { type: 'pawn', color: 'white', hasMoved: false }
    board[7][c] = { type: backRank[c], color: 'white', hasMoved: false }
  }

  return board
}

export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(sq => (sq ? { ...sq } : null)))
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8
}

// ── Raw move generation (does NOT check if king is left in check) ─────────────

export function getRawMoves(
  board: Board,
  pos: Position,
  enPassantTarget: Position | null,
): Move[] {
  const piece = board[pos.row][pos.col]
  if (!piece) return []

  const moves: Move[] = []
  const { row, col, } = pos
  const enemy = piece.color === 'white' ? 'black' : 'white'

  const addMove = (toRow: number, toCol: number, extra?: Partial<Move>): void => {
    if (!inBounds(toRow, toCol)) return
    const target = board[toRow][toCol]
    if (target && target.color === piece.color) return
    moves.push({ from: pos, to: { row: toRow, col: toCol }, ...extra })
  }

  switch (piece.type) {
    case 'pawn': {
      const dir = piece.color === 'white' ? -1 : 1
      const startRow = piece.color === 'white' ? 6 : 1
      const promRow = piece.color === 'white' ? 0 : 7

      // Forward one step
      if (inBounds(row + dir, col) && !board[row + dir][col]) {
        const toRow = row + dir
        if (toRow === promRow) {
          moves.push({ from: pos, to: { row: toRow, col }, promotion: 'queen' })
        } else {
          moves.push({ from: pos, to: { row: toRow, col } })
        }

        // Forward two steps from start
        if (row === startRow && !board[row + 2 * dir][col]) {
          moves.push({ from: pos, to: { row: row + 2 * dir, col } })
        }
      }

      // Diagonal captures
      for (const dc of [-1, 1]) {
        const toRow = row + dir
        const toCol = col + dc
        if (!inBounds(toRow, toCol)) continue
        const target = board[toRow][toCol]
        if (target && target.color === enemy) {
          if (toRow === promRow) {
            moves.push({ from: pos, to: { row: toRow, col: toCol }, promotion: 'queen', capturedPiece: target })
          } else {
            moves.push({ from: pos, to: { row: toRow, col: toCol }, capturedPiece: target })
          }
        }

        // En passant
        if (
          enPassantTarget &&
          enPassantTarget.row === toRow &&
          enPassantTarget.col === toCol
        ) {
          moves.push({ from: pos, to: { row: toRow, col: toCol }, isEnPassant: true })
        }
      }
      break
    }

    case 'knight': {
      const deltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]
      for (const [dr, dc] of deltas) {
        addMove(row + dr, col + dc)
      }
      break
    }

    case 'bishop': {
      for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        let r = row + dr, c = col + dc
        while (inBounds(r, c)) {
          const t = board[r][c]
          if (t) {
            if (t.color === enemy) addMove(r, c)
            break
          }
          addMove(r, c)
          r += dr; c += dc
        }
      }
      break
    }

    case 'rook': {
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let r = row + dr, c = col + dc
        while (inBounds(r, c)) {
          const t = board[r][c]
          if (t) {
            if (t.color === enemy) addMove(r, c)
            break
          }
          addMove(r, c)
          r += dr; c += dc
        }
      }
      break
    }

    case 'queen': {
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        let r = row + dr, c = col + dc
        while (inBounds(r, c)) {
          const t = board[r][c]
          if (t) {
            if (t.color === enemy) addMove(r, c)
            break
          }
          addMove(r, c)
          r += dr; c += dc
        }
      }
      break
    }

    case 'king': {
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        addMove(row + dr, col + dc)
      }

      // Castling
      if (!piece.hasMoved) {
        // Kingside
        const ksRook = board[row][7]
        if (
          ksRook &&
          ksRook.type === 'rook' &&
          ksRook.color === piece.color &&
          !ksRook.hasMoved &&
          !board[row][5] &&
          !board[row][6]
        ) {
          moves.push({ from: pos, to: { row, col: 6 }, isCastle: true })
        }

        // Queenside
        const qsRook = board[row][0]
        if (
          qsRook &&
          qsRook.type === 'rook' &&
          qsRook.color === piece.color &&
          !qsRook.hasMoved &&
          !board[row][1] &&
          !board[row][2] &&
          !board[row][3]
        ) {
          moves.push({ from: pos, to: { row, col: 2 }, isCastle: true })
        }
      }
      break
    }
  }

  return moves
}

// ── Apply a move to a cloned board ───────────────────────────────────────────

export function applyMove(board: Board, move: Move): Board {
  const next = cloneBoard(board)
  const piece = next[move.from.row][move.from.col]!
  const movedPiece: Piece = { ...piece, hasMoved: true }

  // Place piece at destination
  next[move.to.row][move.to.col] = movedPiece
  next[move.from.row][move.from.col] = null

  // Promotion
  if (move.promotion) {
    next[move.to.row][move.to.col] = { ...movedPiece, type: move.promotion }
  }

  // En passant capture — remove the pawn being captured
  if (move.isEnPassant) {
    const captureRow = move.from.row
    next[captureRow][move.to.col] = null
  }

  // Castling — move the rook as well
  if (move.isCastle) {
    const row = move.from.row
    if (move.to.col === 6) {
      // Kingside
      next[row][5] = { ...next[row][7]!, hasMoved: true }
      next[row][7] = null
    } else {
      // Queenside
      next[row][3] = { ...next[row][0]!, hasMoved: true }
      next[row][0] = null
    }
  }

  return next
}

// ── Check detection ───────────────────────────────────────────────────────────

export function isKingInCheck(board: Board, color: Color): boolean {
  // Find the king
  let kingPos: Position | null = null
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (p && p.type === 'king' && p.color === color) {
        kingPos = { row: r, col: c }
        break
      }
    }
    if (kingPos) break
  }
  if (!kingPos) return false

  // Check if any enemy piece can attack the king
  const enemy = color === 'white' ? 'black' : 'white'
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (p && p.color === enemy) {
        const rawMoves = getRawMoves(board, { row: r, col: c }, null)
        for (const m of rawMoves) {
          if (m.to.row === kingPos.row && m.to.col === kingPos.col) {
            return true
          }
        }
      }
    }
  }
  return false
}

// ── Check if a square is attacked by any enemy piece ────────────────────────

export function isSquareAttacked(board: Board, pos: Position, byColor: Color): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (p && p.color === byColor) {
        const rawMoves = getRawMoves(board, { row: r, col: c }, null)
        for (const m of rawMoves) {
          if (m.to.row === pos.row && m.to.col === pos.col) return true
        }
      }
    }
  }
  return false
}

// ── Legal move generation (filters moves that leave king in check) ────────────

export function getLegalMoves(
  board: Board,
  pos: Position,
  enPassantTarget: Position | null,
): Move[] {
  const piece = board[pos.row][pos.col]
  if (!piece) return []

  const raw = getRawMoves(board, pos, enPassantTarget)
  const legal: Move[] = []

  for (const move of raw) {
    // Castling: king must not be in check, and must not pass through attacked square
    if (move.isCastle) {
      if (isKingInCheck(board, piece.color)) continue

      const row = move.from.row
      const enemy = piece.color === 'white' ? 'black' : 'white'
      const passThroughCol = move.to.col === 6 ? 5 : 3

      if (isSquareAttacked(board, { row, col: passThroughCol }, enemy)) continue
      if (isSquareAttacked(board, { row, col: move.to.col }, enemy)) continue
    }

    const nextBoard = applyMove(board, move)
    if (!isKingInCheck(nextBoard, piece.color)) {
      legal.push(move)
    }
  }

  return legal
}

// ── All legal moves for a color ───────────────────────────────────────────────

export function getAllLegalMoves(
  board: Board,
  color: Color,
  enPassantTarget: Position | null,
): Move[] {
  const allMoves: Move[] = []
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (p && p.color === color) {
        allMoves.push(...getLegalMoves(board, { row: r, col: c }, enPassantTarget))
      }
    }
  }
  return allMoves
}

// ── Board evaluation for AI ───────────────────────────────────────────────────

export function evaluateBoard(board: Board): number {
  let score = 0
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (!p) continue
      const pstRow = p.color === 'white' ? r : 7 - r
      const val = PIECE_VALUE[p.type] + PST[p.type][pstRow][c]
      if (p.color === 'white') {
        score += val
      } else {
        score -= val
      }
    }
  }
  return score
}

// ── Minimax with alpha-beta pruning ──────────────────────────────────────────

export function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  enPassantTarget: Position | null,
): number {
  if (depth === 0) return evaluateBoard(board)

  const color: Color = isMaximizing ? 'white' : 'black'
  const moves = getAllLegalMoves(board, color, enPassantTarget)

  if (moves.length === 0) {
    // Checkmate or stalemate
    if (isKingInCheck(board, color)) {
      // Checkmate — penalize current player
      return isMaximizing ? -100000 : 100000
    }
    return 0 // Stalemate
  }

  if (isMaximizing) {
    let maxEval = -Infinity
    for (const move of moves) {
      const nextBoard = applyMove(board, move)
      const newEP = getEnPassantTarget(move, board)
      const evaluation = minimax(nextBoard, depth - 1, alpha, beta, false, newEP)
      maxEval = Math.max(maxEval, evaluation)
      alpha = Math.max(alpha, evaluation)
      if (beta <= alpha) break
    }
    return maxEval
  } else {
    let minEval = Infinity
    for (const move of moves) {
      const nextBoard = applyMove(board, move)
      const newEP = getEnPassantTarget(move, board)
      const evaluation = minimax(nextBoard, depth - 1, alpha, beta, true, newEP)
      minEval = Math.min(minEval, evaluation)
      beta = Math.min(beta, evaluation)
      if (beta <= alpha) break
    }
    return minEval
  }
}

// ── Get best AI move ─────────────────────────────────────────────────────────

export function getBestMove(
  board: Board,
  enPassantTarget: Position | null,
): Move | null {
  const moves = getAllLegalMoves(board, 'black', enPassantTarget)
  if (moves.length === 0) return null

  let bestMove: Move | null = null
  let bestValue = Infinity

  for (const move of moves) {
    const nextBoard = applyMove(board, move)
    const newEP = getEnPassantTarget(move, board)
    const value = minimax(nextBoard, 2, -Infinity, Infinity, true, newEP)
    if (value < bestValue) {
      bestValue = value
      bestMove = move
    }
  }

  return bestMove
}

// ── En passant target square after a pawn double-push ────────────────────────

export function getEnPassantTarget(move: Move, board: Board): Position | null {
  const piece = board[move.from.row][move.from.col]
  if (!piece || piece.type !== 'pawn') return null
  if (Math.abs(move.to.row - move.from.row) === 2) {
    return {
      row: (move.from.row + move.to.row) / 2,
      col: move.from.col,
    }
  }
  return null
}
