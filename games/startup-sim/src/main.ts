// Startup Simulator — main entry point

import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Constants ────────────────────────────────────────────────────────────────

const STARTING_CASH = 10_000
const MAX_MONTHS = 36
const ARPU = 10          // $ per user per month
const CONVERSION = 0.02  // 2% of visitors convert to paying users

// Monthly salaries (also used as one-time signing bonus on hire)
const SALARIES = { dev: 5000, mkt: 4000, sales: 4500 } as const

// ── Types ────────────────────────────────────────────────────────────────────

interface Feature {
  name: string
  monthsLeft: number
  totalMonths: number
  userBoost: number // extra users when complete
}

interface RandomEvent {
  text: string
  effect: string
  apply: (state: GameState) => void
}

interface GameState {
  month: number
  cash: number
  users: number
  mrr: number
  burnRate: number
  team: { devs: number; mkt: number; sales: number }
  marketingSpend: number
  featuresInProgress: Feature[]
  completedFeatures: number
  gameOver: boolean
  won: boolean
}

// ── Feature pool ─────────────────────────────────────────────────────────────

const FEATURE_POOL: Array<{ name: string; months: number; userBoost: number }> = [
  { name: 'Core Dashboard',     months: 2, userBoost: 50  },
  { name: 'Mobile App',         months: 3, userBoost: 120 },
  { name: 'Integrations',       months: 2, userBoost: 80  },
  { name: 'Analytics Module',   months: 2, userBoost: 60  },
  { name: 'API Access',         months: 1, userBoost: 40  },
  { name: 'AI Features',        months: 3, userBoost: 200 },
  { name: 'Team Collab',        months: 2, userBoost: 90  },
  { name: 'White Labeling',     months: 2, userBoost: 70  },
  { name: 'SSO / Enterprise',   months: 3, userBoost: 150 },
  { name: 'Offline Mode',       months: 2, userBoost: 55  },
]

// ── Random event pool ─────────────────────────────────────────────────────────

function buildEventPool(): RandomEvent[] {
  return [
    {
      text: 'TechCrunch feature!',
      effect: '+500 users this month',
      apply: (s) => { s.users += 500 },
    },
    {
      text: 'Server crash — emergency fixes needed.',
      effect: '-$2,000 cash',
      apply: (s) => { s.cash -= 2000 },
    },
    {
      text: 'Key developer quit — they found a FAANG job.',
      effect: '-1 developer',
      apply: (s) => { s.team.devs = Math.max(0, s.team.devs - 1) },
    },
    {
      text: 'Angel investor offers $50,000!',
      effect: '+$50,000 cash',
      apply: (s) => { s.cash += 50_000 },
    },
    {
      text: 'A competitor copied your core feature.',
      effect: '-10% users (churn spike)',
      apply: (s) => { s.users = Math.floor(s.users * 0.9) },
    },
    {
      text: 'Won "Best New SaaS" award.',
      effect: '+200 users from PR',
      apply: (s) => { s.users += 200 },
    },
    {
      text: 'Security vulnerability disclosed.',
      effect: '-$3,000 (audit + patches)',
      apply: (s) => { s.cash -= 3000 },
    },
    {
      text: 'Enterprise deal signed!',
      effect: '+500 users from contract',
      apply: (s) => { s.users += 500 },
    },
    {
      text: 'Market downturn — budgets are being cut.',
      effect: '-8% users (cancellations)',
      apply: (s) => { s.users = Math.floor(s.users * 0.92) },
    },
    {
      text: 'Product Hunt launch — #1 of the day!',
      effect: '+800 users, +$1,000 bonus',
      apply: (s) => { s.users += 800; s.cash += 1000 },
    },
  ]
}

// ── State ────────────────────────────────────────────────────────────────────

let state: GameState = createInitialState()
let nextFeatureIndex = 0
let highScore = 0

function createInitialState(): GameState {
  return {
    month: 1,
    cash: STARTING_CASH,
    users: 0,
    mrr: 0,
    burnRate: 0,
    team: { devs: 0, mkt: 0, sales: 0 },
    marketingSpend: 0,
    featuresInProgress: [],
    completedFeatures: 0,
    gameOver: false,
    won: false,
  }
}

// ── Calculations ──────────────────────────────────────────────────────────────

function calcBurnRate(s: GameState): number {
  const salaries = s.team.devs * SALARIES.dev + s.team.mkt * SALARIES.mkt + s.team.sales * SALARIES.sales
  return salaries + s.marketingSpend
}

function calcMRR(users: number): number {
  return Math.round(users * CONVERSION * ARPU)
}

function calcUserGrowth(s: GameState): number {
  const organic = Math.floor(s.users * 0.05)
  const mktVisitors = Math.floor(s.marketingSpend / 500) * 50
  const salesNew = s.team.sales * 20
  const mktTeamNew = s.team.mkt * 15
  const variance = 0.7 + Math.random() * 0.6
  return Math.round((organic + mktVisitors + salesNew + mktTeamNew) * variance)
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function fmtUsers(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

function updateDashboard(): void {
  const burn = calcBurnRate(state)
  const mrr = calcMRR(state.users)
  state.burnRate = burn
  state.mrr = mrr

  setText('d-mrr', fmt(mrr))
  setText('d-users', fmtUsers(state.users))
  setText('d-cash', fmt(state.cash))
  setText('d-burn', fmt(burn) + '/mo')
  setText('d-month', `${state.month} / ${MAX_MONTHS}`)

  const netMonthly = mrr - burn
  const runway = netMonthly < 0 && state.cash > 0
    ? Math.floor(state.cash / Math.abs(netMonthly))
    : netMonthly >= 0 ? Infinity : 0
  const runwayEl = document.getElementById('d-runway')!
  runwayEl.textContent = runway === Infinity ? 'inf mos' : `${runway} mos`
  runwayEl.style.color = runway < 3 ? '#ff4466' : runway < 6 ? '#ffd700' : '#44ccff'

  const teamAny = state.team.devs + state.team.mkt + state.team.sales > 0
  const teamCard = document.getElementById('team-card')
  if (teamCard) teamCard.style.display = teamAny ? 'block' : 'none'
  setText('team-devs', String(state.team.devs))
  setText('team-mkt', String(state.team.mkt))
  setText('team-sales', String(state.team.sales))

  // Features in progress
  updateFeaturesDisplay()

  // Next feature to build
  const feat = FEATURE_POOL[nextFeatureIndex % FEATURE_POOL.length]
  setText('feature-name', feat.name)
  setText('feature-progress', `${feat.months} month${feat.months !== 1 ? 's' : ''}`)
  const buildBtn = document.getElementById('build-feature-btn') as HTMLButtonElement
  buildBtn.disabled = state.team.devs === 0

  // Hire button states
  ;(document.getElementById('hire-dev') as HTMLButtonElement).disabled = state.cash < SALARIES.dev
  ;(document.getElementById('hire-mkt') as HTMLButtonElement).disabled = state.cash < SALARIES.mkt
  ;(document.getElementById('hire-sales') as HTMLButtonElement).disabled = state.cash < SALARIES.sales
}

function updateFeaturesDisplay(): void {
  const fip = document.getElementById('features-in-progress')
  if (!fip) return
  // Clear existing children safely
  while (fip.firstChild) fip.removeChild(fip.firstChild)

  state.featuresInProgress.forEach(f => {
    const div = document.createElement('div')
    div.className = 'feature-item'
    div.textContent = `${f.name} — ${f.monthsLeft} month${f.monthsLeft !== 1 ? 's' : ''} left`
    fip.appendChild(div)
  })
}

function addLog(text: string): void {
  const container = document.getElementById('log-entries')
  if (!container) return
  const entry = document.createElement('div')
  entry.className = 'log-entry'

  const span = document.createElement('span')
  span.className = 'mo'
  span.textContent = `Mo.${state.month} `
  entry.appendChild(span)
  entry.appendChild(document.createTextNode(text))

  container.insertBefore(entry, container.firstChild)
  // Keep max 20 entries in DOM
  while (container.children.length > 20) {
    const last = container.lastChild
    if (last) container.removeChild(last)
  }
}

function showEvent(evt: RandomEvent): void {
  const card = document.getElementById('event-card')
  if (!card) return
  setText('event-text', evt.text)
  setText('event-effect', evt.effect)
  card.classList.add('visible')
}

function hideEvent(): void {
  document.getElementById('event-card')?.classList.remove('visible')
}

// ── Game over / win ───────────────────────────────────────────────────────────

function endGame(won: boolean): void {
  state.gameOver = true
  state.won = won

  const score = state.mrr * 120
  if (score > highScore) {
    highScore = score
    saveHighScore(highScore)
  }
  reportGameOver(score)

  const actionsCard = document.getElementById('actions-card')
  const advanceBtn = document.getElementById('advance-btn')
  if (actionsCard) actionsCard.style.display = 'none'
  if (advanceBtn) advanceBtn.style.display = 'none'

  const screen = document.getElementById('end-screen')
  if (!screen) return

  if (won && state.mrr >= 100_000) {
    setText('end-title', 'Unicorn!')
    setText('end-subtitle', 'You hit $100K MRR! Acquisition calls incoming...')
    audio.levelUp()
  } else if (won) {
    setText('end-title', 'Acquired!')
    setText('end-subtitle', 'A major player bought your startup!')
    audio.levelUp()
  } else if (state.month > MAX_MONTHS) {
    setText('end-title', "Time's Up")
    setText('end-subtitle', `You survived ${MAX_MONTHS} months`)
    audio.score()
  } else {
    setText('end-title', 'Bankrupt')
    setText('end-subtitle', 'You ran out of cash')
    audio.death()
  }

  setText('end-mrr', fmt(state.mrr) + ' MRR')
  setText('end-score', `Score: ${score.toLocaleString()}`)
  screen.classList.add('visible')
}

// ── Advance month ─────────────────────────────────────────────────────────────

function advanceMonth(): void {
  if (state.gameOver) return
  hideEvent()

  // 1. Process feature builds
  state.featuresInProgress = state.featuresInProgress.filter(f => {
    f.monthsLeft--
    if (f.monthsLeft <= 0) {
      state.users += f.userBoost
      state.completedFeatures++
      addLog(`Feature "${f.name}" launched! +${f.userBoost} users`)
      audio.powerup()
      return false
    }
    return true
  })

  // 2. User growth
  const newUsers = calcUserGrowth(state)
  state.users += newUsers
  if (newUsers > 0) addLog(`+${newUsers} new users from marketing`)

  // 3. Monthly revenue
  const mrr = calcMRR(state.users)
  state.mrr = mrr
  state.cash += mrr
  if (mrr > 0) addLog(`+${fmt(mrr)} MRR collected`)

  // 4. Monthly costs
  const burn = calcBurnRate(state)
  state.cash -= burn
  if (burn > 0) addLog(`-${fmt(burn)} salaries + marketing`)

  // 5. Random event (25% chance)
  if (Math.random() < 0.25) {
    const pool = buildEventPool()
    const evt = pool[Math.floor(Math.random() * pool.length)]
    evt.apply(state)
    showEvent(evt)
    addLog(`Event: ${evt.text}`)
    audio.blip()
  }

  reportScore(Math.max(0, state.mrr * 120))

  state.month++

  if (state.cash <= 0) {
    state.cash = 0
    updateDashboard()
    setTimeout(() => endGame(false), 600)
    return
  }

  if (state.mrr >= 100_000) {
    updateDashboard()
    setTimeout(() => endGame(true), 600)
    return
  }

  if (state.month > MAX_MONTHS) {
    updateDashboard()
    setTimeout(() => endGame(false), 600)
    return
  }

  updateDashboard()
  audio.blip()
}

// ── Reset ─────────────────────────────────────────────────────────────────────

function resetGame(): void {
  state = createInitialState()
  nextFeatureIndex = 0

  const actionsCard = document.getElementById('actions-card')
  const advanceBtn = document.getElementById('advance-btn')
  const endScreen = document.getElementById('end-screen')
  const logEntries = document.getElementById('log-entries')

  if (actionsCard) actionsCard.style.display = 'block'
  if (advanceBtn) advanceBtn.style.display = 'block'
  if (endScreen) endScreen.classList.remove('visible')
  if (logEntries) {
    while (logEntries.firstChild) logEntries.removeChild(logEntries.firstChild)
  }

  hideEvent()

  const mktSlider = document.getElementById('mkt-slider') as HTMLInputElement
  mktSlider.value = '0'
  setText('mkt-value', '$0')

  updateDashboard()
  audio.start()
  addLog('Your startup is born. Time to build something great!')
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  const muteBtn = document.getElementById('mute-btn')!
  muteBtn.addEventListener('click', () => {
    const m = audio.toggleMute()
    muteBtn.textContent = m ? '🔇' : '🔊'
  })

  document.getElementById('hire-dev')!.addEventListener('click', () => {
    if (state.cash < SALARIES.dev) return
    state.cash -= SALARIES.dev
    state.team.devs++
    addLog(`Hired developer — signing bonus paid`)
    audio.click()
    updateDashboard()
  })

  document.getElementById('hire-mkt')!.addEventListener('click', () => {
    if (state.cash < SALARIES.mkt) return
    state.cash -= SALARIES.mkt
    state.team.mkt++
    addLog(`Hired marketer — signing bonus paid`)
    audio.click()
    updateDashboard()
  })

  document.getElementById('hire-sales')!.addEventListener('click', () => {
    if (state.cash < SALARIES.sales) return
    state.cash -= SALARIES.sales
    state.team.sales++
    addLog(`Hired sales rep — signing bonus paid`)
    audio.click()
    updateDashboard()
  })

  const mktSlider = document.getElementById('mkt-slider') as HTMLInputElement
  mktSlider.addEventListener('input', () => {
    const val = parseInt(mktSlider.value)
    state.marketingSpend = val
    const display = val === 0 ? '$0' : `$${(val / 1000).toFixed(1)}K`
    setText('mkt-value', display)
    updateDashboard()
  })

  document.getElementById('build-feature-btn')!.addEventListener('click', () => {
    if (state.team.devs === 0) return
    const featDef = FEATURE_POOL[nextFeatureIndex % FEATURE_POOL.length]
    const feat: Feature = {
      name: featDef.name,
      monthsLeft: featDef.months,
      totalMonths: featDef.months,
      userBoost: featDef.userBoost,
    }
    state.featuresInProgress.push(feat)
    nextFeatureIndex++
    addLog(`Started building "${feat.name}" (${feat.totalMonths} mo)`)
    audio.click()
    updateDashboard()
  })

  document.getElementById('advance-btn')!.addEventListener('click', advanceMonth)
  document.getElementById('restart-btn')!.addEventListener('click', resetGame)

  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  updateDashboard()
  addLog('Your startup is born. Time to build something great!')
}

void boot()
