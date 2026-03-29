// SDK bridge for 2048

import { gameSDK } from '@game-portal/game-sdk'

export interface SDKBridgeResult {
  best: number
}

export async function initSDK(): Promise<SDKBridgeResult> {
  await gameSDK.init({ gameId: '2048', gameSlug: '2048' })
  await gameSDK.showAd('preroll')
  const saved = await gameSDK.load<{ best: number }>()
  return { best: saved?.best ?? 0 }
}

export function reportScore(score: number): void {
  gameSDK.reportScore(score)
}

export function reportGameOver(score: number): void {
  gameSDK.gameOver(score)
}

export function saveBest(best: number): void {
  gameSDK.save({ best })
}
