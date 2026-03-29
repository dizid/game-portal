import { audio } from './audio.js'
import { initSDK, reportScore, reportGameOver, saveBestScore } from './sdk-bridge.js'

// ── Types ──────────────────────────────────────────────────────────────────────
type FilterMode = 'normal' | 'red' | 'green' | 'blue' | 'bit0' | 'bit1' | 'bit01' | 'invert' | 'threshold'

interface LevelConfig {
  word: string
  hint: string
  channel: 'red' | 'green' | 'blue'
  bitDepth: 1 | 2  // LSB or 2 LSBs
  landscape: 'mountains' | 'desert' | 'ocean' | 'forest' | 'city'
}

// ── Constants ──────────────────────────────────────────────────────────────────
const IMG_W = 200
const IMG_H = 150

const LEVELS: LevelConfig[] = [
  { word: 'WOLF',    hint: 'Hidden in red LSB',   channel: 'red',   bitDepth: 1, landscape: 'mountains' },
  { word: 'ECHO',    hint: 'Hidden in blue LSB',  channel: 'blue',  bitDepth: 1, landscape: 'ocean' },
  { word: 'GHOST',   hint: 'Hidden in green LSB', channel: 'green', bitDepth: 1, landscape: 'forest' },
  { word: 'CIPHER',  hint: 'In red, bits 0-1',   channel: 'red',   bitDepth: 2, landscape: 'desert' },
  { word: 'RAVEN',   hint: 'In blue, bits 0-1',  channel: 'blue',  bitDepth: 2, landscape: 'city' },
  { word: 'SIGNAL',  hint: 'Find it in green',    channel: 'green', bitDepth: 2, landscape: 'mountains' },
  { word: 'MATRIX',  hint: 'Red channel holds it',channel: 'red',   bitDepth: 2, landscape: 'ocean' },
  { word: 'PHANTOM', hint: 'Blue bits hide truth',channel: 'blue',  bitDepth: 2, landscape: 'forest' },
]

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

// Source canvas holds the procedural landscape
const srcCanvas = document.createElement('canvas')
srcCanvas.width = IMG_W
srcCanvas.height = IMG_H
const srcCtx = srcCanvas.getContext('2d')!

// ── State ──────────────────────────────────────────────────────────────────────
let level = 1
let filterMode: FilterMode = 'normal'
let contrastValue = 100
let startTime = 0
let totalScore = 0
let bestScore = 0
let levelTime = 0
let rawPixels: ImageData | null = null

// ── Landscape generation ───────────────────────────────────────────────────────
function generateLandscape(type: LevelConfig['landscape'], seed: number): void {
  const rng = makeRng(seed)
  const W = IMG_W, H = IMG_H
  const sCtx = srcCtx

  sCtx.clearRect(0, 0, W, H)

  if (type === 'mountains') {
    // Sky gradient
    const sky = sCtx.createLinearGradient(0, 0, 0, H * 0.6)
    sky.addColorStop(0, `hsl(${200 + rng() * 30},70%,${40 + rng() * 20}%)`)
    sky.addColorStop(1, `hsl(${190 + rng() * 20},60%,60%)`)
    sCtx.fillStyle = sky
    sCtx.fillRect(0, 0, W, H)

    // Mountains (3 layers)
    for (let layer = 0; layer < 3; layer++) {
      const baseY = H * (0.35 + layer * 0.12)
      const brightness = 20 + layer * 15
      sCtx.fillStyle = `hsl(${210 + layer * 10},30%,${brightness}%)`
      sCtx.beginPath()
      sCtx.moveTo(0, H)
      let x = 0
      while (x < W) {
        const peakH = 40 + rng() * 60 - layer * 15
        const width = 30 + rng() * 50
        sCtx.lineTo(x + width / 2, baseY - peakH)
        sCtx.lineTo(x + width, baseY)
        x += width
      }
      sCtx.lineTo(W, H)
      sCtx.closePath()
      sCtx.fill()
    }

    // Ground
    sCtx.fillStyle = `hsl(${100 + rng() * 30},40%,25%)`
    sCtx.fillRect(0, H * 0.7, W, H * 0.3)

  } else if (type === 'ocean') {
    // Sky
    const sky = sCtx.createLinearGradient(0, 0, 0, H / 2)
    sky.addColorStop(0, `hsl(${210 + rng() * 20},70%,${30 + rng() * 20}%)`)
    sky.addColorStop(1, `hsl(${200},60%,60%)`)
    sCtx.fillStyle = sky
    sCtx.fillRect(0, 0, W, H / 2)

    // Ocean
    const ocean = sCtx.createLinearGradient(0, H / 2, 0, H)
    ocean.addColorStop(0, `hsl(${200 + rng() * 20},70%,${35 + rng() * 15}%)`)
    ocean.addColorStop(1, `hsl(${210},60%,20%)`)
    sCtx.fillStyle = ocean
    sCtx.fillRect(0, H / 2, W, H / 2)

    // Waves
    for (let i = 0; i < 8; i++) {
      const wy = H / 2 + i * (H / 16)
      sCtx.strokeStyle = `rgba(255,255,255,${0.05 + rng() * 0.1})`
      sCtx.lineWidth = 1
      sCtx.beginPath()
      for (let x = 0; x < W; x += 5) {
        const y = wy + Math.sin((x + rng() * 20) * 0.1) * 2
        x === 0 ? sCtx.moveTo(x, y) : sCtx.lineTo(x, y)
      }
      sCtx.stroke()
    }

  } else if (type === 'forest') {
    // Sky
    const sky = sCtx.createLinearGradient(0, 0, 0, H * 0.5)
    sky.addColorStop(0, `hsl(${190 + rng() * 30},60%,${25 + rng() * 20}%)`)
    sky.addColorStop(1, `hsl(${150 + rng() * 20},40%,40%)`)
    sCtx.fillStyle = sky
    sCtx.fillRect(0, 0, W, H * 0.5)

    // Trees (triangular)
    const treeCount = 20 + Math.floor(rng() * 10)
    for (let i = 0; i < treeCount; i++) {
      const tx = rng() * W
      const ty = H * 0.3 + rng() * H * 0.3
      const tHeight = 20 + rng() * 40
      const tWidth = tHeight * 0.5
      const shade = 20 + Math.floor(rng() * 30)
      sCtx.fillStyle = `hsl(${120 + rng() * 30},${40 + rng() * 20}%,${shade}%)`
      sCtx.beginPath()
      sCtx.moveTo(tx, ty - tHeight)
      sCtx.lineTo(tx + tWidth, ty)
      sCtx.lineTo(tx - tWidth, ty)
      sCtx.closePath()
      sCtx.fill()
    }

    // Ground
    sCtx.fillStyle = `hsl(${100 + rng() * 20},35%,${20 + rng() * 10}%)`
    sCtx.fillRect(0, H * 0.65, W, H * 0.35)

  } else if (type === 'desert') {
    // Sky (orange/yellow)
    const sky = sCtx.createLinearGradient(0, 0, 0, H * 0.5)
    sky.addColorStop(0, `hsl(${20 + rng() * 20},70%,${40 + rng() * 20}%)`)
    sky.addColorStop(1, `hsl(${35 + rng() * 15},80%,60%)`)
    sCtx.fillStyle = sky
    sCtx.fillRect(0, 0, W, H * 0.5)

    // Sand dunes
    for (let d = 0; d < 4; d++) {
      const duneY = H * (0.45 + d * 0.08)
      const shade = 35 + d * 8
      sCtx.fillStyle = `hsl(${30 + rng() * 20},60%,${shade}%)`
      sCtx.beginPath()
      sCtx.moveTo(0, H)
      let x = 0
      while (x < W) {
        const w2 = 40 + rng() * 60
        const h2 = 15 + rng() * 25
        sCtx.quadraticCurveTo(x + w2 / 2, duneY - h2, x + w2, duneY)
        x += w2
      }
      sCtx.lineTo(W, H)
      sCtx.closePath()
      sCtx.fill()
    }

  } else if (type === 'city') {
    // Sky
    sCtx.fillStyle = `hsl(${220 + rng() * 20},40%,${15 + rng() * 10}%)`
    sCtx.fillRect(0, 0, W, H)

    // Buildings
    const buildingCount = 15 + Math.floor(rng() * 10)
    for (let i = 0; i < buildingCount; i++) {
      const bx = (i / buildingCount) * W + rng() * 10 - 5
      const bw = 8 + rng() * 15
      const bh = 20 + rng() * (H * 0.6)
      const shade = 15 + Math.floor(rng() * 25)
      sCtx.fillStyle = `hsl(${220 + rng() * 30},20%,${shade}%)`
      sCtx.fillRect(bx, H - bh, bw, bh)

      // Windows
      const winRows = Math.floor(bh / 8)
      const winCols = Math.floor(bw / 5)
      for (let wr = 0; wr < winRows; wr++) {
        for (let wc = 0; wc < winCols; wc++) {
          if (rng() > 0.5) {
            sCtx.fillStyle = `rgba(255,220,100,${0.3 + rng() * 0.4})`
            sCtx.fillRect(bx + wc * 5 + 1, H - bh + wr * 8 + 2, 3, 4)
          }
        }
      }
    }
  }

  // Add noise to make steganography less obvious
  const noiseData = sCtx.getImageData(0, 0, W, H)
  const nd = noiseData.data
  for (let i = 0; i < nd.length; i += 4) {
    // Small random variations
    nd[i]   = clamp(nd[i]   + Math.floor((rng() - 0.5) * 8))
    nd[i+1] = clamp(nd[i+1] + Math.floor((rng() - 0.5) * 8))
    nd[i+2] = clamp(nd[i+2] + Math.floor((rng() - 0.5) * 8))
  }
  sCtx.putImageData(noiseData, 0, 0)
}

function makeRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function clamp(v: number): number { return Math.max(0, Math.min(255, v)) }

// ── Steganography ──────────────────────────────────────────────────────────────
// Encode word into the LSBs of a channel
function encodeWord(imageData: ImageData, word: string, channel: 'red' | 'green' | 'blue', bitDepth: 1 | 2): void {
  const d = imageData.data
  const channelOff = channel === 'red' ? 0 : channel === 'green' ? 1 : 2

  // Convert word to bits
  const bits: number[] = []
  for (let i = 0; i < word.length; i++) {
    const code = word.charCodeAt(i)
    for (let b = 7; b >= 0; b--) {
      bits.push((code >> b) & 1)
    }
  }
  // Null terminator
  for (let b = 0; b < 8; b++) bits.push(0)

  // Encode in pixels across a diagonal band (visible as pattern in bit plane)
  const msgLen = bits.length
  let bitIdx = 0

  // Write bits scattered across the image in a visible pattern
  // For bit plane visualization to work, we write in a grid pattern
  const stride = Math.floor((IMG_W * IMG_H) / (msgLen / bitDepth))

  for (let pixelIdx = 0; pixelIdx < IMG_W * IMG_H && bitIdx < bits.length; pixelIdx += stride) {
    const base = pixelIdx * 4 + channelOff
    if (base >= d.length) break

    if (bitDepth === 1) {
      // Clear bit 0, set to message bit
      d[base] = (d[base] & 0xfe) | bits[bitIdx]
      bitIdx++
    } else {
      // Clear bits 0-1, set to two message bits
      const b0 = bits[bitIdx] ?? 0
      const b1 = bits[bitIdx + 1] ?? 0
      d[base] = (d[base] & 0xfc) | (b1 << 1) | b0
      bitIdx += 2
    }
  }

  // Also write letters as patterns in a 5x7 font for bit-plane visibility
  drawHiddenText(d, word, channelOff, bitDepth)
}

function drawHiddenText(d: Uint8ClampedArray, word: string, channelOff: number, bitDepth: 1 | 2): void {
  // Simple 4x6 pixel font (just write the bit pattern directly into a region)
  // Write in the top 20 rows of the image where the sky gradient is
  const startY = 5, startX = 5
  const scale = 2

  for (let ci = 0; ci < word.length; ci++) {
    const char = word[ci]
    const bitmap = CHAR_BITMAPS[char] || CHAR_BITMAPS['?']
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        const bit = (bitmap[row] >> (4 - col)) & 1
        const px = startX + ci * (5 * scale + scale) + col * scale
        const py = startY + row * scale
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const idx = ((py + sy) * IMG_W + (px + sx)) * 4 + channelOff
            if (idx < d.length) {
              if (bitDepth === 1) {
                d[idx] = (d[idx] & 0xfe) | bit
              } else {
                d[idx] = (d[idx] & 0xfc) | (bit << 1) | bit
              }
            }
          }
        }
      }
    }
  }
}

// Minimal 5x7 pixel font bitmaps (5 columns, 7 rows each as number bitmask)
const CHAR_BITMAPS: Record<string, number[]> = {
  'A': [0b01110,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  'B': [0b11110,0b10001,0b10001,0b11110,0b10001,0b10001,0b11110],
  'C': [0b01111,0b10000,0b10000,0b10000,0b10000,0b10000,0b01111],
  'D': [0b11110,0b10001,0b10001,0b10001,0b10001,0b10001,0b11110],
  'E': [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b11111],
  'F': [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b10000],
  'G': [0b01111,0b10000,0b10000,0b10111,0b10001,0b10001,0b01111],
  'H': [0b10001,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  'I': [0b01110,0b00100,0b00100,0b00100,0b00100,0b00100,0b01110],
  'J': [0b00001,0b00001,0b00001,0b00001,0b00001,0b10001,0b01110],
  'K': [0b10001,0b10010,0b10100,0b11000,0b10100,0b10010,0b10001],
  'L': [0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b11111],
  'M': [0b10001,0b11011,0b10101,0b10001,0b10001,0b10001,0b10001],
  'N': [0b10001,0b11001,0b10101,0b10011,0b10001,0b10001,0b10001],
  'O': [0b01110,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
  'P': [0b11110,0b10001,0b10001,0b11110,0b10000,0b10000,0b10000],
  'Q': [0b01110,0b10001,0b10001,0b10001,0b10101,0b10010,0b01101],
  'R': [0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001],
  'S': [0b01111,0b10000,0b10000,0b01110,0b00001,0b00001,0b11110],
  'T': [0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100],
  'U': [0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
  'V': [0b10001,0b10001,0b10001,0b10001,0b10001,0b01010,0b00100],
  'W': [0b10001,0b10001,0b10001,0b10101,0b10101,0b11011,0b10001],
  'X': [0b10001,0b10001,0b01010,0b00100,0b01010,0b10001,0b10001],
  'Y': [0b10001,0b10001,0b10001,0b01010,0b00100,0b00100,0b00100],
  'Z': [0b11111,0b00001,0b00010,0b00100,0b01000,0b10000,0b11111],
  '?': [0b01110,0b10001,0b00001,0b00110,0b00100,0b00000,0b00100],
}

// ── Filter application ─────────────────────────────────────────────────────────
function applyFilter(mode: FilterMode, contrast: number): void {
  if (!rawPixels) return

  const src = rawPixels.data
  const out = ctx.createImageData(IMG_W, IMG_H)
  const d = out.data

  for (let i = 0; i < src.length; i += 4) {
    let r = src[i], g = src[i+1], b = src[i+2], a = src[i+3]

    switch (mode) {
      case 'normal':
        // Just apply contrast
        break
      case 'red':
        r = src[i]; g = 0; b = 0
        break
      case 'green':
        r = 0; g = src[i+1]; b = 0
        break
      case 'blue':
        r = 0; g = 0; b = src[i+2]
        break
      case 'bit0':
        // Show only bit 0 of all channels (amplified)
        r = (src[i] & 1) * 255
        g = (src[i+1] & 1) * 255
        b = (src[i+2] & 1) * 255
        break
      case 'bit1':
        r = ((src[i] >> 1) & 1) * 255
        g = ((src[i+1] >> 1) & 1) * 255
        b = ((src[i+2] >> 1) & 1) * 255
        break
      case 'bit01':
        // Show bits 0-1, amplified by 64
        r = (src[i] & 3) * 64
        g = (src[i+1] & 3) * 64
        b = (src[i+2] & 3) * 64
        break
      case 'invert':
        r = 255 - src[i]; g = 255 - src[i+1]; b = 255 - src[i+2]
        break
      case 'threshold': {
        const gray = (src[i] * 0.299 + src[i+1] * 0.587 + src[i+2] * 0.114)
        const t = gray > 128 ? 255 : 0
        r = t; g = t; b = t
        break
      }
    }

    // Apply contrast
    const cf = contrast / 100
    d[i]   = clamp(((r - 128) * cf + 128))
    d[i+1] = clamp(((g - 128) * cf + 128))
    d[i+2] = clamp(((b - 128) * cf + 128))
    d[i+3] = a
  }

  // Scale up to fit canvas
  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = IMG_W
  tmpCanvas.height = IMG_H
  const tmpCtx = tmpCanvas.getContext('2d')!
  tmpCtx.putImageData(out, 0, 0)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(tmpCanvas, 0, 0, canvas.width, canvas.height)
}

// ── Level management ───────────────────────────────────────────────────────────
function loadLevel(lvl: number): void {
  const cfg = LEVELS[lvl - 1]
  filterMode = 'normal'
  contrastValue = 100
  startTime = Date.now()
  levelTime = 0

  // Reset tool buttons
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('btn-normal')!.classList.add('active')
  ;(document.getElementById('contrast-slider') as HTMLInputElement).value = '100'

  // Generate landscape
  generateLandscape(cfg.landscape, lvl * 12345)

  // Get pixel data and encode
  rawPixels = srcCtx.getImageData(0, 0, IMG_W, IMG_H)
  encodeWord(rawPixels, cfg.word, cfg.channel, cfg.bitDepth)

  // Store encoded pixels as raw
  rawPixels = new ImageData(new Uint8ClampedArray(rawPixels.data), IMG_W, IMG_H)

  // Size canvas to fit
  const wrap = document.getElementById('canvas-wrap')!
  const maxW = wrap.clientWidth - 8
  const maxH = wrap.clientHeight - 8
  const scale = Math.min(Math.floor(maxW / IMG_W), Math.floor(maxH / IMG_H), 4)
  canvas.width = IMG_W * Math.max(1, scale)
  canvas.height = IMG_H * Math.max(1, scale)

  applyFilter('normal', 100)
  updateHUD()

  const hint = document.getElementById('hud-hint')!
  hint.textContent = cfg.hint
  ;(document.getElementById('answer-input') as HTMLInputElement).value = ''
  ;(document.getElementById('feedback') as HTMLElement).textContent = ''
}

// ── Tool handlers ──────────────────────────────────────────────────────────────
function setFilter(mode: FilterMode, btnId: string): void {
  filterMode = mode
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'))
  document.getElementById(btnId)!.classList.add('active')
  applyFilter(mode, contrastValue)
  audio.click()
}

document.getElementById('btn-normal')!.addEventListener('click', () => setFilter('normal', 'btn-normal'))
document.getElementById('btn-red')!.addEventListener('click', () => setFilter('red', 'btn-red'))
document.getElementById('btn-green')!.addEventListener('click', () => setFilter('green', 'btn-green'))
document.getElementById('btn-blue')!.addEventListener('click', () => setFilter('blue', 'btn-blue'))
document.getElementById('btn-bit0')!.addEventListener('click', () => setFilter('bit0', 'btn-bit0'))
document.getElementById('btn-bit1')!.addEventListener('click', () => setFilter('bit1', 'btn-bit1'))
document.getElementById('btn-bit01')!.addEventListener('click', () => setFilter('bit01', 'btn-bit01'))
document.getElementById('btn-invert')!.addEventListener('click', () => setFilter('invert', 'btn-invert'))
document.getElementById('btn-threshold')!.addEventListener('click', () => setFilter('threshold', 'btn-threshold'))
document.getElementById('btn-reset-filter')!.addEventListener('click', () => {
  contrastValue = 100
  ;(document.getElementById('contrast-slider') as HTMLInputElement).value = '100'
  setFilter('normal', 'btn-normal')
})

document.getElementById('contrast-slider')!.addEventListener('input', (e) => {
  contrastValue = parseInt((e.target as HTMLInputElement).value)
  applyFilter(filterMode, contrastValue)
})

// ── Answer checking ────────────────────────────────────────────────────────────
function checkAnswer(): void {
  const input = document.getElementById('answer-input') as HTMLInputElement
  const feedback = document.getElementById('feedback') as HTMLElement
  const answer = input.value.trim().toUpperCase()
  const correct = LEVELS[level - 1].word

  if (answer === correct) {
    audio.levelUp()
    levelTime = (Date.now() - startTime) / 1000
    const timeBonus = Math.max(0, Math.floor(500 - levelTime * 2))
    const levelScore = 100 + timeBonus
    totalScore += levelScore
    reportScore(totalScore)

    if (totalScore > bestScore) {
      bestScore = totalScore
      saveBestScore(bestScore)
    }

    feedback.textContent = `+${levelScore}`
    feedback.setAttribute('style', 'color:#4ade80')
    updateHUD()

    setTimeout(() => {
      if (level < LEVELS.length) {
        level++
        loadLevel(level)
      } else {
        reportGameOver(totalScore)
        showGameOverOverlay()
      }
    }, 800)
  } else {
    audio.death()
    feedback.textContent = 'Wrong!'
    feedback.setAttribute('style', 'color:#f87171')
    setTimeout(() => { feedback.textContent = '' }, 1500)
  }
}

document.getElementById('submit-btn')!.addEventListener('click', checkAnswer)
document.getElementById('answer-input')!.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') checkAnswer()
})

// ── HUD ────────────────────────────────────────────────────────────────────────
function updateHUD(): void {
  setEl('hud-level', `${level}/${LEVELS.length}`)
  setEl('hud-time', `${levelTime > 0 ? levelTime.toFixed(0) : Math.floor((Date.now() - startTime) / 1000)}s`)
  setEl('hud-score', String(totalScore))
}

function setEl(id: string, text: string): void {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

// ── Overlays ───────────────────────────────────────────────────────────────────
const overlay = document.getElementById('overlay') as HTMLElement

function clearOverlay(): void {
  while (overlay.firstChild) overlay.removeChild(overlay.firstChild)
}

function makeOverlayBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.addEventListener('click', onClick)
  return btn
}

function makeEl(tag: string, text: string, style?: string): HTMLElement {
  const el = document.createElement(tag)
  el.textContent = text
  if (style) el.setAttribute('style', style)
  return el
}

function showGameOverOverlay(): void {
  clearOverlay()
  overlay.appendChild(makeEl('h1', 'Decrypted!', 'color:#4ade80'))
  overlay.appendChild(makeEl('p', 'All 8 secrets uncovered'))
  overlay.appendChild(makeEl('div', String(totalScore), 'font-size:clamp(32px,7vw,56px);color:#4ade80;font-weight:bold'))
  overlay.appendChild(makeEl('p', `Best: ${bestScore}`, 'color:#888'))
  overlay.appendChild(makeOverlayBtn('Play Again', () => {
    overlay.style.display = 'none'
    level = 1
    totalScore = 0
    loadLevel(1)
  }))
  overlay.style.display = 'flex'
}

// ── Start overlay ──────────────────────────────────────────────────────────────
document.getElementById('overlay-btn')!.addEventListener('click', () => {
  overlay.style.display = 'none'
  audio.start()
  loadLevel(level)
})

// ── Mute ───────────────────────────────────────────────────────────────────────
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement
muteBtn.addEventListener('click', () => {
  const m = audio.toggleMute()
  muteBtn.textContent = m ? '\uD83D\uDD07' : '\uD83D\uDD0A'
})

// ── HUD timer loop ─────────────────────────────────────────────────────────────
function hudLoop(): void {
  if (startTime > 0 && levelTime === 0) updateHUD()
  requestAnimationFrame(hudLoop)
}

// ── Boot ───────────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  try {
    const { bestScore: saved } = await initSDK('stegano')
    bestScore = saved
  } catch {
    // standalone
  }

  requestAnimationFrame(hudLoop)
}

void boot()
