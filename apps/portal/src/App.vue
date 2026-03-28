<script setup lang="ts">
import { RouterView } from 'vue-router'
import NavBar from './components/NavBar.vue'
</script>

<template>
  <div class="min-h-screen bg-surface text-white font-sans">
    <!-- Top navigation -->
    <NavBar />

    <!-- Page content — padded for fixed nav height -->
    <main class="pt-14">
      <RouterView />
    </main>

    <!-- Footer -->
    <footer class="mt-16 border-t border-white/10 bg-surface-light">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <!-- Brand -->
          <div class="col-span-2 md:col-span-1">
            <div class="flex items-center gap-2 mb-3">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white font-bold text-sm">
                GP
              </div>
              <span class="font-bold text-white">Game Portal</span>
            </div>
            <p class="text-sm text-white/40 leading-relaxed">
              Free browser games, no downloads required. Play instantly, share challenges, compete globally.
            </p>
          </div>

          <!-- Games -->
          <div>
            <h4 class="text-sm font-semibold text-white mb-3">Games</h4>
            <ul class="space-y-2">
              <li><a href="/games" class="text-sm text-white/50 hover:text-white transition-colors">Browse All</a></li>
              <li><a href="/games/arcade" class="text-sm text-white/50 hover:text-white transition-colors">Arcade</a></li>
              <li><a href="/games/puzzle" class="text-sm text-white/50 hover:text-white transition-colors">Puzzle</a></li>
              <li><a href="/games/strategy" class="text-sm text-white/50 hover:text-white transition-colors">Strategy</a></li>
              <li><a href="/daily" class="text-sm text-white/50 hover:text-white transition-colors">Daily Challenge</a></li>
            </ul>
          </div>

          <!-- Discover -->
          <div>
            <h4 class="text-sm font-semibold text-white mb-3">Discover</h4>
            <ul class="space-y-2">
              <li><a href="/onboarding" class="text-sm text-white/50 hover:text-white transition-colors">My Profile</a></li>
              <li><a href="/games/action" class="text-sm text-white/50 hover:text-white transition-colors">Action</a></li>
              <li><a href="/games/card" class="text-sm text-white/50 hover:text-white transition-colors">Card Games</a></li>
              <li><a href="/games/trivia" class="text-sm text-white/50 hover:text-white transition-colors">Trivia</a></li>
            </ul>
          </div>

          <!-- Info -->
          <div>
            <h4 class="text-sm font-semibold text-white mb-3">Info</h4>
            <ul class="space-y-2">
              <li><a href="#" class="text-sm text-white/50 hover:text-white transition-colors">About</a></li>
              <li><a href="#" class="text-sm text-white/50 hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" class="text-sm text-white/50 hover:text-white transition-colors">Terms of Use</a></li>
              <li><a href="#" class="text-sm text-white/50 hover:text-white transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>

        <div class="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p class="text-xs text-white/30">
            &copy; {{ new Date().getFullYear() }} Game Portal. All rights reserved.
          </p>
          <p class="text-xs text-white/30">
            Free games, forever. No account required.
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>
