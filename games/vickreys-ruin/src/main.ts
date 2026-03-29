import { audio } from './audio'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Types ─────────────────────────────────────────────────────────────────────

type AuctionFormat = 'first-price' | 'second-price' | 'all-pay' | 'dutch'
type BidderPersonality = 'Aggressive' | 'Conservative' | 'Truthful' | 'Spiteful'

interface Bidder {
  name: string
  color: string
  personality: BidderPersonality
  lastBid: number
  emoji: string
}

interface AuctionItem {
  name: string
  minValue: number
  maxValue: number
  trueValue: number // revealed after winning
}

interface AuctionResult {
  winner: number | null // -1 = player
  playerBid: number
  aiBids: number[]
  playerPaid: number
  playerValue: number
  playerWon: boolean
  itemName: string
  format: AuctionFormat
}

type GamePhase = 'start' | 'bidding' | 'result' | 'gameover'
type DutchPhase = 'dropping' | 'done'

interface GameState {
  phase: GamePhase
  round: number
  item: AuctionItem
  format: AuctionFormat
  bidders: Bidder[]
  playerBid: number
  playerBidStr: string
  profit: number
  bestScore: number
  results: AuctionResult[]
  message: string
  dutchPrice: number
  dutchPhase: DutchPhase
  dutchTimer: number
  aiBids: number[]
  inputActive: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 700
const CANVAS_H = 580
const TOTAL_ROUNDS = 12

const ITEMS: AuctionItem[] = [
  { name: 'Vintage Watch', minValue: 50, maxValue: 150, trueValue: 0 },
  { name: 'Abstract Painting', minValue: 80, maxValue: 200, trueValue: 0 },
  { name: 'Rare Coin', minValue: 30, maxValue: 120, trueValue: 0 },
  { name: 'Antique Lamp', minValue: 40, maxValue: 110, trueValue: 0 },
  { name: 'First Edition Book', minValue: 60, maxValue: 180, trueValue: 0 },
  { name: 'Studio Pottery', minValue: 25, maxValue: 90, trueValue: 0 },
  { name: 'Jazz Vinyl Record', minValue: 35, maxValue: 100, trueValue: 0 },
  { name: 'Gemstone Ring', minValue: 70, maxValue: 220, trueValue: 0 },
  { name: 'Signed Poster', minValue: 45, maxValue: 130, trueValue: 0 },
  { name: 'Mechanical Camera', minValue: 55, maxValue: 160, trueValue: 0 },
  { name: 'Bronze Figurine', minValue: 65, maxValue: 190, trueValue: 0 },
  { name: 'Leather Journal', minValue: 20, maxValue: 80, trueValue: 0 },
]

const BIDDER_DATA: { name: string; color: string; personality: BidderPersonality; emoji: string }[] = [
  { name: 'Alex', color: '#f87171', personality: 'Aggressive', emoji: '🦁' },
  { name: 'Sam',  color: '#60a5fa', personality: 'Conservative', emoji: '🐢' },
  { name: 'Lee',  color: '#4ade80', personality: 'Truthful', emoji: '🦉' },
  { name: 'Rin',  color: '#fbbf24', personality: 'Spiteful', emoji: '🐍' },
]

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

// ── State ─────────────────────────────────────────────────────────────────────

function makeItem(round: number): AuctionItem {
  const template = ITEMS[(round - 1) % ITEMS.length]
  const trueValue = Math.round(template.minValue + Math.random() * (template.maxValue - template.minValue))
  return { ...template, trueValue }
}

function getFormat(round: number): AuctionFormat {
  if (round <= 3) return 'first-price'
  if (round <= 6) return 'second-price'
  if (round <= 9) return 'all-pay'
  return 'dutch'
}

function getFormatName(f: AuctionFormat): string {
  switch (f) {
    case 'first-price': return 'First-Price Sealed Bid'
    case 'second-price': return 'Second-Price (Vickrey)'
    case 'all-pay': return 'All-Pay Auction'
    case 'dutch': return 'Dutch Descending'
  }
}

function getFormatDesc(f: AuctionFormat): string {
  switch (f) {
    case 'first-price': return 'Winner pays their own bid.'
    case 'second-price': return 'Winner pays second-highest bid.'
    case 'all-pay': return 'ALL bidders pay — winner takes item.'
    case 'dutch': return 'Price drops — first to accept wins.'
  }
}

function makeInitialState(): GameState {
  const round = 1
  const item = makeItem(round)
  const format = getFormat(round)
  return {
    phase: 'start',
    round,
    item,
    format,
    bidders: BIDDER_DATA.map(b => ({ ...b, lastBid: 0 })),
    playerBid: 0,
    playerBidStr: '',
    profit: 0,
    bestScore: 0,
    results: [],
    message: '',
    dutchPrice: 0,
    dutchPhase: 'dropping',
    dutchTimer: 0,
    aiBids: [],
    inputActive: false,
  }
}

let gs: GameState = makeInitialState()

// ── AI Bidding ────────────────────────────────────────────────────────────────

function computeAIBid(bidder: Bidder, item: AuctionItem, format: AuctionFormat, playerLastBid: number): number {
  const expected = (item.minValue + item.maxValue) / 2
  let base = 0
  switch (bidder.personality) {
    case 'Aggressive':
      base = item.maxValue * 0.90
      break
    case 'Conservative':
      base = expected * 0.50
      break
    case 'Truthful':
      base = expected
      break
    case 'Spiteful':
      // Overbid if player was winning last round
      base = playerLastBid > 0 ? playerLastBid * 1.1 : expected * 0.8
      break
  }
  // Add noise
  base = Math.max(1, base + (Math.random() - 0.5) * 15)
  // In all-pay, be more conservative
  if (format === 'all-pay') base *= 0.6
  return Math.round(base)
}

// ── Auction Resolution ────────────────────────────────────────────────────────

function resolveAuction() {
  const { item, format, playerBid, bidders, round } = gs
  const aiBids = bidders.map(b => computeAIBid(b, item, format, gs.results.length > 0 ? gs.results[gs.results.length - 1].playerBid : 0))
  gs.aiBids = aiBids
  bidders.forEach((b, i) => { b.lastBid = aiBids[i] })

  // Determine winner index (-1 = player)
  let winnerIdx = -1
  let winnerBid = playerBid
  for (let i = 0; i < aiBids.length; i++) {
    if (aiBids[i] > winnerBid) {
      winnerBid = aiBids[i]
      winnerIdx = i
    }
  }

  const playerWon = winnerIdx === -1
  let playerPaid = 0
  let playerValue = 0

  if (playerWon) {
    playerValue = item.trueValue
    switch (format) {
      case 'first-price':
        playerPaid = playerBid
        break
      case 'second-price': {
        const secondBid = Math.max(...aiBids)
        playerPaid = secondBid
        break
      }
      case 'all-pay':
        playerPaid = playerBid
        break
      case 'dutch':
        playerPaid = gs.dutchPrice
        break
    }
    gs.profit += playerValue - playerPaid
  } else if (format === 'all-pay') {
    // Player still pays in all-pay
    playerPaid = playerBid
    gs.profit -= playerPaid
  }

  const result: AuctionResult = {
    winner: winnerIdx,
    playerBid,
    aiBids,
    playerPaid,
    playerValue: item.trueValue,
    playerWon,
    itemName: item.name,
    format,
  }
  gs.results.push(result)

  if (playerWon) audio.score()
  else audio.blip()

  gs.phase = 'result'
  gs.message = playerWon
    ? `You won! Value $${item.trueValue}, paid $${playerPaid} = profit $${item.trueValue - playerPaid}`
    : `${bidders[winnerIdx].name} won with $${winnerBid}.`
}

function nextRound() {
  if (gs.round >= TOTAL_ROUNDS) {
    const finalScore = Math.round(gs.profit)
    if (finalScore > gs.bestScore) {
      gs.bestScore = finalScore
      saveBestScore(gs.bestScore)
    }
    reportGameOver(finalScore)
    gs.phase = 'gameover'
    audio.levelUp()
    return
  }
  gs.round++
  gs.item = makeItem(gs.round)
  gs.format = getFormat(gs.round)
  gs.playerBid = 0
  gs.playerBidStr = ''
  gs.dutchPrice = gs.item.maxValue + 20
  gs.dutchPhase = 'dropping'
  gs.dutchTimer = 0
  gs.aiBids = []
  gs.phase = 'bidding'
}

// ── Draw Helpers ──────────────────────────────────────────────────────────────

function drawRoundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawDigitPad() {
  // Digit buttons for bid entry
  const digits = ['1','2','3','4','5','6','7','8','9','0','⌫','OK']
  const padX = 190, padY = 320
  const btnW = 58, btnH = 44, gap = 8
  for (let i = 0; i < digits.length; i++) {
    const col = i % 3
    const row = Math.floor(i / 3)
    const bx = padX + col * (btnW + gap)
    const by = padY + row * (btnH + gap)
    drawRoundRect(bx, by, btnW, btnH, 8)
    const d = digits[i]
    ctx.fillStyle = d === 'OK' ? '#10b981' : d === '⌫' ? '#ef4444' : '#1e293b'
    ctx.fill()
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 15px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(d, bx + btnW / 2, by + btnH / 2 + 6)
  }
}

// ── Draw ──────────────────────────────────────────────────────────────────────

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  bg.addColorStop(0, '#0d0a1a')
  bg.addColorStop(1, '#0a0d14')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  if (gs.phase === 'start') { drawStart(); return }
  if (gs.phase === 'gameover') { drawGameOver(); return }

  drawHeader()
  drawItem()
  drawBidders()

  if (gs.phase === 'bidding') {
    if (gs.format === 'dutch') drawDutch()
    else drawBidInput()
  }
  if (gs.phase === 'result') drawResult()
}

function drawStart() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 36px monospace'
  ctx.fillText("Vickrey's Ruin", CANVAS_W / 2, 140)
  ctx.font = '14px monospace'
  ctx.fillStyle = '#94a3b8'
  const lines = [
    '12 auctions. 4 auction formats.',
    'Win items for profit. Bid wisely.',
    '',
    'Rounds 1–3:  First-Price (pay your bid)',
    'Rounds 4–6:  Vickrey (pay 2nd-highest)',
    'Rounds 7–9:  All-Pay (all bidders pay!)',
    'Rounds 10–12: Dutch (price drops, grab it)',
    '',
    'Score = total profit at the end.',
  ]
  lines.forEach((l, i) => ctx.fillText(l, CANVAS_W / 2, 200 + i * 26))
  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 110, 160, 50, 10)
  ctx.fillStyle = '#8b5cf6'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('Play', CANVAS_W / 2, CANVAS_H - 78)
}

function drawHeader() {
  ctx.fillStyle = '#1e293b'
  drawRoundRect(10, 10, CANVAS_W - 20, 50, 8)
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.fillText(`Round ${gs.round}/${TOTAL_ROUNDS}`, 20, 28)
  ctx.fillStyle = '#a78bfa'
  ctx.font = 'bold 13px monospace'
  ctx.fillText(getFormatName(gs.format), 20, 48)
  ctx.fillStyle = '#64748b'
  ctx.font = '10px monospace'
  ctx.fillText(getFormatDesc(gs.format), 200, 48)
  ctx.textAlign = 'right'
  ctx.fillStyle = gs.profit >= 0 ? '#4ade80' : '#f87171'
  ctx.font = 'bold 16px monospace'
  ctx.fillText(`Profit: $${gs.profit}`, CANVAS_W - 15, 38)
}

function drawItem() {
  const item = gs.item
  ctx.fillStyle = '#0f172a'
  drawRoundRect(10, 70, CANVAS_W - 20, 90, 8)
  ctx.fill()
  ctx.strokeStyle = '#a78bfa44'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e2e8f0'
  ctx.font = 'bold 20px monospace'
  ctx.fillText(item.name, CANVAS_W / 2, 100)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '13px monospace'
  ctx.fillText(`Estimated value: $${item.minValue} – $${item.maxValue}`, CANVAS_W / 2, 124)

  if (gs.phase === 'result') {
    ctx.fillStyle = '#ffd166'
    ctx.fillText(`True value revealed: $${item.trueValue}`, CANVAS_W / 2, 148)
  } else {
    ctx.fillStyle = '#475569'
    ctx.fillText('True value unknown until auction resolves', CANVAS_W / 2, 148)
  }
}

function drawBidders() {
  const bidderY = 170
  for (let i = 0; i < gs.bidders.length; i++) {
    const b = gs.bidders[i]
    const bx = 15 + i * (CANVAS_W - 30) / 4
    const bw = (CANVAS_W - 30) / 4 - 8
    ctx.fillStyle = '#1e293b'
    drawRoundRect(bx, bidderY, bw, 80, 8)
    ctx.fill()
    ctx.strokeStyle = b.color + '44'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = b.color
    ctx.font = 'bold 16px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(b.emoji, bx + bw / 2, bidderY + 26)
    ctx.font = 'bold 12px monospace'
    ctx.fillText(b.name, bx + bw / 2, bidderY + 44)
    ctx.fillStyle = '#64748b'
    ctx.font = '10px monospace'
    ctx.fillText(b.personality, bx + bw / 2, bidderY + 58)
    if (gs.phase === 'result' && gs.aiBids.length > 0) {
      const bid = gs.aiBids[i]
      ctx.fillStyle = '#e2e8f0'
      ctx.font = 'bold 13px monospace'
      ctx.fillText(`$${bid}`, bx + bw / 2, bidderY + 74)
    } else {
      ctx.fillStyle = '#334155'
      ctx.font = '12px monospace'
      ctx.fillText('???', bx + bw / 2, bidderY + 74)
    }
  }
}

function drawBidInput() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e2e8f0'
  ctx.font = 'bold 16px monospace'
  ctx.fillText('Your Bid:', CANVAS_W / 2, 295)

  // Bid display
  drawRoundRect(CANVAS_W / 2 - 80, 303, 160, 44, 8)
  ctx.fillStyle = '#0f172a'
  ctx.fill()
  ctx.strokeStyle = '#a78bfa'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 22px monospace'
  ctx.fillText(`$${gs.playerBidStr || '0'}`, CANVAS_W / 2, 333)

  drawDigitPad()

  // History sidebar
  drawHistorySidebar()
}

function drawDutch() {
  // Dutch auction: price is dropping
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fbbf24'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('DUTCH AUCTION — Price is dropping!', CANVAS_W / 2, 295)

  const price = gs.dutchPrice
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 32px monospace'
  ctx.fillText(`$${price}`, CANVAS_W / 2, 350)

  ctx.fillStyle = '#64748b'
  ctx.font = '12px monospace'
  ctx.fillText('Click "ACCEPT" to buy now, or wait for lower price', CANVAS_W / 2, 375)
  ctx.fillText('(AI may grab it first!)', CANVAS_W / 2, 393)

  // Accept button
  drawRoundRect(CANVAS_W / 2 - 70, 408, 140, 44, 8)
  ctx.fillStyle = '#10b981'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px monospace'
  ctx.fillText('ACCEPT', CANVAS_W / 2, 436)

  drawHistorySidebar()
}

function drawHistorySidebar() {
  // Last 4 results on right side
  const sx = 455
  ctx.fillStyle = '#0f172a'
  drawRoundRect(sx, 315, 235, 230, 8)
  ctx.fill()
  ctx.fillStyle = '#94a3b8'
  ctx.font = 'bold 11px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('AUCTION HISTORY', sx + 10, 334)
  const recent = gs.results.slice(-4).reverse()
  recent.forEach((r, i) => {
    const ry = 350 + i * 50
    ctx.fillStyle = r.playerWon ? '#4ade80' : '#64748b'
    ctx.font = 'bold 10px monospace'
    ctx.fillText(r.playerWon ? `WON: ${r.itemName}` : `LOST: ${r.itemName}`, sx + 10, ry)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '9px monospace'
    ctx.fillText(`Bid $${r.playerBid} | ${r.playerWon ? `val $${r.playerValue}` : `winner bid $${Math.max(...r.aiBids)}`}`, sx + 10, ry + 13)
    ctx.fillStyle = r.playerWon ? '#4ade80' : '#f87171'
    ctx.fillText(r.playerWon ? `+$${r.playerValue - r.playerPaid}` : (r.format === 'all-pay' ? `-$${r.playerPaid}` : '$0'), sx + 10, ry + 26)
  })
}

function drawResult() {
  // Result overlay
  ctx.fillStyle = '#0f172a'
  drawRoundRect(80, 295, CANVAS_W - 160, 230, 12)
  ctx.fill()
  ctx.strokeStyle = '#a78bfa'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.textAlign = 'center'
  const lastResult = gs.results[gs.results.length - 1]
  if (lastResult.playerWon) {
    ctx.fillStyle = '#4ade80'
    ctx.font = 'bold 20px monospace'
    ctx.fillText('YOU WON!', CANVAS_W / 2, 330)
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '14px monospace'
    ctx.fillText(`Paid: $${lastResult.playerPaid}  |  Value: $${lastResult.playerValue}`, CANVAS_W / 2, 358)
    const profit = lastResult.playerValue - lastResult.playerPaid
    ctx.fillStyle = profit >= 0 ? '#4ade80' : '#f87171'
    ctx.font = 'bold 18px monospace'
    ctx.fillText(`Profit this round: ${profit >= 0 ? '+' : ''}$${profit}`, CANVAS_W / 2, 385)
  } else {
    ctx.fillStyle = '#f87171'
    ctx.font = 'bold 20px monospace'
    ctx.fillText('YOU LOST', CANVAS_W / 2, 330)
    const winnerIdx = lastResult.winner!
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '14px monospace'
    ctx.fillText(`${gs.bidders[winnerIdx].name} won with $${lastResult.aiBids[winnerIdx]}`, CANVAS_W / 2, 358)
    if (gs.format === 'all-pay') {
      ctx.fillStyle = '#fbbf24'
      ctx.fillText(`(All-Pay: you still paid $${lastResult.playerPaid})`, CANVAS_W / 2, 382)
    }
  }

  ctx.fillStyle = '#94a3b8'
  ctx.font = '12px monospace'
  ctx.fillText(`Total profit: $${gs.profit}`, CANVAS_W / 2, 420)

  drawRoundRect(CANVAS_W / 2 - 70, 440, 140, 42, 8)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px monospace'
  ctx.fillText(gs.round >= TOTAL_ROUNDS ? 'Finish' : 'Next Auction →', CANVAS_W / 2, 467)
}

function drawGameOver() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 30px monospace'
  ctx.fillText("Vickrey's Ruin — Final Results", CANVAS_W / 2, 130)
  ctx.fillStyle = gs.profit >= 0 ? '#4ade80' : '#f87171'
  ctx.font = 'bold 28px monospace'
  ctx.fillText(`Total Profit: $${gs.profit}`, CANVAS_W / 2, 188)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '15px monospace'
  ctx.fillText(`Best: $${gs.bestScore}`, CANVAS_W / 2, 225)

  // Format breakdown
  const formats: AuctionFormat[] = ['first-price', 'second-price', 'all-pay', 'dutch']
  formats.forEach((f, fi) => {
    const rounds = gs.results.filter(r => r.format === f)
    const won = rounds.filter(r => r.playerWon).length
    const profit = rounds.reduce((a, r) => a + (r.playerWon ? r.playerValue - r.playerPaid : r.format === 'all-pay' ? -r.playerPaid : 0), 0)
    const fy = 265 + fi * 48
    ctx.fillStyle = '#1e293b'
    drawRoundRect(100, fy, CANVAS_W - 200, 40, 8)
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 12px monospace'
    ctx.fillText(getFormatName(f), 115, fy + 16)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '11px monospace'
    ctx.fillText(`${won}/${rounds.length} won`, 115, fy + 33)
    ctx.textAlign = 'right'
    ctx.fillStyle = profit >= 0 ? '#4ade80' : '#f87171'
    ctx.font = 'bold 13px monospace'
    ctx.fillText(`${profit >= 0 ? '+' : ''}$${profit}`, CANVAS_W - 115, fy + 28)
  })

  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 90, 160, 46, 10)
  ctx.fillStyle = '#8b5cf6'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('Play Again', CANVAS_W / 2, CANVAS_H - 58)
}

// ── Input ─────────────────────────────────────────────────────────────────────

function getCanvasPoint(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (clientX - rect.left) * (CANVAS_W / rect.width),
    y: (clientY - rect.top) * (CANVAS_H / rect.height),
  }
}

// Dutch auction timer
let dutchInterval: ReturnType<typeof setInterval> | null = null

function startDutchTimer() {
  if (dutchInterval) clearInterval(dutchInterval)
  gs.dutchPrice = gs.item.maxValue + 20
  dutchInterval = setInterval(() => {
    if (gs.phase !== 'bidding' || gs.format !== 'dutch') {
      clearInterval(dutchInterval!)
      return
    }
    gs.dutchPrice -= Math.ceil(gs.item.maxValue / 30)
    if (gs.dutchPrice <= gs.item.minValue * 0.4) {
      // AI grabs it
      const randBidder = gs.bidders[Math.floor(Math.random() * gs.bidders.length)]
      gs.aiBids = gs.bidders.map(b => b === randBidder ? gs.dutchPrice : 0)
      gs.playerBid = 0
      resolveAuction()
      clearInterval(dutchInterval!)
    }
  }, 800)
}

function handleClick(cx: number, cy: number) {
  if (gs.phase === 'start') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 110 && cy <= CANVAS_H - 60) {
      gs.phase = 'bidding'
      gs.round = 1
      gs.item = makeItem(1)
      gs.format = getFormat(1)
      gs.profit = 0
      gs.results = []
      gs.playerBidStr = ''
      gs.dutchPrice = gs.item.maxValue + 20
      if (gs.format === 'dutch') startDutchTimer()
      audio.start()
    }
    return
  }
  if (gs.phase === 'gameover') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 90 && cy <= CANVAS_H - 44) {
      gs.phase = 'start'
    }
    return
  }
  if (gs.phase === 'result') {
    const bx = CANVAS_W / 2 - 70, by = 440
    if (cx >= bx && cx <= bx + 140 && cy >= by && cy <= by + 42) {
      audio.click()
      nextRound()
      if (gs.phase === 'bidding' && gs.format === 'dutch') startDutchTimer()
    }
    return
  }
  if (gs.phase === 'bidding') {
    if (gs.format === 'dutch') {
      // Accept button
      if (cx >= CANVAS_W / 2 - 70 && cx <= CANVAS_W / 2 + 70 && cy >= 408 && cy <= 452) {
        if (dutchInterval) clearInterval(dutchInterval)
        gs.playerBid = gs.dutchPrice
        resolveAuction()
      }
      return
    }
    // Digit pad
    const digits = ['1','2','3','4','5','6','7','8','9','0','⌫','OK']
    const padX = 190, padY = 320
    const btnW = 58, btnH = 44, gap = 8
    for (let i = 0; i < digits.length; i++) {
      const col = i % 3
      const row = Math.floor(i / 3)
      const bx = padX + col * (btnW + gap)
      const by = padY + row * (btnH + gap)
      if (cx >= bx && cx <= bx + btnW && cy >= by && cy <= by + btnH) {
        audio.click()
        const d = digits[i]
        if (d === '⌫') {
          gs.playerBidStr = gs.playerBidStr.slice(0, -1)
        } else if (d === 'OK') {
          const bid = parseInt(gs.playerBidStr || '0', 10)
          if (bid <= 0) { gs.message = 'Enter a bid > 0'; return }
          gs.playerBid = bid
          gs.message = ''
          resolveAuction()
        } else {
          if (gs.playerBidStr.length < 5) gs.playerBidStr += d
        }
        return
      }
    }
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
