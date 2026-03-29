import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths — required for iframe embedding in the portal
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
})
