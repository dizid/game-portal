import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const roundEl = document.getElementById('round-value') as HTMLSpanElement
const scoreEl = document.getElementById('score-value') as HTMLSpanElement
const livesEl = document.getElementById('lives-value') as HTMLSpanElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

function resizeCanvas(): void {
  const cont = canvas.parentElement!
  const sz = Math.min(cont.clientWidth, cont.clientHeight - 50)
  canvas.width = sz; canvas.height = sz
  canvas.style.width = `${sz}px`; canvas.style.height = `${sz}px`
}
resizeCanvas()
window.addEventListener('resize', resizeCanvas)
muteBtn.addEventListener('click', () => { muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊' })

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'READY' | 'PLACING' | 'RECALLING' | 'ROUND_OVER' | 'GAME_OVER'

interface Room {
  id: number
  label: string
  x: number; y: number; w: number; h: number
  color: string
}

interface PalaceObject {
  id: number
  emoji: string
  label: string
  roomId: number
  showUntil: number   // timestamp when it fades out (during PLACING phase)
  placedAt: number
}

interface State {
  phase: Phase
  round: number
  score: number
  bestScore: number
  lives: number
  rooms: Room[]
  objects: PalaceObject[]
  // PLACING phase
  currentObjectIdx: number      // which object is being shown
  showingObject: boolean
  placingWait: boolean          // waiting for user to click a room
  // RECALLING phase
  currentQuestionIdx: number    // which object we're asking about
  recallObject: PalaceObject | null
  answeredObjects: number[]     // ids already answered
  flashRoomId: number | null    // room to flash (correct/wrong feedback)
  flashCorrect: boolean
  flashTime: number
  // Transition
  roundOverTime: number
  feedbackText: string | null
  feedbackTime: number
  feedbackColor: string
}

// ── Object bank ───────────────────────────────────────────────────────────────

const OBJECT_BANK: { emoji: string; label: string }[] = [
  { emoji: '🍎', label: 'Apple' },
  { emoji: '👑', label: 'Crown' },
  { emoji: '⚔️', label: 'Sword' },
  { emoji: '🔑', label: 'Key' },
  { emoji: '🕯️', label: 'Candle' },
  { emoji: '📜', label: 'Scroll' },
  { emoji: '💎', label: 'Gem' },
  { emoji: '🏺', label: 'Vase' },
  { emoji: '🦋', label: 'Butterfly' },
  { emoji: '🌙', label: 'Moon' },
  { emoji: '⭐', label: 'Star' },
  { emoji: '🎭', label: 'Mask' },
  { emoji: '🧭', label: 'Compass' },
  { emoji: '📿', label: 'Beads' },
  { emoji: '🪄', label: 'Wand' },
  { emoji: '🗡️', label: 'Dagger' },
  { emoji: '🦅', label: 'Eagle' },
  { emoji: '🐉', label: 'Dragon' },
  { emoji: '🌺', label: 'Flower' },
  { emoji: '⚗️', label: 'Flask' },
  { emoji: '🎪', label: 'Tent' },
  { emoji: '🪞', label: 'Mirror' },
]

// ── Room layouts ──────────────────────────────────────────────────────────────

function buildRooms(W: number, count: number): Room[] {
  const labels = ['Hall', 'Library', 'Kitchen', 'Garden', 'Chamber', 'Vault', 'Tower', 'Crypt']
  const colors = ['#2a1a3a', '#1a2a3a', '#1a3a2a', '#3a2a1a', '#3a1a2a', '#2a3a1a', '#1a2a2a', '#2a1a1a']

  // Lay out rooms as a 2xN grid fitting in upper 70% of canvas
  const mapH = W * 0.7
  const mapY = 60
  const mapX = 20
  const mapW = W - 40

  const cols = count <= 4 ? 2 : count <= 6 ? 3 : 4
  const rows = Math.ceil(count / cols)
  const cellW = mapW / cols
  const cellH = mapH / rows
  const padding = 8

  const rooms: Room[] = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    rooms.push({
      id: i,
      label: labels[i % labels.length],
      x: mapX + col * cellW + padding,
      y: mapY + row * cellH + padding,
      w: cellW - padding * 2,
      h: cellH - padding * 2,
      color: colors[i % colors.length],
    })
  }
  return rooms
}

// ── Game state ────────────────────────────────────────────────────────────────

let state: State = buildInitial()

function buildInitial(): State {
  return {
    phase: 'READY', round: 1, score: 0, bestScore: 0, lives: 3,
    rooms: [], objects: [],
    currentObjectIdx: 0, showingObject: false, placingWait: false,
    currentQuestionIdx: 0, recallObject: null,
    answeredObjects: [], flashRoomId: null, flashCorrect: false, flashTime: 0,
    roundOverTime: 0, feedbackText: null, feedbackTime: 0, feedbackColor: '#ffffff',
  }
}

function startRound(round: number): void {
  const W = canvas.width
  const roomCount = Math.min(4 + Math.floor(round / 2), 8)
  const objectCount = 3 + (round - 1) * 3
  const rooms = buildRooms(W, roomCount)

  // Pick objects for this round
  const shuffled = [...OBJECT_BANK].sort(() => Math.random() - 0.5)
  const objects: PalaceObject[] = shuffled.slice(0, objectCount).map((o, i) => ({
    id: i,
    emoji: o.emoji,
    label: o.label,
    roomId: -1,
    showUntil: 0,
    placedAt: 0,
  }))

  state.rooms = rooms
  state.objects = objects
  state.currentObjectIdx = 0
  state.showingObject = false
  state.placingWait = false
  state.phase = 'PLACING'
  state.answeredObjects = []
  state.recallObject = null
  state.flashRoomId = null
  roundEl.textContent = String(round)

  // Start showing first object
  showNextObject()
}

function startGame(): void {
  audio.start()
  state = buildInitial()
  state.bestScore = state.bestScore
  scoreEl.textContent = '0'
  livesEl.textContent = '3'
  startRound(1)
}

function showNextObject(): void {
  const obj = state.objects[state.currentObjectIdx]
  state.showingObject = true
  state.placingWait = true
  obj.showUntil = performance.now() + 2000  // show for 2 sec
}

function startRecallPhase(): void {
  state.phase = 'RECALLING'
  state.currentQuestionIdx = 0
  state.answeredObjects = []
  const shuffled = [...state.objects].sort(() => Math.random() - 0.5)
  // Replace objects with shuffled order for questioning
  state.objects = shuffled
  askNextQuestion()
}

function askNextQuestion(): void {
  if (state.currentQuestionIdx >= state.objects.length) {
    // All answered, round over
    state.roundOverTime = performance.now()
    state.phase = 'ROUND_OVER'
    audio.levelUp()
    return
  }
  state.recallObject = state.objects[state.currentQuestionIdx]
}

// ── Click handling ────────────────────────────────────────────────────────────

function handleClick(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top

  if (state.phase === 'READY') { startGame(); return }
  if (state.phase === 'GAME_OVER') { startGame(); return }

  if (state.phase === 'ROUND_OVER') {
    const now = performance.now()
    if (now - state.roundOverTime < 600) return
    state.round++
    startRound(state.round)
    return
  }

  if (state.phase === 'PLACING' && state.placingWait) {
    // User must click a room to place the current object
    const room = hitTestRoom(x, y)
    if (!room) return

    const obj = state.objects[state.currentObjectIdx]
    obj.roomId = room.id
    obj.placedAt = performance.now()
    audio.blip()

    state.currentObjectIdx++
    state.showingObject = false

    if (state.currentObjectIdx >= state.objects.length) {
      // All placed, wait 500ms then go to recall
      state.placingWait = false
      setTimeout(() => startRecallPhase(), 800)
    } else {
      // Show next object after brief delay
      setTimeout(showNextObject, 300)
    }
    return
  }

  if (state.phase === 'RECALLING') {
    const room = hitTestRoom(x, y)
    if (!room || !state.recallObject) return

    const correct = room.id === state.recallObject.roomId
    state.flashRoomId = room.id
    state.flashCorrect = correct
    state.flashTime = performance.now()

    if (correct) {
      const points = 100
      state.score += points
      scoreEl.textContent = String(state.score)
      reportScore(state.score)
      audio.score()
      state.feedbackText = `+${points} Correct!`
      state.feedbackColor = '#00ff88'
      state.feedbackTime = performance.now()
    } else {
      state.lives--
      livesEl.textContent = String(state.lives)
      audio.death()
      state.feedbackText = `Wrong! It was ${state.rooms.find(r => r.id === state.recallObject!.roomId)?.label}`
      state.feedbackColor = '#ff4444'
      state.feedbackTime = performance.now()

      if (state.lives <= 0) {
        setTimeout(() => endGame(), 1200)
        return
      }
    }

    state.answeredObjects.push(state.recallObject.id)
    state.currentQuestionIdx++
    setTimeout(askNextQuestion, 700)
  }
}

function hitTestRoom(x: number, y: number): Room | null {
  for (const room of state.rooms) {
    if (x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h) return room
  }
  return null
}

canvas.addEventListener('click', e => handleClick(e.clientX, e.clientY))
canvas.addEventListener('touchend', e => {
  e.preventDefault()
  const t = e.changedTouches[0]
  handleClick(t.clientX, t.clientY)
})
window.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && (state.phase === 'READY' || state.phase === 'GAME_OVER')) startGame()
})

function endGame(): void {
  state.phase = 'GAME_OVER'
  if (state.score > state.bestScore) {
    state.bestScore = state.score
    saveBestScore(state.bestScore)
  }
  reportGameOver(state.score)
  audio.death()
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderGame(now: number): void {
  const W = canvas.width, H = canvas.height
  ctx.fillStyle = '#1a1020'
  ctx.fillRect(0, 0, W, H)

  if (state.phase === 'READY') { drawReady(W, H); return }
  if (state.phase === 'GAME_OVER') { drawGameOver(W, H); return }

  // Draw rooms
  const recallMode = state.phase === 'RECALLING' || state.phase === 'ROUND_OVER'
  const dimRooms = recallMode

  for (const room of state.rooms) {
    const isFlash = state.flashRoomId === room.id
    const flashAge = isFlash ? (now - state.flashTime) / 500 : 1

    let alpha = dimRooms ? 0.6 : 1
    let fillColor = room.color

    if (isFlash && flashAge < 1) {
      fillColor = state.flashCorrect ? '#004400' : '#440000'
      alpha = 1
    }

    ctx.globalAlpha = alpha
    ctx.fillStyle = fillColor
    ctx.beginPath(); ctx.roundRect(room.x, room.y, room.w, room.h, 6); ctx.fill()

    ctx.strokeStyle = isFlash && flashAge < 1
      ? (state.flashCorrect ? '#00ff88' : '#ff4444')
      : 'rgba(200,150,255,0.25)'
    ctx.lineWidth = isFlash && flashAge < 1 ? 2.5 : 1
    ctx.beginPath(); ctx.roundRect(room.x, room.y, room.w, room.h, 6); ctx.stroke()
    ctx.globalAlpha = 1

    // Room label
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = `bold ${Math.min(13, room.w * 0.12)}px Courier New`
    ctx.textAlign = 'center'
    ctx.fillText(room.label, room.x + room.w / 2, room.y + 18)

    // Show placed objects in recall mode (semi-transparent until questioned)
    if (recallMode) {
      const roomObjects = state.objects.filter(o => o.roomId === room.id)
      if (roomObjects.length > 0) {
        ctx.font = `${Math.min(24, room.h * 0.25)}px serif`
        ctx.textAlign = 'center'
        roomObjects.forEach((obj, i) => {
          const ox = room.x + room.w / 2
          const oy = room.y + room.h / 2 + (i - (roomObjects.length - 1) / 2) * 28
          ctx.globalAlpha = 0.2
          ctx.fillText(obj.emoji, ox, oy)
          ctx.globalAlpha = 1
        })
      }
    }
  }

  // During PLACING: show current object and instruction
  if (state.phase === 'PLACING') {
    drawPlacingPhase(W, H, now)
  }

  // During RECALLING: show current question
  if (state.phase === 'RECALLING') {
    drawRecallPhase(W, H, now)
  }

  // Round over
  if (state.phase === 'ROUND_OVER') {
    drawRoundOver(W, H)
  }

  // Feedback floating text
  if (state.feedbackText) {
    const age = (now - state.feedbackTime) / 900
    if (age < 1) {
      ctx.globalAlpha = 1 - age
      ctx.font = 'bold 18px Courier New'
      ctx.textAlign = 'center'
      ctx.fillStyle = state.feedbackColor
      ctx.fillText(state.feedbackText, W / 2, H * 0.52 - age * 30)
      ctx.globalAlpha = 1
    } else {
      state.feedbackText = null
    }
  }
}

function drawPlacingPhase(W: number, H: number, now: number): void {
  const obj = state.objects[state.currentObjectIdx]
  if (!obj) return

  const showAge = now - (obj.showUntil - 2000)
  const alpha = Math.max(0, Math.min(1, 1 - (showAge - 1600) / 400))

  // Object display panel
  const panelY = H * 0.75
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.beginPath(); ctx.roundRect(W / 2 - 110, panelY - 10, 220, 90, 10); ctx.fill()
  ctx.strokeStyle = 'rgba(200,150,255,0.4)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.font = '40px serif'
  ctx.textAlign = 'center'
  ctx.fillText(obj.emoji, W / 2, panelY + 30)

  ctx.fillStyle = '#cc88ff'
  ctx.font = 'bold 15px Courier New'
  ctx.fillText(obj.label, W / 2, panelY + 55)

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '11px Courier New'
  ctx.fillText('Click a room to place this object', W / 2, panelY + 72)
  ctx.globalAlpha = 1

  // Progress
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '11px Courier New'
  ctx.textAlign = 'center'
  ctx.fillText(`Object ${state.currentObjectIdx + 1} of ${state.objects.length}`, W / 2, H - 10)
}

function drawRecallPhase(W: number, H: number, now: number): void {
  if (!state.recallObject) return

  const panelY = H * 0.75
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.beginPath(); ctx.roundRect(W / 2 - 130, panelY - 10, 260, 90, 10); ctx.fill()
  ctx.strokeStyle = 'rgba(200,150,255,0.4)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.font = '36px serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(state.recallObject.emoji, W / 2, panelY + 28)

  ctx.fillStyle = '#cc88ff'
  ctx.font = 'bold 14px Courier New'
  ctx.fillText(`Where is the ${state.recallObject.label}?`, W / 2, panelY + 52)

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '11px Courier New'
  ctx.fillText(`Question ${state.currentQuestionIdx + 1}/${state.objects.length}`, W / 2, panelY + 70)
}

function drawRoundOver(W: number, H: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.beginPath(); ctx.roundRect(W / 2 - 150, H * 0.74, 300, 90, 10); ctx.fill()
  ctx.strokeStyle = 'rgba(200,150,255,0.4)'
  ctx.lineWidth = 1; ctx.stroke()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#cc88ff'
  ctx.font = 'bold 18px Courier New'
  ctx.fillText(`ROUND ${state.round} COMPLETE`, W / 2, H * 0.74 + 28)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '13px Courier New'
  ctx.fillText('Click for next round', W / 2, H * 0.74 + 60)
}

function drawReady(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#cc88ff'
  ctx.font = `bold ${Math.min(42, W * 0.1)}px Courier New`
  ctx.fillText('MEMORY PALACE', W / 2, H / 2 - 110)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `${Math.min(13, W * 0.03)}px Courier New`
  const lines = [
    'Phase 1: Objects appear one at a time.',
    'Click a room to place each object.',
    'They fade after 2 seconds!',
    '',
    'Phase 2: Answer "Where is the [object]?"',
    'Click the correct room.',
    '+100 per correct answer. 3 wrong = game over.',
    '',
    'Click to start',
  ]
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 50 + i * 22))
}

function drawGameOver(W: number, H: number): void {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#cc88ff'
  ctx.font = `bold ${Math.min(40, W * 0.09)}px Courier New`
  ctx.fillText('MEMORIES FADED', W / 2, H / 2 - 70)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.min(28, W * 0.065)}px Courier New`
  ctx.fillText(`Score: ${state.score}`, W / 2, H / 2 - 10)
  if (state.score === state.bestScore && state.score > 0) {
    ctx.fillStyle = '#ffd700'
    ctx.font = `${Math.min(18, W * 0.04)}px Courier New`
    ctx.fillText('NEW BEST!', W / 2, H / 2 + 26)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `${Math.min(15, W * 0.034)}px Courier New`
  ctx.fillText('Click to play again', W / 2, H / 2 + 60)
}

// ── Main loop ─────────────────────────────────────────────────────────────────

function loop(now: number): void {
  renderGame(now)
  requestAnimationFrame(loop)
}

async function boot(): Promise<void> {
  try {
    const { bestScore } = await initSDK()
    state.bestScore = bestScore
  } catch { /* standalone */ }
  requestAnimationFrame(loop)
}

void boot()
