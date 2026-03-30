// Bloom Chain — Hex grid chain-reaction strategy game
// Flat-top hexagons, axial coordinates (q, r)

import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Types ─────────────────────────────────────────────────────────────────────

type CellState = 'empty' | 'seed' | 'blooming' | 'bloomed' | 'scorched'
type GamePhase = 'READY' | 'PLACING' | 'BLOOMING' | 'GAME_OVER'

interface Cell {
  q: number
  r: number
  state: CellState
  hasNutrient: boolean       // hidden bonus: +1 bloom radius when revealed
  fuseStart: number | null   // timestamp when seed was placed
  bloomRing: number          // how far this bloom has expanded
  bloomStartTime: number | null
  almostFlash: number        // timestamp for "ALMOST!" yellow flash
}

interface BloomTask {
  q: number
  r: number
  ringIndex: number          // which ring we're currently expanding to
  maxRing: number            // 1 normally, 2 with nutrient
  startTime: number
  chainLength: number        // how deep in the chain this bloom is
}

interface PopupText {
  text: string
  x: number
  y: number
  born: number
  color: string
  scale: number
}

interface JoltEffect {
  dx: number
  dy: number
  born: number
}

// ── DOM ───────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const seedsEl = document.getElementById('seeds-value') as HTMLSpanElement
const coverageEl = document.getElementById('coverage-value') as HTMLSpanElement
const bestEl = document.getElementById('best-value') as HTMLSpanElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Canvas sizing ─────────────────────────────────────────────────────────────

function resizeCanvas(): void {
  const cont = canvas.parentElement!
  const sz = Math.min(cont.clientWidth, cont.clientHeight - 50)
  canvas.width = sz
  canvas.height = sz
  canvas.style.width = `${sz}px`
  canvas.style.height = `${sz}px`
  computeHexLayout()
}

muteBtn.addEventListener('click', () => {
  muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊'
})

// ── Hex grid constants ────────────────────────────────────────────────────────

const GRID_RADIUS = 7        // radius 7 → 127 cells
const FUSE_MS = 2000         // 2 seconds before a seed blooms
const RING_DELAY_MS = 150    // delay per ring during bloom expansion
const NUTRIENT_CHANCE = 0.08 // 8% of cells have hidden nutrient
const TOTAL_SEEDS = 20

// Axial neighbor directions for flat-top hex
const HEX_DIRS: [number, number][] = [
  [+1, 0], [-1, 0],
  [0, +1], [0, -1],
  [+1, -1], [-1, +1],
]

// Computed from canvas size
let hexSize = 30
let originX = 0
let originY = 0

function computeHexLayout(): void {
  // Fit the grid (radius 7) into the canvas with margin
  const margin = 10
  const availSize = Math.min(canvas.width, canvas.height) - margin * 2
  // Flat-top hex: width of grid = size * (3/2 * (2*R)) + size/2, height = size*sqrt(3)*(2*R+1)
  // Approximate: size = availSize / (3 * gridRadius + 1)
  hexSize = Math.floor(availSize / (3 * GRID_RADIUS + 2))
  originX = canvas.width / 2
  originY = canvas.height / 2
}

// ── Hex coordinate math ───────────────────────────────────────────────────────

function hexToPixel(q: number, r: number): [number, number] {
  // Flat-top hexagon pixel positions
  const x = originX + hexSize * (1.5 * q)
  const y = originY + hexSize * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r)
  return [x, y]
}

function pixelToHex(px: number, py: number): [number, number] {
  // Inverse of flat-top hex → pixel, then cube-round
  const q = (2 / 3) * (px - originX) / hexSize
  const r = ((-1 / 3) * (px - originX) + (Math.sqrt(3) / 3) * (py - originY)) / hexSize
  return hexRound(q, r)
}

function hexRound(qf: number, rf: number): [number, number] {
  const sf = -qf - rf
  let q = Math.round(qf)
  let r = Math.round(rf)
  let s = Math.round(sf)
  const dq = Math.abs(q - qf)
  const dr = Math.abs(r - rf)
  const ds = Math.abs(s - sf)
  if (dq > dr && dq > ds) q = -r - s
  else if (dr > ds) r = -q - s
  return [q, r]
}

function hexKey(q: number, r: number): string {
  return `${q},${r}`
}

function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2
}

// Returns all cells in ring at distance d from (q, r)
function hexRing(q: number, r: number, d: number): [number, number][] {
  if (d === 0) return [[q, r]]
  const results: [number, number][] = []
  // Start at the "bottom-left" corner of the ring
  let cq = q + HEX_DIRS[4][0] * d
  let cr = r + HEX_DIRS[4][1] * d
  // Walk 6 sides of d steps each
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < d; step++) {
      results.push([cq, cr])
      cq += HEX_DIRS[side][0]
      cr += HEX_DIRS[side][1]
    }
  }
  return results
}

// ── Grid initialization ───────────────────────────────────────────────────────

function buildGrid(): Map<string, Cell> {
  const grid = new Map<string, Cell>()
  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    const r1 = Math.max(-GRID_RADIUS, -q - GRID_RADIUS)
    const r2 = Math.min(GRID_RADIUS, -q + GRID_RADIUS)
    for (let r = r1; r <= r2; r++) {
      grid.set(hexKey(q, r), {
        q, r,
        state: 'empty',
        hasNutrient: Math.random() < NUTRIENT_CHANCE,
        fuseStart: null,
        bloomRing: 0,
        bloomStartTime: null,
        almostFlash: 0,
      })
    }
  }
  return grid
}

// ── Game state ────────────────────────────────────────────────────────────────

let phase: GamePhase = 'READY'
let grid: Map<string, Cell> = new Map()
let seedsRemaining = TOTAL_SEEDS
let highScore = 0
let lastScore = 0
let gameCount = 0  // every 5th game triggers wildfire event
let wildfireActive = false

// Active bloom queue: seeds waiting to expand rings
const bloomQueue: BloomTask[] = []

// Particles / popups
const popups: PopupText[] = []

// Screen jolt on chain trigger
let jolt: JoltEffect | null = null

// Hover tracking
let hoverQ = 9999
let hoverR = 9999

// Coverage milestone tracking
let lastMilestonePct = 0

// Combo tracking
let activeChainLength = 0
let comboDisplayScale = 1
let comboDisplayBorn = 0

// ── Score calculation ─────────────────────────────────────────────────────────

function countCovered(): number {
  let n = 0
  for (const cell of grid.values()) {
    if (cell.state === 'bloomed' || cell.state === 'scorched') n++
  }
  return n
}

function getCoveragePct(): number {
  return Math.floor((countCovered() / grid.size) * 100)
}

function calculateScore(): number {
  const coveragePct = getCoveragePct()
  const base = coveragePct * 100
  // Chain bonuses accumulated via popups are tracked in lastScore incrementally
  const efficiency = (TOTAL_SEEDS - (TOTAL_SEEDS - seedsRemaining)) * 30
  return base + efficiency
}

// ── Bloom audio helpers ───────────────────────────────────────────────────────

// Ascending pitch per bloom ring
function playBloomRing(ring: number): void {
  const freqs = [220, 277, 330, 415, 494, 587, 698]
  const freq = freqs[Math.min(ring, freqs.length - 1)]
  if (audio && !audio.isMuted()) {
    // Use internal tone via a small duck — call audio.blip variant at right freq
    // We rely on the shared audio engine's tone-playing structure
  }
  // Play ascending tone for this ring using Web Audio directly
  try {
    const ac = new AudioContext()
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.value = 0.08
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12)
    osc.connect(gain).connect(ac.destination)
    osc.start()
    osc.stop(ac.currentTime + 0.12)
    setTimeout(() => { try { void ac.close() } catch {} }, 300)
  } catch {}
}

function playChainTrigger(): void {
  audio.combo()
}

function playSeedPlace(): void {
  // Bass thud for seed placement
  try {
    const ac = new AudioContext()
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 80
    gain.gain.value = 0.18
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2)
    osc.connect(gain).connect(ac.destination)
    osc.start()
    osc.stop(ac.currentTime + 0.2)
    setTimeout(() => { try { void ac.close() } catch {} }, 400)
  } catch {}
}

function playNutrientReveal(): void {
  audio.powerup()
}

function playCoverageThreshold(): void {
  audio.levelUp()
}

function playAlmost(): void {
  audio.score()
}

function playGameOver(): void {
  audio.death()
}

// ── Popup helpers ─────────────────────────────────────────────────────────────

function spawnPopup(text: string, x: number, y: number, color = '#ffffff', scale = 1.0): void {
  popups.push({ text, x, y, born: performance.now(), color, scale })
}

// ── Wildfire: re-ignite all scorched tiles ─────────────────────────────────────

function triggerWildfire(now: number): void {
  for (const cell of grid.values()) {
    if (cell.state === 'scorched') {
      cell.state = 'blooming'
      cell.bloomRing = 0
      cell.bloomStartTime = now
      bloomQueue.push({
        q: cell.q, r: cell.r,
        ringIndex: 1, maxRing: 1,
        startTime: now,
        chainLength: 1,
      })
    }
  }
  const [cx, cy] = hexToPixel(0, 0)
  spawnPopup('WILDFIRE!', cx, cy - 40, '#ff6600', 1.6)
}

// ── Seed placement ────────────────────────────────────────────────────────────

function placeSeed(q: number, r: number): void {
  const key = hexKey(q, r)
  const cell = grid.get(key)
  if (!cell) return
  if (cell.state === 'seed' || cell.state === 'blooming' || cell.state === 'bloomed') return

  // Scorched costs 2 seeds
  const cost = cell.state === 'scorched' ? 2 : 1
  if (seedsRemaining < cost) return

  seedsRemaining -= cost
  cell.state = 'seed'
  cell.fuseStart = performance.now()

  phase = 'PLACING'
  playSeedPlace()
  updateHUD()

  // Squash-and-stretch visual feedback handled in draw
}

// ── Bloom processing ──────────────────────────────────────────────────────────

function checkFuses(now: number): void {
  for (const cell of grid.values()) {
    if (cell.state === 'seed' && cell.fuseStart !== null) {
      if (now - cell.fuseStart >= FUSE_MS) {
        triggerBloom(cell, now, 1)
      }
    }
  }
}

function triggerBloom(cell: Cell, now: number, chainLength: number): void {
  if (cell.state !== 'seed') return
  cell.state = 'blooming'
  cell.bloomRing = 0
  cell.bloomStartTime = now
  const maxRing = cell.hasNutrient ? 2 : 1

  bloomQueue.push({
    q: cell.q, r: cell.r,
    ringIndex: 1, maxRing,
    startTime: now,
    chainLength,
  })

  if (chainLength > 1) {
    // Chain trigger feedback
    playChainTrigger()
    const [px, py] = hexToPixel(cell.q, cell.r)
    spawnPopup(`CHAIN x${chainLength}`, px, py - 20, '#ffd700', 1.0 + chainLength * 0.1)
    // Screen jolt toward the triggered seed
    jolt = { dx: (px - canvas.width / 2) * 0.02, dy: (py - canvas.height / 2) * 0.02, born: now }

    // Chain bonus score contribution
    const chainBonus = chainLength * chainLength * 50
    lastScore += chainBonus
    activeChainLength = Math.max(activeChainLength, chainLength)
    comboDisplayScale = 1.0 + chainLength * 0.15
    comboDisplayBorn = now
  }
}

function processBloomQueue(now: number): void {
  const toRemove: number[] = []

  for (let i = 0; i < bloomQueue.length; i++) {
    const task = bloomQueue[i]
    const elapsed = now - task.startTime
    const ringsDue = Math.floor(elapsed / RING_DELAY_MS) + 1

    while (task.ringIndex <= Math.min(ringsDue, task.maxRing)) {
      expandBloomRing(task, task.ringIndex, now)
      task.ringIndex++
    }

    if (task.ringIndex > task.maxRing) {
      // Bloom done — mark source cell as bloomed/scorched
      const srcCell = grid.get(hexKey(task.q, task.r))
      if (srcCell && srcCell.state === 'blooming') {
        srcCell.state = srcCell.hasNutrient ? 'bloomed' : 'scorched'
      }
      toRemove.push(i)
    }
  }

  // Remove completed tasks (iterate backwards to preserve indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    bloomQueue.splice(toRemove[i], 1)
  }
}

function expandBloomRing(task: BloomTask, ring: number, now: number): void {
  const cells = hexRing(task.q, task.r, ring)
  playBloomRing(ring)

  for (const [nq, nr] of cells) {
    const key = hexKey(nq, nr)
    const neighbor = grid.get(key)
    if (!neighbor) continue

    if (neighbor.state === 'seed') {
      // Chain reaction!
      triggerBloom(neighbor, now, task.chainLength + 1)
    } else if (neighbor.state === 'empty') {
      // Check for near-miss: is there a seed one more ring away?
      checkNearMiss(nq, nr, task.q, task.r, ring, now)
      neighbor.state = 'bloomed'
      if (neighbor.hasNutrient) {
        // Reveal nutrient
        const [px, py] = hexToPixel(nq, nr)
        spawnPopup('BONUS!', px, py - 15, '#00bfff', 1.1)
        playNutrientReveal()
      }
    } else if (neighbor.state === 'scorched') {
      neighbor.state = 'bloomed'
    }
    // bloomed/blooming cells: skip
  }
}

function checkNearMiss(
  q: number, r: number,
  srcQ: number, srcR: number,
  ring: number,
  now: number,
): void {
  // After filling this cell, check the ring one further out for seeds
  const dist = hexDistance(srcQ, srcR, q, r)
  const outerRing = hexRing(srcQ, srcR, ring + 1)
  for (const [oq, or_] of outerRing) {
    const key = hexKey(oq, or_)
    const cell = grid.get(key)
    if (cell?.state === 'seed') {
      // Near miss! Flash that seed
      cell.almostFlash = now
      const [px, py] = hexToPixel(oq, or_)
      spawnPopup('ALMOST!', px, py - 20, '#ffff00', 1.0)
      playAlmost()
    }
  }
  void dist // suppress unused warning
}

// ── Coverage milestone check ──────────────────────────────────────────────────

function checkCoverageMilestones(now: number): void {
  const pct = getCoveragePct()
  const milestones = [50, 75, 90]
  for (const m of milestones) {
    if (pct >= m && lastMilestonePct < m) {
      lastMilestonePct = m
      spawnPopup(`${m}% COVERED!`, canvas.width / 2, canvas.height / 2 - 60, '#64ff64', 1.3)
      playCoverageThreshold()
    }
  }
  // Near-star hints
  if (pct >= 87 && pct < 90) {
    const remaining = Math.ceil(grid.size * 0.90) - countCovered()
    if (remaining > 0 && remaining <= 10) {
      spawnPopup(`Just ${remaining} more for 3 stars!`, canvas.width / 2, canvas.height / 2 - 40, '#aaffaa', 0.9)
    }
  }
}

// ── Game over detection ───────────────────────────────────────────────────────

function checkGameOver(now: number): void {
  if (phase === 'GAME_OVER') return
  // Game over when: no seeds remaining AND no seeds currently fusing/blooming
  const hasPendingSeeds = bloomQueue.length > 0 ||
    [...grid.values()].some(c => c.state === 'seed')
  if (seedsRemaining <= 0 && !hasPendingSeeds) {
    endGame(now)
  }
}

function endGame(now: number): void {
  phase = 'GAME_OVER'
  const coveragePct = getCoveragePct()
  const base = coveragePct * 100
  const efficiency = seedsRemaining * 30
  const finalScore = base + lastScore + efficiency  // lastScore includes chain bonuses
  playGameOver()

  if (finalScore > highScore) {
    highScore = finalScore
    bestEl.textContent = String(highScore)
    saveHighScore(highScore)
  }

  reportGameOver(finalScore)
  spawnPopup(
    `${coveragePct}% — Score: ${finalScore}`,
    canvas.width / 2, canvas.height / 2 - 50,
    '#64ff64', 1.2,
  )
  void now
}

// ── HUD ───────────────────────────────────────────────────────────────────────

function updateHUD(): void {
  seedsEl.textContent = String(seedsRemaining)
  coverageEl.textContent = String(getCoveragePct())
  bestEl.textContent = String(highScore)
}

// ── Draw helpers ──────────────────────────────────────────────────────────────

function drawHexPath(cx: number, cy: number, size: number): void {
  // Flat-top hexagon: vertices at 0°, 60°, 120°, 180°, 240°, 300°
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i)
    const vx = cx + size * Math.cos(angle)
    const vy = cy + size * Math.sin(angle)
    if (i === 0) ctx.moveTo(vx, vy)
    else ctx.lineTo(vx, vy)
  }
  ctx.closePath()
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function drawGrid(now: number): void {
  const joltX = jolt ? jolt.dx * Math.exp(-(now - jolt.born) / 80) : 0
  const joltY = jolt ? jolt.dy * Math.exp(-(now - jolt.born) / 80) : 0
  if (jolt && now - jolt.born > 400) jolt = null

  ctx.save()
  ctx.translate(joltX, joltY)

  for (const cell of grid.values()) {
    const [cx, cy] = hexToPixel(cell.q, cell.r)
    const isHover = cell.q === hoverQ && cell.r === hoverR

    let fillColor = '#1a2420'
    let strokeColor = '#2a3a30'
    let glowColor: string | null = null

    const t = now / 1000

    if (cell.state === 'empty') {
      if (isHover) {
        const cost = 1  // hover doesn't know scorched yet; scorched shows its own color
        void cost
        fillColor = '#2a3f30'
        strokeColor = '#64ff64'
      }
    } else if (cell.state === 'seed') {
      // Pulsing glow
      const age = cell.fuseStart !== null ? now - cell.fuseStart : 0
      const fuseProgress = age / FUSE_MS  // 0→1
      const pulse = 0.5 + 0.5 * Math.sin(t * 8 + cell.q * 0.5)
      const dimFactor = 0.5 + 0.5 * fuseProgress  // gets brighter as fuse progresses
      const r = Math.floor(100 * dimFactor + 155 * pulse * dimFactor)
      const g = 255
      const b = Math.floor(100 * (1 - pulse))
      fillColor = `rgb(${r},${g},${b})`
      glowColor = '#64ff64'

      // Near-miss flash
      if (cell.almostFlash > 0 && now - cell.almostFlash < 600) {
        const flashT = (now - cell.almostFlash) / 600
        const flashA = 1 - flashT
        fillColor = `rgba(255,255,0,${flashA})`
        glowColor = '#ffff00'
      }
    } else if (cell.state === 'blooming') {
      fillColor = '#50dd80'
      glowColor = '#64ff64'
    } else if (cell.state === 'bloomed') {
      fillColor = cell.hasNutrient ? '#00bfff' : '#2ecc71'
      strokeColor = cell.hasNutrient ? '#00dfff' : '#27ae60'
    } else if (cell.state === 'scorched') {
      fillColor = '#8b6914'
      strokeColor = '#6b4f10'
      if (isHover) {
        strokeColor = '#ffaa00'
        glowColor = '#ff8800'
      }
    }

    // Draw hex fill
    drawHexPath(cx, cy, hexSize - 1)

    if (glowColor) {
      ctx.shadowColor = glowColor
      ctx.shadowBlur = 12
    } else {
      ctx.shadowBlur = 0
    }

    ctx.fillStyle = fillColor
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 1
    ctx.stroke()

    // Seed dot
    if (cell.state === 'seed') {
      const age = cell.fuseStart !== null ? now - cell.fuseStart : 0
      const fuseProgress = age / FUSE_MS
      // Squash-and-stretch on placement
      const placePop = age < 200 ? 1 + 0.3 * Math.sin(Math.PI * age / 200) : 1

      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(placePop, 1 / placePop)

      // Fuse ring growing outward
      ctx.beginPath()
      ctx.arc(0, 0, (hexSize - 4) * fuseProgress, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(100,255,100,0.4)'
      ctx.lineWidth = 2
      ctx.stroke()

      // Center dot
      ctx.beginPath()
      ctx.arc(0, 0, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()

      ctx.restore()
    }
  }

  ctx.restore()
}

function drawPopups(now: number): void {
  const POPUP_LIFETIME = 1200
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i]
    const age = now - p.born
    if (age > POPUP_LIFETIME) { popups.splice(i, 1); continue }

    const progress = age / POPUP_LIFETIME
    const alpha = 1 - progress
    const yOffset = -40 * progress

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = `bold ${Math.floor(16 * p.scale)}px 'Courier New', monospace`
    ctx.textAlign = 'center'
    ctx.fillStyle = p.color
    ctx.shadowColor = p.color
    ctx.shadowBlur = 8
    ctx.fillText(p.text, p.x, p.y + yOffset)
    ctx.restore()
  }
}

function drawReadyScreen(): void {
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.72)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#64ff64'
  ctx.shadowColor = '#64ff64'
  ctx.shadowBlur = 20
  ctx.font = `bold ${Math.floor(canvas.width * 0.07)}px 'Courier New', monospace`
  ctx.fillText('BLOOM CHAIN', canvas.width / 2, canvas.height * 0.38)

  ctx.shadowBlur = 0
  ctx.font = `${Math.floor(canvas.width * 0.035)}px 'Courier New', monospace`
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillText('Place seeds · Chain reactions fill the grid', canvas.width / 2, canvas.height * 0.47)
  ctx.fillText('Scorched ground costs 2 seeds', canvas.width / 2, canvas.height * 0.52)
  ctx.fillText('Goal: Cover 90%+ of cells', canvas.width / 2, canvas.height * 0.57)

  ctx.fillStyle = '#64ff64'
  ctx.font = `bold ${Math.floor(canvas.width * 0.038)}px 'Courier New', monospace`
  ctx.fillText('Tap / Click to start', canvas.width / 2, canvas.height * 0.67)
  ctx.restore()
}

function drawGameOverScreen(now: number): void {
  const coveragePct = getCoveragePct()
  const efficiency = seedsRemaining * 30
  const finalScore = coveragePct * 100 + lastScore + efficiency

  // Dim unfilled cells for miss visualization
  for (const cell of grid.values()) {
    if (cell.state === 'empty') {
      const [cx, cy] = hexToPixel(cell.q, cell.r)
      drawHexPath(cx, cy, hexSize - 1)
      ctx.fillStyle = 'rgba(255,60,60,0.25)'
      ctx.fill()
    }
  }

  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const stars = coveragePct >= 95 ? 3 : coveragePct >= 85 ? 2 : coveragePct >= 70 ? 1 : 0
  const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars)

  ctx.textAlign = 'center'
  ctx.font = `bold ${Math.floor(canvas.width * 0.065)}px 'Courier New', monospace`
  ctx.fillStyle = '#64ff64'
  ctx.shadowColor = '#64ff64'
  ctx.shadowBlur = 16
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height * 0.35)

  ctx.shadowBlur = 0
  ctx.font = `${Math.floor(canvas.width * 0.055)}px 'Courier New', monospace`
  ctx.fillStyle = '#ffd700'
  ctx.fillText(starStr, canvas.width / 2, canvas.height * 0.43)

  ctx.font = `${Math.floor(canvas.width * 0.037)}px 'Courier New', monospace`
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(`Coverage: ${coveragePct}%`, canvas.width / 2, canvas.height * 0.51)
  ctx.fillText(`Chain Bonus: ${lastScore}`, canvas.width / 2, canvas.height * 0.56)
  ctx.fillText(`Efficiency: ${efficiency}`, canvas.width / 2, canvas.height * 0.61)

  ctx.font = `bold ${Math.floor(canvas.width * 0.045)}px 'Courier New', monospace`
  ctx.fillStyle = '#64ff64'
  ctx.fillText(`Score: ${finalScore}`, canvas.width / 2, canvas.height * 0.69)

  ctx.font = `${Math.floor(canvas.width * 0.032)}px 'Courier New', monospace`
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText('Tap / Click to play again', canvas.width / 2, canvas.height * 0.78)

  ctx.restore()
  void now
}

function drawComboCounter(now: number): void {
  if (activeChainLength < 2) return
  const age = now - comboDisplayBorn
  if (age > 2000) return
  const alpha = Math.min(1, (2000 - age) / 500)
  const scale = comboDisplayScale * (1 + 0.1 * Math.sin(now / 80))

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.textAlign = 'right'
  ctx.font = `bold ${Math.floor(canvas.width * 0.06 * scale)}px 'Courier New', monospace`
  ctx.fillStyle = '#ffd700'
  ctx.shadowColor = '#ffd700'
  ctx.shadowBlur = 16
  ctx.fillText(`COMBO x${activeChainLength}`, canvas.width - 16, canvas.height * 0.12)
  ctx.restore()
}

// ── Main render ───────────────────────────────────────────────────────────────

function render(now: number): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Background
  ctx.fillStyle = '#0a0f0d'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (phase === 'READY') {
    // Draw empty grid underneath the overlay
    for (const cell of grid.values()) {
      const [cx, cy] = hexToPixel(cell.q, cell.r)
      drawHexPath(cx, cy, hexSize - 1)
      ctx.fillStyle = '#1a2420'
      ctx.fill()
      ctx.strokeStyle = '#2a3a30'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    drawReadyScreen()
    return
  }

  drawGrid(now)
  drawPopups(now)
  drawComboCounter(now)

  if (phase === 'GAME_OVER') {
    drawGameOverScreen(now)
  }
}

// ── Game reset ────────────────────────────────────────────────────────────────

function resetGame(): void {
  grid = buildGrid()
  seedsRemaining = TOTAL_SEEDS
  lastScore = 0
  lastMilestonePct = 0
  activeChainLength = 0
  comboDisplayScale = 1
  bloomQueue.length = 0
  popups.length = 0
  jolt = null
  wildfireActive = false
  phase = 'PLACING'

  gameCount++
  if (gameCount % 5 === 0) {
    wildfireActive = true
    // Wildfire is triggered once when the first bloom completes
  }
  updateHUD()
}

// ── Input ─────────────────────────────────────────────────────────────────────

function handleTap(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const px = (clientX - rect.left) * scaleX
  const py = (clientY - rect.top) * scaleY

  if (phase === 'READY') {
    resetGame()
    return
  }

  if (phase === 'GAME_OVER') {
    resetGame()
    return
  }

  if (phase === 'PLACING' || phase === 'BLOOMING') {
    const [q, r] = pixelToHex(px, py)
    if (Math.abs(q) <= GRID_RADIUS && Math.abs(r) <= GRID_RADIUS && Math.abs(q + r) <= GRID_RADIUS) {
      placeSeed(q, r)
    }
  }
}

function handleMouseMove(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const px = (clientX - rect.left) * scaleX
  const py = (clientY - rect.top) * scaleY
  const [q, r] = pixelToHex(px, py)
  hoverQ = q
  hoverR = r
}

canvas.addEventListener('click', (e) => handleTap(e.clientX, e.clientY))

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const touch = e.changedTouches[0]
  if (touch) handleTap(touch.clientX, touch.clientY)
}, { passive: false })

canvas.addEventListener('mousemove', (e) => handleMouseMove(e.clientX, e.clientY))
canvas.addEventListener('mouseleave', () => { hoverQ = 9999; hoverR = 9999 })

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    if (phase === 'READY' || phase === 'GAME_OVER') {
      resetGame()
    }
  }
})

// ── Game loop ─────────────────────────────────────────────────────────────────

function gameLoop(now: number): void {
  if (phase === 'PLACING' || phase === 'BLOOMING') {
    checkFuses(now)
    processBloomQueue(now)

    // Transition phase
    if (bloomQueue.length > 0) {
      phase = 'BLOOMING'
    } else if (phase === 'BLOOMING' && bloomQueue.length === 0) {
      phase = 'PLACING'
      activeChainLength = 0

      // Trigger wildfire once after first bloom wave if active
      if (wildfireActive) {
        wildfireActive = false
        triggerWildfire(now)
      }
    }

    checkCoverageMilestones(now)
    checkGameOver(now)
    updateHUD()
    reportScore(getCoveragePct() * 100)
  }

  render(now)
  requestAnimationFrame(gameLoop)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  resizeCanvas()
  window.addEventListener('resize', () => {
    resizeCanvas()
    computeHexLayout()
  })

  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
    bestEl.textContent = String(highScore)
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  // Initialize the visual grid for the READY screen
  grid = buildGrid()
  computeHexLayout()
  updateHUD()

  requestAnimationFrame(gameLoop)
}

void boot()
