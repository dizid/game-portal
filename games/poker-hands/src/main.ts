// Poker Hands — 5-card draw poker hand evaluator game

import { gameSDK } from '@game-portal/game-sdk'
import { audio } from './audio.js'

// ── Types ─────────────────────────────────────────────────────────────────────

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14

interface Card {
  rank: Rank
  suit: Suit
}

interface HandResult {
  name: string
  points: number
  bestIndices: number[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RANK_NAMES: Record<Rank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660',
}

const RED_SUITS = new Set<Suit>(['hearts', 'diamonds'])
const TOTAL_ROUNDS = 10

// ── Deck helpers ──────────────────────────────────────────────────────────────

function buildDeck(): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
  const ranks: Rank[] = [2,3,4,5,6,7,8,9,10,11,12,13,14]
  const deck: Card[] = []
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit })
    }
  }
  return deck
}

function shuffle(deck: Card[]): Card[] {
  const d = [...deck]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

// ── Hand evaluation ───────────────────────────────────────────────────────────

function evaluateHand(hand: Card[]): HandResult {
  const ranks = hand.map(c => c.rank).sort((a, b) => a - b)
  const suits = hand.map(c => c.suit)

  const rankCounts = new Map<Rank, number>()
  for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1)

  const counts = [...rankCounts.values()].sort((a, b) => b - a)
  const isFlush = suits.every(s => s === suits[0])
  const isStraight = ranks[4] - ranks[0] === 4 && rankCounts.size === 5
  const isAceLowStraight = ranks[4] === 14 && ranks[0] === 2 && ranks[1] === 3 && ranks[2] === 4 && ranks[3] === 5

  const indicesWithCount = (count: number): number[] => {
    const targetRanks = [...rankCounts.entries()]
      .filter(([, c]) => c === count)
      .map(([r]) => r)
    return hand.map((c, i) => (targetRanks.includes(c.rank) ? i : -1)).filter(i => i !== -1)
  }

  const allIndices = [0, 1, 2, 3, 4]

  if (isFlush && isStraight && ranks[0] === 10) return { name: 'Royal Flush', points: 2000, bestIndices: allIndices }
  if (isFlush && (isStraight || isAceLowStraight)) return { name: 'Straight Flush', points: 1000, bestIndices: allIndices }
  if (counts[0] === 4) return { name: 'Four of a Kind', points: 800, bestIndices: indicesWithCount(4) }
  if (counts[0] === 3 && counts[1] === 2) return { name: 'Full House', points: 600, bestIndices: allIndices }
  if (isFlush) return { name: 'Flush', points: 500, bestIndices: allIndices }
  if (isStraight || isAceLowStraight) return { name: 'Straight', points: 400, bestIndices: allIndices }
  if (counts[0] === 3) return { name: 'Three of a Kind', points: 300, bestIndices: indicesWithCount(3) }
  if (counts[0] === 2 && counts[1] === 2) return { name: 'Two Pair', points: 200, bestIndices: indicesWithCount(2) }
  if (counts[0] === 2) return { name: 'Pair', points: 100, bestIndices: indicesWithCount(2) }
  return { name: 'High Card', points: 0, bestIndices: [] }
}

// ── Game State ────────────────────────────────────────────────────────────────

interface GameState {
  deck: Card[]
  hand: Card[]
  selected: Set<number>
  drawnThisRound: boolean
  round: number
  totalScore: number
  bestScore: number
  phase: 'deal' | 'draw' | 'result' | 'end'
}

const state: GameState = {
  deck: [],
  hand: [],
  selected: new Set(),
  drawnThisRound: false,
  round: 1,
  totalScore: 0,
  bestScore: 0,
  phase: 'deal',
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const cardTable = document.getElementById('card-table') as HTMLDivElement
const handNameEl = document.getElementById('hand-name') as HTMLDivElement
const messageEl = document.getElementById('message') as HTMLDivElement
const roundDisplay = document.getElementById('round-display') as HTMLSpanElement
const scoreDisplay = document.getElementById('score-display') as HTMLSpanElement
const bestDisplay = document.getElementById('best-display') as HTMLSpanElement
const btnDraw = document.getElementById('btn-draw') as HTMLButtonElement
const btnNext = document.getElementById('btn-next') as HTMLButtonElement
const endScreen = document.getElementById('end-screen') as HTMLDivElement
const finalScoreEl = document.getElementById('final-score') as HTMLDivElement
const finalBestLabel = document.getElementById('final-best-label') as HTMLDivElement
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Card DOM builder ──────────────────────────────────────────────────────────

function buildCardEl(card: Card, index: number, highlighted: boolean, selected: boolean): HTMLDivElement {
  const div = document.createElement('div')
  div.className = `card ${RED_SUITS.has(card.suit) ? 'red' : 'black'}`
  if (selected) div.classList.add('selected')
  if (highlighted) div.classList.add('highlight')

  const rankStr = RANK_NAMES[card.rank]
  const suitStr = SUIT_SYMBOLS[card.suit]

  // Top label: rank + suit
  const top = document.createElement('div')
  top.className = 'rank-top'
  top.textContent = `${rankStr} ${suitStr}`

  // Center suit
  const center = document.createElement('div')
  center.className = 'suit-center'
  center.textContent = suitStr

  // Bottom label (rotated via CSS)
  const bottom = document.createElement('div')
  bottom.className = 'rank-bottom'
  bottom.textContent = `${rankStr} ${suitStr}`

  div.appendChild(top)
  div.appendChild(center)
  div.appendChild(bottom)

  if (!state.drawnThisRound) {
    div.addEventListener('click', () => toggleCard(index))
  }

  return div
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderCards(highlightIndices: number[] = []): void {
  cardTable.textContent = ''
  for (let i = 0; i < state.hand.length; i++) {
    const card = state.hand[i]
    cardTable.appendChild(buildCardEl(card, i, highlightIndices.includes(i), state.selected.has(i)))
  }
}

function updateHUD(): void {
  roundDisplay.textContent = `${state.round} / ${TOTAL_ROUNDS}`
  scoreDisplay.textContent = String(state.totalScore)
  bestDisplay.textContent = String(state.bestScore)
}

function spawnScoreFloat(points: number): void {
  if (points === 0) return
  const el = document.createElement('div')
  el.className = 'score-float'
  el.textContent = `+${points}`
  const rect = cardTable.getBoundingClientRect()
  el.style.left = `${rect.left + rect.width / 2 - 30}px`
  el.style.top = `${rect.top}px`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 1300)
}

// ── Game logic ────────────────────────────────────────────────────────────────

function dealNewHand(): void {
  state.deck = shuffle(buildDeck())
  state.hand = state.deck.splice(0, 5)
  state.selected.clear()
  state.drawnThisRound = false

  handNameEl.textContent = '\u00a0'
  messageEl.textContent = 'Tap cards to discard, then Draw'
  btnDraw.style.display = 'inline-block'
  btnDraw.textContent = 'Draw'
  btnDraw.disabled = false
  btnNext.style.display = 'none'

  updateHUD()
  renderCards()

  const result = evaluateHand(state.hand)
  if (result.points > 0) handNameEl.textContent = result.name
}

function toggleCard(index: number): void {
  if (state.drawnThisRound) return
  audio.click()

  if (state.selected.has(index)) {
    state.selected.delete(index)
  } else {
    state.selected.add(index)
  }
  renderCards()

  const result = evaluateHand(state.hand)
  handNameEl.textContent = result.points > 0 ? result.name : '\u00a0'
}

function drawCards(): void {
  if (state.drawnThisRound) return
  state.drawnThisRound = true

  for (const i of state.selected) {
    state.hand[i] = state.deck.splice(0, 1)[0]
  }
  state.selected.clear()

  const result = evaluateHand(state.hand)
  handNameEl.textContent = result.name

  if (result.points > 0) {
    audio.score()
    spawnScoreFloat(result.points)
    state.totalScore += result.points
    gameSDK.reportScore(state.totalScore)
  } else {
    audio.death()
  }

  updateHUD()
  renderCards(result.bestIndices)
  btnDraw.style.display = 'none'

  if (state.round >= TOTAL_ROUNDS) {
    btnNext.textContent = 'See Results'
    messageEl.textContent = result.points > 0
      ? `${result.name}! +${result.points} — Final round!`
      : 'No hand — final round!'
  } else {
    messageEl.textContent = result.points > 0
      ? `${result.name}! +${result.points} points`
      : 'No hand — 0 points'
    btnNext.textContent = 'Next Round'
  }
  btnNext.style.display = 'inline-block'
  state.phase = 'result'
}

function nextRound(): void {
  if (state.round >= TOTAL_ROUNDS) {
    showEndScreen()
    return
  }
  audio.blip()
  state.round++
  state.phase = 'deal'
  dealNewHand()
}

function showEndScreen(): void {
  state.phase = 'end'

  if (state.totalScore > state.bestScore) {
    state.bestScore = state.totalScore
    gameSDK.save({ bestScore: state.bestScore })
    audio.levelUp()
    finalBestLabel.textContent = 'NEW PERSONAL BEST!'
  } else {
    audio.combo()
    finalBestLabel.textContent = `Best: ${state.bestScore}`
  }

  gameSDK.gameOver(state.totalScore)
  finalScoreEl.textContent = String(state.totalScore)
  endScreen.classList.add('visible')
  updateHUD()
}

function restartGame(): void {
  audio.start()
  state.round = 1
  state.totalScore = 0
  state.phase = 'deal'
  endScreen.classList.remove('visible')
  dealNewHand()
}

// ── Event listeners ───────────────────────────────────────────────────────────

btnDraw.addEventListener('click', () => { audio.click(); drawCards() })
btnNext.addEventListener('click', () => nextRound())
btnRestart.addEventListener('click', () => restartGame())

muteBtn.addEventListener('click', () => {
  const muted = audio.toggleMute()
  muteBtn.textContent = muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    await gameSDK.init({ gameId: 'poker-hands', gameSlug: 'poker-hands' })
    await gameSDK.showAd('preroll')
    const saved = await gameSDK.load<{ bestScore: number }>()
    if (saved?.bestScore) state.bestScore = saved.bestScore
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  audio.start()
  dealNewHand()
}

void boot()
