// SDK bridge for Trivia

import { gameSDK } from '@game-portal/game-sdk'

export interface SDKBridgeResult {
  highScore: number
}

export async function initSDK(): Promise<SDKBridgeResult> {
  await gameSDK.init({ gameId: 'trivia', gameSlug: 'trivia' })
  await gameSDK.showAd('preroll')
  const saved = await gameSDK.load<{ highScore: number }>()
  return { highScore: saved?.highScore ?? 0 }
}

export function reportScore(score: number): void {
  gameSDK.reportScore(score)
}

export function reportGameOver(score: number): void {
  gameSDK.gameOver(score)
}

export function saveHighScore(highScore: number): void {
  gameSDK.save({ highScore })
}

export function requestMidrollAd(): Promise<boolean> {
  return gameSDK.showAd('midroll')
}
