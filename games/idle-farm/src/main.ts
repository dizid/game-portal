// Idle Farm — incremental idle game with wheat → flour → bread → sandwiches → gold chain

import { gameSDK } from '@game-portal/game-sdk'
import { audio } from './audio.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SaveData {
  wheat: number
  flour: number
  bread: number
  sandwiches: number
  gold: number
  fields: number
  hasBakery: boolean
  hasRestaurant: boolean
  prestigeMultiplier: number
  lastSaveTime: number
}

interface GameState extends SaveData {
  // Accumulator buffers for fractional production (sub-integer amounts)
  wheatBuffer: number
  flourBuffer: number
  breadBuffer: number
  sandwichBuffer: number
  // Progress toward next conversion (0-1)
  millProgress: number
  bakeryProgress: number
  deliProgress: number
  restaurantProgress: number
}

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.floor(n).toString()
}

// ── State ─────────────────────────────────────────────────────────────────────

const DEFAULT_SAVE: SaveData = {
  wheat: 0, flour: 0, bread: 0, sandwiches: 0, gold: 0,
  fields: 1, hasBakery: false, hasRestaurant: false,
  prestigeMultiplier: 1, lastSaveTime: Date.now(),
}

const state: GameState = {
  ...structuredClone(DEFAULT_SAVE),
  wheatBuffer: 0, flourBuffer: 0, breadBuffer: 0, sandwichBuffer: 0,
  millProgress: 0, bakeryProgress: 0, deliProgress: 0, restaurantProgress: 0,
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const goldDisplay = document.getElementById('gold-display') as HTMLSpanElement
const multiplierDisplay = document.getElementById('multiplier-display') as HTMLSpanElement
const fieldsDisplay = document.getElementById('fields-display') as HTMLSpanElement
const wheatDisplay = document.getElementById('wheat-display') as HTMLSpanElement
const flourDisplay = document.getElementById('flour-display') as HTMLSpanElement
const breadDisplay = document.getElementById('bread-display') as HTMLSpanElement
const sandwichesDisplay = document.getElementById('sandwiches-display') as HTMLSpanElement
const wheatRate = document.getElementById('wheat-rate') as HTMLSpanElement
const flourRate = document.getElementById('flour-rate') as HTMLSpanElement
const breadRate = document.getElementById('bread-rate') as HTMLSpanElement
const sandwichRate = document.getElementById('sandwich-rate') as HTMLSpanElement

const millProgress = document.getElementById('mill-progress') as HTMLDivElement
const bakeryProgress = document.getElementById('bakery-progress') as HTMLDivElement
const deliProgress = document.getElementById('deli-progress') as HTMLDivElement
const restaurantProgress = document.getElementById('restaurant-progress') as HTMLDivElement
const restaurantInfo = document.getElementById('restaurant-info') as HTMLSpanElement

const harvestBtn = document.getElementById('harvest-btn') as HTMLButtonElement
const btnBuyField = document.getElementById('btn-buy-field') as HTMLButtonElement
const btnBuyBakery = document.getElementById('btn-buy-bakery') as HTMLButtonElement
const btnBuyRestaurant = document.getElementById('btn-buy-restaurant') as HTMLButtonElement
const btnPrestige = document.getElementById('btn-prestige') as HTMLButtonElement
const fieldCountDesc = document.getElementById('field-count-desc') as HTMLSpanElement

const prestigeBanner = document.getElementById('prestige-banner') as HTMLDivElement
const btnConfirmPrestige = document.getElementById('btn-confirm-prestige') as HTMLButtonElement
const btnCancelPrestige = document.getElementById('btn-cancel-prestige') as HTMLButtonElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Rates ─────────────────────────────────────────────────────────────────────

function getWheatPerSec(): number {
  // Extra fields auto-harvest; each additional field = 1/sec * multiplier
  return Math.max(0, state.fields - 1) * state.prestigeMultiplier
}

function getFlourPerSec(): number {
  // Wheat converts at 1/10 rate (10 wheat = 1 flour), but we need auto-mills
  // The mill processes wheat automatically always; rate shown as flour output/sec
  return getWheatPerSec() / 10
}

// ── Game tick ──────────────────────────────────────────────────────────────────

let lastTick = performance.now()

function tick(now: number): void {
  const dt = Math.min((now - lastTick) / 1000, 5) // cap at 5s to avoid insane offline bursts
  lastTick = now

  const mult = state.prestigeMultiplier

  // Auto-harvest wheat from extra fields
  const wheatPerSec = Math.max(0, state.fields - 1) * mult
  state.wheat += wheatPerSec * dt

  // Mill: convert wheat → flour (10:1), automatic always
  if (state.wheat >= 0.1) {
    const toProcess = Math.min(state.wheat, wheatPerSec > 0 ? wheatPerSec * dt * 2 : dt * 2)
    const flourGained = toProcess / 10
    state.wheat -= toProcess
    state.flour += flourGained
    state.millProgress = Math.min(1, state.wheat / 10)
  } else {
    state.millProgress = state.wheat / 10
  }

  // Bakery: auto flour → bread (5:1)
  if (state.hasBakery && state.flour >= 0.1) {
    const flourUsed = Math.min(state.flour, dt * 2 * mult)
    const breadGained = flourUsed / 5
    state.flour -= flourUsed
    state.bread += breadGained
    state.bakeryProgress = Math.min(1, state.flour / 5)
  } else {
    state.bakeryProgress = state.hasBakery ? Math.min(1, state.flour / 5) : 0
  }

  // Deli: auto bread → sandwiches (3:1) — unlocks with bakery
  if (state.hasBakery && state.bread >= 0.1) {
    const breadUsed = Math.min(state.bread, dt * 1 * mult)
    const sandwichGained = breadUsed / 3
    state.bread -= breadUsed
    state.sandwiches += sandwichGained
    state.deliProgress = Math.min(1, state.bread / 3)
  } else {
    state.deliProgress = state.hasBakery ? Math.min(1, state.bread / 3) : 0
  }

  // Restaurant: auto sandwiches → gold (10:1)
  if (state.hasRestaurant && state.sandwiches >= 0.1) {
    const usedSandwiches = Math.min(state.sandwiches, dt * 0.5 * mult)
    const goldGained = usedSandwiches / 10
    const prevGold = state.gold
    state.sandwiches -= usedSandwiches
    state.gold += goldGained
    state.restaurantProgress = Math.min(1, state.sandwiches / 10)
    if (Math.floor(state.gold) > Math.floor(prevGold)) {
      audio.score()
      gameSDK.reportScore(Math.floor(state.gold))
    }
  } else {
    state.restaurantProgress = state.hasRestaurant ? Math.min(1, state.sandwiches / 10) : 0
  }

  updateUI()
  requestAnimationFrame(tick)
}

// ── Render ─────────────────────────────────────────────────────────────────────

function updateUI(): void {
  goldDisplay.textContent = fmt(state.gold)
  multiplierDisplay.textContent = `${state.prestigeMultiplier}x`
  fieldsDisplay.textContent = String(state.fields)
  wheatDisplay.textContent = fmt(state.wheat)
  flourDisplay.textContent = fmt(state.flour)
  breadDisplay.textContent = fmt(state.bread)
  sandwichesDisplay.textContent = fmt(state.sandwiches)

  const wps = Math.max(0, state.fields - 1) * state.prestigeMultiplier
  wheatRate.textContent = `/sec: ${fmt(wps)}`
  flourRate.textContent = `/sec: ${fmt(wps / 10)}`
  breadRate.textContent = state.hasBakery ? `/sec: ${fmt(wps / 50)}` : '/sec: manual'
  sandwichRate.textContent = state.hasBakery ? `/sec: ${fmt(wps / 150)}` : '/sec: manual'

  millProgress.style.width = `${state.millProgress * 100}%`
  bakeryProgress.style.width = `${state.bakeryProgress * 100}%`
  deliProgress.style.width = `${state.deliProgress * 100}%`
  restaurantProgress.style.width = `${state.restaurantProgress * 100}%`
  restaurantInfo.textContent = state.hasRestaurant ? 'auto: on' : 'auto: off'

  // Shop button affordability
  updateShopBtn(btnBuyField, state.gold >= 10)
  updateShopBtn(btnBuyBakery, !state.hasBakery && state.gold >= 50)
  updateShopBtn(btnBuyRestaurant, !state.hasRestaurant && state.gold >= 200)

  btnBuyBakery.disabled = state.hasBakery || state.gold < 50
  btnBuyRestaurant.disabled = state.hasRestaurant || state.gold < 200

  fieldCountDesc.textContent = `Fields: ${state.fields} — auto-harvest/sec: ${fmt(wps)}`

  // Show prestige button once player can afford it
  if (state.gold >= 1_000_000) {
    btnPrestige.style.display = 'flex'
    updateShopBtn(btnPrestige, true)
  }
}

function updateShopBtn(btn: HTMLButtonElement, canAfford: boolean): void {
  if (canAfford) {
    btn.classList.add('can-afford')
    btn.disabled = false
  } else {
    btn.classList.remove('can-afford')
  }
}

// ── Click harvest ─────────────────────────────────────────────────────────────

harvestBtn.addEventListener('click', () => {
  const gained = 1 * state.prestigeMultiplier
  state.wheat += gained
  audio.blip()
  spawnFloat(`+${fmt(gained)} wheat`, harvestBtn, '#a8e063')
})

// ── Shop ──────────────────────────────────────────────────────────────────────

btnBuyField.addEventListener('click', () => {
  if (state.gold < 10) return
  state.gold -= 10
  state.fields++
  audio.powerup()
  spawnFloat('+1 Field', btnBuyField, '#ffd700')
  saveGame()
})

btnBuyBakery.addEventListener('click', () => {
  if (state.hasBakery || state.gold < 50) return
  state.gold -= 50
  state.hasBakery = true
  btnBuyBakery.disabled = true
  audio.levelUp()
  spawnFloat('Bakery Unlocked!', btnBuyBakery, '#ffd700')
  saveGame()
})

btnBuyRestaurant.addEventListener('click', () => {
  if (state.hasRestaurant || state.gold < 200) return
  state.gold -= 200
  state.hasRestaurant = true
  btnBuyRestaurant.disabled = true
  audio.levelUp()
  spawnFloat('Restaurant Chain!', btnBuyRestaurant, '#ffd700')
  saveGame()
})

btnPrestige.addEventListener('click', () => {
  if (state.gold < 1_000_000) return
  prestigeBanner.classList.add('visible')
})

btnConfirmPrestige.addEventListener('click', () => {
  audio.levelUp()
  state.prestigeMultiplier *= 2

  // Reset resources and buildings, keep multiplier
  state.wheat = 0; state.flour = 0; state.bread = 0; state.sandwiches = 0; state.gold = 0
  state.fields = 1; state.hasBakery = false; state.hasRestaurant = false
  state.wheatBuffer = 0; state.flourBuffer = 0; state.breadBuffer = 0; state.sandwichBuffer = 0
  state.millProgress = 0; state.bakeryProgress = 0; state.deliProgress = 0; state.restaurantProgress = 0
  btnPrestige.style.display = 'none'
  btnBuyBakery.disabled = false
  btnBuyRestaurant.disabled = false
  prestigeBanner.classList.remove('visible')
  saveGame()
})

btnCancelPrestige.addEventListener('click', () => {
  prestigeBanner.classList.remove('visible')
})

// ── Float animation ───────────────────────────────────────────────────────────

function spawnFloat(text: string, anchor: HTMLElement, color: string): void {
  const el = document.createElement('div')
  el.className = 'float-text'
  el.textContent = text
  el.style.color = color
  const rect = anchor.getBoundingClientRect()
  el.style.left = `${rect.left + rect.width / 2 - 40}px`
  el.style.top = `${rect.top - 10}px`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 1100)
}

// ── Save / Load ───────────────────────────────────────────────────────────────

function getSaveData(): SaveData {
  return {
    wheat: state.wheat, flour: state.flour, bread: state.bread,
    sandwiches: state.sandwiches, gold: state.gold, fields: state.fields,
    hasBakery: state.hasBakery, hasRestaurant: state.hasRestaurant,
    prestigeMultiplier: state.prestigeMultiplier, lastSaveTime: Date.now(),
  }
}

function saveGame(): void {
  gameSDK.save(getSaveData())
}

function loadSave(data: SaveData): void {
  const now = Date.now()
  const elapsedSecs = Math.min((now - (data.lastSaveTime || now)) / 1000, 3600 * 4) // max 4h offline

  Object.assign(state, data)

  // Apply offline progress (simplified: fields * elapsed = wheat produced)
  if (elapsedSecs > 10) {
    const offlineWheat = Math.max(0, state.fields - 1) * state.prestigeMultiplier * elapsedSecs
    state.wheat += offlineWheat
    // And run conversions
    const offlineFlour = state.wheat / 10
    state.wheat = 0; state.flour += offlineFlour
    if (state.hasBakery) {
      const offlineBread = state.flour / 5
      state.flour = 0; state.bread += offlineBread
      const offlineSandwich = state.bread / 3
      state.bread = 0; state.sandwiches += offlineSandwich
    }
    if (state.hasRestaurant) {
      const offlineGold = state.sandwiches / 10
      state.sandwiches = 0; state.gold += offlineGold
    }
    if (offlineWheat > 1) {
      spawnFloat(`+${fmt(offlineFlour)} flour offline`, harvestBtn, '#a8e063')
    }
  }
}

// Auto-save every 10 seconds
setInterval(() => saveGame(), 10_000)

// ── Mute ──────────────────────────────────────────────────────────────────────

muteBtn.addEventListener('click', () => {
  const muted = audio.toggleMute()
  muteBtn.textContent = muted ? '🔇' : '🔊'
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    await gameSDK.init({ gameId: 'idle-farm', gameSlug: 'idle-farm' })
    await gameSDK.showAd('preroll')
    const saved = await gameSDK.load<SaveData>()
    if (saved) loadSave(saved)
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  audio.start()
  lastTick = performance.now()
  requestAnimationFrame(tick)
}

void boot()
