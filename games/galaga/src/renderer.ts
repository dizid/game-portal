// Galaga — Canvas 2D renderer

import type { GameSnapshot, Enemy, EnemyType } from './game.js'

const BG = '#1a1a2e'
const PLAYER_COLOR = '#00ff88'
const BULLET_PLAYER = '#00ff88'
const BULLET_ENEMY = '#ff4466'
const ENEMY_COLORS: Record<EnemyType, string> = {
  basic: '#4488ff',
  medium: '#ff4444',
  boss: '#44ff88',
}

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

  updateAnimations(): void {
    this.animTick++
  }

  render(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    this.drawStars(snap)
    this.drawEnemies(snap)
    this.drawBullets(snap)
    this.drawExplosions(snap)
    this.drawCaptureBeam(snap)
    this.drawPlayer(snap)

    if (snap.state === 'BONUS_STAGE') {
      this.drawBonusHUD(snap)
    } else if (snap.state === 'WAVE_CLEAR') {
      this.drawWaveClear(snap)
    }

    if (snap.state === 'READY') this.drawReadyOverlay(snap)
    else if (snap.state === 'GAME_OVER') this.drawGameOverOverlay(snap)
  }

  private drawStars(snap: GameSnapshot): void {
    const { ctx } = this
    for (const s of snap.stars) {
      ctx.fillStyle = `rgba(255,255,255,${s.brightness})`
      ctx.fillRect(s.x, s.y, s.size, s.size)
    }
  }

  private drawPlayer(snap: GameSnapshot): void {
    const { ctx } = this
    const { playerX: cx, playerY: cy } = snap

    ctx.shadowColor = PLAYER_COLOR
    ctx.shadowBlur = 14
    ctx.fillStyle = PLAYER_COLOR

    // Main body
    ctx.fillRect(cx - 4, cy - 18, 8, 14)
    // Wings
    ctx.fillRect(cx - 18, cy - 6, 36, 5)
    // Engine pods
    ctx.fillRect(cx - 18, cy - 2, 8, 8)
    ctx.fillRect(cx + 10, cy - 2, 8, 8)
    // Cockpit
    ctx.fillStyle = '#aaffff'
    ctx.fillRect(cx - 3, cy - 14, 6, 7)

    // Dual ship offset
    if (snap.playerDual) {
      ctx.fillStyle = PLAYER_COLOR
      const dx2 = cx + 26
      ctx.fillRect(dx2 - 4, cy - 18, 8, 14)
      ctx.fillRect(dx2 - 18, cy - 6, 36, 5)
      ctx.fillRect(dx2 - 18, cy - 2, 8, 8)
      ctx.fillRect(dx2 + 10, cy - 2, 8, 8)
      ctx.fillStyle = '#aaffff'
      ctx.fillRect(dx2 - 3, cy - 14, 6, 7)
    }

    ctx.shadowBlur = 0
  }

  private drawEnemies(snap: GameSnapshot): void {
    for (const e of snap.enemies) {
      if (!e.alive) continue
      this.drawEnemy(e, snap)
    }
  }

  private drawEnemy(e: Enemy, snap: GameSnapshot): void {
    const { ctx } = this
    const color = ENEMY_COLORS[e.type]
    ctx.shadowColor = color
    ctx.shadowBlur = 10
    ctx.fillStyle = color

    const { x, y } = e
    const f = e.frame

    switch (e.type) {
      case 'basic':
        this.drawBasicEnemy(x, y, f)
        break
      case 'medium':
        this.drawMediumEnemy(x, y, f)
        break
      case 'boss':
        this.drawBossEnemy(x, y, f, e.health)
        break
    }

    ctx.shadowBlur = 0
    void snap
  }

  private drawBasicEnemy(cx: number, cy: number, f: number): void {
    const { ctx } = this
    // Blue fighter: arrowhead shape
    ctx.fillRect(cx - 2, cy - 12, 4, 10)   // nose
    ctx.fillRect(cx - 8, cy - 4, 16, 4)    // body
    ctx.fillRect(cx - 12, cy, 8, 4)         // left wing
    ctx.fillRect(cx + 4, cy, 8, 4)          // right wing
    if (f === 1) {
      // Engine glow
      ctx.fillStyle = 'rgba(100,200,255,0.6)'
      ctx.fillRect(cx - 3, cy + 4, 6, 3)
    }
  }

  private drawMediumEnemy(cx: number, cy: number, f: number): void {
    const { ctx } = this
    // Red butterfly-like
    ctx.fillRect(cx - 3, cy - 10, 6, 8)
    ctx.fillRect(cx - 10, cy - 6, 20, 5)
    ctx.fillRect(cx - 14, cy - 2, 10, 6)
    ctx.fillRect(cx + 4, cy - 2, 10, 6)
    if (f === 0) {
      ctx.fillRect(cx - 14, cy + 4, 4, 4)
      ctx.fillRect(cx + 10, cy + 4, 4, 4)
    } else {
      ctx.fillRect(cx - 12, cy + 4, 4, 4)
      ctx.fillRect(cx + 8, cy + 4, 4, 4)
    }
  }

  private drawBossEnemy(cx: number, cy: number, f: number, health: number): void {
    const { ctx } = this
    // Green boss ship (larger)
    ctx.fillRect(cx - 4, cy - 16, 8, 12)
    ctx.fillRect(cx - 16, cy - 8, 32, 6)
    ctx.fillRect(cx - 20, cy - 2, 16, 8)
    ctx.fillRect(cx + 4, cy - 2, 16, 8)
    ctx.fillRect(cx - 10, cy + 6, 20, 5)
    // Cockpit
    ctx.fillStyle = health === 2 ? '#ffffff' : '#ff8800'
    ctx.fillRect(cx - 4, cy - 10, 8, 8)
    // Wing lights
    const lightX = f === 0 ? cx - 18 : cx - 19
    ctx.fillStyle = '#ffff44'
    ctx.fillRect(lightX, cy, 4, 4)
    ctx.fillRect(cx + 15 + (f === 0 ? 0 : 1), cy, 4, 4)
  }

  private drawBullets(snap: GameSnapshot): void {
    const { ctx } = this
    for (const b of snap.bullets) {
      ctx.shadowColor = b.isPlayer ? BULLET_PLAYER : BULLET_ENEMY
      ctx.shadowBlur = 8
      ctx.fillStyle = b.isPlayer ? BULLET_PLAYER : BULLET_ENEMY
      if (b.isPlayer) {
        ctx.fillRect(b.x - 2, b.y - 10, 4, 16)
      } else {
        ctx.fillRect(b.x - 3, b.y - 4, 6, 12)
      }
    }
    ctx.shadowBlur = 0
  }

  private drawExplosions(snap: GameSnapshot): void {
    const { ctx } = this
    for (const ex of snap.explosions) {
      ctx.globalAlpha = Math.max(0, ex.alpha)
      ctx.strokeStyle = ex.color
      ctx.lineWidth = 2
      ctx.shadowColor = ex.color
      ctx.shadowBlur = 12

      // Starburst
      const rays = 8
      for (let i = 0; i < rays; i++) {
        const angle = (i / rays) * Math.PI * 2
        const r1 = ex.radius * 0.4
        const r2 = ex.radius
        ctx.beginPath()
        ctx.moveTo(ex.x + Math.cos(angle) * r1, ex.y + Math.sin(angle) * r1)
        ctx.lineTo(ex.x + Math.cos(angle) * r2, ex.y + Math.sin(angle) * r2)
        ctx.stroke()
      }
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
    }
  }

  private drawCaptureBeam(snap: GameSnapshot): void {
    if (!snap.captureBeam) return
    const { ctx } = this
    const beam = snap.captureBeam
    const w = 32
    ctx.globalAlpha = beam.alpha
    const grad = ctx.createLinearGradient(beam.x, beam.y, beam.x, beam.y + beam.height)
    grad.addColorStop(0, 'rgba(0,200,255,0.8)')
    grad.addColorStop(1, 'rgba(0,200,255,0)')
    ctx.fillStyle = grad
    ctx.shadowColor = '#00c8ff'
    ctx.shadowBlur = 20
    ctx.fillRect(beam.x - w / 2, beam.y, w, beam.height)
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  }

  private drawBonusHUD(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = `bold ${Math.max(16, canvas.width * 0.05)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffff44'
    ctx.shadowColor = '#ffff44'; ctx.shadowBlur = 12
    ctx.fillText('BONUS STAGE', canvas.width / 2, 36)
    ctx.shadowBlur = 0
    ctx.font = `${Math.max(12, canvas.width * 0.035)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`HITS: ${snap.bonusStageHits}`, canvas.width / 2, 60)
  }

  private drawWaveClear(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    const cx = canvas.width / 2; const cy = canvas.height / 2
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(20, canvas.width * 0.07)}px 'Courier New', monospace`
    ctx.fillStyle = '#50ffb4'; ctx.shadowColor = '#50ffb4'; ctx.shadowBlur = 18
    ctx.fillText(`WAVE ${snap.wave} CLEAR`, cx, cy)
    ctx.shadowBlur = 0
  }

  private drawReadyOverlay(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    const w = canvas.width; const h = canvas.height
    ctx.fillStyle = 'rgba(26,26,46,0.80)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2; const cy = h / 2
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(28, w * 0.1)}px 'Courier New', monospace`
    ctx.fillStyle = '#50ffb4'; ctx.shadowColor = '#50ffb4'; ctx.shadowBlur = 22
    ctx.fillText('GALAGA', cx, cy - h * 0.1)
    ctx.shadowBlur = 0
    ctx.font = `${Math.max(13, w * 0.04)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP OR PRESS SPACE', cx, cy + h * 0.04)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = `${Math.max(11, w * 0.03)}px 'Courier New', monospace`
    ctx.fillText('ARROWS / A-D TO MOVE  |  SPACE / TAP TO FIRE', cx, cy + h * 0.12)
    void snap
  }

  private drawGameOverOverlay(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    const w = canvas.width; const h = canvas.height
    ctx.fillStyle = 'rgba(26,26,46,0.85)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2; const cy = h / 2
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(26, w * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = '#ff4466'; ctx.shadowColor = '#ff4466'; ctx.shadowBlur = 22
    ctx.fillText('GAME OVER', cx, cy - h * 0.1)
    ctx.shadowBlur = 0
    ctx.font = `${Math.max(15, w * 0.05)}px 'Courier New', monospace`
    ctx.fillStyle = '#50ffb4'
    ctx.fillText(`SCORE: ${snap.score}`, cx, cy)
    ctx.font = `${Math.max(12, w * 0.035)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP TO RESTART', cx, cy + h * 0.13)
  }
}
