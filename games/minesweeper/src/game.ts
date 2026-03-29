// Core Minesweeper logic — pure state machine, no DOM

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'
export type CellState = 'hidden' | 'revealed' | 'flagged'

export interface Cell {
  row: number
  col: number
  isMine: boolean
  state: CellState
  adjacent: number // number of adjacent mines
}

export interface GameSnapshot {
  state: GameState
  cells: Cell[][]
  rows: number
  cols: number
  totalMines: number
  flagsPlaced: number
  timeElapsed: number // seconds
  score: number
  won: boolean
  revealedCount: number
}

const ROWS = 9
const COLS = 9
const TOTAL_MINES = 10
const SAFE_CELLS = ROWS * COLS - TOTAL_MINES

export class MinesweeperGame {
  private cells: Cell[][] = []
  private state: GameState = 'READY'
  private won: boolean = false
  private flagsPlaced: number = 0
  private timeElapsed: number = 0
  private revealedCount: number = 0
  private minesPlaced: boolean = false

  constructor() {
    this.initBoard()
  }

  private initBoard(): void {
    this.cells = []
    for (let r = 0; r < ROWS; r++) {
      this.cells[r] = []
      for (let c = 0; c < COLS; c++) {
        this.cells[r][c] = {
          row: r, col: c,
          isMine: false,
          state: 'hidden',
          adjacent: 0,
        }
      }
    }
    this.flagsPlaced = 0
    this.revealedCount = 0
    this.minesPlaced = false
  }

  /**
   * Place mines after first click so the first click is always safe.
   * The clicked cell and its immediate neighbours are excluded.
   */
  private placeMines(safeRow: number, safeCol: number): void {
    const excluded = new Set<string>()
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = safeRow + dr
        const nc = safeCol + dc
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
          excluded.add(`${nr},${nc}`)
        }
      }
    }

    // Gather candidates and shuffle
    const candidates: [number, number][] = []
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!excluded.has(`${r},${c}`)) {
          candidates.push([r, c])
        }
      }
    }

    // Fisher-Yates shuffle (first TOTAL_MINES elements become mines)
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }

    for (let i = 0; i < TOTAL_MINES; i++) {
      const [r, c] = candidates[i]
      this.cells[r][c].isMine = true
    }

    // Compute adjacent counts
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.cells[r][c].isMine) continue
        this.cells[r][c].adjacent = this.countAdjacentMines(r, c)
      }
    }

    this.minesPlaced = true
  }

  private countAdjacentMines(row: number, col: number): number {
    let count = 0
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = row + dr
        const nc = col + dc
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
          if (this.cells[nr][nc].isMine) count++
        }
      }
    }
    return count
  }

  /** Flood-fill reveal for empty cells (adjacent=0) */
  private floodReveal(row: number, col: number): void {
    const queue: [number, number][] = [[row, col]]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const [r, c] = queue.shift()!
      const key = `${r},${c}`
      if (visited.has(key)) continue
      visited.add(key)

      const cell = this.cells[r][c]
      if (cell.state !== 'hidden') continue
      if (cell.isMine) continue

      cell.state = 'revealed'
      this.revealedCount++

      // If this cell has no adjacent mines, queue its neighbours
      if (cell.adjacent === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue
            const nr = r + dr
            const nc = c + dc
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              const key2 = `${nr},${nc}`
              if (!visited.has(key2)) {
                queue.push([nr, nc])
              }
            }
          }
        }
      }
    }
  }

  /** Reveal all mines on game over */
  private revealAllMines(hitRow: number, hitCol: number): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.cells[r][c]
        if (cell.isMine && cell.state === 'hidden') {
          cell.state = 'revealed'
        }
        // Mark wrong flags
        if (!cell.isMine && cell.state === 'flagged') {
          cell.state = 'revealed' // will be styled as wrong-flag in UI
        }
      }
    }
    // The hit mine gets a special state (handled in snapshot as hitMine)
    this.cells[hitRow][hitCol].state = 'revealed'
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Called by main loop every second when PLAYING */
  tick(): void {
    if (this.state === 'PLAYING') {
      this.timeElapsed++
    }
  }

  /**
   * Reveal a cell.
   * Returns 'mine' if hit a mine, 'ok' otherwise, 'noop' if already revealed/flagged.
   */
  reveal(row: number, col: number): 'mine' | 'ok' | 'noop' {
    if (this.state === 'GAME_OVER') return 'noop'
    const cell = this.cells[row][col]
    if (cell.state !== 'hidden') return 'noop'

    // First click: place mines, start timer
    if (!this.minesPlaced) {
      this.placeMines(row, col)
      this.state = 'PLAYING'
    }

    if (cell.isMine) {
      cell.state = 'revealed'
      this.revealAllMines(row, col)
      this.state = 'GAME_OVER'
      this.won = false
      return 'mine'
    }

    this.floodReveal(row, col)

    // Win check: all non-mine cells revealed
    if (this.revealedCount >= SAFE_CELLS) {
      this.state = 'GAME_OVER'
      this.won = true
      // Auto-flag remaining mines
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cl = this.cells[r][c]
          if (cl.isMine && cl.state === 'hidden') {
            cl.state = 'flagged'
            this.flagsPlaced++
          }
        }
      }
    }

    return 'ok'
  }

  /** Toggle flag on a hidden cell. */
  toggleFlag(row: number, col: number): boolean {
    if (this.state === 'GAME_OVER') return false
    const cell = this.cells[row][col]
    if (cell.state === 'revealed') return false

    if (cell.state === 'flagged') {
      cell.state = 'hidden'
      this.flagsPlaced--
    } else {
      cell.state = 'flagged'
      this.flagsPlaced++
    }
    return true
  }

  reset(): void {
    this.state = 'READY'
    this.won = false
    this.timeElapsed = 0
    this.initBoard()
  }

  /** Calculate score: time bonus. Max 1000, decreases with time. */
  getScore(): number {
    if (!this.won) return 0
    // 1000 - 10 per second, min 100
    return Math.max(100, 1000 - this.timeElapsed * 10)
  }

  getState(): GameState { return this.state }
  isWon(): boolean { return this.won }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      cells: this.cells.map((row) => row.map((cell) => ({ ...cell }))),
      rows: ROWS,
      cols: COLS,
      totalMines: TOTAL_MINES,
      flagsPlaced: this.flagsPlaced,
      timeElapsed: this.timeElapsed,
      score: this.getScore(),
      won: this.won,
      revealedCount: this.revealedCount,
    }
  }
}
