// 2048 — main entry: DOM rendering, input, game loop

import { Game2048 } from './game.js'
import type { TileData } from './game.js'
import { initSDK, reportScore, reportGameOver, saveBest } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── Mute button ───────────────────────────────────────────────────────────────

const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── Tile colors ───────────────────────────────────────────────────────────────

const TILE_STYLES: Record<number, { bg: string; color: string; shadow: string }> = {
  2:    { bg: '#eee4da', color: '#776e65', shadow: 'none' },
  4:    { bg: '#ede0c8', color: '#776e65', shadow: 'none' },
  8:    { bg: '#f2b179', color: '#f9f6f2', shadow: '0 0 12px rgba(242,177,121,0.6)' },
  16:   { bg: '#f59563', color: '#f9f6f2', shadow: '0 0 14px rgba(245,149,99,0.7)' },
  32:   { bg: '#f67c5f', color: '#f9f6f2', shadow: '0 0 14px rgba(246,124,95,0.7)' },
  64:   { bg: '#f65e3b', color: '#f9f6f2', shadow: '0 0 16px rgba(246,94,59,0.8)' },
  128:  { bg: '#edcf72', color: '#f9f6f2', shadow: '0 0 18px rgba(237,207,114,0.9)' },
  256:  { bg: '#edcc61', color: '#f9f6f2', shadow: '0 0 20px rgba(237,204,97,0.9)' },
  512:  { bg: '#edc850', color: '#f9f6f2', shadow: '0 0 22px rgba(237,200,80,1)' },
  1024: { bg: '#edc53f', color: '#f9f6f2', shadow: '0 0 26px rgba(255,220,50,1)' },
  2048: { bg: '#f5c542', color: '#1a1a2e', shadow: '0 0 32px rgba(245,197,66,1), 0 0 60px rgba(245,197,66,0.6)' },
}

function getTileStyle(value: number): { bg: string; color: string; shadow: string } {
  return TILE_STYLES[value] ?? { bg: '#3c3a5e', color: '#f9f6f2', shadow: '0 0 30px rgba(200,180,255,0.8)' }
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const container   = document.getElementById('game-container') as HTMLDivElement
const gridBg      = document.getElementById('grid-bg') as HTMLDivElement
const tileLayer   = document.getElementById('tile-layer') as HTMLDivElement
const overlay     = document.getElementById('overlay') as HTMLDivElement
const startBtn    = document.getElementById('start-btn') as HTMLButtonElement
const scoreEl     = document.getElementById('score-value') as HTMLSpanElement
const bestEl      = document.getElementById('best-value') as HTMLSpanElement

// ── Board sizing ──────────────────────────────────────────────────────────────

const GAP = 10
const PADDING = 10

function getBoardSize(): number {
  const maxW = container.clientWidth - 24
  const maxH = container.clientHeight - 80
  return Math.min(maxW, maxH, 480)
}

function getCellSize(boardSize: number): number {
  return (boardSize - PADDING * 2 - GAP * 3) / 4
}

function setupGrid(): void {
  const size = getBoardSize()
  const wrapper = document.getElementById('board-wrapper') as HTMLDivElement
  wrapper.style.width = `${size}px`
  wrapper.style.height = `${size}px`

  const cellSize = getCellSize(size)
  gridBg.style.gridTemplateColumns = `repeat(4, ${cellSize}px)`
  gridBg.style.gap = `${GAP}px`
  gridBg.style.padding = `${PADDING}px`
  gridBg.style.width = `${size}px`
  gridBg.style.height = `${size}px`

  // Build background cells if not yet built
  if (gridBg.children.length === 0) {
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement('div')
      cell.className = 'grid-cell'
      cell.style.width = `${cellSize}px`
      cell.style.height = `${cellSize}px`
      gridBg.appendChild(cell)
    }
  } else {
    Array.from(gridBg.children).forEach((child) => {
      const el = child as HTMLElement
      el.style.width = `${cellSize}px`
      el.style.height = `${cellSize}px`
    })
  }
}

function tilePosition(row: number, col: number, boardSize: number): { left: number; top: number } {
  const cell = getCellSize(boardSize)
  return {
    left: PADDING + col * (cell + GAP),
    top:  PADDING + row * (cell + GAP),
  }
}

// ── Tile DOM management ───────────────────────────────────────────────────────

const domTiles = new Map<number, HTMLDivElement>()

function renderTiles(tiles: TileData[]): void {
  const boardSize = getBoardSize()
  const cellSize  = getCellSize(boardSize)
  const fontSize  = cellSize < 80 ? cellSize * 0.36 : cellSize * 0.32

  // Remove tiles no longer in state
  const activeIds = new Set(tiles.map((t) => t.id))
  for (const [id, el] of domTiles) {
    if (!activeIds.has(id)) {
      el.remove()
      domTiles.delete(id)
    }
  }

  for (const tile of tiles) {
    const { left, top } = tilePosition(tile.row, tile.col, boardSize)
    const style = getTileStyle(tile.value)

    let el = domTiles.get(tile.id)
    if (!el) {
      // Create new tile element using safe DOM methods (no innerHTML)
      el = document.createElement('div')
      el.className = 'tile'
      tileLayer.appendChild(el)
      domTiles.set(tile.id, el)
    }

    // Remove animation classes to allow re-triggering
    el.classList.remove('tile-new', 'tile-merged')

    // Update position (CSS transition handles slide)
    el.style.left = `${left}px`
    el.style.top  = `${top}px`
    el.style.width  = `${cellSize}px`
    el.style.height = `${cellSize}px`
    el.style.fontSize = `${fontSize}px`
    el.style.background = style.bg
    el.style.color = style.color
    el.style.boxShadow = style.shadow
    el.textContent = String(tile.value)

    // Trigger animations — use void + RAF to ensure the class is applied fresh
    if (tile.isNew) {
      void el.offsetWidth  // force reflow
      el.classList.add('tile-new')
    } else if (tile.isMerged) {
      void el.offsetWidth
      el.classList.add('tile-merged')
    }
  }
}

// ── Game instance ─────────────────────────────────────────────────────────────

let game: Game2048
let lastReportedScore = -1

function updateHUD(score: number, best: number): void {
  scoreEl.textContent = String(score)
  bestEl.textContent  = String(best)
}

function buildOverlay(title: string, sub: string, btnLabel: string, secondaryLabel?: string): void {
  // Build overlay content using safe DOM methods
  overlay.textContent = ''

  const titleEl = document.createElement('div')
  titleEl.className = 'overlay-title'
  titleEl.textContent = title
  overlay.appendChild(titleEl)

  const subEl = document.createElement('div')
  subEl.className = 'overlay-sub'
  subEl.textContent = sub
  overlay.appendChild(subEl)

  const primaryBtn = document.createElement('button')
  primaryBtn.className = 'overlay-btn'
  primaryBtn.id = 'overlay-primary'
  primaryBtn.textContent = btnLabel
  overlay.appendChild(primaryBtn)

  if (secondaryLabel) {
    const secondaryBtn = document.createElement('button')
    secondaryBtn.className = 'overlay-btn secondary'
    secondaryBtn.id = 'overlay-secondary'
    secondaryBtn.textContent = secondaryLabel
    overlay.appendChild(secondaryBtn)
  }

  overlay.classList.remove('hidden')

  primaryBtn.addEventListener('click', () => {
    if (title === 'You Win!') {
      game.keepPlaying()
      overlay.classList.add('hidden')
    } else {
      startGame()
    }
  })

  document.getElementById('overlay-secondary')?.addEventListener('click', startGame)
}

function startGame(): void {
  audio.start()
  game.start()
  overlay.classList.add('hidden')
  lastReportedScore = -1
  renderTiles([])
  const snap = game.getSnapshot()
  renderTiles(snap.tiles)
  updateHUD(snap.score, snap.best)
}

function handleMove(dir: 'up' | 'down' | 'left' | 'right'): void {
  if (game.getState() !== 'PLAYING') return
  const moved = game.handleMove(dir)
  if (!moved) return

  const snap = game.getSnapshot()

  // Any merge = score sound; simple slide = blip
  const hasMerge = snap.tiles.some((t) => t.isMerged)
  if (hasMerge) {
    audio.score()
    try { navigator.vibrate(10) } catch {}
  } else {
    audio.blip()
  }

  renderTiles(snap.tiles)
  updateHUD(snap.score, snap.best)

  if (snap.score !== lastReportedScore) {
    reportScore(snap.score)
    lastReportedScore = snap.score
  }

  if (snap.state === 'WON') {
    saveBest(snap.best)
    audio.levelUp()
    buildOverlay('You Win!', `Score: ${snap.score}`, 'Keep Going', 'New Game')
  } else if (snap.state === 'GAME_OVER') {
    saveBest(snap.best)
    reportGameOver(snap.score)
    audio.death()
    try { navigator.vibrate([50, 30, 50]) } catch {}
    buildOverlay('Game Over', `Score: ${snap.score}`, 'Try Again')
  }
}

// ── Keyboard input ────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  const map: Record<string, 'up' | 'down' | 'left' | 'right'> = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
  }
  const dir = map[e.key]
  if (dir) {
    e.preventDefault()
    if (game.getState() === 'READY') { startGame(); return }
    handleMove(dir)
  }
})

// ── Touch / swipe input ───────────────────────────────────────────────────────

let touchStartX = 0
let touchStartY = 0

container.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}, { passive: true })

container.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX
  const dy = e.changedTouches[0].clientY - touchStartY
  const minSwipe = 30

  if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) {
    // Too short — treat as tap (start game if ready)
    if (game.getState() === 'READY') startGame()
    return
  }

  if (Math.abs(dx) > Math.abs(dy)) {
    handleMove(dx > 0 ? 'right' : 'left')
  } else {
    handleMove(dy > 0 ? 'down' : 'up')
  }
}, { passive: true })

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  setupGrid()
  const snap = game.getSnapshot()
  renderTiles(snap.tiles)
})

// ── Start btn (initial overlay) ───────────────────────────────────────────────

startBtn.addEventListener('click', startGame)

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  setupGrid()

  let savedBest = 0
  try {
    const result = await initSDK()
    savedBest = result.best
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  game = new Game2048(savedBest)
  updateHUD(0, savedBest)

  // Show READY overlay (already in HTML)
  overlay.classList.remove('hidden')
}

void boot()
