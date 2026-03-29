// Trivia core logic — pure state machine, no DOM

import { QUESTIONS } from './questions.js'
import type { Question } from './questions.js'

export type GameState = 'READY' | 'PLAYING' | 'ANSWERED' | 'GAME_OVER'

export interface RoundStats {
  correct: number
  total: number
  bestStreak: number
  score: number
}

export interface GameSnapshot {
  state: GameState
  question: Question | null
  questionIndex: number    // 0-based current question
  totalQuestions: number
  selectedIndex: number | null
  isCorrect: boolean | null
  score: number
  streak: number
  bestStreak: number
  timeLeft: number         // 0–15 seconds
  timerPct: number         // 0–100 for the timer bar
  stats: RoundStats
}

const QUESTIONS_PER_ROUND = 10
const TIME_LIMIT = 15       // seconds per question
const BASE_POINTS = 100
const MAX_TIME_BONUS = 50   // extra points for fast answer

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Pick N questions, one per category as much as possible, then random
function pickQuestions(count: number): Question[] {
  const byCategory = new Map<string, Question[]>()
  for (const q of QUESTIONS) {
    const list = byCategory.get(q.category) ?? []
    list.push(q)
    byCategory.set(q.category, list)
  }

  const selected: Question[] = []

  // One from each category first
  for (const [, qs] of byCategory) {
    const shuffled = shuffle(qs)
    if (selected.length < count) {
      selected.push(shuffled[0])
    }
  }

  // Fill remaining slots from all questions not already selected
  const remaining = shuffle(QUESTIONS.filter((q) => !selected.includes(q)))
  for (const q of remaining) {
    if (selected.length >= count) break
    selected.push(q)
  }

  return shuffle(selected).slice(0, count)
}

export class TriviaGame {
  private state: GameState = 'READY'
  private questions: Question[] = []
  private questionIndex: number = 0
  private selectedIndex: number | null = null
  private isCorrect: boolean | null = null
  private score: number = 0
  private streak: number = 0
  private bestStreak: number = 0
  private correct: number = 0

  // Timer state (managed externally via tick)
  private timeLeft: number = TIME_LIMIT
  private timerStarted = false

  // ── Public API ────────────────────────────────────────────────────────────────

  start(): void {
    if (this.state !== 'READY') return
    this.questions = pickQuestions(QUESTIONS_PER_ROUND)
    this.questionIndex = 0
    this.score = 0
    this.streak = 0
    this.bestStreak = 0
    this.correct = 0
    this.selectedIndex = null
    this.isCorrect = null
    this.timeLeft = TIME_LIMIT
    this.timerStarted = true
    this.state = 'PLAYING'
  }

  reset(): void {
    this.state = 'READY'
    this.questions = []
    this.questionIndex = 0
    this.selectedIndex = null
    this.isCorrect = null
    this.score = 0
    this.streak = 0
    this.bestStreak = 0
    this.correct = 0
    this.timeLeft = TIME_LIMIT
    this.timerStarted = false
  }

  /** Called each second. Returns true if time ran out. */
  tickTimer(): boolean {
    if (this.state !== 'PLAYING' || !this.timerStarted) return false
    this.timeLeft = Math.max(0, this.timeLeft - 1)
    if (this.timeLeft === 0) {
      // Time's up — treat as wrong answer
      this.selectAnswer(-1)
      return true
    }
    return false
  }

  /** Player selects an answer option (pass -1 for timeout) */
  selectAnswer(index: number): void {
    if (this.state !== 'PLAYING') return
    this.timerStarted = false

    this.selectedIndex = index
    const q = this.questions[this.questionIndex]
    this.isCorrect = index === q.correctIndex

    if (this.isCorrect) {
      const timeBonus = Math.floor((this.timeLeft / TIME_LIMIT) * MAX_TIME_BONUS)
      const streakMultiplier = Math.min(1 + this.streak * 0.25, 3) // max 3x
      this.score += Math.round((BASE_POINTS + timeBonus) * streakMultiplier)
      this.streak += 1
      this.correct += 1
      if (this.streak > this.bestStreak) {
        this.bestStreak = this.streak
      }
    } else {
      this.streak = 0
    }

    this.state = 'ANSWERED'
  }

  /** Advance to the next question or end the round */
  nextQuestion(): void {
    if (this.state !== 'ANSWERED') return

    this.questionIndex += 1
    this.selectedIndex = null
    this.isCorrect = null
    this.timeLeft = TIME_LIMIT

    if (this.questionIndex >= this.questions.length) {
      this.state = 'GAME_OVER'
    } else {
      this.timerStarted = true
      this.state = 'PLAYING'
    }
  }

  getState(): GameState {
    return this.state
  }

  getScore(): number {
    return this.score
  }

  getSnapshot(): GameSnapshot {
    const q = this.questions[this.questionIndex] ?? null
    return {
      state: this.state,
      question: q,
      questionIndex: this.questionIndex,
      totalQuestions: QUESTIONS_PER_ROUND,
      selectedIndex: this.selectedIndex,
      isCorrect: this.isCorrect,
      score: this.score,
      streak: this.streak,
      bestStreak: this.bestStreak,
      timeLeft: this.timeLeft,
      timerPct: (this.timeLeft / TIME_LIMIT) * 100,
      stats: {
        correct: this.correct,
        total: Math.min(this.questionIndex + (this.state === 'GAME_OVER' ? 0 : 1), QUESTIONS_PER_ROUND),
        bestStreak: this.bestStreak,
        score: this.score,
      },
    }
  }
}
