import { audio } from './audio'
import { initSDK, reportGameOver, saveBestScore } from './sdk-bridge'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Types ─────────────────────────────────────────────────────────────────────

interface AIPlayer {
  name: string
  color: string
  emoji: string
  depthLevel: number  // 0, 1, 2, or 'contrarian' encoded as -1
  pick: number
}

interface RoundResult {
  playerPick: number
  aiPicks: number[]
  allPicks: number[]
  average: number
  target: number
  multiplier: number
  winner: string  // 'player' | ai name
  winnerPick: number
  playerPoints: number
}

interface GameState {
  phase: 'start' | 'picking' | 'result' | 'gameover'
  round: number
  playerPick: number
  aiPlayers: AIPlayer[]
  results: RoundResult[]
  playerScore: number
  bestScore: number
  message: string
  sliderDragging: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 700
const CANVAS_H = 520
const TOTAL_ROUNDS = 10

const AI_DATA = [
  { name: 'Nova',   color: '#f87171', emoji: '🤖', depthLevel: 0 },
  { name: 'Cipher', color: '#60a5fa', emoji: '🧠', depthLevel: 1 },
  { name: 'Sigma',  color: '#4ade80', emoji: '🌀', depthLevel: 2 },
  { name: 'Hex',    color: '#fbbf24', emoji: '😈', depthLevel: -1 }, // contrarian
  { name: 'Vex',    color: '#a78bfa', emoji: '🎯', depthLevel: 1 },
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

function makeAIPlayers(): AIPlayer[] {
  return AI_DATA.map(d => ({ ...d, pick: 0 }))
}

let gs: GameState = {
  phase: 'start',
  round: 1,
  playerPick: 33,
  aiPlayers: makeAIPlayers(),
  results: [],
  playerScore: 0,
  bestScore: 0,
  message: '',
  sliderDragging: false,
}

function startGame() {
  gs = {
    phase: 'picking',
    round: 1,
    playerPick: 33,
    aiPlayers: makeAIPlayers(),
    results: [],
    playerScore: 0,
    bestScore: gs.bestScore,
    message: '',
    sliderDragging: false,
  }
  audio.start()
}

// ── Multiplier ────────────────────────────────────────────────────────────────

function getMultiplier(round: number): number {
  if (round >= 8) return 3 / 4
  if (round >= 5) return 1 / 2
  return 2 / 3
}

function getMultiplierLabel(m: number): string {
  if (m === 2 / 3) return '2/3'
  if (m === 1 / 2) return '1/2'
  return '3/4'
}

// ── AI Logic ──────────────────────────────────────────────────────────────────

function computeAIPick(player: AIPlayer, round: number, results: RoundResult[]): number {
  const mult = getMultiplier(round)
  // Adapt slightly based on recent rounds
  let adapt = 0
  if (results.length > 0) {
    const last = results[results.length - 1]
    adapt = (last.average - last.target) * 0.1
  }

  let base = 0
  switch (player.depthLevel) {
    case 0:
      base = 50 + (Math.random() - 0.5) * 20
      break
    case 1:
      base = 50 * mult + (Math.random() - 0.5) * 10
      break
    case 2:
      base = 50 * mult * mult + (Math.random() - 0.5) * 8
      break
    case -1: // contrarian
      base = results.length > 0
        ? 100 - results[results.length - 1].average + (Math.random() - 0.5) * 15
        : 75 + (Math.random() - 0.5) * 10
      break
    default:
      base = 33
  }

  return Math.max(0, Math.min(100, Math.round(base + adapt)))
}

// ── Round Logic ───────────────────────────────────────────────────────────────

function submitPick() {
  const round = gs.round
  const mult = getMultiplier(round)

  // Compute AI picks
  for (const ai of gs.aiPlayers) {
    ai.pick = computeAIPick(ai, round, gs.results)
  }

  const allPicks = [gs.playerPick, ...gs.aiPlayers.map(a => a.pick)]
  const average = allPicks.reduce((a, b) => a + b, 0) / allPicks.length
  const target = average * mult

  // Find winner: closest to target
  let minDist = Infinity
  let winnerName = 'player'
  let winnerPick = gs.playerPick
  let playerDist = Math.abs(gs.playerPick - target)
  minDist = playerDist

  for (const ai of gs.aiPlayers) {
    const d = Math.abs(ai.pick - target)
    if (d < minDist) {
      minDist = d
      winnerName = ai.name
      winnerPick = ai.pick
    }
  }

  const playerWon = winnerName === 'player'
  const playerPoints = playerWon ? 10 + Math.round((1 - playerDist / 50) * 10) : 0
  gs.playerScore += playerPoints

  const result: RoundResult = {
    playerPick: gs.playerPick,
    aiPicks: gs.aiPlayers.map(a => a.pick),
    allPicks,
    average: Math.round(average * 10) / 10,
    target: Math.round(target * 10) / 10,
    multiplier: mult,
    winner: winnerName,
    winnerPick,
    playerPoints,
  }
  gs.results.push(result)

  if (playerWon) audio.score()
  else audio.blip()

  gs.phase = 'result'
}

function nextRound() {
  if (gs.round >= TOTAL_ROUNDS) {
    const finalScore = gs.playerScore
    if (finalScore > gs.bestScore) {
      gs.bestScore = finalScore
      saveBestScore(finalScore)
    }
    reportGameOver(finalScore)
    gs.phase = 'gameover'
    audio.levelUp()
    return
  }
  gs.round++
  gs.phase = 'picking'
  // Keep player's last pick as default (realistic behavior)
}

// ── Draw Helpers ──────────────────────────────────────────────────────────────

function drawRoundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function classifyDepth(_score: number, totalRounds: number): string {
  const wins = gs.results.filter(r => r.winner === 'player').length
  const ratio = wins / totalRounds
  if (ratio >= 0.6) return 'Level-2 Thinker — deep & strategic'
  if (ratio >= 0.35) return 'Level-1 Thinker — one step ahead'
  if (ratio >= 0.1) return 'Level-0 Thinker — naive averaging'
  return 'Contrarian — marching to own beat'
}

// ── Draw ──────────────────────────────────────────────────────────────────────

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  bg.addColorStop(0, '#0a0a1e')
  bg.addColorStop(1, '#0d0d1a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  if (gs.phase === 'start') { drawStart(); return }
  if (gs.phase === 'gameover') { drawGameOver(); return }

  drawHeader()
  drawAIPlayers()

  if (gs.phase === 'picking') drawPicking()
  if (gs.phase === 'result') drawResult()
}

function drawStart() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#a78bfa'
  ctx.font = 'bold 34px monospace'
  ctx.fillText('Keynesian Beauty', CANVAS_W / 2, 130)
  ctx.font = '14px monospace'
  ctx.fillStyle = '#94a3b8'
  const lines = [
    'Pick a number 0–100 each round.',
    'Winner = closest to 2/3 of the group average.',
    '',
    'Round 5: multiplier changes to 1/2.',
    'Round 8: multiplier changes to 3/4.',
    '',
    '6 players total. 10 rounds.',
    'Points for each round you win.',
    'How deep is your reasoning?',
  ]
  lines.forEach((l, i) => ctx.fillText(l, CANVAS_W / 2, 185 + i * 24))
  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 100, 160, 48, 10)
  ctx.fillStyle = '#7c3aed'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('Play', CANVAS_W / 2, CANVAS_H - 68)
}

function drawHeader() {
  ctx.fillStyle = '#1e1a2e'
  drawRoundRect(10, 10, CANVAS_W - 20, 44, 8)
  ctx.fill()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.fillText(`Round ${gs.round}/${TOTAL_ROUNDS}`, 20, 30)
  const mult = getMultiplier(gs.round)
  ctx.fillStyle = '#a78bfa'
  ctx.font = 'bold 13px monospace'
  ctx.fillText(`Target = ${getMultiplierLabel(mult)} × average`, 20, 48)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffd166'
  ctx.font = 'bold 15px monospace'
  ctx.fillText(`Score: ${gs.playerScore}`, CANVAS_W - 15, 36)
}

function drawAIPlayers() {
  const playerY = 65
  const cardW = (CANVAS_W - 20) / 5 - 4

  gs.aiPlayers.forEach((ai, i) => {
    const bx = 10 + i * (cardW + 4)
    ctx.fillStyle = '#1a1a2e'
    drawRoundRect(bx, playerY, cardW, 76, 8)
    ctx.fill()
    ctx.strokeStyle = ai.color + '44'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.font = '18px monospace'
    ctx.fillText(ai.emoji, bx + cardW / 2, playerY + 24)
    ctx.fillStyle = ai.color
    ctx.font = 'bold 10px monospace'
    ctx.fillText(ai.name, bx + cardW / 2, playerY + 40)
    ctx.fillStyle = '#64748b'
    ctx.font = '9px monospace'
    const depthLabel = ai.depthLevel === -1 ? 'Contrarian' : `L${ai.depthLevel}`
    ctx.fillText(depthLabel, bx + cardW / 2, playerY + 52)

    if (gs.phase === 'result' && gs.results.length > 0) {
      const last = gs.results[gs.results.length - 1]
      ctx.fillStyle = '#e2e8f0'
      ctx.font = 'bold 12px monospace'
      ctx.fillText(`${last.aiPicks[i]}`, bx + cardW / 2, playerY + 68)
    } else {
      ctx.fillStyle = '#334155'
      ctx.font = '11px monospace'
      ctx.fillText('?', bx + cardW / 2, playerY + 68)
    }
  })
}

function drawPicking() {
  const sy = 155
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e2e8f0'
  ctx.font = 'bold 15px monospace'
  ctx.fillText('Pick your number (0–100):', CANVAS_W / 2, sy + 20)

  // Large number display
  ctx.fillStyle = '#a78bfa'
  ctx.font = 'bold 64px monospace'
  ctx.fillText(`${gs.playerPick}`, CANVAS_W / 2, sy + 90)

  // Slider
  const slX = 60, slY = sy + 115, slW = CANVAS_W - 120
  drawRoundRect(slX, slY, slW, 14, 7)
  ctx.fillStyle = '#1e1a2e'
  ctx.fill()
  const frac = gs.playerPick / 100
  drawRoundRect(slX, slY, slW * frac, 14, 7)
  ctx.fillStyle = '#7c3aed'
  ctx.fill()
  const thumbX = slX + slW * frac
  ctx.beginPath()
  ctx.arc(thumbX, slY + 7, 16, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.strokeStyle = '#a78bfa'
  ctx.lineWidth = 3
  ctx.stroke()

  // Scale
  ctx.fillStyle = '#475569'
  ctx.font = '10px monospace'
  ;[0, 25, 50, 75, 100].forEach(v => {
    ctx.fillText(`${v}`, slX + slW * (v / 100), slY + 35)
  })

  // Strategy hint
  const mult = getMultiplier(gs.round)
  ctx.fillStyle = '#64748b'
  ctx.font = '11px monospace'
  ctx.fillText(`Naive avg ≈ 50 → target ≈ ${Math.round(50 * mult)} | Deep target ≈ ${Math.round(50 * mult * mult)}`, CANVAS_W / 2, sy + 165)

  // Round history dots
  if (gs.results.length > 0) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('History:', 20, sy + 195)
    gs.results.forEach((r, i) => {
      const rx = 80 + i * 55
      ctx.fillStyle = r.winner === 'player' ? '#4ade80' : '#475569'
      drawRoundRect(rx, sy + 183, 48, 20, 4)
      ctx.fill()
      ctx.fillStyle = r.winner === 'player' ? '#fff' : '#94a3b8'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${r.playerPick}→${r.target}`, rx + 24, sy + 197)
    })
  }

  // Submit button
  drawRoundRect(CANVAS_W / 2 - 70, sy + 205, 140, 44, 8)
  ctx.fillStyle = '#7c3aed'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('Submit', CANVAS_W / 2, sy + 232)
}

function drawResult() {
  if (gs.results.length === 0) return
  const r = gs.results[gs.results.length - 1]
  const sy = 150

  // All picks bar
  ctx.fillStyle = '#1e1a2e'
  drawRoundRect(10, sy, CANVAS_W - 20, 90, 8)
  ctx.fill()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px monospace'
  ctx.fillText(`Average: ${r.average}  |  Target (×${getMultiplierLabel(r.multiplier)}): ${r.target}`, CANVAS_W / 2, sy + 18)

  // Pick positions on number line
  const lineY = sy + 52
  const lineX = 40, lineW = CANVAS_W - 80
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(lineX, lineY)
  ctx.lineTo(lineX + lineW, lineY)
  ctx.stroke()

  // Target marker
  const tx = lineX + lineW * (r.target / 100)
  ctx.strokeStyle = '#ffd166'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(tx, lineY - 20)
  ctx.lineTo(tx, lineY + 20)
  ctx.stroke()
  ctx.fillStyle = '#ffd166'
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('TARGET', tx, lineY - 24)
  ctx.fillText(`${r.target}`, tx, lineY + 34)

  // Player pick
  const ppx = lineX + lineW * (r.playerPick / 100)
  ctx.beginPath()
  ctx.arc(ppx, lineY, 10, 0, Math.PI * 2)
  ctx.fillStyle = r.winner === 'player' ? '#4ade80' : '#e2e8f0'
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.font = 'bold 8px monospace'
  ctx.fillText('YOU', ppx, lineY + 4)

  // AI picks
  gs.aiPlayers.forEach((ai, i) => {
    const apx = lineX + lineW * (r.aiPicks[i] / 100)
    ctx.beginPath()
    ctx.arc(apx, lineY, 8, 0, Math.PI * 2)
    ctx.fillStyle = ai.color + (r.winner === ai.name ? 'ff' : '88')
    ctx.fill()
  })

  // Winner announcement
  const resultY = sy + 104
  ctx.fillStyle = r.winner === 'player' ? '#4ade80' : '#f87171'
  ctx.font = 'bold 18px monospace'
  ctx.textAlign = 'center'
  if (r.winner === 'player') {
    ctx.fillText(`You win! +${r.playerPoints} pts (pick: ${r.playerPick})`, CANVAS_W / 2, resultY + 20)
  } else {
    ctx.fillText(`${r.winner} wins with ${r.winnerPick}. Your pick: ${r.playerPick}`, CANVAS_W / 2, resultY + 20)
  }

  // All picks legend
  ctx.fillStyle = '#64748b'
  ctx.font = '10px monospace'
  const allLabels = [`You: ${r.playerPick}`, ...gs.aiPlayers.map((ai, i) => `${ai.name}: ${r.aiPicks[i]}`)]
  allLabels.forEach((l, i) => {
    ctx.fillText(l, 60 + i * 100, resultY + 44)
  })

  // Next button
  drawRoundRect(CANVAS_W / 2 - 70, resultY + 56, 140, 42, 8)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 14px monospace'
  ctx.fillText(gs.round >= TOTAL_ROUNDS ? 'Finish' : 'Next Round →', CANVAS_W / 2, resultY + 84)
}

function drawGameOver() {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#a78bfa'
  ctx.font = 'bold 30px monospace'
  ctx.fillText('Keynesian Beauty — Done!', CANVAS_W / 2, 120)
  ctx.fillStyle = '#ffd166'
  ctx.font = 'bold 26px monospace'
  ctx.fillText(`Score: ${gs.playerScore} pts`, CANVAS_W / 2, 170)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '15px monospace'
  ctx.fillText(`Best: ${gs.bestScore}`, CANVAS_W / 2, 205)

  const wins = gs.results.filter(r => r.winner === 'player').length
  ctx.fillText(`Rounds won: ${wins}/${TOTAL_ROUNDS}`, CANVAS_W / 2, 235)
  ctx.fillStyle = '#e2e8f0'
  ctx.font = '13px monospace'
  ctx.fillText(`Classification: ${classifyDepth(gs.playerScore, TOTAL_ROUNDS)}`, CANVAS_W / 2, 268)

  // Round history
  gs.results.forEach((r, i) => {
    const ry = 292 + i * 20
    ctx.textAlign = 'left'
    ctx.fillStyle = r.winner === 'player' ? '#4ade80' : '#475569'
    ctx.font = '10px monospace'
    ctx.fillText(`R${i + 1}: pick=${r.playerPick} target=${r.target} ${r.winner === 'player' ? `+${r.playerPoints}pts` : `won:${r.winner}(${r.winnerPick})`}`, 80, ry)
  })

  drawRoundRect(CANVAS_W / 2 - 80, CANVAS_H - 90, 160, 46, 10)
  ctx.fillStyle = '#7c3aed'
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('Play Again', CANVAS_W / 2, CANVAS_H - 58)
}

// ── Input ─────────────────────────────────────────────────────────────────────

let sliderDragging = false

function getCanvasPoint(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (clientX - rect.left) * (CANVAS_W / rect.width),
    y: (clientY - rect.top) * (CANVAS_H / rect.height),
  }
}

function updateSlider(clientX: number) {
  const rect = canvas.getBoundingClientRect()
  const cx = (clientX - rect.left) * (CANVAS_W / rect.width)
  const sy = 155
  const slX = 60, slW = CANVAS_W - 120
  const frac = Math.max(0, Math.min(1, (cx - slX) / slW))
  gs.playerPick = Math.round(frac * 100)
}

function handlePointerDown(cx: number, cy: number, rawClientX: number) {
  if (gs.phase === 'start') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 100 && cy <= CANVAS_H - 52) startGame()
    return
  }
  if (gs.phase === 'gameover') {
    if (cx >= CANVAS_W / 2 - 80 && cx <= CANVAS_W / 2 + 80 && cy >= CANVAS_H - 90 && cy <= CANVAS_H - 44) startGame()
    return
  }
  if (gs.phase === 'result') {
    const r = gs.results[gs.results.length - 1]
    const resultY = 150 + 104
    const bx = CANVAS_W / 2 - 70, by = resultY + 56
    if (cx >= bx && cx <= bx + 140 && cy >= by && cy <= by + 42) {
      audio.click()
      nextRound()
    }
    return
  }
  if (gs.phase === 'picking') {
    const sy = 155
    const slY = sy + 115
    // Slider area
    if (cy >= slY - 16 && cy <= slY + 30) {
      sliderDragging = true
      updateSlider(rawClientX)
      return
    }
    // Submit
    const bx = CANVAS_W / 2 - 70, by = sy + 205
    if (cx >= bx && cx <= bx + 140 && cy >= by && cy <= by + 44) {
      audio.click()
      submitPick()
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  const p = getCanvasPoint(e.clientX, e.clientY)
  handlePointerDown(p.x, p.y, e.clientX)
})
canvas.addEventListener('mousemove', (e) => {
  if (sliderDragging && gs.phase === 'picking') updateSlider(e.clientX)
})
canvas.addEventListener('mouseup', () => { sliderDragging = false })
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const t = e.changedTouches[0]
  const p = getCanvasPoint(t.clientX, t.clientY)
  handlePointerDown(p.x, p.y, t.clientX)
}, { passive: false })
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault()
  if (sliderDragging) updateSlider(e.changedTouches[0].clientX)
}, { passive: false })
canvas.addEventListener('touchend', (e) => {
  e.preventDefault()
  sliderDragging = false
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
