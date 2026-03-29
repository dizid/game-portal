// Asteroids — Canvas 2D renderer (vector neon style)

import type { GameSnapshot, Ship, Asteroid, Bullet, Particle } from './game.js'

const BG_COLOR = '#1a1a2e'
const SHIP_COLOR = '#00e5ff'
const ASTEROID_COLOR = '#aaaacc'
const BULLET_COLOR = '#ffc832'

export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D rendering context')
    this.ctx = ctx
  }

  render(snap: GameSnapshot): void {
    const { canvas, ctx } = this
    const { state, ship, asteroids, bullets, particles, score, lives, level } = snap

    // Background
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Stars (static decorative)
    this.drawStars(score)

    // Particles
    for (const p of particles) {
      this.drawParticle(p)
    }

    // Asteroids
    for (const a of asteroids) {
      this.drawAsteroid(a)
    }

    // Bullets
    for (const b of bullets) {
      this.drawBullet(b)
    }

    // Ship
    if (ship) {
      this.drawShip(ship)
    }

    // Level indicator (subtle)
    ctx.font = `11px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`WAVE ${level}`, canvas.width - 8, canvas.height - 6)

    // State overlays
    if (state === 'READY') this.drawReadyOverlay(lives)
    else if (state === 'GAME_OVER') this.drawGameOverOverlay(score)
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────────

  private drawStars(seed: number): void {
    // Draw 80 deterministic-ish stars
    const { ctx, canvas } = this
    const s = seed % 100
    for (let i = 0; i < 80; i++) {
      const x = ((i * 127.3 + s * 3.7) % canvas.width + canvas.width) % canvas.width
      const y = ((i * 89.7 + s * 5.1 + i * 31) % canvas.height + canvas.height) % canvas.height
      const r = i % 5 === 0 ? 1.5 : 0.8
      ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 3) * 0.1})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawShip(ship: Ship): void {
    const { ctx } = this

    // Flash when invincible
    if (ship.invincible && Math.floor(Date.now() / 80) % 2 === 0) return
    if (ship.dead) return

    ctx.save()
    ctx.translate(ship.pos.x, ship.pos.y)
    ctx.rotate(ship.angle)

    ctx.shadowColor = SHIP_COLOR
    ctx.shadowBlur = 14
    ctx.strokeStyle = SHIP_COLOR
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Triangle ship shape
    ctx.beginPath()
    ctx.moveTo(14, 0)         // nose
    ctx.lineTo(-10, -8)       // left wing
    ctx.lineTo(-6, 0)         // indent
    ctx.lineTo(-10, 8)        // right wing
    ctx.closePath()
    ctx.stroke()

    // Thrust flame
    if (ship.thrusting) {
      const flameLen = 10 + Math.sin(ship.thrustFlame * Math.PI * 2) * 5
      ctx.shadowColor = '#ff8800'
      ctx.strokeStyle = '#ff8800'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-6, -3)
      ctx.lineTo(-6 - flameLen, 0)
      ctx.lineTo(-6, 3)
      ctx.stroke()

      ctx.strokeStyle = '#ffcc44'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-6, -1.5)
      ctx.lineTo(-6 - flameLen * 0.6, 0)
      ctx.lineTo(-6, 1.5)
      ctx.stroke()
    }

    ctx.shadowBlur = 0
    ctx.restore()
  }

  private drawAsteroid(a: Asteroid): void {
    const { ctx } = this

    ctx.save()
    ctx.translate(a.pos.x, a.pos.y)
    ctx.rotate(a.angle)

    const color = a.size === 'large'
      ? '#8888bb'
      : a.size === 'medium'
      ? '#aaaacc'
      : '#ccccee'

    ctx.shadowColor = color
    ctx.shadowBlur = 6
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'

    ctx.beginPath()
    for (let i = 0; i < a.vertices.length; i++) {
      const v = a.vertices[i]
      const px = v.x * a.radius
      const py = v.y * a.radius
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.stroke()

    ctx.shadowBlur = 0
    ctx.restore()
  }

  private drawBullet(b: Bullet): void {
    const { ctx } = this

    ctx.shadowColor = BULLET_COLOR
    ctx.shadowBlur = 10
    ctx.fillStyle = BULLET_COLOR
    ctx.beginPath()
    ctx.arc(b.pos.x, b.pos.y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  private drawParticle(p: Particle): void {
    const { ctx } = this
    const alpha = p.life / p.maxLife
    const r = 2 + (1 - alpha) * 1

    ctx.globalAlpha = alpha
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.pos.x, p.pos.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  private drawReadyOverlay(lives: number): void {
    const { canvas, ctx } = this
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = 'rgba(26, 26, 46, 0.78)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = `bold ${Math.max(28, canvas.width * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = SHIP_COLOR
    ctx.shadowColor = SHIP_COLOR
    ctx.shadowBlur = 22
    ctx.fillText('ASTEROIDS', cx, cy - canvas.height * 0.14)
    ctx.shadowBlur = 0

    ctx.font = `${Math.max(12, canvas.width * 0.035)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP OR PRESS ANY KEY', cx, cy + canvas.height * 0.02)

    ctx.font = `${Math.max(9, canvas.width * 0.024)}px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText('← → ROTATE  ↑ THRUST  SPACE SHOOT', cx, cy + canvas.height * 0.1)
    ctx.fillText('MOBILE: LEFT SIDE = ROTATE L  RIGHT SIDE = ROTATE R', cx, cy + canvas.height * 0.16)
    ctx.fillText('TOP ZONE = THRUST  BOTTOM ZONE = SHOOT', cx, cy + canvas.height * 0.22)

    void lives
  }

  private drawGameOverOverlay(score: number): void {
    const { canvas, ctx } = this
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    ctx.fillStyle = 'rgba(26, 26, 46, 0.88)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = `bold ${Math.max(24, canvas.width * 0.08)}px 'Courier New', monospace`
    ctx.fillStyle = '#ff4466'
    ctx.shadowColor = '#ff4466'
    ctx.shadowBlur = 22
    ctx.fillText('GAME OVER', cx, cy - canvas.height * 0.12)
    ctx.shadowBlur = 0

    ctx.font = `${Math.max(16, canvas.width * 0.048)}px 'Courier New', monospace`
    ctx.fillStyle = BULLET_COLOR
    ctx.fillText(`SCORE: ${score}`, cx, cy)

    ctx.font = `${Math.max(12, canvas.width * 0.032)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP TO RESTART', cx, cy + canvas.height * 0.12)
  }
}
