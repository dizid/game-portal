import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GameMeta, GameCategory, GamerPersona } from '@game-portal/types'

// Helper to create game entries concisely
function g(id: string, slug: string, title: string, desc: string, cat: GameCategory, tier: 'micro' | 'light' | 'standard' | 'complex', tags: string[], min: number, max: number, personas: GamerPersona[], featured = false, daily = false): GameMeta {
  return { id, slug, title, description: desc, category: cat, tier, thumbnail: '', tags, minPlayTime: min, maxPlayTime: max, personas, featured, dailyChallenge: daily, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }
}

const INITIAL_GAMES: GameMeta[] = [
  // ── Arcade ──
  g('snake-001', 'snake', 'Snake', 'Eat food, grow longer, avoid walls and your own tail.', 'arcade', 'light', ['classic', 'retro', 'high-score'], 2, 15, ['snacker', 'champion', 'veteran'], true, true),
  g('breakout-001', 'breakout', 'Breakout', 'Bounce the ball and smash all the bricks. Power-ups drop from destroyed bricks!', 'arcade', 'light', ['classic', 'paddle', 'power-ups'], 3, 15, ['snacker', 'champion', 'veteran'], true),
  g('asteroids-001', 'asteroids', 'Asteroids', 'Pilot your ship through an asteroid field. Shoot to survive!', 'arcade', 'light', ['classic', 'space', 'shooter'], 3, 15, ['champion', 'veteran'], false, true),
  g('frogger-001', 'frogger', 'Frogger', 'Guide your frog across busy roads and rivers to safety.', 'arcade', 'light', ['classic', 'crossing', 'timing'], 2, 10, ['snacker', 'veteran']),
  g('space-invaders-001', 'space-invaders', 'Space Invaders', 'Defend Earth from waves of descending aliens.', 'arcade', 'light', ['classic', 'shooter', 'retro'], 3, 15, ['champion', 'veteran']),
  g('pac-man-001', 'pac-man', 'Pac-Man', 'Eat all the dots, grab power pellets, and chomp the ghosts!', 'arcade', 'standard', ['classic', 'maze', 'retro'], 5, 20, ['snacker', 'veteran'], true),
  g('galaga-001', 'galaga', 'Galaga', 'Shoot down swooping alien formations in this arcade classic.', 'arcade', 'light', ['classic', 'shooter', 'waves'], 3, 15, ['champion', 'veteran']),
  g('pong-001', 'pong', 'Pong', 'The original video game! Beat the AI in a paddle battle.', 'arcade', 'light', ['classic', 'versus', 'retro'], 2, 10, ['snacker', 'champion', 'veteran']),
  g('whack-a-mole-001', 'whack-a-mole', 'Whack-a-Mole', 'Smash moles as fast as they pop up. Avoid the bombs!', 'arcade', 'micro', ['reaction', 'speed', 'casual'], 1, 5, ['snacker', 'champion'], false, true),
  g('fruit-ninja-001', 'fruit-ninja', 'Fruit Ninja', 'Swipe to slice flying fruit. Watch out for bombs!', 'arcade', 'micro', ['swipe', 'reaction', 'casual'], 1, 5, ['snacker', 'champion']),

  // ── Puzzle ──
  g('tetris-001', 'tetris', 'Tetris', 'Stack falling blocks to clear lines in this timeless classic.', 'puzzle', 'standard', ['classic', 'blocks', 'high-score'], 5, 30, ['strategist', 'champion', 'veteran'], true),
  g('2048-001', '2048', '2048', 'Slide tiles and combine them to reach the 2048 tile.', 'puzzle', 'micro', ['numbers', 'sliding', 'strategy'], 3, 20, ['strategist', 'snacker'], true),
  g('sudoku-001', 'sudoku', 'Sudoku', 'Fill the 9x9 grid so every row, column, and box has 1-9.', 'puzzle', 'standard', ['logic', 'numbers', 'brain'], 5, 30, ['strategist', 'pioneer']),
  g('match-3-001', 'match-3', 'Match-3', 'Swap gems to make rows of 3 or more. Chain combos for mega points!', 'puzzle', 'standard', ['gems', 'matching', 'combos'], 3, 15, ['snacker', 'collector']),
  g('minesweeper-001', 'minesweeper', 'Minesweeper', 'Reveal cells without hitting mines. Numbers are your clues.', 'puzzle', 'light', ['logic', 'classic', 'brain'], 2, 10, ['strategist', 'veteran']),
  g('sokoban-001', 'sokoban', 'Sokoban', 'Push all boxes onto targets. Think carefully — no pulling!', 'puzzle', 'standard', ['logic', 'boxes', 'levels'], 5, 30, ['strategist', 'pioneer']),
  g('pipe-connect-001', 'pipe-connect', 'Pipe Connect', 'Rotate pipe segments to connect the water flow from source to drain.', 'puzzle', 'light', ['logic', 'rotation', 'flow'], 2, 15, ['strategist', 'snacker']),
  g('bubble-pop-001', 'bubble-pop', 'Bubble Pop', 'Aim and shoot bubbles to match 3+ of the same color.', 'puzzle', 'light', ['shooting', 'matching', 'casual'], 3, 15, ['snacker', 'collector']),

  // ── Strategy ──
  g('chess-001', 'chess', 'Chess', 'The ultimate strategy game. Checkmate the AI opponent.', 'strategy', 'complex', ['classic', 'board', 'thinking'], 10, 30, ['strategist', 'veteran']),
  g('checkers-001', 'checkers', 'Checkers', 'Jump and capture your way to victory on the classic board.', 'strategy', 'standard', ['classic', 'board', 'jumping'], 5, 20, ['strategist', 'veteran']),
  g('tower-defense-001', 'tower-defense', 'Tower Defense', 'Place towers to stop waves of enemies from reaching the exit.', 'strategy', 'standard', ['towers', 'waves', 'planning'], 10, 30, ['strategist', 'collector'], true),

  // ── Simulation ──
  g('lemonade-stand-001', 'lemonade-stand', 'Lemonade Stand', 'Run a lemonade business! Set prices, watch the weather, and maximize profit.', 'simulation', 'light', ['business', 'money', 'weather'], 5, 15, ['collector', 'strategist']),
  g('startup-sim-001', 'startup-sim', 'Startup Simulator', 'Build a tech startup from $10K to $100K MRR. Hire, build, and survive!', 'simulation', 'complex', ['business', 'startup', 'management'], 10, 30, ['strategist', 'pioneer'], true),
  g('idle-farm-001', 'idle-farm', 'Idle Farm', 'Harvest wheat, bake bread, build a restaurant empire! Idle progress even offline.', 'idle', 'micro', ['idle', 'farming', 'incremental'], 1, 60, ['collector', 'snacker']),
  g('cookie-clicker-001', 'cookie-clicker', 'Cookie Clicker', 'Click the cookie! Buy upgrades to bake millions of cookies automatically.', 'idle', 'micro', ['idle', 'clicking', 'upgrades'], 1, 60, ['collector', 'snacker'], false, true),

  // ── Racing ──
  g('infinite-runner-001', 'infinite-runner', 'Infinite Runner', 'Run, jump, and double-jump through an endless obstacle course.', 'racing', 'light', ['running', 'endless', 'reflexes'], 1, 10, ['snacker', 'champion'], false, true),
  g('drift-challenge-001', 'drift-challenge', 'Drift Challenge', 'Race around the track! Hold turns to drift for massive bonus points.', 'racing', 'standard', ['driving', 'drifting', 'racing'], 3, 15, ['champion', 'pioneer']),

  // ── Action ──
  g('platformer-001', 'platformer', 'Platformer', 'Jump through 10 levels collecting coins and dodging spikes!', 'action', 'standard', ['jumping', 'levels', 'coins'], 5, 20, ['snacker', 'champion']),

  // ── Word ──
  g('wordle-001', 'wordle', 'Wordle', 'Guess the 5-letter word in 6 tries. Green = right spot, yellow = wrong spot.', 'word', 'micro', ['words', 'daily', 'guessing'], 2, 10, ['strategist', 'snacker'], true, true),
  g('hangman-001', 'hangman', 'Hangman', 'Guess the word letter by letter before the hangman is complete!', 'word', 'micro', ['words', 'guessing', 'classic'], 2, 10, ['snacker', 'veteran']),
  g('typing-speed-001', 'typing-speed', 'Typing Speed', 'How fast can you type? Race against the clock for WPM glory.', 'word', 'micro', ['typing', 'speed', 'wpm'], 1, 5, ['champion', 'pioneer']),
  g('word-search-001', 'word-search', 'Word Search', 'Find hidden words in a grid of letters. 5 themed puzzles!', 'word', 'light', ['words', 'finding', 'themes'], 3, 15, ['snacker', 'collector']),

  // ── Card ──
  g('solitaire-001', 'solitaire', 'Solitaire', 'Classic Klondike solitaire. Stack cards and build the foundations.', 'card', 'standard', ['classic', 'cards', 'patience'], 5, 20, ['collector', 'veteran']),
  g('memory-match-001', 'memory-match', 'Memory Match', 'Flip cards and find matching pairs. Train your memory!', 'card', 'micro', ['memory', 'cards', 'brain-training'], 2, 10, ['snacker', 'collector']),
  g('blackjack-001', 'blackjack', 'Blackjack', 'Beat the dealer to 21! Hit, stand, or double down.', 'card', 'light', ['casino', 'cards', 'strategy'], 2, 15, ['champion', 'strategist']),
  g('poker-hands-001', 'poker-hands', 'Poker Hands', '5-card draw poker. Discard and draw to make the best hand!', 'card', 'light', ['casino', 'cards', 'poker'], 2, 15, ['strategist', 'champion']),

  // ── Trivia ──
  g('trivia-001', 'trivia', 'Trivia', '10 questions, 15 seconds each. How much do you know?', 'trivia', 'micro', ['knowledge', 'quiz', 'timed'], 2, 10, ['snacker', 'pioneer'], false, true),
  g('reaction-timer-001', 'reaction-timer', 'Reaction Timer', 'Wait for green, then tap as FAST as you can! Best of 5 rounds.', 'trivia', 'micro', ['reaction', 'speed', 'reflexes'], 1, 3, ['snacker', 'champion']),
  g('color-mixing-001', 'color-mixing', 'Color Mixing', 'Mix RGB colors to match the target. How close can you get?', 'experimental', 'micro', ['colors', 'creative', 'matching'], 2, 10, ['pioneer', 'snacker']),

  // ── Adventure ──
  g('text-rpg-001', 'text-rpg', 'Text RPG', 'A village needs your help. Fight monsters, find treasure, slay the dragon!', 'adventure', 'complex', ['story', 'choices', 'combat'], 10, 30, ['pioneer', 'strategist']),
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
