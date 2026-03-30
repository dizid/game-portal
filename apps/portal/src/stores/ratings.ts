import { defineStore } from 'pinia'
import { computed } from 'vue'

export interface GameRating {
  slug: string
  loopQuality: number    // 1-10: core loop satisfaction, "one more turn" pull
  gameFeel: number       // 1-10: juice, feedback, polish, sound design
  depth: number          // 1-10: meaningful choices, strategy, reveals over time
  addiction: number      // 1-10: variable rewards, loss aversion, threshold hooks
  originality: number    // 1-10: novelty of core mechanic
  accessibility: number  // 1-10: speed to fun, first win, intuitive controls
  overall: number        // weighted average (1 decimal)
  verdict: string        // one-line honest verdict (max 80 chars)
  tier: 'S' | 'A' | 'B' | 'C' | 'D'  // S=9+, A=7.5-8.9, B=6-7.4, C=4.5-5.9, D=below 4.5
}

// Weights: loop 25%, feel 20%, depth 20%, addiction 15%, originality 10%, accessibility 10%
function r(
  slug: string,
  loop: number,
  feel: number,
  depth: number,
  addict: number,
  orig: number,
  access: number,
  verdict: string,
): GameRating {
  const overall =
    Math.round(
      (loop * 0.25 + feel * 0.2 + depth * 0.2 + addict * 0.15 + orig * 0.1 + access * 0.1) * 10,
    ) / 10
  const tier: GameRating['tier'] =
    overall >= 9 ? 'S' : overall >= 7.5 ? 'A' : overall >= 6 ? 'B' : overall >= 4.5 ? 'C' : 'D'
  return {
    slug,
    loopQuality: loop,
    gameFeel: feel,
    depth,
    addiction: addict,
    originality: orig,
    accessibility: access,
    overall,
    verdict,
    tier,
  }
}

// prettier-ignore
const RATINGS: GameRating[] = [

  // ── ARCADE ─────────────────────────────────────────────────────────────────

  // Snake: proven loop but zero depth; works because the loop IS the depth
  r('snake',           7, 6, 4, 7, 2, 9,  'Timeless loop, zero depth — pure reflex satisfaction'),

  // Breakout: brick demolition is satisfying but there is no real strategy
  r('breakout',        6, 6, 3, 6, 2, 8,  'Decent paddle physics but feels thin without multi-ball chaos'),

  // Asteroids: momentum physics give it real feel; controls punish newcomers
  r('asteroids',       8, 7, 5, 7, 2, 6,  'Inertia controls genuinely age well; wrap-around map tension is real'),

  // Frogger: pure timing game, narrow design; satisfying lane-by-lane rhythm
  r('frogger',         6, 5, 3, 6, 2, 8,  'Crisp timing loop but immediately exhausts its design space'),

  // Space Invaders: descending pressure is the hook; monotonous after 3 mins
  r('space-invaders',  6, 6, 3, 6, 2, 8,  'Pressure ramps well but mechanical ceiling arrives fast'),

  // Pac-Man: ghost AI creates genuine tension; maze memory adds depth
  r('pac-man',         8, 8, 6, 8, 2, 8,  'Ghost AI creates real tension; one of the best arcade executions here'),

  // Galaga: capture mechanic and bonus stages lift it above pure shooters
  r('galaga',          7, 6, 4, 7, 2, 7,  'Capture mechanic is a nice hook; satisfying wave clearance'),

  // Pong: brutally simple; barely a game by modern standards
  r('pong',            4, 4, 2, 4, 2, 9,  'Historically important, currently boring — 2 minutes max'),

  // Whack-a-Mole: bomb avoidance adds risk but no real depth
  r('whack-a-mole',    5, 5, 2, 5, 2, 9,  'Works for 90 seconds, then you have seen everything it offers'),

  // Fruit Ninja: satisfying slicing moment; combo chains are the real hook
  r('fruit-ninja',     6, 7, 2, 6, 3, 9,  'Slicing feedback is genuinely satisfying; depth is near-zero'),


  // ── PUZZLE ─────────────────────────────────────────────────────────────────

  // Tetris: best-in-class loop; t-spins and stacking strategy reveal over hours
  r('tetris',          9, 9, 8, 9, 2, 8,  'As close to perfect loop design as a browser game gets'),

  // 2048: merge satisfaction works; optimal play kills the interesting decisions
  r('2048',            7, 6, 5, 7, 3, 9,  'Merge dopamine hits hard; optimal play removes all tension'),

  // Sudoku: pure logic no luck; feels rewarding but no moment-to-moment feel
  r('sudoku',          6, 4, 8, 6, 2, 6,  'Deep logic but no feedback momentum — slow-burn appeal only'),

  // Match-3: combo chains are the hook; derivative of every mobile game ever
  r('match-3',         7, 7, 5, 7, 2, 9,  'Combo chains pop well but the mechanic is entirely borrowed'),

  // Minesweeper: deduction is real; first-click mine is an unfixable flaw
  r('minesweeper',     6, 4, 7, 6, 3, 7,  'Genuine deduction ruined by luck on corner cells — frustrating'),

  // Sokoban: deep puzzle design; backtracking without undo kills newcomers
  r('sokoban',         6, 4, 8, 5, 3, 5,  'Excellent puzzle logic but brutal on newcomers without undo'),

  // Pipe Connect: satisfying completion; solved by trial-and-error not insight
  r('pipe-connect',    5, 5, 4, 5, 3, 8,  'Pretty puzzle with no real aha-moment — just trial rotation'),

  // Bubble Pop: trajectory aiming is the hook; color matching is shallow
  r('bubble-pop',      6, 6, 4, 6, 2, 8,  'Trajectory angle is the only meaningful decision point'),

  // Conway's Gardener: brilliant concept; wildly hard to grok the causal chain
  r('conways-gardener',6, 6, 7, 6, 8, 4,  'Unique reverse-engineering of CA; feedback loop is opaque'),

  // Eigenstate: quantum collapse angle is clever; puzzle design needs work
  r('eigenstate',      5, 5, 6, 5, 7, 4,  'Novel quantum framing but chain-failure kills satisfaction'),


  // ── STRATEGY ───────────────────────────────────────────────────────────────

  // Chess: infinite depth but requires opponent skill or strong AI to sing
  r('chess',           8, 5, 10, 7, 2, 4,  'Perfect depth; browser AI quality decides everything'),

  // Checkers: real tactics exist; outclassed by chess in every dimension
  r('checkers',        5, 4, 5, 5, 2, 7,  'Functional but checkers is chess with the depth removed'),

  // Tower Defense: placement decisions are the hook; solid genre execution
  r('tower-defense',   8, 7, 7, 8, 3, 7,  'Solid wave-defense loop with real tower synergy decisions'),

  // Consensus Engine: genuinely novel political negotiation; AI agents feel real
  r('consensus-engine',8, 7, 8, 8, 9, 5,  'Boldest political sim mechanic in the portal — AI agents bite'),

  // Vickrey's Ruin: teaches auction theory; second-play reveals are the hook
  r('vickreys-ruin',   6, 5, 8, 6, 8, 5,  'Genuinely teaches auction theory; feels dry on first contact'),

  // Dead Drop: Bayesian spy hunt is tense; map reading curve is steep
  r('dead-drop',       7, 6, 8, 6, 8, 5,  'Tense Bayesian deduction; evidence accumulation pays off'),

  // Supply Web: network resilience concept is solid; feedback is abstract
  r('supply-web',      5, 5, 7, 5, 7, 5,  'Interesting resilience concept but feedback arrives too late'),

  // Schelling Sort: social dynamics angle is unique; one correct strategy
  r('schelling-sort',  5, 5, 6, 5, 8, 5,  'Teaches Schelling segregation well; feels solved too fast'),

  // Echo Chamber: network seeding is tactically interesting; UI dense
  r('echo-chamber',    6, 5, 7, 6, 8, 5,  'Real network spread tactics; truth vs misinformation tension'),

  // Gerrymandr: boundary drawing is genuinely satisfying; political irony lands
  r('gerrymandr',      7, 6, 7, 6, 8, 6,  'District drawing is tactile and the political irony hits hard'),

  // Panopticon: surveillance vs happiness trade-off is real; low polish
  r('panopticon',      6, 5, 7, 6, 8, 5,  'Surveillance vs happiness trade-off creates genuine moral tension'),

  // Phenotype: selection pressure is tangible; 15-gen arc works well
  r('phenotype',       6, 5, 7, 6, 8, 6,  'Natural selection arc feels real; trait crossover is satisfying'),

  // Keynesian Beauty: brilliant in multiplayer; 5 AI players reduce stakes
  r('keynesian-beauty',5, 4, 7, 5, 8, 7,  'Brilliant game-theory lesson; AI opponents kill the real magic'),

  // Rumor Mill: network spread visualization is compelling; abilities shallow
  r('rumor-mill',      6, 6, 6, 6, 7, 7,  'Satisfying spread visualization; Boost/Bridge feel underpowered'),


  // ── SIMULATION ─────────────────────────────────────────────────────────────

  // Lemonade Stand: weather-pricing loop is a classic teaching tool
  r('lemonade-stand',  5, 4, 5, 5, 3, 8,  'Educational pricing loop; flat after two weather cycles'),

  // Startup Sim: hiring/building decisions are real; cashflow crunch is tense
  r('startup-sim',     7, 6, 8, 7, 5, 5,  'Real cashflow tension; hiring trade-offs force hard choices'),

  // Tragedy Pasture: commons concept lands; AI shepherds are too predictable
  r('tragedy-pasture', 6, 5, 7, 5, 8, 6,  'Tragedy of the Commons plays out visually; AI too forgiving'),

  // Arbitrage Express: buy-low sell-high loop across cities is compelling
  r('arbitrage-express',7, 6, 7, 7, 7, 6, 'Market event volatility creates real risk/reward decisions'),

  // Tide Pool: ecosystem balance is meditative; feels like clicking sliders
  r('tide-pool',       5, 6, 6, 5, 7, 6,  'Pretty ecosystem but feedback between sliders is unclear'),

  // Predator Drift: hunting-as-predator is novel; energy management is tense
  r('predator-drift',  7, 7, 6, 8, 7, 7,  'Being the predator is fresh; population graph feedback is great'),

  // Mycelium: network growth is visually beautiful; not many decisions
  r('mycelium',        6, 7, 5, 6, 7, 6,  'Gorgeous growth visualization; strategic depth is shallow'),

  // Ant Trails: pheromone drawing is tactile and novel
  r('ant-trails',      6, 7, 5, 6, 7, 7,  'Drawing pheromones feels good; colony emergence is satisfying'),


  // ── IDLE ───────────────────────────────────────────────────────────────────

  // Idle Farm: upgrade tree works; idle mechanics require patience browser tab
  r('idle-farm',       4, 4, 4, 6, 2, 7,  'Functional idle loop but needs background tabs to truly sing'),

  // Cookie Clicker: the genre-definer; number scaling creates milestone hooks
  r('cookie-clicker',  5, 5, 3, 7, 4, 8,  'Number-go-up is the whole game — works for exactly that goal'),


  // ── RACING ─────────────────────────────────────────────────────────────────

  // Infinite Runner: tight jump timing; "one more run" pull is real
  r('infinite-runner', 6, 6, 3, 7, 2, 9,  'Responsive jump timing; run length variance keeps it fresh'),

  // Drift Challenge: drift-scoring mechanic elevates above generic racer
  r('drift-challenge', 6, 6, 4, 6, 4, 7,  'Drifting for points is a good hook; course variety is limited'),


  // ── ACTION ─────────────────────────────────────────────────────────────────

  // Platformer: coin collection + spike avoidance is standard; 10 levels is good
  r('platformer',      6, 6, 4, 5, 2, 8,  'Solid level design but mechanics are entirely derivative'),


  // ── WORD ───────────────────────────────────────────────────────────────────

  // Wordle: information reveal is perfectly tuned; daily scarcity is the hook
  r('wordle',          8, 8, 8, 8, 4, 8,  'Color-coded deduction is perfectly tuned; daily format is gold'),

  // Hangman: zero strategy after first vowel guess; nostalgia carry only
  r('hangman',         4, 4, 3, 4, 2, 9,  'AEIOU then guess — zero strategy, pure alphabet scan'),

  // Typing Speed: clear personal benchmark loop; limited replay depth
  r('typing-speed',    5, 5, 3, 6, 2, 9,  'Personal best loop works; no skill ceiling beyond raw speed'),

  // Word Search: relaxing and non-stressful; no decisions at all
  r('word-search',     4, 4, 2, 4, 2, 8,  'Relaxing visual scan but no gameplay decisions whatsoever'),


  // ── CARD ───────────────────────────────────────────────────────────────────

  // Solitaire: cascade reveals create genuine suspense; blockers are satisfying
  r('solitaire',       6, 5, 5, 6, 2, 7,  'Card reveal suspense works; win rate vs challenge is balanced'),

  // Memory Match: pure memory; scales difficulty well with board size
  r('memory-match',    4, 4, 3, 4, 2, 9,  'Works as a memory drill; no strategy beyond remembering cards'),

  // Blackjack: hit/stand decision is the whole game; payout system needed
  r('blackjack',       5, 5, 4, 6, 2, 8,  'Hit/stand decisions are real but without bankroll stakes feel flat'),

  // Poker Hands: 5-card draw decisions exist; no bluffing removes the soul
  r('poker-hands',     5, 5, 5, 5, 2, 7,  'Draw decisions are there but poker without bluffing is half a game'),


  // ── TRIVIA ─────────────────────────────────────────────────────────────────

  // Trivia: knowledge recall with 15s pressure; question pool determines quality
  r('trivia',          5, 5, 4, 5, 2, 8,  'Timer pressure works; replayability depends entirely on pool depth'),

  // Reaction Timer: laser focus on one mechanic; three seconds and you are done
  r('reaction-timer',  4, 5, 1, 4, 3, 9,  'Measures reaction time accurately — that is the entire game'),


  // ── ADVENTURE ──────────────────────────────────────────────────────────────

  // Text RPG: combat choices and stat progression create real stakes
  r('text-rpg',        5, 3, 6, 5, 3, 7,  'Branching combat choices work; text-only limits the feel'),


  // ── EXPERIMENTAL ───────────────────────────────────────────────────────────

  // Color Mixing: precision slider matching; satisfying when you nail it
  r('color-mixing',    4, 5, 3, 4, 5, 7,  'Satisfying when you nail the target; minimal replay incentive'),

  // Signal Decay: race-against-decay tension is genuine; typing hook works
  r('signal-decay',    7, 7, 5, 7, 8, 7,  'Decaying signal creates real urgency; unusual framing lands'),

  // Lichen Wars: watching CA warfare unfold is compelling; limited input
  r('lichen-wars',     6, 7, 6, 6, 7, 6,  'CA warfare is visually compelling; strategic depth is limited'),

  // Thermal Drift: probabilistic nudging is genuinely novel; controls opaque
  r('thermal-drift',   5, 6, 5, 5, 7, 5,  'Heat/cold nudging is novel but particle behavior feels unpredictable'),

  // Half-Life: statistics betting concept is clever; feels like a spreadsheet
  r('half-life',       4, 4, 5, 5, 7, 6,  'Decay statistics lesson works; UI makes it feel like homework'),

  // Dead Reckoning: compass+speed navigation is genuinely tense and original
  r('dead-reckoning',  7, 6, 7, 7, 8, 6,  'Fog navigation is tense; commits to its concept without hints'),

  // Memory Palace: spatial memory challenge with clear difficulty progression
  r('memory-palace',   5, 5, 5, 5, 6, 7,  'Spatial memory loop works; limited visual reward for correct recall'),

  // Interference: wave matching concept is beautiful; control precision too hard
  r('interference',    5, 6, 5, 4, 7, 4,  'Beautiful physics concept; emitter precision frustrates execution'),

  // Lorenz: chaos attractor navigation is eerie and unique
  r('lorenz',          6, 7, 5, 6, 8, 6,  'Chaos attractor is hauntingly beautiful; nudge mechanic is delicate'),

  // Price of Anarchy: Braess Paradox landing moment is excellent; one trick
  r('price-of-anarchy',5, 5, 6, 5, 7, 6,  'Braess Paradox reveal is a genuine aha-moment; one-trick design'),

  // Quorum: clicking to trigger bacterial quorum sensing is tactile
  r('quorum',          6, 7, 5, 6, 8, 6,  'Bacterial quorum framing is brilliantly original; phagocyte dodging works'),

  // Enzyme: Brownian motion clicking is tense; short session is appropriate
  r('enzyme',          6, 7, 4, 6, 7, 7,  'Click-to-catalyse is tactile; brief by design and works for it'),

  // Doppler: audio-only navigation is a brave design choice; needs headphones
  r('doppler',         5, 6, 5, 5, 9, 4,  'Brave audio-only design; completely depends on headphone quality'),

  // Stegano: steganography decoding is genuinely satisfying for puzzle solvers
  r('stegano',         5, 5, 7, 5, 9, 3,  'Fascinating steganography tools; near-zero accessibility for newcomers'),

  // Fold Escape: paper-folding mechanic is conceptually delightful and unique
  r('fold-escape',     7, 7, 7, 6, 9, 5,  'Paper-fold mechanic is genuinely novel; walls-become-floors clicks'),

  // Bit Rot: systemic corruption as gameplay is a great horror-comedy concept
  r('bit-rot',         7, 7, 5, 7, 9, 7,  'Corruption-as-gameplay is inspired; controlled chaos before it breaks'),

  // Instruction Creep: escalating contradictory rules is comedy and chaos
  r('instruction-creep',7, 6, 5, 7, 8, 8, 'Rule-stacking creates mounting absurdity; 3 lives feel just right'),

  // Zeno's Gauntlet: zoom-doubling at halfway is a brilliant visual gag
  r('zenos-gauntlet',  6, 7, 4, 6, 9, 7,  'Zoom paradox gag is delightful; gameplay shallows after 5 levels'),

  // Phase Space: orbital gravity-well placement is beautiful and tactile
  r('phase-space',     7, 8, 7, 6, 8, 5,  'Gravity-well placement is meditative; spirograph trails are stunning'),

  // Sunk Cost: meta-commentary on sunk cost bias; one joke, perfectly executed
  r('sunk-cost',       4, 4, 3, 5, 9, 8,  'Brilliant one-joke meta-game; replay value is exactly zero'),

  // Cargo Cult: noise-from-signal deduction is clever; 10 rounds feel long
  r('cargo-cult',      5, 5, 6, 5, 8, 6,  'Signal-from-noise deduction is original; ritual reveal satisfying'),

  // Topology: mathematical topology as puzzle is genuinely novel
  r('topology',        5, 5, 7, 5, 9, 4,  'Topology deformation is rare design space; accessibility is brutal'),


  // ── NEW TOP-TIER ────────────────────────────────────────────────────────────

  // Severing: drawing cuts with gem/rock trade-offs is genuinely spatial
  r('severing',        8, 8, 8, 8, 8, 7,  'Cutting geometry with real trade-offs — spatial thinking rewarded'),

  // Bloom Chain: hex chain reactions with scorched-earth territory control
  r('bloom-chain',     8, 8, 8, 8, 7, 7,  'Hex chain reactions create explosive satisfaction; territory fights'),

  // Tensile: elastic web snapping creates permanent consequence; tense
  r('tensile',         8, 9, 6, 8, 8, 6,  'Thread snap permanence creates real anxiety; elastic feel is excellent'),

  // Redact: language logic with contradictory rules creates genuine lateral thinking
  r('redact',          8, 7, 8, 7, 8, 7,  'Contradictory rule logic is fresh; loophole hunting feels clever'),

  // Pulse Vault: player-created rhythm generating personal obstacles is original
  r('pulse-vault',     9, 8, 5, 8, 8, 7,  'Your rhythm = your enemy — most original arcade concept in the portal'),
]

export const useRatingsStore = defineStore('ratings', () => {
  function getRating(slug: string): GameRating | undefined {
    return RATINGS.find((rating) => rating.slug === slug)
  }

  // All ratings sorted best-to-worst
  const allRatings = computed(() => [...RATINGS].sort((a, b) => b.overall - a.overall))

  // Ratings grouped by tier, each tier sorted best-to-worst
  const tierGroups = computed(() => {
    const groups: Record<string, GameRating[]> = { S: [], A: [], B: [], C: [], D: [] }
    for (const rating of RATINGS) {
      groups[rating.tier].push(rating)
    }
    for (const tier of Object.keys(groups)) {
      groups[tier].sort((a, b) => b.overall - a.overall)
    }
    return groups
  })

  // Average overall score across all rated games
  const averageScore = computed(() => {
    const sum = RATINGS.reduce((acc, r) => acc + r.overall, 0)
    return Math.round((sum / RATINGS.length) * 10) / 10
  })

  return { getRating, allRatings, tierGroups, averageScore, RATINGS }
})
