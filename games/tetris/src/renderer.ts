// Tetris — Canvas 2D renderer

import type { GameSnapshot, Piece } from './game.js'
import { TETROMINO_COLORS } from './game.js'

const BG_COLOR = '#1a1a2e'
const GRID_COLOR = 'rgba(255,255,255,0.05)'
const NEXT_PANEL_COLOR = 'rgba(0,0,0,0.35)'

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
    const { state, board, activePiece, ghostY, nextPiece, score, level, lines, clearingRows, lineClearTimer } = snap

    const COLS = 10
    const ROWS = 20
    const SIDE_PANEL = 80  // width of side panel for next piece + info

    // Cell size based on canvas height
    const cellSize = Math.floor((canvas.height * 0.95) / ROWS)
    const boardW = cellSize * COLS
    const boardH = cellSize * ROWS
    const offX = (canvas.width - boardW - SIDE_PANEL) / 2
    const offY = (canvas.height - boardH) / 2

    // Background
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Board border
    ctx.strokeStyle = 'rgba(180, 100, 255, 0.2)'
    ctx.lineWidth = 1
    ctx.strokeRect(offX - 1, offY - 1, boardW + 2, boardH + 2)

    // Grid
    ctx.strokeStyle = GRID_COLOR
    ctx.lineWidth = 0.5
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath()
      ctx.moveTo(offX + c * cellSize, offY)
      ctx.lineTo(offX + c * cellSize, offY + boardH)
      ctx.stroke()
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath()
      ctx.moveTo(offX, offY + r * cellSize)
      ctx.lineTo(offX + boardW, offY + r * cellSize)
      ctx.stroke()
    }

    // Placed blocks
    for (let r = 0; r < ROWS; r++) {
      const isClearing = clearingRows.includes(r) && lineClearTimer > 0
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c]
        if (cell.filled) {
          if (isClearing) {
            // Flash white during line clear
            const alpha = Math.sin((lineClearTimer / 0.3) * Math.PI)
            const flashColor = `rgba(255,255,255,${alpha * 0.8})`
            this.drawBlock(offX + c * cellSize, offY + r * cellSize, cellSize, flashColor)
          } else {
            this.drawBlock(offX + c * cellSize, offY + r * cellSize, cellSize, cell.color)
          }
        }
      }
    }

    // Ghost piece
    if (activePiece) {
      const ghost: Piece = { ...activePiece, y: ghostY }
      this.drawPieceCells(ghost, offX, offY, cellSize, true)
      // Active piece
      this.drawPieceCells(activePiece, offX, offY, cellSize, false)
    }

    // Side panel
    const panelX = offX + boardW + 10
    this.drawSidePanel(panelX, offY, cellSize, nextPiece, score, level, lines)

    // Overlays
    if (state === 'READY') {
      this.drawReadyOverlay()
    } else if (state === 'GAME_OVER') {
      this.drawGameOverOverlay(score)
    }
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────────

  private drawBlock(x: number, y: number, size: number, color: string, ghost = false): void {
    const { ctx } = this
    const pad = 1
    const inner = size - pad * 2

    if (ghost) {
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.35
      ctx.strokeRect(x + pad, y + pad, inner, inner)
      ctx.globalAlpha = 1
      return
    }

    ctx.shadowColor = color
    ctx.shadowBlur = 6

    // Main fill
    const grad = ctx.createLinearGradient(x + pad, y + pad, x + pad, y + pad + inner)
    grad.addColorStop(0, this.lighten(color, 1.3))
    grad.addColorStop(1, this.darken(color, 0.7))
    ctx.fillStyle = grad
    ctx.fillRect(x + pad, y + pad, inner, inner)

    // Top-left highlight
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(x + pad, y + pad, inner, inner / 4)

    ctx.shadowBlur = 0
  }

  private drawPieceCells(piece: Piece, offX: number, offY: number, cellSize: number, isGhost: boolean): void {
    const color = TETROMINO_COLORS[piece.type]
    const shape = rotateMat(getPieceShape(piece.type), piece.rotation)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (shape[r][c]) {
          const row = piece.y + r
          const col = piece.x + c
          if (row >= 0 && row < 20 && col >= 0 && col < 10) {
            if (isGhost) {
              this.drawBlock(offX + col * cellSize, offY + row * cellSize, cellSize, color, true)
            } else {
              this.drawBlock(offX + col * cellSize, offY + row * cellSize, cellSize, color)
            }
          }
        }
      }
    }
  }

  private drawSidePanel(
    x: number, y: number, cellSize: number,
    nextPiece: Piece, score: number, level: number, lines: number
  ): void {
    const { ctx } = this
    const panelW = 70

    ctx.fillStyle = NEXT_PANEL_COLOR
    ctx.strokeStyle = 'rgba(180,100,255,0.2)'
    ctx.lineWidth = 1

    // Next piece box
    const nextBoxH = cellSize * 4 + 30
    ctx.fillRect(x, y, panelW, nextBoxH)
    ctx.strokeRect(x, y, panelW, nextBoxH)

    ctx.font = `${Math.max(9, cellSize * 0.45)}px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('NEXT', x + panelW / 2, y + 4)

    // Draw next piece mini preview
    const previewCellSize = Math.floor(cellSize * 0.8)
    const shape = rotateMat(getPieceShape(nextPiece.type), 0)
    const color = TETROMINO_COLORS[nextPiece.type]
    const previewOffX = x + (panelW - 4 * previewCellSize) / 2
    const previewOffY = y + 18

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (shape[r][c]) {
          this.drawBlock(
            previewOffX + c * previewCellSize,
            previewOffY + r * previewCellSize,
            previewCellSize,
            color
          )
        }
      }
    }
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
    ctx.fillStyle = '#b464ff'
    ctx.shadowColor = '#b464ff'
    ctx.shadowBlur = 22
    ctx.fillText('TETRIS', cx, cy - canvas.height * 0.14)
    ctx.shadowBlur = 0

    ctx.font = `${Math.max(12, canvas.width * 0.038)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP OR PRESS ANY KEY', cx, cy + canvas.height * 0.04)

    ctx.font = `${Math.max(9, canvas.width * 0.027)}px 'Courier New', monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText('← → MOVE  ↑ ROTATE  ↓ SOFT DROP  SPC HARD DROP', cx, cy + canvas.height * 0.13)
    ctx.fillText('SWIPE LEFT/RIGHT • TAP = ROTATE • SWIPE DOWN = DROP', cx, cy + canvas.height * 0.2)
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

    ctx.font = `${Math.max(16, canvas.width * 0.05)}px 'Courier New', monospace`
    ctx.fillStyle = '#fbbf24'
    ctx.fillText(`SCORE: ${score}`, cx, cy)

    ctx.font = `${Math.max(12, canvas.width * 0.034)}px 'Courier New', monospace`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('TAP TO RESTART', cx, cy + canvas.height * 0.12)
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  private lighten(color: string, factor: number): string {
    return this.adjustColor(color, factor)
  }

  private darken(color: string, factor: number): string {
    return this.adjustColor(color, factor)
  }

  private adjustColor(color: string, factor: number): string {
    // Parse hex or named colour via offscreen canvas
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    const cx = cv.getContext('2d')!
    cx.fillStyle = color
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    const r = Math.min(255, Math.round(d[0] * factor))
    const g = Math.min(255, Math.round(d[1] * factor))
    const b = Math.min(255, Math.round(d[2] * factor))
    return `rgb(${r},${g},${b})`
  }
}

// ── Exported helpers (duplicated from game.ts to avoid circular deps) ─────────

function getPieceShape(type: string): number[][] {
  const shapes: Record<string, number[][]> = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    T: [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    S: [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
    Z: [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    L: [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    J: [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  }
  return shapes[type] ?? shapes['I']
}

function rotateMat(mat: number[][], n: number): number[][] {
  let m = mat
  for (let i = 0; i < ((n % 4) + 4) % 4; i++) {
    const next: number[][] = Array.from({ length: 4 }, () => Array(4).fill(0))
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        next[c][3 - r] = m[r][c]
      }
    }
    m = next
  }
  return m
}
