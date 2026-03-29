// Tetris input handler — keyboard + touch swipe

type ActionCallback = (action: TetrisAction) => void

export type TetrisAction =
  | 'moveLeft'
  | 'moveRight'
  | 'rotate'
  | 'softDropStart'
  | 'softDropEnd'
  | 'hardDrop'
  | 'start'

const SWIPE_THRESHOLD = 25
const REPEAT_DELAY_MS = 180   // initial hold delay before repeat
const REPEAT_INTERVAL_MS = 60 // repeat interval while held

interface TouchPoint { x: number; y: number }

export class InputHandler {
  private onAction: ActionCallback
  private touchStart: TouchPoint | null = null
  private touchMoved: boolean = false

  // Key-repeat state
  private leftHeld = false
  private rightHeld = false
  private leftTimer = 0
  private rightTimer = 0

  constructor(onAction: ActionCallback) {
    this.onAction = onAction

    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handleTouchStart = this.handleTouchStart.bind(this)
    this.handleTouchMove = this.handleTouchMove.bind(this)
    this.handleTouchEnd = this.handleTouchEnd.bind(this)

    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('touchstart', this.handleTouchStart, { passive: false })
    window.addEventListener('touchmove', this.handleTouchMove, { passive: false })
    window.addEventListener('touchend', this.handleTouchEnd, { passive: false })
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('touchstart', this.handleTouchStart)
    window.removeEventListener('touchmove', this.handleTouchMove)
    window.removeEventListener('touchend', this.handleTouchEnd)
  }

  /** Process key-repeat each frame. dt in seconds. */
  processFrame(dt: number): void {
    const dtMs = dt * 1000
    if (this.leftHeld) {
      this.leftTimer -= dtMs
      if (this.leftTimer <= 0) {
        this.leftTimer = REPEAT_INTERVAL_MS
        this.onAction('moveLeft')
      }
    }
    if (this.rightHeld) {
      this.rightTimer -= dtMs
      if (this.rightTimer <= 0) {
        this.rightTimer = REPEAT_INTERVAL_MS
        this.onAction('moveRight')
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault()
        if (!this.leftHeld) {
          this.leftHeld = true
          this.leftTimer = REPEAT_DELAY_MS
          this.onAction('moveLeft')
        }
        break
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault()
        if (!this.rightHeld) {
          this.rightHeld = true
          this.rightTimer = REPEAT_DELAY_MS
          this.onAction('moveRight')
        }
        break
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault()
        this.onAction('rotate')
        break
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault()
        this.onAction('softDropStart')
        break
      case ' ':
        e.preventDefault()
        this.onAction('hardDrop')
        break
      case 'Enter':
        e.preventDefault()
        this.onAction('start')
        break
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.leftHeld = false
        break
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.rightHeld = false
        break
      case 'ArrowDown':
      case 's':
      case 'S':
        this.onAction('softDropEnd')
        break
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault()
    const touch = e.changedTouches[0]
    if (!touch) return
    this.touchStart = { x: touch.clientX, y: touch.clientY }
    this.touchMoved = false
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault()
    const touch = e.changedTouches[0]
    if (!touch || !this.touchStart) return
    const dx = touch.clientX - this.touchStart.x
    const dy = touch.clientY - this.touchStart.y
    if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_THRESHOLD) {
      this.touchMoved = true
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault()
    if (!this.touchStart) return
    const touch = e.changedTouches[0]
    if (!touch) return

    const dx = touch.clientX - this.touchStart.x
    const dy = touch.clientY - this.touchStart.y
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (!this.touchMoved && absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) {
      // Tap = rotate or start
      this.onAction('rotate')
      this.onAction('start')
    } else if (absDx > absDy && absDx > SWIPE_THRESHOLD) {
      // Horizontal swipe
      if (dx > 0) {
        this.onAction('moveRight')
      } else {
        this.onAction('moveLeft')
      }
    } else if (absDy > SWIPE_THRESHOLD) {
      // Vertical swipe down
      if (dy > 0) {
        this.onAction('hardDrop')
      } else {
        this.onAction('rotate')  // swipe up = rotate
      }
    }

    this.onAction('softDropEnd')
    this.touchStart = null
    this.touchMoved = false
  }
}
