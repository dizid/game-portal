// Frogger — pure game logic

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RowType = 'safe' | 'road' | 'water' | 'goal'

export interface Vehicle {
  x: number       // logical x (0..COLS-1 units wide, but vehicles can be fractional)
  speed: number   // columns per second (signed = direction)
  width: number   // in logical column units
  color: string
}

export interface Log {
  x: number
  speed: number   // positive = right, negative = left
  width: number   // in column units
}

export interface Row {
  type: RowType
  vehicles: Vehicle[]
  logs: Log[]
}

export interface GoalSlot {
  col: number     // which column slot (0..4) the frog must reach
  filled: boolean
}

export interface Frog {
  col: number     // 0..COLS-1
  row: number     // 0..ROWS-1 (0 = top goal row, ROWS-1 = bottom start row)
  animTimer: number   // hop animation countdown
  onLog: Log | null
  dead: boolean
  deathTimer: number
}

export interface GameSnapshot {
  state: GameState
  frog: Frog
  rows: Row[]
  goalSlots: GoalSlot[]
  score: number
  lives: number
  timeLeft: number
  level: number
  fieldW: number
  fieldH: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLS = 13    // grid columns
const ROWS = 14    // grid rows (including goal row at top)

const ROUND_TIME = 60   // seconds per attempt
const HOP_ANIM_DURATION = 0.12  // seconds for hop animation

// ── Lane definitions ──────────────────────────────────────────────────────────

interface LaneDef {
  type: RowType
  vehicleCount: number
  vehicleWidth: number
  speed: number     // cols/sec, positive = right, negative = left
  logCount?: number
  logWidth?: number
  color?: string
}

function buildLaneDefs(level: number): LaneDef[] {
  const speedMult = 1 + (level - 1) * 0.25

  // Rows from top (index 0) to bottom (index ROWS-1)
  // Row 0 = goal (safe)
  // Row 1 = safe strip
  // Rows 2-6 = water / logs
  // Row 7 = safe median
  // Rows 8-12 = road / traffic
  // Row 13 = start (safe)
  return [
    { type: 'goal',  vehicleCount: 0, vehicleWidth: 0, speed: 0 },
    { type: 'safe',  vehicleCount: 0, vehicleWidth: 0, speed: 0 },
    { type: 'water', vehicleCount: 0, vehicleWidth: 0, speed: 0, logCount: Math.max(2, 4 - level), logWidth: 3, color: '#0066cc' },
    { type: 'water', vehicleCount: 0, vehicleWidth: 0, speed: 0, logCount: Math.max(2, 3 - Math.floor(level/2)), logWidth: 4, color: '#0066cc' },
    { type: 'water', vehicleCount: 0, vehicleWidth: 0, speed: 0, logCount: Math.max(2, 4 - level), logWidth: 2, color: '#0066cc' },
    { type: 'water', vehicleCount: 0, vehicleWidth: 0, speed: 0, logCount: Math.max(2, 3), logWidth: 3, color: '#0066cc' },
    { type: 'water', vehicleCount: 0, vehicleWidth: 0, speed: 0, logCount: Math.max(2, 4 - Math.floor(level/2)), logWidth: 2, color: '#0066cc' },
    { type: 'safe',  vehicleCount: 0, vehicleWidth: 0, speed: 0 },
    { type: 'road',  vehicleCount: 3 + level, vehicleWidth: 1, speed:  2.2 * speedMult, color: '#ff4444' },
    { type: 'road',  vehicleCount: 2 + level, vehicleWidth: 2, speed: -1.8 * speedMult, color: '#ffaa00' },
    { type: 'road',  vehicleCount: 3 + level, vehicleWidth: 1, speed:  2.5 * speedMult, color: '#ff66cc' },
    { type: 'road',  vehicleCount: 2 + level, vehicleWidth: 2, speed: -2.0 * speedMult, color: '#44aaff' },
    { type: 'road',  vehicleCount: 3 + level, vehicleWidth: 1, speed:  1.8 * speedMult, color: '#ff8800' },
    { type: 'safe',  vehicleCount: 0, vehicleWidth: 0, speed: 0 },
  ]
}

function buildRows(level: number): Row[] {
  const defs = buildLaneDefs(level)

  return defs.map((def, rowIndex) => {
    const row: Row = { type: def.type, vehicles: [], logs: [] }

    if (def.type === 'road') {
      // Distribute vehicles evenly across the row
      for (let i = 0; i < def.vehicleCount; i++) {
        row.vehicles.push({
          x: (i * COLS / def.vehicleCount) + Math.random() * 2,
          speed: def.speed!,
          width: def.vehicleWidth,
          color: def.color!,
        })
      }
    }

    if (def.type === 'water') {
      const logCount = def.logCount!
      const logWidth = def.logWidth!
      // Alternate log direction by row
      const dir = rowIndex % 2 === 0 ? 1 : -1
      const speed = (1.2 + Math.random() * 0.6) * (1 + (level - 1) * 0.2) * dir
      for (let i = 0; i < logCount; i++) {
        row.logs.push({
          x: (i * (COLS + logWidth) / logCount),
          speed,
          width: logWidth,
        })
      }
    }

    return row
  })
}

// ── Game class ────────────────────────────────────────────────────────────────

export class FroggerGame {
  private state: GameState = 'READY'
  private rows: Row[] = buildRows(1)
  private goalSlots: GoalSlot[] = this.buildGoalSlots()
  private frog: Frog = this.spawnFrog()
  private score: number = 0
  private lives: number = 3
  private timeLeft: number = ROUND_TIME
  private level: number = 1
  private highestRow: number = ROWS - 1
  private deathPending: boolean = false

  readonly fieldW = COLS
  readonly fieldH = ROWS

  getState(): GameState { return this.state }
  getScore(): number { return this.score }
  getLives(): number { return this.lives }
  getTimeLeft(): number { return this.timeLeft }

  start(): void {
    if (this.state !== 'READY') return
    this.state = 'PLAYING'
  }

  reset(): void {
    this.state = 'READY'
    this.level = 1
    this.rows = buildRows(this.level)
    this.goalSlots = this.buildGoalSlots()
    this.frog = this.spawnFrog()
    this.score = 0
    this.lives = 3
    this.timeLeft = ROUND_TIME
    this.highestRow = ROWS - 1
    this.deathPending = false
  }

  moveUp(): void    { this.moveFrog(0, -1) }
  moveDown(): void  { this.moveFrog(0,  1) }
  moveLeft(): void  { this.moveFrog(-1, 0) }
  moveRight(): void { this.moveFrog( 1, 0) }

  update(dt: number): void {
    if (this.state !== 'PLAYING') return
    const safeDt = Math.min(dt, 0.05)

    // Countdown timer
    this.timeLeft = Math.max(0, this.timeLeft - safeDt)
    if (this.timeLeft === 0) {
      this.killFrog()
    }

    // Animate frog hop
    if (this.frog.animTimer > 0) {
      this.frog.animTimer = Math.max(0, this.frog.animTimer - safeDt)
    }

    // Handle death animation
    if (this.frog.dead) {
      this.frog.deathTimer -= safeDt
      if (this.frog.deathTimer <= 0) {
        this.respawnFrog()
      }
      // Update vehicles/logs during death animation
      this.updateTraffic(safeDt)
      return
    }

    // Move vehicles
    this.updateTraffic(safeDt)

    // Ride log — move frog with log
    const frogRow = this.rows[this.frog.row]
    if (frogRow && frogRow.type === 'water') {
      const log = this.findLog(this.frog.row, this.frog.col + 0.5)
      if (log) {
        this.frog.onLog = log
        this.frog.col += log.speed * safeDt
        // Clamp col to field
        if (this.frog.col < -0.5 || this.frog.col >= COLS) {
          // Frog rode off screen
          this.killFrog()
          return
        }
      } else {
        // Frog in water without log = death
        this.killFrog()
        return
      }
    } else {
      this.frog.onLog = null
    }

    // Check vehicle collisions
    if (frogRow && frogRow.type === 'road') {
      for (const v of frogRow.vehicles) {
        if (this.overlapsVehicle(v)) {
          this.killFrog()
          return
        }
      }
    }

    // Check goal arrival
    if (this.frog.row === 0) {
      this.checkGoal()
    }
  }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      frog: { ...this.frog },
      rows: this.rows.map(r => ({
        ...r,
        vehicles: r.vehicles.map(v => ({ ...v })),
        logs: r.logs.map(l => ({ ...l })),
      })),
      goalSlots: this.goalSlots.map(g => ({ ...g })),
      score: this.score,
      lives: this.lives,
      timeLeft: this.timeLeft,
      level: this.level,
      fieldW: COLS,
      fieldH: ROWS,
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private buildGoalSlots(): GoalSlot[] {
    // 5 goal slots evenly distributed across the top row
    return [1, 3, 5, 7, 9].map(col => ({ col, filled: false }))
  }

  private spawnFrog(): Frog {
    return {
      col: Math.floor(COLS / 2),
      row: ROWS - 1,
      animTimer: 0,
      onLog: null,
      dead: false,
      deathTimer: 0,
    }
  }

  private moveFrog(dc: number, dr: number): void {
    if (this.state !== 'PLAYING' || this.frog.dead || this.frog.animTimer > 0) return

    const newCol = Math.round(this.frog.col) + dc
    const newRow = this.frog.row + dr

    if (newCol < 0 || newCol >= COLS) return
    if (newRow < 0 || newRow >= ROWS) return

    const oldRow = this.frog.row
    this.frog.col = newCol
    this.frog.row = newRow
    this.frog.animTimer = HOP_ANIM_DURATION
    this.frog.onLog = null  // will re-check in update

    // Score for moving forward (upward = decreasing row)
    if (newRow < oldRow && newRow < this.highestRow) {
      this.highestRow = newRow
      this.score += 10
    }
    // Time bonus for forward movement
    if (newRow < oldRow) {
      this.score += 1
    }
  }

  private updateTraffic(dt: number): void {
    for (const row of this.rows) {
      for (const v of row.vehicles) {
        v.x += v.speed * dt
        // Wrap around
        if (v.speed > 0 && v.x > COLS + v.width) v.x = -v.width - 0.5
        if (v.speed < 0 && v.x + v.width < -1) v.x = COLS + v.width + 0.5
      }
      for (const log of row.logs) {
        log.x += log.speed * dt
        // Wrap around
        if (log.speed > 0 && log.x > COLS + log.width) log.x = -log.width - 0.5
        if (log.speed < 0 && log.x + log.width < -1) log.x = COLS + log.width + 0.5
      }
    }
  }

  private findLog(row: number, col: number): Log | null {
    for (const log of this.rows[row].logs) {
      if (col >= log.x && col < log.x + log.width) {
        return log
      }
    }
    return null
  }

  private overlapsVehicle(v: Vehicle): boolean {
    const frogCol = Math.round(this.frog.col)
    return frogCol >= v.x && frogCol < v.x + v.width
  }

  private killFrog(): void {
    if (this.frog.dead) return
    this.frog.dead = true
    this.frog.deathTimer = 0.8  // seconds for death animation
    this.lives -= 1
    if (this.lives <= 0) {
      // Game over after animation
      this.deathPending = true
    }
  }

  private respawnFrog(): void {
    if (this.deathPending) {
      this.state = 'GAME_OVER'
      return
    }
    this.frog = this.spawnFrog()
    this.timeLeft = ROUND_TIME
    this.highestRow = ROWS - 1
  }

  private checkGoal(): void {
    const frogCol = Math.round(this.frog.col)
    const slot = this.goalSlots.find(g => g.col === frogCol && !g.filled)
    if (slot) {
      slot.filled = true
      const timeBonus = Math.floor(this.timeLeft * 5)
      this.score += 500 + timeBonus
      this.frog = this.spawnFrog()
      this.timeLeft = ROUND_TIME
      this.highestRow = ROWS - 1

      // Check if all slots filled — next level
      if (this.goalSlots.every(g => g.filled)) {
        this.nextLevel()
      }
    } else {
      // Landed on bad spot in goal row (no empty slot here)
      this.killFrog()
    }
  }

  private nextLevel(): void {
    this.level += 1
    this.rows = buildRows(this.level)
    this.goalSlots = this.buildGoalSlots()
    this.frog = this.spawnFrog()
    this.timeLeft = ROUND_TIME
    this.highestRow = ROWS - 1
    // Bonus points for completing level
    this.score += 1000
  }
}
