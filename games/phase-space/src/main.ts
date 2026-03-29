import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas setup ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hudLevel = document.getElementById('hud-level')!
const hudWells = document.getElementById('hud-wells')!
const hudMaxWells = document.getElementById('hud-max-wells')!
const hudScore = document.getElementById('hud-score')!

function resize(): void {
  const container = canvas.parentElement!
  const size = Math.min(container.clientWidth, container.clientHeight, 600)
  canvas.width = size
  canvas.height = size
}
resize()
window.addEventListener('resize', () => { resize(); draw() })

// ── Types ──────────────────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number }

interface GravityWell {
  pos: Vec2
  mass: number        // gravitational strength
  radius: number      // visual size
  dragging: boolean
}

interface Waypoint {
  pos: Vec2
  reached: boolean
  moving: boolean
  phase: number       // for circular motion
  centerX: number
  centerY: number
  orbitR: number
}

interface LevelDef {
  maxWells: number
  launch: Vec2           // normalized 0..1
  velocity: Vec2         // normalized launch velocity
  waypoints: { x: number; y: number; moving?: boolean; orbitR?: number }[]
  par: number
}

// ── Level definitions ──────────────────────────────────────────────────────────

const LEVELS: LevelDef[] = [
  // Level 1 — 1 well, 1 waypoint
  { maxWells: 1, launch: { x: 0.1, y: 0.5 }, velocity: { x: 80, y: -30 },
    waypoints: [{ x: 0.7, y: 0.3 }], par: 1 },
  // Level 2 — 1 well, 2 waypoints
  { maxWells: 1, launch: { x: 0.1, y: 0.7 }, velocity: { x: 100, y: -60 },
    waypoints: [{ x: 0.5, y: 0.2 }, { x: 0.8, y: 0.5 }], par: 1 },
  // Level 3 — 2 wells, 2 waypoints
  { maxWells: 2, launch: { x: 0.1, y: 0.5 }, velocity: { x: 90, y: -20 },
    waypoints: [{ x: 0.4, y: 0.2 }, { x: 0.75, y: 0.7 }], par: 2 },
  // Level 4 — 2 wells, 3 waypoints
  { maxWells: 2, launch: { x: 0.15, y: 0.8 }, velocity: { x: 100, y: -80 },
    waypoints: [{ x: 0.35, y: 0.2 }, { x: 0.65, y: 0.3 }, { x: 0.85, y: 0.6 }], par: 2 },
  // Level 5 — 2 wells, 2 waypoints, 1 moving
  { maxWells: 2, launch: { x: 0.1, y: 0.5 }, velocity: { x: 110, y: -40 },
    waypoints: [
      { x: 0.5, y: 0.3 },
      { x: 0.7, y: 0.7, moving: true, orbitR: 60 },
    ], par: 2 },
  // Level 6 — 2 wells, 3 waypoints
  { maxWells: 2, launch: { x: 0.1, y: 0.6 }, velocity: { x: 95, y: -50 },
    waypoints: [
      { x: 0.3, y: 0.3 }, { x: 0.6, y: 0.2 }, { x: 0.85, y: 0.5 },
    ], par: 2 },
  // Level 7 — 3 wells, 3 waypoints
  { maxWells: 3, launch: { x: 0.1, y: 0.5 }, velocity: { x: 100, y: -30 },
    waypoints: [{ x: 0.35, y: 0.25 }, { x: 0.6, y: 0.65 }, { x: 0.85, y: 0.3 }], par: 3 },
  // Level 8 — 3 wells, 4 waypoints
  { maxWells: 3, launch: { x: 0.12, y: 0.7 }, velocity: { x: 110, y: -70 },
    waypoints: [
      { x: 0.3, y: 0.2 }, { x: 0.55, y: 0.4 }, { x: 0.7, y: 0.7 }, { x: 0.9, y: 0.4 },
    ], par: 3 },
  // Level 9 — 3 wells, 3 waypoints, 2 moving
  { maxWells: 3, launch: { x: 0.1, y: 0.5 }, velocity: { x: 100, y: -40 },
    waypoints: [
      { x: 0.4, y: 0.3 },
      { x: 0.6, y: 0.5, moving: true, orbitR: 50 },
      { x: 0.8, y: 0.3, moving: true, orbitR: 40 },
    ], par: 3 },
  // Level 10 — 3 wells, 4 waypoints, moving
  { maxWells: 3, launch: { x: 0.1, y: 0.6 }, velocity: { x: 115, y: -60 },
    waypoints: [
      { x: 0.3, y: 0.25 },
      { x: 0.55, y: 0.45, moving: true, orbitR: 55 },
      { x: 0.7, y: 0.25 },
      { x: 0.88, y: 0.6, moving: true, orbitR: 35 },
    ], par: 3 },
]

// ── Game state ─────────────────────────────────────────────────────────────────

type Phase = 'start' | 'placing' | 'preview' | 'launched' | 'success' | 'fail' | 'gameover' | 'win'

let phase: Phase = 'start'
let levelIndex = 0
let score = 0
let bestScore = 0
let wells: GravityWell[] = []
let waypoints: Waypoint[] = []
let currentLevel: LevelDef = LEVELS[0]

// Satellite
let satPos: Vec2 = { x: 0, y: 0 }
let satVel: Vec2 = { x: 0, y: 0 }
const SIM_DT = 0.016
const G = 5000
let trail: Vec2[] = []
let simTimer = 0
let simStep = 0

// Preview trajectory
let previewTrail: Vec2[] = []
const PREVIEW_STEPS = 600

// Drag state
let draggingWell: GravityWell | null = null
let dragOffsetX = 0; let dragOffsetY = 0

// Animation
let lastTime = 0
let frameCount = 0

// ── Level setup ────────────────────────────────────────────────────────────────

function loadLevel(idx: number): void {
  currentLevel = LEVELS[idx]
  const W = canvas.width; const H = canvas.height

  wells = []
  waypoints = currentLevel.waypoints.map(wp => ({
    pos: { x: wp.x * W, y: wp.y * H },
    reached: false,
    moving: wp.moving ?? false,
    phase: Math.random() * Math.PI * 2,
    centerX: wp.x * W,
    centerY: wp.y * H,
    orbitR: wp.orbitR ?? 0,
  }))

  satPos = { x: currentLevel.launch.x * W, y: currentLevel.launch.y * H }
  satVel = { x: 0, y: 0 }
  trail = []
  previewTrail = []
  simStep = 0

  hudLevel.textContent = String(idx + 1)
  hudWells.textContent = '0'
  hudMaxWells.textContent = String(currentLevel.maxWells)
  hudScore.textContent = String(score)

  phase = 'placing'
}

// ── Gravity simulation ─────────────────────────────────────────────────────────

function gravity(pos: Vec2): Vec2 {
  let ax = 0; let ay = 0
  for (const w of wells) {
    const dx = w.pos.x - pos.x
    const dy = w.pos.y - pos.y
    const distSq = dx * dx + dy * dy
    if (distSq < 100) continue // avoid singularity
    const dist = Math.sqrt(distSq)
    const force = (G * w.mass) / distSq
    ax += (force * dx) / dist
    ay += (force * dy) / dist
  }
  return { x: ax, y: ay }
}

function stepSat(pos: Vec2, vel: Vec2, dt: number): { pos: Vec2; vel: Vec2 } {
  const a = gravity(pos)
  const newVel = { x: vel.x + a.x * dt, y: vel.y + a.y * dt }
  const newPos = { x: pos.x + newVel.x * dt, y: pos.y + newVel.y * dt }
  return { pos: newPos, vel: newVel }
}

function computePreview(): void {
  previewTrail = []
  const W = canvas.width; const H = canvas.height
  let p = { ...satPos }
  let v = { x: currentLevel.velocity.x, y: currentLevel.velocity.y }

  for (let i = 0; i < PREVIEW_STEPS; i++) {
    const res = stepSat(p, v, SIM_DT)
    p = res.pos; v = res.vel
    if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) break
    previewTrail.push({ ...p })
  }
}

function launch(): void {
  const W = canvas.width; const H = canvas.height
  satPos = { x: currentLevel.launch.x * W, y: currentLevel.launch.y * H }
  satVel = { x: currentLevel.velocity.x, y: currentLevel.velocity.y }
  trail = [{ ...satPos }]
  // Reset waypoints
  waypoints.forEach(wp => { wp.reached = false })
  simStep = 0
  phase = 'launched'
  audio.start()
}

// ── Input ──────────────────────────────────────────────────────────────────────

canvas.addEventListener('mousedown', (e: MouseEvent) => {
  if (phase === 'start' || phase === 'gameover' || phase === 'win') return
  const rect = canvas.getBoundingClientRect()
  const px = (e.clientX - rect.left) * (canvas.width / rect.width)
  const py = (e.clientY - rect.top) * (canvas.height / rect.height)
  handlePointerDown(px, py)
})

canvas.addEventListener('mousemove', (e: MouseEvent) => {
  if (!draggingWell) return
  const rect = canvas.getBoundingClientRect()
  const px = (e.clientX - rect.left) * (canvas.width / rect.width)
  const py = (e.clientY - rect.top) * (canvas.height / rect.height)
  draggingWell.pos = { x: px - dragOffsetX, y: py - dragOffsetY }
  computePreview()
})

canvas.addEventListener('mouseup', () => { draggingWell = null })

canvas.addEventListener('touchstart', (e: TouchEvent) => {
  if (phase === 'start' || phase === 'gameover' || phase === 'win') return
  e.preventDefault()
  const touch = e.touches[0]
  const rect = canvas.getBoundingClientRect()
  const px = (touch.clientX - rect.left) * (canvas.width / rect.width)
  const py = (touch.clientY - rect.top) * (canvas.height / rect.height)
  handlePointerDown(px, py)
}, { passive: false })

canvas.addEventListener('touchmove', (e: TouchEvent) => {
  if (!draggingWell) return
  e.preventDefault()
  const touch = e.touches[0]
  const rect = canvas.getBoundingClientRect()
  const px = (touch.clientX - rect.left) * (canvas.width / rect.width)
  const py = (touch.clientY - rect.top) * (canvas.height / rect.height)
  draggingWell.pos = { x: px - dragOffsetX, y: py - dragOffsetY }
  computePreview()
}, { passive: false })

canvas.addEventListener('touchend', () => { draggingWell = null })

function handlePointerDown(px: number, py: number): void {
  // Check overlay buttons
  if (phase === 'start' || phase === 'gameover' || phase === 'win') return

  // In placing or preview phase
  if (phase === 'placing' || phase === 'preview') {
    // Check if clicking an existing well to drag
    for (const well of wells) {
      const dx = px - well.pos.x; const dy = py - well.pos.y
      if (dx * dx + dy * dy < (well.radius + 10) ** 2) {
        draggingWell = well
        dragOffsetX = px - well.pos.x
        dragOffsetY = py - well.pos.y
        computePreview()
        return
      }
    }

    // Check Launch button area
    const W = canvas.width; const H = canvas.height
    const btnX = W / 2; const btnY = H * 0.92
    if (Math.abs(px - btnX) < 80 && Math.abs(py - btnY) < 22) {
      phase = 'preview'
      computePreview()
      return
    }

    // Check Launch confirm
    if (phase === 'preview') {
      const confirmX = W * 0.75; const confirmY = H * 0.92
      if (Math.abs(px - confirmX) < 80 && Math.abs(py - confirmY) < 22) {
        launch()
        return
      }
    }

    // Place new well (if under max)
    if (wells.length < currentLevel.maxWells) {
      const mass = 0.8 + Math.random() * 0.4
      const well: GravityWell = {
        pos: { x: px, y: py },
        mass,
        radius: 16 + mass * 10,
        dragging: false,
      }
      wells.push(well)
      hudWells.textContent = String(wells.length)
      computePreview()
      phase = 'preview'
      audio.blip()
    }
  }

  if (phase === 'success' || phase === 'fail') {
    nextPhase()
  }
}

canvas.addEventListener('click', (e: MouseEvent) => {
  if (phase === 'start') { beginGame(); return }
  if (phase === 'gameover' || phase === 'win') { resetGame(); return }
})

canvas.addEventListener('touchend', (e: TouchEvent) => {
  if (phase === 'start') { e.preventDefault(); beginGame(); return }
  if (phase === 'gameover' || phase === 'win') { e.preventDefault(); resetGame(); return }
}, { passive: false })

// ── Game flow ──────────────────────────────────────────────────────────────────

function beginGame(): void {
  levelIndex = 0
  score = 0
  phase = 'placing'
  audio.start()
  loadLevel(0)
}

function resetGame(): void {
  levelIndex = 0
  score = 0
  beginGame()
}

function nextPhase(): void {
  if (phase === 'success') {
    levelIndex++
    if (levelIndex >= LEVELS.length) {
      phase = 'win'
      if (score > bestScore) { bestScore = score; saveBestScore(bestScore) }
      reportGameOver(score)
    } else {
      loadLevel(levelIndex)
    }
  } else if (phase === 'fail') {
    // retry
    loadLevel(levelIndex)
  }
}

// ── Game loop ──────────────────────────────────────────────────────────────────

function loop(now: number): void {
  const dt = (now - lastTime) / 1000
  lastTime = now
  frameCount++

  // Animate moving waypoints
  const W = canvas.width; const H = canvas.height
  for (const wp of waypoints) {
    if (wp.moving) {
      wp.phase += dt * 0.6
      wp.pos = {
        x: wp.centerX + Math.cos(wp.phase) * wp.orbitR,
        y: wp.centerY + Math.sin(wp.phase) * wp.orbitR * 0.5,
      }
    }
  }

  if (phase === 'launched') {
    // Run simulation
    simTimer += dt
    const steps = Math.floor(simTimer / SIM_DT)
    simTimer -= steps * SIM_DT

    for (let s = 0; s < Math.min(steps, 8); s++) {
      const res = stepSat(satPos, satVel, SIM_DT)
      satPos = res.pos
      satVel = res.vel
      trail.push({ ...satPos })
      if (trail.length > 800) trail.shift()
      simStep++

      // Check waypoints
      for (const wp of waypoints) {
        if (wp.reached) continue
        const dx = satPos.x - wp.pos.x; const dy = satPos.y - wp.pos.y
        if (dx * dx + dy * dy < 28 * 28) {
          wp.reached = true
          audio.score()
          score += 10
        }
      }

      // Check if all waypoints reached
      if (waypoints.every(wp => wp.reached)) {
        phase = 'success'
        const wellBonus = (currentLevel.maxWells - wells.length) * 20
        score += 50 + wellBonus
        audio.levelUp()
        hudScore.textContent = String(score)
        reportScore(score)
        break
      }

      // Out of bounds
      if (satPos.x < -50 || satPos.x > W + 50 || satPos.y < -50 || satPos.y > H + 50) {
        phase = 'fail'
        audio.death()
        break
      }

      // Time limit
      if (simStep > 3000) {
        phase = 'fail'
        audio.death()
        break
      }
    }
  }

  draw()
  requestAnimationFrame(loop)
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function draw(): void {
  const W = canvas.width; const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  // Background starfield
  ctx.fillStyle = '#050510'
  ctx.fillRect(0, 0, W, H)

  // Star dots
  if (frameCount < 100) {
    // One-time initialization of stars in JS wouldn't persist — draw pseudo-random based on seed
  }
  for (let i = 0; i < 80; i++) {
    const x = ((i * 137.5 * W * 0.01) % W)
    const y = ((i * 97.3 * H * 0.01) % H)
    const r = i % 3 === 0 ? 1.5 : 1
    ctx.fillStyle = `rgba(200,210,255,${0.2 + (i % 5) * 0.1})`
    ctx.fillRect(x, y, r, r)
  }

  // Gravity well influence zones
  for (const w of wells) {
    const grad = ctx.createRadialGradient(w.pos.x, w.pos.y, 0, w.pos.x, w.pos.y, w.radius * 5)
    grad.addColorStop(0, `rgba(100,150,255,0.15)`)
    grad.addColorStop(1, 'rgba(100,150,255,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(w.pos.x, w.pos.y, w.radius * 5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Gravity wells
  for (const w of wells) {
    const pulse = 1 + Math.sin(frameCount * 0.06) * 0.1
    ctx.fillStyle = 'rgba(50,80,200,0.9)'
    ctx.beginPath()
    ctx.arc(w.pos.x, w.pos.y, w.radius * pulse, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#6699ff'
    ctx.lineWidth = 2
    ctx.stroke()
    // Mass label
    ctx.fillStyle = '#aaccff'
    ctx.font = `${Math.floor(w.radius * 0.7)}px Courier New`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('G', w.pos.x, w.pos.y)
    ctx.textBaseline = 'alphabetic'
    // Drag hint
    ctx.fillStyle = 'rgba(100,150,255,0.4)'
    ctx.font = '10px Courier New'
    ctx.fillText('drag', w.pos.x, w.pos.y + w.radius + 12)
  }

  // Preview trail
  if ((phase === 'preview' || phase === 'placing') && previewTrail.length > 1) {
    for (let i = 1; i < previewTrail.length; i++) {
      const alpha = (i / previewTrail.length) * 0.6
      ctx.strokeStyle = `rgba(100,200,255,${alpha})`
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(previewTrail[i - 1].x, previewTrail[i - 1].y)
      ctx.lineTo(previewTrail[i].x, previewTrail[i].y)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // Live trail
  if (trail.length > 1) {
    for (let i = 1; i < trail.length; i++) {
      const alpha = (i / trail.length) * 0.8
      const hue = (i / trail.length) * 120 + 180
      ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${alpha})`
      ctx.lineWidth = 1.5
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y)
      ctx.lineTo(trail[i].x, trail[i].y)
      ctx.stroke()
    }
  }

  // Waypoints
  for (const wp of waypoints) {
    const pulse = 1 + Math.sin(frameCount * 0.08 + wp.phase) * 0.15

    if (wp.moving) {
      // Draw orbit guide
      ctx.strokeStyle = 'rgba(255,200,50,0.15)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 5])
      ctx.beginPath()
      ctx.ellipse(wp.centerX, wp.centerY, wp.orbitR, wp.orbitR * 0.5, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    if (wp.reached) {
      ctx.fillStyle = 'rgba(100,255,100,0.4)'
      ctx.strokeStyle = '#00ff88'
    } else {
      ctx.fillStyle = `rgba(255,200,50,${0.3 * pulse})`
      ctx.strokeStyle = '#ffd700'
    }
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(wp.pos.x, wp.pos.y, 24 * pulse, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = wp.reached ? '#00ff88' : '#ffd700'
    ctx.font = 'bold 14px Courier New'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(wp.reached ? '\u2713' : '\u25cb', wp.pos.x, wp.pos.y)
    ctx.textBaseline = 'alphabetic'
  }

  // Launch point
  const lx = currentLevel.launch.x * W; const ly = currentLevel.launch.y * H
  ctx.fillStyle = 'rgba(150,255,150,0.2)'
  ctx.strokeStyle = '#88ff88'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(lx, ly, 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Velocity arrow
  const vLen = Math.sqrt(currentLevel.velocity.x ** 2 + currentLevel.velocity.y ** 2)
  const vNx = currentLevel.velocity.x / vLen * 30
  const vNy = currentLevel.velocity.y / vLen * 30
  ctx.strokeStyle = '#88ff88'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(lx, ly)
  ctx.lineTo(lx + vNx, ly + vNy)
  ctx.stroke()

  // Satellite
  if (phase === 'launched' || phase === 'success' || phase === 'fail') {
    const speed = Math.sqrt(satVel.x ** 2 + satVel.y ** 2)
    ctx.fillStyle = phase === 'fail' ? '#ff4444' : '#ffffff'
    ctx.shadowColor = '#aaccff'
    ctx.shadowBlur = phase === 'fail' ? 0 : 10
    ctx.beginPath()
    ctx.arc(satPos.x, satPos.y, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Solar panel wings
    if (phase !== 'fail') {
      const angle = Math.atan2(satVel.y, satVel.x)
      ctx.strokeStyle = '#aaccff'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(satPos.x - Math.sin(angle) * 12, satPos.y + Math.cos(angle) * 12)
      ctx.lineTo(satPos.x + Math.sin(angle) * 12, satPos.y - Math.cos(angle) * 12)
      ctx.stroke()
    }
  }

  // Placing/preview UI
  if (phase === 'placing' || phase === 'preview') {
    const btnX = W / 2; const btnY = H * 0.92

    if (wells.length > 0) {
      // Preview button
      ctx.fillStyle = phase === 'preview' ? 'rgba(100,200,100,0.9)' : 'rgba(100,150,200,0.7)'
      ctx.beginPath()
      ctx.roundRect(btnX - 160, btnY - 18, 140, 36, 6)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px Courier New'
      ctx.textAlign = 'center'
      ctx.fillText(phase === 'preview' ? 'TRAJECTORY OK' : 'PREVIEW', btnX - 90, btnY + 5)

      if (phase === 'preview') {
        ctx.fillStyle = 'rgba(100,220,100,0.9)'
        ctx.beginPath()
        ctx.roundRect(btnX + 20, btnY - 18, 140, 36, 6)
        ctx.fill()
        ctx.fillStyle = '#000'
        ctx.font = 'bold 14px Courier New'
        ctx.textAlign = 'center'
        ctx.fillText('LAUNCH!', btnX + 90, btnY + 5)
      }
    } else {
      ctx.fillStyle = 'rgba(200,200,100,0.7)'
      ctx.font = 'bold 14px Courier New'
      ctx.textAlign = 'center'
      ctx.fillText(`Click to place gravity wells (${wells.length}/${currentLevel.maxWells})`, btnX, H - 12)
    }
  }

  // Success / Fail overlays
  if (phase === 'success') {
    ctx.fillStyle = 'rgba(0,30,0,0.8)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#00ff88'
    ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText('ORBIT ACHIEVED!', W / 2, H * 0.3)
    ctx.fillStyle = '#ccc'
    ctx.font = `${Math.min(18, W * 0.038)}px Courier New`
    ctx.fillText(`+50 pts + ${(currentLevel.maxWells - wells.length) * 20} well bonus`, W / 2, H * 0.44)
    ctx.fillText(`Total: ${score}`, W / 2, H * 0.52)
    ctx.fillStyle = '#aaa'
    ctx.font = `${Math.min(15, W * 0.032)}px Courier New`
    ctx.fillText('Tap / click to continue', W / 2, H * 0.65)
  }

  if (phase === 'fail') {
    ctx.fillStyle = 'rgba(30,0,0,0.8)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#ff4444'
    ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText('LOST IN SPACE', W / 2, H * 0.3)
    ctx.fillStyle = '#ccc'
    ctx.font = `${Math.min(18, W * 0.038)}px Courier New`
    ctx.fillText('Satellite escaped orbit.', W / 2, H * 0.44)
    ctx.fillStyle = '#aaa'
    ctx.font = `${Math.min(15, W * 0.032)}px Courier New`
    ctx.fillText('Tap / click to retry', W / 2, H * 0.58)
  }

  if (phase === 'start') drawStartOverlay()
  if (phase === 'win') drawWinOverlay()
  if (phase === 'gameover') drawGameOverOverlay()
}

function drawStartOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(5,5,20,0.92)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#aaccff'
  ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('PHASE SPACE', W / 2, H * 0.2)
  ctx.fillStyle = '#aaa'
  ctx.font = `${Math.min(15, W * 0.032)}px Courier New`
  const lines = [
    'Place gravity wells to guide a satellite',
    'through all yellow waypoints.',
    'Click to place a well. Drag to move it.',
    'Preview trajectory, then LAUNCH.',
    'Fewer wells = bonus points!',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.34 + i * H * 0.072))
  drawBtn('PLAY', W / 2, H * 0.8)
}

function drawWinOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(5,5,20,0.92)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ffd700'
  ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('MASTER PILOT!', W / 2, H * 0.2)
  ctx.fillStyle = '#ccc'
  ctx.font = `${Math.min(18, W * 0.038)}px Courier New`
  ctx.fillText(`All 10 levels complete!`, W / 2, H * 0.36)
  ctx.fillText(`Final Score: ${score}`, W / 2, H * 0.44)
  ctx.fillText(`Best: ${bestScore}`, W / 2, H * 0.52)
  drawBtn('PLAY AGAIN', W / 2, H * 0.72)
}

function drawGameOverOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(5,5,20,0.92)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ff4444'
  ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('MISSION FAILED', W / 2, H * 0.25)
  ctx.fillStyle = '#ccc'
  ctx.font = `${Math.min(18, W * 0.038)}px Courier New`
  ctx.fillText(`Score: ${score} | Best: ${bestScore}`, W / 2, H * 0.42)
  drawBtn('PLAY AGAIN', W / 2, H * 0.65)
}

function drawBtn(label: string, cx: number, cy: number): void {
  const bw = 160; const bh = 44
  ctx.fillStyle = '#4488ff'
  ctx.beginPath()
  ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 8)
  ctx.fill()
  ctx.fillStyle = '#fff'
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
    hudScore.textContent = String(score)
  } catch { /* standalone */ }
  requestAnimationFrame(loop)
}

void boot()
