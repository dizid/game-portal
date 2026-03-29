// Infinite Runner — Canvas 2D renderer

import type { GameSnapshot, Platform, Obstacle, Coin } from './game.js'

const BG = '#1a1a2e'
const GROUND_COLOR = '#00aaff'
const GROUND_GLOW = 'rgba(0,170,255,0.4)'
const CHAR_BODY = '#ff6633'
const CHAR_LEGS = '#ffaa44'
const OBSTACLE_SPIKE = '#ff4466'
const OBSTACLE_WALL = '#aa44ff'
const COIN_COLOR = '#ffcc00'
const COIN_GLOW = 'rgba(255,200,0,0.6)'

export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private animTick = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D context')
    this.ctx = ctx
  }

  updateAnimations(): void { this.animTick++ }

  render(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    this.drawParallax(snap)
    this.drawPlatforms(snap)
    this.drawCoins(snap)
    this.drawObstacles(snap)
    this.drawCharacter(snap)
    this.drawGroundFog(snap)

    if (snap.state === 'READY') this.drawReadyOverlay(snap)
    else if (snap.state === 'GAME_OVER') this.drawGameOverOverlay(snap)
  }

  private drawParallax(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    const groundY = snap.groundY

    for (const layer of snap.layers) {
      ctx.fillStyle = layer.color
      for (const obj of layer.objects) {
        const top = groundY - obj.height
        // Mountain-style triangle top
        ctx.beginPath()
        ctx.moveTo(obj.x, groundY)
        ctx.lineTo(obj.x + obj.width / 2, top)
        ctx.lineTo(obj.x + obj.width, groundY)
        ctx.closePath()
        ctx.fill()
        // Building-style rect on top of ground
        ctx.fillRect(obj.x, top, obj.width, obj.height)
      }
    }
    void canvas
  }

  private drawPlatforms(snap: GameSnapshot): void {
    const { ctx } = this
    const CHAR_X_FIXED = snap.charX

    for (const p of snap.platforms) {
      if (p.isGap) continue
      const sx = p.x - snap.scrollX + CHAR_X_FIXED
      if (sx + p.width < 0 || sx > snap.canvasW) continue

      // Neon grid ground
      ctx.shadowColor = GROUND_GLOW
      ctx.shadowBlur = 8
      ctx.fillStyle = 'rgba(0,170,255,0.15)'
      ctx.fillRect(sx, p.y, p.width, snap.canvasH - p.y)

      // Top edge glow line
      ctx.strokeStyle = GROUND_COLOR
      ctx.lineWidth = 2
      ctx.shadowColor = GROUND_COLOR
      ctx.shadowBlur = 6
      ctx.beginPath()
      ctx.moveTo(sx, p.y)
      ctx.lineTo(sx + p.width, p.y)
      ctx.stroke()

      // Vertical grid lines on ground
      ctx.strokeStyle = 'rgba(0,170,255,0.2)'
      ctx.lineWidth = 1
      ctx.shadowBlur = 0
      const gridSpacing = 30
      const startGridX = Math.floor(sx / gridSpacing) * gridSpacing
      for (let gx = startGridX; gx < sx + p.width; gx += gridSpacing) {
        if (gx < sx) continue
        ctx.beginPath()
        ctx.moveTo(gx, p.y)
        ctx.lineTo(gx, snap.canvasH)
        ctx.stroke()
      }

      ctx.shadowBlur = 0
    }
  }

  private drawObstacles(snap: GameSnapshot): void {
    const { ctx } = this
    const CHAR_X_FIXED = snap.charX

    for (const obs of snap.obstacles) {
      const sx = obs.x - snap.scrollX + CHAR_X_FIXED
      if (sx + obs.width < 0 || sx > snap.canvasW) continue

      const color = obs.type === 'spike' ? OBSTACLE_SPIKE : OBSTACLE_WALL
      ctx.shadowColor = color
      ctx.shadowBlur = 10
      ctx.fillStyle = color

      const top = obs.y - obs.height
      if (obs.type === 'spike') {
        // Triangle spike
        ctx.beginPath()
        ctx.moveTo(sx, obs.y)
        ctx.lineTo(sx + obs.width / 2, top)
        ctx.lineTo(sx + obs.width, obs.y)
        ctx.closePath()
        ctx.fill()
      } else {
        // Wall rectangle with glow outline
        ctx.fillRect(sx, top, obs.width, obs.height)
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.strokeRect(sx, top, obs.width, obs.height)
      }
      ctx.shadowBlur = 0
    }
  }

  private drawCoins(snap: GameSnapshot): void {
    const { ctx } = this
    const CHAR_X_FIXED = snap.charX

    for (const coin of snap.coins) {
      if (coin.collected) continue
      const sx = coin.x - snap.scrollX + CHAR_X_FIXED
      if (sx < -20 || sx > snap.canvasW + 20) continue
      const cy = coin.y + coin.bobOffset

      ctx.shadowColor = COIN_GLOW
      ctx.shadowBlur = 12
      ctx.fillStyle = COIN_COLOR
      ctx.beginPath()
      ctx.arc(sx, cy, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // Inner ring
      ctx.strokeStyle = '#fff8a0'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(sx, cy, 4, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  private drawCharacter(snap: GameSnapshot): void {
    const { ctx } = this
    const cx = snap.charX
    const cy = snap.charY
    const W = 24
    const H = 32

    ctx.globalAlpha = snap.isDying ? Math.max(0, snap.deathAlpha) : 1

    if (snap.isDying) {
      ctx.save()
      ctx.translate(cx, cy + H / 2)
      ctx.rotate(snap.deathAngle)
      this.drawCharBody(0, -H / 2, W, H, snap)
      ctx.restore()
    } else {
      this.drawCharBody(cx, cy, W, H, snap)
    }

    ctx.globalAlpha = 1
  }

  private drawCharBody(cx: number, cy: number, W: number, H: number, snap: GameSnapshot): void {
    const { ctx } = this
    const bodyH = H * 0.55
    const legH = H * 0.45

    // Body
    ctx.shadowColor = CHAR_BODY
    ctx.shadowBlur = 10
    ctx.fillStyle = CHAR_BODY
    ctx.fillRect(cx - W / 2, cy, W, bodyH)

    // Head
    ctx.fillStyle = '#ffccaa'
    ctx.fillRect(cx - W / 3, cy - W * 0.5, W * 0.65, W * 0.55)

    // Eyes
    ctx.fillStyle = '#000'
    ctx.fillRect(cx, cy - W * 0.35, 3, 3)

    // Legs (animated when running, static when airborne)
    ctx.fillStyle = CHAR_LEGS
    ctx.shadowBlur = 0

    if (snap.isOnGround) {
      const legSwing = Math.sin(snap.legAngle) * 8
      // Left leg
      ctx.save()
      ctx.translate(cx - 5, cy + bodyH)
      ctx.rotate(legSwing * Math.PI / 180)
      ctx.fillRect(-3, 0, 6, legH)
      ctx.restore()
      // Right leg
      ctx.save()
      ctx.translate(cx + 5, cy + bodyH)
      ctx.rotate(-legSwing * Math.PI / 180)
      ctx.fillRect(-3, 0, 6, legH)
      ctx.restore()
    } else {
      // Tuck legs when jumping
      ctx.fillRect(cx - 8, cy + bodyH, 6, legH * 0.5)
      ctx.fillRect(cx + 2, cy + bodyH, 6, legH * 0.5)
    }

    ctx.shadowBlur = 0
  }

  private drawGroundFog(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    const grad = ctx.createLinearGradient(0, snap.groundY, 0, canvas.height)
    grad.addColorStop(0, 'rgba(0,0,30,0)')
    grad.addColorStop(1, 'rgba(0,0,30,0.6)')
    ctx.fillStyle = grad
    ctx.fillRect(0, snap.groundY, canvas.width, canvas.height - snap.groundY)
  }

  private drawReadyOverlay(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    const w = canvas.width; const h = canvas.height
    ctx.fillStyle = 'rgba(26,26,46,0.78)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2; const cy = h / 2
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(22, w * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = CHAR_BODY; ctx.shadowColor = CHAR_BODY; ctx.shadowBlur = 22
    ctx.fillText('INFINITE RUNNER', cx, cy - h * 0.1)
    ctx.shadowBlur = 0
    ctx.font = `${Math.max(13, w * 0.04)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP OR PRESS SPACE TO START', cx, cy + h * 0.05)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = `${Math.max(11, w * 0.03)}px 'Courier New', monospace`
    ctx.fillText('SPACE / TAP = JUMP  |  DOUBLE TAP = DOUBLE JUMP', cx, cy + h * 0.13)
    void snap
  }

  private drawGameOverOverlay(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    const w = canvas.width; const h = canvas.height
    ctx.fillStyle = 'rgba(26,26,46,0.85)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2; const cy = h / 2
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(24, w * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = '#ff4466'; ctx.shadowColor = '#ff4466'; ctx.shadowBlur = 22
    ctx.fillText('GAME OVER', cx, cy - h * 0.1)
    ctx.shadowBlur = 0
    ctx.font = `${Math.max(15, w * 0.05)}px 'Courier New', monospace`
    ctx.fillStyle = COIN_COLOR
    ctx.fillText(`SCORE: ${snap.score}`, cx, cy)
    ctx.font = `${Math.max(12, w * 0.035)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP TO RESTART', cx, cy + h * 0.12)
  }
}
