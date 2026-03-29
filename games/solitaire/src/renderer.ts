// Solitaire canvas renderer — draws the full game board

import type { GameSnapshot, Selection, PileId } from './game.js'
import { SUIT_SYMBOL, RANK_LABEL, isRed } from './cards.js'
import type { Card } from './cards.js'

// Layout constants (all in "virtual" units; scaled to actual canvas pixels)
const VIRTUAL_W = 490
const CARD_W    = 60
const CARD_H    = 84
const CARD_R    = 6      // corner radius
const GAP_X     = 8      // gap between columns
const TOP_Y     = 6      // y start for top row (stock/waste/foundations)
const TAB_Y     = TOP_Y + CARD_H + 14  // y start for tableau
const TAB_FACE_OFFSET  = 20  // vertical offset between face-down cards in tableau
const TAB_FACEUP_OFFSET = 28  // vertical offset between face-up cards in tableau

// Colors
const CARD_BG_RED   = '#c0392b'
const CARD_BG_BLACK = '#1a1a2e'
const CARD_BACK_BG  = '#16213e'
const CARD_BACK_PATTERN = '#0f3460'
const CARD_EMPTY_BG  = 'rgba(255,255,255,0.05)'
const CARD_EMPTY_BORDER = 'rgba(255,255,255,0.2)'
const SELECTED_GLOW = 'rgba(100,200,255,0.9)'

export interface HitResult {
  pile: PileId
  cardIndex: number
}

export class SolitaireRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private scale: number = 1
  private offsetX: number = 0
  private offsetY: number = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  /** Resize canvas to fill the given pixel area. Returns scale factor. */
  resize(width: number, height: number): void {
    this.canvas.width  = width
    this.canvas.height = height
    this.canvas.style.width  = `${width}px`
    this.canvas.style.height = `${height}px`

    // Scale to fit the virtual 490-wide layout
    this.scale   = width / VIRTUAL_W
    this.offsetX = 0
    // Center vertically with a small top margin
    const virtualH = TAB_Y + CARD_H + 7 * TAB_FACEUP_OFFSET + 40
    this.offsetY = Math.max(0, (height / this.scale - virtualH) / 2)
  }

  // ── Hit testing (virtual coords) ──────────────────────────────────────────

  /** Convert a canvas pixel to virtual coordinates. */
  toVirtual(px: number, py: number): { vx: number; vy: number } {
    return {
      vx: px / this.scale,
      vy: py / this.scale - this.offsetY,
    }
  }

  /** Given a click in virtual coords, return what was hit. */
  hitTest(snap: GameSnapshot, px: number, py: number): HitResult | null {
    const { vx, vy } = this.toVirtual(px, py)

    // Stock
    const sx = this.colX(0)
    if (this.inCard(vx, vy, sx, TOP_Y)) {
      return { pile: 'stock', cardIndex: 0 }
    }

    // Waste (top card only)
    const wx = this.colX(1)
    if (snap.waste.length > 0 && this.inCard(vx, vy, wx, TOP_Y)) {
      return { pile: 'waste', cardIndex: snap.waste.length - 1 }
    }

    // Foundations (cols 3–6)
    for (let i = 0; i < 4; i++) {
      const fx = this.colX(i + 3)
      if (this.inCard(vx, vy, fx, TOP_Y)) {
        return { pile: { foundation: i as 0|1|2|3 }, cardIndex: snap.foundations[i].length - 1 }
      }
    }

    // Tableau columns (cols 0–6)
    for (let col = 0; col < 7; col++) {
      const tx = this.colX(col)
      const cards = snap.tableau[col]
      if (cards.length === 0) {
        // Empty column — clicking it selects column target
        if (this.inCard(vx, vy, tx, TAB_Y)) {
          return { pile: { tableau: col as 0|1|2|3|4|5|6 }, cardIndex: 0 }
        }
        continue
      }
      // Test from top card downward (last card = top-most visually)
      for (let ci = cards.length - 1; ci >= 0; ci--) {
        const cy = this.tabCardY(snap.tableau[col], ci)
        // For all cards except the last, only the visible strip is clickable
        const cardH = ci < cards.length - 1
          ? (cards[ci].faceUp ? TAB_FACEUP_OFFSET : TAB_FACE_OFFSET)
          : CARD_H
        if (vx >= tx && vx <= tx + CARD_W && vy >= cy && vy <= cy + cardH) {
          return { pile: { tableau: col as 0|1|2|3|4|5|6 }, cardIndex: ci }
        }
      }
    }

    return null
  }

  private inCard(vx: number, vy: number, cx: number, cy: number): boolean {
    return vx >= cx && vx <= cx + CARD_W && vy >= cy && vy <= cy + CARD_H
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  render(snap: GameSnapshot): void {
    const { ctx, canvas, scale, offsetY } = this
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.scale(scale, scale)
    ctx.translate(0, offsetY)

    // Stock
    this.drawCardBack(this.colX(0), TOP_Y, snap.stock.length > 0, snap.selection, 'stock')

    // Waste (show top card)
    const wx = this.colX(1)
    if (snap.waste.length > 0) {
      const top = snap.waste[snap.waste.length - 1]
      const isSelected = this.isCardSelected(snap.selection, 'waste', snap.waste.length - 1)
      this.drawCard(top, wx, TOP_Y, isSelected)
    } else {
      this.drawEmptySlot(wx, TOP_Y, '↺')
    }

    // Foundations
    for (let i = 0; i < 4; i++) {
      const fx = this.colX(i + 3)
      const fnd = snap.foundations[i]
      if (fnd.length > 0) {
        const isSelected = this.isCardSelected(snap.selection, { foundation: i as 0|1|2|3 }, fnd.length - 1)
        this.drawCard(fnd[fnd.length - 1], fx, TOP_Y, isSelected)
      } else {
        // Show suit symbol as placeholder
        const symbols = ['♠', '♥', '♦', '♣']
        this.drawEmptySlot(fx, TOP_Y, symbols[i])
      }
    }

    // Tableau
    for (let col = 0; col < 7; col++) {
      const tx = this.colX(col)
      const cards = snap.tableau[col]
      if (cards.length === 0) {
        const isDestSelected = snap.selection !== null
        this.drawEmptySlot(tx, TAB_Y, isDestSelected ? '↓' : '')
      } else {
        for (let ci = 0; ci < cards.length; ci++) {
          const cy = this.tabCardY(cards, ci)
          const isSelected = this.isCardSelected(snap.selection, { tableau: col as 0|1|2|3|4|5|6 }, ci)
          if (cards[ci].faceUp) {
            this.drawCard(cards[ci], tx, cy, isSelected)
          } else {
            this.drawCardBack(tx, cy, true, null, null)
          }
        }
      }
    }

    ctx.restore()
  }

  // ── Layout helpers ─────────────────────────────────────────────────────────

  /** X position of the nth column (0-6). */
  private colX(col: number): number {
    return col * (CARD_W + GAP_X)
  }

  /** Y position of card at index ci within a tableau column. */
  private tabCardY(cards: Card[], ci: number): number {
    let y = TAB_Y
    for (let i = 0; i < ci; i++) {
      y += cards[i].faceUp ? TAB_FACEUP_OFFSET : TAB_FACE_OFFSET
    }
    return y
  }

  // ── Drawing primitives ─────────────────────────────────────────────────────

  private drawRoundRect(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  private drawCard(card: Card, x: number, y: number, selected: boolean): void {
    const { ctx } = this
    const red = isRed(card.suit)

    // Selection glow
    if (selected) {
      ctx.save()
      ctx.shadowColor = SELECTED_GLOW
      ctx.shadowBlur  = 12
    }

    // Card face
    this.drawRoundRect(x, y, CARD_W, CARD_H, CARD_R)
    ctx.fillStyle = red ? CARD_BG_RED : CARD_BG_BLACK
    ctx.fill()
    ctx.strokeStyle = selected ? SELECTED_GLOW : 'rgba(255,255,255,0.25)'
    ctx.lineWidth   = selected ? 2 : 1
    ctx.stroke()

    if (selected) ctx.restore()

    // Rank + suit (top-left)
    const symbol = SUIT_SYMBOL[card.suit]
    const label  = RANK_LABEL[card.rank]
    ctx.fillStyle   = '#fff'
    ctx.font        = `bold ${card.rank === 10 ? 11 : 13}px Courier New`
    ctx.textAlign   = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(label, x + 4, y + 3)

    ctx.font = '11px Courier New'
    ctx.fillText(symbol, x + 4, y + 17)

    // Center suit symbol
    ctx.font      = '22px Courier New'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(symbol, x + CARD_W / 2, y + CARD_H / 2)

    // Bottom-right rank + suit (rotated 180°)
    ctx.save()
    ctx.translate(x + CARD_W - 4, y + CARD_H - 3)
    ctx.rotate(Math.PI)
    ctx.font = `bold ${card.rank === 10 ? 11 : 13}px Courier New`
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle    = '#fff'
    ctx.fillText(label, 0, 0)
    ctx.font = '11px Courier New'
    ctx.fillText(symbol, 0, 14)
    ctx.restore()
  }

  private drawCardBack(
    x: number,
    y: number,
    hasCards: boolean,
    selection: Selection | null,
    pile: PileId | null,
  ): void {
    const { ctx } = this
    if (!hasCards) {
      this.drawEmptySlot(x, y, '')
      return
    }

    // Determine if this back is "selected" (only waste / stock top card)
    const selected =
      pile !== null &&
      selection !== null &&
      pile === selection.source

    this.drawRoundRect(x, y, CARD_W, CARD_H, CARD_R)
    ctx.fillStyle = CARD_BACK_BG
    ctx.fill()
    ctx.strokeStyle = selected ? SELECTED_GLOW : 'rgba(255,255,255,0.2)'
    ctx.lineWidth   = selected ? 2 : 1
    ctx.stroke()

    // Simple cross-hatch pattern
    ctx.strokeStyle = CARD_BACK_PATTERN
    ctx.lineWidth   = 1
    const step = 8
    for (let i = 0; i <= CARD_W; i += step) {
      ctx.beginPath()
      ctx.moveTo(x + i, y)
      ctx.lineTo(x + i, y + CARD_H)
      ctx.stroke()
    }
    for (let j = 0; j <= CARD_H; j += step) {
      ctx.beginPath()
      ctx.moveTo(x, y + j)
      ctx.lineTo(x + CARD_W, y + j)
      ctx.stroke()
    }
  }

  private drawEmptySlot(x: number, y: number, label: string): void {
    const { ctx } = this
    this.drawRoundRect(x, y, CARD_W, CARD_H, CARD_R)
    ctx.fillStyle   = CARD_EMPTY_BG
    ctx.fill()
    ctx.strokeStyle = CARD_EMPTY_BORDER
    ctx.lineWidth   = 1
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])

    if (label) {
      ctx.fillStyle    = 'rgba(255,255,255,0.3)'
      ctx.font         = '18px Courier New'
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x + CARD_W / 2, y + CARD_H / 2)
    }
  }

  private isCardSelected(selection: Selection | null, pile: PileId, cardIndex: number): boolean {
    if (!selection) return false
    if (!pilesEqual(selection.source, pile)) return false
    return selection.cardIndex <= cardIndex
  }
}

function pilesEqual(a: PileId, b: PileId): boolean {
  if (a === b) return true
  if (typeof a === 'object' && typeof b === 'object') {
    if ('foundation' in a && 'foundation' in b) return a.foundation === b.foundation
    if ('tableau' in a && 'tableau' in b) return a.tableau === b.tableau
  }
  return false
}
