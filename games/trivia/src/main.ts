// Trivia — main entry point

import { TriviaGame } from './game.js'
import { initSDK, reportScore, reportGameOver, saveHighScore, requestMidrollAd } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── DOM refs ──────────────────────────────────────────────────────────────────

const overlayReady = document.getElementById('overlay-ready') as HTMLDivElement
const overlayGameover = document.getElementById('overlay-gameover') as HTMLDivElement
const btnStart = document.getElementById('btn-start') as HTMLButtonElement
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement

const hudQ = document.getElementById('hud-q') as HTMLSpanElement
const hudScore = document.getElementById('hud-score') as HTMLSpanElement
const hudBest = document.getElementById('hud-best') as HTMLSpanElement

const categoryBadge = document.getElementById('category-badge') as HTMLDivElement
const timerFill = document.getElementById('timer-fill') as HTMLDivElement
const questionMeta = document.getElementById('question-meta') as HTMLDivElement
const questionText = document.getElementById('question-text') as HTMLDivElement
const streakBanner = document.getElementById('streak-banner') as HTMLDivElement
const optionBtns = [0, 1, 2, 3].map((i) => document.getElementById(`opt-${i}`) as HTMLButtonElement)
const optionTexts = optionBtns.map((btn) => btn.querySelector('.opt-text') as HTMLSpanElement)

const finalScoreDisplay = document.getElementById('final-score-display') as HTMLDivElement
const statCorrect = document.getElementById('stat-correct') as HTMLDivElement
const statAccuracy = document.getElementById('stat-accuracy') as HTMLDivElement
const statStreak = document.getElementById('stat-streak') as HTMLDivElement
const statBest = document.getElementById('stat-best') as HTMLDivElement

// ── State ─────────────────────────────────────────────────────────────────────

const game = new TriviaGame()
let highScore = 0
let timerInterval: ReturnType<typeof setInterval> | null = null
let nextQuestionTimeout: ReturnType<typeof setTimeout> | null = null

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer(): void {
  stopTimer()
  timerInterval = setInterval(() => {
    game.tickTimer()
    updateUI()
    if (game.getState() === 'ANSWERED') {
      stopTimer()
      scheduleNextQuestion()
    }
  }, 1000)
}

function stopTimer(): void {
  if (timerInterval !== null) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

function scheduleNextQuestion(): void {
  if (nextQuestionTimeout !== null) return
  nextQuestionTimeout = setTimeout(() => {
    nextQuestionTimeout = null
    game.nextQuestion()
    updateUI()

    const state = game.getState()
    if (state === 'PLAYING') {
      startTimer()
    } else if (state === 'GAME_OVER') {
      handleGameOver()
    }
  }, 1800) // show result for 1.8s before advancing
}

// ── UI update ─────────────────────────────────────────────────────────────────

function updateUI(): void {
  const snap = game.getSnapshot()

  // Overlays
  overlayReady.classList.toggle('hidden', snap.state !== 'READY')
  overlayGameover.classList.toggle('hidden', snap.state !== 'GAME_OVER')

  if (snap.state === 'READY' || snap.state === 'GAME_OVER') return

  // HUD
  hudQ.textContent = String(snap.questionIndex + 1)
  hudScore.textContent = String(snap.score)
  hudBest.textContent = String(highScore)

  // Timer bar
  timerFill.style.width = `${snap.timerPct}%`
  timerFill.classList.toggle('warning', snap.timeLeft <= 5)

  if (snap.question) {
    categoryBadge.textContent = snap.question.category
    questionMeta.textContent = `Question ${snap.questionIndex + 1} of ${snap.totalQuestions}`
    questionText.textContent = snap.question.question

    // Option buttons
    snap.question.options.forEach((text, i) => {
      optionTexts[i].textContent = text
      optionBtns[i].disabled = snap.state === 'ANSWERED'

      // Reset classes
      optionBtns[i].classList.remove('correct', 'wrong', 'reveal')

      if (snap.state === 'ANSWERED') {
        if (i === snap.question!.correctIndex) {
          optionBtns[i].classList.add(snap.selectedIndex === i ? 'correct' : 'reveal')
        } else if (i === snap.selectedIndex && !snap.isCorrect) {
          optionBtns[i].classList.add('wrong')
        }
      }
    })
  }

  // Streak banner
  if (snap.streak >= 2) {
    streakBanner.textContent = `${snap.streak}x Streak!`
  } else if (snap.state === 'ANSWERED' && snap.isCorrect === false) {
    streakBanner.textContent = snap.timeLeft === 0 ? "Time's up!" : 'Wrong!'
  } else {
    streakBanner.textContent = ''
  }
}

function handleGameOver(): void {
  const snap = game.getSnapshot()
  const score = snap.score

  if (score > highScore) {
    highScore = score
    saveHighScore(highScore)
  }

  reportGameOver(score)

  // Show midroll between rounds
  void requestMidrollAd()

  // Populate results overlay
  finalScoreDisplay.textContent = `${score} pts`
  statCorrect.textContent = String(snap.stats.correct)
  const accuracy = snap.stats.total > 0
    ? Math.round((snap.stats.correct / snap.stats.total) * 100)
    : 0
  statAccuracy.textContent = `${accuracy}%`
  statStreak.textContent = String(snap.stats.bestStreak)
  statBest.textContent = String(highScore)
}

// ── Events ────────────────────────────────────────────────────────────────────

btnStart.addEventListener('click', () => {
  game.start()
  updateUI()
  startTimer()
})

btnRestart.addEventListener('click', () => {
  stopTimer()
  if (nextQuestionTimeout !== null) {
    clearTimeout(nextQuestionTimeout)
    nextQuestionTimeout = null
  }
  game.reset()
  game.start()
  updateUI()
  startTimer()
})

optionBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => {
    if (game.getState() !== 'PLAYING') return
    stopTimer()
    game.selectAnswer(i)
    reportScore(game.getScore())
    updateUI()
    scheduleNextQuestion()
  })
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
    hudBest.textContent = String(highScore)
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  updateUI()
}

void boot()
