// SDK bridge — wraps @game-portal/game-sdk for use in the snake game

import { gameSDK } from '@game-portal/game-sdk'
import type { SDKInitPayload } from '@game-portal/types'

export interface SDKBridgeResult {
  config: SDKInitPayload
  highScore: number
}

export async function initSDK(): Promise<SDKBridgeResult> {
  const config = await gameSDK.init({ gameId: 'snake', gameSlug: 'snake' })

  // Show preroll ad before the game begins
  await gameSDK.showAd('preroll')

  // Load persisted high score
  const saved = await gameSDK.load<{ highScore: number }>()

  return {
    config,
    highScore: saved?.highScore ?? 0,
  }
}

/** Report an in-progress score (e.g. for live leaderboard). */
export function reportScore(score: number): void {
  gameSDK.reportScore(score)
}

/** Signal game over and send final score. */
export function reportGameOver(score: number): void {
  gameSDK.gameOver(score)
}

/** Persist the high score. */
export function saveHighScore(highScore: number): void {
  gameSDK.save({ highScore })
}

/** Request a midroll ad. Resolves true if the ad was watched. */
export function requestMidrollAd(): Promise<boolean> {
  return gameSDK.showAd('midroll')
}
