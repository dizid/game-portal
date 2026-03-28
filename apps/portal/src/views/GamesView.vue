<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useGamesStore } from '../stores/games'
import GameCard from '../components/GameCard.vue'
import type { GameCategory } from '@game-portal/types'

const route = useRoute()
const gamesStore = useGamesStore()

// Get category from route param if present
const routeCategory = computed<GameCategory | null>(() => {
  const param = route.params.category
  return typeof param === 'string' ? (param as GameCategory) : null
})

const selectedCategory = ref<GameCategory | null>(routeCategory.value)
const sidebarOpen = ref(false)

interface CategoryItem {
  id: GameCategory
  label: string
  icon: string
}

const categoryItems: CategoryItem[] = [
  { id: 'arcade', label: 'Arcade', icon: '🕹️' },
  { id: 'puzzle', label: 'Puzzle', icon: '🧩' },
  { id: 'strategy', label: 'Strategy', icon: '♟️' },
  { id: 'simulation', label: 'Simulation', icon: '🏗️' },
  { id: 'racing', label: 'Racing', icon: '🏎️' },
  { id: 'action', label: 'Action', icon: '⚔️' },
  { id: 'word', label: 'Word', icon: '📝' },
  { id: 'card', label: 'Card', icon: '🃏' },
  { id: 'idle', label: 'Idle', icon: '⏳' },
  { id: 'trivia', label: 'Trivia', icon: '❓' },
  { id: 'adventure', label: 'Adventure', icon: '🗺️' },
  { id: 'experimental', label: 'Experimental', icon: '🧪' },
]

const filteredGames = computed(() => {
  if (!selectedCategory.value) return gamesStore.games
  return gamesStore.getGamesByCategory(selectedCategory.value)
})

const pageTitle = computed(() => {
  if (!selectedCategory.value) return 'All Games'
  const cat = categoryItems.find((c) => c.id === selectedCategory.value)
  return cat ? `${cat.icon} ${cat.label} Games` : 'Games'
})

function selectCategory(id: GameCategory | null): void {
  selectedCategory.value = id
  sidebarOpen.value = false
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Page header -->
    <div class="mb-6 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-white">{{ pageTitle }}</h1>
        <p class="text-sm text-white/40 mt-1">{{ filteredGames.length }} games available</p>
      </div>

      <!-- Mobile: toggle sidebar -->
      <button
        @click="sidebarOpen = !sidebarOpen"
        class="md:hidden flex items-center gap-2 px-3 py-2 glass rounded-xl text-sm text-white/70 hover:text-white transition-colors"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 4a1 1 0 011-1h16a1 1 0 110 2H4a1 1 0 01-1-1zm0 8a1 1 0 011-1h10a1 1 0 110 2H4a1 1 0 01-1-1zm0 8a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" />
        </svg>
        Filter
      </button>
    </div>

    <div class="flex gap-6">
      <!-- Sidebar (desktop: always visible, mobile: collapsible) -->
      <aside
        :class="[
          'w-48 flex-shrink-0',
          'md:block',
          sidebarOpen ? 'block' : 'hidden',
          'fixed md:relative top-14 left-0 bottom-0 md:top-auto md:bottom-auto z-40 md:z-auto',
          'w-64 md:w-48 h-full md:h-auto',
          'bg-surface md:bg-transparent px-4 md:px-0 py-4 md:py-0 overflow-y-auto',
        ]"
      >
        <!-- Backdrop for mobile -->
        <div
          v-if="sidebarOpen"
          class="md:hidden fixed inset-0 bg-black/50 z-[-1]"
          @click="sidebarOpen = false"
        />

        <div class="glass rounded-2xl p-3 space-y-1">
          <button
            @click="selectCategory(null)"
            :class="[
              'w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors',
              selectedCategory === null
                ? 'bg-primary/20 text-primary-light font-medium'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            ]"
          >
            <span>🎮</span>
            <span>All Games</span>
            <span class="ml-auto text-xs text-white/30">{{ gamesStore.games.length }}</span>
          </button>

          <button
            v-for="cat in categoryItems"
            :key="cat.id"
            @click="selectCategory(cat.id)"
            :class="[
              'w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors',
              selectedCategory === cat.id
                ? 'bg-primary/20 text-primary-light font-medium'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            ]"
          >
            <span>{{ cat.icon }}</span>
            <span>{{ cat.label }}</span>
            <span class="ml-auto text-xs text-white/30">
              {{ gamesStore.getGamesByCategory(cat.id).length }}
            </span>
          </button>
        </div>
      </aside>

      <!-- Game grid -->
      <div class="flex-1 min-w-0">
        <div v-if="filteredGames.length === 0" class="text-center py-16">
          <p class="text-4xl mb-4">🎮</p>
          <p class="text-white/50">No games in this category yet.</p>
          <p class="text-sm text-white/30 mt-1">Check back soon!</p>
        </div>

        <div
          v-else
          class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
        >
          <GameCard v-for="game in filteredGames" :key="game.id" :game="game" />
        </div>
      </div>
    </div>
  </div>
</template>
