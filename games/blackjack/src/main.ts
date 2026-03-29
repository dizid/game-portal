// Blackjack — main entry point wiring DOM, game logic, and SDK

import { BlackjackGame } from './game.js'
import type { Card, GameState } from './game.js'
import { initSDK, reportScore, reportGameOver, saveHighScore, requestMidrollAd } from './sdk-bridge.js'
import { audio } from './audio.js'

// Suppress unused import warning — GameState used for documentation clarity
void (0 as unknown as GameState)

// ── DOM refs ──────────────────────────────────────────────────────────────────

const overlayReady = document.getElementById('overlay-ready') as HTMLDivElement
const overlayGameover = document.getElementById('overlay-gameover') as HTMLDivElement
const finalScoreValue = document.getElementById('final-score-value') as HTMLSpanElement
const btnStart = document.getElementById('btn-start') as HTMLButtonElement
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement

const hudChips = document.getElementById('hud-chips') as HTMLSpanElement
const hudBet = document.getElementById('hud-bet') as HTMLSpanElement
const hudBest = document.getElementById('hud-best') as HTMLSpanElement

const dealerCardsEl = document.getElementById('dealer-cards') as HTMLDivElement
const playerCardsEl = document.getElementById('player-cards') as HTMLDivElement
const dealerValueEl = document.getElementById('dealer-value') as HTMLDivElement
const playerValueEl = document.getElementById('player-value') as HTMLDivElement
const roundMessageEl = document.getElementById('round-message') as HTMLDivElement

const betArea = document.getElementById('bet-area') as HTMLDivElement
const actionArea = document.getElementById('action-area') as HTMLDivElement
const currentBetDisplay = document.getElementById('current-bet-display') as HTMLSpanElement
const chipsDisplay = document.getElementById('chips-display') as HTMLSpanElement
const betButtons = document.querySelectorAll<HTMLButtonElement>('.bet-btn[data-amount]')
const btnDeal = document.getElementById('btn-deal-hand') as HTMLButtonElement
const btnHit = document.getElementById('btn-hit') as HTMLButtonElement
const btnStand = document.getElementById('btn-stand') as HTMLButtonElement
const btnDouble = document.getElementById('btn-double') as HTMLButtonElement

// ── State ─────────────────────────────────────────────────────────────────────

const game = new BlackjackGame()
let highScore = 0
let roundCount = 0
const MIDROLL_EVERY = 5 // show ad every N rounds

// ── Card rendering ────────────────────────────────────────────────────────────

const RED_SUITS = new Set(['♥', '♦'])

function renderCard(card: Card): HTMLElement {
  const el = document.createElement('div')
  el.className = 'card'

  if (card.faceDown) {
    el.classList.add('face-down')
    return el
  }

  const isRed = RED_SUITS.has(card.suit)
  el.classList.add(isRed ? 'red' : 'black')

  const top = document.createElement('div')
  top.className = 'card-rank'
  top.textContent = card.rank

  const middle = document.createElement('div')
  middle.className = 'card-suit'
  middle.textContent = card.suit

  const bottom = document.createElement('div')
  bottom.className = 'card-rank-bottom'
  bottom.textContent = card.rank

  el.appendChild(top)
  el.appendChild(middle)
  el.appendChild(bottom)

  return el
}

function clearChildren(container: HTMLElement): void {
  // Safe DOM clear — no user content involved
  while (container.firstChild) {
    container.removeChild(container.firstChild)
  }
}

function renderHand(container: HTMLElement, cards: Card[]): void {
  clearChildren(container)
  for (const card of cards) {
    container.appendChild(renderCard(card))
  }
}

// ── UI update ─────────────────────────────────────────────────────────────────

function updateUI(): void {
  const snap = game.getSnapshot()

  hudChips.textContent = String(snap.chips)
  hudBet.textContent = String(snap.bet)
  hudBest.textContent = String(highScore)
  chipsDisplay.textContent = String(snap.chips)
  currentBetDisplay.textContent = String(snap.bet)

  renderHand(dealerCardsEl, snap.dealerHand)
  renderHand(playerCardsEl, snap.playerHand)

  // Dealer value: hide hole-card contribution unless round is over
  const showFullDealer = snap.state === 'ROUND_OVER' || snap.state === 'DEALER_TURN' || snap.state === 'GAME_OVER'
  dealerValueEl.textContent = showFullDealer ? String(snap.dealerValue) : '?'
  playerValueEl.textContent = snap.playerHand.length ? String(snap.playerValue) : '0'

  // Round message — set class and text via textContent (no HTML)
  roundMessageEl.className = 'round-message'
  roundMessageEl.id = 'round-message'
  switch (snap.roundResult) {
    case 'player_blackjack':
      roundMessageEl.textContent = 'BLACKJACK! You win 3:2!'
      roundMessageEl.classList.add('win')
      break
    case 'player_wins':
      roundMessageEl.textContent = 'You win!'
      roundMessageEl.classList.add('win')
      break
    case 'dealer_bust':
      roundMessageEl.textContent = 'Dealer busts — you win!'
      roundMessageEl.classList.add('win')
      break
    case 'player_bust':
      roundMessageEl.textContent = 'Bust! You lose.'
      roundMessageEl.classList.add('lose')
      break
    case 'dealer_wins':
      roundMessageEl.textContent = 'Dealer wins.'
      roundMessageEl.classList.add('lose')
      break
    case 'push':
      roundMessageEl.textContent = 'Push — no change.'
      roundMessageEl.classList.add('push')
      break
    default:
      roundMessageEl.textContent = ''
  }

  // Show/hide areas based on state
  const isBetting = snap.state === 'BETTING'
  const isPlaying = snap.state === 'PLAYING'
  const isRoundOver = snap.state === 'ROUND_OVER'

  betArea.classList.toggle('hidden', !isBetting && !isRoundOver)
  actionArea.classList.toggle('hidden', !isPlaying)

  // Bet buttons: enable only when in BETTING state
  betButtons.forEach((btn) => {
    btn.disabled = !isBetting
  })
  btnDeal.disabled = !isBetting || snap.bet === 0
  btnDeal.textContent = isRoundOver ? 'NEXT' : 'DEAL'

  // Action buttons
  btnHit.disabled = !isPlaying
  btnStand.disabled = !isPlaying
  btnDouble.disabled = !isPlaying || !snap.canDouble

  // Overlays
  overlayReady.classList.toggle('hidden', snap.state !== 'READY')
  overlayGameover.classList.toggle('hidden', snap.state !== 'GAME_OVER')

  if (snap.state === 'GAME_OVER') {
    finalScoreValue.textContent = String(snap.chips)
  }
}

// ── High score tracking ───────────────────────────────────────────────────────

function checkHighScore(): void {
  const chips = game.getChips()
  if (chips > highScore) {
    highScore = chips
    saveHighScore(highScore)
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

btnStart.addEventListener('click', () => {
  game.startSession()
  updateUI()
})

btnRestart.addEventListener('click', () => {
  game.reset()
  game.startSession()
  roundCount = 0
  updateUI()
})

betButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const amount = parseInt(btn.dataset.amount ?? '0', 10)
    const snap = game.getSnapshot()

    // If round over, a new bet starts the next round
    if (snap.state === 'ROUND_OVER') {
      game.nextRound()
    }

    game.addBet(amount)
    updateUI()
  })
})

btnDeal.addEventListener('click', () => {
  const snap = game.getSnapshot()
  if (snap.state === 'ROUND_OVER') {
    // "NEXT" button — advance to betting phase
    game.nextRound()
    roundCount++
    if (roundCount % MIDROLL_EVERY === 0) {
      void requestMidrollAd()
    }
    updateUI()
    return
  }

  game.deal()
  updateUI()
  checkHighScore()
  reportScore(game.getChips())

  const newSnap = game.getSnapshot()
  if (newSnap.state === 'GAME_OVER') {
    reportGameOver(newSnap.chips)
  }
})

btnHit.addEventListener('click', () => {
  game.hit()
  updateUI()
  checkHighScore()
  reportScore(game.getChips())

  const snap = game.getSnapshot()
  if (snap.state === 'GAME_OVER') {
    reportGameOver(snap.chips)
  }
})

btnStand.addEventListener('click', () => {
  game.stand()
  updateUI()
  checkHighScore()
  reportScore(game.getChips())

  const snap = game.getSnapshot()
  if (snap.state === 'GAME_OVER') {
    reportGameOver(snap.chips)
  }
})

btnDouble.addEventListener('click', () => {
  game.doubleDown()
  updateUI()
  checkHighScore()
  reportScore(game.getChips())

  const snap = game.getSnapshot()
  if (snap.state === 'GAME_OVER') {
    reportGameOver(snap.chips)
  }
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  updateUI()
}

void boot()
