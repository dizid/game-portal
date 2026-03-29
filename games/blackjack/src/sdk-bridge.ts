// SDK bridge for Blackjack

import { gameSDK } from '@game-portal/game-sdk'

export interface SDKBridgeResult {
  highScore: number
}

export async function initSDK(): Promise<SDKBridgeResult> {
  await gameSDK.init({ gameId: 'blackjack', gameSlug: 'blackjack' })
  await gameSDK.showAd('preroll')
  const saved = await gameSDK.load<{ highScore: number }>()
  return { highScore: saved?.highScore ?? 0 }
}

/** Report live chip count as score */
export function reportScore(chips: number): void {
  gameSDK.reportScore(chips)
}

/** Signal game over with final chip count */
export function reportGameOver(chips: number): void {
  gameSDK.gameOver(chips)
}

/** Persist high score (best chip count reached) */
export function saveHighScore(highScore: number): void {
  gameSDK.save({ highScore })
}

/** Request a midroll ad between rounds */
export function requestMidrollAd(): Promise<boolean> {
  return gameSDK.showAd('midroll')
}
