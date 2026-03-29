// SDK bridge — wraps @game-portal/game-sdk for use in the Wordle game

import { gameSDK } from '@game-portal/game-sdk'

export interface SDKBridgeResult {
  highScore: number
}

export async function initSDK(): Promise<SDKBridgeResult> {
  await gameSDK.init({ gameId: 'wordle', gameSlug: 'wordle' })
  await gameSDK.showAd('preroll')
  const saved = await gameSDK.load<{ highScore: number }>()
  return { highScore: saved?.highScore ?? 0 }
}

/** Report an in-progress score. */
export function reportScore(score: number): void {
  gameSDK.reportScore(score)
}

/** Signal game over with final score. */
export function reportGameOver(score: number): void {
  gameSDK.gameOver(score)
}

/** Persist high score. */
export function saveHighScore(highScore: number): void {
  gameSDK.save({ highScore })
}

/** Share emoji result grid. */
export function shareResult(text: string): void {
  gameSDK.share({ text })
}
