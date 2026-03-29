// Klondike Solitaire game logic — pure state machine, no DOM/canvas

import { Card, Suit, SUITS, isRed, buildDeck } from './cards.js'

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER' | 'WON'

// Selection identifies the source pile and card index within it
export interface Selection {
  source: PileId
  cardIndex: number   // index in the pile array
}

// Pile identifiers
export type PileId =
  | 'stock'
  | 'waste'
  | { foundation: 0 | 1 | 2 | 3 }
  | { tableau: 0 | 1 | 2 | 3 | 4 | 5 | 6 }

export interface GameSnapshot {
  state: GameState
  stock: Card[]
  waste: Card[]
  foundations: [Card[], Card[], Card[], Card[]]
  tableau: [Card[], Card[], Card[], Card[], Card[], Card[], Card[]]
  selection: Selection | null
  score: number
  moves: number
  elapsedSec: number
}

const POINTS_FOUNDATION = 10
const POINTS_TABLEAU_REVEAL = 5

export class SolitaireGame {
  private state: GameState = 'READY'
  private stock: Card[] = []
  private waste: Card[] = []
  private foundations: [Card[], Card[], Card[], Card[]] = [[], [], [], []]
  private tableau: [Card[], Card[], Card[], Card[], Card[], Card[], Card[]] = [
    [], [], [], [], [], [], [],
  ]
  private selection: Selection | null = null
  private score: number = 0
  private moves: number = 0
  private startTime: number = 0
  private elapsedSec: number = 0
  private timerHandle: ReturnType<typeof setInterval> | null = null

  // ── Setup ──────────────────────────────────────────────────────────────────

  deal(): void {
    const deck = buildDeck()
    this.stock = []
    this.waste = []
    this.foundations = [[], [], [], []]
    this.tableau = [[], [], [], [], [], [], []]
    this.selection = null
    this.score = 0
    this.moves = 0
    this.elapsedSec = 0

    // Deal tableau: column i gets i+1 cards, last card face-up
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = deck.pop()!
        card.faceUp = row === col
        this.tableau[col].push(card)
      }
    }

    // Remaining cards go to stock, face-down
    this.stock = deck.reverse()

    this.state = 'PLAYING'
    this.startTimer()
  }

  private startTimer(): void {
    this.startTime = Date.now()
    this.timerHandle = setInterval(() => {
      this.elapsedSec = Math.floor((Date.now() - this.startTime) / 1000)
    }, 500)
  }

  private stopTimer(): void {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle)
      this.timerHandle = null
    }
  }

  // ── Move validation ────────────────────────────────────────────────────────

  private canPlaceOnFoundation(card: Card, foundation: Card[]): boolean {
    if (foundation.length === 0) return card.rank === 1
    const top = foundation[foundation.length - 1]
    return top.suit === card.suit && card.rank === top.rank + 1
  }

  private canPlaceOnTableau(card: Card, column: Card[]): boolean {
    if (column.length === 0) return card.rank === 13  // King on empty
    const top = column[column.length - 1]
    if (!top.faceUp) return false
    // Alternating colors, descending rank
    return isRed(card.suit) !== isRed(top.suit) && card.rank === top.rank - 1
  }

  // ── Stock / Waste ──────────────────────────────────────────────────────────

  drawFromStock(): void {
    if (this.state !== 'PLAYING') return
    this.selection = null

    if (this.stock.length > 0) {
      const card = this.stock.pop()!
      card.faceUp = true
      this.waste.push(card)
      this.moves++
    } else {
      // Reset stock from waste
      this.stock = this.waste.reverse().map((c) => ({ ...c, faceUp: false }))
      this.waste = []
      this.moves++
    }
  }

  // ── Selection & placement ──────────────────────────────────────────────────

  /** Select a card. Returns true if selection changed. */
  select(source: PileId, cardIndex: number): boolean {
    if (this.state !== 'PLAYING') return false

    const cards = this.getPileCards(source)
    if (!cards || cardIndex < 0 || cardIndex >= cards.length) return false
    const card = cards[cardIndex]
    if (!card.faceUp) return false

    // Clicking same selection deselects
    if (
      this.selection &&
      pilesEqual(this.selection.source, source) &&
      this.selection.cardIndex === cardIndex
    ) {
      this.selection = null
      return true
    }

    this.selection = { source, cardIndex }
    return true
  }

  /** Attempt to move the current selection to a destination pile.
   *  Returns true if the move succeeded. */
  moveTo(dest: PileId): boolean {
    if (!this.selection || this.state !== 'PLAYING') return false

    const srcCards = this.getPileCards(this.selection.source)
    if (!srcCards) return false

    // Cards being moved = from cardIndex to end of pile
    const moving = srcCards.slice(this.selection.cardIndex)
    if (moving.length === 0) return false

    // Only single-card moves to foundation
    if (dest === 'stock') return false
    if (dest === 'waste') return false

    if (typeof dest === 'object' && 'foundation' in dest) {
      if (moving.length !== 1) return false
      const fnd = this.foundations[dest.foundation]
      if (!this.canPlaceOnFoundation(moving[0], fnd)) return false
      this.executeMove(this.selection.source, dest, moving)
      this.score += POINTS_FOUNDATION
      this.moves++
      this.selection = null
      this.checkWin()
      return true
    }

    if (typeof dest === 'object' && 'tableau' in dest) {
      const col = this.tableau[dest.tableau]
      if (!this.canPlaceOnTableau(moving[0], col)) return false
      this.executeMove(this.selection.source, dest, moving)
      this.moves++
      this.selection = null
      return true
    }

    return false
  }

  private executeMove(src: PileId, dest: PileId, moving: Card[]): void {
    const srcPile = this.getMutablePile(src)
    const destPile = this.getMutablePile(dest)
    if (!srcPile || !destPile) return

    // Remove cards from source
    srcPile.splice(srcPile.length - moving.length, moving.length)

    // Flip the new top card of source tableau column
    if (typeof src === 'object' && 'tableau' in src) {
      const newTop = srcPile[srcPile.length - 1]
      if (newTop && !newTop.faceUp) {
        newTop.faceUp = true
        this.score += POINTS_TABLEAU_REVEAL
      }
    }

    // Add to destination
    for (const card of moving) {
      destPile.push({ ...card, faceUp: true })
    }
  }

  /** Auto-move the top waste or tableau card to a foundation if valid. */
  autoFoundation(source: PileId): boolean {
    if (this.state !== 'PLAYING') return false
    const pile = this.getPileCards(source)
    if (!pile || pile.length === 0) return false
    const card = pile[pile.length - 1]
    if (!card.faceUp) return false

    for (let i = 0; i < 4; i++) {
      if (this.canPlaceOnFoundation(card, this.foundations[i])) {
        this.selection = { source, cardIndex: pile.length - 1 }
        const moved = this.moveTo({ foundation: i as 0 | 1 | 2 | 3 })
        if (moved) return true
      }
    }
    return false
  }

  private checkWin(): void {
    const won = this.foundations.every((f) => f.length === 13)
    if (won) {
      this.state = 'WON'
      this.stopTimer()
    }
  }

  // ── Pile accessors ─────────────────────────────────────────────────────────

  private getPileCards(id: PileId): Card[] | null {
    if (id === 'stock') return this.stock
    if (id === 'waste') return this.waste
    if (typeof id === 'object' && 'foundation' in id) return this.foundations[id.foundation]
    if (typeof id === 'object' && 'tableau' in id) return this.tableau[id.tableau]
    return null
  }

  private getMutablePile(id: PileId): Card[] | null {
    return this.getPileCards(id)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  reset(): void {
    this.stopTimer()
    this.state = 'READY'
    this.selection = null
  }

  getScore(): number {
    return this.score
  }

  getState(): GameState {
    return this.state
  }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      stock: this.stock.map((c) => ({ ...c })),
      waste: this.waste.map((c) => ({ ...c })),
      foundations: this.foundations.map((f) => f.map((c) => ({ ...c }))) as [Card[], Card[], Card[], Card[]],
      tableau: this.tableau.map((col) => col.map((c) => ({ ...c }))) as [Card[], Card[], Card[], Card[], Card[], Card[], Card[]],
      selection: this.selection ? { ...this.selection } : null,
      score: this.score,
      moves: this.moves,
      elapsedSec: this.elapsedSec,
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pilesEqual(a: PileId, b: PileId): boolean {
  if (a === b) return true
  if (typeof a === 'object' && typeof b === 'object') {
    if ('foundation' in a && 'foundation' in b) return a.foundation === b.foundation
    if ('tableau' in a && 'tableau' in b) return a.tableau === b.tableau
  }
  return false
}

// Re-export for use in renderer
export { SUITS }
export type { Suit }
