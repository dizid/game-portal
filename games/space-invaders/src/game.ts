// Space Invaders — pure game logic, no rendering

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

export interface Point { x: number; y: number }

// ── Alien types ───────────────────────────────────────────────────────────────

export type AlienType = 'squid' | 'crab' | 'octopus' | 'jellyfish' | 'boss'

export interface Alien {
  id: number
  gridRow: number
  gridCol: number
  x: number   // pixel centre
  y: number   // pixel centre
  type: AlienType
  points: number
  alive: boolean
  frame: number  // animation frame 0 or 1
}

// ── Shield blocks ─────────────────────────────────────────────────────────────

export interface ShieldBlock {
  x: number
  y: number
  health: number  // 3 = full, 0 = destroyed
}

// ── Bullets ───────────────────────────────────────────────────────────────────

export interface Bullet {
  id: number
  x: number
  y: number
  speed: number   // pixels per frame, negative = upward (player), positive = downward (alien)
  isPlayer: boolean
}

// ── UFO ───────────────────────────────────────────────────────────────────────

export interface UFO {
  x: number
  y: number
  active: boolean
  points: number
  direction: 1 | -1
}

// ── Snapshot passed to renderer ───────────────────────────────────────────────

export interface GameSnapshot {
  state: GameState
  aliens: Alien[]
  shields: ShieldBlock[]
  bullets: Bullet[]
  ufo: UFO
  playerX: number
  playerY: number
  score: number
  lives: number
  level: number
  canvasW: number
  canvasH: number
  flashTimer: number  // >0 = white flash on alien death
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLS = 8
const ROWS = 5
// Points per row (bottom to top = indices 0..4 mapping to rows shown top-down)
const ROW_POINTS: number[] = [10, 10, 20, 20, 30]
const ROW_TYPES: AlienType[] = ['squid', 'crab', 'crab', 'octopus', 'octopus']

const ALIEN_W = 36
const ALIEN_H = 28
const ALIEN_PAD_X = 16
const ALIEN_PAD_Y = 12

const PLAYER_SPEED = 4
const BULLET_SPEED_PLAYER = 8
const BULLET_SPEED_ALIEN = 3
const SHIELD_BLOCK_W = 10
const SHIELD_BLOCK_H = 8

// Shield layout (4 shields, each 4×3 blocks)
const SHIELD_COLS = 4
const SHIELD_ROWS = 3
const SHIELD_COUNT = 4

const UFO_SPEED = 2.5
const UFO_Y_FRACTION = 0.08  // fraction of canvas height

let nextBulletId = 1

export class SpaceInvadersGame {
  private state: GameState = 'READY'
  private aliens: Alien[] = []
  private shields: ShieldBlock[] = []
  private bullets: Bullet[] = []
  private ufo: UFO = { x: 0, y: 0, active: false, points: 100, direction: 1 }

  // Player
  private playerX = 0
  private playerY = 0
  private playerMoveDir = 0  // -1 left, 0 none, +1 right

  private score = 0
  private lives = 3
  private level = 1

  // Alien movement
  private alienDir = 1   // 1 = right, -1 = left
  private alienDropPending = false
  private alienMoveTimer = 0
  private alienMovePeriod = 60  // frames between steps (decreases as aliens die)

  // Animation
  private animFrame = 0
  private animTimer = 0

  // Player shoot cooldown
  private shootCooldown = 0

  // Alien shoot timer
  private alienShootTimer = 0
  private alienShootPeriod = 90  // frames between alien shots (decreases per level)

  // UFO
  private ufoTimer = 0
  private ufoSpawnPeriod = 600  // frames between UFO attempts

  // Flash on alien hit
  private flashTimer = 0

  // Canvas dimensions (set on init/resize)
  private canvasW = 480
  private canvasH = 600

  // ── Boot / resize ─────────────────────────────────────────────────────────────

  init(canvasW: number, canvasH: number): void {
    this.canvasW = canvasW
    this.canvasH = canvasH
    this.reset()
  }

  resize(canvasW: number, canvasH: number): void {
    this.canvasW = canvasW
    this.canvasH = canvasH
    // Rebuild alien positions proportionally; keep score/lives
    this.layoutAliens()
    this.layoutShields()
    this.playerY = canvasH * 0.88
    this.playerX = Math.max(20, Math.min(canvasW - 20, this.playerX))
  }

  // ── Layout helpers ────────────────────────────────────────────────────────────

  private layoutAliens(): void {
    const startX = this.canvasW * 0.1
    const startY = this.canvasH * 0.12
    let id = 0
    // Re-place existing alive aliens maintaining grid positions
    const existingMap = new Map<string, Alien>()
    for (const a of this.aliens) {
      existingMap.set(`${a.gridRow},${a.gridCol}`, a)
    }
    const newAliens: Alien[] = []
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const key = `${row},${col}`
        const x = startX + col * (ALIEN_W + ALIEN_PAD_X) + ALIEN_W / 2
        const y = startY + row * (ALIEN_H + ALIEN_PAD_Y) + ALIEN_H / 2
        if (existingMap.has(key)) {
          const a = existingMap.get(key)!
          a.x = x
          a.y = y
          newAliens.push(a)
        } else {
          newAliens.push({
            id: id++,
            gridRow: row,
            gridCol: col,
            x,
            y,
            type: ROW_TYPES[row],
            points: ROW_POINTS[row],
            alive: true,
            frame: 0,
          })
        }
      }
    }
    this.aliens = newAliens
  }

  private layoutShields(): void {
    const shieldY = this.canvasH * 0.73
    const shieldW = SHIELD_COLS * SHIELD_BLOCK_W
    const shieldH = SHIELD_ROWS * SHIELD_BLOCK_H
    const totalWidth = SHIELD_COUNT * shieldW + (SHIELD_COUNT - 1) * 30
    const startX = (this.canvasW - totalWidth) / 2

    this.shields = []
    for (let s = 0; s < SHIELD_COUNT; s++) {
      const baseX = startX + s * (shieldW + 30)
      for (let row = 0; row < SHIELD_ROWS; row++) {
        for (let col = 0; col < SHIELD_COLS; col++) {
          // Notch bottom-centre for an arch shape (skip corners of bottom row)
          if (row === SHIELD_ROWS - 1 && (col === 1 || col === 2)) continue
          this.shields.push({
            x: baseX + col * SHIELD_BLOCK_W,
            y: shieldY + row * SHIELD_BLOCK_H,
            health: 3,
          })
        }
      }
    }
    void shieldH // suppress unused warning
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  reset(): void {
    this.score = 0
    this.lives = 3
    this.level = 1
    this.bullets = []
    this.alienDir = 1
    this.alienDropPending = false
    this.alienMoveTimer = 0
    this.alienMovePeriod = 60
    this.shootCooldown = 0
    this.alienShootTimer = 0
    this.alienShootPeriod = 90
    this.ufoTimer = 0
    this.ufo = { x: -100, y: this.canvasH * UFO_Y_FRACTION, active: false, points: 100, direction: 1 }
    this.flashTimer = 0
    this.playerX = this.canvasW / 2
    this.playerY = this.canvasH * 0.88
    this.playerMoveDir = 0
    this.layoutAliens()
    this.layoutShields()
    this.state = 'READY'
  }

  start(): void {
    if (this.state === 'READY') this.state = 'PLAYING'
  }

  setPlayerMove(dir: number): void {
    this.playerMoveDir = dir
  }

  shoot(): void {
    if (this.state !== 'PLAYING') return
    if (this.shootCooldown > 0) return
    // Only one player bullet at a time
    if (this.bullets.some(b => b.isPlayer)) return
    this.bullets.push({
      id: nextBulletId++,
      x: this.playerX,
      y: this.playerY - 20,
      speed: -BULLET_SPEED_PLAYER,
      isPlayer: true,
    })
    this.shootCooldown = 15
  }

  /** Advance one frame. Returns true if game just ended. */
  tick(): boolean {
    if (this.state !== 'PLAYING') return false

    this.flashTimer = Math.max(0, this.flashTimer - 1)

    // Player movement
    const halfW = this.canvasW / 2
    const playerRange = halfW * 0.85
    this.playerX = Math.max(
      this.canvasW / 2 - playerRange,
      Math.min(this.canvasW / 2 + playerRange, this.playerX + this.playerMoveDir * PLAYER_SPEED)
    )
    if (this.shootCooldown > 0) this.shootCooldown--

    // Move bullets
    this.bullets = this.bullets.filter(b => {
      b.y += b.speed
      return b.y > 0 && b.y < this.canvasH
    })

    // Alien movement
    this.alienMoveTimer++
    const aliveAliens = this.aliens.filter(a => a.alive)
    const movePeriod = this.calcAlienMovePeriod(aliveAliens.length)
    if (this.alienMoveTimer >= movePeriod) {
      this.alienMoveTimer = 0
      this.animTimer++
      if (this.animTimer % 2 === 0) {
        this.aliens.forEach(a => { a.frame = a.frame === 0 ? 1 : 0 })
      }
      this.moveAliens(aliveAliens)
    }

    // Alien shooting
    this.alienShootTimer++
    const shootPeriod = Math.max(30, this.alienShootPeriod - this.level * 5)
    if (this.alienShootTimer >= shootPeriod && aliveAliens.length > 0) {
      this.alienShootTimer = 0
      this.alienShoot(aliveAliens)
    }

    // UFO
    this.tickUFO()

    // Collision: player bullets vs aliens + UFO
    this.checkPlayerBulletHits()

    // Collision: alien bullets vs player + shields
    this.checkAlienBulletHits()

    // Check win condition: all aliens dead
    if (aliveAliens.length === 0) {
      this.nextLevel()
    }

    // Check lose condition: alien reached bottom
    for (const a of aliveAliens) {
      if (a.y + ALIEN_H / 2 >= this.playerY - 10) {
        this.state = 'GAME_OVER'
        return true
      }
    }

    return false
  }

  private calcAlienMovePeriod(aliveCount: number): number {
    // Speed increases as fewer aliens remain and as level increases
    const base = Math.max(8, 60 - (40 - aliveCount) * 0.8 - this.level * 5)
    return Math.max(8, base)
  }

  private moveAliens(aliveAliens: Alien[]): void {
    if (this.alienDropPending) {
      this.aliens.forEach(a => { if (a.alive) a.y += ALIEN_H * 0.6 })
      this.alienDir *= -1
      this.alienDropPending = false
      return
    }

    const step = 6
    let hitEdge = false
    this.aliens.forEach(a => {
      if (a.alive) {
        a.x += step * this.alienDir
        const halfW = ALIEN_W / 2
        if (a.x - halfW < 6 || a.x + halfW > this.canvasW - 6) {
          hitEdge = true
        }
      }
    })
    if (hitEdge) {
      this.alienDropPending = true
    }
    void aliveAliens
  }

  private alienShoot(aliveAliens: Alien[]): void {
    // Pick a random alien from the bottom of each column
    const colMap = new Map<number, Alien>()
    for (const a of aliveAliens) {
      const existing = colMap.get(a.gridCol)
      if (!existing || a.gridRow > existing.gridRow) {
        colMap.set(a.gridCol, a)
      }
    }
    const shooters = Array.from(colMap.values())
    const shooter = shooters[Math.floor(Math.random() * shooters.length)]
    if (shooter) {
      this.bullets.push({
        id: nextBulletId++,
        x: shooter.x,
        y: shooter.y + ALIEN_H / 2,
        speed: BULLET_SPEED_ALIEN,
        isPlayer: false,
      })
    }
  }

  private tickUFO(): void {
    if (this.ufo.active) {
      this.ufo.x += UFO_SPEED * this.ufo.direction
      if (this.ufo.x < -60 || this.ufo.x > this.canvasW + 60) {
        this.ufo.active = false
      }
    } else {
      this.ufoTimer++
      if (this.ufoTimer >= this.ufoSpawnPeriod) {
        this.ufoTimer = 0
        // Random chance to spawn
        if (Math.random() < 0.6) {
          const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
          this.ufo = {
            x: dir === 1 ? -40 : this.canvasW + 40,
            y: this.canvasH * UFO_Y_FRACTION,
            active: true,
            points: (Math.floor(Math.random() * 3) + 1) * 100,  // 100, 200, or 300
            direction: dir,
          }
        }
      }
    }
  }

  private checkPlayerBulletHits(): void {
    const playerBullets = this.bullets.filter(b => b.isPlayer)
    const toRemove = new Set<number>()

    for (const bullet of playerBullets) {
      // vs UFO
      if (this.ufo.active) {
        const dx = Math.abs(bullet.x - this.ufo.x)
        const dy = Math.abs(bullet.y - this.ufo.y)
        if (dx < 28 && dy < 14) {
          this.score += this.ufo.points
          this.ufo.active = false
          toRemove.add(bullet.id)
          this.flashTimer = 8
          continue
        }
      }

      // vs aliens
      let hit = false
      for (const alien of this.aliens) {
        if (!alien.alive) continue
        const dx = Math.abs(bullet.x - alien.x)
        const dy = Math.abs(bullet.y - alien.y)
        if (dx < ALIEN_W / 2 && dy < ALIEN_H / 2) {
          alien.alive = false
          this.score += alien.points
          toRemove.add(bullet.id)
          this.flashTimer = 6
          hit = true
          break
        }
      }
      if (hit) continue

      // vs shields
      for (const shield of this.shields) {
        if (shield.health <= 0) continue
        if (
          bullet.x >= shield.x &&
          bullet.x <= shield.x + SHIELD_BLOCK_W &&
          bullet.y >= shield.y &&
          bullet.y <= shield.y + SHIELD_BLOCK_H
        ) {
          shield.health--
          toRemove.add(bullet.id)
          break
        }
      }
    }

    this.bullets = this.bullets.filter(b => !toRemove.has(b.id))
  }

  private checkAlienBulletHits(): void {
    const alienBullets = this.bullets.filter(b => !b.isPlayer)
    const toRemove = new Set<number>()

    for (const bullet of alienBullets) {
      // vs shields
      let hitShield = false
      for (const shield of this.shields) {
        if (shield.health <= 0) continue
        if (
          bullet.x >= shield.x &&
          bullet.x <= shield.x + SHIELD_BLOCK_W &&
          bullet.y >= shield.y &&
          bullet.y <= shield.y + SHIELD_BLOCK_H
        ) {
          shield.health--
          toRemove.add(bullet.id)
          hitShield = true
          break
        }
      }
      if (hitShield) continue

      // vs player
      const dx = Math.abs(bullet.x - this.playerX)
      const dy = Math.abs(bullet.y - this.playerY)
      if (dx < 20 && dy < 12) {
        toRemove.add(bullet.id)
        this.lives--
        if (this.lives <= 0) {
          this.state = 'GAME_OVER'
        } else {
          // Brief respawn — clear bullets
          this.bullets = []
          return
        }
      }
    }

    this.bullets = this.bullets.filter(b => !toRemove.has(b.id))
  }

  private nextLevel(): void {
    this.level++
    this.bullets = []
    this.alienDir = 1
    this.alienDropPending = false
    this.alienMoveTimer = 0
    this.alienShootTimer = 0
    this.playerX = this.canvasW / 2
    this.layoutAliens()
    this.layoutShields()
  }

  // ── Getters ───────────────────────────────────────────────────────────────────

  getState(): GameState { return this.state }
  getScore(): number { return this.score }
  getLives(): number { return this.lives }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      aliens: this.aliens.map(a => ({ ...a })),
      shields: this.shields.map(s => ({ ...s })),
      bullets: this.bullets.map(b => ({ ...b })),
      ufo: { ...this.ufo },
      playerX: this.playerX,
      playerY: this.playerY,
      score: this.score,
      lives: this.lives,
      level: this.level,
      canvasW: this.canvasW,
      canvasH: this.canvasH,
      flashTimer: this.flashTimer,
    }
  }
}
