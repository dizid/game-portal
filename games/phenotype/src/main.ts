import { audio } from './audio.js'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ─────────────────────────────────────────────────────────────────────

type TraitName = 'speed' | 'armor' | 'camo' | 'size' | 'metabolism'

interface Creature {
  id: number
  name: string
  traits: Record<TraitName, number> // 0–10
  selected: boolean
  survived: boolean | null  // null = not yet evaluated
  dead: boolean
}

interface EnvironmentChallenge {
  name: string
  description: string
  // bonus traits get added to survival probability
  bonusTraits: TraitName[]
  penaltyTraits: TraitName[]
}

// ── Data ──────────────────────────────────────────────────────────────────────

const TRAIT_NAMES: TraitName[] = ['speed', 'armor', 'camo', 'size', 'metabolism']
const TRAIT_COLORS: Record<TraitName, string> = {
  speed: '#55ccff',
  armor: '#aaaaaa',
  camo: '#88cc44',
  size: '#ff9944',
  metabolism: '#ff55aa',
}

const CREATURE_NAMES = [
  'Arion', 'Brix', 'Clave', 'Draven', 'Elix', 'Fenn',
  'Gorax', 'Hex', 'Ibix', 'Jace', 'Krix', 'Lorn',
  'Mox', 'Nev', 'Orex', 'Pyx', 'Quin', 'Rax',
  'Sev', 'Trix', 'Ulvex', 'Vorn', 'Wyx', 'Xan',
]

const ENVIRONMENTS: EnvironmentChallenge[] = [
  { name: 'Predator Wave', description: 'Fast predators strike! Speed or Armor help survival.', bonusTraits: ['speed', 'armor'], penaltyTraits: ['size'] },
  { name: 'Famine Season', description: 'Food is scarce. Low Metabolism creatures survive best.', bonusTraits: ['metabolism'], penaltyTraits: ['size', 'speed'] },
  { name: 'Great Flood', description: 'Waters rise. Large creatures have an advantage.', bonusTraits: ['size', 'armor'], penaltyTraits: ['metabolism'] },
  { name: 'Disease Outbreak', description: 'Plague spreads. Camouflage and Speed help avoid it.', bonusTraits: ['camo', 'speed'], penaltyTraits: ['armor'] },
  { name: 'Drought', description: 'Extreme heat. Low Metabolism survives longer.', bonusTraits: ['metabolism', 'camo'], penaltyTraits: ['size', 'speed'] },
  { name: 'Ice Age', description: 'Cold snap! Armor and Size retain heat.', bonusTraits: ['armor', 'size'], penaltyTraits: ['metabolism'] },
  { name: 'Ambush Predators', description: 'Invisible hunters. Camo is critical!', bonusTraits: ['camo', 'speed'], penaltyTraits: [] },
  { name: 'Territorial Wars', description: 'Combat for territory. Armor and Speed dominate.', bonusTraits: ['armor', 'speed'], penaltyTraits: ['camo'] },
  { name: 'Parasites', description: 'Tiny parasites target large, slow creatures.', bonusTraits: ['speed', 'metabolism'], penaltyTraits: ['size', 'armor'] },
  { name: 'Firestorm', description: 'Wildfires sweep! Camouflage and Speed save lives.', bonusTraits: ['speed', 'camo'], penaltyTraits: ['size'] },
]

// ── State ─────────────────────────────────────────────────────────────────────

let creatures: Creature[] = []
let generation = 1
let score = 0
let totalSurvivors = 0
let bestScore = 0
let phase: 'select' | 'result' | 'breed' | 'gameover' = 'select'
let currentEnv: EnvironmentChallenge | null = null
let selected: number[] = []
let envSequence: EnvironmentChallenge[] = []
let envIndex = 0
let creatureIdCounter = 0
const MAX_GENERATIONS = 15

// ── Logic ─────────────────────────────────────────────────────────────────────

function randomTraits(): Record<TraitName, number> {
  const t: Partial<Record<TraitName, number>> = {}
  for (const tn of TRAIT_NAMES) t[tn] = Math.floor(Math.random() * 10) + 1
  return t as Record<TraitName, number>
}

function makeCreature(traits?: Record<TraitName, number>): Creature {
  return {
    id: creatureIdCounter++,
    name: CREATURE_NAMES[creatureIdCounter % CREATURE_NAMES.length] + '-' + creatureIdCounter,
    traits: traits ?? randomTraits(),
    selected: false,
    survived: null,
    dead: false,
  }
}

function crossover(a: Creature, b: Creature): Creature {
  const traits: Partial<Record<TraitName, number>> = {}
  for (const tn of TRAIT_NAMES) {
    // 50/50 from either parent + small mutation
    const base = Math.random() < 0.5 ? a.traits[tn] : b.traits[tn]
    const mutation = (Math.random() - 0.5) * 2  // -1 to +1
    traits[tn] = Math.max(1, Math.min(10, Math.round(base + mutation)))
  }
  return makeCreature(traits as Record<TraitName, number>)
}

function survivalProbability(c: Creature, env: EnvironmentChallenge): number {
  let prob = 0.5
  for (const bt of env.bonusTraits) {
    prob += (c.traits[bt] / 10) * 0.15
  }
  for (const pt of env.penaltyTraits) {
    prob -= (c.traits[pt] / 10) * 0.1
  }
  return Math.max(0.05, Math.min(0.95, prob))
}

function initEnvSequence(): void {
  // 3-cycle hidden pattern with noise
  const base: EnvironmentChallenge[] = [
    ENVIRONMENTS[0], ENVIRONMENTS[1], ENVIRONMENTS[2],
    ENVIRONMENTS[0], ENVIRONMENTS[1], ENVIRONMENTS[3],
    ENVIRONMENTS[0], ENVIRONMENTS[4], ENVIRONMENTS[2],
  ]
  envSequence = []
  for (let i = 0; i < MAX_GENERATIONS; i++) {
    const baseEnv = base[i % base.length]
    // Add noise: 20% chance of random substitution
    if (Math.random() < 0.2) {
      envSequence.push(ENVIRONMENTS[Math.floor(Math.random() * ENVIRONMENTS.length)])
    } else {
      envSequence.push(baseEnv)
    }
  }
  envIndex = 0
}

function startRound(): void {
  currentEnv = envSequence[envIndex]
  // Reset selection state
  for (const c of creatures) {
    c.selected = false
    c.survived = null
  }
  selected = []
  phase = 'select'
  renderUI()
}

function evaluate(): void {
  if (!currentEnv) return
  phase = 'result'

  const log = document.getElementById('result-log')!
  const line = document.createElement('div')
  line.className = 'log-line log-event'
  line.textContent = `Gen ${generation}: ${currentEnv.name}`
  log.appendChild(line)

  let genSurvivors = 0
  for (const c of creatures) {
    if (!c.selected) {
      c.survived = false
      c.dead = true
      continue
    }
    const prob = survivalProbability(c, currentEnv)
    const survived = Math.random() < prob
    c.survived = survived
    if (survived) {
      genSurvivors++
      totalSurvivors++
      score += 10
      audio.score()
    }
    const line2 = document.createElement('div')
    line2.className = 'log-line ' + (survived ? 'log-survivor' : 'log-dead')
    const pct = Math.round(prob * 100)
    line2.textContent = `  ${c.name}: ${survived ? 'SURVIVED' : 'DIED'} (${pct}% chance)`
    log.appendChild(line2)
  }
  log.scrollTop = log.scrollHeight

  ;(document.getElementById('surv-val') as HTMLSpanElement).textContent = String(totalSurvivors)
  ;(document.getElementById('score-val') as HTMLSpanElement).textContent = String(score)

  renderUI()

  // Auto-advance after 2 seconds
  setTimeout(() => {
    breed(genSurvivors)
  }, 2000)
}

function breed(survivorCount: number): void {
  const survivors = creatures.filter(c => c.survived === true)

  if (survivors.length === 0) {
    // No survivors — inject random new creatures
    const newCreatures: Creature[] = []
    for (let i = 0; i < 8; i++) newCreatures.push(makeCreature())
    creatures = newCreatures
  } else {
    // Breed new generation to 8 creatures
    const newCreatures: Creature[] = [...survivors.map(c => ({
      ...c,
      selected: false,
      survived: null,
      dead: false,
    }))]

    const needed = 8 - survivors.length
    for (let i = 0; i < needed; i++) {
      const a = survivors[Math.floor(Math.random() * survivors.length)]
      const b = survivors[Math.floor(Math.random() * survivors.length)]
      newCreatures.push(crossover(a, b))
    }
    creatures = newCreatures
  }

  if (survivorCount > 0) audio.levelUp()

  generation++
  envIndex++

  if (generation > MAX_GENERATIONS) {
    endGame()
    return
  }

  startRound()
}

// ── Render ─────────────────────────────────────────────────────────────────────

function renderUI(): void {
  const grid = document.getElementById('creatures-grid')!
  while (grid.firstChild) grid.removeChild(grid.firstChild)

  for (const c of creatures) {
    const card = document.createElement('div')
    card.className = 'creature-card'
    if (c.selected) card.classList.add('selected')
    if (c.survived === false || c.dead) card.classList.add('dead')
    if (c.survived === true) card.classList.add('survivor')

    const badge = document.createElement('div')
    badge.className = 'select-badge'
    badge.textContent = String(selected.indexOf(c.id) + 1)

    const nameEl = document.createElement('div')
    nameEl.className = 'card-name'
    nameEl.textContent = c.name

    card.appendChild(badge)
    card.appendChild(nameEl)

    for (const tn of TRAIT_NAMES) {
      const row = document.createElement('div')
      row.className = 'trait-bar-row'
      const label = document.createElement('div')
      label.className = 'trait-label'
      label.textContent = tn.slice(0, 3).toUpperCase()
      const bg = document.createElement('div')
      bg.className = 'trait-bar-bg'
      const fill = document.createElement('div')
      fill.className = 'trait-bar-fill'
      fill.style.width = (c.traits[tn] / 10 * 100) + '%'
      fill.style.background = TRAIT_COLORS[tn]
      bg.appendChild(fill)
      row.appendChild(label)
      row.appendChild(bg)
      card.appendChild(row)
    }

    if (phase === 'select') {
      card.addEventListener('click', () => toggleSelect(c.id))
    }

    grid.appendChild(card)
  }

  // Env panel
  if (currentEnv) {
    ;(document.getElementById('env-desc') as HTMLParagraphElement).textContent = currentEnv.description
    const envTraits = document.getElementById('env-traits')!
    while (envTraits.firstChild) envTraits.removeChild(envTraits.firstChild)
    for (const bt of currentEnv.bonusTraits) {
      const tag = document.createElement('div')
      tag.className = 'trait-tag'
      tag.textContent = '+' + bt
      tag.style.color = TRAIT_COLORS[bt]
      envTraits.appendChild(tag)
    }
    for (const pt of currentEnv.penaltyTraits) {
      const tag = document.createElement('div')
      tag.className = 'trait-tag'
      tag.textContent = '-' + pt
      tag.style.borderColor = 'rgba(255,100,100,0.5)'
      tag.style.color = '#ff9999'
      envTraits.appendChild(tag)
    }
  }

  // Gen/phase HUD
  ;(document.getElementById('gen-val') as HTMLSpanElement).textContent = String(generation)
  ;(document.getElementById('phase-val') as HTMLSpanElement).textContent = phase === 'select' ? 'Select' : phase === 'result' ? 'Evaluating' : 'Breeding'

  // Action button
  const btn = document.getElementById('action-btn') as HTMLButtonElement
  if (phase === 'select') {
    btn.textContent = selected.length === 4 ? 'Survive!' : `Select ${4 - selected.length} more`
    btn.disabled = selected.length !== 4
  } else {
    btn.textContent = 'Evaluating...'
    btn.disabled = true
  }
}

function toggleSelect(id: number): void {
  if (phase !== 'select') return
  const c = creatures.find(cr => cr.id === id)!
  if (c.selected) {
    c.selected = false
    selected = selected.filter(s => s !== id)
  } else if (selected.length < 4) {
    c.selected = true
    selected.push(id)
    audio.click()
  }
  renderUI()
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function buildOverlay(title: string, body: string, btnLabel: string, onBtn: () => void): void {
  const ov = document.getElementById('overlay')!
  while (ov.firstChild) ov.removeChild(ov.firstChild)
  const h1 = document.createElement('h1')
  h1.textContent = title
  const p = document.createElement('p')
  p.textContent = body
  const btn = document.createElement('button')
  btn.textContent = btnLabel
  btn.addEventListener('click', onBtn)
  ov.appendChild(h1)
  ov.appendChild(p)
  ov.appendChild(btn)
  ov.style.display = 'flex'
}

function endGame(): void {
  phase = 'gameover'
  audio.death()
  if (score > bestScore) {
    bestScore = score
    saveBestScore(score)
  }
  reportGameOver(score)
  const msg = score >= 100 ? 'Master Evolutionist!' : score >= 50 ? 'Natural Selection Pro!' : 'Keep adapting!'
  buildOverlay(
    'Evolution Complete',
    `${MAX_GENERATIONS} generations done! ${totalSurvivors} total survivors. Score: ${score}. ${msg}`,
    'Evolve Again',
    startGame,
  )
}

function startGame(): void {
  generation = 1
  score = 0
  totalSurvivors = 0
  selected = []
  creatureIdCounter = 0
  phase = 'select'
  const log = document.getElementById('result-log')!
  while (log.firstChild) log.removeChild(log.firstChild)

  initEnvSequence()

  creatures = []
  for (let i = 0; i < 8; i++) creatures.push(makeCreature())

  const ov = document.getElementById('overlay')!
  ov.style.display = 'none'

  audio.start()
  startRound()
}

// ── Action button ─────────────────────────────────────────────────────────────

document.getElementById('action-btn')!.addEventListener('click', () => {
  if (phase === 'select' && selected.length === 4) {
    evaluate()
  }
})

// ── Mute ──────────────────────────────────────────────────────────────────────

const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

document.getElementById('start-btn')!.addEventListener('click', startGame)
initSDK().then(({ bestScore: saved }) => { bestScore = saved })
