// Reaction Timer — pure game logic

export type RoundState = 'WAITING' | 'READY' | 'RESULT' | 'EARLY'
export type GameState = 'READY' | 'PLAYING' | 'DONE'

export interface RoundResult {
  ms: number
  grade: 'fast' | 'ok' | 'slow'
}

export interface ReactionGame {
  state: GameState
  roundState: RoundState
  currentRound: number   // 1-based
  totalRounds: number
  results: RoundResult[]
  /** ms timestamp when screen turned green (for reaction calc) */
  greenAt: number | null
  /** ms timestamp when we started waiting (random delay pending) */
  waitStartedAt: number | null
  /** random delay duration in ms before turning green */
  delayMs: number
  /** Final score: inverse of average ms, scaled to 0–1000 */
  finalScore: number
}

const TOTAL_ROUNDS = 5
const MIN_DELAY_MS = 2000
const MAX_DELAY_MS = 5000

function randomDelay(): number {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
}

function gradeMs(ms: number): 'fast' | 'ok' | 'slow' {
  if (ms < 250) return 'fast'
  if (ms < 400) return 'ok'
  return 'slow'
}

function calcScore(results: RoundResult[]): number {
  if (results.length === 0) return 0
  const avg = results.reduce((s, r) => s + r.ms, 0) / results.length
  // Score: 1000 if avg = 150ms, 0 if avg >= 800ms
  return Math.max(0, Math.round(1000 * (1 - (avg - 150) / 650)))
}

export function createGame(): ReactionGame {
  return {
    state: 'READY',
    roundState: 'WAITING',
    currentRound: 0,
    totalRounds: TOTAL_ROUNDS,
    results: [],
    greenAt: null,
    waitStartedAt: null,
    delayMs: randomDelay(),
    finalScore: 0,
  }
}

/** Start the game (first round). */
export function beginGame(): ReactionGame {
  return {
    state: 'PLAYING',
    roundState: 'WAITING',
    currentRound: 1,
    totalRounds: TOTAL_ROUNDS,
    results: [],
    greenAt: null,
    waitStartedAt: Date.now(),
    delayMs: randomDelay(),
    finalScore: 0,
  }
}

/** Call when delay expires — screen turns green. */
export function turnGreen(game: ReactionGame, nowMs: number): ReactionGame {
  if (game.roundState !== 'WAITING') return game
  return { ...game, roundState: 'READY', greenAt: nowMs }
}

/** Player taps. */
export function playerTap(game: ReactionGame, nowMs: number): {
  updated: ReactionGame
  result: RoundResult | null
  early: boolean
} {
  if (game.state !== 'PLAYING') return { updated: game, result: null, early: false }

  if (game.roundState === 'WAITING') {
    // Too early
    const updated: ReactionGame = {
      ...game,
      roundState: 'EARLY',
    }
    return { updated, result: null, early: true }
  }

  if (game.roundState === 'READY' && game.greenAt !== null) {
    const ms = nowMs - game.greenAt
    const grade = gradeMs(ms)
    const result: RoundResult = { ms, grade }
    const results = [...game.results, result]

    const done = results.length >= TOTAL_ROUNDS
    const finalScore = done ? calcScore(results) : 0

    const updated: ReactionGame = {
      ...game,
      roundState: 'RESULT',
      results,
      state: done ? 'DONE' : 'PLAYING',
      finalScore,
      currentRound: done ? game.currentRound : game.currentRound + 1,
    }
    return { updated, result, early: false }
  }

  // RESULT or EARLY state — tap advances to next round
  if (game.roundState === 'RESULT' || game.roundState === 'EARLY') {
    if (game.state === 'DONE') return { updated: game, result: null, early: false }
    const updated: ReactionGame = {
      ...game,
      roundState: 'WAITING',
      greenAt: null,
      waitStartedAt: nowMs,
      delayMs: randomDelay(),
    }
    return { updated, result: null, early: false }
  }

  return { updated: game, result: null, early: false }
}

export function getAvgMs(game: ReactionGame): number {
  if (game.results.length === 0) return 0
  return Math.round(game.results.reduce((s, r) => s + r.ms, 0) / game.results.length)
}
