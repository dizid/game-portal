// Whack-a-Mole — main entry: DOM rendering, game loop, input

import {
  createGame, startGame, tick, whack, decrementTimer,
} from './game.js'
import type { WamGame, Mole } from './game.js'
import { initSDK, reportScore, reportGameOver, saveBest } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── Mute button ───────────────────────────────────────────────────────────────

const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── DOM refs ──────────────────────────────────────────────────────────────────

const gameContainer = document.getElementById('game-container') as HTMLDivElement
const moleGrid      = document.getElementById('mole-grid') as HTMLDivElement
const overlay       = document.getElementById('overlay') as HTMLDivElement
const startBtn      = document.getElementById('start-btn') as HTMLButtonElement
const scoreEl       = document.getElementById('score-value') as HTMLSpanElement
const timerEl       = document.getElementById('timer-value') as HTMLSpanElement
const bestEl        = document.getElementById('best-value') as HTMLSpanElement

// ── State ─────────────────────────────────────────────────────────────────────

let game: WamGame = createGame()
let best = 0
let tickInterval: ReturnType<typeof setInterval> | null = null
let timerInterval: ReturnType<typeof setInterval> | null = null

// Tracks which holes currently have a visible mole DOM element
const holeEls: HTMLDivElement[] = []
const moleVisibility = new Array<boolean>(9).fill(false)

// ── Grid setup ────────────────────────────────────────────────────────────────

function getHoleSize(): number {
  const w = gameContainer.clientWidth - 24
  const h = gameContainer.clientHeight - 80
  const available = Math.min(w, h, 420)
  // 3 cols, 12px gap = 3*size + 2*12 = available
  return Math.floor((available - 24) / 3)
}

function buildGrid(): void {
  const size = getHoleSize()
  moleGrid.style.gridTemplateColumns = `repeat(3, ${size}px)`
  moleGrid.style.gap = '12px'
  moleGrid.style.width = `${size * 3 + 24}px`
  moleGrid.textContent = ''
  holeEls.length = 0

  for (let i = 0; i < 9; i++) {
    const hole = document.createElement('div')
    hole.className = 'hole'
    hole.style.width = `${size}px`
    hole.style.height = `${size}px`
    hole.dataset.index = String(i)

    const moleEl = document.createElement('div')
    moleEl.className = 'mole'
    moleEl.textContent = '😊'  // default, updated per mole type
    hole.appendChild(moleEl)

    hole.addEventListener('click', () => handleHoleClick(i))
    hole.addEventListener('touchend', (e) => {
      e.preventDefault()
      handleHoleClick(i)
    })

    moleGrid.appendChild(hole)
    holeEls.push(hole)
  }
}

function resizeGrid(): void {
  const size = getHoleSize()
  moleGrid.style.gridTemplateColumns = `repeat(3, ${size}px)`
  moleGrid.style.width = `${size * 3 + 24}px`
  holeEls.forEach((hole) => {
    hole.style.width = `${size}px`
    hole.style.height = `${size}px`
    const moleEl = hole.querySelector('.mole') as HTMLElement | null
    if (moleEl) moleEl.style.fontSize = `${size * 0.45}px`
  })
}

// ── Mole rendering ────────────────────────────────────────────────────────────

const MOLE_EMOJI: Record<string, string> = {
  normal: '😊',
  golden: '⭐',
  bomb:   '💣',
}

function syncMoles(): void {
  const active = new Set(game.activeMoles.map((m) => m.holeIndex))

  for (let i = 0; i < 9; i++) {
    const hole = holeEls[i]
    const moleEl = hole.querySelector('.mole') as HTMLElement

    if (active.has(i) && !moleVisibility[i]) {
      // Show mole
      const mole = game.activeMoles.find((m) => m.holeIndex === i)!
      moleEl.textContent = MOLE_EMOJI[mole.type]
      moleEl.classList.remove('visible')
      void moleEl.offsetWidth  // reflow
      moleEl.classList.add('visible')
      moleVisibility[i] = true
    } else if (!active.has(i) && moleVisibility[i]) {
      // Hide mole (retracted naturally)
      moleEl.classList.remove('visible')
      moleVisibility[i] = false
    }
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────

function handleHoleClick(index: number): void {
  if (game.state !== 'PLAYING') return

  const { updated, result } = whack(game, index)
  game = updated

  if (!result) return

  const hole = holeEls[index]
  const moleEl = hole.querySelector('.mole') as HTMLElement

  // Whack animation
  hole.classList.add('whacked')
  moleEl.classList.remove('visible')
  moleVisibility[index] = false
  setTimeout(() => hole.classList.remove('whacked'), 300)

  // Star burst
  const burst = document.createElement('span')
  burst.className = 'star-burst'
  burst.textContent = result.points > 0 ? '✨' : '💥'
  hole.appendChild(burst)
  setTimeout(() => burst.remove(), 450)

  // Score pop
  const pop = document.createElement('span')
  pop.className = 'score-pop'
  pop.textContent = result.points > 0 ? `+${result.points}` : String(result.points)
  pop.style.color = result.points >= 50 ? '#f5c542' : result.points > 0 ? '#00ff88' : '#ff4466'
  hole.appendChild(pop)
  setTimeout(() => pop.remove(), 750)

  // Audio feedback based on mole type
  if (result.points >= 50) {
    audio.combo()
    try { navigator.vibrate(10) } catch {}
  } else if (result.points > 0) {
    audio.blip()
    try { navigator.vibrate(10) } catch {}
  } else {
    // Bomb hit
    audio.death()
    try { navigator.vibrate(10) } catch {}
  }

  updateHUD()
  reportScore(game.score)
}

// ── HUD ───────────────────────────────────────────────────────────────────────

function updateHUD(): void {
  scoreEl.textContent = String(game.score)
  timerEl.textContent = String(game.timeLeft)
  bestEl.textContent  = String(best)
  timerEl.classList.toggle('urgent', game.timeLeft <= 10)
}

// ── Game loop ─────────────────────────────────────────────────────────────────

function stopLoops(): void {
  if (tickInterval)  { clearInterval(tickInterval);  tickInterval  = null }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
}

function beginGame(): void {
  stopLoops()
  audio.start()
  game = startGame()
  moleVisibility.fill(false)
  syncMoles()
  updateHUD()
  overlay.classList.add('hidden')

  // Tick every 100ms — spawns/expires moles
  tickInterval = setInterval(() => {
    if (game.state !== 'PLAYING') return
    const { updated } = tick(game, Date.now())
    game = updated
    syncMoles()
  }, 100)

  // Timer every 1s
  timerInterval = setInterval(() => {
    if (game.state !== 'PLAYING') return
    game = decrementTimer(game)
    updateHUD()

    if (game.state === 'GAME_OVER') {
      stopLoops()
      syncMoles()  // clear all moles
      audio.death()
      try { navigator.vibrate([50, 30, 50]) } catch {}

      if (game.score > best) {
        best = game.score
        saveBest(best)
      }
      reportScore(game.score)
      reportGameOver(game.score)

      setTimeout(() => showEndOverlay(), 400)
    }
  }, 1000)
}

function showEndOverlay(): void {
  overlay.textContent = ''

  const title = document.createElement('div')
  title.className = 'overlay-title'
  title.textContent = 'Time Up!'
  overlay.appendChild(title)

  const sub1 = document.createElement('div')
  sub1.className = 'overlay-sub'
  sub1.textContent = `Score: ${game.score}`
  overlay.appendChild(sub1)

  if (game.score >= best && game.score > 0) {
    const sub2 = document.createElement('div')
    sub2.className = 'overlay-sub'
    sub2.textContent = 'New Best!'
    sub2.style.color = '#f5c542'
    overlay.appendChild(sub2)
  }

  const btn = document.createElement('button')
  btn.className = 'overlay-btn'
  btn.textContent = 'Play Again'
  btn.addEventListener('click', beginGame)
  overlay.appendChild(btn)

  overlay.classList.remove('hidden')
}

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', resizeGrid)

// ── Start btn ─────────────────────────────────────────────────────────────────

startBtn.addEventListener('click', beginGame)

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  buildGrid()

  try {
    const result = await initSDK()
    best = result.best
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  updateHUD()
  overlay.classList.remove('hidden')
}

void boot()
