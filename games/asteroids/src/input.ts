// Asteroids input handler — keyboard + zone-based mobile touch

type BoolSetter = (v: boolean) => void
type ShootCallback = () => void
type ActionCallback = () => void

export interface InputCallbacks {
  setRotateLeft: BoolSetter
  setRotateRight: BoolSetter
  setThrust: BoolSetter
  setShooting: BoolSetter
  onShoot: ShootCallback
  onAction: ActionCallback
}

// Mobile touch zone layout (based on screen fractions):
//  Left  quarter  → rotate left
//  Right quarter  → rotate right
//  Top   half     → thrust
//  Bottom quarter → shoot

export class InputHandler {
  private cbs: InputCallbacks

  // Track active touch IDs and their assigned functions
  private touchZones: Map<number, 'rotateLeft' | 'rotateRight' | 'thrust' | 'shoot'> = new Map()

  constructor(cbs: InputCallbacks) {
    this.cbs = cbs

    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handleTouchStart = this.handleTouchStart.bind(this)
    this.handleTouchEnd = this.handleTouchEnd.bind(this)
    this.handleTouchCancel = this.handleTouchCancel.bind(this)

    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('touchstart', this.handleTouchStart, { passive: false })
    window.addEventListener('touchend', this.handleTouchEnd, { passive: false })
    window.addEventListener('touchcancel', this.handleTouchCancel, { passive: false })
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('touchstart', this.handleTouchStart)
    window.removeEventListener('touchend', this.handleTouchEnd)
    window.removeEventListener('touchcancel', this.handleTouchCancel)
  }

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault()
        this.cbs.setRotateLeft(true)
        break
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault()
        this.cbs.setRotateRight(true)
        break
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault()
        this.cbs.setThrust(true)
        break
      case ' ':
        e.preventDefault()
        this.cbs.setShooting(true)
        break
      case 'Enter':
        e.preventDefault()
        this.cbs.onAction()
        break
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.cbs.setRotateLeft(false)
        break
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.cbs.setRotateRight(false)
        break
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.cbs.setThrust(false)
        break
      case ' ':
        this.cbs.setShooting(false)
        break
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault()
    const W = window.innerWidth
    const H = window.innerHeight

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      const x = touch.clientX
      const y = touch.clientY

      // Determine zone
      let zone: 'rotateLeft' | 'rotateRight' | 'thrust' | 'shoot'

      if (y > H * 0.7) {
        // Bottom 30% = shoot
        zone = 'shoot'
        this.cbs.setShooting(true)
        this.cbs.onShoot()
      } else if (y < H * 0.35) {
        // Top 35% = thrust
        zone = 'thrust'
        this.cbs.setThrust(true)
      } else if (x < W * 0.5) {
        // Left half (middle strip) = rotate left
        zone = 'rotateLeft'
        this.cbs.setRotateLeft(true)
      } else {
        // Right half (middle strip) = rotate right
        zone = 'rotateRight'
        this.cbs.setRotateRight(true)
      }

      this.touchZones.set(touch.identifier, zone)
    }

    // Also trigger action for READY/GAME_OVER states (any touch)
    this.cbs.onAction()
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault()
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      const zone = this.touchZones.get(touch.identifier)
      if (zone) {
        switch (zone) {
          case 'rotateLeft':  this.cbs.setRotateLeft(false);  break
          case 'rotateRight': this.cbs.setRotateRight(false); break
          case 'thrust':      this.cbs.setThrust(false);      break
          case 'shoot':       this.cbs.setShooting(false);    break
        }
        this.touchZones.delete(touch.identifier)
      }
    }
  }

  private handleTouchCancel(e: TouchEvent): void {
    // Clear all zones
    this.handleTouchEnd(e)
    this.cbs.setRotateLeft(false)
    this.cbs.setRotateRight(false)
    this.cbs.setThrust(false)
    this.cbs.setShooting(false)
    this.touchZones.clear()
  }
}
