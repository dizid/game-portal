// Pac-Man — input handler

import type { Direction } from './game.js'

type DirCallback = (dir: Direction) => void
type ActionCallback = () => void

const SWIPE_THRESHOLD = 25

export class InputHandler {
  private onDir: DirCallback
  private onAction: ActionCallback
  private touchStart: { x: number; y: number } | null = null

  constructor(onDir: DirCallback, onAction: ActionCallback) {
    this.onDir = onDir
    this.onAction = onAction
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleTouchStart = this.handleTouchStart.bind(this)
    this.handleTouchEnd = this.handleTouchEnd.bind(this)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('touchstart', this.handleTouchStart, { passive: false })
    window.addEventListener('touchend', this.handleTouchEnd, { passive: false })
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('touchstart', this.handleTouchStart)
    window.removeEventListener('touchend', this.handleTouchEnd)
  }

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); this.onDir('up');    this.onAction(); break
      case 'ArrowDown':  case 's': case 'S': e.preventDefault(); this.onDir('down');  this.onAction(); break
      case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); this.onDir('left');  this.onAction(); break
      case 'ArrowRight': case 'd': case 'D': e.preventDefault(); this.onDir('right'); this.onAction(); break
      case ' ': case 'Enter': e.preventDefault(); this.onAction(); break
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault()
    const t = e.changedTouches[0]
    if (t) this.touchStart = { x: t.clientX, y: t.clientY }
    this.onAction()
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault()
    if (!this.touchStart) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - this.touchStart.x
    const dy = t.clientY - this.touchStart.y
    this.touchStart = null
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)
    if (adx < SWIPE_THRESHOLD && ady < SWIPE_THRESHOLD) return
    if (adx > ady) {
      this.onDir(dx > 0 ? 'right' : 'left')
    } else {
      this.onDir(dy > 0 ? 'down' : 'up')
    }
  }
}
