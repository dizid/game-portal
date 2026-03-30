<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { GameCategory } from '@game-portal/types'

const router = useRouter()
const mobileMenuOpen = ref(false)

interface CategoryItem {
  id: GameCategory
  label: string
  icon: string
}

const categories: CategoryItem[] = [
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

const dropdownOpen = ref(false)
const dropdownWrapperRef = ref<HTMLDivElement | null>(null)

function handleClickOutside(event: MouseEvent): void {
  if (dropdownWrapperRef.value && !dropdownWrapperRef.value.contains(event.target as Node)) {
    dropdownOpen.value = false
  }
}

onMounted(() => { document.addEventListener('click', handleClickOutside) })
onUnmounted(() => { document.removeEventListener('click', handleClickOutside) })

function navigateCategory(categoryId: GameCategory): void {
  dropdownOpen.value = false
  mobileMenuOpen.value = false
  router.push(`/games/${categoryId}`)
}

function closeMobileMenu(): void {
  mobileMenuOpen.value = false
}
</script>

<template>
  <nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-surface/80 border-b border-white/10">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-14">
        <!-- Logo -->
        <RouterLink to="/" class="flex items-center gap-2 group" @click="closeMobileMenu">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white font-bold text-sm">
            GP
          </div>
          <span class="font-bold text-white group-hover:text-primary-light transition-colors hidden sm:block">
            Game Portal
          </span>
        </RouterLink>

        <!-- Desktop nav links -->
        <div class="hidden md:flex items-center gap-1">
          <RouterLink
            to="/games"
            class="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            All Games
          </RouterLink>

          <!-- Category dropdown -->
          <div ref="dropdownWrapperRef" class="relative">
            <button
              @click="dropdownOpen = !dropdownOpen"
              class="flex items-center gap-1 px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              Categories
              <svg
                class="w-4 h-4 transition-transform duration-200"
                :class="{ 'rotate-180': dropdownOpen }"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <!-- Dropdown panel -->
            <Transition
              enter-active-class="transition-all duration-200"
              enter-from-class="opacity-0 -translate-y-2"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition-all duration-150"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 -translate-y-2"
            >
              <div
                v-if="dropdownOpen"
                class="absolute top-full left-0 mt-2 w-64 glass rounded-2xl p-2 shadow-xl shadow-black/40"
              >
                <div class="grid grid-cols-2 gap-1">
                  <button
                    v-for="cat in categories"
                    :key="cat.id"
                    @click="navigateCategory(cat.id)"
                    class="flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <span>{{ cat.icon }}</span>
                    <span>{{ cat.label }}</span>
                  </button>
                </div>
              </div>
            </Transition>
          </div>

          <RouterLink
            to="/daily"
            class="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            Daily
          </RouterLink>
          <RouterLink
            to="/ratings"
            class="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            Ratings
          </RouterLink>
        </div>

        <!-- Right actions -->
        <div class="flex items-center gap-2">
          <RouterLink
            to="/onboarding"
            class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition-colors"
          >
            My Profile
          </RouterLink>

          <!-- Mobile hamburger -->
          <button
            @click="mobileMenuOpen = !mobileMenuOpen"
            class="md:hidden p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            <svg v-if="!mobileMenuOpen" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile menu -->
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0 -translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-4"
    >
      <div v-if="mobileMenuOpen" class="md:hidden border-t border-white/10 bg-surface/95 backdrop-blur-lg">
        <div class="px-4 py-3 space-y-1">
          <RouterLink
            to="/games"
            class="block px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            @click="closeMobileMenu"
          >
            All Games
          </RouterLink>
          <RouterLink
            to="/daily"
            class="block px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            @click="closeMobileMenu"
          >
            Daily Challenge
          </RouterLink>
          <RouterLink
            to="/ratings"
            class="block px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            @click="closeMobileMenu"
          >
            Ratings
          </RouterLink>
          <RouterLink
            to="/onboarding"
            class="block px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            @click="closeMobileMenu"
          >
            My Profile
          </RouterLink>

          <!-- Categories in mobile -->
          <div class="pt-2 border-t border-white/10">
            <p class="text-xs text-white/30 uppercase tracking-wider px-3 mb-2">Categories</p>
            <div class="grid grid-cols-3 gap-1">
              <button
                v-for="cat in categories"
                :key="cat.id"
                @click="navigateCategory(cat.id)"
                class="flex flex-col items-center gap-1 px-2 py-2 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              >
                <span class="text-lg">{{ cat.icon }}</span>
                <span>{{ cat.label }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </nav>
</template>
