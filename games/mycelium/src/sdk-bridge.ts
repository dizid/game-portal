import { gameSDK } from '@game-portal/game-sdk'

export interface SDKBridgeResult {
  bestScore: number
}

export async function initSDK(): Promise<SDKBridgeResult> {
  await gameSDK.init({ gameId: 'mycelium', gameSlug: 'mycelium' })
  await gameSDK.showAd('preroll')
  const saved = await gameSDK.load<{ bestScore: number }>()
  return { bestScore: saved?.bestScore ?? 0 }
}

export function reportScore(score: number): void {
  gameSDK.reportScore(score)
}

export function reportGameOver(score: number): void {
  gameSDK.gameOver(score)
}

export function saveBestScore(score: number): void {
  gameSDK.save({ bestScore: score })
}
