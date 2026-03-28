<script setup lang="ts">
import { computed } from 'vue'
import { useGamesStore } from '../stores/games'
import GameCard from '../components/GameCard.vue'

const gamesStore = useGamesStore()

const dailyGames = computed(() => gamesStore.getDailyGames())

// Generate a deterministic "today's challenge" from the date
const todayDate = new Date()
const dateString = todayDate.toLocaleDateString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

// Pick a featured daily game based on day of year
const dayOfYear = Math.floor(
  (todayDate.getTime() - new Date(todayDate.getFullYear(), 0, 0).getTime()) / 86400000
)
const featuredDaily = computed(() => {
  if (dailyGames.value.length === 0) return null
  return dailyGames.value[dayOfYear % dailyGames.value.length]
})
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <!-- Header -->
    <div class="text-center mb-10">
      <div class="inline-flex items-center gap-2 px-3 py-1.5 glass rounded-full text-sm text-accent mb-4">
        <span class="w-2 h-2 bg-accent rounded-full animate-pulse" />
        Daily Challenge
      </div>
      <h1 class="text-3xl font-extrabold text-white mb-2">Today's Challenge</h1>
      <p class="text-white/40 text-sm">{{ dateString }}</p>
    </div>

    <!-- Featured daily game -->
    <div v-if="featuredDaily" class="glass rounded-2xl p-6 mb-10 text-center">
      <p class="text-4xl mb-3">📅</p>
      <h2 class="text-xl font-bold text-white mb-1">{{ featuredDaily.title }}</h2>
      <p class="text-white/50 text-sm mb-5 max-w-xs mx-auto">{{ featuredDaily.description }}</p>
      <a
        :href="`/games/${featuredDaily.category}/${featuredDaily.slug}`"
        class="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition-colors"
      >
        Play Now →
      </a>
    </div>

    <!-- All daily challenge games -->
    <section>
      <h2 class="text-lg font-bold text-white mb-4">All Daily Games</h2>

      <div v-if="dailyGames.length === 0" class="text-center py-12">
        <p class="text-4xl mb-3">📅</p>
        <p class="text-white/50">No daily challenges set up yet.</p>
      </div>

      <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <GameCard v-for="game in dailyGames" :key="game.id" :game="game" />
      </div>
    </section>
  </div>
</template>
