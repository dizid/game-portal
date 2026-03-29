import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Node {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  belief: number        // 0-100
  isMisinformer: boolean
  isSeeded: boolean
  label: string
}

interface Edge {
  a: number
  b: number
}

type Phase = 'seed' | 'play' | 'result' | 'gameover'

// ── Constants ──────────────────────────────────────────────────────────────────
const NODE_COUNT = 40
const TURNS = 15
const TRUTH_THRESHOLD = 70
const DEGRADATION = 0.10  // 10% loss per hop
const MISINFORMER_COUNT = 8
const TRUTH_WIN = 70      // % of nodes above threshold to win

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const canvasWrap = document.getElementById('canvas-wrap') as HTMLDivElement

let W = 600, H = 500
let bestScore = 0

function resizeCanvas(): void {
  W = canvasWrap.clientWidth || window.innerWidth
  H = Math.max(300, (window.innerHeight - 120))
  canvas.width = W
  canvas.height = H
  // Re-layout nodes when canvas resizes
  if (nodes.length > 0) scatterNodes()
}

// ── Graph state ────────────────────────────────────────────────────────────────
let nodes: Node[] = []
let edges: Edge[] = []
let adjacency: Map<number, number[]> = new Map()
let turn = 0
let phase: Phase = 'seed'
let selectedNode: number | null = null
let totalScore = 0
let roundNum = 1

// ── Graph generation ──────────────────────────────────────────────────────────
function buildGraph(): void {
  nodes = []
  edges = []
  adjacency = new Map()

  // Create nodes in a ring + random cross-links (small-world style)
  for (let i = 0; i < NODE_COUNT; i++) {
    const angle = (i / NODE_COUNT) * Math.PI * 2
    nodes.push({
      id: i,
      x: W / 2 + Math.cos(angle) * Math.min(W, H) * 0.35,
      y: H / 2 + Math.sin(angle) * Math.min(W, H) * 0.35,
      vx: 0, vy: 0,
      belief: 20 + Math.random() * 20,   // 20-40 (misinformed)
      isMisinformer: false,
      isSeeded: false,
      label: String.fromCharCode(65 + (i % 26)) + (i >= 26 ? '2' : ''),
    })
    adjacency.set(i, [])
  }

  // Ring connections
  for (let i = 0; i < NODE_COUNT; i++) {
    addEdge(i, (i + 1) % NODE_COUNT)
    addEdge(i, (i + 2) % NODE_COUNT)
  }

  // Random cross-links (~40 extra)
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(Math.random() * NODE_COUNT)
    const b = Math.floor(Math.random() * NODE_COUNT)
    if (a !== b) addEdge(a, b)
  }

  // Mark misinformers
  const shuffled = [...Array(NODE_COUNT).keys()].sort(() => Math.random() - 0.5)
  for (let i = 0; i < MISINFORMER_COUNT; i++) {
    nodes[shuffled[i]].isMisinformer = true
    nodes[shuffled[i]].belief = 5 + Math.random() * 10
  }

  scatterNodes()
}

function addEdge(a: number, b: number): void {
  // Avoid duplicates
  const existing = edges.find(e =>
    (e.a === a && e.b === b) || (e.a === b && e.b === a))
  if (existing || a === b) return
  edges.push({ a, b })
  adjacency.get(a)!.push(b)
  adjacency.get(b)!.push(a)
}

function scatterNodes(): void {
  // Re-position to fit canvas while keeping relative layout
  const margin = 40
  const angle_step = (Math.PI * 2) / NODE_COUNT
  const radius = Math.min(W - margin * 2, H - margin * 2) * 0.4
  for (let i = 0; i < NODE_COUNT; i++) {
    const angle = i * angle_step - Math.PI / 2
    nodes[i].x = W / 2 + Math.cos(angle) * radius
    nodes[i].y = H / 2 + Math.sin(angle) * radius
  }
}

// ── Force simulation ──────────────────────────────────────────────────────────
function applyForces(): void {
  const k = 80
  const damping = 0.85

  for (const node of nodes) {
    let fx = 0, fy = 0

    // Repulsion from all nodes
    for (const other of nodes) {
      if (other.id === node.id) continue
      const dx = node.x - other.x
      const dy = node.y - other.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.1
      const force = (k * k) / dist
      fx += (dx / dist) * force * 0.01
      fy += (dy / dist) * force * 0.01
    }

    // Attraction along edges
    for (const nb of (adjacency.get(node.id) || [])) {
      const other = nodes[nb]
      const dx = other.x - node.x
      const dy = other.y - node.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.1
      const force = dist / (k * 2)
      fx += dx * force * 0.05
      fy += dy * force * 0.05
    }

    // Center gravity
    fx += (W / 2 - node.x) * 0.005
    fy += (H / 2 - node.y) * 0.005

    node.vx = (node.vx + fx) * damping
    node.vy = (node.vy + fy) * damping
    node.x = Math.max(20, Math.min(W - 20, node.x + node.vx))
    node.y = Math.max(20, Math.min(H - 20, node.y + node.vy))
  }
}

// ── Gameplay ───────────────────────────────────────────────────────────────────
function seedNode(id: number): void {
  nodes[id].belief = 100
  nodes[id].isSeeded = true
  phase = 'play'
  turn = 0
  audio.powerup()
  updateHUD()
  setInfo('Click an agent to have them share their belief with neighbors.')
}

function shareNode(id: number): void {
  const node = nodes[id]
  const neighbors = adjacency.get(id) || []

  // Broadcast with degradation
  for (const nb of neighbors) {
    const target = nodes[nb]
    const transmitted = node.belief * (1 - DEGRADATION)
    if (transmitted > target.belief) {
      target.belief = Math.min(100, target.belief + transmitted * 0.3)
    }
  }

  // Misinformers counter-broadcast to their neighbors
  for (const m of nodes.filter(n => n.isMisinformer)) {
    for (const nb of (adjacency.get(m.id) || [])) {
      nodes[nb].belief = Math.max(0, nodes[nb].belief - 8)
    }
  }

  audio.blip()
  turn++

  if (turn >= TURNS) {
    finishRound()
  } else {
    updateHUD()
    setInfo(`Turn ${turn}/${TURNS} — Click an agent to share.`)
  }
}

function computeTruthPercent(): number {
  const above = nodes.filter(n => n.belief >= TRUTH_THRESHOLD).length
  return (above / NODE_COUNT) * 100
}

function finishRound(): void {
  phase = 'result'
  const truthPct = computeTruthPercent()
  const roundScore = Math.round(truthPct * 10)
  totalScore += roundScore

  if (totalScore > bestScore) {
    bestScore = totalScore
    saveBestScore(bestScore)
  }

  reportScore(totalScore)
  audio.levelUp()
  updateHUD()

  // Show result
  const won = truthPct >= TRUTH_WIN
  showResultOverlay(won, truthPct, roundScore)
}

function showResultOverlay(won: boolean, truthPct: number, roundScore: number): void {
  clearOverlay()
  overlay.appendChild(makeEl('h1', won ? 'Truth Spread!' : 'Round Over', `color:${won ? '#34d399' : '#f87171'}`))
  overlay.appendChild(makeEl('p', `${truthPct.toFixed(0)}% of network reached truth threshold`))
  overlay.appendChild(makeEl('div', `+${roundScore}`, 'font-size:clamp(28px,6vw,48px);color:#34d399;font-weight:bold'))
  overlay.appendChild(makeEl('p', `Total: ${totalScore}`))

  if (roundNum < 3) {
    overlay.appendChild(makeOverlayBtn(`Next Network (Round ${roundNum + 1})`, () => {
      overlay.style.display = 'none'
      roundNum++
      buildGraph()
      phase = 'seed'
      turn = 0
      updateHUD()
      setInfo('Click a node to plant the truth seed.')
    }))
  } else {
    phase = 'gameover'
    reportGameOver(totalScore)
    overlay.appendChild(makeEl('p', `Best: ${bestScore}`, 'color:#888'))
    overlay.appendChild(makeOverlayBtn('Play Again', restartGame))
  }
  overlay.style.display = 'flex'
}

function restartGame(): void {
  overlay.style.display = 'none'
  roundNum = 1
  totalScore = 0
  buildGraph()
  phase = 'seed'
  turn = 0
  updateHUD()
  setInfo('Click a node to plant the truth seed.')
}

// ── HUD ────────────────────────────────────────────────────────────────────────
function updateHUD(): void {
  const truthPct = computeTruthPercent()
  setEl('hud-turn', `${turn}/${TURNS}`)
  setEl('hud-truth', `${truthPct.toFixed(0)}%`)
  setEl('hud-score', String(totalScore))
  setEl('hud-phase', phase.toUpperCase())
}

function setEl(id: string, text: string): void {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

function setInfo(text: string): void {
  const el = document.getElementById('info-bar')
  if (el) el.textContent = text
}

// ── Renderer ──────────────────────────────────────────────────────────────────
let forceFrames = 60  // run force sim for first N frames

function draw(): void {
  if (forceFrames > 0) { applyForces(); forceFrames-- }

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0a0a1a'
  ctx.fillRect(0, 0, W, H)

  // Draw edges
  for (const edge of edges) {
    const a = nodes[edge.a]
    const b = nodes[edge.b]
    const avgBelief = (a.belief + b.belief) / 2
    const alpha = 0.15 + (avgBelief / 100) * 0.25
    ctx.strokeStyle = `rgba(52,211,153,${alpha})`
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  // Draw nodes
  for (const node of nodes) {
    const r = node === nodes.find(n => n === node) && node.isSeeded ? 14 : 11
    const beliefColor = beliefToColor(node.belief)

    // Glow for high-belief nodes
    if (node.belief > 60) {
      const grd = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 2)
      grd.addColorStop(0, `rgba(52,211,153,${(node.belief - 60) / 100})`)
      grd.addColorStop(1, 'rgba(52,211,153,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(node.x, node.y, r * 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // Node circle
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
    ctx.fillStyle = beliefColor
    ctx.fill()

    // Selected ring
    if (selectedNode === node.id) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2.5
      ctx.stroke()
    } else if (node.isMisinformer) {
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Misinformer X mark
    if (node.isMisinformer) {
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 1.5
      const s = r * 0.5
      ctx.beginPath()
      ctx.moveTo(node.x - s, node.y - s)
      ctx.lineTo(node.x + s, node.y + s)
      ctx.moveTo(node.x + s, node.y - s)
      ctx.lineTo(node.x - s, node.y + s)
      ctx.stroke()
    }

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '8px Courier New'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(node.label, node.x, node.y)

    // Belief bar below node
    const bw = 24, bh = 3
    const bx = node.x - bw / 2
    const by = node.y + r + 3
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(bx, by, bw, bh)
    ctx.fillStyle = beliefColor
    ctx.fillRect(bx, by, bw * (node.belief / 100), bh)
  }
}

function beliefToColor(belief: number): string {
  // 0=red, 50=yellow, 100=green
  if (belief < 50) {
    const t = belief / 50
    const r = Math.round(239 + (251 - 239) * t)
    const g = Math.round(68 + (146 - 68) * t)
    const b = Math.round(68 * (1 - t))
    return `rgb(${r},${g},${b})`
  } else {
    const t = (belief - 50) / 50
    const r = Math.round(251 - 199 * t)
    const g = Math.round(146 + 65 * t)
    const b = Math.round(0 + 153 * t)
    return `rgb(${r},${g},${b})`
  }
}

// ── Input ──────────────────────────────────────────────────────────────────────
function getNodeAt(x: number, y: number): Node | null {
  let best: Node | null = null
  let bestDist = 20  // px threshold
  for (const node of nodes) {
    const dx = node.x - x
    const dy = node.y - y
    const dist = Math.sqrt(dx * dx + dy * dy)
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
    seedNode(node.id)
    selectedNode = node.id
  } else if (phase === 'play') {
    selectedNode = node.id
    shareNode(node.id)
  }
}

canvas.addEventListener('click', (e) => handleClick(e.clientX, e.clientY))
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  if (e.touches.length > 0) handleClick(e.touches[0].clientX, e.touches[0].clientY)
}, { passive: false })

// ── Overlay helpers ────────────────────────────────────────────────────────────
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
  updateHUD()
  requestAnimationFrame(mainLoop)
}

// ── Boot ───────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  resizeCanvas()
  window.addEventListener('resize', () => { resizeCanvas(); forceFrames = 30 })

  try {
    const { bestScore: saved } = await initSDK('echo-chamber')
    bestScore = saved
  } catch {
    // standalone
  }

  buildGraph()
  setInfo('Click a node to plant the truth seed.')
  requestAnimationFrame(mainLoop)
}

void boot()
