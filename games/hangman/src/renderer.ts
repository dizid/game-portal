// Hangman figure renderer — draws on a <canvas> element

const GALLOWS_COLOR = 'rgba(255,255,255,0.7)'
const BODY_COLOR = '#64c8ff'
const DEAD_COLOR = '#ff6b6b'

export class HangmanRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  /** Resize canvas to fit its CSS container. Returns the size used. */
  resize(maxSize: number): void {
    this.canvas.width = maxSize
    this.canvas.height = maxSize
    this.canvas.style.width = `${maxSize}px`
    this.canvas.style.height = `${maxSize}px`
  }

  draw(wrongCount: number, isDead: boolean): void {
    const { ctx, canvas } = this
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const bodyColor = isDead ? DEAD_COLOR : BODY_COLOR

    // Scale everything relative to canvas size
    const s = w / 200  // design reference: 200px

    ctx.strokeStyle = GALLOWS_COLOR
    ctx.lineWidth = 3 * s
    ctx.lineCap = 'round'

    // ── Gallows structure ──────────────────────────────────────────────────────
    // Base
    this.line(20, 190, 180, 190, s)
    // Vertical pole
    this.line(60, 190, 60, 20, s)
    // Horizontal beam
    this.line(60, 20, 130, 20, s)
    // Rope
    this.line(130, 20, 130, 40, s)

    if (wrongCount < 1) return

    ctx.strokeStyle = bodyColor
    ctx.fillStyle = bodyColor
    ctx.lineWidth = 3 * s

    // ── Body parts (6 total) ──────────────────────────────────────────────────
    // 1 — Head
    if (wrongCount >= 1) {
      ctx.beginPath()
      ctx.arc(130 * s, 52 * s, 12 * s, 0, Math.PI * 2)
      ctx.stroke()
    }
    // 2 — Torso
    if (wrongCount >= 2) {
      this.line(130, 64, 130, 110, s)
    }
    // 3 — Left arm
    if (wrongCount >= 3) {
      this.line(130, 75, 105, 95, s)
    }
    // 4 — Right arm
    if (wrongCount >= 4) {
      this.line(130, 75, 155, 95, s)
    }
    // 5 — Left leg
    if (wrongCount >= 5) {
      this.line(130, 110, 105, 140, s)
    }
    // 6 — Right leg
    if (wrongCount >= 6) {
      this.line(130, 110, 155, 140, s)
    }
  }

  private line(x1: number, y1: number, x2: number, y2: number, scale: number): void {
    const { ctx } = this
    ctx.beginPath()
    ctx.moveTo(x1 * scale, y1 * scale)
    ctx.lineTo(x2 * scale, y2 * scale)
    ctx.stroke()
  }
}
