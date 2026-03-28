<template>
  <div :class="wrapperClasses">
    <span :class="scoreClasses">{{ displayScore }}</span>
    <span v-if="label" class="text-sm text-white/50 font-medium tracking-wide uppercase mt-1">
      {{ label }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

interface Props {
  /** Target score value to display and animate towards */
  score: number
  /** Optional label rendered below the score */
  label?: string
  /** Apply glow effect around the score */
  highlight?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  highlight: false,
})

// Tracks the currently displayed (animating) value
const displayScore = ref(props.score)
let rafId: number | null = null

/**
 * Animate displayScore from its current value to the new target.
 * Uses requestAnimationFrame for a smooth ~600ms ease-out count.
 */
function animateTo(target: number): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
  }

  const start = displayScore.value
  const delta = target - start
  const duration = 600 // ms
  let startTime: number | null = null

  function step(timestamp: number): void {
    if (startTime === null) startTime = timestamp
    const elapsed = timestamp - startTime
    const progress = Math.min(elapsed / duration, 1)

    // Ease-out cubic: progress decelerates toward the end
    const eased = 1 - Math.pow(1 - progress, 3)
    displayScore.value = Math.round(start + delta * eased)

    if (progress < 1) {
      rafId = requestAnimationFrame(step)
    } else {
      // Ensure exact final value
      displayScore.value = target
      rafId = null
    }
  }

  rafId = requestAnimationFrame(step)
}

// Re-animate whenever the score prop changes
watch(
  () => props.score,
  (newScore) => animateTo(newScore),
)

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
})

import { computed } from 'vue'

const wrapperClasses = computed(() => [
  'flex flex-col items-center',
])

const scoreClasses = computed(() => [
  'font-mono font-bold tabular-nums',
  'text-5xl leading-none',
  'text-white',
  'transition-all duration-300',
  props.highlight && 'drop-shadow-[0_0_16px_rgba(99,102,241,0.8)]',
])
</script>
