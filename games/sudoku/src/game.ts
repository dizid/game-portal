// Sudoku core logic — pure state machine, no DOM

import { pickPuzzle } from './puzzles.js'
import type { Difficulty } from './puzzles.js'

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

export type CellState = 'given' | 'empty' | 'filled' | 'error'

export interface Cell {
  value: number          // 0 = empty
  given: boolean         // true = puzzle clue, cannot be changed
  state: CellState
  notes: Set<number>     // pencil marks 1-9
}

export interface GameSnapshot {
  state: GameState
  cells: ReadonlyArray<Readonly<Cell>>
  selectedIndex: number | null
  score: number
  elapsedSeconds: number
  hintsUsed: number
  difficulty: Difficulty
  notesMode: boolean
  errorsCount: number
}

const DIFFICULTY_BASE_SCORE: Record<Difficulty, number> = {
  easy: 500,
  medium: 1000,
  hard: 2000,
}

const TIME_DEDUCTION_PER_SECOND = 0.5 // score points lost per second elapsed
const HINT_PENALTY = 50

export class SudokuGame {
  private state: GameState = 'READY'
  private cells: Cell[] = []
  private solution: string = ''
  private selectedIndex: number | null = null
  private score: number = 0
  private elapsedSeconds: number = 0
  private hintsUsed: number = 0
  private difficulty: Difficulty = 'easy'
  private notesMode: boolean = false
  private errorsCount: number = 0

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildCells(puzzleStr: string): Cell[] {
    return puzzleStr.split('').map((ch) => {
      const v = parseInt(ch, 10)
      return {
        value: v,
        given: v !== 0,
        state: v !== 0 ? 'given' : 'empty',
        notes: new Set<number>(),
      }
    })
  }

  /** Returns cell indices in the same row, column, and 3x3 box as idx */
  private getPeers(idx: number): Set<number> {
    const row = Math.floor(idx / 9)
    const col = idx % 9
    const boxRow = Math.floor(row / 3) * 3
    const boxCol = Math.floor(col / 3) * 3

    const peers = new Set<number>()

    // Same row
    for (let c = 0; c < 9; c++) peers.add(row * 9 + c)
    // Same column
    for (let r = 0; r < 9; r++) peers.add(r * 9 + col)
    // Same box
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        peers.add(r * 9 + c)
      }
    }

    peers.delete(idx) // exclude self
    return peers
  }

  /** Check if a value placement conflicts with peers */
  private hasConflict(idx: number, value: number): boolean {
    if (value === 0) return false
    for (const peer of this.getPeers(idx)) {
      if (this.cells[peer].value === value) return true
    }
    return false
  }

  /** Validate and mark all cells as correct/error */
  private validateAll(): void {
    for (let i = 0; i < 81; i++) {
      const cell = this.cells[i]
      if (cell.given || cell.value === 0) {
        cell.state = cell.given ? 'given' : 'empty'
        continue
      }
      cell.state = this.hasConflict(i, cell.value) ? 'error' : 'filled'
    }
    this.errorsCount = this.cells.filter((c) => c.state === 'error').length
  }

  /** Check if the puzzle is fully and correctly solved */
  private isSolved(): boolean {
    return this.cells.every((cell, i) => {
      return cell.value === parseInt(this.solution[i], 10)
    })
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Start a new game with the given difficulty */
  newGame(difficulty: Difficulty): void {
    const puzzle = pickPuzzle(difficulty)
    this.difficulty = difficulty
    this.solution = puzzle.solution
    this.cells = this.buildCells(puzzle.puzzle)
    this.selectedIndex = null
    this.elapsedSeconds = 0
    this.hintsUsed = 0
    this.notesMode = false
    this.errorsCount = 0
    this.score = DIFFICULTY_BASE_SCORE[difficulty]
    this.state = 'PLAYING'
  }

  /** Called every second while PLAYING */
  tickTimer(): void {
    if (this.state !== 'PLAYING') return
    this.elapsedSeconds += 1
    // Deduct from score but keep a floor of 10
    this.score = Math.max(10, this.score - TIME_DEDUCTION_PER_SECOND)
  }

  /** Select a cell by grid index (0–80) */
  selectCell(idx: number): void {
    if (this.state !== 'PLAYING') return
    this.selectedIndex = idx
  }

  /** Enter a number into the selected cell */
  enterNumber(num: number): void {
    if (this.state !== 'PLAYING' || this.selectedIndex === null) return
    const cell = this.cells[this.selectedIndex]
    if (cell.given) return

    if (this.notesMode) {
      // Toggle pencil mark
      if (cell.notes.has(num)) {
        cell.notes.delete(num)
      } else {
        cell.notes.add(num)
      }
      return
    }

    // Clear notes when placing a real number
    cell.notes.clear()
    cell.value = num
    this.validateAll()

    if (this.isSolved()) {
      this.state = 'GAME_OVER'
      this.score = Math.round(this.score)
    }
  }

  /** Erase the selected cell */
  eraseCell(): void {
    if (this.state !== 'PLAYING' || this.selectedIndex === null) return
    const cell = this.cells[this.selectedIndex]
    if (cell.given) return

    cell.value = 0
    cell.notes.clear()
    cell.state = 'empty'
    this.validateAll()
  }

  /** Toggle notes mode */
  toggleNotes(): void {
    this.notesMode = !this.notesMode
  }

  /** Use a hint: fills the selected empty/error cell with the correct answer */
  useHint(): void {
    if (this.state !== 'PLAYING' || this.selectedIndex === null) return
    const cell = this.cells[this.selectedIndex]
    if (cell.given) return

    const correct = parseInt(this.solution[this.selectedIndex], 10)
    cell.value = correct
    cell.notes.clear()
    this.hintsUsed += 1
    this.score = Math.max(0, this.score - HINT_PENALTY)
    this.validateAll()

    if (this.isSolved()) {
      this.state = 'GAME_OVER'
      this.score = Math.round(this.score)
    }
  }

  reset(): void {
    this.state = 'READY'
    this.cells = []
    this.solution = ''
    this.selectedIndex = null
    this.score = 0
    this.elapsedSeconds = 0
    this.hintsUsed = 0
    this.notesMode = false
    this.errorsCount = 0
  }

  getState(): GameState {
    return this.state
  }

  getScore(): number {
    return Math.round(this.score)
  }

  /** Get cell indices that should be highlighted (same row/col/box as selected) */
  getHighlightedIndices(): Set<number> {
    if (this.selectedIndex === null) return new Set()
    return this.getPeers(this.selectedIndex)
  }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      cells: this.cells.map((c) => ({
        ...c,
        notes: new Set(c.notes), // shallow copy
      })),
      selectedIndex: this.selectedIndex,
      score: Math.round(this.score),
      elapsedSeconds: this.elapsedSeconds,
      hintsUsed: this.hintsUsed,
      difficulty: this.difficulty,
      notesMode: this.notesMode,
      errorsCount: this.errorsCount,
    }
  }
}
