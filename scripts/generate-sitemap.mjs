// Generates sitemap.xml from the games store data
// Run: node scripts/generate-sitemap.mjs
// Also runs as part of the build via postbuild script

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const GAMES_STORE = join(ROOT, 'apps', 'portal', 'src', 'stores', 'games.ts')
const OUTPUT = join(ROOT, 'apps', 'portal', 'public', 'sitemap.xml')

// Base URL — update when domain is finalized
const BASE_URL = process.env.VITE_BASE_URL || 'https://google4games.com'

// Extract game slugs and categories from the store using regex
const storeContent = readFileSync(GAMES_STORE, 'utf-8')
const gameRegex = /g\('[^']+',\s*'([^']+)',\s*'[^']*',\s*'[^']*',\s*'([^']+)'/g

const games = []
let match
while ((match = gameRegex.exec(storeContent)) !== null) {
  games.push({ slug: match[1], category: match[2] })
}

// All categories with games
const categories = [...new Set(games.map(g => g.category))]

const today = new Date().toISOString().split('T')[0]

// Build URL entries
const urls = [
  // Homepage
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  // Browse all games
  { loc: '/games', priority: '0.9', changefreq: 'weekly' },
  // Daily challenge
  { loc: '/daily', priority: '0.6', changefreq: 'daily' },
  // Category pages
  ...categories.map(cat => ({
    loc: `/games/${cat}`,
    priority: '0.8',
    changefreq: 'weekly',
  })),
  // Individual game pages
  ...games.map(game => ({
    loc: `/games/${game.category}/${game.slug}`,
    priority: '0.7',
    changefreq: 'monthly',
  })),
]

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${BASE_URL}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`

writeFileSync(OUTPUT, xml)
console.log(`  sitemap.xml generated with ${urls.length} URLs (${games.length} games, ${categories.length} categories)`)
