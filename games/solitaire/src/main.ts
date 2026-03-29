// Solitaire — entry point. Wires game logic, renderer, input, and SDK.

import { SolitaireGame } from './game.js'
import type { PileId } from './game.js'
import { SolitaireRenderer } from './renderer.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── DOM refs ──────────────────────────────────────────────────────────────────

const canvas        = document.getElementById('game-canvas') as HTMLCanvasElement
const scoreEl       = document.getElementById('score-value') as HTMLSpanElement
const timerEl       = document.getElementById('timer-value') as HTMLSpanElement
const highScoreEl   = document.getElementById('high-score-value') as HTMLSpanElement

const overlayReady    = document.getElementById('overlay-ready') as HTMLDivElement
const overlayWin      = document.getElementById('overlay-win') as HTMLDivElement
const overlayGameOver = document.getElementById('overlay-gameover') as HTMLDivElement

const btnStart       = document.getElementById('btn-start') as HTMLButtonElement
const btnNewGameWin  = document.getElementById('btn-newgame-win') as HTMLButtonElement
const btnNewGameOver = document.getElementById('btn-newgame-over') as HTMLButtonElement

const winScoreEl         = document.getElementById('win-score') as HTMLDivElement
const winMsgEl           = document.getElementById('win-msg') as HTMLParagraphElement
const gameoverScoreMsgEl = document.getElementById('gameover-score-msg') as HTMLParagraphElement

// ── State ─────────────────────────────────────────────────────────────────────

const game     = new SolitaireGame()
const renderer = new SolitaireRenderer(canvas)
let highScore  = 0
let rafId      = 0

// ── Layout ────────────────────────────────────────────────────────────────────

function resizeCanvas(): void {
  const container = document.getElementById('game-container') as HTMLDivElement
  const hudH = (document.getElementById('hud') as HTMLDivElement).offsetHeight
  const w    = container.clientWidth
  const h    = container.clientHeight - hudH
  renderer.resize(w, h)
}

// ── Render loop ───────────────────────────────────────────────────────────────

function renderFrame(): void {
  const snap = game.getSnapshot()
  renderer.render(snap)

  // Update HUD
  scoreEl.textContent = String(snap.score)
  const m = Math.floor(snap.elapsedSec / 60)
  const s = snap.elapsedSec % 60
  timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`

  rafId = requestAnimationFrame(renderFrame)
}

// ── Input handling ────────────────────────────────────────────────────────────

function handlePointerDown(px: number, py: number): void {
  const snap = game.getSnapshot()
  if (snap.state !== 'PLAYING') return

  const hit = renderer.hitTest(snap, px, py)
  if (!hit) {
    // Click outside everything — deselect
    return
  }

  const { pile, cardIndex } = hit

  // Stock: draw
  if (pile === 'stock') {
    game.drawFromStock()
    return
  }

  // If there's already a selection, try to move to the tapped pile
  if (snap.selection) {
    const moved = game.moveTo(pile)
    if (moved) {
      checkGameState()
      reportScore(game.getScore())
      return
    }
  }

  // Otherwise select
  if (pile !== 'stock') {
    game.select(pile, cardIndex)
  }
}

function checkGameState(): void {
  const snap = game.getSnapshot()
  if (snap.state === 'WON') {
    handleWin(snap.score)
  }
}

function handleWin(score: number): void {
  cancelAnimationFrame(rafId)
  renderer.render(game.getSnapshot())

  if (score > highScore) {
    highScore = score
    highScoreEl.textContent = String(highScore)
    saveHighScore(highScore)
  }

  winScoreEl.textContent = String(score)
  winMsgEl.textContent   = `Best: ${highScore}`
  reportGameOver(score)
  overlayWin.classList.remove('hidden')
}

// ── Touch / mouse events ──────────────────────────────────────────────────────

canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  e.preventDefault()
  const rect = canvas.getBoundingClientRect()
  handlePointerDown(e.clientX - rect.left, e.clientY - rect.top)
})

// Double-tap: auto-move to foundation
canvas.addEventListener('dblclick', (e: MouseEvent) => {
  const snap = game.getSnapshot()
  if (snap.state !== 'PLAYING') return
  const rect = canvas.getBoundingClientRect()
  const hit  = renderer.hitTest(snap, e.clientX - rect.left, e.clientY - rect.top)
  if (!hit) return

  const { pile } = hit
  if (pile === 'waste' || (typeof pile === 'object' && 'tableau' in pile)) {
    game.autoFoundation(pile as PileId)
    checkGameState()
    reportScore(game.getScore())
  }
})

// ── Buttons ───────────────────────────────────────────────────────────────────

function startNewGame(): void {
  cancelAnimationFrame(rafId)
  overlayReady.classList.add('hidden')
  overlayWin.classList.add('hidden')
  overlayGameOver.classList.add('hidden')
  game.deal()
  rafId = requestAnimationFrame(renderFrame)
}

btnStart.addEventListener('click', startNewGame)
btnNewGameWin.addEventListener('click', startNewGame)
btnNewGameOver.addEventListener('click', startNewGame)

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  resizeCanvas()
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  resizeCanvas()
  overlayReady.classList.remove('hidden')

  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
    highScoreEl.textContent = String(highScore)
  } catch (err) {
    console.warn('SDK init failed, running in standalone mode:', err)
  }
}

void boot()
