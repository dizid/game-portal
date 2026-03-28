// Canvas 2D renderer — all visual output lives here

import type { GameSnapshot, Point } from './game.js'

const BG_COLOR = '#1a1a2e'
const GRID_COLOR = 'rgba(255, 255, 255, 0.04)'
const SNAKE_HEAD_COLOR = '#00ff88'
const SNAKE_BODY_START = '#00ff88'
const SNAKE_BODY_END = '#007a42'
const FOOD_COLOR = '#fbbf24'
const TEXT_COLOR = '#ffffff'

export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  // Pulse state for food animation
  private pulse: number = 0
  private pulseDir: number = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D rendering context')
    this.ctx = ctx
  }

  /** Call each animation frame to advance pulse state. */
  updateAnimations(): void {
    this.pulse += 0.05 * this.pulseDir
    if (this.pulse >= 1) { this.pulse = 1; this.pulseDir = -1 }
    if (this.pulse <= 0) { this.pulse = 0; this.pulseDir = 1 }
  }

  /** Full render pass for one frame. */
  render(snapshot: GameSnapshot): void {
    const { canvas, ctx } = this
    const { snake, food, state, score, gridSize } = snapshot

    const cellSize = Math.floor(Math.min(canvas.width, canvas.height) / gridSize)
    // Centre the grid on the canvas
    const offsetX = Math.floor((canvas.width  - cellSize * gridSize) / 2)
    const offsetY = Math.floor((canvas.height - cellSize * gridSize) / 2)

    // ── Background ──────────────────────────────────────────────────────────────
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // ── Grid ────────────────────────────────────────────────────────────────────
    this.drawGrid(cellSize, offsetX, offsetY, gridSize)

    // ── Food ────────────────────────────────────────────────────────────────────
    this.drawFood(food, cellSize, offsetX, offsetY)

    // ── Snake ───────────────────────────────────────────────────────────────────
    this.drawSnake(snake, cellSize, offsetX, offsetY)

    // ── Overlays ─────────────────────────────────────────────────────────────────
    if (state === 'READY') {
      this.drawReadyOverlay(canvas.width, canvas.height)
    } else if (state === 'GAME_OVER') {
      this.drawGameOverOverlay(canvas.width, canvas.height, score)
    }
  }

  // ── Private draw helpers ─────────────────────────────────────────────────────

  private drawGrid(
    cellSize: number,
    offsetX: number,
    offsetY: number,
    gridSize: number,
  ): void {
    const { ctx } = this
    ctx.strokeStyle = GRID_COLOR
    ctx.lineWidth = 0.5

    const totalW = cellSize * gridSize
    const totalH = cellSize * gridSize

    for (let x = 0; x <= gridSize; x++) {
      ctx.beginPath()
      ctx.moveTo(offsetX + x * cellSize, offsetY)
      ctx.lineTo(offsetX + x * cellSize, offsetY + totalH)
      ctx.stroke()
    }
    for (let y = 0; y <= gridSize; y++) {
      ctx.beginPath()
      ctx.moveTo(offsetX,         offsetY + y * cellSize)
      ctx.lineTo(offsetX + totalW, offsetY + y * cellSize)
      ctx.stroke()
    }
  }

  private drawFood(food: Point, cellSize: number, offsetX: number, offsetY: number): void {
    const { ctx } = this
    const cx = offsetX + food.x * cellSize + cellSize / 2
    const cy = offsetY + food.y * cellSize + cellSize / 2
    const baseRadius = cellSize * 0.35
    // Pulse between 80% and 110% of base radius
    const radius = baseRadius * (0.8 + this.pulse * 0.3)
    const glowRadius = radius + cellSize * (0.15 + this.pulse * 0.1)

    // Outer glow
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius)
    glowGrad.addColorStop(0, 'rgba(251, 191, 36, 0.6)')
    glowGrad.addColorStop(1, 'rgba(251, 191, 36, 0)')
    ctx.fillStyle = glowGrad
    ctx.beginPath()
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2)
    ctx.fill()

    // Core circle
    const coreGrad = ctx.createRadialGradient(cx - radius * 0.2, cy - radius * 0.2, 0, cx, cy, radius)
    coreGrad.addColorStop(0, '#fffbeb')
    coreGrad.addColorStop(0.5, FOOD_COLOR)
    coreGrad.addColorStop(1, '#d97706')
    ctx.fillStyle = coreGrad
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawSnake(snake: Point[], cellSize: number, offsetX: number, offsetY: number): void {
    const { ctx } = this
    const padding = Math.max(1, cellSize * 0.08)
    const cornerRadius = cellSize * 0.2

    snake.forEach((seg, i) => {
      const x = offsetX + seg.x * cellSize + padding
      const y = offsetY + seg.y * cellSize + padding
      const w = cellSize - padding * 2
      const h = cellSize - padding * 2

      if (i === 0) {
        // Head — bright with glow
        ctx.shadowColor = SNAKE_HEAD_COLOR
        ctx.shadowBlur = cellSize * 0.6
        ctx.fillStyle = SNAKE_HEAD_COLOR
      } else {
        ctx.shadowBlur = 0
        // Body — interpolate from head colour toward tail colour
        const t = i / (snake.length - 1)
        ctx.fillStyle = this.lerpColor(SNAKE_BODY_START, SNAKE_BODY_END, t)
      }

      this.roundRect(x, y, w, h, cornerRadius)
      ctx.fill()
    })

    ctx.shadowBlur = 0
  }

  private drawReadyOverlay(width: number, height: number): void {
    const { ctx } = this

    // Dim the scene
    ctx.fillStyle = 'rgba(26, 26, 46, 0.75)'
    ctx.fillRect(0, 0, width, height)

    const cx = width / 2
    const cy = height / 2

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Title
    ctx.font = `bold ${Math.max(28, width * 0.08)}px 'Courier New', monospace`
    ctx.fillStyle = SNAKE_HEAD_COLOR
    ctx.shadowColor = SNAKE_HEAD_COLOR
    ctx.shadowBlur = 20
    ctx.fillText('SNAKE', cx, cy - height * 0.1)

    // Subtitle
    ctx.font = `${Math.max(14, width * 0.04)}px 'Courier New', monospace`
    ctx.fillStyle = TEXT_COLOR
    ctx.shadowBlur = 0
    ctx.fillText('TAP OR PRESS ANY KEY TO START', cx, cy + height * 0.05)

    // Controls hint
    ctx.font = `${Math.max(11, width * 0.03)}px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText('ARROWS / WASD / SWIPE', cx, cy + height * 0.13)
  }

  private drawGameOverOverlay(width: number, height: number, score: number): void {
    const { ctx } = this

    ctx.fillStyle = 'rgba(26, 26, 46, 0.80)'
    ctx.fillRect(0, 0, width, height)

    const cx = width / 2
    const cy = height / 2

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // "GAME OVER"
    ctx.font = `bold ${Math.max(24, width * 0.08)}px 'Courier New', monospace`
    ctx.fillStyle = '#ff4466'
    ctx.shadowColor = '#ff4466'
    ctx.shadowBlur = 24
    ctx.fillText('GAME OVER', cx, cy - height * 0.12)
    ctx.shadowBlur = 0

    // Score
    ctx.font = `${Math.max(16, width * 0.05)}px 'Courier New', monospace`
    ctx.fillStyle = FOOD_COLOR
    ctx.fillText(`SCORE: ${score}`, cx, cy)

    // Restart prompt
    ctx.font = `${Math.max(12, width * 0.035)}px 'Courier New', monospace`
    ctx.fillStyle = TEXT_COLOR
    ctx.fillText('TAP TO RESTART', cx, cy + height * 0.12)
  }

  // ── Utility methods ──────────────────────────────────────────────────────────

  /** Draw a rounded rectangle path and fill/stroke. */
  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  /** Linear interpolation between two hex colours (#rrggbb). */
  private lerpColor(a: string, b: string, t: number): string {
    const parse = (hex: string) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]
    const ca = parse(a)
    const cb = parse(b)
    const r = Math.round(ca[0] + (cb[0] - ca[0]) * t)
    const g = Math.round(ca[1] + (cb[1] - ca[1]) * t)
    const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t)
    return `rgb(${r},${g},${bl})`
  }
}
