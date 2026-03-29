// Memory Match — main entry: DOM rendering, input, game loop

import {
  createGame, startGame, flipCard, unflipCards, tickTimer,
} from './game.js'
import type { MemoryGame } from './game.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── Mute button ───────────────────────────────────────────────────────────────

const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── DOM refs ──────────────────────────────────────────────────────────────────

const gameContainer = document.getElementById('game-container') as HTMLDivElement
const cardGrid      = document.getElementById('card-grid') as HTMLDivElement
const overlay       = document.getElementById('overlay') as HTMLDivElement
const startBtn      = document.getElementById('start-btn') as HTMLButtonElement
const movesEl       = document.getElementById('moves-value') as HTMLSpanElement
const timeEl        = document.getElementById('time-value') as HTMLSpanElement
const pairsEl       = document.getElementById('pairs-value') as HTMLSpanElement

// ── State ─────────────────────────────────────────────────────────────────────

let game: MemoryGame = createGame()
let bestScore = 0
let lockInput = false
let timerInterval: ReturnType<typeof setInterval> | null = null

// ── Card size calculation ─────────────────────────────────────────────────────

function getCardSize(): number {
  const w = gameContainer.clientWidth - 24
  const h = gameContainer.clientHeight - 80
  const available = Math.min(w, h, 420)
  // 4 cols, 10px gap, 10px padding each side = 4*size + 3*10 = available
  return Math.floor((available - 30) / 4)
}

function setupGrid(): void {
  const size = getCardSize()
  cardGrid.style.width = `${size * 4 + 30}px`
  cardGrid.style.gridTemplateColumns = `repeat(4, ${size}px)`
  cardGrid.style.gap = '10px'

  // Set card size on existing cards
  Array.from(cardGrid.querySelectorAll('.card')).forEach((el) => {
    const card = el as HTMLElement
    card.style.width = `${size}px`
    card.style.height = `${size}px`
    const front = card.querySelector('.card-front') as HTMLElement | null
    if (front) front.style.fontSize = `${size * 0.42}px`
  })
}

// ── Card DOM building ─────────────────────────────────────────────────────────

function buildCards(): void {
  const size = getCardSize()
  cardGrid.textContent = ''

  game.cards.forEach((cardData) => {
    const cardEl = document.createElement('div')
    cardEl.className = 'card'
    cardEl.dataset.id = String(cardData.id)
    cardEl.style.width = `${size}px`
    cardEl.style.height = `${size}px`

    const inner = document.createElement('div')
    inner.className = 'card-inner'

    const back = document.createElement('div')
    back.className = 'card-face card-back'
    const backPattern = document.createElement('div')
    backPattern.className = 'card-back-pattern'
    back.appendChild(backPattern)

    const front = document.createElement('div')
    front.className = 'card-face card-front'
    front.textContent = cardData.emoji
    front.style.fontSize = `${size * 0.42}px`

    inner.appendChild(back)
    inner.appendChild(front)
    cardEl.appendChild(inner)

    cardEl.addEventListener('click', () => handleCardClick(cardData.id))
    cardEl.addEventListener('touchend', (e) => {
      e.preventDefault()
      handleCardClick(cardData.id)
    })

    cardGrid.appendChild(cardEl)
  })
}

function syncCardStates(): void {
  game.cards.forEach((cardData) => {
    const el = cardGrid.querySelector(`[data-id="${cardData.id}"]`) as HTMLElement | null
    if (!el) return
    el.classList.toggle('flipped', cardData.state === 'flipped')
    el.classList.toggle('matched', cardData.state === 'matched')
  })
}

// ── HUD ───────────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function updateHUD(): void {
  movesEl.textContent = String(game.moves)
  timeEl.textContent  = formatTime(game.elapsedSeconds)
  pairsEl.textContent = `${game.pairs}/8`
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer(): void {
  stopTimer()
  timerInterval = setInterval(() => {
    game = tickTimer(game)
    updateHUD()
  }, 1000)
}

function stopTimer(): void {
  if (timerInterval !== null) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

// ── Game flow ─────────────────────────────────────────────────────────────────

function handleCardClick(cardId: number): void {
  if (lockInput) return
  if (game.state !== 'PLAYING') return

  const prevPairs = game.pairs
  const result = flipCard(game, cardId)
  game = result.updated
  syncCardStates()
  updateHUD()

  if (result.lockInput) {
    // Mismatched — lock and unflip after 800ms
    audio.blip()
    lockInput = true
    setTimeout(() => {
      game = unflipCards(game)
      syncCardStates()
      lockInput = false
    }, 800)
  } else if (game.pairs > prevPairs) {
    // Pair matched
    audio.score()
    try { navigator.vibrate(10) } catch {}
  } else {
    // First card of a pair flipped
    audio.blip()
  }

  if (game.state === 'GAME_OVER') {
    stopTimer()
    audio.combo()
    try { navigator.vibrate([10, 10, 10]) } catch {}
    if (game.score > bestScore) {
      bestScore = game.score
      saveBestScore(bestScore)
    }
    reportScore(game.score)
    reportGameOver(game.score)

    setTimeout(() => {
      showEndOverlay()
    }, 600)
  }
}

function showEndOverlay(): void {
  overlay.textContent = ''

  const title = document.createElement('div')
  title.className = 'overlay-title'
  title.textContent = 'You Win!'
  overlay.appendChild(title)

  const sub1 = document.createElement('div')
  sub1.className = 'overlay-sub'
  sub1.textContent = `Score: ${game.score}`
  overlay.appendChild(sub1)

  const sub2 = document.createElement('div')
  sub2.className = 'overlay-sub'
  sub2.textContent = `${game.moves} moves · ${formatTime(game.elapsedSeconds)}`
  overlay.appendChild(sub2)

  const btn = document.createElement('button')
  btn.className = 'overlay-btn'
  btn.textContent = 'Play Again'
  btn.addEventListener('click', newGame)
  overlay.appendChild(btn)

  overlay.classList.remove('hidden')
}

function newGame(): void {
  stopTimer()
  lockInput = false
  audio.start()
  game = startGame(game)
  overlay.classList.add('hidden')
  buildCards()
  setupGrid()
  updateHUD()
  startTimer()
}

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', setupGrid)

// ── Start btn ─────────────────────────────────────────────────────────────────

startBtn.addEventListener('click', newGame)

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const result = await initSDK()
    bestScore = result.bestScore
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  setupGrid()
  overlay.classList.remove('hidden')
}

void boot()
