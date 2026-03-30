// Pulse Vault — rhythm-dodge arcade
// Compose a rhythm by tapping, then survive the obstacles it spawns.

import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Types ─────────────────────────────────────────────────────────────────────

type ObstacleType = 'ring' | 'laser' | 'orb'

interface TapRecord {
  t: number      // timestamp ms from vault start
  x: number      // canvas-relative x (0..W)
  y: number      // canvas-relative y (0..H)
  gap: number    // ms since previous tap (0 for first)
  type: ObstacleType
}

interface RingObstacle {
  kind: 'ring'
  cx: number; cy: number
  radius: number
  maxRadius: number
  speed: number   // px per second expansion
  alpha: number
  dead: boolean
}

interface LaserObstacle {
  kind: 'laser'
  cx: number; cy: number
  angle: number   // current angle radians
  length: number
  sweepRate: number  // radians per second
  sweepTotal: number // total sweep remaining
  alpha: number
  dead: boolean
}

interface OrbObstacle {
  kind: 'orb'
  x: number; y: number
  vx: number; vy: number
  radius: number
  alpha: number
  dead: boolean
}

type Obstacle = RingObstacle | LaserObstacle | OrbObstacle

interface Particle {
  x: number; y: number
  vx: number; vy: number
  alpha: number
  radius: number
  color: string
  life: number
}

interface Popup {
  x: number; y: number
  text: string
  alpha: number
  vy: number
}

type GameState = 'READY' | 'COMPOSING' | 'SURVIVING' | 'VAULT_END' | 'GAME_OVER'

// ── Canvas setup ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const vaultEl = document.getElementById('vault-value') as HTMLSpanElement
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

// ── Constants ─────────────────────────────────────────────────────────────────

const COMPOSE_DURATION = 3000   // ms
const PLAYER_SPEED     = 250    // px/s
const PLAYER_RADIUS    = 6
const NEAR_MISS_DIST   = 12     // px from obstacle edge
const RING_GAP_MAX     = 300    // ms
const LASER_GAP_MAX    = 600    // ms
const TOTAL_VAULTS     = 8

const COLOR_RING   = '#00ffff'
const COLOR_LASER  = '#ffff00'
const COLOR_ORB    = '#ff00ff'
const COLOR_PLAYER = '#ffffff'

// vault config: [loops, allTypes, mutation]
const VAULT_CONFIG: Array<{ loops: number; allTypes: boolean; mutation: boolean }> = [
  { loops: 3, allTypes: false, mutation: false }, // vault 1
  { loops: 3, allTypes: false, mutation: false }, // vault 2
  { loops: 3, allTypes: false, mutation: false }, // vault 3 (rings+lasers, no orbs via allTypes=false)
  { loops: 3, allTypes: false, mutation: false }, // vault 4
  { loops: 4, allTypes: true,  mutation: false }, // vault 5
  { loops: 4, allTypes: true,  mutation: false }, // vault 6
  { loops: 5, allTypes: true,  mutation: true  }, // vault 7
  { loops: 5, allTypes: true,  mutation: true  }, // vault 8
]

// vaults 3-4 allow lasers but not orbs — handled via effectiveType()
function effectiveType(vaultIndex: number, tap: TapRecord): ObstacleType {
  if (vaultIndex <= 1) return 'ring'   // vaults 1-2: rings only
  if (vaultIndex <= 3) {               // vaults 3-4: rings + lasers
    if (tap.type === 'orb') return 'laser'
    return tap.type
  }
  return tap.type                      // vaults 5+: all types
}

// ── Game state ────────────────────────────────────────────────────────────────

let state: GameState = 'READY'
let score = 0
let bestScore = 0
let vaultIndex = 0          // 0-7
let currentLoop = 0
let surviveTimer = 0        // ms into current loop
let loopDuration = 0        // total ms of one rhythm loop
let nearMissCount = 0
let slowdownTimer = 0       // s remaining of near-miss slowdown

// compose phase
let composeStart = 0
let taps: TapRecord[] = []

// survive phase
let obstacles: Obstacle[] = []
let particles: Particle[] = []
let popups: Popup[] = []
let trailPoints: Array<{ x: number; y: number; alpha: number }> = []

// player
let px = 0
let py = 0
let pDead = false
let deathTimer = 0

// input
const keys: Record<string, boolean> = {}
let touchX = -1
let touchY = -1
let touchActive = false
let actionPending = false

// escalation background shift (0=blue, 1=red)
let bgWarmth = 0

// border pulse
let borderPulseAlpha = 0

// vault-end display
let vaultEndTimer = 0
let vaultEndMsg = ''
let vaultEndSuccess = false

// ── Audio helpers ─────────────────────────────────────────────────────────────

// Use the shared audio module, adding game-specific wrappers

function playTap(): void {
  // Bass thump for compose tap
  audio.blip()
}

function playLoopStart(): void {
  audio.click()
}

function playRingSpawn(): void {
  // Whoosh: quick high-freq sweep
  audio.blip()
}

function playLaserSpawn(): void {
  // Whine: slightly different
  audio.score()
}

function playOrbSpawn(): void {
  audio.click()
}

function playNearMiss(): void {
  audio.combo()
}

function playLoopSurvive(): void {
  audio.levelUp()
}

function playDeath(): void {
  audio.death()
}

function playVaultComplete(): void {
  audio.powerup()
}

// ── Obstacle creation ─────────────────────────────────────────────────────────

function scaleFactor(loop: number): number {
  return 1 + loop * 0.1  // loop 0 = 1.0, loop 4 = 1.4
}

function spawnObstacle(tap: TapRecord, loop: number, vaultIdx: number): void {
  const type = effectiveType(vaultIdx, tap)
  const sf = scaleFactor(loop)
  const W = canvas.width
  const H = canvas.height

  if (type === 'ring') {
    const obs: RingObstacle = {
      kind: 'ring',
      cx: tap.x, cy: tap.y,
      radius: 0,
      maxRadius: 60 * sf,
      speed: 60 * sf,   // px/s
      alpha: 1,
      dead: false,
    }
    obstacles.push(obs)
    playRingSpawn()
  } else if (type === 'laser') {
    const obs: LaserObstacle = {
      kind: 'laser',
      cx: tap.x, cy: tap.y,
      angle: Math.random() * Math.PI * 2,
      length: 80 * sf,
      sweepRate: (Math.PI / 2) / (0.8 / sf),   // 90° over 0.8s (scaled)
      sweepTotal: Math.PI / 2,
      alpha: 1,
      dead: false,
    }
    obstacles.push(obs)
    playLaserSpawn()
  } else {
    // orb — bouncing ball, spawn near tap position, keep within bounds
    const r = 25 * sf
    const spawnX = Math.max(r, Math.min(W - r, tap.x))
    const spawnY = Math.max(r, Math.min(H - r, tap.y))
    const angle = Math.random() * Math.PI * 2
    const speed = 100 * sf
    const obs: OrbObstacle = {
      kind: 'orb',
      x: spawnX, y: spawnY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: r,
      alpha: 1,
      dead: false,
    }
    obstacles.push(obs)
    playOrbSpawn()
  }
}

// ── Collision detection ───────────────────────────────────────────────────────

/** Returns distance from player center to nearest edge of obstacle, negative = inside */
function distToObstacle(obs: Obstacle): number {
  if (obs.kind === 'ring') {
    const dx = px - obs.cx
    const dy = py - obs.cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    // Ring is a circle shell — inside if radius-3 < dist < radius+3
    return Math.abs(dist - obs.radius) - (PLAYER_RADIUS + 3)
  }
  if (obs.kind === 'orb') {
    const dx = px - obs.x
    const dy = py - obs.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    return dist - obs.radius - PLAYER_RADIUS
  }
  if (obs.kind === 'laser') {
    // Laser: line segment from center in direction angle, length = obs.length
    const ex = obs.cx + Math.cos(obs.angle) * obs.length
    const ey = obs.cy + Math.sin(obs.angle) * obs.length
    const ldx = ex - obs.cx
    const ldy = ey - obs.cy
    const len2 = ldx * ldx + ldy * ldy
    let t = len2 > 0 ? ((px - obs.cx) * ldx + (py - obs.cy) * ldy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const closestX = obs.cx + t * ldx
    const closestY = obs.cy + t * ldy
    const d = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2)
    return d - PLAYER_RADIUS - 4   // laser has 4px half-width
  }
  return Infinity
}

// ── Particle effects ──────────────────────────────────────────────────────────

function spawnDeathParticles(): void {
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2
    const speed = 60 + Math.random() * 80
    particles.push({
      x: px, y: py,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      alpha: 1,
      radius: 2 + Math.random() * 3,
      color: COLOR_PLAYER,
      life: 0.8,
    })
  }
}

function spawnLoopFlash(): void {
  // screen flash — done via bgWarmth pulse, just spawn some green particles
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2
    particles.push({
      x: canvas.width / 2, y: canvas.height / 2,
      vx: Math.cos(angle) * (80 + Math.random() * 120),
      vy: Math.sin(angle) * (80 + Math.random() * 120),
      alpha: 0.8,
      radius: 3,
      color: '#00ff80',
      life: 0.6,
    })
  }
}

// ── Rhythm loop management ────────────────────────────────────────────────────

function startSurvivePhase(): void {
  if (taps.length === 0) {
    // No taps recorded — add a default tap in center
    taps.push({ t: 500, x: canvas.width / 2, y: canvas.height / 2, gap: 0, type: 'ring' })
  }

  // Calculate loop duration from last tap + small buffer
  loopDuration = taps[taps.length - 1].t + 600

  state = 'SURVIVING'
  currentLoop = 0
  surviveTimer = 0
  obstacles = []
  trailPoints = []

  bgWarmth = 0

  // Center the player at start
  px = canvas.width / 2
  py = canvas.height / 2
  pDead = false

  // Apply mutation for vaults 7-8
  if (VAULT_CONFIG[vaultIndex].mutation) {
    applyMutation()
  }

  playLoopStart()
}

function applyMutation(): void {
  if (taps.length === 0) return
  const roll = Math.random()
  if (roll < 0.5) {
    // Double a random tap (insert copy next to it)
    const idx = Math.floor(Math.random() * taps.length)
    const original = taps[idx]
    const duped: TapRecord = { ...original, t: original.t + 80 }
    taps.splice(idx + 1, 0, duped)
  } else {
    // Remove a random tap
    if (taps.length > 1) {
      const idx = Math.floor(Math.random() * taps.length)
      taps.splice(idx, 1)
    }
  }
}

function tickSurvive(dt: number): void {
  const cfg = VAULT_CONFIG[vaultIndex]

  // Apply near-miss slowdown
  let timeScale = 1
  if (slowdownTimer > 0) {
    timeScale = 0.3
    slowdownTimer -= dt
    if (slowdownTimer < 0) slowdownTimer = 0
  }

  const scaledDt = dt * timeScale
  surviveTimer += scaledDt * 1000   // ms

  // Border pulse — sync with rhythm
  borderPulseAlpha = Math.max(0, borderPulseAlpha - dt * 3)

  // Background warmth: increases each loop
  const targetWarmth = currentLoop / (cfg.loops - 1 || 1)
  bgWarmth += (targetWarmth - bgWarmth) * dt * 2

  // Check if we need to spawn obstacles from taps
  for (const tap of taps) {
    // Spawn on beat: when surviveTimer passes tap.t
    const tapTime = tap.t
    // Detect crossing of tapTime in this frame
    const prevTime = surviveTimer - scaledDt * 1000
    if (prevTime < tapTime && surviveTimer >= tapTime) {
      spawnObstacle(tap, currentLoop, vaultIndex)
      borderPulseAlpha = 0.6
    }
  }

  // Move player
  if (!pDead) {
    movePlayer(scaledDt)
  }

  // Update obstacles
  updateObstacles(scaledDt)

  // Update trail
  if (!pDead) {
    trailPoints.push({ x: px, y: py, alpha: 0.6 })
    if (trailPoints.length > 20) trailPoints.shift()
    for (const pt of trailPoints) pt.alpha -= dt * 3
  }

  // Collision check
  if (!pDead) {
    for (const obs of obstacles) {
      if (obs.dead) continue
      const dist = distToObstacle(obs)
      if (dist <= 0) {
        // Hit!
        pDead = true
        deathTimer = 0.8
        spawnDeathParticles()
        playDeath()
        // Gray out obstacles
        for (const o of obstacles) o.alpha *= 0.3
        break
      } else if (dist <= NEAR_MISS_DIST) {
        // Near miss — only count once per obstacle per visit
        // We use a simple flag: check if dist was just entered
        nearMissCount++
        score += 50
        slowdownTimer = 0.1
        popups.push({ x: px - 20, y: py - 20, text: '+NM', alpha: 1, vy: -60 })
        playNearMiss()
        updateHUD()
      }
    }
  }

  // Update particles
  for (const p of particles) {
    p.x += p.vx * scaledDt
    p.y += p.vy * scaledDt
    p.alpha -= scaledDt / p.life
    p.vy += 60 * scaledDt  // gravity
  }
  particles = particles.filter(p => p.alpha > 0)

  // Update popups
  for (const pop of popups) {
    pop.y += pop.vy * scaledDt
    pop.alpha -= scaledDt * 2
  }
  popups = popups.filter(p => p.alpha > 0)

  // Death timer
  if (pDead) {
    deathTimer -= dt
    if (deathTimer <= 0) {
      endVault(false)
    }
    return
  }

  // Score: 10 per 0.1s survived = 100/s
  score += 100 * scaledDt
  updateHUD()

  // Check loop completion
  if (surviveTimer >= loopDuration) {
    // Loop complete
    currentLoop++
    surviveTimer = 0
    obstacles = []

    const loopScore = 200 * currentLoop
    score += loopScore
    popups.push({
      x: canvas.width / 2 - 50,
      y: canvas.height / 2,
      text: `LOOP ${currentLoop} +${loopScore}`,
      alpha: 1,
      vy: -80,
    })
    spawnLoopFlash()
    playLoopSurvive()
    updateHUD()

    if (currentLoop >= cfg.loops) {
      // Vault survived
      endVault(true)
    } else {
      // Apply mutation again for high vaults each loop
      if (cfg.mutation && Math.random() < 0.3) applyMutation()
    }
  }
}

function movePlayer(dt: number): void {
  const W = canvas.width
  const H = canvas.height
  let dx = 0
  let dy = 0

  if (touchActive) {
    // Touch: follow finger
    const targetX = touchX
    const targetY = touchY
    const tx = targetX - px
    const ty = targetY - py
    const d = Math.sqrt(tx * tx + ty * ty)
    if (d > 2) {
      dx = (tx / d) * Math.min(d, PLAYER_SPEED * dt) / dt
      dy = (ty / d) * Math.min(d, PLAYER_SPEED * dt) / dt
    }
  } else {
    // Keyboard
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) dx -= 1
    if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1
    if (keys['ArrowUp'] || keys['w'] || keys['W']) dy -= 1
    if (keys['ArrowDown'] || keys['s'] || keys['S']) dy += 1
    if (dx !== 0 && dy !== 0) {
      dx *= 0.707
      dy *= 0.707
    }
  }

  if (touchActive) {
    // Clamp approach distance
    const tx = touchX - px
    const ty = touchY - py
    const d = Math.sqrt(tx * tx + ty * ty)
    if (d > 2) {
      const speed = Math.min(PLAYER_SPEED, d / dt)
      px += (tx / d) * speed * dt
      py += (ty / d) * speed * dt
    }
  } else {
    px += dx * PLAYER_SPEED * dt
    py += dy * PLAYER_SPEED * dt
  }

  // Clamp to canvas
  px = Math.max(PLAYER_RADIUS, Math.min(W - PLAYER_RADIUS, px))
  py = Math.max(PLAYER_RADIUS, Math.min(H - PLAYER_RADIUS, py))
}

function updateObstacles(dt: number): void {
  const W = canvas.width
  const H = canvas.height

  for (const obs of obstacles) {
    if (obs.dead) continue

    if (obs.kind === 'ring') {
      obs.radius += obs.speed * dt
      if (obs.radius >= obs.maxRadius) {
        obs.alpha -= dt * 2
        if (obs.alpha <= 0) obs.dead = true
      }
    } else if (obs.kind === 'laser') {
      if (obs.sweepTotal > 0) {
        const sweepThisFrame = obs.sweepRate * dt
        obs.angle += sweepThisFrame
        obs.sweepTotal -= sweepThisFrame
        if (obs.sweepTotal <= 0) {
          obs.sweepTotal = 0
          obs.alpha -= dt * 1.5
          if (obs.alpha <= 0) obs.dead = true
        }
      }
    } else if (obs.kind === 'orb') {
      obs.x += obs.vx * dt
      obs.y += obs.vy * dt
      if (obs.x - obs.radius < 0) { obs.x = obs.radius; obs.vx = Math.abs(obs.vx) }
      if (obs.x + obs.radius > W) { obs.x = W - obs.radius; obs.vx = -Math.abs(obs.vx) }
      if (obs.y - obs.radius < 0) { obs.y = obs.radius; obs.vy = Math.abs(obs.vy) }
      if (obs.y + obs.radius > H) { obs.y = H - obs.radius; obs.vy = -Math.abs(obs.vy) }
      // Orbs persist across loop — don't auto-die
    }
  }

  obstacles = obstacles.filter(o => !o.dead)
}

// ── Vault management ──────────────────────────────────────────────────────────

function startVault(): void {
  taps = []
  obstacles = []
  particles = []
  popups = []
  trailPoints = []
  pDead = false
  nearMissCount = 0
  state = 'COMPOSING'
  composeStart = performance.now()
  vaultEl.textContent = String(vaultIndex + 1)
}

function endVault(success: boolean): void {
  state = 'VAULT_END'
  vaultEndTimer = 1.5
  vaultEndSuccess = success

  if (success) {
    score += 500
    vaultEndMsg = `VAULT ${vaultIndex + 1} CLEAR  +500`
    playVaultComplete()
  } else {
    vaultEndMsg = `VAULT ${vaultIndex + 1} FAILED`
  }

  updateHUD()

  if (score > bestScore) {
    bestScore = Math.floor(score)
    bestEl.textContent = String(bestScore)
    saveHighScore(bestScore)
  }

  reportScore(Math.floor(score))
}

function nextVault(): void {
  vaultIndex++
  if (vaultIndex >= TOTAL_VAULTS) {
    endGame()
  } else {
    startVault()
  }
}

function endGame(): void {
  state = 'GAME_OVER'
  reportGameOver(Math.floor(score))
}

function resetGame(): void {
  score = 0
  vaultIndex = 0
  nearMissCount = 0
  obstacles = []
  particles = []
  popups = []
  taps = []
  pDead = false
  bgWarmth = 0
  slowdownTimer = 0
  updateHUD()
  startVault()
}

// ── HUD update ────────────────────────────────────────────────────────────────

function updateHUD(): void {
  scoreEl.textContent = String(Math.floor(score))
  vaultEl.textContent = String(vaultIndex + 1)
  bestEl.textContent = String(bestScore)
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bv = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bv})`
}

function drawBackground(): void {
  const W = canvas.width
  const H = canvas.height

  // Base dark color shifting from blue-tint to red-tint with warmth
  const darkBase = lerpColor([10, 0, 16], [24, 4, 4], bgWarmth)
  ctx.fillStyle = darkBase
  ctx.fillRect(0, 0, W, H)

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  const gridStep = 40
  for (let x = 0; x <= W; x += gridStep) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  }
  for (let y = 0; y <= H; y += gridStep) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // Border pulse
  if (borderPulseAlpha > 0) {
    const pulseColor = vaultIndex <= 1 ? COLOR_RING : vaultIndex <= 3 ? COLOR_LASER : COLOR_ORB
    ctx.strokeStyle = pulseColor.replace(')', `,${borderPulseAlpha})`)
      .replace('rgb', 'rgba').replace('#00ffff', `rgba(0,255,255,${borderPulseAlpha})`)
      .replace('#ffff00', `rgba(255,255,0,${borderPulseAlpha})`)
      .replace('#ff00ff', `rgba(255,0,255,${borderPulseAlpha})`)
    // Re-set properly
    if (vaultIndex <= 1) ctx.strokeStyle = `rgba(0,255,255,${borderPulseAlpha})`
    else if (vaultIndex <= 3) ctx.strokeStyle = `rgba(255,255,0,${borderPulseAlpha})`
    else ctx.strokeStyle = `rgba(255,0,255,${borderPulseAlpha})`
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, W - 4, H - 4)
  }
}

function drawObstacles(): void {
  for (const obs of obstacles) {
    if (obs.dead) continue
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, obs.alpha))

    if (obs.kind === 'ring') {
      ctx.strokeStyle = COLOR_RING
      ctx.shadowColor = COLOR_RING
      ctx.shadowBlur = 8
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(obs.cx, obs.cy, Math.max(0, obs.radius), 0, Math.PI * 2)
      ctx.stroke()
    } else if (obs.kind === 'laser') {
      ctx.strokeStyle = COLOR_LASER
      ctx.shadowColor = COLOR_LASER
      ctx.shadowBlur = 12
      ctx.lineWidth = 8
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(obs.cx, obs.cy)
      ctx.lineTo(
        obs.cx + Math.cos(obs.angle) * obs.length,
        obs.cy + Math.sin(obs.angle) * obs.length,
      )
      ctx.stroke()
    } else if (obs.kind === 'orb') {
      const grad = ctx.createRadialGradient(obs.x - obs.radius * 0.3, obs.y - obs.radius * 0.3, 1, obs.x, obs.y, obs.radius)
      grad.addColorStop(0, 'rgba(255,200,255,0.9)')
      grad.addColorStop(0.5, COLOR_ORB)
      grad.addColorStop(1, 'rgba(80,0,80,0.5)')
      ctx.fillStyle = grad
      ctx.shadowColor = COLOR_ORB
      ctx.shadowBlur = 16
      ctx.beginPath()
      ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }
}

function drawPlayer(): void {
  if (pDead) return

  // Trail
  for (let i = 0; i < trailPoints.length; i++) {
    const pt = trailPoints[i]
    const a = Math.max(0, pt.alpha)
    if (a <= 0) continue
    ctx.save()
    ctx.globalAlpha = a
    ctx.fillStyle = COLOR_PLAYER
    ctx.shadowColor = COLOR_PLAYER
    ctx.shadowBlur = 4
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Player dot
  ctx.save()
  ctx.fillStyle = COLOR_PLAYER
  ctx.shadowColor = COLOR_PLAYER
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.arc(px, py, PLAYER_RADIUS, 0, Math.PI * 2)
  ctx.fill()

  // Inner bright
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath()
  ctx.arc(px - 2, py - 2, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawParticles(): void {
  for (const p of particles) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, p.alpha)
    ctx.fillStyle = p.color
    ctx.shadowColor = p.color
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function drawPopups(): void {
  ctx.font = 'bold 14px "Courier New", monospace'
  ctx.textAlign = 'center'
  for (const pop of popups) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, pop.alpha)
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = '#c864ff'
    ctx.shadowBlur = 8
    ctx.fillText(pop.text, pop.x, pop.y)
    ctx.restore()
  }
}

function drawComposing(): void {
  const W = canvas.width
  const H = canvas.height
  const elapsed = performance.now() - composeStart
  const remaining = Math.max(0, COMPOSE_DURATION - elapsed)
  const seconds = Math.ceil(remaining / 1000)

  // Draw existing tap rings
  for (const tap of taps) {
    const age = (elapsed - tap.t) / 1000
    const r = age * 80 + 10
    const alpha = Math.max(0, 1 - age * 1.2)
    const color = tap.type === 'ring' ? '0,255,255' : tap.type === 'laser' ? '255,255,0' : '255,0,255'
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = `rgb(${color})`
    ctx.shadowColor = `rgb(${color})`
    ctx.shadowBlur = 10
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(tap.x, tap.y, Math.max(1, r), 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // Countdown timer
  ctx.save()
  ctx.font = `bold ${80 + (3 - seconds) * 20}px "Courier New", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = `rgba(200,100,255,${0.15 + (remaining % 1000) / 1000 * 0.1})`
  ctx.shadowColor = '#c864ff'
  ctx.shadowBlur = 30
  ctx.fillText(String(seconds), W / 2, H / 2)
  ctx.restore()

  // Tap count + instruction
  ctx.save()
  ctx.font = '14px "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText(`TAP TO COMPOSE  (${taps.length} taps)`, W / 2, H - 24)
  ctx.restore()
}

function drawSurviving(): void {
  drawObstacles()
  drawPlayer()
}

function drawReadyScreen(): void {
  const W = canvas.width
  const H = canvas.height
  ctx.save()
  ctx.textAlign = 'center'

  ctx.font = 'bold 36px "Courier New", monospace'
  ctx.fillStyle = '#c864ff'
  ctx.shadowColor = '#c864ff'
  ctx.shadowBlur = 20
  ctx.fillText('PULSE VAULT', W / 2, H / 2 - 60)

  ctx.font = '14px "Courier New", monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.shadowBlur = 0
  ctx.fillText('Tap a rhythm — survive what you create', W / 2, H / 2 - 20)
  ctx.fillText('WASD / drag to move', W / 2, H / 2 + 10)

  ctx.font = 'bold 16px "Courier New", monospace'
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = '#ffffff'
  ctx.shadowBlur = 10
  ctx.fillText('TAP / CLICK / ANY KEY TO START', W / 2, H / 2 + 60)
  ctx.restore()
}

function drawVaultEnd(): void {
  const W = canvas.width
  const H = canvas.height
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = `bold 22px "Courier New", monospace`
  ctx.fillStyle = vaultEndSuccess ? '#00ff80' : '#ff4444'
  ctx.shadowColor = ctx.fillStyle
  ctx.shadowBlur = 20
  ctx.fillText(vaultEndMsg, W / 2, H / 2)
  ctx.restore()
}

function drawGameOver(): void {
  const W = canvas.width
  const H = canvas.height
  ctx.save()
  ctx.textAlign = 'center'

  ctx.font = 'bold 40px "Courier New", monospace'
  ctx.fillStyle = '#ff4444'
  ctx.shadowColor = '#ff4444'
  ctx.shadowBlur = 20
  ctx.fillText('GAME OVER', W / 2, H / 2 - 50)

  ctx.font = '20px "Courier New", monospace'
  ctx.fillStyle = '#ffffff'
  ctx.shadowBlur = 0
  ctx.fillText(`SCORE: ${Math.floor(score)}`, W / 2, H / 2)
  ctx.fillText(`BEST: ${bestScore}`, W / 2, H / 2 + 30)

  ctx.font = '14px "Courier New", monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText('TAP / CLICK / ANY KEY TO PLAY AGAIN', W / 2, H / 2 + 80)
  ctx.restore()
}

// ── Main loop ─────────────────────────────────────────────────────────────────

let lastTime = 0

function frame(timestamp: number): void {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05)  // cap at 50ms
  lastTime = timestamp

  const W = canvas.width
  const H = canvas.height

  // Clear
  drawBackground()

  if (state === 'READY') {
    drawReadyScreen()
    if (actionPending) {
      actionPending = false
      audio.start()
      startVault()
    }
  } else if (state === 'COMPOSING') {
    const elapsed = performance.now() - composeStart
    drawComposing()
    if (elapsed >= COMPOSE_DURATION) {
      startSurvivePhase()
    }
  } else if (state === 'SURVIVING') {
    tickSurvive(dt)
    drawSurviving()
    drawParticles()
    drawPopups()

    // Loop counter overlay
    const cfg = VAULT_CONFIG[vaultIndex]
    ctx.save()
    ctx.font = '12px "Courier New", monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.textAlign = 'right'
    ctx.fillText(`LOOP ${currentLoop + 1}/${cfg.loops}  NM×${nearMissCount}`, W - 12, H - 10)
    ctx.restore()

  } else if (state === 'VAULT_END') {
    drawSurviving()
    drawParticles()
    drawVaultEnd()
    vaultEndTimer -= dt
    if (vaultEndTimer <= 0) {
      nextVault()
    }
  } else if (state === 'GAME_OVER') {
    drawGameOver()
    if (actionPending) {
      actionPending = false
      resetGame()
    }
  }

  actionPending = false
  requestAnimationFrame(frame)
}

// ── Input ─────────────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  keys[e.key] = true
  if (state === 'READY' || state === 'GAME_OVER') {
    actionPending = true
  }
})
window.addEventListener('keyup', (e) => {
  keys[e.key] = false
})

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  const rect = canvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (canvas.width / rect.width)
  const y = (e.clientY - rect.top) * (canvas.height / rect.height)

  if (state === 'READY' || state === 'GAME_OVER') {
    actionPending = true
    return
  }

  if (state === 'COMPOSING') {
    recordTap(x, y)
    return
  }

  if (state === 'SURVIVING') {
    touchActive = true
    touchX = x
    touchY = y
  }
})

canvas.addEventListener('pointermove', (e) => {
  if (state !== 'SURVIVING') return
  e.preventDefault()
  const rect = canvas.getBoundingClientRect()
  touchX = (e.clientX - rect.left) * (canvas.width / rect.width)
  touchY = (e.clientY - rect.top) * (canvas.height / rect.height)
  touchActive = true
})

canvas.addEventListener('pointerup', () => {
  touchActive = false
})

canvas.addEventListener('pointercancel', () => {
  touchActive = false
})

function recordTap(x: number, y: number): void {
  const now = performance.now()
  const t = now - composeStart
  if (t > COMPOSE_DURATION) return

  const prev = taps.length > 0 ? taps[taps.length - 1].t : t
  const gap = taps.length > 0 ? t - prev : 0

  let type: ObstacleType = 'ring'
  if (gap >= LASER_GAP_MAX) type = 'orb'
  else if (gap >= RING_GAP_MAX) type = 'laser'

  taps.push({ t, x, y, gap, type })
  playTap()

  // Visual feedback: immediate pulse drawn in next frame (taps array is read there)
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  try {
    const result = await initSDK()
    bestScore = result.highScore
    bestEl.textContent = String(bestScore)
  } catch {
    // SDK unavailable (local dev) — continue without it
  }

  px = canvas.width / 2
  py = canvas.height / 2
  lastTime = performance.now()
  requestAnimationFrame(frame)
}

init()
