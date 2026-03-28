// Entry point — wires together game loop, renderer, input, and SDK

import { SnakeGame } from './game.js'
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
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement

const GRID_SIZE = 20

// Resize canvas to fill the container while keeping a square aspect ratio
function resizeCanvas(): void {
  const container = canvas.parentElement!
  const size = Math.min(container.clientWidth, container.clientHeight)
  canvas.width = size
  canvas.height = size
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
}

resizeCanvas()
window.addEventListener('resize', resizeCanvas)

// ── Game state ────────────────────────────────────────────────────────────────

const game = new SnakeGame(GRID_SIZE)
const renderer = new Renderer(canvas)
let highScore = 0

// Track score milestones for midroll ads (every 50 points)
const MIDROLL_INTERVAL = 50
let nextMidrollAt = MIDROLL_INTERVAL

// ── Tick loop ─────────────────────────────────────────────────────────────────

let lastTickTime = 0

async function gameTick(now: number): Promise<void> {
  const elapsed = now - lastTickTime

  if (game.getState() === 'PLAYING' && elapsed >= game.getTickMs()) {
    lastTickTime = now
    const died = game.tick()

    const score = game.getScore()
    updateHUD(score)

    // Report live score to portal
    reportScore(score)

    // Midroll ad every MIDROLL_INTERVAL points
    if (score >= nextMidrollAt) {
      nextMidrollAt += MIDROLL_INTERVAL
      // Fire and forget — game continues regardless of whether ad was watched
      void requestMidrollAd()
    }

    if (died) {
      handleGameOver(score)
    }
  }
}

function handleGameOver(score: number): void {
  if (score > highScore) {
    highScore = score
    highScoreEl.textContent = String(highScore)
    saveHighScore(highScore)
  }
  reportGameOver(score)
}

// ── Render loop (60 fps) ──────────────────────────────────────────────────────

function renderLoop(): void {
  renderer.updateAnimations()
  renderer.render(game.getSnapshot())
  requestAnimationFrame(renderLoop)
}

// ── Input ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const input = new InputHandler(
  // Direction callback
  (direction) => {
    if (game.getState() === 'PLAYING') {
      game.handleInput(direction)
    }
  },
  // Action callback (tap / space / enter)
  () => {
    const state = game.getState()
    if (state === 'READY') {
      game.start()
    } else if (state === 'GAME_OVER') {
      // Reset and immediately start a new round
      game.reset()
      nextMidrollAt = MIDROLL_INTERVAL
      updateHUD(0)
      game.start()
    }
  },
)

// ── HUD update ────────────────────────────────────────────────────────────────

function updateHUD(score: number): void {
  scoreEl.textContent = String(score)
  highScoreEl.textContent = String(highScore)
}

// ── Combined animation + tick loop ───────────────────────────────────────────

function mainLoop(now: number): void {
  void gameTick(now)
  requestAnimationFrame(mainLoop)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
    updateHUD(0)
  } catch (err) {
    // SDK failure must not prevent the game from loading
    console.warn('SDK init failed, running in standalone mode:', err)
  }

  // Start render loop immediately so the READY screen shows
  renderLoop()

  // Start the tick + animation driver
  requestAnimationFrame(mainLoop)
}

void boot()
