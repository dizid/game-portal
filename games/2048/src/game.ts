// 2048 — pure game logic, no DOM

export type GameState = 'READY' | 'PLAYING' | 'WON' | 'GAME_OVER'

export interface TileData {
  id: number        // stable ID for tracking across moves
  value: number
  row: number
  col: number
  isNew: boolean
  isMerged: boolean
}

export interface GameSnapshot {
  tiles: TileData[]
  score: number
  best: number
  state: GameState
  delta: number   // score added in the last move
}

let nextId = 1

export class Game2048 {
  private board: (number | null)[][] = []   // 4x4 value grid (null = empty)
  private tiles: Map<string, TileData> = new Map()  // keyed by "row,col"
  private _score: number = 0
  private _best: number = 0
  private _state: GameState = 'READY'
  private _delta: number = 0
  private _tileList: TileData[] = []

  constructor(savedBest = 0) {
    this._best = savedBest
    this.initBoard()
  }

  private initBoard(): void {
    this.board = Array.from({ length: 4 }, () => Array(4).fill(null) as (number | null)[])
  }

  private emptyCell(): { row: number; col: number } | null {
    const empties: { row: number; col: number }[] = []
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.board[r][c] === null) empties.push({ row: r, col: c })
      }
    }
    if (empties.length === 0) return null
    return empties[Math.floor(Math.random() * empties.length)]
  }

  private spawnTile(): void {
    const pos = this.emptyCell()
    if (!pos) return
    const value = Math.random() < 0.9 ? 2 : 4
    this.board[pos.row][pos.col] = value
    const tile: TileData = {
      id: nextId++,
      value,
      row: pos.row,
      col: pos.col,
      isNew: true,
      isMerged: false,
    }
    this._tileList.push(tile)
  }

  /** Rebuild _tileList from board (used after each move to sync positions). */
  private syncTiles(): void {
    // Build a lookup from old tile list by position
    const byPos = new Map<string, TileData>()
    for (const t of this._tileList) {
      byPos.set(`${t.row},${t.col}`, t)
    }
    const newList: TileData[] = []
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.board[r][c] !== null) {
          const existing = byPos.get(`${r},${c}`)
          if (existing) newList.push(existing)
        }
      }
    }
    this._tileList = newList
  }

  private canMove(): boolean {
    // Any empty cell?
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.board[r][c] === null) return true
      }
    }
    // Any adjacent matching cells?
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const v = this.board[r][c]
        if (c < 3 && this.board[r][c + 1] === v) return true
        if (r < 3 && this.board[r + 1][c] === v) return true
      }
    }
    return false
  }

  private has2048(): boolean {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.board[r][c] === 2048) return true
      }
    }
    return false
  }

  // ── Slide logic ────────────────────────────────────────────────────────────────

  /**
   * Slides a single row/column (as an array) left.
   * Returns { row: new values, gained: score gained, merged: set of indices that merged }.
   */
  private slideLeft(line: (number | null)[]): {
    result: (number | null)[]
    gained: number
    mergedIndices: Set<number>
  } {
    const nums = line.filter((v) => v !== null) as number[]
    let gained = 0
    const mergedIndices = new Set<number>()
    const merged: number[] = []
    let i = 0
    while (i < nums.length) {
      if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
        const val = nums[i] * 2
        merged.push(val)
        mergedIndices.add(merged.length - 1)
        gained += val
        i += 2
      } else {
        merged.push(nums[i])
        i++
      }
    }
    // Pad with nulls
    while (merged.length < 4) merged.push(null as unknown as number)
    return { result: merged as (number | null)[], gained, mergedIndices }
  }

  private move(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    // Clear new/merged flags
    for (const t of this._tileList) {
      t.isNew = false
      t.isMerged = false
    }
    this._delta = 0

    const oldBoard = this.board.map((r) => [...r])

    // We'll process tiles by tracking their IDs at each position
    // Build position→tile map
    const posTile = new Map<string, TileData>()
    for (const t of this._tileList) {
      posTile.set(`${t.row},${t.col}`, t)
    }

    let totalGained = 0

    if (direction === 'left' || direction === 'right') {
      for (let r = 0; r < 4; r++) {
        let line: (number | null)[] = []
        let tileRefs: (TileData | null)[] = []
        for (let c = 0; c < 4; c++) {
          const ci = direction === 'right' ? 3 - c : c
          line.push(this.board[r][ci])
          tileRefs.push(posTile.get(`${r},${ci}`) ?? null)
        }

        const { result, gained, mergedIndices } = this.slideLeft(line)
        totalGained += gained

        // Compact tileRefs (non-null) to align with result
        const compactRefs = tileRefs.filter((t) => t !== null) as TileData[]
        let ri = 0   // index into result
        let ci2 = 0  // index into compactRefs
        const resultNonNull = result.filter((v) => v !== null)

        for (let k = 0; k < resultNonNull.length; k++) {
          const col = direction === 'right' ? 3 - k : k
          // Write value back to board
          this.board[r][col] = resultNonNull[k]

          if (mergedIndices.has(k)) {
            // This slot was a merge — consume two refs
            const ref1 = compactRefs[ci2]
            const ref2 = compactRefs[ci2 + 1]
            ci2 += 2
            // ref2 is absorbed — remove it from tileList
            // ref1 survives with new value and position
            if (ref1) { ref1.value = resultNonNull[k] as number; ref1.row = r; ref1.col = col; ref1.isMerged = true }
            if (ref2) { this._tileList = this._tileList.filter((t) => t !== ref2) }
          } else {
            const ref = compactRefs[ci2++]
            if (ref) { ref.row = r; ref.col = col }
          }
          ri++
        }

        // Clear empty slots in board
        for (let c = 0; c < 4; c++) {
          const ci3 = direction === 'right' ? 3 - c : c
          if (c >= resultNonNull.length) this.board[r][ci3] = null
        }
      }
    } else {
      // up / down — transpose, slide, transpose back
      for (let c = 0; c < 4; c++) {
        let line: (number | null)[] = []
        let tileRefs: (TileData | null)[] = []
        for (let r = 0; r < 4; r++) {
          const ri = direction === 'down' ? 3 - r : r
          line.push(this.board[ri][c])
          tileRefs.push(posTile.get(`${ri},${c}`) ?? null)
        }

        const { result, gained, mergedIndices } = this.slideLeft(line)
        totalGained += gained

        const compactRefs = tileRefs.filter((t) => t !== null) as TileData[]
        let ci2 = 0
        const resultNonNull = result.filter((v) => v !== null)

        for (let k = 0; k < resultNonNull.length; k++) {
          const row = direction === 'down' ? 3 - k : k
          this.board[row][c] = resultNonNull[k]

          if (mergedIndices.has(k)) {
            const ref1 = compactRefs[ci2]
            const ref2 = compactRefs[ci2 + 1]
            ci2 += 2
            if (ref1) { ref1.value = resultNonNull[k] as number; ref1.row = row; ref1.col = c; ref1.isMerged = true }
            if (ref2) { this._tileList = this._tileList.filter((t) => t !== ref2) }
          } else {
            const ref = compactRefs[ci2++]
            if (ref) { ref.row = row; ref.col = c }
          }
        }

        // Clear empty slots
        for (let r = 0; r < 4; r++) {
          const ri = direction === 'down' ? 3 - r : r
          const k = direction === 'down' ? 3 - ri : ri
          if (k >= resultNonNull.length) this.board[ri][c] = null
        }
      }
    }

    // Check if board changed
    const changed = oldBoard.some((row, r) => row.some((v, c) => v !== this.board[r][c]))
    if (!changed) return false

    this._score += totalGained
    this._delta = totalGained
    if (this._score > this._best) this._best = this._score

    // Spawn new tile
    this.spawnTile()

    // Check win / game-over
    if (this.has2048() && this._state === 'PLAYING') {
      this._state = 'WON'
    } else if (!this.canMove()) {
      this._state = 'GAME_OVER'
    }

    return true
  }

  // ── Public API ─────────────────────────────────────────────────────────────────

  start(): void {
    this.initBoard()
    this._tileList = []
    this._score = 0
    this._delta = 0
    this._state = 'PLAYING'
    this.spawnTile()
    this.spawnTile()
  }

  keepPlaying(): void {
    if (this._state === 'WON') this._state = 'PLAYING'
  }

  handleMove(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    if (this._state !== 'PLAYING') return false
    return this.move(direction)
  }

  getSnapshot(): GameSnapshot {
    return {
      tiles: this._tileList.map((t) => ({ ...t })),
      score: this._score,
      best: this._best,
      state: this._state,
      delta: this._delta,
    }
  }

  getState(): GameState { return this._state }
  getScore(): number    { return this._score }
  getBest(): number     { return this._best }
}
