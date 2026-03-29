import { audio } from './audio.js'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ant {
  x: number
  y: number
  angle: number
  speed: number
  carrying: boolean
  returnX: number
  returnY: number
  id: number
  trailTimer: number
  ownTrailStrength: number
}

interface FoodSource {
  x: number
  y: number
  amount: number
  id: number
}

interface PheromoneCell {
  strength: number  // 0–1, player-drawn
  returnStrength: number  // 0–1, ant return trail
  decay: number  // rate per second
}

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const container = document.getElementById('game-container')!

const PHM_SCALE = 8  // pheromone grid scale

let phmW = 0, phmH = 0
let pheromone: PheromoneCell[] = []

function resize(): void {
  const s = Math.min(container.clientWidth, container.clientHeight - 20)
  canvas.width = Math.max(300, s)
  canvas.height = Math.max(300, s)
  canvas.style.width = canvas.width + 'px'
  canvas.style.height = canvas.height + 'px'
  initPheromone()
}
resize()
window.addEventListener('resize', resize)

function initPheromone(): void {
  phmW = Math.ceil(canvas.width / PHM_SCALE)
  phmH = Math.ceil(canvas.height / PHM_SCALE)
  pheromone = Array.from({ length: phmW * phmH }, () => ({
    strength: 0,
    returnStrength: 0,
    decay: 1 / 15,
  }))
}

function phmIdx(px: number, py: number): number {
  const hx = Math.floor(px / PHM_SCALE)
  const hy = Math.floor(py / PHM_SCALE)
  if (hx < 0 || hx >= phmW || hy < 0 || hy >= phmH) return -1
  return hy * phmW + hx
}

function getPheromone(px: number, py: number): number {
  const idx = phmIdx(px, py)
  if (idx < 0) return 0
  return pheromone[idx].strength + pheromone[idx].returnStrength
}

function addPheromone(px: number, py: number, strength: number, isReturn: boolean): void {
  const idx = phmIdx(px, py)
  if (idx < 0) return
  if (isReturn) {
    pheromone[idx].returnStrength = Math.min(1, pheromone[idx].returnStrength + strength)
  } else {
    pheromone[idx].strength = Math.min(1, pheromone[idx].strength + strength)
  }
}

// ── State ─────────────────────────────────────────────────────────────────────

let ants: Ant[] = []
let foodSources: FoodSource[] = []
let colonyX = 0, colonyY = 0
let foodDelivered = 0
let timeLeft = 120
let running = false
let gameOver = false
let bestScore = 0
let lastTime = 0
let antIdCounter = 0
let foodIdCounter = 0
let foodSpawnTimer = 0
let drawing = false
let lastDrawX = -1, lastDrawY = -1

const ANT_COUNT = 25
const COLONY_RADIUS = 18
const FOOD_RADIUS = 10
const FOOD_SPAWN_INTERVAL = 10
const ANT_SENSOR_RANGE = 3  // cells in pheromone grid

// ── Init ──────────────────────────────────────────────────────────────────────

function spawnAnt(): Ant {
  return {
    x: colonyX + (Math.random() - 0.5) * COLONY_RADIUS,
    y: colonyY + (Math.random() - 0.5) * COLONY_RADIUS,
    angle: Math.random() * Math.PI * 2,
    speed: 1.2 + Math.random() * 0.6,
    carrying: false,
    returnX: 0,
    returnY: 0,
    id: antIdCounter++,
    trailTimer: 0,
    ownTrailStrength: 0.4,
  }
}

function spawnFood(): void {
  const w = canvas.width
  const h = canvas.height
  const margin = 40
  foodSources.push({
    x: margin + Math.random() * (w - margin * 2),
    y: margin + Math.random() * (h - margin * 2),
    amount: 5 + Math.floor(Math.random() * 5),
    id: foodIdCounter++,
  })
}

function initGame(): void {
  const w = canvas.width
  const h = canvas.height
  colonyX = w / 2
  colonyY = h / 2
  ants = []
  foodSources = []
  foodDelivered = 0
  timeLeft = 120
  foodSpawnTimer = 0
  initPheromone()

  for (let i = 0; i < ANT_COUNT; i++) ants.push(spawnAnt())

  // Spawn initial food
  for (let i = 0; i < 4; i++) spawnFood()
}

// ── Ant AI ────────────────────────────────────────────────────────────────────

function updateAnt(ant: Ant, dt: number): void {
  const w = canvas.width
  const h = canvas.height

  if (ant.carrying) {
    // Return to colony
    const dx = colonyX - ant.x
    const dy = colonyY - ant.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < COLONY_RADIUS + 5) {
      // Delivered!
      ant.carrying = false
      foodDelivered++
      audio.score()
      ant.angle = Math.random() * Math.PI * 2
      return
    }

    // Navigate back
    const targetAngle = Math.atan2(dy, dx)
    let diff = targetAngle - ant.angle
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    ant.angle += diff * 0.12

    // Leave return pheromone
    ant.trailTimer += dt
    if (ant.trailTimer > 0.2) {
      ant.trailTimer -= 0.2
      addPheromone(ant.x, ant.y, 0.5, true)
    }
  } else {
    // Foraging

    // Check for food
    for (const food of foodSources) {
      if (food.amount <= 0) continue
      const d = Math.hypot(ant.x - food.x, ant.y - food.y)
      if (d < FOOD_RADIUS + 5) {
        ant.carrying = true
        food.amount--
        ant.angle = Math.atan2(colonyY - ant.y, colonyX - ant.x)

        // Leave initial return trail here
        for (let i = 0; i < 3; i++) {
          addPheromone(ant.x + (Math.random() - 0.5) * 10, ant.y + (Math.random() - 0.5) * 10, 0.8, true)
        }

        audio.blip()
        return
      }
    }

    // Sense pheromone ahead and to sides
    const senseAngle = 0.5  // radians
    const senseRange = ANT_SENSOR_RANGE * PHM_SCALE

    const aheadX = ant.x + Math.cos(ant.angle) * senseRange
    const aheadY = ant.y + Math.sin(ant.angle) * senseRange
    const leftX = ant.x + Math.cos(ant.angle - senseAngle) * senseRange
    const leftY = ant.y + Math.sin(ant.angle - senseAngle) * senseRange
    const rightX = ant.x + Math.cos(ant.angle + senseAngle) * senseRange
    const rightY = ant.y + Math.sin(ant.angle + senseAngle) * senseRange

    const ahead = getPheromone(aheadX, aheadY)
    const left = getPheromone(leftX, leftY)
    const right = getPheromone(rightX, rightY)

    // Steer toward pheromone
    if (ahead > 0.05 || left > 0.05 || right > 0.05) {
      if (left > right && left > ahead) {
        ant.angle -= 0.25
      } else if (right > left && right > ahead) {
        ant.angle += 0.25
      }
      // Follow the trail
      ant.angle += (Math.random() - 0.5) * 0.2
    } else {
      // Random wander
      ant.angle += (Math.random() - 0.5) * 0.4

      // Occasionally discover food directly
      for (const food of foodSources) {
        if (food.amount <= 0) continue
        const angle = Math.atan2(food.y - ant.y, food.x - ant.x)
        const dist = Math.hypot(ant.x - food.x, ant.y - food.y)
        if (dist < 80 && Math.random() < 0.05) {
          ant.angle = angle + (Math.random() - 0.5) * 0.5
        }
      }
    }
  }

  // Move
  ant.x += Math.cos(ant.angle) * ant.speed
  ant.y += Math.sin(ant.angle) * ant.speed

  // Boundary bounce
  if (ant.x < 10 || ant.x > w - 10) { ant.angle = Math.PI - ant.angle; ant.x = Math.max(10, Math.min(w - 10, ant.x)) }
  if (ant.y < 10 || ant.y > h - 10) { ant.angle = -ant.angle; ant.y = Math.max(10, Math.min(h - 10, ant.y)) }
}

// ── Update ────────────────────────────────────────────────────────────────────

function update(dt: number): void {
  if (!running || gameOver) return

  timeLeft -= dt
  if (timeLeft <= 0) { timeLeft = 0; endGame(); return }

  // Spawn food
  foodSpawnTimer += dt
  if (foodSpawnTimer >= FOOD_SPAWN_INTERVAL) {
    foodSpawnTimer -= FOOD_SPAWN_INTERVAL
    spawnFood()
    audio.powerup()
  }

  // Update pheromone (decay)
  for (const cell of pheromone) {
    cell.strength = Math.max(0, cell.strength - cell.decay * dt)
    cell.returnStrength = Math.max(0, cell.returnStrength - cell.decay * dt)
  }

  // Update ants
  for (const ant of ants) {
    updateAnt(ant, dt)
  }

  // Clean up empty food
  for (let i = foodSources.length - 1; i >= 0; i--) {
    if (foodSources[i].amount <= 0) foodSources.splice(i, 1)
  }

  // HUD
  ;(document.getElementById('food-val') as HTMLSpanElement).textContent = String(foodDelivered)
  ;(document.getElementById('time-val') as HTMLSpanElement).textContent = String(Math.ceil(timeLeft))
  ;(document.getElementById('carry-val') as HTMLSpanElement).textContent = String(ants.filter(a => a.carrying).length)
}

// ── Render ────────────────────────────────────────────────────────────────────

function draw(): void {
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  // Ground
  const groundGrad = ctx.createLinearGradient(0, 0, w, h)
  groundGrad.addColorStop(0, '#1a2205')
  groundGrad.addColorStop(1, '#111a04')
  ctx.fillStyle = groundGrad
  ctx.fillRect(0, 0, w, h)

  // Pheromone heatmap (use imageData for performance)
  drawPheromoneLayer(w, h)

  // Food sources
  for (const food of foodSources) {
    if (food.amount <= 0) continue
    const r = FOOD_RADIUS + food.amount * 1.5
    ctx.beginPath()
    ctx.arc(food.x, food.y, r, 0, Math.PI * 2)
    ctx.fillStyle = '#44cc44'
    ctx.globalAlpha = 0.8
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#88ff44'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // Amount indicator
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `bold ${Math.floor(r * 0.7)}px Courier New`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(food.amount), food.x, food.y)
  }

  // Colony
  const colonyGrad = ctx.createRadialGradient(colonyX, colonyY, 0, colonyX, colonyY, COLONY_RADIUS)
  colonyGrad.addColorStop(0, '#8a6020')
  colonyGrad.addColorStop(1, '#4a3010')
  ctx.beginPath()
  ctx.arc(colonyX, colonyY, COLONY_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = colonyGrad
  ctx.fill()
  ctx.strokeStyle = '#cc9940'
  ctx.lineWidth = 2
  ctx.stroke()
  // Colony entrance
  ctx.beginPath()
  ctx.arc(colonyX, colonyY, COLONY_RADIUS * 0.5, 0, Math.PI * 2)
  ctx.fillStyle = '#2a1a08'
  ctx.fill()

  // Ants
  for (const ant of ants) {
    const r = 3
    const cos = Math.cos(ant.angle)
    const sin = Math.sin(ant.angle)

    ctx.save()
    ctx.translate(ant.x, ant.y)
    ctx.rotate(ant.angle)

    // Body
    ctx.beginPath()
    ctx.ellipse(0, 0, r, r * 1.8, 0, 0, Math.PI * 2)
    ctx.fillStyle = ant.carrying ? '#ffcc44' : '#5a3a1a'
    ctx.fill()

    // Head
    ctx.beginPath()
    ctx.arc(0, r * 1.8 + r, r * 0.8, 0, Math.PI * 2)
    ctx.fillStyle = ant.carrying ? '#ffaa22' : '#4a2a10'
    ctx.fill()

    // Antennae
    ctx.strokeStyle = ant.carrying ? '#ffcc44' : '#5a3a1a'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(-r * 0.5, r * 2.2)
    ctx.lineTo(-r * 1.5, r * 3.5)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(r * 0.5, r * 2.2)
    ctx.lineTo(r * 1.5, r * 3.5)
    ctx.stroke()

    ctx.restore()
    void cos; void sin;  // suppress unused warning
  }
}

function drawPheromoneLayer(w: number, h: number): void {
  const imgData = ctx.createImageData(w, h)
  const data = imgData.data

  for (let hy = 0; hy < phmH; hy++) {
    for (let hx = 0; hx < phmW; hx++) {
      const cell = pheromone[hy * phmW + hx]
      const playerStrength = cell.strength
      const returnStrength = cell.returnStrength

      if (playerStrength < 0.03 && returnStrength < 0.03) continue

      const px = hx * PHM_SCALE
      const py = hy * PHM_SCALE

      for (let dy = 0; dy < PHM_SCALE && py + dy < h; dy++) {
        for (let dx = 0; dx < PHM_SCALE && px + dx < w; dx++) {
          const idx = ((py + dy) * w + (px + dx)) * 4
          // Player trail = yellow/gold
          data[idx] = Math.floor((playerStrength * 220 + returnStrength * 180))
          data[idx + 1] = Math.floor((playerStrength * 180 + returnStrength * 120))
          data[idx + 2] = Math.floor(playerStrength * 40 + returnStrength * 20)
          data[idx + 3] = Math.floor((playerStrength + returnStrength) * 160)
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

// ── Player pheromone drawing ──────────────────────────────────────────────────

function drawTrail(x: number, y: number): void {
  if (!running) return

  // Paint pheromone in a small radius
  const r = 2  // cells
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > r) continue
      const str = (1 - d / r) * 0.6
      addPheromone(x + dx * PHM_SCALE, y + dy * PHM_SCALE, str, false)
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  drawing = true
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  lastDrawX = (e.clientX - rect.left) * sx
  lastDrawY = (e.clientY - rect.top) * sy
  drawTrail(lastDrawX, lastDrawY)
})

canvas.addEventListener('mousemove', (e) => {
  if (!drawing) return
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const x = (e.clientX - rect.left) * sx
  const y = (e.clientY - rect.top) * sy

  // Interpolate between last and current position
  const steps = Math.ceil(Math.hypot(x - lastDrawX, y - lastDrawY) / (PHM_SCALE / 2))
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps
    drawTrail(lastDrawX + (x - lastDrawX) * t, lastDrawY + (y - lastDrawY) * t)
  }
  lastDrawX = x
  lastDrawY = y
})

canvas.addEventListener('mouseup', () => { drawing = false })
canvas.addEventListener('mouseleave', () => { drawing = false })

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  drawing = true
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const t = e.touches[0]
  lastDrawX = (t.clientX - rect.left) * sx
  lastDrawY = (t.clientY - rect.top) * sy
  drawTrail(lastDrawX, lastDrawY)
}, { passive: false })

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault()
  if (!drawing) return
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const touch = e.touches[0]
  const x = (touch.clientX - rect.left) * sx
  const y = (touch.clientY - rect.top) * sy
  const steps = Math.ceil(Math.hypot(x - lastDrawX, y - lastDrawY) / (PHM_SCALE / 2))
  for (let i = 0; i <= steps; i++) {
    const t2 = steps === 0 ? 0 : i / steps
    drawTrail(lastDrawX + (x - lastDrawX) * t2, lastDrawY + (y - lastDrawY) * t2)
  }
  lastDrawX = x
  lastDrawY = y
}, { passive: false })

canvas.addEventListener('touchend', () => { drawing = false })

// ── Lifecycle ─────────────────────────────────────────────────────────────────

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
  if (foodDelivered > bestScore) {
    bestScore = foodDelivered
    saveBestScore(foodDelivered)
    ;(document.getElementById('best-val') as HTMLSpanElement).textContent = String(bestScore)
  }
  reportGameOver(foodDelivered)
  const msg = foodDelivered >= 30 ? 'Ant Overlord!' : foodDelivered >= 15 ? 'Skilled forager!' : 'Keep drawing trails!'
  buildOverlay('March Over', `${foodDelivered} food delivered! ${msg} Best: ${bestScore}`, 'March Again', startGame)
}

function startGame(): void {
  running = true
  gameOver = false
  drawing = false
  initGame()
  audio.start()
  const ov = document.getElementById('overlay')!
  ov.style.display = 'none'
}

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
