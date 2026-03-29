// Fruit Ninja — swipe to slice fruits, avoid bombs

import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────

type FruitKind = 'apple' | 'orange' | 'banana' | 'melon' | 'grape'
type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

interface FruitDef {
  kind: FruitKind | 'bomb'
  color: string
  leafColor: string
  radius: number
}

interface FlyingObject {
  id: number
  def: FruitDef
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotSpeed: number
  sliced: boolean
  missed: boolean     // fell below canvas without being sliced
  // sliced halves animation
  halfL?: Half
  halfR?: Half
}

interface Half {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotSpeed: number
  side: 'L' | 'R'
}

interface JuiceParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
  size: number
}

interface SlashPoint {
  x: number
  y: number
  age: number  // frames
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FRUIT_DEFS: FruitDef[] = [
  { kind: 'apple',  color: '#ef4444', leafColor: '#22c55e', radius: 30 },
  { kind: 'orange', color: '#f97316', leafColor: '#16a34a', radius: 28 },
  { kind: 'banana', color: '#eab308', leafColor: '#4ade80', radius: 24 },
  { kind: 'melon',  color: '#22c55e', leafColor: '#15803d', radius: 34 },
  { kind: 'grape',  color: '#a855f7', leafColor: '#7c3aed', radius: 20 },
]

const BOMB_DEF: FruitDef = { kind: 'bomb', color: '#1a1a1a', leafColor: '#fff', radius: 24 }

const GAME_DURATION = 60    // seconds
const MAX_MISSES = 3
const SPAWN_INTERVAL_MS = 1000   // starts at 1s, decreases
const GRAVITY = 0.25
const SLASH_FADE_FRAMES = 18

// ── Game state ─────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const timerEl = document.getElementById('timer-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

let canvasW = 400
let canvasH = 600
let gameState: GameState = 'READY'
let score = 0
let highScore = 0
let misses = 0
let timeLeft = GAME_DURATION
let timerHandle = 0
let spawnHandle = 0
let spawnInterval = SPAWN_INTERVAL_MS
let nextId = 0
let comboCount = 0
let comboTimer = 0

let objects: FlyingObject[] = []
let juiceParticles: JuiceParticle[] = []
let slashTrail: SlashPoint[] = []

// Pointer tracking for swipe detection
let pointerDown = false
let lastPointerX = 0
let lastPointerY = 0

// ── Canvas sizing ──────────────────────────────────────────────────────────────

function resizeCanvas(): void {
  const wrap = document.getElementById('canvas-wrap')!
  const availW = wrap.clientWidth
  const availH = wrap.clientHeight
  canvasW = Math.min(availW, Math.floor(availH * 2 / 3), 440)
  canvasH = Math.floor(canvasW * 1.5)
  canvas.width = canvasW
  canvas.height = canvasH
  canvas.style.width = `${canvasW}px`
  canvas.style.height = `${canvasH}px`
}

// ── Spawning ───────────────────────────────────────────────────────────────────

function spawnObject(): void {
  if (gameState !== 'PLAYING') return
  // ~20% chance of bomb, increases slightly over time
  const elapsed = GAME_DURATION - timeLeft
  const bombChance = 0.12 + elapsed * 0.003
  const isBomb = Math.random() < bombChance
  const def = isBomb ? BOMB_DEF : FRUIT_DEFS[Math.floor(Math.random() * FRUIT_DEFS.length)]

  // Spawn from bottom, arc upward
  const x = def.radius + Math.random() * (canvasW - def.radius * 2)
  const vy = -(canvasH * 0.022 + Math.random() * canvasH * 0.010) // upward
  const vx = (Math.random() - 0.5) * 4

  objects.push({
    id: nextId++,
    def,
    x,
    y: canvasH + def.radius,
    vx,
    vy,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.12,
    sliced: false,
    missed: false,
  })
}

function startSpawner(): void {
  clearInterval(spawnHandle)
  spawnHandle = window.setInterval(() => {
    spawnObject()
    // Spawn up to 2 at a time for difficulty ramp
    const elapsed = GAME_DURATION - timeLeft
    if (elapsed > 20 && Math.random() < 0.4) spawnObject()
  }, spawnInterval)
}

// ── Slice detection ────────────────────────────────────────────────────────────

function checkSliceAlongLine(x1: number, y1: number, x2: number, y2: number): void {
  const slicedThisSwipe: FlyingObject[] = []

  for (const obj of objects) {
    if (obj.sliced || obj.missed) continue
    // Distance from circle center to line segment
    const dist = pointToSegmentDist(obj.x, obj.y, x1, y1, x2, y2)
    if (dist < obj.def.radius * 1.1) {
      slicedThisSwipe.push(obj)
    }
  }

  for (const obj of slicedThisSwipe) {
    sliceObject(obj, x1, y1, x2, y2)
  }

  // Combo scoring: 3+ in one swipe
  if (slicedThisSwipe.filter(o => o.def.kind !== 'bomb').length >= 3) {
    score += 5
    audio.combo()
    reportScore(score)
    updateHUD()
  }
}

function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function sliceObject(obj: FlyingObject, _x1: number, _y1: number, _x2: number, _y2: number): void {
  obj.sliced = true

  if (obj.def.kind === 'bomb') {
    // Bomb hit = game over
    audio.bomb()
    spawnJuice(obj.x, obj.y, '#333', 12)
    triggerGameOver()
    return
  }

  // Slice animation — two halves fly apart
  const speed = 2
  obj.halfL = {
    x: obj.x - obj.def.radius * 0.3,
    y: obj.y,
    vx: obj.vx - speed,
    vy: obj.vy - 1,
    rotation: obj.rotation,
    rotSpeed: -0.15,
    side: 'L',
  }
  obj.halfR = {
    x: obj.x + obj.def.radius * 0.3,
    y: obj.y,
    vx: obj.vx + speed,
    vy: obj.vy - 1,
    rotation: obj.rotation,
    rotSpeed: 0.15,
    side: 'R',
  }

  // Juice burst
  spawnJuice(obj.x, obj.y, obj.def.color, 10)
  audio.slice()

  score += 1
  comboCount++
  comboTimer = 30

  reportScore(score)
  if (score > highScore) { highScore = score; saveHighScore(highScore) }
  updateHUD()
}

// ── Game flow ──────────────────────────────────────────────────────────────────

function startGame(): void {
  gameState = 'PLAYING'
  score = 0
  misses = 0
  timeLeft = GAME_DURATION
  objects = []
  juiceParticles = []
  slashTrail = []
  comboCount = 0
  comboTimer = 0
  spawnInterval = SPAWN_INTERVAL_MS

  clearInterval(timerHandle)
  timerHandle = window.setInterval(() => {
    timeLeft--
    if (timeLeft <= 0) {
      triggerTimeUp()
    }
    // Difficulty ramp — reduce spawn interval
    const elapsed = GAME_DURATION - timeLeft
    spawnInterval = Math.max(400, SPAWN_INTERVAL_MS - elapsed * 10)
    audio.tick()
    updateHUD()
  }, 1000)

  startSpawner()
  audio.start()
  updateLives()
  updateHUD()
}

function triggerTimeUp(): void {
  gameState = 'GAME_OVER'
  clearInterval(timerHandle)
  clearInterval(spawnHandle)
  if (score > highScore) { highScore = score; saveHighScore(highScore) }
  reportGameOver(score)
  audio.death()
  updateHUD()
}

function triggerGameOver(): void {
  gameState = 'GAME_OVER'
  clearInterval(timerHandle)
  clearInterval(spawnHandle)
  if (score > highScore) { highScore = score; saveHighScore(highScore) }
  reportGameOver(score)
  updateHUD()
}

function recordMiss(): void {
  misses++
  updateLives()
  audio.miss()
  if (misses >= MAX_MISSES) triggerGameOver()
}

function updateLives(): void {
  for (let i = 0; i < MAX_MISSES; i++) {
    const dot = document.getElementById(`life-${i}`)
    if (dot) dot.classList.toggle('gone', i >= MAX_MISSES - misses)
  }
}

// ── Physics ────────────────────────────────────────────────────────────────────

function updateObjects(): void {
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i]

    if (obj.sliced && obj.halfL && obj.halfR) {
      // Update halves
      for (const h of [obj.halfL, obj.halfR]) {
        h.x += h.vx; h.y += h.vy; h.vy += GRAVITY; h.rotation += h.rotSpeed
      }
      // Remove when both halves off screen
      if (obj.halfL.y > canvasH + 60 && obj.halfR.y > canvasH + 60) {
        objects.splice(i, 1)
      }
    } else if (!obj.sliced) {
      obj.x += obj.vx
      obj.y += obj.vy
      obj.vy += GRAVITY
      obj.rotation += obj.rotSpeed

      // Off bottom — missed
      if (obj.y > canvasH + obj.def.radius + 10) {
        if (!obj.missed && obj.def.kind !== 'bomb') {
          obj.missed = true
          recordMiss()
        }
        objects.splice(i, 1)
      }
    }
  }
}

// ── Juice particles ────────────────────────────────────────────────────────────

function spawnJuice(x: number, y: number, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
    const speed = 2 + Math.random() * 4
    juiceParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      color,
      size: 3 + Math.random() * 5,
    })
  }
}

function updateJuice(): void {
  for (let i = juiceParticles.length - 1; i >= 0; i--) {
    const p = juiceParticles[i]
    p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.035
    if (p.life <= 0) juiceParticles.splice(i, 1)
  }
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function draw(): void {
  ctx.clearRect(0, 0, canvasW, canvasH)

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, canvasH)
  bg.addColorStop(0, '#0d0d1e')
  bg.addColorStop(1, '#1a1a2e')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Objects
  for (const obj of objects) {
    if (obj.sliced && obj.halfL && obj.halfR) {
      drawHalf(obj.halfL, obj.def)
      drawHalf(obj.halfR, obj.def)
    } else if (!obj.sliced) {
      drawFruit(obj)
    }
  }

  // Juice
  for (const p of juiceParticles) {
    ctx.globalAlpha = p.life * 0.85
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Slash trail
  drawSlashTrail()

  // Combo display
  if (comboTimer > 0 && comboCount >= 3) {
    const alpha = Math.min(1, comboTimer / 10)
    ctx.globalAlpha = alpha
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fbbf24'
    ctx.font = `bold ${Math.floor(canvasW * 0.12)}px 'Courier New', monospace`
    ctx.fillText(`COMBO x${comboCount}`, canvasW / 2, canvasH * 0.35)
    ctx.globalAlpha = 1
  }

  if (gameState === 'READY') drawReadyOverlay()
  if (gameState === 'GAME_OVER') drawGameOverOverlay()
}

function drawFruit(obj: FlyingObject): void {
  const { x, y, rotation } = obj
  const r = obj.def.radius

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)

  if (obj.def.kind === 'bomb') {
    drawBomb(r)
  } else {
    // Body
    const grad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 2, 0, 0, r)
    grad.addColorStop(0, lighten(obj.def.color, 0.4))
    grad.addColorStop(1, obj.def.color)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()

    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.beginPath()
    ctx.arc(-r * 0.28, -r * 0.32, r * 0.3, 0, Math.PI * 2)
    ctx.fill()

    // Leaf
    ctx.fillStyle = obj.def.leafColor
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.bezierCurveTo(r * 0.5, -r * 1.5, r * 0.8, -r * 0.8, 0, -r * 0.6)
    ctx.bezierCurveTo(-r * 0.5, -r * 0.8, -r * 0.3, -r * 1.3, 0, -r)
    ctx.fill()
  }

  ctx.restore()
}

function drawBomb(r: number): void {
  // Black circle
  ctx.fillStyle = '#222'
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#555'
  ctx.lineWidth = 2
  ctx.stroke()

  // Fuse
  ctx.strokeStyle = '#888'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(r * 0.3, -r * 0.7)
  ctx.quadraticCurveTo(r * 0.8, -r * 1.3, r * 0.5, -r * 1.6)
  ctx.stroke()

  // Spark
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.arc(r * 0.5, -r * 1.6, 4, 0, Math.PI * 2)
  ctx.fill()
}

function drawHalf(h: Half, def: FruitDef): void {
  const r = def.radius
  ctx.save()
  ctx.translate(h.x, h.y)
  ctx.rotate(h.rotation)

  // Clip to half circle
  ctx.beginPath()
  if (h.side === 'L') {
    ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2)
  } else {
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2)
  }
  ctx.closePath()
  ctx.clip()

  // Fill
  const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 2, 0, 0, r)
  grad.addColorStop(0, lighten(def.color, 0.4))
  grad.addColorStop(1, def.color)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()

  // Inner flesh (lighter)
  ctx.fillStyle = lighten(def.color, 0.55)
  ctx.fillRect(h.side === 'L' ? -r : 0, -r, r, r * 2)

  ctx.restore()
}

function drawSlashTrail(): void {
  if (slashTrail.length < 2) return
  for (let i = 1; i < slashTrail.length; i++) {
    const prev = slashTrail[i - 1]
    const curr = slashTrail[i]
    const alpha = Math.max(0, 1 - curr.age / SLASH_FADE_FRAMES) * 0.7
    ctx.globalAlpha = alpha
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3 - (curr.age / SLASH_FADE_FRAMES) * 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(curr.x, curr.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawReadyOverlay(): void {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fb923c'
  ctx.font = `bold ${Math.floor(canvasW * 0.12)}px 'Courier New', monospace`
  ctx.fillText('FRUIT NINJA', canvasW / 2, canvasH / 2 - 40)
  ctx.fillStyle = '#fff'
  ctx.font = `${Math.floor(canvasW * 0.055)}px 'Courier New', monospace`
  ctx.fillText('Swipe to slice fruits!', canvasW / 2, canvasH / 2 + 5)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `${Math.floor(canvasW * 0.042)}px 'Courier New', monospace`
  ctx.fillText('Avoid bombs — miss 3 fruits = game over', canvasW / 2, canvasH / 2 + 36)
  ctx.fillStyle = '#fb923c'
  ctx.font = `${Math.floor(canvasW * 0.05)}px 'Courier New', monospace`
  ctx.fillText('Tap to start', canvasW / 2, canvasH / 2 + 72)
}

function drawGameOverOverlay(): void {
  ctx.fillStyle = 'rgba(0,0,0,0.72)'
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ef4444'
  ctx.font = `bold ${Math.floor(canvasW * 0.11)}px 'Courier New', monospace`
  ctx.fillText('GAME OVER', canvasW / 2, canvasH / 2 - 36)
  ctx.fillStyle = '#fff'
  ctx.font = `${Math.floor(canvasW * 0.065)}px 'Courier New', monospace`
  ctx.fillText(`Score: ${score}`, canvasW / 2, canvasH / 2 + 8)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `${Math.floor(canvasW * 0.045)}px 'Courier New', monospace`
  ctx.fillText('Tap to play again', canvasW / 2, canvasH / 2 + 46)
}

function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1,3), 16)
  const g = parseInt(hex.slice(3,5), 16)
  const b = parseInt(hex.slice(5,7), 16)
  return `rgb(${Math.min(255,Math.floor(r+(255-r)*amount))},${Math.min(255,Math.floor(g+(255-g)*amount))},${Math.min(255,Math.floor(b+(255-b)*amount))})`
}

// ── Input ──────────────────────────────────────────────────────────────────────

function handlePointerStart(x: number, y: number): void {
  if (gameState === 'READY' || gameState === 'GAME_OVER') {
    startGame()
    return
  }
  pointerDown = true
  lastPointerX = x
  lastPointerY = y
  slashTrail = [{ x, y, age: 0 }]
  comboCount = 0
}

function handlePointerMove(x: number, y: number): void {
  if (!pointerDown || gameState !== 'PLAYING') return
  slashTrail.push({ x, y, age: 0 })
  checkSliceAlongLine(lastPointerX, lastPointerY, x, y)
  lastPointerX = x
  lastPointerY = y
}

function handlePointerEnd(): void {
  pointerDown = false
}

canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  const rect = canvas.getBoundingClientRect()
  handlePointerStart(e.clientX - rect.left, e.clientY - rect.top)
})
canvas.addEventListener('pointermove', (e: PointerEvent) => {
  const rect = canvas.getBoundingClientRect()
  handlePointerMove(e.clientX - rect.left, e.clientY - rect.top)
})
canvas.addEventListener('pointerup', () => handlePointerEnd())
canvas.addEventListener('pointercancel', () => handlePointerEnd())

// Mouse fallback for desktop
canvas.addEventListener('mousedown', (e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect()
  handlePointerStart(e.clientX - rect.left, e.clientY - rect.top)
})
canvas.addEventListener('mousemove', (e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect()
  handlePointerMove(e.clientX - rect.left, e.clientY - rect.top)
})
canvas.addEventListener('mouseup', () => handlePointerEnd())

muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── HUD ────────────────────────────────────────────────────────────────────────

function updateHUD(): void {
  scoreEl.textContent = String(score)
  timerEl.textContent = String(Math.max(0, timeLeft))
  highScoreEl.textContent = String(highScore)
}

// ── Game loop ──────────────────────────────────────────────────────────────────

function loop(): void {
  if (gameState === 'PLAYING') {
    updateObjects()
    updateJuice()
    // Age slash trail points
    for (const pt of slashTrail) pt.age++
    // Remove old slash points
    while (slashTrail.length > 0 && slashTrail[0].age > SLASH_FADE_FRAMES) {
      slashTrail.shift()
    }
    // Combo timer
    if (comboTimer > 0) comboTimer--
  }
  draw()
  requestAnimationFrame(loop)
}

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: saved } = await initSDK()
    highScore = saved
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }
  window.addEventListener('resize', () => { resizeCanvas(); draw() })
  resizeCanvas()
  updateHUD()
  requestAnimationFrame(loop)
}

void boot()
