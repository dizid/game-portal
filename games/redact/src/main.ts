import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Types ─────────────────────────────────────────────────────────────────────

type WordCategory = 'color' | 'name' | 'location' | 'number' | 'adjective' | 'noun' | 'other'

type RuleType =
  | 'remove_colors'
  | 'keep_names'
  | 'remove_locations'
  | 'remove_numbers_over_100'
  | 'keep_adjective_per_sentence'
  | 'max_redactions_per_sentence'
  | 'remove_adjectives'
  | 'keep_nouns'

interface Rule {
  type: RuleType
  label: string
  param?: number   // e.g. max redactions for max_redactions_per_sentence
  satisfied: boolean
}

interface Word {
  text: string           // display text (original casing)
  lower: string          // lowercase for matching
  category: WordCategory
  redacted: boolean
  // Animation state
  redactAnim: number     // 0–1, wipe progress for redact
  unredactAnim: number   // 0–1, dissolve progress for un-redact (counts down from 1)
  // Layout (computed each frame)
  x: number
  y: number
  width: number
  height: number
  sentence: number       // which sentence this word belongs to (0-indexed)
}

interface Document {
  title: string
  words: Word[]
  rules: Rule[]
}

type GameState = 'READY' | 'REVIEWING' | 'SUBMITTED' | 'TRANSITION' | 'GAME_OVER'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  size: number
  color: string
}

interface FloatText {
  x: number
  y: number
  text: string
  alpha: number
  color: string
  vy: number
}

// ── Canvas + DOM ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const docEl = document.getElementById('doc-value') as HTMLSpanElement
const bestEl = document.getElementById('best-value') as HTMLSpanElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

function resizeCanvas(): void {
  const cont = canvas.parentElement!
  const w = cont.clientWidth
  const h = cont.clientHeight
  // Leave room for HUD at top (~50px)
  const sz = Math.min(w, h - 50)
  canvas.width = Math.max(320, sz)
  canvas.height = Math.max(320, sz)
  canvas.style.width = `${canvas.width}px`
  canvas.style.height = `${canvas.height}px`
}
resizeCanvas()
window.addEventListener('resize', resizeCanvas)
muteBtn.addEventListener('click', () => {
  muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊'
})

// ── Word category data ────────────────────────────────────────────────────────

const COLOR_WORDS = new Set([
  'red', 'blue', 'green', 'white', 'brown', 'crimson', 'pink', 'purple',
  'black', 'golden', 'gray', 'yellow', 'orange'
])

const NAME_WORDS = new Set([
  'carter', 'sophia', 'johnson', 'smith', 'chen', 'davis', 'yuki', 'wright',
  'falcon', 'miller'
])

const LOCATION_WORDS = new Set([
  'berlin', 'paris', 'chicago', 'london', 'denver', 'portland', 'moscow',
  'miami', 'seattle', 'tokyo', 'kabul', 'kyoto'
])

const ADJECTIVE_WORDS = new Set([
  'tall', 'beautiful', 'large', 'ambitious', 'original', 'overdue', 'urgent',
  'suspicious', 'wonderful', 'gorgeous', 'old', 'annual', 'ancient', 'spectacular',
  'amazing', 'quarterly', 'immediate', 'finest', 'controversial', 'lethal',
  'unmarked', 'hidden', 'required', 'sunny', 'warm', 'void', 'unauthorized',
  'classified', 'verified', 'darling'
])

const NOUN_WORDS = new Set([
  'vehicles', 'station', 'documents', 'sunset', 'eyes', 'roses', 'earnings',
  'targets', 'flour', 'eggs', 'oven', 'street', 'damages', 'agreement', 'grant',
  'bridge', 'residents', 'operative', 'bills', 'packages', 'avenue', 'ceramics',
  'temples', 'eagle', 'sector', 'force', 'views', 'mountains', 'shrines',
  'decision', 'initiative', 'regatta'
])

// Number token: contains a digit
function isNumberToken(lower: string): boolean {
  return /\d/.test(lower)
}

// Extract numeric value from a token for "> 100" checks
function extractNumber(lower: string): number {
  const m = lower.match(/\d+/)
  if (!m) return 0
  return parseInt(m[0], 10)
}

function categorizeWord(raw: string): WordCategory {
  const lower = raw.toLowerCase()
  if (isNumberToken(lower)) return 'number'
  const alpha = lower.replace(/[^a-z]/g, '')
  if (COLOR_WORDS.has(alpha)) return 'color'
  if (NAME_WORDS.has(alpha)) return 'name'
  if (LOCATION_WORDS.has(alpha)) return 'location'
  if (ADJECTIVE_WORDS.has(alpha)) return 'adjective'
  if (NOUN_WORDS.has(alpha)) return 'noun'
  return 'other'
}

// ── Document definitions ──────────────────────────────────────────────────────

interface DocDef {
  title: string
  text: string
  rules: RuleType[]
  ruleParams?: (number | undefined)[]
}

const DOC_DEFS: DocDef[] = [
  // --- Warm-up: 2 rules, no contradictions (docs 1-4) ---
  {
    title: 'Intelligence Report',
    text: 'Agent CARTER observed three RED vehicles near the BERLIN station. Asset value: $4500. The TALL operative carried BLUE documents.',
    rules: ['remove_colors', 'keep_names'],
  },
  {
    title: 'Love Letter',
    text: 'My DARLING SOPHIA, the CRIMSON sunset over PARIS reminded me of your BEAUTIFUL eyes. I sent 200 ROSES.',
    rules: ['keep_names', 'remove_colors'],
  },
  {
    title: 'Corporate Memo',
    text: 'The QUARTERLY earnings of $12000 exceeded our AMBITIOUS targets in CHICAGO. VP JOHNSON approved the GREEN initiative.',
    rules: ['keep_names', 'remove_locations'],
  },
  {
    title: 'Recipe',
    text: 'Combine 250g of WHITE flour with 3 LARGE BROWN eggs. Bake at 180 degrees in LONDON\'s FINEST oven.',
    rules: ['remove_colors', 'keep_nouns'],
  },

  // --- Mild tension: 3 rules (docs 5-8) ---
  {
    title: 'Legal Contract',
    text: 'DEFENDANT SMITH of 42 OAK Street, DENVER, owes $8500 in OVERDUE damages. The ORIGINAL agreement was VOID.',
    rules: ['keep_names', 'remove_locations', 'keep_nouns'],
  },
  {
    title: 'News Report',
    text: 'MAYOR CHEN announced a $50000 grant for the OLD BLUE bridge in PORTLAND. The CONTROVERSIAL decision shocked 15000 residents.',
    rules: ['keep_names', 'remove_colors', 'remove_numbers_over_100'],
  },
  {
    title: 'Spy Transcript',
    text: 'FALCON confirmed 7 RED targets near MOSCOW perimeter. URGENT: the TALL GRAY operative has $3200 in UNMARKED bills.',
    rules: ['keep_names', 'remove_colors', 'remove_locations'],
  },
  {
    title: 'Weather Forecast',
    text: 'SUNNY skies over MIAMI with 95 degree WARM temperatures. BEAUTIFUL day for the ANNUAL BLUE regatta.',
    rules: ['remove_colors', 'remove_adjectives', 'keep_nouns'],
  },

  // --- Hard contradictions: 3-4 rules (docs 9-12) ---
  {
    title: 'Police Report',
    text: 'Officer DAVIS spotted 4 LARGE SUSPICIOUS packages near GREEN avenue, SEATTLE. Estimated value: $15000. IMMEDIATE action REQUIRED.',
    rules: ['keep_names', 'remove_colors', 'remove_numbers_over_100', 'keep_nouns'],
  },
  {
    title: 'Diary Entry',
    text: 'WONDERFUL day in TOKYO. Spent $300 on GORGEOUS PINK ceramics. My OLD friend YUKI showed me 12 HIDDEN temples.',
    rules: ['keep_names', 'remove_colors', 'remove_locations', 'remove_numbers_over_100'],
  },
  {
    title: 'Military Brief',
    text: 'Operation GOLDEN EAGLE targets 5 BLACK vehicles in KABUL sector. Budget: $75000. Colonel WRIGHT authorized LETHAL force.',
    rules: ['keep_names', 'remove_colors', 'remove_numbers_over_100', 'keep_nouns'],
  },
  {
    title: 'Travel Blog',
    text: 'The ANCIENT RED temples of KYOTO cost just $45 to visit. SPECTACULAR views of PURPLE mountains. 8 AMAZING shrines.',
    rules: ['remove_colors', 'remove_locations', 'keep_nouns', 'remove_adjectives'],
  },
]

function ruleLabel(type: RuleType, param?: number): string {
  switch (type) {
    case 'remove_colors':                  return 'Remove all COLOR words'
    case 'keep_names':                     return 'Keep all NAMES'
    case 'remove_locations':               return 'Remove all LOCATIONS'
    case 'remove_numbers_over_100':        return 'Remove numbers > 100'
    case 'keep_adjective_per_sentence':    return 'Keep >= 1 ADJECTIVE per sentence'
    case 'max_redactions_per_sentence':    return `Max ${param ?? 3} redactions per sentence`
    case 'remove_adjectives':              return 'Remove all ADJECTIVES'
    case 'keep_nouns':                     return 'Keep all NOUNS'
  }
}

// Parse text into Word objects, assigning sentence index based on period/!/?
function parseWords(text: string): Word[] {
  const tokens = text.split(/\s+/)
  const words: Word[] = []
  let sentenceIdx = 0

  for (const token of tokens) {
    const trimmed = token.trim()
    if (!trimmed) continue
    const lower = trimmed.toLowerCase()
    const cat = categorizeWord(trimmed)
    words.push({
      text: trimmed,
      lower,
      category: cat,
      redacted: false,
      redactAnim: 0,
      unredactAnim: 0,
      x: 0, y: 0, width: 0, height: 0,
      sentence: sentenceIdx,
    })
    // Sentence boundary if token ends with . ! ?
    if (/[.!?]$/.test(trimmed)) sentenceIdx++
  }
  return words
}

// Build rules array for a document
function buildRules(types: RuleType[], params: (number | undefined)[] = []): Rule[] {
  return types.map((type, i) => ({
    type,
    label: ruleLabel(type, params[i]),
    param: params[i],
    satisfied: false,
  }))
}

// Build all Document objects from definitions
function buildDocuments(): Document[] {
  return DOC_DEFS.map(def => ({
    title: def.title,
    words: parseWords(def.text),
    rules: buildRules(def.rules, def.ruleParams ?? []),
  }))
}

// ── Rule evaluation ───────────────────────────────────────────────────────────

function evaluateRules(doc: Document): void {
  for (const rule of doc.rules) {
    rule.satisfied = checkRule(rule, doc.words)
  }
}

function checkRule(rule: Rule, words: Word[]): boolean {
  switch (rule.type) {
    case 'remove_colors':
      return !words.some(w => w.category === 'color' && !w.redacted)

    case 'keep_names':
      return !words.some(w => w.category === 'name' && w.redacted)

    case 'remove_locations':
      return !words.some(w => w.category === 'location' && !w.redacted)

    case 'remove_numbers_over_100':
      return !words.some(w => w.category === 'number' && !w.redacted && extractNumber(w.lower) > 100)

    case 'keep_adjective_per_sentence': {
      const sentenceCount = Math.max(...words.map(w => w.sentence)) + 1
      for (let s = 0; s < sentenceCount; s++) {
        const sentWords = words.filter(w => w.sentence === s)
        if (sentWords.length === 0) continue
        if (!sentWords.some(w => w.category === 'adjective' && !w.redacted)) return false
      }
      return true
    }

    case 'max_redactions_per_sentence': {
      const max = rule.param ?? 3
      const sentenceCount = Math.max(...words.map(w => w.sentence)) + 1
      for (let s = 0; s < sentenceCount; s++) {
        if (words.filter(w => w.sentence === s && w.redacted).length > max) return false
      }
      return true
    }

    case 'remove_adjectives':
      return !words.some(w => w.category === 'adjective' && !w.redacted)

    case 'keep_nouns':
      return !words.some(w => w.category === 'noun' && w.redacted)
  }
}

// Compute the minimum required redactions (words that MUST be redacted by some rule)
function minimumRequiredRedactions(doc: Document): number {
  const words = doc.words
  const mustRedact = new Set<number>()
  for (const rule of doc.rules) {
    switch (rule.type) {
      case 'remove_colors':
        words.forEach((w, i) => { if (w.category === 'color') mustRedact.add(i) })
        break
      case 'remove_locations':
        words.forEach((w, i) => { if (w.category === 'location') mustRedact.add(i) })
        break
      case 'remove_numbers_over_100':
        words.forEach((w, i) => { if (w.category === 'number' && extractNumber(w.lower) > 100) mustRedact.add(i) })
        break
      case 'remove_adjectives':
        words.forEach((w, i) => { if (w.category === 'adjective') mustRedact.add(i) })
        break
    }
  }
  return mustRedact.size
}

// ── Game State ────────────────────────────────────────────────────────────────

let documents: Document[] = []
let currentDocIdx = 0
let totalScore = 0
let bestScore = 0
let docStars: number[] = []
let state: GameState = 'READY'
let lastTime = 0

let docTimer = 0           // seconds elapsed on current document
let transitionTimer = 0    // countdown between docs

let particles: Particle[] = []
let floatTexts: FloatText[] = []
let shakeTimer = 0         // screen shake countdown (seconds)
let shakeAmt = 0           // pixel magnitude
let classifiedAlpha = 0    // for CLASSIFIED stamp
let classifiedScale = 0    // grows 0 -> 1

let ruleIndicatorTimers: number[] = []   // per-rule flash timer
let ruleIndicatorPrev: boolean[] = []    // previous satisfied state

let overlayEl: HTMLDivElement | null = null

// ── Layout constants ──────────────────────────────────────────────────────────

const PADDING = 18
const RULES_AREA_HEIGHT = 26   // height per rule row
const TITLE_HEIGHT = 26
const DOC_FONT_SIZE = 15
const LINE_HEIGHT = 26
const SUBMIT_BTN_H = 40
const SUBMIT_BTN_W = 140
const TIMER_RADIUS = 16

// ── Initialization ────────────────────────────────────────────────────────────

function initGame(): void {
  documents = buildDocuments()
  currentDocIdx = 0
  totalScore = 0
  docStars = []
  particles = []
  floatTexts = []
  shakeTimer = 0
  classifiedAlpha = 0
  classifiedScale = 0
  transitionTimer = 0
  state = 'REVIEWING'
  docTimer = 0
  initDocState()
}

function initDocState(): void {
  const doc = documents[currentDocIdx]
  for (const w of doc.words) {
    w.redacted = false
    w.redactAnim = 0
    w.unredactAnim = 0
  }
  docTimer = 0
  evaluateRules(doc)
  ruleIndicatorTimers = doc.rules.map(() => 0)
  ruleIndicatorPrev = doc.rules.map(r => r.satisfied)
  updateHUD()
}

function updateHUD(): void {
  scoreEl.textContent = String(totalScore)
  docEl.textContent = String(currentDocIdx + 1)
  bestEl.textContent = String(bestScore)
}

// ── Word Layout ───────────────────────────────────────────────────────────────

function layoutWords(doc: Document): void {
  const w = canvas.width
  const rulesCount = doc.rules.length
  const rulesArea = PADDING + TITLE_HEIGHT + rulesCount * RULES_AREA_HEIGHT + 10

  ctx.font = `${DOC_FONT_SIZE}px 'Courier New', monospace`

  const maxWidth = w - PADDING * 2
  let cx = PADDING
  let cy = rulesArea + DOC_FONT_SIZE

  for (let i = 0; i < doc.words.length; i++) {
    const word = doc.words[i]
    // Include trailing space in measured width for proper spacing
    const spaced = word.text + ' '
    word.width = ctx.measureText(spaced).width
    word.height = LINE_HEIGHT

    // Wrap if this word would overflow
    if (cx + word.width > PADDING + maxWidth && cx > PADDING) {
      cx = PADDING
      cy += LINE_HEIGHT
    }

    word.x = cx
    word.y = cy - DOC_FONT_SIZE  // top of bounding box
    cx += word.width

    // Force newline after sentence-ending punctuation
    if (/[.!?]$/.test(word.text) && i < doc.words.length - 1) {
      cx = PADDING
      cy += LINE_HEIGHT
    }
  }
}

// Returns the index of the word clicked, or -1
function hitTestWord(mx: number, my: number, doc: Document): number {
  for (let i = 0; i < doc.words.length; i++) {
    const w = doc.words[i]
    if (mx >= w.x && mx <= w.x + w.width &&
        my >= w.y && my <= w.y + w.height) {
      return i
    }
  }
  return -1
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreDocument(doc: Document): { score: number; stars: number; rulesSatisfied: number } {
  evaluateRules(doc)
  const rulesSatisfied = doc.rules.filter(r => r.satisfied).length
  const totalRules = doc.rules.length
  const minRequired = minimumRequiredRedactions(doc)
  const actualRedacted = doc.words.filter(w => w.redacted).length
  const excess = Math.max(0, actualRedacted - minRequired)

  let timeBonus = 0
  if (docTimer <= 15) timeBonus = 50
  else if (docTimer <= 25) timeBonus = 25

  const raw = rulesSatisfied * 100 - excess * 20 + timeBonus

  let stars = 1
  if (rulesSatisfied === totalRules && excess === 0) stars = 3
  else if (rulesSatisfied === totalRules || excess === 0) stars = 2

  return { score: Math.max(0, raw), stars, rulesSatisfied }
}

// ── Visual Effects ────────────────────────────────────────────────────────────

function spawnConfetti(cx: number, cy: number, count: number): void {
  const colors = ['#ffd700', '#ff5050', '#50ffaa', '#5080ff', '#ff50ff', '#ffaa50']
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 80 + Math.random() * 120
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      alpha: 1,
      size: 3 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
    })
  }
}

function spawnFloatText(x: number, y: number, text: string, color: string): void {
  floatTexts.push({ x, y, text, alpha: 1, color, vy: -35 })
}

function triggerShake(amount: number, duration: number): void {
  shakeAmt = amount
  shakeTimer = duration
}

// ── Overlay (DOM-safe, no innerHTML) ─────────────────────────────────────────

function showOverlay(
  titleText: string,
  bodyLines: string[],
  btnLabel: string,
  onBtn: () => void
): void {
  removeOverlay()

  overlayEl = document.createElement('div')
  overlayEl.style.cssText = [
    'position:absolute', 'inset:0', 'background:rgba(0,0,0,0.88)',
    'display:flex', 'flex-direction:column', 'align-items:center',
    'justify-content:center', 'gap:14px', 'z-index:50', 'padding:24px',
    'text-align:center', "font-family:'Courier New',monospace", 'color:white',
  ].join(';')

  const h1 = document.createElement('h1')
  h1.style.cssText = 'color:#ff5050;font-size:clamp(20px,5vw,32px);margin-bottom:4px;'
  h1.textContent = titleText
  overlayEl.appendChild(h1)

  for (const line of bodyLines) {
    const p = document.createElement('p')
    p.style.cssText = 'color:rgba(255,255,255,0.75);font-size:13px;max-width:380px;line-height:1.6;'
    p.textContent = line
    overlayEl.appendChild(p)
  }

  const btn = document.createElement('button')
  btn.textContent = btnLabel
  btn.style.cssText = [
    'padding:12px 32px', 'background:#1a0000', 'border:2px solid #ff5050',
    'border-radius:8px', 'color:#fff', 'font-size:16px',
    "font-family:'Courier New',monospace", 'cursor:pointer',
    'margin-top:8px', 'letter-spacing:1px',
  ].join(';')
  btn.addEventListener('click', onBtn)
  overlayEl.appendChild(btn)

  canvas.parentElement!.appendChild(overlayEl)
}

function removeOverlay(): void {
  if (overlayEl) {
    overlayEl.remove()
    overlayEl = null
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────

function submitDocument(): void {
  if (state !== 'REVIEWING') return
  state = 'SUBMITTED'

  const doc = documents[currentDocIdx]
  evaluateRules(doc)

  const { score, stars, rulesSatisfied } = scoreDocument(doc)
  docStars.push(stars)
  totalScore += score

  // Near-miss feedback for failed rules
  let nearMissY = canvas.height / 2 + 40
  for (const rule of doc.rules) {
    if (!rule.satisfied) {
      const msg = buildNearMissMsg(rule, doc)
      if (msg) {
        spawnFloatText(canvas.width / 2, nearMissY, msg, '#ff5050')
        nearMissY += 18
      }
    }
  }

  // Excess penalty float
  const minRequired = minimumRequiredRedactions(doc)
  const actualRedacted = doc.words.filter(w => w.redacted).length
  const excess = Math.max(0, actualRedacted - minRequired)
  if (excess > 0) {
    spawnFloatText(canvas.width / 2, nearMissY, `-${excess * 20} excess penalty`, '#ff8800')
  }

  // CLASSIFIED stamp + shake
  classifiedAlpha = 1
  classifiedScale = 0
  triggerShake(6, 0.3)
  audio.score()

  // Perfect score — confetti + triumph
  if (rulesSatisfied === doc.rules.length && excess === 0) {
    spawnConfetti(canvas.width / 2, canvas.height / 3, 60)
    audio.levelUp()
  }

  reportScore(totalScore)
  updateHUD()

  transitionTimer = 2.2
  state = 'TRANSITION'
}

function buildNearMissMsg(rule: Rule, doc: Document): string {
  const words = doc.words
  switch (rule.type) {
    case 'remove_colors': {
      const missed = words.filter(w => w.category === 'color' && !w.redacted)
      return missed.length ? `Color rule: ${missed.map(w => w.text).join(', ')} not redacted` : ''
    }
    case 'keep_names': {
      const missed = words.filter(w => w.category === 'name' && w.redacted)
      return missed.length ? `Names rule: ${missed.map(w => w.text).join(', ')} were redacted` : ''
    }
    case 'remove_locations': {
      const missed = words.filter(w => w.category === 'location' && !w.redacted)
      return missed.length ? `Locations rule: ${missed.map(w => w.text).join(', ')} not redacted` : ''
    }
    case 'remove_numbers_over_100': {
      const missed = words.filter(w => w.category === 'number' && !w.redacted && extractNumber(w.lower) > 100)
      return missed.length ? `Numbers rule: ${missed.map(w => w.text).join(', ')} not redacted` : ''
    }
    case 'remove_adjectives': {
      const missed = words.filter(w => w.category === 'adjective' && !w.redacted).slice(0, 3)
      return missed.length ? `Adjectives rule: ${missed.map(w => w.text).join(', ')} not redacted` : ''
    }
    case 'keep_nouns': {
      const missed = words.filter(w => w.category === 'noun' && w.redacted)
      return missed.length ? `Nouns rule: ${missed.map(w => w.text).join(', ')} were redacted` : ''
    }
    default: return ''
  }
}

function advanceToNextDoc(): void {
  if (currentDocIdx >= documents.length - 1) {
    endGame()
  } else {
    currentDocIdx++
    state = 'REVIEWING'
    classifiedAlpha = 0
    classifiedScale = 0
    initDocState()
  }
}

function endGame(): void {
  state = 'GAME_OVER'

  if (totalScore > bestScore) {
    bestScore = totalScore
    saveHighScore(bestScore)
  }

  reportGameOver(totalScore)
  audio.death()
  updateHUD()

  const starStr = docStars.map(s => '\u2605'.repeat(s) + '\u2606'.repeat(3 - s)).join('  ')

  showOverlay(
    'CASE CLOSED',
    [
      `Final score: ${totalScore}`,
      `Best: ${bestScore}`,
      starStr,
    ],
    'NEW CASE',
    () => {
      removeOverlay()
      initGame()
    }
  )
}

// ── Update ────────────────────────────────────────────────────────────────────

function update(dt: number): void {
  if (state === 'GAME_OVER') return

  if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt)

  // CLASSIFIED stamp scale-up animation
  if (classifiedAlpha > 0 && classifiedScale < 1) {
    classifiedScale = Math.min(1, classifiedScale + dt * 8)
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += 120 * dt   // gravity
    p.alpha -= dt * 1.8
    if (p.alpha <= 0) particles.splice(i, 1)
  }

  // Floating score texts
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i]
    f.y += f.vy * dt
    f.alpha -= dt * 0.65
    if (f.alpha <= 0) floatTexts.splice(i, 1)
  }

  // Rule flash timers
  for (let i = 0; i < ruleIndicatorTimers.length; i++) {
    if (ruleIndicatorTimers[i] > 0) {
      ruleIndicatorTimers[i] = Math.max(0, ruleIndicatorTimers[i] - dt)
    }
  }

  // Word redact/unredact animations
  if (state === 'REVIEWING' || state === 'SUBMITTED' || state === 'TRANSITION') {
    const doc = documents[currentDocIdx]
    for (const w of doc.words) {
      if (w.redacted && w.redactAnim < 1) {
        w.redactAnim = Math.min(1, w.redactAnim + dt / 0.15)   // 0.15s wipe
      }
      if (!w.redacted && w.unredactAnim > 0) {
        w.unredactAnim = Math.max(0, w.unredactAnim - dt / 0.12)  // 0.12s dissolve
      }
    }
  }

  // Transition between documents
  if (state === 'TRANSITION') {
    docTimer += dt
    transitionTimer -= dt
    if (transitionTimer <= 0) advanceToNextDoc()
  } else if (state === 'REVIEWING') {
    docTimer += dt
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function draw(): void {
  const w = canvas.width
  const h = canvas.height

  let sx = 0; let sy = 0
  if (shakeTimer > 0) {
    sx = (Math.random() - 0.5) * shakeAmt * 2
    sy = (Math.random() - 0.5) * shakeAmt * 2
  }

  ctx.save()
  ctx.translate(sx, sy)

  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(-sx, -sy, w, h)

  if (state === 'READY') {
    drawReadyScreen(w, h)
  } else if (state !== 'GAME_OVER') {
    drawDocument(w, h)
  }

  // Particles
  for (const p of particles) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, p.alpha)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Floating texts
  ctx.font = `bold 12px 'Courier New', monospace`
  ctx.textAlign = 'center'
  for (const f of floatTexts) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, f.alpha)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y)
    ctx.restore()
  }

  ctx.restore()
}

function drawReadyScreen(w: number, h: number): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = '#ff5050'
  ctx.font = `bold 36px 'Courier New', monospace`
  ctx.fillText('REDACT', w / 2, h / 2 - 70)

  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `13px 'Courier New', monospace`
  ctx.fillText('Black out words to satisfy redaction rules.', w / 2, h / 2 - 22)
  ctx.fillText('Click words to toggle. Rules conflict — choose wisely.', w / 2, h / 2 + 6)
  ctx.fillText('Submit when ready. Score = rules x 100 - excess x 20 + time bonus.', w / 2, h / 2 + 30)

  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = `11px 'Courier New', monospace`
  ctx.fillText('Press SPACE or tap to begin', w / 2, h / 2 + 72)

  // Color legend
  const legendY = h / 2 + 110
  const legendItems: Array<{ label: string; color: string }> = [
    { label: 'COLOR', color: '#ff8844' },
    { label: 'NAME', color: '#44aaff' },
    { label: 'LOCATION', color: '#88ff88' },
    { label: 'NUMBER', color: '#ffdd44' },
    { label: 'ADJECTIVE', color: '#cc88ff' },
    { label: 'NOUN', color: '#88ddff' },
  ]
  ctx.font = `10px 'Courier New', monospace`
  const itemW = Math.floor((w - PADDING * 2) / legendItems.length)
  for (let i = 0; i < legendItems.length; i++) {
    const item = legendItems[i]
    ctx.fillStyle = item.color
    ctx.fillText(item.label, PADDING + itemW * i + itemW / 2, legendY)
  }
}

function drawDocument(w: number, h: number): void {
  const doc = documents[currentDocIdx]
  layoutWords(doc)
  evaluateRules(doc)

  // Detect rule state changes for audio feedback
  for (let i = 0; i < doc.rules.length; i++) {
    const rule = doc.rules[i]
    if (rule.satisfied !== ruleIndicatorPrev[i]) {
      ruleIndicatorTimers[i] = 0.4
      if (rule.satisfied) audio.blip()
      ruleIndicatorPrev[i] = rule.satisfied
    }
  }

  const rulesCount = doc.rules.length
  const rulesAreaY = PADDING + TITLE_HEIGHT

  // Title
  ctx.font = `bold 13px 'Courier New', monospace`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#ff5050'
  ctx.fillText(`[ ${doc.title.toUpperCase()} ]  Doc ${currentDocIdx + 1}/12`, PADDING, PADDING)

  // Rules
  for (let i = 0; i < doc.rules.length; i++) {
    const rule = doc.rules[i]
    const ry = rulesAreaY + i * RULES_AREA_HEIGHT
    const flash = ruleIndicatorTimers[i] > 0 ? Math.abs(Math.sin(ruleIndicatorTimers[i] * 40)) * 0.5 : 0

    // Rule background pill
    ctx.fillStyle = rule.satisfied
      ? `rgba(0,${Math.floor(120 + flash * 100)},0,0.25)`
      : `rgba(${Math.floor(120 + flash * 100)},0,0,0.25)`
    ctx.beginPath()
    ctx.roundRect(PADDING, ry + 2, w - PADDING * 2, RULES_AREA_HEIGHT - 4, 4)
    ctx.fill()

    // Indicator icon
    ctx.fillStyle = rule.satisfied ? '#44ff44' : '#ff4444'
    ctx.font = `bold 13px 'Courier New', monospace`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(rule.satisfied ? '[OK]' : '[--]', PADDING + 4, ry + RULES_AREA_HEIGHT / 2)

    // Rule text
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `11px 'Courier New', monospace`
    ctx.fillText(rule.label, PADDING + 44, ry + RULES_AREA_HEIGHT / 2)
  }

  // Separator
  const sepY = rulesAreaY + rulesCount * RULES_AREA_HEIGHT + 4
  ctx.strokeStyle = 'rgba(255,80,80,0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PADDING, sepY)
  ctx.lineTo(w - PADDING, sepY)
  ctx.stroke()

  // Words
  ctx.font = `${DOC_FONT_SIZE}px 'Courier New', monospace`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  for (const word of doc.words) {
    const wx = word.x
    const wy = word.y
    const ww = word.width
    const wh = word.height

    if (word.redacted && word.redactAnim > 0) {
      // Wipe left-to-right black rectangle
      const clipW = ww * word.redactAnim
      ctx.fillStyle = '#111111'
      ctx.fillRect(wx, wy + 2, clipW, wh - 4)

      // Show underlying text in unwiped region
      if (word.redactAnim < 1) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(wx + clipW, wy, ww - clipW, wh)
        ctx.clip()
        ctx.fillStyle = getWordColor(word)
        ctx.fillText(word.text, wx, wy + (wh - DOC_FONT_SIZE) / 2)
        ctx.restore()
      }

      // Diagonal hatch pattern on fully-redacted blocks
      if (word.redactAnim >= 1) {
        ctx.save()
        for (let lx = wx - wh; lx < wx + ww; lx += 5) {
          ctx.beginPath()
          ctx.moveTo(lx, wy + 2)
          ctx.lineTo(lx + wh - 4, wy + wh - 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.07)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
        ctx.restore()
      }

    } else if (!word.redacted && word.unredactAnim > 0) {
      // Dissolve: black fading out, text fading in
      ctx.save()
      ctx.globalAlpha = word.unredactAnim
      ctx.fillStyle = '#111111'
      ctx.fillRect(wx, wy + 2, ww, wh - 4)
      ctx.restore()

      ctx.save()
      ctx.globalAlpha = 1 - word.unredactAnim
      ctx.fillStyle = getWordColor(word)
      ctx.fillText(word.text, wx, wy + (wh - DOC_FONT_SIZE) / 2)
      ctx.restore()

    } else if (!word.redacted) {
      // Normal visible word, color-coded by category
      ctx.fillStyle = getWordColor(word)
      ctx.fillText(word.text, wx, wy + (wh - DOC_FONT_SIZE) / 2)
    }
  }

  // Submit button
  const btnX = w / 2 - SUBMIT_BTN_W / 2
  const btnY = h - SUBMIT_BTN_H - PADDING
  const canSubmit = state === 'REVIEWING'

  ctx.fillStyle = canSubmit ? 'rgba(160,0,0,0.85)' : 'rgba(60,60,60,0.5)'
  ctx.beginPath()
  ctx.roundRect(btnX, btnY, SUBMIT_BTN_W, SUBMIT_BTN_H, 6)
  ctx.fill()
  ctx.strokeStyle = canSubmit ? '#ff5050' : '#444'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = canSubmit ? '#ffffff' : '#777'
  ctx.font = `bold 14px 'Courier New', monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('SUBMIT', w / 2, btnY + SUBMIT_BTN_H / 2)

  // Timer arc (top-right of submit button area)
  const timerX = w - PADDING - TIMER_RADIUS - 4
  const timerY = btnY + SUBMIT_BTN_H / 2
  const maxTime = 45
  const timerFraction = Math.min(1, docTimer / maxTime)

  // Background arc
  ctx.beginPath()
  ctx.arc(timerX, timerY, TIMER_RADIUS, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 3
  ctx.stroke()

  // Progress arc
  ctx.beginPath()
  ctx.arc(timerX, timerY, TIMER_RADIUS, -Math.PI / 2, -Math.PI / 2 + timerFraction * Math.PI * 2)
  ctx.strokeStyle = timerFraction < 0.33 ? '#44ff44' : timerFraction < 0.66 ? '#ffaa00' : '#ff5050'
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `10px 'Courier New', monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(Math.floor(docTimer)), timerX, timerY)

  // CLASSIFIED stamp (post-submit)
  if (classifiedAlpha > 0 && classifiedScale > 0) {
    ctx.save()
    ctx.globalAlpha = classifiedAlpha * 0.95
    ctx.translate(w / 2, h / 2)
    ctx.scale(classifiedScale, classifiedScale)
    ctx.rotate(-0.1)

    const stampW = 260; const stampH = 58
    ctx.strokeStyle = '#ff0000'
    ctx.lineWidth = 4
    ctx.strokeRect(-stampW / 2, -stampH / 2, stampW, stampH)

    ctx.fillStyle = '#ff0000'
    ctx.font = `bold 34px 'Courier New', monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('CLASSIFIED', 0, 0)

    ctx.restore()
  }
}

// Color by word category for visual scanning
function getWordColor(word: Word): string {
  switch (word.category) {
    case 'color':     return '#ff8844'
    case 'name':      return '#44aaff'
    case 'location':  return '#88ff88'
    case 'number':    return '#ffdd44'
    case 'adjective': return '#cc88ff'
    case 'noun':      return '#88ddff'
    default:          return 'rgba(255,255,255,0.9)'
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────

function getCanvasPos(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

function handlePointerAt(x: number, y: number): void {
  if (state === 'READY') {
    initGame()
    audio.start()
    return
  }

  if (state !== 'REVIEWING') return

  const doc = documents[currentDocIdx]
  const h = canvas.height
  const btnX = canvas.width / 2 - SUBMIT_BTN_W / 2
  const btnY = h - SUBMIT_BTN_H - PADDING

  // Submit button
  if (x >= btnX && x <= btnX + SUBMIT_BTN_W && y >= btnY && y <= btnY + SUBMIT_BTN_H) {
    submitDocument()
    return
  }

  // Word toggle
  const idx = hitTestWord(x, y, doc)
  if (idx >= 0) {
    const word = doc.words[idx]
    word.redacted = !word.redacted

    if (word.redacted) {
      word.redactAnim = 0
      word.unredactAnim = 0
      audio.click()
      // Show excess penalty warning
      const minReq = minimumRequiredRedactions(doc)
      const actual = doc.words.filter(w => w.redacted).length
      if (actual > minReq) {
        spawnFloatText(word.x + word.width / 2, word.y, '-20', '#ff6600')
      }
    } else {
      word.unredactAnim = 1
      audio.blip()
    }

    evaluateRules(doc)
  }
}

canvas.addEventListener('click', (e) => {
  const { x, y } = getCanvasPos(e.clientX, e.clientY)
  handlePointerAt(x, y)
})

canvas.addEventListener('touchend', (e) => {
  e.preventDefault()
  const touch = e.changedTouches[0]
  const { x, y } = getCanvasPos(touch.clientX, touch.clientY)
  handlePointerAt(x, y)
}, { passive: false })

// Space = start game or submit; Enter = submit
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault()
    if (state === 'READY') {
      initGame()
      audio.start()
    } else if (state === 'REVIEWING') {
      submitDocument()
    }
  }
  if (e.code === 'Enter' && state === 'REVIEWING') {
    submitDocument()
  }
})

// ── Game Loop ─────────────────────────────────────────────────────────────────

function loop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.05)
  lastTime = ts
  update(dt)
  draw()
  requestAnimationFrame(loop)
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  try {
    const result = await initSDK()
    bestScore = result.highScore
    bestEl.textContent = String(bestScore)
  } catch {
    bestScore = 0
  }

  documents = buildDocuments()
  state = 'READY'
  updateHUD()

  requestAnimationFrame((ts) => {
    lastTime = ts
    loop(ts)
  })
}

bootstrap()
