// Space Invaders — entry point

import { SpaceInvadersGame } from './game.js'
import { Renderer } from './renderer.js'
import { InputHandler } from './input.js'
import { initSDK, reportScore, reportGameOver, saveHighScore, requestMidrollAd } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── Canvas setup ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const livesEl = document.getElementById('lives-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement

function resizeCanvas(): void {
  const container = canvas.parentElement!
  const w = container.clientWidth
  const h = container.clientHeight
  // Maintain 4:5 aspect ratio (portrait-ish)
  const aspect = 4 / 5
  let cw = w
  let ch = h
  if (cw / ch > aspect) {
    cw = ch * aspect
  } else {
    ch = cw / aspect
  }
  canvas.width = Math.floor(cw)
  canvas.height = Math.floor(ch)
  canvas.style.width = `${Math.floor(cw)}px`
  canvas.style.height = `${Math.floor(ch)}px`
  game.resize(canvas.width, canvas.height)
}

// ── Game ──────────────────────────────────────────────────────────────────────

const game = new SpaceInvadersGame()
const renderer = new Renderer(canvas)
let highScore = 0

// Mute button
const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// Init canvas size before game.init so layout uses correct dimensions
const container = canvas.parentElement!
const initW = container.clientWidth
const initH = container.clientHeight
const aspect = 4 / 5
let initCW = initW
let initCH = initH
if (initCW / initCH > aspect) { initCW = initCH * aspect } else { initCH = initCW / aspect }
canvas.width = Math.floor(initCW)
canvas.height = Math.floor(initCH)
canvas.style.width = `${Math.floor(initCW)}px`
canvas.style.height = `${Math.floor(initCH)}px`

game.init(canvas.width, canvas.height)
window.addEventListener('resize', resizeCanvas)

// ── Input ─────────────────────────────────────────────────────────────────────

const MIDROLL_INTERVAL = 500
let nextMidrollAt = MIDROLL_INTERVAL

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const input = new InputHandler(
  (dir) => {
    if (game.getState() === 'PLAYING') game.setPlayerMove(dir)
  },
  () => {
    if (game.getState() === 'PLAYING') { game.shoot(); audio.blip() }
  },
  () => {
    if (game.getState() === 'READY') {
      game.start(); audio.start()
    } else if (game.getState() === 'GAME_OVER') {
      game.reset()
      nextMidrollAt = MIDROLL_INTERVAL
      updateHUD(0, 3)
      game.start()
      audio.start()
    }
  }
)

// ── HUD ───────────────────────────────────────────────────────────────────────

function updateHUD(score: number, lives: number): void {
  scoreEl.textContent = String(score)
  livesEl.textContent = String(lives)
  highScoreEl.textContent = String(highScore)
}

// ── Main loop ─────────────────────────────────────────────────────────────────

const TARGET_FPS = 60
const FRAME_MS = 1000 / TARGET_FPS
let lastTime = 0

function mainLoop(now: number): void {
  const delta = now - lastTime
  if (delta >= FRAME_MS - 1) {
    lastTime = now
    renderer.updateAnimations()

    if (game.getState() === 'PLAYING') {
      const over = game.tick()
      const score = game.getScore()
      const lives = game.getLives()
      const prevScore = parseInt(scoreEl.textContent ?? '0', 10)
      updateHUD(score, lives)

      if (score !== prevScore) {
        reportScore(score)
        audio.score()
        try { navigator.vibrate(10) } catch { /* not supported */ }
      }

      if (score >= nextMidrollAt) {
        nextMidrollAt += MIDROLL_INTERVAL
        void requestMidrollAd()
      }

      if (over) {
        audio.death()
        try { navigator.vibrate([50, 30, 50]) } catch { /* not supported */ }
        if (score > highScore) {
          highScore = score
          saveHighScore(highScore)
        }
        reportGameOver(score)
        updateHUD(score, 0)
      }
    }

    renderer.render(game.getSnapshot())
  }
  requestAnimationFrame(mainLoop)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: saved } = await initSDK()
    highScore = saved
    updateHUD(0, 3)
  } catch (err) {
    console.warn('SDK init failed, standalone mode:', err)
  }
  requestAnimationFrame(mainLoop)
}

void boot()
