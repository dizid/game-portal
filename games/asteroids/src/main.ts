// Asteroids — entry point

import { AsteroidsGame } from './game.js'
import { Renderer } from './renderer.js'
import { InputHandler } from './input.js'
import {
  initSDK,
  reportScore,
  reportGameOver,
  saveHighScore,
  requestMidrollAd,
} from './sdk-bridge.js'

// ── Canvas setup ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const livesEl = document.getElementById('lives-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement

function resizeCanvas(): void {
  const container = canvas.parentElement!
  const cw = container.clientWidth
  const ch = container.clientHeight
  // Use full container for asteroids (it's a wraparound game)
  canvas.width = cw
  canvas.height = ch
  canvas.style.width = `${cw}px`
  canvas.style.height = `${ch}px`
  game.setField(cw, ch)
}

// ── Game state ────────────────────────────────────────────────────────────────

const game = new AsteroidsGame()
const renderer = new Renderer(canvas)
let highScore = 0
let gameOverReported = false
let lastScore = -1

resizeCanvas()
window.addEventListener('resize', () => {
  resizeCanvas()
})

const MIDROLL_INTERVAL = 500

// ── Input ─────────────────────────────────────────────────────────────────────

let actionPending = false

const input = new InputHandler({
  setRotateLeft:  (v) => { game.rotateLeft = v },
  setRotateRight: (v) => { game.rotateRight = v },
  setThrust:      (v) => { game.thrusting = v },
  setShooting:    (v) => { game.shooting = v },
  onShoot: () => { game.shoot() },
  onAction: () => { actionPending = true },
})

// ── HUD ───────────────────────────────────────────────────────────────────────

function updateHUD(score: number, lives: number): void {
  scoreEl.textContent = String(score)
  livesEl.textContent = String(lives)
  highScoreEl.textContent = String(highScore)
}

// ── Main loop ─────────────────────────────────────────────────────────────────

let lastTime = 0

function mainLoop(now: number): void {
  const dt = lastTime === 0 ? 0 : (now - lastTime) / 1000
  lastTime = now

  // Handle state transitions from input
  if (actionPending) {
    actionPending = false
    const state = game.getState()
    if (state === 'READY') {
      game.start()
    } else if (state === 'GAME_OVER') {
      game.reset()
      gameOverReported = false
      lastScore = -1
      updateHUD(0, 3)
      game.start()
    }
  }

  game.update(dt)

  const score = game.getScore()
  const lives = game.getLives()
  const state = game.getState()

  if (score !== lastScore) {
    lastScore = score
    updateHUD(score, lives)
    reportScore(score)

    if (score > 0 && Math.floor(score / MIDROLL_INTERVAL) > Math.floor((score - 20) / MIDROLL_INTERVAL)) {
      void requestMidrollAd()
    }
  }

  if (state === 'GAME_OVER' && !gameOverReported) {
    gameOverReported = true
    updateHUD(score, 0)
    if (score > highScore) {
      highScore = score
      highScoreEl.textContent = String(highScore)
      saveHighScore(highScore)
    }
    reportGameOver(score)
  }

  renderer.render(game.getSnapshot())

  requestAnimationFrame(mainLoop)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
    updateHUD(0, 3)
  } catch (err) {
    console.warn('SDK init failed, running in standalone mode:', err)
  }

  requestAnimationFrame(mainLoop)
}

void boot()
