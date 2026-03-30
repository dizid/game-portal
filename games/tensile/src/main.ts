import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────

type GameState = 'READY' | 'PLAYING' | 'LEVEL_END' | 'GAME_OVER'
type OrbType = 'normal' | 'heavy' | 'repair' | 'phantom'

interface Vec2 { x: number; y: number }

interface Node {
  x: number
  y: number
  px: number   // previous x (Verlet)
  py: number   // previous y (Verlet)
  ax: number   // accumulated acceleration x
  ay: number   // accumulated acceleration y
  mass: number // base 1.0, heavy orbs add 0.5
  dragging: boolean
  glowTimer: number
  swellTimer: number
}

interface Thread {
  a: number   // node index
  b: number   // node index
  restLength: number
  snapped: boolean
  snapPercent: number  // set when snapped, for debug display
}

interface Orb {
  x: number
  y: number
  type: OrbType
  collected: boolean
  points: number
  phantomTimer: number  // countdown before teleport warning
  glintAngle: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number   // 0–1
  decay: number
  size: number
  color: string
}

interface FloatLabel {
  x: number
  y: number
  text: string
  life: number
  color: string
  vy: number
}

// ── Canvas & HUD ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const levelEl = document.getElementById('level-value') as HTMLSpanElement
const bestEl = document.getElementById('best-value') as HTMLSpanElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

function resizeCanvas(): void {
  const cont = canvas.parentElement!
  const sz = Math.min(cont.clientWidth, cont.clientHeight - 50)
  canvas.width = Math.max(280, sz)
  canvas.height = Math.max(280, sz)
  canvas.style.width = `${canvas.width}px`
  canvas.style.height = `${canvas.height}px`
}
resizeCanvas()
window.addEventListener('resize', () => { resizeCanvas(); if (state !== 'READY') initLevel(level) })

muteBtn.addEventListener('click', () => {
  muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊'
})

// ── State ──────────────────────────────────────────────────────────────────────

let state: GameState = 'READY'
let level = 1
let score = 0
let bestScore = 0
let nodes: Node[] = []
let threads: Thread[] = []
let orbs: Orb[] = []
let particles: Particle[] = []
let floatLabels: FloatLabel[] = []

// Drag state
let dragNodeIdx = -1
let dragOffsetX = 0
let dragOffsetY = 0

// Screen shake
let shakeTimer = 0
let shakeIntensity = 0

// Level-end overlay
let levelEndTimer = 0
const LEVEL_END_DURATION = 2.5

// Harp strum state
let harpStrum = false
let harpStrumTimer = 0
let harpStrumPhase = 0

// ── Level Definitions ──────────────────────────────────────────────────────────

interface LevelConfig {
  orbCount: number
  requiredPct: number     // fraction of orbs needed (0–1)
  orbSpreadRadius: number // how far orbs can be from center
  topology: 'pentagon' | 'star' | 'hexagonal' | 'grid' | 'random' | 'dense'
  maxStretchAllowed: number  // 2.0 = can snap, >2.0 = threads are longer so harder to snap
}

const LEVELS: LevelConfig[] = [
  { orbCount: 15, requiredPct: 0.80, orbSpreadRadius: 0.28, topology: 'pentagon',   maxStretchAllowed: 3.0  }, // 1
  { orbCount: 16, requiredPct: 0.80, orbSpreadRadius: 0.30, topology: 'star',       maxStretchAllowed: 2.8  }, // 2
  { orbCount: 17, requiredPct: 0.80, orbSpreadRadius: 0.36, topology: 'hexagonal',  maxStretchAllowed: 2.2  }, // 3
  { orbCount: 18, requiredPct: 0.80, orbSpreadRadius: 0.38, topology: 'hexagonal',  maxStretchAllowed: 2.1  }, // 4
  { orbCount: 19, requiredPct: 0.80, orbSpreadRadius: 0.44, topology: 'grid',       maxStretchAllowed: 2.0  }, // 5
  { orbCount: 20, requiredPct: 0.80, orbSpreadRadius: 0.46, topology: 'grid',       maxStretchAllowed: 2.0  }, // 6
  { orbCount: 21, requiredPct: 0.85, orbSpreadRadius: 0.48, topology: 'random',     maxStretchAllowed: 2.0  }, // 7
  { orbCount: 22, requiredPct: 0.85, orbSpreadRadius: 0.50, topology: 'random',     maxStretchAllowed: 2.0  }, // 8
  { orbCount: 23, requiredPct: 0.90, orbSpreadRadius: 0.52, topology: 'dense',      maxStretchAllowed: 2.0  }, // 9
  { orbCount: 25, requiredPct: 0.90, orbSpreadRadius: 0.55, topology: 'dense',      maxStretchAllowed: 2.0  }, // 10
]

// ── Topology Builders ──────────────────────────────────────────────────────────

function makeNode(x: number, y: number): Node {
  return { x, y, px: x, py: y, ax: 0, ay: 0, mass: 1.0, dragging: false, glowTimer: 0, swellTimer: 0 }
}

function makeThread(a: number, b: number, ns: Node[]): Thread {
  const dx = ns[a].x - ns[b].x
  const dy = ns[a].y - ns[b].y
  return { a, b, restLength: Math.sqrt(dx * dx + dy * dy), snapped: false, snapPercent: 0 }
}

function buildTopology(topology: LevelConfig['topology'], cx: number, cy: number, r: number): { nodes: Node[]; threads: Thread[] } {
  const ns: Node[] = []
  const ts: Thread[] = []

  const add = (x: number, y: number) => ns.push(makeNode(x, y))
  const connect = (a: number, b: number) => ts.push(makeThread(a, b, ns))
  const ring = (count: number, radius: number, offset = 0, startIdx = 0) => {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + offset
      add(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
    }
    for (let i = 0; i < count; i++) connect(startIdx + i, startIdx + (i + 1) % count)
  }

  switch (topology) {
    case 'pentagon': {
      // 5 outer nodes + 2 center-ish nodes for cross-bracing (7 total uses fewer but spec says 5+2)
      add(cx, cy)              // 0 center
      ring(5, r * 0.55, 0, 1) // 1–5 outer
      add(cx, cy - r * 0.25)  // 6 upper mid
      // radial from center
      for (let i = 1; i <= 5; i++) connect(0, i)
      // 2 cross braces
      connect(1, 3)
      connect(2, 5)
      break
    }
    case 'star': {
      add(cx, cy)              // 0 center
      ring(5, r * 0.55, 0, 1) // 1–5 outer ring
      add(cx, cy - r * 0.20)  // 6 extra
      for (let i = 1; i <= 5; i++) connect(0, i)
      for (let i = 1; i <= 5; i++) connect(i, ((i) % 5) + 1)
      connect(0, 6); connect(6, 1)
      break
    }
    case 'hexagonal': {
      add(cx, cy)              // 0 center
      ring(6, r * 0.50, 0, 1) // 1–6 outer
      for (let i = 1; i <= 6; i++) connect(0, i)
      // every other diagonal cross
      connect(1, 3); connect(2, 4); connect(3, 5); connect(4, 6)
      break
    }
    case 'grid': {
      // 3×3 grid = 9 nodes
      const gap = r * 0.40
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          add(cx + (col - 1) * gap, cy + (row - 1) * gap)
        }
      }
      // horizontal & vertical edges
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) connect(row * 3 + col, row * 3 + col + 1)
      }
      for (let col = 0; col < 3; col++) {
        for (let row = 0; row < 2; row++) connect(row * 3 + col, (row + 1) * 3 + col)
      }
      // 2 diagonal cross-braces
      connect(0, 4); connect(2, 4)
      break
    }
    case 'random': {
      // 8 nodes semi-random planar arrangement
      const positions: Vec2[] = [
        { x: cx,          y: cy - r * 0.45 },
        { x: cx + r * 0.40, y: cy - r * 0.20 },
        { x: cx + r * 0.45, y: cy + r * 0.25 },
        { x: cx + r * 0.15, y: cy + r * 0.48 },
        { x: cx - r * 0.20, y: cy + r * 0.45 },
        { x: cx - r * 0.45, y: cy + r * 0.15 },
        { x: cx - r * 0.40, y: cy - r * 0.30 },
        { x: cx,            y: cy },
      ]
      positions.forEach(p => add(p.x, p.y))
      // spanning edges + extra bracing = 14 edges
      const edges = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,0],[7,0],[7,1],[7,2],[7,4],[7,5],[0,3],[1,6]]
      edges.forEach(([a, b]) => connect(a, b))
      break
    }
    case 'dense': {
      // 10 nodes, 18 edges
      add(cx, cy)                                    // 0
      ring(6, r * 0.42, 0, 1)                        // 1–6 inner ring
      ring(3, r * 0.68, Math.PI / 6, 7)             // 7–9 outer triangle
      // inner ring fully connected to center + ring edges already placed
      for (let i = 1; i <= 6; i++) connect(0, i)
      // outer triangle
      connect(7, 8); connect(8, 9); connect(9, 7)
      // inner to outer connections
      connect(1, 7); connect(2, 7); connect(3, 8); connect(4, 8); connect(5, 9); connect(6, 9)
      break
    }
  }

  return { nodes: ns, threads: ts }
}

// ── Orb Placement ──────────────────────────────────────────────────────────────

function orbTypeForLevel(lvl: number): OrbType {
  const r = Math.random()
  if (lvl <= 2) return 'normal'
  if (lvl <= 4) return r < 0.10 ? 'repair' : 'normal'
  if (lvl <= 6) return r < 0.12 ? 'heavy' : r < 0.20 ? 'repair' : 'normal'
  // levels 7–10: introduce phantom
  return r < 0.10 ? 'phantom' : r < 0.18 ? 'heavy' : r < 0.25 ? 'repair' : 'normal'
}

function orbPoints(type: OrbType): number {
  switch (type) {
    case 'normal':  return 10
    case 'heavy':   return 30
    case 'repair':  return 10
    case 'phantom': return 50
  }
}

function placeOrbs(count: number, cx: number, cy: number, spreadRadius: number, lvl: number): Orb[] {
  const result: Orb[] = []
  const W = canvas.width
  const H = canvas.height
  const padding = 20

  for (let i = 0; i < count; i++) {
    // Random position within spread radius, biased outward a bit for challenge
    const angle = Math.random() * Math.PI * 2
    // Use sqrt for uniform area distribution
    const dist = Math.sqrt(0.3 + Math.random() * 0.7) * spreadRadius * Math.min(W, H)
    const x = Math.max(padding, Math.min(W - padding, cx + Math.cos(angle) * dist))
    const y = Math.max(padding, Math.min(H - padding, cy + Math.sin(angle) * dist))
    const type = orbTypeForLevel(lvl)
    result.push({
      x, y, type,
      collected: false,
      points: orbPoints(type),
      phantomTimer: 0,
      glintAngle: Math.random() * Math.PI * 2,
    })
  }
  return result
}

// ── Level Init ─────────────────────────────────────────────────────────────────

function initLevel(lvl: number): void {
  const W = canvas.width
  const H = canvas.height
  const cx = W / 2
  const cy = H / 2
  const r = Math.min(W, H) * 0.38

  const cfg = LEVELS[Math.min(lvl - 1, LEVELS.length - 1)]
  const built = buildTopology(cfg.topology, cx, cy, r)

  // Scale rest lengths so threads don't snap trivially early on
  if (cfg.maxStretchAllowed > 2.0) {
    const scale = cfg.maxStretchAllowed / 2.0
    built.threads.forEach(t => { t.restLength *= scale })
  }

  nodes = built.nodes
  threads = built.threads
  orbs = placeOrbs(cfg.orbCount, cx, cy, cfg.orbSpreadRadius, lvl)
  particles = []
  floatLabels = []
  dragNodeIdx = -1
  shakeTimer = 0
  harpStrum = false

  levelEl.textContent = String(lvl)
}

// ── Physics ────────────────────────────────────────────────────────────────────

const SPRING_K = 0.30
const DAMPING = 0.98
const COLLECT_RADIUS = 15
const PHANTOM_FLEE_RADIUS = 30

function stepPhysics(dt: number): void {
  // Reset accelerations
  for (const n of nodes) { n.ax = 0; n.ay = 0 }

  // Spring forces along threads
  for (const t of threads) {
    if (t.snapped) continue
    const na = nodes[t.a]
    const nb = nodes[t.b]
    const dx = nb.x - na.x
    const dy = nb.y - na.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
    const stretch = dist - t.restLength
    const fx = (SPRING_K * stretch * dx) / dist
    const fy = (SPRING_K * stretch * dy) / dist

    // Apply inversely weighted by mass
    if (!na.dragging) { na.ax += fx / na.mass; na.ay += fy / na.mass }
    if (!nb.dragging) { nb.ax -= fx / nb.mass; nb.ay -= fy / nb.mass }
  }

  // Verlet integration
  for (const n of nodes) {
    if (n.dragging) {
      // Dragged node: freeze Verlet by syncing previous position
      n.px = n.x
      n.py = n.y
      continue
    }
    const vx = (n.x - n.px) * DAMPING
    const vy = (n.y - n.py) * DAMPING
    const nx = n.x + vx + n.ax * dt * dt
    const ny = n.y + vy + n.ay * dt * dt
    n.px = n.x
    n.py = n.y
    n.x = nx
    n.y = ny

    // Keep within canvas
    const margin = 12
    if (n.x < margin) { n.x = margin; n.px = n.x + vx * 0.3 }
    if (n.x > canvas.width - margin) { n.x = canvas.width - margin; n.px = n.x + vx * 0.3 }
    if (n.y < margin) { n.y = margin; n.py = n.y + vy * 0.3 }
    if (n.y > canvas.height - margin) { n.y = canvas.height - margin; n.py = n.y + vy * 0.3 }
  }

  // Thread snap check
  for (const t of threads) {
    if (t.snapped) continue
    const na = nodes[t.a]
    const nb = nodes[t.b]
    const dx = nb.x - na.x
    const dy = nb.y - na.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const pct = dist / t.restLength
    if (pct >= 2.0) {
      t.snapped = true
      t.snapPercent = pct
      snapEffect(na, nb, pct)
    }
  }
}

// ── Plastic Deformation ────────────────────────────────────────────────────────

// Called when a node is released after dragging
function applyPlasticDeformation(nodeIdx: number, dragX: number, dragY: number): void {
  const n = nodes[nodeIdx]
  // Rest position shifts 10% toward drag position
  // We model this by nudging connected thread rest lengths
  // Actually: shift node's "neutral" by updating rest lengths of all connected threads
  // Simple approach: find neighbours and slightly adjust their rest lengths
  for (const t of threads) {
    if (t.snapped) continue
    if (t.a === nodeIdx || t.b === nodeIdx) {
      const other = t.a === nodeIdx ? nodes[t.b] : nodes[t.a]
      const dx = other.x - dragX
      const dy = other.y - dragY
      const newDist = Math.sqrt(dx * dx + dy * dy)
      // Blend 10% toward new distance
      t.restLength = t.restLength * 0.90 + newDist * 0.10
    }
  }
  _ = dragX  // suppress unused warning
  _ = dragY
}
// Workaround for strict unused variable — TypeScript will use the function params above
let _: unknown

// ── Orb Collection ─────────────────────────────────────────────────────────────

function checkOrbCollection(): void {
  const cfg = LEVELS[Math.min(level - 1, LEVELS.length - 1)]

  for (const orb of orbs) {
    if (orb.collected) continue

    for (let ni = 0; ni < nodes.length; ni++) {
      const n = nodes[ni]
      const dx = n.x - orb.x
      const dy = n.y - orb.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Phantom orb: flee when node gets within PHANTOM_FLEE_RADIUS
      if (orb.type === 'phantom' && dist < PHANTOM_FLEE_RADIUS && dist > COLLECT_RADIUS) {
        // Teleport to new position
        const angle = Math.random() * Math.PI * 2
        const spread = cfg.orbSpreadRadius * Math.min(canvas.width, canvas.height)
        const cx = canvas.width / 2
        const cy = canvas.height / 2
        orb.x = Math.max(20, Math.min(canvas.width - 20, cx + Math.cos(angle) * spread * (0.5 + Math.random() * 0.5)))
        orb.y = Math.max(20, Math.min(canvas.height - 20, cy + Math.sin(angle) * spread * (0.5 + Math.random() * 0.5)))
        spawnParticles(orb.x, orb.y, 6, '#cc88ff', 2)
        break
      }

      if (dist <= COLLECT_RADIUS) {
        collectOrb(orb, ni)
        break
      }
    }
  }
}

function collectOrb(orb: Orb, nodeIdx: number): void {
  orb.collected = true
  score += orb.points
  scoreEl.textContent = String(score)
  if (score > bestScore) {
    bestScore = score
    bestEl.textContent = String(bestScore)
    saveHighScore(bestScore)
  }
  reportScore(score)

  spawnParticles(orb.x, orb.y, 12, orbColor(orb.type), 3)
  nodes[nodeIdx].swellTimer = 0.25
  audio.score()

  if (orb.type === 'heavy') {
    nodes[nodeIdx].mass = Math.min(nodes[nodeIdx].mass + 0.5, 3.0)
    spawnFloat(orb.x, orb.y, '+MASS', '#ffd700')
  } else if (orb.type === 'repair') {
    repairRandomThread()
  } else if (orb.type === 'phantom') {
    spawnFloat(orb.x, orb.y, '+50', '#cc88ff')
    audio.powerup()
  }

  if (orb.type !== 'phantom') {
    spawnFloat(orb.x, orb.y - 10, `+${orb.points}`, '#ffffff')
  }
}

function repairRandomThread(): void {
  const snapped = threads.filter(t => t.snapped)
  if (snapped.length === 0) return
  const t = snapped[Math.floor(Math.random() * snapped.length)]
  t.snapped = false
  t.snapPercent = 0
  // Restore rest length from current positions
  const na = nodes[t.a]
  const nb = nodes[t.b]
  const dx = nb.x - na.x
  const dy = nb.y - na.y
  t.restLength = Math.sqrt(dx * dx + dy * dy)
  // Golden reconstruction effect
  spawnParticles((na.x + nb.x) / 2, (na.y + nb.y) / 2, 8, '#ffd700', 2.5)
  spawnFloat((na.x + nb.x) / 2, (na.y + nb.y) / 2, 'REPAIRED', '#4488ff')
  audio.levelUp()
}

// ── Win Check ──────────────────────────────────────────────────────────────────

function checkLevelEnd(): void {
  const cfg = LEVELS[Math.min(level - 1, LEVELS.length - 1)]
  const total = orbs.length
  const collected = orbs.filter(o => o.collected).length
  if (collected / total >= cfg.requiredPct) {
    triggerLevelEnd()
  }
}

function triggerLevelEnd(): void {
  state = 'LEVEL_END'
  levelEndTimer = LEVEL_END_DURATION
  dragNodeIdx = -1
  audio.levelUp()
  harpStrum = true
  harpStrumTimer = 0
  harpStrumPhase = 0
}

// ── Effects ────────────────────────────────────────────────────────────────────

function spawnParticles(x: number, y: number, count: number, color: string, speed: number): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
    const v = speed * (0.6 + Math.random() * 0.8)
    particles.push({
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: 1.0,
      decay: 0.8 + Math.random() * 0.6,
      size: 2 + Math.random() * 3,
      color,
    })
  }
}

function spawnFloat(x: number, y: number, text: string, color: string): void {
  floatLabels.push({ x, y, text, life: 1.0, color, vy: -40 })
}

function snapEffect(na: Node, nb: Node, pct: number): void {
  const mx = (na.x + nb.x) / 2
  const my = (na.y + nb.y) / 2
  spawnParticles(na.x, na.y, 8, '#ff6600', 4)
  spawnParticles(nb.x, nb.y, 8, '#ff6600', 4)
  shakeTimer = 0.12
  shakeIntensity = 5
  const pctInt = Math.round(pct * 100)
  spawnFloat(mx, my - 15, `SNAP ${pctInt}% (${pctInt - 200}% over)`, '#ff4400')
  audio.death()
}

// ── Thread Color ───────────────────────────────────────────────────────────────

function threadColor(pct: number): string {
  // pct = currentLength / restLength
  if (pct <= 1.0) return 'rgba(255,255,255,0.7)'
  if (pct <= 1.3) {
    const t = (pct - 1.0) / 0.3
    const r = Math.round(255)
    const g = Math.round(255 * (1 - t))
    return `rgb(${r},${g},0)`
  }
  if (pct <= 1.7) {
    const t = (pct - 1.3) / 0.4
    return `rgb(255,${Math.round(140 * (1 - t))},0)`
  }
  // 1.7 to 2.0 = red with intensity
  return `rgb(255,${Math.round(30 * (2.0 - pct) / 0.3)},0)`
}

function threadThickness(pct: number): number {
  // Thins as it stretches
  return Math.max(0.5, 2.5 - pct * 1.0)
}

function threadVibration(pct: number, time: number): number {
  // Vibration offset for >1.7 stretch
  if (pct < 1.7) return 0
  const intensity = (pct - 1.7) / 0.3 * 4
  return Math.sin(time * 40) * intensity
}

// ── Draw ───────────────────────────────────────────────────────────────────────

let lastTime = 0
let gameTime = 0

function draw(timestamp: number): void {
  const raw = (timestamp - lastTime) / 1000
  const dt = Math.min(raw, 0.05)  // cap dt to avoid spiral of death
  lastTime = timestamp
  if (state === 'PLAYING') gameTime += dt

  const W = canvas.width
  const H = canvas.height

  // Screen shake transform
  ctx.save()
  if (shakeTimer > 0) {
    shakeTimer -= dt
    const sx = (Math.random() - 0.5) * shakeIntensity * 2
    const sy = (Math.random() - 0.5) * shakeIntensity * 2
    ctx.translate(sx, sy)
  }

  // Background
  ctx.fillStyle = '#0a0a1a'
  ctx.fillRect(0, 0, W, H)

  if (state === 'READY') {
    drawReady()
  } else if (state === 'PLAYING' || state === 'LEVEL_END') {
    if (state === 'PLAYING') stepPhysics(dt)
    updateTimers(dt)
    drawGame(dt)
    if (state === 'LEVEL_END') drawLevelEnd(dt)
  } else if (state === 'GAME_OVER') {
    drawGameOver()
  }

  ctx.restore()
  requestAnimationFrame(draw)
}

function updateTimers(dt: number): void {
  // Particle update
  for (const p of particles) {
    p.x += p.vx * dt * 60
    p.y += p.vy * dt * 60
    p.vy += 0.5 * dt * 60  // slight gravity
    p.life -= p.decay * dt
  }
  particles = particles.filter(p => p.life > 0)

  // Float labels
  for (const f of floatLabels) {
    f.y += f.vy * dt
    f.life -= 0.9 * dt
  }
  floatLabels = floatLabels.filter(f => f.life > 0)

  // Node timers
  for (const n of nodes) {
    if (n.glowTimer > 0) n.glowTimer -= dt
    if (n.swellTimer > 0) n.swellTimer -= dt
  }

  // Orb collection & win check (only during playing)
  if (state === 'PLAYING') {
    checkOrbCollection()
    checkLevelEnd()
    // Orb glint animation
    for (const orb of orbs) {
      if (!orb.collected) orb.glintAngle += dt * 1.5
    }
  }

  // Level-end countdown
  if (state === 'LEVEL_END') {
    levelEndTimer -= dt

    // Harp strum: pulse threads in sequence
    if (harpStrum) {
      harpStrumTimer += dt
      if (harpStrumTimer > 0.15) {
        harpStrumTimer = 0
        harpStrumPhase++
        tone(300 + harpStrumPhase * 80, 0.2)
        if (harpStrumPhase >= threads.length) harpStrum = false
      }
    }

    if (levelEndTimer <= 0) {
      if (level >= 10) {
        state = 'GAME_OVER'
        reportGameOver(score)
      } else {
        level++
        initLevel(level)
        state = 'PLAYING'
      }
    }
  }
}

function tone(freq: number, dur: number): void {
  // Direct tone helper for harp strum (avoids importing separately)
  if (audio.isMuted()) return
  try {
    const ac = new AudioContext()
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.value = 0.08
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur)
    osc.connect(gain).connect(ac.destination)
    osc.start()
    osc.stop(ac.currentTime + dur)
  } catch { /* audio unavailable */ }
}

function drawGame(dt: number): void {
  // Threads
  for (let ti = 0; ti < threads.length; ti++) {
    const t = threads[ti]
    if (t.snapped) continue
    const na = nodes[t.a]
    const nb = nodes[t.b]
    const dx = nb.x - na.x
    const dy = nb.y - na.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const pct = dist / t.restLength

    const vibOffset = threadVibration(pct, gameTime)
    const perpX = -(dy / dist) * vibOffset
    const perpY = (dx / dist) * vibOffset

    // Harp strum highlight
    const isStrumming = harpStrum && ti === harpStrumPhase

    ctx.beginPath()
    ctx.strokeStyle = isStrumming ? '#ffffff' : threadColor(pct)
    ctx.lineWidth = isStrumming ? 3.5 : threadThickness(pct)
    ctx.globalAlpha = isStrumming ? 1.0 : 0.85
    ctx.moveTo(na.x + perpX, na.y + perpY)
    ctx.lineTo(nb.x + perpX, nb.y + perpY)
    ctx.stroke()
    ctx.globalAlpha = 1.0

    // DANGER label at 190%+
    if (pct >= 1.9 && pct < 2.0) {
      const mx = (na.x + nb.x) / 2
      const my = (na.y + nb.y) / 2
      ctx.fillStyle = `rgba(255,80,0,${0.7 + 0.3 * Math.sin(gameTime * 20)})`
      ctx.font = 'bold 9px Courier New'
      ctx.textAlign = 'center'
      ctx.fillText('DANGER', mx, my - 6)
    }
  }

  // Nodes
  for (const n of nodes) {
    const baseRadius = 9
    const swell = n.swellTimer > 0 ? Math.sin((n.swellTimer / 0.25) * Math.PI) * 4 : 0
    const radius = baseRadius + swell
    const glowing = n.dragging || n.glowTimer > 0

    if (glowing) {
      ctx.beginPath()
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, radius * 2.5)
      grad.addColorStop(0, 'rgba(100,150,255,0.5)')
      grad.addColorStop(1, 'rgba(100,150,255,0)')
      ctx.fillStyle = grad
      ctx.arc(n.x, n.y, radius * 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.beginPath()
    ctx.fillStyle = n.dragging ? '#aaccff' : '#6496ff'
    ctx.arc(n.x, n.y, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(200,220,255,0.6)'
    ctx.lineWidth = 1.5
    ctx.arc(n.x, n.y, radius, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Orbs
  for (const orb of orbs) {
    if (orb.collected) continue
    const col = orbColor(orb.type)
    const glint = Math.abs(Math.sin(orb.glintAngle))

    ctx.beginPath()
    const grad = ctx.createRadialGradient(orb.x - 2, orb.y - 2, 1, orb.x, orb.y, 8)
    grad.addColorStop(0, 'rgba(255,255,255,0.8)')
    grad.addColorStop(0.4, col)
    grad.addColorStop(1, 'rgba(0,0,0,0.4)')
    ctx.fillStyle = grad
    ctx.arc(orb.x, orb.y, 7, 0, Math.PI * 2)
    ctx.fill()

    // Outer glow ring
    ctx.beginPath()
    ctx.strokeStyle = col
    ctx.globalAlpha = 0.3 + glint * 0.5
    ctx.lineWidth = 1.2
    ctx.arc(orb.x, orb.y, 9, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1.0

    // Phantom orb pulsing indicator
    if (orb.type === 'phantom') {
      ctx.beginPath()
      ctx.strokeStyle = `rgba(200,100,255,${0.3 + 0.4 * Math.sin(gameTime * 4)})`
      ctx.lineWidth = 1
      ctx.arc(orb.x, orb.y, PHANTOM_FLEE_RADIUS, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // Particles
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life)
    ctx.beginPath()
    ctx.fillStyle = p.color
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1.0

  // Float labels
  ctx.font = 'bold 11px Courier New'
  ctx.textAlign = 'center'
  for (const f of floatLabels) {
    ctx.globalAlpha = Math.max(0, f.life)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y)
  }
  ctx.globalAlpha = 1.0

  // Drag trail: small dots from previous to current node pos
  if (dragNodeIdx >= 0) {
    const n = nodes[dragNodeIdx]
    for (let i = 0; i < 3; i++) {
      const t = (i + 1) / 4
      ctx.beginPath()
      ctx.fillStyle = `rgba(100,150,255,${0.15 * (1 - t)})`
      ctx.arc(n.px + (n.x - n.px) * t, n.py + (n.y - n.py) * t, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Progress bar
  const total = orbs.length
  const collected = orbs.filter(o => o.collected).length
  const cfg = LEVELS[Math.min(level - 1, LEVELS.length - 1)]
  const required = Math.ceil(total * cfg.requiredPct)
  const barW = canvas.width * 0.4
  const barH = 6
  const barX = (canvas.width - barW) / 2
  const barY = canvas.height - 18
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2)
  ctx.fillStyle = 'rgba(100,150,255,0.25)'
  ctx.fillRect(barX, barY, barW, barH)
  ctx.fillStyle = '#6496ff'
  ctx.fillRect(barX, barY, barW * (collected / total), barH)
  // required marker
  const reqX = barX + barW * (required / total)
  ctx.fillStyle = '#ffaa00'
  ctx.fillRect(reqX - 1, barY - 2, 2, barH + 4)
  ctx.font = '10px Courier New'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText(`${collected}/${required}`, canvas.width / 2, barY - 4)
}

function drawLevelEnd(dt: number): void {
  void dt
  const alpha = Math.min(1, (LEVEL_END_DURATION - levelEndTimer) * 3)
  ctx.fillStyle = `rgba(0,0,0,${alpha * 0.5})`
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const cx = canvas.width / 2
  const cy = canvas.height / 2

  ctx.font = 'bold 32px Courier New'
  ctx.textAlign = 'center'
  ctx.fillStyle = `rgba(100,200,100,${alpha})`
  ctx.fillText(level >= 10 ? 'YOU WIN!' : 'LEVEL CLEAR!', cx, cy - 20)

  ctx.font = '16px Courier New'
  ctx.fillStyle = `rgba(255,255,255,${alpha})`
  ctx.fillText(`Score: ${score}`, cx, cy + 14)

  if (level < 10) {
    ctx.font = '12px Courier New'
    ctx.fillStyle = `rgba(100,150,255,${alpha})`
    ctx.fillText(`Level ${level + 1} incoming...`, cx, cy + 40)
  }
}

function drawReady(): void {
  const cx = canvas.width / 2
  const cy = canvas.height / 2

  // Draw demo web
  ctx.strokeStyle = 'rgba(100,150,255,0.3)'
  ctx.lineWidth = 1.5
  const r = Math.min(canvas.width, canvas.height) * 0.18
  for (let i = 0; i < 6; i++) {
    const a1 = (Math.PI * 2 * i) / 6
    const a2 = (Math.PI * 2 * ((i + 1) % 6)) / 6
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r)
    ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r)
    ctx.stroke()
  }

  ctx.font = 'bold 28px Courier New'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#6496ff'
  ctx.fillText('TENSILE', cx, cy - 60)

  ctx.font = '12px Courier New'
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillText('Drag nodes to collect orbs.', cx, cy - 30)
  ctx.fillText('Stretch threads — but beware of snapping!', cx, cy - 10)

  ctx.font = '11px Courier New'
  ctx.fillStyle = 'rgba(180,180,255,0.7)'
  ctx.fillText('● White = 10pts   ● Gold = 30pts (+mass)', cx, cy + 20)
  ctx.fillText('● Blue = repair   ● Purple = 50pts (flees!)', cx, cy + 38)

  ctx.font = 'bold 14px Courier New'
  ctx.fillStyle = `rgba(100,200,100,${0.7 + 0.3 * Math.sin(Date.now() / 400)})`
  ctx.fillText('PRESS SPACE / ENTER or TAP TO START', cx, cy + 72)

  if (bestScore > 0) {
    ctx.font = '11px Courier New'
    ctx.fillStyle = 'rgba(255,200,0,0.8)'
    ctx.fillText(`Best: ${bestScore}`, cx, cy + 96)
  }
}

function drawGameOver(): void {
  const cx = canvas.width / 2
  const cy = canvas.height / 2

  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.font = 'bold 32px Courier New'
  ctx.textAlign = 'center'
  ctx.fillStyle = score > 0 && level >= 10 ? '#88ff88' : '#ff4466'
  ctx.fillText(level >= 10 ? 'COMPLETE!' : 'GAME OVER', cx, cy - 30)

  ctx.font = '18px Courier New'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`Final Score: ${score}`, cx, cy + 10)

  ctx.font = '13px Courier New'
  ctx.fillStyle = 'rgba(255,200,0,0.9)'
  ctx.fillText(`Best: ${bestScore}`, cx, cy + 36)

  ctx.font = 'bold 13px Courier New'
  ctx.fillStyle = `rgba(100,200,100,${0.7 + 0.3 * Math.sin(Date.now() / 400)})`
  ctx.fillText('PRESS SPACE / ENTER or TAP TO RESTART', cx, cy + 70)
}

function orbColor(type: OrbType): string {
  switch (type) {
    case 'normal':  return '#e8e8e8'
    case 'heavy':   return '#ffd700'
    case 'repair':  return '#44aaff'
    case 'phantom': return '#cc66ff'
  }
}

// ── Input ──────────────────────────────────────────────────────────────────────

function startGame(): void {
  score = 0
  level = 1
  scoreEl.textContent = '0'
  levelEl.textContent = '1'
  initLevel(1)
  state = 'PLAYING'
  audio.start()
}

function getCanvasPos(clientX: number, clientY: number): Vec2 {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

function findNodeAt(x: number, y: number): number {
  const HIT_RADIUS = 22
  let best = -1
  let bestDist = HIT_RADIUS
  for (let i = 0; i < nodes.length; i++) {
    const dx = nodes[i].x - x
    const dy = nodes[i].y - y
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

function onPointerDown(x: number, y: number): void {
  if (state === 'READY' || state === 'GAME_OVER') {
    startGame()
    return
  }
  if (state !== 'PLAYING') return

  const idx = findNodeAt(x, y)
  if (idx < 0) return

  dragNodeIdx = idx
  dragOffsetX = nodes[idx].x - x
  dragOffsetY = nodes[idx].y - y
  nodes[idx].dragging = true
  nodes[idx].glowTimer = 0.3
  audio.click()
}

function onPointerMove(x: number, y: number): void {
  if (state !== 'PLAYING' || dragNodeIdx < 0) return
  const n = nodes[dragNodeIdx]
  n.x = x + dragOffsetX
  n.y = y + dragOffsetY
  // Clamp
  n.x = Math.max(8, Math.min(canvas.width - 8, n.x))
  n.y = Math.max(8, Math.min(canvas.height - 8, n.y))
  n.glowTimer = 0.1
}

function onPointerUp(): void {
  if (dragNodeIdx < 0) return
  const n = nodes[dragNodeIdx]
  applyPlasticDeformation(dragNodeIdx, n.x, n.y)
  n.dragging = false
  dragNodeIdx = -1
}

// Mouse
canvas.addEventListener('mousedown', e => {
  e.preventDefault()
  const p = getCanvasPos(e.clientX, e.clientY)
  onPointerDown(p.x, p.y)
})
canvas.addEventListener('mousemove', e => {
  e.preventDefault()
  const p = getCanvasPos(e.clientX, e.clientY)
  onPointerMove(p.x, p.y)
})
canvas.addEventListener('mouseup', e => { e.preventDefault(); onPointerUp() })
canvas.addEventListener('mouseleave', () => onPointerUp())

// Touch
canvas.addEventListener('touchstart', e => {
  e.preventDefault()
  const t = e.changedTouches[0]
  const p = getCanvasPos(t.clientX, t.clientY)
  onPointerDown(p.x, p.y)
}, { passive: false })
canvas.addEventListener('touchmove', e => {
  e.preventDefault()
  const t = e.changedTouches[0]
  const p = getCanvasPos(t.clientX, t.clientY)
  onPointerMove(p.x, p.y)
}, { passive: false })
canvas.addEventListener('touchend', e => { e.preventDefault(); onPointerUp() }, { passive: false })

// Keyboard
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    if (state === 'READY' || state === 'GAME_OVER') startGame()
  }
})

// ── Bootstrap ──────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  try {
    const result = await initSDK()
    bestScore = result.highScore
    bestEl.textContent = String(bestScore)
  } catch {
    // SDK unavailable in dev — continue without it
  }

  lastTime = performance.now()
  requestAnimationFrame(draw)
}

bootstrap()
