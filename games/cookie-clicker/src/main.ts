// Cookie Clicker — main entry: DOM, idle loop, auto-save

import {
  createGame, click, buyBuilding, tick, toSaveState, fromSaveState,
} from './game.js'
import type { CookieGame } from './game.js'
import { initSDK, reportScore, saveState } from './sdk-bridge.js'

// ── DOM refs ──────────────────────────────────────────────────────────────────

const cookieBtn      = document.getElementById('cookie-btn') as HTMLButtonElement
const cookieCount    = document.getElementById('cookie-count') as HTMLDivElement
const cpsDisplay     = document.getElementById('cps-display') as HTMLDivElement
const shopList       = document.getElementById('shop-list') as HTMLDivElement
const totalBakedEl   = document.getElementById('total-baked-value') as HTMLSpanElement

// ── Number formatting ─────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (n >= 1e9)  return (n / 1e9).toFixed(2)  + 'B'
  if (n >= 1e6)  return (n / 1e6).toFixed(2)  + 'M'
  if (n >= 1e3)  return (n / 1e3).toFixed(1)  + 'K'
  return Math.floor(n).toString()
}

// ── Game state ────────────────────────────────────────────────────────────────

let game: CookieGame = createGame()

// ── Shop DOM ──────────────────────────────────────────────────────────────────

function buildShopRows(): void {
  shopList.textContent = ''
  game.buildings.forEach((b) => {
    const row = document.createElement('div')
    row.className = 'building-row'
    row.dataset.id = b.def.id

    const iconEl = document.createElement('span')
    iconEl.className = 'building-icon'
    iconEl.textContent = b.def.icon

    const info = document.createElement('div')
    info.className = 'building-info'

    const nameEl = document.createElement('div')
    nameEl.className = 'building-name'
    nameEl.textContent = b.def.name

    const descEl = document.createElement('div')
    descEl.className = 'building-desc'
    descEl.textContent = b.def.description

    info.appendChild(nameEl)
    info.appendChild(descEl)

    const right = document.createElement('div')
    right.className = 'building-right'

    const costEl = document.createElement('div')
    costEl.className = 'building-cost'
    costEl.textContent = fmt(b.cost)

    const ownedEl = document.createElement('div')
    ownedEl.className = 'building-owned'
    ownedEl.textContent = String(b.owned)

    right.appendChild(costEl)
    right.appendChild(ownedEl)

    row.appendChild(iconEl)
    row.appendChild(info)
    row.appendChild(right)

    row.addEventListener('click', () => handleBuy(b.def.id))
    row.addEventListener('touchend', (e) => {
      e.preventDefault()
      handleBuy(b.def.id)
    })

    shopList.appendChild(row)
  })
}

function updateShopRows(): void {
  game.buildings.forEach((b) => {
    const row = shopList.querySelector(`[data-id="${b.def.id}"]`) as HTMLElement | null
    if (!row) return

    const canAfford = game.cookies >= b.cost
    row.classList.toggle('can-afford', canAfford)
    row.classList.toggle('cannot-afford', !canAfford)

    const costEl  = row.querySelector('.building-cost') as HTMLElement
    const ownedEl = row.querySelector('.building-owned') as HTMLElement
    costEl.textContent  = fmt(b.cost)
    ownedEl.textContent = String(b.owned)
  })
}

// ── HUD ───────────────────────────────────────────────────────────────────────

function updateHUD(): void {
  const cookies = Math.floor(game.cookies)
  cookieCount.textContent  = `${fmt(cookies)} cookie${cookies !== 1 ? 's' : ''}`
  cpsDisplay.textContent   = `${fmt(game.cps)} per second`
  totalBakedEl.textContent = fmt(game.totalBaked)
}

// ── Click handler ─────────────────────────────────────────────────────────────

function spawnParticle(x: number, y: number): void {
  const p = document.createElement('span')
  p.className = 'particle'
  p.textContent = '+1'
  const angle = (Math.random() * 160 - 80) * (Math.PI / 180)
  const dist = 50 + Math.random() * 40
  p.style.left = `${x}px`
  p.style.top  = `${y}px`
  p.style.setProperty('--dx', `${Math.sin(angle) * dist}px`)
  p.style.setProperty('--dy', `${-Math.abs(Math.cos(angle)) * dist}px`)
  document.body.appendChild(p)
  setTimeout(() => p.remove(), 750)
}

cookieBtn.addEventListener('click', (e) => {
  game = click(game)
  updateHUD()

  // Pop animation
  cookieBtn.classList.remove('pop')
  void cookieBtn.offsetWidth
  cookieBtn.classList.add('pop')

  // Particle
  spawnParticle(e.clientX, e.clientY)
})

cookieBtn.addEventListener('touchend', (e) => {
  e.preventDefault()
  game = click(game)
  updateHUD()

  cookieBtn.classList.remove('pop')
  void cookieBtn.offsetWidth
  cookieBtn.classList.add('pop')

  const touch = e.changedTouches[0]
  spawnParticle(touch.clientX, touch.clientY)
})

// ── Buy handler ───────────────────────────────────────────────────────────────

function handleBuy(id: string): void {
  const updated = buyBuilding(game, id)
  if (!updated) return
  game = updated
  updateHUD()
  updateShopRows()
}

// ── Idle loop (100ms) ─────────────────────────────────────────────────────────

const TICK_MS = 100

setInterval(() => {
  game = tick(game, TICK_MS / 1000)
  updateHUD()
  updateShopRows()
  reportScore(Math.floor(game.totalBaked))
}, TICK_MS)

// ── Auto-save every 10 seconds ────────────────────────────────────────────────

setInterval(() => {
  saveState(toSaveState(game))
}, 10_000)

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    const saved = await initSDK()
    if (saved) {
      game = fromSaveState(saved)
    }
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  buildShopRows()
  updateHUD()
  updateShopRows()
}

void boot()
