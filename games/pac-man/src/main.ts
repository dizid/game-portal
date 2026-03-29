// Pac-Man — entry point

import { PacManGame } from './game.js'
import { Renderer } from './renderer.js'
import { InputHandler } from './input.js'
import { initSDK, reportScore, reportGameOver, saveHighScore, requestMidrollAd } from './sdk-bridge.js'
import { audio } from './audio.js'

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const livesEl = document.getElementById('lives-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement

function resizeCanvas(): void {
  const container = canvas.parentElement!
  const w = container.clientWidth
  const h = container.clientHeight
  // 28:33 aspect (28 cols, 31 rows + HUD space)
  const aspect = 28 / 34
  let cw = w
  let ch = h
  if (cw / ch > aspect) { cw = ch * aspect } else { ch = cw / aspect }
  canvas.width = Math.floor(cw)
  canvas.height = Math.floor(ch)
  canvas.style.width = `${Math.floor(cw)}px`
  canvas.style.height = `${Math.floor(ch)}px`
}

resizeCanvas()
window.addEventListener('resize', resizeCanvas)

const game = new PacManGame()
game.init()
const renderer = new Renderer(canvas)
let highScore = 0

// Mute button
const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

const MIDROLL_INTERVAL = 500
let nextMidrollAt = MIDROLL_INTERVAL

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const input = new InputHandler(
  (dir) => { if (game.getState() === 'PLAYING') game.setDirection(dir) },
  () => {
    const s = game.getState()
    if (s === 'READY') { game.start(); audio.start() }
    else if (s === 'GAME_OVER') {
      game.reset()
      game.start()
      audio.start()
      nextMidrollAt = MIDROLL_INTERVAL
      updateHUD(0, 3)
    }
  }
)

function updateHUD(score: number, lives: number): void {
  scoreEl.textContent = String(score)
  livesEl.textContent = String(Math.max(0, lives))
  highScoreEl.textContent = String(highScore)
}

const TARGET_FPS = 60
const FRAME_MS = 1000 / TARGET_FPS
let lastTime = 0
let prevScore = 0
let prevState = game.getState()

function mainLoop(now: number): void {
  const delta = now - lastTime
  if (delta >= FRAME_MS - 1) {
    lastTime = now
    renderer.updateAnimations()

    if (game.getState() === 'PLAYING' || game.getState() === 'LEVEL_CLEAR') {
      game.tick()
    }

    const snap = game.getSnapshot()
    updateHUD(snap.score, snap.lives)
    renderer.render(snap)

    // Score reporting & midroll
    if (snap.score !== prevScore) {
      reportScore(snap.score)
      audio.score()
      try { navigator.vibrate(10) } catch { /* not supported */ }
      prevScore = snap.score
      if (snap.score >= nextMidrollAt) {
        nextMidrollAt += MIDROLL_INTERVAL
        void requestMidrollAd()
      }
    }

    // Level clear
    if (prevState !== 'LEVEL_CLEAR' && snap.state === 'LEVEL_CLEAR') {
      audio.levelUp()
    }

    // Game over detection
    if (prevState !== 'GAME_OVER' && snap.state === 'GAME_OVER') {
      audio.death()
      try { navigator.vibrate([50, 30, 50]) } catch { /* not supported */ }
      if (snap.score > highScore) {
        highScore = snap.score
        saveHighScore(highScore)
      }
      reportGameOver(snap.score)
    }
    prevState = snap.state
  }
  requestAnimationFrame(mainLoop)
}

async function boot(): Promise<void> {
  try {
    const { highScore: saved } = await initSDK()
    highScore = saved
    updateHUD(0, 3)
  } catch (err) {
    console.warn('SDK init failed:', err)
  }
  requestAnimationFrame(mainLoop)
}

void boot()
