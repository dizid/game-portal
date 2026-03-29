// Post-build script: copies each game's dist/ into apps/portal/dist/games/{slug}/
// This makes games accessible via iframe at /games/{slug}/index.html

import { readdirSync, existsSync, cpSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const GAMES_DIR = join(ROOT, 'games')
const PORTAL_DIST = join(ROOT, 'apps', 'portal', 'dist', 'games')

const gameDirs = readdirSync(GAMES_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

let copied = 0

for (const slug of gameDirs) {
  const gameDist = join(GAMES_DIR, slug, 'dist')
  if (!existsSync(gameDist)) {
    console.warn(`  ⚠ games/${slug}/dist not found — skipping`)
    continue
  }
  const target = join(PORTAL_DIST, slug)
  cpSync(gameDist, target, { recursive: true })
  console.log(`  ✓ games/${slug}/dist → portal/dist/games/${slug}/`)
  copied++
}

console.log(`\n  ${copied} game(s) copied into portal dist`)
