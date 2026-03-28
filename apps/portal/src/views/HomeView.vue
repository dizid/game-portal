<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useGamesStore } from '../stores/games'
import { usePersonaStore } from '../stores/persona'
import GameCard from '../components/GameCard.vue'
import type { GameCategory } from '@game-portal/types'

const gamesStore = useGamesStore()
const personaStore = usePersonaStore()

const featuredGames = computed(() => gamesStore.getFeaturedGames())

const recommendedGames = computed(() => {
  if (!personaStore.primaryPersona) return []
  return gamesStore.getGamesForPersona(personaStore.primaryPersona).slice(0, 4)
})

interface CategoryCard {
  id: GameCategory
  label: string
  icon: string
  gradient: string
  count: number
}

const allCategories: CategoryCard[] = [
  { id: 'arcade', label: 'Arcade', icon: '🕹️', gradient: 'from-red-600/30 to-red-900/30', count: 0 },
  { id: 'puzzle', label: 'Puzzle', icon: '🧩', gradient: 'from-blue-600/30 to-blue-900/30', count: 0 },
  { id: 'strategy', label: 'Strategy', icon: '♟️', gradient: 'from-green-600/30 to-green-900/30', count: 0 },
  { id: 'simulation', label: 'Simulation', icon: '🏗️', gradient: 'from-amber-600/30 to-amber-900/30', count: 0 },
  { id: 'racing', label: 'Racing', icon: '🏎️', gradient: 'from-orange-600/30 to-orange-900/30', count: 0 },
  { id: 'action', label: 'Action', icon: '⚔️', gradient: 'from-rose-600/30 to-rose-900/30', count: 0 },
  { id: 'word', label: 'Word', icon: '📝', gradient: 'from-teal-600/30 to-teal-900/30', count: 0 },
  { id: 'card', label: 'Card', icon: '🃏', gradient: 'from-purple-600/30 to-purple-900/30', count: 0 },
  { id: 'idle', label: 'Idle', icon: '⏳', gradient: 'from-emerald-600/30 to-emerald-900/30', count: 0 },
  { id: 'trivia', label: 'Trivia', icon: '❓', gradient: 'from-yellow-600/30 to-yellow-900/30', count: 0 },
  { id: 'adventure', label: 'Adventure', icon: '🗺️', gradient: 'from-indigo-600/30 to-indigo-900/30', count: 0 },
  { id: 'experimental', label: 'Experimental', icon: '🧪', gradient: 'from-pink-600/30 to-pink-900/30', count: 0 },
]

const categoriesWithCount = computed<CategoryCard[]>(() => {
  return allCategories.map((cat) => ({
    ...cat,
    count: gamesStore.getGamesByCategory(cat.id).length,
  }))
})

const PERSONA_LABELS: Record<string, string> = {
  snacker: 'The Snacker',
  strategist: 'The Strategist',
  champion: 'The Champion',
  collector: 'The Collector',
  veteran: 'The Veteran',
  pioneer: 'The Pioneer',
}

const PERSONA_DESCRIPTIONS: Record<string, string> = {
  snacker: 'Quick fun, 5 minutes max. Fast reflex games and instant play.',
  strategist: 'Thinks before acting. Deep puzzles and tactical challenges.',
  champion: 'Competes for the top score. Leaderboards and daily challenges.',
  collector: 'Idle progress and incremental rewards. Tycoons and farms.',
  veteran: 'Loves nostalgic classics. Retro remakes and timeless hits.',
  pioneer: 'Craves novel experiences. Experimental and genre-breaking games.',
}
</script>

<template>
  <div>
    <!-- Hero section -->
    <section class="relative overflow-hidden px-4 sm:px-6 lg:px-8 py-16 md:py-24">
      <!-- Gradient orbs for visual depth -->
      <div class="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div class="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

      <div class="max-w-7xl mx-auto relative z-10 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 glass rounded-full text-sm text-primary-light mb-6">
          <span>🎮</span>
          <span>Free games, no downloads</span>
        </div>

        <h1 class="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white mb-4 leading-tight">
          Play Free Games
          <span class="bg-gradient-to-r from-primary-light via-accent to-pink-400 bg-clip-text text-transparent block sm:inline">
            Instantly
          </span>
        </h1>

        <p class="text-lg text-white/60 max-w-xl mx-auto mb-8">
          Hundreds of browser games across 12 categories. No account, no downloads — just play.
        </p>

        <!-- CTA area -->
        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          <RouterLink
            v-if="!personaStore.hasCompletedOnboarding"
            to="/onboarding"
            class="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition-colors shadow-lg shadow-primary/30"
          >
            <span>🧭</span>
            Find Your Games
          </RouterLink>
          <RouterLink
            v-else
            to="/games"
            class="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition-colors shadow-lg shadow-primary/30"
          >
            <span>🎮</span>
            Browse All Games
          </RouterLink>

          <RouterLink
            to="/daily"
            class="inline-flex items-center gap-2 px-6 py-3 glass hover:bg-white/10 text-white font-semibold rounded-xl transition-colors"
          >
            <span>📅</span>
            Daily Challenge
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- Personalized section (shown when persona is set) -->
    <section
      v-if="personaStore.hasCompletedOnboarding && personaStore.profile"
      class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16"
    >
      <div class="glass rounded-2xl p-6 mb-6">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p class="text-sm text-primary-light font-medium mb-1">Your Profile</p>
            <h2 class="text-xl font-bold text-white">
              {{ PERSONA_LABELS[personaStore.profile.primary] }}
            </h2>
            <p class="text-sm text-white/50 mt-1">
              {{ PERSONA_DESCRIPTIONS[personaStore.profile.primary] }}
            </p>
          </div>
          <RouterLink
            to="/onboarding"
            class="text-xs text-white/40 hover:text-white/70 transition-colors flex-shrink-0"
          >
            Retake quiz →
          </RouterLink>
        </div>
      </div>

      <h3 class="text-lg font-semibold text-white mb-4">Recommended for You</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <GameCard v-for="game in recommendedGames" :key="game.id" :game="game" />
      </div>
    </section>

    <!-- Onboarding CTA (shown when no persona) -->
    <section
      v-else
      class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16"
    >
      <div class="glass rounded-2xl p-8 text-center border-primary/30">
        <p class="text-3xl mb-3">🧭</p>
        <h2 class="text-xl font-bold text-white mb-2">Discover Your Gaming Persona</h2>
        <p class="text-sm text-white/50 mb-5 max-w-sm mx-auto">
          Take our 60-second quiz and we'll recommend the perfect games for you.
        </p>
        <RouterLink
          to="/onboarding"
          class="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition-colors"
        >
          Start Quiz →
        </RouterLink>
      </div>
    </section>

    <!-- Featured games -->
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-bold text-white">Featured Games</h2>
        <RouterLink to="/games" class="text-sm text-primary-light hover:text-primary transition-colors">
          View all →
        </RouterLink>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <GameCard v-for="game in featuredGames" :key="game.id" :game="game" />
      </div>
    </section>

    <!-- Category grid -->
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
      <h2 class="text-xl font-bold text-white mb-5">Browse by Category</h2>
      <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        <RouterLink
          v-for="cat in categoriesWithCount"
          :key="cat.id"
          :to="`/games/${cat.id}`"
          :class="[
            'bg-gradient-to-br',
            cat.gradient,
            'glass rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-white/20 transition-all hover:scale-[1.03] group'
          ]"
        >
          <span class="text-2xl group-hover:scale-110 transition-transform">{{ cat.icon }}</span>
          <span class="text-xs font-medium text-white/80 group-hover:text-white transition-colors text-center">
            {{ cat.label }}
          </span>
          <span v-if="cat.count > 0" class="text-xs text-white/30">{{ cat.count }} games</span>
        </RouterLink>
      </div>
    </section>

    <!-- Popular right now -->
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <h2 class="text-xl font-bold text-white">Popular Right Now</h2>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <GameCard
          v-for="game in gamesStore.games.slice(0, 4)"
          :key="game.id"
          :game="game"
        />
      </div>
    </section>
  </div>
</template>
