import { audio } from './audio.js'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  species: 'algae' | 'zooplankton' | 'bacteria' | 'predator'
  energy: number
  age: number
  dead: boolean
}

interface GraphPoint {
  algae: number
  zoo: number
  bacteria: number
  predator: number
}

// ── Canvas setup ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const container = document.getElementById('game-container')!

function resize(): void {
  const w = container.clientWidth
  const h = container.clientHeight
  const size = Math.max(280, Math.min(w, h - 140))
  canvas.width = size
  canvas.height = size
  canvas.style.width = size + 'px'
  canvas.style.height = size + 'px'
}
resize()
window.addEventListener('resize', resize)

// ── State ─────────────────────────────────────────────────────────────────────

let particles: Particle[] = []
let minerals = 100
let sunlight = 1.0
let timeLeft = 90
let score = 0
let running = false
let gameOver = false
let cycleTimer = 0
let graphHistory: GraphPoint[] = []
let bestScore = 0
let lastTime = 0

const POOL_RADIUS = (): number => Math.min(canvas.width, canvas.height) * 0.44
const POOL_CX = (): number => canvas.width / 2
const POOL_CY = (): number => canvas.height / 2

// ── Species config ────────────────────────────────────────────────────────────

const SPECIES_COLOR: Record<string, string> = {
  algae: '#44bb44',
  zooplankton: '#ddbb22',
  bacteria: '#8b5e3c',
  predator: '#cc3333',
}

const SPECIES_RADIUS: Record<string, number> = {
  algae: 3,
  zooplankton: 4,
  bacteria: 2.5,
  predator: 5,
}

function countSpecies(): Record<string, number> {
  const c = { algae: 0, zooplankton: 0, bacteria: 0, predator: 0 }
  for (const p of particles) {
    if (!p.dead) c[p.species as keyof typeof c]++
  }
  return c
}

function addParticle(species: Particle['species'], n = 5): void {
  const cx = POOL_CX()
  const cy = POOL_CY()
  const r = POOL_RADIUS() * 0.8
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2
    const dist = Math.random() * r
    particles.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      species,
      energy: 50 + Math.random() * 50,
      age: 0,
      dead: false,
    })
  }
}

function spawnDeadMatter(): void {
  minerals = Math.min(300, minerals + 8)
}

// ── Update logic ──────────────────────────────────────────────────────────────

function update(dt: number): void {
  if (!running || gameOver) return

  const cx = POOL_CX()
  const cy = POOL_CY()
  const poolR = POOL_RADIUS()
  const counts = countSpecies()

  // Mineral dynamics
  minerals = Math.min(300, minerals + counts.bacteria * 0.005 * dt * 60)
  minerals = Math.max(0, minerals - 0.05 * dt * 60)

  for (const p of particles) {
    if (p.dead) continue

    p.age += dt

    // Brownian motion
    p.vx += (Math.random() - 0.5) * 0.3
    p.vy += (Math.random() - 0.5) * 0.3
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
    const maxSpeed = 1.2
    if (speed > maxSpeed) { p.vx *= maxSpeed / speed; p.vy *= maxSpeed / speed }

    p.x += p.vx
    p.y += p.vy

    // Confine inside circle
    const dx = p.x - cx
    const dy = p.y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const pr = SPECIES_RADIUS[p.species]
    if (dist + pr > poolR) {
      const nx = dx / dist
      const ny = dy / dist
      p.x = cx + nx * (poolR - pr - 1)
      p.y = cy + ny * (poolR - pr - 1)
      const dot = p.vx * nx + p.vy * ny
      p.vx -= 2 * dot * nx
      p.vy -= 2 * dot * ny
    }

    // Energy drain
    p.energy -= 0.08 * dt * 60

    // Algae: photosynthesis
    if (p.species === 'algae' && minerals > 1) {
      p.energy += sunlight * 0.12 * dt * 60
      minerals -= 0.05 * dt * 60
    }

    if (p.energy <= 0) {
      p.dead = true
      spawnDeadMatter()
      continue
    }

    // Reproduction
    const maxPop: Record<string, number> = { algae: 200, zooplankton: 150, bacteria: 200, predator: 50 }
    if (p.energy > 120 && counts[p.species] < maxPop[p.species] && Math.random() < 0.002 * dt * 60) {
      p.energy *= 0.6
      const angle = Math.random() * Math.PI * 2
      const off = SPECIES_RADIUS[p.species] * 3
      particles.push({
        x: p.x + Math.cos(angle) * off,
        y: p.y + Math.sin(angle) * off,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        species: p.species,
        energy: 60,
        age: 0,
        dead: false,
      })
      counts[p.species]++
    }
  }

  // Predation
  const alive = particles.filter(p => !p.dead)
  const algaeArr = alive.filter(p => p.species === 'algae')
  const zooArr = alive.filter(p => p.species === 'zooplankton')
  const predArr = alive.filter(p => p.species === 'predator')

  for (const z of zooArr) {
    for (const a of algaeArr) {
      if (a.dead) continue
      const dx = z.x - a.x
      const dy = z.y - a.y
      if (dx * dx + dy * dy < 100) {
        a.dead = true
        z.energy = Math.min(150, z.energy + 25)
        minerals = Math.min(300, minerals + 2)
        break
      }
    }
  }

  for (const pred of predArr) {
    for (const z of zooArr) {
      if (z.dead) continue
      const dx = pred.x - z.x
      const dy = pred.y - z.y
      if (dx * dx + dy * dy < 144) {
        z.dead = true
        pred.energy = Math.min(200, pred.energy + 50)
        minerals = Math.min(300, minerals + 3)
        break
      }
    }
  }

  // Purge dead particles
  if (particles.length > 600) {
    particles = particles.filter(p => !p.dead)
  }

  // Per-second tick
  cycleTimer += dt
  if (cycleTimer >= 1) {
    cycleTimer -= 1
    const c = countSpecies()
    graphHistory.push({ algae: c.algae, zoo: c.zooplankton, bacteria: c.bacteria, predator: c.predator })
    if (graphHistory.length > 90) graphHistory.shift()

    // Score: all 4 alive
    if (c.algae > 0 && c.zooplankton > 0 && c.bacteria > 0 && c.predator > 0) {
      score++
      audio.blip()
    }

    timeLeft--
    if (timeLeft <= 0) { endGame(); return }

    // Crash check
    if (c.algae > 200 || c.zooplankton > 200 || c.bacteria > 200 || c.predator > 50) {
      endGame()
      return
    }
  }

  // Update DOM
  ;(document.getElementById('score-val') as HTMLSpanElement).textContent = String(score)
  ;(document.getElementById('time-val') as HTMLSpanElement).textContent = String(timeLeft)
  const c = countSpecies()
  const allAlive = c.algae > 0 && c.zooplankton > 0 && c.bacteria > 0 && c.predator > 0
  const statusEl = document.getElementById('status-val') as HTMLSpanElement
  statusEl.textContent = allAlive ? 'Balanced' : 'Unstable'
  statusEl.style.color = allAlive ? '#44ff88' : '#ff6644'
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function draw(): void {
  const w = canvas.width
  const h = canvas.height
  const cx = POOL_CX()
  const cy = POOL_CY()
  const poolR = POOL_RADIUS()

  ctx.clearRect(0, 0, w, h)

  // Pool background gradient
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, poolR)
  grad.addColorStop(0, '#0a3050')
  grad.addColorStop(0.7, '#062040')
  grad.addColorStop(1, '#041828')
  ctx.beginPath()
  ctx.arc(cx, cy, poolR, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  // Mineral glow
  const mAlpha = Math.min(1, minerals / 200) * 0.25
  ctx.beginPath()
  ctx.arc(cx, cy, poolR, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(50,100,200,${mAlpha})`
  ctx.fill()

  // Sunlight shafts
  if (sunlight > 0.3) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, poolR, 0, Math.PI * 2)
    ctx.clip()
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + (i - 2) * 0.2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle - 0.05) * poolR, cy - poolR)
      ctx.lineTo(cx + Math.cos(angle + 0.05) * poolR, cy - poolR)
      ctx.lineTo(cx, cy + poolR * 0.5)
      ctx.closePath()
      ctx.fillStyle = `rgba(255,230,100,${sunlight * 0.06})`
      ctx.fill()
    }
    ctx.restore()
  }

  // Pool rim
  ctx.beginPath()
  ctx.arc(cx, cy, poolR, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(100,180,255,0.4)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Particles
  for (const p of particles) {
    if (p.dead) continue
    const r = SPECIES_RADIUS[p.species]
    const alpha = 0.4 + Math.min(1, p.energy / 80) * 0.6
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = SPECIES_COLOR[p.species]
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Population graph (bottom strip)
  drawGraph(w, h)
}

function drawGraph(w: number, h: number): void {
  const gh = 60
  const gy = h - gh

  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, gy, w, gh)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.strokeRect(0, gy, w, gh)

  if (graphHistory.length < 2) return

  const maxVal = 200
  const seriesColors = { algae: '#44bb44', zoo: '#ddbb22', bacteria: '#8b5e3c', predator: '#cc3333' }
  const keys: Array<[keyof GraphPoint, string]> = [
    ['algae', seriesColors.algae],
    ['zoo', seriesColors.zoo],
    ['bacteria', seriesColors.bacteria],
    ['predator', seriesColors.predator],
  ]

  for (const [key, color] of keys) {
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    for (let i = 0; i < graphHistory.length; i++) {
      const x = (i / (graphHistory.length - 1)) * w
      const val = graphHistory[i][key]
      const y = gy + gh - 4 - (val / maxVal) * (gh - 8)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

// ── Game lifecycle ────────────────────────────────────────────────────────────

function buildOverlay(title: string, body: string, btnLabel: string, onBtn: () => void): void {
  const ov = document.getElementById('overlay')!
  // Clear previous content
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
  const msg = score >= 60 ? 'Master ecologist!' : score >= 30 ? 'Good balance!' : 'Keep practicing!'
  buildOverlay(
    'Ecosystem Complete',
    `You scored ${score} stable cycles! ${msg}`,
    'Play Again',
    startGame,
  )
}

function startGame(): void {
  particles = []
  minerals = 100
  timeLeft = 90
  score = 0
  running = true
  gameOver = false
  cycleTimer = 0
  graphHistory = []
  sunlight = parseFloat((document.getElementById('sunlight') as HTMLInputElement).value)

  addParticle('algae', 20)
  addParticle('zooplankton', 8)
  addParticle('bacteria', 10)
  addParticle('predator', 3)

  audio.start()
  const ov = document.getElementById('overlay')!
  ov.style.display = 'none'
}

// ── Game loop ─────────────────────────────────────────────────────────────────

function loop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.05)
  lastTime = ts
  update(dt)
  draw()
  requestAnimationFrame(loop)
}

// ── Controls ──────────────────────────────────────────────────────────────────

document.getElementById('btn-algae')!.addEventListener('click', () => { if (running) { addParticle('algae', 5); audio.click() } })
document.getElementById('btn-zoo')!.addEventListener('click', () => { if (running) { addParticle('zooplankton', 3); audio.click() } })
document.getElementById('btn-bacteria')!.addEventListener('click', () => { if (running) { addParticle('bacteria', 5); audio.click() } })
document.getElementById('btn-predator')!.addEventListener('click', () => { if (running) { addParticle('predator', 1); audio.click() } })
document.getElementById('btn-minerals')!.addEventListener('click', () => { if (running) { minerals = Math.min(300, minerals + 40); audio.blip() } })
document.getElementById('sunlight')!.addEventListener('input', (e) => {
  sunlight = parseFloat((e.target as HTMLInputElement).value)
})

const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

document.getElementById('start-btn')!.addEventListener('click', startGame)

initSDK().then(({ bestScore: saved }) => { bestScore = saved })

requestAnimationFrame((ts) => { lastTime = ts; loop(ts) })
