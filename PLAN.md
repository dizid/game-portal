# Game Portal - Strategic Plan

## Context

Create a Flash-era-inspired casual game portal with 50-100+ browser games. The goal is commercialization through ads, with personalized game discovery based on gamer identity. Think Miniclip/Newgrounds circa 2005, but modern HTML5. Solo dev + AI agents building games rapidly.

---

## Level 1: Platform Architecture

### Tech Stack
- **Portal:** Vue 3 + Vite + Tailwind CSS 4 + Pinia (matches existing projects)
- **Games:** Phaser 3 for complex games, raw Canvas/Vue for simple ones
- **Hosting:** Netlify (static + serverless functions)
- **Database:** Neon PostgreSQL free tier (leaderboards, daily challenges)
- **Repo:** Turborepo monorepo

### Monorepo Structure
```
game-portal/
├── turbo.json
├── package.json
├── apps/
│   └── portal/                  # Vue 3 SPA - game discovery, profiles, ads
├── packages/
│   ├── game-sdk/                # Shared: ads, scoring, sharing, analytics, postMessage
│   ├── game-template/           # turbo gen scaffold for new games
│   ├── ui/                      # Shared Vue components (score display, share buttons)
│   └── types/                   # Shared TypeScript types
└── games/
    ├── snake/                   # Each game = lightweight Vite package
    ├── tetris/
    ├── bubble-pop/
    └── ...
```

### URL Structure (Subdirectories, NOT subdomains)
All major portals use subdirectories for SEO domain authority consolidation.
```
gameportal.com/                        # Homepage + onboarding
gameportal.com/games/                  # Browse all
gameportal.com/games/puzzle/           # Category page
gameportal.com/games/puzzle/tetris/    # Game page
gameportal.com/daily/                  # Daily challenge
gameportal.com/challenge/abc123/       # Challenge link
```

### Game Isolation
- Games run in **iframes** for crash protection and memory isolation
- Portal <-> Game communication via `postMessage` (managed by game-sdk)
- Each game builds to static HTML/JS/CSS, deployed as a Netlify subpath

### Monetization Tiers
| Phase | MAU | Strategy | Expected RPM |
|-------|-----|----------|--------------|
| 1 | 0-10K | Google AdSense (display + auto ads) | $1-3 |
| 2 | 10K-100K | Ad Manager + GameDistribution SDK (rewarded video) | $3-8 |
| 3 | 100K+ | + Premium ad-free tier ($3.99/mo) + sponsored placements | $5-12 |

---

## Level 2: Game Taxonomy & Personas

### 6 Gamer Personas

| Persona | Description | Session | Preferences |
|---------|-------------|---------|-------------|
| **The Snacker** | Quick fun, 5 minutes max | Ultra-short | Clickers, trivia, reaction games |
| **The Strategist** | Thinks before acting | 15-30 min | Chess, puzzle, tower defense |
| **The Champion** | Competes for scores | 10-20 min | Leaderboard games, challenges |
| **The Collector** | Idle/incremental progress | Background | Idle games, tycoons, farming |
| **The Veteran** | Nostalgia for classics | Varies | Retro remakes, text adventures |
| **The Pioneer** | Wants novel experiences | 10-15 min | Experimental/new game concepts |

### 12 Game Categories
1. **Arcade** - Snake, Breakout, Pac-Man style
2. **Puzzle** - Tetris, 2048, match-3, Sudoku
3. **Strategy** - Chess, tower defense, turn-based
4. **Simulation** - Farming, city building, life sim
5. **Racing** - Top-down, side-scroll, obstacle
6. **Action** - Platformers, shooters, beat-em-up
7. **Word** - Wordle-style, crossword, hangman
8. **Card** - Solitaire, poker, blackjack, memory
9. **Idle/Clicker** - Cookie clicker style, tycoons
10. **Trivia/Quiz** - Knowledge, personality, would-you-rather
11. **Adventure** - Text-based, point-and-click, RPG-lite
12. **Experimental** - Novel mechanics, art games, social games

### Onboarding Wizard (5 screens, 60-90 seconds)
1. **Welcome** - "What kind of player are you?" with visual options
2. **Time** - "How long do you usually play?" (2 min / 10 min / 30+ min)
3. **Style** - Pick 3 game screenshots that appeal to you (visual preference)
4. **Challenge** - "What sounds more fun?" (A vs B choices, 3 rounds)
5. **Results** - "You're a [Persona]! Here are games for you"

Stored in localStorage. Behavioral signals adjust persona after every 5 games played.

---

## Level 3: Game Pipeline

### 4 Complexity Tiers

| Tier | Engine | Build Time | Examples |
|------|--------|-----------|----------|
| **Micro** | Vue + CSS only | 2-4 hours | Clickers, trivia, card flip, reaction timer |
| **Light** | Canvas 2D API | 4-8 hours | Snake, Breakout, Flappy, Pong |
| **Standard** | Phaser 3 | 6-12 hours | Tower defense, Puzzle Bobble, platformer |
| **Complex** | Phaser 3 + state | 12-24 hours | Tycoon sim, RPG-lite, career game |

### Initial 50 Game Ideas

**Arcade (8):** Snake, Breakout, Asteroids, Frogger, Space Invaders, Pac-Man, Galaga, Pong

**Puzzle (8):** Tetris, 2048, Sudoku, Match-3, Minesweeper, Sokoban, Pipe Connect, Bubble Pop

**Strategy (5):** Chess, Checkers, Go, Tower Defense, Mini RTS

**Simulation (5):** Farm Sim, Restaurant Tycoon, Lemonade Stand, Startup Simulator, **Grey Flannel Suit** (career text game)

**Racing (4):** Top-Down Racer, Infinite Runner, Bike Trial, Drift Challenge

**Action (4):** Platformer, Zombie Shooter, Fruit Ninja clone, Whack-a-Mole

**Word (5):** Wordle clone, Hangman, Word Search, Anagram Solver, Typing Speed

**Card (4):** Solitaire, Memory Match, Blackjack, Poker Hands

**Idle (4):** Cookie Clicker, Mining Tycoon, Idle Farm, Evolution Clicker

**Trivia (3):** General Knowledge, Would You Rather, Personality Quiz

**Adventure (3):** Text RPG, Dungeon Crawler, Choose Your Own Adventure

**Experimental (3):** Color Mixing Game, Sound Puzzle, Social Dilemma Game

### Game SDK API (what every game gets for free)
```typescript
GameSDK.init(config)                    // Mount game, connect to portal
GameSDK.reportScore(score)              // Leaderboard integration
GameSDK.showAd('preroll'|'midroll'|'rewarded')  // Ad abstraction
GameSDK.track(event, data)              // Analytics
GameSDK.save(data) / GameSDK.load()     // Progress persistence
GameSDK.share({ score, text, image })   // Social sharing
GameSDK.getChallenge()                  // Challenge link data
GameSDK.daily.getToday()               // Daily challenge data
```

---

## Viral Sharing Strategy

1. **Challenge links** (highest ROI) - "I scored 847 on Snake - beat me!" with URL containing challenge data
2. **Emoji score cards** (Wordle-style) - Visual score representation for copy/paste
3. **Dynamic OG images** - Netlify Function generates social preview cards with score overlay
4. **Daily challenges** - One shared daily puzzle drives repeat visits + social discussion
5. **Share buttons** - Twitter/X, WhatsApp, Telegram with pre-filled text
6. **Embed codes** - Let bloggers embed games on their sites

---

## Phased Rollout

### Phase 0: Foundation (Weeks 1-2)
- [ ] Turborepo monorepo setup with portal + game-sdk + game-template
- [ ] Portal shell: Vue 3 + router + Tailwind CSS 4 + basic layout
- [ ] game-sdk: postMessage bridge, score reporting, basic ad slot
- [ ] 1 game deployed (Snake) as proof of concept
- [ ] Netlify deployment working end-to-end
- **Milestone:** One playable game live on the internet

### Phase 1: Core Experience (Weeks 3-6)
- [ ] 10 games across 5+ categories (mix of Micro/Light/Standard)
- [ ] Onboarding wizard
- [ ] Game discovery page with category filtering
- [ ] AdSense integration
- [ ] Basic sharing (copy link with score)
- **Milestone:** 10 playable games with ads generating first revenue

### Phase 2: Growth Mechanics (Weeks 7-12)
- [ ] 25 total games
- [ ] Challenge link system
- [ ] Daily challenge feature
- [ ] Dynamic OG images for sharing
- [ ] Rewarded video ads via GameDistribution
- [ ] Basic leaderboards (Neon PostgreSQL)
- **Milestone:** Viral loops active, revenue optimized

### Phase 3: Scale (Weeks 13-20)
- [ ] 50 total games
- [ ] Premium ad-free tier
- [ ] Achievement/badge system
- [ ] Game rating/favorites
- [ ] SEO content pages (game guides, tips)
- [ ] Seasonal events/themed collections
- **Milestone:** Sustainable revenue, growing organically

### Phase 4: Expand (Weeks 21-30)
- [ ] 75+ games
- [ ] User-generated content (level editors for select games)
- [ ] Mobile PWA optimization
- [ ] Community features (comments, replays)
- **Milestone:** Established game portal with loyal user base

---

## Critical Honest Assessment

**What works in this plan's favor:**
- AI agents can produce simple games fast (2-4 hours for Micro tier)
- Zero server costs initially (Netlify free tier + Neon free tier)
- Proven business model (CrazyGames, Poki both profitable)
- Vue 3 + Phaser 3 is a battle-tested combo

**What's risky:**
- **Quality > Quantity** - Poki accepts 5% of submissions. 20 polished games beat 100 mediocre ones
- **SEO takes 6-12 months** - Don't expect organic traffic quickly
- **Ad revenue is tiny at low traffic** - At 1K MAU with $2 RPM, that's ~$60/month
- **Game development is deceptive** - Even "simple" games need polish, balancing, bug fixing
- **Erotic content + AdSense = policy violation** - Must be a separate, non-AdSense monetized section or dropped entirely

**Recommendation:** Start with 10 extremely polished games, not 50 mediocre ones. Iterate on those 10 until they're genuinely fun and shareable. Then scale.

---

## Verification Plan
1. `turbo build` passes for all packages
2. Portal loads, routes work, game iframe loads
3. game-sdk postMessage communication works between portal and game
4. AdSense displays on game pages
5. Share link generates correct URL with challenge data
6. Netlify deploy succeeds from GitHub push
7. Lighthouse score > 90 on portal pages
8. Test on mobile (CEO's primary device)
