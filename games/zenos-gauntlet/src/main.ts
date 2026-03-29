import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas setup ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hudZoom = document.getElementById('hud-zoom')!
const hudLevel = document.getElementById('hud-level')!
const hudBest = document.getElementById('hud-best')!

function resize(): void {
  const container = canvas.parentElement!
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight
}
resize()
window.addEventListener('resize', () => { resize(); if (state === 'start') draw() })

// ── Types ──────────────────────────────────────────────────────────────────────

type HazardKind = 'hurdle' | 'pothole' | 'molecule' | 'geometry'

interface Hazard {
  x: number        // world x (track-relative)
  y: number        // screen y fraction 0..1
  kind: HazardKind
  width: number
  height: number
  color: string
  phase: number    // for wobble
}

type GameState = 'start' | 'playing' | 'transition' | 'win' | 'gameover'

// ── Game constants ─────────────────────────────────────────────────────────────

const TRACK_H_FRAC = 0.5   // track occupies middle 50% of canvas height
const PLAYER_X_FRAC = 0.12 // player sits at 12% of canvas width
const FINISH_X = 4000      // finish line world x
const HAZARD_SPACING = 300

// Zoom colors per level
const LEVEL_PALETTES: string[][] = [
  ['#1a1a2e', '#16213e', '#0f3460'],  // level 1 — deep blue night
  ['#2d1b33', '#4a1942', '#6b2d6b'],  // level 2 — purple
  ['#0a2e0a', '#1a4a1a', '#2d6b2d'],  // level 3 — green organic
  ['#1a0a00', '#3d1a00', '#6b3d00'],  // level 4 — amber
  ['#001a1a', '#003d3d', '#006b6b'],  // level 5 — teal
  ['#1a001a', '#3d003d', '#6b006b'],  // level 6 — magenta
  ['#000000', '#111111', '#222222'],  // level 7 — void
  ['#1a1a00', '#3d3d00', '#6b6b00'],  // level 8 — gold
  ['#0a0a2e', '#1a1a6b', '#2d2daa'],  // level 9 — indigo
  ['#2e0a0a', '#6b1a1a', '#aa2d2d'],  // level 10 — crimson
]

const HAZARD_NAMES: HazardKind[] = ['hurdle', 'pothole', 'molecule', 'geometry']

// ── Game state ─────────────────────────────────────────────────────────────────

let state: GameState = 'start'
let zoomLevel = 0          // 0-based; score = zoomLevel reached
let bestScore = 0
let lastTime = 0

// Track progress (world units)
let playerWorldX = 0
let trackLength = FINISH_X
let playerSpeed = 180       // world units per second

// Player visual
let playerY = 0.5           // y fraction 0..1 within track
let playerVY = 0            // vertical velocity
let isJumping = false
let playerGlowTimer = 0

// Hazards for current stretch
let hazards: Hazard[] = []

// Transition animation
let transAlpha = 0
let transDir = 1
let transCallback: (() => void) | null = null

// Camera shake
let shakeX = 0; let shakeY = 0

// Stars / background particles
interface Star { x: number; y: number; size: number; speed: number; color: string }
const stars: Star[] = []

// ── Utility ────────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number { return min + Math.random() * (max - min) }

function initStars(): void {
  stars.length = 0
  const palette = LEVEL_PALETTES[Math.min(zoomLevel, LEVEL_PALETTES.length - 1)]
  for (let i = 0; i < 60; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size: rand(1, 3),
      speed: rand(0.0002, 0.001),
      color: palette[Math.floor(Math.random() * palette.length)],
    })
  }
}

function generateHazards(): void {
  hazards = []
  const kind = HAZARD_NAMES[Math.min(Math.floor(zoomLevel / 2), HAZARD_NAMES.length - 1)]
  const count = 5 + zoomLevel * 2
  const usedX = new Set<number>()

  for (let i = 0; i < count; i++) {
    let x: number
    do {
      x = Math.floor(rand(500, trackLength - 600) / 100) * 100
    } while (usedX.has(x))
    usedX.add(x)

    const yFrac = rand(0.15, 0.85)

    let w = 60; let h = 40; let color = '#ff6b6b'

    if (kind === 'hurdle') {
      w = 20; h = 40 + rand(0, 30); color = `hsl(${rand(0, 60)}, 80%, 60%)`
    } else if (kind === 'pothole') {
      w = 50 + rand(0, 40); h = 30; color = '#333'
    } else if (kind === 'molecule') {
      w = 35; h = 35; color = `hsl(${rand(120, 240)}, 70%, 60%)`
    } else {
      w = 25 + rand(0, 50); h = 25 + rand(0, 50)
      color = `hsl(${rand(0, 360)}, 70%, 60%)`
    }

    hazards.push({ x, y: yFrac, kind, width: w, height: h, color, phase: Math.random() * Math.PI * 2 })
  }
}

function startLevel(): void {
  playerWorldX = 0
  playerY = 0.5
  playerVY = 0
  isJumping = false
  const speedIncrease = 1 + zoomLevel * 0.15
  playerSpeed = 180 * speedIncrease
  generateHazards()
  initStars()
  updateHUD()
}

function updateHUD(): void {
  hudZoom.textContent = `x${Math.pow(2, zoomLevel).toFixed(0)}`
  hudLevel.textContent = String(zoomLevel + 1)
  hudBest.textContent = String(bestScore)
}

// ── Input ──────────────────────────────────────────────────────────────────────

const keysDown = new Set<string>()
window.addEventListener('keydown', (e: KeyboardEvent) => {
  keysDown.add(e.key)
  if (state === 'playing') {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
      e.preventDefault()
      jump()
    }
  }
})
window.addEventListener('keyup', (e: KeyboardEvent) => keysDown.delete(e.key))

// Touch
let lastTouchY = 0
canvas.addEventListener('touchstart', (e: TouchEvent) => {
  lastTouchY = e.touches[0].clientY
}, { passive: true })
canvas.addEventListener('touchend', (e: TouchEvent) => {
  if (state !== 'playing') return
  const dy = e.changedTouches[0].clientY - lastTouchY
  if (Math.abs(dy) < 20) {
    // tap = jump
    jump()
  } else if (dy > 20) {
    // swipe down = dodge down
    playerVY = 2.5
  } else if (dy < -20) {
    // swipe up = jump
    jump()
  }
}, { passive: true })

canvas.addEventListener('click', () => {
  if (state === 'start') beginGame()
  else if (state === 'gameover' || state === 'win') beginGame()
})

canvas.addEventListener('touchend', (e: TouchEvent) => {
  if (state === 'start') { e.preventDefault(); beginGame() }
  else if (state === 'gameover' || state === 'win') { e.preventDefault(); beginGame() }
}, { passive: false })

function jump(): void {
  if (!isJumping) {
    playerVY = -3.5
    isJumping = true
    audio.blip()
  }
}

// ── Physics ────────────────────────────────────────────────────────────────────

function updatePlayer(dt: number): void {
  if (keysDown.has('ArrowDown') || keysDown.has('s')) {
    if (!isJumping) playerVY = Math.min(3, playerVY + 5 * dt)
  }
  if ((keysDown.has('ArrowUp') || keysDown.has('w')) && !isJumping) {
    playerVY = -2.5
    isJumping = true
  }

  // Gravity
  playerVY += 10 * dt
  playerY += playerVY * dt
  playerY = Math.max(0.05, Math.min(0.95, playerY))

  // Floor/ceiling bounce back to mid
  if (playerY >= 0.95 || playerY <= 0.05) {
    playerVY = 0
    if (playerY >= 0.95) isJumping = false
  }
}

function getTrackBounds(): { top: number; bot: number; height: number } {
  const H = canvas.height
  const top = H * (0.5 - TRACK_H_FRAC / 2)
  const bot = H * (0.5 + TRACK_H_FRAC / 2)
  return { top, bot, height: bot - top }
}

// ── Collision ──────────────────────────────────────────────────────────────────

function checkCollisions(): boolean {
  const W = canvas.width
  const playerScreenX = W * PLAYER_X_FRAC
  const { top, height } = getTrackBounds()
  const playerScreenY = top + playerY * height
  const pr = 16 // player radius

  // Camera offset: world player x maps to screen player_x_frac
  const camOffset = playerWorldX - W * PLAYER_X_FRAC

  for (const h of hazards) {
    const hsx = h.x - camOffset
    const hsy = top + h.y * height

    if (h.kind === 'hurdle') {
      // Hurdle: thin vertical bar — must jump over
      const barX = hsx + h.width / 2
      const barTop = hsy - h.height / 2
      if (Math.abs(playerScreenX - barX) < pr + 6 && playerScreenY + pr > barTop) {
        return true
      }
    } else if (h.kind === 'pothole') {
      // Pothole in the "floor" — must dodge up
      const pitY = top + height - h.height
      if (
        playerScreenX + pr > hsx &&
        playerScreenX - pr < hsx + h.width &&
        playerScreenY + pr > pitY
      ) {
        return true
      }
    } else {
      // Generic obstacle
      if (
        playerScreenX + pr > hsx - h.width / 2 &&
        playerScreenX - pr < hsx + h.width / 2 &&
        playerScreenY + pr > hsy - h.height / 2 &&
        playerScreenY - pr < hsy + h.height / 2
      ) {
        return true
      }
    }
  }
  return false
}

// ── Transition ─────────────────────────────────────────────────────────────────

function startTransition(cb: () => void): void {
  state = 'transition'
  transAlpha = 0
  transDir = 1
  transCallback = cb
}

// ── Main game flow ─────────────────────────────────────────────────────────────

function beginGame(): void {
  zoomLevel = 0
  playerWorldX = 0
  state = 'playing'
  audio.start()
  startLevel()
}

// ── Main loop ──────────────────────────────────────────────────────────────────

function loop(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000)
  lastTime = now

  if (state === 'playing') {
    playerWorldX += playerSpeed * dt
    updatePlayer(dt)

    // Animate stars
    for (const s of stars) {
      s.x -= s.speed * playerSpeed * dt
      if (s.x < 0) s.x = 1
    }

    if (playerGlowTimer > 0) playerGlowTimer--
    shakeX = 0; shakeY = 0

    // Reached halfway -> zoom transition
    if (playerWorldX >= trackLength / 2 && playerWorldX - playerSpeed * dt < trackLength / 2) {
      // Halfway zoom event
      audio.levelUp()
      zoomLevel++
      updateHUD()

      if (zoomLevel >= 10) {
        // Win condition
        startTransition(() => { state = 'win'; reportGameOver(zoomLevel) })
        if (zoomLevel > bestScore) { bestScore = zoomLevel; saveBestScore(bestScore) }
      } else {
        // Reset track — player is at "start" of new zoomed-in segment
        startTransition(() => {
          playerWorldX = 0
          trackLength = FINISH_X
          startLevel()
          state = 'playing'
        })
      }
      reportScore(zoomLevel)
    }

    // Check finish line
    if (playerWorldX >= trackLength) {
      audio.levelUp()
      zoomLevel++
      updateHUD()
      if (zoomLevel > bestScore) { bestScore = zoomLevel; saveBestScore(bestScore) }
      if (zoomLevel >= 10) {
        state = 'win'
        reportGameOver(zoomLevel)
      } else {
        startTransition(() => {
          playerWorldX = 0
          startLevel()
          state = 'playing'
        })
      }
    }

    // Collision check
    if (checkCollisions()) {
      audio.death()
      shakeX = (Math.random() - 0.5) * 20
      shakeY = (Math.random() - 0.5) * 20
      state = 'gameover'
      if (zoomLevel > bestScore) { bestScore = zoomLevel; saveBestScore(bestScore) }
      reportGameOver(zoomLevel)
    }
  }

  if (state === 'transition') {
    transAlpha += 0.04 * transDir
    if (transAlpha >= 1) {
      transDir = -1
      if (transCallback) { transCallback(); transCallback = null }
    }
    if (transAlpha <= 0 && transDir === -1) {
      transAlpha = 0
    }
  }

  draw()
  requestAnimationFrame(loop)
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function draw(): void {
  const W = canvas.width; const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const palette = LEVEL_PALETTES[Math.min(zoomLevel, LEVEL_PALETTES.length - 1)]

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, palette[0])
  grad.addColorStop(0.5, palette[1])
  grad.addColorStop(1, palette[2])
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Stars
  for (const s of stars) {
    const brightPalette = ['#ffffff', '#aaccff', '#ffccaa', '#ccffcc']
    ctx.fillStyle = brightPalette[Math.floor(Math.random() * brightPalette.length)]
    ctx.globalAlpha = 0.4 + Math.random() * 0.6
    ctx.fillRect(s.x * W, s.y * H, s.size, s.size)
  }
  ctx.globalAlpha = 1

  // Camera shake
  ctx.save()
  ctx.translate(shakeX, shakeY)

  const { top, bot, height } = getTrackBounds()

  // Track
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.fillRect(0, top, W, height)
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, top); ctx.lineTo(W, top)
  ctx.moveTo(0, bot); ctx.lineTo(W, bot)
  ctx.stroke()

  // Ground line
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.setLineDash([8, 8])
  ctx.beginPath()
  ctx.moveTo(0, bot - 2); ctx.lineTo(W, bot - 2)
  ctx.stroke()
  ctx.setLineDash([])

  if (state === 'playing' || state === 'transition') {
    const camOffset = playerWorldX - W * PLAYER_X_FRAC
    const now = performance.now()

    // Draw hazards
    for (const h of hazards) {
      const hsx = h.x - camOffset
      if (hsx < -200 || hsx > W + 200) continue
      const hsy = top + h.y * height

      ctx.save()
      if (h.kind === 'hurdle') {
        // Vertical bar
        const barX = hsx
        ctx.fillStyle = h.color
        ctx.fillRect(barX - 8, hsy - h.height, 16, h.height)
        // Warning stripes
        ctx.fillStyle = 'rgba(255,255,0,0.6)'
        for (let i = 0; i < h.height; i += 16) {
          ctx.fillRect(barX - 8, hsy - h.height + i, 16, 8)
        }
      } else if (h.kind === 'pothole') {
        // Dark pit in floor
        ctx.fillStyle = '#111'
        ctx.beginPath()
        ctx.ellipse(hsx + h.width / 2, bot - h.height / 2, h.width / 2, h.height / 2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#444'
        ctx.lineWidth = 2
        ctx.stroke()
      } else if (h.kind === 'molecule') {
        // Circle with electron orbits
        const wobble = Math.sin(now * 0.002 + h.phase) * 5
        ctx.strokeStyle = h.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(hsx, hsy + wobble, h.width / 2, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = h.color
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        ctx.arc(hsx, hsy + wobble, h.width / 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        // Electron
        const eAngle = now * 0.003 + h.phase
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(hsx + Math.cos(eAngle) * h.width / 2, hsy + wobble + Math.sin(eAngle) * 8, 4, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Abstract geometry
        const rot = now * 0.001 + h.phase
        ctx.translate(hsx, hsy)
        ctx.rotate(rot)
        ctx.strokeStyle = h.color
        ctx.lineWidth = 2
        ctx.strokeRect(-h.width / 2, -h.height / 2, h.width, h.height)
        ctx.rotate(Math.PI / 4)
        ctx.globalAlpha = 0.5
        ctx.strokeRect(-h.width / 3, -h.height / 3, h.width * 0.67, h.height * 0.67)
        ctx.globalAlpha = 1
      }
      ctx.restore()
    }

    // Finish line
    const finishScreenX = trackLength - camOffset
    if (finishScreenX > 0 && finishScreenX < W) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 4
      ctx.setLineDash([12, 8])
      ctx.beginPath()
      ctx.moveTo(finishScreenX, top)
      ctx.lineTo(finishScreenX, bot)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#ffd700'
      ctx.font = 'bold 14px Courier New'
      ctx.textAlign = 'center'
      ctx.fillText('FINISH', finishScreenX, top - 10)
    }

    // Progress bar
    const progress = Math.min(1, playerWorldX / trackLength)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(0, H - 6, W, 6)
    ctx.fillStyle = `hsl(${120 + zoomLevel * 20}, 70%, 60%)`
    ctx.fillRect(0, H - 6, W * progress, 6)

    // Player
    const playerScreenX = W * PLAYER_X_FRAC
    const playerScreenY = top + playerY * height

    ctx.save()
    if (playerGlowTimer > 0) {
      ctx.shadowColor = '#ffd700'
      ctx.shadowBlur = 20
    }
    // Body
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(playerScreenX, playerScreenY, 16, 0, Math.PI * 2)
    ctx.fill()
    // Speed lines
    ctx.strokeStyle = `hsl(${zoomLevel * 30}, 80%, 70%)`
    ctx.lineWidth = 2
    for (let i = 0; i < 3; i++) {
      const lineY = playerScreenY + (i - 1) * 8
      ctx.beginPath()
      ctx.moveTo(playerScreenX - 30, lineY)
      ctx.lineTo(playerScreenX - 20, lineY)
      ctx.stroke()
    }
    ctx.restore()

    // Zoom label overlay
    const labelX = Math.floor(now * 0.0003 * 100) % 100
    if (labelX < 50) {
      ctx.fillStyle = 'rgba(255,215,0,0.3)'
      ctx.font = `bold ${Math.min(80, W * 0.15)}px Courier New`
      ctx.textAlign = 'center'
      ctx.fillText(`x${Math.pow(2, zoomLevel).toFixed(0)}`, W / 2, H * 0.88)
    }
  }

  ctx.restore() // shake

  // Transition overlay
  if (state === 'transition' && transAlpha > 0) {
    const nextPalette = LEVEL_PALETTES[Math.min(zoomLevel, LEVEL_PALETTES.length - 1)]
    ctx.fillStyle = nextPalette[1]
    ctx.globalAlpha = Math.min(1, transAlpha)
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
    if (transAlpha > 0.5) {
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.min(64, W * 0.14)}px Courier New`
      ctx.textAlign = 'center'
      ctx.fillText(`ZOOM x${Math.pow(2, zoomLevel).toFixed(0)}`, W / 2, H / 2)
      ctx.font = `${Math.min(22, W * 0.05)}px Courier New`
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillText(getLevelDescription(), W / 2, H / 2 + 50)
    }
  }

  if (state === 'start') drawStartOverlay()
  if (state === 'gameover') drawGameOverOverlay()
  if (state === 'win') drawWinOverlay()
}

function getLevelDescription(): string {
  const descs = [
    'Macro scale — jump the hurdles',
    'Micro scale — dodge the potholes',
    'Nano scale — avoid the molecules',
    'Quantum scale — geometry shifts',
    'Planck scale — reality bends',
    'Sub-Planck — time fragments',
    'The void — nothing is certain',
    'Absurdity — rules dissolve',
    'Impossible — yet here you are',
    'Beyond — you cannot be stopped',
  ]
  return descs[Math.min(zoomLevel - 1, descs.length - 1)] || ''
}

function drawStartOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ffd700'
  ctx.font = `bold ${Math.min(48, W * 0.1)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText("ZENO'S GAUNTLET", W / 2, H * 0.22)
  ctx.fillStyle = '#aaa'
  ctx.font = `${Math.min(16, W * 0.034)}px Courier New`
  const lines = [
    'Run to the finish line.',
    'Every halfway = 2x zoom + new hazards.',
    'Can you reach 10 zoom levels?',
    '',
    'Space / Tap = Jump | Arrow Down = Dodge',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.36 + i * H * 0.068))
  drawBtn('PLAY', W / 2, H * 0.8)
}

function drawGameOverOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ff4444'
  ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('COLLISION!', W / 2, H * 0.22)
  ctx.fillStyle = '#ccc'
  ctx.font = `${Math.min(18, W * 0.038)}px Courier New`
  ctx.fillText(`Zoom level reached: x${Math.pow(2, zoomLevel).toFixed(0)}`, W / 2, H * 0.38)
  ctx.fillText(`Score: ${zoomLevel} levels`, W / 2, H * 0.46)
  ctx.fillText(`Best: ${bestScore} levels`, W / 2, H * 0.54)
  drawBtn('PLAY AGAIN', W / 2, H * 0.72)
}

function drawWinOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(0,0,0,0.9)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ffd700'
  ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('THE IMPOSSIBLE!', W / 2, H * 0.2)
  ctx.fillStyle = '#fff'
  ctx.font = `${Math.min(20, W * 0.043)}px Courier New`
  ctx.fillText("You've broken Zeno's paradox.", W / 2, H * 0.34)
  ctx.fillText('Achieved infinite zoom.', W / 2, H * 0.42)
  ctx.fillStyle = '#ccc'
  ctx.font = `${Math.min(16, W * 0.034)}px Courier New`
  ctx.fillText(`Score: ${zoomLevel} zoom levels | Best: ${bestScore}`, W / 2, H * 0.54)
  drawBtn('PLAY AGAIN', W / 2, H * 0.72)
}

function drawBtn(label: string, cx: number, cy: number): void {
  const bw = 160; const bh = 44
  ctx.fillStyle = '#ffd700'
  ctx.beginPath()
  ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 8)
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.font = `bold ${Math.min(20, canvas.width * 0.043)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText(label, cx, cy + 7)
}

document.getElementById('mute-btn')!.addEventListener('click', () => {
  const m = audio.toggleMute()
  ;(document.getElementById('mute-btn') as HTMLButtonElement).textContent = m ? '\ud83d\udd07' : '\ud83d\udd0a'
})

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { bestScore: saved } = await initSDK()
    bestScore = saved
    hudBest.textContent = String(bestScore)
  } catch { /* standalone */ }
  requestAnimationFrame(loop)
}

void boot()
