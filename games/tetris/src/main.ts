// Tetris — entry point

import { TetrisGame } from './game.js'
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
const levelEl = document.getElementById('level-value') as HTMLSpanElement
const linesEl = document.getElementById('lines-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement

function resizeCanvas(): void {
  const container = canvas.parentElement!
  const cw = container.clientWidth
  const ch = container.clientHeight
  // Tetris board is 10:20 — plus 80px side panel
  // Target: board height fills 95% of container height
  const boardRows = 20
  const cellSize = Math.floor((ch * 0.95) / boardRows)
  const w = cellSize * 10 + 90    // board + side panel
  const h = Math.min(ch, cellSize * 20 + 20)
  const finalW = Math.min(w, cw)
  canvas.width = finalW
  canvas.height = h
  canvas.style.width = `${finalW}px`
  canvas.style.height = `${h}px`
}

resizeCanvas()
window.addEventListener('resize', resizeCanvas)

// ── Game state ────────────────────────────────────────────────────────────────

const game = new TetrisGame()
const renderer = new Renderer(canvas)
let highScore = 0
let gameOverReported = false
let lastScore = -1
let lastLines = -1
let lastLevel = -1

const MIDROLL_INTERVAL = 10  // lines

// ── Input ─────────────────────────────────────────────────────────────────────

const input = new InputHandler((action) => {
  switch (action) {
    case 'start':
      if (game.getState() === 'READY') {
        audio.start()
        game.start()
      } else if (game.getState() === 'GAME_OVER') {
        audio.start()
        game.reset()
        gameOverReported = false
        lastScore = -1
        lastLines = -1
        lastLevel = -1
        game.start()
      }
      break
    case 'moveLeft':  audio.blip(); game.moveLeft();  break
    case 'moveRight': audio.blip(); game.moveRight(); break
    case 'rotate':    audio.blip(); game.rotate();    break
    case 'softDropStart': game.setSoftDrop(true);  break
    case 'softDropEnd':   game.setSoftDrop(false); break
    case 'hardDrop':  audio.score(); game.hardDrop(); break
  }
})

// ── HUD ───────────────────────────────────────────────────────────────────────

function updateHUD(score: number, level: number, lines: number): void {
  scoreEl.textContent = String(score)
  levelEl.textContent = String(level)
  linesEl.textContent = String(lines)
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
  const level = game.getLevel()
  const lines = game.getLines()
  const state = game.getState()

  if (score !== lastScore || lines !== lastLines) {
    const prevLines = lastLines
    const prevLevel = lastLevel
    lastScore = score
    lastLines = lines
    lastLevel = level
    updateHUD(score, level, lines)
    reportScore(score)

    // Lines cleared — score sound
    if (lines > prevLines && prevLines >= 0) {
      audio.score()
      try { navigator.vibrate(10) } catch {}
    }

    // Level up
    if (level > prevLevel && prevLevel >= 0) {
      audio.levelUp()
      try { navigator.vibrate([10, 10, 10]) } catch {}
    }

    // Midroll ad every N lines
    if (lines > 0 && lines % MIDROLL_INTERVAL === 0 && lines !== prevLines) {
      void requestMidrollAd()
    }
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

  renderer.render(game.getSnapshot())

  requestAnimationFrame(mainLoop)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
    updateHUD(0, 1, 0)
  } catch (err) {
    console.warn('SDK init failed, running in standalone mode:', err)
  }

  requestAnimationFrame(mainLoop)
}

void boot()
