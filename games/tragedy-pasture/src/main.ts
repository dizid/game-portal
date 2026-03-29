import { audio } from './audio'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Types ─────────────────────────────────────────────────────────────────────

type ShepherdPersonality = 'Greedy' | 'Cooperative' | 'Tit-for-Tat' | 'Random'

interface Shepherd {
  name: string
  color: string
  personality: ShepherdPersonality
  sheep: number
  gold: number
  emoji: string
}

interface GameState {
  phase: 'start' | 'choosing' | 'results' | 'gameover'
  season: number
  pasture: number            // 0–100
  playerSheep: number
  playerGold: number
  shepherds: Shepherd[]
  healthHistory: number[]
  message: string
  seasonResult: string
  bestScore: number
  playerLastChoice: number
  sliderActive: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 700
const CANVAS_H = 580
const TOTAL_SEASONS = 20
const MAX_SHEEP = 10
const WOOL_PER_SHEEP = 5 // gold per sheep

const SHEPHERD_DATA: { name: string; color: string; personality: ShepherdPersonality; emoji: string }[] = [
  { name: 'Greta',  color: '#f87171', personality: 'Greedy',      emoji: '🐺' },
  { name: 'Colin',  color: '#4ade80', personality: 'Cooperative', emoji: '🤝' },
  { name: 'Tara',   color: '#60a5fa', personality: 'Tit-for-Tat', emoji: '🪞' },
  { name: 'Randy',  color: '#fbbf24', personality: 'Random',      emoji: '🎲' },
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

function makeShepherds(): Shepherd[] {
  return SHEPHERD_DATA.map(d => ({ ...d, sheep: 5, gold: 0 }))
}

let gs: GameState = {
  phase: 'start',
  season: 1,
  pasture: 80,
  playerSheep: 5,
  playerGold: 0,
  shepherds: makeShepherds(),
  healthHistory: [80],
  message: '',
  seasonResult: '',
  bestScore: 0,
  playerLastChoice: 5,
  sliderActive: false,
}

function startGame() {
  gs = {
    phase: 'choosing',
    season: 1,
    pasture: 80,
    playerSheep: 5,
    playerGold: 0,
    shepherds: makeShepherds(),
    healthHistory: [80],
    message: '',
    seasonResult: '',
    bestScore: gs.bestScore,
    playerLastChoice: 5,
    sliderActive: false,
  }
  audio.start()
}

// ── AI Logic ──────────────────────────────────────────────────────────────────

function computeAISheep(s: Shepherd, playerLast: number, avgLast: number): number {
  switch (s.personality) {
    case 'Greedy':
      return Math.floor(8 + Math.random() * 3)
    case 'Cooperative': {
      // Match the average of last season
      const target = Math.round(avgLast)
      return Math.max(1, Math.min(MAX_SHEEP, target))
    }
    case 'Tit-for-Tat':
      return Math.max(1, Math.min(MAX_SHEEP, playerLast))
    case 'Random':
      return Math.floor(1 + Math.random() * MAX_SHEEP)
  }
}

// ── Season Logic ──────────────────────────────────────────────────────────────

function pastureDepleteRate(totalSheep: number): number {
  return totalSheep * 1.5
}

function pastureRegen(health: number): number {
  return health * 0.12 * (1 - health / 100)
}

function processSeason() {
  const sheepCounts = [gs.playerSheep, ...gs.shepherds.map(s => s.sheep)]
  const totalSheep = sheepCounts.reduce((a, b) => a + b, 0)

  // Deplete pasture
  const depletion = pastureDepleteRate(totalSheep)
  const regen = pastureRegen(gs.pasture)
  const newPasture = Math.max(0, Math.min(100, gs.pasture - depletion + regen))

  // If pasture collapses
  const collapsed = newPasture <= 0

  // Efficiency factor: less grass = less wool
  const efficiency = collapsed ? 0 : (gs.pasture / 100)

  // Earn gold
  const playerEarned = Math.round(gs.playerSheep * WOOL_PER_SHEEP * efficiency)
  gs.playerGold += playerEarned

  gs.shepherds.forEach(s => {
    s.gold += Math.round(s.sheep * WOOL_PER_SHEEP * efficiency)
  })

  gs.pasture = newPasture
  gs.healthHistory.push(Math.round(newPasture))

  let msg = `Season ${gs.season}: You grazed ${gs.playerSheep} sheep, earned ${playerEarned} gold. Total: ${gs.shepherds.reduce((a, s) => a + s.sheep, gs.playerSheep)} sheep on pasture.`
  if (collapsed) {
    msg = 'THE PASTURE COLLAPSED! All sheep die. Game over!'
    audio.death()
  } else {
    audio.blip()
  }
  gs.seasonResult = msg

  if (collapsed || gs.season >= TOTAL_SEASONS) {
    const finalScore = gs.playerGold
    if (finalScore > gs.bestScore) {
      gs.bestScore = finalScore
      saveBestScore(finalScore)
    }
    reportGameOver(finalScore)
    gs.phase = 'gameover'
  } else {
    gs.season++
    // AI decides next season's sheep
    const lastAvg = (sheepCounts.reduce((a, b) => a + b, 0)) / sheepCounts.length
    gs.shepherds.forEach(s => {
      s.sheep = computeAISheep(s, gs.playerLastChoice, lastAvg)
    })
    gs.phase = 'results'
  }
}

function confirmChoice() {
  gs.playerLastChoice = gs.playerSheep
  processSeason()
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
  bg.addColorStop(0, '#0a1208')
  bg.addColorStop(1, '#0a0f0a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  if (gs.phase === 'start') { drawStart(); return }
  if (gs.phase === 'gameover') { drawGameOver(); return }

  drawHeader()
  drawPastureViz()
  drawShepherds()
  drawHealthGraph()

  if (gs.phase === 'choosing') drawChoose()
  if (gs.phase === 'results') drawResults()
}

function drawStart() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#4ade80'
  ctx.font = 'bold 36px monospace'
  ctx.fillText('Tragedy Pasture', CANVAS_W / 2, 150)
  ctx.font = '14px monospace'
  ctx.fillStyle = '#94a3b8'
  const lines = [
    'A shared pasture. You and 4 AI shepherds.',
    'Each season: choose how many sheep to graze (0–10).',
    '',
    'More sheep = more wool = more gold.',
    'But too many sheep destroy the pasture!',
    'Pasture health = 0 means game over for all.',
    '',
    'Greedy neighbor always maxes out. Can you',
    'maintain the commons for 20 seasons?',
  ]
  lines.forEach((l, i) => ctx.fillText(l, CANVAS_W / 2, 200 + i * 26))
  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 110, 160, 50, 10)
  ctx.fillStyle = '#16a34a'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('Play', CANVAS_W / 2, CANVAS_H - 78)
}

function drawHeader() {
  ctx.fillStyle = '#0f1a0e'
  drawRoundRect(10, 10, CANVAS_W - 20, 44, 8)
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.fillText(`Season ${gs.season}/${TOTAL_SEASONS}`, 20, 30)
  ctx.fillStyle = '#4ade80'
  ctx.font = 'bold 15px monospace'
  ctx.fillText(`Your Gold: ${gs.playerGold}`, 20, 48)
  ctx.textAlign = 'right'
  const h = Math.round(gs.pasture)
  ctx.fillStyle = h > 60 ? '#4ade80' : h > 30 ? '#fbbf24' : '#f87171'
  ctx.font = 'bold 15px monospace'
  ctx.fillText(`Pasture: ${h}%`, CANVAS_W - 15, 38)
}

function drawPastureViz() {
  const px = 10, py = 65, pw = CANVAS_W - 20, ph = 90
  // Pasture background
  ctx.fillStyle = '#0f1a0e'
  drawRoundRect(px, py, pw, ph, 8)
  ctx.fill()
  // Grass coverage
  const h = gs.pasture / 100
  const gr = ctx.createLinearGradient(px, py + ph * (1 - h), px, py + ph)
  gr.addColorStop(0, `rgba(34,197,94,${h * 0.8 + 0.1})`)
  gr.addColorStop(1, `rgba(22,163,74,${h * 0.6 + 0.05})`)
  ctx.fillStyle = gr
  drawRoundRect(px, py + ph * (1 - h), pw, ph * h, h > 0.05 ? 4 : 0)
  ctx.fill()

  // Draw sheep icons based on total count
  const totalSheep = gs.shepherds.reduce((a, s) => a + s.sheep, gs.playerSheep)
  ctx.font = '14px monospace'
  for (let i = 0; i < Math.min(totalSheep, 25); i++) {
    const sx = px + 20 + (i % 12) * 50
    const sy = py + 20 + Math.floor(i / 12) * 30
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText('🐑', sx, sy)
  }
  if (totalSheep > 25) {
    ctx.fillStyle = '#fbbf24'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`+${totalSheep - 25} more`, CANVAS_W / 2, py + 75)
  }

  // Health bar
  ctx.fillStyle = '#1e293b'
  drawRoundRect(px, py + ph + 6, pw, 10, 5)
  ctx.fill()
  const barColor = h > 0.6 ? '#4ade80' : h > 0.3 ? '#fbbf24' : '#ef4444'
  drawRoundRect(px, py + ph + 6, pw * h, 10, 5)
  ctx.fillStyle = barColor
  ctx.fill()
}

function drawShepherds() {
  const sy = 182
  const cardW = (CANVAS_W - 20) / 5 - 4

  // Player card
  const px = 10
  ctx.fillStyle = '#0f2a1a'
  drawRoundRect(px, sy, cardW, 88, 8)
  ctx.fill()
  ctx.strokeStyle = '#4ade80'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#4ade80'
  ctx.font = '20px monospace'
  ctx.fillText('🧑', px + cardW / 2, sy + 26)
  ctx.font = 'bold 11px monospace'
  ctx.fillText('You', px + cardW / 2, sy + 44)
  ctx.fillStyle = '#ffd166'
  ctx.font = '10px monospace'
  ctx.fillText(`${gs.playerSheep} sheep`, px + cardW / 2, sy + 60)
  ctx.fillStyle = '#4ade80'
  ctx.fillText(`$${gs.playerGold}`, px + cardW / 2, sy + 75)

  // AI shepherd cards
  gs.shepherds.forEach((s, i) => {
    const bx = 10 + (i + 1) * (cardW + 4)
    ctx.fillStyle = '#0f1a0e'
    drawRoundRect(bx, sy, cardW, 88, 8)
    ctx.fill()
    ctx.strokeStyle = s.color + '44'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = '18px monospace'
    ctx.fillText(s.emoji, bx + cardW / 2, sy + 26)
    ctx.fillStyle = s.color
    ctx.font = 'bold 10px monospace'
    ctx.fillText(s.name, bx + cardW / 2, sy + 44)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '9px monospace'
    ctx.fillText(s.personality, bx + cardW / 2, sy + 56)
    ctx.fillStyle = '#fbbf24'
    ctx.font = '10px monospace'
    ctx.fillText(`${s.sheep} sheep`, bx + cardW / 2, sy + 70)
    ctx.fillStyle = '#4ade80'
    ctx.fillText(`$${s.gold}`, bx + cardW / 2, sy + 83)
  })
}

function drawHealthGraph() {
  const gx = 10, gy = 285, gw = CANVAS_W - 20, gh = 70
  ctx.fillStyle = '#0f1a0e'
  drawRoundRect(gx, gy, gw, gh, 6)
  ctx.fill()
  ctx.fillStyle = '#1a2e1a'
  ctx.font = '9px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('Pasture health over time', gx + 6, gy + 12)

  if (gs.healthHistory.length < 2) return
  const step = gw / Math.max(TOTAL_SEASONS, gs.healthHistory.length)

  ctx.beginPath()
  ctx.moveTo(gx + 6, gy + gh - 8 - (gs.healthHistory[0] / 100) * (gh - 20))
  for (let i = 1; i < gs.healthHistory.length; i++) {
    const hx = gx + 6 + i * step
    const hy = gy + gh - 8 - (gs.healthHistory[i] / 100) * (gh - 20)
    ctx.lineTo(hx, hy)
  }
  ctx.strokeStyle = '#4ade80'
  ctx.lineWidth = 2
  ctx.stroke()

  // Danger line at 30%
  const dangerY = gy + gh - 8 - 0.3 * (gh - 20)
  ctx.strokeStyle = '#ef444466'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(gx, dangerY)
  ctx.lineTo(gx + gw, dangerY)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawChoose() {
  const sy = 365
  ctx.fillStyle = '#0f1a0e'
  drawRoundRect(10, sy, CANVAS_W - 20, 170, 8)
  ctx.fill()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#e2e8f0'
  ctx.font = 'bold 14px monospace'
  ctx.fillText('How many sheep will you graze this season?', CANVAS_W / 2, sy + 24)

  // Slider
  const slX = 60, slY = sy + 50, slW = CANVAS_W - 140
  drawRoundRect(slX, slY, slW, 12, 6)
  ctx.fillStyle = '#1e293b'
  ctx.fill()
  const frac = gs.playerSheep / MAX_SHEEP
  drawRoundRect(slX, slY, slW * frac, 12, 6)
  ctx.fillStyle = '#4ade80'
  ctx.fill()
  // Thumb
  const thumbX = slX + slW * frac
  ctx.beginPath()
  ctx.arc(thumbX, slY + 6, 14, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.strokeStyle = '#4ade80'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#0a0a0a'
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`${gs.playerSheep}`, thumbX, slY + 11)

  // Scale labels
  ctx.fillStyle = '#475569'
  ctx.font = '9px monospace'
  for (let i = 0; i <= MAX_SHEEP; i += 2) {
    ctx.fillText(`${i}`, slX + slW * (i / MAX_SHEEP), slY + 30)
  }

  // Estimated earnings
  const totalNext = gs.shepherds.reduce((a, s) => a + s.sheep, gs.playerSheep)
  const depletion = pastureDepleteRate(totalNext)
  const regen = pastureRegen(gs.pasture)
  const projHealth = Math.max(0, gs.pasture - depletion + regen)
  const eff = gs.pasture / 100
  const est = Math.round(gs.playerSheep * WOOL_PER_SHEEP * eff)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.fillText(`Estimated earnings: ${est} gold (efficiency ${Math.round(eff * 100)}%)`, CANVAS_W / 2, sy + 88)
  ctx.fillStyle = projHealth < 20 ? '#f87171' : '#64748b'
  ctx.fillText(`Total sheep on field: ${totalNext} | Projected pasture: ${Math.round(projHealth)}%`, CANVAS_W / 2, sy + 105)

  // Confirm button
  drawRoundRect(CANVAS_W / 2 - 70, sy + 120, 140, 40, 8)
  ctx.fillStyle = '#16a34a'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px monospace'
  ctx.fillText('Graze!', CANVAS_W / 2, sy + 147)
}

function drawResults() {
  const sy = 365
  ctx.fillStyle = '#0f1a0e'
  drawRoundRect(10, sy, CANVAS_W - 20, 170, 8)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.fillStyle = gs.phase === 'gameover' ? '#f87171' : '#4ade80'
  ctx.font = 'bold 14px monospace'
  ctx.fillText(gs.seasonResult, CANVAS_W / 2, sy + 34)

  ctx.font = '12px monospace'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`Pasture health: ${Math.round(gs.pasture)}%`, CANVAS_W / 2, sy + 58)

  drawRoundRect(CANVAS_W / 2 - 70, sy + 80, 140, 40, 8)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px monospace'
  ctx.fillText(`Season ${gs.season} →`, CANVAS_W / 2, sy + 107)
}

function drawGameOver() {
  ctx.textAlign = 'center'
  ctx.fillStyle = gs.pasture <= 0 ? '#f87171' : '#4ade80'
  ctx.font = 'bold 30px monospace'
  ctx.fillText(gs.pasture <= 0 ? 'THE COMMONS COLLAPSED!' : '20 Seasons Complete!', CANVAS_W / 2, 140)
  ctx.fillStyle = '#ffd166'
  ctx.font = 'bold 26px monospace'
  ctx.fillText(`Your Gold: ${gs.playerGold}`, CANVAS_W / 2, 188)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '15px monospace'
  ctx.fillText(`Best: ${gs.bestScore}`, CANVAS_W / 2, 222)
  ctx.fillText(`Pasture survived ${gs.season - 1} seasons`, CANVAS_W / 2, 250)

  // Leaderboard
  const all = [
    { name: 'You', gold: gs.playerGold, color: '#4ade80' },
    ...gs.shepherds.map(s => ({ name: s.name, gold: s.gold, color: s.color })),
  ].sort((a, b) => b.gold - a.gold)

  all.forEach((p, i) => {
    const ry = 278 + i * 42
    ctx.fillStyle = '#1e293b'
    drawRoundRect(140, ry, CANVAS_W - 280, 34, 6)
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.fillStyle = p.color
    ctx.font = 'bold 13px monospace'
    ctx.fillText(`${i + 1}. ${p.name}`, 156, ry + 22)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#ffd166'
    ctx.fillText(`$${p.gold}`, CANVAS_W - 156, ry + 22)
  })

  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 90, 160, 46, 10)
  ctx.fillStyle = '#16a34a'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('Play Again', CANVAS_W / 2, CANVAS_H - 58)
}

// ── Slider interaction ────────────────────────────────────────────────────────

let sliderDragging = false

function getCanvasPoint(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (clientX - rect.left) * (CANVAS_W / rect.width),
    y: (clientY - rect.top) * (CANVAS_H / rect.height),
  }
}

function updateSlider(clientX: number) {
  const rect = canvas.getBoundingClientRect()
  const cx = (clientX - rect.left) * (CANVAS_W / rect.width)
  const slX = 60, slW = CANVAS_W - 140
  const frac = Math.max(0, Math.min(1, (cx - slX) / slW))
  gs.playerSheep = Math.round(frac * MAX_SHEEP)
}

function handlePointerDown(cx: number, cy: number, rawClientX: number) {
  if (gs.phase === 'start') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 110 && cy <= CANVAS_H - 60) startGame()
    return
  }
  if (gs.phase === 'gameover') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 90 && cy <= CANVAS_H - 44) startGame()
    return
  }
  if (gs.phase === 'results') {
    const sy = 365
    if (cx >= CANVAS_W / 2 - 70 && cx <= CANVAS_W / 2 + 70 && cy >= sy + 80 && cy <= sy + 120) {
      audio.click()
      gs.phase = 'choosing'
    }
    return
  }
  if (gs.phase === 'choosing') {
    const sy = 365
    const slY = sy + 50
    // Slider
    if (cy >= slY - 14 && cy <= slY + 26) {
      sliderDragging = true
      updateSlider(rawClientX)
      return
    }
    // Confirm
    if (cx >= CANVAS_W / 2 - 70 && cx <= CANVAS_W / 2 + 70 && cy >= sy + 120 && cy <= sy + 160) {
      audio.click()
      confirmChoice()
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  const p = getCanvasPoint(e.clientX, e.clientY)
  handlePointerDown(p.x, p.y, e.clientX)
})
canvas.addEventListener('mousemove', (e) => {
  if (sliderDragging) updateSlider(e.clientX)
})
canvas.addEventListener('mouseup', () => { sliderDragging = false })
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const t = e.changedTouches[0]
  const p = getCanvasPoint(t.clientX, t.clientY)
  handlePointerDown(p.x, p.y, t.clientX)
}, { passive: false })
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault()
  if (sliderDragging) updateSlider(e.changedTouches[0].clientX)
}, { passive: false })
canvas.addEventListener('touchend', (e) => {
  e.preventDefault()
  sliderDragging = false
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
