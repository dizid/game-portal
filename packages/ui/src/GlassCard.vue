<template>
  <div :class="cardClasses">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** Enable hover scale + glow effect */
  hover?: boolean
  /** Tailwind padding class applied to the card */
  padding?: string
}

const props = withDefaults(defineProps<Props>(), {
  hover: false,
  padding: 'p-6',
})

const cardClasses = computed(() => [
  // Base glass morphism styling
  'backdrop-blur-lg',
  'bg-white/5',
  'border',
  'border-white/10',
  'rounded-2xl',
  'transition-all',
  'duration-300',
  props.padding,
  // Conditional hover effects
  props.hover && 'cursor-pointer hover:bg-white/10 hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/20',
])
</script>
