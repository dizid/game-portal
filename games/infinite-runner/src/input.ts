// Infinite Runner — input handler

type JumpCallback = () => void
type ReleaseCallback = () => void
type ActionCallback = () => void

export class InputHandler {
  private onJump: JumpCallback
  private onRelease: ReleaseCallback
  private onAction: ActionCallback
  private lastTapTime = 0

  constructor(onJump: JumpCallback, onRelease: ReleaseCallback, onAction: ActionCallback) {
    this.onJump = onJump
    this.onRelease = onRelease
    this.onAction = onAction
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handleTouchStart = this.handleTouchStart.bind(this)
    this.handleTouchEnd = this.handleTouchEnd.bind(this)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('touchstart', this.handleTouchStart, { passive: false })
    window.addEventListener('touchend', this.handleTouchEnd, { passive: false })
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('touchstart', this.handleTouchStart)
    window.removeEventListener('touchend', this.handleTouchEnd)
  }

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case ' ':
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault()
        this.onJump()
        this.onAction()
        break
      case 'Enter':
        e.preventDefault()
        this.onAction()
        break
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault()
      this.onRelease()
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault()
    const now = Date.now()
    // Double-tap detection (within 300ms triggers immediate second jump)
    if (now - this.lastTapTime < 300) {
      this.onJump()  // second jump
    }
    this.lastTapTime = now
    this.onJump()
    this.onAction()
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault()
    this.onRelease()
  }
}
