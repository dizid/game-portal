// Pac-Man — game logic (no rendering)

import { createMaze, isWall, isDoor, countDots, T_DOT, T_PELLET, T_EMPTY, T_DOOR, COLS, ROWS } from './maze.js'
import type { TileGrid } from './maze.js'

export type GameState = 'READY' | 'PLAYING' | 'GAME_OVER' | 'LEVEL_CLEAR'
export type Direction = 'up' | 'down' | 'left' | 'right' | 'none'
export type GhostMode = 'scatter' | 'chase' | 'frightened' | 'eaten'
export type GhostName = 'blinky' | 'pinky' | 'inky' | 'clyde'

export interface Point { x: number; y: number }

export interface Ghost {
  name: GhostName
  // Pixel position (centre of character)
  px: number
  py: number
  // Grid tile (for AI)
  col: number
  row: number
  dir: Direction
  nextDir: Direction
  mode: GhostMode
  frightenedTimer: number
  flashTimer: number
  // Eaten score multiplier index
  eatIndex: number
  // Release timer (ghosts start in house)
  releaseTimer: number
  released: boolean
}

export interface GameSnapshot {
  state: GameState
  maze: TileGrid
  pacX: number
  pacY: number
  pacDir: Direction
  mouthAngle: number  // 0..1 for open/close animation
  ghosts: Ghost[]
  score: number
  lives: number
  level: number
  dotsLeft: number
  fruitActive: boolean
  fruitX: number
  fruitY: number
  fruitTimer: number
  flashLevel: boolean  // level clear white flash
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TILE = 16  // px per tile (logical grid unit)
// Pac-Man starts at tile (13.5, 23) — centre of column 13-14, row 23
const PAC_START_COL = 13
const PAC_START_ROW = 23
const PAC_SPEED = 1.6   // px per frame
const GHOST_SPEED = 1.4
const GHOST_FRIGHTENED_SPEED = 0.9
const GHOST_EATEN_SPEED = 3.0
const FRIGHTENED_DURATION = 480  // frames (~8s at 60fps)
const FRIGHTENED_FLASH_START = 120  // last 2s flash

const GHOST_START_POSITIONS: Record<GhostName, { col: number; row: number }> = {
  blinky: { col: 13, row: 11 },
  pinky:  { col: 13, row: 14 },
  inky:   { col: 11, row: 14 },
  clyde:  { col: 15, row: 14 },
}

const GHOST_RELEASE_TIMERS: Record<GhostName, number> = {
  blinky: 0,
  pinky:  120,
  inky:   240,
  clyde:  360,
}

const SCATTER_TARGETS: Record<GhostName, { col: number; row: number }> = {
  blinky: { col: 25, row: 0 },
  pinky:  { col: 2, row: 0 },
  inky:   { col: 27, row: 30 },
  clyde:  { col: 0, row: 30 },
}

// Fruit positions
const FRUIT_COL = 13
const FRUIT_ROW = 17
const FRUIT_DURATION = 600  // frames

const EAT_SCORES = [200, 400, 800, 1600]

export class PacManGame {
  private state: GameState = 'READY'
  private maze!: TileGrid
  private pacPx = 0  // pixel pos
  private pacPy = 0
  private pacDir: Direction = 'none'
  private pacNextDir: Direction = 'none'
  private mouthAngle = 0
  private mouthDir = 1
  private ghosts: Ghost[] = []
  private score = 0
  private lives = 3
  private level = 1
  private dotsLeft = 0
  private fruitActive = false
  private fruitTimer = 0
  private fruitSpawnScore = 70  // spawn after eating N dots
  private flashLevel = false
  private flashLevelTimer = 0
  private levelClearTimer = 0
  private deathTimer = 0  // pause after pac-man dies
  private globalTimer = 0

  // ghost mode schedule: [chase duration, scatter duration, ...]
  private modeSchedule = [7*60, 20*60, 7*60, 20*60, 5*60, 20*60, 5*60, 99999*60]
  private modeIndex = 0
  private modeTimer = 0
  private globalMode: 'scatter' | 'chase' = 'scatter'

  // ── Init ──────────────────────────────────────────────────────────────────────

  init(): void {
    this.reset()
  }

  reset(): void {
    this.score = 0
    this.lives = 3
    this.level = 1
    this.state = 'READY'
    this.loadLevel()
  }

  private loadLevel(): void {
    this.maze = createMaze()
    this.dotsLeft = countDots(this.maze)
    this.pacPx = (PAC_START_COL + 0.5) * TILE
    this.pacPy = (PAC_START_ROW + 0.5) * TILE
    this.pacDir = 'none'
    this.pacNextDir = 'none'
    this.mouthAngle = 0
    this.fruitActive = false
    this.fruitTimer = 0
    this.fruitSpawnScore = Math.floor(this.dotsLeft / 2)
    this.globalTimer = 0
    this.modeIndex = 0
    this.modeTimer = 0
    this.globalMode = 'scatter'
    this.flashLevel = false
    this.flashLevelTimer = 0
    this.levelClearTimer = 0
    this.deathTimer = 0
    this.initGhosts()
  }

  private initGhosts(): void {
    const names: GhostName[] = ['blinky', 'pinky', 'inky', 'clyde']
    this.ghosts = names.map((name, i) => {
      const pos = GHOST_START_POSITIONS[name]
      return {
        name,
        px: (pos.col + 0.5) * TILE,
        py: (pos.row + 0.5) * TILE,
        col: pos.col,
        row: pos.row,
        dir: 'none' as Direction,
        nextDir: 'none' as Direction,
        mode: 'scatter' as GhostMode,
        frightenedTimer: 0,
        flashTimer: 0,
        eatIndex: 0,
        releaseTimer: GHOST_RELEASE_TIMERS[name],
        released: name === 'blinky',
      }
    })
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  start(): void {
    if (this.state === 'READY') this.state = 'PLAYING'
  }

  setDirection(dir: Direction): void {
    this.pacNextDir = dir
  }

  tick(): void {
    if (this.state === 'LEVEL_CLEAR') {
      this.levelClearTimer++
      if (this.levelClearTimer > 120) {
        this.level++
        this.loadLevel()
        this.state = 'PLAYING'
      }
      return
    }

    if (this.state !== 'PLAYING') return

    // Death recovery pause
    if (this.deathTimer > 0) {
      this.deathTimer--
      if (this.deathTimer === 0) {
        if (this.lives <= 0) {
          this.state = 'GAME_OVER'
        } else {
          this.respawn()
        }
      }
      return
    }

    this.globalTimer++
    this.tickModeSchedule()
    this.tickPacMan()
    this.tickGhosts()
    this.checkCollisions()
    this.tickFruit()
    this.tickMouth()
  }

  private respawn(): void {
    this.pacPx = (PAC_START_COL + 0.5) * TILE
    this.pacPy = (PAC_START_ROW + 0.5) * TILE
    this.pacDir = 'none'
    this.pacNextDir = 'none'
    this.initGhosts()
  }

  private tickModeSchedule(): void {
    if (this.modeIndex >= this.modeSchedule.length) return
    this.modeTimer++
    if (this.modeTimer >= this.modeSchedule[this.modeIndex]) {
      this.modeTimer = 0
      this.modeIndex++
      this.globalMode = this.modeIndex % 2 === 0 ? 'scatter' : 'chase'
      // Reverse all non-frightened ghosts on mode switch
      for (const g of this.ghosts) {
        if (g.mode !== 'frightened' && g.mode !== 'eaten') {
          g.dir = reverseDir(g.dir)
          g.mode = this.globalMode
        }
      }
    }
  }

  private tickMouth(): void {
    this.mouthAngle += 0.08 * this.mouthDir
    if (this.mouthAngle >= 1) { this.mouthAngle = 1; this.mouthDir = -1 }
    if (this.mouthAngle <= 0) { this.mouthAngle = 0; this.mouthDir = 1 }
    if (this.pacDir === 'none') this.mouthAngle = 0.5
  }

  // ── Pac-Man movement ──────────────────────────────────────────────────────────

  private tickPacMan(): void {
    const speed = PAC_SPEED

    // Try to turn in requested direction
    if (this.pacNextDir !== 'none' && this.pacNextDir !== this.pacDir) {
      if (this.canMove(this.pacPx, this.pacPy, this.pacNextDir, speed, false)) {
        this.pacDir = this.pacNextDir
      }
    }

    if (this.pacDir !== 'none') {
      if (this.canMove(this.pacPx, this.pacPy, this.pacDir, speed, false)) {
        const { dx, dy } = dirToDelta(this.pacDir)
        this.pacPx += dx * speed
        this.pacPy += dy * speed
        // Wrap tunnel (row 14)
        this.pacPx = wrapX(this.pacPx)
      } else {
        // Snap to grid centre when hitting wall
        this.snapToGrid()
      }
    }

    // Eat dot/pellet at current tile
    const col = Math.floor(this.pacPx / TILE)
    const row = Math.floor(this.pacPy / TILE)
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
      const cell = this.maze.data[row][col]
      if (cell === T_DOT) {
        this.maze.data[row][col] = T_EMPTY
        this.score += 10
        this.dotsLeft--
        if (this.dotsLeft <= this.fruitSpawnScore && !this.fruitActive) {
          this.fruitActive = true
          this.fruitTimer = FRUIT_DURATION
        }
      } else if (cell === T_PELLET) {
        this.maze.data[row][col] = T_EMPTY
        this.score += 50
        this.dotsLeft--
        this.frightenGhosts()
        if (this.dotsLeft <= this.fruitSpawnScore && !this.fruitActive) {
          this.fruitActive = true
          this.fruitTimer = FRUIT_DURATION
        }
      }
    }

    if (this.dotsLeft <= 0) {
      this.state = 'LEVEL_CLEAR'
      this.levelClearTimer = 0
    }
  }

  private snapToGrid(): void {
    const { dx, dy } = dirToDelta(this.pacDir)
    if (dx !== 0) this.pacPy = Math.round(this.pacPy / TILE) * TILE + TILE / 2
    if (dy !== 0) this.pacPx = Math.round(this.pacPx / TILE) * TILE + TILE / 2
  }

  private canMove(px: number, py: number, dir: Direction, speed: number, isGhost: boolean): boolean {
    const { dx, dy } = dirToDelta(dir)
    const nx = px + dx * speed
    const ny = py + dy * speed
    const margin = TILE * 0.4  // collision margin

    // Check the tiles the entity would overlap
    const left  = Math.floor((nx - margin) / TILE)
    const right = Math.floor((nx + margin) / TILE)
    const top   = Math.floor((ny - margin) / TILE)
    const bot   = Math.floor((ny + margin) / TILE)

    for (let r = top; r <= bot; r++) {
      for (let c = left; c <= right; c++) {
        if (isWall(this.maze, c, r)) return false
        // Pac-Man can't go through ghost house door
        if (!isGhost && isDoor(this.maze, c, r)) return false
      }
    }
    return true
  }

  // ── Ghost movement ────────────────────────────────────────────────────────────

  private frightenGhosts(): void {
    for (const g of this.ghosts) {
      if (g.mode !== 'eaten') {
        g.mode = 'frightened'
        g.frightenedTimer = FRIGHTENED_DURATION
        g.dir = reverseDir(g.dir)
      }
    }
    // Reset eat chain
    for (const g of this.ghosts) g.eatIndex = 0
  }

  private tickGhosts(): void {
    const blinky = this.ghosts.find(g => g.name === 'blinky')!

    for (const ghost of this.ghosts) {
      // Release from ghost house
      if (!ghost.released) {
        ghost.releaseTimer--
        if (ghost.releaseTimer <= 0) {
          ghost.released = true
          ghost.dir = 'up'
          ghost.mode = this.globalMode
        } else {
          // Bob up/down in ghost house
          ghost.py += Math.sin(this.globalTimer * 0.05) * 0.5
          continue
        }
      }

      // Update frightened timer
      if (ghost.mode === 'frightened') {
        ghost.frightenedTimer--
        if (ghost.frightenedTimer <= 0) {
          ghost.mode = this.globalMode
        }
      }

      const speed =
        ghost.mode === 'frightened' ? GHOST_FRIGHTENED_SPEED
        : ghost.mode === 'eaten'    ? GHOST_EATEN_SPEED
        : GHOST_SPEED + this.level * 0.05

      // Choose target tile
      const target = this.getGhostTarget(ghost, blinky)

      // Move ghost: pick best direction at each tile boundary
      this.moveGhost(ghost, target, speed)

      ghost.col = Math.floor(ghost.px / TILE)
      ghost.row = Math.floor(ghost.py / TILE)
    }
  }

  private getGhostTarget(ghost: Ghost, blinky: Ghost): { col: number; row: number } {
    const pacCol = Math.floor(this.pacPx / TILE)
    const pacRow = Math.floor(this.pacPy / TILE)

    if (ghost.mode === 'frightened') {
      // Random scatter
      return { col: Math.floor(Math.random() * COLS), row: Math.floor(Math.random() * ROWS) }
    }

    if (ghost.mode === 'eaten') {
      // Head back to ghost house entrance
      return { col: 13, row: 11 }
    }

    if (ghost.mode === 'scatter') {
      return SCATTER_TARGETS[ghost.name]
    }

    // Chase modes
    switch (ghost.name) {
      case 'blinky':
        return { col: pacCol, row: pacRow }

      case 'pinky': {
        // 4 tiles ahead of pac-man
        const { dx, dy } = dirToDelta(this.pacDir)
        return { col: pacCol + dx * 4, row: pacRow + dy * 4 }
      }

      case 'inky': {
        // 2 tiles ahead of pac-man, then double from blinky
        const { dx, dy } = dirToDelta(this.pacDir)
        const pivotCol = pacCol + dx * 2
        const pivotRow = pacRow + dy * 2
        const diffCol = pivotCol - blinky.col
        const diffRow = pivotRow - blinky.row
        return { col: pivotCol + diffCol, row: pivotRow + diffRow }
      }

      case 'clyde': {
        const dist = Math.hypot(ghost.col - pacCol, ghost.row - pacRow)
        if (dist > 8) return { col: pacCol, row: pacRow }
        return SCATTER_TARGETS.clyde
      }

      default:
        return { col: pacCol, row: pacRow }
    }
  }

  private moveGhost(ghost: Ghost, target: { col: number; row: number }, speed: number): void {
    const { dx, dy } = dirToDelta(ghost.dir)
    ghost.px += dx * speed
    ghost.py += dy * speed
    ghost.px = wrapX(ghost.px)

    // At tile centre, choose new direction
    const centreX = Math.round(ghost.px / TILE) * TILE + TILE / 2
    const centreY = Math.round(ghost.py / TILE) * TILE + TILE / 2
    const distToCentre = Math.hypot(ghost.px - centreX, ghost.py - centreY)

    // Snapping tolerance proportional to speed
    if (distToCentre < speed + 0.5) {
      ghost.px = centreX
      ghost.py = centreY

      const col = Math.round((ghost.px - TILE / 2) / TILE)
      const row = Math.round((ghost.py - TILE / 2) / TILE)

      const dirs: Direction[] = ['up', 'left', 'down', 'right']
      const reverse = reverseDir(ghost.dir)
      let bestDir: Direction = ghost.dir
      let bestDist = Infinity

      for (const d of dirs) {
        if (d === reverse) continue  // can't reverse (except at start)
        const { dx: ddx, dy: ddy } = dirToDelta(d)
        const nc = col + ddx
        const nr = row + ddy

        if (isWall(this.maze, nc, nr)) continue
        // Ghost house door: only eaten ghosts can enter, ghosts coming out ignore it
        if (isDoor(this.maze, nc, nr) && ghost.mode !== 'eaten') continue

        const dist = Math.hypot(nc - target.col, nr - target.row)
        if (dist < bestDist) {
          bestDist = dist
          bestDir = d
        }
      }

      ghost.dir = bestDir
    }
  }

  // ── Collisions ────────────────────────────────────────────────────────────────

  private checkCollisions(): void {
    const pacCol = Math.floor(this.pacPx / TILE)
    const pacRow = Math.floor(this.pacPy / TILE)

    for (const g of this.ghosts) {
      if (!g.released) continue
      const dist = Math.hypot(this.pacPx - g.px, this.pacPy - g.py)
      if (dist > TILE * 0.7) continue

      if (g.mode === 'frightened') {
        // Eat ghost
        const idx = g.eatIndex
        this.score += EAT_SCORES[Math.min(idx, EAT_SCORES.length - 1)]
        g.eatIndex++
        g.mode = 'eaten'
        g.frightenedTimer = 0
        // Bump other frightened ghosts' eatIndex
        for (const other of this.ghosts) {
          if (other !== g && other.mode === 'frightened') other.eatIndex = g.eatIndex
        }
      } else if (g.mode !== 'eaten') {
        // Player hit
        this.lives--
        this.deathTimer = 90  // brief pause before respawn
      }
    }

    // Fruit
    if (this.fruitActive) {
      const fc = FRUIT_COL
      const fr = FRUIT_ROW
      if (Math.abs(pacCol - fc) <= 1 && Math.abs(pacRow - fr) <= 1) {
        this.score += 100 + this.level * 50
        this.fruitActive = false
      }
    }
    void pacRow
  }

  private tickFruit(): void {
    if (this.fruitActive) {
      this.fruitTimer--
      if (this.fruitTimer <= 0) this.fruitActive = false
    }
  }

  // ── Getters ───────────────────────────────────────────────────────────────────

  getState(): GameState { return this.state }
  getScore(): number { return this.score }
  getLives(): number { return this.lives }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      maze: this.maze,
      pacX: this.pacPx,
      pacY: this.pacPy,
      pacDir: this.pacDir,
      mouthAngle: this.mouthAngle,
      ghosts: this.ghosts.map(g => ({ ...g })),
      score: this.score,
      lives: this.lives,
      level: this.level,
      dotsLeft: this.dotsLeft,
      fruitActive: this.fruitActive,
      fruitX: (FRUIT_COL + 0.5) * TILE,
      fruitY: (FRUIT_ROW + 0.5) * TILE,
      fruitTimer: this.fruitTimer,
      flashLevel: this.flashLevel,
    }
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function dirToDelta(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case 'up':    return { dx: 0, dy: -1 }
    case 'down':  return { dx: 0, dy: 1 }
    case 'left':  return { dx: -1, dy: 0 }
    case 'right': return { dx: 1, dy: 0 }
    default:      return { dx: 0, dy: 0 }
  }
}

function reverseDir(dir: Direction): Direction {
  switch (dir) {
    case 'up':    return 'down'
    case 'down':  return 'up'
    case 'left':  return 'right'
    case 'right': return 'left'
    default:      return 'none'
  }
}

function wrapX(px: number): number {
  const totalWidth = COLS * TILE
  if (px < -TILE) return totalWidth + px
  if (px > totalWidth + TILE) return px - totalWidth
  return px
}
