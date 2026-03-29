// Breakout — pure game logic, no DOM or rendering

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Brick {
  row: number
  col: number
  alive: boolean
  color: string      // neon fill colour
  points: number
}

export interface Ball {
  x: number
  y: number
  vx: number         // velocity in logical units per second
  vy: number
  radius: number
  trail: Array<{ x: number; y: number }>  // last N positions for trail effect
}

export interface Paddle {
  x: number          // centre x
  y: number          // centre y (fixed)
  width: number
  height: number
  widePowerupTimer: number  // seconds remaining on wide paddle
}

export interface PowerUp {
  x: number
  y: number
  vy: number
  type: 'wide' | 'multiball' | 'extralife'
  alive: boolean
}

export interface GameSnapshot {
  state: GameState
  bricks: Brick[]
  balls: Ball[]
  paddle: Paddle
  powerUps: PowerUp[]
  score: number
  lives: number
  level: number
  fieldW: number     // logical field width
  fieldH: number     // logical field height
  flashTimer: number // row-clear flash
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_W = 400
const FIELD_H = 600

const BRICK_ROWS = 5
const BRICK_COLS = 8
const BRICK_W = 42
const BRICK_H = 16
const BRICK_GAP = 4
const BRICK_TOP_OFFSET = 60

const ROW_COLORS = ['#ff4466', '#ff8c00', '#f5e642', '#44ff88', '#00d4ff']
const ROW_POINTS = [30, 20, 15, 10, 5]

const PADDLE_W = 80
const PADDLE_H = 12
const PADDLE_Y_FROM_BOTTOM = 40

const BALL_RADIUS = 6
const BALL_BASE_SPEED = 280   // logical units/second
const BALL_SPEED_INCREMENT = 15  // per 10 bricks destroyed
const BALL_MAX_SPEED = 600

const POWERUP_CHANCE = 0.22   // probability a destroyed brick drops a powerup
const POWERUP_FALL_SPEED = 120
const WIDE_POWERUP_DURATION = 10  // seconds
const WIDE_PADDLE_W = 130

const TRAIL_LENGTH = 10

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildBricks(): Brick[] {
  const bricks: Brick[] = []
  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      bricks.push({
        row,
        col,
        alive: true,
        color: ROW_COLORS[row],
        points: ROW_POINTS[row],
      })
    }
  }
  return bricks
}

function spawnBall(paddleX: number): Ball {
  // Launch at an upward angle from above the paddle
  const angle = (Math.random() * 60 + 60) * (Math.PI / 180) // 60–120° (upward)
  return {
    x: paddleX,
    y: FIELD_H - PADDLE_Y_FROM_BOTTOM - PADDLE_H - BALL_RADIUS - 2,
    vx: Math.cos(angle) * BALL_BASE_SPEED * (Math.random() < 0.5 ? 1 : -1),
    vy: -Math.abs(Math.sin(angle) * BALL_BASE_SPEED),
    radius: BALL_RADIUS,
    trail: [],
  }
}

// ── Game class ────────────────────────────────────────────────────────────────

export class BreakoutGame {
  private state: GameState = 'READY'
  private bricks: Brick[] = buildBricks()
  private balls: Ball[] = []
  private paddle: Paddle = {
    x: FIELD_W / 2,
    y: FIELD_H - PADDLE_Y_FROM_BOTTOM,
    width: PADDLE_W,
    height: PADDLE_H,
    widePowerupTimer: 0,
  }
  private powerUps: PowerUp[] = []
  private score: number = 0
  private lives: number = 3
  private level: number = 1
  private bricksDestroyed: number = 0
  private flashTimer: number = 0
  private currentSpeed: number = BALL_BASE_SPEED

  readonly fieldW = FIELD_W
  readonly fieldH = FIELD_H

  // ── Public API ────────────────────────────────────────────────────────────────

  start(): void {
    if (this.state !== 'READY') return
    this.balls = [spawnBall(this.paddle.x)]
    this.state = 'PLAYING'
  }

  reset(): void {
    this.state = 'READY'
    this.bricks = buildBricks()
    this.balls = []
    this.powerUps = []
    this.score = 0
    this.lives = 3
    this.level = 1
    this.bricksDestroyed = 0
    this.flashTimer = 0
    this.currentSpeed = BALL_BASE_SPEED
    this.paddle.x = FIELD_W / 2
    this.paddle.width = PADDLE_W
    this.paddle.widePowerupTimer = 0
  }

  /** Move paddle to logical x position (clamped). */
  movePaddle(logicalX: number): void {
    const hw = this.paddle.width / 2
    this.paddle.x = Math.max(hw, Math.min(FIELD_W - hw, logicalX))
  }

  /** Move paddle by delta (keyboard). */
  movePaddleDelta(delta: number): void {
    this.movePaddle(this.paddle.x + delta)
  }

  getState(): GameState { return this.state }
  getScore(): number { return this.score }
  getLives(): number { return this.lives }

  /** Advance the game by dt seconds. */
  update(dt: number): void {
    if (this.state !== 'PLAYING') return

    // Clamp dt to avoid spiral-of-death on tab switch
    const safeDt = Math.min(dt, 0.05)

    // Animate flash
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - safeDt)

    // Update wide paddle timer
    if (this.paddle.widePowerupTimer > 0) {
      this.paddle.widePowerupTimer -= safeDt
      if (this.paddle.widePowerupTimer <= 0) {
        this.paddle.width = PADDLE_W
      }
    }

    // Move power-ups
    for (const pu of this.powerUps) {
      if (!pu.alive) continue
      pu.y += pu.vy * safeDt

      // Check paddle collision
      if (
        pu.y + 8 >= this.paddle.y - this.paddle.height / 2 &&
        pu.y - 8 <= this.paddle.y + this.paddle.height / 2 &&
        pu.x + 8 >= this.paddle.x - this.paddle.width / 2 &&
        pu.x - 8 <= this.paddle.x + this.paddle.width / 2
      ) {
        pu.alive = false
        this.applyPowerUp(pu.type)
      }

      // Fell off screen
      if (pu.y > FIELD_H + 20) pu.alive = false
    }

    // Remove dead power-ups
    this.powerUps = this.powerUps.filter(p => p.alive)

    // Move + collide each ball
    const deadBallIndices: number[] = []

    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i]

      // Record trail position before moving
      ball.trail.push({ x: ball.x, y: ball.y })
      if (ball.trail.length > TRAIL_LENGTH) ball.trail.shift()

      ball.x += ball.vx * safeDt
      ball.y += ball.vy * safeDt

      // Wall collisions
      if (ball.x - ball.radius < 0) {
        ball.x = ball.radius
        ball.vx = Math.abs(ball.vx)
      }
      if (ball.x + ball.radius > FIELD_W) {
        ball.x = FIELD_W - ball.radius
        ball.vx = -Math.abs(ball.vx)
      }
      if (ball.y - ball.radius < 0) {
        ball.y = ball.radius
        ball.vy = Math.abs(ball.vy)
      }

      // Paddle collision
      const paddleTop = this.paddle.y - this.paddle.height / 2
      const paddleLeft = this.paddle.x - this.paddle.width / 2
      const paddleRight = this.paddle.x + this.paddle.width / 2

      if (
        ball.vy > 0 &&
        ball.y + ball.radius >= paddleTop &&
        ball.y - ball.radius <= paddleTop + this.paddle.height &&
        ball.x >= paddleLeft &&
        ball.x <= paddleRight
      ) {
        // Deflect based on hit position — left edge = more left, right = more right
        const hitOffset = (ball.x - this.paddle.x) / (this.paddle.width / 2) // -1..1
        const bounceAngle = hitOffset * 65 * (Math.PI / 180)
        const speed = Math.min(BALL_MAX_SPEED, Math.hypot(ball.vx, ball.vy) + 5)
        ball.vx = Math.sin(bounceAngle) * speed
        ball.vy = -Math.cos(bounceAngle) * speed
        ball.y = paddleTop - ball.radius - 1
      }

      // Ball fell below paddle
      if (ball.y - ball.radius > FIELD_H) {
        deadBallIndices.push(i)
        continue
      }

      // Brick collisions
      this.collideBallWithBricks(ball)
    }

    // Remove dead balls (iterate in reverse so indices stay valid)
    for (let i = deadBallIndices.length - 1; i >= 0; i--) {
      this.balls.splice(deadBallIndices[i], 1)
    }

    // All balls lost
    if (this.balls.length === 0) {
      this.lives -= 1
      if (this.lives <= 0) {
        this.lives = 0
        this.state = 'GAME_OVER'
      } else {
        // Respawn a ball on the paddle
        this.balls = [spawnBall(this.paddle.x)]
      }
    }

    // Check level complete (all bricks gone)
    if (this.bricks.every(b => !b.alive)) {
      this.nextLevel()
    }
  }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      bricks: this.bricks.map(b => ({ ...b })),
      balls: this.balls.map(b => ({ ...b, trail: b.trail.map(p => ({ ...p })) })),
      paddle: { ...this.paddle },
      powerUps: this.powerUps.map(p => ({ ...p })),
      score: this.score,
      lives: this.lives,
      level: this.level,
      fieldW: FIELD_W,
      fieldH: FIELD_H,
      flashTimer: this.flashTimer,
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private collideBallWithBricks(ball: Ball): void {
    for (const brick of this.bricks) {
      if (!brick.alive) continue

      // Calculate brick bounds
      const brickLeft = this.brickX(brick) - BRICK_W / 2
      const brickRight = this.brickX(brick) + BRICK_W / 2
      const brickTop = this.brickY(brick) - BRICK_H / 2
      const brickBottom = this.brickY(brick) + BRICK_H / 2

      // AABB vs circle
      const nearX = Math.max(brickLeft, Math.min(ball.x, brickRight))
      const nearY = Math.max(brickTop, Math.min(ball.y, brickBottom))
      const dx = ball.x - nearX
      const dy = ball.y - nearY
      const dist = Math.hypot(dx, dy)

      if (dist < ball.radius) {
        brick.alive = false
        this.score += brick.points
        this.bricksDestroyed += 1

        // Speed up every 10 bricks
        if (this.bricksDestroyed % 10 === 0) {
          this.currentSpeed = Math.min(BALL_MAX_SPEED, this.currentSpeed + BALL_SPEED_INCREMENT)
          this.scaleBallSpeed(ball)
        }

        // Bounce direction
        const overlapX = ball.radius - Math.abs(dx)
        const overlapY = ball.radius - Math.abs(dy)
        if (overlapX < overlapY) {
          ball.vx = dx < 0 ? -Math.abs(ball.vx) : Math.abs(ball.vx)
        } else {
          ball.vy = dy < 0 ? -Math.abs(ball.vy) : Math.abs(ball.vy)
        }

        // Check row clear bonus
        this.checkRowClear(brick.row)

        // Maybe spawn power-up
        if (Math.random() < POWERUP_CHANCE) {
          this.spawnPowerUp(this.brickX(brick), this.brickY(brick))
        }

        break // only one brick per frame per ball
      }
    }
  }

  private brickX(brick: Brick): number {
    const totalW = BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP
    const startX = (FIELD_W - totalW) / 2 + BRICK_W / 2
    return startX + brick.col * (BRICK_W + BRICK_GAP)
  }

  private brickY(brick: Brick): number {
    return BRICK_TOP_OFFSET + brick.row * (BRICK_H + BRICK_GAP) + BRICK_H / 2
  }

  private checkRowClear(row: number): void {
    const rowBricks = this.bricks.filter(b => b.row === row)
    if (rowBricks.every(b => !b.alive)) {
      this.score += 100
      this.flashTimer = 0.5
    }
  }

  private spawnPowerUp(x: number, y: number): void {
    const types: Array<PowerUp['type']> = ['wide', 'multiball', 'extralife']
    const weights = [0.5, 0.35, 0.15]
    const r = Math.random()
    let acc = 0
    let type: PowerUp['type'] = 'wide'
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i]
      if (r < acc) { type = types[i]; break }
    }
    this.powerUps.push({ x, y, vy: POWERUP_FALL_SPEED, type, alive: true })
  }

  private applyPowerUp(type: PowerUp['type']): void {
    switch (type) {
      case 'wide':
        this.paddle.width = WIDE_PADDLE_W
        this.paddle.widePowerupTimer = WIDE_POWERUP_DURATION
        break
      case 'multiball':
        // Duplicate each existing ball
        const newBalls: Ball[] = []
        for (const ball of this.balls) {
          const angle = Math.random() * 60 - 30
          const cos = Math.cos(angle * Math.PI / 180)
          const sin = Math.sin(angle * Math.PI / 180)
          newBalls.push({
            x: ball.x,
            y: ball.y,
            vx: ball.vx * cos - ball.vy * sin,
            vy: ball.vx * sin + ball.vy * cos,
            radius: BALL_RADIUS,
            trail: [],
          })
        }
        this.balls.push(...newBalls)
        break
      case 'extralife':
        this.lives = Math.min(this.lives + 1, 5)
        break
    }
  }

  private scaleBallSpeed(ball: Ball): void {
    const current = Math.hypot(ball.vx, ball.vy)
    if (current === 0) return
    const factor = this.currentSpeed / current
    ball.vx *= factor
    ball.vy *= factor
  }

  private nextLevel(): void {
    this.level += 1
    this.bricks = buildBricks()
    this.powerUps = []
    // Give an extra life every 2 levels
    if (this.level % 2 === 0) this.lives = Math.min(this.lives + 1, 5)
    // Increase base speed
    this.currentSpeed = Math.min(BALL_MAX_SPEED, BALL_BASE_SPEED + (this.level - 1) * 30)
    this.balls = [spawnBall(this.paddle.x)]
  }
}
