// Core Wordle game logic — pure state machine, no DOM

import { ANSWERS, VALID_GUESSES } from './words.js'

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'
export type TileStatus = 'correct' | 'present' | 'absent' | 'empty' | 'active'

export interface TileResult {
  letter: string
  status: TileStatus
}

export interface GuessResult {
  tiles: TileResult[]
  word: string
}

export interface GameSnapshot {
  state: GameState
  answer: string
  guesses: GuessResult[]
  currentInput: string
  maxGuesses: number
  won: boolean
  score: number
  dayNumber: number
  shareEmoji: string
  /** Best keyboard color per letter */
  keyColors: Map<string, TileStatus>
}

const MAX_GUESSES = 6
const WORD_LENGTH = 5

// Score per guess attempt (guess 1 = 600, guess 6 = 100)
const GUESS_SCORES: Record<number, number> = {
  1: 600, 2: 500, 3: 400, 4: 300, 5: 200, 6: 100,
}

/** Get today's day index, seeded by calendar date */
function getDayNumber(): number {
  const epoch = new Date('2024-01-01').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = today.getTime() - epoch
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

/** Pick today's answer deterministically */
function getDailyAnswer(): string {
  const day = getDayNumber()
  return ANSWERS[day % ANSWERS.length].toLowerCase()
}

/** Evaluate a guess against the answer — handles duplicate letters correctly */
function evaluateGuess(guess: string, answer: string): TileResult[] {
  const result: TileResult[] = Array.from({ length: WORD_LENGTH }, (_, i) => ({
    letter: guess[i],
    status: 'absent' as TileStatus,
  }))

  // Track remaining answer letters (after exact matches are removed)
  const remaining = answer.split('')

  // Pass 1: correct positions
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      result[i].status = 'correct'
      remaining[i] = '' // consumed
    }
  }

  // Pass 2: present (wrong position)
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i].status === 'correct') continue
    const idx = remaining.indexOf(guess[i])
    if (idx !== -1) {
      result[i].status = 'present'
      remaining[idx] = '' // consume
    }
  }

  return result
}

/** Build emoji grid for sharing */
function buildShareEmoji(guesses: GuessResult[], won: boolean, maxGuesses: number): string {
  const emojiMap: Record<TileStatus, string> = {
    correct: '🟩', present: '🟨', absent: '⬛', empty: '⬜', active: '⬜',
  }
  const rows = guesses.map((g) => g.tiles.map((t) => emojiMap[t.status]).join(''))
  const score = won ? `${guesses.length}/${maxGuesses}` : 'X/' + maxGuesses
  return `Wordle ${score}\n\n${rows.join('\n')}`
}

export class WordleGame {
  private state: GameState = 'READY'
  private answer: string
  private dayNumber: number
  private guesses: GuessResult[] = []
  private currentInput: string = ''
  private won: boolean = false
  private score: number = 0
  private keyColors: Map<string, TileStatus> = new Map()

  constructor() {
    this.dayNumber = getDayNumber()
    this.answer = getDailyAnswer()
  }

  start(): void {
    if (this.state === 'READY') {
      this.state = 'PLAYING'
    }
  }

  reset(): void {
    this.guesses = []
    this.currentInput = ''
    this.won = false
    this.score = 0
    this.keyColors = new Map()
    this.dayNumber = getDayNumber()
    this.answer = getDailyAnswer()
    this.state = 'READY'
  }

  /** Add a letter to the current input. Returns false if input is full or game not playing. */
  addLetter(letter: string): boolean {
    if (this.state !== 'PLAYING') return false
    if (this.currentInput.length >= WORD_LENGTH) return false
    this.currentInput += letter.toLowerCase()
    return true
  }

  /** Remove last letter from current input. */
  deleteLetter(): boolean {
    if (this.state !== 'PLAYING') return false
    if (this.currentInput.length === 0) return false
    this.currentInput = this.currentInput.slice(0, -1)
    return true
  }

  /**
   * Submit current guess.
   * Returns: 'short' | 'invalid' | 'accepted'
   */
  submitGuess(): 'short' | 'invalid' | 'accepted' {
    if (this.state !== 'PLAYING') return 'invalid'
    if (this.currentInput.length < WORD_LENGTH) return 'short'
    if (!VALID_GUESSES.has(this.currentInput)) return 'invalid'

    const tiles = evaluateGuess(this.currentInput, this.answer)
    const guessResult: GuessResult = { tiles, word: this.currentInput }
    this.guesses.push(guessResult)

    // Update keyboard colors (correct > present > absent)
    for (const tile of tiles) {
      const current = this.keyColors.get(tile.letter)
      if (current === 'correct') continue
      if (tile.status === 'correct') {
        this.keyColors.set(tile.letter, 'correct')
      } else if (tile.status === 'present' && current !== 'correct') {
        this.keyColors.set(tile.letter, 'present')
      } else if (tile.status === 'absent' && !current) {
        this.keyColors.set(tile.letter, 'absent')
      }
    }

    this.currentInput = ''

    // Check win
    if (tiles.every((t) => t.status === 'correct')) {
      this.won = true
      this.score = GUESS_SCORES[this.guesses.length] ?? 100
      this.state = 'GAME_OVER'
      return 'accepted'
    }

    // Check loss
    if (this.guesses.length >= MAX_GUESSES) {
      this.won = false
      this.score = 0
      this.state = 'GAME_OVER'
      return 'accepted'
    }

    return 'accepted'
  }

  getState(): GameState { return this.state }
  getAnswer(): string { return this.answer }
  isWon(): boolean { return this.won }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      answer: this.answer,
      guesses: this.guesses.map((g) => ({
        tiles: g.tiles.map((t) => ({ ...t })),
        word: g.word,
      })),
      currentInput: this.currentInput,
      maxGuesses: MAX_GUESSES,
      won: this.won,
      score: this.score,
      dayNumber: this.dayNumber,
      shareEmoji: buildShareEmoji(this.guesses, this.won, MAX_GUESSES),
      keyColors: new Map(this.keyColors),
    }
  }
}
