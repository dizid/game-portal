// Whack-a-Mole — pure game logic

export type MoleType = 'normal' | 'golden' | 'bomb'
export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

export interface Mole {
  holeIndex: number   // 0–8
  type: MoleType
  /** Timestamp (ms) when this mole should disappear if not whacked */
  expiresAt: number
}

export interface WhackResult {
  points: number
  moleType: MoleType
}

export interface WamGame {
  state: GameState
  score: number
  timeLeft: number    // seconds remaining
  activeMoles: Mole[]
  /** Seconds elapsed since start, used to compute difficulty */
  elapsed: number
}

const GAME_DURATION = 60  // seconds

/** How many ms a mole stays up (decreases over time) */
function moleLifeMs(elapsed: number): number {
  // Starts at 1500ms, drops to 600ms by 30s
  return Math.max(600, 1500 - elapsed * 30)
}

/** Max moles up at once (grows over time) */
function maxMoles(elapsed: number): number {
  if (elapsed < 15) return 1
  if (elapsed < 30) return 2
  return 3
}

export function createGame(): WamGame {
  return {
    state: 'READY',
    score: 0,
    timeLeft: GAME_DURATION,
    activeMoles: [],
    elapsed: 0,
  }
}

export function startGame(): WamGame {
  return {
    state: 'PLAYING',
    score: 0,
    timeLeft: GAME_DURATION,
    activeMoles: [],
    elapsed: 0,
  }
}

/**
 * Tick — called every 100ms.
 * Returns the updated game state + any newly spawned mole (or null).
 */
export function tick(
  game: WamGame,
  nowMs: number,
): { updated: WamGame; spawned: Mole | null } {
  if (game.state !== 'PLAYING') return { updated: game, spawned: null }

  // Remove expired moles
  const activeMoles = game.activeMoles.filter((m) => m.expiresAt > nowMs)

  // Try to spawn a new mole if below cap
  let spawned: Mole | null = null
  const cap = maxMoles(game.elapsed)

  if (activeMoles.length < cap && Math.random() < 0.35) {
    // Pick a hole not already occupied
    const occupied = new Set(activeMoles.map((m) => m.holeIndex))
    const available: number[] = []
    for (let i = 0; i < 9; i++) {
      if (!occupied.has(i)) available.push(i)
    }

    if (available.length > 0) {
      const hole = available[Math.floor(Math.random() * available.length)]
      // Probabilities: 15% golden, 10% bomb, 75% normal
      const roll = Math.random()
      const type: MoleType = roll < 0.10 ? 'bomb' : roll < 0.25 ? 'golden' : 'normal'
      spawned = {
        holeIndex: hole,
        type,
        expiresAt: nowMs + moleLifeMs(game.elapsed),
      }
      activeMoles.push(spawned)
    }
  }

  return { updated: { ...game, activeMoles }, spawned }
}

/** Player whacks a hole. Returns null if no mole there. */
export function whack(
  game: WamGame,
  holeIndex: number,
): { updated: WamGame; result: WhackResult | null } {
  const mole = game.activeMoles.find((m) => m.holeIndex === holeIndex)
  if (!mole) return { updated: game, result: null }

  const points = mole.type === 'golden' ? 50 : mole.type === 'bomb' ? -30 : 10
  const activeMoles = game.activeMoles.filter((m) => m.holeIndex !== holeIndex)
  const score = Math.max(0, game.score + points)

  return {
    updated: { ...game, score, activeMoles },
    result: { points, moleType: mole.type },
  }
}

/** Decrement timer by 1 second. Returns updated game (GAME_OVER if time hits 0). */
export function decrementTimer(game: WamGame): WamGame {
  if (game.state !== 'PLAYING') return game
  const timeLeft = game.timeLeft - 1
  const elapsed  = game.elapsed + 1
  if (timeLeft <= 0) {
    return { ...game, timeLeft: 0, elapsed, activeMoles: [], state: 'GAME_OVER' }
  }
  return { ...game, timeLeft, elapsed }
}
