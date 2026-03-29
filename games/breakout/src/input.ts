// Breakout input handler — mouse position, touch position, arrow keys

type MoveCallback = (logicalX: number | null, delta: number | null) => void
type ActionCallback = () => void

const KEYBOARD_SPEED = 300  // logical units per second

export class InputHandler {
  private onMove: MoveCallback
  private onAction: ActionCallback

  private keysHeld: Set<string> = new Set()
  private touchStartX: number | null = null
  private touchStartY: number | null = null

  // Whether we are tracking a tap vs swipe
  private isTap: boolean = false
  private readonly SWIPE_THRESHOLD = 15

  constructor(onMove: MoveCallback, onAction: ActionCallback) {
    this.onMove = onMove
    this.onAction = onAction

    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handleMouseMove = this.handleMouseMove.bind(this)
    this.handleTouchStart = this.handleTouchStart.bind(this)
    this.handleTouchMove = this.handleTouchMove.bind(this)
    this.handleTouchEnd = this.handleTouchEnd.bind(this)
    this.handleClick = this.handleClick.bind(this)

    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('mousemove', this.handleMouseMove)
    window.addEventListener('touchstart', this.handleTouchStart, { passive: false })
    window.addEventListener('touchmove', this.handleTouchMove, { passive: false })
    window.addEventListener('touchend', this.handleTouchEnd, { passive: false })
    window.addEventListener('click', this.handleClick)
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('mousemove', this.handleMouseMove)
    window.removeEventListener('touchstart', this.handleTouchStart)
    window.removeEventListener('touchmove', this.handleTouchMove)
    window.removeEventListener('touchend', this.handleTouchEnd)
    window.removeEventListener('click', this.handleClick)
  }

  /** Call each frame with dt in seconds to handle held keys. */
  processFrame(dt: number): void {
    let delta = 0
    if (this.keysHeld.has('ArrowLeft') || this.keysHeld.has('a') || this.keysHeld.has('A')) {
      delta -= KEYBOARD_SPEED * dt
    }
    if (this.keysHeld.has('ArrowRight') || this.keysHeld.has('d') || this.keysHeld.has('D')) {
      delta += KEYBOARD_SPEED * dt
    }
    if (delta !== 0) {
      this.onMove(null, delta)
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    this.keysHeld.add(e.key)
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      this.onAction()
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault()
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysHeld.delete(e.key)
  }

  private handleMouseMove(e: MouseEvent): void {
    // Convert screen X to logical X based on canvas position
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const relX = e.clientX - rect.left
    // Map from canvas CSS pixels to logical field (400 units wide)
    const logicalX = (relX / rect.width) * 400
    this.onMove(logicalX, null)
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault()
    const touch = e.changedTouches[0]
    if (!touch) return
    this.touchStartX = touch.clientX
    this.touchStartY = touch.clientY
    this.isTap = true
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault()
    const touch = e.changedTouches[0]
    if (!touch) return

    if (
      this.touchStartX !== null &&
      Math.abs(touch.clientX - this.touchStartX) > this.SWIPE_THRESHOLD
    ) {
      this.isTap = false
    }

    // Follow touch X for paddle position
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const relX = touch.clientX - rect.left
    const logicalX = (relX / rect.width) * 400
    this.onMove(logicalX, null)
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault()
    if (this.isTap) {
      this.onAction()
    }
    this.touchStartX = null
    this.touchStartY = null
    this.isTap = false
  }

  private handleClick(_e: MouseEvent): void {
    this.onAction()
  }
}
