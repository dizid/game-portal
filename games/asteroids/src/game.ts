// Asteroids — pure game logic

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AsteroidSize = 'large' | 'medium' | 'small'

export interface Vec2 { x: number; y: number }

export interface Ship {
  pos: Vec2
  vel: Vec2
  angle: number           // radians, 0 = facing up
  thrusting: boolean
  invincible: boolean
  invincibleTimer: number // seconds remaining
  dead: boolean
  deathTimer: number
  thrustFlame: number     // animation phase 0..1
}

export interface Asteroid {
  id: number
  pos: Vec2
  vel: Vec2
  angle: number
  spin: number            // radians/sec
  size: AsteroidSize
  radius: number
  vertices: Vec2[]        // polygon shape offsets (unit circle scale)
}

export interface Bullet {
  id: number
  pos: Vec2
  vel: Vec2
  life: number            // seconds remaining
}

export interface Particle {
  pos: Vec2
  vel: Vec2
  life: number
  maxLife: number
  color: string
}

export interface GameSnapshot {
  state: GameState
  ship: Ship | null
  asteroids: Asteroid[]
  bullets: Bullet[]
  particles: Particle[]
  score: number
  lives: number
  level: number
  fieldW: number
  fieldH: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SHIP_ROTATE_SPEED = 3.2    // radians/sec
const SHIP_THRUST_FORCE = 260    // px/sec^2
const SHIP_FRICTION = 0.97       // velocity multiplier per frame
const SHIP_MAX_SPEED = 380       // px/sec
const SHIP_INVINCIBLE_TIME = 2.5 // seconds after respawn
const SHIP_DEATH_ANIM_TIME = 0.8

const BULLET_SPEED = 500         // px/sec
const BULLET_LIFE = 1.1          // seconds
const BULLET_RADIUS = 3

const ASTEROID_SIZES: Record<AsteroidSize, number> = {
  large: 42,
  medium: 24,
  small: 12,
}

const ASTEROID_SCORES: Record<AsteroidSize, number> = {
  large: 20,
  medium: 50,
  small: 100,
}

const ASTEROID_SPEEDS: Record<AsteroidSize, [number, number]> = {
  large:  [30, 70],
  medium: [55, 110],
  small:  [80, 160],
}

const BASE_ASTEROID_COUNT = 4
const PARTICLE_COUNT_ASTEROID = 8
const PARTICLE_LIFE = 0.8

let nextId = 1

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function wrapCoord(v: number, max: number): number {
  if (v < 0) return v + max
  if (v >= max) return v - max
  return v
}

function buildAsteroidVertices(seed: number): Vec2[] {
  const count = 10 + (seed % 4)
  const verts: Vec2[] = []
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const r = 0.7 + Math.sin(i * seed * 7.3 + seed) * 0.3
    verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
  }
  return verts
}

function spawnAsteroid(fieldW: number, fieldH: number, avoidX: number, avoidY: number, size: AsteroidSize): Asteroid {
  const radius = ASTEROID_SIZES[size]
  const [minSpeed, maxSpeed] = ASTEROID_SPEEDS[size]
  const speed = randomRange(minSpeed, maxSpeed)
  const dir = Math.random() * Math.PI * 2
  const seed = Math.floor(Math.random() * 1000)

  // Pick a position away from the avoidance point (ship centre)
  let x: number, y: number
  let attempts = 0
  do {
    x = Math.random() * fieldW
    y = Math.random() * fieldH
    attempts++
  } while (
    attempts < 20 &&
    Math.hypot(x - avoidX, y - avoidY) < radius * 4 + 80
  )

  return {
    id: nextId++,
    pos: { x, y },
    vel: { x: Math.cos(dir) * speed, y: Math.sin(dir) * speed },
    angle: Math.random() * Math.PI * 2,
    spin: randomRange(-1.5, 1.5),
    size,
    radius,
    vertices: buildAsteroidVertices(seed),
  }
}

function makeShip(fieldW: number, fieldH: number, invincible = false): Ship {
  return {
    pos: { x: fieldW / 2, y: fieldH / 2 },
    vel: { x: 0, y: 0 },
    angle: -Math.PI / 2,  // facing up
    thrusting: false,
    invincible,
    invincibleTimer: invincible ? SHIP_INVINCIBLE_TIME : 0,
    dead: false,
    deathTimer: 0,
    thrustFlame: 0,
  }
}

function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy < (ar + br) * (ar + br)
}

// ── Game class ────────────────────────────────────────────────────────────────

export class AsteroidsGame {
  private state: GameState = 'READY'
  private ship: Ship | null = null
  private asteroids: Asteroid[] = []
  private bullets: Bullet[] = []
  private particles: Particle[] = []
  private score: number = 0
  private lives: number = 3
  private level: number = 1
  private fieldW: number = 800
  private fieldH: number = 600
  private respawnPending: boolean = false

  // Input state (public so main.ts can set them directly)
  rotateLeft: boolean = false
  rotateRight: boolean = false
  thrusting: boolean = false
  shooting: boolean = false
  private shootCooldown: number = 0

  setField(w: number, h: number): void {
    this.fieldW = w
    this.fieldH = h
  }

  getState(): GameState { return this.state }
  getScore(): number { return this.score }
  getLives(): number { return this.lives }

  start(): void {
    if (this.state !== 'READY') return
    this.ship = makeShip(this.fieldW, this.fieldH)
    this.spawnWave()
    this.state = 'PLAYING'
  }

  reset(): void {
    this.state = 'READY'
    this.ship = null
    this.asteroids = []
    this.bullets = []
    this.particles = []
    this.score = 0
    this.lives = 3
    this.level = 1
    this.shootCooldown = 0
    this.respawnPending = false
  }

  shoot(): void {
    if (!this.ship || this.ship.dead || this.shootCooldown > 0) return
    const { ship } = this
    const bulletVel = {
      x: Math.cos(ship.angle) * BULLET_SPEED + ship.vel.x,
      y: Math.sin(ship.angle) * BULLET_SPEED + ship.vel.y,
    }
    this.bullets.push({
      id: nextId++,
      pos: { x: ship.pos.x + Math.cos(ship.angle) * 14, y: ship.pos.y + Math.sin(ship.angle) * 14 },
      vel: bulletVel,
      life: BULLET_LIFE,
    })
    this.shootCooldown = 0.18  // ~5 shots/sec
  }

  update(dt: number): void {
    if (this.state !== 'PLAYING') return
    const safeDt = Math.min(dt, 0.05)

    // Shooting via held key
    if (this.shooting) {
      this.shoot()
    }

    this.shootCooldown = Math.max(0, this.shootCooldown - safeDt)

    this.updateShip(safeDt)
    this.updateAsteroids(safeDt)
    this.updateBullets(safeDt)
    this.updateParticles(safeDt)
    this.checkCollisions()

    // Check wave clear
    if (this.asteroids.length === 0 && this.bullets.length === 0) {
      this.level += 1
      this.spawnWave()
    }
  }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      ship: this.ship ? { ...this.ship, pos: { ...this.ship.pos }, vel: { ...this.ship.vel } } : null,
      asteroids: this.asteroids.map(a => ({ ...a, pos: { ...a.pos }, vel: { ...a.vel }, vertices: a.vertices.map(v => ({ ...v })) })),
      bullets: this.bullets.map(b => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel } })),
      particles: this.particles.map(p => ({ ...p, pos: { ...p.pos }, vel: { ...p.vel } })),
      score: this.score,
      lives: this.lives,
      level: this.level,
      fieldW: this.fieldW,
      fieldH: this.fieldH,
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private updateShip(dt: number): void {
    const { ship } = this
    if (!ship) return

    if (ship.dead) {
      ship.deathTimer -= dt
      if (ship.deathTimer <= 0) {
        if (this.respawnPending) {
          this.state = 'GAME_OVER'
        } else {
          this.ship = makeShip(this.fieldW, this.fieldH, true)
        }
      }
      return
    }

    // Rotation
    if (this.rotateLeft)  ship.angle -= SHIP_ROTATE_SPEED * dt
    if (this.rotateRight) ship.angle += SHIP_ROTATE_SPEED * dt

    // Thrust
    ship.thrusting = this.thrusting
    if (this.thrusting) {
      ship.vel.x += Math.cos(ship.angle) * SHIP_THRUST_FORCE * dt
      ship.vel.y += Math.sin(ship.angle) * SHIP_THRUST_FORCE * dt
      // Clamp speed
      const speed = Math.hypot(ship.vel.x, ship.vel.y)
      if (speed > SHIP_MAX_SPEED) {
        ship.vel.x = (ship.vel.x / speed) * SHIP_MAX_SPEED
        ship.vel.y = (ship.vel.y / speed) * SHIP_MAX_SPEED
      }
      // Thrust flame animation
      ship.thrustFlame = (ship.thrustFlame + dt * 15) % 1

      // Thrust particles
      if (Math.random() < 0.4) {
        const flameAngle = ship.angle + Math.PI + (Math.random() - 0.5) * 0.6
        this.particles.push({
          pos: { x: ship.pos.x - Math.cos(ship.angle) * 10, y: ship.pos.y - Math.sin(ship.angle) * 10 },
          vel: { x: Math.cos(flameAngle) * randomRange(40, 100), y: Math.sin(flameAngle) * randomRange(40, 100) },
          life: 0.25,
          maxLife: 0.25,
          color: Math.random() < 0.5 ? '#ff8800' : '#ffcc00',
        })
      }
    } else {
      ship.thrustFlame = 0
    }

    // Friction
    ship.vel.x *= Math.pow(SHIP_FRICTION, dt * 60)
    ship.vel.y *= Math.pow(SHIP_FRICTION, dt * 60)

    // Move
    ship.pos.x += ship.vel.x * dt
    ship.pos.y += ship.vel.y * dt

    // Wrap
    ship.pos.x = wrapCoord(ship.pos.x, this.fieldW)
    ship.pos.y = wrapCoord(ship.pos.y, this.fieldH)

    // Invincibility countdown
    if (ship.invincible) {
      ship.invincibleTimer -= dt
      if (ship.invincibleTimer <= 0) {
        ship.invincible = false
      }
    }
  }

  private updateAsteroids(dt: number): void {
    for (const a of this.asteroids) {
      a.pos.x += a.vel.x * dt
      a.pos.y += a.vel.y * dt
      a.angle += a.spin * dt
      a.pos.x = wrapCoord(a.pos.x, this.fieldW)
      a.pos.y = wrapCoord(a.pos.y, this.fieldH)
    }
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      b.pos.x += b.vel.x * dt
      b.pos.y += b.vel.y * dt
      b.pos.x = wrapCoord(b.pos.x, this.fieldW)
      b.pos.y = wrapCoord(b.pos.y, this.fieldH)
      b.life -= dt
    }
    this.bullets = this.bullets.filter(b => b.life > 0)
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.pos.x += p.vel.x * dt
      p.pos.y += p.vel.y * dt
      p.vel.x *= 0.97
      p.vel.y *= 0.97
      p.life -= dt
    }
    this.particles = this.particles.filter(p => p.life > 0)
  }

  private checkCollisions(): void {
    const { ship, asteroids, bullets } = this

    // Bullets vs asteroids
    const bulletsToRemove = new Set<number>()
    const asteroidsToRemove = new Set<number>()

    for (const bullet of bullets) {
      for (const asteroid of asteroids) {
        if (circlesOverlap(bullet.pos.x, bullet.pos.y, BULLET_RADIUS, asteroid.pos.x, asteroid.pos.y, asteroid.radius)) {
          bulletsToRemove.add(bullet.id)
          asteroidsToRemove.add(asteroid.id)
          this.score += ASTEROID_SCORES[asteroid.size]
          this.explodeAsteroid(asteroid)
          break
        }
      }
    }

    this.bullets = bullets.filter(b => !bulletsToRemove.has(b.id))
    this.asteroids = asteroids.filter(a => !asteroidsToRemove.has(a.id))

    // Ship vs asteroids
    if (ship && !ship.dead && !ship.invincible) {
      for (const asteroid of this.asteroids) {
        if (circlesOverlap(ship.pos.x, ship.pos.y, 10, asteroid.pos.x, asteroid.pos.y, asteroid.radius)) {
          this.killShip()
          break
        }
      }
    }
  }

  private explodeAsteroid(a: Asteroid): void {
    // Spawn children
    const childSize: AsteroidSize | null = a.size === 'large' ? 'medium' : a.size === 'medium' ? 'small' : null
    if (childSize) {
      for (let i = 0; i < 2; i++) {
        const child = spawnAsteroid(this.fieldW, this.fieldH, a.pos.x, a.pos.y, childSize)
        child.pos = { x: a.pos.x + (Math.random() - 0.5) * 20, y: a.pos.y + (Math.random() - 0.5) * 20 }
        this.asteroids.push(child)
      }
    }

    // Particles
    for (let i = 0; i < PARTICLE_COUNT_ASTEROID; i++) {
      const dir = Math.random() * Math.PI * 2
      const speed = randomRange(40, 120)
      const colors = ['#ffc832', '#ff8800', '#ff4466', '#ffffff', '#aaaaff']
      this.particles.push({
        pos: { x: a.pos.x, y: a.pos.y },
        vel: { x: Math.cos(dir) * speed, y: Math.sin(dir) * speed },
        life: PARTICLE_LIFE,
        maxLife: PARTICLE_LIFE,
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
  }

  private killShip(): void {
    if (!this.ship) return
    const { ship } = this

    // Death particles
    for (let i = 0; i < 16; i++) {
      const dir = (i / 16) * Math.PI * 2
      const speed = randomRange(60, 180)
      this.particles.push({
        pos: { x: ship.pos.x, y: ship.pos.y },
        vel: { x: Math.cos(dir) * speed, y: Math.sin(dir) * speed },
        life: 1.0,
        maxLife: 1.0,
        color: i % 2 === 0 ? '#ffc832' : '#ff4466',
      })
    }

    ship.dead = true
    ship.deathTimer = SHIP_DEATH_ANIM_TIME
    this.lives -= 1

    if (this.lives <= 0) {
      this.respawnPending = true
    }
  }

  private spawnWave(): void {
    const count = BASE_ASTEROID_COUNT + this.level - 1
    for (let i = 0; i < count; i++) {
      const cx = this.ship?.pos.x ?? this.fieldW / 2
      const cy = this.ship?.pos.y ?? this.fieldH / 2
      this.asteroids.push(spawnAsteroid(this.fieldW, this.fieldH, cx, cy, 'large'))
    }
  }
}
