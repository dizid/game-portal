// Bubble Pop — bubble shooter game

import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Bubble {
  colorIdx: number // 0-6
  row: number
  col: number
}

interface FlyingBubble {
  x: number
  y: number
  vx: number
  vy: number
  colorIdx: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number      // 0..1
  colorIdx: number
  size: number
}

type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

// ── Constants ──────────────────────────────────────────────────────────────────

const COLORS = [
  '#e94560', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#a855f7', // purple
  '#ec4899', // pink
]

const COLS = 10
const INITIAL_ROWS = 6
const NEW_ROW_EVERY = 5   // shots before a new row pushes down
const BUBBLE_R_RATIO = 0.46 // fraction of cell size

// ── Game state ─────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const shotsEl = document.getElementById('shots-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

let canvasW = 400
let canvasH = 600
let cellW = 40   // width of one cell
let bubbleR = 18 // radius

let grid: (Bubble | null)[][] = []
let flyingBubble: FlyingBubble | null = null
let nextColorIdx = 0
let currentColorIdx = 0
let particles: Particle[] = []
let score = 0
let highScore = 0
let shotCount = 0
let shotsUntilNewRow = NEW_ROW_EVERY
let gameState: GameState = 'READY'
let cannonAngle = -Math.PI / 2 // radians, -PI/2 = straight up
let aimX = 0 // aim pointer X from touch

// ── Canvas sizing ──────────────────────────────────────────────────────────────

function resizeCanvas(): void {
  const wrap = document.getElementById('canvas-wrap')!
  const availW = wrap.clientWidth
  const availH = wrap.clientHeight
  // Keep ~2:3 ratio
  const byW = availW
  const byH = Math.floor(availH * 2 / 3)
  canvasW = Math.min(byW, byH, 420)
  canvasH = Math.floor(canvasW * 1.5)
  canvas.width = canvasW
  canvas.height = canvasH
  canvas.style.width = `${canvasW}px`
  canvas.style.height = `${canvasH}px`
  cellW = Math.floor(canvasW / COLS)
  bubbleR = Math.floor(cellW * BUBBLE_R_RATIO)
}

// ── Hex grid helpers ───────────────────────────────────────────────────────────

// Row offset — odd rows shift right by half a cell
function colOffset(row: number): number {
  return (row % 2 === 1) ? cellW / 2 : 0
}

function bubbleX(row: number, col: number): number {
  return colOffset(row) + col * cellW + cellW / 2
}

function bubbleY(row: number): number {
  // Hex packing: vertical spacing = cellW * sqrt(3)/2
  const rowH = cellW * 0.866
  return row * rowH + cellW / 2
}

// Convert pixel to nearest grid cell
function xyToCell(x: number, y: number): { row: number; col: number } {
  const rowH = cellW * 0.866
  const row = Math.round((y - cellW / 2) / rowH)
  const clampedRow = Math.max(0, row)
  const col = Math.round((x - colOffset(clampedRow) - cellW / 2) / cellW)
  return { row: clampedRow, col: Math.max(0, Math.min(COLS - 1, col)) }
}

// Max grid rows before game over
function maxRows(): number {
  const rowH = cellW * 0.866
  const cannonY = canvasH - cellW * 1.5
  return Math.floor((cannonY - cellW / 2) / rowH) - 1
}

// ── Grid init ──────────────────────────────────────────────────────────────────

function initGrid(): void {
  grid = []
  for (let r = 0; r < INITIAL_ROWS; r++) {
    const colsInRow = r % 2 === 0 ? COLS : COLS - 1
    grid[r] = []
    for (let c = 0; c < COLS; c++) {
      if (c < colsInRow) {
        grid[r][c] = { colorIdx: Math.floor(Math.random() * COLORS.length), row: r, col: c }
      } else {
        grid[r][c] = null
      }
    }
  }
  // Ensure top row is always full
  while (grid.length < 1) addNewRow()
}

function addNewRow(): void {
  // Shift all rows down
  const newRow: (Bubble | null)[] = []
  const colsInNewRow = COLS // always even row at top
  for (let c = 0; c < COLS; c++) {
    newRow[c] = c < colsInNewRow
      ? { colorIdx: Math.floor(Math.random() * COLORS.length), row: 0, col: c }
      : null
  }
  grid.unshift(newRow)
  // Re-index row numbers
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c]) grid[r][c]!.row = r
    }
  }
  audio.newRow()
}

// ── Cannon / aim ───────────────────────────────────────────────────────────────

const cannonX = () => canvasW / 2
const cannonY = () => canvasH - cellW * 1.2

function clampAngle(angle: number): number {
  const min = -Math.PI + 0.2
  const max = -0.2
  return Math.max(min, Math.min(max, angle))
}

// ── Shooting ───────────────────────────────────────────────────────────────────

function shoot(): void {
  if (flyingBubble || gameState !== 'PLAYING') return
  const speed = cellW * 0.35
  flyingBubble = {
    x: cannonX(),
    y: cannonY(),
    vx: Math.cos(cannonAngle) * speed,
    vy: Math.sin(cannonAngle) * speed,
    colorIdx: currentColorIdx,
  }
  currentColorIdx = nextColorIdx
  nextColorIdx = Math.floor(Math.random() * COLORS.length)
  shotCount++
  shotsUntilNewRow--
  audio.shoot()
  if (shotsUntilNewRow <= 0) {
    shotsUntilNewRow = NEW_ROW_EVERY
    // Add row after this shot lands
  }
  updateHUD()
}

// ── Physics update ─────────────────────────────────────────────────────────────

function updateFlying(): boolean {
  if (!flyingBubble) return false
  const fb = flyingBubble

  fb.x += fb.vx
  fb.y += fb.vy

  // Wall bounce
  if (fb.x - bubbleR < 0) { fb.x = bubbleR; fb.vx = Math.abs(fb.vx) }
  if (fb.x + bubbleR > canvasW) { fb.x = canvasW - bubbleR; fb.vx = -Math.abs(fb.vx) }

  // Hit ceiling
  if (fb.y - bubbleR < 0) {
    fb.y = bubbleR
    landBubble(fb)
    return true
  }

  // Check collision with grid bubbles
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = grid[r][c]
      if (!b) continue
      const bx = bubbleX(r, c)
      const by = bubbleY(r)
      const dist = Math.hypot(fb.x - bx, fb.y - by)
      if (dist < bubbleR * 1.9) {
        landBubble(fb)
        return true
      }
    }
  }
  return false
}

function landBubble(fb: FlyingBubble): void {
  flyingBubble = null
  const { row, col } = xyToCell(fb.x, fb.y)
  // Ensure grid has enough rows
  while (grid.length <= row) {
    grid.push(Array(COLS).fill(null))
  }
  // Find an empty cell near target
  const placed = placeBubble(row, col, fb.colorIdx)
  if (!placed) return

  // Check for 3+ match
  const matched = findMatches(placed.row, placed.col, fb.colorIdx)
  if (matched.length >= 3) {
    for (const pos of matched) {
      grid[pos.row][pos.col] = null
      spawnParticles(bubbleX(pos.row, pos.col), bubbleY(pos.row), fb.colorIdx, 6)
    }
    score += matched.length * 10
    audio.pop()
    if (matched.length >= 5) audio.combo()
    // Remove disconnected bubbles
    const fallen = removeFallen()
    score += fallen * 20
    if (fallen > 0) audio.fall()
    reportScore(score)
    if (score > highScore) { highScore = score; saveHighScore(highScore) }
  } else {
    // No match — check if bubbles reached bottom
    if (checkGameOver()) return
  }

  // Push new row if needed
  if (shotsUntilNewRow <= 0) {
    shotsUntilNewRow = NEW_ROW_EVERY
    addNewRow()
    if (checkGameOver()) return
  }

  updateHUD()
}

function placeBubble(row: number, col: number, colorIdx: number): Bubble | null {
  // Try the target cell, then spiral outward
  const candidates: { row: number; col: number; dist: number }[] = []
  for (let r = Math.max(0, row - 1); r <= row + 1; r++) {
    for (let c = Math.max(0, col - 1); c < COLS; c++) {
      if ((!grid[r] || !grid[r][c])) {
        const dx = c - col, dy = r - row
        candidates.push({ row: r, col: c, dist: dx * dx + dy * dy })
      }
    }
  }
  candidates.sort((a, b) => a.dist - b.dist)
  const target = candidates[0]
  if (!target) return null
  while (grid.length <= target.row) grid.push(Array(COLS).fill(null))
  if (!grid[target.row]) grid[target.row] = Array(COLS).fill(null)
  const bubble: Bubble = { colorIdx, row: target.row, col: target.col }
  grid[target.row][target.col] = bubble
  return bubble
}

// BFS to find same-color adjacents (3+ = pop)
function findMatches(startRow: number, startCol: number, colorIdx: number): { row: number; col: number }[] {
  const visited = new Set<string>()
  const queue: { row: number; col: number }[] = [{ row: startRow, col: startCol }]
  const result: { row: number; col: number }[] = []
  visited.add(`${startRow},${startCol}`)

  while (queue.length > 0) {
    const { row, col } = queue.shift()!
    result.push({ row, col })
    for (const nb of getNeighbors(row, col)) {
      const key = `${nb.row},${nb.col}`
      if (!visited.has(key) && grid[nb.row]?.[nb.col]?.colorIdx === colorIdx) {
        visited.add(key)
        queue.push(nb)
      }
    }
  }
  return result
}

// Returns valid neighboring cells in hex grid
function getNeighbors(row: number, col: number): { row: number; col: number }[] {
  const isOdd = row % 2 === 1
  const offsets = isOdd
    ? [[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]]
    : [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]]
  return offsets
    .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
    .filter(({ row: r, col: c }) => r >= 0 && r < grid.length && c >= 0 && c < COLS && grid[r]?.[c])
}

// Find all bubbles connected to top row and remove the rest (they fall)
function removeFallen(): number {
  const connected = new Set<string>()
  const queue: { row: number; col: number }[] = []

  // Seed with top row
  for (let c = 0; c < COLS; c++) {
    if (grid[0]?.[c]) {
      queue.push({ row: 0, col: c })
      connected.add(`0,${c}`)
    }
  }

  while (queue.length > 0) {
    const { row, col } = queue.shift()!
    for (const nb of getNeighbors(row, col)) {
      const key = `${nb.row},${nb.col}`
      if (!connected.has(key) && grid[nb.row]?.[nb.col]) {
        connected.add(key)
        queue.push(nb)
      }
    }
  }

  let fallen = 0
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r]?.[c] && !connected.has(`${r},${c}`)) {
        const b = grid[r][c]!
        spawnParticles(bubbleX(r, c), bubbleY(r), b.colorIdx, 4)
        grid[r][c] = null
        fallen++
      }
    }
  }
  return fallen
}

// Check if any bubble in bottom area reaches cannon
function checkGameOver(): boolean {
  const limit = maxRows()
  for (let r = limit; r < grid.length; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r]?.[c]) {
        triggerGameOver()
        return true
      }
    }
  }
  return false
}

function triggerGameOver(): void {
  gameState = 'GAME_OVER'
  flyingBubble = null
  audio.death()
  reportGameOver(score)
  if (score > highScore) { highScore = score; saveHighScore(highScore) }
  updateHUD()
}

// ── Particles ──────────────────────────────────────────────────────────────────

function spawnParticles(x: number, y: number, colorIdx: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
    const speed = 1.5 + Math.random() * 2
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      colorIdx,
      size: 3 + Math.random() * 4,
    })
  }
}

function updateParticles(): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.12
    p.life -= 0.04
    if (p.life <= 0) particles.splice(i, 1)
  }
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function draw(): void {
  ctx.clearRect(0, 0, canvasW, canvasH)

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, canvasH)
  bg.addColorStop(0, '#0d0d1e')
  bg.addColorStop(1, '#1a1a2e')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Grid bubbles
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = grid[r]?.[c]
      if (!b) continue
      drawBubble(bubbleX(r, c), bubbleY(r), b.colorIdx, 1)
    }
  }

  // Flying bubble
  if (flyingBubble) {
    drawBubble(flyingBubble.x, flyingBubble.y, flyingBubble.colorIdx, 1)
  }

  // Particles
  for (const p of particles) {
    ctx.globalAlpha = p.life
    ctx.fillStyle = COLORS[p.colorIdx]
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Danger line (top of dead zone)
  const dangerY = bubbleY(maxRows())
  ctx.strokeStyle = 'rgba(255,80,80,0.3)'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 4])
  ctx.beginPath(); ctx.moveTo(0, dangerY); ctx.lineTo(canvasW, dangerY); ctx.stroke()
  ctx.setLineDash([])

  // Aim line
  if (gameState === 'PLAYING' && !flyingBubble) {
    drawAimLine()
  }

  // Cannon area
  drawCannon()

  // Next bubble preview
  const nextX = cannonX() + cellW * 1.5
  const nextY = cannonY()
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = `${Math.floor(cellW * 0.3)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('NEXT', nextX, nextY - bubbleR - 4)
  drawBubble(nextX, nextY, nextColorIdx, 0.7)

  // Overlays
  if (gameState === 'READY') drawReadyOverlay()
  if (gameState === 'GAME_OVER') drawGameOverOverlay()
}

function drawBubble(x: number, y: number, colorIdx: number, alpha: number): void {
  const color = COLORS[colorIdx]
  ctx.globalAlpha = alpha
  // Gradient fill
  const grad = ctx.createRadialGradient(x - bubbleR * 0.3, y - bubbleR * 0.3, 1, x, y, bubbleR)
  grad.addColorStop(0, lighten(color, 0.5))
  grad.addColorStop(1, color)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, bubbleR, 0, Math.PI * 2)
  ctx.fill()
  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.beginPath()
  ctx.arc(x - bubbleR * 0.3, y - bubbleR * 0.35, bubbleR * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}

function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1,3), 16)
  const g = parseInt(hex.slice(3,5), 16)
  const b = parseInt(hex.slice(5,7), 16)
  const lr = Math.min(255, Math.floor(r + (255 - r) * amount))
  const lg = Math.min(255, Math.floor(g + (255 - g) * amount))
  const lb = Math.min(255, Math.floor(b + (255 - b) * amount))
  return `rgb(${lr},${lg},${lb})`
}

function drawAimLine(): void {
  const cx = cannonX()
  const cy = cannonY()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 8])
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  // Trace with wall bounces
  let x = cx, y = cy
  let vx = Math.cos(cannonAngle) * 8
  let vy = Math.sin(cannonAngle) * 8
  for (let i = 0; i < 80; i++) {
    x += vx; y += vy
    if (x < bubbleR) { x = bubbleR; vx = Math.abs(vx) }
    if (x > canvasW - bubbleR) { x = canvasW - bubbleR; vx = -Math.abs(vx) }
    ctx.lineTo(x, y)
    if (y < 0) break
  }
  ctx.stroke()
  ctx.setLineDash([])
}

function drawCannon(): void {
  const cx = cannonX()
  const cy = cannonY()
  // Current bubble in cannon
  drawBubble(cx, cy, currentColorIdx, 1)
  // Cannon barrel
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(cannonAngle + Math.PI / 2) // barrel points toward angle
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillRect(-4, -bubbleR - 18, 8, 20)
  ctx.restore()
}

function drawReadyOverlay(): void {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#c084fc'
  ctx.font = `bold ${Math.floor(cellW * 1.1)}px 'Courier New', monospace`
  ctx.fillText('BUBBLE POP', canvasW / 2, canvasH / 2 - 30)
  ctx.fillStyle = '#fff'
  ctx.font = `${Math.floor(cellW * 0.55)}px 'Courier New', monospace`
  ctx.fillText('Tap to start', canvasW / 2, canvasH / 2 + 16)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = `${Math.floor(cellW * 0.4)}px 'Courier New', monospace`
  ctx.fillText('Arrow keys or tap sides to aim', canvasW / 2, canvasH / 2 + 44)
  ctx.fillText('Space or tap center to fire', canvasW / 2, canvasH / 2 + 64)
}

function drawGameOverOverlay(): void {
  ctx.fillStyle = 'rgba(0,0,0,0.72)'
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#e94560'
  ctx.font = `bold ${Math.floor(cellW * 1.0)}px 'Courier New', monospace`
  ctx.fillText('GAME OVER', canvasW / 2, canvasH / 2 - 30)
  ctx.fillStyle = '#fff'
  ctx.font = `${Math.floor(cellW * 0.65)}px 'Courier New', monospace`
  ctx.fillText(`Score: ${score}`, canvasW / 2, canvasH / 2 + 10)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `${Math.floor(cellW * 0.45)}px 'Courier New', monospace`
  ctx.fillText('Tap to play again', canvasW / 2, canvasH / 2 + 44)
}

// ── Input ──────────────────────────────────────────────────────────────────────

function startGame(): void {
  gameState = 'PLAYING'
  score = 0
  shotCount = 0
  shotsUntilNewRow = NEW_ROW_EVERY
  particles = []
  flyingBubble = null
  cannonAngle = -Math.PI / 2
  currentColorIdx = Math.floor(Math.random() * COLORS.length)
  nextColorIdx = Math.floor(Math.random() * COLORS.length)
  initGrid()
  audio.start()
  updateHUD()
}

function updateHUD(): void {
  scoreEl.textContent = String(score)
  shotsEl.textContent = String(shotCount)
  highScoreEl.textContent = String(highScore)
}

// Tap/click: left side = aim left, right side = aim right, center = shoot
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  if (gameState === 'READY' || gameState === 'GAME_OVER') {
    startGame()
    return
  }
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  aimX = x
  // Calculate angle from cannon to tap point
  const cy = cannonY()
  const tapY = e.clientY - rect.top
  const dx = x - cannonX()
  const dy = tapY - cy
  // Only shoot if tapping upper 80% of canvas
  if (tapY < canvasH * 0.8) {
    cannonAngle = clampAngle(Math.atan2(dy, dx))
    shoot()
  }
})

canvas.addEventListener('pointermove', (e: PointerEvent) => {
  if (gameState !== 'PLAYING') return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const dx = x - cannonX()
  const dy = y - cannonY()
  if (dy < 0) cannonAngle = clampAngle(Math.atan2(dy, dx))
})

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (gameState === 'READY' || gameState === 'GAME_OVER') {
    startGame()
    return
  }
  if (gameState !== 'PLAYING') return
  switch (e.key) {
    case 'ArrowLeft':  cannonAngle = clampAngle(cannonAngle - 0.08); break
    case 'ArrowRight': cannonAngle = clampAngle(cannonAngle + 0.08); break
    case ' ':
    case 'ArrowUp':
      e.preventDefault()
      shoot()
      break
  }
})

muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── Game loop ──────────────────────────────────────────────────────────────────

function loop(): void {
  if (gameState === 'PLAYING') {
    updateFlying()
    updateParticles()
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
  // Init grid for display on ready screen
  currentColorIdx = 0
  nextColorIdx = 1
  initGrid()
  updateHUD()
  requestAnimationFrame(loop)
}

void boot()
