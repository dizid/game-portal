// Space Invaders — Canvas 2D renderer

import type { GameSnapshot, Alien, AlienType } from './game.js'

const BG = '#1a1a2e'
const PLAYER_COLOR = '#00ff88'
const BULLET_PLAYER_COLOR = '#00ff88'
const BULLET_ALIEN_COLOR = '#ff4466'
const UFO_COLOR = '#ff88ff'
const SHIELD_COLORS = ['#00ff88', '#88ff44', '#ffaa00', '#ff4400']  // health 3,2,1,0
const TEXT_COLOR = '#ffffff'

// Neon colours per alien type
const ALIEN_COLORS: Record<AlienType, string> = {
  squid:     '#ff4466',  // row 4 (top): 30pts — hot pink
  crab:      '#ff8844',  // rows 2-3: 20pts — orange
  octopus:   '#44aaff',  // rows 0-1 (bottom): 10pts — blue
  jellyfish: '#ffff44',  // unused in default layout, yellow
  boss:      '#ff44ff',  // UFO boss - magenta
}

export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private animTick = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    this.ctx = ctx
  }

  updateAnimations(): void {
    this.animTick++
  }

  render(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    const w = canvas.width
    const h = canvas.height

    // Background
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)

    // Scanline effect (subtle)
    ctx.fillStyle = 'rgba(0,0,0,0.07)'
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1)
    }

    // Stars
    this.drawStars(w, h)

    // Ground line
    ctx.strokeStyle = 'rgba(0,255,136,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, snap.playerY + 18)
    ctx.lineTo(w, snap.playerY + 18)
    ctx.stroke()

    // Shields
    for (const shield of snap.shields) {
      if (shield.health <= 0) continue
      ctx.fillStyle = SHIELD_COLORS[Math.min(3, 3 - (3 - shield.health))]
      ctx.shadowColor = SHIELD_COLORS[shield.health - 1] ?? '#00ff88'
      ctx.shadowBlur = 4
      ctx.fillRect(shield.x, shield.y, 10, 8)
    }
    ctx.shadowBlur = 0

    // Aliens
    for (const alien of snap.aliens) {
      if (!alien.alive) continue
      this.drawAlien(alien)
    }

    // UFO
    if (snap.ufo.active) {
      this.drawUFO(snap.ufo.x, snap.ufo.y)
    }

    // Player
    this.drawPlayer(snap.playerX, snap.playerY)

    // Bullets
    for (const b of snap.bullets) {
      ctx.shadowColor = b.isPlayer ? BULLET_PLAYER_COLOR : BULLET_ALIEN_COLOR
      ctx.shadowBlur = 6
      ctx.fillStyle = b.isPlayer ? BULLET_PLAYER_COLOR : BULLET_ALIEN_COLOR
      if (b.isPlayer) {
        ctx.fillRect(b.x - 2, b.y - 8, 4, 14)
      } else {
        // Zigzag alien bullet (alternate each frame)
        const zigX = b.x + (this.animTick % 4 < 2 ? -2 : 2)
        ctx.fillRect(zigX - 2, b.y - 4, 4, 10)
      }
    }
    ctx.shadowBlur = 0

    // Flash on alien death
    if (snap.flashTimer > 0) {
      ctx.fillStyle = `rgba(255,255,255,${snap.flashTimer * 0.025})`
      ctx.fillRect(0, 0, w, h)
    }

    // Overlays
    if (snap.state === 'READY') this.drawReadyOverlay(w, h)
    else if (snap.state === 'GAME_OVER') this.drawGameOverOverlay(w, h, snap.score)

    // Level display during play
    if (snap.state === 'PLAYING') {
      ctx.font = `11px 'Courier New', monospace`
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(`LVL ${snap.level}`, w / 2, 4)
    }
  }

  private drawStars(w: number, h: number): void {
    // Use a seeded pattern so stars don't flicker
    const { ctx } = this
    const count = 60
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    for (let i = 0; i < count; i++) {
      const x = ((i * 137.5 + 23) % w)
      const y = ((i * 97.3 + 11) % (h * 0.65))
      const size = i % 3 === 0 ? 2 : 1
      ctx.fillRect(x, y, size, size)
    }
  }

  private drawPlayer(cx: number, cy: number): void {
    const { ctx } = this
    ctx.shadowColor = PLAYER_COLOR
    ctx.shadowBlur = 14
    ctx.fillStyle = PLAYER_COLOR

    // Cannon barrel
    ctx.fillRect(cx - 3, cy - 18, 6, 12)
    // Base body
    ctx.fillRect(cx - 18, cy - 8, 36, 10)
    // Left leg
    ctx.fillRect(cx - 18, cy + 2, 10, 6)
    // Right leg
    ctx.fillRect(cx + 8, cy + 2, 10, 6)

    ctx.shadowBlur = 0
  }

  private drawAlien(alien: Alien): void {
    const { ctx } = this
    const color = ALIEN_COLORS[alien.type]
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    ctx.fillStyle = color

    const x = alien.x - 18
    const y = alien.y - 14
    const f = alien.frame

    switch (alien.type) {
      case 'octopus':  this.drawOctopus(x, y, f); break
      case 'crab':     this.drawCrab(x, y, f); break
      case 'squid':    this.drawSquid(x, y, f); break
      default:         this.drawCrab(x, y, f); break
    }

    ctx.shadowBlur = 0
  }

  // Pixel-art aliens drawn with small filled rects on a 12×8 virtual grid
  private fillPixels(
    baseX: number, baseY: number,
    pixels: [number, number][],
    pw = 3, ph = 3
  ): void {
    for (const [px, py] of pixels) {
      this.ctx.fillRect(baseX + px * pw, baseY + py * ph, pw - 1, ph - 1)
    }
  }

  private drawOctopus(x: number, y: number, frame: number): void {
    // 10pts — blue cuttlefish shape, wide with tentacles
    const f0: [number, number][] = [
      [3,0],[4,0],[5,0],[6,0],
      [2,1],[3,1],[4,1],[5,1],[6,1],[7,1],
      [1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],
      [1,3],[2,3],[4,3],[5,3],[7,3],[8,3],
      [1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],
      [2,5],[4,5],[5,5],[7,5],
      [1,6],[3,6],[6,6],[8,6],
    ]
    const f1: [number, number][] = [
      [3,0],[4,0],[5,0],[6,0],
      [2,1],[3,1],[4,1],[5,1],[6,1],[7,1],
      [1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],
      [1,3],[2,3],[4,3],[5,3],[7,3],[8,3],
      [1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],
      [1,5],[3,5],[6,5],[8,5],
      [2,6],[4,6],[5,6],[7,6],
    ]
    this.fillPixels(x, y, frame === 0 ? f0 : f1)
  }

  private drawCrab(x: number, y: number, frame: number): void {
    // 20pts — classic crab
    const f0: [number, number][] = [
      [4,0],[5,0],
      [2,1],[3,1],[4,1],[5,1],[6,1],[7,1],
      [1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],
      [1,3],[3,3],[4,3],[5,3],[6,3],[8,3],
      [1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],
      [2,5],[3,5],[6,5],[7,5],
      [1,6],[4,6],[5,6],[8,6],
    ]
    const f1: [number, number][] = [
      [4,0],[5,0],
      [2,1],[3,1],[4,1],[5,1],[6,1],[7,1],
      [1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],
      [1,3],[3,3],[4,3],[5,3],[6,3],[8,3],
      [1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],
      [1,5],[4,5],[5,5],[8,5],
      [2,6],[3,6],[6,6],[7,6],
    ]
    this.fillPixels(x, y, frame === 0 ? f0 : f1)
  }

  private drawSquid(x: number, y: number, frame: number): void {
    // 30pts — tall squid
    const f0: [number, number][] = [
      [4,0],[5,0],
      [3,1],[4,1],[5,1],[6,1],
      [2,2],[3,2],[4,2],[5,2],[6,2],[7,2],
      [2,3],[3,3],[5,3],[6,3],
      [2,4],[3,4],[4,4],[5,4],[6,4],[7,4],
      [3,5],[6,5],
      [2,6],[7,6],
    ]
    const f1: [number, number][] = [
      [4,0],[5,0],
      [3,1],[4,1],[5,1],[6,1],
      [2,2],[3,2],[4,2],[5,2],[6,2],[7,2],
      [2,3],[3,3],[5,3],[6,3],
      [2,4],[3,4],[4,4],[5,4],[6,4],[7,4],
      [2,5],[7,5],
      [3,6],[6,6],
    ]
    this.fillPixels(x, y, frame === 0 ? f0 : f1)
  }

  private drawUFO(cx: number, cy: number): void {
    const { ctx } = this
    ctx.shadowColor = UFO_COLOR
    ctx.shadowBlur = 16
    ctx.fillStyle = UFO_COLOR

    // Saucer shape
    ctx.beginPath()
    ctx.ellipse(cx, cy + 4, 28, 10, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx, cy - 2, 14, 10, 0, Math.PI, 0)
    ctx.fill()

    // Lights
    const lights = [-16, -8, 0, 8, 16]
    const tick = Math.floor(this.animTick / 8)
    for (let i = 0; i < lights.length; i++) {
      ctx.fillStyle = i === tick % lights.length ? '#ffffff' : 'rgba(255,136,255,0.5)'
      ctx.beginPath()
      ctx.arc(cx + lights[i], cy + 4, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0
  }

  private drawReadyOverlay(w: number, h: number): void {
    const { ctx } = this
    ctx.fillStyle = 'rgba(26,26,46,0.8)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2
    const cy = h / 2

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = `bold ${Math.max(28, w * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = '#00c8ff'
    ctx.shadowColor = '#00c8ff'
    ctx.shadowBlur = 22
    ctx.fillText('SPACE INVADERS', cx, cy - h * 0.12)

    ctx.shadowBlur = 0
    ctx.font = `${Math.max(13, w * 0.038)}px 'Courier New', monospace`
    ctx.fillStyle = TEXT_COLOR
    ctx.fillText('TAP OR PRESS SPACE TO START', cx, cy + h * 0.04)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = `${Math.max(11, w * 0.028)}px 'Courier New', monospace`
    ctx.fillText('ARROWS / A-D TO MOVE  |  SPACE / TAP TO FIRE', cx, cy + h * 0.12)
  }

  private drawGameOverOverlay(w: number, h: number, score: number): void {
    const { ctx } = this
    ctx.fillStyle = 'rgba(26,26,46,0.85)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2
    const cy = h / 2

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(26, w * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = '#ff4466'
    ctx.shadowColor = '#ff4466'
    ctx.shadowBlur = 24
    ctx.fillText('GAME OVER', cx, cy - h * 0.12)
    ctx.shadowBlur = 0
    ctx.font = `${Math.max(16, w * 0.05)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffcc00'
    ctx.fillText(`SCORE: ${score}`, cx, cy)
    ctx.font = `${Math.max(13, w * 0.035)}px 'Courier New', monospace`
    ctx.fillStyle = TEXT_COLOR
    ctx.fillText('TAP TO RESTART', cx, cy + h * 0.13)
  }
}
