// Platformer game logic — physics, levels, entities

// ── Types ────────────────────────────────────────────────────────────────────

export interface Rect { x: number; y: number; w: number; h: number }
export interface Platform extends Rect { color?: string }
export interface Coin { x: number; y: number; r: number; collected: boolean; bobOffset: number }
export interface Spike extends Rect {}
export interface Exit extends Rect {}

export interface LevelDef {
  platforms: Platform[]
  coins: Array<{ x: number; y: number }>
  spikes: Spike[]
  exit: Exit
  playerStart: { x: number; y: number }
  width: number   // total level width in pixels
  height: number  // total level height in pixels
}

export interface Player {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  facingRight: boolean
  dead: boolean
  // Animation
  legAnim: number
}

export type GameState = 'READY' | 'PLAYING' | 'DEAD' | 'LEVEL_COMPLETE' | 'WIN'

export interface Snapshot {
  state: GameState
  player: Player
  level: LevelDef
  coins: Coin[]
  score: number
  lives: number
  levelIndex: number
  cameraX: number
  time: number          // frames elapsed this level
  levelCompleteTimer: number
  deadTimer: number
}

// ── Level definitions ─────────────────────────────────────────────────────────

// Tile size = 32px. Levels scroll horizontally.
// Platforms defined as pixel rects. Level dimensions set per level.

function mkPlat(x: number, y: number, w: number, h: number = 20): Platform {
  return { x, y, w, h }
}

function mkSpike(x: number, y: number, w: number = 20, h: number = 16): Spike {
  return { x, y, w, h }
}

const LEVELS: LevelDef[] = [
  // Level 1 — Introduction
  {
    width: 1600, height: 400,
    playerStart: { x: 60, y: 280 },
    exit: { x: 1520, y: 300, w: 32, h: 48 },
    platforms: [
      mkPlat(0, 340, 300), mkPlat(340, 300, 120), mkPlat(500, 260, 100),
      mkPlat(640, 300, 160), mkPlat(840, 260, 100), mkPlat(980, 300, 180),
      mkPlat(1200, 260, 160), mkPlat(1400, 300, 220),
    ],
    coins: [
      { x: 180, y: 310 }, { x: 390, y: 270 }, { x: 550, y: 230 },
      { x: 680, y: 270 }, { x: 880, y: 230 }, { x: 1050, y: 270 },
      { x: 1280, y: 230 }, { x: 1460, y: 270 },
    ],
    spikes: [],
  },
  // Level 2 — First hazards
  {
    width: 1800, height: 400,
    playerStart: { x: 60, y: 280 },
    exit: { x: 1720, y: 260, w: 32, h: 48 },
    platforms: [
      mkPlat(0, 340, 260), mkPlat(300, 300, 100), mkPlat(440, 260, 80),
      mkPlat(560, 300, 80), mkPlat(680, 260, 120), mkPlat(840, 220, 100),
      mkPlat(980, 260, 100), mkPlat(1120, 300, 140), mkPlat(1300, 260, 120),
      mkPlat(1460, 220, 100), mkPlat(1600, 260, 240),
    ],
    coins: [
      { x: 160, y: 310 }, { x: 350, y: 270 }, { x: 470, y: 230 },
      { x: 610, y: 270 }, { x: 740, y: 230 }, { x: 880, y: 190 },
      { x: 1020, y: 230 }, { x: 1180, y: 270 }, { x: 1360, y: 230 },
      { x: 1500, y: 190 }, { x: 1680, y: 230 },
    ],
    spikes: [
      mkSpike(330, 324, 30), mkSpike(850, 204, 24), mkSpike(1160, 284, 24),
    ],
  },
  // Level 3 — Vertical challenge
  {
    width: 2000, height: 500,
    playerStart: { x: 60, y: 380 },
    exit: { x: 1920, y: 180, w: 32, h: 48 },
    platforms: [
      mkPlat(0, 440, 220), mkPlat(260, 380, 80), mkPlat(380, 320, 80),
      mkPlat(500, 260, 80), mkPlat(620, 200, 80), mkPlat(740, 260, 80),
      mkPlat(860, 200, 80), mkPlat(980, 260, 100), mkPlat(1120, 300, 120),
      mkPlat(1280, 240, 100), mkPlat(1420, 180, 100), mkPlat(1560, 220, 120),
      mkPlat(1720, 180, 120), mkPlat(1880, 180, 160),
    ],
    coins: [
      { x: 120, y: 410 }, { x: 300, y: 350 }, { x: 420, y: 290 },
      { x: 540, y: 230 }, { x: 660, y: 170 }, { x: 780, y: 230 },
      { x: 900, y: 170 }, { x: 1040, y: 230 }, { x: 1200, y: 270 },
      { x: 1360, y: 210 }, { x: 1500, y: 150 }, { x: 1640, y: 190 },
      { x: 1800, y: 150 },
    ],
    spikes: [
      mkSpike(520, 244, 20), mkSpike(740, 244, 20), mkSpike(1160, 284, 40),
      mkSpike(1560, 204, 30),
    ],
  },
  // Level 4 — Spike gauntlet
  {
    width: 2200, height: 420,
    playerStart: { x: 60, y: 300 },
    exit: { x: 2120, y: 220, w: 32, h: 48 },
    platforms: [
      mkPlat(0, 360, 200), mkPlat(240, 320, 60), mkPlat(340, 280, 60),
      mkPlat(440, 240, 60), mkPlat(540, 280, 60), mkPlat(640, 320, 60),
      mkPlat(740, 280, 80), mkPlat(860, 240, 80), mkPlat(980, 280, 80),
      mkPlat(1100, 240, 100), mkPlat(1240, 280, 100), mkPlat(1380, 240, 100),
      mkPlat(1520, 200, 120), mkPlat(1680, 240, 120), mkPlat(1840, 220, 120),
      mkPlat(2000, 220, 240),
    ],
    coins: [
      { x: 120, y: 330 }, { x: 270, y: 290 }, { x: 370, y: 250 },
      { x: 470, y: 210 }, { x: 570, y: 250 }, { x: 670, y: 290 },
      { x: 800, y: 210 }, { x: 940, y: 250 }, { x: 1150, y: 210 },
      { x: 1440, y: 210 }, { x: 1600, y: 170 }, { x: 1760, y: 210 },
      { x: 2080, y: 190 },
    ],
    spikes: [
      mkSpike(270, 344, 40), mkSpike(500, 264, 20), mkSpike(740, 264, 30),
      mkSpike(1000, 264, 20), mkSpike(1200, 264, 30), mkSpike(1700, 224, 30),
    ],
  },
  // Level 5 — Wide platforms + many coins
  {
    width: 2400, height: 420,
    playerStart: { x: 60, y: 300 },
    exit: { x: 2320, y: 200, w: 32, h: 48 },
    platforms: [
      mkPlat(0, 360, 300), mkPlat(340, 320, 200), mkPlat(580, 280, 200),
      mkPlat(820, 240, 200), mkPlat(1060, 280, 200), mkPlat(1300, 240, 200),
      mkPlat(1540, 200, 200), mkPlat(1780, 240, 200), mkPlat(2020, 220, 200),
      mkPlat(2260, 220, 200),
    ],
    coins: [
      { x: 80, y: 330 }, { x: 160, y: 330 }, { x: 240, y: 330 },
      { x: 380, y: 290 }, { x: 460, y: 290 }, { x: 540, y: 290 },
      { x: 620, y: 250 }, { x: 700, y: 250 }, { x: 780, y: 250 },
      { x: 860, y: 210 }, { x: 940, y: 210 }, { x: 1020, y: 210 },
      { x: 1100, y: 250 }, { x: 1180, y: 250 }, { x: 1260, y: 250 },
      { x: 1340, y: 210 }, { x: 1420, y: 210 }, { x: 1500, y: 210 },
      { x: 1580, y: 170 }, { x: 1660, y: 170 }, { x: 1820, y: 210 },
      { x: 1900, y: 210 }, { x: 2060, y: 190 }, { x: 2140, y: 190 },
      { x: 2300, y: 190 }, { x: 2380, y: 190 },
    ],
    spikes: [
      mkSpike(360, 344, 40), mkSpike(850, 224, 30), mkSpike(1320, 224, 30),
      mkSpike(1700, 224, 30), mkSpike(1970, 204, 30),
    ],
  },
  // Level 6-10 — Progressive difficulty reusing patterns
  ...Array.from({ length: 5 }, (_, i): LevelDef => {
    const lw = 2200 + i * 200
    return {
      width: lw, height: 420,
      playerStart: { x: 60, y: 300 },
      exit: { x: lw - 80, y: 200, w: 32, h: 48 },
      platforms: [
        mkPlat(0, 360, 180),
        ...Array.from({ length: 14 + i * 2 }, (_, j) => {
          const x = 220 + j * (90 + i * 5)
          const y = 180 + Math.sin(j * 0.9 + i) * 80
          return mkPlat(x, Math.round(y / 20) * 20, 70 + (j % 3) * 20)
        }),
        mkPlat(lw - 160, 200, 200),
      ],
      coins: Array.from({ length: 10 + i * 2 }, (_, j) => ({
        x: 160 + j * (100 + i * 8),
        y: 200 + Math.sin(j * 1.1 + i) * 60,
      })),
      spikes: Array.from({ length: 3 + i }, (_, j) => {
        const x = 300 + j * (200 + i * 20)
        return mkSpike(x, 344, 24 + i * 4)
      }),
    }
  }),
]

// ── Physics constants ─────────────────────────────────────────────────────────

const GRAVITY   = 0.5
const JUMP_VEL  = -10
const MOVE_SPEED = 4
const PLAYER_W  = 20
const PLAYER_H  = 20
const COIN_R    = 8

// ── AABB collision ─────────────────────────────────────────────────────────────

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y
}

// ── PlatformerGame class ──────────────────────────────────────────────────────

export class PlatformerGame {
  private state: GameState = 'READY'
  private player!: Player
  private coins: Coin[] = []
  private score = 0
  private lives = 3
  private levelIndex = 0
  private cameraX = 0
  private time = 0
  private levelCompleteTimer = 0
  private deadTimer = 0
  private t = 0 // global frame counter for animations

  constructor() {
    this.loadLevel(0)
  }

  private get level(): LevelDef {
    return LEVELS[this.levelIndex]
  }

  private loadLevel(idx: number): void {
    this.levelIndex = Math.min(idx, LEVELS.length - 1)
    const start = LEVELS[this.levelIndex].playerStart
    this.player = {
      x: start.x, y: start.y,
      vx: 0, vy: 0,
      onGround: false,
      facingRight: true,
      dead: false,
      legAnim: 0,
    }
    this.coins = LEVELS[this.levelIndex].coins.map((c, i) => ({
      x: c.x, y: c.y, r: COIN_R,
      collected: false,
      bobOffset: i * 0.4,
    }))
    this.cameraX = 0
    this.time = 0
    this.levelCompleteTimer = 0
    this.deadTimer = 0
  }

  getState(): GameState { return this.state }
  getScore(): number { return this.score }

  start(): void {
    this.state = 'PLAYING'
  }

  reset(): void {
    this.score = 0
    this.lives = 3
    this.levelIndex = 0
    this.loadLevel(0)
    this.state = 'READY'
  }

  // Input state (set externally each frame)
  inputLeft = false
  inputRight = false
  inputJump = false
  private jumpConsumed = false

  tick(): void {
    if (this.state !== 'PLAYING') return

    this.t++
    this.time++

    const p = this.player
    const level = this.level

    // ── Level complete countdown ───────────────────────────────────────────
    if (this.state === 'PLAYING' && this.levelCompleteTimer > 0) {
      this.levelCompleteTimer--
      if (this.levelCompleteTimer <= 0) {
        if (this.levelIndex + 1 >= LEVELS.length) {
          this.state = 'WIN'
        } else {
          this.loadLevel(this.levelIndex + 1)
          this.state = 'PLAYING'
        }
      }
      return
    }

    // ── Dead timer ────────────────────────────────────────────────────────
    if (p.dead) {
      this.deadTimer--
      if (this.deadTimer <= 0) {
        if (this.lives <= 0) {
          this.state = 'DEAD'
        } else {
          // Respawn on current level
          this.loadLevel(this.levelIndex)
          this.state = 'PLAYING'
        }
      }
      return
    }

    // ── Horizontal movement ────────────────────────────────────────────────
    p.vx = 0
    if (this.inputLeft)  { p.vx = -MOVE_SPEED; p.facingRight = false }
    if (this.inputRight) { p.vx =  MOVE_SPEED; p.facingRight = true  }

    if (p.vx !== 0) {
      p.legAnim = (p.legAnim + 1) % 12
    }

    // ── Jump ──────────────────────────────────────────────────────────────
    if (this.inputJump && !this.jumpConsumed && p.onGround) {
      p.vy = JUMP_VEL
      p.onGround = false
      this.jumpConsumed = true
    }
    if (!this.inputJump) this.jumpConsumed = false

    // ── Gravity ───────────────────────────────────────────────────────────
    p.vy += GRAVITY
    const maxFall = 14
    if (p.vy > maxFall) p.vy = maxFall

    // ── Move X, then resolve horizontal platform collisions ───────────────
    p.x += p.vx
    // Clamp to level width
    if (p.x < 0) p.x = 0
    if (p.x + PLAYER_W > level.width) p.x = level.width - PLAYER_W

    for (const plat of level.platforms) {
      const pr: Rect = { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H }
      if (rectsOverlap(pr, plat)) {
        if (p.vx > 0) p.x = plat.x - PLAYER_W
        else if (p.vx < 0) p.x = plat.x + plat.w
        p.vx = 0
      }
    }

    // ── Move Y, then resolve vertical platform collisions ─────────────────
    p.onGround = false
    p.y += p.vy

    for (const plat of level.platforms) {
      const pr: Rect = { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H }
      if (rectsOverlap(pr, plat)) {
        if (p.vy > 0) {
          // Landing on top
          p.y = plat.y - PLAYER_H
          p.vy = 0
          p.onGround = true
        } else if (p.vy < 0) {
          // Hitting ceiling
          p.y = plat.y + plat.h
          p.vy = 0
        }
      }
    }

    // ── Fell off bottom ───────────────────────────────────────────────────
    if (p.y > level.height + 100) {
      this.killPlayer()
      return
    }

    // ── Coin collection ───────────────────────────────────────────────────
    for (const coin of this.coins) {
      if (coin.collected) continue
      const dx = (p.x + PLAYER_W / 2) - coin.x
      const dy = (p.y + PLAYER_H / 2) - coin.y
      if (Math.sqrt(dx * dx + dy * dy) < coin.r + PLAYER_W / 2) {
        coin.collected = true
        this.score += 10
      }
    }

    // ── Spike collision ───────────────────────────────────────────────────
    const pr: Rect = { x: p.x + 2, y: p.y + 2, w: PLAYER_W - 4, h: PLAYER_H - 4 }
    for (const spike of level.spikes) {
      if (rectsOverlap(pr, spike)) {
        this.killPlayer()
        return
      }
    }

    // ── Exit reached ──────────────────────────────────────────────────────
    const exitRect: Rect = { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H }
    if (rectsOverlap(exitRect, level.exit)) {
      // Time bonus: max 500 pts, decays over 600 frames
      const timeBonus = Math.max(0, Math.floor((1 - this.time / 1200) * 500))
      this.score += 100 + timeBonus
      this.levelCompleteTimer = 60 // 1 second at 60fps
    }

    // ── Camera: follow player horizontally ────────────────────────────────
    // Keep player at ~40% from left edge
    const viewW = 480 // logical canvas width
    const targetCam = p.x - viewW * 0.4
    this.cameraX += (targetCam - this.cameraX) * 0.15
    this.cameraX = Math.max(0, Math.min(this.cameraX, level.width - viewW))
  }

  private killPlayer(): void {
    this.player.dead = true
    this.lives--
    this.deadTimer = 50
  }

  getSnapshot(): Snapshot {
    return {
      state: this.state,
      player: { ...this.player },
      level: this.level,
      coins: this.coins.map(c => ({ ...c })),
      score: this.score,
      lives: this.lives,
      levelIndex: this.levelIndex,
      cameraX: this.cameraX,
      time: this.time,
      levelCompleteTimer: this.levelCompleteTimer,
      deadTimer: this.deadTimer,
    }
  }

  getT(): number { return this.t }
}
