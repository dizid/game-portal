import { audio } from './audio.js'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ─────────────────────────────────────────────────────────────────────

type MolType = 'red' | 'blue' | 'green' | 'yellow' | 'inhibitor' | 'bonded'

interface Molecule {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  type: MolType
  partner: MolType | null  // which type it bonds with
  barrier: number          // 0=open, 1=full barrier
  barrierTimer: number     // seconds of lowered barrier remaining
  inhibited: boolean
  bonding: boolean         // in the process of bonding
  bondTimer: number
  bondPartner: Molecule | null
  id: number
  flash: number            // animation timer
}

interface BondEffect {
  x: number
  y: number
  radius: number
  alpha: number
  color: string
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

let molecules: Molecule[] = []
let bondEffects: BondEffect[] = []
let bondsFormed = 0
let timeLeft = 90
let wave = 1
let charges = 5
let chargeTimer = 0
let running = false
let gameOver = false
let bestScore = 0
let lastTime = 0
let molIdCounter = 0

const MAX_CHARGES = 5
const CHARGE_REGEN = 3
const PAIRS: Record<MolType, MolType | null> = {
  red: 'blue',
  blue: 'red',
  green: 'yellow',
  yellow: 'green',
  inhibitor: null,
  bonded: null,
}

const COLORS: Record<MolType, string> = {
  red: '#ff4444',
  blue: '#4488ff',
  green: '#44cc44',
  yellow: '#ffcc00',
  inhibitor: '#888888',
  bonded: '#cc88ff',
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

function spawnMolecule(type: MolType): Molecule {
  const w = canvas.width
  const h = canvas.height
  const r = 14 + Math.random() * 6
  const angle = Math.random() * Math.PI * 2
  const speed = 0.5 + Math.random() * 1
  return {
    x: r + Math.random() * (w - r * 2),
    y: r + Math.random() * (h - r * 2),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: r,
    type,
    partner: PAIRS[type],
    barrier: 1,
    barrierTimer: 0,
    inhibited: false,
    bonding: false,
    bondTimer: 0,
    bondPartner: null,
    id: molIdCounter++,
    flash: 0,
  }
}

function initWave(waveNum: number): void {
  const count = 6 + waveNum * 2
  molecules = []

  const types: MolType[] = ['red', 'blue', 'green', 'yellow']
  for (let i = 0; i < count; i++) {
    molecules.push(spawnMolecule(types[i % 4]))
  }

  // Wave 3+: add inhibitors
  if (waveNum >= 3) {
    const inhCount = Math.min(4, waveNum - 2)
    for (let i = 0; i < inhCount; i++) {
      molecules.push(spawnMolecule('inhibitor'))
    }
  }
}

// ── Update ────────────────────────────────────────────────────────────────────

function update(dt: number): void {
  if (!running || gameOver) return

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

  const w = canvas.width
  const h = canvas.height

  // Brownian motion
  for (const m of molecules) {
    if (m.type === 'bonded') continue

    // Brownian
    m.vx += (Math.random() - 0.5) * 0.4
    m.vy += (Math.random() - 0.5) * 0.4

    const speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy)
    const maxSpeed = 1.8
    if (speed > maxSpeed) { m.vx *= maxSpeed / speed; m.vy *= maxSpeed / speed }

    m.x += m.vx
    m.y += m.vy

    // Wall bounce
    if (m.x - m.radius < 0) { m.x = m.radius; m.vx = Math.abs(m.vx) }
    if (m.x + m.radius > w) { m.x = w - m.radius; m.vx = -Math.abs(m.vx) }
    if (m.y - m.radius < 0) { m.y = m.radius; m.vy = Math.abs(m.vy) }
    if (m.y + m.radius > h) { m.y = h - m.radius; m.vy = -Math.abs(m.vy) }

    // Barrier
    if (m.barrierTimer > 0) {
      m.barrierTimer -= dt
      m.barrier = Math.max(0.1, m.barrierTimer / 2)
      if (m.barrierTimer <= 0) m.barrier = 1
    }

    // Flash
    if (m.flash > 0) m.flash = Math.max(0, m.flash - dt * 2)
  }

  // Inhibitor interactions — inhibit nearby molecules
  const inhibitors = molecules.filter(m => m.type === 'inhibitor')
  for (const inh of inhibitors) {
    for (const m of molecules) {
      if (m.type === 'inhibitor' || m.type === 'bonded') continue
      const d = Math.hypot(m.x - inh.x, m.y - inh.y)
      if (d < m.radius + inh.radius + 20) {
        m.inhibited = true
      } else {
        m.inhibited = false
      }
    }
  }

  // Bond detection
  const active = molecules.filter(m => m.type !== 'bonded' && m.type !== 'inhibitor')
  for (let i = 0; i < active.length; i++) {
    const a = active[i]
    if (!a.partner || a.inhibited || a.barrier > 0.5) continue
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j]
      if (b.type !== a.partner) continue
      if (b.inhibited || b.barrier > 0.5) continue
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (d < a.radius + b.radius + 8) {
        // Bond!
        const bx = (a.x + b.x) / 2
        const by = (a.y + b.y) / 2
        a.type = 'bonded'
        b.type = 'bonded'
        a.vx = 0; a.vy = 0
        b.vx = 0; b.vy = 0
        a.x = bx; a.y = by
        b.x = bx; b.y = by
        bondsFormed++
        audio.score()

        bondEffects.push({
          x: bx, y: by,
          radius: 10,
          alpha: 1,
          color: '#ffffff',
        })

        // Spawn replacement molecules
        setTimeout(() => {
          if (!running) return
          const types: MolType[] = ['red', 'blue', 'green', 'yellow']
          molecules.push(spawnMolecule(types[Math.floor(Math.random() * 4)]))
          molecules.push(spawnMolecule(types[Math.floor(Math.random() * 4)]))
        }, 1500)
      }
    }
  }

  // Remove bonded pairs after brief flash
  for (const m of molecules) {
    if (m.type === 'bonded') {
      m.flash += dt
      if (m.flash > 1.5) m.flash = 999  // mark for removal
    }
  }
  molecules = molecules.filter(m => !(m.type === 'bonded' && m.flash >= 999))

  // Bond effects
  for (const be of bondEffects) {
    be.radius += 40 * dt
    be.alpha -= dt * 1.5
  }
  bondEffects = bondEffects.filter(be => be.alpha > 0)

  // HUD
  ;(document.getElementById('bonds-val') as HTMLSpanElement).textContent = String(bondsFormed)
  ;(document.getElementById('time-val') as HTMLSpanElement).textContent = String(Math.ceil(timeLeft))
  ;(document.getElementById('wave-val') as HTMLSpanElement).textContent = String(wave)

  // Charge pips
  for (let i = 0; i < MAX_CHARGES; i++) {
    const pip = document.getElementById(`pip-${i}`)!
    pip.className = 'charge-pip' + (i < charges ? '' : ' empty')
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function draw(): void {
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  // Background
  ctx.fillStyle = '#050510'
  ctx.fillRect(0, 0, w, h)

  // Bond effects
  for (const be of bondEffects) {
    ctx.beginPath()
    ctx.arc(be.x, be.y, be.radius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255,255,255,${be.alpha})`
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // Molecules
  for (const m of molecules) {
    const r = m.radius
    const color = COLORS[m.type]

    if (m.type === 'bonded') {
      const fa = Math.min(1, m.flash)
      ctx.globalAlpha = 1 - fa
      ctx.beginPath()
      ctx.arc(m.x, m.y, r * (1 + fa), 0, Math.PI * 2)
      ctx.fillStyle = COLORS.bonded
      ctx.fill()
      ctx.globalAlpha = 1
      continue
    }

    // Inhibitor halo
    if (m.inhibited) {
      ctx.beginPath()
      ctx.arc(m.x, m.y, r + 8, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(150,100,200,0.5)'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Barrier ring — bigger ring = higher barrier
    if (m.type !== 'inhibitor') {
      const barrierR = r + 3 + m.barrier * 10
      const barrierAlpha = m.barrier * 0.6
      ctx.beginPath()
      ctx.arc(m.x, m.y, barrierR, 0, Math.PI * 2)
      const barrierColor = m.barrierTimer > 0 ? `rgba(255,220,80,${barrierAlpha})` : `rgba(150,150,255,${barrierAlpha * 0.5})`
      ctx.strokeStyle = barrierColor
      ctx.lineWidth = m.barrierTimer > 0 ? 2.5 : 1.5
      ctx.stroke()
    }

    // Molecule body
    const grad = ctx.createRadialGradient(m.x - r * 0.3, m.y - r * 0.3, 0, m.x, m.y, r)
    grad.addColorStop(0, lighten(color))
    grad.addColorStop(1, color)
    ctx.beginPath()
    ctx.arc(m.x, m.y, r, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.globalAlpha = m.inhibited ? 0.5 : 0.85
    ctx.fill()
    ctx.globalAlpha = 1

    // Outline
    ctx.beginPath()
    ctx.arc(m.x, m.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Type letter
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `bold ${Math.floor(r * 0.7)}px Courier New`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(m.type[0].toUpperCase(), m.x, m.y)
  }

  // Charge regen arc
  if (charges < MAX_CHARGES && chargeTimer > 0) {
    const pct = chargeTimer / CHARGE_REGEN
    ctx.beginPath()
    ctx.arc(w - 25, h - 25, 12, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2)
    ctx.strokeStyle = 'rgba(200,150,255,0.7)'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }
}

function lighten(hex: string): string {
  // Simple lightening
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 0xff) + 80)
  const g = Math.min(255, ((n >> 8) & 0xff) + 80)
  const b = Math.min(255, (n & 0xff) + 80)
  return `rgb(${r},${g},${b})`
}

// ── Interaction ───────────────────────────────────────────────────────────────

function handleClick(cx: number, cy: number): void {
  if (!running || charges <= 0) return

  let nearest: Molecule | null = null
  let nearestD = 80
  for (const m of molecules) {
    if (m.type === 'bonded' || m.type === 'inhibitor') continue
    const d = Math.hypot(m.x - cx, m.y - cy)
    if (d < nearestD) { nearestD = d; nearest = m }
  }
  if (nearest) {
    nearest.barrierTimer = 2
    nearest.barrier = 0.1
    nearest.flash = 0
    charges--
    chargeTimer = 0
    audio.click()
  }
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  handleClick((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy)
})

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const t = e.touches[0]
  handleClick((t.clientX - rect.left) * sx, (t.clientY - rect.top) * sy)
}, { passive: false })

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
  if (bondsFormed > bestScore) {
    bestScore = bondsFormed
    saveBestScore(bondsFormed)
    ;(document.getElementById('best-val') as HTMLSpanElement).textContent = String(bestScore)
  }
  reportGameOver(bondsFormed)
  const msg = bondsFormed >= 20 ? 'Master Chemist!' : bondsFormed >= 10 ? 'Good catalysis!' : 'Keep bonding!'
  buildOverlay('Reaction Complete', `${bondsFormed} bonds formed! ${msg} Best: ${bestScore}`, 'React Again', startGame)
}

function startGame(): void {
  bondsFormed = 0
  timeLeft = 90
  wave = 1
  charges = 5
  chargeTimer = 0
  running = true
  gameOver = false
  bondEffects = []

  initWave(wave)
  audio.start()

  const ov = document.getElementById('overlay')!
  ov.style.display = 'none'

  const banner = document.getElementById('wave-banner') as HTMLDivElement
  banner.textContent = 'Wave 1 — React!'
  banner.style.display = 'block'
  setTimeout(() => { banner.style.display = 'none' }, 2000)

  // Wave progression — every 30s
  const waveInterval = setInterval(() => {
    if (!running) { clearInterval(waveInterval); return }
    wave++
    if (wave > 3) { clearInterval(waveInterval); return }
    initWave(wave)
    audio.levelUp()
    const b = document.getElementById('wave-banner') as HTMLDivElement
    b.textContent = `Wave ${wave} — Inhibitors added!`
    b.style.display = 'block'
    setTimeout(() => { b.style.display = 'none' }, 2000)
  }, 30000)
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
