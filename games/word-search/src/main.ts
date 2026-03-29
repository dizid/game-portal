// Word Search — main entry point

import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Cell {
  letter: string
  row: number
  col: number
}

interface PlacedWord {
  word: string
  cells: Cell[]
  color: string
  found: boolean
}

interface Puzzle {
  name: string
  words: string[]
  grid: string[][] // pre-built 12x12
}

// ── Constants ──────────────────────────────────────────────────────────────────

const GRID_SIZE = 12
const COLORS = [
  'rgba(100,200,255,0.55)',
  'rgba(100,255,150,0.55)',
  'rgba(255,200,80,0.55)',
  'rgba(255,100,180,0.55)',
  'rgba(180,100,255,0.55)',
  'rgba(255,140,80,0.55)',
  'rgba(80,220,200,0.55)',
  'rgba(255,255,100,0.55)',
]

interface WordPlacement {
  word: string
  r: number
  c: number
  dr: number
  dc: number
}

function buildGrid(placements: WordPlacement[]): string[][] {
  const grid: string[][] = Array.from({ length: GRID_SIZE }, () =>
    Array(GRID_SIZE).fill('')
  )
  for (const p of placements) {
    for (let i = 0; i < p.word.length; i++) {
      const r = p.r + p.dr * i
      const c = p.c + p.dc * i
      if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
        grid[r][c] = p.word[i]
      }
    }
  }
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!grid[r][c]) {
        grid[r][c] = letters[Math.floor(Math.random() * letters.length)]
      }
    }
  }
  return grid
}

// Pre-built placement data for each puzzle
const PLACEMENTS: WordPlacement[][] = [
  // Animals
  [
    { word:'CAT',  r:0,  c:0,  dr:0, dc:1 },
    { word:'DOG',  r:1,  c:5,  dr:0, dc:1 },
    { word:'FISH', r:3,  c:2,  dr:0, dc:1 },
    { word:'BIRD', r:2,  c:8,  dr:1, dc:0 },
    { word:'LION', r:5,  c:0,  dr:1, dc:1 },
    { word:'BEAR', r:7,  c:6,  dr:0, dc:1 },
    { word:'WOLF', r:9,  c:1,  dr:0, dc:1 },
    { word:'DEER', r:10, c:7,  dr:1, dc:0 },
  ],
  // Countries
  [
    { word:'FRANCE', r:0, c:0,  dr:0, dc:1 },
    { word:'SPAIN',  r:2, c:4,  dr:0, dc:1 },
    { word:'JAPAN',  r:4, c:0,  dr:1, dc:0 },
    { word:'BRAZIL', r:1, c:6,  dr:1, dc:0 },
    { word:'EGYPT',  r:7, c:2,  dr:0, dc:1 },
    { word:'INDIA',  r:5, c:7,  dr:1, dc:1 },
    { word:'CHILE',  r:9, c:0,  dr:0, dc:1 },
    { word:'KENYA',  r:8, c:7,  dr:1, dc:0 },
  ],
  // Food
  [
    { word:'PIZZA', r:0, c:0,  dr:0, dc:1 },
    { word:'PASTA', r:2, c:5,  dr:0, dc:1 },
    { word:'BREAD', r:4, c:0,  dr:1, dc:1 },
    { word:'SALAD', r:1, c:7,  dr:0, dc:1 },
    { word:'STEAK', r:6, c:4,  dr:0, dc:1 },
    { word:'SUSHI', r:3, c:7,  dr:1, dc:0 },
    { word:'TACOS', r:8, c:0,  dr:0, dc:1 },
    { word:'CURRY', r:9, c:7,  dr:1, dc:0 },
  ],
  // Space
  [
    { word:'STAR',  r:0, c:0,  dr:0, dc:1 },
    { word:'MOON',  r:2, c:6,  dr:0, dc:1 },
    { word:'MARS',  r:4, c:1,  dr:1, dc:0 },
    { word:'EARTH', r:1, c:3,  dr:1, dc:1 },
    { word:'VENUS', r:0, c:7,  dr:0, dc:1 },
    { word:'ORBIT', r:7, c:0,  dr:0, dc:1 },
    { word:'COMET', r:6, c:7,  dr:1, dc:0 },
    { word:'PLUTO', r:9, c:5,  dr:0, dc:1 },
  ],
  // Sports
  [
    { word:'GOLF',   r:0, c:0, dr:0, dc:1 },
    { word:'SWIM',   r:2, c:7, dr:0, dc:1 },
    { word:'RUGBY',  r:4, c:0, dr:1, dc:0 },
    { word:'TENNIS', r:1, c:4, dr:0, dc:1 },
    { word:'BOXING', r:3, c:6, dr:1, dc:0 },
    { word:'SOCCER', r:7, c:0, dr:0, dc:1 },
    { word:'HOCKEY', r:6, c:6, dr:1, dc:0 },
    { word:'SKIING', r:9, c:4, dr:0, dc:1 },
  ],
]

const PUZZLE_NAMES = ['Animals', 'Countries', 'Food', 'Space', 'Sports']
const PUZZLE_WORD_LISTS = [
  ['CAT','DOG','FISH','BIRD','LION','BEAR','WOLF','DEER'],
  ['FRANCE','SPAIN','JAPAN','BRAZIL','EGYPT','INDIA','CHILE','KENYA'],
  ['PIZZA','PASTA','BREAD','SALAD','STEAK','SUSHI','TACOS','CURRY'],
  ['STAR','MOON','MARS','EARTH','VENUS','ORBIT','COMET','PLUTO'],
  ['GOLF','SWIM','RUGBY','TENNIS','BOXING','SOCCER','HOCKEY','SKIING'],
]

// Build PlacedWord list from placement data
function buildPlacedWords(pIdx: number, grid: string[][]): PlacedWord[] {
  return PLACEMENTS[pIdx].map((p, idx) => {
    const cells: Cell[] = []
    for (let i = 0; i < p.word.length; i++) {
      const r = p.r + p.dr * i
      const c = p.c + p.dc * i
      cells.push({ letter: grid[r][c], row: r, col: c })
    }
    return { word: p.word, cells, color: COLORS[idx % COLORS.length], found: false }
  })
}

// ── Game state ─────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx2d = canvas.getContext('2d')!
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const timerEl = document.getElementById('timer-value') as HTMLSpanElement
const highScoreEl = document.getElementById('high-score-value') as HTMLSpanElement
const wordListEl = document.getElementById('word-list') as HTMLDivElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

let cellSize = 36
let currentPuzzleIdx = 0
let placedWords: PlacedWord[] = []
let currentGrid: string[][] = []
let score = 0
let highScore = 0
let timerSeconds = 0
let timerHandle = 0
let gameActive = false
let allFound = false

// Drag state
let dragging = false
let dragStart: { row: number; col: number } | null = null
let dragEnd: { row: number; col: number } | null = null

// ── Canvas sizing ──────────────────────────────────────────────────────────────

function resizeCanvas(): void {
  const wrap = document.getElementById('canvas-wrap')!
  const availW = wrap.clientWidth - 16
  const availH = wrap.clientHeight - 16
  const size = Math.min(availW, availH, 480)
  cellSize = Math.floor(size / GRID_SIZE)
  const actual = cellSize * GRID_SIZE
  canvas.width = actual
  canvas.height = actual
  canvas.style.width = `${actual}px`
  canvas.style.height = `${actual}px`
  draw()
}

// ── Load puzzle ────────────────────────────────────────────────────────────────

function loadPuzzle(idx: number): void {
  currentPuzzleIdx = idx
  currentGrid = buildGrid(PLACEMENTS[idx])
  placedWords = buildPlacedWords(idx, currentGrid)
  score = 0
  timerSeconds = 0
  allFound = false
  clearInterval(timerHandle)
  renderWordList()
  updateHUD()
  document.querySelectorAll('.puzzle-btn').forEach((btn) => {
    btn.classList.toggle('active', Number((btn as HTMLElement).dataset.idx) === idx)
  })
  draw()
}

function startTimer(): void {
  clearInterval(timerHandle)
  timerHandle = window.setInterval(() => { timerSeconds++; updateHUD() }, 1000)
}

// ── Word list DOM (no innerHTML — safe DOM construction) ───────────────────────

function renderWordList(): void {
  // Remove all existing children safely
  while (wordListEl.firstChild) wordListEl.removeChild(wordListEl.firstChild)
  for (const pw of placedWords) {
    const div = document.createElement('div')
    div.className = 'word-item'
    div.id = `word-item-${pw.word}`
    div.textContent = pw.word
    wordListEl.appendChild(div)
  }
}

function markWordFound(word: string): void {
  const el = document.getElementById(`word-item-${word}`)
  if (el) el.classList.add('found')
}

// ── HUD ────────────────────────────────────────────────────────────────────────

function updateHUD(): void {
  scoreEl.textContent = String(score)
  timerEl.textContent = String(timerSeconds)
  highScoreEl.textContent = String(highScore)
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function draw(): void {
  const cs = cellSize
  ctx2d.clearRect(0, 0, canvas.width, canvas.height)

  // Background
  ctx2d.fillStyle = '#12122a'
  ctx2d.fillRect(0, 0, canvas.width, canvas.height)

  // Grid lines
  ctx2d.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx2d.lineWidth = 1
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx2d.beginPath(); ctx2d.moveTo(i * cs, 0); ctx2d.lineTo(i * cs, canvas.height); ctx2d.stroke()
    ctx2d.beginPath(); ctx2d.moveTo(0, i * cs); ctx2d.lineTo(canvas.width, i * cs); ctx2d.stroke()
  }

  // Found word highlights
  for (const pw of placedWords) {
    if (!pw.found) continue
    ctx2d.fillStyle = pw.color
    for (const cell of pw.cells) {
      ctx2d.fillRect(cell.col * cs + 1, cell.row * cs + 1, cs - 2, cs - 2)
    }
  }

  // Current drag highlight
  if (dragging && dragStart && dragEnd) {
    const snapped = getSnappedEnd(dragStart, dragEnd)
    const cells = getLineCells(dragStart, snapped)
    ctx2d.fillStyle = 'rgba(255,255,255,0.2)'
    for (const cell of cells) {
      ctx2d.fillRect(cell.col * cs + 1, cell.row * cs + 1, cs - 2, cs - 2)
    }
  }

  // Letters
  ctx2d.textAlign = 'center'
  ctx2d.textBaseline = 'middle'
  const fontSize = Math.max(12, Math.floor(cs * 0.5))
  ctx2d.font = `bold ${fontSize}px 'Courier New', monospace`
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      ctx2d.fillStyle = '#e0e0f0'
      ctx2d.fillText(currentGrid[r]?.[c] ?? '', c * cs + cs / 2, r * cs + cs / 2)
    }
  }

  // All-found overlay
  if (allFound) {
    ctx2d.fillStyle = 'rgba(0,0,0,0.65)'
    ctx2d.fillRect(0, 0, canvas.width, canvas.height)
    ctx2d.textAlign = 'center'
    ctx2d.textBaseline = 'middle'
    ctx2d.fillStyle = '#64b4ff'
    ctx2d.font = `bold ${Math.floor(cs * 1.2)}px 'Courier New', monospace`
    ctx2d.fillText('PUZZLE COMPLETE!', canvas.width / 2, canvas.height / 2 - 20)
    ctx2d.fillStyle = '#fff'
    ctx2d.font = `${Math.floor(cs * 0.65)}px 'Courier New', monospace`
    ctx2d.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 22)
    ctx2d.fillText('Tap a puzzle to play again', canvas.width / 2, canvas.height / 2 + 48)
  }
}

// ── Selection logic ────────────────────────────────────────────────────────────

function cellFromXY(x: number, y: number): { row: number; col: number } | null {
  const rect = canvas.getBoundingClientRect()
  const cx = x - rect.left
  const cy = y - rect.top
  const col = Math.floor(cx / cellSize)
  const row = Math.floor(cy / cellSize)
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null
  return { row, col }
}

function getSnappedEnd(
  start: { row: number; col: number },
  raw: { row: number; col: number }
): { row: number; col: number } {
  const dr = raw.row - start.row
  const dc = raw.col - start.col
  const adx = Math.abs(dc)
  const ady = Math.abs(dr)
  if (adx === 0 && ady === 0) return start
  // Snap to 8 directions — pick closest
  if (adx > ady * 2) return { row: start.row, col: start.col + Math.sign(dc) * adx }
  if (ady > adx * 2) return { row: start.row + Math.sign(dr) * ady, col: start.col }
  const diagLen = Math.min(adx, ady)
  return { row: start.row + Math.sign(dr) * diagLen, col: start.col + Math.sign(dc) * diagLen }
}

function getLineCells(
  start: { row: number; col: number },
  end: { row: number; col: number }
): { row: number; col: number }[] {
  const dr = end.row - start.row
  const dc = end.col - start.col
  const len = Math.max(Math.abs(dr), Math.abs(dc))
  if (len === 0) return [start]
  const stepR = dr === 0 ? 0 : Math.sign(dr)
  const stepC = dc === 0 ? 0 : Math.sign(dc)
  const cells: { row: number; col: number }[] = []
  for (let i = 0; i <= len; i++) {
    cells.push({ row: start.row + stepR * i, col: start.col + stepC * i })
  }
  return cells
}

function checkSelection(
  start: { row: number; col: number },
  end: { row: number; col: number }
): void {
  const snapped = getSnappedEnd(start, end)
  const cells = getLineCells(start, snapped)
  if (cells.length < 2) return
  const selected = cells.map(c => currentGrid[c.row]?.[c.col] ?? '').join('')
  const reversed = selected.split('').reverse().join('')

  for (const pw of placedWords) {
    if (pw.found) continue
    if (pw.word === selected || pw.word === reversed) {
      pw.found = true
      audio.found()
      const wordScore = 100 + pw.word.length * 10
      const timeBonus = Math.max(0, 300 - timerSeconds) * 2
      score += wordScore + timeBonus
      reportScore(score)
      updateHUD()
      markWordFound(pw.word)
      if (score > highScore) {
        highScore = score
        saveHighScore(highScore)
        updateHUD()
      }
      if (placedWords.every(w => w.found)) {
        allFound = true
        clearInterval(timerHandle)
        audio.complete()
        reportGameOver(score)
      }
      break
    }
  }
}

// ── Input ──────────────────────────────────────────────────────────────────────

function onPointerDown(e: PointerEvent): void {
  if (!gameActive) {
    gameActive = true
    audio.start()
    startTimer()
  }
  canvas.setPointerCapture(e.pointerId)
  dragging = true
  dragStart = cellFromXY(e.clientX, e.clientY)
  dragEnd = dragStart
  draw()
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging || !dragStart) return
  const cell = cellFromXY(e.clientX, e.clientY)
  if (cell) { dragEnd = cell; draw() }
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging || !dragStart) return
  dragging = false
  const cell = cellFromXY(e.clientX, e.clientY)
  if (cell) dragEnd = cell
  if (dragStart && dragEnd) checkSelection(dragStart, dragEnd)
  dragStart = null
  dragEnd = null
  draw()
}

canvas.addEventListener('pointerdown', onPointerDown)
canvas.addEventListener('pointermove', onPointerMove)
canvas.addEventListener('pointerup', onPointerUp)

// Puzzle select buttons
document.querySelectorAll('.puzzle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const idx = Number((btn as HTMLElement).dataset.idx)
    gameActive = false
    clearInterval(timerHandle)
    timerSeconds = 0
    loadPuzzle(idx)
  })
})

// Mute
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: saved } = await initSDK()
    highScore = saved
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }
  window.addEventListener('resize', resizeCanvas)
  resizeCanvas()
  loadPuzzle(0)
  updateHUD()
}

void boot()
