import { audio } from './audio'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  id: number
  name: string
  color: string
  x: number  // grid col 0-5
  y: number  // grid row 0-5
  isSpy: boolean
  meetings: Set<number>  // agents met this turn
}

interface EvidenceLog {
  turn: number
  action: string
  result: string
  suspicious?: number[]  // agent ids flagged
}

interface GameState {
  phase: 'start' | 'playing' | 'accuse' | 'gameover'
  turn: number
  maxTurns: number
  agents: Agent[]
  bayesian: number[]   // probability each agent is spy
  evidence: EvidenceLog[]
  message: string
  action: 'tap' | 'follow' | 'drop' | 'accuse' | null
  tapSelect: number[]  // 0-2 agents selected for tap
  accuseTarget: number | null
  won: boolean
  score: number
  bestScore: number
  // For dead drop: selected cell
  dropCell: { x: number; y: number } | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 700
const CANVAS_H = 580
const GRID = 6
const CELL = 52

const AGENT_NAMES = ['Ariel', 'Bruno', 'Cara', 'Dorian', 'Elise', 'Felix']
const AGENT_COLORS = ['#f87171', '#60a5fa', '#4ade80', '#fbbf24', '#f0abfc', '#fb923c']

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

function makeAgents(): Agent[] {
  const spyIdx = Math.floor(Math.random() * 6)
  const positions: { x: number; y: number }[] = []
  while (positions.length < 6) {
    const p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) }
    if (!positions.find(pp => pp.x === p.x && pp.y === p.y)) positions.push(p)
  }
  return AGENT_NAMES.map((name, i) => ({
    id: i,
    name,
    color: AGENT_COLORS[i],
    x: positions[i].x,
    y: positions[i].y,
    isSpy: i === spyIdx,
    meetings: new Set(),
  }))
}

function makeInitialState(): GameState {
  return {
    phase: 'start',
    turn: 1,
    maxTurns: 8,
    agents: makeAgents(),
    bayesian: Array(6).fill(1 / 6),
    evidence: [],
    message: '',
    action: null,
    tapSelect: [],
    accuseTarget: null,
    won: false,
    score: 0,
    bestScore: 0,
    dropCell: null,
  }
}

let gs: GameState = makeInitialState()

function startGame() {
  gs = {
    ...makeInitialState(),
    phase: 'playing',
    bestScore: gs.bestScore,
  }
  audio.start()
}

// ── Agent Movement ────────────────────────────────────────────────────────────

function moveAgents() {
  // Reset meetings
  for (const a of gs.agents) a.meetings = new Set()

  for (const agent of gs.agents) {
    const dx = Math.floor(Math.random() * 3) - 1
    const dy = Math.floor(Math.random() * 3) - 1
    agent.x = Math.max(0, Math.min(GRID - 1, agent.x + dx))
    agent.y = Math.max(0, Math.min(GRID - 1, agent.y + dy))
  }

  // Detect meetings (agents in same cell)
  for (let i = 0; i < gs.agents.length; i++) {
    for (let j = i + 1; j < gs.agents.length; j++) {
      if (gs.agents[i].x === gs.agents[j].x && gs.agents[i].y === gs.agents[j].y) {
        gs.agents[i].meetings.add(j)
        gs.agents[j].meetings.add(i)
      }
    }
  }
}

// ── Bayesian Update ───────────────────────────────────────────────────────────

function normalizeBayes() {
  const sum = gs.bayesian.reduce((a, b) => a + b, 0)
  if (sum > 0) gs.bayesian = gs.bayesian.map(p => p / sum)
}

function updateBayesFromTap(agents: number[], suspicious: boolean[]) {
  // For each agent tapped: if suspicious, slightly increase prob; if clean, decrease
  agents.forEach((id, i) => {
    if (suspicious[i]) {
      gs.bayesian[id] *= 3  // 80% accuracy: suspicious = spy 3x more likely
    } else {
      gs.bayesian[id] *= 0.25  // clean = spy 4x less likely
    }
  })
  normalizeBayes()
}

function updateBayesFromFollow(followedId: number) {
  // Spy meetings boost all met agents
  const followed = gs.agents[followedId]
  followed.meetings.forEach(metId => {
    // Meeting someone increases both their probs slightly
    gs.bayesian[followedId] *= 1.4
    gs.bayesian[metId] *= 1.2
  })
  if (followed.meetings.size === 0) {
    gs.bayesian[followedId] *= 0.8
  }
  normalizeBayes()
}

function updateBayesFromDrop(cell: { x: number; y: number }) {
  const spy = gs.agents.find(a => a.isSpy)!
  const hasMessage = spy.x === cell.x && spy.y === cell.y
  if (hasMessage) {
    // Boost all agents who were at that cell
    for (const agent of gs.agents) {
      if (agent.x === cell.x && agent.y === cell.y) {
        gs.bayesian[agent.id] *= 5
      }
    }
  }
  normalizeBayes()
}

// ── Actions ───────────────────────────────────────────────────────────────────

function executeTap(agentIds: number[]) {
  const spy = gs.agents.find(a => a.isSpy)!
  const results: boolean[] = []
  const labels: string[] = []
  agentIds.forEach(id => {
    const isSpy = gs.agents[id].isSpy
    // 80% accuracy
    const correct = Math.random() < 0.8
    const result = correct ? isSpy : !isSpy
    results.push(result)
    labels.push(`${gs.agents[id].name}: ${result ? 'SUSPICIOUS 🔴' : 'clean ✅'}`)
  })
  updateBayesFromTap(agentIds, results)
  gs.evidence.push({
    turn: gs.turn,
    action: `Tap: ${agentIds.map(id => gs.agents[id].name).join(' & ')}`,
    result: labels.join(', '),
    suspicious: agentIds.filter((_, i) => results[i]),
  })
  gs.message = labels.join(' | ')
  audio.blip()
  endTurn()
}

function executeFollow(agentId: number) {
  moveAgents() // Move happens when you follow
  const followed = gs.agents[agentId]
  const metNames = Array.from(followed.meetings).map(id => gs.agents[id].name)
  updateBayesFromFollow(agentId)
  const resultStr = metNames.length > 0
    ? `Met: ${metNames.join(', ')}`
    : 'No contacts this turn'
  gs.evidence.push({
    turn: gs.turn,
    action: `Follow ${followed.name}`,
    result: resultStr,
  })
  gs.message = `${followed.name}: ${resultStr}`
  audio.blip()
  gs.turn++
  if (gs.turn > gs.maxTurns) {
    gs.phase = 'accuse'
    gs.message = 'Final turn! Make your accusation.'
  }
}

function executeDropCheck(cell: { x: number; y: number }) {
  const spy = gs.agents.find(a => a.isSpy)!
  const found = spy.x === cell.x && spy.y === cell.y
  updateBayesFromDrop(cell)
  const resultStr = found ? 'DEAD DROP FOUND! 📦 Highly suspicious!' : 'No message found'
  gs.evidence.push({
    turn: gs.turn,
    action: `Dead Drop (${cell.x},${cell.y})`,
    result: resultStr,
  })
  gs.message = resultStr
  if (found) audio.powerup()
  else audio.blip()
  endTurn()
}

function endTurn() {
  moveAgents()
  gs.turn++
  if (gs.turn > gs.maxTurns) {
    gs.phase = 'accuse'
    gs.message = 'Final turn! Make your accusation.'
  }
}

function makeAccusation(agentId: number) {
  const spy = gs.agents.find(a => a.isSpy)!
  const correct = spy.id === agentId
  gs.won = correct
  if (correct) {
    gs.score = Math.max(100, 1000 - (gs.turn - 1) * 100)
  } else {
    gs.score = 0
  }
  if (gs.score > gs.bestScore) {
    gs.bestScore = gs.score
    saveBestScore(gs.bestScore)
  }
  reportGameOver(gs.score)
  gs.phase = 'gameover'
  if (correct) { audio.levelUp() } else { audio.death() }
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

const GRID_X = 10
const GRID_Y = 62

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  bg.addColorStop(0, '#0a0d0a')
  bg.addColorStop(1, '#0d0d14')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  if (gs.phase === 'start') { drawStart(); return }
  if (gs.phase === 'gameover') { drawGameOver(); return }

  drawHeader()
  drawGrid()
  drawAgents()
  drawBayesPanel()
  drawActionPanel()
  drawEvidenceLog()
}

function drawStart() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#4ade80'
  ctx.font = 'bold 36px monospace'
  ctx.fillText('Dead Drop', CANVAS_W / 2, 140)
  ctx.font = '14px monospace'
  ctx.fillStyle = '#94a3b8'
  const lines = [
    '6 agents roam a city grid. One is a spy.',
    'You have 8 turns to find them.',
    '',
    'Tap Phones: pick 2 agents, get suspicious/clean (80% accurate)',
    'Follow Agent: see who they meet this turn',
    'Dead Drop: check a cell for messages',
    '',
    'A Bayesian panel shows updated spy probabilities.',
    'After 8 turns, accuse one agent.',
    'Score = 1000 − (turns × 100) for correct accusation.',
  ]
  lines.forEach((l, i) => ctx.fillText(l, CANVAS_W / 2, 190 + i * 24))
  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 110, 160, 50, 10)
  ctx.fillStyle = '#166534'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('Play', CANVAS_W / 2, CANVAS_H - 78)
}

function drawHeader() {
  ctx.fillStyle = '#0f1a0e'
  drawRoundRect(10, 10, CANVAS_W - 20, 44, 8)
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.fillText(`Turn ${gs.turn}/${gs.maxTurns}`, 20, 30)
  ctx.fillStyle = '#4ade80'
  ctx.font = 'bold 14px monospace'
  ctx.fillText('Dead Drop', 80, 30)
  ctx.fillStyle = '#64748b'
  ctx.font = '10px monospace'
  ctx.fillText(gs.message.length > 60 ? gs.message.slice(0, 57) + '…' : gs.message, 20, 48)

  if (gs.phase === 'accuse') {
    ctx.fillStyle = '#f87171'
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('ACCUSE NOW!', CANVAS_W - 15, 38)
  }
}

function drawGrid() {
  // City grid
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const cx = GRID_X + gx * CELL
      const cy = GRID_Y + gy * CELL
      const isDropTarget = gs.action === 'drop' && gs.dropCell?.x === gx && gs.dropCell?.y === gy

      ctx.fillStyle = isDropTarget ? '#1e3a1e' : '#0f1a0f'
      drawRoundRect(cx + 2, cy + 2, CELL - 4, CELL - 4, 4)
      ctx.fill()
      ctx.strokeStyle = isDropTarget ? '#4ade80' : '#1e293b'
      ctx.lineWidth = isDropTarget ? 2 : 1
      ctx.stroke()

      // Street grid lines
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + CELL, cy)
      ctx.lineTo(cx + CELL, cy + CELL)
      ctx.stroke()
    }
  }
}

function drawAgents() {
  gs.agents.forEach(agent => {
    const cx = GRID_X + agent.x * CELL + CELL / 2
    const cy = GRID_Y + agent.y * CELL + CELL / 2

    const isSelected = gs.tapSelect.includes(agent.id) || gs.accuseTarget === agent.id

    // Shadow
    ctx.beginPath()
    ctx.arc(cx, cy, 16, 0, Math.PI * 2)
    ctx.fillStyle = agent.color + '22'
    ctx.fill()

    // Circle
    ctx.beginPath()
    ctx.arc(cx, cy, 12, 0, Math.PI * 2)
    ctx.fillStyle = agent.color
    ctx.fill()

    if (isSelected) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3
      ctx.stroke()
    }

    // Name initial
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(agent.name[0], cx, cy + 4)
  })
}

function drawBayesPanel() {
  const px = GRID_X + GRID * CELL + 16
  const py = GRID_Y
  const pw = CANVAS_W - px - 10
  ctx.fillStyle = '#0f1a0f'
  drawRoundRect(px, py, pw, 340, 8)
  ctx.fill()

  ctx.textAlign = 'left'
  ctx.fillStyle = '#4ade80'
  ctx.font = 'bold 11px monospace'
  ctx.fillText('SPY PROBABILITY', px + 8, py + 18)

  for (let i = 0; i < gs.agents.length; i++) {
    const agent = gs.agents[i]
    const prob = gs.bayesian[i]
    const ay = py + 30 + i * 50
    const barW = pw - 20

    ctx.fillStyle = '#1e293b'
    drawRoundRect(px + 8, ay, barW, 36, 6)
    ctx.fill()

    // Bar fill
    drawRoundRect(px + 8, ay, barW * prob, 36, 6)
    const opacity = Math.round(prob * 200 + 55)
    ctx.fillStyle = agent.color + opacity.toString(16).padStart(2, '0')
    ctx.fill()

    // Name and %
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(agent.name, px + 14, ay + 14)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#ffd166'
    ctx.font = 'bold 12px monospace'
    ctx.fillText(`${Math.round(prob * 100)}%`, px + barW + 2, ay + 14)

    // Position
    ctx.fillStyle = '#64748b'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`pos (${agent.x},${agent.y})`, px + 14, ay + 29)

    // Meetings
    if (agent.meetings.size > 0) {
      ctx.fillStyle = '#fbbf24'
      ctx.fillText(`met: ${Array.from(agent.meetings).map(id => gs.agents[id].name[0]).join(',')}`, px + 80, ay + 29)
    }
  }
}

function drawActionPanel() {
  const py = GRID_Y + 350
  ctx.fillStyle = '#0f1a0f'
  drawRoundRect(GRID_X + GRID * CELL + 16, py, CANVAS_W - (GRID_X + GRID * CELL + 16) - 10, 180, 8)
  ctx.fill()

  const px = GRID_X + GRID * CELL + 22
  ctx.fillStyle = '#4ade80'
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('ACTIONS', px, py + 16)

  const actions: { label: string; key: 'tap' | 'follow' | 'drop' | 'accuse'; color: string }[] = [
    { label: '📞 Tap\n(-0 turns)', key: 'tap',    color: '#3b82f6' },
    { label: '🕵️ Follow\n(1 turn)',  key: 'follow', color: '#8b5cf6' },
    { label: '📦 Drop\n(1 turn)',    key: 'drop',   color: '#f59e0b' },
    { label: '🎯 Accuse\n(final)',   key: 'accuse', color: '#ef4444' },
  ]

  actions.forEach((a, i) => {
    const bx = px + (i % 2) * 72
    const by = py + 22 + Math.floor(i / 2) * 64
    drawRoundRect(bx, by, 65, 52, 6)
    ctx.fillStyle = gs.action === a.key ? a.color : a.color + '44'
    ctx.fill()
    ctx.strokeStyle = gs.action === a.key ? '#fff' : a.color
    ctx.lineWidth = gs.action === a.key ? 2 : 1
    ctx.stroke()
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    const lines = a.label.split('\n')
    lines.forEach((l, li) => {
      ctx.fillText(l, bx + 32, by + 20 + li * 14)
    })
  })

  // Action instructions
  ctx.textAlign = 'left'
  ctx.fillStyle = '#64748b'
  ctx.font = '9px monospace'
  if (gs.action === 'tap') {
    ctx.fillText(`Select ${2 - gs.tapSelect.length} agent(s)`, px, py + 158)
    ctx.fillText('on the grid', px, py + 170)
  } else if (gs.action === 'follow') {
    ctx.fillText('Click agent to follow', px, py + 158)
  } else if (gs.action === 'drop') {
    ctx.fillText('Click grid cell to check', px, py + 158)
  } else if (gs.action === 'accuse') {
    ctx.fillText('Click agent to accuse', px, py + 158)
  } else {
    ctx.fillText('Select action above', px, py + 158)
  }
}

function drawEvidenceLog() {
  const logY = GRID_Y
  const logH = Math.min(gs.evidence.length * 40 + 20, 330)
  // Compact log below grid
  ctx.fillStyle = '#0a0d0a'
  drawRoundRect(GRID_X, GRID_Y + GRID * CELL + 8, GRID * CELL, CANVAS_H - GRID_Y - GRID * CELL - 16, 6)
  ctx.fill()

  ctx.textAlign = 'left'
  ctx.fillStyle = '#4ade80'
  ctx.font = 'bold 10px monospace'
  ctx.fillText('EVIDENCE LOG', GRID_X + 4, GRID_Y + GRID * CELL + 22)

  const recentEvidence = gs.evidence.slice(-3)
  recentEvidence.forEach((e, i) => {
    const ey = GRID_Y + GRID * CELL + 34 + i * 34
    ctx.fillStyle = '#334155'
    ctx.font = '9px monospace'
    ctx.fillText(`T${e.turn}: ${e.action}`, GRID_X + 4, ey)
    ctx.fillStyle = e.suspicious && e.suspicious.length > 0 ? '#fbbf24' : '#94a3b8'
    ctx.fillText(e.result.length > 42 ? e.result.slice(0, 40) + '…' : e.result, GRID_X + 4, ey + 13)
  })
}

function drawGameOver() {
  const spy = gs.agents.find(a => a.isSpy)!
  ctx.textAlign = 'center'
  ctx.fillStyle = gs.won ? '#4ade80' : '#f87171'
  ctx.font = 'bold 28px monospace'
  ctx.fillText(gs.won ? 'SPY CAUGHT!' : 'WRONG SUSPECT!', CANVAS_W / 2, 130)

  ctx.fillStyle = '#e2e8f0'
  ctx.font = '16px monospace'
  ctx.fillText(`The spy was: ${spy.name}`, CANVAS_W / 2, 175)

  if (gs.won) {
    ctx.fillStyle = '#ffd166'
    ctx.font = 'bold 24px monospace'
    ctx.fillText(`Score: ${gs.score}`, CANVAS_W / 2, 220)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '14px monospace'
    ctx.fillText(`Identified in ${gs.turn - 1} turns`, CANVAS_W / 2, 252)
  } else {
    ctx.fillStyle = '#f87171'
    ctx.font = 'bold 18px monospace'
    ctx.fillText(`Score: 0 — wrong accusation`, CANVAS_W / 2, 220)
  }

  ctx.fillStyle = '#94a3b8'
  ctx.font = '14px monospace'
  ctx.fillText(`Best: ${gs.bestScore}`, CANVAS_W / 2, 285)

  // Spy's final probability
  ctx.fillText(`Final spy probability at accusation: ${Math.round(gs.bayesian[spy.id] * 100)}%`, CANVAS_W / 2, 318)

  // Evidence summary
  ctx.fillStyle = '#64748b'
  ctx.font = '11px monospace'
  gs.evidence.slice(-5).forEach((e, i) => {
    ctx.fillText(`T${e.turn}: ${e.action} → ${e.result.slice(0, 48)}`, CANVAS_W / 2, 345 + i * 22)
  })

  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 90, 160, 46, 10)
  ctx.fillStyle = '#166534'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px monospace'
  ctx.fillText('Play Again', CANVAS_W / 2, CANVAS_H - 58)
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
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 90 && cy <= CANVAS_H - 44) startGame()
    return
  }

  // Action buttons
  const apx = GRID_X + GRID * CELL + 22
  const apy = GRID_Y + 350
  const actions = ['tap', 'follow', 'drop', 'accuse']
  for (let i = 0; i < 4; i++) {
    const bx = apx + (i % 2) * 72
    const by = apy + 22 + Math.floor(i / 2) * 64
    if (cx >= bx && cx <= bx + 65 && cy >= by && cy <= by + 52) {
      audio.click()
      gs.action = actions[i] as GameState['action']
      gs.tapSelect = []
      gs.dropCell = null
      gs.accuseTarget = null
      gs.message = ''
      return
    }
  }

  // Grid clicks
  if (cx >= GRID_X && cx <= GRID_X + GRID * CELL && cy >= GRID_Y && cy <= GRID_Y + GRID * CELL) {
    const gx = Math.floor((cx - GRID_X) / CELL)
    const gy2 = Math.floor((cy - GRID_Y) / CELL)

    if (gs.action === 'drop') {
      gs.dropCell = { x: gx, y: gy2 }
      executeDropCheck({ x: gx, y: gy2 })
      gs.action = null
      return
    }

    // Check if clicking on an agent
    for (const agent of gs.agents) {
      const ax = GRID_X + agent.x * CELL + CELL / 2
      const ay = GRID_Y + agent.y * CELL + CELL / 2
      if (Math.sqrt((cx - ax) ** 2 + (cy - ay) ** 2) < 18) {
        if (gs.action === 'tap') {
          if (!gs.tapSelect.includes(agent.id)) {
            gs.tapSelect.push(agent.id)
            if (gs.tapSelect.length >= 2) {
              executeTap(gs.tapSelect.slice(0, 2))
              gs.tapSelect = []
              gs.action = null
            } else {
              gs.message = `${agent.name} selected. Pick one more.`
            }
          }
          return
        }
        if (gs.action === 'follow') {
          executeFollow(agent.id)
          gs.action = null
          return
        }
        if (gs.action === 'accuse' || gs.phase === 'accuse') {
          gs.accuseTarget = agent.id
          makeAccusation(agent.id)
          return
        }
      }
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
  draw()
  requestAnimationFrame(loop)
}

initSDK().then(({ bestScore }) => {
  gs.bestScore = bestScore
  loop()
})
