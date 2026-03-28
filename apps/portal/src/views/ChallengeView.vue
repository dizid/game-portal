<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGamesStore } from '../stores/games'

const props = defineProps<{
  id: string
}>()

const router = useRouter()
const gamesStore = useGamesStore()

// Challenges are stored in localStorage as "game-portal:challenge:{id}"
interface StoredChallenge {
  gameSlug: string
  creatorScore: number
  createdAt: string
}

const challenge = computed<StoredChallenge | null>(() => {
  try {
    const raw = localStorage.getItem(`game-portal:challenge:${props.id}`)
    if (!raw) return null
    return JSON.parse(raw) as StoredChallenge
  } catch {
    return null
  }
})

const game = computed(() => {
  if (!challenge.value) return null
  return gamesStore.getGameBySlug(challenge.value.gameSlug)
})

function acceptChallenge(): void {
  if (!game.value) return
  router.push(`/games/${game.value.category}/${game.value.slug}?challenge=${props.id}`)
}
</script>

<template>
  <div class="max-w-lg mx-auto px-4 sm:px-6 py-12 text-center">
    <!-- Valid challenge -->
    <div v-if="challenge && game">
      <div class="text-5xl mb-4">🏆</div>
      <div class="inline-flex items-center gap-2 px-3 py-1.5 glass rounded-full text-sm text-accent mb-4">
        Challenge Accepted?
      </div>
      <h1 class="text-2xl font-bold text-white mb-2">
        Can you beat the score?
      </h1>
      <p class="text-white/50 mb-6">
        Someone scored
        <strong class="text-accent">{{ challenge.creatorScore }}</strong>
        in <strong class="text-white">{{ game.title }}</strong>. Think you can do better?
      </p>

      <div class="glass rounded-2xl p-5 mb-6 text-left">
        <div class="flex items-center justify-between">
          <span class="text-sm text-white/50">Target score</span>
          <span class="text-xl font-bold text-accent">{{ challenge.creatorScore }}</span>
        </div>
        <div class="flex items-center justify-between mt-2">
          <span class="text-sm text-white/50">Game</span>
          <span class="text-sm text-white font-medium">{{ game.title }}</span>
        </div>
        <div class="flex items-center justify-between mt-2">
          <span class="text-sm text-white/50">Category</span>
          <span class="text-sm text-white capitalize">{{ game.category }}</span>
        </div>
      </div>

      <button
        @click="acceptChallenge"
        class="w-full py-4 bg-primary hover:bg-primary-dark text-white font-bold text-lg rounded-2xl transition-colors shadow-lg shadow-primary/30 mb-3"
      >
        Accept Challenge →
      </button>

      <a
        href="/games"
        class="block text-sm text-white/40 hover:text-white/70 transition-colors"
      >
        Browse all games instead
      </a>
    </div>

    <!-- Invalid / expired challenge -->
    <div v-else>
      <div class="text-5xl mb-4">❓</div>
      <h1 class="text-2xl font-bold text-white mb-2">Challenge Not Found</h1>
      <p class="text-white/50 mb-6">
        This challenge link is invalid or has expired. Challenge links are stored locally and may not work across devices.
      </p>
      <a
        href="/games"
        class="inline-flex items-center gap-2 px-5 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition-colors"
      >
        Browse Games →
      </a>
    </div>
  </div>
</template>
