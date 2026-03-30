# GAMEBOOK — The Engagement & Addiction Playbook

> Internal agent team report — v2.0
> Compiled by 7 specialist agents | Focus: Gameplay mechanics only | Doctrine: No AI slop. No obvious takes. | Output: A repeatable game factory
>
> **Live version:** https://game-playbook-general.netlify.app/#designer

---

## Agent 01 — Chief Game Producer: THE ARCHITECTURE OF ADDICTION

Every successful game is engineered around one truth: **humans are prediction machines that crave being right, but are electrified by being surprised.** The entire job of a game designer is to set up predictions and then control exactly when and how they resolve.

> "The game doesn't need to be fun. It needs to feel like it's *about to become fun*."
> — Senior Producer heuristic, mobile game studios

### The Loop Hierarchy — The Non-Negotiable Foundation

Every engaging game operates on three nested loops. If any one of them fails, the whole thing collapses. Most devs understand these intellectually but build them wrong.

**Nested loop structure (outer → inner):**
- **Social Loop** — Ongoing (guilds, leaderboards, communities)
- **Meta Loop** — Days to weeks (progression, unlocks, seasons)
- **Core Loop** — 3–15 min (one session of play)
- **Micro Loop** — 2–30 sec (single action feedback)

Each loop feeds the next.

#### Micro Loop
The single-action feedback cycle. Tap — explosion. Move — satisfying sound. This must feel *good in isolation* before anything else matters. Candy Crush's pop. Vampire Survivors' number explosions. If the micro-loop is boring, nothing else can save the game.

#### Core Loop
What a player does in one session. It must contain: a **challenge**, a **decision**, and a **reward**. Clash Royale: build deck — battle — win/lose — optimize — battle again. This is the heartbeat. All content serves it.

#### Meta Loop
Why players return tomorrow. Progression, story, unlocks, seasonal events. The meta loop creates the *identity layer* — "I am a player who does X." This is what makes someone quit Netflix to play your game at 11pm.

### The "One More Turn" Principle — The Real Secret

The best game loops are designed to **always leave the player at a threshold**. Never end a session at a natural stopping point. End it right before one. The player who finishes a run in Hades and immediately starts another isn't addicted — they're being led, masterfully, by a cliff-edge of anticipation that was deliberately placed there.

> **Producer Rule #1:** The player should always be closer to something than they are to nothing. If they can stop cleanly, you've designed a stopping point. Design thresholds instead: 87% to the next upgrade. 2 kills to the next rank. Almost won that run. The discomfort of incompletion is your most powerful retention tool.

**Hot Take:** "The 'One More Turn' Principle Only Works When the Turn Has Texture." Everyone cites Civilization for one-more-turn. But the mechanism is not compulsion — it's unresolved tension. If your turns are flat (Farmville: click crop, wait, click again), one-more-turn doesn't apply. The principle only works when each loop introduces new decisions that feel meaningfully different. This is why idle games die at hour 10 and Civ games survive until 2am.

### What Every Genre Gets Right (Steal This)

| Genre | Core Loop Genius | Why It Works |
|-------|-----------------|-------------|
| **Roguelites** (Hades, Balatro, Slay the Spire) | Run — die — grow — run again | Death is progress. Every loss teaches. Player feels smarter, not punished. |
| **Idle / Clickers** (Cookie Clicker, AdVenture Capitalist) | Wait — collect — invest — wait bigger | Plays on the "watching numbers grow" dopamine loop. Requires almost no skill. Highly accessible. |
| **Battle Royale** (PUBG, Fortnite, Warzone) | Survive — top 10 — top 5 — win | Near-miss psychology. Getting to top 5 still feels like almost winning. Next run is irresistible. |
| **Match-3** (Candy Crush, Royal Match) | Tap — cascade — almost cleared — next level | Engineered difficulty curves. Near-miss mechanics. Failure rate is tuned, not random. |
| **Auto-Battlers** (TFT, Clash Royale) | Build comp — watch outcome — adapt | Removes execution pressure. Player focuses on strategy. More people feel "good" at it. |
| **Deck Builders** (Balatro, Slay the Spire) | Draft — run — synergy discovery — win/fail | Infinite build variety. Player feels creative genius when combos click. |

### Case Study: VAMPIRE SURVIVORS — THE $12M SOLO DEV

Made by one person. $3.99 price tag. Sold over 3 million copies in 4 months of Early Access. The design lesson is brutal simplicity: **one auto-attack mechanic plus exponential upgrade stacking.** Zero tutorials. The game proves that intrinsic loop satisfaction can replace all the psychology scaffolding mobile games bolt on. When the micro-loop is genuinely fun, everything else follows.

**3M+ copies. 1 developer. $3.99.**

---

## Agent 02 — Senior Game Designer: MECHANICS THAT ACTUALLY WORK

Good game feel is not magic. It's a precise set of decisions about **feedback timing, decision weight, and outcome satisfaction.**

### The 7 Core Mechanics That Reliably Drive Engagement

#### Mechanic #1 — Variable Reward
**The most powerful mechanic in games.** Not fixed rewards, not pure randomness — *variable ratio reinforcement*. The brain habituates to fixed patterns fast. Variable delivery (you might get a rare item, or you might not) keeps the dopamine system in a permanently elevated state of anticipation. Loot boxes, chest openings, mystery drops — the format varies. The principle never changes. This is why a chest takes 4 seconds to open instead of instant: anticipation IS the reward.

#### Mechanic #2 — Near-Miss Engineering
Losing by a narrow margin activates stronger re-engagement than losing badly. **Candy Crush is the master class.** Levels are tuned so players fail with one or two moves remaining — often by deliberate design. The near-miss tells the brain "you almost had it. One more try." Slot machine reels stop at 11 instead of 7 for the same reason. Build fail states that are obviously "almost."

#### Mechanic #3 — Collection & Completionism
The Pokedex is not a game mechanic. It is a psychological trap. **Humans have a pathological need to complete sets.** Once a player sees "17/20 collected," they cannot rest. This works in any genre. Cosmetic sets, achievement lists, card collections, map fog — all exploit the same hardwired completion instinct. Crucially: always show the player what they're MISSING. Don't hide locked items. Show them greyed out, tantalizing.

#### Mechanic #4 — Mastery with Visible Progress
Players need to feel they are improving. Not just stats going up — **demonstrable skill growth.** The player who beats a Dark Souls boss they died to 40 times experiences a high that is genuinely physiological. Design progression so players can see their own trajectory: replays, performance graphs, time improvements, efficiency scores. The feeling of becoming good at something is one of the most potent human experiences. Weaponize it.

#### Mechanic #5 — Meaningful Choices (Not Fake Ones)
Players can smell false depth. **Choices only engage when they have real trade-offs.** Not "sword A does 10 damage, sword B does 12 damage" — that's a false choice. Real choices: "fast but fragile vs slow but tanky" where both are genuinely viable. The deck-builder genre has perfected this. Every card pick in Slay the Spire is a genuine strategic dilemma. Fake choices produce disengagement. Real choices produce obsession.

#### Mechanic #6 — Loss Aversion as Fuel
Humans feel losses approximately twice as strongly as equivalent gains. **Streak mechanics, limited lives, and season pass expiry all exploit this.** Duolingo's streak shame mechanic is more powerful than any positive reward it offers. Losing a 30-day streak is genuinely painful — so players log in to avoid that pain, not for the joy of learning. Implement something the player doesn't want to lose. Then make losing it feel real.

#### Mechanic #7 — Power Fantasy Moments
Every 10-15 minutes, the player needs to feel *overpowered.* Not just good — unstoppable. Vampire Survivors builds entirely on this: by minute 15, your character is a god of destruction. Call of Duty's killstreak rewards do it. The "power spike" moment resets the dopamine baseline and gives the player something to chase back to. **Design your game to have at least one moment per session where the player laughs out loud from how powerful they feel.**

### Game Feel — The Layer Most Teams Skip

Mechanics are the skeleton. *Game feel* is the flesh. A match-3 game with identical mechanics can feel satisfying or hollow based purely on:

- **Feedback Timing:** Input-to-response must be under **200ms** to feel instantaneous. Above that: laggy. Sound effects must hit within 50ms of the action. Camera shake must start within the frame. Delays break the illusion.
- **Juice:** Particles, screen shake, number popups, flash effects, sound design. "Juicing" a mechanic means layering 5-8 simultaneous micro-feedbacks onto a single action. Candy Crush's block pop has: animation, sound, particle burst, score popup, and cascade preview. That's juice.
- **Audio Design:** The single highest-ROI polish investment. A satisfying "thwack" or "ding" can make a boring mechanic addictive. Study the sound design of Clash Royale's card plays — each one has a distinct tactile signature. Sound is the shortcut to emotional response.
- **Camera Language:** Subtle camera zoom on collision. Slowmo at critical moments. Camera pull-back to reveal scope. The camera is a storytelling tool in gameplay, not just a viewport. Most indie devs treat it as neutral. It never should be.

---

## Agent 03 — Behavioral Scientist: THE DOPAMINE CODE

The brain doesn't reward achievement. It rewards **the anticipation of achievement.** Dopamine fires at the moment of prediction — not at the moment of reward. This single insight changes how you design everything.

### Flow State — The Holy Grail

Mihaly Csikszentmihalyi's Flow model is not abstract psychology — it is a precision engineering spec. Flow occurs when challenge is approximately **15-20% above current skill level.** Below that: boredom. Above: anxiety and rage-quit. The game must constantly re-calibrate to keep players in this band.

> **Critical Design Insight:** The best games have **dynamic difficulty systems** that players never consciously notice. Resident Evil 4's AI adapts to player performance. Candy Crush's level designer hand-tunes fail rates. Mario Kart's rubberband AI gives the losing player boosts. *The goal is not fairness — it is the sensation of being in a close, winnable game at all times.*

### The 4 Psychological Drivers (Ranked by Impact)

| Driver | Mechanism | How to Exploit | Risk |
|--------|-----------|---------------|------|
| **Autonomy** | Need to control outcomes | Meaningful build choices, branching paths, player expression | Too many choices = paralysis. Keep to 2-4 meaningful decisions |
| **Competence** | Need to feel capable | Visible skill growth, difficulty that matches ability, tutorials that feel like play | Overconfidence leads to boredom. Always have a harder challenge ahead |
| **Relatedness** | Social comparison & belonging | Leaderboards, guilds, friend activity, gifting mechanics | Bad actors destroy communities fast. Moderation is a design constraint |
| **Purpose** | Feeling the effort matters | Narrative stakes, world impact, character investment | Most casual/hyper-casual games skip this successfully. Required for mid-core+ |

### The Sunk Cost Engine

The more a player invests in a game — time, money, identity, named characters, built bases, earned reputation — the more psychologically costly it is to quit. **This is not manipulation. It is emotional engagement.** Good games create genuine attachment. Bad games manufacture it cheaply.

- **Good Sunk Cost:** A character the player named and upgraded for 50 hours. A base they built strategically. A rank they grinded for. A high score they're defending. The investment is earned. The attachment is real.
- **Cheap Sunk Cost:** Daily login bonuses that create artificial streaks. Energy systems that make you check back to not "waste" refills. These create resentment, not attachment. Players quit angry when they realize they were being manipulated.

### FOMO — Done Right vs Done Wrong

**FOMO that works:** Seasonal content with clear timers, visible to everyone. The battle pass model: "Season ends in 23 days. Here's exactly what you'll lose." The player chooses whether to engage. The threat is real. Fortnite's seasonal skins have been bought by otherwise non-spending players purely because they won't be available again. Scarcity + clarity = FOMO that converts.

**FOMO that destroys:** Dark patterns: fake countdown timers, misleading "limited" labels on items that come back monthly, loot boxes with opaque odds. Players are sophisticated. When they realize the scarcity was manufactured, trust is permanently broken.

**Hot Take:** "FOMO is a Tax on Your Most Engaged Players." The people most harmed by FOMO mechanics — time-limited content, battle passes, expiring currencies — are the most engaged, most-spending players. You're monetizing anxiety. The games still alive after ten years (Minecraft, RuneScape, Counter-Strike) almost universally have low-FOMO monetization.

### The Identity Layer — Why Players Don't Quit

The most durable retention mechanism is identity formation. When a player begins to define themselves — even partially — as *"a Clash Royale player"* or *"a Diamond-rank Valorant player,"* quitting the game means losing part of their identity. **Design your game to be something players mention in conversation.** This is why leaderboards, guilds, ranked modes, and customization are not features — they are identity scaffolding.

### Case Study: AMONG US — THE SOCIAL RESURRECTION

Released in 2018. Peaked in 2020 with **60 million daily players** — with zero marketing spend. The design didn't change. The social context did. This is the definitive case study that a game's social mechanics can be latent and activated by cultural moments. **Design for social activation potential** — mechanics that become explosive when the right social conditions arise.

**60M daily players. $0 marketing.**

---

## Agent 04 — LiveOps & Retention Strategist: THE COLD MATH OF RETENTION

All game design ultimately serves one metric: **does the player come back tomorrow?** Everything else is philosophy until the numbers prove it.

### The D1 / D7 / D30 Framework

| Metric | Target | What It Measures |
|--------|--------|-----------------|
| D1 | 40-60% | Hook quality — is the first session broken? |
| D7 | 15-25% | Core loop — is the moment-to-moment satisfying? |
| D14 | 10-18% | Content depth — is there enough to do? |
| D30 | 6-12% | Meta loop — are there long-term goals? |

*Benchmarks for competitive mobile. Correct targets depend entirely on genre.*

### Retention by Genre (D1)

| Genre | D1 Retention |
|-------|-------------|
| Hyper-Casual | 35-40% |
| Casual (Match-3) | 30-40% |
| Mid-Core (RPG) | 25-35% |
| Hardcore (MOBA) | 20-30% |

### What Each Metric Tells You

- **D1 — Hook Quality:** Low D1 = your first session is broken. Onboarding is too long, core loop is confusing, or first-run experience underwhelms. Fix here first.
- **D7 — Core Loop:** Low D7 = the core loop isn't satisfying. Players tried it, got the picture, and moved on. Review difficulty curve, reward frequency, and session design.
- **D30 — Meta Loop:** Low D30 = no long-term goals. Players exhaust the content. You need progression systems, social hooks, seasonal content, or PvP.

### Case Study: POKEMON GO — THE D30 CLIFF

Niantic's own data (GDC 2017) showed D30 retention was **catastrophically low — around 4-5%** — despite world-record D1 numbers. The spike-and-cliff pattern became a case study in "virality without retention." **The hook got them in. The missing meta let them out.**

**D1: Record-breaking. D30: ~4%.**

### Session Design — An Underrated Retention Tool

| Platform | Ideal Session | Sessions/Day | Implication |
|----------|--------------|-------------|------------|
| Hyper-Casual Mobile | 30 sec - 2 min | 10-15 | One-tap start. Instant feedback. Ad cadence every 2-3 games. |
| Mid-Core Mobile | 5-15 min | 3-6 | Natural break points. Push notifications. Energy/timer systems. |
| PC Casual | 20-45 min | 1-2 | One solid run or session. Players choose their own exit. |
| PC Core | 60-180 min | 1 | Deep investment. Social features and community matter more. |

### The New-Player Experience (NPE)

90% of churn happens in the first 3 minutes for hyper-casual, first 10 minutes for mid-core. **Your tutorial is not an instruction manual. It is a demo of the most satisfying part of your game.**

> **NPE Rule:** First win within *60 seconds* of opening the game. Engineered to be nearly impossible to fail. First loss comes later and feels fair. First "wow" moment within 3 minutes. If it doesn't come, they're gone.

**Hot Take:** "Onboarding Length is Inversely Correlated with Core Loop Quality." The longer your required tutorial, the weaker your core loop. Clash Royale: 3-minute onboarding. Mobile Legends: 25-minute onboarding. Which one has better D7? It's not close.

### Monetization Models That Don't Kill Retention

| Model | Description |
|-------|------------|
| **Cosmetics Only** | League of Legends model. Core gameplay free and fair. Revenue from skins, emotes, wards. Zero power purchased. Trust intact. Long-tail revenue. |
| **Season Pass** | Free + premium tracks. Creates FOMO without P2W. Fortnite validated at scale. **15-25% conversion** on active players. |
| **Time Compression** | Pay to skip the wait, not to skip the game. Player who doesn't pay still wins — eventually. Power gap is time, not capability. |
| **Pay-to-Win (Kill This)** | Fastest way to destroy a game. Players who don't pay feel cheated. Players who do pay lose satisfaction. Community goes toxic. Never recovers. |

**Key Revenue Benchmarks:**
- F2P Payer Rate: 1-5% (industry average)
- Whale Revenue: 50%+ (from top 1% of payers)
- Fortnite 2018: $2.4B (Battle Pass year)
- Candy Crush: ~$1B/yr (12 years running)

---

## Agent 05 — The Critic (Devil's Advocate): WHAT KILLS GAMES DEAD

Most game post-mortems blame market conditions, competition, or marketing budget. **That's almost always wrong.** Games die because of specific, identifiable design failures.

### The Death List

1. **Boring core loop.** No amount of meta-game, story, or marketing saves a boring core loop. If the moment-to-moment action isn't satisfying, stop and fix it before adding anything else. Ask "is the thing I do every 30 seconds fun?"
2. **Onboarding that teaches instead of plays.** Tutorial hell: 5-minute unskippable instructions before the player touches the game. Every tutorial element should be embedded in play, not explained in UI. Show, don't tell.
3. **Feedback vacuum.** The player doesn't know if they're winning, losing, or improving. Vague outcomes, silent failures, no visible score. The HUD is not a UI problem — it is a psychology problem.
4. **The plateau wall.** Player hits a difficulty spike or grind gate — progress stops. They can't advance without paying, grinding for hours, or getting lucky. This is where 80% of mid-core games lose their audience.
5. **Illusion of depth.** Content that looks varied but plays identically. 50 weapons that are all "attack faster." Depth requires genuinely new verbs — new actions, not just better numbers.
6. **Pay-to-win that breaks the social contract.** Selling power destroys trust permanently. The player who was out-spent, not out-played, doesn't rage-quit. They leave silently and review bomb you.
7. **Energy systems done wrong.** A hard stop — "come back in 3 hours" — trains players to find a different game. And then they don't come back.
8. **The Sequel Trap.** Launching a sequel that invalidates player investment. Clash of Clans avoided this by never releasing a sequel — they expanded the original. Players with 4 years invested won't move voluntarily.

### Case Study: CANDY CRUSH LEVEL 65 — THE WALL THAT PRINTS MONEY

King deliberately designs "frustration walls." Level 65 was the infamous gate where **~80% of free players churned or converted.** The saving mechanic? "Ask friends for lives" — a social loop that extended session time and drove viral acquisition simultaneously.

**80% churn at Level 65. Still ~$1B/year.**

### The Overrated Mechanics Hall of Shame

- Random Ads Every 2 Games
- Unskippable Intros
- Day 1 Social Share Prompts
- Hard Energy Walls at Level 5
- Mandatory Account Creation
- Loot Box Odds Hidden by Default
- Fake Review Prompts
- Fake "You Won!" Loading Screens
- Push Notification Spam
- 7-Day Login Bonus Without Catch-Up

---

## Agent 06 — Technical Lead / Game Engineer: WHAT TECHNOLOGY ENABLES & KILLS

The game designer's vision is constrained by technical reality. The best mechanics fail at launch if the frame rate drops or the server latency makes PvP feel broken.

### Performance Is a Game Mechanic

**60fps vs 30fps changes how satisfying a game feels, independent of content.** The physical sensation of responsiveness is part of game feel.

**Critical Thresholds:**
- Input latency: Under 16ms = instant
- Audio latency: Under 50ms or feedback breaks
- Load times: Under 3s or 40% abandon
- Frame rate: 60fps minimum for action
- Network (PvP): Under 80ms or feels unfair

**Architecture Patterns:**
- **Client-side prediction:** Makes network games feel local. Non-negotiable for real-time PvP.
- **Event-driven feedback:** Decoupled audio/visual from game logic.
- **Replay system:** Enables kill cams, replays, anti-cheat, content sharing — one architecture.

### Analytics as a Design Tool

Instrument from day one. The questions your analytics must answer:

1. **Where do players quit during onboarding?** — Funnels by screen/event. Drop-off at step 4 means step 4 is broken.
2. **Session length distribution?** — 2 min or 22? Both OK if expected. Both wrong if not.
3. **Highest retry rate levels?** — Your difficulty curve made visible. Outlier retry rates = bad tuning.
4. **Player death heatmap?** — Spatial data shows design problems playtesting misses.
5. **% reaching the meta loop?** — If only 10% reach guild/prestige/PvP, early game is bleeding retention.

### Game Factory Architecture

> **Architecture Recommendation:** Mechanics as modules, themes as skins. Abstract your core loop into a data-driven engine. Level parameters, difficulty curves, reward tables, and visual themes should all be config files — not hardcoded. Ship 20 game variants without rewriting the engine. Define mechanic archetypes first (match-3, idle, endless-runner, puzzle), build each once, then skin and tune.

---

## Agent 07 — The Sound Architect: THE LAYER NOBODY TALKS ABOUT

Sound design gets **0.5% of the budget and is worth 5%.** Most studios spend 15-20% on art and under 2% on audio. Sound is the only sense that works subliminally — it bypasses conscious attention. Slot machine designers have known this for 40 years. Game designers rediscover it at every GDC and then underfund audio anyway.

> "Your game's most important sound is the one that plays when the player does nothing."
> — The ambient loop tells the player whether your world is alive or dead

### The Slot Machine Principle

Every mobile casino game plays a distinct sound on every win, even tiny ones. Coin sounds, chime clusters, ascending tones. This is **decades of behavioral research monetized into audio cues.** Your game's reward sounds are your most direct line to the dopamine circuit. A poorly tuned win sound can cut conversion by 20-30%.

> **Sound Design Rule #1:** Every positive outcome needs a distinct, ascending audio signature. The sound must: (1) arrive within 50ms of the action, (2) have ascending pitch and harmonic richness, (3) be variable enough to avoid fatigue after 500 hearings. The Clash Royale chest-opening sound was iterated for weeks. Not an afterthought.

### Juice vs. Noise — The Hierarchy

"Juice" has a failure mode: **noise fatigue.** When every action is equally loud, nothing feels special.

- **Layer 1 — Ambient:** Constant, subconscious. The breathing of the world. Environmental textures, background music, spatial cues. The player shouldn't notice it — but they'll immediately notice if it stops.
- **Layer 2 — Interactive:** Responsive to player input. Taps, clicks, movements. Must feel tactile — like touching a real surface. Each interaction type needs its own signature.
- **Layer 3 — Reward:** Rare, big, memorable. Level-ups, loot drops, boss defeats. These sounds should be *earned*. If they play too often, they lose power. Sound scarcity mirrors game scarcity.

### The Mute Button Problem

**50-70% of mobile players play with sound off.** Every audio cue must have a visual or haptic counterpart.

- **The Rule:** For every audio cue, ask: "What does this moment feel like with sound off?" If "nothing" — add a visual or haptic fallback. The best games are fully playable muted. Sound makes them *addictive.*
- **The Three Channels:**
  - **Audio:** Emotional coloring, spatial awareness, reward signaling
  - **Visual:** State clarity, progress, juice effects
  - **Haptic:** Confirmation, impact, urgency
  - All three fire in sync. Missing one is tolerable. Missing two is broken.

### Music as Pacing Tool

Transistor lets players toggle the vocal track mid-song. Hades dynamically switches music layers based on combat intensity. **These are retention mechanics.** Music that adapts to player state keeps the sensory environment novel and extends time-in-session.

> **Adaptive Audio Architecture:** Build music in **horizontal layers** (stems mixed in/out) and **vertical transitions** (crossfade points triggered by game events). Calm exploration adds percussion when enemies appear, swells for bosses. The player never hears a "music change" — they feel the tension shift.

### Sound Branding — Your Invisible Logo

The League of Legends level-up sound. The Pokemon battle fanfare. The Among Us emergency meeting alarm. The Minecraft dirt-break crunch. **Brand assets worth millions.** They trigger recall in 200ms.

**Hot Take:** Every game should have 3-4 signature sounds as distinctive as its logo. The startup chime. The main reward sound. The fail/death sound. The "something big" stinger. Custom-designed, not stock. They cost a fraction of what art costs — and carry just as much brand identity.

---

## THE PLAYBOOK — 24 Rules Your Game Factory Builds Around

### Loop Laws
1. The micro-loop (single action) must feel satisfying in isolation, before any progression or reward system is added. If it's not fun to tap/click/move once, fix that first.
2. Always leave the player at a threshold. End sessions at 87%, not 100%. The discomfort of incompletion is your strongest retention tool.
3. Design at least one "power fantasy moment" per session — a moment the player feels overwhelmingly capable.
4. Failure must teach, not just punish. The player who quits after death is a design failure. The player who immediately retries is a design success.

### Psychology Laws
5. Variable reward schedules outperform fixed ones. Never make rewards perfectly predictable. Anticipation IS the reward.
6. Near-miss mechanics are not optional. Tune fail states so players almost win. The "one more try" feeling is manufactured, not accidental.
7. Show players what they're missing, not what they have. Greyed-out locked content is more motivating than unlocked content screens.
8. Design an identity layer. The player should be able to tell a friend what kind of player they are.
9. Loss aversion outperforms gain attraction. Streaks, stakes, and threatened progress keep players more than any reward.

### Experience Laws
10. First win within 60 seconds of install. The NPE is your most important design problem.
11. The tutorial is a demo, not a manual. Every instruction must be embedded in a satisfying play moment.
12. Target flow state: challenge 15-20% above current skill. Build dynamic difficulty from day one.
13. Juice the micro-loop. Layer 5-8 simultaneous feedback signals onto every core action.

### Sound Laws
14. Every positive outcome needs a distinct, ascending audio signature within 50ms. Sound is your direct line to dopamine.
15. Maintain the sound hierarchy: ambient (constant) > interactive (responsive) > reward (rare). When everything is loud, nothing is special.
16. Design for muted players. Every audio cue needs a visual or haptic counterpart. 50-70% play with sound off.

### Retention Laws
17. Track D1/D7/D30 from soft launch. D1 = onboarding. D7 = core loop. D30 = meta. Diagnose before adding content.
18. Session length must match platform. Mobile casual: 2-5 min. PC core: 60+ min. Design exit points for mobile, resist them for PC.
19. FOMO works when scarcity is real and visible. Fake countdowns create short-term conversion and permanent trust destruction.

### Monetization Laws
20. Cosmetics before power. Paying player = expressive. Non-paying player = fair. Violating this ends games.
21. Time compression, not capability gates. "Pay to skip the wait" is fair. "Pay to win" is a broken social contract.

### Factory Laws
22. Pick 3-5 mechanic archetypes and build each to excellence before skinning. Variations come from config, not rewriting.
23. Instrument everything from launch. Heatmaps, retry rates, session lengths, funnels. Analytics is your second game designer.
24. The game is never finished — it is launched and iterated. Ship when the core loop is fun and the first 3 minutes are excellent.

---

### Final Case Study: WORDLE — THE SHARE MECHANIC THAT CONQUERED THE WORLD

Josh Wardle built it for his partner. Added one feature: a share-results grid (green/yellow/gray). Fastest-growing word-of-mouth game of the decade. **A single shareability mechanic outperformed any ad spend.** NYT acquired it for seven figures, January 2022.

**0 to 2M players in 3 months. $0 ads.**

---

> *The game that wins is not the most creative. It is the most deliberately engineered.*
>
> v2.0 — compiled 2025 — 7 agents, 0 fired
