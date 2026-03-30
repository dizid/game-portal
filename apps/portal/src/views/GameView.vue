<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useGamesStore } from '../stores/games'
import { usePersonaStore } from '../stores/persona'
import { useGameBridge } from '../composables/useGameBridge'
import GameCard from '../components/GameCard.vue'
import CategoryBadge from '../components/CategoryBadge.vue'
import ShareButtons from '../components/ShareButtons.vue'

declare function gtag(...args: unknown[]): void

const props = defineProps<{
  category: string
  slug: string
}>()

const router = useRouter()
const gamesStore = useGamesStore()
const personaStore = usePersonaStore()

const game = computed(() => gamesStore.getGameBySlug(props.slug))

// SEO: dynamic head meta + JSON-LD per game
useHead(computed(() => {
  const g = game.value
  if (!g) return { title: 'Game Not Found — Game Portal' }
  return {
    title: `${g.title} — Play Free Online | Game Portal`,
    meta: [
      { name: 'description', content: `Play ${g.title} free in your browser — no download, no login. ${g.description}` },
      { property: 'og:title', content: `${g.title} — Play Free Online | Game Portal` },
      { property: 'og:description', content: `Play ${g.title} free in your browser. ${g.description}` },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `https://google4games.com/games/${g.category}/${g.slug}` },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: `${g.title} — Play Free | Game Portal` },
    ],
    link: [
      { rel: 'canonical', href: `https://google4games.com/games/${g.category}/${g.slug}` },
    ],
    script: [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          'name': g.title,
          'description': g.description,
          'applicationCategory': 'GameApplication',
          'operatingSystem': 'Any (Browser)',
          'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
          'genre': g.category,
          'keywords': g.tags.join(', '),
        }),
      },
    ],
  }
}))
const relatedGames = computed(() => {
  if (!game.value) return []
  return gamesStore
    .getGamesByCategory(game.value.category)
    .filter((g) => g.slug !== props.slug)
    .slice(0, 4)
})

// Play time tracking
const startTime = ref<number>(Date.now())
const isFullscreen = ref(false)
const showShareModal = ref(false)
const gameContainerRef = ref<HTMLDivElement | null>(null)

// Set up the postMessage bridge
const bridge = useGameBridge({
  onScore(score) {
    // Score is tracked reactively via bridge.currentScore
    console.info(`[GameBridge] score: ${score}`)
  },
  onGameOver(score) {
    console.info(`[GameBridge] game over, score: ${score}`)
    // Update persona based on play session
    if (game.value) {
      const playTimeMinutes = Math.round((Date.now() - startTime.value) / 60000)
      personaStore.updateFromBehavior(game.value.category, playTimeMinutes)
      // GA4: track game over
      if (typeof gtag === 'function') {
        gtag('event', 'game_over', {
          game_id: game.value.id,
          game_slug: game.value.slug,
          game_category: game.value.category,
          final_score: score,
          play_duration_seconds: Math.round((Date.now() - startTime.value) / 1000),
        })
      }
    }
  },
  onShare(payload) {
    showShareModal.value = true
    // GA4: track share
    if (typeof gtag === 'function' && game.value) {
      gtag('event', 'game_share', {
        game_id: game.value.id,
        game_slug: game.value.slug,
        share_method: 'in_game',
      })
    }
    console.info('[GameBridge] share requested', payload)
  },
  onTrack(event, data) {
    // Forward SDK track events to GA4
    if (typeof gtag === 'function') {
      gtag('event', `sdk_${event}`, { ...data, game_slug: props.slug })
    }
    console.info('[GameBridge] track', event, data)
  },
})

// Build the iframe src — games live at /games/{slug}/index.html
const iframeSrc = computed(() => {
  if (!game.value) return ''
  return `/games/${game.value.slug}/index.html`
})

// Share URL for this game
const shareUrl = computed(() => `${window.location.origin}/games/${props.category}/${props.slug}`)
const shareText = computed(() => {
  const scoreText = bridge.currentScore.value > 0
    ? ` I scored ${bridge.currentScore.value}!`
    : ''
  return `Check out ${game.value?.title ?? 'this game'} on Game Portal!${scoreText}`
})

const playTimeLabel = computed(() => {
  if (!game.value) return ''
  const { minPlayTime, maxPlayTime } = game.value
  if (maxPlayTime <= 2) return '~2 min'
  if (maxPlayTime <= 5) return '~5 min'
  if (maxPlayTime <= 15) return '5-15 min'
  return '15+ min'
})

function onIframeLoad(): void {
  if (!game.value || !bridge.iframeRef.value) return
  bridge.sendInit({
    gameId: game.value.id,
    gameSlug: game.value.slug,
  })
  // GA4: track game start
  if (typeof gtag === 'function') {
    gtag('event', 'game_start', {
      game_id: game.value.id,
      game_slug: game.value.slug,
      game_category: game.value.category,
      game_tier: game.value.tier,
    })
  }
}

function toggleFullscreen(): void {
  const container = gameContainerRef.value
  if (!container) return

  if (!document.fullscreenElement) {
    container.requestFullscreen().then(() => {
      isFullscreen.value = true
    }).catch((err) => {
      console.warn('Fullscreen error:', err)
    })
  } else {
    document.exitFullscreen().then(() => {
      isFullscreen.value = false
    })
  }
}

// Listen for fullscreen changes triggered outside our button (e.g. Escape key)
onMounted(() => {
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
})

// Redirect to games if slug doesn't exist
if (!game.value) {
  router.replace('/games')
}
</script>

<template>
  <div v-if="game" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-sm text-white/40 mb-4 flex-wrap">
      <a href="/games" class="hover:text-white transition-colors">Games</a>
      <span>/</span>
      <a :href="`/games/${game.category}`" class="hover:text-white transition-colors capitalize">{{ game.category }}</a>
      <span>/</span>
      <span class="text-white/70">{{ game.title }}</span>
    </nav>

    <!-- Game title row -->
    <div class="flex items-start justify-between gap-4 mb-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-white mb-2">{{ game.title }}</h1>
        <div class="flex items-center gap-3 flex-wrap">
          <CategoryBadge :category="game.category" />
          <span class="text-sm text-white/40">{{ playTimeLabel }}</span>
          <span class="text-sm text-white/40 capitalize">{{ game.tier }} game</span>
        </div>
      </div>
    </div>

    <!-- Game iframe container -->
    <div
      ref="gameContainerRef"
      class="relative w-full mb-4 glass rounded-2xl overflow-hidden"
      style="aspect-ratio: 16/9;"
    >
      <!-- Game over overlay -->
      <div
        v-if="bridge.isGameOver.value"
        class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 rounded-2xl"
      >
        <p class="text-4xl mb-2">🏁</p>
        <p class="text-2xl font-bold text-white mb-1">Game Over</p>
        <p class="text-white/60 mb-4">
          Final score: <strong class="text-accent">{{ bridge.currentScore.value }}</strong>
        </p>
        <div class="flex gap-3">
          <button
            @click="bridge.isGameOver.value = false"
            class="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl font-medium transition-colors"
          >
            Play Again
          </button>
          <a
            :href="`/games/${game.category}`"
            class="px-4 py-2 glass hover:bg-white/10 text-white rounded-xl font-medium transition-colors"
          >
            More Games
          </a>
        </div>
      </div>

      <!-- The iframe -->
      <iframe
        :ref="(el) => { bridge.iframeRef.value = el as HTMLIFrameElement | null }"
        :src="iframeSrc"
        :title="game.title"
        class="w-full h-full border-0"
        allow="fullscreen; autoplay"
        sandbox="allow-scripts allow-same-origin allow-popups"
        loading="lazy"
        @load="onIframeLoad"
      />

      <!-- Fullscreen button -->
      <button
        @click="toggleFullscreen"
        class="absolute bottom-3 right-3 p-2 glass rounded-lg text-white/60 hover:text-white transition-colors"
        :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
      >
        <svg v-if="!isFullscreen" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
        <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 9V4m0 5H4m16 0h-5m5 0V4M9 20v-5m0 5H4m5 0l-5-5m16 5l-5-5m5 0v-5m0 5h-5" />
        </svg>
      </button>

      <!-- Live score display -->
      <div
        v-if="bridge.currentScore.value > 0 && !bridge.isGameOver.value"
        class="absolute top-3 left-3 glass rounded-lg px-3 py-1 text-sm font-semibold text-accent"
      >
        Score: {{ bridge.currentScore.value }}
      </div>
    </div>

    <!-- Share + description row -->
    <div class="grid md:grid-cols-2 gap-6 mb-10">
      <!-- Description -->
      <div class="glass rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-white/50 uppercase tracking-wider mb-2">About</h2>
        <p class="text-white/80 text-sm leading-relaxed">{{ game.description }}</p>
        <div class="flex flex-wrap gap-2 mt-3">
          <span
            v-for="tag in game.tags"
            :key="tag"
            class="text-xs px-2 py-0.5 bg-white/10 text-white/50 rounded-full"
          >
            {{ tag }}
          </span>
        </div>
      </div>

      <!-- Share -->
      <div class="glass rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
          Share This Game
        </h2>
        <ShareButtons
          :url="shareUrl"
          :text="shareText"
          :score="bridge.currentScore.value > 0 ? bridge.currentScore.value : undefined"
        />
      </div>
    </div>

    <!-- More games like this -->
    <section v-if="relatedGames.length > 0">
      <h2 class="text-lg font-bold text-white mb-4">More {{ game.category }} games</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <GameCard v-for="related in relatedGames" :key="related.id" :game="related" />
      </div>
    </section>
  </div>
</template>
