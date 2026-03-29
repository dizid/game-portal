// Canvas renderer for Match-3 — draws gems as distinct colored shapes

import type { GameSnapshot } from './game.js'
import { GRID_ROWS, GRID_COLS, GEM_TYPES } from './game.js'

// Each gem type: fill color, stroke color, shape
interface GemStyle {
  fill: string
  stroke: string
  shape: 'circle' | 'square' | 'diamond' | 'triangle' | 'star' | 'hexagon'
}

const GEM_STYLES: GemStyle[] = [
  { fill: '#ff6b6b', stroke: '#ff9999', shape: 'circle' },    // 0 Red circle
  { fill: '#4fc3f7', stroke: '#81d4fa', shape: 'diamond' },   // 1 Blue diamond
  { fill: '#81c784', stroke: '#a5d6a7', shape: 'square' },    // 2 Green square
  { fill: '#ffd166', stroke: '#ffe599', shape: 'star' },      // 3 Yellow star
  { fill: '#ce93d8', stroke: '#e1bee7', shape: 'triangle' },  // 4 Purple triangle
  { fill: '#ff8a65', stroke: '#ffab91', shape: 'hexagon' },   // 5 Orange hexagon
]

if (GEM_STYLES.length !== GEM_TYPES) {
  throw new Error('GEM_STYLES length must equal GEM_TYPES')
}

export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private cellSize: number = 0
  private padding: number = 3

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  /** Call on resize to set canvas dimensions */
  resize(containerWidth: number, containerHeight: number): void {
    const available = Math.min(containerWidth, containerHeight) - 8
    const cellSize = Math.floor(available / Math.max(GRID_ROWS, GRID_COLS))
    const totalSize = cellSize * Math.max(GRID_ROWS, GRID_COLS)
    this.canvas.width = totalSize
    this.canvas.height = totalSize
    this.canvas.style.width = `${totalSize}px`
    this.canvas.style.height = `${totalSize}px`
    this.cellSize = cellSize
  }

  getCellSize(): number { return this.cellSize }

  /** Convert canvas coords to grid cell */
  canvasToCell(x: number, y: number): { row: number; col: number } | null {
    const col = Math.floor(x / this.cellSize)
    const row = Math.floor(y / this.cellSize)
    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return null
    return { row, col }
  }

  render(snap: GameSnapshot): void {
    const { ctx, cellSize, padding } = this
    if (cellSize === 0) return
    const cs = cellSize

    // Background
    ctx.fillStyle = '#0f0f23'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    const { grid, selected, swapAnim } = snap

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const gem = grid[r][c]

        // Cell background
        const cellX = c * cs
        const cellY = r * cs
        ctx.fillStyle = (r + c) % 2 === 0
          ? 'rgba(255,255,255,0.04)'
          : 'rgba(255,255,255,0.02)'
        ctx.fillRect(cellX + 1, cellY + 1, cs - 2, cs - 2)

        if (!gem) continue

        // Compute draw position (accounts for swap animation and fall animation)
        let drawX = c * cs + padding
        let drawY = r * cs + padding
        const gemW = cs - padding * 2
        const gemH = cs - padding * 2

        // Swap animation offset
        if (swapAnim) {
          const { r1, c1, r2, c2, t } = swapAnim
          const eased = easeInOut(Math.min(1, t))
          if (r === r1 && c === c1) {
            drawX += (c2 - c1) * cs * eased
            drawY += (r2 - r1) * cs * eased
          } else if (r === r2 && c === c2) {
            drawX += (c1 - c2) * cs * eased
            drawY += (r1 - r2) * cs * eased
          }
        }

        // Fall animation
        if (gem.fallFrom !== undefined && gem.fallFrom !== null) {
          // fallFrom is where it fell from (higher row index = lower, so negative offset)
          const fallOffset = (gem.fallFrom - r) * cs
          // Animate to 0 over time — but we don't track per-gem time,
          // so we just draw at settled position (fall handled externally)
          void fallOffset
        }

        // Selected highlight
        const isSelected = selected && selected.row === r && selected.col === c
        if (isSelected) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)'
          ctx.beginPath()
          ctx.roundRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2, 4)
          ctx.fill()
        }

        // Draw the gem
        const style = GEM_STYLES[gem.type]
        const cx = drawX + gemW / 2
        const cy = drawY + gemH / 2
        const radius = gemW * 0.38

        this.drawGem(style, cx, cy, radius, gemW, gemH)

        // Removing animation: reduce opacity (not tracked per tick here)
      }
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    for (let r = 0; r <= GRID_ROWS; r++) {
      ctx.beginPath()
      ctx.moveTo(0, r * cs)
      ctx.lineTo(GRID_COLS * cs, r * cs)
      ctx.stroke()
    }
    for (let c = 0; c <= GRID_COLS; c++) {
      ctx.beginPath()
      ctx.moveTo(c * cs, 0)
      ctx.lineTo(c * cs, GRID_ROWS * cs)
      ctx.stroke()
    }
  }

  private drawGem(
    style: GemStyle,
    cx: number, cy: number,
    radius: number,
    _w: number, _h: number,
  ): void {
    const { ctx } = this
    ctx.save()
    ctx.shadowColor = style.fill
    ctx.shadowBlur = 8

    ctx.fillStyle = style.fill
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = 2

    switch (style.shape) {
      case 'circle':
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        break

      case 'square': {
        const half = radius * 0.9
        ctx.beginPath()
        ctx.roundRect(cx - half, cy - half, half * 2, half * 2, 4)
        ctx.fill()
        ctx.stroke()
        break
      }

      case 'diamond': {
        ctx.beginPath()
        ctx.moveTo(cx, cy - radius)
        ctx.lineTo(cx + radius * 0.8, cy)
        ctx.lineTo(cx, cy + radius)
        ctx.lineTo(cx - radius * 0.8, cy)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        break
      }

      case 'triangle': {
        const r = radius * 1.05
        ctx.beginPath()
        ctx.moveTo(cx, cy - r)
        ctx.lineTo(cx + r * 0.866, cy + r * 0.5)
        ctx.lineTo(cx - r * 0.866, cy + r * 0.5)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        break
      }

      case 'star': {
        const outerR = radius
        const innerR = radius * 0.42
        const points = 5
        ctx.beginPath()
        for (let i = 0; i < points * 2; i++) {
          const r2 = i % 2 === 0 ? outerR : innerR
          const angle = (i * Math.PI) / points - Math.PI / 2
          if (i === 0) ctx.moveTo(cx + r2 * Math.cos(angle), cy + r2 * Math.sin(angle))
          else ctx.lineTo(cx + r2 * Math.cos(angle), cy + r2 * Math.sin(angle))
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        break
      }

      case 'hexagon': {
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3 - Math.PI / 6
          const x = cx + radius * Math.cos(angle)
          const y = cy + radius * Math.sin(angle)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        break
      }
    }

    ctx.restore()
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}
