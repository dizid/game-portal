// Pong input handler — mouse Y position, touch Y, W/S keys

type MoveCallback = (logicalY: number | null, delta: number | null) => void
type ActionCallback = () => void

const KEYBOARD_SPEED = 280  // logical units per second

export class InputHandler {
  private onMove: MoveCallback
  private onAction: ActionCallback
  private keysHeld: Set<string> = new Set()

  constructor(onMove: MoveCallback, onAction: ActionCallback) {
    this.onMove = onMove
    this.onAction = onAction

    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handleMouseMove = this.handleMouseMove.bind(this)
    this.handleTouchMove = this.handleTouchMove.bind(this)
    this.handleTouchStart = this.handleTouchStart.bind(this)

    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('mousemove', this.handleMouseMove)
    window.addEventListener('touchstart', this.handleTouchStart, { passive: false })
    window.addEventListener('touchmove', this.handleTouchMove, { passive: false })
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('mousemove', this.handleMouseMove)
    window.removeEventListener('touchstart', this.handleTouchStart)
    window.removeEventListener('touchmove', this.handleTouchMove)
  }

  processFrame(dt: number): void {
    let delta = 0
    if (this.keysHeld.has('w') || this.keysHeld.has('W') || this.keysHeld.has('ArrowUp')) {
      delta -= KEYBOARD_SPEED * dt
    }
    if (this.keysHeld.has('s') || this.keysHeld.has('S') || this.keysHeld.has('ArrowDown')) {
      delta += KEYBOARD_SPEED * dt
    }
    if (delta !== 0) this.onMove(null, delta)
  }

  private handleKeyDown(e: KeyboardEvent): void {
    this.keysHeld.add(e.key)
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      this.onAction()
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault()
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysHeld.delete(e.key)
  }

  private handleMouseMove(e: MouseEvent): void {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const relY = e.clientY - rect.top
    // Map canvas CSS height to logical height (400 units)
    const logicalY = (relY / rect.height) * 400
    this.onMove(logicalY, null)
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault()
    this.onAction()
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault()
    const touch = e.changedTouches[0]
    if (!touch) return
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const relY = touch.clientY - rect.top
    const logicalY = (relY / rect.height) * 400
    this.onMove(logicalY, null)
  }
}
