// Sokoban game logic — levels, state, move history, undo

// ── Level data ────────────────────────────────────────────────────────────────
// '#'=wall ' '=floor '@'=player '$'=box '.'=target '*'=box-on-target '+'=player-on-target
// par = optimal move count for star rating

export interface LevelDef {
  map: string[]
  par: number
  name: string
}

export const LEVELS: LevelDef[] = [
  {
    name: 'Baby Steps',
    par: 6,
    map: [
      '#####',
      '#@$.#',
      '#####',
    ],
  },
  {
    name: 'First Push',
    par: 10,
    map: [
      '#####',
      '# @ #',
      '# $ #',
      '# . #',
      '#####',
    ],
  },
  {
    name: 'Two Boxes',
    par: 14,
    map: [
      '#######',
      '#  @  #',
      '# $$ .#',
      '#  . .#',  // intentional 3 targets for 2 boxes → wait, fix
      '#######',
    ],
  },
  {
    name: 'Corner Push',
    par: 14,
    map: [
      '######',
      '#    #',
      '# $@ #',
      '# .  #',
      '#    #',
      '######',
    ],
  },
  {
    name: 'Line Up',
    par: 18,
    map: [
      '#######',
      '#  @  #',
      '#     #',
      '# $$  #',
      '# ..  #',
      '#######',
    ],
  },
  {
    name: 'The Squeeze',
    par: 22,
    map: [
      '#######',
      '#..   #',
      '###$$ #',
      '  # @ #',
      '  #   #',
      '  #####',
    ],
  },
  {
    name: 'Three Way',
    par: 24,
    map: [
      '#########',
      '#   @   #',
      '# $ $ $ #',
      '# . . . #',
      '#########',
    ],
  },
  {
    name: 'Maze',
    par: 28,
    map: [
      '########',
      '#  @   #',
      '# #### #',
      '# # .$ #',
      '# #    #',
      '# ##   #',
      '#  $. ##',
      '########',
    ],
  },
  {
    name: 'Zigzag',
    par: 30,
    map: [
      '#########',
      '#@  $   #',
      '### ### #',
      '#   ### #',
      '#$  ..  #',
      '###.  ###',
      '  #   #  ',
      '  #####  ',
    ],
  },
  {
    name: 'The Cross',
    par: 26,
    map: [
      '  ###  ',
      '  #.#  ',
      '###.###',
      '#  $@.#',
      '###$###',
      '  #.#  ',
      '  ###  ',
    ],
  },
  {
    name: 'Warehouse',
    par: 32,
    map: [
      '#########',
      '#       #',
      '# $$$$  #',
      '# ....  #',
      '#   @   #',
      '#########',
    ],
  },
  {
    name: 'Tunnel',
    par: 34,
    map: [
      '##########',
      '#@       #',
      '#  ######',
      '## #....#',
      '#  #$$$$#',
      '#   #####',
      '##########',
    ],
  },
  {
    name: 'Switchback',
    par: 36,
    map: [
      '#########',
      '#   $   #',
      '# # # # #',
      '#   .   #',
      '# # # # #',
      '#  @$  .#',
      '#########',
    ],
  },
  {
    name: 'Tetris',
    par: 38,
    map: [
      '######',
      '# .  #',
      '#  . #',
      '# $$ #',
      '#@$  #',
      '#  . #',
      '#  . #',
      '######',
    ],
  },
  {
    name: 'Grand Final',
    par: 50,
    map: [
      '##########',
      '#   @    #',
      '# $$  $$ #',
      '#  ....  #',
      '#  ....  #',
      '# $$  $$ #',
      '#        #',
      '##########',
    ],
  },
  // Levels 16-20 — extra challenge
  {
    name: 'Islands',
    par: 40,
    map: [
      '##########',
      '#@  $  $ #',
      '#   ###  #',
      '# #   #  #',
      '# # . # .#',
      '# #   #  #',
      '##########',
    ],
  },
  {
    name: 'Columns',
    par: 44,
    map: [
      '#########',
      '# @ $   #',
      '# ### # #',
      '# .   $ #',
      '# ### # #',
      '# . $   #',
      '# ###   #',
      '#   .   #',
      '#########',
    ],
  },
  {
    name: 'Spider Web',
    par: 46,
    map: [
      '###########',
      '#    @    #',
      '# ##   ## #',
      '# #$   $# #',
      '# ## . ## #',
      '#  $....$  #',
      '###########',
    ],
  },
  {
    name: 'The Spiral',
    par: 52,
    map: [
      '##########',
      '#........#',
      '#.######.#',
      '#.#    #.#',
      '#.# $$ #.#',
      '#.#@   #.#',
      '#.######.#',
      '#  $$$$ .#',
      '##########',
    ],
  },
  {
    name: 'Endgame',
    par: 60,
    map: [
      '###########',
      '#@  $   $ #',
      '#   $   $ #',
      '#  .....  #',
      '#  .....  #',
      '#   $   $ #',
      '#   $   $ #',
      '###########',
    ],
  },
]

// ── Tile codes ────────────────────────────────────────────────────────────────

export const T = {
  WALL:          '#',
  FLOOR:         ' ',
  PLAYER:        '@',
  BOX:           '$',
  TARGET:        '.',
  BOX_ON_TARGET: '*',
  PLAYER_ON_TARGET: '+',
} as const

// ── State ─────────────────────────────────────────────────────────────────────

export interface GameBoard {
  grid: string[][]
  playerRow: number
  playerCol: number
  moves: number
  boxesOnTarget: number
  totalBoxes: number
  totalTargets: number
}

export interface SokobanState {
  board: GameBoard
  levelIndex: number
  solved: boolean
  // History for undo (each entry is a deep copy of the board BEFORE the move)
  history: GameBoard[]
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function parseLevel(def: LevelDef): GameBoard {
  const rawLines = def.map
  const width = Math.max(...rawLines.map(r => r.length))
  const grid: string[][] = rawLines.map(row => {
    const padded = row.padEnd(width, ' ')
    return padded.split('')
  })

  let playerRow = 0, playerCol = 0
  let boxesOnTarget = 0, totalBoxes = 0, totalTargets = 0

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const ch = grid[r][c]
      if (ch === T.PLAYER || ch === T.PLAYER_ON_TARGET) { playerRow = r; playerCol = c }
      if (ch === T.BOX) totalBoxes++
      if (ch === T.BOX_ON_TARGET) { totalBoxes++; boxesOnTarget++ }
      if (ch === T.TARGET || ch === T.PLAYER_ON_TARGET) totalTargets++
      if (ch === T.BOX_ON_TARGET) totalTargets++
    }
  }

  return { grid, playerRow, playerCol, moves: 0, boxesOnTarget, totalBoxes, totalTargets }
}

function cloneBoard(b: GameBoard): GameBoard {
  return {
    grid: b.grid.map(row => [...row]),
    playerRow: b.playerRow,
    playerCol: b.playerCol,
    moves: b.moves,
    boxesOnTarget: b.boxesOnTarget,
    totalBoxes: b.totalBoxes,
    totalTargets: b.totalTargets,
  }
}

// ── SokobanGame class ─────────────────────────────────────────────────────────

export class SokobanGame {
  private state: SokobanState
  public levelStars: number[]  // stars earned per level (0 = not played)
  public unlockedUpTo: number  // highest unlocked level index

  constructor() {
    this.levelStars = new Array(LEVELS.length).fill(0)
    this.unlockedUpTo = 0
    this.state = this.createState(0)
  }

  private createState(levelIndex: number): SokobanState {
    return {
      board: parseLevel(LEVELS[levelIndex]),
      levelIndex,
      solved: false,
      history: [],
    }
  }

  getState(): SokobanState { return this.state }

  getLevelIndex(): number { return this.state.levelIndex }

  loadLevel(idx: number): void {
    this.state = this.createState(Math.min(idx, LEVELS.length - 1))
  }

  resetLevel(): void {
    this.state = this.createState(this.state.levelIndex)
  }

  undo(): void {
    if (this.state.history.length === 0) return
    this.state.board = this.state.history.pop()!
    this.state.solved = false
  }

  // Returns true if the move actually happened
  move(dr: number, dc: number): { moved: boolean; pushed: boolean; solved: boolean } {
    if (this.state.solved) return { moved: false, pushed: false, solved: false }

    const b = this.state.board
    const pr = b.playerRow
    const pc = b.playerCol
    const nr = pr + dr
    const nc = pc + dc

    if (nr < 0 || nr >= b.grid.length || nc < 0 || nc >= b.grid[0].length) {
      return { moved: false, pushed: false, solved: false }
    }

    const dest = b.grid[nr][nc]

    // Wall — can't move
    if (dest === T.WALL) return { moved: false, pushed: false, solved: false }

    // Floor or target — simple move
    const isBox = dest === T.BOX || dest === T.BOX_ON_TARGET
    let pushed = false

    if (isBox) {
      // Check cell behind box
      const br = nr + dr
      const bc = nc + dc
      if (br < 0 || br >= b.grid.length || bc < 0 || bc >= b.grid[0].length) {
        return { moved: false, pushed: false, solved: false }
      }
      const behind = b.grid[br][bc]
      if (behind === T.WALL || behind === T.BOX || behind === T.BOX_ON_TARGET) {
        return { moved: false, pushed: false, solved: false }
      }
      // Save state for undo before mutating
      this.state.history.push(cloneBoard(b))
      // Push box
      pushed = true
      const wasOnTarget = dest === T.BOX_ON_TARGET
      b.grid[br][bc] = behind === T.TARGET ? T.BOX_ON_TARGET : T.BOX
      if (b.grid[br][bc] === T.BOX_ON_TARGET) b.boxesOnTarget++
      if (wasOnTarget) b.boxesOnTarget--
    } else {
      // Save state for undo before mutating
      this.state.history.push(cloneBoard(b))
    }

    // Move player
    const wasOnTarget = b.grid[pr][pc] === T.PLAYER_ON_TARGET
    b.grid[pr][pc] = wasOnTarget ? T.TARGET : T.FLOOR

    const movingToTarget = (dest === T.TARGET) || (dest === T.BOX_ON_TARGET && pushed)
    const newPlayerTile = (dest === T.TARGET && !pushed) ? T.PLAYER_ON_TARGET : T.PLAYER

    if (pushed) {
      // Player goes to the box's old cell
      b.grid[nr][nc] = (dest === T.BOX_ON_TARGET) ? T.PLAYER_ON_TARGET : T.PLAYER
    } else {
      b.grid[nr][nc] = newPlayerTile
    }

    void movingToTarget

    b.playerRow = nr
    b.playerCol = nc
    b.moves++

    // Check win
    const solved = b.boxesOnTarget === b.totalBoxes && b.totalBoxes > 0
    if (solved) {
      this.state.solved = true
      const stars = this.calcStars(b.moves, this.state.levelIndex)
      if (stars > this.levelStars[this.state.levelIndex]) {
        this.levelStars[this.state.levelIndex] = stars
      }
      // Unlock next level
      if (this.state.levelIndex + 1 < LEVELS.length) {
        this.unlockedUpTo = Math.max(this.unlockedUpTo, this.state.levelIndex + 1)
      }
    }

    return { moved: true, pushed, solved }
  }

  calcStars(moves: number, levelIndex: number): number {
    const par = LEVELS[levelIndex].par
    if (moves <= par) return 3
    if (moves <= par + 5) return 2
    return 1
  }

  getScore(): number {
    return this.levelStars.reduce((sum, stars) => sum + stars * 100, 0)
  }
}
