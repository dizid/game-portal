import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas setup ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function resize(): void {
  const container = canvas.parentElement!
  const size = Math.min(container.clientWidth, container.clientHeight, 560)
  canvas.width = size
  canvas.height = size
}
resize()
window.addEventListener('resize', () => { resize(); draw() })

// ── Types ──────────────────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number
  vx: number; vy: number
  r: number; life: number; maxLife: number
  hue: number
}

interface Achievement {
  text: string
  displayUntil: number
  x: number; y: number
}

// ── Game state ─────────────────────────────────────────────────────────────────

type GameState = 'start' | 'playing' | 'gameover'

let state: GameState = 'start'
let realScore = 1000
let displayScore = 1000
let startTime = 0
let elapsed = 0
let bestScore = 0
let lastTime = 0
let frameCount = 0

// Progress bar
let barProgress = 0  // 0..1, fills over time
let barAcceleration = 0.0004

// Achievements queue
const achievements: Achievement[] = []
const ACHIEVEMENT_MESSAGES = [
  'First minute survived! +0 pts',
  'Dedication award! +0 pts',
  'Persistence unlocked! +0 pts',
  'Power user status! +0 pts',
  'Legendary patience! +0 pts',
  'Time waster champion! +0 pts',
  'Sunk cost master! +0 pts',
]
let nextAchievementAt = 60

// Particles
const particles: Particle[] = []
let particleTimer = 0

// Fake "bonus" numbers floating up
interface FloatNumber {
  x: number; y: number; text: string; life: number; maxLife: number
}
const floatNumbers: FloatNumber[] = []
let floatTimer = 0

// Score drain
let drainTimer = 0
const DRAIN_INTERVAL = 5  // seconds
const DRAIN_AMOUNT = 10

// Fake progress percentage (just for show)
let fakeProgressPct = 0

// Cash out button position (tiny, easy to miss)
let cashOutX = 0
let cashOutY = 0
let cashOutPulse = 0

// Level/rank system (fake)
const RANKS = ['Newcomer', 'Beginner', 'Learner', 'Achiever', 'Expert', 'Master', 'Legend', 'ULTRA']
let rankIndex = 0
let nextRankAt = 30

// Color palette cycling
let colorCycle = 0

// ── Particle system ────────────────────────────────────────────────────────────

function spawnParticles(x: number, y: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 1 + Math.random() * 3
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      r: 3 + Math.random() * 4,
      life: 60 + Math.random() * 40,
      maxLife: 100,
      hue: Math.floor(Math.random() * 360),
    })
  }
}

function updateParticles(): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx; p.y += p.vy
    p.vy += 0.1
    p.life--
    if (p.life <= 0) particles.splice(i, 1)
  }
}

// ── Game logic ─────────────────────────────────────────────────────────────────

function startGame(): void {
  realScore = 1000
  displayScore = 1000
  startTime = performance.now()
  elapsed = 0
  barProgress = 0
  nextAchievementAt = 60
  rankIndex = 0
  nextRankAt = 30
  drainTimer = 0
  floatTimer = 0
  particleTimer = 0
  colorCycle = 0
  fakeProgressPct = 0
  cashOutPulse = 0
  achievements.length = 0
  particles.length = 0
  floatNumbers.length = 0
  state = 'playing'
  audio.start()
  positionCashOut()
}

function positionCashOut(): void {
  const W = canvas.width; const H = canvas.height
  // Tiny, placed in corner, slightly different each time
  cashOutX = W * 0.04 + Math.random() * W * 0.06
  cashOutY = H * 0.88 + Math.random() * H * 0.06
}

function cashOut(): void {
  if (state !== 'playing') return
  state = 'gameover'
  if (realScore > bestScore) {
    bestScore = realScore
    saveBestScore(bestScore)
  }
  audio.levelUp()
  reportGameOver(realScore)
}

function addAchievement(text: string): void {
  const W = canvas.width; const H = canvas.height
  achievements.push({
    text,
    displayUntil: performance.now() + 3000,
    x: W / 2,
    y: H * 0.3,
  })
  spawnParticles(W / 2, H / 2, 20)
  audio.combo()
}

function addFloatNumber(): void {
  const W = canvas.width; const H = canvas.height
  const fakes = ['+250', '+500', '+1000', 'BONUS!', '+LEVEL', 'CRITICAL!', 'AMAZING!']
  floatNumbers.push({
    x: W * 0.3 + Math.random() * W * 0.4,
    y: H * 0.5 + Math.random() * H * 0.2,
    text: fakes[Math.floor(Math.random() * fakes.length)],
    life: 90,
    maxLife: 90,
  })
}

// ── Main loop ──────────────────────────────────────────────────────────────────

function loop(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000)
  lastTime = now
  frameCount++

  if (state === 'playing') {
    elapsed = (now - startTime) / 1000

    // Drain score
    drainTimer += dt
    if (drainTimer >= DRAIN_INTERVAL) {
      drainTimer = 0
      realScore = Math.max(0, realScore - DRAIN_AMOUNT)
      audio.death()
    }

    // Corrupt display score (show fake big number)
    const fakeMultiplier = 1 + Math.sin(elapsed * 0.3) * 0.1 + Math.floor(elapsed / 30) * 0.05
    displayScore = Math.floor(realScore * fakeMultiplier * (1 + Math.random() * 0.02))

    // Progress bar accelerates, loops
    barProgress += (barAcceleration + elapsed * 0.00002) * dt * 60
    if (barProgress >= 1) {
      barProgress = 0
      fakeProgressPct = Math.min(99, fakeProgressPct + Math.floor(5 + Math.random() * 15))
      spawnParticles(canvas.width / 2, canvas.height * 0.4, 12)
      audio.blip()
    }

    // Achievements
    if (elapsed >= nextAchievementAt && achievements.length < ACHIEVEMENT_MESSAGES.length) {
      const msg = ACHIEVEMENT_MESSAGES[Math.min(Math.floor(elapsed / 60), ACHIEVEMENT_MESSAGES.length - 1)]
      addAchievement(msg)
      nextAchievementAt += 60
    }

    // Rank ups
    if (elapsed >= nextRankAt && rankIndex < RANKS.length - 1) {
      rankIndex++
      nextRankAt += 30
      addAchievement(`RANK UP: ${RANKS[rankIndex]}!`)
    }

    // Float numbers
    floatTimer += dt
    if (floatTimer > 1.2 - Math.min(1, elapsed / 120)) {
      floatTimer = 0
      addFloatNumber()
    }

    // Particles
    particleTimer += dt
    if (particleTimer > 0.4) {
      particleTimer = 0
      const W = canvas.width; const H = canvas.height
      spawnParticles(Math.random() * W, Math.random() * H * 0.8, 4)
    }

    updateParticles()

    // Float numbers age
    for (let i = floatNumbers.length - 1; i >= 0; i--) {
      floatNumbers[i].life--
      floatNumbers[i].y -= 0.5
      if (floatNumbers[i].life <= 0) floatNumbers.splice(i, 1)
    }

    // Cash out pulse
    cashOutPulse += dt * 2
    colorCycle += dt * 60

    // If score hits 0
    if (realScore <= 0) {
      realScore = 0
      state = 'gameover'
      reportGameOver(0)
      audio.death()
    }

    reportScore(realScore)
  }

  draw()
  requestAnimationFrame(loop)
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function draw(): void {
  const W = canvas.width; const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  // Animated background
  const bgHue = (colorCycle * 0.5) % 360
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, `hsl(${bgHue}, 60%, 10%)`)
  grad.addColorStop(0.5, `hsl(${(bgHue + 120) % 360}, 50%, 8%)`)
  grad.addColorStop(1, `hsl(${(bgHue + 240) % 360}, 60%, 12%)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  if (state === 'playing') {
    // Fake score display (huge, flashy)
    ctx.save()
    ctx.shadowColor = `hsl(${(colorCycle * 2) % 360}, 100%, 60%)`
    ctx.shadowBlur = 20
    ctx.fillStyle = `hsl(${(colorCycle * 2) % 360}, 90%, 75%)`
    ctx.font = `bold ${Math.min(72, W * 0.16)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText(displayScore.toLocaleString(), W / 2, H * 0.22)
    ctx.restore()

    // Real score (tiny, grey)
    ctx.fillStyle = 'rgba(150,150,150,0.6)'
    ctx.font = `${Math.min(11, W * 0.023)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText(`(real: ${realScore})`, W / 2, H * 0.29)

    // Progress bar area
    const barW = W * 0.8; const barH = 28
    const barX = W * 0.1; const barY = H * 0.35
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.beginPath()
    ctx.roundRect(barX, barY, barW, barH, barH / 2)
    ctx.fill()
    // Fill (gradient)
    const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0)
    fillGrad.addColorStop(0, `hsl(${(colorCycle * 3) % 360}, 90%, 55%)`)
    fillGrad.addColorStop(0.5, `hsl(${(colorCycle * 3 + 120) % 360}, 90%, 65%)`)
    fillGrad.addColorStop(1, `hsl(${(colorCycle * 3 + 240) % 360}, 90%, 55%)`)
    ctx.fillStyle = fillGrad
    ctx.beginPath()
    ctx.roundRect(barX, barY, barW * barProgress + 4, barH, barH / 2)
    ctx.fill()
    // Bar shimmer
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.beginPath()
    ctx.roundRect(barX, barY, barW * barProgress, barH / 2, barH / 2)
    ctx.fill()
    // Label
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.min(13, W * 0.027)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText(`LOADING AWESOMENESS... ${fakeProgressPct}%`, W / 2, barY + barH / 2 + 5)

    // Rank badge
    const rankColor = `hsl(${(colorCycle + 60) % 360}, 80%, 60%)`
    ctx.fillStyle = rankColor
    ctx.font = `bold ${Math.min(22, W * 0.047)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText(`${RANKS[rankIndex]}`, W / 2, H * 0.5)

    // Fake stat boxes
    const stats = [
      { label: 'MULTIPLIER', val: `x${(1 + elapsed * 0.01).toFixed(2)}` },
      { label: 'STREAK', val: Math.floor(elapsed / 5).toString() },
      { label: 'TIME', val: `${Math.floor(elapsed)}s` },
    ]
    stats.forEach((s, i) => {
      const bx = W * 0.1 + (W * 0.8 / stats.length) * i
      const by = H * 0.56
      const bw = W * 0.8 / stats.length - 8; const bh = 44
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.roundRect(bx, by, bw, bh, 6)
      ctx.fill()
      ctx.fillStyle = `hsl(${(colorCycle * 2 + i * 120) % 360}, 70%, 70%)`
      ctx.font = `bold ${Math.min(16, W * 0.034)}px Courier New`
      ctx.textAlign = 'center'
      ctx.fillText(s.val, bx + bw / 2, by + 20)
      ctx.fillStyle = 'rgba(200,200,200,0.6)'
      ctx.font = `${Math.min(10, W * 0.021)}px Courier New`
      ctx.fillText(s.label, bx + bw / 2, by + 36)
    })

    // Particles
    for (const p of particles) {
      const alpha = p.life / p.maxLife
      ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${alpha})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2)
      ctx.fill()
    }

    // Float numbers
    for (const fn of floatNumbers) {
      const alpha = fn.life / fn.maxLife
      ctx.fillStyle = `rgba(255,220,50,${alpha})`
      ctx.font = `bold ${Math.min(20, W * 0.043)}px Courier New`
      ctx.textAlign = 'center'
      ctx.shadowColor = 'rgba(255,200,0,0.8)'
      ctx.shadowBlur = 8
      ctx.fillText(fn.text, fn.x, fn.y)
      ctx.shadowBlur = 0
    }

    // Achievements
    const now = performance.now()
    achievements.filter(a => a.displayUntil > now).forEach(a => {
      const remaining = (a.displayUntil - now) / 3000
      ctx.fillStyle = `rgba(0,0,0,${remaining * 0.7})`
      ctx.beginPath()
      ctx.roundRect(W / 2 - 180, a.y - 20, 360, 36, 8)
      ctx.fill()
      ctx.fillStyle = `rgba(255,215,0,${remaining})`
      ctx.font = `bold ${Math.min(15, W * 0.032)}px Courier New`
      ctx.textAlign = 'center'
      ctx.fillText(a.text, W / 2, a.y + 3)
    })

    // Score drain warning
    const timeUntilDrain = DRAIN_INTERVAL - drainTimer
    if (timeUntilDrain < 2) {
      ctx.fillStyle = `rgba(255,50,50,${0.3 + Math.sin(now * 0.02) * 0.2})`
      ctx.fillRect(0, 0, W, H)
    }

    // Tiny "Cash Out" button — the secret optimal move
    const co = cashOutX; const coy = cashOutY
    const coAlpha = 0.2 + Math.sin(cashOutPulse) * 0.1  // barely visible
    ctx.fillStyle = `rgba(100,200,100,${coAlpha})`
    ctx.beginPath()
    ctx.roundRect(co - 28, coy - 10, 56, 20, 4)
    ctx.fill()
    ctx.fillStyle = `rgba(150,255,150,${coAlpha})`
    ctx.font = `${Math.min(9, W * 0.019)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText('cash out', co, coy + 4)

    // Score drain info (small)
    ctx.fillStyle = 'rgba(255,80,80,0.5)'
    ctx.font = `${Math.min(11, W * 0.023)}px Courier New`
    ctx.textAlign = 'right'
    ctx.fillText(`-${DRAIN_AMOUNT}pts in ${Math.ceil(timeUntilDrain)}s`, W - 10, H - 8)
  }

  if (state === 'start') drawStartOverlay()
  if (state === 'gameover') drawGameOverOverlay()
}

function drawStartOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(10,0,20,0.93)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ff69b4'
  ctx.font = `bold ${Math.min(44, W * 0.1)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('SUNK COST', W / 2, H * 0.2)
  ctx.fillStyle = '#ccc'
  ctx.font = `${Math.min(15, W * 0.032)}px Courier New`
  const lines = [
    'You start with 1000 points.',
    'Score drains -10 every 5 seconds.',
    'Flashy things happen. Achievements pop.',
    'Nothing you earn matters.',
    '',
    'There is a "Cash Out" button.',
    'Find it. Press it immediately.',
    'Optimal: 1000 pts. Can you do it?',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.3 + i * H * 0.065))
  drawBtn('PLAY', W / 2, H * 0.84)
}

function drawGameOverOverlay(): void {
  const W = canvas.width; const H = canvas.height
  const elapsed2 = (performance.now() - startTime) / 1000
  const timeLost = Math.floor(elapsed2)
  const optimal = 1000

  ctx.fillStyle = 'rgba(10,0,20,0.93)'
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = realScore === 1000 ? '#ffd700' : '#aaa'
  ctx.font = `bold ${Math.min(38, W * 0.085)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText(realScore === 1000 ? 'PERFECT EXIT!' : 'CASHED OUT', W / 2, H * 0.18)

  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.min(22, W * 0.047)}px Courier New`
  ctx.fillText(`Your score: ${realScore}`, W / 2, H * 0.3)

  ctx.fillStyle = 'rgba(200,200,200,0.8)'
  ctx.font = `${Math.min(15, W * 0.032)}px Courier New`
  ctx.fillText(`Optimal: ${optimal} pts`, W / 2, H * 0.38)
  ctx.fillText(`Time wasted: ${timeLost}s`, W / 2, H * 0.45)
  ctx.fillText(`Points lost to time: ${optimal - realScore}`, W / 2, H * 0.52)

  // Sunk cost explanation
  ctx.fillStyle = 'rgba(255,200,100,0.8)'
  ctx.font = `${Math.min(12, W * 0.025)}px Courier New`
  const explanation = [
    '"Sunk cost fallacy: continuing because',
    'you have already invested, even when',
    'stopping is the rational choice."',
  ]
  explanation.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.62 + i * H * 0.055))

  if (realScore > bestScore) {
    bestScore = realScore
  }
  ctx.fillStyle = 'rgba(150,150,150,0.6)'
  ctx.font = `${Math.min(13, W * 0.027)}px Courier New`
  ctx.fillText(`Best: ${bestScore}`, W / 2, H * 0.78)

  drawBtn('PLAY AGAIN', W / 2, H * 0.88)
}

function drawBtn(label: string, cx: number, cy: number): void {
  const bw = 160; const bh = 44
  ctx.fillStyle = '#9933ff'
  ctx.beginPath()
  ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 8)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.min(20, canvas.width * 0.043)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText(label, cx, cy + 7)
}

// ── Input ──────────────────────────────────────────────────────────────────────

function handleClick(px: number, py: number): void {
  if (state === 'start') { startGame(); return }
  if (state === 'gameover') { startGame(); return }

  if (state === 'playing') {
    // Check cash out
    if (Math.abs(px - cashOutX) < 30 && Math.abs(py - cashOutY) < 12) {
      cashOut()
    }
  }
}

canvas.addEventListener('click', (e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect()
  const px = (e.clientX - rect.left) * (canvas.width / rect.width)
  const py = (e.clientY - rect.top) * (canvas.height / rect.height)
  handleClick(px, py)
})

canvas.addEventListener('touchend', (e: TouchEvent) => {
  e.preventDefault()
  const touch = e.changedTouches[0]
  const rect = canvas.getBoundingClientRect()
  const px = (touch.clientX - rect.left) * (canvas.width / rect.width)
  const py = (touch.clientY - rect.top) * (canvas.height / rect.height)
  handleClick(px, py)
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
