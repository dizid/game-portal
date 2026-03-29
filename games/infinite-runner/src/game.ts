// Infinite Runner — game logic

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

export type ObstacleType = 'spike' | 'low_wall' | 'high_wall' | 'gap'

export interface Platform {
  x: number        // left edge
  y: number        // top edge (ground level)
  width: number
  isGap: boolean   // if true, no platform — just void
}

export interface Obstacle {
  id: number
  x: number
  y: number        // bottom of obstacle = platform surface
  width: number
  height: number
  type: ObstacleType
}

export interface Coin {
  id: number
  x: number
  y: number
  collected: boolean
  bobOffset: number
}

export interface ParallaxLayer {
  // Each layer is a set of decorative "buildings" or mountain silhouettes
  objects: { x: number; width: number; height: number }[]
  speed: number    // fraction of game speed
  color: string
}

export interface GameSnapshot {
  state: GameState
  // Character
  charX: number
  charY: number
  charVY: number
  isOnGround: boolean
  jumpCount: number      // 0, 1, or 2
  legAngle: number       // for running animation
  isDying: boolean
  deathAngle: number
  deathAlpha: number
  // World
  platforms: Platform[]
  obstacles: Obstacle[]
  coins: Coin[]
  layers: ParallaxLayer[]
  groundY: number
  scrollX: number
  // Score
  score: number
  speed: number
  canvasW: number
  canvasH: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHAR_X_FIXED = 100     // character stays at fixed screen X
const CHAR_WIDTH = 24
const CHAR_HEIGHT = 32
const GRAVITY = 0.55
const JUMP_FORCE = -13.0
const DOUBLE_JUMP_FORCE = -11.0
const BASE_SPEED = 4.5
const MAX_SPEED = 12
const SPEED_INCREMENT = 0.0008  // per frame

const GROUND_Y_FRACTION = 0.72  // fraction of canvas height for ground level

let nextId = 1

export class InfiniteRunnerGame {
  private state: GameState = 'READY'
  private canvasW = 600
  private canvasH = 400

  // Character
  private charY = 0
  private charVY = 0
  private isOnGround = false
  private jumpCount = 0
  private jumpHeld = false
  private legAngle = 0
  private isDying = false
  private deathAngle = 0
  private deathAlpha = 1
  private deathTimer = 0

  // World
  private platforms: Platform[] = []
  private obstacles: Obstacle[] = []
  private coins: Coin[] = []
  private layers: ParallaxLayer[] = []
  private groundY = 0
  private scrollX = 0
  private score = 0
  private speed = BASE_SPEED
  private frameCount = 0

  // Generation state
  private nextPlatformX = 0
  private nextObstacleX = 0
  private nextCoinX = 0
  private lastObstacleType: ObstacleType | null = null

  // ── Init ──────────────────────────────────────────────────────────────────────

  init(w: number, h: number): void {
    this.canvasW = w
    this.canvasH = h
    this.groundY = h * GROUND_Y_FRACTION
    this.reset()
  }

  resize(w: number, h: number): void {
    this.canvasW = w
    this.canvasH = h
    this.groundY = h * GROUND_Y_FRACTION
  }

  reset(): void {
    this.charY = this.groundY - CHAR_HEIGHT
    this.charVY = 0
    this.isOnGround = true
    this.jumpCount = 0
    this.jumpHeld = false
    this.legAngle = 0
    this.isDying = false
    this.deathAngle = 0
    this.deathAlpha = 1
    this.deathTimer = 0
    this.scrollX = 0
    this.score = 0
    this.speed = BASE_SPEED
    this.frameCount = 0
    this.platforms = []
    this.obstacles = []
    this.coins = []
    this.lastObstacleType = null

    // Start with solid ground extending far ahead
    this.nextPlatformX = 0
    this.generateInitialGround()
    this.nextObstacleX = this.canvasW + 200
    this.nextCoinX = this.canvasW + 150
    this.buildParallaxLayers()
    this.state = 'READY'
  }

  start(): void {
    if (this.state === 'READY') this.state = 'PLAYING'
  }

  jump(): void {
    if (this.state !== 'PLAYING') return
    if (this.isOnGround) {
      this.charVY = JUMP_FORCE
      this.isOnGround = false
      this.jumpCount = 1
      this.jumpHeld = true
    } else if (this.jumpCount < 2) {
      this.charVY = DOUBLE_JUMP_FORCE
      this.jumpCount = 2
      this.jumpHeld = true
    }
  }

  releaseJump(): void {
    this.jumpHeld = false
  }

  // ── Tick ──────────────────────────────────────────────────────────────────────

  tick(): void {
    if (this.state !== 'PLAYING') return

    if (this.isDying) {
      this.tickDeath()
      return
    }

    this.frameCount++
    this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.frameCount * SPEED_INCREMENT)
    this.score = Math.floor(this.frameCount * 0.1)
    this.scrollX += this.speed

    // Jump hold: cut velocity early if button released
    if (!this.jumpHeld && this.charVY < 0) {
      this.charVY *= 0.85
    }

    // Apply gravity
    this.charVY += GRAVITY
    this.charY += this.charVY

    // Check platform collision
    this.isOnGround = false
    for (const p of this.platforms) {
      if (p.isGap) continue
      const screenX = p.x - this.scrollX + CHAR_X_FIXED
      const charScreenLeft = CHAR_X_FIXED - CHAR_WIDTH / 2
      const charScreenRight = CHAR_X_FIXED + CHAR_WIDTH / 2
      if (
        charScreenRight > screenX &&
        charScreenLeft < screenX + p.width &&
        this.charY + CHAR_HEIGHT >= p.y &&
        this.charY + CHAR_HEIGHT <= p.y + 20 &&
        this.charVY >= 0
      ) {
        this.charY = p.y - CHAR_HEIGHT
        this.charVY = 0
        this.isOnGround = true
        this.jumpCount = 0
      }
    }

    // Fall into gap = death
    if (this.charY > this.canvasH + 100) {
      this.triggerDeath()
      return
    }

    // Leg animation
    if (this.isOnGround) {
      this.legAngle += this.speed * 0.12
    }

    // Check obstacle collisions
    for (const obs of this.obstacles) {
      const screenX = obs.x - this.scrollX + CHAR_X_FIXED
      const cl = CHAR_X_FIXED - CHAR_WIDTH / 2 + 4  // small margin
      const cr = CHAR_X_FIXED + CHAR_WIDTH / 2 - 4
      const ct = this.charY + 4
      const cb = this.charY + CHAR_HEIGHT - 2
      const ol = screenX
      const or_ = screenX + obs.width
      const ot = obs.y - obs.height
      const ob = obs.y
      if (cr > ol && cl < or_ && cb > ot && ct < ob) {
        this.triggerDeath()
        return
      }
    }

    // Collect coins
    for (const coin of this.coins) {
      if (coin.collected) continue
      const screenX = coin.x - this.scrollX + CHAR_X_FIXED
      const dx = Math.abs(screenX - CHAR_X_FIXED)
      const dy = Math.abs(coin.y - (this.charY + CHAR_HEIGHT / 2))
      if (dx < 20 && dy < 20) {
        coin.collected = true
        this.score += 10
      }
      coin.bobOffset = Math.sin(this.frameCount * 0.08 + coin.x * 0.01) * 6
    }

    // Procedural generation
    this.generateChunk()

    // Cull off-screen objects
    const cullX = this.scrollX - this.canvasW
    this.platforms = this.platforms.filter(p => p.x + p.width > cullX)
    this.obstacles = this.obstacles.filter(o => o.x + o.width > cullX)
    this.coins = this.coins.filter(c => !c.collected && c.x > cullX)

    // Scroll parallax
    this.scrollParallax()
  }

  private triggerDeath(): void {
    this.isDying = true
    this.deathTimer = 90
    this.deathAngle = 0
    this.deathAlpha = 1
  }

  private tickDeath(): void {
    this.deathAngle += 0.15
    this.charY += 3
    this.deathAlpha -= 0.011
    this.deathTimer--
    if (this.deathTimer <= 0) {
      this.state = 'GAME_OVER'
    }
  }

  // ── Generation ────────────────────────────────────────────────────────────────

  private generateInitialGround(): void {
    // Place solid ground starting from x=0 ahead
    const worldX = this.scrollX  // start at scroll position
    this.platforms.push({ x: worldX, y: this.groundY, width: this.canvasW * 3, isGap: false })
    this.nextPlatformX = worldX + this.canvasW * 3
  }

  private generateChunk(): void {
    const genAheadX = this.scrollX + this.canvasW * 1.5

    // Generate platforms/gaps
    while (this.nextPlatformX < genAheadX) {
      const isGap = this.speed > 6 && Math.random() < 0.12
      const width = isGap
        ? 50 + Math.random() * 60
        : 100 + Math.random() * 200
      this.platforms.push({
        x: this.nextPlatformX,
        y: this.groundY,
        width,
        isGap,
      })
      this.nextPlatformX += width
    }

    // Generate obstacles (only on solid ground)
    while (this.nextObstacleX < genAheadX) {
      const gap = 180 + Math.random() * 200
      this.nextObstacleX += gap
      const platformAtX = this.platforms.find(
        p => !p.isGap && p.x <= this.nextObstacleX && p.x + p.width > this.nextObstacleX
      )
      if (!platformAtX) continue

      // Avoid repeating same obstacle type
      const types: ObstacleType[] = ['spike', 'spike', 'low_wall', 'high_wall']
      let type = types[Math.floor(Math.random() * types.length)]
      if (type === this.lastObstacleType) {
        type = types[(types.indexOf(type) + 1) % types.length]
      }
      this.lastObstacleType = type

      const w = type === 'spike' ? 18 : type === 'low_wall' ? 14 : 14
      const h = type === 'spike' ? 22 : type === 'low_wall' ? 26 : 44
      this.obstacles.push({
        id: nextId++,
        x: this.nextObstacleX,
        y: this.groundY,  // bottom of obstacle = ground
        width: w,
        height: h,
        type,
      })
    }

    // Generate coins
    while (this.nextCoinX < genAheadX) {
      this.nextCoinX += 80 + Math.random() * 120
      const platformAtX = this.platforms.find(
        p => !p.isGap && p.x <= this.nextCoinX && p.x + p.width > this.nextCoinX
      )
      if (!platformAtX) continue
      // Float 50-80px above ground
      const coinY = this.groundY - 50 - Math.random() * 30
      this.coins.push({
        id: nextId++,
        x: this.nextCoinX,
        y: coinY,
        collected: false,
        bobOffset: 0,
      })
    }
  }

  private buildParallaxLayers(): void {
    this.layers = [
      this.buildLayer(0.1, 'rgba(30,20,60,0.9)', 6, 80, 120, 0.3),   // far mountains
      this.buildLayer(0.3, 'rgba(20,30,80,0.85)', 8, 50, 80, 0.5),    // mid buildings
      this.buildLayer(0.6, 'rgba(10,40,100,0.8)', 10, 30, 50, 0.7),   // near buildings
    ]
  }

  private buildLayer(
    speed: number,
    color: string,
    count: number,
    minH: number,
    maxH: number,
    _alpha: number,
  ): ParallaxLayer {
    const objects: { x: number; width: number; height: number }[] = []
    const spacing = this.canvasW * 2 / count
    for (let i = 0; i < count * 3; i++) {
      objects.push({
        x: i * spacing + Math.random() * spacing * 0.5,
        width: 30 + Math.random() * 60,
        height: minH + Math.random() * (maxH - minH),
      })
    }
    return { objects, speed, color }
  }

  private scrollParallax(): void {
    for (const layer of this.layers) {
      for (const obj of layer.objects) {
        obj.x -= this.speed * layer.speed
        if (obj.x + obj.width < 0) {
          obj.x = this.canvasW + Math.random() * 100
          obj.height = obj.height * (0.9 + Math.random() * 0.2)
        }
      }
    }
  }

  // ── Getters ───────────────────────────────────────────────────────────────────

  getState(): GameState { return this.state }
  getScore(): number { return this.score }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      charX: CHAR_X_FIXED,
      charY: this.charY,
      charVY: this.charVY,
      isOnGround: this.isOnGround,
      jumpCount: this.jumpCount,
      legAngle: this.legAngle,
      isDying: this.isDying,
      deathAngle: this.deathAngle,
      deathAlpha: this.deathAlpha,
      platforms: this.platforms.map(p => ({ ...p })),
      obstacles: this.obstacles.map(o => ({ ...o })),
      coins: this.coins.map(c => ({ ...c })),
      layers: this.layers.map(l => ({ ...l, objects: l.objects.map(o => ({ ...o })) })),
      groundY: this.groundY,
      scrollX: this.scrollX,
      score: this.score,
      speed: this.speed,
      canvasW: this.canvasW,
      canvasH: this.canvasH,
    }
  }
}
