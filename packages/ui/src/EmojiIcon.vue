<template>
  <span
    :class="spanClasses"
    role="img"
    :aria-label="emoji"
  >{{ emoji }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  /** The emoji character to display */
  emoji: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
})

// Explicit rem values map to: sm=1.5rem, md=2rem, lg=3rem, xl=4rem
const sizeStyles: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-[1.5rem]',
  md: 'text-[2rem]',
  lg: 'text-[3rem]',
  xl: 'text-[4rem]',
}

const spanClasses = computed(() => [
  // Reset text decoration and ensure consistent emoji rendering
  'inline-block',
  'leading-none',
  'select-none',
  'no-underline',
  sizeStyles[props.size],
])
</script>
