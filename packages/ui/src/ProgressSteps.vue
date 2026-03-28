<template>
  <div class="flex items-center gap-0" role="list" aria-label="Progress steps">
    <template v-for="step in steps" :key="step">
      <!-- Step circle -->
      <div
        role="listitem"
        :aria-current="step === current ? 'step' : undefined"
        :aria-label="`Step ${step}${step < current ? ' (completed)' : step === current ? ' (current)' : ''}`"
        :class="stepCircleClasses(step)"
      >
        <!-- Completed: checkmark -->
        <svg
          v-if="step < current"
          class="w-3.5 h-3.5"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 7L5.5 10L11.5 4"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <!-- Active or future: step number -->
        <span v-else class="text-xs font-bold leading-none">{{ step }}</span>
      </div>

      <!-- Connecting line (skip after last step) -->
      <div
        v-if="step < steps"
        :class="connectorClasses(step)"
        aria-hidden="true"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
interface Props {
  /** Total number of steps */
  steps: number
  /** Currently active step (1-based) */
  current: number
}

const props = defineProps<Props>()

function stepCircleClasses(step: number): string[] {
  const base = [
    'relative z-10',
    'flex items-center justify-center',
    'w-8 h-8 rounded-full',
    'border-2',
    'transition-all duration-300',
    'shrink-0',
  ]

  if (step < props.current) {
    // Completed
    return [...base, 'bg-indigo-500 border-indigo-500 text-white']
  }
  if (step === props.current) {
    // Active — pulse ring effect via shadow
    return [
      ...base,
      'bg-indigo-500 border-indigo-400 text-white',
      'shadow-[0_0_0_4px_rgba(99,102,241,0.25)]',
    ]
  }
  // Future
  return [...base, 'bg-white/5 border-white/20 text-white/40']
}

function connectorClasses(step: number): string[] {
  const base = ['h-0.5', 'flex-1', 'transition-all duration-500']
  // Connector is filled if the next step has been reached
  if (step < props.current) {
    return [...base, 'bg-indigo-500']
  }
  return [...base, 'bg-white/10']
}
</script>
