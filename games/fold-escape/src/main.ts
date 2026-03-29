import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────

type CellType = 'wall' | 'floor' | 'start' | 'exit'
type CreaseDir = 'h' | 'v' // horizontal or vertical crease

interface Crease {
  dir: CreaseDir
  index: number        // row (h) or col (v) position of the crease line
  folded: boolean
  animProgress: number // 0 = unfolded, 1 = fully folded
}

interface Level {
  grid: CellType[][]
  creases: Crease[]
  par: number
}

type GameState = 'start' | 'playing' | 'win' | 'gameover' | 'animating'

// ── Canvas setup ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hudLevel = document.getElementById('hud-level')!
const hudFolds = document.getElementById('hud-folds')!
const hudPar = document.getElementById('hud-par')!
const hudScore = document.getElementById('hud-score')!

const COLS = 12
const ROWS = 12
let CELL = 40
let OFFSET_X = 0
let OFFSET_Y = 0

function resize(): void {
  const container = canvas.parentElement!
  const size = Math.min(container.clientWidth, container.clientHeight, 520)
  canvas.width = size
  canvas.height = size
  CELL = Math.floor(size / (COLS + 1))
  OFFSET_X = Math.floor((size - COLS * CELL) / 2)
  OFFSET_Y = Math.floor((size - ROWS * CELL) / 2)
}
resize()
window.addEventListener('resize', () => { resize(); draw() })

// ── Level definitions ──────────────────────────────────────────────────────────

function makeGrid(walls: string): CellType[][] {
  const lines = walls.trim().split('\n')
  return lines.map(line =>
    line.split('').map(ch => {
      if (ch === '#') return 'wall'
      if (ch === 'S') return 'start'
      if (ch === 'E') return 'exit'
      return 'floor'
    })
  )
}

const LEVELS: Level[] = [
  // Level 1 — 2 creases, par 3
  {
    grid: makeGrid(
      '############\n' +
      '#S.........#\n' +
      '#..........#\n' +
      '#..........#\n' +
      '#..........#\n' +
      '#..........#\n' +
      '############\n' +
      '#..........#\n' +
      '#..........#\n' +
      '#..........#\n' +
      '#.........E#\n' +
      '############'
    ),
    creases: [
      { dir: 'h', index: 6, folded: false, animProgress: 0 },
      { dir: 'v', index: 6, folded: false, animProgress: 0 },
    ],
    par: 3,
  },
  // Level 2 — 2 creases, walls blocking path
  {
    grid: makeGrid(
      '############\n' +
      '#S....#....#\n' +
      '#.....#....#\n' +
      '#######....#\n' +
      '#..........#\n' +
      '#..........#\n' +
      '############\n' +
      '#..........#\n' +
      '#....#######\n' +
      '#....#.....#\n' +
      '#....#....E#\n' +
      '############'
    ),
    creases: [
      { dir: 'h', index: 6, folded: false, animProgress: 0 },
      { dir: 'v', index: 5, folded: false, animProgress: 0 },
    ],
    par: 2,
  },
  // Level 3 — 3 creases
  {
    grid: makeGrid(
      '############\n' +
      '#S.........#\n' +
      '#..........#\n' +
      '#..##......#\n' +
      '#..##......#\n' +
      '#..........#\n' +
      '#####..#####\n' +
      '#..........#\n' +
      '#......##..#\n' +
      '#......##..#\n' +
      '#.........E#\n' +
      '############'
    ),
    creases: [
      { dir: 'h', index: 6, folded: false, animProgress: 0 },
      { dir: 'v', index: 4, folded: false, animProgress: 0 },
      { dir: 'v', index: 8, folded: false, animProgress: 0 },
    ],
    par: 3,
  },
  // Level 4 — 3 creases
  {
    grid: makeGrid(
      '############\n' +
      '#S....#....#\n' +
      '#.....#....#\n' +
      '#.....#....#\n' +
      '######.####\n' +
      '#..........#\n' +
      '#..........#\n' +
      '#..........#\n' +
      '#####.#####\n' +
      '#.....#....#\n' +
      '#.....#...E#\n' +
      '############'
    ),
    creases: [
      { dir: 'h', index: 4, folded: false, animProgress: 0 },
      { dir: 'h', index: 8, folded: false, animProgress: 0 },
      { dir: 'v', index: 6, folded: false, animProgress: 0 },
    ],
    par: 3,
  },
  // Level 5 — 3 creases
  {
    grid: makeGrid(
      '############\n' +
      '#S#........#\n' +
      '#.#........#\n' +
      '#.#..####..#\n' +
      '#.#........#\n' +
      '#..........#\n' +
      '############\n' +
      '#..........#\n' +
      '#..####....#\n' +
      '#.........##\n' +
      '#........#E#\n' +
      '############'
    ),
    creases: [
      { dir: 'v', index: 2, folded: false, animProgress: 0 },
      { dir: 'h', index: 6, folded: false, animProgress: 0 },
      { dir: 'v', index: 9, folded: false, animProgress: 0 },
    ],
    par: 3,
  },
  // Level 6 — 4 creases
  {
    grid: makeGrid(
      '############\n' +
      '#S.........#\n' +
      '#..........#\n' +
      '######.####\n' +
      '#....#.....#\n' +
      '#....#.....#\n' +
      '#....#.....#\n' +
      '#####.#####\n' +
      '#..........#\n' +
      '#..........#\n' +
      '#.........E#\n' +
      '############'
    ),
    creases: [
      { dir: 'h', index: 3, folded: false, animProgress: 0 },
      { dir: 'v', index: 5, folded: false, animProgress: 0 },
      { dir: 'h', index: 7, folded: false, animProgress: 0 },
      { dir: 'v', index: 8, folded: false, animProgress: 0 },
    ],
    par: 4,
  },
  // Level 7 — 4 creases
  {
    grid: makeGrid(
      '############\n' +
      '#S..#......#\n' +
      '#...#......#\n' +
      '#...###....#\n' +
      '#..........#\n' +
      '#..........#\n' +
      '####.#.#####\n' +
      '#..........#\n' +
      '#..........#\n' +
      '#....###...#\n' +
      '#......#..E#\n' +
      '############'
    ),
    creases: [
      { dir: 'v', index: 4, folded: false, animProgress: 0 },
      { dir: 'h', index: 3, folded: false, animProgress: 0 },
      { dir: 'h', index: 6, folded: false, animProgress: 0 },
      { dir: 'v', index: 7, folded: false, animProgress: 0 },
    ],
    par: 4,
  },
  // Level 8 — 4 creases
  {
    grid: makeGrid(
      '############\n' +
      '#S.........#\n' +
      '#.#########\n' +
      '#..........#\n' +
      '########...#\n' +
      '#..........#\n' +
      '#.....######\n' +
      '#..........#\n' +
      '######.....#\n' +
      '#..........#\n' +
      '#########.E#\n' +
      '############'
    ),
    creases: [
      { dir: 'h', index: 2, folded: false, animProgress: 0 },
      { dir: 'h', index: 4, folded: false, animProgress: 0 },
      { dir: 'h', index: 8, folded: false, animProgress: 0 },
      { dir: 'v', index: 6, folded: false, animProgress: 0 },
    ],
    par: 4,
  },
  // Level 9 — 5 creases
  {
    grid: makeGrid(
      '############\n' +
      '#S.....#...#\n' +
      '#......#...#\n' +
      '#......#...#\n' +
      '#####..####\n' +
      '#..........#\n' +
      '#..........#\n' +
      '####..#####\n' +
      '#..........#\n' +
      '#...#......#\n' +
      '#...#.....E#\n' +
      '############'
    ),
    creases: [
      { dir: 'v', index: 7, folded: false, animProgress: 0 },
      { dir: 'h', index: 4, folded: false, animProgress: 0 },
      { dir: 'h', index: 7, folded: false, animProgress: 0 },
      { dir: 'v', index: 4, folded: false, animProgress: 0 },
      { dir: 'v', index: 3, folded: false, animProgress: 0 },
    ],
    par: 5,
  },
  // Level 10 — 5 creases
  {
    grid: makeGrid(
      '############\n' +
      '#S...#.....#\n' +
      '#....#.....#\n' +
      '#....#.....#\n' +
      '#....#.....#\n' +
      '#####.#####\n' +
      '#..........#\n' +
      '#.####.####\n' +
      '#.#........#\n' +
      '#.#..##....#\n' +
      '#....##...E#\n' +
      '############'
    ),
    creases: [
      { dir: 'v', index: 5, folded: false, animProgress: 0 },
      { dir: 'h', index: 5, folded: false, animProgress: 0 },
      { dir: 'h', index: 7, folded: false, animProgress: 0 },
      { dir: 'v', index: 2, folded: false, animProgress: 0 },
      { dir: 'v', index: 8, folded: false, animProgress: 0 },
    ],
    par: 5,
  },
]

// ── Game State ─────────────────────────────────────────────────────────────────

let state: GameState = 'start'
let levelIndex = 0
let foldCount = 0
let totalScore = 0
let bestScore = 0

// Current working grid (gets mutated by folds)
let workingGrid: CellType[][] = []
let creases: Crease[] = []
let par = 0

// Player position
let playerRow = 0
let playerCol = 0
let playerAnimX = 0
let playerAnimY = 0
let targetRow = 0
let targetCol = 0

// Path-finding for click-to-move
let movePath: { row: number; col: number }[] = []
let moveTimer = 0
const MOVE_INTERVAL = 80

// Fold animation state
let animatingCreaseIdx = -1
const ANIM_SPEED = 0.05

// ── BFS pathfinding ────────────────────────────────────────────────────────────

function bfs(grid: CellType[][], fromRow: number, fromCol: number, toRow: number, toCol: number): { row: number; col: number }[] {
  const visited = Array.from({ length: ROWS }, () => new Array(COLS).fill(false))
  const prev = Array.from({ length: ROWS }, () => new Array(COLS).fill(null))
  const queue: { row: number; col: number }[] = [{ row: fromRow, col: fromCol }]
  visited[fromRow][fromCol] = true

  const dirs = [[-1,0],[1,0],[0,-1],[0,1]]
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (cur.row === toRow && cur.col === toCol) {
      // reconstruct
      const path: { row: number; col: number }[] = []
      let c: { row: number; col: number } | null = cur
      while (c) {
        path.unshift(c)
        c = prev[c.row][c.col]
      }
      return path.slice(1)
    }
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr
      const nc = cur.col + dc
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue
      if (visited[nr][nc]) continue
      if (grid[nr][nc] === 'wall') continue
      visited[nr][nc] = true
      prev[nr][nc] = cur
      queue.push({ row: nr, col: nc })
    }
  }
  return []
}

// ── Level initialization ───────────────────────────────────────────────────────

function deepCopyGrid(g: CellType[][]): CellType[][] {
  return g.map(row => [...row])
}

function loadLevel(idx: number): void {
  const lvl = LEVELS[idx]
  workingGrid = deepCopyGrid(lvl.grid)
  // Deep copy creases
  creases = lvl.creases.map(c => ({ ...c, folded: false, animProgress: 0 }))
  par = lvl.par
  foldCount = 0

  // Find start position
  outer: for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (workingGrid[r][c] === 'start') {
        playerRow = r; playerCol = c
        targetRow = r; targetCol = c
        playerAnimX = c * CELL + OFFSET_X
        playerAnimY = r * CELL + OFFSET_Y
        break outer
      }
    }
  }

  movePath = []
  animatingCreaseIdx = -1
  updateHUD()
}

function updateHUD(): void {
  hudLevel.textContent = String(levelIndex + 1)
  hudFolds.textContent = String(foldCount)
  hudPar.textContent = String(par)
  hudScore.textContent = String(totalScore)
}

// ── Fold logic ─────────────────────────────────────────────────────────────────

function flipCell(c: CellType): CellType {
  if (c === 'wall') return 'floor'
  if (c === 'floor') return 'wall'
  return c // keep start/exit intact
}

function applyFold(creaseIdx: number): void {
  const crease = creases[creaseIdx]
  crease.folded = !crease.folded

  if (crease.dir === 'h') {
    // Flip rows below the crease line
    for (let r = crease.index; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        workingGrid[r][c] = flipCell(workingGrid[r][c])
      }
    }
  } else {
    // Flip cols to the right of the crease line
    for (let r = 0; r < ROWS; r++) {
      for (let c = crease.index; c < COLS; c++) {
        workingGrid[r][c] = flipCell(workingGrid[r][c])
      }
    }
  }

  // Check if player is now in a wall — push player to nearest floor
  if (workingGrid[playerRow][playerCol] === 'wall') {
    const dirs = [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]
    for (const [dr, dc] of dirs) {
      const nr = playerRow + dr
      const nc = playerCol + dc
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && workingGrid[nr][nc] !== 'wall') {
        playerRow = nr; playerCol = nc
        targetRow = nr; targetCol = nc
        break
      }
    }
  }
}

// ── Input: click on crease or cell ────────────────────────────────────────────

function getCreaseAtPixel(px: number, py: number): number {
  const col = (px - OFFSET_X) / CELL
  const row = (py - OFFSET_Y) / CELL

  for (let i = 0; i < creases.length; i++) {
    const cr = creases[i]
    if (cr.dir === 'h') {
      // Horizontal crease line at row = cr.index
      const lineY = cr.index
      if (Math.abs(row - lineY) < 0.4 && col >= 0 && col <= COLS) return i
    } else {
      // Vertical crease line at col = cr.index
      const lineX = cr.index
      if (Math.abs(col - lineX) < 0.4 && row >= 0 && row <= ROWS) return i
    }
  }
  return -1
}

function getCellAtPixel(px: number, py: number): { row: number; col: number } | null {
  const col = Math.floor((px - OFFSET_X) / CELL)
  const row = Math.floor((py - OFFSET_Y) / CELL)
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null
  return { row, col }
}

canvas.addEventListener('click', (e: MouseEvent) => {
  if (state !== 'playing') return
  const rect = canvas.getBoundingClientRect()
  const px = (e.clientX - rect.left) * (canvas.width / rect.width)
  const py = (e.clientY - rect.top) * (canvas.height / rect.height)
  handleClick(px, py)
})

canvas.addEventListener('touchend', (e: TouchEvent) => {
  if (state !== 'playing') return
  e.preventDefault()
  const touch = e.changedTouches[0]
  const rect = canvas.getBoundingClientRect()
  const px = (touch.clientX - rect.left) * (canvas.width / rect.width)
  const py = (touch.clientY - rect.top) * (canvas.height / rect.height)
  handleClick(px, py)
}, { passive: false })

function handleClick(px: number, py: number): void {
  // Check if clicking on a crease first
  const creaseIdx = getCreaseAtPixel(px, py)
  if (creaseIdx !== -1) {
    // Trigger fold animation
    foldCount++
    animatingCreaseIdx = creaseIdx
    creases[creaseIdx].animProgress = 0
    state = 'animating'
    audio.click()
    updateHUD()
    return
  }

  // Check if clicking on a floor cell to move
  const cell = getCellAtPixel(px, py)
  if (!cell) return
  if (workingGrid[cell.row][cell.col] === 'wall') return

  const path = bfs(workingGrid, playerRow, playerCol, cell.row, cell.col)
  if (path.length > 0) {
    movePath = path
  }
}

// ── Main loop ──────────────────────────────────────────────────────────────────

let lastTime = 0

function loop(now: number): void {
  const dt = now - lastTime
  lastTime = now

  if (state === 'animating') {
    const cr = creases[animatingCreaseIdx]
    cr.animProgress = Math.min(1, cr.animProgress + ANIM_SPEED * (dt / 16))
    if (cr.animProgress >= 1) {
      applyFold(animatingCreaseIdx)
      animatingCreaseIdx = -1
      state = 'playing'
      checkWin()
    }
  }

  if (state === 'playing' || state === 'animating') {
    // Move player along path
    if (movePath.length > 0 && state === 'playing') {
      moveTimer += dt
      if (moveTimer >= MOVE_INTERVAL) {
        moveTimer = 0
        const next = movePath.shift()!
        playerRow = next.row
        playerCol = next.col

        // Smooth animation target
        targetRow = playerRow
        targetCol = playerCol
        checkWin()
      }
    }

    // Smooth player position
    const targetX = targetCol * CELL + OFFSET_X
    const targetY = targetRow * CELL + OFFSET_Y
    playerAnimX += (targetX - playerAnimX) * 0.25
    playerAnimY += (targetY - playerAnimY) * 0.25
  }

  draw()
  requestAnimationFrame(loop)
}

function checkWin(): void {
  if (workingGrid[playerRow][playerCol] === 'exit') {
    // Level complete
    const efficiency = Math.max(0, par - foldCount)
    const levelScore = 100 + efficiency * 50
    totalScore += levelScore
    audio.levelUp()
    if (levelIndex + 1 >= LEVELS.length) {
      // All levels complete
      state = 'win'
      if (totalScore > bestScore) {
        bestScore = totalScore
        saveBestScore(bestScore)
      }
      reportGameOver(totalScore)
    } else {
      levelIndex++
      loadLevel(levelIndex)
      state = 'playing'
      reportScore(totalScore)
    }
  }
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function draw(): void {
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  // Paper background
  ctx.fillStyle = '#f9f4e8'
  ctx.fillRect(0, 0, W, H)

  // Grid shadow
  ctx.shadowColor = 'rgba(0,0,0,0.15)'
  ctx.shadowBlur = 8
  ctx.fillStyle = '#fffff0'
  ctx.fillRect(OFFSET_X, OFFSET_Y, COLS * CELL, ROWS * CELL)
  ctx.shadowBlur = 0

  // Draw fold shading for folded sections
  for (const crease of creases) {
    if (crease.folded) {
      ctx.fillStyle = 'rgba(180,160,120,0.12)'
      if (crease.dir === 'h') {
        ctx.fillRect(OFFSET_X, OFFSET_Y + crease.index * CELL, COLS * CELL, (ROWS - crease.index) * CELL)
      } else {
        ctx.fillRect(OFFSET_X + crease.index * CELL, OFFSET_Y, (COLS - crease.index) * CELL, ROWS * CELL)
      }
    }
  }

  // Draw cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = OFFSET_X + c * CELL
      const y = OFFSET_Y + r * CELL
      const cell = workingGrid[r][c]

      if (cell === 'wall') {
        ctx.fillStyle = '#8b6f47'
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
        // Pencil hatch
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'
        ctx.lineWidth = 0.5
        for (let i = 0; i < CELL; i += 5) {
          ctx.beginPath()
          ctx.moveTo(x + i, y)
          ctx.lineTo(x, y + i)
          ctx.stroke()
        }
      } else if (cell === 'start') {
        ctx.fillStyle = '#d4edda'
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
        ctx.fillStyle = '#28a745'
        ctx.beginPath()
        ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.3, 0, Math.PI * 2)
        ctx.fill()
      } else if (cell === 'exit') {
        ctx.fillStyle = '#fde8e8'
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
        ctx.fillStyle = '#dc3545'
        const s = CELL * 0.25
        ctx.fillRect(x + CELL / 2 - s, y + CELL / 2 - s, s * 2, s * 2)
      } else {
        // floor — subtle grid lines
        ctx.strokeStyle = 'rgba(180,160,120,0.25)'
        ctx.lineWidth = 0.5
        ctx.strokeRect(x, y, CELL, CELL)
      }
    }
  }

  // Draw crease lines
  for (let i = 0; i < creases.length; i++) {
    const crease = creases[i]
    const isAnimating = state === 'animating' && i === animatingCreaseIdx
    const prog = crease.animProgress

    ctx.save()
    if (isAnimating) {
      // Animate fold — scale the folded section
      if (crease.dir === 'h') {
        const pivotY = OFFSET_Y + crease.index * CELL
        const scaleY = 1 - Math.sin(prog * Math.PI) * 0.6
        ctx.translate(0, pivotY + (ROWS - crease.index) * CELL / 2)
        ctx.scale(1, scaleY)
        ctx.translate(0, -((ROWS - crease.index) * CELL / 2))
      } else {
        const pivotX = OFFSET_X + crease.index * CELL
        const scaleX = 1 - Math.sin(prog * Math.PI) * 0.6
        ctx.translate(pivotX + (COLS - crease.index) * CELL / 2, 0)
        ctx.scale(scaleX, 1)
        ctx.translate(-((COLS - crease.index) * CELL / 2), 0)
      }
    }

    // Draw dashed crease line
    ctx.setLineDash([6, 4])
    ctx.lineWidth = 2
    ctx.strokeStyle = crease.folded ? '#c0a060' : '#3a8abf'

    if (crease.dir === 'h') {
      const y = OFFSET_Y + crease.index * CELL
      ctx.beginPath()
      ctx.moveTo(OFFSET_X, y)
      ctx.lineTo(OFFSET_X + COLS * CELL, y)
      ctx.stroke()
      // Label
      ctx.setLineDash([])
      ctx.fillStyle = crease.folded ? '#c0a060' : '#3a8abf'
      ctx.font = `bold ${Math.max(10, CELL * 0.3)}px Courier New`
      ctx.textAlign = 'right'
      ctx.fillText(crease.folded ? '↑ fold' : '↓ fold', OFFSET_X - 2, y + 4)
    } else {
      const x = OFFSET_X + crease.index * CELL
      ctx.beginPath()
      ctx.moveTo(x, OFFSET_Y)
      ctx.lineTo(x, OFFSET_Y + ROWS * CELL)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = crease.folded ? '#c0a060' : '#3a8abf'
      ctx.font = `bold ${Math.max(9, CELL * 0.28)}px Courier New`
      ctx.textAlign = 'center'
      ctx.fillText(crease.folded ? '← fold' : '→ fold', x, OFFSET_Y - 4)
    }
    ctx.setLineDash([])
    ctx.restore()
  }

  // Draw player
  if (state === 'playing' || state === 'animating') {
    const px = playerAnimX + CELL / 2
    const py = playerAnimY + CELL / 2
    const r = CELL * 0.32

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(px + 2, py + 3, r, r * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()

    // Player dot
    ctx.fillStyle = '#2c5282'
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#63b3ed'
    ctx.beginPath()
    ctx.arc(px - r * 0.25, py - r * 0.25, r * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // Overlays
  if (state === 'start') {
    drawOverlay('FOLD ESCAPE', [
      'Navigate from green to red.',
      'Click dashed crease lines to fold the paper.',
      'Folding flips walls to floors!',
      'Use fewer folds for bonus points.',
      '',
      'Click anywhere to start',
    ], '#PLAY')
  } else if (state === 'win') {
    drawOverlay('YOU ESCAPED!', [
      `Final Score: ${totalScore}`,
      `Best: ${bestScore}`,
      '',
      'All 10 levels completed!',
      '',
      'Click to play again',
    ], '#REPLAY')
  }
}

function drawOverlay(title: string, lines: string[], _btn: string): void {
  const W = canvas.width
  const H = canvas.height
  ctx.fillStyle = 'rgba(245,240,230,0.92)'
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = '#3a2d1a'
  ctx.font = `bold ${Math.min(48, W * 0.1)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText(title, W / 2, H * 0.25)

  ctx.font = `${Math.min(18, W * 0.038)}px Courier New`
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, H * 0.38 + i * (W * 0.05))
  })

  // Button
  const btnW = Math.min(180, W * 0.4)
  const btnH = 44
  const btnX = W / 2 - btnW / 2
  const btnY = H * 0.78
  ctx.fillStyle = '#3a8abf'
  ctx.beginPath()
  ctx.roundRect(btnX, btnY, btnW, btnH, 8)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.min(20, W * 0.042)}px Courier New`
  ctx.fillText(state === 'start' ? 'PLAY' : 'PLAY AGAIN', W / 2, btnY + 28)
}

// ── Overlay click ──────────────────────────────────────────────────────────────

canvas.addEventListener('click', (e: MouseEvent) => {
  if (state === 'start') {
    state = 'playing'
    audio.start()
    loadLevel(levelIndex)
  } else if (state === 'win') {
    levelIndex = 0
    totalScore = 0
    state = 'playing'
    audio.start()
    loadLevel(0)
  }
})

// Mute button
document.getElementById('mute-btn')!.addEventListener('click', () => {
  const m = audio.toggleMute()
  ;(document.getElementById('mute-btn') as HTMLButtonElement).textContent = m ? '🔇' : '🔊'
})

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { bestScore: saved } = await initSDK()
    bestScore = saved
  } catch { /* standalone mode */ }
  requestAnimationFrame(loop)
}

void boot()
