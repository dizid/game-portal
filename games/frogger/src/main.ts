// Frogger — entry point

import { FroggerGame } from './game.js'
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
const timeEl = document.getElementById('time-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement

function resizeCanvas(): void {
  const container = canvas.parentElement!
  const cw = container.clientWidth
  const ch = container.clientHeight
  // Frogger field is 13:14 (COLS:ROWS)
  const scale = Math.min(cw / 13, ch / 14)
  const w = Math.round(13 * scale)
  const h = Math.round(14 * scale)
  canvas.width = w
  canvas.height = h
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
}

resizeCanvas()
window.addEventListener('resize', resizeCanvas)

// ── Game state ────────────────────────────────────────────────────────────────

const game = new FroggerGame()
const renderer = new Renderer(canvas)
let highScore = 0
let gameOverReported = false
let lastScore = -1
let lastTimeLeft = -1

// ── Input ─────────────────────────────────────────────────────────────────────

const input = new InputHandler(
  (dir) => {
    if (game.getState() !== 'PLAYING') return
    audio.blip()
    switch (dir) {
      case 'up':    game.moveUp();    break
      case 'down':  game.moveDown();  break
      case 'left':  game.moveLeft();  break
      case 'right': game.moveRight(); break
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
      lastScore = -1
      lastTimeLeft = -1
      updateHUD(0, 3, 60)
      game.start()
    }
  },
)

// ── HUD ───────────────────────────────────────────────────────────────────────

function updateHUD(score: number, lives: number, timeLeft: number): void {
  scoreEl.textContent = String(score)
  livesEl.textContent = String(lives)
  timeEl.textContent = String(Math.ceil(timeLeft))
  highScoreEl.textContent = String(highScore)
}

// ── Main loop ─────────────────────────────────────────────────────────────────

let lastTime = 0

function mainLoop(now: number): void {
  const dt = lastTime === 0 ? 0 : (now - lastTime) / 1000
  lastTime = now

  game.update(dt)

  const score = game.getScore()
  const lives = game.getLives()
  const timeLeft = game.getTimeLeft()
  const state = game.getState()

  if (score !== lastScore || Math.ceil(timeLeft) !== Math.ceil(lastTimeLeft)) {
    lastScore = score
    lastTimeLeft = timeLeft
    updateHUD(score, lives, timeLeft)
    reportScore(score)

    // Midroll ad every 1000 points
    if (score > 0 && Math.floor(score / 1000) > Math.floor((score - 10) / 1000)) {
      void requestMidrollAd()
    }
  }

  if (state === 'GAME_OVER' && !gameOverReported) {
    gameOverReported = true
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
    updateHUD(0, 3, 60)
  } catch (err) {
    console.warn('SDK init failed, running in standalone mode:', err)
  }

  requestAnimationFrame(mainLoop)
}

void boot()
