import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { SDKMessage, SDKInitPayload } from '@game-portal/types'

const SAVE_KEY_PREFIX = 'game-portal:save:'

export interface GameBridgeEvents {
  onScore?: (score: number, meta?: Record<string, unknown>) => void
  onGameOver?: (score: number, replay?: string) => void
  onShare?: (payload: { text: string; score?: number; url?: string; emoji?: string }) => void
  onTrack?: (event: string, data?: Record<string, unknown>) => void
}

export interface GameBridgeState {
  currentScore: Ref<number>
  isGameOver: Ref<boolean>
  iframeRef: Ref<HTMLIFrameElement | null>
  sendInit: (payload: SDKInitPayload) => void
  loadSave: (gameSlug: string) => unknown | null
  clearSave: (gameSlug: string) => void
}

export function useGameBridge(events: GameBridgeEvents = {}): GameBridgeState {
  const currentScore = ref<number>(0)
  const isGameOver = ref<boolean>(false)
  const iframeRef = ref<HTMLIFrameElement | null>(null)

  function getSaveKey(gameSlug: string): string {
    return `${SAVE_KEY_PREFIX}${gameSlug}`
  }

  function loadSave(gameSlug: string): unknown | null {
    try {
      const raw = localStorage.getItem(getSaveKey(gameSlug))
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  function persistSave(gameSlug: string, data: unknown): void {
    localStorage.setItem(getSaveKey(gameSlug), JSON.stringify(data))
  }

  function clearSave(gameSlug: string): void {
    localStorage.removeItem(getSaveKey(gameSlug))
  }

  function sendInit(payload: SDKInitPayload): void {
    const iframe = iframeRef.value
    if (!iframe?.contentWindow) return
    const message: SDKMessage = { type: 'sdk:init', payload }
    iframe.contentWindow.postMessage(message, '*')
  }

  function sendAdComplete(adType: string, watched: boolean): void {
    const iframe = iframeRef.value
    if (!iframe?.contentWindow) return
    iframe.contentWindow.postMessage(
      { type: 'sdk:ad-complete', payload: { adType, watched } },
      '*'
    )
  }

  function handleMessage(event: MessageEvent): void {
    // Only accept messages that look like SDK messages
    const msg = event.data as SDKMessage
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('sdk:')) return

    switch (msg.type) {
      case 'sdk:ready': {
        // Game iframe is loaded and SDK is initialized — nothing to do here,
        // caller should send init after iframe load event fires
        break
      }

      case 'sdk:score': {
        const { score, meta } = msg.payload
        currentScore.value = score
        events.onScore?.(score, meta)
        break
      }

      case 'sdk:game-over': {
        const { score, replay } = msg.payload
        currentScore.value = score
        isGameOver.value = true
        events.onGameOver?.(score, replay)
        break
      }

      case 'sdk:save': {
        // Extract gameSlug from the iframe src if possible
        const iframe = iframeRef.value
        if (iframe) {
          const src = iframe.src
          const match = src.match(/\/games\/([^/]+)\//)
          if (match) {
            persistSave(match[1], msg.payload.data)
          }
        }
        break
      }

      case 'sdk:load-request': {
        // Game is requesting its saved data
        const iframe = iframeRef.value
        if (!iframe?.contentWindow) break
        const src = iframe.src
        const match = src.match(/\/games\/([^/]+)\//)
        const data = match ? loadSave(match[1]) : null
        const response: SDKMessage = { type: 'sdk:load', payload: { data } }
        iframe.contentWindow.postMessage(response, '*')
        break
      }

      case 'sdk:ad': {
        // Stub: immediately respond with ad complete (no real ad system yet)
        const { adType } = msg.payload
        setTimeout(() => sendAdComplete(adType, true), 500)
        break
      }

      case 'sdk:track': {
        const { event, data } = msg.payload
        events.onTrack?.(event, data)
        // Future: send to analytics
        break
      }

      case 'sdk:share': {
        events.onShare?.(msg.payload)
        break
      }

      default:
        break
    }
  }

  window.addEventListener('message', handleMessage)

  onUnmounted(() => {
    window.removeEventListener('message', handleMessage)
  })

  return {
    currentScore,
    isGameOver,
    iframeRef,
    sendInit,
    loadSave,
    clearSave,
  }
}
