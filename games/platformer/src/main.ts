// Platformer — main entry point: canvas rendering, input, game loop

import { PlatformerGame } from './game.js'
import type { Snapshot } from './game.js'
import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'

// ── Canvas setup ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

// Logical canvas size
const LOGICAL_W = 480
const LOGICAL_H = 320

// Scale to fill container while maintaining aspect ratio
function resizeCanvas(): void {
  const container = canvas.parentElement!
  const scale = Math.min(
    container.clientWidth / LOGICAL_W,
    container.clientHeight / LOGICAL_H,
  )
  canvas.width = LOGICAL_W
  canvas.height = LOGICAL_H
  canvas.style.width = `${Math.floor(LOGICAL_W * scale)}px`
  canvas.style.height = `${Math.floor(LOGICAL_H * scale)}px`
}

resizeCanvas()
window.addEventListener('resize', resizeCanvas)

// ── Colors ────────────────────────────────────────────────────────────────────

const COLORS = {
  bg:       '#1a1a2e',
  platform: '#16213e',
  platEdge: '#8888ff',
  player:   '#00ff88',
  playerEye:'#1a1a2e',
  coin:     '#ffd700',
  coinGlow: 'rgba(255,215,0,0.3)',
  spike:    '#ff4466',
  exit:     '#00ff88',
  exitGlow: 'rgba(0,255,136,0.25)',
  overlay:  'rgba(0,0,0,0.65)',
  text:     '#e0e0f0',
  accent:   '#8888ff',
}

// ── Renderer ──────────────────────────────────────────────────────────────────

function render(snap: Snapshot, t: number): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H)
  grad.addColorStop(0, '#0f0f22')
  grad.addColorStop(1, '#1a1a2e')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

  const cam = snap.cameraX

  if (snap.state === 'READY') {
    drawReadyScreen()
    return
  }

  if (snap.state === 'WIN') {
    drawWinScreen(snap)
    return
  }

  if (snap.state === 'DEAD') {
    drawDeadScreen(snap)
    return
  }

  // ── World drawing (camera offset) ─────────────────────────────────────────
  ctx.save()
  ctx.translate(-cam, 0)

  // Exit door
  const exit = snap.level.exit
  drawExit(exit.x, exit.y, exit.w, exit.h, t)

  // Platforms
  for (const plat of snap.level.platforms) {
    ctx.fillStyle = COLORS.platform
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h)
    // Top edge glow
    ctx.strokeStyle = COLORS.platEdge
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(plat.x, plat.y)
    ctx.lineTo(plat.x + plat.w, plat.y)
    ctx.stroke()
  }

  // Spikes
  for (const spike of snap.level.spikes) {
    drawSpike(spike.x, spike.y, spike.w, spike.h)
  }

  // Coins
  for (const coin of snap.coins) {
    if (coin.collected) continue
    const bob = Math.sin(t * 0.07 + coin.bobOffset) * 3
    drawCoin(coin.x, coin.y + bob, coin.r)
  }

  // Player
  if (!snap.player.dead) {
    drawPlayer(snap.player, t)
  }

  ctx.restore()

  // ── Level complete overlay ─────────────────────────────────────────────────
  if (snap.levelCompleteTimer > 0) {
    ctx.fillStyle = 'rgba(0,255,136,0.12)'
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
    ctx.fillStyle = '#00ff88'
    ctx.font = 'bold 28px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('LEVEL COMPLETE!', LOGICAL_W / 2, LOGICAL_H / 2)
  }

  // ── Death flash ────────────────────────────────────────────────────────────
  if (snap.player.dead && snap.deadTimer > 30) {
    const alpha = (snap.deadTimer - 30) / 20 * 0.5
    ctx.fillStyle = `rgba(255,68,102,${alpha})`
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  }
}

function drawPlatform(x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = COLORS.platform
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = COLORS.platEdge
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.stroke()
}
// Suppress unused warning — function used via alias pattern above
void drawPlatform

function drawSpike(x: number, y: number, w: number, h: number): void {
  const count = Math.max(1, Math.floor(w / 16))
  const sw = w / count
  ctx.fillStyle = COLORS.spike
  for (let i = 0; i < count; i++) {
    const sx = x + i * sw
    ctx.beginPath()
    ctx.moveTo(sx, y + h)
    ctx.lineTo(sx + sw / 2, y)
    ctx.lineTo(sx + sw, y + h)
    ctx.closePath()
    ctx.fill()
  }
}

function drawCoin(x: number, y: number, r: number): void {
  // Glow
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5)
  grad.addColorStop(0, COLORS.coinGlow)
  grad.addColorStop(1, 'transparent')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, r * 2.5, 0, Math.PI * 2)
  ctx.fill()
  // Coin body
  ctx.fillStyle = COLORS.coin
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  // Inner shine
  ctx.fillStyle = 'rgba(255,255,200,0.4)'
  ctx.beginPath()
  ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.4, 0, Math.PI * 2)
  ctx.fill()
}

function drawExit(x: number, y: number, w: number, h: number, t: number): void {
  // Animated glow
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.08)
  const grad = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, 40)
  grad.addColorStop(0, `rgba(0,255,136,${0.15 + pulse * 0.15})`)
  grad.addColorStop(1, 'transparent')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x + w / 2, y + h / 2, 40, 0, Math.PI * 2)
  ctx.fill()

  // Door frame
  ctx.strokeStyle = COLORS.exit
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, w, h)
  ctx.fillStyle = `rgba(0,255,136,${0.1 + pulse * 0.1})`
  ctx.fillRect(x, y, w, h)

  // Arrow indicator
  ctx.fillStyle = COLORS.exit
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('EXIT', x + w / 2, y + h / 2)
}

function drawPlayer(p: { x: number; y: number; facingRight: boolean; legAnim: number; onGround: boolean }, t: number): void {
  const px = p.x
  const py = p.y
  const w = 20
  const h = 20

  // Body glow
  ctx.shadowBlur = 12
  ctx.shadowColor = COLORS.player
  ctx.fillStyle = COLORS.player
  ctx.fillRect(px, py, w, h)
  ctx.shadowBlur = 0

  // Eyes
  ctx.fillStyle = COLORS.playerEye
  const eyeY = py + 5
  if (p.facingRight) {
    ctx.fillRect(px + 12, eyeY, 4, 4)
  } else {
    ctx.fillRect(px + 4, eyeY, 4, 4)
  }

  // Legs (animated when moving)
  const legSwing = Math.sin(p.legAnim * Math.PI / 6) * 3
  ctx.fillStyle = '#00cc66'
  // Left leg
  ctx.fillRect(px + 2, py + h, 5, 4 + (legSwing > 0 ? legSwing : 0))
  // Right leg
  ctx.fillRect(px + 13, py + h, 5, 4 + (legSwing < 0 ? -legSwing : 0))

  void t
}

function drawReadyScreen(): void {
  ctx.fillStyle = COLORS.overlay
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = COLORS.accent
  ctx.font = 'bold 32px "Courier New", monospace'
  ctx.fillText('PLATFORMER', LOGICAL_W / 2, LOGICAL_H / 2 - 40)

  ctx.fillStyle = COLORS.text
  ctx.font = '14px "Courier New", monospace'
  ctx.fillText('Collect coins, avoid spikes', LOGICAL_W / 2, LOGICAL_H / 2)
  ctx.fillText('Reach the green EXIT door', LOGICAL_W / 2, LOGICAL_H / 2 + 22)

  ctx.fillStyle = COLORS.player
  ctx.font = 'bold 16px "Courier New", monospace'
  ctx.fillText('TAP or SPACE to start', LOGICAL_W / 2, LOGICAL_H / 2 + 60)
}

function drawDeadScreen(snap: Snapshot): void {
  ctx.fillStyle = COLORS.overlay
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = '#ff4466'
  ctx.font = 'bold 28px "Courier New", monospace'
  ctx.fillText('GAME OVER', LOGICAL_W / 2, LOGICAL_H / 2 - 30)

  ctx.fillStyle = COLORS.text
  ctx.font = '14px "Courier New", monospace'
  ctx.fillText(`Score: ${snap.score}`, LOGICAL_W / 2, LOGICAL_H / 2 + 5)

  ctx.fillStyle = COLORS.accent
  ctx.font = '14px "Courier New", monospace'
  ctx.fillText('TAP or SPACE to restart', LOGICAL_W / 2, LOGICAL_H / 2 + 35)
}

function drawWinScreen(snap: Snapshot): void {
  ctx.fillStyle = 'rgba(0,255,136,0.1)'
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = COLORS.player
  ctx.font = 'bold 28px "Courier New", monospace'
  ctx.fillText('YOU WIN!', LOGICAL_W / 2, LOGICAL_H / 2 - 30)

  ctx.fillStyle = COLORS.coin
  ctx.font = '16px "Courier New", monospace'
  ctx.fillText(`Final Score: ${snap.score}`, LOGICAL_W / 2, LOGICAL_H / 2 + 5)

  ctx.fillStyle = COLORS.text
  ctx.font = '13px "Courier New", monospace'
  ctx.fillText('TAP or SPACE to play again', LOGICAL_W / 2, LOGICAL_H / 2 + 35)
}

// ── HUD update ────────────────────────────────────────────────────────────────

function updateHUD(snap: Snapshot): void {
  const livesEl = document.getElementById('hud-lives')
  const levelEl = document.getElementById('hud-level')
  const scoreEl = document.getElementById('hud-score')
  if (livesEl) livesEl.textContent = String(Math.max(0, snap.lives))
  if (levelEl) levelEl.textContent = String(snap.levelIndex + 1)
  if (scoreEl) scoreEl.textContent = String(snap.score)
}

// ── Input ─────────────────────────────────────────────────────────────────────

const game = new PlatformerGame()
let highScore = 0
let lastScore = 0

// Keyboard
const keys: Record<string, boolean> = {}
window.addEventListener('keydown', (e) => {
  keys[e.code] = true
  if (e.code === 'Space' || e.code === 'ArrowUp') e.preventDefault()
})
window.addEventListener('keyup', (e) => { keys[e.code] = false })

// Touch controls
function bindBtn(id: string, flag: 'inputLeft' | 'inputRight' | 'inputJump'): void {
  const btn = document.getElementById(id)
  if (!btn) return
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); game[flag] = true }, { passive: false })
  btn.addEventListener('touchend',   (e) => { e.preventDefault(); game[flag] = false }, { passive: false })
  btn.addEventListener('mousedown',  () => { game[flag] = true })
  btn.addEventListener('mouseup',    () => { game[flag] = false })
}

bindBtn('btn-left',  'inputLeft')
bindBtn('btn-right', 'inputRight')
bindBtn('btn-jump',  'inputJump')

// Action tap (start / restart)
function handleAction(): void {
  const state = game.getState()
  if (state === 'READY') {
    audio.start()
    game.start()
  } else if (state === 'DEAD' || state === 'WIN') {
    audio.start()
    game.reset()
    lastScore = 0
    game.start()
  }
}

canvas.addEventListener('click', handleAction)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') handleAction()
})

// ── Main loop ─────────────────────────────────────────────────────────────────

let prevState: string = ''

function mainLoop(): void {
  // Sync input flags from keyboard
  game.inputLeft  = keys['ArrowLeft']  || keys['KeyA']  || false
  game.inputRight = keys['ArrowRight'] || keys['KeyD']  || false
  game.inputJump  = keys['ArrowUp']    || keys['KeyW']  || keys['Space'] || false

  game.tick()

  const snap = game.getSnapshot()
  const t = game.getT()

  render(snap, t)
  updateHUD(snap)

  // Score reporting
  if (snap.score !== lastScore) {
    lastScore = snap.score
    reportScore(snap.score)
    if (snap.score > highScore) {
      highScore = snap.score
      saveHighScore(highScore)
    }
    audio.blip()
  }

  // State transitions for audio
  if (snap.state !== prevState) {
    if (snap.state === 'DEAD') { audio.death(); reportGameOver(snap.score) }
    if (snap.state === 'WIN')  { audio.levelUp(); reportGameOver(snap.score) }
    if (snap.levelCompleteTimer === 59) audio.levelUp()
    prevState = snap.state
  }

  requestAnimationFrame(mainLoop)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  const muteBtn = document.getElementById('mute-btn')!
  muteBtn.addEventListener('click', () => {
    const m = audio.toggleMute()
    muteBtn.textContent = m ? '🔇' : '🔊'
  })

  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  requestAnimationFrame(mainLoop)
}

void boot()
