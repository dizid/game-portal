// Drift Challenge — Canvas 2D renderer (top-down)

import type { GameSnapshot } from './game.js'

const BG = '#1a1a2e'
const TRACK_COLOR = '#252545'
const TRACK_EDGE_COLOR = '#ff3c78'
const TRACK_LINE_COLOR = 'rgba(255,255,255,0.12)'
const CAR_COLOR = '#00ccff'
const CAR_BODY_COLOR = '#0088cc'
const DRIFT_COLOR = '#ff3c78'
const TIRE_MARK_COLOR = '#ff3c78'
const CHECKPOINT_COLOR = 'rgba(80,255,160,0.5)'

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

    this.drawTrack(snap)
    this.drawTireMarks(snap)
    this.drawCheckpoints(snap)
    this.drawCar(snap)
    this.drawDriftHUD(snap)

    if (snap.state === 'READY') this.drawReadyOverlay(snap)
    else if (snap.state === 'GAME_OVER') this.drawFinishOverlay(snap)
  }

  private drawTrack(snap: GameSnapshot): void {
    const { ctx } = this
    const { trackCX: cx, trackCY: cy, trackRX, trackRY, innerRX, innerRY } = snap

    // Road surface
    ctx.fillStyle = TRACK_COLOR
    ctx.beginPath()
    ctx.ellipse(cx, cy, trackRX, trackRY, 0, 0, Math.PI * 2)
    ctx.fill()

    // Inner hole (cut out)
    ctx.fillStyle = BG
    ctx.beginPath()
    ctx.ellipse(cx, cy, innerRX, innerRY, 0, 0, Math.PI * 2)
    ctx.fill()

    // Outer neon edge
    ctx.shadowColor = TRACK_EDGE_COLOR
    ctx.shadowBlur = 14
    ctx.strokeStyle = TRACK_EDGE_COLOR
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(cx, cy, trackRX, trackRY, 0, 0, Math.PI * 2)
    ctx.stroke()

    // Inner neon edge
    ctx.beginPath()
    ctx.ellipse(cx, cy, innerRX, innerRY, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0

    // Centre dashed line
    ctx.strokeStyle = TRACK_LINE_COLOR
    ctx.lineWidth = 2
    ctx.setLineDash([20, 20])
    const midRX = (trackRX + innerRX) / 2
    const midRY = (trackRY + innerRY) / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, midRX, midRY, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Start/finish line
    const sfY = cy - (trackRY + innerRY) / 2
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 4; i++) {
      const x = cx - 12 + i * 6
      ctx.fillRect(x, sfY - 3, 5, 6)
    }
  }

  private drawTireMarks(snap: GameSnapshot): void {
    const { ctx } = this
    for (const mark of snap.tireMarks) {
      ctx.strokeStyle = `rgba(255,60,120,${mark.alpha})`
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(mark.x1, mark.y1)
      ctx.lineTo(mark.x2, mark.y2)
      ctx.stroke()
    }
  }

  private drawCheckpoints(snap: GameSnapshot): void {
    const { ctx } = this
    for (const cp of snap.checkpoints) {
      if (cp.passed) continue
      const halfLen = cp.width / 2
      const cos = Math.cos(cp.angle)
      const sin = Math.sin(cp.angle)
      ctx.strokeStyle = CHECKPOINT_COLOR
      ctx.lineWidth = 3
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      ctx.moveTo(cp.cx - cos * halfLen, cp.cy - sin * halfLen)
      ctx.lineTo(cp.cx + cos * halfLen, cp.cy + sin * halfLen)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  private drawCar(snap: GameSnapshot): void {
    const { ctx } = this
    const { carX, carY, carAngle, driftAngle, isDrifting } = snap

    ctx.save()
    ctx.translate(carX, carY)
    ctx.rotate(carAngle + driftAngle)  // body rotated by drift angle

    const W = 16  // half-width
    const H = 24  // half-height

    // Glow when drifting
    if (isDrifting) {
      ctx.shadowColor = DRIFT_COLOR
      ctx.shadowBlur = 20
    } else {
      ctx.shadowColor = CAR_COLOR
      ctx.shadowBlur = 10
    }

    // Car body
    ctx.fillStyle = isDrifting ? DRIFT_COLOR : CAR_COLOR
    ctx.fillRect(-W, -H, W * 2, H * 2)

    // Windshield
    ctx.fillStyle = '#aaeeff'
    ctx.fillRect(-W * 0.6, -H * 0.7, W * 1.2, H * 0.4)

    // Headlights
    ctx.fillStyle = '#ffffaa'
    ctx.shadowColor = '#ffffaa'; ctx.shadowBlur = 8
    ctx.fillRect(-W + 2, -H + 2, 6, 4)
    ctx.fillRect(W - 8, -H + 2, 6, 4)

    // Taillights
    ctx.fillStyle = '#ff4444'
    ctx.fillRect(-W + 2, H - 6, 6, 4)
    ctx.fillRect(W - 8, H - 6, 6, 4)

    ctx.shadowBlur = 0
    ctx.restore()

    // Direction indicator (forward arrow) — subtle
    if (snap.carSpeed > 1) {
      const fwdX = Math.cos(carAngle) * 30
      const fwdY = Math.sin(carAngle) * 30
      ctx.strokeStyle = 'rgba(0,200,255,0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(carX, carY)
      ctx.lineTo(carX + fwdX, carY + fwdY)
      ctx.stroke()
    }
  }

  private drawDriftHUD(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    if (snap.state !== 'PLAYING') return

    const cx = canvas.width / 2
    const bottom = canvas.height - 12

    // Drift score popup when drifting
    if (snap.isDrifting && snap.driftMultiplier > 1) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.font = `bold ${Math.max(18, canvas.width * 0.06)}px 'Courier New', monospace`
      ctx.fillStyle = DRIFT_COLOR
      ctx.shadowColor = DRIFT_COLOR; ctx.shadowBlur = 16
      ctx.fillText(`DRIFT x${snap.driftMultiplier}`, cx, bottom - 30)
      ctx.shadowBlur = 0
    }

    // Lap timer
    const lapSec = (snap.lapTime / 60).toFixed(1)
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.font = `${Math.max(11, canvas.width * 0.032)}px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText(`LAP TIME: ${lapSec}s`, 12, bottom)

    // Best lap
    if (snap.bestLapTime > 0) {
      const bestSec = (snap.bestLapTime / 60).toFixed(1)
      ctx.textAlign = 'right'
      ctx.fillText(`BEST: ${bestSec}s`, canvas.width - 12, bottom)
    }
  }

  private drawReadyOverlay(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    const w = canvas.width; const h = canvas.height
    ctx.fillStyle = 'rgba(26,26,46,0.78)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2; const cy = h / 2
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.max(22, w * 0.09)}px 'Courier New', monospace`
    ctx.fillStyle = TRACK_EDGE_COLOR; ctx.shadowColor = TRACK_EDGE_COLOR; ctx.shadowBlur = 22
    ctx.fillText('DRIFT CHALLENGE', cx, cy - h * 0.12)
    ctx.shadowBlur = 0
    ctx.font = `${Math.max(12, w * 0.037)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`${snap.lap === 0 ? 3 : snap.lap} LAPS  |  DRIFT TO SCORE`, cx, cy)
    ctx.fillText('TAP OR PRESS ANY KEY TO START', cx, cy + h * 0.08)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = `${Math.max(10, w * 0.028)}px 'Courier New', monospace`
    ctx.fillText('W/UP = GAS  S/DOWN = BRAKE  A-D / LEFT-RIGHT = STEER', cx, cy + h * 0.16)
  }

  private drawFinishOverlay(snap: GameSnapshot): void {
    const { ctx, canvas } = this
    const w = canvas.width; const h = canvas.height
    ctx.fillStyle = 'rgba(26,26,46,0.85)'
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2; const cy = h / 2
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    ctx.font = `bold ${Math.max(22, w * 0.08)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffff44'; ctx.shadowColor = '#ffff44'; ctx.shadowBlur = 22
    ctx.fillText('RACE COMPLETE!', cx, cy - h * 0.16)
    ctx.shadowBlur = 0

    ctx.font = `${Math.max(14, w * 0.045)}px 'Courier New', monospace`
    ctx.fillStyle = TRACK_EDGE_COLOR
    ctx.fillText(`FINAL SCORE: ${snap.score}`, cx, cy - h * 0.06)

    ctx.fillStyle = DRIFT_COLOR
    ctx.fillText(`DRIFT SCORE: ${snap.driftScore}`, cx, cy + h * 0.02)

    if (snap.bestLapTime > 0) {
      const bestSec = (snap.bestLapTime / 60).toFixed(2)
      ctx.fillStyle = '#00ccff'
      ctx.fillText(`BEST LAP: ${bestSec}s`, cx, cy + h * 0.10)
    }

    ctx.font = `${Math.max(12, w * 0.035)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP TO PLAY AGAIN', cx, cy + h * 0.20)
  }
}
