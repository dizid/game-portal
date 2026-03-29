// Memory Match — pure game logic

export type CardState = 'hidden' | 'flipped' | 'matched'
export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

export interface Card {
  id: number       // unique index (0–15)
  pairId: number   // 0–7, two cards share a pairId
  emoji: string
  state: CardState
}

export interface MemoryGame {
  cards: Card[]
  moves: number
  pairs: number
  state: GameState
  elapsedSeconds: number
  score: number
}

const EMOJIS = ['🎮', '🎯', '🎲', '🎪', '🎨', '🎭', '🎵', '🎬']

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function createGame(): MemoryGame {
  const pairs = EMOJIS.flatMap((emoji, pairId) => [
    { id: pairId * 2,     pairId, emoji, state: 'hidden' as CardState },
    { id: pairId * 2 + 1, pairId, emoji, state: 'hidden' as CardState },
  ])
  return {
    cards: shuffle(pairs),
    moves: 0,
    pairs: 0,
    state: 'READY',
    elapsedSeconds: 0,
    score: 0,
  }
}

export function startGame(game: MemoryGame): MemoryGame {
  return { ...createGame(), state: 'PLAYING' }
}

/** Returns the pair of cards currently flipped (not yet matched). */
export function getFlippedCards(game: MemoryGame): Card[] {
  return game.cards.filter((c) => c.state === 'flipped')
}

/**
 * Flip a card. Returns:
 * - { updated: MemoryGame, matched: boolean, lockInput: boolean }
 * lockInput = true when two cards are up but don't match (caller should
 * unflip them after 800ms).
 */
export function flipCard(
  game: MemoryGame,
  cardId: number,
): { updated: MemoryGame; matched: boolean; lockInput: boolean } {
  const card = game.cards.find((c) => c.id === cardId)
  if (!card || card.state !== 'hidden') {
    return { updated: game, matched: false, lockInput: false }
  }

  const flipped = getFlippedCards(game)
  // Only allow flipping if 0 or 1 cards are currently flipped
  if (flipped.length >= 2) {
    return { updated: game, matched: false, lockInput: false }
  }

  // Flip the card
  let cards = game.cards.map((c) =>
    c.id === cardId ? { ...c, state: 'flipped' as CardState } : c,
  )

  let matched = false
  let lockInput = false
  let pairs = game.pairs
  let moves = game.moves

  const nowFlipped = cards.filter((c) => c.state === 'flipped')

  if (nowFlipped.length === 2) {
    moves++
    if (nowFlipped[0].pairId === nowFlipped[1].pairId) {
      // Match!
      matched = true
      pairs++
      cards = cards.map((c) =>
        c.state === 'flipped' ? { ...c, state: 'matched' as CardState } : c,
      )
    } else {
      // No match — caller must call unflipCards() after delay
      lockInput = true
    }
  }

  const allMatched = pairs === 8
  const state: GameState = allMatched ? 'GAME_OVER' : game.state

  // Score: each match = 100 pts, bonus for fewer moves
  const score = allMatched ? Math.max(100, 800 - moves * 10 + Math.max(0, 300 - game.elapsedSeconds * 2)) : game.score

  return {
    updated: { ...game, cards, moves, pairs, state, score },
    matched,
    lockInput,
  }
}

export function unflipCards(game: MemoryGame): MemoryGame {
  const cards = game.cards.map((c) =>
    c.state === 'flipped' ? { ...c, state: 'hidden' as CardState } : c,
  )
  return { ...game, cards }
}

export function tickTimer(game: MemoryGame): MemoryGame {
  if (game.state !== 'PLAYING') return game
  return { ...game, elapsedSeconds: game.elapsedSeconds + 1 }
}
