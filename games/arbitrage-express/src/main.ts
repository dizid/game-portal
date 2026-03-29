import { audio } from './audio'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Types ─────────────────────────────────────────────────────────────────────

type GoodName = 'Grain' | 'Electronics' | 'Textiles' | 'Fuel'

interface Good {
  name: GoodName
  price: number
  basePrice: number
  color: string
  emoji: string
}

interface City {
  name: string
  x: number
  y: number
  goods: Good[]
  color: string
  emoji: string
  connections: number[] // adjacent city indices
}

interface CargoItem {
  good: GoodName
  qty: number
  boughtAt: number // price when bought
}

interface MarketEvent {
  name: string
  description: string
  effect: (cities: City[]) => void
  color: string
}

type GamePhase = 'start' | 'playing' | 'gameover'
type UITab = 'buy' | 'sell' | 'travel'

interface GameState {
  phase: GamePhase
  turn: number
  money: number
  bestScore: number
  playerCity: number
  cargo: CargoItem[]
  cargoCapacity: number
  cities: City[]
  tab: UITab
  message: string
  lastEvent: string
  selectedGood: GoodName | null
  selectedQty: number
  travelTarget: number | null
  priceHistory: number[][]  // [cityIdx][turnIdx] for Grain only, for sparkline
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 700
const CANVAS_H = 580
const TOTAL_TURNS = 30
const CARGO_CAPACITY = 10
const STARTING_MONEY = 500

const GOOD_NAMES: GoodName[] = ['Grain', 'Electronics', 'Textiles', 'Fuel']
const GOOD_BASE_PRICES: Record<GoodName, number> = {
  Grain: 30, Electronics: 120, Textiles: 55, Fuel: 80,
}
const GOOD_COLORS: Record<GoodName, string> = {
  Grain: '#ffd166', Electronics: '#60a5fa', Textiles: '#f0abfc', Fuel: '#fb923c',
}
const GOOD_EMOJIS: Record<GoodName, string> = {
  Grain: '🌾', Electronics: '💻', Textiles: '🧵', Fuel: '⛽',
}

// ── Resize ────────────────────────────────────────────────────────────────────

function resize() {
  const container = document.getElementById('game-container')!
  const cw = container.clientWidth
  const ch = container.clientHeight
  const scale = Math.min(cw / CANVAS_W, ch / CANVAS_H)
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  canvas.style.width = `${CANVAS_W * scale}px`
  canvas.style.height = `${CANVAS_H * scale}px`
}
window.addEventListener('resize', resize)
resize()

// ── City/Map Setup ────────────────────────────────────────────────────────────

function makeGood(name: GoodName, variance: number): Good {
  const base = GOOD_BASE_PRICES[name]
  const price = Math.round(base * (0.5 + variance + Math.random() * 0.5))
  return {
    name, price, basePrice: base,
    color: GOOD_COLORS[name],
    emoji: GOOD_EMOJIS[name],
  }
}

function makeCities(): City[] {
  const defs = [
    { name: 'Port City',     x: 90,  y: 130, color: '#60a5fa', emoji: '⚓', connections: [1, 2] },
    { name: 'Tech Hub',      x: 300, y: 80,  color: '#a78bfa', emoji: '🏙️', connections: [0, 2, 3] },
    { name: 'Farm Valley',   x: 160, y: 290, color: '#4ade80', emoji: '🌾', connections: [0, 1, 4] },
    { name: 'Gold Market',   x: 500, y: 160, color: '#ffd166', emoji: '🏛️', connections: [1, 4] },
    { name: 'Desert Depot',  x: 420, y: 340, color: '#fb923c', emoji: '🏜️', connections: [2, 3] },
  ]

  // Each city has biased prices
  const variances: Record<string, Record<GoodName, number>> = {
    'Port City':    { Grain: 0.3, Electronics: 0.5, Textiles: 0.6, Fuel: 0.2 },
    'Tech Hub':     { Grain: 0.4, Electronics: 0.1, Textiles: 0.5, Fuel: 0.4 },
    'Farm Valley':  { Grain: 0.1, Electronics: 0.6, Textiles: 0.4, Fuel: 0.5 },
    'Gold Market':  { Grain: 0.5, Electronics: 0.3, Textiles: 0.2, Fuel: 0.4 },
    'Desert Depot': { Grain: 0.6, Electronics: 0.4, Textiles: 0.3, Fuel: 0.1 },
  }

  return defs.map(d => ({
    ...d,
    goods: GOOD_NAMES.map(g => makeGood(g, variances[d.name][g])),
  }))
}

const MARKET_EVENTS: MarketEvent[] = [
  {
    name: 'Drought',
    description: 'Grain prices spike everywhere!',
    color: '#fbbf24',
    effect: (cities) => {
      cities.forEach(c => {
        const g = c.goods.find(g => g.name === 'Grain')
        if (g) g.price = Math.round(g.price * (1.5 + Math.random() * 0.5))
      })
    },
  },
  {
    name: 'Tech Boom',
    description: 'Electronics demand surges!',
    color: '#60a5fa',
    effect: (cities) => {
      cities.forEach(c => {
        const g = c.goods.find(g => g.name === 'Electronics')
        if (g) g.price = Math.round(g.price * (1.4 + Math.random() * 0.4))
      })
    },
  },
  {
    name: 'Fuel Embargo',
    description: 'Fuel prices double!',
    color: '#ef4444',
    effect: (cities) => {
      cities.forEach(c => {
        const g = c.goods.find(g => g.name === 'Fuel')
        if (g) g.price = Math.round(g.price * (1.8 + Math.random() * 0.6))
      })
    },
  },
  {
    name: 'Trade Fair',
    description: 'Textiles prices crash!',
    color: '#f0abfc',
    effect: (cities) => {
      cities.forEach(c => {
        const g = c.goods.find(g => g.name === 'Textiles')
        if (g) g.price = Math.round(g.price * (0.4 + Math.random() * 0.2))
      })
    },
  },
  {
    name: 'Market Rebound',
    description: 'All prices normalize.',
    color: '#4ade80',
    effect: (cities) => {
      cities.forEach(c => {
        c.goods.forEach(g => {
          g.price = Math.round(GOOD_BASE_PRICES[g.name] * (0.7 + Math.random() * 0.6))
        })
      })
    },
  },
]

// ── State ─────────────────────────────────────────────────────────────────────

let gs: GameState = makeInitialState()

function makeInitialState(): GameState {
  return {
    phase: 'start',
    turn: 1,
    money: STARTING_MONEY,
    bestScore: 0,
    playerCity: 0,
    cargo: [],
    cargoCapacity: CARGO_CAPACITY,
    cities: makeCities(),
    tab: 'buy',
    message: '',
    lastEvent: '',
    selectedGood: null,
    selectedQty: 1,
    travelTarget: null,
    priceHistory: Array(5).fill(0).map(() => []),
  }
}

function startGame() {
  const c = makeCities()
  gs = {
    ...makeInitialState(),
    phase: 'playing',
    bestScore: gs.bestScore,
    cities: c,
    priceHistory: c.map(city => [city.goods[0].price]),
  }
  audio.start()
}

// ── Price Fluctuation ─────────────────────────────────────────────────────────

function fluctuatePrices() {
  for (const city of gs.cities) {
    for (const good of city.goods) {
      const change = (Math.random() - 0.5) * 0.12
      good.price = Math.max(5, Math.round(good.price * (1 + change)))
      // Drift back to base
      const drift = (good.basePrice - good.price) * 0.05
      good.price = Math.round(good.price + drift)
    }
  }
  // Update history
  gs.cities.forEach((city, i) => {
    gs.priceHistory[i].push(city.goods[0].price)
    if (gs.priceHistory[i].length > 15) gs.priceHistory[i].shift()
  })
}

function maybeMarketEvent() {
  if (gs.turn % 5 === 0) {
    const event = MARKET_EVENTS[Math.floor(Math.random() * MARKET_EVENTS.length)]
    event.effect(gs.cities)
    gs.lastEvent = `EVENT: ${event.name} — ${event.description}`
    audio.powerup()
  }
}

// ── Trade Logic ───────────────────────────────────────────────────────────────

function cargoSlots(): number {
  return gs.cargo.reduce((a, c) => a + c.qty, 0)
}

function buyGood(goodName: GoodName, qty: number) {
  const city = gs.cities[gs.playerCity]
  const good = city.goods.find(g => g.name === goodName)
  if (!good) return
  const totalCost = good.price * qty
  const used = cargoSlots()
  if (used + qty > gs.cargoCapacity) { gs.message = 'Not enough cargo space!'; return }
  if (totalCost > gs.money) { gs.message = 'Not enough money!'; return }
  gs.money -= totalCost
  const existing = gs.cargo.find(c => c.good === goodName)
  if (existing) {
    // Weighted avg buy price
    const totalQty = existing.qty + qty
    existing.boughtAt = Math.round((existing.boughtAt * existing.qty + good.price * qty) / totalQty)
    existing.qty = totalQty
  } else {
    gs.cargo.push({ good: goodName, qty, boughtAt: good.price })
  }
  gs.message = `Bought ${qty}x ${goodName} @ $${good.price}`
  audio.blip()
  advanceTurn()
}

function sellGood(goodName: GoodName, qty: number) {
  const city = gs.cities[gs.playerCity]
  const good = city.goods.find(g => g.name === goodName)
  if (!good) return
  const cargoItem = gs.cargo.find(c => c.good === goodName)
  if (!cargoItem || cargoItem.qty < qty) { gs.message = "You don't have that much!"; return }
  const revenue = good.price * qty
  const profit = (good.price - cargoItem.boughtAt) * qty
  gs.money += revenue
  cargoItem.qty -= qty
  if (cargoItem.qty <= 0) gs.cargo = gs.cargo.filter(c => c.good !== goodName)
  gs.message = `Sold ${qty}x ${goodName} @ $${good.price} (profit: ${profit >= 0 ? '+' : ''}$${profit})`
  if (profit > 0) audio.score()
  else audio.blip()
  advanceTurn()
}

function travelTo(cityIdx: number) {
  const city = gs.cities[gs.playerCity]
  if (!city.connections.includes(cityIdx)) { gs.message = 'Not adjacent!'; return }
  gs.playerCity = cityIdx
  gs.message = `Traveled to ${gs.cities[cityIdx].name}`
  audio.blip()
  advanceTurn()
}

function advanceTurn() {
  gs.turn++
  fluctuatePrices()
  maybeMarketEvent()
  if (gs.turn > TOTAL_TURNS) {
    endGame()
  }
}

function endGame() {
  // Liquidate cargo at current city prices
  let liquidValue = 0
  const city = gs.cities[gs.playerCity]
  for (const item of gs.cargo) {
    const good = city.goods.find(g => g.name === item.good)
    if (good) liquidValue += good.price * item.qty
  }
  const finalScore = Math.round(gs.money + liquidValue)
  if (finalScore > gs.bestScore) {
    gs.bestScore = finalScore
    saveBestScore(finalScore)
  }
  reportGameOver(finalScore)
  gs.phase = 'gameover'
  audio.levelUp()
}

// ── Draw ──────────────────────────────────────────────────────────────────────

function drawRoundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  bg.addColorStop(0, '#0a0d14')
  bg.addColorStop(1, '#0d1117')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  if (gs.phase === 'start') { drawStart(); return }
  if (gs.phase === 'gameover') { drawGameOver(); return }

  drawHeader()
  drawMap()
  drawTradePanel()
}

function drawStart() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd166'
  ctx.font = 'bold 36px monospace'
  ctx.fillText('Arbitrage Express', CANVAS_W / 2, 140)
  ctx.font = '14px monospace'
  ctx.fillStyle = '#94a3b8'
  const lines = [
    'Trade goods across 5 cities in 30 turns.',
    'Buy low, sell high — earn maximum profit!',
    '',
    'Click city: travel there (adjacent only)',
    'Buy/Sell tabs: trade goods at current city',
    '',
    'Every 5 turns: market event shocks prices.',
    'Cargo van holds 10 units.',
    'Score = final net worth.',
  ]
  lines.forEach((l, i) => ctx.fillText(l, CANVAS_W / 2, 196 + i * 26))
  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 110, 160, 50, 10)
  ctx.fillStyle = '#d97706'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('Play', CANVAS_W / 2, CANVAS_H - 78)
}

function drawHeader() {
  ctx.fillStyle = '#1a1208'
  drawRoundRect(10, 10, CANVAS_W - 20, 44, 8)
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.fillText(`Turn ${gs.turn}/${TOTAL_TURNS}`, 20, 30)
  ctx.fillStyle = '#ffd166'
  ctx.font = 'bold 15px monospace'
  ctx.fillText(`$${gs.money}`, 90, 30)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.fillText(`at ${gs.cities[gs.playerCity].name}`, 90, 46)

  // Cargo
  const used = cargoSlots()
  ctx.textAlign = 'right'
  ctx.fillStyle = '#64748b'
  ctx.font = '11px monospace'
  ctx.fillText(`Cargo: ${used}/${gs.cargoCapacity}`, CANVAS_W - 15, 28)

  // Event flash
  if (gs.lastEvent) {
    ctx.fillStyle = '#fbbf24'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(gs.lastEvent, CANVAS_W / 2, 48)
  }
}

function drawMap() {
  const mapH = 230
  const mapY = 62
  ctx.fillStyle = '#0a0f1a'
  drawRoundRect(10, mapY, 320, mapH, 8)
  ctx.fill()

  const cities = gs.cities

  // Draw connections
  const drawn = new Set<string>()
  for (let i = 0; i < cities.length; i++) {
    for (const j of cities[i].connections) {
      const key = [Math.min(i, j), Math.max(i, j)].join(',')
      if (drawn.has(key)) continue
      drawn.add(key)
      const c1 = cities[i], c2 = cities[j]
      // Translate to map space
      const mx1 = 10 + (c1.x / 620) * 300, my1 = mapY + (c1.y / 400) * (mapH - 20)
      const mx2 = 10 + (c2.x / 620) * 300, my2 = mapY + (c2.y / 400) * (mapH - 20)
      const isPlayerRoute = (i === gs.playerCity && cities[i].connections.includes(j)) ||
                            (j === gs.playerCity && cities[j].connections.includes(i))
      ctx.strokeStyle = isPlayerRoute ? '#ffd16688' : '#33415588'
      ctx.lineWidth = isPlayerRoute ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(mx1, my1)
      ctx.lineTo(mx2, my2)
      ctx.stroke()
    }
  }

  // Draw cities
  cities.forEach((city, i) => {
    const mx = 10 + (city.x / 620) * 300
    const my = mapY + (city.y / 400) * (mapH - 20)
    const isPlayer = i === gs.playerCity
    const isAdjacent = gs.cities[gs.playerCity].connections.includes(i)

    if (isPlayer) {
      ctx.beginPath()
      ctx.arc(mx, my, 18, 0, Math.PI * 2)
      ctx.fillStyle = city.color + '33'
      ctx.fill()
      ctx.strokeStyle = city.color
      ctx.lineWidth = 3
      ctx.stroke()
    } else if (isAdjacent) {
      ctx.beginPath()
      ctx.arc(mx, my, 14, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff11'
      ctx.fill()
      ctx.strokeStyle = '#ffffff55'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.stroke()
      ctx.setLineDash([])
    } else {
      ctx.beginPath()
      ctx.arc(mx, my, 12, 0, Math.PI * 2)
      ctx.fillStyle = '#1e293b'
      ctx.fill()
      ctx.strokeStyle = city.color + '66'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.font = isPlayer ? '16px monospace' : '13px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(city.emoji, mx, my + 5)
    ctx.fillStyle = isPlayer ? '#fff' : '#94a3b8'
    ctx.font = `${isPlayer ? 'bold ' : ''}10px monospace`
    ctx.fillText(city.name.split(' ')[0], mx, my + (isPlayer ? 26 : 22))
  })

  // Cargo display
  ctx.fillStyle = '#0f1a2e'
  drawRoundRect(340, mapY, 350, mapH, 8)
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = 'bold 11px monospace'
  ctx.fillText('CARGO', 355, mapY + 18)
  if (gs.cargo.length === 0) {
    ctx.fillStyle = '#334155'
    ctx.font = '11px monospace'
    ctx.fillText('Empty', 355, mapY + 44)
  } else {
    gs.cargo.forEach((item, i) => {
      const iy = mapY + 36 + i * 44
      ctx.fillStyle = GOOD_COLORS[item.good]
      ctx.font = 'bold 12px monospace'
      ctx.fillText(`${GOOD_EMOJIS[item.good]} ${item.good}`, 355, iy)
      ctx.fillStyle = '#94a3b8'
      ctx.font = '10px monospace'
      ctx.fillText(`${item.qty} units  |  bought @ $${item.boughtAt}`, 355, iy + 16)
      // Current city sell price
      const curCity = gs.cities[gs.playerCity]
      const curGood = curCity.goods.find(g => g.name === item.good)
      if (curGood) {
        const profit = (curGood.price - item.boughtAt) * item.qty
        ctx.fillStyle = profit >= 0 ? '#4ade80' : '#f87171'
        ctx.font = 'bold 10px monospace'
        ctx.fillText(`Sell here: $${curGood.price} (${profit >= 0 ? '+' : ''}$${profit})`, 355, iy + 30)
      }
    })
  }
  // Cargo bar
  const barY = mapY + mapH - 18
  drawRoundRect(340, barY, 350, 10, 5)
  ctx.fillStyle = '#1e293b'
  ctx.fill()
  const used2 = cargoSlots()
  drawRoundRect(340, barY, 350 * (used2 / gs.cargoCapacity), 10, 5)
  ctx.fillStyle = used2 >= gs.cargoCapacity ? '#ef4444' : '#60a5fa'
  ctx.fill()
}

function drawTradePanel() {
  const panelY = 300
  const panelH = CANVAS_H - panelY - 10

  ctx.fillStyle = '#0f1117'
  drawRoundRect(10, panelY, CANVAS_W - 20, panelH, 8)
  ctx.fill()

  // Tabs
  const tabs: UITab[] = ['buy', 'sell', 'travel']
  tabs.forEach((tab, i) => {
    const tw = 120, tx = 15 + i * 128
    drawRoundRect(tx, panelY + 5, tw, 32, 6)
    ctx.fillStyle = gs.tab === tab ? '#3b82f6' : '#1e293b'
    ctx.fill()
    ctx.fillStyle = gs.tab === tab ? '#fff' : '#64748b'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(tab.toUpperCase(), tx + tw / 2, panelY + 26)
  })

  if (gs.tab === 'buy') drawBuyTab(panelY + 44)
  if (gs.tab === 'sell') drawSellTab(panelY + 44)
  if (gs.tab === 'travel') drawTravelTab(panelY + 44)

  // Message
  if (gs.message) {
    ctx.fillStyle = '#fbbf24'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(gs.message, CANVAS_W / 2, CANVAS_H - 16)
  }
}

function drawBuyTab(y: number) {
  const city = gs.cities[gs.playerCity]
  city.goods.forEach((good, i) => {
    const gx = 15 + i * 170, gy = y
    ctx.fillStyle = '#1a1a2e'
    drawRoundRect(gx, gy, 162, 120, 8)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.font = '22px monospace'
    ctx.fillText(good.emoji, gx + 81, gy + 30)
    ctx.fillStyle = good.color
    ctx.font = 'bold 11px monospace'
    ctx.fillText(good.name, gx + 81, gy + 48)
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 16px monospace'
    ctx.fillText(`$${good.price}`, gx + 81, gy + 68)
    // Buy 1 / Buy 5
    drawRoundRect(gx + 8, gy + 78, 68, 32, 6)
    ctx.fillStyle = '#1d4ed8'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '11px monospace'
    ctx.fillText('Buy 1', gx + 42, gy + 98)
    drawRoundRect(gx + 84, gy + 78, 68, 32, 6)
    ctx.fillStyle = '#1e40af'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText('Buy 5', gx + 118, gy + 98)
  })
}

function drawSellTab(y: number) {
  if (gs.cargo.length === 0) {
    ctx.fillStyle = '#475569'
    ctx.font = '14px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('No cargo to sell', CANVAS_W / 2, y + 50)
    return
  }
  const city = gs.cities[gs.playerCity]
  gs.cargo.forEach((item, i) => {
    const gx = 15 + i * 170, gy = y
    const good = city.goods.find(g => g.name === item.good)!
    const profit = (good.price - item.boughtAt) * item.qty
    ctx.fillStyle = '#1a2e1a'
    drawRoundRect(gx, gy, 162, 120, 8)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.font = '22px monospace'
    ctx.fillText(GOOD_EMOJIS[item.good], gx + 81, gy + 28)
    ctx.fillStyle = GOOD_COLORS[item.good]
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`${item.name} ${item.good}`, gx + 81, gy + 44)
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '10px monospace'
    ctx.fillText(`${item.qty} units @ $${good.price}`, gx + 81, gy + 60)
    ctx.fillStyle = profit >= 0 ? '#4ade80' : '#f87171'
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`P/L: ${profit >= 0 ? '+' : ''}$${profit}`, gx + 81, gy + 76)
    drawRoundRect(gx + 8, gy + 84, 68, 28, 6)
    ctx.fillStyle = '#166534'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('Sell 1', gx + 42, gy + 103)
    drawRoundRect(gx + 84, gy + 84, 68, 28, 6)
    ctx.fillStyle = '#15803d'
    ctx.fill()
    ctx.fillText('Sell All', gx + 118, gy + 103)
  })
}

function drawTravelTab(y: number) {
  const currentCity = gs.cities[gs.playerCity]
  ctx.fillStyle = '#94a3b8'
  ctx.font = '12px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`Adjacent cities from ${currentCity.name}:`, CANVAS_W / 2, y + 18)

  currentCity.connections.forEach((ci, i) => {
    const city = gs.cities[ci]
    const cx2 = 50 + i * 200, cy2 = y + 36
    ctx.fillStyle = '#1e293b'
    drawRoundRect(cx2, cy2, 182, 100, 8)
    ctx.fill()
    ctx.strokeStyle = city.color + '44'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = '22px monospace'
    ctx.fillText(city.emoji, cx2 + 91, cy2 + 30)
    ctx.fillStyle = city.color
    ctx.font = 'bold 12px monospace'
    ctx.fillText(city.name, cx2 + 91, cy2 + 50)
    // Price preview
    ctx.fillStyle = '#64748b'
    ctx.font = '9px monospace'
    const priceStr = city.goods.map(g => `${g.emoji}$${g.price}`).join(' ')
    ctx.fillText(priceStr, cx2 + 91, cy2 + 66)
    drawRoundRect(cx2 + 30, cy2 + 74, 120, 22, 5)
    ctx.fillStyle = '#7c3aed'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 10px monospace'
    ctx.fillText('Travel (1 turn)', cx2 + 91, cy2 + 89)
  })
}

function drawGameOver() {
  const cityLiquid = (() => {
    const city = gs.cities[gs.playerCity]
    return gs.cargo.reduce((a, item) => {
      const g = city.goods.find(g => g.name === item.good)
      return a + (g ? g.price * item.qty : 0)
    }, 0)
  })()
  const final = gs.money + cityLiquid

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd166'
  ctx.font = 'bold 32px monospace'
  ctx.fillText('Arbitrage Express', CANVAS_W / 2, 130)
  ctx.font = 'bold 26px monospace'
  ctx.fillStyle = '#4ade80'
  ctx.fillText(`Final Net Worth: $${final}`, CANVAS_W / 2, 180)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '15px monospace'
  ctx.fillText(`Best: $${gs.bestScore}`, CANVAS_W / 2, 215)
  ctx.fillText(`Cash: $${gs.money}  |  Cargo value: $${cityLiquid}`, CANVAS_W / 2, 248)
  ctx.fillText(`Started with $${STARTING_MONEY} — profit: $${final - STARTING_MONEY}`, CANVAS_W / 2, 278)

  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 100, 160, 48, 10)
  ctx.fillStyle = '#d97706'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('Play Again', CANVAS_W / 2, CANVAS_H - 68)
}

// ── Input ─────────────────────────────────────────────────────────────────────

function getCanvasPoint(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (clientX - rect.left) * (CANVAS_W / rect.width),
    y: (clientY - rect.top) * (CANVAS_H / rect.height),
  }
}

function handleClick(cx: number, cy: number) {
  if (gs.phase === 'start') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 110 && cy <= CANVAS_H - 60) startGame()
    return
  }
  if (gs.phase === 'gameover') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 100 && cy <= CANVAS_H - 52) startGame()
    return
  }
  // Tabs
  const panelY = 300
  const tabs: UITab[] = ['buy', 'sell', 'travel']
  for (let i = 0; i < tabs.length; i++) {
    const tx = 15 + i * 128
    if (cx >= tx && cx <= tx + 120 && cy >= panelY + 5 && cy <= panelY + 37) {
      audio.click()
      gs.tab = tabs[i]
      gs.message = ''
      return
    }
  }
  // Map city click (for travel)
  const mapY = 62, mapH = 230
  if (cx >= 10 && cx <= 330 && cy >= mapY && cy <= mapY + mapH) {
    for (let i = 0; i < gs.cities.length; i++) {
      const city = gs.cities[i]
      const mx = 10 + (city.x / 620) * 300
      const my = mapY + (city.y / 400) * (mapH - 20)
      if (Math.sqrt((cx - mx) ** 2 + (cy - my) ** 2) < 20) {
        if (i !== gs.playerCity && gs.cities[gs.playerCity].connections.includes(i)) {
          travelTo(i)
        } else if (i !== gs.playerCity) {
          gs.message = `${city.name} is not adjacent`
        }
        return
      }
    }
  }
  // Buy tab buttons
  if (gs.tab === 'buy') {
    const tabY = panelY + 44
    const city = gs.cities[gs.playerCity]
    city.goods.forEach((good, i) => {
      const gx = 15 + i * 170
      if (cx >= gx + 8 && cx <= gx + 76 && cy >= tabY + 78 && cy <= tabY + 110) {
        buyGood(good.name, 1)
      } else if (cx >= gx + 84 && cx <= gx + 152 && cy >= tabY + 78 && cy <= tabY + 110) {
        buyGood(good.name, 5)
      }
    })
  }
  // Sell tab buttons
  if (gs.tab === 'sell') {
    const tabY = panelY + 44
    gs.cargo.forEach((item, i) => {
      const gx = 15 + i * 170
      if (cx >= gx + 8 && cx <= gx + 76 && cy >= tabY + 84 && cy <= tabY + 112) {
        sellGood(item.good, 1)
      } else if (cx >= gx + 84 && cx <= gx + 152 && cy >= tabY + 84 && cy <= tabY + 112) {
        sellGood(item.good, item.qty)
      }
    })
  }
  // Travel tab buttons
  if (gs.tab === 'travel') {
    const tabY = panelY + 44
    const currentCity = gs.cities[gs.playerCity]
    currentCity.connections.forEach((ci, i) => {
      const tx = 50 + i * 200
      if (cx >= tx + 30 && cx <= tx + 150 && cy >= tabY + 36 + 74 && cy <= tabY + 36 + 96) {
        travelTo(ci)
      }
    })
  }
}

canvas.addEventListener('click', (e) => {
  const p = getCanvasPoint(e.clientX, e.clientY)
  handleClick(p.x, p.y)
})
canvas.addEventListener('touchend', (e) => {
  e.preventDefault()
  const t = e.changedTouches[0]
  const p = getCanvasPoint(t.clientX, t.clientY)
  handleClick(p.x, p.y)
}, { passive: false })

muteBtn.addEventListener('click', () => {
  muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊'
})

// ── Loop ──────────────────────────────────────────────────────────────────────

function loop() {
  draw()
  requestAnimationFrame(loop)
}

initSDK().then(({ bestScore }) => {
  gs.bestScore = bestScore
  loop()
})
