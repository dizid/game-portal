// Sokoban — main entry point: canvas rendering, input, swipe, level select

import { SokobanGame, LEVELS, T } from './game.js'
import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const game = new SokobanGame()
let highScore = 0

// ── Tile size — computed dynamically based on level dimensions ───────────────

const MAX_CANVAS_W = 480
const MAX_CANVAS_H = 360

function calcTileSize(rows: number, cols: number): number {
  return Math.max(16, Math.min(
    Math.floor(MAX_CANVAS_W / cols),
    Math.floor(MAX_CANVAS_H / rows),
    48,
  ))
}

function resizeCanvas(): void {
  const board = game.getState().board
  const rows = board.grid.length
  const cols = board.grid[0]?.length ?? 1
  const ts = calcTileSize(rows, cols)
  const cw = cols * ts
  const ch = rows * ts
  canvas.width = cw
  canvas.height = ch

  const wrap = document.getElementById('canvas-wrap')!
  const wrapW = wrap.clientWidth
  const wrapH = wrap.clientHeight
  const scale = Math.min(wrapW / cw, wrapH / ch, 1)
  canvas.style.width  = `${Math.floor(cw * scale)}px`
  canvas.style.height = `${Math.floor(ch * scale)}px`
}

// ── Colors ────────────────────────────────────────────────────────────────────

const C = {
  wall:       '#0f0f24',
  wallEdge:   '#2a2a5a',
  floor:      '#1a1a3e',
  target:     '#1a1a2e',
  targetDot:  'rgba(0,255,136,0.4)',
  box:        '#cc8833',
  boxEdge:    '#ffaa44',
  boxOnTgt:   '#44cc88',
  boxOnEdge:  '#00ff88',
  player:     '#8888ff',
  playerEye:  '#ffffff',
  bg:         '#1a1a2e',
  overlay:    'rgba(0,0,0,0.7)',
  starGold:   '#ffd700',
  starEmpty:  'rgba(255,255,255,0.15)',
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function render(): void {
  const st = game.getState()
  const board = st.board
  const rows = board.grid.length
  const cols = board.grid[0]?.length ?? 1
  const ts = calcTileSize(rows, cols)

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = board.grid[r][c]
      const x = c * ts
      const y = r * ts

      drawTile(ch, x, y, ts)
    }
  }

  // Win overlay
  if (st.solved) {
    drawWinOverlay(board.moves, st.levelIndex)
  }
}

function drawTile(ch: string, x: number, y: number, ts: number): void {
  const p = 1 // padding between tiles

  switch (ch) {
    case T.WALL: {
      ctx.fillStyle = C.wall
      ctx.fillRect(x, y, ts, ts)
      // Edge highlight (top-left)
      ctx.strokeStyle = C.wallEdge
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x + p, y + ts - p)
      ctx.lineTo(x + p, y + p)
      ctx.lineTo(x + ts - p, y + p)
      ctx.stroke()
      break
    }
    case T.FLOOR:
    case T.PLAYER:
    case T.TARGET:
    case T.BOX:
    case T.BOX_ON_TARGET:
    case T.PLAYER_ON_TARGET: {
      // Floor base
      ctx.fillStyle = C.floor
      ctx.fillRect(x, y, ts, ts)

      // Target marker
      if (ch === T.TARGET || ch === T.PLAYER_ON_TARGET) {
        const cx = x + ts / 2
        const cy = y + ts / 2
        const r = ts * 0.28
        ctx.strokeStyle = C.targetDot
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
        // Inner dot
        ctx.fillStyle = C.targetDot
        ctx.beginPath()
        ctx.arc(cx, cy, 3, 0, Math.PI * 2)
        ctx.fill()
      }

      // Box
      if (ch === T.BOX || ch === T.BOX_ON_TARGET) {
        const isOnTarget = ch === T.BOX_ON_TARGET
        const pad = Math.max(2, ts * 0.12)
        const bx = x + pad
        const by = y + pad
        const bw = ts - pad * 2
        const bh = ts - pad * 2

        ctx.fillStyle = isOnTarget ? C.boxOnTgt : C.box
        ctx.fillRect(bx, by, bw, bh)

        // Edge highlight
        ctx.strokeStyle = isOnTarget ? C.boxOnEdge : C.boxEdge
        ctx.lineWidth = 2
        ctx.strokeRect(bx, by, bw, bh)

        // Cross pattern
        ctx.strokeStyle = isOnTarget ? 'rgba(0,255,136,0.3)' : 'rgba(255,170,68,0.3)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(bx + bw * 0.2, by + bh * 0.5)
        ctx.lineTo(bx + bw * 0.8, by + bh * 0.5)
        ctx.moveTo(bx + bw * 0.5, by + bh * 0.2)
        ctx.lineTo(bx + bw * 0.5, by + bh * 0.8)
        ctx.stroke()
      }

      // Player
      if (ch === T.PLAYER || ch === T.PLAYER_ON_TARGET) {
        drawPlayer(x, y, ts)
      }
      break
    }
    default: {
      // Empty (outside map padding)
      ctx.fillStyle = '#111120'
      ctx.fillRect(x, y, ts, ts)
    }
  }
}

function drawPlayer(x: number, y: number, ts: number): void {
  const cx = x + ts / 2
  const cy = y + ts / 2
  const r = ts * 0.32

  // Body glow
  ctx.shadowBlur = 10
  ctx.shadowColor = C.player
  ctx.fillStyle = C.player
  // Rounded rect body
  const bx = cx - r
  const by = cy - r * 0.9
  const bw = r * 2
  const bh = r * 1.8
  const rad = r * 0.3
  ctx.beginPath()
  ctx.moveTo(bx + rad, by)
  ctx.lineTo(bx + bw - rad, by)
  ctx.arcTo(bx + bw, by, bx + bw, by + rad, rad)
  ctx.lineTo(bx + bw, by + bh - rad)
  ctx.arcTo(bx + bw, by + bh, bx + bw - rad, by + bh, rad)
  ctx.lineTo(bx + rad, by + bh)
  ctx.arcTo(bx, by + bh, bx, by + bh - rad, rad)
  ctx.lineTo(bx, by + rad)
  ctx.arcTo(bx, by, bx + rad, by, rad)
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0

  // Eyes
  const eyeY = cy - r * 0.1
  const eyeOffset = r * 0.3
  ctx.fillStyle = C.playerEye
  ctx.beginPath()
  ctx.arc(cx - eyeOffset, eyeY, r * 0.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + eyeOffset, eyeY, r * 0.15, 0, Math.PI * 2)
  ctx.fill()
}

function drawWinOverlay(moves: number, levelIndex: number): void {
  ctx.fillStyle = C.overlay
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const cx = canvas.width / 2
  const cy = canvas.height / 2

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = '#00ff88'
  ctx.font = `bold ${Math.max(18, canvas.height * 0.1)}px "Segoe UI", sans-serif`
  ctx.fillText('SOLVED!', cx, cy - canvas.height * 0.22)

  const stars = game.calcStars(moves, levelIndex)
  const starSize = Math.max(16, canvas.height * 0.08)
  ctx.font = `${starSize}px sans-serif`
  const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars)
  ctx.fillStyle = C.starGold
  ctx.fillText(starStr, cx, cy - canvas.height * 0.08)

  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `${Math.max(12, canvas.height * 0.065)}px "Segoe UI", sans-serif`
  ctx.fillText(`${moves} moves`, cx, cy + canvas.height * 0.06)

  ctx.fillStyle = '#8888ff'
  ctx.font = `${Math.max(11, canvas.height * 0.055)}px "Segoe UI", sans-serif`
  ctx.fillText('Tap or press any key for next', cx, cy + canvas.height * 0.2)
}

// ── HUD update ────────────────────────────────────────────────────────────────

function updateHUD(): void {
  const st = game.getState()
  const b = st.board
  const levelEl = document.getElementById('hud-level')
  const movesEl = document.getElementById('hud-moves')
  const boxesEl = document.getElementById('hud-boxes')
  const scoreEl = document.getElementById('hud-score')
  if (levelEl) levelEl.textContent = String(st.levelIndex + 1)
  if (movesEl) movesEl.textContent = String(b.moves)
  if (boxesEl) boxesEl.textContent = `${b.boxesOnTarget}/${b.totalBoxes}`
  if (scoreEl) scoreEl.textContent = String(game.getScore())
}

// ── Level select ──────────────────────────────────────────────────────────────

function buildLevelSelectGrid(): void {
  const grid = document.getElementById('level-grid')
  if (!grid) return
  while (grid.firstChild) grid.removeChild(grid.firstChild)

  LEVELS.forEach((def, i) => {
    const item = document.createElement('div')
    item.className = 'level-item'
    if (i > game.unlockedUpTo) item.classList.add('locked')
    if (i === game.getLevelIndex()) item.classList.add('current')

    const numSpan = document.createElement('span')
    numSpan.textContent = String(i + 1)
    item.appendChild(numSpan)

    const starsSpan = document.createElement('span')
    starsSpan.className = 'stars'
    const stars = game.levelStars[i]
    starsSpan.textContent = stars > 0 ? '★'.repeat(stars) : def.name.slice(0, 6)
    item.appendChild(starsSpan)

    if (i <= game.unlockedUpTo) {
      item.addEventListener('click', () => {
        game.loadLevel(i)
        resizeCanvas()
        updateHUD()
        render()
        closeLevelSelect()
      })
    }

    grid.appendChild(item)
  })
}

function openLevelSelect(): void {
  buildLevelSelectGrid()
  const overlay = document.getElementById('level-select')
  if (overlay) overlay.classList.add('visible')
}

function closeLevelSelect(): void {
  document.getElementById('level-select')?.classList.remove('visible')
}

// ── Move handling ─────────────────────────────────────────────────────────────

function doMove(dr: number, dc: number): void {
  const st = game.getState()
  if (st.solved) {
    // Advance to next level
    const next = st.levelIndex + 1
    if (next < LEVELS.length) {
      game.loadLevel(next)
    } else {
      game.loadLevel(0)
    }
    reportScore(game.getScore())
    if (game.getScore() > highScore) {
      highScore = game.getScore()
      saveHighScore(highScore)
    }
    resizeCanvas()
    updateHUD()
    render()
    return
  }

  const result = game.move(dr, dc)
  if (!result.moved) return

  if (result.pushed) {
    audio.blip()
    try { navigator.vibrate(10) } catch {}
  } else {
    // Soft step (no sound to avoid noise)
  }

  if (result.solved) {
    const score = game.getScore()
    reportScore(score)
    reportGameOver(score)
    if (score > highScore) {
      highScore = score
      saveHighScore(highScore)
    }
    audio.levelUp()
    try { navigator.vibrate([30, 20, 60]) } catch {}
  }

  updateHUD()
  render()
}

// ── Input: keyboard ───────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'ArrowUp':    e.preventDefault(); doMove(-1, 0); break
    case 'ArrowDown':  e.preventDefault(); doMove(1, 0);  break
    case 'ArrowLeft':  e.preventDefault(); doMove(0, -1); break
    case 'ArrowRight': e.preventDefault(); doMove(0, 1);  break
    case 'KeyZ':
    case 'KeyU':       game.undo(); updateHUD(); render(); break
    case 'KeyR':       game.resetLevel(); updateHUD(); render(); break
  }
})

// ── Input: touch swipe ────────────────────────────────────────────────────────

let touchStartX = 0
let touchStartY = 0

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}, { passive: false })

canvas.addEventListener('touchend', (e) => {
  e.preventDefault()
  const dx = e.changedTouches[0].clientX - touchStartX
  const dy = e.changedTouches[0].clientY - touchStartY
  const minSwipe = 20
  if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) return

  if (Math.abs(dx) > Math.abs(dy)) {
    doMove(0, dx > 0 ? 1 : -1)
  } else {
    doMove(dy > 0 ? 1 : -1, 0)
  }
}, { passive: false })

// ── Input: D-pad buttons ──────────────────────────────────────────────────────

function bindDpad(id: string, dr: number, dc: number): void {
  const btn = document.getElementById(id)
  if (!btn) return
  btn.addEventListener('click', () => doMove(dr, dc))
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); doMove(dr, dc) }, { passive: false })
}

bindDpad('dpad-up',    -1, 0)
bindDpad('dpad-down',   1, 0)
bindDpad('dpad-left',   0, -1)
bindDpad('dpad-right',  0, 1)

// ── Action buttons ────────────────────────────────────────────────────────────

document.getElementById('btn-undo')!.addEventListener('click', () => {
  game.undo()
  updateHUD()
  render()
  audio.click()
})

document.getElementById('btn-reset')!.addEventListener('click', () => {
  game.resetLevel()
  resizeCanvas()
  updateHUD()
  render()
  audio.click()
})

document.getElementById('btn-levels')!.addEventListener('click', openLevelSelect)
document.getElementById('btn-close-levels')!.addEventListener('click', closeLevelSelect)

// ── Mute ──────────────────────────────────────────────────────────────────────

document.getElementById('mute-btn')!.addEventListener('click', () => {
  const m = audio.toggleMute()
  const btn = document.getElementById('mute-btn')!
  btn.textContent = m ? '🔇' : '🔊'
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  resizeCanvas()
  window.addEventListener('resize', () => { resizeCanvas(); render() })

  updateHUD()
  render()
}

void boot()
