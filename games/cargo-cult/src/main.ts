import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas setup ───────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const hudRound = document.getElementById('hud-round')!
const hudRain = document.getElementById('hud-rain')!
const hudSteps = document.getElementById('hud-steps')!

function resize(): void {
  const container = canvas.parentElement!
  const size = Math.min(container.clientWidth, container.clientHeight, 540)
  canvas.width = size
  canvas.height = size
}
resize()
window.addEventListener('resize', () => { resize(); layoutSites() })

// ── Types ──────────────────────────────────────────────────────────────────────

type Action = 'fire' | 'dance' | 'offer'
type SiteId = 0 | 1 | 2 | 3 | 4

interface Site {
  id: SiteId; x: number; y: number
  glowAlpha: number   // correct action feedback
  smokeAlpha: number  // incorrect action feedback
  label: string
}

interface RitualStep {
  site: SiteId
  action: Action
}

interface VillagerImitation {
  site: SiteId; action: Action
  x: number; y: number
  life: number; maxLife: number
}

// ── Sequence encoding ──────────────────────────────────────────────────────────

const ACTION_ICONS: Record<Action, string> = { fire: '\uD83D\uDD25', dance: '\uD83D\uDC83', offer: '\uD83C\uDF3F' }
const ACTION_NAMES: Action[] = ['fire', 'dance', 'offer']
const SITE_LABELS = ['A', 'B', 'C', 'D', 'E']

// ── Game state ─────────────────────────────────────────────────────────────────

type GameState = 'start' | 'select_site' | 'select_action' | 'result' | 'gameover'

let state: GameState = 'start'
let round = 1
let rainCount = 0
let bestScore = 0

let correctSequence: RitualStep[] = []
let playerSequence: RitualStep[] = []
let pendingSite: SiteId | null = null
let lastTime = 0
let frameCount = 0

let sites: Site[] = []
let imitations: VillagerImitation[] = []
let villagerHistory: RitualStep[] = []  // noise from previous rounds

let resultMessage = ''
let resultTimer = 0
let rainDrops: { x: number; y: number; speed: number }[] = []
let rainTimer = 0

// Action panel
let showActionPanel = false
let actionPanelSite: SiteId | null = null

// ── Site layout ────────────────────────────────────────────────────────────────

function layoutSites(): void {
  const W = canvas.width; const H = canvas.height
  const cx = W / 2; const cy = H * 0.5
  const r = Math.min(W, H) * 0.3

  const angles = [
    Math.PI * 1.5,        // top center
    Math.PI * 0.3,        // upper right
    Math.PI * 0.9,        // lower right
    Math.PI * 1.1 + 0.5,  // lower left
    Math.PI * 1.9 + 0.1,  // upper left
  ]

  for (let i = 0; i < 5; i++) {
    const sx = cx + Math.cos(angles[i]) * r
    const sy = cy + Math.sin(angles[i]) * r * 0.8
    if (sites[i]) {
      sites[i].x = sx; sites[i].y = sy
    } else {
      sites.push({ id: i as SiteId, x: sx, y: sy, glowAlpha: 0, smokeAlpha: 0, label: SITE_LABELS[i] })
    }
  }
}

// ── Sequence generation ────────────────────────────────────────────────────────

function generateSequence(): void {
  const siteOrder = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5).slice(0, 3) as SiteId[]
  const actions = ACTION_NAMES.sort(() => Math.random() - 0.5).slice(0, 3) as Action[]
  correctSequence = [
    { site: siteOrder[0], action: actions[0] },
    { site: siteOrder[1], action: actions[1] },
    { site: siteOrder[2], action: actions[2] },
  ]
}

// ── Player input ───────────────────────────────────────────────────────────────

function handleSiteClick(siteId: SiteId): void {
  if (state !== 'select_site') return
  pendingSite = siteId
  showActionPanel = true
  actionPanelSite = siteId
  state = 'select_action'
  audio.click()
}

function handleActionClick(action: Action): void {
  if (state !== 'select_action' || pendingSite === null) return
  showActionPanel = false

  const step: RitualStep = { site: pendingSite, action }
  playerSequence.push(step)

  // Check if this step is correct
  const stepIdx = playerSequence.length - 1
  const isCorrect = stepIdx < correctSequence.length &&
    correctSequence[stepIdx].site === step.site &&
    correctSequence[stepIdx].action === step.action

  const site = sites[pendingSite]
  if (isCorrect) {
    site.glowAlpha = 1
    audio.score()
  } else {
    site.smokeAlpha = 1
    audio.blip()
  }

  hudSteps.textContent = `${playerSequence.length}`

  if (playerSequence.length >= 3) {
    // Evaluate
    evaluateSequence()
  } else {
    state = 'select_site'
  }

  pendingSite = null
}

function evaluateSequence(): void {
  const correct = playerSequence.every((step, i) =>
    step.site === correctSequence[i].site && step.action === correctSequence[i].action
  )

  if (correct) {
    rainCount++
    hudRain.textContent = String(rainCount)
    resultMessage = '\u2614 It rains! The crops rejoice!'
    audio.levelUp()
    // Make it rain
    for (let i = 0; i < 40; i++) {
      rainDrops.push({
        x: Math.random() * canvas.width,
        y: -10 - Math.random() * 100,
        speed: 3 + Math.random() * 3,
      })
    }
  } else {
    resultMessage = '\u2600 No rain. The village suffers.'
    audio.death()
  }

  // Villagers imitate — add noise for next round
  // They copy player's actions but scramble the sites
  const scrambledSites = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5) as SiteId[]
  for (let i = 0; i < playerSequence.length; i++) {
    villagerHistory.push({ site: scrambledSites[i], action: playerSequence[i].action })
  }

  state = 'result'
  resultTimer = 120
}

// ── Round transition ───────────────────────────────────────────────────────────

function nextRound(): void {
  round++
  hudRound.textContent = String(round)
  playerSequence = []
  hudSteps.textContent = '0'
  generateSequence()

  // Spawn villager imitation noise
  spawnImitations()

  state = 'select_site'
}

function spawnImitations(): void {
  const W = canvas.width; const H = canvas.height
  const noiseCount = Math.min(round - 1, 6) * 2
  const history = villagerHistory.slice(-noiseCount)

  for (const step of history) {
    const site = sites[step.site]
    imitations.push({
      site: step.site,
      action: step.action,
      x: site.x + (Math.random() - 0.5) * 40,
      y: site.y + (Math.random() - 0.5) * 40,
      life: 180,
      maxLife: 180,
    })
  }
}

// ── Main loop ──────────────────────────────────────────────────────────────────

function startGame(): void {
  round = 1
  rainCount = 0
  playerSequence = []
  villagerHistory = []
  imitations = []
  rainDrops = []
  showActionPanel = false
  resultMessage = ''
  resultTimer = 0
  hudRound.textContent = '1'
  hudRain.textContent = '0'
  hudSteps.textContent = '0'
  layoutSites()
  generateSequence()
  state = 'select_site'
  audio.start()
}

function loop(now: number): void {
  const dt = (now - lastTime) / 1000
  lastTime = now
  frameCount++

  // Decay site effects
  for (const site of sites) {
    site.glowAlpha = Math.max(0, site.glowAlpha - 0.02)
    site.smokeAlpha = Math.max(0, site.smokeAlpha - 0.02)
  }

  // Age imitations
  for (let i = imitations.length - 1; i >= 0; i--) {
    imitations[i].life--
    if (imitations[i].life <= 0) imitations.splice(i, 1)
  }

  // Rain animation
  if (rainDrops.length > 0) {
    rainTimer += dt
    for (const drop of rainDrops) {
      drop.y += drop.speed
    }
    // Remove drops that fell off screen
    for (let i = rainDrops.length - 1; i >= 0; i--) {
      if (rainDrops[i].y > canvas.height + 20) rainDrops.splice(i, 1)
    }
  }

  // Result timer
  if (state === 'result') {
    resultTimer--
    if (resultTimer <= 0) {
      if (round >= 10) {
        state = 'gameover'
        const finalScore = rainCount * 100
        if (finalScore > bestScore) {
          bestScore = finalScore
          saveBestScore(bestScore)
        }
        reportGameOver(finalScore)
      } else {
        nextRound()
      }
      reportScore(rainCount * 100)
    }
  }

  draw()
  requestAnimationFrame(loop)
}

// ── Drawing ────────────────────────────────────────────────────────────────────

function draw(): void {
  const W = canvas.width; const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  // Sky gradient — darkens without rain
  const skyDark = Math.max(0.05, 0.2 - rainCount * 0.01)
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, `rgb(${Math.floor(30 * skyDark * 5)},${Math.floor(20 * skyDark * 5)},0)`)
  grad.addColorStop(1, `rgb(${Math.floor(15 * skyDark * 5)},${Math.floor(10 * skyDark * 5)},0)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Ground
  ctx.fillStyle = '#3d2a00'
  ctx.fillRect(0, H * 0.75, W, H * 0.25)
  // Ground texture
  ctx.fillStyle = '#4a3300'
  for (let i = 0; i < W; i += 18) {
    ctx.fillRect(i, H * 0.75, 2, H * 0.05)
  }

  // Stars/moon when dry
  if (rainCount < 5) {
    ctx.fillStyle = 'rgba(255,240,200,0.6)'
    for (let i = 0; i < 30; i++) {
      const sx = ((i * 97 + 13) % W)
      const sy = ((i * 53 + 7) % (H * 0.65))
      ctx.beginPath()
      ctx.arc(sx, sy, 1, 0, Math.PI * 2)
      ctx.fill()
    }
    // Moon
    ctx.fillStyle = 'rgba(255,240,180,0.5)'
    ctx.beginPath()
    ctx.arc(W * 0.8, H * 0.12, 18, 0, Math.PI * 2)
    ctx.fill()
  }

  // Rain
  if (rainDrops.length > 0) {
    ctx.strokeStyle = 'rgba(100,180,255,0.6)'
    ctx.lineWidth = 1
    for (const drop of rainDrops) {
      ctx.beginPath()
      ctx.moveTo(drop.x, drop.y)
      ctx.lineTo(drop.x - 2, drop.y + 12)
      ctx.stroke()
    }
    // Rain tint
    ctx.fillStyle = 'rgba(100,150,255,0.05)'
    ctx.fillRect(0, 0, W, H)
  }

  // Draw ritual sites
  for (const site of sites) {
    drawSite(site)
  }

  // Draw villager imitation noise
  for (const im of imitations) {
    const alpha = im.life / im.maxLife
    const site = sites[im.site]
    ctx.save()
    ctx.globalAlpha = alpha * 0.5
    ctx.fillStyle = '#ff8800'
    ctx.font = `${Math.min(16, W * 0.034)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(ACTION_ICONS[im.action], im.x, im.y)
    ctx.restore()
  }

  // Player sequence display
  if ((state === 'select_site' || state === 'select_action') && state !== 'result') {
    const seqY = H * 0.12
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.beginPath()
    ctx.roundRect(W * 0.1, seqY - 20, W * 0.8, 36, 8)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.font = `${Math.min(14, W * 0.03)}px Courier New`
    ctx.fillStyle = '#e0c080'
    if (playerSequence.length === 0) {
      ctx.fillText('Select a ritual site to begin...', W / 2, seqY + 2)
    } else {
      const seqStr = playerSequence.map(s => `${SITE_LABELS[s.site]}:${ACTION_ICONS[s.action]}`).join('  \u2192  ')
      ctx.fillText(seqStr, W / 2, seqY + 2)
    }
  }

  // Action panel
  if (showActionPanel && actionPanelSite !== null) {
    const site = sites[actionPanelSite]
    const panelW = Math.min(240, W * 0.55); const panelH = 56
    const panelX = Math.max(10, Math.min(W - panelW - 10, site.x - panelW / 2))
    const panelY = site.y < H / 2 ? site.y + 34 : site.y - 34 - panelH

    ctx.fillStyle = 'rgba(0,0,0,0.85)'
    ctx.strokeStyle = '#c8a050'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(panelX, panelY, panelW, panelH, 8)
    ctx.fill()
    ctx.stroke()

    // Action buttons
    const btnW = panelW / 3 - 4
    ACTION_NAMES.forEach((action, i) => {
      const bx = panelX + 2 + i * (btnW + 2)
      const by = panelY + 4
      ctx.fillStyle = 'rgba(200,160,50,0.2)'
      ctx.beginPath()
      ctx.roundRect(bx, by, btnW, panelH - 8, 6)
      ctx.fill()
      ctx.fillStyle = '#e0c080'
      ctx.font = `${Math.min(20, W * 0.043)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(ACTION_ICONS[action], bx + btnW / 2, by + 24)
      ctx.font = `${Math.min(9, W * 0.019)}px Courier New`
      ctx.fillText(action, bx + btnW / 2, by + 40)
    })
  }

  // Result message
  if (state === 'result' && resultMessage) {
    const alpha = Math.min(1, resultTimer / 30)
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.7})`
    ctx.beginPath()
    ctx.roundRect(W * 0.1, H * 0.43, W * 0.8, 50, 10)
    ctx.fill()
    ctx.fillStyle = rainCount > 0 && resultMessage.includes('rains')
      ? `rgba(100,200,255,${alpha})`
      : `rgba(255,160,50,${alpha})`
    ctx.font = `bold ${Math.min(18, W * 0.038)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText(resultMessage, W / 2, H * 0.475)

    // Show correct sequence as hint
    ctx.fillStyle = `rgba(200,200,100,${alpha * 0.7})`
    ctx.font = `${Math.min(12, W * 0.025)}px Courier New`
    const hint = correctSequence.map(s => `${SITE_LABELS[s.site]}:${ACTION_ICONS[s.action]}`).join(' \u2192 ')
    ctx.fillText(`Correct: ${hint}`, W / 2, H * 0.52)
  }

  // Instruction
  if (state === 'select_site') {
    ctx.fillStyle = 'rgba(200,160,50,0.6)'
    ctx.font = `${Math.min(12, W * 0.025)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText('Click a site to perform a ritual', W / 2, H * 0.88)
  }

  if (state === 'start') drawStartOverlay()
  if (state === 'gameover') drawGameOverOverlay()
}

function drawSite(site: Site): void {
  const W = canvas.width
  const r = Math.min(28, W * 0.055)

  // Smoke effect
  if (site.smokeAlpha > 0) {
    ctx.fillStyle = `rgba(100,100,100,${site.smokeAlpha * 0.4})`
    ctx.beginPath()
    ctx.arc(site.x, site.y - 20, r * 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Glow effect
  if (site.glowAlpha > 0) {
    ctx.fillStyle = `rgba(255,200,50,${site.glowAlpha * 0.3})`
    ctx.beginPath()
    ctx.arc(site.x, site.y, r * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Ground circle
  ctx.strokeStyle = site.glowAlpha > 0.1 ? `rgba(255,200,50,${0.5 + site.glowAlpha * 0.5})` : 'rgba(180,130,40,0.5)'
  ctx.lineWidth = 2
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.arc(site.x, site.y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  // Totem/marker
  ctx.fillStyle = '#6b4c1a'
  ctx.fillRect(site.x - 4, site.y - r * 0.8, 8, r * 0.8)

  // Label
  ctx.fillStyle = '#e0c080'
  ctx.font = `bold ${Math.min(18, W * 0.038)}px Courier New`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(site.label, site.x, site.y + r * 0.3)
  ctx.textBaseline = 'alphabetic'
}

function drawStartOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(0,0,0,0.9)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#e0c080'
  ctx.font = `bold ${Math.min(42, W * 0.09)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('CARGO CULT', W / 2, H * 0.2)
  ctx.fillStyle = '#aaa'
  ctx.font = `${Math.min(14, W * 0.03)}px Courier New`
  const lines = [
    'Perform the secret 3-step ritual',
    'to make it rain for the crops.',
    '',
    'Click a site, then choose an action.',
    'Correct steps glow \u2728 . Wrong steps smoke.',
    'But villagers copy your moves as noise!',
    'The sequence changes each round.',
    '',
    '10 rounds. Max score = 10 rains.',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.28 + i * H * 0.063))
  drawBtn('PLAY', W / 2, H * 0.86)
}

function drawGameOverOverlay(): void {
  const W = canvas.width; const H = canvas.height
  ctx.fillStyle = 'rgba(0,0,0,0.9)'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#e0c080'
  ctx.font = `bold ${Math.min(40, W * 0.09)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText('HARVEST COMPLETE', W / 2, H * 0.2)
  ctx.fillStyle = '#ccc'
  ctx.font = `${Math.min(18, W * 0.038)}px Courier New`
  ctx.fillText(`Rains: ${rainCount}/10`, W / 2, H * 0.35)
  ctx.fillText(`Score: ${rainCount * 100}`, W / 2, H * 0.43)
  ctx.fillText(`Best: ${bestScore}`, W / 2, H * 0.51)
  drawBtn('PLAY AGAIN', W / 2, H * 0.72)
}

function drawBtn(label: string, cx: number, cy: number): void {
  const bw = 160; const bh = 44
  ctx.fillStyle = '#8b6914'
  ctx.beginPath()
  ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 8)
  ctx.fill()
  ctx.fillStyle = '#e0c080'
  ctx.font = `bold ${Math.min(20, canvas.width * 0.043)}px Courier New`
  ctx.textAlign = 'center'
  ctx.fillText(label, cx, cy + 7)
}

// ── Input ──────────────────────────────────────────────────────────────────────

function handleClick(px: number, py: number): void {
  if (state === 'start') { startGame(); return }
  if (state === 'gameover') { startGame(); return }

  if (state === 'select_site') {
    const r = Math.min(32, canvas.width * 0.065)
    for (const site of sites) {
      const dx = px - site.x; const dy = py - site.y
      if (dx * dx + dy * dy < r * r) {
        handleSiteClick(site.id)
        return
      }
    }
  }

  if (state === 'select_action' && actionPanelSite !== null) {
    const site = sites[actionPanelSite]
    const panelW = Math.min(240, canvas.width * 0.55)
    const panelH = 56
    const panelX = Math.max(10, Math.min(canvas.width - panelW - 10, site.x - panelW / 2))
    const panelY = site.y < canvas.height / 2 ? site.y + 34 : site.y - 34 - panelH
    const btnW = panelW / 3 - 4

    ACTION_NAMES.forEach((action, i) => {
      const bx = panelX + 2 + i * (btnW + 2)
      const by = panelY + 4
      if (px >= bx && px <= bx + btnW && py >= by && py <= by + panelH - 8) {
        handleActionClick(action)
      }
    })
  }
}

canvas.addEventListener('click', (e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect()
  handleClick(
    (e.clientX - rect.left) * (canvas.width / rect.width),
    (e.clientY - rect.top) * (canvas.height / rect.height),
  )
})

canvas.addEventListener('touchend', (e: TouchEvent) => {
  e.preventDefault()
  const touch = e.changedTouches[0]
  const rect = canvas.getBoundingClientRect()
  handleClick(
    (touch.clientX - rect.left) * (canvas.width / rect.width),
    (touch.clientY - rect.top) * (canvas.height / rect.height),
  )
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
  layoutSites()
  requestAnimationFrame(loop)
}

void boot()
