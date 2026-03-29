// Reaction Timer — main entry: DOM, input, timing

import {
  createGame, beginGame, turnGreen, playerTap, getAvgMs,
} from './game.js'
import type { ReactionGame, RoundResult } from './game.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── DOM refs ──────────────────────────────────────────────────────────────────

const gameContainer = document.getElementById('game-container') as HTMLDivElement
const startOverlay  = document.getElementById('start-overlay') as HTMLDivElement
const finalOverlay  = document.getElementById('final-overlay') as HTMLDivElement
const startBtn      = document.getElementById('start-btn') as HTMLButtonElement
const historyEl     = document.getElementById('history') as HTMLDivElement
const resultMsEl    = document.getElementById('result-ms') as HTMLDivElement
const statusTextEl  = document.getElementById('status-text') as HTMLDivElement
const subTextEl     = document.getElementById('sub-text') as HTMLDivElement

// ── State ─────────────────────────────────────────────────────────────────────

let game: ReactionGame = createGame()
let bestScore = 0
let greenTimer: ReturnType<typeof setTimeout> | null = null

// ── Utility ───────────────────────────────────────────────────────────────────

function msClass(ms: number): string {
  if (ms < 250) return 'fast'
  if (ms < 400) return 'ok'
  return 'slow'
}

function clearGreenTimer(): void {
  if (greenTimer !== null) { clearTimeout(greenTimer); greenTimer = null }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderHistory(): void {
  historyEl.textContent = ''
  for (let i = 0; i < game.totalRounds; i++) {
    const dot = document.createElement('div')
    dot.className = 'round-dot'

    if (i < game.results.length) {
      const r = game.results[i]
      dot.classList.add(r.grade)
      dot.textContent = String(r.ms)
      if (r.ms >= 100) dot.style.fontSize = '8px'
    } else if (i === game.currentRound - 1 && game.state === 'PLAYING') {
      dot.classList.add('current')
      dot.textContent = String(i + 1)
    } else {
      dot.textContent = String(i + 1)
    }

    historyEl.appendChild(dot)
  }
}

function setContainerState(s: string): void {
  gameContainer.className = `state-${s}`
}

function renderRoundState(): void {
  const { roundState, results, currentRound, totalRounds } = game

  renderHistory()

  if (roundState === 'WAITING') {
    setContainerState('waiting')
    resultMsEl.className = 'ms-hidden'
    resultMsEl.textContent = '---'
    statusTextEl.textContent = 'Wait for green...'
    subTextEl.textContent = `Round ${currentRound} of ${totalRounds}`
  } else if (roundState === 'READY') {
    setContainerState('ready')
    resultMsEl.className = 'ms-hidden'
    statusTextEl.textContent = 'TAP NOW!'
    subTextEl.textContent = ''
  } else if (roundState === 'EARLY') {
    setContainerState('early')
    resultMsEl.className = 'ms-hidden'
    statusTextEl.textContent = 'Too early! Tap to retry'
    subTextEl.textContent = `Round ${currentRound} of ${totalRounds}`
  } else if (roundState === 'RESULT') {
    const last = results[results.length - 1]
    setContainerState('result')
    resultMsEl.textContent = `${last.ms}ms`
    resultMsEl.className = `ms-${last.grade}`

    const isLast = results.length >= totalRounds
    if (isLast) {
      statusTextEl.textContent = 'All done!'
      subTextEl.textContent = `Avg: ${getAvgMs(game)}ms`
    } else {
      statusTextEl.textContent = 'Tap to continue'
      subTextEl.textContent = `Avg so far: ${getAvgMs(game)}ms`
    }
  }
}

// ── Green light scheduling ─────────────────────────────────────────────────────

function scheduleGreen(): void {
  clearGreenTimer()
  if (game.roundState !== 'WAITING') return
  greenTimer = setTimeout(() => {
    game = turnGreen(game, Date.now())
    renderRoundState()
  }, game.delayMs)
}

// ── Input ─────────────────────────────────────────────────────────────────────

function handleTap(): void {
  if (game.state === 'DONE') return
  if (game.state !== 'PLAYING') return

  const { updated, result, early } = playerTap(game, Date.now())
  game = updated

  if (early) {
    clearGreenTimer()
    renderRoundState()
    // Brief pause then restart round
    setTimeout(() => {
      if (game.roundState === 'EARLY') {
        // Reset round to waiting
        game = { ...game, roundState: 'WAITING', greenAt: null, waitStartedAt: Date.now() }
        renderRoundState()
        scheduleGreen()
      }
    }, 1200)
    return
  }

  if (result) {
    clearGreenTimer()
    renderRoundState()

    if (game.state === 'DONE') {
      handleGameDone()
    }
    // else: wait for next tap to advance
    return
  }

  // Tap during RESULT → advance to next round
  if (game.roundState === 'WAITING') {
    renderRoundState()
    scheduleGreen()
  }
}

gameContainer.addEventListener('click', handleTap)
gameContainer.addEventListener('touchend', (e) => {
  e.preventDefault()
  handleTap()
}, { passive: false })

// ── Game done ─────────────────────────────────────────────────────────────────

function handleGameDone(): void {
  const score = game.finalScore
  reportScore(score)
  reportGameOver(score)

  if (score > bestScore) {
    bestScore = score
    saveBestScore(score)
  }

  renderRoundState()

  setTimeout(() => showFinalOverlay(), 800)
}

function showFinalOverlay(): void {
  finalOverlay.textContent = ''

  const title = document.createElement('div')
  title.className = 'final-title'
  title.textContent = 'Results'
  finalOverlay.appendChild(title)

  const avgStat = document.createElement('div')
  avgStat.className = 'final-stat'
  const avgEl = document.createElement('strong')
  avgEl.textContent = `${getAvgMs(game)}ms`
  avgStat.textContent = 'Average: '
  avgStat.appendChild(avgEl)
  finalOverlay.appendChild(avgStat)

  const scoreStat = document.createElement('div')
  scoreStat.className = 'final-stat'
  const scoreStrong = document.createElement('strong')
  scoreStrong.textContent = String(game.finalScore)
  scoreStat.textContent = 'Score: '
  scoreStat.appendChild(scoreStrong)
  finalOverlay.appendChild(scoreStat)

  // History row
  const histRow = document.createElement('div')
  histRow.className = 'history-row'
  game.results.forEach((r: RoundResult, i: number) => {
    const pill = document.createElement('span')
    pill.className = `hist-pill ${r.grade}`
    pill.textContent = `${i + 1}: ${r.ms}ms`
    histRow.appendChild(pill)
  })
  finalOverlay.appendChild(histRow)

  if (game.finalScore >= bestScore && game.finalScore > 0) {
    const bestLabel = document.createElement('div')
    bestLabel.className = 'final-stat'
    bestLabel.style.color = '#f5c542'
    bestLabel.textContent = 'New Best!'
    finalOverlay.appendChild(bestLabel)
  }

  const btn = document.createElement('button')
  btn.className = 'overlay-btn'
  btn.textContent = 'Play Again'
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    startNewGame()
  })
  finalOverlay.appendChild(btn)

  finalOverlay.classList.remove('hidden')
}

// ── New game ──────────────────────────────────────────────────────────────────

function startNewGame(): void {
  clearGreenTimer()
  finalOverlay.classList.add('hidden')
  startOverlay.classList.add('hidden')
  game = beginGame()
  renderRoundState()
  scheduleGreen()
}

// ── Start btn ─────────────────────────────────────────────────────────────────

startBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  startNewGame()
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const result = await initSDK()
    bestScore = result.bestScore
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  startOverlay.classList.remove('hidden')
}

void boot()
