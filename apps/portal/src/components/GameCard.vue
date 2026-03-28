<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { GameMeta, GameCategory } from '@game-portal/types'
import CategoryBadge from './CategoryBadge.vue'

const props = defineProps<{
  game: GameMeta
}>()

// Gradient backgrounds per category for placeholder thumbnails
const GRADIENT_MAP: Record<GameCategory, string> = {
  arcade: 'from-red-900 to-red-700',
  puzzle: 'from-blue-900 to-blue-700',
  strategy: 'from-green-900 to-green-700',
  simulation: 'from-amber-900 to-amber-700',
  racing: 'from-orange-900 to-orange-700',
  action: 'from-rose-900 to-rose-700',
  word: 'from-teal-900 to-teal-700',
  card: 'from-purple-900 to-purple-700',
  idle: 'from-emerald-900 to-emerald-700',
  trivia: 'from-yellow-900 to-yellow-700',
  adventure: 'from-indigo-900 to-indigo-700',
  experimental: 'from-pink-900 to-pink-700',
}

const ICON_MAP: Record<GameCategory, string> = {
  arcade: '🕹️',
  puzzle: '🧩',
  strategy: '♟️',
  simulation: '🏗️',
  racing: '🏎️',
  action: '⚔️',
  word: '📝',
  card: '🃏',
  idle: '⏳',
  trivia: '❓',
  adventure: '🗺️',
  experimental: '🧪',
}

const gradientClass = computed(() => GRADIENT_MAP[props.game.category])
const categoryIcon = computed(() => ICON_MAP[props.game.category])

const playTimeLabel = computed(() => {
  const { minPlayTime, maxPlayTime } = props.game
  if (maxPlayTime <= 2) return '~2 min'
  if (maxPlayTime <= 5) return '~5 min'
  if (maxPlayTime <= 15) return '5-15 min'
  return '15+ min'
})
</script>

<template>
  <RouterLink
    :to="`/games/${game.category}/${game.slug}`"
    class="group block rounded-2xl overflow-hidden glass hover:border-white/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/20"
  >
    <!-- Thumbnail -->
    <div
      :class="['bg-gradient-to-br', gradientClass, 'aspect-video flex items-center justify-center relative overflow-hidden']"
    >
      <!-- Decorative circles for depth -->
      <div class="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/5" />
      <div class="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/5" />

      <!-- Game icon -->
      <span class="text-5xl relative z-10 group-hover:scale-110 transition-transform duration-200">
        {{ categoryIcon }}
      </span>

      <!-- Featured badge -->
      <span
        v-if="game.featured"
        class="absolute top-2 left-2 text-xs bg-accent/90 text-black font-bold px-2 py-0.5 rounded-full"
      >
        Featured
      </span>

      <!-- Daily badge -->
      <span
        v-if="game.dailyChallenge"
        class="absolute top-2 right-2 text-xs bg-primary/90 text-white font-bold px-2 py-0.5 rounded-full"
      >
        Daily
      </span>
    </div>

    <!-- Info -->
    <div class="p-3">
      <h3 class="font-semibold text-white text-sm leading-tight mb-2 group-hover:text-primary-light transition-colors">
        {{ game.title }}
      </h3>
      <div class="flex items-center justify-between gap-2">
        <CategoryBadge :category="game.category" size="sm" />
        <span class="text-xs text-white/40">{{ playTimeLabel }}</span>
      </div>
    </div>
  </RouterLink>
</template>
