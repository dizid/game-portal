import type { SDKMessage, SDKInitPayload, AdType, SharePayload } from '@game-portal/types'

type MessageHandler = (message: SDKMessage) => void

class GameSDK {
  private initialized = false
  private gameId = ''
  private gameSlug = ''
  private challengeId: string | null = null
  private handlers: Map<string, MessageHandler[]> = new Map()
  private portalOrigin = '*' // Updated to the actual origin on first message received
  private isEmbedded: boolean

  constructor() {
    this.isEmbedded = window.self !== window.top
    this.setupMessageListener()
  }

  // Initialize the SDK — call this when the game starts.
  // Returns the init payload from the portal (or a minimal payload in standalone/dev mode).
  init(config: { gameId: string; gameSlug: string }): Promise<SDKInitPayload> {
    return new Promise((resolve) => {
      this.gameId = config.gameId
      this.gameSlug = config.gameSlug

      if (this.isEmbedded) {
        // Wait for sdk:init message sent by the portal after the iframe loads
        this.once('sdk:init', (msg) => {
          if (msg.type === 'sdk:init') {
            this.challengeId = msg.payload.challengeId ?? null
            this.initialized = true
            this.postToPortal({ type: 'sdk:ready' })
            resolve(msg.payload)
          }
        })
      } else {
        // Standalone mode — used during local game development/testing
        this.initialized = true
        const payload: SDKInitPayload = {
          gameId: config.gameId,
          gameSlug: config.gameSlug,
        }
        resolve(payload)
      }
    })
  }

  // Report an in-progress score to the portal (e.g. for live leaderboard updates)
  reportScore(score: number, meta?: Record<string, unknown>): void {
    this.postToPortal({ type: 'sdk:score', payload: { score, meta } })
  }

  // Signal game over with a final score and optional replay string
  gameOver(score: number, replay?: string): void {
    this.postToPortal({ type: 'sdk:game-over', payload: { score, replay } })
  }

  // Request an ad break; resolves true if the ad was watched/completed
  showAd(adType: AdType): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isEmbedded) {
        // No ads in standalone/dev mode — always resolve as watched
        resolve(true)
        return
      }
      this.postToPortal({ type: 'sdk:ad', payload: { adType } })
      this.once('sdk:ad-complete', (msg) => {
        if (msg.type === 'sdk:ad-complete') {
          resolve(msg.payload.watched)
        }
      })
    })
  }

  // Persist arbitrary game state — portal stores it in localStorage keyed by gameId
  save(data: unknown): void {
    if (this.isEmbedded) {
      this.postToPortal({ type: 'sdk:save', payload: { data } })
    } else {
      // Standalone fallback: write directly to localStorage
      localStorage.setItem(`game-save-${this.gameId}`, JSON.stringify(data))
    }
  }

  // Load previously saved game state; returns null if nothing is saved
  load<T = unknown>(): Promise<T | null> {
    return new Promise((resolve) => {
      if (this.isEmbedded) {
        this.postToPortal({ type: 'sdk:load-request' })
        this.once('sdk:load', (msg) => {
          if (msg.type === 'sdk:load') {
            resolve(msg.payload.data as T | null)
          }
        })
      } else {
        // Standalone fallback: read directly from localStorage
        const saved = localStorage.getItem(`game-save-${this.gameId}`)
        resolve(saved ? (JSON.parse(saved) as T) : null)
      }
    })
  }

  // Fire an analytics event (forwarded to the portal's analytics pipeline)
  track(event: string, data?: Record<string, unknown>): void {
    this.postToPortal({ type: 'sdk:track', payload: { event, data } })
  }

  // Share a score or achievement; the portal handles the native share sheet / copy-link UI
  share(payload: Omit<SharePayload, 'url'>): void {
    // Build the canonical URL — challenge link if available, otherwise the game page
    const url = this.challengeId
      ? `${window.location.origin}/challenge/${this.challengeId}`
      : `${window.location.origin}/games/${this.gameSlug}`
    this.postToPortal({ type: 'sdk:share', payload: { ...payload, url } })
  }

  // Returns the challenge ID if this session was launched from a challenge link
  getChallenge(): string | null {
    return this.challengeId
  }

  // Subscribe to messages from the portal (public — for custom game-level handlers)
  on(type: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(type) ?? []
    handlers.push(handler)
    this.handlers.set(type, handlers)
  }

  // Subscribe to a single message from the portal, then auto-unsubscribe
  private once(type: string, handler: MessageHandler): void {
    const wrappedHandler: MessageHandler = (msg) => {
      handler(msg)
      const handlers = this.handlers.get(type) ?? []
      const index = handlers.indexOf(wrappedHandler)
      if (index > -1) handlers.splice(index, 1)
    }
    this.on(type, wrappedHandler)
  }

  // Send a typed message to the portal (parent window)
  private postToPortal(message: SDKMessage): void {
    if (this.isEmbedded && window.parent) {
      window.parent.postMessage(message, this.portalOrigin)
    }
  }

  // Wire up the window message listener that routes portal messages to registered handlers
  private setupMessageListener(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as SDKMessage
      if (!message?.type?.startsWith('sdk:')) return

      // Lock portalOrigin to the first real origin we see (replaces the wildcard '*')
      if (this.portalOrigin === '*' && event.origin) {
        this.portalOrigin = event.origin
      }

      const handlers = this.handlers.get(message.type) ?? []
      handlers.forEach((handler) => handler(message))
    })
  }
}

// Singleton — games import and use `gameSDK` directly
export const gameSDK = new GameSDK()

// Named class export for tests or advanced use cases that need multiple instances
export { GameSDK }
