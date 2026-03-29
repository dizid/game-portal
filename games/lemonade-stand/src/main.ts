// Lemonade Stand — main entry point

import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Constants ────────────────────────────────────────────────────────────────

const TOTAL_DAYS = 30
const STARTING_CASH = 20.0

// Per-cup ingredient cost breakdown
const COST_CUP = 0.02
const COST_LEMON = 0.05
const COST_SUGAR = 0.01
const COST_PER_CUP = COST_CUP + COST_LEMON + COST_SUGAR // 0.08
const COST_SIGN = 0.15

// ── Types ────────────────────────────────────────────────────────────────────

type WeatherType = 'sunny' | 'cloudy' | 'rainy'

interface WeatherDay {
  actual: WeatherType
  forecast: WeatherType // 80% chance of correct
  temp: number // °F
}

interface DayResult {
  cupsMade: number
  cupsSold: number
  revenue: number
  ingredientCost: number
  signCost: number
  profit: number
}

// ── State ────────────────────────────────────────────────────────────────────

let day = 1
let cash = STARTING_CASH
let totalProfit = 0
let profitHistory: number[] = []
let highScore = 0
let gameOver = false

// Pre-generate all weather for the run (player sees forecast for next day)
const weatherSchedule: WeatherDay[] = generateWeatherSchedule()

// ── Weather generation ───────────────────────────────────────────────────────

function generateWeatherSchedule(): WeatherDay[] {
  const types: WeatherType[] = ['sunny', 'cloudy', 'rainy']
  const schedule: WeatherDay[] = []
  for (let i = 0; i < TOTAL_DAYS + 1; i++) {
    const actual = types[Math.floor(Math.random() * types.length)]
    // Forecast is 80% accurate
    const forecast: WeatherType = Math.random() < 0.8 ? actual : types[Math.floor(Math.random() * types.length)]
    const baseTemp = actual === 'sunny' ? 78 + Math.random() * 18
                   : actual === 'cloudy' ? 62 + Math.random() * 16
                   : 52 + Math.random() * 14
    schedule.push({ actual, forecast, temp: Math.round(baseTemp) })
  }
  return schedule
}

// ── Demand calculation ───────────────────────────────────────────────────────

function calcDemand(weather: WeatherDay, price: number, signs: number): number {
  // Base demand from temperature (higher temp = more thirst)
  const tempDemand = Math.max(5, (weather.temp - 40) * 0.8)

  // Weather multiplier
  const weatherMult: Record<WeatherType, number> = { sunny: 1.2, cloudy: 0.8, rainy: 0.4 }
  const mult = weatherMult[weather.actual]

  // Price elasticity — $0.25 is "free", $2.00 kills demand
  // Optimal around $0.50-$0.75
  const priceElasticity = Math.max(0, 1.5 - (price - 0.25) * 0.9)

  // Ad boost from signs
  const adBoost = 1 + signs * 0.08

  const raw = tempDemand * mult * priceElasticity * adBoost
  // Add random variance ±20%
  const variance = 0.8 + Math.random() * 0.4
  return Math.round(raw * variance)
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return '$' + n.toFixed(2)
}

const weatherMeta: Record<WeatherType, { icon: string; label: string }> = {
  sunny:  { icon: '☀️',  label: 'Sunny' },
  cloudy: { icon: '⛅',  label: 'Partly Cloudy' },
  rainy:  { icon: '🌧️', label: 'Rainy' },
}

function updateWeatherDisplay(dayIndex: number): void {
  if (dayIndex >= weatherSchedule.length) return
  const w = weatherSchedule[dayIndex]
  const meta = weatherMeta[w.forecast]
  const icon = document.getElementById('weather-icon')!
  const desc = document.getElementById('weather-desc')!
  const temp = document.getElementById('weather-temp')!
  icon.textContent = meta.icon
  desc.textContent = meta.label
  // Temp description
  const feel = w.temp >= 80 ? 'Hot — great for lemonade!' : w.temp >= 65 ? 'Warm — decent sales expected' : 'Cool — expect fewer customers'
  temp.textContent = `${w.temp}°F — ${feel}`
}

function updateTopBar(): void {
  const dayEl = document.getElementById('stat-day')!
  const cashEl = document.getElementById('stat-cash')!
  const profitEl = document.getElementById('stat-profit')!
  dayEl.textContent = `${day} / ${TOTAL_DAYS}`
  cashEl.textContent = fmt(cash)
  profitEl.textContent = fmt(totalProfit)
  profitEl.style.color = totalProfit >= 0 ? '#00ff88' : '#ff4466'
}

function updateCostDisplays(): void {
  const priceSlider = document.getElementById('price-slider') as HTMLInputElement
  const cupsInput = document.getElementById('cups-input') as HTMLInputElement
  const signsSlider = document.getElementById('signs-slider') as HTMLInputElement

  const price = parseInt(priceSlider.value) / 100
  const cups = Math.max(0, parseInt(cupsInput.value) || 0)
  const signs = parseInt(signsSlider.value)

  const ingCost = cups * COST_PER_CUP
  const signCost = signs * COST_SIGN
  const total = ingCost + signCost

  document.getElementById('price-display')!.textContent = fmt(price)
  document.getElementById('cups-cost')!.textContent = fmt(ingCost)
  document.getElementById('signs-display')!.textContent = `${signs} (${fmt(signCost)})`
  document.getElementById('total-cost-display')!.textContent = `Total cost: ${fmt(total)}`

  const sellBtn = document.getElementById('sell-btn') as HTMLButtonElement
  sellBtn.disabled = total > cash || cups === 0
}

// ── Sparkline ────────────────────────────────────────────────────────────────

function drawSparkline(): void {
  const canvas = document.getElementById('sparkline') as HTMLCanvasElement
  const wrap = document.getElementById('sparkline-wrap')!
  if (profitHistory.length === 0) { wrap.style.display = 'none'; return }
  wrap.style.display = 'block'

  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  if (profitHistory.length < 2) return

  const min = Math.min(...profitHistory)
  const max = Math.max(...profitHistory)
  const range = max - min || 1

  const pad = 4
  const step = (w - pad * 2) / (profitHistory.length - 1)

  // Draw zero line
  const zeroY = pad + (1 - (0 - min) / range) * (h - pad * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, zeroY)
  ctx.lineTo(w - pad, zeroY)
  ctx.stroke()

  // Draw sparkline
  ctx.beginPath()
  profitHistory.forEach((val, i) => {
    const x = pad + i * step
    const y = pad + (1 - (val - min) / range) * (h - pad * 2)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })

  ctx.strokeStyle = '#00ff88'
  ctx.lineWidth = 2
  ctx.stroke()

  // Fill under
  ctx.lineTo(pad + (profitHistory.length - 1) * step, h)
  ctx.lineTo(pad, h)
  ctx.closePath()
  ctx.fillStyle = 'rgba(0,255,136,0.1)'
  ctx.fill()
}

// ── Day result display ───────────────────────────────────────────────────────

function showDayResult(result: DayResult): void {
  const card = document.getElementById('results-card')!
  card.classList.add('visible')

  document.getElementById('r-made')!.textContent = String(result.cupsMade)
  document.getElementById('r-sold')!.textContent = String(result.cupsSold)
  document.getElementById('r-waste')!.textContent = String(result.cupsMade - result.cupsSold)
  document.getElementById('r-revenue')!.textContent = fmt(result.revenue)
  document.getElementById('r-ing-cost')!.textContent = `-${fmt(result.ingredientCost)}`
  document.getElementById('r-sign-cost')!.textContent = `-${fmt(result.signCost)}`

  const profitEl = document.getElementById('r-profit')!
  profitEl.textContent = fmt(result.profit)
  profitEl.className = result.profit >= 0 ? 'positive' : 'negative'
}

// ── End game ─────────────────────────────────────────────────────────────────

function showGameOver(): void {
  gameOver = true
  document.getElementById('controls-section')!.style.display = 'none'
  document.getElementById('gameover-screen')!.classList.add('visible')

  const score = Math.round(totalProfit * 100)
  document.getElementById('final-profit-display')!.textContent = fmt(totalProfit)
  document.getElementById('final-score-display')!.textContent = `Score: ${score.toLocaleString()}`

  if (score > highScore) {
    highScore = score
    saveHighScore(highScore)
  }

  reportGameOver(score)
  audio.levelUp()
}

// ── Sell day ─────────────────────────────────────────────────────────────────

function sellDay(): void {
  if (gameOver) return

  const priceSlider = document.getElementById('price-slider') as HTMLInputElement
  const cupsInput = document.getElementById('cups-input') as HTMLInputElement
  const signsSlider = document.getElementById('signs-slider') as HTMLInputElement

  const price = parseInt(priceSlider.value) / 100
  const cupsMade = Math.max(0, parseInt(cupsInput.value) || 0)
  const signs = parseInt(signsSlider.value)

  if (cupsMade === 0) return

  const ingCost = cupsMade * COST_PER_CUP
  const signCost = signs * COST_SIGN
  const totalCost = ingCost + signCost

  if (totalCost > cash) return

  // Deduct costs
  cash -= totalCost

  // Run the day
  const todayWeather = weatherSchedule[day - 1]
  const demand = calcDemand(todayWeather, price, signs)
  const cupsSold = Math.min(cupsMade, demand)
  const revenue = cupsSold * price
  const profit = revenue - totalCost

  cash += revenue
  totalProfit += profit
  profitHistory.push(profit)

  const result: DayResult = {
    cupsMade, cupsSold, revenue,
    ingredientCost: ingCost,
    signCost,
    profit,
  }

  showDayResult(result)
  drawSparkline()

  const score = Math.round(totalProfit * 100)
  reportScore(Math.max(0, score))

  // Audio feedback
  if (profit > 0) audio.score()
  else audio.blip()

  updateTopBar()

  day++

  if (day > TOTAL_DAYS) {
    setTimeout(showGameOver, 800)
    return
  }

  // Show next day weather forecast
  updateWeatherDisplay(day - 1)
  updateTopBar()
  updateCostDisplays()
}

// ── Reset ────────────────────────────────────────────────────────────────────

function resetGame(): void {
  day = 1
  cash = STARTING_CASH
  totalProfit = 0
  profitHistory = []
  gameOver = false

  // Regenerate weather
  weatherSchedule.splice(0, weatherSchedule.length, ...generateWeatherSchedule())

  document.getElementById('results-card')!.classList.remove('visible')
  document.getElementById('gameover-screen')!.classList.remove('visible')
  document.getElementById('controls-section')!.style.display = 'block'
  document.getElementById('sparkline-wrap')!.style.display = 'none'

  updateTopBar()
  updateWeatherDisplay(0)
  updateCostDisplays()
  audio.start()
}

// ── Boot ─────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  // Wire mute button
  const muteBtn = document.getElementById('mute-btn')!
  muteBtn.addEventListener('click', () => {
    const m = audio.toggleMute()
    muteBtn.textContent = m ? '🔇' : '🔊'
  })

  // Wire controls
  const priceSlider = document.getElementById('price-slider') as HTMLInputElement
  const cupsInput = document.getElementById('cups-input') as HTMLInputElement
  const signsSlider = document.getElementById('signs-slider') as HTMLInputElement

  priceSlider.addEventListener('input', updateCostDisplays)
  cupsInput.addEventListener('input', updateCostDisplays)
  signsSlider.addEventListener('input', updateCostDisplays)

  document.getElementById('sell-btn')!.addEventListener('click', () => {
    audio.click()
    sellDay()
  })

  document.getElementById('restart-btn')!.addEventListener('click', () => {
    audio.start()
    resetGame()
  })

  // Init SDK
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  updateTopBar()
  updateWeatherDisplay(0) // Show forecast for day 1
  updateCostDisplays()
}

void boot()
