import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PersonaProfile, GamerPersona, GameCategory } from '@game-portal/types'

const STORAGE_KEY = 'game-portal:persona'

// Map game categories to the personas they reinforce
const CATEGORY_PERSONA_MAP: Record<GameCategory, GamerPersona[]> = {
  arcade: ['snacker', 'champion'],
  puzzle: ['strategist', 'snacker'],
  strategy: ['strategist', 'veteran'],
  simulation: ['collector', 'strategist'],
  racing: ['champion', 'snacker'],
  action: ['champion', 'snacker'],
  word: ['strategist', 'snacker'],
  card: ['collector', 'strategist'],
  idle: ['collector'],
  trivia: ['snacker', 'pioneer'],
  adventure: ['veteran', 'pioneer'],
  experimental: ['pioneer'],
}

function loadFromStorage(): PersonaProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersonaProfile
  } catch {
    return null
  }
}

function saveToStorage(profile: PersonaProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

function createEmptyScores(): Record<GamerPersona, number> {
  return {
    snacker: 0,
    strategist: 0,
    champion: 0,
    collector: 0,
    veteran: 0,
    pioneer: 0,
  }
}

export const usePersonaStore = defineStore('persona', () => {
  const profile = ref<PersonaProfile | null>(loadFromStorage())

  const hasCompletedOnboarding = computed(() => profile.value !== null)

  const primaryPersona = computed<GamerPersona | null>(
    () => profile.value?.primary ?? null
  )

  function setProfile(newProfile: PersonaProfile): void {
    profile.value = newProfile
    saveToStorage(newProfile)
  }

  function clearProfile(): void {
    profile.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  /**
   * Adjust persona scores based on observed gameplay behavior.
   * Called after each game session completes.
   */
  function updateFromBehavior(category: GameCategory, playTimeMinutes: number): void {
    if (!profile.value) return

    const reinforced = CATEGORY_PERSONA_MAP[category] ?? []
    const scores = { ...profile.value.scores }

    // Boost each persona associated with this category
    for (const persona of reinforced) {
      scores[persona] = (scores[persona] ?? 0) + 1
    }

    // Boost champion for longer play sessions (engagement)
    if (playTimeMinutes >= 10) {
      scores.champion = (scores.champion ?? 0) + 1
    }

    // Recalculate primary from highest score
    const sorted = (Object.entries(scores) as [GamerPersona, number][]).sort(
      (a, b) => b[1] - a[1]
    )

    const updated: PersonaProfile = {
      ...profile.value,
      scores,
      primary: sorted[0][0],
      secondary: sorted[1][0] !== sorted[0][0] ? sorted[1][0] : null,
    }

    setProfile(updated)
  }

  return {
    profile,
    hasCompletedOnboarding,
    primaryPersona,
    setProfile,
    clearProfile,
    updateFromBehavior,
    createEmptyScores,
  }
})
