// Drift Challenge — input handler (keyboard + on-screen buttons + tilt)

type SteerCallback = (dir: number) => void
type GasCallback = (held: boolean) => void
type BrakeCallback = (held: boolean) => void
type ActionCallback = () => void

export class InputHandler {
  private onSteer: SteerCallback
  private onGas: GasCallback
  private onBrake: BrakeCallback
  private onAction: ActionCallback

  private keys = { left: false, right: false, gas: false, brake: false }
  private tiltEnabled = false

  constructor(
    onSteer: SteerCallback,
    onGas: GasCallback,
    onBrake: BrakeCallback,
    onAction: ActionCallback
  ) {
    this.onSteer = onSteer
    this.onGas = onGas
    this.onBrake = onBrake
    this.onAction = onAction

    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handleTilt = this.handleTilt.bind(this)

    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)

    // Try tilt for mobile steering
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', this.handleTilt)
      this.tiltEnabled = true
    }

    // Wire up on-screen buttons
    this.wireButton('btn-left',  'touchstart', () => { this.keys.left  = true;  this.updateSteer() })
    this.wireButton('btn-left',  'touchend',   () => { this.keys.left  = false; this.updateSteer() })
    this.wireButton('btn-right', 'touchstart', () => { this.keys.right = true;  this.updateSteer() })
    this.wireButton('btn-right', 'touchend',   () => { this.keys.right = false; this.updateSteer() })
    this.wireButton('btn-gas',   'touchstart', () => { this.keys.gas   = true;  this.onGas(true);  this.onAction() })
    this.wireButton('btn-gas',   'touchend',   () => { this.keys.gas   = false; this.onGas(false) })
    this.wireButton('btn-brake', 'touchstart', () => { this.keys.brake = true;  this.onBrake(true) })
    this.wireButton('btn-brake', 'touchend',   () => { this.keys.brake = false; this.onBrake(false) })
  }

  private wireButton(id: string, event: string, fn: () => void): void {
    const el = document.getElementById(id)
    if (!el) return
    el.addEventListener(event, (e) => { e.preventDefault(); fn() }, { passive: false })
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    if (this.tiltEnabled) window.removeEventListener('deviceorientation', this.handleTilt)
  }

  private updateSteer(): void {
    if (this.keys.left && !this.keys.right) this.onSteer(-1)
    else if (this.keys.right && !this.keys.left) this.onSteer(1)
    else this.onSteer(0)
  }

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowLeft':  case 'a': case 'A':
        e.preventDefault(); this.keys.left  = true;  this.updateSteer(); this.onAction(); break
      case 'ArrowRight': case 'd': case 'D':
        e.preventDefault(); this.keys.right = true;  this.updateSteer(); this.onAction(); break
      case 'ArrowUp':    case 'w': case 'W':
        e.preventDefault(); this.keys.gas   = true;  this.onGas(true);   this.onAction(); break
      case 'ArrowDown':  case 's': case 'S':
        e.preventDefault(); this.keys.brake = true;  this.onBrake(true); this.onAction(); break
      case ' ': case 'Enter':
        e.preventDefault(); this.onAction(); break
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowLeft':  case 'a': case 'A':
        this.keys.left  = false; this.updateSteer(); break
      case 'ArrowRight': case 'd': case 'D':
        this.keys.right = false; this.updateSteer(); break
      case 'ArrowUp':    case 'w': case 'W':
        this.keys.gas   = false; this.onGas(false);  break
      case 'ArrowDown':  case 's': case 'S':
        this.keys.brake = false; this.onBrake(false); break
    }
  }

  private handleTilt(e: DeviceOrientationEvent): void {
    // Only use tilt for steering if no keyboard keys are held
    if (this.keys.left || this.keys.right) return
    const gamma = e.gamma ?? 0  // left/right tilt, -90 to 90 deg
    const deadzone = 8
    if (Math.abs(gamma) < deadzone) {
      this.onSteer(0)
    } else {
      const normalized = (gamma - Math.sign(gamma) * deadzone) / (45 - deadzone)
      this.onSteer(Math.max(-1, Math.min(1, normalized)))
    }
  }
}
