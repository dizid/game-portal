// Pong — pure game logic

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

export interface PongBall {
  x: number
  y: number
  vx: number
  vy: number
  trail: Array<{ x: number; y: number }>
}

export interface Paddle {
  y: number        // centre y
  vy: number       // velocity for animation smoothness
  width: number
  height: number
}

export interface GameSnapshot {
  state: GameState
  ball: PongBall
  playerPaddle: Paddle
  aiPaddle: Paddle
  playerScore: number
  aiScore: number
  fieldW: number
  fieldH: number
  flashTimer: number
  winner: 'player' | 'ai' | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_W = 600
const FIELD_H = 400

const PADDLE_W = 12
const PADDLE_H = 70
const PADDLE_MARGIN = 20    // distance from edge

const BALL_RADIUS = 7
const BALL_BASE_SPEED = 250
const BALL_SPEED_INCREMENT = 15  // per paddle hit
const BALL_MAX_SPEED = 550

const WIN_SCORE = 11

const AI_BASE_REACTION = 0.80  // fraction of ball-paddle gap covered per second
const AI_ERROR_PER_AI_POINT = 0.04  // AI gets worse as it falls behind

const TRAIL_LENGTH = 12

// ── Helpers ───────────────────────────────────────────────────────────────────

function launchBall(serveLeft: boolean): PongBall {
  const angle = (Math.random() * 40 - 20) * (Math.PI / 180)
  const speed = BALL_BASE_SPEED
  const direction = serveLeft ? -1 : 1
  return {
    x: FIELD_W / 2,
    y: FIELD_H / 2,
    vx: direction * Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    trail: [],
  }
}

// ── Game class ────────────────────────────────────────────────────────────────

export class PongGame {
  private state: GameState = 'READY'
  private ball: PongBall = launchBall(true)
  private playerPaddle: Paddle = {
    y: FIELD_H / 2,
    vy: 0,
    width: PADDLE_W,
    height: PADDLE_H,
  }
  private aiPaddle: Paddle = {
    y: FIELD_H / 2,
    vy: 0,
    width: PADDLE_W,
    height: PADDLE_H,
  }
  private playerScore: number = 0
  private aiScore: number = 0
  private flashTimer: number = 0
  private serveLeft: boolean = true
  private winner: 'player' | 'ai' | null = null

  readonly fieldW = FIELD_W
  readonly fieldH = FIELD_H

  getState(): GameState { return this.state }
  getPlayerScore(): number { return this.playerScore }

  start(): void {
    if (this.state !== 'READY') return
    this.state = 'PLAYING'
  }

  reset(): void {
    this.state = 'READY'
    this.playerScore = 0
    this.aiScore = 0
    this.flashTimer = 0
    this.serveLeft = true
    this.winner = null
    this.playerPaddle.y = FIELD_H / 2
    this.aiPaddle.y = FIELD_H / 2
    this.ball = launchBall(true)
  }

  /** Move player paddle to an absolute Y coordinate in logical space. */
  movePlayerPaddle(logicalY: number): void {
    const half = PADDLE_H / 2
    this.playerPaddle.y = Math.max(half, Math.min(FIELD_H - half, logicalY))
  }

  /** Move player paddle by delta (keyboard, per-frame). */
  movePlayerPaddleDelta(delta: number): void {
    this.movePlayerPaddle(this.playerPaddle.y + delta)
  }

  update(dt: number): void {
    if (this.state !== 'PLAYING') return
    const safeDt = Math.min(dt, 0.05)

    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - safeDt)
    }

    this.updateAI(safeDt)
    this.updateBall(safeDt)
  }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      ball: { ...this.ball, trail: this.ball.trail.map(p => ({ ...p })) },
      playerPaddle: { ...this.playerPaddle },
      aiPaddle: { ...this.aiPaddle },
      playerScore: this.playerScore,
      aiScore: this.aiScore,
      fieldW: FIELD_W,
      fieldH: FIELD_H,
      flashTimer: this.flashTimer,
      winner: this.winner,
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private updateAI(dt: number): void {
    // AI tries to track ball y, with speed limited by reaction factor
    // Introduce error proportional to how far ahead AI score is
    const reactionFactor = Math.max(
      0.3,
      AI_BASE_REACTION - (this.aiScore - this.playerScore) * AI_ERROR_PER_AI_POINT
    )

    const target = this.ball.y + (Math.random() - 0.5) * 12 // slight random error
    const diff = target - this.aiPaddle.y
    const maxMove = Math.abs(diff) * reactionFactor
    const move = Math.sign(diff) * Math.min(Math.abs(diff), maxMove * dt * 10)

    this.aiPaddle.y += move

    // Clamp
    const half = PADDLE_H / 2
    this.aiPaddle.y = Math.max(half, Math.min(FIELD_H - half, this.aiPaddle.y))
  }

  private updateBall(dt: number): void {
    const { ball } = this

    // Record trail
    ball.trail.push({ x: ball.x, y: ball.y })
    if (ball.trail.length > TRAIL_LENGTH) ball.trail.shift()

    ball.x += ball.vx * dt
    ball.y += ball.vy * dt

    // Top/bottom wall bounce
    if (ball.y - BALL_RADIUS < 0) {
      ball.y = BALL_RADIUS
      ball.vy = Math.abs(ball.vy)
    }
    if (ball.y + BALL_RADIUS > FIELD_H) {
      ball.y = FIELD_H - BALL_RADIUS
      ball.vy = -Math.abs(ball.vy)
    }

    // Player paddle (left side)
    const playerX = PADDLE_MARGIN + PADDLE_W
    if (
      ball.vx < 0 &&
      ball.x - BALL_RADIUS <= playerX &&
      ball.x + BALL_RADIUS >= PADDLE_MARGIN &&
      ball.y >= this.playerPaddle.y - PADDLE_H / 2 - BALL_RADIUS &&
      ball.y <= this.playerPaddle.y + PADDLE_H / 2 + BALL_RADIUS
    ) {
      this.bouncePaddleHit(ball, this.playerPaddle, 1)
    }

    // AI paddle (right side)
    const aiX = FIELD_W - PADDLE_MARGIN - PADDLE_W
    if (
      ball.vx > 0 &&
      ball.x + BALL_RADIUS >= aiX &&
      ball.x - BALL_RADIUS <= FIELD_W - PADDLE_MARGIN &&
      ball.y >= this.aiPaddle.y - PADDLE_H / 2 - BALL_RADIUS &&
      ball.y <= this.aiPaddle.y + PADDLE_H / 2 + BALL_RADIUS
    ) {
      this.bouncePaddleHit(ball, this.aiPaddle, -1)
    }

    // Scoring — ball exits left
    if (ball.x + BALL_RADIUS < 0) {
      this.aiScore += 1
      this.flashTimer = 0.4
      this.checkWin()
      if (this.state === 'PLAYING') {
        this.serveLeft = false
        this.ball = launchBall(this.serveLeft)
      }
    }

    // Scoring — ball exits right
    if (ball.x - BALL_RADIUS > FIELD_W) {
      this.playerScore += 1
      this.flashTimer = 0.4
      this.checkWin()
      if (this.state === 'PLAYING') {
        this.serveLeft = true
        this.ball = launchBall(this.serveLeft)
      }
    }
  }

  private bouncePaddleHit(ball: PongBall, paddle: Paddle, dirX: number): void {
    const hitOffset = (ball.y - paddle.y) / (PADDLE_H / 2) // -1..1
    const bounceAngle = hitOffset * 65 * (Math.PI / 180)
    const speed = Math.min(BALL_MAX_SPEED, Math.hypot(ball.vx, ball.vy) + BALL_SPEED_INCREMENT)
    ball.vx = dirX * Math.cos(bounceAngle) * speed
    ball.vy = Math.sin(bounceAngle) * speed

    // Nudge ball out of paddle to prevent sticking
    if (dirX === 1) {
      ball.x = PADDLE_MARGIN + PADDLE_W + BALL_RADIUS + 2
    } else {
      ball.x = FIELD_W - PADDLE_MARGIN - PADDLE_W - BALL_RADIUS - 2
    }
  }

  private checkWin(): void {
    if (this.playerScore >= WIN_SCORE) {
      this.winner = 'player'
      this.state = 'GAME_OVER'
    } else if (this.aiScore >= WIN_SCORE) {
      this.winner = 'ai'
      this.state = 'GAME_OVER'
    }
  }
}
