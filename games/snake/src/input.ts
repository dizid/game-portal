// Input handler — keyboard + touch swipe, queues direction changes

import type { Direction } from './game.js'

type DirectionCallback = (direction: Direction) => void
type ActionCallback = () => void

interface TouchPoint {
  x: number
  y: number
}

// Minimum swipe distance in pixels before we register a swipe
const SWIPE_THRESHOLD = 30

export class InputHandler {
  private onDirection: DirectionCallback
  private onAction: ActionCallback

  private touchStart: TouchPoint | null = null

  constructor(onDirection: DirectionCallback, onAction: ActionCallback) {
    this.onDirection = onDirection
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

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault()
        this.onDirection('up')
        this.onAction()
        break

      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault()
        this.onDirection('down')
        this.onAction()
        break

      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault()
        this.onDirection('left')
        this.onAction()
        break

      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault()
        this.onDirection('right')
        this.onAction()
        break

      case ' ':
      case 'Enter':
        // Space / Enter trigger action without direction change (used to start/restart)
        e.preventDefault()
        this.onAction()
        break
    }
  }

  // ── Touch / Swipe ─────────────────────────────────────────────────────────────

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault()
    const touch = e.changedTouches[0]
    if (!touch) return
    this.touchStart = { x: touch.clientX, y: touch.clientY }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault()
    if (!this.touchStart) return

    const touch = e.changedTouches[0]
    if (!touch) return

    const dx = touch.clientX - this.touchStart.x
    const dy = touch.clientY - this.touchStart.y
    this.touchStart = null

    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // Tap (no significant movement) → trigger action
    if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) {
      this.onAction()
      return
    }

    // Determine swipe direction by dominant axis
    if (absDx > absDy) {
      this.onDirection(dx > 0 ? 'right' : 'left')
    } else {
      this.onDirection(dy > 0 ? 'down' : 'up')
    }

    this.onAction()
  }
}
