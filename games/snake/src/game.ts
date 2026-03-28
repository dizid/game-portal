// Core Snake game logic — no rendering, no DOM, pure state machine

export interface Point {
  x: number
  y: number
}

export type Direction = 'up' | 'down' | 'left' | 'right'

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER'

export interface GameSnapshot {
  snake: Point[]
  food: Point
  direction: Direction
  score: number
  state: GameState
  gridSize: number
  foodsEaten: number
  tickMs: number
}

// Speed configuration
const BASE_TICK_MS = 150
const MIN_TICK_MS = 60
const SPEED_UP_EVERY = 5   // foods eaten before each speed increase
const SPEED_STEP_MS = 10   // ms to remove per level
const POINTS_PER_FOOD = 10

export class SnakeGame {
  readonly gridSize: number

  private snake: Point[] = []
  private food: Point = { x: 0, y: 0 }
  private direction: Direction = 'right'
  private nextDirection: Direction = 'right'
  private score: number = 0
  private state: GameState = 'READY'
  private foodsEaten: number = 0
  private tickMs: number = BASE_TICK_MS

  constructor(gridSize: number = 20) {
    this.gridSize = gridSize
    this.initSnake()
    this.spawnFood()
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private initSnake(): void {
    // Start in the centre moving right, 3 segments long
    const mid = Math.floor(this.gridSize / 2)
    this.snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ]
    this.direction = 'right'
    this.nextDirection = 'right'
  }

  private spawnFood(): void {
    // Keep regenerating until food lands on an empty cell
    let candidate: Point
    do {
      candidate = {
        x: Math.floor(Math.random() * this.gridSize),
        y: Math.floor(Math.random() * this.gridSize),
      }
    } while (this.snake.some((seg) => seg.x === candidate.x && seg.y === candidate.y))
    this.food = candidate
  }

  private isOpposite(a: Direction, b: Direction): boolean {
    return (
      (a === 'up' && b === 'down') ||
      (a === 'down' && b === 'up') ||
      (a === 'left' && b === 'right') ||
      (a === 'right' && b === 'left')
    )
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Advance the game by one tick. Returns true if the game just ended. */
  tick(): boolean {
    if (this.state !== 'PLAYING') return false

    // Commit the queued direction (180° turns are blocked)
    this.direction = this.nextDirection

    const head = this.snake[0]
    const newHead: Point = { x: head.x, y: head.y }

    switch (this.direction) {
      case 'up':    newHead.y -= 1; break
      case 'down':  newHead.y += 1; break
      case 'left':  newHead.x -= 1; break
      case 'right': newHead.x += 1; break
    }

    // Wall collision
    if (
      newHead.x < 0 ||
      newHead.x >= this.gridSize ||
      newHead.y < 0 ||
      newHead.y >= this.gridSize
    ) {
      this.state = 'GAME_OVER'
      return true
    }

    // Self collision (skip the tail since it will move away)
    const bodyWithoutTail = this.snake.slice(0, this.snake.length - 1)
    if (bodyWithoutTail.some((seg) => seg.x === newHead.x && seg.y === newHead.y)) {
      this.state = 'GAME_OVER'
      return true
    }

    // Move: prepend new head
    this.snake.unshift(newHead)

    // Food eaten?
    if (newHead.x === this.food.x && newHead.y === this.food.y) {
      this.score += POINTS_PER_FOOD
      this.foodsEaten += 1
      // Grow: don't pop the tail this tick
      this.spawnFood()
      // Increase speed every N foods, down to the minimum
      if (this.foodsEaten % SPEED_UP_EVERY === 0) {
        this.tickMs = Math.max(MIN_TICK_MS, this.tickMs - SPEED_STEP_MS)
      }
    } else {
      // Normal move: remove tail
      this.snake.pop()
    }

    return false
  }

  /** Queue a direction change. Ignores 180° reversals. */
  handleInput(direction: Direction): void {
    if (this.isOpposite(direction, this.direction)) return
    this.nextDirection = direction
  }

  /** Reset the game back to READY state. */
  reset(): void {
    this.score = 0
    this.foodsEaten = 0
    this.tickMs = BASE_TICK_MS
    this.initSnake()
    this.spawnFood()
    this.state = 'READY'
  }

  /** Transition from READY → PLAYING. */
  start(): void {
    if (this.state === 'READY') {
      this.state = 'PLAYING'
    }
  }

  getScore(): number {
    return this.score
  }

  getState(): GameState {
    return this.state
  }

  getTickMs(): number {
    return this.tickMs
  }

  getFoodsEaten(): number {
    return this.foodsEaten
  }

  /** Return a read-only snapshot for the renderer. */
  getSnapshot(): GameSnapshot {
    return {
      snake: this.snake.map((p) => ({ ...p })),
      food: { ...this.food },
      direction: this.direction,
      score: this.score,
      state: this.state,
      gridSize: this.gridSize,
      foodsEaten: this.foodsEaten,
      tickMs: this.tickMs,
    }
  }
}
