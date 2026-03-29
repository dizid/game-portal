import { audio } from './audio'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Types ─────────────────────────────────────────────────────────────────────

interface Road {
  from: number    // node index
  to: number
  label: string   // e.g. "10 + n/5"
  cost: (n: number) => number
  cars: number    // assigned cars
  tollCost?: number
  carpool?: boolean
}

interface Node {
  x: number
  y: number
  label: string
}

interface Level {
  nodes: Node[]
  roads: Road[]
  totalCars: number
  description: string
  paradoxNote?: string
  theoreticalOptimum: number
  theoreticalConfig?: string
}

type GamePhase = 'start' | 'playing' | 'result' | 'gameover'

interface AnimCar {
  roadIdx: number
  t: number  // 0..1 progress
  speed: number
}

interface GameState {
  phase: GamePhase
  level: number
  levels: Level[]
  message: string
  score: number
  bestScore: number
  totalScore: number
  animCars: AnimCar[]
  animating: boolean
  animTimer: number
  dragging: number | null  // road index being dragged
  dragStartX: number
  lastResults: { playerAvg: number; optimum: number; pct: number } | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 700
const CANVAS_H = 560

// ── Level Definitions ──────────────────────────────────────────────────────────

function makeLevel1(): Level {
  return {
    nodes: [
      { x: 80, y: 200, label: 'S' },
      { x: 620, y: 200, label: 'D' },
    ],
    roads: [
      { from: 0, to: 1, label: '10 + n/10', cost: (n) => 10 + n / 10, cars: 50 },
      { from: 0, to: 1, label: '20', cost: (_n) => 20, cars: 50 },
    ],
    totalCars: 100,
    description: 'Two routes: one fixed, one congestion-based. Find the equilibrium.',
    theoreticalOptimum: 15,
    theoreticalConfig: '50/50 split = avg 15',
  }
}

function makeLevel2(): Level {
  return {
    nodes: [
      { x: 80, y: 200, label: 'S' },
      { x: 620, y: 200, label: 'D' },
    ],
    roads: [
      { from: 0, to: 1, label: '5 + n/5', cost: (n) => 5 + n / 5, cars: 33 },
      { from: 0, to: 1, label: '8 + n/20', cost: (n) => 8 + n / 20, cars: 34 },
      { from: 0, to: 1, label: '30', cost: (_n) => 30, cars: 33 },
    ],
    totalCars: 100,
    description: 'Three routes. Route C is fixed but expensive. When is it worth using?',
    theoreticalOptimum: 12,
    theoreticalConfig: '70/30/0 split ≈ avg 12',
  }
}

function makeLevel3(): Level {
  return {
    nodes: [
      { x: 80, y: 200, label: 'S' },
      { x: 350, y: 100, label: 'M' },
      { x: 620, y: 200, label: 'D' },
    ],
    roads: [
      { from: 0, to: 2, label: '15 + n/8', cost: (n) => 15 + n / 8, cars: 50 },
      { from: 0, to: 1, label: '6 + n/10', cost: (n) => 6 + n / 10, cars: 30 },
      { from: 1, to: 2, label: '6 + n/10', cost: (n) => 6 + n / 10, cars: 30 },
    ],
    totalCars: 100,
    description: 'Two-hop route via M competes with direct. Balance wisely.',
    theoreticalOptimum: 22,
    theoreticalConfig: '40 direct + 60 via M ≈ avg 22',
  }
}

function makeLevel4(): Level {
  // Braess paradox! Adding road makes things WORSE
  return {
    nodes: [
      { x: 80, y: 200, label: 'S' },
      { x: 350, y: 80,  label: 'A' },
      { x: 350, y: 320, label: 'B' },
      { x: 620, y: 200, label: 'D' },
    ],
    roads: [
      { from: 0, to: 1, label: 'n/100', cost: (n) => n / 100, cars: 50 },
      { from: 0, to: 2, label: '45', cost: (_n) => 45, cars: 50 },
      { from: 1, to: 3, label: '45', cost: (_n) => 45, cars: 50 },
      { from: 2, to: 3, label: 'n/100', cost: (n) => n / 100, cars: 50 },
      { from: 1, to: 2, label: '0 (NEW!)', cost: (_n) => 0, cars: 0 },
    ],
    totalCars: 100,
    description: '⚠️ BRAESS PARADOX! A new 0-cost road was added. Try routing 100 cars via S→A→B→D…',
    paradoxNote: 'The new A→B road makes EVERYONE worse off! Optimal: ignore it.',
    theoreticalOptimum: 65,
    theoreticalConfig: '50 via S→A→D + 50 via S→B→D = avg 65',
  }
}

function makeLevel5(): Level {
  return {
    nodes: [
      { x: 80, y: 200, label: 'S' },
      { x: 620, y: 200, label: 'D' },
    ],
    roads: [
      { from: 0, to: 1, label: 'n/5 + toll $2', cost: (n) => n / 5 + 2, cars: 50, tollCost: 2 },
      { from: 0, to: 1, label: '18', cost: (_n) => 18, cars: 50 },
    ],
    totalCars: 100,
    description: 'Tolls on Route A shift demand. Factor in monetary cost too!',
    theoreticalOptimum: 16,
    theoreticalConfig: '40 tolled + 60 free = avg 16',
  }
}

function makeLevel6(): Level {
  return {
    nodes: [
      { x: 80, y: 200, label: 'S' },
      { x: 350, y: 80,  label: 'HOV' },
      { x: 620, y: 200, label: 'D' },
    ],
    roads: [
      { from: 0, to: 2, label: 'n/4', cost: (n) => n / 4, cars: 70 },
      { from: 0, to: 1, label: 'n/20 (carpool)', cost: (n) => n / 20, cars: 15, carpool: true },
      { from: 1, to: 2, label: '5', cost: (_n) => 5, cars: 15, carpool: true },
    ],
    totalCars: 100,
    description: 'Carpool lane via HOV node is faster per car. Route carpoolers efficiently!',
    theoreticalOptimum: 18,
    theoreticalConfig: '30 direct + 70 HOV = avg 18',
  }
}

function makeLevel7(): Level {
  return {
    nodes: [
      { x: 80, y: 200, label: 'S' },
      { x: 620, y: 200, label: 'D' },
    ],
    roads: [
      { from: 0, to: 1, label: 'AM: n/3', cost: (n) => n / 3, cars: 33, label2: 'Peak' } as Road & { label2?: string },
      { from: 0, to: 1, label: 'Off: n/15', cost: (n) => n / 15, cars: 33 },
      { from: 0, to: 1, label: 'PM: n/6', cost: (n) => n / 6, cars: 34 },
    ] as Road[],
    totalCars: 100,
    description: 'Time-of-day pricing: morning, off-peak, and afternoon rates differ.',
    theoreticalOptimum: 14,
    theoreticalConfig: '20 AM + 60 off + 20 PM = avg 14',
  }
}

function makeLevel8(): Level {
  return {
    nodes: [
      { x: 80, y: 220, label: 'S' },
      { x: 280, y: 100, label: 'N' },
      { x: 280, y: 340, label: 'S2' },
      { x: 480, y: 100, label: 'E' },
      { x: 480, y: 340, label: 'W' },
      { x: 620, y: 220, label: 'D' },
    ],
    roads: [
      { from: 0, to: 1, label: 'n/10', cost: (n) => n / 10, cars: 25 },
      { from: 0, to: 2, label: '12', cost: (_n) => 12, cars: 25 },
      { from: 1, to: 3, label: '8', cost: (_n) => 8, cars: 25 },
      { from: 2, to: 4, label: 'n/8', cost: (n) => n / 8, cars: 25 },
      { from: 3, to: 5, label: 'n/12', cost: (n) => n / 12, cars: 25 },
      { from: 4, to: 5, label: '10', cost: (_n) => 10, cars: 25 },
      { from: 1, to: 4, label: '5+n/20', cost: (n) => 5 + n / 20, cars: 0 },
    ],
    totalCars: 100,
    description: 'Complex network. Find routes that minimize total delay across the grid.',
    theoreticalOptimum: 20,
    theoreticalConfig: 'Optimal split across all routes ≈ avg 20',
  }
}

function buildLevels(): Level[] {
  return [makeLevel1(), makeLevel2(), makeLevel3(), makeLevel4(), makeLevel5(), makeLevel6(), makeLevel7(), makeLevel8()]
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

// ── State ─────────────────────────────────────────────────────────────────────

let gs: GameState = {
  phase: 'start',
  level: 0,
  levels: buildLevels(),
  message: '',
  score: 0,
  bestScore: 0,
  totalScore: 0,
  animCars: [],
  animating: false,
  animTimer: 0,
  dragging: null,
  dragStartX: 0,
  lastResults: null,
}

function startLevel() {
  gs.animCars = []
  gs.animating = false
  gs.lastResults = null
  gs.message = ''
}

function startGame() {
  gs.levels = buildLevels()
  gs.level = 0
  gs.totalScore = 0
  gs.phase = 'playing'
  startLevel()
  audio.start()
}

// ── Simulation ────────────────────────────────────────────────────────────────

function computeAvgTime(): number {
  const lvl = gs.levels[gs.level]
  // For multi-hop routes, we need to sum edge costs
  // Find paths and accumulate cost × cars / total
  let totalTimeCars = 0
  for (const r of lvl.roads) {
    totalTimeCars += r.cost(r.cars) * r.cars
  }
  return totalTimeCars / lvl.totalCars
}

function spawnAnimCars() {
  gs.animCars = []
  const lvl = gs.levels[gs.level]
  for (let ri = 0; ri < lvl.roads.length; ri++) {
    const road = lvl.roads[ri]
    const count = Math.min(road.cars, 8) // max 8 visual cars per road
    for (let c = 0; c < count; c++) {
      gs.animCars.push({
        roadIdx: ri,
        t: (c / count) * 0.8,
        speed: 0.003 + Math.random() * 0.002,
      })
    }
  }
}

function submitAssignment() {
  const lvl = gs.levels[gs.level]
  // Verify sum
  const sum = lvl.roads.reduce((a, r) => a + r.cars, 0)
  if (sum !== lvl.totalCars) {
    gs.message = `Must assign exactly ${lvl.totalCars} cars! Currently: ${sum}`
    return
  }
  const playerAvg = computeAvgTime()
  const pct = Math.max(0, Math.min(100, Math.round((lvl.theoreticalOptimum / playerAvg) * 100)))
  gs.lastResults = { playerAvg: Math.round(playerAvg * 10) / 10, optimum: lvl.theoreticalOptimum, pct }
  const roundScore = pct
  gs.totalScore += roundScore
  gs.phase = 'result'
  spawnAnimCars()
  audio.score()
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

function drawArrow(x1: number, y1: number, x2: number, y2: number, color: string) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const ux = dx / len, uy = dy / len
  const endX = x2 - ux * 18
  const endY = y2 - uy * 18
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x1 + ux * 18, y1 + uy * 18)
  ctx.lineTo(endX, endY)
  ctx.stroke()
  // Arrow head
  const angle = Math.atan2(dy, dx)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x2 - ux * 18, y2 - uy * 18)
  ctx.lineTo(
    x2 - ux * 28 - Math.cos(angle + Math.PI / 6) * 10,
    y2 - uy * 28 - Math.sin(angle + Math.PI / 6) * 10
  )
  ctx.lineTo(
    x2 - ux * 28 - Math.cos(angle - Math.PI / 6) * 10,
    y2 - uy * 28 - Math.sin(angle - Math.PI / 6) * 10
  )
  ctx.closePath()
  ctx.fill()
}

// ── Draw ──────────────────────────────────────────────────────────────────────

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  bg.addColorStop(0, '#0a0a1a')
  bg.addColorStop(1, '#0d1117')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  if (gs.phase === 'start') { drawStart(); return }
  if (gs.phase === 'gameover') { drawGameOverScreen(); return }

  drawLevel()
  if (gs.phase === 'result') drawResultOverlay()
}

function drawStart() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 36px monospace'
  ctx.fillText('Price of Anarchy', CANVAS_W / 2, 150)
  ctx.font = '14px monospace'
  ctx.fillStyle = '#94a3b8'
  const lines = [
    'Assign 100 cars across road networks.',
    'Minimize the average commute time.',
    '',
    '8 levels including the Braess Paradox —',
    'where adding a road makes things WORSE!',
    '',
    'Drag sliders to assign cars to each route.',
    'Score = how close you get to the optimum.',
  ]
  lines.forEach((l, i) => ctx.fillText(l, CANVAS_W / 2, 210 + i * 26))
  // Play button
  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 110, 160, 50, 10)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('Play', CANVAS_W / 2, CANVAS_H - 78)
}

function drawLevel() {
  const lvl = gs.levels[gs.level]

  // Header
  ctx.fillStyle = '#1e293b'
  drawRoundRect(10, 10, CANVAS_W - 20, 44, 8)
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.fillText(`LEVEL ${gs.level + 1}/8`, 20, 29)
  ctx.fillStyle = '#e2e8f0'
  ctx.font = 'bold 12px monospace'
  ctx.fillText(lvl.description, 90, 29)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffd166'
  ctx.font = 'bold 14px monospace'
  ctx.fillText(`Score: ${gs.totalScore}`, CANVAS_W - 15, 33)

  if (lvl.paradoxNote) {
    ctx.fillStyle = '#fbbf24'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(lvl.paradoxNote, CANVAS_W / 2, 63)
  }

  // Draw road network
  const nodes = lvl.nodes
  const roads = lvl.roads

  // Roads
  roads.forEach((road, ri) => {
    const n1 = nodes[road.from]
    const n2 = nodes[road.to]
    const color = road.carpool ? '#06d6a0' : road.tollCost ? '#ffd166' : '#4a9eff'
    // Multiple roads between same nodes: offset
    const sameRoads = roads.filter((r, i) => i < ri && r.from === road.from && r.to === road.to).length
    const totalSame = roads.filter(r => r.from === road.from && r.to === road.to).length
    if (totalSame > 1) {
      // Offset parallel roads
      const offset = (sameRoads - (totalSame - 1) / 2) * 22
      const mx = (n1.x + n2.x) / 2
      const my = (n1.y + n2.y) / 2
      const dx = n2.x - n1.x, dy = n2.y - n1.y
      const len = Math.sqrt(dx * dx + dy * dy)
      const px = -dy / len * offset, py = dx / len * offset
      ctx.strokeStyle = color + '88'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(n1.x, n1.y)
      ctx.quadraticCurveTo(mx + px, my + py, n2.x, n2.y)
      ctx.stroke()
      // Label at midpoint
      ctx.fillStyle = color
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(road.label, mx + px, my + py - 8)
    } else {
      drawArrow(n1.x, n1.y, n2.x, n2.y, color + '88')
      const mx = (n1.x + n2.x) / 2
      const my = (n1.y + n2.y) / 2
      ctx.fillStyle = color
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(road.label, mx, my - 14)
    }

    // Animated cars
    if (gs.animating) {
      for (const car of gs.animCars) {
        if (car.roadIdx !== ri) continue
        let cx2: number, cy2: number
        const sameParallel = roads.filter((r, i) => i < ri && r.from === road.from && r.to === road.to).length
        const totSame = roads.filter(r => r.from === road.from && r.to === road.to).length
        if (totSame > 1) {
          const offset2 = (sameParallel - (totSame - 1) / 2) * 22
          const mx2 = (n1.x + n2.x) / 2, my2 = (n1.y + n2.y) / 2
          const dx2 = n2.x - n1.x, dy2 = n2.y - n1.y
          const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
          const px2 = -dy2 / len2 * offset2, py2 = dx2 / len2 * offset2
          const t = car.t
          cx2 = (1 - t) * (1 - t) * n1.x + 2 * (1 - t) * t * (mx2 + px2) + t * t * n2.x
          cy2 = (1 - t) * (1 - t) * n1.y + 2 * (1 - t) * t * (my2 + py2) + t * t * n2.y
        } else {
          cx2 = n1.x + (n2.x - n1.x) * car.t
          cy2 = n1.y + (n2.y - n1.y) * car.t
        }
        ctx.beginPath()
        ctx.arc(cx2, cy2, 4, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }
    }
  })

  // Nodes
  for (const node of nodes) {
    ctx.beginPath()
    ctx.arc(node.x, node.y, 20, 0, Math.PI * 2)
    ctx.fillStyle = node.label === 'S' ? '#22c55e' : node.label === 'D' ? '#ef4444' : '#3b82f6'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(node.label, node.x, node.y + 5)
  }

  // Sliders area
  const sliderY = 400
  ctx.fillStyle = '#0f172a'
  drawRoundRect(10, sliderY - 10, CANVAS_W - 20, 130, 8)
  ctx.fill()

  const carsLeft = lvl.totalCars - lvl.roads.reduce((a, r) => a + r.cars, 0)
  ctx.fillStyle = carsLeft === 0 ? '#4ade80' : '#fbbf24'
  ctx.font = 'bold 13px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`Cars to assign: ${Math.abs(carsLeft)} ${carsLeft < 0 ? 'OVER' : carsLeft === 0 ? '✓ READY' : 'remaining'}`, CANVAS_W / 2, sliderY + 8)

  // Road sliders
  roads.forEach((road, ri) => {
    const slotW = (CANVAS_W - 40) / roads.length
    const sx = 20 + ri * slotW
    const sy = sliderY + 30
    const sliderW = slotW - 16

    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#94a3b8'
    const n1 = nodes[road.from]
    const n2 = nodes[road.to]
    ctx.fillText(`${n1.label}→${n2.label}`, sx + sliderW / 2, sy - 4)

    // Track
    drawRoundRect(sx, sy + 10, sliderW, 10, 5)
    ctx.fillStyle = '#1e293b'
    ctx.fill()

    const frac = road.cars / lvl.totalCars
    drawRoundRect(sx, sy + 10, sliderW * frac, 10, 5)
    ctx.fillStyle = road.carpool ? '#06d6a0' : '#4a9eff'
    ctx.fill()

    // Thumb
    const thumbX = sx + sliderW * frac
    ctx.beginPath()
    ctx.arc(thumbX, sy + 15, 10, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2
    ctx.stroke()

    // Cars label
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#e2e8f0'
    ctx.fillText(`${road.cars}`, sx + sliderW / 2, sy + 50)
    ctx.font = '9px monospace'
    ctx.fillStyle = '#64748b'
    ctx.fillText(`cost=${Math.round(road.cost(road.cars) * 10) / 10}`, sx + sliderW / 2, sy + 62)
  })

  // Submit button
  const bx = CANVAS_W / 2 - 70, by = sliderY + 100
  drawRoundRect(bx, by, 140, 38, 8)
  ctx.fillStyle = carsLeft === 0 ? '#10b981' : '#334155'
  ctx.fill()
  ctx.fillStyle = carsLeft === 0 ? '#fff' : '#64748b'
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('Submit', CANVAS_W / 2, by + 25)

  // Message
  if (gs.message) {
    ctx.fillStyle = '#fbbf24'
    ctx.font = '12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(gs.message, CANVAS_W / 2, by - 6)
  }
}

function drawResultOverlay() {
  if (!gs.lastResults) return
  const { playerAvg, optimum, pct } = gs.lastResults
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  ctx.fillRect(0, 0, CANVAS_W, 380)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#e2e8f0'
  ctx.font = 'bold 24px monospace'
  ctx.fillText('Results', CANVAS_W / 2, 100)
  ctx.font = '16px monospace'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`Your avg commute: ${playerAvg} mins`, CANVAS_W / 2, 140)
  ctx.fillStyle = '#4ade80'
  ctx.fillText(`Theoretical optimum: ${optimum} mins`, CANVAS_W / 2, 168)
  ctx.fillStyle = '#ffd166'
  ctx.font = 'bold 20px monospace'
  ctx.fillText(`Efficiency: ${pct}%  (+${pct} pts)`, CANVAS_W / 2, 210)

  // Bar
  const bw = 300
  drawRoundRect(CANVAS_W / 2 - bw / 2, 228, bw, 14, 7)
  ctx.fillStyle = '#1e293b'
  ctx.fill()
  drawRoundRect(CANVAS_W / 2 - bw / 2, 228, bw * pct / 100, 14, 7)
  ctx.fillStyle = pct >= 90 ? '#4ade80' : pct >= 70 ? '#ffd166' : '#f87171'
  ctx.fill()

  const isLast = gs.level >= 7
  const bx = CANVAS_W / 2 - 80, by = 260
  drawRoundRect(bx, by, 160, 42, 8)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 15px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(isLast ? 'Finish' : 'Next Level →', CANVAS_W / 2, by + 28)
}

function drawGameOverScreen() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 32px monospace'
  ctx.fillText('Game Complete!', CANVAS_W / 2, 160)
  ctx.font = 'bold 24px monospace'
  ctx.fillStyle = '#ffd166'
  ctx.fillText(`Total Score: ${gs.totalScore} / 800`, CANVAS_W / 2, 220)
  ctx.font = '16px monospace'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`Best: ${gs.bestScore}`, CANVAS_W / 2, 260)
  ctx.fillText('Each level scored by efficiency vs optimum.', CANVAS_W / 2, 300)
  ctx.fillText('Did you avoid the Braess trap on level 4?', CANVAS_W / 2, 330)

  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 110, 160, 50, 10)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('Play Again', CANVAS_W / 2, CANVAS_H - 78)
}

// ── Slider Interaction ────────────────────────────────────────────────────────

function getSliderInfo(ri: number): { sx: number; sy: number; sliderW: number } {
  const lvl = gs.levels[gs.level]
  const slotW = (CANVAS_W - 40) / lvl.roads.length
  const sliderY = 400
  const sx = 20 + ri * slotW
  const sy = sliderY + 30
  const sliderW = slotW - 16
  return { sx, sy, sliderW }
}

function updateSlider(roadIdx: number, clientX: number) {
  const lvl = gs.levels[gs.level]
  const { sx, sliderW } = getSliderInfo(roadIdx)
  const rect = canvas.getBoundingClientRect()
  const scaleX = CANVAS_W / rect.width
  const canvasX = (clientX - rect.left) * scaleX
  const frac = Math.max(0, Math.min(1, (canvasX - sx) / sliderW))
  const newCars = Math.round(frac * lvl.totalCars)
  const oldCars = lvl.roads[roadIdx].cars
  const diff = newCars - oldCars
  // Distribute diff across other roads
  let remaining = diff
  const otherIndices = lvl.roads.map((_, i) => i).filter(i => i !== roadIdx)
  // Try to take from/give to other roads proportionally
  for (const oi of otherIndices) {
    if (remaining === 0) break
    const other = lvl.roads[oi]
    if (remaining < 0) {
      const give = Math.min(-remaining, lvl.totalCars - other.cars)
      other.cars += give
      remaining += give
    } else {
      const take = Math.min(remaining, other.cars)
      other.cars -= take
      remaining -= take
    }
  }
  lvl.roads[roadIdx].cars = newCars - (diff - (diff - remaining))
  // Clamp
  lvl.roads[roadIdx].cars = Math.max(0, lvl.roads[roadIdx].cars)
  gs.message = ''
}

function getCanvasPoint(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (clientX - rect.left) * (CANVAS_W / rect.width),
    y: (clientY - rect.top) * (CANVAS_H / rect.height),
  }
}

function handlePointerDown(cx: number, cy: number, rawClientX: number) {
  if (gs.phase === 'start') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 110 && cy <= CANVAS_H - 60) {
      startGame()
    }
    return
  }
  if (gs.phase === 'gameover') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 110 && cy <= CANVAS_H - 60) {
      startGame()
    }
    return
  }
  if (gs.phase === 'result') {
    const bx = CANVAS_W / 2 - 80, by = 260
    if (cx >= bx && cx <= bx + 160 && cy >= by && cy <= by + 42) {
      audio.click()
      if (gs.level >= 7) {
        gs.totalScore = Math.round(gs.totalScore)
        if (gs.totalScore > gs.bestScore) {
          gs.bestScore = gs.totalScore
          saveBestScore(gs.bestScore)
        }
        reportGameOver(gs.totalScore)
        gs.phase = 'gameover'
      } else {
        gs.level++
        gs.phase = 'playing'
        startLevel()
      }
    }
    return
  }
  // Playing — check sliders
  const lvl = gs.levels[gs.level]
  const sliderY = 400
  for (let ri = 0; ri < lvl.roads.length; ri++) {
    const { sx, sy, sliderW } = getSliderInfo(ri)
    const thumbX = sx + sliderW * (lvl.roads[ri].cars / lvl.totalCars)
    if (Math.abs(cx - thumbX) < 18 && cy >= sy + 5 && cy <= sy + 25) {
      gs.dragging = ri
      updateSlider(ri, rawClientX)
      return
    }
    // Click on track
    if (cx >= sx && cx <= sx + sliderW && cy >= sy + 5 && cy <= sy + 25) {
      gs.dragging = ri
      updateSlider(ri, rawClientX)
      return
    }
  }
  // Submit button
  const bx = CANVAS_W / 2 - 70, by = sliderY + 100
  if (cx >= bx && cx <= bx + 140 && cy >= by && cy <= by + 38) {
    audio.click()
    submitAssignment()
  }
}

function handlePointerMove(rawClientX: number) {
  if (gs.dragging !== null) {
    updateSlider(gs.dragging, rawClientX)
  }
}

canvas.addEventListener('mousedown', (e) => {
  const p = getCanvasPoint(e.clientX, e.clientY)
  handlePointerDown(p.x, p.y, e.clientX)
})
canvas.addEventListener('mousemove', (e) => {
  if (e.buttons > 0) handlePointerMove(e.clientX)
})
canvas.addEventListener('mouseup', () => { gs.dragging = null })

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const t = e.changedTouches[0]
  const p = getCanvasPoint(t.clientX, t.clientY)
  handlePointerDown(p.x, p.y, t.clientX)
}, { passive: false })
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault()
  const t = e.changedTouches[0]
  handlePointerMove(t.clientX)
}, { passive: false })
canvas.addEventListener('touchend', (e) => {
  e.preventDefault()
  gs.dragging = null
}, { passive: false })

muteBtn.addEventListener('click', () => {
  muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊'
})

// ── Loop ──────────────────────────────────────────────────────────────────────

function loop() {
  if (gs.phase === 'result' && gs.animating) {
    for (const car of gs.animCars) {
      car.t += car.speed
      if (car.t > 1) car.t = 0
    }
  }
  draw()
  requestAnimationFrame(loop)
}

initSDK().then(({ bestScore }) => {
  gs.bestScore = bestScore
  loop()
})
