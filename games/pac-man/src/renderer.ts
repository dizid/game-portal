// Pac-Man — Canvas 2D renderer

import type { GameSnapshot, Ghost, Direction } from './game.js'
import { T_WALL, T_DOT, T_PELLET, T_DOOR, COLS, ROWS } from './maze.js'

const BG = '#1a1a2e'
const WALL_COLOR = '#1a6bff'
const WALL_GLOW = 'rgba(30, 100, 255, 0.5)'
const DOT_COLOR = '#ffdc88'
const PELLET_COLOR = '#ffdc00'
const PAC_COLOR = '#ffdc00'
const GHOST_COLORS: Record<string, string> = {
  blinky: '#ff2222',
  pinky:  '#ffaaff',
  inky:   '#22ddff',
  clyde:  '#ffaa22',
}
const FRIGHTENED_COLOR = '#2222ff'
const FRIGHTENED_FLASH = '#ffffff'
const EATEN_COLOR = 'rgba(0,0,0,0)'

export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private tileSize = 16
  private offsetX = 0
  private offsetY = 30  // space for HUD
  private pelletPulse = 0
  private pelletDir = 1
  private animTick = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D context')
    this.ctx = ctx
    this.recalcLayout()
  }

  private recalcLayout(): void {
    const availW = this.canvas.width
    const availH = this.canvas.height - this.offsetY
    const tileW = Math.floor(availW / COLS)
    const tileH = Math.floor(availH / ROWS)
    this.tileSize = Math.min(tileW, tileH)
    this.offsetX = Math.floor((availW - this.tileSize * COLS) / 2)
  }

  updateAnimations(): void {
    this.animTick++
    this.pelletPulse += 0.07 * this.pelletDir
    if (this.pelletPulse >= 1) { this.pelletPulse = 1; this.pelletDir = -1 }
    if (this.pelletPulse <= 0) { this.pelletPulse = 0; this.pelletDir = 1 }
  }

  render(snap: GameSnapshot): void {
    this.recalcLayout()
    const { ctx, canvas } = this
    const w = canvas.width
    const h = canvas.height

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)

    this.drawMaze(snap)
    this.drawGhosts(snap)
    this.drawPacMan(snap)

    if (snap.fruitActive) {
      this.drawFruit(snap.fruitX, snap.fruitY, snap.level)
    }

    if (snap.state === 'READY') this.drawReadyOverlay(w, h)
    else if (snap.state === 'GAME_OVER') this.drawGameOverOverlay(w, h, snap.score)
    else if (snap.state === 'LEVEL_CLEAR') this.drawLevelClear(w, h)
  }

  private tx(col: number): number {
    return this.offsetX + col * this.tileSize
  }

  private ty(row: number): number {
    return this.offsetY + row * this.tileSize
  }

  private worldX(px: number): number {
    return this.offsetX + px * (this.tileSize / 16)
  }

  private worldY(py: number): number {
    return this.offsetY + py * (this.tileSize / 16)
  }

  private drawMaze(snap: GameSnapshot): void {
    const { ctx } = this
    const ts = this.tileSize
    const grid = snap.maze.data

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cell = grid[row][col]
        const x = this.tx(col)
        const y = this.ty(row)

        if (cell === T_WALL) {
          ctx.fillStyle = WALL_COLOR
          ctx.shadowColor = WALL_GLOW
          ctx.shadowBlur = 3
          ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2)
          ctx.shadowBlur = 0
        } else if (cell === T_DOOR) {
          ctx.fillStyle = '#ffaaff'
          ctx.fillRect(x + 2, y + ts * 0.4, ts - 4, ts * 0.2)
        } else if (cell === T_DOT) {
          const r = ts * 0.1
          ctx.fillStyle = DOT_COLOR
          ctx.beginPath()
          ctx.arc(x + ts / 2, y + ts / 2, r, 0, Math.PI * 2)
          ctx.fill()
        } else if (cell === T_PELLET) {
          const r = ts * 0.22 * (0.85 + this.pelletPulse * 0.3)
          ctx.shadowColor = PELLET_COLOR
          ctx.shadowBlur = 8
          ctx.fillStyle = PELLET_COLOR
          ctx.beginPath()
          ctx.arc(x + ts / 2, y + ts / 2, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }
    }
  }

  private drawPacMan(snap: GameSnapshot): void {
    const { ctx } = this
    const ts = this.tileSize
    const cx = this.worldX(snap.pacX)
    const cy = this.worldY(snap.pacY)
    const r = ts * 0.45

    const mouthOpen = snap.mouthAngle * Math.PI * 0.4  // max 72° open
    const rotation = dirToAngle(snap.pacDir)

    ctx.shadowColor = PAC_COLOR
    ctx.shadowBlur = 12
    ctx.fillStyle = PAC_COLOR
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, rotation + mouthOpen, rotation + Math.PI * 2 - mouthOpen)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
  }

  private drawGhosts(snap: GameSnapshot): void {
    const ts = this.tileSize
    for (const g of snap.ghosts) {
      if (!g.released) continue
      const cx = this.worldX(g.px)
      const cy = this.worldY(g.py)
      this.drawGhost(g, cx, cy, ts)
    }
  }

  private drawGhost(g: Ghost, cx: number, cy: number, ts: number): void {
    const { ctx } = this
    const r = ts * 0.45
    const isFlashing = g.mode === 'frightened' && g.frightenedTimer < 120 && Math.floor(this.animTick / 8) % 2 === 0

    let color: string
    if (g.mode === 'eaten') {
      // Draw only eyes
      this.drawGhostEyes(cx, cy, r, g.dir)
      return
    } else if (g.mode === 'frightened') {
      color = isFlashing ? FRIGHTENED_FLASH : FRIGHTENED_COLOR
    } else {
      color = GHOST_COLORS[g.name] ?? '#ffffff'
    }

    ctx.shadowColor = color
    ctx.shadowBlur = 10
    ctx.fillStyle = color

    // Ghost body: rounded top, wavy bottom
    ctx.beginPath()
    ctx.arc(cx, cy - r * 0.1, r, Math.PI, 0)  // top half circle
    // Wavy skirt
    const skirtY = cy + r * 0.9
    const segments = 3
    const segW = (r * 2) / segments
    ctx.lineTo(cx + r, skirtY)
    for (let i = 0; i < segments; i++) {
      const x1 = cx + r - (i + 0.5) * segW
      const x2 = cx + r - (i + 1) * segW
      const wavY = i % 2 === 0 ? skirtY + r * 0.25 : skirtY
      ctx.quadraticCurveTo(x1, wavY, x2, skirtY)
    }
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0

    if (g.mode !== 'frightened') {
      this.drawGhostEyes(cx, cy, r, g.dir)
    } else {
      // Draw scared face
      this.drawScaredFace(cx, cy, r, color)
    }
  }

  private drawGhostEyes(cx: number, cy: number, r: number, dir: Direction): void {
    const { ctx } = this
    const eyeR = r * 0.18
    const pupilR = eyeR * 0.6
    const eyeOffX = r * 0.3
    const eyeY = cy - r * 0.2
    const { dx, dy } = dirToEyeOffset(dir)

    for (const side of [-1, 1]) {
      const ex = cx + side * eyeOffX
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0000cc'
      ctx.beginPath()
      ctx.arc(ex + dx * eyeR * 0.5, eyeY + dy * eyeR * 0.5, pupilR, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawScaredFace(cx: number, cy: number, r: number, _color: string): void {
    const { ctx } = this
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = r * 0.12
    ctx.lineCap = 'round'
    // Wavy mouth
    ctx.beginPath()
    ctx.moveTo(cx - r * 0.4, cy + r * 0.25)
    ctx.quadraticCurveTo(cx - r * 0.15, cy + r * 0.05, cx, cy + r * 0.25)
    ctx.quadraticCurveTo(cx + r * 0.15, cy + r * 0.45, cx + r * 0.4, cy + r * 0.25)
    ctx.stroke()
    // Eyes (X marks)
    ctx.fillStyle = '#ffffff'
    for (const side of [-1, 1]) {
      const ex = cx + side * r * 0.28
      const ey = cy - r * 0.15
      ctx.beginPath()
      ctx.arc(ex, ey, r * 0.1, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawFruit(px: number, py: number, level: number): void {
    const { ctx } = this
    const cx = this.worldX(px)
    const cy = this.worldY(py)
    const ts = this.tileSize
    // Cherry for all levels (can extend per level)
    ctx.shadowColor = '#ff4444'
    ctx.shadowBlur = 8
    ctx.fillStyle = level % 2 === 0 ? '#ff8800' : '#ff3333'
    ctx.beginPath()
    ctx.arc(cx, cy, ts * 0.28, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  private drawReadyOverlay(w: number, h: number): void {
    const { ctx } = this
    ctx.fillStyle = 'rgba(26,26,46,0.78)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2; const cy = h / 2
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(24, w * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = PAC_COLOR
    ctx.shadowColor = PAC_COLOR; ctx.shadowBlur = 22
    ctx.fillText('PAC-MAN', cx, cy - h * 0.1)
    ctx.shadowBlur = 0
    ctx.font = `${Math.max(13, w * 0.04)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP OR PRESS ANY KEY', cx, cy + h * 0.05)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = `${Math.max(11, w * 0.03)}px 'Courier New', monospace`
    ctx.fillText('ARROWS / WASD / SWIPE', cx, cy + h * 0.12)
  }

  private drawGameOverOverlay(w: number, h: number, score: number): void {
    const { ctx } = this
    ctx.fillStyle = 'rgba(26,26,46,0.85)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2; const cy = h / 2
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(24, w * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = '#ff4466'; ctx.shadowColor = '#ff4466'; ctx.shadowBlur = 22
    ctx.fillText('GAME OVER', cx, cy - h * 0.1)
    ctx.shadowBlur = 0
    ctx.font = `${Math.max(15, w * 0.05)}px 'Courier New', monospace`
    ctx.fillStyle = PAC_COLOR
    ctx.fillText(`SCORE: ${score}`, cx, cy + h * 0.02)
    ctx.font = `${Math.max(12, w * 0.035)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP TO RESTART', cx, cy + h * 0.12)
  }

  private drawLevelClear(w: number, h: number): void {
    const { ctx } = this
    ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.sin(this.animTick * 0.2) * 0.1})`
    ctx.fillRect(0, 0, w, h)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(22, w * 0.08)}px 'Courier New', monospace`
    ctx.fillStyle = '#00ff88'; ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 20
    ctx.fillText('LEVEL CLEAR!', w / 2, h / 2)
    ctx.shadowBlur = 0
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function dirToAngle(dir: Direction): number {
  switch (dir) {
    case 'right': return 0
    case 'down':  return Math.PI / 2
    case 'left':  return Math.PI
    case 'up':    return -Math.PI / 2
    default:      return 0
  }
}

function dirToEyeOffset(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case 'up':    return { dx: 0, dy: -1 }
    case 'down':  return { dx: 0, dy: 1 }
    case 'left':  return { dx: -1, dy: 0 }
    case 'right': return { dx: 1, dy: 0 }
    default:      return { dx: 0.5, dy: -0.5 }
  }
}
