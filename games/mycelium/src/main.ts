import { audio } from './audio.js'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number }

interface TreeNode {
  x: number
  y: number
  radius: number
  connectionTimer: number
  connected: boolean
  dead: boolean
}

interface MineralNode {
  x: number
  y: number
  radius: number
  amount: number
}

interface NetworkNode {
  x: number
  y: number
  id: number
  parentId: number | null
  isRival: boolean
  connectedToTree: boolean
  connectedToMineral: boolean
}

interface Mushroom {
  x: number
  y: number
  height: number
  grown: boolean
  timer: number
}

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const container = document.getElementById('game-container')!

const SOIL_Y_FRAC = 0.35  // soil starts at this fraction of canvas height

function resize(): void {
  const s = Math.min(container.clientWidth, container.clientHeight - 50)
  canvas.width = Math.max(320, s)
  canvas.height = Math.max(320, s)
  canvas.style.width = canvas.width + 'px'
  canvas.style.height = canvas.height + 'px'
}
resize()
window.addEventListener('resize', resize)

function soilY(): number { return canvas.height * SOIL_Y_FRAC }

// ── State ─────────────────────────────────────────────────────────────────────

let trees: TreeNode[] = []
let minerals: MineralNode[] = []
let network: NetworkNode[] = []
let rivalNetwork: NetworkNode[] = []
let mushrooms: Mushroom[] = []
let energy = 100
let score = 0
let timeLeft = 300
let running = false
let gameOver = false
let bestScore = 0
let lastTime = 0
let tickTimer = 0
let nodeIdCounter = 0

const BRANCH_COST = 5
const FRUIT_COST = 30
const FRUIT_POINTS = 50
const TREE_DEATH_PENALTY = 100
const MAX_ENERGY = 400
const CONNECTION_RANGE = 50
const RIVAL_SPREAD_INTERVAL = 3.5

let rivalTimer = 0

// ── Init ──────────────────────────────────────────────────────────────────────

function initGame(): void {
  trees = []
  minerals = []
  network = []
  rivalNetwork = []
  mushrooms = []
  energy = 100
  score = 0
  timeLeft = 300
  tickTimer = 0
  rivalTimer = 0
  nodeIdCounter = 0

  const w = canvas.width
  const h = canvas.height
  const sy = soilY()

  // Trees (above soil)
  for (let i = 0; i < 5; i++) {
    trees.push({
      x: 60 + (i / 4) * (w - 120),
      y: Math.random() * (sy - 60) + 20,
      radius: 18 + Math.random() * 10,
      connectionTimer: 30,
      connected: false,
      dead: false,
    })
  }

  // Mineral nodes (below soil)
  for (let i = 0; i < 8; i++) {
    minerals.push({
      x: 30 + Math.random() * (w - 60),
      y: sy + 30 + Math.random() * (h - sy - 60),
      radius: 8 + Math.random() * 6,
      amount: 80 + Math.random() * 40,
    })
  }

  // Start network at center soil entry
  const rootNode: NetworkNode = {
    x: w / 2,
    y: sy + 5,
    id: nodeIdCounter++,
    parentId: null,
    isRival: false,
    connectedToTree: false,
    connectedToMineral: false,
  }
  network.push(rootNode)

  // Rival starts at corner
  const rivalRoot: NetworkNode = {
    x: 30,
    y: sy + 20,
    id: nodeIdCounter++,
    parentId: null,
    isRival: true,
    connectedToTree: false,
    connectedToMineral: false,
  }
  rivalNetwork.push(rivalRoot)
}

// ── Connectivity check ────────────────────────────────────────────────────────

function checkConnections(): void {
  const sy = soilY()

  for (const tree of trees) {
    if (tree.dead) continue
    tree.connected = false
    // Check if any network node is within CONNECTION_RANGE of the tree root (soil surface below tree)
    const treeRoot = { x: tree.x, y: sy }
    for (const node of network) {
      if (Math.hypot(node.x - treeRoot.x, node.y - treeRoot.y) < CONNECTION_RANGE) {
        tree.connected = true
        break
      }
    }
    if (!tree.connected) {
      tree.connectionTimer -= 1 / 60 // will be accumulated by dt
    }
  }

  for (const node of network) {
    // Connected to tree?
    node.connectedToTree = false
    const treeRoot = { x: 0, y: sy }
    for (const t of trees) {
      if (t.dead) continue
      treeRoot.x = t.x
      treeRoot.y = sy
      if (Math.hypot(node.x - treeRoot.x, node.y - treeRoot.y) < CONNECTION_RANGE) {
        node.connectedToTree = true
        break
      }
    }
    // Connected to mineral?
    node.connectedToMineral = false
    for (const m of minerals) {
      if (Math.hypot(node.x - m.x, node.y - m.y) < CONNECTION_RANGE) {
        node.connectedToMineral = true
        break
      }
    }
  }
}

// ── Update ────────────────────────────────────────────────────────────────────

function update(dt: number): void {
  if (!running || gameOver) return

  timeLeft -= dt
  if (timeLeft <= 0) { timeLeft = 0; endGame(); return }

  energy -= 0.01 * dt * 60  // baseline drain
  energy = Math.max(0, Math.min(MAX_ENERGY, energy))

  // Tree timers
  for (const tree of trees) {
    if (tree.dead) continue
    if (!tree.connected) {
      tree.connectionTimer -= dt
      if (tree.connectionTimer <= 0) {
        tree.dead = true
        score = Math.max(0, score - TREE_DEATH_PENALTY)
        audio.death()
      }
    } else {
      tree.connectionTimer = Math.min(30, tree.connectionTimer + dt * 0.5)
    }
  }

  // Nutrient transfer: nodes connected both to tree and mineral (or path between them)
  const treeMinNodes = network.filter(n => n.connectedToTree && n.connectedToMineral)
  if (treeMinNodes.length > 0) {
    for (const m of minerals) {
      if (m.amount <= 0) continue
      for (const n of treeMinNodes) {
        if (Math.hypot(n.x - m.x, n.y - m.y) < CONNECTION_RANGE) {
          const transfer = Math.min(m.amount, 0.3 * dt * 60)
          m.amount -= transfer
          energy = Math.min(MAX_ENERGY, energy + transfer * 0.2)
          score += Math.floor(transfer * 0.1)
        }
      }
    }
  }

  // Rival fungus spread
  rivalTimer += dt
  if (rivalTimer >= RIVAL_SPREAD_INTERVAL && rivalNetwork.length < 60) {
    rivalTimer -= RIVAL_SPREAD_INTERVAL
    const sy = soilY()
    const h = canvas.height
    const w = canvas.width
    const parent = rivalNetwork[Math.floor(Math.random() * rivalNetwork.length)]
    const angle = Math.random() * Math.PI * 2
    const dist = 20 + Math.random() * 20
    const nx = parent.x + Math.cos(angle) * dist
    const ny = parent.y + Math.sin(angle) * dist
    if (nx > 0 && nx < w && ny > sy && ny < h) {
      rivalNetwork.push({
        x: nx, y: ny,
        id: nodeIdCounter++,
        parentId: parent.id,
        isRival: true,
        connectedToTree: false,
        connectedToMineral: false,
      })
      // Rival also steals energy if near mineral
      for (const m of minerals) {
        if (m.amount > 0 && Math.hypot(nx - m.x, ny - m.y) < CONNECTION_RANGE) {
          m.amount -= 0.5
          energy = Math.max(0, energy - 0.3)
        }
      }
    }
  }

  // Mushrooms
  for (const mush of mushrooms) {
    if (!mush.grown) {
      mush.height += 15 * dt
      if (mush.height >= 25) mush.grown = true
    }
    mush.timer -= dt
  }
  for (let i = mushrooms.length - 1; i >= 0; i--) {
    if (mushrooms[i].timer <= 0) mushrooms.splice(i, 1)
  }

  checkConnections()

  // HUD
  ;(document.getElementById('energy-val') as HTMLSpanElement).textContent = String(Math.floor(energy))
  ;(document.getElementById('time-val') as HTMLSpanElement).textContent = String(Math.ceil(timeLeft))
  ;(document.getElementById('score-val') as HTMLSpanElement).textContent = String(score)
  ;(document.getElementById('tree-val') as HTMLSpanElement).textContent = String(trees.filter(t => !t.dead).length)
  ;(document.getElementById('energy-bar') as HTMLDivElement).style.width = (energy / MAX_ENERGY * 100) + '%'
}

// ── Render ────────────────────────────────────────────────────────────────────

function draw(): void {
  const w = canvas.width
  const h = canvas.height
  const sy = soilY()

  ctx.clearRect(0, 0, w, h)

  // Sky
  const skyGrad = ctx.createLinearGradient(0, 0, 0, sy)
  skyGrad.addColorStop(0, '#1a2a3a')
  skyGrad.addColorStop(1, '#2a4020')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, w, sy)

  // Soil
  const soilGrad = ctx.createLinearGradient(0, sy, 0, h)
  soilGrad.addColorStop(0, '#3a2a10')
  soilGrad.addColorStop(0.3, '#2a1a08')
  soilGrad.addColorStop(1, '#1a0e04')
  ctx.fillStyle = soilGrad
  ctx.fillRect(0, sy, w, h - sy)

  // Soil line
  ctx.strokeStyle = 'rgba(200,160,80,0.4)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, sy)
  ctx.lineTo(w, sy)
  ctx.stroke()

  // Mineral nodes
  for (const m of minerals) {
    if (m.amount <= 0) continue
    const alpha = m.amount / 120
    ctx.beginPath()
    ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(150,200,255,${alpha * 0.5})`
    ctx.fill()
    ctx.strokeStyle = `rgba(150,200,255,${alpha * 0.8})`
    ctx.lineWidth = 1.5
    ctx.stroke()
    // Sparkle
    ctx.fillStyle = `rgba(200,230,255,${alpha * 0.7})`
    ctx.beginPath()
    ctx.arc(m.x - 2, m.y - 2, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Rival network (blue)
  drawNetwork(rivalNetwork, 'rgba(60,100,255,0.5)', 'rgba(80,130,255,0.7)')

  // Player network (white)
  drawNetwork(network, 'rgba(220,220,220,0.6)', 'rgba(255,255,255,0.85)')

  // Trees
  for (const tree of trees) {
    if (tree.dead) {
      // Dead tree — brown stump
      ctx.fillStyle = '#4a2a10'
      ctx.fillRect(tree.x - 4, sy - 20, 8, 20)
      ctx.strokeStyle = '#6a3a15'
      ctx.lineWidth = 1
      ctx.strokeRect(tree.x - 4, sy - 20, 8, 20)
      continue
    }

    // Trunk
    ctx.fillStyle = '#5a3a1a'
    ctx.fillRect(tree.x - 6, tree.y + tree.radius * 0.8, 12, sy - tree.y - tree.radius * 0.8)

    // Canopy
    const grad = ctx.createRadialGradient(tree.x, tree.y, 0, tree.x, tree.y, tree.radius)
    grad.addColorStop(0, '#88cc44')
    grad.addColorStop(1, '#448822')
    ctx.beginPath()
    ctx.arc(tree.x, tree.y, tree.radius, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    // Connection timer warning
    if (!tree.connected) {
      const warnAlpha = 1 - tree.connectionTimer / 30
      ctx.beginPath()
      ctx.arc(tree.x, tree.y, tree.radius + 4 + Math.sin(Date.now() * 0.005) * 3, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255,100,50,${warnAlpha})`
      ctx.lineWidth = 2
      ctx.stroke()
      // Timer text
      ctx.fillStyle = `rgba(255,200,100,${warnAlpha + 0.3})`
      ctx.font = 'bold 11px Courier New'
      ctx.textAlign = 'center'
      ctx.fillText(String(Math.ceil(tree.connectionTimer)) + 's', tree.x, tree.y - tree.radius - 6)
    }
  }

  // Mushrooms
  for (const mush of mushrooms) {
    const sy2 = soilY()
    const x = mush.x
    const baseY = sy2
    const capH = mush.height
    // Stem
    ctx.fillStyle = '#e8d8c0'
    ctx.fillRect(x - 3, baseY - capH * 0.5, 6, capH * 0.5)
    // Cap
    ctx.beginPath()
    ctx.arc(x, baseY - capH * 0.5, 10, Math.PI, 0)
    ctx.fillStyle = '#cc8844'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, baseY - capH * 0.5, 10, Math.PI, 0)
    ctx.strokeStyle = '#ff9955'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

function drawNetwork(nodes: NetworkNode[], edgeColor: string, nodeColor: string): void {
  if (nodes.length === 0) return

  const nodeMap = new Map<number, NetworkNode>()
  for (const n of nodes) nodeMap.set(n.id, n)

  // Draw edges
  ctx.strokeStyle = edgeColor
  ctx.lineWidth = 1.5
  for (const n of nodes) {
    if (n.parentId === null) continue
    const parent = nodeMap.get(n.parentId)
    if (!parent) continue
    ctx.beginPath()
    ctx.moveTo(parent.x, parent.y)
    ctx.lineTo(n.x, n.y)
    ctx.stroke()
  }

  // Draw nodes
  for (const n of nodes) {
    ctx.beginPath()
    ctx.arc(n.x, n.y, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = n.connectedToTree && n.connectedToMineral ? '#ffdd44' : nodeColor
    ctx.fill()
  }
}

// ── Interaction ───────────────────────────────────────────────────────────────

function handleClick(cx: number, cy: number): void {
  if (!running) return
  const sy = soilY()
  const w = canvas.width
  const h = canvas.height

  if (cy > sy - 20 && cy <= sy + 10) {
    // Surface click = fruit mushroom
    if (energy >= FRUIT_COST) {
      energy -= FRUIT_COST
      score += FRUIT_POINTS
      mushrooms.push({ x: cx, y: sy, height: 0, grown: false, timer: 5 })
      audio.powerup()
    }
    return
  }

  if (cy > sy) {
    // Soil click = branch
    if (energy < BRANCH_COST) return

    // Find nearest network node
    let nearest: NetworkNode | null = null
    let nearestD = 120
    for (const n of network) {
      const d = Math.hypot(n.x - cx, n.y - cy)
      if (d < nearestD) { nearestD = d; nearest = n }
    }
    if (nearest) {
      const newNode: NetworkNode = {
        x: cx, y: Math.max(sy + 5, Math.min(h - 5, cy)),
        id: nodeIdCounter++,
        parentId: nearest.id,
        isRival: false,
        connectedToTree: false,
        connectedToMineral: false,
      }
      network.push(newNode)
      energy = Math.max(0, energy - BRANCH_COST)
      audio.blip()
    }
  }
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  handleClick((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY)
})

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const t = e.touches[0]
  handleClick((t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY)
}, { passive: false })

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
  running = false
  gameOver = true
  audio.death()
  if (score > bestScore) {
    bestScore = score
    saveBestScore(score)
  }
  reportGameOver(score)
  const msg = score >= 400 ? 'Wood Wide Web master!' : score >= 200 ? 'Healthy network!' : 'Keep branching!'
  buildOverlay('Mycelium Fades', `Score: ${score}. ${msg} Best: ${bestScore}`, 'Regrow', startGame)
}

function startGame(): void {
  running = true
  gameOver = false
  initGame()
  audio.start()
  const ov = document.getElementById('overlay')!
  ov.style.display = 'none'
}

// ── Loop ──────────────────────────────────────────────────────────────────────

function loop(ts: number): void {
  const dt = Math.min((ts - lastTime) / 1000, 0.05)
  lastTime = ts
  update(dt)
  draw()
  requestAnimationFrame(loop)
}

const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

document.getElementById('start-btn')!.addEventListener('click', startGame)
initSDK().then(({ bestScore: saved }) => { bestScore = saved })
requestAnimationFrame((ts) => { lastTime = ts; loop(ts) })
