<script setup lang="ts">
import type { GameCategory } from '@game-portal/types'

const props = defineProps<{
  category: GameCategory
  size?: 'sm' | 'md'
}>()

// Map category to Tailwind color classes
const COLOR_MAP: Record<GameCategory, string> = {
  arcade: 'bg-red-500/20 text-red-300 border-red-500/30',
  puzzle: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  strategy: 'bg-green-500/20 text-green-300 border-green-500/30',
  simulation: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  racing: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  action: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  word: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  card: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  idle: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  trivia: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  adventure: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  experimental: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
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

const sizeClasses = props.size === 'sm'
  ? 'text-xs px-2 py-0.5'
  : 'text-xs px-2.5 py-1'
</script>

<template>
  <span
    :class="[
      COLOR_MAP[category],
      sizeClasses,
      'inline-flex items-center gap-1 rounded-full border font-medium capitalize',
    ]"
  >
    <span>{{ ICON_MAP[category] }}</span>
    <span>{{ category }}</span>
  </span>
</template>
