// SDK bridge for Whack-a-Mole

import { gameSDK } from '@game-portal/game-sdk'

export interface SDKBridgeResult {
  best: number
}

export async function initSDK(): Promise<SDKBridgeResult> {
  await gameSDK.init({ gameId: 'whack-a-mole', gameSlug: 'whack-a-mole' })
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
