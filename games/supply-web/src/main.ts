import { audio } from './audio'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeType = 'factory' | 'warehouse' | 'shop'

interface NetworkNode {
  id: number
  type: NodeType
  x: number
  y: number
  label: string
  stock: number
  maxStock: number
  disabled: boolean
  disabledTurns: number
  reinforced: boolean
  buffered: boolean
}

interface NetworkEdge {
  from: number
  to: number
  capacity: number
  flow: number
  disabled: boolean
  disabledTurns: number
  reinforced: boolean
}

interface Disaster {
  type: 'storm' | 'strike' | 'shortage'
  description: string
  targetId?: number   // node id
  targetEdge?: [number, number]  // [from, to]
  turns: number
}

interface FlowParticle {
  fromId: number
  toId: number
  t: number
  speed: number
}

interface UpgradeOption {
  label: string
  cost: number
  action: () => void
}

type GamePhase = 'start' | 'build' | 'playing' | 'gameover'

interface GameState {
  phase: GamePhase
  round: number
  maxRounds: number
  money: number
  totalDelivered: number
  bestScore: number
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  particles: FlowParticle[]
  disasters: Disaster[]
  currentDisaster: Disaster | null
  message: string
  selectedNode: number | null
  connectingFrom: number | null
  upgradeTarget: number | null  // node being upgraded
  buildMode: 'edge' | 'none'
  pendingNodeType: NodeType | null
  upgrades: UpgradeOption[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 700
const CANVAS_H = 580
const EDGE_COST = 20
const REINFORCE_COST = 60
const BUFFER_COST = 40
const FLOW_SPEED = 0.018

const DISASTER_TEMPLATES: Omit<Disaster, 'targetId' | 'targetEdge'>[] = [
  { type: 'storm',    description: 'Storm knocks out a route!',       turns: 2 },
  { type: 'strike',   description: 'Worker strike halts a warehouse!', turns: 2 },
  { type: 'shortage', description: 'Shortage empties a factory!',      turns: 1 },
]

// ── Resize ────────────────────────────────────────────────────────────────────

function resize() {
  const container = document.getElementById('game-container')!
  const cw = container.clientWidth
  const ch = container.clientHeight
  const scale = Math.min(cw / CANVAS_W, ch / CANVAS_H)
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  canvas.style.width = `${CANVAS_W * scale}px`
  canvas.style.height = `${CANVAS_H * scale}px`
}
window.addEventListener('resize', resize)
resize()

// ── State ─────────────────────────────────────────────────────────────────────

function makeInitialNetwork(): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
  const nodes: NetworkNode[] = [
    { id: 0, type: 'factory',   x: 80,  y: 130, label: 'F1', stock: 5, maxStock: 10, disabled: false, disabledTurns: 0, reinforced: false, buffered: false },
    { id: 1, type: 'factory',   x: 80,  y: 310, label: 'F2', stock: 5, maxStock: 10, disabled: false, disabledTurns: 0, reinforced: false, buffered: false },
    { id: 2, type: 'warehouse', x: 260, y: 220, label: 'W1', stock: 3, maxStock: 8,  disabled: false, disabledTurns: 0, reinforced: false, buffered: false },
    { id: 3, type: 'shop',      x: 460, y: 130, label: 'S1', stock: 0, maxStock: 5,  disabled: false, disabledTurns: 0, reinforced: false, buffered: false },
    { id: 4, type: 'shop',      x: 460, y: 310, label: 'S2', stock: 0, maxStock: 5,  disabled: false, disabledTurns: 0, reinforced: false, buffered: false },
  ]
  const edges: NetworkEdge[] = [
    { from: 0, to: 2, capacity: 3, flow: 0, disabled: false, disabledTurns: 0, reinforced: false },
    { from: 1, to: 2, capacity: 3, flow: 0, disabled: false, disabledTurns: 0, reinforced: false },
    { from: 2, to: 3, capacity: 2, flow: 0, disabled: false, disabledTurns: 0, reinforced: false },
    { from: 2, to: 4, capacity: 2, flow: 0, disabled: false, disabledTurns: 0, reinforced: false },
  ]
  return { nodes, edges }
}

function makeState(): GameState {
  const { nodes, edges } = makeInitialNetwork()
  return {
    phase: 'start',
    round: 1,
    maxRounds: 20,
    money: 200,
    totalDelivered: 0,
    bestScore: 0,
    nodes,
    edges,
    particles: [],
    disasters: [],
    currentDisaster: null,
    message: 'Build your supply network!',
    selectedNode: null,
    connectingFrom: null,
    upgradeTarget: null,
    buildMode: 'none',
    pendingNodeType: null,
    upgrades: [],
  }
}

let gs: GameState = makeState()

function startGame() {
  const { nodes, edges } = makeInitialNetwork()
  gs = {
    ...makeState(),
    phase: 'build',
    bestScore: gs.bestScore,
    nodes,
    edges,
    message: 'Connect your factories to warehouses to shops! Click two nodes to add edge ($20).',
  }
  audio.start()
}

// ── Network Flow ──────────────────────────────────────────────────────────────

function simulateFlow(): number {
  let delivered = 0
  // Process factories: produce goods
  for (const node of gs.nodes) {
    if (node.disabled) continue
    if (node.type === 'factory') {
      node.stock = Math.min(node.maxStock, node.stock + 3)
    }
  }

  // Flow along edges
  for (const edge of gs.edges) {
    if (edge.disabled) continue
    const fromNode = gs.nodes[edge.from]
    const toNode = gs.nodes[edge.to]
    if (fromNode.disabled || toNode.disabled) continue

    const canFlow = Math.min(edge.capacity, fromNode.stock, toNode.maxStock - toNode.stock)
    if (canFlow > 0) {
      fromNode.stock -= canFlow
      toNode.stock += canFlow
      edge.flow = canFlow
      // Spawn particles
      for (let i = 0; i < canFlow; i++) {
        gs.particles.push({
          fromId: edge.from,
          toId: edge.to,
          t: i / canFlow * 0.5,
          speed: FLOW_SPEED + Math.random() * 0.005,
        })
      }
    } else {
      edge.flow = 0
    }
  }

  // Shops consume and score
  for (const node of gs.nodes) {
    if (node.type === 'shop' && !node.disabled) {
      delivered += node.stock
      gs.totalDelivered += node.stock
      gs.money += node.stock * 10  // earn per delivered good
      node.stock = 0
    }
  }

  return delivered
}

function processDisasters() {
  // Tick existing disabled nodes/edges
  for (const node of gs.nodes) {
    if (node.disabled) {
      node.disabledTurns--
      if (node.disabledTurns <= 0) node.disabled = false
    }
  }
  for (const edge of gs.edges) {
    if (edge.disabled) {
      edge.disabledTurns--
      if (edge.disabledTurns <= 0) edge.disabled = false
    }
  }

  // Trigger new disaster
  if (Math.random() < 0.45) {
    const template = DISASTER_TEMPLATES[Math.floor(Math.random() * DISASTER_TEMPLATES.length)]
    const disaster: Disaster = { ...template }

    if (template.type === 'storm') {
      const activeEdges = gs.edges.filter(e => !e.reinforced && !e.disabled)
      if (activeEdges.length > 0) {
        const target = activeEdges[Math.floor(Math.random() * activeEdges.length)]
        target.disabled = true
        target.disabledTurns = template.turns
        disaster.targetEdge = [target.from, target.to]
      }
    } else if (template.type === 'strike') {
      const warehouses = gs.nodes.filter(n => n.type === 'warehouse' && !n.buffered && !n.disabled)
      if (warehouses.length > 0) {
        const target = warehouses[Math.floor(Math.random() * warehouses.length)]
        target.disabled = true
        target.disabledTurns = template.turns
        disaster.targetId = target.id
      }
    } else if (template.type === 'shortage') {
      const factories = gs.nodes.filter(n => n.type === 'factory' && !n.disabled)
      if (factories.length > 0) {
        const target = factories[Math.floor(Math.random() * factories.length)]
        target.stock = 0
        disaster.targetId = target.id
      }
    }
    gs.currentDisaster = disaster
    gs.message = `DISASTER: ${disaster.description}`
    audio.death()
  } else {
    gs.currentDisaster = null
  }
}

function nextRound() {
  const delivered = simulateFlow()
  processDisasters()
  gs.round++
  if (gs.round > gs.maxRounds) {
    endGame()
    return
  }
  if (!gs.currentDisaster) {
    gs.message = `Round ${gs.round}: ${delivered} goods delivered this turn`
  }
}

function endGame() {
  const finalScore = gs.totalDelivered
  if (finalScore > gs.bestScore) {
    gs.bestScore = finalScore
    saveBestScore(finalScore)
  }
  reportGameOver(finalScore)
  gs.phase = 'gameover'
  audio.levelUp()
}

// ── Build Actions ─────────────────────────────────────────────────────────────

function tryAddEdge(fromId: number, toId: number) {
  if (fromId === toId) return
  const exists = gs.edges.find(e => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId))
  if (exists) { gs.message = 'Edge already exists!'; return }
  if (gs.money < EDGE_COST) { gs.message = `Need $${EDGE_COST} to add edge`; return }
  gs.money -= EDGE_COST
  gs.edges.push({ from: fromId, to: toId, capacity: 2, flow: 0, disabled: false, disabledTurns: 0, reinforced: false })
  gs.message = `Edge added! ($${EDGE_COST})`
  audio.blip()
}

function reinforceEdge(fromId: number, toId: number) {
  const edge = gs.edges.find(e => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId))
  if (!edge) return
  if (gs.money < REINFORCE_COST) { gs.message = `Need $${REINFORCE_COST}`; return }
  gs.money -= REINFORCE_COST
  edge.reinforced = true
  gs.message = `Edge reinforced! Disaster-proof.`
  audio.powerup()
}

function bufferNode(nodeId: number) {
  const node = gs.nodes[nodeId]
  if (node.type !== 'warehouse') return
  if (gs.money < BUFFER_COST) { gs.message = `Need $${BUFFER_COST}`; return }
  gs.money -= BUFFER_COST
  node.buffered = true
  node.maxStock = Math.round(node.maxStock * 1.5)
  gs.message = `${node.label} buffered!`
  audio.powerup()
}

// ── Draw ──────────────────────────────────────────────────────────────────────

function drawRoundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const NODE_COLORS: Record<NodeType, string> = {
  factory: '#f87171',
  warehouse: '#fbbf24',
  shop: '#4ade80',
}

function nodeShape(node: NetworkNode) {
  const s = 20
  if (node.type === 'factory') {
    ctx.rect(node.x - s, node.y - s, s * 2, s * 2)
  } else if (node.type === 'warehouse') {
    ctx.moveTo(node.x, node.y - s * 1.2)
    ctx.lineTo(node.x + s * 1.2, node.y)
    ctx.lineTo(node.x, node.y + s * 1.2)
    ctx.lineTo(node.x - s * 1.2, node.y)
    ctx.closePath()
  } else {
    ctx.arc(node.x, node.y, s, 0, Math.PI * 2)
  }
}

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  bg.addColorStop(0, '#0a0d14')
  bg.addColorStop(1, '#0d1117')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  if (gs.phase === 'start') { drawStart(); return }
  if (gs.phase === 'gameover') { drawGameOver(); return }

  drawHeader()
  drawEdges()
  drawParticles()
  drawNodes()
  drawControlPanel()
}

function drawStart() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#60a5fa'
  ctx.font = 'bold 36px monospace'
  ctx.fillText('Supply Web', CANVAS_W / 2, 140)
  ctx.font = '14px monospace'
  ctx.fillStyle = '#94a3b8'
  const lines = [
    '■ Factories produce goods',
    '◆ Warehouses store and forward',
    '● Shops consume for points',
    '',
    'Connect nodes by clicking two nodes (costs $20).',
    'Disasters knock out nodes and edges each round.',
    '',
    'Reinforce edges ($60) to make them disaster-proof.',
    'Add buffer stock to warehouses ($40).',
    '20 rounds. Score = total goods delivered.',
  ]
  lines.forEach((l, i) => ctx.fillText(l, CANVAS_W / 2, 198 + i * 26))
  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 110, 160, 50, 10)
  ctx.fillStyle = '#1d4ed8'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('Play', CANVAS_W / 2, CANVAS_H - 78)
}

function drawHeader() {
  ctx.fillStyle = '#1a1a2e'
  drawRoundRect(10, 10, CANVAS_W - 20, 44, 8)
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.fillText(`Round ${gs.round}/${gs.maxRounds}`, 20, 30)
  ctx.fillStyle = '#ffd166'
  ctx.font = 'bold 14px monospace'
  ctx.fillText(`$${gs.money}`, 90, 30)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.fillText(`Delivered: ${gs.totalDelivered}`, 90, 46)

  // Disaster alert
  if (gs.currentDisaster) {
    ctx.fillStyle = '#ef4444'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(gs.message, CANVAS_W / 2, 28)
  } else {
    ctx.fillStyle = '#64748b'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(gs.message.slice(0, 70), CANVAS_W / 2, 46)
  }
  ctx.textAlign = 'right'
  ctx.fillStyle = '#4ade80'
  ctx.font = 'bold 14px monospace'
  ctx.fillText(`Score: ${gs.totalDelivered}`, CANVAS_W - 15, 36)
}

function drawEdges() {
  for (const edge of gs.edges) {
    const fromNode = gs.nodes[edge.from]
    const toNode = gs.nodes[edge.to]
    const isConnecting = gs.connectingFrom !== null &&
      (gs.connectingFrom === edge.from || gs.connectingFrom === edge.to)

    ctx.strokeStyle = edge.disabled
      ? '#ef444433'
      : edge.reinforced
        ? '#fbbf24'
        : edge.flow > 0
          ? '#60a5fa'
          : '#334155'
    ctx.lineWidth = edge.reinforced ? 3 : 2
    if (edge.disabled) ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(fromNode.x, fromNode.y)
    ctx.lineTo(toNode.x, toNode.y)
    ctx.stroke()
    ctx.setLineDash([])

    // Flow label
    if (edge.flow > 0) {
      const mx = (fromNode.x + toNode.x) / 2
      const my = (fromNode.y + toNode.y) / 2
      ctx.fillStyle = '#60a5fa'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${edge.flow}/${edge.capacity}`, mx, my - 8)
    }

    // Reinforce button on edge midpoint (right-click or double tap)
    if (!edge.reinforced && !edge.disabled) {
      const mx = (fromNode.x + toNode.x) / 2
      const my = (fromNode.y + toNode.y) / 2
      ctx.fillStyle = '#fbbf24'
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('🔒', mx + 10, my + 4)
    }
  }
}

function drawParticles() {
  for (const p of gs.particles) {
    const fromNode = gs.nodes[p.fromId]
    const toNode = gs.nodes[p.toId]
    const x = fromNode.x + (toNode.x - fromNode.x) * p.t
    const y = fromNode.y + (toNode.y - fromNode.y) * p.t
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#60a5fa'
    ctx.fill()
  }
}

function drawNodes() {
  for (const node of gs.nodes) {
    const isSelected = gs.selectedNode === node.id || gs.connectingFrom === node.id
    const color = NODE_COLORS[node.type]

    if (node.disabled) {
      ctx.shadowColor = '#ef4444'
      ctx.shadowBlur = 8
    } else if (isSelected) {
      ctx.shadowColor = '#fff'
      ctx.shadowBlur = 14
    }

    ctx.beginPath()
    nodeShape(node)
    ctx.fillStyle = node.disabled ? '#1e293b' : color + '22'
    ctx.fill()
    ctx.strokeStyle = node.disabled ? '#ef4444' : isSelected ? '#fff' : color
    ctx.lineWidth = isSelected ? 3 : 2
    ctx.stroke()
    ctx.shadowBlur = 0

    // Label
    ctx.fillStyle = node.disabled ? '#64748b' : '#e2e8f0'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(node.label, node.x, node.y - 2)

    // Stock bar
    const barW = 36, barH = 6
    const bx = node.x - barW / 2, by = node.y + 26
    ctx.fillStyle = '#1e293b'
    drawRoundRect(bx, by, barW, barH, 3)
    ctx.fill()
    if (node.stock > 0) {
      drawRoundRect(bx, by, barW * (node.stock / node.maxStock), barH, 3)
      ctx.fillStyle = node.type === 'factory' ? '#f87171' : node.type === 'warehouse' ? '#fbbf24' : '#4ade80'
      ctx.fill()
    }
    ctx.fillStyle = '#64748b'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`${node.stock}/${node.maxStock}`, node.x, by + 16)

    if (node.reinforced) {
      ctx.fillStyle = '#fbbf24'
      ctx.font = '10px monospace'
      ctx.fillText('★', node.x + 22, node.y - 18)
    }
    if (node.buffered) {
      ctx.fillStyle = '#a78bfa'
      ctx.font = '10px monospace'
      ctx.fillText('▲', node.x + 22, node.y - 6)
    }
    if (node.disabled) {
      ctx.fillStyle = '#ef4444'
      ctx.font = 'bold 10px monospace'
      ctx.fillText(`✕${node.disabledTurns}`, node.x, node.y + 6)
    }
  }
}

function drawControlPanel() {
  const py = 440
  ctx.fillStyle = '#0f1117'
  drawRoundRect(10, py, CANVAS_W - 20, CANVAS_H - py - 10, 8)
  ctx.fill()

  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = 'bold 11px monospace'
  ctx.fillText('BUILD:', 20, py + 20)

  const controls = [
    { label: `Add Edge $${EDGE_COST}`, key: 'edge', color: '#3b82f6', w: 140 },
  ]

  // Connect mode button
  drawRoundRect(90, py + 8, 140, 32, 6)
  ctx.fillStyle = gs.buildMode === 'edge' ? '#3b82f6' : '#1e293b'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '11px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`Add Edge ($${EDGE_COST})`, 160, py + 29)

  // Next round button
  if (gs.phase === 'build') {
    drawRoundRect(250, py + 8, 140, 32, 6)
    ctx.fillStyle = '#10b981'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px monospace'
    ctx.fillText('Start Game', 320, py + 29)
  } else {
    drawRoundRect(250, py + 8, 140, 32, 6)
    ctx.fillStyle = '#3b82f6'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px monospace'
    ctx.fillText(`Next Round →`, 320, py + 29)
  }

  // Upgrade panel for selected node
  if (gs.selectedNode !== null) {
    const node = gs.nodes[gs.selectedNode]
    ctx.textAlign = 'left'
    ctx.fillStyle = NODE_COLORS[node.type]
    ctx.font = 'bold 12px monospace'
    ctx.fillText(`Selected: ${node.label} (${node.type})`, 406, py + 22)

    if (node.type === 'warehouse' && !node.buffered) {
      drawRoundRect(406, py + 30, 140, 28, 6)
      ctx.fillStyle = '#7c3aed'
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`Add Buffer ($${BUFFER_COST})`, 476, py + 48)
    }

    // Reinforce connected edges
    const connEdges = gs.edges.filter(e => (e.from === gs.selectedNode || e.to === gs.selectedNode) && !e.reinforced)
    if (connEdges.length > 0) {
      drawRoundRect(556, py + 30, 140, 28, 6)
      ctx.fillStyle = '#b45309'
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`Reinforce Edge ($${REINFORCE_COST})`, 626, py + 48)
    }
  }

  // Legend
  ctx.textAlign = 'left'
  ctx.fillStyle = '#334155'
  ctx.font = '9px monospace'
  ctx.fillText('■ Factory  ◆ Warehouse  ● Shop  ★ Reinforced  ▲ Buffered', 20, py + 56)
  ctx.fillText(`Money: $${gs.money} | Connecting: ${gs.connectingFrom !== null ? gs.nodes[gs.connectingFrom].label : 'none'}`, 20, py + 70)
}

function drawGameOver() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#60a5fa'
  ctx.font = 'bold 32px monospace'
  ctx.fillText('Supply Web Complete!', CANVAS_W / 2, 130)
  ctx.fillStyle = '#4ade80'
  ctx.font = 'bold 28px monospace'
  ctx.fillText(`Delivered: ${gs.totalDelivered} goods`, CANVAS_W / 2, 180)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '15px monospace'
  ctx.fillText(`Best: ${gs.bestScore}`, CANVAS_W / 2, 218)
  ctx.fillText(`Total earnings: $${gs.money}`, CANVAS_W / 2, 248)

  // Network stats
  ctx.font = '13px monospace'
  ctx.fillStyle = '#64748b'
  const reinforced = gs.edges.filter(e => e.reinforced).length
  const buffered = gs.nodes.filter(n => n.buffered).length
  ctx.fillText(`Edges built: ${gs.edges.length}  |  Reinforced: ${reinforced}  |  Buffered nodes: ${buffered}`, CANVAS_W / 2, 280)

  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 100, 160, 48, 10)
  ctx.fillStyle = '#1d4ed8'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('Play Again', CANVAS_W / 2, CANVAS_H - 68)
}

// ── Input ─────────────────────────────────────────────────────────────────────

function getCanvasPoint(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (clientX - rect.left) * (CANVAS_W / rect.width),
    y: (clientY - rect.top) * (CANVAS_H / rect.height),
  }
}

function handleClick(cx: number, cy: number) {
  if (gs.phase === 'start') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 110 && cy <= CANVAS_H - 60) startGame()
    return
  }
  if (gs.phase === 'gameover') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 100 && cy <= CANVAS_H - 52) startGame()
    return
  }

  const py = 440

  // "Add Edge" button
  if (cx >= 90 && cx <= 230 && cy >= py + 8 && cy <= py + 40) {
    audio.click()
    gs.buildMode = gs.buildMode === 'edge' ? 'none' : 'edge'
    gs.connectingFrom = null
    gs.message = gs.buildMode === 'edge' ? 'Click first node to start edge' : 'Build mode off'
    return
  }

  // "Start Game" / "Next Round" button
  if (cx >= 250 && cx <= 390 && cy >= py + 8 && cy <= py + 40) {
    audio.click()
    if (gs.phase === 'build') {
      gs.phase = 'playing'
      gs.message = 'Game started! Each round goods flow automatically.'
    } else {
      nextRound()
    }
    return
  }

  // Buffer button
  if (gs.selectedNode !== null) {
    const node = gs.nodes[gs.selectedNode]
    if (node.type === 'warehouse' && !node.buffered) {
      if (cx >= 406 && cx <= 546 && cy >= py + 30 && cy <= py + 58) {
        bufferNode(gs.selectedNode)
        return
      }
    }
    const connEdges = gs.edges.filter(e => (e.from === gs.selectedNode || e.to === gs.selectedNode) && !e.reinforced)
    if (connEdges.length > 0 && cx >= 556 && cx <= 696 && cy >= py + 30 && cy <= py + 58) {
      reinforceEdge(connEdges[0].from, connEdges[0].to)
      return
    }
  }

  // Node clicks
  for (const node of gs.nodes) {
    const dist = Math.sqrt((cx - node.x) ** 2 + (cy - node.y) ** 2)
    if (dist < 28) {
      audio.click()
      if (gs.buildMode === 'edge') {
        if (gs.connectingFrom === null) {
          gs.connectingFrom = node.id
          gs.message = `Connecting from ${node.label}. Click target node.`
        } else {
          tryAddEdge(gs.connectingFrom, node.id)
          gs.connectingFrom = null
          gs.buildMode = 'none'
        }
      } else {
        gs.selectedNode = gs.selectedNode === node.id ? null : node.id
        gs.message = gs.selectedNode !== null ? `Selected ${node.label}. See upgrade options below.` : ''
      }
      return
    }
  }

  // Click edge reinforcement icon
  for (const edge of gs.edges) {
    const fromNode = gs.nodes[edge.from]
    const toNode = gs.nodes[edge.to]
    const mx = (fromNode.x + toNode.x) / 2 + 10
    const my = (fromNode.y + toNode.y) / 2 + 4
    if (Math.abs(cx - mx) < 14 && Math.abs(cy - my) < 14 && !edge.reinforced) {
      reinforceEdge(edge.from, edge.to)
      return
    }
  }
}

canvas.addEventListener('click', (e) => {
  const p = getCanvasPoint(e.clientX, e.clientY)
  handleClick(p.x, p.y)
})
canvas.addEventListener('touchend', (e) => {
  e.preventDefault()
  const t = e.changedTouches[0]
  const p = getCanvasPoint(t.clientX, t.clientY)
  handleClick(p.x, p.y)
}, { passive: false })

muteBtn.addEventListener('click', () => {
  muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊'
})

// ── Loop ──────────────────────────────────────────────────────────────────────

function loop() {
  // Update particles
  for (let i = gs.particles.length - 1; i >= 0; i--) {
    gs.particles[i].t += gs.particles[i].speed
    if (gs.particles[i].t >= 1) gs.particles.splice(i, 1)
  }
  draw()
  requestAnimationFrame(loop)
}

initSDK().then(({ bestScore }) => {
  gs.bestScore = bestScore
  loop()
})
