import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────
type BuildingType = 'home' | 'work' | 'shop'
type CameraType = 'none' | 'visible' | 'hidden'

interface Building {
  type: BuildingType
  x: number  // grid col
  y: number  // grid row
}

interface Citizen {
  id: number
  px: number  // pixel x
  py: number  // pixel y
  targetBuilding: number
  color: string
  productivity: number   // 0-1
  happiness: number      // 0-100
  crimeRisk: number      // 0-1
  inCameraRange: boolean
  protesting: boolean
}

interface GameState {
  turn: number
  order: number       // 0-100
  stability: number   // 0-100
  happiness: number   // 0-100
  cameras: { x: number, y: number, type: CameraType }[]
  score: number
  phase: 'place' | 'run' | 'gameover'
  // Upgrades unlocked
  hasHiddenCam: boolean
  hasInformant: boolean
  hasPropaganda: boolean
  // Event tracking
  discoveredHidden: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────────
const GRID = 8
const CAMERA_RANGE = 2
const MAX_CAMERAS = 5
const MAX_TURNS = 20
const CITIZEN_COUNT = 16

// Building layout (pre-defined for 8x8)
const BUILDINGS: Building[] = [
  { type: 'home',  x: 0, y: 0 }, { type: 'home',  x: 2, y: 0 }, { type: 'home',  x: 4, y: 0 }, { type: 'home',  x: 6, y: 0 },
  { type: 'work',  x: 1, y: 2 }, { type: 'work',  x: 3, y: 2 }, { type: 'work',  x: 5, y: 2 }, { type: 'work',  x: 7, y: 2 },
  { type: 'shop',  x: 0, y: 4 }, { type: 'shop',  x: 2, y: 4 }, { type: 'shop',  x: 4, y: 4 }, { type: 'shop',  x: 6, y: 4 },
  { type: 'home',  x: 1, y: 6 }, { type: 'home',  x: 3, y: 6 }, { type: 'home',  x: 5, y: 6 }, { type: 'home',  x: 7, y: 6 },
]

const CITIZEN_COLORS = ['#60a5fa','#34d399','#f59e0b','#a78bfa','#fb7185','#38bdf8','#4ade80','#facc15']

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const canvasWrap = document.getElementById('canvas-wrap') as HTMLDivElement

let cellSize = 50

function resizeCanvas(): void {
  const avail = Math.min(
    (canvasWrap.clientWidth || window.innerWidth) - 10,
    window.innerHeight - 120
  )
  cellSize = Math.floor(avail / GRID)
  canvas.width = cellSize * GRID
  canvas.height = cellSize * GRID
}

// ── State ──────────────────────────────────────────────────────────────────────
const state: GameState = {
  turn: 1, order: 100, stability: 100, happiness: 100,
  cameras: [], score: 0, phase: 'place',
  hasHiddenCam: false, hasInformant: false, hasPropaganda: false,
  discoveredHidden: false,
}

let citizens: Citizen[] = []
let bestScore = 0
let animTick = 0

// ── Citizens setup ─────────────────────────────────────────────────────────────
function initCitizens(): void {
  citizens = []
  for (let i = 0; i < CITIZEN_COUNT; i++) {
    const homeBuildings = BUILDINGS.filter(b => b.type === 'home')
    const home = homeBuildings[i % homeBuildings.length]
    citizens.push({
      id: i,
      px: (home.x + 0.5) * cellSize + (Math.random() - 0.5) * cellSize * 0.4,
      py: (home.y + 0.5) * cellSize + (Math.random() - 0.5) * cellSize * 0.4,
      targetBuilding: Math.floor(Math.random() * BUILDINGS.length),
      color: CITIZEN_COLORS[i % CITIZEN_COLORS.length],
      productivity: 1,
      happiness: 100,
      crimeRisk: 0,
      inCameraRange: false,
      protesting: false,
    })
  }
}

// ── Camera logic ───────────────────────────────────────────────────────────────
function isCellInCameraRange(cellX: number, cellY: number): boolean {
  for (const cam of state.cameras) {
    const dx = Math.abs(cam.x - cellX)
    const dy = Math.abs(cam.y - cellY)
    if (dx <= CAMERA_RANGE && dy <= CAMERA_RANGE) return true
  }
  return false
}

function updateCitizenCameraStatus(): void {
  for (const c of citizens) {
    const cellX = Math.floor(c.px / cellSize)
    const cellY = Math.floor(c.py / cellSize)
    c.inCameraRange = isCellInCameraRange(cellX, cellY)
  }
}

// ── Turn processing ────────────────────────────────────────────────────────────
function processTurn(): void {
  updateCitizenCameraStatus()

  let totalCrime = 0
  let totalHappiness = 0
  let totalProductivity = 0

  for (const c of citizens) {
    if (c.protesting) { c.protesting = false }

    if (c.inCameraRange) {
      c.productivity = 1.2
      c.crimeRisk = 0
      // Hidden cameras: no happiness penalty (unless discovered)
      const isVisible = state.cameras.some(cam => {
        const cx = Math.floor(c.px / cellSize), cy = Math.floor(c.py / cellSize)
        return Math.abs(cam.x - cx) <= CAMERA_RANGE && Math.abs(cam.y - cy) <= CAMERA_RANGE && cam.type === 'visible'
      })
      if (isVisible) c.happiness = Math.max(0, c.happiness - 15)
      else if (state.discoveredHidden) c.happiness = Math.max(0, c.happiness - 25)
    } else {
      c.productivity = 1.0
      c.crimeRisk = 0.1
      c.happiness = Math.min(100, c.happiness + 5)
    }

    if (state.hasInformant) c.crimeRisk *= 0.5
    if (state.hasPropaganda) c.happiness = Math.min(100, c.happiness + 8)

    // Crime roll
    if (Math.random() < c.crimeRisk) {
      totalCrime++
      c.crimeRisk = 0  // crime happened, reset
    }

    totalHappiness += c.happiness
    totalProductivity += c.productivity
  }

  // Update state metrics
  const crimeRate = (totalCrime / CITIZEN_COUNT) * 100
  state.order = Math.max(0, Math.min(100, state.order - crimeRate * 2 + (state.hasInformant ? 5 : 0)))
  state.happiness = Math.min(100, totalHappiness / CITIZEN_COUNT)
  // Stability: penalized by unrest
  const unrest = citizens.filter(c => c.happiness < 40).length / CITIZEN_COUNT
  state.stability = Math.max(0, Math.min(100, state.stability - unrest * 20 + (state.hasPropaganda ? 3 : 0)))

  // Event every 3 turns
  if (state.turn % 3 === 0) triggerEvent()

  state.score += Math.round((state.order + state.stability + state.happiness) / 3)

  if (state.turn >= MAX_TURNS) {
    finishGame()
    return
  }

  state.turn++
  reportScore(state.score)
  updateHUD()
  audio.blip()
}

type GameEvent = 'protest' | 'sabotage' | 'underground' | 'discovery'

function triggerEvent(): void {
  const events: GameEvent[] = ['protest', 'sabotage', 'underground']

  // Discovery event if hidden cameras placed
  if (state.cameras.some(c => c.type === 'hidden') && !state.discoveredHidden && Math.random() < 0.4) {
    events.push('discovery')
  }

  const event = events[Math.floor(Math.random() * events.length)]

  switch (event) {
    case 'protest':
      // Citizens in camera zones refuse to work for 1 turn
      for (const c of citizens) {
        if (c.inCameraRange) { c.protesting = true; c.productivity = 0 }
      }
      logEvent('PROTEST: Camera zone workers refuse to work!')
      audio.death()
      break
    case 'sabotage':
      if (state.cameras.length > 0) {
        const idx = Math.floor(Math.random() * state.cameras.length)
        state.cameras.splice(idx, 1)
        logEvent('SABOTAGE: A camera was destroyed!')
        audio.death()
      }
      break
    case 'underground':
      for (const c of citizens) {
        if (!c.inCameraRange) c.crimeRisk = Math.min(1, c.crimeRisk + 0.3)
      }
      state.order = Math.max(0, state.order - 15)
      logEvent('UNDERGROUND: Crime spike in uncovered zones!')
      audio.death()
      break
    case 'discovery':
      state.discoveredHidden = true
      state.stability = Math.max(0, state.stability - 30)
      for (const c of citizens) c.happiness = Math.max(0, c.happiness - 20)
      logEvent('DISCOVERY: Hidden cameras exposed! Mass unrest!')
      audio.death()
      break
  }
}

function logEvent(text: string): void {
  const log = document.getElementById('event-log')!
  const div = document.createElement('div')
  div.className = 'event-item'
  div.textContent = `T${state.turn}: ${text}`
  div.setAttribute('style', 'color:#fbbf24')
  log.insertBefore(div, log.firstChild)
  if (log.children.length > 8) log.removeChild(log.lastChild!)
}

// ── Upgrades ───────────────────────────────────────────────────────────────────
document.getElementById('btn-hidden')!.addEventListener('click', () => {
  if (state.hasHiddenCam) return
  state.hasHiddenCam = true
  ;(document.getElementById('btn-hidden') as HTMLButtonElement).disabled = true
  ;(document.getElementById('btn-hidden') as HTMLElement).textContent = 'Hidden: UNLOCKED'
  logEvent('Unlocked: Hidden cameras')
  audio.powerup()
})

document.getElementById('btn-informant')!.addEventListener('click', () => {
  if (state.hasInformant) return
  state.hasInformant = true
  ;(document.getElementById('btn-informant') as HTMLButtonElement).disabled = true
  ;(document.getElementById('btn-informant') as HTMLElement).textContent = 'Informant: ACTIVE'
  logEvent('Unlocked: Informant network')
  audio.powerup()
})

document.getElementById('btn-propaganda')!.addEventListener('click', () => {
  if (state.hasPropaganda) return
  state.hasPropaganda = true
  ;(document.getElementById('btn-propaganda') as HTMLButtonElement).disabled = true
  ;(document.getElementById('btn-propaganda') as HTMLElement).textContent = 'Propaganda: ACTIVE'
  logEvent('Unlocked: State propaganda')
  audio.powerup()
})

document.getElementById('btn-next-turn')!.addEventListener('click', () => {
  if (state.phase === 'place') processTurn()
})

// ── Input ──────────────────────────────────────────────────────────────────────
function getCellFromEvent(e: MouseEvent | TouchEvent): [number, number] | null {
  const rect = canvas.getBoundingClientRect()
  let clientX: number, clientY: number
  if (e instanceof TouchEvent) {
    if (e.touches.length === 0) return null
    clientX = e.touches[0].clientX; clientY = e.touches[0].clientY
  } else { clientX = (e as MouseEvent).clientX; clientY = (e as MouseEvent).clientY }
  const x = clientX - rect.left, y = clientY - rect.top
  const c = Math.floor(x / cellSize), r = Math.floor(y / cellSize)
  if (r < 0 || r >= GRID || c < 0 || c >= GRID) return null
  return [r, c]
}

canvas.addEventListener('click', (e) => {
  if (state.phase !== 'place') return
  const pos = getCellFromEvent(e)
  if (!pos) return
  const [r, c] = pos

  // Check if camera already here
  const existing = state.cameras.findIndex(cam => cam.x === c && cam.y === r)
  if (existing >= 0) {
    state.cameras.splice(existing, 1)
    audio.click()
    return
  }
  if (state.cameras.length >= MAX_CAMERAS) return

  const camType: CameraType = state.hasHiddenCam && e.shiftKey ? 'hidden' : 'visible'
  state.cameras.push({ x: c, y: r, type: camType })
  audio.blip()
  updateHUD()
})

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  if (state.phase !== 'place') return
  const pos = getCellFromEvent(e)
  if (!pos) return
  const [r, c] = pos
  const existing = state.cameras.findIndex(cam => cam.x === c && cam.y === r)
  if (existing >= 0) { state.cameras.splice(existing, 1); audio.click(); return }
  if (state.cameras.length >= MAX_CAMERAS) return
  state.cameras.push({ x: c, y: r, type: 'visible' })
  audio.blip()
  updateHUD()
}, { passive: false })

// ── HUD ────────────────────────────────────────────────────────────────────────
function updateHUD(): void {
  setEl('hud-turn', `${state.turn}/${MAX_TURNS}`)
  setEl('hud-order', state.order.toFixed(0))
  setEl('hud-stability', state.stability.toFixed(0))
  setEl('hud-happiness', state.happiness.toFixed(0))
  setEl('hud-cameras', `${state.cameras.length}/${MAX_CAMERAS}`)
  setEl('hud-score', String(state.score))

  const crimeRate = citizens.filter(c => c.crimeRisk > 0).length / CITIZEN_COUNT
  const unrest = citizens.filter(c => c.happiness < 40).length / CITIZEN_COUNT
  const prodAvg = citizens.reduce((s, c) => s + c.productivity, 0) / CITIZEN_COUNT
  setEl('metric-crime', `${(crimeRate * 100).toFixed(0)}%`)
  setEl('metric-unrest', `${(unrest * 100).toFixed(0)}%`)
  setEl('metric-prod', `${(prodAvg * 100).toFixed(0)}%`)
}

function setEl(id: string, text: string): void {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

// ── Rendering ──────────────────────────────────────────────────────────────────
function draw(): void {
  animTick++
  updateCitizenCameraStatus()

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const cs = cellSize

  // Draw grid cells
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const x = c * cs, y = r * cs
      const inRange = isCellInCameraRange(c, r)

      ctx.fillStyle = inRange ? 'rgba(34,211,238,0.06)' : '#111827'
      ctx.fillRect(x, y, cs, cs)

      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 0.5
      ctx.strokeRect(x, y, cs, cs)
    }
  }

  // Draw buildings
  for (const bldg of BUILDINGS) {
    const x = bldg.x * cs + cs * 0.1
    const y = bldg.y * cs + cs * 0.1
    const w = cs * 0.8, h = cs * 0.8

    const colors: Record<BuildingType, string> = {
      home: '#1e3a5f', work: '#1a3a2a', shop: '#3a2a1a'
    }
    ctx.fillStyle = colors[bldg.type]
    ctx.fillRect(x, y, w, h)

    const borderColors: Record<BuildingType, string> = {
      home: '#3b82f6', work: '#22c55e', shop: '#f59e0b'
    }
    ctx.strokeStyle = borderColors[bldg.type]
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, w, h)

    const icons: Record<BuildingType, string> = { home: 'H', work: 'W', shop: 'S' }
    ctx.fillStyle = borderColors[bldg.type]
    ctx.font = `bold ${cs * 0.3}px Courier New`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(icons[bldg.type], bldg.x * cs + cs / 2, bldg.y * cs + cs / 2)
  }

  // Draw camera ranges
  for (const cam of state.cameras) {
    const cx = cam.x * cs + cs / 2
    const cy = cam.y * cs + cs / 2
    const range = (CAMERA_RANGE + 0.5) * cs

    const isHiddenCam = cam.type === 'hidden'
    const alpha = 0.08 + 0.04 * Math.sin(animTick * 0.05)
    ctx.fillStyle = isHiddenCam ? `rgba(168,85,247,${alpha})` : `rgba(34,211,238,${alpha})`
    ctx.beginPath()
    ctx.arc(cx, cy, range, 0, Math.PI * 2)
    ctx.fill()
  }

  // Draw cameras
  for (const cam of state.cameras) {
    const cx = cam.x * cs + cs / 2
    const cy = cam.y * cs + cs / 2
    const isHiddenCam = cam.type === 'hidden'

    if (isHiddenCam) {
      // Hidden camera — smaller, purple, subtle
      ctx.fillStyle = '#7c3aed'
      ctx.beginPath()
      ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.fill()
      if (state.discoveredHidden) {
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    } else {
      // Visible camera — cyan square with lens
      ctx.fillStyle = '#22d3ee'
      ctx.fillRect(cx - 7, cy - 5, 14, 10)
      ctx.fillStyle = '#0c4a6e'
      ctx.beginPath()
      ctx.arc(cx + 2, cy, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#22d3ee'
      ctx.fillRect(cx - 12, cy - 3, 5, 6)  // lens body
    }
  }

  // Move citizens
  for (const c of citizens) {
    const target = BUILDINGS[c.targetBuilding]
    const tx = (target.x + 0.5) * cs
    const ty = (target.y + 0.5) * cs
    const dx = tx - c.px, dy = ty - c.py
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 3) {
      const speed = c.protesting ? 0.5 : 1.5
      c.px += (dx / dist) * speed
      c.py += (dy / dist) * speed
    } else if (Math.random() < 0.01) {
      c.targetBuilding = Math.floor(Math.random() * BUILDINGS.length)
    }
  }

  // Draw citizens
  for (const c of citizens) {
    const r2 = 4
    ctx.beginPath()
    ctx.arc(c.px, c.py, r2, 0, Math.PI * 2)
    ctx.fillStyle = c.protesting ? '#ef4444' : c.color
    ctx.fill()

    if (c.inCameraRange) {
      ctx.strokeStyle = 'rgba(34,211,238,0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Happiness indicator dot
    if (c.happiness < 40) {
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(c.px + 5, c.py - 5, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// ── Finish ─────────────────────────────────────────────────────────────────────
function finishGame(): void {
  state.phase = 'gameover'
  const finalScore = state.score

  if (finalScore > bestScore) {
    bestScore = finalScore
    saveBestScore(bestScore)
  }

  reportGameOver(finalScore)
  audio.levelUp()
  showGameOverOverlay(finalScore)
}

// ── Overlay helpers ────────────────────────────────────────────────────────────
const overlay = document.getElementById('overlay') as HTMLElement

function clearOverlay(): void {
  while (overlay.firstChild) overlay.removeChild(overlay.firstChild)
}

function makeOverlayBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.addEventListener('click', onClick)
  return btn
}

function makeEl(tag: string, text: string, style?: string): HTMLElement {
  const el = document.createElement(tag)
  el.textContent = text
  if (style) el.setAttribute('style', style)
  return el
}

function showGameOverOverlay(score: number): void {
  clearOverlay()
  overlay.appendChild(makeEl('h1', 'Surveillance Complete', 'color:#22d3ee'))
  overlay.appendChild(makeEl('p', `Order: ${state.order.toFixed(0)}% | Stability: ${state.stability.toFixed(0)}% | Happiness: ${state.happiness.toFixed(0)}%`))
  overlay.appendChild(makeEl('div', String(score), 'font-size:clamp(32px,7vw,56px);color:#22d3ee;font-weight:bold'))
  overlay.appendChild(makeEl('p', `Best: ${bestScore}`, 'color:#888'))
  overlay.appendChild(makeOverlayBtn('Play Again', () => {
    overlay.style.display = 'none'
    restartGame()
  }))
  overlay.style.display = 'flex'
}

function restartGame(): void {
  state.turn = 1; state.order = 100; state.stability = 100; state.happiness = 100
  state.cameras = []; state.score = 0; state.phase = 'place'
  state.hasHiddenCam = false; state.hasInformant = false; state.hasPropaganda = false
  state.discoveredHidden = false
  ;(document.getElementById('btn-hidden') as HTMLButtonElement).disabled = false
  ;(document.getElementById('btn-hidden') as HTMLElement).textContent = 'Hidden Cam (-H)'
  ;(document.getElementById('btn-informant') as HTMLButtonElement).disabled = false
  ;(document.getElementById('btn-informant') as HTMLElement).textContent = 'Informant (+O)'
  ;(document.getElementById('btn-propaganda') as HTMLButtonElement).disabled = false
  ;(document.getElementById('btn-propaganda') as HTMLElement).textContent = 'Propaganda (+S)'
  const log = document.getElementById('event-log')!
  while (log.firstChild) log.removeChild(log.firstChild)
  initCitizens()
  updateHUD()
}

// ── Start overlay ──────────────────────────────────────────────────────────────
document.getElementById('overlay-btn')!.addEventListener('click', () => {
  overlay.style.display = 'none'
  audio.start()
})

// ── Mute ───────────────────────────────────────────────────────────────────────
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '\uD83D\uDD07' : '\uD83D\uDD0A'
})

// ── Main loop ──────────────────────────────────────────────────────────────────
function mainLoop(): void {
  draw()
  updateHUD()
  requestAnimationFrame(mainLoop)
}

// ── Boot ───────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  try {
    const { bestScore: saved } = await initSDK('panopticon')
    bestScore = saved
  } catch {
    // standalone
  }

  initCitizens()
  updateHUD()
  requestAnimationFrame(mainLoop)
}

void boot()
