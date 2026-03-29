// Drift Challenge — game logic (top-down car physics + drift scoring)

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

export interface TireMark {
  x1: number; y1: number
  x2: number; y2: number
  alpha: number
}

export interface Checkpoint {
  cx: number  // centre x
  cy: number  // centre y
  angle: number  // angle of gate (perpendicular to track)
  passed: boolean
  width: number
}

export interface GameSnapshot {
  state: GameState
  // Car
  carX: number
  carY: number
  carAngle: number  // radians
  carSpeed: number
  isDrifting: boolean
  driftAngle: number  // angle offset during drift
  // Scoring
  score: number
  driftScore: number
  driftMultiplier: number
  driftCombo: number
  // Race
  lap: number
  lapTime: number      // frames in current lap
  bestLapTime: number  // frames
  totalTime: number
  // Track
  trackCX: number
  trackCY: number
  trackRX: number      // outer ellipse X radius
  trackRY: number      // outer ellipse Y radius
  innerRX: number
  innerRY: number
  checkpoints: Checkpoint[]
  tireMarks: TireMark[]
  // Canvas
  canvasW: number
  canvasH: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SPEED = 8.0
const ACCELERATION = 0.18
const BRAKE_FORCE = 0.25
const FRICTION = 0.96
const LATERAL_FRICTION = 0.85
const STEER_SPEED = 0.06     // radians per frame
const DRIFT_STEER_MULT = 2.2
const DRIFT_THRESHOLD = 3.5  // minimum speed to start drifting
const DRIFT_ANGLE_SPEED = 0.06
const DRIFT_ANGLE_MAX = 0.65
const DRIFT_SCORE_RATE = 1   // points per frame while drifting
const TOTAL_LAPS = 3
const CHECKPOINT_COUNT = 8

export class DriftChallengeGame {
  private state: GameState = 'READY'
  private canvasW = 600
  private canvasH = 600

  // Track geometry (computed in init/resize)
  private trackCX = 0
  private trackCY = 0
  private trackRX = 0
  private trackRY = 0
  private innerRX = 0
  private innerRY = 0
  private trackWidth = 80

  // Car state
  private carX = 0
  private carY = 0
  private carAngle = 0
  private carVX = 0
  private carVY = 0
  private carSpeed = 0
  private isDrifting = false
  private driftAngle = 0
  private driftScoreAccum = 0
  private driftCombo = 0
  private driftMultiplier = 1
  private driftTimer = 0

  // Input
  private steerDir = 0   // -1, 0, +1
  private gasHeld = false
  private brakeHeld = false

  // Score / race
  private score = 0
  private driftScore = 0
  private lap = 0
  private lapTime = 0
  private bestLapTime = 0
  private totalTime = 0
  private frameCount = 0

  // Checkpoints
  private checkpoints: Checkpoint[] = []
  private nextCheckpointIdx = 0
  private lastCheckpointLap = 0

  // Tire marks
  private tireMarks: TireMark[] = []
  private prevCarX = 0
  private prevCarY = 0
  private MAX_TIRE_MARKS = 300

  // ── Init ──────────────────────────────────────────────────────────────────────

  init(w: number, h: number): void {
    this.canvasW = w
    this.canvasH = h
    this.computeTrack()
    this.reset()
  }

  resize(w: number, h: number): void {
    this.canvasW = w
    this.canvasH = h
    this.computeTrack()
    this.placeCheckpoints()
  }

  private computeTrack(): void {
    const margin = Math.min(this.canvasW, this.canvasH) * 0.08
    this.trackCX = this.canvasW / 2
    this.trackCY = this.canvasH / 2
    this.trackRX = this.canvasW / 2 - margin - this.trackWidth / 2
    this.trackRY = this.canvasH / 2 - margin - this.trackWidth / 2
    this.innerRX = this.trackRX - this.trackWidth
    this.innerRY = this.trackRY - this.trackWidth
  }

  reset(): void {
    this.score = 0
    this.driftScore = 0
    this.lap = 0
    this.lapTime = 0
    this.bestLapTime = 0
    this.totalTime = 0
    this.frameCount = 0
    this.isDrifting = false
    this.driftAngle = 0
    this.driftCombo = 0
    this.driftMultiplier = 1
    this.driftTimer = 0
    this.driftScoreAccum = 0
    this.tireMarks = []

    // Place car at start line (top of ellipse)
    this.carX = this.trackCX
    this.carY = this.trackCY - (this.trackRY + this.innerRY) / 2
    this.carAngle = Math.PI / 2   // pointing right (clockwise)
    this.carVX = 0
    this.carVY = 0
    this.carSpeed = 0
    this.prevCarX = this.carX
    this.prevCarY = this.carY

    this.placeCheckpoints()
    this.nextCheckpointIdx = 0
    this.lastCheckpointLap = -1
    this.state = 'READY'
  }

  start(): void {
    if (this.state === 'READY') this.state = 'PLAYING'
  }

  setSteer(dir: number): void { this.steerDir = dir }
  setGas(held: boolean): void { this.gasHeld = held }
  setBrake(held: boolean): void { this.brakeHeld = held }

  // ── Tick ──────────────────────────────────────────────────────────────────────

  tick(): void {
    if (this.state !== 'PLAYING') return
    this.frameCount++
    this.lapTime++
    this.totalTime++

    this.prevCarX = this.carX
    this.prevCarY = this.carY

    // Gas / brake
    if (this.gasHeld) {
      this.carSpeed = Math.min(MAX_SPEED, this.carSpeed + ACCELERATION)
    } else if (this.brakeHeld) {
      this.carSpeed = Math.max(-MAX_SPEED * 0.4, this.carSpeed - BRAKE_FORCE)
    } else {
      this.carSpeed *= 0.97  // idle deceleration
    }

    // Detect drift: high speed + sharp turn
    const turning = Math.abs(this.steerDir) > 0
    const fastEnough = Math.abs(this.carSpeed) >= DRIFT_THRESHOLD
    const wantDrift = turning && fastEnough

    if (wantDrift && !this.isDrifting) {
      this.isDrifting = true
      this.driftTimer = 0
    } else if (!wantDrift && this.isDrifting) {
      // End drift — bank accumulated score
      if (this.driftTimer > 20) {
        this.score += this.driftScoreAccum * this.driftMultiplier
        this.driftScore += this.driftScoreAccum * this.driftMultiplier
        this.driftCombo++
        this.driftMultiplier = Math.min(8, this.driftCombo)
      }
      this.isDrifting = false
      this.driftTimer = 0
      this.driftScoreAccum = 0
    }

    // Steering (more responsive while drifting)
    const steerMult = this.isDrifting ? DRIFT_STEER_MULT : 1.0
    const speedFactor = Math.min(1, Math.abs(this.carSpeed) / MAX_SPEED)
    this.carAngle += this.steerDir * STEER_SPEED * steerMult * speedFactor

    // Drift angle offset (car body slides)
    if (this.isDrifting) {
      this.driftTimer++
      this.driftScoreAccum += DRIFT_SCORE_RATE
      const targetDrift = this.steerDir * DRIFT_ANGLE_MAX
      this.driftAngle += (targetDrift - this.driftAngle) * DRIFT_ANGLE_SPEED
    } else {
      this.driftAngle *= 0.8  // recover
      if (Math.abs(this.driftAngle) < 0.01) this.driftAngle = 0
    }

    // Velocity = forward direction + lateral drift slide
    const moveAngle = this.carAngle + this.driftAngle * 0.3
    const fwdX = Math.cos(moveAngle)
    const fwdY = Math.sin(moveAngle)

    // Blend velocity towards forward direction (LATERAL_FRICTION limits slide)
    this.carVX = this.carVX * (1 - LATERAL_FRICTION) + fwdX * this.carSpeed * LATERAL_FRICTION
    this.carVY = this.carVY * (1 - LATERAL_FRICTION) + fwdY * this.carSpeed * LATERAL_FRICTION

    // Apply rolling friction
    this.carVX *= FRICTION
    this.carVY *= FRICTION

    this.carX += this.carVX
    this.carY += this.carVY

    // Track boundary constraint
    this.constrainToTrack()

    // Add tire marks when drifting
    if (this.isDrifting && this.driftTimer > 5) {
      this.addTireMark()
    }

    // Fade old tire marks
    for (const mark of this.tireMarks) {
      mark.alpha -= 0.002
    }
    this.tireMarks = this.tireMarks.filter(m => m.alpha > 0)

    // Checkpoint detection
    this.checkCheckpoints()
  }

  private constrainToTrack(): void {
    const dx = this.carX - this.trackCX
    const dy = this.carY - this.trackCY

    // Normalized ellipse position
    const nx = dx / this.trackRX
    const ny = dy / this.trackRY
    const outerDist = Math.sqrt(nx * nx + ny * ny)

    const ix = dx / this.innerRX
    const iy = dy / this.innerRY
    const innerDist = Math.sqrt(ix * ix + iy * iy)

    // Push back if outside outer boundary
    if (outerDist > 1.0) {
      const angle = Math.atan2(dy / this.trackRY, dx / this.trackRX)
      this.carX = this.trackCX + Math.cos(angle) * this.trackRX * 0.98
      this.carY = this.trackCY + Math.sin(angle) * this.trackRY * 0.98
      this.carVX *= 0.4
      this.carVY *= 0.4
      this.carSpeed *= 0.5
      this.isDrifting = false
    }

    // Push back if inside inner boundary
    if (innerDist < 1.0) {
      const angle = Math.atan2(dy / this.innerRY, dx / this.innerRX)
      this.carX = this.trackCX + Math.cos(angle) * this.innerRX * 1.02
      this.carY = this.trackCY + Math.sin(angle) * this.innerRY * 1.02
      this.carVX *= 0.4
      this.carVY *= 0.4
      this.carSpeed *= 0.5
      this.isDrifting = false
    }
  }

  private addTireMark(): void {
    const halfW = 6  // half car width for left/right tires
    const angle = this.carAngle + Math.PI / 2  // perpendicular
    const ox = Math.cos(angle) * halfW
    const oy = Math.sin(angle) * halfW

    // Two tire marks (left and right)
    for (const sign of [-1, 1]) {
      this.tireMarks.push({
        x1: this.prevCarX + ox * sign,
        y1: this.prevCarY + oy * sign,
        x2: this.carX + ox * sign,
        y2: this.carY + oy * sign,
        alpha: 0.6,
      })
    }

    // Trim excess
    if (this.tireMarks.length > this.MAX_TIRE_MARKS) {
      this.tireMarks.splice(0, this.tireMarks.length - this.MAX_TIRE_MARKS)
    }
  }

  private placeCheckpoints(): void {
    this.checkpoints = []
    for (let i = 0; i < CHECKPOINT_COUNT; i++) {
      const t = (i / CHECKPOINT_COUNT) * Math.PI * 2
      const cx = this.trackCX + Math.cos(t) * (this.trackRX + this.innerRX) / 2
      const cy = this.trackCY + Math.sin(t) * (this.trackRY + this.innerRY) / 2
      const tangentAngle = t + Math.PI / 2
      this.checkpoints.push({
        cx, cy,
        angle: tangentAngle,
        passed: false,
        width: this.trackWidth * 0.8,
      })
    }
  }

  private checkCheckpoints(): void {
    const cp = this.checkpoints[this.nextCheckpointIdx]
    if (!cp) return

    const dx = this.carX - cp.cx
    const dy = this.carY - cp.cy
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < cp.width / 2 + 12) {
      cp.passed = true
      this.nextCheckpointIdx = (this.nextCheckpointIdx + 1) % CHECKPOINT_COUNT

      // Lap complete when passing checkpoint 0 after hitting all others
      if (this.nextCheckpointIdx === 0 && this.lastCheckpointLap < this.totalTime - 10) {
        this.lastCheckpointLap = this.totalTime
        this.completeLap()
      }
    }
  }

  private completeLap(): void {
    this.lap++

    // Time bonus: faster = more points
    const timeBonus = Math.max(0, 3000 - this.lapTime)
    this.score += timeBonus

    if (this.bestLapTime === 0 || this.lapTime < this.bestLapTime) {
      this.bestLapTime = this.lapTime
    }

    // Reset checkpoints for next lap
    for (const cp of this.checkpoints) cp.passed = false
    this.lapTime = 0

    if (this.lap >= TOTAL_LAPS) {
      this.state = 'GAME_OVER'
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private get _carSpeed(): number {
    return Math.sqrt(this.carVX * this.carVX + this.carVY * this.carVY)
  }

  // ── Getters ───────────────────────────────────────────────────────────────────

  getState(): GameState { return this.state }
  getScore(): number { return this.score }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      carX: this.carX,
      carY: this.carY,
      carAngle: this.carAngle,
      carSpeed: this._carSpeed,
      isDrifting: this.isDrifting,
      driftAngle: this.driftAngle,
      score: this.score,
      driftScore: this.driftScore,
      driftMultiplier: this.driftMultiplier,
      driftCombo: this.driftCombo,
      lap: this.lap,
      lapTime: this.lapTime,
      bestLapTime: this.bestLapTime,
      totalTime: this.totalTime,
      trackCX: this.trackCX,
      trackCY: this.trackCY,
      trackRX: this.trackRX,
      trackRY: this.trackRY,
      innerRX: this.innerRX,
      innerRY: this.innerRY,
      checkpoints: this.checkpoints.map(c => ({ ...c })),
      tireMarks: this.tireMarks.map(m => ({ ...m })),
      canvasW: this.canvasW,
      canvasH: this.canvasH,
    }
  }
}
