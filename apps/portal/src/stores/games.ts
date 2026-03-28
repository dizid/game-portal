import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GameMeta, GameCategory, GamerPersona } from '@game-portal/types'

// Initial game catalog — hardcoded until a CMS or DB is wired up
const INITIAL_GAMES: GameMeta[] = [
  {
    id: 'snake-001',
    slug: 'snake',
    title: 'Snake',
    description: 'The classic snake game. Eat food, grow longer, avoid walls and your own tail.',
    category: 'arcade',
    tier: 'light',
    thumbnail: '',
    tags: ['classic', 'retro', 'high-score'],
    minPlayTime: 2,
    maxPlayTime: 15,
    personas: ['snacker', 'champion', 'veteran'],
    featured: true,
    dailyChallenge: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'tetris-001',
    slug: 'tetris',
    title: 'Tetris',
    description: 'Stack falling blocks to clear lines in this timeless puzzle classic.',
    category: 'puzzle',
    tier: 'standard',
    thumbnail: '',
    tags: ['classic', 'blocks', 'high-score'],
    minPlayTime: 5,
    maxPlayTime: 30,
    personas: ['strategist', 'champion', 'veteran'],
    featured: true,
    dailyChallenge: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: '2048-001',
    slug: '2048',
    title: '2048',
    description: 'Slide numbered tiles and combine them to reach the 2048 tile.',
    category: 'puzzle',
    tier: 'micro',
    thumbnail: '',
    tags: ['numbers', 'sliding', 'strategy'],
    minPlayTime: 3,
    maxPlayTime: 20,
    personas: ['strategist', 'snacker'],
    featured: true,
    dailyChallenge: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'memory-match-001',
    slug: 'memory-match',
    title: 'Memory Match',
    description: 'Flip cards and find matching pairs. Train your memory!',
    category: 'card',
    tier: 'micro',
    thumbnail: '',
    tags: ['memory', 'cards', 'brain-training'],
    minPlayTime: 2,
    maxPlayTime: 10,
    personas: ['snacker', 'collector'],
    featured: false,
    dailyChallenge: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'whack-a-mole-001',
    slug: 'whack-a-mole',
    title: 'Whack-a-Mole',
    description: 'Smash the moles as fast as they pop up. How high can you score?',
    category: 'arcade',
    tier: 'micro',
    thumbnail: '',
    tags: ['reaction', 'speed', 'casual'],
    minPlayTime: 1,
    maxPlayTime: 5,
    personas: ['snacker', 'champion'],
    featured: false,
    dailyChallenge: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
]

export const useGamesStore = defineStore('games', () => {
  const games = ref<GameMeta[]>(INITIAL_GAMES)

  // All unique categories that have at least one game
  const categories = computed<GameCategory[]>(() => {
    const seen = new Set<GameCategory>()
    for (const game of games.value) {
      seen.add(game.category)
    }
    return Array.from(seen)
  })

  function getGamesByCategory(category: GameCategory): GameMeta[] {
    return games.value.filter((g) => g.category === category)
  }

  function getGameBySlug(slug: string): GameMeta | undefined {
    return games.value.find((g) => g.slug === slug)
  }

  function getFeaturedGames(): GameMeta[] {
    return games.value.filter((g) => g.featured)
  }

  function getGamesForPersona(persona: GamerPersona): GameMeta[] {
    return games.value.filter((g) => g.personas.includes(persona))
  }

  function getDailyGames(): GameMeta[] {
    return games.value.filter((g) => g.dailyChallenge)
  }

  return {
    games,
    categories,
    getGamesByCategory,
    getGameBySlug,
    getFeaturedGames,
    getGamesForPersona,
    getDailyGames,
  }
})
