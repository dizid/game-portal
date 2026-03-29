import { audio } from './audio'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Types ─────────────────────────────────────────────────────────────────────

type Opinion = number // 0 = strongly against, 1 = strongly for
type Stubborn = 1 | 2 | 3 | 4 | 5
type Relationship = 'ally' | 'neutral' | 'rival'

interface Agent {
  id: number
  name: string
  color: string
  opinion: Opinion       // 0.0–1.0
  stubbornness: Stubborn // 1=easy to move, 5=hard
  relationships: number[] // index into agents array, positive=ally, negative=rival
  relMap: Record<number, Relationship>
  lastBid: string
  revealed: boolean      // whether straw poll has revealed their lean
  linkedTo: number | null // broker deal link
}

type GamePhase = 'start' | 'playing' | 'gameover'
type Action = 'lobby' | 'poll' | 'broker' | 'vote'

interface BrokerLink {
  a: number
  b: number
}

interface GameState {
  phase: GamePhase
  pc: number            // Political Capital
  turn: number
  agents: Agent[]
  brokerLinks: BrokerLink[]
  resolution: string
  message: string
  messageTimer: number
  score: number
  win: boolean
  bestScore: number
  selectedAgent: number | null
  selectedAction: Action | null
  brokerFirst: number | null // first selected for broker
  voteResult: { for: number; against: number } | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AGENT_NAMES = ['Atlas', 'Brynn', 'Caspian', 'Delia', 'Ezra', 'Fiona', 'Gideon']
const AGENT_COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#118ab2', '#a78bfa', '#f77f00', '#e0c3fc']
const RESOLUTIONS = [
  'Universal Basic Income Implementation',
  'Mandatory AI Ethics Oversight',
  'Carbon Tax Framework',
  'Open Source Government Software',
  'Algorithmic Transparency Act',
  'Digital Citizen Dividend',
  'Autonomous Vehicle Priority Lanes',
]

const CANVAS_W = 700
const CANVAS_H = 580
const CENTER_X = 320
const CENTER_Y = 260
const ORBIT_R = 180

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

// ── Game State ────────────────────────────────────────────────────────────────

let gs: GameState = createInitialState()

function createInitialState(): GameState {
  return {
    phase: 'start',
    pc: 15,
    turn: 1,
    agents: [],
    brokerLinks: [],
    resolution: RESOLUTIONS[0],
    message: '',
    messageTimer: 0,
    score: 0,
    win: false,
    bestScore: 0,
    selectedAgent: null,
    selectedAction: null,
    brokerFirst: null,
    voteResult: null,
  }
}

function makeAgents(): Agent[] {
  const agents: Agent[] = []
  const relTypes: Relationship[] = ['ally', 'neutral', 'rival']
  for (let i = 0; i < 7; i++) {
    const relMap: Record<number, Relationship> = {}
    for (let j = 0; j < 7; j++) {
      if (j !== i) relMap[j] = relTypes[Math.floor(Math.random() * 3)]
    }
    agents.push({
      id: i,
      name: AGENT_NAMES[i],
      color: AGENT_COLORS[i],
      opinion: Math.random(),
      stubbornness: (Math.floor(Math.random() * 5) + 1) as Stubborn,
      relationships: [],
      relMap,
      lastBid: '',
      revealed: false,
      linkedTo: null,
    })
  }
  return agents
}

function startGame() {
  const res = RESOLUTIONS[Math.floor(Math.random() * RESOLUTIONS.length)]
  gs = {
    ...createInitialState(),
    phase: 'playing',
    bestScore: gs.bestScore,
    agents: makeAgents(),
    resolution: res,
  }
  audio.start()
}

// ── Action Logic ──────────────────────────────────────────────────────────────

function countVotes(): { forVotes: number; againstVotes: number } {
  let forVotes = 0
  let againstVotes = 0
  for (const a of gs.agents) {
    // Apply broker links: linked agents vote together
    let eff = a.opinion
    if (a.linkedTo !== null) {
      const partner = gs.agents[a.linkedTo]
      eff = (a.opinion + partner.opinion) / 2
    }
    if (eff >= 0.5) forVotes++
    else againstVotes++
  }
  return { forVotes, againstVotes }
}

function lobby(agentId: number) {
  if (gs.pc < 3) { setMessage('Not enough PC! (need 3)'); return }
  gs.pc -= 3
  const agent = gs.agents[agentId]
  const shift = (0.15 + Math.random() * 0.1) / agent.stubbornness
  // Try to push toward 'for' if currently low, or 'against' if currently high
  const direction = agent.opinion < 0.5 ? 1 : -1
  agent.opinion = Math.max(0, Math.min(1, agent.opinion + shift * direction))
  agent.revealed = true
  agent.lastBid = 'Lobbied'
  // Allies shift slightly in same direction, rivals slightly opposite
  for (let i = 0; i < gs.agents.length; i++) {
    if (i === agentId) continue
    const rel = agent.relMap[i]
    const other = gs.agents[i]
    const ripple = (0.03 + Math.random() * 0.02) / other.stubbornness
    if (rel === 'ally') other.opinion = Math.max(0, Math.min(1, other.opinion + shift * direction * ripple * 3))
    if (rel === 'rival') other.opinion = Math.max(0, Math.min(1, other.opinion - shift * direction * ripple * 2))
  }
  setMessage(`Lobbied ${agent.name} — opinion shifted!`)
  audio.blip()
  gs.turn++
}

function strawPoll() {
  if (gs.pc < 1) { setMessage('Not enough PC! (need 1)'); return }
  gs.pc -= 1
  for (const a of gs.agents) a.revealed = true
  setMessage('Straw poll called — all opinions revealed!')
  audio.combo()
  gs.turn++
}

function brokerDeal(a: number, b: number) {
  if (gs.pc < 2) { setMessage('Not enough PC! (need 2)'); return }
  // Remove any existing links for a or b
  gs.brokerLinks = gs.brokerLinks.filter(l => l.a !== a && l.b !== a && l.a !== b && l.b !== b)
  gs.agents[a].linkedTo = b
  gs.agents[b].linkedTo = a
  gs.brokerLinks.push({ a, b })
  gs.pc -= 2
  setMessage(`Brokered deal: ${gs.agents[a].name} ↔ ${gs.agents[b].name}`)
  audio.powerup()
  gs.turn++
}

function callVote() {
  const { forVotes, againstVotes } = countVotes()
  gs.voteResult = { for: forVotes, against: againstVotes }
  if (forVotes >= 5) {
    gs.win = true
    gs.score = gs.pc
    if (gs.score > gs.bestScore) {
      gs.bestScore = gs.score
      saveBestScore(gs.score)
    }
    reportGameOver(gs.score)
    audio.levelUp()
    setMessage(`PASSED ${forVotes}-${againstVotes}! Score: ${gs.score} PC`)
  } else {
    gs.win = false
    gs.score = 0
    reportGameOver(0)
    audio.death()
    setMessage(`FAILED ${forVotes}-${againstVotes}. Not enough votes.`)
  }
  gs.phase = 'gameover'
}

function setMessage(msg: string) {
  gs.message = msg
  gs.messageTimer = 180
}

// ── UI Buttons ─────────────────────────────────────────────────────────────────

interface Button {
  x: number; y: number; w: number; h: number; label: string; action: Action
  cost: number; color: string
}

function getButtons(): Button[] {
  return [
    { x: 10,  y: 490, w: 155, h: 50, label: 'Lobby (-3 PC)',   action: 'lobby',  cost: 3, color: '#3b82f6' },
    { x: 175, y: 490, w: 155, h: 50, label: 'Straw Poll (-1)', action: 'poll',   cost: 1, color: '#8b5cf6' },
    { x: 340, y: 490, w: 155, h: 50, label: 'Broker Deal (-2)',action: 'broker', cost: 2, color: '#f59e0b' },
    { x: 505, y: 490, w: 185, h: 50, label: 'Call Final Vote', action: 'vote',   cost: 0, color: '#10b981' },
  ]
}

// ── Agent Circle Positions ────────────────────────────────────────────────────

function agentPos(i: number): { x: number; y: number } {
  const angle = (i / 7) * Math.PI * 2 - Math.PI / 2
  return {
    x: CENTER_X + ORBIT_R * Math.cos(angle),
    y: CENTER_Y + ORBIT_R * Math.sin(angle),
  }
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

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  bg.addColorStop(0, '#0a0a1a')
  bg.addColorStop(1, '#0d1117')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  if (gs.phase === 'start') { drawStart(); return }
  if (gs.phase === 'gameover') { drawGameOver(); return }

  drawGame()
}

function drawStart() {
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 36px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('Consensus Engine', CANVAS_W / 2, 160)

  ctx.font = '15px monospace'
  ctx.fillStyle = '#94a3b8'
  const lines = [
    'Chair a committee of 7 AI agents.',
    'Need 5+ votes to pass the resolution.',
    '',
    'Lobby (-3 PC): shift an agent\'s opinion',
    'Straw Poll (-1 PC): reveal all leanings',
    'Broker Deal (-2 PC): link two agents\' votes',
    'Call Final Vote: win with remaining PC as score',
    '',
    'You have 15 Political Capital.',
  ]
  lines.forEach((l, i) => {
    ctx.fillText(l, CANVAS_W / 2, 220 + i * 24)
  })

  drawPlayButton()
}

function drawPlayButton() {
  const bx = CANVAS_W / 2 - 80
  const by = CANVAS_H - 120
  drawRoundRect(bx, by, 160, 50, 10)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('Play', CANVAS_W / 2, by + 33)
}

function drawGame() {
  // Resolution banner
  ctx.fillStyle = '#1e293b'
  drawRoundRect(10, 10, CANVAS_W - 20, 44, 8)
  ctx.fill()
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('RESOLUTION:', 20, 29)
  ctx.fillStyle = '#e2e8f0'
  ctx.font = 'bold 13px monospace'
  ctx.fillText(gs.resolution, 120, 29)

  // PC and turn
  ctx.fillStyle = '#ffd166'
  ctx.font = 'bold 15px monospace'
  ctx.textAlign = 'right'
  ctx.fillText(`PC: ${gs.pc}`, CANVAS_W - 15, 44)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '13px monospace'
  ctx.fillText(`Turn ${gs.turn}`, CANVAS_W - 15, 28)

  // Broker links
  ctx.strokeStyle = 'rgba(245,158,11,0.4)'
  ctx.lineWidth = 3
  ctx.setLineDash([6, 4])
  for (const link of gs.brokerLinks) {
    const pa = agentPos(link.a)
    const pb = agentPos(link.b)
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Agent circles
  for (let i = 0; i < gs.agents.length; i++) {
    const a = gs.agents[i]
    const pos = agentPos(i)
    const isSelected = gs.selectedAgent === i

    // Glow for selected
    if (isSelected) {
      ctx.shadowColor = '#fff'
      ctx.shadowBlur = 16
    }

    // Opinion bar background (arc underneath)
    const r = 28
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, r + 6, 0, Math.PI * 2)
    ctx.fillStyle = '#1e293b'
    ctx.fill()

    // Opinion arc (green=for, red=against)
    const opAngle = a.opinion * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    ctx.arc(pos.x, pos.y, r + 6, -Math.PI / 2, -Math.PI / 2 + opAngle)
    ctx.closePath()
    const opR = Math.round((1 - a.opinion) * 220)
    const opG = Math.round(a.opinion * 200)
    ctx.fillStyle = `rgb(${opR},${opG},60)`
    ctx.fill()
    ctx.shadowBlur = 0

    // Circle fill
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
    ctx.fillStyle = a.color + '33'
    ctx.fill()
    ctx.strokeStyle = isSelected ? '#fff' : a.color
    ctx.lineWidth = isSelected ? 3 : 2
    ctx.stroke()

    // Name
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(a.name, pos.x, pos.y - 6)

    // Opinion label if revealed
    if (a.revealed) {
      ctx.font = '9px monospace'
      ctx.fillStyle = a.opinion >= 0.5 ? '#4ade80' : '#f87171'
      ctx.fillText(a.opinion >= 0.5 ? 'FOR' : 'AGAINST', pos.x, pos.y + 10)
      ctx.fillStyle = '#94a3b8'
      ctx.fillText(`${Math.round(a.opinion * 100)}%`, pos.x, pos.y + 21)
    } else {
      ctx.font = '9px monospace'
      ctx.fillStyle = '#64748b'
      ctx.fillText('???', pos.x, pos.y + 10)
    }

    // Stubbornness pips
    for (let s = 0; s < a.stubbornness; s++) {
      ctx.beginPath()
      ctx.arc(pos.x - 16 + s * 8, pos.y + 32, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#475569'
      ctx.fill()
    }

    // Relationship indicators (small dots around)
    // Skipped for brevity — shown via broker links
  }

  // Vote tally preview
  const { forVotes, againstVotes } = countVotes()
  ctx.fillStyle = '#0f172a'
  drawRoundRect(CENTER_X - 50, CENTER_Y - 24, 100, 48, 8)
  ctx.fill()
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = 'bold 18px monospace'
  ctx.fillStyle = '#4ade80'
  ctx.fillText(`${forVotes}`, CENTER_X - 18, CENTER_Y + 4)
  ctx.fillStyle = '#64748b'
  ctx.fillText('–', CENTER_X, CENTER_Y + 4)
  ctx.fillStyle = '#f87171'
  ctx.fillText(`${againstVotes}`, CENTER_X + 18, CENTER_Y + 4)
  ctx.font = '9px monospace'
  ctx.fillStyle = '#64748b'
  ctx.fillText('vote preview', CENTER_X, CENTER_Y - 10)
  ctx.fillText('need 5 to pass', CENTER_X, CENTER_Y + 18)

  // Action buttons
  const buttons = getButtons()
  for (const btn of buttons) {
    const active = gs.selectedAction === btn.action
    const disabled = btn.cost > gs.pc
    drawRoundRect(btn.x, btn.y, btn.w, btn.h, 8)
    ctx.fillStyle = disabled ? '#1e293b' : active ? btn.color : btn.color + '44'
    ctx.fill()
    ctx.strokeStyle = disabled ? '#334155' : active ? '#fff' : btn.color
    ctx.lineWidth = active ? 2 : 1
    ctx.stroke()
    ctx.fillStyle = disabled ? '#475569' : '#e2e8f0'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 5)
  }

  // Instruction line
  ctx.font = '11px monospace'
  ctx.fillStyle = '#64748b'
  ctx.textAlign = 'center'
  if (gs.selectedAction === 'lobby') ctx.fillText('Click an agent to lobby them', CANVAS_W / 2, 480)
  else if (gs.selectedAction === 'broker') {
    if (gs.brokerFirst === null) ctx.fillText('Click FIRST agent to link', CANVAS_W / 2, 480)
    else ctx.fillText(`Linking ${gs.agents[gs.brokerFirst].name} — pick second agent`, CANVAS_W / 2, 480)
  }
  else ctx.fillText('Select an action below, then click an agent', CANVAS_W / 2, 480)

  // Message
  if (gs.messageTimer > 0) {
    const alpha = Math.min(1, gs.messageTimer / 30)
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#fbbf24'
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(gs.message, CANVAS_W / 2, 465)
    ctx.globalAlpha = 1
    gs.messageTimer--
  }
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.8)'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  ctx.textAlign = 'center'
  ctx.font = 'bold 32px monospace'
  ctx.fillStyle = gs.win ? '#4ade80' : '#f87171'
  ctx.fillText(gs.win ? 'RESOLUTION PASSED!' : 'RESOLUTION FAILED', CANVAS_W / 2, 160)

  if (gs.voteResult) {
    ctx.font = '18px monospace'
    ctx.fillStyle = '#e2e8f0'
    ctx.fillText(`Final Vote: ${gs.voteResult.for} for, ${gs.voteResult.against} against`, CANVAS_W / 2, 210)
  }

  ctx.font = 'bold 22px monospace'
  ctx.fillStyle = '#ffd166'
  ctx.fillText(`Score: ${gs.score} PC remaining`, CANVAS_W / 2, 260)

  ctx.font = '16px monospace'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`Best: ${gs.bestScore}`, CANVAS_W / 2, 295)

  // Agent summary
  for (let i = 0; i < gs.agents.length; i++) {
    const a = gs.agents[i]
    const x = 80 + (i % 4) * 160
    const y = 330 + Math.floor(i / 4) * 70
    const pos = { x, y }
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2)
    ctx.fillStyle = a.color + '44'
    ctx.fill()
    ctx.strokeStyle = a.opinion >= 0.5 ? '#4ade80' : '#f87171'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(a.name, pos.x, pos.y - 4)
    ctx.font = '9px monospace'
    ctx.fillStyle = a.opinion >= 0.5 ? '#4ade80' : '#f87171'
    ctx.fillText(a.opinion >= 0.5 ? 'FOR' : 'AGAINST', pos.x, pos.y + 10)
  }

  // Play again button
  const bx = CANVAS_W / 2 - 80
  const by = CANVAS_H - 90
  drawRoundRect(bx, by, 160, 50, 10)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('Play Again', CANVAS_W / 2, by + 33)
}

// ── Input ─────────────────────────────────────────────────────────────────────

function getCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const scaleX = CANVAS_W / rect.width
  const scaleY = CANVAS_H / rect.height
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
}

function handleClick(cx: number, cy: number) {
  if (gs.phase === 'start') {
    const bx = CANVAS_W / 2 - 80, by = CANVAS_H - 120
    if (cx >= bx && cx <= bx + 160 && cy >= by && cy <= by + 50) {
      startGame()
    }
    return
  }
  if (gs.phase === 'gameover') {
    const bx = CANVAS_W / 2 - 80, by = CANVAS_H - 90
    if (cx >= bx && cx <= bx + 160 && cy >= by && cy <= by + 50) {
      startGame()
    }
    return
  }

  // Action buttons
  const buttons = getButtons()
  for (const btn of buttons) {
    if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
      audio.click()
      if (btn.action === 'vote') {
        callVote()
        return
      }
      if (btn.action === 'poll') {
        strawPoll()
        gs.selectedAction = null
        return
      }
      gs.selectedAction = btn.action === gs.selectedAction ? null : btn.action
      gs.brokerFirst = null
      return
    }
  }

  // Agent clicks
  for (let i = 0; i < gs.agents.length; i++) {
    const pos = agentPos(i)
    const dx = cx - pos.x
    const dy = cy - pos.y
    if (Math.sqrt(dx * dx + dy * dy) < 34) {
      audio.click()
      if (gs.selectedAction === 'lobby') {
        lobby(i)
        gs.selectedAction = null
        gs.selectedAgent = null
      } else if (gs.selectedAction === 'broker') {
        if (gs.brokerFirst === null) {
          gs.brokerFirst = i
          gs.selectedAgent = i
        } else if (gs.brokerFirst !== i) {
          brokerDeal(gs.brokerFirst, i)
          gs.selectedAction = null
          gs.brokerFirst = null
          gs.selectedAgent = null
        }
      } else {
        gs.selectedAgent = gs.selectedAgent === i ? null : i
      }
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
  const muted = audio.toggleMute()
  muteBtn.textContent = muted ? '🔇' : '🔊'
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
