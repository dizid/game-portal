// Breakout — Canvas 2D renderer

import type { GameSnapshot, Ball, Brick, PowerUp } from './game.js'

const BG_COLOR = '#1a1a2e'

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
    const { state, bricks, balls, paddle, powerUps, score, lives, level, fieldW, fieldH, flashTimer } = snap

    // Scale factor: fit the logical field into the canvas
    const scaleX = canvas.width / fieldW
    const scaleY = canvas.height / fieldH
    const scale = Math.min(scaleX, scaleY)
    const offX = (canvas.width - fieldW * scale) / 2
    const offY = (canvas.height - fieldH * scale) / 2

    // Background
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Optional flash overlay for row-clear
    if (flashTimer > 0) {
      const alpha = (flashTimer / 0.5) * 0.3
      ctx.fillStyle = `rgba(255, 255, 180, ${alpha})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    ctx.save()
    ctx.translate(offX, offY)
    ctx.scale(scale, scale)

    // Draw field border
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, fieldW, fieldH)

    // Bricks
    for (const brick of bricks) {
      if (brick.alive) this.drawBrick(brick)
    }

    // Power-ups
    for (const pu of powerUps) {
      this.drawPowerUp(pu)
    }

    // Balls
    for (const ball of balls) {
      this.drawBall(ball)
    }

    // Paddle
    this.drawPaddle(paddle.x, paddle.y, paddle.width, paddle.height, paddle.widePowerupTimer > 0)

    ctx.restore()

    // Overlay states
    if (state === 'READY') {
      this.drawReadyOverlay(score)
    } else if (state === 'GAME_OVER') {
      this.drawGameOverOverlay(score)
    }
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────────

  private drawBrick(brick: Brick): void {
    const { ctx } = this
    const brickW = 42
    const brickH = 16
    const brickGap = 4
    const brickCols = 8
    const fieldW = 400
    const totalW = brickCols * brickW + (brickCols - 1) * brickGap
    const startX = (fieldW - totalW) / 2
    const x = startX + brick.col * (brickW + brickGap)
    const y = 60 + brick.row * (brickH + brickGap)

    // Glow
    ctx.shadowColor = brick.color
    ctx.shadowBlur = 8

    // Fill with gradient
    const grad = ctx.createLinearGradient(x, y, x, y + brickH)
    grad.addColorStop(0, brick.color)
    grad.addColorStop(1, this.darken(brick.color, 0.5))
    ctx.fillStyle = grad
    this.roundRect(x, y, brickW, brickH, 3)
    ctx.fill()

    // Subtle highlight on top
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    this.roundRect(x + 2, y + 2, brickW - 4, brickH / 3, 2)
    ctx.fill()

    ctx.shadowBlur = 0
  }

  private drawBall(ball: Ball): void {
    const { ctx } = this

    // Draw trail (oldest = most transparent)
    for (let i = 0; i < ball.trail.length; i++) {
      const t = i / ball.trail.length
      const alpha = t * 0.5
      const radius = ball.radius * (0.3 + t * 0.7)
      ctx.beginPath()
      ctx.arc(ball.trail[i].x, ball.trail[i].y, radius, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(0, 200, 255, ${alpha})`
      ctx.fill()
    }

    // Glow
    ctx.shadowColor = '#00c8ff'
    ctx.shadowBlur = 14

    // Ball core with radial gradient
    const grad = ctx.createRadialGradient(
      ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, 0,
      ball.x, ball.y, ball.radius
    )
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.4, '#00c8ff')
    grad.addColorStop(1, '#0066aa')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.shadowBlur = 0
  }

  private drawPaddle(x: number, y: number, w: number, h: number, wide: boolean): void {
    const { ctx } = this
    const left = x - w / 2
    const top = y - h / 2
    const color = wide ? '#4488ff' : '#00c8ff'

    ctx.shadowColor = color
    ctx.shadowBlur = 16

    const grad = ctx.createLinearGradient(left, top, left, top + h)
    grad.addColorStop(0, color)
    grad.addColorStop(1, this.darken(color, 0.5))
    ctx.fillStyle = grad
    this.roundRect(left, top, w, h, h / 2)
    ctx.fill()

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    this.roundRect(left + 4, top + 2, w - 8, h / 3, h / 4)
    ctx.fill()

    ctx.shadowBlur = 0
  }

  private drawPowerUp(pu: PowerUp): void {
    const { ctx } = this
    const size = 12
    let color: string
    let label: string

    switch (pu.type) {
      case 'wide':      color = '#4488ff'; label = 'W'; break
      case 'multiball': color = '#44ff88'; label = 'M'; break
      case 'extralife': color = '#ff4466'; label = '+'; break
    }

    ctx.shadowColor = color
    ctx.shadowBlur = 10
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(pu.x, pu.y, size, 0, Math.PI * 2)
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${size}px 'Courier New', monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, pu.x, pu.y)
  }

  private drawReadyOverlay(score: number): void {
    const { canvas, ctx } = this
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = 'rgba(26, 26, 46, 0.82)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = `bold ${Math.max(30, canvas.width * 0.1)}px 'Courier New', monospace`
    ctx.fillStyle = '#00c8ff'
    ctx.shadowColor = '#00c8ff'
    ctx.shadowBlur = 24
    ctx.fillText('BREAKOUT', cx, cy - canvas.height * 0.12)
    ctx.shadowBlur = 0

    ctx.font = `${Math.max(14, canvas.width * 0.04)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP OR CLICK TO START', cx, cy + canvas.height * 0.04)

    ctx.font = `${Math.max(11, canvas.width * 0.03)}px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText('MOVE MOUSE/TOUCH • ARROW KEYS', cx, cy + canvas.height * 0.12)

    if (score > 0) {
      ctx.font = `${Math.max(13, canvas.width * 0.035)}px 'Courier New', monospace`
      ctx.fillStyle = '#fbbf24'
      ctx.fillText(`LAST SCORE: ${score}`, cx, cy + canvas.height * 0.2)
    }
  }

  private drawGameOverOverlay(score: number): void {
    const { canvas, ctx } = this
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = 'rgba(26, 26, 46, 0.85)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = `bold ${Math.max(26, canvas.width * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = '#ff4466'
    ctx.shadowColor = '#ff4466'
    ctx.shadowBlur = 24
    ctx.fillText('GAME OVER', cx, cy - canvas.height * 0.12)
    ctx.shadowBlur = 0

    ctx.font = `${Math.max(16, canvas.width * 0.05)}px 'Courier New', monospace`
    ctx.fillStyle = '#fbbf24'
    ctx.fillText(`SCORE: ${score}`, cx, cy)

    ctx.font = `${Math.max(12, canvas.width * 0.035)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP TO RESTART', cx, cy + canvas.height * 0.12)
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

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

  private darken(hex: string, factor: number): string {
    // Darken a CSS colour by multiplying RGB values
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = hex
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    const r = Math.round(d[0] * factor)
    const g = Math.round(d[1] * factor)
    const b = Math.round(d[2] * factor)
    return `rgb(${r},${g},${b})`
  }
}
