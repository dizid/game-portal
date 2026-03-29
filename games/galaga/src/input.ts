// Galaga — input handler (same pattern as space invaders)

type MoveCallback = (dir: number) => void
type ActionCallback = () => void

const SWIPE_THRESHOLD = 30

export class InputHandler {
  private onMove: MoveCallback
  private onShoot: ActionCallback
  private onAction: ActionCallback
  private keys = { left: false, right: false }
  private touchStartX = 0
  private touchStartY = 0
  private touchStartTime = 0

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
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('touchstart', this.handleTouchStart)
    window.removeEventListener('touchmove', this.handleTouchMove)
    window.removeEventListener('touchend', this.handleTouchEnd)
  }

  private updateDir(): void {
    if (this.keys.left && !this.keys.right) this.onMove(-1)
    else if (this.keys.right && !this.keys.left) this.onMove(1)
    else this.onMove(0)
  }

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A':
        e.preventDefault(); this.keys.left = true; this.updateDir(); this.onAction(); break
      case 'ArrowRight': case 'd': case 'D':
        e.preventDefault(); this.keys.right = true; this.updateDir(); this.onAction(); break
      case ' ': case 'ArrowUp': case 'w': case 'W':
        e.preventDefault(); this.onShoot(); this.onAction(); break
      case 'Enter': e.preventDefault(); this.onAction(); break
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': this.keys.left = false; this.updateDir(); break
      case 'ArrowRight': case 'd': case 'D': this.keys.right = false; this.updateDir(); break
    }
  }

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
      this.touchStartX = t.clientX
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
    if (dx < SWIPE_THRESHOLD && dy < SWIPE_THRESHOLD && dt < 200) {
      this.onShoot()
    }
  }
}
