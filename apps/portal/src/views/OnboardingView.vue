<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { usePersonaStore } from '../stores/persona'
import type { GamerPersona, PersonaProfile } from '@game-portal/types'

const router = useRouter()
const personaStore = usePersonaStore()

// SEO — noindex since this is a quiz flow
useHead({
  title: 'Discover Your Gaming Persona | Game Portal',
  meta: [
    { name: 'robots', content: 'noindex' },
    { name: 'description', content: 'Take our 60-second quiz to discover your gaming persona and get personalized game recommendations.' },
  ],
})

// Step 0=welcome, 1=time, 2=style, 3=challenge, 4=results
const step = ref(0)
const transitioning = ref(false)

// Answers collected across steps
const timePreference = ref<'quick' | 'medium' | 'long' | null>(null)
const styleChoices = ref<string[]>([])
const challengeAnswers = ref<string[]>([])

// Computed persona from answers
const computedPersona = computed<GamerPersona>(() => {
  const scores = personaStore.createEmptyScores()

  // Time preference scoring
  if (timePreference.value === 'quick') {
    scores.snacker += 3
    scores.champion += 1
  } else if (timePreference.value === 'medium') {
    scores.strategist += 2
    scores.champion += 2
    scores.pioneer += 1
  } else if (timePreference.value === 'long') {
    scores.strategist += 3
    scores.collector += 2
    scores.veteran += 2
  }

  // Style choices scoring
  const styleScoreMap: Record<string, GamerPersona[]> = {
    arcade: ['snacker', 'champion'],
    puzzle: ['strategist'],
    strategy: ['strategist', 'veteran'],
    simulation: ['collector'],
    racing: ['champion', 'snacker'],
    card: ['collector', 'strategist'],
    idle: ['collector'],
    trivia: ['snacker', 'pioneer'],
    adventure: ['veteran', 'pioneer'],
    experimental: ['pioneer'],
    action: ['champion', 'snacker'],
    word: ['strategist', 'snacker'],
  }

  for (const choice of styleChoices.value) {
    const boosted = styleScoreMap[choice] ?? []
    for (const p of boosted) {
      scores[p] += 2
    }
  }

  // Challenge answers scoring
  const challengeScoreMap: Record<string, GamerPersona[]> = {
    highscore: ['champion'],
    explore: ['pioneer', 'veteran'],
    collect: ['collector'],
    solve: ['strategist'],
    fast: ['snacker', 'champion'],
    deep: ['strategist', 'veteran'],
  }

  for (const answer of challengeAnswers.value) {
    const boosted = challengeScoreMap[answer] ?? []
    for (const p of boosted) {
      scores[p] += 3
    }
  }

  // Find persona with highest score
  const sorted = (Object.entries(scores) as [GamerPersona, number][]).sort(
    (a, b) => b[1] - a[1]
  )

  return sorted[0][0]
})

const secondaryPersona = computed<GamerPersona | null>(() => {
  const scores = personaStore.createEmptyScores()
  // Recompute to find secondary
  if (timePreference.value === 'quick') { scores.snacker += 3; scores.champion += 1 }
  if (timePreference.value === 'medium') { scores.strategist += 2; scores.champion += 2; scores.pioneer += 1 }
  if (timePreference.value === 'long') { scores.strategist += 3; scores.collector += 2; scores.veteran += 2 }

  const sorted = (Object.entries(scores) as [GamerPersona, number][]).sort((a, b) => b[1] - a[1])
  const secondary = sorted[1]?.[0] ?? null
  return secondary !== computedPersona.value ? secondary : null
})

const PERSONA_LABELS: Record<GamerPersona, string> = {
  snacker: 'The Snacker',
  strategist: 'The Strategist',
  champion: 'The Champion',
  collector: 'The Collector',
  veteran: 'The Veteran',
  pioneer: 'The Pioneer',
}

const PERSONA_ICONS: Record<GamerPersona, string> = {
  snacker: '🍿',
  strategist: '♟️',
  champion: '🏆',
  collector: '📦',
  veteran: '🎖️',
  pioneer: '🚀',
}

const PERSONA_DESCRIPTIONS: Record<GamerPersona, string> = {
  snacker: 'You love quick bursts of fun. Reaction games, clickers, and instant-play arcade games are your speed.',
  strategist: 'You think before you act. Deep puzzles, tower defense, and chess keep your mind sharp.',
  champion: 'You play to win. Leaderboards, daily challenges, and high-score hunts fuel your fire.',
  collector: 'Progress never stops. Idle games, tycoons, and incremental games reward your patience.',
  veteran: 'You know games deeply. Classic remakes and timeless titles feel like coming home.',
  pioneer: 'You want something new. Experimental mechanics and genre-bending games excite you.',
}

// Style picks — the 6 options shown in step 2
interface StyleOption {
  id: string
  label: string
  icon: string
  gradient: string
}

const styleOptions: StyleOption[] = [
  { id: 'arcade', label: 'Arcade', icon: '🕹️', gradient: 'from-red-700 to-red-900' },
  { id: 'puzzle', label: 'Puzzle', icon: '🧩', gradient: 'from-blue-700 to-blue-900' },
  { id: 'strategy', label: 'Strategy', icon: '♟️', gradient: 'from-green-700 to-green-900' },
  { id: 'simulation', label: 'Simulation', icon: '🏗️', gradient: 'from-amber-700 to-amber-900' },
  { id: 'adventure', label: 'Adventure', icon: '🗺️', gradient: 'from-indigo-700 to-indigo-900' },
  { id: 'experimental', label: 'Experimental', icon: '🧪', gradient: 'from-pink-700 to-pink-900' },
]

// Challenge A/B questions — step 3
interface ChallengeQuestion {
  optionA: { label: string; value: string; icon: string }
  optionB: { label: string; value: string; icon: string }
}

const challengeQuestions: ChallengeQuestion[] = [
  {
    optionA: { label: 'Beat the high score', value: 'highscore', icon: '🏆' },
    optionB: { label: 'Explore the game world', value: 'explore', icon: '🗺️' },
  },
  {
    optionA: { label: 'Collect everything', value: 'collect', icon: '📦' },
    optionB: { label: 'Solve puzzles', value: 'solve', icon: '🧩' },
  },
  {
    optionA: { label: 'Fast-paced action', value: 'fast', icon: '⚡' },
    optionB: { label: 'Deep strategy', value: 'deep', icon: '♟️' },
  },
]

const currentChallengeIndex = ref(0)

function toggleStyleChoice(id: string): void {
  const index = styleChoices.value.indexOf(id)
  if (index === -1) {
    if (styleChoices.value.length < 3) {
      styleChoices.value.push(id)
    }
  } else {
    styleChoices.value.splice(index, 1)
  }
}

function answerChallenge(value: string): void {
  challengeAnswers.value.push(value)
  if (currentChallengeIndex.value < challengeQuestions.length - 1) {
    currentChallengeIndex.value++
  } else {
    goToStep(4)
  }
}

function goToStep(target: number): void {
  transitioning.value = true
  setTimeout(() => {
    step.value = target
    transitioning.value = false
  }, 200)
}

function finish(): void {
  const scores = personaStore.createEmptyScores()
  const profile: PersonaProfile = {
    primary: computedPersona.value,
    secondary: secondaryPersona.value,
    scores,
    sessionPreference: timePreference.value ?? 'medium',
    completedAt: new Date().toISOString(),
  }
  personaStore.setProfile(profile)
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-8">
    <div
      class="w-full max-w-lg"
      :class="transitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'"
      style="transition: opacity 200ms ease, transform 200ms ease;"
    >
      <!-- Step 0: Welcome -->
      <div v-if="step === 0" class="text-center">
        <div class="text-6xl mb-6">🎮</div>
        <h1 class="text-3xl font-extrabold text-white mb-3">
          What kind of gamer are you?
        </h1>
        <p class="text-white/60 mb-8 max-w-sm mx-auto">
          Answer 3 quick questions and we'll find the perfect games for you. Takes about 60 seconds.
        </p>

        <!-- Progress dots -->
        <div class="flex justify-center gap-2 mb-8">
          <div
            v-for="i in 4"
            :key="i"
            class="h-1.5 rounded-full transition-all duration-300"
            :class="[i === 1 ? 'w-6 bg-primary' : 'w-1.5 bg-white/20']"
          />
        </div>

        <button
          @click="goToStep(1)"
          class="w-full py-4 bg-primary hover:bg-primary-dark text-white font-bold text-lg rounded-2xl transition-colors shadow-lg shadow-primary/30"
        >
          Let's Go! →
        </button>

        <p class="text-sm text-white/30 mt-4">No account required</p>
      </div>

      <!-- Step 1: Time preference -->
      <div v-else-if="step === 1">
        <p class="text-sm text-white/40 text-center mb-2">Step 1 of 3</p>
        <h2 class="text-2xl font-bold text-white text-center mb-2">
          How long do you usually play?
        </h2>
        <p class="text-white/50 text-center text-sm mb-8">Pick what sounds right for a typical session</p>

        <div class="space-y-3 mb-8">
          <button
            v-for="option in [
              { value: 'quick' as const, label: 'Quick session', sub: 'Under 5 minutes', icon: '⚡', badge: 'Snacker' },
              { value: 'medium' as const, label: 'Standard game', sub: '5–20 minutes', icon: '🎯', badge: 'Champion' },
              { value: 'long' as const, label: 'Long play', sub: 'Half hour or more', icon: '🌙', badge: 'Strategist' },
            ]"
            :key="option.value"
            @click="timePreference = option.value"
            :class="[
              'w-full flex items-center gap-4 p-4 rounded-2xl border transition-all',
              timePreference === option.value
                ? 'bg-primary/20 border-primary text-white'
                : 'glass border-white/10 text-white/70 hover:border-white/20 hover:text-white'
            ]"
          >
            <span class="text-3xl">{{ option.icon }}</span>
            <div class="text-left flex-1">
              <p class="font-semibold">{{ option.label }}</p>
              <p class="text-sm text-white/50">{{ option.sub }}</p>
            </div>
            <span v-if="timePreference === option.value" class="text-primary-light text-xl">✓</span>
          </button>
        </div>

        <div class="flex gap-3">
          <button
            @click="goToStep(0)"
            class="flex-1 py-3 glass hover:bg-white/10 text-white/60 hover:text-white font-medium rounded-2xl transition-colors"
          >
            ← Back
          </button>
          <button
            @click="timePreference && goToStep(2)"
            :disabled="!timePreference"
            class="flex-1 py-3 bg-primary hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-2xl transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      <!-- Step 2: Style preference — pick 3 -->
      <div v-else-if="step === 2">
        <p class="text-sm text-white/40 text-center mb-2">Step 2 of 3</p>
        <h2 class="text-2xl font-bold text-white text-center mb-2">
          Pick 3 that appeal to you
        </h2>
        <p class="text-white/50 text-center text-sm mb-6">
          {{ styleChoices.length }}/3 selected
        </p>

        <div class="grid grid-cols-3 gap-3 mb-8">
          <button
            v-for="opt in styleOptions"
            :key="opt.id"
            @click="toggleStyleChoice(opt.id)"
            :class="[
              'relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all',
              styleChoices.includes(opt.id)
                ? 'border-primary bg-primary/20 scale-[1.03]'
                : styleChoices.length >= 3
                  ? 'glass border-white/5 opacity-40 cursor-not-allowed'
                  : 'glass border-white/10 hover:border-white/20 hover:scale-[1.02]'
            ]"
          >
            <div :class="['w-12 h-12 rounded-xl bg-gradient-to-br', opt.gradient, 'flex items-center justify-center text-2xl']">
              {{ opt.icon }}
            </div>
            <span class="text-xs font-medium text-white">{{ opt.label }}</span>

            <!-- Checkmark overlay -->
            <div
              v-if="styleChoices.includes(opt.id)"
              class="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-xs text-white"
            >
              ✓
            </div>
          </button>
        </div>

        <div class="flex gap-3">
          <button
            @click="goToStep(1)"
            class="flex-1 py-3 glass hover:bg-white/10 text-white/60 hover:text-white font-medium rounded-2xl transition-colors"
          >
            ← Back
          </button>
          <button
            @click="styleChoices.length === 3 && goToStep(3)"
            :disabled="styleChoices.length !== 3"
            class="flex-1 py-3 bg-primary hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-2xl transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      <!-- Step 3: Challenge A vs B -->
      <div v-else-if="step === 3">
        <p class="text-sm text-white/40 text-center mb-2">Step 3 of 3</p>
        <h2 class="text-2xl font-bold text-white text-center mb-2">
          What sounds more fun?
        </h2>
        <p class="text-white/50 text-center text-sm mb-2">
          Round {{ currentChallengeIndex + 1 }} of {{ challengeQuestions.length }}
        </p>

        <!-- Mini progress bar -->
        <div class="h-1 bg-white/10 rounded-full mb-8 overflow-hidden">
          <div
            class="h-full bg-primary rounded-full transition-all duration-500"
            :style="{ width: `${((currentChallengeIndex) / challengeQuestions.length) * 100}%` }"
          />
        </div>

        <div
          v-if="challengeQuestions[currentChallengeIndex]"
          class="grid grid-cols-2 gap-4 mb-8"
        >
          <button
            v-for="option in [
              challengeQuestions[currentChallengeIndex].optionA,
              challengeQuestions[currentChallengeIndex].optionB
            ]"
            :key="option.value"
            @click="answerChallenge(option.value)"
            class="glass border-white/10 hover:border-primary/50 hover:bg-primary/10 rounded-2xl p-6 flex flex-col items-center gap-3 transition-all hover:scale-[1.02] group"
          >
            <span class="text-4xl group-hover:scale-110 transition-transform">{{ option.icon }}</span>
            <span class="font-medium text-white text-center text-sm leading-tight">{{ option.label }}</span>
          </button>
        </div>

        <button
          @click="goToStep(2)"
          class="w-full py-3 glass hover:bg-white/10 text-white/60 hover:text-white font-medium rounded-2xl transition-colors"
        >
          ← Back
        </button>
      </div>

      <!-- Step 4: Results -->
      <div v-else-if="step === 4" class="text-center">
        <!-- Confetti-style animated circles -->
        <div class="relative mb-6">
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-primary/30 rounded-full blur-2xl animate-pulse" />
          <div class="relative text-6xl">
            {{ PERSONA_ICONS[computedPersona] }}
          </div>
        </div>

        <div class="inline-flex items-center gap-2 px-3 py-1 bg-primary/20 text-primary-light rounded-full text-sm mb-3">
          Your gaming persona
        </div>

        <h2 class="text-3xl font-extrabold text-white mb-3">
          {{ PERSONA_LABELS[computedPersona] }}
        </h2>

        <p class="text-white/60 mb-6 max-w-sm mx-auto leading-relaxed">
          {{ PERSONA_DESCRIPTIONS[computedPersona] }}
        </p>

        <div
          v-if="secondaryPersona"
          class="inline-flex items-center gap-2 px-3 py-1.5 glass rounded-full text-sm text-white/60 mb-6"
        >
          <span>Also a bit of: {{ PERSONA_LABELS[secondaryPersona] }} {{ PERSONA_ICONS[secondaryPersona] }}</span>
        </div>

        <div class="space-y-3">
          <button
            @click="finish"
            class="w-full py-4 bg-primary hover:bg-primary-dark text-white font-bold text-lg rounded-2xl transition-colors shadow-lg shadow-primary/30"
          >
            Find My Games →
          </button>
          <button
            @click="step = 0; styleChoices = []; challengeAnswers = []; currentChallengeIndex = 0; timePreference = null"
            class="w-full py-3 glass hover:bg-white/10 text-white/50 hover:text-white rounded-2xl transition-colors text-sm"
          >
            Retake quiz
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
