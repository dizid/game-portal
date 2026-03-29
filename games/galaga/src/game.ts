// Galaga — game logic

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER' | 'BONUS_STAGE' | 'WAVE_CLEAR'
export type EnemyType = 'basic' | 'medium' | 'boss'

export interface Star {
  x: number
  y: number
  speed: number
  size: number
  brightness: number
}

export interface Enemy {
  id: number
  type: EnemyType
  // Formation position (target)
  formCol: number
  formRow: number
  formX: number
  formY: number
  // Current position
  x: number
  y: number
  // State
  alive: boolean
  health: number   // boss = 2, others = 1
  phase: 'entering' | 'formation' | 'diving' | 'returning'
  // Entry path progress
  pathT: number
  pathPoints: { x: number; y: number }[]
  // Dive path
  diveT: number
  divePoints: { x: number; y: number }[]
  // Captured player (boss mechanic)
  hasCaptured: boolean
  // Shooting
  shootTimer: number
  frame: number  // animation frame
}

export interface Bullet {
  id: number
  x: number
  y: number
  speed: number
  isPlayer: boolean
}

export interface Explosion {
  id: number
  x: number
  y: number
  radius: number
  maxRadius: number
  alpha: number
  color: string
}

export interface GameSnapshot {
  state: GameState
  enemies: Enemy[]
  bullets: Bullet[]
  explosions: Explosion[]
  stars: Star[]
  playerX: number
  playerY: number
  playerDual: boolean  // dual ship after boss rescue
  score: number
  lives: number
  wave: number
  bonusStageHits: number
  bonusStageMisses: number
  canvasW: number
  canvasH: number
  captureBeam: CaptureBeam | null
}

export interface CaptureBeam {
  x: number
  y: number
  height: number
  alpha: number
  timer: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ENEMY_POINTS: Record<EnemyType, number> = { basic: 50, medium: 100, boss: 150 }
const FORMATION_COLS = 10
const FORMATION_ROWS = 5
// Formation types per row
const ROW_TYPES: EnemyType[] = ['boss', 'medium', 'medium', 'basic', 'basic']

let nextId = 1

export class GalagaGame {
  private state: GameState = 'READY'
  private enemies: Enemy[] = []
  private bullets: Bullet[] = []
  private explosions: Explosion[] = []
  private stars: Star[] = []

  private playerX = 0
  private playerY = 0
  private playerMoveDir = 0
  private playerDual = false
  private playerSpeed = 4
  private shootCooldown = 0
  private lives = 2
  private score = 0
  private wave = 1

  // Wave state
  private waveState: 'entering' | 'formation' | 'attacking' | 'all_diving' = 'entering'
  private enterQueue: number[] = []  // indices of enemies waiting to enter
  private enterTimer = 0
  private attackTimer = 0
  private waveTimer = 0
  private waveClearTimer = 0

  // Bonus stage
  private bonusStageHits = 0
  private bonusStageMisses = 0
  private bonusEnterQueue: number[] = []

  // Capture beam
  private captureBeam: CaptureBeam | null = null
  private captureTimer = 0

  private canvasW = 480
  private canvasH = 700

  // ── Init ──────────────────────────────────────────────────────────────────────

  init(w: number, h: number): void {
    this.canvasW = w
    this.canvasH = h
    this.reset()
  }

  resize(w: number, h: number): void {
    this.canvasW = w
    this.canvasH = h
    this.playerY = h * 0.88
    this.rebuildFormationPositions()
  }

  reset(): void {
    this.score = 0
    this.lives = 2
    this.wave = 1
    this.playerX = this.canvasW / 2
    this.playerY = this.canvasH * 0.88
    this.playerDual = false
    this.shootCooldown = 0
    this.bullets = []
    this.explosions = []
    this.captureBeam = null
    this.state = 'READY'
    this.buildStars()
    this.startWave()
  }

  start(): void {
    if (this.state === 'READY') this.state = 'PLAYING'
  }

  setPlayerMove(dir: number): void { this.playerMoveDir = dir }

  shoot(): void {
    if (this.state !== 'PLAYING' && this.state !== 'BONUS_STAGE') return
    if (this.shootCooldown > 0) return
    this.spawnPlayerBullet(this.playerX)
    if (this.playerDual) {
      this.spawnPlayerBullet(this.playerX + 22)
    }
    this.shootCooldown = 12
  }

  private spawnPlayerBullet(x: number): void {
    this.bullets.push({ id: nextId++, x, y: this.playerY - 20, speed: -10, isPlayer: true })
  }

  // ── Main tick ─────────────────────────────────────────────────────────────────

  tick(): void {
    if (this.state === 'WAVE_CLEAR') {
      this.waveClearTimer++
      this.scrollStars()
      if (this.waveClearTimer > 90) {
        this.wave++
        if (this.wave % 4 === 0) {
          this.startBonusStage()
        } else {
          this.startWave()
          this.state = 'PLAYING'
        }
      }
      return
    }

    if (this.state !== 'PLAYING' && this.state !== 'BONUS_STAGE') return

    this.scrollStars()
    if (this.shootCooldown > 0) this.shootCooldown--

    // Player movement
    const margin = 22
    this.playerX = Math.max(margin, Math.min(this.canvasW - margin, this.playerX + this.playerMoveDir * this.playerSpeed))

    // Move bullets
    this.bullets = this.bullets.filter(b => {
      b.y += b.speed
      return b.y > -20 && b.y < this.canvasH + 20
    })

    // Enemies
    if (this.state === 'PLAYING') {
      this.tickEnemies()
      this.tickCaptureBeam()
    } else if (this.state === 'BONUS_STAGE') {
      this.tickBonusStage()
    }

    this.tickExplosions()
    this.checkBulletHits()
  }

  // ── Wave management ───────────────────────────────────────────────────────────

  private startWave(): void {
    this.enemies = []
    this.bullets = this.bullets.filter(b => b.isPlayer)
    this.waveState = 'entering'
    this.enterQueue = []
    this.enterTimer = 0
    this.attackTimer = 0
    this.waveTimer = 0
    this.buildFormation()
    // Queue all enemies to enter
    this.enterQueue = this.enemies.map((_, i) => i)
  }

  private buildFormation(): void {
    const spacingX = Math.min(44, this.canvasW / (FORMATION_COLS + 1))
    const spacingY = 36
    const startX = (this.canvasW - spacingX * (FORMATION_COLS - 1)) / 2
    const startY = this.canvasH * 0.12

    for (let row = 0; row < FORMATION_ROWS; row++) {
      for (let col = 0; col < FORMATION_COLS; col++) {
        const type = ROW_TYPES[row]
        const fx = startX + col * spacingX
        const fy = startY + row * spacingY
        // Start enemies off screen
        const startSide = col < FORMATION_COLS / 2 ? -80 : this.canvasW + 80
        this.enemies.push({
          id: nextId++,
          type,
          formCol: col,
          formRow: row,
          formX: fx,
          formY: fy,
          x: startSide,
          y: -50,
          alive: true,
          health: type === 'boss' ? 2 : 1,
          phase: 'entering',
          pathT: 0,
          pathPoints: this.buildEntryPath(col, row, fx, fy, startSide),
          diveT: 0,
          divePoints: [],
          hasCaptured: false,
          shootTimer: Math.floor(Math.random() * 120) + 60,
          frame: 0,
        })
      }
    }
  }

  private buildEntryPath(
    col: number, _row: number,
    formX: number, formY: number,
    startX: number
  ): { x: number; y: number }[] {
    // Create a looping entry path
    const side = col < FORMATION_COLS / 2 ? -1 : 1
    const midX = this.canvasW * (0.5 + side * 0.3)
    return [
      { x: startX, y: -40 },
      { x: midX, y: this.canvasH * 0.3 },
      { x: midX + side * -this.canvasW * 0.4, y: this.canvasH * 0.15 },
      { x: formX, y: formY },
    ]
  }

  private rebuildFormationPositions(): void {
    const spacingX = Math.min(44, this.canvasW / (FORMATION_COLS + 1))
    const spacingY = 36
    const startX = (this.canvasW - spacingX * (FORMATION_COLS - 1)) / 2
    const startY = this.canvasH * 0.12
    for (const e of this.enemies) {
      e.formX = startX + e.formCol * spacingX
      e.formY = startY + e.formRow * spacingY
    }
  }

  private tickEnemies(): void {
    this.waveTimer++
    this.enterTimer++

    // Release enemies from enter queue one by one
    if (this.waveState === 'entering' && this.enterTimer % 4 === 0) {
      const next = this.enterQueue.shift()
      if (next !== undefined) {
        this.enemies[next].phase = 'entering'
      }
      if (this.enterQueue.length === 0) {
        this.waveState = 'formation'
        this.attackTimer = 120
      }
    }

    let allInFormation = true

    for (const e of this.enemies) {
      if (!e.alive) continue
      e.frame = Math.floor(this.waveTimer / 20) % 2

      if (e.phase === 'entering') {
        allInFormation = false
        e.pathT += 0.018 + this.wave * 0.002
        if (e.pathT >= 1) {
          e.pathT = 1
          e.x = e.formX
          e.y = e.formY
          e.phase = 'formation'
        } else {
          const p = catmullRom(e.pathPoints, e.pathT)
          e.x = p.x
          e.y = p.y
        }
      } else if (e.phase === 'formation') {
        // Gentle hover
        e.x = e.formX + Math.sin(this.waveTimer * 0.02 + e.formCol * 0.5) * 4
        e.y = e.formY + Math.sin(this.waveTimer * 0.015 + e.formRow * 0.3) * 3

        // Random dive attack
        if (this.waveState === 'formation' || this.waveState === 'attacking') {
          e.shootTimer--
          if (e.shootTimer <= 0) {
            e.shootTimer = Math.floor(Math.random() * 180) + 60 - this.wave * 5
            // Random alien shoots a bullet
            if (Math.random() < 0.4 + this.wave * 0.05) {
              this.bullets.push({
                id: nextId++, x: e.x, y: e.y + 12,
                speed: 3 + Math.random() * 2 + this.wave * 0.2,
                isPlayer: false,
              })
            }
          }
        }

        // Dive attack trigger
        if (this.waveState === 'formation') {
          this.attackTimer--
          if (this.attackTimer <= 0) {
            this.attackTimer = 60 + Math.floor(Math.random() * 80)
            // Pick a random alive formation enemy to dive
            const candidates = this.enemies.filter(x => x.alive && x.phase === 'formation')
            if (candidates.length > 0) {
              const diver = candidates[Math.floor(Math.random() * candidates.length)]
              diver.phase = 'diving'
              diver.diveT = 0
              diver.divePoints = this.buildDivePath(diver.x, diver.y)
              this.waveState = 'attacking'
              // Boss capture beam
              if (diver.type === 'boss' && !diver.hasCaptured && this.captureBeam === null && Math.random() < 0.2) {
                this.captureTimer = 180
                this.captureBeam = { x: diver.x, y: diver.y + 12, height: 0, alpha: 0.8, timer: 180 }
              }
            }
          }
        }
      } else if (e.phase === 'diving') {
        allInFormation = false
        e.diveT += 0.016 + this.wave * 0.001
        if (e.diveT >= 1) {
          // Off screen — return to formation (re-enter from top)
          e.phase = 'returning'
          e.pathT = 0
          e.pathPoints = [
            { x: e.x, y: e.y },
            { x: e.x + (Math.random() - 0.5) * 200, y: -80 },
            { x: e.formX + (Math.random() - 0.5) * 60, y: -40 },
            { x: e.formX, y: e.formY },
          ]
          this.waveState = 'formation'
        } else {
          const p = catmullRom(e.divePoints, e.diveT)
          e.x = p.x
          e.y = p.y
          // Shoot while diving
          if (Math.floor(e.diveT * 10) % 3 === 0 && e.diveT < 0.7) {
            if (Math.random() < 0.05 + this.wave * 0.01) {
              this.bullets.push({ id: nextId++, x: e.x, y: e.y + 12, speed: 4, isPlayer: false })
            }
          }
        }
      } else if (e.phase === 'returning') {
        allInFormation = false
        e.pathT += 0.025
        if (e.pathT >= 1) {
          e.x = e.formX
          e.y = e.formY
          e.phase = 'formation'
          this.waveState = 'formation'
        } else {
          const p = catmullRom(e.pathPoints, e.pathT)
          e.x = p.x
          e.y = p.y
        }
      }
    }

    void allInFormation

    // Check wave cleared
    const alive = this.enemies.filter(e => e.alive)
    if (alive.length === 0) {
      this.state = 'WAVE_CLEAR'
      this.waveClearTimer = 0
    }
  }

  private buildDivePath(sx: number, sy: number): { x: number; y: number }[] {
    const targetX = this.playerX + (Math.random() - 0.5) * 80
    return [
      { x: sx, y: sy },
      { x: sx + (Math.random() - 0.5) * 200, y: sy + this.canvasH * 0.25 },
      { x: targetX + (Math.random() - 0.5) * 100, y: this.canvasH * 0.6 },
      { x: targetX, y: this.canvasH + 60 },
    ]
  }

  // ── Capture beam ──────────────────────────────────────────────────────────────

  private tickCaptureBeam(): void {
    if (!this.captureBeam) return
    this.captureTimer--
    this.captureBeam.height = Math.min(this.canvasH, this.captureBeam.height + 8)
    this.captureBeam.alpha = Math.abs(Math.sin(this.captureTimer * 0.1)) * 0.5 + 0.3

    // Check if beam hits player
    if (
      this.captureBeam.height > this.playerY - this.captureBeam.y &&
      Math.abs(this.playerX - this.captureBeam.x) < 20
    ) {
      this.captureBeam = null
      this.lives--
      if (this.lives <= 0) this.state = 'GAME_OVER'
    }

    if (this.captureTimer <= 0) this.captureBeam = null
  }

  // ── Bonus stage ───────────────────────────────────────────────────────────────

  private startBonusStage(): void {
    this.state = 'BONUS_STAGE'
    this.bonusStageHits = 0
    this.bonusStageMisses = 0
    this.enemies = []
    this.bullets = this.bullets.filter(b => b.isPlayer)
    this.bonusEnterQueue = []
    // Create 40 basic enemies for bonus stage
    for (let i = 0; i < 40; i++) {
      const side = i % 2 === 0 ? -60 : this.canvasW + 60
      const targetX = this.canvasW * 0.2 + Math.random() * this.canvasW * 0.6
      this.enemies.push({
        id: nextId++, type: 'basic',
        formCol: i, formRow: 0,
        formX: targetX, formY: this.canvasH * 0.15 + Math.random() * this.canvasH * 0.4,
        x: side, y: this.canvasH * 0.1 + Math.random() * this.canvasH * 0.3,
        alive: true, health: 1,
        phase: 'entering',
        pathT: 0, pathPoints: [
          { x: side, y: Math.random() * this.canvasH * 0.3 },
          { x: this.canvasW / 2, y: Math.random() * this.canvasH * 0.5 },
          { x: targetX + (Math.random() - 0.5) * 100, y: targetX },
          { x: side > this.canvasW / 2 ? -60 : this.canvasW + 60, y: Math.random() * this.canvasH * 0.4 },
        ],
        diveT: 0, divePoints: [],
        hasCaptured: false,
        shootTimer: 9999, frame: 0,
      })
      this.bonusEnterQueue.push(i)
    }
    // Release them with delay
    let delay = 0
    for (let i = 0; i < this.enemies.length; i++) {
      this.enemies[i].pathT = -delay * 0.018
      delay += 1
    }
  }

  private tickBonusStage(): void {
    this.waveTimer++
    let allGone = true
    for (const e of this.enemies) {
      if (!e.alive) continue
      allGone = false
      e.pathT += 0.02
      if (e.pathT >= 1) {
        e.alive = false
        this.bonusStageMisses++
      } else if (e.pathT > 0) {
        const p = catmullRom(e.pathPoints, Math.min(1, e.pathT))
        e.x = p.x
        e.y = p.y
      }
      e.frame = Math.floor(this.waveTimer / 15) % 2
    }
    if (allGone) {
      // Calculate bonus
      const bonus = this.bonusStageHits * 100
      this.score += bonus
      this.startWave()
      this.state = 'PLAYING'
    }
  }

  // ── Collision detection ───────────────────────────────────────────────────────

  private checkBulletHits(): void {
    const toRemove = new Set<number>()

    for (const bullet of this.bullets) {
      if (bullet.isPlayer) {
        // vs enemies
        for (const e of this.enemies) {
          if (!e.alive) continue
          const dx = Math.abs(bullet.x - e.x)
          const dy = Math.abs(bullet.y - e.y)
          const hitR = e.type === 'boss' ? 20 : 14
          if (dx < hitR && dy < hitR) {
            toRemove.add(bullet.id)
            e.health--
            if (e.health <= 0) {
              e.alive = false
              this.score += ENEMY_POINTS[e.type]
              if (this.state === 'BONUS_STAGE') this.bonusStageHits++
              this.spawnExplosion(e.x, e.y, e.type)
            }
            break
          }
        }
      } else {
        // vs player
        const dx = Math.abs(bullet.x - this.playerX)
        const dy = Math.abs(bullet.y - this.playerY)
        if (dx < 16 && dy < 12) {
          toRemove.add(bullet.id)
          this.lives--
          this.playerDual = false
          this.spawnExplosion(this.playerX, this.playerY, 'basic')
          if (this.lives <= 0) this.state = 'GAME_OVER'
        }
      }
    }

    this.bullets = this.bullets.filter(b => !toRemove.has(b.id))
  }

  private spawnExplosion(x: number, y: number, type: EnemyType): void {
    const colors: Record<EnemyType, string> = { basic: '#4488ff', medium: '#ff4444', boss: '#44ff88' }
    this.explosions.push({
      id: nextId++, x, y,
      radius: 0,
      maxRadius: type === 'boss' ? 40 : 24,
      alpha: 1,
      color: colors[type],
    })
  }

  private tickExplosions(): void {
    for (const ex of this.explosions) {
      ex.radius += 2
      ex.alpha -= 0.04
    }
    this.explosions = this.explosions.filter(ex => ex.alpha > 0)
  }

  // ── Stars ─────────────────────────────────────────────────────────────────────

  private buildStars(): void {
    this.stars = []
    for (let i = 0; i < 100; i++) {
      this.stars.push({
        x: Math.random() * this.canvasW,
        y: Math.random() * this.canvasH,
        speed: 0.3 + Math.random() * 1.5,
        size: Math.random() < 0.2 ? 2 : 1,
        brightness: 0.4 + Math.random() * 0.6,
      })
    }
  }

  private scrollStars(): void {
    for (const s of this.stars) {
      s.y += s.speed
      if (s.y > this.canvasH) {
        s.y = 0
        s.x = Math.random() * this.canvasW
      }
    }
  }

  // ── Getters ───────────────────────────────────────────────────────────────────

  getState(): GameState { return this.state }
  getScore(): number { return this.score }
  getLives(): number { return this.lives }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      enemies: this.enemies.map(e => ({ ...e })),
      bullets: this.bullets.map(b => ({ ...b })),
      explosions: this.explosions.map(e => ({ ...e })),
      stars: this.stars.map(s => ({ ...s })),
      playerX: this.playerX,
      playerY: this.playerY,
      playerDual: this.playerDual,
      score: this.score,
      lives: this.lives,
      wave: this.wave,
      bonusStageHits: this.bonusStageHits,
      bonusStageMisses: this.bonusStageMisses,
      canvasW: this.canvasW,
      canvasH: this.canvasH,
      captureBeam: this.captureBeam ? { ...this.captureBeam } : null,
    }
  }
}

// ── Catmull-Rom spline interpolation ─────────────────────────────────────────

function catmullRom(points: { x: number; y: number }[], t: number): { x: number; y: number } {
  const n = points.length
  if (n === 0) return { x: 0, y: 0 }
  if (n === 1) return points[0]

  const tClamped = Math.max(0, Math.min(1, t))
  const scaledT = tClamped * (n - 1)
  const i = Math.min(Math.floor(scaledT), n - 2)
  const localT = scaledT - i

  const p0 = points[Math.max(0, i - 1)]
  const p1 = points[i]
  const p2 = points[Math.min(n - 1, i + 1)]
  const p3 = points[Math.min(n - 1, i + 2)]

  const alpha = 0.5
  const x = crCalc(p0.x, p1.x, p2.x, p3.x, localT, alpha)
  const y = crCalc(p0.y, p1.y, p2.y, p3.y, localT, alpha)
  return { x, y }
}

function crCalc(p0: number, p1: number, p2: number, p3: number, t: number, _a: number): number {
  return (
    0.5 * (
      2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
    )
  )
}
