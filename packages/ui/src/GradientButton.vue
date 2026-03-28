<template>
  <button
    :class="buttonClasses"
    :disabled="disabled"
    type="button"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'primary' | 'secondary' | 'accent'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
})

const sizeClasses: Record<NonNullable<Props['size']>, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-7 py-3.5 text-lg',
}

const variantClasses: Record<NonNullable<Props['variant']>, string> = {
  // Indigo → purple gradient
  primary: [
    'bg-gradient-to-r from-indigo-500 to-purple-600',
    'text-white',
    'border-transparent',
    'hover:brightness-110',
  ].join(' '),
  // Surface with visible border
  secondary: [
    'bg-white/5',
    'text-white',
    'border border-white/20',
    'hover:bg-white/10 hover:border-white/30',
  ].join(' '),
  // Amber → orange gradient
  accent: [
    'bg-gradient-to-r from-amber-400 to-orange-500',
    'text-white',
    'border-transparent',
    'hover:brightness-110',
  ].join(' '),
}

const buttonClasses = computed(() => [
  // Base styles shared by all variants
  'inline-flex items-center justify-center gap-2',
  'font-semibold rounded-xl',
  'border',
  'transition-all duration-200',
  'hover:scale-[1.03] active:scale-[0.97]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
  sizeClasses[props.size],
  variantClasses[props.variant],
  // Disabled state overrides hover/active transforms
  props.disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
])
</script>
