// Frogger — Canvas 2D renderer

import type { GameSnapshot, Row, GoalSlot } from './game.js'

const BG_COLOR = '#1a1a2e'

// Row colour palette
const ROAD_COLOR = '#2a2a3e'
const WATER_COLOR = '#0a3a6a'
const SAFE_COLOR = '#1a3a1a'
const GOAL_COLOR = '#0a2a0a'
const LOG_COLOR = '#7a4a20'
const LOG_HIGHLIGHT = '#9a6a3a'

export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private pulse: number = 0
  private pulseDir: number = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D rendering context')
    this.ctx = ctx
  }

  updateAnimations(): void {
    this.pulse += 0.04 * this.pulseDir
    if (this.pulse >= 1) { this.pulse = 1; this.pulseDir = -1 }
    if (this.pulse <= 0) { this.pulse = 0; this.pulseDir = 1 }
  }

  render(snap: GameSnapshot): void {
    const { canvas, ctx } = this
    const { state, frog, rows, goalSlots, score, lives, timeLeft, level } = snap

    const cellSize = Math.floor(Math.min(canvas.width / snap.fieldW, canvas.height / snap.fieldH))
    const offX = (canvas.width - cellSize * snap.fieldW) / 2
    const offY = (canvas.height - cellSize * snap.fieldH) / 2

    // Background
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(offX, offY)

    // Draw rows
    for (let r = 0; r < rows.length; r++) {
      this.drawRow(rows[r], r, cellSize, goalSlots, timeLeft)
    }

    // Draw vehicles
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      for (const v of row.vehicles) {
        this.drawVehicle(v.x * cellSize, r * cellSize, v.width * cellSize, cellSize, v.color)
      }
    }

    // Draw logs
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      if (row.type === 'water') {
        for (const log of row.logs) {
          this.drawLog(log.x * cellSize, r * cellSize, log.width * cellSize, cellSize)
        }
      }
    }

    // Draw goal slot decorations
    for (const slot of goalSlots) {
      const x = slot.col * cellSize
      const y = 0
      if (slot.filled) {
        // Show placed frog in slot
        this.drawFrogShape(x + cellSize / 2, y + cellSize / 2, cellSize * 0.4, '#44ff88', false)
      } else {
        // Empty slot highlight
        const alpha = 0.3 + this.pulse * 0.3
        ctx.fillStyle = `rgba(68, 255, 136, ${alpha})`
        ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4)
      }
    }

    // Draw frog
    if (!frog.dead || Math.floor(frog.deathTimer * 8) % 2 === 0) {
      // Frog flashes when dead
      const bounce = frog.animTimer > 0 ? Math.sin((frog.animTimer / 0.12) * Math.PI) * cellSize * 0.15 : 0
      const frogX = frog.col * cellSize + cellSize / 2
      const frogY = frog.row * cellSize + cellSize / 2 - bounce
      const frogColor = frog.dead ? '#ff4466' : '#44ff88'
      this.drawFrog(frogX, frogY, cellSize * 0.42, frogColor)
    }

    ctx.restore()

    // UI overlay
    this.drawMiniHUD(score, lives, timeLeft, level)

    // State overlays
    if (state === 'READY') this.drawReadyOverlay()
    else if (state === 'GAME_OVER') this.drawGameOverOverlay(score)
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────────

  private drawRow(
    row: Row,
    rowIndex: number,
    cellSize: number,
    goalSlots: GoalSlot[],
    _timeLeft: number
  ): void {
    const { ctx } = this
    const y = rowIndex * cellSize
    const w = 13 * cellSize

    let color: string
    switch (row.type) {
      case 'road':  color = ROAD_COLOR;  break
      case 'water': color = WATER_COLOR; break
      case 'goal':  color = GOAL_COLOR;  break
      default:      color = SAFE_COLOR;  break
    }

    ctx.fillStyle = color
    ctx.fillRect(0, y, w, cellSize)

    // Water ripple effect
    if (row.type === 'water') {
      const rippleAlpha = 0.06 + this.pulse * 0.06
      ctx.fillStyle = `rgba(0, 150, 255, ${rippleAlpha})`
      ctx.fillRect(0, y, w, cellSize)
    }

    // Road lane markings
    if (row.type === 'road') {
      ctx.fillStyle = 'rgba(255,255,100,0.12)'
      ctx.fillRect(0, y + cellSize / 2 - 1, w, 2)
    }
  }

  private drawVehicle(x: number, y: number, w: number, h: number, color: string): void {
    const { ctx } = this
    const pad = 3

    ctx.shadowColor = color
    ctx.shadowBlur = 8

    const grad = ctx.createLinearGradient(x, y + pad, x, y + h - pad)
    grad.addColorStop(0, color)
    grad.addColorStop(1, this.darken(color, 0.6))
    ctx.fillStyle = grad
    this.roundRect(x + pad * 0.5, y + pad, w - pad, h - pad * 2, 4)
    ctx.fill()

    // Windows
    ctx.fillStyle = 'rgba(200, 230, 255, 0.35)'
    const winH = (h - pad * 2) * 0.4
    const winW = Math.max(4, (w - pad * 2) * 0.3)
    ctx.fillRect(x + pad + 3, y + pad + (h - pad * 2) * 0.1, winW, winH)
    if (w > h) {
      ctx.fillRect(x + w - pad - 3 - winW, y + pad + (h - pad * 2) * 0.1, winW, winH)
    }

    ctx.shadowBlur = 0
  }

  private drawLog(x: number, y: number, w: number, h: number): void {
    const { ctx } = this
    const pad = 2

    const grad = ctx.createLinearGradient(x, y + pad, x, y + h - pad)
    grad.addColorStop(0, LOG_HIGHLIGHT)
    grad.addColorStop(1, LOG_COLOR)
    ctx.fillStyle = grad
    this.roundRect(x + pad * 0.5, y + pad, w - pad, h - pad * 2, 4)
    ctx.fill()

    // Log grain lines
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 1
    for (let i = 1; i < 3; i++) {
      const ly = y + pad + (h - pad * 2) * (i / 3)
      ctx.beginPath()
      ctx.moveTo(x + pad, ly)
      ctx.lineTo(x + w - pad, ly)
      ctx.stroke()
    }
  }

  private drawFrog(cx: number, cy: number, radius: number, color: string): void {
    this.drawFrogShape(cx, cy, radius, color, true)
  }

  private drawFrogShape(cx: number, cy: number, radius: number, color: string, glow: boolean): void {
    const { ctx } = this

    if (glow) {
      ctx.shadowColor = color
      ctx.shadowBlur = 12
    }

    // Body
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(cx, cy, radius * 0.9, radius, 0, 0, Math.PI * 2)
    ctx.fill()

    // Eyes
    const eyeR = radius * 0.22
    const eyeOffX = radius * 0.45
    const eyeOffY = radius * 0.45

    ctx.shadowBlur = 0

    // Eye whites
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(cx - eyeOffX, cy - eyeOffY, eyeR, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + eyeOffX, cy - eyeOffY, eyeR, 0, Math.PI * 2)
    ctx.fill()

    // Pupils
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(cx - eyeOffX, cy - eyeOffY, eyeR * 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + eyeOffX, cy - eyeOffY, eyeR * 0.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.shadowBlur = 0
  }

  private drawMiniHUD(score: number, lives: number, timeLeft: number, level: number): void {
    // Level indicator — subtle, bottom-right
    const { canvas, ctx } = this
    ctx.font = `10px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`LVL ${level}`, canvas.width - 6, canvas.height - 4)

    // Timer warning color
    if (timeLeft < 10) {
      const alpha = 0.15 + Math.sin(Date.now() / 100) * 0.1
      ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    void score
    void lives
  }

  private drawReadyOverlay(): void {
    const { canvas, ctx } = this
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = 'rgba(26, 26, 46, 0.85)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = `bold ${Math.max(28, canvas.width * 0.1)}px 'Courier New', monospace`
    ctx.fillStyle = '#44ff88'
    ctx.shadowColor = '#44ff88'
    ctx.shadowBlur = 22
    ctx.fillText('FROGGER', cx, cy - canvas.height * 0.13)
    ctx.shadowBlur = 0

    ctx.font = `${Math.max(13, canvas.width * 0.04)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('GUIDE THE FROG HOME!', cx, cy + canvas.height * 0.03)

    ctx.font = `${Math.max(10, canvas.width * 0.028)}px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText('ARROW KEYS OR SWIPE', cx, cy + canvas.height * 0.12)

    ctx.font = `${Math.max(12, canvas.width * 0.035)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP OR PRESS ANY KEY', cx, cy + canvas.height * 0.22)
  }

  private drawGameOverOverlay(score: number): void {
    const { canvas, ctx } = this
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = 'rgba(26, 26, 46, 0.88)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = `bold ${Math.max(24, canvas.width * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = '#ff4466'
    ctx.shadowColor = '#ff4466'
    ctx.shadowBlur = 22
    ctx.fillText('GAME OVER', cx, cy - canvas.height * 0.12)
    ctx.shadowBlur = 0

    ctx.font = `${Math.max(15, canvas.width * 0.05)}px 'Courier New', monospace`
    ctx.fillStyle = '#fbbf24'
    ctx.fillText(`SCORE: ${score}`, cx, cy)

    ctx.font = `${Math.max(12, canvas.width * 0.034)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP TO RESTART', cx, cy + canvas.height * 0.13)
  }

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

  private darken(color: string, factor: number): string {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    const cx = cv.getContext('2d')!
    cx.fillStyle = color
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return `rgb(${Math.round(d[0]*factor)},${Math.round(d[1]*factor)},${Math.round(d[2]*factor)})`
  }
}
