// Core Hangman game logic — pure state machine, no DOM

import { pickWord } from './words.js'

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

export type LetterState = 'idle' | 'correct' | 'wrong'

export interface GameSnapshot {
  state: GameState
  word: string
  category: string
  guessed: Set<string>
  wrongCount: number
  maxWrong: number
  score: number
  streak: number
  letterStates: Record<string, LetterState>
  wordRevealed: boolean
}

const MAX_WRONG = 6
// Points awarded per word: base minus (wrongCount * penalty)
const BASE_POINTS = 100
const WRONG_PENALTY = 10

export class HangmanGame {
  private state: GameState = 'READY'
  private word: string = ''
  private category: string = ''
  private guessed: Set<string> = new Set()
  private wrongCount: number = 0
  private score: number = 0
  private streak: number = 0

  constructor() {
    this.newWord()
  }

  private newWord(): void {
    const entry = pickWord(this.word)
    this.word = entry.word
    this.category = entry.category
    this.guessed = new Set()
    this.wrongCount = 0
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  start(): void {
    if (this.state === 'READY') {
      this.state = 'PLAYING'
    }
  }

  /** Returns 'correct' | 'wrong' | 'already' | 'invalid' depending on outcome.
   *  Also returns 'solved' or 'dead' if the round ended. */
  guess(letter: string): 'correct' | 'wrong' | 'already' | 'solved' | 'dead' | 'invalid' {
    if (this.state !== 'PLAYING') return 'invalid'
    const l = letter.toLowerCase()
    if (!/^[a-z]$/.test(l)) return 'invalid'
    if (this.guessed.has(l)) return 'already'

    this.guessed.add(l)

    if (this.word.includes(l)) {
      // Check if word is now fully revealed
      const allGuessed = [...this.word].every((ch) => this.guessed.has(ch))
      if (allGuessed) {
        const points = Math.max(BASE_POINTS - this.wrongCount * WRONG_PENALTY, 10)
        this.score += points
        this.streak += 1
        return 'solved'
      }
      return 'correct'
    } else {
      this.wrongCount += 1
      if (this.wrongCount >= MAX_WRONG) {
        this.state = 'GAME_OVER'
        return 'dead'
      }
      return 'wrong'
    }
  }

  /** Advance to next word after solving. Keeps playing state. */
  nextWord(): void {
    this.newWord()
  }

  reset(): void {
    this.score = 0
    this.streak = 0
    this.state = 'READY'
    this.newWord()
  }

  getSnapshot(): GameSnapshot {
    const letterStates: Record<string, LetterState> = {}
    for (const l of this.guessed) {
      letterStates[l] = this.word.includes(l) ? 'correct' : 'wrong'
    }

    return {
      state: this.state,
      word: this.word,
      category: this.category,
      guessed: new Set(this.guessed),
      wrongCount: this.wrongCount,
      maxWrong: MAX_WRONG,
      score: this.score,
      streak: this.streak,
      letterStates,
      wordRevealed: this.state === 'GAME_OVER',
    }
  }

  getScore(): number {
    return this.score
  }

  getState(): GameState {
    return this.state
  }

  getWord(): string {
    return this.word
  }
}
