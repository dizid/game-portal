// SDK bridge — wraps @game-portal/game-sdk for use in the typing-speed game

import { gameSDK } from '@game-portal/game-sdk'
import type { SDKInitPayload } from '@game-portal/types'

export interface SDKBridgeResult {
  config: SDKInitPayload
  highScore: number
}

export async function initSDK(): Promise<SDKBridgeResult> {
  const config = await gameSDK.init({ gameId: 'typing-speed', gameSlug: 'typing-speed' })
  await gameSDK.showAd('preroll')
  const saved = await gameSDK.load<{ highScore: number }>()
  return {
    config,
    highScore: saved?.highScore ?? 0,
  }
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
