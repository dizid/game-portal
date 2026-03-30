import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number }

type ObjectKind = 'gem' | 'rock' | 'bomb' | 'anchor'

interface GameObject {
  kind: ObjectKind
  pos: Vec2
  value: number     // gem score, rock weight, or bomb penalty
  // animation state for falling piece
  opacity: number
  vy: number        // fall velocity
  vx: number
  vr: number        // angular velocity
  angle: number
}

interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number      // 0..1, decreasing
  color: string
  size: number
}

interface ScorePopup {
  x: number; y: number
  text: string
  color: string
  life: number      // 0..1, decreasing
  scale: number
}

type Phase = 'READY' | 'PLAYING' | 'CUTTING' | 'ANIMATING' | 'ROUND_END' | 'GAME_OVER'

// ── Canvas setup ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const roundEl = document.getElementById('round-value') as HTMLSpanElement
const bestEl = document.getElementById('best-value') as HTMLSpanElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

function resizeCanvas(): void {
  const cont = canvas.parentElement!
  const sz = Math.min(cont.clientWidth, cont.clientHeight - 50)
  canvas.width = sz
  canvas.height = sz
  canvas.style.width = `${sz}px`
  canvas.style.height = `${sz}px`
}
resizeCanvas()
window.addEventListener('resize', resizeCanvas)
muteBtn.addEventListener('click', () => {
  muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊'
})

// ── Constants ──────────────────────────────────────────────────────────────────

const TOTAL_ROUNDS = 12
const START_LIVES = 3
const BASE_CAPACITY = 300
const CAPACITY_SHRINK = 15
const GEM_COLOR = '#00ff88'
const ROCK_COLOR = '#888888'
const BOMB_COLOR = '#ff4444'
const ANCHOR_COLOR = '#ffd700'
const BG_COLOR = '#0d1117'
const SHAPE_COLOR = 'rgba(30, 60, 100, 0.85)'
const SHAPE_STROKE = 'rgba(100, 180, 255, 0.6)'

// ── Game State ─────────────────────────────────────────────────────────────────

let phase: Phase = 'READY'
let round = 1
let score = 0
let bestScore = 0
let lives = START_LIVES
let cumulativeWeight = 0

// Current round state
let polygon: Vec2[] = []          // main shape vertices (canvas coords)
let objects: GameObject[] = []    // objects inside the shape
let cutsLeft = 2

// Cut interaction
let cutStart: Vec2 | null = null
let cutEnd: Vec2 | null = null    // null = not dragging; set while dragging
let cutPreview: Vec2 | null = null // current mouse/touch position during drag

// Falling piece animation
let fallingPoly: Vec2[] = []
let fallingObjects: GameObject[] = []
let fallProgress = 0              // 0..1

// Screen shake
let shakeDuration = 0
let shakeAmplitude = 0

// Particles and popups
let particles: Particle[] = []
let popups: ScorePopup[] = []

// Round end data
let roundScoreGained = 0
let roundWeightAdded = 0
let roundHadAnchor = false
let roundEndTimer = 0
const ROUND_END_DURATION = 2000 // ms

// Ghost optimal cut (shown at game over)
let worstRoundInfo: { poly: Vec2[]; cutLine: [Vec2, Vec2] } | null = null
let worstRoundScore = Infinity

// ── Geometry helpers ────────────────────────────────────────────────────────────

function polygonArea(poly: Vec2[]): number {
  // Shoelace formula
  let area = 0
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += poly[i].x * poly[j].y
    area -= poly[j].x * poly[i].y
  }
  return Math.abs(area) / 2
}

function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  // Ray casting algorithm
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function lineIntersect(
  p1: Vec2, p2: Vec2,
  p3: Vec2, p4: Vec2
): Vec2 | null {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-10) return null
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom
  return { x: p1.x + t * d1x, y: p1.y + t * d1y }
}

function extendLine(a: Vec2, b: Vec2, size: number): [Vec2, Vec2] {
  // Extend a line from a to b to cross the entire canvas
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return [a, b]
  const nx = dx / len, ny = dy / len
  return [
    { x: a.x - nx * size * 2, y: a.y - ny * size * 2 },
    { x: b.x + nx * size * 2, y: b.y + ny * size * 2 },
  ]
}

/**
 * Sutherland-Hodgman style polygon clipping.
 * Returns the portion of poly on the LEFT side of the directed line from la to lb.
 */
function clipPolygonByLine(poly: Vec2[], la: Vec2, lb: Vec2): Vec2[] {
  if (poly.length < 3) return []
  const result: Vec2[] = []

  function side(p: Vec2): number {
    return (lb.x - la.x) * (p.y - la.y) - (lb.y - la.y) * (p.x - la.x)
  }

  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]
    const next = poly[(i + 1) % poly.length]
    const sc = side(cur)
    const sn = side(next)

    if (sc >= 0) result.push(cur)
    if ((sc > 0 && sn < 0) || (sc < 0 && sn > 0)) {
      const pt = lineIntersect(cur, next, la, lb)
      if (pt) result.push(pt)
    }
  }

  return result
}

/**
 * Split polygon into two pieces along infinite line through la and lb.
 * Returns [leftPiece, rightPiece] or null if split doesn't actually cut.
 */
function splitPolygon(poly: Vec2[], la: Vec2, lb: Vec2): [Vec2[], Vec2[]] | null {
  const left = clipPolygonByLine(poly, la, lb)
  const right = clipPolygonByLine(poly, lb, la)

  if (left.length < 3 || right.length < 3) return null
  if (polygonArea(left) < 10 || polygonArea(right) < 10) return null

  return [left, right]
}

function polygonCentroid(poly: Vec2[]): Vec2 {
  const n = poly.length
  let cx = 0, cy = 0
  for (const p of poly) { cx += p.x; cy += p.y }
  return { x: cx / n, y: cy / n }
}

// ── Shape generation ───────────────────────────────────────────────────────────

function generateConvexShape(cx: number, cy: number, baseR: number): Vec2[] {
  const n = 7 + Math.floor(Math.random() * 4)
  const angles: number[] = []
  for (let i = 0; i < n; i++) {
    angles.push(Math.random() * Math.PI * 2)
  }
  angles.sort((a, b) => a - b)

  return angles.map(a => {
    const r = baseR * (0.75 + Math.random() * 0.25)
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
  })
}

function generateConcaveShape(cx: number, cy: number, baseR: number): Vec2[] {
  const n = 9 + Math.floor(Math.random() * 4)
  const angles: number[] = []
  for (let i = 0; i < n; i++) {
    angles.push((i / n) * Math.PI * 2)
  }

  return angles.map((a, i) => {
    // Every other vertex pushed inward for concavity
    const concave = i % 2 === 0
    const r = concave
      ? baseR * (0.45 + Math.random() * 0.15)
      : baseR * (0.8 + Math.random() * 0.2)
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
  })
}

function generateComplexShape(cx: number, cy: number, baseR: number): Vec2[] {
  // Star-like with pinch points
  const arms = 5 + Math.floor(Math.random() * 3)
  const pts: Vec2[] = []
  for (let i = 0; i < arms * 2; i++) {
    const a = (i / (arms * 2)) * Math.PI * 2
    const r = i % 2 === 0
      ? baseR * (0.7 + Math.random() * 0.3)
      : baseR * (0.25 + Math.random() * 0.2)
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  return pts
}

function buildShape(roundNum: number): Vec2[] {
  const W = canvas.width
  const H = canvas.height
  const cx = W / 2 + (Math.random() - 0.5) * W * 0.08
  const cy = H / 2 + (Math.random() - 0.5) * H * 0.08
  const baseR = Math.min(W, H) * 0.32

  if (roundNum <= 3) return generateConvexShape(cx, cy, baseR)
  if (roundNum <= 6) return generateConcaveShape(cx, cy, baseR * 0.92)
  if (roundNum <= 9) return generateConcaveShape(cx, cy, baseR * 0.85)
  return generateComplexShape(cx, cy, baseR * 0.82)
}

// ── Object placement ───────────────────────────────────────────────────────────

function randomPointInPolygon(poly: Vec2[], margin: number): Vec2 | null {
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y)
  const minX = Math.min(...xs) + margin, maxX = Math.max(...xs) - margin
  const minY = Math.min(...ys) + margin, maxY = Math.max(...ys) - margin

  for (let attempt = 0; attempt < 80; attempt++) {
    const pt = {
      x: minX + Math.random() * (maxX - minX),
      y: minY + Math.random() * (maxY - minY),
    }
    if (pointInPolygon(pt, poly)) return pt
  }
  return null
}

function placeObjects(poly: Vec2[], roundNum: number): GameObject[] {
  const objs: GameObject[] = []
  const margin = 18

  // Count targets based on difficulty
  const gemCount = roundNum <= 3 ? 3 + Math.floor(Math.random() * 2)
    : roundNum <= 6 ? 4 + Math.floor(Math.random() * 2)
    : 3 + Math.floor(Math.random() * 3)

  const rockCount = roundNum <= 3 ? 2 + Math.floor(Math.random() * 2)
    : roundNum <= 6 ? 3 + Math.floor(Math.random() * 3)
    : 4 + Math.floor(Math.random() * 3)

  const bombCount = roundNum <= 3 ? 1
    : roundNum <= 6 ? 1 + Math.floor(Math.random() * 2)
    : 2 + Math.floor(Math.random() * 2)

  const hasAnchor = Math.random() < 0.30

  const place = (kind: ObjectKind, value: number): void => {
    const pt = randomPointInPolygon(poly, margin)
    if (!pt) return
    objs.push({
      kind,
      pos: pt,
      value,
      opacity: 1,
      vy: 0,
      vx: 0,
      vr: 0,
      angle: 0,
    })
  }

  for (let i = 0; i < gemCount; i++) {
    place('gem', 10 + Math.floor(Math.random() * 41))
  }
  for (let i = 0; i < rockCount; i++) {
    place('rock', 5 + Math.floor(Math.random() * 26))
  }
  for (let i = 0; i < bombCount; i++) {
    place('bomb', 100)
  }
  if (hasAnchor) {
    place('anchor', 0)
  }

  return objs
}

// ── Round initialization ───────────────────────────────────────────────────────

function startRound(r: number): void {
  round = r
  roundEl.textContent = String(round)

  polygon = buildShape(round)
  objects = placeObjects(polygon, round)

  cutsLeft = round <= 3 ? 2
    : round <= 6 ? 2
    : round <= 9 ? 1 + (Math.random() < 0.4 ? 1 : 0)
    : 1

  cutStart = null
  cutEnd = null
  cutPreview = null
  fallingPoly = []
  fallingObjects = []
  fallProgress = 0
  roundScoreGained = 0
  roundWeightAdded = 0
  roundHadAnchor = false
  particles = []
  popups = []

  phase = 'PLAYING'
}

// ── Cut application ────────────────────────────────────────────────────────────

function applyCut(la: Vec2, lb: Vec2): void {
  const [extA, extB] = extendLine(la, lb, Math.max(canvas.width, canvas.height))
  const split = splitPolygon(polygon, extA, extB)
  if (!split) return

  const [pieceA, pieceB] = split
  const areaA = polygonArea(pieceA)
  const areaB = polygonArea(pieceB)

  // Smaller piece falls away
  const keepPoly = areaA >= areaB ? pieceA : pieceB
  const dropPoly = areaA >= areaB ? pieceB : pieceA

  // Assign objects to pieces
  const keepObjs: GameObject[] = []
  const dropObjs: GameObject[] = []

  for (const obj of objects) {
    if (pointInPolygon(obj.pos, dropPoly)) {
      // Check near-miss (within 8px of cut line)
      if (obj.kind === 'gem') {
        const dist = pointToLineDistance(obj.pos, extA, extB)
        if (dist < 8) {
          spawnPopup(obj.pos.x, obj.pos.y, 'CLOSE!', '#ffff00')
        }
      }
      dropObjs.push({ ...obj })
    } else {
      keepObjs.push(obj)
    }
  }

  // Particles near cut line
  spawnCutParticles(la, lb)

  // Shake screen
  shakeDuration = 300
  shakeAmplitude = 5

  audio.score()

  // Start falling animation
  fallingPoly = dropPoly.map(p => ({ ...p }))
  fallingObjects = dropObjs.map(obj => ({
    ...obj,
    vy: 1 + Math.random() * 2,
    vx: (Math.random() - 0.5) * 3,
    vr: (Math.random() - 0.5) * 0.15,
  }))
  fallProgress = 0

  polygon = keepPoly
  objects = keepObjs

  cutsLeft--
  phase = 'ANIMATING'
}

function pointToLineDistance(pt: Vec2, la: Vec2, lb: Vec2): number {
  const dx = lb.x - la.x
  const dy = lb.y - la.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1) return Math.hypot(pt.x - la.x, pt.y - la.y)
  const t = Math.max(0, Math.min(1, ((pt.x - la.x) * dx + (pt.y - la.y) * dy) / len2))
  return Math.hypot(pt.x - (la.x + t * dx), pt.y - (la.y + t * dy))
}

// ── Round scoring ──────────────────────────────────────────────────────────────

function scoreRound(): void {
  let roundScore = 0
  let roundWeight = 0
  let hasAnchor = false

  for (const obj of objects) {
    if (obj.kind === 'anchor') { hasAnchor = true; break }
  }

  for (const obj of objects) {
    if (obj.kind === 'gem') {
      const v = hasAnchor ? obj.value * 2 : obj.value
      roundScore += v
      spawnPopup(obj.pos.x, obj.pos.y, `+${v}`, GEM_COLOR)
    } else if (obj.kind === 'rock') {
      roundWeight += obj.value
    } else if (obj.kind === 'bomb') {
      roundScore -= 100
      spawnPopup(obj.pos.x, obj.pos.y, '-100', BOMB_COLOR)
      audio.death()
    }
  }

  if (hasAnchor && roundScore > 0) {
    spawnPopup(canvas.width / 2, canvas.height * 0.3, 'ANCHOR x2!', ANCHOR_COLOR)
    audio.powerup()
  }

  score += roundScore
  if (score < 0) score = 0
  cumulativeWeight += roundWeight

  roundScoreGained = roundScore
  roundWeightAdded = roundWeight
  roundHadAnchor = hasAnchor

  const capacity = BASE_CAPACITY - (round - 1) * CAPACITY_SHRINK
  if (cumulativeWeight > capacity) {
    lives--
    spawnPopup(canvas.width / 2, canvas.height * 0.4, 'TOO HEAVY!', BOMB_COLOR)
    audio.death()
    if (lives <= 0) {
      endGame()
      return
    }
  }

  // Track worst round for ghost cut display
  if (roundScore < worstRoundScore) {
    worstRoundScore = roundScore
    // Simple heuristic: suggest cutting along the x-axis through center
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    worstRoundInfo = {
      poly: polygon.map(p => ({ ...p })),
      cutLine: [{ x: cx - 200, y: cy }, { x: cx + 200, y: cy }],
    }
  }

  scoreEl.textContent = String(score)
  reportScore(score)

  phase = 'ROUND_END'
  roundEndTimer = ROUND_END_DURATION
}

function endGame(): void {
  phase = 'GAME_OVER'
  if (score > bestScore) {
    bestScore = score
    bestEl.textContent = String(bestScore)
    saveHighScore(bestScore)
  }
  reportGameOver(score)
  audio.death()
}

// ── Particles ──────────────────────────────────────────────────────────────────

function spawnCutParticles(a: Vec2, b: Vec2): void {
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    for (let k = 0; k < 3; k++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1,
        color: `hsl(${180 + Math.random() * 60}, 100%, ${60 + Math.random() * 30}%)`,
        size: 1.5 + Math.random() * 2,
      })
    }
  }
}

function spawnPopup(x: number, y: number, text: string, color: string): void {
  popups.push({ x, y, text, color, life: 1, scale: 1.5 })
}

// ── Input handling ─────────────────────────────────────────────────────────────

function canvasPoint(clientX: number, clientY: number): Vec2 {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  }
}

canvas.addEventListener('mousedown', (e: MouseEvent) => {
  if (phase !== 'PLAYING') return
  cutStart = canvasPoint(e.clientX, e.clientY)
  cutPreview = { ...cutStart }
})

canvas.addEventListener('mousemove', (e: MouseEvent) => {
  if (phase !== 'PLAYING' || !cutStart) return
  cutPreview = canvasPoint(e.clientX, e.clientY)
})

canvas.addEventListener('mouseup', (e: MouseEvent) => {
  if (phase !== 'PLAYING' || !cutStart) return
  const end = canvasPoint(e.clientX, e.clientY)
  const dx = end.x - cutStart.x
  const dy = end.y - cutStart.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > 20) {
    applyCut(cutStart, end)
  }
  cutStart = null
  cutPreview = null
})

canvas.addEventListener('touchstart', (e: TouchEvent) => {
  e.preventDefault()
  if (phase !== 'PLAYING') return
  const t = e.touches[0]
  cutStart = canvasPoint(t.clientX, t.clientY)
  cutPreview = { ...cutStart }
}, { passive: false })

canvas.addEventListener('touchmove', (e: TouchEvent) => {
  e.preventDefault()
  if (phase !== 'PLAYING' || !cutStart) return
  const t = e.touches[0]
  cutPreview = canvasPoint(t.clientX, t.clientY)
}, { passive: false })

canvas.addEventListener('touchend', (e: TouchEvent) => {
  e.preventDefault()
  if (phase !== 'PLAYING' || !cutStart) return
  const t = e.changedTouches[0]
  const end = canvasPoint(t.clientX, t.clientY)
  const dx = end.x - cutStart.x
  const dy = end.y - cutStart.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > 20) {
    applyCut(cutStart, end)
  }
  cutStart = null
  cutPreview = null
}, { passive: false })

canvas.addEventListener('click', () => {
  if (phase === 'READY') {
    startRound(1)
    audio.start()
    return
  }
  if (phase === 'ROUND_END') {
    advanceFromRoundEnd()
    return
  }
  if (phase === 'GAME_OVER') {
    resetGame()
    return
  }
})

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    if (phase === 'READY') {
      startRound(1)
      audio.start()
    } else if (phase === 'ROUND_END') {
      advanceFromRoundEnd()
    } else if (phase === 'GAME_OVER') {
      resetGame()
    } else if (phase === 'PLAYING' && cutsLeft === 0) {
      // Player chooses to end round with no cuts left
      scoreRound()
    }
  }
})

function advanceFromRoundEnd(): void {
  if (round >= TOTAL_ROUNDS) {
    endGame()
  } else {
    startRound(round + 1)
    audio.levelUp()
  }
}

function resetGame(): void {
  score = 0
  lives = START_LIVES
  cumulativeWeight = 0
  worstRoundInfo = null
  worstRoundScore = Infinity
  popups = []
  particles = []
  scoreEl.textContent = '0'
  roundEl.textContent = '1'
  phase = 'READY'
}

// ── Update loop ────────────────────────────────────────────────────────────────

let lastTime = 0

function update(dt: number): void {
  // Update particles
  for (const p of particles) {
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.12 // gravity
    p.life -= dt / 600
  }
  particles = particles.filter(p => p.life > 0)

  // Update popups
  for (const p of popups) {
    p.y -= dt * 0.04
    p.life -= dt / 1200
    p.scale = Math.max(1, p.scale - dt * 0.003)
  }
  popups = popups.filter(p => p.life > 0)

  // Screen shake
  if (shakeDuration > 0) {
    shakeDuration -= dt
    if (shakeDuration <= 0) shakeAmplitude = 0
  }

  if (phase === 'ANIMATING') {
    fallProgress = Math.min(1, fallProgress + dt / 800)

    // Animate falling objects
    for (const obj of fallingObjects) {
      obj.vy += dt * 0.012
      obj.pos.x += obj.vx
      obj.pos.y += obj.vy
      obj.angle += obj.vr * dt * 0.05
      obj.opacity = Math.max(0, 1 - fallProgress * 1.2)
    }

    if (fallProgress >= 1) {
      fallingPoly = []
      fallingObjects = []

      // After animation — if cuts remain and round is not done, back to PLAYING
      // If no cuts remain, auto-score
      if (cutsLeft <= 0) {
        scoreRound()
      } else {
        phase = 'PLAYING'
      }
    }
  }

  if (phase === 'ROUND_END') {
    roundEndTimer -= dt
    // Don't auto-advance — wait for user input
  }
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function drawPolygon(poly: Vec2[], fillStyle: string, strokeStyle: string, alpha: number): void {
  if (poly.length < 3) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.moveTo(poly[0].x, poly[0].y)
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y)
  ctx.closePath()
  ctx.fillStyle = fillStyle
  ctx.fill()
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

function drawObject(obj: GameObject): void {
  const { pos, kind, opacity } = obj
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.translate(pos.x, pos.y)
  if (obj.angle !== 0) ctx.rotate(obj.angle)

  const r = 9

  if (kind === 'gem') {
    // Green circle with glow
    ctx.shadowColor = GEM_COLOR
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fillStyle = GEM_COLOR
    ctx.fill()
    ctx.strokeStyle = '#00ffaa'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.beginPath()
    ctx.arc(-r * 0.3, -r * 0.3, r * 0.3, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 'rock') {
    // Gray square
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = ROCK_COLOR
    ctx.fillRect(-r, -r, r * 2, r * 2)
    ctx.strokeStyle = '#aaaaaa'
    ctx.lineWidth = 1
    ctx.strokeRect(-r, -r, r * 2, r * 2)
  } else if (kind === 'bomb') {
    // Red triangle
    ctx.shadowColor = BOMB_COLOR
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(0, -r * 1.1)
    ctx.lineTo(r * 1.0, r * 0.8)
    ctx.lineTo(-r * 1.0, r * 0.8)
    ctx.closePath()
    ctx.fillStyle = BOMB_COLOR
    ctx.fill()
    ctx.strokeStyle = '#ff8888'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // Warning mark
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('!', 0, 2)
  } else if (kind === 'anchor') {
    // Gold diamond
    ctx.shadowColor = ANCHOR_COLOR
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.moveTo(0, -r * 1.2)
    ctx.lineTo(r * 1.1, 0)
    ctx.lineTo(0, r * 1.2)
    ctx.lineTo(-r * 1.1, 0)
    ctx.closePath()
    ctx.fillStyle = ANCHOR_COLOR
    ctx.fill()
    ctx.strokeStyle = '#ffe566'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  ctx.restore()
}

function drawCutPreview(): void {
  if (!cutStart || !cutPreview) return
  const [extA, extB] = extendLine(cutStart, cutPreview, Math.max(canvas.width, canvas.height))

  ctx.save()
  ctx.setLineDash([8, 6])
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(extA.x, extA.y)
  ctx.lineTo(extB.x, extB.y)
  ctx.stroke()

  // Laser glow
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(100, 220, 255, 0.7)'
  ctx.lineWidth = 2
  ctx.shadowColor = 'rgba(100, 220, 255, 0.9)'
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.moveTo(cutStart.x, cutStart.y)
  ctx.lineTo(cutPreview.x, cutPreview.y)
  ctx.stroke()
  ctx.restore()
}

function drawParticles(): void {
  for (const p of particles) {
    ctx.save()
    ctx.globalAlpha = p.life * 0.9
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function drawPopups(): void {
  for (const p of popups) {
    ctx.save()
    ctx.globalAlpha = p.life
    ctx.translate(p.x, p.y)
    ctx.scale(p.scale, p.scale)
    ctx.fillStyle = p.color
    ctx.font = 'bold 16px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = p.color
    ctx.shadowBlur = 8
    ctx.fillText(p.text, 0, 0)
    ctx.restore()
  }
}

function drawHUDPanel(): void {
  const W = canvas.width
  const capacity = BASE_CAPACITY - (round - 1) * CAPACITY_SHRINK
  const weightRatio = Math.min(1, cumulativeWeight / capacity)

  // Weight bar background
  const barX = 10, barY = W - 38, barW = W - 20, barH = 14
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath()
  ctx.roundRect(barX, barY, barW, barH, 4)
  ctx.fill()

  // Weight fill with gradient
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0)
  grad.addColorStop(0, '#00cc66')
  grad.addColorStop(0.5, '#cccc00')
  grad.addColorStop(1, '#cc2200')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(barX, barY, barW * weightRatio, barH, 4)
  ctx.fill()

  // Weight bar label
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = '10px "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`WEIGHT ${cumulativeWeight} / ${capacity}`, W / 2, barY + barH / 2)

  // Lives
  const lx = W - 14
  const ly = barY - 22
  for (let i = 0; i < 3; i++) {
    ctx.save()
    ctx.globalAlpha = i < lives ? 1 : 0.2
    ctx.fillStyle = '#ff4466'
    ctx.beginPath()
    const hx = lx - i * 18, hy = ly
    const hs = 7
    ctx.moveTo(hx, hy + hs * 0.4)
    ctx.bezierCurveTo(hx, hy, hx - hs, hy, hx - hs, hy + hs * 0.4)
    ctx.bezierCurveTo(hx - hs, hy + hs * 0.8, hx, hy + hs * 1.2, hx, hy + hs * 1.4)
    ctx.bezierCurveTo(hx, hy + hs * 1.2, hx + hs, hy + hs * 0.8, hx + hs, hy + hs * 0.4)
    ctx.bezierCurveTo(hx + hs, hy, hx, hy, hx, hy + hs * 0.4)
    ctx.fill()
    ctx.restore()
  }

  // Cuts remaining
  if (phase === 'PLAYING') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '11px "Courier New", monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`CUTS: ${cutsLeft}`, 14, barY - 20)
  }
}

function drawOverlay(title: string, lines: string[], btnLabel: string): void {
  const W = canvas.width
  const H = canvas.height

  ctx.fillStyle = 'rgba(13, 17, 23, 0.88)'
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = '#00ff88'
  ctx.font = `bold ${Math.min(44, W * 0.09)}px "Courier New", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = '#00ff88'
  ctx.shadowBlur = 20
  ctx.fillText(title, W / 2, H * 0.22)
  ctx.shadowBlur = 0

  ctx.fillStyle = 'rgba(200, 230, 255, 0.85)'
  ctx.font = `${Math.min(15, W * 0.032)}px "Courier New", monospace`
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, H * 0.32 + i * (H * 0.048))
  })

  // Button
  const btnW = Math.min(200, W * 0.45)
  const btnH = 42
  const btnX = W / 2 - btnW / 2
  const btnY = H * 0.78
  ctx.fillStyle = 'rgba(0, 255, 136, 0.15)'
  ctx.strokeStyle = '#00ff88'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(btnX, btnY, btnW, btnH, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#00ff88'
  ctx.font = `bold ${Math.min(18, W * 0.038)}px "Courier New", monospace`
  ctx.fillText(btnLabel, W / 2, btnY + 27)
}

function drawRoundEndPanel(): void {
  const W = canvas.width
  const H = canvas.height

  // Semi-transparent bottom panel
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
  ctx.beginPath()
  ctx.roundRect(W * 0.1, H * 0.52, W * 0.8, H * 0.34, 12)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.4)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.textAlign = 'center'

  const titleColor = roundScoreGained >= 0 ? '#00ff88' : '#ff4444'
  ctx.fillStyle = titleColor
  ctx.font = `bold ${Math.min(18, W * 0.038)}px "Courier New", monospace`
  ctx.fillText(`ROUND ${round} COMPLETE`, W / 2, H * 0.58)

  ctx.fillStyle = 'rgba(200, 230, 255, 0.8)'
  ctx.font = `${Math.min(13, W * 0.028)}px "Courier New", monospace`

  const lines: string[] = [
    `Score this round: ${roundScoreGained >= 0 ? '+' : ''}${roundScoreGained}`,
    `Weight added: +${roundWeightAdded}`,
  ]
  if (roundHadAnchor) lines.push('Anchor bonus applied!')
  if (round < TOTAL_ROUNDS) {
    lines.push('')
    lines.push('Tap / Space to continue')
  } else {
    lines.push('')
    lines.push('Tap / Space to see results')
  }

  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, H * 0.63 + i * H * 0.043)
  })
}

function drawGhostCut(): void {
  if (!worstRoundInfo) return
  const [a, b] = worstRoundInfo.cutLine

  ctx.save()
  ctx.setLineDash([10, 8])
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.55)'
  ctx.lineWidth = 2
  ctx.shadowColor = 'rgba(255, 200, 0, 0.5)'
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.restore()
}

function draw(now: number): void {
  const W = canvas.width
  const H = canvas.height

  // Screen shake offset
  let ox = 0, oy = 0
  if (shakeAmplitude > 0 && shakeDuration > 0) {
    const t = shakeDuration / 300
    ox = (Math.random() - 0.5) * shakeAmplitude * t
    oy = (Math.random() - 0.5) * shakeAmplitude * t
  }

  ctx.clearRect(0, 0, W, H)
  ctx.save()
  ctx.translate(ox, oy)

  // Background
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(-10, -10, W + 20, H + 20)

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'
  ctx.lineWidth = 1
  const grid = 40
  for (let x = 0; x < W; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  }
  for (let y = 0; y < H; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  if (phase === 'READY') {
    drawOverlay('SEVERING', [
      'Draw cut lines across the shape.',
      'Smaller piece falls away.',
      '',
      'Keep GEMS, shed ROCKS.',
      'Cut off BOMBS before scoring!',
      'ANCHORS double gem value.',
      '',
      '12 rounds — 3 lives',
      'Weight limit shrinks each round.',
    ], 'PLAY')
    ctx.restore()
    return
  }

  if (phase === 'GAME_OVER') {
    // Show ghost cut hint
    if (worstRoundInfo) {
      drawPolygon(worstRoundInfo.poly, SHAPE_COLOR, 'rgba(255,200,0,0.4)', 0.25)
      drawGhostCut()
    }

    const overCapacity = Math.max(0, cumulativeWeight - (BASE_CAPACITY - (TOTAL_ROUNDS - 1) * CAPACITY_SHRINK))
    drawOverlay('GAME OVER', [
      `Final Score: ${score}`,
      `Best: ${bestScore}`,
      '',
      overCapacity > 0 ? `Over weight limit by ${overCapacity}` : 'Ran out of lives',
      '',
      'Gold line = optimal cut hint',
    ], 'PLAY AGAIN')
    ctx.restore()
    return
  }

  // Draw main polygon
  if (phase !== 'ROUND_END' || polygon.length > 0) {
    drawPolygon(polygon, SHAPE_COLOR, SHAPE_STROKE, 1)
  }

  // Draw falling piece (with ghost outline)
  if (fallingPoly.length > 0) {
    // Ghost outline of original position
    const ghostAlpha = Math.max(0, 0.3 - fallProgress * 0.35)
    const firstObj = fallingObjects[0]
    const ghostOffX = firstObj ? firstObj.vx : 0
    const ghostOffY = firstObj ? firstObj.vy : 0
    drawPolygon(fallingPoly.map(p => ({
      x: p.x - ghostOffX,
      y: p.y - ghostOffY,
    })), 'transparent', 'rgba(150,200,255,0.4)', ghostAlpha)

    // Falling piece itself
    const alpha = Math.max(0, 1 - fallProgress * 1.5)
    drawPolygon(fallingPoly, 'rgba(60, 100, 160, 0.5)', 'rgba(100, 180, 255, 0.3)', alpha)

    for (const obj of fallingObjects) {
      drawObject(obj)
    }
  }

  // Draw kept objects
  for (const obj of objects) {
    drawObject(obj)
  }

  // Cut preview
  if (phase === 'PLAYING') {
    drawCutPreview()
  }

  // Particles
  drawParticles()
  drawPopups()

  // HUD panel (weight bar, lives, cuts)
  if (phase === 'PLAYING' || phase === 'ANIMATING' || phase === 'ROUND_END') {
    drawHUDPanel()
  }

  // Round end overlay panel
  if (phase === 'ROUND_END') {
    drawRoundEndPanel()
  }

  // Laser timestamp flicker on cut line (cosmetic)
  if (phase === 'ANIMATING' && cutEnd && cutStart) {
    const flicker = 0.5 + Math.sin(now * 0.05) * 0.3
    ctx.save()
    ctx.strokeStyle = `rgba(100, 220, 255, ${flicker * 0.5})`
    ctx.lineWidth = 3
    ctx.shadowColor = 'rgba(100, 220, 255, 0.8)'
    ctx.shadowBlur = 16
    ctx.beginPath()
    ctx.moveTo(cutStart.x, cutStart.y)
    ctx.lineTo(cutEnd.x, cutEnd.y)
    ctx.stroke()
    ctx.restore()
  }

  ctx.restore()
}

// ── Main loop ──────────────────────────────────────────────────────────────────

function loop(now: number): void {
  const dt = Math.min(now - lastTime, 100) // cap at 100ms to avoid spiral of death
  lastTime = now

  update(dt)
  draw(now)

  requestAnimationFrame(loop)
}

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore } = await initSDK()
    bestScore = highScore
    bestEl.textContent = String(bestScore)
  } catch { /* standalone mode */ }

  requestAnimationFrame(loop)
}

void boot()
