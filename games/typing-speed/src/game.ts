// Typing Speed game logic — pure state machine, no DOM

import { pickPassage } from './passages.js'

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

export interface CharState {
  char: string
  status: 'idle' | 'correct' | 'wrong'
}

export interface GameSnapshot {
  state: GameState
  passage: string
  charStates: CharState[]
  cursorIndex: number
  typed: string
  wpm: number
  accuracy: number
  score: number
  timeLeft: number
  totalTime: number
  progress: number   // 0–1 fraction of passage complete
}

const TOTAL_TIME_SEC = 60

export class TypingGame {
  private state: GameState = 'READY'
  private passage: string = ''
  private typed: string = ''
  private startTime: number = 0
  private timeLeft: number = TOTAL_TIME_SEC
  private timerHandle: ReturnType<typeof setInterval> | null = null
  private onTimeUp: (() => void) | null = null

  // Running counts for accuracy
  private totalKeystrokes: number = 0
  private correctKeystrokes: number = 0

  constructor() {
    this.passage = pickPassage()
  }

  // ── Timer ─────────────────────────────────────────────────────────────────────

  private startTimer(): void {
    this.startTime = Date.now()
    this.timerHandle = setInterval(() => {
      const elapsed = (Date.now() - this.startTime) / 1000
      this.timeLeft = Math.max(0, TOTAL_TIME_SEC - elapsed)
      if (this.timeLeft <= 0) {
        this.stopTimer()
        this.state = 'GAME_OVER'
        this.onTimeUp?.()
      }
    }, 100)
  }

  private stopTimer(): void {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle)
      this.timerHandle = null
    }
  }

  // ── Stats calculation ─────────────────────────────────────────────────────────

  private calcWPM(): number {
    if (this.state === 'READY') return 0
    const elapsedMin = (TOTAL_TIME_SEC - this.timeLeft) / 60
    if (elapsedMin < 0.001) return 0
    // Standard word = 5 characters
    const correctChars = this.getCorrectChars()
    return Math.round(correctChars / 5 / elapsedMin)
  }

  private getCorrectChars(): number {
    let count = 0
    for (let i = 0; i < this.typed.length && i < this.passage.length; i++) {
      if (this.typed[i] === this.passage[i]) count++
    }
    return count
  }

  private calcAccuracy(): number {
    if (this.totalKeystrokes === 0) return 100
    return Math.round((this.correctKeystrokes / this.totalKeystrokes) * 100)
  }

  private calcScore(): number {
    const wpm = this.calcWPM()
    const acc = this.calcAccuracy() / 100
    return Math.round(wpm * acc)
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  setOnTimeUp(cb: () => void): void {
    this.onTimeUp = cb
  }

  /** Called on first keystroke — starts the timer and transitions to PLAYING. */
  startIfReady(): void {
    if (this.state === 'READY') {
      this.state = 'PLAYING'
      this.startTimer()
    }
  }

  /** Process a full input value string (value of the <input> element). */
  processInput(value: string): 'continue' | 'passage_complete' {
    if (this.state !== 'PLAYING') return 'continue'

    // Count keystrokes for accuracy
    const prevLen = this.typed.length
    const newLen  = value.length

    if (newLen > prevLen) {
      // Characters were added
      for (let i = prevLen; i < newLen && i < this.passage.length; i++) {
        this.totalKeystrokes++
        if (value[i] === this.passage[i]) {
          this.correctKeystrokes++
        }
      }
    }

    this.typed = value.slice(0, this.passage.length)

    // Check passage complete
    if (this.typed.length === this.passage.length) {
      const allCorrect = [...this.typed].every((ch, i) => ch === this.passage[i])
      if (allCorrect) {
        this.stopTimer()
        this.state = 'GAME_OVER'
        return 'passage_complete'
      }
    }

    return 'continue'
  }

  reset(): void {
    this.stopTimer()
    this.state = 'READY'
    this.passage = pickPassage(this.passage)
    this.typed = ''
    this.timeLeft = TOTAL_TIME_SEC
    this.totalKeystrokes = 0
    this.correctKeystrokes = 0
  }

  getSnapshot(): GameSnapshot {
    const charStates: CharState[] = []
    for (let i = 0; i < this.passage.length; i++) {
      if (i < this.typed.length) {
        charStates.push({
          char: this.passage[i],
          status: this.typed[i] === this.passage[i] ? 'correct' : 'wrong',
        })
      } else {
        charStates.push({ char: this.passage[i], status: 'idle' })
      }
    }

    return {
      state: this.state,
      passage: this.passage,
      charStates,
      cursorIndex: Math.min(this.typed.length, this.passage.length),
      typed: this.typed,
      wpm: this.calcWPM(),
      accuracy: this.calcAccuracy(),
      score: this.calcScore(),
      timeLeft: this.timeLeft,
      totalTime: TOTAL_TIME_SEC,
      progress: Math.min(1, this.typed.length / this.passage.length),
    }
  }

  getState(): GameState {
    return this.state
  }

  getScore(): number {
    return this.calcScore()
  }
}
