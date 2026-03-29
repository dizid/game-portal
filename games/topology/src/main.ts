import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── DOM ────────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hudLevel = document.getElementById('hud-level')!
const hudMoves = document.getElementById('hud-moves')!
const hudScore = document.getElementById('hud-score')!
const srcHoles = document.getElementById('src-holes')!
const srcParts = document.getElementById('src-parts')!
const tgtHoles = document.getElementById('tgt-holes')!
const tgtParts = document.getElementById('tgt-parts')!
const topoMatch = document.getElementById('topo-match')!
const toolHint = document.getElementById('tool-hint')!

// ── Canvas sizing ──────────────────────────────────────────────────────────────

function resize(): void {
  const row = document.getElementById('canvas-row')!
  const panel = document.getElementById('info-panel')!
  canvas.width = Math.max(100, row.clientWidth - panel.clientWidth)
  canvas.height = row.clientHeight
}
resize()
window.addEventListener('resize', () => { resize(); draw() })

// ── Types ──────────────────────────────────────────────────────────────────────

type Tool = 'stretch' | 'punch' | 'merge' | 'fill' | 'check'

interface TopoShape {
  holes: number       // number of holes
  parts: number       // number of connected components
}

interface ControlPoint {
  x: number; y: number   // relative to shape center
  id: number
}

interface ShapeState {
  centerX: number; centerY: number
  radiusX: number; radiusY: number
  rotation: number
  holes: number
  parts: number
  points: ControlPoint[]  // extra control points for stretch
}

// ── Level definitions ──────────────────────────────────────────────────────────

interface LevelDef {
  name: string
  description: string
  source: TopoShape
  target: TopoShape
  hint: string
  maxMoves: number
}

const LEVELS: LevelDef[] = [
  { name: 'Squish', description: 'Stretch a circle into an oval',
    source: { holes: 0, parts: 1 }, target: { holes: 0, parts: 1 },
    hint: 'Drag to stretch the shape', maxMoves: 5 },
  { name: 'The Twist', description: 'Rotate and stretch',
    source: { holes: 0, parts: 1 }, target: { holes: 0, parts: 1 },
    hint: 'Drag control points to deform', maxMoves: 5 },
  { name: 'First Hole', description: 'Punch a hole through the circle',
    source: { holes: 0, parts: 1 }, target: { holes: 1, parts: 1 },
    hint: 'Select PUNCH HOLE, click inside', maxMoves: 3 },
  { name: 'Figure-8', description: 'Make the circle look like a figure-8 (2 holes)',
    source: { holes: 0, parts: 1 }, target: { holes: 2, parts: 1 },
    hint: 'Punch 2 holes with PUNCH HOLE', maxMoves: 4 },
  { name: 'Donut Shop', description: 'A donut needs exactly 1 hole',
    source: { holes: 2, parts: 1 }, target: { holes: 1, parts: 1 },
    hint: 'Use FILL HOLE to remove a hole', maxMoves: 3 },
  { name: 'Two Circles', description: 'Merge two separate circles into one shape',
    source: { holes: 0, parts: 2 }, target: { holes: 0, parts: 1 },
    hint: 'Select MERGE, drag shapes together', maxMoves: 3 },
  { name: 'Split & Hole', description: 'Two circles, one with a hole',
    source: { holes: 0, parts: 2 }, target: { holes: 1, parts: 2 },
    hint: 'PUNCH HOLE in one circle', maxMoves: 3 },
  { name: 'Torus', description: 'Single shape with exactly 1 hole',
    source: { holes: 0, parts: 1 }, target: { holes: 1, parts: 1 },
    hint: 'One punch is all you need', maxMoves: 3 },
  { name: 'Pretzel', description: 'Three holes in one shape',
    source: { holes: 0, parts: 1 }, target: { holes: 3, parts: 1 },
    hint: 'Punch 3 holes', maxMoves: 5 },
  { name: 'Archipelago', description: '3 separate shapes',
    source: { holes: 0, parts: 1 }, target: { holes: 0, parts: 3 },
    hint: 'You cannot split — but parts mismatch is OK topology-wise... check the rules!', maxMoves: 8 },
  { name: 'Complex Knot', description: 'Two holes, two separate parts',
    source: { holes: 0, parts: 2 }, target: { holes: 2, parts: 2 },
    hint: 'Punch one hole in each part', maxMoves: 5 },
  { name: 'Perfection', description: 'Everything matches',
    source: { holes: 1, parts: 2 }, target: { holes: 1, parts: 2 },
    hint: 'They already match! Just click CHECK', maxMoves: 1 },
]

// ── Game state ─────────────────────────────────────────────────────────────────

type GameState = 'start' | 'playing' | 'levelwin' | 'gameover' | 'win'

let state: GameState = 'start'
let levelIndex = 0
let score = 0
let bestScore = 0
let movesUsed = 0
let activeTool: Tool = 'stretch'
let lastTime = 0
let frameCount = 0

// Source shape state
let srcShape: ShapeState = { centerX: 0, centerY: 0, radiusX: 60, radiusY: 60, rotation: 0, holes: 0, parts: 1, points: [] }
// Target shape (visual only, shows topology)
let tgtShape: ShapeState = { centerX: 0, centerY: 0, radiusX: 60, radiusY: 60, rotation: 0, holes: 1, parts: 1, points: [] }

// Drag state
let dragging = false
let dragPointId = -1
let dragStartX = 0; let dragStartY = 0
let shapeDragStartCX = 0; let shapeDragStartCY = 0

// Animated feedback
let feedbackTimer = 0
let feedbackText = ''
let feedbackColor = '#fff'

// Second part (for 2-part levels)
let srcShape2: ShapeState | null = null
let tgtShape2: ShapeState | null = null

// ── Tool buttons ───────────────────────────────────────────────────────────────

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = (btn as HTMLElement).dataset.tool as Tool | undefined
    if (!tool) return
    if (tool === 'check') {
      checkMatch()
      return
    }
    activeTool = tool
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    updateToolHint()
    audio.click()
  })
})

function updateToolHint(): void {
  const hints: Record<Tool, string> = {
    stretch: 'Drag shape or control points to deform',
    punch: 'Click inside shape to add a hole',
    merge: 'Drag shapes onto each other to merge',
    fill: 'Click inside a hole to fill it',
    check: 'Check if topologies match',
  }
  toolHint.textContent = hints[activeTool]
}

// ── Level setup ────────────────────────────────────────────────────────────────

function loadLevel(idx: number): void {
  const lvl = LEVELS[idx]
  const W = canvas.width; const H = canvas.height
  const half = W / 2

  movesUsed = 0
  hudLevel.textContent = String(idx + 1)
  hudMoves.textContent = '0'

  // Source
  srcShape = {
    centerX: half * 0.5,
    centerY: H / 2,
    radiusX: Math.min(55, half * 0.35),
    radiusY: Math.min(55, H * 0.28),
    rotation: 0,
    holes: lvl.source.holes,
    parts: lvl.source.parts,
    points: makeControlPoints(Math.min(55, half * 0.35), Math.min(55, H * 0.28)),
  }

  // If 2-part source
  if (lvl.source.parts >= 2) {
    srcShape2 = {
      centerX: half * 0.5,
      centerY: H / 2 + 80,
      radiusX: Math.min(40, half * 0.28),
      radiusY: Math.min(40, H * 0.22),
      rotation: 0,
      holes: 0,
      parts: 1,
      points: makeControlPoints(Math.min(40, half * 0.28), Math.min(40, H * 0.22)),
    }
    if (lvl.source.parts >= 3) {
      srcShape.centerY = H * 0.3
      srcShape2.centerY = H * 0.6
    }
  } else {
    srcShape2 = null
  }

  // Target
  tgtShape = {
    centerX: half * 1.5,
    centerY: H / 2,
    radiusX: Math.min(55, half * 0.35),
    radiusY: Math.min(55, H * 0.28),
    rotation: 0.3,
    holes: lvl.target.holes,
    parts: lvl.target.parts,
    points: makeControlPoints(Math.min(55, half * 0.35), Math.min(55, H * 0.28)),
  }

  if (lvl.target.parts >= 2) {
    tgtShape2 = {
      centerX: half * 1.5,
      centerY: H / 2 + 80,
      radiusX: Math.min(40, half * 0.28),
      radiusY: Math.min(40, H * 0.22),
      rotation: -0.2,
      holes: lvl.target.parts >= 2 ? Math.floor(lvl.target.holes / 2) : 0,
      parts: 1,
      points: makeControlPoints(Math.min(40, half * 0.28), Math.min(40, H * 0.22)),
    }
  } else {
    tgtShape2 = null
  }

  toolHint.textContent = lvl.hint
  updateInfoPanel()
}

function makeControlPoints(rx: number, ry: number): ControlPoint[] {
  return [
    { x: rx, y: 0, id: 0 },
    { x: -rx, y: 0, id: 1 },
    { x: 0, y: ry, id: 2 },
    { x: 0, y: -ry, id: 3 },
  ]
}

// ── Topology info panel ────────────────────────────────────────────────────────

function updateInfoPanel(): void {
  srcHoles.textContent = String(srcShape.holes + (srcShape2?.holes ?? 0))
  srcParts.textContent = String(srcShape.parts + (srcShape2 ? srcShape2.parts : 0))
  tgtHoles.textContent = String(tgtShape.holes + (tgtShape2?.holes ?? 0))
  tgtParts.textContent = String(tgtShape.parts + (tgtShape2 ? tgtShape2.parts : 0))

  const matches = topoMatches()
  topoMatch.textContent = matches ? 'MATCH!' : 'NO MATCH'
  topoMatch.style.color = matches ? '#88ff88' : '#ff8888'
}

function topoMatches(): boolean {
  const lvl = LEVELS[levelIndex]
  const srcH = srcShape.holes + (srcShape2?.holes ?? 0)
  const srcP = srcShape.parts + (srcShape2 ? srcShape2.parts : 0)
  return srcH === lvl.target.holes && srcP === lvl.target.parts
}

// ── Check match ────────────────────────────────────────────────────────────────

function checkMatch(): void {
  if (state !== 'playing') return
  movesUsed++
  updateMoves()

  if (topoMatches()) {
    // Level passed
    const remaining = Math.max(0, LEVELS[levelIndex].maxMoves - movesUsed)
    const points = 100 + remaining * 20
    score += points
    hudScore.textContent = String(score)
    audio.levelUp()
    feedbackText = `MATCH! +${points} pts`
    feedbackColor = '#88ff88'
    feedbackTimer = 120

    setTimeout(() => {
      levelIndex++
      if (levelIndex >= LEVELS.length) {
        state = 'win'
        if (score > bestScore) { bestScore = score; saveBestScore(bestScore) }
        reportGameOver(score)
      } else {
        loadLevel(levelIndex)
        state = 'playing'
      }
      reportScore(score)
    }, 1500)
  } else {
    audio.blip()
    feedbackText = 'NOT A MATCH — keep trying'
    feedbackColor = '#ff8888'
    feedbackTimer = 90
  }
}

function updateMoves(): void {
  hudMoves.textContent = String(movesUsed)
}

// ── Input ──────────────────────────────────────────────────────────────────────

canvas.addEventListener('mousedown', (e: MouseEvent) => {
  if (state !== 'playing') return
  const rect = canvas.getBoundingClientRect()
  const px = (e.clientX - rect.left) * (canvas.width / rect.width)
  const py = (e.clientY - rect.top) * (canvas.height / rect.height)
  handlePointerDown(px, py)
})

canvas.addEventListener('mousemove', (e: MouseEvent) => {
  if (!dragging || state !== 'playing') return
  const rect = canvas.getBoundingClientRect()
  const px = (e.clientX - rect.left) * (canvas.width / rect.width)
  const py = (e.clientY - rect.top) * (canvas.height / rect.height)
  handlePointerMove(px, py)
})

canvas.addEventListener('mouseup', () => { dragging = false })

canvas.addEventListener('touchstart', (e: TouchEvent) => {
  if (state !== 'playing') return
  e.preventDefault()
  const touch = e.touches[0]
  const rect = canvas.getBoundingClientRect()
  handlePointerDown(
    (touch.clientX - rect.left) * (canvas.width / rect.width),
    (touch.clientY - rect.top) * (canvas.height / rect.height),
  )
}, { passive: false })

canvas.addEventListener('touchmove', (e: TouchEvent) => {
  if (!dragging || state !== 'playing') return
  e.preventDefault()
  const touch = e.touches[0]
  const rect = canvas.getBoundingClientRect()
  handlePointerMove(
    (touch.clientX - rect.left) * (canvas.width / rect.width),
    (touch.clientY - rect.top) * (canvas.height / rect.height),
  )
}, { passive: false })

canvas.addEventListener('touchend', () => { dragging = false })

canvas.addEventListener('click', () => {
  if (state === 'start') { beginGame(); return }
  if (state === 'win' || state === 'gameover') { beginGame(); return }
})

canvas.addEventListener('touchend', (e: TouchEvent) => {
  if (state === 'start') { e.preventDefault(); beginGame(); return }
  if (state === 'win' || state === 'gameover') { e.preventDefault(); beginGame(); return }
}, { passive: false })

function handlePointerDown(px: number, py: number): void {
  if (state !== 'playing') return

  // Left half = source shape interaction
  if (px > canvas.width / 2) return

  if (activeTool === 'stretch') {
    // Check control points
    for (const shape of getSourceShapes()) {
      for (const pt of shape.points) {
        const wx = shape.centerX + pt.x
        const wy = shape.centerY + pt.y
        const dx = px - wx; const dy = py - wy
        if (dx * dx + dy * dy < 16 * 16) {
          dragging = true
          dragPointId = pt.id
          dragStartX = px; dragStartY = py
          shapeDragStartCX = shape.centerX
          shapeDragStartCY = shape.centerY
          return
        }
      }
      // Drag center of shape
      const dx = px - shape.centerX; const dy = py - shape.centerY
      if (dx * dx + dy * dy < (shape.radiusX * 0.5) ** 2) {
        dragging = true
        dragPointId = -99
        dragStartX = px; dragStartY = py
        shapeDragStartCX = shape.centerX
        shapeDragStartCY = shape.centerY
        return
      }
    }
  }

  if (activeTool === 'punch') {
    // Punch hole in source shape
    for (const shape of getSourceShapes()) {
      const dx = px - shape.centerX; const dy = py - shape.centerY
      const inShape = (dx * dx) / (shape.radiusX * shape.radiusX) + (dy * dy) / (shape.radiusY * shape.radiusY) < 0.7
      if (inShape) {
        shape.holes++
        movesUsed++
        updateMoves()
        audio.blip()
        feedbackText = 'Hole punched!'
        feedbackColor = '#88aaff'
        feedbackTimer = 60
        updateInfoPanel()
        return
      }
    }
  }

  if (activeTool === 'fill') {
    for (const shape of getSourceShapes()) {
      const dx = px - shape.centerX; const dy = py - shape.centerY
      const inShape = (dx * dx) / (shape.radiusX * shape.radiusX) + (dy * dy) / (shape.radiusY * shape.radiusY) < 0.7
      if (inShape && shape.holes > 0) {
        shape.holes--
        movesUsed++
        updateMoves()
        audio.score()
        feedbackText = 'Hole filled!'
        feedbackColor = '#ffaa44'
        feedbackTimer = 60
        updateInfoPanel()
        return
      }
    }
  }

  if (activeTool === 'merge') {
    if (srcShape2 && srcShape.parts === 1 && srcShape2.parts === 1) {
      // Merge the two shapes
      srcShape.holes += srcShape2.holes
      srcShape.parts = 1
      srcShape2.parts = 0
      srcShape2 = null
      movesUsed++
      updateMoves()
      audio.combo()
      feedbackText = 'Shapes merged!'
      feedbackColor = '#ffdd44'
      feedbackTimer = 80
      updateInfoPanel()
    }
  }
}

function handlePointerMove(px: number, py: number): void {
  if (!dragging) return

  const dx = px - dragStartX
  const dy = py - dragStartY

  for (const shape of getSourceShapes()) {
    if (dragPointId === -99) {
      // Move shape
      shape.centerX = shapeDragStartCX + dx
      shape.centerY = shapeDragStartCY + dy
      // Clamp to left half
      shape.centerX = Math.max(shape.radiusX, Math.min(canvas.width / 2 - 10, shape.centerX))
      shape.centerY = Math.max(shape.radiusY, Math.min(canvas.height - shape.radiusY, shape.centerY))
      break
    }
    const pt = shape.points.find(p => p.id === dragPointId)
    if (pt) {
      const wx = shape.centerX + pt.x
      const wy = shape.centerY + pt.y
      // Stretch — update radius
      if (dragPointId === 0 || dragPointId === 1) {
        const newRx = Math.max(20, Math.abs(px - shape.centerX))
        shape.radiusX = Math.min(newRx, canvas.width * 0.2)
        shape.points = makeControlPoints(shape.radiusX, shape.radiusY)
      } else {
        const newRy = Math.max(20, Math.abs(py - shape.centerY))
        shape.radiusY = Math.min(newRy, canvas.height * 0.35)
        shape.points = makeControlPoints(shape.radiusX, shape.radiusY)
      }
      void wx; void wy  // suppress unused warning
      break
    }
  }
}

function getSourceShapes(): ShapeState[] {
  const arr: ShapeState[] = [srcShape]
  if (srcShape2 && srcShape2.parts > 0) arr.push(srcShape2)
  return arr
}

// ── Game flow ──────────────────────────────────────────────────────────────────

function beginGame(): void {
  levelIndex = 0
  score = 0
  movesUsed = 0
  hudScore.textContent = '0'
  hudMoves.textContent = '0'
  loadLevel(0)
  state = 'playing'
  audio.start()
}

// ── Main loop ──────────────────────────────────────────────────────────────────

function loop(now: number): void {
  lastTime = now
  frameCount++
  if (feedbackTimer > 0) feedbackTimer--
  draw()
  requestAnimationFrame(loop)
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function draw(): void {
  const W = canvas.width; const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  ctx.fillStyle = '#0a0a14'
  ctx.fillRect(0, 0, W, H)

  // Dividing line
  ctx.strokeStyle = 'rgba(100,100,200,0.3)'
  ctx.lineWidth = 1
  ctx.setLineDash([8, 6])
  ctx.beginPath()
  ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H)
  ctx.stroke()
  ctx.setLineDash([])

  // Labels
  ctx.fillStyle = 'rgba(100,120,200,0.5)'
  ctx.font = '11px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText('SOURCE (edit)', W / 4, 18)
  ctx.fillText('TARGET (read-only)', W * 3 / 4, 18)

  if (state === 'playing' || state === 'levelwin') {
    // Draw target shapes
    drawShape(tgtShape, false)
    if (tgtShape2 && tgtShape2.parts > 0) drawShape(tgtShape2, false)

    // Draw source shapes
    drawShape(srcShape, true)
    if (srcShape2 && srcShape2.parts > 0) drawShape(srcShape2, true)

    // Control points for stretch
    if (activeTool === 'stretch') {
      for (const shape of getSourceShapes()) {
        for (const pt of shape.points) {
          const wx = shape.centerX + pt.x
          const wy = shape.centerY + pt.y
          ctx.fillStyle = '#aaccff'
          ctx.strokeStyle = '#4488ff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(wx, wy, 7, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      }
    }

    // Level name and description
    const lvl = LEVELS[levelIndex]
    ctx.fillStyle = 'rgba(200,200,255,0.6)'
    ctx.font = `bold ${Math.min(14, W * 0.03)}px Courier New`
    ctx.textAlign = 'left'
    ctx.fillText(lvl.name, 8, H - 30)
    ctx.fillStyle = 'rgba(150,150,200,0.5)'
    ctx.font = `${Math.min(11, W * 0.023)}px Courier New`
    ctx.fillText(lvl.description, 8, H - 14)

    // Feedback message
    if (feedbackTimer > 0) {
      const alpha = Math.min(1, feedbackTimer / 30)
      ctx.fillStyle = feedbackColor.replace(')', `,${alpha})`).replace('rgb', 'rgba').replace('#', 'rgba(').replace('rgba(88ff88', 'rgba(136,255,136').replace('rgba(ff8888', 'rgba(255,136,136').replace('rgba(88aaff', 'rgba(136,170,255').replace('rgba(ffaa44', 'rgba(255,170,68').replace('rgba(ffdd44', 'rgba(255,221,68')
      ctx.fillStyle = feedbackColor
      ctx.globalAlpha = alpha
      ctx.font = `bold ${Math.min(18, W * 0.038)}px Courier New`
      ctx.textAlign = 'center'
      ctx.fillText(feedbackText, W / 4, H * 0.88)
      ctx.globalAlpha = 1
    }
  }

  if (state === 'start') drawStartOverlay()
  if (state === 'win') drawWinOverlay()
  if (state === 'gameover') drawGameOverOverlay()
}

function drawShape(shape: ShapeState, editable: boolean): void {
  const { centerX: cx, centerY: cy, radiusX: rx, radiusY: ry, holes } = shape

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(shape.rotation)

  // Main ellipse
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)

  if (editable) {
    ctx.fillStyle = 'rgba(80,120,200,0.25)'
    ctx.strokeStyle = topoMatches() ? '#88ff88' : '#4488ff'
  } else {
    ctx.fillStyle = 'rgba(200,150,50,0.15)'
    ctx.strokeStyle = '#cc8833'
  }
  ctx.fill()
  ctx.lineWidth = 2
  ctx.stroke()

  // Draw holes as inner circles
  for (let h = 0; h < Math.min(holes, 5); h++) {
    const hx = -rx * 0.3 + h * (rx * 0.5)
    const hy = 0
    const hr = Math.min(rx * 0.18, 14)
    ctx.beginPath()
    ctx.ellipse(hx, hy, hr, hr * 0.8, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#0a0a14'
    ctx.fill()
    ctx.strokeStyle = editable ? '#2255aa' : '#885522'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // Topology label
  ctx.fillStyle = editable ? '#88aaff' : '#cc9944'
  ctx.font = `bold ${Math.min(12, rx * 0.22)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText(`H:${holes} P:${shape.parts}`, 0, ry + 16)

  ctx.restore()
}

function drawStartOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(10,10,20,0.93)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#88aaff'
  ctx.font = `bold ${Math.min(42, W * 0.1)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('TOPOLOGY', W / 2, H * 0.2)
  ctx.fillStyle = '#aaa'
  ctx.font = `${Math.min(14, W * 0.03)}px Courier New`
  const lines = [
    'Deform the source shape to match the target.',
    'Topology is about HOLES and PARTS,',
    'not exact shape.',
    '',
    'Tools: Stretch (drag), Punch Hole,',
    'Fill Hole, Merge (join 2 parts).',
    '',
    'Use CHECK MATCH when you think it matches.',
    'Fewer moves = more points!',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.3 + i * H * 0.065))
  drawBtn('PLAY', W / 2, H * 0.86)
}

function drawWinOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(10,10,20,0.93)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ffd700'
  ctx.font = `bold ${Math.min(40, W * 0.1)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('TOPOLOGIST!', W / 2, H * 0.22)
  ctx.fillStyle = '#ccc'
  ctx.font = `${Math.min(18, W * 0.038)}px Courier New`
  ctx.fillText('All 12 levels mastered!', W / 2, H * 0.36)
  ctx.fillText(`Final Score: ${score}`, W / 2, H * 0.44)
  ctx.fillText(`Best: ${bestScore}`, W / 2, H * 0.52)
  drawBtn('PLAY AGAIN', W / 2, H * 0.72)
}

function drawGameOverOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(10,10,20,0.93)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ff6644'
  ctx.font = `bold ${Math.min(40, W * 0.1)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('GAME OVER', W / 2, H * 0.25)
  ctx.fillStyle = '#ccc'
  ctx.font = `${Math.min(18, W * 0.038)}px Courier New`
  ctx.fillText(`Score: ${score} | Best: ${bestScore}`, W / 2, H * 0.42)
  drawBtn('PLAY AGAIN', W / 2, H * 0.65)
}

function drawBtn(label: string, cx: number, cy: number): void {
  const bw = 160; const bh = 44
  ctx.fillStyle = '#4466cc'
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
  } catch { /* standalone */ }
  requestAnimationFrame(loop)
}

void boot()
