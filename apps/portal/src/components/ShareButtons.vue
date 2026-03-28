<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  url: string
  text: string
  score?: number
}>()

const copied = ref(false)

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.url)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Fallback for environments without clipboard API
    const input = document.createElement('input')
    input.value = props.url
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

function shareTwitter(): void {
  const scoreText = props.score !== undefined ? ` Score: ${props.score}.` : ''
  const tweetText = encodeURIComponent(`${props.text}${scoreText} ${props.url}`)
  window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank', 'noopener')
}

function shareWhatsApp(): void {
  const scoreText = props.score !== undefined ? ` Score: ${props.score}.` : ''
  const message = encodeURIComponent(`${props.text}${scoreText} ${props.url}`)
  window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener')
}
</script>

<template>
  <div class="flex items-center gap-2 flex-wrap">
    <!-- Copy link -->
    <button
      @click="copyLink"
      class="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-colors"
      :class="copied ? 'text-green-400' : 'text-white/70 hover:text-white'"
    >
      <span v-if="copied">✓ Copied!</span>
      <span v-else>🔗 Copy link</span>
    </button>

    <!-- Twitter/X -->
    <button
      @click="shareTwitter"
      class="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg glass hover:bg-white/10 text-white/70 hover:text-white transition-colors"
    >
      𝕏 Share
    </button>

    <!-- WhatsApp -->
    <button
      @click="shareWhatsApp"
      class="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg glass hover:bg-white/10 text-white/70 hover:text-white transition-colors"
    >
      💬 WhatsApp
    </button>
  </div>
</template>
