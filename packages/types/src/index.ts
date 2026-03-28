// ── Game Metadata ────────────────────────────────────────────────────────────

export interface GameMeta {
  id: string
  slug: string
  title: string
  description: string
  category: GameCategory
  tier: GameTier
  thumbnail: string
  tags: string[]
  minPlayTime: number // minutes
  maxPlayTime: number // minutes
  personas: GamerPersona[]
  featured: boolean
  dailyChallenge: boolean
  createdAt: string
  updatedAt: string
}

export type GameCategory =
  | 'arcade'
  | 'puzzle'
  | 'strategy'
  | 'simulation'
  | 'racing'
  | 'action'
  | 'word'
  | 'card'
  | 'idle'
  | 'trivia'
  | 'adventure'
  | 'experimental'

export type GameTier = 'micro' | 'light' | 'standard' | 'complex'

export type GamerPersona =
  | 'snacker'
  | 'strategist'
  | 'champion'
  | 'collector'
  | 'veteran'
  | 'pioneer'

// ── Persona Profile (from onboarding) ────────────────────────────────────────

export interface PersonaProfile {
  primary: GamerPersona
  secondary: GamerPersona | null
  scores: Record<GamerPersona, number>
  sessionPreference: 'quick' | 'medium' | 'long'
  completedAt: string
}

// ── Game SDK Message Types (portal <-> game iframe communication) ─────────────

export type SDKMessage =
  | { type: 'sdk:init'; payload: SDKInitPayload }
  | { type: 'sdk:ready' }
  | { type: 'sdk:score'; payload: { score: number; meta?: Record<string, unknown> } }
  | { type: 'sdk:save'; payload: { data: unknown } }
  | { type: 'sdk:load'; payload: { data: unknown | null } }
  | { type: 'sdk:load-request' }
  | { type: 'sdk:ad'; payload: { adType: AdType } }
  | { type: 'sdk:ad-complete'; payload: { adType: AdType; watched: boolean } }
  | { type: 'sdk:track'; payload: { event: string; data?: Record<string, unknown> } }
  | { type: 'sdk:share'; payload: SharePayload }
  | { type: 'sdk:game-over'; payload: { score: number; replay?: string } }

export interface SDKInitPayload {
  gameId: string
  gameSlug: string
  challengeId?: string
  dailyChallenge?: boolean
}

export type AdType = 'preroll' | 'midroll' | 'rewarded'

export interface SharePayload {
  score?: number
  text: string
  url?: string
  emoji?: string // Wordle-style emoji grid
}

// ── Challenge Link ────────────────────────────────────────────────────────────

export interface Challenge {
  id: string
  gameSlug: string
  creatorScore: number
  createdAt: string
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number
  playerName: string
  score: number
  date: string
}

// ── Game Catalog ──────────────────────────────────────────────────────────────

export interface GameCatalog {
  games: GameMeta[]
  categories: { id: GameCategory; label: string; icon: string; count: number }[]
  featured: GameMeta[]
}
