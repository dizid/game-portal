// Pong — entry point

import { PongGame } from './game.js'
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
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement

function resizeCanvas(): void {
  const container = canvas.parentElement!
  const cw = container.clientWidth
  const ch = container.clientHeight
  // Maintain 3:2 aspect ratio (600x400 logical field)
  const scale = Math.min(cw / 600, ch / 400)
  const w = Math.round(600 * scale)
  const h = Math.round(400 * scale)
  canvas.width = w
  canvas.height = h
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
}

resizeCanvas()
window.addEventListener('resize', resizeCanvas)

// ── Game state ────────────────────────────────────────────────────────────────

const game = new PongGame()
const renderer = new Renderer(canvas)
let highScore = 0
let gameOverReported = false

// ── Input ─────────────────────────────────────────────────────────────────────

const input = new InputHandler(
  (logicalY, delta) => {
    if (logicalY !== null) {
      game.movePlayerPaddle(logicalY)
    } else if (delta !== null) {
      game.movePlayerPaddleDelta(delta)
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
      gameOverReported = false
      game.start()
    }
  },
)

// ── Main loop ─────────────────────────────────────────────────────────────────

let lastTime = 0
let lastScore = -1

function mainLoop(now: number): void {
  const dt = lastTime === 0 ? 0 : (now - lastTime) / 1000
  lastTime = now

  input.processFrame(dt)
  game.update(dt)

  const score = game.getPlayerScore()
  const state = game.getState()

  if (score !== lastScore) {
    lastScore = score
    reportScore(score)
    audio.blip()
    try { navigator.vibrate(10) } catch {}
    // Request midroll every 5 player points
    if (score > 0 && score % 5 === 0) void requestMidrollAd()
  }

  if (state === 'GAME_OVER' && !gameOverReported) {
    gameOverReported = true
    audio.death()
    try { navigator.vibrate([50, 30, 50]) } catch {}
    if (score > highScore) {
      highScore = score
      highScoreEl.textContent = String(highScore)
      saveHighScore(highScore)
    }
    reportGameOver(score)
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
    highScoreEl.textContent = String(highScore)
  } catch (err) {
    console.warn('SDK init failed, running in standalone mode:', err)
  }

  requestAnimationFrame(mainLoop)
}

void boot()
