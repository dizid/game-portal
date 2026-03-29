// Core Match-3 logic — pure state machine, no canvas/DOM

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

export const GRID_ROWS = 8
export const GRID_COLS = 8
export const GEM_TYPES = 6
export const GAME_DURATION_SEC = 60

// Score constants
const SCORE_3 = 30
const SCORE_4 = 60
const SCORE_5 = 100

export interface Gem {
  type: number // 0..GEM_TYPES-1
  /** Unique id for animation tracking */
  id: number
  /** Animation: falling from row offset */
  fallFrom?: number
  /** Animation: being removed */
  removing?: boolean
}

export interface SwapAnimation {
  r1: number; c1: number
  r2: number; c2: number
  /** 0..1 progress */
  t: number
  reverse: boolean // true when swap is invalid and reverting
}

export interface GameSnapshot {
  state: GameState
  grid: (Gem | null)[][]
  score: number
  timeLeft: number
  combo: number
  swapAnim: SwapAnimation | null
  selected: { row: number; col: number } | null
}

let nextId = 1
function newGem(type?: number): Gem {
  return { type: type ?? Math.floor(Math.random() * GEM_TYPES), id: nextId++ }
}

/** Find all matches (3+ in a row or column) — returns set of "r,c" keys */
function findMatches(grid: (Gem | null)[][]): Set<string> {
  const matched = new Set<string>()

  // Horizontal
  for (let r = 0; r < GRID_ROWS; r++) {
    let run = 1
    for (let c = 1; c <= GRID_COLS; c++) {
      const prev = grid[r][c - 1]
      const curr = c < GRID_COLS ? grid[r][c] : null
      if (curr && prev && curr.type === prev.type) {
        run++
      } else {
        if (run >= 3) {
          for (let k = c - run; k < c; k++) matched.add(`${r},${k}`)
        }
        run = 1
      }
    }
  }

  // Vertical
  for (let c = 0; c < GRID_COLS; c++) {
    let run = 1
    for (let r = 1; r <= GRID_ROWS; r++) {
      const prev = grid[r - 1][c]
      const curr = r < GRID_ROWS ? grid[r][c] : null
      if (curr && prev && curr.type === prev.type) {
        run++
      } else {
        if (run >= 3) {
          for (let k = r - run; k < r; k++) matched.add(`${k},${c}`)
        }
        run = 1
      }
    }
  }

  return matched
}

/** Score for a run length */
function scoreForRun(len: number): number {
  if (len >= 5) return SCORE_5
  if (len >= 4) return SCORE_4
  return SCORE_3
}

/** Score all matched cells (by finding contiguous runs in the matched set) */
function scoreMatches(grid: (Gem | null)[][], matched: Set<string>): number {
  let total = 0

  // Horizontal runs
  for (let r = 0; r < GRID_ROWS; r++) {
    let run = 0
    for (let c = 0; c < GRID_COLS; c++) {
      if (matched.has(`${r},${c}`)) {
        run++
      } else if (run > 0) {
        total += scoreForRun(run)
        run = 0
      }
    }
    if (run > 0) total += scoreForRun(run)
  }

  // Vertical runs
  for (let c = 0; c < GRID_COLS; c++) {
    let run = 0
    for (let r = 0; r < GRID_ROWS; r++) {
      if (matched.has(`${r},${c}`)) {
        run++
      } else if (run > 0) {
        total += scoreForRun(run)
        run = 0
      }
    }
    if (run > 0) total += scoreForRun(run)
  }

  return total
}

/** Check if any valid swap exists on the board */
function hasValidMoves(grid: (Gem | null)[][]): boolean {
  const dirs: [number, number][] = [[0,1],[1,0]]
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      for (const [dr, dc] of dirs) {
        const nr = r + dr
        const nc = c + dc
        if (nr >= GRID_ROWS || nc >= GRID_COLS) continue
        // Try swap
        const copy = grid.map((row) => [...row])
        ;[copy[r][c], copy[nr][nc]] = [copy[nr][nc], copy[r][c]]
        if (findMatches(copy).size > 0) return true
      }
    }
  }
  return false
}

/** Shuffle grid in place until valid moves exist */
function shuffle(grid: (Gem | null)[][]): void {
  const gems: number[] = []
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c]) gems.push(grid[r][c]!.type)
    }
  }
  // Fisher-Yates
  for (let i = gems.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[gems[i], gems[j]] = [gems[j], gems[i]]
  }
  let idx = 0
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c]) {
        grid[r][c] = newGem(gems[idx++])
      }
    }
  }
}

export class Match3Game {
  private grid: (Gem | null)[][] = []
  private state: GameState = 'READY'
  private score: number = 0
  private timeLeft: number = GAME_DURATION_SEC
  private combo: number = 1
  private selected: { row: number; col: number } | null = null
  private swapAnim: SwapAnimation | null = null
  // Cascading: flag so the main loop knows to keep processing
  private pendingCascade: boolean = false

  constructor() {
    this.initGrid()
  }

  private initGrid(): void {
    this.grid = []
    for (let r = 0; r < GRID_ROWS; r++) {
      this.grid[r] = []
      for (let c = 0; c < GRID_COLS; c++) {
        // Avoid initial matches
        let gem: Gem
        let attempts = 0
        do {
          gem = newGem()
          attempts++
        } while (
          attempts < 20 &&
          (
            (c >= 2 && this.grid[r][c-1]?.type === gem.type && this.grid[r][c-2]?.type === gem.type) ||
            (r >= 2 && this.grid[r-1][c]?.type === gem.type && this.grid[r-2][c]?.type === gem.type)
          )
        )
        this.grid[r][c] = gem
      }
    }
  }

  start(): void {
    if (this.state === 'READY') {
      this.state = 'PLAYING'
    }
  }

  reset(): void {
    this.score = 0
    this.timeLeft = GAME_DURATION_SEC
    this.combo = 1
    this.selected = null
    this.swapAnim = null
    this.pendingCascade = false
    this.initGrid()
    this.state = 'READY'
  }

  /** Called every second when PLAYING */
  tickTimer(): void {
    if (this.state !== 'PLAYING') return
    this.timeLeft = Math.max(0, this.timeLeft - 1)
    if (this.timeLeft === 0) {
      this.state = 'GAME_OVER'
    }
  }

  /** Handle tap/click on a cell. Returns true if something happened. */
  selectCell(row: number, col: number): boolean {
    if (this.state !== 'PLAYING') return false
    if (this.swapAnim) return false // mid-animation

    if (!this.selected) {
      this.selected = { row, col }
      return true
    }

    const sel = this.selected
    if (sel.row === row && sel.col === col) {
      // Deselect
      this.selected = null
      return true
    }

    // Check adjacency
    const dr = Math.abs(row - sel.row)
    const dc = Math.abs(col - sel.col)
    if (dr + dc !== 1) {
      // Not adjacent — reselect
      this.selected = { row, col }
      return true
    }

    // Try swap
    this.selected = null
    this.trySwap(sel.row, sel.col, row, col)
    return true
  }

  private trySwap(r1: number, c1: number, r2: number, c2: number): void {
    // Perform swap
    ;[this.grid[r1][c1], this.grid[r2][c2]] = [this.grid[r2][c2], this.grid[r1][c1]]
    const matches = findMatches(this.grid)

    if (matches.size === 0) {
      // Invalid swap — revert
      ;[this.grid[r1][c1], this.grid[r2][c2]] = [this.grid[r2][c2], this.grid[r1][c1]]
      this.swapAnim = { r1, c1, r2, c2, t: 0, reverse: true }
      this.combo = 1
      return
    }

    // Valid — record animation, then resolve
    this.swapAnim = { r1, c1, r2, c2, t: 0, reverse: false }
    // Cascade will be triggered after animation completes (see resolveMatches)
    this.pendingCascade = true
  }

  /**
   * Called after a successful swap animation completes.
   * Resolves matches, drops gems, fills gaps, handles chains.
   * Returns the score gained this cascade step.
   */
  resolveMatches(): number {
    const matches = findMatches(this.grid)
    if (matches.size === 0) {
      this.combo = 1
      this.pendingCascade = false
      this.checkShuffleNeeded()
      return 0
    }

    // Mark removing
    matches.forEach((key) => {
      const [r, c] = key.split(',').map(Number)
      if (this.grid[r][c]) this.grid[r][c]!.removing = true
    })

    const raw = scoreMatches(this.grid, matches)
    const gained = raw * this.combo
    this.score += gained
    this.combo++

    // Remove matched gems
    matches.forEach((key) => {
      const [r, c] = key.split(',').map(Number)
      this.grid[r][c] = null
    })

    // Gravity: drop gems down
    for (let c = 0; c < GRID_COLS; c++) {
      let writeRow = GRID_ROWS - 1
      for (let r = GRID_ROWS - 1; r >= 0; r--) {
        if (this.grid[r][c] !== null) {
          if (r !== writeRow) {
            const gem = this.grid[r][c]!
            gem.fallFrom = r
            this.grid[writeRow][c] = gem
            this.grid[r][c] = null
          }
          writeRow--
        }
      }
      // Fill empty rows from top with new gems
      for (let r = writeRow; r >= 0; r--) {
        const gem = newGem()
        gem.fallFrom = r - (writeRow + 1) - 1
        this.grid[r][c] = gem
      }
    }

    this.pendingCascade = true
    return gained
  }

  private checkShuffleNeeded(): void {
    if (!hasValidMoves(this.grid)) {
      shuffle(this.grid)
    }
  }

  finishSwapAnimation(): void {
    this.swapAnim = null
  }

  isPendingCascade(): boolean { return this.pendingCascade }
  getState(): GameState { return this.state }
  getScore(): number { return this.score }
  getCombo(): number { return this.combo }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      grid: this.grid.map((row) => row.map((gem) => gem ? { ...gem } : null)),
      score: this.score,
      timeLeft: this.timeLeft,
      combo: this.combo,
      swapAnim: this.swapAnim ? { ...this.swapAnim } : null,
      selected: this.selected ? { ...this.selected } : null,
    }
  }
}
