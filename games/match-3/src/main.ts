// Entry point — Match-3: tap/click to select and swap gems

import { Match3Game, GAME_DURATION_SEC } from './game.js'
import { Renderer } from './renderer.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── Mute button ────────────────────────────────────────────────────────────────
const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── DOM ────────────────────────────────────────────────────────────────────────

const canvas        = document.getElementById('game-canvas') as HTMLCanvasElement
const scoreEl       = document.getElementById('score-display') as HTMLSpanElement
const timerEl       = document.getElementById('timer-display') as HTMLSpanElement
const comboEl       = document.getElementById('combo-display') as HTMLSpanElement
const timerBar      = document.getElementById('timer-bar') as HTMLDivElement
const overlay       = document.getElementById('overlay') as HTMLDivElement
const overlayCard   = document.getElementById('overlay-card') as HTMLDivElement

// ── Game + renderer ────────────────────────────────────────────────────────────

const game = new Match3Game()
const renderer = new Renderer(canvas)
let highScore = 0

// ── Cascade loop state ─────────────────────────────────────────────────────────

// After a valid swap, we process cascades with short delays for visual effect
let cascadeTimeout: ReturnType<typeof setTimeout> | null = null
let swapAnimT = 0 // 0..1 swap animation progress
let swapAnimActive = false
const SWAP_ANIM_STEPS = 12 // ~200ms at 60fps

// ── Resize ─────────────────────────────────────────────────────────────────────

function resize(): void {
  const wrap = document.getElementById('canvas-wrap') as HTMLDivElement
  renderer.resize(wrap.clientWidth, wrap.clientHeight)
  renderer.render(game.getSnapshot())
}

window.addEventListener('resize', resize)

// ── Timer ──────────────────────────────────────────────────────────────────────

let timerInterval: ReturnType<typeof setInterval> | null = null

function startTimer(): void {
  if (timerInterval) return
  timerInterval = setInterval(() => {
    game.tickTimer()
    const snap = game.getSnapshot()
    updateHUD(snap)
    if (snap.state === 'GAME_OVER') {
      stopTimer()
      audio.death()
      reportScore(snap.score)
      reportGameOver(snap.score)
      setTimeout(() => showGameOverOverlay(snap), 400)
    }
  }, 1000)
}

function stopTimer(): void {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
}

// ── HUD ────────────────────────────────────────────────────────────────────────

function updateHUD(snap: ReturnType<typeof game.getSnapshot>): void {
  scoreEl.textContent = String(snap.score)
  timerEl.textContent = String(snap.timeLeft)
  comboEl.textContent = `x${snap.combo}`
  const pct = (snap.timeLeft / GAME_DURATION_SEC) * 100
  timerBar.style.width = `${pct}%`
  if (pct < 25) {
    timerBar.style.background = '#ff3b3b'
  } else if (pct < 50) {
    timerBar.style.background = 'linear-gradient(90deg, #ff6b6b, #ffd166)'
  }
}

// ── Score popup ────────────────────────────────────────────────────────────────

function showScorePopup(points: number, combo: number): void {
  if (points <= 0) return
  const popup = document.createElement('div')
  popup.className = 'score-popup'
  const text = combo > 1 ? `+${points} (x${combo})` : `+${points}`
  popup.textContent = text
  // Position near the canvas center
  const rect = canvas.getBoundingClientRect()
  popup.style.left = `${rect.left + rect.width / 2 - 30}px`
  popup.style.top = `${rect.top + rect.height / 2}px`
  document.body.appendChild(popup)
  setTimeout(() => popup.remove(), 950)
}

// ── Cascade processing ─────────────────────────────────────────────────────────

function processCascade(): void {
  const prevCombo = game.getCombo()
  const gained = game.resolveMatches()
  const snap = game.getSnapshot()

  renderer.render(snap)
  updateHUD(snap)

  if (gained > 0) {
    showScorePopup(gained, prevCombo)
    // Higher combo = more exciting sound
    if (prevCombo >= 4) {
      audio.levelUp()
    } else if (prevCombo >= 2) {
      audio.combo()
    } else {
      audio.score()
    }
    try { navigator.vibrate(10) } catch {}
  }

  if (game.isPendingCascade()) {
    // Continue cascade after delay
    cascadeTimeout = setTimeout(processCascade, 350)
  } else {
    cascadeTimeout = null
  }
}

// ── Input ──────────────────────────────────────────────────────────────────────

function handleCanvasClick(x: number, y: number): void {
  if (game.getState() !== 'PLAYING') return
  if (swapAnimActive || cascadeTimeout) return

  const cell = renderer.canvasToCell(x, y)
  if (!cell) return

  const prevSnap = game.getSnapshot()
  const prevSelected = prevSnap.selected

  const changed = game.selectCell(cell.row, cell.col)
  if (!changed) return

  audio.click()
  const snap = game.getSnapshot()
  renderer.render(snap)

  // If a swap was triggered (selected + adjacent click), run swap animation then cascade
  if (prevSelected && snap.swapAnim && !snap.swapAnim.reverse) {
    runSwapAnimation(snap.swapAnim.r1, snap.swapAnim.c1, snap.swapAnim.r2, snap.swapAnim.c2, false)
  } else if (snap.swapAnim && snap.swapAnim.reverse) {
    runSwapAnimation(snap.swapAnim.r1, snap.swapAnim.c1, snap.swapAnim.r2, snap.swapAnim.c2, true)
  }
}

function runSwapAnimation(r1: number, c1: number, r2: number, c2: number, reverse: boolean): void {
  swapAnimActive = true
  swapAnimT = 0

  function step(): void {
    swapAnimT += 1 / SWAP_ANIM_STEPS
    const snap = game.getSnapshot()
    if (snap.swapAnim) {
      // mutate t on snapshot (renderer reads it)
      snap.swapAnim.t = Math.min(1, swapAnimT)
      renderer.render(snap)
    }

    if (swapAnimT < 1) {
      requestAnimationFrame(step)
    } else {
      // Animation done
      game.finishSwapAnimation()
      swapAnimActive = false
      if (!reverse) {
        // Process cascade
        processCascade()
      }
    }
  }

  void r1; void c1; void r2; void c2 // suppress unused
  requestAnimationFrame(step)
}

// Mouse
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  handleCanvasClick((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY)
})

// Touch
let touchStartX = 0
let touchStartY = 0

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const touch = e.touches[0]
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  touchStartX = (touch.clientX - rect.left) * scaleX
  touchStartY = (touch.clientY - rect.top) * scaleY
}, { passive: false })

canvas.addEventListener('touchend', (e) => {
  e.preventDefault()
  const touch = e.changedTouches[0]
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const x = (touch.clientX - rect.left) * scaleX
  const y = (touch.clientY - rect.top) * scaleY
  // Only tap (not swipe)
  const dx = Math.abs(x - touchStartX)
  const dy = Math.abs(y - touchStartY)
  if (dx < 20 && dy < 20) {
    handleCanvasClick(x, y)
  }
}, { passive: false })

// ── Overlay ────────────────────────────────────────────────────────────────────

function clearOverlay(): void {
  while (overlayCard.firstChild) overlayCard.removeChild(overlayCard.firstChild)
}

function showReadyOverlay(): void {
  overlay.classList.remove('hidden')
  clearOverlay()

  const h2 = document.createElement('h2')
  h2.textContent = 'Match-3'
  overlayCard.appendChild(h2)

  const p = document.createElement('p')
  p.textContent = 'Swap adjacent gems to match 3 or more in a row. Chain combos for bonus points. 60 seconds on the clock!'
  overlayCard.appendChild(p)

  const btn = document.createElement('button')
  btn.className = 'btn'
  btn.textContent = 'Play'
  btn.addEventListener('click', () => {
    overlay.classList.add('hidden')
    audio.start()
    game.start()
    startTimer()
    renderer.render(game.getSnapshot())
  })
  overlayCard.appendChild(btn)
}

function showGameOverOverlay(snap: ReturnType<typeof game.getSnapshot>): void {
  overlay.classList.remove('hidden')
  clearOverlay()

  if (snap.score > highScore) {
    highScore = snap.score
    saveHighScore(highScore)
  }

  const h2 = document.createElement('h2')
  h2.textContent = "Time's Up!"
  overlayCard.appendChild(h2)

  const scoreDiv = document.createElement('div')
  scoreDiv.className = 'score-big'
  scoreDiv.textContent = String(snap.score)
  overlayCard.appendChild(scoreDiv)

  const p = document.createElement('p')
  p.textContent = snap.score >= highScore
    ? 'New high score!'
    : `Best: ${highScore}`
  overlayCard.appendChild(p)

  const btn = document.createElement('button')
  btn.className = 'btn'
  btn.textContent = 'Play Again'
  btn.addEventListener('click', () => {
    overlay.classList.add('hidden')
    if (cascadeTimeout) { clearTimeout(cascadeTimeout); cascadeTimeout = null }
    game.reset()
    game.start()
    startTimer()
    updateHUD(game.getSnapshot())
    renderer.render(game.getSnapshot())
  })
  overlayCard.appendChild(btn)
}

// ── Render loop ────────────────────────────────────────────────────────────────

function renderLoop(): void {
  // Only re-render if not in swap animation (swap animation has its own rAF loop)
  if (!swapAnimActive) {
    renderer.render(game.getSnapshot())
  }
  requestAnimationFrame(renderLoop)
}

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  resize()
  requestAnimationFrame(renderLoop)
  showReadyOverlay()
}

void boot()
