// Breakout — entry point

import { BreakoutGame } from './game.js'
import { Renderer } from './renderer.js'
import { InputHandler } from './input.js'
import {
  initSDK,
  reportScore,
  reportGameOver,
  saveHighScore,
  requestMidrollAd,
} from './sdk-bridge.js'
import { audio } from './audio.js'

// ── Mute button ───────────────────────────────────────────────────────────────

const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── Canvas setup ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const livesEl = document.getElementById('lives-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement

function resizeCanvas(): void {
  const container = canvas.parentElement!
  const cw = container.clientWidth
  const ch = container.clientHeight
  // Maintain 2:3 aspect ratio (400x600 logical field)
  const scale = Math.min(cw / 400, ch / 600)
  const w = Math.round(400 * scale)
  const h = Math.round(600 * scale)
  canvas.width = w
  canvas.height = h
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
}

resizeCanvas()
window.addEventListener('resize', resizeCanvas)

// ── Game state ────────────────────────────────────────────────────────────────

const game = new BreakoutGame()
const renderer = new Renderer(canvas)
let highScore = 0
let lastScore = 0

const MIDROLL_INTERVAL = 500
let nextMidrollAt = MIDROLL_INTERVAL

// ── Input ─────────────────────────────────────────────────────────────────────

const input = new InputHandler(
  (logicalX, delta) => {
    if (logicalX !== null) {
      game.movePaddle(logicalX)
    } else if (delta !== null) {
      game.movePaddleDelta(delta)
    }
  },
  () => {
    const state = game.getState()
    if (state === 'READY') {
      audio.start()
      game.start()
    } else if (state === 'GAME_OVER') {
      audio.start()
      game.reset()
      nextMidrollAt = MIDROLL_INTERVAL
      updateHUD(0, game.getLives())
      game.start()
    }
  },
)

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

  input.processFrame(dt)
  game.update(dt)

  const score = game.getScore()
  const lives = game.getLives()
  const state = game.getState()

  if (score !== lastScore) {
    lastScore = score
    updateHUD(score, lives)
    reportScore(score)
    audio.blip()
    try { navigator.vibrate(10) } catch {}

    if (score >= nextMidrollAt) {
      nextMidrollAt += MIDROLL_INTERVAL
      void requestMidrollAd()
    }
  }

  if (state === 'GAME_OVER' && lives === 0 && score > 0) {
    // Only trigger once — reset lastScore to 0 after reporting
    if (lastScore > 0) {
      if (score > highScore) {
        highScore = score
        highScoreEl.textContent = String(highScore)
        saveHighScore(highScore)
      }
      reportGameOver(score)
      audio.death()
      try { navigator.vibrate([50, 30, 50]) } catch {}
      lastScore = -1  // sentinel to avoid re-reporting
      updateHUD(score, 0)
    }
  }

  renderer.updateAnimations()
  renderer.render(game.getSnapshot())

  requestAnimationFrame(mainLoop)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
    updateHUD(0, game.getLives())
  } catch (err) {
    console.warn('SDK init failed, running in standalone mode:', err)
  }

  requestAnimationFrame(mainLoop)
}

void boot()
