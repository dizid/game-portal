// Tower Defense — main entry point

import type { Enemy, FloatText, Projectile, Tower, TowerType } from './types.js'
import { TOWER_DEFS, ENEMY_DEFS, buildWaveEnemies } from './defs.js'
import { buildPathCells, pathToPixels } from './path.js'
import { initSDK, reportScore, reportGameOver, saveHighScore } from './sdk-bridge.js'
import { audio } from './audio.js'

// ── Mute button ────────────────────────────────────────────────────────────────
const muteBtn = document.getElementById('mute-btn')!
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '🔇' : '🔊'
})

// ── Canvas & DOM refs ─────────────────────────────────────────────────────────

const canvas   = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx      = canvas.getContext('2d')!
const goldEl   = document.getElementById('gold-val')  as HTMLSpanElement
const livesEl  = document.getElementById('lives-val') as HTMLSpanElement
const waveEl   = document.getElementById('wave-val')  as HTMLSpanElement
const scoreEl  = document.getElementById('score-val') as HTMLSpanElement
const bestEl   = document.getElementById('best-val')  as HTMLSpanElement
const waveBtn  = document.getElementById('wave-btn')  as HTMLButtonElement
const statusEl = document.getElementById('status-msg') as HTMLDivElement

// ── Grid constants ────────────────────────────────────────────────────────────

const GRID_COLS = 20
const GRID_ROWS = 15

// ── Game state ────────────────────────────────────────────────────────────────

let cellSize = 32

let gold = 500
let lives = 20
let score = 0
let highScore = 0
let waveNumber = 0
let waveActive = false
let gameOver = false

let towers: Tower[] = []
let enemies: Enemy[] = []
let projectiles: Projectile[] = []
let floatTexts: FloatText[] = []

let nextId = 1
let selectedTowerType: TowerType | 'none' = 'arrow'

// Spawn queue for the current wave
let spawnQueue: Array<{ type: ReturnType<typeof buildWaveEnemies>[number]; delay: number }> = []
let spawnTimer = 0

let pathPixels: Array<{ x: number; y: number }> = []
let pathCells: Set<string> = new Set()

// ── Resize ────────────────────────────────────────────────────────────────────

function resize(): void {
  const container = canvas.parentElement!
  const availW = container.clientWidth
  const availH = container.clientHeight

  // Fit the grid while maintaining aspect
  const csByW = Math.floor(availW / GRID_COLS)
  const csByH = Math.floor(availH / GRID_ROWS)
  cellSize = Math.max(16, Math.min(csByW, csByH))

  canvas.width  = cellSize * GRID_COLS
  canvas.height = cellSize * GRID_ROWS
  canvas.style.width  = `${canvas.width}px`
  canvas.style.height = `${canvas.height}px`

  pathPixels = pathToPixels(cellSize)
  pathCells  = buildPathCells(cellSize)

  render()
}

window.addEventListener('resize', resize)

// ── Tower buttons ─────────────────────────────────────────────────────────────

document.querySelectorAll<HTMLButtonElement>('.tower-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    selectedTowerType = (btn.dataset['type'] ?? 'none') as TowerType | 'none'
  })
})

// ── Wave button ───────────────────────────────────────────────────────────────

waveBtn.addEventListener('click', () => {
  if (waveActive || gameOver) return
  startWave()
})

function startWave(): void {
  waveNumber++
  waveActive = true
  waveEl.textContent = String(waveNumber)
  waveBtn.disabled = true
  waveBtn.textContent = `Wave ${waveNumber} in progress`
  statusEl.textContent = `Wave ${waveNumber} started!`
  audio.start()

  const types = buildWaveEnemies(waveNumber)
  spawnQueue = types.map((type, i) => ({ type, delay: i * 60 })) // 1 enemy per second at 60fps
  spawnTimer = 0
}

// ── Place tower on click ──────────────────────────────────────────────────────

canvas.addEventListener('click', handleCanvasClick)
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const touch = e.touches[0]
  if (!touch) return
  handleCanvasClick({ clientX: touch.clientX, clientY: touch.clientY })
}, { passive: false })

function handleCanvasClick(evt: { clientX: number; clientY: number }): void {
  if (gameOver) return

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const canvasX = (evt.clientX - rect.left) * scaleX
  const canvasY = (evt.clientY - rect.top)  * scaleY

  const col = Math.floor(canvasX / cellSize)
  const row = Math.floor(canvasY / cellSize)

  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return

  // Erase mode
  if (selectedTowerType === 'none') {
    const idx = towers.findIndex(t => t.row === row && t.col === col)
    if (idx !== -1) {
      // Refund half the cost
      const refund = Math.floor(TOWER_DEFS[towers[idx].type].cost / 2)
      towers.splice(idx, 1)
      addGold(refund)
      statusEl.textContent = `Refunded ${refund}g`
    }
    return
  }

  // Placement checks
  const key = `${row},${col}`
  if (pathCells.has(key)) {
    statusEl.textContent = 'Cannot place on path'
    return
  }
  if (towers.some(t => t.row === row && t.col === col)) {
    statusEl.textContent = 'Cell already occupied'
    return
  }

  const def = TOWER_DEFS[selectedTowerType]
  if (gold < def.cost) {
    statusEl.textContent = `Need ${def.cost}g (have ${gold}g)`
    return
  }

  spendGold(def.cost)
  towers.push({
    id: nextId++,
    type: selectedTowerType,
    row,
    col,
    cooldown: 0,
  })
  audio.click()
  try { navigator.vibrate(10) } catch {}
  statusEl.textContent = `Placed ${def.label} tower`
}

// ── Gold helpers ──────────────────────────────────────────────────────────────

function addGold(amount: number): void {
  gold += amount
  goldEl.textContent = String(gold)
}

function spendGold(amount: number): void {
  gold = Math.max(0, gold - amount)
  goldEl.textContent = String(gold)
}

// ── Enemy spawning ────────────────────────────────────────────────────────────

function tickSpawn(dt: number): void {
  if (!waveActive || spawnQueue.length === 0) return

  spawnTimer += dt * 60 // convert to frame count equivalent

  while (spawnQueue.length > 0 && spawnTimer >= (spawnQueue[0]?.delay ?? 0)) {
    const entry = spawnQueue.shift()!
    spawnEnemy(entry.type)
  }
}

function spawnEnemy(type: Enemy['type']): void {
  const def = ENEMY_DEFS[type]
  const startPx = pathPixels[0]

  enemies.push({
    id: nextId++,
    type,
    hp: def.maxHp,
    maxHp: def.maxHp,
    speed: def.speed,
    baseSpeed: def.speed,
    slowTimer: 0,
    reward: def.reward,
    color: def.color,
    radius: def.radius * (cellSize / 32), // scale radius with cell size
    pathIndex: 0,
    t: 0,
    x: startPx?.x ?? 0,
    y: startPx?.y ?? 0,
  })
}

// ── Enemy movement ────────────────────────────────────────────────────────────

function tickEnemies(dt: number): void {
  const toRemove: number[] = []

  for (const enemy of enemies) {
    // Slow timer
    if (enemy.slowTimer > 0) {
      enemy.slowTimer -= dt * 60
      if (enemy.slowTimer <= 0) {
        enemy.slowTimer = 0
        enemy.speed = enemy.baseSpeed
      }
    }

    // Move along path
    let distToMove = enemy.speed * dt

    while (distToMove > 0 && enemy.pathIndex + 1 < pathPixels.length) {
      const from = pathPixels[enemy.pathIndex]!
      const to   = pathPixels[enemy.pathIndex + 1]!

      const segDx = to.x - from.x
      const segDy = to.y - from.y
      const segLen = Math.sqrt(segDx * segDx + segDy * segDy)
      const remaining = segLen * (1 - enemy.t)

      if (distToMove >= remaining) {
        distToMove -= remaining
        enemy.pathIndex++
        enemy.t = 0
        enemy.x = to.x
        enemy.y = to.y
      } else {
        enemy.t += distToMove / segLen
        enemy.x = from.x + segDx * enemy.t
        enemy.y = from.y + segDy * enemy.t
        distToMove = 0
      }
    }

    // Reached the end of path
    if (enemy.pathIndex + 1 >= pathPixels.length) {
      toRemove.push(enemy.id)
      lives--
      livesEl.textContent = String(lives)
      if (lives <= 0) {
        triggerGameOver()
        return
      }
    }
  }

  enemies = enemies.filter(e => !toRemove.includes(e.id))
}

// ── Tower firing ──────────────────────────────────────────────────────────────

function tickTowers(dt: number): void {
  for (const tower of towers) {
    const def = TOWER_DEFS[tower.type]
    tower.cooldown = Math.max(0, tower.cooldown - dt)

    if (tower.cooldown > 0) continue

    // Find nearest enemy in range
    const rangePx = def.range * cellSize
    const tx = tower.col * cellSize + cellSize / 2
    const ty = tower.row * cellSize + cellSize / 2

    let nearestEnemy: Enemy | null = null
    let nearestDist = Infinity

    for (const enemy of enemies) {
      const dx = enemy.x - tx
      const dy = enemy.y - ty
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= rangePx && dist < nearestDist) {
        nearestDist = dist
        nearestEnemy = enemy
      }
    }

    if (!nearestEnemy) continue

    // Fire projectile
    projectiles.push({
      id: nextId++,
      x: tx,
      y: ty,
      targetId: nearestEnemy.id,
      damage: def.damage,
      speed: 300,
      color: def.color,
      aoe: def.aoe,
      aoeRadius: cellSize * 1.2,
    })

    tower.cooldown = 1 / def.fireRate
  }
}

// ── Projectile movement ───────────────────────────────────────────────────────

function tickProjectiles(dt: number): void {
  const toRemove: number[] = []

  for (const proj of projectiles) {
    const target = enemies.find(e => e.id === proj.targetId)

    if (!target) {
      toRemove.push(proj.id)
      continue
    }

    const dx = target.x - proj.x
    const dy = target.y - proj.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < proj.speed * dt + 4) {
      // Hit!
      if (proj.aoe) {
        // Damage all enemies in AoE radius
        for (const enemy of enemies) {
          const adx = enemy.x - proj.x
          const ady = enemy.y - proj.y
          const adist = Math.sqrt(adx * adx + ady * ady)
          if (adist <= proj.aoeRadius) {
            damageEnemy(enemy, proj.damage)
          }
        }
      } else {
        damageEnemy(target, proj.damage)
        // Ice: apply slow
        const towerForProj = towers.find(t => {
          const tx = t.col * cellSize + cellSize / 2
          const ty = t.row * cellSize + cellSize / 2
          const pdx = proj.x - tx
          const pdy = proj.y - ty
          return Math.sqrt(pdx * pdx + pdy * pdy) < cellSize * 5
        })
        if (towerForProj && TOWER_DEFS[towerForProj.type].slow) {
          target.speed = target.baseSpeed * 0.4
          target.slowTimer = 90 // 1.5 seconds at 60fps
        }
      }

      toRemove.push(proj.id)
    } else {
      proj.x += (dx / dist) * proj.speed * dt
      proj.y += (dy / dist) * proj.speed * dt
    }
  }

  projectiles = projectiles.filter(p => !toRemove.includes(p.id))
  enemies = enemies.filter(e => e.hp > 0)
}

function damageEnemy(enemy: Enemy, damage: number): void {
  enemy.hp -= damage
  if (enemy.hp <= 0) {
    // Killed — grant gold and score
    addGold(enemy.reward)
    score += enemy.reward
    scoreEl.textContent = String(score)
    reportScore(score)
    audio.blip()

    floatTexts.push({
      id: nextId++,
      x: enemy.x,
      y: enemy.y - 10,
      text: `+${enemy.reward}g`,
      life: 45,
      color: '#ffd700',
    })
  }
}

// ── Float text tick ───────────────────────────────────────────────────────────

function tickFloatTexts(dt: number): void {
  for (const ft of floatTexts) {
    ft.y -= 30 * dt
    ft.life -= dt * 60
  }
  floatTexts = floatTexts.filter(ft => ft.life > 0)
}

// ── Wave completion check ─────────────────────────────────────────────────────

function checkWaveComplete(): void {
  if (!waveActive) return
  if (spawnQueue.length > 0) return
  if (enemies.length > 0) return

  waveActive = false
  waveBtn.disabled = false
  waveBtn.textContent = `Start Wave ${waveNumber + 1}`
  const bonus = waveNumber * 25
  addGold(bonus)
  audio.levelUp()
  statusEl.textContent = `Wave ${waveNumber} cleared! +${bonus}g bonus`
}

// ── Game over ─────────────────────────────────────────────────────────────────

function triggerGameOver(): void {
  gameOver = true
  waveBtn.disabled = true

  if (score > highScore) {
    highScore = score
    bestEl.textContent = String(highScore)
    saveHighScore(highScore)
  }

  audio.death()
  try { navigator.vibrate([100, 50, 100]) } catch {}
  reportGameOver(score)
  statusEl.textContent = `Game Over! Score: ${score}. Tap canvas to restart.`
  canvas.addEventListener('click', restartOnce)
  canvas.addEventListener('touchend', restartOnce)
}

function restartOnce(): void {
  canvas.removeEventListener('click', restartOnce)
  canvas.removeEventListener('touchend', restartOnce)
  restartGame()
}

function restartGame(): void {
  gold = 500
  lives = 20
  score = 0
  waveNumber = 0
  waveActive = false
  gameOver = false
  towers = []
  enemies = []
  projectiles = []
  floatTexts = []
  spawnQueue = []
  spawnTimer = 0

  goldEl.textContent = '500'
  livesEl.textContent = '20'
  waveEl.textContent = '0'
  scoreEl.textContent = '0'
  waveBtn.disabled = false
  waveBtn.textContent = 'Start Wave 1'
  statusEl.textContent = 'Place towers, then start the wave'
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Background grid
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const key = `${r},${c}`
      const isPath = pathCells.has(key)
      ctx.fillStyle = isPath ? '#4a3820' : '#1e3020'
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize)
    }
  }

  // Path directional marks (subtle arrows)
  ctx.strokeStyle = 'rgba(255,180,80,0.25)'
  ctx.lineWidth = Math.max(2, cellSize * 0.15)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (pathPixels.length > 0) {
    ctx.moveTo(pathPixels[0]!.x, pathPixels[0]!.y)
    for (let i = 1; i < pathPixels.length; i++) {
      ctx.lineTo(pathPixels[i]!.x, pathPixels[i]!.y)
    }
  }
  ctx.stroke()

  // Towers
  for (const tower of towers) {
    const def = TOWER_DEFS[tower.type]
    const tx = tower.col * cellSize
    const ty = tower.row * cellSize
    const cx = tx + cellSize / 2
    const cy = ty + cellSize / 2

    // Tower base
    ctx.fillStyle = 'rgba(40,40,40,0.8)'
    ctx.beginPath()
    ctx.roundRect(tx + 2, ty + 2, cellSize - 4, cellSize - 4, 4)
    ctx.fill()

    // Tower icon — colored circle
    ctx.beginPath()
    ctx.arc(cx, cy, cellSize * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = def.color
    ctx.fill()

    // Tower type label (first 2 chars)
    ctx.font = `bold ${Math.max(8, cellSize * 0.28)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.fillText(def.label.substring(0, 2).toUpperCase(), cx, cy)

    // Range circle when hovered — skip for perf (draw on selected)
  }

  // Enemies
  for (const enemy of enemies) {
    const r = enemy.radius

    // Shadow
    ctx.beginPath()
    ctx.arc(enemy.x, enemy.y + r * 0.2, r * 0.8, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fill()

    // Body
    ctx.beginPath()
    ctx.arc(enemy.x, enemy.y, r, 0, Math.PI * 2)
    ctx.fillStyle = enemy.slowTimer > 0 ? '#80c0ff' : enemy.color
    ctx.fill()

    // HP bar
    const hpRatio = enemy.hp / enemy.maxHp
    const barW = r * 2.2
    const barH = Math.max(3, cellSize * 0.08)
    const barX = enemy.x - barW / 2
    const barY = enemy.y - r - barH - 2

    ctx.fillStyle = '#333'
    ctx.fillRect(barX, barY, barW, barH)
    ctx.fillStyle = hpRatio > 0.5 ? '#40e040' : hpRatio > 0.25 ? '#e0a000' : '#e02020'
    ctx.fillRect(barX, barY, barW * hpRatio, barH)
  }

  // Projectiles
  for (const proj of projectiles) {
    ctx.beginPath()
    ctx.arc(proj.x, proj.y, Math.max(3, cellSize * 0.1), 0, Math.PI * 2)
    ctx.fillStyle = proj.color
    ctx.fill()
  }

  // Float texts
  for (const ft of floatTexts) {
    const alpha = ft.life / 45
    ctx.globalAlpha = alpha
    ctx.font = `bold ${Math.max(10, cellSize * 0.35)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = ft.color
    ctx.fillText(ft.text, ft.x, ft.y)
  }
  ctx.globalAlpha = 1

  // Game over overlay
  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.font = `bold ${Math.max(20, cellSize)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ff4040'
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - cellSize)
    ctx.font = `${Math.max(14, cellSize * 0.6)}px monospace`
    ctx.fillStyle = '#ffd700'
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2)
    ctx.font = `${Math.max(11, cellSize * 0.45)}px monospace`
    ctx.fillStyle = '#aaa'
    ctx.fillText('Tap to restart', canvas.width / 2, canvas.height / 2 + cellSize)
  }
}

// ── Main game loop ────────────────────────────────────────────────────────────

let lastTime = 0

function gameLoop(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1) // cap dt at 100ms
  lastTime = now

  if (!gameOver) {
    tickSpawn(dt)
    tickEnemies(dt)
    tickTowers(dt)
    tickProjectiles(dt)
    tickFloatTexts(dt)
    checkWaveComplete()
  }

  render()
  requestAnimationFrame(gameLoop)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const { highScore: savedHigh } = await initSDK()
    highScore = savedHigh
    bestEl.textContent = String(highScore)
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  resize()
  lastTime = performance.now()
  requestAnimationFrame(gameLoop)
}

void boot()
