// Space Invaders — keyboard + touch input handler

type MoveCallback = (dir: number) => void   // -1, 0, +1
type ActionCallback = () => void

const SWIPE_THRESHOLD = 30

export class InputHandler {
  private onMove: MoveCallback
  private onShoot: ActionCallback
  private onAction: ActionCallback

  private keys = { left: false, right: false, shoot: false }
  private touchStartX = 0
  private touchStartY = 0
  private touchStartTime = 0

  // For continuous movement from held keys
  private moveInterval: ReturnType<typeof setInterval> | null = null

  constructor(onMove: MoveCallback, onShoot: ActionCallback, onAction: ActionCallback) {
    this.onMove = onMove
    this.onShoot = onShoot
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
    if (this.moveInterval) clearInterval(this.moveInterval)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('touchstart', this.handleTouchStart)
    window.removeEventListener('touchmove', this.handleTouchMove)
    window.removeEventListener('touchend', this.handleTouchEnd)
  }

  private updateMoveDir(): void {
    if (this.keys.left && !this.keys.right) this.onMove(-1)
    else if (this.keys.right && !this.keys.left) this.onMove(1)
    else this.onMove(0)
  }

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault()
        this.keys.left = true
        this.updateMoveDir()
        this.onAction()
        break
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault()
        this.keys.right = true
        this.updateMoveDir()
        this.onAction()
        break
      case ' ':
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault()
        this.onShoot()
        this.onAction()
        break
      case 'Enter':
        e.preventDefault()
        this.onAction()
        break
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.keys.left = false
        this.updateMoveDir()
        break
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.keys.right = false
        this.updateMoveDir()
        break
    }
  }

  // Touch: drag left/right to move, tap to shoot
  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault()
    const t = e.changedTouches[0]
    if (!t) return
    this.touchStartX = t.clientX
    this.touchStartY = t.clientY
    this.touchStartTime = Date.now()
    this.onAction()
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault()
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - this.touchStartX
    if (Math.abs(dx) > 8) {
      this.onMove(dx > 0 ? 1 : -1)
      this.touchStartX = t.clientX  // update to avoid runaway movement
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault()
    const t = e.changedTouches[0]
    if (!t) return
    const dx = Math.abs(t.clientX - this.touchStartX)
    const dy = Math.abs(t.clientY - this.touchStartY)
    const dt = Date.now() - this.touchStartTime
    this.onMove(0)

    // Short tap (< 200ms, small movement) = shoot
    if (dx < SWIPE_THRESHOLD && dy < SWIPE_THRESHOLD && dt < 200) {
      this.onShoot()
    }
  }
}
