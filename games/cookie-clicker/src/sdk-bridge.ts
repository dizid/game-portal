// SDK bridge for Cookie Clicker

import { gameSDK } from '@game-portal/game-sdk'
import type { SavedState } from './game.js'

export async function initSDK(): Promise<SavedState | null> {
  await gameSDK.init({ gameId: 'cookie-clicker', gameSlug: 'cookie-clicker' })
  await gameSDK.showAd('preroll')
  const saved = await gameSDK.load<SavedState>()
  return saved ?? null
}

export function reportScore(score: number): void {
  gameSDK.reportScore(score)
}

export function saveState(state: SavedState): void {
  gameSDK.save(state)
}
