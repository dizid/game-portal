// Blackjack core logic — pure state machine, no DOM

export type Suit = '♠' | '♥' | '♦' | '♣'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  rank: Rank
  suit: Suit
  faceDown: boolean
}

export type GameState = 'READY' | 'BETTING' | 'PLAYING' | 'DEALER_TURN' | 'ROUND_OVER' | 'GAME_OVER'
export type RoundResult = 'player_blackjack' | 'player_bust' | 'dealer_bust' | 'player_wins' | 'dealer_wins' | 'push' | null

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS: Suit[] = ['♠', '♥', '♦', '♣']

// Build a standard 52-card deck
function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, faceDown: false })
    }
  }
  return deck
}

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Calculate the best hand value (Aces count as 11 then fold to 1)
export function handValue(cards: Card[]): number {
  const faceUp = cards.filter((c) => !c.faceDown)
  let total = 0
  let aces = 0

  for (const card of faceUp) {
    if (card.rank === 'A') {
      aces += 1
      total += 11
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      total += 10
    } else {
      total += parseInt(card.rank, 10)
    }
  }

  // Reduce aces from 11 → 1 to avoid busting
  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }

  return total
}

export interface GameSnapshot {
  state: GameState
  chips: number
  bet: number
  playerHand: Card[]
  dealerHand: Card[]
  playerValue: number
  dealerValue: number
  dealerFullValue: number  // full value even while dealer card is face-down (for reveal)
  roundResult: RoundResult
  canDouble: boolean
}

const STARTING_CHIPS = 1000

export class BlackjackGame {
  private deck: Card[] = []
  private playerHand: Card[] = []
  private dealerHand: Card[] = []
  private chips: number = STARTING_CHIPS
  private bet: number = 0
  private state: GameState = 'READY'
  private roundResult: RoundResult = null

  constructor() {
    this.resetDeck()
  }

  private resetDeck(): void {
    // Use 6 decks like a casino shoe — reshuffle when fewer than 52 cards remain
    const shoe: Card[] = []
    for (let i = 0; i < 6; i++) {
      shoe.push(...buildDeck())
    }
    this.deck = shuffle(shoe)
  }

  private dealCard(faceDown = false): Card {
    if (this.deck.length < 52) {
      this.resetDeck()
    }
    const card = this.deck.pop()!
    return { ...card, faceDown }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Move from READY to BETTING state */
  startSession(): void {
    if (this.state === 'READY') {
      this.state = 'BETTING'
    }
  }

  /** Add chips to the current bet (capped at available chips) */
  addBet(amount: number): void {
    if (this.state !== 'BETTING') return
    const maxAdd = this.chips - this.bet
    this.bet = Math.min(this.chips, this.bet + amount)
    void maxAdd // suppress unused warning
  }

  /** Clear the current bet back to zero */
  clearBet(): void {
    if (this.state !== 'BETTING') return
    this.bet = 0
  }

  /** Deal the opening hand — requires at least bet=1 */
  deal(): void {
    if (this.state !== 'BETTING' || this.bet === 0) return

    this.playerHand = [this.dealCard(), this.dealCard()]
    this.dealerHand = [this.dealCard(), this.dealCard(true)] // second dealer card face-down

    this.roundResult = null

    // Check for immediate blackjack
    const playerBJ = this.isBlackjack(this.playerHand)
    const dealerBJ = this.isBlackjackFull(this.dealerHand)

    if (playerBJ || dealerBJ) {
      // Reveal dealer hole card
      this.dealerHand[1].faceDown = false
      if (playerBJ && dealerBJ) {
        this.roundResult = 'push'
      } else if (playerBJ) {
        this.roundResult = 'player_blackjack'
      } else {
        this.roundResult = 'dealer_wins'
      }
      this.settleRound()
      return
    }

    this.state = 'PLAYING'
  }

  private isBlackjack(hand: Card[]): boolean {
    return hand.length === 2 && handValue(hand) === 21
  }

  private isBlackjackFull(hand: Card[]): boolean {
    // Check including face-down card
    const allUp = hand.map((c) => ({ ...c, faceDown: false }))
    return allUp.length === 2 && handValue(allUp) === 21
  }

  hit(): void {
    if (this.state !== 'PLAYING') return
    this.playerHand.push(this.dealCard())

    if (handValue(this.playerHand) > 21) {
      this.roundResult = 'player_bust'
      this.dealerHand[1].faceDown = false
      this.settleRound()
    }
  }

  stand(): void {
    if (this.state !== 'PLAYING') return
    this.state = 'DEALER_TURN'
    this.runDealer()
  }

  doubleDown(): void {
    if (this.state !== 'PLAYING') return
    if (this.playerHand.length !== 2) return
    if (this.bet > this.chips - this.bet) return // not enough chips

    this.bet *= 2
    this.playerHand.push(this.dealCard())

    if (handValue(this.playerHand) > 21) {
      this.roundResult = 'player_bust'
      this.dealerHand[1].faceDown = false
      this.settleRound()
    } else {
      this.state = 'DEALER_TURN'
      this.runDealer()
    }
  }

  /** Dealer AI: hit on ≤16, stand on ≥17 */
  private runDealer(): void {
    // Reveal hole card
    this.dealerHand[1].faceDown = false

    while (handValue(this.dealerHand) <= 16) {
      this.dealerHand.push(this.dealCard())
    }

    const pv = handValue(this.playerHand)
    const dv = handValue(this.dealerHand)

    if (dv > 21) {
      this.roundResult = 'dealer_bust'
    } else if (pv > dv) {
      this.roundResult = 'player_wins'
    } else if (dv > pv) {
      this.roundResult = 'dealer_wins'
    } else {
      this.roundResult = 'push'
    }

    this.settleRound()
  }

  private settleRound(): void {
    switch (this.roundResult) {
      case 'player_blackjack':
        // Blackjack pays 3:2
        this.chips += Math.floor(this.bet * 1.5)
        break
      case 'player_wins':
      case 'dealer_bust':
        this.chips += this.bet
        break
      case 'player_bust':
      case 'dealer_wins':
        this.chips -= this.bet
        break
      case 'push':
        // No change
        break
    }

    this.state = this.chips <= 0 ? 'GAME_OVER' : 'ROUND_OVER'
  }

  /** Start the next round — reset bet and hands */
  nextRound(): void {
    if (this.state !== 'ROUND_OVER') return
    this.bet = 0
    this.playerHand = []
    this.dealerHand = []
    this.roundResult = null
    this.state = 'BETTING'
  }

  /** Reset everything back to READY */
  reset(): void {
    this.chips = STARTING_CHIPS
    this.bet = 0
    this.playerHand = []
    this.dealerHand = []
    this.roundResult = null
    this.state = 'READY'
    this.resetDeck()
  }

  getState(): GameState {
    return this.state
  }

  getChips(): number {
    return this.chips
  }

  getSnapshot(): GameSnapshot {
    const dealerFaceUpHand = this.dealerHand
    const dealerFullHand = this.dealerHand.map((c) => ({ ...c, faceDown: false }))

    return {
      state: this.state,
      chips: this.chips,
      bet: this.bet,
      playerHand: this.playerHand.map((c) => ({ ...c })),
      dealerHand: dealerFaceUpHand.map((c) => ({ ...c })),
      playerValue: handValue(this.playerHand),
      dealerValue: handValue(dealerFaceUpHand),
      dealerFullValue: handValue(dealerFullHand),
      roundResult: this.roundResult,
      canDouble: this.playerHand.length === 2 && this.bet <= this.chips - this.bet,
    }
  }
}
