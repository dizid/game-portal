<template>
  <span
    :class="wrapperClasses"
    role="status"
    :aria-label="ariaLabel"
  >
    <svg
      :class="svgClasses"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <!-- Static track ring -->
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-opacity="0.15"
        stroke-width="3"
      />
      <!-- Animated gradient arc -->
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="url(#spinner-gradient)"
        stroke-width="3"
        stroke-linecap="round"
      />
      <defs>
        <linearGradient id="spinner-gradient" x1="12" y1="2" x2="22" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#818cf8" />
          <stop offset="100%" stop-color="#a78bfa" />
        </linearGradient>
      </defs>
    </svg>
    <!-- Visually hidden loading text for screen readers -->
    <span class="sr-only">{{ ariaLabel }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  /** Override the default aria-label */
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  ariaLabel: 'Loading…',
})

const sizeMap: Record<NonNullable<Props['size']>, string> = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
}

const wrapperClasses = computed(() => ['inline-flex items-center justify-center'])

const svgClasses = computed(() => [
  sizeMap[props.size],
  'animate-spin',
  'text-indigo-400',
])
</script>

<style scoped>
/* Ensure the spin animation is smooth — Tailwind's animate-spin uses
   a linear 1s rotation which is exactly what we want for a spinner. */
</style>
