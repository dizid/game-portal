// Drift Challenge — entry point

import { DriftChallengeGame } from './game.js'
import { Renderer } from './renderer.js'
import { InputHandler } from './input.js'
import { initSDK, reportScore, reportGameOver, saveHighScore, requestMidrollAd } from './sdk-bridge.js'
import { audio } from './audio.js'

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const lapEl = document.getElementById('lap-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement

function resizeCanvas(): void {
  const container = canvas.parentElement!
  const w = container.clientWidth
  const h = container.clientHeight
  // Square-ish for top-down racing
  const aspect = 1
  let cw = w; let ch = h
  if (cw / ch > aspect) { cw = ch } else { ch = cw }
  canvas.width = Math.floor(cw)
  canvas.height = Math.floor(ch)
  canvas.style.width = `${Math.floor(cw)}px`
  canvas.style.height = `${Math.floor(ch)}px`
  game.resize(canvas.width, canvas.height)
}

// Initial sizing
const container = canvas.parentElement!
const iw = container.clientWidth; const ih = container.clientHeight
let icw = iw; let ich = ih
if (icw > ich) { icw = ich } else { ich = icw }
canvas.width = Math.floor(icw); canvas.height = Math.floor(ich)
canvas.style.width = `${Math.floor(icw)}px`; canvas.style.height = `${Math.floor(ich)}px`

const game = new DriftChallengeGame()
game.init(canvas.width, canvas.height)
const renderer = new Renderer(canvas)
let highScore = 0
let prevScore = 0
let prevState = game.getState()
let prevLap = 0

// Mute button
const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

window.addEventListener('resize', resizeCanvas)

const MIDROLL_INTERVAL = 1000
let nextMidrollAt = MIDROLL_INTERVAL

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const input = new InputHandler(
  (dir) => { game.setSteer(dir) },
  (held) => { game.setGas(held) },
  (held) => { game.setBrake(held) },
  () => {
    const s = game.getState()
    if (s === 'READY') { game.start(); audio.start() }
    else if (s === 'GAME_OVER') {
      game.reset()
      game.start()
      audio.start()
      nextMidrollAt = MIDROLL_INTERVAL
      prevScore = 0
      prevLap = 0
      updateHUD(0, 0)
    }
  }
)

function updateHUD(score: number, lap: number): void {
  scoreEl.textContent = String(score)
  lapEl.textContent = `${lap}/3`
  highScoreEl.textContent = String(highScore)
}

const FRAME_MS = 1000 / 60
let lastTime = 0

function mainLoop(now: number): void {
  if (now - lastTime >= FRAME_MS - 1) {
    lastTime = now
    renderer.updateAnimations()

    if (game.getState() === 'PLAYING') {
      game.tick()
    }

    const snap = game.getSnapshot()
    updateHUD(snap.score, snap.lap)
    renderer.render(snap)

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

    // Lap complete
    if (snap.lap > prevLap) {
      audio.levelUp()
      prevLap = snap.lap
    }

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
    updateHUD(0, 0)
  } catch (err) {
    console.warn('SDK init failed:', err)
  }
  requestAnimationFrame(mainLoop)
}

void boot()
