import { audio } from './audio.js'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Rabbit {
  x: number
  y: number
  vx: number
  vy: number
  energy: number
  fed: boolean
  id: number
}

interface GrassPatch {
  x: number
  y: number
  amount: number
  maxAmount: number
}

interface RivalFox {
  x: number
  y: number
  vx: number
  vy: number
  energy: number
}

interface GraphPoint {
  grass: number
  rabbits: number
  energy: number
}

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const container = document.getElementById('game-container')!

function resize(): void {
  const s = Math.min(container.clientWidth, container.clientHeight - 80)
  canvas.width = Math.max(320, s)
  canvas.height = Math.max(320, s)
  canvas.style.width = canvas.width + 'px'
  canvas.style.height = canvas.height + 'px'
}
resize()
window.addEventListener('resize', resize)

// ── Constants ─────────────────────────────────────────────────────────────────

const GRASS_COUNT = 25
const RABBIT_START = 12
const FOX_SPEED = 2.8
const GRAPH_H = 70

// ── State ─────────────────────────────────────────────────────────────────────

let foxX = 0, foxY = 0
let foxEnergy = 100
let rabbits: Rabbit[] = []
let grassPatches: GrassPatch[] = []
let rivalFoxes: RivalFox[] = []
let elapsed = 0
let running = false
let gameOver = false
let bestScore = 0
let nextMutation = 90
let rabbitSpeed = 1.2
let grassGrowthRate = 0.15
let rabbitIdCounter = 0
let graphHistory: GraphPoint[] = []
let graphTimer = 0
let lastTime = 0

const keys: Record<string, boolean> = {}
let touchDx = 0, touchDy = 0
let touchStartX = 0, touchStartY = 0

// ── Init functions ────────────────────────────────────────────────────────────

function initGrass(): void {
  grassPatches = []
  const w = canvas.width
  const h = canvas.height - GRAPH_H
  for (let i = 0; i < GRASS_COUNT; i++) {
    grassPatches.push({
      x: 20 + Math.random() * (w - 40),
      y: 50 + Math.random() * (h - 80),
      amount: 0.5 + Math.random() * 0.5,
      maxAmount: 0.8 + Math.random() * 0.2,
    })
  }
}

function initRabbits(): void {
  rabbits = []
  const w = canvas.width
  const h = canvas.height - GRAPH_H
  for (let i = 0; i < RABBIT_START; i++) {
    rabbits.push(spawnRabbit(20 + Math.random() * (w - 40), 50 + Math.random() * (h - 80)))
  }
}

function spawnRabbit(x: number, y: number): Rabbit {
  const angle = Math.random() * Math.PI * 2
  return {
    x, y,
    vx: Math.cos(angle) * rabbitSpeed,
    vy: Math.sin(angle) * rabbitSpeed,
    energy: 50 + Math.random() * 50,
    fed: false,
    id: rabbitIdCounter++,
  }
}

// ── Mutation events ───────────────────────────────────────────────────────────

const mutationBanner = document.getElementById('mutation-banner') as HTMLDivElement

function triggerMutation(): void {
  const events = [
    () => { rabbitSpeed = Math.min(2.5, rabbitSpeed + 0.5); return 'MUTATION: Rabbits got faster!' },
    () => {
      const w = canvas.width
      const h = canvas.height - GRAPH_H
      rivalFoxes.push({ x: w * 0.1, y: h * 0.1, vx: 1, vy: 0.5, energy: 150 })
      return 'MUTATION: Rival fox appeared!'
    },
    () => { grassGrowthRate = Math.max(0.04, grassGrowthRate * 0.5); return 'MUTATION: Drought! Grass growth halved.' },
  ]
  const event = events[Math.floor(Math.random() * events.length)]
  const msg = event()
  mutationBanner.textContent = msg
  mutationBanner.style.display = 'block'
  audio.combo()
  setTimeout(() => { mutationBanner.style.display = 'none' }, 2500)
}

// ── Update ────────────────────────────────────────────────────────────────────

function update(dt: number): void {
  if (!running || gameOver) return

  elapsed += dt
  const w = canvas.width
  const h = canvas.height - GRAPH_H

  // Mutation events
  if (elapsed >= nextMutation) {
    nextMutation += 90
    triggerMutation()
  }

  // Fox movement (keys or touch)
  let dx = 0, dy = 0
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) dx -= 1
  if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1
  if (keys['ArrowUp'] || keys['w'] || keys['W']) dy -= 1
  if (keys['ArrowDown'] || keys['s'] || keys['S']) dy += 1
  if (touchDx !== 0 || touchDy !== 0) { dx = touchDx; dy = touchDy }

  const mag = Math.sqrt(dx * dx + dy * dy)
  if (mag > 0) {
    foxX += (dx / mag) * FOX_SPEED
    foxY += (dy / mag) * FOX_SPEED
  }
  foxX = Math.max(10, Math.min(w - 10, foxX))
  foxY = Math.max(50, Math.min(h - 10, foxY))

  // Fox energy drain
  foxEnergy -= 0.04 * dt * 60
  if (foxEnergy <= 0) { foxEnergy = 0; endGame(); return }

  // Grass regrowth
  for (const g of grassPatches) {
    if (g.amount < g.maxAmount) {
      g.amount = Math.min(g.maxAmount, g.amount + grassGrowthRate * dt)
    }
  }

  // Rabbit AI
  for (const r of rabbits) {
    // Find nearest grass
    let nearestG: GrassPatch | null = null
    let nearestGDist = Infinity
    for (const g of grassPatches) {
      if (g.amount > 0.2) {
        const d = Math.hypot(r.x - g.x, r.y - g.y)
        if (d < nearestGDist) { nearestGDist = d; nearestG = g }
      }
    }

    // Flee from foxes
    const fleeRange = 80
    let fleeX = 0, fleeY = 0
    const allFoxes = [{ x: foxX, y: foxY }, ...rivalFoxes]
    for (const fx of allFoxes) {
      const fd = Math.hypot(r.x - fx.x, r.y - fx.y)
      if (fd < fleeRange && fd > 0) {
        fleeX += (r.x - fx.x) / fd
        fleeY += (r.y - fx.y) / fd
      }
    }

    const fleeStrength = Math.sqrt(fleeX * fleeX + fleeY * fleeY)
    if (fleeStrength > 0.1) {
      r.vx = fleeX / fleeStrength * rabbitSpeed
      r.vy = fleeY / fleeStrength * rabbitSpeed
    } else if (nearestG && nearestGDist < 150) {
      const ang = Math.atan2(nearestG.y - r.y, nearestG.x - r.x)
      r.vx += Math.cos(ang) * 0.1
      r.vy += Math.sin(ang) * 0.1
    } else {
      r.vx += (Math.random() - 0.5) * 0.3
      r.vy += (Math.random() - 0.5) * 0.3
    }

    const rspeed = Math.sqrt(r.vx * r.vx + r.vy * r.vy)
    if (rspeed > rabbitSpeed) { r.vx *= rabbitSpeed / rspeed; r.vy *= rabbitSpeed / rspeed }

    r.x += r.vx
    r.y += r.vy
    r.x = Math.max(8, Math.min(w - 8, r.x))
    r.y = Math.max(50, Math.min(h - 8, r.y))
    if (r.x <= 8 || r.x >= w - 8) r.vx *= -1
    if (r.y <= 50 || r.y >= h - 8) r.vy *= -1

    // Eat grass
    if (nearestG && nearestGDist < 15) {
      const eat = Math.min(nearestG.amount, 0.05)
      nearestG.amount -= eat
      r.energy = Math.min(120, r.energy + eat * 40)
      r.fed = r.energy > 80
    }

    r.energy -= 0.03 * dt * 60
  }

  // Rabbit reproduction
  const fed = rabbits.filter(r => r.fed && r.energy > 90)
  if (fed.length >= 2 && rabbits.length < 40 && Math.random() < 0.005 * dt * 60) {
    const parent = fed[Math.floor(Math.random() * fed.length)]
    parent.energy -= 30
    rabbits.push(spawnRabbit(
      parent.x + (Math.random() - 0.5) * 20,
      parent.y + (Math.random() - 0.5) * 20,
    ))
  }

  // Rabbit starvation
  rabbits = rabbits.filter(r => r.energy > 0)

  if (rabbits.length === 0) { endGame(); return }

  // Fox eats rabbit
  const eatDist = 14
  for (let i = rabbits.length - 1; i >= 0; i--) {
    const r = rabbits[i]
    const d = Math.hypot(foxX - r.x, foxY - r.y)
    if (d < eatDist) {
      rabbits.splice(i, 1)
      foxEnergy = Math.min(200, foxEnergy + 40)
      audio.score()
    }
  }

  // Rival fox AI
  for (const rf of rivalFoxes) {
    if (rabbits.length > 0) {
      let nearest: Rabbit | null = null
      let nearestD = Infinity
      for (const r of rabbits) {
        const d = Math.hypot(rf.x - r.x, rf.y - r.y)
        if (d < nearestD) { nearestD = d; nearest = r }
      }
      if (nearest) {
        const ang = Math.atan2(nearest.y - rf.y, nearest.x - rf.x)
        rf.vx += Math.cos(ang) * 0.15
        rf.vy += Math.sin(ang) * 0.15
      }
    }
    const rs2 = Math.sqrt(rf.vx * rf.vx + rf.vy * rf.vy)
    if (rs2 > 2) { rf.vx *= 2 / rs2; rf.vy *= 2 / rs2 }
    rf.x += rf.vx
    rf.y += rf.vy
    rf.x = Math.max(8, Math.min(w - 8, rf.x))
    rf.y = Math.max(50, Math.min(h - 8, rf.y))

    for (let i = rabbits.length - 1; i >= 0; i--) {
      if (Math.hypot(rf.x - rabbits[i].x, rf.y - rabbits[i].y) < 12) {
        rabbits.splice(i, 1)
        rf.energy = Math.min(200, rf.energy + 40)
      }
    }
    rf.energy -= 0.03 * dt * 60
  }
  rivalFoxes = rivalFoxes.filter(rf => rf.energy > 0)

  // Graph
  graphTimer += dt
  if (graphTimer >= 1) {
    graphTimer -= 1
    const totalGrass = grassPatches.reduce((s, g) => s + g.amount, 0)
    graphHistory.push({ grass: totalGrass / GRASS_COUNT, rabbits: rabbits.length, energy: foxEnergy })
    if (graphHistory.length > 90) graphHistory.shift()
  }

  // HUD
  ;(document.getElementById('time-val') as HTMLSpanElement).textContent = String(Math.floor(elapsed))
  ;(document.getElementById('rabbit-val') as HTMLSpanElement).textContent = String(rabbits.length)
  const totalGrass = grassPatches.reduce((s, g) => s + g.amount, 0)
  ;(document.getElementById('grass-val') as HTMLSpanElement).textContent = String(Math.floor(totalGrass))
  ;(document.getElementById('energy-bar') as HTMLDivElement).style.width = Math.max(0, Math.min(100, foxEnergy / 2)) + '%'
  const eColor = foxEnergy > 50 ? '#ffcc00' : foxEnergy > 25 ? '#ff8800' : '#ff2200'
  ;(document.getElementById('energy-bar') as HTMLDivElement).style.background = eColor
}

// ── Render ────────────────────────────────────────────────────────────────────

function draw(): void {
  const w = canvas.width
  const h = canvas.height
  const fieldH = h - GRAPH_H

  ctx.clearRect(0, 0, w, h)

  // Field background
  ctx.fillStyle = '#1a3a1a'
  ctx.fillRect(0, 0, w, fieldH)

  // Grid lines (subtle)
  ctx.strokeStyle = 'rgba(60,100,60,0.3)'
  ctx.lineWidth = 1
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, fieldH); ctx.stroke()
  }
  for (let y = 0; y < fieldH; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // Grass patches
  for (const g of grassPatches) {
    const alpha = g.amount
    const r = 8 + g.amount * 12
    ctx.globalAlpha = alpha * 0.7
    ctx.beginPath()
    ctx.arc(g.x, g.y, r, 0, Math.PI * 2)
    ctx.fillStyle = '#3a8a3a'
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // Rabbits
  for (const r of rabbits) {
    ctx.fillStyle = r.fed ? '#e0e0e0' : '#b8b8b8'
    ctx.beginPath()
    ctx.arc(r.x, r.y, 5, 0, Math.PI * 2)
    ctx.fill()
    // Ears
    ctx.fillStyle = '#ffcccc'
    ctx.beginPath()
    ctx.ellipse(r.x - 3, r.y - 7, 2, 4, -0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(r.x + 3, r.y - 7, 2, 4, 0.2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Rival foxes
  for (const rf of rivalFoxes) {
    drawFox(rf.x, rf.y, '#aa4488', rf.energy / 200)
  }

  // Player fox
  drawFox(foxX, foxY, '#dd8822', foxEnergy / 200)

  // Graph strip
  drawGraph(w, h, fieldH)
}

function drawFox(x: number, y: number, color: string, energyFrac: number): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 7, 0, Math.PI * 2)
  ctx.fill()
  // Ears
  ctx.fillStyle = '#ffaa55'
  ctx.beginPath()
  ctx.moveTo(x - 6, y - 5)
  ctx.lineTo(x - 10, y - 12)
  ctx.lineTo(x - 2, y - 8)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + 6, y - 5)
  ctx.lineTo(x + 10, y - 12)
  ctx.lineTo(x + 2, y - 8)
  ctx.closePath()
  ctx.fill()
  // Energy aura
  if (energyFrac < 0.3) {
    ctx.beginPath()
    ctx.arc(x, y, 10, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255,50,50,${0.6 * (1 - energyFrac / 0.3)})`
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

function drawGraph(w: number, h: number, fieldH: number): void {
  const gy = fieldH
  const gh = GRAPH_H

  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, gy, w, gh)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.strokeRect(0, gy, w, gh)

  if (graphHistory.length < 2) return

  const series: Array<[keyof GraphPoint, string, number]> = [
    ['grass', '#44bb44', 1],
    ['rabbits', '#cccccc', 40],
    ['energy', '#ff8800', 200],
  ]

  for (const [key, color, maxV] of series) {
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    for (let i = 0; i < graphHistory.length; i++) {
      const x = (i / (graphHistory.length - 1)) * w
      const val = Math.min(graphHistory[i][key], maxV)
      const y = gy + gh - 4 - (val / maxV) * (gh - 8)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

// ── Game lifecycle ────────────────────────────────────────────────────────────

function buildOverlay(title: string, body: string, btnLabel: string, onBtn: () => void): void {
  const ov = document.getElementById('overlay')!
  while (ov.firstChild) ov.removeChild(ov.firstChild)
  const h1 = document.createElement('h1')
  h1.textContent = title
  const p = document.createElement('p')
  p.textContent = body
  const btn = document.createElement('button')
  btn.textContent = btnLabel
  btn.addEventListener('click', onBtn)
  ov.appendChild(h1)
  ov.appendChild(p)
  ov.appendChild(btn)
  ov.style.display = 'flex'
}

function endGame(): void {
  running = false
  gameOver = true
  audio.death()
  const secs = Math.floor(elapsed)
  if (secs > bestScore) {
    bestScore = secs
    saveBestScore(secs)
    ;(document.getElementById('best-val') as HTMLSpanElement).textContent = String(bestScore)
  }
  reportGameOver(secs)
  const msg = secs >= 180 ? 'Apex Predator!' : secs >= 90 ? 'Well hunted!' : 'Short hunt!'
  buildOverlay(
    'Hunt Over',
    `Survived ${secs} seconds! ${msg} Best: ${bestScore}s`,
    'Hunt Again',
    startGame,
  )
}

function startGame(): void {
  foxX = canvas.width / 2
  foxY = (canvas.height - GRAPH_H) / 2
  foxEnergy = 100
  elapsed = 0
  running = true
  gameOver = false
  nextMutation = 90
  rabbitSpeed = 1.2
  grassGrowthRate = 0.15
  rivalFoxes = []
  graphHistory = []
  graphTimer = 0

  initGrass()
  initRabbits()
  audio.start()

  const ov = document.getElementById('overlay')!
  ov.style.display = 'none'
}

// ── Input ─────────────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => { keys[e.key] = true })
window.addEventListener('keyup', (e) => { keys[e.key] = false })

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const t = e.touches[0]
  touchStartX = t.clientX
  touchStartY = t.clientY
}, { passive: false })

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault()
  const t = e.touches[0]
  const dx = t.clientX - touchStartX
  const dy = t.clientY - touchStartY
  const mag = Math.sqrt(dx * dx + dy * dy)
  if (mag > 10) {
    touchDx = dx / mag
    touchDy = dy / mag
  }
}, { passive: false })

canvas.addEventListener('touchend', () => { touchDx = 0; touchDy = 0 })

// ── Loop ──────────────────────────────────────────────────────────────────────

function loop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.05)
  lastTime = ts
  update(dt)
  draw()
  requestAnimationFrame(loop)
}

const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

document.getElementById('start-btn')!.addEventListener('click', startGame)

initSDK().then(({ bestScore: saved }) => {
  bestScore = saved
  ;(document.getElementById('best-val') as HTMLSpanElement).textContent = String(saved)
})

requestAnimationFrame((ts) => { lastTime = ts; loop(ts) })
