import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────
interface RumorNode {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  credulity: number   // 0-1 — how easily they believe
  influence: number   // 1-3 — how many neighbors they influence per tick
  belief: number      // -1 = none, 0-100 = rumor similarity (100=original)
  counterBelief: boolean  // believes counter-rumor
  label: string
}

interface REdge {
  a: number
  b: number
  temporary: boolean
  tempRemaining: number
}

type AbilityMode = 'none' | 'boost' | 'discredit' | 'bridge1' | 'bridge2'
type Phase = 'seed' | 'play' | 'gameover'

// ── Constants ──────────────────────────────────────────────────────────────────
const NODE_COUNT = 30
const TICKS = 30
const COUNTER_SPAWN_TICK = 10
const ABILITY_COOLDOWN = 8
const MUTATION_CHANCE = 0.15
const MUTATION_DECAY = 10  // similarity drops by this on mutation
const TICK_INTERVAL_MS = 1000

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const canvasWrap = document.getElementById('canvas-wrap') as HTMLDivElement

let W = 600, H = 400

function resizeCanvas(): void {
  W = canvasWrap.clientWidth || window.innerWidth
  H = Math.max(250, window.innerHeight - 130)
  canvas.width = W
  canvas.height = H
}

// ── State ──────────────────────────────────────────────────────────────────────
let nodes: RumorNode[] = []
let edges: REdge[] = []
let adjacency: Map<number, number[]> = new Map()
let tick = 0
let phase: Phase = 'seed'
let tickTimer: number | null = null
let abilityMode: AbilityMode = 'none'
let bridgeNode1: number | null = null
let boostCd = 0, discreditCd = 0, bridgeCd = 0
let totalScore = 0
let bestScore = 0
let counterSpawned = false
let forceFrames = 80

// ── Graph ──────────────────────────────────────────────────────────────────────
function buildGraph(): void {
  nodes = []
  edges = []
  adjacency = new Map()
  forceFrames = 80

  for (let i = 0; i < NODE_COUNT; i++) {
    const angle = (i / NODE_COUNT) * Math.PI * 2
    nodes.push({
      id: i,
      x: W / 2 + Math.cos(angle) * Math.min(W, H) * 0.35,
      y: H / 2 + Math.sin(angle) * Math.min(W, H) * 0.35,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      credulity: 0.3 + Math.random() * 0.6,
      influence: Math.ceil(Math.random() * 3),
      belief: -1,
      counterBelief: false,
      label: String.fromCharCode(65 + (i % 26)) + (i >= 26 ? '2' : ''),
    })
    adjacency.set(i, [])
  }

  // Ring
  for (let i = 0; i < NODE_COUNT; i++) addEdge(i, (i + 1) % NODE_COUNT, false)
  // Random cross-links
  for (let i = 0; i < 25; i++) {
    const a = Math.floor(Math.random() * NODE_COUNT)
    const b = Math.floor(Math.random() * NODE_COUNT)
    if (a !== b) addEdge(a, b, false)
  }
}

function addEdge(a: number, b: number, temporary: boolean): void {
  if (edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) return
  if (a === b) return
  edges.push({ a, b, temporary, tempRemaining: temporary ? 8 : Infinity })
  adjacency.get(a)?.push(b)
  adjacency.get(b)?.push(a)
}

// ── Force layout ───────────────────────────────────────────────────────────────
function applyForces(): void {
  for (const node of nodes) {
    let fx = 0, fy = 0
    for (const other of nodes) {
      if (other.id === node.id) continue
      const dx = node.x - other.x, dy = node.y - other.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.1
      const force = (60 * 60) / dist
      fx += (dx / dist) * force * 0.015
      fy += (dy / dist) * force * 0.015
    }
    for (const nb of (adjacency.get(node.id) || [])) {
      const other = nodes[nb]
      const dx = other.x - node.x, dy = other.y - node.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.1
      fx += dx * (dist / 100) * 0.04
      fy += dy * (dist / 100) * 0.04
    }
    fx += (W / 2 - node.x) * 0.006
    fy += (H / 2 - node.y) * 0.006
    node.vx = (node.vx + fx) * 0.85
    node.vy = (node.vy + fy) * 0.85
    node.x = Math.max(18, Math.min(W - 18, node.x + node.vx))
    node.y = Math.max(18, Math.min(H - 18, node.y + node.vy))
  }
}

// ── Tick logic ─────────────────────────────────────────────────────────────────
function doTick(): void {
  if (phase !== 'play') return

  // Counter-rumor spawns
  if (tick === COUNTER_SPAWN_TICK && !counterSpawned) {
    counterSpawned = true
    const uninfected = nodes.filter(n => n.belief < 50)
    if (uninfected.length > 0) {
      const seed = uninfected[Math.floor(Math.random() * uninfected.length)]
      seed.counterBelief = true
      seed.belief = 0
    }
    audio.death()
  }

  // Spread rumors
  const newBeliefs: number[] = nodes.map(n => n.belief)
  const newCounter: boolean[] = nodes.map(n => n.counterBelief)

  for (const node of nodes) {
    if (node.belief < 0 && !node.counterBelief) continue
    const neighbors = adjacency.get(node.id) || []
    // Influence up to `influence` neighbors
    const targets = [...neighbors].sort(() => Math.random() - 0.5).slice(0, node.influence)

    for (const nb of targets) {
      const target = nodes[nb]
      if (Math.random() > target.credulity) continue

      if (!node.counterBelief && node.belief >= 0) {
        // Spread original rumor with possible mutation
        let sim = node.belief
        if (Math.random() < MUTATION_CHANCE) sim = Math.max(0, sim - MUTATION_DECAY)
        if (sim > (newBeliefs[nb] < 0 ? -1 : newBeliefs[nb])) {
          newBeliefs[nb] = sim
          newCounter[nb] = false
        }
      } else if (node.counterBelief) {
        // Spread counter-rumor
        newCounter[nb] = true
        newBeliefs[nb] = Math.min(100, (newBeliefs[nb] < 0 ? 0 : newBeliefs[nb]) - 15)
      }
    }
  }

  nodes.forEach((n, i) => { n.belief = newBeliefs[i]; n.counterBelief = newCounter[i] })

  // Decrement cooldowns
  if (boostCd > 0) boostCd--
  if (discreditCd > 0) discreditCd--
  if (bridgeCd > 0) bridgeCd--

  // Expire temporary edges
  edges.forEach(e => {
    if (e.temporary) {
      e.tempRemaining--
      if (e.tempRemaining <= 0) {
        // Remove from adjacency
        const ai = adjacency.get(e.a)
        const bi = adjacency.get(e.b)
        if (ai) { const idx = ai.indexOf(e.b); if (idx >= 0) ai.splice(idx, 1) }
        if (bi) { const idx = bi.indexOf(e.a); if (idx >= 0) bi.splice(idx, 1) }
      }
    }
  })
  edges = edges.filter(e => !e.temporary || e.tempRemaining > 0)

  tick++
  updateHUD()
  updateAbilityButtons()

  if (tick >= TICKS) {
    clearInterval(tickTimer!)
    finishGame()
  }
}

// ── Abilities ──────────────────────────────────────────────────────────────────
function applyAbility(nodeId: number): void {
  switch (abilityMode) {
    case 'boost':
      nodes[nodeId].belief = 100
      nodes[nodeId].counterBelief = false
      boostCd = ABILITY_COOLDOWN
      audio.powerup()
      break
    case 'discredit':
      nodes[nodeId].credulity = Math.max(0.05, nodes[nodeId].credulity * 0.3)
      discreditCd = ABILITY_COOLDOWN
      audio.click()
      break
    case 'bridge1':
      bridgeNode1 = nodeId
      abilityMode = 'bridge2'
      return
    case 'bridge2':
      if (bridgeNode1 !== null && bridgeNode1 !== nodeId) {
        addEdge(bridgeNode1, nodeId, true)
        edges[edges.length - 1].tempRemaining = 8
        bridgeNode1 = null
        bridgeCd = ABILITY_COOLDOWN
        audio.combo()
      }
      break
    default:
      return
  }
  abilityMode = 'none'
  updateAbilityButtons()
}

function updateAbilityButtons(): void {
  const btnBoost = document.getElementById('btn-boost') as HTMLButtonElement
  const btnDiscredit = document.getElementById('btn-discredit') as HTMLButtonElement
  const btnBridge = document.getElementById('btn-bridge') as HTMLButtonElement
  const enabled = phase === 'play'

  btnBoost.disabled = !enabled || boostCd > 0
  btnBoost.textContent = `BOOST${boostCd > 0 ? ` (cd:${boostCd})` : ''}`
  btnBoost.className = `ability-btn${abilityMode === 'boost' ? ' active' : ''}`

  btnDiscredit.disabled = !enabled || discreditCd > 0
  btnDiscredit.textContent = `DISCREDIT${discreditCd > 0 ? ` (cd:${discreditCd})` : ''}`
  btnDiscredit.className = `ability-btn${abilityMode === 'discredit' ? ' active' : ''}`

  btnBridge.disabled = !enabled || bridgeCd > 0
  btnBridge.textContent = `BRIDGE${bridgeCd > 0 ? ` (cd:${bridgeCd})` : ''}${abilityMode === 'bridge2' ? ' (pick 2nd)' : ''}`
  btnBridge.className = `ability-btn${(abilityMode === 'bridge1' || abilityMode === 'bridge2') ? ' active' : ''}`
}

document.getElementById('btn-boost')!.addEventListener('click', () => {
  if (phase !== 'play' || boostCd > 0) return
  abilityMode = abilityMode === 'boost' ? 'none' : 'boost'
  updateAbilityButtons()
})

document.getElementById('btn-discredit')!.addEventListener('click', () => {
  if (phase !== 'play' || discreditCd > 0) return
  abilityMode = abilityMode === 'discredit' ? 'none' : 'discredit'
  updateAbilityButtons()
})

document.getElementById('btn-bridge')!.addEventListener('click', () => {
  if (phase !== 'play' || bridgeCd > 0) return
  abilityMode = (abilityMode === 'bridge1' || abilityMode === 'bridge2') ? 'none' : 'bridge1'
  bridgeNode1 = null
  updateAbilityButtons()
})

// ── Scoring ────────────────────────────────────────────────────────────────────
function computeScore(): number {
  const believers = nodes.filter(n => n.belief >= 50 && !n.counterBelief).length
  return Math.round((believers / NODE_COUNT) * 100)
}

function finishGame(): void {
  phase = 'gameover'
  const score = computeScore()
  totalScore = score

  if (score > bestScore) {
    bestScore = score
    saveBestScore(bestScore)
  }

  reportScore(score)
  reportGameOver(score)
  audio.levelUp()
  showGameOverOverlay(score)
}

// ── HUD ────────────────────────────────────────────────────────────────────────
function updateHUD(): void {
  const believers = computeScore()
  const avgPurity = nodes
    .filter(n => n.belief >= 0 && !n.counterBelief)
    .reduce((s, n) => s + n.belief, 0)
  const purity = nodes.filter(n => n.belief >= 0).length > 0
    ? avgPurity / Math.max(1, nodes.filter(n => n.belief >= 0 && !n.counterBelief).length)
    : 100

  setEl('hud-tick', `${tick}/${TICKS}`)
  setEl('hud-believers', `${believers}%`)
  setEl('hud-purity', `${purity.toFixed(0)}%`)
  setEl('hud-score', String(totalScore))
  setEl('hud-phase', phase.toUpperCase())
}

function setEl(id: string, text: string): void {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

// ── Renderer ──────────────────────────────────────────────────────────────────
function draw(): void {
  if (forceFrames > 0) { applyForces(); forceFrames-- }

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0c0c18'
  ctx.fillRect(0, 0, W, H)

  // Edges
  for (const edge of edges) {
    const a = nodes[edge.a], b = nodes[edge.b]
    ctx.strokeStyle = edge.temporary ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'
    ctx.lineWidth = edge.temporary ? 2 : 0.8
    ctx.setLineDash(edge.temporary ? [4, 3] : [])
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Nodes
  for (const node of nodes) {
    const r = 10 + node.credulity * 6  // ring thickness = credulity
    let fillColor = '#374151'  // uninfected gray
    if (node.counterBelief) fillColor = '#7c3aed'  // counter = purple
    else if (node.belief >= 0) {
      // belief = similarity, 0=dark amber, 100=bright amber
      const t = node.belief / 100
      const r2 = Math.round(245 * t + 100 * (1 - t))
      const g2 = Math.round(158 * t + 50 * (1 - t))
      const b2 = Math.round(11 * t + 5 * (1 - t))
      fillColor = `rgb(${r2},${g2},${b2})`
    }

    // Credulity ring
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255,255,255,${node.credulity * 0.4})`
    ctx.lineWidth = node.credulity * 3
    ctx.stroke()

    // Fill
    ctx.beginPath()
    ctx.arc(node.x, node.y, 9, 0, Math.PI * 2)
    ctx.fillStyle = fillColor
    ctx.fill()

    // Glow for bridge target
    if (bridgeNode1 === node.id) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, 14, 0, Math.PI * 2)
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '7px Courier New'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(node.label, node.x, node.y)

    // Similarity bar
    if (node.belief >= 0 && !node.counterBelief) {
      const bw = 18
      const bx = node.x - bw / 2
      const by = node.y + 12
      ctx.fillStyle = '#1f2937'
      ctx.fillRect(bx, by, bw, 2.5)
      ctx.fillStyle = '#f59e0b'
      ctx.fillRect(bx, by, bw * (node.belief / 100), 2.5)
    }
  }
}

// ── Input ──────────────────────────────────────────────────────────────────────
function getNodeAt(x: number, y: number): RumorNode | null {
  let best: RumorNode | null = null
  let bestDist = 20
  for (const node of nodes) {
    const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2)
    if (dist < bestDist) { bestDist = dist; best = node }
  }
  return best
}

function handleClick(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const x = (clientX - rect.left) * scaleX
  const y = (clientY - rect.top) * scaleY
  const node = getNodeAt(x, y)
  if (!node) return

  if (phase === 'seed') {
    node.belief = 100
    phase = 'play'
    counterSpawned = false
    tick = 0
    audio.powerup()
    tickTimer = window.setInterval(doTick, TICK_INTERVAL_MS)
    updateAbilityButtons()
    updateHUD()
  } else if (phase === 'play' && abilityMode !== 'none') {
    applyAbility(node.id)
  }
}

canvas.addEventListener('click', (e) => handleClick(e.clientX, e.clientY))
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  if (e.touches.length > 0) handleClick(e.touches[0].clientX, e.touches[0].clientY)
}, { passive: false })

// ── Overlays ───────────────────────────────────────────────────────────────────
const overlay = document.getElementById('overlay') as HTMLElement

function clearOverlay(): void {
  while (overlay.firstChild) overlay.removeChild(overlay.firstChild)
}

function makeOverlayBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.addEventListener('click', onClick)
  return btn
}

function makeEl(tag: string, text: string, style?: string): HTMLElement {
  const el = document.createElement(tag)
  el.textContent = text
  if (style) el.setAttribute('style', style)
  return el
}

function showGameOverOverlay(score: number): void {
  clearOverlay()
  overlay.appendChild(makeEl('h1', 'Game Over', 'color:#f59e0b'))
  overlay.appendChild(makeEl('p', `${score}% of the network believed your rumor`))
  overlay.appendChild(makeEl('div', `${score}`, 'font-size:clamp(32px,7vw,56px);color:#f59e0b;font-weight:bold'))
  overlay.appendChild(makeEl('p', `Best: ${bestScore}`, 'color:#888'))
  overlay.appendChild(makeOverlayBtn('Play Again', () => {
    overlay.style.display = 'none'
    restartGame()
  }))
  overlay.style.display = 'flex'
}

function restartGame(): void {
  if (tickTimer) clearInterval(tickTimer)
  buildGraph()
  phase = 'seed'
  tick = 0
  boostCd = 0; discreditCd = 0; bridgeCd = 0
  abilityMode = 'none'; bridgeNode1 = null
  counterSpawned = false
  totalScore = 0
  updateHUD()
  updateAbilityButtons()
}

// ── Start overlay ──────────────────────────────────────────────────────────────
document.getElementById('overlay-btn')!.addEventListener('click', () => {
  overlay.style.display = 'none'
  audio.start()
})

// ── Mute ───────────────────────────────────────────────────────────────────────
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '\uD83D\uDD07' : '\uD83D\uDD0A'
})

// ── Main loop ──────────────────────────────────────────────────────────────────
function mainLoop(): void {
  draw()
  requestAnimationFrame(mainLoop)
}

// ── Boot ───────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  resizeCanvas()
  window.addEventListener('resize', () => { resizeCanvas(); forceFrames = 30 })

  try {
    const { bestScore: saved } = await initSDK('rumor-mill')
    bestScore = saved
  } catch {
    // standalone
  }

  buildGraph()
  updateHUD()
  updateAbilityButtons()
  requestAnimationFrame(mainLoop)
}

void boot()
