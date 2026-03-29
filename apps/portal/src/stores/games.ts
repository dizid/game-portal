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

  // ── Economics & Game Theory ──
  g('consensus-engine-001', 'consensus-engine', 'Consensus Engine', 'Chair a committee of 7 AI agents. Spend Political Capital to lobby, poll, and broker deals. Can you pass the resolution?', 'strategy', 'standard', ['game-theory', 'politics', 'negotiation', 'unique'], 5, 15, ['strategist', 'pioneer'], true),
  g('price-of-anarchy-001', 'price-of-anarchy', 'Price of Anarchy', 'Assign 100 cars across road networks to minimize commute time. Watch out for the Braess Paradox!', 'experimental', 'light', ['game-theory', 'economics', 'braess', 'unique'], 3, 10, ['strategist', 'pioneer']),
  g('vickreys-ruin-001', 'vickreys-ruin', "Vickrey's Ruin", '12 auctions across 4 formats: First-Price, Vickrey, All-Pay, and Dutch. Bid strategically for profit.', 'strategy', 'standard', ['auctions', 'economics', 'bidding', 'unique'], 5, 15, ['strategist', 'champion'], true),
  g('tragedy-pasture-001', 'tragedy-pasture', 'Tragedy Pasture', 'A shared commons with 4 AI shepherds. Graze sheep for gold, but overgrazing destroys everyone.', 'simulation', 'standard', ['game-theory', 'commons', 'social', 'unique'], 5, 15, ['strategist', 'pioneer']),
  g('keynesian-beauty-001', 'keynesian-beauty', 'Keynesian Beauty', 'Pick a number closest to 2/3 of the group average. 10 rounds. Outsmart 5 AI players with varying reasoning depths.', 'strategy', 'micro', ['game-theory', 'coordination', 'reasoning', 'unique'], 2, 8, ['strategist', 'snacker'], false, true),
  g('arbitrage-express-001', 'arbitrage-express', 'Arbitrage Express', 'Trade 4 goods across 5 cities in 30 turns. Buy low, sell high before market events shake everything up.', 'simulation', 'standard', ['economics', 'trading', 'arbitrage', 'unique'], 5, 15, ['strategist', 'collector'], true),
  g('dead-drop-001', 'dead-drop', 'Dead Drop', '6 agents on a city grid. One is the spy. Use Bayesian evidence from wiretaps and surveillance to find them.', 'strategy', 'standard', ['deduction', 'bayesian', 'spy', 'unique'], 5, 10, ['strategist', 'pioneer'], true),
  g('supply-web-001', 'supply-web', 'Supply Web', 'Build a factory-to-shop supply network. Survive disasters with redundancy, reinforced edges, and buffer stock.', 'strategy', 'standard', ['networks', 'logistics', 'resilience', 'unique'], 5, 15, ['strategist', 'pioneer']),

  // ── Experimental ──
  g('signal-decay-001', 'signal-decay', 'Signal Decay', 'You ARE the message. Fix corrupted characters before relays destroy 50% of the signal.', 'experimental', 'light', ['typing', 'reaction', 'decay', 'unique'], 2, 10, ['champion', 'pioneer'], true),
  g('lichen-wars-001', 'lichen-wars', 'Lichen Wars', 'A 40x40 petri dish. Place lichen seeds and watch cellular automaton warfare unfold.', 'experimental', 'standard', ['strategy', 'simulation', 'cellular', 'unique'], 5, 15, ['strategist', 'pioneer'], true),
  g('thermal-drift-001', 'thermal-drift', 'Thermal Drift', 'Guide a Brownian-motion particle to its target using heat sources and cold sinks.', 'experimental', 'light', ['physics', 'puzzle', 'thermal', 'unique'], 3, 10, ['strategist', 'pioneer']),
  g('half-life-001', 'half-life', 'Half-Life', 'Bet on which radioactive atoms will decay before each tick fires. Statistics gambling!', 'experimental', 'light', ['probability', 'betting', 'science', 'unique'], 3, 10, ['strategist', 'pioneer'], false, true),
  g('dead-reckoning-001', 'dead-reckoning', 'Dead Reckoning', 'Navigate in dense fog using only a compass and speedometer. Drop anchor to score.', 'experimental', 'standard', ['navigation', 'fog', 'physics', 'unique'], 5, 15, ['strategist', 'pioneer'], true),
  g('memory-palace-001', 'memory-palace', 'Memory Palace', 'Place objects in rooms, then recall where you put them. Rounds get harder.', 'experimental', 'standard', ['memory', 'brain-training', 'spatial', 'unique'], 5, 20, ['strategist', 'collector']),
  g('interference-001', 'interference', 'Interference', 'Match a ghost wave interference pattern by positioning wave emitters.', 'experimental', 'standard', ['waves', 'physics', 'puzzle', 'unique'], 3, 15, ['pioneer', 'strategist']),
  g('lorenz-001', 'lorenz', 'Lorenz', 'Nudge a dot following the chaotic Lorenz attractor to collect glowing targets.', 'experimental', 'light', ['chaos', 'physics', 'attractor', 'unique'], 2, 10, ['pioneer', 'champion'], true),

  // ── Biology / Ecosystem ──
  g('tide-pool-001', 'tide-pool', 'Tide Pool', 'Balance a living tide pool ecosystem. Add species, adjust sunlight, manage minerals. Keep all 4 species alive to score!', 'simulation', 'standard', ['ecosystem', 'simulation', 'biology', 'unique'], 2, 5, ['strategist', 'pioneer'], true),
  g('predator-drift-001', 'predator-drift', 'Predator Drift', 'You are the fox! Hunt rabbits to survive. Watch population graphs as grass, rabbits, and your energy interplay. Mutation events every 90s!', 'simulation', 'standard', ['ecosystem', 'predator', 'biology', 'unique'], 2, 10, ['champion', 'pioneer'], true),
  g('quorum-001', 'quorum', 'Quorum', 'Click to lower activation barriers and trigger quorum sensing in bacteria colonies. Dodge phagocytes and use burst signals!', 'experimental', 'standard', ['biology', 'bacteria', 'science', 'unique'], 3, 5, ['pioneer', 'strategist'], true),
  g('phenotype-001', 'phenotype', 'Phenotype', 'Select creatures to survive each generation. Survivors breed with crossover traits and mutations. 15 generations of natural selection!', 'strategy', 'light', ['evolution', 'genetics', 'science', 'unique'], 5, 15, ['strategist', 'pioneer'], true),
  g('mycelium-001', 'mycelium', 'Mycelium', 'Grow a fungal network through the soil connecting trees to mineral nodes. Fend off rival blue fungus and fruit mushrooms for bonus points!', 'simulation', 'standard', ['biology', 'networks', 'mushrooms', 'unique'], 3, 8, ['strategist', 'pioneer']),
  g('enzyme-001', 'enzyme', 'Enzyme', 'Catalyse chemical bonds! Click near Brownian-motion molecules to lower activation barriers. Bond complementary pairs before inhibitors interfere!', 'experimental', 'light', ['chemistry', 'physics', 'science', 'unique'], 1, 3, ['champion', 'pioneer'], false, true),
  g('conways-gardener-001', 'conways-gardener', "Conway's Gardener", 'Place seeds to guide Conway\'s Game of Life to a target pattern. 10 levels — still lifes, oscillators, gliders!', 'puzzle', 'standard', ['cellular-automata', 'logic', 'science', 'unique'], 5, 20, ['strategist', 'pioneer'], true),
  g('ant-trails-001', 'ant-trails', 'Ant Trails', 'Draw pheromone trails to guide ants to food sources. Trails fade, new food appears, ants discover on their own too!', 'simulation', 'light', ['ants', 'swarm', 'biology', 'unique'], 2, 5, ['pioneer', 'strategist']),

  // ── Social Dynamics & Systems ──
  g('schelling-sort-001', 'schelling-sort', 'Schelling Sort', 'Place community centers to foster integration in a self-segregating neighborhood. Maximize entropy!', 'strategy', 'standard', ['social', 'simulation', 'systems', 'unique'], 5, 15, ['strategist', 'pioneer'], true),
  g('echo-chamber-001', 'echo-chamber', 'Echo Chamber', 'Seed truth in a network of 40 misinformed people. Share beliefs strategically before misinformation agents fight back.', 'strategy', 'light', ['social', 'networks', 'information', 'unique'], 3, 10, ['strategist', 'pioneer'], true),
  g('gerrymandr-001', 'gerrymandr', 'Gerrymandr', 'Draw 5 voting districts to win 4+. Then watch the AI gerrymander against you. Who wins the fairness game?', 'strategy', 'standard', ['politics', 'strategy', 'voting', 'unique'], 5, 15, ['strategist', 'pioneer'], true),
  g('rumor-mill-001', 'rumor-mill', 'Rumor Mill', 'Plant a rumor and watch it spread — and mutate. Use Boost, Discredit, and Bridge abilities to control the narrative.', 'strategy', 'light', ['social', 'networks', 'information', 'unique'], 3, 10, ['strategist', 'champion'], false, true),
  g('panopticon-001', 'panopticon', 'Panopticon', 'Run a surveillance state. Place cameras, unlock informants, manage order vs happiness over 20 tense turns.', 'strategy', 'standard', ['surveillance', 'strategy', 'social', 'unique'], 5, 15, ['strategist', 'pioneer'], true),

  // ── Sensory / Audio ──
  g('doppler-001', 'doppler', 'Doppler', 'Navigate a near-dark maze using only audio cues — Doppler pitch shifts and stereo panning. Collect 10 items in 3 minutes.', 'experimental', 'standard', ['audio', 'navigation', 'sensory', 'unique'], 3, 10, ['pioneer', 'champion'], true),

  // ── Quantum ──
  g('eigenstate-001', 'eigenstate', 'Eigenstate', 'Collapse quantum cells to make each row a single color. Limited observations — wrong sequence = unsolvable!', 'puzzle', 'standard', ['quantum', 'logic', 'probability', 'unique'], 5, 20, ['strategist', 'pioneer'], true),

  // ── Cryptography ──
  g('stegano-001', 'stegano', 'Stegano', 'A secret word hides in this image. Isolate channels, view bit planes, apply filters. Decode 8 hidden messages!', 'experimental', 'standard', ['cryptography', 'steganography', 'puzzle', 'unique'], 5, 20, ['strategist', 'pioneer'], true),

  // ── Meta / Experimental ──
  g('fold-escape-001', 'fold-escape', 'Fold Escape', 'Navigate a maze on paper. Click crease lines to fold the sheet — walls become floors. 10 levels.', 'experimental', 'standard', ['puzzle', 'paper', 'folds', 'unique'], 5, 15, ['strategist', 'pioneer'], true),
  g('bit-rot-001', 'bit-rot', 'Bit Rot', 'Collect items before the system decays. Glitches corrupt controls, visuals, and your score display.', 'experimental', 'light', ['decay', 'corruption', 'horror', 'unique'], 2, 10, ['champion', 'pioneer'], true),
  g('instruction-creep-001', 'instruction-creep', 'Instruction Creep', 'Click the green circle — but new rules pile on every 30 seconds. They stack, they contradict. 3 lives.', 'experimental', 'light', ['rules', 'chaos', 'reflex', 'unique'], 2, 10, ['champion', 'snacker'], true, true),
  g('zenos-gauntlet-001', 'zenos-gauntlet', "Zeno's Gauntlet", 'Run to the finish line. Every halfway point doubles the zoom and adds new obstacles. Can you reach 10 zoom levels?', 'experimental', 'light', ['runner', 'zoom', 'paradox', 'unique'], 2, 8, ['champion', 'pioneer'], true),
  g('phase-space-001', 'phase-space', 'Phase Space', 'Place gravity wells to guide a satellite through orbital waypoints. Beautiful spirograph trajectories.', 'experimental', 'standard', ['physics', 'gravity', 'orbital', 'unique'], 5, 15, ['strategist', 'pioneer'], true),
  g('sunk-cost-001', 'sunk-cost', 'Sunk Cost', 'Start with 1000 pts. Score drains away. Find the tiny cash-out button and press it. Optimal play = quit immediately.', 'experimental', 'micro', ['meta', 'psychology', 'irony', 'unique'], 1, 5, ['pioneer', 'snacker'], false, true),
  g('cargo-cult-001', 'cargo-cult', 'Cargo Cult', 'Perform the secret 3-step ritual to make it rain. Villagers copy your moves as noise. 10 rounds.', 'experimental', 'standard', ['ritual', 'deduction', 'noise', 'unique'], 5, 15, ['strategist', 'pioneer'], true),
  g('topology-001', 'topology', 'Topology', 'Deform shapes to match topology — same holes and connected parts, regardless of exact form. 12 levels.', 'experimental', 'standard', ['math', 'topology', 'puzzle', 'unique'], 5, 20, ['strategist', 'pioneer'], true),
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
