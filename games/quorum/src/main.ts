import { audio } from './audio.js'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Bacterium {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  barrier: number      // 0=fully lowered, 1=full barrier
  barrierTimer: number // seconds remaining of lowered barrier
  activated: boolean
  activatedTimer: number
  signalConc: number
  dead: boolean
  dividing: boolean
  divTimer: number
}

interface SignalRing {
  x: number
  y: number
  radius: number
  maxRadius: number
  alpha: number
}

interface Phagocyte {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  target: Bacterium | null
}

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const container = document.getElementById('game-container')!

function resize(): void {
  const s = Math.min(container.clientWidth, container.clientHeight - 20)
  canvas.width = Math.max(300, s)
  canvas.height = Math.max(300, s)
  canvas.style.width = canvas.width + 'px'
  canvas.style.height = canvas.height + 'px'
}
resize()
window.addEventListener('resize', resize)

// ── State ─────────────────────────────────────────────────────────────────────

let bacteria: Bacterium[] = []
let signalRings: SignalRing[] = []
let phagocytes: Phagocyte[] = []
let heatmap: Float32Array = new Float32Array(0)
let hmW = 0, hmH = 0
const HM_SCALE = 8

let score = 0
let totalActivated = 0
let timeLeft = 180
let running = false
let gameOver = false
let bestScore = 0
let charges = 5
let chargeTimer = 0
const MAX_CHARGES = 5
const CHARGE_REGEN = 3
let burstCooldown = 0
const BURST_COOLDOWN = 10
let lastTime = 0
let tickTimer = 0

const ACTIVATION_THRESHOLD = 0.4
const DISH_MARGIN = 20

// ── Init ──────────────────────────────────────────────────────────────────────

function initHeatmap(): void {
  hmW = Math.ceil(canvas.width / HM_SCALE)
  hmH = Math.ceil(canvas.height / HM_SCALE)
  heatmap = new Float32Array(hmW * hmH)
}

function spawnBacterium(x: number, y: number): Bacterium {
  return {
    x, y,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    radius: 7 + Math.random() * 4,
    barrier: 1,
    barrierTimer: 0,
    activated: false,
    activatedTimer: 0,
    signalConc: 0,
    dead: false,
    dividing: false,
    divTimer: 0,
  }
}

function spawnPhagocyte(): void {
  const w = canvas.width
  const h = canvas.height
  const side = Math.floor(Math.random() * 4)
  let x = 0, y = 0
  if (side === 0) { x = Math.random() * w; y = 0 }
  else if (side === 1) { x = w; y = Math.random() * h }
  else if (side === 2) { x = Math.random() * w; y = h }
  else { x = 0; y = Math.random() * h }
  phagocytes.push({ x, y, vx: 0, vy: 0, radius: 12, target: null })
}

function initGame(): void {
  bacteria = []
  signalRings = []
  phagocytes = []
  score = 0
  totalActivated = 0
  timeLeft = 180
  charges = 5
  chargeTimer = 0
  burstCooldown = 0
  tickTimer = 0

  initHeatmap()

  const w = canvas.width
  const h = canvas.height
  // Spawn starting bacteria
  for (let i = 0; i < 12; i++) {
    bacteria.push(spawnBacterium(
      DISH_MARGIN + Math.random() * (w - DISH_MARGIN * 2),
      DISH_MARGIN + Math.random() * (h - DISH_MARGIN * 2),
    ))
  }

  // First phagocyte after 20s — spawn 2 to start
  spawnPhagocyte()
}

// ── Update ────────────────────────────────────────────────────────────────────

function update(dt: number): void {
  if (!running || gameOver) return

  // Timer
  timeLeft -= dt
  if (timeLeft <= 0) { timeLeft = 0; endGame(); return }

  // Charge regen
  if (charges < MAX_CHARGES) {
    chargeTimer += dt
    if (chargeTimer >= CHARGE_REGEN) {
      chargeTimer -= CHARGE_REGEN
      charges++
    }
  }
  if (burstCooldown > 0) burstCooldown = Math.max(0, burstCooldown - dt)

  // Update heatmap
  heatmap.fill(0)
  for (const b of bacteria) {
    if (b.dead) continue
    const bx = Math.floor(b.x / HM_SCALE)
    const by = Math.floor(b.y / HM_SCALE)
    const r = 6 // radius in heatmap cells
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d > r) continue
        const hx = bx + dx
        const hy = by + dy
        if (hx >= 0 && hx < hmW && hy >= 0 && hy < hmH) {
          heatmap[hy * hmW + hx] += (1 - d / r) * 0.3
        }
      }
    }
  }

  // Emit signal rings from bacteria
  tickTimer += dt
  if (tickTimer >= 2) {
    tickTimer -= 2
    for (const b of bacteria) {
      if (!b.dead) {
        signalRings.push({ x: b.x, y: b.y, radius: b.radius, maxRadius: 80, alpha: 0.35 })
      }
    }
  }

  // Update signal rings
  for (const ring of signalRings) {
    ring.radius += 30 * dt
    ring.alpha *= (1 - dt * 0.8)
  }
  for (let i = signalRings.length - 1; i >= 0; i--) {
    if (signalRings[i].radius > signalRings[i].maxRadius || signalRings[i].alpha < 0.01) {
      signalRings.splice(i, 1)
    }
  }

  // Bacteria
  const w = canvas.width
  const h = canvas.height
  for (const b of bacteria) {
    if (b.dead) continue

    b.vx += (Math.random() - 0.5) * 0.15
    b.vy += (Math.random() - 0.5) * 0.15
    const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
    if (spd > 0.6) { b.vx *= 0.6 / spd; b.vy *= 0.6 / spd }
    b.x += b.vx
    b.y += b.vy
    b.x = Math.max(DISH_MARGIN, Math.min(w - DISH_MARGIN, b.x))
    b.y = Math.max(DISH_MARGIN, Math.min(h - DISH_MARGIN, b.y))
    if (b.x <= DISH_MARGIN || b.x >= w - DISH_MARGIN) b.vx *= -1
    if (b.y <= DISH_MARGIN || b.y >= h - DISH_MARGIN) b.vy *= -1

    // Barrier timer
    if (b.barrierTimer > 0) {
      b.barrierTimer -= dt
      b.barrier = Math.max(0.1, b.barrierTimer / 2)
      if (b.barrierTimer <= 0) b.barrier = 1
    }

    // Sample local signal concentration
    const bx = Math.floor(b.x / HM_SCALE)
    const by = Math.floor(b.y / HM_SCALE)
    b.signalConc = (bx >= 0 && bx < hmW && by >= 0 && by < hmH) ? heatmap[by * hmW + bx] : 0

    // Activation logic
    if (!b.activated && b.signalConc > ACTIVATION_THRESHOLD && b.barrier < 0.5) {
      b.activated = true
      b.activatedTimer = 4
      b.radius = 12
      score += 10
      totalActivated++
      audio.score()
    }
    if (b.activated) {
      b.activatedTimer -= dt
      if (b.activatedTimer <= 0) {
        b.activated = false
        b.radius = 7 + Math.random() * 4
      }
    }

    // Division
    if (bacteria.length < 35 && Math.random() < 0.001 * dt * 60) {
      b.dividing = true
      b.divTimer = 1
    }
    if (b.dividing) {
      b.divTimer -= dt
      if (b.divTimer <= 0 && bacteria.filter(bx2 => !bx2.dead).length < 35) {
        b.dividing = false
        const angle = Math.random() * Math.PI * 2
        bacteria.push(spawnBacterium(
          b.x + Math.cos(angle) * 15,
          b.y + Math.sin(angle) * 15,
        ))
      }
    }
  }

  // Phagocytes
  // Spawn more over time
  if (timeLeft < 150 && Math.random() < 0.003 * dt * 60 && phagocytes.length < 5) {
    spawnPhagocyte()
  }

  const aliveBact = bacteria.filter(b => !b.dead)
  for (const p of phagocytes) {
    // Seek high-signal bacteria
    let bestTarget: Bacterium | null = null
    let bestSignal = -1
    for (const b of aliveBact) {
      if (b.signalConc > bestSignal) { bestSignal = b.signalConc; bestTarget = b }
    }
    p.target = bestTarget

    if (p.target) {
      const ang = Math.atan2(p.target.y - p.y, p.target.x - p.x)
      p.vx += Math.cos(ang) * 0.2
      p.vy += Math.sin(ang) * 0.2
    }
    const ps = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
    if (ps > 1.5) { p.vx *= 1.5 / ps; p.vy *= 1.5 / ps }
    p.x += p.vx
    p.y += p.vy

    // Eat bacteria
    for (const b of aliveBact) {
      if (Math.hypot(p.x - b.x, p.y - b.y) < p.radius + b.radius) {
        b.dead = true
        audio.blip()
      }
    }
  }

  bacteria = bacteria.filter(b => !b.dead)

  if (bacteria.length === 0) { endGame(); return }

  // HUD
  ;(document.getElementById('score-val') as HTMLSpanElement).textContent = String(score)
  ;(document.getElementById('time-val') as HTMLSpanElement).textContent = String(Math.ceil(timeLeft))
  ;(document.getElementById('bact-val') as HTMLSpanElement).textContent = String(bacteria.filter(b => !b.dead).length)
  ;(document.getElementById('act-val') as HTMLSpanElement).textContent = String(totalActivated)

  // Charges display
  for (let i = 0; i < MAX_CHARGES; i++) {
    const dot = document.getElementById(`charge-${i}`)!
    dot.className = 'charge-dot' + (i < charges ? '' : ' empty')
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function draw(): void {
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  // Petri dish background
  ctx.fillStyle = '#0a1a0f'
  ctx.fillRect(0, 0, w, h)

  // Petri dish rim
  ctx.beginPath()
  ctx.rect(DISH_MARGIN / 2, DISH_MARGIN / 2, w - DISH_MARGIN, h - DISH_MARGIN)
  ctx.strokeStyle = 'rgba(150,200,150,0.25)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Heatmap overlay
  drawHeatmap(w, h)

  // Signal rings
  for (const ring of signalRings) {
    ctx.beginPath()
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(100,255,150,${ring.alpha})`
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // Bacteria
  for (const b of bacteria) {
    if (b.dead) continue
    const r = b.radius

    // Activation ring / barrier ring
    if (b.activated) {
      const grd = ctx.createRadialGradient(b.x, b.y, r, b.x, b.y, r + 8)
      grd.addColorStop(0, 'rgba(200,255,100,0.5)')
      grd.addColorStop(1, 'rgba(200,255,100,0)')
      ctx.beginPath()
      ctx.arc(b.x, b.y, r + 8, 0, Math.PI * 2)
      ctx.fillStyle = grd
      ctx.fill()
    }

    // Barrier ring (shows as glowing ring; smaller = lower barrier)
    const barrierR = r + 4 + b.barrier * 6
    ctx.beginPath()
    ctx.arc(b.x, b.y, barrierR, 0, Math.PI * 2)
    ctx.strokeStyle = b.barrierTimer > 0 ? `rgba(255,200,50,${0.8 - b.barrier * 0.5})` : `rgba(100,200,255,${0.3})`
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Cell body
    const cellColor = b.activated ? '#b8ff50' : '#44dd66'
    ctx.beginPath()
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
    ctx.fillStyle = cellColor
    ctx.globalAlpha = 0.85
    ctx.fill()
    ctx.globalAlpha = 1

    // Dividing animation
    if (b.dividing) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, r + 3, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,200,0.5)'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  // Phagocytes
  for (const p of phagocytes) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(220,50,50,0.75)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,100,100,0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
    // pseudopods
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + Date.now() * 0.001
      ctx.beginPath()
      ctx.moveTo(p.x + Math.cos(ang) * p.radius, p.y + Math.sin(ang) * p.radius)
      ctx.lineTo(p.x + Math.cos(ang) * (p.radius + 6), p.y + Math.sin(ang) * (p.radius + 6))
      ctx.strokeStyle = 'rgba(255,80,80,0.6)'
      ctx.lineWidth = 3
      ctx.stroke()
    }
  }

  // Burst cooldown indicator
  if (burstCooldown > 0) {
    const pct = burstCooldown / BURST_COOLDOWN
    ctx.beginPath()
    ctx.arc(w - 30, h - 30, 14, -Math.PI / 2, -Math.PI / 2 + (1 - pct) * Math.PI * 2)
    ctx.strokeStyle = 'rgba(200,255,100,0.7)'
    ctx.lineWidth = 3
    ctx.stroke()
  }
}

function drawHeatmap(w: number, h: number): void {
  if (hmW === 0) return
  // Draw as colored pixels via imageData
  const imgData = ctx.createImageData(w, h)
  const data = imgData.data

  for (let hy = 0; hy < hmH; hy++) {
    for (let hx = 0; hx < hmW; hx++) {
      const v = Math.min(1, heatmap[hy * hmW + hx])
      if (v < 0.05) continue
      const px = hx * HM_SCALE
      const py = hy * HM_SCALE
      for (let dy = 0; dy < HM_SCALE && py + dy < h; dy++) {
        for (let dx = 0; dx < HM_SCALE && px + dx < w; dx++) {
          const idx = ((py + dy) * w + (px + dx)) * 4
          data[idx] = Math.floor(v * 80)
          data[idx + 1] = Math.floor(v * 180)
          data[idx + 2] = Math.floor(v * 100)
          data[idx + 3] = Math.floor(v * 80)
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

// ── Interaction ───────────────────────────────────────────────────────────────

function applyClick(cx: number, cy: number): void {
  if (!running) return
  if (charges <= 0) return

  // Find nearest bacterium
  let nearest: Bacterium | null = null
  let nearestD = 60
  for (const b of bacteria) {
    if (b.dead) continue
    const d = Math.hypot(cx - b.x, cy - b.y)
    if (d < nearestD) { nearestD = d; nearest = b }
  }
  if (nearest) {
    nearest.barrierTimer = 2
    nearest.barrier = 0.1
    charges--
    chargeTimer = 0
    audio.click()

    // Small signal ring at click
    signalRings.push({ x: cx, y: cy, radius: 5, maxRadius: 30, alpha: 0.5 })
  }
}

function applyBurst(cx: number, cy: number): void {
  if (!running || burstCooldown > 0) return
  burstCooldown = BURST_COOLDOWN
  // Release strong signal from all bacteria
  for (const b of bacteria) {
    if (!b.dead) {
      for (let i = 0; i < 3; i++) {
        signalRings.push({ x: b.x, y: b.y, radius: b.radius, maxRadius: 120, alpha: 0.5 })
      }
    }
  }
  // Also lower barriers nearby
  for (const b of bacteria) {
    if (!b.dead && Math.hypot(cx - b.x, cy - b.y) < 100) {
      b.barrierTimer = 2.5
      b.barrier = 0.1
    }
  }
  audio.powerup()
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  applyClick(e.clientX - rect.left, e.clientY - rect.top)
})

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  const rect = canvas.getBoundingClientRect()
  applyBurst(e.clientX - rect.left, e.clientY - rect.top)
})

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const rect = canvas.getBoundingClientRect()
  const t = e.touches[0]
  applyClick(t.clientX - rect.left, t.clientY - rect.top)
}, { passive: false })

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
  if (score > bestScore) {
    bestScore = score
    saveBestScore(score)
  }
  reportGameOver(score)
  const msg = score >= 500 ? 'Quorum achieved!' : score >= 200 ? 'Good signaling!' : 'Keep clustering!'
  buildOverlay('Experiment Over', `Score: ${score} | Activated: ${totalActivated} bacteria. ${msg}`, 'Try Again', startGame)
}

function startGame(): void {
  running = true
  gameOver = false
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
initSDK().then(({ bestScore: saved }) => { bestScore = saved })
requestAnimationFrame((ts) => { lastTime = ts; loop(ts) })
