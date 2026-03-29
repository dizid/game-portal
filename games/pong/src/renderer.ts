// Pong — Canvas 2D renderer

import type { GameSnapshot } from './game.js'

const BG_COLOR = '#1a1a2e'
const PLAYER_COLOR = '#ff64c8'
const AI_COLOR = '#00d4ff'
const BALL_COLOR = '#ffffff'
const SCORE_COLOR = '#ffffff'

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
    this.pulse += 0.05 * this.pulseDir
    if (this.pulse >= 1) { this.pulse = 1; this.pulseDir = -1 }
    if (this.pulse <= 0) { this.pulse = 0; this.pulseDir = 1 }
  }

  render(snap: GameSnapshot): void {
    const { canvas, ctx } = this
    const { state, ball, playerPaddle, aiPaddle, playerScore, aiScore, fieldW, fieldH, flashTimer, winner } = snap

    const scale = Math.min(canvas.width / fieldW, canvas.height / fieldH)
    const offX = (canvas.width - fieldW * scale) / 2
    const offY = (canvas.height - fieldH * scale) / 2

    // Background
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Score flash
    if (flashTimer > 0) {
      const alpha = (flashTimer / 0.4) * 0.2
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    ctx.save()
    ctx.translate(offX, offY)
    ctx.scale(scale, scale)

    // Dashed center line
    this.drawCenterLine(fieldW, fieldH)

    // Score display
    this.drawScores(playerScore, aiScore, fieldW, fieldH)

    // Paddles
    const paddleMargin = 20
    const paddleW = 12
    this.drawPaddle(paddleMargin, playerPaddle.y, paddleW, playerPaddle.height, PLAYER_COLOR)
    this.drawPaddle(fieldW - paddleMargin - paddleW, aiPaddle.y, paddleW, aiPaddle.height, AI_COLOR)

    // Ball trail
    for (let i = 0; i < ball.trail.length; i++) {
      const t = i / ball.trail.length
      const alpha = t * 0.4
      const r = 7 * (0.3 + t * 0.7)
      ctx.beginPath()
      ctx.arc(ball.trail[i].x, ball.trail[i].y, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.fill()
    }

    // Ball
    this.drawBall(ball.x, ball.y)

    ctx.restore()

    // Overlay
    if (state === 'READY') {
      this.drawReadyOverlay()
    } else if (state === 'GAME_OVER') {
      this.drawGameOverOverlay(playerScore, aiScore, winner)
    }
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────────

  private drawCenterLine(fieldW: number, fieldH: number): void {
    const { ctx } = this
    ctx.setLineDash([10, 14])
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(fieldW / 2, 0)
    ctx.lineTo(fieldW / 2, fieldH)
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawScores(playerScore: number, aiScore: number, fieldW: number, fieldH: number): void {
    const { ctx } = this
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = `bold ${Math.max(36, fieldH * 0.12)}px 'Courier New', monospace`

    // Player score (left)
    ctx.fillStyle = PLAYER_COLOR
    ctx.shadowColor = PLAYER_COLOR
    ctx.shadowBlur = 16
    ctx.fillText(String(playerScore), fieldW * 0.25, 16)

    // AI score (right)
    ctx.fillStyle = AI_COLOR
    ctx.shadowColor = AI_COLOR
    ctx.shadowBlur = 16
    ctx.fillText(String(aiScore), fieldW * 0.75, 16)

    ctx.shadowBlur = 0

    // Labels
    ctx.font = `${Math.max(10, fieldH * 0.035)}px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText('PLAYER', fieldW * 0.25, 16 + fieldH * 0.14)
    ctx.fillText('AI', fieldW * 0.75, 16 + fieldH * 0.14)
  }

  private drawPaddle(x: number, centreY: number, w: number, h: number, color: string): void {
    const { ctx } = this
    const y = centreY - h / 2

    ctx.shadowColor = color
    ctx.shadowBlur = 18

    const grad = ctx.createLinearGradient(x, y, x + w, y)
    grad.addColorStop(0, color)
    grad.addColorStop(1, color + '88')
    ctx.fillStyle = grad
    this.roundRect(x, y, w, h, 4)
    ctx.fill()

    ctx.shadowBlur = 0
  }

  private drawBall(x: number, y: number): void {
    const { ctx } = this
    const r = 7

    ctx.shadowColor = BALL_COLOR
    ctx.shadowBlur = 16

    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.6, '#ddddff')
    grad.addColorStop(1, '#8888cc')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()

    ctx.shadowBlur = 0
  }

  private drawReadyOverlay(): void {
    const { canvas, ctx } = this
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = 'rgba(26, 26, 46, 0.82)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = `bold ${Math.max(32, canvas.width * 0.1)}px 'Courier New', monospace`
    ctx.fillStyle = PLAYER_COLOR
    ctx.shadowColor = PLAYER_COLOR
    ctx.shadowBlur = 22
    ctx.fillText('PONG', cx, cy - canvas.height * 0.12)
    ctx.shadowBlur = 0

    ctx.font = `${Math.max(14, canvas.width * 0.04)}px 'Courier New', monospace`
    ctx.fillStyle = SCORE_COLOR
    ctx.fillText('FIRST TO 11 WINS', cx, cy)

    ctx.font = `${Math.max(12, canvas.width * 0.033)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP OR PRESS ANY KEY TO START', cx, cy + canvas.height * 0.1)

    ctx.font = `${Math.max(10, canvas.width * 0.026)}px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText('MOUSE / TOUCH / W + S KEYS', cx, cy + canvas.height * 0.18)
  }

  private drawGameOverOverlay(
    playerScore: number,
    aiScore: number,
    winner: 'player' | 'ai' | null
  ): void {
    const { canvas, ctx } = this
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = 'rgba(26, 26, 46, 0.88)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const winnerLabel = winner === 'player' ? 'YOU WIN!' : 'AI WINS!'
    const winnerColor = winner === 'player' ? PLAYER_COLOR : AI_COLOR

    ctx.font = `bold ${Math.max(26, canvas.width * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = winnerColor
    ctx.shadowColor = winnerColor
    ctx.shadowBlur = 24
    ctx.fillText(winnerLabel, cx, cy - canvas.height * 0.14)
    ctx.shadowBlur = 0

    ctx.font = `${Math.max(18, canvas.width * 0.055)}px 'Courier New', monospace`
    ctx.fillStyle = SCORE_COLOR
    ctx.fillText(`${playerScore} — ${aiScore}`, cx, cy - canvas.height * 0.02)

    ctx.font = `${Math.max(10, canvas.width * 0.028)}px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText('PLAYER   AI', cx, cy + canvas.height * 0.06)

    ctx.font = `${Math.max(12, canvas.width * 0.034)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP TO PLAY AGAIN', cx, cy + canvas.height * 0.15)
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
}
