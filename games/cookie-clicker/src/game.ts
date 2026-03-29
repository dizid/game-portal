// Cookie Clicker — pure idle game logic

export interface BuildingDef {
  id: string
  name: string
  icon: string
  baseCost: number
  baseCps: number    // cookies per second added per owned building
  description: string
}

export interface BuildingState {
  def: BuildingDef
  owned: number
  cost: number      // current cost (scales with owned count)
}

export interface CookieGame {
  cookies: number          // current cookies (fractional allowed)
  totalBaked: number       // all-time cookies produced
  buildings: BuildingState[]
  cps: number              // total cookies per second
}

// ── Building definitions ───────────────────────────────────────────────────────

export const BUILDING_DEFS: BuildingDef[] = [
  { id: 'cursor',  name: 'Cursor',  icon: '🖱️',  baseCost: 15,      baseCps: 0.1,  description: 'Auto-clicks the cookie' },
  { id: 'grandma', name: 'Grandma', icon: '👵',  baseCost: 100,     baseCps: 1,    description: 'Bakes cookies lovingly' },
  { id: 'farm',    name: 'Farm',    icon: '🌾',  baseCost: 1100,    baseCps: 8,    description: 'Grows cookie plants' },
  { id: 'factory', name: 'Factory', icon: '🏭',  baseCost: 12000,   baseCps: 47,   description: 'Industrial production' },
  { id: 'bank',    name: 'Bank',    icon: '🏦',  baseCost: 130000,  baseCps: 260,  description: 'Cookies generate interest' },
]

/** Scaling formula: cost * 1.15^owned */
function scaledCost(baseCost: number, owned: number): number {
  return Math.ceil(baseCost * Math.pow(1.15, owned))
}

function calcCps(buildings: BuildingState[]): number {
  return buildings.reduce((sum, b) => sum + b.def.baseCps * b.owned, 0)
}

export function createGame(): CookieGame {
  const buildings = BUILDING_DEFS.map((def) => ({
    def,
    owned: 0,
    cost: def.baseCost,
  }))
  return {
    cookies: 0,
    totalBaked: 0,
    buildings,
    cps: 0,
  }
}

/** Player clicked the cookie. Returns updated game. */
export function click(game: CookieGame): CookieGame {
  return {
    ...game,
    cookies:     game.cookies + 1,
    totalBaked:  game.totalBaked + 1,
  }
}

/** Buy one unit of a building. Returns updated game or null if can't afford. */
export function buyBuilding(game: CookieGame, buildingId: string): CookieGame | null {
  const idx = game.buildings.findIndex((b) => b.def.id === buildingId)
  if (idx === -1) return null

  const b = game.buildings[idx]
  if (game.cookies < b.cost) return null

  const newOwned = b.owned + 1
  const updatedBuilding: BuildingState = {
    ...b,
    owned: newOwned,
    cost: scaledCost(b.def.baseCost, newOwned),
  }

  const buildings = [...game.buildings]
  buildings[idx] = updatedBuilding
  const cps = calcCps(buildings)

  return {
    ...game,
    cookies: game.cookies - b.cost,
    buildings,
    cps,
  }
}

/**
 * Advance the idle game by `deltaSeconds`.
 * Called every tick (e.g. 100ms) from the main loop.
 */
export function tick(game: CookieGame, deltaSeconds: number): CookieGame {
  const produced = game.cps * deltaSeconds
  return {
    ...game,
    cookies:    game.cookies + produced,
    totalBaked: game.totalBaked + produced,
  }
}

export interface SavedState {
  cookies: number
  totalBaked: number
  owned: Record<string, number>
}

export function toSaveState(game: CookieGame): SavedState {
  const owned: Record<string, number> = {}
  for (const b of game.buildings) {
    owned[b.def.id] = b.owned
  }
  return {
    cookies: game.cookies,
    totalBaked: game.totalBaked,
    owned,
  }
}

export function fromSaveState(saved: SavedState): CookieGame {
  const buildings = BUILDING_DEFS.map((def) => {
    const ownedCount = saved.owned[def.id] ?? 0
    return {
      def,
      owned: ownedCount,
      cost: scaledCost(def.baseCost, ownedCount),
    }
  })
  const cps = calcCps(buildings)
  return {
    cookies: saved.cookies,
    totalBaked: saved.totalBaked,
    buildings,
    cps,
  }
}
