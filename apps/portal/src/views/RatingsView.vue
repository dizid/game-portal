<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useRatingsStore } from '../stores/ratings'
import { useGamesStore } from '../stores/games'
import CategoryBadge from '../components/CategoryBadge.vue'
import type { GameCategory } from '@game-portal/types'

useHead({
  title: 'Game Ratings — Every Game Rated Honestly | Game Portal',
  meta: [
    { name: 'description', content: 'Honest ratings for 90+ browser games across 6 dimensions. See tier rankings, sort by any metric.' },
  ],
  link: [{ rel: 'canonical', href: 'https://google4games.com/ratings' }],
})

const ratingsStore = useRatingsStore()
const gamesStore = useGamesStore()
const router = useRouter()

// ── Types ──────────────────────────────────────────────────────────────────

type Tier = 'S' | 'A' | 'B' | 'C' | 'D'
type SortKey = 'overall' | 'loopQuality' | 'gameFeel' | 'depth' | 'addiction' | 'originality' | 'accessibility'
type ViewMode = 'tier' | 'table'

// ── State ──────────────────────────────────────────────────────────────────

const viewMode = ref<ViewMode>('tier')
const sortKey = ref<SortKey>('overall')
const selectedCategory = ref<GameCategory | null>(null)

// ── Sort options ───────────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'overall',       label: 'Overall'       },
  { key: 'loopQuality',   label: 'Loop Quality'  },
  { key: 'gameFeel',      label: 'Game Feel'     },
  { key: 'depth',         label: 'Depth'         },
  { key: 'addiction',     label: 'Addiction'     },
  { key: 'originality',   label: 'Originality'   },
  { key: 'accessibility', label: 'Accessibility' },
]

// ── Tier config ────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<Tier, { label: string; accent: string; border: string; glow: string; bg: string }> = {
  S: { label: 'S', accent: '#ffd700', border: 'border-yellow-400/50',  glow: 'shadow-yellow-500/20',  bg: 'bg-yellow-500/10'  },
  A: { label: 'A', accent: '#a855f7', border: 'border-purple-500/50',  glow: 'shadow-purple-500/20',  bg: 'bg-purple-500/10'  },
  B: { label: 'B', accent: '#3b82f6', border: 'border-blue-500/50',    glow: 'shadow-blue-500/20',    bg: 'bg-blue-500/10'    },
  C: { label: 'C', accent: '#6b7280', border: 'border-gray-500/40',    glow: 'shadow-gray-500/10',    bg: 'bg-gray-500/10'    },
  D: { label: 'D', accent: '#ef4444', border: 'border-red-500/30',     glow: 'shadow-red-500/10',     bg: 'bg-red-500/5'      },
}

const TIER_BADGE_STYLE: Record<Tier, string> = {
  S: 'bg-yellow-400/20 text-yellow-300 border border-yellow-400/40',
  A: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
  B: 'bg-blue-500/20  text-blue-300   border border-blue-500/40',
  C: 'bg-gray-500/20  text-gray-300   border border-gray-500/40',
  D: 'bg-red-500/10   text-red-400    border border-red-500/20',
}

// ── Derived categories ─────────────────────────────────────────────────────

const availableCategories = computed<GameCategory[]>(() => {
  const cats = new Set<GameCategory>()
  for (const r of ratingsStore.allRatings) {
    const game = gamesStore.getGameBySlug(r.slug)
    if (game) cats.add(game.category)
  }
  return Array.from(cats).sort()
})

// ── Filtered + sorted ratings ──────────────────────────────────────────────

const filteredRatings = computed(() => {
  let list = [...ratingsStore.allRatings]

  // Category filter
  if (selectedCategory.value) {
    list = list.filter((r) => {
      const game = gamesStore.getGameBySlug(r.slug)
      return game?.category === selectedCategory.value
    })
  }

  // Sort
  if (sortKey.value !== 'overall') {
    list.sort((a, b) => b[sortKey.value] - a[sortKey.value])
  }

  return list
})

// ── Tier groups (filtered) ─────────────────────────────────────────────────

const filteredTierGroups = computed<Record<Tier, typeof filteredRatings.value>>(() => {
  const groups: Record<Tier, typeof filteredRatings.value> = { S: [], A: [], B: [], C: [], D: [] }
  for (const r of filteredRatings.value) {
    groups[r.tier].push(r)
  }
  // Within each tier, sort by the chosen key
  for (const tier of Object.keys(groups) as Tier[]) {
    groups[tier].sort((a, b) => b[sortKey.value] - a[sortKey.value])
  }
  return groups
})

// ── Stats bar ──────────────────────────────────────────────────────────────

const stats = computed(() => {
  const all = ratingsStore.allRatings
  const avg = all.length
    ? (all.reduce((sum, r) => sum + r.overall, 0) / all.length).toFixed(1)
    : '0.0'
  return {
    total: all.length,
    avg,
    sTier: ratingsStore.tierGroups.S.length,
    aTier: ratingsStore.tierGroups.A.length,
  }
})

// ── Score color helper ─────────────────────────────────────────────────────

function scoreColor(n: number): string {
  if (n >= 9) return 'text-emerald-400'
  if (n >= 7) return 'text-green-400'
  if (n >= 5) return 'text-yellow-400'
  if (n >= 3) return 'text-orange-400'
  return 'text-red-400'
}

// ── Mini bar colors ────────────────────────────────────────────────────────

function barColor(n: number): string {
  if (n >= 9) return 'bg-emerald-400'
  if (n >= 7) return 'bg-green-400'
  if (n >= 5) return 'bg-yellow-400'
  if (n >= 3) return 'bg-orange-400'
  return 'bg-red-400'
}

// ── Game link helper ───────────────────────────────────────────────────────

function gameLink(slug: string): string {
  const game = gamesStore.getGameBySlug(slug)
  if (!game) return '/games'
  return `/games/${game.category}/${game.slug}`
}

function gameTitle(slug: string): string {
  return gamesStore.getGameBySlug(slug)?.title ?? slug
}

function gameCategory(slug: string): GameCategory | null {
  return gamesStore.getGameBySlug(slug)?.category ?? null
}

// ── Dimension keys for mini bars ──────────────────────────────────────────

const DIM_KEYS: SortKey[] = ['loopQuality', 'gameFeel', 'depth', 'addiction', 'originality', 'accessibility']
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl sm:text-3xl font-extrabold text-white font-[family-name:var(--font-family-display)]">
        Game Ratings
      </h1>
      <p class="text-sm text-white/50 mt-1">
        Every game rated across 6 dimensions. Honest scores, no inflation.
      </p>

      <!-- Stats bar -->
      <div class="flex flex-wrap gap-4 mt-4">
        <div class="glass rounded-xl px-4 py-2 text-sm">
          <span class="text-white/40">Rated</span>
          <span class="text-white font-semibold ml-2">{{ stats.total }} games</span>
        </div>
        <div class="glass rounded-xl px-4 py-2 text-sm">
          <span class="text-white/40">Average</span>
          <span class="text-white font-semibold ml-2">{{ stats.avg }}</span>
        </div>
        <div class="glass rounded-xl px-4 py-2 text-sm">
          <span class="text-yellow-300/70">S-tier</span>
          <span class="text-white font-semibold ml-2">{{ stats.sTier }}</span>
        </div>
        <div class="glass rounded-xl px-4 py-2 text-sm">
          <span class="text-purple-300/70">A-tier</span>
          <span class="text-white font-semibold ml-2">{{ stats.aTier }}</span>
        </div>
      </div>
    </div>

    <!-- Controls bar -->
    <div class="sticky top-14 z-30 glass rounded-2xl px-4 py-3 mb-6 flex flex-col sm:flex-row gap-3">

      <!-- View toggle -->
      <div class="flex gap-1 p-1 bg-white/5 rounded-xl shrink-0">
        <button
          @click="viewMode = 'tier'"
          :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
            viewMode === 'tier'
              ? 'bg-primary text-white shadow-sm'
              : 'text-white/50 hover:text-white'
          ]"
        >
          Tier List
        </button>
        <button
          @click="viewMode = 'table'"
          :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
            viewMode === 'table'
              ? 'bg-primary text-white shadow-sm'
              : 'text-white/50 hover:text-white'
          ]"
        >
          Table
        </button>
      </div>

      <!-- Sort by -->
      <select
        v-model="sortKey"
        class="glass rounded-xl px-3 py-1.5 text-sm text-white/80 bg-transparent border-white/10 focus:outline-none focus:border-primary/50 cursor-pointer"
      >
        <option
          v-for="opt in SORT_OPTIONS"
          :key="opt.key"
          :value="opt.key"
          class="bg-surface-light text-white"
        >
          Sort: {{ opt.label }}
        </option>
      </select>

      <!-- Category filter pills -->
      <div class="flex flex-wrap gap-1.5 items-center">
        <button
          @click="selectedCategory = null"
          :class="[
            'px-3 py-1 rounded-full text-xs font-medium transition-all',
            selectedCategory === null
              ? 'bg-primary/30 text-primary-light border border-primary/40'
              : 'text-white/40 hover:text-white bg-white/5 border border-white/10'
          ]"
        >
          All
        </button>
        <button
          v-for="cat in availableCategories"
          :key="cat"
          @click="selectedCategory = cat"
          :class="[
            'px-3 py-1 rounded-full text-xs font-medium transition-all capitalize',
            selectedCategory === cat
              ? 'bg-primary/30 text-primary-light border border-primary/40'
              : 'text-white/40 hover:text-white bg-white/5 border border-white/10'
          ]"
        >
          {{ cat }}
        </button>
      </div>
    </div>

    <!-- ── TIER LIST VIEW ──────────────────────────────────────────────── -->

    <div v-if="viewMode === 'tier'" class="space-y-6">
      <div
        v-for="tier in (['S', 'A', 'B', 'C', 'D'] as Tier[])"
        :key="tier"
        v-show="filteredTierGroups[tier].length > 0"
      >
        <!-- Tier header -->
        <div class="flex items-center gap-3 mb-3">
          <div
            :class="[
              'w-10 h-10 rounded-xl flex items-center justify-center text-lg font-extrabold shrink-0',
              TIER_BADGE_STYLE[tier],
            ]"
          >
            {{ tier }}
          </div>
          <div>
            <span class="text-white/60 text-sm">{{ filteredTierGroups[tier].length }} games</span>
          </div>
          <div class="flex-1 h-px bg-white/5" />
        </div>

        <!-- Game cards row -->
        <div class="flex flex-wrap gap-3">
          <RouterLink
            v-for="rating in filteredTierGroups[tier]"
            :key="rating.slug"
            :to="gameLink(rating.slug)"
            :class="[
              'glass rounded-xl p-3 w-[160px] sm:w-[180px] flex-shrink-0',
              'border',
              TIER_CONFIG[tier].border,
              'shadow-lg',
              TIER_CONFIG[tier].glow,
              'hover:scale-[1.02] transition-all duration-200 group',
              'flex flex-col gap-2',
            ]"
          >
            <!-- Title + score row -->
            <div class="flex items-start justify-between gap-1">
              <span class="text-white text-xs font-semibold leading-tight line-clamp-2 flex-1 group-hover:text-primary-light transition-colors">
                {{ gameTitle(rating.slug) }}
              </span>
              <span
                :class="[scoreColor(rating.overall), 'text-sm font-bold tabular-nums shrink-0']"
              >
                {{ rating.overall.toFixed(1) }}
              </span>
            </div>

            <!-- Category badge -->
            <CategoryBadge
              v-if="gameCategory(rating.slug)"
              :category="gameCategory(rating.slug)!"
              size="sm"
            />

            <!-- Mini dimension bars -->
            <div class="flex items-end gap-0.5 h-4 mt-1">
              <div
                v-for="dimKey in DIM_KEYS"
                :key="dimKey"
                :class="[barColor(rating[dimKey]), 'flex-1 rounded-sm min-w-0 transition-all']"
                :style="{ height: `${(rating[dimKey] / 10) * 100}%` }"
                :title="`${dimKey}: ${rating[dimKey]}`"
              />
            </div>

            <!-- Verdict -->
            <p class="text-white/35 text-[10px] leading-tight line-clamp-2">
              {{ rating.verdict }}
            </p>
          </RouterLink>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-if="filteredRatings.length === 0"
        class="text-center py-16"
      >
        <p class="text-white/40 text-sm">No ratings match this filter.</p>
      </div>
    </div>

    <!-- ── TABLE VIEW ──────────────────────────────────────────────────── -->

    <div v-else class="glass rounded-2xl overflow-hidden">

      <!-- Desktop table -->
      <div class="hidden md:block overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
              <th class="text-left px-4 py-3 w-10">#</th>
              <th class="text-left px-4 py-3">Game</th>
              <th class="text-left px-3 py-3">Cat</th>
              <th
                v-for="opt in SORT_OPTIONS.slice(1)"
                :key="opt.key"
                class="text-center px-2 py-3 cursor-pointer hover:text-white transition-colors"
                @click="sortKey = opt.key"
              >
                <span :class="sortKey === opt.key ? 'text-primary-light' : ''">
                  {{ opt.label.split(' ')[0] }}
                </span>
              </th>
              <th
                class="text-center px-3 py-3 cursor-pointer hover:text-white transition-colors font-bold"
                @click="sortKey = 'overall'"
              >
                <span :class="sortKey === 'overall' ? 'text-primary-light' : ''">Overall</span>
              </th>
              <th class="text-left px-4 py-3">Verdict</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(rating, index) in filteredRatings"
              :key="rating.slug"
              class="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
              @click="router.push(gameLink(rating.slug))"
            >
              <td class="px-4 py-3 text-white/30 tabular-nums">{{ index + 1 }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span
                    :class="['text-xs font-bold px-1.5 py-0.5 rounded-md', TIER_BADGE_STYLE[rating.tier]]"
                  >{{ rating.tier }}</span>
                  <span class="text-white font-medium hover:text-primary-light transition-colors">
                    {{ gameTitle(rating.slug) }}
                  </span>
                </div>
              </td>
              <td class="px-3 py-3">
                <CategoryBadge
                  v-if="gameCategory(rating.slug)"
                  :category="gameCategory(rating.slug)!"
                  size="sm"
                />
              </td>
              <td v-for="dimKey in DIM_KEYS" :key="dimKey" class="px-2 py-3 text-center tabular-nums">
                <span :class="scoreColor(rating[dimKey])">{{ rating[dimKey] }}</span>
              </td>
              <td class="px-3 py-3 text-center">
                <span :class="[scoreColor(rating.overall), 'font-bold tabular-nums text-base']">
                  {{ rating.overall.toFixed(1) }}
                </span>
              </td>
              <td class="px-4 py-3 text-white/40 text-xs max-w-xs truncate">
                {{ rating.verdict }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile condensed table -->
      <div class="md:hidden">
        <div class="px-4 py-2 border-b border-white/10 grid grid-cols-[auto_1fr_auto_auto] gap-2 text-[10px] text-white/30 uppercase tracking-wider">
          <span>#</span>
          <span>Game</span>
          <span class="text-center">Score</span>
          <span>Verdict</span>
        </div>
        <RouterLink
          v-for="(rating, index) in filteredRatings"
          :key="rating.slug"
          :to="gameLink(rating.slug)"
          class="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors items-start"
        >
          <span class="text-white/30 text-xs tabular-nums pt-0.5">{{ index + 1 }}</span>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 mb-0.5">
              <span :class="['text-[10px] font-bold px-1 py-0.5 rounded', TIER_BADGE_STYLE[rating.tier]]">
                {{ rating.tier }}
              </span>
              <span class="text-white text-sm font-medium truncate">{{ gameTitle(rating.slug) }}</span>
            </div>
            <p class="text-white/35 text-[10px] line-clamp-1">{{ rating.verdict }}</p>
          </div>
          <span :class="[scoreColor(rating.overall), 'font-bold text-base tabular-nums']">
            {{ rating.overall.toFixed(1) }}
          </span>
        </RouterLink>

        <div v-if="filteredRatings.length === 0" class="text-center py-12">
          <p class="text-white/40 text-sm">No ratings match this filter.</p>
        </div>
      </div>
    </div>

  </div>
</template>
