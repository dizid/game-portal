import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas & DOM ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hudScore = document.getElementById('hud-score')!
const hudLives = document.getElementById('hud-lives')!
const hudTimer = document.getElementById('hud-timer')!
const rulesBanner = document.getElementById('rule-banner')!
const rulesList = document.getElementById('rules-list')!

function resize(): void {
  const area = document.getElementById('game-area')!
  const hud = document.getElementById('hud-bar')!
  const banner = document.getElementById('rule-banner')!
  const w = area.clientWidth
  const h = area.clientHeight - hud.clientHeight - banner.clientHeight
  canvas.width = w
  canvas.height = Math.max(200, h)
}
resize()
window.addEventListener('resize', () => { resize(); updateRulesList() })

// ── Types ──────────────────────────────────────────────────────────────────────

interface Circle {
  x: number; y: number; r: number
  vx: number; vy: number
  color: 'green' | 'red' | 'blue'
  spawnTime: number
}

type RuleId =
  | 'base'
  | 'circles_move'
  | 'red_minus'
  | 'right_click_left_half'
  | 'odd_reversal'
  | 'blue_triple_even'

interface Rule {
  id: RuleId
  text: string
}

const ALL_RULES: Rule[] = [
  { id: 'base',              text: 'Click the green circle. +1 point.' },
  { id: 'circles_move',      text: 'NEW: Circles now move.' },
  { id: 'red_minus',         text: 'NEW: Red circles = -1 if clicked.' },
  { id: 'right_click_left_half', text: 'NEW: Right-click greens in left half.' },
  { id: 'odd_reversal',      text: 'NEW: Odd score reverses red/green.' },
  { id: 'blue_triple_even',  text: 'NEW: Blue = +3 but only on even seconds.' },
]

// ── Game state ─────────────────────────────────────────────────────────────────

type GameState = 'start' | 'playing' | 'gameover'

let state: GameState = 'start'
let score = 0
let lives = 3
let bestScore = 0
let activeRuleIds: Set<RuleId> = new Set(['base'])
let nextRuleIdx = 1
let circles: Circle[] = []
let ruleTimer = 0
let nextRuleAt = 30
let bannerTimer = 0
let elapsed = 0
let spawnTimer = 0
let lastTime = 0

// ── Rule management ────────────────────────────────────────────────────────────

function addNextRule(): void {
  if (nextRuleIdx >= ALL_RULES.length) return
  const rule = ALL_RULES[nextRuleIdx]
  activeRuleIds.add(rule.id)
  nextRuleIdx++

  rulesBanner.textContent = rule.text
  bannerTimer = 240
  audio.combo()
  updateRulesList()

  // Speed up after 5 rules
  if (activeRuleIds.size >= 5) nextRuleAt = 20
}

function updateRulesList(): void {
  // Clear using DOM, not innerHTML, to avoid XSS warnings
  while (rulesList.firstChild) rulesList.removeChild(rulesList.firstChild)

  let idx = 0
  for (const ruleId of activeRuleIds) {
    const rule = ALL_RULES.find(r => r.id === ruleId)!
    const div = document.createElement('div')
    div.className = `rule-item${idx === activeRuleIds.size - 1 && idx > 0 ? ' new' : ''}`
    div.textContent = rule.text
    rulesList.appendChild(div)
    idx++
  }
}

// ── Circle spawning ────────────────────────────────────────────────────────────

function spawnCircle(): void {
  const W = canvas.width; const H = canvas.height
  const r = 24 + Math.random() * 16

  let color: Circle['color'] = 'green'
  if (activeRuleIds.has('red_minus') && Math.random() < 0.3) color = 'red'
  if (activeRuleIds.has('blue_triple_even') && Math.random() < 0.2) color = 'blue'

  const speed = activeRuleIds.has('circles_move') ? (0.8 + Math.random() * 1.4) : 0
  const angle = Math.random() * Math.PI * 2

  circles.push({
    x: r + Math.random() * (W - r * 2),
    y: r + Math.random() * (H - r * 2),
    r,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    color,
    spawnTime: elapsed,
  })

  if (circles.length > 6) circles.shift()
}

// ── Click scoring ──────────────────────────────────────────────────────────────

function evalClick(circle: Circle, isRightClick: boolean): void {
  const W = canvas.width
  const isOddScore = score % 2 === 1
  const isEvenSecond = Math.floor(elapsed) % 2 === 0
  const inLeftHalf = circle.x < W / 2

  let delta = 0
  let valid = false

  if (circle.color === 'green') {
    if (activeRuleIds.has('right_click_left_half')) {
      valid = inLeftHalf ? isRightClick : !isRightClick
    } else {
      valid = !isRightClick
    }

    if (!valid) {
      loseLife()
      return
    }

    delta = (activeRuleIds.has('odd_reversal') && isOddScore) ? -1 : 1

  } else if (circle.color === 'red') {
    if (!activeRuleIds.has('red_minus')) return
    delta = (activeRuleIds.has('odd_reversal') && isOddScore) ? 1 : -1

  } else if (circle.color === 'blue') {
    if (!activeRuleIds.has('blue_triple_even')) return
    if (isEvenSecond) {
      delta = 3
    } else {
      loseLife()
      return
    }
  }

  score += delta
  if (delta > 0) audio.score()
  else if (delta < 0) audio.death()

  const idx = circles.indexOf(circle)
  if (idx !== -1) circles.splice(idx, 1)
  spawnCircle()

  updateHUD()
  reportScore(score)
}

function loseLife(): void {
  lives--
  audio.death()
  updateHUD()
  if (lives <= 0) endGame()
}

function endGame(): void {
  state = 'gameover'
  if (score > bestScore) {
    bestScore = score
    saveBestScore(bestScore)
  }
  reportGameOver(score)
}

function updateHUD(): void {
  hudScore.textContent = String(score)
  hudLives.textContent = '\u2764'.repeat(Math.max(0, lives))
}

// ── Input ──────────────────────────────────────────────────────────────────────

function getCircleAt(px: number, py: number): Circle | null {
  for (let i = circles.length - 1; i >= 0; i--) {
    const c = circles[i]
    const dx = px - c.x; const dy = py - c.y
    if (dx * dx + dy * dy <= c.r * c.r) return c
  }
  return null
}

canvas.addEventListener('click', (e: MouseEvent) => {
  if (state !== 'playing') return
  const rect = canvas.getBoundingClientRect()
  const px = (e.clientX - rect.left) * (canvas.width / rect.width)
  const py = (e.clientY - rect.top) * (canvas.height / rect.height)
  const circle = getCircleAt(px, py)
  if (circle) evalClick(circle, false)
  else audio.blip()
})

canvas.addEventListener('contextmenu', (e: MouseEvent) => {
  e.preventDefault()
  if (state !== 'playing') return
  const rect = canvas.getBoundingClientRect()
  const px = (e.clientX - rect.left) * (canvas.width / rect.width)
  const py = (e.clientY - rect.top) * (canvas.height / rect.height)
  const circle = getCircleAt(px, py)
  if (circle) evalClick(circle, true)
})

canvas.addEventListener('touchend', (e: TouchEvent) => {
  if (state !== 'playing') return
  e.preventDefault()
  const touch = e.changedTouches[0]
  const rect = canvas.getBoundingClientRect()
  const px = (touch.clientX - rect.left) * (canvas.width / rect.width)
  const py = (touch.clientY - rect.top) * (canvas.height / rect.height)
  const circle = getCircleAt(px, py)
  if (circle) evalClick(circle, false)
}, { passive: false })

// ── Game loop ──────────────────────────────────────────────────────────────────

function startGame(): void {
  score = 0
  lives = 3
  activeRuleIds = new Set(['base'])
  nextRuleIdx = 1
  circles = []
  ruleTimer = 0
  nextRuleAt = 30
  elapsed = 0
  spawnTimer = 0
  bannerTimer = 0
  rulesBanner.textContent = '\u00a0'
  updateRulesList()
  spawnCircle()
  spawnCircle()
  state = 'playing'
  audio.start()
  updateHUD()
}

function loop(now: number): void {
  const dt = (now - lastTime) / 1000
  lastTime = now

  if (state === 'playing') {
    elapsed += dt
    ruleTimer += dt

    // Rule timer display
    const secToNext = Math.max(0, Math.ceil(nextRuleAt - ruleTimer))
    hudTimer.textContent = nextRuleIdx < ALL_RULES.length ? String(secToNext) : '\u2014'

    // Add new rule
    if (ruleTimer >= nextRuleAt && nextRuleIdx < ALL_RULES.length) {
      ruleTimer = 0
      addNextRule()
    }

    // Move circles
    const W = canvas.width; const H = canvas.height
    for (const c of circles) {
      c.x += c.vx
      c.y += c.vy
      if (c.x - c.r < 0) { c.x = c.r; c.vx *= -1 }
      if (c.x + c.r > W) { c.x = W - c.r; c.vx *= -1 }
      if (c.y - c.r < 0) { c.y = c.r; c.vy *= -1 }
      if (c.y + c.r > H) { c.y = H - c.r; c.vy *= -1 }
    }

    // Spawn circles
    spawnTimer += dt
    const spawnInterval = Math.max(0.5, 0.8 + 2 - elapsed / 60)
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0
      if (circles.length < 5) spawnCircle()
    }

    // Banner fade
    if (bannerTimer > 0) {
      bannerTimer--
      if (bannerTimer === 0) rulesBanner.textContent = '\u00a0'
    }
  }

  draw()
  requestAnimationFrame(loop)
}

function draw(): void {
  const W = canvas.width; const H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0f0f1e'
  ctx.fillRect(0, 0, W, H)

  // Half-line for right-click rule
  if (activeRuleIds.has('right_click_left_half') && state === 'playing') {
    ctx.strokeStyle = 'rgba(255,200,50,0.25)'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,200,50,0.4)'
    ctx.font = '11px Courier New'
    ctx.textAlign = 'center'
    ctx.fillText('RIGHT-CLICK', W / 4, 20)
    ctx.fillText('LEFT-CLICK', W * 3 / 4, 20)
  }

  // Draw circles
  const isOddScore = score % 2 === 1
  const isEvenSecond = Math.floor(elapsed) % 2 === 0

  for (const c of circles) {
    let fillColor: string; let strokeColor: string; let label = ''

    if (c.color === 'green') {
      if (activeRuleIds.has('odd_reversal') && isOddScore) {
        fillColor = '#aa2222'; strokeColor = '#ff4444'; label = '-1'
      } else {
        fillColor = '#22aa44'; strokeColor = '#44ff88'; label = '+1'
      }
      if (activeRuleIds.has('right_click_left_half')) {
        label += c.x < W / 2 ? ' R\u2192' : ' L\u2192'
      }
    } else if (c.color === 'red') {
      if (activeRuleIds.has('odd_reversal') && isOddScore) {
        fillColor = '#22aa44'; strokeColor = '#44ff88'; label = '+1'
      } else {
        fillColor = '#aa2222'; strokeColor = '#ff4444'; label = '-1'
      }
    } else {
      const active = isEvenSecond
      fillColor = active ? '#1155cc' : '#223355'
      strokeColor = active ? '#4488ff' : '#445566'
      label = active ? '+3' : '\u2715'
    }

    ctx.fillStyle = fillColor
    ctx.beginPath()
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 3
    ctx.stroke()

    if (label) {
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.floor(c.r * 0.5)}px Courier New`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, c.x, c.y)
      ctx.textBaseline = 'alphabetic'
    }
  }

  // Odd score tint
  if (activeRuleIds.has('odd_reversal') && state === 'playing') {
    ctx.fillStyle = isOddScore ? 'rgba(255,100,100,0.1)' : 'rgba(100,255,100,0.06)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = isOddScore ? 'rgba(255,100,100,0.8)' : 'rgba(100,255,100,0.6)'
    ctx.font = '11px Courier New'
    ctx.textAlign = 'right'
    ctx.fillText(isOddScore ? 'ODD: REVERSED' : 'EVEN: NORMAL', W - 8, H - 8)
  }

  if (state === 'start') drawStartOverlay()
  if (state === 'gameover') drawGameOverOverlay()
}

function drawStartOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(0,0,0,0.9)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ffd700'
  ctx.font = `bold ${Math.min(36, W * 0.09)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('INSTRUCTION CREEP', W / 2, H * 0.2)
  ctx.fillStyle = '#aaa'
  ctx.font = `${Math.min(15, W * 0.033)}px Courier New`
  const lines = [
    'Click the green circle. Simple.',
    'Every 30 seconds a new rule appears.',
    'Rules stack and contradict each other.',
    '3 lives. Wrong click = lose a life.',
    'Check the rule sidebar.',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.34 + i * H * 0.075))
  drawBtn('PLAY', W / 2, H * 0.82)
}

function drawGameOverOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(0,0,0,0.9)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ff6b6b'
  ctx.font = `bold ${Math.min(38, W * 0.09)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('GAME OVER', W / 2, H * 0.22)
  ctx.fillStyle = '#ccc'
  ctx.font = `${Math.min(18, W * 0.04)}px Courier New`
  ctx.fillText(`Score: ${score}`, W / 2, H * 0.38)
  ctx.fillText(`Best: ${bestScore}`, W / 2, H * 0.46)
  ctx.fillText(`Rules survived: ${activeRuleIds.size}`, W / 2, H * 0.54)
  drawBtn('PLAY AGAIN', W / 2, H * 0.72)
}

function drawBtn(label: string, cx: number, cy: number): void {
  const bw = 160; const bh = 42
  ctx.fillStyle = '#ffd700'
  ctx.beginPath()
  ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 8)
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.font = `bold ${Math.min(18, canvas.width * 0.04)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText(label, cx, cy + 6)
}

canvas.addEventListener('click', () => {
  if (state === 'start') startGame()
  else if (state === 'gameover') startGame()
})

canvas.addEventListener('touchend', (e: TouchEvent) => {
  if (state === 'start') { e.preventDefault(); startGame() }
  else if (state === 'gameover') { e.preventDefault(); startGame() }
}, { passive: false })

document.getElementById('mute-btn')!.addEventListener('click', () => {
  const m = audio.toggleMute()
  ;(document.getElementById('mute-btn') as HTMLButtonElement).textContent = m ? '\ud83d\udd07' : '\ud83d\udd0a'
})

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { bestScore: saved } = await initSDK()
    bestScore = saved
  } catch { /* standalone */ }
  requestAnimationFrame(loop)
}

void boot()
