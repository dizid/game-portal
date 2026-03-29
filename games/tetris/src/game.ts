// Tetris — pure game logic

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

// ── Tetrominoes ───────────────────────────────────────────────────────────────

export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'L' | 'J'

export const TETROMINO_COLORS: Record<TetrominoType, string> = {
  I: '#00d4ff',   // cyan
  O: '#f5e642',   // yellow
  T: '#b464ff',   // purple
  S: '#44ff88',   // green
  Z: '#ff4466',   // red
  L: '#ff8c00',   // orange
  J: '#4488ff',   // blue
}

// Each tetromino defined as [row][col] offsets from the pivot point
// Stored as 4x4 matrices for rotation
const TETROMINO_SHAPES: Record<TetrominoType, number[][]> = {
  I: [
    [0,0,0,0],
    [1,1,1,1],
    [0,0,0,0],
    [0,0,0,0],
  ],
  O: [
    [0,1,1,0],
    [0,1,1,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
  T: [
    [0,1,0,0],
    [1,1,1,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
  S: [
    [0,1,1,0],
    [1,1,0,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
  Z: [
    [1,1,0,0],
    [0,1,1,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
  L: [
    [0,0,1,0],
    [1,1,1,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
  J: [
    [1,0,0,0],
    [1,1,1,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Piece {
  type: TetrominoType
  x: number       // grid column of pivot
  y: number       // grid row of pivot
  rotation: number // 0..3
}

export interface Cell {
  filled: boolean
  color: string
}

export interface GameSnapshot {
  state: GameState
  board: Cell[][]   // [row][col], 20 rows x 10 cols
  activePiece: Piece | null
  ghostY: number    // ghost piece Y position
  nextPiece: Piece
  score: number
  level: number
  lines: number
  fieldW: number
  fieldH: number
  lineClearTimer: number  // rows being cleared (for flash animation)
  clearingRows: number[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLS = 10
const ROWS = 20
const LINE_SCORES = [0, 100, 300, 500, 800]  // 0,1,2,3,4 lines
const BASE_TICK_MS = 1000
const MIN_TICK_MS = 100
const SPEED_STEP_MS = 50    // ms reduction per level
const LINES_PER_LEVEL = 10

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ filled: false, color: '' }))
  )
}

function randomType(): TetrominoType {
  const types: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'L', 'J']
  return types[Math.floor(Math.random() * types.length)]
}

function spawnPiece(): Piece {
  return {
    type: randomType(),
    x: Math.floor(COLS / 2) - 2,
    y: 0,
    rotation: 0,
  }
}

/** Returns the occupied cells of a piece as [row, col] pairs. */
function getCells(piece: Piece): Array<[number, number]> {
  const shape = rotateMat(TETROMINO_SHAPES[piece.type], piece.rotation)
  const cells: Array<[number, number]> = []
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (shape[r][c]) {
        cells.push([piece.y + r, piece.x + c])
      }
    }
  }
  return cells
}

/** Rotate a 4x4 matrix 90° clockwise, n times. */
function rotateMat(mat: number[][], n: number): number[][] {
  let m = mat
  for (let i = 0; i < ((n % 4) + 4) % 4; i++) {
    const next: number[][] = Array.from({ length: 4 }, () => Array(4).fill(0))
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        next[c][3 - r] = m[r][c]
      }
    }
    m = next
  }
  return m
}

// ── Game class ────────────────────────────────────────────────────────────────

export class TetrisGame {
  private state: GameState = 'READY'
  private board: Cell[][] = emptyBoard()
  private activePiece: Piece | null = null
  private nextPiece: Piece = spawnPiece()
  private score: number = 0
  private level: number = 1
  private lines: number = 0
  private tickAccum: number = 0
  private lineClearTimer: number = 0
  private clearingRows: number[] = []
  private softDrop: boolean = false

  getState(): GameState { return this.state }
  getScore(): number { return this.score }
  getLevel(): number { return this.level }
  getLines(): number { return this.lines }
  getTickMs(): number {
    return Math.max(MIN_TICK_MS, BASE_TICK_MS - (this.level - 1) * SPEED_STEP_MS)
  }

  start(): void {
    if (this.state !== 'READY') return
    this.activePiece = spawnPiece()
    this.state = 'PLAYING'
  }

  reset(): void {
    this.state = 'READY'
    this.board = emptyBoard()
    this.activePiece = null
    this.nextPiece = spawnPiece()
    this.score = 0
    this.level = 1
    this.lines = 0
    this.tickAccum = 0
    this.lineClearTimer = 0
    this.clearingRows = []
    this.softDrop = false
  }

  setSoftDrop(active: boolean): void {
    this.softDrop = active
  }

  moveLeft(): void {
    if (!this.activePiece || this.state !== 'PLAYING') return
    this.tryMove(this.activePiece.x - 1, this.activePiece.y, this.activePiece.rotation)
  }

  moveRight(): void {
    if (!this.activePiece || this.state !== 'PLAYING') return
    this.tryMove(this.activePiece.x + 1, this.activePiece.y, this.activePiece.rotation)
  }

  rotate(): void {
    if (!this.activePiece || this.state !== 'PLAYING') return
    const newRot = (this.activePiece.rotation + 1) % 4
    // Wall kick: try offsets 0, -1, 1, -2, 2
    for (const kick of [0, -1, 1, -2, 2]) {
      if (this.tryMove(this.activePiece.x + kick, this.activePiece.y, newRot)) return
    }
  }

  hardDrop(): void {
    if (!this.activePiece || this.state !== 'PLAYING') return
    const ghostY = this.calcGhostY()
    this.score += (ghostY - this.activePiece.y) * 2  // bonus points
    this.activePiece.y = ghostY
    this.lockPiece()
  }

  update(dt: number): void {
    if (this.state !== 'PLAYING') return

    // Wait out line-clear animation
    if (this.lineClearTimer > 0) {
      this.lineClearTimer -= dt
      if (this.lineClearTimer <= 0) {
        this.lineClearTimer = 0
        this.removeLines(this.clearingRows)
        this.clearingRows = []
      }
      return
    }

    const tickMs = this.softDrop ? Math.max(50, this.getTickMs() / 10) : this.getTickMs()
    this.tickAccum += dt * 1000

    while (this.tickAccum >= tickMs) {
      this.tickAccum -= tickMs
      this.stepDown()
    }
  }

  getSnapshot(): GameSnapshot {
    const ghostY = this.activePiece ? this.calcGhostY() : 0
    return {
      state: this.state,
      board: this.board.map(row => row.map(cell => ({ ...cell }))),
      activePiece: this.activePiece ? { ...this.activePiece } : null,
      ghostY,
      nextPiece: { ...this.nextPiece },
      score: this.score,
      level: this.level,
      lines: this.lines,
      fieldW: COLS,
      fieldH: ROWS,
      lineClearTimer: this.lineClearTimer,
      clearingRows: [...this.clearingRows],
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private tryMove(x: number, y: number, rotation: number): boolean {
    if (!this.activePiece) return false
    const test: Piece = { ...this.activePiece, x, y, rotation }
    if (this.collides(test)) return false
    this.activePiece = test
    return true
  }

  private collides(piece: Piece): boolean {
    for (const [r, c] of getCells(piece)) {
      if (c < 0 || c >= COLS || r >= ROWS) return true
      if (r < 0) continue  // above board is allowed during spawn
      if (this.board[r][c].filled) return true
    }
    return false
  }

  private stepDown(): void {
    if (!this.activePiece) return
    const moved = this.tryMove(this.activePiece.x, this.activePiece.y + 1, this.activePiece.rotation)
    if (!moved) {
      this.lockPiece()
    }
  }

  private lockPiece(): void {
    if (!this.activePiece) return
    const color = TETROMINO_COLORS[this.activePiece.type]
    for (const [r, c] of getCells(this.activePiece)) {
      if (r < 0) {
        // Piece locked above board = game over
        this.state = 'GAME_OVER'
        return
      }
      this.board[r][c] = { filled: true, color }
    }

    this.activePiece = null
    this.checkLines()

    // Spawn next piece
    this.activePiece = this.nextPiece
    this.nextPiece = spawnPiece()

    // Check if spawned piece collides immediately (top-out)
    if (this.collides(this.activePiece)) {
      this.state = 'GAME_OVER'
    }
  }

  private checkLines(): void {
    const fullRows: number[] = []
    for (let r = 0; r < ROWS; r++) {
      if (this.board[r].every(cell => cell.filled)) {
        fullRows.push(r)
      }
    }
    if (fullRows.length === 0) return

    this.clearingRows = fullRows
    this.lineClearTimer = 0.3  // 300ms flash

    const cleared = fullRows.length
    this.lines += cleared
    this.score += (LINE_SCORES[cleared] ?? 800) * this.level

    // Level up every LINES_PER_LEVEL
    this.level = Math.floor(this.lines / LINES_PER_LEVEL) + 1
  }

  private removeLines(rows: number[]): void {
    // Remove the rows and add empty rows at top
    const sortedRows = [...rows].sort((a, b) => b - a)
    for (const row of sortedRows) {
      this.board.splice(row, 1)
      this.board.unshift(Array.from({ length: COLS }, () => ({ filled: false, color: '' })))
    }
  }

  private calcGhostY(): number {
    if (!this.activePiece) return 0
    let ghostY = this.activePiece.y
    while (!this.collides({ ...this.activePiece, y: ghostY + 1 })) {
      ghostY++
    }
    return ghostY
  }
}
